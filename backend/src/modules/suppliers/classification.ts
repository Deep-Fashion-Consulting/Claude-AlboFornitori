import type pg from 'pg';
import { audit, type RequestMeta } from '../../audit.js';
import type { UserContext } from '../../auth/context.js';
import { withTransaction } from '../../db.js';
import { conflict, forbidden, notFound } from '../../errors.js';
import { assertSupplierExists } from './repository.js';

/**
 * Classificazione del fornitore: codici nei sistemi esterni, marchi ed enti associati.
 * Ogni rimozione verifica che l'elemento appartenga al fornitore indicato nell'URL.
 */

// ------------------------------------------------------------- codici esterni
export async function addCode(db: pg.Pool, user: UserContext, fornitoreId: number, applicativoId: number, codice: string, meta: RequestMeta) {
  return withTransaction(db, async (tx) => {
    await assertSupplierExists(tx, fornitoreId);
    // Nello stesso sistema un codice identifica un solo fornitore
    const { rows: used } = await tx.query(
      `SELECT f.id, f.ragione_sociale FROM albo.fornitore_codice_applicativo ca JOIN albo.fornitore f ON f.id = ca.fornitore_id
        WHERE ca.applicativo_id = $1 AND upper(ca.codice) = upper($2)`,
      [applicativoId, codice],
    );
    if (used[0]) {
      throw conflict(
        'CODICE_GIA_ASSEGNATO',
        used[0].id === fornitoreId
          ? 'Il fornitore ha già questo codice'
          : `Codice già assegnato a ${used[0].ragione_sociale}`,
      );
    }
    const { rows } = await tx.query(
      `INSERT INTO albo.fornitore_codice_applicativo (fornitore_id, applicativo_id, codice, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
      [fornitoreId, applicativoId, codice, user.id],
    );
    const id = rows[0]!.id as number;
    await audit(tx, user, { azione: 'SUPPLIER_CODE_ADD', entita: 'fornitore_codice_applicativo', entitaId: id, fornitoreId, dettagli: { applicativoId, codice } }, meta);
    return { id };
  });
}

export async function removeCode(db: pg.Pool, user: UserContext, fornitoreId: number, rowId: number, meta: RequestMeta) {
  const { rows } = await db.query(
    'DELETE FROM albo.fornitore_codice_applicativo WHERE id = $1 AND fornitore_id = $2 RETURNING applicativo_id, codice',
    [rowId, fornitoreId],
  );
  if (!rows[0]) throw notFound('Codice non trovato per questo fornitore');
  await audit(db, user, { azione: 'SUPPLIER_CODE_REMOVE', entita: 'fornitore_codice_applicativo', entitaId: rowId, fornitoreId, dettagli: rows[0] }, meta);
}

// -------------------------------------------------------------------- marchi
export async function addBrand(db: pg.Pool, user: UserContext, fornitoreId: number, marchioId: number, meta: RequestMeta) {
  return withTransaction(db, async (tx) => {
    await assertSupplierExists(tx, fornitoreId);
    const { rows } = await tx.query(
      'INSERT INTO albo.fornitore_marchio (fornitore_id, marchio_id) VALUES ($1, $2) RETURNING id',
      [fornitoreId, marchioId],
    );
    const id = rows[0]!.id as number;
    await audit(tx, user, { azione: 'SUPPLIER_BRAND_ADD', entita: 'fornitore_marchio', entitaId: id, fornitoreId, dettagli: { marchioId } }, meta);
    return { id };
  });
}

export async function removeBrand(db: pg.Pool, user: UserContext, fornitoreId: number, rowId: number, meta: RequestMeta) {
  const { rows } = await db.query('DELETE FROM albo.fornitore_marchio WHERE id = $1 AND fornitore_id = $2 RETURNING marchio_id', [
    rowId,
    fornitoreId,
  ]);
  if (!rows[0]) throw notFound('Marchio non trovato per questo fornitore');
  await audit(db, user, { azione: 'SUPPLIER_BRAND_REMOVE', entita: 'fornitore_marchio', entitaId: rowId, fornitoreId, dettagli: rows[0] }, meta);
}

// --------------------------------------------------------------------- enti
/** Si possono associare o togliere solo gli enti su cui si è abilitati. */
function requireEntity(user: UserContext, enteId: number) {
  if (!user.enti.includes(enteId)) throw forbidden('ENTE_NON_AUTORIZZATO', 'Non sei abilitato su questo ente');
}

export async function addEntity(db: pg.Pool, user: UserContext, fornitoreId: number, enteId: number, meta: RequestMeta) {
  requireEntity(user, enteId);
  return withTransaction(db, async (tx) => {
    await assertSupplierExists(tx, fornitoreId);
    await tx.query('INSERT INTO albo.fornitore_ente (fornitore_id, ente_id, created_by) VALUES ($1, $2, $3)', [fornitoreId, enteId, user.id]);
    await audit(tx, user, { azione: 'SUPPLIER_ENTITY_ADD', entita: 'fornitore_ente', entitaId: enteId, fornitoreId }, meta);
  });
}

/**
 * Toglie l'associazione con un ente. Se per quell'ente esistono produzione, classi merceologiche,
 * costi o valutazioni, non si toglie: quei dati andrebbero persi senza che l'utente lo sappia.
 */
export async function removeEntity(db: pg.Pool, user: UserContext, fornitoreId: number, enteId: number, meta: RequestMeta) {
  requireEntity(user, enteId);
  return withTransaction(db, async (tx) => {
    const { rows } = await tx.query(
      `SELECT
         (SELECT count(*) FROM albo.fornitore_produzione_ente WHERE fornitore_id = $1 AND ente_id = $2)
       + (SELECT count(*) FROM albo.fornitore_classe_merceologica WHERE fornitore_id = $1 AND ente_id = $2)
       + (SELECT count(*) FROM albo.fornitore_sottoclasse_merceologica WHERE fornitore_id = $1 AND ente_id = $2)
       + (SELECT count(*) FROM albo.fornitore_costo_minuto WHERE fornitore_id = $1 AND ente_id = $2)
       + (SELECT count(*) FROM albo.fornitore_valutazione WHERE fornitore_id = $1 AND ente_id = $2) AS dati`,
      [fornitoreId, enteId],
    );
    if (Number(rows[0].dati) > 0) {
      throw conflict(
        'ENTE_CON_DATI',
        "Per questo ente ci sono dati di produzione o valutazioni: eliminali prima di togliere l'ente",
      );
    }
    const { rowCount } = await tx.query('DELETE FROM albo.fornitore_ente WHERE fornitore_id = $1 AND ente_id = $2', [fornitoreId, enteId]);
    if (!rowCount) throw notFound('Il fornitore non è associato a questo ente');
    await audit(tx, user, { azione: 'SUPPLIER_ENTITY_REMOVE', entita: 'fornitore_ente', entitaId: enteId, fornitoreId }, meta);
  });
}

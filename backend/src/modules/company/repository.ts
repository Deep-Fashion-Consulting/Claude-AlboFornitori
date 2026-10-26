import type pg from 'pg';
import { audit, diff, type RequestMeta } from '../../audit.js';
import type { UserContext } from '../../auth/context.js';
import { withTransaction, type Queryable } from '../../db.js';
import { badRequest, conflict, notFound } from '../../errors.js';
import { assertSupplierExists } from '../suppliers/repository.js';
import type { InterlocutoreInput, SubfornitoreInput, UpdateStruttura } from './schemas.js';

const label = (lingua: string, alias: string) =>
  lingua === 'EN' ? `COALESCE(${alias}.descrizione_en, ${alias}.descrizione_it)` : `${alias}.descrizione_it`;
const num = (v: string | null) => (v == null ? null : Number(v));
const ref = (id: number | null, descrizione: string | null) => (id ? { id, descrizione: descrizione ?? '' } : null);

// =============================================================================
// Lettura della pagina "Struttura societaria" (GetSupplierCompanyStructure)
// =============================================================================
export async function getSocieta(db: pg.Pool, user: UserContext, id: number) {
  const L = user.lingua;
  await assertSupplierExists(db, id);
  const [struttura, interlocutori, subfornitori, collegamenti] = await Promise.all([
    db.query(
      `SELECT s.updated_at::text AS versione, s.*,
              vs.codice AS vs_codice, vv.codice AS vv_codice, ${label(L, 'ti')} AS ti_d
         FROM albo.fornitore_struttura s
         LEFT JOIN ref.valuta vs ON vs.id = s.capitale_sociale_valuta_id
         LEFT JOIN ref.valuta vv ON vv.id = s.capitale_versato_valuta_id
         LEFT JOIN ref.tipo_immobile ti ON ti.id = s.tipo_immobile_id
        WHERE s.fornitore_id = $1`,
      [id],
    ),
    db.query(
      `SELECT i.*, ${label(L, 't')} AS t_d
         FROM albo.fornitore_interlocutore i
         LEFT JOIN ref.tipo_interlocutore t ON t.id = i.tipo_interlocutore_id
        WHERE i.fornitore_id = $1
        ORDER BY t.ordine NULLS LAST, i.nominativo, i.id`,
      [id],
    ),
    db.query(
      `SELECT s.*, ${label(L, 'n')} AS n_d, ${label(L, 'p')} AS p_d, p.sigla AS p_sigla, ${label(L, 'e')} AS e_d,
              fa.ragione_sociale AS fa_rs
         FROM albo.subfornitore s
         LEFT JOIN ref.nazione n ON n.id = s.nazione_id
         LEFT JOIN ref.provincia p ON p.id = s.provincia_id
         LEFT JOIN ref.ente e ON e.id = s.ente_id
         LEFT JOIN albo.fornitore fa ON fa.id = s.fornitore_albo_id
        WHERE s.fornitore_id = $1
        ORDER BY s.ragione_sociale, s.id`,
      [id],
    ),
    db.query(
      `SELECT c.collegamento_id AS id, c.tipo, c.relazione, c.attivo,
              f.id AS f_id, f.ragione_sociale AS f_rs, f.attivo AS f_attivo,
              CASE WHEN $2 = 'EN' THEN COALESCE(f.stato_descrizione_en, f.stato_descrizione_it) ELSE f.stato_descrizione_it END AS f_stato
         FROM albo.v_fornitore_collegamento c
         JOIN albo.v_fornitore_sintesi f ON f.id = c.altro_fornitore_id
        WHERE c.fornitore_id = $1
        ORDER BY c.tipo, common.f_search_key(f.ragione_sociale)`,
      [id, L],
    ),
  ]);

  const s = struttura.rows[0];
  return {
    struttura: {
      versione: s?.versione ?? null,
      capitaleSociale: num(s?.capitale_sociale ?? null),
      capitaleSocialeValuta: ref(s?.capitale_sociale_valuta_id ?? null, s?.vs_codice ?? null),
      capitaleVersato: num(s?.capitale_versato ?? null),
      capitaleVersatoValuta: ref(s?.capitale_versato_valuta_id ?? null, s?.vv_codice ?? null),
      numeroAddetti: s?.numero_addetti ?? null,
      notaNumeroAddetti: s?.nota_numero_addetti ?? null,
      immobileMq: num(s?.immobile_mq ?? null),
      tipoImmobile: ref(s?.tipo_immobile_id ?? null, s?.ti_d ?? null),
      tipologiaOfferta: s?.tipologia_offerta ?? null,
      quotaMercatoPrc: num(s?.quota_mercato_prc ?? null),
      quotaMercatoDescrizione: s?.quota_mercato_descrizione ?? null,
    },
    interlocutori: interlocutori.rows.map((r) => ({
      id: r.id,
      tipoInterlocutore: ref(r.tipo_interlocutore_id, r.t_d),
      nominativo: r.nominativo,
      email: r.email,
      telefono: r.telefono,
      cellulare: r.cellulare,
    })),
    subfornitori: subfornitori.rows.map((r) => ({
      id: r.id,
      ragioneSociale: r.ragione_sociale,
      partitaIva: r.partita_iva,
      partitaIvaCee: r.partita_iva_cee,
      codiceFiscale: r.codice_fiscale,
      nazione: ref(r.nazione_id, r.n_d),
      provincia: r.provincia_id ? { id: r.provincia_id, descrizione: r.p_d, sigla: r.p_sigla } : null,
      localita: r.localita,
      indirizzo: r.indirizzo,
      cap: r.cap,
      telefono: r.telefono,
      numeroAddetti: r.numero_addetti,
      referenti: r.referenti,
      ente: ref(r.ente_id, r.e_d),
      fornitoreAlbo: r.fornitore_albo_id ? { id: r.fornitore_albo_id, ragioneSociale: r.fa_rs } : null,
    })),
    collegamenti: collegamenti.rows.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      relazione: r.relazione,
      attivo: r.attivo,
      fornitore: { id: r.f_id, ragioneSociale: r.f_rs, stato: r.f_stato, attivo: r.f_attivo },
    })),
  };
}

// =============================================================================
// Struttura (UpdateSupplierAsset): crea o aggiorna, con controllo di versione
// =============================================================================
const STRUTTURA_COLUMNS = {
  capitaleSociale: 'capitale_sociale',
  capitaleSocialeValutaId: 'capitale_sociale_valuta_id',
  numeroAddetti: 'numero_addetti',
  notaNumeroAddetti: 'nota_numero_addetti',
  immobileMq: 'immobile_mq',
  tipoImmobileId: 'tipo_immobile_id',
  tipologiaOfferta: 'tipologia_offerta',
  quotaMercatoPrc: 'quota_mercato_prc',
  quotaMercatoDescrizione: 'quota_mercato_descrizione',
} as const satisfies Record<Exclude<keyof UpdateStruttura, 'versione'>, string>;

export async function saveStruttura(db: pg.Pool, user: UserContext, id: number, body: UpdateStruttura, meta: RequestMeta) {
  return withTransaction(db, async (tx) => {
    await assertSupplierExists(tx, id);
    const keys = Object.keys(STRUTTURA_COLUMNS) as (keyof typeof STRUTTURA_COLUMNS)[];
    const cols = keys.map((k) => STRUTTURA_COLUMNS[k]);
    const { rows } = await tx.query(
      `SELECT updated_at::text AS versione, ${cols.join(', ')} FROM albo.fornitore_struttura WHERE fornitore_id = $1 FOR UPDATE`,
      [id],
    );
    const current = rows[0];
    if ((current?.versione ?? null) !== body.versione) {
      throw conflict('MODIFICATO_DA_ALTRI', 'I dati sono stati modificati da un altro utente. Ricarica la pagina e riprova.');
    }
    const values = keys.map((k) => body[k]);
    const result = current
      ? await tx.query(
          `UPDATE albo.fornitore_struttura SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_by = $${cols.length + 2}
            WHERE fornitore_id = $1 RETURNING updated_at::text AS versione`,
          [id, ...values, user.id],
        )
      : await tx.query(
          `INSERT INTO albo.fornitore_struttura (fornitore_id, ${cols.join(', ')}, created_by, updated_by)
           VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')}, $${cols.length + 2}, $${cols.length + 2})
           RETURNING updated_at::text AS versione`,
          [id, ...values, user.id],
        );

    // i numeric arrivano da PostgreSQL come stringhe: confronto su valori normalizzati
    const norm = (v: unknown) => (v == null ? null : typeof v === 'string' && !Number.isNaN(Number(v)) ? Number(v) : v);
    const before = Object.fromEntries(keys.map((k) => [k, norm(current?.[STRUTTURA_COLUMNS[k]] ?? null)]));
    const after = Object.fromEntries(keys.map((k) => [k, body[k]]));
    await audit(tx, user, { azione: 'SUPPLIER_ASSET_UPDATE', entita: 'fornitore_struttura', entitaId: id, fornitoreId: id, dettagli: diff(before, after) }, meta);
    return { versione: result.rows[0]!.versione as string };
  });
}

// =============================================================================
// Elenchi figli del fornitore: interlocutori e subfornitori.
// Ogni operazione verifica che l'elemento appartenga al fornitore dell'URL.
// =============================================================================
interface ChildTable<T> {
  table: string;
  entita: string;
  azione: string;
  columns: Record<keyof T & string, string>;
}

const INTERLOCUTORI: ChildTable<InterlocutoreInput> = {
  table: 'albo.fornitore_interlocutore',
  entita: 'fornitore_interlocutore',
  azione: 'SUPPLIER_CONTACT',
  columns: {
    tipoInterlocutoreId: 'tipo_interlocutore_id',
    nominativo: 'nominativo',
    email: 'email',
    telefono: 'telefono',
    cellulare: 'cellulare',
  },
};

const SUBFORNITORI: ChildTable<SubfornitoreInput> = {
  table: 'albo.subfornitore',
  entita: 'subfornitore',
  azione: 'SUPPLIER_SUB',
  columns: {
    ragioneSociale: 'ragione_sociale',
    partitaIva: 'partita_iva',
    partitaIvaCee: 'partita_iva_cee',
    codiceFiscale: 'codice_fiscale',
    nazioneId: 'nazione_id',
    provinciaId: 'provincia_id',
    localita: 'localita',
    indirizzo: 'indirizzo',
    cap: 'cap',
    telefono: 'telefono',
    numeroAddetti: 'numero_addetti',
    referenti: 'referenti',
    enteId: 'ente_id',
    fornitoreAlboId: 'fornitore_albo_id',
  },
};

function childRepo<T extends object>(def: ChildTable<T>) {
  const keys = Object.keys(def.columns) as (keyof T & string)[];
  const cols = keys.map((k) => def.columns[k]);
  return {
    async create(db: pg.Pool, user: UserContext, fornitoreId: number, input: T, meta: RequestMeta) {
      return withTransaction(db, async (tx) => {
        await assertSupplierExists(tx, fornitoreId);
        const { rows } = await tx.query(
          `INSERT INTO ${def.table} (fornitore_id, ${cols.join(', ')}, created_by, updated_by)
           VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')}, $${cols.length + 2}, $${cols.length + 2}) RETURNING id`,
          [fornitoreId, ...keys.map((k) => input[k]), user.id],
        );
        const id = rows[0]!.id as number;
        await audit(tx, user, { azione: `${def.azione}_ADD`, entita: def.entita, entitaId: id, fornitoreId, dettagli: input }, meta);
        return { id };
      });
    },
    async update(db: pg.Pool, user: UserContext, fornitoreId: number, id: number, input: T, meta: RequestMeta) {
      return withTransaction(db, async (tx) => {
        const { rows } = await tx.query(
          `SELECT ${cols.join(', ')} FROM ${def.table} WHERE id = $1 AND fornitore_id = $2 FOR UPDATE`,
          [id, fornitoreId],
        );
        if (!rows[0]) throw notFound('Elemento non trovato per questo fornitore');
        await tx.query(
          `UPDATE ${def.table} SET ${cols.map((c, i) => `${c} = $${i + 3}`).join(', ')}, updated_by = $${cols.length + 3}
            WHERE id = $1 AND fornitore_id = $2`,
          [id, fornitoreId, ...keys.map((k) => input[k]), user.id],
        );
        const before = Object.fromEntries(keys.map((k) => [k, rows[0][def.columns[k]]]));
        await audit(
          tx,
          user,
          { azione: `${def.azione}_UPDATE`, entita: def.entita, entitaId: id, fornitoreId, dettagli: diff(before, input as Record<string, unknown>) },
          meta,
        );
      });
    },
    async remove(db: pg.Pool, user: UserContext, fornitoreId: number, id: number, meta: RequestMeta) {
      return withTransaction(db, async (tx) => {
        const { rows } = await tx.query(
          `DELETE FROM ${def.table} WHERE id = $1 AND fornitore_id = $2 RETURNING ${cols.join(', ')}`,
          [id, fornitoreId],
        );
        if (!rows[0]) throw notFound('Elemento non trovato per questo fornitore');
        await audit(tx, user, { azione: `${def.azione}_REMOVE`, entita: def.entita, entitaId: id, fornitoreId, dettagli: rows[0] }, meta);
      });
    },
  };
}

export const interlocutori = childRepo(INTERLOCUTORI);
export const subfornitori = childRepo(SUBFORNITORI);

// =============================================================================
// Collegamenti (AddSupplierLink / RemoveSupplierLink)
// Semantica confermata: dalla pagina di A si aggiunge B
//   CONSOLIDATO  -> A è la capogruppo, B il consolidato
//   ALTERNATIVO  -> B è un fornitore alternativo di A
//   PADRE_FIGLIO -> A e B sono la stessa azienda nel tempo (simmetrico)
// =============================================================================
export async function addLink(
  db: pg.Pool,
  user: UserContext,
  fornitoreId: number,
  tipo: 'CONSOLIDATO' | 'ALTERNATIVO' | 'PADRE_FIGLIO',
  altroId: number,
  meta: RequestMeta,
) {
  if (altroId === fornitoreId) {
    throw badRequest('COLLEGAMENTO_SE_STESSO', 'Un fornitore non può essere collegato a sé stesso');
  }
  return withTransaction(db, async (tx) => {
    await assertSupplierExists(tx, fornitoreId);
    const other = await tx.query('SELECT 1 FROM albo.fornitore WHERE id = $1', [altroId]);
    if (!other.rowCount) throw notFound('Il fornitore da collegare non esiste');

    if (tipo === 'CONSOLIDATO') {
      const inverse = await tx.query(
        `SELECT 1 FROM albo.fornitore_collegamento
          WHERE tipo = 'CONSOLIDATO' AND fornitore_da_id = $1 AND fornitore_a_id = $2`,
        [altroId, fornitoreId],
      );
      if (inverse.rowCount) {
        throw conflict('CONSOLIDAMENTO_CIRCOLARE', 'Questo fornitore è già consolidato in quello che stai aggiungendo');
      }
    }

    const { rows } = await tx.query(
      `INSERT INTO albo.fornitore_collegamento (fornitore_da_id, fornitore_a_id, tipo, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4) RETURNING id`,
      [fornitoreId, altroId, tipo, user.id],
    );
    const id = rows[0]!.id as number;
    await audit(tx, user, { azione: 'SUPPLIER_LINK_ADD', entita: 'fornitore_collegamento', entitaId: id, fornitoreId, dettagli: { tipo, altroId } }, meta);
    return { id };
  });
}

export async function removeLink(db: Queryable, user: UserContext, fornitoreId: number, linkId: number, meta: RequestMeta) {
  const { rows } = await db.query(
    `DELETE FROM albo.fornitore_collegamento
      WHERE id = $1 AND $2 IN (fornitore_da_id, fornitore_a_id)
      RETURNING tipo, fornitore_da_id, fornitore_a_id`,
    [linkId, fornitoreId],
  );
  if (!rows[0]) throw notFound('Collegamento non trovato per questo fornitore');
  await audit(db, user, { azione: 'SUPPLIER_LINK_REMOVE', entita: 'fornitore_collegamento', entitaId: linkId, fornitoreId, dettagli: rows[0] }, meta);
}

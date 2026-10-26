import type pg from 'pg';
import { audit, diff, type RequestMeta } from '../../audit.js';
import type { UserContext } from '../../auth/context.js';
import { withTransaction, type Queryable } from '../../db.js';
import { AppError, badRequest, conflict, notFound } from '../../errors.js';
import { buildSearchQuery, type SearchCriteria } from './search.js';
import { isValidCodiceFiscale, isValidPartitaIva, isValidPartitaIvaCee, normalizeCode } from './codes.js';
import type { AddAddress, CreateSupplier, UpdateGeneral } from './schemas.js';

const label = (lingua: string, alias: string) =>
  lingua === 'EN' ? `COALESCE(${alias}.descrizione_en, ${alias}.descrizione_it)` : `${alias}.descrizione_it`;

export async function assertSupplierExists(db: Queryable, id: number) {
  const { rowCount } = await db.query('SELECT 1 FROM albo.fornitore WHERE id = $1', [id]);
  if (!rowCount) throw notFound('Fornitore non trovato');
}

// ---------------------------------------------------------------------------
// Ricerca
// ---------------------------------------------------------------------------
export async function searchSuppliers(db: Queryable, user: UserContext, criteria: SearchCriteria) {
  const { text, values } = buildSearchQuery(criteria, user.id);
  const { rows } = await db.query(text, values);
  return {
    totale: rows[0]?.totale ?? 0,
    pagina: criteria.pagina,
    limite: criteria.limite,
    risultati: rows.map((r) => ({
      id: r.id,
      ragioneSociale: r.ragione_sociale,
      partitaIva: r.partita_iva,
      partitaIvaCee: r.partita_iva_cee,
      codiceFiscale: r.codice_fiscale,
      email: r.email,
      codiciEsterni: r.codici_esterni,
      stato: user.lingua === 'EN' ? (r.stato_descrizione_en ?? r.stato_descrizione_it) : r.stato_descrizione_it,
      attivo: r.attivo,
      preferito: r.preferito,
    })),
  };
}

// ---------------------------------------------------------------------------
// Intestazione (UCSupplierHeader)
// ---------------------------------------------------------------------------
export async function getHeader(db: Queryable, user: UserContext, id: number) {
  const { rows } = await db.query(
    `SELECT f.id, f.ragione_sociale, f.denominazione_sociale, f.sede_legale, f.attivo, f.updated_at,
            CASE WHEN $3 = 'EN' THEN COALESCE(f.stato_descrizione_en, f.stato_descrizione_it) ELSE f.stato_descrizione_it END AS stato,
            EXISTS (SELECT 1 FROM albo.fornitore_preferito fp WHERE fp.fornitore_id = f.id AND fp.utente_id = $2) AS preferito
       FROM albo.v_fornitore_sintesi f WHERE f.id = $1`,
    [id, user.id, user.lingua],
  );
  const r = rows[0];
  if (!r) throw notFound('Fornitore non trovato');
  return {
    id: r.id,
    ragioneSociale: r.ragione_sociale,
    denominazioneSociale: r.denominazione_sociale,
    sedeLegale: r.sede_legale,
    stato: r.stato,
    attivo: r.attivo,
    preferito: r.preferito,
    aggiornatoIl: (r.updated_at as Date).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Scheda dati anagrafici (GetSupplierGeneralData, spec. cap. 8)
// ---------------------------------------------------------------------------
export async function getGeneral(db: pg.Pool, user: UserContext, id: number) {
  const L = user.lingua;
  const [main, stati, indirizzi, enti, codici, marchi] = await Promise.all([
    db.query(
      `SELECT f.*, f.updated_at::text AS versione, s.ragione_sociale AS sostituito_ragione_sociale,
              EXISTS (SELECT 1 FROM albo.subfornitore sf WHERE sf.fornitore_id = f.id) AS opera_con_sub,
              EXISTS (SELECT 1 FROM albo.fornitore_preferito fp WHERE fp.fornitore_id = f.id AND fp.utente_id = $2) AS preferito
         FROM albo.fornitore f
         LEFT JOIN albo.fornitore s ON s.id = f.sostituito_da_id
        WHERE f.id = $1`,
      [id, user.id],
    ),
    db.query(
      `SELECT fs.id, fs.stato_id, ${label(L, 's')} AS descrizione, fs.data_da,
              fs.id = (SELECT sc.id FROM albo.fornitore_stato sc WHERE sc.fornitore_id = fs.fornitore_id
                        ORDER BY sc.data_da DESC, sc.id DESC LIMIT 1) AS corrente
         FROM albo.fornitore_stato fs JOIN ref.stato_fornitore s ON s.id = fs.stato_id
        WHERE fs.fornitore_id = $1
        ORDER BY fs.data_da DESC, fs.id DESC`,
      [id],
    ),
    db.query(
      `SELECT i.id, i.indirizzo, i.cap, i.telefono, i.principale, i.latitudine, i.longitudine,
              ti.id AS ti_id, ${label(L, 'ti')} AS ti_d,
              n.id AS n_id, ${label(L, 'n')} AS n_d,
              r.id AS r_id, ${label(L, 'r')} AS r_d,
              p.id AS p_id, ${label(L, 'p')} AS p_d, p.sigla AS p_sigla,
              l.id AS l_id, ${label(L, 'l')} AS l_d
         FROM albo.fornitore_indirizzo i
         JOIN ref.tipo_indirizzo ti ON ti.id = i.tipo_indirizzo_id
         JOIN ref.localita l ON l.id = i.localita_id
         JOIN ref.nazione n ON n.id = l.nazione_id
         LEFT JOIN ref.provincia p ON p.id = l.provincia_id
         LEFT JOIN ref.regione r ON r.id = p.regione_id
        WHERE i.fornitore_id = $1
        ORDER BY i.principale DESC, ti.ordine, i.id`,
      [id],
    ),
    db.query(
      `SELECT e.id, ${label(L, 'e')} AS descrizione, (ue.ente_id IS NOT NULL) AS autorizzato, v.val_generale
         FROM albo.fornitore_ente fe
         JOIN ref.ente e ON e.id = fe.ente_id
         LEFT JOIN iam.utente_ente ue ON ue.ente_id = fe.ente_id AND ue.utente_id = $2
         LEFT JOIN albo.fornitore_valutazione v ON v.fornitore_id = fe.fornitore_id AND v.ente_id = fe.ente_id
        WHERE fe.fornitore_id = $1
        ORDER BY e.ordine, 2`,
      [id, user.id],
    ),
    db.query(
      `SELECT ca.id, a.id AS "applicativoId", a.codice AS applicativo, ca.codice
         FROM albo.fornitore_codice_applicativo ca JOIN ref.applicativo a ON a.id = ca.applicativo_id
        WHERE ca.fornitore_id = $1 ORDER BY a.ordine, ca.codice`,
      [id],
    ),
    db.query(
      `SELECT fm.id, m.id AS "marchioId", m.descrizione_it AS marchio, d.descrizione_it AS divisione
         FROM albo.fornitore_marchio fm
         JOIN ref.marchio m ON m.id = fm.marchio_id
         LEFT JOIN ref.divisione d ON d.id = fm.divisione_id
        WHERE fm.fornitore_id = $1 ORDER BY m.ordine, m.descrizione_it`,
      [id],
    ),
  ]);

  const f = main.rows[0];
  if (!f) throw notFound('Fornitore non trovato');
  const num = (v: string | null) => (v == null ? null : Number(v));

  return {
    id: f.id,
    versione: f.versione,
    aggiornatoIl: (f.updated_at as Date).toISOString(),
    master: {
      ragioneSociale: f.ragione_sociale,
      partitaIva: f.partita_iva,
      partitaIvaCee: f.partita_iva_cee,
      codiceFiscale: f.codice_fiscale,
      telefono: f.telefono,
      fax: f.fax,
      codAccorpamento: f.cod_accorpamento,
      sostituitoDa: f.sostituito_da_id ? { id: f.sostituito_da_id, ragioneSociale: f.sostituito_ragione_sociale } : null,
      sincronizzatoIl: f.master_sync_at ? (f.master_sync_at as Date).toISOString() : null,
    },
    dati: {
      denominazioneSociale: f.denominazione_sociale,
      sedeLegale: f.sede_legale,
      dataInizioAttivita: f.data_inizio_attivita,
      dataInizioRapporto: f.data_inizio_rapporto,
      dataFineRapporto: f.data_fine_rapporto,
      responsabileCodice: f.responsabile_codice,
      uf: f.uf,
      email: f.email,
      emailPec: f.email_pec,
      numeroRea: f.numero_rea,
      sitoWeb: f.sito_web,
    },
    operaConSubfornitori: f.opera_con_sub,
    stati: stati.rows.map((r) => ({
      id: r.id,
      statoId: r.stato_id,
      descrizione: r.descrizione,
      dataDa: r.data_da,
      corrente: r.corrente,
    })),
    indirizzi: indirizzi.rows.map((r) => ({
      id: r.id,
      tipoIndirizzo: { id: r.ti_id, descrizione: r.ti_d },
      nazione: { id: r.n_id, descrizione: r.n_d },
      regione: r.r_id ? { id: r.r_id, descrizione: r.r_d } : null,
      provincia: r.p_id ? { id: r.p_id, descrizione: r.p_d, sigla: r.p_sigla } : null,
      localita: { id: r.l_id, descrizione: r.l_d },
      indirizzo: r.indirizzo,
      cap: r.cap,
      telefono: r.telefono,
      principale: r.principale,
      latitudine: num(r.latitudine),
      longitudine: num(r.longitudine),
    })),
    enti: enti.rows.map((r) => ({
      enteId: r.id,
      descrizione: r.descrizione,
      autorizzato: r.autorizzato,
      valutazioneGenerale: r.autorizzato ? r.val_generale : null,
    })),
    codiciApplicativi: codici.rows,
    marchi: marchi.rows,
    preferito: f.preferito,
  };
}

// ---------------------------------------------------------------------------
// Aggiornamento dati anagrafici (UpdateSupplierGeneralData, spec. cap. 9)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Controlli su codici e duplicati, comuni a creazione e modifica
// ---------------------------------------------------------------------------
type Codes = { partitaIva: string | null; partitaIvaCee: string | null; codiceFiscale: string | null };

/** Normalizza i codici (maiuscolo, senza spazi e punti). */
function normalizeCodes<T extends Codes>(input: T): T {
  const n = (v: string | null) => (v == null ? null : normalizeCode(v) || null);
  return { ...input, partitaIva: n(input.partitaIva), partitaIvaCee: n(input.partitaIvaCee), codiceFiscale: n(input.codiceFiscale) };
}

/**
 * Controllo formale dei codici. In modifica si controllano solo quelli cambiati:
 * un dato importato con un codice irregolare non deve impedire di salvare gli altri campi.
 */
function checkCodes(input: Codes, current?: Codes) {
  const errors: { campo: string; messaggio: string }[] = [];
  const changed = (k: keyof Codes) => input[k] != null && input[k] !== current?.[k];
  if (changed('partitaIva') && !isValidPartitaIva(input.partitaIva!)) {
    errors.push({ campo: 'partitaIva', messaggio: 'Partita IVA non valida: servono 11 cifre con la cifra di controllo corretta' });
  }
  if (changed('codiceFiscale') && !isValidCodiceFiscale(input.codiceFiscale!)) {
    errors.push({ campo: 'codiceFiscale', messaggio: 'Codice fiscale non valido' });
  }
  if (changed('partitaIvaCee') && !isValidPartitaIvaCee(input.partitaIvaCee!)) {
    errors.push({ campo: 'partitaIvaCee', messaggio: 'P.IVA CEE non valida: prefisso del paese seguito dal codice (es. IT01234567890)' });
  }
  if (errors.length) throw badRequest('RICHIESTA_NON_VALIDA', 'Alcuni dati della richiesta non sono validi', errors);
}

/**
 * Altri fornitori con la stessa P.IVA, P.IVA CEE o codice fiscale.
 * Non è un divieto (esistono casi legittimi), ma l'utente deve confermare.
 */
async function checkDuplicates(db: Queryable, input: Codes & { confermaDuplicato: boolean }, excludeId: number | null) {
  if (input.confermaDuplicato || (!input.partitaIva && !input.partitaIvaCee && !input.codiceFiscale)) return;
  const { rows } = await db.query(
    `SELECT id, ragione_sociale AS "ragioneSociale"
       FROM albo.fornitore
      WHERE ($1::bigint IS NULL OR id <> $1)
        AND (partita_iva = $2 OR partita_iva_cee = $3 OR codice_fiscale = $4)
      ORDER BY ragione_sociale
      LIMIT 10`,
    [excludeId, input.partitaIva, input.partitaIvaCee, input.codiceFiscale],
  );
  if (rows.length) {
    throw new AppError(
      409,
      'POSSIBILE_DUPLICATO',
      'Esistono già fornitori con la stessa partita IVA o lo stesso codice fiscale',
      { fornitori: rows },
    );
  }
}

// ---------------------------------------------------------------------------
// Creazione (CreateSupplier)
// ---------------------------------------------------------------------------
export async function createSupplier(db: pg.Pool, user: UserContext, raw: CreateSupplier, meta: RequestMeta) {
  const input = normalizeCodes(raw);
  checkCodes(input);
  return withTransaction(db, async (tx) => {
    await checkDuplicates(tx, input, null);
    const { rows } = await tx.query(
      `INSERT INTO albo.fornitore
         (ragione_sociale, partita_iva, partita_iva_cee, codice_fiscale, telefono, email, fonte_master, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'ALBO', $7, $7) RETURNING id`,
      [input.ragioneSociale, input.partitaIva, input.partitaIvaCee, input.codiceFiscale, input.telefono, input.email, user.id],
    );
    const id = rows[0]!.id as number;
    const { confermaDuplicato, ...dettagli } = input;
    await audit(tx, user, { azione: 'SUPPLIER_CREATE', entita: 'fornitore', entitaId: id, fornitoreId: id, dettagli: { ...dettagli, confermaDuplicato } }, meta);
    return { id };
  });
}

const GENERAL_COLUMNS = {
  ragioneSociale: 'ragione_sociale',
  partitaIva: 'partita_iva',
  partitaIvaCee: 'partita_iva_cee',
  codiceFiscale: 'codice_fiscale',
  telefono: 'telefono',
  fax: 'fax',
  denominazioneSociale: 'denominazione_sociale',
  sedeLegale: 'sede_legale',
  dataInizioAttivita: 'data_inizio_attivita',
  dataInizioRapporto: 'data_inizio_rapporto',
  dataFineRapporto: 'data_fine_rapporto',
  uf: 'uf',
  email: 'email',
  emailPec: 'email_pec',
  numeroRea: 'numero_rea',
  sitoWeb: 'sito_web',
} as const satisfies Record<Exclude<keyof UpdateGeneral, 'versione' | 'confermaDuplicato'>, string>;

export async function updateGeneral(db: pg.Pool, user: UserContext, id: number, raw: UpdateGeneral, meta: RequestMeta) {
  const body = normalizeCodes(raw);
  return withTransaction(db, async (tx) => {
    const cols = Object.values(GENERAL_COLUMNS);
    const { rows } = await tx.query(
      `SELECT updated_at::text AS versione, ${cols.join(', ')} FROM albo.fornitore WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const current = rows[0];
    if (!current) throw notFound('Fornitore non trovato');
    if (current.versione !== body.versione) {
      throw conflict('MODIFICATO_DA_ALTRI', 'I dati sono stati modificati da un altro utente. Ricarica la pagina e riprova.');
    }
    checkCodes(body, { partitaIva: current.partita_iva, partitaIvaCee: current.partita_iva_cee, codiceFiscale: current.codice_fiscale });
    // il controllo dei duplicati riguarda solo i codici cambiati
    await checkDuplicates(
      tx,
      {
        partitaIva: body.partitaIva !== current.partita_iva ? body.partitaIva : null,
        partitaIvaCee: body.partitaIvaCee !== current.partita_iva_cee ? body.partitaIvaCee : null,
        codiceFiscale: body.codiceFiscale !== current.codice_fiscale ? body.codiceFiscale : null,
        confermaDuplicato: body.confermaDuplicato,
      },
      id,
    );

    const keys = Object.keys(GENERAL_COLUMNS) as (keyof typeof GENERAL_COLUMNS)[];
    const sets = keys.map((k, i) => `${GENERAL_COLUMNS[k]} = $${i + 2}`);
    const values = keys.map((k) => body[k]);
    const { rows: updated } = await tx.query(
      `UPDATE albo.fornitore SET ${sets.join(', ')}, updated_by = $${keys.length + 2}
        WHERE id = $1 RETURNING updated_at::text AS versione`,
      [id, ...values, user.id],
    );

    const before = Object.fromEntries(keys.map((k) => [k, current[GENERAL_COLUMNS[k]]]));
    const after = Object.fromEntries(keys.map((k) => [k, body[k]]));
    await audit(
      tx,
      user,
      { azione: 'SUPPLIER_GENERAL_UPDATE', entita: 'fornitore', entitaId: id, fornitoreId: id, dettagli: diff(before, after) },
      meta,
    );
    return { versione: updated[0]!.versione as string };
  });
}

// ---------------------------------------------------------------------------
// Stati (AddSupplierState / RemoveSupplierState)
// ---------------------------------------------------------------------------
export async function addState(
  db: pg.Pool,
  user: UserContext,
  fornitoreId: number,
  statoId: number,
  dataDa: string,
  meta: RequestMeta,
) {
  return withTransaction(db, async (tx) => {
    await assertSupplierExists(tx, fornitoreId);
    const { rows } = await tx.query(
      `INSERT INTO albo.fornitore_stato (fornitore_id, stato_id, data_da, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
      [fornitoreId, statoId, dataDa, user.id],
    );
    const id = rows[0]!.id as number;
    await audit(tx, user, { azione: 'SUPPLIER_STATE_ADD', entita: 'fornitore_stato', entitaId: id, fornitoreId, dettagli: { statoId, dataDa } }, meta);
    return { id };
  });
}

export async function removeState(db: pg.Pool, user: UserContext, fornitoreId: number, statoRecordId: number, meta: RequestMeta) {
  return withTransaction(db, async (tx) => {
    const { rows } = await tx.query(
      'DELETE FROM albo.fornitore_stato WHERE id = $1 AND fornitore_id = $2 RETURNING stato_id, data_da',
      [statoRecordId, fornitoreId],
    );
    if (!rows[0]) throw notFound('Stato non trovato per questo fornitore');
    await audit(tx, user, { azione: 'SUPPLIER_STATE_REMOVE', entita: 'fornitore_stato', entitaId: statoRecordId, fornitoreId, dettagli: rows[0] }, meta);
  });
}

// ---------------------------------------------------------------------------
// Indirizzi (AddSupplierAddress)
// ---------------------------------------------------------------------------
/**
 * Località dell'indirizzo: quella scelta dall'elenco, oppure una località estera scritta a mano,
 * riusata se esiste già con lo stesso nome. In Italia il comune va scelto dall'elenco ISTAT.
 */
async function resolveLocality(tx: Queryable, a: AddAddress): Promise<number> {
  if (a.localitaId) return a.localitaId;
  const { rows: naz } = await tx.query('SELECT iso2 FROM ref.nazione WHERE id = $1', [a.nazioneId]);
  if (!naz[0]) throw badRequest('RIFERIMENTO_NON_VALIDO', 'Nazione inesistente');
  if (naz[0].iso2 === 'IT') {
    throw badRequest('RICHIESTA_NON_VALIDA', 'Per l’Italia scegli il comune dall’elenco', [
      { campo: 'localitaId', messaggio: 'Scegli il comune dall’elenco' },
    ]);
  }
  const nome = a.localitaNome!.replace(/\s+/g, ' ');
  const { rows } = await tx.query(
    `SELECT id FROM ref.localita WHERE nazione_id = $1 AND common.f_search_key(descrizione_it) = common.f_search_key($2)`,
    [a.nazioneId, nome],
  );
  if (rows[0]) return rows[0].id;
  const created = await tx.query('INSERT INTO ref.localita (descrizione_it, nazione_id) VALUES ($1, $2) RETURNING id', [nome, a.nazioneId]);
  return created.rows[0]!.id;
}

export async function addAddress(db: pg.Pool, user: UserContext, fornitoreId: number, a: AddAddress, meta: RequestMeta) {
  return withTransaction(db, async (tx) => {
    await assertSupplierExists(tx, fornitoreId);
    const localitaId = await resolveLocality(tx, a);
    // Il primo indirizzo è sempre il principale
    const { rowCount } = await tx.query('SELECT 1 FROM albo.fornitore_indirizzo WHERE fornitore_id = $1 LIMIT 1', [fornitoreId]);
    const principale = a.principale || !rowCount;
    if (principale) {
      await tx.query('UPDATE albo.fornitore_indirizzo SET principale = false WHERE fornitore_id = $1 AND principale', [fornitoreId]);
    }
    const { rows } = await tx.query(
      `INSERT INTO albo.fornitore_indirizzo
         (fornitore_id, tipo_indirizzo_id, localita_id, indirizzo, cap, telefono, principale, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING id`,
      [fornitoreId, a.tipoIndirizzoId, localitaId, a.indirizzo, a.cap, a.telefono, principale, user.id],
    );
    const id = rows[0]!.id as number;
    await audit(tx, user, { azione: 'SUPPLIER_ADDRESS_ADD', entita: 'fornitore_indirizzo', entitaId: id, fornitoreId, dettagli: a }, meta);
    return { id };
  });
}

export async function setPrincipalAddress(db: pg.Pool, user: UserContext, fornitoreId: number, addressId: number, meta: RequestMeta) {
  return withTransaction(db, async (tx) => {
    const { rowCount } = await tx.query('SELECT 1 FROM albo.fornitore_indirizzo WHERE id = $1 AND fornitore_id = $2 FOR UPDATE', [
      addressId,
      fornitoreId,
    ]);
    if (!rowCount) throw notFound('Indirizzo non trovato per questo fornitore');
    await tx.query('UPDATE albo.fornitore_indirizzo SET principale = false WHERE fornitore_id = $1 AND principale', [fornitoreId]);
    await tx.query('UPDATE albo.fornitore_indirizzo SET principale = true, updated_by = $2 WHERE id = $1', [addressId, user.id]);
    await audit(tx, user, { azione: 'SUPPLIER_ADDRESS_PRINCIPAL', entita: 'fornitore_indirizzo', entitaId: addressId, fornitoreId }, meta);
  });
}

export async function deleteAddress(db: pg.Pool, user: UserContext, fornitoreId: number, addressId: number, meta: RequestMeta) {
  return withTransaction(db, async (tx) => {
    const { rows } = await tx.query(
      'DELETE FROM albo.fornitore_indirizzo WHERE id = $1 AND fornitore_id = $2 RETURNING principale, indirizzo',
      [addressId, fornitoreId],
    );
    if (!rows[0]) throw notFound('Indirizzo non trovato per questo fornitore');
    // Se era il principale, il più vecchio tra i rimanenti prende il suo posto
    if (rows[0].principale) {
      await tx.query(
        `UPDATE albo.fornitore_indirizzo SET principale = true
          WHERE id = (SELECT id FROM albo.fornitore_indirizzo WHERE fornitore_id = $1 ORDER BY id LIMIT 1)`,
        [fornitoreId],
      );
    }
    await audit(tx, user, { azione: 'SUPPLIER_ADDRESS_REMOVE', entita: 'fornitore_indirizzo', entitaId: addressId, fornitoreId, dettagli: rows[0] }, meta);
  });
}

// ---------------------------------------------------------------------------
// Preferiti (SetFavourite / UnSetFavourite)
// ---------------------------------------------------------------------------
export async function setFavourite(db: Queryable, userId: number, fornitoreId: number, enabled: boolean) {
  await assertSupplierExists(db, fornitoreId);
  if (enabled) {
    await db.query(
      'INSERT INTO albo.fornitore_preferito (utente_id, fornitore_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, fornitoreId],
    );
  } else {
    await db.query('DELETE FROM albo.fornitore_preferito WHERE utente_id = $1 AND fornitore_id = $2', [userId, fornitoreId]);
  }
}

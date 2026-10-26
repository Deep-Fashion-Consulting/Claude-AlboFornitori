import { z } from 'zod';
import { normalizeCode } from './codes.js';

const SiNo = z.enum(['si', 'no']);
const idList = z
  .union([z.array(z.coerce.number().int().positive()), z.coerce.number().int().positive()])
  .transform((v) => (Array.isArray(v) ? v : [v]));

/** Criteri di ricerca (SupplierSearchCriteria, spec. cap. 6 e pagina Anagrafica_Ricerca). */
export const SearchCriteriaSchema = z.object({
  nome: z.string().trim().max(200).optional(),
  modoNome: z.enum(['uguale', 'inizia', 'finisce', 'contiene']).default('contiene'),
  partitaIva: z.string().trim().max(20).optional(),
  partitaIvaCee: z.string().trim().max(20).optional(),
  codiceFiscale: z.string().trim().max(20).optional(),
  uf: z.string().trim().max(30).optional(),
  /** Codice del fornitore in un sistema esterno; con applicativoId si cerca solo in quel sistema */
  codiceEsterno: z.string().trim().max(50).optional(),
  applicativoId: z.coerce.number().int().positive().optional(),
  marchioId: z.coerce.number().int().positive().optional(),
  nazioneId: z.coerce.number().int().positive().optional(),
  regioneId: z.coerce.number().int().positive().optional(),
  provinciaId: z.coerce.number().int().positive().optional(),
  statoId: z.coerce.number().int().positive().optional(),
  inizioRapportoDa: z.iso.date().optional(),
  inizioRapportoA: z.iso.date().optional(),
  fineRapportoDa: z.iso.date().optional(),
  fineRapportoA: z.iso.date().optional(),
  rapporto: z.enum(['attivi', 'cessati']).optional(),
  padriFigli: SiNo.optional(),
  consolidati: SiNo.optional(),
  ordinatoSap: SiNo.optional(),
  ordinatoSt3: SiNo.optional(),
  fatturatoAttivo: SiNo.optional(),
  fatturatoPassivo: SiNo.optional(),
  classiMerceologiche: idList.optional(),
  enti: idList.optional(),
  soloPreferiti: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  limite: z.coerce.number().int().min(1).max(500).default(50),
  pagina: z.coerce.number().int().min(1).default(1),
});

export type SearchCriteria = z.infer<typeof SearchCriteriaSchema>;

/** Escape dei caratteri jolly di LIKE nell'input utente. */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);


/**
 * Costruisce la query di ricerca con soli parametri posizionali
 * (la concatenazione di valori del legacy non viene replicata: spec. cap. 6).
 */
export function buildSearchQuery(c: SearchCriteria, userId: number): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const p = (v: unknown) => {
    values.push(v);
    return `$${values.length}`;
  };
  const where: string[] = [];
  const exists = (sql: string, yes = true) => where.push(`${yes ? '' : 'NOT '}EXISTS (${sql})`);

  if (c.nome) {
    const col = 'common.f_search_key(f.ragione_sociale)';
    if (c.modoNome === 'uguale') {
      where.push(`${col} = common.f_search_key(${p(c.nome)})`);
    } else {
      const key = `common.f_search_key(${p(escapeLike(c.nome))})`;
      const pattern =
        c.modoNome === 'inizia' ? `${key} || '%'` : c.modoNome === 'finisce' ? `'%' || ${key}` : `'%' || ${key} || '%'`;
      where.push(`${col} LIKE ${pattern}`);
    }
  }

  if (c.partitaIva) where.push(`f.partita_iva LIKE ${p(escapeLike(normalizeCode(c.partitaIva)))} || '%'`);
  if (c.partitaIvaCee) where.push(`f.partita_iva_cee LIKE ${p(escapeLike(normalizeCode(c.partitaIvaCee)))} || '%'`);
  if (c.codiceFiscale) where.push(`f.codice_fiscale LIKE ${p(escapeLike(normalizeCode(c.codiceFiscale)))} || '%'`);
  if (c.uf) where.push(`f.uf ILIKE ${p(escapeLike(c.uf))}`);

  if (c.codiceEsterno) {
    exists(
      `SELECT 1 FROM albo.fornitore_codice_applicativo ca
        WHERE ca.fornitore_id = f.id AND upper(ca.codice) = upper(${p(c.codiceEsterno)})
          ${c.applicativoId ? `AND ca.applicativo_id = ${p(c.applicativoId)}` : ''}`,
    );
  }

  if (c.marchioId) {
    exists(`SELECT 1 FROM albo.fornitore_marchio fm WHERE fm.fornitore_id = f.id AND fm.marchio_id = ${p(c.marchioId)}`);
  }

  // Geografia su qualsiasi indirizzo del fornitore; vale il livello più specifico indicato
  if (c.provinciaId || c.regioneId || c.nazioneId) {
    const cond = c.provinciaId
      ? `l.provincia_id = ${p(c.provinciaId)}`
      : c.regioneId
        ? `pr.regione_id = ${p(c.regioneId)}`
        : `l.nazione_id = ${p(c.nazioneId)}`;
    exists(
      `SELECT 1 FROM albo.fornitore_indirizzo i
         JOIN ref.localita l ON l.id = i.localita_id
         LEFT JOIN ref.provincia pr ON pr.id = l.provincia_id
        WHERE i.fornitore_id = f.id AND ${cond}`,
    );
  }

  if (c.statoId) where.push(`f.stato_id = ${p(c.statoId)}`);

  if (c.inizioRapportoDa) where.push(`f.data_inizio_rapporto >= ${p(c.inizioRapportoDa)}::date`);
  if (c.inizioRapportoA) where.push(`f.data_inizio_rapporto <= ${p(c.inizioRapportoA)}::date`);
  if (c.fineRapportoDa) where.push(`f.data_fine_rapporto >= ${p(c.fineRapportoDa)}::date`);
  if (c.fineRapportoA) where.push(`f.data_fine_rapporto <= ${p(c.fineRapportoA)}::date`);
  if (c.rapporto === 'attivi') where.push('f.attivo');
  if (c.rapporto === 'cessati') where.push('NOT f.attivo');

  const linkFilter = (tipo: string, v: 'si' | 'no') =>
    exists(
      `SELECT 1 FROM albo.fornitore_collegamento fc
        WHERE fc.tipo = ${p(tipo)} AND fc.attivo AND f.id IN (fc.fornitore_da_id, fc.fornitore_a_id)`,
      v === 'si',
    );
  if (c.padriFigli) linkFilter('PADRE_FIGLIO', c.padriFigli);
  if (c.consolidati) linkFilter('CONSOLIDATO', c.consolidati);

  const extFilter = (table: string, v: 'si' | 'no') =>
    exists(`SELECT 1 FROM ${table} x WHERE x.fornitore_id = f.id`, v === 'si');
  if (c.ordinatoSap) extFilter('ext.ordinato_sap', c.ordinatoSap);
  if (c.ordinatoSt3) extFilter('ext.ordinato_st3', c.ordinatoSt3);
  if (c.fatturatoAttivo) extFilter('ext.fatturato_attivo', c.fatturatoAttivo);
  if (c.fatturatoPassivo) extFilter('ext.fatturato_passivo', c.fatturatoPassivo);

  if (c.classiMerceologiche?.length) {
    exists(
      `SELECT 1 FROM albo.fornitore_classe_merceologica cm
        WHERE cm.fornitore_id = f.id AND cm.classe_merceologica_id = ANY(${p(c.classiMerceologiche)}::int[])`,
    );
  }
  if (c.enti?.length) {
    exists(`SELECT 1 FROM albo.fornitore_ente fe WHERE fe.fornitore_id = f.id AND fe.ente_id = ANY(${p(c.enti)}::int[])`);
  }

  const user = p(userId);
  if (c.soloPreferiti) {
    exists(`SELECT 1 FROM albo.fornitore_preferito fp WHERE fp.fornitore_id = f.id AND fp.utente_id = ${user}`);
  }

  const limit = p(c.limite);
  const offset = p((c.pagina - 1) * c.limite);

  const text = `
    SELECT f.id, f.ragione_sociale, f.partita_iva, f.partita_iva_cee, f.codice_fiscale, f.email,
           f.codici_esterni, f.stato_id, f.stato_descrizione_it, f.stato_descrizione_en, f.attivo,
           EXISTS (SELECT 1 FROM albo.fornitore_preferito fp WHERE fp.fornitore_id = f.id AND fp.utente_id = ${user}) AS preferito,
           count(*) OVER () AS totale
      FROM albo.v_fornitore_sintesi f
     ${where.length ? `WHERE ${where.join('\n       AND ')}` : ''}
     ORDER BY common.f_search_key(f.ragione_sociale), f.id
     LIMIT ${limit} OFFSET ${offset}`;

  return { text, values };
}

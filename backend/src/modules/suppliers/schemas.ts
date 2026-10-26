import { z } from 'zod';

/** Testo facoltativo: stringa vuota => null */
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v === '' ? null : v));

const optEmail = z
  .union([z.literal(''), z.email({ message: 'Indirizzo e-mail non valido' }).max(254)])
  .nullable()
  .transform((v) => (v === '' ? null : v));

const optDate = z
  .union([z.literal(''), z.iso.date({ message: 'Data non valida (AAAA-MM-GG)' })])
  .nullable()
  .transform((v) => (v === '' ? null : v));

const Ref = z.object({ id: z.number(), descrizione: z.string() });

export const SupplierIdParams = z.object({ id: z.coerce.number().int().positive() });

export const SupplierSummarySchema = z.object({
  id: z.number(),
  ragioneSociale: z.string(),
  partitaIva: z.string().nullable(),
  partitaIvaCee: z.string().nullable(),
  codiceFiscale: z.string().nullable(),
  email: z.string().nullable(),
  codiciSap: z.string().nullable(),
  codiciSt3: z.string().nullable(),
  stato: z.string().nullable(),
  attivo: z.boolean(),
  preferito: z.boolean(),
});

export const SearchResultSchema = z.object({
  totale: z.number(),
  pagina: z.number(),
  limite: z.number(),
  risultati: z.array(SupplierSummarySchema),
});

export const SupplierHeaderSchema = z.object({
  id: z.number(),
  ragioneSociale: z.string(),
  denominazioneSociale: z.string().nullable(),
  sedeLegale: z.string().nullable(),
  stato: z.string().nullable(),
  attivo: z.boolean(),
  preferito: z.boolean(),
  aggiornatoIl: z.string(),
});

export const AddressSchema = z.object({
  id: z.number(),
  tipoIndirizzo: Ref,
  nazione: Ref,
  regione: Ref.nullable(),
  provincia: Ref.extend({ sigla: z.string().nullable() }).nullable(),
  localita: Ref,
  indirizzo: z.string(),
  cap: z.string().nullable(),
  telefono: z.string().nullable(),
  principale: z.boolean(),
  latitudine: z.number().nullable(),
  longitudine: z.number().nullable(),
});

export const SupplierGeneralSchema = z.object({
  id: z.number(),
  versione: z.string(),
  aggiornatoIl: z.string(),
  master: z.object({
    ragioneSociale: z.string(),
    partitaIva: z.string().nullable(),
    partitaIvaCee: z.string().nullable(),
    codiceFiscale: z.string().nullable(),
    telefono: z.string().nullable(),
    fax: z.string().nullable(),
    codAccorpamento: z.string().nullable(),
    sostituitoDa: z.object({ id: z.number(), ragioneSociale: z.string() }).nullable(),
    sincronizzatoIl: z.string().nullable(),
  }),
  dati: z.object({
    denominazioneSociale: z.string().nullable(),
    sedeLegale: z.string().nullable(),
    dataInizioAttivita: z.string().nullable(),
    dataInizioRapporto: z.string().nullable(),
    dataFineRapporto: z.string().nullable(),
    responsabileCodice: z.string().nullable(),
    uf: z.string().nullable(),
    email: z.string().nullable(),
    emailPec: z.string().nullable(),
    numeroRea: z.string().nullable(),
    sitoWeb: z.string().nullable(),
  }),
  operaConSubfornitori: z.boolean(),
  stati: z.array(
    z.object({ id: z.number(), statoId: z.number(), descrizione: z.string(), dataDa: z.string(), corrente: z.boolean() }),
  ),
  indirizzi: z.array(AddressSchema),
  enti: z.array(
    z.object({
      enteId: z.number(),
      descrizione: z.string(),
      autorizzato: z.boolean(),
      /** Valorizzata solo per gli enti su cui l'utente è abilitato */
      valutazioneGenerale: z.number().nullable(),
    }),
  ),
  codiciApplicativi: z.array(z.object({ applicativo: z.string(), codice: z.string() })),
  marchi: z.array(z.object({ marchio: z.string(), divisione: z.string().nullable() })),
  preferito: z.boolean(),
});

export const UpdateGeneralBody = z
  .object({
    versione: z.string().min(1),
    denominazioneSociale: optText(255),
    sedeLegale: optText(500),
    dataInizioAttivita: optDate,
    dataInizioRapporto: optDate,
    dataFineRapporto: optDate,
    uf: optText(30),
    email: optEmail,
    emailPec: optEmail,
    numeroRea: optText(30),
    sitoWeb: optText(500),
  })
  .refine((v) => !v.dataInizioRapporto || !v.dataFineRapporto || v.dataFineRapporto >= v.dataInizioRapporto, {
    message: 'La fine del rapporto non può precedere l’inizio',
    path: ['dataFineRapporto'],
  });
export type UpdateGeneral = z.infer<typeof UpdateGeneralBody>;

export const AddStateBody = z.object({
  statoId: z.number().int().positive(),
  dataDa: z.iso.date({ message: 'Data non valida (AAAA-MM-GG)' }),
});

export const AddAddressBody = z.object({
  tipoIndirizzoId: z.number().int().positive(),
  localitaId: z.number().int().positive(),
  indirizzo: z.string().trim().min(1, 'Indica l’indirizzo').max(255),
  cap: optText(10).optional().default(null),
  telefono: optText(40).optional().default(null),
  principale: z.boolean().default(false),
});
export type AddAddress = z.infer<typeof AddAddressBody>;

export const CreatedSchema = z.object({ id: z.number() });

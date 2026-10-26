import { z } from 'zod';

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
const optId = z.number().int().positive().nullable();
const optAmount = z.number().nonnegative({ message: 'Il valore non può essere negativo' }).nullable();

const Ref = z.object({ id: z.number(), descrizione: z.string() });

// ---------------------------------------------------------------- struttura
export const StrutturaSchema = z.object({
  /** null se la struttura non è mai stata compilata */
  versione: z.string().nullable(),
  capitaleSociale: z.number().nullable(),
  capitaleSocialeValuta: Ref.nullable(),
  capitaleVersato: z.number().nullable(),
  capitaleVersatoValuta: Ref.nullable(),
  numeroAddetti: z.number().nullable(),
  notaNumeroAddetti: z.string().nullable(),
  immobileMq: z.number().nullable(),
  tipoImmobile: Ref.nullable(),
  tipologiaOfferta: z.string().nullable(),
  quotaMercatoPrc: z.number().nullable(),
  quotaMercatoDescrizione: z.string().nullable(),
});

export const UpdateStrutturaBody = z
  .object({
    versione: z.string().nullable(),
    capitaleSociale: optAmount,
    capitaleSocialeValutaId: optId,
    numeroAddetti: z.number().int().nonnegative().nullable(),
    notaNumeroAddetti: optText(500),
    immobileMq: optAmount,
    tipoImmobileId: optId,
    tipologiaOfferta: optText(500),
    quotaMercatoPrc: z.number().min(0).max(100, { message: 'La percentuale deve essere tra 0 e 100' }).nullable(),
    quotaMercatoDescrizione: optText(500),
  })
  .refine((v) => v.capitaleSociale == null || v.capitaleSocialeValutaId != null, {
    message: 'Indica la valuta del capitale sociale',
    path: ['capitaleSocialeValutaId'],
  });
export type UpdateStruttura = z.infer<typeof UpdateStrutturaBody>;

// ------------------------------------------------------------ interlocutori
export const InterlocutoreSchema = z.object({
  id: z.number(),
  tipoInterlocutore: Ref.nullable(),
  nominativo: z.string(),
  email: z.string().nullable(),
  telefono: z.string().nullable(),
  cellulare: z.string().nullable(),
});

export const InterlocutoreBody = z.object({
  tipoInterlocutoreId: optId,
  nominativo: z.string().trim().min(1, 'Indica il nominativo').max(200),
  email: optEmail,
  telefono: optText(40),
  cellulare: optText(40),
});
export type InterlocutoreInput = z.infer<typeof InterlocutoreBody>;

// ------------------------------------------------------------- subfornitori
export const SubfornitoreSchema = z.object({
  id: z.number(),
  ragioneSociale: z.string(),
  partitaIva: z.string().nullable(),
  partitaIvaCee: z.string().nullable(),
  codiceFiscale: z.string().nullable(),
  nazione: Ref.nullable(),
  provincia: Ref.extend({ sigla: z.string().nullable() }).nullable(),
  localita: z.string().nullable(),
  indirizzo: z.string().nullable(),
  cap: z.string().nullable(),
  telefono: z.string().nullable(),
  numeroAddetti: z.number().nullable(),
  referenti: z.string().nullable(),
  ente: Ref.nullable(),
  fornitoreAlbo: z.object({ id: z.number(), ragioneSociale: z.string() }).nullable(),
});

export const SubfornitoreBody = z.object({
  ragioneSociale: z.string().trim().min(1, 'Indica la ragione sociale').max(255),
  partitaIva: optText(20),
  partitaIvaCee: optText(20),
  codiceFiscale: optText(20),
  nazioneId: optId,
  provinciaId: optId,
  localita: optText(150),
  indirizzo: optText(255),
  cap: optText(10),
  telefono: optText(40),
  numeroAddetti: z.number().int().nonnegative().nullable(),
  referenti: optText(500),
  enteId: optId,
  fornitoreAlboId: optId,
});
export type SubfornitoreInput = z.infer<typeof SubfornitoreBody>;

// ------------------------------------------------------------- collegamenti
export const TipoCollegamento = z.enum(['CONSOLIDATO', 'ALTERNATIVO', 'PADRE_FIGLIO']);

export const CollegamentoSchema = z.object({
  id: z.number(),
  tipo: TipoCollegamento,
  /** Lettura dal punto di vista del fornitore corrente */
  relazione: z.enum(['CONSOLIDA', 'CONSOLIDATO_IN', 'HA_ALTERNATIVO', 'ALTERNATIVO_DI', 'STESSA_AZIENDA']),
  attivo: z.boolean(),
  fornitore: z.object({ id: z.number(), ragioneSociale: z.string(), stato: z.string().nullable(), attivo: z.boolean() }),
});

export const CollegamentoBody = z.object({
  tipo: TipoCollegamento,
  altroFornitoreId: z.number().int().positive(),
});

export const SocietaSchema = z.object({
  struttura: StrutturaSchema,
  interlocutori: z.array(InterlocutoreSchema),
  subfornitori: z.array(SubfornitoreSchema),
  collegamenti: z.array(CollegamentoSchema),
});

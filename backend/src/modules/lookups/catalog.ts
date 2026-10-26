/**
 * Liste di valori gestite dall'applicazione. Il nome della tabella viene SOLO da qui,
 * mai dall'input: per questo può essere inserito nel testo delle query.
 * Tutte le tabelle hanno la stessa forma (common.lookup_template).
 */
export const LOOKUPS = {
  applicativi: { table: 'ref.applicativo', it: 'Sistemi esterni', en: 'External systems' },
  marchi: { table: 'ref.marchio', it: 'Marchi', en: 'Brands' },
  enti: { table: 'ref.ente', it: 'Enti', en: 'Business units' },
  'stati-fornitore': { table: 'ref.stato_fornitore', it: 'Stati del fornitore', en: 'Supplier statuses' },
  'classi-merceologiche': { table: 'ref.classe_merceologica', it: 'Classi merceologiche', en: 'Commodity classes' },
  'tipi-indirizzo': { table: 'ref.tipo_indirizzo', it: 'Tipi di indirizzo', en: 'Address types' },
  'tipi-interlocutore': { table: 'ref.tipo_interlocutore', it: 'Ruoli degli interlocutori', en: 'Contact roles' },
  'tipi-immobile': { table: 'ref.tipo_immobile', it: 'Tipi di immobile', en: 'Premises types' },
  valute: { table: 'ref.valuta', it: 'Valute', en: 'Currencies' },
} as const;

export type LookupName = keyof typeof LOOKUPS;
export const isLookupName = (n: string): n is LookupName => Object.hasOwn(LOOKUPS, n);

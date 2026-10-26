export type Lingua = 'IT' | 'EN';

export interface Me {
  id: number;
  username: string;
  nome: string;
  cognome: string;
  email: string | null;
  lingua: Lingua;
  permessi: { lettura: boolean; scrittura: boolean };
  funzioni: string[];
}

export interface MenuNode {
  codice: string;
  descrizione: string;
  route: string | null;
  figli: MenuNode[];
}

export interface Item {
  id: number;
  codice: string | null;
  descrizione: string;
}

export interface Ref {
  id: number;
  descrizione: string;
}

export interface SupplierSummary {
  id: number;
  ragioneSociale: string;
  partitaIva: string | null;
  partitaIvaCee: string | null;
  codiceFiscale: string | null;
  email: string | null;
  codiciEsterni: string | null;
  stato: string | null;
  attivo: boolean;
  preferito: boolean;
}

export interface SearchResult {
  totale: number;
  pagina: number;
  limite: number;
  risultati: SupplierSummary[];
}

export interface SupplierHeader {
  id: number;
  ragioneSociale: string;
  denominazioneSociale: string | null;
  sedeLegale: string | null;
  stato: string | null;
  attivo: boolean;
  preferito: boolean;
  aggiornatoIl: string;
}

export interface Address {
  id: number;
  tipoIndirizzo: Ref;
  nazione: Ref;
  regione: Ref | null;
  provincia: (Ref & { sigla: string | null }) | null;
  localita: Ref;
  indirizzo: string;
  cap: string | null;
  telefono: string | null;
  principale: boolean;
  latitudine: number | null;
  longitudine: number | null;
}

export interface GeneralData {
  denominazioneSociale: string | null;
  sedeLegale: string | null;
  dataInizioAttivita: string | null;
  dataInizioRapporto: string | null;
  dataFineRapporto: string | null;
  responsabileCodice: string | null;
  uf: string | null;
  email: string | null;
  emailPec: string | null;
  numeroRea: string | null;
  sitoWeb: string | null;
}

export interface SupplierGeneral {
  id: number;
  versione: string;
  aggiornatoIl: string;
  master: {
    ragioneSociale: string;
    partitaIva: string | null;
    partitaIvaCee: string | null;
    codiceFiscale: string | null;
    telefono: string | null;
    fax: string | null;
    codAccorpamento: string | null;
    sostituitoDa: { id: number; ragioneSociale: string } | null;
    sincronizzatoIl: string | null;
  };
  dati: GeneralData;
  operaConSubfornitori: boolean;
  stati: { id: number; statoId: number; descrizione: string; dataDa: string; corrente: boolean }[];
  indirizzi: Address[];
  enti: { enteId: number; descrizione: string; autorizzato: boolean; valutazioneGenerale: number | null }[];
  codiciApplicativi: { id: number; applicativoId: number; applicativo: string; codice: string }[];
  marchi: { id: number; marchioId: number; marchio: string; divisione: string | null }[];
  preferito: boolean;
}

/** Campi identificativi modificabili */
export interface Identita {
  ragioneSociale: string;
  partitaIva: string | null;
  partitaIvaCee: string | null;
  codiceFiscale: string | null;
  telefono: string | null;
}

export type UpdateGeneral = Omit<GeneralData, 'responsabileCodice'> &
  Identita & { fax: string | null; versione: string; confermaDuplicato?: boolean };

export type NewSupplier = Identita & { email: string | null; confermaDuplicato?: boolean };

/** details dell'errore 409 POSSIBILE_DUPLICATO */
export interface DuplicateDetails {
  fornitori: { id: number; ragioneSociale: string }[];
}

// ------------------------------------------------------------ modulo 2: società
export interface Struttura {
  versione: string | null;
  capitaleSociale: number | null;
  capitaleSocialeValuta: Ref | null;
  capitaleVersato: number | null;
  capitaleVersatoValuta: Ref | null;
  numeroAddetti: number | null;
  notaNumeroAddetti: string | null;
  immobileMq: number | null;
  tipoImmobile: Ref | null;
  tipologiaOfferta: string | null;
  quotaMercatoPrc: number | null;
  quotaMercatoDescrizione: string | null;
}

export interface Interlocutore {
  id: number;
  tipoInterlocutore: Ref | null;
  nominativo: string;
  email: string | null;
  telefono: string | null;
  cellulare: string | null;
}

export interface Subfornitore {
  id: number;
  ragioneSociale: string;
  partitaIva: string | null;
  partitaIvaCee: string | null;
  codiceFiscale: string | null;
  nazione: Ref | null;
  provincia: (Ref & { sigla: string | null }) | null;
  localita: string | null;
  indirizzo: string | null;
  cap: string | null;
  telefono: string | null;
  numeroAddetti: number | null;
  referenti: string | null;
  ente: Ref | null;
  fornitoreAlbo: { id: number; ragioneSociale: string } | null;
}

export type TipoCollegamento = 'CONSOLIDATO' | 'ALTERNATIVO' | 'PADRE_FIGLIO';
export type Relazione = 'CONSOLIDA' | 'CONSOLIDATO_IN' | 'HA_ALTERNATIVO' | 'ALTERNATIVO_DI' | 'STESSA_AZIENDA';

export interface Collegamento {
  id: number;
  tipo: TipoCollegamento;
  relazione: Relazione;
  attivo: boolean;
  fornitore: { id: number; ragioneSociale: string; stato: string | null; attivo: boolean };
}

export interface Societa {
  struttura: Struttura;
  interlocutori: Interlocutore[];
  subfornitori: Subfornitore[];
  collegamenti: Collegamento[];
}

// ------------------------------------------------------- liste di valori (admin)
export interface ListaValori {
  nome: string;
  descrizione: string;
}
export interface VoceLista {
  id: number;
  codice: string | null;
  descrizioneIt: string;
  descrizioneEn: string | null;
  ordine: number;
  attivo: boolean;
}

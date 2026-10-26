/** Contesto dell'utente autenticato (ex UserState / Session("IGPSESS")). */
export interface UserContext {
  id: number;
  username: string;
  nome: string;
  cognome: string;
  email: string | null;
  lingua: 'IT' | 'EN';
  canRead: boolean;
  canWrite: boolean;
  /** Codici delle funzioni abilitate tramite i gruppi */
  funzioni: string[];
  /** Enti su cui l'utente è abilitato */
  enti: number[];
}

/** Nome utente normalizzato: senza spazi ai lati e in minuscolo. */
export const normalizeUsername = (raw: string) => raw.trim().toLowerCase();

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

/** Identità verificata dal token, prima di risolverla su iam.utente */
export interface Identity {
  subject: string;
  username: string;
  /** true se il subject proviene da un IdP reale e va legato all'utente al primo login */
  bindSubject: boolean;
}

/**
 * Normalizza l'identità come faceva il legacy (DOMINIO\utente -> utente),
 * con in più l'opzione di togliere il dominio da un UPN (utente@azienda.it -> utente).
 */
export function normalizeUsername(raw: string, stripUpnDomain: boolean): string {
  let u = raw.trim().toLowerCase();
  const backslash = u.lastIndexOf('\\');
  if (backslash >= 0) u = u.slice(backslash + 1);
  if (stripUpnDomain) {
    const at = u.indexOf('@');
    if (at > 0) u = u.slice(0, at);
  }
  return u;
}

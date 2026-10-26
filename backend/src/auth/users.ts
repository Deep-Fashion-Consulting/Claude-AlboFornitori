import type { Queryable } from '../db.js';
import type { Identity, UserContext } from './context.js';

interface UserRow {
  id: number;
  username: string;
  nome: string;
  cognome: string;
  email: string | null;
  lingua: 'IT' | 'EN';
  flag_lettura: boolean;
  flag_scrittura: boolean;
  attivo: boolean;
  oidc_subject: string | null;
  funzioni: string[];
  enti: number[];
}

export type ResolvedUser = UserContext & { attivo: boolean; oidcSubject: string | null };

/**
 * Risolve l'identità su iam.utente: prima per subject OIDC già legato,
 * poi per username (utenti migrati dal legacy che non hanno ancora fatto login).
 * Un username già legato a un altro subject non viene riassegnato.
 */
export async function findUser(db: Queryable, identity: Identity): Promise<ResolvedUser | null> {
  const { rows } = await db.query<UserRow>(
    `SELECT u.id, u.username, u.nome, u.cognome, u.email, u.lingua,
            u.flag_lettura, u.flag_scrittura, u.attivo, u.oidc_subject,
            COALESCE((SELECT array_agg(DISTINCT vf.codice) FROM iam.v_utente_funzione vf
                       WHERE vf.utente_id = u.id AND vf.livello = 'FUNZIONE'), '{}') AS funzioni,
            COALESCE((SELECT array_agg(ue.ente_id ORDER BY ue.ente_id) FROM iam.utente_ente ue
                       WHERE ue.utente_id = u.id), '{}') AS enti
       FROM iam.utente u
      WHERE u.oidc_subject = $1
         OR (u.username = $2 AND (u.oidc_subject IS NULL OR NOT $3))
      ORDER BY (u.oidc_subject = $1) DESC NULLS LAST
      LIMIT 1`,
    [identity.subject, identity.username, identity.bindSubject],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    username: r.username,
    nome: r.nome,
    cognome: r.cognome,
    email: r.email,
    lingua: r.lingua,
    canRead: r.flag_lettura,
    canWrite: r.flag_scrittura,
    funzioni: r.funzioni,
    enti: r.enti,
    attivo: r.attivo,
    oidcSubject: r.oidc_subject,
  };
}

/** Piccola cache in memoria per non rileggere permessi ed enti a ogni richiesta. */
export class UserCache {
  private entries = new Map<string, { user: ResolvedUser; expires: number }>();
  constructor(private readonly ttlMs = 30_000) {}

  get(key: string): ResolvedUser | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (e.expires < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return e.user;
  }
  set(key: string, user: ResolvedUser) {
    this.entries.set(key, { user, expires: Date.now() + this.ttlMs });
  }
  invalidateUser(userId: number) {
    for (const [k, e] of this.entries) if (e.user.id === userId) this.entries.delete(k);
  }
}

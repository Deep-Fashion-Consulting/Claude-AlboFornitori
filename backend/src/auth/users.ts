import type { Queryable } from '../db.js';
import type { UserContext } from './context.js';

interface UserRow {
  id: number;
  username: string;
  nome: string;
  cognome: string;
  email: string | null;
  lingua: 'IT' | 'EN';
  flag_lettura: boolean;
  flag_scrittura: boolean;
  funzioni: string[];
  enti: number[];
}

/** Carica un utente attivo con funzioni ed enti abilitati; null se non esiste o è disattivato. */
export async function loadActiveUser(db: Queryable, userId: number): Promise<UserContext | null> {
  const { rows } = await db.query<UserRow>(
    `SELECT u.id, u.username, u.nome, u.cognome, u.email, u.lingua, u.flag_lettura, u.flag_scrittura,
            COALESCE((SELECT array_agg(DISTINCT vf.codice) FROM iam.v_utente_funzione vf
                       WHERE vf.utente_id = u.id AND vf.livello = 'FUNZIONE'), '{}') AS funzioni,
            COALESCE((SELECT array_agg(ue.ente_id ORDER BY ue.ente_id) FROM iam.utente_ente ue
                       WHERE ue.utente_id = u.id), '{}') AS enti
       FROM iam.utente u
      WHERE u.id = $1 AND u.attivo`,
    [userId],
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
  };
}

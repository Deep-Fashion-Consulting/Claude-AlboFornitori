import { createHash, randomBytes } from 'node:crypto';
import type { Queryable } from '../db.js';

export const SESSION_COOKIE = 'albo_sessione';

export interface SessionSettings {
  idleMinutes: number;
  maxHours: number;
  secureCookie: boolean;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Crea una sessione e restituisce il token da mettere nel cookie (nel database va solo l'hash). */
export async function createSession(
  db: Queryable,
  userId: number,
  s: SessionSettings,
  meta: { ip?: string; userAgent?: string },
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.query('DELETE FROM iam.sessione WHERE scade_il < now()');
  await db.query(
    `INSERT INTO iam.sessione (token_hash, utente_id, scade_il, ip, user_agent)
     VALUES ($1, $2, now() + make_interval(hours => $3), $4, $5)`,
    [hashToken(token), userId, s.maxHours, meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null],
  );
  return token;
}

/**
 * Restituisce l'utente della sessione se è valida: non scaduta e usata entro il tempo di inattività.
 * Ogni uso ne aggiorna l'ultimo accesso.
 */
export async function useSession(db: Queryable, token: string, s: SessionSettings): Promise<number | null> {
  const { rows } = await db.query<{ utente_id: number }>(
    `UPDATE iam.sessione SET ultimo_uso_il = now()
      WHERE token_hash = $1
        AND scade_il > now()
        AND ultimo_uso_il > now() - make_interval(mins => $2)
      RETURNING utente_id`,
    [hashToken(token), s.idleMinutes],
  );
  return rows[0]?.utente_id ?? null;
}

export async function deleteSession(db: Queryable, token: string) {
  await db.query('DELETE FROM iam.sessione WHERE token_hash = $1', [hashToken(token)]);
}

/** Dopo un cambio password si chiudono tutte le altre sessioni dell'utente. */
export async function deleteOtherSessions(db: Queryable, userId: number, keepToken: string) {
  await db.query('DELETE FROM iam.sessione WHERE utente_id = $1 AND token_hash <> $2', [userId, hashToken(keepToken)]);
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** Cookie di sessione: non leggibile da JavaScript, inviato solo dal nostro sito. */
export function sessionCookie(token: string, s: SessionSettings): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${s.maxHours * 3600}`,
    ...(s.secureCookie ? ['Secure'] : []),
  ].join('; ');
}

export function clearedSessionCookie(s: SessionSettings): string {
  return [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0', ...(s.secureCookie ? ['Secure'] : [])].join('; ');
}

import type { Queryable } from './db.js';
import type { UserContext } from './auth/context.js';

export interface AuditEntry {
  azione: string;
  entita?: string;
  entitaId?: string | number;
  fornitoreId?: number;
  dettagli?: unknown;
}

export interface RequestMeta {
  ip?: string;
  correlationId?: string;
}

/** Scrive una riga in audit.log (ex ScriviLogApplicativo). */
export async function audit(
  db: Queryable,
  user: Pick<UserContext, 'id' | 'username'> | null,
  entry: AuditEntry,
  meta: RequestMeta = {},
): Promise<void> {
  await db.query(
    `INSERT INTO audit.log (utente_id, username, azione, entita, entita_id, fornitore_id, ip, correlation_id, dettagli)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      user?.id ?? null,
      user?.username ?? null,
      entry.azione,
      entry.entita ?? null,
      entry.entitaId != null ? String(entry.entitaId) : null,
      entry.fornitoreId ?? null,
      meta.ip ?? null,
      meta.correlationId ?? null,
      entry.dettagli != null ? JSON.stringify(entry.dettagli) : null,
    ],
  );
}

/** Restituisce solo i campi cambiati, nella forma { campo: { prima, dopo } }. */
export function diff<T extends Record<string, unknown>>(prima: T, dopo: Partial<T>) {
  const changes: Record<string, { prima: unknown; dopo: unknown }> = {};
  for (const key of Object.keys(dopo)) {
    if (prima[key] !== dopo[key]) changes[key] = { prima: prima[key], dopo: dopo[key] };
  }
  return changes;
}

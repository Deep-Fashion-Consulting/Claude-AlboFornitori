import type { Queryable } from '../db.js';
import type { UserContext } from './context.js';
import { forbidden } from '../errors.js';

/** La funzione di menu deve essere abilitata all'utente (controllo lato server, spec. 30.3). */
export function requireFunction(user: UserContext, codice: string) {
  if (!user.funzioni.includes(codice)) {
    throw forbidden('FUNZIONE_NON_ABILITATA', 'Non hai accesso a questa funzione');
  }
}

/** CanReadSupplier: accesso ai dati (ex flag READ). */
export function requireRead(user: UserContext) {
  if (!user.canRead) throw forbidden('LETTURA_NON_ABILITATA', 'Non hai accesso in lettura ai dati dei fornitori');
}

/** CanEditSupplier: aggiornamento dati (ex flag READ_WRITE). */
export function requireWrite(user: UserContext) {
  if (!user.canWrite) {
    throw forbidden('SCRITTURA_NON_ABILITATA', 'Non hai i permessi per modificare i dati dei fornitori');
  }
}

/** Enti del fornitore su cui l'utente è abilitato (ex VIEW_ABILITAZIONI_UTENTE_ENTI_FORNITORI). */
export async function authorizedEntities(db: Queryable, userId: number, fornitoreId: number): Promise<number[]> {
  const { rows } = await db.query<{ ente_id: number }>(
    `SELECT ente_id FROM iam.v_utente_ente_fornitore WHERE utente_id = $1 AND fornitore_id = $2 ORDER BY ente_id`,
    [userId, fornitoreId],
  );
  return rows.map((r) => r.ente_id);
}

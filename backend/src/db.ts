import pg from 'pg';

// DATE (1082) come stringa 'YYYY-MM-DD': evita gli slittamenti di fuso orario di new Date().
pg.types.setTypeParser(1082, (v) => v);
// BIGINT (20): gli id restano entro Number.MAX_SAFE_INTEGER, li esponiamo come numeri.
pg.types.setTypeParser(20, (v) => Number(v));
// NUMERIC (1700) resta stringa: gli importi non devono perdere precisione.

export type Db = pg.Pool;
export type Queryable = pg.Pool | pg.PoolClient;

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
}

/** Esegue fn in una transazione: commit se va a buon fine, rollback su qualsiasi errore. */
export async function withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

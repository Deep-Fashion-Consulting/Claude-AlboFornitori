import assert from 'node:assert/strict';

/**
 * Verifica che `actual` contenga almeno le proprietà di `expected` con gli stessi valori
 * (confronto parziale ricorsivo, come toMatchObject di Jest/Vitest).
 */
export function assertMatch(actual: unknown, expected: unknown, path = 'valore'): void {
  if (expected === null || typeof expected !== 'object') {
    assert.deepEqual(actual, expected, `${path}: atteso ${JSON.stringify(expected)}, trovato ${JSON.stringify(actual)}`);
    return;
  }
  assert.ok(actual !== null && typeof actual === 'object', `${path}: atteso un oggetto, trovato ${JSON.stringify(actual)}`);
  for (const [key, value] of Object.entries(expected)) {
    assertMatch((actual as Record<string, unknown>)[key], value, `${path}.${key}`);
  }
}

import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

/** Applicazione di test con login di sviluppo e funzione `call(utente, metodo, url, body)`. */
export async function createTestApp(url: string) {
  const pool = new pg.Pool({ connectionString: url });
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: url,
    AUTH_MODE: 'dev',
    DEV_AUTH_SECRET: 'segreto-di-test-lungo-almeno-trentadue-caratteri',
    LOG_LEVEL: 'silent',
  });
  const app: FastifyInstance = await buildApp({ config, pool, logger: false });
  const tokens: Record<string, string> = {};
  for (const u of ['admin', 'mrossi', 'lbianchi']) {
    tokens[u] = (await app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: { username: u } })).json().token;
  }
  const call = (user: string, method: string, path: string, payload?: unknown) =>
    app.inject({ method: method as 'GET', url: path, payload: payload as object, headers: { authorization: `Bearer ${tokens[user]}` } });
  const close = async () => {
    await app.close();
    await pool.end();
  };
  return { app, pool, call, close };
}

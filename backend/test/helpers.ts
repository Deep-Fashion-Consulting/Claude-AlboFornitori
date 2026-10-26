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

export const DEV_PASSWORD = 'Prova2026!';

/** Estrae il cookie di sessione dalla risposta del login. */
export const sessionFrom = (setCookie: string | string[] | undefined) =>
  String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0]!;

/** Applicazione di test con gli utenti di prova già autenticati e `call(utente, metodo, url, body)`. */
export async function createTestApp(url: string, users = ['admin', 'mrossi', 'lbianchi']) {
  const pool = new pg.Pool({ connectionString: url });
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: url, LOG_LEVEL: 'silent' });
  const app: FastifyInstance = await buildApp({ config, pool, logger: false });
  const cookies: Record<string, string> = {};
  const login = async (username: string, password = DEV_PASSWORD) =>
    app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });
  for (const u of users) {
    const res = await login(u);
    if (res.statusCode !== 200) throw new Error(`Login di prova fallito per ${u}: ${res.body}`);
    cookies[u] = sessionFrom(res.headers['set-cookie']);
  }
  const call = (user: string | null, method: string, path: string, payload?: unknown) =>
    app.inject({
      method: method as 'GET',
      url: path,
      payload: payload as object,
      headers: user ? { cookie: cookies[user]! } : {},
    });
  const close = async () => {
    await app.close();
    await pool.end();
  };
  return { app, pool, call, close, login, cookies };
}

/**
 * Id di nazioni, province, comuni e valute, cercati per codice: dipendono dall'ordine di caricamento
 * e non sono gli stessi in tutti i database.
 */
export async function geoIds(pool: pg.Pool) {
  const one = async (sql: string, v: string) => (await pool.query(sql, [v])).rows[0]!.id as number;
  const nazione = (iso: string) => one('SELECT id FROM ref.nazione WHERE iso2 = $1', iso);
  const provincia = (sigla: string) => one('SELECT id FROM ref.provincia WHERE sigla = $1', sigla);
  const comune = (catastale: string) => one('SELECT id FROM ref.localita WHERE codice = $1', catastale);
  const valuta = (codice: string) => one('SELECT id FROM ref.valuta WHERE codice = $1', codice);
  return {
    IT: await nazione('IT'),
    FR: await nazione('FR'),
    DE: await nazione('DE'),
    FI: await provincia('FI'),
    AR: await provincia('AR'),
    FM: await provincia('FM'),
    TO: await provincia('TO'),
    milano: await comune('F205'),
    EUR: await valuta('EUR'),
  };
}

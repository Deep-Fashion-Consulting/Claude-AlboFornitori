import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Hash delle password con scrypt (incluso in Node, raccomandato da OWASP).
 * Formato salvato: scrypt$N$r$p$sale$hash (sale e hash in base64).
 * I parametri sono nella stringa: se in futuro si alzano, le password vecchie restano verificabili.
 */
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;

export const PASSWORD_MIN_LENGTH = 10;

function derive(password: string, salt: Buffer, opts: { N: number; r: number; p: number }): Promise<Buffer> {
  const options: ScryptOptions = { ...opts, maxmem: 128 * opts.N * opts.r * 2 };
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFC'), salt, KEYLEN, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Hash fittizio: si verifica anche quando l'utente non esiste, così i tempi di risposta non rivelano chi esiste. */
export const DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'));

/** Regole minime della password; restituisce il messaggio di errore oppure null. */
export function passwordProblem(password: string, username: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `La password deve avere almeno ${PASSWORD_MIN_LENGTH} caratteri`;
  if (password.toLowerCase().includes(username.toLowerCase())) return 'La password non può contenere il nome utente';
  return null;
}

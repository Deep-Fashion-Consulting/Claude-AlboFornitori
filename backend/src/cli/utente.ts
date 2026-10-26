/**
 * Gestione utenti da riga di comando, da usare sul server.
 *
 *   npm run utente -- crea-admin <username> <nome> <cognome>     (sul server, dopo la build)
 *   npm run utente -- password <username>
 *   npm run utente:dev -- ...                                     (in sviluppo, senza build)
 *
 * La password viene chiesta a video (due volte) e non compare nella cronologia dei comandi.
 */
import { loadConfig } from '../config.js';
import { createPool } from '../db.js';
import { normalizeUsername } from '../auth/context.js';
import { hashPassword, passwordProblem } from '../auth/password.js';

/** Input da file o da pipe: si legge tutto una volta e si restituisce una riga per domanda. */
let pipedLines: Promise<string[]> | null = null;
async function nextPipedLine(): Promise<string> {
  pipedLines ??= new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data.split(/\r?\n/)));
  });
  const lines = await pipedLines;
  if (lines.length === 0) throw new Error('Input terminato: password non fornita');
  return lines.shift()!;
}

/**
 * Chiede una riga senza mostrare a schermo quello che si scrive.
 * Nel terminale legge i tasti uno alla volta; se l'input arriva da un file o da una pipe, legge la riga e basta.
 */
function askHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  process.stdout.write(question);
  if (!stdin.isTTY) {
    return nextPipedLine().then((line) => {
      process.stdout.write('\n');
      return line;
    });
  }
  return new Promise((resolve) => {
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          // Ctrl+C
          stdin.setRawMode(false);
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else if (ch >= ' ') value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function askPassword(username: string): Promise<string> {
  for (;;) {
    const p1 = await askHidden('Nuova password: ');
    const problem = passwordProblem(p1, username);
    if (problem) {
      console.log(`  ${problem}.`);
      continue;
    }
    const p2 = await askHidden('Ripeti la password: ');
    if (p1 === p2) return p1;
    console.log('  Le due password non coincidono.');
  }
}

async function main() {
  const [cmd, rawUser, nome, cognome] = process.argv.slice(2);
  if (!cmd || !rawUser || (cmd === 'crea-admin' && (!nome || !cognome)) || !['crea-admin', 'password'].includes(cmd)) {
    console.log('Uso:\n  npm run utente -- crea-admin <username> <nome> <cognome>\n  npm run utente -- password <username>');
    process.exit(1);
  }
  const username = normalizeUsername(rawUser);
  const db = createPool(loadConfig().DATABASE_URL);
  try {
    const existing = await db.query('SELECT id FROM iam.utente WHERE username = $1', [username]);
    if (cmd === 'crea-admin' && existing.rowCount) throw new Error(`L'utente "${username}" esiste già`);
    if (cmd === 'password' && !existing.rowCount) throw new Error(`L'utente "${username}" non esiste`);

    const hash = await hashPassword(await askPassword(username));

    if (cmd === 'crea-admin') {
      const { rows } = await db.query(
        `INSERT INTO iam.utente (username, nome, cognome, flag_lettura, flag_scrittura, password_hash, password_cambiata_il)
         VALUES ($1, $2, $3, true, true, $4, now()) RETURNING id`,
        [username, nome, cognome, hash],
      );
      const id = rows[0].id;
      const gruppo = await db.query(
        `INSERT INTO iam.utente_gruppo (utente_id, gruppo_id) SELECT $1, id FROM iam.gruppo WHERE codice = 'AMMINISTRAZIONE'`,
        [id],
      );
      await db.query('INSERT INTO iam.utente_ente (utente_id, ente_id) SELECT $1, id FROM ref.ente', [id]);
      console.log(`Amministratore "${username}" creato.`);
      if (!gruppo.rowCount) console.log('Attenzione: il gruppo AMMINISTRAZIONE non esiste, l\'utente non vede nessuna funzione.');
    } else {
      await db.query(
        `UPDATE iam.utente SET password_hash = $2, password_cambiata_il = now(), tentativi_falliti = 0, bloccato_fino_al = NULL
          WHERE username = $1`,
        [username, hash],
      );
      await db.query('DELETE FROM iam.sessione WHERE utente_id = $1', [existing.rows[0].id]);
      console.log(`Password di "${username}" impostata. Le sue sessioni aperte sono state chiuse.`);
    }
  } finally {
    await db.end();
  }
}

main().catch((err: Error) => {
  console.error(`Errore: ${err.message}`);
  process.exit(1);
});

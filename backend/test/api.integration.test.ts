/**
 * Test di integrazione: richiedono un database con migrazioni e seed di sviluppo.
 *   Windows (cmd):  set TEST_DATABASE_URL=postgres://albo:albo@localhost:5432/albo && npm test
 *   macOS/Linux:    TEST_DATABASE_URL=postgres://albo:albo@localhost:5432/albo npm test
 * Senza TEST_DATABASE_URL vengono saltati. I dati modificati vengono ripristinati alla fine.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { assertMatch } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
type Row = { id: number; descrizione: string; preferito: boolean; principale: boolean };
const ids = (body: { risultati: { id: number }[] }) => body.risultati.map((r) => r.id);

describe('API Albo fornitori', { skip: !url && 'TEST_DATABASE_URL non impostata' }, () => {
  let app: FastifyInstance;
  let pool: pg.Pool;
  const tokens: Record<string, string> = {};

  const call = (user: string | null, method: string, path: string, payload?: unknown) =>
    app.inject({
      method: method as 'GET',
      url: path,
      payload: payload as object,
      headers: user ? { authorization: `Bearer ${tokens[user]}` } : {},
    });

  before(async () => {
    pool = new pg.Pool({ connectionString: url });
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: url!,
      AUTH_MODE: 'dev',
      DEV_AUTH_SECRET: 'segreto-di-test-lungo-almeno-trentadue-caratteri',
      LOG_LEVEL: 'silent',
    });
    app = await buildApp({ config, pool, logger: false });
    for (const u of ['admin', 'mrossi', 'lbianchi', 'exutente', 'sconosciuto']) {
      const res = await app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: { username: u } });
      tokens[u] = res.json().token;
    }
  });

  after(async () => {
    // ripristina i dati toccati dai test
    await pool.query(`DELETE FROM albo.fornitore_stato WHERE fornitore_id = 1011 AND data_da = '2026-01-01'`);
    await pool.query(`DELETE FROM albo.fornitore_indirizzo WHERE fornitore_id = 1011 AND indirizzo LIKE 'Test %'`);
    await pool.query(`UPDATE albo.fornitore_indirizzo SET principale = true WHERE fornitore_id = 1011 AND indirizzo = 'Via Mecenate 76'`);
    await pool.query(`UPDATE albo.fornitore SET email = NULL, uf = 'ACQ-ACC' WHERE id = 1011`);
    await pool.query(`DELETE FROM albo.fornitore_preferito WHERE utente_id = 3`);
    await app.close();
    await pool.end();
  });

  describe('sessione e permessi', () => {
    it('senza token risponde 401', async () => {
      const res = await call(null, 'GET', '/api/me');
      assert.equal(res.statusCode, 401);
      assert.equal(res.json().code, 'NON_AUTENTICATO');
      assert.ok(res.headers['x-correlation-id']);
    });

    it('utente sconosciuto o disattivato: 403 e LOGIN_DENIED in audit', async () => {
      for (const u of ['sconosciuto', 'exutente']) {
        const res = await call(u, 'POST', '/api/session');
        assert.equal(res.statusCode, 403);
        assert.equal(res.json().code, 'UTENTE_NON_ABILITATO');
      }
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM audit.log WHERE azione = 'LOGIN_DENIED' AND dettagli->>'username' = 'sconosciuto'`,
      );
      assert.ok(rows[0].n > 0);
    });

    it('login registra LOGIN e restituisce permessi', async () => {
      const res = await call('lbianchi', 'POST', '/api/session');
      assert.equal(res.statusCode, 200);
      assertMatch(res.json(), { username: 'lbianchi', lingua: 'EN', permessi: { lettura: true, scrittura: false } });
    });

    it('il menu senza fornitore contiene solo ricerca e report', async () => {
      const menu = JSON.stringify((await call('mrossi', 'GET', '/api/menu')).json());
      assert.ok(menu.includes('FORNITORE_RICERCA'));
      assert.ok(!menu.includes('FORNITORE_ANAGRAFICA'));
      assert.ok(!menu.includes('UTENTI'));
    });

    it('le voci per ente compaiono solo con un ente autorizzato sul fornitore', async () => {
      const suo = JSON.stringify((await call('mrossi', 'GET', '/api/menu?fornitoreId=1001')).json());
      assert.ok(suo.includes('FORNITORE_VALUTAZIONE'));
      const altrui = JSON.stringify((await call('mrossi', 'GET', '/api/menu?fornitoreId=1007')).json());
      assert.ok(altrui.includes('FORNITORE_ANAGRAFICA'));
      assert.ok(!altrui.includes('FORNITORE_VALUTAZIONE'));
    });

    it('il menu è tradotto nella lingua dell’utente', async () => {
      const menu = JSON.stringify((await call('lbianchi', 'GET', '/api/menu')).json());
      assert.ok(menu.includes('Find suppliers'));
    });
  });

  describe('ricerca', () => {
    it('trova per nome senza accenti e maiuscole', async () => {
      const res = await call('mrossi', 'GET', '/api/fornitori?nome=CITTA%20DI');
      assert.equal(res.statusCode, 200);
      assert.deepEqual(ids(res.json()), [1001]);
    });

    it('ordina senza distinguere maiuscole e minuscole', async () => {
      const res = (await call('mrossi', 'GET', '/api/fornitori?nome=conceria')).json();
      assert.deepEqual(ids(res), [1002, 1003]); // "Conceria del…" prima di "Conceria Valdarno…"
    });

    it('filtra per codice SAP, stato e rapporto cessato', async () => {
      assert.equal((await call('mrossi', 'GET', '/api/fornitori?codiceSap=100377')).json().risultati[0].id, 1005);
      assert.deepEqual(ids((await call('mrossi', 'GET', '/api/fornitori?rapporto=cessati')).json()), [1004]);
    });

    it('filtra per provincia e per collegamenti padri/figli', async () => {
      assert.deepEqual(ids((await call('mrossi', 'GET', '/api/fornitori?provinciaId=2')).json()).sort(), [1002, 1003, 1004]);
      assert.deepEqual(ids((await call('mrossi', 'GET', '/api/fornitori?padriFigli=si')).json()).sort(), [1003, 1004]);
    });

    it('i preferiti sono per utente', async () => {
      const res = (await call('mrossi', 'GET', '/api/fornitori?soloPreferiti=true')).json();
      assert.equal(res.totale, 2);
      assert.ok(res.risultati.every((r: Row) => r.preferito));
    });

    it('non si può filtrare su enti non abilitati', async () => {
      const res = await call('mrossi', 'GET', '/api/fornitori?enti=2');
      assert.equal(res.statusCode, 403);
      assert.equal(res.json().code, 'ENTE_NON_AUTORIZZATO');
    });

    it('paginazione con totale', async () => {
      const res = (await call('admin', 'GET', '/api/fornitori?limite=5&pagina=2')).json();
      assert.equal(res.totale, 12);
      assert.equal(res.risultati.length, 5);
    });

    it('parametri non validi: 400 con dettagli', async () => {
      const res = await call('admin', 'GET', '/api/fornitori?inizioRapportoDa=31-12-2020');
      assert.equal(res.statusCode, 400);
      assert.equal(res.json().code, 'RICHIESTA_NON_VALIDA');
    });
  });

  describe('scheda anagrafica', () => {
    it('restituisce dati master, stati, indirizzi ed enti', async () => {
      const res = await call('mrossi', 'GET', '/api/fornitori/1001');
      assert.equal(res.statusCode, 200);
      const f = res.json();
      assert.equal(f.master.partitaIva, '05123450487');
      assertMatch(f.stati[0], { descrizione: 'Qualificato', corrente: true });
      assertMatch(f.indirizzi[0], { principale: true, provincia: { sigla: 'FI' } });
      assert.equal(f.operaConSubfornitori, true);
      assert.deepEqual(f.enti, [{ enteId: 1, descrizione: 'Pelletteria', autorizzato: true, valutazioneGenerale: 4 }]);
      assert.deepEqual(f.codiciApplicativi, [
        { applicativo: 'SAP', codice: '100045' },
        { applicativo: 'ST3', codice: 'ST-0045' },
      ]);
    });

    it('la valutazione per ente non è visibile a chi non è abilitato sull’ente', async () => {
      const f = (await call('lbianchi', 'GET', '/api/fornitori/1001')).json();
      assertMatch(f.enti[0], { autorizzato: false, valutazioneGenerale: null });
    });

    it('fornitore inesistente: 404', async () => {
      assert.equal((await call('mrossi', 'GET', '/api/fornitori/99999')).statusCode, 404);
    });

    it('aggiorna i dati con controllo di versione e audit', async () => {
      const f = (await call('mrossi', 'GET', '/api/fornitori/1011')).json();
      const body = { ...f.dati, versione: f.versione, email: 'acquisti@metallimilano.example', uf: 'ACQ-MET' };
      delete body.responsabileCodice;
      const ok = await call('mrossi', 'PUT', '/api/fornitori/1011', body);
      assert.equal(ok.statusCode, 200);
      assert.notEqual(ok.json().versione, f.versione);

      // stessa versione di prima: un altro utente ha già salvato
      const stale = await call('admin', 'PUT', '/api/fornitori/1011', body);
      assert.equal(stale.statusCode, 409);
      assert.equal(stale.json().code, 'MODIFICATO_DA_ALTRI');

      const { rows } = await pool.query(
        `SELECT dettagli FROM audit.log WHERE azione = 'SUPPLIER_GENERAL_UPDATE' AND fornitore_id = 1011 ORDER BY id DESC LIMIT 1`,
      );
      assert.deepEqual(rows[0].dettagli, {
        uf: { prima: 'ACQ-ACC', dopo: 'ACQ-MET' },
        email: { prima: null, dopo: 'acquisti@metallimilano.example' },
      });
    });

    it('valida e-mail e date incoerenti', async () => {
      const f = (await call('mrossi', 'GET', '/api/fornitori/1011')).json();
      const base = { ...f.dati, versione: f.versione };
      delete base.responsabileCodice;
      const email = await call('mrossi', 'PUT', '/api/fornitori/1011', { ...base, emailPec: 'non-una-mail' });
      assert.equal(email.statusCode, 400);
      const date = await call('mrossi', 'PUT', '/api/fornitori/1011', {
        ...base,
        dataInizioRapporto: '2020-01-01',
        dataFineRapporto: '2019-01-01',
      });
      assert.equal(date.statusCode, 400);
      assert.ok(JSON.stringify(date.json().details).includes('dataFineRapporto'));
    });

    it('un utente in sola lettura non può modificare', async () => {
      const res = await call('lbianchi', 'POST', '/api/fornitori/1011/stati', { statoId: 3, dataDa: '2026-01-01' });
      assert.equal(res.statusCode, 403);
      assert.equal(res.json().code, 'SCRITTURA_NON_ABILITATA');
    });

    it('aggiunge e rimuove uno stato; lo stato corrente segue la data', async () => {
      const add = await call('mrossi', 'POST', '/api/fornitori/1011/stati', { statoId: 3, dataDa: '2026-01-01' });
      assert.equal(add.statusCode, 201);
      const head = (await call('mrossi', 'GET', '/api/fornitori/1011/intestazione')).json();
      assert.equal(head.stato, 'Sospeso');
      assert.equal((await call('mrossi', 'DELETE', `/api/fornitori/1011/stati/${add.json().id}`)).statusCode, 204);
      // stato di un altro fornitore: 404, non lo cancella
      assert.equal((await call('mrossi', 'DELETE', '/api/fornitori/1011/stati/1')).statusCode, 404);
    });

    it('indirizzi: un solo principale, promozione alla cancellazione', async () => {
      const add = await call('mrossi', 'POST', '/api/fornitori/1011/indirizzi', {
        tipoIndirizzoId: 4,
        localitaId: 5,
        indirizzo: 'Test via Magazzino 1',
        cap: '',
        principale: true,
      });
      assert.equal(add.statusCode, 201);
      let f = (await call('mrossi', 'GET', '/api/fornitori/1011')).json();
      assert.equal(f.indirizzi.filter((i: Row) => i.principale).length, 1);
      assert.equal(f.indirizzi[0].indirizzo, 'Test via Magazzino 1');

      await call('mrossi', 'DELETE', `/api/fornitori/1011/indirizzi/${add.json().id}`);
      f = (await call('mrossi', 'GET', '/api/fornitori/1011')).json();
      assertMatch(f.indirizzi[0], { indirizzo: 'Via Mecenate 76', principale: true });
    });

    it('località inesistente: 400 RIFERIMENTO_NON_VALIDO', async () => {
      const res = await call('mrossi', 'POST', '/api/fornitori/1011/indirizzi', {
        tipoIndirizzoId: 1,
        localitaId: 9999,
        indirizzo: 'Test via Nessuna',
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.json().code, 'RIFERIMENTO_NON_VALIDO');
    });

    it('preferiti: aggiunta e rimozione', async () => {
      assert.equal((await call('lbianchi', 'PUT', '/api/fornitori/1002/preferito')).statusCode, 204);
      assert.equal((await call('lbianchi', 'GET', '/api/fornitori/1002/intestazione')).json().preferito, true);
      assert.equal((await call('lbianchi', 'DELETE', '/api/fornitori/1002/preferito')).statusCode, 204);
    });
  });

  describe('liste e documentazione', () => {
    it('geografia a cascata', async () => {
      const regioni = (await call('admin', 'GET', '/api/geo/regioni?nazioneId=1')).json();
      assert.ok(regioni.map((r: Row) => r.descrizione).includes('Toscana'));
      const loc = (await call('admin', 'GET', '/api/geo/localita?provinciaId=1')).json();
      assert.deepEqual(loc.map((r: Row) => r.descrizione), ['Firenze', 'Scandicci']);
      const estere = (await call('admin', 'GET', '/api/geo/localita?nazioneId=2')).json();
      assert.equal(estere[0].descrizione, 'Parigi');
    });
    it('lista inesistente: 404', async () => {
      assert.equal((await call('admin', 'GET', '/api/lookups/tabella_segreta')).statusCode, 404);
    });
    it('lista tradotta', async () => {
      const stati = (await call('lbianchi', 'GET', '/api/lookups/stati-fornitore')).json();
      assert.equal(stati[0].descrizione, 'Under qualification');
    });
    it('la documentazione OpenAPI è servita', async () => {
      const spec = (await app.inject({ method: 'GET', url: '/docs/json' })).json();
      assert.ok(Object.keys(spec.paths).includes('/api/fornitori/{id}'));
      assert.equal((await app.inject({ method: 'GET', url: '/docs/' })).statusCode, 200);
    });
  });
});

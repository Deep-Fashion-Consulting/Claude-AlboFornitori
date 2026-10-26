/** Liste di valori, codici esterni, marchi ed enti del fornitore. Vedi api.integration.test.ts per l'esecuzione. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { assertMatch, createTestApp } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

describe('Configurazione e classificazione', { skip: !url && 'TEST_DATABASE_URL non impostata' }, () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let nuovoSistema = 0;
  let nuovoEnte = 0;

  before(async () => {
    t = await createTestApp(url!);
  });
  after(async () => {
    await t.pool.query(`DELETE FROM albo.fornitore_codice_applicativo WHERE codice LIKE 'T-%'`);
    await t.pool.query(`DELETE FROM albo.fornitore_marchio WHERE fornitore_id = 1011`);
    await t.pool.query(`DELETE FROM albo.fornitore_ente WHERE fornitore_id = 1011`);
    await t.pool.query(`DELETE FROM iam.utente_ente WHERE ente_id = $1`, [nuovoEnte]);
    await t.pool.query(`DELETE FROM ref.applicativo WHERE id = $1`, [nuovoSistema]);
    await t.pool.query(`DELETE FROM ref.ente WHERE id = $1`, [nuovoEnte]);
    await t.close();
  });

  describe('liste di valori', () => {
    it('solo l’amministratore le gestisce', async () => {
      assert.equal((await t.call('mrossi', 'GET', '/api/admin/liste')).statusCode, 403);
      const liste = (await t.call('admin', 'GET', '/api/admin/liste')).json();
      assert.ok(liste.some((l: { nome: string }) => l.nome === 'applicativi'));
    });

    it('aggiunge un sistema esterno, che compare subito tra le liste', async () => {
      const res = await t.call('admin', 'POST', '/api/admin/liste/applicativi', {
        codice: 'GEST', descrizioneIt: 'Gestionale di produzione', descrizioneEn: '', ordine: 3, attivo: true,
      });
      assert.equal(res.statusCode, 201);
      nuovoSistema = res.json().id;
      const visibili = (await t.call('mrossi', 'GET', '/api/lookups/applicativi')).json();
      assert.ok(visibili.some((a: { codice: string }) => a.codice === 'GEST'));
    });

    it('codice duplicato: 409; lista inesistente: 404', async () => {
      const dup = await t.call('admin', 'POST', '/api/admin/liste/applicativi', { codice: 'SAP', descrizioneIt: 'Doppio', descrizioneEn: null, ordine: 0, attivo: true });
      assert.equal(dup.statusCode, 409);
      assert.equal((await t.call('admin', 'GET', '/api/admin/liste/utenti')).statusCode, 404);
    });

    it('una voce disattivata sparisce dalle liste di scelta ma resta nella gestione', async () => {
      const upd = await t.call('admin', 'PUT', `/api/admin/liste/applicativi/${nuovoSistema}`, {
        codice: 'GEST', descrizioneIt: 'Gestionale di produzione', descrizioneEn: 'Production system', ordine: 3, attivo: false,
      });
      assert.equal(upd.statusCode, 204);
      const scelta = (await t.call('mrossi', 'GET', '/api/lookups/applicativi')).json();
      assert.ok(!scelta.some((a: { codice: string }) => a.codice === 'GEST'));
      const gestione = (await t.call('admin', 'GET', '/api/admin/liste/applicativi')).json();
      assertMatch(gestione.find((a: { codice: string }) => a.codice === 'GEST'), { attivo: false, descrizioneEn: 'Production system' });
    });

    it('un nuovo ente è subito utilizzabile da chi lo crea', async () => {
      const res = await t.call('admin', 'POST', '/api/admin/liste/enti', { codice: 'TEST', descrizioneIt: 'Ente di prova', descrizioneEn: null, ordine: 9, attivo: true });
      nuovoEnte = res.json().id;
      const { rowCount } = await t.pool.query('SELECT 1 FROM iam.utente_ente ue JOIN iam.utente u ON u.id = ue.utente_id WHERE u.username = $1 AND ente_id = $2', ['admin', nuovoEnte]);
      assert.equal(rowCount, 1);
    });
  });

  describe('codici esterni', () => {
    it('aggiunge un codice, rifiuta lo stesso codice su un altro fornitore, lo toglie', async () => {
      const add = await t.call('mrossi', 'POST', '/api/fornitori/1011/codici', { applicativoId: 1, codice: 'T-001' });
      assert.equal(add.statusCode, 201);
      const altro = await t.call('mrossi', 'POST', '/api/fornitori/1012/codici', { applicativoId: 1, codice: 't-001' });
      assert.equal(altro.statusCode, 409);
      assert.match(altro.json().message, /Metalli Accessori Milano/);
      // stesso codice in un sistema diverso: ammesso
      assert.equal((await t.call('mrossi', 'POST', '/api/fornitori/1012/codici', { applicativoId: 2, codice: 'T-001' })).statusCode, 201);
      assert.equal((await t.call('mrossi', 'DELETE', `/api/fornitori/1012/codici/${add.json().id}`)).statusCode, 404);
      assert.equal((await t.call('mrossi', 'DELETE', `/api/fornitori/1011/codici/${add.json().id}`)).statusCode, 204);
    });
  });

  describe('marchi', () => {
    it('aggiunge e toglie un marchio, senza doppioni', async () => {
      const add = await t.call('mrossi', 'POST', '/api/fornitori/1011/marchi', { marchioId: 1 });
      assert.equal(add.statusCode, 201);
      assert.equal((await t.call('mrossi', 'POST', '/api/fornitori/1011/marchi', { marchioId: 1 })).statusCode, 409);
      const f = (await t.call('mrossi', 'GET', '/api/fornitori/1011')).json();
      assertMatch(f.marchi[0], { marchioId: 1, marchio: 'Prada' });
      assert.equal((await t.call('mrossi', 'DELETE', `/api/fornitori/1011/marchi/${add.json().id}`)).statusCode, 204);
    });
  });

  describe('enti', () => {
    it('associa un ente su cui si è abilitati; il menu mostra le voci per ente', async () => {
      assert.equal((await t.call('mrossi', 'POST', '/api/fornitori/1011/enti', { enteId: 1 })).statusCode, 204);
      assert.equal((await t.call('mrossi', 'POST', '/api/fornitori/1011/enti', { enteId: 1 })).statusCode, 409);
      const menu = JSON.stringify((await t.call('mrossi', 'GET', '/api/menu?fornitoreId=1011')).json());
      assert.ok(menu.includes('FORNITORE_VALUTAZIONE'));
    });

    it('non si associa né si toglie un ente su cui non si è abilitati', async () => {
      const add = await t.call('mrossi', 'POST', '/api/fornitori/1011/enti', { enteId: 2 });
      assert.equal(add.statusCode, 403);
      assert.equal(add.json().code, 'ENTE_NON_AUTORIZZATO');
    });

    it('un ente con valutazioni non si toglie; senza dati sì', async () => {
      const conDati = await t.call('mrossi', 'DELETE', '/api/fornitori/1001/enti/1');
      assert.equal(conDati.statusCode, 409);
      assert.equal(conDati.json().code, 'ENTE_CON_DATI');
      assert.equal((await t.call('mrossi', 'DELETE', '/api/fornitori/1011/enti/1')).statusCode, 204);
      assert.equal((await t.call('mrossi', 'DELETE', '/api/fornitori/1011/enti/1')).statusCode, 404);
    });

    it('in sola lettura non si modifica nulla', async () => {
      assert.equal((await t.call('lbianchi', 'POST', '/api/fornitori/1011/marchi', { marchioId: 2 })).statusCode, 403);
    });
  });
});

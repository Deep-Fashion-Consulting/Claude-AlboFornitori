/**
 * Test di integrazione: richiedono un database con migrazioni e seed di sviluppo.
 *   Windows (cmd):  set TEST_DATABASE_URL=postgres://albo:albo@localhost:5432/albo && npm test
 *   macOS/Linux:    TEST_DATABASE_URL=postgres://albo:albo@localhost:5432/albo npm test
 * Senza TEST_DATABASE_URL vengono saltati. I dati modificati vengono ripristinati alla fine.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { assertMatch, createTestApp, DEV_PASSWORD, geoIds, sessionFrom } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
type Row = { id: number; descrizione: string; preferito: boolean; principale: boolean };
const ids = (body: { risultati: { id: number }[] }) => body.risultati.map((r) => r.id);
/** Campi identificativi della scheda, da reinviare insieme agli altri nel salvataggio */
const identita = (f: { master: Record<string, unknown> }) => ({
  ragioneSociale: f.master.ragioneSociale,
  partitaIva: f.master.partitaIva,
  partitaIvaCee: f.master.partitaIvaCee,
  codiceFiscale: f.master.codiceFiscale,
  telefono: f.master.telefono,
  fax: f.master.fax,
});

describe('API Albo fornitori', { skip: !url && 'TEST_DATABASE_URL non impostata' }, () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let app: Awaited<ReturnType<typeof createTestApp>>['app'];
  let pool: Awaited<ReturnType<typeof createTestApp>>['pool'];
  let call: Awaited<ReturnType<typeof createTestApp>>['call'];
  let geo: Awaited<ReturnType<typeof geoIds>>;

  before(async () => {
    t = await createTestApp(url!);
    ({ app, pool, call } = t);
    geo = await geoIds(pool);
  });

  after(async () => {
    // ripristina i dati toccati dai test
    await pool.query(`DELETE FROM albo.fornitore_stato WHERE fornitore_id = 1011 AND data_da = '2026-01-01'`);
    await pool.query(`DELETE FROM albo.fornitore_indirizzo WHERE fornitore_id = 1011 AND indirizzo LIKE 'Test %'`);
    await pool.query(`UPDATE albo.fornitore_indirizzo SET principale = true WHERE fornitore_id = 1011 AND indirizzo = 'Via Mecenate 76'`);
    await pool.query(`UPDATE albo.fornitore SET email = NULL, uf = 'ACQ-ACC' WHERE id = 1011`);
    await pool.query(`DELETE FROM albo.fornitore_preferito WHERE utente_id = 3`);
    await pool.query(`UPDATE iam.utente SET tentativi_falliti = 0, bloccato_fino_al = NULL WHERE username = 'lbianchi'`);
    await t.close();
  });

  describe('accesso e permessi', () => {
    it('senza sessione risponde 401', async () => {
      const res = await call(null, 'GET', '/api/me');
      assert.equal(res.statusCode, 401);
      assert.equal(res.json().code, 'NON_AUTENTICATO');
      assert.ok(res.headers['x-correlation-id']);
    });

    it('il login imposta un cookie protetto e restituisce i permessi', async () => {
      const res = await t.login('lbianchi');
      assert.equal(res.statusCode, 200);
      assertMatch(res.json(), { username: 'lbianchi', lingua: 'EN', permessi: { lettura: true, scrittura: false } });
      const cookie = String(res.headers['set-cookie']);
      assert.match(cookie, /^albo_sessione=[\w-]{40,};/);
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Strict/);
      // nel database c'è solo l'hash del token, non il token
      const token = sessionFrom(res.headers['set-cookie']).split('=')[1]!;
      const { rowCount } = await pool.query('SELECT 1 FROM iam.sessione WHERE token_hash = $1', [token]);
      assert.equal(rowCount, 0);
    });

    it('lo stato della sessione risponde 200 anche senza login', async () => {
      assert.deepEqual((await call(null, 'GET', '/api/auth/stato')).json(), { utente: null });
      assertMatch((await call('mrossi', 'GET', '/api/auth/stato')).json(), { utente: { username: 'mrossi' } });
    });

    it('il nome utente non distingue maiuscole e spazi', async () => {
      assert.equal((await t.login('  MRossi ')).statusCode, 200);
    });

    it('password errata, utente inesistente e utente disattivato: stessa risposta', async () => {
      const risposte = await Promise.all([
        t.login('mrossi', 'sbagliata-123'),
        t.login('nessuno', DEV_PASSWORD),
        t.login('exutente', DEV_PASSWORD),
      ]);
      for (const r of risposte) {
        assert.equal(r.statusCode, 401);
        assert.equal(r.json().message, 'Nome utente o password non corretti');
      }
      const { rows } = await pool.query(
        `SELECT dettagli->>'motivo' AS motivo FROM audit.log WHERE azione = 'LOGIN_FAILED' ORDER BY id DESC LIMIT 3`,
      );
      assert.deepEqual(rows.map((r) => r.motivo).sort(), ['password errata', 'utente disattivato', 'utente inesistente']);
      await pool.query(`UPDATE iam.utente SET tentativi_falliti = 0 WHERE username = 'mrossi'`);
    });

    it('dopo 5 tentativi falliti l’account si blocca, anche con la password giusta', async () => {
      for (let i = 0; i < 5; i++) assert.equal((await t.login('lbianchi', 'sbagliata-123')).statusCode, 401);
      const bloccato = await t.login('lbianchi');
      assert.equal(bloccato.statusCode, 403);
      assert.equal(bloccato.json().code, 'ACCOUNT_BLOCCATO');
      // a blocco scaduto si rientra, e il contatore riparte
      await pool.query(`UPDATE iam.utente SET bloccato_fino_al = now() - interval '1 minute' WHERE username = 'lbianchi'`);
      assert.equal((await t.login('lbianchi', 'sbagliata-123')).statusCode, 401);
      assert.equal((await t.login('lbianchi')).statusCode, 200);
      const { rows } = await pool.query(`SELECT tentativi_falliti FROM iam.utente WHERE username = 'lbianchi'`);
      assert.equal(rows[0].tentativi_falliti, 0);
    });

    it('il logout chiude la sessione', async () => {
      const cookie = sessionFrom((await t.login('mrossi')).headers['set-cookie']);
      assert.equal((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).statusCode, 200);
      const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
      assert.equal(out.statusCode, 204);
      assert.match(String(out.headers['set-cookie']), /Max-Age=0/);
      assert.equal((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).statusCode, 401);
    });

    it('la sessione scade dopo il tempo di inattività', async () => {
      const cookie = sessionFrom((await t.login('mrossi')).headers['set-cookie']);
      const hash = createHash('sha256').update(cookie.split('=')[1]!).digest('hex');
      await pool.query(`UPDATE iam.sessione SET ultimo_uso_il = now() - interval '3 hours' WHERE token_hash = $1`, [hash]);
      assert.equal((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).statusCode, 401);
    });

    it('cambio password: verifica la vecchia, applica le regole, chiude le altre sessioni', async () => {
      const a = sessionFrom((await t.login('admin')).headers['set-cookie']);
      const b = sessionFrom((await t.login('admin')).headers['set-cookie']);
      const put = (cookie: string, body: object) => app.inject({ method: 'PUT', url: '/api/me/password', headers: { cookie }, payload: body });

      assert.equal((await put(a, { attuale: 'sbagliata', nuova: 'NuovaPassword-1' })).json().code, 'PASSWORD_ATTUALE_ERRATA');
      assert.equal((await put(a, { attuale: DEV_PASSWORD, nuova: 'corta' })).json().code, 'PASSWORD_DEBOLE');
      assert.equal((await put(a, { attuale: DEV_PASSWORD, nuova: 'admin-password-1' })).json().code, 'PASSWORD_DEBOLE');
      assert.equal((await put(a, { attuale: DEV_PASSWORD, nuova: 'NuovaPassword-1' })).statusCode, 204);

      assert.equal((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: a } })).statusCode, 200);
      assert.equal((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: b } })).statusCode, 401);
      assert.equal((await t.login('admin', DEV_PASSWORD)).statusCode, 401);
      // ripristino della password di prova; la sessione condivisa di admin è stata chiusa: se ne apre una nuova
      assert.equal((await put(a, { attuale: 'NuovaPassword-1', nuova: DEV_PASSWORD })).statusCode, 204);
      t.cookies.admin = sessionFrom((await t.login('admin')).headers['set-cookie']);
    });

    it('il menu senza fornitore contiene solo ricerca e report', async () => {
      const menu = JSON.stringify((await call('mrossi', 'GET', '/api/menu')).json());
      assert.ok(menu.includes('FORNITORE_RICERCA'));
      assert.ok(!menu.includes('FORNITORE_ANAGRAFICA'));
      assert.ok(!menu.includes('UTENTI'));
      assert.ok(!menu.includes('LISTE_VALORI'));
      assert.ok(JSON.stringify((await call('admin', 'GET', '/api/menu')).json()).includes('LISTE_VALORI'));
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
      const perCodice = (await call('mrossi', 'GET', '/api/fornitori?codiceEsterno=100377')).json();
      assertMatch(perCodice.risultati[0], { id: 1005, codiciEsterni: 'SAP 100377, ST3 ST-0377' });
      // lo stesso codice cercato in un altro sistema non trova nulla
      assert.equal((await call('mrossi', 'GET', '/api/fornitori?codiceEsterno=100377&applicativoId=2')).json().totale, 0);
      assert.deepEqual(ids((await call('mrossi', 'GET', '/api/fornitori?rapporto=cessati')).json()), [1004]);
    });

    it('filtra per provincia e per collegamenti padri/figli', async () => {
      assert.deepEqual(ids((await call('mrossi', 'GET', `/api/fornitori?provinciaId=${geo.AR}`)).json()).sort(), [1002, 1003, 1004]);
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
      assert.deepEqual(f.codiciApplicativi.map(({ applicativo, codice }: { applicativo: string; codice: string }) => ({ applicativo, codice })), [
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
      const body = { ...identita(f), ...f.dati, versione: f.versione, email: 'acquisti@metallimilano.example', uf: 'ACQ-MET' };
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
      const base = { ...identita(f), ...f.dati, versione: f.versione };
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
        localitaId: geo.milano,
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

  describe('creazione e identità del fornitore', () => {
    const created: number[] = [];
    after(async () => {
      if (created.length) await pool.query('DELETE FROM albo.fornitore WHERE id = ANY($1)', [created]);
    });

    it('crea un fornitore con i soli dati essenziali, normalizzando i codici', async () => {
      const res = await call('mrossi', 'POST', '/api/fornitori', {
        ragioneSociale: 'Nuova Pelletteria Test S.r.l.',
        partitaIva: '012 345 678 97',
        partitaIvaCee: null,
        codiceFiscale: null,
        telefono: '',
      });
      assert.equal(res.statusCode, 201);
      created.push(res.json().id);
      const f = (await call('mrossi', 'GET', `/api/fornitori/${res.json().id}`)).json();
      assertMatch(f.master, { ragioneSociale: 'Nuova Pelletteria Test S.r.l.', partitaIva: '01234567897', telefono: null });
      const { rows } = await pool.query(`SELECT fonte_master FROM albo.fornitore WHERE id = $1`, [res.json().id]);
      assert.equal(rows[0].fonte_master, 'ALBO');
      // ed è subito ricercabile
      assert.deepEqual(ids((await call('mrossi', 'GET', '/api/fornitori?partitaIva=01234567897')).json()), [res.json().id]);
    });

    it('codici non validi: 400 con il campo indicato', async () => {
      const res = await call('mrossi', 'POST', '/api/fornitori', {
        ragioneSociale: 'Test codici', partitaIva: '01234567890', partitaIvaCee: 'IT1', codiceFiscale: 'ABC', telefono: null,
      });
      assert.equal(res.statusCode, 400);
      const campi = res.json().details.map((d: { campo: string }) => d.campo).sort();
      assert.deepEqual(campi, ['codiceFiscale', 'partitaIva', 'partitaIvaCee']);
    });

    it('stessa partita IVA di un fornitore esistente: avviso, poi creazione su conferma', async () => {
      const body = { ragioneSociale: 'Doppione Test', partitaIva: '05123450487', partitaIvaCee: null, codiceFiscale: null, telefono: null };
      const dup = await call('mrossi', 'POST', '/api/fornitori', body);
      assert.equal(dup.statusCode, 409);
      assert.equal(dup.json().code, 'POSSIBILE_DUPLICATO');
      assert.deepEqual(dup.json().details.fornitori, [{ id: 1001, ragioneSociale: 'Pelletteria Città di Scandicci S.r.l.' }]);
      const ok = await call('mrossi', 'POST', '/api/fornitori', { ...body, confermaDuplicato: true });
      assert.equal(ok.statusCode, 201);
      created.push(ok.json().id);
    });

    it('in sola lettura non si crea', async () => {
      const res = await call('lbianchi', 'POST', '/api/fornitori', { ragioneSociale: 'X', partitaIva: null, partitaIvaCee: null, codiceFiscale: null, telefono: null });
      assert.equal(res.statusCode, 403);
    });

    it('i dati identificativi si modificano; i codici si controllano solo se cambiano', async () => {
      const id = created[0]!;
      const f = (await call('mrossi', 'GET', `/api/fornitori/${id}`)).json();
      const base = { ...f.dati, ...f.master, versione: f.versione };
      for (const k of ['responsabileCodice', 'codAccorpamento', 'sostituitoDa', 'sincronizzatoIl']) delete base[k];

      // un codice irregolare già presente (es. importato) non blocca il salvataggio degli altri campi
      await pool.query(`UPDATE albo.fornitore SET codice_fiscale = 'IRREGOLARE' WHERE id = $1`, [id]);
      const v1 = (await call('mrossi', 'GET', `/api/fornitori/${id}`)).json().versione;
      const ok = await call('mrossi', 'PUT', `/api/fornitori/${id}`, { ...base, versione: v1, codiceFiscale: 'IRREGOLARE', telefono: '+39 055 000' });
      assert.equal(ok.statusCode, 200);
      base.telefono = '+39 055 000';

      // cambiarlo con un altro codice non valido invece no
      const ko = await call('mrossi', 'PUT', `/api/fornitori/${id}`, { ...base, versione: ok.json().versione, codiceFiscale: 'ANCORA-SBAGLIATO' });
      assert.equal(ko.statusCode, 400);

      // la ragione sociale resta obbligatoria
      const vuota = await call('mrossi', 'PUT', `/api/fornitori/${id}`, { ...base, versione: ok.json().versione, ragioneSociale: '  ' });
      assert.equal(vuota.statusCode, 400);

      // cambiare la P.IVA con quella di un altro fornitore chiede conferma
      const dup = await call('mrossi', 'PUT', `/api/fornitori/${id}`, { ...base, versione: ok.json().versione, codiceFiscale: 'IRREGOLARE', partitaIva: '05123450487' });
      assert.equal(dup.json().code, 'POSSIBILE_DUPLICATO');
      const conf = await call('mrossi', 'PUT', `/api/fornitori/${id}`, {
        ...base, versione: ok.json().versione, codiceFiscale: 'IRREGOLARE', partitaIva: '05123450487', confermaDuplicato: true,
      });
      assert.equal(conf.statusCode, 200);
      const { rows } = await pool.query(
        `SELECT dettagli FROM audit.log WHERE azione = 'SUPPLIER_GENERAL_UPDATE' AND fornitore_id = $1 ORDER BY id DESC LIMIT 1`,
        [id],
      );
      assert.deepEqual(rows[0].dettagli, { partitaIva: { prima: '01234567897', dopo: '05123450487' } });
    });
  });

  describe('liste e documentazione', () => {
    it('geografia a cascata', async () => {
      const regioni = (await call('admin', 'GET', `/api/geo/regioni?nazioneId=${geo.IT}`)).json();
      assert.equal(regioni.length, 20);
      assert.ok(regioni.map((r: Row) => r.descrizione).includes('Toscana'));
      const loc = (await call('admin', 'GET', `/api/geo/localita?provinciaId=${geo.FI}`)).json();
      assert.ok(loc.length > 40);
      assert.ok(['Firenze', 'Scandicci'].every((n) => loc.some((r: Row) => r.descrizione === n)));
      const estere = (await call('admin', 'GET', `/api/geo/localita?nazioneId=${geo.FR}`)).json();
      assert.equal(estere[0].descrizione, 'Parigi');
    });
    it('dati geografici completi: nazioni, province e tutti i comuni', async () => {
      const nazioni = (await call('admin', 'GET', '/api/geo/nazioni')).json();
      assert.ok(nazioni.length >= 240);
      assert.equal(nazioni[0].descrizione, 'Italia');
      // la provincia di Torino ha più di 300 comuni: l'elenco non va tagliato
      const torino = (await call('admin', 'GET', `/api/geo/localita?provinciaId=${geo.TO}`)).json();
      assert.ok(torino.length > 300);
      const province = (await call('admin', 'GET', `/api/geo/province?nazioneId=${geo.IT}`)).json();
      assert.equal(province.length, 107);
      const { rows } = await pool.query(`SELECT descrizione_it, codice_istat FROM ref.localita WHERE codice = 'A952'`);
      assert.deepEqual(rows[0], { descrizione_it: 'Bolzano/Bozen', codice_istat: '021008' });
      const valute = (await call('admin', 'GET', '/api/lookups/valute')).json();
      assert.deepEqual(valute.slice(0, 2).map((v: Row & { codice: string }) => v.codice), ['EUR', 'USD']);
    });

    it('indirizzo estero: la località scritta a mano si crea una volta e poi si riusa', async () => {
      const add = (nome: string) =>
        call('mrossi', 'POST', '/api/fornitori/1011/indirizzi', { tipoIndirizzoId: 4, nazioneId: geo.DE, localitaNome: nome, indirizzo: 'Test Hauptstraße 1' });
      const a = await add('Stoccarda');
      const b = await add('  stoccarda ');
      assert.equal(a.statusCode, 201);
      assert.equal(b.statusCode, 201);
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ref.localita WHERE nazione_id = $1 AND descrizione_it ILIKE 'stoccarda'`, [geo.DE]);
      assert.equal(rows[0].n, 1);
      // in Italia il comune si sceglie dall'elenco
      const it = await call('mrossi', 'POST', '/api/fornitori/1011/indirizzi', { tipoIndirizzoId: 4, nazioneId: geo.IT, localitaNome: 'Comune Inventato', indirizzo: 'Test via' });
      assert.equal(it.statusCode, 400);
      await pool.query(`DELETE FROM albo.fornitore_indirizzo WHERE indirizzo = 'Test Hauptstraße 1'`);
      await pool.query(`DELETE FROM ref.localita WHERE nazione_id = $1 AND descrizione_it = 'Stoccarda'`, [geo.DE]);
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

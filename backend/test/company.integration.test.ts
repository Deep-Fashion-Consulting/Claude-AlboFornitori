/** Test di integrazione del modulo 2 (struttura societaria). Vedi api.integration.test.ts per l'esecuzione. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { assertMatch, createTestApp, geoIds } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

describe('Struttura societaria', { skip: !url && 'TEST_DATABASE_URL non impostata' }, () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  const created: { links: number[] } = { links: [] };

  let geo: Awaited<ReturnType<typeof geoIds>>;
  before(async () => {
    t = await createTestApp(url!);
    geo = await geoIds(t.pool);
  });
  after(async () => {
    // ripristino: il fornitore 1006 non ha struttura, interlocutori, subfornitori né collegamenti nel seed
    await t.pool.query('DELETE FROM albo.fornitore_struttura WHERE fornitore_id = 1006');
    await t.pool.query('DELETE FROM albo.fornitore_interlocutore WHERE fornitore_id = 1006');
    await t.pool.query('DELETE FROM albo.subfornitore WHERE fornitore_id = 1006');
    await t.pool.query('DELETE FROM albo.fornitore_collegamento WHERE 1006 IN (fornitore_da_id, fornitore_a_id)');
    await t.close();
  });

  it('legge struttura, interlocutori, subfornitori e collegamenti', async () => {
    const res = await t.call('mrossi', 'GET', '/api/fornitori/1001/societa');
    assert.equal(res.statusCode, 200);
    const s = res.json();
    assertMatch(s.struttura, { capitaleSociale: 100000, capitaleSocialeValuta: { descrizione: 'EUR' }, numeroAddetti: 48, tipoImmobile: { descrizione: 'Di proprietà' } });
    assert.equal(s.interlocutori.length, 2);
    assertMatch(s.interlocutori[0], { nominativo: 'Giovanni Bartolini', tipoInterlocutore: { descrizione: 'Titolare' } });
    assertMatch(s.subfornitori[0], { ragioneSociale: 'Laboratorio Tagli Lastra S.n.c.', provincia: { sigla: 'FI' } });
  });

  it('i collegamenti si leggono dal punto di vista di ciascun fornitore', async () => {
    const capogruppo = (await t.call('mrossi', 'GET', '/api/fornitori/1002/societa')).json().collegamenti;
    assert.deepEqual(capogruppo.map((c: { relazione: string; fornitore: { id: number } }) => [c.relazione, c.fornitore.id]), [['CONSOLIDA', 1003]]);
    const consolidato = (await t.call('mrossi', 'GET', '/api/fornitori/1003/societa')).json().collegamenti;
    const rel = consolidato.map((c: { relazione: string; fornitore: { id: number } }) => `${c.relazione}:${c.fornitore.id}`).sort();
    assert.deepEqual(rel, ['CONSOLIDATO_IN:1002', 'STESSA_AZIENDA:1004']);
    const alternativo = (await t.call('mrossi', 'GET', '/api/fornitori/1010/societa')).json().collegamenti;
    assertMatch(alternativo[0], { relazione: 'ALTERNATIVO_DI', fornitore: { id: 1005 } });
  });

  it('struttura vuota: versione null, poi creazione e conflitto', async () => {
    const vuota = (await t.call('mrossi', 'GET', '/api/fornitori/1006/societa')).json().struttura;
    assert.equal(vuota.versione, null);
    const body = {
      versione: null, capitaleSociale: 50000, capitaleSocialeValutaId: geo.EUR, numeroAddetti: 12, notaNumeroAddetti: '',
      immobileMq: 800.5, tipoImmobileId: 2, tipologiaOfferta: 'Tomaie', quotaMercatoPrc: 60, quotaMercatoDescrizione: null,
    };
    const ok = await t.call('mrossi', 'PUT', '/api/fornitori/1006/societa/struttura', body);
    assert.equal(ok.statusCode, 200);
    const letta = (await t.call('mrossi', 'GET', '/api/fornitori/1006/societa')).json().struttura;
    assertMatch(letta, { capitaleSociale: 50000, immobileMq: 800.5, notaNumeroAddetti: null, tipoImmobile: { descrizione: 'In affitto' } });

    // un secondo "primo salvataggio" deve fallire: nel frattempo la struttura esiste
    const doppio = await t.call('admin', 'PUT', '/api/fornitori/1006/societa/struttura', body);
    assert.equal(doppio.statusCode, 409);

    const agg = await t.call('mrossi', 'PUT', '/api/fornitori/1006/societa/struttura', { ...body, versione: letta.versione, numeroAddetti: 14 });
    assert.equal(agg.statusCode, 200);
    const { rows } = await t.pool.query(
      `SELECT dettagli FROM audit.log WHERE azione = 'SUPPLIER_ASSET_UPDATE' AND fornitore_id = 1006 ORDER BY id DESC LIMIT 1`,
    );
    assert.deepEqual(rows[0].dettagli, { numeroAddetti: { prima: 12, dopo: 14 } });
  });

  it('struttura: valida valuta, percentuale e numeri negativi', async () => {
    const base = {
      versione: null, capitaleSociale: null, capitaleSocialeValutaId: null, numeroAddetti: null, notaNumeroAddetti: null,
      immobileMq: null, tipoImmobileId: null, tipologiaOfferta: null, quotaMercatoPrc: null, quotaMercatoDescrizione: null,
    };
    const senzaValuta = await t.call('mrossi', 'PUT', '/api/fornitori/1007/societa/struttura', { ...base, capitaleSociale: 10 });
    assert.equal(senzaValuta.statusCode, 400);
    assert.ok(JSON.stringify(senzaValuta.json().details).includes('capitaleSocialeValutaId'));
    assert.equal((await t.call('mrossi', 'PUT', '/api/fornitori/1007/societa/struttura', { ...base, quotaMercatoPrc: 120 })).statusCode, 400);
    assert.equal((await t.call('mrossi', 'PUT', '/api/fornitori/1007/societa/struttura', { ...base, immobileMq: -1 })).statusCode, 400);
  });

  it('interlocutori: aggiunta, modifica, eliminazione con controllo di appartenenza', async () => {
    const add = await t.call('mrossi', 'POST', '/api/fornitori/1006/interlocutori', {
      tipoInterlocutoreId: 2, nominativo: 'Paola Test', email: 'paola@test.example', telefono: '', cellulare: null,
    });
    assert.equal(add.statusCode, 201);
    const id = add.json().id;
    const upd = await t.call('mrossi', 'PUT', `/api/fornitori/1006/interlocutori/${id}`, {
      tipoInterlocutoreId: 1, nominativo: 'Paola Test', email: 'paola@test.example', telefono: '+39 0734 000', cellulare: null,
    });
    assert.equal(upd.statusCode, 204);
    const s = (await t.call('mrossi', 'GET', '/api/fornitori/1006/societa')).json();
    assertMatch(s.interlocutori[0], { tipoInterlocutore: { descrizione: 'Titolare' }, telefono: '+39 0734 000' });

    // l'interlocutore di un altro fornitore non si tocca passando da questo
    assert.equal((await t.call('mrossi', 'DELETE', '/api/fornitori/1006/interlocutori/1')).statusCode, 404);
    assert.equal((await t.call('mrossi', 'DELETE', `/api/fornitori/1006/interlocutori/${id}`)).statusCode, 204);
  });

  it('interlocutori: nominativo obbligatorio ed e-mail valida', async () => {
    const res = await t.call('mrossi', 'POST', '/api/fornitori/1006/interlocutori', {
      tipoInterlocutoreId: null, nominativo: ' ', email: 'x', telefono: null, cellulare: null,
    });
    assert.equal(res.statusCode, 400);
    const campi = JSON.stringify(res.json().details);
    assert.ok(campi.includes('nominativo') && campi.includes('email'));
  });

  it('subfornitori: aggiunta e modifica', async () => {
    const body = {
      ragioneSociale: 'Orlatura Test', partitaIva: null, partitaIvaCee: null, codiceFiscale: null, nazioneId: geo.IT, provinciaId: geo.FM,
      localita: 'Montegranaro', indirizzo: null, cap: null, telefono: null, numeroAddetti: 6, referenti: null, enteId: 3, fornitoreAlboId: null,
    };
    const add = await t.call('mrossi', 'POST', '/api/fornitori/1006/subfornitori', body);
    assert.equal(add.statusCode, 201);
    assert.equal((await t.call('mrossi', 'PUT', `/api/fornitori/1006/subfornitori/${add.json().id}`, { ...body, numeroAddetti: 7 })).statusCode, 204);
    const sub = (await t.call('mrossi', 'GET', '/api/fornitori/1006/societa')).json().subfornitori[0];
    assertMatch(sub, { numeroAddetti: 7, provincia: { sigla: 'FM' }, ente: { descrizione: 'Calzature' } });
  });

  it('collegamenti: aggiunta, simmetria padri/figli, duplicati e casi non validi', async () => {
    const add = await t.call('mrossi', 'POST', '/api/fornitori/1006/collegamenti', { tipo: 'PADRE_FIGLIO', altroFornitoreId: 1005 });
    assert.equal(add.statusCode, 201);
    created.links.push(add.json().id);
    // lo stesso collegamento aggiunto dall'altro lato è un duplicato
    const inverso = await t.call('mrossi', 'POST', '/api/fornitori/1005/collegamenti', { tipo: 'PADRE_FIGLIO', altroFornitoreId: 1006 });
    assert.equal(inverso.statusCode, 409);
    assert.equal(inverso.json().code, 'DUPLICATO');
    // e si vede da entrambi i lati
    const da1005 = (await t.call('mrossi', 'GET', '/api/fornitori/1005/societa')).json().collegamenti;
    assert.ok(da1005.some((c: { relazione: string; fornitore: { id: number } }) => c.relazione === 'STESSA_AZIENDA' && c.fornitore.id === 1006));

    assert.equal((await t.call('mrossi', 'POST', '/api/fornitori/1006/collegamenti', { tipo: 'ALTERNATIVO', altroFornitoreId: 1006 })).json().code, 'COLLEGAMENTO_SE_STESSO');
    assert.equal((await t.call('mrossi', 'POST', '/api/fornitori/1006/collegamenti', { tipo: 'ALTERNATIVO', altroFornitoreId: 99999 })).statusCode, 404);
    // 1003 è consolidato in 1002: 1003 non può consolidare 1002
    const circolare = await t.call('mrossi', 'POST', '/api/fornitori/1003/collegamenti', { tipo: 'CONSOLIDATO', altroFornitoreId: 1002 });
    assert.equal(circolare.statusCode, 409);
    assert.equal(circolare.json().code, 'CONSOLIDAMENTO_CIRCOLARE');
  });

  it('collegamenti: rimozione da entrambi i lati, non da fornitori estranei', async () => {
    const id = created.links[0]!;
    assert.equal((await t.call('mrossi', 'DELETE', `/api/fornitori/1001/collegamenti/${id}`)).statusCode, 404);
    assert.equal((await t.call('mrossi', 'DELETE', `/api/fornitori/1005/collegamenti/${id}`)).statusCode, 204);
  });

  it('sola lettura: si legge ma non si modifica', async () => {
    assert.equal((await t.call('lbianchi', 'GET', '/api/fornitori/1001/societa')).statusCode, 200);
    const res = await t.call('lbianchi', 'POST', '/api/fornitori/1001/collegamenti', { tipo: 'ALTERNATIVO', altroFornitoreId: 1002 });
    assert.equal(res.statusCode, 403);
  });
});

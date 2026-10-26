import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeUsername } from '../src/auth/context.js';
import { buildMenu, type FunzioneRow } from '../src/modules/session/menu.js';
import { buildSearchQuery, escapeLike, SearchCriteriaSchema } from '../src/modules/suppliers/search.js';

describe('normalizeUsername', () => {
  it('toglie il dominio Windows come il legacy', () => {
    assert.equal(normalizeUsername('PRADA\\MRossi', true), 'mrossi');
  });
  it('toglie il dominio UPN solo se richiesto', () => {
    assert.equal(normalizeUsername('Mario.Rossi@azienda.it', true), 'mario.rossi');
    assert.equal(normalizeUsername('Mario.Rossi@azienda.it', false), 'mario.rossi@azienda.it');
  });
});

describe('buildSearchQuery', () => {
  const parse = (q: Record<string, unknown>) => SearchCriteriaSchema.parse(q);

  it('non inserisce mai i valori dentro il testo SQL', () => {
    const evil = "x'; DROP TABLE albo.fornitore; --";
    const shortEvil = "1' OR '1'='1";
    const { text, values } = buildSearchQuery(parse({ nome: evil, partitaIva: shortEvil, codiceSap: evil }), 1);
    assert.ok(!text.includes('DROP TABLE'));
    assert.ok(!text.includes("OR '1'='1"));
    assert.ok(values.includes(evil));
  });

  it('applica la modalità di confronto sul nome', () => {
    assert.match(buildSearchQuery(parse({ nome: 'abc', modoNome: 'inizia' }), 1).text, /LIKE common\.f_search_key\(\$1\) \|\| '%'/);
    assert.match(buildSearchQuery(parse({ nome: 'abc', modoNome: 'uguale' }), 1).text, /= common\.f_search_key\(\$1\)/);
  });

  it('fa escape dei caratteri jolly di LIKE', () => {
    assert.equal(escapeLike('50%_a\\b'), '50\\%\\_a\\\\b');
  });

  it('i placeholder sono numerati in sequenza e coincidono con i valori', () => {
    const { text, values } = buildSearchQuery(
      parse({ nome: 'a', modoNome: 'uguale', uf: 'x', enti: ['1', '2'], soloPreferiti: 'true', padriFigli: 'no' }),
      7,
    );
    const used = [...text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    assert.equal(Math.max(...used), values.length);
    assert.equal(new Set(used).size, values.length);
    assert.ok(text.includes('NOT EXISTS'));
  });

  it('accetta un solo ente come valore singolo', () => {
    assert.deepEqual(parse({ enti: '3' }).enti, [3]);
  });
});

describe('buildMenu', () => {
  const row = (r: Partial<FunzioneRow> & Pick<FunzioneRow, 'id' | 'codice' | 'livello'>): FunzioneRow => ({
    parentId: null,
    route: null,
    ordine: 1,
    richiedeFornitore: false,
    richiedeEnteAutorizzato: false,
    descrizione: r.codice,
    ...r,
  });
  const rows: FunzioneRow[] = [
    row({ id: 1, codice: 'ALBO', livello: 'AREA' }),
    row({ id: 10, parentId: 1, codice: 'MOD_A', livello: 'MODULO' }),
    row({ id: 11, parentId: 10, codice: 'RICERCA', livello: 'FUNZIONE', route: '/f' }),
    row({ id: 12, parentId: 10, codice: 'SCHEDA', livello: 'FUNZIONE', route: '/f/:id', ordine: 2, richiedeFornitore: true }),
    row({ id: 20, parentId: 1, codice: 'MOD_B', livello: 'MODULO', ordine: 2 }),
    row({ id: 21, parentId: 20, codice: 'VALUTAZIONE', livello: 'FUNZIONE', route: '/v', richiedeFornitore: true, richiedeEnteAutorizzato: true }),
  ];
  const tutte = new Set(['RICERCA', 'SCHEDA', 'VALUTAZIONE']);
  const codici = (nodes: ReturnType<typeof buildMenu>): string[] => nodes.flatMap((n) => [n.codice, ...codici(n.figli)]);

  it('senza fornitore mostra solo le funzioni che non lo richiedono e nasconde i moduli vuoti', () => {
    const m = buildMenu(rows, { funzioniAbilitate: tutte, hasSupplier: false, hasAuthorizedEntity: false });
    assert.deepEqual(codici(m), ['ALBO', 'MOD_A', 'RICERCA']);
  });
  it('le funzioni per ente richiedono un ente autorizzato sul fornitore', () => {
    const senza = buildMenu(rows, { funzioniAbilitate: tutte, hasSupplier: true, hasAuthorizedEntity: false });
    assert.ok(!codici(senza).includes('VALUTAZIONE'));
    const con = buildMenu(rows, { funzioniAbilitate: tutte, hasSupplier: true, hasAuthorizedEntity: true });
    assert.ok(codici(con).includes('VALUTAZIONE'));
  });
  it('rispetta le funzioni abilitate', () => {
    const m = buildMenu(rows, { funzioniAbilitate: new Set(['SCHEDA']), hasSupplier: true, hasAuthorizedEntity: true });
    assert.deepEqual(codici(m), ['ALBO', 'MOD_A', 'SCHEDA']);
  });
});

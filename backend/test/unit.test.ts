import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeUsername } from '../src/auth/context.js';
import { isValidCodiceFiscale, isValidPartitaIva, isValidPartitaIvaCee, normalizeCode } from '../src/modules/suppliers/codes.js';
import { hashPassword, passwordProblem, verifyPassword } from '../src/auth/password.js';
import { buildMenu, type FunzioneRow } from '../src/modules/session/menu.js';
import { buildSearchQuery, escapeLike, SearchCriteriaSchema } from '../src/modules/suppliers/search.js';

describe('credenziali', () => {
  it('normalizza il nome utente', () => {
    assert.equal(normalizeUsername('  MRossi '), 'mrossi');
  });
  it('verifica la password giusta e rifiuta quella sbagliata', async () => {
    const hash = await hashPassword('Una-password-lunga');
    assert.match(hash, /^scrypt\$32768\$8\$1\$/);
    assert.equal(await verifyPassword('Una-password-lunga', hash), true);
    assert.equal(await verifyPassword('una-password-lunga', hash), false);
  });
  it('due hash della stessa password sono diversi (sale casuale)', async () => {
    assert.notEqual(await hashPassword('Una-password-lunga'), await hashPassword('Una-password-lunga'));
  });
  it('rifiuta un hash malformato senza errori', async () => {
    assert.equal(await verifyPassword('x', 'non-un-hash'), false);
  });
  it('applica le regole minime', () => {
    assert.ok(passwordProblem('corta', 'mrossi'));
    assert.ok(passwordProblem('ciao-mrossi-2026', 'mrossi'));
    assert.equal(passwordProblem('Lunga-abbastanza', 'mrossi'), null);
  });
});

describe('buildSearchQuery', () => {
  const parse = (q: Record<string, unknown>) => SearchCriteriaSchema.parse(q);

  it('non inserisce mai i valori dentro il testo SQL', () => {
    const evil = "x'; DROP TABLE albo.fornitore; --";
    const shortEvil = "1' OR '1'='1";
    const { text, values } = buildSearchQuery(parse({ nome: evil, partitaIva: shortEvil, codiceEsterno: evil }), 1);
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

describe('codici fiscali', () => {
  it('partita IVA: cifra di controllo', () => {
    assert.equal(isValidPartitaIva('01234567897'), true);
    assert.equal(isValidPartitaIva('01234567890'), false);
    assert.equal(isValidPartitaIva('00000000000'), false);
    assert.equal(isValidPartitaIva('1234567897'), false);
  });
  it('codice fiscale di persona: carattere di controllo e omocodie', () => {
    assert.equal(isValidCodiceFiscale('RSSMRA85T10A562S'), true);
    assert.equal(isValidCodiceFiscale('RSSMRA85T10A562T'), false);
    assert.equal(isValidCodiceFiscale('RSSMRA85T10A56NH'), true);
    assert.equal(isValidCodiceFiscale('RSSMRA85T10A562'), false);
  });
  it('codice fiscale di società: 11 cifre come la partita IVA', () => {
    assert.equal(isValidCodiceFiscale('01234567897'), true);
    assert.equal(isValidCodiceFiscale('01234567890'), false);
  });
  it('P.IVA comunitaria: prefisso del paese; per l’Italia anche la cifra di controllo', () => {
    assert.equal(isValidPartitaIvaCee('IT01234567897'), true);
    assert.equal(isValidPartitaIvaCee('IT01234567890'), false);
    assert.equal(isValidPartitaIvaCee('FR40123456789'), true);
    assert.equal(isValidPartitaIvaCee('40123456789'), false);
  });
  it('normalizza spazi, punti e minuscole', () => {
    assert.equal(normalizeCode(' it 0123 456.7897 '), 'IT01234567897');
  });
});

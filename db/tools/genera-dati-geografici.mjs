/**
 * Genera la migrazione con i dati geografici di base: nazioni, aree geografiche,
 * regioni, province e comuni italiani, valute.
 *
 *   node db/tools/genera-dati-geografici.mjs > db/migrations/010_dati_geografici.sql
 *
 * Fonti (tutte con licenza che ne consente l'uso in un prodotto):
 *  - ISTAT, "Elenco dei comuni italiani" — CC BY 4.0, va citata la fonte
 *    https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.csv
 *  - Unicode CLDR (inclusa in Node) — nomi di nazioni e valute in italiano e inglese, licenza Unicode
 *  - Wikidata — codici ISO 3166 alpha-3 e continente di ogni nazione, CC0
 *
 * I CAP non sono inclusi: non esiste una fonte aperta ufficiale (sono di Poste Italiane).
 * Nessuna dipendenza: richiede Node 22.
 */

const ISTAT_URL = 'https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.csv';
const WIKIDATA_URL = 'https://query.wikidata.org/sparql';

// Codici a due lettere di CLDR che non sono nazioni (riservati, raggruppamenti, codici di prova)
const NOT_COUNTRIES = new Set(['AC', 'CP', 'CQ', 'DG', 'EA', 'EU', 'EZ', 'IC', 'QO', 'TA', 'UN', 'XA', 'XB', 'ZZ']);

// Aree geografiche (continenti)
const AREE = [
  ['EUR', 'Europa', 'Europe'],
  ['ASI', 'Asia', 'Asia'],
  ['AFR', 'Africa', 'Africa'],
  ['NAM', 'Nord e Centro America', 'North and Central America'],
  ['SAM', 'Sud America', 'South America'],
  ['OCE', 'Oceania', 'Oceania'],
  ['ANT', 'Antartide', 'Antarctica'],
];
const WIKIDATA_CONTINENT = { Q46: 'EUR', Q48: 'ASI', Q15: 'AFR', Q49: 'NAM', Q18: 'SAM', Q538: 'OCE', Q55643: 'OCE', Q3960: 'OCE', Q51: 'ANT' };
// Nazioni su due continenti o senza continente in Wikidata: criterio europeo (come ISTAT)
const CONTINENT_OVERRIDE = { RU: 'EUR', TR: 'EUR', CY: 'EUR', KZ: 'ASI', TF: 'AFR', UM: 'OCE', AX: 'EUR', XK: 'EUR' };

const q = (v) => (v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

/** CSV con separatore ";" e campi tra virgolette che possono contenere a capo. */
function parseCsv(text, sep = ';') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

async function comuni() {
  const res = await fetch(ISTAT_URL);
  if (!res.ok) throw new Error(`ISTAT: HTTP ${res.status}`);
  const text = new TextDecoder('windows-1252').decode(await res.arrayBuffer());
  const [, ...rows] = parseCsv(text);
  return rows.map((r) => ({
    regioneCodice: r[0],
    utsCodice: r[1],
    istat: r[4],
    nome: r[5], // denominazione ufficiale, bilingue dove previsto (es. "Bolzano/Bozen")
    regione: r[10],
    provincia: r[11],
    sigla: r[14],
    catastale: r[19],
  }));
}

async function nazioniWikidata() {
  const query = 'SELECT ?iso ?iso3 ?cont WHERE { ?c wdt:P297 ?iso . OPTIONAL { ?c wdt:P298 ?iso3 } OPTIONAL { ?c wdt:P30 ?cont } }';
  const res = await fetch(`${WIKIDATA_URL}?query=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'AlboFornitori/1.0 (generatore dati di base)' },
  });
  if (!res.ok) throw new Error(`Wikidata: HTTP ${res.status}`);
  const out = {};
  for (const b of (await res.json()).results.bindings) {
    const iso = b.iso.value;
    out[iso] ??= { iso3: null, continenti: new Set() };
    if (b.iso3) out[iso].iso3 ??= b.iso3.value;
    const cont = WIKIDATA_CONTINENT[b.cont?.value.split('/').pop()];
    if (cont) out[iso].continenti.add(cont);
  }
  return out;
}

function nazioni(wd) {
  const it = new Intl.DisplayNames(['it'], { type: 'region', fallback: 'none' });
  const en = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
  const list = [];
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const iso = String.fromCharCode(a, b);
      if (NOT_COUNTRIES.has(iso) || !it.of(iso) || !en.of(iso)) continue;
      // codici dismessi (es. BU -> MM): CLDR li riconosce, ma il codice attuale è un altro
      if (Intl.getCanonicalLocales(`und-${iso}`)[0] !== `und-${iso}`) continue;
      const info = wd[iso];
      const area = CONTINENT_OVERRIDE[iso] ?? (info?.continenti.size === 1 ? [...info.continenti][0] : null);
      if (!area) throw new Error(`Continente non determinato per ${iso} (${en.of(iso)}): aggiungilo a CONTINENT_OVERRIDE`);
      list.push({ iso, iso3: info?.iso3 ?? null, it: it.of(iso).replace('’', "'"), en: en.of(iso).replace('’', "'"), area });
    }
  }
  return list;
}

function valute() {
  const it = new Intl.DisplayNames(['it'], { type: 'currency', fallback: 'none' });
  const en = new Intl.DisplayNames(['en'], { type: 'currency', fallback: 'none' });
  const principali = ['EUR', 'USD', 'GBP', 'CHF', 'CNY', 'JPY'];
  return Intl.supportedValuesOf('currency')
    .filter((c) => it.of(c) && en.of(c))
    .map((c) => {
      const i = principali.indexOf(c);
      const nomeIt = it.of(c);
      return { c, it: nomeIt.charAt(0).toUpperCase() + nomeIt.slice(1), en: en.of(c), ordine: i >= 0 ? i + 1 : 100 };
    });
}

const values = (rows) => rows.map((r) => `  (${r.join(', ')})`).join(',\n');

async function main() {
  const [com, wd] = await Promise.all([comuni(), nazioniWikidata()]);
  const naz = nazioni(wd);
  const val = valute();

  const regioni = new Map();
  const province = new Map();
  for (const c of com) {
    regioni.set(c.regioneCodice, c.regione);
    province.set(c.utsCodice, { nome: c.provincia, sigla: c.sigla, regione: c.regioneCodice });
  }

  const today = new Date().toISOString().slice(0, 10);
  console.log(`-- =============================================================================
-- Albo Fornitori - Migrazione 010
-- Dati geografici di base del prodotto. Generata il ${today} da db/tools/genera-dati-geografici.mjs
--
-- ${naz.length} nazioni, ${AREE.length} aree geografiche, ${regioni.size} regioni, ${province.size} province, ${com.length} comuni, ${val.length} valute.
--
-- Fonti:
--   Comuni, province, regioni: ISTAT, Elenco dei comuni italiani - licenza CC BY 4.0
--   Nomi di nazioni e valute:  Unicode CLDR - licenza Unicode
--   Codici ISO alpha-3 e continenti: Wikidata - CC0
--
-- Su un database che ha già dati geografici (es. quelli di prova) aggiorna le voci esistenti
-- riconoscendole per codice ISO, nome della regione, sigla della provincia e nome del comune;
-- le voci non presenti nelle fonti (es. località estere inserite a mano) restano invariate.
-- I CAP non sono inclusi: non esiste una fonte aperta ufficiale. Si indicano negli indirizzi.
-- =============================================================================

-- Tutto in un'unica transazione: le tabelle temporanee vivono fino al COMMIT,
-- e se qualcosa fallisce il database resta com'era.
BEGIN;

-- ------------------------------------------------------------ aree geografiche
INSERT INTO ref.area_geografica (codice, descrizione_it, descrizione_en, ordine) VALUES
${values(AREE.map(([c, i, e], k) => [q(c), q(i), q(e), k + 1]))}
ON CONFLICT (codice) DO UPDATE SET descrizione_it = EXCLUDED.descrizione_it, descrizione_en = EXCLUDED.descrizione_en, ordine = EXCLUDED.ordine;

-- --------------------------------------------------------------------- nazioni
CREATE TEMP TABLE tmp_nazione (iso2 char(2), iso3 char(3), it text, en text, area text) ON COMMIT DROP;
INSERT INTO tmp_nazione VALUES
${values(naz.map((n) => [q(n.iso), q(n.iso3), q(n.it), q(n.en), q(n.area)]))};

UPDATE ref.nazione n
   SET iso3 = COALESCE(n.iso3, t.iso3), descrizione_it = t.it, descrizione_en = t.en,
       area_geografica_id = a.id, europa = (t.area = 'EUR')
  FROM tmp_nazione t JOIN ref.area_geografica a ON a.codice = t.area
 WHERE n.iso2 = t.iso2;

INSERT INTO ref.nazione (codice, iso2, iso3, descrizione_it, descrizione_en, area_geografica_id, europa, ordine)
SELECT t.iso2, t.iso2, t.iso3, t.it, t.en, a.id, t.area = 'EUR', CASE WHEN t.iso2 = 'IT' THEN 0 ELSE 1 END
  FROM tmp_nazione t JOIN ref.area_geografica a ON a.codice = t.area
 WHERE NOT EXISTS (SELECT 1 FROM ref.nazione n WHERE n.iso2 = t.iso2);

-- --------------------------------------------------------------------- regioni
CREATE TEMP TABLE tmp_regione (codice text, nome text) ON COMMIT DROP;
INSERT INTO tmp_regione VALUES
${values([...regioni].map(([c, n]) => [q(c), q(n)]))};

UPDATE ref.regione r SET codice = t.codice, descrizione_it = t.nome
  FROM tmp_regione t
 WHERE r.nazione_id = (SELECT id FROM ref.nazione WHERE iso2 = 'IT')
   AND (r.codice = t.codice OR lower(r.descrizione_it) = lower(split_part(t.nome, '/', 1)) OR lower(r.descrizione_it) = lower(t.nome));

INSERT INTO ref.regione (codice, descrizione_it, nazione_id)
SELECT t.codice, t.nome, (SELECT id FROM ref.nazione WHERE iso2 = 'IT')
  FROM tmp_regione t
 WHERE NOT EXISTS (SELECT 1 FROM ref.regione r WHERE r.codice = t.codice);

-- -------------------------------------------------------------------- province
CREATE TEMP TABLE tmp_provincia (codice text, sigla text, nome text, regione text) ON COMMIT DROP;
INSERT INTO tmp_provincia VALUES
${values([...province].map(([c, p]) => [q(c), q(p.sigla), q(p.nome), q(p.regione)]))};

UPDATE ref.provincia p SET codice = t.codice, descrizione_it = t.nome, regione_id = r.id
  FROM tmp_provincia t JOIN ref.regione r ON r.codice = t.regione
 WHERE p.sigla = t.sigla;

INSERT INTO ref.provincia (codice, sigla, descrizione_it, regione_id)
SELECT t.codice, t.sigla, t.nome, r.id
  FROM tmp_provincia t JOIN ref.regione r ON r.codice = t.regione
 WHERE NOT EXISTS (SELECT 1 FROM ref.provincia p WHERE p.sigla = t.sigla);

-- ---------------------------------------------------------------------- comuni
CREATE TEMP TABLE tmp_comune (catastale text, istat text, nome text, sigla text) ON COMMIT DROP;
INSERT INTO tmp_comune VALUES
${values(com.map((c) => [q(c.catastale), q(c.istat), q(c.nome), q(c.sigla)]))};

UPDATE ref.localita l SET codice = t.catastale, codice_istat = t.istat, descrizione_it = t.nome
  FROM tmp_comune t JOIN ref.provincia p ON p.sigla = t.sigla
 WHERE l.provincia_id = p.id
   AND (l.codice = t.catastale OR lower(l.descrizione_it) = lower(t.nome) OR lower(l.descrizione_it) = lower(split_part(t.nome, '/', 1)));

INSERT INTO ref.localita (codice, codice_istat, descrizione_it, nazione_id, provincia_id)
SELECT t.catastale, t.istat, t.nome, (SELECT id FROM ref.nazione WHERE iso2 = 'IT'), p.id
  FROM tmp_comune t JOIN ref.provincia p ON p.sigla = t.sigla
 WHERE NOT EXISTS (SELECT 1 FROM ref.localita l WHERE l.codice = t.catastale);

-- ---------------------------------------------------------------------- valute
INSERT INTO ref.valuta (codice, descrizione_it, descrizione_en, ordine) VALUES
${values(val.map((v) => [q(v.c), q(v.it), q(v.en), v.ordine]))}
ON CONFLICT (codice) DO UPDATE SET descrizione_it = EXCLUDED.descrizione_it, descrizione_en = EXCLUDED.descrizione_en, ordine = EXCLUDED.ordine;

COMMIT;`);
}

main().catch((err) => {
  console.error(`Errore: ${err.message}`);
  process.exit(1);
});

-- =============================================================================
-- Albo Fornitori - Migrazione 006
-- Viste di lettura che sostituiscono le principali VIEW_* legacy.
-- La loro semantica e'' RICOSTRUITA dal codice, non dal DDL originale:
-- vanno confrontate con le VIEW_* reali nei test di equivalenza.
-- =============================================================================

-- Stato corrente del fornitore (ex VIEW_FORNITORE_STATO)
CREATE VIEW albo.v_fornitore_stato_corrente AS
SELECT DISTINCT ON (fs.fornitore_id)
       fs.fornitore_id,
       fs.stato_id,
       s.codice         AS stato_codice,
       s.descrizione_it AS stato_descrizione_it,
       s.descrizione_en AS stato_descrizione_en,
       fs.data_da
FROM albo.fornitore_stato fs
JOIN ref.stato_fornitore s ON s.id = fs.stato_id
ORDER BY fs.fornitore_id, fs.data_da DESC, fs.id DESC;

-- Indirizzo principale (ex VIEW_FORNITORE_INDIRIZZOPRINCIPALE)
-- Regola: indirizzo marcato principale; in mancanza, il primo inserito.
CREATE VIEW albo.v_fornitore_indirizzo_principale AS
SELECT DISTINCT ON (i.fornitore_id)
       i.fornitore_id,
       i.id AS indirizzo_id,
       i.indirizzo,
       i.cap,
       i.telefono,
       l.id AS localita_id,
       l.descrizione_it AS localita,
       p.id AS provincia_id,
       p.sigla AS provincia_sigla,
       r.id AS regione_id,
       n.id AS nazione_id,
       n.iso2 AS nazione_iso2,
       n.descrizione_it AS nazione,
       i.latitudine,
       i.longitudine
FROM albo.fornitore_indirizzo i
JOIN ref.localita  l ON l.id = i.localita_id
JOIN ref.nazione   n ON n.id = l.nazione_id
LEFT JOIN ref.provincia p ON p.id = l.provincia_id
LEFT JOIN ref.regione   r ON r.id = p.regione_id
ORDER BY i.fornitore_id, i.principale DESC, i.id;

-- Collegamenti letti dal punto di vista di ciascun fornitore
-- (ex VIEW_FORNITORE_CONS, _ALT, _RIF, _STOR)
CREATE VIEW albo.v_fornitore_collegamento AS
SELECT c.id AS collegamento_id,
       c.fornitore_da_id AS fornitore_id,
       c.fornitore_a_id  AS altro_fornitore_id,
       c.tipo,
       CASE c.tipo
         WHEN 'CONSOLIDATO'  THEN 'CONSOLIDA'        -- l'altro e' consolidato in me
         WHEN 'ALTERNATIVO'  THEN 'HA_ALTERNATIVO'   -- l'altro e' un mio alternativo
         WHEN 'PADRE_FIGLIO' THEN 'STESSA_AZIENDA'   -- simmetrico: stesso valore da entrambi i lati
       END AS relazione,
       c.attivo,
       c.updated_at
FROM albo.fornitore_collegamento c
UNION ALL
SELECT c.id,
       c.fornitore_a_id,
       c.fornitore_da_id,
       c.tipo,
       CASE c.tipo
         WHEN 'CONSOLIDATO'  THEN 'CONSOLIDATO_IN'
         WHEN 'ALTERNATIVO'  THEN 'ALTERNATIVO_DI'   -- "Fornitore alternativo di"
         WHEN 'PADRE_FIGLIO' THEN 'STESSA_AZIENDA'
       END,
       c.attivo,
       c.updated_at
FROM albo.fornitore_collegamento c;

-- Sintesi per risultati di ricerca e header di sezione
CREATE VIEW albo.v_fornitore_sintesi AS
SELECT f.id,
       f.ragione_sociale,
       f.denominazione_sociale,
       f.sede_legale,
       f.partita_iva,
       f.partita_iva_cee,
       f.codice_fiscale,
       f.email,
       f.uf,
       f.data_inizio_rapporto,
       f.data_fine_rapporto,
       (f.data_fine_rapporto IS NULL OR f.data_fine_rapporto >= current_date) AS attivo,
       sc.stato_id,
       sc.stato_descrizione_it,
       sc.stato_descrizione_en,
       (SELECT string_agg(ca.codice, ', ' ORDER BY ca.codice)
          FROM albo.fornitore_codice_applicativo ca
          JOIN ref.applicativo a ON a.id = ca.applicativo_id AND a.codice = 'SAP'
         WHERE ca.fornitore_id = f.id) AS codici_sap,
       (SELECT string_agg(ca.codice, ', ' ORDER BY ca.codice)
          FROM albo.fornitore_codice_applicativo ca
          JOIN ref.applicativo a ON a.id = ca.applicativo_id AND a.codice = 'ST3'
         WHERE ca.fornitore_id = f.id) AS codici_st3,
       f.updated_at
FROM albo.fornitore f
LEFT JOIN albo.v_fornitore_stato_corrente sc ON sc.fornitore_id = f.id;

-- -----------------------------------------------------------------------------
-- Autorizzazioni
-- -----------------------------------------------------------------------------

-- Enti su cui un utente e' abilitato per un dato fornitore
-- (ex VIEW_ABILITAZIONI_UTENTE_ENTI_FORNITORI)
CREATE VIEW iam.v_utente_ente_fornitore AS
SELECT ue.utente_id,
       fe.fornitore_id,
       fe.ente_id
FROM iam.utente_ente ue
JOIN albo.fornitore_ente fe ON fe.ente_id = ue.ente_id;

-- Funzioni abilitate per utente tramite i gruppi (ex VIEW_AbilitazioniFunzioni)
CREATE VIEW iam.v_utente_funzione AS
SELECT DISTINCT ug.utente_id, f.*
FROM iam.utente_gruppo ug
JOIN iam.gruppo g            ON g.id = ug.gruppo_id AND g.attivo
JOIN iam.gruppo_funzione gf  ON gf.gruppo_id = g.id
JOIN iam.funzione f          ON f.id = gf.funzione_id AND f.attivo;

-- -----------------------------------------------------------------------------
-- Fatturato derivato
-- -----------------------------------------------------------------------------

-- Passivo consolidato (ex VIEW_FORNITORE_PASSIVO_CONS):
-- per ogni capogruppo, il suo fatturato + quello dei fornitori consolidati attivi.
-- [H18] Un livello solo: se la capogruppo e' a sua volta consolidata in un'altra, la catena non viene risalita.
CREATE VIEW ext.v_fatturato_passivo_consolidato AS
WITH perimetro AS (
  SELECT f.id AS fornitore_id, f.id AS fornitore_origine_id
  FROM albo.fornitore f
  WHERE EXISTS (SELECT 1 FROM albo.fornitore_collegamento c
                 WHERE c.fornitore_da_id = f.id AND c.tipo = 'CONSOLIDATO' AND c.attivo)
  UNION
  SELECT c.fornitore_da_id, c.fornitore_a_id
  FROM albo.fornitore_collegamento c
  WHERE c.tipo = 'CONSOLIDATO' AND c.attivo
)
SELECT p.fornitore_id,
       p.fornitore_origine_id,
       fp.societa_id,
       fp.anno,
       fp.valuta_id,
       fp.totale,
       fp.totale_eur
FROM perimetro p
JOIN ext.fatturato_passivo fp ON fp.fornitore_id = p.fornitore_origine_id;

-- Passivo padri/figli (ex VIEW_FORNITORE_PASSIVO_STOR):
-- tutti i fornitori che rappresentano la stessa azienda nel tempo (relazione simmetrica e transitiva:
-- se A~B e B~C, anche C compare nello storico di A).
CREATE VIEW ext.v_fatturato_passivo_storico AS
WITH RECURSIVE archi AS (
  SELECT fornitore_da_id AS a, fornitore_a_id AS b
    FROM albo.fornitore_collegamento WHERE tipo = 'PADRE_FIGLIO' AND attivo
  UNION ALL
  SELECT fornitore_a_id, fornitore_da_id
    FROM albo.fornitore_collegamento WHERE tipo = 'PADRE_FIGLIO' AND attivo
),
catena (fornitore_id, collegato_id) AS (
  SELECT a, b FROM archi
  UNION
  SELECT c.fornitore_id, ar.b
  FROM catena c
  JOIN archi ar ON ar.a = c.collegato_id
  WHERE ar.b <> c.fornitore_id
)
SELECT c.fornitore_id,
       c.collegato_id AS fornitore_origine_id,
       fp.societa_id,
       fp.anno,
       fp.valuta_id,
       fp.totale,
       fp.totale_eur
FROM catena c
JOIN ext.fatturato_passivo fp ON fp.fornitore_id = c.collegato_id;

COMMENT ON VIEW ext.v_fatturato_passivo_storico IS
  'Chiusura transitiva dei collegamenti PADRE_FIGLIO, letti in entrambe le direzioni. UNION (non UNION ALL) garantisce la terminazione '
  'anche in presenza di cicli nei dati migrati.';

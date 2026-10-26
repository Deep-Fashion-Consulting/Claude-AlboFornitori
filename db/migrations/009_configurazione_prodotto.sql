-- =============================================================================
-- Albo Fornitori - Migrazione 009
-- Configurazione del prodotto (finora solo nei dati di prova) e generalizzazione:
--   * menu, gruppi predefiniti e loro abilitazioni: un'installazione nuova li ha senza seed
--   * nuova funzione "Liste di valori" per l'amministratore
--   * niente più riferimenti a un cliente specifico (Prada) o a sistemi fissi (SAP, ST3)
-- Su un database che li ha già (installazioni di sviluppo) aggiunge solo ciò che manca.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Menu
-- -----------------------------------------------------------------------------
INSERT INTO iam.funzione (id, parent_id, codice, livello, route, ordine, richiede_fornitore, richiede_ente_autorizzato, legacy_id) VALUES
  (1,  NULL, 'ALBO', 'AREA', NULL, 1, false, false, 700),
  (10, 1, 'MOD_RICERCA', 'MODULO', NULL, 1, false, false, NULL),
  (11, 10, 'FORNITORE_RICERCA', 'FUNZIONE', '/fornitori', 1, false, false, NULL),
  (20, 1, 'MOD_SCHEDA', 'MODULO', NULL, 2, false, false, NULL),
  (21, 20, 'FORNITORE_ANAGRAFICA', 'FUNZIONE', '/fornitori/:id/anagrafica', 1, true, false, NULL),
  (22, 20, 'FORNITORE_SOCIETA', 'FUNZIONE', '/fornitori/:id/societa', 2, true, false, NULL),
  (23, 20, 'FORNITORE_ECONOMICI', 'FUNZIONE', '/fornitori/:id/dati-economici', 3, true, false, NULL),
  (24, 20, 'FORNITORE_ORDFATT', 'FUNZIONE', '/fornitori/:id/ordinato-fatturato', 4, true, false, NULL),
  (25, 20, 'FORNITORE_PAGAMENTI', 'FUNZIONE', '/fornitori/:id/pagamenti', 5, true, false, NULL),
  (26, 20, 'FORNITORE_CONTRATTI', 'FUNZIONE', '/fornitori/:id/contratti', 6, true, false, NULL),
  (27, 20, 'FORNITORE_CERTIFICAZIONI', 'FUNZIONE', '/fornitori/:id/certificazioni', 7, true, false, NULL),
  (28, 20, 'FORNITORE_COMPLIANCE', 'FUNZIONE', '/fornitori/:id/compliance', 8, true, false, NULL),
  (30, 1, 'MOD_INDUSTRIALE', 'MODULO', NULL, 3, false, false, 701),
  (31, 30, 'FORNITORE_PRODUZIONE', 'FUNZIONE', '/fornitori/:id/produzione', 1, true, true, NULL),
  (32, 30, 'FORNITORE_LOGISTICA', 'FUNZIONE', '/fornitori/:id/logistica', 2, true, false, NULL),
  (33, 30, 'FORNITORE_VALUTAZIONE', 'FUNZIONE', '/fornitori/:id/valutazione', 3, true, true, NULL),
  (40, 1, 'MOD_REPORT', 'MODULO', NULL, 4, false, false, 706),
  (41, 40, 'REPORT_ANAGRAFICA', 'FUNZIONE', '/report/anagrafica', 1, false, false, NULL),
  (42, 40, 'REPORT_INDUSTRIALE', 'FUNZIONE', '/report/industriale', 2, false, false, NULL),
  (43, 40, 'REPORT_COMPLIANCE', 'FUNZIONE', '/report/compliance', 3, false, false, NULL),
  (50, 1, 'MOD_AMMINISTRAZIONE', 'MODULO', NULL, 5, false, false, 710),
  (51, 50, 'UTENTI', 'FUNZIONE', '/amministrazione/utenti', 1, false, false, NULL),
  (52, 50, 'LISTE_VALORI', 'FUNZIONE', '/amministrazione/liste', 2, false, false, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.funzione_traduzione (funzione_id, lingua, descrizione) VALUES
  (1,'IT','Albo fornitori'), (1,'EN','Supplier register'),
  (10,'IT','Ricerca'), (10,'EN','Search'),
  (11,'IT','Ricerca fornitori'), (11,'EN','Find suppliers'),
  (20,'IT','Scheda fornitore'), (20,'EN','Supplier file'),
  (21,'IT','Dati anagrafici'), (21,'EN','General data'),
  (22,'IT','Struttura societaria'), (22,'EN','Company structure'),
  (23,'IT','Dati economici'), (23,'EN','Financials'),
  (24,'IT','Ordinato e fatturato'), (24,'EN','Orders and turnover'),
  (25,'IT','Banca e pagamenti'), (25,'EN','Bank and payments'),
  (26,'IT','Contratti'), (26,'EN','Contracts'),
  (27,'IT','Certificazioni'), (27,'EN','Certifications'),
  (28,'IT','Compliance'), (28,'EN','Compliance'),
  (30,'IT','Industriale'), (30,'EN','Industrial'),
  (31,'IT','Produzione'), (31,'EN','Production'),
  (32,'IT','Logistica'), (32,'EN','Logistics'),
  (33,'IT','Valutazione'), (33,'EN','Evaluation'),
  (40,'IT','Report'), (40,'EN','Reports'),
  (41,'IT','Report anagrafico'), (41,'EN','Register report'),
  (42,'IT','Report industriale'), (42,'EN','Industrial report'),
  (43,'IT','Report compliance'), (43,'EN','Compliance report'),
  (50,'IT','Amministrazione'), (50,'EN','Administration'),
  (51,'IT','Utenti e abilitazioni'), (51,'EN','Users and permissions'),
  (52,'IT','Liste di valori'), (52,'EN','Value lists')
ON CONFLICT DO NOTHING;

DO $$ BEGIN PERFORM setval(pg_get_serial_sequence('iam.funzione', 'id'), (SELECT max(id) FROM iam.funzione)); END $$;

-- -----------------------------------------------------------------------------
-- Gruppi predefiniti: CONSULTAZIONE vede tutto tranne l'amministrazione, AMMINISTRAZIONE tutto
-- -----------------------------------------------------------------------------
INSERT INTO iam.gruppo (codice, descrizione) VALUES
  ('CONSULTAZIONE', 'Consultazione albo'),
  ('AMMINISTRAZIONE', 'Amministratori')
ON CONFLICT (codice) DO NOTHING;

INSERT INTO iam.gruppo_funzione (gruppo_id, funzione_id)
SELECT g.id, f.id
  FROM iam.gruppo g CROSS JOIN iam.funzione f
 WHERE f.livello = 'FUNZIONE'
   AND (g.codice = 'AMMINISTRAZIONE'
        OR (g.codice = 'CONSULTAZIONE' AND f.parent_id <> (SELECT id FROM iam.funzione WHERE codice = 'MOD_AMMINISTRAZIONE')))
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Nomi indipendenti dal cliente
-- -----------------------------------------------------------------------------
ALTER TABLE ref.percentuale_prada RENAME TO percentuale_utilizzo;
COMMENT ON TABLE ref.percentuale_utilizzo IS 'Fasce della percentuale di capacità del fornitore dedicata al cliente.';
ALTER TABLE albo.fornitore_produzione_ente RENAME COLUMN percentuale_prada_id TO percentuale_utilizzo_id;
ALTER TABLE albo.fornitore_facon_rtw RENAME COLUMN percentuale_utilizzo_prada TO percentuale_utilizzo_cliente;

COMMENT ON TABLE ref.applicativo IS
  'Sistemi esterni del cliente che assegnano un codice al fornitore (ERP, gestionali di produzione, ...). Configurabili.';

-- -----------------------------------------------------------------------------
-- Sintesi del fornitore: tutti i codici esterni in una colonna, qualunque sia il sistema
-- -----------------------------------------------------------------------------
DROP VIEW albo.v_fornitore_sintesi;
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
       (SELECT string_agg(a.codice || ' ' || ca.codice, ', ' ORDER BY a.ordine, a.codice, ca.codice)
          FROM albo.fornitore_codice_applicativo ca
          JOIN ref.applicativo a ON a.id = ca.applicativo_id
         WHERE ca.fornitore_id = f.id) AS codici_esterni,
       f.updated_at
FROM albo.fornitore f
LEFT JOIN albo.v_fornitore_stato_corrente sc ON sc.fornitore_id = f.id;

-- =============================================================================
-- Dati di SVILUPPO: lookup minime, menu, utenti di prova e fornitori fittizi.
-- Non eseguire in produzione: in produzione i dati arrivano dalla migrazione del legacy.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- Geografia
-- ---------------------------------------------------------------------------
INSERT INTO ref.area_geografica (id, codice, descrizione_it, descrizione_en, ordine) VALUES
  (1, 'EUR', 'Europa', 'Europe', 1),
  (2, 'ASI', 'Asia', 'Asia', 2),
  (3, 'NAM', 'Nord America', 'North America', 3);

INSERT INTO ref.nazione (id, codice, iso2, iso3, descrizione_it, descrizione_en, area_geografica_id, europa) VALUES
  (1, 'IT', 'IT', 'ITA', 'Italia', 'Italy', 1, true),
  (2, 'FR', 'FR', 'FRA', 'Francia', 'France', 1, true),
  (3, 'ES', 'ES', 'ESP', 'Spagna', 'Spain', 1, true),
  (4, 'PT', 'PT', 'PRT', 'Portogallo', 'Portugal', 1, true),
  (5, 'RO', 'RO', 'ROU', 'Romania', 'Romania', 1, true),
  (6, 'TR', 'TR', 'TUR', 'Turchia', 'Turkey', 2, false),
  (7, 'CN', 'CN', 'CHN', 'Cina', 'China', 2, false);

INSERT INTO ref.regione (id, codice, descrizione_it, nazione_id) VALUES
  (1, 'TOS', 'Toscana', 1), (2, 'LOM', 'Lombardia', 1), (3, 'VEN', 'Veneto', 1),
  (4, 'MAR', 'Marche', 1), (5, 'CAM', 'Campania', 1);

INSERT INTO ref.provincia (id, codice, sigla, descrizione_it, regione_id) VALUES
  (1, 'FI', 'FI', 'Firenze', 1), (2, 'AR', 'AR', 'Arezzo', 1),
  (3, 'MI', 'MI', 'Milano', 2),  (4, 'BG', 'BG', 'Bergamo', 2),
  (5, 'VE', 'VE', 'Venezia', 3), (6, 'TV', 'TV', 'Treviso', 3),
  (7, 'FM', 'FM', 'Fermo', 4),   (8, 'MC', 'MC', 'Macerata', 4),
  (9, 'NA', 'NA', 'Napoli', 5);

INSERT INTO ref.localita (id, descrizione_it, nazione_id, provincia_id, cap_default) VALUES
  (1, 'Firenze', 1, 1, '50100'), (2, 'Scandicci', 1, 1, '50018'),
  (3, 'Montevarchi', 1, 2, '52025'), (4, 'Terranuova Bracciolini', 1, 2, '52028'),
  (5, 'Milano', 1, 3, '20100'), (6, 'Bergamo', 1, 4, '24100'),
  (7, 'Fiesso d''Artico', 1, 5, '30032'), (8, 'Montebelluna', 1, 6, '31044'),
  (9, 'Montegranaro', 1, 7, '63812'), (10, 'Civitanova Marche', 1, 8, '62012'),
  (11, 'Napoli', 1, 9, '80100'),
  (12, 'Parigi', 2, NULL, NULL), (13, 'Felgueiras', 4, NULL, NULL),
  (14, 'Timisoara', 5, NULL, NULL), (15, 'Istanbul', 6, NULL, NULL), (16, 'Dongguan', 7, NULL, NULL);

-- ---------------------------------------------------------------------------
-- Lookup
-- ---------------------------------------------------------------------------
INSERT INTO ref.tipo_indirizzo (id, codice, descrizione_it, descrizione_en, ordine) VALUES
  (1, 'LEG', 'Sede legale', 'Registered office', 1),
  (2, 'OPE', 'Sede operativa', 'Operating site', 2),
  (3, 'STA', 'Stabilimento', 'Plant', 3),
  (4, 'MAG', 'Magazzino', 'Warehouse', 4);

INSERT INTO ref.stato_fornitore (id, codice, descrizione_it, descrizione_en, ordine) VALUES
  (1, 'QUALIFICA', 'In qualifica', 'Under qualification', 1),
  (2, 'QUALIFICATO', 'Qualificato', 'Qualified', 2),
  (3, 'SOSPESO', 'Sospeso', 'Suspended', 3),
  (4, 'CESSATO', 'Non più attivo', 'No longer active', 4);

INSERT INTO ref.valuta (id, codice, descrizione_it, descrizione_en) VALUES
  (1, 'EUR', 'Euro', 'Euro'), (2, 'USD', 'Dollaro USA', 'US dollar'), (3, 'CNY', 'Renminbi', 'Renminbi');

INSERT INTO ref.societa (id, codice, descrizione_it) VALUES
  (1, 'S01', 'Capogruppo Italia S.p.A.'), (2, 'S02', 'Retail Europa S.r.l.');

INSERT INTO ref.marchio (id, codice, descrizione_it) VALUES (1, 'PR', 'Prada'), (2, 'MM', 'Miu Miu');

INSERT INTO ref.ente (id, codice, descrizione_it, descrizione_en, ordine) VALUES
  (1, 'PELL', 'Pelletteria', 'Leather goods', 1),
  (2, 'ABB',  'Abbigliamento', 'Ready-to-wear', 2),
  (3, 'CALZ', 'Calzature', 'Footwear', 3),
  (4, 'TESS', 'Tessuti', 'Fabrics', 4),
  (5, 'LOG',  'Logistica', 'Logistics', 5);

INSERT INTO ref.classe_merceologica (id, codice, descrizione_it, descrizione_en) VALUES
  (1, 'PEL', 'Pellame', 'Leather'), (2, 'TES', 'Tessuti', 'Fabrics'),
  (3, 'MET', 'Accessori metallici', 'Metal hardware'), (4, 'CTE', 'Lavorazioni conto terzi', 'Contract manufacturing'),
  (5, 'TRA', 'Trasporti', 'Transport');

INSERT INTO ref.punteggio_valutazione (valore, descrizione_it, descrizione_en) VALUES
  (1, 'Insufficiente', 'Poor'), (2, 'Sufficiente', 'Fair'), (3, 'Buono', 'Good'),
  (4, 'Ottimo', 'Very good'), (5, 'Eccellente', 'Excellent');

-- ---------------------------------------------------------------------------
-- Menu e permessi
-- ---------------------------------------------------------------------------
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
  (51, 50, 'UTENTI', 'FUNZIONE', '/amministrazione/utenti', 1, false, false, NULL);

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
  (51,'IT','Utenti e abilitazioni'), (51,'EN','Users and permissions');

INSERT INTO iam.gruppo (id, codice, descrizione) VALUES
  (1, 'CONSULTAZIONE', 'Consultazione albo'),
  (2, 'AMMINISTRAZIONE', 'Amministratori');

INSERT INTO iam.gruppo_funzione (gruppo_id, funzione_id)
SELECT 1, id FROM iam.funzione WHERE livello = 'FUNZIONE' AND codice <> 'UTENTI';
INSERT INTO iam.gruppo_funzione (gruppo_id, funzione_id)
SELECT 2, id FROM iam.funzione WHERE livello = 'FUNZIONE';

INSERT INTO iam.utente (id, username, cognome, nome, email, lingua, flag_lettura, flag_scrittura, attivo) VALUES
  (1, 'admin',    'Amministratore', 'Albo', 'admin@example.test', 'IT', true, true, true),
  (2, 'mrossi',   'Rossi',   'Mario', 'mario.rossi@example.test', 'IT', true, true, true),
  (3, 'lbianchi', 'Bianchi', 'Laura', 'laura.bianchi@example.test', 'EN', true, false, true),
  (4, 'exutente', 'Verdi',   'Paolo', NULL, 'IT', true, false, false);

INSERT INTO iam.utente_gruppo VALUES (1, 2), (2, 1), (3, 1), (4, 1);
INSERT INTO iam.utente_ente (utente_id, ente_id) SELECT 1, id FROM ref.ente;
INSERT INTO iam.utente_ente VALUES (2, 1), (2, 3);

-- ---------------------------------------------------------------------------
-- Fornitori fittizi
-- ---------------------------------------------------------------------------
INSERT INTO albo.fornitore (id, ragione_sociale, partita_iva, partita_iva_cee, codice_fiscale, telefono,
  denominazione_sociale, sede_legale, data_inizio_attivita, data_inizio_rapporto, data_fine_rapporto,
  uf, email, email_pec, numero_rea, sito_web, master_sync_at) VALUES
  (1001, 'Pelletteria Città di Scandicci S.r.l.', '05123450487', 'IT05123450487', '05123450487', '+39 055 7350001',
   'Pelletteria Città di Scandicci', 'Via dei Pratoni 12, Scandicci (FI)', '1998-03-01', '2006-01-15', NULL,
   'ACQ-PELL', 'ordini@pellscandicci.example', 'pellscandicci@pec.example', 'FI-512345', 'https://pellscandicci.example', now()),
  (1002, 'Conceria del Valdarno S.p.A.', '01987650513', 'IT01987650513', '01987650513', '+39 055 9100200',
   'Conceria del Valdarno', 'Via Leona 5, Montevarchi (AR)', '1972-05-10', '2001-09-01', NULL,
   'ACQ-MP', 'info@conceriavaldarno.example', NULL, 'AR-198765', NULL, now()),
  (1003, 'Conceria Valdarno Rifinizione S.r.l.', '02345670518', NULL, '02345670518', NULL,
   NULL, NULL, '2019-02-01', '2019-03-01', NULL, 'ACQ-MP', NULL, NULL, NULL, NULL, now()),
  (1004, 'Rifinizione Arno S.n.c.', '00876540514', NULL, '00876540514', NULL,
   NULL, NULL, '1985-01-01', '2003-01-01', '2019-02-28', 'ACQ-MP', NULL, NULL, NULL, NULL, now()),
  (1005, 'Calzaturificio Riviera del Brenta S.r.l.', '03456780271', 'IT03456780271', '03456780271', '+39 041 5160300',
   NULL, 'Via Naviglio 40, Fiesso d''Artico (VE)', '1990-06-01', '2010-04-01', NULL, 'ACQ-CALZ',
   'commerciale@rivierabrenta.example', NULL, 'VE-345678', NULL, now()),
  (1006, 'Tomaificio Montegranaro S.a.s.', '01234560441', NULL, '01234560441', NULL,
   NULL, NULL, NULL, '2015-07-01', NULL, 'ACQ-CALZ', NULL, NULL, NULL, NULL, now()),
  (1007, 'Confezioni Montebelluna S.p.A.', '04567890264', NULL, '04567890264', '+39 0423 600100',
   NULL, NULL, NULL, '2012-02-01', NULL, 'ACQ-ABB', 'info@confmontebelluna.example', NULL, NULL, NULL, now()),
  (1008, 'Tessitura Bergamasca S.r.l.', '02233440168', NULL, '02233440168', NULL,
   NULL, NULL, NULL, '2008-05-01', NULL, 'ACQ-MP', NULL, NULL, NULL, NULL, now()),
  (1009, 'Atelier Couture Paris SAS', NULL, 'FR40123456789', NULL, '+33 1 40000000',
   NULL, NULL, NULL, '2018-09-01', NULL, 'ACQ-ABB', 'contact@ateliercouture.example', NULL, NULL, NULL, now()),
  (1010, 'Fábrica de Calçado Norte Lda', NULL, 'PT509876543', NULL, NULL,
   NULL, NULL, NULL, '2020-01-10', NULL, 'ACQ-CALZ', NULL, NULL, NULL, NULL, now()),
  (1011, 'Metalli Accessori Milano S.r.l.', '07654320965', NULL, '07654320965', NULL,
   NULL, NULL, NULL, '2016-11-01', NULL, 'ACQ-ACC', NULL, NULL, NULL, NULL, now()),
  (1012, 'Logistica Toscana Servizi S.r.l.', '06543210482', NULL, '06543210482', NULL,
   NULL, NULL, NULL, '2017-03-01', NULL, 'LOG', NULL, NULL, NULL, NULL, now());

UPDATE albo.fornitore SET sostituito_da_id = 1003 WHERE id = 1004;

INSERT INTO albo.fornitore_indirizzo (fornitore_id, tipo_indirizzo_id, localita_id, indirizzo, cap, telefono, principale, latitudine, longitudine) VALUES
  (1001, 1, 2, 'Via dei Pratoni 12', '50018', '+39 055 7350001', true, 43.7547, 11.1844),
  (1001, 3, 2, 'Via del Padule 8', '50018', NULL, false, 43.7671, 11.1702),
  (1002, 1, 3, 'Via Leona 5', '52025', NULL, true, 43.5236, 11.5652),
  (1003, 1, 4, 'Via Poggilupi 22', '52028', NULL, true, NULL, NULL),
  (1004, 1, 4, 'Via Vecchia Aretina 3', '52028', NULL, true, NULL, NULL),
  (1005, 1, 7, 'Via Naviglio 40', '30032', NULL, true, 45.4117, 12.0306),
  (1006, 1, 9, 'Contrada Santa Maria 14', '63812', NULL, true, NULL, NULL),
  (1007, 1, 8, 'Via Feltrina Sud 210', '31044', NULL, true, NULL, NULL),
  (1008, 1, 6, 'Via Grumello 61', '24127', NULL, true, NULL, NULL),
  (1009, 1, 12, '18 rue du Faubourg Saint-Honoré', '75008', NULL, true, NULL, NULL),
  (1010, 1, 13, 'Rua da Indústria 77', '4610-102', NULL, true, NULL, NULL),
  (1011, 1, 5, 'Via Mecenate 76', '20138', NULL, true, NULL, NULL),
  (1012, 1, 1, 'Via di Novoli 40', '50127', NULL, true, NULL, NULL),
  (1012, 4, 2, 'Via Charta 77', '50018', NULL, false, NULL, NULL);

INSERT INTO albo.fornitore_codice_applicativo (fornitore_id, applicativo_id, codice) VALUES
  (1001, 1, '100045'), (1001, 2, 'ST-0045'), (1002, 1, '100212'), (1003, 1, '100988'),
  (1004, 1, '100031'), (1005, 1, '100377'), (1005, 2, 'ST-0377'), (1006, 2, 'ST-0412'),
  (1007, 2, 'ST-0520'), (1008, 1, '100640'), (1009, 1, '100701'), (1010, 1, '100815'),
  (1011, 1, '100902'), (1012, 1, '100950');

INSERT INTO albo.fornitore_marchio (fornitore_id, marchio_id) VALUES
  (1001, 1), (1001, 2), (1002, 1), (1005, 1), (1007, 2), (1009, 2), (1010, 1);

INSERT INTO albo.fornitore_stato (fornitore_id, stato_id, data_da) VALUES
  (1001, 1, '2006-01-15'), (1001, 2, '2006-06-30'),
  (1002, 2, '2001-12-01'), (1003, 2, '2019-03-01'),
  (1004, 2, '2003-06-01'), (1004, 4, '2019-02-28'),
  (1005, 2, '2010-09-01'), (1006, 2, '2015-10-01'), (1006, 3, '2025-11-20'),
  (1007, 2, '2012-05-01'), (1008, 2, '2008-09-01'), (1009, 1, '2018-09-01'),
  (1010, 1, '2020-01-10'), (1011, 2, '2017-01-15'), (1012, 2, '2017-06-01');

INSERT INTO albo.fornitore_ente (fornitore_id, ente_id) VALUES
  (1001, 1), (1002, 1), (1003, 1), (1005, 3), (1006, 3), (1007, 2), (1008, 4), (1009, 2), (1010, 3), (1012, 5);

INSERT INTO albo.fornitore_valutazione (fornitore_id, ente_id, val_qualita_prodotto, val_tempi_consegna, val_generale, punti_forti) VALUES
  (1001, 1, 5, 4, 4, 'Qualità delle cuciture e campionatura rapida'),
  (1002, 1, 4, 3, 4, NULL),
  (1005, 3, 3, 3, 3, NULL),
  (1006, 3, 2, 2, 2, NULL);

INSERT INTO albo.fornitore_collegamento (fornitore_da_id, fornitore_a_id, tipo) VALUES
  (1002, 1003, 'CONSOLIDATO'),
  (1003, 1004, 'PADRE_FIGLIO'),
  (1005, 1010, 'ALTERNATIVO');

INSERT INTO albo.subfornitore (fornitore_id, ragione_sociale, partita_iva, nazione_id, provincia_id, localita, numero_addetti) VALUES
  (1001, 'Laboratorio Tagli Lastra S.n.c.', '06111220481', 1, 1, 'Lastra a Signa', 9);

INSERT INTO albo.fornitore_preferito (utente_id, fornitore_id) VALUES (2, 1001), (2, 1011);

INSERT INTO ext.fatturato_passivo (fornitore_id, societa_id, anno, valuta_id, totale, totale_eur) VALUES
  (1001, 1, 2024, 1, 4820000, 4820000), (1001, 1, 2025, 1, 5210000, 5210000),
  (1002, 1, 2025, 1, 2100000, 2100000), (1003, 1, 2025, 1, 640000, 640000),
  (1004, 1, 2018, 1, 380000, 380000), (1005, 1, 2025, 1, 3150000, 3150000);
INSERT INTO ext.fatturato_attivo (fornitore_id, societa_id, anno, valuta_id, totale, totale_eur) VALUES
  (1008, 1, 2025, 1, 45000, 45000);
INSERT INTO ext.ordinato_sap (fornitore_id, societa_id, ente_id, cod_gruppo_acquisto, anno, valuta_id, importo) VALUES
  (1001, 1, 1, 'G10', 2026, 1, 2950000), (1005, 1, 3, 'G30', 2026, 1, 1400000);
INSERT INTO ext.ordinato_st3 (fornitore_id, societa_id, ente_id, anno, valuta_id, importo) VALUES
  (1007, 1, 2, 2026, 1, 870000);

-- Riallinea le sequenze dopo gli inserimenti con ID espliciti
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS s, c.relname AS t, a.attname AS col
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE a.attidentity IN ('a', 'd') AND n.nspname IN ('ref', 'iam', 'albo', 'ext')
  LOOP
    EXECUTE format('SELECT setval(pg_get_serial_sequence(%L, %L), GREATEST((SELECT COALESCE(max(%I), 0) FROM %I.%I), 1))',
                   r.s || '.' || r.t, r.col, r.col, r.s, r.t);
  END LOOP;
END $$;

COMMIT;

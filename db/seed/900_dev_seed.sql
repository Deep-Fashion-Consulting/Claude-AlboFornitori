-- =============================================================================
-- Dati di SVILUPPO: liste di valori di prova, utenti di prova e fornitori fittizi.
-- Non eseguire in produzione. Geografia, valute, menu e gruppi arrivano dalle migrazioni:
-- qui si fa riferimento a località, province, nazioni e valute per codice, mai per id.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- Geografia
-- ---------------------------------------------------------------------------
-- Località estere di prova (i comuni italiani sono nella migrazione 010)
INSERT INTO ref.localita (descrizione_it, nazione_id)
SELECT v.nome, n.id
  FROM (VALUES ('Parigi', 'FR'), ('Felgueiras', 'PT'), ('Timisoara', 'RO'), ('Istanbul', 'TR'), ('Dongguan', 'CN')) AS v(nome, iso)
  JOIN ref.nazione n ON n.iso2 = v.iso
 WHERE NOT EXISTS (SELECT 1 FROM ref.localita l WHERE l.nazione_id = n.id AND lower(l.descrizione_it) = lower(v.nome));

-- ---------------------------------------------------------------------------
-- Lookup
-- ---------------------------------------------------------------------------
-- Sistemi esterni di prova (in produzione li configura l'amministratore)
INSERT INTO ref.applicativo (codice, descrizione_it, descrizione_en, ordine) VALUES
  ('SAP', 'SAP', 'SAP', 1),
  ('ST3', 'Stealth (ST3)', 'Stealth (ST3)', 2)
ON CONFLICT (codice) DO NOTHING;

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

INSERT INTO iam.utente (id, username, cognome, nome, email, lingua, flag_lettura, flag_scrittura, attivo) VALUES
  (1, 'admin',    'Amministratore', 'Albo', 'admin@example.test', 'IT', true, true, true),
  (2, 'mrossi',   'Rossi',   'Mario', 'mario.rossi@example.test', 'IT', true, true, true),
  (3, 'lbianchi', 'Bianchi', 'Laura', 'laura.bianchi@example.test', 'EN', true, false, true),
  (4, 'exutente', 'Verdi',   'Paolo', NULL, 'IT', true, false, false);

INSERT INTO iam.utente_gruppo (utente_id, gruppo_id)
SELECT u.id, g.id
  FROM (VALUES ('admin', 'AMMINISTRAZIONE'), ('mrossi', 'CONSULTAZIONE'), ('lbianchi', 'CONSULTAZIONE'), ('exutente', 'CONSULTAZIONE')) AS v(username, gruppo)
  JOIN iam.utente u ON u.username = v.username
  JOIN iam.gruppo g ON g.codice = v.gruppo;
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

-- pg_temp.cat(): comune per codice catastale; pg_temp.est(): località estera per nazione e nome
CREATE FUNCTION pg_temp.cat(c text) RETURNS bigint LANGUAGE sql AS $$ SELECT id FROM ref.localita WHERE codice = c $$;
CREATE FUNCTION pg_temp.est(iso text, nome text) RETURNS bigint LANGUAGE sql AS $$
  SELECT l.id FROM ref.localita l JOIN ref.nazione n ON n.id = l.nazione_id WHERE n.iso2 = iso AND l.descrizione_it = nome $$;

INSERT INTO albo.fornitore_indirizzo (fornitore_id, tipo_indirizzo_id, localita_id, indirizzo, cap, telefono, principale, latitudine, longitudine) VALUES
  (1001, 1, pg_temp.cat('B962'), 'Via dei Pratoni 12', '50018', '+39 055 7350001', true, 43.7547, 11.1844),
  (1001, 3, pg_temp.cat('B962'), 'Via del Padule 8', '50018', NULL, false, 43.7671, 11.1702),
  (1002, 1, pg_temp.cat('F656'), 'Via Leona 5', '52025', NULL, true, 43.5236, 11.5652),
  (1003, 1, pg_temp.cat('L123'), 'Via Poggilupi 22', '52028', NULL, true, NULL, NULL),
  (1004, 1, pg_temp.cat('L123'), 'Via Vecchia Aretina 3', '52028', NULL, true, NULL, NULL),
  (1005, 1, pg_temp.cat('D578'), 'Via Naviglio 40', '30032', NULL, true, 45.4117, 12.0306),
  (1006, 1, pg_temp.cat('F522'), 'Contrada Santa Maria 14', '63812', NULL, true, NULL, NULL),
  (1007, 1, pg_temp.cat('F443'), 'Via Feltrina Sud 210', '31044', NULL, true, NULL, NULL),
  (1008, 1, pg_temp.cat('A794'), 'Via Grumello 61', '24127', NULL, true, NULL, NULL),
  (1009, 1, pg_temp.est('FR', 'Parigi'), '18 rue du Faubourg Saint-Honoré', '75008', NULL, true, NULL, NULL),
  (1010, 1, pg_temp.est('PT', 'Felgueiras'), 'Rua da Indústria 77', '4610-102', NULL, true, NULL, NULL),
  (1011, 1, pg_temp.cat('F205'), 'Via Mecenate 76', '20138', NULL, true, NULL, NULL),
  (1012, 1, pg_temp.cat('D612'), 'Via di Novoli 40', '50127', NULL, true, NULL, NULL),
  (1012, 4, pg_temp.cat('B962'), 'Via Charta 77', '50018', NULL, false, NULL, NULL);

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
  (1001, 'Laboratorio Tagli Lastra S.n.c.', '06111220481', (SELECT id FROM ref.nazione WHERE iso2 = 'IT'),
   (SELECT id FROM ref.provincia WHERE sigla = 'FI'), 'Lastra a Signa', 9);

INSERT INTO albo.fornitore_preferito (utente_id, fornitore_id) VALUES (2, 1001), (2, 1011);

-- Dati economici importati di prova, tutti in euro
INSERT INTO ext.fatturato_passivo (fornitore_id, societa_id, anno, valuta_id, totale, totale_eur)
SELECT f, 1, a, (SELECT id FROM ref.valuta WHERE codice = 'EUR'), t, t
  FROM (VALUES (1001, 2024, 4820000), (1001, 2025, 5210000), (1002, 2025, 2100000),
               (1003, 2025, 640000), (1004, 2018, 380000), (1005, 2025, 3150000)) AS v(f, a, t);
INSERT INTO ext.fatturato_attivo (fornitore_id, societa_id, anno, valuta_id, totale, totale_eur)
SELECT 1008, 1, 2025, id, 45000, 45000 FROM ref.valuta WHERE codice = 'EUR';
INSERT INTO ext.ordinato_sap (fornitore_id, societa_id, ente_id, cod_gruppo_acquisto, anno, valuta_id, importo)
SELECT f, 1, e, g, 2026, (SELECT id FROM ref.valuta WHERE codice = 'EUR'), i
  FROM (VALUES (1001, 1, 'G10', 2950000), (1005, 3, 'G30', 1400000)) AS v(f, e, g, i);
INSERT INTO ext.ordinato_st3 (fornitore_id, societa_id, ente_id, anno, valuta_id, importo)
SELECT 1007, 1, 2, 2026, id, 870000 FROM ref.valuta WHERE codice = 'EUR';

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

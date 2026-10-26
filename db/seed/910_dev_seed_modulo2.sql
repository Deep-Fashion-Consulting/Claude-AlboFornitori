-- =============================================================================
-- Dati di SVILUPPO per il modulo 2 (struttura societaria).
-- Si può eseguire su un database che ha già 900_dev_seed.sql.
-- =============================================================================
BEGIN;

INSERT INTO ref.tipo_immobile (id, codice, descrizione_it, descrizione_en, ordine) VALUES
  (1, 'PROP', 'Di proprietà', 'Owned', 1),
  (2, 'AFF',  'In affitto', 'Rented', 2),
  (3, 'LEAS', 'In leasing', 'Leased', 3);

INSERT INTO ref.tipo_interlocutore (id, codice, descrizione_it, descrizione_en, ordine) VALUES
  (1, 'TIT', 'Titolare', 'Owner', 1),
  (2, 'COM', 'Commerciale', 'Sales', 2),
  (3, 'PROD', 'Responsabile produzione', 'Production manager', 3),
  (4, 'QUAL', 'Responsabile qualità', 'Quality manager', 4),
  (5, 'AMM', 'Amministrazione', 'Accounting', 5);

INSERT INTO albo.fornitore_struttura (fornitore_id, capitale_sociale, capitale_sociale_valuta_id, capitale_versato,
  capitale_versato_valuta_id, numero_addetti, nota_numero_addetti, immobile_mq, tipo_immobile_id,
  tipologia_offerta, quota_mercato_prc, quota_mercato_descrizione) VALUES
  (1001, 100000, 1, 100000, 1, 48, 'Più 9 addetti presso il subfornitore di taglio', 2400, 1,
   'Borse e piccola pelletteria di fascia alta', 35, 'Circa un terzo del fatturato è verso il gruppo'),
  (1002, 1500000, 1, 1500000, 1, 130, NULL, 12000, 1, 'Pellami bovini e ovini per pelletteria e calzatura', 12, NULL);

INSERT INTO albo.fornitore_interlocutore (fornitore_id, tipo_interlocutore_id, nominativo, email, telefono, cellulare) VALUES
  (1001, 1, 'Giovanni Bartolini', 'g.bartolini@pellscandicci.example', '+39 055 7350001', '+39 335 1234567'),
  (1001, 3, 'Elena Conti', 'produzione@pellscandicci.example', '+39 055 7350012', NULL),
  (1002, 2, 'Marco Neri', 'commerciale@conceriavaldarno.example', NULL, '+39 347 7654321');

SELECT setval(pg_get_serial_sequence('albo.fornitore_interlocutore', 'id'),
              (SELECT max(id) FROM albo.fornitore_interlocutore));
SELECT setval(pg_get_serial_sequence('ref.tipo_immobile', 'id'), 3);
SELECT setval(pg_get_serial_sequence('ref.tipo_interlocutore', 'id'), 5);

COMMIT;

-- =============================================================================
-- Albo Fornitori - Migrazione 008
-- L'Albo è la fonte principale delle anagrafiche: i fornitori si creano e si modificano qui.
-- Un ERP del cliente, se presente, potrà alimentarle tramite importazione.
-- =============================================================================

ALTER TABLE albo.fornitore ALTER COLUMN fonte_master SET DEFAULT 'ALBO';
UPDATE albo.fornitore SET fonte_master = 'ALBO' WHERE fonte_master = 'ERP';

COMMENT ON TABLE albo.fornitore IS
  'Fornitore. Creato e gestito nell''Albo; i dati possono anche arrivare da un ERP tramite importazione.';
COMMENT ON COLUMN albo.fornitore.fonte_master IS
  'Origine dei dati anagrafici: ALBO (inseriti qui) oppure il codice del sistema da cui sono stati importati.';
COMMENT ON COLUMN albo.fornitore.master_sync_at IS 'Ultima importazione da un sistema esterno; NULL se i dati sono inseriti nell''Albo.';
UPDATE albo.fornitore SET master_sync_at = NULL WHERE fonte_master = 'ALBO';

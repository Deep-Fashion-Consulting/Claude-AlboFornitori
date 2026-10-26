-- =============================================================================
-- Albo Fornitori - Migrazione 007
-- Autenticazione con utente e password gestiti dall'Albo (sostituisce OIDC).
-- =============================================================================

ALTER TABLE iam.utente
  DROP COLUMN oidc_subject,
  DROP COLUMN legacy_id_persona,
  ADD COLUMN password_hash       text,
  ADD COLUMN password_cambiata_il timestamptz,
  ADD COLUMN tentativi_falliti   smallint NOT NULL DEFAULT 0,
  ADD COLUMN bloccato_fino_al    timestamptz;

COMMENT ON TABLE  iam.utente IS 'Utente applicativo con credenziali gestite dall''Albo.';
COMMENT ON COLUMN iam.utente.username IS 'Nome utente per l''accesso, sempre in minuscolo.';
COMMENT ON COLUMN iam.utente.password_hash IS
  'Hash scrypt nel formato scrypt$N$r$p$sale$hash. NULL = utente senza password, non può accedere.';
COMMENT ON COLUMN iam.utente.tentativi_falliti IS 'Accessi falliti consecutivi; si azzera al primo accesso riuscito.';
COMMENT ON COLUMN iam.utente.bloccato_fino_al IS 'Blocco temporaneo dopo troppi tentativi falliti.';

-- Sessioni: il browser conserva un token casuale in un cookie; qui si salva solo il suo hash SHA-256,
-- così chi legge il database non può usare le sessioni.
CREATE TABLE iam.sessione (
  token_hash     char(64) PRIMARY KEY,
  utente_id      bigint NOT NULL REFERENCES iam.utente(id) ON DELETE CASCADE,
  creata_il      timestamptz NOT NULL DEFAULT now(),
  ultimo_uso_il  timestamptz NOT NULL DEFAULT now(),
  scade_il       timestamptz NOT NULL,
  ip             inet,
  user_agent     varchar(300)
);
CREATE INDEX ix_sessione_utente ON iam.sessione(utente_id);
CREATE INDEX ix_sessione_scadenza ON iam.sessione(scade_il);
COMMENT ON TABLE iam.sessione IS 'Sessioni attive. Il logout cancella la riga; le sessioni scadute vengono rimosse al login.';

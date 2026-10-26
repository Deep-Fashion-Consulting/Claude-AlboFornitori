-- =============================================================================
-- Albo Fornitori - Migrazione 002
-- Lookup e geografia (ex OCA.ANAGRAFICA.TIPO_*, NAZIONE, REGIONE, LOCALITA, TBL_Province, ...)
-- Convenzione: [H#] = ipotesi da verificare sui dati reali (vedi db/README.md)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Lingue UI
-- -----------------------------------------------------------------------------
CREATE TABLE ref.lingua (
  codice      char(2) PRIMARY KEY,
  descrizione varchar(50) NOT NULL
);
INSERT INTO ref.lingua (codice, descrizione) VALUES ('IT', 'Italiano'), ('EN', 'English');

-- -----------------------------------------------------------------------------
-- Geografia: nazione -> regione -> provincia -> localita'
-- -----------------------------------------------------------------------------
CREATE TABLE ref.area_geografica (LIKE common.lookup_template INCLUDING ALL);
COMMENT ON TABLE ref.area_geografica IS 'Ex OCA.ANAGRAFICA.AREA_GEOGRAFICA (trasporti "resto del mondo").';

CREATE TABLE ref.nazione (
  LIKE common.lookup_template INCLUDING ALL,
  iso2               char(2) UNIQUE,
  iso3               char(3) UNIQUE,
  area_geografica_id integer REFERENCES ref.area_geografica(id),
  europa             boolean NOT NULL DEFAULT false
);
COMMENT ON TABLE  ref.nazione IS 'Ex OCA.ANAGRAFICA.NAZIONE.';
COMMENT ON COLUMN ref.nazione.europa IS
  '[H1] Usato per la lista "Trasporti internazionali Europa (nazione)". Da valorizzare con la stessa lista del legacy.';

CREATE TABLE ref.regione (
  LIKE common.lookup_template INCLUDING ALL,
  nazione_id integer NOT NULL REFERENCES ref.nazione(id)
);
CREATE INDEX ix_regione_nazione ON ref.regione(nazione_id);
COMMENT ON TABLE ref.regione IS 'Ex OCA.ANAGRAFICA.REGIONE / TBL_Regioni.';

CREATE TABLE ref.provincia (
  LIKE common.lookup_template INCLUDING ALL,
  regione_id integer NOT NULL REFERENCES ref.regione(id),
  sigla      varchar(5)
);
CREATE INDEX ix_provincia_regione ON ref.provincia(regione_id);
COMMENT ON TABLE ref.provincia IS 'Ex GSR.dbo.TBL_Province.';

CREATE TABLE ref.localita (
  LIKE common.lookup_template INCLUDING ALL,
  nazione_id    integer NOT NULL REFERENCES ref.nazione(id),
  provincia_id  integer REFERENCES ref.provincia(id),
  codice_istat  varchar(10),
  cap_default   varchar(10)
);
CREATE INDEX ix_localita_provincia ON ref.localita(provincia_id);
CREATE INDEX ix_localita_nazione   ON ref.localita(nazione_id);
COMMENT ON TABLE ref.localita IS
  'Ex OCA.ANAGRAFICA.LOCALITA + VIEW_COMUNIITALIANI. provincia_id NULL per localita estere.';

-- -----------------------------------------------------------------------------
-- Organizzazione interna
-- -----------------------------------------------------------------------------
CREATE TABLE ref.ente (
  LIKE common.lookup_template INCLUDING ALL,
  codice_plant varchar(20)
);
COMMENT ON TABLE ref.ente IS
  'Ente fornitore / unita di business che usa il fornitore (ex VIEW_ENTE_FORNITORE, TB_ENTE_COMMESSA, VdmPlant00). '
  'E'' la dimensione su cui si applicano visibilita, produzione e valutazioni.';

CREATE TABLE ref.societa (LIKE common.lookup_template INCLUDING ALL);
COMMENT ON TABLE ref.societa IS 'Societa del gruppo (ex OCA.PERSONALE.SOCIETA) per ordinato/fatturato e pagamenti.';

CREATE TABLE ref.marchio (LIKE common.lookup_template INCLUDING ALL);
CREATE TABLE ref.divisione (LIKE common.lookup_template INCLUDING ALL);
COMMENT ON TABLE ref.divisione IS '[H2] Divisione di FORNITORE_MARCHIO_DIVISIONE; struttura da confermare.';

CREATE TABLE ref.applicativo (LIKE common.lookup_template INCLUDING ALL);
COMMENT ON TABLE ref.applicativo IS 'Sistemi esterni che assegnano un codice al fornitore (SAP, ST3/Stealth, ...).';
INSERT INTO ref.applicativo (codice, descrizione_it, descrizione_en, ordine) VALUES
  ('SAP', 'SAP', 'SAP', 1),
  ('ST3', 'Stealth (ST3)', 'Stealth (ST3)', 2);

CREATE TABLE ref.valuta (LIKE common.lookup_template INCLUDING ALL);
COMMENT ON COLUMN ref.valuta.codice IS 'Codice ISO 4217 (EUR, USD, ...).';

-- -----------------------------------------------------------------------------
-- Anagrafica fornitore
-- -----------------------------------------------------------------------------
CREATE TABLE ref.stato_fornitore      (LIKE common.lookup_template INCLUDING ALL);
COMMENT ON TABLE ref.stato_fornitore IS 'Stati/tipi assegnabili al fornitore con data (ex ddltipoforn, TB_FORNITORE_STATO).';
CREATE TABLE ref.tipo_indirizzo       (LIKE common.lookup_template INCLUDING ALL);
CREATE TABLE ref.tipo_immobile        (LIKE common.lookup_template INCLUDING ALL);
CREATE TABLE ref.tipo_interlocutore   (LIKE common.lookup_template INCLUDING ALL);
CREATE TABLE ref.modalita_pagamento   (LIKE common.lookup_template INCLUDING ALL);
CREATE TABLE ref.condizione_pagamento (LIKE common.lookup_template INCLUDING ALL);

-- -----------------------------------------------------------------------------
-- Contratti e certificazioni
-- -----------------------------------------------------------------------------
CREATE TABLE ref.tipo_contratto   (LIKE common.lookup_template INCLUDING ALL);
CREATE TABLE ref.tipo_durata      (LIKE common.lookup_template INCLUDING ALL);
CREATE TABLE ref.tipo_certificato (LIKE common.lookup_template INCLUDING ALL);
CREATE TABLE ref.stagione         (LIKE common.lookup_template INCLUDING ALL);

-- -----------------------------------------------------------------------------
-- Produzione
-- -----------------------------------------------------------------------------
CREATE TABLE ref.classe_merceologica (LIKE common.lookup_template INCLUDING ALL);
CREATE TABLE ref.sottoclasse_merceologica (
  LIKE common.lookup_template INCLUDING ALL,
  classe_merceologica_id integer NOT NULL REFERENCES ref.classe_merceologica(id)
);
CREATE INDEX ix_sottoclasse_classe ON ref.sottoclasse_merceologica(classe_merceologica_id);

CREATE TABLE ref.tipo_prodotto_fornitore          (LIKE common.lookup_template INCLUDING ALL);
CREATE TABLE ref.percentuale_prada                (LIKE common.lookup_template INCLUDING ALL);
COMMENT ON TABLE ref.percentuale_prada IS 'Fasce "% utilizzo PRADA" (ex ID_TIPO_PERCENTUALE_PRADA).';
CREATE TABLE ref.tipo_macchina                    (LIKE common.lookup_template INCLUDING ALL);
CREATE TABLE ref.unita_misura                     (LIKE common.lookup_template INCLUDING ALL);
CREATE TABLE ref.tipo_lavorazione_mp              (LIKE common.lookup_template INCLUDING ALL);
CREATE TABLE ref.tipo_produzione_calzature_mp     (LIKE common.lookup_template INCLUDING ALL);
CREATE TABLE ref.tipo_realizzazione_modelli_rtw   (LIKE common.lookup_template INCLUDING ALL);
COMMENT ON TABLE ref.tipo_realizzazione_modelli_rtw IS 'Ex TIPO_REALIZZAZIONE_MODELLI_ABBIGLIAMENTO_FACON.';

-- -----------------------------------------------------------------------------
-- Logistica
-- -----------------------------------------------------------------------------
CREATE TABLE ref.sottotipologia_fornitore  (LIKE common.lookup_template INCLUDING ALL);
CREATE TABLE ref.trasporto_distribuzione   (LIKE common.lookup_template INCLUDING ALL);
CREATE TABLE ref.trasporto_altro_servizio  (LIKE common.lookup_template INCLUDING ALL);

CREATE TABLE ref.capacita_risposta_picchi (LIKE common.lookup_template INCLUDING ALL);
COMMENT ON TABLE ref.capacita_risposta_picchi IS
  'Ex ID_CAPACITA_RISPOSTA_PICCHI: unico campo logistico che nel legacy e'' un riferimento a una lista, non un valore.';

-- -----------------------------------------------------------------------------
-- Compliance e valutazione
-- -----------------------------------------------------------------------------
CREATE TABLE ref.esito_compliance (LIKE common.lookup_template INCLUDING ALL);
COMMENT ON TABLE ref.esito_compliance IS
  '[H4] Valori delle DropDownList di compliance (es. Si / No / In corso / Non applicabile).';

CREATE TABLE ref.tipo_ambiente_lavoro (LIKE common.lookup_template INCLUDING ALL);
COMMENT ON TABLE ref.tipo_ambiente_lavoro IS 'Ex OCA.ANAGRAFICA.TIPO_AMBIENTE_FORNITORE ("Stato ambiente lavoro").';

CREATE TABLE ref.punteggio_valutazione (
  valore         smallint PRIMARY KEY,
  descrizione_it varchar(100) NOT NULL,
  descrizione_en varchar(100),
  attivo         boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE ref.punteggio_valutazione IS
  '[H5] Scala configurabile dei punteggi di valutazione. La specifica richiede "range configurato": '
  'la scala vive qui e non in un CHECK.';

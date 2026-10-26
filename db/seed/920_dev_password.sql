-- =============================================================================
-- Dati di SVILUPPO: password degli utenti di prova.
-- Password per tutti: Prova2026!   (non usare mai questi utenti in produzione)
-- In produzione il primo amministratore si crea con: npm run utente -- crea-admin
-- =============================================================================
BEGIN;
UPDATE iam.utente SET password_hash = 'scrypt$32768$8$1$7vpezF+2qvn3+FEjzpxqMQ==$g1Ff0zVLUQjwjHHhuPzGDI5QDOdGXh2O8gz4B6dkB+U92uMItJRwaQFoEeRRg7r+o5rQ3ORK99MRt/NLPplYdw==', password_cambiata_il = now() WHERE username = 'admin';
UPDATE iam.utente SET password_hash = 'scrypt$32768$8$1$bF2oaZWg0cnMr3kdqNdQOA==$EgMjeWWtbmn0rNGy3U1rGOCRk9im1M5je3khLCkSAP4IdaMdTmOj5k0bqpiXlfTWPt8L8dQsnleM61Z0Llmz4Q==', password_cambiata_il = now() WHERE username = 'mrossi';
UPDATE iam.utente SET password_hash = 'scrypt$32768$8$1$zfin5fGBk3Im6rqoDwjI5Q==$INxF0V7cemxfikHZbhsy+o8shG4d6tlz/fgN0CjBjcQxDOV/DKfVXUTpG8oG9PV9Vlpapvedx7gvVSG0vNy5kg==', password_cambiata_il = now() WHERE username = 'lbianchi';
UPDATE iam.utente SET password_hash = 'scrypt$32768$8$1$PRWx+l/ZtWFcsHU+EhRY2g==$u59B+Z5XpNICBnNK2wJvC9ML2bI5LZMaD3YW/13y4s0ue/ahNMSkcJGUgQxdG4p3Gs8QsSOptxr0ti1b7RO4hw==', password_cambiata_il = now() WHERE username = 'exutente';
COMMIT;

# Albo Fornitori — nuova versione

Riscrittura dell'applicazione Albo Fornitori (ASP.NET Web Forms + SQL Server) con:

- **backend** Node.js 22 + TypeScript + Fastify, API REST documentate con OpenAPI;
- **frontend** React 19 + Vite + React Query, interfaccia in italiano e inglese;
- **database** PostgreSQL 16, schema descritto in [`db/README.md`](db/README.md).

Il progetto procede a moduli. Sono completati:

- **modulo 1**: accesso, menu in base ai permessi, ricerca fornitori e scheda dati anagrafici;
- **modulo 2**: struttura societaria (struttura, interlocutori, subfornitori, collegamenti tra fornitori).

## Avvio in locale

Servono **Node.js 22.12** o successivo e **PostgreSQL 15** o successivo. In alternativa a un PostgreSQL installato, si può usare Docker con il `docker-compose.yml` incluso.

```bash
# 1. Configurazione
cp .env.example .env

# 2. Database: crea lo schema e carica i dati di prova al primo avvio
docker compose up -d db

# 3. Dipendenze (backend e frontend insieme)
npm install

# 4. Avvio, in due terminali
npm run dev:backend    # API su http://localhost:3000
npm run dev:frontend   # interfaccia su http://localhost:5173
```

Apri http://localhost:5173 e accedi con uno degli utenti di prova. In locale non c'è password: il login di sviluppo è attivo solo con `AUTH_MODE=dev` ed è rifiutato all'avvio se `NODE_ENV=production`.

| Utente | Cosa vede |
| --- | --- |
| `admin` | Tutte le funzioni e tutti gli enti, può modificare |
| `mrossi` | Lettura e modifica; abilitato sugli enti Pelletteria e Calzature |
| `lbianchi` | Sola lettura, nessun ente, interfaccia in inglese |
| `exutente` | Utente disattivato: l'accesso viene negato |

La documentazione delle API è su http://localhost:3000/docs.

Per ricreare il database da zero (per esempio dopo una modifica alle migrazioni): `docker compose down -v && docker compose up -d db`.

### Database senza Docker (Windows)

Con PostgreSQL installato direttamente, al posto del punto 2, nel Prompt dei comandi dalla cartella del progetto. Adatta la versione nel percorso di `psql`:

```bat
set PSQL="C:\Program Files\PostgreSQL\18\bin\psql.exe"
set PGCLIENTENCODING=UTF8
%PSQL% -U postgres -c "CREATE ROLE albo LOGIN PASSWORD 'albo';"
%PSQL% -U postgres -c "CREATE DATABASE albo OWNER albo;"
set PGPASSWORD=albo
for %f in (db\migrations\0*.sql db\seed\*.sql) do %PSQL% -U albo -d albo -v ON_ERROR_STOP=1 -f "%f"
```

`PGCLIENTENCODING=UTF8` evita che le lettere accentate dei dati vengano rovinate.

**Aggiornare un database già esistente.** Quando arrivano nuovi file in `db/migrations` o `db/seed`, esegui solo quelli nuovi, nell'ordine dei numeri. Per esempio, per i dati di prova del modulo 2:

```bat
%PSQL% -U albo -d albo -v ON_ERROR_STOP=1 -f db\seed\910_dev_seed_modulo2.sql
```

## Comandi

| Comando | Cosa fa |
| --- | --- |
| `npm test` | Test del backend, con il test runner integrato di Node. Quelli di integrazione partono solo se è impostata `TEST_DATABASE_URL` |
| `npm audit` | Controlla se le librerie installate hanno vulnerabilità note |
| `npm run typecheck` | Controllo dei tipi su backend e frontend |
| `npm run build` | Build di produzione in `backend/dist` e `frontend/dist` |

Test completi sul database di sviluppo:

```bash
# Windows (Prompt dei comandi)
set TEST_DATABASE_URL=postgres://albo:albo@localhost:5432/albo
npm test

# macOS / Linux
TEST_DATABASE_URL=postgres://albo:albo@localhost:5432/albo npm test
```

I test di integrazione modificano alcuni dati del fornitore 1011 e li ripristinano alla fine. Presuppongono il seed di sviluppo intatto.

## Struttura

```
db/
  migrations/        schema PostgreSQL (001–006), da applicare in ordine
  seed/              dati di sviluppo: lookup, menu, utenti e 12 fornitori fittizi
  init/              script usato da docker compose al primo avvio
backend/src/
  app.ts             composizione dell'applicazione Fastify
  auth/              verifica token (OIDC o sviluppo), utente corrente, permessi
  modules/session/   avvio sessione, utente corrente, lingua, menu
  modules/lookups/   liste di valori e geografia a cascata
  modules/suppliers/ ricerca, intestazione, dati anagrafici, stati, indirizzi, preferiti
  modules/company/   struttura societaria, interlocutori, subfornitori, collegamenti
backend/test/        test unitari e di integrazione
frontend/src/
  auth/              login, sessione, fornitore corrente
  api/               client HTTP, tipi, hook React Query
  components/        struttura dell'app, menu, fascia del fornitore, campi
  pages/             accesso, ricerca, dati anagrafici, struttura societaria
  i18n/              testi in italiano e inglese
```

## Come sono state tradotte le scelte del legacy

| Legacy | Nuova versione |
| --- | --- |
| Windows Authentication su IIS | Login OIDC (es. Microsoft Entra ID); il token è verificato dal backend a ogni richiesta |
| `Session("IGPSESS")` | Utente letto dal token e risolto su `iam.utente`, con permessi ed enti |
| `Session("IDFornitore")` | Fornitore nell'URL (`/fornitori/:id/...`); la fascia in alto lo mantiene come contesto anche tornando alla ricerca |
| Menu da `VIEW_AbilitazioniFunzioni` | `GET /api/menu`: stesse regole, controllate anche lato server su ogni API |
| SQL concatenato | Query parametrizzate; c'è un test dedicato all'SQL injection |
| Pagine separate di consultazione e modifica | Una sola pagina con modalità lettura/modifica |
| AutoPostBack Nazione → Regione → Provincia | Liste a cascata caricate dall'API senza ricaricare la pagina |
| `ScriviLogApplicativo` | `audit.log`: chi, quando, da dove e quali campi sono cambiati (prima/dopo) |

Altri comportamenti nuovi:

- **Modifiche concorrenti.** Se due utenti modificano la stessa scheda, il secondo salvataggio viene rifiutato con un avviso invece di sovrascrivere il primo.
- **Errori tracciabili.** Ogni errore riporta un codice di correlazione, lo stesso che compare nei log del server.
- **Valutazioni per ente.** Nella scheda, la valutazione è visibile solo per gli enti su cui l'utente è abilitato.

## Andare in produzione con OIDC

1. Registra due applicazioni nel provider: una **SPA** per il frontend (redirect URI `https://<host>/auth/callback`) e un'**API** per il backend, con uno scope esposto.
2. Imposta nel `.env`:

   ```
   NODE_ENV=production
   AUTH_MODE=oidc
   OIDC_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
   OIDC_AUDIENCE=api://albo-fornitori
   OIDC_USERNAME_CLAIM=preferred_username
   OIDC_STRIP_UPN_DOMAIN=true

   VITE_AUTH_MODE=oidc
   VITE_OIDC_AUTHORITY=https://login.microsoftonline.com/<tenant-id>/v2.0
   VITE_OIDC_CLIENT_ID=<client-id-della-SPA>
   VITE_OIDC_SCOPE=openid profile api://albo-fornitori/access
   ```

3. **Abbinamento degli utenti esistenti.** Al primo accesso l'utente viene cercato per username: lo username viene tolto dal dominio (`mario.rossi@azienda.it` → `mario.rossi`) e messo in minuscolo, come faceva il legacy con `DOMINIO\utente`. Da quel momento resta legato all'identificativo OIDC. Se gli username legacy non coincidono con la parte locale dell'UPN, va preparata una tabella di corrispondenza prima della migrazione degli utenti.

Il flusso OIDC compila ed è completo, ma **non è stato provato con un provider reale**: va collaudato sul vostro tenant.

## Stato dei moduli

**Verificato:**

- 48 test automatici: 10 unitari e 38 di integrazione su PostgreSQL;
- 32 flussi provati nel browser, tra cui: salvataggio e conflitto tra due utenti, indirizzo estero, utente in sola lettura in inglese, utente disattivato, menu su mobile, collegamenti visti da entrambi i fornitori.

**Non incluso, previsto nei moduli successivi:**

- associazione fornitore-enti (ex `Anagrafica_EntiFornitori_Update`);
- geocoding degli indirizzi: le coordinate esistenti si aprono in OpenStreetMap;
- tutte le altre sezioni: dati economici, produzione, logistica, contratti, certificazioni, compliance, valutazione, ordinato/fatturato, report, utenti. Le voci compaiono già nel menu e portano a una pagina "non ancora disponibile".

**Limite noto:** i messaggi di errore del backend sono in italiano. Il frontend traduce in inglese quelli più comuni in base al codice.

## Dipendenze e sicurezza

Le librerie sono poche e con versioni fissate. Il `package-lock.json` registra la versione esatta di ognuna, comprese quelle indirette: tutti installano esattamente ciò che è stato testato.

Regole seguite nella scelta delle versioni:

- **Versioni corrette.** Per ogni libreria si usa l'ultima versione corretta della serie in uso, cioè senza vulnerabilità note secondo `npm audit`.
- **Almeno due settimane di vita.** Si usano solo versioni pubblicate da almeno 14 giorni, per ridurre il rischio di installare un rilascio compromesso prima che venga scoperto. Le dipendenze indirette troppo recenti sono bloccate nella sezione `overrides` del `package.json` principale.
- **Eccezione per le correzioni di sicurezza.** Una correzione di sicurezza prevale sulla regola delle due settimane, dopo aver verificato che sia pubblicata dal manutentore abituale. Eccezione attuale: `source-map-js` 1.2.2, usato solo nella build del frontend.
- **Nessuna libreria di test esterna.** I test usano il runner integrato in Node (`node:test`).

Prima di ogni rilascio:

```bash
npm audit
```

Non usare `npm audit fix --force`: aggiorna anche a versioni maggiori incompatibili e può rompere il progetto. Gli aggiornamenti vanno fatti modificando le versioni nei `package.json`, poi con `npm install`, i test e una prova dell'applicazione.

Il `package.json` principale dichiara la versione minima di Node (`engines`). Con una versione inferiore alla 22.12, `npm install` mostra un avviso `EBADENGINE`: in quel caso aggiorna Node prima di proseguire.

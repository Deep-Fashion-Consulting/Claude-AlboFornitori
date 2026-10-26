# Albo Fornitori — nuova versione

Riscrittura dell'applicazione Albo Fornitori (ASP.NET Web Forms + SQL Server) con:

- **backend** Node.js 22 + TypeScript + Fastify, API REST documentate con OpenAPI;
- **frontend** React 19 + Vite + React Query, interfaccia in italiano e inglese;
- **database** PostgreSQL 16, schema descritto in [`db/README.md`](db/README.md).

Il progetto procede a moduli. Sono completati:

- **modulo 1**: accesso, menu in base ai permessi, ricerca fornitori e scheda dati anagrafici;
- **modulo 2**: struttura societaria (struttura, interlocutori, subfornitori, collegamenti tra fornitori);
- **fondamenta, passo 1**: accesso con utente e password gestiti dall'Albo;
- **fondamenta, passo 2**: creazione dei fornitori e dati identificativi modificabili, con controllo formale di P.IVA e codice fiscale e avviso sui possibili duplicati;
- **fondamenta, passo 3**: liste di valori gestite dall'amministratore (sistemi esterni, marchi, enti, stati, tipi); codici esterni, marchi ed enti modificabili dalla scheda del fornitore; menu e gruppi predefiniti inclusi nel database, senza bisogno dei dati di prova;
- **fondamenta, passo 4**: dati geografici completi (tutte le nazioni, regioni, province e comuni italiani ISTAT, valute); indirizzi esteri con località scritta a mano.

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

Apri http://localhost:5173 e accedi con uno degli utenti di prova. La password è **`Prova2026!`** per tutti; è caricata da `db/seed/920_dev_password.sql`.

| Utente | Cosa vede |
| --- | --- |
| `admin` | Tutte le funzioni e tutti gli enti, può modificare |
| `mrossi` | Lettura e modifica; abilitato sugli enti Pelletteria e Calzature |
| `lbianchi` | Sola lettura, nessun ente, interfaccia in inglese |
| `exutente` | Utente disattivato: l'accesso viene negato con lo stesso messaggio di una password sbagliata |

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

Per l'accesso con password, su un database creato prima di questa versione:

```bat
%PSQL% -U albo -d albo -v ON_ERROR_STOP=1 -f db\migrations\007_auth_locale.sql
%PSQL% -U albo -d albo -v ON_ERROR_STOP=1 -f db\seed\920_dev_password.sql
```

Per la creazione dei fornitori:

```bat
%PSQL% -U albo -d albo -v ON_ERROR_STOP=1 -f db\migrations\008_fornitore_albo_master.sql
```

Per liste di valori, codici esterni, marchi ed enti:

```bat
%PSQL% -U albo -d albo -v ON_ERROR_STOP=1 -f db\migrations\009_configurazione_prodotto.sql
```

Per i dati geografici completi (riconosce e completa le località di prova già presenti, senza doppioni):

```bat
%PSQL% -U albo -d albo -v ON_ERROR_STOP=1 -f db\migrations\010_dati_geografici.sql
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
  auth/              password (scrypt), sessioni, utente corrente, permessi
  cli/               comando `utente` per creare l'amministratore e reimpostare password
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
| Windows Authentication su IIS | Utente e password gestiti dall'Albo; sessione nel database con cookie protetto |
| `Session("IGPSESS")` | Utente della sessione caricato da `iam.utente` a ogni richiesta, con permessi ed enti |
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

## Accesso e sicurezza delle password

Ogni installazione gestisce i propri utenti con nome utente e password.

- **Password:** salvate con *scrypt*, incluso in Node, mai in chiaro. Minimo 10 caratteri, senza il nome utente.
- **Sessione:** un cookie `HttpOnly` e `SameSite=Strict`, non leggibile dal JavaScript della pagina e mai inviato da altri siti. Nel database c'è solo l'hash del token. Scade dopo `SESSION_IDLE_MINUTES` di inattività (predefinito 120) e comunque dopo `SESSION_MAX_HOURS` (predefinito 12).
- **Tentativi falliti:** dopo 5 accessi falliti l'account si blocca per 15 minuti. Password errata, utente inesistente e utente disattivato ricevono lo stesso messaggio, così non si scopre quali nomi utente esistono.
- **Cambio password:** dal nome in alto a destra. Dopo il cambio, le sessioni aperte su altri dispositivi vengono chiuse.
- **Audit:** accessi riusciti e falliti (con il motivo) e cambi password finiscono in `audit.log`.

### Primo avvio in produzione

In produzione si eseguono solo le migrazioni di `db/migrations`, non i file di `db/seed`: non esistono utenti né password predefiniti. Le migrazioni creano già il menu e due gruppi di permessi, `AMMINISTRAZIONE` (tutto) e `CONSULTAZIONE` (tutto tranne l'amministrazione). Dopo la build, sul server, dalla cartella `backend`:

```
npm run utente -- crea-admin <username> <nome> <cognome>
```

La password viene chiesta a schermo, due volte, e non viene mostrata mentre la scrivi. L'utente creato fa parte del gruppo `AMMINISTRAZIONE` ed è abilitato su tutti gli enti.

Per reimpostare la password di un utente che l'ha dimenticata:

```
npm run utente -- password <username>
```

Il comando chiude anche le sue sessioni aperte. In sviluppo, senza build, si usa `npm run utente:dev -- ...`.

Al primo accesso l'amministratore configura da *Amministrazione → Liste di valori*:
- i **sistemi esterni** del cliente in cui i fornitori hanno un codice (ERP, gestionali);
- i **marchi**;
- gli **enti** (unità di business);
- gli **stati** del fornitore e i vari **tipi** (indirizzo, interlocutore, immobile).

Le voci non si cancellano: si disattivano. Chi crea un ente viene abilitato subito su quell'ente; gli altri utenti per ora vanno abilitati via SQL in `iam.utente_ente`, in attesa della pagina di gestione utenti.

### HTTPS

In produzione il cookie di sessione viaggia **solo su HTTPS**: il sito va pubblicato con un certificato. Su IIS si configura come per qualsiasi altro sito. Per una prova interna su HTTP si può impostare `COOKIE_SECURE=false` nel `.env`, sapendo che le password viaggeranno in chiaro sulla rete.

## Stato dei moduli

**Verificato:**

- 80 test automatici: 18 unitari e 62 di integrazione su PostgreSQL;
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
- **Eccezione per le correzioni di sicurezza.** Una correzione di sicurezza prevale sulla regola delle due settimane, dopo aver verificato che sia pubblicata dal manutentore abituale o con certificato di provenienza dal repository ufficiale. Eccezioni attuali (ottobre 2026):
  - `fastify` 5.12.7: aggiramento della validazione delle intestazioni HTTP;
  - `fast-uri` 3.1.9 e 4.2.3: interpretazione errata degli indirizzi, usato nella validazione delle richieste.

  `zod` 4.6.6 (esaurimento della memoria con richieste costruite apposta) era già oltre le due settimane.
- **Nessuna libreria di test esterna.** I test usano il runner integrato in Node (`node:test`).

Le vulnerabilità vengono scoperte di continuo: lo stesso progetto può passare da 0 a qualche segnalazione in pochi giorni senza che nessuno abbia toccato il codice. Per questo `npm audit` va lanciato regolarmente, e sempre prima di ogni rilascio:

```bash
npm audit
```

Non usare `npm audit fix --force`: aggiorna anche a versioni maggiori incompatibili e può rompere il progetto. Gli aggiornamenti vanno fatti modificando le versioni nei `package.json`, poi con `npm install`, i test e una prova dell'applicazione.

Il `package.json` principale dichiara la versione minima di Node (`engines`). Con una versione inferiore alla 22.12, `npm install` mostra un avviso `EBADENGINE`: in quel caso aggiorna Node prima di proseguire.

## Dati geografici: fonti e aggiornamento

La migrazione `010_dati_geografici.sql` contiene 250 nazioni, le 20 regioni, le 107 province, tutti i comuni italiani e 161 valute. È generata da `db/tools/genera-dati-geografici.mjs` a partire da fonti con licenza che ne consente l'uso nel prodotto:

| Dati | Fonte | Licenza |
| --- | --- | --- |
| Regioni, province, comuni (codice ISTAT e catastale) | ISTAT, *Elenco dei comuni italiani* | CC BY 4.0: **va citata la fonte** nella documentazione consegnata ai clienti |
| Nomi di nazioni e valute in italiano e inglese | Unicode CLDR, inclusa in Node | Licenza Unicode |
| Codici ISO alpha-3 e continente delle nazioni | Wikidata | CC0 |

Per i comuni bilingui si usa la denominazione ufficiale completa, per esempio *Bolzano/Bozen*. I **CAP non sono inclusi**: non esiste una fonte aperta ufficiale, perché appartengono a Poste Italiane. Si scrivono nell'indirizzo.

Per gli **indirizzi esteri** non esiste un elenco ufficiale delle località: si scrivono a mano. La prima volta vengono aggiunte all'elenco, poi vengono suggerite e riusate, senza distinguere maiuscole e spazi. In Italia il comune si sceglie sempre dall'elenco ISTAT.

**Aggiornare i comuni.** L'ISTAT aggiorna l'elenco più volte l'anno, per fusioni e nuovi comuni. Per aggiornare, con accesso a internet:

```bash
node db/tools/genera-dati-geografici.mjs > db/migrations/0NN_dati_geografici_AAAA_MM.sql
```

Si salva come nuova migrazione numerata, senza modificare la 010. La migrazione si può eseguire più volte senza danni: aggiorna le voci esistenti e aggiunge le nuove. I comuni soppressi restano nel database, perché gli indirizzi già registrati li usano.

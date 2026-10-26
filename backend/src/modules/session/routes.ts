import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit } from '../../audit.js';
import { authorizedEntities } from '../../auth/authz.js';
import { normalizeUsername, type UserContext } from '../../auth/context.js';
import { DUMMY_HASH, hashPassword, passwordProblem, verifyPassword } from '../../auth/password.js';
import { currentUser } from '../../auth/plugin.js';
import {
  clearedSessionCookie,
  createSession,
  deleteOtherSessions,
  deleteSession,
  readCookie,
  SESSION_COOKIE,
  sessionCookie,
  useSession,
} from '../../auth/sessions.js';
import { loadActiveUser } from '../../auth/users.js';
import { badRequest, forbidden, notFound, unauthorized } from '../../errors.js';
import { buildMenu, type FunzioneRow, type MenuNode } from './menu.js';

/** Tentativi falliti consecutivi prima del blocco, e durata del blocco */
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const Lingua = z.enum(['IT', 'EN']);

const MeSchema = z.object({
  id: z.number(),
  username: z.string(),
  nome: z.string(),
  cognome: z.string(),
  email: z.string().nullable(),
  lingua: Lingua,
  permessi: z.object({ lettura: z.boolean(), scrittura: z.boolean() }),
  funzioni: z.array(z.string()),
});

const MenuNodeSchema: z.ZodType<MenuNode> = z.lazy(() =>
  z.object({ codice: z.string(), descrizione: z.string(), route: z.string().nullable(), figli: z.array(MenuNodeSchema) }),
);

const ItemSchema = z.object({ id: z.number(), codice: z.string().nullable(), descrizione: z.string() });

function toMe(u: UserContext): z.infer<typeof MeSchema> {
  return {
    id: u.id,
    username: u.username,
    nome: u.nome,
    cognome: u.cognome,
    email: u.email,
    lingua: u.lingua,
    permessi: { lettura: u.canRead, scrittura: u.canWrite },
    funzioni: u.funzioni,
  };
}

const meta = (request: FastifyRequest) => ({ ip: request.ip, correlationId: String(request.id) });

export default async function sessionRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  // ------------------------------------------------------------------ login
  app.post(
    '/auth/login',
    {
      config: { public: true },
      schema: {
        tags: ['sessione'],
        summary: 'Accesso con nome utente e password',
        body: z.object({ username: z.string().min(1).max(150), password: z.string().min(1).max(200) }),
        response: { 200: MeSchema },
      },
    },
    async (request, reply) => {
      const username = normalizeUsername(request.body.username);
      const { rows } = await app.db.query(
        `SELECT id, password_hash, attivo, bloccato_fino_al > now() AS bloccato FROM iam.utente WHERE username = $1`,
        [username],
      );
      const u = rows[0];
      // La verifica si fa sempre, anche se l'utente non esiste: i tempi di risposta non rivelano nulla
      const passwordOk = await verifyPassword(request.body.password, u?.password_hash ?? DUMMY_HASH);
      const denied = (motivo: string) =>
        audit(app.db, u ? { id: u.id, username } : null, { azione: 'LOGIN_FAILED', dettagli: { username, motivo } }, meta(request));

      if (u?.bloccato) {
        await denied('bloccato');
        throw forbidden('ACCOUNT_BLOCCATO', `Troppi tentativi falliti: riprova tra ${LOCK_MINUTES} minuti`);
      }
      if (!u || !u.password_hash || !passwordOk || !u.attivo) {
        if (u && !passwordOk) {
          // Se un blocco precedente è scaduto, il conteggio riparte da questo tentativo
          await app.db.query(
            `UPDATE iam.utente u
                SET tentativi_falliti = c.n,
                    bloccato_fino_al = CASE WHEN c.n >= $2 THEN now() + make_interval(mins => $3) END
               FROM (SELECT CASE WHEN bloccato_fino_al IS NOT NULL THEN 1 ELSE tentativi_falliti + 1 END AS n
                       FROM iam.utente WHERE id = $1) c
              WHERE u.id = $1`,
            [u.id, MAX_FAILED, LOCK_MINUTES],
          );
        }
        await denied(!u ? 'utente inesistente' : !passwordOk ? 'password errata' : !u.attivo ? 'utente disattivato' : 'senza password');
        // Stesso messaggio in tutti i casi: non si rivela quali nomi utente esistono
        throw unauthorized('Nome utente o password non corretti');
      }

      await app.db.query(
        'UPDATE iam.utente SET tentativi_falliti = 0, bloccato_fino_al = NULL, ultimo_accesso = now() WHERE id = $1',
        [u.id],
      );
      const user = await loadActiveUser(app.db, u.id);
      if (!user) throw unauthorized('Nome utente o password non corretti');
      const token = await createSession(app.db, u.id, app.sessionSettings, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });
      await audit(app.db, user, { azione: 'LOGIN' }, meta(request));
      reply.header('set-cookie', sessionCookie(token, app.sessionSettings));
      return toMe(user);
    },
  );

  // ------------------------------------------- stato della sessione (pubblico)
  // All'apertura della pagina il frontend chiede se c'è già una sessione valida.
  // Risponde sempre 200, così il browser non registra un errore quando non si è ancora entrati.
  app.get(
    '/auth/stato',
    {
      config: { public: true },
      schema: { tags: ['sessione'], summary: 'Utente della sessione corrente, se presente', response: { 200: z.object({ utente: MeSchema.nullable() }) } },
    },
    async (request) => {
      const token = readCookie(request.headers.cookie, SESSION_COOKIE);
      const userId = token ? await useSession(app.db, token, app.sessionSettings) : null;
      const user = userId ? await loadActiveUser(app.db, userId) : null;
      return { utente: user ? toMe(user) : null };
    },
  );

  // ----------------------------------------------------------------- logout
  app.post(
    '/auth/logout',
    { config: { public: true }, schema: { tags: ['sessione'], summary: 'Esci', response: { 204: z.null() } } },
    async (request, reply) => {
      const token = readCookie(request.headers.cookie, SESSION_COOKIE);
      if (token) await deleteSession(app.db, token);
      reply.header('set-cookie', clearedSessionCookie(app.sessionSettings));
      return reply.status(204).send(null);
    },
  );

  // --------------------------------------------------------- utente corrente
  app.get(
    '/me',
    { schema: { tags: ['sessione'], summary: 'Utente corrente', response: { 200: MeSchema } } },
    async (request) => toMe(currentUser(request)),
  );

  app.put(
    '/me/password',
    {
      schema: {
        tags: ['sessione'],
        summary: 'Cambia la propria password',
        body: z.object({ attuale: z.string().min(1).max(200), nuova: z.string().max(200) }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const user = currentUser(request);
      const { rows } = await app.db.query('SELECT password_hash FROM iam.utente WHERE id = $1', [user.id]);
      if (!rows[0]?.password_hash || !(await verifyPassword(request.body.attuale, rows[0].password_hash))) {
        throw badRequest('PASSWORD_ATTUALE_ERRATA', 'La password attuale non è corretta');
      }
      const problem = passwordProblem(request.body.nuova, user.username);
      if (problem) throw badRequest('PASSWORD_DEBOLE', problem);
      await app.db.query('UPDATE iam.utente SET password_hash = $2, password_cambiata_il = now() WHERE id = $1', [
        user.id,
        await hashPassword(request.body.nuova),
      ]);
      // Chi conosceva la vecchia password perde l'accesso: restano solo questa sessione
      await deleteOtherSessions(app.db, user.id, request.sessionToken!);
      await audit(app.db, user, { azione: 'PASSWORD_CHANGED' }, meta(request));
      return reply.status(204).send(null);
    },
  );

  app.put(
    '/me/lingua',
    {
      schema: {
        tags: ['sessione'],
        summary: "Cambia la lingua dell'interfaccia",
        body: z.object({ lingua: Lingua }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const user = currentUser(request);
      await app.db.query('UPDATE iam.utente SET lingua = $2 WHERE id = $1', [user.id, request.body.lingua]);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/me/enti',
    {
      schema: {
        tags: ['sessione'],
        summary: "Enti su cui l'utente è abilitato",
        response: { 200: z.array(ItemSchema) },
      },
    },
    async (request) => {
      const user = currentUser(request);
      const { rows } = await app.db.query(
        `SELECT e.id, e.codice,
                CASE WHEN $2 = 'EN' THEN COALESCE(e.descrizione_en, e.descrizione_it) ELSE e.descrizione_it END AS descrizione
           FROM iam.utente_ente ue JOIN ref.ente e ON e.id = ue.ente_id
          WHERE ue.utente_id = $1 AND e.attivo
          ORDER BY e.ordine, descrizione`,
        [user.id, user.lingua],
      );
      return rows;
    },
  );

  // ------------------------------------------------------------------- menu
  app.get(
    '/menu',
    {
      schema: {
        tags: ['sessione'],
        summary: 'Menu delle funzioni abilitate',
        querystring: z.object({ fornitoreId: z.coerce.number().int().positive().optional() }),
        response: { 200: z.array(MenuNodeSchema) },
      },
    },
    async (request) => {
      const user = currentUser(request);
      const { fornitoreId } = request.query;

      let hasAuthorizedEntity = false;
      if (fornitoreId) {
        const exists = await app.db.query('SELECT 1 FROM albo.fornitore WHERE id = $1', [fornitoreId]);
        if (exists.rowCount === 0) throw notFound('Fornitore non trovato');
        hasAuthorizedEntity = (await authorizedEntities(app.db, user.id, fornitoreId)).length > 0;
      }

      const { rows } = await app.db.query<FunzioneRow>(
        `SELECT f.id, f.parent_id AS "parentId", f.codice, f.livello, f.route, f.ordine,
                f.richiede_fornitore AS "richiedeFornitore",
                f.richiede_ente_autorizzato AS "richiedeEnteAutorizzato",
                COALESCE(tl.descrizione, ti.descrizione, f.codice) AS descrizione
           FROM iam.funzione f
           LEFT JOIN iam.funzione_traduzione tl ON tl.funzione_id = f.id AND tl.lingua = $1
           LEFT JOIN iam.funzione_traduzione ti ON ti.funzione_id = f.id AND ti.lingua = 'IT'
          WHERE f.attivo`,
        [user.lingua],
      );

      return buildMenu(rows, {
        funzioniAbilitate: new Set(user.funzioni),
        hasSupplier: Boolean(fornitoreId),
        hasAuthorizedEntity,
      });
    },
  );
}

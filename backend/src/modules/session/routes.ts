import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit } from '../../audit.js';
import { authorizedEntities } from '../../auth/authz.js';
import { currentUser } from '../../auth/plugin.js';
import type { UserContext } from '../../auth/context.js';
import { forbidden, notFound } from '../../errors.js';
import { buildMenu, type FunzioneRow, type MenuNode } from './menu.js';

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

export default async function sessionRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  // Solo AUTH_MODE=dev: emette un token per uno username esistente, senza password.
  if (app.devTokens) {
    const devTokens = app.devTokens;
    app.post(
      '/auth/dev-login',
      {
        config: { public: true },
        schema: {
          tags: ['sessione'],
          summary: 'Login di sviluppo (solo AUTH_MODE=dev)',
          body: z.object({ username: z.string().min(1).max(150) }),
          response: { 200: z.object({ token: z.string() }) },
        },
      },
      async (request) => ({ token: await devTokens.issue(request.body.username.trim().toLowerCase()) }),
    );
  }

  // Avvio sessione (StartSession): lega il subject OIDC, registra accesso e audit.
  app.post(
    '/session',
    {
      config: { allowUnknownUser: true },
      schema: { tags: ['sessione'], summary: 'Avvia la sessione applicativa', response: { 200: MeSchema } },
    },
    async (request) => {
      const meta = { ip: request.ip, correlationId: String(request.id) };
      const user = request.resolvedUser;
      if (!user) {
        await audit(app.db, null, { azione: 'LOGIN_DENIED', dettagli: { username: request.identity?.username } }, meta);
        throw forbidden('UTENTE_NON_ABILITATO', "L'utente non è abilitato all'Albo fornitori");
      }
      const bind = request.identity?.bindSubject && !user.oidcSubject ? request.identity.subject : null;
      await app.db.query(
        `UPDATE iam.utente SET ultimo_accesso = now(), oidc_subject = COALESCE($2, oidc_subject) WHERE id = $1`,
        [user.id, bind],
      );
      if (bind) app.userCache.invalidateUser(user.id);
      await audit(app.db, user, { azione: 'LOGIN' }, meta);
      return toMe(user);
    },
  );

  app.get(
    '/me',
    { schema: { tags: ['sessione'], summary: 'Utente corrente', response: { 200: MeSchema } } },
    async (request) => toMe(currentUser(request)),
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
      app.userCache.invalidateUser(user.id);
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

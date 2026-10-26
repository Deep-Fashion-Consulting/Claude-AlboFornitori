import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Identity, UserContext } from './context.js';
import type { TokenVerifier } from './tokens.js';
import { findUser, UserCache, type ResolvedUser } from './users.js';
import { forbidden, unauthorized } from '../errors.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Rotta accessibile senza token */
    public?: boolean;
    /** La rotta riceve l'identità anche se l'utente non è abilitato (solo POST /api/session) */
    allowUnknownUser?: boolean;
  }
  interface FastifyRequest {
    identity: Identity | null;
    resolvedUser: ResolvedUser | null;
  }
  interface FastifyInstance {
    userCache: UserCache;
  }
}

/** Utente autenticato e abilitato: da usare nelle rotte protette. */
export function currentUser(request: FastifyRequest): UserContext {
  if (!request.resolvedUser) throw unauthorized();
  return request.resolvedUser;
}

export default fp(
  async function authPlugin(app: FastifyInstance, opts: { verifier: TokenVerifier }) {
    app.decorate('userCache', new UserCache());
    app.decorateRequest('identity', null);
    app.decorateRequest('resolvedUser', null);

    app.addHook('preHandler', async (request) => {
      const config = request.routeOptions.config;
      if (config?.public || !request.url.startsWith('/api/')) return;

      const header = request.headers.authorization;
      if (!header?.startsWith('Bearer ')) throw unauthorized();
      const identity = await opts.verifier.verify(header.slice('Bearer '.length));
      request.identity = identity;

      const key = `${identity.subject}|${identity.username}`;
      let user = app.userCache.get(key);
      if (!user) {
        user = (await findUser(app.db, identity)) ?? undefined;
        if (user) app.userCache.set(key, user);
      }

      if (!user || !user.attivo) {
        if (config?.allowUnknownUser) return;
        throw forbidden('UTENTE_NON_ABILITATO', "L'utente non è abilitato all'Albo fornitori");
      }
      request.resolvedUser = user;
    });
  },
  { name: 'auth', dependencies: ['db'] },
);

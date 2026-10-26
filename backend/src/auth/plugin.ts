import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { UserContext } from './context.js';
import { readCookie, SESSION_COOKIE, useSession, type SessionSettings } from './sessions.js';
import { loadActiveUser } from './users.js';
import { unauthorized } from '../errors.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Rotta accessibile senza sessione (login, health) */
    public?: boolean;
  }
  interface FastifyRequest {
    user: UserContext | null;
    sessionToken: string | null;
  }
  interface FastifyInstance {
    sessionSettings: SessionSettings;
  }
}

/** Utente autenticato: da usare nelle rotte protette. */
export function currentUser(request: FastifyRequest): UserContext {
  if (!request.user) throw unauthorized();
  return request.user;
}

export default fp(
  async function authPlugin(app: FastifyInstance, opts: { settings: SessionSettings }) {
    app.decorate('sessionSettings', opts.settings);
    app.decorateRequest('user', null);
    app.decorateRequest('sessionToken', null);

    app.addHook('preHandler', async (request) => {
      if (request.routeOptions.config?.public || !request.url.startsWith('/api/')) return;

      const token = readCookie(request.headers.cookie, SESSION_COOKIE);
      if (!token) throw unauthorized();
      const userId = await useSession(app.db, token, opts.settings);
      const user = userId ? await loadActiveUser(app.db, userId) : null;
      if (!user) throw unauthorized('Sessione scaduta: accedi di nuovo');

      request.user = user;
      request.sessionToken = token;
    });
  },
  { name: 'auth', dependencies: ['db'] },
);

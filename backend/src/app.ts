import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fp from 'fastify-plugin';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type pg from 'pg';
import type { Config } from './config.js';
import { createPool } from './db.js';
import { errorHandler } from './errors.js';
import authPlugin from './auth/plugin.js';
import sessionRoutes from './modules/session/routes.js';
import lookupRoutes from './modules/lookups/routes.js';
import supplierRoutes from './modules/suppliers/routes.js';
import companyRoutes from './modules/company/routes.js';
import adminRoutes from './modules/admin/routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: pg.Pool;
    config: Config;
  }
}

export interface BuildOptions {
  config: Config;
  /** Pool già esistente (test); altrimenti creato da DATABASE_URL */
  pool?: pg.Pool;
  logger?: boolean | object;
}

export async function buildApp({ config, pool, logger }: BuildOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger ?? {
      level: config.LOG_LEVEL,
      transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
      redact: ['req.headers.authorization'],
    },
    genReqId: (req) => {
      const incoming = req.headers['x-correlation-id'];
      return typeof incoming === 'string' && /^[0-9a-f-]{36}$/i.test(incoming) ? incoming : randomUUID();
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-correlation-id', request.id);
  });

  app.decorate('config', config);

  const db = pool ?? createPool(config.DATABASE_URL);
  await app.register(
    fp(
      async (instance) => {
        instance.decorate('db', db);
        if (!pool) instance.addHook('onClose', async () => db.end());
      },
      { name: 'db' },
    ),
  );

  // Frontend e API stanno sullo stesso indirizzo (proxy di Vite in sviluppo, IIS in produzione):
  // non serve CORS, e il cookie di sessione SameSite=Strict non parte mai da siti esterni.

  await app.register(swagger, {
    openapi: {
      info: { title: 'Albo Fornitori API', version: '0.1.0' },
      components: { securitySchemes: { sessione: { type: 'apiKey', in: 'cookie', name: 'albo_sessione' } } },
      security: [{ sessione: [] }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(authPlugin, {
    settings: {
      idleMinutes: config.SESSION_IDLE_MINUTES,
      maxHours: config.SESSION_MAX_HOURS,
      secureCookie: config.cookieSecure,
    },
  });

  app.get('/api/health', { config: { public: true }, schema: { hide: true } }, async () => {
    await app.db.query('SELECT 1');
    return { stato: 'ok' };
  });

  await app.register(sessionRoutes, { prefix: '/api' });
  await app.register(lookupRoutes, { prefix: '/api' });
  await app.register(supplierRoutes, { prefix: '/api/fornitori' });
  await app.register(companyRoutes, { prefix: '/api/fornitori' });
  await app.register(adminRoutes, { prefix: '/api/admin' });

  return app;
}

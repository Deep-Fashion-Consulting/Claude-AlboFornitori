import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireFunction, requireRead, requireWrite } from '../../auth/authz.js';
import { currentUser } from '../../auth/plugin.js';
import { CreatedSchema, SupplierIdParams } from '../suppliers/schemas.js';
import * as repo from './repository.js';
import {
  CollegamentoBody,
  InterlocutoreBody,
  SocietaSchema,
  SubfornitoreBody,
  UpdateStrutturaBody,
} from './schemas.js';

const FUNZIONE = 'FORNITORE_SOCIETA';
const tags = ['struttura societaria'];
const meta = (request: FastifyRequest) => ({ ip: request.ip, correlationId: String(request.id) });

export default async function companyRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  const reader = (request: FastifyRequest) => {
    const user = currentUser(request);
    requireRead(user);
    requireFunction(user, FUNZIONE);
    return user;
  };
  const writer = (request: FastifyRequest) => {
    const user = reader(request);
    requireWrite(user);
    return user;
  };
  const ChildParams = SupplierIdParams.extend({ childId: z.coerce.number().int().positive() });

  app.get(
    '/:id/societa',
    {
      schema: {
        tags,
        summary: 'Struttura societaria: struttura, interlocutori, subfornitori, collegamenti',
        params: SupplierIdParams,
        response: { 200: SocietaSchema },
      },
    },
    async (request) => repo.getSocieta(app.db, reader(request), request.params.id),
  );

  app.put(
    '/:id/societa/struttura',
    {
      schema: {
        tags,
        summary: 'Salva la struttura (crea al primo salvataggio)',
        description: '"versione" è null se la struttura non esiste ancora; altrimenti quella letta con GET.',
        params: SupplierIdParams,
        body: UpdateStrutturaBody,
        response: { 200: z.object({ versione: z.string() }) },
      },
    },
    async (request) => repo.saveStruttura(app.db, writer(request), request.params.id, request.body, meta(request)),
  );

  // Interlocutori e subfornitori hanno le stesse tre operazioni.
  // Il body è già validato dallo schema della rotta: il cast serve solo a TypeScript dentro il ciclo.
  const children = [
    { path: 'interlocutori', body: InterlocutoreBody, repo: repo.interlocutori, nome: 'interlocutore' },
    { path: 'subfornitori', body: SubfornitoreBody, repo: repo.subfornitori, nome: 'subfornitore' },
  ] as const;

  for (const c of children) {
    app.post(
      `/:id/${c.path}`,
      { schema: { tags, summary: `Aggiungi ${c.nome}`, params: SupplierIdParams, body: c.body, response: { 201: CreatedSchema } } },
      async (request, reply) => {
        const created = await c.repo.create(app.db, writer(request), request.params.id, request.body as never, meta(request));
        return reply.status(201).send(created);
      },
    );
    app.put(
      `/:id/${c.path}/:childId`,
      { schema: { tags, summary: `Modifica ${c.nome}`, params: ChildParams, body: c.body, response: { 204: z.null() } } },
      async (request, reply) => {
        await c.repo.update(app.db, writer(request), request.params.id, request.params.childId, request.body as never, meta(request));
        return reply.status(204).send(null);
      },
    );
    app.delete(
      `/:id/${c.path}/:childId`,
      { schema: { tags, summary: `Elimina ${c.nome}`, params: ChildParams, response: { 204: z.null() } } },
      async (request, reply) => {
        await c.repo.remove(app.db, writer(request), request.params.id, request.params.childId, meta(request));
        return reply.status(204).send(null);
      },
    );
  }

  app.post(
    '/:id/collegamenti',
    {
      schema: {
        tags,
        summary: 'Collega un altro fornitore',
        description:
          'Dalla pagina del fornitore corrente: CONSOLIDATO = il corrente è la capogruppo; ' +
          "ALTERNATIVO = l'altro è un suo alternativo; PADRE_FIGLIO = stessa azienda nel tempo (simmetrico).",
        params: SupplierIdParams,
        body: CollegamentoBody,
        response: { 201: CreatedSchema },
      },
    },
    async (request, reply) => {
      const created = await repo.addLink(app.db, writer(request), request.params.id, request.body.tipo, request.body.altroFornitoreId, meta(request));
      return reply.status(201).send(created);
    },
  );

  app.delete(
    '/:id/collegamenti/:childId',
    { schema: { tags, summary: 'Rimuovi un collegamento', params: ChildParams, response: { 204: z.null() } } },
    async (request, reply) => {
      await repo.removeLink(app.db, writer(request), request.params.id, request.params.childId, meta(request));
      return reply.status(204).send(null);
    },
  );
}

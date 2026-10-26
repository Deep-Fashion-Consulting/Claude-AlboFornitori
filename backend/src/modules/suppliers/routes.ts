import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireFunction, requireRead, requireWrite } from '../../auth/authz.js';
import { currentUser } from '../../auth/plugin.js';
import { forbidden } from '../../errors.js';
import * as repo from './repository.js';
import {
  AddAddressBody,
  AddStateBody,
  CreatedSchema,
  SearchResultSchema,
  SupplierGeneralSchema,
  SupplierHeaderSchema,
  SupplierIdParams,
  UpdateGeneralBody,
} from './schemas.js';
import { SearchCriteriaSchema } from './search.js';

const RICERCA = 'FORNITORE_RICERCA';
const ANAGRAFICA = 'FORNITORE_ANAGRAFICA';
const tags = ['fornitori'];

const meta = (request: FastifyRequest) => ({ ip: request.ip, correlationId: String(request.id) });

export default async function supplierRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  /** Lettore autorizzato alla funzione indicata */
  const reader = (request: FastifyRequest, funzione: string) => {
    const user = currentUser(request);
    requireRead(user);
    requireFunction(user, funzione);
    return user;
  };
  /** Scrittore autorizzato alla funzione indicata */
  const writer = (request: FastifyRequest, funzione: string) => {
    const user = reader(request, funzione);
    requireWrite(user);
    return user;
  };

  // ------------------------------------------------------------------ ricerca
  app.get(
    '/',
    {
      schema: {
        tags,
        summary: 'Ricerca fornitori multi-criterio',
        querystring: SearchCriteriaSchema,
        response: { 200: SearchResultSchema },
      },
    },
    async (request) => {
      const user = reader(request, RICERCA);
      const criteria = request.query;
      // Si può filtrare solo sugli enti su cui si è abilitati (ex UCEnti / VIEW_ENTE_FORNITORE_ABILITAZIONI)
      const nonAbilitati = (criteria.enti ?? []).filter((e) => !user.enti.includes(e));
      if (nonAbilitati.length) throw forbidden('ENTE_NON_AUTORIZZATO', 'Hai selezionato enti su cui non sei abilitato');
      return repo.searchSuppliers(app.db, user, criteria);
    },
  );

  // ------------------------------------------------------------ intestazione
  app.get(
    '/:id/intestazione',
    {
      schema: {
        tags,
        summary: 'Intestazione del fornitore (ragione sociale, stato, preferito)',
        params: SupplierIdParams,
        response: { 200: SupplierHeaderSchema },
      },
    },
    async (request) => {
      const user = currentUser(request);
      requireRead(user);
      return repo.getHeader(app.db, user, request.params.id);
    },
  );

  // ---------------------------------------------------------------- preferiti
  for (const [method, enabled] of [
    ['put', true],
    ['delete', false],
  ] as const) {
    app[method](
      '/:id/preferito',
      {
        schema: {
          tags,
          summary: enabled ? 'Aggiungi ai preferiti' : 'Togli dai preferiti',
          params: SupplierIdParams,
          response: { 204: z.null() },
        },
      },
      async (request, reply) => {
        const user = currentUser(request);
        requireRead(user);
        await repo.setFavourite(app.db, user.id, request.params.id, enabled);
        return reply.status(204).send(null);
      },
    );
  }

  // ------------------------------------------------------- dati anagrafici
  app.get(
    '/:id',
    {
      schema: {
        tags,
        summary: 'Scheda dati anagrafici',
        params: SupplierIdParams,
        response: { 200: SupplierGeneralSchema },
      },
    },
    async (request) => repo.getGeneral(app.db, reader(request, ANAGRAFICA), request.params.id),
  );

  app.put(
    '/:id',
    {
      schema: {
        tags,
        summary: 'Aggiorna i dati anagrafici gestiti dall’Albo',
        description:
          'Sostituisce tutti i campi modificabili. "versione" è quella letta con GET: se nel frattempo ' +
          'un altro utente ha salvato, la risposta è 409 MODIFICATO_DA_ALTRI.',
        params: SupplierIdParams,
        body: UpdateGeneralBody,
        response: { 200: z.object({ versione: z.string() }) },
      },
    },
    async (request) =>
      repo.updateGeneral(app.db, writer(request, ANAGRAFICA), request.params.id, request.body, meta(request)),
  );

  // -------------------------------------------------------------------- stati
  app.post(
    '/:id/stati',
    {
      schema: { tags, summary: 'Aggiungi uno stato con data', params: SupplierIdParams, body: AddStateBody, response: { 201: CreatedSchema } },
    },
    async (request, reply) => {
      const user = writer(request, ANAGRAFICA);
      const created = await repo.addState(app.db, user, request.params.id, request.body.statoId, request.body.dataDa, meta(request));
      return reply.status(201).send(created);
    },
  );

  app.delete(
    '/:id/stati/:statoId',
    {
      schema: {
        tags,
        summary: 'Rimuovi uno stato',
        params: SupplierIdParams.extend({ statoId: z.coerce.number().int().positive() }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const user = writer(request, ANAGRAFICA);
      await repo.removeState(app.db, user, request.params.id, request.params.statoId, meta(request));
      return reply.status(204).send(null);
    },
  );

  // ---------------------------------------------------------------- indirizzi
  app.post(
    '/:id/indirizzi',
    {
      schema: { tags, summary: 'Aggiungi un indirizzo', params: SupplierIdParams, body: AddAddressBody, response: { 201: CreatedSchema } },
    },
    async (request, reply) => {
      const user = writer(request, ANAGRAFICA);
      const created = await repo.addAddress(app.db, user, request.params.id, request.body, meta(request));
      return reply.status(201).send(created);
    },
  );

  const AddressParams = SupplierIdParams.extend({ indirizzoId: z.coerce.number().int().positive() });

  app.put(
    '/:id/indirizzi/:indirizzoId/principale',
    { schema: { tags, summary: 'Imposta come indirizzo principale', params: AddressParams, response: { 204: z.null() } } },
    async (request, reply) => {
      const user = writer(request, ANAGRAFICA);
      await repo.setPrincipalAddress(app.db, user, request.params.id, request.params.indirizzoId, meta(request));
      return reply.status(204).send(null);
    },
  );

  app.delete(
    '/:id/indirizzi/:indirizzoId',
    { schema: { tags, summary: 'Elimina un indirizzo', params: AddressParams, response: { 204: z.null() } } },
    async (request, reply) => {
      const user = writer(request, ANAGRAFICA);
      await repo.deleteAddress(app.db, user, request.params.id, request.params.indirizzoId, meta(request));
      return reply.status(204).send(null);
    },
  );
}

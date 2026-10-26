import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUser } from '../../auth/plugin.js';
import { notFound } from '../../errors.js';
import { isLookupName, LOOKUPS } from './catalog.js';

const Item = z.object({ id: z.number(), codice: z.string().nullable(), descrizione: z.string() });
const descr = (alias: string) =>
  `CASE WHEN $1 = 'EN' THEN COALESCE(${alias}.descrizione_en, ${alias}.descrizione_it) ELSE ${alias}.descrizione_it END`;

export default async function lookupRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/lookups/:nome',
    {
      schema: {
        tags: ['liste'],
        summary: 'Lista di valori',
        params: z.object({ nome: z.string() }),
        response: { 200: z.array(Item) },
      },
    },
    async (request) => {
      const user = currentUser(request);
      const { nome } = request.params;
      if (!isLookupName(nome)) throw notFound(`Lista "${nome}" inesistente`);
      const { table } = LOOKUPS[nome];
      const { rows } = await app.db.query(
        `SELECT t.id, t.codice, ${descr('t')} AS descrizione FROM ${table} t WHERE t.attivo ORDER BY t.ordine, 3`,
        [user.lingua],
      );
      return rows;
    },
  );

  // Geografia a cascata (sostituisce gli AutoPostBack Nazione -> Regione -> Provincia -> Località)
  app.get(
    '/geo/nazioni',
    { schema: { tags: ['liste'], summary: 'Nazioni', response: { 200: z.array(Item) } } },
    async (request) => {
      const { rows } = await app.db.query(
        `SELECT t.id, t.codice, ${descr('t')} AS descrizione FROM ref.nazione t WHERE t.attivo
          ORDER BY (t.iso2 = 'IT') DESC, 3`,
        [currentUser(request).lingua],
      );
      return rows;
    },
  );

  app.get(
    '/geo/regioni',
    {
      schema: {
        tags: ['liste'],
        summary: 'Regioni di una nazione',
        querystring: z.object({ nazioneId: z.coerce.number().int().positive() }),
        response: { 200: z.array(Item) },
      },
    },
    async (request) => {
      const { rows } = await app.db.query(
        `SELECT t.id, t.codice, ${descr('t')} AS descrizione FROM ref.regione t
          WHERE t.attivo AND t.nazione_id = $2 ORDER BY 3`,
        [currentUser(request).lingua, request.query.nazioneId],
      );
      return rows;
    },
  );

  app.get(
    '/geo/province',
    {
      schema: {
        tags: ['liste'],
        summary: 'Province di una regione, oppure di tutta una nazione',
        querystring: z
          .object({
            regioneId: z.coerce.number().int().positive().optional(),
            nazioneId: z.coerce.number().int().positive().optional(),
          })
          .refine((v) => v.regioneId || v.nazioneId, { message: 'Indica regioneId oppure nazioneId' }),
        response: { 200: z.array(Item) },
      },
    },
    async (request) => {
      const { rows } = await app.db.query(
        `SELECT t.id, t.sigla AS codice, ${descr('t')} AS descrizione
           FROM ref.provincia t JOIN ref.regione r ON r.id = t.regione_id
          WHERE t.attivo AND ($2::int IS NULL OR t.regione_id = $2) AND ($3::int IS NULL OR r.nazione_id = $3)
          ORDER BY 3`,
        [currentUser(request).lingua, request.query.regioneId ?? null, request.query.nazioneId ?? null],
      );
      return rows;
    },
  );

  app.get(
    '/geo/localita',
    {
      schema: {
        tags: ['liste'],
        summary: 'Località di una provincia, oppure di una nazione estera',
        querystring: z
          .object({
            provinciaId: z.coerce.number().int().positive().optional(),
            nazioneId: z.coerce.number().int().positive().optional(),
            q: z.string().trim().max(100).optional(),
          })
          .refine((v) => v.provinciaId || v.nazioneId, { message: 'Indica provinciaId oppure nazioneId' }),
        response: { 200: z.array(Item.extend({ capDefault: z.string().nullable() })) },
      },
    },
    async (request) => {
      const { provinciaId, nazioneId, q } = request.query;
      const { rows } = await app.db.query(
        `SELECT t.id, t.codice, ${descr('t')} AS descrizione, t.cap_default AS "capDefault"
           FROM ref.localita t
          WHERE t.attivo
            AND ($2::int IS NULL OR t.provincia_id = $2)
            AND ($3::int IS NULL OR t.nazione_id = $3)
            AND ($4::text IS NULL OR common.f_search_key(t.descrizione_it) LIKE common.f_search_key($4) || '%')
          ORDER BY 3
          LIMIT 1000`,
        [currentUser(request).lingua, provinciaId ?? null, nazioneId ?? null, q || null],
      );
      return rows;
    },
  );
}

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit } from '../../audit.js';
import { requireFunction, requireWrite } from '../../auth/authz.js';
import { currentUser } from '../../auth/plugin.js';
import { withTransaction } from '../../db.js';
import { notFound } from '../../errors.js';
import { isLookupName, LOOKUPS, type LookupName } from '../lookups/catalog.js';

const FUNZIONE = 'LISTE_VALORI';
const tags = ['amministrazione'];
const meta = (request: FastifyRequest) => ({ ip: request.ip, correlationId: String(request.id) });

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v === '' ? null : v));

const ValueSchema = z.object({
  id: z.number(),
  codice: z.string().nullable(),
  descrizioneIt: z.string(),
  descrizioneEn: z.string().nullable(),
  ordine: z.number(),
  attivo: z.boolean(),
});

const ValueBody = z.object({
  codice: optText(30),
  descrizioneIt: z.string().trim().min(1, 'Indica la descrizione').max(200),
  descrizioneEn: optText(200),
  ordine: z.number().int().min(0).max(9999).default(0),
  attivo: z.boolean().default(true),
});

const NomeParams = z.object({ nome: z.string() });

function tableOf(nome: string) {
  if (!isLookupName(nome)) throw notFound(`Lista "${nome}" inesistente`);
  return LOOKUPS[nome].table;
}

/**
 * Gestione delle liste di valori (sistemi esterni, marchi, enti, stati, tipi...).
 * Le voci non si cancellano: si disattivano, così i dati che le usano restano coerenti.
 */
export default async function adminRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  const admin = (request: FastifyRequest, write = false) => {
    const user = currentUser(request);
    requireFunction(user, FUNZIONE);
    if (write) requireWrite(user);
    return user;
  };

  app.get(
    '/liste',
    {
      schema: {
        tags,
        summary: 'Liste di valori gestibili',
        response: { 200: z.array(z.object({ nome: z.string(), descrizione: z.string() })) },
      },
    },
    async (request) => {
      const user = admin(request);
      return (Object.keys(LOOKUPS) as LookupName[]).map((nome) => ({
        nome,
        descrizione: user.lingua === 'EN' ? LOOKUPS[nome].en : LOOKUPS[nome].it,
      }));
    },
  );

  app.get(
    '/liste/:nome',
    { schema: { tags, summary: 'Voci di una lista, comprese le disattivate', params: NomeParams, response: { 200: z.array(ValueSchema) } } },
    async (request) => {
      admin(request);
      const { rows } = await app.db.query(
        `SELECT id, codice, descrizione_it AS "descrizioneIt", descrizione_en AS "descrizioneEn", ordine, attivo
           FROM ${tableOf(request.params.nome)} ORDER BY attivo DESC, ordine, descrizione_it`,
      );
      return rows;
    },
  );

  app.post(
    '/liste/:nome',
    { schema: { tags, summary: 'Aggiungi una voce', params: NomeParams, body: ValueBody, response: { 201: z.object({ id: z.number() }) } } },
    async (request, reply) => {
      const user = admin(request, true);
      const table = tableOf(request.params.nome);
      const b = request.body;
      const id = await withTransaction(app.db, async (tx) => {
        const { rows } = await tx.query(
          `INSERT INTO ${table} (codice, descrizione_it, descrizione_en, ordine, attivo) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [b.codice, b.descrizioneIt, b.descrizioneEn, b.ordine, b.attivo],
        );
        const newId = rows[0]!.id as number;
        // Un nuovo ente è subito utilizzabile da chi lo crea; gli altri utenti vanno abilitati
        if (request.params.nome === 'enti') {
          await tx.query('INSERT INTO iam.utente_ente (utente_id, ente_id) VALUES ($1, $2)', [user.id, newId]);
        }
        await audit(tx, user, { azione: 'LOOKUP_ADD', entita: table, entitaId: newId, dettagli: b }, meta(request));
        return newId;
      });
      return reply.status(201).send({ id });
    },
  );

  app.put(
    '/liste/:nome/:id',
    {
      schema: {
        tags,
        summary: 'Modifica o disattiva una voce',
        params: NomeParams.extend({ id: z.coerce.number().int().positive() }),
        body: ValueBody,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const user = admin(request, true);
      const table = tableOf(request.params.nome);
      const b = request.body;
      const { rowCount } = await app.db.query(
        `UPDATE ${table} SET codice = $2, descrizione_it = $3, descrizione_en = $4, ordine = $5, attivo = $6 WHERE id = $1`,
        [request.params.id, b.codice, b.descrizioneIt, b.descrizioneEn, b.ordine, b.attivo],
      );
      if (!rowCount) throw notFound('Voce non trovata');
      await audit(app.db, user, { azione: 'LOOKUP_UPDATE', entita: table, entitaId: request.params.id, dettagli: b }, meta(request));
      return reply.status(204).send(null);
    },
  );
}

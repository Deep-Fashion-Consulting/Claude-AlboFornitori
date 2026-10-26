import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(400, code, message, details);
export const unauthorized = (message = 'Autenticazione richiesta') => new AppError(401, 'NON_AUTENTICATO', message);
export const forbidden = (code: string, message: string) => new AppError(403, code, message);
export const notFound = (message: string) => new AppError(404, 'NON_TROVATO', message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);

export interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
  correlationId: string;
}

/**
 * Mappa errori applicativi, di validazione e di PostgreSQL su risposte HTTP coerenti
 * (specifica cap. 24). Gli errori inattesi non espongono dettagli al client.
 */
export function errorHandler(err: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  const correlationId = String(request.id);
  const send = (status: number, body: Omit<ErrorBody, 'correlationId'>) =>
    reply.status(status).send({ ...body, correlationId } satisfies ErrorBody);

  if (err instanceof AppError) {
    return send(err.statusCode, { code: err.code, message: err.message, details: err.details });
  }
  if (hasZodFastifySchemaValidationErrors(err)) {
    return send(400, {
      code: 'RICHIESTA_NON_VALIDA',
      message: 'Alcuni dati della richiesta non sono validi',
      details: err.validation.map((v) => ({ campo: v.instancePath.replace(/^\//, ''), messaggio: v.message })),
    });
  }

  const pgCode = (err as { code?: string }).code;
  if (pgCode === '23505') return send(409, { code: 'DUPLICATO', message: 'Esiste già un elemento con questi dati' });
  if (pgCode === '23503') {
    return send(400, { code: 'RIFERIMENTO_NON_VALIDO', message: 'Un valore selezionato non esiste o è ancora in uso' });
  }
  if (pgCode === '23514' || pgCode === '22007' || pgCode === '22008') {
    return send(400, { code: 'VALORE_NON_VALIDO', message: 'Un valore non rispetta i vincoli previsti' });
  }

  const statusCode = (err as FastifyError).statusCode;
  if (statusCode && statusCode < 500) {
    return send(statusCode, { code: 'RICHIESTA_NON_VALIDA', message: err.message });
  }

  request.log.error({ err }, 'Errore non gestito');
  return send(500, { code: 'ERRORE_INTERNO', message: 'Errore interno. Comunica il codice di correlazione al supporto.' });
}

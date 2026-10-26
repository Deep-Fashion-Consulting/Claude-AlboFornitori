import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL è obbligatoria'),

  /** Minuti di inattività dopo cui la sessione scade */
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).default(120),
  /** Durata massima di una sessione, anche se usata di continuo */
  SESSION_MAX_HOURS: z.coerce.number().int().min(1).default(12),
  /**
   * Cookie solo su HTTPS. Predefinito: attivo in produzione.
   * Disattivarlo solo per prove interne su HTTP: le password viaggerebbero in chiaro.
   */
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
});

export type Config = z.infer<typeof EnvSchema> & { cookieSecure: boolean };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `- ${i.path.join('.') || 'config'}: ${i.message}`).join('\n');
    throw new Error(`Configurazione non valida:\n${details}`);
  }
  const c = parsed.data;
  return { ...c, cookieSecure: c.COOKIE_SECURE ? c.COOKIE_SECURE === 'true' : c.NODE_ENV === 'production' };
}

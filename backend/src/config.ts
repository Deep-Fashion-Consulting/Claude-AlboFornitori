import { z } from 'zod';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL è obbligatoria'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),

    AUTH_MODE: z.enum(['oidc', 'dev']).default('oidc'),
    DEV_AUTH_SECRET: z.string().optional(),
    OIDC_ISSUER: z.string().url().optional(),
    OIDC_AUDIENCE: z.string().optional(),
    OIDC_USERNAME_CLAIM: z.string().default('preferred_username'),
    OIDC_STRIP_UPN_DOMAIN: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_MODE === 'oidc' && (!env.OIDC_ISSUER || !env.OIDC_AUDIENCE)) {
      ctx.addIssue({ code: 'custom', message: 'Con AUTH_MODE=oidc servono OIDC_ISSUER e OIDC_AUDIENCE' });
    }
    if (env.AUTH_MODE === 'dev') {
      if (env.NODE_ENV === 'production') {
        ctx.addIssue({ code: 'custom', message: 'AUTH_MODE=dev non è ammesso in produzione' });
      }
      if (!env.DEV_AUTH_SECRET || env.DEV_AUTH_SECRET.length < 32) {
        ctx.addIssue({ code: 'custom', message: 'Con AUTH_MODE=dev serve DEV_AUTH_SECRET di almeno 32 caratteri' });
      }
    }
  });

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `- ${i.path.join('.') || 'config'}: ${i.message}`).join('\n');
    throw new Error(`Configurazione non valida:\n${details}`);
  }
  return parsed.data;
}

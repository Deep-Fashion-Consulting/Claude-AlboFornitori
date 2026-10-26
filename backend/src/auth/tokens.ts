import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from 'jose';
import type { Config } from '../config.js';
import { AppError, unauthorized } from '../errors.js';
import { normalizeUsername, type Identity } from './context.js';

export interface TokenVerifier {
  verify(token: string): Promise<Identity>;
}

const DEV_ISSUER = 'albo-dev';

function usernameFrom(payload: JWTPayload, claim: string, strip: boolean): string {
  const raw = payload[claim];
  if (typeof raw !== 'string' || raw.length === 0) throw unauthorized(`Il token non contiene il claim "${claim}"`);
  return normalizeUsername(raw, strip);
}

/** Verifica i token emessi dal provider OIDC aziendale (firma via JWKS, issuer e audience). */
export function createOidcVerifier(config: Config): TokenVerifier {
  const issuer = config.OIDC_ISSUER!;
  let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

  async function getJwks() {
    if (!jwks) {
      const res = await fetch(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`);
      if (!res.ok) throw new Error(`Discovery OIDC fallita: HTTP ${res.status}`);
      const meta = (await res.json()) as { jwks_uri: string };
      jwks = createRemoteJWKSet(new URL(meta.jwks_uri));
    }
    return jwks;
  }

  return {
    async verify(token) {
      let payload: JWTPayload;
      try {
        ({ payload } = await jwtVerify(token, await getJwks(), { issuer, audience: config.OIDC_AUDIENCE }));
      } catch (err) {
        if (err instanceof AppError) throw err;
        if (err instanceof Error && 'code' in err && String(err.code).startsWith('ERR_J')) {
          throw unauthorized('Token non valido o scaduto');
        }
        throw err;
      }
      if (!payload.sub) throw unauthorized('Token senza subject');
      return {
        subject: payload.sub,
        username: usernameFrom(payload, config.OIDC_USERNAME_CLAIM, config.OIDC_STRIP_UPN_DOMAIN),
        bindSubject: true,
      };
    },
  };
}

export interface DevTokens extends TokenVerifier {
  issue(username: string): Promise<string>;
}

/** Solo sviluppo: token HS256 firmati dal backend stesso, emessi da /api/auth/dev-login. */
export function createDevVerifier(secret: string): DevTokens {
  const key = new TextEncoder().encode(secret);
  return {
    async issue(username) {
      return new SignJWT({ preferred_username: username })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(`dev:${username}`)
        .setIssuer(DEV_ISSUER)
        .setAudience(DEV_ISSUER)
        .setIssuedAt()
        .setExpirationTime('8h')
        .sign(key);
    },
    async verify(token) {
      let payload: JWTPayload;
      try {
        ({ payload } = await jwtVerify(token, key, { issuer: DEV_ISSUER, audience: DEV_ISSUER }));
      } catch {
        throw unauthorized('Token non valido o scaduto');
      }
      return { subject: payload.sub!, username: usernameFrom(payload, 'preferred_username', false), bindSubject: false };
    },
  };
}

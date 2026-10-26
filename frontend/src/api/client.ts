/** Errore restituito dall'API nel formato { code, message, details, correlationId } */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly correlationId?: string,
  ) {
    super(message);
  }
}

type QueryValue = string | number | boolean | null | undefined | (string | number)[];

let onUnauthorized: () => void = () => {};

/** Collegato dall'AuthProvider: cosa fare quando la sessione non è più valida. */
export function configureApi(opts: { onUnauthorized: () => void }) {
  onUnauthorized = opts.onUnauthorized;
}

export function toQueryString(params: Record<string, QueryValue>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, String(v)));
    else qs.append(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/**
 * Chiamata all'API. Il cookie di sessione viaggia da solo: frontend e API stanno sullo stesso indirizzo.
 * `silent401`: un 401 non chiude la sessione (serve al login, dove 401 vuol dire credenziali errate).
 */
export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Record<string, QueryValue>; silent401?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${path}${opts.query ? toQueryString(opts.query) : ''}`, {
      method: opts.method ?? 'GET',
      headers,
      credentials: 'same-origin',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'RETE', 'Il server non risponde. Controlla la connessione e riprova.');
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !opts.silent401) onUnauthorized();
    throw new ApiError(res.status, data?.code ?? 'ERRORE', data?.message ?? `Errore ${res.status}`, data?.details, data?.correlationId);
  }
  return data as T;
}

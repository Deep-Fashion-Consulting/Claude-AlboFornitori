import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';

/** Testo dell'errore nella lingua dell'utente: usa il codice API se tradotto, altrimenti il messaggio. */
export function useErrorText() {
  const { t, i18n } = useTranslation();
  return (err: unknown): string => {
    if (err instanceof ApiError) {
      const key = `errors.${err.code}`;
      return i18n.exists(key) ? t(key) : err.message;
    }
    return err instanceof Error ? err.message : String(err);
  };
}

/** Messaggi di validazione per campo restituiti dall'API (details: [{ campo, messaggio }]) */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !Array.isArray(err.details)) return {};
  const out: Record<string, string> = {};
  for (const d of err.details as { campo?: string; messaggio?: string }[]) {
    if (d.campo && d.messaggio) out[d.campo.split('/').pop()!] = d.messaggio;
  }
  return out;
}

export function ErrorMessage({ error, onRetry, action }: { error: unknown; onRetry?: () => void; action?: React.ReactNode }) {
  const { t } = useTranslation();
  const text = useErrorText()(error);
  const correlationId = error instanceof ApiError ? error.correlationId : undefined;
  return (
    <div className="notice notice--error" role="alert">
      <p>{text}</p>
      {correlationId && <p className="notice__meta">{t('common.correlation', { id: correlationId })}</p>}
      {(onRetry || action) && (
        <div className="notice__actions">
          {onRetry && (
            <button type="button" className="btn btn--quiet" onClick={onRetry}>
              {t('common.retry')}
            </button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}

export function Loading() {
  const { t } = useTranslation();
  return (
    <p className="loading" role="status">
      {t('common.loading')}
    </p>
  );
}

/** Conferma di un'azione riuscita, annunciata agli screen reader e nascosta dopo qualche secondo. */
export function useFlash(): [string | null, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const timer = window.setTimeout(() => setMsg(null), 3500);
    return () => window.clearTimeout(timer);
  }, [msg]);
  return [msg, setMsg];
}

export function Flash({ message }: { message: string | null }) {
  return (
    <div className="flash" role="status" aria-live="polite">
      {message && <span className="flash__text">{message}</span>}
    </div>
  );
}

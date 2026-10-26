import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import i18n from '../i18n';
import { api, ApiError, configureApi } from '../api/client';
import type { Me } from '../api/types';

type Status = 'loading' | 'anonymous' | 'authenticated';

interface AuthState {
  status: Status;
  me: Me | null;
  /** Messaggio da mostrare nella pagina di accesso (es. sessione scaduta) */
  notice: string | null;
  signIn(username: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  setMe(me: Me): void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMeState] = useState<Me | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const setMe = useCallback((m: Me) => {
    setMeState(m);
    void i18n.changeLanguage(m.lingua.toLowerCase());
    document.documentElement.lang = m.lingua.toLowerCase();
  }, []);

  const reset = useCallback(
    (message: string | null) => {
      qc.clear();
      setMeState(null);
      setNotice(message);
      setStatus('anonymous');
    },
    [qc],
  );

  useEffect(() => {
    configureApi({ onUnauthorized: () => reset(i18n.t('auth.expired')) });
  }, [reset]);

  // All'apertura della pagina: se il cookie di sessione è ancora valido si entra direttamente
  useEffect(() => {
    api<{ utente: Me | null }>('/api/auth/stato')
      .then(({ utente }) => {
        if (utente) {
          setMe(utente);
          setStatus('authenticated');
        } else {
          setStatus('anonymous');
        }
      })
      .catch(() => setStatus('anonymous'));
  }, [setMe]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      me,
      notice,
      setMe,
      /** Lancia ApiError con il messaggio da mostrare se le credenziali non vanno bene */
      async signIn(username, password) {
        const m = await api<Me>('/api/auth/login', { method: 'POST', body: { username, password }, silent401: true });
        setNotice(null);
        setMe(m);
        setStatus('authenticated');
      },
      async signOut() {
        await api('/api/auth/logout', { method: 'POST', silent401: true }).catch(() => undefined);
        reset(null);
      },
    }),
    [status, me, notice, setMe, reset],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth va usato dentro AuthProvider');
  return ctx;
}

/** Utente autenticato: da usare solo nelle pagine protette. */
export function useMe(): Me {
  const { me } = useAuth();
  if (!me) throw new Error('Utente non autenticato');
  return me;
}

export { ApiError };

import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import i18n from '../i18n';
import { api, ApiError, configureApi } from '../api/client';
import type { Me } from '../api/types';

export const AUTH_MODE: 'oidc' | 'dev' = import.meta.env.VITE_AUTH_MODE === 'oidc' ? 'oidc' : 'dev';
const DEV_TOKEN_KEY = 'albo.devToken';

type Status = 'loading' | 'anonymous' | 'authenticated' | 'denied';

interface AuthState {
  status: Status;
  me: Me | null;
  /** Messaggio da mostrare nella pagina di accesso (sessione scaduta, utente non abilitato…) */
  notice: string | null;
  signInDev(username: string): Promise<void>;
  signInOidc(returnTo?: string): Promise<void>;
  completeOidcSignIn(): Promise<string>;
  signOut(): Promise<void>;
  setMe(me: Me): void;
}

const AuthContext = createContext<AuthState | null>(null);

const userManager =
  AUTH_MODE === 'oidc'
    ? new UserManager({
        authority: import.meta.env.VITE_OIDC_AUTHORITY,
        client_id: import.meta.env.VITE_OIDC_CLIENT_ID,
        scope: import.meta.env.VITE_OIDC_SCOPE ?? 'openid profile',
        redirect_uri: `${window.location.origin}/auth/callback`,
        post_logout_redirect_uri: window.location.origin,
        response_type: 'code',
        automaticSilentRenew: true,
        userStore: new WebStorageStateStore({ store: window.sessionStorage }),
      })
    : null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMeState] = useState<Me | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const token = useRef<string | null>(null);

  const setMe = useCallback((m: Me) => {
    setMeState(m);
    void i18n.changeLanguage(m.lingua.toLowerCase());
    document.documentElement.lang = m.lingua.toLowerCase();
  }, []);

  const reset = useCallback(
    (message: string | null) => {
      token.current = null;
      sessionStorage.removeItem(DEV_TOKEN_KEY);
      qc.clear();
      setMeState(null);
      setNotice(message);
      setStatus('anonymous');
    },
    [qc],
  );

  /** StartSession: registra l'accesso lato server e carica permessi e lingua. */
  const startSession = useCallback(
    async (accessToken: string) => {
      token.current = accessToken;
      try {
        setMe(await api<Me>('/api/session', { method: 'POST', token: accessToken }));
        setNotice(null);
        setStatus('authenticated');
      } catch (err) {
        token.current = null;
        if (err instanceof ApiError && err.code === 'UTENTE_NON_ABILITATO') {
          setNotice(i18n.t('auth.denied'));
          setStatus('denied');
        } else {
          reset(err instanceof ApiError && err.status === 401 ? i18n.t('auth.expired') : (err as Error).message);
        }
      }
    },
    [reset, setMe],
  );

  useEffect(() => {
    configureApi({ getToken: () => token.current, onUnauthorized: () => reset(i18n.t('auth.expired')) });
  }, [reset]);

  // Ripristino della sessione al caricamento della pagina
  useEffect(() => {
    void (async () => {
      if (window.location.pathname === '/auth/callback') return; // gestito da AuthCallbackPage
      if (AUTH_MODE === 'dev') {
        const saved = sessionStorage.getItem(DEV_TOKEN_KEY);
        if (saved) await startSession(saved);
        else setStatus('anonymous');
      } else {
        const user = await userManager!.getUser();
        if (user && !user.expired) await startSession(user.access_token);
        else setStatus('anonymous');
      }
    })();
  }, [startSession]);

  // Rinnovo silenzioso del token OIDC
  useEffect(() => {
    if (!userManager) return;
    const onLoaded = (u: { access_token: string }) => {
      token.current = u.access_token;
    };
    userManager.events.addUserLoaded(onLoaded);
    return () => userManager.events.removeUserLoaded(onLoaded);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      status,
      me,
      notice,
      setMe,
      async signInDev(username) {
        setStatus('loading');
        try {
          const { token: t } = await api<{ token: string }>('/api/auth/dev-login', { method: 'POST', body: { username } });
          sessionStorage.setItem(DEV_TOKEN_KEY, t);
          await startSession(t);
        } catch (err) {
          reset((err as Error).message);
        }
      },
      async signInOidc(returnTo = window.location.pathname + window.location.search) {
        await userManager!.signinRedirect({ state: { returnTo } });
      },
      async completeOidcSignIn() {
        const user = await userManager!.signinRedirectCallback();
        await startSession(user.access_token);
        return (user.state as { returnTo?: string } | undefined)?.returnTo ?? '/';
      },
      async signOut() {
        reset(null);
        if (userManager) await userManager.signoutRedirect();
      },
    }),
    [status, me, notice, setMe, startSession, reset],
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

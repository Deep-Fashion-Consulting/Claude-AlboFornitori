import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';

/** Ritorno dal provider OIDC (Authorization Code + PKCE). */
export function AuthCallbackPage() {
  const { t } = useTranslation();
  const { completeOidcSignIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    completeOidcSignIn()
      .then((returnTo) => navigate(returnTo, { replace: true }))
      .catch((err: Error) => setError(err.message));
  }, [completeOidcSignIn, navigate]);

  return (
    <main className="login">
      <div className="login__panel">
        {error ? (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        ) : (
          <p role="status">{t('auth.signingIn')}</p>
        )}
      </div>
    </main>
  );
}

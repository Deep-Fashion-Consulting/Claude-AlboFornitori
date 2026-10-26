import { useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AUTH_MODE, useAuth } from '../auth/AuthProvider';

const TEST_USERS = [
  { username: 'admin', descr: 'Amministratore: tutte le funzioni, tutti gli enti' },
  { username: 'mrossi', descr: 'Buyer: lettura e modifica, enti Pelletteria e Calzature' },
  { username: 'lbianchi', descr: 'Consultazione: sola lettura, nessun ente, interfaccia in inglese' },
  { username: 'exutente', descr: 'Utente disattivato: accesso negato' },
];

export function LoginPage() {
  const { t } = useTranslation();
  const { status, notice, signInDev, signInOidc } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState('mrossi');
  const returnTo = (location.state as { from?: string } | null)?.from ?? '/fornitori';

  if (status === 'authenticated') return <Navigate to={returnTo} replace />;

  return (
    <main className="login">
      <div className="login__panel">
        <p className="login__brand">{t('app.title')}</p>
        {notice && (
          <p className="notice notice--error" role="alert">
            {notice}
          </p>
        )}
        {AUTH_MODE === 'oidc' ? (
          <button type="button" className="btn btn--primary" onClick={() => void signInOidc(returnTo)}>
            {t('auth.signInCompany')}
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void signInDev(username);
            }}
          >
            <h1 className="login__title">{t('auth.devTitle')}</h1>
            <p className="login__hint">{t('auth.devHint')}</p>
            <fieldset className="login__users">
              <legend className="visually-hidden">{t('auth.username')}</legend>
              {TEST_USERS.map((u) => (
                <label key={u.username} className="login__user">
                  <input
                    type="radio"
                    name="username"
                    value={u.username}
                    checked={username === u.username}
                    onChange={() => setUsername(u.username)}
                  />
                  <span>
                    <strong>{u.username}</strong>
                    <span className="login__userdescr">{u.descr}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <button type="submit" className="btn btn--primary" disabled={status === 'loading'}>
              {status === 'loading' ? t('auth.signingIn') : t('auth.signIn')}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

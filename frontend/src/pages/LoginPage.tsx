import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import { useErrorText } from '../components/Feedback';
import { Field } from '../components/Field';

export function LoginPage() {
  const { t } = useTranslation();
  const { status, notice, signIn } = useAuth();
  const errorText = useErrorText();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const returnTo = (location.state as { from?: string } | null)?.from ?? '/fornitori';

  if (status === 'authenticated') return <Navigate to={returnTo} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await signIn(username, password);
    } catch (err) {
      setError(errorText(err));
      setPassword('');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="login">
      <form className="login__panel" onSubmit={onSubmit}>
        <p className="login__brand">{t('app.title')}</p>
        <h1 className="login__title">{t('auth.title')}</h1>
        {(error ?? notice) && (
          <p className="notice notice--error" role="alert">
            {error ?? notice}
          </p>
        )}
        <div className="login__fields">
          <Field label={t('auth.username')}>
            {(p) => (
              <input {...p} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
            )}
          </Field>
          <Field label={t('auth.password')}>
            {(p) => (
              <input
                {...p}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            )}
          </Field>
        </div>
        <button type="submit" className="btn btn--primary" disabled={pending || !username || !password}>
          {pending ? t('auth.signingIn') : t('auth.signIn')}
        </button>
        {/* Solo in sviluppo: la build di produzione elimina questo blocco */}
        {import.meta.env.DEV && (
          <p className="login__hint">Sviluppo: utenti di prova admin, mrossi, lbianchi; password Prova2026!</p>
        )}
      </form>
    </main>
  );
}

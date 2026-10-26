import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api/client';
import { ErrorMessage, Flash, useFlash } from '../components/Feedback';
import { Field } from '../components/Field';

const MIN_LENGTH = 10;

/** Cambio della propria password. */
export function PasswordPage() {
  const { t } = useTranslation();
  const [attuale, setAttuale] = useState('');
  const [nuova, setNuova] = useState('');
  const [conferma, setConferma] = useState('');
  const [flash, setFlash] = useFlash();
  const change = useMutation({ mutationFn: (body: { attuale: string; nuova: string }) => api('/api/me/password', { method: 'PUT', body }) });
  const mismatch = conferma.length > 0 && nuova !== conferma;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    change.mutate(
      { attuale, nuova },
      {
        onSuccess: () => {
          setAttuale('');
          setNuova('');
          setConferma('');
          setFlash(t('password.done'));
        },
      },
    );
  };

  return (
    <>
      <h1 className="page__title">{t('password.title')}</h1>
      <Flash message={flash} />
      <form className="sheet block narrowform" onSubmit={onSubmit} noValidate>
        {change.isError && <ErrorMessage error={change.error} />}
        <Field label={t('password.current')}>
          {(p) => <input {...p} type="password" autoComplete="current-password" value={attuale} onChange={(e) => setAttuale(e.target.value)} />}
        </Field>
        <Field label={t('password.new')} hint={t('password.rules', { count: MIN_LENGTH })}>
          {(p) => <input {...p} type="password" autoComplete="new-password" value={nuova} onChange={(e) => setNuova(e.target.value)} />}
        </Field>
        <Field label={t('password.confirm')} error={mismatch ? t('password.mismatch') : undefined}>
          {(p) => <input {...p} type="password" autoComplete="new-password" value={conferma} onChange={(e) => setConferma(e.target.value)} />}
        </Field>
        <p className="field__hint">{t('password.othersClosed')}</p>
        <div className="formactions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={change.isPending || !attuale || nuova.length < MIN_LENGTH || nuova !== conferma}
          >
            {t('password.submit')}
          </button>
        </div>
      </form>
    </>
  );
}

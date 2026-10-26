import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useCreateSupplier } from '../api/queries';
import type { NewSupplier } from '../api/types';
import { DuplicateWarning, duplicatesOf } from '../components/DuplicateWarning';
import { ErrorMessage, fieldErrors } from '../components/Feedback';
import { Field } from '../components/Field';

/** Nuovo fornitore: solo i dati essenziali; il resto si completa poi nella scheda. */
export function NewSupplierPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useCreateSupplier();
  const [f, setF] = useState({ ragioneSociale: '', partitaIva: '', codiceFiscale: '', partitaIvaCee: '', telefono: '', email: '' });
  const errors = fieldErrors(create.error);
  const duplicates = duplicatesOf(create.error);

  const submit = (confermaDuplicato = false) => {
    const body: NewSupplier = { ...f, confermaDuplicato };
    create.mutate(body, { onSuccess: ({ id }) => navigate(`/fornitori/${id}/anagrafica`) });
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(false);
  };

  const field = (k: keyof typeof f, opts: { type?: string; hint?: string; wide?: boolean } = {}) => (
    <Field label={t(`newSupplier.f.${k}`)} hint={opts.hint} error={errors[k]} className={opts.wide ? 'field--wide' : undefined}>
      {(p) => (
        <input
          {...p}
          type={opts.type ?? 'text'}
          value={f[k]}
          onChange={(e) => {
            setF({ ...f, [k]: e.target.value });
            if (duplicates) create.reset();
          }}
          autoFocus={k === 'ragioneSociale'}
        />
      )}
    </Field>
  );

  return (
    <>
      <h1 className="page__title">{t('newSupplier.title')}</h1>
      <form className="sheet block" onSubmit={onSubmit} noValidate>
        <p className="block__note block__note--top">{t('newSupplier.intro')}</p>
        {duplicates ? (
          <DuplicateWarning fornitori={duplicates} pending={create.isPending} onConfirm={() => submit(true)} />
        ) : (
          create.isError && <ErrorMessage error={create.error} />
        )}
        <div className="grid grid--3">
          {field('ragioneSociale', { wide: true })}
          {field('telefono', { type: 'tel' })}
          {field('partitaIva', { hint: t('newSupplier.hint.partitaIva') })}
          {field('codiceFiscale', { hint: t('newSupplier.hint.codiceFiscale') })}
          {field('partitaIvaCee', { hint: t('newSupplier.hint.partitaIvaCee') })}
          {field('email', { type: 'email' })}
        </div>
        <div className="formactions">
          <button type="submit" className="btn btn--primary" disabled={create.isPending || !f.ragioneSociale.trim()}>
            {t('newSupplier.submit')}
          </button>
          <button type="button" className="btn btn--quiet" onClick={() => navigate(-1)}>
            {t('general.cancel')}
          </button>
        </div>
      </form>
    </>
  );
}

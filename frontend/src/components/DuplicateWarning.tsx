import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import type { DuplicateDetails } from '../api/types';

/** Fornitori con gli stessi codici, se l'errore è un possibile duplicato; altrimenti null. */
export function duplicatesOf(error: unknown): DuplicateDetails['fornitori'] | null {
  return error instanceof ApiError && error.code === 'POSSIBILE_DUPLICATO'
    ? ((error.details as DuplicateDetails | undefined)?.fornitori ?? [])
    : null;
}

/**
 * Avviso "esiste già un fornitore con questi codici": mostra quali e permette di salvare comunque.
 * I link si aprono in una nuova scheda, per non perdere i dati del form.
 */
export function DuplicateWarning({
  fornitori,
  pending,
  onConfirm,
}: {
  fornitori: { id: number; ragioneSociale: string }[];
  pending: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="notice notice--warning" role="alert">
      <p>{t('newSupplier.duplicate')}</p>
      <ul className="notice__list">
        {fornitori.map((f) => (
          <li key={f.id}>
            <Link to={`/fornitori/${f.id}/anagrafica`} target="_blank" rel="noreferrer">
              {f.ragioneSociale}
            </Link>
          </li>
        ))}
      </ul>
      <div className="notice__actions">
        <button type="button" className="btn btn--quiet" onClick={onConfirm} disabled={pending}>
          {t('newSupplier.saveAnyway')}
        </button>
      </div>
    </div>
  );
}

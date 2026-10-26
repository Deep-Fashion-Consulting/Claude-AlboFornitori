import { useEffect } from 'react';
import { Link, Outlet, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useCurrentSupplier } from '../auth/currentSupplier';

/** Le rotte /fornitori/:id/* rendono quel fornitore il fornitore corrente. */
export function SupplierScope() {
  const { id } = useParams();
  const { select } = useCurrentSupplier();
  const supplierId = Number(id);
  useEffect(() => {
    if (Number.isInteger(supplierId) && supplierId > 0) select(supplierId);
  }, [supplierId, select]);
  return <Outlet />;
}

export function PlaceholderPage() {
  const { t } = useTranslation();
  return (
    <div className="empty-state">
      <h1>{t('placeholder.title')}</h1>
      <p>{t('placeholder.text')}</p>
    </div>
  );
}

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="empty-state">
      <h1>{t('notFound.title')}</h1>
      <p>{t('notFound.text')}</p>
      <Link to="/fornitori" className="btn btn--quiet">
        {t('notFound.back')}
      </Link>
    </div>
  );
}

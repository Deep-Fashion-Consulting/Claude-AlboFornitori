import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useSupplierHeader, useToggleFavourite } from '../api/queries';
import { useCurrentSupplier } from '../auth/currentSupplier';
import { formatDate } from '../i18n';

/**
 * Fascia del fornitore corrente (ex UCSupplierHeader): resta visibile in tutte le sezioni,
 * anche tornando alla ricerca, finché l'utente non la chiude.
 */
export function SupplierBand() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { supplierId, clear } = useCurrentSupplier();
  const { data } = useSupplierHeader(supplierId);
  const favourite = useToggleFavourite(supplierId ?? 0);

  if (!supplierId || !data) return null;

  return (
    <section className="band" aria-label={t('supplier.current')}>
      <div className="band__main">
        {/* Non è un titolo: il titolo della pagina resta l'h1 della sezione */}
        <p className="band__name">
          <Link to={`/fornitori/${data.id}/anagrafica`}>{data.ragioneSociale}</Link>
        </p>
        <p className="band__meta">
          {data.stato && <span className="tag">{data.stato}</span>}
          {!data.attivo && <span className="tag tag--muted">{t('supplier.ended')}</span>}
          {data.sedeLegale && <span>{data.sedeLegale}</span>}
          <span className="band__updated">{t('supplier.updated', { date: formatDate(data.aggiornatoIl) })}</span>
        </p>
      </div>
      <div className="band__actions">
        <button
          type="button"
          className={`star ${data.preferito ? 'star--on' : ''}`}
          aria-pressed={data.preferito}
          disabled={favourite.isPending}
          onClick={() => favourite.mutate(!data.preferito)}
          title={data.preferito ? t('supplier.favouriteRemove') : t('supplier.favouriteAdd')}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
          </svg>
          <span className="visually-hidden">
            {data.preferito ? t('supplier.favouriteRemove') : t('supplier.favouriteAdd')}
          </span>
        </button>
        <button
          type="button"
          className="btn btn--quiet btn--small"
          onClick={() => {
            clear();
            navigate('/fornitori');
          }}
        >
          {t('supplier.close')}
        </button>
      </div>
    </section>
  );
}

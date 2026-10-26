import { NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMenu } from '../api/queries';
import type { MenuNode } from '../api/types';
import { useCurrentSupplier } from '../auth/currentSupplier';

/** Menu costruito dalle funzioni abilitate (GetApplicationMenu); cambia con il fornitore corrente. */
export function SideMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { supplierId } = useCurrentSupplier();
  const { data } = useMenu(supplierId);
  if (!data) return null;

  // Con una sola area non serve mostrarla: i gruppi sono i moduli
  const groups: MenuNode[] = data.length === 1 ? data[0]!.figli : data;
  const href = (route: string) => route.replace(':id', String(supplierId ?? ''));

  return (
    <nav aria-label={t('nav.menu')} className="sidemenu">
      {groups.map((g) => (
        <section key={g.codice} className="sidemenu__group">
          <h2 className="sidemenu__title">{g.descrizione}</h2>
          <ul>
            {g.figli
              .filter((f) => f.route)
              .map((f) => (
                <li key={f.codice}>
                  <NavLink to={href(f.route!)} end className="sidemenu__link" onClick={onNavigate}>
                    {f.descrizione}
                  </NavLink>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

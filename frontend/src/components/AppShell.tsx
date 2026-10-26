import { useState } from 'react';
import { Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { setLanguage } from '../api/queries';
import type { Lingua } from '../api/types';
import { useAuth, useMe } from '../auth/AuthProvider';
import { SideMenu } from './SideMenu';
import { SupplierBand } from './SupplierBand';

export function AppShell() {
  const { t } = useTranslation();
  const me = useMe();
  const { setMe, signOut } = useAuth();
  const qc = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);

  const changeLanguage = async (lingua: Lingua) => {
    if (lingua === me.lingua) return;
    await setLanguage(lingua);
    setMe({ ...me, lingua });
    // menu, liste e stati sono tradotti lato server
    await qc.invalidateQueries();
  };

  return (
    <div className="shell">
      <a href="#contenuto" className="skiplink">
        {t('nav.skip')}
      </a>
      <header className="topbar">
        <button
          type="button"
          className="topbar__menu btn btn--quiet btn--small"
          aria-expanded={menuOpen}
          aria-controls="menu-laterale"
          onClick={() => setMenuOpen((o) => !o)}
        >
          {t('nav.menu')}
        </button>
        <p className="topbar__title">{t('app.title')}</p>
        <div className="topbar__tools">
          <div className="langswitch" role="group" aria-label={t('nav.language')}>
            {(['IT', 'EN'] as const).map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={me.lingua === l}
                className={me.lingua === l ? 'is-active' : undefined}
                onClick={() => void changeLanguage(l)}
              >
                {l}
              </button>
            ))}
          </div>
          <span className="topbar__user">
            {me.nome} {me.cognome}
          </span>
          <button type="button" className="btn btn--quiet btn--small" onClick={() => void signOut()}>
            {t('auth.signOut')}
          </button>
        </div>
      </header>

      <div className="shell__body">
        <aside id="menu-laterale" className={`shell__nav ${menuOpen ? 'is-open' : ''}`}>
          <SideMenu onNavigate={() => setMenuOpen(false)} />
        </aside>
        <main id="contenuto" className="shell__main" tabIndex={-1}>
          <SupplierBand />
          <div className="page">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

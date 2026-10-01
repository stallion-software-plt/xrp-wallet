import {useLocation, useNavigate} from 'react-router';
import {useTranslation} from 'react-i18next';
import {short} from '../core/format';
import {findNav} from '../nav';
import {useAccount} from '../state/account';
import {useApp} from '../state/app';
import {copy} from '../state/toasts';
import {Dropdown} from './Dropdown';
import {LanguageMenu, ThemeButton} from './ThemeLangTools';

export function Topbar({onLogout}: {onLogout: () => void}) {
  const {t} = useTranslation();
  const navigate = useNavigate();
  const {pathname} = useLocation();
  const network = useApp(s => s.network);
  const online = useApp(s => s.online);
  const sidebarOpen = useApp(s => s.sidebarOpen);
  const setSidebarOpen = useApp(s => s.setSidebarOpen);
  const address = useAccount(s => s.address) || '';
  const nav = findNav(pathname);

  return (
    <header className="topbar">
      <button type="button" className="icon-btn menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}><i className="fa fa-bars" /></button>
      <div className="topbar-title">
        {nav && <span className="crumb">{t(nav.group.title)}<i className="fa fa-angle-right" /></span>}
        {nav && t(nav.item.label)}
      </div>
      {network.networkType !== 'xrp' && (
        <span className="badge badge-warning hide-sm"><i className="fa fa-flask" /> {t(network.name)}</span>
      )}
      <div className="topbar-spacer" />

      <div className="addr-chip hide-sm" title={address}>
        <span className={`dot ${online ? 'on' : 'off'}`} />
        <span className="addr-text">{short(address, 8, 6)}</span>
        <button type="button" className="icon-btn sm" onClick={() => copy(address)} title={t('copy_address')}><i className="fa fa-clone" /></button>
      </div>

      <ThemeButton />
      <LanguageMenu />

      <Dropdown trigger={toggle => (
        <button type="button" className="icon-btn" onClick={toggle} title={t('account')}><i className="fa fa-user-circle-o" /></button>
      )}>
        {close => {
          const go = (path: string) => { close(); navigate(path); };
          return (
            <>
              <li className="dd-label">{t('account')}</li>
              <li><a onClick={() => go('/receive')}><i className="fa fa-qrcode" /> {t('receive')}</a></li>
              <li><a onClick={() => go('/account')}><i className="fa fa-sliders" /> {t('account_settings')}</a></li>
              <li><a onClick={() => go('/security')}><i className="fa fa-shield" /> {t('security_backup')}</a></li>
              <li><a onClick={() => go('/settings')}><i className="fa fa-cog" /> {t('app_settings')}</a></li>
              <li className="divider" />
              <li><a onClick={() => { close(); onLogout(); }}><i className="fa fa-sign-out" /> {t('logout')}</a></li>
            </>
          );
        }}
      </Dropdown>
    </header>
  );
}

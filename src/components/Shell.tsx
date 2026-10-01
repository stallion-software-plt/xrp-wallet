import {useEffect} from 'react';
import {Navigate, Outlet, useLocation, useNavigate} from 'react-router';
import {useTranslation} from 'react-i18next';
import * as session from '../core/session';
import {useAutoLock} from '../hooks/useAutoLock';
import {useAccount} from '../state/account';
import {useApp} from '../state/app';
import {Sidebar} from './Sidebar';
import {Topbar} from './Topbar';

/** Layout for an open wallet. Without one, sends the user to the login screen. */
export function Shell() {
  const {t} = useTranslation();
  const navigate = useNavigate();
  const {pathname} = useLocation();
  const address = useAccount(s => s.address);
  const readOnly = useAccount(s => s.readOnly);
  const setSidebarOpen = useApp(s => s.setSidebarOpen);

  useEffect(() => setSidebarOpen(false), [pathname, setSidebarOpen]);
  // A lock notice is only for the next login screen.
  useEffect(() => {
    if (address) useApp.setState({lockedAfter: 0});
  }, [address]);

  // Closing the wallet sends the user to the login screen, which explains the lock.
  useAutoLock(minutes => {
    useApp.setState({lockedAfter: minutes});
    session.close();
  });

  if (!address) return <Navigate to="/login" replace />;

  const logout = () => {
    session.close();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main">
        <Topbar onLogout={logout} />
        {readOnly && (
          <div className="banner warning"><i className="fa fa-eye" /> <span>{t('watch_only_banner')}</span></div>
        )}
        <main className="content"><Outlet /></main>
        <footer className="app-footer">
          <span>XRP Wallet · {t('version')} {__APP_VERSION__}</span>
          <span className="spacer" />
          <span>{t('powered_by_xrpl')}</span>
        </footer>
      </div>
    </div>
  );
}

/** Layout for the login and create screens. An open wallet goes straight to the dashboard. */
export function AuthLayout() {
  const address = useAccount(s => s.address);
  if (address) return <Navigate to="/balance" replace />;
  return <div className="app-shell is-auth"><main className="auth-view"><Outlet /></main></div>;
}

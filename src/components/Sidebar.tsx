import {NavLink, useNavigate} from 'react-router';
import {useTranslation} from 'react-i18next';
import logo from '../../assets/ripple.png';
import {NAV} from '../nav';
import {useApp} from '../state/app';

export function Sidebar() {
  const {t} = useTranslation();
  const navigate = useNavigate();
  const network = useApp(s => s.network);
  const online = useApp(s => s.online);
  const ledgerIndex = useApp(s => s.ledgerIndex);
  const open = useApp(s => s.sidebarOpen);
  const hasFeature = (feature?: string) => !feature || network.tabs.includes(feature as never);

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="brand">
        <div className="brand-mark"><img src={logo} alt="" /></div>
        <div>
          <div className="brand-name">XRP Wallet</div>
          <div className="brand-sub">{t('desktop_client')}</div>
        </div>
      </div>

      <nav className="nav-scroll">
        {NAV.filter(group => group.items.some(i => hasFeature(i.feature))).map(group => (
          <div className="nav-group" key={group.title}>
            <div className="nav-group-title">{t(group.title)}</div>
            {group.items.filter(i => hasFeature(i.feature)).map(item => (
              <NavLink key={item.path} to={item.path} className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
                <i className={`fa ${item.icon}`} /><span>{t(item.label)}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="net-card" onClick={() => navigate('/settings')} title={t('switch_net')}>
          <span className={`dot ${online ? 'on' : 'off'}`} />
          <div className="grow">
            <div className="net-name truncate">{t(network.name)}</div>
            <div className="net-status">
              {t(online ? 'connected' : 'disconnected')}
              {online && ledgerIndex ? <span> · #{ledgerIndex}</span> : null}
            </div>
          </div>
          <i className="fa fa-angle-right text-faint" />
        </div>
      </div>
    </aside>
  );
}

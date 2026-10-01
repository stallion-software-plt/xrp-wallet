import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {PageHeader} from '../components/Common';
import * as settings from '../core/settings';
import {AUTO_LOCK_CHOICES, NETWORKS, type NetworkType, type Server} from '../core/settings';
import {LANGUAGES} from '../i18n';
import {resetAccountData} from '../state/account';
import {useApp} from '../state/app';
import {connect} from '../xrpl/connection';

export function Settings() {
  const {t} = useTranslation();
  const network = useApp(s => s.network);
  const ledgerIndex = useApp(s => s.ledgerIndex);
  const theme = useApp(s => s.theme);
  const lang = useApp(s => s.lang);
  const setTheme = useApp(s => s.setTheme);
  const setLang = useApp(s => s.setLang);
  const reloadNetwork = useApp(s => s.reloadNetwork);
  const autoLockMinutes = useApp(s => s.autoLockMinutes);
  const setAutoLockMinutes = useApp(s => s.setAutoLockMinutes);

  const [active, setActive] = useState<NetworkType>(settings.getNetworkType);
  const [type, setType] = useState<NetworkType>(settings.getNetworkType);
  const [servers, setServers] = useState<Server[]>(() => settings.getServers(type));
  const [coin, setCoin] = useState(() => settings.getCoin(type));
  const [serverUrl, setServerUrl] = useState('');
  const [serverPort, setServerPort] = useState('');
  const [error, setError] = useState('');

  const pick = (next: NetworkType) => {
    setType(next);
    setServers(settings.getServers(next));
    setCoin(settings.getCoin(next));
  };

  const updateServers = (list: Server[]) => {
    setServers(list);
    settings.setServers(list, type);
  };

  const addServer = () => {
    updateServers([...servers, {server: serverUrl.trim(), port: Number(serverPort) || 443}]);
    setServerUrl('');
    setServerPort('');
  };

  const resetServers = () => {
    settings.resetServers(type);
    setServers(settings.getServers(type));
  };

  // Switches network in place: the wallet stays open and reconnects to the new servers.
  const save = () => {
    setError('');
    try {
      settings.setNetworkType(type);
      if (type === 'other') settings.setCoin(coin);
      resetAccountData();
      reloadNetwork();
      connect(settings.getServers(type));
      setActive(type);
    } catch (e) {
      console.error(e);
      setError((e as Error).message);
    }
  };

  return (
    <>
      <PageHeader title="app_settings" sub="settings_sub" />

      <div className="grid-main">
        <div className="stack">
          <div className="card">
            <div className="card-header"><div><div className="card-title">{t('switch_net')}</div><div className="card-sub">{t('switch_net_desc')}</div></div></div>
            <div className="card-body">
              <div className="net-grid">
                {Object.values(NETWORKS).map(n => (
                  <div key={n.networkType} className={`net-option ${type === n.networkType ? 'active' : ''}`} onClick={() => pick(n.networkType)}>
                    <div className="between">
                      <div className="asset-logo sm"><img src={n.coin.logo} alt="" /></div>
                      <span className="net-badges">
                        {active === n.networkType && <span className="badge badge-success"><span className="dot on" /> {t('active')}</span>}
                        {n.faucet && <span className="badge badge-warning"><i className="fa fa-flask" /> {t('testnet')}</span>}
                      </span>
                    </div>
                    <div className="fw-600 mt-8">{t(n.name)}</div>
                    <div className="text-xs text-faint">{(n.networkType === 'other' ? settings.getCoin('other') : n.coin.code) || '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div><div className="card-title">{t('server')}</div><div className="card-sub">{t(NETWORKS[type].name)}</div></div></div>
            {servers.length > 0 ? (
              <table className="table">
                <tbody>
                  {servers.map((remote, i) => (
                    <tr key={`${remote.server}:${remote.port}:${i}`}>
                      <td className="mono"><i className="fa fa-server text-faint" /> {remote.server}</td>
                      <td className="text-muted">{remote.port}</td>
                      <td className="text-right"><button type="button" className="btn btn-ghost btn-xs" onClick={() => updateServers(servers.filter((_, j) => j !== i))}><i className="fa fa-times" /> {t('remove')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="empty"><div>{t('no_servers')}</div></div>}
            <div className="card-body stack border-top">
              <div className="cluster-lg align-end">
                <div className="field grow mb-0"><label htmlFor="server_url">{t('server')}</label><input id="server_url" className="input mono" type="text" value={serverUrl} onChange={e => setServerUrl(e.target.value)} placeholder="s1.ripple.com" /></div>
                <div className="field mb-0 port-field"><label htmlFor="server_port">{t('port')}</label><input id="server_port" className="input" type="number" value={serverPort} onChange={e => setServerPort(e.target.value)} placeholder="443" /></div>
                <button type="button" className="btn btn-secondary" disabled={!serverUrl.trim()} onClick={addServer}><i className="fa fa-plus" /> {t('add')}</button>
                <button type="button" className="btn btn-ghost" onClick={resetServers}><i className="fa fa-undo" /> {t('reset')}</button>
              </div>
              {type === 'other' && (
                <div className="field">
                  <label htmlFor="network_coin">{t('coin_ticket')}</label>
                  <input id="network_coin" className="input" type="text" value={coin} onChange={e => setCoin(e.target.value.trim())} placeholder="XRP" />
                </div>
              )}
              {error && <div className="alert alert-error"><i className="fa fa-exclamation-circle" /><span>{error}</span></div>}
            </div>
            <div className="card-footer">
              <span className="text-xs text-faint">{t('save_reconnect_hint')}</span>
              <span className="spacer" />
              <button type="button" className="btn btn-primary" disabled={(type === 'other' && !coin) || !servers.length} onClick={save}><i className="fa fa-check" /> {t('save')}</button>
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-header"><div className="card-title">{t('appearance')}</div></div>
            <div className="card-body stack">
              <div className="field">
                <label>{t('theme')}</label>
                <div className="tabs block">
                  <span className={`tab ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}><i className="fa fa-sun-o" /> {t('light')}</span>
                  <span className={`tab ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}><i className="fa fa-moon-o" /> {t('dark')}</span>
                </div>
              </div>
              <div className="field">
                <label>{t('language')}</label>
                <div className="tabs block">
                  {LANGUAGES.map(l => <span key={l.key} className={`tab ${lang === l.key ? 'active' : ''}`} onClick={() => setLang(l.key)}>{l.label}</span>)}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">{t('auto_lock')}</div></div>
            <div className="card-body stack-sm">
              <div className="tabs block">
                {AUTO_LOCK_CHOICES.map(m => (
                  <span key={m} className={`tab ${autoLockMinutes === m ? 'active' : ''}`} onClick={() => setAutoLockMinutes(m)}>{t('minutes_n', {n: m})}</span>
                ))}
              </div>
              <div className="hint">{t('auto_lock_desc')}</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">{t('about')}</div></div>
            <div className="card-body">
              <dl className="kv">
                <dt>{t('version')}</dt><dd>{__APP_VERSION__}</dd>
                <dt>{t('network')}</dt><dd>{t(network.name)}</dd>
                <dt>{t('ledger')}</dt><dd>#{ledgerIndex || '—'}</dd>
                <dt>xrpl.js</dt><dd>{__XRPL_VERSION__}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

import {useState} from 'react';
import {useNavigate} from 'react-router';
import {useTranslation} from 'react-i18next';
import {AssetCell} from '../components/AssetCell';
import {Dropdown} from '../components/Dropdown';
import {Modal} from '../components/Modal';
import {Qr} from '../components/Qr';
import {TxItem} from '../components/TxItem';
import {assetKey, fmtFixed, short} from '../core/format';
import {getGateway} from '../core/gateways';
import {getLang, getTradePair, setTradePair} from '../core/settings';
import {useActivity} from '../hooks/useActivity';
import {refreshAccount, useAccount, useAvailable, useReserve, type TrustLine} from '../state/account';
import {useApp} from '../state/app';
import {copy} from '../state/toasts';
import {changeTrust, errorMessage, fundFromFaucet} from '../xrpl/api';

interface DepositInfo {
  address?: string;
  network?: string;
  memo?: string;
  logo?: string;
  extra_info?: string[];
}

export function Balance() {
  const {t} = useTranslation();
  const navigate = useNavigate();
  const network = useApp(s => s.network);
  const online = useApp(s => s.online);
  const ledgerIndex = useApp(s => s.ledgerIndex);
  const reserveBase = useApp(s => s.reserveBase);
  const reserveInc = useApp(s => s.reserveInc);
  const {address, readOnly, loaded, unfunded, balance, ownerCount, lines} = useAccount();
  const reserve = useReserve();
  const available = useAvailable();
  const activity = useActivity(8);
  const recent = activity.rows.slice(0, 6);
  const native = network.coin;
  const hasFeature = (f: string) => network.tabs.includes(f as never);

  const [working, setWorking] = useState(false);
  const [removing, setRemoving] = useState<Record<string, boolean>>({});
  const [removeError, setRemoveError] = useState('');
  const [faucetWorking, setFaucetWorking] = useState(false);
  const [faucetError, setFaucetError] = useState('');
  const [deposit, setDeposit] = useState<{working: boolean; error: string; info: DepositInfo} | null>(null);

  const refresh = async () => {
    if (working) return;
    setWorking(true);
    activity.refresh();
    await refreshAccount();
    setWorking(false);
  };

  const fundFaucet = async () => {
    setFaucetWorking(true);
    setFaucetError('');
    try {
      await fundFromFaucet();
      setTimeout(() => void refresh(), 4000);
    } catch (err) {
      setFaucetError(errorMessage(err));
    } finally {
      setFaucetWorking(false);
    }
  };

  const removeTrust = async (line: TrustLine) => {
    const key = assetKey(line.currency, line.issuer);
    setRemoveError('');
    setRemoving(r => ({...r, [key]: true}));
    try {
      await changeTrust(line.currency, line.issuer, '0');
    } catch (err) {
      setRemoveError(errorMessage(err));
    } finally {
      setRemoving(r => ({...r, [key]: false}));
    }
  };

  const goTrade = (code: string, issuer: string) => {
    const pair = getTradePair();
    setTradePair({...pair, base_code: code, base_issuer: issuer});
    navigate('/trade');
  };

  const openDeposit = async (line: TrustLine) => {
    const gateway = getGateway(network, line.currency, line.issuer);
    setDeposit({working: true, error: '', info: {}});
    try {
      const params = new URLSearchParams({address: address!, currency: line.currency, network: 'ripple', lang: getLang()});
      const response = await fetch(`${gateway.deposit}?${params}`);
      const data = await response.json();
      if (data.error) {
        setDeposit({working: false, error: data.error_message || data.error, info: {}});
      } else if (typeof data !== 'object' || !data.address || !Array.isArray(data.extra_info ?? [])) {
        setDeposit({working: false, error: 'Can not parse result.', info: {}});
      } else {
        setDeposit({working: false, error: '', info: {...data, logo: data.logo || gateway.logo}});
      }
    } catch (err) {
      console.error('Deposit lookup failed', err);
      setDeposit({working: false, error: errorMessage(err) || 'NetworkError', info: {}});
    }
  };

  return (
    <div className="stack-lg">
      <div className="hero-card">
        <div className="between hero-top">
          <div>
            <div className="hero-label">{t('total_balance')}</div>
            <div className="hero-value">{fmtFixed(balance, 6)}<small>{native.code}</small></div>
            <div className="hero-meta">
              <span><i className="fa fa-unlock-alt" /> {t('available')} {fmtFixed(available, 6)}</span>
              <span><i className="fa fa-lock" /> {t('reserved')} {fmtFixed(reserve, 2)}</span>
            </div>
          </div>
          <div className="cluster">
            <div className="addr-chip" title={address || ''}>
              <span className="addr-text">{short(address, 8, 6)}</span>
              <button type="button" className="icon-btn sm hero-copy" onClick={() => copy(address)}><i className="fa fa-clone" /></button>
            </div>
            <button type="button" className="btn btn-hero btn-icon" onClick={refresh} disabled={working} title={t('refresh')}>
              <i className={`fa fa-refresh ${working ? 'fa-spin' : ''}`} />
            </button>
          </div>
        </div>
        <div className="hero-actions">
          <button type="button" className="btn btn-hero solid" onClick={() => navigate('/send')} disabled={readOnly}><i className="fa fa-paper-plane" /> {t('send')}</button>
          <button type="button" className="btn btn-hero" onClick={() => navigate('/receive')}><i className="fa fa-qrcode" /> {t('receive')}</button>
          {hasFeature('trade') && <button type="button" className="btn btn-hero" onClick={() => navigate('/convert')}><i className="fa fa-exchange" /> {t('swap')}</button>}
          {hasFeature('trade') && <button type="button" className="btn btn-hero" onClick={() => navigate('/trade')}><i className="fa fa-line-chart" /> {t('trade')}</button>}
        </div>
      </div>

      {loaded && unfunded && (
        <div className="card">
          <div className="card-body cluster-lg">
            <div className="empty-icon-inline"><i className="fa fa-info" /></div>
            <div className="grow">
              <div className="fw-600">{t('account_not_activated')}</div>
              <div className="text-muted text-sm">{t('NotFoundError', native)}</div>
            </div>
            {network.faucet && (
              <button type="button" className="btn btn-primary" onClick={fundFaucet} disabled={faucetWorking}>
                <i className={`fa ${faucetWorking ? 'fa-spinner fa-pulse' : 'fa-tint'}`} /> {t('faucet_fund')}
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/receive')}><i className="fa fa-qrcode" /> {t('receive')}</button>
          </div>
          {faucetError && <div className="card-footer"><span className="text-danger text-sm">{faucetError}</span></div>}
        </div>
      )}

      <div className="grid-4">
        <div className="card stat">
          <div className="stat-label"><i className="fa fa-certificate" /> {t('tokens')}</div>
          <div className="stat-value">{lines.length}</div>
          <div className="stat-hint">{t('trust_lines')}</div>
        </div>
        <div className="card stat">
          <div className="stat-label"><i className="fa fa-cubes" /> {t('owned_objects')}</div>
          <div className="stat-value">{ownerCount || 0}</div>
          <div className="stat-hint">{reserveInc || 0} {native.code} {t('each')}</div>
        </div>
        <div className="card stat">
          <div className="stat-label"><i className="fa fa-lock" /> {t('reserved')}</div>
          <div className="stat-value">{fmtFixed(reserve, 2)}</div>
          <div className="stat-hint">{t('base_reserve')} {reserveBase || 0} {native.code}</div>
        </div>
        <div className="card stat">
          <div className="stat-label"><span className={`dot ${online ? 'on' : 'off'}`} /> {t('network')}</div>
          <div className="stat-value truncate stat-network">{t(network.name)}</div>
          <div className="stat-hint">{t('ledger')} #{ledgerIndex || '—'}</div>
        </div>
      </div>

      <div className="grid-main">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">{t('assets')}</div>
              <div className="card-sub">{t('assets_sub')}</div>
            </div>
            <div className="card-actions">
              {hasFeature('trust') && <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/trust')}><i className="fa fa-plus" /> {t('add_token')}</button>}
            </div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>{t('asset')}</th>
                <th className="text-right">{t('balance')}</th>
                <th className="text-right hide-md">{t('trust_limit')}</th>
                <th className="col-menu" />
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><AssetCell code={native.code} logo={native.logo} name={t(network.name)} /></td>
                <td className="text-right num">
                  <div className="fw-600">{fmtFixed(balance, 6)}</div>
                  <div className="text-xs text-faint">{t('reserved')} {fmtFixed(reserve, 2)}</div>
                </td>
                <td className="text-right hide-md text-faint">—</td>
                <td>
                  <Dropdown trigger={toggle => <button type="button" className="icon-btn sm" onClick={toggle}><i className="fa fa-ellipsis-h" /></button>}>
                    {close => (
                      <>
                        <li><a onClick={() => { close(); navigate('/send'); }}><i className="fa fa-paper-plane" /> {t('send')}</a></li>
                        <li><a onClick={() => { close(); navigate('/receive'); }}><i className="fa fa-qrcode" /> {t('receive')}</a></li>
                        {hasFeature('trade') && <li><a onClick={() => { close(); goTrade(native.code, ''); }}><i className="fa fa-line-chart" /> {t('trade')}</a></li>}
                      </>
                    )}
                  </Dropdown>
                </td>
              </tr>
              {lines.map(line => {
                const gateway = getGateway(network, line.currency, line.issuer);
                const key = assetKey(line.currency, line.issuer);
                const canRemove = !(Number(line.limit) === 0 && line.no_ripple) && !removing[key];
                return (
                  <tr key={key}>
                    <td><AssetCell code={line.currency} logo={gateway.logo} name={gateway.name} website={gateway.website} issuer={line.issuer} /></td>
                    <td className="text-right num">
                      <div className="fw-600">{fmtFixed(line.value, 6)}</div>
                      {removing[key] && <div className="text-xs"><span className="spinner" /> {t('trust_removeing')}</div>}
                      {(line.freeze || line.freeze_peer) && <div className="text-xs text-warning"><i className="fa fa-snowflake-o" /> {t('frozen')}</div>}
                    </td>
                    <td className="text-right hide-md num text-muted">{fmtFixed(line.limit, 0)}</td>
                    <td>
                      <Dropdown trigger={toggle => <button type="button" className="icon-btn sm" onClick={toggle}><i className="fa fa-ellipsis-h" /></button>}>
                        {close => (
                          <>
                            {gateway.deposit && <li><a onClick={() => { close(); void openDeposit(line); }}><i className="fa fa-download" /> {t('deposit')}</a></li>}
                            {gateway.withdraw && <li><a onClick={() => { close(); navigate(`/send?address=${encodeURIComponent(gateway.withdraw!)}`); }}><i className="fa fa-upload" /> {t('withdraw')}</a></li>}
                            {hasFeature('trade') && <li><a onClick={() => { close(); goTrade(line.currency, line.issuer); }}><i className="fa fa-line-chart" /> {t('trade')}</a></li>}
                            <li><a onClick={() => { close(); void copy(line.issuer); }}><i className="fa fa-clone" /> {t('copy_issuer')}</a></li>
                            {canRemove && <li className="divider" />}
                            {canRemove && <li><a className="text-danger" onClick={() => { close(); void removeTrust(line); }}><i className="fa fa-trash-o" /> {t('trust_remove')}</a></li>}
                          </>
                        )}
                      </Dropdown>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!lines.length && (
            <div className="empty">
              <div className="empty-icon"><i className="fa fa-certificate" /></div>
              <div className="empty-title">{t('no_tokens')}</div>
              <div>{t('no_tokens_desc')}</div>
            </div>
          )}
          {removeError && <div className="card-footer"><span className="text-danger text-sm">{removeError}</span></div>}
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">{t('recent_activity')}</div>
            <div className="card-actions"><a className="btn btn-ghost btn-sm" onClick={() => navigate('/history')}>{t('view_all')} <i className="fa fa-angle-right" /></a></div>
          </div>
          <div className="tx-list compact">
            {recent.map(tx => <TxItem key={tx.hash} tx={tx} />)}
          </div>
          {activity.loading && !recent.length && <div className="loading-row"><span className="spinner" /> {t('loading')}</div>}
          {!activity.loading && !recent.length && (
            <div className="empty">
              <div className="empty-icon"><i className="fa fa-history" /></div>
              <div className="empty-title">{t('no_activity')}</div>
            </div>
          )}
        </div>
      </div>

      {deposit && (
        <Modal title={t('deposit')} onClose={() => setDeposit(null)}>
          {deposit.working && <div className="loading-row"><span className="spinner" /> {t('loading')}</div>}
          {deposit.error && <div className="alert alert-error"><i className="fa fa-exclamation-circle" /><span>{t(deposit.error)}</span></div>}
          {deposit.info.address && (
            <div className="cluster-lg align-start">
              <Qr value={deposit.info.address} size={148} />
              <div className="grow stack-sm">
                {deposit.info.logo && <div className="asset-logo lg"><img src={deposit.info.logo} alt="" /></div>}
                <label>{deposit.info.network}</label>
                <div className="mono break">{deposit.info.address} <a className="icon-btn sm" onClick={() => copy(deposit.info.address)}><i className="fa fa-clone" /></a></div>
                {deposit.info.memo && <div><label>{t('message')}</label><div className="mono break">{deposit.info.memo}</div></div>}
              </div>
            </div>
          )}
          {!!deposit.info.extra_info?.length && (
            <div className="alert alert-info">
              <i className="fa fa-info-circle" />
              <div><div className="alert-title">{t('attention')}</div>{deposit.info.extra_info.map((msg, i) => <div key={i}>{msg}</div>)}</div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {useTranslation} from 'react-i18next';
import {AssetCell} from '../components/AssetCell';
import {getLedgerTomlCurrencies, getRippleTxt} from '../core/federation';
import {assetKey, fmtCode, fmtFixed, realCode} from '../core/format';
import {gatewaysFor, getGateway} from '../core/gateways';
import {isValidAddress} from '../core/id';
import {useDebounced} from '../hooks/useDebounced';
import {useTx, type TxStatusState} from '../hooks/useTx';
import {openExternal} from '../platform/desktop';
import {useAccount, type TrustLine} from '../state/account';
import {useApp} from '../state/app';
import {changeTrust} from '../xrpl/api';

type Mode = 'mine' | 'community' | 'manual';

/** Inline status under a trust line action. */
function LineStatus({state}: {state?: TxStatusState}) {
  const {t} = useTranslation();
  if (!state) return null;
  return (
    <>
      {state.error && <span className="text-xs text-danger">{t(state.error)}</span>}
      {state.state === 'submitted' && <span className="text-xs text-muted">{t('submitted')}</span>}
      {state.state === 'success' && <span className="text-xs text-success"><i className="fa fa-check" /> {t('trust_granted')}</span>}
    </>
  );
}

export function Tokens() {
  const {t} = useTranslation();
  const network = useApp(s => s.network);
  const lines = useAccount(s => s.lines);
  const readOnly = useAccount(s => s.readOnly);
  const tx = useTx();
  const [mode, setMode] = useState<Mode>(() => (lines.length ? 'mine' : 'community'));
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [manual, setManual] = useState({issuer: '', code: '', limit: ''});
  const [domain, setDomain] = useState('');
  const [lookup, setLookup] = useState<{loading: boolean; error: string; currencies: Array<{code: string; issuer: string}>}>({loading: false, error: '', currencies: []});
  const debouncedDomain = useDebounced(domain.trim());
  const lookupId = useRef(0);
  const gateways = gatewaysFor(network);

  const hasLine = (code: string, issuer: string) => {
    const line = lines.find(l => l.currency === realCode(code) && l.issuer === issuer);
    return line ? Number(line.limit) > 0 : false;
  };
  const busy = (code: string, issuer: string) => tx.busy(assetKey(code, issuer));
  const status = (code: string, issuer: string) => tx.status[assetKey(code, issuer)];
  const setTrust = (code: string, issuer: string, limit: string) => tx.run(assetKey(code, issuer), () => changeTrust(code, issuer, limit || '1000000000'));

  // Prefer the issuer's xrp-ledger.toml, fall back to the legacy ripple.txt.
  useEffect(() => {
    const id = ++lookupId.current;
    if (!debouncedDomain) {
      setLookup({loading: false, error: '', currencies: []});
      return;
    }
    setLookup({loading: true, error: '', currencies: []});
    (async () => {
      let currencies: Array<{code: string; issuer: string}>;
      try {
        try {
          currencies = await getLedgerTomlCurrencies(debouncedDomain);
        } catch {
          const txt = await getRippleTxt(debouncedDomain);
          currencies = (txt.currencies || []).map(line => {
            const [code, issuer] = line.split(' ');
            return {code, issuer: issuer || (txt.accounts || [])[0]};
          });
        }
        if (id !== lookupId.current) return;
        setLookup({loading: false, error: currencies.length ? '' : 'fed_unable', currencies});
      } catch (err) {
        if (id !== lookupId.current) return;
        setLookup({loading: false, error: (err as Error).message, currencies: []});
      }
    })();
  }, [debouncedDomain]);

  const saveLimit = async (line: TrustLine) => {
    const id = line.currency + line.issuer;
    const hash = await setTrust(line.currency, line.issuer, editing[id]);
    if (hash) setEditing(e => {
      const next = {...e};
      delete next[id];
      return next;
    });
  };

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    if (!manual.code || !isValidAddress(manual.issuer)) return;
    void setTrust(manual.code, manual.issuer, manual.limit);
  };

  const trustButtons = (code: string, issuer: string, withCode = true) => (
    <div className="stack-sm align-end">
      {hasLine(code, issuer)
        ? <button type="button" className="btn btn-danger-soft btn-sm" onClick={() => void setTrust(code, issuer, '0')} disabled={busy(code, issuer) || readOnly}>
            <i className={`fa ${busy(code, issuer) ? 'fa-spinner fa-pulse' : 'fa-minus'}`} /> {t('trust_remove')}
          </button>
        : <button type="button" className="btn btn-soft btn-sm" onClick={() => void setTrust(code, issuer, '')} disabled={busy(code, issuer) || readOnly}>
            <i className={`fa ${busy(code, issuer) ? 'fa-spinner fa-pulse' : 'fa-plus'}`} /> {withCode ? `${t('trust_add')} ${fmtCode(code)}` : fmtCode(code)}
          </button>}
      <LineStatus state={status(code, issuer)} />
    </div>
  );

  const manualInfo = isValidAddress(manual.issuer) ? getGateway(network, realCode(manual.code || 'X'), manual.issuer) : null;
  const manualStatus = manual.code && manual.issuer ? status(manual.code, manual.issuer) : undefined;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t('tokens')}</h1>
          <div className="page-sub">{t('tokens_sub')}</div>
        </div>
        <div className="tabs">
          <span className={`tab ${mode === 'mine' ? 'active' : ''}`} onClick={() => setMode('mine')}><i className="fa fa-list" /> {t('my_tokens')}</span>
          <span className={`tab ${mode === 'community' ? 'active' : ''}`} onClick={() => setMode('community')}><i className="fa fa-compass" /> {t('discover')}</span>
          <span className={`tab ${mode === 'manual' ? 'active' : ''}`} onClick={() => setMode('manual')}><i className="fa fa-plus" /> {t('manual_add')}</span>
        </div>
      </div>

      {mode === 'mine' && (
        <div className="card">
          {lines.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('asset')}</th>
                  <th className="text-right">{t('balance')}</th>
                  <th className="text-right">{t('trust_limit')}</th>
                  <th className="text-right">{t('action')}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(line => {
                  const gateway = getGateway(network, line.currency, line.issuer);
                  const id = line.currency + line.issuer;
                  const st = status(line.currency, line.issuer);
                  return (
                    <tr key={id}>
                      <td>
                        <AssetCell code={line.currency} logo={gateway.logo} name={gateway.name} website={gateway.website} issuer={line.issuer} />
                        <div className="cluster mt-4">
                          {(line.freeze || line.freeze_peer) && <span className="badge badge-warning"><i className="fa fa-snowflake-o" /> {t('frozen')}</span>}
                          {!line.no_ripple && <span className="badge badge-info"><i className="fa fa-random" /> {t('rippling')}</span>}
                        </div>
                      </td>
                      <td className="text-right num fw-600">{fmtFixed(line.value, 6)}</td>
                      <td className="text-right num col-limit">
                        {editing[id] === undefined ? (
                          <div>{fmtFixed(line.limit, 0)} <a className="icon-btn sm" onClick={() => setEditing(e => ({...e, [id]: line.limit}))} title={t('edit')}><i className="fa fa-pencil" /></a></div>
                        ) : (
                          <div className="input-group">
                            <input className="input input-sm" value={editing[id]} onChange={e => setEditing(x => ({...x, [id]: e.target.value}))} />
                            <button type="button" className="btn btn-sm" onClick={() => void saveLimit(line)} disabled={busy(line.currency, line.issuer)}><i className="fa fa-check" /></button>
                          </div>
                        )}
                      </td>
                      <td className="text-right">
                        <button type="button" className="btn btn-danger-soft btn-sm" onClick={() => void setTrust(line.currency, line.issuer, '0')}
                          disabled={busy(line.currency, line.issuer) || Number(line.value) !== 0 || readOnly}
                          title={Number(line.value) !== 0 ? t('trust_remove_balance') : ''}>
                          <i className={`fa ${busy(line.currency, line.issuer) ? 'fa-spinner fa-pulse' : 'fa-trash-o'}`} /> {t('remove')}
                        </button>
                        {st?.error && <div className="text-xs text-danger mt-4">{t(st.error)}</div>}
                        {st?.state === 'submitted' && <div className="text-xs text-muted mt-4">{t('submitted')}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="empty">
              <div className="empty-icon"><i className="fa fa-certificate" /></div>
              <div className="empty-title">{t('no_tokens')}</div>
              <div className="mb-12">{t('no_tokens_desc')}</div>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setMode('community')}><i className="fa fa-compass" /> {t('discover')}</button>
            </div>
          )}
        </div>
      )}

      {mode === 'community' && (
        <div className="stack">
          <div className="alert alert-info"><i className="fa fa-info-circle" /><span>{t('trust_src')} {t('trust_note')}</span></div>
          {Object.entries(gateways).map(([name, gateway]) => (
            <div className="card" key={name}>
              <div className="card-header">
                <div className="asset-logo"><img src={gateway.logo || 'img/unknown.png'} alt="" /></div>
                <div>
                  <div className="card-title">{gateway.name}</div>
                  <div className="card-sub"><a onClick={() => openExternal(gateway.website)}>{gateway.website}</a></div>
                </div>
              </div>
              <div className="list">
                {gateway.assets.filter(a => a.list || showAll).map(asset => (
                  <div className="list-item" key={assetKey(asset.code, asset.issuer)}>
                    <div className="grow"><AssetCell code={asset.code} logo={asset.logo || gateway.logo} name={asset.name || gateway.name} issuer={asset.issuer} /></div>
                    {trustButtons(asset.code, asset.issuer)}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {Object.keys(gateways).length === 0 ? (
            <div className="empty card">
              <div className="empty-icon"><i className="fa fa-compass" /></div>
              <div className="empty-title">{t('no_gateways')}</div>
              <div>{t('no_gateways_desc')}</div>
            </div>
          ) : (
            <div className="text-center">
              <button type="button" className="btn btn-ghost" onClick={() => setShowAll(s => !s)}>
                <i className={`fa ${showAll ? 'fa-angle-double-up' : 'fa-angle-double-down'}`} /> {t(showAll ? 'show_less' : 'show_more')}
              </button>
            </div>
          )}
        </div>
      )}

      {mode === 'manual' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header"><div className="card-title">{t('manual_add')}</div></div>
            <form className="card-body stack" onSubmit={submitManual}>
              <div className="field">
                <label htmlFor="manual_issuer">{t('issuer_id')}</label>
                <input id="manual_issuer" type="text" className="input mono" maxLength={70} placeholder="r..." value={manual.issuer} required onChange={e => setManual(m => ({...m, issuer: e.target.value.trim()}))} />
                {manual.issuer && !isValidAddress(manual.issuer) && <div className="form-error">{t('issuer_invalid')}</div>}
              </div>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="manual_code">{t('asset_code')}</label>
                  <input id="manual_code" type="text" className="input" value={manual.code} placeholder="USD" onChange={e => setManual(m => ({...m, code: e.target.value.trim()}))} />
                </div>
                <div className="field">
                  <label htmlFor="manual_limit">{t('trust_limit')}</label>
                  <input id="manual_limit" type="text" className="input" autoComplete="off" value={manual.limit} placeholder="1000000000" onChange={e => setManual(m => ({...m, limit: e.target.value.trim()}))} />
                </div>
              </div>
              {manual.code && manualInfo && (
                <div className="summary-box">
                  <AssetCell code={realCode(manual.code)} logo={manualInfo.logo} name={manualInfo.name} issuer={manual.issuer} />
                </div>
              )}
              {manualStatus?.error && <div className="alert alert-error"><i className="fa fa-exclamation-circle" /><span>{t(manualStatus.error)}</span></div>}
              {manualStatus?.state === 'submitted' && <div className="alert alert-info"><i className="fa fa-clock-o" /><span>{t('submitted')}</span></div>}
              {manualStatus?.state === 'success' && <div className="alert alert-success"><i className="fa fa-check" /><span>{t('trust_granted')}</span></div>}
              <button className="btn btn-primary" type="submit" disabled={!manual.code || !isValidAddress(manual.issuer) || busy(manual.code, manual.issuer) || readOnly}>
                <i className="fa fa-plus" /> {t('trust_add')} {manual.code}
              </button>
            </form>
          </div>

          <div className="card">
            <div className="card-header"><div><div className="card-title">{t('fed_add')}</div><div className="card-sub">{t('fed_desc')}</div></div></div>
            <div className="card-body stack">
              <div className="field">
                <label htmlFor="fed_domain">{t('fed_url')}</label>
                <input id="fed_domain" type="text" className="input" maxLength={70} placeholder={`${t('example')}: example.com`} value={domain} onChange={e => setDomain(e.target.value)} />
                {lookup.error && <div className="form-error">{t(lookup.error)}</div>}
                {lookup.loading && <div className="hint"><span className="spinner" /> {t('fed_loading')} {domain}</div>}
              </div>
            </div>
            {lookup.currencies.length > 0 && (
              <div className="list">
                {lookup.currencies.map(asset => {
                  const gateway = getGateway(network, asset.code, asset.issuer);
                  return (
                    <div className="list-item" key={assetKey(asset.code, asset.issuer)}>
                      <div className="grow"><AssetCell code={realCode(asset.code)} logo={gateway.logo} name={gateway.name} website={gateway.website} issuer={asset.issuer} /></div>
                      {trustButtons(asset.code, asset.issuer, false)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

import {useCallback, useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {TxStatus} from '../components/TxStatus';
import {assetKey, currencyLabel, fmtCode, fmtDateTime, fmtFixed, fmtNum, realCode, round, short} from '../core/format';
import {defaultTradeAssets, getGateway} from '../core/gateways';
import {getTradePair, setTradePair} from '../core/settings';
import {useTx} from '../hooks/useTx';
import {balanceOf, refreshAccount, useAccount} from '../state/account';
import {useApp} from '../state/app';
import {copy} from '../state/toasts';
import {ammBid, ammCreate, ammDelete, ammDeposit, ammDepositSingle, ammVote, ammWithdraw, getAmm, type AmmInfo} from '../xrpl/api';
import type {Value} from '../xrpl/amounts';

interface PoolAsset {
  key: string;
  code: string;
  issuer: string | null;
  label: string;
}

/** Rounds a ratio for display: fewer decimals for larger numbers. */
function ratio(n: number): number {
  if (n > 100) return parseFloat(n.toFixed(2));
  if (n > 10) return parseFloat(n.toFixed(3));
  return parseFloat(n.toFixed(6));
}

/** Parses rippled's "2026-Sep-30 12:00:00.000000000 UTC" auction slot expiration. */
function slotExpiry(expiration: string | undefined): number | null {
  if (!expiration) return null;
  const parsed = Date.parse(String(expiration).replace(/\.\d+ UTC$/, ' UTC').replace(/(\d{4})-(\w{3})-(\d{2})/, '$2 $3 $1'));
  return isNaN(parsed) ? null : parsed;
}

export function Amm() {
  const {t} = useTranslation();
  const network = useApp(s => s.network);
  const nativeCode = network.coin.code;
  const {readOnly, lines, balances} = useAccount();
  const [initialPair] = useState(getTradePair);

  const assets = useMemo(() => {
    const list: PoolAsset[] = [{key: nativeCode, code: nativeCode, issuer: null, label: nativeCode}];
    const add = (code: string, issuer: string) => {
      const c = realCode(code);
      const key = assetKey(c, issuer);
      if (list.some(a => a.key === key)) return;
      const gateway = getGateway(network, c, issuer);
      list.push({key, code: c, issuer, label: `${fmtCode(c)} · ${gateway.name || short(issuer, 8, 0)}`});
    };
    lines.forEach(l => { if (!l.currency.startsWith('03')) add(l.currency, l.issuer); });
    defaultTradeAssets(network).forEach(a => add(a.code, a.issuer));
    if (initialPair.base_issuer) add(initialPair.base_code, initialPair.base_issuer);
    if (initialPair.counter_issuer) add(initialPair.counter_code, initialPair.counter_issuer);
    return list;
  }, [lines, network, nativeCode, initialPair]);

  const [pair, setPair] = useState(() => ({
    a: initialPair.base_issuer ? assetKey(realCode(initialPair.base_code), initialPair.base_issuer) : nativeCode,
    b: initialPair.counter_issuer ? assetKey(realCode(initialPair.counter_code), initialPair.counter_issuer) : nativeCode
  }));
  const asset = useCallback((key: string) => assets.find(a => a.key === key) || {key: nativeCode, code: nativeCode, issuer: null, label: nativeCode}, [assets, nativeCode]);
  const ledger = (a: PoolAsset) => ({currency: a.code === nativeCode ? 'XRP' : a.code, issuer: a.issuer || undefined});
  const sameAsset = pair.a === pair.b;

  const [amm, setAmm] = useState<AmmInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (sameAsset) {
      setAmm(null);
      return;
    }
    setLoading(true);
    const data = await getAmm(ledger(asset(pair.a)), ledger(asset(pair.b)));
    setAmm(data);
    setLoading(false);
    setLoaded(true);
  }, [pair, sameAsset, asset]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tx = useTx(() => {
    void refresh();
    void refreshAccount();
  });

  const changePair = (next: {a: string; b: string}) => {
    setPair(next);
    const a = asset(next.a), b = asset(next.b);
    setTradePair({base_code: a.code, base_issuer: a.issuer || '', counter_code: b.code, counter_issuer: b.issuer || ''});
  };

  const [tab, setTab] = useState<'deposit' | 'withdraw' | 'vote' | 'bid'>('deposit');
  const [dep, setDep] = useState({mode: 'two' as 'two' | 'single', amt1: '', amt2: '', single: 'a' as 'a' | 'b', singleAmt: ''});
  const [wd, setWd] = useState({lp: '', all: false});
  const [voteFee, setVoteFee] = useState('');
  const [bid, setBid] = useState({min: '', max: '', accounts: ''});
  const [create, setCreate] = useState({amt1: '', amt2: '', fee: '0.5'});

  const code = (v: {currency: string}) => currencyLabel(v.currency, nativeCode);
  const have = (v: {currency: string; issuer?: string}) => balanceOf(balances, v.currency === 'XRP' ? nativeCode : v.currency, v.issuer, nativeCode);

  const rate = amm ? ratio(Number(amm.amount.value) / Number(amm.amount2.value)) : 0;
  const rate2 = amm ? ratio(Number(amm.amount2.value) / Number(amm.amount.value)) : 0;
  const holdLp = amm ? balanceOf(balances, amm.lp_token.currency, amm.lp_token.issuer, nativeCode) : 0;
  const share = amm && Number(amm.lp_token.value) > 0 ? holdLp / Number(amm.lp_token.value) : 0;
  const votes = amm ? [...(amm.vote_slots || [])].sort((x, y) => y.vote_weight - x.vote_weight) : [];

  const setDepAmount = (which: 'a' | 'b', value: string) => {
    if (which === 'a') setDep(d => ({...d, amt1: value, amt2: amm ? String(round(Number(value) * rate2, 8)) : d.amt2}));
    else setDep(d => ({...d, amt2: value, amt1: amm ? String(round(Number(value) * rate, 8)) : d.amt1}));
  };

  const deposit = async () => {
    if (!amm) return;
    if (dep.mode === 'two') {
      const hash = await tx.run('deposit', () => ammDeposit({...amm.amount, value: dep.amt1}, {...amm.amount2, value: dep.amt2}));
      if (hash) setDep(d => ({...d, amt1: '', amt2: ''}));
    } else {
      const source = dep.single === 'a' ? amm.amount : amm.amount2;
      const hash = await tx.run('deposit', () => ammDepositSingle(amm.amount, amm.amount2, {...source, value: dep.singleAmt}));
      if (hash) setDep(d => ({...d, singleAmt: ''}));
    }
  };

  const withdraw = async () => {
    if (!amm) return;
    const lp: Value = {...amm.lp_token, value: wd.lp};
    const hash = await tx.run('withdraw', () => ammWithdraw(amm.amount, amm.amount2, lp, wd.all));
    if (hash) setWd({lp: '', all: false});
  };

  const setPct = (pct: number) => setWd({all: pct === 1, lp: String(round(holdLp * pct, 8))});

  const expiry = slotExpiry(amm?.auction_slot?.expiration);
  const aAsset = asset(pair.a), bAsset = asset(pair.b);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t('amm_pools')}</h1>
          <div className="page-sub">{t('amm_sub')}</div>
        </div>
      </div>

      <div className="card mb-16">
        <div className="card-body cluster-lg">
          <div className="field grow mb-0">
            <label htmlFor="amm_a">{t('asset_1')}</label>
            <select id="amm_a" className="input" value={pair.a} onChange={e => changePair({...pair, a: e.target.value})}>
              {assets.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          </div>
          <button type="button" className="icon-btn pair-flip" onClick={() => changePair({a: pair.b, b: pair.a})}><i className="fa fa-exchange" /></button>
          <div className="field grow mb-0">
            <label htmlFor="amm_b">{t('asset_2')}</label>
            <select id="amm_b" className="input" value={pair.b} onChange={e => changePair({...pair, b: e.target.value})}>
              {assets.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          </div>
          <button type="button" className="btn btn-secondary pair-flip" onClick={() => void refresh()} disabled={loading}>
            <i className={`fa fa-refresh ${loading ? 'fa-spin' : ''}`} /> {t('refresh')}
          </button>
        </div>
      </div>

      {sameAsset && <div className="alert alert-warning mb-16"><i className="fa fa-exclamation-triangle" /><span>{t('amm_same_asset')}</span></div>}
      {loading && !amm && <div className="loading-row"><span className="spinner" /> {t('loading')}</div>}

      {amm && (
        <div className="grid-main">
          <div className="stack">
            <div className="grid-2">
              <div className="card stat">
                <div className="stat-label">{code(amm.amount)} {t('in_pool')}</div>
                <div className="stat-value">{fmtNum(amm.amount.value)}</div>
                <div className="stat-hint">1 {code(amm.amount)} = {rate2} {code(amm.amount2)}</div>
              </div>
              <div className="card stat">
                <div className="stat-label">{code(amm.amount2)} {t('in_pool')}</div>
                <div className="stat-value">{fmtNum(amm.amount2.value)}</div>
                <div className="stat-hint">1 {code(amm.amount2)} = {rate} {code(amm.amount)}</div>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><div className="card-title">{t('lp_info')}</div></div>
              <div className="card-body">
                <dl className="kv">
                  <dt>{t('trade_fee')}</dt><dd className="fw-600">{amm.trading_fee / 1000}%</dd>
                  <dt>{t('total_supply')}</dt><dd className="num">{fmtNum(amm.lp_token.value)}</dd>
                  <dt>{t('amm_account')}</dt><dd className="mono">{amm.account} <a className="icon-btn sm" onClick={() => copy(amm.account)}><i className="fa fa-clone" /></a></dd>
                  <dt>{t('you_hold')}</dt><dd className="num">{fmtNum(holdLp)} <span className="badge badge-accent">{fmtFixed(share * 100, 4)}%</span></dd>
                  <dt>{t('your_share')}</dt>
                  <dd className="num">{fmtNum(share * Number(amm.amount.value))} {code(amm.amount)} + {fmtNum(share * Number(amm.amount2.value))} {code(amm.amount2)}</dd>
                </dl>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><div><div className="card-title">{t('auction_slot')}</div><div className="card-sub">{t('auction_slot_desc')}</div></div></div>
              <div className="card-body">
                {amm.auction_slot?.account ? (
                  <dl className="kv">
                    <dt>{t('holder')}</dt><dd className="mono">{amm.auction_slot.account}</dd>
                    <dt>{t('discounted_fee')}</dt><dd>{amm.auction_slot.discounted_fee / 1000}%</dd>
                    <dt>{t('price')}</dt><dd>{fmtNum(amm.auction_slot.price.value)} LP</dd>
                    <dt>{t('expires')}</dt><dd>{expiry ? fmtDateTime(expiry) : amm.auction_slot.expiration}</dd>
                  </dl>
                ) : <div className="text-muted">{t('auction_slot_empty')}</div>}
              </div>
            </div>

            <div className="card">
              <div className="card-header"><div className="card-title">{t('fee_votes')}</div></div>
              {votes.length ? (
                <table className="table table-compact">
                  <thead><tr><th>{t('account')}</th><th className="text-right">{t('trade_fee')}</th><th className="text-right">{t('vote_weight')}</th></tr></thead>
                  <tbody>
                    {votes.map(v => (
                      <tr key={v.account}>
                        <td className="mono text-sm">{short(v.account, 10, 6)}</td>
                        <td className="text-right">{fmtFixed(v.trading_fee / 1000, 3)}%</td>
                        <td className="text-right text-muted">{fmtFixed(v.vote_weight / 1000, 2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="empty"><div>{t('no_votes')}</div></div>}
            </div>
          </div>

          <div className="card">
            <div className="card-body stack">
              <div className="tabs block">
                {(['deposit', 'withdraw', 'vote', 'bid'] as const).map(name => (
                  <span key={name} className={`tab ${tab === name ? 'active' : ''}`} onClick={() => setTab(name)}>
                    {t({deposit: 'deposit_lp', withdraw: 'withdraw_lp', vote: 'vote_lp', bid: 'bid'}[name])}
                  </span>
                ))}
              </div>

              {tab === 'deposit' && (
                <div className="stack">
                  <div className="tabs">
                    <span className={`tab ${dep.mode === 'two' ? 'active' : ''}`} onClick={() => setDep(d => ({...d, mode: 'two'}))}>{t('both_assets')}</span>
                    <span className={`tab ${dep.mode === 'single' ? 'active' : ''}`} onClick={() => setDep(d => ({...d, mode: 'single'}))}>{t('single_asset')}</span>
                  </div>
                  {dep.mode === 'two' ? (
                    <div className="stack">
                      {([['a', amm.amount, dep.amt1], ['b', amm.amount2, dep.amt2]] as const).map(([which, pool, value]) => (
                        <div className="field" key={which}>
                          <div className="label-row"><label>{code(pool)}</label><span className="label-aside">{t('you_have')} {fmtNum(have(pool))}</span></div>
                          <div className="input-group"><input type="text" className="input" value={value} placeholder="0.00" onChange={e => setDepAmount(which, e.target.value)} /><div className="addon">{code(pool)}</div></div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="stack">
                      <div className="field">
                        <label>{t('asset')}</label>
                        <select className="input" value={dep.single} onChange={e => setDep(d => ({...d, single: e.target.value as 'a' | 'b'}))}>
                          <option value="a">{code(amm.amount)}</option>
                          <option value="b">{code(amm.amount2)}</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>{t('amount')}</label>
                        <input type="text" className="input" value={dep.singleAmt} placeholder="0.00" onChange={e => setDep(d => ({...d, singleAmt: e.target.value}))} />
                        <div className="hint">{t('single_asset_hint')}</div>
                      </div>
                    </div>
                  )}
                  <TxStatus state={tx.status.deposit} />
                  <button type="button" className="btn btn-primary btn-block" onClick={() => void deposit()}
                    disabled={tx.busy('deposit') || readOnly || (dep.mode === 'two' ? !(Number(dep.amt1) > 0 && Number(dep.amt2) > 0) : !(Number(dep.singleAmt) > 0))}>
                    <i className="fa fa-plus" /> {t('deposit_lp')}
                  </button>
                </div>
              )}

              {tab === 'withdraw' && (
                <div className="stack">
                  <div className="field">
                    <div className="label-row"><label>{t('lp_tokens')}</label><span className="label-aside">{t('you_have')} {fmtNum(holdLp)}</span></div>
                    <input type="text" className="input" value={wd.lp} placeholder="0.00" onChange={e => setWd({lp: e.target.value, all: false})} />
                    <div className="pct-row">
                      {[0.25, 0.5, 0.75].map(p => <span key={p} className="chip" onClick={() => setPct(p)}>{p * 100}%</span>)}
                      <span className={`chip ${wd.all ? 'active' : ''}`} onClick={() => setPct(1)}>{t('max')}</span>
                    </div>
                  </div>
                  {Number(wd.lp) > 0 && (
                    <div className="summary-box">
                      <div className="summary-row">
                        <span className="k">{t('you_receive_approx')}</span>
                        <span className="v">
                          {fmtNum(Number(wd.lp) / Number(amm.lp_token.value) * Number(amm.amount.value))} {code(amm.amount)} + {fmtNum(Number(wd.lp) / Number(amm.lp_token.value) * Number(amm.amount2.value))} {code(amm.amount2)}
                        </span>
                      </div>
                    </div>
                  )}
                  <TxStatus state={tx.status.withdraw} />
                  <button type="button" className="btn btn-primary btn-block" onClick={() => void withdraw()} disabled={tx.busy('withdraw') || readOnly || !(Number(wd.lp) > 0)}>
                    <i className="fa fa-minus" /> {t('withdraw_lp')}
                  </button>
                </div>
              )}

              {tab === 'vote' && (
                <div className="stack">
                  <div className="field">
                    <label>{t('trade_fee')}</label>
                    <div className="input-group"><input type="text" className="input" value={voteFee} placeholder="0.5" onChange={e => setVoteFee(e.target.value)} /><div className="addon">%</div></div>
                    <div className="hint">{t('vote_notice')}</div>
                  </div>
                  <div className="hint">{t('vote_weight_hint')}</div>
                  <TxStatus state={tx.status.vote} />
                  <button type="button" className="btn btn-primary btn-block" onClick={() => void tx.run('vote', () => ammVote(amm.amount, amm.amount2, round(Number(voteFee) * 1000)))}
                    disabled={tx.busy('vote') || readOnly || voteFee === '' || isNaN(Number(voteFee)) || Number(voteFee) < 0 || Number(voteFee) > 1}>
                    <i className="fa fa-check-square-o" /> {t('vote_lp')}
                  </button>
                </div>
              )}

              {tab === 'bid' && (
                <div className="stack">
                  <div className="grid-2">
                    <div className="field"><label>{t('bid_min')}</label><input type="text" className="input" value={bid.min} placeholder={t('optional')} onChange={e => setBid(b => ({...b, min: e.target.value}))} /></div>
                    <div className="field"><label>{t('bid_max')}</label><input type="text" className="input" value={bid.max} placeholder={t('optional')} onChange={e => setBid(b => ({...b, max: e.target.value}))} /></div>
                  </div>
                  <div className="field">
                    <label>{t('auth_accounts')}</label>
                    <input type="text" className="input mono" value={bid.accounts} placeholder="r..., r..." onChange={e => setBid(b => ({...b, accounts: e.target.value}))} />
                    <div className="hint">{t('auth_accounts_hint')}</div>
                  </div>
                  <TxStatus state={tx.status.bid} />
                  <button type="button" className="btn btn-primary btn-block" disabled={tx.busy('bid') || readOnly}
                    onClick={() => void tx.run('bid', () => ammBid(amm.amount, amm.amount2, amm.lp_token, bid.min, bid.max, bid.accounts.split(/[\s,]+/).filter(Boolean)))}>
                    <i className="fa fa-gavel" /> {t('bid')}
                  </button>
                </div>
              )}

              {Number(amm.lp_token.value) === 0 && (
                <div className="stack-sm">
                  <div className="alert alert-warning"><i className="fa fa-info-circle" /><span>{t('amm_empty')}</span></div>
                  <TxStatus state={tx.status.delete} />
                  <button type="button" className="btn btn-danger-soft" onClick={() => void tx.run('delete', () => ammDelete(amm.amount, amm.amount2))} disabled={tx.busy('delete') || readOnly}>{t('delete_pool')}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {loaded && !amm && !loading && !sameAsset && (
        <div className="grid-main">
          <div className="card">
            <div className="card-header"><div><div className="card-title">{t('create_pool')}</div><div className="card-sub">{t('no_pool_desc')}</div></div></div>
            <div className="card-body stack">
              <div className="grid-2">
                {([['amt1', aAsset], ['amt2', bAsset]] as const).map(([field, a]) => (
                  <div className="field" key={field}>
                    <label>{fmtCode(a.code)}</label>
                    <input type="text" className="input" value={create[field]} placeholder="0.00" onChange={e => setCreate(c => ({...c, [field]: e.target.value}))} />
                    <div className="hint">{t('you_have')} {fmtNum(balanceOf(balances, a.code, a.issuer, nativeCode))}</div>
                  </div>
                ))}
              </div>
              <div className="field">
                <label>{t('trade_fee')}</label>
                <div className="input-group"><input type="text" className="input" value={create.fee} onChange={e => setCreate(c => ({...c, fee: e.target.value}))} /><div className="addon">%</div></div>
                <div className="hint">{t('vote_notice')}</div>
              </div>
              {Number(create.amt1) > 0 && Number(create.amt2) > 0 && (
                <div className="summary-box">
                  <div className="summary-row"><span className="k">{t('starting_price')}</span><span className="v">1 {fmtCode(aAsset.code)} = {fmtNum(Number(create.amt2) / Number(create.amt1))} {fmtCode(bAsset.code)}</span></div>
                </div>
              )}
              <div className="alert alert-warning"><i className="fa fa-info-circle" /><span>{t('create_pool_fee')}</span></div>
              <TxStatus state={tx.status.create} />
              <button type="button" className="btn btn-primary btn-block"
                disabled={tx.busy('create') || readOnly || !(Number(create.amt1) > 0 && Number(create.amt2) > 0) || Number(create.fee) < 0 || Number(create.fee) > 1}
                onClick={() => void tx.run('create', () => ammCreate({...ledger(aAsset), value: create.amt1}, {...ledger(bAsset), value: create.amt2}, create.fee))}>
                <i className="fa fa-plus" /> {t('create_pool')}
              </button>
            </div>
          </div>
          <div className="card card-muted">
            <div className="card-body stack-sm text-sm text-muted">
              <div className="fw-600 text-lg text-strong"><i className="fa fa-lightbulb-o text-warning" /> {t('how_amm_works')}</div>
              <p>{t('how_amm_1')}</p>
              <p>{t('how_amm_2')}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

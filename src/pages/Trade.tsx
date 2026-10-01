import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate} from 'react-router';
import {useTranslation} from 'react-i18next';
import BigNumber from 'bignumber.js';
import {AssetCell} from '../components/AssetCell';
import {assetKey, fmtCode, fmtFixed, fmtNum, realCode, round} from '../core/format';
import {on} from '../core/events';
import {defaultTradeAssets, getGateway} from '../core/gateways';
import {getTradePair, setTradePair} from '../core/settings';
import {useTx} from '../hooks/useTx';
import {balanceOf, useAccount} from '../state/account';
import {useApp} from '../state/app';
import {cancelOffer, getAmm, getOffers, isNotFound, offer, type Offer} from '../xrpl/api';
import type {Value} from '../xrpl/amounts';
import {getBook, type BookOrder} from '../xrpl/orderbook';

interface Asset {
  code: string;
  issuer: string | null;
}

interface Side {
  price: string;
  amount: string;
  volume: string;
}

const EMPTY_SIDE: Side = {price: '', amount: '', volume: ''};
const REFRESH_SECONDS = 30;

function precision(base: string, counter: string): {size: number; price: number} {
  const baseCode = fmtCode(base);
  const counterCode = fmtCode(counter);
  const size = ['BTC', 'ETH'].includes(baseCode) ? 4 : 2;
  let price = 4;
  if (['USD', 'CNY', 'XRP', 'XLM', 'USDT'].includes(counterCode)) {
    if (['BTC', 'ETH'].includes(baseCode)) price = 0;
    if (baseCode === 'XRPS') price = 6;
    if (baseCode === 'XAG') price = 7;
  } else if (['BTC', 'ETH'].includes(counterCode)) {
    price = 6;
  }
  return {size, price};
}

/** Running depth, dust removed, top 20 per side. */
function processBook(asks: BookOrder[], bids: BookOrder[]) {
  const withDepth = (orders: BookOrder[]) => {
    let depth = 0;
    return orders
      .map(o => ({...o, depth: (depth += o.amount)}))
      .filter(o => new BigNumber(o.amount).isGreaterThan('0.001') || new BigNumber(o.volume).isGreaterThan('0.001'))
      .slice(0, 20);
  };
  const a = withDepth(asks);
  const b = withDepth(bids);
  const maxDepth = Math.max(a.length ? a[a.length - 1].depth : 0, b.length ? b[b.length - 1].depth : 0) || 1;
  return {asks: a, bids: b, maxDepth};
}

export function Trade() {
  const {t} = useTranslation();
  const navigate = useNavigate();
  const network = useApp(s => s.network);
  const native = network.coin;
  const {address, readOnly, lines, balances} = useAccount();

  const [base, setBase] = useState<Asset>(() => {
    const pair = getTradePair();
    return pair.base_issuer ? {code: realCode(pair.base_code), issuer: pair.base_issuer} : {code: native.code, issuer: null};
  });
  const [counter, setCounter] = useState<Asset>(() => {
    const pair = getTradePair();
    return pair.counter_issuer ? {code: realCode(pair.counter_code), issuer: pair.counter_issuer} : {code: native.code, issuer: null};
  });
  const [showPair, setShowPair] = useState(false);
  const [book, setBook] = useState<ReturnType<typeof processBook>>({asks: [], bids: [], maxDepth: 1});
  const [refreshingBook, setRefreshingBook] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const [ammExists, setAmmExists] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [refreshingOffers, setRefreshingOffers] = useState(false);
  const [showAllOffers, setShowAllOffers] = useState(false);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [forms, setForms] = useState<{buy: Side; sell: Side}>({buy: EMPTY_SIDE, sell: EMPTY_SIDE});
  const [fatFinger, setFatFinger] = useState<{buy: boolean; sell: boolean}>({buy: false, sell: false});
  const pairRef = useRef({base, counter});
  pairRef.current = {base, counter};

  const isNativeCode = useCallback((code: string) => code === native.code || code === 'XRP', [native.code]);
  const ledgerAsset = useCallback((a: Asset) => (isNativeCode(a.code) ? {currency: 'XRP'} : {currency: a.code, issuer: a.issuer!}), [isNativeCode]);
  const same = useCallback((v: {currency: string; issuer?: string} | Asset, a: Asset) => {
    const code = 'currency' in v ? v.currency : v.code;
    const issuer = v.issuer ?? null;
    if (isNativeCode(code) || isNativeCode(a.code)) return isNativeCode(code) && isNativeCode(a.code);
    return code === a.code && issuer === a.issuer;
  }, [isNativeCode]);
  const {size: sizeDigits, price: priceDigits} = precision(base.code, counter.code);

  const refreshBook = useCallback(async () => {
    const {base: b, counter: c} = pairRef.current;
    setRefreshingBook(true);
    setCountdown(REFRESH_SECONDS);
    const data = await getBook(ledgerAsset(b), ledgerAsset(c));
    if (pairRef.current.base === b && pairRef.current.counter === c) setBook(processBook(data.asks, data.bids));
    setRefreshingBook(false);
  }, [ledgerAsset]);

  const refreshAmm = useCallback(async () => {
    const {base: b, counter: c} = pairRef.current;
    const amm = await getAmm(ledgerAsset(b), ledgerAsset(c));
    if (pairRef.current.base === b && pairRef.current.counter === c) setAmmExists(!!amm);
  }, [ledgerAsset]);

  const refreshOffers = useCallback(async () => {
    setRefreshingOffers(true);
    try {
      setOffers(await getOffers());
    } catch (err) {
      // An unfunded account simply has no offers.
      if (!isNotFound(err)) console.warn('Offers failed', err);
      setOffers([]);
    } finally {
      setRefreshingOffers(false);
    }
  }, []);

  const refreshAll = useCallback(() => {
    void refreshBook();
    void refreshOffers();
  }, [refreshBook, refreshOffers]);

  const tx = useTx(() => refreshAll());

  useEffect(() => {
    if (showPair) return;
    setBook({asks: [], bids: [], maxDepth: 1});
    void refreshBook();
    void refreshAmm();
    void refreshOffers();
    setTradePair({base_code: base.code, base_issuer: base.issuer || '', counter_code: counter.code, counter_issuer: counter.issuer || ''});
  }, [base, counter, showPair, refreshBook, refreshAmm, refreshOffers]);

  // Own offers change when they fill.
  useEffect(() => on('accountTx', refreshAll), [refreshAll]);

  useEffect(() => {
    const timer = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (countdown > 0) return;
    void refreshBook();
    void refreshAmm();
  }, [countdown, refreshBook, refreshAmm]);

  const tradeAssets = useMemo(() => {
    const list: Record<string, Asset> = {};
    for (const line of lines) {
      if (!line.currency.startsWith('03')) list[assetKey(line.currency, line.issuer)] = {code: line.currency, issuer: line.issuer};
    }
    for (const a of defaultTradeAssets(network)) list[assetKey(a.code, a.issuer)] = {code: realCode(a.code), issuer: a.issuer};
    return Object.values(list);
  }, [lines, network]);

  const pairOffers = offers.filter(o => same(o.quantity, base) && same(o.total, counter));
  const shownOffers = showAllOffers ? offers : [...pairOffers.filter(o => o.type === 'buy'), ...pairOffers.filter(o => o.type === 'sell')];

  const bestAsk = book.asks.length ? book.asks[0].price : null;
  const bestBid = book.bids.length ? book.bids[0].price : null;

  const update = (which: 'buy' | 'sell', field: keyof Side, value: string) => {
    setForms(f => {
      const next = {...f[which], [field]: value};
      const price = Number(next.price), amount = Number(next.amount), volume = Number(next.volume);
      if (field === 'volume') next.amount = price ? String(round(volume / price, 8)) : next.amount;
      else next.volume = String(round(price * amount, 8));
      return {...f, [which]: next};
    });
  };

  const pickPrice = (src: 'bid' | 'ask', price: number) => {
    const which = src === 'bid' ? 'sell' : 'buy';
    setSide(which);
    update(which, 'price', String(price));
  };

  const place = async (which: 'buy' | 'sell') => {
    setFatFinger(f => ({...f, [which]: false}));
    const form = forms[which];
    const hash = await tx.run(which, () => offer({
      type: which, amount: form.amount, price: form.price,
      base: isNativeCode(base.code) ? 'XRP' : base.code, base_issuer: base.issuer || undefined,
      counter: isNativeCode(counter.code) ? 'XRP' : counter.code, counter_issuer: counter.issuer || undefined
    }));
    if (hash) {
      setForms(f => ({...f, [which]: EMPTY_SIDE}));
      refreshAll();
    }
  };

  const placeWithCheck = (which: 'buy' | 'sell') => {
    const price = Number(forms[which].price);
    const far = which === 'buy' ? bestAsk !== null && price > bestAsk * 1.2 : bestBid !== null && price < bestBid * 0.8;
    if (far) setFatFinger(f => ({...f, [which]: true}));
    else void place(which);
  };

  // An offer is being cancelled while its cancel transaction is working or pending.
  const cancelState = (seq: number) => tx.status[`cancel${seq}`];
  const isCancelling = (seq: number) => !!cancelState(seq) && (cancelState(seq).working || cancelState(seq).state === 'submitted' || cancelState(seq).state === 'success');
  const cancelError = Object.entries(tx.status).find(([name, s]) => name.startsWith('cancel') && (s.state === 'error' || s.state === 'fail'))?.[1].error;
  const cancel = (seq: number) => void tx.run(`cancel${seq}`, () => cancelOffer(seq));

  const flip = () => {
    setBase(counter);
    setCounter(base);
  };

  const baseGateway = getGateway(network, base.code, base.issuer || undefined);
  const counterGateway = getGateway(network, counter.code, counter.issuer || undefined);
  const label = (v: Value) => fmtCode(isNativeCode(v.currency) ? native.code : v.currency);

  const pickRow = (asset: Asset, logo: string, name?: string, website?: string) => (
    <div className="list-item" key={assetKey(asset.code, asset.issuer || undefined)}>
      <div className="grow"><AssetCell code={asset.code} logo={logo} name={name} website={website} issuer={asset.issuer || undefined} /></div>
      <div className="cluster">
        <button type="button" className={`btn btn-sm ${same(asset, base) ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setBase(asset)} disabled={same(asset, base)}>{t('as_base')}</button>
        <button type="button" className={`btn btn-sm ${same(asset, counter) ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setCounter(asset)} disabled={same(asset, counter)}>{t('as_counter')}</button>
      </div>
    </div>
  );

  const bookSide = (orders: typeof book.asks, kind: 'bid' | 'ask') => (
    <div className="book-side">
      <div className="book-head">
        <span>{t(kind === 'bid' ? 'bid_price' : 'ask_price')} <em>{fmtCode(counter.code)}</em></span>
        <span>{t('size')} <em>{fmtCode(base.code)}</em></span>
        <span>{t('sum')}</span>
      </div>
      {orders.map((item, i) => (
        <div key={i} className={`book-row ${kind} ${item.account === address ? 'mine' : ''}`} title={item.account} onClick={() => pickPrice(kind, item.price)}>
          <i className="depth" style={{width: `${(item.depth / book.maxDepth) * 100}%`}} />
          <span className="price">{fmtFixed(item.price, priceDigits)}</span>
          <span>{fmtFixed(item.amount, sizeDigits)}</span>
          <span>{fmtFixed(item.depth, sizeDigits)}</span>
        </div>
      ))}
      {!orders.length && <div className="book-empty">{t(kind === 'bid' ? 'no_bids' : 'no_asks')}</div>}
    </div>
  );

  const orderForm = (which: 'buy' | 'sell') => {
    const form = forms[which];
    const st = tx.status[which];
    const have = which === 'buy' ? balanceOf(balances, counter.code, counter.issuer, native.code) : balanceOf(balances, base.code, base.issuer, native.code);
    const haveCode = which === 'buy' ? counter.code : base.code;
    return (
      <div className="stack">
        <div className="field">
          <label>{t('price_of_each')}</label>
          <div className="input-group"><input type="text" className="input" value={form.price} placeholder="0.00" onChange={e => update(which, 'price', e.target.value)} /><div className="addon">{fmtCode(counter.code)}</div></div>
        </div>
        <div className="field">
          <label>{t('order_amount')}</label>
          <div className="input-group"><input type="text" className="input" value={form.amount} placeholder="0.00" onChange={e => update(which, 'amount', e.target.value)} /><div className="addon">{fmtCode(base.code)}</div></div>
        </div>
        <div className="field">
          <label>{t('order_value')}</label>
          <div className="input-group"><input type="text" className="input" value={form.volume} placeholder="0.00" onChange={e => update(which, 'volume', e.target.value)} /><div className="addon">{fmtCode(counter.code)}</div></div>
        </div>
        <div className="between text-sm"><span className="text-faint">{t('you_have')}</span><span className="num fw-600">{fmtNum(have)} {fmtCode(haveCode)}</span></div>
        {st?.state === 'submitted' && <div className="alert alert-info"><i className="fa fa-clock-o" /><span>{t('submitted')}</span></div>}
        {st?.state === 'success' && <div className="alert alert-success"><i className="fa fa-check" /><span>{t('offer_success')}</span></div>}
        {(st?.state === 'error' || st?.state === 'fail') && <div className="alert alert-error"><i className="fa fa-exclamation-circle" /><span>{t(st.error || '')}</span></div>}
        {!fatFinger[which] ? (
          <button type="button" className={`btn ${which === 'buy' ? 'btn-success' : 'btn-danger'} btn-lg btn-block`} onClick={() => placeWithCheck(which)}
            disabled={tx.busy(which) || readOnly || !(Number(form.amount) > 0) || !(Number(form.price) > 0)}>
            <i className={`fa ${tx.busy(which) ? 'fa-spinner fa-pulse' : which === 'buy' ? 'fa-arrow-down' : 'fa-arrow-up'}`} /> {t(which)} {fmtCode(base.code)}
          </button>
        ) : (
          <div className="stack-sm">
            <div className="alert alert-warning"><i className="fa fa-exclamation-triangle" /><span>{t('fatfinger')}</span></div>
            <div className="grid-2">
              <button type="button" className="btn btn-secondary" onClick={() => setFatFinger(f => ({...f, [which]: false}))}>{t('cancel')}</button>
              <button type="button" className="btn btn-warning" onClick={() => void place(which)}>{t(which)} {fmtCode(base.code)}</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="card pair-bar mb-16">
        <div className="pair-assets">
          <div className="asset">
            <div className="asset-logo lg"><img src={baseGateway.logo} alt="" /></div>
            <div className="asset-text">
              <div className="asset-code text-lg">{fmtCode(base.code)} <span className="asset-name">{baseGateway.name}</span></div>
              {base.issuer && <div className="asset-issuer">{base.issuer}</div>}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={flip} title={t('flip_pair')}><i className="fa fa-exchange" /></button>
          <div className="asset">
            <div className="asset-logo lg"><img src={counterGateway.logo} alt="" /></div>
            <div className="asset-text">
              <div className="asset-code text-lg">{fmtCode(counter.code)} <span className="asset-name">{counterGateway.name}</span></div>
              {counter.issuer && <div className="asset-issuer">{counter.issuer}</div>}
            </div>
          </div>
        </div>
        <div className="pair-stats">
          <div><div className="stat-label">{t('best_bid')}</div><div className="fw-700 text-success num">{bestBid !== null ? fmtFixed(bestBid, priceDigits) : '—'}</div></div>
          <div><div className="stat-label">{t('best_ask')}</div><div className="fw-700 text-danger num">{bestAsk !== null ? fmtFixed(bestAsk, priceDigits) : '—'}</div></div>
          <div><div className="stat-label">{t('spread')}</div><div className="fw-700 num">{bestAsk !== null && bestBid !== null ? fmtFixed(bestAsk - bestBid, priceDigits) : '—'}</div></div>
        </div>
        <div className="cluster">
          {ammExists && network.tabs.includes('amm') && <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/amm')}><i className="fa fa-tint" /> {t('amm_pool')}</button>}
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowPair(s => !s)}>
            <i className={`fa ${showPair ? 'fa-check' : 'fa-sliders'}`} /> {t(showPair ? 'done' : 'change_pair')}
          </button>
        </div>
      </div>

      {showPair ? (
        <div className="card mb-16">
          <div className="card-header"><div><div className="card-title">{t('trade_pick')}</div><div className="card-sub">{t('trade_pick_sub')}</div></div></div>
          <div className="list">
            {pickRow({code: native.code, issuer: null}, native.logo)}
            {tradeAssets.map(asset => {
              const gateway = getGateway(network, asset.code, asset.issuer || undefined);
              return pickRow(asset, gateway.logo, gateway.name, gateway.website);
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="trade-grid">
            <div className="card">
              <div className="card-header">
                <div className="card-title">{t('orderbook')}</div>
                <div className="card-actions">
                  <span className="text-xs text-faint">{t('auto_refresh')} {Math.max(countdown, 0)}s</span>
                  <button type="button" className="icon-btn sm" onClick={() => void refreshBook()} disabled={refreshingBook}><i className={`fa fa-refresh ${refreshingBook ? 'fa-spin' : ''}`} /></button>
                </div>
              </div>
              <div className="book">
                {bookSide(book.bids, 'bid')}
                {bookSide(book.asks, 'ask')}
              </div>
            </div>

            <div className="card">
              <div className="card-body stack">
                <div className="tabs block">
                  <span className={`tab buy ${side === 'buy' ? 'active' : ''}`} onClick={() => setSide('buy')}>{t('buy')} {fmtCode(base.code)}</span>
                  <span className={`tab sell ${side === 'sell' ? 'active' : ''}`} onClick={() => setSide('sell')}>{t('sell')} {fmtCode(base.code)}</span>
                </div>
                {orderForm(side)}
              </div>
            </div>
          </div>

          <div className="card mt-16">
            <div className="card-header">
              <div className="card-title">{t('manager_offer')}</div>
              <div className="card-actions">
                <label className="checkbox-row text-sm"><input type="checkbox" checked={showAllOffers} onChange={e => setShowAllOffers(e.target.checked)} /> {t('show_all')}</label>
                <button type="button" className="icon-btn sm" onClick={() => void refreshOffers()} disabled={refreshingOffers}><i className={`fa fa-refresh ${refreshingOffers ? 'fa-spin' : ''}`} /></button>
              </div>
            </div>
            {cancelError && <div className="alert alert-error card-alert"><i className="fa fa-exclamation-circle" /><span>{t(cancelError)}</span></div>}
            {shownOffers.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('type')}</th>
                    <th className="text-right">{t('price')}</th>
                    <th className="text-right">{t('order_amount')}</th>
                    <th className="text-right">{t('total')}</th>
                    <th className="text-right">{t('action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shownOffers.map(item => (
                    <tr key={item.seq} className={isCancelling(item.seq) ? 'cancelling' : ''}>
                      <td><span className={`badge ${item.type === 'buy' ? 'badge-success' : 'badge-danger'}`}>{t(item.type)}</span></td>
                      <td className="text-right num">{fmtNum(item.price)} {label(item.total)}</td>
                      <td className="text-right num" title={item.quantity.issuer}>{fmtNum(item.quantity.value)} {label(item.quantity)}</td>
                      <td className="text-right num" title={item.total.issuer}>{fmtNum(item.total.value)} {label(item.total)}</td>
                      <td className="text-right">
                        {isCancelling(item.seq)
                          ? <span className="spinner" />
                          : <button type="button" className="btn btn-danger-soft btn-xs" onClick={() => cancel(item.seq)} disabled={readOnly}>{t('offer_cancel')}</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty"><div className="empty-icon"><i className="fa fa-list-alt" /></div><div>{t('no_offers')}</div></div>
            )}
          </div>
        </>
      )}
    </>
  );
}

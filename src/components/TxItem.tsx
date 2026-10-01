import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {dropsToXrp} from 'xrpl';
import {currencyLabel, fmtDateTime, fmtNum} from '../core/format';
import {openExternal} from '../platform/desktop';
import {txUrl, useApp} from '../state/app';
import {copy} from '../state/toasts';
import type {Value} from '../xrpl/amounts';
import type {Effect, TxRow} from '../xrpl/txformat';

function AmountText({amount, code}: {amount?: Value; code: string}) {
  if (!amount) return null;
  return <strong>{fmtNum(amount.value)} {currencyLabel(amount.currency, code)}</strong>;
}

function EffectLine({effect, code}: {effect: Effect; code: string}) {
  const {t} = useTranslation();
  const q = <AmountText amount={effect.quantity} code={code} />;
  const total = <AmountText amount={effect.total} code={code} />;
  const price = <>({t('price')} <strong>{fmtNum(effect.price)}</strong>)</>;
  switch (effect.type) {
    case 'offer_cancel_buy':
    case 'offer_cancel_sell': {
      const buy = effect.type === 'offer_cancel_buy';
      return (
        <span>
          {t(effect.force ? (buy ? 'order_cancel_buy' : 'order_cancel_sell') : (buy ? 'you_cancel_buy' : 'you_cancel_sell'))}{' '}
          {q} {t(buy ? 'you_buy_for' : 'you_sell_for')} {total} {price}{effect.force && t('order_cancel_due')}
        </span>
      );
    }
    case 'offer_create_buy':
      return <span>{t('you_buy')} {q} {t('you_buy_for')} {total} {price}</span>;
    case 'offer_create_sell':
      return <span>{t('you_sell')} {q} {t('you_sell_for')} {total} {price}</span>;
    case 'offer_bought':
      return <span>{t('you_bought')} {q} {t('you_bought_for')} {total} {price}{effect.filled && t('order_filled')}</span>;
    case 'offer_sold':
      return <span>{t('you_sold')} {q} {t('you_sold_for')} {total} {price}{effect.filled && t('order_filled')}</span>;
    case 'balance_change': {
      const value = Number(effect.amount!.value);
      return (
        <span>
          {t('bal_change')}{' '}
          <strong className={value > 0 ? 'text-success' : value < 0 ? 'text-danger' : ''}>
            {value > 0 ? '+' : ''}{fmtNum(effect.amount!.value)} {currencyLabel(effect.amount!.currency, code)}
          </strong>
        </span>
      );
    }
    default:
      return null;
  }
}

/** One activity row; click to expand the details. */
export function TxItem({tx}: {tx: TxRow}) {
  const {t} = useTranslation();
  const code = useApp(s => s.network.coin.code);
  const [open, setOpen] = useState(false);
  const url = txUrl(tx.hash);
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div className={`tx-item ${open ? 'open' : ''}`}>
      <div className="tx-row" onClick={() => setOpen(o => !o)}>
        <div className={`tx-icon tone-${tx.tone}`}><i className={`fa ${tx.icon}`} /></div>
        <div className="tx-main">
          <div className="tx-title">
            <span>{t(tx.title)}</span>
            {!tx.success && <span className="badge badge-danger">{tx.tx_result}</span>}
            {tx.warning && <span className="badge badge-warning"><i className="fa fa-exclamation-triangle" /> {t('possible_scam')}</span>}
          </div>
          {tx.sub && <div className="tx-sub truncate" title={tx.counterparty}>{t(tx.sub, tx.subValues)}</div>}
        </div>
        <div className="tx-amounts">
          {tx.amounts.map((a, i) => (
            <div key={i} className={`tx-amount num ${a.sign === '+' ? 'pos' : a.sign === '-' ? 'neg' : ''}`}>
              {a.sign}{fmtNum(a.value)} <span className="tx-cur">{currencyLabel(a.currency, code)}</span>
            </div>
          ))}
          <div className="tx-date">{fmtDateTime(tx.date)}</div>
        </div>
        <i className="fa fa-chevron-down tx-caret" />
      </div>
      {open && (
        <div className="tx-details">
          {tx.warning && (
            <div className="alert alert-warning mb-12">
              <i className="fa fa-exclamation-triangle" />
              <span>
                {tx.warning.kind === 'dust'
                  ? t('poison_dust')
                  : tx.warning.name ? t('poison_lookalike', {name: tx.warning.name}) : t('poison_lookalike_self')}
              </span>
            </div>
          )}
          {tx.effects.length > 0 && (
            <ul className="tx-effects">
              {tx.effects.map((effect, i) => <li key={i}><EffectLine effect={effect} code={code} /></li>)}
            </ul>
          )}
          <dl className="kv text-sm">
            <dt>{t('type')}</dt><dd>{tx.tx_type}</dd>
            {tx.counterparty && (
              <>
                <dt>{t('counterparty')}</dt>
                <dd className="mono">{tx.counterparty} <a className="icon-btn sm" onClick={stop(() => copy(tx.counterparty))}><i className="fa fa-clone" /></a></dd>
              </>
            )}
            {tx.tag !== undefined && <><dt>{t('dest_tag')}</dt><dd>{tx.tag}</dd></>}
            {tx.message && <><dt>{t('message')}</dt><dd><pre>{tx.message}</pre></dd></>}
            <dt>{t('fee')}</dt><dd>{String(dropsToXrp(tx.fee || '0'))} {code}</dd>
            <dt>{t('ledger')}</dt><dd>#{tx.ledger_index}</dd>
            <dt>{t('hash')}</dt>
            <dd className="mono">
              <span className="break">{tx.hash}</span>
              <a className="icon-btn sm" onClick={stop(() => copy(tx.hash))}><i className="fa fa-clone" /></a>
              {url && <a className="icon-btn sm" onClick={stop(() => openExternal(url))}><i className="fa fa-external-link" /></a>}
            </dd>
          </dl>
        </div>
      )}
    </div>
  );
}

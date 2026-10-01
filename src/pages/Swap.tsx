import {useEffect, useMemo, useState} from 'react';
import {useNavigate} from 'react-router';
import {useTranslation} from 'react-i18next';
import BigNumber from 'bignumber.js';
import {xrpToDrops, type Amount} from 'xrpl';
import {fmtCode, fmtNum, isDecimal, round} from '../core/format';
import {getGateway} from '../core/gateways';
import {useDebounced} from '../hooks/useDebounced';
import {useTx} from '../hooks/useTx';
import {openExternal} from '../platform/desktop';
import {useAccount} from '../state/account';
import {txUrl, useApp} from '../state/app';
import {convert} from '../xrpl/api';
import type {Value} from '../xrpl/amounts';
import {closePathFind, openPathFind, type PathAlternative} from '../xrpl/pathfind';

interface Option {
  origin: PathAlternative;
  code: string;
  issuer?: string;
  value: string;
  rate: string;
}

export function Swap() {
  const {t} = useTranslation();
  const navigate = useNavigate();
  const network = useApp(s => s.network);
  const native = network.coin;
  const {address, readOnly, lines, balance} = useAccount();
  const tx = useTx();
  const [mode, setMode] = useState<'input' | 'confirm' | 'submit'>('input');
  const [amount, setAmount] = useState('');
  const [code, setCode] = useState(native.code);
  const [options, setOptions] = useState<Record<string, Option>>({});
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [chosen, setChosen] = useState<Option | null>(null);
  const debouncedAmount = useDebounced(amount.trim());

  const codes = useMemo(() => {
    const list = [native.code];
    for (const line of lines) {
      if (!line.currency.startsWith('03') && !list.includes(line.currency)) list.push(line.currency);
    }
    return list;
  }, [lines, native.code]);

  useEffect(() => () => closePathFind(), []);
  useEffect(() => {
    if (lastUpdate === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [lastUpdate]);

  useEffect(() => {
    if (mode !== 'input' || !address) return;
    const value = Number(debouncedAmount);
    setOptions({});
    setFound(false);
    setError('');
    if (!isDecimal(debouncedAmount) || !(value > 0)) {
      setFinding(false);
      closePathFind();
      return;
    }
    const deliver: Amount = code === native.code
      ? xrpToDrops(new BigNumber(debouncedAmount).toFixed(6, BigNumber.ROUND_DOWN))
      : {currency: code, issuer: address, value: debouncedAmount};
    setFinding(true);
    void openPathFind(address, address, deliver, data => {
      setLastUpdate(Date.now());
      setFound(true);
      const next: Record<string, Option> = {};
      for (const alt of data.alternatives) {
        if (typeof alt.source_amount === 'string') {
          const xrp = Number(alt.source_amount) / 1e6;
          next[native.code] = {origin: alt, code: native.code, value: String(round(xrp, 6)), rate: String(round(xrp / value, 6))};
        } else {
          const sa = alt.source_amount as {currency: string; issuer?: string; value: string};
          next[sa.currency] = {origin: alt, code: sa.currency, issuer: sa.issuer, value: String(round(Number(sa.value), 6)), rate: String(round(Number(sa.value) / value, 6))};
        }
      }
      setOptions(next);
    }, err => {
      setError(err.message);
      setFinding(false);
      closePathFind();
    });
  }, [mode, debouncedAmount, code, address, native.code]);

  const pick = (option: Option) => {
    // Only confirm the amount the options were found for.
    if (amount.trim() !== debouncedAmount) return;
    setChosen(option);
    setFinding(false);
    closePathFind();
    setMode('confirm');
  };

  const confirm = async () => {
    if (!chosen) return;
    setMode('submit');
    const sa = chosen.origin.source_amount;
    const source: Value = typeof sa === 'string'
      ? {currency: 'XRP', value: new BigNumber(sa).multipliedBy(1.01).dividedBy(1e6).toString(10)}
      : {currency: (sa as {currency: string}).currency, issuer: (sa as {issuer?: string}).issuer, value: new BigNumber((sa as {value: string}).value).multipliedBy(1.01).toString(10)};
    const delivered: Value = code === native.code ? {currency: 'XRP', value: amount} : {currency: code, issuer: address!, value: amount};
    await tx.run('swap', () => convert(source, delivered, chosen.origin.paths_computed));
  };

  const restart = () => {
    tx.clear('swap');
    setAmount('');
    setChosen(null);
    setMode('input');
  };

  const status = tx.status.swap;
  const url = txUrl(status?.hash);
  const secondsAgo = lastUpdate === null ? 0 : Math.max(0, Math.round((now - lastUpdate) / 1000));
  const list = Object.values(options);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t('swap')}</h1>
          <div className="page-sub">{t('convert_title')}</div>
        </div>
      </div>

      <div className="swap-wrap">
        {mode === 'input' && (
          <div className="card">
            <div className="card-body stack">
              <div className="swap-box">
                <div className="between">
                  <label htmlFor="swap_amount">{t('receive')}</label>
                  {code === native.code && <span className="text-xs text-faint">{t('balance')}: {fmtNum(balance)}</span>}
                </div>
                <div className="input-group lg">
                  <input id="swap_amount" type="number" autoComplete="off" placeholder="0.00" className="input" value={amount} onChange={e => setAmount(e.target.value)} />
                  <div className="select-addon">
                    <select value={code} onChange={e => setCode(e.target.value)} disabled={codes.length < 2}>
                      {codes.map(c => <option key={c} value={c}>{fmtCode(c)}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="swap-divider"><span><i className="fa fa-arrow-down" /></span></div>

              <div>
                <div className="between mb-8">
                  <label className="mb-0">{t('pay_with')}</label>
                  {found && <span className="text-xs text-faint">{t('path_updated')} {secondsAgo} {t('seconds_ago')}</span>}
                </div>
                <div className="stack-sm">
                  {finding && !found && <div className="loading-row"><span className="spinner" /> {t('calculating')}</div>}
                  {!finding && !found && <div className="empty"><div className="empty-icon"><i className="fa fa-exchange" /></div><div>{t('convert_input')}</div></div>}
                  {found && !list.length && <div className="empty"><div className="empty-icon"><i className="fa fa-random" /></div><div>{t('convert_nopath')}</div></div>}
                  {list.map(option => (
                    <button type="button" key={option.code} className="path-option" onClick={() => pick(option)} disabled={readOnly}>
                      <span className="asset-logo sm"><img src={getGateway(network, option.code, option.issuer).logo} alt="" /></span>
                      <span className="grow text-left">
                        <span className="fw-600 num">{option.value} {fmtCode(option.code)}</span>
                        <span className="text-xs text-faint block">{t('rate')} {option.rate} {fmtCode(option.code)}/{fmtCode(code)}</span>
                      </span>
                      <i className="fa fa-arrow-right" />
                    </button>
                  ))}
                </div>
              </div>
              {error && <div className="alert alert-error"><i className="fa fa-exclamation-circle" /><span>{t(error)}</span></div>}
            </div>
          </div>
        )}

        {mode === 'confirm' && chosen && (
          <div className="card">
            <div className="card-body stack">
              <div className="text-center">
                <div className="confirm-icon"><i className="fa fa-exchange" /></div>
                <h2>{t('confirm_swap')}</h2>
              </div>
              <div className="summary-box">
                <div className="summary-row"><span className="k">{t('you_pay')}</span><span className="v">{chosen.value} {fmtCode(chosen.code)}</span></div>
                <div className="summary-row"><span className="k">{t('receive')}</span><span className="v summary-big">{new BigNumber(amount).toString(10)} {fmtCode(code, native.code)}</span></div>
                <div className="summary-row"><span className="k">{t('pay_most')}</span><span className="v">{chosen.value} {fmtCode(chosen.code)} <span className="text-faint">± 1%</span></span></div>
              </div>
              <div className="grid-2">
                <button type="button" onClick={() => setMode('input')} className="btn btn-secondary btn-lg"><i className="fa fa-arrow-left" /> {t('back')}</button>
                <button type="button" onClick={confirm} className="btn btn-primary btn-lg"><i className="fa fa-check" /> {t('confirm')}</button>
              </div>
            </div>
          </div>
        )}

        {mode === 'submit' && (
          <div className="card">
            <div className="card-body stack text-center">
              {status?.working && <div><div className="confirm-icon"><span className="spinner" /></div><h2>{t('submitting')}</h2></div>}
              {status?.state === 'submitted' && (
                <div>
                  <div className="confirm-icon info"><i className="fa fa-clock-o" /></div>
                  <h2>{t('submitted')}</h2>
                  <p className="text-muted">{t('act_will_upd')}</p>
                </div>
              )}
              {status?.state === 'success' && <div><div className="confirm-icon success"><i className="fa fa-check" /></div><h2>{t('cleared')}</h2></div>}
              {(status?.state === 'fail' || status?.state === 'error') && (
                <div>
                  <div className="confirm-icon danger"><i className="fa fa-times" /></div>
                  <h2>{t('tx_failed_title')}</h2>
                  <p className="text-danger">{t(status.error || '')}</p>
                </div>
              )}
              {!status?.working && (
                <div className="cluster justify-center">
                  {url && <button type="button" className="btn btn-secondary" onClick={() => openExternal(url)}><i className="fa fa-external-link" /> {t('view_explorer')}</button>}
                  <button type="button" className="btn btn-secondary" onClick={restart}><i className="fa fa-repeat" /> {t('back_convert')}</button>
                  <button type="button" className="btn btn-primary" onClick={() => navigate('/balance')}>{t('go_balance')}</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

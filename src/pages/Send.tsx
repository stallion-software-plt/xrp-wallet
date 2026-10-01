import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate, useSearchParams} from 'react-router';
import {useTranslation} from 'react-i18next';
import BigNumber from 'bignumber.js';
import {isValidXAddress, xAddressToClassicAddress, xrpToDrops, type Amount} from 'xrpl';
import {fmtCode, fmtFixed, isDecimal, realCode, round} from '../core/format';
import {getRippleToml} from '../core/federation';
import {getGateway} from '../core/gateways';
import {isValidAddress} from '../core/id';
import {findLookalike} from '../core/lookalike';
import {getLang} from '../core/settings';
import {useDebounced} from '../hooks/useDebounced';
import {useTx} from '../hooks/useTx';
import {openExternal} from '../platform/desktop';
import {useAccount, useAvailable} from '../state/account';
import {txUrl, useApp} from '../state/app';
import {checkCurrencies, checkSettings, errorMessage, isNotFound, payment, type Memo} from '../xrpl/api';
import type {Value} from '../xrpl/amounts';
import {closePathFind, openPathFind, type PathAlternative} from '../xrpl/pathfind';

// Accounts known to need a destination tag even without the RequireDest flag.
const SPECIAL_DESTINATIONS: Record<string, string> = {r3ipidkRUZWq8JYVjnSnNMf3v7o69vgLEW: 'RippleFox'};

interface ExtraField {
  type: 'label' | 'image' | 'text' | 'select';
  name?: string;
  label?: string;
  hint?: string;
  link?: string;
  required?: boolean;
  value?: string;
  options?: Array<{label: string; value: string; selected?: boolean; disabled?: boolean}>;
}

/** What the recipient field resolved to. */
interface Recipient {
  address: string;
  loading: boolean;
  invalid: boolean;
  federation: boolean;
  notFunded: boolean;
  tagRequired: boolean;
  tagProvided: boolean;
  disallowXrp: boolean;
  msgRequired: boolean;
  currencies: string[];
  serviceError: string;
  extraFields: ExtraField[] | null;
  /** Legacy federation quote service: currency, destination, domain and URL. */
  quote: {currency: string; destination: string; domain: string; url: string} | null;
  /** XRC20 limits per currency. */
  limits: Array<{currency: string; min?: number; max?: number}> | null;
  memos: Memo[];
  invoice: string;
}

interface PathOption {
  origin: PathAlternative | null;
  code: string;
  issuer?: string;
  value: string;
  rate: string;
}

function emptyRecipient(nativeCode: string): Recipient {
  return {
    address: '', loading: false, invalid: false, federation: false, notFunded: false, tagRequired: false, tagProvided: false,
    disallowXrp: false, msgRequired: false, currencies: [nativeCode], serviceError: '', extraFields: null, quote: null,
    limits: null, memos: [], invoice: ''
  };
}

function validTag(tag: string): boolean {
  const n = Number(tag);
  return Number.isInteger(n) && n > 0 && n < 2 ** 32;
}

export function Send() {
  const {t} = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const network = useApp(s => s.network);
  const native = network.coin;
  const {address: myAddress, readOnly, contacts, lines} = useAccount();
  const available = useAvailable();
  const tx = useTx();

  const findContact = useCallback((value: string) => value ? contacts.find(c => c.name === value || c.address === value) : undefined, [contacts]);
  const initialInput = (() => {
    const name = params.get('name');
    if (name && findContact(name)) return name;
    return params.get('address') || '';
  })();

  const [mode, setMode] = useState<'input' | 'confirm' | 'submit'>('input');
  const [input, setInput] = useState(initialInput);
  const [recipient, setRecipient] = useState<Recipient>(() => emptyRecipient(native.code));
  const [code, setCode] = useState(native.code);
  const [amount, setAmount] = useState('');
  const [issuer, setIssuer] = useState<string | undefined>();
  const [tag, setTag] = useState('');
  const [msg, setMsg] = useState('');
  const [tagTouched, setTagTouched] = useState(false);
  const [serviceAmount, setServiceAmount] = useState('');
  const [quoteState, setQuoteState] = useState({loading: false, error: ''});
  const [paths, setPaths] = useState<PathOption[]>([]);
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [sendError, setSendError] = useState('');
  const [chosen, setChosen] = useState<PathOption | null>(null);

  const debouncedInput = useDebounced(input.trim());
  const debouncedAmount = useDebounced(amount.trim());
  const resolveId = useRef(0);

  const isNativeCode = code === native.code;
  const amountValid = useMemo(() => {
    const value = Number(debouncedAmount);
    if (!isDecimal(debouncedAmount) || !(value > 0)) return false;
    if (recipient.federation && recipient.limits) {
      const item = recipient.limits.find(x => realCode(code) === realCode(x.currency));
      return !!item && value >= (item.min ?? 0) && value <= (item.max ?? Infinity);
    }
    return true;
  }, [debouncedAmount, recipient.federation, recipient.limits, code]);
  const tagInvalid = tag ? !validTag(tag) : recipient.tagRequired && tagTouched;
  const msgInvalid = recipient.msgRequired && !msg;

  const stopPath = useCallback((clean = false) => {
    setFinding(false);
    closePathFind();
    if (clean) {
      setPaths([]);
      setFound(false);
    }
  }, []);

  useEffect(() => () => closePathFind(), []);

  useEffect(() => {
    if (lastUpdate === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [lastUpdate]);

  /* ---------------------------------------------------------------- recipient */

  const resolveAccount = useCallback(async (id: number, destination: string, base: Recipient) => {
    if (!isValidAddress(destination)) {
      setRecipient({...base, address: destination, invalid: true, loading: false});
      return;
    }
    setRecipient({...base, address: destination, loading: true});
    try {
      const settings = await checkSettings(destination);
      const tagRequired = settings.requireDestinationTag || !!SPECIAL_DESTINATIONS[destination];
      const currencies = await checkCurrencies(destination);
      if (id !== resolveId.current) return;
      const list = [native.code, ...currencies.receive_currencies];
      setRecipient({...base, address: destination, loading: false, tagRequired, disallowXrp: settings.disallowIncomingXRP, currencies: list});
      setCode(c => (list.includes(c) ? c : native.code));
    } catch (err) {
      if (id !== resolveId.current) return;
      if (isNotFound(err)) {
        setRecipient({...base, address: destination, loading: false, notFunded: true, currencies: [native.code]});
        setCode(native.code);
      } else {
        setRecipient({...base, address: destination, loading: false});
        setSendError(errorMessage(err));
      }
    }
  }, [native.code]);

  const resolveFederation = useCallback(async (id: number, full: string, base: Recipient) => {
    const at = full.indexOf('@');
    const name = full.substring(0, at);
    const domain = full.substring(at + 1);
    setRecipient({...base, federation: true, loading: true});
    try {
      const toml = await getRippleToml(domain);
      const api = toml.XRC20_SERVER as string | undefined;
      if (!api) throw new Error('NoFederationUrl');
      const query = new URLSearchParams({
        type: 'xrc20', domain, destination: name, address: myAddress!, client: `xrp-wallet-${__APP_VERSION__}`,
        network: network.networkType, lang: getLang()
      });
      const response = await fetch(`${api}?${query}`);
      if (id !== resolveId.current) return;
      if (!response.ok) throw new Error(response.statusText);
      const res = await response.json();
      if (res.error || res.result === 'error') throw new Error(res.error_message || res.error);

      if (res.xrc20_json) {
        const data = res.xrc20_json;
        if (data.domain !== domain) throw new Error(`The domain field in response must be ${domain}`);
        if (data.type !== 'address') throw new Error(`The type ${data.type} is not supported yet.`);
        const currencies = (data.currencies as Array<{currency: string; value?: string; min?: number; max?: number}>).map(c => realCode(c.currency));
        setRecipient({
          ...base, federation: true, loading: false, address: data.destination_address, extraFields: data.extra_fields || null,
          tagRequired: !!data.tag_require, msgRequired: !!data.msg_require, memos: data.memos || [], currencies, limits: data.currencies
        });
        if (data.tag !== undefined && data.tag !== null) setTag(String(data.tag));
        if (data.msg) setMsg(data.msg);
        setCode(currencies[0]);
        setAmount(data.currencies[0].value ? String(data.currencies[0].value) : '');
      } else if (res.federation_json) {
        const data = res.federation_json;
        if (data.extra_fields) {
          if (data.domain !== domain) throw new Error(`The domain field in response must be ${domain}`);
          setRecipient({
            ...base, federation: true, loading: false, extraFields: data.extra_fields,
            quote: {currency: (data.currencies || data.assets)[0].currency, destination: data.destination, domain: data.domain, url: data.quote_url}
          });
        } else {
          await resolveAccount(id, data.destination_address, {...base, federation: true});
        }
      } else {
        throw new Error('Unkonw protocol.');
      }
    } catch (err) {
      if (id !== resolveId.current) return;
      setRecipient({...base, federation: true, loading: false, serviceError: (err as Error).message});
    }
  }, [myAddress, network.networkType, resolveAccount]);

  useEffect(() => {
    const id = ++resolveId.current;
    stopPath(true);
    setSendError('');
    setQuoteState({loading: false, error: ''});
    setServiceAmount('');
    // A tag or message belongs to one recipient; don't carry it over to the next.
    setTag('');
    setMsg('');
    setTagTouched(false);
    setIssuer(undefined);
    const base = emptyRecipient(native.code);
    const contact = findContact(debouncedInput);
    if (contact) {
      if (contact.dt) setTag(String(contact.dt));
      void resolveAccount(id, contact.address, base);
      return;
    }
    const full = debouncedInput;
    if (!full) {
      setRecipient(base);
      return;
    }
    if (full.includes('@')) {
      void resolveFederation(id, full, base);
      return;
    }
    if (isValidXAddress(full)) {
      const decoded = xAddressToClassicAddress(full);
      if (decoded.tag !== false) setTag(String(decoded.tag));
      void resolveAccount(id, decoded.classicAddress, {...base, tagProvided: true});
      return;
    }
    void resolveAccount(id, full, base);
    // Only a new recipient should trigger a lookup.
  }, [debouncedInput]);

  /* ---------------------------------------------------------------- legacy federation quote */

  const [fieldValues, setFieldValues] = useState<Record<number, string>>({});
  useEffect(() => {
    const initial: Record<number, string> = {};
    (recipient.extraFields || []).forEach((f, i) => {
      if (f.type === 'select') initial[i] = f.options?.find(o => o.selected)?.value ?? f.options?.[0]?.value ?? '';
      else if (f.value !== undefined) initial[i] = f.value;
    });
    setFieldValues(initial);
  }, [recipient.extraFields]);
  const debouncedService = useDebounced(JSON.stringify({serviceAmount, fieldValues}));
  const quoteId = useRef(0);
  const serviceFormValid = !!recipient.quote && (recipient.extraFields || []).every((f, i) => !(f.required && (f.type === 'text' || f.type === 'select') && !fieldValues[i]));

  useEffect(() => {
    const quote = recipient.quote;
    const {serviceAmount: value, fieldValues: values} = JSON.parse(debouncedService) as {serviceAmount: string; fieldValues: Record<number, string>};
    if (!quote || !value || !serviceFormValid) return;
    const id = ++quoteId.current;
    const data: Record<string, string> = {
      type: 'quote', amount: `${value}/${quote.currency}`, destination: quote.destination, domain: quote.domain, address: myAddress!,
      client: `xrp-wallet-${__APP_VERSION__}`, network: network.networkType === 'other' ? native.code : network.networkType, lang: getLang()
    };
    (recipient.extraFields || []).forEach((f, i) => {
      if (f.name) data[f.name] = values[i] ?? '';
    });
    setQuoteState({loading: true, error: ''});
    (async () => {
      try {
        const response = await fetch(`${quote.url}?${new URLSearchParams(data)}`);
        const res = await response.json();
        if (id !== quoteId.current) return;
        if (res.result === 'error') {
          setQuoteState({loading: false, error: res.error_message || res.error});
          stopPath(true);
          return;
        }
        const send = res.quote.send[0];
        const destination = res.quote.destination_address || res.quote.address;
        // The service decides where the payment goes and how much; accept only well-formed values.
        if (!isValidAddress(destination)) throw new Error('invalid_address');
        if (!isDecimal(send.value) || !(Number(send.value) > 0)) throw new Error('invalid_amount');
        setCode(send.currency);
        setAmount(String(send.value));
        setIssuer(send.issuer);
        if (res.quote.destination_tag !== undefined) setTag(String(res.quote.destination_tag));
        setRecipient(r => ({...r, address: destination, invoice: res.quote.invoice_id || '', memos: res.quote.memos || []}));
        setQuoteState({loading: false, error: ''});
      } catch (err) {
        if (id !== quoteId.current) return;
        stopPath(true);
        setQuoteState({loading: false, error: (err as Error).message});
      }
    })();
  }, [debouncedService, recipient.quote, serviceFormValid]);

  /* ---------------------------------------------------------------- path finding */

  useEffect(() => {
    if (mode !== 'input') return;
    if (!amountValid || !recipient.address || recipient.invalid || recipient.loading || !myAddress) {
      stopPath(true);
      return;
    }
    const destination = recipient.address;
    const value = debouncedAmount;
    const deliver: Amount = isNativeCode
      ? xrpToDrops(new BigNumber(value).toFixed(6, BigNumber.ROUND_DOWN))
      : {currency: realCode(code), issuer: destination, value};
    setFound(false);
    setFinding(true);
    setSendError('');
    setLastUpdate(null);
    void openPathFind(myAddress, destination, deliver, data => {
      setLastUpdate(Date.now());
      setFound(true);
      const options: PathOption[] = [];
      let current: PathOption | null = null;
      for (const alt of data.alternatives) {
        if (typeof alt.source_amount === 'string') {
          const xrp = Number(alt.source_amount) / 1e6;
          options.push({origin: alt, code: native.code, value: String(round(xrp, 6)), rate: String(round(xrp / Number(value), 6))});
        } else {
          const option = {
            origin: alt, code: alt.source_amount.currency, issuer: (alt.source_amount as {issuer?: string}).issuer,
            value: String(round(Number(alt.source_amount.value), 6)), rate: String(round(Number(alt.source_amount.value) / Number(value), 6))
          };
          if (alt.source_amount.currency === realCode(code)) current = option;
          else options.push(option);
        }
      }
      setPaths(current ? [current, ...options] : options);
    }, err => {
      stopPath();
      setLastUpdate(Date.now());
      // Servers without path_find can still take a direct payment.
      setSendError(err.message);
      setFound(true);
      if (!isNativeCode) {
        const own = issuer || lines.filter(l => l.currency === realCode(code) && Number(l.value) > 0).pop()?.issuer || myAddress;
        setPaths([{origin: {source_amount: {currency: realCode(code), issuer: own, value}, paths_computed: []}, code: realCode(code), issuer: own, value, rate: '1'}]);
      }
    });
  }, [mode, amountValid, debouncedAmount, code, recipient.address, recipient.invalid, recipient.loading, myAddress]);

  /* ---------------------------------------------------------------- confirm and send */

  const pickPath = (option: PathOption | null) => {
    setTagTouched(true);
    if ((tag && !validTag(tag)) || (!tag && recipient.tagRequired) || msgInvalid) return;
    // Only confirm the amount the payment options were found for.
    if (!isDecimal(amount) || amount !== debouncedAmount) return;
    setChosen(option ?? {origin: null, code: native.code, value: amount, rate: '1'});
    stopPath();
    setMode('confirm');
  };

  const confirm = async () => {
    if (!chosen) return;
    setMode('submit');
    setSendError('');
    const alt = chosen.origin;
    let source: Value;
    if (alt) {
      if (typeof alt.source_amount === 'string') {
        source = {currency: 'XRP', value: new BigNumber(alt.source_amount).multipliedBy(1.01).dividedBy(1e6).toString(10)};
      } else {
        const sa = alt.source_amount as {currency: string; issuer: string; value: string};
        source = {currency: sa.currency, issuer: sa.issuer, value: new BigNumber(sa.value).multipliedBy(1.01).toString(10)};
      }
    } else {
      source = {currency: 'XRP', value: amount};
    }
    const delivered: Value = isNativeCode ? {currency: 'XRP', value: amount} : {currency: realCode(code), issuer: recipient.address, value: amount};
    const memos = [...recipient.memos];
    if (msg) memos.push({data: msg, type: 'msg', format: 'text'});
    const hash = await tx.run('send', () => payment({
      destination: recipient.address, source, delivered, tag: tag || null, invoice: recipient.invoice || null, memos,
      paths: alt?.paths_computed?.length ? alt.paths_computed : undefined
    }));
    if (hash) {
      setAmount('');
      setServiceAmount('');
    }
  };

  const restart = () => {
    tx.clear('send');
    setMode('input');
    setAmount('');
    setChosen(null);
    setSendError('');
  };

  const status = tx.status.send;
  // A recipient that imitates a contact or this wallet's own address (address poisoning).
  const lookalike = recipient.address && !recipient.invalid && myAddress
    ? findLookalike(recipient.address, [{name: '', address: myAddress}, ...contacts.map(c => ({name: c.name, address: c.address}))])
    : null;
  const showFields = !(recipient.federation && recipient.quote);
  const directOption = isNativeCode && (!recipient.federation || recipient.extraFields) && Number(amount) > 0 && amountValid;
  const secondsAgo = lastUpdate === null ? 0 : Math.max(0, Math.round((now - lastUpdate) / 1000));

  const extraField = (field: ExtraField, i: number, form: boolean) => {
    switch (field.type) {
      case 'label':
        return form
          ? <div key={i}><label>{field.label}</label>{field.hint && <div className="hint">{field.hint}</div>}</div>
          : <div key={i} className="alert alert-info"><i className="fa fa-info-circle" /><div><div className="alert-title">{field.label}</div>{field.hint && <div>{field.hint}</div>}</div></div>;
      case 'image':
        return (
          <div key={i} className="cluster-lg">
            <div className="grow"><label>{field.label}</label>{field.hint && <div className="hint">{field.hint}</div>}</div>
            {field.link && /^https:\/\//i.test(field.link) && <img src={field.link} alt="" className="service-image" />}
          </div>
        );
      case 'text':
        return form ? (
          <div key={i} className="field">
            <label>{field.label}</label>
            <input type="text" className="input" value={fieldValues[i] ?? ''} required={field.required} onChange={e => setFieldValues(v => ({...v, [i]: e.target.value}))} />
            {field.hint && <div className="hint">{field.hint}</div>}
          </div>
        ) : null;
      case 'select':
        return form ? (
          <div key={i} className="field">
            <label>{field.label}</label>
            <select className="input" value={fieldValues[i] ?? ''} required={field.required} onChange={e => setFieldValues(v => ({...v, [i]: e.target.value}))}>
              {(field.options || []).map(o => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
            </select>
            {field.hint && <div className="hint">{field.hint}</div>}
          </div>
        ) : null;
      default:
        return null;
    }
  };

  const url = txUrl(status?.hash);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t('send_money')}</h1>
          <div className="page-sub">{t('send_sub')}</div>
        </div>
      </div>

      {mode === 'input' && (
        <div className="grid-main">
          <div className="card">
            <div className="card-body stack">
              <div className="field">
                <label htmlFor="recipient">{t('recipient')}</label>
                <input id="recipient" type="text" className="input mono" required value={input} placeholder={t('name_or_address')} list="contacts"
                  onChange={e => setInput(e.target.value)} autoComplete="off" spellCheck={false} />
                <datalist id="contacts">
                  {contacts.map(c => <option key={c.name} value={c.name}>{c.address}</option>)}
                </datalist>
                {recipient.address && input.trim() !== recipient.address && !recipient.invalid && (
                  <div className="form-success mono"><i className="fa fa-check-circle" /> {recipient.address}</div>
                )}
                {recipient.invalid && input && <div className="form-error">{t('invalid_address')}</div>}
                {recipient.loading && <div className="hint"><span className="spinner" /> {t('account_loading')} {input}</div>}
              </div>
              {lookalike && <div className="alert alert-warning"><i className="fa fa-exclamation-triangle" /><span>{lookalike.name ? t('send_lookalike', {name: lookalike.name, address: lookalike.address}) : t('send_lookalike_self')}</span></div>}

              {showFields && (
                <div className="stack">
                  {(recipient.extraFields || []).map((f, i) => extraField(f, i, false))}

                  <div className="field">
                    <label htmlFor="amount">{t('will_receive')}</label>
                    <div className="input-group lg">
                      <input id="amount" type="text" autoComplete="off" placeholder="0.00" className="input" value={amount} onChange={e => setAmount(e.target.value.trim())} />
                      <div className="select-addon">
                        <select value={code} onChange={e => { setCode(e.target.value); setIssuer(undefined); }} disabled={recipient.currencies.length === 1}>
                          {recipient.currencies.map(c => <option key={c} value={c}>{fmtCode(c)}</option>)}
                        </select>
                      </div>
                    </div>
                    {isNativeCode && <div className="hint">{t('available')}: {fmtFixed(available, 6)} {native.code}</div>}
                    {recipient.disallowXrp && isNativeCode && <div className="form-error">{t('disallow_xrp', native)}</div>}
                    {!amountValid && debouncedAmount && <div className="form-error">{t('invalid_amount')}</div>}
                  </div>

                  <div className="grid-2">
                    {!(recipient.federation && !recipient.tagRequired) && (
                      <div className="field">
                        <label htmlFor="tag">{t('dest_tag')}</label>
                        <input id="tag" type="text" className="input" autoComplete="off" value={tag} disabled={recipient.tagProvided}
                          placeholder={t(recipient.tagRequired ? 'required' : 'optional')} onChange={e => { setTag(e.target.value.trim()); setTagTouched(true); }} />
                        {tagInvalid && <div className="form-error">{t('error_invalid_tag')}</div>}
                      </div>
                    )}
                    {!(recipient.federation && !recipient.msgRequired) && (
                      <div className="field">
                        <label htmlFor="msg">{t('message')}</label>
                        <input id="msg" type="text" className="input" autoComplete="off" value={msg} placeholder={t('optional')} onChange={e => setMsg(e.target.value)} />
                        {msgInvalid && <div className="form-error">{t('msg_need')}</div>}
                      </div>
                    )}
                  </div>
                  {recipient.tagRequired && <div className="alert alert-warning"><i className="fa fa-tag" /><span>{t('tag_need')}</span></div>}
                  {recipient.notFunded && <div className="alert alert-info"><i className="fa fa-info-circle" /><span>{t('not_funded', native)}</span></div>}
                </div>
              )}

              {recipient.federation && recipient.quote && (
                <div className="stack">
                  {(recipient.extraFields || []).map((f, i) => extraField(f, i, true))}
                  <div className="field">
                    <label>{t('will_receive')}</label>
                    <div className="input-group">
                      <input type="number" autoComplete="off" placeholder="0.00" className="input" value={serviceAmount} onChange={e => setServiceAmount(e.target.value)} />
                      <div className="addon">{recipient.quote.currency}</div>
                    </div>
                  </div>
                </div>
              )}

              {(recipient.serviceError || quoteState.error || (recipient.quote && !serviceFormValid)) && (
                <div className="alert alert-error">
                  <i className="fa fa-exclamation-circle" />
                  <div>
                    {recipient.serviceError && <div>{t(recipient.serviceError)}</div>}
                    {quoteState.error && <div>{t(quoteState.error)}</div>}
                    {recipient.quote && !serviceFormValid && <div>{t('fill_form')}</div>}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">{t('pay_with')}</div>
                {found && <div className="card-sub">{t('path_updated')} {secondsAgo} {t('seconds_ago')}</div>}
              </div>
            </div>
            <div className="card-body stack-sm">
              {quoteState.loading && <div className="loading-row"><span className="spinner" /> {t('request_quote')}</div>}
              {finding && !found && <div className="loading-row"><span className="spinner" /> {t('calculating')}</div>}

              {directOption && (
                <button type="button" className="path-option" onClick={() => pickPath(null)} disabled={recipient.invalid || !amountValid || tagInvalid || readOnly}>
                  <span className="asset-logo sm"><img src={native.logo} alt="" /></span>
                  <span className="grow text-left">
                    <span className="fw-600 num">{amount} {fmtCode(code)}</span>
                    <span className="text-xs text-faint block">{t('direct_payment')}</span>
                  </span>
                  <i className="fa fa-arrow-right" />
                </button>
              )}

              {paths.map((option, i) => (
                <button type="button" key={`${option.code}.${option.issuer ?? ''}.${i}`} className="path-option" onClick={() => pickPath(option)} disabled={readOnly || tagInvalid}>
                  <span className="asset-logo sm"><img src={getGateway(network, option.code, option.issuer).logo} alt="" /></span>
                  <span className="grow text-left">
                    <span className="fw-600 num">{option.value} {fmtCode(option.code)}</span>
                    <span className="text-xs text-faint block">{t('rate')} {option.rate} {fmtCode(option.code)}/{fmtCode(code)}</span>
                  </span>
                  <i className="fa fa-arrow-right" />
                </button>
              ))}

              {found && !paths.length && !isNativeCode && (
                <div className="empty"><div className="empty-icon"><i className="fa fa-random" /></div><div>{t('no_send_path')}</div></div>
              )}
              {!found && !finding && !quoteState.loading && !(isNativeCode && Number(amount) > 0) && (
                <div className="empty"><div className="empty-icon"><i className="fa fa-paper-plane" /></div><div>{t('send_enter_details')}</div></div>
              )}
              {sendError && <div className="alert alert-warning"><i className="fa fa-exclamation-triangle" /><span>{t('send_with_err')} — {sendError}</span></div>}
            </div>
          </div>
        </div>
      )}

      {mode === 'confirm' && chosen && (
        <div className="card confirm-card">
          <div className="card-body stack">
            <div className="text-center">
              <div className="confirm-icon"><i className="fa fa-paper-plane" /></div>
              <h2>{t('confirm_payment')}</h2>
            </div>
            <div className="summary-box">
              <div className="summary-row">
                <span className="k">{t('recipient')}</span>
                <span className="v mono">{input}{recipient.address !== input.trim() && <span className="block text-xs text-faint">{recipient.address}</span>}</span>
              </div>
              {tag && <div className="summary-row"><span className="k">{t('dest_tag')}</span><span className="v">{tag}</span></div>}
              {msg && <div className="summary-row"><span className="k">{t('message')}</span><span className="v">{msg}</span></div>}
              {recipient.memos.filter(m => m.data).map((m, i) => (
                <div className="summary-row" key={i}><span className="k">{t('message')}</span><span className="v">{m.data}</span></div>
              ))}
              {recipient.invoice && <div className="summary-row"><span className="k">{t('invoice')}</span><span className="v mono break">{recipient.invoice}</span></div>}
              <div className="summary-row"><span className="k">{t('will_receive')}</span><span className="v summary-big">{new BigNumber(amount).toString(10)} {fmtCode(code, native.code)}</span></div>
              <div className="summary-row">
                <span className="k">{t('pay_most')}</span>
                <span className="v">{chosen.value} {fmtCode(chosen.code)} {chosen.origin && <span className="text-faint">± 1%</span>}</span>
              </div>
            </div>
            {lookalike && <div className="alert alert-warning"><i className="fa fa-exclamation-triangle" /><span>{lookalike.name ? t('send_lookalike', {name: lookalike.name, address: lookalike.address}) : t('send_lookalike_self')}</span></div>}
            <div className="grid-2">
              <button type="button" onClick={() => setMode('input')} className="btn btn-secondary btn-lg"><i className="fa fa-arrow-left" /> {t('back')}</button>
              <button type="button" onClick={confirm} className="btn btn-primary btn-lg"><i className="fa fa-check" /> {t('confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {mode === 'submit' && (
        <div className="card confirm-card">
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
            {status?.hash && <div className="mono text-xs text-faint break">{status.hash}</div>}
            {!status?.working && (
              <div className="cluster justify-center">
                {url && <button type="button" className="btn btn-secondary" onClick={() => openExternal(url)}><i className="fa fa-external-link" /> {t('view_explorer')}</button>}
                <button type="button" className="btn btn-secondary" onClick={restart}><i className="fa fa-repeat" /> {t('another_payment')}</button>
                <button type="button" className="btn btn-primary" onClick={() => navigate('/balance')}>{t('go_balance')}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

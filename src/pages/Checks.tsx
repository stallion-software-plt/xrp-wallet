import {useMemo, useState, type FormEvent} from 'react';
import {useTranslation} from 'react-i18next';
import {ContactList, LoadError, PageHeader} from '../components/Common';
import {Modal} from '../components/Modal';
import {TxStatus} from '../components/TxStatus';
import {currencyLabel, fmtCode, fmtDateTime, fmtNum, rippleTimeToMs, short, toRippleTime} from '../core/format';
import {isValidAddress} from '../core/id';
import {useLedgerList} from '../hooks/useLedgerList';
import {useTx} from '../hooks/useTx';
import {useAccount} from '../state/account';
import {useApp} from '../state/app';
import {cancelCheck, cashCheck, createCheck, getChecks} from '../xrpl/api';
import {parseAmount, toAmount, type Value} from '../xrpl/amounts';

interface CheckRow {
  index: string;
  Account: string;
  Destination: string;
  DestinationTag?: number;
  InvoiceID?: string;
  Expiration?: number;
  outgoing: boolean;
  amount: Value;
  expired: boolean;
}

type Filter = 'all' | 'received' | 'sent';

export function Checks() {
  const {t} = useTranslation();
  const nativeCode = useApp(s => s.network.coin.code);
  const {address, readOnly, lines} = useAccount();

  const list = useLedgerList<CheckRow>(async () => {
    const now = toRippleTime(Date.now())!;
    const checks = await getChecks();
    return checks.map((c: any) => ({...c, outgoing: c.Account === address, amount: parseAmount(c.SendMax)!, expired: !!c.Expiration && c.Expiration <= now}));
  });
  const tx = useTx(() => void list.refresh());
  const [filter, setFilter] = useState<Filter>('all');
  const shown = list.items.filter(c => filter === 'all' || (c.outgoing ? 'sent' : 'received') === filter);

  const currencies = useMemo(() => [
    {key: nativeCode, code: nativeCode, issuer: undefined as string | undefined, label: nativeCode},
    ...lines.filter(l => !l.currency.startsWith('03')).map(l => ({key: `${l.currency}.${l.issuer}`, code: l.currency, issuer: l.issuer, label: `${fmtCode(l.currency)} · ${short(l.issuer, 8, 0)}`}))
  ], [lines, nativeCode]);

  const [form, setForm] = useState({destination: '', amount: '', currency: nativeCode, expiration: '', destinationTag: '', invoiceId: ''});
  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({...f, [field]: e.target.value}));
  const formValid = isValidAddress(form.destination) && Number(form.amount) > 0 && (!form.invoiceId || /^[0-9A-Fa-f]{64}$/.test(form.invoiceId));

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!formValid) return;
    const cur = currencies.find(c => c.key === form.currency) || currencies[0];
    const hash = await tx.run('create', () => createCheck({
      destination: form.destination.trim(), amount: form.amount, currency: cur.code, issuer: cur.issuer,
      expiration: form.expiration || undefined, destinationTag: form.destinationTag || undefined,
      invoiceId: form.invoiceId ? form.invoiceId.toUpperCase() : undefined
    }));
    if (hash) setForm(f => ({...f, amount: ''}));
  };

  const [cashing, setCashing] = useState<{check: CheckRow; amount: string; flexible: boolean} | null>(null);
  const submitCash = async () => {
    if (!cashing) return;
    const {check, amount, flexible} = cashing;
    const hash = await tx.run('cash', () => cashCheck(check.index, toAmount(amount, check.amount.currency === 'XRP' ? undefined : check.amount.currency, check.amount.issuer), flexible));
    if (hash) setCashing(null);
  };

  return (
    <>
      <PageHeader title="checks" sub="checks_sub" loading={list.loading} onRefresh={() => void list.refresh()} />
      <LoadError error={list.error} />

      <div className="grid-main">
        <div className="card">
          <div className="card-header">
            <div className="card-title">{t('checks')}</div>
            <div className="card-actions">
              {(['all', 'received', 'sent'] as const).map(f => (
                <span key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{t(f === 'all' ? 'cat_all' : f)}</span>
              ))}
            </div>
          </div>
          <div className="list">
            {shown.map(c => (
              <div className="list-item align-start" key={c.index}>
                <div className={`tx-icon ${c.outgoing ? 'tone-out' : 'tone-in'}`}><i className="fa fa-money" /></div>
                <div className="li-main">
                  <div className="li-title num">
                    {fmtNum(c.amount.value)} {currencyLabel(c.amount.currency, nativeCode)}{' '}
                    <span className={`badge ${c.outgoing ? 'badge-danger' : 'badge-success'}`}>{t(c.outgoing ? 'sent' : 'received')}</span>{' '}
                    {c.expired && <span className="badge badge-warning">{t('expired')}</span>}
                  </div>
                  <div className="li-sub mono">{t(c.outgoing ? 'to' : 'from')} {c.outgoing ? c.Destination : c.Account}</div>
                  {(c.Expiration || c.DestinationTag !== undefined || c.InvoiceID) && (
                    <div className="li-sub">
                      {c.Expiration && <span>{t('expires')} {fmtDateTime(rippleTimeToMs(c.Expiration))}</span>}
                      {c.DestinationTag !== undefined && <span> · {t('dest_tag')} {c.DestinationTag}</span>}
                      {c.InvoiceID && <span className="mono"> · {t('invoice')} {short(c.InvoiceID, 8, 4)}</span>}
                    </div>
                  )}
                  <TxStatus state={tx.status[`cancel_${c.index}`]} />
                </div>
                <div className="cluster">
                  {!c.outgoing && !c.expired && (
                    <button type="button" className="btn btn-soft btn-sm" onClick={() => setCashing({check: c, amount: c.amount.value, flexible: false})} disabled={readOnly}><i className="fa fa-check" /> {t('cash')}</button>
                  )}
                  <button type="button" className="btn btn-danger-soft btn-sm" onClick={() => void tx.run(`cancel_${c.index}`, () => cancelCheck(c.index))} disabled={readOnly || tx.busy(`cancel_${c.index}`)}>
                    <i className="fa fa-ban" /> {t('offer_cancel')}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {list.loading && !list.items.length && <div className="loading-row"><span className="spinner" /> {t('loading')}</div>}
          {!list.loading && !shown.length && (
            <div className="empty">
              <div className="empty-icon"><i className="fa fa-money" /></div>
              <div className="empty-title">{t('no_checks')}</div>
              <div>{t('no_checks_desc')}</div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">{t('write_check')}</div></div>
          <form className="card-body stack" onSubmit={submitCreate}>
            <div className="field">
              <label htmlFor="check_destination">{t('recipient')}</label>
              <input id="check_destination" className="input mono" value={form.destination} onChange={set('destination')} placeholder="r..." list="check-contacts" />
              <ContactList id="check-contacts" />
              {form.destination && !isValidAddress(form.destination) && <div className="form-error">{t('invalid_account')}</div>}
            </div>
            <div className="field">
              <label htmlFor="check_amount">{t('check_max')}</label>
              <div className="input-group">
                <input id="check_amount" className="input" value={form.amount} onChange={set('amount')} placeholder="0.00" />
                <div className="select-addon">
                  <select value={form.currency} onChange={set('currency')}>
                    {currencies.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="hint">{t('check_max_hint')}</div>
            </div>
            <div className="field">
              <label htmlFor="check_expiration">{t('expires')}</label>
              <input id="check_expiration" className="input" type="datetime-local" value={form.expiration} onChange={set('expiration')} />
            </div>
            <div className="grid-2">
              <div className="field"><label htmlFor="check_tag">{t('dest_tag')}</label><input id="check_tag" className="input" value={form.destinationTag} onChange={set('destinationTag')} placeholder={t('optional')} /></div>
              <div className="field"><label htmlFor="check_invoice">{t('invoice')}</label><input id="check_invoice" className="input mono" value={form.invoiceId} onChange={set('invoiceId')} placeholder={t('optional')} /></div>
            </div>
            <TxStatus state={tx.status.create} />
            <button className="btn btn-primary" type="submit" disabled={!formValid || tx.busy('create') || readOnly}><i className="fa fa-pencil-square-o" /> {t('write_check')}</button>
          </form>
        </div>
      </div>

      {cashing && (
        <Modal
          title={t('cash_check')}
          onClose={() => setCashing(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setCashing(null)}>{t('cancel')}</button>
              <button type="button" className="btn btn-primary" onClick={() => void submitCash()} disabled={!(Number(cashing.amount) > 0) || tx.busy('cash')}><i className="fa fa-check" /> {t('cash')}</button>
            </>
          }
        >
          <div className="summary-box">
            <div className="summary-row"><span className="k">{t('from')}</span><span className="v mono">{short(cashing.check.Account, 8, 6)}</span></div>
            <div className="summary-row"><span className="k">{t('check_max')}</span><span className="v">{fmtNum(cashing.check.amount.value)} {currencyLabel(cashing.check.amount.currency, nativeCode)}</span></div>
          </div>
          <div className="field">
            <label htmlFor="cash_amount">{t('amount')}</label>
            <div className="input-group">
              <input id="cash_amount" className="input" value={cashing.amount} onChange={e => setCashing(c => c && {...c, amount: e.target.value})} />
              <div className="addon">{currencyLabel(cashing.check.amount.currency, nativeCode)}</div>
            </div>
          </div>
          <label className="checkbox-row"><input type="checkbox" checked={cashing.flexible} onChange={e => setCashing(c => c && {...c, flexible: e.target.checked})} /> {t('cash_flexible')}</label>
          <div className="hint">{t('cash_flexible_hint')}</div>
          <TxStatus state={tx.status.cash} />
        </Modal>
      )}
    </>
  );
}

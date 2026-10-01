import {useState, type FormEvent} from 'react';
import {useTranslation} from 'react-i18next';
import {dropsToXrp} from 'xrpl';
import {ContactList, LoadError, PageHeader} from '../components/Common';
import {Modal} from '../components/Modal';
import {TxStatus} from '../components/TxStatus';
import {fmtDateTime, fmtNum, rippleTimeToMs, short, toRippleTime} from '../core/format';
import {isValidAddress} from '../core/id';
import {useLedgerList} from '../hooks/useLedgerList';
import {useTx} from '../hooks/useTx';
import {useAccount} from '../state/account';
import {useApp} from '../state/app';
import {cancelEscrow, createEscrow, finishEscrow, getEscrows} from '../xrpl/api';

interface EscrowRow {
  index: string;
  Account: string;
  Destination: string;
  DestinationTag?: number;
  Amount: string;
  FinishAfter?: number;
  CancelAfter?: number;
  Condition?: string;
  sequence?: number;
  outgoing: boolean;
  amountXrp: number;
  canFinish: boolean;
  canCancel: boolean;
  locked: boolean;
}

export function Escrow() {
  const {t} = useTranslation();
  const code = useApp(s => s.network.coin.code);
  const address = useAccount(s => s.address);
  const readOnly = useAccount(s => s.readOnly);

  const list = useLedgerList<EscrowRow>(async () => {
    const now = toRippleTime(Date.now())!;
    const escrows = await getEscrows();
    return escrows.map((e: any) => ({
      ...e,
      outgoing: e.Account === address,
      amountXrp: Number(dropsToXrp(e.Amount)),
      canFinish: (!e.FinishAfter || e.FinishAfter <= now) && (!e.CancelAfter || e.CancelAfter > now),
      canCancel: !!e.CancelAfter && e.CancelAfter <= now,
      locked: !!e.FinishAfter && e.FinishAfter > now
    })).sort((a: EscrowRow, b: EscrowRow) => (a.FinishAfter || 0) - (b.FinishAfter || 0));
  });
  const tx = useTx(() => void list.refresh());

  const totals = list.items.reduce((acc, e) => {
    if (e.outgoing) acc.out += e.amountXrp;
    else acc.incoming += e.amountXrp;
    return acc;
  }, {out: 0, incoming: 0});

  const [form, setForm] = useState({destination: '', amount: '', finishAfter: '', cancelAfter: '', condition: '', destinationTag: ''});
  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({...f, [field]: e.target.value}));
  const formValid = (() => {
    const f = form;
    if (!isValidAddress(f.destination) || !(Number(f.amount) > 0)) return false;
    // The ledger needs a release time or a condition, and at least one of the two times.
    if (!f.finishAfter && !f.condition) return false;
    if (!f.finishAfter && !f.cancelAfter) return false;
    if (f.finishAfter && f.cancelAfter && new Date(f.cancelAfter) <= new Date(f.finishAfter)) return false;
    return true;
  })();

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!formValid) return;
    const hash = await tx.run('create', () => createEscrow({
      destination: form.destination.trim(), amount: form.amount,
      finishAfter: form.finishAfter || undefined, cancelAfter: form.cancelAfter || undefined,
      condition: form.condition || undefined, destinationTag: form.destinationTag || undefined
    }));
    if (hash) setForm(f => ({...f, amount: '', condition: ''}));
  };

  // Release / cancel dialog. The sequence is entered by hand when it couldn't be looked up.
  const [dialog, setDialog] = useState<{escrow: EscrowRow; cancelMode: boolean; sequence: string; fulfillment: string} | null>(null);
  const startFinish = (escrow: EscrowRow, cancelMode = false) => setDialog({escrow, cancelMode, sequence: escrow.sequence ? String(escrow.sequence) : '', fulfillment: ''});

  const submitFinish = async () => {
    if (!dialog) return;
    const {escrow, sequence, fulfillment} = dialog;
    const hash = await tx.run('finish', () => finishEscrow(escrow.Account, sequence, escrow.Condition, fulfillment));
    if (hash) setDialog(null);
  };

  const cancel = (escrow: EscrowRow) => {
    if (!escrow.sequence) {
      startFinish(escrow, true);
      return;
    }
    void tx.run(`cancel_${escrow.index}`, () => cancelEscrow(escrow.Account, escrow.sequence!));
  };

  const submitCancelManual = async () => {
    if (!dialog) return;
    const hash = await tx.run(`cancel_${dialog.escrow.index}`, () => cancelEscrow(dialog.escrow.Account, dialog.sequence));
    if (hash) setDialog(null);
  };

  return (
    <>
      <PageHeader title="escrow" sub="escrow_sub" loading={list.loading} onRefresh={() => void list.refresh()} />
      <LoadError error={list.error} />

      <div className="grid-main">
        <div className="stack">
          <div className="grid-2">
            <div className="card stat">
              <div className="stat-label"><i className="fa fa-arrow-up" /> {t('escrow_outgoing')}</div>
              <div className="stat-value">{fmtNum(totals.out)} <span className="text-sm text-faint">{code}</span></div>
            </div>
            <div className="card stat">
              <div className="stat-label"><i className="fa fa-arrow-down" /> {t('escrow_incoming')}</div>
              <div className="stat-value">{fmtNum(totals.incoming)} <span className="text-sm text-faint">{code}</span></div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">{t('escrows')}</div></div>
            <div className="list">
              {list.items.map(e => (
                <div className="list-item align-start" key={e.index}>
                  <div className={`tx-icon ${e.outgoing ? 'tone-out' : 'tone-in'}`}><i className={`fa ${e.locked ? 'fa-lock' : 'fa-unlock-alt'}`} /></div>
                  <div className="li-main">
                    <div className="li-title num">
                      {fmtNum(e.amountXrp)} {code}{' '}
                      <span className={`badge ${e.outgoing ? 'badge-danger' : 'badge-success'}`}>{t(e.outgoing ? 'escrow_to' : 'escrow_from')}</span>{' '}
                      {e.Condition && <span className="badge badge-warning"><i className="fa fa-key" /> {t('conditional')}</span>}
                    </div>
                    <div className="li-sub mono">{e.outgoing ? e.Destination : e.Account}{e.DestinationTag !== undefined && <span> · {t('dest_tag')} {e.DestinationTag}</span>}</div>
                    <div className="li-sub">
                      {e.FinishAfter && <span><i className="fa fa-unlock-alt" /> {t('release_after')} {fmtDateTime(rippleTimeToMs(e.FinishAfter))}</span>}
                      {e.CancelAfter && <span> · <i className="fa fa-undo" /> {t('expires')} {fmtDateTime(rippleTimeToMs(e.CancelAfter))}</span>}
                    </div>
                    <TxStatus state={tx.status[`cancel_${e.index}`]} />
                  </div>
                  <div className="cluster">
                    {e.canFinish && <button type="button" className="btn btn-soft btn-sm" onClick={() => startFinish(e)} disabled={readOnly}><i className="fa fa-check" /> {t('release')}</button>}
                    {e.canCancel && <button type="button" className="btn btn-danger-soft btn-sm" onClick={() => cancel(e)} disabled={readOnly || tx.busy(`cancel_${e.index}`)}><i className="fa fa-undo" /> {t('offer_cancel')}</button>}
                    {!e.canFinish && !e.canCancel && <span className="badge"><i className="fa fa-clock-o" /> {t('locked')}</span>}
                  </div>
                </div>
              ))}
            </div>
            {list.loading && !list.items.length && <div className="loading-row"><span className="spinner" /> {t('loading')}</div>}
            {!list.loading && !list.items.length && (
              <div className="empty">
                <div className="empty-icon"><i className="fa fa-hourglass-half" /></div>
                <div className="empty-title">{t('no_escrows')}</div>
                <div>{t('no_escrows_desc')}</div>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">{t('create_escrow')}</div></div>
          <form className="card-body stack" onSubmit={submitCreate}>
            <div className="field">
              <label htmlFor="escrow_destination">{t('recipient')}</label>
              <input id="escrow_destination" className="input mono" value={form.destination} onChange={set('destination')} placeholder="r..." list="escrow-contacts" />
              <ContactList id="escrow-contacts" />
              {form.destination && !isValidAddress(form.destination) && <div className="form-error">{t('invalid_account')}</div>}
            </div>
            <div className="field">
              <label htmlFor="escrow_amount">{t('amount')}</label>
              <div className="input-group"><input id="escrow_amount" className="input" value={form.amount} onChange={set('amount')} placeholder="0.00" /><div className="addon">{code}</div></div>
            </div>
            <div className="field">
              <label htmlFor="escrow_finish">{t('release_after')}</label>
              <input id="escrow_finish" className="input" type="datetime-local" value={form.finishAfter} onChange={set('finishAfter')} />
              <div className="hint">{t('release_after_hint')}</div>
            </div>
            <div className="field">
              <label htmlFor="escrow_cancel">{t('expires')}</label>
              <input id="escrow_cancel" className="input" type="datetime-local" value={form.cancelAfter} onChange={set('cancelAfter')} />
              <div className="hint">{t('escrow_expire_hint')}</div>
            </div>
            <div className="field">
              <label htmlFor="escrow_tag">{t('dest_tag')}</label>
              <input id="escrow_tag" className="input" value={form.destinationTag} onChange={set('destinationTag')} placeholder={t('optional')} />
            </div>
            <details className="advanced">
              <summary>{t('advanced')}</summary>
              <div className="field mt-12">
                <label htmlFor="escrow_condition">{t('crypto_condition')}</label>
                <input id="escrow_condition" className="input mono" value={form.condition} onChange={set('condition')} placeholder="A0258020..." />
                <div className="hint">{t('crypto_condition_hint')}</div>
              </div>
            </details>
            <div className="alert alert-info"><i className="fa fa-info-circle" /><span>{t('escrow_reserve_hint')}</span></div>
            <TxStatus state={tx.status.create} />
            <button className="btn btn-primary" type="submit" disabled={!formValid || tx.busy('create') || readOnly}><i className="fa fa-lock" /> {t('create_escrow')}</button>
          </form>
        </div>
      </div>

      {dialog && (
        <Modal
          title={t(dialog.cancelMode ? 'cancel_escrow' : 'release_escrow')}
          onClose={() => setDialog(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setDialog(null)}>{t('cancel')}</button>
              {dialog.cancelMode
                ? <button type="button" className="btn btn-danger" onClick={() => void submitCancelManual()} disabled={!dialog.sequence}><i className="fa fa-undo" /> {t('cancel_escrow')}</button>
                : <button type="button" className="btn btn-primary" onClick={() => void submitFinish()} disabled={!dialog.sequence || (!!dialog.escrow.Condition && !dialog.fulfillment) || tx.busy('finish')}><i className="fa fa-check" /> {t('release')}</button>}
            </>
          }
        >
          <div className="summary-box">
            <div className="summary-row"><span className="k">{t('amount')}</span><span className="v">{fmtNum(dialog.escrow.amountXrp)} {code}</span></div>
            <div className="summary-row"><span className="k">{t('nft_owner')}</span><span className="v mono">{short(dialog.escrow.Account, 8, 6)}</span></div>
            <div className="summary-row"><span className="k">{t('recipient')}</span><span className="v mono">{short(dialog.escrow.Destination, 8, 6)}</span></div>
          </div>
          <div className="field">
            <label htmlFor="escrow_sequence">{t('escrow_sequence')}</label>
            <input id="escrow_sequence" className="input" value={dialog.sequence} readOnly={!!dialog.escrow.sequence} onChange={e => setDialog(d => d && {...d, sequence: e.target.value})} />
            {!dialog.escrow.sequence && <div className="hint">{t('escrow_sequence_hint')}</div>}
          </div>
          {dialog.escrow.Condition && !dialog.cancelMode && (
            <div className="field">
              <label htmlFor="escrow_fulfillment">{t('fulfillment')}</label>
              <input id="escrow_fulfillment" className="input mono" value={dialog.fulfillment} placeholder="A0228020..." onChange={e => setDialog(d => d && {...d, fulfillment: e.target.value})} />
              <div className="hint mono break">{t('crypto_condition')}: {dialog.escrow.Condition}</div>
            </div>
          )}
          <TxStatus state={tx.status.finish} />
          <TxStatus state={tx.status[`cancel_${dialog.escrow.index}`]} />
        </Modal>
      )}
    </>
  );
}

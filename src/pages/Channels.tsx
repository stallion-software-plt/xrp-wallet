import {useState, type FormEvent} from 'react';
import {useTranslation} from 'react-i18next';
import {dropsToXrp} from 'xrpl';
import {ContactList, LoadError, PageHeader} from '../components/Common';
import {Modal} from '../components/Modal';
import {TxStatus} from '../components/TxStatus';
import {fmtDateTime, fmtFixed, fmtNum, rippleTimeToMs, short, toRippleTime} from '../core/format';
import {isValidAddress} from '../core/id';
import {useLedgerList} from '../hooks/useLedgerList';
import {useTx} from '../hooks/useTx';
import {useAccount} from '../state/account';
import {useApp} from '../state/app';
import {copy} from '../state/toasts';
import {claimChannel, createChannel, fundChannel, getChannels, signChannelClaim, verifyChannelClaim} from '../xrpl/api';

interface ChannelRow {
  index: string;
  Account: string;
  Destination: string;
  DestinationTag?: number;
  PublicKey?: string;
  SettleDelay: number;
  Expiration?: number;
  CancelAfter?: number;
  outgoing: boolean;
  amountXrp: number;
  claimedXrp: number;
  remainingXrp: number;
  pct: number;
  closing: boolean;
  expired: boolean;
}

interface Dialog {
  type: 'fund' | 'sign' | 'redeem';
  channel: ChannelRow;
  amount: string;
  expiration: string;
  signature: string;
  bundle: string;
  verified: boolean | null;
  claim: string;
  claimError: string;
}

export function Channels() {
  const {t} = useTranslation();
  const code = useApp(s => s.network.coin.code);
  const address = useAccount(s => s.address);
  const readOnly = useAccount(s => s.readOnly);

  const list = useLedgerList<ChannelRow>(async () => {
    const now = toRippleTime(Date.now())!;
    const channels = await getChannels();
    return channels.map((c: any) => {
      const amount = Number(dropsToXrp(c.Amount));
      const claimed = Number(dropsToXrp(c.Balance || '0'));
      return {
        ...c, outgoing: c.Account === address, amountXrp: amount, claimedXrp: claimed, remainingXrp: Math.max(0, amount - claimed),
        pct: amount ? Math.min(100, (claimed / amount) * 100) : 0, closing: !!c.Expiration,
        expired: (!!c.Expiration && c.Expiration <= now) || (!!c.CancelAfter && c.CancelAfter <= now)
      };
    });
  });
  const tx = useTx(() => void list.refresh());

  const [form, setForm] = useState({destination: '', amount: '', settleDelay: '86400', cancelAfter: '', destinationTag: ''});
  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({...f, [field]: e.target.value}));
  const formValid = isValidAddress(form.destination) && Number(form.amount) > 0 && form.settleDelay !== '' && Number(form.settleDelay) >= 0;

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!formValid) return;
    const hash = await tx.run('create', () => createChannel({
      destination: form.destination.trim(), amount: form.amount, settleDelay: form.settleDelay,
      cancelAfter: form.cancelAfter || undefined, destinationTag: form.destinationTag || undefined
    }));
    if (hash) setForm(f => ({...f, amount: ''}));
  };

  const [dialog, setDialog] = useState<Dialog | null>(null);
  const open = (type: Dialog['type'], channel: ChannelRow) => setDialog({
    type, channel, amount: '', expiration: '', signature: '', bundle: '', verified: null, claim: '', claimError: ''
  });
  const update = (patch: Partial<Dialog>) => setDialog(d => d && {...d, ...patch});

  const fund = async () => {
    if (!dialog) return;
    const hash = await tx.run('fund', () => fundChannel(dialog.channel.index, dialog.amount, dialog.expiration || undefined));
    if (hash) setDialog(null);
  };

  // Claims are cumulative: the signed amount is the total the destination may have received.
  const signClaim = () => {
    if (!dialog) return;
    try {
      update({claim: signChannelClaim(dialog.channel.index, dialog.amount), claimError: ''});
    } catch (e) {
      update({claim: '', claimError: (e as Error).message});
    }
  };
  const bundle = dialog ? JSON.stringify({channel: dialog.channel.index, amount: String(dialog.amount), signature: dialog.claim, public_key: dialog.channel.PublicKey}, null, 2) : '';

  // A claim is only valid if it is signed with the channel's own key (from the ledger, never from
  // the claim) and its total is more than already claimed and no more than the channel holds.
  const verify = (d: Dialog) => {
    const amount = Number(d.amount);
    const key = d.channel.PublicKey;
    if (!key || !/^\d+(\.\d+)?$/.test(d.amount.trim())) return false;
    if (!(amount > d.channel.claimedXrp) || amount > d.channel.amountXrp) return false;
    try {
      return verifyChannelClaim(d.channel.index, d.amount.trim(), d.signature, key);
    } catch {
      return false;
    }
  };

  // A pasted JSON claim bundle (from "Sign claim") fills the fields and is verified.
  const pasteBundle = (text: string) => {
    if (!dialog) return;
    const next = {...dialog, bundle: text};
    try {
      const data = JSON.parse(text);
      if (data.amount) next.amount = String(data.amount);
      if (data.signature) next.signature = data.signature;
      // A claim for another channel, or signed with another key, is never valid here.
      const otherChannel = data.channel && String(data.channel).toUpperCase() !== dialog.channel.index.toUpperCase();
      const otherKey = data.public_key && String(data.public_key).toUpperCase() !== (dialog.channel.PublicKey || '').toUpperCase();
      next.verified = otherChannel || otherKey ? false : verify(next);
    } catch {
      // not a bundle; keep manual entry
    }
    setDialog(next);
  };

  const redeem = async (close: boolean) => {
    if (!dialog || !verify(dialog)) return;
    const d = dialog;
    const hash = await tx.run('redeem', () => claimChannel({channel: d.channel.index, balance: d.amount.trim(), amount: d.amount.trim(), signature: d.signature, publicKey: d.channel.PublicKey, close}));
    if (hash) setDialog(null);
  };

  return (
    <>
      <PageHeader title="pay_channels" sub="channels_sub" loading={list.loading} onRefresh={() => void list.refresh()} />
      <LoadError error={list.error} />

      <div className="grid-main">
        <div className="stack">
          {list.items.map(c => (
            <div className="card" key={c.index}>
              <div className="card-header">
                <div className={`tx-icon ${c.outgoing ? 'tone-out' : 'tone-in'}`}><i className="fa fa-bolt" /></div>
                <div className="grow min-w-0">
                  <div className="card-title">{t(c.outgoing ? 'channel_to' : 'channel_from')} <span className="mono text-sm">{short(c.outgoing ? c.Destination : c.Account, 8, 6)}</span></div>
                  <div className="card-sub mono truncate">{c.index}</div>
                </div>
                {c.closing && !c.expired && <span className="badge badge-warning"><i className="fa fa-clock-o" /> {t('closing')}</span>}
                {c.expired && <span className="badge badge-danger">{t('expired')}</span>}
              </div>
              <div className="card-body stack-sm">
                <div className="between text-sm">
                  <span><span className="fw-700 num">{fmtNum(c.claimedXrp)}</span> <span className="text-faint">/ {fmtNum(c.amountXrp)} {code} {t('claimed')}</span></span>
                  <span className="text-faint">{fmtNum(c.remainingXrp)} {code} {t('remaining')}</span>
                </div>
                <div className="progress"><span style={{width: `${c.pct}%`}} /></div>
                <div className="cluster text-xs text-faint">
                  <span><i className="fa fa-clock-o" /> {t('settle_delay')} {fmtFixed(c.SettleDelay, 0)}s</span>
                  {c.Expiration && <span><i className="fa fa-hourglass-end" /> {t('expires')} {fmtDateTime(rippleTimeToMs(c.Expiration))}</span>}
                  {c.CancelAfter && <span><i className="fa fa-ban" /> {t('cancel_after')} {fmtDateTime(rippleTimeToMs(c.CancelAfter))}</span>}
                  {c.DestinationTag !== undefined && <span><i className="fa fa-tag" /> {c.DestinationTag}</span>}
                </div>
                <TxStatus state={tx.status[`close_${c.index}`]} />
              </div>
              <div className="card-footer">
                <button type="button" className="icon-btn sm" onClick={() => copy(c.index)} title={t('copy')}><i className="fa fa-clone" /></button>
                <span className="spacer" />
                {c.outgoing && <button type="button" className="btn btn-secondary btn-sm" onClick={() => open('sign', c)} disabled={readOnly}><i className="fa fa-pencil" /> {t('sign_claim')}</button>}
                {c.outgoing && <button type="button" className="btn btn-secondary btn-sm" onClick={() => open('fund', c)} disabled={readOnly}><i className="fa fa-plus" /> {t('fund')}</button>}
                {!c.outgoing && <button type="button" className="btn btn-soft btn-sm" onClick={() => open('redeem', c)} disabled={readOnly}><i className="fa fa-download" /> {t('redeem_claim')}</button>}
                <button type="button" className="btn btn-danger-soft btn-sm" onClick={() => void tx.run(`close_${c.index}`, () => claimChannel({channel: c.index, close: true}))} disabled={readOnly || tx.busy(`close_${c.index}`)}>
                  <i className="fa fa-times" /> {t('close_channel')}
                </button>
              </div>
            </div>
          ))}
          {list.loading && !list.items.length && <div className="loading-row"><span className="spinner" /> {t('loading')}</div>}
          {!list.loading && !list.items.length && (
            <div className="card empty">
              <div className="empty-icon"><i className="fa fa-bolt" /></div>
              <div className="empty-title">{t('no_channels')}</div>
              <div>{t('no_channels_desc')}</div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">{t('open_channel')}</div></div>
          <form className="card-body stack" onSubmit={submitCreate}>
            <div className="field">
              <label htmlFor="channel_destination">{t('recipient')}</label>
              <input id="channel_destination" className="input mono" value={form.destination} onChange={set('destination')} placeholder="r..." list="channel-contacts" />
              <ContactList id="channel-contacts" />
              {form.destination && !isValidAddress(form.destination) && <div className="form-error">{t('invalid_account')}</div>}
            </div>
            <div className="field">
              <label htmlFor="channel_amount">{t('amount')}</label>
              <div className="input-group"><input id="channel_amount" className="input" value={form.amount} onChange={set('amount')} placeholder="0.00" /><div className="addon">{code}</div></div>
              <div className="hint">{t('channel_amount_hint')}</div>
            </div>
            <div className="field">
              <label htmlFor="channel_delay">{t('settle_delay')}</label>
              <div className="input-group"><input id="channel_delay" className="input" type="number" min={0} value={form.settleDelay} onChange={set('settleDelay')} /><div className="addon">{t('seconds')}</div></div>
              <div className="hint">{t('settle_delay_hint')}</div>
            </div>
            <div className="field">
              <label htmlFor="channel_cancel">{t('cancel_after')}</label>
              <input id="channel_cancel" className="input" type="datetime-local" value={form.cancelAfter} onChange={set('cancelAfter')} />
            </div>
            <div className="field"><label htmlFor="channel_tag">{t('dest_tag')}</label><input id="channel_tag" className="input" value={form.destinationTag} onChange={set('destinationTag')} placeholder={t('optional')} /></div>
            <TxStatus state={tx.status.create} />
            <button className="btn btn-primary" type="submit" disabled={!formValid || tx.busy('create') || readOnly}><i className="fa fa-bolt" /> {t('open_channel')}</button>
          </form>
        </div>
      </div>

      {dialog && (
        <Modal
          title={t({fund: 'fund', sign: 'sign_claim', redeem: 'redeem_claim'}[dialog.type])}
          onClose={() => setDialog(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setDialog(null)}>{t('cancel')}</button>
              {dialog.type === 'fund' && <button type="button" className="btn btn-primary" onClick={() => void fund()} disabled={!(Number(dialog.amount) > 0) || tx.busy('fund')}><i className="fa fa-plus" /> {t('fund')}</button>}
              {dialog.type === 'redeem' && <button type="button" className="btn btn-secondary" onClick={() => void redeem(true)} disabled={dialog.verified !== true || tx.busy('redeem')}>{t('redeem_close')}</button>}
              {dialog.type === 'redeem' && <button type="button" className="btn btn-primary" onClick={() => void redeem(false)} disabled={dialog.verified !== true || tx.busy('redeem')}><i className="fa fa-download" /> {t('redeem_claim')}</button>}
            </>
          }
        >
          {dialog.type === 'fund' && (
            <>
              <div className="field">
                <label htmlFor="fund_amount">{t('amount')}</label>
                <div className="input-group"><input id="fund_amount" className="input" value={dialog.amount} onChange={e => update({amount: e.target.value})} placeholder="0.00" /><div className="addon">{code}</div></div>
              </div>
              <div className="field">
                <label htmlFor="fund_expiration">{t('new_expiration')}</label>
                <input id="fund_expiration" className="input" type="datetime-local" value={dialog.expiration} onChange={e => update({expiration: e.target.value})} />
                <div className="hint">{t('new_expiration_hint')}</div>
              </div>
              <TxStatus state={tx.status.fund} />
            </>
          )}

          {dialog.type === 'sign' && (
            <>
              <div className="alert alert-info"><i className="fa fa-info-circle" /><span>{t('sign_claim_hint')}</span></div>
              <div className="field">
                <label htmlFor="claim_amount">{t('total_amount')}</label>
                <div className="input-group"><input id="claim_amount" className="input" value={dialog.amount} onChange={e => update({amount: e.target.value, claim: ''})} placeholder="0.00" /><div className="addon">{code}</div></div>
                <div className="hint">{t('channel_capacity')}: {fmtNum(dialog.channel.amountXrp)} {code}</div>
              </div>
              <button type="button" className="btn btn-primary" onClick={signClaim} disabled={!(Number(dialog.amount) > 0) || Number(dialog.amount) > dialog.channel.amountXrp}>
                <i className="fa fa-pencil" /> {t('sign_claim')}
              </button>
              {dialog.claimError && <div className="text-danger text-sm">{dialog.claimError}</div>}
              {dialog.claim && (
                <div className="field">
                  <div className="label-row"><label>{t('claim')}</label><a className="btn btn-ghost btn-xs" onClick={() => copy(bundle)}><i className="fa fa-clone" /> {t('copy')}</a></div>
                  <pre className="mono claim-bundle">{bundle}</pre>
                </div>
              )}
            </>
          )}

          {dialog.type === 'redeem' && (
            <>
              <div className="field">
                <label htmlFor="claim_paste">{t('paste_claim')}</label>
                <textarea id="claim_paste" className="input mono" rows={3} value={dialog.bundle} onChange={e => pasteBundle(e.target.value)} placeholder='{"amount": "...", "signature": "...", "public_key": "..."}' />
              </div>
              <div className="field">
                <label htmlFor="redeem_amount">{t('total_amount')}</label>
                <div className="input-group"><input id="redeem_amount" className="input" value={dialog.amount} onChange={e => update({amount: e.target.value, verified: null})} /><div className="addon">{code}</div></div>
              </div>
              <div className="field"><label htmlFor="redeem_signature">{t('signature')}</label><input id="redeem_signature" className="input mono" value={dialog.signature} onChange={e => update({signature: e.target.value, verified: null})} /></div>
              <div className="field"><label htmlFor="redeem_key">{t('public_key')}</label><input id="redeem_key" className="input mono" value={dialog.channel.PublicKey || ''} readOnly /></div>
              <div className="cluster">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => update({verified: verify(dialog)})} disabled={!dialog.signature || !dialog.amount}><i className="fa fa-check-circle-o" /> {t('verify')}</button>
                {dialog.verified === true && <span className="badge badge-success"><i className="fa fa-check" /> {t('claim_valid')}</span>}
                {dialog.verified === false && <span className="badge badge-danger"><i className="fa fa-times" /> {t('claim_invalid')}</span>}
              </div>
              <TxStatus state={tx.status.redeem} />
            </>
          )}
        </Modal>
      )}
    </>
  );
}

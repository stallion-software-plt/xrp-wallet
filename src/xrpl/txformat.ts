// Turns ledger transactions into activity rows: a title, icon, tone, one-line summary, the
// amounts that moved for the account, and the detailed effects.
import BigNumber from 'bignumber.js';
import parser from 'ripple-lib-transactionparser';
import {AccountSetAsfFlags, dropsToXrp, getBalanceChanges, NFTokenCreateOfferFlags, OfferCreateFlags, PaymentChannelClaimFlags, type TransactionMetadata} from 'xrpl';
import {currencyLabel, fmtCode, fmtNum, hexToAscii, hexToText, rippleTimeToMs, round} from '../core/format';
import {findLookalike} from '../core/lookalike';
import type {Contact} from '../core/walletFile';
import {parseAmount, type Value} from './amounts';
import type {LedgerTx} from './normalize';

export const CATEGORIES = ['all', 'payments', 'trading', 'tokens', 'nfts', 'account'] as const;
export type Category = typeof CATEGORIES[number];
export type Tone = 'in' | 'out' | 'accent' | 'info' | 'muted' | 'danger';

export interface SignedAmount extends Value {
  sign: '+' | '-' | '';
}

export interface Effect {
  type: string;
  quantity?: Value;
  total?: Value;
  price?: string;
  amount?: Value;
  force?: boolean;
  filled?: boolean;
}

export interface TxRow {
  hash: string;
  date: number | null;
  /** Fee in drops. */
  fee: string;
  ledger_index?: number;
  tx_type: string;
  tx_result: string;
  success: boolean;
  initiator: string;
  mine: boolean;
  tag?: number;
  invoice?: string;
  title: string;
  icon: string;
  tone: Tone;
  category: Category;
  /** Translation key for the summary line, with its values. */
  sub: string | null;
  subValues: Record<string, string | number>;
  counterparty?: string;
  amounts: SignedAmount[];
  effects: Effect[];
  memos?: Array<{type?: string; format?: string; data?: string}>;
  message: string;
  /** Signs of address poisoning: a tiny payment from an unknown address, or a sender whose address
   *  imitates a contact ('' name) or the wallet's own address. */
  warning?: {kind: 'dust'} | {kind: 'lookalike'; name: string};
}

/** Incoming XRP payments below this (0.01 XRP) from unknown senders are flagged. */
const DUST_DROPS = 10000;

const asfNames: Record<number, string> = {};
for (const [name, value] of Object.entries(AccountSetAsfFlags)) {
  if (isNaN(Number(name))) asfNames[value as number] = name.replace(/^asf/, '');
}

interface Context {
  account: string;
  contacts: Contact[];
  nativeCode: string;
}

function fmt(amount: Value | null, ctx: Context): string {
  return amount ? `${fmtNum(amount.value)} ${currencyLabel(amount.currency, ctx.nativeCode)}` : '';
}

function shortId(id: string | undefined): string {
  return id ? id.substring(0, 8) + '…' + id.slice(-6) : '';
}

/** Contact name when known, otherwise a shortened address. */
export function label(address: string | undefined, contacts: Contact[]): string {
  if (!address) return '';
  const contact = contacts.find(c => c.address === address);
  return contact ? contact.name : address.substring(0, 7) + '…' + address.slice(-5);
}

function signed(amount: Value, sign: SignedAmount['sign']): SignedAmount {
  return {value: String(Math.abs(Number(amount.value))), currency: amount.currency, issuer: amount.issuer, sign};
}

function categoryOf(type: string): Category {
  if (type.startsWith('NFToken')) return 'nfts';
  if (/^(Offer|AMM)/.test(type)) return 'trading';
  if (/^(TrustSet|Clawback)$/.test(type)) return 'tokens';
  if (/^(Payment|Escrow|Check|AccountDelete)/.test(type)) return 'payments';
  return 'account';
}

function isFee(change: Value, tx: LedgerTx): boolean {
  return change.currency === 'XRP' && Number(change.value) === -Number(dropsToXrp(tx.Fee));
}

function describe(res: TxRow, tx: LedgerTx, meta: TransactionMetadata & Record<string, any>, changes: Value[], ctx: Context) {
  const {account} = ctx;
  const mine = tx.Account === account;
  const lbl = (a: string | undefined) => label(a, ctx.contacts);
  const set = (title: string, icon: string, tone: Tone, category: Category) => Object.assign(res, {title, icon, tone, category});
  const sub = (key: string, values: Record<string, string | number> = {}) => Object.assign(res, {sub: key, subValues: values});

  switch (tx.TransactionType) {
    case 'Payment': {
      const delivered = parseAmount(meta.delivered_amount ?? meta.DeliveredAmount ?? tx.Amount)!;
      if (mine && tx.Destination === account) {
        set('tx_swap', 'fa-exchange', 'accent', 'trading');
        const spent = changes.filter(c => Number(c.value) < 0 && !(c.currency === 'XRP' && isFee(c, tx)));
        res.amounts = [signed(delivered, '+'), ...spent.slice(0, 1).map(c => signed(c, '-'))];
      } else if (mine) {
        set('tx_sent', 'fa-arrow-up', 'out', 'payments');
        sub('tx_sub_to', {addr: lbl(tx.Destination)});
        res.counterparty = tx.Destination;
        res.amounts = [signed(delivered, '-')];
      } else if (tx.Destination === account) {
        set('tx_received', 'fa-arrow-down', 'in', 'payments');
        sub('tx_sub_from', {addr: lbl(tx.Account)});
        res.counterparty = tx.Account;
        res.amounts = [signed(delivered, '+')];
      } else if (res.effects.some(e => e.type === 'offer_bought' || e.type === 'offer_sold')) {
        set('tx_offer_filled', 'fa-line-chart', 'accent', 'trading');
      } else {
        set('rippling', 'fa-random', 'muted', 'tokens');
      }
      break;
    }
    case 'TrustSet': {
      const limit = tx.LimitAmount;
      if (mine) {
        set(limit.value === '0' ? 'tx_trust_removed' : 'tx_trust_set', 'fa-certificate', 'info', 'tokens');
        sub('tx_sub_trust', {currency: fmtCode(limit.currency), issuer: lbl(limit.issuer), limit: fmtNum(limit.value)});
        res.counterparty = limit.issuer;
      } else {
        set('tx_trust_incoming', 'fa-certificate', 'info', 'tokens');
        sub('tx_sub_trust_in', {addr: lbl(tx.Account), currency: fmtCode(limit.currency), limit: fmtNum(limit.value)});
        res.counterparty = tx.Account;
      }
      break;
    }
    case 'OfferCreate': {
      if (mine) {
        const sell = tx.Flags & OfferCreateFlags.tfSell;
        const gets = parseAmount(tx.TakerGets);
        const pays = parseAmount(tx.TakerPays);
        set(sell ? 'tx_offer_sell' : 'tx_offer_buy', 'fa-line-chart', 'accent', 'trading');
        sub('tx_sub_offer', sell ? {a: fmt(gets, ctx), b: fmt(pays, ctx)} : {a: fmt(pays, ctx), b: fmt(gets, ctx)});
      } else {
        set('tx_offer_filled', 'fa-line-chart', 'accent', 'trading');
      }
      break;
    }
    case 'OfferCancel':
      set('tx_offer_cancel', 'fa-times-circle', 'muted', 'trading');
      sub('tx_sub_seq', {seq: tx.OfferSequence});
      break;
    case 'AccountSet': {
      set('tx_account_set', 'fa-sliders', 'muted', 'account');
      const parts: string[] = [];
      if (tx.SetFlag !== undefined) parts.push('+' + (asfNames[tx.SetFlag] || tx.SetFlag));
      if (tx.ClearFlag !== undefined) parts.push('−' + (asfNames[tx.ClearFlag] || tx.ClearFlag));
      if (tx.Domain !== undefined) parts.push('Domain: ' + (tx.Domain ? hexToAscii(tx.Domain) : '—'));
      if (tx.TransferRate !== undefined) parts.push('TransferRate: ' + (tx.TransferRate ? round((tx.TransferRate / 1e9 - 1) * 100, 4) + '%' : '0'));
      if (tx.TickSize !== undefined) parts.push('TickSize: ' + tx.TickSize);
      if (tx.MessageKey !== undefined) parts.push('MessageKey');
      if (tx.NFTokenMinter !== undefined) parts.push('NFTokenMinter: ' + lbl(tx.NFTokenMinter));
      if (parts.length) sub('tx_sub_plain', {text: parts.join(' · ')});
      break;
    }
    case 'SetRegularKey':
      set('tx_set_regular_key', 'fa-key', 'muted', 'account');
      sub('tx_sub_plain', {text: tx.RegularKey ? lbl(tx.RegularKey) : '—'});
      break;
    case 'SignerListSet':
      set('tx_signer_list', 'fa-users', 'muted', 'account');
      sub('tx_sub_signers', {quorum: tx.SignerQuorum, count: (tx.SignerEntries || []).length});
      break;
    case 'DepositPreauth':
      set('tx_deposit_preauth', 'fa-user-plus', 'muted', 'account');
      sub('tx_sub_plain', {text: tx.Authorize ? '+ ' + lbl(tx.Authorize) : '− ' + lbl(tx.Unauthorize)});
      break;
    case 'TicketCreate':
      set('tx_ticket_create', 'fa-ticket', 'muted', 'account');
      sub('tx_sub_count', {count: tx.TicketCount});
      break;
    case 'AccountDelete':
      if (mine) {
        set('tx_account_delete', 'fa-trash', 'out', 'account');
        sub('tx_sub_to', {addr: lbl(tx.Destination)});
      } else {
        set('tx_received', 'fa-arrow-down', 'in', 'payments');
        sub('tx_sub_from', {addr: lbl(tx.Account)});
        if (meta.delivered_amount) res.amounts = [signed(parseAmount(meta.delivered_amount)!, '+')];
      }
      res.counterparty = mine ? tx.Destination : tx.Account;
      break;
    case 'EscrowCreate': {
      const amount = parseAmount(tx.Amount)!;
      if (mine) {
        set('tx_escrow_create', 'fa-hourglass-start', 'out', 'payments');
        sub('tx_sub_to', {addr: lbl(tx.Destination)});
        res.amounts = [signed(amount, '-')];
      } else {
        set('tx_escrow_incoming', 'fa-hourglass-start', 'info', 'payments');
        sub('tx_sub_from', {addr: lbl(tx.Account)});
        res.amounts = [signed(amount, '')];
      }
      break;
    }
    case 'EscrowFinish':
      set('tx_escrow_finish', 'fa-hourglass-end', changes.some(c => Number(c.value) > 0) ? 'in' : 'muted', 'payments');
      sub('tx_sub_owner', {addr: lbl(tx.Owner)});
      break;
    case 'EscrowCancel':
      set('tx_escrow_cancel', 'fa-undo', 'muted', 'payments');
      sub('tx_sub_owner', {addr: lbl(tx.Owner)});
      break;
    case 'CheckCreate': {
      const amount = parseAmount(tx.SendMax)!;
      if (mine) {
        set('tx_check_create', 'fa-money', 'info', 'payments');
        sub('tx_sub_to', {addr: lbl(tx.Destination)});
      } else {
        set('tx_check_incoming', 'fa-money', 'info', 'payments');
        sub('tx_sub_from', {addr: lbl(tx.Account)});
      }
      res.amounts = [signed(amount, '')];
      break;
    }
    case 'CheckCash':
      set('tx_check_cash', 'fa-money', mine ? 'in' : 'out', 'payments');
      break;
    case 'CheckCancel':
      set('tx_check_cancel', 'fa-ban', 'muted', 'payments');
      break;
    case 'PaymentChannelCreate': {
      const amount = parseAmount(tx.Amount)!;
      if (mine) {
        set('tx_channel_create', 'fa-bolt', 'out', 'payments');
        sub('tx_sub_to', {addr: lbl(tx.Destination)});
        res.amounts = [signed(amount, '-')];
      } else {
        set('tx_channel_incoming', 'fa-bolt', 'info', 'payments');
        sub('tx_sub_from', {addr: lbl(tx.Account)});
        res.amounts = [signed(amount, '')];
      }
      break;
    }
    case 'PaymentChannelFund':
      set('tx_channel_fund', 'fa-bolt', 'out', 'payments');
      res.amounts = [signed(parseAmount(tx.Amount)!, '-')];
      break;
    case 'PaymentChannelClaim':
      set('tx_channel_claim', 'fa-bolt', 'accent', 'payments');
      if (tx.Flags & PaymentChannelClaimFlags.tfClose) sub('tx_sub_channel_close');
      break;
    case 'NFTokenMint':
      set('tx_nft_mint', 'fa-picture-o', 'accent', 'nfts');
      sub('tx_sub_nft', {id: meta.nftoken_id ? shortId(meta.nftoken_id) : 'taxon ' + tx.NFTokenTaxon});
      break;
    case 'NFTokenBurn':
      set('tx_nft_burn', 'fa-fire', 'out', 'nfts');
      sub('tx_sub_nft', {id: shortId(tx.NFTokenID)});
      break;
    case 'NFTokenCreateOffer': {
      const sell = tx.Flags & NFTokenCreateOfferFlags.tfSellNFToken;
      set(mine ? (sell ? 'tx_nft_sell_offer' : 'tx_nft_buy_offer') : 'tx_nft_offer_incoming', 'fa-tag', mine ? 'accent' : 'info', 'nfts');
      sub('tx_sub_nft_offer', {id: shortId(tx.NFTokenID), amount: fmt(parseAmount(tx.Amount), ctx)});
      break;
    }
    case 'NFTokenCancelOffer':
      set('tx_nft_offer_cancel', 'fa-times-circle', 'muted', 'nfts');
      sub('tx_sub_count', {count: (tx.NFTokenOffers || []).length});
      break;
    case 'NFTokenAcceptOffer':
      set('tx_nft_trade', 'fa-handshake-o', 'accent', 'nfts');
      break;
    case 'AMMCreate':
    case 'AMMDeposit':
    case 'AMMWithdraw':
    case 'AMMVote':
    case 'AMMBid':
    case 'AMMDelete':
      set('tx_' + tx.TransactionType, 'fa-tint', 'accent', 'trading');
      break;
    case 'Clawback':
      if (mine) {
        set('tx_clawback', 'fa-gavel', 'info', 'tokens');
        sub('tx_sub_from', {addr: lbl(tx.Amount?.issuer)});
      } else {
        set('tx_clawed_back', 'fa-gavel', 'out', 'tokens');
        sub('tx_sub_from', {addr: lbl(tx.Account)});
      }
      break;
    case 'DIDSet':
      set('tx_did_set', 'fa-id-card-o', 'muted', 'account');
      break;
    case 'DIDDelete':
      set('tx_did_delete', 'fa-id-card-o', 'muted', 'account');
      break;
    default:
      set('tx_other', 'fa-circle-o', 'muted', categoryOf(tx.TransactionType));
      sub('tx_sub_plain', {text: tx.TransactionType});
  }
}

/** Signs of address poisoning in a transaction someone else sent. */
function poisoningWarning(tx: LedgerTx, meta: TransactionMetadata & Record<string, any>, ctx: Context): TxRow['warning'] {
  const {account, contacts} = ctx;
  if (tx.Account === account) return undefined;
  const lookalike = findLookalike(tx.Account, [{name: '', address: account}, ...contacts.map(c => ({name: c.name, address: c.address}))]);
  if (lookalike) return {kind: 'lookalike', name: lookalike.name};
  if (tx.TransactionType === 'Payment' && tx.Destination === account && !contacts.some(c => c.address === tx.Account)) {
    const delivered = meta.delivered_amount ?? tx.Amount;
    if (typeof delivered === 'string' && Number(delivered) < DUST_DROPS) return {kind: 'dust'};
  }
  return undefined;
}

function orderbookEffects(meta: TransactionMetadata, address: string, tx: LedgerTx): Effect[] {
  const effects: Effect[] = [];
  const changes = parser.parseOrderbookChanges(meta) as Record<string, any[]>;
  for (const account of Object.keys(changes)) {
    for (const order of changes[account]) {
      const e: Effect = {type: ''};
      if (account === address) {
        switch (order.status) {
          case 'cancelled':
            e.type = 'offer_cancel_' + order.direction;
            e.force = address !== tx.Account;
            break;
          case 'filled':
            e.filled = true;
            e.type = order.direction === 'buy' ? 'offer_bought' : 'offer_sold';
            break;
          case 'partially-filled':
            e.type = order.direction === 'buy' ? 'offer_bought' : 'offer_sold';
            break;
          case 'created':
            e.type = 'offer_create_' + order.direction;
            break;
        }
      } else if ((order.status === 'filled' || order.status === 'partially-filled') && address === tx.Account) {
        e.type = order.direction === 'sell' ? 'offer_bought' : 'offer_sold';
      }
      if (!e.type) continue;
      e.quantity = order.quantity;
      e.total = order.totalPrice;
      e.price = new BigNumber(order.totalPrice.value).dividedBy(order.quantity.value).toString(10);
      effects.push(e);
    }
  }
  return effects;
}

function parseMemos(tx: LedgerTx): TxRow['memos'] {
  if (!Array.isArray(tx.Memos) || tx.Memos.length === 0) return undefined;
  return tx.Memos.map((m: {Memo: Record<string, string>}) => ({
    type: hexToText(m.Memo.MemoType),
    format: hexToText(m.Memo.MemoFormat),
    data: hexToText(m.Memo.MemoData)
  }));
}

/** The activity row for a transaction, from the point of view of `account`. */
export function processTx(tx: LedgerTx, meta: TransactionMetadata, ctx: Context): TxRow {
  const {account} = ctx;
  const result = typeof meta === 'object' ? meta.TransactionResult : 'unknown';
  const res: TxRow = {
    hash: tx.hash,
    date: rippleTimeToMs(tx.date),
    fee: tx.Fee,
    ledger_index: tx.ledger_index,
    tx_type: tx.TransactionType,
    tx_result: result,
    success: result === 'tesSUCCESS',
    initiator: tx.Account,
    mine: tx.Account === account,
    tag: tx.DestinationTag,
    invoice: tx.InvoiceID,
    title: '',
    icon: '',
    tone: 'muted',
    category: 'account',
    sub: null,
    subValues: {},
    amounts: [],
    effects: [],
    message: ''
  };
  res.memos = parseMemos(tx);
  res.message = (res.memos || []).filter(m => m.data && m.type !== 'client').map(m => m.data).join('\n');

  let changes: Value[] = [];
  try {
    const mineChanges = getBalanceChanges(meta).find(c => c.account === account);
    changes = (mineChanges?.balances || []).map(b => ({currency: b.currency, issuer: b.issuer, value: b.value}));
  } catch (e) {
    console.warn('Balance changes unavailable', tx.hash, e);
  }
  try {
    res.effects = orderbookEffects(meta, account, tx);
  } catch (e) {
    console.warn('Order book changes unavailable', tx.hash, e);
  }
  changes.forEach(c => res.effects.push({type: 'balance_change', amount: c}));

  if (!res.success) {
    Object.assign(res, {title: 'tx_failed', icon: 'fa-exclamation-triangle', tone: 'danger', category: categoryOf(tx.TransactionType)});
    Object.assign(res, {sub: 'tx_sub_failed', subValues: {type: tx.TransactionType, code: result}});
    return res;
  }

  describe(res, tx, meta as TransactionMetadata & Record<string, any>, changes, ctx);
  res.warning = poisoningWarning(tx, meta as TransactionMetadata & Record<string, any>, ctx);

  // Fall back to the account's balance changes, skipping a change that is only the fee.
  if (!res.amounts.length) {
    changes.filter(c => !(tx.Account === account && isFee(c, tx))).slice(0, 2).forEach(c => {
      res.amounts.push(signed(c, Number(c.value) < 0 ? '-' : '+'));
    });
  }
  return res;
}

// Ledger queries and transactions. Transactions are autofilled, signed locally with the open
// wallet and submitted; nothing identifying this app is added to them.
import BigNumber from 'bignumber.js';
import {
  AccountSetAsfFlags, AMMDepositFlags, AMMWithdrawFlags, convertStringToHex, dropsToXrp, NFTokenCreateOfferFlags,
  OfferCreateFlags, PaymentChannelClaimFlags, TrustSetFlags, verifyPaymentChannelClaim,
  type Amount, type LedgerEntry, type Path, type SubmittableTransaction
} from 'xrpl';
import {hexToAscii, realCode, round, textToHex, toRippleTime} from '../core/format';
import {emit} from '../core/events';
import * as session from '../core/session';
import {useApp} from '../state/app';
import {parseAmount, toAmount, toAsset, toLedgerAmount, isXrp, type Value} from './amounts';
import {getMaxFee} from '../core/settings';
import {getClient} from './connection';
import {checkFee, checkPrepared} from './signGuard';
import {normalizeTx, type LedgerTx, type TxEntry} from './normalize';

type Tx = Record<string, any> & {TransactionType: string};
type AccountRoot = LedgerEntry.AccountRoot;

const MAX_VERIFY_ATTEMPTS = 180;
const lsfSell = 0x00020000;

/** AccountRoot flags (lsf*), keyed by the AccountSet flag (asf*) that toggles them. */
export const ACCOUNT_FLAGS = {
  asfRequireDest: 0x00020000,
  asfRequireAuth: 0x00040000,
  asfDisallowXRP: 0x00080000,
  asfDisableMaster: 0x00100000,
  asfNoFreeze: 0x00200000,
  asfGlobalFreeze: 0x00400000,
  asfDefaultRipple: 0x00800000,
  asfDepositAuth: 0x01000000,
  asfDisallowIncomingNFTokenOffer: 0x04000000,
  asfDisallowIncomingCheck: 0x08000000,
  asfDisallowIncomingPayChan: 0x10000000,
  asfDisallowIncomingTrustline: 0x20000000,
  asfAllowTrustLineClawback: 0x80000000
} as const;

export type AccountFlag = keyof typeof ACCOUNT_FLAGS;
export type AccountFlags = Record<AccountFlag, boolean>;

export function flagsFromBitmask(value: number | undefined): AccountFlags {
  const result = {} as AccountFlags;
  for (const name of Object.keys(ACCOUNT_FLAGS) as AccountFlag[]) {
    result[name] = ((value || 0) & ACCOUNT_FLAGS[name]) >>> 0 !== 0;
  }
  return result;
}

export function isNotFound(err: unknown, code = 'actNotFound'): boolean {
  return (err as {data?: {error?: string}})?.data?.error === code;
}

/** A readable message for a failed request or transaction. */
export function errorMessage(err: unknown): string {
  const e = err as {data?: {error_message?: string; error?: string}; message?: string};
  return e?.data?.error_message || e?.data?.error || e?.message || String(err);
}

export async function request<T = any>(req: Record<string, unknown>): Promise<T> {
  const client = await getClient();
  const response = await client.request(req as any);
  return response.result as T;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Polls until the transaction is validated or can no longer be included in a ledger. */
async function verify(hash: string, minLedger: number, maxLedger: number, type: string): Promise<void> {
  const client = await getClient();
  for (let attempt = 0; attempt <= MAX_VERIFY_ATTEMPTS; attempt++) {
    await sleep(2000);
    let latest = 0;
    try {
      latest = await client.getLedgerIndex();
      const response = await client.request({command: 'tx', transaction: hash, min_ledger: minLedger, max_ledger: maxLedger});
      if (response.result.validated) {
        const meta = response.result.meta;
        const code = typeof meta === 'object' ? meta.TransactionResult : 'unknown';
        if (code === 'tesSUCCESS') {
          emit('txSuccess', {hash, type});
        } else {
          emit('txFail', {hash, type, message: code});
        }
        return;
      }
    } catch (err) {
      if (latest > maxLedger || attempt >= MAX_VERIFY_ATTEMPTS) {
        emit('txFail', {hash, type, message: errorMessage(err)});
        return;
      }
    }
  }
  emit('txFail', {hash, type, message: 'Not validated'});
}

/** Autofills, signs and submits. Resolves with the hash once accepted; validation is reported
 *  through the txSuccess / txFail events. */
export async function submit(tx: Tx): Promise<string> {
  const client = await getClient();
  const account = session.address();
  if (!account) throw new Error('No wallet is open.');
  tx.Account = tx.Account || account;
  try {
    const ledger = await client.getLedgerIndex();
    const original = structuredClone(tx);
    const prepared = await client.autofill(tx as SubmittableTransaction);
    checkPrepared(original, prepared as unknown as Record<string, unknown>, ledger);
    checkFee(prepared, {maxFeeXRP: getMaxFee(), reserveIncXRP: useApp.getState().reserveInc});
    const {tx_blob, hash} = session.sign(prepared);
    const response = await client.submit(tx_blob, {failHard: true});
    const engine = response.result.engine_result;
    if (engine !== 'tesSUCCESS' && engine !== 'terQUEUED') {
      const message = response.result.engine_result_message;
      const error = new Error(message ? `${message} (${engine})` : engine) as Error & {code?: string};
      error.code = engine;
      throw error;
    }
    emit('txSubmitted', {hash, type: tx.TransactionType});
    void verify(hash, ledger, prepared.LastLedgerSequence ?? ledger + 20, tx.TransactionType);
    return hash;
  } catch (err) {
    console.error(tx.TransactionType, err);
    throw err;
  }
}

/* ------------------------------------------------------------------ Queries */

export interface AccountInfo {
  data: AccountRoot;
  flags: AccountFlags;
  signerList: {SignerQuorum: number; SignerEntries: Array<{SignerEntry: {Account: string; SignerWeight: number}}>} | null;
  domain: string;
  regularKey: string;
  /** Transfer fee in percent. */
  transferRate: number;
  tickSize: number;
  nftMinter: string;
}

export async function getAccountInfo(address = session.address()!): Promise<AccountInfo> {
  const result = await request({command: 'account_info', account: address, ledger_index: 'validated', signer_lists: true});
  const data = result.account_data as AccountRoot & {signer_lists?: unknown[]};
  const signerLists = (result.signer_lists || data.signer_lists || []) as AccountInfo['signerList'][];
  return {
    data,
    flags: flagsFromBitmask(data.Flags),
    signerList: signerLists[0] || null,
    domain: data.Domain ? hexToAscii(data.Domain) : '',
    regularKey: data.RegularKey || '',
    transferRate: data.TransferRate ? round((data.TransferRate / 1e9 - 1) * 100, 7) : 0,
    tickSize: data.TickSize || 0,
    nftMinter: (data as {NFTokenMinter?: string}).NFTokenMinter || ''
  };
}

/** Settings of another account that matter when paying it. */
export async function checkSettings(address: string) {
  const info = await getAccountInfo(address);
  return {
    domain: info.domain || null,
    disallowIncomingXRP: info.flags.asfDisallowXRP,
    requireDestinationTag: info.flags.asfRequireDest,
    defaultRipple: info.flags.asfDefaultRipple,
    depositAuth: info.flags.asfDepositAuth
  };
}

export async function checkCurrencies(address: string): Promise<{send_currencies: string[]; receive_currencies: string[]}> {
  return request({command: 'account_currencies', account: address, ledger_index: 'validated'});
}

export async function getAccountObjects(type?: string, address = session.address()!): Promise<any[]> {
  let marker: unknown;
  let objects: any[] = [];
  do {
    const req: Record<string, unknown> = {command: 'account_objects', account: address, ledger_index: 'validated', limit: 400};
    if (type) req.type = type;
    if (marker) req.marker = marker;
    const result = await request(req);
    objects = objects.concat(result.account_objects || []);
    marker = result.marker;
  } while (marker && objects.length < 4000);
  return objects;
}

export async function getTx(hash: string): Promise<LedgerTx & {meta: TxEntry['meta']}> {
  const result = await request({command: 'tx', transaction: hash});
  const {tx, meta} = normalizeTx(result);
  return {...tx, meta};
}

export interface Offer {
  seq: number;
  flags: number;
  type: 'buy' | 'sell';
  quantity: Value;
  total: Value;
  price: string;
  taker_gets: Amount;
  taker_pays: Amount;
}

export async function getOffers(address = session.address()!): Promise<Offer[]> {
  const result = await request({command: 'account_offers', account: address, ledger_index: 'validated'});
  return (result.offers as any[]).map(offer => {
    const type = offer.flags & lsfSell ? 'sell' : 'buy';
    const quantity = parseAmount(type === 'sell' ? offer.taker_gets : offer.taker_pays)!;
    const total = parseAmount(type === 'sell' ? offer.taker_pays : offer.taker_gets)!;
    return {...offer, type, quantity, total, price: new BigNumber(total.value).dividedBy(quantity.value).toString(10)};
  });
}

/** A page of account history, newest first. */
export async function getTransactions(marker?: unknown, limit = 30, address = session.address()!): Promise<{marker: unknown; transactions: TxEntry[]}> {
  try {
    const params: Record<string, unknown> = {command: 'account_tx', account: address, ledger_index_min: -1, ledger_index_max: -1, limit, binary: false};
    if (marker) params.marker = marker;
    const result = await request(params);
    return {marker: result.marker, transactions: (result.transactions as any[]).map(normalizeTx)};
  } catch (err) {
    if (isNotFound(err)) return {marker: null, transactions: []};
    throw err;
  }
}

export interface AmmInfo {
  account: string;
  amount: Value;
  amount2: Value;
  lp_token: {currency: string; issuer: string; value: string};
  trading_fee: number;
  vote_slots?: Array<{account: string; trading_fee: number; vote_weight: number}>;
  auction_slot?: {account: string; expiration: string; price: {currency: string; issuer: string; value: string}; discounted_fee: number; auth_accounts?: Array<{account: string}>};
  [field: string]: unknown;
}

export async function getAmm(asset1: {currency: string; issuer?: string}, asset2: {currency: string; issuer?: string}): Promise<AmmInfo | null> {
  try {
    const result = await request({
      command: 'amm_info',
      asset: toAsset(asset1.currency, asset1.issuer),
      asset2: toAsset(asset2.currency, asset2.issuer),
      ledger_index: 'validated'
    });
    const info = result.amm;
    return {...info, amount: parseAmount(info.amount)!, amount2: parseAmount(info.amount2)!};
  } catch (err) {
    if (!isNotFound(err)) console.error('amm_info', err);
    return null;
  }
}

export async function getNFTs(address = session.address()!): Promise<any[]> {
  let marker: unknown;
  let nfts: any[] = [];
  do {
    const req: Record<string, unknown> = {command: 'account_nfts', account: address, ledger_index: 'validated', limit: 400};
    if (marker) req.marker = marker;
    const result = await request(req);
    nfts = nfts.concat(result.account_nfts || []);
    marker = result.marker;
  } while (marker && nfts.length < 4000);
  return nfts;
}

export async function getNFTOffers(nftId: string): Promise<{sell: any[]; buy: any[]}> {
  const load = async (command: string) => {
    try {
      const result = await request({command, nft_id: nftId, ledger_index: 'validated'});
      return result.offers || [];
    } catch (err) {
      if (isNotFound(err, 'objectNotFound')) return [];
      throw err;
    }
  };
  const [sell, buy] = await Promise.all([load('nft_sell_offers'), load('nft_buy_offers')]);
  return {sell, buy};
}

/** Escrows the account created or receives. The creating sequence number (needed to finish or
 *  cancel) isn't stored in the escrow object, so it's read from the creating transaction. */
export async function getEscrows(): Promise<any[]> {
  const escrows = await getAccountObjects('escrow');
  await Promise.all(escrows.map(async escrow => {
    try {
      const tx = await getTx(escrow.PreviousTxnID);
      if (tx.TransactionType === 'EscrowCreate') escrow.sequence = tx.Sequence || tx.TicketSequence;
    } catch (e) {
      console.warn('Cannot resolve escrow sequence', escrow.index, e);
    }
  }));
  return escrows;
}

export const getChecks = () => getAccountObjects('check');
export const getChannels = () => getAccountObjects('payment_channel');
export const getTickets = () => getAccountObjects('ticket');
export const getDepositPreauths = () => getAccountObjects('deposit_preauth');
export const getNFTOffersCreated = () => getAccountObjects('nft_offer');

export async function getDID(): Promise<any | null> {
  const objects = await getAccountObjects('did');
  return objects[0] || null;
}

export async function fundFromFaucet(): Promise<unknown> {
  const faucet = useApp.getState().network.faucet;
  if (!faucet) throw new Error('No faucet for this network.');
  const response = await fetch(faucet, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({destination: session.address()})
  });
  if (!response.ok) throw new Error(`Faucet error: ${response.status} ${response.statusText}`);
  return response.json();
}

/* ------------------------------------------------------------------ Account settings */

export function accountSet(fields: Record<string, unknown>) {
  return submit({TransactionType: 'AccountSet', ...fields});
}

export function setDomain(domain: string) {
  return accountSet({Domain: domain ? convertStringToHex(domain) : ''});
}

export function setMessageKey(key: string) {
  return accountSet({MessageKey: key || ''});
}

export function setFlag(name: AccountFlag | 'asfAuthorizedNFTokenMinter' | 'asfAccountTxnID', on: boolean) {
  const flag = AccountSetAsfFlags[name as keyof typeof AccountSetAsfFlags];
  return accountSet(on ? {SetFlag: flag} : {ClearFlag: flag});
}

/** Fee (0 to 100 percent) charged when others transfer tokens this account issues. */
export function setTransferRate(percent: number | string) {
  const pct = Number(percent) || 0;
  return accountSet({TransferRate: pct ? Math.round((1 + pct / 100) * 1e9) : 0});
}

export function setTickSize(size: number | string) {
  return accountSet({TickSize: Number(size) || 0});
}

export function setNFTokenMinter(address: string) {
  if (address) return accountSet({NFTokenMinter: address, SetFlag: AccountSetAsfFlags.asfAuthorizedNFTokenMinter});
  return accountSet({ClearFlag: AccountSetAsfFlags.asfAuthorizedNFTokenMinter});
}

export function setRegularKey(address: string) {
  const tx: Tx = {TransactionType: 'SetRegularKey'};
  if (address) tx.RegularKey = address;
  return submit(tx);
}

/** Quorum 0 with no entries deletes the signer list. */
export function setSignerList(quorum: number | string, entries: Array<{account: string; weight: number | string}>) {
  const tx: Tx = {TransactionType: 'SignerListSet', SignerQuorum: Number(quorum) || 0};
  if (tx.SignerQuorum > 0) {
    tx.SignerEntries = entries.map(e => ({SignerEntry: {Account: e.account, SignerWeight: Number(e.weight)}}));
  }
  return submit(tx);
}

export function depositPreauth(address: string, authorize: boolean) {
  return submit({TransactionType: 'DepositPreauth', [authorize ? 'Authorize' : 'Unauthorize']: address});
}

export function createTickets(count: number | string) {
  return submit({TransactionType: 'TicketCreate', TicketCount: Number(count)});
}

export function setDID(did: {uri?: string | null; data?: string | null; document?: string | null}) {
  const tx: Tx = {TransactionType: 'DIDSet'};
  const names = {uri: 'URI', data: 'Data', document: 'DIDDocument'} as const;
  for (const field of Object.keys(names) as Array<keyof typeof names>) {
    const value = did[field];
    if (value !== undefined && value !== null) tx[names[field]] = value ? convertStringToHex(value) : '';
  }
  return submit(tx);
}

export function deleteDID() {
  return submit({TransactionType: 'DIDDelete'});
}

/** The issuer claws back `value` of its token `code` from `holder`. */
export function clawback(code: string, holder: string, value: string | number) {
  return submit({TransactionType: 'Clawback', Amount: {currency: realCode(code), issuer: holder, value: String(value)}});
}

export function deleteAccount(destination: string, tag?: string | number) {
  const tx: Tx = {TransactionType: 'AccountDelete', Destination: destination};
  if (tag) tx.DestinationTag = Number(tag);
  return submit(tx);
}

/* ------------------------------------------------------------------ Payments, trust lines and the DEX */

export function changeTrust(code: string, issuer: string, limit: string) {
  return submit({
    TransactionType: 'TrustSet',
    LimitAmount: {currency: realCode(code), issuer, value: limit},
    Flags: TrustSetFlags.tfSetNoRipple
  });
}

export interface Memo {
  type?: string;
  format?: string;
  data: string;
}

function convertMemos(memos: Memo[]) {
  return memos.map(item => {
    const memo: Record<string, string> = {MemoData: textToHex(item.data)};
    if (item.type) memo.MemoType = textToHex(item.type);
    if (item.format) memo.MemoFormat = textToHex(item.format);
    return {Memo: memo};
  });
}

export function payment(opts: {
  destination: string;
  source: Value;
  delivered: Value;
  tag?: string | number | null;
  invoice?: string | null;
  memos?: Memo[];
  paths?: Path[];
}) {
  const tx: Tx = {TransactionType: 'Payment', Destination: opts.destination, Amount: toLedgerAmount(opts.delivered)};
  if (!isXrp(opts.source) || !isXrp(opts.delivered)) tx.SendMax = toLedgerAmount(opts.source);
  if (opts.paths?.length) tx.Paths = opts.paths;
  if (opts.tag !== undefined && opts.tag !== null && opts.tag !== '') tx.DestinationTag = Number(opts.tag);
  if (opts.invoice) tx.InvoiceID = opts.invoice;
  if (opts.memos?.length) tx.Memos = convertMemos(opts.memos);
  return submit(tx);
}

/** Pays yourself across currencies (a swap). */
export function convert(source: Value, delivered: Value, paths?: Path[]) {
  return payment({destination: session.address()!, source, delivered, paths});
}

export function offer(opts: {type: 'buy' | 'sell'; amount: string; price: string; base: string; base_issuer?: string; counter: string; counter_issuer?: string}) {
  const total = new BigNumber(opts.amount).multipliedBy(opts.price).toString(10);
  const quantity: Value = opts.base_issuer ? {currency: opts.base, issuer: opts.base_issuer, value: opts.amount} : {currency: 'XRP', value: opts.amount};
  const totalValue: Value = opts.counter_issuer ? {currency: opts.counter, issuer: opts.counter_issuer, value: total} : {currency: 'XRP', value: total};
  const sell = opts.type === 'sell';
  return submit({
    TransactionType: 'OfferCreate',
    Flags: sell ? OfferCreateFlags.tfSell : 0,
    TakerGets: toLedgerAmount(sell ? quantity : totalValue),
    TakerPays: toLedgerAmount(sell ? totalValue : quantity)
  });
}

export function cancelOffer(sequence: number) {
  return submit({TransactionType: 'OfferCancel', OfferSequence: sequence});
}

/* ------------------------------------------------------------------ AMM */

type AssetRef = {currency: string; issuer?: string};

function assets(a: AssetRef, b: AssetRef) {
  return {Asset: toAsset(a.currency, a.issuer), Asset2: toAsset(b.currency, b.issuer)};
}

export function ammDeposit(amount1: Value, amount2: Value) {
  return submit({TransactionType: 'AMMDeposit', ...assets(amount1, amount2), Amount: toLedgerAmount(amount1), Amount2: toLedgerAmount(amount2), Flags: AMMDepositFlags.tfTwoAsset});
}

/** Deposits one pool asset only. */
export function ammDepositSingle(asset1: AssetRef, asset2: AssetRef, amount: Value) {
  return submit({TransactionType: 'AMMDeposit', ...assets(asset1, asset2), Amount: toLedgerAmount(amount), Flags: AMMDepositFlags.tfSingleAsset});
}

export function ammWithdraw(asset1: AssetRef, asset2: AssetRef, lpAmount: Value | null, withdrawAll = false) {
  const tx: Tx = {TransactionType: 'AMMWithdraw', ...assets(asset1, asset2)};
  if (withdrawAll || !lpAmount) {
    tx.Flags = AMMWithdrawFlags.tfWithdrawAll;
  } else {
    tx.Flags = AMMWithdrawFlags.tfLPToken;
    tx.LPTokenIn = toLedgerAmount(lpAmount);
  }
  return submit(tx);
}

/** Trading fee in units of 1/100,000 (1000 = 1%). */
export function ammVote(asset1: AssetRef, asset2: AssetRef, fee: number | string) {
  return submit({TransactionType: 'AMMVote', ...assets(asset1, asset2), TradingFee: parseInt(String(fee), 10)});
}

/** feePct: 0 to 1 (%). */
export function ammCreate(amount1: Value, amount2: Value, feePct: number | string) {
  return submit({TransactionType: 'AMMCreate', Amount: toLedgerAmount(amount1), Amount2: toLedgerAmount(amount2), TradingFee: Math.round(Number(feePct) * 1000)});
}

/** Bids LP tokens for the pool's 24-hour discounted-fee auction slot. */
export function ammBid(asset1: AssetRef, asset2: AssetRef, lpToken: {currency: string; issuer: string}, bidMin?: string, bidMax?: string, authAccounts: string[] = []) {
  const tx: Tx = {TransactionType: 'AMMBid', ...assets(asset1, asset2)};
  if (bidMin) tx.BidMin = {currency: lpToken.currency, issuer: lpToken.issuer, value: String(bidMin)};
  if (bidMax) tx.BidMax = {currency: lpToken.currency, issuer: lpToken.issuer, value: String(bidMax)};
  if (authAccounts.length) tx.AuthAccounts = authAccounts.map(a => ({AuthAccount: {Account: a}}));
  return submit(tx);
}

export function ammDelete(asset1: AssetRef, asset2: AssetRef) {
  return submit({TransactionType: 'AMMDelete', ...assets(asset1, asset2)});
}

/* ------------------------------------------------------------------ Escrow, checks and payment channels */

type DateInput = string | Date | number | null | undefined;

export function createEscrow(opts: {destination: string; amount: string; finishAfter?: DateInput; cancelAfter?: DateInput; condition?: string; destinationTag?: string | number}) {
  const tx: Tx = {TransactionType: 'EscrowCreate', Destination: opts.destination, Amount: toAmount(opts.amount)};
  if (opts.finishAfter) tx.FinishAfter = toRippleTime(opts.finishAfter);
  if (opts.cancelAfter) tx.CancelAfter = toRippleTime(opts.cancelAfter);
  if (opts.condition) tx.Condition = opts.condition.trim().toUpperCase();
  if (opts.destinationTag) tx.DestinationTag = Number(opts.destinationTag);
  return submit(tx);
}

export function finishEscrow(owner: string, sequence: number | string, condition?: string, fulfillment?: string) {
  const tx: Tx = {TransactionType: 'EscrowFinish', Owner: owner, OfferSequence: Number(sequence)};
  if (condition) tx.Condition = condition.trim().toUpperCase();
  if (fulfillment) tx.Fulfillment = fulfillment.trim().toUpperCase();
  return submit(tx);
}

export function cancelEscrow(owner: string, sequence: number | string) {
  return submit({TransactionType: 'EscrowCancel', Owner: owner, OfferSequence: Number(sequence)});
}

export function createCheck(opts: {destination: string; amount: string; currency?: string; issuer?: string; expiration?: DateInput; destinationTag?: string | number; invoiceId?: string}) {
  const tx: Tx = {TransactionType: 'CheckCreate', Destination: opts.destination, SendMax: toAmount(opts.amount, opts.currency, opts.issuer)};
  if (opts.expiration) tx.Expiration = toRippleTime(opts.expiration);
  if (opts.destinationTag) tx.DestinationTag = Number(opts.destinationTag);
  if (opts.invoiceId) tx.InvoiceID = opts.invoiceId;
  return submit(tx);
}

/** Cashes exactly `amount`, or with `flexible` at least `amount` (DeliverMin). */
export function cashCheck(checkId: string, amount: Amount, flexible: boolean) {
  return submit({TransactionType: 'CheckCash', CheckID: checkId, [flexible ? 'DeliverMin' : 'Amount']: amount});
}

export function cancelCheck(checkId: string) {
  return submit({TransactionType: 'CheckCancel', CheckID: checkId});
}

export function createChannel(opts: {destination: string; amount: string; settleDelay: number | string; cancelAfter?: DateInput; destinationTag?: string | number}) {
  const tx: Tx = {
    TransactionType: 'PaymentChannelCreate',
    Destination: opts.destination,
    Amount: toAmount(opts.amount),
    SettleDelay: Number(opts.settleDelay),
    PublicKey: session.publicKey()
  };
  if (opts.cancelAfter) tx.CancelAfter = toRippleTime(opts.cancelAfter);
  if (opts.destinationTag) tx.DestinationTag = Number(opts.destinationTag);
  return submit(tx);
}

export function fundChannel(channelId: string, amount: string, expiration?: DateInput) {
  const tx: Tx = {TransactionType: 'PaymentChannelFund', Channel: channelId, Amount: toAmount(amount)};
  if (expiration) tx.Expiration = toRippleTime(expiration);
  return submit(tx);
}

export function claimChannel(opts: {channel: string; balance?: string; amount?: string; signature?: string; publicKey?: string; close?: boolean; renew?: boolean}) {
  const tx: Tx = {TransactionType: 'PaymentChannelClaim', Channel: opts.channel};
  if (opts.balance) tx.Balance = toAmount(opts.balance);
  if (opts.amount) tx.Amount = toAmount(opts.amount);
  if (opts.signature) tx.Signature = opts.signature.trim().toUpperCase();
  if (opts.publicKey) tx.PublicKey = opts.publicKey.trim().toUpperCase();
  let flags = 0;
  if (opts.close) flags |= PaymentChannelClaimFlags.tfClose;
  if (opts.renew) flags |= PaymentChannelClaimFlags.tfRenew;
  if (flags) tx.Flags = flags;
  return submit(tx);
}

/** Off-ledger claim the channel's source hands to the destination. */
export function signChannelClaim(channelId: string, amountXrp: string | number): string {
  return session.signChannelClaim(channelId, String(amountXrp));
}

export function verifyChannelClaim(channelId: string, amountXrp: string | number, signature: string, publicKey: string): boolean {
  return verifyPaymentChannelClaim(channelId, String(amountXrp), signature.trim().toUpperCase(), publicKey.trim().toUpperCase());
}

/* ------------------------------------------------------------------ NFTs */

export function mintNFT(opts: {taxon?: number | string; flags?: number; uri?: string; transferFee?: number | string; issuer?: string}) {
  const tx: Tx = {TransactionType: 'NFTokenMint', NFTokenTaxon: Number(opts.taxon) || 0, Flags: opts.flags || 0};
  if (opts.uri) tx.URI = convertStringToHex(opts.uri);
  if (opts.transferFee) tx.TransferFee = Math.round(Number(opts.transferFee) * 1000);
  if (opts.issuer) tx.Issuer = opts.issuer;
  return submit(tx);
}

export function burnNFT(nftId: string, owner?: string) {
  const tx: Tx = {TransactionType: 'NFTokenBurn', NFTokenID: nftId};
  if (owner && owner !== session.address()) tx.Owner = owner;
  return submit(tx);
}

export function createNFTOffer(opts: {nftId: string; amount?: string; currency?: string; issuer?: string; sell: boolean; owner?: string; destination?: string; expiration?: DateInput}) {
  const tx: Tx = {
    TransactionType: 'NFTokenCreateOffer',
    NFTokenID: opts.nftId,
    Amount: toAmount(opts.amount || 0, opts.currency, opts.issuer),
    Flags: opts.sell ? NFTokenCreateOfferFlags.tfSellNFToken : 0
  };
  if (!opts.sell) tx.Owner = opts.owner;
  if (opts.destination) tx.Destination = opts.destination;
  if (opts.expiration) tx.Expiration = toRippleTime(opts.expiration);
  return submit(tx);
}

export function cancelNFTOffers(offerIds: string[]) {
  return submit({TransactionType: 'NFTokenCancelOffer', NFTokenOffers: offerIds});
}

export function acceptNFTOffer(opts: {sellOffer?: string; buyOffer?: string; brokerFee?: Amount}) {
  const tx: Tx = {TransactionType: 'NFTokenAcceptOffer'};
  if (opts.sellOffer) tx.NFTokenSellOffer = opts.sellOffer;
  if (opts.buyOffer) tx.NFTokenBuyOffer = opts.buyOffer;
  if (opts.brokerFee) tx.NFTokenBrokerFee = opts.brokerFee;
  return submit(tx);
}

export {dropsToXrp};

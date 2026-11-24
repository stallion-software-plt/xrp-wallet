// Last checks before signing. xrpl.js fills in the fee, sequence number and expiry ledger from the
// server's answers, and a malicious or broken server could try to change more than that, or ask for
// any fee: xrpl.js caps normal fees at maxFeeXRP, but not for transaction types that burn one owner
// reserve increment as their fee.

const RESERVE_FEE_TYPES = ['AccountDelete', 'AMMCreate', 'VaultCreate'];

/** The highest owner reserve increment the XRP Ledger has used (5 XRP, before 2021). */
export const MAX_RESERVE_FEE_DROPS = 5_000_000;

/** Used when the saved fee limit is missing or not a number (the default setting, 0.2 XRP). */
const DEFAULT_MAX_FEE_DROPS = 200_000;

export interface FeeLimits {
  /** The user's fee limit for normal transactions, in XRP (Settings). */
  maxFeeXRP: string | number;
  /** The owner reserve increment in XRP, when known (0 if not yet). */
  reserveIncXRP: number;
}

/** The highest acceptable fee, in drops, for a transaction type. */
export function feeLimitDrops(type: string, limits: FeeLimits): number {
  if (RESERVE_FEE_TYPES.includes(type)) {
    const reserve = Math.round(limits.reserveIncXRP * 1e6);
    return reserve > 0 ? Math.min(reserve, MAX_RESERVE_FEE_DROPS) : MAX_RESERVE_FEE_DROPS;
  }
  const max = Number(limits.maxFeeXRP);
  return Number.isFinite(max) && max > 0 ? Math.round(max * 1e6) : DEFAULT_MAX_FEE_DROPS;
}

/** Throws when the prepared transaction's fee is missing, malformed or above the limit. */
export function checkFee(tx: {TransactionType: string; Fee?: string}, limits: FeeLimits): void {
  const fee = Number(tx.Fee);
  if (!tx.Fee || !/^\d+$/.test(tx.Fee) || !Number.isSafeInteger(fee)) {
    throw new Error('The transaction fee is invalid. The transaction was not signed.');
  }
  const limit = feeLimitDrops(tx.TransactionType, limits);
  if (fee > limit) {
    throw new Error(`The server asked for a fee of ${fee / 1e6} XRP, above the ${limit / 1e6} XRP limit. The transaction was not signed.`);
  }
}

/** Fields autofill may set. Everything else must reach the signature exactly as the app built it. */
const AUTOFILLED = ['Fee', 'Sequence', 'LastLedgerSequence', 'NetworkID', 'Flags'];

/** How far ahead the expiry ledger may be (xrpl.js uses 20; a server claiming far more could hold
 *  a signed transaction and submit it much later). */
export const MAX_LEDGER_OFFSET = 50;

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter(k => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter(k => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every(k => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/**
 * Throws unless `prepared` is `original` plus only the autofilled fields: same destination, amounts,
 * paths, memos, tags and every other field, Flags unchanged (or 0 when not set), and an expiry
 * ledger within MAX_LEDGER_OFFSET of `currentLedger`.
 */
export function checkPrepared(original: Record<string, unknown>, prepared: Record<string, unknown>, currentLedger: number): void {
  const changed: string[] = [];
  for (const key of new Set([...Object.keys(original), ...Object.keys(prepared)])) {
    const before = original[key];
    const after = prepared[key];
    if (before === undefined && after === undefined) continue;
    if (key === 'Flags' && before === undefined && after === 0) continue;
    if (AUTOFILLED.includes(key) && key !== 'Flags' && before === undefined) continue;
    if (!same(before, after)) changed.push(key);
  }
  if (changed.length) {
    throw new Error(`The server changed ${changed.join(', ')} while preparing the transaction. The transaction was not signed.`);
  }
  const last = Number(prepared.LastLedgerSequence);
  if (!Number.isSafeInteger(last) || last <= currentLedger || last > currentLedger + MAX_LEDGER_OFFSET) {
    throw new Error('The server gave an unexpected ledger number. The transaction was not signed.');
  }
}

/** A ledger Mainnet has already passed. A transaction that expires before it can never apply there. */
export const MAINNET_LEDGER_FLOOR = 108_000_000;

/** Networks above this ID must put NetworkID in every signed transaction; others can't include it. */
const MAX_NETWORK_ID_WITHOUT_FIELD = 1024;

/**
 * The same key signs on every network, so a test or custom server could ask for a transaction that
 * is also valid on Mainnet. Off Mainnet, require a NetworkID that Mainnet rejects, or an expiry
 * ledger Mainnet has already passed.
 */
export function checkNetwork(prepared: {NetworkID?: number; LastLedgerSequence?: number}, networkType: string): void {
  const id = prepared.NetworkID;
  if (networkType === 'xrp') {
    if (id !== undefined) throw new Error('The server is not on Mainnet. The transaction was not signed.');
    return;
  }
  if (Number.isInteger(id) && id! > MAX_NETWORK_ID_WITHOUT_FIELD) return;
  const last = Number(prepared.LastLedgerSequence);
  if (!Number.isSafeInteger(last) || last >= MAINNET_LEDGER_FLOOR) {
    throw new Error('This transaction could also be valid on Mainnet. The transaction was not signed.');
  }
}

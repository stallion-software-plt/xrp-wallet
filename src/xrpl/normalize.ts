// rippled API v2 moves the transaction into `tx_json` (with `hash`, `ledger_index` and the close
// time beside it) and shows a Payment's Amount as DeliverMax. These helpers turn account_tx
// entries, `tx` results and stream messages into one flat shape.
import type {TransactionMetadata} from 'xrpl';
import {toRippleTime} from '../core/format';

export interface LedgerTx {
  TransactionType: string;
  Account: string;
  hash: string;
  /** Close time, seconds since the Ripple epoch. */
  date?: number;
  ledger_index?: number;
  [field: string]: any;
}

export interface TxEntry {
  tx: LedgerTx;
  meta: TransactionMetadata;
  validated?: boolean;
}

export function normalizeTx(entry: any): TxEntry {
  const source = entry.tx_json ?? entry.tx ?? entry.transaction ?? entry;
  const tx: LedgerTx = {...source};
  tx.hash = entry.hash ?? source.hash;
  tx.ledger_index = entry.ledger_index ?? source.ledger_index;
  if (tx.date === undefined) {
    tx.date = entry.date ?? (entry.close_time_iso ? toRippleTime(entry.close_time_iso) : undefined);
  }
  if (tx.TransactionType === 'Payment' && tx.Amount === undefined && tx.DeliverMax !== undefined) {
    tx.Amount = tx.DeliverMax;
  }
  return {tx, meta: entry.meta ?? entry.metaData, validated: entry.validated};
}

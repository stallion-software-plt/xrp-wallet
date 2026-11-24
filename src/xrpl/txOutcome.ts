// What a `tx` lookup says about a submitted transaction. Reporting "failed" too early invites the
// user to pay again while the first payment can still apply, so only a final answer counts.

export type TxOutcome = {state: 'success'} | {state: 'failed'; message: string} | {state: 'pending'};

interface Lookup {
  validated?: boolean;
  meta?: unknown;
}

interface LookupError {
  data?: {error?: string; searched_all?: boolean};
}

export function lookupOutcome(result: Lookup | null, error: unknown, latestLedger: number, maxLedger: number): TxOutcome {
  if (result?.validated) {
    const code = typeof result.meta === 'object' && result.meta ? (result.meta as {TransactionResult?: string}).TransactionResult : undefined;
    return code === 'tesSUCCESS' ? {state: 'success'} : {state: 'failed', message: code || 'unknown'};
  }
  const data = (error as LookupError | null)?.data;
  // The server holds every ledger up to the expiry and the transaction is in none of them.
  if (data?.error === 'txnNotFound' && data.searched_all === true && latestLedger > maxLedger) {
    return {state: 'failed', message: 'tx_expired'};
  }
  return {state: 'pending'};
}

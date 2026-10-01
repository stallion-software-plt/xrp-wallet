declare module 'ripple-lib-transactionparser' {
  interface OrderChange {
    direction: 'buy' | 'sell';
    status: 'created' | 'filled' | 'partially-filled' | 'cancelled';
    quantity: {currency: string; counterparty?: string; value: string};
    totalPrice: {currency: string; counterparty?: string; value: string};
    [field: string]: unknown;
  }
  export function parseOrderbookChanges(meta: unknown): Record<string, OrderChange[]>;
  export function parseBalanceChanges(meta: unknown): Record<string, Array<{currency: string; counterparty?: string; value: string}>>;
  const parser: {parseOrderbookChanges: typeof parseOrderbookChanges; parseBalanceChanges: typeof parseBalanceChanges};
  export default parser;
}

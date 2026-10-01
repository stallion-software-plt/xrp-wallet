---
name: xrpl-transaction
description: Use when adding or changing a wallet feature that builds and signs an XRP Ledger transaction (a new transaction type, a new screen or form, or a change to an existing one such as checks, escrow, NFTs or AMM).
---

# Add or change an XRP Ledger transaction

`src/pages/Checks.tsx` with `createCheck`, `cashCheck` and `cancelCheck` in `src/xrpl/api.ts` is a
compact example of the whole pattern. Read it first.

## 1. Build the transaction in `src/xrpl/api.ts`

Add a function that builds the transaction object and returns `submit(tx)`:

```ts
export function createCheck(opts: {destination: string; amount: string; currency?: string; issuer?: string; expiration?: DateInput}) {
  const tx: Tx = {TransactionType: 'CheckCreate', Destination: opts.destination, SendMax: toAmount(opts.amount, opts.currency, opts.issuer)};
  if (opts.expiration) tx.Expiration = toRippleTime(opts.expiration);
  return submit(tx);
}
```

- Use `toAmount()` from `src/xrpl/amounts.ts` for amounts, `toRippleTime()` for dates and
  `Number()` for tags. Leave out optional fields instead of setting them to empty values.
- Don't set `Fee`, `Sequence`, `LastLedgerSequence` or `NetworkID`: `submit()` lets xrpl.js fill them
  in, then `checkPrepared()` in `src/xrpl/signGuard.ts` rejects the transaction if the server changed
  anything else. Never sign anywhere but `submit()`.
- If the new type burns an owner reserve as its fee (like `AccountDelete` or `AMMCreate`), add it to
  `RESERVE_FEE_TYPES` in `signGuard.ts` and cover it in `signGuard.test.ts`. Otherwise the normal fee
  limit applies.
- Ledger queries for the screen (for example `account_objects` of one type) go in `api.ts` too.

## 2. The screen

- Track each action with `useTx`, show its state with `TxStatus`, and disable the button while it
  runs or when the wallet is watch-only:

  ```tsx
  const tx = useTx(() => void list.refresh());
  await tx.run('create', () => createCheck({...}));
  <TxStatus state={tx.status.create} />
  <button disabled={!formValid || tx.busy('create') || readOnly}>
  ```

- Load lists with `useLedgerList`, and show `LoadError` and an empty state.
- Validate before submitting: `isValidAddress()` for addresses, positive decimal amounts, hex fields
  by length.
- For anything that moves value or can't be undone, show a confirmation (`Modal` with a
  `summary-box`) listing what will be signed.
- Show tokens with `fmtCode()` / `currencyLabel()` and their issuer, so a token can't pass for XRP.
- When paying an address the user typed or pasted, warn about look-alikes with `findLookalike()` from
  `src/core/lookalike.ts`, as `src/pages/Send.tsx` does.

## 3. A new page

- Add it to `PAGES` in `src/App.tsx` and to `NAV` in `src/nav.ts`, with a Font Awesome 4 icon
  (`fa-…`) and a `feature`.
- A new `feature` goes in the `Feature` type and `ALL_TABS` in `src/core/settings.ts`. Leave it out of
  networks that don't support the transaction.

## 4. Activity

Add a `case` for the transaction type in `describe()` in `src/xrpl/txformat.ts`, so it reads well in
Activity, and a test in `src/xrpl/txformat.test.ts`.

## 5. Text

Add every new `t('key')` to `src/i18n/en.json`, `cn.json` and `jp.json`.

## 6. Check

```bash
npm run typecheck
npm test
npm run build
```

Then test on the Testnet with `npm start` (pick the Testnet network in Settings; the dashboard has a
faucet). Ask the maintainer before running anything that signs transactions, and never use Mainnet
funds. Report what you tested and the transaction hashes.

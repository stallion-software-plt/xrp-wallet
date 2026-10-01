# AGENTS.md

Guidance for AI coding agents (Codex, Claude Code and others) working on this repository. People
should start with [CONTRIBUTING.md](CONTRIBUTING.md); this file adds what an agent needs to know.

## What this is

XRP Wallet is a desktop wallet for the XRP Ledger. The UI is React 19 and TypeScript, built by Vite
into `app/` and run by NW.js (Chromium with Node.js available in the page). It talks to the ledger
with xrpl.js 5 (API v2: `tx_json`, `DeliverMax`, `close_time_iso`).

It holds the keys to people's funds: correctness, security and privacy come before features.

## Commands

```bash
npm install
npm run lint        # oxlint (rules in .oxlintrc.json)
npm run typecheck   # tsc --noEmit
npm test            # vitest unit tests
npm run build       # vite build into app/
npm run dev         # UI in a web browser with hot reload (no files, no Node.js)
npm start           # build and run in the NW.js SDK build, with DevTools
npm run check:nw    # reports a newer NW.js release
npm run dist:win    # installers into dist/ (also dist:linux, dist:mac): slow, only when asked
```

Run `lint`, `typecheck`, `test` and `build` before calling a change done. ESLint can't be used:
typescript-eslint doesn't support TypeScript 7 yet. Don't silence a lint rule without a comment
saying why.

## Layout

| Path | Contents |
|---|---|
| `src/pages/` | One component per screen, registered in `src/App.tsx` (`PAGES`) and `src/nav.ts` (sidebar) |
| `src/components/` | Shared UI: shell, modal, activity rows, `TxStatus` |
| `src/xrpl/api.ts` | Ledger queries and transaction builders. **Everything is signed through `submit()`** |
| `src/xrpl/signGuard.ts` | Checks before signing: fee cap, fields the server may fill in, expiry |
| `src/xrpl/` (other) | Amounts, activity formatting (`txformat.ts`), path finding, order book, connection |
| `src/core/` | Keys (`id.ts`, `hd.ts`), wallet file (`walletFile.ts`), open wallet (`session.ts`), networks (`settings.ts`), formatting, look-alike addresses |
| `src/state/`, `src/hooks/` | zustand stores; `useTx`, `useLedgerList`, `useAutoLock` |
| `src/i18n/` | `en.json`, `cn.json`, `jp.json` |
| `src/platform/` | NW.js access: `openExternal`, clipboard, atomic file writes |
| `main.js` | NW.js entry point: opens the window, keeps web links out of it |
| `scripts/package.mjs` | Installers, with pinned SHA-256 checksums for every download |

## Rules

Never:

- read, print, log, commit or paste secret keys, recovery phrases, passwords or wallet files
  (`ripple*.txt`). The only secrets allowed in the repository are the public test vectors in
  `src/core/compat-vectors.json`.
- edit `src/core/compat-vectors.json` to make a test pass. Existing recovery phrases must restore the
  same accounts and existing wallet files must still open.
- keep secrets anywhere but the encrypted wallet file and the memory of `src/core/session.ts`: not in
  `localStorage`, `sessionStorage`, other files, logs or error messages.
- add analytics, telemetry, crash reporting, remote scripts or fonts, or background network
  requests. A new host may only be contacted when the user asks for it, and `PRIVACY.md` must be
  updated in the same change. Keep the Content Security Policy in `vite.config.mts` as tight as it is.
- sign anything outside `submit()` in `src/xrpl/api.ts`, or loosen the checks in `signGuard.ts`.
- render remote data as HTML (`dangerouslySetInnerHTML`) or navigate the app window to a web page.
  Open links with `openExternal()` from `src/platform/desktop.ts`.
- use real funds. Test on the XRPL Testnet or Devnet, and ask the maintainer before running anything
  that signs transactions or builds installers.
- change the wallet file format, the key derivation or `build.winUpgradeCode` in `package.json`
  unless asked to.
- add a dependency when the existing ones can do the job. CI installs with `npm ci --ignore-scripts`.

## Conventions

- TypeScript strict mode, function components and hooks. Match the surrounding style: two-space
  indent, single quotes, semicolons, `{a, b}` without inner spaces, existing CSS classes from
  `src/styles/`.
- All user-visible text goes through `t('key')`. Add each key to all three language files (use the
  English text if you can't translate it), keep keys flat without `.` or `:`, and use `{{name}}` for
  values. `src/i18n/keys.test.ts` fails when a key is missing.
- Amounts are decimal strings. Use the helpers in `src/xrpl/amounts.ts` and `src/core/format.ts`
  rather than floating-point arithmetic.
- Disable transaction buttons for watch-only wallets (`readOnly` from `useAccount()`).
- Add or update unit tests for logic in `src/core/` and `src/xrpl/`.
- Keep comments short and about why, as in the existing code.
- `main` is protected: work on a branch and open a pull request; CI must pass before it merges.
- Commit messages and pull request titles follow Conventional Commits (`fix(send): …`,
  `feat(nft): …`, `docs: …`); see CONTRIBUTING.md for the types and scopes.

## Skills

Step-by-step guides for common tasks live in `.agents/skills/` (Codex) and `.claude/skills/`
(Claude Code):

- `xrpl-transaction`: add or change a feature that signs an XRP Ledger transaction
- `security-review`: review changes for security and privacy problems
- `update-nwjs`: update NW.js and its pinned checksums
- `release`: prepare a release

Both folders hold the same files. When you change a skill, copy it to the other folder.

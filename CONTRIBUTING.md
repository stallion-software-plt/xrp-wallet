# Contributing to XRP Wallet

Thanks for helping! Bug reports, translations, fixes and new features are all welcome.

## Ground rules

- **Never commit or paste secrets.** No secret keys, recovery phrases, wallet files (`ripple*.txt`)
  or passwords in code, issues, pull requests or screenshots, not even "test" ones from Mainnet.
- **Test on the XRPL Testnet or Devnet**, never with real funds. Testnet accounts come from the faucet
  on the dashboard.
- **Privacy is a feature.** The app must not collect data: no analytics, telemetry, crash reporting
  or new background network requests. If a change makes the app contact a new host, it must only
  happen when the user asks for it, and [PRIVACY.md](PRIVACY.md) must be updated in the same pull
  request.
- **Security problems** go through a private report, not a public issue. See [SECURITY.md](SECURITY.md).
- Be kind. This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting started

You need Node.js 22.12 or later.

```bash
npm install
npm start          # builds the app and runs it in NW.js with DevTools
npm run dev        # runs the UI in a web browser with hot reload
```

In `npm run dev`, wallet files are uploaded and downloaded instead of opened and saved on disk, and
Node.js features aren't available. Use `npm start` to check anything that touches files or NW.js.

The [README](README.md#source-layout) describes where things live.

## Before you open a pull request

```bash
npm run typecheck
npm test
npm run build
```

CI runs the same checks on every push and pull request.

- Keep changes focused: one fix or feature per pull request.
- Match the style of the code around your change (TypeScript strict mode, function components and
  hooks, the existing CSS classes in `src/styles/`).
- Add or update unit tests for logic in `src/core/` and `src/xrpl/`.
- For UI changes, add before and after screenshots to the pull request (using Testnet accounts).
- Describe what you tested and on which network.

### Security-sensitive code

Changes to key derivation (`src/core/id.ts`, `src/core/hd.ts`), the wallet file format
(`src/core/walletFile.ts`) or the open wallet (`src/core/session.ts`) need extra care:

- Existing recovery phrases must still restore the same accounts, and existing wallet files must
  still open. `src/core/compat.test.ts` checks this against vectors recorded from earlier versions;
  never change those vectors to make a test pass.
- Secrets must never be written to `localStorage`, `sessionStorage`, logs or error messages.
- Don't render remote data as HTML (`dangerouslySetInnerHTML`), and open external links with
  `openExternal()` from `src/platform/desktop.ts`.

### Updating NW.js

NW.js bundles Chromium, so new releases bring browser security fixes. `npm run check:nw` (also run
weekly on GitHub) reports when one is out. To update, change `build.nwVersion` in `package.json`, copy
the new SHA-256 values for every file in `NW_SHA256` in `scripts/package.mjs` from
`https://dl.nwjs.io/v<version>/SHASUMS256.txt`, then test with `npm start` and a full build.

## Translations

Translations live in `src/i18n/en.json`, `cn.json` and `jp.json`. When you add a text:

- add the key to **all three** files (use the English text in the others if you can't translate it;
  a unit test fails when a key is missing);
- use `{{name}}` for values filled in by the code;
- keep keys flat, without `.` or `:`.

Improvements to the Chinese and Japanese translations by native speakers are especially welcome.

## Reporting bugs and ideas

Use the issue templates. For bugs, include the app version, your operating system, the network
(Mainnet, Testnet or Devnet) and the steps to reproduce. A transaction hash is fine to share; a secret
key is not.

## Licence

By contributing, you agree that your contributions are licensed under the project's
[ISC licence](LICENSE).

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

## Branches, commits and pull requests

`main` is protected: every change reaches it through a pull request, and CI must pass first.

1. **Fork** the repository. Maintainers with write access can push a branch to it directly instead.
2. **Create a branch from `main`** named after the change, for example `fix/send-tag-reset` or
   `feat/nft-transfer`.
3. **Commit** using [Conventional Commits](#commit-messages). Before opening the pull request, bring
   your branch up to date with `main` (`git fetch upstream` then `git rebase upstream/main` in a fork).
4. **Open a pull request** against `main` and fill in the template. Give it a Conventional Commits
   title too; it becomes the commit message when the pull request is squash-merged.
5. **Review.** A maintainer reviews every pull request. Changes to `.github/workflows/`, `scripts/`,
   `package.json` or `package-lock.json` get extra scrutiny, because they decide how the installers
   are built.

### Commit messages

Commit messages and pull request titles follow
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>(<optional scope>): <what the change does, in the imperative>
```

| Type | Use it for |
|---|---|
| `feat` | A new feature for users |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `refactor` | A code change that doesn't change behaviour |
| `test` | Adding or fixing tests |
| `build` | Dependencies, NW.js or packaging |
| `ci` | GitHub Actions workflows |
| `chore` | Anything else, such as tooling or release housekeeping |

Add a scope when it helps, such as `send`, `trade`, `nft`, `wallet-file`, `i18n` or `release`. If
users have to adapt to a change (a removed setting, a different default), put `!` after the type and
explain it in the body. Changes that stop existing recovery phrases or wallet files from working
aren't accepted (see [Security-sensitive code](#security-sensitive-code)).

```text
fix(send): clear the destination tag when the recipient changes
feat(nft): show the issuer of the token in buy offers
docs: add a Testnet guide to the README
build(deps): update NW.js to v0.118.0
```

## Before you open a pull request

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs the same checks on every push and pull request. The lint rules are in `.oxlintrc.json`. If a
rule is wrong for one particular line, turn it off just there with
`// oxlint-disable-next-line <rule>` and add a comment explaining why.

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

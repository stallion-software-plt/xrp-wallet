---
name: security-review
description: Use when reviewing a change, pull request or part of this wallet for security or privacy problems, especially anything touching keys, the wallet file, signing, network access, rendering of remote data, external links, NW.js, dependencies or the release workflow.
---

# Security review

This app holds the keys to people's funds and promises not to collect data. Review against the
checklist below, then report only real problems.

## Scope

Start from the diff (`git diff main...HEAD`, or the pull request). Read each changed file in full,
and follow calls into the security-sensitive files listed below even when they didn't change.

## Checklist

**Keys and the wallet file** (`src/core/id.ts`, `hd.ts`, `walletFile.ts`, `session.ts`)
- Secrets never reach `localStorage`, `sessionStorage`, files other than the encrypted wallet file,
  `console`, error messages, toasts or the URL.
- Derivation and the file format stay compatible: `src/core/compat.test.ts` passes and
  `compat-vectors.json` is unchanged.
- The wallet file is encrypted with PBKDF2 at 600,000 iterations or more and written through
  `writeTextFile()` (atomic, mode 0600). Decryption errors stay generic.
- `session.close()` still clears the open wallet and derived keys. Auto-lock still applies.

**Signing** (`src/xrpl/api.ts`, `src/xrpl/signGuard.ts`)
- Every transaction goes through `submit()`: autofill, then `checkPrepared()` and `checkFee()`, then
  signing.
- The user sees and confirms what is signed: destination, amount and currency with issuer, tags,
  memos. The confirmed values are the ones submitted (no stale or un-debounced state).
- Amounts from the user are decimal strings; quotes and paths from servers are checked before use.
- Addresses are validated, and payments warn about look-alike addresses.

**Remote data and the page**
- No `dangerouslySetInnerHTML`, `eval`, `new Function` or HTML built from strings.
- Data from XRPL servers, issuer domains (`xrp-ledger.toml`, `ripple.toml`, `ripple.txt`),
  federation servers and NFT metadata is untrusted: type-checked, length-limited, and shown as text.
- Links open with `openExternal()` (http and https only). `main.js` keeps navigation inside the app.
- The Content Security Policy in `vite.config.mts` isn't loosened.
- No Node.js access (`require`, `nw.*`) outside `src/platform/` without a reason.

**Privacy** (`PRIVACY.md`)
- No new network requests unless the user asked for that action; no analytics, telemetry, crash
  reports or remote assets. A new host means `PRIVACY.md` changes in the same pull request.

**Build and supply chain**
- New dependencies are needed, maintained and don't depend on install scripts (CI runs
  `npm ci --ignore-scripts`). `package-lock.json` changes match `package.json`.
- Downloads in `scripts/package.mjs` stay pinned to SHA-256 checksums.
- GitHub Actions stay pinned to full commit SHAs with `persist-credentials: false`; workflow
  permissions stay minimal.

## Report

For each finding give the file and line, what an attacker or a broken server could do, the steps
that lead there, and a fix. Order by severity and leave out style comments. If nothing is wrong,
say so and list what you checked.

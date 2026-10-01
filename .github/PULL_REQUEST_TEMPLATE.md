<!-- Title: use Conventional Commits, for example "fix(send): clear the tag when the recipient changes". -->

## What this changes

<!-- What does this pull request do, and why? Link the issue it fixes, for example "Fixes #12". -->

## Type of change

- [ ] Bug fix (`fix`)
- [ ] New feature (`feat`)
- [ ] Documentation (`docs`)
- [ ] Refactoring or tests (`refactor`, `test`)
- [ ] Dependencies, NW.js, packaging or workflows (`build`, `ci`): needs a maintainer's extra review
- [ ] Users have to adapt to it (`!`): explained above

## How it was tested

<!--
Which network (Testnet or Devnet, never real funds), which screens, which operating system?
Add transaction hashes for anything that signs, and before and after screenshots for UI changes.
-->

## Checklist

- [ ] `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass
- [ ] New texts are in `en.json`, `cn.json` and `jp.json`
- [ ] Unit tests added or updated for logic in `src/core/` or `src/xrpl/`

## Security checklist

- [ ] No secret keys, recovery phrases, wallet files or passwords in the code, logs, error messages, commits or screenshots
- [ ] Secrets stay in the encrypted wallet file and in memory: nothing new in `localStorage`, `sessionStorage` or other files
- [ ] Transactions are only signed through `submit()` in `src/xrpl/api.ts`, and the checks in `signGuard.ts` are unchanged (or the change is explained above)
- [ ] Data from servers, issuer domains or NFTs is validated and shown as text; links open with `openExternal()`
- [ ] No new network requests, or they only happen when the user asks and `PRIVACY.md` is updated
- [ ] Existing recovery phrases and wallet files still work (`src/core/compat.test.ts` passes, its vectors unchanged)
- [ ] Changes to `.github/workflows/`, `scripts/`, `package.json` or `package-lock.json` are explained above

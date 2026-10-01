---
name: update-nwjs
description: Use when updating NW.js (the desktop runtime that bundles Chromium) to a newer version, for example after `npm run check:nw` or the weekly "NW.js update check" workflow reports a new release.
---

# Update NW.js

NW.js bundles Chromium, so new releases carry browser security fixes. Every NW.js download is
checked against a pinned SHA-256 checksum, so the version and the checksums change together.

1. Run `npm run check:nw` to get the latest version. Read its release notes on https://nwjs.io/blog/
   for breaking changes (Node.js version, removed APIs, Chromium flags).
2. In `package.json`, set `build.nwVersion` to the new version, without the `v`.
3. Open `https://dl.nwjs.io/v<version>/SHASUMS256.txt`. In `scripts/package.mjs`, replace the eight
   entries of `NW_SHA256` with the new file names and checksums, copied from that list:
   - `nwjs-v<version>-win-x64.zip`, `-linux-x64.tar.gz`, `-osx-x64.zip`, `-osx-arm64.zip`
   - the same four with `nwjs-sdk-v<version>-…`

   Copy the values from the official list. Never compute them from files you downloaded yourself:
   that would pin whatever was downloaded.
4. Check that the Chromium flags in `package.json` (`chromium-args`) are still valid for the new
   Chromium version.
5. Run `npm run typecheck`, `npm test` and `npm run build`.
6. Ask the maintainer to run `npm start`, which downloads the SDK build and verifies its checksum, and
   to try opening a wallet, sending on the Testnet and opening an external link. Then one
   `npm run dist:<os>` to check the installer build. Don't start these slow runs without asking.
7. Commit as "Update NW.js to v<version>".

The `PRIVACY.md` and `SECURITY.md` texts don't name the NW.js version, so they don't need changes.

# Security policy

XRP Wallet holds the keys to people's funds, so security reports are taken seriously. Thank you for
helping keep users safe.

## Reporting a vulnerability

**Please don't report security problems in public issues, discussions or pull requests.**

Report them privately through GitHub: open the repository's **Security** tab and choose
**Report a vulnerability**. Only the maintainers can see the report.

Please include:

- what an attacker could do (for example read a secret key, sign an unwanted transaction, or run
  code in the app);
- the steps to reproduce it, and the app version and operating system;
- a proof of concept if you have one. Use the XRPL Testnet, never real funds, and never send us a
  real secret key or recovery phrase.

We aim to acknowledge reports within a week and to keep you updated until the issue is fixed. Once
a fix is released we're happy to credit you in the release notes, unless you'd rather stay anonymous.
There is no bug bounty.

## Supported versions

Security fixes go into the latest release. Please check that the problem still exists in the latest
version before reporting it.

## Scope

In scope:

- the app's code in this repository, including how it stores, decrypts and uses keys;
- the installers built by this repository's release workflow;
- the network requests the app makes (see [PRIVACY.md](PRIVACY.md)).

Out of scope:

- the XRP Ledger itself, public XRPL servers, and third-party gateways, federation services or NFT
  hosts (report those to their operators);
- attacks that need an already compromised computer (malware, a keylogger, someone with your unlocked
  session);
- the absence of code signing on installers, which is a known limitation.

## How the app protects keys

- Secret keys and recovery phrases are stored only in a wallet file on your computer, encrypted with
  your password (AES-256-CCM with PBKDF2-HMAC-SHA256, 600,000 iterations). New passwords need at least
  10 characters. The file is replaced atomically when saved and, on macOS and Linux, readable only by
  you.
- While a wallet is open, the decrypted data is kept in the app's memory only, never in browser
  storage or other files. Logging out also clears derived encryption keys. The wallet locks after 5
  to 60 minutes without activity (15 by default, in Settings).
- Transactions are signed on your computer. Only signed transactions are sent to the XRPL servers.
  Before signing, the app checks what the server filled in: only the fee, sequence number and expiry
  ledger may be added, the fee must be within your limit (or, for account deletion and AMM creation,
  the ledger's reserve), and the expiry must be close to the current ledger.
- Activity flags tiny payments from unknown addresses and senders whose address imitates a contact
  or your own (address poisoning), and Send warns before paying such a look-alike address.
- The app's page runs under a Content Security Policy that only allows the app's own scripts, and web
  links open in the system browser instead of inside the app. Unencrypted `ws://` connections are
  allowed only to a node on your own computer.
- Tokens whose code imitates XRP are labelled "(token)", and NFT offers show the token's issuer.
- Installers are built from checked downloads: NW.js, WiX and appimagetool must match pinned SHA-256
  checksums, GitHub Actions are pinned to commits, and dependency install scripts don't run. Each
  release installer gets a signed build attestation (`gh attestation verify <file> --repo <owner>/<repo>`).
  A weekly check reports new NW.js releases, which carry Chromium security fixes.

## Staying safe

- Never share your secret key, recovery phrase or wallet password with anyone, including people who
  say they are from this project. We will never ask for them.
- Download the app only from this repository's releases, and check the file against
  `SHA256SUMS.txt` from the same release.
- Keep a backup of your recovery phrase on paper, offline.

# Privacy

This wallet collects no data. It has no accounts, analytics, telemetry, ads or crash reporting, and
your keys never leave your computer. This page lists every network connection the app makes, so you
can check that claim.

## Connections made automatically

The app connects only to the XRP Ledger servers listed in **Settings**. By default these are
`s1.ripple.com`, `s2.ripple.com` and `xrpl.ws`.

Like any server, they can see your IP address and which accounts you look up. Signed transactions are
public on the ledger anyway. For the most privacy, run your own `rippled` node and enter it in
Settings.

## Connections made only when you ask

| When you... | The app contacts | What it sends |
|---|---|---|
| Send to a `name@domain` address | that domain and the service it lists | the name, your address, the network, your language and the app version |
| Look up an issuer domain on the Tokens page | that domain (`xrp-ledger.toml` or `ripple.txt`) | nothing beyond the request |
| Click **Deposit** on a token | that token's gateway | your address, the currency, your language |
| Turn on **Show NFT images** | the servers chosen by each NFT's creator, or `ipfs.io` | nothing beyond the request (they see your IP) |
| Click **Fund from faucet** on a test network | the XRPL test faucet | your test address |
| Open an explorer link | your web browser opens the site | the link |

## What the app adds to your transactions

Nothing that identifies the app. A transaction contains only what you entered. A message you add to a
payment is stored on the public ledger.

## Data stored on your computer

- **Wallet file:** your secret key and contacts, encrypted with your password (AES-256, PBKDF2 with
  600,000 iterations). Files from earlier versions are re-encrypted this way when you open them.
- **App settings:** language, theme, network, servers, last trade pair, the NFT image choice and the
  auto-lock time, kept in the app's local storage.
- **While a wallet is open:** its decrypted data and password are kept in the app's memory only and
  are never written to disk. Logging out or closing the app clears them.
- **If you used an earlier version or the original RippleFox (Foxlet) client:** those kept the open
  wallet, including its password, in session storage, which Chromium can write to the app's profile
  folder. Delete that folder. It is named `FoxletRipple` or `Ripple`, in `%LOCALAPPDATA%` on Windows,
  `~/Library/Application Support` on macOS and `~/.config` on Linux. This version clears such data
  from its own profile at startup, but it can't reach other apps' folders.

## The browser engine

The app runs on NW.js, which includes Chromium. `package.json` turns off Chromium's background network
features through `chromium-args`:

- `--disable-background-networking`, `--disable-component-update`, `--disable-domain-reliability`,
  `--no-pings`, `--disable-breakpad` and `--disable-features=PreconnectToSearch`;
- `--component-updater=url-source=...` and `--apps-gallery-update-url=...`, which point Chromium's
  update checks at an unreachable local address;
- `--host-resolver-rules=...`, which blocks `www.google.com`, `update.googleapis.com` and `*.gvt1.com`.
  Chromium uses them for a search feature, extension update checks and (on Linux) spell-check
  dictionary downloads, which the switches above don't cover.

The app's own page also runs under a Content Security Policy: it only runs scripts that ship with the
app, only opens network connections to `https:` and websocket addresses, and web links open in your
system browser instead of inside the app.

To check the traffic yourself, start the app with
`--log-net-log=netlog.json --net-log-capture-mode=Default` and look at the hosts in the log.

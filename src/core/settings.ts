// App settings kept in localStorage. Key names are unchanged from earlier versions, so existing
// settings carry over.

export type Feature = 'history' | 'trade' | 'balance' | 'send' | 'trust' | 'amm' | 'nft' | 'escrow' | 'checks' | 'channels';
export type NetworkType = 'xrp' | 'xrpTestnet' | 'xrpTest' | 'xag' | 'other';
export type Lang = 'en' | 'cn' | 'jp';
export type Theme = 'light' | 'dark';

export interface Server {
  server: string;
  port: number | string;
}

export interface Network {
  name: string;
  translationKey: string;
  networkType: NetworkType;
  servers: Server[];
  coin: {name: string; atom: string; code: string; logo: string};
  explorer?: {tx?: string; account?: string};
  faucet?: string;
  tabs: Feature[];
}

const ALL_TABS: Feature[] = ['history', 'trade', 'balance', 'send', 'trust', 'amm', 'nft', 'escrow', 'checks', 'channels'];
const XRP_COIN = {name: 'ripple', atom: 'drop', code: 'XRP', logo: 'img/coin/xrp.png'};

// To add a network, add it here and its `translationKey` to every translation.
export const NETWORKS: Record<NetworkType, Network> = {
  xrp: {
    name: 'Ripple Public Network',
    translationKey: 'public_url',
    networkType: 'xrp',
    // Public full-history nodes. A server always sees the connecting IP and the accounts
    // queried; users can replace these (e.g. with their own node) in Settings.
    servers: [
      {server: 's1.ripple.com', port: 443},
      {server: 's2.ripple.com', port: 443},
      {server: 'xrpl.ws', port: 443}
    ],
    coin: XRP_COIN,
    explorer: {tx: 'https://xrpscan.com/tx/', account: 'https://xrpscan.com/account/'},
    tabs: ALL_TABS
  },
  xrpTestnet: {
    name: 'XRPL Testnet',
    translationKey: 'testnet_url',
    networkType: 'xrpTestnet',
    servers: [{server: 's.altnet.rippletest.net', port: 51233}],
    coin: XRP_COIN,
    faucet: 'https://faucet.altnet.rippletest.net/accounts',
    explorer: {tx: 'https://testnet.xrpl.org/transactions/', account: 'https://testnet.xrpl.org/accounts/'},
    tabs: ALL_TABS
  },
  xrpTest: {
    name: 'Ripple Test Network',
    translationKey: 'test_url',
    networkType: 'xrpTest',
    servers: [{server: 's.devnet.rippletest.net', port: 51233}],
    coin: XRP_COIN,
    faucet: 'https://faucet.devnet.rippletest.net/accounts',
    explorer: {tx: 'https://devnet.xrpl.org/transactions/', account: 'https://devnet.xrpl.org/accounts/'},
    tabs: ALL_TABS
  },
  xag: {
    name: 'XAG Fork',
    translationKey: 'xag_url',
    networkType: 'xag',
    servers: [
      {server: 'g1.xrpgen.com', port: 443},
      {server: 'g2.xrpgen.com', port: 443}
    ],
    coin: {name: 'xrpgen', atom: 'drop', code: 'XAG', logo: 'img/coin/xag.png'},
    explorer: {tx: 'https://scan.xrpgen.com/#!/tx?data='},
    tabs: ['history', 'trade', 'balance', 'send', 'trust']
  },
  other: {
    name: 'User defined',
    translationKey: 'other_url',
    networkType: 'other',
    servers: [],
    coin: {name: 'ripple', atom: 'drop', code: 'XRP', logo: 'img/waterdrop.jpg'},
    tabs: ALL_TABS
  }
};

function get(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the setting just isn't remembered.
  }
}

function getJson<T>(key: string, fallback: T): T {
  const raw = get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getNetworkType(): NetworkType {
  const type = get('network_type');
  return type && type in NETWORKS ? (type as NetworkType) : 'xrp';
}

export function setNetworkType(type: NetworkType): void {
  set('network_type', type in NETWORKS ? type : 'xrp');
}

export function getNetwork(type: NetworkType = getNetworkType()): Network {
  const network = NETWORKS[type];
  if (type === 'other') {
    return {...network, coin: {...network.coin, code: getCoin('other') || 'XRP'}};
  }
  return network;
}

export function getServers(type: NetworkType = getNetworkType()): Server[] {
  return getJson<Server[]>(`network_servers/${type}`, NETWORKS[type].servers.map(s => ({...s})));
}

export function setServers(servers: Server[], type: NetworkType = getNetworkType()): void {
  set(`network_servers/${type}`, JSON.stringify(servers));
}

export function resetServers(type: NetworkType = getNetworkType()): void {
  set(`network_servers/${type}`, null);
}

export function getCoin(type: NetworkType = getNetworkType()): string {
  return type === 'other' ? get(`network_coin/${type}`) || '' : NETWORKS[type].coin.code;
}

export function setCoin(code: string): void {
  if (getNetworkType() === 'other') set('network_coin/other', code);
}

export function getLang(): Lang {
  const saved = get('lang');
  if (saved === 'en' || saved === 'cn' || saved === 'jp') return saved;
  const language = (navigator.language || '').toLowerCase();
  if (language.startsWith('zh')) return 'cn';
  if (language.startsWith('ja')) return 'jp';
  return 'en';
}

export function setLang(lang: Lang): void {
  set('lang', lang);
}

export function getTheme(): Theme {
  const saved = get('theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(theme: Theme): void {
  set('theme', theme);
}

/** Seconds to wait for a server response. */
export function getTimeout(): string {
  return get('timeout') || '30';
}

export function setTimeoutSetting(seconds: string): void {
  set('timeout', seconds);
}

/** Highest fee (XRP) the app will pay for a transaction. */
export function getMaxFee(): string {
  return get('maxfee') || '0.2';
}

export function setMaxFee(fee: string): void {
  set('maxfee', fee);
}

export interface TradePair {
  base_code: string;
  base_issuer: string;
  counter_code: string;
  counter_issuer: string;
}

export function getTradePair(): TradePair {
  return getJson<TradePair>('tradepair', {
    base_code: getNetwork().coin.code,
    base_issuer: '',
    counter_code: 'CNY',
    counter_issuer: 'rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y'
  });
}

export function setTradePair(pair: TradePair): void {
  set('tradepair', JSON.stringify(pair));
}

export const AUTO_LOCK_CHOICES = [5, 15, 30, 60] as const;

/** Minutes without keyboard or mouse activity before an open wallet locks. */
export function getAutoLockMinutes(): number {
  const saved = Number(get('autolock'));
  return (AUTO_LOCK_CHOICES as readonly number[]).includes(saved) ? saved : 15;
}

export function setAutoLockMinutes(minutes: number): void {
  set('autolock', String(minutes));
}

/** Whether NFT images and metadata may be fetched from their hosts. */
export function getNftMedia(): boolean {
  return get('nftMedia') === '1';
}

export function setNftMedia(on: boolean): void {
  set('nftMedia', on ? '1' : '0');
}

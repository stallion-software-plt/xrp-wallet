// Sidebar navigation and page titles. `feature` is matched against the network's `tabs`.
import type {Feature} from './core/settings';

export interface NavItem {
  path: string;
  icon: string;
  label: string;
  feature?: Feature;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {title: 'nav_wallet', items: [
    {path: '/balance', icon: 'fa-th-large', label: 'dashboard', feature: 'balance'},
    {path: '/send', icon: 'fa-paper-plane', label: 'send', feature: 'send'},
    {path: '/receive', icon: 'fa-qrcode', label: 'receive', feature: 'balance'},
    {path: '/history', icon: 'fa-history', label: 'activity', feature: 'history'},
    {path: '/contact', icon: 'fa-address-book', label: 'contacts', feature: 'balance'}
  ]},
  {title: 'nav_markets', items: [
    {path: '/trade', icon: 'fa-line-chart', label: 'trade', feature: 'trade'},
    {path: '/convert', icon: 'fa-exchange', label: 'swap', feature: 'trade'},
    {path: '/amm', icon: 'fa-tint', label: 'amm_pools', feature: 'amm'}
  ]},
  {title: 'nav_assets', items: [
    {path: '/trust', icon: 'fa-certificate', label: 'tokens', feature: 'trust'},
    {path: '/nft', icon: 'fa-picture-o', label: 'nfts', feature: 'nft'}
  ]},
  {title: 'nav_payments', items: [
    {path: '/escrow', icon: 'fa-hourglass-half', label: 'escrow', feature: 'escrow'},
    {path: '/checks', icon: 'fa-money', label: 'checks', feature: 'checks'},
    {path: '/channels', icon: 'fa-bolt', label: 'pay_channels', feature: 'channels'}
  ]},
  {title: 'nav_account', items: [
    {path: '/account', icon: 'fa-sliders', label: 'account_settings'},
    {path: '/security', icon: 'fa-shield', label: 'security_backup'},
    {path: '/settings', icon: 'fa-cog', label: 'app_settings'}
  ]}
];

/** Group and item for a path ("/" is the dashboard). */
export function findNav(path: string): {group: NavGroup; item: NavItem} | null {
  const target = path === '/' ? '/balance' : path;
  for (const group of NAV) {
    const item = group.items.find(i => i.path === target);
    if (item) return {group, item};
  }
  return null;
}

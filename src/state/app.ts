// App-wide UI and network state.
import {create} from 'zustand';
import i18n from '../i18n';
import * as settings from '../core/settings';
import type {Lang, Network, Theme} from '../core/settings';

export interface AppState {
  network: Network;
  online: boolean;
  ledgerIndex: number | null;
  /** Account reserve in XRP: base plus one increment per owned object. */
  reserveBase: number;
  reserveInc: number;
  theme: Theme;
  lang: Lang;
  sidebarOpen: boolean;
  /** Minutes of inactivity before an open wallet locks. */
  autoLockMinutes: number;
  /** Set when the wallet was locked for inactivity (the minutes), for the login screen; else 0. */
  lockedAfter: number;
  setAutoLockMinutes(minutes: number): void;
  setTheme(theme: Theme): void;
  toggleTheme(): void;
  setLang(lang: Lang): void;
  setSidebarOpen(open: boolean): void;
  /** Re-reads the network settings (after they were saved). */
  reloadNetwork(): void;
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export const useApp = create<AppState>((setState, getState) => ({
  network: settings.getNetwork(),
  online: false,
  ledgerIndex: null,
  reserveBase: 0,
  reserveInc: 0,
  theme: settings.getTheme(),
  lang: settings.getLang(),
  sidebarOpen: false,
  autoLockMinutes: settings.getAutoLockMinutes(),
  lockedAfter: 0,
  setAutoLockMinutes(minutes) {
    settings.setAutoLockMinutes(minutes);
    setState({autoLockMinutes: minutes});
  },
  setTheme(theme) {
    applyTheme(theme);
    settings.setTheme(theme);
    setState({theme});
  },
  toggleTheme() {
    getState().setTheme(getState().theme === 'dark' ? 'light' : 'dark');
  },
  setLang(lang) {
    settings.setLang(lang);
    void i18n.changeLanguage(lang);
    setState({lang});
  },
  setSidebarOpen(sidebarOpen) {
    setState({sidebarOpen});
  },
  reloadNetwork() {
    setState({network: settings.getNetwork(), online: false, ledgerIndex: null, reserveBase: 0, reserveInc: 0});
  }
}));

applyTheme(useApp.getState().theme);

/** Explorer link for a transaction on the current network. */
export function txUrl(hash: string | undefined): string | null {
  const tx = useApp.getState().network.explorer?.tx;
  return hash && tx ? tx + hash : null;
}

/** Explorer link for an account on the current network. */
export function accountUrl(address: string | undefined): string | null {
  const account = useApp.getState().network.explorer?.account;
  return address && account ? account + address : null;
}

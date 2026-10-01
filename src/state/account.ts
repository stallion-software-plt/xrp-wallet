// The open account: address, balances and trust lines, kept current from the account stream.
import {create} from 'zustand';
import {dropsToXrp, type Client} from 'xrpl';
import * as session from '../core/session';
import {emit} from '../core/events';
import {realCode} from '../core/format';
import type {Contact} from '../core/walletFile';
import {activeClient, getClient, onConnect} from '../xrpl/connection';
import {useApp} from './app';

export interface TrustLine {
  currency: string;
  issuer: string;
  value: string;
  limit: string;
  no_ripple?: boolean;
  freeze?: boolean;
  freeze_peer?: boolean;
}

export interface Balance {
  currency: string;
  issuer?: string;
  value: string;
}

export interface AccountState {
  address: string | null;
  readOnly: boolean;
  contacts: Contact[];
  loaded: boolean;
  unfunded: boolean;
  /** XRP balance. */
  balance: number;
  ownerCount: number;
  sequence: number;
  flags: number;
  lines: TrustLine[];
  /** XRP first, then every non-empty trust line. */
  balances: Balance[];
}

const EMPTY = {
  loaded: false,
  unfunded: false,
  balance: 0,
  ownerCount: 0,
  sequence: 0,
  flags: 0,
  lines: [] as TrustLine[],
  balances: [] as Balance[]
};

export const useAccount = create<AccountState>(() => ({
  address: null,
  readOnly: false,
  contacts: [],
  ...EMPTY
}));

/** XRP locked by the reserve for the current number of owned objects. */
export function reserve(ownerCount = useAccount.getState().ownerCount): number {
  const {reserveBase, reserveInc} = useApp.getState();
  return reserveBase + reserveInc * ownerCount;
}

/** Spendable XRP: balance minus the reserve. */
export function available(): number {
  return Math.max(0, useAccount.getState().balance - reserve());
}

let subscribed: {client: Client; address: string; handler: (message: unknown) => void} | null = null;

function isNotFound(err: unknown): boolean {
  return (err as {data?: {error?: string}})?.data?.error === 'actNotFound';
}

export async function refreshAccount(): Promise<void> {
  const address = session.address();
  if (!address) return;
  try {
    const client = await getClient();
    const info = await client.request({command: 'account_info', account: address, ledger_index: 'validated'});
    const data = info.result.account_data;
    const rawLines = [];
    let marker: unknown;
    do {
      const page = await client.request({command: 'account_lines', account: address, ledger_index: 'validated', limit: 400, marker});
      rawLines.push(...page.result.lines);
      marker = page.result.marker;
    } while (marker && rawLines.length < 4000);
    if (session.address() !== address) return;
    const lines: TrustLine[] = rawLines
      .filter(line => line.balance !== '0' || line.limit !== '0')
      .map(line => ({
        currency: line.currency, issuer: line.account, value: line.balance, limit: line.limit,
        no_ripple: line.no_ripple, freeze: line.freeze, freeze_peer: line.freeze_peer
      }));
    const balance = Number(dropsToXrp(data.Balance));
    useAccount.setState({
      loaded: true,
      unfunded: false,
      balance,
      ownerCount: data.OwnerCount,
      sequence: data.Sequence,
      flags: data.Flags,
      lines,
      balances: [{currency: 'XRP', value: String(balance)}, ...lines]
    });
  } catch (err) {
    if (isNotFound(err)) {
      useAccount.setState({...EMPTY, loaded: true, unfunded: true});
    } else {
      console.warn('Account refresh failed', err);
    }
  }
}

/** Clears loaded balances (e.g. when switching networks); they reload on the next connection. */
export function resetAccountData(): void {
  unsubscribe();
  useAccount.setState({...EMPTY});
}

async function subscribe(client: Client, address: string) {
  unsubscribe();
  const handler = (message: unknown) => {
    emit('accountTx', message);
    void refreshAccount();
  };
  subscribed = {client, address, handler};
  client.on('transaction', handler);
  try {
    await client.request({command: 'subscribe', accounts: [address]});
  } catch (e) {
    console.warn('Account subscription failed', e);
  }
}

function unsubscribe() {
  if (!subscribed) return;
  const {client, address, handler} = subscribed;
  subscribed = null;
  client.off('transaction', handler);
  if (client.isConnected()) {
    client.request({command: 'unsubscribe', accounts: [address]}).catch(() => {});
  }
}

function syncSession() {
  const address = session.address();
  useAccount.setState({address, readOnly: session.isReadOnly(), contacts: session.contacts()});
  if (!address) {
    unsubscribe();
    useAccount.setState({...EMPTY});
    return;
  }
  if (subscribed?.address !== address) {
    useAccount.setState({...EMPTY});
    const client = activeClient();
    if (client) {
      void subscribe(client, address);
      void refreshAccount();
    }
  }
}

session.onSessionChange(syncSession);

// Re-subscribe and reload whenever a server connection becomes active.
onConnect(client => {
  const address = session.address();
  if (address) {
    void subscribe(client, address);
    void refreshAccount();
  }
});

/** Balance of an asset (the native coin when `code` is its code or XRP). */
export function balanceOf(balances: Balance[], code: string, issuer: string | null | undefined, nativeCode: string): number {
  const native = code === nativeCode || code === 'XRP';
  const ledgerCode = realCode(code);
  const asset = balances.find(b => (native ? b.currency === 'XRP' : b.currency === ledgerCode && b.issuer === issuer));
  return asset ? Number(asset.value) : 0;
}

/** Reserve in XRP, updating with the account and the network's reserve settings. */
export function useReserve(): number {
  const ownerCount = useAccount(s => s.ownerCount);
  const base = useApp(s => s.reserveBase);
  const inc = useApp(s => s.reserveInc);
  return base + inc * ownerCount;
}

/** Spendable XRP, updating like useReserve. */
export function useAvailable(): number {
  const balance = useAccount(s => s.balance);
  return Math.max(0, balance - useReserve());
}

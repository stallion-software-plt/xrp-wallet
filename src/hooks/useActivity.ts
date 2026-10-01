// Account history, newest first, paged with the ledger's marker. Reloads when the account sees a
// new transaction and when a connection comes up after a failed first load.
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {on} from '../core/events';
import {useAccount} from '../state/account';
import {useApp} from '../state/app';
import {errorMessage, getTransactions} from '../xrpl/api';
import type {TxEntry} from '../xrpl/normalize';
import {processTx, type TxRow} from '../xrpl/txformat';

export interface Activity {
  rows: TxRow[];
  loading: boolean;
  error: string;
  hasMore: boolean;
  refresh(): void;
  loadMore(): void;
}

export function useActivity(pageSize = 30): Activity {
  const address = useAccount(s => s.address);
  const contacts = useAccount(s => s.contacts);
  const nativeCode = useApp(s => s.network.coin.code);
  const online = useApp(s => s.online);
  const [entries, setEntries] = useState<TxEntry[]>([]);
  const [marker, setMarker] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);

  const load = useCallback(async (from: unknown) => {
    if (!address) return;
    const id = ++request.current;
    setLoading(true);
    try {
      const page = await getTransactions(from, pageSize, address);
      if (id !== request.current) return;
      setEntries(prev => (from ? [...prev, ...page.transactions] : page.transactions));
      setMarker(page.marker || null);
      setError('');
    } catch (err) {
      if (id === request.current) setError(errorMessage(err));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [address, pageSize]);

  const refresh = useCallback(() => void load(null), [load]);

  useEffect(() => {
    setEntries([]);
    setMarker(null);
    refresh();
  }, [refresh]);

  useEffect(() => on('accountTx', refresh), [refresh]);

  const failedEmpty = !!error && !entries.length;
  useEffect(() => {
    if (online && failedEmpty) refresh();
  }, [online, failedEmpty, refresh]);

  const rows = useMemo(
    () => (address ? entries.map(e => processTx(e.tx, e.meta, {account: address, contacts, nativeCode})) : []),
    [entries, address, contacts, nativeCode]
  );

  return {rows, loading, error, hasMore: !!marker, refresh, loadMore: () => void load(marker)};
}

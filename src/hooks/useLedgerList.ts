// Loads a list of ledger objects for the open account, with reload and error handling.
// An unfunded account reports 'NotFoundError' (shown as an info message).
import {useCallback, useEffect, useRef, useState} from 'react';
import {useAccount} from '../state/account';
import {useApp} from '../state/app';
import {errorMessage, isNotFound} from '../xrpl/api';

export function useLedgerList<T>(load: () => Promise<T[]>) {
  const address = useAccount(s => s.address);
  const online = useApp(s => s.online);
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const loadRef = useRef(load);
  loadRef.current = load;
  const request = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError('');
    try {
      const list = await loadRef.current();
      if (id === request.current) setItems(list);
    } catch (err) {
      if (id === request.current) setError(isNotFound(err) ? 'NotFoundError' : errorMessage(err));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [address, refresh]);

  // Retry when the connection comes up after a failed first load.
  const failed = !!error && error !== 'NotFoundError';
  useEffect(() => {
    if (online && failed) void refresh();
  }, [online, failed, refresh]);

  return {items, loading, error, refresh};
}

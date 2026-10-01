// Tracks named transaction actions on a screen: working -> submitted -> validated or failed.
//   const tx = useTx(ok => ok && reload());
//   tx.run('mint', () => api.mintNFT(...));   <TxStatus state={tx.status.mint} />
import {useCallback, useEffect, useRef, useState} from 'react';
import {on, type TxEvent} from '../core/events';

export interface TxStatusState {
  working?: boolean;
  state?: 'submitted' | 'success' | 'fail' | 'error';
  hash?: string;
  error?: string;
}

export interface TxTracker {
  status: Record<string, TxStatusState>;
  busy(name: string): boolean;
  clear(name: string): void;
  /** Resolves with the hash, or null when submission failed (the error is shown in the status). */
  run(name: string, fn: () => Promise<string> | string): Promise<string | null>;
}

export function useTx(onSettled?: (success: boolean, tx: TxEvent) => void): TxTracker {
  const [status, setStatus] = useState<Record<string, TxStatusState>>({});
  const statusRef = useRef(status);
  statusRef.current = status;
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  useEffect(() => {
    const settle = (tx: TxEvent, state: 'success' | 'fail') => {
      const names = Object.keys(statusRef.current).filter(k => statusRef.current[k].hash === tx.hash);
      if (!names.length) return;
      setStatus(s => {
        const next = {...s};
        for (const name of names) next[name] = {...next[name], state, error: state === 'fail' ? tx.message : undefined};
        return next;
      });
      settledRef.current?.(state === 'success', tx);
    };
    const offSuccess = on('txSuccess', tx => settle(tx, 'success'));
    const offFail = on('txFail', tx => settle(tx, 'fail'));
    return () => {
      offSuccess();
      offFail();
    };
  }, []);

  const run = useCallback(async (name: string, fn: () => Promise<string> | string) => {
    setStatus(s => ({...s, [name]: {working: true}}));
    try {
      const hash = await fn();
      setStatus(s => ({...s, [name]: {state: 'submitted', hash}}));
      return hash;
    } catch (err) {
      const message = (err as {message?: string})?.message || String(err);
      setStatus(s => ({...s, [name]: {state: 'error', error: message}}));
      return null;
    }
  }, []);

  return {
    status,
    busy: name => !!status[name]?.working,
    clear: name => setStatus(s => {
      const next = {...s};
      delete next[name];
      return next;
    }),
    run
  };
}

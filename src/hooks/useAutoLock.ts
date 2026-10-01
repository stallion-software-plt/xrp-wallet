// Locks an open wallet after a period without keyboard, mouse or touch input. The clock is checked
// every few seconds against the time of the last input, so a computer waking from sleep after the
// timeout locks straight away. Watch-only sessions hold no secrets and aren't locked.
import {useEffect, useRef} from 'react';
import {useAccount} from '../state/account';
import {useApp} from '../state/app';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'] as const;
const CHECK_EVERY_MS = 5000;

export function useAutoLock(onLock: (minutes: number) => void): void {
  const address = useAccount(s => s.address);
  const readOnly = useAccount(s => s.readOnly);
  const minutes = useApp(s => s.autoLockMinutes);
  const lockRef = useRef(onLock);
  lockRef.current = onLock;

  useEffect(() => {
    if (!address || readOnly) return;
    let last = Date.now();
    const touch = () => {
      last = Date.now();
    };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, touch, {capture: true, passive: true});
    const timer = setInterval(() => {
      if (Date.now() - last >= minutes * 60000) lockRef.current(minutes);
    }, CHECK_EVERY_MS);
    return () => {
      clearInterval(timer);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, touch, {capture: true});
    };
  }, [address, readOnly, minutes]);
}

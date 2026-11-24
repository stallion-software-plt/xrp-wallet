// In-app yes/no questions. The browser's window.confirm stops all page timers while it is open, so a
// wallet left on one would never auto-lock.
import {create} from 'zustand';
import {isOpen, onSessionChange} from '../core/session';

export const useConfirm = create<{message: string | null}>(() => ({message: null}));

let settle: ((ok: boolean) => void) | null = null;

export function answerConfirm(ok: boolean): void {
  const done = settle;
  settle = null;
  useConfirm.setState({message: null});
  done?.(ok);
}

/** Asks the user; resolves false if they decline or the wallet locks first. */
export function askConfirm(message: string): Promise<boolean> {
  settle?.(false);
  return new Promise(resolve => {
    settle = resolve;
    useConfirm.setState({message});
  });
}

onSessionChange(() => {
  if (!isOpen()) answerConfirm(false);
});

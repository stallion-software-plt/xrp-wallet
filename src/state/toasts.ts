// Short notifications, including transaction progress.
import {create} from 'zustand';
import {on} from '../core/events';
import {clearClipboard, copyText, readClipboardText} from '../platform/desktop';

export interface Toast {
  id: number;
  type: 'info' | 'success' | 'error' | 'copy';
  /** Translation key. */
  title: string;
  /** Translation key or plain text. */
  message?: string;
  hash?: string;
}

interface ToastState {
  toasts: Toast[];
}

export const useToasts = create<ToastState>(() => ({toasts: []}));

let seq = 0;

export function dismiss(id: number): void {
  useToasts.setState(s => ({toasts: s.toasts.filter(t => t.id !== id)}));
}

export function showToast(options: Omit<Toast, 'id'> & {duration?: number}): void {
  const {duration, ...rest} = options;
  const toast: Toast = {id: ++seq, ...rest};
  useToasts.setState(s => ({toasts: [...s.toasts, toast].slice(-4)}));
  setTimeout(() => dismiss(toast.id), duration || (toast.type === 'error' ? 9000 : 5000));
}

const SECRET_CLIPBOARD_MS = 30000;

/** Copies text and confirms with a toast. A `secret` is not shown in the toast, and is cleared from
 *  the clipboard after 30 seconds unless something else was copied since. */
export async function copy(text: string | null | undefined, options: {secret?: boolean} = {}): Promise<void> {
  if (!text) return;
  try {
    await copyText(text);
    if (options.secret) {
      showToast({type: 'copy', title: 'copied', message: 'copied_secret'});
      setTimeout(async () => {
        const current = await readClipboardText();
        if (current === null || current === text) await clearClipboard().catch(() => {});
      }, SECRET_CLIPBOARD_MS);
    } else {
      showToast({type: 'copy', title: 'copied', message: text.length > 64 ? text.substring(0, 61) + '...' : text});
    }
  } catch (e) {
    console.error('Copy failed', e);
  }
}

on('txSubmitted', tx => showToast({type: 'info', title: 'tx_submitted_title', message: tx.type, hash: tx.hash}));
on('txSuccess', tx => showToast({type: 'success', title: 'tx_validated_title', message: tx.type, hash: tx.hash}));
on('txFail', tx => showToast({type: 'error', title: 'tx_failed_title', message: tx.message, hash: tx.hash}));

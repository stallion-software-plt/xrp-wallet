// Access to NW.js and Node.js. The packaged app always runs in NW.js; `npm run dev` runs the same
// code in a normal browser, where these fall back to web APIs.

const w = (typeof window !== 'undefined' ? window : {}) as any;

/** NW.js's `nw` object, when running in the desktop app. */
export const nw: any = w.nw;

/** True inside NW.js, where Node.js modules are available. */
export const isDesktop = typeof w.require === 'function' && !!nw;

/** Loads a Node.js built-in module (desktop only). */
export function nodeModule<T = any>(name: string): T {
  if (!isDesktop) throw new Error(`${name} is only available in the desktop app.`);
  return w.require(name) as T;
}

/** Opens a web link in the system browser. Anything but http(s) is ignored: URLs can come from
 *  remote data (gateway lists, NFT metadata), and the system shell would also open local files. */
export function openExternal(url: string | null | undefined): void {
  if (!url || !/^https?:\/\//i.test(String(url))) return;
  if (nw?.Shell?.openExternal) {
    nw.Shell.openExternal(String(url));
  } else {
    window.open(String(url), '_blank', 'noopener,noreferrer');
  }
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    if (nw?.Clipboard) {
      nw.Clipboard.get().set(text, 'text');
    } else {
      throw new Error('Clipboard unavailable');
    }
  }
}

/** Empties the clipboard. Uses NW.js's clipboard, which works even when the window isn't focused
 *  (the web clipboard API refuses then, and the user has usually switched apps to paste). */
export async function clearClipboard(): Promise<void> {
  if (nw?.Clipboard) {
    nw.Clipboard.get().clear();
    return;
  }
  await navigator.clipboard.writeText('');
}

/** The clipboard's text, or null when it can't be read. */
export async function readClipboardText(): Promise<string | null> {
  try {
    if (nw?.Clipboard) return nw.Clipboard.get().get('text') ?? '';
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

/** Stops Chromium from offering to save the wallet password, and forgets any it saved. */
export function disablePasswordSaving(): void {
  const chrome = w.chrome;
  try {
    const ignore = () => chrome?.runtime?.lastError;
    if (chrome?.passwordsPrivate) {
      chrome.passwordsPrivate.getSavedPasswordList((passwords: Array<{id?: number}>) => {
        if (ignore()) return;
        (passwords || []).forEach((p, i) => chrome.passwordsPrivate.removeSavedPassword(p?.id ?? i, ignore));
      });
    }
    chrome?.privacy?.services?.passwordSavingEnabled?.set({value: false}, ignore);
  } catch (e) {
    console.warn('Could not disable password saving', e);
  }
}

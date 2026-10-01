// Choosing, reading and writing wallet files. In NW.js these are real paths on disk. In a plain
// browser (`npm run dev`), opening reads the chosen file and saving downloads it.
import {isDesktop, nodeModule} from './desktop';

/** A chosen file: a path on disk, or (browser only) the picked File. */
export interface FileRef {
  path: string;
  name: string;
  file?: File;
}

const BROWSER_PREFIX = 'browser:';

function chooser(configure: (input: HTMLInputElement) => void): Promise<HTMLInputElement | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    configure(input);
    input.addEventListener('change', () => resolve(input), {once: true});
    input.addEventListener('cancel', () => resolve(null), {once: true});
    input.click();
  });
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export async function chooseFileToOpen(): Promise<FileRef | null> {
  const input = await chooser(() => {});
  const file = input?.files?.[0];
  if (!file) return null;
  // NW.js adds the full path to File objects.
  const path = (file as File & {path?: string}).path || input.value;
  if (isDesktop && path) return {path, name: baseName(path)};
  return {path: BROWSER_PREFIX + file.name, name: file.name, file};
}

export async function chooseFileToSave(defaultName: string): Promise<FileRef | null> {
  if (!isDesktop) {
    const name = window.prompt('File name', defaultName);
    return name ? {path: BROWSER_PREFIX + name, name} : null;
  }
  const input = await chooser(el => {
    el.setAttribute('nwsaveas', defaultName);
    (el as HTMLInputElement & {nwsaveas?: string}).nwsaveas = defaultName;
  });
  const path = input?.value;
  return path ? {path, name: baseName(path)} : null;
}

export async function readTextFile(ref: FileRef): Promise<string> {
  if (ref.file) return ref.file.text();
  const fs = nodeModule<typeof import('node:fs')>('fs');
  return fs.promises.readFile(ref.path, 'utf8');
}

export async function writeTextFile(path: string, text: string): Promise<void> {
  if (path.startsWith(BROWSER_PREFIX)) {
    const url = URL.createObjectURL(new Blob([text], {type: 'text/plain'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = path.substring(BROWSER_PREFIX.length);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  // Write a temporary file next to the target, flush it to disk, then rename it over the target, so a
  // crash or a full disk never leaves a half-written wallet file. Only the owner may read it.
  const fs = nodeModule<typeof import('node:fs')>('fs');
  const tmp = `${path}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.tmp`;
  let handle: import('node:fs').promises.FileHandle | undefined;
  try {
    handle = await fs.promises.open(tmp, 'wx', 0o600);
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.promises.rename(tmp, path);
  } catch (err) {
    await handle?.close().catch(() => {});
    await fs.promises.rm(tmp, {force: true}).catch(() => {});
    // The default folder on macOS can be the read-only disk root the first time.
    if ((err as NodeJS.ErrnoException).code === 'EACCES' || (err as NodeJS.ErrnoException).code === 'EPERM') {
      throw new Error('Permission denied. Please choose another location.');
    }
    throw err;
  }
}

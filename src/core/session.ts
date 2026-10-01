// The open wallet. The secret key, recovery phrase and password are kept in this module's memory
// only, never in localStorage or sessionStorage (Chromium can write session storage to its
// profile folder on disk). Reloading the window or logging out closes the wallet.
import {signPaymentChannelClaim, type SubmittableTransaction, type Wallet} from 'xrpl';
import {walletFromSecret} from './id';
import {decryptWallet, encryptWallet, forgetDerivedKeys, PBKDF2_ITERATIONS, walletIterations, type Contact, type WalletData} from './walletFile';
import {readTextFile, writeTextFile, type FileRef} from '../platform/files';

interface FileSession {
  kind: 'file';
  data: WalletData;
  password: string;
  path: string;
}

interface WatchSession {
  kind: 'watch';
  address: string;
}

let session: FileSession | WatchSession | null = null;
const listeners = new Set<() => void>();

function changed() {
  listeners.forEach(l => l());
}

export function onSessionChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Earlier versions kept the open wallet (with its password) in sessionStorage; remove any copy.
try {
  window.sessionStorage.removeItem('authdata');
  window.sessionStorage.removeItem('authtype');
} catch {
  // storage unavailable
}

export function isOpen(): boolean {
  return !!session;
}

export function address(): string | null {
  if (!session) return null;
  return session.kind === 'file' ? session.data.address : session.address;
}

/** True for a watch-only session, which can't sign. */
export function isReadOnly(): boolean {
  return session?.kind === 'watch';
}

export function contacts(): Contact[] {
  return session?.kind === 'file' ? session.data.contacts.slice() : [];
}

export function walletPath(): string | null {
  return session?.kind === 'file' ? session.path : null;
}

export async function openFile(ref: FileRef, password: string): Promise<void> {
  const blob = await readTextFile(ref);
  const data = decryptWallet(password, blob);
  if (data.address.startsWith('G')) throw new Error('Wallet file is a Stellar file.');
  // Fails early if the secret doesn't match the address.
  walletFromSecret(data.secret, data.address);
  // Re-save files encrypted with fewer PBKDF2 iterations than today's, so they get harder to crack.
  // Not in the browser dev mode (that would download a file), and not fatal (e.g. read-only media).
  if (!ref.file && walletIterations(blob) < PBKDF2_ITERATIONS) {
    try {
      await writeTextFile(ref.path, encryptWallet(password, data));
    } catch (e) {
      console.warn('Could not upgrade the wallet file encryption', (e as Error).message);
    }
  }
  session = {kind: 'file', data, password, path: ref.path};
  changed();
}

/** Writes a new wallet file. Open it with openCreated() once the user has backed it up. */
export async function createFile(path: string, password: string, secret: string, mnemonic: string): Promise<WalletData> {
  const wallet = walletFromSecret(secret);
  const data: WalletData = {address: wallet.classicAddress, secret: secret.trim(), mnemonic, contacts: [], created: new Date().toJSON()};
  await writeTextFile(path, encryptWallet(password, data));
  return data;
}

export function openCreated(data: WalletData, password: string, path: string): void {
  session = {kind: 'file', data, password, path};
  changed();
}

export function openWatchOnly(address: string): void {
  session = {kind: 'watch', address: address.trim()};
  changed();
}

export function close(): void {
  session = null;
  forgetDerivedKeys();
  changed();
}

function fileSession(): FileSession {
  if (session?.kind !== 'file') throw new Error('This wallet is watch-only and cannot sign.');
  return session;
}

function wallet(): Wallet {
  const s = fileSession();
  return walletFromSecret(s.data.secret, s.data.address);
}

/** Signs a prepared transaction. */
export function sign(tx: SubmittableTransaction): {tx_blob: string; hash: string} {
  return wallet().sign(tx);
}

export function publicKey(): string {
  return wallet().publicKey;
}

/** Off-ledger payment channel claim signature for `amountXrp`. */
export function signChannelClaim(channelId: string, amountXrp: string): string {
  return signPaymentChannelClaim(channelId, amountXrp, wallet().privateKey);
}

/** Secret key and recovery phrase, for the backup screen. */
export function revealSecrets(): {secret: string; mnemonic: string} {
  const s = fileSession();
  return {secret: s.data.secret, mnemonic: s.data.mnemonic};
}

/** Replaces the contact list and saves the wallet file. */
export async function saveContacts(list: Contact[]): Promise<void> {
  const s = fileSession();
  const data = {...s.data, contacts: list.map(c => ({...c}))};
  await writeTextFile(s.path, encryptWallet(s.password, data));
  s.data = data;
  changed();
}

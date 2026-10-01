// The encrypted wallet file. The format is unchanged from earlier versions, so existing files
// open and files saved here open in earlier versions:
//   base64( sjcl.encrypt("<password length>|<password>", json, AES-256-CCM, PBKDF2) )
// where json = {account_id, contacts, created, masterkey, mnemonic}.
import sjcl from 'sjcl';

export interface Contact {
  name: string;
  address: string;
  /** Destination tag. */
  dt?: string | number;
  [extra: string]: unknown;
}

export interface WalletData {
  address: string;
  secret: string;
  mnemonic: string;
  contacts: Contact[];
  created?: string;
}

/** PBKDF2-HMAC-SHA256 iterations for files saved from now on (the OWASP recommendation). Each file
 *  records its own count, so files saved with fewer iterations still open, and earlier versions of
 *  the app can open files saved with more. */
export const PBKDF2_ITERATIONS = 600000;

function key(password: string): string {
  return `${password.length}|${password}`;
}

/** sjcl caches derived keys in memory, indexed by the password itself. Drop them after each use so
 *  neither the password nor the key outlives the operation. */
export function forgetDerivedKeys(): void {
  const misc = sjcl.misc as unknown as Record<string, unknown>;
  for (const name of ['pa', '_pbkdf2Cache']) {
    if (misc[name] && typeof misc[name] === 'object') misc[name] = {};
  }
}

export function encryptWallet(password: string, data: WalletData, iterations = PBKDF2_ITERATIONS): string {
  const plaintext = JSON.stringify({
    account_id: data.address,
    contacts: data.contacts.map(c => ({...c})),
    created: data.created,
    masterkey: data.secret,
    mnemonic: data.mnemonic || undefined
  });
  const params = {ks: 256, iter: iterations} as sjcl.SjclCipherEncryptParams;
  try {
    return btoa(String(sjcl.encrypt(key(password), plaintext, params)));
  } finally {
    forgetDerivedKeys();
  }
}

/** The PBKDF2 iteration count a wallet file was saved with (0 if unreadable). */
export function walletIterations(blob: string): number {
  try {
    return Number(JSON.parse(atob(blob.trim())).iter) || 0;
  } catch {
    return 0;
  }
}

/** Decrypts a wallet file. Throws on a wrong password or an unreadable file. */
export function decryptWallet(password: string, blob: string): WalletData {
  let object;
  try {
    object = JSON.parse(sjcl.decrypt(key(password), atob(blob.trim())));
  } catch {
    // The same message for every failure, so no part of the file ends up in an error message.
    throw new Error('Wallet file or password is wrong.');
  } finally {
    forgetDerivedKeys();
  }
  if (!object?.account_id || !object?.masterkey) throw new Error('Wallet file or password is wrong.');
  return {
    address: object.account_id,
    secret: object.masterkey,
    mnemonic: object.mnemonic || '',
    contacts: Array.isArray(object.contacts) ? object.contacts : [],
    created: object.created
  };
}

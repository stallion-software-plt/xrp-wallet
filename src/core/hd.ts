// SLIP-0010 key derivation for the ed25519 curve (hardened indexes only), as done by the
// `ed25519-hd-key` package the wallet used before. Only the derived key bytes are used: they
// seed a secp256k1 account (see id.ts), which is how existing recovery phrases map to accounts.
import {hmac} from '@noble/hashes/hmac.js';
import {sha512} from '@noble/hashes/sha2.js';
import {utf8ToBytes} from '@noble/hashes/utils.js';

const HARDENED_OFFSET = 0x80000000;

export interface DerivedKey {
  key: Uint8Array;
  chainCode: Uint8Array;
}

/** Derives the key at `path`, e.g. "m/44'/144'/0'". Every segment must be hardened. */
export function derivePath(path: string, seed: Uint8Array): DerivedKey {
  if (!/^m(\/\d+')+$/.test(path)) throw new Error(`Invalid derivation path: ${path}`);
  const master = hmac(sha512, utf8ToBytes('ed25519 seed'), seed);
  let key = master.slice(0, 32);
  let chainCode = master.slice(32);
  for (const segment of path.split('/').slice(1)) {
    const index = Number(segment.slice(0, -1)) + HARDENED_OFFSET;
    const data = new Uint8Array(37);
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, index);
    const child = hmac(sha512, chainCode, data);
    key = child.slice(0, 32);
    chainCode = child.slice(32);
  }
  return {key, chainCode};
}

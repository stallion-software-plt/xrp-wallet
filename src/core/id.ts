// Accounts, secrets and recovery phrases.
import {entropyToMnemonic, generateMnemonic as newMnemonic, mnemonicToEntropy, mnemonicToSeedSync, validateMnemonic} from '@scure/bip39';
import {wordlist as english} from '@scure/bip39/wordlists/english.js';
import {wordlist as chinese} from '@scure/bip39/wordlists/simplified-chinese.js';
import {wordlist as japanese} from '@scure/bip39/wordlists/japanese.js';
import {ECDSA, isValidClassicAddress, isValidSecret as xrplIsValidSecret, Wallet} from 'xrpl';
import {derivePath} from './hd';

export type MnemonicLang = 'en' | 'cn' | 'jp';

const WORDLISTS: Record<MnemonicLang, string[]> = {en: english, cn: chinese, jp: japanese};

export interface Keypair {
  address: string;
  secret: string;
}

export function isValidAddress(address: string | undefined | null): boolean {
  return !!address && isValidClassicAddress(address.trim());
}

export function isValidSecret(secret: string | undefined | null): boolean {
  if (!secret) return false;
  try {
    return xrplIsValidSecret(secret.trim());
  } catch {
    return false;
  }
}

/** Single spaces between words; Japanese phrases may use ideographic spaces. */
function normalizePhrase(input: string): string {
  return input.normalize('NFKD').trim().split(/\s+/).join(' ').toLowerCase();
}

function phraseLang(input: string): MnemonicLang | null {
  const phrase = normalizePhrase(input);
  for (const lang of Object.keys(WORDLISTS) as MnemonicLang[]) {
    if (validateMnemonic(phrase, WORDLISTS[lang])) return lang;
  }
  return null;
}

export function isValidMnemonic(input: string | undefined | null): boolean {
  return !!input && phraseLang(input) !== null;
}

/** A new 12-word English recovery phrase. */
export function generateMnemonic(): string {
  return newMnemonic(english, 128);
}

/**
 * The English phrase for any supported phrase. Chinese and Japanese phrases are converted
 * through their entropy, so they restore the same account as their English form.
 */
export function mnemonicInEnglish(input: string): string {
  const lang = phraseLang(input);
  if (!lang) throw new Error('Invalid mnemonic');
  const phrase = normalizePhrase(input);
  return lang === 'en' ? phrase : entropyToMnemonic(mnemonicToEntropy(phrase, WORDLISTS[lang]), english);
}

/** The phrase in another word list (same entropy, same account). */
export function mnemonicInLang(mnemonic: string, lang: MnemonicLang): string {
  if (!mnemonic) return '';
  return entropyToMnemonic(mnemonicToEntropy(mnemonicInEnglish(mnemonic), english), WORDLISTS[lang]);
}

/**
 * The account for a recovery phrase, or a random new account without one.
 * Phrase accounts: BIP-39 seed, SLIP-0010 path m/44'/144'/0', and the first 16 bytes of that
 * key as secp256k1 entropy. Kept identical to earlier versions so phrases restore the same account.
 */
export function generateAccount(mnemonic?: string): Keypair {
  if (mnemonic) {
    const seed = mnemonicToSeedSync(mnemonicInEnglish(mnemonic));
    const {key} = derivePath("m/44'/144'/0'", seed);
    const wallet = Wallet.fromEntropy(key.slice(0, 16), {algorithm: ECDSA.secp256k1});
    return {address: wallet.classicAddress, secret: wallet.seed!};
  }
  const wallet = Wallet.generate(ECDSA.secp256k1);
  return {address: wallet.classicAddress, secret: wallet.seed!};
}

/**
 * The signing wallet for a secret. The key type follows the secret ("sEd…" is ed25519). Earlier
 * versions always used secp256k1, so for a saved wallet whose address only matches that way,
 * pass the saved address to get the same key back.
 */
export function walletFromSecret(secret: string, expectedAddress?: string): Wallet {
  const wallet = Wallet.fromSeed(secret.trim());
  if (!expectedAddress || wallet.classicAddress === expectedAddress) return wallet;
  const legacy = Wallet.fromSeed(secret.trim(), {algorithm: ECDSA.secp256k1});
  if (legacy.classicAddress === expectedAddress) return legacy;
  throw new Error('The secret key does not belong to this account.');
}

export function fromSecret(secret: string): Keypair {
  return {address: walletFromSecret(secret).classicAddress, secret: secret.trim()};
}

/** Default name for a new wallet file, e.g. ripple20260930_091502.txt. */
export function generateFilename(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `ripple${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}.txt`;
}

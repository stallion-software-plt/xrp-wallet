// Keys and wallet files must stay compatible with earlier versions of the app. The vectors in
// compat-vectors.json were recorded with the previous implementation (bip39 3.1,
// ed25519-hd-key 1.3, xrpl 3.1 and sjcl 1.0.9); all phrases are public test phrases.
import {describe, expect, it} from 'vitest';
import {ECDSA, Wallet} from 'xrpl';
import vectors from './compat-vectors.json';
import {fromSecret, generateAccount, isValidMnemonic, mnemonicInEnglish, mnemonicInLang, walletFromSecret} from './id';
import sjcl from 'sjcl';
import {decryptWallet, encryptWallet, walletIterations} from './walletFile';

describe('recovery phrases', () => {
  for (const v of vectors.derivation) {
    it(`derives ${v.address}`, () => {
      expect(generateAccount(v.mnemonic)).toEqual({address: v.address, secret: v.secret});
      expect(fromSecret(v.secret).address).toBe(v.address);
    });

    it(`converts ${v.address} to Chinese and Japanese and back`, () => {
      expect(mnemonicInLang(v.mnemonic, 'cn')).toBe(v.cn);
      expect(mnemonicInLang(v.mnemonic, 'jp')).toBe(v.jp);
      for (const phrase of [v.cn, v.jp]) {
        expect(isValidMnemonic(phrase)).toBe(true);
        expect(mnemonicInEnglish(phrase)).toBe(v.mnemonic);
        expect(generateAccount(phrase).address).toBe(v.address);
      }
    });
  }

  it('accepts extra whitespace and capitals', () => {
    const v = vectors.derivation[0];
    const messy = `  ${v.mnemonic.toUpperCase().split(' ').join('  \n')} `;
    expect(isValidMnemonic(messy)).toBe(true);
    expect(generateAccount(messy).address).toBe(v.address);
  });

  it('rejects an invalid phrase', () => {
    expect(isValidMnemonic('abandon abandon abandon')).toBe(false);
    expect(isValidMnemonic(vectors.derivation[0].mnemonic.replace('about', 'abandon'))).toBe(false);
  });
});

describe('secret keys', () => {
  it('infers ed25519 from an sEd secret but still opens a file saved with the old secp256k1 address', () => {
    const edSecret = 'sEdTM1uX8pu2do5XvTnutH6HsouMaM2';
    const ed = walletFromSecret(edSecret);
    expect(ed.publicKey.startsWith('ED')).toBe(true);
    expect(walletFromSecret(edSecret, ed.classicAddress).classicAddress).toBe(ed.classicAddress);

    const legacyAddress = Wallet.fromSeed(edSecret, {algorithm: ECDSA.secp256k1}).classicAddress;
    expect(legacyAddress).not.toBe(ed.classicAddress);
    const legacy = walletFromSecret(edSecret, legacyAddress);
    expect(legacy.classicAddress).toBe(legacyAddress);
    expect(legacy.publicKey.startsWith('ED')).toBe(false);
  });

  it('rejects a secret that does not match the saved address', () => {
    const [a, b] = vectors.derivation;
    expect(() => walletFromSecret(a.secret, b.address)).toThrow('The secret key does not belong to this account.');
  });
});

describe('wallet file', () => {
  const w = vectors.walletFiles;
  // Hundreds of thousands of PBKDF2 rounds take seconds, more on a busy machine or CI runner than
  // the default 5-second limit.
  const SLOW = 30_000;
  for (const name of ['iter200000', 'iter1000'] as const) {
    it(`opens a file from the previous version (${name})`, {timeout: SLOW}, () => {
      const data = decryptWallet(w.password, w[name]);
      expect(data.address).toBe(w.expected.address);
      expect(data.secret).toBe(w.expected.secret);
      expect(data.mnemonic).toBe(w.expected.mnemonic);
      expect(data.created).toBe(w.expected.created);
      expect(data.contacts).toEqual(w.expected.contacts);
    });
  }

  it('opens a file without a recovery phrase', () => {
    const data = decryptWallet(w.password, w.noMnemonic);
    expect(data.mnemonic).toBe('');
    expect(data.contacts).toEqual([]);
  });

  it('rejects a wrong password', () => {
    expect(() => decryptWallet('wrong', w.iter1000)).toThrow('Wallet file or password is wrong.');
  });

  it('writes files that decrypt to the same data with 600,000 PBKDF2 iterations', {timeout: SLOW}, () => {
    const data = decryptWallet(w.password, w.iter1000);
    const blob = encryptWallet(w.password, data);
    expect(walletIterations(blob)).toBe(600000);
    expect(walletIterations(w.iter1000)).toBe(1000);
    expect(decryptWallet(w.password, blob)).toEqual(data);
  });

  it('writes files the previous version can open (sjcl with the same key format)', {timeout: SLOW}, () => {
    const data = decryptWallet(w.password, w.iter1000);
    const blob = encryptWallet(w.password, data);
    const plain = JSON.parse(sjcl.decrypt(`${w.password.length}|${w.password}`, atob(blob)));
    expect(plain.account_id).toBe(w.expected.address);
    expect(plain.masterkey).toBe(w.expected.secret);
  });

  it('keeps no password or derived key in sjcl after encrypting or decrypting', () => {
    const cache = () => (sjcl.misc as unknown as {pa: Record<string, unknown>}).pa;
    decryptWallet(w.password, w.iter1000);
    expect(Object.keys(cache())).toEqual([]);
    encryptWallet(w.password, decryptWallet(w.password, w.iter1000), 1000);
    expect(Object.keys(cache())).toEqual([]);
    expect(() => decryptWallet('wrong', w.iter1000)).toThrow('Wallet file or password is wrong.');
    expect(Object.keys(cache())).toEqual([]);
  });
});

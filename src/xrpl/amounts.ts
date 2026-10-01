// Ledger amounts: drops strings for XRP, {currency, issuer, value} objects for tokens.
import BigNumber from 'bignumber.js';
import {dropsToXrp, xrpToDrops, type Amount, type Currency, type IssuedCurrencyAmount, type MPTAmount} from 'xrpl';
import {realCode} from '../core/format';
import {useApp} from '../state/app';

/** A display amount: always an object, XRP as {currency: 'XRP', value: '<XRP>'}. */
export interface Value {
  currency: string;
  issuer?: string;
  value: string;
}

export function isNative(code: string | undefined | null): boolean {
  return !code || code === 'XRP' || code === useApp.getState().network.coin.code;
}

/** Ledger amount (or drops) to a display amount. Multi-purpose tokens show as "MPT". */
export function parseAmount(input: Amount | MPTAmount | string | number | undefined | null): Value | null {
  if (input === undefined || input === null) return null;
  if (typeof input === 'object') {
    if ('mpt_issuance_id' in input) return {currency: 'MPT', issuer: input.mpt_issuance_id, value: input.value};
    return 'issuer' in input ? {currency: input.currency, issuer: input.issuer, value: input.value} : {currency: (input as {currency: string}).currency, value: (input as {value: string}).value};
  }
  return {currency: 'XRP', value: String(dropsToXrp(String(input)))};
}

/** Display amount to a ledger amount, rounding tokens to 16 significant digits. */
export function toLedgerAmount(amount: Value): Amount {
  const value = new BigNumber(new BigNumber(amount.value).toPrecision(16)).toString(10);
  if (amount.currency === 'XRP') return xrpToDrops(new BigNumber(value).toFixed(6, BigNumber.ROUND_DOWN));
  return {currency: realCode(amount.currency), issuer: amount.issuer!, value} as IssuedCurrencyAmount;
}

/** A ledger amount from a user-entered value in `code` (the native coin when empty). */
export function toAmount(value: string | number, code?: string, issuer?: string): Amount {
  if (isNative(code)) return xrpToDrops(new BigNumber(value).toFixed(6, BigNumber.ROUND_DOWN));
  return {currency: realCode(code!), issuer: issuer!, value: new BigNumber(value).toString(10)};
}

export function toAsset(code: string | undefined, issuer?: string): Currency {
  return isNative(code) ? {currency: 'XRP'} : {currency: realCode(code!), issuer: issuer!};
}

export function isXrp(amount: Value | Amount | string): boolean {
  return typeof amount === 'object' ? amount.currency === 'XRP' : true;
}

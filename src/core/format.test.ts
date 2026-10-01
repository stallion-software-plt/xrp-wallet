import {describe, expect, it} from 'vitest';
import {asciiToHex, currencyLabel, fmtCode} from './format';

describe('currency codes', () => {
  it('decodes hex codes', () => {
    expect(fmtCode(asciiToHex('SOLO'))).toBe('SOLO');
    expect(currencyLabel('USD')).toBe('USD');
  });

  it('shows the native coin for XRP', () => {
    expect(currencyLabel('XRP')).toBe('XRP');
    expect(currencyLabel('XRP', 'XAG')).toBe('XAG');
  });

  it('marks tokens whose hex code imitates XRP', () => {
    expect(fmtCode(asciiToHex('XRP'))).toBe('XRP (token)');
    expect(fmtCode(asciiToHex('xrp'))).toBe('XRP (token)');
    expect(fmtCode(asciiToHex(' XRP\u0001'))).toBe('XRP (token)');
    expect(currencyLabel(asciiToHex('XRP'))).toBe('XRP (token)');
  });

  it("marks tokens imitating the network's own coin", () => {
    expect(currencyLabel(asciiToHex('XAG'), 'XAG')).toBe('XAG (token)');
    expect(currencyLabel(asciiToHex('XAG'), 'XRP')).toBe('XAG');
  });
});

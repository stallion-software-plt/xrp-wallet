import {describe, expect, it} from 'vitest';
import {poolMatches} from './ammGuard';

const xrp = {currency: 'XRP'};
const realUsd = {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'};
const fakeUsd = {currency: 'USD', issuer: 'rJN8G95QtyZN9razhUuKYFZPGFfbiJ3G22'};
const eur = {currency: 'EUR', issuer: realUsd.issuer};

describe('AMM pool check', () => {
  it('accepts the selected assets in either order', () => {
    expect(poolMatches([xrp, realUsd], [xrp, realUsd])).toBe(true);
    expect(poolMatches([xrp, realUsd], [realUsd, xrp])).toBe(true);
    expect(poolMatches([realUsd, eur], [eur, realUsd])).toBe(true);
  });

  it('rejects the same currency code from another issuer', () => {
    expect(poolMatches([xrp, realUsd], [xrp, fakeUsd])).toBe(false);
    expect(poolMatches([realUsd, eur], [fakeUsd, eur])).toBe(false);
  });

  it('rejects a different pool and a token with no issuer', () => {
    expect(poolMatches([xrp, realUsd], [xrp, eur])).toBe(false);
    expect(poolMatches([xrp, realUsd], [xrp, {currency: 'USD'}])).toBe(false);
    expect(poolMatches([xrp, realUsd], [realUsd, realUsd])).toBe(false);
  });
});

import {describe, expect, it} from 'vitest';
import {xAddressFitsNetwork} from './id';

describe('X-address network', () => {
  it('keeps test addresses off Mainnet and Mainnet addresses off test networks', () => {
    expect(xAddressFitsNetwork(false, 'xrp')).toBe(true);
    expect(xAddressFitsNetwork(true, 'xrp')).toBe(false);
    expect(xAddressFitsNetwork(true, 'xrpTestnet')).toBe(true);
    expect(xAddressFitsNetwork(false, 'xrpTestnet')).toBe(false);
    expect(xAddressFitsNetwork(true, 'xrpTest')).toBe(true);
    expect(xAddressFitsNetwork(false, 'xrpTest')).toBe(false);
  });

  it('accepts both on networks with no fixed flag', () => {
    for (const type of ['xag', 'other'] as const) {
      expect(xAddressFitsNetwork(true, type)).toBe(true);
      expect(xAddressFitsNetwork(false, type)).toBe(true);
    }
  });
});

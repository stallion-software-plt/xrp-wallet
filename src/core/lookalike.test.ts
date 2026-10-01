import {describe, expect, it} from 'vitest';
import {findLookalike, looksAlike} from './lookalike';

const mine = 'rHoZweu79nBqdRqEypfo8habvqkLH1Gj4s';
const bob = 'rfXeTRmpn9wxBfCCeg2zhHfzUh1RmwefMp';
// Made-up look-alikes: same start and end, different middle.
const fakeMine = 'rHoZxxxxxxxxxxxxxxxxxxxxxxxxxxGj4s';
const fakeBob = 'rfXeyyyyyyyyyyyyyyyyyyyyyyyyyyyefMp';

describe('look-alike addresses', () => {
  it('matches a different address with the same start and end', () => {
    expect(looksAlike(fakeMine, mine)).toBe(true);
    expect(looksAlike(mine, mine)).toBe(false);
    expect(looksAlike(bob, mine)).toBe(false);
  });

  it('finds the contact or own address being imitated', () => {
    const known = [{name: '', address: mine}, {name: 'Bob', address: bob}];
    expect(findLookalike(fakeBob, known)).toEqual({name: 'Bob', address: bob});
    expect(findLookalike(fakeMine, known)).toEqual({name: '', address: mine});
    expect(findLookalike(bob, known)).toBeNull();
    expect(findLookalike('rJN8G95QtyZN9razhUuKYFZPGFfbiJ3G22', known)).toBeNull();
  });
});

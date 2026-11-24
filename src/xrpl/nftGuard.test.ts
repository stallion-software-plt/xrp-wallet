import {describe, expect, it} from 'vitest';
import {crossCheckOffer, offerMatches, type OfferEntry, type ShownOffer} from './nftGuard';

const nftId = '000800006203F49C21D5D6E022CB16DE3538F248662FC73C258BA1B200000018';
const owner = 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B';
const other = 'rJN8G95QtyZN9razhUuKYFZPGFfbiJ3G22';
const shown: ShownOffer = {id: 'A'.repeat(64), nftId, owner, amount: '1000000', sell: true};
const entry: OfferEntry = {LedgerEntryType: 'NFTokenOffer', NFTokenID: nftId, Owner: owner, Amount: '1000000', Flags: 1};

describe('NFT offer check', () => {
  it('accepts the offer the user saw', () => {
    expect(offerMatches(shown, entry)).toBe(true);
    expect(offerMatches({...shown, sell: false}, {...entry, Flags: 0})).toBe(true);
  });

  it('compares token values as numbers, with currency and issuer', () => {
    const token = {currency: 'USD', issuer: owner, value: '1.50'};
    const tokenOffer = {...shown, amount: token};
    expect(offerMatches(tokenOffer, {...entry, Amount: {...token, value: '1.5'}})).toBe(true);
    expect(offerMatches(tokenOffer, {...entry, Amount: {...token, value: '15'}})).toBe(false);
    expect(offerMatches(tokenOffer, {...entry, Amount: {...token, issuer: other}})).toBe(false);
    expect(offerMatches(tokenOffer, {...entry, Amount: '1500000'})).toBe(false);
  });

  it('rejects any other difference', () => {
    expect(offerMatches(shown, {...entry, Amount: '900000000'})).toBe(false);
    expect(offerMatches(shown, {...entry, Owner: other})).toBe(false);
    expect(offerMatches(shown, {...entry, NFTokenID: '0'.repeat(64)})).toBe(false);
    expect(offerMatches(shown, {...entry, Flags: 0})).toBe(false);
    expect(offerMatches(shown, {...entry, Destination: other})).toBe(false);
    expect(offerMatches(shown, {...entry, LedgerEntryType: 'Offer'})).toBe(false);
  });

  it('needs one matching server and no disagreement', () => {
    expect(crossCheckOffer(shown, [entry])).toBe('confirmed');
    expect(crossCheckOffer(shown, [null, entry])).toBe('confirmed');
    expect(() => crossCheckOffer(shown, [entry, {...entry, Amount: '5'}])).toThrow('nft_offer_mismatch');
    expect(() => crossCheckOffer(shown, ['missing', entry])).toThrow('nft_offer_mismatch');
  });

  it('refuses when no other server answers, and reports a single-server setup', () => {
    expect(() => crossCheckOffer(shown, [null, null])).toThrow('nft_offer_unverified');
    expect(crossCheckOffer(shown, [])).toBe('single_server');
  });
});

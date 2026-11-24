// NFTokenAcceptOffer names an offer but not its price, so a lying server could show a low price for
// an expensive offer. An offer never changes once created, so other servers can confirm it.
import BigNumber from 'bignumber.js';

const lsfSellNFToken = 0x0001;

type OfferAmount = string | {currency: string; issuer?: string; value: string};

/** The offer as the user saw it. */
export interface ShownOffer {
  id: string;
  nftId: string;
  owner: string;
  amount: OfferAmount;
  sell: boolean;
  destination?: string;
}

export interface OfferEntry {
  LedgerEntryType?: string;
  NFTokenID?: string;
  Owner?: string;
  Amount?: OfferAmount;
  Flags?: number;
  Destination?: string;
}

/** A server's reply: the entry, 'missing' if it has no such offer, or null if it didn't answer. */
export type OfferAnswer = OfferEntry | 'missing' | null;
export type OfferCheck = 'confirmed' | 'single_server';

function sameAmount(a?: OfferAmount, b?: OfferAmount): boolean {
  if (!a || !b || typeof a === 'string' || typeof b === 'string') return a === b;
  return a.currency === b.currency && a.issuer === b.issuer && new BigNumber(a.value).isEqualTo(b.value);
}

export function offerMatches(shown: ShownOffer, entry: OfferEntry): boolean {
  const isSell = ((entry.Flags ?? 0) & lsfSellNFToken) !== 0;
  return entry.LedgerEntryType === 'NFTokenOffer'
    && entry.NFTokenID?.toUpperCase() === shown.nftId.trim().toUpperCase()
    && entry.Owner === shown.owner
    && entry.Destination === shown.destination
    && isSell === shown.sell
    && sameAmount(entry.Amount, shown.amount);
}

/** Throws unless a second server confirms the offer. With no other server configured there is
 *  nothing to compare, and the caller has to tell the user. */
export function crossCheckOffer(shown: ShownOffer, answers: OfferAnswer[]): OfferCheck {
  if (!answers.length) return 'single_server';
  const replies = answers.filter(answer => answer !== null);
  if (replies.some(answer => answer === 'missing' || !offerMatches(shown, answer))) throw new Error('nft_offer_mismatch');
  if (!replies.length) throw new Error('nft_offer_unverified');
  return 'confirmed';
}

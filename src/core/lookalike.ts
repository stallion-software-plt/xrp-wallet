// Address poisoning: scammers create addresses that start and end like one you use (people
// usually only check the ends), then send you a tiny payment so the fake shows up in your history,
// hoping you'll copy it from there next time.

export interface KnownAddress {
  /** Contact name, or '' for the wallet's own address. */
  name: string;
  address: string;
}

/** Two different addresses with the same first 4 and last 3 characters. By chance that happens for
 *  about one address pair in 10^10, so a match almost certainly means one was made to look alike. */
export function looksAlike(a: string, b: string): boolean {
  return !!a && !!b && a !== b && a.slice(0, 4) === b.slice(0, 4) && a.slice(-3) === b.slice(-3);
}

/** The known address that `address` imitates, if any (never `address` itself). */
export function findLookalike(address: string, known: KnownAddress[]): KnownAddress | null {
  if (known.some(k => k.address === address)) return null;
  return known.find(k => looksAlike(address, k.address)) || null;
}

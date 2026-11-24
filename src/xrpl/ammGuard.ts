// A server answers amm_info, and the same currency code can exist under any issuer, so check that
// the pool it returned holds exactly the two assets the user selected.

export interface AssetId {
  currency: string;
  issuer?: string;
}

function sameAsset(a: AssetId, b: AssetId): boolean {
  return a.currency === b.currency && (a.currency === 'XRP' || (!!a.issuer && a.issuer === b.issuer));
}

/** True when the pool's two assets are the selected two, in either order. */
export function poolMatches(selected: [AssetId, AssetId], pool: [AssetId, AssetId]): boolean {
  return (sameAsset(selected[0], pool[0]) && sameAsset(selected[1], pool[1]))
    || (sameAsset(selected[0], pool[1]) && sameAsset(selected[1], pool[0]));
}

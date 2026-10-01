// NFT metadata (name, description, image, attributes) from the NFT's URI. Only used when the user
// turns on NFT media: the servers are chosen by each NFT's creator and see the viewer's IP.

export interface NftMeta {
  name?: string;
  description?: string;
  image?: string;
  attributes?: Array<{trait_type?: string; value?: unknown}>;
}

const cache = new Map<string, NftMeta>();
const pending = new Map<string, Promise<NftMeta>>();

/** ipfs:// links go through the ipfs.io gateway; only https links are used. */
export function resolveUrl(uri: string | undefined): string {
  if (!uri) return '';
  if (uri.startsWith('ipfs://')) return 'https://ipfs.io/ipfs/' + uri.substring(7).replace(/^ipfs\//, '');
  return /^https:\/\//i.test(uri) ? uri : '';
}

export function cachedMeta(id: string): NftMeta | undefined {
  return cache.get(id);
}

export function loadMeta(id: string, uri: string): Promise<NftMeta> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  const running = pending.get(id);
  if (running) return running;
  const url = resolveUrl(uri);
  const done = (meta: NftMeta) => {
    cache.set(id, meta);
    pending.delete(id);
    return meta;
  };
  if (!url) return Promise.resolve(done({}));
  if (/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url)) return Promise.resolve(done({image: url}));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const promise = fetch(url, {signal: controller.signal})
    .then(async response => {
      if ((response.headers.get('content-type') || '').startsWith('image')) return {image: url};
      const data = await response.json();
      return {
        name: String(data.name || data.title || ''),
        description: String(data.description || ''),
        image: resolveUrl(data.image || data.image_url || data.animation_url || ''),
        attributes: Array.isArray(data.attributes) ? data.attributes : []
      };
    })
    .catch(() => ({}))
    .then(meta => {
      clearTimeout(timer);
      return done(meta);
    });
  pending.set(id, promise);
  return promise;
}

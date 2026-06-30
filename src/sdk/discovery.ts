// Follows-based discovery — a no-backend "live now" lobby.
//
// ATProto has no global query across repos, so discovery rides the social graph:
// list who the viewer follows (Bluesky's app.bsky.graph), then check those
// repositories for live room records. A global directory would need an indexer
// crawling the firehose; because the room lexicon is open, that can be built
// later (even by a third party) over the same records.

const DEFAULT_APPVIEW = 'https://public.api.bsky.app';

export interface ListFollowsOptions {
  /** Public appview used to read the follow graph. */
  appView?: string;
  /** Maximum number of follow DIDs to return. */
  limit?: number;
}

/** Return the DIDs the actor follows (paginated up to `limit`). */
export async function listFollowDids(actorDid: string, options: ListFollowsOptions = {}): Promise<string[]> {
  const appView = (options.appView ?? DEFAULT_APPVIEW).replace(/\/+$/, '');
  const limit = options.limit ?? 150;
  const dids: string[] = [];
  let cursor: string | undefined;

  while (dids.length < limit) {
    const url =
      `${appView}/xrpc/app.bsky.graph.getFollows?actor=${encodeURIComponent(actorDid)}&limit=100` +
      (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) break;
    const data = (await res.json()) as { follows?: Array<{ did?: string }>; cursor?: string };
    const page = data.follows ?? [];
    for (const follow of page) {
      if (follow.did) dids.push(follow.did);
    }
    if (!data.cursor || page.length === 0) break;
    cursor = data.cursor;
  }

  return dids.slice(0, limit);
}

/** Run `fn` over `items` with at most `limit` in flight at once, preserving order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

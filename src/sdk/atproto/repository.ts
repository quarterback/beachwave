// A RepositoryClient backed by a real ATProto PDS.
//
// Writes go through the authenticated agent against the signed-in account's
// repository. Reads work against any repository: the adapter resolves the
// target DID's PDS and uses the public, unauthenticated XRPC read endpoints.

import type { RepositoryClient } from '../types.js';
import type { AtprotoAgent } from './agent.js';
import { readJson } from './agent.js';
import { isDid, pdsFromDidDocument, resolveDidDocument, resolveHandle } from './identity.js';
import { parseAtUri } from './uri.js';

const DEFAULT_RESOLVER = 'https://bsky.social';

interface WriteResult {
  uri: string;
  cid?: string;
}

interface GetRecordResult {
  uri: string;
  cid?: string;
  value: unknown;
}

interface ListRecordsResult {
  records: Array<{ uri: string; cid?: string; value: unknown }>;
}

export class AtprotoRepositoryClient implements RepositoryClient {
  private readonly pdsCache = new Map<string, string>();

  constructor(
    private readonly agent: AtprotoAgent,
    private readonly resolverBase: string = DEFAULT_RESOLVER
  ) {
    this.pdsCache.set(agent.did, agent.pds);
  }

  get did(): string {
    return this.agent.did;
  }

  async createRecord(collection: string, record: unknown): Promise<WriteResult> {
    const res = await this.agent.fetch('/xrpc/com.atproto.repo.createRecord', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repo: this.agent.did, collection, record, validate: false })
    });
    const data = await readJson<WriteResult>(res);
    return { uri: data.uri, cid: data.cid };
  }

  async updateRecord(uri: string, record: unknown): Promise<WriteResult> {
    const { authority, collection, rkey } = parseAtUri(uri);
    const res = await this.agent.fetch('/xrpc/com.atproto.repo.putRecord', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repo: authority, collection, rkey, record, validate: false })
    });
    const data = await readJson<WriteResult>(res);
    return { uri: data.uri, cid: data.cid };
  }

  async getRecord(uri: string): Promise<GetRecordResult> {
    const { authority, collection, rkey } = parseAtUri(uri);
    const base = await this.pdsFor(authority);
    const query = new URLSearchParams({ repo: authority, collection, rkey });
    const res = await fetch(`${base}/xrpc/com.atproto.repo.getRecord?${query}`, {
      headers: { accept: 'application/json' }
    });
    const data = await readJson<GetRecordResult>(res);
    return { uri: data.uri, cid: data.cid, value: data.value };
  }

  async listRecords(collection: string, repo: string = this.agent.did): Promise<GetRecordResult[]> {
    const base = await this.pdsFor(repo);
    const query = new URLSearchParams({ repo, collection, limit: '100' });
    const res = await fetch(`${base}/xrpc/com.atproto.repo.listRecords?${query}`, {
      headers: { accept: 'application/json' }
    });
    const data = await readJson<ListRecordsResult>(res);
    return data.records.map((item) => ({ uri: item.uri, cid: item.cid, value: item.value }));
  }

  /** Resolve (and cache) the PDS endpoint for a DID or handle. */
  private async pdsFor(repo: string): Promise<string> {
    const cached = this.pdsCache.get(repo);
    if (cached) return cached;
    const did = isDid(repo) ? repo : await resolveHandle(repo, this.resolverBase);
    const pds = pdsFromDidDocument(await resolveDidDocument(did));
    this.pdsCache.set(repo, pds);
    if (did !== repo) this.pdsCache.set(did, pds);
    return pds;
  }
}

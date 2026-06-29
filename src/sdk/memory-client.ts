import type { RepositoryClient } from './types.js';

export class MemoryRepositoryClient implements RepositoryClient {
  #records = new Map<string, { cid?: string; value: unknown }>();
  #counter = 0;

  constructor(public did: string = 'did:example:alice') {}

  async createRecord(collection: string, record: unknown): Promise<{ uri: string; cid?: string }> {
    const uri = `at://${this.did}/${collection}/${++this.#counter}`;
    const cid = `bafy${this.#counter}`;
    this.#records.set(uri, { cid, value: structuredClone(record) });
    return { uri, cid };
  }

  async updateRecord(uri: string, record: unknown): Promise<{ uri: string; cid?: string }> {
    if (!this.#records.has(uri)) throw new Error(`Record not found: ${uri}`);
    const cid = `bafy${++this.#counter}`;
    this.#records.set(uri, { cid, value: structuredClone(record) });
    return { uri, cid };
  }

  async getRecord(uri: string): Promise<{ uri: string; cid?: string; value: unknown }> {
    const found = this.#records.get(uri);
    if (!found) throw new Error(`Record not found: ${uri}`);
    return { uri, cid: found.cid, value: structuredClone(found.value) };
  }

  async listRecords(collection: string, repo = this.did): Promise<Array<{ uri: string; cid?: string; value: unknown }>> {
    const prefix = `at://${repo}/${collection}/`;
    return Array.from(this.#records.entries())
      .filter(([uri]) => uri.startsWith(prefix))
      .map(([uri, item]) => ({ uri, cid: item.cid, value: structuredClone(item.value) }));
  }
}

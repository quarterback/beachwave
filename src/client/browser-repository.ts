import type { RepositoryClient } from '../sdk/types.js';

interface StoredRecord {
  cid?: string;
  value: unknown;
}

interface StoredRepository {
  counter: number;
  records: Record<string, StoredRecord>;
}

const STORAGE_KEY = 'beachwave.demo.repository';

export class BrowserRepositoryClient implements RepositoryClient {
  constructor(public did: string = 'did:web:ronbronson.dev') {}

  async createRecord(collection: string, record: unknown): Promise<{ uri: string; cid?: string }> {
    const repository = this.read();
    const nextCounter = repository.counter + 1;
    const uri = `at://${this.did}/${collection}/${nextCounter}`;
    const cid = `local-${nextCounter}`;
    repository.counter = nextCounter;
    repository.records[uri] = { cid, value: structuredClone(record) };
    this.write(repository);
    return { uri, cid };
  }

  async updateRecord(uri: string, record: unknown): Promise<{ uri: string; cid?: string }> {
    const repository = this.read();
    if (!repository.records[uri]) throw new Error(`Record not found: ${uri}`);
    const nextCounter = repository.counter + 1;
    const cid = `local-${nextCounter}`;
    repository.counter = nextCounter;
    repository.records[uri] = { cid, value: structuredClone(record) };
    this.write(repository);
    return { uri, cid };
  }

  async getRecord(uri: string): Promise<{ uri: string; cid?: string; value: unknown }> {
    const record = this.read().records[uri];
    if (!record) throw new Error(`Record not found: ${uri}`);
    return { uri, cid: record.cid, value: structuredClone(record.value) };
  }

  async listRecords(collection: string, repo = this.did): Promise<Array<{ uri: string; cid?: string; value: unknown }>> {
    const prefix = `at://${repo}/${collection}/`;
    return Object.entries(this.read().records)
      .filter(([uri]) => uri.startsWith(prefix))
      .map(([uri, record]) => ({ uri, cid: record.cid, value: structuredClone(record.value) }));
  }

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  private read(): StoredRepository {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { counter: 0, records: {} };
    try {
      const parsed = JSON.parse(raw) as Partial<StoredRepository>;
      return { counter: parsed.counter ?? 0, records: parsed.records ?? {} };
    } catch {
      return { counter: 0, records: {} };
    }
  }

  private write(repository: StoredRepository): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(repository));
  }
}

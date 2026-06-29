// ATProto identity resolution: handle/DID -> DID document -> PDS endpoint.
//
// Resolution is deliberately independent of any single PDS so the OAuth client
// can authenticate users on any host, exactly as a third-party app must.

export interface ResolvedIdentity {
  did: string;
  handle?: string;
  /** Personal Data Server base URL (no trailing slash). */
  pds: string;
}

interface DidDocument {
  id?: string;
  alsoKnownAs?: unknown;
  service?: unknown;
}

const DID_RE = /^did:(plc|web):/;

export function isDid(value: string): boolean {
  return DID_RE.test(value.trim());
}

export function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

/** Resolve a handle to a DID using a CORS-enabled appview/entryway resolver. */
export async function resolveHandle(handle: string, resolverBase: string): Promise<string> {
  const url = `${trimTrailingSlash(resolverBase)}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Could not resolve handle "${handle}" (${res.status})`);
  const data = (await res.json()) as { did?: string };
  if (!data.did) throw new Error(`Handle "${handle}" did not resolve to a DID`);
  return data.did;
}

/** Fetch and return the DID document for a did:plc or did:web identifier. */
export async function resolveDidDocument(did: string): Promise<DidDocument> {
  if (did.startsWith('did:plc:')) {
    const res = await fetch(`https://plc.directory/${encodeURIComponent(did)}`, {
      headers: { accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`Could not resolve ${did} (${res.status})`);
    return (await res.json()) as DidDocument;
  }
  if (did.startsWith('did:web:')) {
    const host = did.slice('did:web:'.length).replace(/:/g, '/');
    const res = await fetch(`https://${host}/.well-known/did.json`, {
      headers: { accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`Could not resolve ${did} (${res.status})`);
    return (await res.json()) as DidDocument;
  }
  throw new Error(`Unsupported DID method: ${did}`);
}

/** Extract the ATProto PDS endpoint from a DID document. */
export function pdsFromDidDocument(doc: DidDocument): string {
  const services = Array.isArray(doc.service) ? doc.service : [];
  const pds = services.find((service: unknown) => {
    if (!service || typeof service !== 'object') return false;
    const entry = service as { id?: unknown; type?: unknown };
    return entry.id === '#atproto_pds' || entry.type === 'AtprotoPersonalDataServer';
  }) as { serviceEndpoint?: unknown } | undefined;
  if (!pds || typeof pds.serviceEndpoint !== 'string') {
    throw new Error('DID document has no ATProto PDS endpoint');
  }
  return trimTrailingSlash(pds.serviceEndpoint);
}

/** Best-effort primary handle from a DID document's alsoKnownAs list. */
export function handleFromDidDocument(doc: DidDocument): string | undefined {
  const aka = Array.isArray(doc.alsoKnownAs) ? doc.alsoKnownAs : [];
  const at = aka.find((value: unknown) => typeof value === 'string' && value.startsWith('at://'));
  return typeof at === 'string' ? at.slice('at://'.length) : undefined;
}

/** Resolve a handle or DID to its DID, handle, and PDS endpoint. */
export async function resolveIdentity(input: string, resolverBase: string): Promise<ResolvedIdentity> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('A handle or DID is required');
  const did = isDid(trimmed) ? trimmed : await resolveHandle(normalizeHandle(trimmed), resolverBase);
  const doc = await resolveDidDocument(did);
  return { did, handle: handleFromDidDocument(doc), pds: pdsFromDidDocument(doc) };
}

/** Resolve only the PDS endpoint for a handle or DID (used for public reads). */
export async function resolvePds(input: string, resolverBase: string): Promise<string> {
  const did = isDid(input) ? input : await resolveHandle(normalizeHandle(input), resolverBase);
  return pdsFromDidDocument(await resolveDidDocument(did));
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

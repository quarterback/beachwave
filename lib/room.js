// Server-side room-record resolution (shared by API functions).
//
// Resolves an AT URI to its room record by finding the authority's PDS and
// reading the record over the public XRPC endpoint. No auth required: room
// records are public.

export async function resolveRoomRecord(uri) {
  if (typeof uri !== 'string' || !uri.startsWith('at://')) return null;
  const [authority, collection, rkey] = uri.slice('at://'.length).split('/');
  if (!authority || !collection || !rkey) return null;
  let pds;
  try {
    pds = await resolvePds(authority);
  } catch {
    return null;
  }
  const query = new URLSearchParams({ repo: authority, collection, rkey });
  const res = await fetch(`${pds}/xrpc/com.atproto.repo.getRecord?${query}`, { headers: { accept: 'application/json' } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || typeof data.value !== 'object') return null;
  return { uri, authority, value: data.value };
}

async function resolvePds(did) {
  let doc;
  if (did.startsWith('did:plc:')) {
    doc = await (await fetch(`https://plc.directory/${encodeURIComponent(did)}`)).json();
  } else if (did.startsWith('did:web:')) {
    const hostname = did.slice('did:web:'.length).replace(/:/g, '/');
    doc = await (await fetch(`https://${hostname}/.well-known/did.json`)).json();
  } else {
    throw new Error('unsupported did');
  }
  const services = Array.isArray(doc.service) ? doc.service : [];
  const pds = services.find((s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer');
  if (!pds || typeof pds.serviceEndpoint !== 'string') throw new Error('no pds');
  return pds.serviceEndpoint.replace(/\/+$/, '');
}

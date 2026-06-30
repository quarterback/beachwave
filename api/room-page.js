// Serve the app shell with per-room Open Graph / Twitter Card tags.
//
// A room link (https://<host>/?room=at://...) is a single-page app, so a link
// unfurler — which doesn't run JavaScript — only sees the generic site card.
// This function (reached via a vercel.json rewrite for `/?room=...`) resolves
// the room record server-side and rewrites the <head> metadata to be
// room-specific, while still returning the full app so humans get the SPA.
//
// It is best-effort: if the room can't be resolved, it returns the unmodified
// shell with the default card.

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const origin = `https://${host}`;
  const roomUri = typeof req.query.room === 'string' ? req.query.room : '';

  let shell = await fetchShell(origin);
  if (!shell) {
    res.status(502).send('Unable to load app shell');
    return;
  }

  const room = roomUri.startsWith('at://') ? await resolveRoom(roomUri).catch(() => null) : null;
  if (room) {
    const url = `${origin}/?room=${encodeURIComponent(roomUri)}`;
    shell = injectMeta(shell, buildMeta(room, url, origin));
  }

  // Shared links are opened by many people; let the edge cache the rendered card.
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.status(200).send(shell);
}

async function fetchShell(origin) {
  try {
    const res = await fetch(`${origin}/index.html`, { headers: { accept: 'text/html' } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function injectMeta(shell, meta) {
  const start = shell.indexOf('<!-- og:start -->');
  const end = shell.indexOf('<!-- og:end -->');
  if (start === -1 || end === -1) return shell;
  return shell.slice(0, start) + meta + shell.slice(end + '<!-- og:end -->'.length);
}

function buildMeta(room, url, origin) {
  const live = room.status !== 'ended';
  const title = `${room.title || 'Live room'} · ${live ? 'live' : 'ended'} on Beachwave`;
  const description = room.description || 'A live audio room on Beachwave — sign in with ATProto to join.';
  const image = `${origin}/beachwave-blue.png`;
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  return [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${image}" />`
  ].join('\n    ');
}

async function resolveRoom(uri) {
  const [authority, collection, rkey] = uri.slice('at://'.length).split('/');
  if (!authority || !collection || !rkey) return null;
  const pds = await resolvePds(authority);
  const query = new URLSearchParams({ repo: authority, collection, rkey });
  const res = await fetch(`${pds}/xrpc/com.atproto.repo.getRecord?${query}`, { headers: { accept: 'application/json' } });
  if (!res.ok) return null;
  const data = await res.json();
  return data && typeof data.value === 'object' ? data.value : null;
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

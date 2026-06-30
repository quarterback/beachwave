// Render a per-room Open Graph card image (1200×630) for shared room links.
//
// Link unfurlers show a static image, so a generic logo is the same for every
// room. This edge function resolves the room record and draws the room's title,
// host, and live state onto a branded card, so a shared link previews as the
// specific room. Reached as the og:image URL set by api/room-page.js.
//
// It is best-effort: if the room can't be resolved it renders a branded
// fallback card rather than failing, so the link still previews cleanly.

import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

// Hyperscript helper so this file needs no JSX transform: satori accepts plain
// { type, props } element objects, which is what JSX compiles to anyway.
function h(type, props, ...children) {
  return { type, props: { ...props, children: children.length <= 1 ? children[0] : children } };
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const roomUri = searchParams.get('room') || '';

  const room = roomUri.startsWith('at://') ? await resolveRoom(roomUri).catch(() => null) : null;
  const live = room ? room.status !== 'ended' : true;
  const title = (room && room.title) || 'Live audio on ATProto';
  const host = handleFromUri(roomUri);

  return new ImageResponse(card({ title, host, live }), {
    width: 1200,
    height: 630,
    headers: { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=86400' }
  });
}

function card({ title, host, live }) {
  return h(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px',
        background: 'linear-gradient(135deg, #0a1f44 0%, #123a7a 45%, #2b6fd6 100%)',
        color: '#ffffff',
        fontFamily: 'sans-serif'
      }
    },
    // Top row: brand + live/ended badge.
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', fontSize: 40, fontWeight: 700, letterSpacing: '-0.02em' } },
        'Beachwave'
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            padding: '12px 26px',
            borderRadius: '999px',
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '0.08em',
            background: live ? '#ff3b6b' : 'rgba(255,255,255,0.15)',
            color: '#ffffff'
          }
        },
        live ? h('div', { style: { width: 18, height: 18, borderRadius: '50%', background: '#ffffff' } }) : null,
        live ? 'LIVE' : 'ENDED'
      )
    ),
    // Title + host.
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '24px' } },
      h(
        'div',
        {
          style: {
            display: 'flex',
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            // Clamp very long titles so the card never overflows.
            maxHeight: 252,
            overflow: 'hidden'
          }
        },
        title
      ),
      host
        ? h('div', { style: { display: 'flex', fontSize: 36, color: 'rgba(255,255,255,0.78)' } }, `hosted by ${host}`)
        : null
    ),
    // Footer line.
    h(
      'div',
      { style: { display: 'flex', fontSize: 30, color: 'rgba(255,255,255,0.7)' } },
      'Live audio on the open protocol · ATProto + LiveKit'
    )
  );
}

/** The authority of an AT URI is the host's DID; show a short, readable form. */
function handleFromUri(uri) {
  if (!uri.startsWith('at://')) return '';
  const authority = uri.slice('at://'.length).split('/')[0] || '';
  if (!authority) return '';
  if (authority.length > 28) return `${authority.slice(0, 18)}…${authority.slice(-6)}`;
  return authority;
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

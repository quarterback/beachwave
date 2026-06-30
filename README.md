# Beachwave

Beachwave is a forkable reference implementation for live audio on ATProto. It demonstrates how to authenticate with ATProto OAuth, create room records in ATProto repositories, and connect participants through LiveKit audio transport.

The [live demo](https://beachwave.app/) shows the full loop working — but it is only a demonstration. The point is the repository: fork it and run your own instance. It provides the reusable pieces: lexicon, SDK, media boundary, browser client, and deployment pattern.

Identity comes from ATProto via OAuth, room metadata lives in ATProto records, and media transport is handled separately by LiveKit. The browser client consumes the SDK exactly as any third-party application would — so the demo is proof of the stack, and the repo is the thing you fork, deploy, and adapt.

## What makes it different

Most live-audio apps own your identity, your rooms, and your audience. Beachwave doesn't:

* **Your identity, not an app account.** You sign in with your existing ATProto / Bluesky account via OAuth — there is no Beachwave account to create.
* **Rooms are records you own.** A room is a `community.beachwave.room` record in *your* repository: portable data any client can read, not a row in someone's private database.
* **Discovery rides your social graph.** Going live can publish a Bluesky post, so your followers see it in the timeline they already read. There is no walled-garden directory — and the "live now from people you follow" lobby is built from the follow graph with no backend.
* **Forkable and federated — including the audio.** Anyone can run their own instance. Because each room record says where its media lives (`serviceEndpoint`), a room created on one instance can be discovered *and joined* from another. The protocol interoperates end to end; the reference app is just one client.
* **Media is a swappable layer.** LiveKit handles transport behind a narrow boundary; the open part is the ATProto record layer. Another developer can build a completely different client over the same lexicon and SDK.

The contrast with "invite everyone to a Discord stream": no server to stand up, no separate account, no central owner — you post, and your existing audience joins with their own identity.

## What works today

* Sign in with ATProto OAuth (DPoP, PAR — modern flow, no app passwords required)
* Create / share / join / end live audio rooms backed by ATProto records
* Real-time audio over LiveKit with live participant presence and speaking indicators
* Accessible in-room text chat (an `aria-live` feed over the LiveKit data channel)
* Request to speak with host approval, plus host moderation: invite, mute (move to audience), and remove
* Share a room to your Bluesky feed (a post with a tap-to-join link)
* "Live now" discovery from accounts you follow, with a heartbeat/TTL so stale rooms drop off
* Cross-instance interop: discover and join rooms hosted on other deployments
* Installable as a PWA

For the full design history and rationale behind each piece, see [`docs/aar.md`](docs/aar.md); for the protocol itself, [`docs/protocol.md`](docs/protocol.md).

## Components

* `lexicons/` contains the ATProto record definitions. The initial protocol ships `community.beachwave.room`.
* `src/sdk/` contains a TypeScript SDK that hides raw repository operations behind a stable API.
  * `src/sdk/atproto/` is a dependency-free, browser-native ATProto OAuth implementation (PKCE, DPoP, PAR) plus a real PDS-backed repository adapter.
  * `src/sdk/media/` defines the media-transport boundary and a LiveKit adapter.
* `src/client/` contains a browser reference client that consumes the SDK and uses the Beachwave palette.
* `docs/protocol.md` documents protocol objects independently from the UI; `docs/auth.md` documents authentication.

## Authentication

The client signs in with ATProto OAuth. Local development works out of the box (it uses ATProto's loopback OAuth client); in production the OAuth client metadata is served automatically from your deployed origin by `api/client-metadata.js` (with a `vercel.json` rewrite), so there's nothing to edit — just deploy somewhere publicly reachable. An app-password fallback is available under "Developer options" for local testing only. See `docs/auth.md`.

## Development

```sh
npm install
npm run build
npm test
npm run dev
```

The current browser demo uses the Beachwave palette (`#007dc3`, `#b7d5d4`, `#37393a`, `#f7c1bb`, `#dc136c`) and the local `beachwave.svg` logo. Run `npm run dev` and open `http://localhost:4173` after building.

## Deployment

Beachwave can be deployed as a static site on Vercel or Netlify. The build command is `npm run build`, and the publish/output directory is the repository root (`.`) because `index.html` loads the compiled browser bundle from `dist/client/main.js`. See `docs/deployment.md` for step-by-step instructions.

# Beachwave

Beachwave is a forkable reference implementation for live audio on ATProto. It demonstrates how to authenticate with ATProto OAuth, create room records in ATProto repositories, and connect participants through LiveKit audio transport.

The [live demo](https://beachwave.app/) shows the full loop working — but it is only a demonstration. The point is the repository: fork it and run your own instance. It provides the reusable pieces: lexicon, SDK, media boundary, browser client, and deployment pattern.

Identity comes from ATProto via OAuth, room metadata lives in ATProto records, and media transport is handled separately by LiveKit. The browser client consumes the SDK exactly as any third-party application would — so the demo is proof of the stack, and the repo is the thing you fork, deploy, and adapt.

## What it demonstrates

* fork — clone the repo and run your own instance
* deploy — ship the static client to Vercel or Netlify
* authenticate — sign in with Bluesky / ATProto OAuth
* publish — write `community.beachwave.room` records to your repository
* create / join / share / end — the full live-audio room loop over LiveKit

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

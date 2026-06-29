# Beachwave

Beachwave is an open reference implementation for live audio on ATProto. It defines protocol primitives for decentralized live audio rooms and demonstrates them in a small browser client.

Identity comes from ATProto via OAuth, room metadata lives in ATProto records, and media transport is handled separately by LiveKit. The browser client consumes the SDK exactly as any third-party application would.

## Components

* `lexicons/` contains the ATProto record definitions. The initial protocol ships `community.beachwave.room`.
* `src/sdk/` contains a TypeScript SDK that hides raw repository operations behind a stable API.
  * `src/sdk/atproto/` is a dependency-free, browser-native ATProto OAuth implementation (PKCE, DPoP, PAR) plus a real PDS-backed repository adapter.
  * `src/sdk/media/` defines the media-transport boundary and a LiveKit adapter.
* `src/client/` contains a browser reference client that consumes the SDK and uses the Beachwave palette.
* `docs/protocol.md` documents protocol objects independently from the UI; `docs/auth.md` documents authentication.

## Authentication

The client signs in with ATProto OAuth. Local development works out of the box (it uses ATProto's loopback OAuth client); production needs a hosted `client-metadata.json` (included at the repo root — edit it to your domain). An app-password fallback is available under "Developer options" for local testing only. See `docs/auth.md`.

## Development

```sh
npm install
npm run build
npm test
npm run dev
```

The current browser demo uses the Beachwave palette (`#007dc3`, `#b7d5d4`, `#37393a`, `#f7c1bb`, `#dc136c`) and the local `beachwave.svg` icon. Run `npm run dev` and open `http://localhost:4173` after building.

## Deployment

Beachwave can be deployed as a static site on Vercel or Netlify. The build command is `npm run build`, and the publish/output directory is the repository root (`.`) because `index.html` loads the compiled browser bundle from `dist/client/main.js`. See `docs/deployment.md` for step-by-step instructions.

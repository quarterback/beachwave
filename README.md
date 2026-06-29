# Beachwave

Beachwave is an open reference implementation for live audio on ATProto. It defines protocol primitives for decentralized live audio rooms and demonstrates them in a small browser client with a beach-inspired demo brand.

## Components

* `lexicons/` contains the ATProto record definitions. The initial protocol ships `community.beachwave.room`.
* `src/sdk/` contains a TypeScript SDK that hides raw repository operations behind a stable API.
* `src/client/` contains a browser reference client that consumes the SDK and uses the Beachwave palette.
* `docs/protocol.md` documents protocol objects independently from the UI.

## Development

```sh
npm install
npm run build
npm test
npm run dev
```

The current browser demo uses the Beachwave palette (`#007dc3`, `#b7d5d4`, `#37393a`, `#f7c1bb`, `#dc136c`) and the local `beachwave.svg` icon. Run `npm run dev` and open `http://localhost:4173` after building.

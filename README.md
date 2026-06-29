# Beachwave

Beachwave is an open reference implementation for live audio on ATProto. It defines protocol primitives for decentralized live audio rooms and demonstrates them in a small browser client.

## Components

* `lexicons/` contains the ATProto record definitions. The initial protocol ships `community.beachwave.room`.
* `src/sdk/` contains a TypeScript SDK that hides raw repository operations behind a stable API.
* `src/client/` contains a browser reference client that consumes the SDK.
* `docs/protocol.md` documents protocol objects independently from the UI.

## Development

```sh
npm install
npm run build
npm test
npm run dev
```

The current browser demo is intentionally brand-light so the final name and icon can be swapped in later. Run `npm run dev` and open `http://localhost:4173` after building.

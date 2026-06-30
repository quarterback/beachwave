# Authentication

Beachwave authenticates users with **ATProto OAuth**. Identity always comes from
ATProto; the application never asks for a password in the primary flow. The
implementation lives in `src/sdk/atproto/` and is consumed by the reference
client exactly as a third-party application would consume it.

## Why OAuth

OAuth is how current and future ATProto applications are expected to
authenticate. It gives the user a hosted consent screen on their own
authorization server, issues sender-constrained (DPoP) tokens, and never exposes
long-lived credentials to the application. App passwords remain available only
as an optional development fallback.

## The flow

The client implements the public-client authorization-code flow:

1. **Identity resolution** — the entered handle is resolved to a DID
   (`com.atproto.identity.resolveHandle`), the DID document is fetched
   (`plc.directory` or `did:web`), and the account's PDS endpoint is read from
   it. (`src/sdk/atproto/identity.ts`)
2. **Authorization server discovery** — the PDS advertises its authorization
   server via `/.well-known/oauth-protected-resource`, whose metadata is read
   from `/.well-known/oauth-authorization-server`. (`metadata.ts`)
3. **PKCE** — a code verifier/challenge pair is generated. (`pkce.ts`)
4. **DPoP** — a non-extractable P-256 key pair is generated. Every token and
   resource request carries a signed DPoP proof, and the server's
   `use_dpop_nonce` challenge is handled transparently. (`dpop.ts`,
   `transport.ts`)
5. **Pushed Authorization Request (PAR)** — authorization parameters are pushed
   to the server, which returns a `request_uri`. (`oauth-client.ts`)
6. **Redirect** — the browser is sent to the authorization endpoint with the
   `request_uri`.
7. **Callback** — on return, `state` is validated, the code is exchanged for
   DPoP-bound access/refresh tokens, and the session is persisted.
8. **Authenticated requests & refresh** — `OAuthSession` signs every XRPC call
   with DPoP, binds the access token via the `ath` claim, and refreshes tokens
   ahead of expiry. (`oauth-session.ts`)

## Sessions and storage

* The non-extractable DPoP `CryptoKey` is stored in **IndexedDB** (it survives
  the redirect via structured clone but is never serialized to JSON).
* Session and pending-authorization JSON is stored in **localStorage**.
* This is implemented behind the `OAuthStore` interface (`store.ts`); supply a
  custom store to change persistence.

## Scopes

The client requests `atproto transition:generic` today. `atproto` is the
required base scope; `transition:generic` grants the repository write access the
room lifecycle needs. The OAuth client is scope-agnostic — it forwards whatever
scope string it is given — so adopting granular scopes later is a one-line
configuration change in `src/client/config.ts` (and the hosted client metadata).

## Client identity (`client_id`)

ATProto identifies OAuth clients by a URL that resolves to a metadata document.

* **Production:** `client_id` is `https://<host>/client-metadata.json`. On Vercel
  that path is served by `api/client-metadata.js` (via a `vercel.json` rewrite),
  which derives every URL in the document from the request's Host header — so it
  matches any deployed origin automatically with nothing to edit. On other static
  hosts, serve an equivalent `client-metadata.json` whose URLs match your origin.
* **Local development:** on `localhost`/`127.0.0.1` the client uses ATProto's
  special loopback client, encoding the redirect URI and scope directly into the
  `client_id`. No hosted document is required — `npm run dev` works out of the
  box. (`src/client/config.ts`)

## App-password fallback (development only)

`AppPasswordSession` (`app-password.ts`) signs in with a handle and an app
password using legacy `com.atproto.server.createSession` Bearer tokens. It is
exposed under "Developer options" in the client and is intended only for local
testing before a client metadata document is hosted. Do not rely on it in
production.

## SDK surface

```ts
import { OAuthClient, AtprotoRepositoryClient } from 'beachwave/sdk';

const oauth = new OAuthClient({ clientId, redirectUri });

// Start sign-in (redirects away):
await oauth.authorize('alice.bsky.social');

// On the redirect callback:
const session = await oauth.callback(new URLSearchParams(location.search));

// Or restore a persisted session on load:
const restored = await oauth.restore();

// Drive the room SDK against the real PDS:
const client = new AtprotoRepositoryClient(session);
```

Both `OAuthSession` and `AppPasswordSession` implement the `AtprotoAgent`
interface, so `AtprotoRepositoryClient` (and therefore the whole room SDK) works
identically regardless of how the user signed in.

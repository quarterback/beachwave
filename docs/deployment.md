# Deploying Beachwave

Beachwave is currently a static proof-of-concept web app. It can be deployed to Vercel, Netlify, GitHub Pages, or any static host that can run `npm run build` and serve this repository root.

## What the host needs to serve

The demo entry point is `index.html`. The TypeScript build emits the browser JavaScript into `dist/client/main.js`, and the page loads styles from `src/client/styles.css` plus the local `beachwave.svg` favicon/logo.

Because of that layout, the current static publish directory is the repository root (`.`), not only `dist/`.

## Vercel

1. Import the GitHub repository into Vercel.
2. Use the default framework preset or select **Other**.
3. Set the build command to:

   ```sh
   npm run build
   ```

4. Set the output directory to:

   ```text
   .
   ```

The included `vercel.json` stores those settings for the project.

## Netlify

1. Import the GitHub repository into Netlify.
2. Set the build command to:

   ```sh
   npm run build
   ```

3. Set the publish directory to:

   ```text
   .
   ```

The included `netlify.toml` stores those settings for the project.

## Local preview

Run the same build locally, then serve the repository root:

```sh
npm run build
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## ATProto OAuth client metadata

The reference client authenticates with ATProto OAuth (see `docs/auth.md`).

* **Local development** works with no extra setup: on `localhost`/`127.0.0.1`
  the client uses ATProto's loopback OAuth client. Run `npm run dev` and sign in.
* **Production** requires a client metadata document served at your origin, and
  every URL inside it must match that origin exactly (a mismatch causes
  `invalid_client_metadata` at sign-in). On Vercel this is automatic: the
  function `api/client-metadata.js` derives the origin from the request's own
  Host header and a `vercel.json` rewrite serves it at `/client-metadata.json`.
  It works on every deployment — production, preview, and custom domains — with
  nothing to configure.

  One requirement remains: the deployment must be **publicly reachable**. If
  Vercel **Deployment Protection** (password/SSO) is enabled, the authorization
  server can't fetch `/client-metadata.json` and sign-in fails. Turn protection
  off for any deployment you want to sign in on.

  On other static hosts (Netlify, GitHub Pages) there is no function, so serve a
  `client-metadata.json` whose URLs match your origin — either a static file you
  maintain or an equivalent host function.

## LiveKit media

Beachwave owns room lifecycle, identity, participant state, permissions, and
metadata; LiveKit owns transport and audio. Minting LiveKit tokens requires an
API secret, which can never live in the browser, so a small server-side endpoint
signs them.

A ready-to-use Vercel serverless function is included at `api/token.js`. It
receives `{ livekitRoom, identity, displayName, role }` from the client and
returns `{ url, token }`. `index.html` already points the client at it via:

```html
<meta name="beachwave:livekit-token-endpoint" content="/api/token" />
```

### Enabling audio on Vercel

1. Create a LiveKit project (e.g. [LiveKit Cloud](https://cloud.livekit.io)) and
   copy its **API key**, **API secret**, and **URL** (`wss://<project>.livekit.cloud`).
2. In **Vercel → your project → Settings → Environment Variables**, add:

   | Name | Value |
   | --- | --- |
   | `LIVEKIT_API_KEY` | your LiveKit API key |
   | `LIVEKIT_API_SECRET` | your LiveKit API secret |
   | `LIVEKIT_URL` | `wss://<project>.livekit.cloud` |

   These go in **Vercel**, not GitHub secrets — Vercel builds and runs the
   function, so it needs them at runtime. (GitHub secrets only reach GitHub
   Actions.)
3. Redeploy. "Join audio" now connects microphones; hosts/speakers can publish
   and everyone can listen. The live participant list, speaking indicators, and
   the in-room text chat (an `aria-live` accessibility feed carried over the
   LiveKit data channel) all come with this — no extra configuration.

Until the env vars are set, the endpoint returns `503` and the client surfaces
"LiveKit is not configured on the server".

### Hardening before public use

`api/token.js` currently trusts the caller's `identity` and `role`. That is fine
for early dogfooding, but before a public launch the endpoint should verify the
caller's ATProto session (confirm `identity` matches the authenticated DID) and
derive `role` from the room's host list server-side rather than trusting the
client. See the note at the top of `api/token.js`.

## Current limitations

With OAuth configured and a LiveKit token endpoint connected, the create →
share → join → speak → end flow works end to end against a real PDS. Speaker
request/approval and host moderation beyond ending a room are future milestones
that depend on additional lexicons (Participant, Speaker, Invitation,
Moderation Event).

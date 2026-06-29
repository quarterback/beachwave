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
* **Production** requires a client metadata document served at your origin.
  `client-metadata.json` is included at the repository root and is published as a
  static file. Before going live, edit it so every URL matches your deployed
  origin, for example:

  ```json
  {
    "client_id": "https://rooms.example.com/client-metadata.json",
    "client_uri": "https://rooms.example.com",
    "logo_uri": "https://rooms.example.com/beachwave.svg",
    "redirect_uris": ["https://rooms.example.com/"]
  }
  ```

  The client derives its `client_id` as `<origin>/client-metadata.json` and its
  redirect URI as `<origin>/`, so those must match the document's contents.

## LiveKit media (optional)

Beachwave owns room lifecycle, identity, participant state, permissions, and
metadata; LiveKit owns transport and audio. Minting LiveKit tokens requires an
API secret and therefore a small server-side token endpoint — it cannot be done
in the browser. To enable in-app audio, run a token service and point the client
at it via a meta tag in `index.html`:

```html
<meta name="beachwave:livekit-token-endpoint" content="https://your-token-service.example/token" />
```

The endpoint receives `{ livekitRoom, identity, displayName, role }` and must
return `{ url, token }`. Without it, the client shows the media handoff target
(the `livekitRoom` name) instead of connecting.

## Current limitations

With OAuth configured and a LiveKit token endpoint connected, the create →
share → join → speak → end flow works end to end against a real PDS. Speaker
request/approval and host moderation beyond ending a room are future milestones
that depend on additional lexicons (Participant, Speaker, Invitation,
Moderation Event).

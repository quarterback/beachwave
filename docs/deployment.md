# Deploying Beachwave

Beachwave is currently a static proof-of-concept web app. It can be deployed to Vercel, Netlify, GitHub Pages, or any static host that can run `npm run build` and serve this repository root.

## What the host needs to serve

The demo entry point is `index.html`. The TypeScript build emits the browser JavaScript into `dist/client/main.js`, and the page loads styles from `src/client/styles.css` plus the local `beachwave.svg` favicon/logo via root-relative `/beachwave.svg` URLs so hosted previews load the same asset as local previews.

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

## Current limitations

This deployment is enough to view and demo the browser proof of concept. The app still uses local browser storage instead of a real ATProto PDS and simulates the LiveKit handoff rather than joining live audio.

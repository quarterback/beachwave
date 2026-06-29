// Serve the ATProto OAuth client metadata document, derived from the request's
// own Host header.
//
// ATProto requires every URL inside the document to match the origin it is
// served from, or the authorization server rejects it with
// `invalid_client_metadata`. Computing the origin from the incoming request
// makes that true automatically for every deployment — production, preview, and
// custom domains alike — with nothing to configure.
//
// A vercel.json rewrite maps /client-metadata.json to this function.

const SCOPE = 'atproto transition:generic';

export default function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host) {
    res.status(400).json({ error: 'Missing Host header' });
    return;
  }

  const origin = `https://${host}`;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'public, max-age=300');
  res.status(200).json({
    client_id: `${origin}/client-metadata.json`,
    client_name: 'Beachwave',
    client_uri: origin,
    logo_uri: `${origin}/beachwave.svg`,
    redirect_uris: [`${origin}/`],
    scope: SCOPE,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'web',
    dpop_bound_access_tokens: true
  });
}

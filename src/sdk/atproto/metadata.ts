// Authorization server discovery for ATProto OAuth.
//
// A PDS advertises its authorization server via the protected-resource
// metadata document; the authorization server then advertises its endpoints.

export interface AuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  pushed_authorization_request_endpoint: string;
  revocation_endpoint?: string;
  scopes_supported?: string[];
  dpop_signing_alg_values_supported?: string[];
}

interface ProtectedResourceMetadata {
  authorization_servers?: string[];
}

export async function fetchProtectedResourceMetadata(pds: string): Promise<ProtectedResourceMetadata> {
  const res = await fetch(`${trimTrailingSlash(pds)}/.well-known/oauth-protected-resource`, {
    headers: { accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`Could not load protected-resource metadata from ${pds} (${res.status})`);
  return (await res.json()) as ProtectedResourceMetadata;
}

export async function fetchAuthServerMetadata(issuer: string): Promise<AuthServerMetadata> {
  const base = trimTrailingSlash(issuer);
  const res = await fetch(`${base}/.well-known/oauth-authorization-server`, {
    headers: { accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`Could not load authorization server metadata from ${issuer} (${res.status})`);
  const data = (await res.json()) as Partial<AuthServerMetadata>;
  if (!data.issuer || !data.authorization_endpoint || !data.token_endpoint) {
    throw new Error('Authorization server metadata is missing required endpoints');
  }
  if (!data.pushed_authorization_request_endpoint) {
    throw new Error('Authorization server does not support PAR, which ATProto OAuth requires');
  }
  return data as AuthServerMetadata;
}

/** Discover the authorization server backing a given PDS. */
export async function discoverAuthServer(pds: string): Promise<AuthServerMetadata> {
  const prm = await fetchProtectedResourceMetadata(pds);
  const issuer = prm.authorization_servers?.[0];
  if (!issuer) throw new Error(`PDS ${pds} does not advertise an authorization server`);
  return fetchAuthServerMetadata(issuer);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

// AT URI parsing/formatting (at://<authority>/<collection>/<rkey>).

export interface AtUriParts {
  authority: string;
  collection: string;
  rkey: string;
}

export function parseAtUri(uri: string): AtUriParts {
  if (!uri.startsWith('at://')) throw new Error(`Not an AT URI: ${uri}`);
  const [authority, collection, rkey, ...rest] = uri.slice('at://'.length).split('/');
  if (!authority || !collection || !rkey || rest.length > 0) {
    throw new Error(`Malformed AT URI: ${uri}`);
  }
  return { authority, collection, rkey };
}

export function formatAtUri(parts: AtUriParts): string {
  return `at://${parts.authority}/${parts.collection}/${parts.rkey}`;
}

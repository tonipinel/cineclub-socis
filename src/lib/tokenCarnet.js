// SHA-256 (hexadecimal) del token del carnet: el mateix que desa la Cloud Function `sincronitzarSociPorta` a
// `socisPorta.tokenHash` (functions/socis-porta.js). La porta busca el soci pel hash i mai veu el token de ningú més.
export async function hashTokenCarnet(token) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Expiry (epoch ms) from a JWT's `exp` claim, or null if it can't be read. Not a signature check. */
export function jwtExpiryMs(token: string): number | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    );
    const payload: unknown = JSON.parse(json);
    if (typeof payload === 'object' && payload !== null && 'exp' in payload && typeof payload.exp === 'number') {
      return payload.exp * 1000;
    }
    return null;
  } catch {
    return null;
  }
}
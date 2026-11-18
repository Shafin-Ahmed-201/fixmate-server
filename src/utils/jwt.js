import { createRemoteJWKSet, jwtVerify } from 'jose';
import jwt from 'jsonwebtoken';

let remoteJwks = null;

function jwksUrl() {
  if (process.env.AUTH_JWKS_URL) return new URL(process.env.AUTH_JWKS_URL);
  const base =
    process.env.AUTH_BASE_URL || process.env.CLIENT_URL || 'http://localhost:3000';
  return new URL('/api/auth/jwks', base);
}

function getRemoteJwks() {
  if (!remoteJwks) {
    // BetterAuth signs access tokens with an asymmetric key (EdDSA by default)
    // and publishes the public keys at GET /api/auth/jwks.
    remoteJwks = createRemoteJWKSet(jwksUrl(), {
      cooldownDuration: 30_000,
      cacheMaxAge: 600_000,
    });
  }
  return remoteJwks;
}

/**
 * Verifies a BetterAuth access token.
 * - HS256/384/512 tokens are checked against BETTER_AUTH_SECRET (jsonwebtoken).
 * - Asymmetric tokens (BetterAuth default) are checked against the remote JWKS (jose).
 *
 * @returns {Promise<object>} the decoded JWT payload
 * @throws {Error} when the token is malformed, expired or tampered with
 */
export async function verifyAccessToken(token) {
  const header = jwt.decode(token, { complete: true })?.header;
  const alg = header?.alg;
  if (!alg) throw new Error('Malformed token');

  if (alg.startsWith('HS')) {
    const secret = process.env.BETTER_AUTH_SECRET || process.env.JWT_SECRET;
    if (!secret) throw new Error('BETTER_AUTH_SECRET is not configured');
    return jwt.verify(token, secret, { algorithms: [alg] });
  }

  const { payload } = await jwtVerify(token, getRemoteJwks());
  return payload;
}

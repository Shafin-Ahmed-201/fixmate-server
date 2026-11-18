import { users, toObjectId } from '../config/db.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { ApiError, asyncHandler } from '../utils/http.js';

/**
 * Requires a valid BetterAuth JWT (`Authorization: Bearer <token>`).
 * 401 when the token is missing, invalid or the user no longer exists.
 * The fresh DB user (not the token claims) is the source of truth for role.
 */
export const verifyToken = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.includes(' ') ? header.split(' ')[1] : header;
  if (!token) throw new ApiError(401, 'Authentication token is missing');

  let payload;
  try {
    payload = await verifyAccessToken(token);
  } catch {
    throw new ApiError(401, 'Invalid or expired authentication token');
  }

  const userId = payload.sub || payload.id;
  const user = userId ? await users().findOne({ _id: toObjectId(String(userId)) }) : null;
  if (!user) throw new ApiError(401, 'No user matches this token');

  req.user = user;
  req.auth = payload;
  next();
});

/** 403 unless the authenticated user has the given role. */
const guard = (role) =>
  asyncHandler(async (req, _res, next) => {
    if (req.user?.role !== role) {
      throw new ApiError(403, `This action requires the '${role}' role`);
    }
    next();
  });

export const verifyCustomer = guard('customer');
export const verifyTechnician = guard('technician');
export const verifyAdmin = guard('admin');

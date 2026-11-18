/**
 * Small HTTP helpers shared by every route.
 */

/** Operational error carrying an explicit HTTP status code. */
export class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

/** Wraps an async route handler so rejections reach the error middleware. */
export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

/** Escapes user input before it is used inside a RegExp (search endpoints). */
export const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Strips internal BetterAuth fields before sending a user to a client. */
export const toPublicUser = (user) =>
  user && {
    _id: user._id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
    role: user.role ?? 'customer',
    phone: user.phone ?? '',
    area: user.area ?? '',
    bio: user.bio ?? '',
    createdAt: user.createdAt,
  };

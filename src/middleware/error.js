import { ApiError } from '../utils/http.js';

/** 404 for any request that fell through the router. */
export function notFound(req, _res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

/** Central error responder — keeps route handlers free of try/catch noise. */
export function errorHandler(err, req, res, _next) {
  const status =
    Number(err.statusCode || err.status || (err.name === 'CastError' ? 400 : 0)) || 500;

  if (status >= 500) console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  if (res.headersSent) return;

  res.status(status).json({
    success: false,
    message: status >= 500 ? 'Internal server error' : err.message,
  });
}

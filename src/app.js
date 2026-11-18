import express from 'express';
import cors from 'cors';
import { requestLogger } from './middleware/logger.js';
import { notFound, errorHandler } from './middleware/error.js';
import servicesRouter from './routes/services.routes.js';
import usersRouter from './routes/users.routes.js';
import bookingsRouter from './routes/bookings.routes.js';
import paymentsRouter from './routes/payments.routes.js';
import webhookRouter from './routes/webhook.routes.js';

/** Builds the Express application (pure — no DB or network side effects). */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(requestLogger);

  // Stripe webhooks must receive the raw body for signature verification,
  // so this parser is registered BEFORE express.json().
  app.use('/api/webhook/stripe', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/api', (_req, res) => {
    res.json({ success: true, name: 'FixMate API', version: '1.0.0' });
  });

  app.use('/api/services', servicesRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/bookings', bookingsRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/webhook', webhookRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;

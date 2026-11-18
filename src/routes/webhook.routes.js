import { Router } from 'express';
import { getStripe } from '../config/stripe.js';
import { ApiError, asyncHandler } from '../utils/http.js';
import { recordSessionPayment } from '../services/payment.service.js';

const router = Router();

/**
 * POST /api/webhook/stripe
 * Mounted behind `express.raw()` (see src/app.js) so the signature can be
 * verified against the exact bytes Stripe sent.
 */
router.post(
  '/stripe',
  asyncHandler(async (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = req.headers['stripe-signature'];
    let event;

    if (secret) {
      try {
        event = getStripe().webhooks.constructEvent(req.body, signature, secret);
      } catch (err) {
        console.warn(`[webhook] signature verification failed: ${err.message}`);
        return res
          .status(400)
          .json({ success: false, message: 'Webhook signature verification failed' });
      }
    } else {
      // Development fallback (Stripe CLI without an endpoint secret configured).
      try {
        event = JSON.parse(
          Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body
        );
      } catch {
        throw new ApiError(400, 'Invalid JSON payload');
      }
      console.warn(
        '[webhook] STRIPE_WEBHOOK_SECRET is not set — signature verification skipped (development only)'
      );
    }

    if (event?.type === 'checkout.session.completed') {
      const result = await recordSessionPayment(event.data.object);
      console.log(
        `[webhook] checkout.session.completed → ${
          result.alreadyPaid ? 'already recorded' : 'payment recorded'
        }`
      );
    }

    res.json({ received: true });
  })
);

export default router;

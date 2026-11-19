import { Router } from 'express';
import { bookings, payments, toObjectId } from '../config/db.js';
import { getStripe } from '../config/stripe.js';
import { verifyToken, verifyCustomer } from '../middleware/auth.js';
import { ApiError, asyncHandler } from '../utils/http.js';
import { recordSessionPayment } from '../services/payment.service.js';

const router = Router();

const checkoutBase = () =>
  (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/+$/, '');

/**
 * GET /api/payments/my — the customer's payment history.
 */
router.get(
  '/my',
  verifyToken,
  verifyCustomer,
  asyncHandler(async (req, res) => {
    const list = await payments()
      .find({ customerEmail: req.user.email })
      .sort({ paidAt: -1 })
      .toArray();
    res.json({ success: true, payments: list });
  })
);

/**
 * POST /api/payments/create-checkout-session
 * Amount always comes from the DB (`finalAmount`), never from the client.
 */
router.post(
  '/create-checkout-session',
  verifyToken,
  verifyCustomer,
  asyncHandler(async (req, res) => {
    const bookingId = toObjectId(req.body?.bookingId);
    if (!bookingId) throw new ApiError(400, 'A valid bookingId is required');

    const booking = await bookings().findOne({ _id: bookingId });
    if (!booking) throw new ApiError(404, 'Booking not found');
    if (booking.customerEmail !== req.user.email) {
      throw new ApiError(403, 'You can only pay for your own bookings');
    }
    if (booking.status !== 'completed') {
      throw new ApiError(400, 'Checkout is only available for completed bookings');
    }
    if (booking.paymentStatus === 'paid') {
      throw new ApiError(400, 'This booking has already been paid');
    }
    if (await payments().findOne({ bookingId: booking._id })) {
      throw new ApiError(400, 'This booking has already been paid');
    }

    const amount = Number(booking.finalAmount ?? booking.basePrice);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ApiError(400, 'Booking amount is invalid');
    }

    const productData = {
  name: booking.serviceTitle || 'Repair service',
};

    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      customer_email: req.user.email,
      client_reference_id: String(booking._id),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(amount * 100),
            product_data: productData,
          },
        },
      ],
      metadata: {
        bookingId: String(booking._id),
        customerEmail: req.user.email,
        serviceTitle: booking.serviceTitle || '',
      },
      success_url: `${checkoutBase()}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${checkoutBase()}/payment/cancel`,
    });

    res.json({ success: true, url: session.url, sessionId: session.id });
  })
);

/**
 * GET /api/payments/verify?session_id=...
 * Confirms the Stripe session and records the payment idempotently.
 */
router.get(
  '/verify',
  verifyToken,
  verifyCustomer,
  asyncHandler(async (req, res) => {
    const sessionId = req.query.session_id || req.query.sessionId;
    if (!sessionId || typeof sessionId !== 'string') {
      throw new ApiError(400, 'session_id query parameter is required');
    }

    let session;
    try {
      session = await getStripe().checkout.sessions.retrieve(sessionId);
    } catch {
      throw new ApiError(400, 'Unable to retrieve that Stripe session');
    }

    if (session.status !== 'complete' || session.payment_status !== 'paid') {
      return res.json({
        success: true,
        paid: false,
        message: 'Payment has not been completed yet',
      });
    }

    const ownerEmail = session.metadata?.customerEmail;
    if (ownerEmail && ownerEmail !== req.user.email) {
      throw new ApiError(403, 'This payment session does not belong to you');
    }

    const result = await recordSessionPayment(session);
    res.json({
      success: true,
      paid: true,
      alreadyPaid: Boolean(result.alreadyPaid),
      payment: result.payment ?? null,
    });
  })
);

export default router;

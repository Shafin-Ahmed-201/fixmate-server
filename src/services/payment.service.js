import { getStripe } from '../config/stripe.js';
import { bookings, payments, toObjectId } from '../config/db.js';

/**
 * Records a paid Stripe checkout session exactly once (webhook + success-page
 * retries are both safe thanks to the unique `stripeSessionId` index).
 *
 * @param {import('stripe').Stripe.Checkout.Session} session
 * @returns {Promise<{ recorded: boolean, alreadyPaid?: boolean, payment?: object }>}
 */
export async function recordSessionPayment(session) {
  const stripeSessionId = session?.id;
  if (!stripeSessionId) return { recorded: false, reason: 'missing session id' };
  if (session.payment_status !== 'paid') return { recorded: false, reason: 'session not paid' };

  const existing = await payments().findOne({ stripeSessionId });
  if (existing) return { recorded: true, alreadyPaid: true, payment: existing };

  const metadata = session.metadata || {};
  const bookingId = metadata.bookingId ? toObjectId(metadata.bookingId) : null;
  const booking = bookingId ? await bookings().findOne({ _id: bookingId }) : null;

  const payment = {
    bookingId: booking?._id ?? metadata.bookingId ?? null,
    serviceTitle: booking?.serviceTitle ?? metadata.serviceTitle ?? '',
    customerName: booking?.customerName ?? session.customer_details?.name ?? '',
    customerEmail:
      booking?.customerEmail ?? session.customer_details?.email ?? metadata.customerEmail ?? '',
    technicianName: booking?.technicianName ?? '',
    technicianEmail: booking?.technicianEmail ?? '',
    amount: Number(session.amount_total ?? 0) / 100,
    currency: session.currency ?? 'usd',
    transactionId:
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
    stripeSessionId,
    paymentStatus: 'paid',
    paidAt: new Date(),
  };

  try {
    await payments().insertOne(payment);
  } catch (err) {
    // Concurrent webhook/verify race → the loser reads the winner's record.
    if (err?.code === 11000) {
      const raced = await payments().findOne({ stripeSessionId });
      return { recorded: true, alreadyPaid: true, payment: raced };
    }
    throw err;
  }

  if (booking && booking.paymentStatus !== 'paid') {
    await bookings().updateOne(
      { _id: booking._id, paymentStatus: { $ne: 'paid' } },
      { $set: { paymentStatus: 'paid', updatedAt: new Date() } }
    );
  }

  return { recorded: true, alreadyPaid: false, payment };
}

export { getStripe };

import Stripe from 'stripe';

let stripeClient = null;

/** Lazily builds the Stripe client so the API can boot without a key in dev. */
export function getStripe() {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

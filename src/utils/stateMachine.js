import { ApiError } from './http.js';

/**
 * Booking lifecycle (strictly one-way, one step at a time):
 *
 *   requested → accepted      (technician)
 *   requested → rejected      (technician, final)
 *   requested → cancelled     (customer,  final)
 *   accepted  → in-progress   (technician)
 *   in-progress → completed   (technician, requires finalAmount > 0)
 *   completed (unpaid) → paid (Stripe webhook / verify only, once)
 *
 * Anything else must be rejected with 400 Bad Request.
 */
const TRANSITIONS = {
  requested: { accepted: 'technician', rejected: 'technician', cancelled: 'customer' },
  accepted: { 'in-progress': 'technician' },
  'in-progress': { completed: 'technician' },
  // `rejected`, `cancelled` and `completed` are terminal for status changes.
};

/**
 * Asserts that `from → to` is allowed for `role`.
 * @throws {ApiError} 400 for an illegal transition, 403 for the wrong actor.
 */
export function assertTransition(from, to, role) {
  const allowed = TRANSITIONS[from];

  if (!allowed || !allowed[to]) {
    throw new ApiError(400, `Invalid status transition: '${from}' → '${to}'`);
  }

  if (allowed[to] !== role) {
    throw new ApiError(403, `Only the ${allowed[to]} can move a booking to '${to}'`);
  }
}

/** True when the transition would be legal (useful for UI affordances). */
export const canTransition = (from, to, role) => {
  try {
    assertTransition(from, to, role);
    return true;
  } catch {
    return false;
  }
};

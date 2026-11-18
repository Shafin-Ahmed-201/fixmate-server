/** Domain constants shared across routes, validation and state machine. */

export const CATEGORIES = [
  'Smartphone',
  'Laptop & PC',
  'AC',
  'Refrigerator',
  'TV',
  'Washing Machine',
  'Electrical',
];

export const SERVICE_MODES = ['Home Visit', 'Shop Drop-off'];

export const ROLES = ['customer', 'technician', 'admin'];

export const BOOKING_STATUSES = [
  'requested',
  'accepted',
  'rejected',
  'in-progress',
  'completed',
  'cancelled',
];

/** Statuses that block a second booking for the same service + customer. */
export const ACTIVE_BOOKING_STATUSES = ['requested', 'accepted', 'in-progress'];

export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];

import { Router } from 'express';
import { bookings, services, toObjectId } from '../config/db.js';
import { verifyToken, verifyCustomer, verifyTechnician } from '../middleware/auth.js';
import { ApiError, asyncHandler } from '../utils/http.js';
import { ACTIVE_BOOKING_STATUSES, BOOKING_STATUSES } from '../utils/constants.js';
import { assertTransition } from '../utils/stateMachine.js';

const router = Router();

const startOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const pushHistory = (status) => ({ status, changedAt: new Date() });

/* ------------------------------------------------------------------ */
/* Customer                                                           */
/* ------------------------------------------------------------------ */

/**
 * POST /api/bookings — create a booking for an approved, available service.
 * Guards: customer role, ≥20 char problem description, future date,
 *         no duplicate active booking for the same service.
 */
router.post(
  '/',
  verifyToken,
  verifyCustomer,
  asyncHandler(async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { serviceId, address, preferredDate, problemDescription, phone } = body;

    const sid = toObjectId(serviceId);
    if (!sid) throw new ApiError(400, 'A valid serviceId is required');

    const service = await services().findOne({ _id: sid });
    if (!service || service.approvalStatus !== 'approved' || !service.isAvailable) {
      throw new ApiError(404, 'Service not found or no longer available');
    }

    if (typeof address !== 'string' || !address.trim()) {
      throw new ApiError(400, 'address is required');
    }
    if (typeof problemDescription !== 'string' || problemDescription.trim().length < 20) {
      throw new ApiError(400, 'problemDescription must be at least 20 characters');
    }

    if (!preferredDate || Number.isNaN(new Date(preferredDate).getTime())) {
      throw new ApiError(400, 'preferredDate must be a valid date');
    }
    if (startOfDay(preferredDate) < startOfDay(new Date())) {
      throw new ApiError(400, 'preferredDate must be today or later');
    }

    const customerPhone =
      (typeof phone === 'string' && phone.trim() ? phone.trim() : req.user.phone) || '';
    if (!customerPhone) {
      throw new ApiError(400, 'A phone number is required (add one to your profile)');
    }

    const duplicate = await bookings().findOne({
      serviceId: sid,
      customerEmail: req.user.email,
      status: { $in: ACTIVE_BOOKING_STATUSES },
    });
    if (duplicate) {
      throw new ApiError(409, 'You already have an active booking for this service');
    }

    const now = new Date();
    const doc = {
      serviceId: sid,
      serviceTitle: service.title,
      serviceImage: service.image ?? '',
      category: service.category,
      basePrice: service.basePrice,
      technicianName: service.technicianName,
      technicianEmail: service.technicianEmail,
      customerName: req.user.name,
      customerEmail: req.user.email,
      customerPhone,
      address: address.trim(),
      preferredDate: new Date(preferredDate),
      problemDescription: problemDescription.trim(),
      status: 'requested',
      finalAmount: service.basePrice,
      paymentStatus: 'unpaid',
      statusHistory: [{ status: 'requested', changedAt: now }],
      createdAt: now,
    };

    const { insertedId } = await bookings().insertOne(doc);
    res.status(201).json({ success: true, booking: { ...doc, _id: insertedId } });
  })
);

/**
 * GET /api/bookings/my — the customer's bookings, newest first.
 */
router.get(
  '/my',
  verifyToken,
  verifyCustomer,
  asyncHandler(async (req, res) => {
    const list = await bookings()
      .find({ customerEmail: req.user.email })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ success: true, bookings: list });
  })
);

/**
 * PATCH /api/bookings/:id/cancel — customer may cancel only `requested`.
 */
router.patch(
  '/:id/cancel',
  verifyToken,
  verifyCustomer,
  asyncHandler(async (req, res) => {
    const id = toObjectId(req.params.id);
    const booking = id ? await bookings().findOne({ _id: id }) : null;
    if (!booking) throw new ApiError(404, 'Booking not found');
    if (booking.customerEmail !== req.user.email) {
      throw new ApiError(403, 'You can only cancel your own bookings');
    }
    if (booking.status !== 'requested') {
      throw new ApiError(
        400,
        `Only bookings in 'requested' status can be cancelled (current: '${booking.status}')`
      );
    }

    const now = new Date();
    await bookings().updateOne(
      { _id: id },
      {
        $set: { status: 'cancelled', updatedAt: now },
        $push: { statusHistory: { status: 'cancelled', changedAt: now } },
      }
    );

    const updated = await bookings().findOne({ _id: id });
    res.json({ success: true, booking: updated });
  })
);

/* ------------------------------------------------------------------ */
/* Technician                                                         */
/* ------------------------------------------------------------------ */

/**
 * GET /api/bookings/technician — bookings assigned to the technician.
 * Optional `?status=` filter.
 */
router.get(
  '/technician',
  verifyToken,
  verifyTechnician,
  asyncHandler(async (req, res) => {
    const filter = { technicianEmail: req.user.email };
    if (req.query.status) {
      if (!BOOKING_STATUSES.includes(req.query.status)) {
        throw new ApiError(400, `status must be one of: ${BOOKING_STATUSES.join(', ')}`);
      }
      filter.status = req.query.status;
    }

    const list = await bookings().find(filter).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, bookings: list });
  })
);

/**
 * PATCH /api/bookings/:id/status — enforces the state machine.
 * `completed` additionally requires finalAmount > 0.
 */
router.patch(
  '/:id/status',
  verifyToken,
  verifyTechnician,
  asyncHandler(async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { status, finalAmount } = body;

    if (!BOOKING_STATUSES.includes(status)) {
      throw new ApiError(400, `status must be one of: ${BOOKING_STATUSES.join(', ')}`);
    }

    const id = toObjectId(req.params.id);
    const booking = id ? await bookings().findOne({ _id: id }) : null;
    if (!booking) throw new ApiError(404, 'Booking not found');
    if (booking.technicianEmail !== req.user.email) {
      throw new ApiError(403, 'You can only manage your own bookings');
    }

    // One-way, one-step transitions — anything else is 400/403.
    assertTransition(booking.status, status, req.user.role);

    const now = new Date();
    const update = { $set: { status, updatedAt: now }, $push: { statusHistory: pushHistory(status) } };

    if (status === 'completed') {
      const amount = Number(finalAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new ApiError(400, 'finalAmount must be a positive number to complete a booking');
      }
      update.$set.finalAmount = Math.round(amount * 100) / 100;
    }

    await bookings().updateOne({ _id: id }, update);
    const updated = await bookings().findOne({ _id: id });
    res.json({ success: true, booking: updated });
  })
);

export default router;

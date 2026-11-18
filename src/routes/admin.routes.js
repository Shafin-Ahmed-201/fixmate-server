import { Router } from 'express';
import { bookings, payments, services, users, toObjectId } from '../config/db.js';
import { verifyToken, verifyAdmin } from '../middleware/auth.js';
import { ApiError, asyncHandler, toPublicUser } from '../utils/http.js';
import {
  APPROVAL_STATUSES,
  BOOKING_STATUSES,
  ROLES,
} from '../utils/constants.js';

const router = Router();

router.use(verifyToken, verifyAdmin);

/**
 * GET /api/admin/stats — overview numbers for the admin dashboard cards/charts.
 */
router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const groupCount = async (collection, field) => {
      const rows = await collection
        .aggregate([{ $group: { _id: `$${field}`, count: { $sum: 1 } } }])
        .toArray();
      return Object.fromEntries(rows.map((row) => [row._id ?? 'unknown', row.count]));
    };

    const [userRoles, serviceStatuses, bookingStatuses, revenueRows, userTotal, recentBookings] =
      await Promise.all([
        groupCount(users(), 'role'),
        groupCount(services(), 'approvalStatus'),
        groupCount(bookings(), 'status'),
        payments()
          .aggregate([
            { $match: { paymentStatus: 'paid' } },
            { $group: { _id: null, revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
          ])
          .toArray(),
        users().countDocuments(),
        bookings().find({}).sort({ createdAt: -1 }).limit(5).toArray(),
      ]);

    const count = (map, key) => map[key] || 0;
    const revenue = revenueRows[0] || { revenue: 0, count: 0 };

    res.json({
      success: true,
      stats: {
        users: {
          total: userTotal,
          customer: count(userRoles, 'customer'),
          technician: count(userRoles, 'technician'),
          admin: count(userRoles, 'admin'),
        },
        services: {
          total: Object.values(serviceStatuses).reduce((sum, n) => sum + n, 0),
          pending: count(serviceStatuses, 'pending'),
          approved: count(serviceStatuses, 'approved'),
          rejected: count(serviceStatuses, 'rejected'),
        },
        bookings: {
          total: Object.values(bookingStatuses).reduce((sum, n) => sum + n, 0),
          byStatus: Object.fromEntries(
            BOOKING_STATUSES.map((status) => [status, count(bookingStatuses, status)])
          ),
        },
        payments: { totalPaid: revenue.count, revenue: revenue.revenue },
        recentBookings,
      },
    });
  })
);

/**
 * GET /api/admin/users — every registered user.
 */
router.get(
  '/users',
  asyncHandler(async (_req, res) => {
    const list = await users()
      .find({}, { projection: { session: 0, account: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ success: true, users: list.map(toPublicUser) });
  })
);

/**
 * PATCH /api/admin/users/:id/role — change a user's role
 * (an admin can never change their own role).
 */
router.patch(
  '/users/:id/role',
  asyncHandler(async (req, res) => {
    const { role } = req.body || {};
    if (!ROLES.includes(role)) {
      throw new ApiError(400, `role must be one of: ${ROLES.join(', ')}`);
    }

    const id = toObjectId(req.params.id);
    const user = id ? await users().findOne({ _id: id }) : null;
    if (!user) throw new ApiError(404, 'User not found');
    if (String(user._id) === String(req.user._id)) {
      throw new ApiError(400, 'You cannot change your own role');
    }

    await users().updateOne({ _id: id }, { $set: { role, updatedAt: new Date() } });
    const updated = await users().findOne({ _id: id });
    res.json({ success: true, user: toPublicUser(updated) });
  })
);

/**
 * GET /api/admin/services — all services, optional `?approvalStatus=` filter.
 */
router.get(
  '/services',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.approvalStatus) {
      if (!APPROVAL_STATUSES.includes(req.query.approvalStatus)) {
        throw new ApiError(
          400,
          `approvalStatus must be one of: ${APPROVAL_STATUSES.join(', ')}`
        );
      }
      filter.approvalStatus = req.query.approvalStatus;
    }

    const list = await services().find(filter).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, services: list });
  })
);

/**
 * PATCH /api/admin/services/:id/approval — approve or reject a service.
 */
router.patch(
  '/services/:id/approval',
  asyncHandler(async (req, res) => {
    const { approvalStatus } = req.body || {};
    if (!APPROVAL_STATUSES.includes(approvalStatus) || approvalStatus === 'pending') {
      throw new ApiError(400, "approvalStatus must be 'approved' or 'rejected'");
    }

    const id = toObjectId(req.params.id);
    const service = id ? await services().findOne({ _id: id }) : null;
    if (!service) throw new ApiError(404, 'Service not found');

    await services().updateOne({ _id: id }, { $set: { approvalStatus } });
    const updated = await services().findOne({ _id: id });
    res.json({ success: true, service: updated });
  })
);

/**
 * GET /api/admin/bookings — all bookings, optional `?status=` filter.
 */
router.get(
  '/bookings',
  asyncHandler(async (req, res) => {
    const filter = {};
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
 * GET /api/admin/payments — every recorded payment.
 */
router.get(
  '/payments',
  asyncHandler(async (_req, res) => {
    const list = await payments().find({}).sort({ paidAt: -1 }).toArray();
    res.json({ success: true, payments: list });
  })
);

export default router;

import { Router } from 'express';
import { services, toObjectId } from '../config/db.js';
import { verifyToken, verifyTechnician } from '../middleware/auth.js';
import { ApiError, asyncHandler, escapeRegex } from '../utils/http.js';
import { CATEGORIES, SERVICE_MODES } from '../utils/constants.js';

const router = Router();

const SORTS = {
  price_asc: { basePrice: 1 },
  price_desc: { basePrice: -1 },
  newest: { createdAt: -1 },
};

/** Validates service payload fields; only present keys are returned. */
function validateServicePayload(body, { partial }) {
  const data = body && typeof body === 'object' ? body : {};
  const has = (key) => Object.prototype.hasOwnProperty.call(data, key);
  const include = (key) => !partial || has(key);
  const updates = {};

  if (include('title')) {
    if (typeof data.title !== 'string' || data.title.trim().length < 3) {
      throw new ApiError(400, 'title must be at least 3 characters');
    }
    updates.title = data.title.trim();
  }

  if (include('category')) {
    if (!CATEGORIES.includes(data.category)) {
      throw new ApiError(400, `category must be one of: ${CATEGORIES.join(', ')}`);
    }
    updates.category = data.category;
  }

  if (include('description')) {
    if (typeof data.description !== 'string' || data.description.trim().length < 10) {
      throw new ApiError(400, 'description must be at least 10 characters');
    }
    updates.description = data.description.trim();
  }

  if (include('basePrice')) {
    const price = Number(data.basePrice);
    if (!Number.isFinite(price) || price <= 0) {
      throw new ApiError(400, 'basePrice must be a positive number');
    }
    updates.basePrice = Math.round(price * 100) / 100;
  }

  if (include('estimatedDuration')) {
    if (typeof data.estimatedDuration !== 'string' || !data.estimatedDuration.trim()) {
      throw new ApiError(400, 'estimatedDuration is required');
    }
    updates.estimatedDuration = data.estimatedDuration.trim();
  }

  if (include('serviceMode')) {
    if (!SERVICE_MODES.includes(data.serviceMode)) {
      throw new ApiError(400, `serviceMode must be one of: ${SERVICE_MODES.join(', ')}`);
    }
    updates.serviceMode = data.serviceMode;
  }

  if (has('serviceArea')) {
    if (data.serviceArea != null && typeof data.serviceArea !== 'string') {
      throw new ApiError(400, 'serviceArea must be a string');
    }
    updates.serviceArea = String(data.serviceArea || '').trim();
  }

  if (has('image')) {
    if (data.image != null && typeof data.image !== 'string') {
      throw new ApiError(400, 'image must be a URL string');
    }
    updates.image = String(data.image || '').trim();
  }

  if (has('technicianName')) {
    if (data.technicianName != null && typeof data.technicianName !== 'string') {
      throw new ApiError(400, 'technicianName must be a string');
    }
    updates.technicianName = String(data.technicianName || '').trim();
  }

  return updates;
}

/* ------------------------------------------------------------------ */
/* Public                                                             */
/* ------------------------------------------------------------------ */

/**
 * GET /api/services
 * Public catalogue: approved + available only.
 * Query: search (regex on title/category), category, serviceMode,
 *        sort (price_asc | price_desc | newest), page, limit.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { search, category, serviceMode, sort } = req.query;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 12));

    const filter = { approvalStatus: 'approved', isAvailable: true };

    if (category) {
      if (!CATEGORIES.includes(category)) {
        throw new ApiError(400, `category must be one of: ${CATEGORIES.join(', ')}`);
      }
      filter.category = category;
    }

    if (serviceMode) {
      if (!SERVICE_MODES.includes(serviceMode)) {
        throw new ApiError(400, `serviceMode must be one of: ${SERVICE_MODES.join(', ')}`);
      }
      filter.serviceMode = serviceMode;
    }

    if (search && String(search).trim()) {
      const rx = new RegExp(escapeRegex(String(search).trim()), 'i');
      filter.$or = [{ title: rx }, { category: rx }];
    }

    const sortSpec = SORTS[sort] || SORTS.newest;

    const [items, total] = await Promise.all([
      services()
        .find(filter)
        .sort(sortSpec)
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      services().countDocuments(filter),
    ]);

    res.json({
      success: true,
      services: items,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
    });
  })
);

/* ------------------------------------------------------------------ */
/* Technician — `/my` is declared before `/:id` so it never shadows it */
/* ------------------------------------------------------------------ */

/**
 * GET /api/services/my — the technician's own services (any approval state).
 */
router.get(
  '/my',
  verifyToken,
  verifyTechnician,
  asyncHandler(async (req, res) => {
    const list = await services()
      .find({ technicianEmail: req.user.email })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ success: true, services: list });
  })
);

/**
 * GET /api/services/:id — single approved & available service.
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toObjectId(req.params.id);
    const service = id
      ? await services().findOne({ _id: id, approvalStatus: 'approved', isAvailable: true })
      : null;
    if (!service) throw new ApiError(404, 'Service not found');
    res.json({ success: true, service });
  })
);

/**
 * POST /api/services — new service always starts as `pending`.
 */
router.post(
  '/',
  verifyToken,
  verifyTechnician,
  asyncHandler(async (req, res) => {
    const updates = validateServicePayload(req.body, { partial: false });

    const doc = {
      ...updates,
      image: updates.image ?? '',
      serviceArea: updates.serviceArea ?? '',
      technicianName: updates.technicianName || req.user.name || 'Technician',
      technicianEmail: req.user.email,
      approvalStatus: 'pending',
      isAvailable: true,
      createdAt: new Date(),
    };

    const { insertedId } = await services().insertOne(doc);
    res.status(201).json({ success: true, service: { ...doc, _id: insertedId } });
  })
);

/**
 * PATCH /api/services/:id — edit own service (resets approval to `pending`)
 * or toggle `isAvailable` without losing approval status.
 */
router.patch(
  '/:id',
  verifyToken,
  verifyTechnician,
  asyncHandler(async (req, res) => {
    const id = toObjectId(req.params.id);
    const service = id ? await services().findOne({ _id: id }) : null;
    if (!service) throw new ApiError(404, 'Service not found');
    if (service.technicianEmail !== req.user.email) {
      throw new ApiError(403, 'You can only modify your own services');
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const updates = validateServicePayload(body, { partial: true });

    if (Object.prototype.hasOwnProperty.call(body, 'isAvailable')) {
      updates.isAvailable = Boolean(body.isAvailable);
    }

    const editedContent = Object.keys(updates).some((key) => key !== 'isAvailable');
    if (editedContent) updates.approvalStatus = 'pending'; // re-review required

    if (!Object.keys(updates).length) {
      throw new ApiError(400, 'No updatable fields supplied');
    }

    await services().updateOne({ _id: id }, { $set: updates });
    const updated = await services().findOne({ _id: id });
    res.json({ success: true, service: updated });
  })
);

/**
 * DELETE /api/services/:id — delete own service.
 */
router.delete(
  '/:id',
  verifyToken,
  verifyTechnician,
  asyncHandler(async (req, res) => {
    const id = toObjectId(req.params.id);
    const service = id ? await services().findOne({ _id: id }) : null;
    if (!service) throw new ApiError(404, 'Service not found');
    if (service.technicianEmail !== req.user.email) {
      throw new ApiError(403, 'You can only delete your own services');
    }

    await services().deleteOne({ _id: id });
    res.json({ success: true, message: 'Service deleted' });
  })
);

export default router;

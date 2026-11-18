import { Router } from 'express';
import { users } from '../config/db.js';
import { verifyToken } from '../middleware/auth.js';
import { ApiError, asyncHandler, toPublicUser } from '../utils/http.js';

const router = Router();

const EDITABLE_FIELDS = ['name', 'phone', 'area', 'bio', 'image'];

/**
 * PATCH /api/users/profile
 * Updates the signed-in user's profile. `role` and `email` are never writable
 * here (roles change only through the admin API).
 */
router.patch(
  '/profile',
  verifyToken,
  asyncHandler(async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const updates = {};

    for (const field of EDITABLE_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
      const value = body[field];
      if (value != null && typeof value !== 'string') {
        throw new ApiError(400, `${field} must be a string`);
      }
      updates[field] = String(value || '').trim();
    }

    if ('name' in updates && !updates.name) {
      throw new ApiError(400, 'name cannot be empty');
    }
    if (!Object.keys(updates).length) {
      throw new ApiError(400, 'No updatable profile fields supplied');
    }

    updates.updatedAt = new Date();
    await users().updateOne({ _id: req.user._id }, { $set: updates });

    const updated = await users().findOne({ _id: req.user._id });
    res.json({ success: true, user: toPublicUser(updated) });
  })
);

export default router;

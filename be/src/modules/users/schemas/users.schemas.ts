/**
 * Zod validation schemas for the users module.
 * @module schemas/users
 */
import { z } from 'zod';

/** UUID v4 param schema (reusable) */
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

/** PUT /api/users/:id/role – body */
export const updateRoleSchema = z.object({
  role: z.enum(['admin', 'manager', 'user', 'leader'], {
    errorMap: () => ({ message: "Role must be one of: admin, manager, user, leader" }),
  }),
});

/** PUT /api/users/:id/permissions – body */
export const updatePermissionsSchema = z.object({
  permissions: z.array(z.string().min(1)).min(1, 'At least one permission is required'),
});

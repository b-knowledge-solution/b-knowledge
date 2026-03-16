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

/** POST /api/users – create a local user */
export const createUserSchema = z.object({
  // Email is required and must be a valid email address
  email: z.string().email('Invalid email address'),
  // Display name is optional
  display_name: z.string().min(1).max(255).optional(),
  // Optional plain-text password; will be bcrypt-hashed in the controller
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  // Role defaults to 'user' if not provided
  role: z.enum(['admin', 'leader', 'user']).optional().default('user'),
  // Optional profile fields
  department: z.string().max(255).optional().nullable(),
  job_title: z.string().max(255).optional().nullable(),
  mobile_phone: z.string().max(50).optional().nullable(),
});

/** PUT /api/users/:id – update a local user profile */
export const updateUserSchema = z.object({
  // Display name can be updated
  display_name: z.string().min(1).max(255).optional(),
  // Optional profile fields
  department: z.string().max(255).optional().nullable(),
  job_title: z.string().max(255).optional().nullable(),
  mobile_phone: z.string().max(50).optional().nullable(),
});

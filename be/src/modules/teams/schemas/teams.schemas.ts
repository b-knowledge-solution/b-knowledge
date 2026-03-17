/**
 * Zod validation schemas for the teams module.
 * @module schemas/teams
 */
import { z } from 'zod';

/**
 * @description UUID v4 param schema for validating team route parameters
 */
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

/**
 * @description Validation schema for POST /api/teams request body
 */
export const createTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required').max(255),
  project_name: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
});

/**
 * @description Validation schema for PUT /api/teams/:id request body
 */
export const updateTeamSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  project_name: z.string().max(255).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
});

/**
 * @description Validation schema for POST /api/teams/:id/members request body (supports single or batch)
 */
export const addMembersSchema = z.object({
  userId: z.string().uuid().optional(),
  userIds: z.array(z.string().uuid()).optional(),
}).refine(
  (data) => data.userId || (data.userIds && data.userIds.length > 0),
  { message: 'Either userId or userIds must be provided' },
);

/**
 * @description Validation schema for DELETE /api/teams/:id/members/:userId route params
 */
export const memberParamSchema = z.object({
  id: z.string().uuid('Invalid team UUID'),
  userId: z.string().uuid('Invalid user UUID'),
});

/**
 * @description Validation schema for POST /api/teams/:id/permissions request body
 */
export const grantPermissionsSchema = z.object({
  permissions: z.array(z.string().min(1)).min(1, 'At least one permission is required'),
});

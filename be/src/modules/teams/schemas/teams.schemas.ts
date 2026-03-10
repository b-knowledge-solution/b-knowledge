/**
 * Zod validation schemas for the teams module.
 * @module schemas/teams
 */
import { z } from 'zod';

/** UUID v4 param schema */
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

/** POST /api/teams – body */
export const createTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required').max(255),
  project_name: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
});

/** PUT /api/teams/:id – body */
export const updateTeamSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  project_name: z.string().max(255).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
});

/** POST /api/teams/:id/members – body */
export const addMembersSchema = z.object({
  userId: z.string().uuid().optional(),
  userIds: z.array(z.string().uuid()).optional(),
}).refine(
  (data) => data.userId || (data.userIds && data.userIds.length > 0),
  { message: 'Either userId or userIds must be provided' },
);

/** DELETE /api/teams/:id/members/:userId – params */
export const memberParamSchema = z.object({
  id: z.string().uuid('Invalid team UUID'),
  userId: z.string().uuid('Invalid user UUID'),
});

/** POST /api/teams/:id/permissions – body */
export const grantPermissionsSchema = z.object({
  permissions: z.array(z.string().min(1)).min(1, 'At least one permission is required'),
});

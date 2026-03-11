
/**
 * @fileoverview Zod-based request validation middleware factory.
 *
 * Provides a generic `validate()` middleware that takes a Zod schema and
 * validates `req.body`, `req.params`, and/or `req.query` before the request
 * reaches the controller.
 *
 * Usage in route files:
 * ```ts
 * import { validate } from '@/shared/middleware/validate.middleware.js';
 * import { createTeamSchema } from '../schemas/teams.schemas.js';
 *
 * router.post('/', requireAuth, validate(createTeamSchema), controller.createTeam.bind(controller));
 * ```
 *
 * @module middleware/validate
 */
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Configuration for which parts of the request to validate.
 */
export interface ValidationTarget {
  /** Zod schema to validate req.body */
  body?: ZodSchema;
  /** Zod schema to validate req.params */
  params?: ZodSchema;
  /** Zod schema to validate req.query */
  query?: ZodSchema;
}

/**
 * Format Zod validation errors into a flat, readable structure.
 * @param error - ZodError instance
 * @returns Array of { field, message } objects
 */
function formatZodErrors(error: ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * Middleware factory that validates request data against Zod schemas.
 *
 * Accepts either:
 * - A single Zod schema (validates req.body only)
 * - A ValidationTarget object (validates body, params, and/or query)
 *
 * On validation failure, returns HTTP 400 with structured error details.
 *
 * @param schema - Zod schema for body validation, or ValidationTarget for multiple targets
 * @returns Express middleware function
 *
 * @example
 * // Validate body only (shorthand)
 * router.post('/', validate(createSchema), controller.create);
 *
 * @example
 * // Validate body + params
 * router.put('/:id', validate({ body: updateSchema, params: uuidParamSchema }), controller.update);
 */
export function validate(schema: ZodSchema | ValidationTarget) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: Array<{ target: string; field: string; message: string }> = [];

    // If schema is a plain ZodSchema, treat it as body validation
    const targets: ValidationTarget = 'parse' in schema
      ? { body: schema as ZodSchema }
      : schema;

    // Validate body
    if (targets.body) {
      const result = targets.body.safeParse(req.body);
      if (!result.success) {
        errors.push(
          ...formatZodErrors(result.error).map((e) => ({ target: 'body', ...e }))
        );
      } else {
        // Replace body with parsed & coerced values
        req.body = result.data;
      }
    }

    // Validate params
    if (targets.params) {
      const result = targets.params.safeParse(req.params);
      if (!result.success) {
        errors.push(
          ...formatZodErrors(result.error).map((e) => ({ target: 'params', ...e }))
        );
      }
    }

    // Validate query
    if (targets.query) {
      const result = targets.query.safeParse(req.query);
      if (!result.success) {
        errors.push(
          ...formatZodErrors(result.error).map((e) => ({ target: 'query', ...e }))
        );
      }
    }

    // If any validation errors, return 400
    if (errors.length > 0) {
      res.status(400).json({
        error: 'Validation Error',
        details: errors,
      });
      return;
    }

    next();
  };
}

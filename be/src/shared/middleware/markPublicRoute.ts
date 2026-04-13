/**
 * @fileoverview Annotation helper for explicitly public routes.
 *
 * Used by `tests/permissions/route-sweep-coverage.test.ts` as a recognizable
 * marker (by function name) so that the route-sweep walker can distinguish
 * an intentionally public route from an accidentally un-gated mutation.
 */

import type { RequestHandler } from 'express'

/**
 * @description No-op middleware that marks a route as intentionally public
 * (e.g., login, health, oauth-callback). The route-sweep-coverage test
 * recognizes this function by name and skips it during the gate check.
 *
 * Use sparingly — every call to this function is a documented decision that
 * the route does not require an authenticated/authorized user.
 *
 * @returns {RequestHandler} A pass-through Express middleware.
 *
 * @example
 * router.post('/login', markPublicRoute(), loginHandler)
 */
export function markPublicRoute(): RequestHandler {
  // Pass-through — the function's NAME is the signal, not its behavior.
  return (_req, _res, next) => next()
}

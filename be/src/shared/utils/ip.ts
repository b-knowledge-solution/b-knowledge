/**
 * @fileoverview Client IP extraction utility for audit logging and rate limiting.
 *
 * Extracts the real client IP from common reverse-proxy headers with sane
 * fallbacks. The lookup order matches typical nginx/load-balancer setups.
 *
 * @module utils/ip
 */
import { Request } from 'express';

/**
 * @description Extract the client IP address from the incoming request.
 * Checks headers in priority order: X-Forwarded-For (first entry), X-Real-IP,
 * then falls back to the raw TCP socket address.
 * @param {Request} req - Express request object
 * @returns {string} Client IP address or 'unknown' if unresolvable
 */
export function getClientIp(req: Request): string {
    const forwardedFor = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];

    // X-Forwarded-For may contain a chain of proxies; use the first (client) entry
    if (typeof forwardedFor === 'string') {
        return forwardedFor.split(',')[0]?.trim() || 'unknown';
    }
    // X-Real-IP is set by nginx when proxying
    if (typeof realIp === 'string') {
        return realIp;
    }
    // Fall back to the direct TCP connection address
    return req.socket.remoteAddress || 'unknown';
}

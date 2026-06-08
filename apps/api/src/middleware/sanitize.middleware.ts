import { Request, Response, NextFunction } from 'express';
import xss from 'xss';
import { logger } from '../lib/logger.js';

/**
 * Routes where the body intentionally carries HTML/CSS payload as data —
 * sanitizing would corrupt it (<style> turns into &lt;style&gt;). The
 * downstream handler is responsible for safely rendering this content
 * (we use sandboxed iframes + Handlebars substitution only, no eval).
 *
 * Match is regex over `req.path`; keep entries narrow.
 */
const RAW_BODY_PATHS: RegExp[] = [
    /^\/api\/mikhmon\/[^/]+\/voucher-template\/?$/,
];

function isRawBodyPath(path: string): boolean {
    return RAW_BODY_PATHS.some((re) => re.test(path));
}

/**
 * Middleware to sanitize incoming request data to prevent XSS attacks.
 * It recursively sanitizes strings in req.body, req.query, and req.params.
 */
export const sanitizeMiddleware = (req: Request, _res: Response, next: NextFunction) => {
    let sanitizedCount = 0;

    // Skip body sanitization for endpoints where the body is the operator's
    // HTML template — sanitizing would convert <style>/<script> tags to
    // text and break the template engine. Query + params are still
    // sanitized.
    const skipBody = isRawBodyPath(req.path);

    if (req.body && !skipBody) {
        const bodyBefore = JSON.stringify(req.body);
        const sanitizedBody = sanitizeObject(req.body);
        if (JSON.stringify(sanitizedBody) !== bodyBefore) {
            sanitizedCount++;
            req.body = sanitizedBody;
        }
    }
    if (req.query) {
        const queryBefore = JSON.stringify(req.query);
        const sanitizedQuery = sanitizeObject(req.query);
        if (JSON.stringify(sanitizedQuery) !== queryBefore) {
            sanitizedCount++;
            (req as any).query = sanitizedQuery;
        }
    }
    if (req.params) {
        (req as any).params = sanitizeObject(req.params);
    }

    if (sanitizedCount > 0) {
        logger.debug({ 
            path: req.path, 
            sanitizedFields: sanitizedCount 
        }, 'XSS Input sanitization applied to request data');
    }

    next();
};

/**
 * Recursively sanitize an object's string properties.
 */
function sanitizeObject(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
        if (typeof obj === 'string') {
            return xss(obj);
        }
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }

    const sanitized: any = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            sanitized[key] = sanitizeObject(obj[key]);
        }
    }
    return sanitized;
}

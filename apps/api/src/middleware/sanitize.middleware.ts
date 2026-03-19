import { Request, Response, NextFunction } from 'express';
import xss from 'xss';
import { logger } from '../lib/logger.js';

/**
 * Middleware to sanitize incoming request data to prevent XSS attacks.
 * It recursively sanitizes strings in req.body, req.query, and req.params.
 */
export const sanitizeMiddleware = (req: Request, _res: Response, next: NextFunction) => {
    let sanitizedCount = 0;

    if (req.body) {
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

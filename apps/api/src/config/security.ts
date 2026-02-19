import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { logger } from '../lib/logger.js';
import { allowedOrigins } from './cors.js';

/**
 * Standard API rate limiter
 */
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too Many Requests',
        message: 'Too many requests from this IP, please try again after 15 minutes',
    },
});

/**
 * Stricter auth rate limiter
 */
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too Many Requests',
        message: 'Too many authentication attempts, please try again after 15 minutes',
    },
});

/**
 * CSRF Protection Middleware
 */
export const csrfProtection = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const stateChangingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
    if (stateChangingMethods.includes(req.method)) {
        if (req.originalUrl?.startsWith('/api/auth')) {
            return next();
        }

        const hasCustomHeader = req.get('X-Requested-With') || req.get('X-CSRF-Token') || req.get('x-requested-with');
        const origin = req.get('Origin');

        const normalize = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
        const isAllowedOrigin = origin && allowedOrigins.some(ao => {
            const normalizedAo = normalize(ao);
            const normalizedOrigin = normalize(origin);
            return normalizedOrigin === normalizedAo || normalizedOrigin.startsWith(normalizedAo + '/');
        });

        if (!hasCustomHeader && !isAllowedOrigin) {
            logger.warn({
                method: req.method,
                url: req.url,
                origin,
                ip: req.ip
            }, 'Potential CSRF attempt blocked');

            return res.status(403).json({
                error: 'Forbidden',
                message: 'CSRF protection: Custom header or valid Origin required'
            });
        }
    }
    next();
};

export const securityMiddleware = [
    helmet(),
    csrfProtection
];

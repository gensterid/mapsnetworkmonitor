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
    max: 1000, // ~66/min per IP; supports up to 6 concurrent dashboard users at 10 queries/30s polling
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false, // Keep tracking all requests for now
    // Skip all auth routes from general API limiting to prevent double-limiting
    // better-auth handles its own state and session caching
    skip: (req) => req.originalUrl?.includes('/api/auth'),
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
    max: 200, // Increased to 200 to provide a very safe buffer for session checks and dev reloads
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    // Skip session checks from the strict auth limit to prevent 429 loops
    skip: (req) => req.method === 'GET' && req.originalUrl?.includes('/get-session'),
    message: {
        error: 'Too Many Requests',
        message: 'Too many authentication attempts, please try again after 15 minutes',
    },
});

/**
 * Strict limiter for sensitive configuration changes (Settings, Routers, OLTs)
 */
export const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 changes per 15 mins is more than enough for normal use
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too Many Requests',
        message: 'Rate limit exceeded for configuration changes. Please wait.',
    },
});

/**
 * Limiter for AI/Gemini endpoints to protect API quota
 */
export const aiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too Many Requests',
        message: 'AI request limit exceeded. Please wait before making more AI requests.',
    },
});

/**
 * Limiter for resource-heavy file uploads (Backups, Database Import)
 */
export const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 uploads per hour is a safe limit for normal operations
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too Many Requests',
        message: 'Upload limit exceeded. Please try again in an hour.',
    },
});

/**
 * CSRF Protection Middleware
 */
export const csrfProtection = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const stateChangingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
    if (stateChangingMethods.includes(req.method)) {
        if (req.originalUrl?.startsWith('/api/auth') || req.originalUrl?.includes('/api/router-backups/upload')) {
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
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"], // Required for Leaflet inline styles
                imgSrc: ["'self'", "data:", "blob:", "https://*.tile.openstreetmap.org", "https://*.google.com", "https://*.googleapis.com"],
                connectSrc: ["'self'", "ws:", "wss:"], // WebSocket for Socket.io
                fontSrc: ["'self'", "data:"],
                objectSrc: ["'none'"],
                frameSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
            },
        },
    }),
    csrfProtection
];

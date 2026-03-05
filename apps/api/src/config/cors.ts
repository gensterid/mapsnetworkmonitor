import cors from 'cors';
import { logger } from '../lib/logger.js';

export const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : ['http://localhost:5173'];

export const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Security: Reject wildcard CORS — all origins must be explicitly listed
        if (allowedOrigins.includes('*')) {
            logger.warn('⚠️ CORS wildcard (*) detected in CORS_ORIGIN. This is insecure. Listing explicit domains instead.');
            return callback(new Error('Wildcard CORS is disabled for security. Set explicit origins in CORS_ORIGIN.'));
        }

        const normalize = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
        const normalizedOrigin = normalize(origin);

        const isAllowed = allowedOrigins.some(ao => {
            const normalizedAo = normalize(ao);
            return normalizedOrigin === normalizedAo || normalizedOrigin.startsWith(normalizedAo + '/');
        });

        if (isAllowed) {
            callback(null, true);
        } else {
            logger.warn({
                origin,
                normalizedOrigin,
                allowedOrigins: allowedOrigins.map(ao => normalize(ao)),
                rawAllowedOrigins: allowedOrigins
            }, 'CORS blocked');

            // Informative error but 403 status is handled by cors middleware
            callback(new Error(`Origin ${origin} not allowed by CORS configuration`));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
};

export const corsMiddleware = cors(corsOptions);

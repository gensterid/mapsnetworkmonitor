import cors from 'cors';
import { logger } from '../lib/logger.js';

export const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['http://localhost:5173'];

export const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        const normalize = (url: string) => url.replace(/\/$/, '').toLowerCase();
        const normalizedOrigin = normalize(origin);

        const isAllowed = allowedOrigins.some(ao => {
            const normalizedAo = normalize(ao);
            return normalizedOrigin === normalizedAo || normalizedOrigin.startsWith(normalizedAo + '/');
        });

        if (isAllowed) {
            callback(null, true);
        } else {
            logger.warn({ origin }, 'CORS blocked');
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
};

export const corsMiddleware = cors(corsOptions);

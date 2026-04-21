import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

/**
 * Custom API Error class
 */
export class ApiError extends Error {
    constructor(
        public statusCode: number,
        message: string,
        public details?: unknown
    ) {
        super(message);
        this.name = 'ApiError';
    }

    static badRequest(message: string, details?: unknown): ApiError {
        return new ApiError(400, message, details);
    }

    static unauthorized(message = 'Unauthorized'): ApiError {
        return new ApiError(401, message);
    }

    static forbidden(message = 'Forbidden'): ApiError {
        return new ApiError(403, message);
    }

    static notFound(message = 'Resource not found'): ApiError {
        return new ApiError(404, message);
    }

    static conflict(message: string, details?: unknown): ApiError {
        return new ApiError(409, message, details);
    }

    static internal(message = 'Internal server error'): ApiError {
        return new ApiError(500, message);
    }
}

/**
 * Error handling middleware
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { allowedOrigins } from '../config/cors.js';

export function errorMiddleware(
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
): void {
    // Ensure CORS headers even on error so browser doesn't hide the 500 status
    const origin = _req.get('Origin');
    if (origin) {
        const normalize = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
        const normalizedOrigin = normalize(origin);

        const isAllowed = allowedOrigins.includes('*') || allowedOrigins.some(ao => {
            const normalizedAo = normalize(ao);
            return normalizedOrigin === normalizedAo || normalizedOrigin.startsWith(normalizedAo + '/');
        });

        if (isAllowed) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
    }

    logger.error({
        err: err?.message || String(err),
        stack: err?.stack,
        name: err?.name
    }, 'Unhandled error');

    // Handle Zod validation errors
    if (err instanceof ZodError) {
        res.status(400).json({
            error: {
                name: 'ValidationError',
                message: 'Invalid request data',
                details: err.errors.map((e) => ({
                    path: e.path.join('.'),
                    message: e.message,
                })),
            }
        });
        return;
    }

    // Handle custom API errors
    if (err instanceof ApiError) {
        res.status(err.statusCode).json({
            error: {
                name: err.name,
                message: err.message,
                details: err.details,
            }
        });
        return;
    }

    // Handle database errors
    if (err.message?.includes('duplicate key')) {
        res.status(409).json({
            error: {
                name: 'Conflict',
                message: 'Resource already exists',
            }
        });
        return;
    }

    // Handle all other errors
    const statusCode = (err as { statusCode?: number }).statusCode || 500;
    // In production, never expose internal error details to clients
    const message = process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message || 'Internal server error';

    logger.error({
        err: err?.message || String(err),
        stack: err?.stack,
        path: _req.path,
        method: _req.method
    }, 'Generic 500 Error Caught');

    if (statusCode === 500 && process.env.NODE_ENV !== 'production') {
        try {
            const debugDir = path.resolve(__dirname, '..', '..', 'debug');
            if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
            fs.writeFileSync(path.join(debugDir, 'latest-500.txt'), JSON.stringify({
                message: err?.message || String(err),
                stack: err?.stack,
                path: _req.path,
                method: _req.method,
                time: new Date().toISOString()
            }, null, 2));
        } catch { /* ignore */ }
    }

    res.status(statusCode).json({
        error: {
            name: 'Error',
            message,
        }
    });
}

/**
 * Not found middleware - catch 404 errors
 */
export function notFoundMiddleware(req: Request, res: Response): void {
    res.status(404).json({
        error: {
            name: 'NotFound',
            message: `Route ${req.method} ${req.path} not found`,
        }
    });
}

/**
 * Async handler wrapper to catch async errors
 */
export function asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
    return (req: Request, res: Response, next: NextFunction): void => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

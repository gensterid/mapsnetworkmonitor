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
export function errorMiddleware(
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
): void {
    console.error('Error:', err);

    // Handle Zod validation errors
    if (err instanceof ZodError) {
        res.status(400).json({
            error: 'Validation Error',
            message: 'Invalid request data',
            details: err.errors.map((e) => ({
                path: e.path.join('.'),
                message: e.message,
            })),
        });
        return;
    }

    // Handle custom API errors
    if (err instanceof ApiError) {
        res.status(err.statusCode).json({
            error: err.name,
            message: err.message,
            details: err.details,
        });
        return;
    }

    // Handle database errors
    if (err.message?.includes('duplicate key')) {
        res.status(409).json({
            error: 'Conflict',
            message: 'Resource already exists',
        });
        return;
    }

    // Handle all other errors
    const statusCode = (err as { statusCode?: number }).statusCode || 500;
    const message =
        process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message;

    res.status(statusCode).json({
        error: 'Error',
        message,
    });
}

/**
 * Not found middleware - catch 404 errors
 */
export function notFoundMiddleware(req: Request, res: Response): void {
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.path} not found`,
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

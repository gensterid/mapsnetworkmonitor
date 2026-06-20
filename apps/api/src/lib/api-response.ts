import type { Response, Request, NextFunction, RequestHandler } from 'express';
import { logger } from './logger.js';

/**
 * Standard API response envelope.
 *
 * USAGE (opt-in, backward-compatible):
 *   import { sendOk, sendError, asyncHandler } from '@/lib/api-response.js';
 *
 *   router.get('/foo', asyncHandler(async (req, res) => {
 *       const data = await service.fetchFoo();
 *       sendOk(res, data);
 *   }));
 *
 * Format spec (per backend refactor brief):
 *   { success: true,  data: T,  timestamp: '2026-06-20T...' }       // success
 *   { success: false, error: string, code?: string, timestamp: ... } // error
 *
 * MIGRATION NOTE: existing routes pakai `res.json(data)` langsung.
 * Migrasi per-route requires frontend coordination (response shape
 * change \xe2\x86\x92 client harus baca `.data` instead of root). Routes baru
 * harus pakai envelope ini.
 */

export interface SuccessEnvelope<T> {
    success: true;
    data: T;
    timestamp: string;
    meta?: {
        total?: number;
        page?: number;
        limit?: number;
        [key: string]: unknown;
    };
}

export interface ErrorEnvelope {
    success: false;
    error: string;
    code?: string;
    timestamp: string;
    details?: unknown;
}

/**
 * Send success response dengan envelope standard.
 *
 * @example
 *   sendOk(res, { routers: [...] });
 *   sendOk(res, items, { total: 100, page: 1, limit: 20 });
 */
export function sendOk<T>(
    res: Response,
    data: T,
    meta?: SuccessEnvelope<T>['meta'],
): void {
    const payload: SuccessEnvelope<T> = {
        success: true,
        data,
        timestamp: new Date().toISOString(),
    };
    if (meta) payload.meta = meta;
    res.json(payload);
}

/**
 * Send error response dengan HTTP status + envelope standard.
 *
 * @example
 *   sendError(res, 404, 'Router not found', 'ROUTER_NOT_FOUND');
 *   sendError(res, 400, 'Validation failed', 'VALIDATION_ERROR', { field: 'name' });
 */
export function sendError(
    res: Response,
    status: number,
    message: string,
    code?: string,
    details?: unknown,
): void {
    const payload: ErrorEnvelope = {
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
    };
    if (code) payload.code = code;
    if (details !== undefined) payload.details = details;
    res.status(status).json(payload);
}

/**
 * Async handler wrapper \xe2\x80\x94 catches promise rejection dan forward ke
 * Express error middleware. Eliminates try/catch boilerplate di tiap
 * route handler.
 *
 * BEFORE:
 *   router.get('/foo', async (req, res, next) => {
 *       try { const data = await fetch(); res.json(data); }
 *       catch (err) { next(err); }
 *   });
 *
 * AFTER:
 *   router.get('/foo', asyncHandler(async (req, res) => {
 *       const data = await fetch();
 *       sendOk(res, data);
 *   }));
 */
export function asyncHandler<
    Req extends Request = Request,
    Res extends Response = Response,
>(
    fn: (req: Req, res: Res, next: NextFunction) => Promise<unknown>,
): RequestHandler {
    return (req, res, next) => {
        Promise.resolve(fn(req as Req, res as Res, next)).catch((err) => {
            logger.error(
                {
                    err: err?.message || String(err),
                    path: req.path,
                    method: req.method,
                    stack: err?.stack,
                },
                'Unhandled async error in route handler',
            );
            next(err);
        });
    };
}

/**
 * Sentinel codes \xe2\x80\x94 standardize error codes across API supaya frontend
 * bisa branch behavior (mis. show login modal kalau UNAUTHORIZED).
 */
export const ErrorCode = {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    CONFLICT: 'CONFLICT',
    RATE_LIMIT: 'RATE_LIMIT',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    UPSTREAM_TIMEOUT: 'UPSTREAM_TIMEOUT',
    UPSTREAM_ERROR: 'UPSTREAM_ERROR',
    TENANT_REQUIRED: 'TENANT_REQUIRED',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

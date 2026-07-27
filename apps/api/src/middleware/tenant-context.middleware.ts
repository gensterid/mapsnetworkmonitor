import { Request, Response, NextFunction } from 'express';
import { ApiError } from './error.middleware.js';

/**
 * Tolak non-superadmin TANPA tenantId (akun "orphan").
 *
 * Tanpa guard ini, getEffectiveTenantId() mengembalikan null untuk akun
 * semacam itu, dan pola scoping `tenantId ? eq(table.tenantId, tenantId) :
 * undefined` yang dipakai di seluruh service akan MEN-DROP filter — sehingga
 * query berjalan tanpa scope tenant (bypass isolasi, sama seperti superadmin).
 *
 * Pasang pada router operator/admin yang mengandalkan scope tenant. Superadmin
 * (yang memang boleh lintas-tenant) tetap lolos.
 */
export function requireTenantContext(req: Request, _res: Response, next: NextFunction): void {
    if (req.user?.role !== 'superadmin' && !req.user?.tenantId) {
        return next(ApiError.forbidden('Tenant context required'));
    }
    next();
}

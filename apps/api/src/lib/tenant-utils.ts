import { Request } from 'express';

/**
 * Get effective tenant ID for a request.
 * Superadmins get `undefined` (bypasses tenant restriction for global access).
 * All other roles get their actual tenantId (enforces tenant isolation).
 */
export function getEffectiveTenantId(req: Request): string | undefined {
    return req.user?.role === 'superadmin' ? undefined : req.user?.tenantId!;
}

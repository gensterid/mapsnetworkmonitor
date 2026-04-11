import { Request } from 'express';

/**
 * Get effective tenant ID for a request.
 * Superadmins get `undefined` (bypasses tenant restriction for global access).
 * All other roles get their actual tenantId (enforces tenant isolation).
 */
export function getEffectiveTenantId(req: Request): string | undefined {
    // Superadmins get global access by default, but can filter by a specific tenant via header
    if (req.user?.role === 'superadmin') {
        return (req.headers['x-tenant-id'] as string) || undefined;
    }
    
    // For all other roles, enforce their assigned tenantId
    return req.user?.tenantId!;
}

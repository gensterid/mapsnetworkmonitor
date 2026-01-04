import { Request, Response, NextFunction } from 'express';

type UserRole = 'admin' | 'operator' | 'user';

/**
 * Role hierarchy - higher roles have access to lower role permissions
 */
const roleHierarchy: Record<UserRole, number> = {
    admin: 3,
    operator: 2,
    user: 1,
};

/**
 * Check if user has required role or higher
 */
export function hasRole(userRole: string, requiredRole: UserRole): boolean {
    const userLevel = roleHierarchy[userRole as UserRole] || 0;
    const requiredLevel = roleHierarchy[requiredRole];
    return userLevel >= requiredLevel;
}

/**
 * Role-based access control middleware
 * Requires user to have the specified role or higher
 */
export function requireRole(...allowedRoles: UserRole[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication required',
            });
            return;
        }

        const userRole = req.user.role as UserRole;

        // Check if user has any of the allowed roles (or higher)
        const hasPermission = allowedRoles.some((role) => hasRole(userRole, role));

        if (!hasPermission) {
            res.status(403).json({
                error: 'Forbidden',
                message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
            });
            return;
        }

        next();
    };
}

/**
 * Require admin role
 */
export const requireAdmin = requireRole('admin');

/**
 * Require operator role (or admin)
 */
export const requireOperator = requireRole('operator');

/**
 * Require at least user role (authenticated)
 */
export const requireUser = requireRole('user');

/**
 * Check if user is owner or admin
 * Used for resources where user can only access their own data
 */
export function requireOwnerOrAdmin(getOwnerId: (req: Request) => string) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication required',
            });
            return;
        }

        const ownerId = getOwnerId(req);
        const isOwner = req.user.id === ownerId;
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isAdmin) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'You can only access your own resources',
            });
            return;
        }

        next();
    };
}

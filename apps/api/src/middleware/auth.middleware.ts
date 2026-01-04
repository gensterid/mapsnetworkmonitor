import { Request, Response, NextFunction } from 'express';
import { auth } from '../lib/auth';

// Extend Express Request to include user and session
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                email: string;
                name: string;
                role: string;
                image?: string | null;
            };
            session?: {
                id: string;
                userId: string;
                token: string;
                expiresAt: Date;
            };
        }
    }
}

/**
 * Authentication middleware
 * Validates the session and attaches user to request
 */
export async function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        // Get session from Better Auth
        const session = await auth.api.getSession({
            headers: req.headers as unknown as Headers,
        });

        if (!session?.user) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication required',
            });
            return;
        }

        // Attach user and session to request
        req.user = {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
            role: (session.user as { role?: string }).role || 'user',
            image: session.user.image,
        };

        req.session = {
            id: session.session.id,
            userId: session.session.userId,
            token: session.session.token,
            expiresAt: session.session.expiresAt,
        };

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or expired session',
        });
    }
}

/**
 * Optional authentication middleware
 * Attaches user to request if authenticated, but doesn't require it
 */
export async function optionalAuthMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const session = await auth.api.getSession({
            headers: req.headers as unknown as Headers,
        });

        if (session?.user) {
            req.user = {
                id: session.user.id,
                email: session.user.email,
                name: session.user.name,
                role: (session.user as { role?: string }).role || 'user',
                image: session.user.image,
            };

            req.session = {
                id: session.session.id,
                userId: session.session.userId,
                token: session.session.token,
                expiresAt: session.session.expiresAt,
            };
        }

        next();
    } catch {
        next();
    }
}


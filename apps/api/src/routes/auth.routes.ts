import { Router, Request, Response } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from '../lib/auth.js';
import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

import { rateLimit } from 'express-rate-limit';
import { asyncHandler } from '../middleware/error.middleware.js';

const router = Router();

/**
 * Strict rate limiter for email lookup to prevent user enumeration
 */
const lookupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit to 20 lookups per window
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too Many Requests',
        message: 'Too many lookup attempts, please try again after 15 minutes',
    },
});

/**
 * Better Auth handles all /api/auth/* routes automatically
 * This includes:
 * - POST /api/auth/sign-in/email - Email/password login
 * - POST /api/auth/sign-up/email - Register new user
 * - POST /api/auth/sign-out - Logout
 * - GET /api/auth/session - Get current session
 * - POST /api/auth/forget-password - Request password reset
 * - POST /api/auth/reset-password - Reset password
 */

/**
 * POST /api/auth/lookup-email
 * Resolves username to email for login
 * If input is already an email (contains @), returns it as-is
 */
router.post('/auth-lookup', lookupLimiter, asyncHandler(async (req: Request, res: Response) => {
    const { identifier } = req.body;

    if (!identifier) {
        return res.status(400).json({ error: 'Identifier is required' });
    }

    // If it's already an email, return it
    if (identifier.includes('@')) {
        return res.json({ email: identifier });
    }

    // Look up user by username
    try {
        const user = await db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.username, identifier))
            .limit(1);

        if (user.length === 0) {
            logger.debug({ identifier }, 'Auth lookup: Username not found');
            return res.status(404).json({ error: 'User not found' });
        }

        return res.json({ email: user[0].email });
    } catch (err: any) {
        logger.error({ err: err?.message || String(err), identifier }, 'Auth lookup: Internal Server Error');
        return res.status(500).json({ error: 'Internal Server Error', message: 'Database query failed' });
    }
}));

// Convert Better Auth handler to Express middleware
const authHandler = toNodeHandler(auth);

// Handle all auth routes
router.all('/*', (req: Request, res: Response) => {
    authHandler(req, res);
});

export default router;

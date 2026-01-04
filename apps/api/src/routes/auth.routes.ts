import { Router, Request, Response } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from '../lib/auth';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

const router = Router();

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
router.post('/lookup-email', async (req: Request, res: Response) => {
    try {
        const { identifier } = req.body;

        if (!identifier) {
            return res.status(400).json({ error: 'Identifier is required' });
        }

        // If it's already an email, return it
        if (identifier.includes('@')) {
            return res.json({ email: identifier });
        }

        // Look up user by username
        const user = await db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.username, identifier))
            .limit(1);

        if (user.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        return res.json({ email: user[0].email });
    } catch (error) {
        console.error('Error looking up email:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Convert Better Auth handler to Express middleware
const authHandler = toNodeHandler(auth);

// Handle all auth routes
router.all('/*', (req: Request, res: Response) => {
    authHandler(req, res);
});

export default router;

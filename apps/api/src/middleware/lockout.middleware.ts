import { Request, Response, NextFunction } from 'express';
import { cacheService } from '../lib/cache.js';
import { logger } from '../lib/logger.js';

const LOCKOUT_PREFIX = 'lockout:fail:';
const LOCKOUT_LIMIT = 3;
const LOCKOUT_DURATION = 15 * 60; // 15 minutes in seconds

/**
 * Middleware to protect against brute-force attacks on login.
 * Tracks failed login attempts per email and locks the account temporarily.
 */
export async function lockoutMiddleware(req: Request, res: Response, next: NextFunction) {
    // Only intercept specific sign-in paths
    const isSignIn = req.path.includes('/sign-in/email');
    
    if (isSignIn && req.method === 'POST') {
        const { email } = req.body;
        
        if (!email || typeof email !== 'string') {
            return next();
        }

        const key = `${LOCKOUT_PREFIX}${email.toLowerCase()}`;
        const fails = await cacheService.get<number>(key) || 0;

        // Check if already locked
        if (fails >= LOCKOUT_LIMIT) {
            logger.warn({ email, fails }, '🚫 Auth: Login blocked due to too many failed attempts');
            res.status(423).json({
                error: 'Locked',
                message: 'Too many failed login attempts. Account temporarily locked for 15 minutes for your security.'
            });
            return;
        }

        // Intercept response finish to check if login succeeded or failed
        res.on('finish', async () => {
            try {
                if (res.statusCode === 401) {
                    // Increment failure count
                    const newFails = fails + 1;
                    await cacheService.set(key, newFails, LOCKOUT_DURATION);
                    logger.debug({ email, fails: newFails }, 'Auth: Failed login recorded');
                } else if (res.statusCode >= 200 && res.statusCode < 300) {
                    // Success! Clear failures
                    if (fails > 0) {
                        await cacheService.delete(key);
                        logger.debug({ email }, 'Auth: Lockout counter reset after successful login');
                    }
                }
            } catch (err) {
                logger.error({ err, email }, 'Error in lockout middleware completion handler');
            }
        });
    }

    next();
}

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { logger } from './logger.js';
import crypto from 'node:crypto';

/**
 * Resolve the Better Auth baseURL.
 * Ensures the URL always ends with /api/auth.
 */
function resolveBaseURL(): string {
    const raw = process.env.BETTER_AUTH_URL || 'http://localhost:3001/api/auth';
    // If user provided just the domain (e.g., https://example.com), append /api/auth
    if (!raw.includes('/api/auth')) {
        return raw.replace(/\/+$/, '') + '/api/auth';
    }
    return raw;
}

/**
 * Collect all trusted origins from multiple env sources.
 * This prevents 403 "Invalid origin" errors when any env var is misconfigured.
 */
function collectTrustedOrigins(baseURL: string): string[] {
    const origins = new Set<string>();

    // Always trust localhost for development
    if (process.env.NODE_ENV !== 'production') {
        origins.add('http://localhost:3001');
        origins.add('http://localhost:3002');
        origins.add('http://localhost:5173');
        origins.add('http://127.0.0.1:5173');
    }

    // Extract origin from the resolved baseURL (e.g., https://example.com from https://example.com/api/auth)
    try {
        const baseOrigin = new URL(baseURL).origin;
        origins.add(baseOrigin);
    } catch { /* ignore parse errors */ }

    // Merge from TRUSTED_ORIGINS env var
    if (process.env.TRUSTED_ORIGINS) {
        process.env.TRUSTED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean).forEach(o => origins.add(o));
    }

    // Also merge from CORS_ORIGIN env var — these origins MUST also be trusted for Better Auth CSRF
    if (process.env.CORS_ORIGIN) {
        process.env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean).forEach(o => origins.add(o));
    }

    const finalOrigins = Array.from(origins);

    // Security check for production
    if (process.env.NODE_ENV === 'production') {
        if (finalOrigins.length === 0) {
            logger.warn('⚠️ CRITICAL: No trusted origins configured for Better Auth in production! Login might fail.');
        }
        
        // Remove localhost if it's there but we are in production
        // Unless baseURL is localhost (which it shouldn't be in prod)
        if (!baseURL.includes('localhost') && !baseURL.includes('127.0.0.1')) {
            const sizeBefore = origins.size;
            origins.delete('http://localhost:3001');
            origins.delete('http://localhost:3002');
            origins.delete('http://localhost:5173');
            origins.delete('http://127.0.0.1:5173');
            if (origins.size < sizeBefore) {
                logger.debug('Production hardening: Removed localhost from trusted origins');
            }
        }
    }

    // Log the configuration for easier debugging in production
    logger.info({
        baseURL,
        trustedOrigins: Array.from(origins)
    }, 'Better Auth origin configuration initialized');

    return Array.from(origins);
}

const resolvedBaseURL = resolveBaseURL();
const resolvedTrustedOrigins = collectTrustedOrigins(resolvedBaseURL);

logger.info({ baseURL: resolvedBaseURL, trustedOrigins: resolvedTrustedOrigins }, 'Better Auth config resolved');

import { env } from '../config/env.js';

export const auth = betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: resolvedBaseURL,
    database: drizzleAdapter(db, {
        provider: 'pg',
        schema: {
            user: schema.users,
            session: schema.sessions,
            account: schema.accounts,
            verification: schema.verifications,
        },
    }),
    emailAndPassword: {
        enabled: true,
        autoSignIn: true,
        minPasswordLength: 8,
    },
    session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // Update session every 24 hours
        cookieCache: {
            enabled: false, // Disable cache for more reliable user switching behind proxies
        },
        cookie: {
            domain: undefined,
            sameSite: 'lax',
        },
    },
    user: {
        additionalFields: {
            role: {
                type: 'string',
                required: false,
                defaultValue: 'user',
                input: false, // Don't allow users to set their own role on signup
            },
            username: {
                type: 'string',
                required: false,
                input: true, // Allow users to set username on signup
            },
            tenantId: {
                type: 'string',
                required: false,
                input: false, // Set by admin/superadmin
            },
        },
    },
    advanced: {
        database: {
            generateId: () => crypto.randomUUID(),
        },
        // We enable useSecureCookies in production for security.
        // In development (local IP), it remains false to allow HTTP access.
        useSecureCookies: process.env.NODE_ENV === 'production',
        ipAddress: {
            ipAddressHeaders: ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip'],
        },
    },
    trustedOrigins: resolvedTrustedOrigins,
});

// Export auth types
export type Auth = typeof auth;

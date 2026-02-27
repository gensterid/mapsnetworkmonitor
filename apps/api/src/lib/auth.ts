import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { logger } from './logger.js';

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
    origins.add('http://localhost:3001');
    origins.add('http://localhost:3002');
    origins.add('http://localhost:5173');
    origins.add('http://127.0.0.1:5173');

    // Always trust local Proxmox IP for direct access
    origins.add('http://10.10.70.116');

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

    // Log the configuration for easier debugging in production
    const finalOrigins = Array.from(origins);
    logger.info({
        baseURL,
        trustedOrigins: finalOrigins
    }, 'Better Auth origin configuration initialized');

    return finalOrigins;
}

const resolvedBaseURL = resolveBaseURL();
const resolvedTrustedOrigins = collectTrustedOrigins(resolvedBaseURL);

logger.info({ baseURL: resolvedBaseURL, trustedOrigins: resolvedTrustedOrigins }, 'Better Auth config resolved');

export const auth = betterAuth({
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
            aiEnabled: {
                type: 'boolean',
                required: false,
                defaultValue: false,
                input: true,
            },
            aiApiKey: {
                type: 'string',
                required: false,
                input: true,
            },
        },
    },
    advanced: {
        database: {
            generateId: () => crypto.randomUUID(),
        },
        // Only use Secure cookies if the server URL is actually HTTPS.
        // Set to false for HTTP deployments (e.g., Proxmox accessed via http://10.10.70.116).
        useSecureCookies: resolvedBaseURL.startsWith('https://'),
    },
    trustedOrigins: resolvedTrustedOrigins,
});

// Export auth types
export type Auth = typeof auth;

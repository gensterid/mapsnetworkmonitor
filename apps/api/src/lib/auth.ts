import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

export const auth = betterAuth({
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
            enabled: true,
            maxAge: 60 * 5, // 5 minutes
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
        },
    },
    advanced: {
        database: {
            generateId: () => crypto.randomUUID(),
        },
    },
    trustedOrigins: [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:3001',
        'https://mapsmonitor.genster.web.id',
        'http://10.10.70.116',
        process.env.CORS_ORIGIN || 'http://localhost:5173',
        // Support any IP-based origins for LAN deployments
        ...(process.env.TRUSTED_ORIGINS ? process.env.TRUSTED_ORIGINS.split(',') : []),
    ].filter(Boolean),
});

// Export auth types
export type Auth = typeof auth;

import { z } from 'zod';
import { logger } from '../lib/logger.js';

const envSchema = z.object({
    // Core
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().default('3001').transform(Number),
    DATABASE_URL: z.string().url(),
    
    // Security
    BETTER_AUTH_SECRET: z.string().min(16, "Secret should be at least 16 characters"),
    BETTER_AUTH_URL: z.string().url().optional(),
    ENCRYPTION_KEY: z.string().refine((val: string) => val.length === 32 || val.length === 64, {
        message: "Encryption key must be either 32 characters (plain) or 64 characters (hex)"
    }),
    CORS_ORIGIN: z.string().optional(),
    TRUSTED_ORIGINS: z.string().optional(),
    
    // Services
    REDIS_URL: z.string().url().default('redis://localhost:6379'),
    GENIEACS_URL: z.string().url().default('http://localhost:7557'),
    APP_URL: z.string().url().default('http://localhost:3001'),
    WEBHOOK_BASE_URL: z.string().url().optional(),
    
    // External APIs
    GEMINI_API_KEY: z.string().optional(),
    GOOGLE_MAPS_API_KEY: z.string().optional(),
    SENTRY_DSN: z.string().url().optional(),
    
    // Infrastructure
    PG_DUMP_PATH: z.string().default('pg_dump'),
    PSQL_PATH: z.string().default('psql'),
    SYNC_ENABLED: z.enum(['true', 'false']).default('true'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
    try {
        const parsed = envSchema.parse(process.env);
        
        // Custom validation for security defaults in production
        if (parsed.NODE_ENV === 'production') {
            const INSECURE_DEFAULTS = [
                'your-secret-key-change-in-production',
                'your-32-byte-encryption-key-here',
                'change-me',
                'secret',
            ];
            
            if (INSECURE_DEFAULTS.includes(parsed.BETTER_AUTH_SECRET)) {
                throw new Error('BETTER_AUTH_SECRET is using an insecure default value in production');
            }
            if (INSECURE_DEFAULTS.includes(process.env.ENCRYPTION_KEY || '')) {
                throw new Error('ENCRYPTION_KEY is using an insecure default value in production');
            }
        }
        
        return parsed;
    } catch (err) {
        if (err instanceof z.ZodError) {
            const missingVars = err.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('\n');
            logger.fatal(`🚨 Invalid environment variables:\n${missingVars}`);
        } else {
            logger.fatal(`🚨 Environment validation failed: ${(err as Error).message}`);
        }
        process.exit(1);
    }
}

// Singleton for easy access if needed, though most services use process.env directly
export const env = validateEnv();

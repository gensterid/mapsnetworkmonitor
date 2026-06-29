import { z } from 'zod';
import { logger } from '../lib/logger.js';

/**
 * Central env config — semua process.env.X HARUS di-define di sini.
 *
 * Audit 45 unique env var dipakai di codebase, di-group per kategori.
 * Security-critical (secrets, encryption keys) ada validation min length.
 * Numeric vars di-transform ke Number. Boolean vars pakai z.enum(['true','false'])
 * supaya explicit (env var selalu string).
 *
 * USAGE:
 *   import { env } from '@/config/env.js';
 *   const timeout = env.ROUTER_CB_COOLDOWN_MS;  // typed!
 *
 * JANGAN pakai process.env.X langsung di code baru — hilang type safety
 * + silent missing validation. Tambah ke schema di sini.
 */
const envSchema = z.object({
    // ─── Core ──────────────────────────────────────────────────────────────
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().default('3001').transform(Number),
    DATABASE_URL: z.string().url(),
    TZ: z.string().default('Asia/Makassar'),

    // ─── Security & Auth ───────────────────────────────────────────────────
    BETTER_AUTH_SECRET: z.string().min(16, 'Secret minimum 16 characters'),
    BETTER_AUTH_URL: z.string().url().optional(),
    JWT_SECRET: z.string().min(16).optional(),
    SESSION_SECRET: z.string().min(16).optional(),
    PORTAL_TOKEN_SECRET: z.string().min(16).optional(),
    ENCRYPTION_KEY: z.string().refine(
        (v) => v.length === 32 || v.length === 64,
        { message: 'ENCRYPTION_KEY harus 32 char (plain) atau 64 char (hex)' }
    ),
    PROD_ENCRYPTION_KEY: z.string().optional(),
    METRICS_BEARER_TOKEN: z.string().optional(),
    CORS_ORIGIN: z.string().optional(),
    TRUSTED_ORIGINS: z.string().optional(),
    ALLOW_PRIVATE_NETWORKS: z.enum(['true', 'false']).default('false'),

    // ─── External Services ─────────────────────────────────────────────────
    REDIS_URL: z.string().url().default('redis://localhost:6379'),
    GENIEACS_URL: z.string().url().default('http://localhost:7557'),
    APP_URL: z.string().url().default('http://localhost:3001'),
    WEBHOOK_BASE_URL: z.string().url().optional(),
    GEMINI_API_KEY: z.string().optional(),
    GOOGLE_MAPS_API_KEY: z.string().optional(),
    SENTRY_DSN: z.string().url().optional(),

    // ─── Infrastructure (paths) ───────────────────────────────────────────
    PG_DUMP_PATH: z.string().default('pg_dump'),
    PSQL_PATH: z.string().default('psql'),
    VPN_BASE_DIR: z.string().default('/etc/openvpn'),
    VPN_DISABLE_SYSTEMD: z.enum(['true', 'false']).default('false'),
    MIKHMON_LOGO_DIR: z.string().optional(),

    // ─── Polling & Scheduler Tuning ───────────────────────────────────────
    SYNC_ENABLED: z.enum(['true', 'false']).default('true'),
    ROUTER_SYNC_CONCURRENCY: z.string().default('5').transform(Number),
    OLT_SYNC_CONCURRENCY: z.string().default('3').transform(Number),
    QUEUE_BP_WAITING_LIMIT: z.string().default('100').transform(Number),

    // Scheduler intervals (semua ms). Default match dengan hardcoded value
    // sebelumnya supaya behavior tidak berubah out-of-box.
    SCHED_POLLING_MS: z.string().default('120000').transform(Number),       // 2 min — main router polling
    SCHED_ESCALATION_MS: z.string().default('300000').transform(Number),    // 5 min — alert escalation check
    SCHED_ROUTER_TIMEOUT_MS: z.string().default('60000').transform(Number), // 60s — per-router operation timeout
    SCHED_GLOBAL_TIMEOUT_MS: z.string().default('600000').transform(Number), // 10 min — global polling safety net
    SCHED_OLT_SNMP_MS: z.string().default('300000').transform(Number),     // 5 min — OLT SNMP sync
    SCHED_OLT_WEB_MS: z.string().default('900000').transform(Number),      // 15 min — OLT web sync
    SCHED_ACS_SYNC_MS: z.string().default('600000').transform(Number),     // 10 min — GenieACS device sync
    SCHED_METRICS_MS: z.string().default('60000').transform(Number),       // 1 min — Prometheus metrics update
    SCHED_ROUTER_SNMP_MS: z.string().default('60000').transform(Number),   // 1 min — high-frequency SNMP traffic
    SCHED_ACS_WARMER_MS: z.string().default('60000').transform(Number),    // 1 min — ACS dashboard warm
    SCHED_CLEANUP_MS: z.string().default('86400000').transform(Number),    // 24 hr — old metrics cleanup
    SCHED_AUTOBACKUP_MS: z.string().default('86400000').transform(Number), // 24 hr — automated DB backup
    SCHED_BILLING_MS: z.string().default('3600000').transform(Number),     // 1 hr — billing daily job (idempotent)
    SCHED_DRIFT_MS: z.string().default('3600000').transform(Number),       // 1 hr — PPPoE drift scan
    SCHED_NETWATCH_AUTOHEAL_MS: z.string().default('300000').transform(Number),  // 5 min — netwatch IP auto-heal
    SCHED_NETWATCH_SWEEP_MS: z.string().default('300000').transform(Number),     // 5 min — netwatch alert resolver sweep

    // ─── Adaptive Scaling (auto-tune polling interval per cluster size) ──
    ADAPTIVE_BASE_MS: z.string().default('60000').transform(Number),
    ADAPTIVE_MAX_MULTIPLIER: z.string().default('5').transform(Number),

    // ─── Circuit Breaker (per-router) ─────────────────────────────────────
    ROUTER_CB_THRESHOLD: z.string().default('5').transform(Number),
    ROUTER_CB_COOLDOWN_MS: z.string().default('60000').transform(Number),

    // ─── Netwatch Auto-Heal ───────────────────────────────────────────────
    NETWATCH_AUTOHEAL_ENABLED: z.enum(['true', 'false']).default('true'),
    NETWATCH_AUTOHEAL_COOLDOWN_MS: z.string().default('300000').transform(Number),
    NETWATCH_AUTOHEAL_FLAP_THRESHOLD: z.string().default('3').transform(Number),
    NETWATCH_WEBHOOK_DEBUG: z.enum(['true', 'false']).default('false'),

    // ─── Audit Retention ──────────────────────────────────────────────────
    GLOBAL_AUDIT_RETENTION_DAYS: z.string().default('365').transform(Number),

    // ─── Signal / Redaman (ONU RX power) Alert ────────────────────────────
    // Alert saat redaman ONU berubah signifikan (degradasi sinyal optik).
    // SIGNAL_DROP_THRESHOLD_DB: minimal penurunan (dBm) untuk trigger warning.
    // SIGNAL_CRITICAL_DBM: ambang RX power kritis (lebih negatif = lebih buruk).
    // SIGNAL_ALERT_COOLDOWN_MIN: jeda anti-spam per ONU.
    SIGNAL_DROP_THRESHOLD_DB: z.string().default('3').transform(Number),
    SIGNAL_CRITICAL_DBM: z.string().default('-27').transform(Number),
    SIGNAL_ALERT_COOLDOWN_MIN: z.string().default('30').transform(Number),

    // ─── Billing ───────────────────────────────────────────────────────────
    BILLING_TZ: z.string().default('Asia/Makassar'),

    // ─── HSGQ OLT (debug-only) ─────────────────────────────────────────────
    HSGQ_DEBUG_FIELDS: z.enum(['true', 'false']).default('false'),
    HSGQ_DEBUG_SN: z.string().optional(),

    // ─── Backup Repair ─────────────────────────────────────────────────────
    REPAIR_DB_FORCE_DECOMPRESS: z.enum(['true', 'false']).default('false'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
    try {
        const parsed = envSchema.parse(process.env);

        // Production-only safety check: reject insecure default secrets
        if (parsed.NODE_ENV === 'production') {
            const INSECURE_DEFAULTS = [
                'your-secret-key-change-in-production',
                'your-32-byte-encryption-key-here',
                'change-me',
                'secret',
                'change_this_to_a_secure_random_string_at_least_32_chars',
                'change_this_to_a_secure_random_string_better_auth_secret',
            ];

            const secretsToCheck = [
                { name: 'BETTER_AUTH_SECRET', value: parsed.BETTER_AUTH_SECRET },
                { name: 'ENCRYPTION_KEY', value: parsed.ENCRYPTION_KEY },
                { name: 'JWT_SECRET', value: parsed.JWT_SECRET },
                { name: 'SESSION_SECRET', value: parsed.SESSION_SECRET },
                { name: 'PORTAL_TOKEN_SECRET', value: parsed.PORTAL_TOKEN_SECRET },
            ];

            for (const { name, value } of secretsToCheck) {
                if (value && INSECURE_DEFAULTS.includes(value)) {
                    throw new Error(`${name} is using an insecure default value in production`);
                }
            }
        }

        logger.info(
            { keyLength: parsed.ENCRYPTION_KEY.length },
            '🔑 Loaded ENCRYPTION_KEY'
        );

        return parsed;
    } catch (err) {
        if (err instanceof z.ZodError) {
            const issues = err.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n');
            logger.fatal(`🚨 Invalid environment variables:\n${issues}`);
        } else {
            logger.fatal(`🚨 Environment validation failed: ${(err as Error).message}`);
        }
        process.exit(1);
    }
}

// Lazy singleton — validate once on first access
let _env: Env | null = null;
export function getEnv(): Env {
    if (!_env) _env = validateEnv();
    return _env;
}

// Re-export for backward compatibility (used by auth.ts and other modules)
export const env = getEnv();

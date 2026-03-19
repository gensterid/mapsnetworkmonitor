import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db/index.js';
import { alerts, routers, routerMetrics, netwatchHosts } from '../db/schema/index.js';
import { eq, and, desc, lt, gte, inArray } from 'drizzle-orm';
import { routerService } from './router.service.js';
import { logger } from '../lib/logger.js';

export class AIService {
    private static instance: AIService;
    private defaultModel: any;

    private constructor() {
        // Lazy initialization: don't create the model in constructor
    }

    private get systemApiKey(): string {
        return process.env.GEMINI_API_KEY || '';
    }

    private getModel(apiKey?: string | null): any {
        const sysKey = this.systemApiKey;
        
        if (!apiKey || apiKey === sysKey || apiKey.trim() === '') {
            if (!this.defaultModel) {
                logger.debug('AIService: Initializing default model (lazy)');
                const genAI = new GoogleGenerativeAI(sysKey.trim());
                this.defaultModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
            }
            logger.debug('AIService: Using system-wide API key');
            return this.defaultModel;
        }

        const trimmedKey = apiKey.trim();
        logger.debug({ keyPrefix: trimmedKey.substring(0, 8) }, 'AIService: Using per-user API key');
        try {
            const genAI = new GoogleGenerativeAI(trimmedKey);
            return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        } catch (err) {
            logger.error({ err }, 'AIService: Invalid per-user API key, falling back to system key');
            return this.getModel(); // Recursive call will hit the !apiKey block
        }
    }

    public static getInstance(): AIService {
        if (!AIService.instance) {
            AIService.instance = new AIService();
        }
        return AIService.instance;
    }

    /**
     * Helper to generate content with fallback
     */
    private async safeGenerateContent(apiKey: string | null | undefined, prompt: string): Promise<string> {
        const primaryModel = this.getModel(apiKey);
        try {
            const result = await primaryModel.generateContent(prompt);
            return result.response.text();
        } catch (error: any) {
            const errorMsg = error?.message || String(error);

            // Critical check for leaked API key
            if (errorMsg.includes('leaked')) {
                logger.error('AIService: Gemini API Key has been reported as leaked. AI features are disabled until the key is rotated.');
                throw new Error('AI_KEY_LEAKED');
            }

            // If primary model fails (429, 404, etc), attempt fallback to Lite version
            if (errorMsg.includes('404') || errorMsg.includes('not found') || errorMsg.includes('429') || errorMsg.includes('quota')) {
                logger.warn({ err: errorMsg }, 'AIService: Primary model failed or quota exceeded, attempting fallback to gemini-2.5-flash-lite');
                try {
                    const fallbackAI = new GoogleGenerativeAI((apiKey || this.systemApiKey).trim());
                    const fallbackModel = fallbackAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
                    const fallbackResult = await fallbackModel.generateContent(prompt);
                    return fallbackResult.response.text();
                } catch (fallbackErr: any) {
                    logger.error({ err: fallbackErr?.message }, 'AIService: Fallback to lite also failed');
                    throw error;
                }
            }
            throw error;
        }
    }

    /**
     * Internal helper to fetch user API key if enabled
     */
    private async fetchUserApiKey(userId: string): Promise<string | null> {
        try {
            const { users } = await import('../db/schema/index.js');
            const [user] = await db.select({ aiApiKey: users.aiApiKey, aiEnabled: users.aiEnabled })
                .from(users)
                .where(eq(users.id, userId));
            
            if (user?.aiEnabled && user?.aiApiKey) {
                return user.aiApiKey;
            }
            return null;
        } catch (err) {
            logger.error({ err, userId }, 'AIService: Failed to fetch user API key');
            return null;
        }
    }

    /**
     * Analyze a specific alert and provide insights/fixes
     */
    async analyzeAlert(alertId: string, tenantId: string, apiKey?: string | null, userId?: string, userRole?: string): Promise<string> {
        try {
            // Lazy-load API key if not provided but userId is present
            let effectiveApiKey = apiKey;
            if (!effectiveApiKey && userId) {
                effectiveApiKey = await this.fetchUserApiKey(userId);
            }

            const [alert] = await db.select().from(alerts).where(and(eq(alerts.id, alertId), eq(alerts.tenantId, tenantId)));
            if (!alert) throw new Error('Alert not found');

            // RBAC Check
            if (userId && userRole && userRole !== 'admin' && userRole !== 'superadmin') {
                const hasAccess = await routerService.hasAccess(userId, userRole, alert.routerId, tenantId);
                if (!hasAccess) {
                    return 'Anda tidak memiliki akses untuk menganalisis alert ini.';
                }
            }

            const [router] = await db.select().from(routers).where(eq(routers.id, alert.routerId));

            const prompt = `
                You are a network expert specializing in MikroTik (RouterOS) and GPON (OLT/ONU) infrastructure.
                Analyze the following alert and provide a concise explanation of the probable cause and suggested troubleshooting steps.

                ALERT CONTEXT:
                - Type: ${alert.type}
                - Severity: ${alert.severity}
                - Message: ${alert.message}
                - Router: ${router?.name || 'Unknown'} (${router?.model || 'Unknown'})
                - Router OS: ${router?.routerOsVersion || 'Unknown'}

                FORMAT:
                - Cause: [Brief technical explanation]
                - Fix: [Actionable steps for a technician]
                
                Keep it professional and technical yet easy to follow. Use Indonesian if possible, as the primary users are in Indonesia.
            `;

            return await this.safeGenerateContent(effectiveApiKey, prompt);
        } catch (error: any) {
            logger.error({
                err: error?.message || error,
                stack: error?.stack,
                alertId
            }, 'AIService: Failed to analyze alert');
            return 'Maaf, saya tidak dapat menganalisis alert ini saat ini. Silakan periksa koneksi atau konfigurasi API Key saya.';
        }
    }

    /**
     * Generate a daily summary of network health for a tenant
     */
    async generateDailySummary(tenantId: string, apiKey?: string | null, userId?: string, userRole?: string): Promise<string> {
        try {
            // Lazy-load API key
            let effectiveApiKey = apiKey;
            if (!effectiveApiKey && userId) {
                effectiveApiKey = await this.fetchUserApiKey(userId);
            }

            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            const filters = [
                eq(alerts.tenantId, tenantId),
                gte(alerts.createdAt, yesterday)
            ];

            // RBAC Filter: Only include alerts from assigned routers for non-admins
            if (userId && userRole && userRole !== 'admin' && userRole !== 'superadmin') {
                const { userRouters } = await import('../db/schema/user-routers.js');
                const assigned = await db
                    .select({ routerId: userRouters.routerId })
                    .from(userRouters)
                    .where(eq(userRouters.userId, userId));

                const routerIds = assigned.map(a => a.routerId);
                if (routerIds.length === 0) {
                    return 'Tidak ada data aktivitas jaringan untuk rangkuman karena Anda belum ditugaskan ke router manapun.';
                }
                filters.push(inArray(alerts.routerId, routerIds));
            }

            const recentAlerts = await db.select().from(alerts)
                .where(and(...filters))
                .limit(20);

            const prompt = `
                You are a network operations manager. Summarize the network status for the last 24 hours based on these alerts.
                Identify critical patterns or recurring issues.

                ALERTS DATA (Last 24h):
                ${recentAlerts.map(a => `- ${a.severity.toUpperCase()}: ${a.message}`).join('\n')}

                FORMAT:
                - Status Overall: [Sangat Baik / Baik / Terganggu / Kritis]
                - Isu Utama: [Poin-poin masalah yang menonjol]
                - Rekomendasi: [Saran untuk stabilitas jangka panjang]

                Gunakan bahasa Indonesia yang ramah teknisi.
            `;

            return await this.safeGenerateContent(effectiveApiKey, prompt);
        } catch (error: any) {
            const errorMsg = error?.message || String(error);
            logger.error({
                err: errorMsg,
                stack: error?.stack,
                tenantId
            }, 'AIService: Failed to generate daily summary');
            return `Gagal membuat rangkuman harian: ${errorMsg}`;
        }
    }

    /**
     * Provide diagnostics insights for a router based on metrics
     */
    async getDiagnosticsInsights(routerId: string, tenantId: string, apiKey?: string | null, userId?: string, userRole?: string): Promise<string> {
        try {
            // Lazy-load API key
            let effectiveApiKey = apiKey;
            if (!effectiveApiKey && userId) {
                effectiveApiKey = await this.fetchUserApiKey(userId);
            }

            // RBAC Check
            if (userId && userRole && userRole !== 'admin' && userRole !== 'superadmin') {
                const hasAccess = await routerService.hasAccess(userId, userRole, routerId, tenantId);
                if (!hasAccess) {
                    return 'Anda tidak memiliki akses untuk mendiagnosa router ini.';
                }
            }

            const metrics = await db.select().from(routerMetrics)
                .where(and(eq(routerMetrics.routerId, routerId), eq(routerMetrics.tenantId, tenantId)))
                .orderBy(desc(routerMetrics.recordedAt))
                .limit(10);

            if (metrics.length === 0) return 'Data metrik tidak cukup untuk diagnosis.';

            const prompt = `
                Role: Network Expert assistant.
                Analyze the recent metrics for this router and suggest if any optimizations are needed.

                METRICS DATA (Latest 10 points):
                ${metrics.map(m => `- CPU: ${m.cpuLoad || 0}%, Mem: ${Math.round((m.usedMemory || 0) / (m.totalMemory || 1) * 100)}%, Temp: ${m.temperature || 'N/A'}C`).join('\n')}

                Analyze for: High CPU spikes, memory leaks, or thermal issues.
                Bahasa Indonesia.
            `;

            return await this.safeGenerateContent(effectiveApiKey, prompt);
        } catch (error: any) {
            logger.error({ err: error, routerId }, 'AIService: Failed to get diagnostics insights');
            return 'Gagal melakukan diagnosis router.';
        }
    }
}

export const aiService = AIService.getInstance();

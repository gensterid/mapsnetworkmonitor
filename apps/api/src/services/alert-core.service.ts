import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { appSettings, routers } from '../db/schema/index.js';

export const DEFAULT_THRESHOLDS = {
    cpuWarning: 70,
    cpuCritical: 90,
    memoryWarning: 80,
    memoryCritical: 95,
};

export const ALERT_COOLDOWN_MINUTES = 30;

export const ISSUE_TYPES = ['high_cpu', 'high_memory', 'high_disk', 'threshold', 'system', 'high_latency', 'packet_loss', 'snmp_error'];
export const CONNECTIVITY_TYPES = ['status_change', 'netwatch_down', 'interface_down', 'pppoe_connect', 'pppoe_disconnect', 'reboot'];

/**
 * Check if alert is an "issue" (System/Performance) vs "alert" (Connectivity/Status)
 */
export function isIssue(type: string, severity: string): boolean {
    if (ISSUE_TYPES.includes(type)) return true;
    if (type === 'threshold') return true;

    // Warnings that are NOT connectivity related are issues
    if (severity === 'warning' && !CONNECTIVITY_TYPES.includes(type)) {
        return true;
    }

    return false;
}

export async function getTenantIdFromRouter(routerId: string, tx: any = db): Promise<string | null> {
    const [router] = await tx
        .select({ tenantId: routers.tenantId })
        .from(routers)
        .where(eq(routers.id, routerId));
    return router?.tenantId || null;
}

/**
 * Get alert thresholds from settings
 */
export async function getThresholds(tx: any = db): Promise<{
    cpuWarning: number;
    cpuCritical: number;
    memoryWarning: number;
    memoryCritical: number;
    alertsEnabled: boolean;
    statusChangeAlerts: boolean;
    highCpuAlerts: boolean;
    highMemoryAlerts: boolean;
}> {
    const settings = await tx.select().from(appSettings);
    const settingsMap: Record<string, unknown> = {};
    settings.forEach((s: any) => {
        settingsMap[s.key] = s.value;
    });

    return {
        cpuWarning: (settingsMap.alertThresholdCpuWarning as number) ?? DEFAULT_THRESHOLDS.cpuWarning,
        cpuCritical: (settingsMap.alertThresholdCpuCritical as number) ?? DEFAULT_THRESHOLDS.cpuCritical,
        memoryWarning: (settingsMap.alertThresholdMemoryWarning as number) ?? DEFAULT_THRESHOLDS.memoryWarning,
        memoryCritical: (settingsMap.alertThresholdMemoryCritical as number) ?? DEFAULT_THRESHOLDS.memoryCritical,
        alertsEnabled: settingsMap.alertsEnabled !== false,
        statusChangeAlerts: settingsMap.statusChangeAlerts !== false,
        highCpuAlerts: settingsMap.highCpuAlerts !== false,
        highMemoryAlerts: settingsMap.highMemoryAlerts !== false,
    };
}

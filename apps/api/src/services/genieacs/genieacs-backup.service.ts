import { db } from '../../db/index.js';
import { onus, genieacsBackups } from '../../db/schema/index.js';
import { eq, and, or, desc } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import { getDevice, getWanConnections, transformGenieACSDevice } from './genieacs-device.service.js';
import { updateWanConfig, updateWifiConfig } from './genieacs-action.service.js';

export async function getBackups(onuId: string, modelOverride?: string) {
    const [onu] = await db.select().from(onus).where(eq(onus.id, onuId)).limit(1);
    if (!onu) return [];
    const targetModel = (modelOverride || onu.model || '').replace(/^ONU_|^GPON_|^EPON_/g, '');
    return db.select().from(genieacsBackups).where(or(eq(genieacsBackups.onuId, onuId), and(eq(genieacsBackups.model, targetModel), eq(genieacsBackups.type, 'snapshot'))))
        .orderBy(desc(genieacsBackups.createdAt));
}

export async function backupDevice(deviceId: string, name: string, routerId?: string, tenantId?: string) {
    try {
        const device = await getDevice(deviceId, routerId, tenantId);
        if (!device) return { success: false, error: 'Device not found' };
        const onusRecord = await db.select().from(onus).where(eq(onus.sn, device._deviceId._SerialNumber)).limit(1);
        if (onusRecord.length === 0) return { success: false, error: 'ONU not found' };
        
        const onu = onusRecord[0];
        const connections = getWanConnections(device);
        const config = {
            wan: connections.map(c => ({ name: c.name, type: c.type, mode: c.mode, vlanId: c.vlanId, vlanEnable: c.vlanEnable, serviceList: c.serviceList, bindPorts: c.bindPorts, username: '{{PPPOE_USER}}', password: '{{PPPOE_PASS}}' })),
            wifi: { ssid: device._ssid, password: '{{WIFI_PASS}}' }
        };

        await db.insert(genieacsBackups).values({
            onuId: onu.id, sn: onu.sn, vendor: (device._deviceId?._Manufacturer || 'Unknown').toLowerCase(),
            model: (device._deviceId?._ProductClass || '').replace(/^ONU_|^GPON_|^EPON_/g, ''),
            name, type: 'snapshot' as any, config
        });
        return { success: true };
    } catch (error) {
        logger.error({ deviceId, err: error }, 'GenieACS backupDevice Error');
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function deleteBackup(backupId: string, tenantId?: string) {
    try {
        await db.delete(genieacsBackups).where(eq(genieacsBackups.id, backupId));
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function restoreDeviceAuto(deviceId: string, backupId: string, routerId?: string, tenantId?: string, selectedWanIndices?: number[]) {
    try {
        const [backup] = await db.select().from(genieacsBackups).where(eq(genieacsBackups.id, backupId)).limit(1);
        if (!backup) return { success: false, error: 'Backup not found' };
        const device = await getDevice(deviceId, routerId, tenantId);
        if (!device) return { success: false, error: 'Target device not found' };
        const [onu] = await db.select().from(onus).where(eq(onus.sn, device._deviceId._SerialNumber)).limit(1);
        
        const backupConfig = backup.config as any;
        const indices = selectedWanIndices || [0];
        const connections = (backupConfig.wan || []).filter((_: any, idx: number) => indices.includes(idx));

        for (const wan of connections) {
            const res = await updateWanConfig(deviceId, {
                wanType: (wan.type || '').toLowerCase().includes('pppoe') ? 'pppoe' : 'ip',
                connectionMode: (wan.mode || '').toLowerCase().includes('bridge') ? 'bridge' : 'route',
                vlanId: parseInt(String(wan.vlanId)) || 0,
                username: (onu as any).pppoeUser || '',
                password: (onu as any).pppoePass || '',
                serviceList: wan.serviceList || 'INTERNET',
                bindPorts: (wan.bindPorts || []).join(','),
                enable: true
            }, routerId, tenantId);
            if (!res.success) return res;
        }
        return { success: true, count: connections.length };
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }; }
}

export async function restoreDeviceManual(deviceId: string, config: any, routerId?: string, tenantId?: string) {
    try {
        if (config.vlanId) {
            await updateWanConfig(deviceId, {
                wanType: config.connectionType === 'PPPoE' ? 'pppoe' : 'ip',
                connectionMode: (config.connectionType === 'Bridge' || config.connectionMode === 'bridge') ? 'bridge' : 'route',
                vlanId: parseInt(config.vlanId), bindPorts: config.bindPorts,
                username: config.pppoeUser, password: config.pppoePass,
                dhcpServerEnable: config.dhcpServerEnable, connectionPath: config.connectionPath, enable: true
            }, routerId, tenantId);
        }
        if (config.ssid || config.wifiPass || config.ssidIndex) {
            const ssidIdx = config.ssidIndex || 1;
            await updateWifiConfig(deviceId, {
                ssidIndex: ssidIdx, ssid: config.ssid, password: config.wifiPass,
                enable: config.enable !== undefined ? config.enable : true,
                securityMode: config.securityMode || 'WPA2-PSK'
            }, routerId, tenantId);
        }
        const device = await getDevice(deviceId, routerId, tenantId);
        if (device?._deviceId?._SerialNumber) {
            await db.update(onus).set({ pppoeUser: config.pppoeUser, pppoePass: config.pppoePass, vlanId: parseInt(config.vlanId) })
                .where(eq(onus.sn, device._deviceId._SerialNumber));
        }
        return { success: true };
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }; }
}

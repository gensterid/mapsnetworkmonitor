import { promises as fs } from 'fs';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { vpnServers, type VpnServer } from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import { vpnPaths, VPN_SYSTEMD_DISABLED } from '../../lib/vpn/path-config.js';
import { generateOpenVpnConfig } from '../../lib/vpn/config-generator.js';
import { generateSystemdUnit, getUnitName } from '../../lib/vpn/systemd-unit-generator.js';
import {
    daemonReload,
    startUnit,
    stopUnit,
    restartUnit,
    getUnitStatus,
    findTunnelIpInSubnet,
} from '../../lib/vpn/systemd-exec.js';
import { decrypt } from '../../lib/encryption.js';

/**
 * VPN Connection Manager — in-process orchestrator.
 *
 * Tanggung jawab:
 * 1. Boot-time: load all enabled VPN dari DB, generate config + unit
 *    file, start systemd unit untuk masing-masing.
 * 2. Per-VPN connect/disconnect/restart dipicu dari endpoint API.
 * 3. Status poller — interval 30s baca systemd state + IP tap interface,
 *    update field status / tunnel_ip / last_* di DB.
 * 4. Graceful stop saat app shutdown — stop semua unit dengan benar.
 *
 * Saat env VPN_DISABLE_SYSTEMD=1, semua exec systemctl di-skip
 * (untuk dev non-Linux). DB status tetap di-update untuk testing UI.
 */

const POLL_INTERVAL_MS = 30_000;        // 30 detik

class VpnConnectionManagerService {
    private pollTimer: NodeJS.Timeout | null = null;
    private isStarted = false;

    /**
     * Boot-time initialization. Dipanggil sekali saat app start.
     * - Pastikan direktori file ada
     * - Untuk semua VPN enabled: write config + unit, systemctl start
     * - Start polling loop
     */
    async start(): Promise<void> {
        if (this.isStarted) {
            logger.warn('[vpn-conn-mgr] start() called multiple times');
            return;
        }
        this.isStarted = true;

        if (VPN_SYSTEMD_DISABLED) {
            logger.info('[vpn-conn-mgr] Started in DISABLED mode (VPN_DISABLE_SYSTEMD=1) — exec systemctl skipped');
        } else {
            logger.info('[vpn-conn-mgr] Starting connection manager');
        }

        try {
            await this.ensureDirectories();

            const enabled = await db.select().from(vpnServers).where(eq(vpnServers.enabled, true));
            logger.info({ count: enabled.length }, '[vpn-conn-mgr] Loading enabled VPN servers');

            // Reload daemon sekali dulu sebelum start unit baru
            if (!VPN_SYSTEMD_DISABLED) {
                try { await daemonReload(); } catch (err: any) {
                    logger.warn({ err: err.message }, '[vpn-conn-mgr] daemon-reload failed at startup — continuing anyway');
                }
            }

            // Connect satu per satu — biar log nya jelas per-VPN kalau ada error
            for (const row of enabled) {
                try {
                    await this.connect(row.id);
                } catch (err: any) {
                    logger.error({ err: err.message, vpnId: row.id, name: row.name }, '[vpn-conn-mgr] connect at boot failed');
                }
            }

            // Start polling
            this.startPolling();

            logger.info('[vpn-conn-mgr] Started');
        } catch (err: any) {
            logger.error({ err: err.message }, '[vpn-conn-mgr] start failed');
        }
    }

    /**
     * Graceful stop. Dipanggil dari gracefulShutdown handler.
     * Stop polling, stop semua VPN unit yang sedang aktif.
     */
    async stop(): Promise<void> {
        if (!this.isStarted) return;
        this.isStarted = false;

        logger.info('[vpn-conn-mgr] Stopping connection manager');

        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }

        // Stop semua unit — tapi best-effort, jangan blokir shutdown
        try {
            const enabled = await db.select().from(vpnServers).where(eq(vpnServers.enabled, true));
            await Promise.allSettled(
                enabled.map(async (row) => {
                    try {
                        await stopUnit(getUnitName(row.id));
                    } catch (err: any) {
                        logger.warn({ err: err.message, vpnId: row.id }, '[vpn-conn-mgr] stop unit failed at shutdown');
                    }
                })
            );
        } catch (err: any) {
            logger.warn({ err: err.message }, '[vpn-conn-mgr] error during shutdown stop');
        }

        logger.info('[vpn-conn-mgr] Stopped');
    }

    /**
     * Connect 1 VPN: regenerate config + creds, daemon-reload, start unit.
     */
    async connect(vpnId: string): Promise<void> {
        const row = await this.loadRow(vpnId);
        if (!row.enabled) {
            logger.info({ vpnId, name: row.name }, '[vpn-conn-mgr] connect skipped — VPN disabled');
            return;
        }

        logger.info({ vpnId, name: row.name }, '[vpn-conn-mgr] connecting');

        await this.writeConfigFiles(row);

        if (!VPN_SYSTEMD_DISABLED) {
            try {
                await daemonReload();
                await startUnit(getUnitName(vpnId));
            } catch (err: any) {
                await this.updateDbStatus(vpnId, {
                    status: 'error',
                    lastError: err.message,
                    incrementAttempts: true,
                });
                throw err;
            }
        }

        await this.updateDbStatus(vpnId, { status: 'connecting' });
    }

    async disconnect(vpnId: string): Promise<void> {
        const row = await this.loadRow(vpnId);
        logger.info({ vpnId, name: row.name }, '[vpn-conn-mgr] disconnecting');

        if (!VPN_SYSTEMD_DISABLED) {
            try {
                await stopUnit(getUnitName(vpnId));
            } catch (err: any) {
                logger.warn({ err: err.message, vpnId }, '[vpn-conn-mgr] stop unit failed');
            }
        }

        await this.updateDbStatus(vpnId, {
            status: 'disconnected',
            markDisconnected: true,
            tunnelIp: null,
        });
    }

    async reconnect(vpnId: string): Promise<void> {
        const row = await this.loadRow(vpnId);
        logger.info({ vpnId, name: row.name }, '[vpn-conn-mgr] reconnecting');

        if (!VPN_SYSTEMD_DISABLED) {
            try {
                // Defense-in-depth: kalau unit/config belum ada (mis. user pernah
                // edit config dari luar atau file ke-rm), regenerate dulu sebelum
                // systemctl restart. Tanpa ini, restart fail silent (systemctl
                // exit non-zero tapi tidak ke-throw) karena unit not found.
                await this.writeConfigFiles(row);
                await daemonReload();
                await restartUnit(getUnitName(vpnId));
            } catch (err: any) {
                await this.updateDbStatus(vpnId, {
                    status: 'error',
                    lastError: err.message,
                    incrementAttempts: true,
                });
                throw err;
            }
        }

        await this.updateDbStatus(vpnId, { status: 'connecting' });
    }

    /**
     * Polling loop — update status semua VPN dari systemd + ip output.
     */
    private startPolling(): void {
        this.pollTimer = setInterval(() => {
            this.pollAll().catch((err) => {
                logger.error({ err: err.message }, '[vpn-conn-mgr] poll cycle failed');
            });
        }, POLL_INTERVAL_MS);

        // Run pertama kali sebentar setelah start (10 detik) supaya VPN
        // sempat handshake dulu
        setTimeout(() => {
            this.pollAll().catch((err) => {
                logger.error({ err: err.message }, '[vpn-conn-mgr] initial poll failed');
            });
        }, 10_000);
    }

    async pollAll(): Promise<void> {
        const all = await db.select().from(vpnServers);
        for (const row of all) {
            try {
                await this.pollOne(row);
            } catch (err: any) {
                logger.warn({ err: err.message, vpnId: row.id }, '[vpn-conn-mgr] poll one failed');
            }
        }
    }

    private async pollOne(row: VpnServer): Promise<void> {
        if (!row.enabled) {
            // Disabled — pastikan status 'disabled' di DB
            if (row.status !== 'disabled') {
                await this.updateDbStatus(row.id, { status: 'disabled' });
            }
            return;
        }

        const unitName = getUnitName(row.id);
        const status = await getUnitStatus(unitName);

        let newStatus: string;
        let lastError: string | undefined | null;
        let tunnelIp: string | undefined | null = undefined;
        let markConnected = false;
        let markDisconnected = false;

        switch (status.state) {
            case 'active': {
                newStatus = 'connected';
                // Auto-discover tunnel IP dari interface yang match subnet
                const found = await findTunnelIpInSubnet(row.clientSubnet);
                tunnelIp = found?.ip ?? row.tunnelIp;
                if (row.status !== 'connected') markConnected = true;
                break;
            }
            case 'activating':
                newStatus = 'connecting';
                break;
            case 'inactive':
                newStatus = 'disconnected';
                if (row.status === 'connected') markDisconnected = true;
                tunnelIp = null;
                break;
            case 'failed':
                newStatus = 'error';
                lastError = `systemd unit failed (mainPid=${status.mainPid ?? '-'})`;
                tunnelIp = null;
                if (row.status === 'connected') markDisconnected = true;
                break;
            default:
                // unknown — VPN_DISABLE_SYSTEMD aktif, atau systemctl gak available.
                // Skip update supaya tidak override status yang sudah set by endpoint
                return;
        }

        // Hanya tulis update kalau ada perubahan yang berarti
        const needsUpdate =
            row.status !== newStatus ||
            (tunnelIp !== undefined && tunnelIp !== row.tunnelIp) ||
            lastError !== undefined ||
            markConnected || markDisconnected;

        if (needsUpdate) {
            await this.updateDbStatus(row.id, {
                status: newStatus,
                tunnelIp,
                lastError,
                markConnected,
                markDisconnected,
            });
        } else {
            // Touch lastCheckedAt saja
            await db
                .update(vpnServers)
                .set({ lastCheckedAt: new Date() })
                .where(eq(vpnServers.id, row.id));
        }
    }

    /**
     * Write OpenVPN config + creds + systemd unit file ke disk.
     * Permission ditata: creds 600, config 644, unit 644.
     */
    private async writeConfigFiles(row: VpnServer): Promise<void> {
        const password = decrypt(row.passwordEncrypted, `vpn-server:${row.name}`);
        if (!password) {
            throw new Error(`Failed decrypt password untuk VPN "${row.name}" — cek ENCRYPTION_KEY`);
        }

        const { ovpnContent, credsContent } = generateOpenVpnConfig(row, password);
        const unitContent = generateSystemdUnit({ id: row.id, name: row.name });

        const configPath = vpnPaths.configPath(row.id);
        const credsPath = vpnPaths.credsPath(row.id);
        const unitPath = vpnPaths.unitPath(row.id);

        // Write config
        await fs.writeFile(configPath, ovpnContent, { mode: 0o644 });

        // Write creds (mode 600 — sensitive)
        await fs.writeFile(credsPath, credsContent, { mode: 0o600 });

        // Write systemd unit
        await fs.writeFile(unitPath, unitContent, { mode: 0o644 });

        logger.debug({ vpnId: row.id, configPath, unitPath }, '[vpn-conn-mgr] config files written');
    }

    /**
     * Ensure semua direktori target ada (idempotent).
     * Dipanggil di start() — kalau gagal create, app boot tetap lanjut
     * (cuma VPN management gak akan jalan).
     */
    private async ensureDirectories(): Promise<void> {
        const dirs = [vpnPaths.configDir, vpnPaths.credsDir, vpnPaths.logDir];
        // Note: systemdDir TIDAK kita create — sudah ada di Linux,
        // dan kalau gak ada artinya bukan Linux dengan systemd.

        for (const dir of dirs) {
            try {
                await fs.mkdir(dir, { recursive: true, mode: 0o755 });
            } catch (err: any) {
                logger.warn({ err: err.message, dir }, '[vpn-conn-mgr] mkdir failed (might be EACCES — check permissions)');
            }
        }

        // Tighten creds dir ke 700
        try {
            await fs.chmod(vpnPaths.credsDir, 0o700);
        } catch { /* ignore */ }
    }

    private async loadRow(vpnId: string): Promise<VpnServer> {
        const [row] = await db.select().from(vpnServers).where(eq(vpnServers.id, vpnId)).limit(1);
        if (!row) throw new Error(`VPN server ${vpnId} tidak ditemukan`);
        return row;
    }

    /**
     * Update DB status fields. Reuse helper logic mirip
     * vpnServerService.updateStatus tapi langsung db biar tidak circular dep.
     */
    private async updateDbStatus(
        id: string,
        update: {
            status?: string;
            tunnelIp?: string | null;
            lastError?: string | null;
            markConnected?: boolean;
            markDisconnected?: boolean;
            incrementAttempts?: boolean;
        }
    ): Promise<void> {
        const patch: any = {
            lastCheckedAt: new Date(),
        };
        if (update.status !== undefined) patch.status = update.status;
        if (update.tunnelIp !== undefined) patch.tunnelIp = update.tunnelIp;
        if (update.lastError !== undefined) patch.lastError = update.lastError;
        if (update.markConnected) {
            patch.lastConnectedAt = new Date();
            patch.connectionAttempts = 0;
        }
        if (update.markDisconnected) {
            patch.lastDisconnectedAt = new Date();
        }

        await db.update(vpnServers).set(patch).where(eq(vpnServers.id, id));
    }
}

export const vpnConnectionManager = new VpnConnectionManagerService();

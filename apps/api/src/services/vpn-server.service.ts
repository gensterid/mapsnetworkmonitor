import { eq, count, sql, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import { vpnServers, routers, type VpnServer, type NewVpnServer } from '../db/schema/index.js';
import { encrypt, decrypt } from '../lib/encryption.js';
import { validateExtraConfig } from '../lib/vpn/extra-config-whitelist.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { ApiError } from '../middleware/error.middleware.js';
import { logger } from '../lib/logger.js';

/**
 * Input shape untuk create — password plain, akan di-encrypt sebelum simpan.
 * Field status/tunnel_ip/last_* di-skip (managed by connection-manager service).
 */
export interface CreateVpnServerInput {
    name: string;
    region?: string | null;
    type: string;                          // 'openvpn' for now
    enabled?: boolean;
    priority?: number;
    notes?: string | null;
    host: string;
    port: number;
    proto?: 'tcp' | 'udp';
    username: string;
    password: string;                      // plain — service encrypt sebelum simpan
    mode?: 'tap' | 'tun';
    cipher?: string;
    auth?: string;
    caCertPem?: string | null;
    verifyServerCert?: boolean;
    extraConfig?: string | null;
    clientSubnet: string;                  // "172.18.19.0/24"
}

export interface UpdateVpnServerInput extends Partial<Omit<CreateVpnServerInput, 'password'>> {
    password?: string | null;              // null/undefined = jangan ubah password
}

/**
 * Shape yang aman dikirim ke frontend — passwordEncrypted di-strip.
 */
export type VpnServerPublic = Omit<VpnServer, 'passwordEncrypted'> & {
    hasPassword: boolean;
};

function toPublic(row: VpnServer): VpnServerPublic {
    const { passwordEncrypted, ...rest } = row;
    return { ...rest, hasPassword: !!passwordEncrypted };
}

class VpnServerService {
    /**
     * List semua VPN server (untuk SuperAdmin dashboard).
     * Field passwordEncrypted di-strip dari response.
     */
    async findAll(): Promise<VpnServerPublic[]> {
        const rows = await db.select().from(vpnServers).orderBy(vpnServers.priority);
        return rows.map(toPublic);
    }

    async findById(id: string): Promise<VpnServerPublic | null> {
        const [row] = await db.select().from(vpnServers).where(eq(vpnServers.id, id)).limit(1);
        return row ? toPublic(row) : null;
    }

    /**
     * Internal — return raw row including encrypted password.
     * Untuk connection-manager service (decrypt password sebelum spawn openvpn).
     */
    async findByIdRaw(id: string): Promise<VpnServer | null> {
        const [row] = await db.select().from(vpnServers).where(eq(vpnServers.id, id)).limit(1);
        return row ?? null;
    }

    /**
     * Decrypt password untuk pemakaian internal (connection-manager).
     * Tidak boleh expose result ke endpoint.
     */
    decryptPassword(row: VpnServer): string {
        return decrypt(row.passwordEncrypted, `vpn-server:${row.name}`);
    }

    async create(input: CreateVpnServerInput, userId: string): Promise<VpnServerPublic> {
        this.validateInput(input);

        // Subnet conflict pre-check (selain UNIQUE di DB) untuk pesan error lebih jelas
        const existingSubnet = await db
            .select({ id: vpnServers.id, name: vpnServers.name })
            .from(vpnServers)
            .where(eq(vpnServers.clientSubnet, input.clientSubnet))
            .limit(1);
        if (existingSubnet[0]) {
            throw ApiError.conflict(
                `Subnet ${input.clientSubnet} sudah dipakai VPN "${existingSubnet[0].name}". ` +
                `Setiap VPN server harus punya subnet unik untuk hindari konflik routing.`,
                { conflictingVpnId: existingSubnet[0].id, conflictingVpnName: existingSubnet[0].name }
            );
        }

        // Name conflict pre-check
        const existingName = await db
            .select({ id: vpnServers.id })
            .from(vpnServers)
            .where(eq(vpnServers.name, input.name))
            .limit(1);
        if (existingName[0]) {
            throw ApiError.conflict(`VPN server dengan nama "${input.name}" sudah ada.`);
        }

        const passwordEncrypted = encrypt(input.password);

        const insertValue: NewVpnServer = {
            name: input.name,
            region: input.region ?? null,
            type: input.type,
            enabled: input.enabled ?? true,
            priority: input.priority ?? 5,
            notes: input.notes ?? null,
            host: input.host,
            port: input.port,
            proto: input.proto ?? 'tcp',
            username: input.username,
            passwordEncrypted,
            mode: input.mode ?? 'tap',
            cipher: input.cipher ?? 'AES-256-CBC',
            auth: input.auth ?? 'SHA1',
            caCertPem: input.caCertPem ?? null,
            verifyServerCert: input.verifyServerCert ?? true,
            extraConfig: input.extraConfig ?? null,
            clientSubnet: input.clientSubnet,
            createdBy: userId,
            updatedBy: userId,
        };

        const [created] = await db.insert(vpnServers).values(insertValue).returning();

        await auditRepository.create({
            userId,
            action: 'create',
            entity: 'vpn_server',
            entityId: created.id,
            details: {
                name: created.name,
                host: created.host,
                clientSubnet: created.clientSubnet,
            },
        });

        logger.info(
            { vpnServerId: created.id, name: created.name, userId },
            'VPN server created'
        );

        return toPublic(created);
    }

    async update(id: string, input: UpdateVpnServerInput, userId: string): Promise<VpnServerPublic> {
        const existing = await this.findByIdRaw(id);
        if (!existing) throw ApiError.notFound('VPN server tidak ditemukan');

        this.validateInput(input);

        // Kalau ganti subnet, pastikan tidak konflik dengan VPN lain
        if (input.clientSubnet && input.clientSubnet !== existing.clientSubnet) {
            const conflict = await db
                .select({ id: vpnServers.id, name: vpnServers.name })
                .from(vpnServers)
                .where(eq(vpnServers.clientSubnet, input.clientSubnet))
                .limit(1);
            if (conflict[0] && conflict[0].id !== id) {
                throw ApiError.conflict(
                    `Subnet ${input.clientSubnet} sudah dipakai VPN "${conflict[0].name}".`,
                    { conflictingVpnId: conflict[0].id }
                );
            }
        }

        // Kalau ganti nama, pastikan tidak duplikat
        if (input.name && input.name !== existing.name) {
            const conflict = await db
                .select({ id: vpnServers.id })
                .from(vpnServers)
                .where(eq(vpnServers.name, input.name))
                .limit(1);
            if (conflict[0] && conflict[0].id !== id) {
                throw ApiError.conflict(`VPN server dengan nama "${input.name}" sudah ada.`);
            }
        }

        const patch: Partial<NewVpnServer> = {
            updatedBy: userId,
            updatedAt: new Date(),
        };

        // Hanya update field yang dikirim eksplisit
        for (const key of [
            'name', 'region', 'type', 'enabled', 'priority', 'notes',
            'host', 'port', 'proto', 'username',
            'mode', 'cipher', 'auth', 'caCertPem', 'verifyServerCert', 'extraConfig',
            'clientSubnet',
        ] as const) {
            if (input[key] !== undefined) {
                (patch as any)[key] = input[key];
            }
        }

        // Password handling: kalau dikirim non-null/empty, encrypt ulang
        if (input.password) {
            patch.passwordEncrypted = encrypt(input.password);
        }

        const [updated] = await db
            .update(vpnServers)
            .set(patch)
            .where(eq(vpnServers.id, id))
            .returning();

        // Audit log — diff sederhana (jangan log password content)
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
            if (key === 'passwordEncrypted') {
                changes.password = { from: '***', to: '*** (changed)' };
                continue;
            }
            if (key === 'updatedAt' || key === 'updatedBy') continue;
            const oldVal = (existing as any)[key];
            const newVal = (patch as any)[key];
            if (oldVal !== newVal) {
                changes[key] = { from: oldVal, to: newVal };
            }
        }

        await auditRepository.create({
            userId,
            action: 'update',
            entity: 'vpn_server',
            entityId: id,
            details: { name: updated.name, changes },
        });

        logger.info(
            { vpnServerId: id, name: updated.name, userId, changedFields: Object.keys(changes) },
            'VPN server updated'
        );

        return toPublic(updated);
    }

    /**
     * Delete VPN server. Block kalau ada router yang masih reference.
     * Return list router yang link supaya UI bisa tampilkan ke operator.
     */
    async delete(id: string, userId: string): Promise<void> {
        const existing = await this.findByIdRaw(id);
        if (!existing) throw ApiError.notFound('VPN server tidak ditemukan');

        // Cek router linked
        const linkedRouters = await db
            .select({ id: routers.id, name: routers.name, host: routers.host })
            .from(routers)
            .where(eq(routers.vpnServerId, id));

        if (linkedRouters.length > 0) {
            throw ApiError.conflict(
                `Tidak bisa hapus VPN "${existing.name}" — masih ada ${linkedRouters.length} router pakai VPN ini. ` +
                `Pindahkan atau hapus router-router tersebut dulu.`,
                {
                    linkedRouters,
                    linkedCount: linkedRouters.length,
                }
            );
        }

        await db.delete(vpnServers).where(eq(vpnServers.id, id));

        await auditRepository.create({
            userId,
            action: 'delete',
            entity: 'vpn_server',
            entityId: id,
            details: { name: existing.name, host: existing.host },
        });

        logger.info({ vpnServerId: id, name: existing.name, userId }, 'VPN server deleted');
    }

    /**
     * List router yang link ke VPN server ini. Dipakai di endpoint
     * GET /:id/clients dan juga preview saat delete.
     */
    async listClients(id: string): Promise<Array<{ id: string; name: string; host: string; status: string | null }>> {
        return db
            .select({
                id: routers.id,
                name: routers.name,
                host: routers.host,
                status: routers.status,
            })
            .from(routers)
            .where(eq(routers.vpnServerId, id));
    }

    /**
     * Update status fields. Dipanggil dari connection-manager service
     * (Phase 3.3) saat tunnel state berubah.
     */
    async updateStatus(
        id: string,
        update: {
            status: string;
            tunnelIp?: string | null;
            lastError?: string | null;
            incrementAttempts?: boolean;
            markConnected?: boolean;
            markDisconnected?: boolean;
        }
    ): Promise<void> {
        const patch: any = {
            status: update.status,
            lastCheckedAt: new Date(),
        };
        if (update.tunnelIp !== undefined) patch.tunnelIp = update.tunnelIp;
        if (update.lastError !== undefined) patch.lastError = update.lastError;
        if (update.markConnected) {
            patch.lastConnectedAt = new Date();
            patch.connectionAttempts = 0;
        }
        if (update.markDisconnected) {
            patch.lastDisconnectedAt = new Date();
        }
        if (update.incrementAttempts) {
            patch.connectionAttempts = sql`${vpnServers.connectionAttempts} + 1`;
        }

        await db.update(vpnServers).set(patch).where(eq(vpnServers.id, id));
    }

    /**
     * Connect/disconnect/reconnect placeholders. Real systemd integration
     * di Phase 3.3. Untuk sekarang, hanya update status di DB + audit log.
     *
     * Endpoint return 202 Accepted — UI poll status untuk lihat hasil.
     */
    async requestConnect(id: string, userId: string): Promise<void> {
        const existing = await this.findByIdRaw(id);
        if (!existing) throw ApiError.notFound('VPN server tidak ditemukan');
        if (!existing.enabled) {
            throw ApiError.badRequest('VPN server di-disable. Enable dulu sebelum connect.');
        }

        await this.updateStatus(id, { status: 'connecting' });

        await auditRepository.create({
            userId,
            action: 'connect_request',
            entity: 'vpn_server',
            entityId: id,
            details: { name: existing.name },
        });

        // Phase 3.3: trigger connection-manager service di sini.
        logger.info({ vpnServerId: id, userId }, 'VPN connect requested (Phase 3.3 will wire systemd)');
    }

    async requestDisconnect(id: string, userId: string): Promise<void> {
        const existing = await this.findByIdRaw(id);
        if (!existing) throw ApiError.notFound('VPN server tidak ditemukan');

        await this.updateStatus(id, { status: 'disconnected', markDisconnected: true });

        await auditRepository.create({
            userId,
            action: 'disconnect_request',
            entity: 'vpn_server',
            entityId: id,
            details: { name: existing.name },
        });

        logger.info({ vpnServerId: id, userId }, 'VPN disconnect requested');
    }

    /**
     * Validation umum dipakai di create + update.
     * Throw ApiError.badRequest kalau invalid.
     */
    private validateInput(input: CreateVpnServerInput | UpdateVpnServerInput): void {
        // Type wajib openvpn untuk sekarang
        if (input.type !== undefined && input.type !== 'openvpn') {
            throw ApiError.badRequest(
                `Type "${input.type}" belum didukung. Pakai "openvpn" untuk sekarang.`
            );
        }

        // Subnet format basic check (xxx.xxx.xxx.xxx/yy)
        if (input.clientSubnet !== undefined) {
            const subnetRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
            if (!subnetRegex.test(input.clientSubnet)) {
                throw ApiError.badRequest(
                    `Subnet "${input.clientSubnet}" format salah. Pakai CIDR seperti 172.18.19.0/24.`
                );
            }
        }

        // Port range
        if (input.port !== undefined && (input.port < 1 || input.port > 65535)) {
            throw ApiError.badRequest('Port harus antara 1-65535.');
        }

        // Priority range
        if (input.priority !== undefined && (input.priority < 1 || input.priority > 9)) {
            throw ApiError.badRequest('Priority harus antara 1 (highest) - 9 (lowest).');
        }

        // Mode untuk openvpn
        if (input.mode !== undefined && !['tap', 'tun'].includes(input.mode)) {
            throw ApiError.badRequest('Mode harus "tap" atau "tun".');
        }

        // Proto
        if (input.proto !== undefined && !['tcp', 'udp'].includes(input.proto)) {
            throw ApiError.badRequest('Proto harus "tcp" atau "udp".');
        }

        // Extra config whitelist
        if (input.extraConfig !== undefined && input.extraConfig !== null) {
            const result = validateExtraConfig(input.extraConfig);
            if (!result.ok) {
                throw ApiError.badRequest(
                    'Extra config tidak valid. Lihat detail untuk baris yang bermasalah.',
                    { errors: result.errors }
                );
            }
        }
    }

    /**
     * Aggregate summary untuk dashboard SuperAdmin.
     */
    async getSummary(): Promise<{
        total: number;
        connected: number;
        disconnected: number;
        error: number;
        disabled: number;
        totalClients: number;
    }> {
        const [totals] = await db
            .select({
                total: count(),
                connected: sql<number>`count(*) filter (where status = 'connected')`,
                disconnected: sql<number>`count(*) filter (where status = 'disconnected')`,
                error: sql<number>`count(*) filter (where status = 'error')`,
                disabled: sql<number>`count(*) filter (where status = 'disabled' or enabled = false)`,
            })
            .from(vpnServers);

        const [clientCount] = await db
            .select({ total: count() })
            .from(routers)
            .where(ne(routers.vpnServerId, sql`null`));

        return {
            total: Number(totals?.total ?? 0),
            connected: Number(totals?.connected ?? 0),
            disconnected: Number(totals?.disconnected ?? 0),
            error: Number(totals?.error ?? 0),
            disabled: Number(totals?.disabled ?? 0),
            totalClients: Number(clientCount?.total ?? 0),
        };
    }
}

export const vpnServerService = new VpnServerService();

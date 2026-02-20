import { eq, desc, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { olts, type Olt, type NewOlt } from '../db/schema/olts.js';
import { onus, type Onu } from '../db/schema/onus.js';
import { snmpService } from './snmp.service.js';
import { encrypt, decrypt } from '../lib/encryption.js';
import { OltDriverFactory } from './olt-drivers/driver.factory.js';
import { logger } from '../lib/logger.js';
import { ApiError } from '../middleware/error.middleware.js';

export class OltService {
    private static instance: OltService;

    private constructor() { }

    public static getInstance(): OltService {
        if (!OltService.instance) {
            OltService.instance = new OltService();
        }
        return OltService.instance;
    }

    async findAll(userId?: string, userRole?: string): Promise<Olt[]> {
        let query = db.select().from(olts).orderBy(olts.name).$dynamic();

        // If user is not admin, filter by assigned routers
        if (userId && userRole && userRole !== 'admin') {
            // Get assigned router IDs
            const { userRouters } = await import('../db/schema/user-routers.js');
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));

            const routerIds = assigned.map((a) => a.routerId);

            if (routerIds.length === 0) {
                // Return generic OLTs (no parent) ?? Or nothing? 
                // Strict: Only return if parentId matches assigned router. 
                // If parentId is null, maybe Admin only? Or everyone?
                // Let's assume strict: Must be assigned to a router to see its OLT. 
                // What about OLTs without parentId?
                // Decision: Non-admin can only see OLTs linked to their routers.
                // If they have no routers, they see nothing.
                return [];
            }

            // Filter OLTs
            const { inArray } = await import('drizzle-orm');
            query = db
                .select()
                .from(olts)
                .where(inArray(olts.parentId, routerIds))
                .orderBy(olts.name)
                .$dynamic();
        }

        const results = await query;
        return results.map(olt => ({
            ...olt,
            webPassword: olt.webPassword ? '********' : null
        }));
    }

    async findById(id: string, userId?: string, userRole?: string): Promise<Olt | undefined> {
        const [olt] = await db.select().from(olts).where(eq(olts.id, id));
        if (!olt) return undefined;

        // Access Check
        if (userId && userRole && userRole !== 'admin') {
            if (!olt.parentId) {
                // If OLT has no parent router, can standard user see it? 
                // Let's say NO for now to be safe.
                return undefined;
            }

            const { userRouters } = await import('../db/schema/user-routers.js');
            const [assignment] = await db
                .select()
                .from(userRouters)
                .where(and(
                    eq(userRouters.userId, userId),
                    eq(userRouters.routerId, olt.parentId)
                ));

            if (!assignment) {
                return undefined;
            }
        }

        return {
            ...olt,
            webPassword: olt.webPassword ? '********' : null
        };
    }

    // New internal method for tasks that need real credentials
    private async findByIdInternal(id: string): Promise<Olt | undefined> {
        const [olt] = await db.select().from(olts).where(eq(olts.id, id));
        return olt;
    }

    async create(data: NewOlt): Promise<Olt> {
        const createData = { ...data };
        if (createData.webPassword) {
            createData.webPassword = encrypt(createData.webPassword);
        }
        const [olt] = await db.insert(olts).values(createData).returning();
        return olt;
    }

    async update(id: string, data: Partial<NewOlt>): Promise<Olt | undefined> {
        const updateData = { ...data, updatedAt: new Date() };

        // Only update password if it's provided and not the masked placeholder
        if (updateData.webPassword) {
            if (updateData.webPassword === '********') {
                delete updateData.webPassword;
            } else {
                updateData.webPassword = encrypt(updateData.webPassword);
            }
        }

        const [olt] = await db
            .update(olts)
            .set(updateData)
            .where(eq(olts.id, id))
            .returning();

        if (!olt) return undefined;
        return {
            ...olt,
            webPassword: olt.webPassword ? '********' : null
        };
    }

    async delete(id: string): Promise<boolean> {
        const result = await db.delete(olts).where(eq(olts.id, id)).returning();
        return result.length > 0;
    }

    /**
     * Refresh OLT status via SNMP
     */
    async refreshStatus(id: string): Promise<Olt | undefined> {
        const olt = await this.findByIdInternal(id);
        if (!olt) return undefined;

        let isOnline = false;
        let uptime = olt.uptime || 0;
        let description = olt.description || '';
        let snmpStatus: 'online' | 'offline' | null = null;
        let webStatus: 'online' | 'offline' | null = null;
        let activeProtocol: string | null = null;

        // 1. Check SNMP
        if (olt.useSnmp) {
            try {
                const config = {
                    host: olt.host,
                    port: olt.snmpPort,
                    community: olt.snmpCommunity
                };

                const oids = [
                    '1.3.6.1.2.1.1.3.0', // sysUpTime
                    '1.3.6.1.2.1.1.1.0', // sysDescr
                    '1.3.6.1.2.1.1.5.0'  // sysName
                ];

                const results = await snmpService.getMultiple(config, oids);

                if (results && results.length > 0) {
                    snmpStatus = 'online';
                    isOnline = true;
                    if (!activeProtocol) activeProtocol = 'snmp';
                    for (const res of results) {
                        if (res.oid === '1.3.6.1.2.1.1.3.0') {
                            uptime = Math.floor(Number(res.value) / 100);
                        } else if (res.oid === '1.3.6.1.2.1.1.1.0') {
                            description = String(res.value);
                        }
                    }
                } else {
                    snmpStatus = 'offline';
                }
            } catch (error) {
                snmpStatus = 'offline';
            }
        }

        // 2. Check Web
        if (olt.useWeb) {
            try {
                const decryptedPassword = olt.webPassword ? decrypt(olt.webPassword) : undefined;
                const driver = OltDriverFactory.getDriver(
                    olt.type,
                    olt.host,
                    olt.webPort ?? undefined,
                    olt.webUsername ?? undefined,
                    decryptedPassword,
                    olt.webProtocol ?? undefined
                );
                const isWebOnline = await driver.testConnection();

                if (isWebOnline) {
                    webStatus = 'online';
                    isOnline = true;
                    if (!activeProtocol) activeProtocol = 'web';
                } else {
                    webStatus = 'offline';
                }
            } catch (error) {
                logger.error({ err: error, olt: olt.name }, 'Web check failed for OLT using driver');
                webStatus = 'offline';
            }
        }

        // 3. Fallback: TCP Port Check
        // If everything above is offline, check if the IP is at least reachable via the Web Port
        if (!isOnline) {
            try {
                const net = await import('node:net');
                const isReachable = await new Promise<boolean>((resolve) => {
                    const socket = new net.Socket();
                    socket.setTimeout(2000);
                    socket.on('connect', () => { socket.destroy(); resolve(true); });
                    socket.on('timeout', () => { socket.destroy(); resolve(false); });
                    socket.on('error', () => { socket.destroy(); resolve(false); });
                    socket.connect(olt.webPort || 80, olt.host);
                });

                if (isReachable) {
                    logger.info({ olt: olt.name, port: olt.webPort || 80 }, 'OLT reachable via TCP Port (Fallback)');
                    isOnline = true;
                    if (webStatus === 'offline') webStatus = 'online';
                }
            } catch (e) {
                // Ignore fallback errors
            }
        }

        // Update DB
        try {
            const [updatedOlt] = await db
                .update(olts)
                .set({
                    uptime,
                    description,
                    status: isOnline ? 'online' : 'offline',
                    activeProtocol: isOnline ? activeProtocol : null,
                    lastSnmpStatus: snmpStatus,
                    lastWebStatus: webStatus,
                    updatedAt: new Date()
                })
                .where(eq(olts.id, id))
                .returning();

            return updatedOlt;
        } catch (error) {
            logger.error({ err: error, olt: olt.name }, 'Failed to update OLT status');
            return olt;
        }
    }

    /**
     * Get all ONUs associated with OLTs connected to a specific router
     */
    async getOnusByRouter(routerId: string): Promise<Onu[]> {
        const oltList = await db.select({ id: olts.id }).from(olts).where(eq(olts.parentId, routerId));
        const oltIds = oltList.map(o => o.id);

        if (oltIds.length === 0) return [];

        const { inArray } = await import('drizzle-orm');
        return db.select().from(onus).where(inArray(onus.oltId, oltIds)).orderBy(onus.name);
    }
    async getOnus(id: string): Promise<any[]> {
        const olt = await this.findByIdInternal(id);
        if (!olt) throw new Error('OLT not found');

        // [SECURITY] Enforce Web API Disable Flag
        if (!olt.useWeb) {
            logger.info({ olt: olt.name }, 'Web API access is disabled for this OLT. Skipping live fetch.');
            return [];
        }

        try {
            // Import dynamically or use factory
            const { OltDriverFactory } = await import('./olt-drivers/driver.factory.js');

            let decryptedPassword;
            try {
                decryptedPassword = olt.webPassword ? decrypt(olt.webPassword) : undefined;
            } catch (decryptError) {
                logger.error({ err: decryptError, oltId: id }, 'Failed to decrypt OLT password. The ENCRYPTION_KEY might have changed.');
                throw new ApiError(401, 'Please re-enter the OLT password in Settings. The encryption key has changed.');
            }

            const driver = OltDriverFactory.getDriver(
                olt.type || 'generic',
                olt.host,
                olt.webPort || undefined,
                olt.webUsername || undefined,
                decryptedPassword,
                olt.webProtocol || undefined
            );

            await driver.connect();
            const driverOnus = await driver.getOnuList();
            await driver.disconnect();

            // UNIFIED LINKAGE: Auto-sync newly discovered ONUs and enrich with DB metadata
            // This ensures every ONU has an ID for editing/coordinate management
            const results: any[] = [];
            const dbOnus = await db.select().from(onus).where(eq(onus.oltId, id));
            const dbOnuMap = new Map(dbOnus.map(o => [o.sn, o]));

            for (const device of driverOnus) {
                if (!device.sn) {
                    results.push(device);
                    continue;
                }

                let dbOnu = dbOnuMap.get(device.sn);

                // Normalizing status for DB insert if missing
                let status = 'unknown';
                const rawStatus = String(device.status || '').toLowerCase();
                if (rawStatus === 'online' || rawStatus === 'active' || rawStatus === '1') status = 'online';
                else if (device.lastDownReason?.toLowerCase().includes('power')) status = 'power_down';
                else status = 'offline';

                if (!dbOnu) {
                    // Auto-insert missing ONU to provide ID
                    const [inserted] = await db.insert(onus).values({
                        sn: device.sn,
                        oltId: id,
                        ponPort: device.ponId,
                        onuIndex: device.onuId,
                        macAddress: device.macAddress,
                        name: device.name || `ONT-${device.sn.substring(device.sn.length - 4)}`,
                        status: status as any,
                        lastRxPower: device.signal ? String(device.signal) : null,
                        discoverySources: ['olt'],
                        lastSeen: status === 'online' ? new Date() : null,
                        lastDownReason: device.lastDownReason,
                    }).returning();
                    dbOnu = inserted;
                } else {
                    // [SYNC FIX] Update existing ONU status/power/reason whenever we fetch live data
                    // This ensures the Map (which reads from DB) stays in sync with the List (which reads from OLT)
                    try {
                        const updateData: any = {
                            status: status as any,
                            lastRxPower: device.signal ? String(device.signal) : dbOnu.lastRxPower,
                            lastDownReason: device.lastDownReason || dbOnu.lastDownReason,
                            macAddress: device.macAddress || dbOnu.macAddress,
                            updatedAt: new Date(),
                        };

                        if (status === 'online') {
                            updateData.lastSeen = new Date();
                        }

                        // Run update in background to not slow down the read request too much
                        db.update(onus)
                            .set(updateData)
                            .where(eq(onus.id, dbOnu.id))
                            .execute()
                            .catch(err => logger.error({ err, sn: device.sn }, 'Failed to background sync ONU'));

                        // Update local object for the return value immediately
                        dbOnu.status = updateData.status;
                        dbOnu.lastRxPower = updateData.lastRxPower;
                        dbOnu.lastDownReason = updateData.lastDownReason;
                        if (updateData.lastSeen) dbOnu.lastSeen = updateData.lastSeen;
                        if (updateData.macAddress) dbOnu.macAddress = updateData.macAddress;

                    } catch (e) {
                        // Ignore sync errors during read
                    }
                }

                results.push({
                    ...device,
                    id: dbOnu.id,
                    status: dbOnu.status, // [FIX] Use normalized DB status (e.g. 'power_down') instead of raw driver status
                    latitude: dbOnu.latitude,
                    longitude: dbOnu.longitude,
                    description: dbOnu.location,
                    name: dbOnu.name || device.name,
                    lastRxPower: device.signal || dbOnu.lastRxPower,
                    lastDown: dbOnu.lastSeen, // Use lastSeen as lastDown for ONUs
                    macAddress: dbOnu.macAddress,
                    lastDownReason: dbOnu.lastDownReason || device.lastDownReason,
                });
            }

            return results;
        } catch (error) {
            logger.error({ err: error, olt: olt.name }, 'Failed to get ONUs for OLT');
            throw error;
        }
    }

    /**
     * UNIFIED LINKAGE: Sync ONU Inventory from OLT
     * This is the "Source of Truth" sync for Scenario A, 2, 5, 7
     */
    async syncOnuInventory(oltId: string): Promise<{ added: number; updated: number; total: number }> {
        const olt = await this.findByIdInternal(oltId);
        if (!olt) throw new Error('OLT not found');

        logger.info({ olt: olt.name, host: olt.host }, 'Starting ONU Sync');

        // 1. Fetch ONUs from Driver
        let driverOnus: any[] = [];
        try {
            driverOnus = await this.getOnus(oltId);
        } catch (e: any) {
            logger.error({ err: e, olt: olt.name }, 'Sync failed: Could not fetch ONUs from OLT');
            throw e;
        }

        if (!driverOnus || driverOnus.length === 0) {
            logger.warn({ olt: olt.name }, 'No ONUs found in OLT');
            return { added: 0, updated: 0, total: 0 };
        }

        // 2. Prepare Imports
        const { onus, onuStatusEnum } = await import('../db/schema/onus.js');
        const { sql } = await import('drizzle-orm');

        let added = 0;
        let updated = 0;

        // 3. Prepare Batch Data
        const valuesToUpsert: any[] = [];
        const now = new Date();

        for (const device of driverOnus) {
            if (!device.sn) continue;

            let status: 'online' | 'offline' | 'lost' | 'power_down' | 'dying_gasp' | 'unknown' = 'unknown';
            const rawStatus = String(device.status || '').toLowerCase();

            if (rawStatus === 'online' || rawStatus === 'active' || rawStatus === '1') {
                status = 'online';
            } else if (device.lastDownReason) {
                const reason = device.lastDownReason.toLowerCase();
                if (reason.includes('power') || reason.includes('dying')) status = 'power_down';
                else if (reason.includes('loss') || reason.includes('los')) status = 'lost';
                else status = 'offline';
            } else {
                status = 'offline';
            }

            const rxPower = device.signal ? String(device.signal) : null;
            const defaultName = device.name || `ONT-${device.sn.substring(device.sn.length - 4)}`;

            valuesToUpsert.push({
                sn: device.sn,
                oltId: oltId,
                ponPort: device.ponId,
                onuIndex: device.onuId,
                name: defaultName,
                status: status,
                lastRxPower: rxPower,
                discoverySources: ['olt'],
                macAddress: device.macAddress,
                lastSeen: status === 'online' ? now : null, // Handled by COALESCE in upsert logic if needed
                lastDownReason: device.lastDownReason,
                updatedAt: now,
            });
        }

        // 4. BATCH UPSERT Operation
        if (valuesToUpsert.length > 0) {
            try {
                // Perform batch upsert using Drizzle's onConflictDoUpdate
                await db.insert(onus)
                    .values(valuesToUpsert)
                    .onConflictDoUpdate({
                        target: onus.sn,
                        set: {
                            oltId: sql`excluded.olt_id`,
                            ponPort: sql`excluded.pon_port`,
                            onuIndex: sql`excluded.onu_index`,
                            lastRxPower: sql`excluded.last_rx_power`,
                            status: sql`excluded.status`,
                            // Keep existing name if present, otherwise use OLT discovered name
                            name: sql`COALESCE(onus.name, excluded.name)`,
                            // Only update lastSeen if the new status is online
                            lastSeen: sql`CASE WHEN excluded.status = 'online' THEN excluded.updated_at ELSE onus.last_seen END`,
                            lastDownReason: sql`excluded.last_down_reason`,
                            macAddress: sql`COALESCE(onus.mac_address, excluded.mac_address)`,
                            updatedAt: sql`excluded.updated_at`,
                        }
                    });

                added = valuesToUpsert.length; // Approximate simplified report
                logger.info({ count: valuesToUpsert.length, olt: olt.name }, '✅ Batch Upserted ONUs');
            } catch (err: any) {
                logger.error({ err, olt: olt.name }, 'Batch upsert failed for OLT');
                throw err;
            }
        }

        logger.info({ olt: olt.name, added, updated }, 'ONU Sync Complete');
        return { added, updated, total: driverOnus.length };
    }

    async getAllOnusWithCoordinates(): Promise<any[]> {
        const { isNotNull, and, getTableColumns } = await import('drizzle-orm');
        const onusColumns = getTableColumns(onus);
        return db.select({
            ...onusColumns,
            id: onus.id,
            sn: onus.sn,
            status: onus.status,
            lastDownReason: onus.lastDownReason,
            lastRxPower: onus.lastRxPower,
            lastDown: onus.lastSeen,
            lastSeen: onus.lastSeen,
            oltId: onus.oltId, // Exposed for targeted updates
            routerId: olts.parentId,
            oltName: olts.name
        })
            .from(onus)
            .leftJoin(olts, eq(onus.oltId, olts.id))
            .where(and(
                isNotNull(onus.latitude),
                isNotNull(onus.longitude)
            ));
    }

    async updateOnu(id: string, data: Partial<Onu>): Promise<Onu | undefined> {
        const [updated] = await db
            .update(onus)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(onus.id, id))
            .returning();
        return updated;
    }
}

export const oltService = OltService.getInstance();

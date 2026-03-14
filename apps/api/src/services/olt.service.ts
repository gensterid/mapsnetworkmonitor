import { eq, desc, and, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { olts, type Olt, type NewOlt } from '../db/schema/olts.js';
import { onus, type Onu, devicePerformanceHistory } from '../db/schema/index.js';
import { snmpService } from './snmp.service.js';
import { encrypt, decrypt } from '../lib/encryption.js';
import { OltDriverFactory } from './olt-drivers/driver.factory.js';
import { logger } from '../lib/logger.js';
import { ApiError } from '../middleware/error.middleware.js';

export class OltService {
    private static instance: OltService;

    private constructor() { }

    public parseSignal(signal: any): number | null {
        if (signal === null || signal === undefined) return null;
        const str = String(signal);
        const match = str.match(/([+-]?\d+(\.\d+)?)/);
        return match ? parseFloat(match[1]) : null;
    }

    public static getInstance(): OltService {
        if (!OltService.instance) {
            OltService.instance = new OltService();
        }
        return OltService.instance;
    }

    async findAll(tenantId?: string, userId?: string, userRole?: string): Promise<Olt[]> {
        const filters = [];
        if (tenantId) {
            filters.push(eq(olts.tenantId, tenantId));
        }

        let query = db.select().from(olts).where(filters.length > 0 ? and(...filters) : undefined).orderBy(olts.name).$dynamic();

        // If user is not admin or superadmin, filter by assigned routers
        if (userId && userRole && userRole !== 'admin' && userRole !== 'superadmin') {
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

    async findById(id: string, tenantId?: string, userId?: string, userRole?: string): Promise<Olt | undefined> {
        const filters = [eq(olts.id, id)];
        if (tenantId) {
            filters.push(eq(olts.tenantId, tenantId));
        }
        const [olt] = await db.select().from(olts).where(and(...filters));
        if (!olt) return undefined;

        // Access Check
        if (userId && userRole && userRole !== 'admin' && userRole !== 'superadmin') {
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
    private async findByIdInternal(id: string, tenantId?: string): Promise<Olt | undefined> {
        const filters = [eq(olts.id, id)];
        if (tenantId) {
            filters.push(eq(olts.tenantId, tenantId));
        }
        const [olt] = await db.select().from(olts).where(and(...filters));
        return olt;
    }

    async create(data: NewOlt, tenantId: string): Promise<Olt> {
        const createData = { ...data, tenantId };
        if (createData.webPassword) {
            createData.webPassword = encrypt(createData.webPassword);
        }
        const [olt] = await db.insert(olts).values(createData).returning();
        return olt;
    }

    async update(id: string, data: Partial<NewOlt>, tenantId?: string): Promise<Olt | undefined> {
        const filters = [eq(olts.id, id)];
        if (tenantId) {
            filters.push(eq(olts.tenantId, tenantId));
        }

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
            .where(and(...filters))
            .returning();

        if (!olt) return undefined;
        return {
            ...olt,
            webPassword: olt.webPassword ? '********' : null
        };
    }

    async delete(id: string, tenantId?: string): Promise<boolean> {
        const filters = [eq(olts.id, id)];
        if (tenantId) {
            filters.push(eq(olts.tenantId, tenantId));
        }
        const result = await db.delete(olts).where(and(...filters)).returning();
        return result.length > 0;
    }

    /**
     * Refresh OLT status via SNMP
     */
    async refreshStatus(id: string, tenantId?: string): Promise<Olt | undefined> {
        const olt = await this.findByIdInternal(id, tenantId);
        if (!olt) return undefined;

        let isOnline = false;
        let uptime = olt.uptime || 0;
        let description = olt.description || '';
        let snmpStatus: 'online' | 'offline' | null = olt.useSnmp ? 'offline' : null;
        let webStatus: 'online' | 'offline' | null = olt.useWeb ? 'offline' : null;
        let activeProtocol: string | null = null;
        let statusReason: string | null = olt.statusReason;

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
                const webResult = await driver.testConnection();

                if (webResult.success) {
                    webStatus = 'online';
                    isOnline = true;
                    if (!activeProtocol) activeProtocol = 'web';
                    statusReason = null;

                    // Trigger ONU sync in background to update descriptors/signals
                    this.getOnus(id).catch(err => logger.error({ err, olt: olt.name }, 'Background ONU refresh failed'));
                } else {
                    webStatus = 'offline';
                    statusReason = webResult.error || 'Web API Unreachable';
                }
            } catch (error: any) {
                logger.error({ err: error, olt: olt.name }, 'Web check failed for OLT using driver');
                webStatus = 'offline';
                statusReason = error.message || 'Driver Execution Error';
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
                    statusReason: statusReason,
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
    async getOnusByRouter(routerId: string, tenantId?: string): Promise<Onu[]> {
        const filters = [eq(olts.parentId, routerId)];
        if (tenantId) {
            filters.push(eq(olts.tenantId, tenantId));
        }
        const oltList = await db.select({ id: olts.id }).from(olts).where(and(...filters));
        const oltIds = oltList.map(o => o.id);

        if (oltIds.length === 0) return [];

        const { inArray } = await import('drizzle-orm');
        return db.select().from(onus).where(inArray(onus.oltId, oltIds)).orderBy(onus.name);
    }
    async getOnus(id: string, tenantId?: string): Promise<any[]> {
        const olt = await this.findByIdInternal(id, tenantId);
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
            let driverOnus: any[] = [];
            try {
                driverOnus = await driver.getOnuList();
            } catch (driverErr) {
                logger.warn({ err: driverErr, oltId: id, type: olt.type }, 'OLT Driver failed to fetch ONU list, returning partial/cached data');
            }
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
                    try {
                        // Auto-insert missing ONU to provide ID
                        const insertQuery = db.insert(onus).values({
                            sn: device.sn,
                            oltId: id,
                            routerId: olt.parentId,
                            ponPort: device.ponId,
                            onuIndex: device.onuId,
                            macAddress: device.macAddress,
                            name: device.name || `ONT-${device.sn.substring(device.sn.length - 4)}`,
                            description: device.description,
                            status: status as any,
                            lastRxPower: device.signal ? String(device.signal) : null,
                            discoverySources: ['olt'],
                            lastSeen: status === 'online' ? new Date() : null,
                            lastDownReason: device.lastDownReason,
                        } as any)
                            .onConflictDoUpdate({
                                target: onus.sn,
                                set: {
                                    oltId: id,
                                    routerId: olt.parentId,
                                    ponPort: device.ponId,
                                    onuIndex: device.onuId,
                                    description: device.description || sql`onus.description`,
                                    status: status as any,
                                    lastRxPower: device.signal ? String(device.signal) : sql`onus.last_rx_power`,
                                    lastDownReason: device.lastDownReason || sql`onus.last_down_reason`,
                                    macAddress: device.macAddress || sql`onus.mac_address`,
                                    updatedAt: new Date(),
                                } as any
                            });

                        const [inserted] = await insertQuery.returning();
                        dbOnu = inserted;
                        // Map update fix to prevent subsequent duplicates in the same loop
                        dbOnuMap.set(device.sn, dbOnu);
                    } catch (insertErr: any) {
                        logger.error({
                            err: insertErr,
                            sn: device.sn,
                            msg: 'HARD DB INSERT FAILURE'
                        }, 'Failed to UPSERT ONU. Drizzle syntax flaw?');
                        throw insertErr;
                    }
                } else {
                    // [SYNC FIX] Update existing ONU status/power/reason whenever we fetch live data
                    // This ensures the Map (which reads from DB) stays in sync with the List (which reads from OLT)
                    try {
                        const updateData: any = {
                            status: status as any,
                            lastRxPower: device.signal ? String(device.signal) : dbOnu.lastRxPower,
                            lastDownReason: device.lastDownReason || dbOnu.lastDownReason,
                            macAddress: device.macAddress || dbOnu.macAddress,
                            description: device.description || (dbOnu as any).description,
                            updatedAt: new Date(),
                        };

                        if (status === 'online') {
                            updateData.lastSeen = new Date();
                        }

                        // Run update in background to not slow down the read request too much
                        db.update(onus)
                            .set({
                                ...updateData,
                                routerId: olt.parentId || dbOnu.routerId
                            })
                            .where(eq(onus.id, dbOnu.id))
                            .execute()
                            .then(async () => {
                                // 📈 Log to Performance History for Charts
                                if (device.signal && dbOnu) {
                                    const parsedSignal = this.parseSignal(device.signal);
                                    if (parsedSignal !== null) {
                                        await db.insert(devicePerformanceHistory).values({
                                            tenantId: olt.tenantId || '',
                                            routerId: olt.parentId || '',
                                            onuId: dbOnu.id,
                                            signal: parsedSignal,
                                            recordedAt: new Date()
                                        }).execute();
                                    }
                                }
                            })
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
                    description: (dbOnu as any).description,
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
    async syncOnuInventory(oltId: string, tenantId?: string): Promise<{ added: number; updated: number; total: number }> {
        const olt = await this.findByIdInternal(oltId, tenantId);
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
        const { onus, onusStatusEnum } = await import('../db/schema/onus.js');
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
                routerId: olt.parentId,
                ponPort: device.ponId,
                onuIndex: device.onuId,
                name: defaultName,
                description: device.description,
                host: device.host, // Include host IP if provided by driver
                status: status,
                tenantId: tenantId,
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
                    .values(valuesToUpsert as any)
                    .onConflictDoUpdate({
                        target: onus.sn,
                        set: {
                            oltId: sql`excluded.olt_id`,
                            routerId: sql`COALESCE(excluded.router_id, onus.router_id)`,
                            ponPort: sql`excluded.pon_port`,
                            onuIndex: sql`excluded.onu_index`,
                            description: sql`COALESCE(onus.description, excluded.description)`,
                            host: sql`COALESCE(onus.host, excluded.host)`, // Save host if not already set
                            lastRxPower: sql`excluded.last_rx_power`,
                            status: sql`excluded.status`,
                            // Keep existing name if present, otherwise use OLT discovered name
                            name: sql`COALESCE(onus.name, excluded.name)`,
                            // Only update lastSeen if the new status is online
                            lastSeen: sql`CASE WHEN excluded.status = 'online' THEN excluded.updated_at ELSE onus.last_seen END`,
                            lastDownReason: sql`excluded.last_down_reason`,
                            macAddress: sql`COALESCE(onus.mac_address, excluded.mac_address)`,
                            tenantId: sql`COALESCE(onus.tenant_id, excluded.tenant_id)`,
                            updatedAt: sql`excluded.updated_at`,
                        } as any
                    });

                // 📈 Log to Performance History for Charts
                const syncedOnus = await db.select({ id: onus.id, sn: onus.sn })
                    .from(onus)
                    .where(eq(onus.oltId, oltId));

                const snToIdMap = new Map(syncedOnus.map(o => [o.sn, o.id]));
                const historyValues = valuesToUpsert
                    .filter(v => v.lastRxPower !== null)
                    .map(v => {
                        const parsedSignal = this.parseSignal(v.lastRxPower);
                        if (parsedSignal === null) return null;
                        const onuId = snToIdMap.get(v.sn);
                        if (!onuId) return null;
                        return {
                            tenantId: tenantId || '',
                            routerId: olt.parentId || '',
                            onuId: onuId,
                            signal: parsedSignal,
                            recordedAt: now
                        };
                    })
                    .filter((v): v is NonNullable<typeof v> => v !== null);

                if (historyValues.length > 0) {
                    await db.insert(devicePerformanceHistory).values(historyValues as any).execute();
                }

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

    async getAllOnusWithCoordinates(tenantId?: string, userId?: string, userRole?: string): Promise<any[]> {
        const { isNotNull, and, eq, getTableColumns } = await import('drizzle-orm');
        const onusColumns = getTableColumns(onus);
        const filters = [
            isNotNull(onus.latitude),
            isNotNull(onus.longitude)
        ];
        if (tenantId) {
            filters.push(eq(onus.tenantId, tenantId));
        }

        // Filter by assigned routers if not admin
        if (userId && userRole && userRole !== 'admin' && userRole !== 'superadmin') {
            const { userRouters } = await import('../db/schema/user-routers.js');
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));

            const routerIds = assigned.map((a) => a.routerId);
            if (routerIds.length === 0) return [];

            const { inArray } = await import('drizzle-orm');
            filters.push(inArray(onus.routerId, routerIds));
        }

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
            .where(and(...filters));
    }

    async updateOnu(id: string, data: Partial<Onu>, tenantId?: string, userId?: string, userRole?: string): Promise<Onu | undefined> {
        const filters = [eq(onus.id, id)];
        if (tenantId) {
            filters.push(eq(onus.tenantId, tenantId));
        }

        // Access Check for non-admins
        if (userId && userRole && userRole !== 'admin' && userRole !== 'superadmin') {
            const [onu] = await db.select().from(onus).where(and(...filters));
            if (!onu || !onu.routerId) return undefined;

            const { userRouters } = await import('../db/schema/user-routers.js');
            const [assignment] = await db
                .select()
                .from(userRouters)
                .where(and(
                    eq(userRouters.userId, userId),
                    eq(userRouters.routerId, onu.routerId)
                ));

            if (!assignment) {
                return undefined;
            }
        }

        const [updated] = await db
            .update(onus)
            .set({ ...data, updatedAt: new Date() })
            .where(and(...filters))
            .returning();
        return updated;
    }

    async rebootOnu(oltId: string, ponId: string, onuId: string, tenantId?: string): Promise<boolean> {
        const olt = await this.findByIdInternal(oltId, tenantId);
        if (!olt) throw new Error('OLT not found');

        try {
            const decryptedPassword = olt.webPassword ? decrypt(olt.webPassword) : undefined;
            const driver = OltDriverFactory.getDriver(
                olt.type || 'generic',
                olt.host,
                olt.webPort || undefined,
                olt.webUsername || undefined,
                decryptedPassword,
                olt.webProtocol || undefined
            );

            await driver.connect();
            const success = await driver.rebootOnu(ponId, onuId);
            await driver.disconnect();
            
            return success;
        } catch (error) {
            logger.error({ err: error, oltId, ponId, onuId }, 'Failed to reboot ONU via service');
            return false;
        }
    }
}

export const oltService = OltService.getInstance();

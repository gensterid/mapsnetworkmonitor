import { db } from '../db/index.js';
import { olts, onus, devicePerformanceHistory } from '../db/schema/index.js';
import { eq, and, sql, inArray, isNotNull } from 'drizzle-orm';
import { ApiError } from '../middleware/error.middleware.js';
import { logger } from '../lib/logger.js';
import { decrypt } from '../lib/encryption.js';
import type { Onu } from '../db/schema/onus.js';

export class OltService {
    private static instance: OltService;

    private constructor() {}

    public static getInstance(): OltService {
        if (!OltService.instance) {
            OltService.instance = new OltService();
        }
        return OltService.instance;
    }

    private async findByIdInternal(id: string, tenantId?: string) {
        const filters = [eq(olts.id, id)];
        if (tenantId) filters.push(eq(olts.tenantId, tenantId));
        const [olt] = await db.select().from(olts).where(and(...filters));
        return olt;
    }

    /**
     * Parse signal string (e.g. "-19.5 dBm") to number
     */
    public parseSignal(signalStr: string | null): number | null {
        if (!signalStr) return null;
        const cleaned = signalStr.replace(/[^\d.-]/g, '');
        const val = parseFloat(cleaned);
        return isNaN(val) ? null : val;
    }

    async findAll(tenantId?: string, userId?: string, userRole?: string): Promise<any[]> {
        const filters = [];
        if (tenantId) filters.push(eq(olts.tenantId, tenantId));

        // If user is not admin, filter by assigned routers
        if (userId && userRole && userRole !== 'admin' && userRole !== 'superadmin') {
            const { userRouters } = await import('../db/schema/user-routers.js');
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));

            const routerIds = assigned.map((a) => a.routerId);
            if (routerIds.length === 0) return [];
            filters.push(inArray(olts.parentId, routerIds));
        }

        return db.select().from(olts).where(and(...filters)).orderBy(olts.name);
    }

    async findById(id: string, tenantId?: string, userId?: string, userRole?: string): Promise<any> {
        const olt = await this.findByIdInternal(id, tenantId);
        if (!olt) return null;

        // RBAC check
        if (userId && userRole && userRole !== 'admin' && userRole !== 'superadmin') {
            if (!olt.parentId) return null; // No parent router assigned? deny.
            const { userRouters } = await import('../db/schema/user-routers.js');
            const [assignment] = await db
                .select()
                .from(userRouters)
                .where(and(eq(userRouters.userId, userId), eq(userRouters.routerId, olt.parentId)));
            if (!assignment) return null;
        }

        return olt;
    }

    async create(data: any, tenantId: string): Promise<any> {
        const [inserted] = await db.insert(olts).values({ ...data, tenantId }).returning();
        return inserted;
    }

    async update(id: string, data: any, tenantId?: string): Promise<any> {
        const filters = [eq(olts.id, id)];
        if (tenantId) filters.push(eq(olts.tenantId, tenantId));
        const [updated] = await db.update(olts).set({ ...data, updatedAt: new Date() }).where(and(...filters)).returning();
        return updated;
    }

    async delete(id: string, tenantId?: string): Promise<boolean> {
        const filters = [eq(olts.id, id)];
        if (tenantId) filters.push(eq(olts.tenantId, tenantId));
        const result = await db.delete(olts).where(and(...filters)).returning();
        return result.length > 0;
    }

    async getOnus(id: string, tenantId?: string): Promise<any[]> {
        const olt = await this.findByIdInternal(id, tenantId);
        if (!olt) throw new Error('OLT not found');

        if (!olt.useWeb) {
            logger.info({ olt: olt.name }, 'Web API access is disabled');
            return [];
        }

        try {
            const { OltDriverFactory } = await import('./olt-drivers/driver.factory.js');
            let decryptedPassword;
            try {
                decryptedPassword = olt.webPassword ? decrypt(olt.webPassword) : undefined;
            } catch (decryptError) {
                logger.error({ err: decryptError, oltId: id }, 'Decrypt failed');
                throw new ApiError(401, 'Please re-enter OLT password');
            }

            const driver = OltDriverFactory.getDriver(
                olt.type || 'generic',
                olt.host,
                olt.webPort || undefined,
                olt.webUsername || undefined,
                decryptedPassword,
                olt.webProtocol || undefined
            );

            let driverOnus: any[] = [];
            try {
                await driver.connect();
                driverOnus = await driver.getOnuList();
                await driver.disconnect();
            } catch (driverErr) {
                logger.warn({ err: driverErr, oltId: id }, 'Driver connection or fetch failed - falling back to DB inventory');
            }

            const results: any[] = [];
            const dbOnus = await db.select().from(onus).where(eq(onus.oltId, id));
            
            // If driver failed but we have DB data, we should at least show that
            if (driverOnus.length === 0 && dbOnus.length > 0) {
                return dbOnus.map(o => ({
                    ...o,
                    id: o.id,
                    sn: o.sn,
                    status: o.status,
                    name: o.name,
                    signal: o.lastRxPower,
                    lastDownReason: o.lastDownReason,
                    lastSeen: o.lastSeen,
                    ponId: o.ponPort,
                    onuId: o.onuIndex
                }));
            }

            const dbOnuMap = new Map(dbOnus.map(o => [o.sn, o]));

            await db.transaction(async (tx) => {
                for (const device of driverOnus) {
                    if (!device.sn) {
                        results.push(device);
                        continue;
                    }

                    let dbOnu = dbOnuMap.get(device.sn);
                    let status = 'unknown';
                    const rawStatus = String(device.status || '').toLowerCase();
                    if (rawStatus === 'online' || rawStatus === 'active' || rawStatus === '1') status = 'online';
                    else if (device.lastDownReason?.toLowerCase()?.includes('power')) status = 'power_down';
                    else status = 'offline';

                    if (!dbOnu) {
                        try {
                            const [inserted] = await tx.insert(onus).values({
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
                            } as any).onConflictDoUpdate({
                                target: onus.sn,
                                set: {
                                    status: status as any,
                                    lastRxPower: device.signal ? String(device.signal) : sql`onus.last_rx_power`,
                                    updatedAt: new Date(),
                                } as any
                            }).returning();
                            dbOnu = inserted;
                            dbOnuMap.set(device.sn, dbOnu);
                        } catch (err) {
                            logger.error({ err, sn: device.sn }, 'Upsert failed');
                            throw err;
                        }
                    } else {
                        try {
                            const updateData: any = {
                                status: status as any,
                                lastRxPower: device.signal ? String(device.signal) : dbOnu.lastRxPower,
                                lastDownReason: device.lastDownReason || dbOnu.lastDownReason,
                                macAddress: device.macAddress || dbOnu.macAddress,
                                updatedAt: new Date(),
                            };
                            if (status === 'online') updateData.lastSeen = new Date();

                            await tx.update(onus).set(updateData).where(eq(onus.id, dbOnu.id));

                            dbOnu.status = updateData.status;
                        } catch (e) {}
                    }

                    results.push({
                        ...device,
                        id: dbOnu!.id,
                        status: dbOnu!.status,
                        latitude: dbOnu!.latitude,
                        longitude: dbOnu!.longitude,
                        description: (dbOnu as any).description,
                        name: dbOnu!.name || device.name,
                        lastRxPower: device.signal || dbOnu!.lastRxPower,
                        lastDown: dbOnu!.lastSeen,
                        macAddress: dbOnu!.macAddress,
                        lastDownReason: dbOnu!.lastDownReason || device.lastDownReason,
                    });
                }
            });

            // 3. Log history OUTSIDE of the main inventory transaction
            // This prevents a DB error in the history hypertable from rolling back the whole OLT sync
            for (const device of driverOnus) {
                if (!device.sn || !device.signal) continue;
                const dbOnu = dbOnuMap.get(device.sn);
                if (!dbOnu) continue;

                const parsedSignal = this.parseSignal(device.signal);
                if (parsedSignal !== null) {
                    try {
                        await db.insert(devicePerformanceHistory).values({
                            tenantId: olt.tenantId || '',
                            routerId: olt.parentId || '',
                            onuId: dbOnu.id,
                            signal: parsedSignal,
                            recordedAt: new Date()
                        });
                    } catch (historyErr) {
                        logger.warn({ err: historyErr, onuId: dbOnu.id }, 'Failed to log ONU signal history (ignoring)');
                    }
                }
            }

            return results;
        } catch (error) {
            logger.error({ err: error, olt: olt.name }, 'Failed to get ONUs');
            throw error;
        }
    }

    async refreshStatus(id: string, tenantId?: string): Promise<any> {
        const olt = await this.findByIdInternal(id, tenantId);
        if (!olt) return null;

        try {
            const { OltDriverFactory } = await import('./olt-drivers/driver.factory.js');
            let decryptedPassword;
            try {
                decryptedPassword = olt.webPassword ? decrypt(olt.webPassword) : undefined;
            } catch (e) {}

            const driver = OltDriverFactory.getDriver(
                olt.type || 'generic',
                olt.host,
                olt.webPort || undefined,
                olt.webUsername || undefined,
                decryptedPassword,
                olt.webProtocol || undefined
            );

            await driver.connect();
            // If connection succeeds, we consider it online
            await db.update(olts).set({ 
                status: 'online', 
                updatedAt: new Date() 
            }).where(eq(olts.id, id));
            await driver.disconnect();
            
            return { ...olt, status: 'online' };
        } catch (error) {
            logger.error({ err: error, olt: olt.name }, 'Refresh OLT status failed');
            await db.update(olts).set({ 
                status: 'offline',
                updatedAt: new Date() 
            }).where(eq(olts.id, id));
            return { ...olt, status: 'offline' };
        }
    }

    async syncOnuInventory(oltId: string, tenantId?: string): Promise<{ added: number; updated: number; total: number }> {
        const olt = await this.findByIdInternal(oltId, tenantId);
        if (!olt) throw new Error('OLT not found');

        let driverOnus: any[] = [];
        try {
            driverOnus = await this.getOnus(oltId);
        } catch (e: any) {
            logger.error({ err: e, olt: olt.name }, 'Sync failed');
            throw e;
        }

        if (!driverOnus || driverOnus.length === 0) return { added: 0, updated: 0, total: 0 };

        let added = 0;
        const valuesToUpsert: any[] = [];
        const now = new Date();

        for (const device of driverOnus) {
            if (!device.sn) continue;
            let status: any = 'unknown';
            const rawStatus = String(device.status || '').toLowerCase();
            if (rawStatus === 'online' || rawStatus === 'active' || rawStatus === '1') status = 'online';
            else if (device.lastDownReason) {
                const reason = device.lastDownReason.toLowerCase();
                if (reason.includes('power')) status = 'power_down';
                else if (reason.includes('loss')) status = 'lost';
                else status = 'offline';
            } else status = 'offline';

            valuesToUpsert.push({
                sn: device.sn,
                oltId: oltId,
                routerId: olt.parentId,
                ponPort: device.ponId,
                onuIndex: device.onuId,
                name: device.name || `ONT-${device.sn.substring(device.sn.length - 4)}`,
                status: status,
                tenantId: tenantId,
                lastRxPower: device.signal ? String(device.signal) : null,
                discoverySources: ['olt'],
                macAddress: device.macAddress,
                lastSeen: status === 'online' ? now : null,
                lastDownReason: device.lastDownReason,
                updatedAt: now,
            });
        }

        if (valuesToUpsert.length > 0) {
            let historyValues: any[] = [];
            await db.transaction(async (tx) => {
                await tx.insert(onus).values(valuesToUpsert as any).onConflictDoUpdate({
                    target: onus.sn,
                    set: {
                        status: sql`excluded.status`,
                        lastRxPower: sql`excluded.last_rx_power`,
                        lastSeen: sql`CASE WHEN excluded.status = 'online' THEN excluded.updated_at ELSE onus.last_seen END`,
                        lastDownReason: sql`excluded.last_down_reason`,
                        updatedAt: sql`excluded.updated_at`,
                    } as any
                });

                const syncedOnus = await tx.select({ id: onus.id, sn: onus.sn }).from(onus).where(eq(onus.oltId, oltId));
                const snToIdMap = new Map(syncedOnus.map(o => [o.sn, o.id]));
                historyValues = valuesToUpsert.filter(v => v.lastRxPower !== null).map(v => {
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
                }).filter((v): v is any => v !== null);
            });

            // 3. Log bulk history OUTSIDE of transaction
            if (historyValues.length > 0) {
                try {
                    await db.insert(devicePerformanceHistory).values(historyValues).execute();
                } catch (historyErr) {
                    logger.warn({ err: historyErr, oltId }, 'Failed to bulk log ONU history (ignoring)');
                }
            }

            added = valuesToUpsert.length;
        }

        return { added, updated: 0, total: driverOnus.length };
    }

    async getAllOnusWithCoordinates(tenantId?: string, userId?: string, userRole?: string): Promise<any[]> {
        const { getTableColumns } = await import('drizzle-orm');
        const onusColumns = getTableColumns(onus);
        const filters = [isNotNull(onus.latitude), isNotNull(onus.longitude)];
        if (tenantId) filters.push(eq(onus.tenantId, tenantId));

        if (userId && userRole && userRole !== 'admin' && userRole !== 'superadmin') {
            const { userRouters } = await import('../db/schema/user-routers.js');
            const assigned = await db.select({ routerId: userRouters.routerId }).from(userRouters).where(eq(userRouters.userId, userId));
            const routerIds = assigned.map(a => a.routerId);
            if (routerIds.length === 0) return [];
            filters.push(inArray(onus.routerId, routerIds));
        }

        return db.select({
            ...onusColumns,
            oltId: onus.oltId,
            routerId: olts.parentId,
            oltName: olts.name
        }).from(onus).leftJoin(olts, eq(onus.oltId, olts.id)).where(and(...filters));
    }

    async updateOnu(id: string, data: Partial<Onu>, tenantId?: string, userId?: string, userRole?: string): Promise<Onu | undefined> {
        const filters = [eq(onus.id, id)];
        if (tenantId) filters.push(eq(onus.tenantId, tenantId));

        if (userId && userRole && userRole !== 'admin' && userRole !== 'superadmin') {
            const [onu] = await db.select().from(onus).where(and(...filters));
            if (!onu || !onu.routerId) return undefined;
            const { userRouters } = await import('../db/schema/user-routers.js');
            const [assignment] = await db.select().from(userRouters).where(and(eq(userRouters.userId, userId), eq(userRouters.routerId, onu.routerId)));
            if (!assignment) return undefined;
        }

        const [updated] = await db.update(onus).set({ ...data, updatedAt: new Date() }).where(and(...filters)).returning();
        return updated;
    }

    async rebootOnu(oltId: string, ponId: string, onuId: string, tenantId?: string): Promise<boolean> {
        const olt = await this.findByIdInternal(oltId, tenantId);
        if (!olt) throw new Error('OLT not found');

        try {
            const { OltDriverFactory } = await import('./olt-drivers/driver.factory.js');
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
            logger.error({ err: error, oltId, ponId, onuId }, 'Failed to reboot ONU');
            return false;
        }
    }

    async getOnusByRouter(routerId: string, tenantId?: string): Promise<Onu[]> {
        const filters = [eq(onus.routerId, routerId)];
        if (tenantId) filters.push(eq(onus.tenantId, tenantId));
        return db.select().from(onus).where(and(...filters));
    }
}

export const oltService = OltService.getInstance();

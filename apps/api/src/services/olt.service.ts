import { eq, desc, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { olts, type Olt, type NewOlt } from '../db/schema/olts.js';
import { snmpService } from './snmp.service.js';
import { encrypt, decrypt } from '../lib/encryption.js';
import { OltDriverFactory } from './olt-drivers/driver.factory.js';

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
        const olt = await this.findById(id);
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
                console.error(`Web check failed for OLT ${olt.name} using driver:`, error);
                webStatus = 'offline';
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
            console.error(`Failed to update OLT ${olt.name} status:`, error);
            return olt;
        }
    }
    async getOnus(id: string): Promise<any[]> {
        const olt = await this.findByIdInternal(id);
        if (!olt) throw new Error('OLT not found');

        // Determine credentials (use Web/API credentials for Telnet/SSH if not specified otherwise, 
        // or we might need separate Telnet credentials in DB? 
        // For now, assuming Web credentials are used for Remote Management too, or we fall back to defaults.)
        // Actually, the OLT schema has webUsername/webPassword. 
        // We might want to use those.

        try {
            // Import dynamically or use factory
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
            const onus = await driver.getOnuList();
            await driver.disconnect();

            return onus;
        } catch (error) {
            console.error(`Failed to get ONUs for OLT ${olt.name}:`, error);
            throw error;
        }
    }
}

export const oltService = OltService.getInstance();

import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { olts, type Olt, type NewOlt } from '../db/schema/olts.js';
import { snmpService } from './snmp.service.js';
import { encrypt, decrypt } from '../lib/encryption.js';

export class OltService {
    private static instance: OltService;

    private constructor() { }

    public static getInstance(): OltService {
        if (!OltService.instance) {
            OltService.instance = new OltService();
        }
        return OltService.instance;
    }

    async findAll(): Promise<Olt[]> {
        return db.select().from(olts).orderBy(olts.name);
    }

    async findById(id: string): Promise<Olt | undefined> {
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
        if (updateData.webPassword) {
            updateData.webPassword = encrypt(updateData.webPassword);
        }
        const [olt] = await db
            .update(olts)
            .set(updateData)
            .where(eq(olts.id, id))
            .returning();
        return olt;
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
                    isOnline = true;
                    activeProtocol = 'snmp';
                    for (const res of results) {
                        if (res.oid === '1.3.6.1.2.1.1.3.0') {
                            uptime = Math.floor(Number(res.value) / 100);
                        } else if (res.oid === '1.3.6.1.2.1.1.1.0') {
                            description = String(res.value);
                        }
                    }
                }
            } catch (error) {
                // console.error(`SNMP failed for OLT ${olt.name}:`, error);
                // Continue to check Web if enabled
            }
        }

        // 2. Check Web (if SNMP checks failed or was disabled)
        // If isOnline is already true, we skip Web check to save resources, 
        // unless you specifically want to verify both. For status monitoring, one success is enough.
        if (olt.useWeb && !isOnline) {
            try {
                const protocol = olt.webProtocol || 'http';
                const url = `${protocol}://${olt.host}:${olt.webPort}`;

                // Decrypt password if it exists
                const password = olt.webPassword ? decrypt(olt.webPassword) : undefined;

                // Construct headers with Basic Auth if credentials exist
                const headers: any = {};
                if (olt.webUsername && password) {
                    const auth = Buffer.from(`${olt.webUsername}:${password}`).toString('base64');
                    headers['Authorization'] = `Basic ${auth}`;
                }

                // Basic connectivity check using fetch (requires Node 18+)
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

                const response = await fetch(url, {
                    method: 'HEAD',
                    headers,
                    signal: controller.signal
                }).catch(async () => {
                    // Fallback to GET if HEAD fails
                    return await fetch(url, {
                        method: 'GET',
                        headers,
                        signal: controller.signal
                    });
                });

                clearTimeout(timeoutId);

                if (response && (response.ok || response.status === 401 || response.status === 403)) {
                    isOnline = true;
                    activeProtocol = 'web';
                    // We can't easily get uptime/description from a generic HTTP check without scraping
                }
            } catch (error) {
                // console.error(`Web check failed for OLT ${olt.name}:`, error);
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
        const olt = await this.findById(id);
        if (!olt) throw new Error('OLT not found');

        // Determine credentials (use Web/API credentials for Telnet/SSH if not specified otherwise, 
        // or we might need separate Telnet credentials in DB? 
        // For now, assuming Web credentials are used for Remote Management too, or we fall back to defaults.)
        // Actually, the OLT schema has webUsername/webPassword. 
        // We might want to use those.

        try {
            // Import dynamically or use factory
            const { OltDriverFactory } = await import('./olt-drivers/driver.factory.js');

            const driver = OltDriverFactory.getDriver(
                olt.type || 'generic',
                olt.host,
                undefined, // Use default port
                olt.webUsername || undefined,
                olt.webPassword || undefined
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

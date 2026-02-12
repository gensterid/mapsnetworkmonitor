import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { olts, type Olt, type NewOlt } from '../db/schema/olts.js';
import { snmpService } from './snmp.service.js';

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
        const [olt] = await db.insert(olts).values(data).returning();
        return olt;
    }

    async update(id: string, data: Partial<NewOlt>): Promise<Olt | undefined> {
        const [olt] = await db
            .update(olts)
            .set({ ...data, updatedAt: new Date() })
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

        try {
            const config = {
                host: olt.host,
                port: olt.snmpPort,
                community: olt.snmpCommunity
            };

            // Fetch generic OIDs
            // sysUpTime: 1.3.6.1.2.1.1.3.0
            // sysDescr: 1.3.6.1.2.1.1.1.0
            // sysName: 1.3.6.1.2.1.1.5.0

            const oids = [
                '1.3.6.1.2.1.1.3.0',
                '1.3.6.1.2.1.1.1.0',
                '1.3.6.1.2.1.1.5.0'
            ];

            const results = await snmpService.getMultiple(config, oids);

            let uptime = 0;
            let description = '';
            let sysName = '';

            for (const res of results) {
                if (res.oid === '1.3.6.1.2.1.1.3.0') {
                    // TimeTicks (1/100th of a second)
                    uptime = Math.floor(Number(res.value) / 100);
                } else if (res.oid === '1.3.6.1.2.1.1.1.0') {
                    description = String(res.value);
                } else if (res.oid === '1.3.6.1.2.1.1.5.0') {
                    sysName = String(res.value);
                }
            }

            // Update DB
            // If sysName is different and valid, maybe update name? 
            // Better to keep user defined name, or update generic description.

            const [updatedOlt] = await db
                .update(olts)
                .set({
                    uptime,
                    description,
                    status: 'online',
                    updatedAt: new Date()
                })
                .where(eq(olts.id, id))
                .returning();

            return updatedOlt;

        } catch (error) {
            console.error(`Failed to refresh OLT ${olt.name}:`, error);

            const [updatedOlt] = await db
                .update(olts)
                .set({
                    status: 'offline',
                    updatedAt: new Date()
                })
                .where(eq(olts.id, id))
                .returning();

            return updatedOlt;
        }
    }
}

export const oltService = OltService.getInstance();

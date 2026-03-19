import { db } from '../../db/index.js';
import { sql } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

/**
 * Service to manage PostgreSQL declarative partitions
 */
export class PartitionService {
    private managedTables = [
        'router_metrics',
        'router_interface_metrics',
        'device_performance_history'
    ];

    /**
     * Ensure partitions exist for the current and next month
     */
    async ensurePartitionsExist(): Promise<void> {
        try {
            const now = new Date();
            const months = [
                this.getYearMonth(now), // Current month
                this.getYearMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1)) // Next month
            ];

            for (const table of this.managedTables) {
                for (const ym of months) {
                    await this.createMonthlyPartition(table, ym.year, ym.month);
                }
            }
        } catch (error) {
            logger.error({ err: error }, 'Failed to ensure database partitions exist');
        }
    }

    /**
     * Create a monthly partition for a table if it doesn't already exist
     */
    private async createMonthlyPartition(baseTable: string, year: number, month: number): Promise<void> {
        const partitionName = `${baseTable}_y${year}_m${month.toString().padStart(2, '0')}`;
        
        // Start and end of the month
        const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        const endDate = `${nextYear}-${nextMonth.toString().padStart(2, '0')}-01`;

        try {
            // Check if partition already exists in pg_class
            const checkResult = await db.execute(sql`
                SELECT 1 FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relname = ${partitionName}
                AND n.nspname = 'public'
            `);

            if (checkResult.length === 0) {
                logger.info({ partitionName, startDate, endDate }, `Creating new partition for ${baseTable}`);
                
                // Construct and execute CREATE TABLE ... PARTITION OF
                // We use sql.raw for table names/partition names because bind parameters don't work for identifiers
                await db.execute(sql.raw(`
                    CREATE TABLE IF NOT EXISTS "${partitionName}" 
                    PARTITION OF "${baseTable}"
                    FOR VALUES FROM ('${startDate}') TO ('${endDate}')
                `));
                
                logger.info({ partitionName }, `Successfully created partition`);
            }
        } catch (error) {
            // Log warning but don't crash, might be race condition with another instance
            logger.warn({ err: error, partitionName }, `Warning while ensuring partition exists`);
        }
    }

    private getYearMonth(date: Date): { year: number; month: number } {
        return {
            year: date.getFullYear(),
            month: date.getMonth() + 1
        };
    }
}

export const partitionService = new PartitionService();

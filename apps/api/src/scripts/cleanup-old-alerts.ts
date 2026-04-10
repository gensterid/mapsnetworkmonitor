import { eq, and, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { alerts } from '../db/schema/index.js';
import { logger } from '../lib/logger.js';

async function cleanupOldAlerts() {
    console.log('🚀 Starting Alert Database Cleanup...');
    
    // Calculate 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    try {
        // 1. Count how many we are about to delete
        const toDeleteCount = await db
            .select()
            .from(alerts)
            .where(
                and(
                    eq(alerts.resolved, true),
                    lt(alerts.createdAt, thirtyDaysAgo)
                )
            );
            
        console.log(`🔍 Found ${toDeleteCount.length} resolved alerts older than 30 days.`);
        
        if (toDeleteCount.length === 0) {
            console.log('✅ No alerts to clean up.');
            process.exit(0);
        }

        // 2. Perform deletion in batches if possible, or direct if manageable
        // For simplicity and safety in this script, we'll do it in one go (SQL will handle it)
        const result = await db
            .delete(alerts)
            .where(
                and(
                    eq(alerts.resolved, true),
                    lt(alerts.createdAt, thirtyDaysAgo)
                )
            );
            
        console.log(`✅ Successfully deleted old alerts.`);
        
        // 3. Final summary
        const remainingCount = await db.select().from(alerts);
        console.log(`📊 Remaining total alerts in DB: ${remainingCount.length}`);
        
    } catch (err: any) {
        console.error('❌ Cleanup failed:', err.message);
        process.exit(1);
    }
    
    console.log('🎉 Cleanup process finished.');
    process.exit(0);
}

// Run the script
cleanupOldAlerts().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

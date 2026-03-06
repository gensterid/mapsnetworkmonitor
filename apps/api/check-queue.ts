import { routerSyncQueue } from './src/services/queue.service.js';

async function checkQueue() {
    try {
        const counts = await routerSyncQueue.getJobCounts('wait', 'active', 'completed', 'failed', 'delayed', 'paused');
        console.log('Queue Status:', JSON.stringify(counts, null, 2));

        const activeJobs = await routerSyncQueue.getJobs(['active']);
        console.log(`Active jobs: ${activeJobs.length}`);
        if (activeJobs.length > 0) {
            console.log('Sample active job data (first 5):');
            activeJobs.slice(0, 5).forEach(job => {
                console.log(`- ID: ${job.id}, Router: ${job.data.routerId}, Processing since: ${new Date(job.processedOn || 0).toISOString()}`);
            });
        }

        const failedJobs = await routerSyncQueue.getJobs(['failed']);
        console.log(`Failed jobs: ${failedJobs.length}`);
        if (failedJobs.length > 0) {
            console.log('Sample failed reasons (last 5):');
            failedJobs.slice(-5).forEach(job => {
                console.log(`- ID: ${job.id}, Router: ${job.data.routerId}, Error: ${job.failedReason}`);
            });
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

checkQueue();

import { runMigrations } from './src/db/migrate.js';

console.log('🚀 Starting manual migration trigger...');
runMigrations()
    .then(() => {
        console.log('✅ Manual migration trigger finished.');
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Manual migration trigger failed:', err);
        process.exit(1);
    });

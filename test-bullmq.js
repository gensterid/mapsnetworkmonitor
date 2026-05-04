const { Queue } = require('bullmq');
const Redis = require('ioredis');

// Connect to a non-existent port to simulate ECONNREFUSED
const connection = new Redis('redis://127.0.0.1:6399', {
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
});

connection.on('error', (err) => {
    console.log('Redis Connection Error emitted:', err.message);
});

// Create queue WITHOUT error listener
const q = new Queue('test', { connection });

// Let's see if Node process crashes after a few seconds
setTimeout(() => {
    console.log('Survived 3 seconds!');
    process.exit(0);
}, 3000);

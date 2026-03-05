
import 'dotenv/config';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
console.log('Connecting to Redis at:', redisUrl);

const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1, // Fail fast for testing
});

redis.on('connect', () => {
    console.log('✅ Redis connected successfully');
    process.exit(0);
});

redis.on('error', (err) => {
    console.error('❌ Redis connection error:', err.message);
    process.exit(1);
});

setTimeout(() => {
    console.error('❌ Redis connection timeout (10s)');
    process.exit(1);
}, 10000);

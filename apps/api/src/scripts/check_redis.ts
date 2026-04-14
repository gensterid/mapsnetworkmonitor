import Redis from 'ioredis';

const redis = new Redis('redis://127.0.0.1:6379');

async function checkRedis() {
    try {
        console.log("Pinging Redis...");
        const pong = await redis.ping();
        console.log("Ping response:", pong);

        console.log("Attempting a write operation...");
        try {
            await redis.set('test_misconf', '123');
            console.log("Write successful. MISCONF is not blocking writes right now.");
        } catch (writeErr: any) {
            console.error("Write failed:", writeErr.message);
            if (writeErr.message.includes('MISCONF')) {
                console.log("MISCONF active. Attempting to disable stop-writes-on-bgsave-error...");
                await redis.config('SET', 'stop-writes-on-bgsave-error', 'no');
                console.log("config set stop-writes-on-bgsave-error no -> executed.");
                
                // test write again
                await redis.set('test_misconf', '123');
                console.log("Write after config change successful.");
            }
        }
        
    } catch (e: any) {
        console.error("Redis connection error:", e.message);
    } finally {
        redis.disconnect();
    }
}

checkRedis();

import ping from 'ping';
import { logger } from './logger.js';

/**
 * Measure latency to a host in milliseconds
 * Returns -1 if host is unreachable
 */
export async function measureLatency(host: string): Promise<number> {
    try {
        const res = await ping.promise.probe(host, {
            timeout: 2, // 2 seconds timeout
            min_reply: 1,
        });

        if (res.alive && typeof res.time === 'number') {
            return Math.round(res.time);
        }
        return -1;
    } catch (error) {
        logger.error({ err: error, host }, 'Ping failed');
        return -1;
    }
}

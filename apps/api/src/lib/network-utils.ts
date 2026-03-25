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

/**
 * Check if an IP address or hostname resolved to an IP is in a private/reserved range
 */
export function isPrivateIP(host: string): boolean {
    if (!host) return true;
    
    // Simple hostname check for localhost/loopback
    const lowerHost = host.toLowerCase().trim();
    if (lowerHost === 'localhost' || lowerHost === '127.0.0.1' || lowerHost === '::1' || lowerHost === '0.0.0.0') {
        return true;
    }

    // IP Range detection (simplistic but covers standard IPv4 private ranges)
    // 10.0.0.0/8
    if (lowerHost.startsWith('10.')) return true;
    // 172.16.0.0/12
    if (lowerHost.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) return true;
    // 192.168.0.0/16
    if (lowerHost.startsWith('192.168.')) return true;
    // 169.254.0.0/16 (Link-local)
    if (lowerHost.startsWith('169.254.')) return true;

    return false;
}

import { logger } from '../logger.js';

/**
 * Check if the error is a known MikroTik API quirk (like ROS 7.18+ !empty tag)
 */
export function isRouterosQuirk(error: any): boolean {
    if (!error) return false;

    const msg = String(error.message || error.msg || error || '').toLowerCase();
    const name = String(error.name || '').toLowerCase();
    const errno = String(error.errno || '').toUpperCase();
    const stack = String(error.stack || '').toLowerCase();

    // Do NOT swallow actual authentication errors as "quirks".
    if (msg.includes('login failure') || msg.includes('username or password') || msg.includes('invalid password')) {
        return false;
    }

    return (
        msg.includes('!empty') ||
        msg.includes('unknown reply') ||
        msg.includes('unknown tag') ||
        msg.includes('tried to process unknown reply') ||
        msg.includes('sentence was not terminated') || 
        errno === 'UNKNOWNREPLY' ||
        name === 'rosexception' ||
        name.includes('rosexception') ||
        stack.includes('rosexception')
    );
}

/**
 * Parse MikroTik date format
 */
export function parseMikrotikDate(dateStr: string): Date {
    const months: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };

    const match = dateStr.match(/(\w+)\/(\d+)(?:\/(\d+))?\s+(\d+):(\d+):(\d+)/);

    if (!match) {
        const fallbackDate = new Date(dateStr);
        if (!isNaN(fallbackDate.getTime())) return fallbackDate;
        throw new Error(`Invalid date format: ${dateStr}`);
    }

    const [, monthStr, day, yearStr, hour, minute, second] = match;
    const month = months[monthStr.toLowerCase()];

    if (month === undefined) {
        const fallbackDate = new Date(dateStr);
        if (!isNaN(fallbackDate.getTime())) return fallbackDate;
        throw new Error(`Invalid month: ${monthStr}`);
    }

    const year = yearStr ? parseInt(yearStr) : new Date().getFullYear();

    return new Date(
        year,
        month,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
    );
}

/**
 * Parse MikroTik interval to seconds
 */
export function parseMikrotikInterval(interval: string): number {
    if (!interval) return 10;
    if (typeof interval === 'number') return interval;
    if (typeof interval !== 'string') return 10;

    if (interval.includes(':')) {
        const parts = interval.split(':').map(p => parseInt(p, 10));
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
    }

    let totalSeconds = 0;
    const weeks = interval.match(/(\d+)w/);
    const days = interval.match(/(\d+)d/);
    const hours = interval.match(/(\d+)h/);
    const minutes = interval.match(/(\d+)m/);
    const seconds = interval.match(/(\d+)s/);

    if (weeks) totalSeconds += parseInt(weeks[1]) * 604800;
    if (days) totalSeconds += parseInt(days[1]) * 86400;
    if (hours) totalSeconds += parseInt(hours[1]) * 3600;
    if (minutes) totalSeconds += parseInt(minutes[1]) * 60;
    if (seconds) totalSeconds += parseInt(seconds[1]);

    return totalSeconds > 0 ? totalSeconds : 10;
}

/**
 * Parse SNMP value (handles Buffer for Counter64)
 */
export function parseSnmpValue(value: any): number {
    if (value === null || value === undefined) return 0;
    
    if (Buffer.isBuffer(value)) {
        if (value.length === 8) {
            return Number(value.readBigUInt64BE());
        }
        
        let result = 0n;
        for (let i = 0; i < value.length; i++) {
            result = (result << 8n) + BigInt(value[i]);
        }
        return Number(result);
    }
    
    const parsed = Number(value);
    return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parse uptime string to seconds
 */
export function parseUptimeToSeconds(uptime: string): number {
    const regex = /(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/;
    const match = uptime.match(regex);
    if (!match) return 0;
    const weeks = parseInt(match[1] || '0', 10);
    const days = parseInt(match[2] || '0', 10);
    const hours = parseInt(match[3] || '0', 10);
    const minutes = parseInt(match[4] || '0', 10);
    const seconds = parseInt(match[5] || '0', 10);
    return (weeks * 7 * 24 * 60 * 60 + days * 24 * 60 * 60 + hours * 3600 + minutes * 60 + seconds);
}

/**
 * Parse latency value from RouterOS ping output
 */
export function parseLatencyValue(value: any): number {
    const str = String(value).trim().toLowerCase();

    const msMatch = str.match(/(\d+)ms/);
    const usMatch = str.match(/(\d+)us/);

    if (msMatch) {
        const ms = parseInt(msMatch[1], 10);
        const us = usMatch ? parseInt(usMatch[1], 10) : 0;
        return Math.round(ms + (us / 1000));
    }

    if (usMatch) {
        const us = parseInt(usMatch[1], 10);
        return Math.max(1, Math.round(us / 1000));
    }

    if (str.endsWith('s') && !str.includes('ms') && !str.includes('us')) {
        const s = parseFloat(str.replace('s', '')); 
        return Math.round(s * 1000);
    }

    const num = parseFloat(str);
    return isNaN(num) ? -1 : Math.round(num);
}

import * as nodeRouterosModule from 'node-routeros';
const nodeRouteros: any = (nodeRouterosModule as any).default || nodeRouterosModule;
const RouterOSAPI = nodeRouteros.RouterOSAPI || nodeRouteros;
import { logger } from '../logger.js';
import { isRouterosQuirk } from './utils.js';
import { RouterConnection } from './types.js';

// Connection Pool to reuse API instances
const connectionPool = new Map<string, any>();
const poolTimeouts = new Map<string, NodeJS.Timeout>();

// Pool retention: 5 minutes of inactivity before closing
const POOL_IDLE_TIMEOUT = 5 * 60 * 1000;

/**
 * Create or reuse a connection to a MikroTik router
 */
export async function connectToRouter(config: RouterConnection): Promise<any> {
    const poolKey = `${config.host}:${config.port}:${config.username}`;

    if (poolTimeouts.has(poolKey)) {
        clearTimeout(poolTimeouts.get(poolKey)!);
        poolTimeouts.delete(poolKey);
    }

    if (connectionPool.has(poolKey)) {
        const existingApi = connectionPool.get(poolKey);
        if (existingApi.connected) {
            logger.debug({ host: config.host }, '♻️ Reusing existing MikroTik API connection');
            return existingApi;
        }
        connectionPool.delete(poolKey);
    }

    let targetHost = config.host.trim();
    let targetPort = config.port;

    if (targetHost.includes(':')) {
        const parts = targetHost.split(':');
        targetHost = parts[0].trim();
        const parsedPort = parseInt(parts[1], 10);
        if (!isNaN(parsedPort)) targetPort = parsedPort;
    }

    const api = new RouterOSAPI({
        host: targetHost,
        port: targetPort,
        user: config.username,
        password: config.password,
        timeout: config.timeout || 60,
        keepalive: true,
    });

    (api as any).release = () => releaseConnection(config.host, config.port, config.username);
    if (config.romon) (api as any).romon = config.romon;

    api.on('error', (err: any) => {
        if (isRouterosQuirk(err)) {
            logger.debug({ host: config.host, msg: err?.message }, 'Suppressed ROS protocol quirk');
            return;
        }
        connectionPool.delete(poolKey);
        logger.error({ err: err?.message || String(err), host: config.host }, '[RouterOS API Error]');
    });

    api.on('fatal', (err: any) => {
        if (isRouterosQuirk(err)) return;
        logger.error({ err, host: config.host }, '[RouterOS API Fatal]');
        connectionPool.delete(poolKey);
    });

    await api.connect();
    connectionPool.set(poolKey, api);
    return api;
}

/**
 * Release a connection back to the idle pool
 */
export function releaseConnection(host: string, port: number, username: string) {
    const poolKey = `${host}:${port}:${username}`;
    if (connectionPool.has(poolKey)) {
        const timeout = setTimeout(() => {
            const api = connectionPool.get(poolKey);
            if (api) {
                logger.debug({ host }, '🔌 Closing idle MikroTik API connection');
                api.close().catch(() => { });
                connectionPool.delete(poolKey);
            }
            poolTimeouts.delete(poolKey);
        }, POOL_IDLE_TIMEOUT);
        poolTimeouts.set(poolKey, timeout);
    }
}

/**
 * Resilient wrapper for api.write
 */
export async function safeWrite(api: any, command: string | string[], timeoutMs: number = 30000): Promise<any[]> {
    const poolKey = api?.host ? `${api.host}:${api.port}:${api.user}` : null;
    try {
        if (!api || typeof api.write !== 'function') throw new Error('Invalid API instance');
        if (!api.connected || (api.connector && !api.connector.connected)) throw new Error('Connection closed');

        const writePromise = api.write(command).catch((e: any) => {
            if (String(e?.message || '').includes('null (reading')) throw new Error('API internal stream crash');
            throw e;
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Command timed out after ${timeoutMs}ms`)), timeoutMs)
        );

        return await Promise.race([writePromise, timeoutPromise]);
    } catch (error: any) {
        const msg = String(error.message || '').toLowerCase();
        const isConnError = msg.includes('closed') || 
                           msg.includes('timeout') || 
                           msg.includes('crash') || 
                           msg.includes('proactive check') ||
                           msg.includes('socket hung up') ||
                           msg.includes('reset by peer');

        if (poolKey && isConnError) {
            logger.warn({ host: api.host, msg: error.message }, '🧨 Purging dead MikroTik connection from pool');
            connectionPool.delete(poolKey);
        }
        if (isRouterosQuirk(error)) return [];
        throw error;
    }
}

/**
 * MikroTik API Entry Point
 * 
 * This file is now a re-exporter for the modular library.
 * It maintains backward compatibility with services that import from '@lib/mikrotik-api'.
 */

export * from './mikrotik/types.js';
export * from './mikrotik/utils.js';
export * from './mikrotik/connection.js';
export * from './mikrotik/system.js';
export * from './mikrotik/network.js';

// Specific re-exports for common aliases/patterns if needed
import { 
    connectToRouter, 
    releaseConnection,
    safeWrite 
} from './mikrotik/connection.js';

export { 
    connectToRouter, 
    releaseConnection, 
    safeWrite 
};

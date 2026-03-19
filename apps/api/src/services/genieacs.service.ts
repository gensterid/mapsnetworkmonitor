import * as core from './genieacs/genieacs-core.service.js';
import * as driver from './genieacs/genieacs-driver.service.js';
import * as device from './genieacs/genieacs-device.service.js';
import * as action from './genieacs/genieacs-action.service.js';
import * as backup from './genieacs/genieacs-backup.service.js';

// Re-export types for backward compatibility
export * from './genieacs/genieacs-core.service.js';
export * from './genieacs/genieacs-driver.service.js';
export * from './genieacs/genieacs-device.service.js';
export * from './genieacs/genieacs-action.service.js';
export * from './genieacs/genieacs-backup.service.js';

/**
 * GenieACS Service Aggregator
 * This object maintains the same interface as the original monolithic service
 * to ensure backward compatibility across the codebase.
 */
export const genieacsService = {
    // Core & Device
    getDevices: device.getDevices,
    getDevice: device.getDevice,
    syncMetadata: device.syncMetadata,
    getDashboardStats: device.getDashboardStats,
    testConnection: core.testConnection,
    
    // Actions
    updateWanConfig: action.updateWanConfig,
    deleteWanConnection: action.deleteWanConnection,
    updateWifiConfig: action.updateWifiConfig,
    rebootDevice: action.rebootDevice,
    factoryReset: action.factoryReset,
    refreshDevice: action.refreshDevice,
    setParameter: action.setParameter,
    updateAcsSettings: action.updateAcsSettings,
    bulkReboot: action.bulkReboot,
    bulkPushConfig: action.bulkPushConfig,
    
    // Backup & Restore
    getBackups: backup.getBackups,
    backupDevice: backup.backupDevice,
    deleteBackup: backup.deleteBackup,
    restoreDeviceAuto: backup.restoreDeviceAuto,
    restoreDeviceManual: backup.restoreDeviceManual,
};

// Export individual functions if they were exported before (some might be)
export const getWanConnections = device.getWanConnections;
export const transformGenieACSDevice = device.transformGenieACSDevice;
export const findDriver = driver.findDriver;

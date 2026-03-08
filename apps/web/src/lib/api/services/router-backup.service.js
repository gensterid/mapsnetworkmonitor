import api from '../client';

export const routerBackupService = {
    // List backups for a router
    listBackups: async (routerId) => {
        const response = await api.get(`/router-backups/${routerId}`);
        return response.data;
    },

    // Create a new backup
    createBackup: async (routerId, type, comment) => {
        const response = await api.post(`/router-backups/${routerId}`, { type, comment });
        return response.data;
    },

    // Delete a backup
    deleteBackup: async (backupId) => {
        const response = await api.delete(`/router-backups/${backupId}`);
        return response.data;
    },

    // Get download URL
    getDownloadUrl: (backupId) => {
        return `${api.defaults.baseURL}/router-backups/download/${backupId}`;
    }
};

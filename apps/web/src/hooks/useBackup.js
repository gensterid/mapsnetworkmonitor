
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../lib/api/client';
import toast from 'react-hot-toast';

export const useExportDatabase = () => {
    return useMutation({
        mutationFn: async () => {
            const response = await apiClient.get('/backup/export', {
                responseType: 'blob'
            });

            // Create a blob link to download
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;

            // Generate filename with date
            const date = new Date().toISOString().split('T')[0];
            link.setAttribute('download', `backup-${date}.sql`);

            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);

            return true;
        },
        onError: (error) => {
            console.error('Export failed:', error);
            toast.error('Failed to export database: ' + (error.response?.data?.error || error.message));
        }
    });
};

export const useImportDatabase = () => {
    return useMutation({
        mutationFn: async (file) => {
            const formData = new FormData();
            formData.append('backup', file);

            const response = await apiClient.post('/backup/import', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            return response.data;
        },
        onSuccess: () => {
            toast.success('Database restored successfully');
        },
        onError: (error) => {
            console.error('Import failed:', error);
            toast.error('Failed to restore database: ' + (error.response?.data?.error || error.message));
        }
    });
};

import { useQuery } from '@tanstack/react-query';

export const useBackups = () => {
    return useQuery({
        queryKey: ['backups'],
        queryFn: async () => {
            const response = await apiClient.get('/backup/list');
            return response.data;
        }
    });
};

export const useTriggerManualBackup = () => {
    return useMutation({
        mutationFn: async () => {
            const response = await apiClient.post('/backup/trigger-manual');
            return response.data;
        },
        onSuccess: () => {
            toast.success('Backup created successfully');
        },
        onError: (error) => {
            toast.error('Backup failed: ' + (error.response?.data?.error || error.message));
        }
    });
};

export const useDeleteBackup = () => {
    return useMutation({
        mutationFn: async (filename) => {
            const response = await apiClient.delete(`/backup/${filename}`);
            return response.data;
        },
        onSuccess: () => {
            toast.success('Backup deleted');
        },
        onError: (error) => {
            toast.error('Failed to delete backup: ' + (error.response?.data?.error || error.message));
        }
    });
};

export const useRestoreBackup = () => {
    return useMutation({
        mutationFn: async (filename) => {
            const response = await apiClient.post(`/backup/restore-local/${filename}`);
            return response.data;
        },
        onSuccess: () => {
            toast.success('Database restored from history');
        },
        onError: (error) => {
            toast.error('Restore failed: ' + (error.response?.data?.error || error.message));
        }
    });
};

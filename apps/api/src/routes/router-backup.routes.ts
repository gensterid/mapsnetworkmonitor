import express, { Router } from 'express';
import { routerBackupService } from '../services/index.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * Handle incoming backup file upload from MikroTik (Push Method)
 * Publicly accessible but protected by token
 */
router.post('/upload', express.raw({ type: '*/*', limit: '50mb' }), asyncHandler(async (req, res) => {
    const { routerId, token, filename, type } = req.query;
    
    if (!routerId || !token || !filename || !type) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    const result = await routerBackupService.handleBackupUpload(
        routerId as string,
        token as string,
        filename as string,
        type as 'backup' | 'rsc',
        req.body as Buffer
    );

    res.json(result);
}));

// List backups for a router
router.get('/:routerId', authMiddleware, asyncHandler(async (req, res) => {
    const list = await routerBackupService.listRouterBackups(req.params.routerId);
    res.json(list);
}));

// Create a new backup
router.post('/:routerId', authMiddleware, asyncHandler(async (req, res) => {
    const { type, comment, delay } = req.body;
    if (!['backup', 'rsc'].includes(type)) {
        return res.status(400).json({ error: 'Invalid backup type' });
    }
    
    const result = await routerBackupService.createBackup(req.params.routerId, type, comment, delay ? parseInt(delay) : 10);
    res.json(result);
}));

// Download backup file
router.get('/download/:backupId', authMiddleware, asyncHandler(async (req, res) => {
    const { stream, filename, size } = await routerBackupService.getBackupFileStream(req.params.backupId);
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', (size || 0).toString());
    
    stream.pipe(res);
}));

// Delete a backup
router.delete('/:backupId', authMiddleware, asyncHandler(async (req, res) => {
    await routerBackupService.deleteBackup(req.params.backupId);
    res.json({ success: true });
}));

export default router;

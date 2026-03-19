
import { Router, Request } from 'express';
import multer from 'multer';
import { backupService } from '../services/backup.service.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { logger } from '../lib/logger.js';
import fs from 'fs';
import path from 'path';
import { uploadLimiter } from '../config/security.js';

const router = Router();
router.use(authMiddleware);

const upload = multer({
    dest: 'temp/',
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        // Permissive mimetype but strict extension
        if (ext !== '.sql') {
            return cb(new Error('Only .sql files are allowed'));
        }
        cb(null, true);
    },
});

// Export Database
router.get('/export', requireRole('superadmin'), async (_req, res) => {
    try {
        const filePath = await backupService.exportDatabase();
        res.download(filePath, path.basename(filePath), (err) => {
            if (err) {
                logger.error({ err: err?.message || String(err) }, 'Download error');
            }
            // cleanup
            try {
                fs.unlinkSync(filePath);
            } catch (e) {
                logger.error({ err: e }, 'Failed to cleanup backup file');
            }
        });
    } catch (error: any) {
        logger.error({ err: error }, 'Export error');
        res.status(500).json({ error: error.message || 'Failed to create backup' });
    }
});

// Import Database
router.post('/import', uploadLimiter, requireRole('superadmin'), upload.single('backup'), async (req: Request, res) => {
    const file = (req as any).file;
    if (!file) {
        return res.status(400).json({ error: 'No backup file provided' });
    }

    try {
        // Deep Content Inspection for SQL
        const buffer = fs.readFileSync(file.path, { encoding: 'utf8', flag: 'r' });
        const trimmed = buffer.trim().substring(0, 1000).toUpperCase();
        
        const isSql = 
            trimmed.startsWith('--') || 
            trimmed.includes('CREATE TABLE') || 
            trimmed.includes('INSERT INTO') || 
            trimmed.includes('PRAGMA') || 
            trimmed.includes('SET ') || 
            trimmed.includes('BEGIN TRANSACTION');

        if (!isSql) {
            fs.unlinkSync(file.path);
            return res.status(400).json({ error: 'Invalid SQL file content detected' });
        }

        await backupService.importDatabase(file.path);

        // Cleanup uploaded file
        try {
            fs.unlinkSync(file.path);
        } catch (e) {
            logger.error({ err: e }, 'Failed to cleanup uploaded file');
        }

        res.json({ message: 'Database restored successfully' });
    } catch (error) {
        logger.error({ err: error }, 'Import error');
        res.status(500).json({ error: 'Failed to restore database' });
    }
});

// List Backups
router.get('/list', requireRole('superadmin'), async (_req, res) => {
    try {
        const backups = await backupService.listBackups();
        res.json(backups);
    } catch (error: any) {
        logger.error({ err: error }, 'List backups error');
        res.status(500).json({ error: 'Failed to list backups' });
    }
});

// Trigger Manual (Persistent) Backup
router.post('/trigger-manual', requireRole('superadmin'), async (_req, res) => {
    try {
        const filePath = await backupService.automatedBackup();
        res.json({ message: 'Backup created successfully', filename: path.basename(filePath) });
    } catch (error: any) {
        logger.error({ err: error }, 'Manual trigger error');
        res.status(500).json({ error: error.message || 'Failed to trigger backup' });
    }
});

// Delete Backup
router.delete('/:filename', requireRole('superadmin'), async (req, res) => {
    try {
        await backupService.deleteBackup(req.params.filename as string);
        res.json({ message: 'Backup deleted successfully' });
    } catch (error: any) {
        logger.error({ err: error }, 'Delete backup error');
        res.status(500).json({ error: 'Failed to delete backup' });
    }
});

// Restore from Local File
router.post('/restore-local/:filename', requireRole('superadmin'), async (req, res) => {
    try {
        await backupService.restoreFromHistory(req.params.filename as string);
        res.json({ message: 'Database restored successfully from history' });
    } catch (error: any) {
        logger.error({ err: error }, 'Restore local error');
        res.status(500).json({ error: error.message || 'Failed to restore database' });
    }
});

export default router;

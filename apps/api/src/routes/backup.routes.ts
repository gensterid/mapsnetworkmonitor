
import { Router, Request } from 'express';
import multer from 'multer';
import { backupService } from '../services/backup.service.js';
import { requireAdmin } from '../middleware/rbac.middleware.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { logger } from '../lib/logger.js';
import fs from 'fs';
import path from 'path';

const router = Router();
router.use(authMiddleware);

const upload = multer({
    dest: 'temp/',
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.sql') {
            return cb(new Error('Only .sql files are allowed'));
        }
        cb(null, true);
    },
});

// Export Database
router.get('/export', requireAdmin, async (_req, res) => {
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
router.post('/import', requireAdmin, upload.single('backup'), async (req: Request, res) => {
    const file = (req as any).file;
    if (!file) {
        return res.status(400).json({ error: 'No backup file provided' });
    }

    try {
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

export default router;

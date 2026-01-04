
import { Router, Request } from 'express';
import multer from 'multer';
import { backupService } from '../services/backup.service.js';
import { requireAdmin } from '../middleware/rbac.middleware.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import fs from 'fs';
import path from 'path';

const router = Router();
router.use(authMiddleware);

const upload = multer({ dest: 'temp/' });

// Export Database
router.get('/export', requireAdmin, async (_req, res) => {
    try {
        const filePath = await backupService.exportDatabase();
        res.download(filePath, path.basename(filePath), (err) => {
            if (err) {
                console.error('Download error:', err);
            }
            // cleanup
            try {
                fs.unlinkSync(filePath);
            } catch (e) {
                console.error('Failed to cleanup backup file:', e);
            }
        });
    } catch (error: any) {
        console.error('Export error:', error);
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
            console.error('Failed to cleanup uploaded file:', e);
        }

        res.json({ message: 'Database restored successfully' });
    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ error: 'Failed to restore database' });
    }
});

export default router;

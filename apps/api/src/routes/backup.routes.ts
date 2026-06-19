
import { Router, Request } from 'express';
import multer from 'multer';
import { backupService } from '../services/backup.service.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { logger } from '../lib/logger.js';
import fs from 'fs';
import path from 'path';
import { uploadLimiter } from '../config/security.js';
import { auditRepository } from '../repositories/audit.repository.js';

const router = Router();
router.use(authMiddleware);

/**
 * Log audit entry untuk backup operation. Best-effort — kalau write
 * gagal, JANGAN block actual operation. Operator superadmin tetap
 * dapat hasil action, hanya audit trail yang missing untuk entry itu.
 *
 * Per code-review note: backup destructive ops (restore, delete,
 * trigger, export) butuh tamper-evident trail untuk forensic /
 * incident investigation. logger.info (pino) bukan audit store.
 */
async function logBackupAudit(
    req: Request,
    action: 'create' | 'restore' | 'delete' | 'export',
    details: Record<string, unknown> = {},
): Promise<void> {
    try {
        const userId = (req as any).user?.id ?? null;
        await auditRepository.create({
            userId,
            action,
            entity: 'backup',
            details,
            ipAddress: req.ip ?? null,
            userAgent: req.headers['user-agent'] ?? null,
        });
    } catch (e) {
        logger.error({ err: e, action }, 'Failed to write backup audit log');
    }
}

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
router.get('/export', requireRole('superadmin'), async (req, res) => {
    try {
        const filePath = await backupService.exportDatabase();
        const filename = path.basename(filePath);
        await logBackupAudit(req, 'export', { filename });
        res.download(filePath, filename, (err) => {
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
        // pg_dump errors bisa include DATABASE_URL connection string di message.
        // Log detail server-side, kirim generic message ke client.
        logger.error({ err: error }, 'Export error');
        res.status(500).json({ error: 'Failed to create backup' });
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
        const upperBuffer = buffer.toUpperCase();
        
        // 1. Basic format check (must start with common SQL headers)
        const isSqlFormat = 
            upperBuffer.startsWith('--') || 
            upperBuffer.includes('CREATE TABLE') || 
            upperBuffer.includes('INSERT INTO') || 
            upperBuffer.includes('SET ') || 
            upperBuffer.includes('BEGIN;');

        if (!isSqlFormat) {
            fs.unlinkSync(file.path);
            logger.warn({ filename: file.originalname }, 'Blocked invalid SQL file (format mismatch)');
            return res.status(400).json({ error: 'Invalid SQL file format detected' });
        }

        // 2. Dangerous keyword check (Blacklist)
        // We block commands that could compromise the entire database instance or OS
        const dangerousKeywords = [
            'DROP DATABASE',
            'ALTER USER',
            'GRANT ALL',
            'CREATE ROLE',
            'DROP ROLE',
            'COPY FROM PROGRAM', // Critical vulnerability if enabled
            'COPY TO PROGRAM'
        ];

        for (const word of dangerousKeywords) {
            if (upperBuffer.includes(word)) {
                fs.unlinkSync(file.path);
                logger.error({ keyword: word, filename: file.originalname }, '🚫 SECURITY: Blocked SQL import containing dangerous keyword');
                return res.status(400).json({ error: `Security Violation: File contains forbidden command: ${word}` });
            }
        }

        await backupService.importDatabase(file.path);
        await logBackupAudit(req, 'restore', {
            source: 'upload',
            filename: file.originalname,
            size: file.size,
        });

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
router.post('/trigger-manual', requireRole('superadmin'), async (req, res) => {
    try {
        // Manual trigger always creates a fresh dump — bypass the same-day skip
        // that automatedBackup() applies for the scheduler.
        const filePath = await backupService.exportDatabase(true);
        const filename = path.basename(filePath);
        await logBackupAudit(req, 'create', { filename });
        res.json({ message: 'Backup created successfully', filename });
    } catch (error: any) {
        // Sama dengan /export — error message bisa leak DATABASE_URL ke client.
        logger.error({ err: error }, 'Manual trigger error');
        res.status(500).json({ error: 'Failed to trigger backup' });
    }
});

// Delete Backup
router.delete('/:filename', requireRole('superadmin'), async (req, res) => {
    const filename = req.params.filename as string;
    try {
        await backupService.deleteBackup(filename);
        await logBackupAudit(req, 'delete', { filename });
        res.json({ message: 'Backup deleted successfully' });
    } catch (error: any) {
        logger.error({ err: error, filename }, 'Delete backup error');
        res.status(500).json({ error: 'Failed to delete backup' });
    }
});

// Restore from Local File
router.post('/restore-local/:filename', requireRole('superadmin'), async (req, res) => {
    const filename = req.params.filename as string;
    try {
        await backupService.restoreFromHistory(filename);
        await logBackupAudit(req, 'restore', { source: 'local', filename });
        res.json({ message: 'Database restored successfully from history' });
    } catch (error: any) {
        // Sama dengan /export — error message bisa leak DATABASE_URL atau path
        // structure internal. Log detail server-side, return generic.
        logger.error({ err: error, filename }, 'Restore local error');
        res.status(500).json({ error: 'Failed to restore database' });
    }
});

export default router;

import express, { Router } from 'express';
import { routerBackupService } from '../services/index.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireOperator } from '../middleware/rbac.middleware.js';
import { getEffectiveTenantId } from '../lib/tenant-utils.js';
import { uploadLimiter } from '../config/security.js';

const router = Router();


/**
 * Path-based push endpoint (resilient to MikroTik '?' help character issue)
 * Under /upload/push to match existing Cloudflare WAF rule
 */
const uploadHandler = asyncHandler(async (req, res) => {
    const { routerId, token, filename, type, expectedSize } = req.params;
    
    const result = await routerBackupService.handleBackupUpload(
        routerId as string,
        token as string,
        filename as string,
        type as 'backup' | 'rsc',
        req.body,
        req,
        expectedSize ? parseInt(expectedSize as string) : undefined
    );

    res.json(result);
});

router.post('/upload/push/:routerId/:token/:filename/:type/:expectedSize?', uploadLimiter, express.raw({ type: () => true, limit: '10mb' }), uploadHandler);
router.put('/upload/push/:routerId/:token/:filename/:type/:expectedSize?', uploadLimiter, express.raw({ type: () => true, limit: '10mb' }), uploadHandler);
/**
 * Backward-compatible endpoint for query-string based uploads
 * Used by existing scripts or manual triggers using the old format
 */
router.post('/upload', uploadLimiter, express.raw({ type: () => true, limit: '10mb' }), asyncHandler(async (req, res) => {
    const { routerId, token, filename, type, size } = req.query;
    
    if (!routerId || !token || !filename || !type) {
        return res.status(400).json({ error: 'Missing required backup parameters in query string' });
    }

    const result = await routerBackupService.handleBackupUpload(
        routerId as string,
        token as string,
        filename as string,
        type as 'backup' | 'rsc',
        req.body,
        req,
        size ? parseInt(size as string) : undefined
    );

    res.json(result);
}));

// ─────────────────────────────────────────────────────────────────────────
// Endpoint operator: WAJIB autentikasi + role + scope tenant.
// (Endpoint /upload* di atas sengaja TANPA auth — di-push oleh MikroTik
//  memakai token per-router, bukan user login. Middleware di bawah hanya
//  berlaku untuk route yang didefinisikan SETELAH baris ini.)
// ─────────────────────────────────────────────────────────────────────────
router.use(authMiddleware);
// Tolak non-superadmin tanpa tenantId (akun orphan) → cegah bypass scoping.
router.use((req, _res, next) => {
    const u = (req as any).user;
    if (u?.role !== 'superadmin' && !u?.tenantId) {
        return next(new ApiError(403, 'Tenant context required'));
    }
    next();
});
router.use(requireOperator);

// List backups for a router
router.get('/:routerId', asyncHandler(async (req, res) => {
    await routerBackupService.assertRouterOwned(req.params.routerId as string, getEffectiveTenantId(req));
    const list = await routerBackupService.listRouterBackups(req.params.routerId as string);
    res.json(list);
}));

// Create a new backup
router.post('/:routerId', express.json(), asyncHandler(async (req, res) => {
    await routerBackupService.assertRouterOwned(req.params.routerId as string, getEffectiveTenantId(req));
    const { type, comment, delay } = req.body;
    if (!['backup', 'rsc', 'json'].includes(type)) {
        return res.status(400).json({ error: 'Invalid backup type' });
    }

    const result = await routerBackupService.createBackup(req.params.routerId as string, type, comment, delay ? parseInt(delay as string) : 10);
    res.json(result);
}));

// Download backup file
router.get('/download/:backupId', asyncHandler(async (req, res) => {
    await routerBackupService.assertBackupOwned(req.params.backupId as string, getEffectiveTenantId(req));
    const { stream, filename, size } = await routerBackupService.getBackupFileStream(req.params.backupId as string);

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', (size || 0).toString());

    stream.pipe(res);
}));

// Delete a backup
router.delete('/:backupId', asyncHandler(async (req, res) => {
    await routerBackupService.assertBackupOwned(req.params.backupId as string, getEffectiveTenantId(req));
    await routerBackupService.deleteBackup(req.params.backupId as string);
    res.json({ success: true });
}));

// Reconstruct .rsc from .json snapshot
router.post('/convert/:backupId', asyncHandler(async (req, res) => {
    await routerBackupService.assertBackupOwned(req.params.backupId as string, getEffectiveTenantId(req));
    const result = await routerBackupService.generateRscFromSnapshot(req.params.backupId as string);
    res.json(result);
}));

// Push automated email backup configuration to MikroTik
router.post('/email-config/:routerId', express.json(), asyncHandler(async (req, res) => {
    await routerBackupService.assertRouterOwned(req.params.routerId as string, getEffectiveTenantId(req));
    const result = await routerBackupService.pushEmailConfig(req.params.routerId as string, req.body);
    res.json(result);
}));

// Fetch saved email configuration
router.get('/email-config/:routerId', asyncHandler(async (req, res) => {
    await routerBackupService.assertRouterOwned(req.params.routerId as string, getEffectiveTenantId(req));
    const result = await routerBackupService.getEmailConfig(req.params.routerId as string);
    res.json(result);
}));

export default router;

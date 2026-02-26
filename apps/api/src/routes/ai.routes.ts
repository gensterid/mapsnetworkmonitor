import { Router, Request, Response } from 'express';
import { aiService } from '../services/index.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// All AI routes require authentication
router.use(authMiddleware);

/**
 * @route POST /api/ai/analyze-alert/:id
 * Analyze a specific alert
 */
router.post(
    '/analyze-alert/:id',
    asyncHandler(async (req: Request, res: Response) => {
        const alertId = req.params.id;
        const tenantId = req.user!.tenantId!;
        const apiKey = req.user!.aiEnabled ? req.user!.aiApiKey : null;

        const analysis = await aiService.analyzeAlert(alertId, tenantId, apiKey, req.user!.id, req.user!.role);
        res.json({ data: { analysis } });
    })
);

/**
 * @route GET /api/ai/network-summary
 * Get daily network health summary
 */
router.get(
    '/network-summary',
    asyncHandler(async (req: Request, res: Response) => {
        const tenantId = req.user!.tenantId!;
        const apiKey = req.user!.aiEnabled ? req.user!.aiApiKey : null;

        const summary = await aiService.generateDailySummary(tenantId, apiKey, req.user!.id, req.user!.role);
        res.json({ data: { summary } });
    })
);

/**
 * @route POST /api/ai/diagnose-router/:id
 * Get diagnostics insights for a specific router
 */
router.post(
    '/diagnose-router/:id',
    asyncHandler(async (req: Request, res: Response) => {
        const routerId = req.params.id;
        const tenantId = req.user!.tenantId!;
        const apiKey = req.user!.aiEnabled ? req.user!.aiApiKey : null;

        const insights = await aiService.getDiagnosticsInsights(routerId, tenantId, apiKey, req.user!.id, req.user!.role);
        res.json({ data: { insights } });
    })
);

export default router;

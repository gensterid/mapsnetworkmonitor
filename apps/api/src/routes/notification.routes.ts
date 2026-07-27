import { Router } from 'express';
import { db } from '../db/index.js';
import { notificationGroups } from '../db/schema/index.js';
import { eq, desc, and } from 'drizzle-orm';
import { z } from 'zod';
import { requireAdmin, requireOperator } from '../middleware/rbac.middleware.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { getEffectiveTenantId } from '../lib/tenant-utils.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Schema for key validation
const notificationGroupSchema = z.object({
    name: z.string().min(1),
    telegramEnabled: z.boolean().optional(),
    telegramBotToken: z.string().optional().nullable(),
    telegramChatId: z.string().optional().nullable(),
    telegramThreadId: z.string().optional().nullable(),
    whatsappEnabled: z.boolean().optional(),
    whatsappUrl: z.string().optional().nullable(),
    whatsappKey: z.string().optional().nullable(),
    whatsappTo: z.string().optional().nullable(),
});

// Get all groups (accessible by operators and admins for dropdown selection)
// M6 (audit): grup notifikasi memuat token bot Telegram & key WhatsApp —
// batasi ke Operator+ (mutasi tetap requireAdmin).
router.get('/', requireOperator, async (req, res) => {
    try {
        const tenantId = getEffectiveTenantId(req);
        const groups = await db
            .select()
            .from(notificationGroups)
            .where(tenantId ? eq(notificationGroups.tenantId, tenantId) : undefined as any)
            .orderBy(desc(notificationGroups.createdAt));
        res.json({ data: groups });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch notification groups' });
    }
});

// Create group
router.post('/', requireAdmin, async (req, res) => {
    try {
        const validated = notificationGroupSchema.parse(req.body);

        const [group] = await db
            .insert(notificationGroups)
            .values({
                ...validated,
                tenantId: req.user!.tenantId!,
            })
            .returning();

        res.status(201).json(group);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.errors });
        } else {
            res.status(500).json({ error: 'Failed to create notification group' });
        }
    }
});

// Update group
router.put('/:id', requireAdmin, async (req, res) => {
    try {
        const id = req.params.id as string;
        const validated = notificationGroupSchema.parse(req.body);

        const [group] = await db
            .update(notificationGroups)
            .set({
                ...validated,
                updatedAt: new Date(),
            })
            .where(and(
                eq(notificationGroups.id, id),
                getEffectiveTenantId(req) ? eq(notificationGroups.tenantId, getEffectiveTenantId(req) as string) : undefined as any
            ))
            .returning();

        if (!group) {
            return res.status(404).json({ error: 'Notification group not found' });
        }

        res.json(group);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.errors });
        } else {
            res.status(500).json({ error: 'Failed to update notification group' });
        }
    }
});

// Delete group
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const id = req.params.id as string;

        const [deleted] = await db
            .delete(notificationGroups)
            .where(and(
                eq(notificationGroups.id, id),
                getEffectiveTenantId(req) ? eq(notificationGroups.tenantId, getEffectiveTenantId(req) as string) : undefined as any
            ))
            .returning();

        if (!deleted) {
            return res.status(404).json({ error: 'Notification group not found' });
        }

        res.json({ message: 'Notification group deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete notification group' });
    }
});

export const notificationRoutes = router;

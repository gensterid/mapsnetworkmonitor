import { Router } from 'express';
import { db } from '../db';
import { notificationGroups } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { requireAdmin } from '../middleware/rbac.middleware';

const router = Router();

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
router.get('/', async (_req, res) => {
    try {
        const groups = await db
            .select()
            .from(notificationGroups)
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
            .values(validated)
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
        const { id } = req.params;
        const validated = notificationGroupSchema.parse(req.body);

        const [group] = await db
            .update(notificationGroups)
            .set({
                ...validated,
                updatedAt: new Date(),
            })
            .where(eq(notificationGroups.id, id))
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
        const { id } = req.params;

        const [deleted] = await db
            .delete(notificationGroups)
            .where(eq(notificationGroups.id, id))
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

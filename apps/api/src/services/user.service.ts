import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, accounts, tenants, userTenants, type User, type NewUser } from '../db/schema/index.js';
import { scryptSync, randomBytes } from 'crypto';
import { logger } from '../lib/logger.js';

export type SafeUser = Omit<User, 'aiApiKey'>;

/**
 * User Service - handles user-related operations
 */
export class UserService {
    /**
     * Get all users
     */
    async findAll(tenantId?: string): Promise<(SafeUser & { tenantName?: string | null; additionalTenantIds?: string[] })[]> {
        let query = db
            .select({
                user: {
                    id: users.id,
                    email: users.email,
                    username: users.username,
                    name: users.name,
                    image: users.image,
                    emailVerified: users.emailVerified,
                    role: users.role,
                    tenantId: users.tenantId,
                    timezone: users.timezone,
                    animationStyle: users.animationStyle,
                    aiEnabled: users.aiEnabled,
                    createdAt: users.createdAt,
                    updatedAt: users.updatedAt,
                },
                tenantName: tenants.name,
            })
            .from(users)
            .leftJoin(tenants, eq(users.tenantId, tenants.id));

        if (tenantId) {
            query = query.where(eq(users.tenantId, tenantId)) as any;
        } else {
            // If no tenantId is provided (Superadmin view), don't filter.
            // This allows Superadmins to see and fix 'orphan' users with null tenantId.
            logger.debug('Superadmin view: fetching all users including orphans');
        }

        const result = await query;

        // For each user, fetch their additional tenant IDs
        // This could be optimized into a single join + aggregation in Postgres
        const finalUsers = await Promise.all(result.map(async (r) => {
            const addTenants = await db
                .select({ tenantId: userTenants.tenantId })
                .from(userTenants)
                .where(eq(userTenants.userId, r.user.id));

            return {
                ...r.user,
                tenantName: r.tenantName,
                additionalTenantIds: addTenants.map(at => at.tenantId)
            };
        }));

        return finalUsers;
    }

    /**
     * Get user by ID
     */
    async findById(id: string, tenantId?: string): Promise<(SafeUser & { additionalTenantIds?: string[] }) | undefined> {
        const conditions = [eq(users.id, id)];
        if (tenantId) conditions.push(eq(users.tenantId, tenantId));

        const [user] = await db
            .select({
                id: users.id,
                email: users.email,
                username: users.username,
                name: users.name,
                image: users.image,
                emailVerified: users.emailVerified,
                role: users.role,
                tenantId: users.tenantId,
                timezone: users.timezone,
                animationStyle: users.animationStyle,
                aiEnabled: users.aiEnabled,
                createdAt: users.createdAt,
                updatedAt: users.updatedAt,
            })
            .from(users)
            .where(and(...conditions));
        
        if (!user) return undefined;

        const addTenants = await db
            .select({ tenantId: userTenants.tenantId })
            .from(userTenants)
            .where(eq(userTenants.userId, id));

        return {
            ...user,
            additionalTenantIds: addTenants.map(at => at.tenantId)
        };
    }

    /**
     * Get user by email
     */
    async findByEmail(email: string): Promise<SafeUser | undefined> {
        const [user] = await db
            .select({
                id: users.id,
                email: users.email,
                username: users.username,
                name: users.name,
                image: users.image,
                emailVerified: users.emailVerified,
                role: users.role,
                tenantId: users.tenantId,
                timezone: users.timezone,
                animationStyle: users.animationStyle,
                aiEnabled: users.aiEnabled,
                createdAt: users.createdAt,
                updatedAt: users.updatedAt,
            })
            .from(users)
            .where(eq(users.email, email));
        return user as SafeUser;
    }

    /**
     * Get user by username
     */
    async findByUsername(username: string): Promise<SafeUser | undefined> {
        const [user] = await db
            .select({
                id: users.id,
                email: users.email,
                username: users.username,
                name: users.name,
                image: users.image,
                emailVerified: users.emailVerified,
                role: users.role,
                tenantId: users.tenantId,
                timezone: users.timezone,
                animationStyle: users.animationStyle,
                aiEnabled: users.aiEnabled,
                createdAt: users.createdAt,
                updatedAt: users.updatedAt,
            })
            .from(users)
            .where(eq(users.username, username));
        return user as SafeUser;
    }

    /**
     * Create a new user
     */
    async create(data: NewUser): Promise<SafeUser> {
        const [user] = await db
            .insert(users)
            .values(data)
            .returning({
                id: users.id,
                email: users.email,
                username: users.username,
                name: users.name,
                image: users.image,
                emailVerified: users.emailVerified,
                role: users.role,
                tenantId: users.tenantId,
                timezone: users.timezone,
                animationStyle: users.animationStyle,
                aiEnabled: users.aiEnabled,
                createdAt: users.createdAt,
                updatedAt: users.updatedAt,
            });
        return user as SafeUser;
    }

    /**
     * Update user
     */
    async update(
        id: string,
        data: Partial<Omit<NewUser, 'id'>>
    ): Promise<SafeUser | undefined> {
        const [user] = await db
            .update(users)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(users.id, id))
            .returning({
                id: users.id,
                email: users.email,
                username: users.username,
                name: users.name,
                image: users.image,
                emailVerified: users.emailVerified,
                role: users.role,
                tenantId: users.tenantId,
                timezone: users.timezone,
                animationStyle: users.animationStyle,
                aiEnabled: users.aiEnabled,
                createdAt: users.createdAt,
                updatedAt: users.updatedAt,
            });
        return user as SafeUser;
    }

    /**
     * Update user role
     */
    async updateRole(
        id: string,
        role: 'admin' | 'operator' | 'user'
    ): Promise<SafeUser | undefined> {
        const [user] = await db
            .update(users)
            .set({ role, updatedAt: new Date() })
            .where(eq(users.id, id))
            .returning({
                id: users.id,
                email: users.email,
                username: users.username,
                name: users.name,
                image: users.image,
                emailVerified: users.emailVerified,
                role: users.role,
                tenantId: users.tenantId,
                timezone: users.timezone,
                animationStyle: users.animationStyle,
                aiEnabled: users.aiEnabled,
                createdAt: users.createdAt,
                updatedAt: users.updatedAt,
            });
        return user as SafeUser;
    }

    /**
     * Delete user
     */
    async delete(id: string): Promise<boolean> {
        const result = await db.delete(users).where(eq(users.id, id)).returning();
        return result.length > 0;
    }

    /**
     * Count users
     */
    async count(): Promise<number> {
        const result = await db.select().from(users);
        return result.length;
    }

    /**
     * Update user password (admin only)
     * Uses scrypt to match Better Auth's password hashing
     */
    async updatePassword(userId: string, newPassword: string): Promise<boolean> {
        return await db.transaction(async (tx) => {
            // First check if user exists
            const user = await this.findById(userId); // Still uses db, but it's a read. Better use tx.
            if (!user) return false;

            // Hash password using scrypt (same format as Better Auth)
            const salt = randomBytes(16).toString('hex');
            const hashedBuffer = scryptSync(newPassword, salt, 64, { N: 16384, r: 16, p: 1, maxmem: 67108864 });
            const hashedPassword = `${salt}:${hashedBuffer.toString('hex')}`;

            // Attempt to update password in accounts table where providerId is 'credential'
            const result = await tx
                .update(accounts)
                .set({ password: hashedPassword, updatedAt: new Date() })
                .where(
                    and(
                        eq(accounts.userId, userId),
                        eq(accounts.providerId, 'credential')
                    )
                )
                .returning();

            // If no account existed, create one
            if (result.length === 0) {
                const crypto = await import('crypto');
                await tx.insert(accounts).values({
                    id: crypto.randomUUID(),
                    userId: userId,
                    accountId: userId,
                    providerId: 'credential',
                    password: hashedPassword,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                return true;
            }

            return result.length > 0;
        });
    }

    /**
     * Get all authorized tenants for a user (primary + additional)
     */
    async getAuthorizedTenants(userId: string): Promise<string[]> {
        // Get primary tenant
        const user = await this.findById(userId);
        const primaryTenantId = user?.tenantId;

        // Get additional tenants
        const additionalTenants = await db
            .select({ tenantId: userTenants.tenantId })
            .from(userTenants)
            .where(eq(userTenants.userId, userId));

        const allTenants = new Set<string>();
        if (primaryTenantId) allTenants.add(primaryTenantId);
        additionalTenants.forEach((t) => allTenants.add(t.tenantId));

        return Array.from(allTenants);
    }

    /**
     * Add access to an additional tenant
     */
    async addTenantAccess(userId: string, tenantId: string): Promise<void> {
        await db.insert(userTenants).values({ userId, tenantId }).onConflictDoNothing();
    }

    /**
     * Remove access to an additional tenant
     */
    async removeTenantAccess(userId: string, tenantId: string): Promise<void> {
        await db
            .delete(userTenants)
            .where(
                and(
                    eq(userTenants.userId, userId),
                    eq(userTenants.tenantId, tenantId)
                )
            );
    }

    /**
     * Update all additional tenant accesses for a user
     */
    async updateTenantAccesses(userId: string, tenantIds: string[]): Promise<void> {
        await db.transaction(async (tx) => {
            // Remove existing
            await tx.delete(userTenants).where(eq(userTenants.userId, userId));

            if (tenantIds.length > 0) {
                // Add new
                await tx.insert(userTenants).values(
                    tenantIds.map(tenantId => ({ userId, tenantId }))
                ).onConflictDoNothing();
            }
        });
    }
}

// Export singleton instance
export const userService = new UserService();

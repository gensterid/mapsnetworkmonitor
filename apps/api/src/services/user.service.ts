import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, accounts, tenants, userTenants, type User, type NewUser } from '../db/schema/index.js';
import { scryptSync, randomBytes } from 'crypto';

/**
 * User Service - handles user-related operations
 */
export class UserService {
    /**
     * Get all users
     */
    async findAll(): Promise<(User & { tenantName?: string | null; additionalTenantIds?: string[] })[]> {
        const result = await db
            .select({
                user: users,
                tenantName: tenants.name,
            })
            .from(users)
            .leftJoin(tenants, eq(users.tenantId, tenants.id));

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
    async findById(id: string): Promise<(User & { additionalTenantIds?: string[] }) | undefined> {
        const [user] = await db.select().from(users).where(eq(users.id, id));
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
    async findByEmail(email: string): Promise<User | undefined> {
        const [user] = await db.select().from(users).where(eq(users.email, email));
        return user;
    }

    /**
     * Get user by username
     */
    async findByUsername(username: string): Promise<User | undefined> {
        const [user] = await db.select().from(users).where(eq(users.username, username));
        return user;
    }

    /**
     * Create a new user
     */
    async create(data: NewUser): Promise<User> {
        const [user] = await db.insert(users).values(data).returning();
        return user;
    }

    /**
     * Update user
     */
    async update(
        id: string,
        data: Partial<Omit<NewUser, 'id'>>
    ): Promise<User | undefined> {
        const [user] = await db
            .update(users)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(users.id, id))
            .returning();
        return user;
    }

    /**
     * Update user role
     */
    async updateRole(
        id: string,
        role: 'admin' | 'operator' | 'user'
    ): Promise<User | undefined> {
        const [user] = await db
            .update(users)
            .set({ role, updatedAt: new Date() })
            .where(eq(users.id, id))
            .returning();
        return user;
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
        // First check if user exists
        const user = await this.findById(userId);
        if (!user) return false;

        // Hash password using scrypt (same format as Better Auth)
        const salt = randomBytes(16).toString('hex');
        const hashedBuffer = scryptSync(newPassword, salt, 64, { N: 16384, r: 16, p: 1, maxmem: 67108864 });
        const hashedPassword = `${salt}:${hashedBuffer.toString('hex')}`;

        // Attempt to update password in accounts table where providerId is 'credential'
        const result = await db
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
            await db.insert(accounts).values({
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

import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, accounts, type User, type NewUser } from '../db/schema/index.js';
import { scryptSync, randomBytes } from 'crypto';

/**
 * User Service - handles user-related operations
 */
export class UserService {
    /**
     * Get all users
     */
    async findAll(): Promise<User[]> {
        return db.select().from(users);
    }

    /**
     * Get user by ID
     */
    async findById(id: string): Promise<User | undefined> {
        const [user] = await db.select().from(users).where(eq(users.id, id));
        return user;
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
        // Hash password using scrypt (same format as Better Auth)
        const salt = randomBytes(16).toString('hex');
        const hashedBuffer = scryptSync(newPassword, salt, 64, { N: 16384, r: 16, p: 1, maxmem: 67108864 });
        const hashedPassword = `${salt}:${hashedBuffer.toString('hex')}`;

        // Update password in accounts table where providerId is 'credential'
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

        return result.length > 0;
    }
}

// Export singleton instance
export const userService = new UserService();

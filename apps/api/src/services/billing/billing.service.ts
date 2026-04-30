import { and, asc, desc, eq, ilike, inArray, isNull, lte, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
    packages, customers, subscriptions, invoices, payments,
    billingRouterSettings,
    type Package, type NewPackage,
    type Customer, type NewCustomer,
    type Subscription, type NewSubscription,
    type Invoice, type Payment,
} from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import { encrypt, decrypt } from '../../lib/encryption.js';
import { routerActionService } from '../router-action.service.js';
import {
    addPppSecret, updatePppSecret, deletePppSecret, kickPppSession,
    getPppSecretByName,
} from '../../lib/mikrotik/billing.js';
import {
    generateInvoiceNumber, generateCustomerCode, computeNextDueAt,
    defaultPinForCustomer, buildSubscriptionComment, computeIsolirDate,
} from './billing-helpers.js';

/**
 * Run fn(api), retry once on MikroTik timeout with a FRESH connection.
 * Stale connections in the pool sometimes time out for 30s on first command;
 * a re-acquire forces a new socket and the second attempt typically succeeds.
 */
async function withFreshConnRetry<T>(routerId: string, fn: (api: any) => Promise<T>): Promise<T> {
    try {
        const api = await routerActionService.getRouterConnection(routerId);
        return await fn(api);
    } catch (e: any) {
        const msg = String(e?.message || '');
        if (!msg.includes('timed out')) throw e;
        logger.warn({ err: msg, routerId }, 'mikrotik command timed out, retrying with fresh connection');
        await new Promise(r => setTimeout(r, 500));
        const api2 = await routerActionService.getRouterConnection(routerId);
        return await fn(api2);
    }
}

/**
 * Billing service — Phase B.1 core operations.
 *
 * Covers:
 *   • Package CRUD
 *   • Customer CRUD (auto-code, PIN derivation)
 *   • Subscription CRUD (push to MikroTik PPP secret)
 *   • Subscription isolir/unisolir (profile change + kick session)
 *   • Invoice list + manual create + mark-paid + payment recording
 *
 * Hotspot voucher generation lives in a separate service (Phase C). The
 * subscription service handles ONLY recurring subscriptions for now —
 * voucher batches are generated through voucher.service.ts when ready.
 *
 * MikroTik writes go through routerActionService.getRouterConnection so we
 * reuse its connection pool + RoMON support.
 */

// ─── Packages ──────────────────────────────────────────────────────────────

export const packageService = {
    async list(tenantId: string, filter: { type?: 'pppoe' | 'hotspot'; routerId?: string; active?: boolean } = {}) {
        const conds = [eq(packages.tenantId, tenantId)];
        if (filter.type) conds.push(eq(packages.type, filter.type));
        if (filter.routerId) conds.push(eq(packages.routerId, filter.routerId));
        if (filter.active !== undefined) conds.push(eq(packages.active, filter.active));
        return db.select().from(packages).where(and(...conds)).orderBy(asc(packages.name));
    },
    async findById(id: string, tenantId: string) {
        const [row] = await db.select().from(packages)
            .where(and(eq(packages.id, id), eq(packages.tenantId, tenantId))).limit(1);
        return row || null;
    },
    async create(tenantId: string, input: Omit<NewPackage, 'tenantId'>): Promise<Package> {
        const [row] = await db.insert(packages).values({ ...input, tenantId }).returning();
        return row;
    },
    async update(id: string, tenantId: string, patch: Partial<NewPackage>): Promise<Package | null> {
        const [row] = await db.update(packages)
            .set({ ...patch, updatedAt: new Date() })
            .where(and(eq(packages.id, id), eq(packages.tenantId, tenantId)))
            .returning();
        return row || null;
    },
    async delete(id: string, tenantId: string): Promise<boolean> {
        const r = await db.delete(packages)
            .where(and(eq(packages.id, id), eq(packages.tenantId, tenantId)));
        return (r as any).rowCount > 0;
    },
};

// ─── Customers ─────────────────────────────────────────────────────────────

export const customerService = {
    async list(tenantId: string, filter: { search?: string; active?: boolean; limit?: number; offset?: number } = {}) {
        const conds = [eq(customers.tenantId, tenantId)];
        if (filter.active !== undefined) conds.push(eq(customers.active, filter.active));
        if (filter.search) {
            conds.push(or(
                ilike(customers.name, `%${filter.search}%`),
                ilike(customers.code, `%${filter.search}%`),
                ilike(customers.phone, `%${filter.search}%`)
            )!);
        }
        return db.select().from(customers).where(and(...conds))
            .orderBy(asc(customers.name))
            .limit(filter.limit ?? 200)
            .offset(filter.offset ?? 0);
    },
    async findById(id: string, tenantId: string) {
        const [row] = await db.select().from(customers)
            .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId))).limit(1);
        return row || null;
    },
    async create(tenantId: string, input: Omit<NewCustomer, 'tenantId' | 'code' | 'pinCode'> & { code?: string; pinCode?: string }): Promise<Customer> {
        const code = input.code || await generateCustomerCode(tenantId);
        const pinCode = input.pinCode || defaultPinForCustomer({ phone: input.phone, code });
        const [row] = await db.insert(customers).values({
            ...input, tenantId, code, pinCode,
        }).returning();
        return row;
    },
    async update(id: string, tenantId: string, patch: Partial<NewCustomer>): Promise<Customer | null> {
        const [row] = await db.update(customers)
            .set({ ...patch, updatedAt: new Date() })
            .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
            .returning();
        return row || null;
    },
    async delete(id: string, tenantId: string): Promise<boolean> {
        const r = await db.delete(customers)
            .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)));
        return (r as any).rowCount > 0;
    },
    /** /cekstatus + /member portal lookup */
    async findByIdentityAndPin(identity: string, pin: string, tenantId?: string) {
        // Identity may match either customers.code or subscriptions.mikrotikIdentity.
        // PIN must match customers.pinCode.
        const subRows = await db.select({ sub: subscriptions, cust: customers })
            .from(subscriptions)
            .innerJoin(customers, eq(customers.id, subscriptions.customerId))
            .where(and(
                eq(subscriptions.mikrotikIdentity, identity),
                eq(customers.pinCode, pin),
                ...(tenantId ? [eq(customers.tenantId, tenantId)] : []),
            ))
            .limit(1);
        if (subRows[0]) return subRows[0];
        // fallback: lookup by customer code
        const [byCode] = await db.select().from(customers)
            .where(and(
                eq(customers.code, identity),
                eq(customers.pinCode, pin),
                ...(tenantId ? [eq(customers.tenantId, tenantId)] : []),
            )).limit(1);
        return byCode ? { sub: null, cust: byCode } : null;
    },
};

// ─── Subscriptions ─────────────────────────────────────────────────────────

export const subscriptionService = {
    async list(tenantId: string, filter: { customerId?: string; routerId?: string; status?: string } = {}) {
        const conds = [eq(subscriptions.tenantId, tenantId)];
        if (filter.customerId) conds.push(eq(subscriptions.customerId, filter.customerId));
        if (filter.routerId) conds.push(eq(subscriptions.routerId, filter.routerId));
        if (filter.status) conds.push(eq(subscriptions.status, filter.status as any));
        return db.select().from(subscriptions).where(and(...conds))
            .orderBy(desc(subscriptions.activatedAt));
    },

    async findById(id: string, tenantId: string) {
        const [row] = await db.select().from(subscriptions)
            .where(and(eq(subscriptions.id, id), eq(subscriptions.tenantId, tenantId))).limit(1);
        return row || null;
    },

    /**
     * Create subscription + push PPP secret to MikroTik. The plaintext password
     * is encrypted at rest. If MikroTik push fails, the local row is deleted to
     * avoid orphaned billing records.
     */
    async create(tenantId: string, input: {
        customerId: string;
        packageId: string;
        routerId: string;
        mikrotikIdentity: string;
        plainPassword: string;
        billingDay?: number;
        activateNow?: boolean;
    }): Promise<Subscription> {
        const pkg = await packageService.findById(input.packageId, tenantId);
        if (!pkg) throw new Error('Package not found');

        const billingDay = input.billingDay ?? 1;
        const now = new Date();
        const activatedAt = input.activateNow !== false ? now : null;
        const nextDueAt = pkg.cycleType === 'monthly' ? computeNextDueAt(billingDay, now) : null;

        const [row] = await db.insert(subscriptions).values({
            tenantId,
            customerId: input.customerId,
            packageId: input.packageId,
            routerId: input.routerId,
            type: pkg.type,
            mikrotikIdentity: input.mikrotikIdentity,
            mikrotikPasswordEncrypted: encrypt(input.plainPassword),
            billingDay,
            activatedAt,
            nextDueAt,
            status: 'active',
        }).returning();

        // Push to MikroTik. If a secret with the same name already exists,
        // ADOPT it instead of erroring — this is the common path for operators
        // migrating from a router that already has hundreds of customers.
        if (pkg.type === 'pppoe') {
            try {
                // Look up router settings for grace days (used to compute isolir date)
                const { db: _db } = await import('../../db/index.js');
                const { billingRouterSettings } = await import('../../db/schema/index.js');
                const [settings] = await _db.select().from(billingRouterSettings)
                    .where(eq(billingRouterSettings.routerId, input.routerId)).limit(1);
                const graceDays = settings?.isolirGraceDays ?? 0;
                const isolirDate = computeIsolirDate(nextDueAt, graceDays);
                const comment = buildSubscriptionComment({
                    subscriptionId: row.id,
                    isolirDate,
                    packageName: pkg.name,
                });

                await withFreshConnRetry(input.routerId, async (api) => {
                    const existing = await getPppSecretByName(api, input.mikrotikIdentity);
                    if (existing) {
                        await updatePppSecret(api, existing.id, {
                            profile: pkg.mikrotikProfile,
                            comment,
                            // Only push password when operator typed something AND it differs.
                            // If RouterOS hides existing.password, treat operator's input as
                            // authoritative when non-empty.
                            ...(input.plainPassword && existing.password !== input.plainPassword
                                ? { password: input.plainPassword } : {}),
                        });
                        logger.info({ subId: row.id, name: input.mikrotikIdentity }, 'Adopted existing PPP secret');
                    } else {
                        await addPppSecret(api, {
                            name: input.mikrotikIdentity,
                            password: input.plainPassword,
                            profile: pkg.mikrotikProfile,
                            service: 'pppoe',
                            comment,
                        });
                    }
                });
            } catch (err: any) {
                logger.error({ err: err?.message, subId: row.id }, 'Failed to push/adopt PPP secret — rolling back');
                await db.delete(subscriptions).where(eq(subscriptions.id, row.id));
                throw err;
            }
        }
        // Hotspot subscription provisioning is delegated to voucher.service.ts.

        return row;
    },

    /**
     * Update mikrotik fields (profile/password) along with local row. Useful
     * for upgrades/downgrades. Sends MikroTik write only when something
     * relevant changes.
     */
    async update(id: string, tenantId: string, patch: {
        packageId?: string;
        plainPassword?: string;
        billingDay?: number;
        status?: 'active' | 'isolir' | 'expired' | 'cancelled' | 'suspended';
        statusReason?: string;
    }): Promise<Subscription | null> {
        const sub = await subscriptionService.findById(id, tenantId);
        if (!sub) return null;

        const updates: any = { updatedAt: new Date() };
        let newProfile: string | undefined;

        if (patch.packageId && patch.packageId !== sub.packageId) {
            const pkg = await packageService.findById(patch.packageId, tenantId);
            if (!pkg) throw new Error('Package not found');
            if (pkg.type !== sub.type) throw new Error('Cannot change subscription between PPPoE and Hotspot');
            updates.packageId = patch.packageId;
            newProfile = pkg.mikrotikProfile;
        }
        if (patch.plainPassword) updates.mikrotikPasswordEncrypted = encrypt(patch.plainPassword);
        if (patch.billingDay !== undefined) updates.billingDay = patch.billingDay;
        if (patch.status) {
            updates.status = patch.status;
            updates.statusReason = patch.statusReason ?? null;
        }

        const [row] = await db.update(subscriptions)
            .set(updates)
            .where(and(eq(subscriptions.id, id), eq(subscriptions.tenantId, tenantId)))
            .returning();

        if (sub.type === 'pppoe' && (newProfile || patch.plainPassword)) {
            try {
                await withFreshConnRetry(sub.routerId, async (api) => {
                    const secret = await getPppSecretByName(api, sub.mikrotikIdentity);
                    if (secret) {
                        await updatePppSecret(api, secret.id, {
                            profile: newProfile,
                            password: patch.plainPassword,
                        });
                    }
                });
            } catch (err: any) {
                logger.warn({ err: err?.message, subId: id }, 'Subscription update succeeded locally but MikroTik push failed');
            }
        }
        return row;
    },

    /**
     * Move subscription to isolir profile + kick active session so the change
     * takes effect immediately.
     */
    async isolir(id: string, tenantId: string, reason: string = 'overdue invoice'): Promise<Subscription | null> {
        const sub = await subscriptionService.findById(id, tenantId);
        if (!sub) return null;
        if (sub.type !== 'pppoe') return sub; // hotspot uses different mechanism (Phase C)

        const [settings] = await db.select().from(billingRouterSettings)
            .where(eq(billingRouterSettings.routerId, sub.routerId)).limit(1);
        const isolirProfile = settings?.isolirProfile || 'pppoe-isolir';

        try {
            await withFreshConnRetry(sub.routerId, async (api) => {
                const secret = await getPppSecretByName(api, sub.mikrotikIdentity);
                if (secret) {
                    await updatePppSecret(api, secret.id, { profile: isolirProfile });
                    await kickPppSession(api, sub.mikrotikIdentity);
                }
            });
        } catch (err: any) {
            logger.error({ err: err?.message, subId: id }, 'Failed to isolir on MikroTik');
        }

        const [row] = await db.update(subscriptions)
            .set({ status: 'isolir', statusReason: reason, updatedAt: new Date() })
            .where(eq(subscriptions.id, id))
            .returning();

        // Fire WA notification (best-effort, do not block on failure)
        try {
            if (settings?.waNotifIsolirEnabled !== false) {
                const { sendOneOff, buildMessage } = await import('./wa-notification.service.js');
                const [cust] = await db.select().from(customers).where(eq(customers.id, sub.customerId)).limit(1);
                if (cust?.phone) {
                    const message = buildMessage('isolir', { customerName: cust.name });
                    await sendOneOff({
                        tenantId: sub.tenantId, routerId: sub.routerId,
                        customerId: cust.id, subscriptionId: sub.id,
                        type: 'isolir', phone: cust.phone, message,
                    });
                }
            }
        } catch (e: any) {
            logger.warn({ err: e?.message }, 'WA isolir notification failed');
        }

        return row;
    },

    /**
     * Restore subscription to its package's normal profile after payment.
     */
    async unisolir(id: string, tenantId: string): Promise<Subscription | null> {
        const sub = await subscriptionService.findById(id, tenantId);
        if (!sub) return null;
        const pkg = await packageService.findById(sub.packageId, tenantId);
        if (!pkg) return null;

        // Advance the next-due forward one cycle (typically called after payment).
        // Comment on MikroTik gets the new isolir date so the on-router scheduler
        // re-evaluates against the new period.
        const nextDueAt = computeNextDueAt(sub.billingDay || 1, new Date());

        if (sub.type === 'pppoe') {
            try {
                const { db: _db } = await import('../../db/index.js');
                const { billingRouterSettings } = await import('../../db/schema/index.js');
                const [settings] = await _db.select().from(billingRouterSettings)
                    .where(eq(billingRouterSettings.routerId, sub.routerId)).limit(1);
                const graceDays = settings?.isolirGraceDays ?? 0;
                const isolirDate = computeIsolirDate(nextDueAt, graceDays);
                const comment = buildSubscriptionComment({
                    subscriptionId: sub.id,
                    isolirDate,
                    packageName: pkg.name,
                });

                await withFreshConnRetry(sub.routerId, async (api) => {
                    const secret = await getPppSecretByName(api, sub.mikrotikIdentity);
                    if (secret) {
                        await updatePppSecret(api, secret.id, {
                            profile: pkg.mikrotikProfile,
                            comment,
                        });
                        await kickPppSession(api, sub.mikrotikIdentity);
                    }
                });
            } catch (err: any) {
                logger.error({ err: err?.message, subId: id }, 'Failed to unisolir on MikroTik');
            }
        }

        const [row] = await db.update(subscriptions)
            .set({
                status: 'active',
                statusReason: null,
                nextDueAt,
                updatedAt: new Date(),
            })
            .where(eq(subscriptions.id, id))
            .returning();
        return row;
    },

    async delete(id: string, tenantId: string): Promise<boolean> {
        const sub = await subscriptionService.findById(id, tenantId);
        if (!sub) return false;
        if (sub.type === 'pppoe') {
            try {
                await withFreshConnRetry(sub.routerId, async (api) => {
                    const secret = await getPppSecretByName(api, sub.mikrotikIdentity);
                    if (secret) await deletePppSecret(api, secret.id);
                });
            } catch (err: any) {
                logger.warn({ err: err?.message, subId: id }, 'Failed to delete PPP secret on MikroTik');
            }
        }
        const r = await db.delete(subscriptions)
            .where(and(eq(subscriptions.id, id), eq(subscriptions.tenantId, tenantId)));
        return (r as any).rowCount > 0;
    },

    /** Decrypt + return the plaintext PPP password for showing to operator. */
    async revealPassword(id: string, tenantId: string): Promise<string | null> {
        const sub = await subscriptionService.findById(id, tenantId);
        if (!sub?.mikrotikPasswordEncrypted) return null;
        try { return decrypt(sub.mikrotikPasswordEncrypted); }
        catch { return null; }
    },
};

// ─── Invoices ──────────────────────────────────────────────────────────────

export const invoiceService = {
    async list(tenantId: string, filter: { customerId?: string; status?: string; routerId?: string; limit?: number } = {}) {
        const conds = [eq(invoices.tenantId, tenantId)];
        if (filter.customerId) conds.push(eq(invoices.customerId, filter.customerId));
        if (filter.routerId) conds.push(eq(invoices.routerId, filter.routerId));
        if (filter.status) conds.push(eq(invoices.status, filter.status as any));
        return db.select().from(invoices).where(and(...conds))
            .orderBy(desc(invoices.createdAt))
            .limit(filter.limit ?? 200);
    },

    async findById(id: string, tenantId: string) {
        const [row] = await db.select().from(invoices)
            .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId))).limit(1);
        return row || null;
    },

    /**
     * Manual invoice creation (operator triggers it). Auto-numbering, status
     * starts as unpaid, due_at defaults to 7 days from creation.
     */
    async create(tenantId: string, input: {
        customerId: string;
        subscriptionId?: string;
        packageId?: string;
        routerId?: string;
        amount: number | string;
        periodStart?: Date;
        periodEnd?: Date;
        dueAt?: Date;
        notes?: string;
    }): Promise<Invoice> {
        const invoiceNumber = await generateInvoiceNumber(tenantId);
        const dueAt = input.dueAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const [row] = await db.insert(invoices).values({
            tenantId,
            customerId: input.customerId,
            subscriptionId: input.subscriptionId,
            packageId: input.packageId,
            routerId: input.routerId,
            invoiceNumber,
            amount: String(input.amount),
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            dueAt,
            notes: input.notes,
            status: 'unpaid',
        }).returning();
        return row;
    },

    async cancel(id: string, tenantId: string): Promise<Invoice | null> {
        const [row] = await db.update(invoices)
            .set({ status: 'cancelled', updatedAt: new Date() })
            .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)))
            .returning();
        return row || null;
    },

    /**
     * Mark an invoice paid + record the payment + (if subscription was
     * isolir) auto-unisolir.
     */
    async markPaid(id: string, tenantId: string, payment: {
        amount: number | string;
        method: 'manual_cash' | 'manual_transfer' | 'gateway_tripay' | 'gateway_midtrans' | 'gateway_xendit';
        gatewayTxnId?: string;
        gatewayPayload?: any;
        recordedBy?: string;
        notes?: string;
    }): Promise<{ invoice: Invoice; payment: Payment } | null> {
        const inv = await invoiceService.findById(id, tenantId);
        if (!inv) return null;

        return db.transaction(async (tx) => {
            const [pay] = await tx.insert(payments).values({
                tenantId,
                invoiceId: id,
                amount: String(payment.amount),
                method: payment.method,
                gatewayTxnId: payment.gatewayTxnId,
                gatewayPayload: payment.gatewayPayload,
                recordedBy: payment.recordedBy,
                notes: payment.notes,
            }).returning();

            const [updatedInv] = await tx.update(invoices)
                .set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() })
                .where(eq(invoices.id, id))
                .returning();

            return { invoice: updatedInv, payment: pay };
        }).then(async (result) => {
            if (inv.subscriptionId) {
                const sub = await subscriptionService.findById(inv.subscriptionId, tenantId);
                if (sub?.status === 'isolir') {
                    await subscriptionService.unisolir(sub.id, tenantId);
                }
            }

            // Payment received WA notification (best-effort)
            try {
                const { sendOneOff, buildMessage } = await import('./wa-notification.service.js');
                const [cust] = await db.select().from(customers).where(eq(customers.id, inv.customerId)).limit(1);
                if (cust?.phone && inv.routerId) {
                    const message = buildMessage('payment_received', {
                        customerName: cust.name,
                        invoiceNumber: inv.invoiceNumber,
                        amount: payment.amount,
                    });
                    await sendOneOff({
                        tenantId, routerId: inv.routerId,
                        customerId: cust.id, subscriptionId: inv.subscriptionId,
                        invoiceId: inv.id,
                        type: 'payment_received', phone: cust.phone, message,
                    });
                }
            } catch (e: any) {
                logger.warn({ err: e?.message }, 'WA payment notification failed');
            }

            return result;
        });
    },
};

// ─── Settings ──────────────────────────────────────────────────────────────

export const billingSettingsService = {
    async getForRouter(routerId: string, tenantId: string) {
        const [row] = await db.select().from(billingRouterSettings)
            .where(and(eq(billingRouterSettings.routerId, routerId), eq(billingRouterSettings.tenantId, tenantId)))
            .limit(1);
        return row || null;
    },
    async upsert(routerId: string, tenantId: string, patch: any) {
        const existing = await billingSettingsService.getForRouter(routerId, tenantId);
        if (existing) {
            const [row] = await db.update(billingRouterSettings)
                .set({ ...patch, updatedAt: new Date() })
                .where(eq(billingRouterSettings.id, existing.id))
                .returning();
            return row;
        }
        const [row] = await db.insert(billingRouterSettings).values({
            tenantId, routerId, ...patch,
        }).returning();
        return row;
    },
};

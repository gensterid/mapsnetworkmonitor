import { and, eq, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
    vouchers, voucherBatches, packages, billingRouterSettings,
    type Voucher, type VoucherBatch,
} from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import { routerActionService } from '../router-action.service.js';
import {
    addHotspotUser, deleteHotspotUser, kickHotspotSession, getHotspotUsers,
    type HotspotUser,
} from '../../lib/mikrotik/billing.js';
import { parseMikhmonComment } from './mikhmon-parser.js';

/**
 * Hotspot voucher service — Phase C.
 *
 * Two operating modes per router (selected via billing_router_settings.hotspotMode):
 *
 *  • native         — vouchers are pre-generated in our DB and pushed to MikroTik
 *                     /ip/hotspot/user. Status (unused/active/expired) lives here.
 *
 *  • mikhmon_bridge — vouchers are read straight from MikroTik /ip/hotspot/user.
 *                     Comment parsed with Mikhmon legacy format
 *                     (`vc-NNN-mm.dd.yy-note`). No DB writes.
 *
 * Voucher code generation follows Mikhmon v3 conventions: length 3-8, char set
 * (lower/upper/upplow/mix/mix1/mix2/num), mode 'vc' (code == password) or
 * 'up' (separate code & password).
 */

// ─── Code generator ────────────────────────────────────────────────────────

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';

export type CharsetMode = 'lower' | 'upper' | 'upplow' | 'mix' | 'mix1' | 'mix2' | 'num';
export type VoucherMode = 'vc' | 'up';

function pickChars(mode: CharsetMode, length: number): string {
    let pool: string;
    switch (mode) {
        case 'lower':  pool = LOWER; break;
        case 'upper':  pool = UPPER; break;
        case 'upplow': pool = LOWER + UPPER; break;
        case 'mix':    pool = LOWER + UPPER + DIGITS; break;
        case 'mix1':   pool = LOWER + DIGITS; break;
        case 'mix2':   pool = UPPER + DIGITS; break;
        case 'num':    pool = DIGITS; break;
        default:       pool = DIGITS;
    }
    let out = '';
    for (let i = 0; i < length; i++) out += pool[Math.floor(Math.random() * pool.length)];
    return out;
}

export function generateVoucherCode(mode: CharsetMode, length: number): string {
    return pickChars(mode, Math.max(3, Math.min(12, length)));
}

export function generateMikhmonComment(mode: VoucherMode, note: string = ''): string {
    const rand = String(100 + Math.floor(Math.random() * 900));
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${mode}-${rand}-${m}.${dd}.${yy}-${note}`;
}

// ─── Service ───────────────────────────────────────────────────────────────

export const voucherService = {
    async listNative(tenantId: string, filter: { routerId?: string; status?: string; batchId?: string; limit?: number } = {}) {
        const conds = [eq(vouchers.tenantId, tenantId)];
        if (filter.routerId) conds.push(eq(vouchers.routerId, filter.routerId));
        if (filter.status) conds.push(eq(vouchers.status, filter.status as any));
        if (filter.batchId) conds.push(eq(vouchers.batchId, filter.batchId));
        return db.select().from(vouchers).where(and(...conds))
            .orderBy(desc(vouchers.createdAt))
            .limit(filter.limit ?? 500);
    },

    /**
     * Read vouchers from a MikroTik router directly (Mikhmon bridge mode).
     * Parses each user's comment as Mikhmon legacy format and projects to a
     * voucher-like shape compatible with the operator UI.
     */
    async listBridge(routerId: string): Promise<Array<{
        code: string;
        profile: string | null;
        password: string | null;
        comment: string | null;
        generatedAt: Date | null;
        billingPeriod: string | null;
        bytesIn: number;
        bytesOut: number;
        uptime: string | null;
        disabled: boolean;
        source: 'mikhmon_bridge';
    }>> {
        const api = await routerActionService.getRouterConnection(routerId);
        const users = await getHotspotUsers(api);
        return users.map((u: HotspotUser) => {
            const parsed = parseMikhmonComment(u.comment);
            const generatedAtRaw = parsed?.extras?.generatedAt;
            return {
                code: u.name,
                profile: u.profile ?? null,
                password: u.password ?? null,
                comment: u.comment ?? null,
                generatedAt: generatedAtRaw ? new Date(generatedAtRaw) : null,
                billingPeriod: parsed?.billingPeriod ?? null,
                bytesIn: parseInt(String(u.bytesIn ?? '0'), 10) || 0,
                bytesOut: parseInt(String(u.bytesOut ?? '0'), 10) || 0,
                uptime: u.uptime ?? null,
                disabled: u.disabled,
                source: 'mikhmon_bridge' as const,
            };
        });
    },

    /**
     * Smart list: dispatch to native or bridge based on per-router settings.
     */
    async listForRouter(tenantId: string, routerId: string) {
        const [settings] = await db.select().from(billingRouterSettings)
            .where(eq(billingRouterSettings.routerId, routerId)).limit(1);
        const mode = settings?.hotspotMode || 'disabled';
        if (mode === 'mikhmon_bridge') {
            const bridgeRows = await voucherService.listBridge(routerId);
            return { mode, items: bridgeRows };
        }
        if (mode === 'native') {
            const items = await voucherService.listNative(tenantId, { routerId });
            return { mode, items };
        }
        return { mode: 'disabled', items: [] };
    },

    async getBatch(id: string, tenantId: string): Promise<VoucherBatch | null> {
        const [row] = await db.select().from(voucherBatches)
            .where(and(eq(voucherBatches.id, id), eq(voucherBatches.tenantId, tenantId))).limit(1);
        return row || null;
    },

    async listBatches(tenantId: string, filter: { routerId?: string; limit?: number } = {}) {
        const conds = [eq(voucherBatches.tenantId, tenantId)];
        if (filter.routerId) conds.push(eq(voucherBatches.routerId, filter.routerId));
        return db.select().from(voucherBatches).where(and(...conds))
            .orderBy(desc(voucherBatches.generatedAt))
            .limit(filter.limit ?? 100);
    },

    /**
     * Generate N vouchers for a package and push each to MikroTik.
     *
     * Failure handling: if the MikroTik push fails for one voucher, that
     * voucher is rolled back from the DB but the rest of the batch
     * continues. Caller receives a partial-success report.
     */
    /**
     * Generate satu voucher tanpa batch (untuk online purchase flow).
     * Berbeda dari generateBatch: tidak buat voucher_batch row, dipakai langsung
     * dari voucher_purchases.fulfill().
     *
     * Default code = lowercase 6 char, mode='vc' (code juga password).
     * Boleh override via opts kalau perlu.
     */
    async generateOne(input: {
        tenantId: string;
        routerId: string;
        packageId: string;
        codeMode?: VoucherMode;
        charsetMode?: CharsetMode;
        codeLength?: number;
        prefix?: string;
        note?: string;
        /** Retry attempts kalau code collision (default 5) */
        maxRetries?: number;
    }): Promise<Voucher> {
        const codeMode: VoucherMode = input.codeMode || 'vc';
        const charsetMode: CharsetMode = input.charsetMode || 'lower';
        const codeLength = input.codeLength || 6;
        const maxRetries = input.maxRetries ?? 5;

        const [pkg] = await db.select().from(packages)
            .where(and(eq(packages.id, input.packageId), eq(packages.tenantId, input.tenantId))).limit(1);
        if (!pkg) throw new Error('Package not found');
        if (pkg.type !== 'hotspot') throw new Error('Package is not a hotspot package');

        const api = await routerActionService.getRouterConnection(input.routerId);

        let limitUptime: string | undefined;
        if (pkg.cycleType === 'duration' && pkg.cycleValue > 0) {
            limitUptime = `${pkg.cycleValue}s`;
        }

        let lastErr: any = null;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const code = (input.prefix || '') + generateVoucherCode(charsetMode, codeLength);
            const password = codeMode === 'vc' ? code : generateVoucherCode(charsetMode, codeLength);
            const comment = generateMikhmonComment(codeMode, input.note || pkg.name);

            let voucherRow: Voucher | null = null;
            try {
                const [row] = await db.insert(vouchers).values({
                    tenantId: input.tenantId,
                    routerId: input.routerId,
                    packageId: input.packageId,
                    batchId: null,
                    code,
                    pinCode: codeMode === 'up' ? password : null,
                    profile: pkg.mikrotikProfile,
                    price: pkg.price,
                    expiresAt: null,
                    status: 'unused',
                }).returning();
                voucherRow = row;
            } catch (err: any) {
                if (String(err?.message || '').includes('unique')) {
                    lastErr = err;
                    continue;
                }
                throw err;
            }

            try {
                await addHotspotUser(api, {
                    name: code,
                    password,
                    profile: pkg.mikrotikProfile,
                    limitUptime,
                    comment,
                });
                return voucherRow;
            } catch (err: any) {
                logger.warn({ err: err?.message, code }, 'voucher push to MikroTik failed — rolling back local row');
                await db.delete(vouchers).where(eq(vouchers.id, voucherRow.id));
                throw new Error(`Push voucher ke MikroTik gagal: ${err?.message || 'unknown'}`);
            }
        }
        throw new Error(`Generate voucher gagal setelah ${maxRetries} percobaan (code collision): ${lastErr?.message || 'unknown'}`);
    },

    async generateBatch(input: {
        tenantId: string;
        routerId: string;
        packageId: string;
        count: number;
        codeMode: VoucherMode;
        charsetMode: CharsetMode;
        codeLength: number;
        prefix?: string;
        note?: string;
        generatedBy?: string;
    }): Promise<{ batch: VoucherBatch; created: number; failed: number; vouchers: Voucher[] }> {
        const { tenantId, routerId, packageId, count } = input;
        if (count < 1 || count > 500) throw new Error('count must be 1..500');

        const [pkg] = await db.select().from(packages)
            .where(and(eq(packages.id, packageId), eq(packages.tenantId, tenantId))).limit(1);
        if (!pkg) throw new Error('Package not found');
        if (pkg.type !== 'hotspot') throw new Error('Package is not a hotspot package');

        const [batch] = await db.insert(voucherBatches).values({
            tenantId, routerId, packageId,
            count,
            prefix: input.prefix,
            notes: input.note,
            generatedBy: input.generatedBy,
        }).returning();

        const api = await routerActionService.getRouterConnection(routerId);

        const created: Voucher[] = [];
        let failed = 0;

        // Optional limit-uptime mapping: for duration packages, push as MikroTik
        // limit-uptime so the user is auto-disconnected after the duration.
        let limitUptime: string | undefined;
        if (pkg.cycleType === 'duration' && pkg.cycleValue > 0) {
            // RouterOS accepts e.g. "1d", "12h", "30m". We pass seconds form
            // e.g. "3600s" which RouterOS normalises.
            limitUptime = `${pkg.cycleValue}s`;
        }

        for (let i = 0; i < count; i++) {
            const code = (input.prefix || '') + generateVoucherCode(input.charsetMode, input.codeLength);
            const password = input.codeMode === 'vc' ? code : generateVoucherCode(input.charsetMode, input.codeLength);
            const comment = generateMikhmonComment(input.codeMode, input.note || pkg.name);

            // Insert local row first (uniqueness enforced via unique index on
            // router_id + code). On conflict, retry with a fresh code.
            let voucherRow: Voucher | null = null;
            try {
                const [row] = await db.insert(vouchers).values({
                    tenantId, routerId, packageId,
                    batchId: batch.id,
                    code, pinCode: input.codeMode === 'up' ? password : null,
                    profile: pkg.mikrotikProfile,
                    price: pkg.price,
                    expiresAt: null,
                    status: 'unused',
                }).returning();
                voucherRow = row;
            } catch (err: any) {
                if (String(err?.message || '').includes('unique')) {
                    failed++;
                    continue; // collision, skip
                }
                logger.warn({ err: err?.message, code }, 'voucher insert failed');
                failed++;
                continue;
            }

            try {
                await addHotspotUser(api, {
                    name: code,
                    password,
                    profile: pkg.mikrotikProfile,
                    limitUptime,
                    comment,
                });
                created.push(voucherRow);
            } catch (err: any) {
                logger.warn({ err: err?.message, code }, 'voucher push to MikroTik failed — rolling back local row');
                await db.delete(vouchers).where(eq(vouchers.id, voucherRow.id));
                failed++;
            }
        }

        return { batch, created: created.length, failed, vouchers: created };
    },

    async deleteVoucher(id: string, tenantId: string): Promise<boolean> {
        const [v] = await db.select().from(vouchers)
            .where(and(eq(vouchers.id, id), eq(vouchers.tenantId, tenantId))).limit(1);
        if (!v) return false;

        try {
            const api = await routerActionService.getRouterConnection(v.routerId);
            const users = await getHotspotUsers(api);
            const u = users.find(x => x.name === v.code);
            if (u) {
                await deleteHotspotUser(api, u.id);
                await kickHotspotSession(api, v.code);
            }
        } catch (err: any) {
            logger.warn({ err: err?.message, code: v.code }, 'delete hotspot user on MikroTik failed (continuing local delete)');
        }

        await db.delete(vouchers).where(eq(vouchers.id, id));
        return true;
    },

    async deleteBatch(batchId: string, tenantId: string): Promise<{ deleted: number }> {
        const list = await voucherService.listNative(tenantId, { batchId });
        let deleted = 0;
        for (const v of list) {
            const ok = await voucherService.deleteVoucher(v.id, tenantId);
            if (ok) deleted++;
        }
        await db.delete(voucherBatches).where(and(eq(voucherBatches.id, batchId), eq(voucherBatches.tenantId, tenantId)));
        return { deleted };
    },

    async markPrinted(batchId: string, tenantId: string): Promise<void> {
        await db.update(vouchers)
            .set({ printedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(vouchers.batchId, batchId), eq(vouchers.tenantId, tenantId)));
    },
};

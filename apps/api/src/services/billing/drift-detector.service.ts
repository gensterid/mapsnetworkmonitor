import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
    subscriptions, packages, billingRouterSettings, routers,
    type Subscription, type Package,
} from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import { routerActionService } from '../router-action.service.js';
import {
    getPppSecrets, updatePppSecret, kickPppSession,
    type PppSecret,
} from '../../lib/mikrotik/billing.js';
import {
    buildSubscriptionComment, computeIsolirDate,
} from './billing-helpers.js';
import { auditRepository } from '../../repositories/audit.repository.js';

/**
 * Drift Detector — Phase 7 MVP.
 *
 * Tujuan: deteksi inkonsistensi state PPPoE antara DB aplikasi dan MikroTik.
 * Skenario tipikal: aplikasi down, operator edit langsung di Winbox sebagai
 * emergency. Saat app naik, drift detector menemukan PPP secret yang
 * comment / profile / disabled-nya tidak sesuai dengan DB.
 *
 * Asumsi: DB = system of record. Resync default = push DB → MikroTik.
 * Operator tetap pegang kontrol via UI (tidak auto-apply).
 *
 * Scope MVP: PPPoE only (hotspot pakai mekanisme lain). Orphan + bulk
 * lanjut di phase 7.1.
 */

export type DriftField = 'profile' | 'comment' | 'disabled' | 'missing';

export interface DriftItem {
    subscriptionId: string;
    routerId: string;
    routerName?: string;
    customerId: string;
    customerName?: string;
    mikrotikIdentity: string;
    subscriptionStatus: 'active' | 'isolir' | 'expired' | 'cancelled' | 'suspended';
    driftFields: DriftField[];
    expected: {
        profile: string;
        comment: string;
        disabled: boolean;
    };
    actual: {
        profile?: string;
        comment?: string;
        disabled?: boolean;
        exists: boolean;
    };
}

export interface DriftReport {
    scannedAt: string;
    routersScanned: number;
    routersFailed: { routerId: string; routerName?: string; error: string }[];
    subscriptionsChecked: number;
    items: DriftItem[];
}

interface CachedSummary {
    count: number;
    scannedAt: string;
    routersFailed: number;
}

/** In-memory cache (per process). Updated tiap scan. */
const summaryByTenant = new Map<string, CachedSummary>();

function normalizeComment(s: string | undefined | null): string {
    return (s || '').trim().replace(/\s+/g, ' ');
}

function computeExpectedFor(sub: Subscription, pkg: Package, isolirProfileSetting: string, graceDays: number): DriftItem['expected'] {
    const isIsolir = sub.status === 'isolir';
    const profile = isIsolir ? isolirProfileSetting : pkg.mikrotikProfile;
    const isolirDate = computeIsolirDate(sub.nextDueAt, graceDays);
    const comment = buildSubscriptionComment({
        subscriptionId: sub.id,
        isolirDate,
        packageName: pkg.name,
    });
    const disabled = sub.status === 'cancelled' || sub.status === 'suspended';
    return { profile, comment, disabled };
}

function compareSecret(expected: DriftItem['expected'], secret: PppSecret | undefined): DriftField[] {
    if (!secret) return ['missing'];
    const fields: DriftField[] = [];
    if ((secret.profile || '') !== expected.profile) fields.push('profile');
    if (normalizeComment(secret.comment) !== normalizeComment(expected.comment)) fields.push('comment');
    if (Boolean(secret.disabled) !== expected.disabled) fields.push('disabled');
    return fields;
}

export const driftDetectorService = {
    /**
     * Scan all PPPoE subscriptions in given tenant. Per-router grouping —
     * 1 query /ppp/secret/print per router, in-memory comparator.
     */
    async scan(tenantId: string): Promise<DriftReport> {
        const t0 = Date.now();
        const rows = await db.select({
            sub: subscriptions,
            pkg: packages,
            router: routers,
            settings: billingRouterSettings,
        })
            .from(subscriptions)
            .innerJoin(packages, eq(packages.id, subscriptions.packageId))
            .innerJoin(routers, eq(routers.id, subscriptions.routerId))
            .leftJoin(billingRouterSettings, eq(billingRouterSettings.routerId, subscriptions.routerId))
            .where(and(
                eq(subscriptions.tenantId, tenantId),
                eq(subscriptions.type, 'pppoe'),
                inArray(subscriptions.status, ['active', 'isolir']),
                isNotNull(subscriptions.mikrotikIdentity),
            ));

        const byRouter = new Map<string, typeof rows>();
        for (const r of rows) {
            const list = byRouter.get(r.sub.routerId) || [];
            list.push(r);
            byRouter.set(r.sub.routerId, list);
        }

        const report: DriftReport = {
            scannedAt: new Date().toISOString(),
            routersScanned: 0,
            routersFailed: [],
            subscriptionsChecked: 0,
            items: [],
        };

        for (const [routerId, routerRows] of byRouter) {
            const routerName = routerRows[0]?.router?.name;
            let secrets: PppSecret[] = [];
            try {
                const api = await routerActionService.getRouterConnection(routerId, tenantId);
                secrets = await getPppSecrets(api);
                report.routersScanned++;
            } catch (err: any) {
                report.routersFailed.push({
                    routerId, routerName,
                    error: err?.message || 'connection failed',
                });
                continue;
            }

            const secretByName = new Map<string, PppSecret>();
            for (const s of secrets) secretByName.set(s.name, s);

            for (const { sub, pkg, settings, router } of routerRows) {
                report.subscriptionsChecked++;
                const isolirProfileSetting = settings?.isolirProfile || 'pppoe-isolir';
                const graceDays = settings?.isolirGraceDays ?? 0;
                const expected = computeExpectedFor(sub, pkg, isolirProfileSetting, graceDays);
                const secret = secretByName.get(sub.mikrotikIdentity);
                const fields = compareSecret(expected, secret);
                if (fields.length === 0) continue;

                report.items.push({
                    subscriptionId: sub.id,
                    routerId,
                    routerName: router?.name,
                    customerId: sub.customerId,
                    mikrotikIdentity: sub.mikrotikIdentity,
                    subscriptionStatus: sub.status as any,
                    driftFields: fields,
                    expected,
                    actual: secret
                        ? { profile: secret.profile, comment: secret.comment, disabled: secret.disabled, exists: true }
                        : { exists: false },
                });
            }
        }

        // Hydrate customer names — single query
        if (report.items.length) {
            const ids = [...new Set(report.items.map(i => i.customerId))];
            const { customers } = await import('../../db/schema/index.js');
            const custRows = await db.select({ id: customers.id, name: customers.name })
                .from(customers)
                .where(inArray(customers.id, ids));
            const nameById = new Map(custRows.map(c => [c.id, c.name]));
            for (const item of report.items) item.customerName = nameById.get(item.customerId);
        }

        summaryByTenant.set(tenantId, {
            count: report.items.length,
            scannedAt: report.scannedAt,
            routersFailed: report.routersFailed.length,
        });

        logger.info({
            tenantId,
            durationMs: Date.now() - t0,
            checked: report.subscriptionsChecked,
            drift: report.items.length,
            routersFailed: report.routersFailed.length,
        }, 'Drift scan done');

        return report;
    },

    /**
     * Quick summary — count cached drift untuk badge UI. Tidak trigger scan.
     */
    summary(tenantId: string): CachedSummary | null {
        return summaryByTenant.get(tenantId) || null;
    },

    /**
     * Push DB state ke MikroTik untuk 1 subscription. Idempotent.
     * - update profile + comment + disabled sesuai expected
     * - kalau secret tidak ada di router: NOT auto-create di MVP (return error)
     * - kick session HANYA kalau profile berubah dari ISOLIR ke active (atau sebaliknya)
     *   supaya customer langsung kena rate-limit baru.
     */
    async resyncToMikrotik(tenantId: string, subscriptionId: string, opts: { actorUserId?: string | null; kickSession?: boolean } = {}): Promise<{
        ok: boolean;
        applied: DriftField[];
        message?: string;
    }> {
        const rows = await db.select({
            sub: subscriptions,
            pkg: packages,
            settings: billingRouterSettings,
        })
            .from(subscriptions)
            .innerJoin(packages, eq(packages.id, subscriptions.packageId))
            .leftJoin(billingRouterSettings, eq(billingRouterSettings.routerId, subscriptions.routerId))
            .where(and(
                eq(subscriptions.id, subscriptionId),
                eq(subscriptions.tenantId, tenantId),
            ))
            .limit(1);
        const row = rows[0];
        if (!row) return { ok: false, applied: [], message: 'Subscription not found' };

        const { sub, pkg, settings } = row;
        if (sub.type !== 'pppoe') return { ok: false, applied: [], message: 'Drift resync hanya untuk PPPoE' };

        const isolirProfileSetting = settings?.isolirProfile || 'pppoe-isolir';
        const graceDays = settings?.isolirGraceDays ?? 0;
        const expected = computeExpectedFor(sub, pkg, isolirProfileSetting, graceDays);

        try {
            const api = await routerActionService.getRouterConnection(sub.routerId, tenantId);
            const secrets = await getPppSecrets(api);
            const secret = secrets.find(s => s.name === sub.mikrotikIdentity);
            if (!secret) {
                return {
                    ok: false, applied: [],
                    message: `PPP secret '${sub.mikrotikIdentity}' tidak ada di router. Buat manual atau via tombol Add Secret.`,
                };
            }
            const fieldsBefore = compareSecret(expected, secret);
            if (fieldsBefore.length === 0) {
                return { ok: true, applied: [], message: 'Sudah sinkron — tidak ada perubahan' };
            }

            const profileChanged = fieldsBefore.includes('profile');

            await updatePppSecret(api, secret.id, {
                profile: expected.profile,
                comment: expected.comment,
                disabled: expected.disabled,
            });

            // Kick session HANYA kalau profile berubah. Comment/disabled change
            // tidak butuh kick — secret langsung pakai rate-limit baru di
            // session berikutnya, kick prematur cuma bikin customer disconnect.
            if (profileChanged && opts.kickSession !== false) {
                try { await kickPppSession(api, sub.mikrotikIdentity); }
                catch (e: any) { logger.warn({ err: e?.message, subId: sub.id }, 'kick session after resync failed'); }
            }

            // Audit log — simpan snapshot before/after supaya operator bisa
            // manual revert kalau perlu.
            try {
                await auditRepository.create({
                    tenantId,
                    userId: opts.actorUserId || null,
                    action: 'billing.drift.resync',
                    entity: 'subscription',
                    entityId: sub.id,
                    details: {
                        routerId: sub.routerId,
                        mikrotikIdentity: sub.mikrotikIdentity,
                        fieldsChanged: fieldsBefore,
                        before: {
                            profile: secret.profile,
                            comment: secret.comment,
                            disabled: secret.disabled,
                        },
                        after: expected,
                        kicked: profileChanged && opts.kickSession !== false,
                    },
                } as any);
            } catch (e: any) {
                logger.warn({ err: e?.message }, 'audit log for drift resync failed');
            }

            // Decrement cached count
            const summary = summaryByTenant.get(tenantId);
            if (summary && summary.count > 0) summary.count -= 1;

            return { ok: true, applied: fieldsBefore };
        } catch (err: any) {
            logger.error({ err: err?.message, subId: sub.id }, 'Drift resync failed');
            return { ok: false, applied: [], message: err?.message || 'Resync failed' };
        }
    },
};

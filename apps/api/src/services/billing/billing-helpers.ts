import { db } from '../../db/index.js';
import { invoices, customers, billingRouterSettings } from '../../db/schema/index.js';
import { sql, eq, and } from 'drizzle-orm';

/**
 * Generate the next invoice number for a tenant in format INV-YYYYMM-NNNN.
 * Counter resets monthly. Race-safe via SELECT FOR UPDATE on the latest row.
 */
export async function generateInvoiceNumber(tenantId: string, when: Date = new Date()): Promise<string> {
    const yyyy = when.getFullYear();
    const mm = String(when.getMonth() + 1).padStart(2, '0');
    const prefix = `INV-${yyyy}${mm}-`;

    const rows = await db.execute(sql`
        SELECT invoice_number FROM billing_invoices
        WHERE tenant_id = ${tenantId} AND invoice_number LIKE ${prefix + '%'}
        ORDER BY invoice_number DESC
        LIMIT 1
    `) as any[];

    let nextSeq = 1;
    if (rows[0]?.invoice_number) {
        const parts = String(rows[0].invoice_number).split('-');
        const seq = parseInt(parts[2] || '0', 10);
        if (Number.isFinite(seq)) nextSeq = seq + 1;
    }
    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

/**
 * Generate the next customer code per tenant in format CUST-NNNN.
 */
export async function generateCustomerCode(tenantId: string): Promise<string> {
    const rows = await db.execute(sql`
        SELECT code FROM billing_customers
        WHERE tenant_id = ${tenantId} AND code LIKE 'CUST-%'
        ORDER BY code DESC LIMIT 1
    `) as any[];
    let next = 1;
    if (rows[0]?.code) {
        const seq = parseInt(String(rows[0].code).slice(5), 10);
        if (Number.isFinite(seq)) next = seq + 1;
    }
    return `CUST-${String(next).padStart(4, '0')}`;
}

/**
 * Default timezone billing — fallback chain saat per-tenant setting belum ada.
 * Order: env BILLING_TZ → 'Asia/Jakarta'.
 *
 * Per-tenant override pakai getTenantBillingTimezone() — disimpan di
 * app_settings key='billing_timezone'. Fallback ke first admin user's
 * timezone di tenant, lalu BILLING_TZ ini.
 */
const BILLING_TZ = process.env.BILLING_TZ || 'Asia/Jakarta';

/**
 * Cache timezone per tenant — kurangi query DB. Invalidate via
 * invalidateTenantBillingTimezone() saat operator update setting.
 */
const tzCache = new Map<string, { tz: string; expiresAt: number }>();
const TZ_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Resolve timezone untuk billing per-tenant. Fallback chain:
 *   1. app_settings.value WHERE key='billing_timezone' AND tenant_id=?
 *   2. first admin/superadmin user di tenant — users.timezone
 *   3. env BILLING_TZ
 *   4. 'Asia/Jakarta'
 */
export async function getTenantBillingTimezone(tenantId: string): Promise<string> {
    const cached = tzCache.get(tenantId);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.tz;

    let tz = BILLING_TZ;
    try {
        const { appSettings, users, userTenants } = await import('../../db/schema/index.js');
        const [setting] = await db.select().from(appSettings)
            .where(and(eq(appSettings.tenantId, tenantId), eq(appSettings.key, 'billing_timezone')))
            .limit(1);
        const rawValue = setting?.value as any;
        const candidate = typeof rawValue === 'string' ? rawValue : rawValue?.value;
        if (typeof candidate === 'string' && candidate.trim()) {
            tz = candidate.trim();
        } else {
            // Fallback: ambil timezone dari admin user di tenant ini.
            const adminUsers = await db.select({ timezone: users.timezone })
                .from(userTenants)
                .innerJoin(users, eq(users.id, userTenants.userId))
                .where(eq(userTenants.tenantId, tenantId))
                .limit(5);
            const adminTz = adminUsers.find(u => u.timezone)?.timezone;
            if (adminTz) tz = adminTz;
        }
    } catch {
        // Fall back to BILLING_TZ silently — billing tidak boleh fail karena
        // setting lookup gagal.
    }
    tzCache.set(tenantId, { tz, expiresAt: now + TZ_CACHE_TTL_MS });
    return tz;
}

/** Invalidate cache — panggil saat operator update setting. */
export function invalidateTenantBillingTimezone(tenantId: string): void {
    tzCache.delete(tenantId);
}

interface TZParts {
    year: number;
    month: number;   // 1-12
    day: number;     // 1-31
    hour: number;
    minute: number;
    second: number;
}

/** Number of days in (year, month). month is 1-12. */
function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Get Y/M/D/H/M/S of a Date as observed in `tz`. Default ke BILLING_TZ.
 *
 *  CRITICAL midnight handling: kalau formatter request date + time bareng,
 *  beberapa V8 version return hour="24" dengan day field yang inconsistent
 *  antar versi (kadang day=N, kadang day=N-1). Workaround: pakai 2 formatter
 *  TERPISAH — date formatter tidak punya hour quirk karena hour bukan output.
 *  Time formatter masih bisa return hour=24, kita normalize ke 0. */
function partsInTZ(d: Date, tz: string = BILLING_TZ): TZParts {
    const dateFmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const timeFmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    const dParts = dateFmt.formatToParts(d);
    const tParts = timeFmt.formatToParts(d);
    const get = (parts: Intl.DateTimeFormatPart[], type: string): number => {
        const p = parts.find(x => x.type === type);
        return p ? +p.value : 0;
    };
    let hour = get(tParts, 'hour');
    if (hour === 24) hour = 0;
    return {
        year: get(dParts, 'year'),
        month: get(dParts, 'month'),
        day: get(dParts, 'day'),
        hour,
        minute: get(tParts, 'minute'),
        second: get(tParts, 'second'),
    };
}

/**
 * Build a Date that represents the given wall-clock (y/m/d 00:00:00) in `tz`.
 * Hard part: JS Date constructor is in local TZ. We use UTC then correct.
 *
 * Trick: build candidate UTC date, see what wall-clock it produces in tz,
 * compute offset diff, adjust. Iterates at most 2× to handle DST edge cases.
 */
/** Parse "YYYY-MM-DD" sebagai midnight di tz. Dipakai untuk shift nextDueAt
 *  override — operator pick calendar date di UI, backend store sebagai
 *  midnight di tenant TZ (bukan browser TZ). Tanpa ini, browser di WITA
 *  yang pick "15 Jun" akan kirim 14 Jun 16:00 UTC ke backend Jakarta TZ. */
export function parseDateInTZ(dateStr: string, tz: string = BILLING_TZ): Date {
    const datePart = dateStr.split('T')[0];
    const [y, m, d] = datePart.split('-').map(Number);
    if (!y || !m || !d) throw new Error(`Invalid date format: ${dateStr} (expected YYYY-MM-DD)`);
    return makeDateAtMidnightInTZ(y, m, d, tz);
}

export function makeDateAtMidnightInTZ(year: number, month: number, day: number, tz: string = BILLING_TZ): Date {
    let utcMs = Date.UTC(year, month - 1, day, 0, 0, 0);
    for (let i = 0; i < 3; i++) {
        const probe = new Date(utcMs);
        const p = partsInTZ(probe, tz);
        if (p.year === year && p.month === month && p.day === day && p.hour === 0 && p.minute === 0) {
            return probe;
        }
        const wantUTC = Date.UTC(year, month - 1, day, 0, 0, 0);
        const gotUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
        utcMs += (wantUTC - gotUTC);
    }
    return new Date(utcMs);
}

/**
 * Compute the next billing-day timestamp from an anchor day, TZ-aware.
 * If today's day in `tz` has already passed (or is current), jump to next month.
 *
 * Returns a Date pointing to 00:00:00 in BILLING_TZ.
 */
export function computeNextDueAt(billingDay: number, from: Date = new Date(), tz: string = BILLING_TZ): Date {
    const day = Math.max(1, Math.min(28, billingDay));
    const p = partsInTZ(from, tz);
    let targetYear = p.year;
    let targetMonth = p.month;
    let targetDay = day;
    const candidate = makeDateAtMidnightInTZ(targetYear, targetMonth, targetDay, tz);
    if (candidate.getTime() <= from.getTime()) {
        targetMonth += 1;
        if (targetMonth > 12) { targetMonth = 1; targetYear += 1; }
        return makeDateAtMidnightInTZ(targetYear, targetMonth, targetDay, tz);
    }
    return candidate;
}

/**
 * Anniversary mode — shift `cycleMonths` bulan kalender dari reference date, TZ-aware.
 *   from=12 Mei (WIB), cycle=1 → 12 Jun 00:00 WIB
 *   from=31 Jan, cycle=1 → 28 Feb (clamp ke last day kalau bulan tujuan pendek)
 *   from=15 Jun 06:55 WIB (= 14 Jun 23:55 UTC), cycle=1 → 15 Jul 00:00 WIB ✓
 *     (sebelumnya: 14 Jul karena getDate UTC = 14)
 */
export function computeNextDueAtAnniversary(from: Date, cycleMonths: number = 1, tz: string = BILLING_TZ): Date {
    const cycles = Math.max(1, cycleMonths);
    const p = partsInTZ(from, tz);
    let targetMonth = p.month + cycles;
    let targetYear = p.year;
    while (targetMonth > 12) { targetMonth -= 12; targetYear += 1; }
    const targetDay = Math.min(p.day, daysInMonth(targetYear, targetMonth));
    return makeDateAtMidnightInTZ(targetYear, targetMonth, targetDay, tz);
}

/**
 * Dispatch ke compute helper sesuai billing mode subscription.
 */
export function computeNextDueByMode(opts: {
    mode: 'anchor_day' | 'anniversary';
    from: Date;
    billingDay?: number | null;
    cycleMonths?: number | null;
    tz?: string;
}): Date {
    const tz = opts.tz || BILLING_TZ;
    if (opts.mode === 'anniversary') {
        return computeNextDueAtAnniversary(opts.from, opts.cycleMonths || 1, tz);
    }
    return computeNextDueAt(opts.billingDay || 1, opts.from, tz);
}

/**
 * Get or create the billing settings row for a router (one-to-one).
 */
export async function getOrCreateRouterSettings(routerId: string, tenantId: string) {
    const [existing] = await db.select().from(billingRouterSettings)
        .where(eq(billingRouterSettings.routerId, routerId)).limit(1);
    if (existing) return existing;

    const [created] = await db.insert(billingRouterSettings).values({
        tenantId, routerId,
    }).returning();
    return created;
}

/**
 * Default PIN derivation: last 4 digits of phone, or last 4 of customer code.
 */
export function defaultPinForCustomer(c: { phone?: string | null; code: string }): string {
    const digits = (c.phone || '').replace(/\D/g, '');
    if (digits.length >= 4) return digits.slice(-4);
    const code = c.code.replace(/\D/g, '');
    return code.padStart(4, '0').slice(-4);
}

const MONTH_NAMES_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Mikhmon-style date "jun/06/2026" (lowercase month, zero-padded day, 4-digit year),
 *  TZ-aware. Format mengacu ke wall-clock di BILLING_TZ (default Asia/Jakarta) supaya
 *  comment di MikroTik konsisten dengan tanggal yang dilihat operator + customer. */
export function formatDateMikhmon(d: Date, tz: string = BILLING_TZ): string {
    const p = partsInTZ(d, tz);
    const mm = MONTH_NAMES_EN[p.month - 1];
    const dd = String(p.day).padStart(2, '0');
    return `${mm}/${dd}/${p.year}`;
}

/** Numeric "YYYYMMDD" for fast string-as-number comparison in RouterOS scripts, TZ-aware. */
export function formatDateNumeric(d: Date, tz: string = BILLING_TZ): string {
    const p = partsInTZ(d, tz);
    const mm = String(p.month).padStart(2, '0');
    const dd = String(p.day).padStart(2, '0');
    return `${p.year}${mm}${dd}`;
}

/**
 * Build the canonical PPP secret comment used by our billing system.
 *
 * Format: "<isolirDate-mmm/dd/yyyy> subscription:<uuid> dn:<YYYYMMDD> paket:<name>"
 *
 * Tanggal isolir di prefix (11 char pertama) supaya kompatibel dengan
 * scheduler MikroTik "isolir-pppoe-harian" yang baca [:pick $comment 0 11]
 * sebagai mmm/dd/yyyy. Pattern ini bikin scheduler sisi MikroTik bisa jadi
 * safety net kalau app down — dia tetap isolir customer yang due-nya jatuh
 * hari ini, tanpa nunggu app naik.
 *
 * App scheduler tetap primary (jalan tiap jam, generate invoice + isolir +
 * mark overdue). Scheduler MikroTik 1× sehari sebagai fallback — idempotent
 * karena cek profile (skip kalau sudah ISOLIR).
 *
 * Comment harus di-update SETIAP nextDueAt bergeser:
 *  - billing-scheduler.ts step 1 — invoice generated, nextDueAt +1 bulan
 *  - billing.service.ts unisolir() — after payment, restore active profile
 *
 * Field `dn:` (YYYYMMDD) tetap dipertahankan untuk backward-compat —
 * scheduler lain mungkin baca format itu untuk filtering.
 */
export function buildSubscriptionComment(opts: {
    subscriptionId: string;
    isolirDate?: Date | null;
    packageName?: string | null;
    tz?: string;
}): string {
    const tz = opts.tz || BILLING_TZ;
    const datePrefix = opts.isolirDate ? `${formatDateMikhmon(opts.isolirDate, tz)} ` : '';
    const parts = [`subscription:${opts.subscriptionId}`];
    if (opts.isolirDate) {
        parts.push(`dn:${formatDateNumeric(opts.isolirDate, tz)}`);
    }
    if (opts.packageName) parts.push(`paket:${opts.packageName.replace(/\s+/g, '_')}`);
    return datePrefix + parts.join(' ');
}

/**
 * Compute the date when a subscription SHOULD be isolired:
 *   nextDueAt + graceDays
 *
 * Returns null if nextDueAt is missing.
 */
export function computeIsolirDate(nextDueAt: Date | null | undefined, graceDays: number = 0, tz: string = BILLING_TZ): Date | null {
    if (!nextDueAt) return null;
    const g = Math.max(0, graceDays);
    if (g === 0) return nextDueAt;
    // Add days di TZ tertentu supaya hasil = wall-clock yang benar.
    const p = partsInTZ(nextDueAt, tz);
    let targetYear = p.year;
    let targetMonth = p.month;
    let targetDay = p.day + g;
    let dim = daysInMonth(targetYear, targetMonth);
    while (targetDay > dim) {
        targetDay -= dim;
        targetMonth += 1;
        if (targetMonth > 12) { targetMonth = 1; targetYear += 1; }
        dim = daysInMonth(targetYear, targetMonth);
    }
    return makeDateAtMidnightInTZ(targetYear, targetMonth, targetDay, tz);
}

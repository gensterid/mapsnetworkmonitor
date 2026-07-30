import { db } from '../db/index.js';
import { olts, onus, devicePerformanceHistory } from '../db/schema/index.js';
import { eq, and, sql, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import { ApiError } from '../middleware/error.middleware.js';
import { logger } from '../lib/logger.js';
import { decrypt, encrypt } from '../lib/encryption.js';
import type { Onu } from '../db/schema/onus.js';
import { checkSignalChange } from './signal-alert.service.js';
import { env } from '../config/env.js';

// Sentinel written to onus.lastDownReason by the orphan sweep when an ONU
// vanishes from its OLT's device list. The cross-OLT reassign logic reads this
// exact string as proof the old OLT dropped the ONU, so both sites MUST share
// one constant — a reword on one side would silently desync the other.
const ORPHAN_REASON = 'Removed from OLT';

export class OltService {
    private static instance: OltService;

    private constructor() {}

    public static getInstance(): OltService {
        if (!OltService.instance) {
            OltService.instance = new OltService();
        }
        return OltService.instance;
    }

    private async findByIdInternal(id: string, tenantId?: string) {
        const filters = [eq(olts.id, id)];
        if (tenantId) filters.push(eq(olts.tenantId, tenantId));
        const [olt] = await db.select().from(olts).where(and(...filters));
        return olt;
    }

    /**
     * Parse signal string (e.g. "-19.5 dBm") to number
     */
    public parseSignal(signalStr: string | null): number | null {
        if (!signalStr) return null;
        const cleaned = signalStr.replace(/[^\d.-]/g, '');
        const val = parseFloat(cleaned);
        return isNaN(val) ? null : val;
    }

    async findAll(tenantId?: string, userId?: string, userRole?: string): Promise<any[]> {
        const filters = [];
        if (tenantId) filters.push(eq(olts.tenantId, tenantId));

        // If user is not admin, filter by assigned routers
        if (userId && userRole && userRole !== 'admin' && userRole !== 'superadmin') {
            const { userRouters } = await import('../db/schema/user-routers.js');
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));

            const routerIds = assigned.map((a) => a.routerId);
            if (routerIds.length === 0) return [];
            filters.push(inArray(olts.parentId, routerIds));
        }

        return db.select().from(olts).where(and(...filters)).orderBy(olts.name);
    }

    async findById(id: string, tenantId?: string, userId?: string, userRole?: string): Promise<any> {
        const olt = await this.findByIdInternal(id, tenantId);
        if (!olt) return null;

        // RBAC check
        if (userId && userRole && userRole !== 'admin' && userRole !== 'superadmin') {
            if (!olt.parentId) return null; // No parent router assigned? deny.
            const { userRouters } = await import('../db/schema/user-routers.js');
            const [assignment] = await db
                .select()
                .from(userRouters)
                .where(and(eq(userRouters.userId, userId), eq(userRouters.routerId, olt.parentId)));
            if (!assignment) return null;
        }

        return olt;
    }

    /**
     * Encrypt secret fields if they're fresh plain-text values. Encrypted values
     * always start with the encryption library's "v2:" version tag, so we can
     * detect already-encrypted input and avoid double-encrypting. Empty/absent
     * fields are left untouched (so a partial update never wipes them).
     */
    private normalizeSecrets(data: any): any {
        if (!data) return data;
        let out = data;
        for (const field of ['webPassword', 'telnetPassword']) {
            const val = out[field];
            if (typeof val !== 'string' || val.length === 0) continue;
            if (val.startsWith('v2:')) continue;
            out = { ...out, [field]: encrypt(val) };
        }
        return out;
    }

    async create(data: any, tenantId: string): Promise<any> {
        const safe = this.normalizeSecrets(data);
        const [inserted] = await db.insert(olts).values({ ...safe, tenantId }).returning();
        return inserted;
    }

    async update(id: string, data: any, tenantId?: string): Promise<any> {
        const filters = [eq(olts.id, id)];
        if (tenantId) filters.push(eq(olts.tenantId, tenantId));
        const safe = this.normalizeSecrets(data);
        const [updated] = await db.update(olts).set({ ...safe, updatedAt: new Date() }).where(and(...filters)).returning();
        return updated;
    }

    async delete(id: string, tenantId?: string): Promise<boolean> {
        const filters = [eq(olts.id, id)];
        if (tenantId) filters.push(eq(olts.tenantId, tenantId));
        const result = await db.delete(olts).where(and(...filters)).returning();
        return result.length > 0;
    }

    async getOnus(id: string, tenantId?: string): Promise<any[]> {
        const olt = await this.findByIdInternal(id, tenantId);
        if (!olt) throw new Error('OLT not found');

        if (!olt.useWeb) {
            logger.info({ olt: olt.name }, 'Web API access is disabled');
            return [];
        }

        try {
            const { OltDriverFactory } = await import('./olt-drivers/driver.factory.js');
            let decryptedPassword;
            try {
                decryptedPassword = olt.webPassword ? decrypt(olt.webPassword) : undefined;
            } catch (decryptError) {
                logger.error({ err: decryptError, oltId: id }, 'Decrypt failed');
                throw new ApiError(401, 'Please re-enter OLT password');
            }

            const driver = OltDriverFactory.getDriver(
                olt.type || 'generic',
                olt.host,
                olt.webPort || undefined,
                olt.webUsername || undefined,
                decryptedPassword,
                olt.webProtocol || undefined
            );

            let driverOnus: any[] = [];
            try {
                await driver.connect();
                driverOnus = await driver.getOnuList();
                await driver.disconnect();
            } catch (driverErr) {
                logger.warn({ err: driverErr, oltId: id }, 'Driver connection or fetch failed - falling back to DB inventory');
            }

            const results: any[] = [];
            // Filter archived ONUs — when driver fails and we fall back to DB,
            // archived rows (operator-deleted ghosts) must not reappear.
            const dbOnus = await db.select().from(onus).where(and(eq(onus.oltId, id), isNull(onus.archivedAt)));
            
            // If driver failed but we have DB data, we should at least show that
            if (driverOnus.length === 0 && dbOnus.length > 0) {
                return dbOnus.map(o => ({
                    ...o,
                    id: o.id,
                    sn: o.sn,
                    status: o.status,
                    name: o.name,
                    signal: o.lastRxPower,
                    lastDownReason: o.lastDownReason,
                    lastSeen: o.lastSeen,
                    ponId: o.ponPort,
                    onuId: o.onuIndex
                }));
            }

            const dbOnuMap = new Map(dbOnus.map(o => [o.sn, o]));

            // Cap alert redaman per cycle (anti-flood) — per review HIGH-1.
            let signalAlertsCreated = 0;
            await db.transaction(async (tx) => {
                for (const device of driverOnus) {
                    if (!device.sn) {
                        results.push(device);
                        continue;
                    }

                    let dbOnu = dbOnuMap.get(device.sn);
                    let status = 'unknown';
                    const rawStatus = String(device.status || '').toLowerCase();
                    if (rawStatus === 'online' || rawStatus === 'active' || rawStatus === '1') status = 'online';
                    else if (device.lastDownReason?.toLowerCase()?.includes('power')) status = 'power_down';
                    else status = 'offline';

                    if (!dbOnu) {
                        try {
                            const [inserted] = await tx.insert(onus).values({
                                sn: device.sn,
                                oltId: id,
                                routerId: olt.parentId,
                                ponPort: device.ponId,
                                onuIndex: device.onuId,
                                macAddress: device.macAddress,
                                name: device.name || `ONT-${device.sn.substring(device.sn.length - 4)}`,
                                description: device.description,
                                status: status as any,
                                lastRxPower: device.signal ? String(device.signal) : null,
                                discoverySources: ['olt'],
                                lastSeen: status === 'online' ? new Date() : null,
                                lastDownReason: device.lastDownReason,
                            } as any).onConflictDoUpdate({
                                target: onus.sn,
                                set: {
                                    status: status as any,
                                    lastRxPower: device.signal ? String(device.signal) : sql`onus.last_rx_power`,
                                    updatedAt: new Date(),
                                } as any
                            }).returning();
                            dbOnu = inserted;
                            dbOnuMap.set(device.sn, dbOnu);
                        } catch (err) {
                            logger.error({ err, sn: device.sn }, 'Upsert failed');
                            throw err;
                        }
                    } else {
                        try {
                            // Resolve name with same cascade as syncOnuInventory:
                            // OLT name → description (HSGQ alias field) → keep existing.
                            // Skip update if resolved value matches the auto-generated
                            // 'ONT-XXXX' placeholder pattern.
                            const incomingName = device.name
                                || (device as any).description
                                || undefined;

                            const updateData: any = {
                                status: status as any,
                                lastRxPower: device.signal ? String(device.signal) : dbOnu.lastRxPower,
                                // Clear lastDownReason when ONU is online — drivers report
                                // historical reason as bookkeeping even when up.
                                lastDownReason: status === 'online'
                                    ? null
                                    : (device.lastDownReason || dbOnu.lastDownReason),
                                macAddress: device.macAddress || dbOnu.macAddress,
                                updatedAt: new Date(),
                            };
                            if (status === 'online') updateData.lastSeen = new Date();
                            if (incomingName && !incomingName.startsWith('ONT-')) {
                                updateData.name = incomingName;
                            }

                            // Deteksi perubahan redaman (RX power) signifikan SEBELUM
                            // update DB — bandingkan nilai lama (dbOnu.lastRxPower) vs
                            // baru (device.signal). Hanya saat ONU online (signal valid).
                            // checkSignalChange pakai db internal (bukan tx) jadi tidak
                            // memperpanjang transaksi untuk write; cap anti-flood.
                            if (
                                status === 'online' &&
                                device.signal != null &&
                                signalAlertsCreated < env.SIGNAL_MAX_ALERTS_PER_SYNC
                            ) {
                                const created = await checkSignalChange({
                                    routerId: olt.parentId,
                                    tenantId: olt.tenantId,
                                    onuName: dbOnu.name || device.name || device.sn,
                                    sn: device.sn,
                                    oltName: olt.name,
                                    source: 'olt',
                                    oldSignal: dbOnu.lastRxPower,
                                    newSignal: device.signal,
                                });
                                if (created) signalAlertsCreated++;
                            }

                            await tx.update(onus).set(updateData).where(eq(onus.id, dbOnu.id));

                            dbOnu.status = updateData.status;
                        } catch (e) {}
                    }

                    results.push({
                        ...device,
                        id: dbOnu!.id,
                        status: dbOnu!.status,
                        latitude: dbOnu!.latitude,
                        longitude: dbOnu!.longitude,
                        description: (dbOnu as any).description,
                        name: dbOnu!.name || device.name,
                        lastRxPower: device.signal || dbOnu!.lastRxPower,
                        lastDown: dbOnu!.lastSeen,
                        macAddress: dbOnu!.macAddress,
                        lastDownReason: dbOnu!.lastDownReason || device.lastDownReason,
                    });
                }
            });

            // 3. Log history OUTSIDE of the main inventory transaction
            // This prevents a DB error in the history hypertable from rolling back the whole OLT sync
            for (const device of driverOnus) {
                if (!device.sn || !device.signal) continue;
                const dbOnu = dbOnuMap.get(device.sn);
                if (!dbOnu) continue;

                const parsedSignal = this.parseSignal(device.signal);
                if (parsedSignal !== null) {
                    try {
                        await db.insert(devicePerformanceHistory).values({
                            tenantId: olt.tenantId || '',
                            routerId: olt.parentId || '',
                            onuId: dbOnu.id,
                            signal: parsedSignal,
                            recordedAt: new Date()
                        });
                    } catch (historyErr) {
                        logger.warn({ err: historyErr, onuId: dbOnu.id }, 'Failed to log ONU signal history (ignoring)');
                    }
                }
            }

            return results;
        } catch (error) {
            logger.error({ err: error, olt: olt.name }, 'Failed to get ONUs');
            throw error;
        }
    }

    async refreshStatus(id: string, tenantId?: string): Promise<any> {
        const olt = await this.findByIdInternal(id, tenantId);
        if (!olt) return null;

        try {
            const { OltDriverFactory } = await import('./olt-drivers/driver.factory.js');
            let decryptedPassword;
            try {
                decryptedPassword = olt.webPassword ? decrypt(olt.webPassword) : undefined;
            } catch (e: any) {
                logger.warn({ err: e?.message, oltId: id, oltName: olt.name }, 'OLT password decrypt failed — likely stored as plain text. Re-edit OLT to re-encrypt.');
                decryptedPassword = olt.webPassword || undefined; // fallback: pass raw value, driver will fail with explicit auth error
            }

            const driver = OltDriverFactory.getDriver(
                olt.type || 'generic',
                olt.host,
                olt.webPort || undefined,
                olt.webUsername || undefined,
                decryptedPassword,
                olt.webProtocol || undefined
            );

            if (olt.useWeb) {
                const result = await driver.testConnection();
                if (result.success) {
                    await db.update(olts).set({
                        status: 'online',
                        lastWebStatus: 'online',
                        statusReason: null,
                        updatedAt: new Date()
                    }).where(eq(olts.id, id));
                    return { ...olt, status: 'online', lastWebStatus: 'online', statusReason: null };
                } else {
                    const reason = result.error || 'OLT Web API Unreachable';
                    await db.update(olts).set({
                        status: 'offline',
                        lastWebStatus: 'offline',
                        statusReason: reason,
                        updatedAt: new Date()
                    }).where(eq(olts.id, id));
                    return { ...olt, status: 'offline', lastWebStatus: 'offline', statusReason: reason };
                }
            } else {
                await driver.connect();
                await db.update(olts).set({
                    status: 'online',
                    statusReason: null,
                    updatedAt: new Date()
                }).where(eq(olts.id, id));
                await driver.disconnect();
                return { ...olt, status: 'online', statusReason: null };
            }
        } catch (error) {
            logger.error({ err: error, olt: olt.name }, 'Refresh OLT status failed');
            await db.update(olts).set({
                status: 'offline',
                updatedAt: new Date()
            }).where(eq(olts.id, id));
            return { ...olt, status: 'offline' };
        }
    }

    async syncOnuInventory(oltId: string, tenantId?: string): Promise<{ added: number; updated: number; total: number }> {
        const olt = await this.findByIdInternal(oltId, tenantId);
        if (!olt) throw new Error('OLT not found');

        let driverOnus: any[] = [];
        try {
            driverOnus = await this.getOnus(oltId);
        } catch (e: any) {
            logger.error({ err: e, olt: olt.name }, 'Sync failed');
            throw e;
        }

        if (!driverOnus || driverOnus.length === 0) return { added: 0, updated: 0, total: 0 };

        let added = 0;
        const valuesToUpsert: any[] = [];
        const now = new Date();

        for (const device of driverOnus) {
            if (!device.sn) continue;
            let status: any = 'unknown';
            const rawStatus = String(device.status || '').toLowerCase();
            if (rawStatus === 'online' || rawStatus === 'active' || rawStatus === '1') status = 'online';
            else if (device.lastDownReason) {
                const reason = device.lastDownReason.toLowerCase();
                if (reason.includes('power')) status = 'power_down';
                else if (reason.includes('loss')) status = 'lost';
                else status = 'offline';
            } else status = 'offline';

            // OLT vendors differ on where they store the operator-set identifier.
            // CDATA exposes it as ont_name; HSGQ uses ont_description (with pencil
            // icon in web UI). Prefer name when set, fall back to description so a
            // rename in either field propagates to the app. Final fallback is the
            // auto-generated 'ONT-XXXX' placeholder (caught later in CASE WHEN to
            // avoid overwriting existing real names).
            const resolvedName = device.name
                || (device as any).description
                || `ONT-${device.sn.substring(device.sn.length - 4)}`;

            valuesToUpsert.push({
                sn: device.sn,
                oltId: oltId,
                routerId: olt.parentId,
                ponPort: device.ponId,
                onuIndex: device.onuId,
                name: resolvedName,
                status: status,
                tenantId: tenantId,
                lastRxPower: device.signal ? String(device.signal) : null,
                discoverySources: ['olt'],
                macAddress: device.macAddress,
                lastSeen: status === 'online' ? now : null,
                lastSeenOlt: now,
                // CDATA drivers return the last historical down reason even when
                // the ONU is currently online (bookkeeping). Clear it when online
                // so popups don't show 'Power Down' / 'Removed from OLT' for an
                // ONU that's actually up.
                lastDownReason: status === 'online' ? null : device.lastDownReason,
                updatedAt: now,
            });
        }

        if (valuesToUpsert.length > 0) {
            // Auto-reassign cross-OLT moves: if this OLT now reports an SN that
            // DB still links to a DIFFERENT OLT, the ONU has physically moved
            // here (a GPON ONU registers to exactly one OLT PON at a time), so
            // olt_id/pon_port must follow — before the SN-keyed bulk upsert runs.
            //
            // We must NOT gate this purely on lastSeenOlt: that column is keyed
            // by SN and refreshed to `now` by THIS OLT's own upsert every cycle,
            // so once the new OLT starts polling it never goes stale — which
            // permanently deadlocked moves (ONU stuck showing 'Removed from OLT'
            // on the old OLT forever, even a month after the physical move).
            // Instead reassign immediately when the move is unambiguous: the new
            // OLT sees it ONLINE, or the old OLT already dropped it (orphan marker
            // / offline). Only keep the 6h defer for the genuinely ambiguous case
            // (new OLT lists it but not online yet AND the old OLT saw it very
            // recently — e.g. a pre-provisioned SN mid-migration).
            const STALE_HOURS = 6;
            const staleThreshold = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);
            const incomingSns = valuesToUpsert.map(v => v.sn);
            const crossOltCandidates = await db.select({
                id: onus.id,
                sn: onus.sn,
                oldOltId: onus.oltId,
                lastSeenOlt: onus.lastSeenOlt,
                status: onus.status,
                lastDownReason: onus.lastDownReason,
            }).from(onus).where(and(
                inArray(onus.sn, incomingSns),
                isNotNull(onus.oltId),
                sql`${onus.oltId} != ${oltId}`,
                // Tenant scoping: never repoint an ONU across tenants. onus.sn is
                // globally unique, so a cross-tenant SN collision (dup hardware,
                // seed data) could otherwise steal a row into another tenant's OLT.
                ...(tenantId ? [eq(onus.tenantId, tenantId)] : []),
            ));
            for (const c of crossOltCandidates) {
                const incoming = valuesToUpsert.find(v => v.sn === c.sn);
                if (!incoming) continue;
                const liveOnThisOlt = incoming.status === 'online';
                const droppedByOldOlt = c.lastDownReason === ORPHAN_REASON || c.status === 'offline';
                const freshOnOldOlt = c.lastSeenOlt && c.lastSeenOlt > staleThreshold;
                // Defer only while the move is still ambiguous AND the old OLT saw it recently.
                if (!liveOnThisOlt && !droppedByOldOlt && freshOnOldOlt) continue;
                // Best-effort per candidate — one failed reassign must not abort
                // the whole sync cycle (bulk upsert + orphan sweep still run).
                try {
                    await db.update(onus).set({
                        oltId: oltId,
                        ponPort: incoming.ponPort,
                        onuIndex: incoming.onuIndex,
                        routerId: olt.parentId,
                        // Normalize ownership to the OLT the ONU now lives under.
                        tenantId: olt.tenantId,
                        updatedAt: now,
                    }).where(eq(onus.id, c.id));
                    logger.info({
                        oltId, oltName: olt.name, sn: c.sn, fromOltId: c.oldOltId,
                        trigger: liveOnThisOlt ? 'online-on-new' : droppedByOldOlt ? 'orphaned-on-old' : 'stale-on-old',
                    }, '🔀 Auto-reassigned ONU to this OLT');
                } catch (reassignErr) {
                    logger.warn({ err: reassignErr, oltId, sn: c.sn }, 'Cross-OLT reassign failed (will retry next cycle)');
                }
            }

            // Operator-archived ONUs that the OLT still reports — log so operator
            // is aware. We do NOT auto-unarchive: operator's hide intent wins
            // until they explicitly Unarchive via UI. Otherwise polling would
            // reverse every delete-from-map action and break the workflow.
            const archivedReappearing = await db.select({ id: onus.id, sn: onus.sn, name: onus.name })
                .from(onus)
                .where(and(
                    inArray(onus.sn, valuesToUpsert.map(v => v.sn)),
                    isNotNull(onus.archivedAt),
                ));
            if (archivedReappearing.length > 0) {
                logger.info({
                    oltId, oltName: olt.name,
                    archivedSns: archivedReappearing.map(r => ({ sn: r.sn, name: r.name })),
                }, '[OLT Sync] Operator-archived ONUs still present in OLT — skipping unarchive (respect operator intent)');
            }

            // Capture redaman (RX power) LAMA per-SN SEBELUM upsert, untuk
            // bandingkan dengan nilai baru → deteksi perubahan signifikan.
            const oldSignalMap = new Map<string, string | null>();
            try {
                const existingSignals = await db
                    .select({ sn: onus.sn, lastRxPower: onus.lastRxPower })
                    .from(onus)
                    .where(inArray(onus.sn, incomingSns));
                existingSignals.forEach((o) => oldSignalMap.set(o.sn, o.lastRxPower));
            } catch { /* best-effort; kalau gagal, skip signal alert siklus ini */ }

            let historyValues: any[] = [];
            await db.transaction(async (tx) => {
                await tx.insert(onus).values(valuesToUpsert as any).onConflictDoUpdate({
                    target: onus.sn,
                    set: {
                        status: sql`excluded.status`,
                        lastRxPower: sql`excluded.last_rx_power`,
                        lastSeen: sql`CASE WHEN excluded.status = 'online' THEN excluded.updated_at ELSE onus.last_seen END`,
                        lastSeenOlt: sql`excluded.last_seen_olt`,
                        lastDownReason: sql`excluded.last_down_reason`,
                        updatedAt: sql`excluded.updated_at`,
                        // Sync name from OLT — operator's source of truth for ONU naming
                        // is the OLT itself. Skip if incoming name is the auto-generated
                        // 'ONT-XXXX' fallback (driver returned empty); keep existing name
                        // in that case so we don't overwrite a real name with placeholder.
                        name: sql`CASE WHEN excluded.name LIKE 'ONT-%' THEN onus.name ELSE excluded.name END`,
                        // archivedAt intentionally NOT in the SET clause —
                        // operator's archive must be sticky against polling.
                        // To unarchive, operator must explicitly Unarchive via UI.
                    } as any
                });

                const syncedOnus = await tx.select({ id: onus.id, sn: onus.sn }).from(onus).where(eq(onus.oltId, oltId));
                const snToIdMap = new Map(syncedOnus.map(o => [o.sn, o.id]));
                historyValues = valuesToUpsert.filter(v => v.lastRxPower !== null).map(v => {
                    const parsedSignal = this.parseSignal(v.lastRxPower);
                    if (parsedSignal === null) return null;
                    const onuId = snToIdMap.get(v.sn);
                    if (!onuId) return null;
                    return {
                        tenantId: tenantId || '',
                        routerId: olt.parentId || '',
                        onuId: onuId,
                        signal: parsedSignal,
                        recordedAt: now
                    };
                }).filter((v): v is any => v !== null);
            });

            // 3. Log bulk history OUTSIDE of transaction
            if (historyValues.length > 0) {
                try {
                    await db.insert(devicePerformanceHistory).values(historyValues).execute();
                } catch (historyErr) {
                    logger.warn({ err: historyErr, oltId }, 'Failed to bulk log ONU history (ignoring)');
                }
            }

            // 3b. Deteksi perubahan redaman signifikan per ONU (bandingkan
            // signal lama vs baru). Best-effort, di luar transaksi — sebagian
            // besar return cepat (no change), DB query hanya saat ada perubahan.
            // Cap jumlah alert per cycle (anti-flood mass-event) — per review HIGH-1.
            let signalAlertsCreated = 0;
            for (const v of valuesToUpsert) {
                if (signalAlertsCreated >= env.SIGNAL_MAX_ALERTS_PER_SYNC) break;
                if (v.status !== 'online' || v.lastRxPower == null) continue;
                const oldSignal = oldSignalMap.get(v.sn);
                if (oldSignal == null) continue; // first discovery, no baseline
                const created = await checkSignalChange({
                    routerId: olt.parentId,
                    tenantId: tenantId || olt.tenantId,
                    onuName: v.name || v.sn,
                    sn: v.sn,
                    oltName: olt.name,
                    source: 'olt',
                    oldSignal,
                    newSignal: v.lastRxPower,
                });
                if (created) signalAlertsCreated++;
            }

            added = valuesToUpsert.length;
        }

        // 4. Orphan detection — mark ONUs that exist in DB for this OLT but are
        // no longer returned by the driver (e.g. removed from OLT configuration).
        // We only do this if the driver returned at least 1 ONU (partial-failure guard).
        let orphaned = 0;
        if (driverOnus.length > 0) {
            const seenSns = new Set(driverOnus.map(d => d.sn).filter(Boolean));
            const dbOnus = await db.select({ id: onus.id, sn: onus.sn })
                .from(onus)
                .where(and(eq(onus.oltId, oltId), isNull(onus.archivedAt)));

            const orphanIds = dbOnus.filter(o => !seenSns.has(o.sn)).map(o => o.id);
            if (orphanIds.length > 0) {
                await db.update(onus).set({
                    status: 'offline',
                    lastDownReason: ORPHAN_REASON,
                    updatedAt: now,
                }).where(inArray(onus.id, orphanIds));
                orphaned = orphanIds.length;
                logger.info({ oltId, oltName: olt.name, orphaned }, '🗑️ Marked orphan ONUs (not in OLT list anymore)');
            }
        }

        return { added, updated: orphaned, total: driverOnus.length };
    }

    /**
     * Manually archive an ONU (soft-delete). Admin invokes this when an ONU
     * is duplicate, retired, or should be hidden from the map.
     *
     * Archive is STICKY against polling — even if OLT keeps reporting this SN,
     * syncOnuInventory will NOT unarchive it. Operator must explicitly call
     * unarchiveOnu() to bring it back. This prevents the bug where polling
     * reverses every delete-from-map action.
     */
    async archiveOnu(onuId: string, tenantId?: string): Promise<boolean> {
        const filters = [eq(onus.id, onuId)];
        if (tenantId) filters.push(eq(onus.tenantId, tenantId));
        const result = await db.update(onus).set({
            archivedAt: new Date(),
            status: 'offline',
            lastDownReason: 'Manually archived by admin',
            updatedAt: new Date(),
        }).where(and(...filters)).returning({ id: onus.id });
        return result.length > 0;
    }

    /**
     * Restore a previously archived ONU. Operator escape hatch when they
     * change their mind about archiving, or to bring back ONUs that were
     * archived by a previous bulk cleanup.
     */
    async unarchiveOnu(onuId: string, tenantId?: string): Promise<boolean> {
        const filters = [eq(onus.id, onuId)];
        if (tenantId) filters.push(eq(onus.tenantId, tenantId));
        const result = await db.update(onus).set({
            archivedAt: null,
            lastDownReason: null,
            updatedAt: new Date(),
        }).where(and(...filters)).returning({ id: onus.id });
        return result.length > 0;
    }

    async getAllOnusWithCoordinates(tenantId?: string, userId?: string, userRole?: string): Promise<any[]> {
        const { getTableColumns } = await import('drizzle-orm');
        const onusColumns = getTableColumns(onus);
        // Map renders ONU markers — exclude CPE routers, which would double-render
        // every customer that has TR-069 enabled on their CPE (different SN, same IP).
        const filters = [
            isNotNull(onus.latitude),
            isNotNull(onus.longitude),
            isNull(onus.archivedAt),
            eq(onus.deviceClass, 'onu'),
        ];
        if (tenantId) filters.push(eq(onus.tenantId, tenantId));

        if (userId && userRole && userRole !== 'admin' && userRole !== 'superadmin') {
            const { userRouters } = await import('../db/schema/user-routers.js');
            const assigned = await db.select({ routerId: userRouters.routerId }).from(userRouters).where(eq(userRouters.userId, userId));
            const routerIds = assigned.map(a => a.routerId);
            if (routerIds.length === 0) return [];
            filters.push(inArray(onus.routerId, routerIds));
        }

        return db.select({
            ...onusColumns,
            oltId: onus.oltId,
            routerId: olts.parentId,
            oltName: olts.name
        }).from(onus).leftJoin(olts, eq(onus.oltId, olts.id)).where(and(...filters));
    }

    async updateOnu(id: string, data: Partial<Onu>, tenantId?: string, userId?: string, userRole?: string): Promise<Onu | undefined> {
        const filters = [eq(onus.id, id)];
        if (tenantId) filters.push(eq(onus.tenantId, tenantId));

        if (userId && userRole && userRole !== 'admin' && userRole !== 'superadmin') {
            const [onu] = await db.select().from(onus).where(and(...filters));
            if (!onu || !onu.routerId) return undefined;
            const { userRouters } = await import('../db/schema/user-routers.js');
            const [assignment] = await db.select().from(userRouters).where(and(eq(userRouters.userId, userId), eq(userRouters.routerId, onu.routerId)));
            if (!assignment) return undefined;
        }

        const [updated] = await db.update(onus).set({ ...data, updatedAt: new Date() }).where(and(...filters)).returning();
        return updated;
    }

    /**
     * Move an ONU record from its current OLT to a different OLT, preserving
     * SN, latitude/longitude, name, description, and ACS metadata. Used when
     * a customer's PON port physically migrates between OLTs (e.g. rebuild)
     * without losing map placement or audit history.
     *
     * Field updates:
     *   - olt_id      → target OLT
     *   - pon_port    → new physical port string on target OLT (operator-supplied)
     *   - router_id   → derived from target OLT's parent router (topology link)
     *   - last_seen_olt → null so the next OLT sync immediately refreshes it
     *
     * Does NOT touch the source OLT — operator should remove the stale
     * registration on the old OLT separately to prevent dual-listing.
     */
    async reassignOnu(
        onuId: string,
        targetOltId: string,
        targetPonPort: string | null,
        tenantId?: string
    ): Promise<Onu | undefined> {
        const filters = [eq(onus.id, onuId)];
        if (tenantId) filters.push(eq(onus.tenantId, tenantId));
        const [onu] = await db.select().from(onus).where(and(...filters));
        if (!onu) return undefined;

        const targetFilters = [eq(olts.id, targetOltId)];
        if (tenantId) targetFilters.push(eq(olts.tenantId, tenantId));
        const [targetOlt] = await db.select().from(olts).where(and(...targetFilters));
        if (!targetOlt) throw new ApiError(404, 'Target OLT not found');

        if (onu.oltId === targetOltId && onu.ponPort === targetPonPort) {
            return onu; // no-op
        }

        const [updated] = await db.update(onus).set({
            oltId: targetOltId,
            ponPort: targetPonPort,
            routerId: targetOlt.parentId,
            lastSeenOlt: null,
            updatedAt: new Date(),
        }).where(eq(onus.id, onuId)).returning();

        logger.info({
            onuId,
            sn: onu.sn,
            fromOltId: onu.oltId,
            toOltId: targetOltId,
            newPonPort: targetPonPort,
        }, '🔀 ONU reassigned to new OLT');

        return updated;
    }

    async rebootOnu(oltId: string, ponId: string, onuId: string, tenantId?: string): Promise<boolean> {
        const olt = await this.findByIdInternal(oltId, tenantId);
        if (!olt) throw new Error('OLT not found');

        try {
            const { OltDriverFactory } = await import('./olt-drivers/driver.factory.js');
            const decryptedPassword = olt.webPassword ? decrypt(olt.webPassword) : undefined;
            const driver = OltDriverFactory.getDriver(
                olt.type || 'generic',
                olt.host,
                olt.webPort || undefined,
                olt.webUsername || undefined,
                decryptedPassword,
                olt.webProtocol || undefined
            );

            await driver.connect();
            const success = await driver.rebootOnu(ponId, onuId);
            await driver.disconnect();
            return success;
        } catch (error) {
            logger.error({ err: error, oltId, ponId, onuId }, 'Failed to reboot ONU');
            return false;
        }
    }

    async getOnusByRouter(routerId: string, tenantId?: string): Promise<Onu[]> {
        const filters = [eq(onus.routerId, routerId), isNull(onus.archivedAt)];
        if (tenantId) filters.push(eq(onus.tenantId, tenantId));
        return db.select().from(onus).where(and(...filters));
    }

    /**
     * Auto-cleanup ghost ONUs — devices that went offline and never came back.
     *
     * Two-stage soft-delete:
     *   1. Offline + lastSeen < (NOW - retentionDays)  → set archivedAt = NOW (hidden from map)
     *   2. archivedAt < (NOW - retentionDays * 2)      → hard-delete from DB
     *
     * Auto-restore: when the same SN reappears in polling, syncOnuInventory()
     * resets archivedAt to NULL via upsert, so the ONU returns to the map
     * with its original coordinates and metadata intact.
     */
    async cleanupGhostOnus(tenantId: string, retentionDays: number): Promise<{ archived: number; deleted: number }> {
        const archiveCutoff = new Date();
        archiveCutoff.setDate(archiveCutoff.getDate() - retentionDays);

        const archivedRows = await db.update(onus).set({
            archivedAt: new Date(),
        }).where(and(
            eq(onus.tenantId, tenantId),
            inArray(onus.status, ['offline', 'lost', 'power_down', 'dying_gasp', 'unknown']),
            lt(onus.lastSeen, archiveCutoff),
            isNull(onus.archivedAt),
        )).returning({ id: onus.id });

        const deleteCutoff = new Date();
        deleteCutoff.setDate(deleteCutoff.getDate() - retentionDays * 2);

        const deletedRows = await db.delete(onus).where(and(
            eq(onus.tenantId, tenantId),
            isNotNull(onus.archivedAt),
            lt(onus.archivedAt, deleteCutoff),
        )).returning({ id: onus.id });

        if (archivedRows.length > 0 || deletedRows.length > 0) {
            logger.info({
                tenantId,
                archived: archivedRows.length,
                deleted: deletedRows.length,
                retentionDays,
            }, '🧹 Ghost ONU cleanup complete');
        }

        return { archived: archivedRows.length, deleted: deletedRows.length };
    }
}

export const oltService = OltService.getInstance();

import { sql, and, eq, ilike, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    routers,
    onus,
    customers,
    pppoeSessions,
    routerNetwatch,
    olts,
} from '../db/schema/index.js';
import { logger } from '../lib/logger.js';

/**
 * Global search aggregator — 5 entitas paralel.
 *
 * Tenant scoping: kalau tenantId disediakan, semua query di-filter
 * ke tenant tersebut. Untuk SuperAdmin tanpa tenantId, search jalan
 * cross-tenant (sesuai pattern getEffectiveTenantId).
 *
 * Min query length: 2 char — supaya tidak overload DB dengan
 * pattern '%a%' yang match jutaan row.
 *
 * Per-type limit default 5 — total max 25 hasil (5×5 entitas).
 * Operator scroll kalau perlu, tapi 5 teratas per kategori sudah
 * cukup untuk navigasi cepat.
 */

const MIN_QUERY_LENGTH = 2;
const DEFAULT_PER_TYPE_LIMIT = 5;

export interface SearchResultItem {
    id: string;
    label: string;
    subtitle?: string;
    navigate: string;                  // path untuk Link/navigate ke detail
    // Extra metadata, optional, untuk UI
    badge?: string;
    icon?: string;                     // identifier untuk frontend pick icon
}

export interface SearchResults {
    router: SearchResultItem[];
    olt: SearchResultItem[];
    onu: SearchResultItem[];
    customer: SearchResultItem[];
    pppoe: SearchResultItem[];
    netwatch: SearchResultItem[];
    total: number;
    query: string;
}

class SearchService {
    /**
     * Main entry point — query semua 5 entitas paralel.
     */
    async searchAll(
        query: string,
        tenantId?: string,
        perTypeLimit: number = DEFAULT_PER_TYPE_LIMIT
    ): Promise<SearchResults> {
        const trimmed = query.trim();

        if (trimmed.length < MIN_QUERY_LENGTH) {
            return this.emptyResult(trimmed);
        }

        // Sanitize untuk LIKE — escape % dan _
        const pattern = `%${trimmed.replace(/[%_]/g, (m) => `\\${m}`)}%`;

        try {
            const [router, olt, onu, customer, pppoe, netwatch] = await Promise.all([
                this.searchRouters(pattern, tenantId, perTypeLimit),
                this.searchOlts(pattern, tenantId, perTypeLimit),
                this.searchOnus(pattern, tenantId, perTypeLimit),
                this.searchCustomers(pattern, tenantId, perTypeLimit),
                this.searchPppoe(pattern, tenantId, perTypeLimit),
                this.searchNetwatch(pattern, tenantId, perTypeLimit),
            ]);

            const total =
                router.length + olt.length + onu.length +
                customer.length + pppoe.length + netwatch.length;

            return { router, olt, onu, customer, pppoe, netwatch, total, query: trimmed };
        } catch (err: any) {
            logger.error({ err: err.message, query: trimmed, tenantId }, 'Global search failed');
            return this.emptyResult(trimmed);
        }
    }

    private async searchOlts(
        pattern: string,
        tenantId: string | undefined,
        limit: number
    ): Promise<SearchResultItem[]> {
        const conditions = [
            or(
                ilike(olts.name, pattern),
                ilike(olts.host, pattern),
                ilike(olts.description, pattern),
            )!,
        ];
        if (tenantId) conditions.push(eq(olts.tenantId, tenantId));

        const rows = await db
            .select({
                id: olts.id,
                name: olts.name,
                host: olts.host,
                type: olts.type,
                status: olts.status,
            })
            .from(olts)
            .where(and(...conditions))
            .limit(limit);

        return rows.map((o) => ({
            id: o.id,
            label: o.name,
            subtitle: `${o.host} · ${o.type}`,
            navigate: `/olts/${o.id}`,
            badge: o.status ?? undefined,
            icon: 'olt',
        }));
    }

    private async searchRouters(
        pattern: string,
        tenantId: string | undefined,
        limit: number
    ): Promise<SearchResultItem[]> {
        const conditions = [
            or(
                ilike(routers.name, pattern),
                ilike(routers.host, pattern),
                ilike(routers.identity, pattern),
                ilike(routers.model, pattern),
            )!,
        ];
        if (tenantId) conditions.push(eq(routers.tenantId, tenantId));

        const rows = await db
            .select({
                id: routers.id,
                name: routers.name,
                host: routers.host,
                identity: routers.identity,
                status: routers.status,
            })
            .from(routers)
            .where(and(...conditions))
            .limit(limit);

        return rows.map((r) => ({
            id: r.id,
            label: r.name,
            subtitle: `${r.host}${r.identity ? ' · ' + r.identity : ''}`,
            navigate: `/routers/${r.id}`,
            badge: r.status ?? undefined,
            icon: 'router',
        }));
    }

    private async searchOnus(
        pattern: string,
        tenantId: string | undefined,
        limit: number
    ): Promise<SearchResultItem[]> {
        const conditions = [
            or(
                ilike(onus.sn, pattern),
                ilike(onus.name, pattern),
                ilike(onus.host, pattern),
            )!,
        ];
        if (tenantId) conditions.push(eq(onus.tenantId, tenantId));

        const rows = await db
            .select({
                id: onus.id,
                oltId: onus.oltId,
                sn: onus.sn,
                name: onus.name,
                host: onus.host,
                status: onus.status,
            })
            .from(onus)
            .where(and(...conditions))
            .limit(limit);

        return rows.map((o) => ({
            id: o.id,
            label: o.name || o.sn,
            subtitle: `SN: ${o.sn}${o.host ? ' · ' + o.host : ''}`,
            // ONU detail page: scroll target di OLT detail. Pakai query
            // param ?onu=<id> supaya page bisa highlight + scroll
            navigate: o.oltId ? `/olts/${o.oltId}?onu=${o.id}` : '/olts',
            badge: o.status ?? undefined,
            icon: 'onu',
        }));
    }

    private async searchCustomers(
        pattern: string,
        tenantId: string | undefined,
        limit: number
    ): Promise<SearchResultItem[]> {
        const conditions = [
            or(
                ilike(customers.name, pattern),
                ilike(customers.code, pattern),
                ilike(customers.phone, pattern),
                ilike(customers.email, pattern),
                ilike(customers.address, pattern),
            )!,
        ];
        if (tenantId) conditions.push(eq(customers.tenantId, tenantId));

        const rows = await db
            .select({
                id: customers.id,
                code: customers.code,
                name: customers.name,
                phone: customers.phone,
                email: customers.email,
            })
            .from(customers)
            .where(and(...conditions))
            .limit(limit);

        return rows.map((c) => ({
            id: c.id,
            label: c.name,
            subtitle: [c.code, c.phone, c.email].filter(Boolean).join(' · '),
            // Customer 360° view (Phase 5) — all info in 1 page
            navigate: `/customers/${c.id}/360`,
            icon: 'customer',
        }));
    }

    private async searchPppoe(
        pattern: string,
        tenantId: string | undefined,
        limit: number
    ): Promise<SearchResultItem[]> {
        // PPPoE sessions table — search by username (name field)
        // Note: pppoe_sessions belum ada tenant_id direct, kita join via routers
        const conditions = [ilike(pppoeSessions.name, pattern)];

        // Untuk tenant scoping: join routers + filter tenant
        const baseQuery = db
            .select({
                routerId: pppoeSessions.routerId,
                name: pppoeSessions.name,
                address: pppoeSessions.address,
                routerTenantId: routers.tenantId,
                routerName: routers.name,
            })
            .from(pppoeSessions)
            .innerJoin(routers, eq(pppoeSessions.routerId, routers.id))
            .where(
                tenantId
                    ? and(...conditions, eq(routers.tenantId, tenantId))
                    : and(...conditions)
            )
            .limit(limit);

        const rows = await baseQuery;

        return rows.map((p) => ({
            id: `${p.routerId}-${p.name}`,
            label: p.name,
            subtitle: `${p.address || '—'} · ${p.routerName}`,
            navigate: `/routers/${p.routerId}?tab=pppoe`,
            icon: 'pppoe',
        }));
    }

    private async searchNetwatch(
        pattern: string,
        tenantId: string | undefined,
        limit: number
    ): Promise<SearchResultItem[]> {
        const conditions = [
            or(
                ilike(routerNetwatch.host, pattern),
                ilike(routerNetwatch.name, pattern),
            )!,
        ];
        if (tenantId) conditions.push(eq(routerNetwatch.tenantId, tenantId));

        const rows = await db
            .select({
                id: routerNetwatch.id,
                routerId: routerNetwatch.routerId,
                host: routerNetwatch.host,
                name: routerNetwatch.name,
                status: routerNetwatch.status,
            })
            .from(routerNetwatch)
            .where(and(...conditions))
            .limit(limit);

        return rows.map((n) => ({
            id: n.id,
            label: n.name || n.host || '—',
            subtitle: n.host || '—',
            navigate: `/routers/${n.routerId}?tab=netwatch`,
            badge: n.status ?? undefined,
            icon: 'netwatch',
        }));
    }

    private emptyResult(query: string): SearchResults {
        return {
            router: [],
            olt: [],
            onu: [],
            customer: [],
            pppoe: [],
            netwatch: [],
            total: 0,
            query,
        };
    }
}

export const searchService = new SearchService();

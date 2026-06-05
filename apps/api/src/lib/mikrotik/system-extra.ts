/**
 * MikroTik /system/* and /log helpers that the MikHMON Console exposes
 * but billing.ts/system.ts didn't cover.
 *
 *   - /log/print                          (paginated viewer + topic filter)
 *   - /system/package/print               (read-only)
 *   - /system/scheduler/set + /remove     (CRUD complete — billing.ts only
 *                                          had list/add/delete by id)
 *
 * Backup file management is intentionally NOT here — MikHMON Console
 * delegates to the existing `router-backup.service.ts` which already
 * handles the HTTP Push upload + DB record + download flow.
 */
import { safeWrite } from './connection.js';

const toBool = (v: any): boolean | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    if (typeof v === 'boolean') return v;
    const s = String(v).toLowerCase();
    if (s === 'true' || s === 'yes') return true;
    if (s === 'false' || s === 'no') return false;
    return undefined;
};

// ─────────────────────────────────────────────────────────────────────────
// /log/print
//
// RouterOS log is a ring buffer (default ~1000 entries). We fetch the
// tail and let the client filter further. Topic filtering is done on
// the RouterOS side via the API query syntax so the payload stays small
// even on noisy routers.
// ─────────────────────────────────────────────────────────────────────────

export interface LogEntry {
    id: string;
    time?: string;
    topics?: string;     // csv: "system,info"
    message?: string;
}

export interface LogQuery {
    /** Comma-separated topics to filter (server-side AND on each entry). */
    topics?: string;
    /** Max rows to return. RouterOS log is capped ~1000, default 200. */
    limit?: number;
}

export async function getLog(api: any, query: LogQuery = {}): Promise<LogEntry[]> {
    const cmd: string[] = ['/log/print'];

    // Use proplist to keep payload tight
    cmd.push('=.proplist=.id,time,topics,message');

    // Server-side topic filter using RouterOS API query syntax. We add an
    // OR-list of `?topics=<topic>` predicates; RouterOS treats `?` queries
    // as an AND chain by default, so we wrap with `?#|<n>` to switch to
    // OR. For a single topic this collapses to just `?topics=<topic>`.
    if (query.topics?.trim()) {
        const topics = query.topics.split(',').map((t) => t.trim()).filter(Boolean);
        if (topics.length === 1) {
            cmd.push(`?topics=${topics[0]}`);
        } else if (topics.length > 1) {
            topics.forEach((t) => cmd.push(`?topics=${t}`));
            cmd.push(`?#${'|'.repeat(topics.length - 1)}`);
        }
    }

    const result = await safeWrite(api, cmd);
    // RouterOS returns log oldest→newest. Reverse so newest is first.
    const mapped: LogEntry[] = result.map((e: any) => ({
        id: e['.id'],
        time: e.time,
        topics: e.topics,
        message: e.message,
    })).reverse();

    const limit = Math.max(1, Math.min(2000, query.limit ?? 200));
    return mapped.slice(0, limit);
}

// ─────────────────────────────────────────────────────────────────────────
// /system/package/print — read-only
// ─────────────────────────────────────────────────────────────────────────

export interface SystemPackage {
    id: string;
    name: string;
    version?: string;
    buildTime?: string;
    scheduled?: string;
    disabled?: boolean;
}

export async function listSystemPackages(api: any): Promise<SystemPackage[]> {
    const result = await safeWrite(api, '/system/package/print');
    return result.map((p: any) => ({
        id: p['.id'],
        name: p.name,
        version: p.version,
        buildTime: p['build-time'],
        scheduled: p.scheduled,
        disabled: toBool(p.disabled),
    }));
}

// ─────────────────────────────────────────────────────────────────────────
// /system/scheduler — completes the CRUD billing.ts left at list/add/del
// ─────────────────────────────────────────────────────────────────────────

export interface SchedulerInput {
    name: string;
    onEvent: string;
    startTime?: string;
    startDate?: string;
    interval?: string;
    comment?: string;
    disabled?: boolean;
}

function schedulerToArgs(input: Partial<SchedulerInput>): string[] {
    const args: string[] = [];
    const push = (key: string, val: any) => {
        if (val === undefined || val === null || val === '') return;
        if (typeof val === 'boolean') args.push(`=${key}=${val ? 'yes' : 'no'}`);
        else args.push(`=${key}=${val}`);
    };
    push('name', input.name);
    push('on-event', input.onEvent);
    push('start-time', input.startTime);
    push('start-date', input.startDate);
    push('interval', input.interval);
    push('comment', input.comment);
    push('disabled', input.disabled);
    return args;
}

export async function setScheduler(api: any, id: string, input: Partial<SchedulerInput>): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/system/scheduler/set', `=.id=${id}`, ...schedulerToArgs(input)]);
}

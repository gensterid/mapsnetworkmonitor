/**
 * MikroTik /queue/simple CRUD + stats helpers.
 *
 * The existing getSimpleQueues() in network.ts returns a read-only view
 * without RouterOS .id (which is required to set/remove). This module
 * owns the full CRUD surface plus a per-queue traffic snapshot used by
 * the MikHMON Queue page chart.
 *
 * RouterOS field cheat-sheet (most common):
 *   name              — display name (unique recommended)
 *   target            — IP / network / interface to limit (multi via comma)
 *   max-limit         — rx/tx in form "1M/2M" (the hard cap)
 *   limit-at          — guaranteed minimum, same format
 *   burst-limit       — temporary burst ceiling
 *   burst-threshold   — when avg < this, burst is allowed
 *   burst-time        — averaging window for burst
 *   priority          — 1..8 (1 = highest)
 *   parent            — queue tree parent (string or "none")
 *   queue             — per-direction queue discipline (e.g. "default/default")
 *   disabled          — bool
 *   comment           — operator note
 */
import { safeWrite } from './connection.js';

export interface SimpleQueueFull {
    id: string;
    name: string;
    target?: string;
    maxLimit?: string;       // "rxMax/txMax"
    limitAt?: string;
    burstLimit?: string;
    burstThreshold?: string;
    burstTime?: string;
    priority?: string;
    parent?: string;
    queue?: string;
    comment?: string;
    disabled?: boolean;
    dynamic?: boolean;
    invalid?: boolean;
    bytes?: string;          // "rxBytes/txBytes" — RouterOS reports as a pair
    packets?: string;
    // Polled separately via /queue/simple/print stats — split rx/tx after parse
    rateRx?: number;         // bits/sec
    rateTx?: number;
}

export interface SimpleQueueInput {
    name: string;
    target: string;
    maxLimit?: string;
    limitAt?: string;
    burstLimit?: string;
    burstThreshold?: string;
    burstTime?: string;
    priority?: string;
    parent?: string;
    queue?: string;
    comment?: string;
    disabled?: boolean;
}

const toBool = (v: any): boolean | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    if (typeof v === 'boolean') return v;
    const s = String(v).toLowerCase();
    if (s === 'true' || s === 'yes') return true;
    if (s === 'false' || s === 'no') return false;
    return undefined;
};

function mapQueue(q: any): SimpleQueueFull {
    return {
        id: q['.id'],
        name: q.name,
        target: q.target,
        maxLimit: q['max-limit'],
        limitAt: q['limit-at'],
        burstLimit: q['burst-limit'],
        burstThreshold: q['burst-threshold'],
        burstTime: q['burst-time'],
        priority: q.priority,
        parent: q.parent,
        queue: q.queue,
        comment: q.comment,
        disabled: toBool(q.disabled),
        dynamic: toBool(q.dynamic),
        invalid: toBool(q.invalid),
        bytes: q.bytes,
        packets: q.packets,
    };
}

function queueToArgs(input: Partial<SimpleQueueInput>): string[] {
    const args: string[] = [];
    const push = (key: string, val: any) => {
        if (val === undefined || val === null || val === '') return;
        if (typeof val === 'boolean') args.push(`=${key}=${val ? 'yes' : 'no'}`);
        else args.push(`=${key}=${val}`);
    };
    push('name', input.name);
    push('target', input.target);
    push('max-limit', input.maxLimit);
    push('limit-at', input.limitAt);
    push('burst-limit', input.burstLimit);
    push('burst-threshold', input.burstThreshold);
    push('burst-time', input.burstTime);
    push('priority', input.priority);
    push('parent', input.parent);
    push('queue', input.queue);
    push('comment', input.comment);
    push('disabled', input.disabled);
    return args;
}

export async function listSimpleQueues(api: any): Promise<SimpleQueueFull[]> {
    const result = await safeWrite(api, '/queue/simple/print');
    return result.map(mapQueue);
}

export async function addSimpleQueue(api: any, input: SimpleQueueInput): Promise<string> {
    if (!input.name?.trim()) throw new Error('name wajib');
    if (!input.target?.trim()) throw new Error('target wajib (IP/network/interface)');
    const result = await safeWrite(api, ['/queue/simple/add', ...queueToArgs(input)]);
    return result?.[0]?.ret || '';
}

export async function setSimpleQueue(api: any, id: string, input: Partial<SimpleQueueInput>): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/queue/simple/set', `=.id=${id}`, ...queueToArgs(input)]);
}

export async function removeSimpleQueue(api: any, id: string): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/queue/simple/remove', `=.id=${id}`]);
}

// ─────────────────────────────────────────────────────────────────────────
// Stats snapshot — used for the per-queue traffic chart.
//
// RouterOS exposes live `rate` and `packet-rate` when you pass `stats=`
// in the print proplist. We poll all queues in one shot (single RouterOS
// roundtrip) and the frontend chart subscribes via the global refresh
// interval. Rate is reported as "rxBps/txBps" — we split into numbers.
// ─────────────────────────────────────────────────────────────────────────

export interface SimpleQueueStat {
    id: string;
    name: string;
    rateRx: number;       // bits per second
    rateTx: number;
    packetRateRx: number;
    packetRateTx: number;
    queuedBytesRx: number;
    queuedBytesTx: number;
    droppedRx: number;
    droppedTx: number;
}

function parsePair(raw: string | undefined): [number, number] {
    if (!raw) return [0, 0];
    const parts = String(raw).split('/');
    const rx = parseInt(parts[0] || '0', 10);
    const tx = parseInt(parts[1] || '0', 10);
    return [Number.isFinite(rx) ? rx : 0, Number.isFinite(tx) ? tx : 0];
}

export async function getSimpleQueueStats(api: any): Promise<SimpleQueueStat[]> {
    // `=stats=` toggles RouterOS into live-stat mode for this print call.
    const result = await safeWrite(api, [
        '/queue/simple/print',
        '=stats=',
    ]);
    return result.map((q: any) => {
        const [rateRx, rateTx] = parsePair(q.rate);
        const [packetRateRx, packetRateTx] = parsePair(q['packet-rate']);
        const [queuedBytesRx, queuedBytesTx] = parsePair(q['queued-bytes']);
        const [droppedRx, droppedTx] = parsePair(q.dropped);
        return {
            id: q['.id'],
            name: q.name,
            rateRx,
            rateTx,
            packetRateRx,
            packetRateTx,
            queuedBytesRx,
            queuedBytesTx,
            droppedRx,
            droppedTx,
        };
    });
}

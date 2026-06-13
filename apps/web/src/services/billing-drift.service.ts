import { get, post } from '@/lib/api';

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
    expected: { profile: string; comment: string; disabled: boolean };
    actual: { profile?: string; comment?: string; disabled?: boolean; exists: boolean };
}

export interface DriftReport {
    scannedAt: string;
    routersScanned: number;
    routersFailed: { routerId: string; routerName?: string; error: string }[];
    subscriptionsChecked: number;
    items: DriftItem[];
}

export interface DriftSummary {
    count: number;
    scannedAt: string | null;
    routersFailed: number;
}

export const billingDriftService = {
    summary: () => get<DriftSummary>('/billing/drift/summary'),
    scan: () => post<DriftReport>('/billing/drift/scan', {}),
    resync: (subscriptionId: string, opts: { kickSession?: boolean } = {}) =>
        post<{ ok: boolean; applied: DriftField[]; message?: string }>(`/billing/drift/resync/${subscriptionId}`, opts),
};

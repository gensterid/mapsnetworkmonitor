import { get } from '@/lib/api';

export interface Customer360Summary {
    activeSubscriptions: number;
    totalInvoices: number;
    unpaidInvoices: number;
    unpaidAmount: number;
    nextDueAt: string | null;
    nextExpiringSubscriptionAt: string | null;
    networkStatus: 'online' | 'offline' | 'partial' | 'unknown';
}

export interface Customer360Data {
    customer: any;
    subscriptions: any[];
    invoices: any[];
    payments: any[];
    pppoeActive: any[];
    netwatch: any[];
    onuLinked: any[];
    waNotifs: any[];
    activity: any[];
    summary: Customer360Summary;
}

export const customer360Service = {
    get: (id: string) => get<Customer360Data>(`/customers/${id}/360`),
};

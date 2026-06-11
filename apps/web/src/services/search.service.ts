import { get } from '@/lib/api';

export interface SearchResultItem {
    id: string;
    label: string;
    subtitle?: string;
    navigate: string;
    badge?: string;
    icon?: 'router' | 'onu' | 'customer' | 'pppoe' | 'netwatch';
}

export interface SearchResults {
    router: SearchResultItem[];
    onu: SearchResultItem[];
    customer: SearchResultItem[];
    pppoe: SearchResultItem[];
    netwatch: SearchResultItem[];
    total: number;
    query: string;
}

export const searchService = {
    globalSearch: (q: string, limit = 5) =>
        get<SearchResults>(`/search?q=${encodeURIComponent(q)}&limit=${limit}`),
};

import { useQuery } from '@tanstack/react-query';
import { customer360Service } from '../services/customer-360.service';

/**
 * Fetch Customer 360° aggregate data.
 * Refresh tiap 30 detik untuk realtime status network + billing.
 */
export function useCustomer360(id) {
    return useQuery({
        queryKey: ['customer-360', id],
        queryFn: () => customer360Service.get(id),
        enabled: !!id,
        refetchInterval: 30_000,
        staleTime: 10_000,
    });
}

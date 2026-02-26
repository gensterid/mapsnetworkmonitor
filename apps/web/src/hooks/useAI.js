import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiService } from '@/lib/api';
import { useCurrentUser } from './index';

// Query Keys
export const aiKeys = {
    all: ['ai'],
    summary: () => [...aiKeys.all, 'summary'],
    diagnosis: (routerId) => [...aiKeys.all, 'diagnosis', routerId],
};

/**
 * Hook to get AI status for current user
 */
export function useAiStatus() {
    const { data: user } = useCurrentUser();
    return {
        isEnabled: user?.aiEnabled || false,
        hasKey: !!user?.aiApiKey,
    };
}

/**
 * Hook to get daily network summary
 */
export function useAiNetworkSummary(options = {}) {
    const { isEnabled } = useAiStatus();

    return useQuery({
        queryKey: aiKeys.summary(),
        queryFn: () => aiService.getNetworkSummary(),
        staleTime: 1000 * 60 * 60, // 1 hour stale time for daily summary
        refetchOnWindowFocus: false,
        enabled: isEnabled, // Only run if AI is enabled
        ...options,
    });
}

/**
 * Hook to request an alert analysis
 */
export function useAnalyzeAlert() {
    return useMutation({
        mutationFn: (alertId) => aiService.analyzeAlert(alertId),
    });
}

/**
 * Hook to diagnose a router
 */
export function useDiagnoseRouter() {
    return useMutation({
        mutationFn: (routerId) => aiService.diagnoseRouter(routerId),
    });
}

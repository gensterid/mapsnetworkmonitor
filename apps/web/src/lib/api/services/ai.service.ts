import { get, post } from '../client';

/**
 * AI Service
 * Handles AI-powered diagnostics and summaries
 */
export const aiService = {
    // Analyze an alert
    analyzeAlert: (alertId: string) => post(`/ai/analyze-alert/${alertId}`),

    // Generate daily network summary
    getNetworkSummary: () => get('/ai/network-summary'),

    // Diagnose a router
    diagnoseRouter: (routerId: string) => post(`/ai/diagnose-router/${routerId}`),
};

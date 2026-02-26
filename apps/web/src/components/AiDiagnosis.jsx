import React, { useState } from 'react';
import { Sparkles, RefreshCw, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAnalyzeAlert, useAiStatus } from '@/hooks';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';

/**
 * AI Diagnosis Component
 * Displays AI-generated analysis for an alert and allows manual trigger
 */
export default function AiDiagnosis({ alertId, initialAnalysis, severity }) {
    const [analysis, setAnalysis] = useState(initialAnalysis);
    const [isExpanded, setIsExpanded] = useState(severity === 'critical');
    const { isEnabled, hasKey } = useAiStatus();
    const navigate = useNavigate();
    const analyzeMutation = useAnalyzeAlert();

    const handleAnalyze = async () => {
        try {
            const result = await analyzeMutation.mutateAsync(alertId);
            if (result?.analysis) {
                setAnalysis(result.analysis);
                setIsExpanded(true);
            }
        } catch (err) {
            console.error('Failed to get AI analysis:', err);
        }
    };

    if (!analysis && !analyzeMutation.isPending) {
        return (
            <div className="mt-2">
                <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                        if (!isEnabled || !hasKey) {
                            navigate('/settings?tab=ai');
                            return;
                        }
                        handleAnalyze();
                    }}
                    className="text-primary hover:text-blue-400 group flex items-center gap-1.5 p-0 h-auto"
                >
                    <Sparkles className="w-3.5 h-3.5 group-hover:animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                        {!isEnabled || !hasKey ? 'Configure AI for Diagnosis' : 'Get AI Diagnosis'}
                    </span>
                </Button>
            </div>
        );
    }

    return (
        <div className={clsx(
            "mt-3 rounded-lg border overflow-hidden transition-all duration-300",
            severity === 'critical' ? "border-red-500/20 bg-red-500/5" : "border-slate-700 bg-slate-800/50"
        )}>
            {/* Header */}
            <div
                className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-white/5 select-none"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    <div className="bg-primary/20 p-1 rounded">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="text-xs font-bold text-white uppercase tracking-tight flex items-center gap-1.5">
                        AI Smart Diagnosis
                        {analyzeMutation.isPending && <RefreshCw className="w-3 h-3 animate-spin text-primary" />}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {analysis && (
                        <button
                            onClick={(e) => { e.stopPropagation(); handleAnalyze(); }}
                            disabled={analyzeMutation.isPending}
                            className="p-1 text-slate-500 hover:text-white transition-colors"
                            title="Refresh Analysis"
                        >
                            <RefreshCw className={clsx("w-3.5 h-3.5", analyzeMutation.isPending && "animate-spin")} />
                        </button>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </div>
            </div>

            {/* Content */}
            {isExpanded && (
                <div className="px-3 pb-3 pt-1">
                    {analyzeMutation.isPending && !analysis ? (
                        <div className="flex items-center gap-2 py-2 text-slate-500">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span className="text-xs italic tracking-wide">Gemini is analyzing the incident...</span>
                        </div>
                    ) : (
                        <div className="text-xs leading-relaxed text-slate-300 whitespace-pre-wrap font-sans">
                            {analysis}
                        </div>
                    )}

                    {analyzeMutation.isError && (
                        <div className="flex items-center gap-2 mt-2 text-red-400 text-[10px] bg-red-500/10 p-2 rounded">
                            <AlertCircle className="w-3 h-3" />
                            <span>Failed to reach AI diagnostic service. Please try again.</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

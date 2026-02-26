import React, { useState } from 'react';
import { Sparkles, RefreshCw, AlertCircle, X, ChevronRight, Activity } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useDiagnoseRouter } from '@/hooks';
import clsx from 'clsx';

/**
 * Router AI Diagnosis Component
 * Performs a deep health check on a router using Gemini
 */
export default function RouterAiDiagnosis({ routerId, routerName }) {
    const [diagnosis, setDiagnosis] = useState(null);
    const [isOpen, setIsOpen] = useState(false);
    const diagnoseMutation = useDiagnoseRouter();

    const handleDiagnose = async () => {
        try {
            setIsOpen(true);
            const result = await diagnoseMutation.mutateAsync(routerId);
            if (result?.diagnosis) {
                setDiagnosis(result.diagnosis);
            }
        } catch (err) {
            console.error('Failed to diagnose router:', err);
        }
    };

    return (
        <div className="mt-4">
            {!diagnosis && !diagnoseMutation.isPending ? (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDiagnose}
                    className="w-full justify-center border-primary/30 text-primary hover:bg-primary/10 group"
                >
                    <Sparkles className="w-4 h-4 mr-2 group-hover:animate-pulse" />
                    Run AI Health Check
                </Button>
            ) : (
                <div className="rounded-lg border border-primary/20 bg-primary/5 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-300">
                    <div className="px-3 py-2 border-b border-primary/10 flex items-center justify-between bg-primary/5">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-primary" />
                            <span className="text-[10px] font-bold text-white uppercase tracking-wider">AI Health Diagnostic</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={handleDiagnose}
                                disabled={diagnoseMutation.isPending}
                                className="p-1 text-slate-500 hover:text-white transition-colors"
                            >
                                <RefreshCw className={clsx("w-3 h-3", diagnoseMutation.isPending && "animate-spin")} />
                            </button>
                            <button
                                onClick={() => setDiagnosis(null)}
                                className="p-1 text-slate-500 hover:text-white transition-colors"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    </div>

                    <div className="p-3">
                        {diagnoseMutation.isPending ? (
                            <div className="flex flex-col gap-2 py-2">
                                <div className="flex items-center gap-2 text-slate-400">
                                    <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                                    <span className="text-xs italic">Analyzing router logs and metrics...</span>
                                </div>
                                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-primary animate-progress-indeterminate"></div>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="text-xs leading-relaxed text-slate-300 whitespace-pre-wrap font-sans">
                                    {diagnosis}
                                </div>
                                <div className="mt-3 pt-2 border-t border-primary/10 flex items-center justify-between">
                                    <span className="text-[9px] text-slate-500 italic">Real-time analysis complete</span>
                                    <div className="flex items-center gap-1 text-[9px] text-primary/60 font-bold uppercase">
                                        <Activity className="w-2.5 h-2.5" />
                                        Advanced Engine
                                    </div>
                                </div>
                            </>
                        )}

                        {diagnoseMutation.isError && (
                            <div className="flex items-center gap-2 mt-2 text-red-400 text-[10px] bg-red-500/10 p-2 rounded">
                                <AlertCircle className="w-3 h-3" />
                                <span>Failed to complete AI diagnostic.</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

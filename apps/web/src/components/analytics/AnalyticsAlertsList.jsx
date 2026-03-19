import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { AlertTriangle } from 'lucide-react';
import { ListSkeleton } from '@/components/ui/Skeleton';
import clsx from 'clsx';

function AnalyticsAlertsList({ 
    isSingleDayView, 
    dateRange, 
    alertsListLoading, 
    alertsList 
}) {
    if (!isSingleDayView) return null;

    return (
        <Card className="glass-panel border-primary/30">
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    Daftar Alert - {dateRange.label}
                    {alertsList?.length > 0 && (
                        <span className="text-xs text-slate-400 font-normal ml-2">
                            ({alertsList.length} alert)
                        </span>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {alertsListLoading ? (
                    <ListSkeleton rows={5} />
                ) : alertsList?.length > 0 ? (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
                        {alertsList.map((alert, i) => (
                            <div
                                key={i}
                                className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={clsx(
                                        "w-2 h-2 rounded-full flex-shrink-0",
                                        alert.severity === 'critical' ? 'bg-red-500' :
                                            alert.severity === 'warning' ? 'bg-amber-500' :
                                                'bg-blue-500'
                                    )} />
                                    <div className="min-w-0">
                                        <p className="text-sm text-white font-medium truncate">{alert.title}</p>
                                        <p className="text-xs text-slate-500 truncate">{alert.message}</p>
                                    </div>
                                </div>
                                <div className="text-right flex-shrink-0 ml-4">
                                    <p className="text-xs text-slate-400 font-mono">
                                        {new Date(alert.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                    <p className="text-[10px] text-slate-500">{alert.routerName}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8">
                        <p className="text-slate-500">Tidak ada alert pada tanggal ini</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default AnalyticsAlertsList;

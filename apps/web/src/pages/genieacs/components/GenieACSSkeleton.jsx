import React from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { Card, CardContent } from '@/components/ui/Card';

export const DeviceGridSkeleton = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
            <Card key={i} className="border-slate-800 bg-slate-900/20">
                <CardContent className="p-5 space-y-4">
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-lg" />
                        <div className="space-y-2 flex-1">
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-3 w-1/2" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Skeleton className="h-3 w-3/4" />
                            <Skeleton className="h-3 w-1/2" />
                        </div>
                        <div className="space-y-2">
                            <Skeleton className="h-3 w-3/4" />
                            <Skeleton className="h-3 w-1/2" />
                        </div>
                    </div>
                    <div className="pt-2 flex gap-2">
                        <Skeleton className="h-6 w-12 rounded" />
                        <Skeleton className="h-6 w-12 rounded" />
                    </div>
                </CardContent>
            </Card>
        ))}
    </div>
);

export const DeviceListSkeleton = () => (
    <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 bg-slate-800/50 flex gap-4">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-20" />
        </div>
        <div className="p-4 space-y-4">
            {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 h-12 border-b border-slate-800/50 pb-4 last:border-0 last:pb-0">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-32 ml-auto" />
                </div>
            ))}
        </div>
    </div>
);

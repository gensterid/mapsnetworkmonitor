import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { TrendingUp, Activity } from 'lucide-react';
import { ChartSkeleton } from '@/components/ui/Skeleton';
import SimpleBarChart from './SimpleBarChart';
import TrendChart from './TrendChart';

function AnalyticsTrends({ 
    trendsLoading, 
    alertTrends, 
    handleBarClick, 
    perfLoading, 
    performance 
}) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Alert Trend */}
            <Card className="glass-panel">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-primary" />
                        Trend Alert
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {trendsLoading ? (
                        <ChartSkeleton />
                    ) : (
                        <SimpleBarChart
                            data={alertTrends || []}
                            dataKey="total"
                            color="warning"
                            height={180}
                            onClick={handleBarClick}
                        />
                    )}
                </CardContent>
            </Card>

            {/* CPU & Memory Trend */}
            <Card className="glass-panel">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Activity className="w-4 h-4 text-primary" />
                        CPU & Memory Trend
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {perfLoading ? (
                        <ChartSkeleton />
                    ) : (
                        <TrendChart data={performance || []} height={180} />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default AnalyticsTrends;

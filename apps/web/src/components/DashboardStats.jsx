import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import {
    Router as RouterIcon,
    Wifi,
    WifiOff,
    AlertTriangle,
    Activity,
    RefreshCw
} from 'lucide-react';
import clsx from 'clsx';

export default function DashboardStats() {
    const { data: stats, isLoading, error } = useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: async () => {
            const response = await api.get('/dashboard/stats');
            return response.data?.data || {};
        },
        refetchInterval: 30000, // Poll every 30 seconds
    });

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <Card key={i} className="animate-pulse">
                        <CardContent className="p-5">
                            <div className="h-16 bg-slate-800 rounded" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                Failed to load dashboard stats
            </div>
        );
    }

    const statCards = [
        {
            label: 'Total Routers',
            value: stats?.totalRouters || 0,
            icon: RouterIcon,
            color: 'blue',
        },
        {
            label: 'Online',
            value: stats?.onlineRouters || 0,
            icon: Wifi,
            color: 'green',
        },
        {
            label: 'Offline',
            value: stats?.offlineRouters || 0,
            icon: WifiOff,
            color: 'red',
        },
        {
            label: 'Active Alerts',
            value: stats?.activeAlerts || 0,
            icon: AlertTriangle,
            color: 'yellow',
        },
    ];

    const colorClasses = {
        blue: 'bg-blue-500/10 text-blue-400',
        green: 'bg-emerald-500/10 text-emerald-400',
        red: 'bg-red-500/10 text-red-400',
        yellow: 'bg-yellow-500/10 text-yellow-400',
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map((stat) => (
                <Card key={stat.label} className="hover:border-slate-600 transition-colors">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-slate-400 uppercase font-medium tracking-wide">
                                    {stat.label}
                                </p>
                                <p className="text-2xl font-bold text-white mt-1">
                                    {stat.value}
                                </p>
                            </div>
                            <div className={clsx(
                                "p-3 rounded-lg",
                                colorClasses[stat.color]
                            )}>
                                <stat.icon className="w-6 h-6" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

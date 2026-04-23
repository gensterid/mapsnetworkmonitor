import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    PhoneCall,
    RefreshCw,
    Search,
    MapPin,
    Clock,
    CheckCircle,
    XCircle,
    Activity,
    AlertCircle
} from 'lucide-react';
import clsx from 'clsx';
import { usePppoeSessions, useUpdatePppoeCoordinates, useAppTimezone } from '@/hooks';
import toast from 'react-hot-toast';
import PppoeCoordinatesModal from '../modals/PppoeCoordinatesModal';
import { formatDateWithTimezone } from '@/lib/timezone';

function PppoeTab({ routerId }) {
    const { data: sessions = [], isLoading, isRefetching, refetch } = usePppoeSessions(routerId);
    const updateCoordMutation = useUpdatePppoeCoordinates();
    const [searchQuery, setSearchQuery] = useState('');
    const [coordModal, setCoordModal] = useState({ open: false, session: null });
    const { timezone } = useAppTimezone();



    const filteredSessions = sessions.filter(s =>
        !searchQuery ||
        s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.callerId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.service?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSaveCoordinates = async (coords) => {
        try {
            await updateCoordMutation.mutateAsync({
                id: coordModal.session.id,
                data: {
                    ...coords,
                    routerId
                }
            });
            toast.success('Coordinates updated');
            setCoordModal({ open: false, session: null });
        } catch (error) {
            console.error('Failed to save coordinates:', error);
            toast.error('Failed to save coordinates');
        }
    };

    if (isLoading && sessions.length === 0) {
        return (
            <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <PhoneCall className="w-5 h-5 text-primary" />
                        PPPoE Active Sessions
                    </h2>
                    <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700">
                        {sessions.length} Users
                    </span>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-none sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search by name, IP, caller..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
                        />
                    </div>
                    <Button onClick={() => refetch()} variant="outline" size="sm" disabled={isRefetching}>
                        <RefreshCw className={clsx("w-4 h-4", isRefetching && "animate-spin")} />
                    </Button>
                </div>
            </div>

            <Card className="glass-panel overflow-hidden">
                <div className="max-h-[calc(100vh-280px)] min-h-[400px] overflow-auto custom-scrollbar">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10">
                            <tr className="border-b border-slate-800">
                                <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase bg-slate-900/98 backdrop-blur-sm">User</th>
                                <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase bg-slate-900/98 backdrop-blur-sm">Address</th>
                                <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase bg-slate-900/98 backdrop-blur-sm">Uptime</th>
                                <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase bg-slate-900/98 backdrop-blur-sm">Caller ID</th>
                                <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase bg-slate-900/98 backdrop-blur-sm">Coordinates</th>
                                <th className="text-right py-3 px-4 text-xs font-medium text-slate-400 uppercase bg-slate-900/98 backdrop-blur-sm">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {filteredSessions.length > 0 ? filteredSessions.map((s, i) => (
                                <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="py-3 px-4">
                                        <div className="text-white font-medium">{s.name}</div>
                                        <div className="text-[10px] text-slate-500 uppercase">{s.service}</div>
                                    </td>
                                    <td className="py-3 px-4">
                                        <div className="text-slate-300 font-mono text-xs">{s.address}</div>
                                    </td>
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                                            <Clock className="w-3.5 h-3.5" />
                                            {s.uptime}
                                        </div>
                                    </td>
                                    <td className="py-3 px-4">
                                        <div className="text-slate-400 font-mono text-xs">{s.callerId || '-'}</div>
                                    </td>
                                    <td className="py-3 px-4">
                                        {s.latitude && s.longitude ? (
                                            <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
                                                <MapPin className="w-3.5 h-3.5" />
                                                SET
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 text-slate-600 text-xs italic">
                                                <AlertCircle className="w-3.5 h-3.5" />
                                                Not Set
                                            </div>
                                        )}
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 text-[10px] uppercase font-bold"
                                            onClick={() => setCoordModal({ open: true, session: s })}
                                        >
                                            <MapPin className="w-3.5 h-3.5 mr-1" />
                                            Set Map
                                        </Button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center text-slate-500">
                                        {searchQuery ? "No matching sessions found" : "No active PPPoE sessions"}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <PppoeCoordinatesModal
                session={coordModal.session}
                isOpen={coordModal.open}
                onClose={() => setCoordModal({ open: false, session: null })}
                onSave={handleSaveCoordinates}
                isSaving={updateCoordMutation.isPending}
            />
        </div>
    );
}

export default PppoeTab;

import React, { useState } from 'react';
import { useGenieACSDevices, useRebootGenieACSDevice, useCurrentUser, useSettings } from '@/hooks';
import {
    Search,
    RefreshCw,
    Wifi,
    Monitor,
    Activity,
    Clock,
    Power,
    Server,
    Smartphone,
    Globe
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import clsx from 'clsx';
import { formatDateWithTimezone } from '@/lib/timezone';

function RebootModal({ isOpen, onClose, device }) {
    const rebootMutation = useRebootGenieACSDevice();

    const handleReboot = () => {
        if (!device) return;
        rebootMutation.mutate(device._id, {
            onSuccess: () => onClose()
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Reboot Device">
            <div className="space-y-4">
                <p className="text-slate-300">
                    Are you sure you want to reboot <strong className="text-white">{device?._id}</strong>?
                    This will temporarily interrupt service for the customer.
                </p>
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button variant="destructive" onClick={handleReboot} loading={rebootMutation.isPending}>
                        Reboot
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

export default function GenieACS() {
    const [searchQuery, setSearchQuery] = useState('');
    const [rebootDevice, setRebootDevice] = useState(null);
    const { data: devices = [], isLoading, error, refetch } = useGenieACSDevices();

    const { data: currentUser } = useCurrentUser();
    const { data: settings } = useSettings();
    const timezone = currentUser?.timezone || settings?.timezone || 'Asia/Jakarta';

    const filteredDevices = devices.filter(dev =>
        dev._id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dev._ip?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dev._serialNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dev._ssid?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-background-dark">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-background-dark p-8 text-center">
                <div className="text-red-400 mb-2">Error loading devices</div>
                <p className="text-slate-500 text-sm mb-4">{error.message}</p>
                <Button onClick={() => refetch()}>Try Again</Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background-dark overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Monitor className="w-8 h-8 text-primary" />
                        CPE Management
                    </h1>
                    <p className="text-slate-400 text-sm">Manage GenieACS devices (TR-069)</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search serial, IP, SSID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg pl-9 pr-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary w-full sm:w-64"
                        />
                    </div>
                    <Button onClick={() => refetch()} variant="outline">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredDevices.map((dev) => (
                        <Card key={dev._id} className="group hover:border-slate-600 transition-colors">
                            <CardContent className="p-5 space-y-4">
                                {/* Header */}
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-500">
                                            <Wifi className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-white truncate w-32" title={dev._id}>{dev._id}</h3>
                                            <div className="text-xs text-slate-400">{dev._productClass || 'Unknown Model'}</div>
                                        </div>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => setRebootDevice(dev)}
                                            className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-red-400 transition-colors"
                                            title="Reboot Device"
                                        >
                                            <Power className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Info Grid */}
                                <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm">
                                    <div className="flex flex-col">
                                        <span className="text-slate-500 text-xs">IP Address</span>
                                        <span className="text-slate-300 font-mono text-xs">{dev._ip || 'N/A'}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-slate-500 text-xs">SSID</span>
                                        <span className="text-slate-300 truncate" title={dev._ssid}>{dev._ssid || 'N/A'}</span>
                                    </div>
                                    <div className="col-span-2 flex flex-col">
                                        <span className="text-slate-500 text-xs">Last Inform</span>
                                        <div className="flex items-center gap-1.5 text-slate-300">
                                            <Clock className="w-3 h-3" />
                                            <span className="text-xs">
                                                {dev._lastInform
                                                    ? formatDateWithTimezone(dev._lastInform, timezone)
                                                    : 'Never'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Status Bar (Last Inform freshness) */}
                                {dev._lastInform && (
                                    <div className="pt-2">
                                        <div className={clsx(
                                            "h-1 rounded-full w-full",
                                            new Date() - new Date(dev._lastInform) < 300000 // 5 mins
                                                ? "bg-emerald-500"
                                                : new Date() - new Date(dev._lastInform) < 3600000 // 1 hour
                                                    ? "bg-yellow-500"
                                                    : "bg-red-500"
                                        )} />
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}

                    {filteredDevices.length === 0 && (
                        <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-800 rounded-xl">
                            <div className="w-12 h-12 bg-slate-800/50 text-slate-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Monitor className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-medium text-white mb-1">No devices found</h3>
                            <p className="text-slate-400">GenieACS didn't return any devices matching your search</p>
                        </div>
                    )}
                </div>
            </div>

            <RebootModal
                isOpen={!!rebootDevice}
                onClose={() => setRebootDevice(null)}
                device={rebootDevice}
            />
        </div>
    );
}

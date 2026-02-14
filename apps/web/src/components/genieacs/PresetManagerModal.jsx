
import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Loader2, Trash2, Play } from 'lucide-react';
import { usePresets, useDeletePreset } from '@/hooks';

export default function PresetManagerModal({ isOpen, onClose, onApply }) {
    const { data: presets = [], isLoading } = usePresets();
    const deleteMutation = useDeletePreset();

    // Local state for filtering
    const [filterType, setFilterType] = useState('all');

    const filteredPresets = presets.filter(p => filterType === 'all' || p.type === filterType);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Configuration Presets">
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <p className="text-sm text-slate-400">
                        Manage and apply WAN/WiFi configuration templates.
                    </p>
                    <div className="w-[150px]">
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-primary outline-none"
                        >
                            <option value="all">All Types</option>
                            <option value="wan">WAN</option>
                            <option value="wifi">WiFi</option>
                        </select>
                    </div>
                </div>

                <div className="border border-slate-800 rounded-lg overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-950 text-slate-400 uppercase text-xs">
                            <tr>
                                <th className="px-4 py-3 font-medium">Name</th>
                                <th className="px-4 py-3 font-medium">Type</th>
                                <th className="px-4 py-3 font-medium">Description</th>
                                <th className="px-4 py-3 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                                    </td>
                                </tr>
                            ) : filteredPresets.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                                        No presets found. Save a configuration as a preset from the WAN/WiFi settings modal.
                                    </td>
                                </tr>
                            ) : (
                                filteredPresets.map(preset => (
                                    <tr key={preset.id} className="hover:bg-slate-800/50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-slate-200">{preset.name}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded text-xs font-semibold ${preset.type === 'wan' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'
                                                }`}>
                                                {preset.type.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-400 max-w-[200px] truncate" title={preset.description}>
                                            {preset.description || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-right whitespace-nowrap">
                                            {onApply && (
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    className="mr-2 h-8 px-2 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20"
                                                    onClick={() => onApply(preset)}
                                                >
                                                    <Play className="h-3 w-3 mr-1.5" /> Apply
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                                onClick={() => {
                                                    if (confirm('Are you sure you want to delete this preset?')) {
                                                        deleteMutation.mutate(preset.id);
                                                    }
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-800">
                    <Button variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white">Close</Button>
                </div>
            </div>
        </Modal>
    );
}

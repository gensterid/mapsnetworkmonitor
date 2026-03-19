import React from 'react';
import { Activity, Globe, RefreshCw, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function MapColorsSettings({ formData, handleChange, setFormData, handleSubmit, updateSettingMutation, saveStatus, DEFAULT_MAP_COLORS }) {
    return (
        <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
            {saveStatus && (
                <div className={`p-3 rounded-lg text-sm ${saveStatus.includes('Failed')
                    ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                    : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    }`}>
                    {saveStatus}
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="w-5 h-5" />
                        Status Colors
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Online / Up</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    name="online"
                                    data-group="mapColors"
                                    value={formData.mapColors.online}
                                    onChange={handleChange}
                                    className="h-10 w-20 rounded bg-transparent cursor-pointer"
                                />
                                <Input
                                    name="online"
                                    data-group="mapColors"
                                    value={formData.mapColors.online}
                                    onChange={handleChange}
                                    className="font-mono uppercase"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Offline / Down</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    name="offline"
                                    data-group="mapColors"
                                    value={formData.mapColors.offline}
                                    onChange={handleChange}
                                    className="h-10 w-20 rounded bg-transparent cursor-pointer"
                                />
                                <Input
                                    name="offline"
                                    data-group="mapColors"
                                    value={formData.mapColors.offline}
                                    onChange={handleChange}
                                    className="font-mono uppercase"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Warning (High Latency/Loss)</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    name="warning"
                                    data-group="mapColors"
                                    value={formData.mapColors.warning}
                                    onChange={handleChange}
                                    className="h-10 w-20 rounded bg-transparent cursor-pointer"
                                />
                                <Input
                                    name="warning"
                                    data-group="mapColors"
                                    value={formData.mapColors.warning}
                                    onChange={handleChange}
                                    className="font-mono uppercase"
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Globe className="w-5 h-5" />
                        Device Types
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Router / Server</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    name="router"
                                    data-group="mapColors"
                                    value={formData.mapColors.router}
                                    onChange={handleChange}
                                    className="h-10 w-20 rounded bg-transparent cursor-pointer"
                                />
                                <Input
                                    name="router"
                                    data-group="mapColors"
                                    value={formData.mapColors.router}
                                    onChange={handleChange}
                                    className="font-mono uppercase"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">PPPoE Client</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    name="pppoe"
                                    data-group="mapColors"
                                    value={formData.mapColors.pppoe}
                                    onChange={handleChange}
                                    className="h-10 w-20 rounded bg-transparent cursor-pointer"
                                />
                                <Input
                                    name="pppoe"
                                    data-group="mapColors"
                                    value={formData.mapColors.pppoe}
                                    onChange={handleChange}
                                    className="font-mono uppercase"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">ODP / Backbone</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    name="odp"
                                    data-group="mapColors"
                                    value={formData.mapColors.odp}
                                    onChange={handleChange}
                                    className="h-10 w-20 rounded bg-transparent cursor-pointer"
                                />
                                <Input
                                    name="odp"
                                    data-group="mapColors"
                                    value={formData.mapColors.odp}
                                    onChange={handleChange}
                                    className="font-mono uppercase"
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="w-5 h-5" />
                        Heatmap Traffic Load
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-6">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-slate-300">Idle Traffic</label>
                                <span className="text-xs text-slate-500">Color for traffic &lt; {formData.mapColors.trafficThresholdIdle || 1} Mbps</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    name="trafficyIdle"
                                    data-group="mapColors"
                                    value={formData.mapColors.trafficyIdle}
                                    onChange={handleChange}
                                    className="h-10 w-14 rounded bg-transparent cursor-pointer shrink-0"
                                />
                                <Input
                                    name="trafficyIdle"
                                    data-group="mapColors"
                                    value={formData.mapColors.trafficyIdle}
                                    onChange={handleChange}
                                    className="font-mono uppercase w-28"
                                />
                                <div className="flex items-center gap-2 ml-auto bg-slate-900/50 p-1.5 rounded border border-slate-800">
                                    <span className="text-xs text-slate-400">Limit:</span>
                                    <Input
                                        type="number"
                                        name="trafficThresholdIdle"
                                        data-group="mapColors"
                                        value={formData.mapColors.trafficThresholdIdle}
                                        onChange={handleChange}
                                        className="w-20 h-8 text-right"
                                        min="0"
                                    />
                                    <span className="text-xs text-slate-400">Mbps</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-slate-300">Normal Traffic</label>
                                <span className="text-xs text-slate-500">Color for traffic &lt; {formData.mapColors.trafficThresholdNormal || 20} Mbps</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    name="trafficNormal"
                                    data-group="mapColors"
                                    value={formData.mapColors.trafficNormal}
                                    onChange={handleChange}
                                    className="h-10 w-14 rounded bg-transparent cursor-pointer shrink-0"
                                />
                                <Input
                                    name="trafficNormal"
                                    data-group="mapColors"
                                    value={formData.mapColors.trafficNormal}
                                    onChange={handleChange}
                                    className="font-mono uppercase w-28"
                                />
                                <div className="flex items-center gap-2 ml-auto bg-slate-900/50 p-1.5 rounded border border-slate-800">
                                    <span className="text-xs text-slate-400">Limit:</span>
                                    <Input
                                        type="number"
                                        name="trafficThresholdNormal"
                                        data-group="mapColors"
                                        value={formData.mapColors.trafficThresholdNormal}
                                        onChange={handleChange}
                                        className="w-20 h-8 text-right"
                                        min="0"
                                    />
                                    <span className="text-xs text-slate-400">Mbps</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-slate-300">High Traffic</label>
                                <span className="text-xs text-slate-500">Color for traffic &lt; {formData.mapColors.trafficThresholdHigh || 50} Mbps</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    name="trafficHigh"
                                    data-group="mapColors"
                                    value={formData.mapColors.trafficHigh}
                                    onChange={handleChange}
                                    className="h-10 w-14 rounded bg-transparent cursor-pointer shrink-0"
                                />
                                <Input
                                    name="trafficHigh"
                                    data-group="mapColors"
                                    value={formData.mapColors.trafficHigh}
                                    onChange={handleChange}
                                    className="font-mono uppercase w-28"
                                />
                                <div className="flex items-center gap-2 ml-auto bg-slate-900/50 p-1.5 rounded border border-slate-800">
                                    <span className="text-xs text-slate-400">Limit:</span>
                                    <Input
                                        type="number"
                                        name="trafficThresholdHigh"
                                        data-group="mapColors"
                                        value={formData.mapColors.trafficThresholdHigh}
                                        onChange={handleChange}
                                        className="w-20 h-8 text-right"
                                        min="0"
                                    />
                                    <span className="text-xs text-slate-400">Mbps</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-slate-300">Peak Traffic</label>
                                <span className="text-xs text-slate-500">Color for traffic &gt; {formData.mapColors.trafficThresholdHigh || 50} Mbps</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    name="trafficPeak"
                                    data-group="mapColors"
                                    value={formData.mapColors.trafficPeak}
                                    onChange={handleChange}
                                    className="h-10 w-14 rounded bg-transparent cursor-pointer shrink-0"
                                />
                                <Input
                                    name="trafficPeak"
                                    data-group="mapColors"
                                    value={formData.mapColors.trafficPeak}
                                    onChange={handleChange}
                                    className="font-mono uppercase w-28"
                                />
                                <div className="flex items-center gap-2 ml-auto px-3">
                                    <span className="text-xs text-slate-500 italic">Upper limit automatically determined</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => setFormData(prev => ({
                        ...prev,
                        mapColors: { ...DEFAULT_MAP_COLORS }
                    }))}
                >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Reset Defaults
                </Button>
                <Button type="submit" loading={updateSettingMutation.isPending}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Map Colors
                </Button>
            </div>
        </form>
    );
}

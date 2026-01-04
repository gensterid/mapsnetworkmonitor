import React, { useState, useEffect } from 'react';
import { useSettings, useUpdateSetting } from '@/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AlertTriangle, Cpu, HardDrive, Save, RefreshCw, Info } from 'lucide-react';

// Default threshold values
const DEFAULT_THRESHOLDS = {
    cpuWarning: 70,
    cpuCritical: 90,
    memoryWarning: 80,
    memoryCritical: 95,
    alertsEnabled: true,
    statusChangeAlerts: true,
    highCpuAlerts: true,
    highMemoryAlerts: true,
};

export default function AlertSettingsPanel() {
    const { data: settings, isLoading } = useSettings();
    const updateSettingMutation = useUpdateSetting();

    const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
    const [saveStatus, setSaveStatus] = useState('');
    const [hasChanges, setHasChanges] = useState(false);

    // Load settings into form
    useEffect(() => {
        if (settings) {
            setThresholds({
                cpuWarning: settings.alertThresholdCpuWarning ?? DEFAULT_THRESHOLDS.cpuWarning,
                cpuCritical: settings.alertThresholdCpuCritical ?? DEFAULT_THRESHOLDS.cpuCritical,
                memoryWarning: settings.alertThresholdMemoryWarning ?? DEFAULT_THRESHOLDS.memoryWarning,
                memoryCritical: settings.alertThresholdMemoryCritical ?? DEFAULT_THRESHOLDS.memoryCritical,
                alertsEnabled: settings.alertsEnabled !== false,
                statusChangeAlerts: settings.statusChangeAlerts !== false,
                highCpuAlerts: settings.highCpuAlerts !== false,
                highMemoryAlerts: settings.highMemoryAlerts !== false,
            });
        }
    }, [settings]);

    const handleChange = (field, value) => {
        setThresholds(prev => ({ ...prev, [field]: value }));
        setHasChanges(true);
    };

    const handleSave = async () => {
        setSaveStatus('Saving...');
        try {
            await updateSettingMutation.mutateAsync({
                key: 'alertThresholdCpuWarning',
                value: parseInt(thresholds.cpuWarning, 10),
                description: 'CPU usage warning threshold (%)'
            });
            await updateSettingMutation.mutateAsync({
                key: 'alertThresholdCpuCritical',
                value: parseInt(thresholds.cpuCritical, 10),
                description: 'CPU usage critical threshold (%)'
            });
            await updateSettingMutation.mutateAsync({
                key: 'alertThresholdMemoryWarning',
                value: parseInt(thresholds.memoryWarning, 10),
                description: 'Memory usage warning threshold (%)'
            });
            await updateSettingMutation.mutateAsync({
                key: 'alertThresholdMemoryCritical',
                value: parseInt(thresholds.memoryCritical, 10),
                description: 'Memory usage critical threshold (%)'
            });
            await updateSettingMutation.mutateAsync({
                key: 'alertsEnabled',
                value: thresholds.alertsEnabled,
                description: 'Global alerts enabled flag'
            });
            await updateSettingMutation.mutateAsync({
                key: 'statusChangeAlerts',
                value: thresholds.statusChangeAlerts,
                description: 'Enable alerts for router status changes'
            });
            await updateSettingMutation.mutateAsync({
                key: 'highCpuAlerts',
                value: thresholds.highCpuAlerts,
                description: 'Enable alerts for high CPU usage'
            });
            await updateSettingMutation.mutateAsync({
                key: 'highMemoryAlerts',
                value: thresholds.highMemoryAlerts,
                description: 'Enable alerts for high memory usage'
            });

            setSaveStatus('Alert thresholds saved successfully!');
            setHasChanges(false);
            setTimeout(() => setSaveStatus(''), 3000);
        } catch (error) {
            setSaveStatus('Failed to save: ' + (error.message || 'Unknown error'));
        }
    };

    const handleReset = () => {
        setThresholds(DEFAULT_THRESHOLDS);
        setHasChanges(true);
    };

    if (isLoading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-8">
                    <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {saveStatus && (
                <div className={`p-3 rounded-lg text-sm ${saveStatus.includes('Failed')
                        ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                        : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    }`}>
                    {saveStatus}
                </div>
            )}

            {/* Master Alert Toggle */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />
                        Alert Configuration
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                        <div>
                            <label className="text-sm font-medium text-white">Enable Alerts</label>
                            <p className="text-xs text-slate-500">Master toggle for all alert notifications</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={thresholds.alertsEnabled}
                                onChange={(e) => handleChange('alertsEnabled', e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-700 peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                    </div>

                    {/* Alert Types */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-medium text-slate-300">Alert Types</h4>

                        <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                            <div>
                                <label className="text-sm text-slate-300">Status Change Alerts</label>
                                <p className="text-xs text-slate-500">Alert when router goes online/offline</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={thresholds.statusChangeAlerts}
                                    onChange={(e) => handleChange('statusChangeAlerts', e.target.checked)}
                                    disabled={!thresholds.alertsEnabled}
                                    className="sr-only peer"
                                />
                                <div className={`w-11 h-6 ${thresholds.alertsEnabled ? 'bg-slate-700' : 'bg-slate-800'} peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-disabled:opacity-50`}></div>
                            </label>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                            <div>
                                <label className="text-sm text-slate-300">High CPU Alerts</label>
                                <p className="text-xs text-slate-500">Alert when CPU exceeds threshold</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={thresholds.highCpuAlerts}
                                    onChange={(e) => handleChange('highCpuAlerts', e.target.checked)}
                                    disabled={!thresholds.alertsEnabled}
                                    className="sr-only peer"
                                />
                                <div className={`w-11 h-6 ${thresholds.alertsEnabled ? 'bg-slate-700' : 'bg-slate-800'} peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-disabled:opacity-50`}></div>
                            </label>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                            <div>
                                <label className="text-sm text-slate-300">High Memory Alerts</label>
                                <p className="text-xs text-slate-500">Alert when memory exceeds threshold</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={thresholds.highMemoryAlerts}
                                    onChange={(e) => handleChange('highMemoryAlerts', e.target.checked)}
                                    disabled={!thresholds.alertsEnabled}
                                    className="sr-only peer"
                                />
                                <div className={`w-11 h-6 ${thresholds.alertsEnabled ? 'bg-slate-700' : 'bg-slate-800'} peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-disabled:opacity-50`}></div>
                            </label>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* CPU Thresholds */}
            <Card className={!thresholds.alertsEnabled || !thresholds.highCpuAlerts ? 'opacity-50' : ''}>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Cpu className="w-5 h-5" />
                        CPU Thresholds
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                                Warning Threshold (%)
                            </label>
                            <Input
                                type="number"
                                value={thresholds.cpuWarning}
                                onChange={(e) => handleChange('cpuWarning', e.target.value)}
                                disabled={!thresholds.alertsEnabled || !thresholds.highCpuAlerts}
                                min={1}
                                max={100}
                            />
                            <p className="text-xs text-slate-500">
                                Triggers a warning alert when CPU usage exceeds this value
                            </p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-400"></span>
                                Critical Threshold (%)
                            </label>
                            <Input
                                type="number"
                                value={thresholds.cpuCritical}
                                onChange={(e) => handleChange('cpuCritical', e.target.value)}
                                disabled={!thresholds.alertsEnabled || !thresholds.highCpuAlerts}
                                min={1}
                                max={100}
                            />
                            <p className="text-xs text-slate-500">
                                Triggers a critical alert when CPU usage exceeds this value
                            </p>
                        </div>
                    </div>

                    {/* Visual threshold indicator */}
                    <div className="pt-2">
                        <div className="relative h-4 bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-500 to-yellow-500"
                                style={{ width: `${thresholds.cpuWarning}%` }}
                            ></div>
                            <div
                                className="absolute top-0 h-full bg-gradient-to-r from-yellow-500 to-red-500"
                                style={{ left: `${thresholds.cpuWarning}%`, width: `${thresholds.cpuCritical - thresholds.cpuWarning}%` }}
                            ></div>
                            <div
                                className="absolute top-0 h-full bg-red-600"
                                style={{ left: `${thresholds.cpuCritical}%`, width: `${100 - thresholds.cpuCritical}%` }}
                            ></div>
                        </div>
                        <div className="flex justify-between text-xs text-slate-500 mt-1">
                            <span>0%</span>
                            <span className="text-yellow-400">{thresholds.cpuWarning}% Warning</span>
                            <span className="text-red-400">{thresholds.cpuCritical}% Critical</span>
                            <span>100%</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Memory Thresholds */}
            <Card className={!thresholds.alertsEnabled || !thresholds.highMemoryAlerts ? 'opacity-50' : ''}>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <HardDrive className="w-5 h-5" />
                        Memory Thresholds
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                                Warning Threshold (%)
                            </label>
                            <Input
                                type="number"
                                value={thresholds.memoryWarning}
                                onChange={(e) => handleChange('memoryWarning', e.target.value)}
                                disabled={!thresholds.alertsEnabled || !thresholds.highMemoryAlerts}
                                min={1}
                                max={100}
                            />
                            <p className="text-xs text-slate-500">
                                Triggers a warning alert when memory usage exceeds this value
                            </p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-400"></span>
                                Critical Threshold (%)
                            </label>
                            <Input
                                type="number"
                                value={thresholds.memoryCritical}
                                onChange={(e) => handleChange('memoryCritical', e.target.value)}
                                disabled={!thresholds.alertsEnabled || !thresholds.highMemoryAlerts}
                                min={1}
                                max={100}
                            />
                            <p className="text-xs text-slate-500">
                                Triggers a critical alert when memory usage exceeds this value
                            </p>
                        </div>
                    </div>

                    {/* Visual threshold indicator */}
                    <div className="pt-2">
                        <div className="relative h-4 bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-500 to-yellow-500"
                                style={{ width: `${thresholds.memoryWarning}%` }}
                            ></div>
                            <div
                                className="absolute top-0 h-full bg-gradient-to-r from-yellow-500 to-red-500"
                                style={{ left: `${thresholds.memoryWarning}%`, width: `${thresholds.memoryCritical - thresholds.memoryWarning}%` }}
                            ></div>
                            <div
                                className="absolute top-0 h-full bg-red-600"
                                style={{ left: `${thresholds.memoryCritical}%`, width: `${100 - thresholds.memoryCritical}%` }}
                            ></div>
                        </div>
                        <div className="flex justify-between text-xs text-slate-500 mt-1">
                            <span>0%</span>
                            <span className="text-yellow-400">{thresholds.memoryWarning}% Warning</span>
                            <span className="text-red-400">{thresholds.memoryCritical}% Critical</span>
                            <span>100%</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Info Box */}
            <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-300">
                    <p className="font-medium mb-1">How Alert Thresholds Work</p>
                    <ul className="list-disc list-inside text-blue-300/80 space-y-1">
                        <li>Alerts are generated when metrics exceed the configured thresholds</li>
                        <li>Warning alerts have medium priority and are displayed in yellow</li>
                        <li>Critical alerts have high priority and are displayed in red</li>
                        <li>Threshold changes take effect on the next polling cycle</li>
                    </ul>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between items-center pt-2">
                <Button
                    type="button"
                    variant="outline"
                    onClick={handleReset}
                >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Reset to Defaults
                </Button>
                <Button
                    onClick={handleSave}
                    disabled={!hasChanges}
                    loading={updateSettingMutation.isPending}
                >
                    <Save className="w-4 h-4 mr-2" />
                    Save Alert Settings
                </Button>
            </div>
        </div>
    );
}

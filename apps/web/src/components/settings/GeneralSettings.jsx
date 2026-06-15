import React from 'react';
import { Palette, Settings as SettingsIcon, Clock, Globe, Bell, RefreshCw, Activity, Save, Trash2, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import Toggle from '@/components/ui/Toggle';

const toEvent = (name, checked) => ({ target: { name, type: 'checkbox', checked, value: checked } });

export default function GeneralSettings({
    formData,
    handleChange,
    setFormData,
    currentUser,
    theme,
    setTheme,
    themes,
    themeDetails,
    saveStatus,
    handleSubmit,
    updateSettingMutation,
    updateUserMutation,
    pingTargets,
    setPingTargets,
    getAnimationStyleNames
}) {
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

            {/* Theme Selection */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Palette className="w-5 h-5" />
                        Appearance
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <label className="text-sm font-medium text-slate-300">Theme</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {Object.values(themes).map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setTheme(t)}
                                className={`
                                    relative flex items-center justify-between p-3 rounded-xl border transition-all
                                    ${theme === t
                                        ? 'bg-slate-800 border-primary ring-1 ring-primary'
                                        : 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-800'
                                    }
                                `}
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-8 h-8 rounded-lg shadow-lg border border-white/10"
                                        style={{ backgroundColor: themeDetails[t].color }}
                                    ></div>
                                    <div className="text-left">
                                        <div className={`text-sm font-medium ${theme === t ? 'text-primary' : 'text-slate-300'}`}>
                                            {themeDetails[t].name}
                                        </div>
                                    </div>
                                </div>
                                {theme === t && (
                                    <div className="w-2 h-2 rounded-full bg-primary shadow-lg shadow-primary/50"></div>
                                )}
                            </button>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* General Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <SettingsIcon className="w-5 h-5" />
                        General
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Application Name</label>
                        <Input
                            name="appName"
                            value={formData.appName}
                            onChange={handleChange}
                            placeholder="NetMonitor"
                            disabled={currentUser?.role !== 'admin' && currentUser?.role !== 'superadmin'}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Polling Interval (seconds)</label>
                        <Input
                            type="number"
                            name="pollingInterval"
                            value={formData.pollingInterval}
                            onChange={handleChange}
                            min={10}
                            max={300}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Webhook Base URL</label>
                        <Input
                            type="url"
                            name="webhook_base_url"
                            value={formData.webhook_base_url}
                            onChange={handleChange}
                            placeholder="https://mapsmonitor.genster.web.id"
                            disabled={currentUser?.role !== 'admin' && currentUser?.role !== 'superadmin'}
                        />
                        <p className="text-xs text-slate-500">Base URL used by MikroTik routers to send status updates. Must be accessible from the routers.</p>
                    </div>
                </CardContent>
            </Card>

            {/* Timezone Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="w-5 h-5" />
                        Zona Waktu
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Zona Waktu Sistem</label>
                        <select
                            name="timezone"
                            value={formData.timezone}
                            onChange={handleChange}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                        >
                            <option value="Asia/Jakarta">WIB - Jakarta (UTC+7)</option>
                            <option value="Asia/Makassar">WITA - Makassar (UTC+8)</option>
                            <option value="Asia/Jayapura">WIT - Jayapura (UTC+9)</option>
                            <option value="Asia/Singapore">Singapore (UTC+8)</option>
                            <option value="Asia/Kuala_Lumpur">Kuala Lumpur (UTC+8)</option>
                            <option value="Asia/Bangkok">Bangkok (UTC+7)</option>
                            <option value="Asia/Tokyo">Tokyo (UTC+9)</option>
                            <option value="Asia/Seoul">Seoul (UTC+9)</option>
                            <option value="Asia/Hong_Kong">Hong Kong (UTC+8)</option>
                            <option value="UTC">UTC (UTC+0)</option>
                        </select>
                        <p className="text-xs text-slate-500">
                            Pilih zona waktu untuk menampilkan waktu yang tepat.
                            Setting ini juga dipakai untuk perhitungan tanggal billing (nextDueAt, isolir date, comment MikroTik).
                            Setting per-user — admin pertama di tenant jadi default untuk billing scheduler.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setFormData(prev => ({ ...prev, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }))}
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Deteksi Otomatis
                        </Button>
                        <span className="text-xs text-slate-400">
                            Sistem: {Intl.DateTimeFormat().resolvedOptions().timeZone}
                        </span>
                    </div>
                </CardContent>
            </Card>

            {/* Map Preferences */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Globe className="w-5 h-5" />
                        Map Preferences
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Gaya Animasi Garis</label>
                        <select
                            name="animationStyle"
                            value={formData.animationStyle}
                            onChange={handleChange}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                        >
                            {getAnimationStyleNames().map((style) => (
                                <option key={style.value} value={style.value}>
                                    {style.label}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-slate-500">
                            {getAnimationStyleNames().find(s => s.value === formData.animationStyle)?.description}
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Notification Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Bell className="w-5 h-5" />
                        Notifications
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <label className="text-sm font-medium text-slate-300">Email Alerts</label>
                            <p className="text-xs text-slate-500">Receive alerts via email</p>
                        </div>
                        <Toggle
                            checked={formData.alertEmailEnabled}
                            onChange={(v) => handleChange(toEvent('alertEmailEnabled', v))}
                            ariaLabel="Email alerts"
                        />
                    </div>
                    {formData.alertEmailEnabled && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Alert Email Address</label>
                            <Input
                                type="email"
                                name="alertEmail"
                                value={formData.alertEmail}
                                onChange={handleChange}
                                placeholder="admin@example.com"
                            />
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Map Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Globe className="w-5 h-5" />
                        Google Maps
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Google Maps API Key</label>
                        <Input
                            type="password"
                            name="googleMapsApiKey"
                            value={formData.googleMapsApiKey}
                            onChange={handleChange}
                            placeholder="Enter your API key"
                            disabled={currentUser?.role !== 'admin' && currentUser?.role !== 'superadmin'}
                        />
                        <p className="text-xs text-slate-500">Required for displaying router locations on the map</p>
                    </div>
                </CardContent>
            </Card>

            {/* Ping Targets (Admin Only) */}
            {(currentUser?.role === 'admin' || currentUser?.role === 'superadmin') && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Activity className="w-5 h-5" />
                            Ping Targets
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-slate-400">
                            Configure IP addresses to ping from each router for latency monitoring (max 6 targets).
                        </p>
                        <div className="space-y-3">
                            {pingTargets.map((target, index) => (
                                <div key={index} className="flex gap-2 items-center">
                                    <Input
                                        value={target.ip}
                                        onChange={(e) => {
                                            const newTargets = [...pingTargets];
                                            newTargets[index].ip = e.target.value;
                                            setPingTargets(newTargets);
                                        }}
                                        placeholder="IP Address (e.g., 8.8.8.8)"
                                        className="flex-1"
                                    />
                                    <Input
                                        value={target.label}
                                        onChange={(e) => {
                                            const newTargets = [...pingTargets];
                                            newTargets[index].label = e.target.value;
                                            setPingTargets(newTargets);
                                        }}
                                        placeholder="Label"
                                        className="flex-1"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                            const newTargets = pingTargets.filter((_, i) => i !== index);
                                            setPingTargets(newTargets);
                                        }}
                                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                        {pingTargets.length < 6 && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setPingTargets([...pingTargets, { ip: '', label: '' }])}
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Target
                            </Button>
                        )}
                    </CardContent>
                </Card>
            )}

            <div className="flex justify-end mt-6">
                <Button type="submit" loading={updateSettingMutation.isPending || updateUserMutation.isPending}>
                    <Save className="w-4 h-4 mr-2" />
                    Save General Settings
                </Button>
            </div>
        </form>
    );
}

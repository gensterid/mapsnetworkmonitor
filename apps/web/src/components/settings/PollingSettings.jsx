import React from 'react';
import { Clock, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

const SettingSection = ({ title, description, children }) => (
    <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-800">
        <div className="mb-4">
            <h4 className="text-sm font-medium text-slate-200">{title}</h4>
            <p className="text-xs text-slate-500">{description}</p>
        </div>
        {children}
    </div>
);

export default function PollingSettings({ formData, handleChange, handleSubmit, updateSettingMutation, saveStatus }) {
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
                        <Clock className="w-5 h-5 text-primary" />
                        Global Polling Intervals
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <SettingSection
                        title="Router Polling (Netwatch / Traffic)"
                        description="Interval pengambilan data trafik dan status router MikroTik."
                    >
                        <div className="flex items-center gap-4">
                            <div className="flex-1">
                                <Input
                                    type="number"
                                    name="pollingInterval"
                                    value={formData.pollingInterval}
                                    onChange={handleChange}
                                    min={10}
                                    max={300}
                                    className="w-full"
                                />
                                <p className="text-xs text-slate-500 mt-1">Dalam detik (Default: 30s)</p>
                            </div>
                        </div>
                    </SettingSection>

                    <div className="border-t border-slate-800 my-4"></div>

                    <SettingSection
                        title="OLT - Fast Polling (SNMP)"
                        description="Cek status OLT Hidup/Mati. Sangat ringan."
                    >
                        <div className="flex items-center gap-4">
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="olt_sync_enabled"
                                    checked={formData.olt_sync_enabled}
                                    onChange={handleChange}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-700 peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                            </label>
                            <div className="flex-1">
                                <Input
                                    type="number"
                                    name="olt_polling_interval"
                                    value={formData.olt_polling_interval}
                                    onChange={handleChange}
                                    min={1}
                                    max={60}
                                    disabled={!formData.olt_sync_enabled}
                                />
                                <p className="text-xs text-slate-500 mt-1">Dalam menit (Default: 1 min)</p>
                            </div>
                        </div>
                    </SettingSection>

                    <SettingSection
                        title="OLT - Full Sync (Web Scrape)"
                        description="Cek detail ONU (Sinyal/Nama). Cukup berat, jangan terlalu sering."
                    >
                        <div className="flex items-center gap-4">
                            <div className="flex-1">
                                <Input
                                    type="number"
                                    name="olt_web_interval"
                                    value={formData.olt_web_interval}
                                    onChange={handleChange}
                                    min={5}
                                    max={1440}
                                    disabled={!formData.olt_sync_enabled}
                                />
                                <p className="text-xs text-slate-500 mt-1">Dalam menit (Default: 10 min)</p>
                            </div>
                        </div>
                    </SettingSection>

                    <div className="border-t border-slate-800 my-4"></div>

                    <SettingSection
                        title="GenieACS Service (Master Switch)"
                        description="Switch utama untuk seluruh fitur GenieACS. Jika OFF, maka dedicated ACS di router juga tidak akan berfungsi."
                    >
                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        name="genieacs_enabled"
                                        checked={formData.genieacs_enabled}
                                        onChange={handleChange}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-slate-700 peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                </label>
                                <span className="text-sm font-medium text-slate-300">
                                    {formData.genieacs_enabled ? 'Service Active' : 'Service Disabled'}
                                </span>
                            </div>

                            {formData.genieacs_enabled && (
                                <div className="flex items-center gap-3 pl-2 border-l-2 border-slate-700 ml-5 py-1">
                                    <label className="text-xs font-medium text-slate-400">ACS Polling Interval:</label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            name="acs_polling_interval"
                                            value={formData.acs_polling_interval}
                                            onChange={handleChange}
                                            min={5}
                                            max={1440}
                                            className="h-8 w-20 text-xs"
                                        />
                                        <span className="text-xs text-slate-500">Menit (Semua ACS)</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </SettingSection>

                    <div className="border-t border-slate-800 my-4"></div>

                    <SettingSection
                        title="Global ACS Server (Fallback)"
                        description="Gunakan server GenieACS global ini sebagai cadangan jika router tidak memiliki pengaturan ACS sendiri."
                    >
                        <div className="space-y-4 opacity-100 disabled:opacity-50">
                            <fieldset disabled={!formData.genieacs_enabled} className="space-y-4">
                                <div className="flex items-center gap-4">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="genieacs_global_enabled"
                                            checked={formData.genieacs_global_enabled}
                                            onChange={handleChange}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-slate-700 peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                    </label>
                                    <span className="text-sm text-slate-300">Enable Global Fallback Server</span>
                                </div>

                                {formData.genieacs_global_enabled && (
                                    <div className="space-y-4 pt-2">
                                        <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                                            <span className="text-xs font-medium text-slate-300">Auto Polling (Fallback Scheduler)</span>
                                            <label className="relative inline-flex items-center cursor-pointer scale-75 origin-right">
                                                <input
                                                    type="checkbox"
                                                    name="acs_sync_enabled"
                                                    checked={formData.acs_sync_enabled}
                                                    onChange={handleChange}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-11 h-6 bg-slate-700 peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                            </label>
                                        </div>

                                        <div className="space-y-4 p-4 bg-slate-800/20 rounded-lg border border-slate-800/50">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-slate-300">Global GenieACS URL</label>
                                                <Input
                                                    name="genieacs_url"
                                                    value={formData.genieacs_url}
                                                    onChange={handleChange}
                                                    placeholder="http://ACS-SERVER-IP:7557"
                                                />
                                                <p className="text-[10px] text-slate-500">URL server cadangan jika router tidak memiliki URL spesifik.</p>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium text-slate-300">ACS Username</label>
                                                    <Input
                                                        name="genieacs_username"
                                                        value={formData.genieacs_username}
                                                        onChange={handleChange}
                                                        placeholder="admin"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium text-slate-300">ACS Password</label>
                                                    <Input
                                                        type="password"
                                                        name="genieacs_password"
                                                        value={formData.genieacs_password}
                                                        onChange={handleChange}
                                                        placeholder="••••••••"
                                                    />
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-slate-500 italic">
                                                <strong>Catatan:</strong> Biarkan kosong jika tidak menggunakan autentikasi.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </fieldset>
                        </div>
                    </SettingSection>
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button type="submit" loading={updateSettingMutation.isPending}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Polling Settings
                </Button>
            </div>
        </form>
    );
}

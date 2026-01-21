import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSettings, useUpdateSetting, useCurrentUser, useUpdateUser } from '@/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Settings as SettingsIcon, Save, RefreshCw, Bell, Globe, Clock, AlertTriangle, User, Database, Upload, Download } from 'lucide-react';
import { useExportDatabase, useImportDatabase } from '@/hooks';
import AlertSettingsPanel from '@/components/settings/AlertSettingsPanel';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { getAnimationStyleNames } from '@/components/map/animationStyles';

const TABS = [
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'general', label: 'General', icon: SettingsIcon },
    { id: 'alerts', label: 'Alert Thresholds', icon: AlertTriangle },
];

export default function Settings() {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState('profile');
    const [formData, setFormData] = useState({
        appName: 'NetMonitor',
        pollingInterval: '30',
        alertEmailEnabled: false,
        alertEmail: '',
        googleMapsApiKey: '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        animationStyle: 'default',
        // Profile fields
        name: '',
        username: '',
        image: '',
    });
    const [saveStatus, setSaveStatus] = useState('');

    const { data: settings, isLoading: isSettingsLoading } = useSettings();
    const { data: currentUser, isLoading: isUserLoading } = useCurrentUser();

    const updateSettingMutation = useUpdateSetting();
    const updateUserMutation = useUpdateUser();
    const exportDatabaseMutation = useExportDatabase();
    const importDatabaseMutation = useImportDatabase();
    const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
    const [selectedBackupFile, setSelectedBackupFile] = useState(null);

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedBackupFile(e.target.files[0]);
            setIsRestoreModalOpen(true);
        }
    };

    const confirmRestore = async () => {
        if (selectedBackupFile) {
            await importDatabaseMutation.mutateAsync(selectedBackupFile);
            setIsRestoreModalOpen(false);
            setSelectedBackupFile(null);
        }
    };

    useEffect(() => {
        if (settings) {
            setFormData(prev => ({
                ...prev,
                appName: settings.appName || 'NetMonitor',
                pollingInterval: String(settings.pollingInterval || 30),
                alertEmailEnabled: settings.alertEmailEnabled === 'true' || settings.alertEmailEnabled === true,
                alertEmail: settings.alertEmail || '',
                googleMapsApiKey: settings.googleMapsApiKey || '',
            }));
        }
    }, [settings]);

    useEffect(() => {
        if (currentUser) {
            setFormData(prev => ({
                ...prev,
                timezone: currentUser.timezone,
                name: currentUser.name || '',
                username: currentUser.username || '',
                image: currentUser.image || '',
                animationStyle: currentUser.animationStyle || 'default',
            }));
        }
    }, [currentUser]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaveStatus('Saving...');

        try {
            // Update Global Settings (Admin Only)
            if (currentUser?.role === 'admin') {
                await updateSettingMutation.mutateAsync({ key: 'appName', value: formData.appName });
                await updateSettingMutation.mutateAsync({ key: 'pollingInterval', value: parseInt(formData.pollingInterval, 10) });
                await updateSettingMutation.mutateAsync({ key: 'alertEmailEnabled', value: formData.alertEmailEnabled });
                await updateSettingMutation.mutateAsync({ key: 'alertEmail', value: formData.alertEmail });
                await updateSettingMutation.mutateAsync({ key: 'googleMapsApiKey', value: formData.googleMapsApiKey });
            }

            // Update User Profile (Self)
            if (currentUser) {
                const userUpdates = {
                    timezone: formData.timezone,
                    animationStyle: formData.animationStyle,
                };

                // Only update profile fields if on profile tab or changed
                if (activeTab === 'profile') {
                    userUpdates.name = formData.name;
                    userUpdates.username = formData.username;
                    userUpdates.image = formData.image;
                }

                await updateUserMutation.mutateAsync({
                    id: currentUser.id,
                    data: userUpdates
                });
            }

            setSaveStatus('Settings saved successfully!');
            toast.success('Settings saved');
            setTimeout(() => setSaveStatus(''), 3000);
        } catch (error) {
            setSaveStatus('Failed to save: ' + (error.message || 'Unknown error'));
            toast.error('Failed to save settings: ' + (error.message || 'Unknown error'));
        }
    };

    if (isSettingsLoading || isUserLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-950">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-950 overflow-hidden">
            <div className="p-6 border-b border-slate-800">
                <h1 className="text-2xl font-bold text-white">Settings</h1>
                <p className="text-slate-400 text-sm">Configure application settings</p>
            </div>

            {/* Tab Navigation */}
            <div className="px-6 border-b border-slate-800">
                <nav className="flex gap-1">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={clsx(
                                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-[2px]",
                                activeTab === tab.id
                                    ? "border-primary text-primary"
                                    : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600"
                            )}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            <div className="flex-1 overflow-auto p-6">
                {activeTab === 'profile' && (
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
                                    <User className="w-5 h-5" />
                                    Profile Information
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center gap-4 mb-6">
                                    <div
                                        className="h-20 w-20 rounded-full bg-slate-700 bg-center bg-cover ring-2 ring-slate-600"
                                        style={{ backgroundImage: `url("${formData.image || 'https://lh3.googleusercontent.com/aida-public/AB6AXuC1XHZMAnwPDnl7XWDZTj6Fo5vz7tTYbe25rFl6RD5z5dbMYjPsgmj5EZYVGlNUcrblJmUFusaH1lZNUdSs98aMvJZZ2d2NcHmmbIFilw69mwIv5nKCWhOMx92t1dhoxq5djsd0kT1EP29FXVBiiY4NR3ExJa9rIS2O6QKmCxq6f5nDyDdaSKWgiDbh7AIhd9xvJUAnIwme70MpVL9eGWFGZtJ3R2wd61KiqrJ2hMOff1lm1ZUFtw_fI7TTg8Nj7-acAhqr3IOSNOet'}")` }}
                                    ></div>
                                    <div className="flex-1">
                                        <label className="text-sm font-medium text-slate-300">Profile Image URL</label>
                                        <Input
                                            name="image"
                                            value={formData.image}
                                            onChange={handleChange}
                                            placeholder="https://example.com/avatar.jpg"
                                            className="mt-1"
                                        />
                                        <p className="text-xs text-slate-500 mt-1">Enter a URL for your profile picture</p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Full Name</label>
                                    <Input
                                        name="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        placeholder="John Doe"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Username</label>
                                    <Input
                                        name="username"
                                        value={formData.username}
                                        onChange={handleChange}
                                        placeholder="johndoe"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Email</label>
                                    <Input
                                        value={currentUser?.email || ''}
                                        disabled
                                        className="bg-slate-900 border-slate-800 text-slate-500"
                                    />
                                    <p className="text-xs text-slate-500">Email cannot be changed</p>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Role</label>
                                    <div className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 capitalize">
                                        {currentUser?.role || 'User'}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="flex justify-end">
                            <Button type="submit" loading={updateUserMutation.isPending}>
                                <Save className="w-4 h-4 mr-2" />
                                Save Profile
                            </Button>
                        </div>
                    </form>
                )}

                {activeTab === 'general' && (
                    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
                        {saveStatus && (
                            <div className={`p-3 rounded-lg text-sm ${saveStatus.includes('Failed')
                                ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                                : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                                }`}>
                                {saveStatus}
                            </div>
                        )}

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
                                        disabled={currentUser?.role !== 'admin'}
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
                                    <p className="text-xs text-slate-500">Pilih zona waktu untuk menampilkan waktu yang tepat</p>
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
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="alertEmailEnabled"
                                            checked={formData.alertEmailEnabled}
                                            onChange={handleChange}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-slate-700 peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                    </label>
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
                                        disabled={currentUser?.role !== 'admin'}
                                    />
                                    <p className="text-xs text-slate-500">Required for displaying router locations on the map</p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Database Management (Admin Only) */}
                        {currentUser?.role === 'admin' && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Database className="w-5 h-5" />
                                        Database Management
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center p-4 bg-slate-900 rounded-lg border border-slate-800">
                                        <div>
                                            <h3 className="text-white font-medium mb-1">Backup Database</h3>
                                            <p className="text-xs text-slate-400">Download a full SQL dump of the database.</p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => exportDatabaseMutation.mutate()}
                                            disabled={exportDatabaseMutation.isPending}
                                        >
                                            {exportDatabaseMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                                            Download Backup
                                        </Button>
                                    </div>

                                    <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center p-4 bg-slate-900 rounded-lg border border-slate-800">
                                        <div>
                                            <h3 className="text-white font-medium mb-1">Restore Database</h3>
                                            <p className="text-xs text-slate-400">Restore database from a backup file. <span className="text-red-400 font-bold">Warning: Overwrites existing data!</span></p>
                                        </div>
                                        <div className="relative">
                                            <input
                                                type="file"
                                                accept=".sql"
                                                className="hidden"
                                                id="restore-upload"
                                                onChange={handleFileSelect}
                                                disabled={importDatabaseMutation.isPending}
                                            />
                                            <Button
                                                type="button"
                                                variant="destructive"
                                                asChild
                                            >
                                                <label htmlFor="restore-upload" className="cursor-pointer">
                                                    {importDatabaseMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                                                    Restore Backup
                                                </label>
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        <div className="flex justify-end">
                            <Button type="submit" loading={updateSettingMutation.isPending || updateUserMutation.isPending}>
                                <Save className="w-4 h-4 mr-2" />
                                Save Settings
                            </Button>
                        </div>
                    </form>
                )}

                {activeTab === 'alerts' && (
                    <div className="max-w-2xl">
                        <AlertSettingsPanel />
                    </div>
                )}
            </div>

            {/* Restore Confirmation Modal */}
            <Modal
                isOpen={isRestoreModalOpen}
                onClose={() => {
                    setIsRestoreModalOpen(false);
                    setSelectedBackupFile(null);
                }}
                title="Confirm Database Restore"
            >
                <div className="space-y-4">
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <div className="text-sm text-red-200">
                            <p className="font-bold mb-1">Warning: Data Loss Risk</p>
                            <p>Restoring this backup will <strong>permanently overwrite</strong> all current data in the database. This action cannot be undone.</p>
                        </div>
                    </div>

                    <div className="text-slate-300 text-sm">
                        <p>Selected file: <span className="font-mono text-white bg-slate-800 px-1 rounded">{selectedBackupFile?.name}</span></p>
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setIsRestoreModalOpen(false);
                                setSelectedBackupFile(null);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmRestore}
                            loading={importDatabaseMutation.isPending}
                        >
                            <Upload className="w-4 h-4 mr-2" />
                            Confirm Restore
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

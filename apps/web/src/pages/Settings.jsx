import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useSettings, useUpdateSetting, useCurrentUser, useUpdateUser } from '@/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Settings as SettingsIcon, Save, RefreshCw, Bell, Globe, Clock, AlertTriangle, User, Database, Upload, Download, Activity, Plus, Trash2, Palette, Monitor, Info, Sparkles, Wrench, History, CheckCircle2, XCircle } from 'lucide-react';
import { useExportDatabase, useImportDatabase, useBackups, useDeleteBackup, useRestoreBackup, useTriggerManualBackup } from '@/hooks';
import { useTheme } from '@/context/ThemeContext';
import AlertSettingsPanel from '@/components/settings/AlertSettingsPanel';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { getAnimationStyleNames } from '@/components/map/animationStyles';
import { DEFAULT_MAP_COLORS } from '@/components/map/mapColors';

const TABS = [
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'general', label: 'General', icon: SettingsIcon },
    { id: 'map-colors', label: 'Map Colors', icon: Palette },
    { id: 'alerts', label: 'Alert Thresholds', icon: AlertTriangle },
    { id: 'polling', label: 'Polling & Sync', icon: Clock },
    { id: 'ai', label: 'AI Intelligence', icon: Sparkles },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench },
];

const SettingSection = ({ title, description, children }) => (
    <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-800">
        <div className="mb-4">
            <h4 className="text-sm font-medium text-slate-200">{title}</h4>
            <p className="text-xs text-slate-500">{description}</p>
        </div>
        {children}
    </div>
);

export default function Settings() {
    const queryClient = useQueryClient();
    const location = useLocation();
    const { theme, setTheme, themes, themeDetails } = useTheme();

    // Support deep-linking to tabs via ?tab=tabId
    const getInitialTab = () => {
        const params = new URLSearchParams(location.search);
        const tab = params.get('tab');
        return TABS.some(t => t.id === tab) ? tab : 'profile';
    };

    const [activeTab, setActiveTab] = useState(getInitialTab());
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
        // Map Colors
        mapColors: { ...DEFAULT_MAP_COLORS },
        // Polling (New)
        olt_polling_interval: '1', // SNMP
        olt_web_interval: '10', // Web
        acs_polling_interval: '10', // ACS
        olt_sync_enabled: true,
        acs_sync_enabled: true,
        genieacs_enabled: true,
        genieacs_global_enabled: true,
        // GenieACS
        genieacs_url: '',
        genieacs_username: '',
        genieacs_password: '',
        webhook_base_url: 'http://localhost:5173',
        aiEnabled: false,
        aiApiKey: '',
        // Retention Settings
        metrics_retention_days: '360',
        interface_metrics_retention_days: '360',
        alerts_retention_days: '60',
        audit_logs_retention_days: '365',
    });
    const [saveStatus, setSaveStatus] = useState('');
    const [pingTargets, setPingTargets] = useState([
        { ip: '8.8.8.8', label: 'Google DNS' },
        { ip: '1.1.1.1', label: 'Cloudflare' }
    ]);

    const { data: settings, isLoading: isSettingsLoading } = useSettings();
    const { data: currentUser, isLoading: isUserLoading } = useCurrentUser();

    const updateSettingMutation = useUpdateSetting();
    const updateUserMutation = useUpdateUser();
    const exportDatabaseMutation = useExportDatabase();
    const importDatabaseMutation = useImportDatabase();
    const backupHistory = useBackups();
    const deleteBackupMutation = useDeleteBackup();
    const restoreBackupMutation = useRestoreBackup();
    const triggerBackupMutation = useTriggerManualBackup();

    const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
    const [selectedBackupFile, setSelectedBackupFile] = useState(null);
    const [localBackupToRestore, setLocalBackupToRestore] = useState(null);
    const [isLocalRestoreModalOpen, setIsLocalRestoreModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [backupToDelete, setBackupToDelete] = useState(null);

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

    const confirmLocalRestore = async () => {
        if (localBackupToRestore) {
            await restoreBackupMutation.mutateAsync(localBackupToRestore);
            setIsLocalRestoreModalOpen(false);
            setLocalBackupToRestore(null);
        }
    };

    const confirmDelete = async () => {
        if (backupToDelete) {
            await deleteBackupMutation.mutateAsync(backupToDelete);
            setIsDeleteModalOpen(false);
            setBackupToDelete(null);
            backupHistory.refetch();
        }
    };

    const handleManualBackup = async () => {
        await triggerBackupMutation.mutateAsync();
        backupHistory.refetch();
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
                webhook_base_url: settings.webhook_base_url || 'http://localhost:5173',
                genieacs_url: settings.genieacs_url || '',
                genieacs_username: settings.genieacs_username || '',
                genieacs_password: settings.genieacs_password_encrypted || '',
                olt_sync_enabled: settings.olt_sync_enabled === 'true' || settings.olt_sync_enabled === true,
                acs_sync_enabled: settings.acs_sync_enabled === 'true' || settings.acs_sync_enabled === true,
                genieacs_enabled: settings.genieacs_enabled === 'true' || settings.genieacs_enabled === true || settings.genieacs_enabled === undefined,
                genieacs_global_enabled: settings.genieacs_global_enabled === 'true' || settings.genieacs_global_enabled === true || settings.genieacs_global_enabled === undefined,
                olt_web_interval: String(settings.olt_web_interval || 10),
                acs_polling_interval: String(settings.acs_polling_interval || 10),
            }));
            // Load ping targets from settings
            if (settings.pingTargets && Array.isArray(settings.pingTargets)) {
                setPingTargets(settings.pingTargets);
            }
            // Load Retention Settings
            setFormData(prev => ({
                ...prev,
                metrics_retention_days: String(settings.metrics_retention_days || 360),
                interface_metrics_retention_days: String(settings.interface_metrics_retention_days || 360),
                alerts_retention_days: String(settings.alerts_retention_days || 60),
                audit_logs_retention_days: String(settings.audit_logs_retention_days || 365),
            }));
            // Load map colors
            if (settings.mapColors) {
                setFormData(prev => ({
                    ...prev,
                    genieacs_username: settings.genieacs_username || '',
                    genieacs_password: settings.genieacs_password_encrypted || '',
                    mapColors: settings.mapColors,
                }));
            }
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
                aiEnabled: currentUser.aiEnabled || false,
                aiApiKey: currentUser.aiApiKey || '',
            }));
        }
    }, [currentUser]);

    const handleChange = (e) => {
        const { name, value, type, checked, dataset } = e.target;

        // Handle nested mapColors changes
        if (dataset.group === 'mapColors') {
            setFormData(prev => ({
                ...prev,
                mapColors: {
                    ...prev.mapColors,
                    [name]: value
                }
            }));
            return;
        }

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
            if (currentUser?.role === 'admin' || currentUser?.role === 'superadmin') {
                await updateSettingMutation.mutateAsync({ key: 'appName', value: formData.appName });
                await updateSettingMutation.mutateAsync({ key: 'pollingInterval', value: parseInt(formData.pollingInterval, 10) });
                await updateSettingMutation.mutateAsync({ key: 'alertEmailEnabled', value: formData.alertEmailEnabled });
                await updateSettingMutation.mutateAsync({ key: 'alertEmail', value: formData.alertEmail });
                await updateSettingMutation.mutateAsync({ key: 'googleMapsApiKey', value: formData.googleMapsApiKey });

                // Save ping targets (filter out empty ones)
                const validTargets = pingTargets.filter(t => t.ip.trim() !== '');
                await updateSettingMutation.mutateAsync({ key: 'pingTargets', value: validTargets });
                await updateSettingMutation.mutateAsync({ key: 'mapColors', value: formData.mapColors });
                await updateSettingMutation.mutateAsync({ key: 'webhook_base_url', value: formData.webhook_base_url });
                await updateSettingMutation.mutateAsync({ key: 'genieacs_url', value: formData.genieacs_url });
                await updateSettingMutation.mutateAsync({ key: 'genieacs_username', value: formData.genieacs_username });
                await updateSettingMutation.mutateAsync({ key: 'genieacs_password_encrypted', value: formData.genieacs_password });

                // Save Polling Settings
                await updateSettingMutation.mutateAsync({ key: 'olt_polling_interval', value: parseInt(formData.olt_polling_interval) });
                await updateSettingMutation.mutateAsync({ key: 'olt_web_interval', value: parseInt(formData.olt_web_interval) });
                await updateSettingMutation.mutateAsync({ key: 'acs_polling_interval', value: parseInt(formData.acs_polling_interval) });
                await updateSettingMutation.mutateAsync({ key: 'olt_sync_enabled', value: formData.olt_sync_enabled });
                await updateSettingMutation.mutateAsync({ key: 'acs_sync_enabled', value: formData.acs_sync_enabled });
                await updateSettingMutation.mutateAsync({ key: 'genieacs_enabled', value: formData.genieacs_enabled });
                await updateSettingMutation.mutateAsync({ key: 'genieacs_global_enabled', value: formData.genieacs_global_enabled });

                // Save Retention Settings
                await updateSettingMutation.mutateAsync({ key: 'metrics_retention_days', value: parseInt(formData.metrics_retention_days, 10) });
                await updateSettingMutation.mutateAsync({ key: 'interface_metrics_retention_days', value: parseInt(formData.interface_metrics_retention_days, 10) });
                await updateSettingMutation.mutateAsync({ key: 'alerts_retention_days', value: parseInt(formData.alerts_retention_days, 10) });
                await updateSettingMutation.mutateAsync({ key: 'audit_logs_retention_days', value: parseInt(formData.audit_logs_retention_days, 10) });
            }

            // Update User Profile (Self)
            if (currentUser) {
                const userUpdates = {
                    name: formData.name,
                    username: formData.username,
                    image: formData.image,
                    timezone: formData.timezone,
                    animationStyle: formData.animationStyle,
                    aiEnabled: formData.aiEnabled,
                    aiApiKey: formData.aiApiKey,
                };
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
        <div className="flex flex-col h-full bg-background-dark overflow-hidden">
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
                )}

                {activeTab === 'maintenance' && (
                    <div className="max-w-4xl space-y-6">
                        {/* Data Retention Policy (Admin Only) */}
                        {(currentUser?.role === 'admin' || currentUser?.role === 'superadmin') && (
                            <Card className="border-primary/20 shadow-lg shadow-primary/5">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <History className="w-5 h-5 text-primary" />
                                        Data Retention Policy
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-300">Device Metrics (CPU/RAM/Temp)</label>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    name="metrics_retention_days"
                                                    value={formData.metrics_retention_days}
                                                    onChange={handleChange}
                                                    min={1}
                                                    className="bg-slate-900/50"
                                                />
                                                <span className="text-xs text-slate-500 w-12">Days</span>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-300">Traffic History (Links)</label>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    name="interface_metrics_retention_days"
                                                    value={formData.interface_metrics_retention_days}
                                                    onChange={handleChange}
                                                    min={1}
                                                    className="bg-slate-900/50"
                                                />
                                                <span className="text-xs text-slate-500 w-12">Days</span>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-300">Resolved Alerts</label>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    name="alerts_retention_days"
                                                    value={formData.alerts_retention_days}
                                                    onChange={handleChange}
                                                    min={1}
                                                    className="bg-slate-900/50"
                                                />
                                                <span className="text-xs text-slate-500 w-12">Days</span>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-300">System Audit Logs</label>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    name="audit_logs_retention_days"
                                                    value={formData.audit_logs_retention_days}
                                                    onChange={handleChange}
                                                    min={1}
                                                    className="bg-slate-900/50"
                                                />
                                                <span className="text-xs text-slate-500 w-12">Days</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl flex items-start gap-3">
                                        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                        <div className="text-xs text-slate-400">
                                            <p className="font-bold text-amber-500/80 mb-1">Catatan Skalabilitas</p>
                                            Menyimpan data trafik untuk 500+ perangkat selama 360 hari akan menghasilkan ratusan juta baris data.
                                            Pastikan kapasitas disk server mencukupi. Pembersihan otomatis berjalan setiap hari pukul 00:00.
                                        </div>
                                    </div>

                                    <div className="flex justify-end pt-2">
                                        <Button
                                            onClick={handleSubmit}
                                            loading={updateSettingMutation.isPending}
                                            className="shadow-lg shadow-primary/20"
                                        >
                                            <Save className="w-4 h-4 mr-2" />
                                            Update Policy
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Database className="w-5 h-5 text-primary" />
                                    Database Management
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 space-y-3">
                                        <div>
                                            <h3 className="text-white font-medium mb-1">Manual Export</h3>
                                            <p className="text-xs text-slate-400">Download full SQL backup to your local computer.</p>
                                        </div>
                                        <Button
                                            type="button"
                                            className="w-full"
                                            variant="outline"
                                            onClick={() => exportDatabaseMutation.mutate()}
                                            disabled={exportDatabaseMutation.isPending}
                                        >
                                            {exportDatabaseMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                                            Download SQL File
                                        </Button>
                                    </div>

                                    <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 space-y-3">
                                        <div>
                                            <h3 className="text-white font-medium mb-1">Manual Import</h3>
                                            <p className="text-xs text-slate-400">Upload and restore from a local SQL file.</p>
                                        </div>
                                        <div className="relative">
                                            <input
                                                type="file"
                                                accept=".sql"
                                                className="hidden"
                                                id="restore-upload-maintenance"
                                                onChange={handleFileSelect}
                                                disabled={importDatabaseMutation.isPending}
                                            />
                                            <Button
                                                type="button"
                                                variant="destructive"
                                                className="w-full"
                                                asChild
                                            >
                                                <label htmlFor="restore-upload-maintenance" className="cursor-pointer">
                                                    {importDatabaseMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                                                    Upload & Restore
                                                </label>
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
                                    <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                                    <div className="text-xs text-slate-400 leading-relaxed">
                                        <p className="font-bold text-white mb-1">Pro Tip: Automated Backups</p>
                                        Sistem secara otomatis melakukan backup setiap 24 jam dan menyimpannya di server. Anda dapat mengunduh atau memulihkan data langsung dari tabel riwayat di bawah.
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0">
                                <CardTitle className="flex items-center gap-2">
                                    <History className="w-5 h-5 text-primary" />
                                    Backup History
                                </CardTitle>
                                <Button
                                    size="sm"
                                    onClick={handleManualBackup}
                                    disabled={triggerBackupMutation.isPending}
                                >
                                    <Plus className="w-4 h-4 mr-1" />
                                    Backup Now
                                </Button>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs text-slate-500 uppercase bg-slate-900/50">
                                            <tr>
                                                <th className="px-4 py-3 font-medium">Filename</th>
                                                <th className="px-4 py-3 font-medium">Date Created</th>
                                                <th className="px-4 py-3 font-medium text-right">Size</th>
                                                <th className="px-4 py-3 font-medium text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                            {backupHistory.isLoading ? (
                                                <tr>
                                                    <td colSpan="4" className="px-4 py-8 text-center text-slate-500">
                                                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                                                        Loading backups...
                                                    </td>
                                                </tr>
                                            ) : backupHistory.data?.length === 0 ? (
                                                <tr>
                                                    <td colSpan="4" className="px-4 py-8 text-center text-slate-500">
                                                        No backups found on server.
                                                    </td>
                                                </tr>
                                            ) : (
                                                backupHistory.data?.map((backup) => (
                                                    <tr key={backup.filename} className="hover:bg-slate-900/50 transition-colors group">
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <Database className="w-4 h-4 text-slate-500" />
                                                                <span className="font-mono text-slate-300">{backup.filename}</span>
                                                                {backup.filename.startsWith('auto-') && (
                                                                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 text-[10px] font-bold border border-emerald-500/20">AUTO</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-400 text-xs">
                                                            {new Date(backup.createdAt).toLocaleString()}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-slate-400 text-xs">
                                                            {(backup.size / 1024 / 1024).toFixed(2)} MB
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 text-primary hover:bg-primary/10"
                                                                    title="Download"
                                                                    asChild
                                                                >
                                                                    <a href={`${import.meta.env.VITE_API_URL || '/api'}/backup/export?filename=${backup.filename}`} download>
                                                                        <Download className="w-4 h-4" />
                                                                    </a>
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 text-amber-500 hover:bg-amber-500/10"
                                                                    title="Restore"
                                                                    onClick={() => {
                                                                        setLocalBackupToRestore(backup.filename);
                                                                        setIsLocalRestoreModalOpen(true);
                                                                    }}
                                                                >
                                                                    <RefreshCw className="w-4 h-4" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 text-red-500 hover:bg-red-500/10"
                                                                    title="Delete"
                                                                    onClick={() => {
                                                                        setBackupToDelete(backup.filename);
                                                                        setIsDeleteModalOpen(true);
                                                                    }}
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </Button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {activeTab === 'polling' && (
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
                                                        <div className="grid grid-cols-2 gap-4">
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
                )}



                {activeTab === 'map-colors' && (
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
                )}

                {activeTab === 'ai' && (
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
                                    <Sparkles className="w-5 h-5 text-primary" />
                                    AI Assist & Insights
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                        <Info className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-white mb-1">Fitur AI Personal</h4>
                                        <p className="text-xs text-slate-400 leading-relaxed">
                                            Fitur ini memungkinkan Anda menggunakan API Key Gemini pribadi. Dengan kunci Anda sendiri, rangkuman jaringan dan analisis alert menjadi lebih stabil dan tidak terpengaruh batas kuota sistem global.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl">
                                    <div>
                                        <label className="text-sm font-medium text-slate-200">Aktifkan AI Intelligence</label>
                                        <p className="text-xs text-slate-500">Gunakan AI untuk rangkuman dan analisis</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="aiEnabled"
                                            checked={formData.aiEnabled}
                                            onChange={handleChange}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-slate-700 peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                    </label>
                                </div>

                                {formData.aiEnabled && (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-sm font-medium text-slate-300">Google Gemini API Key</label>
                                                <a
                                                    href="https://aistudio.google.com/app/apikey"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-primary hover:underline flex items-center gap-1"
                                                >
                                                    Dapatkan API Key Gratis
                                                    <Globe className="w-3 h-3" />
                                                </a>
                                            </div>
                                            <Input
                                                type="password"
                                                name="aiApiKey"
                                                value={formData.aiApiKey}
                                                onChange={handleChange}
                                                placeholder="AIzaSy..."
                                                className="font-mono"
                                            />
                                            <p className="text-[10px] text-slate-500 italic">
                                                Kunci Anda disimpan dengan aman dan hanya digunakan untuk akun Anda sendiri.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <div className="flex justify-end">
                            <Button type="submit" loading={updateUserMutation.isPending}>
                                <Save className="w-4 h-4 mr-2" />
                                Simpan Konfigurasi AI
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

            {/* Restore Local Confirmation Modal */}
            <Modal
                isOpen={isLocalRestoreModalOpen}
                onClose={() => {
                    setIsLocalRestoreModalOpen(false);
                    setLocalBackupToRestore(null);
                }}
                title="Confirm System Restore"
            >
                <div className="space-y-4">
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        <div className="text-sm text-amber-200">
                            <p className="font-bold mb-1">Warning: System Rollback</p>
                            <p>You are about to restore the database to an older state. All data created after this backup was taken will be <strong>lost forever</strong>.</p>
                        </div>
                    </div>

                    <div className="text-slate-300 text-sm">
                        <p>Restoring from: <span className="font-mono text-white bg-slate-800 px-1 rounded">{localBackupToRestore}</span></p>
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setIsLocalRestoreModalOpen(false);
                                setLocalBackupToRestore(null);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmLocalRestore}
                            loading={restoreBackupMutation.isPending}
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${restoreBackupMutation.isPending ? 'animate-spin' : ''}`} />
                            Restore Now
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={isDeleteModalOpen}
                onClose={() => {
                    setIsDeleteModalOpen(false);
                    setBackupToDelete(null);
                }}
                title="Delete Backup File"
            >
                <div className="space-y-4">
                    <p className="text-slate-300 text-sm">
                        Are you sure you want to permanently delete the backup file <span className="font-mono text-white">{backupToDelete}</span> from the server?
                    </p>

                    <div className="flex justify-end gap-3 mt-6">
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setIsDeleteModalOpen(false);
                                setBackupToDelete(null);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmDelete}
                            loading={deleteBackupMutation.isPending}
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Permanently
                        </Button>
                    </div>
                </div>
            </Modal>
        </div >
    );
}

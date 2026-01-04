import React, { useState } from 'react';
import { apiClient } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit, Save, X, MessageCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import toast from 'react-hot-toast';

// Hook to fetch groups
function useNotificationGroups() {
    return useQuery({
        queryKey: ['notification-groups'],
        queryFn: async () => {
            const res = await apiClient.get('/notification-groups');
            return res.data?.data || res.data || [];
        }
    });
}

function GroupFormModal({ isOpen, onClose, group = null }) {
    const isEditing = !!group;
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState({
        name: '',
        telegramEnabled: false,
        telegramBotToken: '',
        telegramChatId: '',
        telegramThreadId: '',
        whatsappEnabled: false,
        whatsappUrl: '',
        whatsappKey: '',
        whatsappTo: '',
        messageTemplate: '',
    });

    // Reset form when modal opens/closes or when editing a different group
    React.useEffect(() => {
        if (isOpen) {
            setFormData({
                name: group?.name || '',
                telegramEnabled: group?.telegramEnabled || false,
                telegramBotToken: group?.telegramBotToken || '',
                telegramChatId: group?.telegramChatId || '',
                telegramThreadId: group?.telegramThreadId || '',
                whatsappEnabled: group?.whatsappEnabled || false,
                whatsappUrl: group?.whatsappUrl || '',
                whatsappKey: group?.whatsappKey || '',
                whatsappTo: group?.whatsappTo || '',
                messageTemplate: group?.messageTemplate || '',
            });
        }
    }, [isOpen, group]);

    const mutation = useMutation({
        mutationFn: async (data) => {
            if (isEditing) {
                return apiClient.put(`/notification-groups/${group.id}`, data);
            }
            return apiClient.post('/notification-groups', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['notification-groups']);
            toast.success(isEditing ? 'Group updated' : 'Group created');
            onClose();
        },
        onError: (err) => {
            toast.error(err.response?.data?.message || 'Failed to save group');
        }
    });

    const handleChange = (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setFormData(prev => ({ ...prev, [e.target.name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        mutation.mutate(formData);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? "Edit Notification Group" : "New Notification Group"}>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Group Name</label>
                    <Input name="name" value={formData.name} onChange={handleChange} placeholder="e.g. NOC Team" required />
                </div>

                {/* Telegram Section */}
                <div className="border border-slate-800 rounded-lg p-4 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Send className="w-5 h-5 text-blue-400" />
                        <h3 className="font-medium text-white">Telegram</h3>
                        <label className="ml-auto flex items-center gap-2 cursor-pointer">
                            <span className="text-xs text-slate-400">Enable</span>
                            <input
                                type="checkbox"
                                name="telegramEnabled"
                                checked={formData.telegramEnabled}
                                onChange={handleChange}
                                className="toggle-checkbox"
                            />
                        </label>
                    </div>

                    {formData.telegramEnabled && (
                        <>
                            <div className="space-y-2">
                                <label className="text-xs text-slate-400">Bot Token</label>
                                <Input name="telegramBotToken" value={formData.telegramBotToken} onChange={handleChange} placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <label className="text-xs text-slate-400">Chat ID</label>
                                    <Input name="telegramChatId" value={formData.telegramChatId} onChange={handleChange} placeholder="-1001234567890" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs text-slate-400">Thread ID (Topic)</label>
                                    <Input name="telegramThreadId" value={formData.telegramThreadId} onChange={handleChange} placeholder="Optional" />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* WhatsApp Section */}
                <div className="border border-slate-800 rounded-lg p-4 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <MessageCircle className="w-5 h-5 text-green-400" />
                        <h3 className="font-medium text-white">WhatsApp</h3>
                        <label className="ml-auto flex items-center gap-2 cursor-pointer">
                            <span className="text-xs text-slate-400">Enable</span>
                            <input
                                type="checkbox"
                                name="whatsappEnabled"
                                checked={formData.whatsappEnabled}
                                onChange={handleChange}
                                className="toggle-checkbox"
                            />
                        </label>
                    </div>

                    {formData.whatsappEnabled && (
                        <>
                            <div className="space-y-2">
                                <label className="text-xs text-slate-400">API URL (Base)</label>
                                <Input name="whatsappUrl" value={formData.whatsappUrl} onChange={handleChange} placeholder="http://localhost:3000" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <label className="text-xs text-slate-400">API Key (Optional)</label>
                                    <Input name="whatsappKey" value={formData.whatsappKey} onChange={handleChange} placeholder="Secret Key" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs text-slate-400">Target Number</label>
                                    <Input name="whatsappTo" value={formData.whatsappTo} onChange={handleChange} placeholder="628123456789" />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Custom Message Template Section */}
                <div className="border border-slate-800 rounded-lg p-4 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Edit className="w-5 h-5 text-purple-400" />
                        <h3 className="font-medium text-white">Message Template</h3>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-slate-400">Customize notification format (optional)</label>
                        <textarea
                            name="messageTemplate"
                            value={formData.messageTemplate || ''}
                            onChange={handleChange}
                            placeholder={`{{icon}} *{{title}}*

{{message}}

📍 *Device:* {{device}}
🌐 *IP:* {{ip}}
📌 *Location:* {{location}}
🗺️ *Maps:* {{maps_link}}
⏰ *Time:* {{time}}`}
                            className="w-full h-40 bg-slate-900 border border-slate-700 rounded-md p-2 text-white text-xs font-mono focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                        <div className="text-[10px] text-slate-500 space-y-1">
                            <p>Available variables:</p>
                            <div className="flex flex-wrap gap-2">
                                <code className="bg-slate-800 px-1 rounded">{"{{icon}}"}</code>
                                <code className="bg-slate-800 px-1 rounded">{"{{title}}"}</code>
                                <code className="bg-slate-800 px-1 rounded">{"{{message}}"}</code>
                                <code className="bg-slate-800 px-1 rounded">{"{{device}}"}</code>
                                <code className="bg-slate-800 px-1 rounded">{"{{ip}}"}</code>
                                <code className="bg-slate-800 px-1 rounded">{"{{location}}"}</code>
                                <code className="bg-slate-800 px-1 rounded text-emerald-400">{"{{coordinates}}"}</code>
                                <code className="bg-slate-800 px-1 rounded text-emerald-400">{"{{maps_link}}"}</code>
                                <code className="bg-slate-800 px-1 rounded">{"{{time}}"}</code>
                                <code className="bg-slate-800 px-1 rounded">{"{{severity}}"}</code>
                                <code className="bg-slate-800 px-1 rounded">{"{{netwatch_host}}"}</code>
                                <code className="bg-slate-800 px-1 rounded">{"{{netwatch_name}}"}</code>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
                    <Button type="submit" loading={mutation.isPending}>Save Group</Button>
                </div>
            </form>
        </Modal>
    );
}

export default function NotificationGroups() {
    const { data: groups = [], isLoading } = useNotificationGroups();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState(null);
    const queryClient = useQueryClient();

    const deleteMutation = useMutation({
        mutationFn: async (id) => apiClient.delete(`/notification-groups/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries(['notification-groups']);
            toast.success('Group deleted');
        }
    });

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-2">Notification Groups</h1>
                    <p className="text-slate-400">Manage notification channels for your routers</p>
                </div>
                <Button onClick={() => setIsModalOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    New Group
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groups.map(group => (
                    <Card key={group.id} className="bg-slate-900 border-slate-800">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex justify-between items-center text-lg">
                                {group.name}
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => setEditingGroup(group)}
                                        className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                                    >
                                        <Edit className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (window.confirm('Apakah Anda yakin ingin menghapus grup ini?')) {
                                                deleteMutation.mutate(group.id);
                                            }
                                        }}
                                        className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex items-center justify-between p-2 rounded bg-slate-950/50 border border-slate-800/50">
                                <div className="flex items-center gap-2">
                                    <Send className={`w-4 h-4 ${group.telegramEnabled ? 'text-blue-400' : 'text-slate-600'}`} />
                                    <span className="text-sm text-slate-300">Telegram</span>
                                </div>
                                <span className={`text-xs px-2 py-0.5 rounded ${group.telegramEnabled ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-800 text-slate-500'}`}>
                                    {group.telegramEnabled ? 'On' : 'Off'}
                                </span>
                            </div>

                            <div className="flex items-center justify-between p-2 rounded bg-slate-950/50 border border-slate-800/50">
                                <div className="flex items-center gap-2">
                                    <MessageCircle className={`w-4 h-4 ${group.whatsappEnabled ? 'text-green-400' : 'text-slate-600'}`} />
                                    <span className="text-sm text-slate-300">WhatsApp</span>
                                </div>
                                <span className={`text-xs px-2 py-0.5 rounded ${group.whatsappEnabled ? 'bg-green-500/10 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
                                    {group.whatsappEnabled ? 'On' : 'Off'}
                                </span>
                            </div>

                            {(group.telegramEnabled || group.whatsappEnabled) && (
                                <div className="pt-2 text-xs text-slate-500 flex gap-2">
                                    {group.telegramThreadId && <span className="bg-slate-800 px-1.5 py-0.5 rounded">Topic: {group.telegramThreadId}</span>}
                                    {group.whatsappTo && <span className="bg-slate-800 px-1.5 py-0.5 rounded">WA: {group.whatsappTo}</span>}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}

                {groups.length === 0 && !isLoading && (
                    <div className="col-span-full py-12 text-center text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
                        No notification groups created yet.
                    </div>
                )}
            </div>

            <GroupFormModal
                isOpen={isModalOpen || !!editingGroup}
                onClose={() => {
                    setIsModalOpen(false);
                    setEditingGroup(null);
                }}
                group={editingGroup}
            />
        </div>
    );
}

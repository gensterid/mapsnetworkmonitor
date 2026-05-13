import React from 'react';
import { Sparkles, Info, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import Toggle from '@/components/ui/Toggle';

const toEvent = (name, checked) => ({ target: { name, type: 'checkbox', checked, value: checked } });

export default function AISettings({ formData, handleChange, handleSubmit, updateUserMutation, saveStatus }) {
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
                        <Toggle
                            checked={formData.aiEnabled}
                            onChange={(v) => handleChange(toEvent('aiEnabled', v))}
                            ariaLabel="Aktifkan AI Intelligence"
                        />
                    </div>

                    {formData.aiEnabled && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Google Gemini API Key</label>
                                <Input
                                    type="password"
                                    name="aiApiKey"
                                    value={formData.aiApiKey}
                                    onChange={handleChange}
                                    placeholder="Masukkan API Key Gemini Anda"
                                />
                                <p className="text-[10px] text-slate-500">Kunci ini disimpan secara aman dan hanya digunakan untuk akun Anda.</p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button type="submit" loading={updateUserMutation.isPending}>
                    <Save className="w-4 h-4 mr-2" />
                    Save AI Settings
                </Button>
            </div>
        </form>
    );
}

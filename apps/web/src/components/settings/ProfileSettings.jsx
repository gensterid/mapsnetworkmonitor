import React from 'react';
import { User, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function ProfileSettings({ formData, handleChange, currentUser, updateUserMutation, saveStatus, handleSubmit }) {
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
    );
}

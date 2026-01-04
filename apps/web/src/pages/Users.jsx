import React, { useState } from 'react';
import { useUsers, useCreateUser, useUpdateUserRole, useUpdateUser, useUpdateUserPassword, useDeleteUser } from '@/hooks';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { AssignRouterModal } from '@/components/users/AssignRouterModal';
import { Users as UsersIcon, Shield, UserPlus, RefreshCw, Mail, ChevronDown, Check, Edit2, Trash2, Key, X, Router as RouterIcon } from 'lucide-react';
import clsx from 'clsx';

// RoleSelector dropdown component
function RoleSelector({ currentRole, userId, onRoleChange, disabled, isOpen, onToggle }) {
    const [isUpdating, setIsUpdating] = useState(false);
    const updateRole = useUpdateUserRole();

    const roles = [
        { value: 'admin', label: 'Admin', color: 'bg-red-500/10 text-red-400', desc: 'Full access' },
        { value: 'operator', label: 'Operator', color: 'bg-yellow-500/10 text-yellow-400', desc: 'Manage routers' },
        { value: 'user', label: 'User', color: 'bg-slate-700 text-slate-300', desc: 'View only' },
    ];

    const handleRoleSelect = async (newRole) => {
        if (newRole === currentRole) {
            onToggle(false);
            return;
        }

        setIsUpdating(true);
        try {
            await updateRole.mutateAsync({ id: userId, role: newRole });
            onRoleChange?.();
        } catch (error) {
            alert('Failed to update role: ' + (error.message || 'Unknown error'));
        } finally {
            setIsUpdating(false);
            onToggle(false);
        }
    };

    const currentRoleData = roles.find(r => r.value === currentRole) || roles[2];

    return (
        <div className="relative">
            <button
                onClick={(e) => {
                    e.stopPropagation(); // Prevent card click
                    !disabled && !isUpdating && onToggle(!isOpen);
                }}
                disabled={disabled || isUpdating}
                className={clsx(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-all",
                    currentRoleData.color,
                    disabled ? "opacity-50 cursor-not-allowed" : "hover:ring-2 hover:ring-white/20 cursor-pointer"
                )}
            >
                {isUpdating ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                    <>
                        {currentRole}
                        {!disabled && <ChevronDown className="w-3 h-3" />}
                    </>
                )}
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => onToggle(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 z-50 w-48 rounded-lg bg-slate-800 border border-slate-700 shadow-xl overflow-hidden">
                        <div className="p-1">
                            {roles.map((role) => (
                                <button
                                    key={role.value}
                                    onClick={() => handleRoleSelect(role.value)}
                                    className={clsx(
                                        "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                                        role.value === currentRole ? "bg-slate-700" : "hover:bg-slate-700/50"
                                    )}
                                >
                                    <div className="flex flex-col items-start">
                                        <span className={clsx("font-medium", role.color.split(' ')[1])}>{role.label}</span>
                                        <span className="text-xs text-slate-500">{role.desc}</span>
                                    </div>
                                    {role.value === currentRole && <Check className="w-4 h-4 text-primary" />}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// Add User Modal
function AddUserModal({ isOpen, onClose, onSuccess }) {
    const [formData, setFormData] = useState({
        name: '',
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: 'user',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const createUser = useCreateUser();

    const handleChange = (e) => {
        const { name, value } = e.target;
        // Sanitize username input
        if (name === 'username') {
            const sanitized = value.toLowerCase().replace(/[^a-z0-9_]/g, '');
            setFormData(prev => ({ ...prev, [name]: sanitized }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (formData.password.length < 8) {
            setError('Password minimal 8 karakter');
            return;
        }

        setIsSubmitting(true);
        try {
            await createUser.mutateAsync({
                name: formData.name,
                username: formData.username || undefined,
                email: formData.email,
                password: formData.password,
                role: formData.role,
            });
            // Reset form
            setFormData({ name: '', username: '', email: '', password: '', confirmPassword: '', role: 'user' });
            onSuccess?.();
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to create user');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add New User">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Full Name</label>
                    <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Enter name"
                        required
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Username</label>
                        <input
                            type="text"
                            name="username"
                            value={formData.username}
                            onChange={handleChange}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="username (optional)"
                        />
                        <p className="text-xs text-slate-500 mt-1">Untuk login dengan username</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                        <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Enter email"
                            required
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
                        <input
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Password"
                            required
                            minLength={8}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Confirm Password</label>
                        <input
                            type="password"
                            name="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Confirm"
                            required
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
                    <select
                        name="role"
                        value={formData.role}
                        onChange={handleChange}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                        <option value="user">User - View only</option>
                        <option value="operator">Operator - Manage routers</option>
                        <option value="admin">Admin - Full access</option>
                    </select>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" loading={isSubmitting}>
                        Create User
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

// Edit User Modal
function EditUserModal({ user, isOpen, onClose, onSuccess }) {
    const [name, setName] = useState(user?.name || '');
    const [username, setUsername] = useState(user?.username || '');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [error, setError] = useState('');

    const updateUser = useUpdateUser();
    const updatePassword = useUpdateUserPassword();

    // Reset form when user changes
    React.useEffect(() => {
        if (user) {
            setName(user.name || '');
            setUsername(user.username || '');
            setPassword('');
            setConfirmPassword('');
            setError('');
        }
    }, [user]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        // Validate password match
        if (password && password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (password && password.length < 8) {
            setError('Password minimal 8 karakter');
            return;
        }

        setIsUpdating(true);
        try {
            // Update name and username if changed
            const updates = {};
            if (name !== user.name) updates.name = name;
            if (username !== (user.username || '')) updates.username = username || null;

            if (Object.keys(updates).length > 0) {
                await updateUser.mutateAsync({ id: user.id, data: updates });
            }

            // Update password if provided
            if (password) {
                await updatePassword.mutateAsync({ id: user.id, password });
            }

            onSuccess?.();
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to update user');
        } finally {
            setIsUpdating(false);
        }
    };

    if (!user) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Edit User: ${user.name}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        Full Name
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Enter name"
                        required
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">
                            Username
                        </label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="username"
                        />
                        <p className="text-xs text-slate-500 mt-1">Untuk login dengan username</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">
                            Email (tidak bisa diubah)
                        </label>
                        <input
                            type="email"
                            value={user.email}
                            disabled
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-500 cursor-not-allowed"
                        />
                    </div>
                </div>

                <hr className="border-slate-700" />

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        Password Baru <span className="text-slate-500">(kosongkan jika tidak diubah)</span>
                    </label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Masukkan password baru"
                        minLength={6}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        Konfirmasi Password
                    </label>
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Konfirmasi password baru"
                    />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="ghost" onClick={onClose}>
                        Batal
                    </Button>
                    <Button type="submit" loading={isUpdating}>
                        Simpan
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

export default function Users() {
    const { data: users = [], isLoading, error, refetch } = useUsers();
    const [editingUser, setEditingUser] = useState(null);
    const [assigningUser, setAssigningUser] = useState(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [activeDropdownId, setActiveDropdownId] = useState(null);
    const deleteUser = useDeleteUser();

    const handleDelete = async (user) => {
        if (!confirm(`Are you sure you want to delete user "${user.name}"? This action cannot be undone.`)) {
            return;
        }
        try {
            await deleteUser.mutateAsync(user.id);
            refetch();
        } catch (err) {
            alert('Failed to delete user: ' + (err.message || 'Unknown error'));
        }
    };

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-950">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-950 text-red-400">
                Error loading users: {error.message}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-950 overflow-hidden" onClick={() => setActiveDropdownId(null)}>
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Users</h1>
                    <p className="text-slate-400 text-sm">Manage user accounts and permissions</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => refetch()}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                    </Button>
                    <Button onClick={() => setIsAddModalOpen(true)}>
                        <UserPlus className="w-4 h-4 mr-2" />
                        Add User
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
                {users.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-slate-800 rounded-xl">
                        <div className="w-12 h-12 bg-slate-800/50 text-slate-500 rounded-full flex items-center justify-center mb-4">
                            <UsersIcon className="w-6 h-6" />
                        </div>
                        <h3 className="text-lg font-medium text-white mb-1">No users found</h3>
                        <p className="text-slate-400">Add users to manage access</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {users.map((user) => (
                            <Card
                                key={user.id}
                                className={clsx(
                                    "hover:border-slate-600 transition-colors group relative",
                                    activeDropdownId === user.id ? "z-50" : "z-0"
                                )}
                            >
                                <CardContent className="p-5">
                                    <div className="flex items-start gap-4">
                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                                            {user.name?.charAt(0).toUpperCase() || 'U'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <h3 className="font-semibold text-white truncate">{user.name}</h3>
                                                <RoleSelector
                                                    currentRole={user.role}
                                                    userId={user.id}
                                                    onRoleChange={() => refetch()}
                                                    isOpen={activeDropdownId === user.id}
                                                    onToggle={(isOpen) => setActiveDropdownId(isOpen ? user.id : null)}
                                                />
                                            </div>
                                            <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                                                <Mail className="w-3 h-3" />
                                                <span className="truncate">{user.email}</span>
                                            </div>
                                            {/* Action buttons */}
                                            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800">
                                                <button
                                                    onClick={() => setEditingUser(user)}
                                                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                    Edit
                                                </button>

                                                {/* Only show assign button for non-admin users */}
                                                {(user.role === 'operator' || user.role === 'user') && (
                                                    <button
                                                        onClick={() => setAssigningUser(user)}
                                                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
                                                    >
                                                        <RouterIcon className="w-3.5 h-3.5" />
                                                        Routers
                                                    </button>
                                                )}

                                                <button
                                                    onClick={() => handleDelete(user)}
                                                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Add User Modal */}
            <AddUserModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSuccess={() => refetch()}
            />

            {/* Edit User Modal */}
            <EditUserModal
                user={editingUser}
                isOpen={!!editingUser}
                onClose={() => setEditingUser(null)}
                onSuccess={() => refetch()}
            />

            {/* Assign Router Modal */}
            <AssignRouterModal
                user={assigningUser}
                isOpen={!!assigningUser}
                onClose={() => setAssigningUser(null)}
            />
        </div>
    );
}

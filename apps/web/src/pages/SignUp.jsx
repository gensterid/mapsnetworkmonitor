import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signUp } from '../lib/auth-client';
import { Eye, EyeOff, Lock, Mail, User, AtSign, AlertCircle } from 'lucide-react';

export default function SignUp() {
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const { data, error } = await signUp.email({
                email,
                password,
                name,
                username: username || undefined, // Only include if provided
            });

            if (error) {
                setError(error.message || 'Failed to sign up');
            } else {
                navigate('/');
            }
        } catch (err) {
            setError('An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background-dark p-4">
            <div className="w-full max-w-md bg-surface-dark border border-white/5 rounded-xl shadow-xl overflow-hidden backdrop-blur-sm">
                <div className="p-8">
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold text-white mb-2">Create Account</h1>
                        <p className="text-gray-400">Get started with NetMonitor</p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-sm text-red-400">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300 ml-1">Full Name</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full bg-background-dark/50 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                                    placeholder="John Doe"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300 ml-1">Username (optional)</label>
                            <div className="relative">
                                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                    className="w-full bg-background-dark/50 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                                    placeholder="johndoe"
                                />
                            </div>
                            <p className="text-xs text-gray-500 ml-1">You can use this to login instead of email</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300 ml-1">Email Address</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-background-dark/50 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                                    placeholder="admin@example.com"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300 ml-1">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-background-dark/50 border border-white/10 rounded-lg pl-10 pr-12 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                                    placeholder="••••••••"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-primary-600 hover:bg-primary-500 text-white font-medium py-2.5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-background-dark disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Create Account' : 'Sign Up'}
                        </button>
                    </form>

                    <div className="mt-6 text-center text-sm text-gray-400">
                        Already have an account?{' '}
                        <Link to="/login" className="text-primary-400 hover:text-primary-300 font-medium">
                            Sign in
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

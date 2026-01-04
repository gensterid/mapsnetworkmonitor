import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn } from '../lib/auth-client';
import { Eye, EyeOff, Lock, Mail, User, AlertCircle, ArrowRight, Activity, Server, Shield } from 'lucide-react';

export default function Login() {
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [focusedInput, setFocusedInput] = useState(null);
    const navigate = useNavigate();

    // Check if input is an email
    const isEmail = (value) => value.includes('@');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Resolve username to email if needed
            let loginEmail = identifier;

            if (!isEmail(identifier)) {
                try {
                    // In production, use relative path; in dev, use localhost:3001
                    let apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
                    if (typeof window !== 'undefined' &&
                        !window.location.hostname.includes('localhost') &&
                        !window.location.hostname.includes('127.0.0.1')) {
                        apiUrl = ''; // Use current origin
                    }

                    const response = await fetch(`${apiUrl}/api/auth/lookup-email`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ identifier }),
                    });

                    if (!response.ok) {
                        const data = await response.json();
                        throw new Error(data.error || 'User not found');
                    }

                    const data = await response.json();
                    loginEmail = data.email;
                } catch (lookupError) {
                    setError('User not found');
                    setLoading(false);
                    return;
                }
            }

            const { data, error } = await signIn.email({
                email: loginEmail,
                password,
            });

            if (error) {
                setError(error.message || 'Failed to sign in');
            } else {
                // Wait a moment for session to be established, then navigate
                setTimeout(() => {
                    navigate('/');
                }, 100);
            }
        } catch (err) {
            console.error('Login error:', err);
            setError(err.message || 'An unexpected error occurred');
        } finally {
            if (!error) setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#0F172A] relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 via-background-dark to-background-dark z-0" />
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[100px] animate-pulse-slow" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[100px] animate-pulse-slow delay-1000" />

            {/* Grid Pattern */}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] [mask-image:linear-gradient(to_bottom,white,transparent)] z-0" />

            <div className="w-full max-w-md z-10 p-4">
                {/* Logo / Brand */}
                <div className="text-center mb-8 animate-fade-in-up">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-blue-400 shadow-lg shadow-blue-500/20 mb-4 transform hover:scale-105 transition-transform duration-300">
                        <Activity className="w-8 h-8 text-white relative z-10" />
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">MikroTik Monitor</h1>
                    <p className="text-blue-200/60 mt-2 text-sm">Secure Network Management System</p>
                </div>

                {/* Login Card */}
                <div className="bg-surface-dark/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up delay-100">
                    <div className="p-8">
                        {error && (
                            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 animate-shake">
                                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                <p className="text-sm text-red-400 font-medium">{error}</p>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="space-y-1.5">
                                <label className={`text-xs font-semibold tracking-wider uppercase transition-colors duration-200 ml-1 ${focusedInput === 'identifier' ? 'text-blue-400' : 'text-gray-400'}`}>
                                    Username or Email
                                </label>
                                <div className={`relative group transition-all duration-200 rounded-xl ${focusedInput === 'identifier' ? 'ring-2 ring-blue-500/50 bg-blue-500/5' : 'bg-surface-darker/50 hover:bg-surface-darker/80'}`}>
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-200">
                                        {isEmail(identifier) ? (
                                            <Mail className={`w-5 h-5 ${focusedInput === 'identifier' ? 'text-blue-400' : 'text-gray-500'}`} />
                                        ) : (
                                            <User className={`w-5 h-5 ${focusedInput === 'identifier' ? 'text-blue-400' : 'text-gray-500'}`} />
                                        )}
                                    </div>
                                    <input
                                        type="text"
                                        value={identifier}
                                        onChange={(e) => {
                                            setIdentifier(e.target.value);
                                            setError('');
                                        }}
                                        onFocus={() => setFocusedInput('identifier')}
                                        onBlur={() => setFocusedInput(null)}
                                        className="w-full bg-transparent border border-white/5 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-all duration-200"
                                        placeholder="admin"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between ml-1">
                                    <label className={`text-xs font-semibold tracking-wider uppercase transition-colors duration-200 ${focusedInput === 'password' ? 'text-blue-400' : 'text-gray-400'}`}>
                                        Password
                                    </label>
                                    <a href="#" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">Forgot password?</a>
                                </div>
                                <div className={`relative group transition-all duration-200 rounded-xl ${focusedInput === 'password' ? 'ring-2 ring-blue-500/50 bg-blue-500/5' : 'bg-surface-darker/50 hover:bg-surface-darker/80'}`}>
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-200">
                                        <Lock className={`w-5 h-5 ${focusedInput === 'password' ? 'text-blue-400' : 'text-gray-500'}`} />
                                    </div>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => {
                                            setPassword(e.target.value);
                                            setError('');
                                        }}
                                        onFocus={() => setFocusedInput('password')}
                                        onBlur={() => setFocusedInput(null)}
                                        className="w-full bg-transparent border border-white/5 rounded-xl pl-10 pr-12 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-all duration-200"
                                        placeholder="••••••••"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-white rounded-lg hover:bg-white/5 transition-all"
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full relative group overflow-hidden bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-medium py-3.5 rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-background-dark disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_0_20px_-5px_rgba(59,130,246,0.5)] group-hover:shadow-[0_0_25px_-5px_rgba(59,130,246,0.6)] mt-2"
                            >
                                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                                <div className="relative flex items-center justify-center gap-2">
                                    {loading ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            <span>Singing in...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>Sign In</span>
                                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                        </>
                                    )}
                                </div>
                            </button>
                        </form>
                    </div>

                    {/* Footer */}
                    <div className="p-4 bg-black/20 border-t border-white/5 text-center">
                        <p className="text-xs text-gray-500 flex items-center justify-center gap-2">
                            <Shield className="w-3 h-3" />
                            <span>Protected by Enterprise Grade Security</span>
                        </p>
                    </div>
                </div>

                {/* Bottom text */}
                <p className="text-center text-gray-500 text-sm mt-8">
                    Don't have an account? <span className="text-gray-400">Contact Administrator</span>
                </p>
            </div>
        </div>
    );
}

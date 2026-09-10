// src/components/admin/AdminLogin.jsx
import { useState } from 'react';
import { Lock, Mail, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useUser } from '../../contexts/UserContext';

export default function AdminLogin({ onLoginSuccess }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [isGoogleLoggingIn, setIsGoogleLoggingIn] = useState(false);
    const { login, loginWithGoogle } = useUser();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoggingIn(true);

        try {
            await login(email.trim(), password);
            if (onLoginSuccess) onLoginSuccess();
        } catch (err) {
            console.error('Login error:', err);
            setError(err.message || 'Invalid admin credentials');
        } finally {
            setIsLoggingIn(false);
        }
    };

    const handleGoogleLogin = async () => {
        setError('');
        setIsGoogleLoggingIn(true);

        try {
            await loginWithGoogle();
            if (onLoginSuccess) onLoginSuccess();
        } catch (err) {
            console.error('Google login error:', err);
            // Firebase's default message for this code is a wall of text
            // referencing linkWithCredential -- not useful to show an
            // admin trying to sign in.
            if (err.code === 'auth/account-exists-with-different-credential') {
                setError(
                    'This email already has a password-based account that Google Sign-In '
                    + "isn't linked to. Sign in with the password instead, or enable account "
                    + 'linking in Firebase Authentication settings.'
                );
            } else if (err.code === 'auth/popup-closed-by-user') {
                // Not a real error -- they just closed the popup. Don't show a scary banner.
            } else {
                setError(err.message || 'Google sign-in failed');
            }
        } finally {
            setIsGoogleLoggingIn(false);
        }
    };

    return (
        <div className="min-h-[70vh] flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-xl space-y-6">
                <div className="text-center space-y-2">
                    <div className="inline-flex p-3 rounded-2xl bg-amber-500/10 text-amber-500 mb-2">
                        <ShieldCheck size={32} />
                    </div>
                    <h1 className="text-2xl font-black text-slate-800 dark:text-white">Admin Portal</h1>
                    <p className="text-xs text-slate-400">Sign in with authorized administrator credentials</p>
                </div>

                {error && (
                    <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
                        <AlertTriangle size={16} />
                        <span>{error}</span>
                    </div>
                )}

                <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={isGoogleLoggingIn || isLoggingIn}
                    className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl text-xs font-black text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm"
                >
                    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
                        <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
                        <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
                        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
                    </svg>
                    {isGoogleLoggingIn ? 'Signing in…' : 'Sign in with Google'}
                </button>

                <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">or</span>
                    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                            Admin Email
                        </label>
                        <div className="relative">
                            <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="admin@yourdomain.com"
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                            Password
                        </label>
                        <div className="relative">
                            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••••••"
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoggingIn || isGoogleLoggingIn}
                        className="w-full py-3 rounded-xl text-xs font-black text-white bg-amber-500 hover:bg-amber-600 active:scale-[0.98] disabled:opacity-50 transition-all shadow-md shadow-amber-500/20"
                    >
                        {isLoggingIn ? 'Authenticating…' : 'Sign In as Admin'}
                    </button>
                </form>
            </div>
        </div>
    );
}
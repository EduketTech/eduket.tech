import { useState, useEffect, useCallback } from 'react';
import {
    Gift, Plus, Ban, RefreshCw, Users, Calendar, Hash, Copy, CheckCircle2, AlertTriangle, LogOut
} from 'lucide-react';
import { listLoyaltyCodes, createLoyaltyCode, deactivateLoyaltyCode } from '../../services/billingApi';
import { useUser } from '../../contexts/UserContext';
import AdminLogin from './AdminLogin';

export default function AdminLoyaltyCodes() {
    const { user, loading: authLoading, logout } = useUser(); // <--- Access user state

    const [codes, setCodes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newCode, setNewCode] = useState('');
    const [newMaxRedemptions, setNewMaxRedemptions] = useState('');
    const [newExpiresDays, setNewExpiresDays] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState(null);

    const [copiedCode, setCopiedCode] = useState(null);
    const [actioningCode, setActioningCode] = useState(null);

    const handleLogout = async () => {
        try {
            await logout();
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    const loadCodes = useCallback(async () => {
        if (!user) return; // Prevent load if not signed in
        setLoading(true);
        setError(null);
        try {
            const { codes: fetched } = await listLoyaltyCodes();
            setCodes(fetched || []);
        } catch (err) {
            setError(err?.message || 'Could not load loyalty codes.');
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (user) {
            loadCodes();
        }
    }, [loadCodes, user]);

    // ── Auth Guard Gate ─────────────────────────────────────────
    if (authLoading) {
        return (
            <div className="p-20 text-center text-xs text-slate-400 animate-pulse">
                Verifying Admin Session…
            </div>
        );
    }

    if (!user) {
        return <AdminLogin onLoginSuccess={loadCodes} />;
    }
    // ────────────────────────────────────────────────────────────

    const handleCreate = async (e) => {
        e.preventDefault();
        setIsCreating(true);
        setCreateError(null);
        try {
            const expiresAt = newExpiresDays
                ? new Date(Date.now() + Number(newExpiresDays) * 86400000).toISOString()
                : undefined;

            await createLoyaltyCode({
                code: newCode.trim() ? newCode.trim().toUpperCase() : undefined,
                maxRedemptions: newMaxRedemptions ? Number(newMaxRedemptions) : undefined,
                expiresAt,
                description: newDescription.trim() || undefined,
            });

            setNewCode('');
            setNewMaxRedemptions('');
            setNewExpiresDays('');
            setNewDescription('');
            setShowCreateForm(false);
            await loadCodes();
        } catch (err) {
            setCreateError(err?.message || 'Could not create that code.');
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeactivate = async (code) => {
        if (!window.confirm(`Deactivate "${code}"? Schools mid-cycle keep access until it lapses, but no one will be able to (re-)redeem it after this.`)) {
            return;
        }
        setActioningCode(code);
        try {
            await deactivateLoyaltyCode(code);
            await loadCodes();
        } catch (err) {
            setError(err?.message || 'Could not deactivate that code.');
        } finally {
            setActioningCode(null);
        }
    };

    const handleCopy = (code) => {
        navigator.clipboard?.writeText(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 1500);
    };

    const formatDate = (iso) => {
        if (!iso) return null;
        try {
            return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
        } catch {
            return null;
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                        <Gift size={18} className="text-amber-500" /> خير LC
                    </h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                        لكل المدرسات خير جدا
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={loadCodes}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold transition-all"
                    >
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> بداء ايض
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowCreateForm((s) => !s)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black transition-all"
                    >
                        <Plus size={14} /> ركم جديد
                    </button>

                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 dark:bg-red-950/40 dark:border-red-900/50 transition"
                    >
                        <LogOut className="w-4 h-4 text-red-500" />
                        Logout
                    </button>
                </div>
            </div>

            {/* Create form */}
            {showCreateForm && (
                <form
                    onSubmit={handleCreate}
                    className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/50 rounded-2xl p-5 space-y-3"
                >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-200 block mb-1">
                                ركم
                            </label>
                            <input
                                type="text"
                                value={newCode}
                                onChange={(e) => setNewCode(e.target.value)}
                                placeholder="e.g. متسم"
                                className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-200 block mb-1">
                                كم مدرسة؟
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={newMaxRedemptions}
                                onChange={(e) => setNewMaxRedemptions(e.target.value)}
                                placeholder="e.g. واحد"
                                className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-200 block mb-1">
                                اي ركم انتهاة؟
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={newExpiresDays}
                                onChange={(e) => setNewExpiresDays(e.target.value)}
                                placeholder="e.g. تسعون"
                                className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-200 block mb-1">
                                ما شاي لمدرسة!
                            </label>
                            <input
                                type="text"
                                value={newDescription}
                                onChange={(e) => setNewDescription(e.target.value)}
                                placeholder="e.g. Q4 مدرسات"
                                className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
                            />
                        </div>
                    </div>

                    {createError && (
                        <p className="text-[11px] font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                            <AlertTriangle size={12} /> {createError}
                        </p>
                    )}

                    <div className="flex gap-2 pt-1">
                        <button
                            type="submit"
                            disabled={isCreating}
                            className="px-4 py-2 rounded-xl text-xs font-black text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 transition-all"
                        >
                            {isCreating ? 'Creating…' : 'Create Code'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowCreateForm(false)}
                            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-all"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {/* Error state */}
            {error && (
                <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {/* Loading state */}
            {loading && codes.length === 0 && (
                <div className="p-8 text-center text-xs text-slate-400 animate-pulse">Loading خير LC...</div>
            )}

            {/* Empty state */}
            {!loading && codes.length === 0 && !error && (
                <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                    ليس الخير LC.
                </div>
            )}

            {/* Codes list */}
            <div className="space-y-3">
                {codes.map((c) => {
                    const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
                    const exhausted = c.maxRedemptions != null && c.redeemedCount >= c.maxRedemptions;
                    const statusLabel = !c.active
                        ? 'Deactivated'
                        : expired
                            ? 'Expired'
                            : exhausted
                                ? 'Fully Redeemed'
                                : 'Active';
                    const statusColor = !c.active || expired
                        ? 'text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                        : exhausted
                            ? 'text-amber-700 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
                            : 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800';

                    return (
                        <div
                            key={c.code}
                            className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 space-y-3"
                        >
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="font-mono font-black text-sm text-slate-800 dark:text-white tracking-wide">
                                        {c.code}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => handleCopy(c.code)}
                                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                        title="Copy code"
                                    >
                                        {copiedCode === c.code ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                    </button>
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${statusColor}`}>
                                        {statusLabel}
                                    </span>
                                </div>

                                {c.active && (
                                    <button
                                        type="button"
                                        onClick={() => handleDeactivate(c.code)}
                                        disabled={actioningCode === c.code}
                                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-all"
                                    >
                                        <Ban size={12} /> {actioningCode === c.code ? 'Deactivating…' : 'Deactivate'}
                                    </button>
                                )}
                            </div>

                            {c.description && (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">{c.description}</p>
                            )}

                            <div className="flex items-center gap-4 flex-wrap text-[10px] font-bold text-slate-400">
                                <span className="flex items-center gap-1">
                                    <Users size={11} />
                                    {c.redeemedCount} redeemed{c.maxRedemptions != null ? ` / ${c.maxRedemptions} max` : ''}
                                </span>
                                {c.expiresAt && (
                                    <span className="flex items-center gap-1">
                                        <Calendar size={11} /> Expires {formatDate(c.expiresAt)}
                                    </span>
                                )}
                                {c.createdAt && (
                                    <span className="flex items-center gap-1">
                                        <Hash size={11} /> Created {formatDate(c.createdAt)}
                                    </span>
                                )}
                            </div>

                            {c.redeemedBySchools?.length > 0 && (
                                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-1.5">
                                    {c.redeemedBySchools.map((s) => (
                                        <span
                                            key={s.schoolId}
                                            className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-[10px] font-bold text-slate-600 dark:text-slate-300"
                                        >
                                            {s.schoolName}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
/**
 * ProfileChip.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shown in the navbar when a user is already signed in.
 * Shows avatar (photo or initials fallback), name, role badge,
 * school name, and a dropdown with dashboard link + sign-out.
 *
 * Props:
 *   profile     — { displayName, email, role, schoolName, photoURL }
 *   onSignOut   — called when user clicks Sign out
 *   onDashboard — called when user clicks Go to dashboard
 */

import { useState, useRef, useEffect } from 'react';
import { LogOut, LayoutDashboard, ChevronDown, User } from 'lucide-react';

const ROLE_LABELS = {
    teacher: 'Teacher',
    student: 'Student',
    principal: 'Principal',
    parent: 'Parent',
};

const ROLE_COLORS = {
    teacher: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    student: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    principal: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    parent: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

function Avatar({ profile, size = 'md' }) {
    const initials = (profile?.displayName || profile?.name || profile?.email || 'U')
        .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';

    if (profile?.photoURL) {
        return (
            <img
                src={profile.photoURL}
                alt={profile.displayName || 'User'}
                className={`${sz} rounded-full object-cover ring-2 ring-indigo-400/30 flex-shrink-0`}
            />
        );
    }
    return (
        <div className={`${sz} rounded-full bg-gradient-to-br from-indigo-500
                     to-purple-600 text-white font-black flex items-center
                     justify-center flex-shrink-0`}>
            {initials || <User size={14} />}
        </div>
    );
}

export function ProfileChip({ profile, onSignOut, onDashboard }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const role = profile?.role || 'student';
    const name = profile?.displayName || profile?.name || profile?.email?.split('@')[0] || 'User';
    const roleLabel = ROLE_LABELS[role] || 'User';
    const roleColor = ROLE_COLORS[role] || ROLE_COLORS.student;
    const schoolName = profile?.schoolName || profile?.school;

    return (
        <div className="relative z-50" ref={ref}>

            {/* Chip trigger */}
            <button
                onClick={() => setOpen(v => !v)}
                aria-expanded={open}
                className="flex items-center gap-2 px-3 py-1.5 rounded-2xl
                   bg-white dark:bg-slate-800
                   border border-slate-200 dark:border-slate-700
                   hover:border-indigo-300 dark:hover:border-indigo-600
                   shadow-sm hover:shadow-md transition-all duration-200"
            >
                <Avatar profile={profile} size="sm" />
                <span className="hidden sm:block text-sm font-bold
                          text-slate-700 dark:text-slate-200 max-w-[110px] truncate">
                    {name}
                </span>
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {open && (
                <div className="absolute right-0 top-full mt-2 w-72
                        bg-white dark:bg-slate-900
                        border border-slate-200 dark:border-slate-800
                        rounded-2xl shadow-2xl overflow-hidden
                        animate-in fade-in zoom-in-95 duration-150">

                    {/* Header */}
                    <div className="flex items-center gap-3 p-4
                          border-b border-slate-100 dark:border-slate-800">
                        <Avatar profile={profile} size="md" />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-black text-slate-800 dark:text-white truncate">{name}</p>
                            <p className="text-xs text-slate-400 truncate">{profile?.email || ''}</p>
                            <span className={`inline-block mt-1.5 text-[10px] font-black
                                uppercase tracking-wider px-2 py-0.5 rounded-full ${roleColor}`}>
                                {roleLabel}
                            </span>
                        </div>
                    </div>

                    {/* Institution (Only shown if available) */}
                    {schoolName && (
                        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                                Institution
                            </p>
                            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate">
                                {schoolName}
                            </p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="p-2">
                        <button
                            onClick={() => { setOpen(false); onDashboard?.(); }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm
                         font-bold text-slate-700 dark:text-slate-200
                         hover:bg-indigo-50 dark:hover:bg-indigo-900/30
                         hover:text-indigo-600 transition-colors text-left"
                        >
                            <LayoutDashboard size={15} />
                            Go to my dashboard
                        </button>
                        <button
                            onClick={() => { setOpen(false); onSignOut?.(); }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm
                         font-bold text-slate-500 dark:text-slate-400
                         hover:bg-red-50 dark:hover:bg-red-900/30
                         hover:text-red-500 transition-colors text-left"
                        >
                            <LogOut size={15} />
                            Sign out
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
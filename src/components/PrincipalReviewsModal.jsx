import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { MessageSquareText, X, Star, CalendarDays } from 'lucide-react';
import { db } from '../utils/firebase';   // ← adjust to your firebase config path

/* ────────────────────────────────────────────────────────────
   Live reviews written by the principal for this teacher
   ──────────────────────────────────────────────────────────── */

export function usePrincipalReviews(schoolId, teacherUid) {
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!schoolId || !teacherUid) { setLoading(false); return; }

        const q = query(
            collection(db, 'teacherReviews'),
            where('schoolId', '==', schoolId),
            where('teacherId', '==', teacherUid),
        );

        const unsub = onSnapshot(
            q,
            snap => {
                const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                rows.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
                setReviews(rows);
                setLoading(false);
            },
            err => { console.error('teacherReviews listener:', err); setLoading(false); },
        );

        return () => unsub();
    }, [schoolId, teacherUid]);

    return { reviews, loading };
}

/* ── shared bits ── */

const RATING_LABEL = {
    5: 'Exemplary',
    4: 'Strong',
    3: 'Meeting expectations',
    2: 'Developing',
    1: 'Needs support',
    0: 'Not rated',
};

const toDate = (v) => {
    if (!v) return null;
    if (typeof v?.toDate === 'function') return v.toDate();
    if (typeof v === 'object' && typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
};

const fmtDate = (d) =>
    d ? d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const Stars = ({ value, size = 12, className = '' }) => (
    <span className={`flex items-center gap-0.5 ${className}`}>
        {[1, 2, 3, 4, 5].map(n => (
            <Star
                key={n}
                size={size}
                className={n <= value ? 'fill-current' : 'opacity-25'}
            />
        ))}
    </span>
);

/* ────────────────────────────────────────────────────────────
   Header badge — sits in the gradient header, opens the modal
   ──────────────────────────────────────────────────────────── */

export function PrincipalReviewBadge({ reviews = [], onClick }) {
    if (!reviews.length) return null;

    const rated = reviews.filter(r => Number(r.rating) > 0);
    const avg = rated.length
        ? rated.reduce((n, r) => n + Number(r.rating), 0) / rated.length
        : 0;
    const withNotes = reviews.filter(r => (r.notes || '').trim()).length;

    return (
        <button
            onClick={onClick}
            className="group flex items-center gap-2.5 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-2xl text-xs font-bold border border-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
            <MessageSquareText size={14} className="opacity-80" />
            <span className="flex items-center gap-1.5">
                Principal's review
                {avg > 0 && <Stars value={Math.round(avg)} size={11} className="text-amber-300" />}
            </span>
            <span className="px-1.5 py-0.5 rounded-lg bg-white/20 text-[10px] font-black">
                {reviews.length}
            </span>
            {withNotes > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden />}
        </button>
    );
}

/* ────────────────────────────────────────────────────────────
   Modal — full review history, one card per subject
   ──────────────────────────────────────────────────────────── */

export function PrincipalReviewsModal({ open, onClose, reviews = [], reviewerNames = {} }) {
    useEffect(() => {
        if (!open) return;
        const onKey = e => e.key === 'Escape' && onClose();
        document.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [open, onClose]);

    const summary = useMemo(() => {
        const rated = reviews.filter(r => Number(r.rating) > 0);
        return {
            avg: rated.length ? rated.reduce((n, r) => n + Number(r.rating), 0) / rated.length : 0,
            subjects: reviews.length,
            latest: toDate(reviews[0]?.updatedAt),
        };
    }, [reviews]);

    if (!open) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-slate-900/60 backdrop-blur-sm"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Reviews from your principal"
        >
            <div
                onClick={e => e.stopPropagation()}
                className="w-full sm:max-w-2xl max-h-[88vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-t-[2rem] sm:rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl"
            >
                {/* header */}
                <div className="sticky top-0 z-10 bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 text-white px-6 py-5 sm:rounded-t-[2rem]">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-black tracking-tighter">Reviews from your principal</h2>
                            <p className="opacity-70 text-xs font-medium mt-1">
                                {summary.subjects} subject{summary.subjects !== 1 ? 's' : ''} reviewed
                                {summary.latest ? ` · last updated ${fmtDate(summary.latest)}` : ''}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                            aria-label="Close reviews"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {summary.avg > 0 && (
                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/10">
                            <Stars value={Math.round(summary.avg)} size={14} className="text-amber-300" />
                            <span className="text-xs font-black">{summary.avg.toFixed(1)} average</span>
                            <span className="opacity-60 text-[11px] font-medium">
                                · {RATING_LABEL[Math.round(summary.avg)]}
                            </span>
                        </div>
                    )}
                </div>

                {/* body */}
                <div className="p-5 space-y-3">
                    {reviews.length === 0 && (
                        <p className="text-sm text-slate-400 text-center py-10">
                            Your principal hasn't left a review yet.
                        </p>
                    )}

                    {reviews.map(r => {
                        const rating = Number(r.rating) || 0;
                        const when = toDate(r.updatedAt);
                        const notes = (r.notes || '').trim();
                        return (
                            <div
                                key={r.id}
                                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-4"
                            >
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div>
                                        <p className="text-sm font-black text-slate-800 dark:text-white">{r.subject}</p>
                                        <p className="text-[10px] text-slate-400 font-bold mt-0.5 flex items-center gap-1">
                                            <CalendarDays size={10} />
                                            {fmtDate(when)}
                                            {reviewerNames[r.reviewedBy] ? ` · ${reviewerNames[r.reviewedBy]}` : ''}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Stars value={rating} size={13} className="text-amber-500" />
                                        <span className="text-[10px] font-black text-slate-500 dark:text-slate-300">
                                            {RATING_LABEL[rating]}
                                        </span>
                                    </div>
                                </div>

                                {notes
                                    ? (
                                        <p className="mt-3 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                                            {notes}
                                        </p>
                                    )
                                    : (
                                        <p className="mt-3 text-[12px] text-slate-400 italic">
                                            Rating only — no written comment.
                                        </p>
                                    )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>,
        document.body,
    );
}
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Star, MessageSquareText } from 'lucide-react';

/* Shared helpers — same coercion rules as the modal version */

const toDate = (v) => {
    if (!v) return null;
    if (typeof v?.toDate === 'function') return v.toDate();
    if (typeof v === 'object' && typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
};

const fmtDate = (d) =>
    d ? d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const RATING_LABEL = {
    5: 'Exemplary', 4: 'Strong', 3: 'Meeting expectations',
    2: 'Developing', 1: 'Needs support', 0: 'Not rated',
};

export const Stars = ({ value = 0, size = 11 }) => (
    <span className="flex items-center gap-0.5 text-amber-500 flex-shrink-0">
        {[1, 2, 3, 4, 5].map(n => (
            <Star key={n} size={size} className={n <= value ? 'fill-current' : 'opacity-20'} />
        ))}
    </span>
);

/* ────────────────────────────────────────────────────────────
   One collapsible review row
   ──────────────────────────────────────────────────────────── */

function ReviewRow({ review, reviewerName, expanded, onToggle }) {
    const rating = Number(review.rating) || 0;
    const notes = (review.notes || '').trim();
    const when = toDate(review.updatedAt);

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
            <button
                onClick={onToggle}
                aria-expanded={expanded}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
                <div className="flex-1 text-left min-w-0">
                    <p className="text-xs font-black text-slate-800 dark:text-white truncate">
                        {review.subject}
                    </p>
                    <p className="text-[9px] text-slate-400 font-bold mt-0.5 truncate">
                        {fmtDate(when)}
                        {reviewerName ? ` · ${reviewerName}` : ''}
                        {notes ? '' : ' · rating only'}
                    </p>
                </div>

                {/* Stars sit inline on the row, always visible */}
                <Stars value={rating} />

                <span className="text-[9px] font-black text-slate-400 hidden sm:block whitespace-nowrap">
                    {RATING_LABEL[rating]}
                </span>

                {notes && <MessageSquareText size={11} className="text-emerald-500 flex-shrink-0" />}

                {expanded
                    ? <ChevronDown size={13} className="text-slate-400 flex-shrink-0" />
                    : <ChevronRight size={13} className="text-slate-400 flex-shrink-0" />}
            </button>

            {expanded && (
                <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3 bg-slate-50/50 dark:bg-slate-800/30">
                    {notes
                        ? (
                            <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                                {notes}
                            </p>
                        )
                        : (
                            <p className="text-[11px] text-slate-400 italic">
                                Your principal left a rating without a written comment.
                            </p>
                        )}
                </div>
            )}
        </div>
    );
}

/* ────────────────────────────────────────────────────────────
   The list
   ──────────────────────────────────────────────────────────── */

export default function PrincipalReviewsInline({ reviews = [], reviewerNames = {} }) {
    const [openId, setOpenId] = useState(null);

    if (!reviews.length) {
        return (
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-10 border border-slate-100 dark:border-slate-800 text-center">
                <Star className="text-slate-200 dark:text-slate-700 mx-auto mb-3" size={32} />
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">
                    No reviews from your principal yet
                </p>
            </div>
        );
    }

    const rated = reviews.filter(r => Number(r.rating) > 0);
    const avg = rated.length
        ? rated.reduce((n, r) => n + Number(r.rating), 0) / rated.length
        : 0;

    return (
        <div className="space-y-2">
            {/* Summary strip */}
            <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
                <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        Principal's review
                    </p>
                    <p className="text-xs font-black text-slate-800 dark:text-white mt-0.5">
                        {reviews.length} subject{reviews.length !== 1 ? 's' : ''} reviewed
                    </p>
                </div>
                {avg > 0 && (
                    <>
                        <Stars value={Math.round(avg)} size={13} />
                        <span className="text-xs font-black text-slate-700 dark:text-slate-200">
                            {avg.toFixed(1)}
                        </span>
                    </>
                )}
            </div>

            {reviews.map(r => (
                <ReviewRow
                    key={r.id}
                    review={r}
                    reviewerName={reviewerNames[r.reviewedBy]}
                    expanded={openId === r.id}
                    onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                />
            ))}
        </div>
    );
}
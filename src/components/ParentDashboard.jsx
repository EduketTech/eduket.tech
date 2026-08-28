import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    BarChart2, BookOpen, CalendarDays, ChevronDown, ChevronRight, CreditCard,
    Settings, Users, FileText, Star, TrendingUp, TrendingDown, Minus,
    AlertTriangle, CheckCircle2, Lock, Sparkles, Mail, Phone, MessageCircle,
    GraduationCap, Award, Target, Menu, X, Sun, Moon, LogOut, RefreshCw,
    HeartHandshake, ClipboardList, ChevronLeft, Clock, ShieldCheck,
} from 'lucide-react';
import {
    collection, query, where, onSnapshot, doc, getDoc, setDoc, updateDoc,
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { db } from '../utils/firebase';
import { SubscriptionsTab } from './SubscriptionsTab';

/* ════════════════════════════════════════════════════════════════════════
   DATA MODEL THIS COMPONENT ASSUMES — confirm these collections exist, or
   adjust the queries below to match your actual schema.

   parentAccess/{parentUid}_{studentUid}
       parentUid, studentUid, schoolId
       grantedAt        Firestore timestamp — set the moment the school links
                         the parent to the child. This is what starts the
                         14-day free trial clock; there is no separate
                         "activation" step.
       grantedBy        uid of the principal/teacher who linked the account
       subscriptionStatus     'active' | 'canceled' | 'past_due' | null
       subscriptionExpiresAt  Firestore timestamp | null

   users/{studentUid}   — existing student doc: name, surname, grade,
                          subjects: string[], schoolId

   exam_attempts        — existing collection: studentUid, examId, subject,
                          score, percentage, submittedAt, markedResults,
                          analysis {cognitiveAnalysis, weaknesses, studyPlan,
                          teacherSummary, parentSummary}  ← already produced
                          by generate_exam_analysis() at submission time

   exams                — existing collection: id, title, subject, grade,
                          teacherName, uploadedAt

   parentInsights/{studentUid}   (new — written by the backend route)
       generatedAt, overallSummary, overallTrend, strengths[],
       areasOfConcern[], subjectInsights[{subject, summary, concern,
       recommendation}], homeSupport[], contactTeacherFor[]

   If the AI-insights document is missing or stale, this component falls
   back to a deterministic client-side summary built from exam_attempts, so
   the dashboard is never empty while the backend route is being built.
   ════════════════════════════════════════════════════════════════════════ */

const TRIAL_DAYS = 14;
const PASS_MARK = 40;

/* ── Subject colour identity ──────────────────────────────────────────────
   The one throughline of this dashboard: every subject gets a fixed colour
   the moment it's first seen, and that colour follows it everywhere — the
   subject card, its badge, its chart bar, its entry in Exams. A parent
   scanning quickly learns "amber = the one to watch" without reading labels
   every time, the way a report card's subject rows train the eye. */
const SUBJECT_PALETTE = [
    { name: 'indigo', text: 'text-indigo-600', bg: 'bg-indigo-500', soft: 'bg-indigo-50 dark:bg-indigo-500/10', ring: 'ring-indigo-200', grad: 'from-indigo-500 to-violet-500' },
    { name: 'emerald', text: 'text-emerald-600', bg: 'bg-emerald-500', soft: 'bg-emerald-50 dark:bg-emerald-500/10', ring: 'ring-emerald-200', grad: 'from-emerald-500 to-teal-500' },
    { name: 'amber', text: 'text-amber-600', bg: 'bg-amber-500', soft: 'bg-amber-50 dark:bg-amber-500/10', ring: 'ring-amber-200', grad: 'from-amber-500 to-orange-500' },
    { name: 'rose', text: 'text-rose-600', bg: 'bg-rose-500', soft: 'bg-rose-50 dark:bg-rose-500/10', ring: 'ring-rose-200', grad: 'from-rose-500 to-pink-500' },
    { name: 'sky', text: 'text-sky-600', bg: 'bg-sky-500', soft: 'bg-sky-50 dark:bg-sky-500/10', ring: 'ring-sky-200', grad: 'from-sky-500 to-cyan-500' },
    { name: 'violet', text: 'text-violet-600', bg: 'bg-violet-500', soft: 'bg-violet-50 dark:bg-violet-500/10', ring: 'ring-violet-200', grad: 'from-violet-500 to-fuchsia-500' },
    { name: 'orange', text: 'text-orange-600', bg: 'bg-orange-500', soft: 'bg-orange-50 dark:bg-orange-500/10', ring: 'ring-orange-200', grad: 'from-orange-500 to-red-500' },
    { name: 'teal', text: 'text-teal-600', bg: 'bg-teal-500', soft: 'bg-teal-50 dark:bg-teal-500/10', ring: 'ring-teal-200', grad: 'from-teal-500 to-emerald-500' },
];

function subjectColor(subject) {
    let hash = 0;
    for (const ch of subject || '?') hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return SUBJECT_PALETTE[hash % SUBJECT_PALETTE.length];
}

/* ── helpers ─────────────────────────────────────────────────────────── */

const toDate = (v) => {
    if (!v) return null;
    if (typeof v?.toDate === 'function') return v.toDate();
    if (typeof v === 'object' && typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
};

const fmtDate = (d) => d
    ? d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

const round = (n) => Math.round(Number(n) || 0);
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const scoreOf = (a) => Number(a?.percentage ?? a?.score ?? 0);

/* ── access / trial gating ──────────────────────────────────────────────
   Presence of an access doc means the school has already granted the
   dashboard — there's no separate "pending" state to model. From there it's
   just: active subscription, or within 14 days of grantedAt, or expired.
   trialEnd and granted are attached on every branch (not just the 'trial'
   one) so downstream consumers — e.g. the Subscriptions tab's countdown —
   always have a stable field to read regardless of state. */
function computeAccess(accessDoc) {
    if (!accessDoc) return { state: 'no_link' };

    const now = Date.now();
    const granted = toDate(accessDoc.grantedAt);
    const subExpires = toDate(accessDoc.subscriptionExpiresAt);
    const subActive = accessDoc.subscriptionStatus === 'active' && (!subExpires || subExpires.getTime() > now);
    const trialEnd = granted ? new Date(granted.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000) : null;

    if (subActive) {
        return { state: 'subscribed', subExpires, granted, trialEnd };
    }

    if (trialEnd && now < trialEnd.getTime()) {
        const daysLeft = Math.max(1, Math.ceil((trialEnd.getTime() - now) / 86400000));
        return { state: 'trial', daysLeft, trialEnd, granted };
    }

    return { state: 'expired', granted, trialEnd };
}

/* ── deterministic fallback insight, used until the AI route is live ───── */
function buildFallbackInsight(subjectStats) {
    const withData = subjectStats.filter((s) => s.written > 0);
    if (!withData.length) {
        return {
            overallSummary: 'No exam attempts recorded yet. Once your child completes their first assessment, insights will appear here.',
            overallTrend: 'steady',
            strengths: [],
            areasOfConcern: [],
            subjectInsights: [],
            homeSupport: [],
            contactTeacherFor: [],
            fallback: true,
        };
    }

    const sorted = [...withData].sort((a, b) => b.avg - a.avg);
    const strongest = sorted[0];
    const weakest = sorted[sorted.length - 1];
    const concerns = withData.filter((s) => s.avg < 50 || s.passRate < 50);

    return {
        overallSummary: concerns.length
            ? `Overall performance is steady, with the most attention needed in ${concerns.map((c) => c.subject).join(', ')}.`
            : `Performance is solid across every subject with recorded results, led by ${strongest.subject}.`,
        overallTrend: 'steady',
        strengths: strongest ? [`${strongest.subject} — averaging ${round(strongest.avg)}%`] : [],
        areasOfConcern: concerns.map((c) => `${c.subject} — averaging ${round(c.avg)}%, ${round(c.passRate)}% pass rate`),
        subjectInsights: withData.map((s) => ({
            subject: s.subject,
            summary: `${s.written} attempt${s.written === 1 ? '' : 's'}, averaging ${round(s.avg)}%.`,
            concern: s.avg < 50 ? 'high' : s.avg < 65 ? 'medium' : 'low',
            recommendation: s.avg < 50
                ? 'Below half marks on average — worth a short conversation with the teacher.'
                : s.avg < 65
                    ? 'Getting there — regular revision at home should help.'
                    : 'On track — no action needed right now.',
        })),
        homeSupport: weakest ? [`Set aside 20 minutes a few times a week for ${weakest.subject} revision.`] : [],
        contactTeacherFor: concerns.map((c) => c.subject),
        fallback: true,
    };
}

/* ════════════════════════════════════════════════════════════════════════
   Small presentational pieces
   ════════════════════════════════════════════════════════════════════════ */

const ScoreRing = ({ value, size = 96, stroke = 10 }) => {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(100, value));
    const tone = pct >= 70 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#f43f5e';
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor"
                strokeWidth={stroke} className="text-slate-100 dark:text-slate-700" />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone}
                strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c}
                strokeDashoffset={c - (pct / 100) * c}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ transition: 'stroke-dashoffset 700ms ease' }} />
            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
                className="fill-slate-800 dark:fill-white font-black" style={{ fontSize: size * 0.22 }}>
                {round(pct)}%
            </text>
        </svg>
    );
};

const TrendBadge = ({ trend }) => {
    const map = {
        improving: { icon: TrendingUp, label: 'Improving', tone: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10' },
        declining: { icon: TrendingDown, label: 'Needs attention', tone: 'text-rose-600 bg-rose-50 dark:bg-rose-500/10' },
        steady: { icon: Minus, label: 'Steady', tone: 'text-slate-500 bg-slate-100 dark:bg-slate-700' },
    };
    const m = map[trend] || map.steady;
    const Icon = m.icon;
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg ${m.tone}`}>
            <Icon size={11} /> {m.label}
        </span>
    );
};

const ConcernBadge = ({ level }) => {
    const map = {
        high: { label: 'Needs support', tone: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10' },
        medium: { label: 'Keep an eye', tone: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10' },
        low: { label: 'On track', tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10' },
    };
    const m = map[level] || map.low;
    return <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg ${m.tone}`}>{m.label}</span>;
};

const StatCard = ({ icon: Icon, label, value, sub, grad }) => (
    <div className={`rounded-2xl p-4 text-white bg-gradient-to-br ${grad} shadow-sm`}>
        <div className="flex items-center justify-between mb-2">
            <Icon size={18} className="opacity-90" />
        </div>
        <p className="text-2xl font-black leading-none">{value}</p>
        <p className="text-[11px] font-bold opacity-90 mt-1">{label}</p>
        {sub && <p className="text-[9px] opacity-75 mt-0.5">{sub}</p>}
    </div>
);

const Bar = ({ value, colorClass = 'bg-indigo-500' }) => (
    <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${Math.min(100, Math.max(2, value))}%`, transition: 'width 600ms ease' }} />
    </div>
);

/* ════════════════════════════════════════════════════════════════════════
   Trial / subscription banner + gate
   ════════════════════════════════════════════════════════════════════════ */

function TrialBanner({ access, onGoToSubscriptions }) {
    if (access.state === 'subscribed') return null;

    if (access.state === 'trial') {
        const urgent = access.daysLeft <= 3;
        return (
            <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${urgent
                ? 'bg-green-500 border-green-200 dark:bg-green-500/10 dark:border-green-500/30'
                : 'bg-green-500 border-green-100 dark:bg-green-500/10 dark:border-green-500/20'}`}>
                <Clock size={16} className={urgent ? 'text-amber-600' : 'text-indigo-600'} />
                <p className="flex-1 text-xs font-medium text-black dark:text-black ">
                    {access.daysLeft} day{access.daysLeft === 1 ? '' : 's'} left in your free trial.
                    {urgent && ' Subscribe now to keep access to your child\'s dashboard.'}
                </p>
                <button onClick={onGoToSubscriptions}
                    className="px-3 py-1.5 rounded-xl text-[10px] font-black text-white bg-indigo-600 hover:bg-indigo-700 whitespace-nowrap">
                    View plans
                </button>
            </div>
        );
    }
    return null;
}

function AccessGate({ access, primary, onGoToSubscriptions }) {
    if (access.state === 'no_link') {
        return (
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-10 border border-slate-100 dark:border-slate-800 text-center max-w-lg mx-auto mt-10">
                <Users className="text-slate-200 dark:text-slate-700 mx-auto mb-3" size={40} />
                <h2 className="text-sm font-black text-slate-800 dark:text-white mb-1">No student linked yet</h2>
                <p className="text-xs text-slate-500">
                    Your account isn't linked to a learner yet. Ask your child's school to add you as a
                    parent contact — you'll get access as soon as they do.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-10 border border-slate-100 dark:border-slate-800 text-center max-w-lg mx-auto mt-10">
            <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ backgroundColor: (primary || '#4f46e5') + '20' }}>
                <Lock size={22} style={{ color: primary || '#4f46e5' }} />
            </div>
            <h2 className="text-sm font-black text-slate-800 dark:text-white mb-1">Your free trial has ended</h2>
            <p className="text-xs text-slate-500 mb-5">
                Subscribe to keep following your child's exams, subjects and progress.
                {access.granted && ` Your trial started ${fmtDate(access.granted)}.`}
            </p>
            <button onClick={onGoToSubscriptions}
                className="px-6 py-2.5 rounded-xl text-white text-xs font-black bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-90">
                View subscription plans
            </button>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════════════
   Overview tab
   ════════════════════════════════════════════════════════════════════════ */

function OverviewTab({ child, subjectStats = [], attempts = [], insight, insightLoading, onRefreshInsight, primary, PASS_MARK = 50 }) {
    // 1. Live Aggregate Metrics
    const written = subjectStats.reduce((n, s) => n + s.written, 0);
    const scored = subjectStats.filter((s) => s.written > 0);
    const overallAvg = scored.length ? mean(scored.map((s) => s.avg)) : 0;
    const overallPass = scored.length ? mean(scored.map((s) => s.passRate)) : 0;

    // 2. Direct On-Display Analytics Engine
    const computedInsights = useMemo(() => {
        if (!scored.length) {
            return {
                summary: "No assessment data available to perform analysis yet.",
                strengths: [],
                concerns: [],
                homeSupport: [],
                teacherSupport: [],
                trend: "neutral"
            };
        }

        // Categorize subjects directly from displayed subjectStats
        const sorted = [...scored].sort((a, b) => b.avg - a.avg);
        const topSubjects = sorted.filter(s => s.avg >= 75);
        const weakSubjects = sorted.filter(s => s.avg < 60);

        // Analyze recent trajectory if attempts are passed
        let trend = "neutral";
        if (attempts.length >= 2) {
            const sortedAttempts = [...attempts].sort((a, b) => (toDate(b.submittedAt)?.getTime() || 0) - (toDate(a.submittedAt)?.getTime() || 0));
            const recent = scoreOf(sortedAttempts[0]);
            const previous = scoreOf(sortedAttempts[1]);
            if (recent - previous >= 5) trend = "up";
            else if (previous - recent >= 5) trend = "down";
        }

        // Dynamic Strengths
        const strengths = topSubjects.map(s => `${s.subject}: High mastery (${round(s.avg)}% average across ${s.written} assessment${s.written > 1 ? 's' : ''})`);
        if (strengths.length === 0 && sorted.length > 0) {
            const top = sorted[0];
            strengths.push(`${top.subject}: Highest performing subject currently at ${round(top.avg)}%`);
        }

        // Dynamic Concerns
        const concerns = weakSubjects.map(s => `${s.subject}: Currently struggling (${round(s.avg)}% average, pass rate ${round(s.passRate)}%)`);

        // Actionable Recommendations based on display performance
        const homeSupport = weakSubjects.map(s => `Dedicate extra revision time to fundamental concepts in ${s.subject}.`);
        if (homeSupport.length === 0) {
            homeSupport.push("Maintain regular review habits to keep up consistency across all active subjects.");
        }

        const teacherSupport = weakSubjects.map(s => `Request targeted feedback or additional practice exercises for ${s.subject}.`);

        // Executive Summary Statement
        let summary = `${child?.firstName || 'Child'} maintains an overall average of ${round(overallAvg)}% across ${scored.length} active subject${scored.length > 1 ? 's' : ''}. `;
        if (weakSubjects.length > 0) {
            summary += `Attention is recommended in ${weakSubjects.map(s => s.subject).join(', ')} where scores are lagging.`;
        } else {
            summary += `Performance remains solid and consistently above threshold targets across all subjects.`;
        }

        return {
            summary,
            strengths,
            concerns,
            homeSupport,
            teacherSupport,
            trend
        };
    }, [scored, attempts, child, overallAvg]);

    // Use dynamic computations with fallback to external insight
    const displaySummary = insight?.overallSummary || computedInsights.summary;
    const displayStrengths = insight?.strengths?.length ? insight.strengths : computedInsights.strengths;
    const displayConcerns = insight?.areasOfConcern?.length ? insight.areasOfConcern : computedInsights.concerns;
    const displayHomeSupport = insight?.homeSupport?.length ? insight.homeSupport : computedInsights.homeSupport;
    const displayTeacherSupport = insight?.contactTeacherFor?.length ? insight.contactTeacherFor : computedInsights.teacherSupport;
    const displayTrend = insight?.overallTrend || computedInsights.trend;

    return (
        <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard icon={BookOpen} label="Subjects" value={subjectStats.length} grad="from-indigo-500 to-violet-500" />
                <StatCard icon={FileText} label="Exams & assignments" value={written} sub="attempted this year" grad="from-emerald-500 to-teal-500" />
                <StatCard icon={Award} label="Overall average" value={`${round(overallAvg)}%`} grad="from-amber-500 to-orange-500" />
                <StatCard icon={CheckCircle2} label="Overall pass rate" value={`${round(overallPass)}%`} grad="from-sky-500 to-cyan-500" />
            </div>

            {/* Hero: ring + Live Performance headline */}
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-slate-800 p-6 flex flex-col sm:flex-row items-center gap-6">
                <ScoreRing value={overallAvg} size={110} />
                <div className="flex-1 text-center sm:text-left">
                    <div className="flex items-center gap-2 justify-center sm:justify-start mb-1">
                        <Sparkles size={14} className="text-violet-500" />
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Performance Analysis</span>
                        {(!insight || insight?.fallback) && (
                            <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
                                live calculated
                            </span>
                        )}
                    </div>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200 leading-relaxed">
                        {insightLoading ? 'Analysing recent results…' : displaySummary}
                    </p>
                    <div className="flex items-center gap-2 justify-center sm:justify-start mt-3">
                        <TrendBadge trend={displayTrend} />
                        {onRefreshInsight && (
                            <button onClick={onRefreshInsight} disabled={insightLoading}
                                className="flex items-center gap-1 text-[9px] font-black text-slate-400 hover:text-slate-600 disabled:opacity-40">
                                <RefreshCw size={10} className={insightLoading ? 'animate-spin' : ''} /> Refresh AI
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Live Strengths + concerns */}
            <div className="grid sm:grid-cols-2 gap-3">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
                    <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <CheckCircle2 size={12} /> Strengths
                    </p>
                    {displayStrengths.length === 0
                        ? <p className="text-xs text-slate-400">Nothing to report yet.</p>
                        : displayStrengths.map((s, i) => (
                            <p key={i} className="text-xs text-slate-600 dark:text-slate-300 py-1">• {s}</p>
                        ))}
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
                    <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <AlertTriangle size={12} /> Areas of concern
                    </p>
                    {displayConcerns.length === 0
                        ? <p className="text-xs text-slate-400">No concerns flagged right now.</p>
                        : displayConcerns.map((s, i) => (
                            <p key={i} className="text-xs text-slate-600 dark:text-slate-300 py-1">• {s}</p>
                        ))}
                </div>
            </div>

            {/* Actionable items */}
            {(displayHomeSupport.length > 0 || displayTeacherSupport.length > 0) && (
                <div className="grid sm:grid-cols-2 gap-3">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
                        <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                            <HeartHandshake size={12} /> Support at home
                        </p>
                        {displayHomeSupport.map((s, i) => (
                            <p key={i} className="text-xs text-slate-600 dark:text-slate-300 py-1">• {s}</p>
                        ))}
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
                        <p className="text-[9px] font-black text-rose-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                            <MessageCircle size={12} /> Worth a word with the teacher
                        </p>
                        {displayTeacherSupport.length === 0
                            ? <p className="text-xs text-slate-400">No teacher conversations needed right now.</p>
                            : displayTeacherSupport.map((s, i) => (
                                <p key={i} className="text-xs text-slate-600 dark:text-slate-300 py-1">• {s}</p>
                            ))}
                    </div>
                </div>
            )}

            {/* Per-subject progress strip */}
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-slate-800 p-5">
                <h2 className="text-sm font-black text-slate-700 dark:text-white mb-4">Progress by subject</h2>
                {subjectStats.length === 0
                    ? <p className="text-xs text-slate-400">No subjects on record yet.</p>
                    : (
                        <div className="space-y-3">
                            {subjectStats.map((s) => {
                                const c = subjectColor(s.subject);
                                return (
                                    <div key={s.subject} className="flex items-center gap-3">
                                        <span className={`w-2 h-2 rounded-full ${c.bg} flex-shrink-0`} />
                                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300 w-28 sm:w-36 truncate flex-shrink-0">
                                            {s.subject}
                                        </span>
                                        <div className="flex-1">
                                            <Bar value={s.avg} colorClass={c.bg} />
                                        </div>
                                        <span className="text-[10px] font-black text-slate-500 w-10 text-right flex-shrink-0">
                                            {s.written ? `${round(s.avg)}%` : '—'}
                                        </span>
                                        <span className="text-[9px] text-slate-400 w-16 text-right flex-shrink-0 hidden sm:block">
                                            {s.written} att.
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
            </div>
        </>
    );
}

/* ════════════════════════════════════════════════════════════════════════
   Subjects (& teachers) tab
   ════════════════════════════════════════════════════════════════════════ */

function SubjectsTab({ subjectStats, insight }) {
    const [open, setOpen] = useState(null);
    const bySubject = useMemo(() => {
        const m = {};
        for (const s of (insight?.subjectInsights || [])) m[s.subject] = s;
        return m;
    }, [insight]);

    return (
        <div className="space-y-3">
            {subjectStats.length === 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-10 border border-slate-100 dark:border-slate-800 text-center">
                    <BookOpen className="text-slate-200 dark:text-slate-700 mx-auto mb-3" size={32} />
                    <p className="text-slate-400 font-bold text-xs">No subjects on record yet.</p>
                </div>
            )}

            {subjectStats.map((s) => {
                const c = subjectColor(s.subject);
                const isOpen = open === s.subject;
                const ai = bySubject[s.subject];
                return (
                    <div key={s.subject} className={`bg-white dark:bg-slate-900 rounded-2xl border overflow-hidden ${isOpen ? `ring-2 ${c.ring} dark:ring-0` : 'border-slate-100 dark:border-slate-800'}`}>
                        <button onClick={() => setOpen(isOpen ? null : s.subject)}
                            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${c.soft}`}>
                                <BookOpen size={16} className={c.text} />
                            </div>
                            <div className="flex-1 text-left min-w-0">
                                <p className="text-xs font-black text-slate-800 dark:text-white truncate">{s.subject}</p>
                                <p className="text-[9px] text-slate-400 mt-0.5 truncate">
                                    {s.teacherName || 'Teacher not yet assigned'} · {s.written} attempt{s.written === 1 ? '' : 's'}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {ai && <ConcernBadge level={ai.concern} />}
                                <span className="text-[10px] font-black text-slate-500">{s.written ? `${round(s.avg)}%` : '—'}</span>
                                {isOpen ? <ChevronDown size={13} className="text-slate-400" /> : <ChevronRight size={13} className="text-slate-400" />}
                            </div>
                        </button>

                        {isOpen && (
                            <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-4 space-y-4 bg-slate-50/50 dark:bg-slate-800/20">
                                <div className="grid grid-cols-3 gap-2.5">
                                    {[
                                        { label: 'Average', value: `${round(s.avg)}%` },
                                        { label: 'Pass rate', value: `${round(s.passRate)}%` },
                                        { label: 'Attempts', value: s.written },
                                    ].map((m) => (
                                        <div key={m.label} className="bg-white dark:bg-slate-900 rounded-xl p-3 text-center">
                                            <p className="text-sm font-black text-slate-800 dark:text-white">{m.value}</p>
                                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{m.label}</p>
                                        </div>
                                    ))}
                                </div>

                                {ai && (
                                    <div className="bg-white dark:bg-slate-900 rounded-xl p-3">
                                        <p className="text-[9px] font-black text-slate-400 uppercase mb-1.5 flex items-center gap-1">
                                            <Sparkles size={10} className="text-violet-500" /> AI note
                                        </p>
                                        <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">{ai.summary}</p>
                                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{ai.recommendation}</p>
                                    </div>
                                )}

                                {s.teacherEmail && (
                                    <a href={`mailto:${s.teacherEmail}`}
                                        className="inline-flex items-center gap-1.5 text-[10px] font-black text-indigo-600 hover:underline">
                                        <Mail size={11} /> Email {s.teacherName || 'the teacher'}
                                    </a>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════════════
   Exams tab
   ════════════════════════════════════════════════════════════════════════ */
function ExamsTab({ attempts, subjectStats, PASS_MARK = 50, MASTERY_THRESHOLD = 75 }) {
    const [filterSubject, setFilterSubject] = useState('All');
    const [openId, setOpenId] = useState(null);

    const rows = useMemo(() => {
        const filtered = filterSubject === 'All' ? attempts : attempts.filter((a) => a.subject === filterSubject);
        return [...filtered].sort((a, b) => (toDate(b.submittedAt)?.getTime() || 0) - (toDate(a.submittedAt)?.getTime() || 0));
    }, [attempts, filterSubject]);

    // Group question results into concept breakdown matching overall score logic
    const getConceptBreakdown = (a) => {
        const results = a.markedResults || [];
        const map = {};

        results.forEach((r) => {
            const concept = r.concept || r.topic || r.category || "General Understanding";
            if (!map[concept]) {
                map[concept] = { concept, total: 0, earned: 0, count: 0 };
            }

            const questionTotal = parseFloat(r.marks ?? r.totalMarks ?? 1);
            let questionEarned = 0;

            if (r.earned !== undefined) questionEarned = parseFloat(r.earned);
            else if (r.score !== undefined) questionEarned = parseFloat(r.score);
            else if (r.status === 'correct') questionEarned = questionTotal;
            else if (r.status === 'partial') questionEarned = questionTotal * 0.5;

            map[concept].total += questionTotal;
            map[concept].earned += questionEarned;
            map[concept].count += 1;
        });

        return Object.values(map).map(c => ({
            ...c,
            pct: c.total > 0 ? Math.round((c.earned / c.total) * 100) : 0
        }));
    };

    return (
        <>
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-sm font-black text-slate-700 dark:text-white">Conceptual Progress & Overview</h2>
                <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}
                    className="px-2.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 outline-none font-bold text-slate-600 dark:text-slate-200">
                    <option value="All">All subjects</option>
                    {subjectStats.map((s) => <option key={s.subject}>{s.subject}</option>)}
                </select>
            </div>

            <div className="space-y-2">
                {rows.length === 0 && (
                    <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-10 border border-slate-100 dark:border-slate-800 text-center">
                        <FileText className="text-slate-200 dark:text-slate-700 mx-auto mb-3" size={32} />
                        <p className="text-slate-400 font-bold text-xs">No attempts recorded for this subject yet.</p>
                    </div>
                )}

                {rows.map((a) => {
                    const c = subjectColor(a.subject);
                    const pct = scoreOf(a);
                    const isOpen = openId === a.id;
                    const concepts = getConceptBreakdown(a);

                    return (
                        <div key={a.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                            <button onClick={() => setOpenId(isOpen ? null : a.id)}
                                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <span className={`w-1.5 h-8 rounded-full flex-shrink-0 ${c.bg}`} />
                                <div className="flex-1 text-left min-w-0">
                                    <p className="text-xs font-black text-slate-800 dark:text-white truncate">
                                        {a.examTitle || a.subject}
                                    </p>
                                    <p className="text-[9px] text-slate-400 mt-0.5 truncate">
                                        {a.subject} · {fmtDate(toDate(a.submittedAt))}
                                    </p>
                                </div>
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg ${pct >= PASS_MARK ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40' : 'bg-rose-50 text-rose-600 dark:bg-rose-950/40'}`}>
                                    {round(pct)}% Overall
                                </span>
                                {isOpen ? <ChevronDown size={13} className="text-slate-400" /> : <ChevronRight size={13} className="text-slate-400" />}
                            </button>

                            {isOpen && (
                                <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3.5 space-y-3 bg-slate-50/50 dark:bg-slate-900/50">
                                    {/* Parent Executive Summary */}
                                    {(a.analysis?.parentSummary || a.teacherNote) && (
                                        <div className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30">
                                            <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wide mb-1">
                                                Parent Executive Summary
                                            </p>
                                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                                {a.analysis?.parentSummary || a.teacherNote}
                                            </p>
                                        </div>
                                    )}

                                    {/* Concept Breakdown Bars */}
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide mb-2">
                                            Concept Breakdown
                                        </p>
                                        <div className="space-y-2.5">
                                            {concepts.map((item, i) => {
                                                const isMastered = item.pct >= MASTERY_THRESHOLD;
                                                const isDeveloping = item.pct >= PASS_MARK && item.pct < MASTERY_THRESHOLD;

                                                const statusLabel = isMastered ? 'Mastered' : isDeveloping ? 'Developing' : 'Needs Focus';
                                                const badgeClass = isMastered
                                                    ? 'text-emerald-600 dark:text-emerald-400'
                                                    : isDeveloping
                                                        ? 'text-amber-600 dark:text-amber-400'
                                                        : 'text-rose-500';
                                                const barClass = isMastered ? 'bg-emerald-500' : isDeveloping ? 'bg-amber-500' : 'bg-rose-500';

                                                return (
                                                    <div key={i} className="bg-white dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/50">
                                                        <div className="flex items-center justify-between text-xs mb-1.5">
                                                            <span className="font-bold text-slate-700 dark:text-slate-200">
                                                                {item.concept}
                                                            </span>
                                                            <span className={`font-black text-[10px] ${badgeClass}`}>
                                                                {statusLabel} ({item.pct}%)
                                                            </span>
                                                        </div>
                                                        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full transition-all duration-300 ${barClass}`}
                                                                style={{ width: `${item.pct}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </>
    );
}


/* ════════════════════════════════════════════════════════════════════════
   Settings tab
   ════════════════════════════════════════════════════════════════════════ */

function SettingsTab({ parentUid, profile, onSaved }) {
    const [form, setForm] = useState({
        name: profile?.name || '',
        surname: profile?.surname || '',
        phone: profile?.phone || '',
        relationship: profile?.relationship || 'Parent',
        emailAlerts: profile?.emailAlerts !== false,
    });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const set = (patch) => setForm((f) => ({ ...f, ...patch }));

    const save = async () => {
        setSaving(true);
        try {
            await updateDoc(doc(db, 'users', parentUid), {
                name: form.name,
                surname: form.surname,
                phone: form.phone,
                relationship: form.relationship,
                emailAlerts: form.emailAlerts,
            });
            setSaved(true);
            onSaved?.(form);
            setTimeout(() => setSaved(false), 2500);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-lg space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5">
                <h2 className="text-sm font-black text-slate-800 dark:text-white mb-4">Your profile</h2>
                <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase">First name</label>
                        <input value={form.name} onChange={(e) => set({ name: e.target.value })}
                            className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 outline-none" />
                    </div>
                    <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase">Surname</label>
                        <input value={form.surname} onChange={(e) => set({ surname: e.target.value })}
                            className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 outline-none" />
                    </div>
                </div>
                <div className="mb-3">
                    <label className="text-[9px] font-black text-slate-400 uppercase">Phone</label>
                    <input value={form.phone} onChange={(e) => set({ phone: e.target.value })}
                        placeholder="+27 ..."
                        className="w-full mt-1 px-3 py-2 text-xs  text-white rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 outline-none" />
                </div>
                <div className="mb-4">
                    <label className="text-[9px] font-black text-slate-400 uppercase">Relationship to learner</label>
                    <select value={form.relationship} onChange={(e) => set({ relationship: e.target.value })}
                        className="w-full mt-1 px-3 py-2 text-xs text-white rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 outline-none">
                        {['Parent', 'Guardian', 'Grandparent', 'Other'].map((r) => <option key={r}>{r}</option>)}
                    </select>
                </div>
                <label className="flex items-center gap-2 mb-5 cursor-pointer">
                    <input type="checkbox" checked={form.emailAlerts}
                        onChange={(e) => set({ emailAlerts: e.target.checked })}
                        className="rounded text-white" />
                    <span className="text-xs text-slate-600 dark:text-slate-300">Email me when new results are available</span>
                </label>

                <div className="flex items-center gap-3">
                    <button onClick={save} disabled={saving}
                        className="px-5 py-2.5 rounded-xl text-white text-xs font-black bg-slate-800 dark:bg-white dark:text-slate-900 disabled:opacity-50">
                        {saving ? 'Saving…' : 'Save changes'}
                    </button>
                    {saved && <span className="text-[10px] font-black text-emerald-600">Saved ✓</span>}
                </div>
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════════════
   Main component
   ════════════════════════════════════════════════════════════════════════ */

export default function ParentDashboard({ parent }) {
    const primary = '#4f46e5';

    const [activeTab, setActiveTab] = useState('overview');
    const [isDark, setIsDark] = useState(false);
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

    const [children, setChildren] = useState([]);           // [{studentUid, name, surname, grade, schoolId, schoolName, access}]
    const [selectedChildUid, setSelectedChildUid] = useState(null);
    const [attempts, setAttempts] = useState([]);
    const [exams, setExams] = useState([]);
    const [teachersBySubject, setTeachersBySubject] = useState({});

    const [insight, setInsight] = useState(null);
    const [insightLoading, setInsightLoading] = useState(false);

    const parentUid = parent?.uid;

    /* ── load linked children + their access docs ───────────────────────── */
    useEffect(() => {
        if (!parentUid) return;
        const q = query(collection(db, 'parentAccess'), where('parentUid', '==', parentUid));
        const unsub = onSnapshot(q, async (snap) => {
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            const loaded = await Promise.all(rows.map(async (r) => {
                const sDoc = await getDoc(doc(db, 'users', r.studentUid));
                const s = sDoc.exists() ? sDoc.data() : {};
                // Student docs store a single combined `displayName` field
                // (e.g. "Cherise Tops"), not separate name/surname fields —
                // split it here so the rest of this component, which expects
                // child.name / child.surname independently, keeps working
                // without touching every place that reads them.
                const [firstName, ...rest] = (s.displayName || s.name || 'Learner').split(' ');
                return {
                    studentUid: r.studentUid,
                    schoolId: r.schoolId,
                    name: s.name || firstName,
                    surname: s.surname || rest.join(' '),
                    grade: s.grade || '',
                    schoolName: s.schoolName || '',
                    subjects: s.subjects || [],
                    access: computeAccess(r),
                };
            }));
            setChildren(loaded);
            setSelectedChildUid((prev) => prev && loaded.some((c) => c.studentUid === prev)
                ? prev
                : loaded[0]?.studentUid || null);
        }, (err) => console.error('[parentAccess]', err));
        return () => unsub();
    }, [parentUid]);

    const child = useMemo(
        () => children.find((c) => c.studentUid === selectedChildUid) || null,
        [children, selectedChildUid],
    );
    const access = child?.access || { state: 'no_link' };
    const hasAccess = access.state === 'trial' || access.state === 'subscribed';

    /* ── live attempts + exams for the selected child, only once access is valid ── */
    useEffect(() => {
        if (!child || !hasAccess) { setAttempts([]); setExams([]); return; }

        const unsubAttempts = onSnapshot(
            query(collection(db, 'exam_attempts'), where('studentUid', '==', child.studentUid)),
            (snap) => setAttempts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
            (err) => console.error('[exam_attempts]', err),
        );

        const unsubExams = onSnapshot(
            query(collection(db, 'exams'), where('schoolId', '==', child.schoolId)),
            (snap) => setExams(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
            (err) => console.error('[exams]', err),
        );

        return () => { unsubAttempts(); unsubExams(); };
    }, [child, hasAccess]);

    /* ── teacher lookup per subject, from the school's teacher roster ───── */
    useEffect(() => {
        if (!child || !hasAccess) { setTeachersBySubject({}); return; }
        const unsub = onSnapshot(
            query(collection(db, 'users'), where('schoolId', '==', child.schoolId), where('role', '==', 'teacher')),
            (snap) => {
                const map = {};
                snap.forEach((d) => {
                    const t = d.data();
                    for (const subj of (t.subjects || [])) {
                        if (!map[subj]) map[subj] = { name: t.displayName || t.name || 'Teacher', email: t.email || '' };
                    }
                });
                setTeachersBySubject(map);
            },
            (err) => console.error('[teachers]', err),
        );
        return () => unsub();
    }, [child, hasAccess]);

    /* ── attach exam titles to attempts (exam_attempts may only store examId) ── */
    const attemptsWithTitles = useMemo(() => {
        const byId = new Map(exams.map((e) => [e.id, e]));
        return attempts.map((a) => ({
            ...a,
            examTitle: a.examTitle || byId.get(a.examId)?.title || a.subject,
        }));
    }, [attempts, exams]);

    /* ── per-subject stats, built from live attempts ────────────────────── */
    const subjectStats = useMemo(() => {
        const subjects = new Set([...(child?.subjects || []), ...attemptsWithTitles.map((a) => a.subject)]);
        return Array.from(subjects).filter(Boolean).map((subject) => {
            const atts = attemptsWithTitles.filter((a) => a.subject === subject);
            const scores = atts.map(scoreOf);
            const teacher = teachersBySubject[subject];
            return {
                subject,
                written: atts.length,
                avg: mean(scores),
                passRate: scores.length ? (scores.filter((s) => s >= PASS_MARK).length / scores.length) * 100 : 0,
                teacherName: teacher?.name,
                teacherEmail: teacher?.email,
            };
        }).sort((a, b) => b.written - a.written);
    }, [child, attemptsWithTitles, teachersBySubject]);

    /* ── AI insight: load cached doc, fall back to a client-computed summary ── */
    const loadInsight = useCallback(async (forceRefresh = false) => {
        if (!child || !hasAccess) return;
        setInsightLoading(true);
        try {
            const ref = doc(db, 'parentInsights', child.studentUid);
            const snap = await getDoc(ref);
            const cached = snap.exists() ? snap.data() : null;
            const stale = !cached || (Date.now() - (toDate(cached.generatedAt)?.getTime() || 0)) > 24 * 60 * 60 * 1000;

            if (cached && !stale && !forceRefresh) {
                setInsight(cached);
                return;
            }

            // Ask the backend to (re)generate. If the route isn't live yet, or
            // fails, fall back to a deterministic summary so the tab is never
            // empty — see buildFallbackInsight() above.
            try {
                const auth = getAuth();
                const token = await auth.currentUser?.getIdToken();
                const res = await fetch(
                    `${import.meta.env.VITE_API_URL}/parent/insights/${child.studentUid}`,
                    { headers: { Authorization: `Bearer ${token}` } },
                );
                if (!res.ok) throw new Error(`insights ${res.status}`);
                const data = await res.json();
                setInsight(data);
            } catch (err) {
                console.warn('[insights] backend unavailable, using fallback:', err.message);
                setInsight(cached || buildFallbackInsight(subjectStats));
            }
        } finally {
            setInsightLoading(false);
        }
    }, [child, hasAccess, subjectStats]);

    useEffect(() => { loadInsight(false); }, [child?.studentUid, hasAccess]); // eslint-disable-line react-hooks/exhaustive-deps

    // Keep something on screen immediately, even before the async load resolves
    useEffect(() => {
        if (!insight && subjectStats.length >= 0 && hasAccess) {
            setInsight(buildFallbackInsight(subjectStats));
        }
    }, [subjectStats, hasAccess]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSubscribe = useCallback(async (cycle) => {
        // Stub — wire this to your PayFast checkout endpoint once the backend
        // subscription route exists. Expected to redirect to a PayFast form.
        console.log('[subscribe] cycle:', cycle, 'child:', child?.studentUid);
        alert('Payment checkout isn\'t connected yet — this button is ready for the backend PayFast route.');
    }, [child]);

    const handleSignOut = async () => {
        await signOut(getAuth());
    };

    const tabs = [
        { id: 'overview', label: 'Overview', icon: BarChart2 },
        { id: 'subjects', label: 'Subjects', icon: GraduationCap },
        { id: 'exams', label: 'Exams', icon: ClipboardList },
        { id: 'subscriptions', label: 'Subscription', icon: CreditCard },
        { id: 'settings', label: 'Settings', icon: Settings },
    ];

    // Once access has lapsed, every tab funnels to Subscriptions.
    const effectiveTab = hasAccess ? activeTab : 'subscriptions';
    const goToSubscriptions = () => setActiveTab('subscriptions');

    const SidebarContent = ({ onNavClick }) => (
        <>
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-black text-xs bg-gradient-to-br from-indigo-500 to-violet-500">
                        {(child?.name?.[0] || '?')}{(child?.surname?.[0] || '')}
                    </div>
                    <div className="overflow-hidden">
                        <p className="text-xs font-black text-slate-800 dark:text-white truncate">
                            {child ? `${child.name} ${child.surname}` : 'Select a child'}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                            {child?.grade ? `Grade ${child.grade} · ` : ''}{child?.schoolName || ''}
                        </p>
                    </div>
                </div>

                {children.length > 1 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {children.map((c) => (
                            <button key={c.studentUid}
                                onClick={() => { setSelectedChildUid(c.studentUid); setInsight(null); }}
                                className={`px-2.5 py-1 rounded-lg text-[9px] font-black transition-colors ${c.studentUid === selectedChildUid
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                                {c.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                {tabs.map((t) => {
                    const Icon = t.icon;
                    const isActive = effectiveTab === t.id;
                    const locked = !hasAccess && t.id !== 'subscriptions';
                    return (
                        <button key={t.id}
                            onClick={() => {
                                if (locked) { goToSubscriptions(); onNavClick?.(); return; }
                                setActiveTab(t.id);
                                onNavClick?.();
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-black transition-all ${isActive
                                ? 'text-white bg-indigo-600'
                                : locked
                                    ? 'text-slate-300 dark:text-slate-600'
                                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                            <Icon size={16} className="flex-shrink-0" />
                            <span className="flex-1 text-left">{t.label}</span>
                            {locked && <Lock size={11} className="text-slate-300 dark:text-slate-600" />}
                        </button>
                    );
                })}
            </nav>

            <div className="p-3 border-t border-slate-100 dark:border-slate-800 space-y-1">
                <button onClick={() => setIsDark((d) => !d)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-black text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                    {isDark ? <Sun size={15} /> : <Moon size={15} />}
                    {isDark ? 'Light mode' : 'Dark mode'}
                </button>
                <button onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-black text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20">
                    <LogOut size={15} /> Sign out
                </button>
            </div>
        </>
    );

    return (
        <div className={`min-h-screen flex ${isDark ? 'dark bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`}>
            <aside className="hidden md:flex w-64 flex-shrink-0 bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 flex-col">
                <SidebarContent />
            </aside>

            {mobileDrawerOpen && (
                <div className="fixed inset-0 z-40 md:hidden">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setMobileDrawerOpen(false)} />
                    <div className="absolute left-0 top-0 bottom-0 w-72 bg-white dark:bg-slate-900 flex flex-col">
                        <button onClick={() => setMobileDrawerOpen(false)} className="absolute top-3 right-3 text-slate-400">
                            <X size={18} />
                        </button>
                        <SidebarContent onNavClick={() => setMobileDrawerOpen(false)} />
                    </div>
                </div>
            )}

            <div className="flex-1 flex flex-col min-w-0">
                <header className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
                    <button onClick={() => setMobileDrawerOpen(true)} className="md:hidden text-slate-400">
                        <Menu size={20} />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-sm font-black text-slate-800 dark:text-white truncate">Parent Dashboard</h1>
                        <p className="text-[9px] text-slate-400 hidden sm:block">
                            {new Date().toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                    </div>
                </header>

                <div className="flex-1 p-4 md:p-6 overflow-y-auto space-y-4 md:space-y-6">
                    {!child ? (
                        <AccessGate access={{ state: 'no_link' }} primary={primary} onGoToSubscriptions={goToSubscriptions} />
                    ) : !hasAccess ? (
                        <AccessGate access={access} primary={primary} onGoToSubscriptions={goToSubscriptions} />
                    ) : (
                        <>
                            <TrialBanner access={access} onGoToSubscriptions={goToSubscriptions} />

                            {effectiveTab === 'overview' && (
                                <OverviewTab
                                    child={child}
                                    subjectStats={subjectStats}
                                    insight={insight}
                                    insightLoading={insightLoading}
                                    onRefreshInsight={() => loadInsight(true)}
                                    primary={primary}
                                />
                            )}
                            {effectiveTab === 'subjects' && (
                                <SubjectsTab subjectStats={subjectStats} insight={insight} />
                            )}
                            {effectiveTab === 'exams' && (
                                <ExamsTab attempts={attemptsWithTitles} subjectStats={subjectStats} />
                            )}
                            {effectiveTab === 'settings' && (
                                <SettingsTab parentUid={parentUid} profile={parent} />
                            )}
                        </>
                    )}

                    {/* Subscriptions renders regardless of access state — it's the one
                        tab a locked-out parent must always be able to reach. */}
                    {effectiveTab === 'subscriptions' && (
                        <SubscriptionsTab access={access} onSubscribe={handleSubscribe} primary={primary} />
                    )}
                </div>

                <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center">
                    {tabs.map((t) => {
                        const Icon = t.icon;
                        const isActive = effectiveTab === t.id;
                        const locked = !hasAccess && t.id !== 'subscriptions';
                        return (
                            <button key={t.id}
                                onClick={() => (locked ? goToSubscriptions() : setActiveTab(t.id))}
                                className="flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[9px] font-black"
                                style={isActive ? { color: primary } : { color: '#94a3b8' }}>
                                <div className="relative">
                                    <Icon size={18} />
                                    {locked && (
                                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center">
                                            <Lock size={6} className="text-slate-400" />
                                        </span>
                                    )}
                                </div>
                                <span>{t.label}</span>
                            </button>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}
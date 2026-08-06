// ─── PrincipalDashboard.jsx ──────────────────────────────────────────────────
// ✦ Mobile-first responsive layout
// ✦ Bottom tab bar on mobile, collapsible sidebar on desktop
// ✦ Full limit enforcement: 80% warning (amber) + 100% block (red) on all resources
// ✦ LimitGate blocks add actions when at limit
// ✦ Teachers tab now has limit enforcement
// ✦ SubscriptionManager receives usage + school props

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, db } from '../utils/firebase';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, orderBy, collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { createPortal } from 'react-dom';
import { useUser } from '../contexts/UserContext';
import { useActiveTier } from '../utils/firestoreHelpers';

import {
    Users, BookOpen, FileText, TrendingUp, Award, AlertTriangle,
    ChevronDown, ChevronRight, Filter, Download, Printer, LogOut,
    Search, X, Eye, BarChart2, CheckCircle2, Clock, RefreshCw,
    School, Settings, Moon, Sun, Menu, Zap, Lock, ArrowUpRight,
    Sparkles, Crown, Star, CreditCard, ChevronLeft, Shield, GraduationCap
} from 'lucide-react';
import PaymentManager from './PaymentManager';
import SubscriptionManager from './SubscriptionManager';
import { subscribeToSchoolTeachers, subscribeToSchoolStudents, subscribeToSchoolExams, subscribeToSchoolAttempts, subscribeToAuditLog, countByGrade, averageScore, groupBySubject, passRate } from '../utils/firestoreHelpers';
import { useCurrentSubscription } from '../utils/tierConfig';
import { useSchool } from '../utils/schoolContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ActivityFeed } from './ActivityFeed';
import TeachersTab from './TeachersTab';
import ExportShareMenu from '../utils/ExportShareMenu';
import {
    getSchoolExamLimit,
    FREE_STUDENT_BASE,
    FREE_TEACHER_BASE,
    FREE_TIER_MONTHLY_LIMIT
} from '../utils/tierConfig';





// ─── GRADE ORDER ──────────────────────────────────────────────────────────────
// 1. Defensively find the school object under any typical naming pattern
const activeSchoolInstance =
    typeof school !== 'undefined' ? school :
        typeof schoolData !== 'undefined' ? schoolData :
            typeof currentSchool !== 'undefined' ? currentSchool : null;

// 2. Safely resolve the active curriculum string name
const currentCurriculum =
    typeof schoolCurricula !== 'undefined' && schoolCurricula?.[0] ? schoolCurricula[0] :
        activeSchoolInstance?.curriculum ? activeSchoolInstance.curriculum : 'Dynamic';

// 3. Locate the student grade tallies defensively without reading undeclared parents
const activeGradeCounts =
    typeof gradeCounts !== 'undefined' ? gradeCounts :
        typeof stats !== 'undefined' && stats?.gradeCounts ? stats.gradeCounts :
            typeof metrics !== 'undefined' && metrics?.gradeCounts ? metrics.gradeCounts :
                activeSchoolInstance?.gradeCounts ? activeSchoolInstance.gradeCounts : {};

// 4. Extract the active grade text keys and sort them naturally
const dynamicGradeOrder = Object.keys(activeGradeCounts).sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
    return numA - numB;
});

// Alias the old variable name to the new dynamic order so legacy components don't crash
const GRADE_ORDER = dynamicGradeOrder;


// ─── LIMIT STATUS HOOK ────────────────────────────────────────────────────────
// Single source of truth for all dynamic limit checks (base + add-on capacity
export function useLimitStatus(seats = {}, examLimit = null, usage = {}) {
    return useMemo(() => {
        // 1. Align default seat allocations with tierLimits constants
        const defaultStudents = FREE_STUDENT_BASE || 10;
        const defaultTeachers = FREE_TEACHER_BASE || 2;

        const resolvedSeats = {
            students: seats?.students ?? defaultStudents,
            teachers: seats?.teachers ?? defaultTeachers,
        };

        // 2. Resolve exam limit: use provided examLimit or compute dynamically from seats
        const resolvedExamLimit = examLimit ?? getSchoolExamLimit(resolvedSeats) ?? (FREE_TIER_MONTHLY_LIMIT || 5);

        const computedLimits = {
            students: resolvedSeats.students,
            teachers: resolvedSeats.teachers,
            exams: resolvedExamLimit,
        };

        const check = (key) => {
            const max = computedLimits[key] ?? null;
            const used = usage[key] ?? 0;

            if (max === null) {
                return { used, max: null, pct: 0, status: 'ok', blocked: false, warning: false };
            }

            // Protect against zero division (if seats are explicitly 0)
            const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : (used > 0 ? 100 : 0);
            const blocked = used >= max;
            const warning = !blocked && pct >= 80;
            const status = blocked ? 'crit' : warning ? 'warn' : 'ok';

            return { used, max, pct, status, blocked, warning };
        };

        const students = check('students');
        const exams = check('exams');
        const teachers = check('teachers');

        const anyBlocked = students.blocked || exams.blocked || teachers.blocked;
        const anyWarning = students.warning || exams.warning || teachers.warning;

        return {
            students,
            exams,
            teachers,
            anyBlocked,
            anyWarning,
            limits: computedLimits
        };
    }, [
        seats?.students,
        seats?.teachers,
        examLimit,
        usage?.students,
        usage?.exams,
        usage?.teachers
    ]);
}

// ─── LIMIT ALERT BANNER ───────────────────────────────────────────────────────
export function LimitAlertBanner({ resource, label, info, onUpgrade }) {
    const [dismissed, setDismissed] = useState(false);

    if (!info || info.status === 'ok') return null;
    if (dismissed && info.status === 'warn') return null;

    const isCrit = info.status === 'crit';
    const isExam = resource === 'exams';

    // Wording helper for exams vs seats
    const formatMessage = () => {
        const noun = label ? label.toLowerCase() : (isExam ? 'monthly exam uploads' : 'seats');

        if (isCrit) {
            return isExam
                ? `You've reached your monthly upload limit of ${info.max} papers. Add student seats to expand your upload quota.`
                : `You've reached your limit of ${info.max} ${noun}. Add more seats to continue registering user accounts.`;
        }

        return isExam
            ? `${info.used} of ${info.max} monthly exam uploads used (${info.pct}%). Consider expanding your quota.`
            : `${info.used} of ${info.max} ${noun} allocated (${info.pct}%). Consider expanding your seat quota.`;
    };

    const buttonLabel = isExam ? 'Expand Quota' : 'Add Seats / Upgrade';

    return (
        <div className={`flex items-start gap-3 p-3.5 rounded-2xl border text-xs ${isCrit
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-slate-800 dark:text-red-200'
                : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 text-slate-800 dark:text-amber-200'
            }`}>
            {isCrit ? (
                <Lock size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
            ) : (
                <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
            )}

            <div className="flex-1 min-w-0">
                <p className="font-medium">
                    {formatMessage()}
                </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
                <button
                    onClick={onUpgrade}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-black text-white transition-opacity hover:opacity-90 ${isCrit ? 'bg-red-500' : 'bg-amber-500'
                        }`}
                >
                    <ArrowUpRight size={10} /> {buttonLabel}
                </button>
                {!isCrit && (
                    <button onClick={() => setDismissed(true)} className="text-amber-400 hover:text-amber-600">
                        <X size={13} />
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── LIMIT GATE ───────────────────────────────────────────────────────────────
export function LimitGate({ blocked, resource = 'seats', onUpgrade, children }) {
    if (!blocked) return <>{children}</>;

    const isExam = resource === 'exams';

    // Tailored messaging for user seats vs. exam paper limits
    const title = isExam
        ? 'Monthly exam upload limit reached'
        : `${resource.charAt(0).toUpperCase() + resource.slice(1)} seat limit reached`;

    const description = isExam
        ? 'Increase your purchased student seats or upgrade your subscription plan to boost your monthly upload quota.'
        : 'Add extra teacher or student seats to your plan to continue registering users.';

    const buttonLabel = isExam ? 'Expand Upload Quota' : 'Manage Seats & Plan';

    return (
        <div className="relative rounded-2xl border-2 border-dashed border-red-200 dark:border-red-800 bg-red-50/80 dark:bg-red-900/10 p-6 flex flex-col items-center gap-3 text-center transition-all">
            <div className="w-11 h-11 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shadow-sm">
                <Lock size={20} className="text-red-500" />
            </div>

            <div className="max-w-xs">
                <p className="text-sm font-black text-red-700 dark:text-red-300">
                    {title}
                </p>
                <p className="text-xs text-red-500 dark:text-red-400 mt-1 leading-relaxed">
                    {description}
                </p>
            </div>

            <button
                onClick={onUpgrade}
                className="mt-1 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white bg-red-500 hover:bg-red-600 active:scale-95 transition-all shadow-sm"
            >
                <ArrowUpRight size={12} /> {buttonLabel}
            </button>
        </div>
    );
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
export function ScoreBadge({ score }) {
    if (score == null) return <span className="text-slate-400 text-xs">—</span>;
    const color = score >= 70 ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40' :
        score >= 50 ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' :
            score >= 40 ? 'text-orange-600 bg-orange-50 dark:bg-orange-950/40' :
                'text-red-600 bg-red-50 dark:bg-red-950/40';
    return (
        <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${color}`}>{score}%</span>
    );
}

export function StatCard({ label, value, sub, icon: Icon, color = 'indigo' }) {
    const palette = {
        indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400',
        emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
        amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
        rose: 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400',
    };
    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${palette[color]}`}>
                <Icon size={18} />
            </div>
            <div className="min-w-0">
                <p className="text-xl font-black text-slate-800 dark:text-white leading-none">{value ?? '—'}</p>
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
                {sub && <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}

export function UsageMeter({ label, used = 0, limit, color = '#4f46e5' }) {
    // 1. Handle unlimited resources (limit explicitly set to null/undefined)
    if (limit == null) {
        return (
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{label}</span>
                    <span className="text-[10px] font-black text-emerald-500">∞ Unlimited</span>
                </div>
                <div className="h-1.5 w-full bg-emerald-100 dark:bg-emerald-900/30 rounded-full overflow-hidden">
                    <div className="h-full w-1/4 rounded-full bg-emerald-300 dark:bg-emerald-600 animate-pulse" />
                </div>
            </div>
        );
    }

    // 2. Safe percentage calculation (guards against limit === 0)
    const safeLimit = Math.max(0, limit);
    const safeUsed = Math.max(0, used);

    const pct = safeLimit > 0
        ? Math.min(100, Math.round((safeUsed / safeLimit) * 100))
        : (safeUsed > 0 ? 100 : 0);

    const isNear = pct >= 80 && pct < 100;
    const isFull = pct >= 100 || (safeLimit === 0 && safeUsed > 0);
    const barColor = isFull ? '#ef4444' : isNear ? '#f59e0b' : color;

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{label}</span>
                <div className="flex items-center gap-1.5">
                    {isFull && <Lock size={9} className="text-red-500" />}
                    {isNear && <AlertTriangle size={9} className="text-amber-500" />}
                    <span className={`text-[10px] font-black ${isFull ? 'text-red-500' : isNear ? 'text-amber-500' : 'text-slate-400'
                        }`}>
                        {safeUsed}/{safeLimit}
                    </span>
                </div>
            </div>
            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: barColor }}
                />
            </div>
        </div>
    );
}


export function TierBadge({ tierId, isFreeBaseline, collapsed }) {
    // Resolve free baseline state based on tierId or boolean prop
    const isFree = isFreeBaseline ?? (tierId === 'free' || tierId === 'free_tier');

    const Icon = isFree ? Sparkles : Crown;
    const label = isFree ? 'Free Baseline' : 'Custom Plan';
    const gradient = isFree
        ? 'from-slate-400 to-slate-500 shadow-slate-500/10'
        : 'from-indigo-500 to-indigo-600 shadow-indigo-500/10';

    if (collapsed) {
        return (
            <div
                title={label}
                className={`w-8 h-8 rounded-xl flex items-center justify-center bg-gradient-to-br ${gradient} shadow-sm mx-auto transition-transform hover:scale-105`}
            >
                <Icon size={14} className="text-white" />
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700/60 border border-slate-200/50 dark:border-slate-600/50">
            <div className={`w-5 h-5 rounded-lg flex items-center justify-center bg-gradient-to-br ${gradient} flex-shrink-0 shadow-sm`}>
                <Icon size={10} className="text-white" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 truncate">
                {label}
            </span>
        </div>
    );
}

export function UpgradeBanner({ isFreeBaseline, onUpgrade, onDismiss }) {
    if (!isFreeBaseline) return null;
    const message = "You're on the Free Baseline plan (up to 10 students, 2 teachers). Add seats anytime as your school grows.";

    return (
        <div className="relative bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl p-4 flex items-center gap-3 overflow-hidden print:hidden">
            <div className="absolute inset-0 opacity-10">
                <div className="absolute -top-4 -right-4 w-32 h-32 rounded-full bg-white" />
                <div className="absolute -bottom-8 right-20 w-24 h-24 rounded-full bg-white" />
            </div>
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Zap size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black text-white leading-snug">{message}</p>
            </div>
            <button onClick={onUpgrade} className="flex-shrink-0 flex items-center gap-1 bg-white text-indigo-700 text-[10px] font-black px-3 py-2 rounded-xl hover:bg-indigo-50 transition-colors">
                Manage Seats <ArrowUpRight size={11} />
            </button>
            {onDismiss && (
                <button onClick={onDismiss} className="flex-shrink-0 text-white/60 hover:text-white">
                    <X size={14} />
                </button>
            )}
        </div>
    );
}



const FEATURE_VISUAL = {
    parentPortal: {
        label: 'Parent Portal Add-on',
        gradient: 'from-amber-500 to-rose-500',
    },
    custom: {
        label: 'Custom Plan',
        gradient: 'from-indigo-500 to-purple-600',
    },
    enterprise: {
        label: 'Enterprise Allocation',
        gradient: 'from-violet-600 to-indigo-600',
    },
    free: {
        label: 'Standard Plan',
        gradient: 'from-slate-500 to-slate-700',
    }
};

export function LockedFeature({ featureName, requiredTier = 'custom', requiredAddon = null, onUpgrade }) {
    // Determine key visual config based on add-on or tier requirement
    const key = requiredAddon || requiredTier;
    const vis = FEATURE_VISUAL[key] || {
        label: String(key).toUpperCase(),
        gradient: 'from-indigo-500 to-purple-600'
    };

    const isAddon = Boolean(requiredAddon);
    const unlockText = isAddon ? `Add ${vis.label}` : `Upgrade to ${vis.label}`;

    return (
        <div className="relative bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-10 text-center overflow-hidden shadow-xs">
            {/* Ambient Backdrop Blur */}
            <div className="absolute inset-0 bg-slate-50/70 dark:bg-slate-900/70 backdrop-blur-[2px] rounded-2xl" />

            <div className="relative z-10 flex flex-col items-center gap-3 max-w-sm mx-auto">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center shadow-xs">
                    <Lock size={20} className="text-slate-400 dark:text-slate-300" />
                </div>

                <p className="text-sm font-black text-slate-800 dark:text-slate-100">
                    {featureName}
                </p>

                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Available with the{' '}
                    <span className={`font-black bg-gradient-to-r ${vis.gradient} bg-clip-text text-transparent`}>
                        {vis.label}
                    </span>
                    {isAddon ? ' enabled on your subscription.' : ' and above.'}
                </p>

                <button
                    onClick={onUpgrade}
                    className="mt-1 flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-xs font-black bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-95 active:scale-95 transition-all shadow-md shadow-indigo-500/20"
                >
                    <Zap size={13} /> {unlockText}
                </button>
            </div>
        </div>
    );
}

// ─── MOBILE DRAWER OVERLAY ────────────────────────────────────────────────────
function MobileDrawer({ open, onClose, children }) {
    if (!open) return null;
    return (
        <>
            <div
                className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm md:hidden"
                onClick={onClose}
            />
            <div className="fixed left-0 top-0 bottom-0 z-50 w-72 bg-white dark:bg-slate-900 shadow-2xl flex flex-col md:hidden transition-transform">
                {children}
            </div>
        </>
    );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function PrincipalDashboard({ principal }) {
    // ─── 1. CONTEXT & ROUTER ──────────────────────────────────────────────
    const navigate = useNavigate();
    const { school } = useSchool();
    const { user, userRole, loading } = useUser();
    const primary = school?.primary || '#4f46e5';
    const printRef = useRef();

    // ─── 2. ALL STATE ─────────────────────────────────────────────────────
    // Data
    const [teachers, setTeachers] = useState([]);
    const [students, setStudents] = useState([]);
    const [exams, setExams] = useState([]);
    const [attempts, setAttempts] = useState([]);
    const [auditLog, setAuditLog] = useState([]);
    const [selectedSchoolDoc, setSelectedSchoolDoc] = useState(null);
    const [teacherReviews, setTeacherReviews] = useState({});
    const [authToken, setAuthToken] = useState(null);

    // UI
    const [activeTab, setActiveTab] = useState('overview');
    const [isDark, setIsDark] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [bannerDismissed, setBannerDismissed] = useState(false);

    // Collapsible sections
    const [gradeOpen, setGradeOpen] = useState(true);
    const [subjectOpen, setSubjectOpen] = useState(true);
    const [activityOpen, setActivityOpen] = useState(true);

    // Filters
    const [filterGrade, setFilterGrade] = useState('All');
    const [filterSubject, setFilterSubject] = useState('All');
    const [filterExam, setFilterExam] = useState('All');
    const [search, setSearch] = useState('');

    // Drill-down
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [selectedExam, setSelectedExam] = useState(null);

    // ─── 3. SCHOOL ID — needs selectedSchoolDoc + school ───────────────────
    const schoolId = useMemo(() => {
        const id =
            principal?.schoolId ||
            selectedSchoolDoc?.id ||
            school?.id ||
            null;

        if (!id) {
            console.warn('[PrincipalDashboard] No schoolId resolved.', {
                principalSchoolId: principal?.schoolId,
                selectedSchoolDoc: selectedSchoolDoc?.id,
                contextSchool: school?.id,
            });
        } else if (school?.id && id !== school.id) {
            console.warn('[PrincipalDashboard] schoolId mismatch:', id, 'vs context', school.id);
        }

        return id;
    }, [principal?.schoolId, selectedSchoolDoc?.id, school?.id]);

    const { tier: activeTier, loading: isTierLoading } = useActiveTier(schoolId);

    // ── Derived ───────────────────────────────────────────────────────────────

    const schoolAttempts = attempts;   // already scoped by the query

    const avgScore = useMemo(() => averageScore(schoolAttempts), [schoolAttempts]);
    const overallPassRate = useMemo(() => passRate(schoolAttempts), [schoolAttempts]);
    const subjectGroups = useMemo(() => groupBySubject(schoolAttempts), [schoolAttempts]);
    const gradeCounts = useMemo(() => countByGrade(students), [students]);

    const allSubjects = useMemo(
        () => [...new Set(students.flatMap(s => s.subjects || []))].sort(),
        [students]
    );

    // Index attempts by student once, instead of scanning the full array per row.
    const attemptsByStudent = useMemo(() => {
        const map = new Map();
        for (const a of schoolAttempts) {
            for (const key of [a.studentUid, a.studentId]) {
                if (!key) continue;
                if (!map.has(key)) map.set(key, []);
                if (!map.get(key).includes(a)) map.get(key).push(a);
            }
        }
        return map;
    }, [schoolAttempts]);

    const studentAttempts = useCallback(
        (uid) => attemptsByStudent.get(uid) || [],
        [attemptsByStudent]
    );

    const examAttempts = useCallback((exam) => {
        const examObj = typeof exam === 'string' ? { id: exam } : exam;
        const id = examObj?.id;
        const customId = examObj?.examId;   // the field set during upload

        return schoolAttempts.filter(a => {
            // Never match undefined === undefined — always require a real value
            if (!a.examId && !a.sourceUploadId && !a.exam_id) return false;

            return (
                (a.examId && (a.examId === id || a.examId === customId)) ||
                (a.sourceUploadId && (a.sourceUploadId === id || a.sourceUploadId === customId)) ||
                (a.exam_id && (a.exam_id === id || a.exam_id === customId))
            );
        });
    }, [schoolAttempts]);

    const filteredStudents = useMemo(() => students.filter(s => {
        const matchGrade = filterGrade === 'All' || s.grade === filterGrade;
        const matchSubject = filterSubject === 'All' || (s.subjects || []).includes(filterSubject);
        const matchSearch = !search ||
            `${s.name} ${s.surname}`.toLowerCase().includes(search.toLowerCase()) ||
            s.email?.toLowerCase().includes(search.toLowerCase());
        return matchGrade && matchSubject && matchSearch;
    }), [students, filterGrade, filterSubject, search]);


    // ─── 4. USAGE — needs the data arrays ─────────────────────────────────
    const usage = useMemo(() => ({
        students: students.length,
        exams: exams.length,
        teachers: teachers.length,
    }), [students.length, exams.length, teachers.length]);

    // ─── 5. TIER — needs schoolId, then usage ─────────────────────────────
    const { seats, examLimit, isFreeBaseline, loading: subLoading } = useCurrentSubscription(schoolId);
    const limits = useLimitStatus(seats, examLimit, usage);

    // -------------------------------------------------------------
    // 1. DYNAMIC SUBSCRIPTION LISTENER (Handles all live collections safely)
    // -------------------------------------------------------------
    useEffect(() => {
        if (!schoolId) return;

        const state = { unsubs: [], active: true };

        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            if (!state.active) return;

            // If user logs out or session is initializing, reset states
            if (!user) {
                setAttempts([]);
                setTeachers([]);
                setStudents([]);
                setExams([]);
                setAuditLog([]);
                return;
            }

            // Clean up existing subscriptions before setting new ones
            state.unsubs.forEach(u => typeof u === 'function' && u());

            const attemptsQuery = query(
                collection(db, 'exam_attempts'),
                where('schoolId', '==', schoolId)
            );

            state.unsubs = [
                onSnapshot(
                    attemptsQuery,
                    (snap) => {
                        if (!state.active) return;
                        setAttempts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                    },
                    (err) => console.error('[attempts listener]', err)
                ),
                subscribeToSchoolTeachers(schoolId, setTeachers),
                subscribeToSchoolStudents(schoolId, setStudents),
                subscribeToSchoolExams(schoolId, setExams),
                subscribeToAuditLog(schoolId, setAuditLog), // Single source of truth for Audit Log
            ];
        });

        return () => {
            state.active = false;
            unsubscribeAuth();
            state.unsubs.forEach(u => typeof u === 'function' && u());
        };
    }, [schoolId]);

    // -------------------------------------------------------------
    // 2. TEACHER REVIEWS LISTENER (Guarded with Auth Check)
    // -------------------------------------------------------------
    useEffect(() => {
        if (!school?.id || !auth.currentUser) return;

        const q = query(collection(db, 'teacherReviews'), where('schoolId', '==', school.id));
        const unsub = onSnapshot(
            q,
            snap => {
                const map = {};
                snap.forEach(d => {
                    const r = d.data();
                    map[`${r.teacherId}::${r.subject}`] = { rating: r.rating, notes: r.notes };
                });
                setTeacherReviews(map);
            },
            err => console.error('teacherReviews listener:', err)
        );

        return () => unsub();
    }, [school?.id]);

    const handleSaveAssessment = async (teacherId, subject, draft) => {
        const user = auth.currentUser;
        if (!user) throw new Error("Not authenticated");

        // Construct the document ID deterministically
        const reviewId = `${teacherId}_${subject.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const reviewRef = doc(db, 'teacherReviews', reviewId);

        const reviewPayload = {
            schoolId: schoolId,                   // string - must match principal's school
            teacherId: String(teacherId),          // string
            subject: String(subject),              // string
            rating: Number(draft.rating || 0),     // number (0 to 5)
            notes: String(draft.notes || '').slice(0, 2000), // string (<= 2000 chars)
            reviewedBy: user.uid,                  // string (must match request.auth.uid)
            updatedAt: serverTimestamp()           // timestamp
        };

        // Make sure no undefined or extra keys exist
        await setDoc(reviewRef, reviewPayload, { merge: true });
    };



    useEffect(() => {
        const auth = getAuth();
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (user) {
                const token = await user.getIdToken();
                setAuthToken(token);
            } else {
                setAuthToken(null);
            }
        });
        return () => unsub();
    }, []);

    // -------------------------------------------------------------
    // 3. FETCH SCHOOL DETAILS (Guarded against null/unauthenticated user)
    // -------------------------------------------------------------
    useEffect(() => {
        const fetchSchool = async () => {
            if (!user || !auth.currentUser) return;

            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                const schoolId = userDoc.data()?.schoolId;

                if (schoolId) {
                    const schoolDoc = await getDoc(doc(db, 'schools', schoolId));
                    if (schoolDoc.exists()) {
                        setSelectedSchoolDoc({ id: schoolId, ...schoolDoc.data() });
                    }
                }
            } catch (error) {
                console.error('fetchSchool error:', error);
            }
        };

        fetchSchool();
    }, [user]);

    const handleUpgrade = useCallback(() => setShowUpgradeModal(true), []);

    const buildPdf = useCallback(() => {
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        pdf.setFontSize(18);
        pdf.setTextColor(40, 40, 40);
        pdf.text(school?.name || 'School Report', 20, 20);
        pdf.setFontSize(10);
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Generated: ${new Date().toLocaleDateString('en-ZA')}`, 20, 27);
        pdf.text(`Principal: ${principal?.title || ''} ${principal?.name || ''} ${principal?.surname || ''}`, 20, 33);
        pdf.text(`Plan: ${TIER_VISUAL[activeTier]?.label || activeTier}`, 20, 39);

        let y = 48;
        autoTable(pdf, {
            startY: y,
            head: [['Metric', 'Value']],
            body: [
                ['Total Teachers', teachers.length],
                ['Total Students', students.length],
                ['Exams Uploaded', exams.length],
                ['Avg Score', avgScore != null ? `${avgScore}%` : '—'],
                ['Pass Rate', `${overallPassRate}%`],
            ],
            styles: { fontSize: 9 },
            headStyles: { fillColor: [79, 70, 229] },
        });
        y = pdf.lastAutoTable.finalY + 10;

        autoTable(pdf, {
            startY: y,
            head: [['Name', 'Surname', 'Grade', 'Subjects', 'Avg Score']],
            body: filteredStudents.map(s => {
                const atts = studentAttempts(s.uid);
                return [s.name, s.surname, s.grade,
                (s.subjects || []).slice(0, 3).join(', '),
                averageScore(atts) != null ? `${averageScore(atts)}%` : '—'];
            }),
            styles: { fontSize: 8 },
            headStyles: { fillColor: [79, 70, 229] },
        });
        return pdf;
    }, [school, principal, teachers, students, exams, attempts, filteredStudents, avgScore, overallPassRate, activeTier]);

    const summaryText = useMemo(() => (
        `${school?.name || 'School'} — Report ${new Date().toLocaleDateString('en-ZA')}\n` +
        `Teachers: ${teachers.length} · Students: ${students.length} · Exams: ${exams.length}\n` +
        `Average: ${avgScore != null ? avgScore + '%' : '—'} · Pass rate: ${overallPassRate}%`
    ), [school, teachers.length, students.length, exams.length, avgScore, overallPassRate]);

    const handlePrint = () => window.print();
    const handleSignOut = async () => { await signOut(auth); navigate('/'); };

    const emailReport = async (blob, name) => {
        const b64 = await new Promise(res => {
            const r = new FileReader();
            r.onload = () => res(r.result.split(',')[1]);
            r.readAsDataURL(blob);
        });
        const res = await fetch('/.netlify/functions/send-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: principal?.email, fileName: name, pdfBase64: b64, summary: summaryText }),
        });
        if (!res.ok) throw new Error('Failed to send report');
    };

    // ── TABS CONFIG ───────────────────────────────────────────────────────────
    const tabs = [
        { id: 'overview', label: 'Overview', icon: BarChart2 },
        { id: 'teachers', label: 'Teachers', icon: GraduationCap },
        { id: 'students', label: 'Students', icon: Users },
        { id: 'exams', label: 'Exams', icon: FileText },
        { id: 'audit', label: 'Audit Log', icon: AlertTriangle },
        { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
        { id: 'settings', label: 'Settings', icon: Settings },
    ];

    const mobileBottomTabs = tabs.slice(0, 5);

    // ── SIDEBAR CONTENT ───────────────────────────────────────────────────────
    const SidebarContent = ({ onNavClick }) => (
        <>
            {/* School brand */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
                        style={{ backgroundColor: primary + '20' }}
                    >
                        {school?.logoUrl
                            ? <img src={school.logoUrl} alt="logo" className="w-8 h-8 object-contain" />
                            : <School size={20} style={{ color: primary }} />
                        }
                    </div>
                    {(sidebarOpen || onNavClick) && (
                        <div className="overflow-hidden">
                            <p className="text-xs font-black text-slate-800 dark:text-white truncate">{school?.name || 'School'}</p>
                            <p className="text-[10px] text-slate-400 truncate">{principal?.title} {principal?.surname}</p>
                        </div>
                    )}
                </div>
                <div className={`mt-3 ${(sidebarOpen || onNavClick) ? '' : 'flex justify-center'}`}>
                    <TierBadge tier={activeTier} collapsed={!sidebarOpen && !onNavClick} />
                </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto text-black">
                {tabs.map(t => {
                    const Icon = t.icon;
                    const isActive = activeTab === t.id;
                    // Show a red dot on Students/Exams/Teachers nav items when blocked
                    const hasAlert =
                        (t.id === 'students' && (limits.students.blocked || limits.students.warning)) ||
                        (t.id === 'exams' && (limits.exams.blocked || limits.exams.warning));
                    const isBlockedAlert =
                        (t.id === 'students' && limits.students.blocked) ||
                        (t.id === 'exams' && limits.exams.blocked);

                    return (
                        <button
                            key={t.id}
                            onClick={() => {
                                if (t.locked) { handleUpgrade(); return; }
                                setActiveTab(t.id);
                                onNavClick?.();
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-black transition-all ${isActive
                                ? 'text-white'
                                : t.locked
                                    ? 'text-slate-300 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                            style={isActive ? { backgroundColor: primary } : {}}
                        >
                            <div className="relative flex-shrink-0">
                                <Icon size={16} />
                                {/* Alert dot on nav icon */}
                                {hasAlert && !isActive && (
                                    <div className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${isBlockedAlert ? 'bg-red-500' : 'bg-amber-400'}`} />
                                )}
                            </div>
                            {(sidebarOpen || onNavClick) && (
                                <span className="flex-1 text-left">{t.label}</span>
                            )}
                            {(sidebarOpen || onNavClick) && t.locked && (
                                <Lock size={11} className="text-slate-300 dark:text-slate-600" />
                            )}
                            {t.id === 'subscriptions' && !isActive && (sidebarOpen || onNavClick) && (
                                <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400 uppercase">
                                    New
                                </span>
                            )}
                        </button>
                    );
                })}
            </nav>

            {/* Usage meters */}
            {(sidebarOpen || onNavClick) && (
                <div className="px-3 pb-2 space-y-3 flex-shrink-0">
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-2.5">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Usage</p>

                        {/* Using activeTier here ensures accurate limit calculation */}
                        <UsageMeter
                            label="Students"
                            used={students.length}
                            limit={limits.students?.max ?? null}
                            color={primary}
                        />
                        <UsageMeter
                            label="Exams"
                            used={exams.length}
                            limit={limits.exams?.max ?? null}
                            color={primary}
                        />
                        <UsageMeter
                            label="Teachers"
                            used={teachers.length}
                            limit={limits.teachers?.max ?? null}
                            color={primary}
                        />
                    </div>

                    {activeTier && activeTier !== 'enterprise' && (
                        <button
                            onClick={handleUpgrade}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-black text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 transition-opacity"
                        >
                            <Zap size={11} /> Upgrade Plan
                        </button>
                    )}
                </div>
            )}

            {/* Bottom actions */}
            <div className="p-3 border-t border-slate-100 dark:border-slate-800 space-y-1 flex-shrink-0">
                <button
                    onClick={() => setIsDark(d => !d)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-black text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                    {isDark ? <Sun size={15} /> : <Moon size={15} />}
                    {(sidebarOpen || onNavClick) && (isDark ? 'Light Mode' : 'Dark Mode')}
                </button>
                <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-black text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                >
                    <LogOut size={15} />
                    {(sidebarOpen || onNavClick) && 'Sign Out'}
                </button>
            </div>
        </>
    );

    return (
        <div className={`min-h-screen flex ${isDark ? 'dark bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`}>

            {/* ── DESKTOP SIDEBAR ── */}
            <aside
                className={`hidden md:flex ${sidebarOpen ? 'w-64' : 'w-20'} flex-shrink-0 bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 flex-col transition-all duration-300 print:hidden`}
            >
                <SidebarContent />
            </aside>

            {/* ── MOBILE DRAWER ── */}
            <MobileDrawer open={mobileDrawerOpen} onClose={() => setMobileDrawerOpen(false)}>
                <div className="flex flex-col h-full overflow-hidden">
                    <SidebarContent onNavClick={() => setMobileDrawerOpen(false)} />
                </div>
            </MobileDrawer>

            {/* ── MAIN CONTENT ── */}
            <div className="flex-1 flex flex-col min-w-0">

                {/* Top bar */}
                <header className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-4 py-3 flex items-center gap-3 print:hidden sticky top-0 z-30">
                    <button
                        onClick={() => {
                            if (window.innerWidth < 768) {
                                setMobileDrawerOpen(o => !o);
                            } else {
                                setSidebarOpen(o => !o);
                            }
                        }}
                        className="text-slate-400 hover:text-slate-600 flex-shrink-0"
                    >
                        <Menu size={20} />
                    </button>

                    <div className="flex-1 min-w-0">
                        <h1 className="text-sm font-black text-slate-800 dark:text-white truncate">Principal Dashboard</h1>
                        <p className="text-[9px] text-slate-400 hidden sm:block truncate">
                            {selectedSchoolDoc?.schoolName || selectedSchoolDoc?.name || 'My School'} · {new Date().toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}                        </p>
                    </div>

                    {/* Plan chip — turns red if any resource is blocked, amber if near limit, else shows plan state */}
                    <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[9px] font-black transition-colors ${limits.anyBlocked
                        ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                        : limits.anyWarning
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
                            : isFreeBaseline
                                ? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300'
                        }`}>
                        {limits.anyBlocked
                            ? <Lock size={10} />
                            : limits.anyWarning
                                ? <AlertTriangle size={10} />
                                : isFreeBaseline
                                    ? <Sparkles size={10} />
                                    : <Crown size={10} />}
                        {limits.anyBlocked
                            ? 'Limit reached'
                            : limits.anyWarning
                                ? 'Near limit'
                                : isFreeBaseline
                                    ? 'Free Baseline'
                                    : 'Custom Plan'}
                    </div>

                    {/* Export and share button for principal */}
                    <ExportShareMenu
                        buildPdf={buildPdf}
                        fileName={school?.name || 'report'}
                        summaryText={summaryText}
                        onEmailReport={emailReport}
                        primary={primary}
                    />
                </header>

                {/* Page content */}
                <div ref={printRef} className="flex-1 p-4 md:p-6 overflow-y-auto space-y-4 md:space-y-6 pb-24 md:pb-6">

                    {/* ── OVERVIEW TAB ── */}
                    {activeTab === 'overview' && (
                        <>
                            {!bannerDismissed && (
                                <UpgradeBanner
                                    isFreeBaseline={isFreeBaseline}
                                    onUpgrade={handleUpgrade}
                                    onDismiss={() => setBannerDismissed(true)}
                                />
                            )}

                            {/* Global limit alerts on overview */}
                            <LimitAlertBanner resource="students" label="Students" info={limits.students} onUpgrade={handleUpgrade} />
                            <LimitAlertBanner resource="exams" label="Exams" info={limits.exams} onUpgrade={handleUpgrade} />
                            <LimitAlertBanner resource="teachers" label="Teachers" info={limits.teachers} onUpgrade={handleUpgrade} />

                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                <StatCard label="Teachers" value={teachers.length} icon={Users} color="indigo" />
                                <StatCard label="Students" value={students.length} icon={Users} color="emerald" />
                                <StatCard label="Exams" value={exams.length} icon={FileText} color="amber" />
                                <StatCard label="Avg Score" value={avgScore != null ? `${avgScore}%` : '—'} icon={TrendingUp} color="rose" sub={`Pass: ${overallPassRate}%`} />

                            </div>


                            {/* For new users approval */}
                            <ActivityFeed
                                schoolId={selectedSchoolDoc?.schoolId || principal?.schoolId}
                                apiUrl={import.meta.env.VITE_API_URL}
                                authToken={authToken}
                            />


                            {/* Dynamic Grade Chart */}
                            <div className="bg-white dark:bg-slate-800 rounded-2xl border
                border-slate-100 dark:border-slate-700 overflow-hidden">

                                {/* Header — clickable to collapse */}
                                <button
                                    onClick={() => setGradeOpen(v => !v)}
                                    className="w-full flex justify-between items-center p-5
                   hover:bg-slate-50 dark:hover:bg-slate-700/50
                   transition-colors cursor-pointer"
                                >
                                    <h2 className="text-sm font-black text-slate-700 dark:text-white">
                                        Students per Grade
                                    </h2>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full
                             bg-slate-100 dark:bg-slate-700
                             text-slate-500 dark:text-slate-300">
                                            {currentCurriculum}
                                        </span>
                                        <svg
                                            className={`w-4 h-4 text-slate-400 transition-transform duration-200
                            ${gradeOpen ? '' : 'rotate-180'}`}
                                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round"
                                                strokeWidth={2} d="M5 15l7-7 7 7" />
                                        </svg>
                                    </div>
                                </button>

                                {/* Collapsible content */}
                                {gradeOpen && (
                                    <div className="px-5 pb-5 border-t border-slate-100 dark:border-slate-700">
                                        {dynamicGradeOrder.length === 0 ? (
                                            <div className="h-28 flex items-center justify-center
                                border border-dashed border-slate-200
                                dark:border-slate-700 rounded-xl mt-4">
                                                <p className="text-xs font-medium text-slate-400">
                                                    No student enrollment records found
                                                </p>
                                            </div>
                                        ) : (
                                            /* Scrollable bar chart — handles many grades gracefully */
                                            <div className="overflow-x-auto mt-4">
                                                <div
                                                    className="flex items-end gap-2 h-28 pt-4"
                                                    style={{
                                                        minWidth: `${dynamicGradeOrder.length * 48}px`
                                                    }}
                                                >
                                                    {dynamicGradeOrder.map(g => {
                                                        const count = activeGradeCounts[g] || 0;
                                                        const max = Math.max(
                                                            ...dynamicGradeOrder.map(gr => activeGradeCounts[gr] || 0),
                                                            1
                                                        );
                                                        const pct = (count / max) * 100;
                                                        const displayLabel = g
                                                            .replace('Grade ', 'Gr ')
                                                            .replace('Year ', 'Yr ')
                                                            .replace('Form ', 'Fm ');

                                                        return (
                                                            <div key={g}
                                                                className="flex flex-col items-center gap-1"
                                                                style={{ minWidth: 40 }}>
                                                                <span className="text-[10px] font-black
                                                     text-slate-600 dark:text-slate-300">
                                                                    {count}
                                                                </span>
                                                                <div
                                                                    className="w-full rounded-t-xl transition-all duration-700"
                                                                    style={{
                                                                        height: `${pct}%`,
                                                                        backgroundColor: primary || '#4f46e5',
                                                                        minHeight: count ? 6 : 0,
                                                                        width: 32,
                                                                    }}
                                                                />
                                                                <span className="text-[9px] text-slate-400
                                                     font-bold whitespace-nowrap">
                                                                    {displayLabel}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="bg-white dark:bg-slate-800 rounded-2xl border
                border-slate-100 dark:border-slate-700 overflow-hidden">

                                {/* Header — clickable to collapse */}
                                <button
                                    onClick={() => setSubjectOpen(v => !v)}
                                    className="w-full flex justify-between items-center p-5
                   hover:bg-slate-50 dark:hover:bg-slate-700/50
                   transition-colors cursor-pointer"
                                >
                                    <h2 className="text-sm font-black text-slate-700 dark:text-white">
                                        Performance by Subject
                                    </h2>
                                    <div className="flex items-center gap-2">
                                        {Object.keys(subjectGroups).length > 0 && (
                                            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full
                                 bg-slate-100 dark:bg-slate-700
                                 text-slate-500 dark:text-slate-300">
                                                {Object.keys(subjectGroups).length} subjects
                                            </span>
                                        )}
                                        <svg
                                            className={`w-4 h-4 text-slate-400 transition-transform duration-200
                            ${subjectOpen ? '' : 'rotate-180'}`}
                                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round"
                                                strokeWidth={2} d="M5 15l7-7 7 7" />
                                        </svg>
                                    </div>
                                </button>

                                {/* Collapsible + scrollable content */}
                                {subjectOpen && (
                                    <div className="border-t border-slate-100 dark:border-slate-700">
                                        {Object.keys(subjectGroups).length === 0 ? (
                                            <div className="px-5 py-6 flex items-center justify-center
                                border border-dashed border-slate-200
                                dark:border-slate-700 rounded-xl mx-5 my-4">
                                                <p className="text-xs text-slate-400">
                                                    No attempts recorded yet.
                                                </p>
                                            </div>
                                        ) : (
                                            /* Scrollable — grows with number of subjects */
                                            <div className="overflow-y-auto max-h-64 px-5 py-4 space-y-3">
                                                {Object.entries(subjectGroups)
                                                    .sort((a, b) => b[1].length - a[1].length)
                                                    .map(([sub, atts]) => {
                                                        const avg = averageScore(atts);
                                                        return (
                                                            <div key={sub} className="flex items-center gap-2 md:gap-3">
                                                                <span className="text-[10px] font-bold
                                                     text-slate-600 dark:text-slate-300
                                                     w-28 md:w-36 truncate flex-shrink-0">
                                                                    {sub}
                                                                </span>
                                                                <div className="flex-1 bg-slate-100 dark:bg-slate-700
                                                    rounded-full h-2">
                                                                    <div
                                                                        className="h-2 rounded-full transition-all duration-700"
                                                                        style={{
                                                                            width: `${avg || 0}%`,
                                                                            backgroundColor: primary,
                                                                        }}
                                                                    />
                                                                </div>
                                                                <ScoreBadge score={avg} />
                                                                <span className="text-[9px] text-slate-400
                                                     w-14 md:w-16 text-right flex-shrink-0">
                                                                    {atts.length} att.
                                                                </span>
                                                            </div>
                                                        );
                                                    })
                                                }
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="bg-white dark:bg-slate-800 rounded-2xl border
                border-slate-100 dark:border-slate-700 overflow-hidden">

                                {/* Header — clickable to collapse */}
                                <button
                                    onClick={() => setActivityOpen(v => !v)}
                                    className="w-full flex justify-between items-center p-5
                   hover:bg-slate-50 dark:hover:bg-slate-700/50
                   transition-colors cursor-pointer"
                                >
                                    <h2 className="text-sm font-black text-slate-700 dark:text-white">
                                        Recent Activity
                                    </h2>
                                    <div className="flex items-center gap-2">
                                        {auditLog.length > 0 && (
                                            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full
                                 bg-slate-100 dark:bg-slate-700
                                 text-slate-500 dark:text-slate-300">
                                                {auditLog.length} events
                                            </span>
                                        )}
                                        <svg
                                            className={`w-4 h-4 text-slate-400 transition-transform duration-200
                            ${activityOpen ? '' : 'rotate-180'}`}
                                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round"
                                                strokeWidth={2} d="M5 15l7-7 7 7" />
                                        </svg>
                                    </div>
                                </button>

                                {/* Collapsible + scrollable content */}
                                {activityOpen && (
                                    <div className="border-t border-slate-100 dark:border-slate-700">
                                        {auditLog.length === 0 ? (
                                            <div className="px-5 py-6 flex items-center justify-center
                                border border-dashed border-slate-200
                                dark:border-slate-700 rounded-xl mx-5 my-4">
                                                <p className="text-xs text-slate-400">
                                                    No activity recorded yet.
                                                </p>
                                            </div>
                                        ) : (
                                            /* Scrollable — grows with audit log */
                                            <div className="overflow-y-auto max-h-64 px-5 py-4 space-y-3">
                                                {auditLog.map(ev => (
                                                    <div key={ev.id} className="flex items-start gap-3 text-xs">
                                                        <div className="w-5 h-5 rounded-full bg-slate-100
                                            dark:bg-slate-700 flex items-center
                                            justify-center flex-shrink-0 mt-0.5">
                                                            {ev.type === 'ai_mark'
                                                                ? <Award size={10} className="text-indigo-500" />
                                                                : ev.type === 'remark'
                                                                    ? <RefreshCw size={10} className="text-amber-500" />
                                                                    : <CheckCircle2 size={10} className="text-emerald-500" />
                                                            }
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-bold text-slate-700 dark:text-slate-200 truncate">
                                                                {ev.description || ev.type}
                                                            </p>
                                                            <p className="text-slate-400 mt-0.5">
                                                                {ev.actorName || 'System'} &middot;{' '}
                                                                {ev.timestamp?.toDate?.().toLocaleDateString(
                                                                    'en-ZA', {
                                                                    day: '2-digit',
                                                                    month: 'short',
                                                                    year: 'numeric',
                                                                }
                                                                ) || '—'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}



                    {/* ----TEACHERS TAB------ */}
                    {activeTab === 'teachers' && (
                        <>
                            <LimitAlertBanner resource="teachers" label="Teachers" info={limits.teachers} onUpgrade={handleUpgrade} />

                            <TeachersTab
                                teachers={teachers}          // users where role === 'teacher' && schoolId === school.id
                                exams={exams}
                                attempts={attempts}          // the same array your examAttempts() filters over
                                students={students}
                                targetExamsPerSubject={4}
                                assessments={teacherReviews} // optional: { "uid::Mathematics": { rating, notes } }
                                onSaveAssessment={handleSaveAssessment}
                            />
                        </>
                    )}

                    {/* ── STUDENTS TAB ── */}
                    {activeTab === 'students' && (
                        <>
                            {/* ✅ Both warn (80%) and block (100%) banners */}
                            <LimitAlertBanner resource="students" label="Students" info={limits.students} onUpgrade={handleUpgrade} />

                            {/* Filter bar */}
                            <div className="bg-white dark:bg-slate-800 rounded-2xl p-3 border border-slate-100 dark:border-slate-700 flex flex-wrap items-center gap-2">
                                <div className="relative flex-1 min-w-36">
                                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text" value={search} placeholder="Search..."
                                        className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-700 outline-none focus:border-indigo-500"
                                        onChange={e => setSearch(e.target.value)}
                                    />
                                </div>
                                <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)}
                                    className="px-2.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-700 outline-none font-bold">
                                    <option value="All">All Grades</option>
                                    {GRADE_ORDER.map(g => <option key={g}>{g}</option>)}
                                </select>
                                <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)}
                                    className="px-2.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-700 outline-none font-bold">
                                    <option value="All">All Subjects</option>
                                    {allSubjects.map(s => <option key={s}>{s}</option>)}
                                </select>
                                <span className="text-[10px] text-slate-400 font-bold">{filteredStudents.length} students</span>
                            </div>

                            {/* ✅ LimitGate blocks add action when students are full */}
                            {limits.students.blocked && (
                                <LimitGate blocked resource="students" onUpgrade={handleUpgrade}>
                                    {/* Add Student button would go here */}
                                </LimitGate>
                            )}

                            {/* Desktop table */}
                            <div className="hidden md:block bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-100 dark:border-slate-700">
                                            {['Name', 'Grade', 'Subjects', 'Attempts', 'Avg', 'Pass Rate', ''].map(h => (
                                                <th key={h} className="text-left px-4 py-3 font-black text-slate-500 uppercase tracking-wider text-[9px]">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredStudents.length === 0
                                            ? <tr><td colSpan={7} className="text-center py-8 text-slate-400 text-xs">No students found.</td></tr>
                                            : filteredStudents.map(s => {
                                                const atts = studentAttempts(s.uid);
                                                const avg = averageScore(atts);
                                                const pr = passRate(atts);
                                                return (
                                                    <tr key={s.uid}
                                                        className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors"
                                                        onClick={() => setSelectedStudent(selectedStudent?.uid === s.uid ? null : s)}>
                                                        <td className="px-4 py-3 font-bold text-slate-800 dark:text-white">{s.name} {s.surname}</td>
                                                        <td className="px-4 py-3 text-slate-500">{s.grade}</td>
                                                        <td className="px-4 py-3 text-slate-500">
                                                            <div className="flex flex-wrap gap-1">
                                                                {(s.subjects || []).slice(0, 2).map(sub => (
                                                                    <span key={sub} className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-[9px] font-bold">{sub}</span>
                                                                ))}
                                                                {(s.subjects || []).length > 2 && (
                                                                    <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-[9px] text-slate-400">+{s.subjects.length - 2}</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-500">{atts.length}</td>
                                                        <td className="px-4 py-3"><ScoreBadge score={avg} /></td>
                                                        <td className="px-4 py-3">
                                                            {atts.length > 0 && (
                                                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg ${pr >= 50 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>{pr}%</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3"><Eye size={13} className="text-slate-400" /></td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile student cards */}
                            <div className="md:hidden space-y-2">
                                {filteredStudents.length === 0
                                    ? <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 text-center text-xs text-slate-400 border border-slate-100 dark:border-slate-700">No students found.</div>
                                    : filteredStudents.map(s => {
                                        const atts = studentAttempts(s.uid);
                                        console.log("DEBUG - Attempts for student:", s.name, atts); // Does this look like objects or numbers?
                                        const avg = averageScore(atts);
                                        const pr = passRate(atts);
                                        const isSelected = selectedStudent?.uid === s.uid;

                                        return (
                                            <div key={s.uid}
                                                className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                                                <button
                                                    className="w-full flex items-center gap-3 px-4 py-3"
                                                    onClick={() => setSelectedStudent(isSelected ? null : s)}>
                                                    <div className="flex-1 text-left">
                                                        <p className="text-xs font-black text-slate-800 dark:text-white">{s.name} {s.surname}</p>
                                                        <p className="text-[10px] text-slate-400">{s.grade}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <ScoreBadge score={avg} />
                                                        {atts.length > 0 && (
                                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-lg ${pr >= 50 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>{pr}%</span>
                                                        )}
                                                        {isSelected ? <ChevronDown size={13} className="text-slate-400" /> : <ChevronRight size={13} className="text-slate-400" />}
                                                    </div>
                                                </button>
                                                {isSelected && (
                                                    <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-3 space-y-2">
                                                        <p className="text-[10px] text-slate-400">{s.email}</p>
                                                        {studentAttempts(s.uid).length === 0
                                                            ? <p className="text-xs text-slate-400">No attempts yet.</p>
                                                            : studentAttempts(s.uid).map(a => (
                                                                <div key={a.id} className="flex items-center justify-between py-1 border-b border-slate-50 dark:border-slate-700/50">
                                                                    <div>
                                                                        <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{a.examTitle || 'Exam'}</p>
                                                                        <p className="text-[9px] text-slate-400">{a.submittedAt?.toDate?.().toLocaleDateString('en-ZA') || '—'}</p>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <ScoreBadge score={a.score} />
                                                                        <span className={`text-[9px] font-black ${(a.score || 0) >= 40 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                            {(a.score || 0) >= 40 ? 'PASS' : 'FAIL'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                            </div>

                            {/* Desktop drill-down */}
                            {selectedStudent && (
                                <div className="hidden md:block bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <h3 className="text-sm font-black text-slate-800 dark:text-white">
                                                {selectedStudent.name} {selectedStudent.surname} — Attempt History
                                            </h3>
                                            <p className="text-xs text-slate-400">{selectedStudent.grade} · {selectedStudent.email}</p>
                                        </div>
                                        <button onClick={() => setSelectedStudent(null)} className="text-slate-400 hover:text-slate-600">
                                            <X size={18} />
                                        </button>
                                    </div>
                                    {studentAttempts(selectedStudent.uid).length === 0
                                        ? <p className="text-xs text-slate-400">No attempts yet.</p>
                                        : (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-xs min-w-[500px]">
                                                    <thead>
                                                        <tr className="border-b border-slate-100 dark:border-slate-700">
                                                            {['Exam', 'Subject', 'Score', 'Pass/Fail', 'Marked By', 'Date', 'Modified'].map(h => (
                                                                <th key={h} className="text-left px-3 py-2 font-black text-slate-400 uppercase text-[9px]">{h}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {studentAttempts(selectedStudent.uid).map(a => (
                                                            <tr key={a.id} className="border-b border-slate-50 dark:border-slate-700/50">
                                                                <td className="px-3 py-2 font-bold text-slate-700 dark:text-slate-200">{a.examTitle || 'Exam'}</td>
                                                                <td className="px-3 py-2 text-slate-500">{a.subject || '—'}</td>
                                                                <td className="px-3 py-2"><ScoreBadge score={a.score} /></td>
                                                                <td className="px-3 py-2">
                                                                    <span className={`text-[9px] font-black ${(a.score || 0) >= 40 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                        {(a.score || 0) >= 40 ? 'PASS' : 'FAIL'}
                                                                    </span>
                                                                </td>
                                                                <td className="px-3 py-2 text-slate-400">{a.markedBy || 'AI'}</td>
                                                                <td className="px-3 py-2 text-slate-400">{a.submittedAt?.toDate?.().toLocaleDateString('en-ZA') || '—'}</td>
                                                                <td className="px-3 py-2">
                                                                    {a.remarked && <span className="text-[9px] text-amber-600 font-black">REMARKED</span>}
                                                                    {a.aiModified && <span className="text-[9px] text-indigo-500 font-black ml-1">AI MOD</span>}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                </div>
                            )}
                        </>
                    )}

                    {/* ── EXAMS TAB ── */}
                    {activeTab === 'exams' && (
                        <>
                            {/* ✅ Both warn and block banners for exams */}
                            <LimitAlertBanner resource="exams" label="Exams" info={limits.exams} onUpgrade={handleUpgrade} />

                            {/* ✅ Gate blocks upload action when at exam limit */}
                            {limits.exams.blocked && (
                                <LimitGate blocked resource="exams" onUpgrade={handleUpgrade}>
                                    {/* Upload Exam button would go here */}
                                </LimitGate>
                            )}

                            <div className="flex items-center justify-between flex-wrap gap-3">
                                <h2 className="text-sm font-black text-slate-700 dark:text-white">All Exams</h2>
                                <select value={filterExam} onChange={e => setFilterExam(e.target.value)}
                                    className="px-2.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 outline-none font-bold text-slate-200">
                                    <option value="All">All Subjects</option>
                                    {allSubjects.map(s => <option key={s}>{s}</option>)}
                                </select>
                            </div>

                            <div className="space-y-3">
                                {exams.filter(ex => filterExam === 'All' || ex.subject === filterExam).map(ex => {
                                    const atts = examAttempts(ex);
                                    const avg = averageScore(atts);
                                    const pr = passRate(atts);
                                    const isOpen = selectedExam === ex.id;
                                    return (
                                        <div key={ex.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                                            <button
                                                className="w-full flex items-center gap-3 px-4 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                                                onClick={() => setSelectedExam(isOpen ? null : ex.id)}>
                                                <div className="flex-1 text-left min-w-0">
                                                    <p className="text-xs font-black text-slate-800 dark:text-white truncate">{ex.title}</p>
                                                    <p className="text-[9px] text-slate-400 mt-0.5 truncate">{ex.subject} · {ex.grade} · {ex.teacherName || 'Teacher'}</p>
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <span className="text-[9px] text-slate-400 hidden sm:block">{atts.length} att.</span>
                                                    <ScoreBadge score={avg} />
                                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-lg hidden sm:block ${pr >= 50 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>{pr}%</span>
                                                    {isOpen ? <ChevronDown size={13} className="text-slate-400" /> : <ChevronRight size={13} className="text-slate-400" />}
                                                </div>
                                            </button>
                                            {isOpen && (
                                                <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-4">
                                                    {atts.length === 0
                                                        ? <p className="text-xs text-slate-400">No attempts yet.</p>
                                                        : (
                                                            <div className="overflow-x-auto">
                                                                <table className="w-full text-xs min-w-[400px]">
                                                                    <thead>
                                                                        <tr className="border-b border-slate-100 dark:border-slate-700">
                                                                            {['Student', 'Score', 'Pass/Fail', 'Marked By', 'Date'].map(h => (
                                                                                <th key={h} className="text-left px-3 py-2 font-black text-slate-400 uppercase text-[9px]">{h}</th>
                                                                            ))}
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {atts.map(a => {
                                                                            const pct = a.percentage ?? a.score ?? 0;
                                                                            return (
                                                                                <tr key={a.id} className="border-b border-slate-50 dark:border-slate-700/50">
                                                                                    <td className="px-3 py-2 font-bold text-slate-700 dark:text-slate-200">
                                                                                        {a.studentName || a.studentId || a.studentUid || '—'}
                                                                                    </td>
                                                                                    <td className="px-3 py-2"><ScoreBadge score={a.score ?? a.percentage} /></td>
                                                                                    <td className="px-3 py-2">
                                                                                        <span className={`text-[9px] font-black ${pct >= 40 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                                            {pct >= 40 ? 'PASS' : 'FAIL'}
                                                                                        </span>
                                                                                    </td>
                                                                                    <td className="px-3 py-2 text-slate-400">{a.markedBy || 'AI'}</td>
                                                                                    <td className="px-3 py-2 text-slate-400">
                                                                                        {a.submittedAt?.toDate?.().toLocaleDateString('en-ZA') || '—'}
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {exams.length === 0 && (
                                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-10 text-center">
                                        <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                        <p className="text-xs text-slate-400">No exams uploaded yet.</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* ── AUDIT LOG TAB ── */}
                    {activeTab === 'audit' && (

                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                                <h2 className="text-sm font-black text-slate-700 dark:text-white">Audit Log</h2>
                                <span className="text-xs text-slate-400">{auditLog.length} entries</span>
                            </div>
                            {auditLog.length === 0
                                ? <div className="p-10 text-center"><Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" /><p className="text-xs text-slate-400">No audit events yet.</p></div>
                                : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs min-w-[560px]">
                                            <thead>
                                                <tr className="border-b border-slate-100 dark:border-slate-700">
                                                    {['Type', 'Description', 'Actor', 'Student', 'Exam', 'Timestamp'].map(h => (
                                                        <th key={h} className="text-left px-4 py-3 font-black text-slate-400 uppercase text-[9px]">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {auditLog.map(ev => (
                                                    <tr key={ev.id} className="border-b border-slate-50 dark:border-slate-700/50">
                                                        <td className="px-4 py-3">
                                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg ${ev.type === 'ai_mark' ? 'bg-indigo-50 text-indigo-600' : ev.type === 'remark' ? 'bg-amber-50 text-amber-600' : ev.type === 'modification' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                                                                {ev.type || 'event'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200 max-w-[160px] truncate">{ev.description || '—'}</td>
                                                        <td className="px-4 py-3 text-slate-500">{ev.actorName || 'System'}</td>
                                                        <td className="px-4 py-3 text-slate-500">{ev.studentName || '—'}</td>
                                                        <td className="px-4 py-3 text-slate-500">{ev.examTitle || '—'}</td>
                                                        <td className="px-4 py-3 text-slate-400">{ev.timestamp?.toDate?.().toLocaleString('en-ZA') || '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                        </div>
                    )}

                    {/* ── SUBSCRIPTIONS TAB ── */}
                    {activeTab === 'subscriptions' && (
                        <SubscriptionManager
                            activeTier={activeTier}
                            schoolName={school?.name || ''}
                            schoolId={schoolId}
                            school={school}
                            usage={usage}
                            primary={primary}
                            onTierChange={() => setShowUpgradeModal(true)}
                        />
                    )}

                    {/* ── SETTINGS TAB ── */}
                    {activeTab === 'settings' && (
                        <div className="space-y-4">
                            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5">
                                <h2 className="text-sm font-black text-slate-800 dark:text-white mb-1">School Settings</h2>
                                <p className="text-xs text-slate-500 mb-5">Update your school's branding and information.</p>
                                <button
                                    className="px-5 py-2.5 rounded-xl text-white text-xs font-black"
                                    style={{ backgroundColor: primary }}
                                    onClick={() => navigate('/school-registration')}
                                >
                                    Edit School Profile →
                                </button>
                                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {[
                                        ['School Name', school?.name],
                                        ['Country', school?.country],
                                        ['Motto', school?.motto],
                                        ['Established', school?.established],
                                        ['Province', school?.province],
                                        ['District', school?.district],
                                        ['Curricula', (school?.curricula || []).join(', ')],
                                    ].map(([label, value]) => (
                                        <div key={label} className="p-3 bg-slate-50 dark:bg-slate-700 rounded-xl">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{label}</p>
                                            <p className="text-xs font-bold text-slate-800 dark:text-white mt-1">{value || '—'}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* ✅ Settings also shows limit alerts */}
                            <LimitAlertBanner resource="students" label="Students" info={limits.students} onUpgrade={handleUpgrade} />
                            <LimitAlertBanner resource="exams" label="Exams" info={limits.exams} onUpgrade={handleUpgrade} />
                            <LimitAlertBanner resource="teachers" label="Teachers" info={limits.teachers} onUpgrade={handleUpgrade} />

                            {/* Quick plan card */}
                            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h2 className="text-sm font-black text-slate-800 dark:text-white">Plan & Billing</h2>
                                        <p className="text-xs text-slate-400 mt-0.5">Manage subscription and usage.</p>
                                    </div>
                                    <TierBadge tier={activeTier} collapsed={false} />
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 space-y-3 mb-4">
                                    <UsageMeter
                                        label="Students"
                                        used={students.length}
                                        limit={limits.students?.max ?? null}
                                        color={primary}
                                    />
                                    <UsageMeter
                                        label="Exams"
                                        used={exams.length}
                                        limit={limits.exams?.max ?? null}
                                        color={primary}
                                    />
                                    <UsageMeter
                                        label="Teachers"
                                        used={teachers.length}
                                        limit={limits.teachers?.max ?? null}
                                        color={primary}
                                    />
                                </div>
                                <button
                                    onClick={() => setActiveTab('subscriptions')}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-xs font-black bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 transition-opacity"
                                >
                                    <CreditCard size={13} /> Manage Subscriptions
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── MOBILE BOTTOM NAV ── */}
                <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center print:hidden">
                    {mobileBottomTabs.map(t => {
                        const Icon = t.icon;
                        const isActive = activeTab === t.id;
                        // ✅ Alert dots on mobile bottom nav
                        const hasAlert =
                            (t.id === 'students' && (limits.students.blocked || limits.students.warning)) ||
                            (t.id === 'exams' && (limits.exams.blocked || limits.exams.warning));
                        const isBlockedAlert =
                            (t.id === 'students' && limits.students.blocked) ||
                            (t.id === 'exams' && limits.exams.blocked);

                        return (
                            <button
                                key={t.id}
                                onClick={() => {
                                    if (t.locked) { handleUpgrade(); return; }
                                    setActiveTab(t.id);
                                }}
                                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[9px] font-black transition-colors ${isActive ? '' : 'text-slate-400'}`}
                                style={isActive ? { color: primary } : {}}
                            >
                                <div className="relative">
                                    <Icon size={18} />
                                    {t.locked && (
                                        <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center">
                                            <Lock size={6} className="text-slate-400" />
                                        </div>
                                    )}
                                    {/* ✅ Limit alert dot on mobile nav */}
                                    {hasAlert && !t.locked && (
                                        <div className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${isBlockedAlert ? 'bg-red-500' : 'bg-amber-400'}`} />
                                    )}
                                </div>
                                <span className="leading-none">{t.label}</span>
                                {isActive && (
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full" style={{ backgroundColor: primary }} />
                                )}
                            </button>
                        );
                    })}
                    <button
                        onClick={() => setMobileDrawerOpen(true)}
                        className="flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[9px] font-black text-slate-400"
                    >
                        <div className="relative">
                            <Menu size={18} />
                            {/* ✅ Alert dot on "More" if teachers are at limit (teachers tab is in overflow) */}
                            {(limits.teachers.blocked || limits.teachers.warning) && (
                                <div className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${limits.teachers.blocked ? 'bg-red-500' : 'bg-amber-400'}`} />
                            )}
                        </div>
                        <span className="leading-none">More</span>
                    </button>
                </nav>
            </div>

            {/* ── Upgrade modal ── */}
            {showUpgradeModal && createPortal(
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
                    style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                    onClick={(e) => { if (e.target === e.currentTarget) setShowUpgradeModal(false); }}
                >
                    <div
                        className="relative bg-white dark:bg-slate-900 rounded-3xl w-full max-w-3xl shadow-2xl border border-slate-100 dark:border-slate-700"
                        style={{ maxHeight: '90vh', overflowY: 'auto' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setShowUpgradeModal(false)}
                            className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 transition-colors"
                        >
                            <X size={15} />
                        </button>
                        <div className="p-6">
                            <SubscriptionManager
                                currentTier={activeTier || 'free'}
                                schoolName={school?.name || ''}
                                schoolId={schoolId}
                                school={school}
                                onTierChange={() => setShowUpgradeModal(false)}
                            />
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
        </div>
    );
}
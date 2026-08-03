import React, { useState, useEffect, useMemo } from 'react';
import {
    ChevronDown, ChevronUp,
    ArrowUpRight, ArrowDownRight, CheckCircle2, XCircle,
    CreditCard, Receipt, FileText, Download,
    AlertTriangle, RefreshCw, CalendarClock, TrendingUp,
    Shield, Zap, Users, GraduationCap, Plus, Minus
} from 'lucide-react';
import {
    collection, query, where, orderBy, limit,
    onSnapshot, addDoc, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import {
    TIERS, TIER_ORDER, getTierConfig, getTierPrice, isUpgrade as isTierUpgrade,
    useCurrentTier
} from '../utils/tierConfig';
import PaymentManager from './PaymentManager';

// ─── ADD-ON & SUBSCRIPTION CALCULATION ───────────────────────────────────────
export function calculateSubscriptionTotal(tierConfig, studentCount, teacherCount, billingCycle = 'monthly') {
    if (!tierConfig) return 0;

    const basePrice = getTierPrice(tierConfig, billingCycle);
    if (tierConfig.id === 'free' && basePrice === 0 && studentCount <= (tierConfig.includedStudents ?? 50) && teacherCount <= (tierConfig.includedTeachers ?? 5)) {
        return 0;
    }

    const studentRate = tierConfig.perStudentPrice ?? 15; // R15/student
    const teacherRate = tierConfig.perTeacherPrice ?? 50;  // R50/teacher

    const baseStudents = tierConfig.includedStudents ?? 50;
    const baseTeachers = tierConfig.includedTeachers ?? 5;

    const extraStudents = Math.max(0, studentCount - baseStudents);
    const extraTeachers = Math.max(0, teacherCount - baseTeachers);

    const studentAddonTotal = extraStudents * studentRate;
    const teacherAddonTotal = extraTeachers * teacherRate;

    const monthlyTotal = basePrice + studentAddonTotal + teacherAddonTotal;
    return billingCycle === 'annual' ? Math.round(monthlyTotal * 0.8) : monthlyTotal;
}

// ─── WRITE BILLING RECORD ─────────────────────────────────────────────────────
export async function recordBillingPayment(schoolId, tierId, paymentMethod = 'Card •••• 4242') {
    const tier = getTierConfig(tierId);
    const amount = tier.monthlyPrice ?? 0;
    if (amount === 0) return;

    const now = new Date();
    const next = new Date(now);
    next.setMonth(next.getMonth() + 1);

    await addDoc(collection(db, 'billing'), {
        schoolId,
        tier: tierId,
        amount,
        date: serverTimestamp(),
        description: `${tier.label} Plan — Monthly`,
        status: 'paid',
        method: paymentMethod,
        invoiceId: `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${schoolId.slice(0, 6).toUpperCase()}`,
    });

    await updateDoc(doc(db, 'schools', schoolId), {
        tier: tierId,
        subscribedAt: serverTimestamp(),
        nextBillingDate: next.toISOString(),
        updatedAt: serverTimestamp(),
    });
}

// ─── REAL BILLING HOOK ────────────────────────────────────────────────────────
function useBillingHistory(schoolId) {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!schoolId) { setLoading(false); return; }
        let active = true;
        const q = query(
            collection(db, 'billing'),
            where('schoolId', '==', schoolId),
            orderBy('date', 'desc'),
            limit(12)
        );
        const unsub = onSnapshot(q, (snap) => {
            if (!active) return;
            setRecords(snap.docs.map(d => {
                const data = d.data();
                return {
                    ...data,
                    id: data.invoiceId || d.id,
                    date: data.date?.toDate?.() ?? new Date(data.date ?? Date.now()),
                };
            }));
            setLoading(false);
        }, () => { if (active) setLoading(false); });
        return () => { active = false; unsub(); };
    }, [schoolId]);

    return { records, loading };
}

// ─── COUNTDOWN HOOK ───────────────────────────────────────────────────────────
function useCountdown(targetDate) {
    const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

    useEffect(() => {
        if (!targetDate) return;
        const calc = () => {
            const diff = new Date(targetDate) - new Date();
            if (diff <= 0) { setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 }); return; }
            setTimeLeft({
                days: Math.floor(diff / 86400000),
                hours: Math.floor((diff % 86400000) / 3600000),
                minutes: Math.floor((diff % 3600000) / 60000),
                seconds: Math.floor((diff % 60000) / 1000),
            });
        };
        calc();
        const id = setInterval(calc, 1000);
        return () => clearInterval(id);
    }, [String(targetDate)]);

    return timeLeft;
}

// ─── COUNTDOWN CARD ───────────────────────────────────────────────────────────
function CountdownCard({ nextBillingDate, tierId, accentColor, estimatedAmount }) {
    const t = useCountdown(nextBillingDate);

    return (
        <div className="relative rounded-2xl p-5 overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${accentColor}18, ${accentColor}08)`, border: `1px solid ${accentColor}30` }}>
            <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-10" style={{ background: accentColor }} />
            <div className="flex items-start justify-between mb-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <CalendarClock size={14} style={{ color: accentColor }} />
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Next Billing</span>
                    </div>
                    <p className="text-sm font-black text-slate-800 dark:text-white">
                        {nextBillingDate
                            ? new Date(nextBillingDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
                            : '—'}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-slate-400 font-bold">Estimated due</p>
                    <p className="text-lg font-black text-slate-800 dark:text-white">R{estimatedAmount.toLocaleString()}</p>
                </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
                {[
                    { value: t.days, label: 'Days' },
                    { value: t.hours, label: 'Hours' },
                    { value: t.minutes, label: 'Mins' },
                    { value: t.seconds, label: 'Secs' },
                ].map(({ value, label }) => (
                    <div key={label} className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-2 text-center backdrop-blur-sm">
                        <p className="text-xl font-black tabular-nums text-slate-800 dark:text-white leading-none">
                            {String(value ?? 0).padStart(2, '0')}
                        </p>
                        <p className="text-[9px] font-black uppercase tracking-wider mt-1" style={{ color: accentColor }}>{label}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── ADDON QUANTITY SELECTOR ──────────────────────────────────────────────────
function AddonQuantitySelector({ studentCount, setStudentCount, teacherCount, setTeacherCount, activeTierConfig }) {
    const baseStudents = activeTierConfig.includedStudents ?? 50;
    const baseTeachers = activeTierConfig.includedTeachers ?? 5;
    const studentRate = activeTierConfig.perStudentPrice ?? 15;
    const teacherRate = activeTierConfig.perTeacherPrice ?? 50;

    const extraStudents = Math.max(0, studentCount - baseStudents);
    const extraTeachers = Math.max(0, teacherCount - baseTeachers);

    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
                <div>
                    <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                        <Users size={16} className="text-indigo-500" /> Seat Allocations & Add-ons
                    </h3>
                    <p className="text-[11px] text-slate-400">Scale active learner and teacher limits for your school</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Students Control */}
                <div className="rounded-xl p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <GraduationCap size={16} className="text-violet-500" />
                            <span className="text-xs font-black text-slate-700 dark:text-slate-200">Student Seats</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400">
                            Includes {baseStudents} base
                        </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <button
                            onClick={() => setStudentCount(Math.max(10, studentCount - 10))}
                            className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold transition-colors"
                        >
                            <Minus size={14} />
                        </button>
                        <div className="text-center">
                            <span className="text-lg font-black text-slate-800 dark:text-white">{studentCount}</span>
                            <span className="text-[10px] text-slate-400 block">
                                {extraStudents > 0 ? `+${extraStudents} extra (R${extraStudents * studentRate}/mo)` : 'Within base limit'}
                            </span>
                        </div>
                        <button
                            onClick={() => setStudentCount(studentCount + 10)}
                            className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold transition-colors"
                        >
                            <Plus size={14} />
                        </button>
                    </div>
                </div>

                {/* Teachers Control */}
                <div className="rounded-xl p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Users size={16} className="text-emerald-500" />
                            <span className="text-xs font-black text-slate-700 dark:text-slate-200">Teacher Seats</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400">
                            Includes {baseTeachers} base
                        </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <button
                            onClick={() => setTeacherCount(Math.max(1, teacherCount - 1))}
                            className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold transition-colors"
                        >
                            <Minus size={14} />
                        </button>
                        <div className="text-center">
                            <span className="text-lg font-black text-slate-800 dark:text-white">{teacherCount}</span>
                            <span className="text-[10px] text-slate-400 block">
                                {extraTeachers > 0 ? `+${extraTeachers} extra (R${extraTeachers * teacherRate}/mo)` : 'Within base limit'}
                            </span>
                        </div>
                        <button
                            onClick={() => setTeacherCount(teacherCount + 1)}
                            className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold transition-colors"
                        >
                            <Plus size={14} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── PLAN CARD ────────────────────────────────────────────────────────────────
function PlanCard({ plan, currentTierId, onSelect, billingCycle, studentCount, teacherCount }) {
    const isCurrent = plan.id === currentTierId;
    const isUp = isTierUpgrade(currentTierId, plan.id);
    const Icon = plan.icon;
    const calculatedPrice = calculateSubscriptionTotal(plan, studentCount, teacherCount, billingCycle);

    return (
        <div
            className={`relative rounded-3xl p-6 border flex flex-col justify-between transition-all duration-200 min-h-[360px] ${isCurrent
                    ? `ring-2 bg-gradient-to-br ${plan.gradientBg}`
                    : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-800/90 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-none'
                }`}
            style={isCurrent ? { '--tw-ring-color': plan.accentColor } : {}}
        >
            {/* Top Badges */}
            {plan.popular && !isCurrent && (
                <div
                    className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white shadow-md"
                    style={{ background: plan.accentColor }}
                >
                    Most Popular
                </div>
            )}
            {isCurrent && (
                <div className="absolute -top-3.5 right-6 px-3.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white bg-slate-900 dark:bg-slate-700 shadow-md">
                    Current Plan
                </div>
            )}

            {/* Header & Pricing Section */}
            <div>
                <div className="flex items-center gap-3.5 mb-5">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br ${plan.gradient} flex-shrink-0 shadow-md`}>
                        <Icon size={20} className="text-white" />
                    </div>
                    <div>
                        <h4 className="text-lg font-black text-slate-800 dark:text-white leading-tight">
                            {plan.label}
                        </h4>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">
                            {plan.seats?.students ? `${plan.seats.students} Students • ${plan.seats.teachers} Teachers` : 'Custom Seats'}
                        </p>
                    </div>
                </div>

                {/* Clear Pricing Hero */}
                <div className="mb-6 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/60">
                    {calculatedPrice === 0 ? (
                        <p className="text-sm font-bold text-slate-500 dark:text-slate-400 py-1">
                            Free Trial Package
                        </p>
                    ) : (
                        <div>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black text-slate-900 dark:text-white">
                                    R{billingCycle === 'annual'
                                        ? Math.round(calculatedPrice / 12).toLocaleString()
                                        : calculatedPrice.toLocaleString()}
                                </span>
                                <span className="text-xs font-bold text-slate-400">/month</span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1">
                                {billingCycle === 'annual'
                                    ? `Billed as R${calculatedPrice.toLocaleString()} yearly`
                                    : 'Billed monthly'}
                            </p>
                        </div>
                    )}
                </div>

                {/* Feature List */}
                <ul className="space-y-3 mb-6">
                    {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                            <CheckCircle2 size={15} style={{ color: plan.accentColor }} className="flex-shrink-0 mt-0.5" />
                            <span>{f}</span>
                        </li>
                    ))}
                </ul>
            </div>

            {/* Sticky Action Button */}
            <div className="mt-auto pt-2">
                {!isCurrent && (
                    <button
                        onClick={() => onSelect(plan)}
                        className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-xs font-black transition-all shadow-md active:scale-[0.98] ${isUp
                                ? 'text-white hover:opacity-95 shadow-indigo-500/10'
                                : 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700/80 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                        style={isUp ? { background: `linear-gradient(135deg, ${plan.accentColor}, ${plan.accentColor}dd)` } : {}}
                    >
                        {isUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        {isUp ? `Upgrade to ${plan.label}` : `Downgrade to ${plan.label}`}
                    </button>
                )}
                {isCurrent && (
                    <div
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-xs font-black text-white shadow-md"
                        style={{ background: `linear-gradient(135deg, ${plan.accentColor}, ${plan.accentColor}dd)` }}
                    >
                        <CheckCircle2 size={14} /> Active Plan
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── BILLING TABLE ────────────────────────────────────────────────────────────
function BillingHistory({ records, loading, accentColor }) {
    const [expanded, setExpanded] = useState(false);
    const shown = expanded ? records : records.slice(0, 4);

    if (loading) return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-8 text-center">
            <RefreshCw size={20} className="text-slate-300 mx-auto mb-2 animate-spin" />
            <p className="text-xs text-slate-400">Loading billing history…</p>
        </div>
    );

    if (records.length === 0) return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-8 text-center">
            <Receipt size={28} className="text-slate-200 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-bold">No billing history yet.</p>
            <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-1">Payments appear here after your first billing cycle.</p>
        </div>
    );

    const total = records.reduce((s, r) => s + (r.amount ?? 0), 0);

    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <CreditCard size={15} style={{ color: accentColor }} />
                    <h3 className="text-sm font-black text-slate-800 dark:text-white">Billing History</h3>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-400 font-bold">
                        Total paid: <span className="font-black text-slate-700 dark:text-slate-200">R{total.toLocaleString()}</span>
                    </span>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        <Download size={11} /> Statement
                    </button>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[500px]">
                    <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
                            {['Invoice', 'Description', 'Method', 'Amount', 'Status', ''].map(h => (
                                <th key={h} className="text-left px-4 py-3 font-black text-slate-400 uppercase tracking-wider text-[9px]">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((r) => (
                            <tr key={r.id} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                <td className="px-4 py-3 font-black text-slate-500 text-[10px] font-mono">{r.invoiceId || r.id}</td>
                                <td className="px-4 py-3">
                                    <p className="font-bold text-slate-700 dark:text-slate-200">{r.description}</p>
                                    <p className="text-slate-400 text-[10px]">
                                        {r.date instanceof Date
                                            ? r.date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
                                            : '—'}
                                    </p>
                                </td>
                                <td className="px-4 py-3 text-slate-500">{r.method || '—'}</td>
                                <td className="px-4 py-3 font-black text-slate-800 dark:text-white">R{(r.amount ?? 0).toLocaleString()}</td>
                                <td className="px-4 py-3">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase ${r.status === 'paid'
                                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                        : 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400'}`}>
                                        {r.status === 'paid' ? <CheckCircle2 size={9} /> : <XCircle size={9} />}
                                        {r.status || 'unknown'}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <button className="text-slate-300 hover:text-slate-500 transition-colors"><Download size={13} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {records.length > 4 && (
                <button onClick={() => setExpanded(e => !e)}
                    className="w-full flex items-center justify-center gap-2 py-3 text-[11px] font-black text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors border-t border-slate-100 dark:border-slate-700">
                    {expanded
                        ? <><ChevronUp size={13} /> Show less</>
                        : <><ChevronDown size={13} /> Show all {records.length} invoices</>}
                </button>
            )}
        </div>
    );
}

// ─── ACCOUNT STATEMENT ────────────────────────────────────────────────────────
function AccountStatement({ records, currentTierId, schoolName, billingCycle, accentColor, totalEstimatedPrice }) {
    const totalPaid = records.reduce((s, r) => s + (r.amount ?? 0), 0);
    const monthsActive = records.length;
    const avgMonthly = monthsActive ? Math.round(totalPaid / monthsActive) : 0;

    const stats = [
        { label: 'Total Paid (All Time)', value: `R${totalPaid.toLocaleString()}`, icon: TrendingUp, color: accentColor },
        { label: 'Months Active', value: monthsActive, icon: CalendarClock, color: '#10b981' },
        { label: 'Avg Monthly Spend', value: `R${avgMonthly.toLocaleString()}`, icon: Receipt, color: '#f59e0b' },
        { label: 'Next Payment', value: totalEstimatedPrice > 0 ? `R${totalEstimatedPrice.toLocaleString()}` : 'Free', icon: CreditCard, color: '#8b5cf6' },
    ];

    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5">
            <div className="flex items-center gap-2 mb-4">
                <FileText size={15} style={{ color: accentColor }} />
                <h3 className="text-sm font-black text-slate-800 dark:text-white">Account Statement</h3>
                <span className="ml-auto text-[10px] text-slate-400">{schoolName}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
                {stats.map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="rounded-xl p-3 flex items-center gap-3"
                        style={{ background: `${color}10`, border: `1px solid ${color}20` }}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}20` }}>
                            <Icon size={14} style={{ color }} />
                        </div>
                        <div>
                            <p className="text-sm font-black text-slate-800 dark:text-white leading-none">{value}</p>
                            <p className="text-[9px] font-bold text-slate-400 mt-0.5 leading-tight">{label}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── CHANGE PLAN MODAL ────────────────────────────────────────────────────────
function ChangePlanModal({ targetPlan, currentTierId, billingCycle, studentCount, teacherCount, onConfirm, onCancel }) {
    const isUp = isTierUpgrade(currentTierId, targetPlan.id);
    const Icon = targetPlan.icon;
    const calculatedPrice = calculateSubscriptionTotal(targetPlan, studentCount, teacherCount, billingCycle);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-sm w-full border border-slate-100 dark:border-slate-700 shadow-2xl">
                <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-5 bg-gradient-to-br ${targetPlan.gradient}`}>
                    <Icon size={28} className="text-white" />
                </div>
                <h2 className="text-lg font-black text-slate-800 dark:text-white text-center mb-1">
                    {isUp ? 'Upgrade to' : 'Downgrade to'} {targetPlan.label}
                </h2>
                <p className="text-xs text-slate-400 text-center mb-6">
                    {isUp
                        ? `You'll be billed R${calculatedPrice.toLocaleString()}/month (${studentCount} students, ${teacherCount} teachers) starting today.`
                        : 'Your current plan remains active until the end of the billing period.'}
                </p>
                {isUp && (
                    <div className="rounded-xl p-4 mb-5"
                        style={{ background: `${targetPlan.accentColor}10`, border: `1px solid ${targetPlan.accentColor}25` }}>
                        <p className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: targetPlan.accentColor }}>
                            You'll gain access to
                        </p>
                        <ul className="space-y-1">
                            {targetPlan.features.slice(0, 4).map(f => (
                                <li key={f} className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                                    <CheckCircle2 size={10} style={{ color: targetPlan.accentColor }} />{f}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {!isUp && (
                    <div className="rounded-xl p-4 mb-5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                        <div className="flex items-start gap-2">
                            <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                            <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                                Downgrading may remove access to some features and restrict your limits. Data exceeding new limits won't be deleted.
                            </p>
                        </div>
                    </div>
                )}
                <div className="flex gap-3">
                    <button onClick={onCancel}
                        className="flex-1 py-3 rounded-xl text-xs font-black text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                        Cancel
                    </button>
                    <button onClick={() => onConfirm(targetPlan)}
                        className="flex-1 py-3 rounded-xl text-xs font-black text-white transition-opacity hover:opacity-90"
                        style={{ background: `linear-gradient(135deg, ${targetPlan.accentColor}, ${targetPlan.accentColor}cc)` }}>
                        {isUp ? 'Confirm Upgrade' : 'Confirm Downgrade'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export default function SubscriptionManager({ currentTier = 'free', schoolName, schoolId, school, onTierChange }) {
    const [billingCycle, setBillingCycle] = useState('monthly');
    const [activeSection, setActiveSection] = useState('plan');
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [pendingPlan, setPendingPlan] = useState(null);
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);

    // Quantity state for add-on allocations initialized from school parameters
    const [studentCount, setStudentCount] = useState(school?.studentLimit || school?.studentCount || 50);
    const [teacherCount, setTeacherCount] = useState(school?.teacherLimit || school?.teacherCount || 5);

    // Active tier state & billing history hooks
    const { tier: fetchedTierId } = useCurrentTier(schoolId);
    const activeTierId = fetchedTierId || currentTier;

    const { records: billingRecords, loading: billingLoading } = useBillingHistory(schoolId);

    // Configs derived from active tier
    const activeTierConfig = getTierConfig(activeTierId);
    const accentColor = activeTierConfig.accentColor;

    // Computed total price for active configuration
    const totalEstimatedPrice = useMemo(() => {
        return calculateSubscriptionTotal(activeTierConfig, studentCount, teacherCount, billingCycle);
    }, [activeTierConfig, studentCount, teacherCount, billingCycle]);

    // Next upgrade tier resolution
    const currentTierIndex = TIER_ORDER.indexOf(activeTierId);
    const nextTierId = TIER_ORDER[Math.min(currentTierIndex + 1, TIER_ORDER.length - 1)];
    const nextTierConfig = getTierConfig(nextTierId);

    // Calculate next billing date cleanly from school record
    const nextBillingDate = useMemo(() => {
        const raw = school?.nextBillingDate || school?.billingStartDate || school?.subscribedAt;
        if (!raw) {
            const d = new Date();
            d.setMonth(d.getMonth() + 1);
            return d;
        }
        const base = raw?.toDate?.() ? raw.toDate() : new Date(raw);
        const next = new Date(base);
        const now = new Date();
        while (next <= now) next.setMonth(next.getMonth() + 1);
        return next;
    }, [school?.nextBillingDate, school?.billingStartDate, school?.subscribedAt]);

    const handleConfirmChange = (plan) => {
        const price = calculateSubscriptionTotal(plan, studentCount, teacherCount, billingCycle);
        if (price > 0 || plan.id !== 'free') {
            setSelectedPlan(null);
            setPendingPlan({
                ...plan,
                studentCount,
                teacherCount,
                calculatedPrice: price,
            });
            setIsPaymentOpen(true);
        } else {
            // Free tier transition update direct
            onTierChange?.(plan.id);
            setSelectedPlan(null);
        }
    };

    const handleConfirmSeatCheckout = () => {
        setPendingPlan({
            ...activeTierConfig,
            studentCount,
            teacherCount,
            calculatedPrice: totalEstimatedPrice,
        });
        setIsPaymentOpen(true);
    };

    const sections = [
        { id: 'plan', label: 'Plan & Add-ons', icon: Zap },
        { id: 'billing', label: 'Billing', icon: CreditCard },
        { id: 'statement', label: 'Statement', icon: FileText },
    ];

    return (
        <div className="space-y-5">
            {/* Top Bar Header */}
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                        <Shield size={16} style={{ color: accentColor }} /> Subscriptions & Add-ons
                    </h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">Manage base tier, seat capacity & invoicing</p>
                </div>
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
                    {['monthly', 'annual'].map(cycle => (
                        <button key={cycle} onClick={() => setBillingCycle(cycle)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all capitalize ${billingCycle === cycle
                                ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                                : 'text-slate-400'}`}>
                            {cycle}
                            {cycle === 'annual' && <span className="ml-1 text-emerald-500">-20%</span>}
                        </button>
                    ))}
                </div>
            </div>

            {/* Active Plan Banner */}
            <div className="rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap"
                style={{ background: `linear-gradient(135deg, ${accentColor}15, ${accentColor}08)`, border: `1px solid ${accentColor}25` }}>
                <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br ${activeTierConfig.gradient} flex-shrink-0`}>
                        {React.createElement(activeTierConfig.icon, { size: 20, className: 'text-white' })}
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Current Subscription</p>
                        <p className="text-base font-black text-slate-800 dark:text-white">{activeTierConfig.label} Plan</p>
                        <p className="text-[10px] text-slate-400">
                            R{totalEstimatedPrice.toLocaleString()}/mo ({studentCount} Students, {teacherCount} Teachers)
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {activeTierId !== 'platinum' && (
                        <button
                            onClick={() => setSelectedPlan(nextTierConfig)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black text-white hover:opacity-90 transition-opacity"
                            style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)` }}>
                            <ArrowUpRight size={12} /> Upgrade to {nextTierConfig.label}
                        </button>
                    )}
                </div>
            </div>

            {/* Seat Add-ons & Capacity Adjustment Controls */}
            <AddonQuantitySelector
                studentCount={studentCount}
                setStudentCount={setStudentCount}
                teacherCount={teacherCount}
                setTeacherCount={setTeacherCount}
                activeTierConfig={activeTierConfig}
            />

            {/* Price Summary & Instant Update Banner */}
            <div className="rounded-2xl p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between flex-wrap gap-4 shadow-xl">
                <div>
                    <p className="text-[10px] text-indigo-200 font-extrabold uppercase tracking-wider">Calculated Billing Total</p>
                    <p className="text-2xl font-black mt-0.5">
                        R{totalEstimatedPrice.toLocaleString()} <span className="text-xs text-slate-300 font-normal">/ {billingCycle === 'annual' ? 'year (equivalent)' : 'month'}</span>
                    </p>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                        Includes {activeTierConfig.label} Base + {studentCount} Student Seats + {teacherCount} Teacher Seats
                    </p>
                </div>
                <button
                    onClick={handleConfirmSeatCheckout}
                    className="px-5 py-2.5 rounded-xl font-black text-xs text-slate-900 bg-emerald-400 hover:bg-emerald-300 transition-colors shadow-lg shadow-emerald-400/20"
                >
                    Update Seats & Checkout
                </button>
            </div>

            {/* Countdown timer card for active subscriptions */}
            {activeTierId !== 'free' && (
                <CountdownCard
                    nextBillingDate={nextBillingDate}
                    tierId={activeTierId}
                    accentColor={accentColor}
                    estimatedAmount={totalEstimatedPrice}
                />
            )}

            {/* Nav Tabs */}
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
                {sections.map(({ id, label, icon: Icon }) => (
                    <button key={id} onClick={() => setActiveSection(id)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-black transition-all ${activeSection === id
                            ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
                        <Icon size={11} />{label}
                    </button>
                ))}
            </div>

            {/* Tab Sections */}
            {activeSection === 'plan' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {TIERS.map(p => (
                        <PlanCard
                            key={p.id}
                            plan={p}
                            currentTierId={activeTierId}
                            onSelect={setSelectedPlan}
                            billingCycle={billingCycle}
                            studentCount={studentCount}
                            teacherCount={teacherCount}
                        />
                    ))}
                </div>
            )}

            {activeSection === 'billing' && (
                <BillingHistory records={billingRecords} loading={billingLoading} accentColor={accentColor} />
            )}

            {activeSection === 'statement' && (
                <AccountStatement
                    records={billingRecords}
                    currentTierId={activeTierId}
                    schoolName={schoolName}
                    billingCycle={billingCycle}
                    accentColor={accentColor}
                    totalEstimatedPrice={totalEstimatedPrice}
                />
            )}

            {/* Change Plan Modal */}
            {selectedPlan && (
                <ChangePlanModal
                    targetPlan={selectedPlan}
                    currentTierId={activeTierId}
                    billingCycle={billingCycle}
                    studentCount={studentCount}
                    teacherCount={teacherCount}
                    onConfirm={handleConfirmChange}
                    onCancel={() => setSelectedPlan(null)}
                />
            )}

            {/* Payment Modal Hand-off */}
            {isPaymentOpen && (
                <PaymentManager
                    schoolId={schoolId}
                    schoolName={schoolName}
                    currentTier={activeTierId}
                    initialTier={pendingPlan}
                    studentCount={studentCount}
                    teacherCount={teacherCount}
                    onClose={() => { setIsPaymentOpen(false); setPendingPlan(null); }}
                    onTierChange={(newTier) => {
                        onTierChange?.(newTier);
                        setIsPaymentOpen(false);
                        setPendingPlan(null);
                    }}
                />
            )}
        </div>
    );
}
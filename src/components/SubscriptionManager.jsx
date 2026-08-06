import React, { useState, useEffect, useMemo } from 'react';
import {
    ChevronDown, ChevronUp,
    ArrowUpRight, ArrowDownRight, CheckCircle2, XCircle,
    CreditCard, Receipt, FileText, Download,
    AlertTriangle, RefreshCw, CalendarClock, TrendingUp,
    Shield, Zap, Users, GraduationCap, Plus, Minus, UploadCloud, ShieldCheck, Sparkles, ArrowRight
} from 'lucide-react';
import {
    collection, query, where, orderBy, limit,
    onSnapshot, addDoc, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import {
    FREE_STUDENT_BASE,
    FREE_TEACHER_BASE,
    DEFAULT_EXAMS_PER_STUDENT,
    DEFAULT_EXAMS_PER_TEACHER,
    FREE_TIER_MONTHLY_LIMIT,
    DISCOUNTS,
    UNIT_PRICES,
    calculateSubscriptionQuote,
    calculateProratedUserAddon,
    calculateCustomUsageQuote
} from '../utils/tierConfig';
import PaymentManager from './PaymentManager';


/**
 * Triggers a browser print preview formatted as a downloadable PDF invoice/statement
 */
export function generatePDFDocument({ title, filename, contentHtml }) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Please allow popups to download your invoice/statement.');
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${title}</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 30px; color: #1e293b; }
                .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 20px; }
                .logo { font-size: 20px; font-weight: 900; color: #4f46e5; }
                .meta { text-align: right; font-size: 12px; color: #64748b; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background: #f8fafc; text-align: left; padding: 10px; font-size: 11px; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; }
                td { padding: 12px 10px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
                .total-row { font-weight: bold; font-size: 14px; background: #f8fafc; }
                .footer { margin-top: 40px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 15px; }
                @media print {
                    body { padding: 0; }
                }
            </style>
        </head>
        <body>
            ${contentHtml}
            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(() => window.close(), 500);
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
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


// BILLING HISTORY
function BillingHistory({ schoolId, schoolName = 'School', invoices }) {
    const { records: fetchedRecords, loading } = useBillingHistory ? useBillingHistory(schoolId) : { records: [], loading: false };
    const historyList = invoices ?? fetchedRecords ?? [];

    const handleDownloadInvoice = (item) => {
        const invoiceId = (item?.id || item?.invoiceId || 'INV-001').toString().slice(0, 8).toUpperCase();
        const dateStr = item?.date instanceof Date ? item.date.toLocaleDateString('en-ZA') : 'Recent';
        const amount = (item?.amount ?? item?.totalAmount ?? 0).toLocaleString();

        const contentHtml = `
            <div class="header">
                <div>
                    <div class="logo">ACADEMIC PLATFORM</div>
                    <p style="font-size: 12px; color: #64748b; margin-top: 4px;">Tax Invoice / Payment Receipt</p>
                </div>
                <div class="meta">
                    <p><strong>Invoice #:</strong> ${invoiceId}</p>
                    <p><strong>Date:</strong> ${dateStr}</p>
                    <p><strong>Status:</strong> ${item?.status?.toUpperCase() || 'PAID'}</p>
                </div>
            </div>
            <div style="margin-bottom: 20px; font-size: 12px;">
                <p><strong>Billed To:</strong> ${schoolName}</p>
                <p><strong>School ID:</strong> ${schoolId || 'N/A'}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Description</th>
                        <th>Allocated Qty</th>
                        <th style="text-align: right;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Student Seats Allocation (R32/seat)</td>
                        <td>${item?.studentCount || '—'} Seats</td>
                        <td style="text-align: right;">R${(item?.studentCost || 0).toLocaleString()}</td>
                    </tr>
                    <tr>
                        <td>Teacher Seats Allocation (R105/seat)</td>
                        <td>${item?.teacherCount || '—'} Seats</td>
                        <td style="text-align: right;">R${(item?.teacherCost || 0).toLocaleString()}</td>
                    </tr>
                    <tr class="total-row">
                        <td colspan="2">Total Paid (${item?.billingCycle || 'monthly'})</td>
                        <td style="text-align: right;">R${amount}</td>
                    </tr>
                </tbody>
            </table>
            <div class="footer">
                Thank you for your payment. If you have any questions, please contact support.
            </div>
        `;

        generatePDFDocument({
            title: `Invoice_${invoiceId}`,
            filename: `Invoice_${invoiceId}.pdf`,
            contentHtml,
        });
    };

    if (loading && historyList.length === 0) {
        return <div className="p-4 text-center text-xs text-slate-400 animate-pulse">Loading invoices...</div>;
    }

    if (historyList.length === 0) {
        return <div className="p-4 text-center text-xs text-slate-400">No invoices available.</div>;
    }

    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
                <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                    <Receipt size={16} className="text-indigo-500" /> Invoices & Receipts
                </h3>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {historyList.slice(0, 10).map((item, index) => {
                    const displayId = (item?.id || item?.invoiceId || `INV-${index}`).toString().slice(0, 8).toUpperCase();
                    const formattedDate = item?.date instanceof Date ? item.date.toLocaleDateString() : 'Recent';

                    return (
                        <div key={item?.id || index} className="py-3 flex items-center justify-between text-xs">
                            <div>
                                <p className="font-bold text-slate-700 dark:text-slate-200">Invoice #{displayId}</p>
                                <p className="text-[10px] text-slate-400">{formattedDate}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="text-right">
                                    <p className="font-black text-slate-800 dark:text-white">
                                        R{(item?.amount ?? item?.totalAmount ?? 0).toLocaleString()}
                                    </p>
                                    <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${item?.status === 'paid'
                                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                        : 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                                        }`}>
                                        {item?.status || 'completed'}
                                    </span>
                                </div>

                                {/* Download Invoice Button */}
                                <button
                                    onClick={() => handleDownloadInvoice(item)}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-[11px] font-bold transition-all active:scale-95"
                                >
                                    <Download size={13} /> Invoice
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── COUNTDOWN HOOK ───────────────────────────────────────────────────────────
function useCountdown(targetDate) {
    const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

    useEffect(() => {
        if (!targetDate) return;

        const calc = () => {
            const target = targetDate?.toDate ? targetDate.toDate() : new Date(targetDate);
            const diff = target - new Date();

            if (diff <= 0) {
                setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
                return;
            }

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
export function CountdownCard({
    nextBillingDate,
    accentColor = '#6366f1',
    estimatedAmount = 0,
    studentCount = FREE_STUDENT_BASE,
    teacherCount = FREE_TEACHER_BASE,
    monthlyUploadLimit = 0,
    billingCycle = 'monthly'
}) {
    // 1. Calculate dynamic renewal date based on selected billingCycle duration
    const targetBillingDate = useMemo(() => {
        // Fallback to current date if nextBillingDate is undefined/null
        const baseDate = nextBillingDate
            ? new Date(nextBillingDate?.toDate ? nextBillingDate.toDate() : nextBillingDate)
            : new Date();

        // If nextBillingDate is provided from existing active sub, project from today for dynamic preview
        const projectedDate = new Date();

        switch (billingCycle) {
            case 'quarterly':
                projectedDate.setMonth(projectedDate.getMonth() + 3);
                break;
            case 'yearly':
                projectedDate.setFullYear(projectedDate.getFullYear() + 1);
                break;
            case 'monthly':
            default:
                projectedDate.setMonth(projectedDate.getMonth() + 1);
                break;
        }

        return projectedDate;
    }, [nextBillingDate, billingCycle]);

    // 2. Pass dynamic target date to countdown hook
    const t = useCountdown(targetBillingDate);

    // 3. Determine if current counts fall strictly within baseline limits
    const isFreeBaseline = studentCount <= (FREE_STUDENT_BASE || 0) && teacherCount <= (FREE_TEACHER_BASE || 0);

    // 4. Force payable amount to 0 if within baseline limits
    const displayAmount = isFreeBaseline ? 0 : estimatedAmount;

    // 5. Format display date string
    const formattedDate = targetBillingDate.toLocaleDateString('en-ZA', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    return (
        <div
            className="relative rounded-2xl p-5 overflow-hidden transition-all shadow-sm"
            style={{
                background: `linear-gradient(135deg, ${accentColor}15, ${accentColor}05)`,
                border: `1px solid ${accentColor}30`
            }}
        >
            {/* Ambient Background Glow */}
            <div
                className="absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-10 blur-xl pointer-events-none"
                style={{ background: accentColor }}
            />

            {/* Card Header & Financial Summary */}
            <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <CalendarClock size={15} style={{ color: accentColor }} />
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-600">
                            Next Subscription Renewal ({billingCycle})
                        </span>
                    </div>

                    <p className="text-sm font-black text-slate-800 dark:text-slate-100">
                        {formattedDate}
                    </p>

                    {/* Active Seat Allocation Subtitle */}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-600">
                            {studentCount} Students • {teacherCount} Teachers
                        </p>

                        {monthlyUploadLimit > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/50">
                                <UploadCloud size={11} /> {monthlyUploadLimit} uploads/mo
                            </span>
                        )}
                    </div>
                </div>

                {/* Amount / Trial Status */}
                <div className="text-right flex flex-col items-end">
                    {isFreeBaseline ? (
                        <div className="flex flex-col items-end">
                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2.5 py-1 rounded-full border border-emerald-300 dark:border-emerald-700">
                                <Sparkles size={12} /> Free Baseline Active
                            </span>
                            <span className="text-[10px] font-extrabold text-slate-400 mt-1">
                                R0.00 / {billingCycle}
                            </span>
                        </div>
                    ) : (
                        <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                Estimated Due ({billingCycle})
                            </p>
                            <p className="text-xl font-black text-slate-900 dark:text-emerald-400">
                                R{displayAmount.toLocaleString()}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Countdown Digits */}
            <div className="grid grid-cols-4 gap-2">
                {[
                    { value: t?.days, label: 'Days' },
                    { value: t?.hours, label: 'Hours' },
                    { value: t?.minutes, label: 'Mins' },
                    { value: t?.seconds, label: 'Secs' },
                ].map(({ value, label }) => (
                    <div
                        key={label}
                        className="bg-white/80 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700/60 rounded-xl p-2.5 text-center backdrop-blur-sm shadow-xs"
                    >
                        <p className="text-xl font-black tabular-nums text-slate-900 dark:text-white leading-none">
                            {String(value ?? 0).padStart(2, '0')}
                        </p>
                        <p className="text-[9px] font-black uppercase tracking-wider mt-1" style={{ color: accentColor }}>
                            {label}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── ADDON QUANTITY SELECTOR ──────────────────────────────────────────────────

/**
 * Calculates graduated student pricing ONLY for seats above the free baseline (10 free).
 */
export function calculateTieredStudentCost(totalStudents) {
    const total = Math.max(FREE_STUDENT_BASE, parseInt(totalStudents, 10) || FREE_STUDENT_BASE);
    const paidStudents = total - FREE_STUDENT_BASE;

    if (paidStudents <= 0) {
        return {
            totalCost: 0,
            effectiveRate: 0,
            paidStudents: 0,
            activeTierLabel: 'Free Trial (10 Seats)'
        };
    }

    let remaining = paidStudents;
    let totalCost = 0;

    // Tier 1: 1 - 150 paid seats @ R32
    const t1 = Math.min(remaining, 150);
    totalCost += t1 * 32;
    remaining -= t1;

    // Tier 2: 151 - 500 paid seats @ R26
    if (remaining > 0) {
        const t2 = Math.min(remaining, 350);
        totalCost += t2 * 26;
        remaining -= t2;
    }

    // Tier 3: 501 - 1000 paid seats @ R20
    if (remaining > 0) {
        const t3 = Math.min(remaining, 500);
        totalCost += t3 * 20;
        remaining -= t3;
    }

    // Tier 4: 1001+ paid seats @ R16
    if (remaining > 0) {
        totalCost += remaining * 16;
    }

    const effectiveRate = (totalCost / total).toFixed(2);

    let activeTierLabel = 'R32/paid seat';
    if (paidStudents > 1000) activeTierLabel = 'Enterprise Tier (R16/seat floor)';
    else if (paidStudents > 500) activeTierLabel = 'Tier 3 Volume (R20/seat)';
    else if (paidStudents > 150) activeTierLabel = 'Tier 2 Volume (R26/seat)';

    return { totalCost, effectiveRate, paidStudents, activeTierLabel };
}

export function AddonQuantitySelector({
    studentCount = FREE_STUDENT_BASE,
    setStudentCount,
    teacherCount = FREE_TEACHER_BASE,
    setTeacherCount,
    teacherRate = 105
}) {
    const [studentInput, setStudentInput] = useState(String(studentCount));
    const [teacherInput, setTeacherInput] = useState(String(teacherCount));

    useEffect(() => {
        setStudentInput(String(Math.max(FREE_STUDENT_BASE, studentCount)));
    }, [studentCount]);

    useEffect(() => {
        setTeacherInput(String(Math.max(FREE_TEACHER_BASE, teacherCount)));
    }, [teacherCount]);

    // ─── Student Handlers ───
    const handleStudentInputChange = (e) => {
        const raw = e.target.value;
        setStudentInput(raw);
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed) && parsed >= FREE_STUDENT_BASE) {
            setStudentCount(parsed);
        }
    };

    const handleStudentBlur = () => {
        const parsed = parseInt(studentInput, 10);
        if (isNaN(parsed) || parsed < FREE_STUDENT_BASE) {
            setStudentCount(FREE_STUDENT_BASE);
            setStudentInput(String(FREE_STUDENT_BASE));
        } else {
            setStudentCount(parsed);
            setStudentInput(String(parsed));
        }
    };

    // ─── Teacher Handlers ───
    const handleTeacherInputChange = (e) => {
        const raw = e.target.value;
        setTeacherInput(raw);
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed) && parsed >= FREE_TEACHER_BASE) {
            setTeacherCount(parsed);
        }
    };

    const handleTeacherBlur = () => {
        const parsed = parseInt(teacherInput, 10);
        if (isNaN(parsed) || parsed < FREE_TEACHER_BASE) {
            setTeacherCount(FREE_TEACHER_BASE);
            setTeacherInput(String(FREE_TEACHER_BASE));
        } else {
            setTeacherCount(parsed);
            setTeacherInput(String(parsed));
        }
    };

    const activeStudents = parseInt(studentInput, 10) || FREE_STUDENT_BASE;
    const activeTeachers = parseInt(teacherInput, 10) || FREE_TEACHER_BASE;

    const studentPricing = calculateTieredStudentCost(activeStudents);
    const paidTeachers = Math.max(0, activeTeachers - FREE_TEACHER_BASE);
    const totalTeacherCost = paidTeachers * teacherRate;

    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
                <div>
                    <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                        <Users size={16} className="text-indigo-500" /> Dynamic Seat Allocations
                    </h3>
                    <p className="text-[11px] text-slate-400">Includes 10 Students + 2 Teachers free during trial</p>
                </div>
                <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800/50">
                    <Sparkles size={12} /> Free Baseline Active
                </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* ─── STUDENTS CONTROL WITH BASELINE ─── */}
                <div className="rounded-xl p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700 flex flex-col justify-between space-y-3">
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <GraduationCap size={16} className="text-violet-500" />
                                <span className="text-xs font-black text-slate-700 dark:text-slate-200">Student Seats</span>
                            </div>
                            <span className="text-[10px] font-extrabold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 px-2 py-0.5 rounded-full border border-violet-200 dark:border-violet-800/50">
                                {studentPricing.activeTierLabel}
                            </span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                            10 Free Baseline + <span className="font-bold text-slate-600 dark:text-slate-300">{studentPricing.paidStudents} Paid Seats</span>
                        </p>
                    </div>

                    {/* Numeric Input & Step Controls */}
                    <div className="flex items-center justify-between gap-2 pt-2">
                        <div className="flex gap-1">
                            <button
                                type="button"
                                onClick={() => {
                                    const next = Math.max(FREE_STUDENT_BASE, activeStudents - 50);
                                    setStudentCount(next);
                                    setStudentInput(String(next));
                                }}
                                disabled={activeStudents <= FREE_STUDENT_BASE}
                                className="px-2 h-9 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white disabled:opacity-40 transition-colors"
                            >
                                -50
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const next = Math.max(FREE_STUDENT_BASE, activeStudents - 10);
                                    setStudentCount(next);
                                    setStudentInput(String(next));
                                }}
                                disabled={activeStudents <= FREE_STUDENT_BASE}
                                className="w-9 h-9 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 font-bold transition-colors"
                            >
                                <Minus size={14} />
                            </button>
                        </div>

                        {/* Editable Number Input */}
                        <div className="text-center">
                            <input
                                type="number"
                                min={FREE_STUDENT_BASE}
                                value={studentInput}
                                onChange={handleStudentInputChange}
                                onBlur={handleStudentBlur}
                                className="w-24 text-center text-xl font-black text-slate-800 dark:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 rounded-xl py-1 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <span className="text-[10px] font-bold text-slate-400 block mt-1">
                                {studentPricing.totalCost === 0 ? 'R0.00 (Free Trial)' : `R${studentPricing.totalCost.toLocaleString()}/mo`}
                            </span>
                        </div>

                        <div className="flex gap-1">
                            <button
                                type="button"
                                onClick={() => {
                                    const next = activeStudents + 10;
                                    setStudentCount(next);
                                    setStudentInput(String(next));
                                }}
                                className="w-9 h-9 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold transition-colors"
                            >
                                <Plus size={14} />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const next = activeStudents + 50;
                                    setStudentCount(next);
                                    setStudentInput(String(next));
                                }}
                                className="px-2 h-9 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
                            >
                                +50
                            </button>
                        </div>
                    </div>

                    {/* Progress Indicator */}
                    <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/50">
                        <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1">
                            <span>10 Free</span>
                            <span>+150 (R32)</span>
                            <span>+500 (R26)</span>
                            <span>+1k (R20)</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-violet-500 via-indigo-500 to-emerald-400 transition-all duration-300"
                                style={{ width: `${Math.min(100, ((activeStudents - FREE_STUDENT_BASE) / 1000) * 100)}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* ─── TEACHERS CONTROL WITH BASELINE ─── */}
                <div className="rounded-xl p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700 flex flex-col justify-between space-y-3">
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <Users size={16} className="text-emerald-500" />
                                <span className="text-xs font-black text-slate-700 dark:text-slate-200">Teacher Seats</span>
                            </div>
                            <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/50">
                                {paidTeachers === 0 ? 'Free Trial' : `+${paidTeachers} Paid`}
                            </span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                            2 Free Baseline + <span className="font-bold text-slate-600 dark:text-slate-300">{paidTeachers} Additional</span>
                        </p>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => {
                                const next = Math.max(FREE_TEACHER_BASE, activeTeachers - 1);
                                setTeacherCount(next);
                                setTeacherInput(String(next));
                            }}
                            disabled={activeTeachers <= FREE_TEACHER_BASE}
                            className="w-9 h-9 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 font-bold transition-colors"
                        >
                            <Minus size={14} />
                        </button>

                        {/* Editable Teacher Input */}
                        <div className="text-center">
                            <input
                                type="number"
                                min={FREE_TEACHER_BASE}
                                value={teacherInput}
                                onChange={handleTeacherInputChange}
                                onBlur={handleTeacherBlur}
                                className="w-20 text-center text-xl font-black text-slate-800 dark:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 rounded-xl py-1 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <span className="text-[10px] font-bold text-slate-400 block mt-1">
                                {totalTeacherCost === 0 ? 'R0.00 (Free Trial)' : `R${totalTeacherCost.toLocaleString()}/mo`}
                            </span>
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                const next = activeTeachers + 1;
                                setTeacherCount(next);
                                setTeacherInput(String(next));
                            }}
                            className="w-9 h-9 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold transition-colors"
                        >
                            <Plus size={14} />
                        </button>
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/50 flex items-center justify-between text-[10px] text-slate-400">
                        <span className="flex items-center gap-1">
                            <ShieldCheck size={12} className="text-emerald-500" /> Baseline trial includes full PDF processing
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}


// DYNAMIC STANDARD USAGE CARD
export function DynamicUsageCard({ studentCount, teacherCount, billingCycle, onCheckout }) {
    const quote = calculateCustomUsageQuote(studentCount, teacherCount, billingCycle);

    const cycleLabelMap = {
        monthly: 'month',
        quarterly: 'quarter (3 months)',
        yearly: 'year (12 months)'
    };

    const cycleMonthsMap = {
        monthly: 1,
        quarterly: 3,
        yearly: 12
    };

    const isFreeBaseline = quote.isFreeBaseline;
    const months = cycleMonthsMap[billingCycle] || 1;

    // --- 1. DECLARE ALL BREAKDOWN VARIABLES ---
    const paidStudents = Math.max(0, studentCount - (FREE_STUDENT_BASE || 0));
    const paidTeachers = Math.max(0, teacherCount - (FREE_TEACHER_BASE || 0));

    const studentMonthlyCost = paidStudents * (UNIT_PRICES?.studentPerMonth || 0);
    const teacherMonthlyCost = paidTeachers * (UNIT_PRICES?.teacherPerMonth || 0);

    const handleProceedToCheckout = () => {
        onCheckout({
            ...quote,
            studentCount,
            teacherCount,
            billingCycle,
            action: isFreeBaseline ? 'ACTIVATE_FREE' : 'INITIATE_CHECKOUT'
        });
    };

    return (
        <div className="relative rounded-3xl p-6 sm:p-8 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xl max-w-2xl mx-auto transition-all">
            {/* Header Badge */}
            <div className="flex items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
                        <Sparkles size={22} />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-slate-800 dark:text-white leading-tight">
                            {isFreeBaseline ? 'Free Baseline Subscription' : 'Custom Usage Subscription'}
                        </h3>
                        <p className="text-xs text-slate-400 font-medium">
                            {isFreeBaseline
                                ? 'Default allocation for new school accounts'
                                : 'Tailored to your exact budget & school size'}
                        </p>
                    </div>
                </div>

                {isFreeBaseline ? (
                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700">
                        Free Baseline Active
                    </span>
                ) : quote.discountPercent > 0 && (
                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                        {quote.discountPercent}% Discount Applied
                    </span>
                )}
            </div>

            {/* Pricing Display */}
            <div className="mb-6 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
                        R{quote.monthlyEquivalent.toLocaleString()}
                    </span>
                    <span className="text-xs font-bold text-slate-400">/effective month (incl. VAT)</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
                    {isFreeBaseline
                        ? '100% Free baseline allocation. Add seats anytime as your school grows.'
                        : billingCycle === 'monthly'
                            ? 'Billed monthly. Adjust or cancel anytime.'
                            : `Billed as R${quote.periodTotal.toLocaleString()} per ${cycleLabelMap[billingCycle]}`}
                </p>
            </div>

            {/* Top Overview Cards */}
            <div className="space-y-3.5 mb-6">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Included Allocation & Line Items
                </h4>

                {/* Teachers Line */}
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/40">
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-700 dark:text-slate-200">
                        <Users size={16} className="text-indigo-500" />
                        <span>{teacherCount} Teacher Accounts</span>
                    </div>
                    <span className="text-xs font-black text-slate-900 dark:text-white">
                        {paidTeachers === 0
                            ? 'Free (Baseline)'
                            : `R${teacherMonthlyCost.toLocaleString()}/mo`}
                    </span>
                </div>

                {/* Students Line */}
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/40">
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-700 dark:text-slate-200">
                        <GraduationCap size={16} className="text-indigo-500" />
                        <span>{studentCount} Student Seats</span>
                    </div>
                    <span className="text-xs font-black text-slate-900 dark:text-white">
                        {paidStudents === 0
                            ? 'Free (Baseline)'
                            : `R${studentMonthlyCost.toLocaleString()}/mo`}
                    </span>
                </div>

                {/* Upload Allowance Line */}
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/40 border border-indigo-100 dark:border-indigo-950">
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-700 dark:text-slate-200">
                        <UploadCloud size={16} className="text-emerald-500" />
                        <span>Monthly Document Processing Limit</span>
                    </div>
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                        {quote.monthlyUploadLimit} Uploads / month
                    </span>
                </div>
            </div>

            {/* Total Billing Summary Reconciliation */}
            {!isFreeBaseline && (
                <div className="mb-8 p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 text-xs space-y-2.5">
                    <h5 className="font-black text-[11px] uppercase tracking-wider text-indigo-900 dark:text-indigo-200 border-b border-indigo-100 dark:border-indigo-900/40 pb-1.5">
                        Complete Cost Breakdown
                    </h5>

                    {/* 1. Teacher Seats Subtotal */}
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>
                            Teacher Accounts ({teacherCount} total
                            {paidTeachers > 0 ? `, ${paidTeachers} paid × R${UNIT_PRICES?.teacherPerMonth || 50}` : ' - Baseline Included'})
                        </span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                            R{teacherMonthlyCost.toLocaleString()}/mo
                        </span>
                    </div>

                    {/* 2. Student Seats Subtotal */}
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>
                            Student Seats ({studentCount} total
                            {paidStudents > 0 ? `, ${paidStudents} paid × R${UNIT_PRICES?.studentPerMonth || 5}` : ' - Baseline Included'})
                        </span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                            R{studentMonthlyCost.toLocaleString()}/mo
                        </span>
                    </div>


                    {/* 4. Platform Maintenance & Access Fee */}
                    <div className="flex justify-between items-center text-indigo-900 dark:text-indigo-200 font-medium">
                        <span>Platform Maintenance & Access Fee:</span>
                        <span className="font-bold">
                            {quote.isMaintenanceFeeApplied
                                ? `R${(quote.platformMaintenanceFeeAmount || 150).toLocaleString()}`
                                : `R${(quote.platformMaintenanceFeeAmount || 150).toLocaleString()}`}
                        </span>
                    </div>


                    {/* 6. Multi-Month Duration Subtotal */}
                    {months > 1 && (
                        <div className="flex justify-between text-slate-600 dark:text-slate-400">
                            <span>Billing Duration Subtotal ({months} months):</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                                R{quote.grossCycleSubtotal.toLocaleString()}
                            </span>
                        </div>
                    )}

                    {/* 7. Cycle Discount */}
                    {quote.discountPercent > 0 && (
                        <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                            <span>{quote.discountPercent}% Savings Discount:</span>
                            <span>-R{quote.discountAmount.toLocaleString()}</span>
                        </div>
                    )}



                    {/* 9. VAT / Tax Line */}
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>VAT / Tax ({quote.taxRatePercent}%):</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                            R{quote.taxAmount.toLocaleString()}
                        </span>
                    </div>

                    {/* 10. Final Total Billed */}
                    <div className="pt-2.5 border-t border-indigo-200 dark:border-indigo-800 flex justify-between font-black text-slate-900 dark:text-white text-sm">
                        <span>Total Billed Now ({cycleLabelMap[billingCycle]}):</span>
                        <span className="text-indigo-600 dark:text-indigo-400 text-base">
                            R{quote.periodTotal.toLocaleString()}
                        </span>
                    </div>
                </div>
            )}

            {/* Policy Notice */}
            <div className="space-y-2 mb-8 text-[11px] text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
                    <span>Instant access to tests, exams, and student analytics dashboards.</span>
                </div>
                <div className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
                    <span>Adjust student/teacher limits anytime during active term.</span>
                </div>
            </div>

            {/* Direct Checkout Button */}
            <button
                type="button"
                onClick={handleProceedToCheckout}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-xs font-black text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 transition-all shadow-lg shadow-indigo-500/25 active:scale-[0.98]"
            >
                {isFreeBaseline ? (
                    <>
                        <CheckCircle2 size={16} />
                        Activate Free Baseline Plan
                    </>
                ) : (
                    <>
                        <CreditCard size={16} />
                        Proceed to Checkout (R{quote.periodTotal.toLocaleString()})
                        <ArrowRight size={14} className="ml-1" />
                    </>
                )}
            </button>
        </div>
    );
}

// ─── ACCOUNT STATEMENT ────────────────────────────────────────────────────────
export function AccountStatement({
    schoolId,
    schoolName = 'School',
    records = [],
    currentQuote
}) {
    const studentCount = currentQuote?.studentCount ?? FREE_STUDENT_BASE;
    const teacherCount = currentQuote?.teacherCount ?? FREE_TEACHER_BASE;
    const rawPeriodTotal = currentQuote?.periodTotal ?? currentQuote?.totalCost ?? 0;
    const billingCycle = currentQuote?.billingCycle || 'monthly';

    // 1. Determine trial status purely from seat capacity thresholds
    const isFreeBaseline = studentCount <= FREE_STUDENT_BASE && teacherCount <= FREE_TEACHER_BASE;

    // 2. Override payable total to 0 if within baseline limits
    const displayTotal = isFreeBaseline ? 0 : rawPeriodTotal;

    const handleDownloadStatement = () => {
        const todayStr = new Date().toLocaleDateString('en-ZA');

        const rowsHtml = records.map((r, index) => {
            const invoiceId = (r?.id || r?.invoiceId || `INV-${index}`).toString().slice(0, 8).toUpperCase();

            let formattedDate = 'Recent';
            if (r?.date?.toDate && typeof r.date.toDate === 'function') {
                formattedDate = r.date.toDate().toLocaleDateString('en-ZA');
            } else if (r?.date instanceof Date) {
                formattedDate = r.date.toLocaleDateString('en-ZA');
            } else if (typeof r?.date === 'string') {
                formattedDate = new Date(r.date).toLocaleDateString('en-ZA');
            }

            const amount = (r?.amount ?? r?.totalAmount ?? 0).toLocaleString();
            return `
                <tr>
                    <td>${formattedDate}</td>
                    <td>Invoice #${invoiceId}</td>
                    <td>${r?.status?.toUpperCase() || 'PAID'}</td>
                    <td style="text-align: right;">R${amount}</td>
                </tr>
            `;
        }).join('');

        const paidStudents = Math.max(0, studentCount - FREE_STUDENT_BASE);
        const paidTeachers = Math.max(0, teacherCount - FREE_TEACHER_BASE);

        const contentHtml = `
            <div class="header">
                <div>
                    <div class="logo">${schoolName.toUpperCase()}</div>
                    <p style="font-size: 12px; color: #64748b; margin-top: 4px;">Official Account Billing Statement</p>
                </div>
                <div class="meta">
                    <p><strong>Statement Date:</strong> ${todayStr}</p>
                    <p><strong>School ID:</strong> ${schoolId || 'N/A'}</p>
                    <p><strong>Account Status:</strong> ${isFreeBaseline ? 'FREE TRIAL BASELINE' : 'ACTIVE SUBSCRIPTION'}</p>
                </div>
            </div>

            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
                <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #1e293b;">Active Allocation Summary</h4>
                <p style="margin: 3px 0; font-size: 12px;">
                    <strong>Student Capacity:</strong> ${studentCount} Seats 
                    <span style="color: #64748b;">(10 Free Trial + ${paidStudents} Paid Volume Seats)</span>
                </p>
                <p style="margin: 3px 0; font-size: 12px;">
                    <strong>Teacher Capacity:</strong> ${teacherCount} Seats 
                    <span style="color: #64748b;">(2 Free Trial + ${paidTeachers} Paid Seats)</span>
                </p>
                <p style="margin: 3px 0; font-size: 12px;">
                    <strong>Current Subscription Total:</strong> 
                    ${isFreeBaseline ? '<span style="color: #059669; font-weight: bold;">R0.00 (Free Trial Baseline)</span>' : `R${displayTotal.toLocaleString()} / ${billingCycle}`}
                </p>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Reference / Invoice</th>
                        <th>Status</th>
                        <th style="text-align: right;">Amount Paid</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml.length > 0 ? rowsHtml : '<tr><td colspan="4" style="text-align:center; color: #94a3b8; padding: 20px;">No paid invoice transactions recorded (Free Trial Baseline).</td></tr>'}
                </tbody>
            </table>

            <div class="footer">
                This document is an automated statement of account generated on ${todayStr}.
            </div>
        `;

        if (typeof generatePDFDocument === 'function') {
            generatePDFDocument({
                title: `Statement_${schoolName}_${todayStr}`,
                filename: `Statement_${schoolName}.pdf`,
                contentHtml,
            });
        }
    };

    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-4">
                <div>
                    <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                        <FileText size={18} className="text-indigo-500" /> Account Statement
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">Download official account transactions and usage history</p>
                </div>

                <button
                    onClick={handleDownloadStatement}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black shadow-md shadow-indigo-500/20 transition-all active:scale-95"
                >
                    <Download size={15} /> Download Full Statement
                </button>
            </div>

            {/* Quick Summary Preview */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">School Account</p>
                    <p className="text-sm font-black text-slate-800 dark:text-white mt-1">{schoolName}</p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Active Allocations</p>
                    <p className="text-sm font-black text-slate-800 dark:text-white mt-1">
                        {studentCount} Students • {teacherCount} Teachers
                    </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Billing Cycle Equivalent</p>
                    {isFreeBaseline ? (
                        <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                            <Sparkles size={14} /> R0.00 (Free Trial)
                        </p>
                    ) : (
                        <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-1">
                            R{displayTotal.toLocaleString()} / {billingCycle}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export default function SubscriptionManager({ schoolName, schoolId, school, onTierChange }) {
    const [billingCycle, setBillingCycle] = useState('monthly');
    const [activeSection, setActiveSection] = useState('plan');
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [pendingQuote, setPendingQuote] = useState(null);

    // Quantity state for add-on allocations initialized from school parameters
    const [studentCount, setStudentCount] = useState(school?.studentLimit || school?.studentCount || 50);
    const [teacherCount, setTeacherCount] = useState(school?.teacherLimit || school?.teacherCount || 5);

    // Live calculated usage quote
    const currentQuote = useMemo(() => {
        return calculateCustomUsageQuote(studentCount, teacherCount, billingCycle);
    }, [studentCount, teacherCount, billingCycle]);

    // Convenient reference for legacy child components & condition checks
    const totalEstimatedPrice = currentQuote.periodTotal;
    const accentColor = '#6366f1';

    // Next billing date calculation
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

    const handleConfirmCheckout = (quote) => {
        setPendingQuote(quote);
        setIsPaymentOpen(true);
    };

    const sections = [
        { id: 'plan', label: 'Custom Plan & Usage', icon: Zap },
        { id: 'billing', label: 'Billing History', icon: CreditCard },
        { id: 'statement', label: 'Statement', icon: FileText },
    ];

    return (
        <div className="space-y-6">
            {/* Top Bar Header & Cycle Selector */}
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                        <Shield size={16} className="text-indigo-500" /> Usage-Based Subscription
                    </h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">Scale student seats, teacher seats, and automated upload capacity</p>
                </div>

                {/* Billing Cycle Selector */}
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
                    {[
                        { id: 'monthly', label: 'Monthly', discount: null },
                        { id: 'quarterly', label: 'Quarterly', discount: '-5%' },
                        { id: 'yearly', label: 'Yearly', discount: '-10%' }
                    ].map(({ id, label, discount }) => (
                        <button
                            key={id}
                            onClick={() => setBillingCycle(id)}
                            className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black transition-all ${billingCycle === id
                                ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                }`}
                        >
                            {label}
                            {discount && <span className="ml-1 text-emerald-500 font-extrabold">{discount}</span>}
                        </button>
                    ))}
                </div>
            </div>

            {/* Input Controls Component (Sliders/Counters with 10 Student / 2 Teacher Baseline) */}
            {typeof AddonQuantitySelector !== 'undefined' && (
                <AddonQuantitySelector
                    studentCount={studentCount}
                    setStudentCount={setStudentCount}
                    teacherCount={teacherCount}
                    setTeacherCount={setTeacherCount}
                />
            )}

            {/* Navigation Tabs */}
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-2xl p-1.5">
                {sections.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        onClick={() => setActiveSection(id)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all ${activeSection === id
                            ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                            }`}
                    >
                        <Icon size={14} />
                        <span>{label}</span>
                    </button>
                ))}
            </div>

            {/* Main Section: Dynamic Usage Card */}
            {activeSection === 'plan' && (
                <div className="pt-2">
                    <DynamicUsageCard
                        studentCount={studentCount}
                        teacherCount={teacherCount}
                        billingCycle={billingCycle}
                        totalEstimatedPrice={totalEstimatedPrice}
                        onCheckout={handleConfirmCheckout}
                    />
                </div>
            )}

            {/* Countdown Card (Always visible so baseline trial users can see their cycle & free status) */}
            {typeof CountdownCard !== 'undefined' && (
                <CountdownCard
                    nextBillingDate={nextBillingDate}
                    accentColor={accentColor}
                    estimatedAmount={totalEstimatedPrice}
                    studentCount={studentCount}
                    teacherCount={teacherCount}
                    monthlyUploadLimit={teacherCount * 4}
                    billingCycle={billingCycle}
                />
            )}

            {/* Billing History */}
            {activeSection === 'billing' && typeof BillingHistory !== 'undefined' && (
                <BillingHistory schoolId={schoolId} />
            )}

            {/* Account Statement */}
            {activeSection === 'statement' && typeof AccountStatement !== 'undefined' && (
                <AccountStatement
                    schoolId={schoolId}
                    schoolName={schoolName}
                    currentQuote={currentQuote || {
                        studentCount,
                        teacherCount,
                        periodTotal: totalEstimatedPrice,
                        billingCycle,
                        monthlyUploadLimit: teacherCount * 4
                    }}
                />
            )}

            {/* Payment Gateway Modal Hand-off */}
            {isPaymentOpen && typeof PaymentManager !== 'undefined' && (
                <PaymentManager
                    schoolId={schoolId}
                    schoolName={schoolName}
                    quote={pendingQuote}
                    onClose={() => { setIsPaymentOpen(false); setPendingQuote(null); }}
                    onSuccess={() => {
                        setIsPaymentOpen(false);
                        onTierChange?.('custom');
                    }}
                />
            )}
        </div>
    );
}
import { useState } from 'react';
import {
    CheckCircle2, CreditCard, Users, GraduationCap, UploadCloud, Sparkles, ArrowRight
} from 'lucide-react';
import {
    FREE_STUDENT_BASE,
    FREE_TEACHER_BASE,
    UNIT_PRICES,
    calculateCustomUsageQuote
} from './tierConfig';

// This is the single source of truth for the usage/pricing card. Import it
// wherever it's needed (SubscriptionManager.jsx, onboarding, etc.) instead
// of redefining it locally -- a second copy will silently drift out of
// sync with pricing.py the way the old inline version already had.
export function DynamicUsageCard({
    studentCount,
    teacherCount,
    billingCycle,
    onCheckout,
    // Loyalty status comes from GET /api/billing/loyalty/status (see
    // billingApi.getLoyaltyStatus), fetched by the parent and passed down --
    // this component doesn't talk to the backend itself.
    loyaltyStatus, // { active: boolean, cycleEnd?: string } | undefined | null
    onRedeemLoyaltyCode, // (code: string) => Promise<{ cycleEnd, ... }>
}) {
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
    // Loyalty overrides the locally-computed quote entirely -- the seat
    // slider math in calculateCustomUsageQuote has no idea about loyalty
    // cycles (it's a pure, synchronous estimate for live UI feedback), so
    // this component branches on the fetched status instead of the quote.
    const isLoyaltyPlan = Boolean(loyaltyStatus?.active);
    const months = cycleMonthsMap[billingCycle] || 1;

    // --- 1. DECLARE ALL BREAKDOWN VARIABLES ---
    const paidStudents = Math.max(0, studentCount - (FREE_STUDENT_BASE || 0));
    const paidTeachers = Math.max(0, teacherCount - (FREE_TEACHER_BASE || 0));

    const studentMonthlyCost = paidStudents * (UNIT_PRICES?.studentPerMonth || 0);
    const teacherMonthlyCost = paidTeachers * (UNIT_PRICES?.teacherPerMonth || 0);

    // --- Loyalty code entry state ---
    const [loyaltyCodeInput, setLoyaltyCodeInput] = useState('');
    const [isRedeeming, setIsRedeeming] = useState(false);
    const [redeemError, setRedeemError] = useState(null);

    const handleRedeemLoyaltyCode = async () => {
        if (!loyaltyCodeInput.trim() || !onRedeemLoyaltyCode) return;
        setIsRedeeming(true);
        setRedeemError(null);
        try {
            await onRedeemLoyaltyCode(loyaltyCodeInput.trim());
            setLoyaltyCodeInput('');
        } catch (err) {
            setRedeemError(err?.message || 'Could not redeem that code.');
        } finally {
            setIsRedeeming(false);
        }
    };

    const handleProceedToCheckout = () => {
        onCheckout({
            ...quote,
            studentCount,
            teacherCount,
            billingCycle,
            action: isFreeBaseline ? 'ACTIVATE_FREE' : 'INITIATE_CHECKOUT'
        });
    };

    const loyaltyCycleEndLabel = loyaltyStatus?.cycleEnd
        ? new Date(loyaltyStatus.cycleEnd).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
        : null;

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
                            {isLoyaltyPlan
                                ? 'Loyalty Access Active'
                                : isFreeBaseline
                                    ? 'Free Baseline Subscription'
                                    : 'Custom Usage Subscription'}
                        </h3>
                        <p className="text-xs text-slate-400 font-medium">
                            {isLoyaltyPlan
                                ? 'Full unlimited access via loyalty code'
                                : isFreeBaseline
                                    ? 'Default allocation for new school accounts'
                                    : 'Tailored to your exact budget & school size'}
                        </p>
                    </div>
                </div>

                {isLoyaltyPlan ? (
                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700">
                        Loyalty Code Active
                    </span>
                ) : isFreeBaseline ? (
                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700">
                        Free Baseline Active
                    </span>
                ) : quote.discountPercent > 0 && (
                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                        {quote.discountPercent}% Discount Applied
                    </span>
                )}
            </div>

            {/* Loyalty code entry — only shown when no loyalty cycle is active */}
            {!isLoyaltyPlan && onRedeemLoyaltyCode && (
                <div className="mb-6 p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/50">
                    <p className="text-xs font-bold text-amber-900 dark:text-amber-200 mb-2">
                        Have a loyalty code? Redeem it for unlimited, no-cost access this cycle.
                    </p>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={loyaltyCodeInput}
                            onChange={(e) => setLoyaltyCodeInput(e.target.value)}
                            placeholder="Enter loyalty code"
                            className="flex-1 px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                        <button
                            type="button"
                            onClick={handleRedeemLoyaltyCode}
                            disabled={isRedeeming || !loyaltyCodeInput.trim()}
                            className="px-4 py-2 rounded-xl text-xs font-black text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {isRedeeming ? 'Applying…' : 'Apply'}
                        </button>
                    </div>
                    {redeemError && (
                        <p className="text-[11px] font-bold text-red-600 dark:text-red-400 mt-2">{redeemError}</p>
                    )}
                </div>
            )}

            {/* Pricing Display */}
            <div className="mb-6 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
                        {isLoyaltyPlan ? 'R0' : `R${quote.monthlyEquivalent.toLocaleString()}`}
                    </span>
                    <span className="text-xs font-bold text-slate-400">
                        {isLoyaltyPlan ? '/effective month (loyalty)' : '/effective month (incl. VAT)'}
                    </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
                    {isLoyaltyPlan
                        ? loyaltyCycleEndLabel
                            ? `No charge, no limits. This cycle runs through ${loyaltyCycleEndLabel} — re-enter your code before then to keep access going.`
                            : 'No charge, no limits for this cycle. Re-apply your code each month to keep access active.'
                        : isFreeBaseline
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
                        {isLoyaltyPlan
                            ? 'Free (Loyalty)'
                            : paidTeachers === 0
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
                        {isLoyaltyPlan
                            ? 'Free (Loyalty)'
                            : paidStudents === 0
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
                        {isLoyaltyPlan ? 'Unlimited' : `${quote.monthlyUploadLimit} Uploads / month`}
                    </span>
                </div>
            </div>

            {/* Total Billing Summary Reconciliation */}
            {!isFreeBaseline && !isLoyaltyPlan && (
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
                    <span>
                        {isLoyaltyPlan
                            ? 'Loyalty access covers this billing cycle only — re-apply your code next cycle to continue.'
                            : 'Adjust student/teacher limits anytime during active term.'}
                    </span>
                </div>
            </div>

            {/* Direct Checkout Button */}
            {!isLoyaltyPlan && (
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
            )}
        </div>
    );
}
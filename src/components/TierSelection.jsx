import React from 'react';
import { calculateCustomUsageQuote, UNIT_PRICES, FREE_STUDENT_BASE, FREE_TEACHER_BASE } from '../utils/tierConfig';
import { CheckCircle2, CreditCard, Users, GraduationCap, UploadCloud, Sparkles, ArrowRight } from 'lucide-react';

export default function CustomSubscriptionCard({
    studentCount = FREE_STUDENT_BASE,
    teacherCount = FREE_TEACHER_BASE,
    billingCycle = 'annual',
    onCheckout,
    currentSubscription = {}
}) {
    // Calculate dynamic usage quote
    const quote = calculateCustomUsageQuote(studentCount, teacherCount, billingCycle);
    const isFreeBaseline = quote.isFreeBaseline;

    const paidStudents = Math.max(0, studentCount - FREE_STUDENT_BASE);
    const paidTeachers = Math.max(0, teacherCount - FREE_TEACHER_BASE);

    const handleProceedToCheckout = () => {
        if (onCheckout) {
            onCheckout({
                ...quote,
                studentCount,
                teacherCount,
                billingCycle,
                action: isFreeBaseline ? 'ACTIVATE_FREE' : 'INITIATE_CHECKOUT'
            });
        }
    };

    return (
        <div className="py-2 max-w-2xl mx-auto">
            <div className="relative rounded-3xl p-6 sm:p-8 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xl transition-all">
                {/* Header Badge */}
                <div className="flex items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white shadow-md flex-shrink-0">
                            <Sparkles size={22} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-slate-800 dark:text-white leading-tight">
                                {isFreeBaseline ? 'Free Baseline Subscription' : 'Custom Seat Subscription'}
                            </h3>
                            <p className="text-xs text-slate-400 font-medium mt-0.5">
                                Dynamically calculated for your school's exact capacity
                            </p>
                        </div>
                    </div>

                    {isFreeBaseline ? (
                        <span className="px-3.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700">
                            Free Trial Active
                        </span>
                    ) : quote.discountPercent > 0 && (
                        <span className="px-3.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                            {quote.discountPercent}% Savings Applied
                        </span>
                    )}
                </div>

                {/* Hero Price Summary */}
                <div className="mb-6 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
                            R{quote.monthlyEquivalent.toLocaleString()}
                        </span>
                        <span className="text-xs font-bold text-slate-400">/month</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
                        {isFreeBaseline
                            ? 'Free baseline allocation (up to 10 students & 2 teachers).'
                            : billingCycle === 'monthly'
                                ? 'Billed monthly. Scale seats up or down anytime.'
                                : `Billed as R${quote.totalCost.toLocaleString()} total per ${billingCycle === 'quarterly' ? '3 months' : 'year'}`}
                    </p>
                </div>

                {/* Seat & Quota Breakdown */}
                <div className="space-y-3 mb-8">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                        Current Seat & Usage Allocation
                    </h4>

                    {/* Teacher Line */}
                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/40">
                        <div className="flex items-center gap-3 text-xs font-bold text-slate-700 dark:text-slate-200">
                            <Users size={16} className="text-indigo-500" />
                            <span>{teacherCount} Teacher Accounts</span>
                        </div>
                        <span className="text-xs font-black text-slate-900 dark:text-white">
                            {paidTeachers === 0
                                ? 'Included Free'
                                : `R${(paidTeachers * UNIT_PRICES.teacherPerMonth).toLocaleString()}/mo`}
                        </span>
                    </div>

                    {/* Student Line */}
                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/40">
                        <div className="flex items-center gap-3 text-xs font-bold text-slate-700 dark:text-slate-200">
                            <GraduationCap size={16} className="text-indigo-500" />
                            <span>{studentCount} Student Seats</span>
                        </div>
                        <span className="text-xs font-black text-slate-900 dark:text-white">
                            {paidStudents === 0
                                ? 'Included Free'
                                : `R${(paidStudents * UNIT_PRICES.studentPerMonth).toLocaleString()}/mo`}
                        </span>
                    </div>

                    {/* Processing Limit Line */}
                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/40 border border-indigo-100 dark:border-indigo-950">
                        <div className="flex items-center gap-3 text-xs font-bold text-slate-700 dark:text-slate-200">
                            <UploadCloud size={16} className="text-emerald-500" />
                            <span>Monthly Document Upload Limit</span>
                        </div>
                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                            {quote.monthlyUploadLimit} Uploads / month
                        </span>
                    </div>
                </div>

                {/* Direct Action Button */}
                <button
                    type="button"
                    onClick={handleProceedToCheckout}
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-xs font-black text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 transition-all shadow-lg shadow-indigo-500/25 active:scale-[0.98]"
                >
                    {isFreeBaseline ? (
                        <>
                            <CheckCircle2 size={16} />
                            Activate Free Plan
                        </>
                    ) : (
                        <>
                            <CreditCard size={16} />
                            Proceed to Checkout
                            <ArrowRight size={14} className="ml-1" />
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
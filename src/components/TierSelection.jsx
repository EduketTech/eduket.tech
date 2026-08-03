import React from 'react';
import { TIERS, calculateSubscriptionQuote, isUpgrade, CYCLE_MONTHS } from '../utils/tierConfig';
import { CheckCircle2, ArrowUpRight, ArrowDownRight } from 'lucide-react';

// Helper to calculate total price using the backend-aligned quote engine
function calculateSubscriptionTotal(plan, studentCount, teacherCount, billingCycle) {
    if (plan.id === 'free') return 0;

    const quote = calculateSubscriptionQuote({
        students: plan.seats?.students ?? studentCount ?? 0,
        teachers: plan.seats?.teachers ?? teacherCount ?? 0,
        cycle: billingCycle,
    });

    return quote.totalDueNow;
}

// ─── PLAN CARD COMPONENT ─────────────────────────────────────────────────────
function PlanCard({ plan, currentTierId, onSelect, billingCycle, studentCount, teacherCount }) {
    const isCurrent = plan.id === currentTierId;
    const isUp = isUpgrade(currentTierId, plan.id);
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
                                        R{Math.round(calculatedPrice / CYCLE_MONTHS[billingCycle]).toLocaleString()}
                                    </span>
                                    <span className="text-xs font-bold text-slate-400">/month</span>
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1">
                                    {billingCycle === 'monthly'
                                        ? 'Billed monthly'
                                        : billingCycle === 'quarterly'
                                            ? `Billed as R${calculatedPrice.toLocaleString()} every 3 months`
                                            : `Billed as R${calculatedPrice.toLocaleString()} yearly`}
                                </p>
                            </div>
                        )}
                    </div>
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
                        onClick={() => onSelect(plan.id)}
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

// ─── MAIN TIER SELECTION GRID COMPONENT ──────────────────────────────────────
export default function TierSelection({ selected, current, onSelect, billingCycle, studentCount, teacherCount }) {
    return (
        <div className="py-2">
            {/* 3 Columns x 2 Rows Grid Container */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {TIERS.map((plan) => (
                    <PlanCard
                        key={plan.id}
                        plan={plan}
                        currentTierId={current}
                        onSelect={onSelect}
                        billingCycle={billingCycle}
                        studentCount={studentCount}
                        teacherCount={teacherCount}
                    />
                ))}
            </div>
        </div>
    );
}
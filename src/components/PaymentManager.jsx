import React, { useState, useEffect } from 'react';
import { getTierConfig, DISCOUNTS } from './../utils/tierConfig';
import { fetchPriceQuote, initiatePayment, formatCurrency } from './../services/billingApi';
import TierSelection from './TierSelection';
import { X, Loader2, AlertTriangle, ArrowLeft, ShieldCheck, Check } from 'lucide-react';

const PAYFAST_URL = "https://www.payfast.co.za/eng/process";

// ─── PAYMENT FORM COMPONENT ──────────────────────────────────────────────────
function PaymentForm({ tier, billingCycle, schoolId, schoolName, currentTier, onCancel, schoolData = {} }) {
    const [step, setStep] = useState('confirm'); // 'confirm' | 'paying' | 'error'
    const [quote, setQuote] = useState(null);
    const [quoteLoading, setQuoteLoading] = useState(true);
    const [quoteError, setQuoteError] = useState(null);

    // Load price quote safely on mount & when dependency props update
    useEffect(() => {
        let active = true;

        const loadQuote = async () => {
            setQuoteLoading(true);
            setQuoteError(null);

            // FIX: the tier being purchased drives seat count — a school's
            // *current* seat count should never override the price of the
            // *new* tier it's buying, or every tier quotes the same base.
            // schoolData only matters here for custom/negotiated packages
            // where a tier has no fixed seat preset at all.
            const studentCount = tier.seats?.students ?? schoolData?.studentCount ?? schoolData?.studentLimit ?? 0;
            const teacherCount = tier.seats?.teachers ?? schoolData?.teacherCount ?? schoolData?.teacherLimit ?? 0;
            const additionalExamPacks = schoolData?.additionalExamPacks || 0;

            try {
                // Backend (billing_routes.py) is authoritative — it expects
                // students/teachers/billingCycle/additionalExamPacks and
                // returns totalDueZar, subtotalBeforeDiscount, discountAmount,
                // monthlyEquivalent, addonExamPacksCost.
                const apiResponse = await fetchPriceQuote({
                    students: studentCount,
                    teachers: teacherCount,
                    billingCycle,
                    additionalExamPacks,
                }).catch(err => {
                    console.warn('[Billing Quote API Error]:', err);
                    return null;
                });

                if (!active) return;

                if (!apiResponse) {
                    setQuoteError('Unable to reach billing service — please try again.');
                    setQuote(null);
                    return;
                }

                setQuote({
                    chargeAmount: apiResponse.totalDueZar,
                    chargeCurrency: 'ZAR',
                    subtotalBeforeDiscount: apiResponse.subtotalBeforeDiscount,
                    discountApplied: apiResponse.discountAmount,
                    addonExamPacksCost: apiResponse.addonExamPacksCost ?? 0,
                    monthlyEquivalent: apiResponse.monthlyEquivalent,
                    studentSeats: apiResponse.students ?? studentCount,
                    teacherSeats: apiResponse.teachers ?? teacherCount,
                });
            } catch (err) {
                console.error('[Billing Quote Error]', err);
                if (active) setQuoteError('Unable to calculate total price.');
            } finally {
                if (active) setQuoteLoading(false);
            }
        };

        loadQuote();
        return () => { active = false; };
    }, [schoolId, tier.id, billingCycle, schoolData?.additionalExamPacks]);

    const handlePayfastPayment = async (e) => {
        e.preventDefault();
        if (quoteLoading || quoteError || !quote) return;
        setStep('paying');

        try {
            // Backend recalculates and derives the authoritative amount from
            // students/teachers/billingCycle/additionalExamPacks itself —
            // we don't send `amount` here, matching billing_initiate()'s
            // actual contract (client-supplied totals are never trusted).
            const { paymentData } = await initiatePayment({
                students: quote.studentSeats,
                teachers: quote.teacherSeats,
                billingCycle,
                additionalExamPacks: schoolData?.additionalExamPacks || 0,
            });

            // Construct DOM form outside React lifecycle to execute PayFast POST redirect
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = PAYFAST_URL;

            Object.entries(paymentData).forEach(([key, value]) => {
                if (value === undefined || value === null) return;
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = key;
                input.value = String(value);
                form.appendChild(input);
            });

            document.body.appendChild(form);
            form.submit();
        } catch (err) {
            console.error('[PayFast Error]', err);
            setStep('error');
        }
    };

    return (
        <div className="space-y-6">
            {/* Header Navigation */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <button
                    onClick={onCancel}
                    className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
                >
                    <ArrowLeft size={14} /> Back to plan selection
                </button>
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 px-3 py-1 rounded-full">
                    <ShieldCheck size={13} /> Secure PayFast Gateway
                </div>
            </div>

            {/* Plan Breakdown Card */}
            <div className="rounded-2xl p-5 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Selected Package</span>
                        <h3 className="text-xl font-black text-slate-800 dark:text-white mt-0.5">{tier.label} Package</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 capitalize mt-0.5">
                            {billingCycle} billing cycle ({quote?.studentSeats ?? tier.seats?.students ?? 0} students, {quote?.teacherSeats ?? tier.seats?.teachers ?? 0} teachers)
                        </p>
                    </div>

                    <div className="text-right">
                        {quoteLoading ? (
                            <div className="flex items-center gap-2 text-slate-400 py-1">
                                <Loader2 size={16} className="animate-spin" />
                                <span className="text-xs font-bold">Calculating...</span>
                            </div>
                        ) : quoteError ? (
                            <p className="text-xs text-red-500 font-bold">Pricing unavailable</p>
                        ) : !quote ? (
                            <p className="text-xs text-slate-400 font-bold">—</p>
                        ) : (
                            <div>
                                <p className="text-[11px] text-slate-400">
                                    Base subscription: {formatCurrency(quote.subtotalBeforeDiscount, 'ZAR')}
                                </p>
                                {quote.discountApplied > 0 && (
                                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                                        − {formatCurrency(quote.discountApplied, 'ZAR')} ({(DISCOUNTS[billingCycle] ?? 0) * 100}% {billingCycle} discount)
                                    </p>
                                )}
                                {quote.addonExamPacksCost > 0 && (
                                    <p className="text-[11px] text-slate-400">
                                        + {formatCurrency(quote.addonExamPacksCost, 'ZAR')} exam add-ons
                                    </p>
                                )}
                                <p className="text-2xl font-black text-slate-800 dark:text-white mt-1">
                                    {formatCurrency(quote.chargeAmount, quote.chargeCurrency)}
                                </p>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                    ~{formatCurrency(quote.monthlyEquivalent, 'ZAR')}/month
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Quick Feature Highlights */}
                {tier.features && (
                    <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-slate-700/60 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {tier.features.slice(0, 4).map((feature, i) => (
                            <div key={i} className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                                <Check size={12} className="text-emerald-500 shrink-0" />
                                <span>{feature}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Error Messages */}
            {quoteError && (
                <div className="rounded-xl p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                        {quoteError} — please refresh and try again, or contact support if this issue persists.
                    </p>
                </div>
            )}

            {step === 'error' && (
                <div className="rounded-xl p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                        Failed to initiate checkout with PayFast. Please verify your internet connection and try again.
                    </p>
                </div>
            )}

            {/* Pay Button */}
            <button
                onClick={handlePayfastPayment}
                disabled={step === 'paying' || quoteLoading || !!quoteError || !quote}
                className="w-full py-4 rounded-2xl font-black text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
                {step === 'paying' ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Redirecting to PayFast...</span>
                    </>
                ) : quoteLoading ? (
                    'Calculating final price...'
                ) : !quote ? (
                    'Pricing unavailable'
                ) : (
                    `Proceed to Pay ${formatCurrency(quote.chargeAmount, quote.chargeCurrency)}`
                )}
            </button>
        </div>
    );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function PaymentManager({ schoolId, schoolName, currentTier, onClose, initialTier = null, schoolData = {} }) {
    const [view, setView] = useState(initialTier ? 'payment' : 'plans');
    const [selectedTier, setSelectedTier] = useState(initialTier?.id || null);
    const [billingCycle, setBillingCycle] = useState('annual');

    const currentConfig = getTierConfig(currentTier);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
            <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">

                {/* Modal Header */}
                <div className="px-8 py-6 bg-gradient-to-r from-violet-600 to-indigo-600 flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-2xl font-black text-white">Subscription Billing</h2>
                        <p className="text-xs text-violet-100 font-medium mt-0.5">{schoolName || 'School Management'}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                        aria-label="Close modal"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Modal Content */}
                <div className="p-8 overflow-y-auto">
                    {view === 'plans' && (
                        <div className="mb-6 flex flex-wrap justify-between items-center gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                            <div className="text-xs font-black px-3.5 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                Current Plan: <span className="text-indigo-600 dark:text-indigo-400">{currentConfig.label}</span>
                            </div>
                            <div className="p-1 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center">
                                <button
                                    onClick={() => setBillingCycle('monthly')}
                                    className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${billingCycle === 'monthly' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500'}`}
                                >
                                    Monthly
                                </button>
                                <button
                                    onClick={() => setBillingCycle('quarterly')}
                                    className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${billingCycle === 'quarterly' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500'}`}
                                >
                                    Quarterly <span className="text-[10px] text-emerald-500 font-extrabold ml-1">-5%</span>
                                </button>
                                <button
                                    onClick={() => setBillingCycle('annual')}
                                    className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${billingCycle === 'annual' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500'}`}
                                >
                                    Annual <span className="text-[10px] text-emerald-500 font-extrabold ml-1">-10%</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {view === 'plans' && (
                        <TierSelection
                            selected={selectedTier || currentTier}
                            current={currentTier}
                            onSelect={(id) => { setSelectedTier(id); setView('payment'); }}
                            billingCycle={billingCycle}
                            schoolId={schoolId}
                            studentCount={schoolData?.studentCount}
                            teacherCount={schoolData?.teacherCount}
                        />
                    )}

                    {view === 'payment' && selectedTier && (
                        <PaymentForm
                            tier={getTierConfig(selectedTier)}
                            currentTier={currentTier}
                            billingCycle={billingCycle}
                            schoolId={schoolId}
                            schoolName={schoolName}
                            schoolData={schoolData}
                            onCancel={() => setView('plans')}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
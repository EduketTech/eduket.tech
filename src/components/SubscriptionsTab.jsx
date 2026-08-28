import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, ShieldCheck } from 'lucide-react';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import PaymentManager from './PaymentManager';

const db = getFirestore();
const auth = getAuth();

const fmtDate = (d) => d
    ? d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

export function SubscriptionsTab({ access, user }) {
    const [showCheckout, setShowCheckout] = useState(false);
    const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: false });

    // Single source of truth: access.state, as returned by computeAccess()
    // in ParentDashboard.jsx. Do NOT re-derive these from dates/fields that
    // may be absent on some branches of that function (e.g. `expired` never
    // carried a trialEnd in earlier versions) — that's what silently broke
    // the "Trial Expired" badge on a fresh page load after the earlier fix.
    const isSubscribed = access?.state === 'subscribed';
    const isTrialActive = access?.state === 'trial';
    const isExpired = access?.state === 'expired';

    // trialEnd is attached on every branch of computeAccess(), including
    // 'expired', so the countdown always has a stable value to read.
    const expiryDate = access?.trialEnd || null;

    // Countdown Timer Hook — purely cosmetic ticking display; does not
    // drive isSubscribed / isTrialActive / isExpired above.
    useEffect(() => {
        if (!expiryDate || isSubscribed) {
            setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
            return;
        }

        const updateTimer = () => {
            const targetTime = expiryDate instanceof Date ? expiryDate.getTime() : new Date(expiryDate).getTime();
            const now = Date.now();
            const distance = targetTime - now;

            if (distance <= 0) {
                setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
                return;
            }

            setTimeLeft({
                days: Math.floor(distance / 86400000),
                hours: Math.floor((distance % 86400000) / 3600000),
                minutes: Math.floor((distance % 3600000) / 60000),
                seconds: Math.floor((distance % 60000) / 1000),
                isExpired: false,
            });
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);

        return () => clearInterval(interval);
    }, [expiryDate, isSubscribed]);


    return (
        <div className="max-w-xl mx-auto space-y-4">
            {/* Status Header */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5">
                <div className="flex items-center justify-between mb-1">
                    <h2 className="text-sm font-black text-slate-800 dark:text-white">Your Plan</h2>

                    {isSubscribed && (
                        <span className="flex items-center gap-1 text-[9px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-lg">
                            <ShieldCheck size={11} /> Active Subscription
                        </span>
                    )}

                    {isTrialActive && (
                        <span className="flex items-center gap-1 text-[9px] font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-1 rounded-lg animate-pulse">
                            <Clock size={11} /> 14-Day Free Trial
                        </span>
                    )}

                    {isExpired && (
                        <span className="flex items-center gap-1 text-[9px] font-black text-rose-600 bg-rose-50 dark:bg-rose-500/10 px-2.5 py-1 rounded-lg">
                            <AlertTriangle size={11} /> Trial Expired
                        </span>
                    )}
                </div>

                <p className="text-xs text-slate-500 mt-1">
                    {isSubscribed && access?.subExpires && `Renews ${fmtDate(access.subExpires)}.`}
                    {isTrialActive && 'You have full access to all features during your 14-day trial period.'}
                    {isExpired && 'Your free trial has ended. Subscribe to unlock full access to learner profiles and scores.'}
                </p>
            </div>

            {/* Live Countdown Card (Shown while trial is active) */}
            {isTrialActive && expiryDate && (
                <div className="bg-gradient-to-r from-indigo-900 to-violet-900 text-white rounded-2xl p-5 shadow-sm">
                    <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-wider mb-2">
                        Trial Time Remaining
                    </p>
                    <div className="grid grid-cols-4 gap-2 text-center">
                        <div className="bg-white/10 backdrop-blur-md rounded-xl p-2">
                            <span className="text-xl font-black">{timeLeft.days}</span>
                            <span className="block text-[8px] uppercase text-indigo-200">Days</span>
                        </div>
                        <div className="bg-white/10 backdrop-blur-md rounded-xl p-2">
                            <span className="text-xl font-black">{timeLeft.hours}</span>
                            <span className="block text-[8px] uppercase text-indigo-200">Hours</span>
                        </div>
                        <div className="bg-white/10 backdrop-blur-md rounded-xl p-2">
                            <span className="text-xl font-black">{timeLeft.minutes}</span>
                            <span className="block text-[8px] uppercase text-indigo-200">Mins</span>
                        </div>
                        <div className="bg-white/10 backdrop-blur-md rounded-xl p-2">
                            <span className="text-xl font-black">{timeLeft.seconds}</span>
                            <span className="block text-[8px] uppercase text-indigo-200">Secs</span>
                        </div>
                    </div>
                </div>
            )}

            {showCheckout && (
                <PaymentManager
                    type="parent"
                    schoolName={user?.name || 'Parent Account'}
                    onClose={() => setShowCheckout(false)}
                />
            )}

            <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 p-6">
                <button
                    onClick={() => setShowCheckout(true)}
                    className="w-full py-3 rounded-xl text-white text-xs font-black bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-90 transition-all cursor-pointer"
                >
                    Subscribe Now
                </button>
                <p className="text-[9px] text-slate-400 text-center mt-3">
                    Secure payment via PayFast. Cancel anytime.
                </p>
            </div>
        </div>
    );
}

export default SubscriptionsTab;
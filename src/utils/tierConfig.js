import { Star, Zap, Sparkles, Crown, Gem } from 'lucide-react';
import { onSnapshot, doc } from "firebase/firestore";
import { db } from "./firebase";
import { useState, useEffect, useMemo } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// BACKEND-ALIGNED PRICING CONSTANTS (ZAR)
// ─────────────────────────────────────────────────────────────────────────────
export const PRICING_RATES = {
    studentMonthly: 72.0,
    teacherMonthly: 105.0,
    basePlatformMonthly: 500.0,
    extraExamPackPrice: 150.0,
    extraExamPackSize: 10,
};

export const DISCOUNTS = {
    monthly: 0.0,
    quarterly: 0.05,
    annual: 0.10,
};

export const CYCLE_MONTHS = {
    monthly: 1,
    quarterly: 3,
    annual: 12,
};

// Seat quota constants
export const DEFAULT_EXAMS_PER_STUDENT = 2;   // Monthly exam uploads per student seat
export const DEFAULT_EXAMS_PER_TEACHER = 2;   // Monthly exam uploads per teacher seat
export const FREE_TIER_MONTHLY_LIMIT = 4;    // Free/trial tier default monthly exam quota

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION QUOTE ENGINE (Exact match to Python calculate_subscription_quote)
// ─────────────────────────────────────────────────────────────────────────────
export function calculateSubscriptionQuote({
    students = 0,
    teachers = 0,
    cycle = 'annual',
    additionalExamPacks = 0
}) {
    const months = CYCLE_MONTHS[cycle] || 12;
    const discount = DISCOUNTS[cycle] ?? 0.10;

    // Monthly un-discounted costs
    const monthlyStudents = students * PRICING_RATES.studentMonthly;
    const monthlyTeachers = teachers * PRICING_RATES.teacherMonthly;
    const monthlyBase = PRICING_RATES.basePlatformMonthly;

    const monthlySubtotal = monthlyBase + monthlyStudents + monthlyTeachers;
    const periodSubtotal = monthlySubtotal * months;

    // Apply cycle discount (Quarterly 5%, Annual 10%)
    const discountAmount = periodSubtotal * discount;
    const periodTotal = periodSubtotal - discountAmount;

    // Optional AI Exam Add-ons
    const addonCost = additionalExamPacks * PRICING_RATES.extraExamPackPrice;
    const totalDue = periodTotal + addonCost;

    return {
        cycle,
        months,
        studentSeats: students,
        teacherSeats: teachers,
        monthlyEquivalent: Math.round((totalDue / months) * 100) / 100,
        subtotalBeforeDiscount: Math.round(periodSubtotal * 100) / 100,
        discountApplied: Math.round(discountAmount * 100) / 100,
        addonExamPacksCost: Math.round(addonCost * 100) / 100,
        totalDueNow: Math.round(totalDue * 100) / 100,
    };
}

/**
 * Calculates prorated seat additions mid-subscription (Mirrors Python calculate_prorated_user_addon)
 */
export function calculateProratedUserAddon({
    currentSeats = 0,
    additionalSeats = 0,
    seatType = 'student', // 'student' or 'teacher'
    cycle = 'annual',
    daysRemaining = 30,
    totalDaysInPeriod = 365
}) {
    const ratePerMonth = seatType === 'student' ? PRICING_RATES.studentMonthly : PRICING_RATES.teacherMonthly;
    const months = CYCLE_MONTHS[cycle] || 12;
    const discount = DISCOUNTS[cycle] ?? 0.10;

    const fullPeriodCost = (additionalSeats * ratePerMonth * months) * (1 - discount);
    const proratedAmount = (daysRemaining / totalDaysInPeriod) * fullPeriodCost;

    return {
        seatType,
        newSeatsAdded: additionalSeats,
        totalSeatsAfterUpdate: currentSeats + additionalSeats,
        daysRemaining,
        proratedAmountDue: Math.round(Math.max(proratedAmount, 0) * 100) / 100,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRESET SEAT PACKAGES (Calculated dynamically using backend rates)
// ─────────────────────────────────────────────────────────────────────────────
const calcMonthly = (s, t) => calculateSubscriptionQuote({ students: s, teachers: t, cycle: 'monthly' }).totalDueNow;
const calcAnnual = (s, t) => calculateSubscriptionQuote({ students: s, teachers: t, cycle: 'annual' }).totalDueNow;

export const TIERS = [
    {
        id: 'free',
        label: 'Free Trial',
        basePrice: 0,
        monthlyPrice: 0,
        annualPrice: 0,
        perSeatStudentRate: 0,
        perSeatTeacherRate: 0,
        includedStudents: 10,
        includedTeachers: 2,
        icon: Star,
        gradient: 'from-slate-400 to-slate-500',
        gradientBg: 'from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-750',
        accentColor: '#64748b',
        seats: { students: 10, teachers: 2 },
        features: ['10 Student seats', '2 Teacher seats', '4 Monthly exam uploads', 'Basic AI marking'],
    },
    {
        id: 'starter',
        label: 'Starter',
        basePrice: PRICING_RATES.basePlatformMonthly,
        monthlyPrice: calcMonthly(50, 2),
        annualPrice: calcAnnual(50, 2),
        perSeatStudentRate: PRICING_RATES.studentMonthly,
        perSeatTeacherRate: PRICING_RATES.teacherMonthly,
        includedStudents: 50,
        includedTeachers: 2,
        icon: Zap,
        gradient: 'from-blue-500 to-cyan-500',
        gradientBg: 'from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20',
        accentColor: '#3b82f6',
        seats: { students: 50, teachers: 2 },
        features: ['50 Student seats', '2 Teacher seats', '104 Monthly exam uploads', 'Audit log', 'Advanced AI marking'],
    },
    {
        id: 'growth',
        label: 'Growth',
        basePrice: PRICING_RATES.basePlatformMonthly,
        monthlyPrice: calcMonthly(150, 5),
        annualPrice: calcAnnual(150, 5),
        perSeatStudentRate: PRICING_RATES.studentMonthly,
        perSeatTeacherRate: PRICING_RATES.teacherMonthly,
        includedStudents: 150,
        includedTeachers: 5,
        icon: Sparkles,
        gradient: 'from-violet-500 to-purple-600',
        gradientBg: 'from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20',
        accentColor: '#8b5cf6',
        seats: { students: 150, teachers: 5 },
        features: ['150 Student seats', '5 Teacher seats', '310 Monthly exam uploads', 'Full audit log', 'Advanced analytics'],
        popular: true,
    },
    {
        id: 'institution',
        label: 'Institution',
        basePrice: PRICING_RATES.basePlatformMonthly,
        monthlyPrice: calcMonthly(500, 15),
        annualPrice: calcAnnual(500, 15),
        perSeatStudentRate: PRICING_RATES.studentMonthly,
        perSeatTeacherRate: PRICING_RATES.teacherMonthly,
        includedStudents: 500,
        includedTeachers: 15,
        icon: Crown,
        gradient: 'from-amber-400 to-orange-500',
        gradientBg: 'from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20',
        accentColor: '#f59e0b',
        seats: { students: 500, teachers: 15 },
        features: ['500 Student seats', '15 Teacher seats', '1,030 Monthly exam uploads', 'Full audit log', 'Advanced analytics', 'Priority email support'],
    },
    {
        id: 'enterprise',
        label: 'Enterprise',
        basePrice: PRICING_RATES.basePlatformMonthly,
        monthlyPrice: calcMonthly(1000, 20),
        annualPrice: calcAnnual(1000, 20),
        perSeatStudentRate: PRICING_RATES.studentMonthly,
        perSeatTeacherRate: PRICING_RATES.teacherMonthly,
        includedStudents: 1000,
        includedTeachers: 20,
        icon: Gem,
        gradient: 'from-cyan-400 to-indigo-600',
        gradientBg: 'from-cyan-50 to-indigo-50 dark:from-cyan-900/20 dark:to-indigo-900/20',
        accentColor: '#22d3ee',
        seats: { students: 1000, teachers: 20 },
        features: ['1000 Student seats', '20 Teacher seats', '2,040 Monthly exam uploads', 'Parent dashboard', 'Dedicated account manager', 'Custom AI model tuning'],
    }
];

export const TIER_ORDER = ['free', 'starter', 'growth', 'institution', 'enterprise'];

// ─── TIER HELPERS & FEATURE GATES ───────────────────────────────────────────

export function getTierConfig(tierId = 'free') {
    const normalized = tierId?.toLowerCase() || 'free';
    const legacyMap = { silver: 'starter', gold: 'growth', platinum: 'enterprise' };
    const targetId = legacyMap[normalized] || normalized;

    return TIERS.find(t => t.id === targetId) || TIERS[0];
}

export function getSchoolExamLimit(seats = {}) {
    const students = parseInt(seats.students || 0, 10);
    const teachers = parseInt(seats.teachers || 0, 10);

    if (students === 0 && teachers === 0) {
        return FREE_TIER_MONTHLY_LIMIT;
    }

    const calculated = (students * DEFAULT_EXAMS_PER_STUDENT) + (teachers * DEFAULT_EXAMS_PER_TEACHER);
    return Math.max(calculated, FREE_TIER_MONTHLY_LIMIT);
}

export const TIER_FEATURE_FLAGS = {
    enterprise: { parentDashboard: true },
    institution: { prioritySupport: true },
    growth: { advancedAnalytics: true },
};

export function hasFeature(tierId, flagKey) {
    const config = getTierConfig(tierId);
    return Boolean(TIER_FEATURE_FLAGS[config.id]?.[flagKey]);
}

export function canAccessParentDashboard(tierId) {
    return hasFeature(tierId, 'parentDashboard');
}

export function isFeatureAllowed(tierId, featureKey) {
    const config = getTierConfig(tierId);
    const levelIndex = TIER_ORDER.indexOf(config.id);
    const requiredIndex = TIER_ORDER.indexOf(featureKey?.toLowerCase());

    if (requiredIndex !== -1) {
        return levelIndex >= requiredIndex;
    }

    return hasFeature(tierId, featureKey);
}

// ─── INSTANCE MULTIPLIERS & USAGE HELPERS ───────────────────────────────────

export const INSTITUTION_TYPES = {
    PRIMARY: 'primary',
    SECONDARY: 'secondary',
    TERTIARY: 'tertiary',
};

export const INSTITUTION_MULTIPLIERS = {
    [INSTITUTION_TYPES.PRIMARY]: 1,
    [INSTITUTION_TYPES.SECONDARY]: 1.5,
    [INSTITUTION_TYPES.TERTIARY]: 2.25,
};

export function normalizeInstitutionType(raw) {
    if (!raw) return INSTITUTION_TYPES.PRIMARY;
    const v = raw.toString().toLowerCase();
    if (v.includes('university') || v.includes('college') || v.includes('tertiary') || v.includes('higher')) {
        return INSTITUTION_TYPES.TERTIARY;
    }
    if (v.includes('secondary') || v.includes('high')) {
        return INSTITUTION_TYPES.SECONDARY;
    }
    return INSTITUTION_TYPES.PRIMARY;
}

export function getInstitutionMultiplier(institutionType) {
    const normalized = normalizeInstitutionType(institutionType);
    return INSTITUTION_MULTIPLIERS[normalized] ?? 1;
}

export function isAtLimit(currentCount, maxLimit) {
    if (maxLimit === null || maxLimit === undefined) return false;
    return currentCount >= maxLimit;
}

export function getUsagePercent(currentCount, maxLimit) {
    if (!maxLimit) return 0;
    return Math.min(Math.round((currentCount / maxLimit) * 100), 100);
}

export function isUpgrade(currentTierId, newTierId) {
    return TIER_ORDER.indexOf(newTierId) > TIER_ORDER.indexOf(currentTierId);
}

export function getTierPrice(tierId, options = {}) {
    const { studentCount = 0, teacherCount = 0, billingCycle = 'annual', additionalExamPacks = 0 } = options;
    const quote = calculateSubscriptionQuote({
        students: studentCount,
        teachers: teacherCount,
        cycle: billingCycle,
        additionalExamPacks
    });
    return quote.totalDueNow;
}

// ─── REACT HOOKS ──────────────────────────────────────────────────────────────

export function useCurrentSubscription(schoolId) {
    const [subscription, setSubscription] = useState({
        status: 'unpaid',
        seats: { students: 0, teachers: 0 },
        examLimit: FREE_TIER_MONTHLY_LIMIT,
        loading: true,
    });

    useEffect(() => {
        if (!schoolId) {
            setSubscription(prev => ({ ...prev, loading: false }));
            return;
        }

        const unsubscribe = onSnapshot(doc(db, 'subscriptions', schoolId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const seats = data.seats || { students: data.studentCount || 0, teachers: data.teacherCount || 0 };
                const examLimit = data.customExamLimit ?? getSchoolExamLimit(seats);

                setSubscription({
                    status: data.status || 'unpaid',
                    seats,
                    examLimit,
                    loading: false,
                });
            } else {
                setSubscription({
                    status: 'unpaid',
                    seats: { students: 10, teachers: 2 },
                    examLimit: FREE_TIER_MONTHLY_LIMIT,
                    loading: false,
                });
            }
        }, (error) => {
            console.error("Error loading school subscription:", error);
            setSubscription(prev => ({ ...prev, loading: false }));
        });

        return () => unsubscribe();
    }, [schoolId]);

    return subscription;
}

export function useCurrentTier(schoolData = {}) {
    return useMemo(() => {
        const tierId = schoolData?.tier || 'free';
        const config = getTierConfig(tierId);

        return {
            tierId: config.id,
            config,
            isFree: config.id === 'free',
            isEnterprise: config.id === 'enterprise',
            studentLimit: schoolData?.studentLimit ?? schoolData?.studentCount ?? config.seats.students,
            teacherLimit: schoolData?.teacherLimit ?? schoolData?.teacherCount ?? config.seats.teachers,
            billingCycle: schoolData?.billingCycle || 'annual',
            status: schoolData?.subscriptionStatus || 'active',
        };
    }, [
        schoolData?.tier,
        schoolData?.studentLimit,
        schoolData?.studentCount,
        schoolData?.teacherLimit,
        schoolData?.teacherCount,
        schoolData?.billingCycle,
        schoolData?.subscriptionStatus
    ]);
}
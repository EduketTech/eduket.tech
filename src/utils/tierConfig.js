import { onSnapshot, doc, getDoc } from "firebase/firestore";
import { db, auth } from "./firebase";
import { useState, useEffect, useMemo } from "react";

export async function loadSchoolSubscription(schoolId) {
    // 1. Ensure user is authenticated and schoolId exists before making request
    if (!auth.currentUser || !schoolId) {
        return null;
    }

    try {
        const schoolRef = doc(db, "schools", schoolId);
        const docSnap = await getDoc(schoolRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            // Return embedded subscription or fallback
            return data.subscription || { tier: data.tier || 'free' };
        }
        return null;
    } catch (error) {
        console.error("Error loading school subscription:", error);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BASELINE & PRICING CONSTANTS (ZAR)
// ─────────────────────────────────────────────────────────────────────────────
export const FREE_STUDENT_BASE = 10;
export const FREE_TEACHER_BASE = 2;

export const PRICING_RATES = {
    studentMonthly: 32.0,
    teacherMonthly: 105.0,
    basePlatformMonthly: 500.0,
    extraExamPackPrice: 150.0,
    extraExamPackSize: 10,
};

export const UNIT_PRICES = {
    studentPerMonth: PRICING_RATES.studentMonthly,
    teacherPerMonth: PRICING_RATES.teacherMonthly,
    basePlatformPerMonth: PRICING_RATES.basePlatformMonthly,
    uploadsPerTeacher: 4,
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
export const DEFAULT_EXAMS_PER_TEACHER = 4;   // Monthly exam uploads per teacher seat
export const FREE_TIER_MONTHLY_LIMIT = 4;    // Free trial baseline monthly exam quota

// ─────────────────────────────────────────────────────────────────────────────
// BASELINE HELPER
// ─────────────────────────────────────────────────────────────────────────────
export function isFreeTrialBaseline(students = 0, teachers = 0) {
    return students <= FREE_STUDENT_BASE && teachers <= FREE_TEACHER_BASE;
}

// ─────────────────────────────────────────────────────────────────────────────
// DYNAMIC SUBSCRIPTION QUOTE ENGINE
// ─────────────────────────────────────────────────────────────────────────────
export function calculateSubscriptionQuote({
    students = 0,
    teachers = 0,
    cycle = 'annual',
    additionalExamPacks = 0
}) {
    const months = CYCLE_MONTHS[cycle] || 12;
    const discount = DISCOUNTS[cycle] ?? 0.10;

    // Check if within free baseline limits
    const isBaseline = isFreeTrialBaseline(students, teachers);

    let monthlySubtotal = 0;
    let periodSubtotal = 0;
    let discountAmount = 0;
    let periodTotal = 0;

    if (!isBaseline) {
        // Calculate charges for custom seats
        const monthlyStudents = calculateTieredStudentCost(students).totalCost;
        const monthlyTeachers = teachers * PRICING_RATES.teacherMonthly;
        const monthlyBase = PRICING_RATES.basePlatformMonthly;

        monthlySubtotal = monthlyBase + monthlyStudents + monthlyTeachers;
        periodSubtotal = monthlySubtotal * months;

        // Apply cycle discount (Quarterly 5%, Annual 10%)
        discountAmount = periodSubtotal * discount;
        periodTotal = periodSubtotal - discountAmount;
    }

    // Optional AI Exam Add-ons
    const addonCost = additionalExamPacks * PRICING_RATES.extraExamPackPrice;
    const totalDue = periodTotal + addonCost;

    return {
        cycle,
        months,
        studentSeats: students,
        teacherSeats: teachers,
        isFreeBaseline: isBaseline,
        monthlyEquivalent: isBaseline ? 0 : Math.round((totalDue / months) * 100) / 100,
        subtotalBeforeDiscount: Math.round(periodSubtotal * 100) / 100,
        discountApplied: Math.round(discountAmount * 100) / 100,
        addonExamPacksCost: Math.round(addonCost * 100) / 100,
        totalDueNow: Math.round(totalDue * 100) / 100,
        periodTotal: Math.round(periodTotal * 100) / 100,
    };
}

/**
 * Custom Usage Quote Wrapper for UI cards & checkout flows
 */

export const TAX_RATE = 0.15; // 15% VAT
export const PLATFORM_MAINTENANCE_FEE = 350; // Base Monthly Platform Maintenance Fee (R350/mo)

export function calculateCustomUsageQuote(studentCount = 0, teacherCount = 0, billingCycle = 'monthly') {
    const cycleMonthsMap = { monthly: 1, quarterly: 3, yearly: 12 };
    const months = cycleMonthsMap[billingCycle] || 1;

    // 1. Calculate paid seat counts above baseline
    const paidStudents = Math.max(0, studentCount - (FREE_STUDENT_BASE || 0));
    const paidTeachers = Math.max(0, teacherCount - (FREE_TEACHER_BASE || 0));

    // Free baseline flag: true if no additional paid seats were requested
    const isFreeBaseline = paidStudents <= 0 && paidTeachers <= 0;

    // 2. Base monthly seat costs (1-month single seat rate)
    const studentMonthlyCost = paidStudents * (UNIT_PRICES?.studentPerMonth || 0);
    const teacherMonthlyCost = paidTeachers * (UNIT_PRICES?.teacherPerMonth || 0);
    const rawSeatMonthly = teacherMonthlyCost + studentMonthlyCost;

    // 3. Dynamic Platform Maintenance Fee based on billing cycle (Monthly x1, Quarterly x3, Yearly x12)
    const maintenanceFeeForCycle = isFreeBaseline ? 0 : (PLATFORM_MAINTENANCE_FEE * months);
    const rawSeatCycle = rawSeatMonthly * months;

    // 4. Gross Cycle Subtotal before discounts (Applies cycle floor)
    const grossCycleSubtotal = isFreeBaseline
        ? 0
        : Math.max(rawSeatCycle, maintenanceFeeForCycle);

    const platformMonthlyFee = isFreeBaseline
        ? 0
        : grossCycleSubtotal / months;

    const isMaintenanceFeeApplied = !isFreeBaseline && rawSeatCycle < maintenanceFeeForCycle;

    // 5. Apply Cycle Discount (e.g. 10% for Quarterly, 20% for Yearly)
    const discountFraction = DISCOUNTS[billingCycle] || 0;
    const discountAmount = grossCycleSubtotal * discountFraction;
    const subtotalAfterDiscount = grossCycleSubtotal - discountAmount;

    // 6. Tax & Period Totals
    const taxAmount = isFreeBaseline ? 0 : subtotalAfterDiscount * TAX_RATE;
    const periodTotal = subtotalAfterDiscount + taxAmount;

    const monthlyUploadLimit = Math.max(
        (teacherCount * (DEFAULT_EXAMS_PER_TEACHER || 50)),
        (FREE_TIER_MONTHLY_LIMIT || 100)
    );

    return {
        studentCount,
        teacherCount,
        billingCycle,
        months,
        isFreeBaseline,
        rawSeatMonthly: Math.round(rawSeatMonthly),
        platformMonthlyFee: Math.round(platformMonthlyFee),
        platformMaintenanceFeeAmount: Math.round(maintenanceFeeForCycle), // Dynamically scaled (e.g. R350, R1050, or R4200)
        grossCycleSubtotal: Math.round(grossCycleSubtotal),
        discountPercent: Math.round(discountFraction * 100),
        discountAmount: Math.round(discountAmount),
        subtotalAfterDiscount: Math.round(subtotalAfterDiscount),
        taxRatePercent: Math.round(TAX_RATE * 100),
        taxAmount: Math.round(taxAmount),
        periodTotal: Math.round(periodTotal),
        totalCost: Math.round(periodTotal),
        monthlyEquivalent: Math.round(periodTotal / months),
        monthlyUploadLimit,
        isMaintenanceFeeApplied,
    };
}

/**
 * Calculates prorated seat additions mid-subscription
 */
export function calculateProratedUserAddon({
    currentSeats = 0, additionalSeats = 0, seatType = 'student',
    cycle = 'annual', daysRemaining = 30, totalDaysInPeriod = 365
}) {
    const months = CYCLE_MONTHS[cycle] || 12;
    const discount = DISCOUNTS[cycle] ?? 0.10;
    let fullPeriodCost;

    if (seatType === 'student') {
        const oldCost = calculateTieredStudentCost(currentSeats).totalCost;
        const newCost = calculateTieredStudentCost(currentSeats + additionalSeats).totalCost;
        const marginalMonthlyCost = newCost - oldCost;
        fullPeriodCost = (marginalMonthlyCost * months) * (1 - discount);
    } else {
        fullPeriodCost = (additionalSeats * PRICING_RATES.teacherMonthly * months) * (1 - discount);
    }

    const proratedAmount = (daysRemaining / totalDaysInPeriod) * fullPeriodCost;
    return {
        seatType, newSeatsAdded: additionalSeats,
        totalSeatsAfterUpdate: currentSeats + additionalSeats,
        daysRemaining,
        proratedAmountDue: Math.round(Math.max(proratedAmount, 0) * 100) / 100,
    };
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

// ─────────────────────────────────────────────────────────────────────────────
// INSTANCE MULTIPLIERS & USAGE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// REACT HOOKS
// ─────────────────────────────────────────────────────────────────────────────

export function useCurrentSubscription(schoolId) {
    const [subscription, setSubscription] = useState({
        status: 'unpaid',
        seats: { students: FREE_STUDENT_BASE, teachers: FREE_TEACHER_BASE },
        examLimit: FREE_TIER_MONTHLY_LIMIT,
        isFreeBaseline: true,
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
                const seats = data.seats || {
                    students: data.studentCount ?? FREE_STUDENT_BASE,
                    teachers: data.teacherCount ?? FREE_TEACHER_BASE
                };
                const examLimit = data.customExamLimit ?? getSchoolExamLimit(seats);
                const baseline = isFreeTrialBaseline(seats.students, seats.teachers);

                setSubscription({
                    status: data.status || 'unpaid',
                    seats,
                    examLimit,
                    isFreeBaseline: baseline,
                    loading: false,
                });
            } else {
                setSubscription({
                    status: 'unpaid',
                    seats: { students: FREE_STUDENT_BASE, teachers: FREE_TEACHER_BASE },
                    examLimit: FREE_TIER_MONTHLY_LIMIT,
                    isFreeBaseline: true,
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

export function useCurrentSubscriptionDetails(schoolData = {}) {
    return useMemo(() => {
        const studentCount = schoolData?.studentLimit ?? schoolData?.studentCount ?? FREE_STUDENT_BASE;
        const teacherCount = schoolData?.teacherLimit ?? schoolData?.teacherCount ?? FREE_TEACHER_BASE;
        const isFree = isFreeTrialBaseline(studentCount, teacherCount);

        return {
            isFreeBaseline: isFree,
            studentLimit: studentCount,
            teacherLimit: teacherCount,
            billingCycle: schoolData?.billingCycle || 'annual',
            status: schoolData?.subscriptionStatus || 'active',
        };
    }, [
        schoolData?.studentLimit,
        schoolData?.studentCount,
        schoolData?.teacherLimit,
        schoolData?.teacherCount,
        schoolData?.billingCycle,
        schoolData?.subscriptionStatus
    ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// GRADUATED STUDENT SEAT PRICING (volume discount above free baseline)
// ─────────────────────────────────────────────────────────────────────────────
export const STUDENT_PRICE_TIERS = [
    { upTo: 150, rate: 32 },   // paid seats 1–150
    { upTo: 500, rate: 26 },   // paid seats 151–500
    { upTo: 1000, rate: 20 },  // paid seats 501–1000
    { upTo: Infinity, rate: 16 }, // paid seats 1001+
];

export function calculateTieredStudentCost(totalStudents) {
    const total = Math.max(FREE_STUDENT_BASE, parseInt(totalStudents, 10) || FREE_STUDENT_BASE);
    const paidStudents = total - FREE_STUDENT_BASE;

    if (paidStudents <= 0) {
        return { totalCost: 0, effectiveRate: 0, paidStudents: 0, activeTierLabel: 'Free Trial (10 Seats)' };
    }

    let remaining = paidStudents;
    let prevCap = 0;
    let totalCost = 0;

    for (const { upTo, rate } of STUDENT_PRICE_TIERS) {
        if (remaining <= 0) break;
        const tierCapacity = upTo - prevCap;
        const seatsInTier = Math.min(remaining, tierCapacity);
        totalCost += seatsInTier * rate;
        remaining -= seatsInTier;
        prevCap = upTo;
    }

    const effectiveRate = (totalCost / total).toFixed(2);
    let activeTierLabel = 'R32/paid seat';
    if (paidStudents > 1000) activeTierLabel = 'Enterprise Tier (R16/seat floor)';
    else if (paidStudents > 500) activeTierLabel = 'Tier 3 Volume (R20/seat)';
    else if (paidStudents > 150) activeTierLabel = 'Tier 2 Volume (R26/seat)';

    return { totalCost, effectiveRate, paidStudents, activeTierLabel };
}
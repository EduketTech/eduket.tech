// ─── tierEnforcer.js ──────────────────────────────────────────────────────────
// Front-end guardrails & SweetAlert upgrade prompts for customized seat-based pricing.

import { doc, getDoc, collection, query, where, getCountFromServer } from 'firebase/firestore';
import { db } from './firebase';
import {
    getSchoolExamLimit,
    canAccessParentDashboard,
    FREE_TIER_MONTHLY_LIMIT,
    FREE_STUDENT_BASE,
    FREE_TEACHER_BASE
} from './tierLimits';
import Swal from 'sweetalert2';

// ─── Fetch School Subscription & Seats ───────────────────────────────────────

/**
 * Reads schools/{schoolId}.loyaltySubscription and returns whether it's
 * currently live. Mirrors is_loyalty_subscription_active() in pricing.py --
 * keep the two in sync if the cycle logic ever changes.
 */
function resolveLoyaltyStatus(schoolData) {
    const loyalty = schoolData?.loyaltySubscription;
    if (!loyalty?.active) {
        return { isLoyaltyActive: false, loyaltyCycleEnd: null };
    }

    // Firestore Timestamps come back with a .toDate(); a plain ISO string
    // (e.g. from a manual write) is handled too so this doesn't break if
    // the field was ever set outside the redeem_loyalty_code() flow.
    const cycleEnd = loyalty.cycleEnd?.toDate
        ? loyalty.cycleEnd.toDate()
        : (loyalty.cycleEnd ? new Date(loyalty.cycleEnd) : null);

    const isLoyaltyActive = Boolean(cycleEnd) && cycleEnd > new Date();

    return {
        isLoyaltyActive,
        loyaltyCycleEnd: isLoyaltyActive ? cycleEnd.toISOString() : null,
    };
}

/**
 * Fetches school subscription details and calculates allocated seats,
 * accounting for free baseline allocations if custom seats aren't set.
 *
 * A school with an active loyalty cycle short-circuits all of this and
 * gets unlimited seats/uploads for the duration of that cycle -- see
 * resolveLoyaltyStatus() above.
 */
export async function getSchoolSubscription(schoolId) {
    const defaultBaseline = {
        students: FREE_STUDENT_BASE || 10,
        teachers: FREE_TEACHER_BASE || 2
    };

    if (!schoolId) {
        return {
            status: 'unpaid',
            seats: defaultBaseline,
            purchasedSeats: { students: 0, teachers: 0 },
            examLimit: FREE_TIER_MONTHLY_LIMIT || 5,
            billingCycle: 'monthly',
            tierId: 'free',
            isLoyaltyActive: false,
            loyaltyCycleEnd: null,
        };
    }

    try {
        // Fetch the subscription doc and the school doc together -- we need
        // the school doc regardless of which branch we end up in, both for
        // the loyalty check and for the existing embedded-subscription
        // fallback below.
        const [subSnap, schoolSnap] = await Promise.all([
            getDoc(doc(db, 'subscriptions', schoolId)),
            getDoc(doc(db, 'schools', schoolId)),
        ]);

        const schoolData = schoolSnap.exists() ? schoolSnap.data() : null;
        const { isLoyaltyActive, loyaltyCycleEnd } = resolveLoyaltyStatus(schoolData);

        if (isLoyaltyActive) {
            return {
                status: 'active',
                seats: { students: Infinity, teachers: Infinity },
                purchasedSeats: { students: 0, teachers: 0 },
                examLimit: Infinity,
                billingCycle: 'monthly',
                tierId: 'loyalty',
                isLoyaltyActive: true,
                loyaltyCycleEnd,
            };
        }

        let data = subSnap.exists() ? subSnap.data() : null;

        // Fallback: Check if subscription data is stored embedded inside the 'schools' document
        if (!data && schoolData) {
            data = schoolData.subscription || { tier: schoolData.tier || 'free' };
        }

        if (!data) {
            return {
                status: 'unpaid',
                seats: defaultBaseline,
                purchasedSeats: { students: 0, teachers: 0 },
                examLimit: FREE_TIER_MONTHLY_LIMIT || 5,
                billingCycle: 'monthly',
                tierId: 'free',
                isLoyaltyActive: false,
                loyaltyCycleEnd: null,
            };
        }

        // Calculate total allocated seats (purchased + free baseline)
        const purchased = data.purchasedSeats || data.seats || { students: 0, teachers: 0 };
        const allocatedSeats = {
            students: Math.max(purchased.students || 0, defaultBaseline.students),
            teachers: Math.max(purchased.teachers || 0, defaultBaseline.teachers)
        };

        const examLimit = data.customExamLimit ?? getSchoolExamLimit(allocatedSeats);

        return {
            status: data.status || 'active',
            seats: allocatedSeats,
            purchasedSeats: purchased,
            examLimit: examLimit || FREE_TIER_MONTHLY_LIMIT || 5,
            billingCycle: data.billingCycle || 'monthly',
            addons: data.addons || {},
            tierId: data.tier || 'custom',
            isLoyaltyActive: false,
            loyaltyCycleEnd: null,
        };
    } catch (err) {
        console.error("Error loading school subscription:", err);
        return {
            status: 'unpaid',
            seats: defaultBaseline,
            purchasedSeats: { students: 0, teachers: 0 },
            examLimit: FREE_TIER_MONTHLY_LIMIT || 5,
            billingCycle: 'monthly',
            tierId: 'free',
            isLoyaltyActive: false,
            loyaltyCycleEnd: null,
        };
    }
}

// ─── Firestore Count Helpers (Aligned with Backend Database Schema) ───────────

async function countUserRole(schoolId, role) {
    const q = query(
        collection(db, 'users'),
        where('schoolId', '==', schoolId),
        where('role', '==', role)
    );
    const snap = await getCountFromServer(q);
    return snap.data().count;
}

async function countMonthlyExams(schoolId) {
    const now = new Date();
    const startOfMonthISO = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    const q = query(
        collection(db, 'exams'),
        where('schoolId', '==', schoolId),
        where('uploadedAt', '>=', startOfMonthISO)
    );
    const snap = await getCountFromServer(q);
    return snap.data().count;
}

// ─── Enforcement Guard Checks ────────────────────────────────────────────────

/**
 * Can this school register another teacher?
 */
export async function canAddTeacher(schoolId) {
    const [sub, current] = await Promise.all([
        getSchoolSubscription(schoolId),
        countUserRole(schoolId, 'teacher'),
    ]);

    const maxSeats = sub.seats.teachers;
    const allowed = current < maxSeats;

    return {
        allowed,
        current,
        limit: maxSeats,
        isUnlimited: !Number.isFinite(maxSeats),
        message: allowed
            ? 'Allowed'
            : `Teacher seat limit reached (${current}/${maxSeats}). Please add teacher seats to your subscription.`
    };
}

/**
 * Can this school register another student?
 */
export async function canAddStudent(schoolId) {
    const [sub, current] = await Promise.all([
        getSchoolSubscription(schoolId),
        countUserRole(schoolId, 'student'),
    ]);

    const maxSeats = sub.seats.students;
    const allowed = current < maxSeats;

    return {
        allowed,
        current,
        limit: maxSeats,
        isUnlimited: !Number.isFinite(maxSeats),
        message: allowed
            ? 'Allowed'
            : `Student seat limit reached (${current}/${maxSeats}). Please add student seats to your subscription.`
    };
}

/**
 * Can this school upload another exam paper this month?
 */
export async function canUploadExam(schoolId) {
    const [sub, current] = await Promise.all([
        getSchoolSubscription(schoolId),
        countMonthlyExams(schoolId),
    ]);

    const limit = sub.examLimit;
    const allowed = current < limit;

    return {
        allowed,
        current,
        limit,
        isUnlimited: !Number.isFinite(limit),
        message: allowed
            ? 'Allowed'
            : `Monthly exam upload limit reached (${current}/${limit}). Increase your purchased student seats to expand your upload quota.`
    };
}

// ─── UI Helper — SweetAlert Upgrade Prompt ───────────────────────────────────

/**
 * Run a guard check and show a customized upgrade popup if blocked.
 * Returns true if allowed, false if blocked.
 */
export async function guardedAction(checkFn, onUpgrade) {
    const result = await checkFn();
    if (result.allowed) return true;

    await Swal.fire({
        title: '⚠️ Seat Limit Reached',
        text: result.message,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: '🚀 Adjust Subscription / Seats',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#6366f1',
        cancelButtonColor: '#64748b',
    }).then((res) => {
        if (res.isConfirmed && onUpgrade) onUpgrade();
    });

    return false;
}

/**
 * Feature gate check with SweetAlert popup (e.g. Parent Dashboard)
 */
export function guardFeature(subDetails, featureKey, onUpgrade) {
    let allowed = false;

    // Loyalty schools get every gated feature for the duration of their cycle.
    if (subDetails?.isLoyaltyActive) {
        return true;
    }

    if (featureKey === 'parentDashboard') {
        // Checks if parent portal add-on is explicitly enabled or granted by tier
        allowed = Boolean(subDetails?.addons?.parentPortal) || canAccessParentDashboard(subDetails?.tierId);
    }

    if (allowed) return true;

    Swal.fire({
        title: '🔒 Premium Feature',
        html: `This feature requires the <b>Parent Portal Add-on</b> or an Enterprise plan.<br/><br/>Adjust your subscription configuration to enable it.`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: '🚀 Customize Subscription',
        cancelButtonText: 'Close',
        confirmButtonColor: '#6366f1',
    }).then((res) => {
        if (res.isConfirmed && onUpgrade) onUpgrade();
    });

    return false;
}

// ─── Usage Summary (For Principal Dashboard Display) ─────────────────────────

export async function getSchoolUsage(schoolId) {
    const [sub, teachers, students, exams] = await Promise.all([
        getSchoolSubscription(schoolId),
        countUserRole(schoolId, 'teacher'),
        countUserRole(schoolId, 'student'),
        countMonthlyExams(schoolId),
    ]);

    return {
        teachers: { used: teachers, limit: sub.seats.teachers, isUnlimited: !Number.isFinite(sub.seats.teachers) },
        students: { used: students, limit: sub.seats.students, isUnlimited: !Number.isFinite(sub.seats.students) },
        exams: { used: exams, limit: sub.examLimit, isUnlimited: !Number.isFinite(sub.examLimit) },
        billingCycle: sub.billingCycle,
        status: sub.status,
        isLoyaltyActive: sub.isLoyaltyActive,
        loyaltyCycleEnd: sub.loyaltyCycleEnd,
    };
}
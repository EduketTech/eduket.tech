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
 * Fetches school subscription details and calculates allocated seats,
 * accounting for free baseline allocations if custom seats aren't set.
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
            tierId: 'free'
        };
    }

    try {
        // First check 'subscriptions' collection
        let snap = await getDoc(doc(db, 'subscriptions', schoolId));
        let data = snap.exists() ? snap.data() : null;

        // Fallback: Check if subscription data is stored embedded inside the 'schools' document
        if (!data) {
            const schoolSnap = await getDoc(doc(db, 'schools', schoolId));
            if (schoolSnap.exists()) {
                const schoolData = schoolSnap.data();
                data = schoolData.subscription || { tier: schoolData.tier || 'free' };
            }
        }

        if (!data) {
            return {
                status: 'unpaid',
                seats: defaultBaseline,
                purchasedSeats: { students: 0, teachers: 0 },
                examLimit: FREE_TIER_MONTHLY_LIMIT || 5,
                billingCycle: 'monthly',
                tierId: 'free'
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
            tierId: data.tier || 'custom'
        };
    } catch (err) {
        console.error("Error loading school subscription:", err);
        return {
            status: 'unpaid',
            seats: defaultBaseline,
            purchasedSeats: { students: 0, teachers: 0 },
            examLimit: FREE_TIER_MONTHLY_LIMIT || 5,
            billingCycle: 'monthly',
            tierId: 'free'
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
        message: allowed ? 'Allowed' : `Teacher seat limit reached (${current}/${maxSeats}). Please add teacher seats to your subscription.`
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
        message: allowed ? 'Allowed' : `Student seat limit reached (${current}/${maxSeats}). Please add student seats to your subscription.`
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
        message: allowed ? 'Allowed' : `Monthly exam upload limit reached (${current}/${limit}). Increase your purchased student seats to expand your upload quota.`
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
        teachers: { used: teachers, limit: sub.seats.teachers },
        students: { used: students, limit: sub.seats.students },
        exams: { used: exams, limit: sub.examLimit },
        billingCycle: sub.billingCycle,
        status: sub.status,
    };
}
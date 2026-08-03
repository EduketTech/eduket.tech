// ─── tierEnforcer.js ──────────────────────────────────────────────────────────
// Front-end guardrails & SweetAlert upgrade prompts for dynamic seat-based pricing.

import { doc, getDoc, collection, query, where, getCountFromServer } from 'firebase/firestore';
import { db } from './firebase';
import {
    getSchoolExamLimit,
    canAccessParentDashboard,
    isAtLimit,
    getTierConfig,
    FREE_TIER_MONTHLY_LIMIT
} from './tierLimits';
import Swal from 'sweetalert2';

// ─── Fetch School Subscription & Seats ───────────────────────────────────────

export async function getSchoolSubscription(schoolId) {
    if (!schoolId) return { status: 'unpaid', seats: { students: 0, teachers: 0 }, examLimit: FREE_TIER_MONTHLY_LIMIT };

    try {
        const snap = await getDoc(doc(db, 'subscriptions', schoolId));
        if (!snap.exists()) {
            return { status: 'unpaid', seats: { students: 10, teachers: 2 }, examLimit: FREE_TIER_MONTHLY_LIMIT };
        }

        const data = snap.data();
        const seats = data.seats || { students: 0, teachers: 0 };
        const examLimit = data.customExamLimit ?? getSchoolExamLimit(seats);

        return {
            status: data.status || 'unpaid',
            seats,
            examLimit,
            tierId: data.tier || 'starter'
        };
    } catch (err) {
        console.error("Error loading school subscription:", err);
        return { status: 'unpaid', seats: { students: 0, teachers: 0 }, examLimit: FREE_TIER_MONTHLY_LIMIT };
    }
}

// ─── Firestore Count Helpers (Aligned with Backend Database Schema) ───────────

async function countUserRole(schoolId, role) {
    // Queries the central 'users' collection filtering by role (student/teacher)
    const q = query(
        collection(db, 'users'),
        where('schoolId', '==', schoolId),
        where('role', '==', role)
    );
    const snap = await getCountFromServer(q);
    return snap.data().count;
}

async function countMonthlyExams(schoolId) {
    // Matches backend ISO-8601 month start string filter on 'uploadedAt'
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

    const maxSeats = sub.seats.teachers || 0;
    const allowed = current < maxSeats;

    return {
        allowed,
        current,
        limit: maxSeats,
        message: allowed ? 'Allowed' : `Teacher seat limit reached (${current}/${maxSeats}). Please add teacher seats to your plan.`
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

    const maxSeats = sub.seats.students || 0;
    const allowed = current < maxSeats;

    return {
        allowed,
        current,
        limit: maxSeats,
        message: allowed ? 'Allowed' : `Student seat limit reached (${current}/${maxSeats}). Please add student seats to your plan.`
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
        message: allowed ? 'Allowed' : `Monthly exam upload limit reached (${current}/${limit}). Increase your purchased seats to boost your monthly upload quota.`
    };
}

// ─── UI Helper — SweetAlert Upgrade Prompt ───────────────────────────────────

/**
 * Run a guard check and show an upgrade popup if blocked.
 * Returns true if allowed, false if blocked.
 */
export async function guardedAction(checkFn, onUpgrade) {
    const result = await checkFn();
    if (result.allowed) return true;

    await Swal.fire({
        title: '⚠️ Limit Reached',
        text: result.message,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: '🚀 Manage Seats / Upgrade',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#3b82f6',
        cancelButtonColor: '#64748b',
    }).then((res) => {
        if (res.isConfirmed && onUpgrade) onUpgrade();
    });

    return false;
}

/**
 * Feature gate check with SweetAlert popup (e.g. Parent Dashboard)
 */
export function guardFeature(tierId, featureKey, onUpgrade) {
    let allowed = false;

    if (featureKey === 'parentDashboard') {
        allowed = canAccessParentDashboard(tierId);
    }

    if (allowed) return true;

    Swal.fire({
        title: '🔒 Premium Feature',
        html: `This feature requires an <b>Enterprise</b> allocation or Parent Add-on.<br/><br/>Manage your subscription to unlock it.`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: '🚀 View Subscription Options',
        cancelButtonText: 'Close',
        confirmButtonColor: '#8b5cf6',
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
        teachers: { used: teachers, limit: sub.seats.teachers || 0 },
        students: { used: students, limit: sub.seats.students || 0 },
        exams: { used: exams, limit: sub.examLimit },
        status: sub.status,
    };
}
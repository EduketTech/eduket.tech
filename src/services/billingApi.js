// services/billingApi.js
//
// The backend (billing_routes.py) is the source of truth for what a user or school
// actually gets charged - it derives the caller's identity from their
// verified Firebase auth token and computes the price dynamically.
// Every call here needs a valid ID token attached.

import { auth } from '../utils/firebase';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Attaches the current user's Firebase Bearer ID Token to headers.
 */
async function getAuthHeaders() {
    const user = auth.currentUser;
    if (!user) {
        throw new Error('You need to be signed in to view or change billing.');
    }
    const token = await user.getIdToken();
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
    };
}

/**
 * Standard HTTP response handler for backend API calls.
 */
async function handleResponse(res) {
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed with status ${res.status}`);
    }
    const data = await res.json();
    if (data === null || data === undefined) {
        throw new Error('Empty response from billing service — please try again.');
    }
    return data;
}

/**
 * Shared display formatter - lets Intl handle currency-correct symbols and
 * decimal places (e.g., R1,399.00 vs $226.64) instead of hand-rolling it in components.
 */
export function formatCurrency(amount = 0, currencyCode = 'ZAR') {
    const numericAmount = Number(amount) || 0;
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: currencyCode,
            maximumFractionDigits: currencyCode === 'JPY' || currencyCode === 'KRW' ? 0 : 2,
        }).format(numericAmount);
    } catch {
        return `${currencyCode} ${numericAmount.toFixed(2)}`;
    }
}

/**
 * Quote for a specific plan + seat count + cycle - used before proceeding to payment.
 * Supports both School and Parent subscriptions.
 *
 * Matches billing_routes.py's /api/billing/quote contract:
 * POST { plan, students, teachers, billingCycle, additionalExamPacks }
 *
 * Note: the backend applies the loyalty bypass itself (it checks
 * is_loyalty_subscription_active() before pricing), so a loyalty-active
 * school calling this normally will already get back is_loyalty_plan: true,
 * total_due_now: 0, monthly_upload_limit: null. You don't need to pass
 * anything loyalty-related into this call.
 */
export async function fetchPriceQuote({
    plan = 'school',
    students = 0,
    teachers = 0,
    billingCycle = 'monthly',
    additionalExamPacks = 0,
}) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/api/billing/quote`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            plan,
            type: plan, // Send both keys for backwards-compatibility
            students: Number(students),
            teachers: Number(teachers),
            billingCycle,
            additionalExamPacks: Number(additionalExamPacks),
        }),
    });
    return handleResponse(res);
}

/**
 * Call this ONLY when the user clicks "Pay" - it creates the authoritative
 * pending transaction record server-side and returns the exact fields to put in the
 * hidden PayFast form.
 *
 * Matches billing_routes.py's /api/billing/initiate contract:
 * POST { plan, students, teachers, billingCycle, additionalExamPacks } →
 * { paymentId, paymentData, quote }
 */
export async function initiatePayment({
    plan = 'school',
    students = 0,
    teachers = 0,
    billingCycle = 'monthly',
    additionalExamPacks = 0,
}) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/api/billing/initiate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            plan,
            type: plan,
            students: Number(students),
            teachers: Number(teachers),
            billingCycle,
            additionalExamPacks: Number(additionalExamPacks),
        }),
    });
    return handleResponse(res);
}

/**
 * Fetches the calling school's current loyalty status. Call this alongside
 * fetchPriceQuote() when rendering the billing page so you know whether to
 * show the "redeem a code" box or the active/unlimited state.
 *
 * Matches loyalty_routes.py's GET /api/billing/loyalty/status contract:
 * → { active: boolean, cycleEnd: string | null }
 */
export async function getLoyaltyStatus() {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/api/billing/loyalty/status`, {
        method: 'GET',
        headers,
    });
    return handleResponse(res);
}

/**
 * Redeems a loyalty code for the calling school. The school is derived
 * server-side from the auth token -- never send a schoolId here.
 *
 * Matches loyalty_routes.py's POST /api/billing/loyalty/redeem contract:
 * POST { code } → { schoolId, code, cycleStart, cycleEnd, status }
 *
 * Throws (via handleResponse) with the backend's user-facing message on an
 * invalid, expired, deactivated, or exhausted code -- safe to show directly
 * in the UI, e.g. in DynamicUsageCard's onRedeemLoyaltyCode handler.
 */
export async function redeemLoyaltyCode(code) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/api/billing/loyalty/redeem`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ code: (code || '').trim().toUpperCase() }),
    });
    return handleResponse(res);
}

// ─── Admin-only loyalty code management ───────────────────────────────────
// These three require the caller's auth token to carry the admin custom
// claim -- see require_admin in loyalty_routes.py. A non-admin token gets
// a 403 from the backend, not a client-side check, so don't rely on
// hiding the UI as the actual security boundary.

/**
 * Every loyalty code with its redemption state.
 * → { codes: [{ code, active, description, maxRedemptions, redeemedCount,
 *               redeemedBySchools: [{schoolId, schoolName}], expiresAt, createdAt }] }
 */
export async function listLoyaltyCodes() {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/api/billing/loyalty/admin/list`, {
        method: 'GET',
        headers,
    });
    return handleResponse(res);
}

/**
 * Mint a new code. All fields optional -- omit `code` to auto-generate.
 */
export async function createLoyaltyCode({ code, maxRedemptions, expiresAt, description } = {}) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/api/billing/loyalty/admin/create`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ code, maxRedemptions, expiresAt, description }),
    });
    return handleResponse(res);
}

/**
 * Deactivate a code so it can no longer be (re-)redeemed. Schools already
 * mid-cycle keep access until their cycleEnd -- this doesn't revoke
 * anything already granted.
 */
export async function deactivateLoyaltyCode(code) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/api/billing/loyalty/admin/${encodeURIComponent(code)}/deactivate`, {
        method: 'POST',
        headers,
    });
    return handleResponse(res);
}
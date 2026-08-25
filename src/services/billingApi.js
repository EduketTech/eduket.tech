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
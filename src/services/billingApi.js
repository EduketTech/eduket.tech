// services/billingApi.js
//
// The backend (billing_routes.py) is the source of truth for what a school
// actually gets charged - it derives the caller's schoolId from their
// verified Firebase auth token (never from anything this file sends), and
// computes the price from students/teachers/billingCycle/additionalExamPacks.
// Every call here needs a valid ID token attached.

import { auth } from '../utils/firebase';

const API_BASE = import.meta.env.VITE_API_URL || '';

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

async function handleResponse(res) {
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed with status ${res.status}`);
    }
    const data = await res.json();
    // Flask jsonify(None) returns HTTP 200 with body `null`
    if (data === null || data === undefined) {
        throw new Error('Empty response from billing service — please try again.');
    }
    return data;
}

// Shared display formatter - lets Intl handle currency-correct symbols and
// decimal places (R1,399 vs $226.64 vs ¥503,832 with no decimals) instead
// of hand-rolling it in every component that shows a price.
export function formatCurrency(amount, currencyCode) {
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: currencyCode || 'ZAR',
            maximumFractionDigits: currencyCode === 'JPY' || currencyCode === 'KRW' ? 0 : 2,
        }).format(amount);
    } catch {
        // Intl throws on a currency code it doesn't recognize - fall back
        // to a plain number rather than crashing whatever's rendering it.
        return `${currencyCode} ${amount.toLocaleString()}`;
    }
}

// Quote for a specific seat count + cycle - used right before showing the
// payment step. Matches billing_routes.py's /api/billing/quote contract:
// POST { students, teachers, billingCycle, additionalExamPacks } →
// { students, teachers, billingCycle, months, discountPercent,
//   additionalExamPacks, addonExamPacksCost, monthlyEquivalent,
//   subtotalBeforeDiscount, discountAmount, totalDueZar }
export async function fetchPriceQuote({ students, teachers, billingCycle, additionalExamPacks = 0 }) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/api/billing/quote`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ students, teachers, billingCycle, additionalExamPacks }),
    });
    return handleResponse(res);
}

// Quotes for ALL tiers at once, for the signed-in user's own school - used
// on the tier-selection screen so it doesn't need 5 separate round trips.
// NOTE: billing_routes.py does not currently implement this endpoint —
// confirm /api/billing/quotes exists server-side before relying on this,
// or call fetchPriceQuote once per tier from the client in the meantime.
export async function fetchAllTierQuotes({ billingCycle }) {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams({ billingCycle });
    const res = await fetch(`${API_BASE}/api/billing/quotes?${params}`, { headers });
    return handleResponse(res);
}

// Call this ONLY when the user clicks "Pay" - it creates the authoritative
// pending transaction record server-side (so the ITN handler has something
// real to verify against) and returns the exact fields to put in the
// hidden PayFast form. Don't construct that form data yourself, and don't
// send `amount` - the backend recalculates it from these seat/cycle inputs
// so a tampered client can never influence what gets charged.
// Matches billing_routes.py's /api/billing/initiate contract:
// POST { students, teachers, billingCycle, additionalExamPacks } →
// { paymentId, paymentData, quote }
export async function initiatePayment({ students, teachers, billingCycle, additionalExamPacks = 0 }) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/api/billing/initiate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ students, teachers, billingCycle, additionalExamPacks }),
    });
    return handleResponse(res);
}
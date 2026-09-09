// ─── schoolContext.js ─────────────────────────────────────────────────────────
// Provides school branding/config fetched from Firestore, applied app-wide.
// Usage: wrap your app in <SchoolProvider>, consume with useSchool().

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

const SchoolContext = createContext(null);

// Default theme — used before school config loads or for unregistered schools
export const DEFAULT_THEME = {
    primary: '#4f46e5',       // indigo-600
    primaryLight: '#e0e7ff',  // indigo-100
    primaryDark: '#3730a3',   // indigo-800
    accent: '#7c3aed',        // violet-600
    surface: '#ffffff',
    text: '#0f172a',
    name: 'Eduket OS',
    motto: 'Know where every student stands.',
    logoUrl: null,
    established: null,
    curricula: ['CAPS'],
    schoolId: null,
};

/**
 * Given a school's hex primary color, derive a full theme palette.
 */
export function buildTheme(primary = '#4f46e5') {
    // We just store the raw primary and let CSS variables cascade.
    // For derived shades we use opacity tricks so no extra lib needed.
    return {
        primary,
        primaryRgb: hexToRgb(primary),
    };
}

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r} ${g} ${b}`;
}

/**
 * Apply CSS variables to :root so all themed components pick up school colors.
 */
export function applyThemeToCss(primary = '#4f46e5') {
    const root = document.documentElement;
    root.style.setProperty('--school-primary', primary);
    root.style.setProperty('--school-primary-rgb', hexToRgb(primary));
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function SchoolProvider({ children, schoolId }) {
    const [school, setSchool] = useState(DEFAULT_THEME);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!schoolId) {
            setLoading(false);
            return;
        }

        setLoading(true);

        const unsub = onSnapshot(
            doc(db, 'schools', schoolId),
            (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    const merged = {
                        ...DEFAULT_THEME,
                        ...data,
                        schoolId,
                    };
                    setSchool(merged);
                    applyThemeToCss(data.primary || DEFAULT_THEME.primary);
                } else {
                    setSchool({ ...DEFAULT_THEME, schoolId });
                }
                setLoading(false);
            },
            (error) => {
                // Prevents unhandled Firestore stream assertions from crashing the app during Vite HMR
                console.error('[SchoolContext] Firestore Snapshot Error:', error);
                setLoading(false);
            }
        );

        return () => {
            unsub();
        };
    }, [schoolId]);

    return (
        <SchoolContext.Provider value={{ school, loading }}>
            {children}
        </SchoolContext.Provider>
    );
}

export function useSchool() {
    const ctx = useContext(SchoolContext);
    if (!ctx) throw new Error('useSchool must be used inside <SchoolProvider>');
    return ctx;
}

/**
 * One-shot fetch of school config (for components that just need the data once).
 */
export async function fetchSchoolConfig(schoolId) {
    if (!schoolId) return DEFAULT_THEME;
    const snap = await getDoc(doc(db, 'schools', schoolId));
    if (!snap.exists()) return DEFAULT_THEME;
    return { ...DEFAULT_THEME, ...snap.data(), schoolId };
}

/**
 * Resolve a schoolId from a user profile.
 * Students/teachers have a `schoolId` field; principals own the school doc.
 */
export function resolveSchoolId(userProfile) {
    return userProfile?.schoolId || userProfile?.uid || null;
}
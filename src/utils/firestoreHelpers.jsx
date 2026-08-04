// ─── firestoreHelpers.js ──────────────────────────────────────────────────────

import {
    doc, getDoc, setDoc, updateDoc, deleteDoc,
    collection, query, where, orderBy, limit,
    getDocs, onSnapshot, serverTimestamp, addDoc, arrayUnion, getCountFromServer
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import { useState, useEffect } from 'react';
import { calculateSubscriptionQuote } from '../utils/tierConfig';

// ── Exam Audit ────────────────────────────────────────────────────────────────

export async function updateExamStatusInAudit(examId, status, updatedBy = 'System') {
    if (!examId) throw new Error('[FirestoreHelpers] Cannot update status without a valid examId.');
    const examRef = doc(db, 'exams', examId);
    return await updateDoc(examRef, {
        status,
        updatedAt: serverTimestamp(),
        auditLog: arrayUnion({
            status,
            timestamp: new Date().toISOString(),
            actionedBy: updatedBy,
            message: `Exam status transitioned to ${status}`,
        }),
    });
}

export async function updateExamInAudit(examId, status, operatorInfo = {}, customMessage = '') {
    if (!examId) throw new Error('[FirestoreHelpers] Cannot update audit logs without a valid examId.');
    const examRef = doc(db, 'exams', examId);
    const operatorUid = operatorInfo.uid || 'system-fallback';
    const operatorName = operatorInfo.name || 'Anonymous Staff';
    const displayMessage = customMessage || `Exam status transitioned to ${status}.`;

    return await updateDoc(examRef, {
        status,
        updatedAt: serverTimestamp(),
        auditLog: arrayUnion({
            status,
            timestamp: new Date().toISOString(),
            actionedBy: operatorName,
            operatorId: operatorUid,
            message: displayMessage,
        }),
    });
}

// ── School ────────────────────────────────────────────────────────────────────

export async function registerSchool(principalUid, schoolData) {
    if (!principalUid) throw new Error('[FirestoreHelpers] Principal UID is required to register a school.');

    const schoolRef = doc(db, 'schools', principalUid);
    await setDoc(schoolRef, {
        ...schoolData,
        principalUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    }, { merge: true });

    await setDoc(doc(db, 'users', principalUid), {
        uid: principalUid,
        role: 'principal',
        schoolId: principalUid,
        updatedAt: serverTimestamp(),
    }, { merge: true });

    return principalUid;
}

export async function updateSchool(schoolId, data) {
    await updateDoc(doc(db, 'schools', schoolId), {
        ...data,
        updatedAt: serverTimestamp(),
    });
}

export async function getSchool(schoolId) {
    if (!schoolId) return null;
    const snap = await getDoc(doc(db, 'schools', schoolId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listSchools() {
    const snap = await getDocs(collection(db, 'schools'));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ── Users ─────────────────────────────────────────────────────────────────────

export async function saveUserProfile(uid, role, profile) {
    if (!uid || !role) throw new Error('[FirestoreHelpers] Missing UID or Role for user profile creation.');
    const col = role === 'principal' ? 'principals' : role === 'teacher' ? 'teachers' : 'students';

    await setDoc(doc(db, col, uid), {
        ...profile,
        uid,
        role,
        updatedAt: serverTimestamp(),
    }, { merge: true });

    await setDoc(doc(db, 'users', uid), { uid, role, schoolId: profile.schoolId }, { merge: true });
}

export async function getUserProfile(uid, role) {
    if (!uid || !role) return null;
    const col = role === 'principal' ? 'principals' : role === 'teacher' ? 'teachers' : 'students';
    const snap = await getDoc(doc(db, col, uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getUserRole(uid) {
    if (!uid) return null;
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data().role : null;
}

// ── School Members ────────────────────────────────────────────────────────────

export function subscribeToSchoolTeachers(schoolId, callback) {
    if (!schoolId) return () => { };
    const q = query(
        collection(db, 'teachers'),
        where('schoolId', '==', schoolId)
    );
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
}

export function subscribeToSchoolStudents(schoolId, callback) {
    if (!schoolId) return () => { };
    const q = query(
        collection(db, 'students'),
        where('schoolId', '==', schoolId)
    );
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
}

export async function getStudentsByGrade(schoolId, grade) {
    if (!schoolId) return [];
    const q = query(
        collection(db, 'students'),
        where('schoolId', '==', schoolId),
        where('grade', '==', grade)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getStudentsBySubject(schoolId, subject) {
    if (!schoolId) return [];
    const q = query(
        collection(db, 'students'),
        where('schoolId', '==', schoolId),
        where('subjects', 'array-contains', subject)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ── Exams ─────────────────────────────────────────────────────────────────────

export async function createExam(teacherUid, schoolId, examData) {
    const ref = await addDoc(collection(db, 'exams'), {
        ...examData,
        teacherUid,
        schoolId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: examData.status || 'published',
    });
    return ref.id;
}

export function subscribeToStudentExams(schoolId, subjects = [], callback) {
    if (!schoolId || !subjects.length) {
        callback([]);
        return () => { };
    }

    // Firestore 'in' query allows up to 10 elements max
    const slice = subjects.slice(0, 10);
    const q = query(
        collection(db, 'exams'),
        where('schoolId', '==', schoolId),
        where('subject', 'in', slice),
        orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
}

export function subscribeToSchoolExams(schoolId, callback) {
    if (!schoolId) return () => { };
    const q = query(
        collection(db, 'exams'),
        where('schoolId', '==', schoolId)
    );

    return onSnapshot(q, (snap) => {
        const exams = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback(exams);
    }, (error) => {
        console.error("❌ School exams listener error:", error);
    });
}

// ── Attempts ──────────────────────────────────────────────────────────────────

export async function saveAttempt(studentUid, examId, schoolId, attemptData) {
    const ref = doc(db, 'exam_attempts', `${studentUid}_${examId}`);
    await setDoc(ref, {
        ...attemptData,
        studentUid,
        schoolId,
        examId,
        submittedAt: serverTimestamp(),
    }, { merge: true });
}

export async function getStudentAttempt(studentUid, examId) {
    if (!studentUid || !examId) return null;
    const snap = await getDoc(doc(db, 'exam_attempts', `${studentUid}_${examId}`));
    return snap.exists() ? snap.data() : null;
}

export async function getExamAttempts(examId, schoolId) {
    if (!examId || !schoolId) return [];
    const q = query(
        collection(db, 'exam_attempts'),
        where('examId', '==', examId),
        where('schoolId', '==', schoolId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function subscribeToStudentAttempts(studentUid, callback) {
    if (!studentUid) return () => { };
    const q = query(
        collection(db, 'exam_attempts'),
        where('studentUid', '==', studentUid),
        orderBy('submittedAt', 'desc')
    );
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
}

export function subscribeToSchoolAttempts(schoolId, callback) {
    if (!schoolId) return () => { };

    const q = query(
        collection(db, "exam_attempts"),
        where("schoolId", "==", schoolId)
    );

    return onSnapshot(
        q,
        (snap) => {
            const attempts = snap.docs.map(d => ({
                id: d.id,
                ...d.data(),
            }));
            callback(attempts);
        },
        (err) => {
            console.error("❌ School attempts listener error:", err);
        }
    );
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

export async function logMarkingEvent(schoolId, event) {
    await addDoc(collection(db, 'auditLog'), {
        ...event,
        schoolId,
        timestamp: serverTimestamp(),
    });
}

export function subscribeToAuditLog(schoolId, callback) {
    if (!schoolId) return () => { };
    const q = query(
        collection(db, 'auditLog'),
        where('schoolId', '==', schoolId),
        limit(200)
    );
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
}

// ── Analytics Helpers ─────────────────────────────────────────────────────────

export function countByGrade(students = []) {
    return students.reduce((acc, s) => {
        const grade = s.grade || 'Unassigned';
        acc[grade] = (acc[grade] || 0) + 1;
        return acc;
    }, {});
}

export function averageScore(attempts = []) {
    if (!attempts.length) return null;
    const scores = attempts.map((a) => a.percentage ?? a.score ?? 0);
    return Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
}

export function passRate(attempts = []) {
    if (!attempts.length) return 0;
    const passed = attempts.filter(a => (a.percentage ?? a.score ?? 0) >= 40).length;
    return Math.round((passed / attempts.length) * 100);
}

export function groupBySubject(attempts = []) {
    return attempts.reduce((acc, a) => {
        const s = a.subject || 'Unknown';
        if (!acc[s]) acc[s] = [];
        acc[s].push(a);
        return acc;
    }, {});
}

// ── Active Tier Hook & Limits ────────────────────────────────────────────────────

export function useActiveTier(schoolId) {
    const [status, setStatus] = useState({ tier: 'free', loading: true });

    useEffect(() => {
        if (!schoolId) {
            setStatus({ tier: 'free', loading: false });
            return;
        }

        const q = query(
            collection(db, 'billing'),
            where('schoolId', '==', schoolId),
            orderBy('createdAt', 'desc'),
            limit(1)
        );

        const unsub = onSnapshot(q, (snap) => {
            if (!snap.empty) {
                const latest = snap.docs[0].data();
                setStatus({ tier: latest.tier || 'free', loading: false });
            } else {
                setStatus({ tier: 'free', loading: false });
            }
        }, (err) => {
            console.error("❌ Tier listener error:", err);
            setStatus({ tier: 'free', loading: false });
        });

        return () => unsub();
    }, [schoolId]);

    return status;
}

export function getSubscriptionPrice(students, teachers, cycle = 'annual') {
    const quote = calculateSubscriptionQuote({ students, teachers, cycle });
    return quote.totalDueNow;
}

export const getSchoolUserCount = async (schoolId, role) => {
    if (!schoolId) return 0;
    const collectionName = role === 'teacher' ? 'teachers' : 'students';
    const q = query(collection(db, collectionName), where("schoolId", "==", schoolId));

    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
};

export const calculateUsageStatus = (currentCount, maxSeats, role) => {
    const max = maxSeats || 1;
    const used = currentCount || 0;
    const pct = Math.round((used / max) * 100);

    let status = 'ok';
    if (used >= max) status = 'crit';
    else if (pct >= 80) status = 'warn';

    return { used, max, pct, status };
};
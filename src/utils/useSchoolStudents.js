import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export function useSchoolStudents(currentSchoolId) {
    const [studentsList, setStudentsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        // POPIA Guard Clause: Refuse execution if schoolId is missing or invalid
        if (!currentSchoolId || typeof currentSchoolId !== 'string' || currentSchoolId.trim() === '') {
            setStudentsList([]);
            setLoading(false);
            return;
        }

        setLoading(true);

        // 1. Enforce schoolId constraint on users collection query
        const usersQuery = query(
            collection(db, 'users'),
            where('role', '==', 'student'),
            where('schoolId', '==', currentSchoolId)
        );

        // 2. Enforce schoolId constraint on students collection query
        const studentsQuery = query(
            collection(db, 'students'),
            where('schoolId', '==', currentSchoolId)
        );

        let unsubscribeStudents = () => { };

        const unsubscribeUsers = onSnapshot(usersQuery, (usersSnap) => {
            const usersData = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            unsubscribeStudents = onSnapshot(studentsQuery, (studentsSnap) => {
                const studentsData = studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                // Strictly merge only documents belonging to currentSchoolId
                const studentMap = new Map();

                studentsData.forEach(s => {
                    if (s.uid || s.id) studentMap.set(s.uid || s.id, { ...s });
                });

                usersData.forEach(u => {
                    const key = u.uid || u.id;
                    if (key) {
                        const existing = studentMap.get(key) || {};
                        studentMap.set(key, {
                            ...existing,
                            ...u,
                            grade: u.grade || existing.grade || 'Grade 12'
                        });
                    }
                });

                setStudentsList(Array.from(studentMap.values()));
                setLoading(false);
            }, (err) => {
                console.error("POPIA Compliance Error: Students listener blocked", err);
                setError(err);
                setLoading(false);
            });
        }, (err) => {
            console.error("POPIA Compliance Error: Users listener blocked", err);
            setError(err);
            setLoading(false);
        });

        // Cleanup listeners when switching schools or logging out
        return () => {
            unsubscribeUsers();
            unsubscribeStudents();
        };
    }, [currentSchoolId]);

    return { studentsList, loading, error };
}
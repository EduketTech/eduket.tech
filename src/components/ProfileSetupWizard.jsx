/**
 * ProfileSetupWizard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-screen, 4-step profile setup shown immediately after registration.
 * Collects role, personal details, and school/student info, then writes to Firestore.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
    doc,
    setDoc,
    getDoc,
    collection,
    query,
    where,
    getDocs,
    serverTimestamp,
    writeBatch,
    runTransaction,
} from 'firebase/firestore';
import { db, auth } from '../utils/firebase';
import {
    GraduationCap, BookOpen, LayoutDashboard,
    ArrowRight, ArrowLeft, CheckCircle2,
    Search, Building2, Sparkles, HeartHandshake, User, ShieldCheck
} from 'lucide-react';
import { useAiList } from './SchoolRegistration';
import { fetchSubjects } from '../utils/academicResolver';

// ── Constants ─────────────────────────────────────────────────────────────
const TITLES = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Rev'];
const GRADES = ['Grade R', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4',
    'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9',
    'Grade 10', 'Grade 11', 'Grade 12',
    'Form 1', 'Form 2', 'Form 3', 'Form 4', 'Form 5',
    'Form 6', 'Year 1', 'Year 2', 'Year 3', 'Year 4'];
const CURRICULA = ['CAPS', 'ZIMSEC', 'Cambridge', 'IEB', 'National Curriculum', 'Other'];
const INST_TYPES = [
    'Primary School', 'Secondary / High School', 'College',
    'University', 'Private College', 'Other',
];

// ── Reusable form elements ─────────────────────────────────────────────────
function Label({ children }) {
    return (
        <label className="block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">
            {children}
        </label>
    );
}

function Input({ ...props }) {
    return (
        <input
            {...props}
            className="w-full border-2 border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white p-4 rounded-2xl outline-none text-sm focus:border-indigo-500 transition-colors placeholder-slate-400"
        />
    );
}

function Select({ children, ...props }) {
    return (
        <select
            {...props}
            className="w-full border-2 border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white p-4 rounded-2xl outline-none text-sm focus:border-indigo-500 transition-colors bg-white"
        >
            {children}
        </select>
    );
}

function ErrorBox({ message }) {
    if (!message) return null;
    return (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 text-sm text-red-600 dark:text-red-400 font-medium">
            {message}
        </div>
    );
}

function NextButton({ onClick, disabled, children = 'Continue', loading }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled || loading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-black text-sm text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20 transition-all"
        >
            {loading ? 'Saving…' : children}
            {!loading && <ArrowRight size={16} />}
        </button>
    );
}

function BackButton({ onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex items-center gap-2 px-6 py-4 rounded-2xl font-black text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
            <ArrowLeft size={16} />
            Back
        </button>
    );
}

function StepDots({ current, total }) {
    return (
        <div className="flex items-center gap-2 justify-center mb-8">
            {Array.from({ length: total }).map((_, i) => (
                <div
                    key={i}
                    className={`rounded-full transition-all duration-300 ${i < current
                        ? 'w-6 h-2 bg-indigo-600'
                        : i === current
                            ? 'w-8 h-2 bg-indigo-600'
                            : 'w-2 h-2 bg-slate-300 dark:bg-slate-700'
                        }`}
                />
            ))}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// STEP 1 — Role Selection
// ══════════════════════════════════════════════════════════════════════════════
function StepRole({ role, onSelect }) {
    const roles = [
        {
            id: 'student',
            icon: GraduationCap,
            label: 'Student',
            desc: 'Complete exams and assignments. Track your progress and learn from your AI coach.',
            color: 'emerald',
        },
        {
            id: 'parent',
            icon: HeartHandshake,
            label: 'Parent / Guardian',
            desc: 'Access your child’s academic analytics, subject scores, AI guidance, and teacher updates.',
            color: 'rose',
        },
        {
            id: 'teacher',
            icon: BookOpen,
            label: 'Teacher',
            desc: 'Upload exams and worksheets. See class results and per-learner concept gaps.',
            color: 'violet',
        },
        {
            id: 'principal',
            icon: LayoutDashboard,
            label: 'Principal / Admin',
            desc: 'Register your school and see school-wide performance analytics.',
            color: 'indigo',
        },
    ];

    const colorMap = {
        emerald: {
            border: 'border-emerald-400 dark:border-emerald-600',
            bg: 'bg-emerald-50 dark:bg-emerald-900/20',
            icon: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400',
            badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300',
        },
        rose: {
            border: 'border-rose-400 dark:border-rose-600',
            bg: 'bg-rose-50 dark:bg-rose-900/20',
            icon: 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400',
            badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300',
        },
        violet: {
            border: 'border-violet-400 dark:border-violet-600',
            bg: 'bg-violet-50 dark:bg-violet-900/20',
            icon: 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400',
            badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300',
        },
        indigo: {
            border: 'border-indigo-400 dark:border-indigo-600',
            bg: 'bg-indigo-50 dark:bg-indigo-900/20',
            icon: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400',
            badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300',
        },
    };

    return (
        <div className="space-y-4">
            {roles.map(({ id, icon: Icon, label, desc, color }) => {
                const c = colorMap[color];
                const selected = role === id;

                return (
                    <button
                        key={id}
                        type="button"
                        onClick={() => onSelect(id)}
                        className={`w-full text-left flex items-center gap-4 p-5 rounded-2xl border-2 transition-all duration-200 group ${selected
                            ? `${c.border} ${c.bg} shadow-md`
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-900'
                            }`}
                    >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${selected ? c.icon : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                            <Icon size={22} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                                <p className="font-black text-slate-800 dark:text-white text-sm">{label}</p>
                                {selected && (
                                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${c.badge}`}>
                                        Selected
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
                        </div>
                        {selected && <CheckCircle2 size={20} className="text-indigo-500 flex-shrink-0" />}
                    </button>
                );
            })}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// STEP 2 — Personal Details
// ══════════════════════════════════════════════════════════════════════════════
function StepDetails({ role, details, onChange, subjects, subjectsLoading, curriculum }) {
    const set = (field, value) => {
        const nextDetails = { ...details, [field]: value };

        // Keep single-child details synced inside details.children array
        if (role === 'parent' && (field === 'childName' || field === 'childGrade' || field === 'studentCode')) {
            nextDetails.children = [{
                studentCode: nextDetails.studentCode || '',
                childName: nextDetails.childName || '',
                childGrade: nextDetails.childGrade || '',
                linkedStudentId: nextDetails.linkedStudentId || null,
            }];
        }

        onChange(nextDetails);
    };

    const FALLBACK_SUBJECTS = [
        'Mathematics', 'Mathematical Literacy', 'English Home Language',
        'English First Additional Language', 'Physical Sciences', 'Life Sciences',
        'Geography', 'History', 'Accounting', 'Business Studies', 'Economics',
        'Computer Applications Technology', 'Information Technology',
        'Life Orientation', 'Tourism', 'Consumer Studies', 'Robotics', 'Engineering', 'Mathematics for Machine Learning'
    ];

    const subjectList = (subjects && subjects.length > 0) ? subjects : FALLBACK_SUBJECTS;

    // Function to lookup student by code during Parent setup
    const handleStudentCodeLookup = async (inputCode) => {
        const cleanCode = inputCode.trim().toUpperCase();

        let baseDetails = {
            ...details,
            studentCode: cleanCode,
        };

        if (cleanCode.length < 8) {
            const resetDetails = {
                ...baseDetails,
                childName: '',
                childGrade: '',
                linkedStudentId: null,
                children: [{ studentCode: cleanCode, childName: '', childGrade: '', linkedStudentId: null }]
            };
            onChange(resetDetails);
            return;
        }

        try {
            const studentsRef = collection(db, 'students');
            const q = query(studentsRef, where('studentCode', '==', cleanCode));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const studentDoc = querySnapshot.docs[0];
                const studentData = studentDoc.data();
                const matchedName = studentData.displayName || `${studentData.firstName || ''} ${studentData.lastName || ''}`.trim();
                const matchedGrade = studentData.grade || '';

                const matchedDetails = {
                    ...baseDetails,
                    childName: matchedName,
                    childGrade: matchedGrade,
                    linkedStudentId: studentDoc.id,
                    children: [{
                        studentCode: cleanCode,
                        childName: matchedName,
                        childGrade: matchedGrade,
                        linkedStudentId: studentDoc.id,
                    }]
                };

                onChange(matchedDetails);
            } else {
                const unlinkedDetails = {
                    ...baseDetails,
                    childName: '',
                    childGrade: '',
                    linkedStudentId: null,
                    children: [{ studentCode: cleanCode, childName: '', childGrade: '', linkedStudentId: null }]
                };
                onChange(unlinkedDetails);
            }
        } catch (err) {
            console.error('[ProfileSetup] Student lookup error:', err);
        }
    };

    return (
        <div className="space-y-4">
            {(role === 'teacher' || role === 'principal' || role === 'parent') && (
                <div>
                    <Label>Title</Label>
                    <Select value={details.title || ''} onChange={(e) => set('title', e.target.value)}>
                        <option value="">Select title</option>
                        {TITLES.map(t => <option key={t} value={t}>{t}</option>)}
                    </Select>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <Label>First name</Label>
                    <Input placeholder="First name" value={details.firstName || ''} onChange={(e) => set('firstName', e.target.value)} />
                </div>
                <div>
                    <Label>Last name</Label>
                    <Input placeholder="Last name" value={details.lastName || ''} onChange={(e) => set('lastName', e.target.value)} />
                </div>
            </div>

            {role === 'parent' && (
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
                    <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900">
                        <p className="text-xs font-black text-rose-700 dark:text-rose-300 mb-1">
                            Child / Student Linking
                        </p>
                        <p className="text-xs text-rose-600 dark:text-rose-400">
                            Enter your child&apos;s unique Student Security Code (e.g., AP12260001). This will automatically locate and lock in your child&apos;s profile.
                        </p>
                    </div>

                    {/* Student Security Code Input (Primary Link Driver) */}
                    <div>
                        <Label>Student Security Code</Label>
                        <Input
                            placeholder="e.g. AP12260001"
                            value={details.studentCode || ''}
                            onChange={(e) => handleStudentCodeLookup(e.target.value)}
                            className="font-mono uppercase tracking-wider text-base font-bold"
                            autoComplete="off"
                        />
                        {details.linkedStudentId && (
                            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                                ✓ Verified student profile matched!
                            </p>
                        )}
                    </div>

                    {/* Auto-Filled or Manual Details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <Label>Child&apos;s Full Name</Label>
                            <Input
                                placeholder={details.linkedStudentId ? '' : 'e.g. John Doe'}
                                value={details.childName || ''}
                                readOnly={Boolean(details.linkedStudentId)}
                                disabled={Boolean(details.linkedStudentId)}
                                onChange={(e) => set('childName', e.target.value)}
                                className={details.linkedStudentId ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 font-semibold text-emerald-900 dark:text-emerald-200' : ''}
                            />
                        </div>
                        <div>
                            <Label>Child&apos;s Grade</Label>
                            <Select
                                value={details.childGrade || ''}
                                disabled={Boolean(details.linkedStudentId)}
                                onChange={(e) => set('childGrade', e.target.value)}
                                className={details.linkedStudentId ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 font-semibold text-emerald-900 dark:text-emerald-200' : ''}
                            >
                                <option value="">Select grade</option>
                                {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                            </Select>
                        </div>
                    </div>
                </div>
            )}

            {role === 'student' && (
                <div>
                    <Label>Grade / Year</Label>
                    <Select value={details.grade || ''} onChange={(e) => set('grade', e.target.value)}>
                        <option value="">Select your grade</option>
                        {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                    </Select>
                </div>
            )}

            {role === 'teacher' && (
                <div>
                    <Label>
                        Subjects you teach
                        {curriculum && (
                            <span className="ml-2 text-[10px] font-black text-violet-500 uppercase tracking-widest">
                                {curriculum}
                            </span>
                        )}
                    </Label>

                    {subjectsLoading && (
                        <div className="flex items-center gap-2 p-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl mb-3 border border-violet-200 dark:border-violet-800">
                            <div className="w-3.5 h-3.5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-xs text-violet-600 dark:text-violet-400 font-bold">
                                Loading {curriculum} subjects...
                            </p>
                        </div>
                    )}

                    {!curriculum && !subjectsLoading && (
                        <p className="text-xs text-amber-500 font-bold mb-3 flex items-center gap-1">
                            ⚠ Select your school first for curriculum-specific subjects
                        </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                        {subjectList.map(s => {
                            const selected = (details.subjects || []).includes(s);
                            return (
                                <label
                                    key={s}
                                    className={`flex items-center gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-colors text-sm ${selected
                                        ? 'border-violet-400 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300'
                                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                                        }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected}
                                        onChange={() => {
                                            const prev = details.subjects || [];
                                            set('subjects', selected ? prev.filter(x => x !== s) : [...prev, s]);
                                        }}
                                        className="sr-only"
                                    />
                                    <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${selected ? 'border-violet-500 bg-violet-500' : 'border-slate-300 dark:border-slate-600'
                                        }`}>
                                        {selected && <CheckCircle2 size={10} className="text-white" />}
                                    </div>
                                    <span className="font-medium leading-snug">{s}</span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            )}

            {role === 'principal' && (
                <div>
                    <Label>Institution type</Label>
                    <Select value={details.institutionType || ''} onChange={(e) => set('institutionType', e.target.value)}>
                        <option value="">Select institution type</option>
                        {INST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </Select>
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// STEP 3 — School Details / Child Link
// ══════════════════════════════════════════════════════════════════════════════
function StepSchool({ role, school = {}, onChange }) {
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchDone, setSearchDone] = useState(false);

    const set = (field, value) => onChange(prev => ({ ...prev, [field]: value }));

    const searchSchools = async () => {
        if (!searchQuery.trim()) return;
        setSearching(true);
        setSearchDone(false);
        try {
            const q = query(
                collection(db, 'schools'),
                where('searchName', '>=', searchQuery.toLowerCase()),
                where('searchName', '<=', searchQuery.toLowerCase() + '\uf8ff')
            );
            const snap = await getDocs(q);
            setResults(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch {
            setResults([]);
        } finally {
            setSearching(false);
            setSearchDone(true);
        }
    };

    return (
        <div className="space-y-4">
            {(role === 'student' || role === 'teacher' || role === 'parent') && (
                <>
                    <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900">
                        <p className="text-xs font-black text-blue-700 dark:text-blue-300 mb-1">
                            {role === 'parent' ? "Find your child's school" : "Find your school"}
                        </p>
                        <p className="text-xs text-blue-600 dark:text-blue-400">
                            Enter the registered school name to link your profile accurately.
                        </p>
                    </div>

                    <div className="flex gap-2">
                        <div className="flex-1">
                            <Label>School name</Label>
                            <Input
                                placeholder="e.g. Greenwood High School"
                                value={school.name || ''}
                                onChange={(e) => {
                                    set('name', e.target.value);
                                    setSearchQuery(e.target.value);
                                }}
                            />
                        </div>
                        <div className="pt-6">
                            <button
                                type="button"
                                onClick={searchSchools}
                                disabled={searching || !(school.name || '').trim()}
                                className="flex items-center gap-2 px-4 py-4 rounded-2xl bg-slate-100 dark:bg-slate-800 font-bold text-sm text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 disabled:opacity-50 transition-colors"
                            >
                                <Search size={16} />
                                {searching ? '…' : 'Find'}
                            </button>
                        </div>
                    </div>

                    {searchDone && results.length > 0 && (
                        <div className="space-y-2">
                            {results.map(r => (
                                <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => onChange(prev => ({
                                        ...prev,
                                        schoolId: r.id,
                                        name: r.schoolName || r.name || '',
                                        country: r.country || '',
                                        curriculum: r.curriculum || '',
                                    }))}
                                    className={`w-full text-left flex items-center gap-3 p-4 rounded-2xl border-2 transition-colors ${school.schoolId === r.id
                                        ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                                        : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'
                                        }`}
                                >
                                    <Building2 size={18} className="text-indigo-500 flex-shrink-0" />
                                    <div>
                                        <p className="text-sm font-black text-slate-800 dark:text-white">
                                            {r.schoolName || r.name}
                                        </p>
                                        <p className="text-xs text-slate-400">{r.country} · {r.curriculum}</p>
                                    </div>
                                    {school.schoolId === r.id && (
                                        <CheckCircle2 size={18} className="text-indigo-500 ml-auto" />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </>
            )}

            {role === 'principal' && (
                <>
                    <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900">
                        <p className="text-xs font-black text-indigo-700 dark:text-indigo-300 mb-1">
                            Register your school
                        </p>
                        <p className="text-xs text-indigo-600 dark:text-indigo-400">
                            Your school is the hub for all teachers, parents, and students.
                        </p>
                    </div>

                    <div>
                        <Label>School name</Label>
                        <Input
                            placeholder="e.g. Greenwood High School"
                            value={school.name || ''}
                            onChange={(e) => set('name', e.target.value)}
                        />
                    </div>

                    <div>
                        <Label>Country</Label>
                        <Input
                            placeholder="e.g. South Africa"
                            value={school.country || ''}
                            onChange={(e) => set('country', e.target.value)}
                        />
                    </div>

                    <div>
                        <Label>Curriculum</Label>
                        <Select value={school.curriculum || ''} onChange={(e) => set('curriculum', e.target.value)}>
                            <option value="">Select curriculum</option>
                            {CURRICULA.map(c => <option key={c} value={c}>{c}</option>)}
                        </Select>
                    </div>
                </>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// STEP 4 — Complete Screen & Hand-off
// ══════════════════════════════════════════════════════════════════════════════
function StepDone({ role, details, createdProfile, email }) {
    // Fallback to Firebase auth instance if prop is missing
    const userEmail = email || auth.currentUser?.email || details?.email;

    const name = details?.firstName
        ? `${details.title ? details.title + ' ' : ''}${details.firstName} ${details.lastName}`
        : 'User';

    const icons = {
        student: GraduationCap,
        parent: HeartHandshake,
        teacher: BookOpen,
        principal: LayoutDashboard,
    };
    const Icon = icons[role] || Sparkles;

    const messages = {
        student: 'Your student profile is ready. Complete your first exam to get started.',
        parent: 'Your parent dashboard is ready! Enjoy 14 days of complimentary access to your child’s learning analytics.',
        teacher: 'Your teacher profile is ready. Upload your first exam to get started.',
        principal: 'Your school is registered. Invite your staff and students to begin.',
    };

    return (
        <div className="text-center py-6 space-y-4">
            <div className="w-20 h-20 rounded-3xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
                <Icon size={40} />
            </div>

            <h2 className="text-2xl font-black text-slate-800 dark:text-white">
                Registration Complete! ✅
            </h2>

            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                {messages[role]}
            </p>

            {userEmail && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    📧 A welcome email has been sent to <span className="font-bold text-slate-800 dark:text-slate-200">{userEmail}</span>
                </p>
            )}

            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                ⏳ Your principal has been notified and will approve your access shortly.
            </p>

            {createdProfile?.code && (
                <div className="mt-4 p-3 bg-slate-100 dark:bg-slate-800 rounded-xl">
                    <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Your Unique Code</p>
                    <p className="text-lg font-mono font-bold text-slate-800 dark:text-slate-200">{createdProfile.code}</p>
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN WIZARD — assembles the 4 steps
// ══════════════════════════════════════════════════════════════════════════════

export function ProfileSetupWizard({ uid, email, onComplete }) {
    const [step, setStep] = useState(0);   // 0-3
    const [role, setRole] = useState('');
    const [details, setDetails] = useState({
        firstName: '',
        lastName: '',
        title: '',
        subjects: [],
        grade: '',
        children: [{ studentCode: '', childName: '', childGrade: '', linkedStudentId: null }],
    });
    const [school, setSchool] = useState({});
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [createdProfile, setCreatedProfile] = useState(null); // Tracks saved profile metadata for StepDone
    const savingRef = useRef(false);
    const {
        data: aiSubjects,
        loading: subjectsLoading,
    } = useAiList(
        fetchSubjects,
        [school?.country, school?.curriculum],
        !!school?.country && !!school?.curriculum
    );

    const STEP_TITLES = [
        'Who are you?',
        'Your school',
        'Your details',
        'All set!',
    ];

    const FREE_TEACHER_BASE = 2;
    const FREE_STUDENT_BASE = 30;

    // ✅ AFTER
    const canProceed = () => {
        if (step === 0) return !!role;

        if (step === 1) {
            if (role === 'principal') {
                return !!school.name?.trim() && !!school.curriculum;
            }
            if (role === 'parent') {
                return true;
            }
            // Students and Teachers only require a valid school selection
            return !!(school.schoolId || school.name?.trim());
        }

        if (step === 2) {
            if (!details.firstName?.trim() || !details.lastName?.trim()) return false;
            if (role === 'teacher' && !(details.subjects || []).length) return false;
            if (role === 'student') return !!details.grade;
            if (role === 'parent') {
                return !!details.studentCode?.trim() || !!details.linkedStudentId;
            }
            return true;
        }

        return true;
    };

    // Helper function to build teacher code (e.g. TCH-AP260001)
    const generateTeacherCode = (schoolName, currentCount) => {
        const cleanName = (schoolName || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
        const prefix = cleanName.length >= 2 ? cleanName.substring(0, 2) : 'SC';
        const year = new Date().getFullYear().toString().slice(-2);
        const formattedCount = String(currentCount).padStart(4, '0');

        return `TCH-${prefix}${year}${formattedCount}`;
    };

    // Helper function to build student code (e.g. AP12260001)
    const generateStudentCode = (schoolName, grade, currentCount) => {
        const cleanName = (schoolName || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
        const prefix = cleanName.length >= 2 ? cleanName.substring(0, 2) : 'SC';
        const numericGrade = (grade || '').toString().replace(/\D/g, '');
        const formattedGrade = numericGrade.padStart(2, '0').slice(-2) || '00';
        const year = new Date().getFullYear().toString().slice(-2);
        const formattedCount = String(currentCount).padStart(4, '0');

        return `${prefix}${formattedGrade}${year}${formattedCount}`;
    };

    const saveProfile = async () => {
        const user = auth.currentUser;
        if (!user) {
            console.error('[ProfileSetup] No authenticated user');
            return;
        }

        if (savingRef.current) {
            console.warn('[ProfileSetup] Already saving — ignoring duplicate call');
            return;
        }
        savingRef.current = true;
        setSaving(true);
        setError('');

        try {
            const currentUid = user.uid;
            const displayName = `${details.title ? details.title + ' ' : ''}${details.firstName} ${details.lastName}`.trim();

            // Ensure schoolId exists even if user typed a custom school name
            let schoolId = school.schoolId || '';
            if (role === 'principal' && !schoolId) {
                schoolId = `${currentUid}_${(school.name || 'school').replace(/\s+/g, '_').substring(0, 30)}`;
            } else if (!schoolId && school.name) {
                schoolId = `unlinked_${(school.name).toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
            }

            let generatedCode = null;

            // Ensure capacity limits have local fallbacks
            const DEFAULT_TEACHER_LIMIT = typeof FREE_TEACHER_BASE !== 'undefined' ? FREE_TEACHER_BASE : 10;
            const DEFAULT_STUDENT_LIMIT = typeof FREE_STUDENT_BASE !== 'undefined' ? FREE_STUDENT_BASE : 100;

            // ══════════════════════════════════════════════════════════════════════
            // TEACHER & STUDENT REGISTRATION (Atomic Transactions for Linked Schools)
            // ══════════════════════════════════════════════════════════════════════
            if ((role === 'teacher' || role === 'student') && school.schoolId) {
                const schoolRef = doc(db, 'schools', schoolId);

                await runTransaction(db, async (transaction) => {
                    const schoolSnap = await transaction.get(schoolRef);

                    if (!schoolSnap.exists()) {
                        throw new Error('School not found. Ask your principal to register the school first.');
                    }

                    const schoolData = schoolSnap.data();

                    if (role === 'teacher') {
                        const maxAllowed = schoolData.teacherLimit ?? DEFAULT_TEACHER_LIMIT;
                        const currentCount = schoolData.teacherCount ?? 0;

                        if (currentCount >= maxAllowed) {
                            throw new Error(`This school has reached its capacity limit for teacher seats (${currentCount}/${maxAllowed}).`);
                        }

                        const nextCount = currentCount + 1;
                        generatedCode = typeof generateTeacherCode === 'function'
                            ? generateTeacherCode(schoolData.schoolName || school.name, nextCount)
                            : `TCH-${nextCount}`;

                        transaction.update(schoolRef, {
                            teacherCount: nextCount,
                            updatedAt: serverTimestamp(),
                        });

                        const teacherRef = doc(db, 'teachers', currentUid);
                        transaction.set(teacherRef, {
                            uid: currentUid,
                            email: email || user.email,
                            displayName,
                            firstName: details.firstName || '',
                            lastName: details.lastName || '',
                            title: details.title || '',
                            schoolId,
                            schoolName: schoolData.schoolName || school.name || '',
                            subjects: details.subjects || [],
                            curriculum: school.curriculum || '',
                            teacherCode: generatedCode,
                            approvalStatus: 'pending',
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                        }, { merge: true });

                    } else if (role === 'student') {
                        const maxAllowed = schoolData.studentLimit ?? DEFAULT_STUDENT_LIMIT;
                        const currentCount = schoolData.studentCount ?? 0;

                        if (currentCount >= maxAllowed) {
                            throw new Error(`This school has reached its capacity limit for student seats (${currentCount}/${maxAllowed}).`);
                        }

                        const nextCount = currentCount + 1;
                        generatedCode = typeof generateStudentCode === 'function'
                            ? generateStudentCode(schoolData.schoolName || school.name, details.grade, nextCount)
                            : `STD-${nextCount}`;

                        transaction.update(schoolRef, {
                            studentCount: nextCount,
                            updatedAt: serverTimestamp(),
                        });

                        const studentRef = doc(db, 'students', currentUid);
                        transaction.set(studentRef, {
                            uid: currentUid,
                            email: email || user.email,
                            displayName,
                            firstName: details.firstName || '',
                            lastName: details.lastName || '',
                            title: details.title || '',
                            schoolId,
                            schoolName: schoolData.schoolName || school.name || '',
                            grade: details.grade || '',
                            curriculum: school.curriculum || '',
                            studentCode: generatedCode,
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                        }, { merge: true });
                    }

                    const userRef = doc(db, 'users', currentUid);
                    transaction.set(userRef, {
                        uid: currentUid,
                        email: email || user.email,
                        displayName,
                        role,
                        schoolId,
                        ...(role === 'teacher' ? { teacherCode: generatedCode, subjects: details.subjects || [] } : {}),
                        ...(role === 'student' ? { studentCode: generatedCode, grade: details.grade || '' } : {}),
                        updatedAt: serverTimestamp(),
                    }, { merge: true });

                    const activityRef = doc(collection(db, 'schoolActivity'));
                    transaction.set(activityRef, {
                        schoolId,
                        type: 'user_joined',
                        actorUid: currentUid,
                        actorRole: role,
                        actorName: displayName,
                        email: email || user.email,
                        ...(role === 'teacher' ? { teacherCode: generatedCode } : {}),
                        ...(role === 'student' ? { studentCode: generatedCode } : {}),
                        read: false,
                        timestamp: serverTimestamp(),
                    });
                });

            } else {
                // ══════════════════════════════════════════════════════════════════════
                // FALLBACK / UNLINKED BATCH WRITES (For custom school entries)
                // ══════════════════════════════════════════════════════════════════════
                const batch = writeBatch(db);

                let childrenList = (details.children || [])
                    .filter((c) => c.studentCode || c.childName)
                    .map((c) => ({
                        studentCode: c.studentCode || '',
                        childName: c.childName || '',
                        childGrade: c.childGrade || '',
                        linkedStudentId: c.linkedStudentId || null,
                    }));

                if (childrenList.length === 0 && (details.childName || details.studentCode)) {
                    childrenList = [{
                        studentCode: details.studentCode || '',
                        childName: details.childName || '',
                        childGrade: details.childGrade || '',
                        linkedStudentId: details.linkedStudentId || null,
                    }];
                }

                const primaryChildName = childrenList[0]?.childName || details.childName || '';
                const primaryChildGrade = childrenList[0]?.childGrade || details.childGrade || '';
                const primaryStudentCode = childrenList[0]?.studentCode || details.studentCode || '';

                const activityRef = doc(collection(db, 'schoolActivity'));
                batch.set(activityRef, {
                    schoolId: schoolId || null,
                    type: 'user_joined',
                    actorUid: currentUid,
                    actorRole: role,
                    actorName: displayName,
                    email: email || user.email,
                    read: false,
                    timestamp: serverTimestamp(),
                    ...(role === 'parent' ? {
                        children: childrenList,
                        linkedChildrenCount: childrenList.length,
                    } : {}),
                });

                const roleCollection = `${role}s`;
                const profileRef = doc(db, roleCollection, currentUid);
                const userRef = doc(db, 'users', currentUid);

                const basePayload = {
                    uid: currentUid,
                    email: email || user.email,
                    displayName,
                    firstName: details.firstName || '',
                    lastName: details.lastName || '',
                    title: details.title || '',
                    schoolId: schoolId || null,
                    schoolName: school.name || '',
                    role,
                    updatedAt: serverTimestamp(),
                };

                if (role === 'principal') {
                    const schoolRef = doc(db, 'schools', schoolId);
                    batch.set(schoolRef, {
                        id: schoolId,
                        schoolId,
                        schoolName: school.name,
                        searchName: school.name.toLowerCase(),
                        country: school.country || '',
                        curriculum: school.curriculum || '',
                        institutionType: details.institutionType || '',
                        principalId: currentUid,
                        tier: 'free',
                        studentCount: 0,
                        teacherCount: 0,
                        createdAt: serverTimestamp(),
                    }, { merge: true });

                    batch.set(profileRef, {
                        ...basePayload,
                        institutionType: details.institutionType || '',
                        createdAt: serverTimestamp(),
                    }, { merge: true });

                    batch.set(userRef, {
                        ...basePayload,
                        institutionType: details.institutionType || '',
                        approvalStatus: 'approved',
                        createdAt: serverTimestamp(),
                    }, { merge: true });

                } else if (role === 'parent') {
                    const parentPayload = {
                        ...basePayload,
                        children: childrenList,
                        childName: primaryChildName,
                        childGrade: primaryChildGrade,
                        studentCode: primaryStudentCode,
                        approvalStatus: 'pending',
                        createdAt: serverTimestamp(),
                    };

                    batch.set(profileRef, parentPayload, { merge: true });
                    batch.set(userRef, parentPayload, { merge: true });

                } else if (role === 'teacher') {
                    // ✅ Fix: Added Teacher batch fallback for custom/unlinked school entries
                    const teacherPayload = {
                        ...basePayload,
                        subjects: details.subjects || [],
                        curriculum: school.curriculum || '',
                        approvalStatus: 'pending',
                        createdAt: serverTimestamp(),
                    };

                    batch.set(profileRef, teacherPayload, { merge: true });
                    batch.set(userRef, teacherPayload, { merge: true });

                } else if (role === 'student') {
                    // ✅ Fix: Added Student batch fallback for custom/unlinked school entries
                    const studentPayload = {
                        ...basePayload,
                        grade: details.grade || '',
                        curriculum: school.curriculum || '',
                        createdAt: serverTimestamp(),
                    };

                    batch.set(profileRef, studentPayload, { merge: true });
                    batch.set(userRef, studentPayload, { merge: true });
                }

                await batch.commit();
            }

            const summaryData = {
                displayName,
                role,
                schoolName: school.name || '',
                code: generatedCode || '',
            };
            setCreatedProfile(summaryData);

            if (onComplete) {
                onComplete({ role, displayName, schoolId, code: generatedCode });
            }
        } catch (err) {
            console.error('[ProfileSetup] Write error:', err);
            setError(err.message || 'Failed to save setup profile. Please try again.');
        } finally {
            setSaving(false);
            savingRef.current = false;
        }
    };

    const handleNext = () => {
        if (step < 3) {
            setStep(prev => prev + 1);
        } else {
            saveProfile();
        }
    };

    const handleBack = () => {
        if (step > 0) setStep(prev => prev - 1);
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white dark:bg-slate-900 py-8 px-4 shadow-xl rounded-3xl sm:px-10 border border-slate-100 dark:border-slate-800">
                    <StepDots current={step} total={4} />

                    <h1 className="text-xl font-black text-center text-slate-800 dark:text-white mb-6">
                        {STEP_TITLES[step]}
                    </h1>

                    <ErrorBox message={error} />

                    <div className="mt-4">
                        {step === 0 && <StepRole role={role} onSelect={setRole} />}
                        {step === 1 && <StepSchool role={role} school={school} onChange={setSchool} />}
                        {step === 2 && (
                            <StepDetails
                                role={role}
                                details={details}
                                onChange={setDetails}
                                subjects={aiSubjects}
                                subjectsLoading={subjectsLoading}
                                curriculum={school.curriculum}
                            />
                        )}
                        {step === 3 && (
                            <StepDone
                                role={role}
                                details={details}
                                createdProfile={createdProfile}
                                email={email}
                            />
                        )}


                    </div>

                    <div className="mt-8 flex items-center gap-3">
                        {step > 0 && <BackButton onClick={handleBack} />}
                        <NextButton
                            onClick={handleNext}
                            disabled={!canProceed()}
                            loading={saving}
                        >
                            {step === 3 ? 'Finish' : 'Continue'}
                        </NextButton>
                    </div>
                </div>
            </div>
        </div>
    );
}
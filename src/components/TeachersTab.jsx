import React, { useMemo, useState, useCallback } from 'react';
import {
    ChevronDown, ChevronRight, Users, FileText, GraduationCap,
    AlertTriangle, Search, CalendarDays, Award, BookOpen, Activity
} from 'lucide-react';




/* ────────────────────────────────────────────────────────────
   Small helpers — tolerant of the mixed field names in Firestore
   (studentId vs studentUid, score vs percentage, teacherId vs uid)
   ──────────────────────────────────────────────────────────── */
const nameOf = (s) =>
    [s?.name, s?.surname].filter(Boolean).join(' ').trim() ||
    s?.displayName || s?.fullName || s?.email || '';

const toDate = (v) => {
    if (!v) return null;
    if (typeof v?.toDate === 'function') return v.toDate();
    if (v instanceof Date) return v;
    if (typeof v === 'number') return new Date(v);
    if (typeof v === 'object' && typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
};

const fmtDate = (d) =>
    d ? d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const daysSince = (d) => (d ? Math.floor((Date.now() - d.getTime()) / 86400000) : null);

const norm = (s) => (s || '').toString().trim().toLowerCase();
const round = (n) => Math.round(Number(n) || 0);
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

const scoreOf = (a) => Number(a?.percentage ?? a?.score ?? 0);
const studentKeyOf = (a) => a?.studentUid || a?.studentId || a?.studentName || null;
const teacherKeyOf = (ex) => ex?.teacherId || ex?.teacherUid || ex?.uploadedBy || null;
const examDateOf = (ex) => toDate(ex?.createdAt ?? ex?.uploadedAt ?? ex?.dateUploaded ?? ex?.timestamp);

const PASS_MARK = 40;

/* ── tiny presentational bits, styled to match the dashboard ── */

const ScoreBadge = ({ score }) => {
    const s = round(score);
    const tone =
        s >= 75 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10'
            : s >= 50 ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10'
                : 'bg-red-50 text-red-500 dark:bg-red-500/10';
    return <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-lg ${tone}`}>{s}%</span>;
};

const Stat = ({ icon: Icon, label, value, hint }) => (
    <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-slate-400">
            <Icon size={11} />
            <span className="text-[9px] font-black uppercase tracking-wide">{label}</span>
        </div>
        <p className="text-sm font-black text-slate-800 dark:text-white mt-1">{value}</p>
        {hint && <p className="text-[9px] text-slate-400 mt-0.5 truncate">{hint}</p>}
    </div>
);

// Full class strings only — Tailwind purges anything it can't see literally.
const BAR_TONES = { emerald: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500' };

const Bar = ({ value, tone = 'emerald' }) => (
    <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full ${BAR_TONES[tone]}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
);

const RATINGS = [
    { min: 80, label: 'Excellent', tone: 'emerald' },
    { min: 65, label: 'Strong', tone: 'sky' },
    { min: 50, label: 'Developing', tone: 'amber' },
    { min: 0, label: 'Needs support', tone: 'red' },
];
const bandOf = (n) => RATINGS.find(r => n >= r.min);

const Band = ({ value }) => {
    const b = bandOf(value);
    const tone = {
        emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10',
        sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10',
        amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10',
        red: 'bg-red-50 text-red-500 dark:bg-red-500/10',
    }[b.tone];
    return (
        <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg whitespace-nowrap ${tone}`}>
            {b.label} · {round(value)}
        </span>
    );
};

/* ────────────────────────────────────────────────────────────
   Aggregation: teachers → subjects → exams → attempts
   ──────────────────────────────────────────────────────────── */

function buildTeacherRecords({ teachers, exams, attempts, students, targetExamsPerSubject }) {
    // attempts grouped by exam
    const attemptsByExam = new Map();
    attempts.forEach(a => {
        const k = a.examId || a.exam_id;
        if (!k) return;
        if (!attemptsByExam.has(k)) attemptsByExam.set(k, []);
        attemptsByExam.get(k).push(a);
    });

    // exams grouped by teacher (id first, display name as legacy fallback)
    const byId = new Map();
    const byName = new Map();
    exams.forEach(ex => {
        const id = teacherKeyOf(ex);
        if (id) {
            if (!byId.has(id)) byId.set(id, []);
            byId.get(id).push(ex);
        } else if (ex.teacherName) {
            const n = norm(ex.teacherName);
            if (!byName.has(n)) byName.set(n, []);
            byName.get(n).push(ex);
        }
    });

    const claimed = new Set();

    const build = (teacher) => {
        const tid = teacher.id || teacher.uid;
        const tname = teacher.name || teacher.fullName || teacher.displayName || teacher.email || 'Unnamed teacher';

        const owned = [
            ...(byId.get(tid) || []),
            ...(byName.get(norm(tname)) || []),
        ];
        owned.forEach(ex => claimed.add(ex.id));

        // subjects: roster subjects ∪ subjects seen on uploads
        const subjectNames = Array.from(new Set([
            ...(Array.isArray(teacher.subjects) ? teacher.subjects : teacher.subject ? [teacher.subject] : []),
            ...owned.map(ex => ex.subject).filter(Boolean),
        ]));

        const subjects = subjectNames.map(subject => {
            const subjExams = owned.filter(ex => norm(ex.subject) === norm(subject));
            const grades = Array.from(new Set(subjExams.map(ex => ex.grade).filter(Boolean)));

            // roster enrolment: students in a matching grade who list this subject
            const enrolled = students.filter(s => {
                const sSubjects = Array.isArray(s.subjects) ? s.subjects.map(norm) : null;
                const subjectOk = sSubjects ? sSubjects.includes(norm(subject)) : false;
                const gradeOk = grades.length ? grades.map(norm).includes(norm(s.grade)) : true;
                return subjectOk && gradeOk;
            }).length;

            const examRows = subjExams.map(ex => {
                const atts = attemptsByExam.get(ex.id) || [];
                const scores = atts.map(scoreOf);
                return {
                    id: ex.id,
                    title: ex.title || ex.subject || ex.id,
                    grade: ex.grade || '—',
                    uploadedAt: examDateOf(ex),
                    attempts: atts,
                    written: atts.length,
                    avg: mean(scores),
                    passRate: atts.length ? (scores.filter(s => s >= PASS_MARK).length / atts.length) * 100 : 0,
                    top: [...atts].sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, 3),
                    bottom: [...atts].sort((a, b) => scoreOf(a) - scoreOf(b)).slice(0, 3),
                };
            }).sort((a, b) => (b.uploadedAt?.getTime() || 0) - (a.uploadedAt?.getTime() || 0));

            const allAtts = examRows.flatMap(r => r.attempts);
            const scores = allAtts.map(scoreOf);
            const assessed = new Set(allAtts.map(studentKeyOf).filter(Boolean)).size;
            const lastUpload = examRows[0]?.uploadedAt || null;

            const avg = mean(scores);
            const passRate = scores.length ? (scores.filter(s => s >= PASS_MARK).length / scores.length) * 100 : 0;
            const coverage = Math.min(100, (examRows.length / targetExamsPerSubject) * 100);
            const denom = enrolled || Math.max(assessed, 1);
            const participation = examRows.length
                ? Math.min(100, (mean(examRows.map(r => r.written)) / denom) * 100)
                : 0;

            // Principal-facing composite. Weights are declared here so they can be tuned in one place.
            const assessment = avg * 0.35 + passRate * 0.25 + coverage * 0.20 + participation * 0.20;

            const flags = [];
            if (!examRows.length) flags.push('No exams uploaded for this subject');
            if (examRows.length && passRate < 50) flags.push(`Pass rate ${round(passRate)}% — below half the class`);
            if (examRows.length && participation < 60) flags.push(`Only ~${round(mean(examRows.map(r => r.written)))} of ${denom} learners are writing`);
            if (lastUpload && daysSince(lastUpload) > 30) flags.push(`Last upload ${daysSince(lastUpload)} days ago`);
            if (examRows.length && coverage < 100) flags.push(`${examRows.length} of ${targetExamsPerSubject} expected assessments uploaded`);

            return {
                subject, grades, enrolled, assessed, lastUpload,
                exams: examRows, written: allAtts.length,
                avg, passRate, coverage, participation, assessment, flags,
            };
        }).sort((a, b) => b.assessment - a.assessment);

        const allAtts = subjects.flatMap(s => s.exams.flatMap(e => e.attempts));
        const scores = allAtts.map(scoreOf);
        const lastUpload = subjects.map(s => s.lastUpload).filter(Boolean)
            .sort((a, b) => b.getTime() - a.getTime())[0] || null;

        return {
            id: tid,
            name: tname,
            email: teacher.email || '',
            joinedAt: toDate(teacher.createdAt ?? teacher.joinedAt),
            orphan: !!teacher.__orphan,
            subjects,
            examCount: subjects.reduce((n, s) => n + s.exams.length, 0),
            written: allAtts.length,
            studentsEnrolled: subjects.reduce((n, s) => n + s.enrolled, 0),
            studentsAssessed: new Set(allAtts.map(studentKeyOf).filter(Boolean)).size,
            avg: mean(scores),
            passRate: scores.length ? (scores.filter(s => s >= PASS_MARK).length / scores.length) * 100 : 0,
            assessment: subjects.length ? mean(subjects.map(s => s.assessment)) : 0,
            lastUpload,
            active: lastUpload ? daysSince(lastUpload) <= 30 : false,
        };
    };

    const records = teachers.map(build);

    // Exams whose teacher is not on the staff list — surfaced so the principal
    // can see uploads that would otherwise vanish from every total.
    const unclaimed = exams.filter(ex => !claimed.has(ex.id));
    if (unclaimed.length) {
        const names = Array.from(new Set(unclaimed.map(ex => ex.teacherName).filter(Boolean)));
        records.push(build({
            id: '__unassigned__',
            name: 'Unlinked uploads',
            email: names.length ? names.join(', ') : 'No teacher record matched',
            subjects: Array.from(new Set(unclaimed.map(ex => ex.subject).filter(Boolean))),
            __orphan: true,
        }));
        // build() cannot find these by id/name, so attach them directly
        const rec = records[records.length - 1];
        if (!rec.examCount) {
            rec.subjects = Array.from(new Set(unclaimed.map(ex => ex.subject || 'Unspecified'))).map(subject => {
                const subjExams = unclaimed.filter(ex => (ex.subject || 'Unspecified') === subject);
                const examRows = subjExams.map(ex => {
                    const atts = attemptsByExam.get(ex.id) || [];
                    const scores = atts.map(scoreOf);
                    return {
                        id: ex.id, title: ex.title || subject, grade: ex.grade || '—',
                        uploadedAt: examDateOf(ex), attempts: atts, written: atts.length,
                        avg: mean(scores),
                        passRate: atts.length ? (scores.filter(s => s >= PASS_MARK).length / atts.length) * 100 : 0,
                        top: [...atts].sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, 3),
                        bottom: [...atts].sort((a, b) => scoreOf(a) - scoreOf(b)).slice(0, 3),
                    };
                });
                const allAtts = examRows.flatMap(r => r.attempts);
                const scores = allAtts.map(scoreOf);
                return {
                    subject, grades: [], enrolled: 0,
                    assessed: new Set(allAtts.map(studentKeyOf).filter(Boolean)).size,
                    lastUpload: examRows[0]?.uploadedAt || null,
                    exams: examRows, written: allAtts.length,
                    avg: mean(scores),
                    passRate: scores.length ? (scores.filter(s => s >= PASS_MARK).length / scores.length) * 100 : 0,
                    coverage: 0, participation: 0, assessment: 0,
                    flags: ['These uploads carry no teacherId — link them to a staff record'],
                };
            });
            rec.examCount = unclaimed.length;
            rec.written = rec.subjects.reduce((n, s) => n + s.written, 0);
        }
    }

    return records;
}

/* ────────────────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────────────────── */

export default function TeachersTab({
    teachers = [],
    exams = [],
    attempts = [],
    students = [],
    targetExamsPerSubject = 4,
    assessments = {},          // { "teacherId::Subject": { rating, notes } }
    onSaveAssessment,          // (teacherId, subject, { rating, notes }) => Promise|void
}) {
    const [query, setQuery] = useState('');
    const [subjectFilter, setSubjectFilter] = useState('All');
    const [sortBy, setSortBy] = useState('assessment');
    const [openTeacher, setOpenTeacher] = useState(null);
    const [openSubject, setOpenSubject] = useState(null);   // `${teacherId}::${subject}`
    const [openExam, setOpenExam] = useState(null);
    const [drafts, setDrafts] = useState({});
    const [saving, setSaving] = useState(null);
    const [saveError, setSaveError] = useState(null);
    const [saved, setSaved] = useState(null);   // key -> true when saved

    const studentNames = useMemo(() => {
        const map = new Map();
        for (const s of students) {
            const label = nameOf(s);
            if (!label) continue;
            for (const key of [s.uid, s.id, s.studentUid, s.email]) {
                if (key) map.set(key, label);
            }
        }
        return map;
    }, [students]);

    const displayName = useCallback((a) => {
        if (a?.studentName) return a.studentName;
        for (const key of [a?.studentUid, a?.studentId, a?.studentEmail]) {
            if (key && studentNames.has(key)) return studentNames.get(key);
        }
        return studentKeyOf(a) || '—';
    }, [studentNames]);

    const records = useMemo(
        () => buildTeacherRecords({ teachers, exams, attempts, students, targetExamsPerSubject }),
        [teachers, exams, attempts, students, targetExamsPerSubject]
    );

    const allSubjects = useMemo(
        () => Array.from(new Set(records.flatMap(r => r.subjects.map(s => s.subject)))).sort(),
        [records]
    );

    const visible = useMemo(() => {
        const q = norm(query);
        return records
            .filter(r => !q || norm(r.name).includes(q) || norm(r.email).includes(q))
            .filter(r => subjectFilter === 'All' || r.subjects.some(s => s.subject === subjectFilter))
            .sort((a, b) => {
                if (sortBy === 'name') return a.name.localeCompare(b.name);
                if (sortBy === 'exams') return b.examCount - a.examCount;
                if (sortBy === 'avg') return b.avg - a.avg;
                if (sortBy === 'students') return (b.studentsAssessed || b.studentsEnrolled) - (a.studentsAssessed || a.studentsEnrolled);
                return b.assessment - a.assessment;
            });
    }, [records, query, subjectFilter, sortBy]);

    const school = useMemo(() => {
        const staff = records.filter(r => !r.orphan);
        const scored = staff.filter(r => r.written > 0);
        return {
            total: staff.length,
            active: staff.filter(r => r.active).length,
            exams: staff.reduce((n, r) => n + r.examCount, 0),
            avg: mean(scored.map(r => r.avg)),
        };
    }, [records]);

    const draftFor = (key) => drafts[key] ?? assessments[key] ?? { rating: 0, notes: '' };
    const setDraft = (key, patch) =>
        setDrafts(d => ({ ...d, [key]: { ...draftFor(key), ...patch } }));

    const save = async (teacherId, subject) => {
        const key = `${teacherId}::${subject}`;
        if (!onSaveAssessment) {
            setSaveError('No save handler passed to TeachersTab.');
            return;
        }

        setSaving(key);
        setSaveError(null);
        try {
            await onSaveAssessment(teacherId, subject, draftFor(key));

            // Drop the local draft — the panel now reads from the `assessments`
            // prop, so the listener's value becomes the source of truth.
            setDrafts(d => {
                const next = { ...d };
                delete next[key];
                return next;
            });

            setSaved(key);
            setOpenSubject(null);                                   // collapse the panel
            setTimeout(() => setSaved(s => (s === key ? null : s)), 3000);
        } catch (err) {
            console.error('[save] failed', key, err);
            setSaveError(err?.message || String(err));
        } finally {
            setSaving(null);
        }
    };


    return (
        <>
            {/* ── school-wide strip ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-100 dark:bg-slate-700">
                <Stat icon={Users} label="Teachers" value={school.total} hint={`${school.active} active this month`} />
                <Stat icon={FileText} label="Exams uploaded" value={school.exams} />
                <Stat icon={Award} label="School average" value={`${round(school.avg)}%`} />
                <Stat icon={Activity} label="Dormant" value={school.total - school.active} hint="No upload in 30 days" />
            </div>

            {/* ── controls ── */}
            <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[160px]">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search teachers"
                        className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white outline-none font-bold"
                    />
                </div>
                <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}
                    className="px-2.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 outline-none font-bold text-slate-500 dark:text-slate-200">
                    <option value="All">All Subjects</option>
                    {allSubjects.map(s => <option key={s}>{s}</option>)}
                </select>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                    className="px-2.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 outline-none font-bold text-slate-500 dark:text-slate-200">
                    <option value="assessment">Sort: Assessment</option>
                    <option value="avg">Sort: Average</option>
                    <option value="exams">Sort: Exams</option>
                    <option value="students">Sort: Learners</option>
                    <option value="name">Sort: Name</option>
                </select>
            </div>

            {/* ── teacher cards ── */}
            <div className="space-y-3">
                {visible.map(t => {
                    const teacherReview = (() => {
                        const rs = t.subjects
                            .map(s => Number(assessments[`${t.id}::${s.subject}`]?.rating) || 0)
                            .filter(Boolean);
                        return {
                            avg: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0,
                            count: rs.length,
                        };
                    })();
                    const isOpen = openTeacher === t.id;
                    return (
                        <div key={t.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                            <button
                                className="w-full flex items-center gap-3 px-4 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                                onClick={() => setOpenTeacher(isOpen ? null : t.id)}>
                                <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                                    {t.orphan
                                        ? <AlertTriangle size={13} className="text-amber-500" />
                                        : <span className="text-[10px] font-black text-slate-500 dark:text-slate-300">
                                            {t.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                                        </span>}
                                </div>
                                <div className="flex-1 text-left min-w-0">
                                    <p className="text-xs font-black text-slate-800 dark:text-white truncate">{t.name}</p>
                                    <p className="text-[9px] text-slate-400 mt-0.5 truncate">
                                        {t.subjects.length ? t.subjects.map(s => s.subject).join(' · ') : 'No subjects assigned'}
                                    </p>
                                </div>
                                {teacherReview.count > 0 && (
                                    <span className="flex items-center gap-1 text-amber-500"
                                        title={`${teacherReview.avg.toFixed(1)}/5 across ${teacherReview.count} of ${t.subjects.length} subjects`}>
                                        {[1, 2, 3, 4, 5].map(n => (
                                            <Star key={n} size={9} className={n <= Math.round(teacherReview.avg) ? 'fill-current' : 'opacity-20'} />
                                        ))}
                                        <span className="text-[9px] font-black">
                                            {teacherReview.avg.toFixed(1)}
                                            <span className="text-slate-400 font-bold"> ({teacherReview.count}/{t.subjects.length})</span>
                                        </span>
                                    </span>
                                )}

                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-[9px] text-slate-400 hidden sm:block">{t.examCount} exams</span>
                                    <span className="text-[9px] text-slate-400 hidden md:block">{t.written} written</span>

                                    <ScoreBadge score={t.avg} />
                                    <span className="hidden sm:block"><Band value={t.assessment} /></span>
                                    {isOpen ? <ChevronDown size={13} className="text-slate-400" /> : <ChevronRight size={13} className="text-slate-400" />}
                                </div>
                            </button>

                            {isOpen && (
                                <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-4 space-y-4">
                                    {/* teacher-level numbers */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 ">
                                        <Stat icon={BookOpen} label="Subjects" value={t.subjects.length} />
                                        <Stat icon={GraduationCap} label="Learners"
                                            value={t.studentsAssessed || t.studentsEnrolled}
                                            hint={t.studentsEnrolled ? `${t.studentsEnrolled} on roster` : 'from attempts'} />
                                        <Stat icon={Award} label="Pass rate" value={`${round(t.passRate)}% `} />
                                        <Stat icon={CalendarDays} label="Last upload" value={fmtDate(t.lastUpload)}
                                            hint={t.lastUpload ? `${daysSince(t.lastUpload)} days ago` : 'never'} className="bg-slate-100 dark:bg-slate-700" />
                                    </div>

                                    {t.email && <p className="text-[9px] text-slate-400">{t.email}</p>}

                                    {/* subject breakdown */}
                                    <div className="space-y-2">
                                        <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-wide">Subject assessment</h3>

                                        {t.subjects.length === 0 && (
                                            <p className="text-xs text-slate-400">No subjects on record. Assign subjects on the staff profile.</p>
                                        )}

                                        {t.subjects.map(s => {
                                            const sKey = `${t.id}::${s.subject}`;
                                            const sOpen = openSubject === sKey;
                                            const draft = draftFor(sKey);
                                            return (
                                                <div key={sKey} className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                                                    <button
                                                        className="w-full flex items-center gap-3 px-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                                                        onClick={() => setOpenSubject(sOpen ? null : sKey)}>
                                                        <div className="flex-1 text-left min-w-0">
                                                            <p className="text-[11px] font-black text-slate-700 dark:text-slate-100 truncate">{s.subject}</p>
                                                            <p className="text-[9px] text-slate-400 mt-0.5 truncate">
                                                                {s.exams.length} exams · {s.written} written · {s.assessed || s.enrolled} learners
                                                                {s.grades.length ? ` · ${s.grades.join(', ')}` : ''}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                            {s.flags.length > 0 && (
                                                                <span className="flex items-center gap-0.5 text-[9px] font-black text-amber-500">
                                                                    <AlertTriangle size={10} />{s.flags.length}
                                                                </span>
                                                            )}
                                                            <ScoreBadge score={s.avg} />
                                                            <Band value={s.assessment} />
                                                            {sOpen ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
                                                        </div>
                                                    </button>

                                                    {sOpen && (
                                                        <div className="border-t border-slate-100 dark:border-slate-700 px-3 py-3 space-y-4 bg-slate-50/50 dark:bg-slate-900/20">
                                                            {/* four scoring components */}
                                                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                                                {[
                                                                    { label: 'Average mark', value: s.avg, note: 'weight 35%' },
                                                                    { label: 'Pass rate', value: s.passRate, note: `pass = ${PASS_MARK}%` },
                                                                    { label: 'Coverage', value: s.coverage, note: `${s.exams.length}/${targetExamsPerSubject} expected` },
                                                                    { label: 'Participation', value: s.participation, note: 'writers per exam' },
                                                                ].map(m => (
                                                                    <div key={m.label}>
                                                                        <div className="flex items-baseline justify-between mb-1">
                                                                            <span className="text-[9px] font-black text-slate-500 dark:text-slate-300 uppercase">{m.label}</span>
                                                                            <span className="text-[10px] font-black text-slate-700 dark:text-white">{round(m.value)}%</span>
                                                                        </div>
                                                                        <Bar value={m.value} tone={m.value >= 65 ? 'emerald' : m.value >= 45 ? 'amber' : 'red'} />
                                                                        <p className="text-[9px] text-slate-400 mt-1">{m.note}</p>
                                                                    </div>
                                                                ))}
                                                            </div>

                                                            {s.flags.length > 0 && (
                                                                <ul className="space-y-1">
                                                                    {s.flags.map(f => (
                                                                        <li key={f} className="flex items-start gap-1.5 text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                                                                            <AlertTriangle size={10} className="mt-0.5 flex-shrink-0" />{f}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            )}

                                                            {/* exam-by-exam */}
                                                            <div className="overflow-x-auto">
                                                                <table className="w-full text-xs min-w-[460px]">
                                                                    <thead>
                                                                        <tr className="border-b border-slate-200 dark:border-slate-700">
                                                                            {['Exam', 'Grade', 'Uploaded', 'Written', 'Average', 'Pass', ''].map(h => (
                                                                                <th key={h} className="text-left px-2 py-2 font-black text-slate-400 uppercase text-[9px]">{h}</th>
                                                                            ))}
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {s.exams.map(ex => {
                                                                            const eOpen = openExam === ex.id;
                                                                            return (
                                                                                <React.Fragment key={ex.id}>
                                                                                    <tr
                                                                                        className="border-b border-slate-100 dark:border-slate-700/50 cursor-pointer hover:bg-white dark:hover:bg-slate-800/60"
                                                                                        onClick={() => setOpenExam(eOpen ? null : ex.id)}>
                                                                                        <td className="px-2 py-2 font-bold text-slate-700 dark:text-slate-200 max-w-[160px] truncate">{ex.title}</td>
                                                                                        <td className="px-2 py-2 text-slate-400">{ex.grade}</td>
                                                                                        <td className="px-2 py-2 text-slate-400 whitespace-nowrap">{fmtDate(ex.uploadedAt)}</td>
                                                                                        <td className="px-2 py-2 text-slate-400">{ex.written}</td>
                                                                                        <td className="px-2 py-2"><ScoreBadge score={ex.avg} /></td>
                                                                                        <td className="px-2 py-2">
                                                                                            <span className={`text-[9px] font-black ${ex.passRate >= 50 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                                                {round(ex.passRate)}%
                                                                                            </span>
                                                                                        </td>
                                                                                        <td className="px-2 py-2 text-right">
                                                                                            {eOpen ? <ChevronDown size={12} className="text-slate-400 inline" /> : <ChevronRight size={12} className="text-slate-400 inline" />}
                                                                                        </td>
                                                                                    </tr>
                                                                                    {eOpen && (
                                                                                        <tr className="border-b border-slate-100 dark:border-slate-700/50">
                                                                                            <td colSpan={7} className="px-2 py-3 bg-white dark:bg-slate-800/50">
                                                                                                {ex.written === 0
                                                                                                    ? <p className="text-[10px] text-slate-400">Nobody has written this exam yet.</p>
                                                                                                    : (
                                                                                                        <div className="grid sm:grid-cols-2 gap-4">
                                                                                                            {[
                                                                                                                { title: 'Top performers', rows: ex.top },
                                                                                                                { title: 'Needs intervention', rows: ex.bottom },
                                                                                                            ].map(group => (
                                                                                                                <div key={group.title}>
                                                                                                                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1.5">{group.title}</p>
                                                                                                                    <div className="space-y-1">
                                                                                                                        {group.rows.map(a => (
                                                                                                                            <div key={a.id} className="flex items-center justify-between gap-2">
                                                                                                                                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate">
                                                                                                                                    {displayName(a)}
                                                                                                                                </span>
                                                                                                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                                                                                                    <span className="text-[9px] text-slate-400">{a.markedBy || 'AI'}</span>
                                                                                                                                    <ScoreBadge score={scoreOf(a)} />
                                                                                                                                </div>
                                                                                                                            </div>
                                                                                                                        ))}
                                                                                                                    </div>
                                                                                                                </div>
                                                                                                            ))}
                                                                                                        </div>
                                                                                                    )}
                                                                                            </td>
                                                                                        </tr>
                                                                                    )}
                                                                                </React.Fragment>
                                                                            );
                                                                        })}
                                                                        {s.exams.length === 0 && (
                                                                            <tr><td colSpan={7} className="px-2 py-3 text-[10px] text-slate-400">No exams uploaded for this subject.</td></tr>
                                                                        )}
                                                                    </tbody>
                                                                </table>
                                                            </div>

                                                            {/* principal's own review */}
                                                            {!t.orphan && (
                                                                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
                                                                    <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Principal's review — {s.subject}</p>

                                                                    <div className="flex items-center gap-1.5 mb-2">
                                                                        {[1, 2, 3, 4, 5].map(n => (
                                                                            <button
                                                                                key={n}
                                                                                type="button"
                                                                                onClick={() => setDraft(sKey, { rating: n })}
                                                                                className={`w-7 h-7 rounded-lg text-[10px] font-black transition-colors ${draft.rating >= n
                                                                                    ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900'
                                                                                    : 'bg-slate-100 text-slate-400 dark:bg-slate-700'
                                                                                    }`}
                                                                            >
                                                                                {n}
                                                                            </button>
                                                                        ))}
                                                                        <span className="text-[9px] text-slate-400 ml-1">1 = needs support, 5 = exemplary</span>
                                                                    </div>

                                                                    <textarea
                                                                        rows={2}
                                                                        value={draft.notes}
                                                                        onChange={e => setDraft(sKey, { notes: e.target.value })}
                                                                        placeholder="What you observed, and what happens next."
                                                                        className="w-full px-2.5 py-2 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white outline-none resize-none"
                                                                    />

                                                                    <div className="flex items-center justify-end gap-2 mt-2">
                                                                        {saveError && <span className="text-[10px] font-bold text-red-500 flex-1">{saveError}</span>}
                                                                        <button
                                                                            disabled={!onSaveAssessment || saving === sKey}
                                                                            onClick={() => save(t.id, s.subject)}
                                                                            className="px-3 py-1.5 rounded-lg bg-slate-800 dark:bg-white text-white dark:text-slate-900 text-[10px] font-black disabled:opacity-40">
                                                                            {saving === sKey ? 'Saving…' : 'Save review'}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <button
                                                                className="w-full flex items-center gap-3 px-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                                                                onClick={() => setOpenSubject(sOpen ? null : sKey)}>

                                                                <div className="flex-1 text-left min-w-0">
                                                                    <p className="text-[11px] font-black text-slate-700 dark:text-slate-100 truncate">{s.subject}</p>
                                                                    <p className="text-[9px] text-slate-400 mt-0.5 truncate">
                                                                        {s.exams.length} exams · {s.written} written · {s.assessed || s.enrolled} learners
                                                                        {s.grades.length ? ` · ${s.grades.join(', ')}` : ''}
                                                                    </p>
                                                                </div>

                                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                                    {(() => {
                                                                        const rating = Number(assessments[sKey]?.rating) || 0;
                                                                        if (!rating) return null;
                                                                        return (
                                                                            <span className="flex items-center gap-0.5 text-amber-500" title={`Reviewed ${rating}/5`}>
                                                                                {[1, 2, 3, 4, 5].map(n => (
                                                                                    <Star key={n} size={9} className={n <= rating ? 'fill-current' : 'opacity-20'} />
                                                                                ))}
                                                                            </span>
                                                                        );
                                                                    })()}
                                                                    {saved === sKey && <span className="text-[9px] font-black text-emerald-600">Saved ✓</span>}
                                                                    {s.flags.length > 0 && (
                                                                        <span className="flex items-center gap-0.5 text-[9px] font-black text-amber-500">
                                                                            <AlertTriangle size={10} />{s.flags.length}
                                                                        </span>
                                                                    )}
                                                                    <ScoreBadge score={s.avg} />
                                                                    <Band value={s.assessment} />
                                                                    {sOpen ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
                                                                </div>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {visible.length === 0 && (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-10 text-center">
                        <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-xs text-slate-400">
                            {records.length ? 'No teachers match this filter.' : 'No teachers have joined this school yet.'}
                        </p>
                    </div>
                )}
            </div>
        </>
    );
}
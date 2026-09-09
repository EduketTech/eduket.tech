import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../utils/firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
    ClipboardList, ChevronDown, ChevronUp, CheckCircle, XCircle,
    AlertCircle, Download, Pencil, Sparkles, X, Save, RotateCcw,
    BadgeCheck, User, FileText, Calendar, TrendingUp, TrendingDown
} from "lucide-react";


// ── Status helpers ────────────────────────────────────────────────────────────
const STATUS = {
    correct: { color: "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800", icon: <CheckCircle size={14} className="text-green-500" />, pill: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
    partial: { color: "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800", icon: <AlertCircle size={14} className="text-yellow-500" />, pill: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
    incorrect: { color: "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800", icon: <XCircle size={14} className="text-red-500" />, pill: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
    no_memo: { color: "bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-800", icon: <AlertCircle size={14} className="text-purple-400" />, pill: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
    missing: { color: "bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700", icon: <AlertCircle size={14} className="text-slate-400" />, pill: "bg-slate-100 text-slate-500" },
};

const STATUSES = ["correct", "partial", "incorrect", "no_memo"];

const pctColor = (p) => p >= 70 ? "text-green-600 dark:text-green-400" : p >= 50 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400";
const pctBg = (p) => p >= 70 ? "from-green-500 to-emerald-600" : p >= 50 ? "from-yellow-500 to-orange-500" : "from-red-500 to-rose-600";

// ── Remark Modal ──────────────────────────────────────────────────────────────
function RemarkModal({ attempt, onClose, onSave }) {
    const [step, setStep] = useState("choose");
    const [mode, setMode] = useState(null);
    const [rows, setRows] = useState(() =>
        JSON.parse(JSON.stringify(attempt.markedResults || []))
    );
    const [teacherNote, setTeacherNote] = useState(attempt.teacherNote || "");
    const [aiError, setAiError] = useState(null);
    const [saveError, setSaveError] = useState(null);
    const [saving, setSaving] = useState(false);

    // Dynamic fallback for total possible marks
    const totalPossible = attempt.total || attempt.totalMarks || attempt.maxScore ||
        rows.reduce((s, r) => s + (parseFloat(r.marks) || 0), 0);

    // Live computed totals (handles empty inputs cleanly)
    const newScore = rows.reduce((s, r) => {
        const val = parseFloat(r.earned);
        const earned = isNaN(val) ? 0 : val;
        const max = parseFloat(r.marks) || 0;
        return s + Math.min(Math.max(0, earned), max);
    }, 0);

    const newPct = totalPossible > 0 ? Math.round((newScore / totalPossible) * 100) : 0;

    const runAiRemark = async () => {
        setStep("ai-loading");
        setAiError(null);
        try {
            const API = import.meta.env.VITE_API_URL;
            const auth = getAuth()
            const token = await auth.currentUser.getIdToken();   // or however this component gets the current user elsewhere in your app

            const res = await fetch(`${API}/remark`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
                body: JSON.stringify({
                    results: rows,
                    subject: attempt.subject,
                    exam_id: attempt.examId,
                }),
            });

            if (!res.ok) throw new Error(`Server error: ${res.status}`);

            const data = await res.json();
            const parsed = data.results || [];

            setRows(prev => prev.map((r, i) => {
                const update = parsed.find(p => p.idx === i || p.idx === (i + 1) || p.question_number === r.question_number) ?? parsed[i];
                if (!update) return r;
                return {
                    ...r,
                    earned: update.earned ?? r.earned,
                    status: update.status ?? r.status,
                    feedback: update.feedback ?? r.feedback
                };
            }));

            setMode("ai");
            setStep("edit");
        } catch (err) {
            console.error("AI remark error:", err);
            setAiError("AI re-marking failed. You can review manually below.");
            setMode("ai");
            setStep("edit");
        }
    };

    const updateRow = (i, field, value) =>
        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));

    const handleSave = async () => {
        setSaving(true);
        setSaveError(null);
        try {
            // Clean up empty string values back to numbers prior to submission
            const cleanedRows = rows.map(r => ({
                ...r,
                earned: parseFloat(r.earned) || 0
            }));

            await onSave({
                markedResults: cleanedRows,
                score: newScore,
                percentage: newPct,
                teacherNote: teacherNote.trim(),
                remarkedAt: new Date(),
                remarkedBy: mode === "ai" ? "ai+teacher" : "teacher",
            });
            onClose();
        } catch (err) {
            console.error("Save failed:", err);
            setSaveError(err.message || "Failed to save remark. Check database permissions.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
                    <div>
                        <h3 className="font-black text-lg">Remark Attempt</h3>
                        <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">
                            {attempt.resolvedTitle || attempt.examTitle || "Exam"} — {attempt.studentId || "Student"}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <X size={18} className="text-slate-500" />
                    </button>
                </div>

                {step === "choose" && (
                    <div className="p-8 flex flex-col gap-4">
                        <p className="text-sm text-slate-500 text-center mb-2">
                            How would you like to remark this submission?
                        </p>
                        <button
                            onClick={runAiRemark}
                            className="flex items-center gap-4 p-5 rounded-2xl border-2 border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 hover:border-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-all text-left group"
                        >
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-md">
                                <Sparkles size={22} className="text-white" />
                            </div>
                            <div>
                                <p className="font-bold text-indigo-700 dark:text-indigo-300">AI Re-Mark</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    Claude re-reads all questions & answers and applies fresh marks. You can review and adjust before saving.
                                </p>
                            </div>
                        </button>

                        <button
                            onClick={() => { setMode("manual"); setStep("edit"); }}
                            className="flex items-center gap-4 p-5 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all text-left"
                        >
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center flex-shrink-0 shadow-md">
                                <Pencil size={22} className="text-white" />
                            </div>
                            <div>
                                <p className="font-bold text-slate-700 dark:text-slate-200">Manual Adjust</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    Edit marks, status, and feedback per question yourself. Changes save immediately.
                                </p>
                            </div>
                        </button>
                    </div>
                )}

                {step === "ai-loading" && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-12">
                        <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg animate-pulse">
                            <Sparkles size={30} className="text-white" />
                        </div>
                        <p className="font-bold text-slate-700 dark:text-slate-200">Claude is re-marking…</p>
                        <p className="text-xs text-slate-400 text-center max-w-xs">
                            Reading each question, the correct answer, and the student's response to apply fair marks.
                        </p>
                    </div>
                )}

                {step === "edit" && (
                    <>
                        <div className="flex-1 overflow-y-auto p-5 space-y-3">
                            {aiError && (
                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-xs text-red-600 dark:text-red-300 mb-2">
                                    ⚠️ {aiError}
                                </div>
                            )}

                            {saveError && (
                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-xs text-red-600 dark:text-red-300 mb-2">
                                    ⚠️ {saveError}
                                </div>
                            )}

                            {mode === "ai" && !aiError && (
                                <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-3 text-xs text-indigo-700 dark:text-indigo-300 flex items-center gap-2 mb-2">
                                    <Sparkles size={13} />
                                    AI marks applied — review and adjust anything before saving.
                                </div>
                            )}

                            {rows.map((r, i) => {
                                const st = STATUS[r.status] || STATUS.missing;
                                const maxMarks = r.marks || 0;
                                return (
                                    <div key={i} className={`border rounded-2xl p-4 ${st.color}`}>
                                        <div className="flex items-start gap-2 mb-3">
                                            {st.icon}
                                            <div className="flex-1 min-w-0">
                                                <span className="font-bold text-xs text-slate-500 mr-1">{r.question_number || `Q${i + 1}`}</span>
                                                <span className="text-sm text-slate-700 dark:text-slate-200">{r.question}</span>
                                            </div>
                                            <span className="text-xs text-slate-400 flex-shrink-0">/ {maxMarks} mk{maxMarks !== 1 ? "s" : ""}</span>
                                        </div>

                                        <div className="pl-5 mb-3 text-xs text-slate-500 dark:text-slate-400 italic">
                                            <span className="not-italic font-semibold text-slate-600 dark:text-slate-300">Student: </span>
                                            {r.student_answer || "No answer"}
                                        </div>

                                        <div className="pl-5 grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                                                    Marks Earned
                                                </label>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={maxMarks}
                                                        step={0.5}
                                                        value={r.earned ?? ""}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            updateRow(i, "earned", val === "" ? "" : parseFloat(val) || 0);
                                                        }}
                                                        className="w-20 text-sm font-black px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-400"
                                                    />
                                                    <span className="text-xs text-slate-400">/ {maxMarks}</span>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                                                    Status
                                                </label>
                                                <select
                                                    value={r.status || "incorrect"}
                                                    onChange={e => updateRow(i, "status", e.target.value)}
                                                    className="text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-400 w-full"
                                                >
                                                    {STATUSES.map(s => (
                                                        <option key={s} value={s}>{s}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="col-span-2">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                                                    Feedback (optional)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={r.feedback || ""}
                                                    onChange={e => updateRow(i, "feedback", e.target.value)}
                                                    placeholder="Add feedback for the student…"
                                                    className="w-full text-xs px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder-slate-300 outline-none focus:ring-2 focus:ring-indigo-400"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            <div className="mt-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                                    Overall Teacher Note (shown to student)
                                </label>
                                <textarea
                                    rows={2}
                                    value={teacherNote}
                                    onChange={e => setTeacherNote(e.target.value)}
                                    placeholder="e.g. Re-marked after moderation. Marks adjusted on Q3."
                                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder-slate-300 outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex-shrink-0 border-t border-slate-100 dark:border-slate-800 px-6 py-4 flex items-center justify-between gap-4 bg-white dark:bg-slate-900">
                            <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${pctBg(newPct)} flex flex-col items-center justify-center`}>
                                    <span className="text-white font-black text-base leading-none">{newPct}%</span>
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">New Score</p>
                                    <p className={`text-sm font-black ${pctColor(newPct)}`}>{newScore} / {totalPossible}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setStep("choose")}
                                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all flex items-center gap-1.5"
                                >
                                    <RotateCcw size={14} /> Back
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-bold shadow-sm transition-all flex items-center gap-1.5"
                                >
                                    {saving ? "Saving…" : <><Save size={14} /> Save Remark</>}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// Period modal for generating report
function ReportPeriodModal({ onClose, onGenerate, availableSubjects }) {
    const [period, setPeriod] = useState("month");
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const [subjectMode, setSubjectMode] = useState("all"); // "all" | "select"
    const [selectedSubjects, setSelectedSubjects] = useState([]);

    const canGenerate =
        (period !== "custom" || (customStart && customEnd)) &&
        (subjectMode !== "select" || selectedSubjects.length > 0);

    const toggleSubject = (subj) => {
        setSelectedSubjects(prev =>
            prev.includes(subj) ? prev.filter(s => s !== subj) : [...prev, subj]
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700 overflow-hidden max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
                    <div>
                        <h3 className="font-black text-lg">Generate Report</h3>
                        <p className="text-xs text-slate-400 mt-0.5">Choose period and subjects to include</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
                        <X size={18} className="text-slate-500" />
                    </button>
                </div>

                <div className="p-6 space-y-5 overflow-y-auto">
                    {/* Period */}
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Period</label>
                        <div className="space-y-2">
                            {PERIOD_OPTIONS.map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => setPeriod(opt.id)}
                                    className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all text-sm font-semibold flex items-center justify-between ${period === opt.id
                                        ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300"
                                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300"
                                        }`}
                                >
                                    {opt.label}
                                    {period === opt.id && <CheckCircle size={16} />}
                                </button>
                            ))}
                        </div>

                        {period === "custom" && (
                            <div className="grid grid-cols-2 gap-3 pt-3">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">From</label>
                                    <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                                        className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:ring-2 focus:ring-indigo-400" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">To</label>
                                    <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                                        className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:ring-2 focus:ring-indigo-400" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Subjects */}
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Subjects</label>
                        <div className="flex gap-2 mb-3">
                            <button
                                onClick={() => { setSubjectMode("all"); setSelectedSubjects([]); }}
                                className={`flex-1 px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${subjectMode === "all"
                                    ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300"
                                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                                    }`}
                            >
                                All Subjects
                            </button>
                            <button
                                onClick={() => setSubjectMode("select")}
                                className={`flex-1 px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${subjectMode === "select"
                                    ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300"
                                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                                    }`}
                            >
                                Select Subjects
                            </button>
                        </div>

                        {subjectMode === "select" && (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                {availableSubjects.length === 0 ? (
                                    <p className="text-xs text-slate-400 italic">No subjects found in attempts.</p>
                                ) : availableSubjects.map(subj => (
                                    <button
                                        key={subj}
                                        onClick={() => toggleSubject(subj)}
                                        className={`w-full text-left px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all ${selectedSubjects.includes(subj)
                                            ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300"
                                            : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                                            }`}
                                    >
                                        {subj}
                                        {selectedSubjects.includes(subj) && <CheckCircle size={14} />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 flex-shrink-0">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                        Cancel
                    </button>
                    <button
                        onClick={() => canGenerate && onGenerate(period, customStart, customEnd, subjectMode === "all" ? null : selectedSubjects)}
                        disabled={!canGenerate}
                        className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold shadow-sm flex items-center gap-1.5"
                    >
                        <FileText size={14} /> Generate
                    </button>
                </div>
            </div>
        </div>
    );
}


// ── Single attempt card ───────────────────────────────────────────────────────
function AttemptCard({ attempt, teacherMode, onRemark, displayName }) {
    const [expanded, setExpanded] = useState(false);
    const pct = attempt.percentage ?? 0;
    const date = attempt.completedAt?.toDate?.()?.toLocaleDateString("en-ZA", {
        day: "numeric", month: "short", year: "numeric",
    }) ?? "—";
    const [expandedAnswers, setExpandedAnswers] = useState({});

    // ── Strip File Extension & Resolve Title ──
    // Uses the passed displayName prop first, fallback to document fields, then strips the file extension
    const rawTitle = displayName || attempt.resolvedTitle || attempt.title || attempt.examTitle || attempt.exam || "Exam";
    const title = rawTitle.replace(/\.(pdf|docx|doc|txt|odt)$/i, '');

    const isRemarked = !!attempt.remarkedAt;

    return (
        <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden mb-4">

            {/* Teacher mode — student name banner */}
            {teacherMode && attempt.studentId && (
                <div className="flex items-center gap-2 px-5 py-2 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800">
                    <div className="w-5 h-5 rounded-full bg-indigo-200 dark:bg-indigo-800 flex items-center justify-center text-[9px] font-black text-indigo-700 dark:text-indigo-200 flex-shrink-0">
                        {attempt.studentId[0]?.toUpperCase()}
                    </div>
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-300">{attempt.studentId}</span>

                    {/* Remarked badge */}
                    {isRemarked && (
                        <span className="ml-auto flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            <BadgeCheck size={10} />
                            {attempt.remarkedBy === "ai+teacher" ? "AI Re-marked" : "Teacher Re-marked"}
                        </span>
                    )}
                </div>
            )}

            {/* Summary row */}
            <div
                className="flex items-center gap-4 p-5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                onClick={() => setExpanded(v => !v)}
            >
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${pctBg(pct)} flex flex-col items-center justify-center flex-shrink-0`}>
                    <span className="text-white font-black text-lg leading-none">{pct}%</span>
                </div>

                <div className="flex-1 min-w-0">
                    {/* Display clean name without extensions */}
                    <p className="font-bold text-sm truncate">{title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{date}</p>
                    <div className="flex gap-3 mt-2 flex-wrap">
                        <span className="text-xs font-semibold text-slate-500">
                            Score: <span className={`font-black ${pctColor(pct)}`}>{attempt.score}/{attempt.total}</span>
                        </span>
                        <span className="text-xs font-semibold text-slate-500">
                            Answered: {attempt.answeredCount}/{attempt.total}
                        </span>
                        {attempt.skipped?.length > 0 && (
                            <span className="text-xs font-semibold text-yellow-500">
                                Skipped: {attempt.skipped.length}
                            </span>
                        )}
                    </div>
                </div>

                <div className="hidden sm:block w-28">
                    <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full bg-gradient-to-r ${pctBg(pct)}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1 text-right">{pct}%</p>
                </div>

                {expanded ? <ChevronUp size={18} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={18} className="text-slate-400 flex-shrink-0" />}
            </div>

            {/* Expanded detail */}
            {expanded && (
                <div className="border-t border-slate-100 dark:border-slate-700 p-5 space-y-4">

                    {/* Teacher note (shown to both views) */}
                    {attempt.teacherNote && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-200 leading-relaxed flex items-start gap-2">
                            <User size={14} className="mt-0.5 flex-shrink-0 text-amber-500" />
                            <div>
                                <span className="font-bold">Teacher Note:</span> {attempt.teacherNote}
                                {attempt.remarkedAt && (
                                    <span className="block text-[10px] text-amber-400 mt-1">
                                        Re-marked {attempt.remarkedAt?.toDate?.()?.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) ?? ""}
                                        {attempt.remarkedBy === "ai+teacher" ? " · AI + Teacher" : " · Teacher"}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* AI Feedback */}
                    {attempt.aiFeedback && (
                        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 text-sm text-indigo-800 dark:text-indigo-200 leading-relaxed">
                            🤖 <span className="font-bold">AI Feedback:</span> {attempt.aiFeedback}
                        </div>
                    )}

                    {/* Per-question breakdown */}
                    {/* Per-question breakdown */}
                    <div className="space-y-2">
                        {(attempt.markedResults || []).map((r, i) => {
                            const st = STATUS[r.status] || STATUS.missing;

                            // correct_answer is only useful for comparison when it's a full
                            // explanation ("B. Firewall filters network traffic") — a bare
                            // letter means the backend couldn't look up the option text
                            // (options missing/malformed at grading time) and just fell back
                            // to the raw memo value. In that case, and whenever there's no
                            // memo-derived correct_answer at all (AI-marked without a memo),
                            // fall back to model_answer — the AI's full written answer, which
                            // is always populated when the AI graded the question but never
                            // shown in this view before now.
                            const hasCorrectAnswer = r.correct_answer && r.correct_answer !== "Not available";
                            const isBareLetter = hasCorrectAnswer && /^[A-Za-z]$/.test(String(r.correct_answer).trim());
                            const displayAnswer = hasCorrectAnswer && !isBareLetter
                                ? r.correct_answer
                                : (r.model_answer || (hasCorrectAnswer ? r.correct_answer : null));

                            return (
                                <div key={i} className={`border rounded-xl p-3 ${st.color}`}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            {st.icon}
                                            <span className="font-bold text-xs text-slate-500 flex-shrink-0">{r.question_number}</span>
                                            <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{r.question}</span>
                                        </div>
                                        <span className="text-xs font-black text-slate-600 dark:text-slate-300 flex-shrink-0">{r.earned}/{r.marks}</span>
                                    </div>
                                    <div className="mt-2 pl-6 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                                        <p>
                                            <span className="font-semibold">Your answer:</span>{" "}
                                            {r.student_answer || "No answer"}
                                        </p>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                setExpandedAnswers(prev => ({
                                                    ...prev,
                                                    [r.question_number]: !prev[r.question_number]
                                                }))
                                            }
                                            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                                        >
                                            {expandedAnswers[r.question_number]
                                                ? "Hide answer"
                                                : "Click to view answer"}
                                        </button>

                                        {expandedAnswers[r.question_number] && (
                                            <div className="mt-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 space-y-2">

                                                {displayAnswer && (
                                                    <p>
                                                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                                            Correct answer:
                                                        </span>{" "}
                                                        {displayAnswer}
                                                    </p>
                                                )}

                                                {r.feedback && (
                                                    <div>
                                                        <p className="font-semibold">Feedback</p>
                                                        <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                                                            {r.feedback}
                                                        </p>
                                                    </div>
                                                )}

                                                {r.learning_explanation && (
                                                    <div>
                                                        <p className="font-semibold">Explanation</p>
                                                        <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                                                            {r.learning_explanation}
                                                        </p>
                                                    </div>
                                                )}

                                                {r.why_correct && (
                                                    <div>
                                                        <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                                                            Why your answer is correct
                                                        </p>
                                                        <p className="mt-0.5">
                                                            {r.why_correct}
                                                        </p>
                                                    </div>
                                                )}

                                                {r.why_student_answer_is_wrong && (
                                                    <div>
                                                        <p className="font-semibold text-red-600 dark:text-red-400">
                                                            Why your answer needs improvement
                                                        </p>
                                                        <p className="mt-0.5">
                                                            {r.why_student_answer_is_wrong}
                                                        </p>
                                                    </div>
                                                )}

                                                {r.step_by_step && (
                                                    <div>
                                                        <p className="font-semibold">Step-by-step</p>
                                                        <p className="mt-0.5 whitespace-pre-line">
                                                            {r.step_by_step}
                                                        </p>
                                                    </div>
                                                )}

                                                {r.key_learning_point && (
                                                    <div>
                                                        <p className="font-semibold">Key learning point</p>
                                                        <p className="mt-0.5">
                                                            {r.key_learning_point}
                                                        </p>
                                                    </div>
                                                )}

                                                {r.exam_tip && (
                                                    <div>
                                                        <p className="font-semibold">Exam tip</p>
                                                        <p className="mt-0.5">
                                                            {r.exam_tip}
                                                        </p>
                                                    </div>
                                                )}

                                                {r.practice_question && (
                                                    <div>
                                                        <p className="font-semibold">Try this</p>
                                                        <p className="mt-0.5">
                                                            {r.practice_question}
                                                        </p>
                                                    </div>
                                                )}

                                                {r.encouragement && (
                                                    <p className="pt-1 font-medium text-blue-600 dark:text-blue-400">
                                                        {r.encouragement}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-2 pl-6 flex gap-2">
                                        <span
                                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.pill}`}
                                        >
                                            {r.status}
                                        </span>

                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500">
                                            {r.type}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}


// Report Generation 
const getAttemptMillis = (a) =>
    a.completedAt?.toMillis?.() ?? new Date(a.completedAt || 0).getTime();

const PERIOD_OPTIONS = [
    { id: "week", label: "Last 7 Days", days: 7 },
    { id: "month", label: "Last 30 Days", days: 30 },
    { id: "term", label: "Last 3 Months", days: 90 },
    { id: "year", label: "Last 12 Months", days: 365 },
    { id: "all", label: "All Time", days: null },
    { id: "custom", label: "Custom Range", days: null },
];

function filterByPeriod(attempts, period, customStart, customEnd) {
    if (period === "all") return attempts;
    const now = Date.now();
    if (period === "custom") {
        const start = customStart ? new Date(customStart).getTime() : 0;
        const end = customEnd ? new Date(customEnd).getTime() + 86400000 - 1 : now;
        return attempts.filter(a => {
            const t = getAttemptMillis(a);
            return t >= start && t <= end;
        });
    }
    const opt = PERIOD_OPTIONS.find(p => p.id === period);
    const start = now - opt.days * 86400000;
    return attempts.filter(a => getAttemptMillis(a) >= start);
}

function filterBySubjects(attempts, subjects) {
    if (!subjects || subjects.length === 0) return attempts;
    return attempts.filter(a => subjects.includes(a.subject || a.resolvedTitle || a.examTitle || "General"));
}

function computeReportStats(periodAttempts, teacherMode) {
    const total = periodAttempts.length;
    const avg = total ? Math.round(periodAttempts.reduce((s, a) => s + (a.percentage ?? 0), 0) / total) : 0;
    const best = total ? Math.max(...periodAttempts.map(a => a.percentage ?? 0)) : 0;
    const worst = total ? Math.min(...periodAttempts.map(a => a.percentage ?? 0)) : 0;
    const passing = periodAttempts.filter(a => (a.percentage ?? 0) >= 50).length;
    const failing = total - passing;

    // Breakdown by subject/exam
    const bySubject = new Map();
    periodAttempts.forEach(a => {
        const key = a.subject || a.resolvedTitle || "General";
        const cur = bySubject.get(key) || { count: 0, totalPct: 0 };
        cur.count += 1;
        cur.totalPct += (a.percentage ?? 0);
        bySubject.set(key, cur);
    });
    const subjectBreakdown = [...bySubject.entries()]
        .map(([subject, v]) => ({ subject, count: v.count, avg: Math.round(v.totalPct / v.count) }))
        .sort((a, b) => b.count - a.count);

    // Breakdown by student (teacher reports only)
    let studentBreakdown = [];
    if (teacherMode) {
        const byStudent = new Map();
        periodAttempts.forEach(a => {
            const key = a.studentId || "Unknown";
            const cur = byStudent.get(key) || { count: 0, totalPct: 0 };
            cur.count += 1;
            cur.totalPct += (a.percentage ?? 0);
            byStudent.set(key, cur);
        });
        studentBreakdown = [...byStudent.entries()]
            .map(([studentId, v]) => ({ studentId, count: v.count, avg: Math.round(v.totalPct / v.count) }))
            .sort((a, b) => a.avg - b.avg); // weakest students first
    }

    // Recurring weak concepts across all attempts in the period
    const weakMap = new Map();
    periodAttempts.forEach(a => {
        (a.markedResults || []).forEach(r => {
            if (r.status === "correct") return;
            const key = r.question_number
                ? `${r.question_number}: ${(r.question || "").slice(0, 60)}`
                : (r.question || "Unknown").slice(0, 60);
            const cur = weakMap.get(key) || { count: 0 };
            cur.count += 1;
            weakMap.set(key, cur);
        });
    });
    const weakAreas = [...weakMap.entries()]
        .map(([label, v]) => ({ label, count: v.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    // Trend: compare first half vs second half of the period, chronologically
    const sorted = [...periodAttempts].sort((a, b) => getAttemptMillis(a) - getAttemptMillis(b));
    let trend = null;
    if (sorted.length >= 2) {
        const mid = Math.floor(sorted.length / 2) || 1;
        const firstHalf = sorted.slice(0, mid);
        const secondHalf = sorted.slice(mid);
        const avgFirst = firstHalf.reduce((s, a) => s + (a.percentage ?? 0), 0) / firstHalf.length;
        const avgSecond = secondHalf.reduce((s, a) => s + (a.percentage ?? 0), 0) / secondHalf.length;
        trend = Math.round(avgSecond - avgFirst);
    }

    return { total, avg, best, worst, passing, failing, subjectBreakdown, studentBreakdown, weakAreas, trend, sorted };
}


// ── Main results tab ──────────────────────────────────────────────────────────
export function ResultsTab({ studentId, teacherMode = false }) {
    const [attempts, setAttempts] = useState([]);
    const [examTitles, setExamTitles] = useState({});
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [remarkTarget, setRemarkTarget] = useState(null);
    const [showReportModal, setShowReportModal] = useState(false);
    const [schoolName, setSchoolName] = useState("");
    const [studentProfile, setStudentProfile] = useState({ name: "", grade: "" });
    const [schoolLogoUrl, setSchoolLogoUrl] = useState("");
    const [studentNameMap, setStudentNameMap] = useState({});
    const [subjectTeacherMap, setSubjectTeacherMap] = useState({});

    // ── 1. Load Subject-to-Teacher Mappings ──────────────────────────────────
    useEffect(() => {
        const auth = getAuth();
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) return;
            const userSnap = await getDoc(doc(db, "users", user.uid)).catch(() => null);
            const schoolId = userSnap?.exists() ? userSnap.data().schoolId : null;
            if (!schoolId) return;

            const examsSnap = await getDocs(
                query(collection(db, "exams"), where("schoolId", "==", schoolId))
            ).catch(() => null);
            if (!examsSnap) return;

            const map = {};
            for (const d of examsSnap.docs) {
                const data = d.data();
                if (!data.subject || map[data.subject]) continue;
                if (data.teacherName) {
                    map[data.subject] = data.teacherName;
                } else if (data.teacherId) {
                    const tSnap = await getDoc(doc(db, "teachers", data.teacherId)).catch(() => null);
                    map[data.subject] = tSnap?.exists() ? (tSnap.data().name || "") : "";
                }
            }
            setSubjectTeacherMap(map);
        });
        return () => unsub();
    }, []);

    // ── 2. Consolidated Live Exam Titles Map Listener ─────────────────────────
    useEffect(() => {
        const auth = getAuth();
        let unsubExams = () => { };

        const unsubAuth = onAuthStateChanged(auth, async (user) => {
            if (!user) return;

            const userSnap = await getDoc(doc(db, "users", user.uid)).catch(() => null);
            const schoolId = userSnap?.exists() ? userSnap.data().schoolId : null;
            if (!schoolId) {
                console.warn("ResultsTab: no schoolId on user doc, skipping exams query");
                return;
            }

            const q = query(collection(db, "exams"), where("schoolId", "==", schoolId));
            unsubExams = onSnapshot(
                q,
                (snap) => {
                    const map = {};
                    snap.docs.forEach((d) => {
                        const data = d.data();
                        const examObj = { id: d.id, ...data };

                        // Map by document ID
                        map[d.id] = examObj;

                        // Map by custom examId field if present
                        if (data.examId) {
                            map[data.examId] = examObj;
                        }
                    });
                    setExamTitles(map);
                },
                (err) => console.error("ResultsTab [examTitles]:", err)
            );
        });

        return () => {
            unsubExams();
            unsubAuth();
        };
    }, []);

    // ── 3. Resolve School & Student Profile Info ─────────────────────────────
    useEffect(() => {
        const auth = getAuth();
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) return;

            const userSnap = await getDoc(doc(db, "users", user.uid)).catch(() => null);
            const schoolId = userSnap?.exists() ? userSnap.data().schoolId : null;

            if (schoolId) {
                const schoolSnap = await getDoc(doc(db, "schools", schoolId)).catch(() => null);
                if (schoolSnap?.exists()) {
                    const d = schoolSnap.data();
                    setSchoolName(d.name || d.schoolName || "");
                    setSchoolLogoUrl(d.logoUrl || d.logo || "");
                }
            }

            if (!teacherMode) {
                const profSnap = await getDoc(doc(db, "students", user.uid)).catch(() => null);
                if (profSnap?.exists()) {
                    const d = profSnap.data();
                    setStudentProfile({ name: d.name || user.displayName || "", grade: d.grade || d.gradeYear || "" });
                }
            }
        });
        return () => unsub();
    }, [teacherMode]);

    // ── 4. Resolve Student Names (Teacher Mode) ──────────────────────────────
    useEffect(() => {
        if (!teacherMode) return;
        const uids = [...new Set(attempts.map(a => a.studentUid).filter(Boolean))];
        if (uids.length === 0) return;

        (async () => {
            const entries = await Promise.all(uids.map(async (uid) => {
                const snap = await getDoc(doc(db, "students", uid)).catch(() => null);
                const name = snap?.exists() ? (snap.data().name || uid) : uid;
                return [uid, name];
            }));
            setStudentNameMap(Object.fromEntries(entries));
        })();
    }, [attempts, teacherMode]);

    // ── 5. Live Attempts Query (Clean Deduplication & Sorting) ───────────────
    useEffect(() => {
        if (!teacherMode && !studentId) {
            setLoading(false);
            return;
        }

        if (teacherMode) {
            const auth = getAuth();
            let unsubAttempts = () => { };
            const unsubAuth = onAuthStateChanged(auth, async (user) => {
                if (!user) { setLoading(false); return; }
                const userSnap = await getDoc(doc(db, "users", user.uid)).catch(() => null);
                const schoolId = userSnap?.exists() ? userSnap.data().schoolId : null;
                if (!schoolId) {
                    console.warn("ResultsTab: teacher has no schoolId");
                    setLoading(false);
                    return;
                }

                const q = query(
                    collection(db, "exam_attempts"),
                    where("schoolId", "==", schoolId),
                    orderBy("completedAt", "desc")
                );
                unsubAttempts = onSnapshot(
                    q,
                    (snap) => {
                        setAttempts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                        setLoading(false);
                    },
                    (err) => {
                        console.error("ResultsTab [attempts]:", err);
                        setLoading(false);
                    }
                );
            });
            return () => { unsubAttempts(); unsubAuth(); };
        }

        // Student View: Merge results across both studentId and studentUid fields
        let byIdResults = [];
        let byUidResults = [];
        let idLoaded = false;
        let uidLoaded = false;

        const mergeAndSet = () => {
            const merged = [...byIdResults, ...byUidResults];

            // Deduplicate by attempt document ID so all historical attempts are preserved
            const dedupedMap = new Map();
            merged.forEach(attempt => {
                if (attempt.id) {
                    dedupedMap.set(attempt.id, attempt);
                }
            });

            const deduped = Array.from(dedupedMap.values());

            // Sort attempts descending by completion/submission time
            deduped.sort((a, b) => {
                const aTime = a.completedAt?.toMillis?.()
                    ?? a.submittedAt?.toMillis?.()
                    ?? new Date(a.completedAt || a.submittedAt || 0).getTime();
                const bTime = b.completedAt?.toMillis?.()
                    ?? b.submittedAt?.toMillis?.()
                    ?? new Date(b.completedAt || b.submittedAt || 0).getTime();
                return bTime - aTime;
            });

            setAttempts(deduped);
            if (idLoaded && uidLoaded) setLoading(false);
        };

        const qById = query(collection(db, "exam_attempts"), where("studentId", "==", studentId));
        const unsubById = onSnapshot(
            qById,
            (snap) => {
                byIdResults = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                idLoaded = true;
                mergeAndSet();
            },
            (err) => { console.error("ResultsTab [attempts:studentId]:", err); idLoaded = true; mergeAndSet(); }
        );

        const qByUid = query(collection(db, "exam_attempts"), where("studentUid", "==", studentId));
        const unsubByUid = onSnapshot(
            qByUid,
            (snap) => {
                byUidResults = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                uidLoaded = true;
                mergeAndSet();
            },
            (err) => { console.error("ResultsTab [attempts:studentUid]:", err); uidLoaded = true; mergeAndSet(); }
        );

        return () => {
            unsubById();
            unsubByUid();
        };
    }, [studentId, teacherMode]);

    // ── 6. Enrich Attempts with Resolved Titles & Details ────────────────────
    const enriched = attempts.map(a => {
        const examKey = a.examId || a.exam;
        const examMeta = examTitles[examKey] || {};

        return {
            ...a,
            resolvedTitle: examMeta.title || examMeta.examFileName || a.examTitle || a.exam || "Exam",
            linkedExam: examMeta
        };
    });

    // ── 7. Search Filter ─────────────────────────────────────────────────────
    const filtered = enriched.filter(a => {
        if (!searchTerm.trim()) return true;
        const t = searchTerm.toLowerCase();
        return a.resolvedTitle.toLowerCase().includes(t) ||
            (teacherMode && a.studentId?.toLowerCase().includes(t));
    });

    // ── 8. Calculated Stats ──────────────────────────────────────────────────
    const avgPct = filtered.length ? Math.round(filtered.reduce((s, a) => s + (a.percentage ?? 0), 0) / filtered.length) : 0;
    const best = filtered.length ? Math.max(...filtered.map(a => a.percentage ?? 0)) : 0;
    const passing = filtered.filter(a => (a.percentage ?? 0) >= 50).length;

    // ── 9. Remark Action ─────────────────────────────────────────────────────
    const handleSaveRemark = async (attemptId, updates) => {
        await updateDoc(doc(db, "exam_attempts", attemptId), {
            ...updates,
            remarkedAt: updates.remarkedAt,
        });
    };

    // ── 10. PDF Export ────────────────────────────────────────────────────────
    const handleDownload = (period, customStart, customEnd, subjects = null) => {
        let periodAttempts = filterByPeriod(enriched, period, customStart, customEnd);
        periodAttempts = filterBySubjects(periodAttempts, subjects);

        if (periodAttempts.length === 0) {
            alert("No exam attempts found for the selected period and subjects.");
            return;
        }

        const printWindow = window.open("", "_blank");
        if (!printWindow) return;

        const periodLabel = period === "custom"
            ? `${customStart} to ${customEnd}`
            : PERIOD_OPTIONS.find(p => p.id === period)?.label || "All Time";
        const subjectLabel = subjects && subjects.length > 0 ? subjects.join(", ") : "All Subjects";
        const genDate = new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });

        const total = periodAttempts.length;
        const avgPct = Math.round(periodAttempts.reduce((s, a) => s + (a.percentage ?? 0), 0) / total);
        const bestPct = Math.max(...periodAttempts.map(a => a.percentage ?? 0));
        const passing = periodAttempts.filter(a => (a.percentage ?? 0) >= 50).length;
        const failing = total - passing;

        const sorted = [...periodAttempts].sort((a, b) => getAttemptMillis(b) - getAttemptMillis(a));

        let trendLabel = "—";
        if (sorted.length >= 2) {
            const chron = [...sorted].reverse();
            const mid = Math.floor(chron.length / 2) || 1;
            const avgFirst = chron.slice(0, mid).reduce((s, a) => s + (a.percentage ?? 0), 0) / mid;
            const avgSecond = chron.slice(mid).reduce((s, a) => s + (a.percentage ?? 0), 0) / (chron.length - mid);
            const diff = Math.round(avgSecond - avgFirst);
            trendLabel = diff > 0 ? `▲ +${diff}%` : diff < 0 ? `▼ ${diff}%` : "No change";
        }

        const bySubject = new Map();
        periodAttempts.forEach(a => {
            const key = a.subject || a.resolvedTitle || a.examTitle || "General";
            const cur = bySubject.get(key) || { count: 0, totalPct: 0 };
            cur.count += 1;
            cur.totalPct += (a.percentage ?? 0);
            bySubject.set(key, cur);
        });
        const subjectRows = [...bySubject.entries()]
            .map(([subject, v]) => {
                const teacherName = subjectTeacherMap[subject];
                const teacherLine = teacherName ? `<div style="color:#64748b;font-size:12px">Subject Teacher: ${teacherName}</div>` : "";
                return `<div style="margin-bottom:10px"><strong>${subject}</strong> — ${v.count} exam${v.count !== 1 ? "s" : ""}, avg ${Math.round(v.totalPct / v.count)}%${teacherLine}</div>`;
            })
            .join("");

        let studentSection = "";
        if (teacherMode) {
            const byStudent = new Map();
            periodAttempts.forEach(a => {
                const key = a.studentUid || a.studentId || "Unknown";
                const displayName = studentNameMap[a.studentUid] || a.studentId || "Unknown";
                const cur = byStudent.get(key) || { count: 0, totalPct: 0, displayName };
                cur.count += 1;
                cur.totalPct += (a.percentage ?? 0);
                byStudent.set(key, cur);
            });
            const studentRows = [...byStudent.values()]
                .map(v => ({ name: v.displayName, count: v.count, avg: Math.round(v.totalPct / v.count) }))
                .sort((a, b) => a.avg - b.avg)
                .map(s => `<div><strong>${s.name}</strong> — ${s.count} exam${s.count !== 1 ? "s" : ""}, avg ${s.avg}%</div>`)
                .join("");
            studentSection = `
    <div class="score-box" style="margin-top:16px">
      <div class="section-title">Performance by Student (weakest first)</div>
      ${studentRows}
    </div>`;
        }

        const gapsBySubject = new Map();
        periodAttempts.forEach(a => {
            const subjectKey = a.subject || a.resolvedTitle || a.examTitle || "General";
            const subjMap = gapsBySubject.get(subjectKey) || new Map();
            (a.markedResults || []).forEach(r => {
                if (r.status === "correct") return;
                const label = (r.concept_gap && r.concept_gap.trim())
                    || (r.question_number ? `${r.question_number}: ${(r.question || "").slice(0, 60)}` : (r.question || "Unknown").slice(0, 60));
                subjMap.set(label, (subjMap.get(label) || 0) + 1);
            });
            gapsBySubject.set(subjectKey, subjMap);
        });

        const conceptGapSection = [...gapsBySubject.entries()]
            .filter(([, subjMap]) => subjMap.size > 0)
            .map(([subject, subjMap]) => {
                const teacherName = subjectTeacherMap[subject];
                const teacherLine = teacherName ? ` <span style="font-weight:400;color:#64748b;font-size:12px">— Subject Teacher: ${teacherName}</span>` : "";
                const items = [...subjMap.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 8)
                    .map(([label, count]) => `<div class="answer-box" style="margin-top:8px"><strong>${count}×</strong> — ${label}</div>`)
                    .join("");
                return `
    <div class="question" style="page-break-inside:avoid">
      <div class="label">${subject}${teacherLine}</div>
      ${items}
    </div>`;
            }).join("");

        const appendixRows = sorted.map((a, idx) => {
            const d = a.completedAt?.toDate?.()?.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) ?? "—";
            const studentLabel = teacherMode ? (studentNameMap[a.studentUid] || a.studentId || "—") : null;
            return `
        <div class="question">
          <div class="label">${idx + 1}. ${a.resolvedTitle || a.examTitle || "Exam"}</div>
          ${teacherMode ? `<div>Student: ${studentLabel}</div>` : ""}
          <div class="answer-box"><div class="label">Result</div><div>${a.score ?? 0} / ${a.total ?? 0} marks &nbsp;<span style="font-weight:bold">(${a.percentage ?? 0}%)</span></div></div>
          <div style="color:#94a3b8;font-size:13px;margin-top:6px">${d}</div>
        </div>`;
        }).join("");

        const displayStudentName = studentProfile.name || studentId || "N/A";
        const displayGrade = studentProfile.grade ? `Grade ${studentProfile.grade}` : "";

        const logoHtml = schoolLogoUrl
            ? `<img src="${schoolLogoUrl}" class="logo" alt="School Logo" />`
            : `<div class="logo-fallback">${(schoolName || "A").charAt(0).toUpperCase()}</div>`;

        printWindow.document.write(`
<html>
  <head>
    <title>Analytical Assessment Report</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 40px; color: #0f172a; background: #fff; }
      .header { display: flex; align-items: center; gap: 18px; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
      .logo { width: 64px; height: 64px; object-fit: contain; border-radius: 12px; flex-shrink: 0; }
      .logo-fallback { width: 64px; height: 64px; border-radius: 12px; background: #4f46e5; color: #fff; font-size: 28px; font-weight: 900; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .header-text { flex: 1; min-width: 0; }
      .title { font-size: 24px; font-weight: 800; }
      .subtitle { color: #64748b; margin-top: 4px; font-size: 13px; }
      .meta { margin-bottom: 10px; font-size: 15px; }
      .score-box { margin-top: 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; }
      .score { font-size: 52px; font-weight: 900; color: #4f46e5; }
      .section { margin-top: 32px; }
      .section-title { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: #64748b; margin-bottom: 12px; font-weight: 700; }
      .question { border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-bottom: 18px; page-break-inside: avoid; }
      .label { font-weight: 700; margin-bottom: 6px; }
      .answer-box { margin-top: 14px; padding: 14px; border-radius: 12px; background: #f8fafc; }
      .footer { margin-top: 50px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 18px; }
      @media print {
        .logo, .logo-fallback { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style>
  </head>
  <body>
    <div class="header">
      ${logoHtml}
      <div class="header-text">
        <div class="title">${schoolName || "Academic Performance Hub"}</div>
        <div class="subtitle">Analytical Assessment Report · ${teacherMode ? "Class-wide performance summary" : "Official AI-Marked Assessment Report"} · ${periodLabel}</div>
      </div>
    </div>
    ${!teacherMode ? `
    <div class="meta"><strong>Student:</strong> ${displayStudentName}</div>
    ${displayGrade ? `<div class="meta"><strong>Grade:</strong> ${displayGrade}</div>` : ""}` : ""}
    <div class="meta"><strong>Period:</strong> ${periodLabel}</div>
    <div class="meta"><strong>Subjects:</strong> ${subjectLabel}</div>
    <div class="meta"><strong>Generated:</strong> ${genDate}</div>

    <div class="score-box">
      <div class="section-title">Overall Performance</div>
      <div class="score">${avgPct}% <span style="font-size:28px;color:#64748b">avg</span></div>
      <div style="margin-top:12px;font-size:14px;color:#475569">
        ${total} exam${total !== 1 ? "s" : ""} &nbsp;·&nbsp; Best ${bestPct}% &nbsp;·&nbsp; Trend ${trendLabel} &nbsp;·&nbsp; Passing ${passing} / Below 50% ${failing}
      </div>
    </div>

    <div class="score-box" style="margin-top:16px;border-color:#c7d2fe;background:#eef2ff">
      <div class="section-title">Performance by Subject</div>
      ${subjectRows}
    </div>

    ${studentSection}

    ${conceptGapSection ? `
    <div class="section">
      <div class="section-title">Recurring Concept Gaps — by Subject</div>
      ${conceptGapSection}
    </div>` : ""}

    <div class="section">
      <div class="section-title">Exam-by-Exam Record</div>
      ${appendixRows}
    </div>

    <div class="footer">Generated by Academic Performance Hub • Audit Ready Report</div>
  </body>
</html>`);
        printWindow.document.close();
        setTimeout(() => { printWindow.print(); }, 500);
    };

    const availableSubjects = [...new Set(enriched.map(a => a.subject || a.resolvedTitle || a.examTitle || "General"))].sort();

    // ── 11. JSX Render ────────────────────────────────────────────────────────
    if (loading) return (
        <div className="p-20 text-center text-slate-400 text-sm animate-pulse">Loading results…</div>
    );

    return (
        <>
            {teacherMode && remarkTarget && (
                <RemarkModal
                    attempt={remarkTarget}
                    onClose={() => setRemarkTarget(null)}
                    onSave={(updates) => handleSaveRemark(remarkTarget.id, updates)}
                />
            )}

            <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-sm p-8 border border-slate-200 dark:border-slate-800 animate-in fade-in">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 mb-1 flex-wrap">
                    <div>
                        <h2 className="text-2xl font-black">
                            {teacherMode ? "Student Performance Overview" : "Academic Performance Hub"}
                        </h2>
                        <p className="text-slate-500 text-sm mt-1">
                            {teacherMode
                                ? `${attempts.length} submission${attempts.length !== 1 ? "s" : ""} across all students`
                                : "Your exam history and AI-marked results."}
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowReportModal(true)}
                            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-sm transition-all"
                        >
                            <Download size={18} />
                            Download Report
                        </button>
                    </div>

                    {showReportModal && (
                        <ReportPeriodModal
                            onClose={() => setShowReportModal(false)}
                            availableSubjects={availableSubjects}
                            onGenerate={(period, start, end, subjects) => {
                                handleDownload(period, start, end, subjects);
                                setShowReportModal(false);
                            }}
                        />
                    )}
                </div>

                {attempts.length > 0 && (
                    <div className="mt-4 mb-2">
                        <input
                            type="text"
                            placeholder={teacherMode ? "Search student or exam…" : "Search exam…"}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="text-sm px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-400 w-56"
                        />
                    </div>
                )}

                {filtered.length === 0 ? (
                    <div className="p-20 border-4 border-dashed border-slate-100 dark:border-slate-800 rounded-[2.5rem] text-center mt-8">
                        <ClipboardList className="text-slate-200 dark:text-slate-700 mx-auto mb-3" size={40} />
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">
                            {searchTerm ? "No results match your search" : teacherMode ? "No student submissions yet" : "No exams submitted yet"}
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Stats Strip */}
                        <div className={`grid gap-4 mb-8 mt-6 ${teacherMode ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3"}`}>
                            {[
                                { label: teacherMode ? "Total Submissions" : "Exams Taken", value: filtered.length, suffix: "" },
                                { label: "Average Score", value: avgPct, suffix: "%" },
                                { label: "Best Score", value: best, suffix: "%" },
                                ...(teacherMode ? [{ label: "Passing (≥50%)", value: passing, suffix: "" }] : []),
                            ].map(({ label, value, suffix }) => (
                                <div key={label} className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 text-center">
                                    <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{value}{suffix}</p>
                                    <p className="text-xs text-slate-400 font-semibold mt-1">{label}</p>
                                </div>
                            ))}
                        </div>

                        {/* Attempt Cards List */}
                        {filtered.map(a => {
                            const linkedExam = a.linkedExam || {};

                            const rawFileName = linkedExam.examFileName
                                || a.examFileName
                                || linkedExam.title
                                || a.title
                                || a.examTitle
                                || 'Exam';

                            const displayExamName = rawFileName.replace(/\.(pdf|docx|doc|txt|odt)$/i, '');
                            const displaySubject = linkedExam.subject || a.subject || 'Home Language';
                            const displayTeacher = linkedExam.teacherName || a.teacherName || a.teacher || 'Teacher';

                            const ts = a._tsSeconds || a.submittedAt?.seconds || a.completedAt?.seconds;
                            const formattedDateTime = ts
                                ? new Date(ts * 1000).toLocaleString("en-ZA", {
                                    dateStyle: 'medium',
                                    timeStyle: 'short'
                                })
                                : '—';

                            let statusTag = { text: 'AI-Marked', bg: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-200/50' };
                            if (a.remarkedByTeacher || a.remarkedAt) {
                                statusTag = { text: 'Teacher Remarked', bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200/50' };
                            } else if (a.aiRemarkedAt || a.isAiRemarked) {
                                statusTag = { text: 'AI Remarked', bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200/50' };
                            }

                            return (
                                <div key={a.id} className="space-y-4 mb-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
                                    {/* Meta Header */}
                                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800 text-xs">
                                        <div className="space-y-1 text-left flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-md">
                                                    {displaySubject}
                                                </span>
                                            </div>

                                            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                                                Instructor: <span className="text-slate-600 dark:text-slate-300 font-semibold">{displayTeacher}</span>
                                                <span className="mx-1.5">•</span>
                                                <span>{formattedDateTime}</span>
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-1.5 self-start sm:self-center">
                                            <span className={`px-2.5 py-1 text-[10px] font-black tracking-wider uppercase rounded-full border ${statusTag.bg}`}>
                                                {statusTag.text}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Attempt Card Display */}
                                    <AttemptCard
                                        attempt={a}
                                        teacherMode={teacherMode}
                                        displayName={displayExamName}
                                    />

                                    {/* Actions Footer */}
                                    {teacherMode && (
                                        <div className="flex items-center gap-2 pt-1">
                                            <button
                                                onClick={() => setRemarkTarget(a)}
                                                className="px-4 py-2 rounded-xl border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 text-sm font-semibold flex items-center gap-2 transition-all"
                                            >
                                                <Pencil size={14} />
                                                Remark Attempt
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </>
                )}
            </div>
        </>
    );
}
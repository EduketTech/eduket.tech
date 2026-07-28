import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { doc, onSnapshot, collection, getDoc, query, where } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { db } from '../utils/firebase';
import {
  BookOpen, School, ShieldCheck, Upload, ClipboardList,
  FileText, CheckCircle, ArrowRight, ArrowLeft, LayoutDashboard,
  LogOut, Loader2, ExternalLink,
  CheckCircle2, MapPin, GraduationCap, Trash2, Pencil,
  X, Save, Clock, Filter, Search, ChevronDown, ChevronUp,
  CalendarDays, Tag, Layers,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Monitor } from 'lucide-react';
import { useGooglePicker } from '../utils/useGooglePicker';
import { fetchLevels } from '../utils/academicResolver';
import { useAiList } from './SchoolRegistration';
import {
  saveExamMetadata,
  ensureUserFirestoreDocs,
  deleteExamFromAudit,
} from '../utils/driveManager';
import { updateExamInAudit, updateExamStatusInAudit } from "../utils/firestoreHelpers"

import { runExamDeletion } from '../utils/examDeleteUtils';
import { ResultsTab } from './ResultsTab';
import { serverTimestamp } from "firebase/firestore";
import { useSchool } from '../utils/schoolContext';
import {
  uploadExamFile,
  validateExamFile,
  getFileTypeLabel,
  isOpenDocumentFormat,
  ACCEPT_STRING,
} from '../utils/examUploadUtils';
import { ExamTimePicker } from '../utils/ExamTimePicker';
import { PrincipalReviewBadge, PrincipalReviewsModal, usePrincipalReviews } from './PrincipalReviewsModal';
import PrincipalReviewsInline from '../utils/PrincipalReviewsInline';




// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const DBE_SUBJECTS = [
  "CAT", "IT", "Mathematics", "Mathematical Literacy",
  "English HL", "English FAL", "Physical Sciences", "Life Sciences",
  "Accounting", "Business Studies", "Economics", "History", "Geography",
  "Life Orientation", "Consumer Studies", "Afrikaans HL", "Afrikaans FAL",
  "isiXhosa HL", "isiZulu HL",
];

// const GRADES = [8, 9, 10, 11, 12];
// const CURRICULA = ['CAPS', 'IEB', 'SACAI', 'Cambridge'];

const STATUS_CONFIG = {
  pending_extraction: { label: 'Pending', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  extracted: { label: 'Extracted', cls: 'bg-blue-100  text-blue-700  dark:bg-blue-900/30  dark:text-blue-300' },
  indexed: { label: 'Indexed', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  ready: { label: 'Ready', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
};

// ─── EDIT MODAL ───────────────────────────────────────────────────────────────

function EditExamModal({ exam, onSave, onClose }) {
  const [title, setTitle] = useState(exam.title || '');
  const [subject, setSubject] = useState(exam.subject || '');
  const [grade, setGrade] = useState(exam.grade || '12');
  const [year, setYear] = useState(exam.year || '');
  const [curriculum, setCurriculum] = useState(exam.curriculum || 'CAPS');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!title.trim() || !subject) {
      setError('Title and subject are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ title: title.trim(), subject, grade, year, curriculum });
      onClose();
    } catch (e) {
      setError(e.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[2rem] shadow-2xl border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-xl">
              <Pencil size={16} className="text-indigo-600" />
            </div>
            <h3 className="font-black text-lg">Edit Exam Details</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-8 py-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 text-xs font-bold rounded-xl border border-red-100 dark:border-red-800">
              {error}
            </div>
          )}

          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Exam Title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full p-3.5 rounded-xl border dark:bg-slate-800 dark:border-slate-700 outline-none focus:border-indigo-500 text-sm transition-colors" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Subject *</label>
              <select value={subject} onChange={(e) => setSubject(e.target.value)}
                className="w-full p-3.5 rounded-xl border dark:bg-slate-800 dark:border-slate-700 text-sm outline-none focus:border-indigo-500">
                <option value="">Select</option>
                {DBE_SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Grade</label>
              {/* Grade filter */}
              <select value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)}
                className="px-3 py-2.5 rounded-xl border dark:bg-slate-800 dark:border-slate-700 text-xs font-bold outline-none focus:border-indigo-500">
                <option value="">All Grades</option>
                {[...new Set(uploadedExams.map((e) => e.grade).filter(Boolean))].sort().map((g) => (
                  <option key={g} value={String(g)}>{g}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Year</label>
              <input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="e.g. 2024"
                className="w-full p-3.5 rounded-xl border dark:bg-slate-800 dark:border-slate-700 text-sm outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Curriculum</label>
              <select value={curriculum} onChange={(e) => setCurriculum(e.target.value)}
                className="w-full p-3.5 rounded-xl border dark:bg-slate-800 dark:border-slate-700 text-sm outline-none focus:border-indigo-500">
                {CURRICULA.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-8 pb-8">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-3.5 rounded-xl border-2 border-slate-100 dark:border-slate-700 font-black text-xs text-slate-500 dark:text-slate-400 hover:border-slate-300 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-[2] py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs flex items-center justify-center gap-2 disabled:opacity-60 transition-colors">
            {saving
              ? <><Loader2 size={14} className="animate-spin" /> Saving...</>
              : <><Save size={14} /> Save Changes</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AUDIT ROW ────────────────────────────────────────────────────────────────
// Drop-in replacement for the existing AuditRow component.
// Adds examDuration to the row summary chip and the expanded detail panel,
// matching the structure of the upload wizard.

function AuditRow({ exam, onEdit, onDelete, expanded, onToggle }) {
  // 🔎 Fix this at the top of your AuditRow component:
  const parseDate = (val) => {
    if (!val) return null;
    // If it's a Firestore Timestamp object, it will have a toDate() method
    if (typeof val.toDate === 'function') return val.toDate();
    return new Date(val);
  };

  const uploadedDateObj = parseDate(exam.uploadedAt);
  const uploadDate = uploadedDateObj
    ? uploadedDateObj.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
  const uploadTime = uploadedDateObj
    ? uploadedDateObj.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
    : '';

  const statusCfg = STATUS_CONFIG[exam.status] || { label: exam.status || 'Processing', cls: 'bg-slate-100 text-slate-500' };

  // Format duration exactly as the upload wizard labels it
  const formatDuration = (mins) => {
    if (!mins) return null;
    const m = Number(mins);
    if (m < 60) return `${m} min`;
    return `${m / 60} hr${m >= 120 ? 's' : ''}`;
  };
  const durationLabel = formatDuration(exam.examDuration);

  return (
    <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden hover:border-indigo-200 dark:hover:border-indigo-800 transition-all">

      {/* ── Row summary — always visible ────────────────────────────────── */}
      <div
        className="flex items-center gap-4 p-5 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
        onClick={onToggle}
      >
        {/* Status dot */}
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${exam.status === 'ready' ? 'bg-green-500' :
          exam.status === 'pending_extraction' ? 'bg-amber-400 animate-pulse' :
            exam.status === 'indexed' ? 'bg-purple-500' : 'bg-blue-500' // ← Catch-all default
          }`} />

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <p className="font-black text-slate-800 dark:text-white text-sm truncate">{exam.title}</p>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
              <Tag size={9} /> {exam.subject || '—'}
            </span>
            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
              <Layers size={9} /> Grade {exam.grade}
            </span>
            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
              <CalendarDays size={9} /> {exam.year || '—'}
            </span>
            <span className="text-[10px] font-bold text-slate-400">{exam.curriculum}</span>
            {/* Duration chip — shown inline when present */}
            {durationLabel && (
              <span className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-lg">
                <Clock size={9} /> {durationLabel}
              </span>
            )}
          </div>
        </div>

        {/* Timestamp */}
        <div className="text-right hidden sm:block shrink-0">
          <p className="text-xs font-black text-slate-600 dark:text-slate-300">{uploadDate}</p>
          <p className="text-[10px] text-slate-400 font-bold flex items-center gap-1 justify-end">
            <Clock size={9} /> {uploadTime}
          </p>
        </div>

        {/* Status badge */}
        <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wide shrink-0 hidden md:block ${statusCfg.cls}`}>
          {statusCfg.label}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onEdit(exam)}
            className="p-2 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-slate-400 hover:text-indigo-600 transition-colors"
            title="Edit details">
            <Pencil size={14} />
          </button>
          <button onClick={() => onDelete(exam)}
            className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
            title="Delete">
            <Trash2 size={14} />
          </button>
          <div className="text-slate-300 dark:text-slate-600 ml-1">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>
      </div>

      {/* ── Expanded detail panel ────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-slate-100 dark:border-slate-800 p-5 bg-slate-50/50 dark:bg-slate-800/20 space-y-4">

          {/* File links row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Question paper */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">📄 Question Paper</p>
              {exam.examDriveLink ? (
                <a href={exam.examDriveLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs font-bold text-indigo-600 hover:underline truncate">
                  <ExternalLink size={12} /> {exam.examFileName || 'Open in Drive'}
                </a>
              ) : (
                <p className="text-xs text-slate-400 font-bold">{exam.examFileName || 'No file linked'}</p>
              )}
              {exam.examFileType && (
                <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-widest">{exam.examFileType}</p>
              )}
            </div>

            {/* Marking memo */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">✅ Marking Memo</p>
              {exam.memoDriveLink ? (
                <a href={exam.memoDriveLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs font-bold text-green-600 hover:underline truncate">
                  <ExternalLink size={12} /> {exam.memoFileName || 'Open in Drive'}
                </a>
              ) : (
                <p className="text-xs text-slate-400 font-bold">{exam.memoFileName || 'No file linked'}</p>
              )}
              {exam.memoFileType && (
                <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-widest">{exam.memoFileType}</p>
              )}
            </div>
          </div>

          {/* Metadata summary — mirrors the upload wizard's "Ready to upload" summary */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">📋 Assessment Details</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
              <DetailItem label="Title" value={exam.title} />
              <DetailItem label="Subject" value={exam.subject} />
              <DetailItem label="Grade" value={exam.grade ? `Grade ${exam.grade}` : null} />
              <DetailItem label="Year" value={exam.year} />
              <DetailItem label="Curriculum" value={exam.curriculum} />

              {/* ── Dynamic Assignment vs Exam Field ── */}
              {exam.type === 'assignment' || exam.assessmentType === 'assignment' ? (
                <DetailItem
                  label="Deadline"
                  value={exam.dueDate ? (
                    new Date(exam.dueDate).toLocaleDateString('en-ZA', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  ) : 'No due date set'}
                  highlight={!!exam.dueDate}
                />
              ) : (
                <DetailItem
                  label="Time Allocation"
                  value={durationLabel || 'No duration set'}
                  highlight={!!durationLabel}
                />
              )}
            </div>
          </div>
          {/* Footer metadata */}
          <div className="flex flex-wrap gap-4 text-[10px] font-bold text-slate-400">
            {exam.examId && (
              <span>ID: <span className="font-black text-slate-500 dark:text-slate-300">{exam.examId}</span></span>
            )}
            {exam.updatedAt && (
              <span>Last edited: <span className="font-black text-slate-500 dark:text-slate-300">
                {new Date(exam.updatedAt).toLocaleString('en-ZA')}
              </span></span>
            )}
            <span className={`px-2 py-0.5 rounded-lg ${statusCfg.cls}`}>{statusCfg.label}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DETAIL ITEM — used inside the expanded panel ─────────────────────────────
function DetailItem({ label, value, highlight = false }) {
  if (!value) return null;
  return (
    <div className="py-1 border-b border-slate-100 dark:border-slate-700 last:border-0">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-xs font-black mt-0.5 ${highlight ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-800 dark:text-white'}`}>
        {value}
      </p>
    </div>
  );
}


// ───────────────────────────────────────────────────────────────────────────
// TIME COUNTDOWN COMPONENT
// ───────────────────────────────────────────────────────────────────────────

function useCountdown(targetISO) {
  const [remaining, setRemaining] = React.useState(() => calc(targetISO));

  function calc(target) {
    if (!target) return null;
    const diff = new Date(target).getTime() - Date.now();
    if (diff <= 0) return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
    return {
      expired: false,
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000) / 60000),
      seconds: Math.floor((diff % 60000) / 1000),
      totalMs: diff,
    };
  }

  React.useEffect(() => {
    if (!targetISO) return;
    const interval = setInterval(() => setRemaining(calc(targetISO)), 1000);
    return () => clearInterval(interval);
  }, [targetISO]);

  return remaining;
}

function SubmissionCountdown({ dueDate, compact = false }) {
  const remaining = useCountdown(dueDate);
  if (!dueDate || !remaining) return null;

  // Urgency thresholds
  const urgency = remaining.expired
    ? 'expired'
    : remaining.totalMs < 3600000 ? 'critical'     // < 1 hour
      : remaining.totalMs < 86400000 ? 'warning'      // < 24 hours
        : 'normal';

  const styles = {
    normal: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300',
    warning: 'bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900 text-amber-700 dark:text-amber-300',
    critical: 'bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900 text-rose-700 dark:text-rose-300 animate-pulse',
    expired: 'bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400',
  };

  if (remaining.expired) {
    return (
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border font-black text-sm ${styles.expired}`}>
        <span>⏹</span> Submissions closed
      </div>
    );
  }

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-black ${styles[urgency]}`}>
        {remaining.days > 0 && `${remaining.days}d `}
        {String(remaining.hours).padStart(2, '0')}:
        {String(remaining.minutes).padStart(2, '0')}:
        {String(remaining.seconds).padStart(2, '0')}
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-2xl border ${styles[urgency]}`}>
      <p className="text-xs font-black uppercase tracking-widest mb-2 opacity-70">
        Time remaining
      </p>
      <div className="flex gap-3">
        {[
          { label: 'Days', value: remaining.days },
          { label: 'Hrs', value: remaining.hours },
          { label: 'Min', value: remaining.minutes },
          { label: 'Sec', value: remaining.seconds },
        ].map(({ label, value }) => (
          <div key={label} className="text-center">
            <div className="text-2xl font-black tabular-nums">
              {String(value).padStart(2, '0')}
            </div>
            <div className="text-[10px] uppercase tracking-wide opacity-60">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function TeacherDashboard() {
  const auth = getAuth();


  // Tabs
  const [activeTab, setActiveTab] = useState('results');

  // Upload wizard
  const [uploadStep, setUploadStep] = useState(1);
  const [examFile, setExamFile] = useState(null);
  const [memoFile, setMemoFile] = useState(null);
  const [paperTitle, setPaperTitle] = useState('');
  const [paperYear, setPaperYear] = useState(new Date().getFullYear().toString());
  const [paperSubject, setPaperSubject] = useState('');
  const [paperGrade, setPaperGrade] = useState('12');
  const [curriculum, setCurriculum] = useState('CAPS');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [teacherProfile, setTeacherProfile] = useState(null);
  const [examSource, setExamSource] = useState('local');
  const [memoSource, setMemoSource] = useState('local');
  const { openPicker } = useGooglePicker();


  // Audit trail
  const [uploadedExams, setUploadedExams] = useState([]);
  const [expandedRow, setExpandedRow] = useState(null);
  const [editingExam, setEditingExam] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortDir, setSortDir] = useState('desc'); // newest first
  const [user, setUser] = useState(auth.currentUser);
  const [examDuration, setExamDuration] = useState(60); // default 60 minutes

  const [examUsage, setExamUsage] = useState(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const API = import.meta.env.VITE_API_URL;
  const { school } = useSchool();
  const [selectedCurriculum, setSelectedCurriculum] = useState('');

  const schoolCountry = school?.country
    || teacherProfile?.country
    || 'South Africa';

  const { data: levels, loading: levelsLoading, error: levelsError, retry: retryLevels } = useAiList(
    fetchLevels,
    [schoolCountry, selectedCurriculum],
    !!schoolCountry && !!selectedCurriculum   // always true with fallback
  );

  const [students, setStudents] = useState([]);
  const [selectedGrade, setSelectedGrade] = useState('');
  const [skipMemo, setSkipMemo] = useState(false);

  const [assessmentType, setAssessmentType] = useState('exam'); // 'exam' | 'assignment'
  const [dueDate, setDueDate] = useState(null); // ISO string, e.g. "2026-07-20T14:30"
  const [examType, setExamType] = useState('exam');   // 'exam' | 'test' | 'assignment'
  const [aiFocus, setAiFocus] = useState('');

  // 1. Get unique grades from the students list to populate the dropdown
  const availableGrades = useMemo(() => {
    const grades = students.map(s => s.grade).filter(Boolean);
    return [...new Set(grades)].sort(); // Returns unique, sorted grades
  }, [students]);


  const [selectedSubject, setSelectedSubject] = useState('');
  const [examSubject, setExamSubject] = useState('');
  const [subjectName, setSubjectName] = useState('');

  const activeCurriculum =
    (school?.curriculum && school.curriculum.trim() !== "") ? school.curriculum :
      (teacherProfile?.curriculum && teacherProfile.curriculum.trim() !== "") ? teacherProfile.curriculum :
        selectedCurriculum || 'CAPS';


  const [showReviews, setShowReviews] = useState(false);
  const { reviews } = usePrincipalReviews(school?.id || teacherProfile?.schoolId, auth.currentUser?.uid);



  // ─── Auth listener ────────────────────────────────────────────────── 
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(setUser);
    return () => unsub();
  }, []);

  // ─── INIT ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    fetch(`${API}`).catch(() => { });
    ensureUserFirestoreDocs(user.uid, 'teacher').catch(console.error);

    const profileUnsub = onSnapshot(doc(db, 'teachers', user.uid), (snap) => {
      if (!snap.exists()) return;
      setTeacherProfile(snap.data());
    });

    return () => profileUnsub();
  }, [user]);

  useEffect(() => {
    const schoolId = teacherProfile?.schoolId;
    if (!user || !schoolId) return; // wait until profile loads

    const examsUnsub = onSnapshot(
      query(
        collection(db, 'exams'),
        where('uploadedBy', '==', user.uid) // Perfect! Rules love this.
      ),

      (snap) => {
        // 1. Map documents and add tracking IDs
        const exams = snap.docs.map((d) => ({
          ...d.data(),
          id: d.id,
          examId: d.data().examId || d.id,
        }));

        // 2. Sort them by date descending (Newest first)
        exams.sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));

        // 3. Set state directly (no redundant array filtering needed!)
        setUploadedExams(exams);
      },
      (err) => {
        console.error('[Audit] Failed to load exams:', err.message);
        setUploadedExams([]);
      }
    );

    return () => examsUnsub();
  }, [user, teacherProfile?.schoolId]);


  const teacherSubjects = Array.isArray(teacherProfile?.subjects)
    ? teacherProfile.subjects
    : (typeof teacherProfile?.subjects === 'string' && teacherProfile.subjects)
      ? [teacherProfile.subjects]
      : [];

  // const schoolCurricula = school?.curricula || [];
  // Locate where you process your school context data, and ensure it defaults to an array containing 'CAPS' if missing
  const schoolCurricula = (school?.curriculum
    ? (Array.isArray(school.curriculum) ? school.curriculum : [school.curriculum])
    : ['CAPS']
  ).filter(Boolean); // Clears out any accidental null/empty string records


  useEffect(() => {
    if (schoolCurricula.length === 1 && !selectedCurriculum) {
      setSelectedCurriculum(schoolCurricula[0]);
    }
  }, [schoolCurricula.join(',')]);

  // Auto-select first subject if exactly one
  useEffect(() => {
    if (teacherSubjects.length === 1 && !paperSubject) {
      setPaperSubject(teacherSubjects[0]);
    }
  }, [teacherSubjects.join(',')]);


  // ─── Fetch exam usage ──────────────────────────────────────────────────
  useEffect(() => {
    const fetchUsage = async (user) => {
      try {
        const idToken = await user.getIdToken();
        const response = await fetch(`${API}/exams/usage`, {
          headers: { 'Authorization': `Bearer ${idToken}` },
        });
        const text = await response.text();
        if (!response.ok) {
          console.error('[examUsage]', response.status, text.slice(0, 200));
          return;
        }
        setExamUsage(JSON.parse(text));
      } catch (err) {
        console.error('[examUsage]', err);
      } finally {
        setUsageLoading(false);
      }
    };

    const unsub = onAuthStateChanged(auth, user => {
      if (user) fetchUsage(user);
      else setUsageLoading(false);      // signed out — stop the spinner
    });
    return () => unsub();
  }, []);


  // ─── FILTERED + SORTED AUDIT LIST ────────────────────────────────────────
  const filteredExams = uploadedExams
    .filter((e) => {
      const term = searchTerm.toLowerCase();
      const matchSearch = !term ||
        e.title?.toLowerCase().includes(term) ||
        e.subject?.toLowerCase().includes(term);
      const matchSubject = !filterSubject || e.subject === filterSubject;
      const matchGrade = !filterGrade || String(e.grade) === filterGrade;
      const matchStatus = !filterStatus || e.status === filterStatus;
      return matchSearch && matchSubject && matchGrade && matchStatus;
    })
    .sort((a, b) => {
      const aTime = new Date(a.uploadedAt || 0).getTime();
      const bTime = new Date(b.uploadedAt || 0).getTime();
      return sortDir === 'desc' ? bTime - aTime : aTime - bTime;
    });


  // ─── UPLOAD ──────────────────────────────────────────────────────────────
  const handleExamUpload = async () => {

    // ── Time validation ─────────────────────────────────────────────────────
    const timeNotSet = assessmentType === 'assignment'
      ? !dueDate || new Date(dueDate) <= new Date()
      : !examDuration || examDuration <= 0;

    if (timeNotSet) {
      await Swal.fire({
        icon: 'warning',
        title: assessmentType === 'assignment' ? 'Due Date Required' : 'Duration Required',
        text: assessmentType === 'assignment'
          ? 'Please set a future due date and time before uploading this assignment.'
          : `Please set how long students have to complete this ${assessmentType}. Use the time picker above.`,
        confirmButtonColor: '#4F46E5',
      });
      return;
    }

    // ── 1. Validate files before touching anything ─────────────────────────
    const examError = validateExamFile(examFile, 'Exam file');

    if (examError) {
      Swal.fire({ icon: 'warning', title: 'Invalid File', text: examError });
      return;
    }
    if (!skipMemo && memoFile) {
      const memoError = validateExamFile(memoFile, 'Memo file');
      if (memoError) {
        Swal.fire({ icon: 'warning', title: 'Invalid Memo', text: memoError });
        return;
      }
    }

    setIsUploading(true);
    setUploadProgress('Checking account upload limits…');

    try {
      const token = await user.getIdToken();

      // ── 2. PRE-CHECK TIER LIMIT BEFORE UPLOADING STORAGE FILES ─────────────
      const checkRes = await fetch(`${import.meta.env.VITE_API_URL}/check-tier-limit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          schoolId: teacherProfile?.schoolId,
          role: 'exams' // checking exam upload limit
        })
      });

      const checkData = await checkRes.json();

      if (checkRes.status === 403 || checkData.error === 'limit_reached') {
        setIsUploading(false);
        setUploadProgress('');
        await Swal.fire({
          icon: 'warning',
          title: 'Upload Limit Reached',
          text: checkData.message || checkData.error || 'Your school has reached its exam upload limit for this tier.',
          confirmButtonText: 'Upgrade Plan',
          confirmButtonColor: '#4F46E5',
        });
        return; // Stop execution before uploading any files to Storage
      }

      // ── 3. Upload exam file to Firebase Storage ───────────────────────────
      setUploadProgress('Uploading exam file…');
      const examId = `${user.uid}_${Date.now()}`;
      const schoolFolder = `${teacherProfile.schoolId}_${(teacherProfile.schoolName || teacherProfile.school || 'School')
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        }`;

      const exam = await uploadExamFile(
        examFile,
        schoolFolder,
        selectedSubject,
        examId,
        'exam',
      );

      // ── 4. Upload memo file if provided ───────────────────────────────────
      let memo = { path: '', url: '', fileName: '', fileType: '' };
      if (!skipMemo && memoFile) {
        setUploadProgress('Uploading memo file…');
        memo = await uploadExamFile(
          memoFile,
          schoolFolder,
          selectedSubject,
          examId,
          'memo',
        );
      }

      // ── 5. Send paths + metadata to Flask backend ─────────────────────────
      setUploadProgress('Creating exam record…');
      const currentActiveType = assessmentType || examType || 'exam';

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/exams/upload`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            examId,
            title: paperTitle || "Untitled Assessment",
            subject: paperSubject || teacherSubjects[0] || "",
            schoolId: teacherProfile?.schoolId || '',
            grade: selectedGrade || "12",
            curriculum: selectedCurriculum,
            examType: currentActiveType,
            examDuration: currentActiveType === 'assignment' ? 0 : (parseInt(examDuration) || 60),
            dueDate: currentActiveType === 'assignment' ? dueDate : null,
            examFileName: exam.fileName,
            examFileType: exam.fileType,
            examStoragePath: exam.path,
            examStorageUrl: exam.url,
            memoFileName: memo.fileName || '',
            memoFileType: memo.fileType || '',
            memoStoragePath: memo.path || '',
            memoStorageUrl: memo.url || '',
            aiMarkingOnly: skipMemo || !memoFile,
            teacherName: teacherProfile.displayName || teacherProfile.name || 'Teacher',
            schoolName: teacherProfile.schoolName || teacherProfile.school || '',
            schoolFolder,
            uploadedBy: user.uid,
            year: new Date().getFullYear().toString(),
            aiFocus: aiFocus || '',
          }),
        }
      );

      setUploadProgress('Finalising…');
      const saved = await response.json();

      if (!response.ok || !saved?.examId) {
        throw new Error(saved?.error || 'Failed to create exam record');
      }

      // Update frontend usage quota metrics
      if (typeof fetchUsage === 'function') fetchUsage();

      // Clear wizard workflow parameters on success
      setUploadStep(1);
      setExamFile(null);
      setMemoFile(null);
      setSkipMemo(false);
      setPaperTitle('');

      await Swal.fire({
        icon: 'success',
        title: 'Exam Uploaded!',
        html: `
        <strong>${paperTitle || "Assessment"}</strong> has been uploaded successfully.<br/>
        <span style="font-size:13px;color:#6b7280">
          AI extraction is running in the background.<br/>
          Questions will appear in the Audit Trail within a minute.
        </span>
      `,
        confirmButtonText: 'View Audit Trail',
        confirmButtonColor: '#6366f1',
        timer: 6000,
        timerProgressBar: true,
      });

      if (typeof setActiveTab === 'function') setActiveTab('audit');

    } catch (err) {
      console.error('[Upload]', err);
      Swal.fire({ icon: 'error', title: 'Upload Failed', text: err.message });
    } finally {
      setIsUploading(false);
      setUploadProgress('');
    }
  };

  // ─── EDIT ────────────────────────────────────────────────────────────────
  const handleEdit = (exam) => setEditingExam(exam);

  const handleSaveEdit = async (changes) => {
    const user = auth.currentUser;
    if (!user || !editingExam) return;
    const examId = editingExam.examId || editingExam.id;
    await updateExamInAudit(user.uid, examId, changes);
  };

  const fetchUsage = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    setUsageLoading(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch(`${API}/exams/usage`, {
        headers: { 'Authorization': `Bearer ${idToken}` },
      });
      const data = await response.json();
      if (response.ok) setExamUsage(data);
    } catch (err) {
      console.error('[examUsage]', err);
    } finally {
      setUsageLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);
  // { console.log('examUsage:', examUsage, 'usageLoading:', usageLoading) }

  useEffect(() => {
    if (uploadStep === 3 && !usageLoading && examUsage) {
      Swal.fire({
        icon: examUsage.atLimit ? 'warning' : 'info',
        title: examUsage.atLimit ? 'Upload Limit Reached' : 'Monthly Upload Usage',
        html: examUsage.atLimit
          ? `You've used all <strong>${examUsage.limit}</strong> exam uploads on the ${examUsage.tier.charAt(0).toUpperCase() + examUsage.tier.slice(1)} plan this month.<br><br>Wait until next month, or ask your principal to upgrade your school's plan for more uploads.`
          : `<strong>${examUsage.used}/${examUsage.limit}</strong> uploads used this month — <strong>${examUsage.remaining}</strong> upload${examUsage.remaining !== 1 ? 's' : ''} remaining.${examUsage.remaining <= 1 ? '<br><br>If you need more, ask your principal to upgrade your school\'s plan.' : ''}`,
        confirmButtonText: 'Got it',
        confirmButtonColor: '#4F46E5',
      });
    }
  }, [uploadStep, usageLoading, examUsage]);

  // ─── DELETE ──────────────────────────────────────────────────────────────
  const handleDelete = async (exam) => {
    const examId = exam.examId || exam.id;

    const { isConfirmed, value: selected } = await Swal.fire({
      title: 'Delete this exam?',
      html: `
      <p style="color:#6B7280; margin-bottom:12px; font-size:14px;">
        Choose what to permanently remove for <strong style="color:#111">"${exam.title}"</strong>
      </p>
      <div style="text-align:left; display:flex; flex-direction:column; gap:10px; background:#F9FAFB; border:1px solid #E5E7EB; border-radius:8px; padding:14px;">
        <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:14px;">
          <input type="checkbox" id="del-firestore" checked style="width:16px;height:16px;accent-color:#EF4444;" />
          <span>
            <span style="font-weight:500;">Firestore record</span>
            <span style="display:block; font-size:12px; color:#9CA3AF;">Removes the exam document from the database</span>
          </span>
        </label>
        <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:14px;">
          <input type="checkbox" id="del-trail" style="width:16px;height:16px;accent-color:#EF4444;" />
          <span>
            <span style="font-weight:500;">Audit trail</span>
            <span style="display:block; font-size:12px; color:#9CA3AF;">Clears activity logs associated with this exam</span>
          </span>
        </label>
        <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:14px;">
          <input type="checkbox" id="del-drive" style="width:16px;height:16px;accent-color:#EF4444;" />
          <span>
            <span style="font-weight:500;">Google Drive files</span>
            <span style="display:block; font-size:12px; color:#9CA3AF;">Permanently deletes linked files — cannot be undone</span>
          </span>
        </label>
      </div>
    `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete Selected',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#EF4444',
      cancelButtonColor: '#6B7280',
      preConfirm: () => ({
        firestore: document.getElementById('del-firestore').checked,
        trail: document.getElementById('del-trail').checked,
        drive: document.getElementById('del-drive').checked,
      }),
    });

    if (!isConfirmed) return;
    if (!selected.firestore && !selected.trail && !selected.drive) {
      Swal.fire({ icon: 'info', title: 'Nothing selected', text: 'Please check at least one item to delete.' });
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    try {
      const deleted = await runExamDeletion({
        uid: user.uid,
        examId,
        driveFileId: exam.driveFileId,
        selected,                        // from Swal preConfirm
      });

      Swal.fire({
        icon: 'success',
        title: 'Deleted',
        text: `Removed: ${deleted}`,
        confirmButtonColor: '#4F46E5',
        timer: 2500,
        showConfirmButton: false,
      });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Delete Failed', text: err.message });
    }
  };

  const handleLogout = () => {
    signOut(auth).then(() => { sessionStorage.clear(); window.location.href = '/'; });
  };

  function DriveIcon({ className }) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <path d="M6.5 20L1 11l4-7h14l4 7-4 7H6.5z" fill="#FBBC04" opacity=".8" />
        <path d="M1 11l5.5 9H15L9.5 11H1z" fill="#4285F4" opacity=".8" />
        <path d="M9.5 11L15 20h4l1-2-5.5-9-5 2z" fill="#34A853" opacity=".8" />
      </svg>
    );
  }
  // ─── UI ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 bg-gray-50 dark:bg-slate-950 min-h-screen transition-colors duration-500">

      {/* HEADER */}
      <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 text-white rounded-[2.5rem] p-8 mb-8 shadow-2xl relative overflow-hidden border border-white/10">
        <div className="relative z-10">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/10">
                  {teacherProfile?.teachingPhase || 'FET'} Phase
                </span>
              </div>
              <h1 className="text-4xl md:text-5xl font-black mb-1 tracking-tighter">
                Hello, {teacherProfile?.title || ''} {teacherProfile?.firstName || teacherProfile?.displayName || 'Teacher'}

              </h1>
              <p className="opacity-70 text-sm font-medium flex items-center gap-2">
                <School size={14} /> {teacherProfile?.schoolName || teacherProfile?.school || 'South African Educator'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <PrincipalReviewBadge reviews={reviews} onClick={() => setShowReviews(true)} />

              <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-2xl text-xs font-bold border border-white/5">
                {activeCurriculum}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              {/* ✅  Drive badge removed, curriculum badge kept: */}
              <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-2xl text-xs font-bold border border-white/5">
                {activeCurriculum}
              </div>
            </div>
          </div>

          {/* ── REPLACE the InfoItem grid ───────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-8 border-t border-white/10 mt-8">

            {/* Subjects — from teacher profile (wizard writes this) */}
            <InfoItem
              icon={BookOpen}
              label="Subjects"
              value={
                Array.isArray(teacherProfile?.subjects)
                  ? teacherProfile.subjects.join(', ')
                  : teacherProfile?.subjects || '—'
              }
            />

            {/* Province/Country — from school document */}
            <InfoItem
              icon={MapPin}
              label="Province"
              value={
                school?.province          // if school doc has province
                || school?.country        // fallback to country
                || teacherProfile?.province
                || 'South Africa'
              }
            />

            {/* Curriculum — from school document */}
            <InfoItem
              icon={GraduationCap}
              label="Curriculum"
              value={
                school?.curriculum
                || teacherProfile?.curriculum
                || selectedCurriculum
                || 'CAPS'
              }
            />

            {/* Uploads count */}
            <InfoItem
              icon={ShieldCheck}
              label="Uploaded"
              value={`${uploadedExams.length} paper${uploadedExams.length !== 1 ? 's' : ''}`}
            />

            <PrincipalReviewsModal
              open={showReviews}
              onClose={() => setShowReviews(false)}
              reviews={reviews}
              reviewerNames={{ [school?.principalUid]: school?.principalName }}
            />

          </div>
        </div>
        <div className="absolute -right-10 -top-10 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* TABS */}
      <div className="flex p-1.5 bg-white dark:bg-slate-900 rounded-2xl w-fit mb-8 shadow-sm border border-slate-200 dark:border-slate-800 gap-1 flex-wrap">
        <TabButton active={activeTab === 'results'} onClick={() => setActiveTab('results')} icon={<ClipboardList size={16} />} label="Mark Analysis" />
        <TabButton active={activeTab === 'upload'} onClick={() => setActiveTab('upload')} icon={<Upload size={16} />} label="Upload Paper" />
        <TabButton active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} icon={<FileText size={16} />} label={`Audit Trail ${uploadedExams.length > 0 ? `(${uploadedExams.length})` : ''}`} />
      </div>

      {/* ── RESULTS TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'results' && (
        <ResultsTab teacherMode={true} />
      )}

      {/* ── UPLOAD TAB ───────────────────────────────────────────────────── */}
      {activeTab === 'upload' && (
        <div className="space-y-8 animate-in zoom-in-95 duration-300">
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">

            {/* ── Header ──────────────────────────────────────────────────────── */}
            <div className="bg-indigo-600 p-8 flex justify-between items-center text-white">
              <div>
                <h2 className="text-2xl font-black italic uppercase tracking-tighter">File Uploads</h2>
                <p className="text-indigo-100 text-xs font-bold uppercase tracking-widest opacity-80 mt-1">
                  Step {uploadStep} of 3
                </p>
              </div>
              <div className="flex gap-2">
                {[1, 2, 3].map((s) => (
                  <div
                    key={s}
                    className={`h-2 rounded-full transition-all duration-300 ${s < uploadStep ? 'bg-white w-8'
                      : s === uploadStep ? 'bg-white w-10'
                        : 'bg-white/30 w-4'
                      }`}
                  />
                ))}
              </div>
            </div>

            <div className="p-10">

              {/* ══════════════════════════════════════════════════════════════════
            STEP 1 — Identity & Metadata
        ══════════════════════════════════════════════════════════════════ */}
              {uploadStep === 1 && (
                <div className="max-w-2xl mx-auto space-y-6">
                  <StepHeader num={1} title="Identity & Metadata" />

                  <input
                    type="text"
                    placeholder="Exam Name (e.g. English Exam 2)"
                    value={paperTitle}
                    onChange={(e) => setPaperTitle(e.target.value)}
                    className="w-full border-2 dark:bg-slate-800 dark:border-slate-700 p-5 rounded-2xl outline-none focus:border-indigo-600 font-bold text-sm"
                  />

                  {/* Subject + Year */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {teacherSubjects.length === 0 ? (
                      <input
                        type="text"
                        value={paperSubject}
                        onChange={(e) => setPaperSubject(e.target.value)}
                        placeholder="Subject (e.g. CAT, Mathematics)"
                        className="p-5 border-2 dark:bg-slate-800 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:border-indigo-600"
                      />
                    ) : teacherSubjects.length === 1 ? (
                      <div className="p-5 border-2 border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Subject</p>
                        <p className="font-bold text-sm text-slate-700 dark:text-slate-200">
                          {teacherSubjects[0]}
                        </p>
                      </div>
                    ) : (
                      <select
                        value={paperSubject}
                        onChange={(e) => setPaperSubject(e.target.value)}
                        className="p-5 border-2 dark:bg-slate-800 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:border-indigo-600"
                      >
                        <option value="">Select Subject</option>
                        {teacherSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}

                    <input
                      type="number"
                      value={paperYear}
                      onChange={(e) => setPaperYear(e.target.value)}
                      placeholder="Year"
                      className="p-5 border-2 dark:bg-slate-800 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:border-indigo-600"
                    />
                  </div>

                  {/* Curriculum + Grade */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {schoolCurricula.length <= 1 ? (
                      <div className="p-5 border-2 border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-800/50 flex flex-col justify-center">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                          Curriculum
                        </p>
                        <p className="font-bold text-sm text-slate-700 dark:text-slate-200">
                          {schoolCurricula[0] || 'No curriculum on file — contact your principal'}
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col relative">
                        <select
                          value={selectedCurriculum}
                          onChange={(e) => {
                            setSelectedCurriculum(e.target.value);
                            setPaperGrade('');
                          }}
                          className="p-5 border-2 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:border-indigo-600 dark:focus:border-indigo-500 text-slate-700 dark:text-slate-200 w-full transition-colors"
                        >
                          <option value="">Select Curriculum</option>
                          {schoolCurricula.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="flex flex-col relative">
                      <select
                        value={paperGrade}
                        onChange={(e) => setPaperGrade(e.target.value)}
                        disabled={!selectedCurriculum || levelsLoading}
                        className="p-5 border-2 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:border-indigo-600 dark:focus:border-indigo-500 text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:bg-slate-50 dark:disabled:bg-slate-900/40 disabled:border-slate-100 dark:disabled:border-slate-800/80 transition-all w-full"
                      >
                        <option value="">
                          {!selectedCurriculum
                            ? 'Select curriculum first'
                            : levelsLoading
                              ? 'Loading levels...'
                              : 'Select Grade / Level'}
                        </option>
                        {levels.map((lvl) => (
                          <option key={lvl} value={lvl}>{lvl}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {levelsError && (
                    <button type="button" onClick={retryLevels} className="text-xs text-red-500 font-bold underline">
                      {levelsError} — Retry
                    </button>
                  )}

                  {/* AI Focus Areas */}
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      AI Focus Areas <span className="text-slate-300 dark:text-slate-600">(optional)</span>
                    </label>
                    <textarea
                      value={aiFocus}
                      onChange={(e) => setAiFocus(e.target.value)}
                      placeholder="Tell the AI what to focus on when marking this paper. E.g. 'Mark strictly for terminology and practical application', or 'Focus on problem-solving steps, not just final answers'"
                      rows={3}
                      className="w-full p-5 border-2 dark:bg-slate-800 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:border-indigo-600 resize-none"
                    />
                  </div>

                  <button
                    onClick={() => setUploadStep(2)}
                    disabled={!paperTitle.trim() || !paperSubject || !paperGrade}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-5 rounded-[2rem] flex items-center justify-center gap-3 transition-all disabled:opacity-30"
                  >
                    CONTINUE <ArrowRight size={20} />
                  </button>
                </div>
              )}

              {/* ══════════════════════════════════════════════════════════════════
            STEP 2 — Upload Question Paper
        ══════════════════════════════════════════════════════════════════ */}
              {uploadStep === 2 && (
                <div className="max-w-2xl mx-auto space-y-6">
                  <StepHeader num={2} title="Upload Question Paper" />

                  {/* Source toggle */}
                  <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                    {['local', 'drive'].map((src) => (
                      <button
                        key={src}
                        type="button"
                        onClick={() => { setExamSource(src); setExamFile(null); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black transition-all ${examSource === src
                          ? 'bg-white dark:bg-slate-700 shadow text-indigo-600 dark:text-indigo-400'
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                          }`}
                      >
                        {src === 'local'
                          ? <><Monitor size={15} /> My Computer</>
                          : <><DriveIcon className="w-4 h-4" /> Google Drive</>}
                      </button>
                    ))}
                  </div>

                  {examSource === 'local' ? (
                    <FileDropZone
                      id="examFile"
                      file={examFile}
                      onChange={setExamFile}
                      icon={<FileText size={32} className="text-indigo-400" />}
                      label="Click to Select Document"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => openPicker((f) => setExamFile(f), 'office')}
                      className="w-full border-2 border-dashed border-indigo-300 dark:border-indigo-700 rounded-2xl p-10 flex flex-col items-center gap-3 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all group"
                    >
                      <DriveIcon className="w-10 h-10" />
                      <div className="text-center">
                        <p className="font-black text-sm text-slate-700 dark:text-slate-300 group-hover:text-indigo-600">
                          {examFile ? examFile.name : 'Choose from Google Drive'}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">Ms Word documents supported</p>
                      </div>
                      {examFile && (
                        <span className="text-xs bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-full font-black">
                          ✓ File selected
                        </span>
                      )}
                    </button>
                  )}

                  {/* Time Picker Conditional Check */}
                  {assessmentType === 'assignment' ? (
                    // ── ASSIGNMENT DUE DATE MODE ──────────────────────────────────────────
                    <div className="space-y-2">
                      <label className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                        Submission Due Date & Time
                      </label>
                      <ExamTimePicker
                        key="datetime-picker" // 🔑 Remounts the component cleanly for assignment mode
                        mode="datetime"
                        value={dueDate}
                        onChange={setDueDate}
                      />
                    </div>
                  ) : (
                    // ── EXAM / TEST TIMED DURATION MODE ───────────────────────────────────
                    <div className="space-y-2">
                      <label className="text-sm font-black text-slate-700 dark:text-slate-300">
                        Set Exam Time Limit
                      </label>
                      <ExamTimePicker
                        key="duration-picker" // 🔑 Remounts the component cleanly for timed mode
                        mode="duration"
                        value={examDuration}
                        onChange={setExamDuration}
                      />
                    </div>
                  )}

                  <div className="flex gap-4">
                    <button
                      onClick={() => setUploadStep(1)}
                      className="flex-1 bg-slate-100 dark:bg-slate-800 p-5 rounded-2xl font-black text-sm flex items-center justify-center gap-2"
                    >
                      <ArrowLeft size={16} /> Back
                    </button>
                    <button
                      onClick={() => { setSkipMemo(false); setUploadStep(3); }}
                      disabled={!examFile}
                      className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white p-5 rounded-2xl font-black text-sm disabled:opacity-30 transition-colors"
                    >
                      Next: Marking Memo →
                    </button>
                  </div>

                  {examFile && (
                    <button
                      onClick={() => { setSkipMemo(true); setMemoFile(null); setUploadStep(3); }}
                      className="w-full mt-3 py-3 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 text-xs font-black text-slate-400 hover:text-indigo-500 hover:border-indigo-300 transition-colors"
                    >
                      Skip memo — use AI subject knowledge for marking →
                    </button>
                  )}
                </div>
              )}

              {/* ══════════════════════════════════════════════════════════════════
            STEP 3 — Memo or AI marking
        ══════════════════════════════════════════════════════════════════ */}
              {uploadStep === 3 && (
                <div className="max-w-2xl mx-auto space-y-6">
                  <StepHeader num={3} title={skipMemo ? 'AI Marking Confirmed' : 'Upload Marking Memo'} />

                  {/* ── Branch A: skipped memo / AI-only ──────────────────────── */}
                  {skipMemo ? (
                    <div className="space-y-6">

                      {/* AI marking info card */}
                      <div className="rounded-2xl p-6 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
                            <GraduationCap size={20} className="text-white" />
                          </div>
                          <div>
                            <p className="font-black text-indigo-800 dark:text-indigo-200 text-sm mb-1">
                              AI Subject-Knowledge Marking
                            </p>
                            <p className="text-xs text-indigo-600 dark:text-indigo-300 leading-relaxed">
                              No memo required. Eduket AI will mark every answer using its deep
                              understanding of the <strong>{paperSubject}</strong> NSC curriculum —
                              awarding marks for correct meaning, ignoring minor spelling errors, and providing
                              detailed per-question feedback.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Assessment Type Selection Buttons */}
                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                          Assessment Type
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {['exam', 'assignment'].map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => {
                                setAssessmentType(type);
                                if (typeof setExamType === 'function') {
                                  setExamType(type); // 🔑 Syncs examType with assessmentType on click
                                }
                              }}
                              className={`py-2.5 rounded-xl text-sm font-black capitalize transition-all border
          ${assessmentType === type
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                  : 'bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                                }`}
                            >
                              {type}
                            </button>
                          ))}
                        </div>
                      </div>



                      {/* ── Time not set warning ─────────────────────────────────────────────── */}
                      {(assessmentType === 'assignment'
                        ? !dueDate || new Date(dueDate) <= new Date()
                        : !examDuration || examDuration <= 0
                      ) && (
                          <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20
                  border border-red-200 dark:border-red-800 rounded-2xl">
                            <span className="text-red-500 text-base flex-shrink-0">⚠</span>
                            <p className="text-xs font-bold text-red-700 dark:text-red-300">
                              {assessmentType === 'assignment'
                                ? 'A due date is required before uploading. Set it above.'
                                : 'A time duration is required before uploading. Set it above.'
                              }
                            </p>
                          </div>
                        )}

                      {/* Summary */}
                      <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-5 space-y-2 text-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                          Ready to upload
                        </p>
                        <SummaryRow label="Title" value={paperTitle} />
                        <SummaryRow label="Subject" value={paperSubject} />
                        <SummaryRow label="Grade" value={`Grade ${paperGrade}`} />
                        <SummaryRow label="Year" value={paperYear} />
                        <SummaryRow label="Paper" value={examFile?.name} />
                        <SummaryRow label="Memo" value="None — AI marking" />
                        {/* Duration OR Due Date — depends on assessment type */}
                        {assessmentType === 'assignment' ? (
                          <SummaryRow
                            label="Due Date"
                            value={
                              dueDate
                                ? new Date(dueDate).toLocaleDateString('en-ZA', {
                                  weekday: 'short',
                                  day: 'numeric',
                                  month: 'long',
                                  year: 'numeric',
                                })
                                : 'No due date set'
                            }
                          />
                        ) : (
                          <SummaryRow
                            label="Duration"
                            value={
                              (() => {
                                if (!examDuration || examDuration === 0) return 'No time limit';
                                const hours = Math.floor(examDuration / 60);
                                const mins = examDuration % 60;

                                const hourStr = hours > 0 ? `${hours} hr${hours > 1 ? 's' : ''}` : '';
                                const minStr = mins > 0 ? `${mins} min${mins > 1 ? 's' : ''}` : '';

                                return [hourStr, minStr].filter(Boolean).join(' ');
                              })()
                            }
                          />
                        )}
                      </div>

                      {/* Upload progress */}
                      {isUploading && (
                        <div className="flex items-center gap-3 p-5 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl">
                          <Loader2 size={20} className="animate-spin text-indigo-600" />
                          <p className="text-sm font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-widest">
                            {uploadProgress}
                          </p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-4">
                        <button
                          onClick={() => { setSkipMemo(false); setUploadStep(2); }}
                          disabled={isUploading}
                          className="flex-1 bg-slate-100 dark:bg-slate-800 p-5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <ArrowLeft size={16} /> Back
                        </button>
                        {(() => {
                          const timeNotSet = assessmentType === 'assignment'
                            ? !dueDate || new Date(dueDate) <= new Date()
                            : !examDuration || examDuration <= 0;

                          return (
                            <button
                              onClick={handleExamUpload}
                              disabled={isUploading || examUsage?.atLimit || timeNotSet}
                              className="flex-[2] bg-green-600 hover:bg-green-700 text-white p-5 rounded-2xl font-black text-sm shadow-lg shadow-green-500/20 disabled:opacity-40 transition-colors"
                            >
                              {examUsage?.atLimit
                                ? 'Upload Limit Reached'
                                : timeNotSet
                                  ? assessmentType === 'assignment'
                                    ? '⚠ Set Due Date First'
                                    : '⚠ Set Duration First'
                                  : 'FINALIZE UPLOAD'
                              }
                            </button>
                          );
                        })()}
                      </div>
                    </div>

                  ) : (
                    /* ── Branch B: normal memo upload ─────────────────────────── */
                    <div className="space-y-6">

                      {/* Source toggle */}
                      <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                        {['local', 'drive'].map((src) => (
                          <button
                            key={src}
                            type="button"
                            onClick={() => { setMemoSource(src); setMemoFile(null); }}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black transition-all ${memoSource === src
                              ? 'bg-white dark:bg-slate-700 shadow text-green-600 dark:text-green-400'
                              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                              }`}
                          >
                            {src === 'local'
                              ? <><Monitor size={15} /> My Computer</>
                              : <><DriveIcon className="w-4 h-4" /> Google Drive</>}
                          </button>
                        ))}
                      </div>

                      {memoSource === 'local' ? (
                        <FileDropZone
                          id="memoFile"
                          file={memoFile}
                          onChange={setMemoFile}
                          icon={<CheckCircle size={32} className="text-green-400" />}
                          label="Click to Select Memo Document"
                          accentColor="green"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => openPicker((f) => setMemoFile(f), 'office')}
                          className="w-full border-2 border-dashed border-green-300 dark:border-green-700 rounded-2xl p-10 flex flex-col items-center gap-3 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all group"
                        >
                          <DriveIcon className="w-10 h-10" />
                          <div className="text-center">
                            <p className="font-black text-sm text-slate-700 dark:text-slate-300 group-hover:text-green-600">
                              {memoFile ? memoFile.name : 'Choose from Google Drive'}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">Word documents supported</p>
                          </div>
                          {memoFile && (
                            <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-3 py-1 rounded-full font-black">
                              ✓ File selected
                            </span>
                          )}
                        </button>
                      )}

                      {/* Skip link */}
                      <button
                        onClick={() => { setSkipMemo(true); setMemoFile(null); }}
                        className="w-full py-2.5 text-xs font-black text-slate-400 hover:text-indigo-500 transition-colors"
                      >
                        No memo available — skip and use AI marking instead →
                      </button>

                      {/* Upload progress */}
                      {isUploading && (
                        <div className="flex items-center gap-3 p-5 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl">
                          <Loader2 size={20} className="animate-spin text-indigo-600" />
                          <p className="text-sm font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-widest">
                            {uploadProgress}
                          </p>
                        </div>
                      )}

                      {/* Summary — only shown once both files are selected */}
                      {examFile && memoFile && !isUploading && (
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-5 space-y-2 text-sm">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                            Ready to upload
                          </p>
                          <SummaryRow label="Title" value={paperTitle} />
                          <SummaryRow label="Subject" value={paperSubject} />
                          <SummaryRow label="Grade" value={`Grade ${paperGrade}`} />
                          <SummaryRow label="Year" value={paperYear} />
                          <SummaryRow label="Paper" value={examFile.name} />
                          <SummaryRow label="Memo" value={memoFile.name} />
                          <SummaryRow
                            label="Duration"
                            value={`${Math.floor(examDuration / 60) > 0 ? `${Math.floor(examDuration / 60)} hr ` : ''}${examDuration % 60} min`}
                          />
                        </div>
                      )}



                      {/* Actions */}
                      <div className="flex gap-4">
                        <button
                          onClick={() => setUploadStep(2)}
                          disabled={isUploading}
                          className="flex-1 bg-slate-100 dark:bg-slate-800 p-5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <ArrowLeft size={16} /> Back
                        </button>
                        <button
                          onClick={handleExamUpload}
                          disabled={isUploading || !memoFile || examUsage?.atLimit}
                          className="flex-[2] bg-green-600 hover:bg-green-700 text-white p-5 rounded-2xl font-black text-sm shadow-lg shadow-green-500/20 disabled:opacity-40 transition-colors"
                        >
                          {examUsage?.atLimit ? 'Upload Limit Reached' : 'FINALIZE UPLOAD'}
                        </button>
                      </div>
                      <SubmissionCountdown dueDate={dueDate} />
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ── AUDIT TRAIL TAB ──────────────────────────────────────────────── */}
      {
        activeTab === 'audit' && (
          <div className="space-y-6 animate-in fade-in">

            {/* Audit header + stats */}
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 border border-slate-100 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
                <div>
                  <h2 className="text-2xl font-black">Exam Upload Audit Trail</h2>
                  <p className="text-slate-400 text-sm mt-1">
                    {uploadedExams.length} paper{uploadedExams.length !== 1 ? 's' : ''} uploaded · Live from Firestore
                  </p>
                </div>
                <button onClick={() => setActiveTab('upload')}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs transition-colors">
                  <Upload size={14} /> New Upload
                </button>
              </div>

              {/* Stats strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  {
                    label: 'Total',
                    value: uploadedExams.length,
                    cls: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400'
                  },
                  {
                    label: 'Ready',
                    value: uploadedExams.filter((e) => e.status === 'ready').length,
                    cls: 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800 text-green-600 dark:text-green-400'
                  },
                  {
                    label: 'Pending',
                    value: uploadedExams.filter((e) => e.status === 'pending_extraction').length,
                    cls: 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800 text-amber-600 dark:text-amber-400'
                  },
                  {
                    label: 'Subjects',
                    value: new Set(uploadedExams.map((e) => e.subject).filter(Boolean)).size,
                    cls: 'bg-purple-50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-800 text-purple-600 dark:text-purple-400'
                  },
                ].map(({ label, value, cls }) => (
                  <div key={label} className={`rounded-2xl p-4 border ${cls}`}>
                    <p className="text-2xl font-black">{value}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 flex flex-wrap gap-3 items-center">
              {/* Search */}
              <div className="relative flex-1 min-w-48">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Search exams..." value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border dark:bg-slate-800 dark:border-slate-700 text-sm outline-none focus:border-indigo-500" />
              </div>

              {/* Subject filter */}
              <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}
                className="px-3 py-2.5 rounded-xl border dark:bg-slate-800 dark:border-slate-700 text-xs font-bold outline-none focus:border-indigo-500 min-w-32">
                <option value="">All Subjects</option>
                {[...new Set(uploadedExams.map((e) => e.subject).filter(Boolean))].sort().map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              {/* Grade filter */}
              <select onChange={(e) => setSelectedGrade(e.target.value)}>
                <option value="">Select Grade</option>
                {availableGrades.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>

              {/* Status filter */}
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2.5 rounded-xl border dark:bg-slate-800 dark:border-slate-700 text-xs font-bold outline-none focus:border-indigo-500">
                <option value="">All Statuses</option>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>

              {/* Sort */}
              <button onClick={() => setSortDir((d) => d === 'desc' ? 'asc' : 'desc')}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border dark:border-slate-700 text-xs font-black text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                <Filter size={12} />
                {sortDir === 'desc' ? 'Newest First' : 'Oldest First'}
              </button>

              {/* Clear */}
              {(searchTerm || filterSubject || filterGrade || filterStatus) && (
                <button onClick={() => { setSearchTerm(''); setFilterSubject(''); setFilterGrade(''); setFilterStatus(''); }}
                  className="flex items-center gap-1 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 text-xs font-black hover:bg-red-100 transition-colors">
                  <X size={12} /> Clear
                </button>
              )}

              <p className="ml-auto text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {filteredExams.length} result{filteredExams.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Audit rows */}
            {filteredExams.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-20 border border-slate-100 dark:border-slate-800 text-center">
                <FileText className="text-slate-200 dark:text-slate-700 mx-auto mb-3" size={40} />
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">
                  {uploadedExams.length === 0 ? 'No exams uploaded yet' : 'No results match your filters'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredExams.map((exam) => {
                  const id = exam.examId || exam.id || exam.uploadedAt;
                  return (
                    <AuditRow
                      key={id}
                      exam={exam}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      expanded={expandedRow === id}
                      onToggle={() => setExpandedRow(expandedRow === id ? null : id)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )
      }

      <PrincipalReviewsInline
        reviews={reviews}
        reviewerNames={{ [school?.principalUid]: school?.principalName }}
      />

      {/* Edit modal */}
      {
        editingExam && (
          <EditExamModal
            exam={editingExam}
            onSave={handleSaveEdit}
            onClose={() => setEditingExam(null)}
          />
        )
      }

      {/* Logout */}
      <button onClick={handleLogout}
        className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-slate-400 hover:text-rose-600 transition-all font-black border border-slate-200 dark:border-slate-800 mt-12 text-xs uppercase tracking-widest">
        <LogOut size={16} /> Close Session
      </button>
    </div >
  );
}

// ─── SMALL COMPONENTS ─────────────────────────────────────────────────────────

function InfoItem({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3">
      <div className="bg-white/10 p-2 rounded-xl border border-white/5">
        <Icon className="w-4 h-4 text-indigo-300" />
      </div>
      <div>
        <p className="text-[10px] opacity-60 uppercase font-black tracking-widest">{label}</p>
        <p className="font-bold text-sm truncate max-w-[130px]">{value}</p>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label, badge }) {
  return (
    <button onClick={onClick}
      className={`relative flex items-center gap-2 px-5 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${active ? 'bg-indigo-600 text-white shadow-lg scale-105' : 'text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400'
        }`}>
      {icon} {label}
      {badge && <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[8px] rounded-full flex items-center justify-center animate-pulse">{badge}</span>}
    </button>
  );
}

function StepHeader({ num, title }) {
  return (
    <div className="flex items-center gap-4 mb-2">
      <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-xl flex items-center justify-center font-black text-lg">{num}</div>
      <h3 className="text-xl font-black">{title}</h3>
    </div>
  );
}

function FileDropZone({ id, file, onChange, icon, label, accentColor = 'indigo' }) {
  const border = accentColor === 'green' ? 'border-green-200 bg-green-50/30' : 'border-indigo-200 bg-indigo-50/30';
  return (
    <div className={`border-4 border-dashed rounded-[2rem] p-12 text-center transition-all ${file ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/10' : border}`}>
      <input type="file" id={id} accept=".pdf" onChange={(e) => onChange(e.target.files[0])} className="hidden" />
      <label htmlFor={id} className="cursor-pointer block">
        <div className="bg-white dark:bg-slate-800 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-xl border border-slate-100 dark:border-slate-700">
          {file ? <CheckCircle2 className="text-green-500" size={40} /> : icon}
        </div>
        <p className="text-lg font-black">{file ? file.name : label}</p>
        <p className="text-[10px] uppercase font-black tracking-widest opacity-40 mt-2">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'MS WORD FORMAT ONLY · MAX 2MB'}</p>
      </label>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-700 last:border-0">
      <span className="text-slate-400 text-xs font-bold">{label}</span>
      <span className="font-black text-slate-700 dark:text-slate-200 text-xs">{value}</span>
    </div>
  );
}
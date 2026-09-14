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
  CalendarDays, Tag, Layers, Activity, ArrowUpDown, Edit3
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
import { useNavigate } from 'react-router-dom';


// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const DBE_SUBJECTS = [
  "CAT", "IT", "Mathematics", "Mathematical Literacy",
  "English HL", "English FAL", "Physical Sciences", "Life Sciences",
  "Accounting", "Business Studies", "Economics", "History", "Geography",
  "Life Orientation", "Consumer Studies", "Afrikaans HL", "Afrikaans FAL",
  "isiXhosa HL", "isiZulu HL",
];

const CURRICULA = ['CAPS', 'IEB', 'SACAI', 'Cambridge'];
const STATUS_CONFIG = {
  ready: { label: 'Ready', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  pending_extraction: { label: 'Extracting...', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  indexed: { label: 'Indexed', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  processing: { label: 'Processing', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' }
};

// ─── USAGE METER COMPONENT ───────────────────────────────────────────
export function UsageMeter({ used = 0, limit = 100, label = "Usage" }) {
  const isUnlimited = limit === -1 || limit === Infinity;
  const percentage = isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));

  const getProgressColor = () => {
    if (percentage >= 90) return 'bg-rose-500';
    if (percentage >= 75) return 'bg-amber-500';
    return 'bg-indigo-600';
  };

  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2">
      <div className="flex justify-between items-center text-xs font-black">
        <span className="text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Activity size={12} className="text-indigo-500" />
          {label}
        </span>
        <span className="text-slate-800 dark:text-slate-200">
          {isUnlimited ? `${used} used (Unlimited)` : `${used} / ${limit}`}
        </span>
      </div>

      {!isUnlimited && (
        <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${getProgressColor()}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ─── EDIT MODAL ───────────────────────────────────────────────────────────────
export function EditExamModal({ exam, onSave, onClose }) {
  const [title, setTitle] = useState(exam?.title || '');
  const [subject, setSubject] = useState(exam?.subject || '');
  const [grade, setGrade] = useState(exam?.grade || '12');
  const [year, setYear] = useState(exam?.year || '');
  const [curriculum, setCurriculum] = useState(exam?.curriculum || 'CAPS');
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
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-3.5 rounded-xl border dark:bg-slate-800 dark:border-slate-700 outline-none focus:border-indigo-500 text-sm transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Subject *</label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full p-3.5 rounded-xl border dark:bg-slate-800 dark:border-slate-700 text-sm outline-none focus:border-indigo-500"
              >
                <option value="">Select</option>
                {DBE_SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Grade</label>
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="w-full p-3.5 rounded-xl border dark:bg-slate-800 dark:border-slate-700 text-sm outline-none focus:border-indigo-500"
              >
                {['10', '11', '12'].map((g) => (
                  <option key={g} value={g}>Grade {g}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Year</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="e.g. 2026"
                className="w-full p-3.5 rounded-xl border dark:bg-slate-800 dark:border-slate-700 text-sm outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Curriculum</label>
              <select
                value={curriculum}
                onChange={(e) => setCurriculum(e.target.value)}
                className="w-full p-3.5 rounded-xl border dark:bg-slate-800 dark:border-slate-700 text-sm outline-none focus:border-indigo-500"
              >
                {CURRICULA.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-8 pb-8">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-3.5 rounded-xl border-2 border-slate-100 dark:border-slate-700 font-black text-xs text-slate-500 dark:text-slate-400 hover:border-slate-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-[2] py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
          >
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
export function AuditRow({ exam, onEdit, onDelete, expanded, onToggle }) {
  const parseDate = (val) => {
    if (!val) return null;
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

  const formatDuration = (mins) => {
    if (!mins) return null;
    const m = Number(mins);
    if (m < 60) return `${m} min`;
    return `${m / 60} hr${m >= 120 ? 's' : ''}`;
  };
  const durationLabel = formatDuration(exam.examDuration);

  return (
    <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden hover:border-indigo-200 dark:hover:border-indigo-800 transition-all">
      <div
        className="flex items-center gap-4 p-5 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
        onClick={onToggle}
      >
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${exam.status === 'ready' ? 'bg-green-500' :
          exam.status === 'pending_extraction' ? 'bg-amber-400 animate-pulse' :
            exam.status === 'indexed' ? 'bg-purple-500' : 'bg-blue-500'
          }`} />

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
            {durationLabel && (
              <span className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-lg">
                <Clock size={9} /> {durationLabel}
              </span>
            )}
          </div>
        </div>

        <div className="text-right hidden sm:block shrink-0">
          <p className="text-xs font-black text-slate-600 dark:text-slate-300">{uploadDate}</p>
          <p className="text-[10px] text-slate-400 font-bold flex items-center gap-1 justify-end">
            <Clock size={9} /> {uploadTime}
          </p>
        </div>

        <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wide shrink-0 hidden md:block ${statusCfg.cls}`}>
          {statusCfg.label}
        </span>

        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onEdit(exam)}
            className="p-2 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-slate-400 hover:text-indigo-600 transition-colors"
            title="Edit details"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(exam)}
            className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
          <div className="text-slate-300 dark:text-slate-600 ml-1">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 dark:border-slate-800 p-5 bg-slate-50/50 dark:bg-slate-800/20 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">📄 Question Paper</p>
              {exam.examDriveLink ? (
                <a
                  href={exam.examDriveLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs font-bold text-indigo-600 hover:underline truncate"
                >
                  <ExternalLink size={12} /> {exam.examFileName || 'Open in Drive'}
                </a>
              ) : (
                <p className="text-xs text-slate-400 font-bold">{exam.examFileName || 'No file linked'}</p>
              )}
              {exam.examFileType && (
                <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-widest">{exam.examFileType}</p>
              )}
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">✅ Marking Memo</p>
              {exam.memoDriveLink ? (
                <a
                  href={exam.memoDriveLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs font-bold text-green-600 hover:underline truncate"
                >
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

          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">📋 Assessment Details</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
              <DetailItem label="Title" value={exam.title} />
              <DetailItem label="Subject" value={exam.subject} />
              <DetailItem label="Grade" value={exam.grade ? `Grade ${exam.grade}` : null} />
              <DetailItem label="Year" value={exam.year} />
              <DetailItem label="Curriculum" value={exam.curriculum} />

              {exam.type === 'assignment' || exam.assessmentType === 'assignment' ? (
                <DetailItem
                  label="Deadline"
                  value={exam.dueDate ? new Date(exam.dueDate).toLocaleDateString('en-ZA', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : 'No due date set'}
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

// ─── DETAIL ITEM ─────────────────────────────────────────────────────────────
export function DetailItem({ label, value, highlight = false }) {
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

// ─── COUNTDOWN HOOK & COMPONENT ──────────────────────────────────────────────
export function useCountdown(targetISO) {
  const calc = (target) => {
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
  };

  const [remaining, setRemaining] = useState(() => calc(targetISO));

  useEffect(() => {
    if (!targetISO) return;
    const interval = setInterval(() => setRemaining(calc(targetISO)), 1000);
    return () => clearInterval(interval);
  }, [targetISO]);

  return remaining;
}

export function SubmissionCountdown({ dueDate, compact = false }) {
  const remaining = useCountdown(dueDate);
  if (!dueDate || !remaining) return null;

  const urgency = remaining.expired
    ? 'expired'
    : remaining.totalMs < 3600000 ? 'critical'
      : remaining.totalMs < 86400000 ? 'warning'
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
export default function TeacherDashboard(props) {
  const auth = getAuth();
  const API = import.meta.env.VITE_API_URL;
  const { school } = useSchool();
  const { openPicker } = useGooglePicker();
  const navigate = useNavigate();

  // User & Profile
  const [user, setUser] = useState(auth.currentUser);
  const [teacherProfile, setTeacherProfile] = useState(null);

  // Active Navigation
  const [activeTab, setActiveTab] = useState('results');

  // Upload Wizard States
  const [uploadStep, setUploadStep] = useState(1);
  const [examFile, setExamFile] = useState(null);
  const [memoFile, setMemoFile] = useState(null);
  const [skipMemo, setSkipMemo] = useState(false);
  const [paperTitle, setPaperTitle] = useState('');
  const [paperYear, setPaperYear] = useState(new Date().getFullYear().toString());
  const [paperSubject, setPaperSubject] = useState('');
  const [paperGrade, setPaperGrade] = useState('');
  const [selectedCurriculum, setSelectedCurriculum] = useState('');
  const [assessmentType, setAssessmentType] = useState('exam'); // 'exam' | 'assignment'
  const [examType, setExamType] = useState('exam');
  const [examDuration, setExamDuration] = useState(60);
  const [dueDate, setDueDate] = useState(null);
  const [aiFocus, setAiFocus] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  // Usage & Quota State
  const [examUsage, setExamUsage] = useState(null);
  const [usageLoading, setUsageLoading] = useState(true);

  // Audit Trail States
  const [uploadedExams, setUploadedExams] = useState([]);
  const [editingExam, setEditingExam] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortDir, setSortDir] = useState('desc');

  // School & Review Modal
  const [showReviews, setShowReviews] = useState(false);
  const { reviews } = usePrincipalReviews(school?.id || teacherProfile?.schoolId, auth.currentUser?.uid);

  // Country & Curriculum Resolution
  const schoolCountry = school?.country || teacherProfile?.country || 'South Africa';

  const activeCurriculum =
    (school?.curriculum && school.curriculum.trim() !== '') ? school.curriculum :
      (teacherProfile?.curriculum && teacherProfile.curriculum.trim() !== '') ? teacherProfile.curriculum :
        selectedCurriculum || 'CAPS';

  const schoolCurricula = (school?.curriculum
    ? (Array.isArray(school.curriculum) ? school.curriculum : [school.curriculum])
    : ['CAPS']
  ).filter(Boolean);

  const teacherSubjects = Array.isArray(teacherProfile?.subjects)
    ? teacherProfile.subjects
    : (typeof teacherProfile?.subjects === 'string' && teacherProfile.subjects)
      ? [teacherProfile.subjects]
      : [];

  const { data: levels, loading: levelsLoading } = useAiList(
    fetchLevels,
    [schoolCountry, selectedCurriculum || schoolCurricula[0] || 'CAPS'],
    !!schoolCountry
  );

  // ── 1. AUTH & PROFILE LISTENERS ──────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    ensureUserFirestoreDocs(user.uid, 'teacher').catch(console.error);

    const profileUnsub = onSnapshot(doc(db, 'teachers', user.uid), (snap) => {
      if (!snap.exists()) return;
      setTeacherProfile(snap.data());
    });

    return () => profileUnsub();
  }, [user]);

  // ── 2. AUDIT TRAIL EXAM LISTENER ──────────────────────────────────────────
  useEffect(() => {
    const schoolId = teacherProfile?.schoolId;
    if (!user || !schoolId) return;

    const examsUnsub = onSnapshot(
      query(collection(db, 'exams'), where('uploadedBy', '==', user.uid)),
      (snap) => {
        const exams = snap.docs.map((d) => ({
          ...d.data(),
          id: d.id,
          examId: d.data().examId || d.id,
        }));
        exams.sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
        setUploadedExams(exams);
      },
      (err) => {
        console.error('[Audit] Failed to load exams:', err.message);
        setUploadedExams([]);
      }
    );

    return () => examsUnsub();
  }, [user, teacherProfile?.schoolId]);

  // Defaults setup
  useEffect(() => {
    if (schoolCurricula.length === 1 && !selectedCurriculum) {
      setSelectedCurriculum(schoolCurricula[0]);
    }
  }, [schoolCurricula.join(',')]);

  useEffect(() => {
    if (teacherSubjects.length === 1 && !paperSubject) {
      setPaperSubject(teacherSubjects[0]);
    }
  }, [teacherSubjects.join(',')]);

  // ── 3. FETCH EXAM USAGE ──────────────────────────────────────────────────
  const fetchUsage = useCallback(async (currentUser) => {
    const activeUser = currentUser || auth.currentUser;
    if (!activeUser) return;
    try {
      setUsageLoading(true);
      const idToken = await activeUser.getIdToken();
      const response = await fetch(`${API}/exams/usage`, {
        headers: { Authorization: `Bearer ${idToken}` },
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
  }, [API]);

  useEffect(() => {
    if (user) fetchUsage(user);
    else setUsageLoading(false);
  }, [user, fetchUsage]);

  // ── 4. DERIVED USAGE & LOYALTY METRICS ────────────────────────────────────
  const isLoyaltyActive = Boolean(
    examUsage?.isLoyaltyActive || examUsage?.unlimited || examUsage?.tier === 'loyalty'
  );

  const usedCount = examUsage?.used ?? 0;
  const limitCount = isLoyaltyActive ? -1 : (examUsage?.limit ?? 10);
  const isQuotaExceeded = !isLoyaltyActive && limitCount !== -1 && usedCount >= limitCount;

  // ── 5. FILTERED & SORTED AUDIT LIST ──────────────────────────────────────
  const filteredExams = useMemo(() => {
    return uploadedExams
      .filter((e) => {
        const term = searchTerm.toLowerCase();
        const matchSearch =
          !term ||
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
  }, [uploadedExams, searchTerm, filterSubject, filterGrade, filterStatus, sortDir]);

  // ── 6. HANDLE EXAM UPLOAD WORKFLOW ─────────────────────────────────────────
  // ── 6. HANDLE EXAM UPLOAD WORKFLOW ─────────────────────────────────────────
  const handleExamUpload = async () => {
    const timeNotSet =
      assessmentType === 'assignment'
        ? !dueDate || new Date(dueDate) <= new Date()
        : !examDuration || examDuration <= 0;

    if (timeNotSet) {
      await Swal.fire({
        icon: 'warning',
        title: assessmentType === 'assignment' ? 'Due Date Required' : 'Duration Required',
        text:
          assessmentType === 'assignment'
            ? 'Please set a future due date and time before uploading this assignment.'
            : `Please set how long students have to complete this ${assessmentType}.`,
        confirmButtonColor: '#4F46E5',
      });
      return;
    }

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

      // Step A: Pre-check tier limits with Flask
      const checkRes = await fetch(`${API}/check-tier-limit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolId: teacherProfile?.schoolId,
          role: 'exams',
        }),
      });

      const checkData = await checkRes.json();

      // Bypass limit_reached if loyalty plan is active on local state OR in the API response
      const activeLoyalty = isLoyaltyActive || checkData?.isLoyaltyActive || checkData?.unlimited || checkData?.tier === 'loyalty';

      if (!activeLoyalty && (checkRes.status === 403 || checkData.error === 'limit_reached')) {
        setIsUploading(false);
        setUploadProgress('');
        await Swal.fire({
          icon: 'warning',
          title: 'Upload Limit Reached',
          text: checkData.message || 'Your school has reached its monthly exam upload limit.',
          confirmButtonText: 'Upgrade Plan',
          confirmButtonColor: '#4F46E5',
        });
        return;
      }

      // Step B: Upload files to Storage
      setUploadProgress('Uploading exam file…');
      const examId = `${user.uid}_${Date.now()}`;
      const schoolFolder = `${teacherProfile?.schoolId}_${(
        teacherProfile?.schoolName || teacherProfile?.school || 'School'
      )
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '')}`;

      const exam = await uploadExamFile(
        examFile,
        schoolFolder,
        paperSubject || teacherSubjects[0] || 'General',
        examId,
        'exam'
      );

      let memo = { path: '', url: '', fileName: '', fileType: '' };
      if (!skipMemo && memoFile) {
        setUploadProgress('Uploading memo file…');
        memo = await uploadExamFile(
          memoFile,
          schoolFolder,
          paperSubject || teacherSubjects[0] || 'General',
          examId,
          'memo'
        );
      }

      // Step C: Send document metadata to Flask API
      setUploadProgress('Creating exam record…');
      const currentActiveType = assessmentType || examType || 'exam';

      const response = await fetch(`${API}/exams/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          examId,
          title: paperTitle || 'Untitled Assessment',
          subject: paperSubject || teacherSubjects[0] || '',
          schoolId: teacherProfile?.schoolId || '',
          grade: paperGrade,
          curriculum: selectedCurriculum || schoolCurricula[0] || 'CAPS',
          examType: currentActiveType,
          examDuration: currentActiveType === 'assignment' ? 0 : parseInt(examDuration) || 60,
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
          teacherName: teacherProfile?.displayName || teacherProfile?.firstName || 'Teacher',
          schoolName: teacherProfile?.schoolName || teacherProfile?.school || '',
          schoolFolder,
          uploadedBy: user.uid,
          year: paperYear || new Date().getFullYear().toString(),
          aiFocus: aiFocus || '',
        }),
      });

      setUploadProgress('Finalising…');
      const saved = await response.json();

      if (!response.ok || !saved?.examId) {
        throw new Error(saved?.error || 'Failed to create exam record');
      }

      // Refresh quota metrics
      await fetchUsage(user);

      // Reset wizard
      setUploadStep(1);
      setExamFile(null);
      setMemoFile(null);
      setSkipMemo(false);
      setPaperTitle('');

      await Swal.fire({
        icon: 'success',
        title: 'Exam Uploaded!',
        html: `
          <strong>${paperTitle || 'Assessment'}</strong> uploaded successfully.<br/>
          <span style="font-size:13px;color:#6b7280">
            AI processing has started in the background.
          </span>
        `,
        confirmButtonText: 'View Audit Trail',
        confirmButtonColor: '#6366f1',
        timer: 6000,
        timerProgressBar: true,
      });

      setActiveTab('audit');
    } catch (err) {
      console.error('[Upload]', err);
      Swal.fire({ icon: 'error', title: 'Upload Failed', text: err.message });
    } finally {
      setIsUploading(false);
      setUploadProgress('');
    }
  };

  // ── 7. AUDIT ACTIONS ──────────────────────────────────────────────────────
  const handleSaveEdit = async (changes) => {
    if (!user || !editingExam) return;
    const examId = editingExam.examId || editingExam.id;
    await updateExamInAudit(user.uid, examId, changes);
    setEditingExam(null);
  };

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
              <span style="display:block; font-size:12px; color:#9CA3AF;">Removes the document from database</span>
            </span>
          </label>
          <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:14px;">
            <input type="checkbox" id="del-trail" style="width:16px;height:16px;accent-color:#EF4444;" />
            <span>
              <span style="font-weight:500;">Audit trail</span>
              <span style="display:block; font-size:12px; color:#9CA3AF;">Clears activity logs</span>
            </span>
          </label>
          <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:14px;">
            <input type="checkbox" id="del-drive" style="width:16px;height:16px;accent-color:#EF4444;" />
            <span>
              <span style="font-weight:500;">Storage files</span>
              <span style="display:block; font-size:12px; color:#9CA3AF;">Permanently deletes files</span>
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
      Swal.fire({ icon: 'info', title: 'Nothing selected', text: 'Please select at least one item to delete.' });
      return;
    }

    try {
      const deleted = await runExamDeletion({
        uid: user.uid,
        examId,
        driveFileId: exam.driveFileId,
        selected,
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


  const handleLogout = async () => { await signOut(auth); navigate('/'); };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 bg-gray-50 dark:bg-slate-950 min-h-screen transition-colors duration-500">
      {/* ── HEADER ── */}
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
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-8 border-t border-white/10 mt-8">
            <InfoItem
              icon={BookOpen}
              label="Subjects"
              value={
                Array.isArray(teacherProfile?.subjects)
                  ? teacherProfile.subjects.join(', ')
                  : teacherProfile?.subjects || '—'
              }
            />
            <InfoItem
              icon={MapPin}
              label="Province"
              value={school?.province || school?.country || teacherProfile?.province || 'South Africa'}
            />
            <InfoItem
              icon={GraduationCap}
              label="Curriculum"
              value={school?.curriculum || teacherProfile?.curriculum || selectedCurriculum || 'CAPS'}
            />
            <InfoItem
              icon={ShieldCheck}
              label="Uploaded"
              value={`${uploadedExams.length} paper${uploadedExams.length !== 1 ? 's' : ''}`}
            />
          </div>
        </div>
      </div>

      <PrincipalReviewsModal
        open={showReviews}
        onClose={() => setShowReviews(false)}
        reviews={reviews}
        reviewerNames={{ [school?.principalUid]: school?.principalName }}
      />

      {/* ── TABS NAVIGATION ── */}
      <div className="flex p-1.5 bg-white dark:bg-slate-900 rounded-2xl w-fit mb-8 shadow-sm border border-slate-200 dark:border-slate-800 gap-1 flex-wrap">
        <TabButton
          active={activeTab === 'results'}
          onClick={() => setActiveTab('results')}
          icon={<ClipboardList size={16} />}
          label="Mark Analysis"
        />
        <TabButton
          active={activeTab === 'upload'}
          onClick={() => setActiveTab('upload')}
          icon={<Upload size={16} />}
          label="Upload Paper"
        />
        <TabButton
          active={activeTab === 'audit'}
          onClick={() => setActiveTab('audit')}
          icon={<FileText size={16} />}
          label={`Audit Trail ${uploadedExams.length > 0 ? `(${uploadedExams.length})` : ''}`}
        />
      </div>

      {/* ── TAB 1: MARK ANALYSIS / RESULTS ── */}
      {activeTab === 'results' && <ResultsTab teacherMode={true} />}

      {/* ── TAB 2: UPLOAD WIZARD ── */}
      {activeTab === 'upload' && (
        <div className="space-y-8 animate-in zoom-in-95 duration-300">
          {/* Usage Meter Header */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <UsageMeter
              label="Monthly Exam Upload Quota"
              used={usedCount}
              limit={limitCount}
              unlimited={isLoyaltyActive}
              color="#4f46e5"
            />
          </div>

          {isQuotaExceeded && (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-2xl p-4 flex items-center gap-3 text-red-700 dark:text-red-300 text-xs font-medium">
              <AlertCircle size={18} className="flex-shrink-0" />
              <span>
                Your school has reached its monthly upload limit ({usedCount}/{limitCount}). Please ask your principal to upgrade seats.
              </span>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
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
                    className={`h-2 rounded-full transition-all duration-300 ${s < uploadStep ? 'bg-white w-8' : s === uploadStep ? 'bg-white w-10' : 'bg-white/30 w-4'
                      }`}
                  />
                ))}
              </div>
            </div>

            <div className="p-8 md:p-10">
              {/* STEP 1: IDENTITY & METADATA */}
              {uploadStep === 1 && (
                <div className="max-w-2xl mx-auto space-y-6">
                  <StepHeader num={1} title="Identity & Metadata" />

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Assessment Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Grade 12 CAT Paper 1 October Test"
                      value={paperTitle}
                      onChange={(e) => setPaperTitle(e.target.value)}
                      className="w-full border-2 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 p-4 rounded-2xl outline-none focus:border-indigo-600 font-bold text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                        Subject
                      </label>
                      {teacherSubjects.length === 0 ? (
                        <input
                          type="text"
                          value={paperSubject}
                          onChange={(e) => setPaperSubject(e.target.value)}
                          placeholder="Subject (e.g. CAT)"
                          className="w-full p-4 border-2 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:border-indigo-600"
                        />
                      ) : (
                        <select
                          value={paperSubject}
                          onChange={(e) => setPaperSubject(e.target.value)}
                          className="w-full p-4 border-2 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:border-indigo-600"
                        >
                          <option value="">Select Subject</option>
                          {teacherSubjects.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                        Academic Year
                      </label>
                      <input
                        type="number"
                        value={paperYear}
                        onChange={(e) => setPaperYear(e.target.value)}
                        placeholder="Year"
                        className="w-full p-4 border-2 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:border-indigo-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                        Curriculum
                      </label>
                      <select
                        value={selectedCurriculum || schoolCurricula[0] || 'CAPS'}
                        onChange={(e) => {
                          setSelectedCurriculum(e.target.value);
                          setPaperGrade('');
                        }}
                        className="w-full p-4 border-2 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:border-indigo-600"
                      >
                        {schoolCurricula.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                        Grade / Level
                      </label>
                      <select
                        value={paperGrade}
                        onChange={(e) => setPaperGrade(e.target.value)}
                        disabled={levelsLoading}
                        className="w-full p-4 border-2 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:border-indigo-600 disabled:opacity-50"
                      >
                        <option value="">Select Grade</option>
                        {Array.isArray(levels) &&
                          levels.map((lvl) => (
                            <option key={lvl.id || lvl} value={lvl.id || lvl}>
                              {lvl.name || `Grade ${lvl}`}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (!paperTitle) {
                        Swal.fire({ icon: 'warning', title: 'Title Required', text: 'Please enter an assessment name.' });
                        return;
                      }
                      setUploadStep(2);
                    }}
                    className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-500/20"
                  >
                    Continue to Files
                  </button>
                </div>
              )}

              {/* STEP 2: FILE ATTACHMENTS */}
              {uploadStep === 2 && (
                <div className="max-w-2xl mx-auto space-y-6">
                  <StepHeader num={2} title="Attach Question Paper & Memo" />

                  {/* Question Paper */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Question Paper (PDF / Word)
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx"
                      onChange={(e) => setExamFile(e.target.files[0])}
                      className="w-full border-2 border-dashed bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 p-4 rounded-2xl font-bold text-sm text-slate-600 dark:text-slate-300"
                    />
                  </div>

                  {/* Memorandum */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                        Memorandum / Marking Scheme
                      </label>
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={skipMemo}
                          onChange={(e) => setSkipMemo(e.target.checked)}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>AI Marking Only (No Memo)</span>
                      </label>
                    </div>
                    {!skipMemo && (
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        onChange={(e) => setMemoFile(e.target.files[0])}
                        className="w-full border-2 border-dashed bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 p-4 rounded-2xl font-bold text-sm text-slate-600 dark:text-slate-300"
                      />
                    )}
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={() => setUploadStep(1)}
                      className="w-1/3 py-4 border-2 border-slate-200 dark:border-slate-700 font-bold rounded-2xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => {
                        if (!examFile) {
                          Swal.fire({ icon: 'warning', title: 'File Required', text: 'Please upload a question paper file.' });
                          return;
                        }
                        setUploadStep(3);
                      }}
                      className="w-2/3 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-500/20"
                    >
                      Continue to Settings
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: SETTINGS & CONFIRMATION */}
              {uploadStep === 3 && (
                <div className="max-w-2xl mx-auto space-y-6">
                  <StepHeader num={3} title="Assessment Rules & Upload" />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                        Assessment Type
                      </label>
                      <select
                        value={assessmentType}
                        onChange={(e) => setAssessmentType(e.target.value)}
                        className="w-full p-4 border-2 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:border-indigo-600"
                      >
                        <option value="exam">Time-Based Exam / Test</option>
                        <option value="assignment">Take-Home Assignment</option>
                      </select>
                    </div>

                    {assessmentType === 'exam' ? (
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                          Duration (Minutes)
                        </label>
                        <input
                          type="number"
                          value={examDuration}
                          onChange={(e) => setExamDuration(e.target.value)}
                          placeholder="e.g. 60"
                          className="w-full p-4 border-2 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:border-indigo-600"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                          Due Date & Time
                        </label>
                        <input
                          type="datetime-local"
                          value={dueDate || ''}
                          onChange={(e) => setDueDate(e.target.value)}
                          className="w-full p-4 border-2 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:border-indigo-600"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Special AI Marking Instructions (Optional)
                    </label>
                    <textarea
                      rows={3}
                      value={aiFocus}
                      onChange={(e) => setAiFocus(e.target.value)}
                      placeholder="e.g. Focus strictly on terminology in Section B..."
                      className="w-full border-2 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 p-4 rounded-2xl outline-none focus:border-indigo-600 font-medium text-sm"
                    />
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={() => setUploadStep(2)}
                      disabled={isUploading}
                      className="w-1/3 py-4 border-2 border-slate-200 dark:border-slate-700 font-bold rounded-2xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all disabled:opacity-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleExamUpload}
                      disabled={isUploading || isQuotaExceeded}
                      className={`w-2/3 py-4 font-bold rounded-2xl text-white transition-all shadow-md ${isUploading || isQuotaExceeded
                        ? 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-60'
                        : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20 active:scale-[0.99]'
                        }`}
                    >
                      {isUploading ? uploadProgress || 'Processing...' : 'Finish & Upload Exam'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: AUDIT TRAIL ── */}
      {activeTab === 'audit' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Controls Bar */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search exams..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold outline-none focus:border-indigo-600"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
              <select
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold outline-none"
              >
                <option value="">All Subjects</option>
                {teacherSubjects.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              <button
                onClick={() => setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                className="p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 flex items-center gap-1 text-xs font-bold"
              >
                <ArrowUpDown size={14} />
                <span>{sortDir === 'desc' ? 'Newest' : 'Oldest'}</span>
              </button>
            </div>
          </div>

          {/* Exam Table / Cards */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            {filteredExams.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <FileText size={36} className="mx-auto mb-2 opacity-50" />
                <p className="font-bold text-sm">No exam records found</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredExams.map((exam) => (
                  <div key={exam.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-slate-800 dark:text-slate-100">
                          {exam.title}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase">
                          {exam.subject}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs font-semibold text-slate-400">
                        <span>{exam.grade}</span>
                        <span>•</span>
                        <span>{exam.curriculum}</span>
                        <span>•</span>
                        <span>{new Date(exam.uploadedAt || Date.now()).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(exam)}
                        className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(exam)}
                        className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
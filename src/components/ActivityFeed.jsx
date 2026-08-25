import { useState, useEffect } from 'react';
import {
    collection, query, where, orderBy, limit,
    onSnapshot, updateDoc, addDoc, doc, setDoc, getDocs,
    serverTimestamp, getDoc, writeBatch
} from 'firebase/firestore';
import { db, auth } from '../utils/firebase';
import {
    Bell, AlertTriangle, CheckCircle, XCircle,
    ChevronUp, ChevronDown, Key, UserCheck, Shield, CheckCircle2, Search
} from 'lucide-react';


// ── Helpers ───────────────────────────────────────────────────────────────

function timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}

const ROLE_STYLES = {
    teacher: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500', icon: '👩‍🏫' },
    student: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-500', icon: '🎓' },
    parent: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500', icon: '👨‍👩‍👧' },
    principal: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400', dot: 'bg-purple-500', icon: '🏫' },
    default: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400', dot: 'bg-slate-400', icon: '👤' },
};

// ── ParentLinkPicker ──────────────────────────────────────────────────────
export function ParentLinkPicker({ event, schoolId, linkedStudentUid, onLink }) {
    const [searchText, setSearchText] = useState(event?.childName || '');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);

    // Auto-verification state
    const [verifying, setVerifying] = useState(true);
    const [matchStatus, setMatchStatus] = useState({
        status: 'checking', // 'exact_match' | 'mismatch' | 'not_found' | 'checking'
        matchedStudent: null,
        message: ''
    });

    const parentCode = event?.studentCode || event?.children?.[0]?.studentCode || '';
    const parentChildName = event?.childName || event?.children?.[0]?.childName || '';
    const parentChildGrade = event?.childGrade || event?.children?.[0]?.childGrade || '';

    // Auto-verify entered code against Firestore on mount
    useEffect(() => {
        let isMounted = true;

        const verifyStudentCode = async () => {
            if (!parentCode) {
                if (isMounted) {
                    setMatchStatus({
                        status: 'not_found',
                        matchedStudent: null,
                        message: 'No student security code was provided by the parent.'
                    });
                    setVerifying(false);
                }
                return;
            }

            setVerifying(true);
            try {
                const q = query(
                    collection(db, 'students'),
                    where('studentCode', '==', parentCode.trim().toUpperCase())
                );
                const snap = await getDocs(q);

                if (!snap.empty) {
                    const studentDoc = snap.docs[0];
                    const studentData = { uid: studentDoc.id, ...studentDoc.data() };
                    const dbName = studentData.displayName || `${studentData.firstName || ''} ${studentData.lastName || ''}`.trim();

                    // Compare names and grade
                    const namesMatch = dbName.toLowerCase().includes(parentChildName.toLowerCase()) ||
                        parentChildName.toLowerCase().includes(dbName.toLowerCase());
                    const gradeMatch = !parentChildGrade || studentData.grade === parentChildGrade;

                    if (isMounted) {
                        if (namesMatch && gradeMatch) {
                            setMatchStatus({
                                status: 'exact_match',
                                matchedStudent: studentData,
                                message: 'Student Code and Student Details match correctly!'
                            });
                            // Auto-select linked student if not already selected
                            if (!linkedStudentUid) onLink(studentData.uid);
                        } else {
                            setMatchStatus({
                                status: 'mismatch',
                                matchedStudent: studentData,
                                message: `Code matches ${dbName} (Gr ${studentData.grade || 'N/A'}), but parent typed "${parentChildName}" (Gr ${parentChildGrade || 'N/A'}).`
                            });
                        }
                    }
                } else {
                    if (isMounted) {
                        setMatchStatus({
                            status: 'not_found',
                            matchedStudent: null,
                            message: `Invalid Student Code "${parentCode}". No matching student found.`
                        });
                    }
                }
            } catch (err) {
                console.error('[ParentLinkPicker] Verification error:', err);
            } finally {
                if (isMounted) setVerifying(false);
            }
        };

        verifyStudentCode();

        return () => { isMounted = false; };
    }, [parentCode, parentChildName, parentChildGrade]);

    const runSearch = async () => {
        if (!searchText.trim()) return;
        setSearching(true);
        try {
            const snap = await getDocs(
                query(collection(db, 'students'), where('schoolId', '==', schoolId))
            );
            const q = searchText.trim().toLowerCase();
            const matches = snap.docs
                .map(d => ({ uid: d.id, ...d.data() }))
                .filter(s => `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase().includes(q)
                    || s.studentCode?.toLowerCase() === q);
            setResults(matches.slice(0, 8));
        } finally {
            setSearching(false);
        }
    };

    return (
        <div className="mt-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 space-y-3">
            {/* Automatic Match Verification Card */}
            <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                    Security & Verification Status
                </p>

                {verifying ? (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                        Verifying student code...
                    </div>
                ) : matchStatus.status === 'exact_match' ? (
                    <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 flex items-start gap-2 text-xs">
                        <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                        <div>
                            <p className="font-bold">{matchStatus.message}</p>
                            <p className="text-[11px] opacity-90">
                                Verified Learner: <strong>{matchStatus.matchedStudent.displayName}</strong> ({matchStatus.matchedStudent.studentCode}) · Grade {matchStatus.matchedStudent.grade}
                            </p>
                        </div>
                    </div>
                ) : matchStatus.status === 'mismatch' ? (
                    <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 flex items-start gap-2 text-xs">
                        <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        <div>
                            <p className="font-bold">Mismatch Detected</p>
                            <p className="text-[11px] opacity-90">{matchStatus.message}</p>
                        </div>
                    </div>
                ) : (
                    <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 flex items-start gap-2 text-xs">
                        <XCircle size={16} className="text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                        <div>
                            <p className="font-bold">Code Check Failed</p>
                            <p className="text-[11px] opacity-90">{matchStatus.message}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Manual Link & Override Search */}
            <div className="pt-2 border-t border-slate-600 dark:border-slate-800">
                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-600 mb-1.5">
                    Manual Learner Search & Link
                </p>
                <div className="flex gap-1.5">
                    <input
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                        placeholder="Search by learner name or code"
                        className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-800 dark:border-slate-800 dark:bg-slate-800 outline-none focus:border-violet-500 text-white"
                    />
                    <button
                        onClick={runSearch}
                        disabled={searching}
                        className="px-3 py-1.5 rounded-lg text-xs text-white font-bold bg-slate-800 dark:bg-white dark:text-slate-900 disabled:opacity-50 flex items-center gap-1"
                    >
                        <Search size={12} />
                        {searching ? '…' : 'Search'}
                    </button>
                </div>

                {results.length > 0 && (
                    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                        {results.map((s) => (
                            <button
                                key={s.uid}
                                onClick={() => onLink(s.uid)}
                                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-left transition-colors ${linkedStudentUid === s.uid
                                    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-white dark:text-white font-bold border border-emerald-300 dark:border-emerald-800'
                                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-white'
                                    }`}
                            >
                                <span>{s.firstName} {s.lastName} {s.studentCode ? `(${s.studentCode})` : ''} {s.grade ? `· Gr ${s.grade}` : ''}</span>
                                {linkedStudentUid === s.uid && <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" />}
                            </button>
                        ))}
                    </div>
                )}

                {!linkedStudentUid && (
                    <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 mt-2">
                        ⚠ Select or confirm a learner above to enable approval.
                    </p>
                )}
            </div>
        </div>
    );
}

// ── Activity Card ─────────────────────────────────────────────────────────

function ActivityCard({ event, schoolId, onApprove, onDecline, processingId, removing }) {
    const [expanded, setExpanded] = useState(false);
    const [showDeclineInput, setShowDeclineInput] = useState(false);
    const [declineReason, setDeclineReason] = useState('');
    const [linkedStudentUid, setLinkedStudentUid] = useState(event.linkedStudentUid || null);

    const styles = ROLE_STYLES[event.actorRole] || ROLE_STYLES.default;
    const isNew = !event.read;
    const isPending = event.type === 'user_joined' && !event.approvalStatus;
    const isProcessing = processingId === event.id;
    const status = event.approvalStatus;
    const typeLabel = {
        user_joined: 'New Registration',
        user_approved: 'User Approved',
        user_declined: 'User Declined',
        exam_uploaded: 'Exam Uploaded',
    }[event.type] || 'Activity';

    // Extract User Codes across different potential schema keys
    const userCode = event.studentCode || event.teacherCode || event.userCode || event.code;

    return (
        <div className={`border-b border-slate-50 dark:border-slate-800
                         last:border-0 transition-all duration-300 ease-in-out
                         ${removing ? 'opacity-0 scale-95 -translate-x-4 max-h-0 py-0 overflow-hidden' : 'opacity-100 max-h-[800px]'}
                         ${isNew ? 'bg-indigo-50/40 dark:bg-indigo-900/10' : ''}`}>

            {/* Main row */}
            <div className="flex items-start gap-3 px-5 py-4">
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center
                                 flex-shrink-0 text-lg select-none overflow-hidden ${styles.bg}`}>
                    {event.actorPhoto
                        ? <img src={event.actorPhoto} alt={event.actorName}
                            className="w-10 h-10 object-cover rounded-xl"
                            onError={e => { e.target.style.display = 'none'; }} />
                        : event.type === 'user_approved' ? '✅'
                            : event.type === 'user_declined' ? '❌'
                                : styles.icon
                    }
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-800 dark:text-white truncate">
                                {event.actorName || event.targetName || 'Unknown User'}
                                {isNew && (
                                    <span className={`ml-2 inline-block w-2 h-2 rounded-full
                                                      align-middle ${styles.dot}`} />
                                )}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate">
                                {event.actorEmail || event.targetEmail || event.email || 'No email provided'}
                            </p>
                        </div>
                        <span className="text-[10px] text-slate-400 flex-shrink-0 whitespace-nowrap pt-0.5">
                            {timeAgo(event.timestamp)}
                        </span>
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">
                        <span className="font-bold">{typeLabel}</span>
                        {event.description && ` — ${event.description}`}
                    </p>

                    {/* Badges */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {event.actorRole && (
                            <span className={`text-[10px] font-black px-2 py-0.5
                                              rounded-full capitalize ${styles.bg} ${styles.text}`}>
                                {event.actorRole}
                            </span>
                        )}

                        {/* Display User Code Badge */}
                        {userCode && (
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full
                                             bg-indigo-100 text-indigo-700
                                             dark:bg-indigo-900/40 dark:text-indigo-300 flex items-center gap-1">
                                <Key size={10} /> {userCode}
                            </span>
                        )}

                        {event.grade && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full
                                             bg-slate-100 dark:bg-slate-800
                                             text-slate-600 dark:text-slate-400">
                                Gr {event.grade}
                            </span>
                        )}
                        {(event.subjects || []).length > 0 && (
                            <span className="text-[10px] text-slate-400 truncate max-w-[140px]">
                                📚 {event.subjects.slice(0, 2).join(', ')}
                                {event.subjects.length > 2 && ` +${event.subjects.length - 2}`}
                            </span>
                        )}
                        {isPending && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full
                                             bg-amber-100 text-amber-700
                                             dark:bg-amber-900/30 dark:text-amber-400">
                                ⏳ Pending Approval
                            </span>
                        )}
                        {status === 'approved' && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full
                                             bg-emerald-100 text-emerald-700
                                             dark:bg-emerald-900/30 dark:text-emerald-400">
                                ✓ Approved
                            </span>
                        )}
                        {status === 'declined' && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full
                                             bg-red-100 text-red-700
                                             dark:bg-red-900/30 dark:text-red-400">
                                ✗ Declined
                            </span>
                        )}
                    </div>

                    {/* Expand toggle */}
                    <button
                        onClick={() => setExpanded(v => !v)}
                        className="mt-2 flex items-center gap-1 text-[10px]
                                   text-indigo-500 hover:text-indigo-600 font-bold"
                    >
                        {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                        {expanded ? 'Hide full profile details' : 'View full user details'}
                    </button>

                    {/* Expanded Principal Detail View */}
                    {expanded && (
                        <div className="mt-2 p-3.5 bg-slate-50 dark:bg-slate-800/60
                    rounded-xl text-xs space-y-3
                    border border-slate-100 dark:border-slate-700">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Principal Audit & Verification Details
                            </p>

                            {/* Parent / Actor Primary Details */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                                <p className="text-slate-600 dark:text-slate-300">
                                    <span className="font-bold text-slate-400 w-24 inline-block">Full Name</span>
                                    {event.actorName || event.displayName || 'N/A'}
                                </p>
                                <p className="text-slate-600 dark:text-slate-300">
                                    <span className="font-bold text-slate-400 w-24 inline-block">Email</span>
                                    {event.actorEmail || event.email || 'N/A'}
                                </p>
                                <p className="text-slate-600 dark:text-slate-300 capitalize">
                                    <span className="font-bold text-slate-400 w-24 inline-block">Role</span>
                                    {event.actorRole || event.role || 'N/A'}
                                </p>
                                {userCode && (
                                    <p className="text-indigo-600 dark:text-indigo-300 font-bold">
                                        <span className="font-bold text-slate-400 w-24 inline-block">Code</span>
                                        <span className="font-mono bg-indigo-50 dark:bg-indigo-900/50 px-1.5 py-0.5 rounded">{userCode}</span>
                                    </p>
                                )}
                                {event.phone && (
                                    <p className="text-slate-600 dark:text-slate-300">
                                        <span className="font-bold text-slate-400 w-24 inline-block">Phone</span>
                                        {event.phone}
                                    </p>
                                )}
                                {event.schoolName && (
                                    <p className="text-slate-600 dark:text-slate-300">
                                        <span className="font-bold text-slate-400 w-24 inline-block">School</span>
                                        {event.schoolName}
                                    </p>
                                )}
                            </div>

                            {/* Linked Student / Children Details */}
                            {(event.actorRole === 'parent' || event.children?.length > 0 || event.childName) && (
                                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 space-y-2">
                                    <p className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider">
                                        Linked Learner Profile(s)
                                    </p>

                                    {/* Render from children array if present */}
                                    {(event.children && event.children.length > 0) ? (
                                        <div className="space-y-1.5">
                                            {event.children.map((child, idx) => (
                                                <div key={idx} className="p-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/30 flex items-center justify-between text-emerald-900 dark:text-emerald-200">
                                                    <div>
                                                        <p className="font-bold">{child.childName || child.name || 'Unnamed Student'}</p>
                                                        <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                                                            Code: <span className="font-mono">{child.studentCode || 'N/A'}</span>
                                                            {child.childGrade && ` · Grade ${child.childGrade}`}
                                                        </p>
                                                    </div>
                                                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-200/60 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200">
                                                        VERIFIED LINK
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (event.childName || event.studentCode) ? (
                                        /* Fallback to single child fields */
                                        <div className="p-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/30 flex items-center justify-between text-emerald-900 dark:text-emerald-200">
                                            <div>
                                                <p className="font-bold">{event.childName}</p>
                                                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                                                    Code: <span className="font-mono">{event.childCode || event.studentCode || 'N/A'}</span>
                                                    {event.childGrade && ` · Grade ${event.childGrade}`}
                                                </p>
                                            </div>
                                            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-200/60 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200">
                                                VERIFIED LINK
                                            </span>
                                        </div>
                                    ) : (
                                        <p className="text-amber-600 dark:text-amber-400 italic text-[11px]">
                                            ⚠ No linked student record attached to this parent request.
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Approval Audit Info */}
                            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1">
                                {status && (
                                    <p className="text-slate-600 dark:text-slate-300 capitalize">
                                        <span className="font-bold text-slate-400 w-24 inline-block">Status</span>
                                        <span className={status === 'approved' ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold'}>
                                            {status}
                                        </span>
                                        {event.approvedBy && ` by ${event.approvedBy}`}
                                    </p>
                                )}
                                {event.declineReason && (
                                    <p className="text-red-500 dark:text-red-400">
                                        <span className="font-bold text-slate-400 w-24 inline-block">Reason</span>
                                        {event.declineReason}
                                    </p>
                                )}
                                {event.timestamp && (
                                    <p className="text-slate-400 text-[10px]">
                                        <span className="font-bold w-24 inline-block">Registered At</span>
                                        {new Date(event.timestamp).toLocaleString('en-ZA', {
                                            dateStyle: 'medium', timeStyle: 'short'
                                        })}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Parent-Student Picker step prior to approval */}
                    {isPending && event.actorRole === 'parent' && (
                        <ParentLinkPicker
                            event={event}
                            schoolId={schoolId}
                            linkedStudentUid={linkedStudentUid}
                            onLink={(uid) => setLinkedStudentUid(uid)}
                        />
                    )}

                    {/* Unknown user warning */}
                    {event.type === 'user_joined' && (
                        <a href={`mailto:support@eduket.tech?subject=Unknown user verification: ${event.actorEmail}`}
                            className="mt-1.5 flex items-center gap-1 text-[10px]
                                      text-amber-500 hover:text-amber-700 font-bold">
                            <AlertTriangle size={10} />
                            Don't recognise this person? Flag to support
                        </a>
                    )}
                </div>
            </div>

            {/* Approve / Decline Actions */}
            {isPending && (
                <div className="px-5 pb-4 pt-0">
                    {!showDeclineInput ? (
                        <div className="flex gap-2">
                            <button
                                disabled={isProcessing || (event.actorRole === 'parent' && !linkedStudentUid)}
                                onClick={() => onApprove(event, linkedStudentUid)}
                                className="flex-1 flex items-center justify-center gap-1.5
                                           py-2.5 bg-emerald-600 hover:bg-emerald-700
                                           disabled:opacity-50 text-white text-xs font-black
                                           rounded-xl transition-colors cursor-pointer"
                            >
                                {isProcessing
                                    ? <div className="w-3.5 h-3.5 border-2 border-white
                                                      border-t-transparent rounded-full animate-spin" />
                                    : <CheckCircle size={13} />}
                                Approve Access
                            </button>
                            <button
                                onClick={() => setShowDeclineInput(true)}
                                disabled={isProcessing}
                                className="flex-1 flex items-center justify-center gap-1.5
                                           py-2.5 bg-red-600 hover:bg-red-700
                                           disabled:opacity-50 text-white text-xs font-black
                                           rounded-xl transition-colors cursor-pointer"
                            >
                                <XCircle size={13} /> Decline
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <textarea
                                value={declineReason}
                                onChange={e => setDeclineReason(e.target.value)}
                                placeholder="Reason for declining (optional)..."
                                rows={2}
                                className="w-full text-xs p-2.5 border border-red-200
                                           dark:border-red-800 rounded-xl bg-red-50
                                           dark:bg-red-900/20 text-slate-700 dark:text-slate-300
                                           resize-none outline-none focus:border-red-400"
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={() => onDecline(event, declineReason)}
                                    disabled={isProcessing}
                                    className="flex-1 py-2 bg-red-600 hover:bg-red-700
                                               disabled:opacity-50 text-white text-xs font-black
                                               rounded-xl flex items-center justify-center gap-1.5"
                                >
                                    {isProcessing
                                        ? <div className="w-3.5 h-3.5 border-2 border-white
                                                          border-t-transparent rounded-full animate-spin" />
                                        : <XCircle size={13} />}
                                    Confirm Decline
                                </button>
                                <button
                                    onClick={() => { setShowDeclineInput(false); setDeclineReason(''); }}
                                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800
                                               text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Result banners */}
            {status === 'approved' && (
                <div className="mx-5 mb-4 flex items-center gap-2 px-3 py-2
                                bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                    <CheckCircle size={13} className="text-emerald-500 flex-shrink-0" />
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">
                        Approved — user active in school system
                    </p>
                </div>
            )}
            {status === 'declined' && (
                <div className="mx-5 mb-4 flex items-center gap-2 px-3 py-2
                                bg-red-50 dark:bg-red-900/20 rounded-xl">
                    <XCircle size={13} className="text-red-500 flex-shrink-0" />
                    <div>
                        <p className="text-[11px] text-red-700 dark:text-red-400 font-bold">
                            Access declined
                        </p>
                        {event.declineReason && (
                            <p className="text-[10px] text-red-500 mt-0.5">
                                Reason: {event.declineReason}
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════════════

export function ActivityFeed({ schoolId, apiUrl, authToken }) {
    const [events, setEvents] = useState([]);
    const [removingIds, setRemovingIds] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);
    const [unread, setUnread] = useState(0);
    const [error, setError] = useState('');
    const [isOpen, setIsOpen] = useState(true);

    // ── Real-time Firestore listener ──────────────────────────────────────
    useEffect(() => {
        if (!schoolId) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError('');

        const q = query(
            collection(db, 'schoolActivity'),
            where('schoolId', '==', schoolId),
            orderBy('timestamp', 'desc'),
            limit(50)
        );

        const unsub = onSnapshot(q,
            (snap) => {
                const removedDocIds = [];

                snap.docChanges().forEach(change => {
                    if (change.type === 'removed') {
                        removedDocIds.push(change.doc.id);
                    }
                });

                if (removedDocIds.length > 0) {
                    setRemovingIds(prev => new Set([...prev, ...removedDocIds]));

                    setTimeout(() => {
                        setEvents(prev => prev.filter(e => !removedDocIds.includes(e.id)));
                        setRemovingIds(prev => {
                            const next = new Set(prev);
                            removedDocIds.forEach(id => next.delete(id));
                            return next;
                        });
                    }, 300);
                }

                const currentDocs = snap.docs.map(d => ({
                    id: d.id,
                    ...d.data(),
                    timestamp: d.data().timestamp?.toDate?.()?.toISOString() || '',
                }));

                setEvents(prevEvents => {
                    const activeRemoving = prevEvents.filter(e => removingIds.has(e.id));
                    const updatedList = [...currentDocs];

                    activeRemoving.forEach(item => {
                        if (!updatedList.some(e => e.id === item.id)) {
                            updatedList.push(item);
                        }
                    });

                    return updatedList;
                });

                setUnread(currentDocs.filter(e => !e.read).length);
                setLoading(false);
            },
            (err) => {
                console.error('[Activity] Firestore error:', err.code, err.message);
                setError('Could not load activity. Check your connection.');
                setLoading(false);
            }
        );

        return () => unsub();
    }, [schoolId]);

    // ── Mark all read ──────────────────────────────────────────────────────
    const markAllRead = async () => {
        const unreadIds = events.filter(e => !e.read).map(e => e.id);
        if (!unreadIds.length) return;
        try {
            await Promise.all(
                unreadIds.map(id =>
                    updateDoc(doc(db, 'schoolActivity', id), { read: true })
                )
            );
        } catch (err) {
            console.error('[Activity] Mark read error:', err);
        }
    };

    // ── Approve ────────────────────────────────────────────────────────────
    const handleApprove = async (event, linkedStudentUid) => {
        setProcessingId(event.id);

        try {
            const batch = writeBatch(db);
            let targetStudentUid = linkedStudentUid || event.linkedStudentId || event.children?.[0]?.linkedStudentId || null;
            let studentDataPayload = null;

            const codeToSearch = (
                event.studentCode ||
                event.children?.[0]?.studentCode ||
                ''
            ).trim().toUpperCase();

            if (event.actorRole === 'parent') {
                let studentDocSnap = null;

                if (targetStudentUid) {
                    const snap = await getDoc(doc(db, 'students', targetStudentUid));
                    if (snap.exists()) studentDocSnap = snap;
                }

                if (!studentDocSnap && codeToSearch) {
                    const q = query(
                        collection(db, 'students'),
                        where('studentCode', '==', codeToSearch)
                    );
                    const querySnap = await getDocs(q);
                    if (!querySnap.empty) {
                        studentDocSnap = querySnap.docs[0];
                        targetStudentUid = studentDocSnap.id;
                    }
                }

                if (studentDocSnap) {
                    const sData = studentDocSnap.data();
                    const matchedName = sData.displayName || `${sData.firstName || ''} ${sData.lastName || ''}`.trim();

                    studentDataPayload = {
                        studentCode: sData.studentCode || codeToSearch,
                        childName: matchedName || event.childName || event.children?.[0]?.childName || '',
                        childGrade: sData.grade || event.childGrade || event.children?.[0]?.childGrade || '',
                        linkedStudentId: targetStudentUid,
                    };
                } else {
                    studentDataPayload = {
                        studentCode: codeToSearch,
                        childName: event.childName || event.children?.[0]?.childName || '',
                        childGrade: event.childGrade || event.children?.[0]?.childGrade || '',
                        linkedStudentId: null,
                    };
                }
            }

            // 1. Update activity feed item
            const activityRef = doc(db, 'schoolActivity', event.id);
            batch.update(activityRef, {
                approvalStatus: 'approved',
                approvedBy: 'Principal',
                approvedAt: serverTimestamp(),
                read: true,
                ...(targetStudentUid ? { linkedStudentUid: targetStudentUid } : {}),
                ...(studentDataPayload ? {
                    children: [studentDataPayload],
                    childName: studentDataPayload.childName,
                    childCode: studentDataPayload.studentCode,
                    childGrade: studentDataPayload.childGrade,
                } : {}),
            });

            // 2. Update parent target documents
            if (event.actorUid) {
                const roleCol = event.actorRole === 'teacher' ? 'teachers'
                    : event.actorRole === 'student' ? 'students'
                        : event.actorRole === 'parent' ? 'parents'
                            : 'users';

                const userRef = doc(db, 'users', event.actorUid);
                const roleRef = doc(db, roleCol, event.actorUid);

                const profileUpdates = {
                    approved: true,
                    approvalStatus: 'approved',
                    approvedBy: 'Principal',
                    approvedAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    ...(studentDataPayload ? {
                        children: [studentDataPayload],
                        childName: studentDataPayload.childName,
                        studentCode: studentDataPayload.studentCode,
                        childGrade: studentDataPayload.childGrade,
                    } : {}),
                };

                batch.update(userRef, profileUpdates);
                if (roleCol !== 'users') {
                    batch.update(roleRef, profileUpdates);
                }

                // 3. Set parent access mapping
                // Inside handleApprove (replace step 3/4 where parentAccess is saved)
                if (targetStudentUid) {
                    const currentUserId = auth.currentUser ? auth.currentUser.uid : event.schoolId;
                    const parentAccessRef = doc(db, 'parentAccess', `${event.actorUid}_${targetStudentUid}`);

                    // Calculate 14-day trial expiration date
                    const trialDays = 14;
                    const trialEndsAt = new Date();
                    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

                    batch.set(parentAccessRef, {
                        parentUid: event.actorUid,
                        studentUid: targetStudentUid,
                        schoolId: event.schoolId || schoolId,
                        grantedAt: serverTimestamp(),
                        grantedBy: currentUserId,
                        subscriptionStatus: 'trial',
                        trialStartedAt: serverTimestamp(),
                        trialExpiresAt: Timestamp.fromDate(trialEndsAt),
                        subscriptionExpiresAt: null,
                    }, { merge: true });
                }
            }

            // 4. Create approval confirmation notice
            const userEmail = event.actorEmail || event.email || 'No email provided';
            const approvalNoticeRef = doc(collection(db, 'schoolActivity'));

            batch.set(approvalNoticeRef, {
                schoolId: schoolId || event.schoolId,
                type: 'user_approved',
                actorUid: auth.currentUser?.uid || event.actorUid,
                actorName: 'Principal',
                targetName: event.actorName || event.displayName || 'User',
                targetEmail: userEmail,
                targetRole: event.actorRole || 'parent',
                description: `Principal approved ${event.actorName || event.displayName} as ${event.actorRole}`,
                timestamp: serverTimestamp(),
                read: true,
            });

            await batch.commit();

        } catch (err) {
            console.error('[Activity] Approve error:', err);
            alert('Approval failed due to permissions. Ensure rule updates are published in Firebase Console.');
        } finally {
            setProcessingId(null);
        }
    };

    // ── Decline ────────────────────────────────────────────────────────────
    const handleDecline = async (event, reason) => {
        setProcessingId(event.id);
        try {
            await updateDoc(doc(db, 'schoolActivity', event.id), {
                approvalStatus: 'declined',
                approvedBy: 'Principal',
                declineReason: reason || '',
                approvedAt: serverTimestamp(),
                read: true,
            });

            if (event.actorUid) {
                const roleCol = event.actorRole === 'teacher' ? 'teachers'
                    : event.actorRole === 'student' ? 'students'
                        : 'users';
                await updateDoc(doc(db, roleCol, event.actorUid), {
                    approved: false,
                    approvalStatus: 'declined',
                    declineReason: reason || '',
                    approvedBy: 'Principal',
                    approvedAt: serverTimestamp(),
                });
                await updateDoc(doc(db, 'users', event.actorUid), {
                    approved: false,
                    approvalStatus: 'declined',
                });
            }

            await addDoc(collection(db, 'schoolActivity'), {
                schoolId: schoolId,
                type: 'user_declined',
                actorName: 'Principal',
                targetName: event.actorName,
                targetEmail: event.actorEmail,
                targetRole: event.actorRole,
                declineReason: reason || '',
                description: `Principal declined ${event.actorName}`,
                timestamp: serverTimestamp(),
                read: true,
            });

            if (apiUrl && event.actorUid) {
                fetch(`${apiUrl.replace(/\/+$/, '')}/approve-school-user`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
                    },
                    body: JSON.stringify({
                        activityId: event.id,
                        actorUid: event.actorUid,
                        actorEmail: event.actorEmail,
                        actorName: event.actorName,
                        actorRole: event.actorRole,
                        schoolId,
                        action: 'declined',
                        declineReason: reason || '',
                    }),
                }).catch(err => console.warn('[Decline] Backend update failed:', err));
            }
        } catch (err) {
            console.error('[Activity] Decline error:', err);
            alert('Decline failed. Please try again.');
        } finally {
            setProcessingId(null);
        }
    };

    // ── Counts ─────────────────────────────────────────────────────────────
    const pendingCount = events.filter(e => e.type === 'user_joined' && !e.approvalStatus).length;

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border
                        border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">

            {/* Collapsible header */}
            <button
                onClick={() => setIsOpen(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4
                           bg-white dark:bg-slate-900
                           hover:bg-slate-50 dark:hover:bg-slate-800/50
                           transition-colors cursor-pointer"
            >
                <div className="flex items-center gap-2.5">
                    <div className="relative">
                        <Bell size={18} className="text-slate-600 dark:text-slate-300" />
                        {unread > 0 && (
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-indigo-600 rounded-full animate-pulse" />
                        )}
                    </div>
                    <h3 className="font-black text-sm text-slate-800 dark:text-white">
                        School Activity & Approvals
                    </h3>
                    {pendingCount > 0 && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            {pendingCount} Pending
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {unread > 0 && (
                        <span onClick={(e) => { e.stopPropagation(); markAllRead(); }}
                            className="text-[11px] text-indigo-500 hover:text-indigo-600 font-bold">
                            Mark all read
                        </span>
                    )}
                    {isOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </div>
            </button>

            {/* Body */}
            {isOpen && (
                <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                    {loading ? (
                        <div className="p-8 text-center text-xs text-slate-400">
                            Loading activity log...
                        </div>
                    ) : error ? (
                        <div className="p-6 text-center text-xs text-red-500">
                            {error}
                        </div>
                    ) : events.length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-400">
                            No recent activity for this school.
                        </div>
                    ) : (
                        events.map(event => (
                            <ActivityCard
                                key={event.id}
                                event={event}
                                schoolId={schoolId}
                                onApprove={handleApprove}
                                onDecline={handleDecline}
                                processingId={processingId}
                                removing={removingIds.has(event.id)}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
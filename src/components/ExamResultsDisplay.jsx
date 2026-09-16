import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import {
  collection, query, where, getDocs, doc, getDoc,
  or, onSnapshot,
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import {
  ChevronDown, ChevronUp, Clock, BookOpen, Archive,
  Inbox, Target, CheckCircle, XCircle, Bot, Brain,
  BarChart2, Star, Zap,
} from 'lucide-react';

const API = 'https://chatbot-backend-educat.onrender.com';
import { useStudentId, getCachedStudentId } from '../utils/StudentId';
import AIMentor from './AIMentor';
import SubjectRecommendations from './SubjectRecommendations';



/* ── Grade normaliser ──────────────────────────────────────────────────────── */
const extractGradeNumber = (data = {}) => {
  if (data.grade) { const g = parseInt(String(data.grade).replace(/\D/g, ''), 10); if (!isNaN(g)) return g; }
  if (data.gradeYear) { const g = parseInt(String(data.gradeYear), 10); if (!isNaN(g)) return g; }
  if (data.exam) { const m = String(data.exam).match(/grade\s*(\d+)/i); if (m) return parseInt(m[1], 10); }
  return null;
};

/* ── Score theme ───────────────────────────────────────────────────────────── */
const getTheme = (pct) => {
  const p = parseFloat(pct);
  if (p >= 75) return { bg: 'bg-green-50 border-green-200', accent: 'bg-green-600', text: 'text-green-700', bar: 'bg-green-500' };
  if (p >= 50) return { bg: 'bg-blue-50 border-blue-200', accent: 'bg-blue-600', text: 'text-blue-700', bar: 'bg-blue-500' };
  return { bg: 'bg-red-50 border-red-200', accent: 'bg-red-500', text: 'text-red-700', bar: 'bg-red-500' };
};

const pctBg = (p) =>
  p >= 75 ? 'bg-green-100 text-green-800' : p >= 50 ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800';

/* ── Shared UI atoms ───────────────────────────────────────────────────────── */
const Stat = ({ label, value }) => (
  <div className="bg-gray-50 p-2 rounded border text-center">
    <p className="text-[8px] uppercase font-black text-gray-400">{label}</p>
    <p className="text-xs font-bold text-gray-800">{value ?? '—'}</p>
  </div>
);

const Header = ({ icon: Icon, title, sub }) => (
  <div className="flex items-center gap-3 mb-6 p-4 rounded-2xl text-white bg-slate-800">
    <Icon size={18} />
    <div>
      <h2 className="font-black uppercase tracking-widest text-xs">{title}</h2>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

const Empty = ({ icon: Icon, text }) => (
  <div className="text-center py-16 border-2 border-dashed rounded-3xl bg-gray-50">
    <Icon size={32} className="mx-auto text-gray-200 mb-2" />
    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{text}</p>
  </div>
);

/* ── Normalise an attempt doc — fixes all field name mismatches ────────────── */
const normaliseAttempt = (docSnap, examTitles = {}) => {
  const d = docSnap.data();

  const examId = d.examId || d.exam || '';

  const examTitle =
    examTitles[examId] ||
    d.examTitle ||
    (examId ? examId.replace(/_exam\.json$/, '').replace(/_/g, ' ') : 'Unknown Exam');

  const tsSeconds =
    d.completedAt?.seconds ||
    d.submittedAt?.seconds ||
    d.completedAt?._seconds ||
    d.submittedAt?._seconds ||
    (d.completedTime ? new Date(d.completedTime).getTime() / 1000 : 0);

  // ✅ percentage may be top-level OR inside metadata
  const percentage =
    d.percentage != null
      ? parseFloat(d.percentage)
      : d.metadata?.percentage != null
        ? parseFloat(d.metadata.percentage)
        : null;

  // ✅ score/total same pattern
  const score = d.score ?? d.metadata?.score ?? null;
  const total = d.total ?? d.metadata?.total ?? null;

  return {
    id: docSnap.id,
    ...d,
    exam: examId,
    examId,
    examTitle,
    _tsSeconds: tsSeconds,
    percentage,
    score,
    total,
    answeredCount: d.answeredCount ?? Object.keys(d.answers || {}).length,
    skipped: d.skipped ?? [],
    markedResults: d.markedResults ?? [],
    aiFeedback: d.aiFeedback ?? d.feedback ?? '',
    analysis: d.analysis ?? {},
  };
};

/* ══════════════════════════════════════════════════════════════════════════════
   AI RESULT CARD
══════════════════════════════════════════════════════════════════════════════ */
const AIResultCard = ({ res, expandedId, setExpandedId }) => {
  const open = expandedId === res.id;
  const pct = res.percentage ?? 0;
  const theme = getTheme(pct);

  const [agentQ, setAgentQ] = useState('');
  const [agentReply, setAgentReply] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);

  const askAgent = async () => {
    const q = agentQ.trim();
    if (!q || agentLoading) return;
    setAgentLoading(true);
    setAgentReply('');
    try {
      const r = await fetch(`${API}/agent-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: getCachedStudentId(), message: q }),
      });
      const d = await r.json();
      setAgentReply(d.response || d.answer || 'No response.');
    } catch {
      setAgentReply('⚠️ Could not reach the agent.');
    } finally {
      setAgentLoading(false);
      setAgentQ('');
    }
  };

  const dateLabel = res._tsSeconds
    ? new Date(res._tsSeconds * 1000).toLocaleString()
    : '—';

  return (
    <div className={`mb-3 border rounded-xl overflow-hidden shadow-sm ${theme.bg}`}>
      {/* ── Header row ── */}
      <div
        className="p-4 flex justify-between cursor-pointer hover:bg-white/40"
        onClick={() => setExpandedId(open ? null : res.id)}
      >
        <div className="flex gap-3">
          <div className={`p-2 rounded-lg ${theme.accent} text-white flex items-center`}>
            <Bot size={16} />
          </div>
          <div>
            <h3 className="font-black text-[11px] text-gray-900">{res.examTitle}</h3>
            <p className="text-[9px] uppercase font-bold text-gray-400">AI Exam · {dateLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className={`font-black text-sm ${theme.text}`}>{pct}%</span>
            <p className="text-[9px] text-gray-400">{res.score ?? '?'}/{res.total ?? '?'}</p>
          </div>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="h-1 bg-gray-100">
        <div className={`h-1 ${theme.bar} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>

      {/* ── Expanded body ── */}
      {open && (
        <div className="bg-white border-t p-5">

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            <Stat label="Score" value={`${res.score ?? '?'}/${res.total ?? '?'}`} />
            <Stat label="Percentage" value={`${pct}%`} />
            <Stat label="Answered" value={res.answeredCount} />
            <Stat label="Skipped" value={res.skipped?.length ?? 0} />
          </div>

          {/* AI Analysis summary */}
          {res.analysis?.overallSummary && (
            <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
              <p className="text-[10px] font-black uppercase text-indigo-400 mb-1">🧠 AI Learning Analysis</p>
              <p className="text-[11px] text-indigo-800 leading-relaxed">{res.analysis.overallSummary}</p>
            </div>
          )}

          {/* Strengths & Weaknesses */}
          {(res.analysis?.strengths?.length > 0 || res.analysis?.weaknesses?.length > 0) && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              {res.analysis?.strengths?.length > 0 && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-[10px] font-black text-green-600 mb-1">✅ Strengths</p>
                  {res.analysis.strengths.slice(0, 3).map((s, i) => (
                    <p key={i} className="text-[10px] text-gray-600">• {s}</p>
                  ))}
                </div>
              )}
              {res.analysis?.weaknesses?.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-[10px] font-black text-red-500 mb-1">⚠️ Needs Work</p>
                  {res.analysis.weaknesses.slice(0, 3).map((w, i) => (
                    <p key={i} className="text-[10px] text-gray-600">• {w}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Study plan */}
          {res.analysis?.studyPlan?.length > 0 && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-[10px] font-black text-amber-600 mb-1">📚 Personalised Study Plan</p>
              {res.analysis.studyPlan.slice(0, 4).map((step, i) => (
                <p key={i} className="text-[10px] text-gray-700 py-0.5">
                  {i + 1}. {typeof step === 'string' ? step : step.task || step.topic || JSON.stringify(step)}
                </p>
              ))}
            </div>
          )}

          {/* Question breakdown */}
          {res.markedResults.length > 0 && (
            <div className="space-y-2 mb-4">
              <p className="text-[10px] font-black uppercase text-gray-400 mb-2">Question Breakdown</p>
              {res.markedResults.map((r, idx) => {
                const correct = r.status === 'correct';
                const partial = r.status === 'partial';
                const bc = correct ? 'border-green-500' : partial ? 'border-yellow-400' : 'border-red-500';
                const bg = correct ? 'bg-green-50' : partial ? 'bg-yellow-50' : 'bg-red-50';
                return (
                  <div key={idx} className={`p-3 rounded border-l-4 ${bg} ${bc}`}>
                    <div className="flex gap-2 items-start">
                      {correct
                        ? <CheckCircle size={14} className="text-green-600 mt-0.5 flex-shrink-0" />
                        : <XCircle size={14} className="text-red-600 mt-0.5 flex-shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-gray-800">
                          {r.question_number}. {r.question}
                        </p>
                        <p className="text-[10px] mt-1">
                          <span className="text-gray-400">Your answer: </span>
                          <span className={correct ? 'text-green-700' : 'text-red-700 font-bold'}>
                            {r.student_answer || 'No answer'}
                          </span>
                        </p>
                        {!correct && (
                          <p className="text-[10px]">
                            <span className="text-gray-400">Correct: </span>
                            <span className="text-green-700 font-bold">{r.correct_answer || '—'}</span>
                          </p>
                        )}
                        {r.feedback && (
                          <p className="text-[10px] text-gray-500 mt-1 italic">{r.feedback}</p>
                        )}
                        {r.model_answer && !correct && (
                          <p className="text-[10px] text-indigo-600 mt-1">
                            <span className="font-bold">Model answer: </span>{r.model_answer}
                          </p>
                        )}
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {r.earned ?? r.score ?? 0}/{r.marks} marks · {r.status}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* AI Feedback */}
          {res.aiFeedback && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4 text-[11px] text-indigo-800">
              🤖 <b>AI Feedback:</b> {res.aiFeedback}
            </div>
          )}

          {/* Ask agent */}
          <div className="bg-gray-50 border rounded-lg p-3">
            <p className="text-[10px] font-black uppercase text-gray-400 mb-2">Ask Agent About This Exam</p>
            {agentReply && (
              <div className="bg-white border border-indigo-100 rounded p-2 mb-2 text-[11px] text-gray-700 whitespace-pre-wrap">
                {agentReply}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={agentQ}
                onChange={e => setAgentQ(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') askAgent(); }}
                placeholder={`"Explain Q4.1" or "What should I revise?"`}
                className="flex-1 text-[11px] border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-indigo-300"
              />
              <button
                onClick={askAgent}
                disabled={agentLoading || !agentQ.trim()}
                className="px-3 py-1.5 bg-indigo-600 text-white text-[10px] font-black rounded disabled:opacity-40"
              >
                {agentLoading ? '…' : 'Ask'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   LEGACY RESULT CARD
══════════════════════════════════════════════════════════════════════════════ */
const LegacyResultCard = ({ res, expandedId, setExpandedId }) => {
  const theme = getTheme(res.percentage);
  const open = expandedId === res.id;

  return (
    <div className={`mb-3 border rounded-xl overflow-hidden shadow-sm ${theme.bg}`}>
      <div
        className="p-4 flex justify-between cursor-pointer hover:bg-white/40"
        onClick={() => setExpandedId(open ? null : res.id)}
      >
        <div className="flex gap-3">
          <div className={`p-2 rounded-lg ${theme.accent} text-white`}><BookOpen size={16} /></div>
          <div>
            <h3 className="font-black text-[11px] text-gray-900">{res.exam}</h3>
            <p className="text-[9px] uppercase font-bold text-gray-400">
              {res.grade || res.gradeYear} · {res.completedTime}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`font-black text-sm ${theme.text}`}>{res.percentage}%</span>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {open && (
        <div className="bg-white border-t p-5">
          <div className="grid grid-cols-4 gap-2 mb-4">
            <Stat label="Total Questions" value={res.totalQuestions} />
            <Stat label="Time" value={res.timeSpent} />
            <Stat label="Score" value={res.score} />
            <Stat label="Attempt" value={res.attempts || 1} />
          </div>
          <div className="space-y-2">
            {(res.answers ?? []).map((ans, idx) => {
              const correct =
                String(ans.answer || '').trim().toLowerCase() ===
                String(ans.correctAnswer || '').trim().toLowerCase();
              return (
                <div
                  key={idx}
                  className={`p-3 rounded border-l-4 ${correct ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}
                >
                  <div className="flex gap-2 items-start">
                    {correct
                      ? <CheckCircle size={14} className="text-green-600 mt-0.5" />
                      : <XCircle size={14} className="text-red-600 mt-0.5" />}
                    <div>
                      <p className="text-[11px] font-bold text-gray-800">{idx + 1}. {ans.question}</p>
                      <p className="text-[10px] mt-1">
                        <span className="text-gray-400">Answered: </span>
                        <span className={correct ? 'text-green-700' : 'text-red-700 font-bold'}>
                          {ans.answer || 'No Answer'}
                        </span>
                      </p>
                      {!correct && (
                        <p className="text-[10px]">
                          <span className="text-gray-400">Correct: </span>
                          <span className="text-green-700 font-bold">{ans.correctAnswer}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   PROGRESS DASHBOARD
══════════════════════════════════════════════════════════════════════════════ */
const ProgressDashboard = ({ studentId, aiAttempts, legacyCurrent, legacyHistory }) => {
  const [agentData, setAgentData] = useState(null);
  const [agentQ, setAgentQ] = useState('');
  const [chatHistory, setChatHistory] = useState([]);   // { role: 'user'|'assistant', content: string }[]
  const chatScrollRef = useRef(null);
  const [asking, setAsking] = useState(false);
  // ── Auth token for AI Mentor API calls ────────────────────────────────
  const [authToken, setAuthToken] = useState('');
  const auth = getAuth();
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;
    // Tokens expire after 1 hour — refresh every 50 minutes
    const getToken = () => user.getIdToken(true).then(setAuthToken);
    getToken();
    const interval = setInterval(getToken, 50 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);


  useEffect(() => {
    if (!studentId) return;
    fetch(`${API}/dashboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId }),
    })
      .then(r => r.json())
      .then(d => setAgentData(d))
      .catch(() => { });
  }, [studentId]);

  const stats = useMemo(() => {
    const allScores = [];
    aiAttempts.forEach(a => {
      if (a.percentage == null) return;
      allScores.push({
        pct: parseFloat(a.percentage),
        label: a.examTitle || a.exam || 'AI Exam',
        source: 'ai',
        date: a._tsSeconds || 0,
      });
    });
    legacyCurrent.forEach(r => {
      if (r.percentage == null) return;
      allScores.push({
        pct: parseFloat(r.percentage),
        label: r.exam,
        source: 'teacher',
        date: new Date(r.completedTime || 0).getTime() / 1000,
      });
    });
    legacyHistory.forEach(r => {
      if (r.percentage == null) return;
      allScores.push({
        pct: parseFloat(r.percentage),
        label: r.exam,
        source: 'history',
        date: new Date(r.completedTime || 0).getTime() / 1000,
      });
    });
    allScores.sort((a, b) => a.date - b.date);
    const total = allScores.length;
    const avg = total ? Math.round(allScores.reduce((s, x) => s + x.pct, 0) / total) : null;
    const best = total ? Math.max(...allScores.map(x => x.pct)) : null;
    const latest = total ? allScores[allScores.length - 1] : null;
    const previous = total > 1 ? allScores[allScores.length - 2] : null;
    const trend = latest && previous ? latest.pct - previous.pct : null;
    const passing = allScores.filter(x => x.pct >= 50).length;
    const failing = allScores.filter(x => x.pct < 50).length;
    return { allScores, total, avg, best, latest, trend, passing, failing };
  }, [aiAttempts, legacyCurrent, legacyHistory]);

  const allWeakAreas = useMemo(() => {
    const map = new Map();
    aiAttempts.forEach(attempt => {
      (attempt.markedResults ?? []).forEach(r => {
        if (r.status === 'correct') return;
        const key = r.question_number || r.question?.slice(0, 40) || 'unknown';
        const existing = map.get(key);
        map.set(key, {
          key,
          count: (existing?.count || 0) + 1,
          text: existing?.text || r.question || '',
          type: r.type || 'open',
        });
      });
    });
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 12);
  }, [aiAttempts]);




  // ── Agent Chat with Learning Profile & Latest Attempt Data ─────────
  const askAgent = async () => {
    const q = agentQ.trim();
    if (!q || asking) return;
    setAsking(true);
    setAgentQ('');

    // Append user message immediately
    const userMsg = { role: 'user', content: q };
    const updatedHistory = [...chatHistory, userMsg];
    setChatHistory(updatedHistory);

    // Auto-scroll to bottom
    setTimeout(() => {
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      }
    }, 50);

    try {
      const latestAttempt = aiAttempts[0] || null;

      const learningProfile = {
        studentId,
        totalExams: aiAttempts.length,
        overallAverage: aiAttempts.length
          ? Math.round(aiAttempts.reduce((s, a) => s + (a.percentage || 0), 0) / aiAttempts.length)
          : null,
        bestScore: aiAttempts.length
          ? Math.max(...aiAttempts.map(a => a.percentage || 0))
          : null,
        subjects: [...new Set(aiAttempts.map(a => a.subject).filter(Boolean))],
        weakAreas: allWeakAreas.slice(0, 8).map(w => ({
          question: w.key,
          timesWrong: w.count,
          type: w.type,
          text: w.text,
        })),
        recentResults: aiAttempts.slice(0, 5).map(a => ({
          examTitle: a.examTitle,
          subject: a.subject,
          percentage: a.percentage,
          score: a.score,
          total: a.total,
          date: a._tsSeconds ? new Date(a._tsSeconds * 1000).toLocaleDateString() : '—',
        })),
      };

      const r = await fetch(`${API}/agent-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          message: q,
          learningProfile,
          latestAttempt: latestAttempt ? {
            examTitle: latestAttempt.examTitle,
            subject: latestAttempt.subject,
            percentage: latestAttempt.percentage,
            score: latestAttempt.score,
            total: latestAttempt.total,
            aiFeedback: latestAttempt.aiFeedback,
            markedResults: (latestAttempt.markedResults || []).map(r => ({
              question_number: r.question_number,
              question: r.question,
              status: r.status,
              earned: r.earned,
              marks: r.marks,
              student_answer: r.student_answer,
              correct_answer: r.correct_answer,
              feedback: r.feedback,
              concept_gap: r.concept_gap,
            })),
          } : {},
          // ✅ Send full conversation history so backend maintains context
          history: updatedHistory,
        }),
      });

      const d = await r.json();
      const reply = d.response || d.answer || 'No response.';

      // Append assistant reply
      setChatHistory(prev => [...prev, { role: 'assistant', content: reply }]);

      // Auto-scroll again after reply arrives
      setTimeout(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
      }, 50);

    } catch {
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ Could not reach the agent. Please try again.',
      }]);
    } finally {
      setAsking(false);
    }
  };

  const maxWrong = Math.max(1, ...allWeakAreas.map(w => w.count));

  return (
    <div className="space-y-5">

      {/* Score summary cards */}
      {stats.total > 0 ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Overall Average', value: stats.avg != null ? `${stats.avg}%` : '—', sub: `${stats.total} exam${stats.total !== 1 ? 's' : ''}`, color: pctBg(stats.avg || 0) },
              { label: 'Best Result', value: stats.best != null ? `${Math.round(stats.best)}%` : '—', sub: stats.allScores.find(x => x.pct === stats.best)?.label || '', color: 'bg-green-100 text-green-800' },
              { label: 'Latest Result', value: stats.latest ? `${Math.round(stats.latest.pct)}%` : '—', sub: stats.latest?.label || '', color: pctBg(stats.latest?.pct || 0) },
              { label: 'Trend', value: stats.trend != null ? (stats.trend > 0 ? `▲ +${Math.round(stats.trend)}%` : `▼ ${Math.round(stats.trend)}%`) : '—', sub: 'vs previous exam', color: stats.trend == null ? 'bg-gray-100 text-gray-600' : stats.trend >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800' },
            ].map((c, i) => (
              <div key={i} className={`rounded-xl p-4 ${c.color}`}>
                <p className="text-[9px] font-black uppercase tracking-widest opacity-70 mb-1">{c.label}</p>
                <p className="text-2xl font-black leading-none">{c.value}</p>
                <p className="text-[10px] mt-1 opacity-60 truncate">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Timeline bar */}
          <div className="bg-white border rounded-xl p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase text-gray-400 mb-3 flex items-center gap-2">
              <BarChart2 size={12} /> All Exam Results Timeline
            </p>
            <div className="flex items-end gap-1.5 h-20">
              {stats.allScores.map((s, i) => {
                const h = Math.max(4, Math.round((s.pct / 100) * 80));
                const col = s.pct >= 75 ? 'bg-green-500' : s.pct >= 50 ? 'bg-blue-500' : 'bg-red-400';
                const src = s.source === 'ai' ? '🤖' : s.source === 'teacher' ? '📝' : '📦';
                return (
                  <div key={i} className="flex flex-col items-center flex-1 min-w-0" title={`${s.label}: ${Math.round(s.pct)}%`}>
                    <span className="text-[8px] text-gray-500 mb-0.5">{Math.round(s.pct)}%</span>
                    <div className={`w-full rounded-t ${col}`} style={{ height: h }} />
                    <span className="text-[7px] mt-0.5">{src}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-3 text-[9px] text-gray-400">
              <span>🤖 AI exam</span><span>📝 Teacher</span><span>📦 History</span>
            </div>
          </div>

          {/* Pass/fail */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-green-700">{stats.passing}</p>
              <p className="text-[9px] font-black uppercase text-green-500">Passed (≥50%)</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-red-600">{stats.failing}</p>
              <p className="text-[9px] font-black uppercase text-red-400">Below 50%</p>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-indigo-700">{stats.total}</p>
              <p className="text-[9px] font-black uppercase text-indigo-400">Total Exams</p>
            </div>
          </div>
        </>
      ) : (
        <Empty icon={Clock} text="No exam results yet — complete some exams to see your progress" />
      )}

      {/* Subject recommendations */}
      <SubjectRecommendations aiAttempts={aiAttempts} />



      {/* Study plan from /dashboard API */}
      {agentData?.study_plan && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase text-indigo-400 mb-1 flex items-center gap-2">
            <Zap size={12} /> AI Study Plan
          </p>
          <p className="text-[9px] text-indigo-300 mb-2">Updated: {agentData.study_plan.updated_at}</p>
          <p className="text-[11px] text-indigo-800 whitespace-pre-wrap leading-relaxed">{agentData.study_plan.plan}</p>
        </div>
      )}

      {/* AI Academic Mentor */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 rounded-2xl p-5 text-white shadow-xl">

        {/* Conversation window */}
        <div
          ref={chatScrollRef}
          className="flex flex-col gap-3 mb-4 max-h-96 overflow-y-auto pr-1"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}
        >
          <AIMentor
            authToken={authToken}
            apiUrl={import.meta.env.VITE_API_URL}
            studentId={studentId}
            examResults={aiAttempts}
          />
        </div>
      </div>

    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════════ */
export default function ExamResultsDisplay() {
  const [legacyHistory, setLegacyHistory] = useState([]);
  const [legacyCurrent, setLegacyCurrent] = useState([]);
  const [aiAttempts, setAiAttempts] = useState([]);
  const [examTitles, setExamTitles] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [currentGrade, setCurrentGrade] = useState(null);
  const [activeTab, setActiveTab] = useState('insights');
  const studentId = useStudentId();


  // ── 1. Load exam titles (for display labels only) ──────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'exams'), snap => {
      const map = {};
      snap.forEach(d => { map[d.id] = d.data().title || d.id; });
      setExamTitles(map);
    });
    return () => unsub();
  }, []);

  // ── 2. Load all student results (Real-Time Subscriptions) ──────────────────
  useEffect(() => {
    const auth = getAuth();
    let unsubAI = () => { }; // Store unsubscribe function for cleanup

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // 1. Fetch Student Profile Securely by UID
        const profileSnap = await getDoc(doc(db, 'students', user.uid));
        const profile = profileSnap.exists() ? profileSnap.data() : {};
        const grade = extractGradeNumber(profile) || 12;
        setCurrentGrade(grade);

        // 2. Query Legacy Exam Results Securely by UID (One-time pull)
        const legacySnap = await getDocs(query(
          collection(db, 'examResults'),
          where('studentUid', '==', user.uid)
        ));

        const hist = [], curr = [];
        legacySnap.forEach(docSnap => {
          const data = docSnap.data();
          const g = extractGradeNumber(data);
          if (!g) return;
          const rec = { id: docSnap.id, ...data };
          g === grade ? curr.push(rec) : g < grade && hist.push(rec);
        });

        const sortDate = arr => arr.sort((a, b) => new Date(b.completedTime || 0) - new Date(a.completedTime || 0));
        setLegacyCurrent(sortDate(curr));
        setLegacyHistory(sortDate(hist));

        // 3. Setup Real-time Listener for AI Exam Attempts Securely by UID 🌟
        const aiQuery = query(
          collection(db, 'exam_attempts'),
          where('studentUid', '==', user.uid)
        );

        unsubAI = onSnapshot(aiQuery, (snapshot) => {
          const attempts = snapshot.docs
            .map(docSnap => normaliseAttempt(docSnap, examTitles)) // Pass active examTitles mapping
            .sort((a, b) => b._tsSeconds - a._tsSeconds);

          setAiAttempts(attempts);
          setLoading(false);
        }, (error) => {
          console.error("AI Attempts Listener Error:", error);
          setLoading(false);
        });

      } catch (err) {
        console.error("Error setting up dashboard data:", err);
        setLoading(false);
      }
    });

    // Cleanup both subscriptions when component unmounts
    return () => {
      unsubAuth();
      unsubAI();
    };
  }, [examTitles]);

  // ── 3. Apply examTitles to attempts once titles load ───────────────────────
  // This avoids re-fetching Firestore just because titles arrived late
  const aiAttemptsWithTitles = useMemo(() => {
    if (!examTitles || Object.keys(examTitles).length === 0) return aiAttempts;
    return aiAttempts.map(a => ({
      ...a,
      examTitle:
        examTitles[a.examId] ||
        examTitles[a.exam] ||
        a.examTitle ||
        a.subject ||
        (a.examId || a.exam || 'Unknown Exam').replace(/_exam\.json$/, '').replace(/_/g, ' '),
    }));
  }, [aiAttempts, examTitles]);

  const totalExams = aiAttemptsWithTitles.length + legacyCurrent.length + legacyHistory.length;
  const overallAverage = totalExams
    ? Math.round(
      [...aiAttemptsWithTitles, ...legacyCurrent, ...legacyHistory]
        .reduce((s, x) => s + Number(x.percentage || 0), 0) / totalExams
    )
    : 0;

  const tabs = [
    { id: 'insights', label: '🧠 My Progress', count: totalExams },
    { id: 'ai', label: '🤖 AI Exams', count: aiAttemptsWithTitles.length },
    { id: 'current', label: `📈 Grade ${currentGrade || 12}`, count: legacyCurrent.length },
    { id: 'history', label: '📦 History', count: legacyHistory.length },
  ];

  if (loading) return (
    <div className="p-20 text-center font-black text-indigo-600 animate-pulse">
      ACCESSING AI ACADEMIC RECORDS...
    </div>
  );

  return (
    <div className="w-full max-w-6xl mx-auto p-4">

      {studentId && (
        <div className="flex items-center gap-3 mb-5 p-4 bg-slate-800 rounded-xl text-white">
          <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center font-black">
            {studentId.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-black">{studentId}</p>
            <p className="text-xs text-slate-400">{totalExams} Exams · {overallAverage}% Average</p>
          </div>
          <div className="ml-auto flex gap-2 flex-wrap">
            {!!aiAttemptsWithTitles.length && (
              <span className="px-2 py-1 rounded bg-indigo-600 text-xs">{aiAttemptsWithTitles.length} AI</span>
            )}
            {!!legacyCurrent.length && (
              <span className="px-2 py-1 rounded bg-blue-600 text-xs">{legacyCurrent.length} Current</span>
            )}
            {!!legacyHistory.length && (
              <span className="px-2 py-1 rounded bg-slate-600 text-xs">{legacyHistory.length} History</span>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap mb-5">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-xl text-xs font-black ${activeTab === tab.id ? 'bg-slate-800 text-white' : 'bg-white border text-gray-500'}`}
          >
            {tab.label} <span className="ml-2">{tab.count}</span>
          </button>
        ))}
      </div>

      {activeTab === 'insights' && (
        <ProgressDashboard
          studentId={studentId}
          aiAttempts={aiAttemptsWithTitles}
          legacyCurrent={legacyCurrent}
          legacyHistory={legacyHistory}
        />
      )}

      {activeTab === 'ai' && (
        <>
          <Header icon={Bot} title="AI Exam Intelligence" sub={`Student: ${studentId}`} />
          {!aiAttemptsWithTitles.length
            ? <Empty icon={Clock} text="No AI exams yet" />
            : aiAttemptsWithTitles.map(r => (
              <AIResultCard
                key={r.id}
                res={r}
                expandedId={expandedId}
                setExpandedId={setExpandedId}
              />
            ))
          }
        </>
      )}

      {activeTab === 'current' && (
        <>
          <Header icon={Target} title={`Grade ${currentGrade} Results`} />
          {!legacyCurrent.length
            ? <Empty icon={Clock} text="No Current Results" />
            : legacyCurrent.map(r => (
              <LegacyResultCard
                key={r.id}
                res={r}
                expandedId={expandedId}
                setExpandedId={setExpandedId}
              />
            ))
          }
        </>
      )}

      {activeTab === 'history' && (
        <>
          <Header icon={Archive} title="Academic History" />
          {!legacyHistory.length
            ? <Empty icon={Inbox} text="No History" />
            : legacyHistory.map(r => (
              <LegacyResultCard
                key={r.id}
                res={r}
                expandedId={expandedId}
                setExpandedId={setExpandedId}
              />
            ))
          }
        </>
      )}

    </div>
  );
}
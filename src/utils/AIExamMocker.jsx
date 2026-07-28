"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { db } from "./firebase";
import {
  collection, addDoc, serverTimestamp, onSnapshot,
  query, orderBy, getDoc, getDocs, doc, where, setDoc, limit
} from "firebase/firestore";
import { useStudentId } from "./StudentId";
import { useParams } from "react-router-dom";
import { auth } from "./firebase";

const API = import.meta.env.VITE_API_URL;
// ─── Style tokens ─────────────────────────────────────────────────────────────
const S = {
  wrap: { fontFamily: "'DM Sans', sans-serif", maxWidth: 800, margin: "0 auto", padding: "24px 16px", color: "#1a1a2e", minHeight: "100vh", background: "#f4f6fb" },
  wrapFull: { fontFamily: "'DM Sans', sans-serif", width: "100vw", height: "100vh", margin: 0, padding: 0, color: "#1a1a2e", background: "#f4f6fb", display: "flex", flexDirection: "column", overflow: "hidden" },
  card: { background: "#fff", borderRadius: 16, padding: 28, boxShadow: "0 2px 16px rgba(30,30,60,.08)", marginBottom: 20 },
  cardFull: { background: "#fff", borderRadius: 0, padding: "20px 32px", boxShadow: "none", flex: 1, overflowY: "auto", marginBottom: 0 },
  title: { fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px", color: "#1a1a2e", margin: 0 },
  subtitle: { fontSize: 13, color: "#6b7280", marginTop: 4, marginBottom: 0 },
  secBadge: { display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", background: "#e0e7ff", color: "#3730a3", borderRadius: 6, padding: "3px 10px", marginBottom: 8 },
  parentHd: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: .8, color: "#9ca3af", marginBottom: 6 },
  context: { background: "#fffbeb", borderLeft: "3px solid #f59e0b", padding: "8px 14px", borderRadius: 6, fontSize: 13, color: "#78350f", marginBottom: 14 },
  qRow: { display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 18 },
  qNum: { fontWeight: 800, fontSize: 15, color: "#3730a3", minWidth: 36, paddingTop: 2 },
  qText: { flex: 1, fontSize: 15, lineHeight: 1.65, color: "#1a1a2e" },
  qMark: { fontWeight: 700, fontSize: 13, color: "#dc2626", whiteSpace: "nowrap", paddingTop: 2 },
  optLabel: { display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, marginBottom: 8, cursor: "pointer", transition: "all .15s", fontSize: 14 },
  optSel: { borderColor: "#6366f1", background: "#eef2ff" },
  optKey: { fontWeight: 700, color: "#6366f1", minWidth: 20 },
  tfBtn: { display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 22px", border: "1.5px solid #e5e7eb", borderRadius: 10, marginRight: 10, cursor: "pointer", fontSize: 14, fontWeight: 600, transition: "all .15s", background: "#fff" },
  tfSel: { borderColor: "#6366f1", background: "#eef2ff", color: "#3730a3" },
  textarea: { width: "100%", minHeight: 140, padding: "12px 14px", border: "1.5px solid #d1d5db", borderRadius: 10, fontSize: 14, lineHeight: 1.6, resize: "vertical", fontFamily: "'DM Sans', sans-serif", marginTop: 8, outline: "none", boxSizing: "border-box", display: "block" },
  corrInput: { width: "100%", padding: "9px 12px", border: "1.5px solid #d1d5db", borderRadius: 8, fontSize: 14, fontFamily: "inherit", marginTop: 8, boxSizing: "border-box" },
  navBar: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 20 },
  btn: { padding: "9px 18px", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer", transition: "opacity .15s" },
  btnPri: { background: "#6366f1", color: "#fff" },
  btnSec: { background: "#f3f4f6", color: "#374151" },
  btnDanger: { background: "#dc2626", color: "#fff" },
  btnGhost: { background: "transparent", color: "#6b7280", border: "1.5px solid #e5e7eb" },
  btnSkip: { background: "#fff", color: "#6b7280", border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  topBar: { background: "#1a1a2e", color: "#fff", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, gap: 12 },
  topBarTitle: { fontWeight: 800, fontSize: 15, letterSpacing: "-.3px", flex: 1 },
  drawer: { position: "fixed", top: 0, right: 0, height: "100vh", width: 300, background: "#fff", boxShadow: "-4px 0 24px rgba(0,0,0,.12)", zIndex: 200, overflowY: "auto", padding: 20 },
  drawerHd: { fontWeight: 800, fontSize: 16, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" },
  qDot: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", margin: 4, border: "1.5px solid #e5e7eb" },
  select: { width: "100%", padding: "11px 14px", borderRadius: 10, border: "1.5px solid #d1d5db", fontSize: 14, background: "#fff", marginBottom: 14, fontFamily: "inherit" },
  startBtn: { width: "100%", padding: "13px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: "pointer", letterSpacing: "-.3px" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  modal: { background: "#fff", borderRadius: 18, padding: 32, maxWidth: 420, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,.2)", textAlign: "center" },
  modalIcon: { fontSize: 42, marginBottom: 12 },
  modalTitle: { fontWeight: 800, fontSize: 20, color: "#1a1a2e", marginBottom: 8 },
  modalSub: { fontSize: 14, color: "#6b7280", marginBottom: 24, lineHeight: 1.6 },
  modalBtns: { display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" },
  agentPanel: { background: "#eef2ff", border: "1.5px solid #c7d2fe", borderRadius: 12, padding: "16px 20px", marginBottom: 20, fontSize: 14 },
  agentInput: { width: "100%", padding: "10px 14px", border: "1.5px solid #c7d2fe", borderRadius: 10, fontSize: 14, fontFamily: "inherit", marginTop: 10, boxSizing: "border-box" },
  scoreBanner: { background: "linear-gradient(135deg,#6366f1,#8b5cf6)", borderRadius: 16, padding: "28px 32px", marginBottom: 20, color: "#fff", textAlign: "center" },
};

// ─── Shared helpers (module-level — never recreated) ──────────────────────────
function normalizeType(type) {
  if (!type) return "open";
  const t = String(type).toLowerCase();
  if (t.includes("mcq") || t.includes("multiple") || t.includes("choice")) return "mcq";
  if (t.includes("true") || t.includes("false")) return "true_false";
  if (t.includes("match") || t.includes("column") || t.includes("link")) return "matching";
  if (t.includes("essay") || t.includes("long")) return "essay";
  // ── NEW types from extraction engine v5.1 ────────────────────────────
  if (t.includes("proof") || t.includes("show")) return "proof";
  if (t.includes("calc") || t.includes("comput")) return "calculation";
  if (t.includes("short") || t.includes("brief")) return "short_answer";
  if (t.includes("account")) return "accounting_statement";
  return "open";
}


const FontLoader = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&display=swap');
    * { box-sizing: border-box; }
    button:disabled { opacity:.5; cursor:not-allowed; }
    textarea { font-family: 'DM Sans', sans-serif !important; }
    @keyframes timerPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
    @keyframes timerShake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-3px)} 40%{transform:translateX(3px)} 60%{transform:translateX(-3px)} 80%{transform:translateX(3px)} }
    .timer-urgent { animation: timerPulse 1s ease-in-out infinite; }
    .timer-shake  { animation: timerShake 0.4s ease-in-out; }
  `}</style>
);

// ─── TIMER ────────────────────────────────────────────────────────────────────
function ExamTimer({ totalSeconds, onExpire, compact = false }) {
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [shake, setShake] = useState(false);
  const intervalRef = useRef(null);
  const prevMinuteRef = useRef(Math.ceil(totalSeconds / 60));

  useEffect(() => {
    if (totalSeconds <= 0) return;
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(intervalRef.current); onExpire(); return 0; }
        const nm = Math.ceil((s - 1) / 60);
        if (nm < prevMinuteRef.current) { prevMinuteRef.current = nm; setShake(true); setTimeout(() => setShake(false), 450); }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const display = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const isUrgent = secondsLeft <= 120;
  const isWarning = secondsLeft <= 300;
  const bgColor = isUrgent ? "#fef2f2" : isWarning ? "#fffbeb" : "#f0fdf4";
  const borderColor = isUrgent ? "#fca5a5" : isWarning ? "#fde68a" : "#86efac";
  const textColor = isUrgent ? "#dc2626" : isWarning ? "#b45309" : "#16a34a";
  const icon = isUrgent ? "⏰" : isWarning ? "⏳" : "🕐";

  if (compact) return (
    <span className={`${isUrgent ? "timer-urgent" : ""} ${shake ? "timer-shake" : ""}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, background: bgColor, border: `1.5px solid ${borderColor}`, color: textColor, borderRadius: 10, padding: "5px 12px", fontWeight: 800, fontSize: 14, letterSpacing: "1px", fontVariantNumeric: "tabular-nums", minWidth: 80, justifyContent: "center" }}>
      {icon} {display}
    </span>
  );

  return (
    <div className={`${isUrgent ? "timer-urgent" : ""} ${shake ? "timer-shake" : ""}`}
      style={{ display: "flex", alignItems: "center", gap: 10, background: bgColor, border: `1.5px solid ${borderColor}`, borderRadius: 12, padding: "10px 18px", marginBottom: 16 }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: textColor, opacity: .7 }}>Time Remaining</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: textColor, letterSpacing: "2px", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{display}</div>
      </div>
      {isUrgent && <div style={{ marginLeft: "auto", fontSize: 12, color: "#dc2626", fontWeight: 700 }}>Hurry up!</div>}
      {!isUrgent && isWarning && <div style={{ marginLeft: "auto", fontSize: 12, color: "#b45309", fontWeight: 700 }}>5 min left</div>}
    </div>
  );
}

// ─── TIME-UP MODAL ────────────────────────────────────────────────────────────
function TimeUpModal({ answeredCount, totalQ, onSubmit }) {
  return (
    <div style={S.overlay}>
      <div style={{ ...S.modal, borderTop: "5px solid #dc2626" }}>
        <div style={S.modalIcon}>⏰</div>
        <div style={S.modalTitle}>Time's Up!</div>
        <div style={S.modalSub}>
          Your exam time has expired.<br />
          You answered <b>{answeredCount}</b> of <b>{totalQ}</b> questions.<br />
          Your answers will now be submitted automatically.
        </div>
        <div style={S.modalBtns}>
          <button style={{ ...S.btn, ...S.btnDanger, minWidth: 160 }} onClick={onSubmit}>✅ Submit Now</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INPUT CONTENT
// KEY FIX: owns its own state. Parent passes `key={index}` so this component
// fully resets (fresh state) on each question change — no stale value bugs.
// Typing works because state lives here, not in a parent that re-renders.
// ─────────────────────────────────────────────────────────────────────────────
function InputContent({ question, savedAnswer, saveAnswer }) {
  const [textValue, setTextValue] = useState(savedAnswer || "");
  const [tfCorrection, setTfCorrection] = useState(() =>
    (savedAnswer || "").startsWith("False — ")
      ? savedAnswer.replace("False — ", "")
      : ""
  );

  // Matching: parse saved JSON like {"1":"A","2":"C"} back into a map
  const [matchMap, setMatchMap] = useState(() => {
    try { return savedAnswer ? JSON.parse(savedAnswer) : {}; }
    catch { return {}; }
  });

  if (!question) return null;

  const qType = normalizeType(question.type);
  const saved = savedAnswer || "";

  // ── MCQ ───────────────────────────────────────────────────────────────────
  if (qType === "mcq") {
    // ⚡ FIX 1: Use the robust convertOptions helper function sitting at the bottom of your file!
    console.log("MCQ options raw:", question.options);
    const opts = convertOptions(question.options);
    console.log("MCQ options converted:", opts);

    if (opts.length === 0) {
      return (
        <div style={{ marginTop: 16, padding: "12px 16px", background: "#fef9c3", borderRadius: 10, fontSize: 13, color: "#92400e" }}>
          ⚠️ No options found for this question. (type: <code>{question.type}</code>)
        </div>
      );
    }

    return (
      <div style={{ marginTop: 16 }}>
        {opts.map((opt) => {
          const sel = saved === opt.key;
          return (
            <label key={opt.key}
              style={{
                ...S.optLabel,
                ...(sel ? S.optSel : {}),
                userSelect: "none",
                cursor: "pointer",
              }}
              onClick={() => saveAnswer(opt.key)}>
              <input
                type="radio"
                name={`mcq_q${question.id}`}
                value={opt.key}
                checked={sel}
                onChange={() => saveAnswer(opt.key)}
                style={{ accentColor: "#6366f1", flexShrink: 0 }}
              />
              <span style={S.optKey}>{opt.key}.</span>
              <span style={{ flex: 1 }}>{opt.value}</span>
            </label>
          );
        })}
      </div>
    );
  }

  // ── TRUE / FALSE ──────────────────────────────────────────────────────────
  if (qType === "true_false") {
    const isFalseSelected = saved.startsWith("False");
    return (
      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          {["True", "False"].map((v) => {
            const sel = v === "True" ? saved === "True" : isFalseSelected;
            return (
              <button key={v} type="button"
                style={{ ...S.tfBtn, ...(sel ? S.tfSel : {}) }}
                onClick={() => {
                  if (v === "True") { setTfCorrection(""); saveAnswer("True"); }
                  else { saveAnswer(tfCorrection ? `False — ${tfCorrection}` : "False"); }
                }}>
                {v === "True" ? "✅" : "❌"} {v}
              </button>
            );
          })}
        </div>
        {isFalseSelected && (
          <div>
            <label style={{ fontSize: 13, color: "#4b5563", fontWeight: 600, display: "block", marginBottom: 4 }}>
              Correct the underlined word/phrase:
            </label>
            <input type="text" style={S.corrInput}
              placeholder="e.g. secondary memory"
              value={tfCorrection}
              onChange={(e) => {
                setTfCorrection(e.target.value);
                saveAnswer(`False — ${e.target.value}`);
              }} />
          </div>
        )}
      </div>
    );
  }

  // ── MATCHING / COLUMNS ────────────────────────────────────────────────────
  if (qType === "matching") {
    // ⚡ FIX 2: Prioritize camelCase keys directly to guarantee match alignment with Firestore data fields
    const colA = question.columnA || question.column_a || question.premises || question.left || [];
    const colB = question.columnB || question.column_b || question.responses || question.right || [];

    const toRows = (src) => {
      // New extraction engine returns objects: {"(a)": "text", "(b)": "text"}
      if (src && typeof src === "object" && !Array.isArray(src)) {
        return Object.entries(src).map(([key, label]) => ({ key, label }));
      }
      if (!Array.isArray(src)) return [];
      return src.map((item, i) => {
        if (typeof item === "string") return { key: String(i + 1), label: item };
        return {
          key: String(item.key || item.number || item.id || i + 1),
          label: item.label || item.text || item.value || item.content || String(item),
        };
      });
    };

    const toCols = (src) => {
      // New extraction engine returns objects: {"A": "text", "B": "text"}
      if (src && typeof src === "object" && !Array.isArray(src)) {
        return Object.entries(src).map(([key, label]) => ({ key, label }));
      }
      if (!Array.isArray(src)) return [];
      return src.map((item, i) => {
        if (typeof item === "string") return { key: String.fromCharCode(65 + i), label: item };
        return {
          key: String(item.key || item.letter || item.id || String.fromCharCode(65 + i)),
          label: item.label || item.text || item.value || item.content || String(item),
        };
      });
    };

    const rows = toRows(colA);
    const options = toCols(colB);

    const updateMatch = (rowKey, colKey) => {
      const updated = { ...matchMap, [rowKey]: colKey };
      setMatchMap(updated);
      saveAnswer(JSON.stringify(updated));
    };

    if (rows.length === 0) {
      return (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
            Match each item — write your answers (e.g. 1-C, 2-A, 3-B):
          </p>
          <textarea
            style={S.textarea}
            placeholder="e.g. 1-C, 2-A, 3-B"
            value={textValue}
            onChange={(e) => { setTextValue(e.target.value); saveAnswer(e.target.value); }}
          />
        </div>
      );
    }

    return (
      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {options.map((opt) => (
            <span key={opt.key} style={{ background: "#eef2ff", border: "1.5px solid #c7d2fe", borderRadius: 8, padding: "5px 12px", fontSize: 13, fontWeight: 600, color: "#3730a3" }}>
              <span style={{ fontWeight: 800 }}>{opt.key}.</span> {opt.label}
            </span>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((row) => {
            const chosen = matchMap[row.key];
            return (
              <div key={row.key}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, background: chosen ? "#f0fdf4" : "#fafafa" }}>
                <span style={{ fontWeight: 800, color: "#3730a3", minWidth: 24, fontSize: 14 }}>{row.key}.</span>
                <span style={{ flex: 1, fontSize: 14, color: "#1a1a2e" }}>{row.label}</span>
                <select
                  value={chosen || ""}
                  onChange={(e) => updateMatch(row.key, e.target.value)}
                  style={{ padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${chosen ? "#6ee7b7" : "#d1d5db"}`, fontSize: 13, background: "#fff", fontFamily: "inherit", minWidth: 90, cursor: "pointer" }}>
                  <option value="">— match —</option>
                  {options.map((opt) => (
                    <option key={opt.key} value={opt.key}>{opt.key}. {opt.label}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
          Matched: {Object.keys(matchMap).filter(k => matchMap[k]).length} / {rows.length}
        </div>
      </div>
    );
  }

  // ── OPEN / ESSAY (default) ─────────────────────────────────────────────────
  return (
    <div style={{ marginTop: 16 }}>
      <textarea
        style={S.textarea}
        placeholder="Write your answer here..."
        value={textValue}
        onChange={(e) => {
          setTextValue(e.target.value);
          saveAnswer(e.target.value);
        }}
      />
    </div>
  );
}



/* ────────────────────────────────────────────────────────────
   Normalising a passage value
   The parser has written this field under several names and
   shapes over time, so coerce rather than assume.
   ──────────────────────────────────────────────────────────── */

const CONTEXT_FIELDS = [
  'context', 'parentContext', 'passage', 'stimulus',
  'sourceText', 'comprehensionText', 'extract', 'preamble', 'instructions',
];

function normalize(value) {
  if (value == null) return '';

  // Array of paragraphs, or array of { text } blocks
  if (Array.isArray(value)) {
    return value
      .map(v => (typeof v === 'string' ? v : v?.text || v?.content || ''))
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }

  // Object wrapper — never let this reach React, it throws
  if (typeof value === 'object') {
    return normalize(value.text ?? value.content ?? value.body ?? '');
  }

  // A whitespace-only string is truthy but renders as nothing.
  // Trimming here is what turns an invisible bug into a clean null.
  return String(value).trim();
}

function pickFrom(doc, fields = CONTEXT_FIELDS) {
  if (!doc) return '';
  for (const f of fields) {
    const text = normalize(doc[f]);
    if (text) return text;
  }
  return '';
}

/**
 * Resolve the passage a question depends on.
 *
 * @param question      the question being displayed
 * @param allQuestions  every question in the exam, for parent lookup
 */
export function resolveContext(question, allQuestions = []) {
  if (!question) return '';

  // 1. Passage stored directly on the question
  const direct = pickFrom(question);
  if (direct) return direct;

  // 2. Passage stored on a parent row this question points at
  const parentKey =
    question.parentId ??
    question.parentQuestionId ??
    question.parentNumber ??
    question.sectionId ??
    question.groupId;

  if (parentKey == null) return '';

  const parent = allQuestions.find(q =>
    q.id === parentKey ||
    q.questionId === parentKey ||
    String(q.questionNumber ?? q.number ?? '') === String(parentKey)
  );

  if (!parent) return '';

  // The parent may hold it in a context field, or the passage may simply be
  // the parent's own question text (a header row carrying the extract).
  return pickFrom(parent) || pickFrom(parent, ['questionText', 'text', 'question', 'body']);
}

/* ────────────────────────────────────────────────────────────
   Panel
   ──────────────────────────────────────────────────────────── */

function ParentContextPanel({ context, debug = false }) {
  const text = normalize(context);
  const [open, setOpen] = React.useState(true);

  // Nothing to show. In dev, say so rather than vanishing — a silently
  // absent passage is why this was hard to spot.
  if (!text) {
    if (!debug) return null;
    return (
      <div style={{
        marginBottom: 16, padding: '10px 14px', borderRadius: 10,
        border: '1.5px dashed #f87171', background: '#fef2f2',
        fontSize: 11, color: '#991b1b', fontWeight: 700,
      }}>
        No passage resolved. Received: {JSON.stringify(context)?.slice(0, 120) || 'undefined'}
      </div>
    );
  }

  return (
    <div style={{
      marginBottom: 16, borderRadius: 10,
      border: '1.5px solid #fcd34d', background: '#fffbeb', overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', padding: '8px 14px', background: 'none',
          border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
          color: '#92400e', textTransform: 'uppercase', letterSpacing: 1,
        }}
      >
        <span>📄 Read this before answering</span>
        <span>{open ? '▲ Hide' : '▼ Show'}</span>
      </button>
      {open && (
        <div style={{
          padding: '8px 14px 14px', fontSize: 13, color: '#374151',
          lineHeight: 1.7, whiteSpace: 'pre-wrap', borderTop: '1px solid #fde68a',
          maxHeight: 260, overflowY: 'auto',
        }}>
          {text}
        </div>
      )}
    </div>
  );
}


// ─── MarkdownTable Component ──────────────────────────────────────────────
function MarkdownTable({ source }) {
  if (!source) return null;
  const lines = source.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return <pre style={{ fontSize: 13, overflowX: 'auto' }}>{source}</pre>;

  const parseRow = (line) =>
    line.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);

  const headers = parseRow(lines[0]);
  const rows = lines.slice(2).map(parseRow); // skip the separator line

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i} style={{ padding: '8px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', fontWeight: 700, textAlign: 'left' }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : '#f8fafc' }}>
            {row.map((cell, ci) => (
              <td key={ci} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', fontVariantNumeric: 'tabular-nums' }}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QUESTION CONTENT  (outside parent — stable reference)
// ─────────────────────────────────────────────────────────────────────────────
function QuestionContent({ question, index, totalQ, answers, skipped, saveAnswer, onPrev, onNext, onSkip, onSubmit, onOpenDrawer, saving, cardStyle }) {

  useEffect(() => {
    if (window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise().catch(console.error);
    }
  }, [question?.questionLatex, question?.question_number]);

  if (!question) return null;

  return (
    <div style={cardStyle}>
      {/* Section badge */}
      <div>
        <span style={S.secBadge}>
          Section {question.section}{question.section_title ? ` — ${question.section_title}` : ""}
        </span>
        {question.section_instructions && (
          <p style={{ fontSize: 12, color: "#6b7280", margin: "4px 0 10px" }}>{question.section_instructions}</p>
        )}
        {question.section_total_marks && (
          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 10px" }}>
            Section total: <b>{question.section_total_marks} marks</b>
          </p>
        )}
      </div>

      {question.parent_question && <div style={S.parentHd}>{question.parent_question}</div>}
      {question.parent_context && <div style={S.context}>📌 {question.parent_context}</div>}

      <div style={S.qRow}>
        <div style={S.qNum}>Q {index + 1}</div>
        {question.parentContext && (
          <ParentContextPanel context={question.parentContext} />
        )}
        <div style={S.qText}>{question.text}</div>
        <div style={S.qMark}>[{question.marks || 0} Marks]</div>
      </div>

      {/* Diagram / graph / figure from page render */}
      {question.questionImageUrl && (
        <img
          src={question.questionImageUrl}
          alt="Exam figure"
          style={{
            width: '100%',
            maxHeight: 400,
            objectFit: 'contain',
            borderRadius: 12,
            border: '1.5px solid #e5e7eb',
            marginBottom: 16,
            display: 'block',
          }}
        />
      )}

      {/* Accounting / data table from markdown */}
      {question.questionTable && (
        <div style={{ overflowX: 'auto', marginBottom: 16, borderRadius: 10, border: '1.5px solid #e5e7eb' }}>
          <MarkdownTable source={question.questionTable} />
        </div>
      )}

      {/* Mathematics equations — MathJax processes $...$ and $$...$$ */}
      {question.questionLatex && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            background: '#f8f9ff',
            border: '1.5px solid #e0e7ff',
            borderRadius: 10,
            fontSize: 15,
            lineHeight: 1.8,
            overflowX: 'auto',
            fontFamily: 'serif',
          }}
          dangerouslySetInnerHTML={{ __html: question.questionLatex }}
        />
      )}

      {/* ✅ key={index} resets InputContent's internal state on question change */}
      <InputContent
        key={index}
        question={question}
        savedAnswer={answers[index] || ""}
        saveAnswer={saveAnswer}
      />

      {skipped.has(index) && (
        <div style={{ background: "#fef9c3", borderRadius: 8, padding: "7px 12px", fontSize: 13, color: "#92400e", marginTop: 12, marginBottom: 8 }}>
          ⏭ You skipped this question — you can still answer it.
        </div>
      )}

      <div style={S.navBar}>
        <button style={{ ...S.btn, ...S.btnSec }} onClick={onPrev} disabled={index === 0}>⬅ Back</button>

        {index < totalQ - 1 ? (
          <button style={{ ...S.btn, ...S.btnPri }} onClick={onNext}>Save & Next ➡</button>
        ) : (
          <button style={{ ...S.btn, ...S.btnPri, background: "#10b981" }} onClick={onSubmit} disabled={saving}>
            {saving ? "Submitting..." : "🏁 Finish & Submit"}
          </button>
        )}

        {index < totalQ - 1 && !answers[index] && (
          <button style={S.btnSkip} onClick={onSkip}>Skip Question ⏭</button>
        )}

        <button style={{ ...S.btn, ...S.btnGhost, marginLeft: "auto" }} onClick={onOpenDrawer}>
          🔢 Navigator ({Object.keys(answers).length}/{totalQ})
        </button>
      </div>
    </div>
  );
}

// ─── Missing Options Normalization Helper ────────────────────────────────────
function convertOptions(rawOptions) {
  // 1. Guard against empty, null, or undefined options
  if (!rawOptions) return [];

  // 2. If it's already an array of structured key-value pairs, return it as-is
  if (Array.isArray(rawOptions) && rawOptions.length > 0 && typeof rawOptions[0] === 'object' && 'key' in rawOptions[0]) {
    return rawOptions;
  }

  // 3. If it's a flat array of strings (e.g., ["Server", "Switch", "Router", "Hub"])
  if (Array.isArray(rawOptions)) {
    const alphabet = ["A", "B", "C", "D", "E", "F"];
    return rawOptions.map((opt, index) => {
      // If the string already starts with "A. ", "B. ", extract the value cleanly
      if (typeof opt === 'string' && /^[A-F]\s*[\.\)]\s*/i.test(opt)) {
        const matches = opt.match(/^([A-F])\s*[\.\)]\s*(.*)/i);
        return {
          key: matches[1].toUpperCase(),
          value: matches[2].trim()
        };
      }
      // Otherwise assign a sequential letter A, B, C...
      return {
        key: alphabet[index] || `Option_${index + 1}`,
        value: typeof opt === 'object' ? JSON.stringify(opt) : String(opt)
      };
    });
  }

  // 4. If the backend stored it as a key-value dictionary object (e.g., {A: "Server", B: "Switch"})
  if (typeof rawOptions === 'object') {
    return Object.keys(rawOptions).sort().map(key => ({
      key: key.toUpperCase(),
      value: String(rawOptions[key])
    }));
  }

  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATOR DRAWER  (outside parent — stable reference)
// ─────────────────────────────────────────────────────────────────────────────
function NavigatorDrawer({ totalQ, index, answers, skipped, question, onGoTo, onClose }) {
  const dotStyle = (i) => ({
    ...S.qDot,
    background: i === index ? "#6366f1" : skipped.has(i) ? "#fef9c3" : answers[i] ? "#d1fae5" : "#f9fafb",
    color: i === index ? "#fff" : skipped.has(i) ? "#92400e" : answers[i] ? "#065f46" : "#374151",
    borderColor: i === index ? "#6366f1" : skipped.has(i) ? "#fde68a" : answers[i] ? "#6ee7b7" : "#e5e7eb",
    transform: i === index ? "scale(1.15)" : "scale(1)",
    transition: "all .15s",
  });

  return (
    <div style={S.drawer}>
      <div style={S.drawerHd}>
        <span>Questions</span>
        <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }} onClick={onClose}>✕</button>
      </div>
      {question && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "#f9fafb", borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 8 }}>
            CURRENT SECTION: {question.section || "—"}
          </div>
          <button style={{ ...S.btnSkip, width: "100%" }}
            onClick={() => {
              const nxt = [...Array(totalQ).keys()].find(i => i > index && !answers[i]);
              onGoTo(nxt !== undefined ? nxt : Math.min(index + 1, totalQ - 1));
              onClose();
            }}>
            ⏭ Skip to Next Unanswered
          </button>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, fontSize: 11 }}>
        {[["#d1fae5", "Answered"], ["#fef9c3", "Skipped"], ["#f9fafb", "Not answered"], ["#6366f1", "Current"]].map(([c, l]) => (
          <span key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: c, display: "inline-block", border: "1px solid #e5e7eb" }} />{l}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap" }}>
        {[...Array(totalQ)].map((_, i) => (
          <span key={i} style={dotStyle(i)}
            onClick={() => { onGoTo(i); onClose(); }}
            title={`Q${i + 1}${answers[i] ? " ✓" : ""}${skipped.has(i) ? " (skipped)" : ""}`}>
            {i + 1}
          </span>
        ))}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// EXIT MODAL  (outside parent — stable reference)
// ─────────────────────────────────────────────────────────────────────────────
function ExitModal({ answeredCount, totalQ, onClose, onExit }) {
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalIcon}>⚠️</div>
        <div style={S.modalTitle}>Exit Exam?</div>
        <div style={S.modalSub}>
          You have answered <b>{answeredCount}</b> of <b>{totalQ}</b> questions.
          <br />Your progress will be <b>lost</b> if you exit now.
        </div>
        <div style={S.modalBtns}>
          <button style={{ ...S.btn, ...S.btnSec, minWidth: 120 }} onClick={onClose}>← Keep Going</button>
          <button style={{ ...S.btn, ...S.btnDanger, minWidth: 120 }} onClick={onExit}>🚪 Exit Exam</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function AIExamMocker({ student }) {
  const containerRef = useRef(null);
  const [exams, setExams] = useState([]);
  const [selectedExam, setSelectedExam] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [totalQ, setTotalQ] = useState(0);

  const [examDurationSeconds, setExamDurationSeconds] = useState(0);
  const [timerKey, setTimerKey] = useState(0);
  const [timeExpired, setTimeExpired] = useState(false);

  const [question, setQuestion] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [skipped, setSkipped] = useState(new Set());

  const [started, setStarted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);

  const [agentQuestion, setAgentQuestion] = useState("");
  const [agentReply, setAgentReply] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const answersRef = useRef({});
  const STUDENT_ID = useStudentId();
  const [studentInfo, setStudentInfo] = useState(null);


  useEffect(() => {
    if (!STUDENT_ID || !auth.currentUser) return;
    const q = query(
      collection(db, 'students'),
      where('uid', '==', auth.currentUser.uid),
      limit(1)
    );
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const doc = snap.docs[0];
        setStudentInfo({ id: doc.id, ...doc.data() });
      }
    });
    return unsub;
  }, [STUDENT_ID]);


  // ── Real-time exam list — scoped to the student's own school ──────────────
  useEffect(() => {
    if (!studentInfo?.schoolId) return;

    const q = query(
      collection(db, "exams"),
      where("status", "==", "ready"),
      where("schoolId", "==", studentInfo.schoolId),
      orderBy("extractedAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data(), title: d.data().title || "Untitled Paper" }));
      setExams(list);
      if (list.length > 0) setSelectedExam((c) => c || list[0].id);
    }, console.error);
    return () => unsub();
  }, [studentInfo?.schoolId]);

  // Temporary debug — remove after fix
  useEffect(() => {
    console.log("[state] started:", started, "totalQ:", totalQ, "question:", question?.id);
  }, [started, totalQ, question]);

  // ── Fullscreen ─────────────────────────────────────────────────────────────
  const enterFullscreen = useCallback(() => {
    const el = containerRef.current || document.documentElement;
    (el.requestFullscreen || el.webkitRequestFullscreen || (() => { })).call(el);
    setIsFullscreen(true);
  }, []);

  const exitFullscreen = useCallback(() => {
    (document.exitFullscreen || document.webkitExitFullscreen || (() => { })).call(document);
    setIsFullscreen(false);
  }, []);

  useEffect(() => {
    const h = () => { if (!document.fullscreenElement && !document.webkitFullscreenElement) setIsFullscreen(false); };
    document.addEventListener("fullscreenchange", h);
    document.addEventListener("webkitfullscreenchange", h);
    return () => { document.removeEventListener("fullscreenchange", h); document.removeEventListener("webkitfullscreenchange", h); };
  }, []);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!started || submitted) return;
    const h = (e) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") goToOffset(1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") goToOffset(-1);
      if (e.key === "Escape" && isFullscreen) exitFullscreen();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [started, submitted, index, totalQ, isFullscreen]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goTo = useCallback((i) => {
    const q = (window.__examQuestions || [])[i];
    if (!q) return;
    setQuestion(q);
    setIndex(i);
  }, []);

  const goToOffset = (offset) => {
    setIndex((cur) => {
      const next = cur + offset;
      if (next < 0 || next >= totalQ) return cur;
      const q = (window.__examQuestions || [])[next];
      if (q) setQuestion(q);
      return next;
    });
  };

  const skipQuestion = () => {
    // ✅ Only mark as skipped if not already answered
    if (!answers[index]) {
      setSkipped((prev) => new Set([...prev, index]));
    }
    if (index < totalQ - 1) goTo(index + 1);
  };

  // ── Save answer ────────────────────────────────────────────────────────────
  const saveAnswer = useCallback((val) => {
    setAnswers((prev) => {
      const updated = { ...prev, [index]: val };
      answersRef.current = updated;
      return updated;
    });

    // ✅ Remove from skipped once the student starts answering
    setSkipped((prev) => {
      if (!prev.has(index)) return prev;
      const next = new Set(prev);
      next.delete(index);
      return next;
    });

    clearTimeout(window.__saveTimeout);
    window.__saveTimeout = setTimeout(() => {
      fetch(`${API}/autosave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exam_id: selectedExam,
          student_id: STUDENT_ID,
          answers: answersRef.current,
        }),
      }).catch(console.error);
    }, 800);
  }, [index, selectedExam]);

  // ── Start exam ─────────────────────────────────────────────────────────────
  const startExam = async () => {
    const token = await auth.currentUser?.getIdToken(true);
    if (!selectedExam) return;
    setLoading(true);

    try {
      const examId = typeof selectedExam === "string"
        ? selectedExam
        : selectedExam?.examId || selectedExam?.id;

      if (!examId) throw new Error("Invalid exam selected");

      console.log("[startExam] hitting:", `${API}/start_exam`);
      console.log("[startExam] payload:", { exam_id: examId, student_id: STUDENT_ID });

      const res = await fetch(`${API}/start_exam`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ exam_id: examId, student_id: STUDENT_ID }),
      });

      console.log("[startExam] status:", res.status, res.ok);

      const text = await res.text();
      console.log("[startExam] raw response:", text.slice(0, 500));

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`JSON parse failed: ${text.slice(0, 200)}`);
      }

      console.log("[startExam] parsed data keys:", Object.keys(data));
      console.log("[startExam] error field:", data.error);
      console.log("[startExam] questions count:", data.questions?.length);
      console.log("[startExam] session_id:", data.session_id);

      if (data.error) throw new Error(data.error);

      if (!data.questions || data.questions.length === 0) {
        throw new Error("No questions returned from server");
      }

      const normalized = data.questions.map((q, idx) => ({
        ...q,
        id: q.id || `q_${idx}`,
        text: q.question,
        type: normalizeType(q.type),
        marks: q.marks || 1,
        options: q.options || [],
        section: q.section || "Section A",
        order: idx,
        questionLatex: q.question_latex || null,
        questionTable: q.question_table || null,
        parentContext: q.parent_context || null,
        parentQuestion: q.parent_question || null,
        columnA: q.column_a || null,
        columnB: q.column_b || null,
        hasVisual: q.has_visual || false,
      }));

      console.log("[startExam] normalized[0]:", normalized[0]);

      window.__examQuestions = normalized;
      answersRef.current = {};
      setSessionId(data.session_id);
      setExamDurationSeconds((data.exam_duration_minutes || 60) * 60);
      setTimerKey((k) => k + 1);
      setTimeExpired(false);
      setAnswers({});
      setSkipped(new Set());
      setAgentReply("");
      setTotalQ(normalized.length);
      setQuestion(normalized[0]);
      setIndex(0);
      setStarted(true);  // ← this flips the view

      console.log("[startExam] ✅ done — started=true, totalQ=", normalized.length);

    } catch (err) {
      console.error("[startExam] ❌ error:", err.message);
      alert(err.message || "Failed to start exam");
    } finally {
      setLoading(false);
    }
  };

  // ── Timer expiry ───────────────────────────────────────────────────────────
  const handleTimeExpired = useCallback(() => {
    setTimeExpired(true);
    if (isFullscreen) exitFullscreen();
  }, [isFullscreen, exitFullscreen]);

  // Removes undefined from an object
  function removeUndefined(obj) {
    return Object.fromEntries(
      Object.entries(obj).filter(([_, v]) => v !== undefined)
    );
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  const submitExam = async () => {

    // ── Auth guard ──────────────────────────────────────────────────────
    if (!auth.currentUser) {
      alert('Session expired. Please sign in again.');
      return;
    }
    const uid = auth.currentUser.uid;

    // ── Unanswered check ────────────────────────────────────────────────
    if (!timeExpired) {
      const unanswered = totalQ - Object.keys(answers).length;
      if (
        unanswered > 0 &&
        !confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)
      ) return;
    }

    setSaving(true);
    setTimeExpired(false);
    if (isFullscreen) exitFullscreen();

    try {
      // ── Fresh token ────────────────────────────────────────────────────
      const token = await auth.currentUser.getIdToken(true);

      // ── Call Flask /submit ─────────────────────────────────────────────
      const res = await fetch(`${API}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_id: sessionId,
          exam_id: selectedExam,
          student_id: STUDENT_ID,
          answers,
        }),
      });

      const data = await res.json();
      console.log('[Submit] response:', data);

      if (!res.ok || data.error) {
        alert(data.error || 'Submission failed. Please try again.');
        return;   // finally still runs — setSaving(false) is called
      }

      // ── Build Firestore document ───────────────────────────────────────
      // Use uid (verified non-null above) everywhere — no optional chaining needed
      const saveData = removeUndefined({
        // Identity — both fields needed for Firestore rule evaluation
        studentId: STUDENT_ID,
        studentUid: uid,                         // ← consistent, verified
        schoolId: studentInfo?.schoolId || null,

        // Exam reference
        examId: selectedExam,
        subject: data.subject || '',
        title: data.title || data.subject || selectedExam,

        // Answers
        answers,
        skipped: [...skipped],
        answeredCount: Object.keys(answers).length,

        // Marks
        score: data.score,
        total: data.total,
        percentage: data.percentage,
        markedResults: data.results || [],

        // AI feedback
        aiFeedback: data.feedback || '',
        conceptGaps: data.concept_gaps || [],
        overallSummary: data.analysis?.overallSummary || '',
        strengths: data.analysis?.strengths || [],
        weaknesses: data.analysis?.weaknesses || [],
        studyPlan: data.analysis?.studyPlan || [],
        analysis: {
          ...(data.analysis || {}),
          conceptGaps: data.concept_gaps || [],
        },

        // Timestamps
        submittedAt: serverTimestamp(),
        completedAt: serverTimestamp(),

        metadata: {
          markingVersion: 2,
          generatedAt: new Date().toISOString(),
        },
      });

      // ── Write to Firestore ─────────────────────────────────────────────
      // Deterministic doc ID prevents duplicate submissions
      const attemptRef = doc(
        db,
        'exam_attempts',
        `${uid}_${selectedExam}`      // ← use uid not STUDENT_ID for consistency
      );
      await setDoc(attemptRef, saveData, { merge: true });
      console.log('[Submit] Saved to Firestore:', attemptRef.id);

      // ── NOTE: auditLog write removed ───────────────────────────────────
      // Firestore rules have allow write: if false on auditLog.
      // The Flask /submit endpoint writes to auditLog via Admin SDK.
      // Client-side auditLog writes always fail with permission-denied.

      setResults(data);
      setSubmitted(true);

    } catch (err) {
      console.error('[Submit] failed:', err);
      alert(err.message || 'Network error. Please try again.');
    } finally {
      setSaving(false);   // ← always runs — button never stays stuck
    }
  };

  // ── Cancel ─────────────────────────────────────────────────────────────────
  const cancelExam = () => {
    if (isFullscreen) exitFullscreen();
    setShowExitModal(false); setStarted(false); setSubmitted(false); setResults(null);
    setQuestion(null); setAnswers({}); setSkipped(new Set()); answersRef.current = {};
    setSessionId(null); setIndex(0); setAgentReply("");
    setTimeExpired(false); setExamDurationSeconds(0);
  };

  // ── Agent ──────────────────────────────────────────────────────────────────
  const askAgent = async () => {
    const q = agentQuestion.trim();
    if (!q || agentLoading) return;
    setAgentLoading(true); setAgentReply("");
    try {
      const res = await fetch(`${API}/agent-chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ student_id: STUDENT_ID, message: q }) });
      const data = await res.json();
      setAgentReply(data.response || data.answer || "No response.");
    } catch { setAgentReply("⚠️ Could not reach the agent."); }
    finally { setAgentLoading(false); setAgentQuestion(""); }
  };

  // ── Landing screen ─────────────────────────────────────────────────────────
  if (!started && !submitted) {
    return (
      <div style={S.wrap}>
        <FontLoader />
        <div style={S.card}>
          <h1 style={S.title}>Eduket AI Exam Engine</h1>
          <p style={S.subtitle}>Select an active paper to begin your exam simulation.</p>
          <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "20px 0" }} />
          <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 6 }}>Available Assessments:</label>
          <select style={S.select} value={selectedExam} onChange={(e) => setSelectedExam(e.target.value)}>
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.title} ({ex.subject || "No Subject"}) {ex.grade ? `— Grade ${ex.grade}` : ""}
              </option>
            ))}
          </select>
          {loading && <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 8 }}>⏳ Loading...</p>}
          <button
            style={{ ...S.startBtn, opacity: loading || !selectedExam ? 0.6 : 1 }}
            onClick={startExam}
            disabled={loading || !selectedExam}
          >
            {loading ? "Loading exam..." : "▶ Start Exam"}
          </button>
        </div>
      </div>
    );
  }

  // ── Results screen ──────────────────────────────────────────────────────────
  if (submitted && results) {
    const pct = results.percentage ?? 0;
    const scoreColor = pct >= 75 ? "#10b981" : pct >= 50 ? "#6366f1" : "#dc2626";

    return (
      <div style={S.wrap}>
        <FontLoader />

        <div style={{ ...S.scoreBanner, background: `linear-gradient(135deg, ${scoreColor}, ${scoreColor}cc)` }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>
            {pct >= 75 ? "🏆" : pct >= 50 ? "👍" : "📚"}
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-1px" }}>{pct}%</div>
          <div style={{ fontSize: 16, opacity: 0.9, marginTop: 4 }}>{results.score} / {results.total} marks</div>
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 8 }}>{results.subject || "Exam"} · {STUDENT_ID}</div>
        </div>

        {results.feedback && (
          <div style={S.card}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#6b7280", marginBottom: 8 }}>
              🤖 AI Feedback
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: "#374151" }}>{results.feedback}</p>
          </div>
        )}

        <div style={S.card}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#6b7280", marginBottom: 16 }}>
            Question Breakdown
          </div>
          {(results.results ?? []).map((r, i) => {
            const correct = r.status === "correct";
            const partial = r.status === "partial";
            const bg = correct ? "#f0fdf4" : partial ? "#fffbeb" : "#fef2f2";
            const border = correct ? "#86efac" : partial ? "#fde68a" : "#fca5a5";
            const icon = correct ? "✅" : partial ? "⚠️" : "❌";
            return (
              <div key={i} style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{icon} Q{r.question_number}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>{r.earned}/{r.marks} marks</span>
                </div>
                <p style={{ fontSize: 13, color: "#374151", marginBottom: 6 }}>{r.question}</p>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  <span style={{ fontWeight: 600 }}>Your answer: </span>
                  <span style={{ color: correct ? "#059669" : "#dc2626" }}>{r.student_answer}</span>
                </div>
                {!correct && (
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    <span style={{ fontWeight: 600 }}>Correct: </span>
                    <span style={{ color: "#059669" }}>{r.correct_answer}</span>
                  </div>
                )}
                {r.feedback && (
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4, fontStyle: "italic" }}>{r.feedback}</div>
                )}
              </div>
            );
          })}
        </div>

        {/* AI Coach Panel — add inside the results screen, after the question breakdown card */}
        <div style={S.card}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#6b7280", marginBottom: 8 }}>
            🤖 Ask Your AI Coach
          </div>
          <input
            style={S.agentInput}
            placeholder="e.g. Explain my weakest topic, or create a study plan..."
            value={agentQuestion}
            onChange={(e) => setAgentQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && askAgent()}
          />
          <button
            style={{ ...S.btn, ...S.btnPri, marginTop: 10, width: "100%" }}
            onClick={askAgent}
            disabled={agentLoading || !agentQuestion.trim()}
          >
            {agentLoading ? "⏳ Thinking..." : "Ask Coach →"}
          </button>
          {agentReply && (
            <div style={{ marginTop: 14, padding: "14px 16px", background: "#eef2ff", borderRadius: 10, fontSize: 14, lineHeight: 1.7, color: "#1e1b4b" }}>
              {agentReply}
            </div>
          )}
        </div>

        {/* AI Result Analysis */}
        {results.analysis && results.analysis.overallSummary && (
          <div style={S.card}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#6b7280", marginBottom: 8 }}>
              🧠 AI Learning Analysis
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: "#374151", marginBottom: 12 }}>
              {results.analysis.overallSummary}
            </p>

            {results.analysis.strengths?.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#059669", marginBottom: 4 }}>✅ Strengths</div>
                {results.analysis.strengths.map((s, i) => (
                  <div key={i} style={{ fontSize: 13, color: "#374151", padding: "4px 0" }}>• {s}</div>
                ))}
              </div>
            )}

            {results.analysis.weaknesses?.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", marginBottom: 4 }}>⚠️ Areas to Improve</div>
                {results.analysis.weaknesses.map((w, i) => (
                  <div key={i} style={{ fontSize: 13, color: "#374151", padding: "4px 0" }}>• {w}</div>
                ))}
              </div>
            )}

            {results.analysis.studyPlan?.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#6366f1", marginBottom: 4 }}>📚 Study Plan</div>
                {results.analysis.studyPlan.map((step, i) => (
                  <div key={i} style={{ fontSize: 13, color: "#374151", padding: "4px 0" }}>
                    {i + 1}. {typeof step === "string" ? step : step.task || step.topic || JSON.stringify(step)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          style={{ ...S.btn, ...S.btnPri, width: "100%", padding: 14, fontSize: 15, marginBottom: 24 }}
          onClick={() => {
            setSubmitted(false); setStarted(false); setResults(null);
            setAnswers({}); answersRef.current = {};
            setSkipped(new Set()); setQuestion(null);
            setIndex(0); setSessionId(null);
            setTimeExpired(false); setExamDurationSeconds(0);
          }}
        >
          ✅ Done — Back to Exams
        </button>
      </div>
    );
  }

  // ── Active exam ─────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} style={isFullscreen ? S.wrapFull : S.wrap}>
      <FontLoader />

      {timeExpired && (
        <TimeUpModal answeredCount={Object.keys(answers).length} totalQ={totalQ} onSubmit={submitExam} />
      )}
      {showExitModal && (
        <ExitModal answeredCount={Object.keys(answers).length} totalQ={totalQ} onClose={() => setShowExitModal(false)} onExit={cancelExam} />
      )}
      {drawerOpen && (
        <NavigatorDrawer totalQ={totalQ} index={index} answers={answers} skipped={skipped} question={question} onGoTo={goTo} onClose={() => setDrawerOpen(false)} />
      )}

      {isFullscreen && (
        <div style={S.topBar}>
          <span style={S.topBarTitle}>📝 Exam in Progress</span>
          {examDurationSeconds > 0 && <ExamTimer key={timerKey} totalSeconds={examDurationSeconds} onExpire={handleTimeExpired} compact />}
          <button style={{ ...S.btn, ...S.btnDanger, padding: "5px 12px", fontSize: 12 }} onClick={() => setShowExitModal(true)}>🚪 Exit</button>
        </div>
      )}

      <div style={isFullscreen ? S.cardFull : S.card}>
        {!isFullscreen && (
          <div style={{ display: "flex", alignItems: "start", gap: 16, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ ...S.title, fontSize: 20 }}>Exam in Progress</h2>
              <p style={S.subtitle}>Answer all questions and submit when ready.</p>
            </div>
            <button style={{ ...S.btn, ...S.btnSec, fontSize: 12 }} onClick={enterFullscreen}>📺 Focus View</button>
            <button style={{ ...S.btn, ...S.btnDanger, fontSize: 12 }} onClick={() => setShowExitModal(true)}>🚪 Exit</button>
          </div>
        )}

        {!isFullscreen && examDurationSeconds > 0 && (
          <ExamTimer key={timerKey} totalSeconds={examDurationSeconds} onExpire={handleTimeExpired} />
        )}

        <QuestionContent
          question={question}
          index={index}
          totalQ={totalQ}
          answers={answers}
          skipped={skipped}
          saveAnswer={saveAnswer}
          onPrev={() => goTo(index - 1)}
          onNext={() => goTo(index + 1)}
          onSkip={skipQuestion}
          onSubmit={submitExam}
          onOpenDrawer={() => setDrawerOpen(true)}
          saving={saving}
          cardStyle={isFullscreen ? S.cardFull : {}}
        />
      </div>
    </div>
  );
}
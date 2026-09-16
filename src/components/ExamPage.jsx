import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { addDoc, collection, query, onSnapshot, where, orderBy, limit, getCountFromServer } from "firebase/firestore";
import { db, auth } from "../utils/firebase";
import { signOut } from "firebase/auth";
import ExamResultsDisplay from "./ExamResultsDisplay";
import { Sun, Moon, LogOut, Clock, BookOpen, Sparkles, X, FileText } from "lucide-react";
import CATTutor from '../utils/CATTutor';
import AIExamMocker from '../utils/AIExamMocker';
import { ResultsTab } from './ResultsTab';



const API = import.meta.env.VITE_API_URL;

// SweetAlert2 Configuration
const swal = Swal.mixin({
  confirmButtonColor: "#10b981",
  cancelButtonColor: "#ef4444",
});

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function AssignmentDueStrip({ dueDate }) {
  const [remaining, setRemaining] = React.useState(() => calcRemaining(dueDate));

  function calcRemaining(target) {
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
    if (!dueDate) return;
    const interval = setInterval(() => setRemaining(calcRemaining(dueDate)), 1000);
    return () => clearInterval(interval);
  }, [dueDate]);

  if (!remaining) return null;

  const critical = !remaining.expired && remaining.totalMs < 3600000;   // < 1 hr
  const warning = !remaining.expired && remaining.totalMs < 86400000;   // < 24 hrs
  const urgent = critical || remaining.expired;

  // Under 24 hrs: show precise HH:MM:SS, matching the exam timer's feel
  // Over 24 hrs: show "3d 14h left" — a ticking clock isn't useful that far out
  const display = remaining.expired
    ? 'Submission closed'
    : remaining.days > 0
      ? `${remaining.days}d ${String(remaining.hours).padStart(2, '0')}h left`
      : `${String(remaining.hours).padStart(2, '0')}:${String(remaining.minutes).padStart(2, '0')}:${String(remaining.seconds).padStart(2, '0')}`;

  return (
    <div
      className={`flex items-center gap-4 px-6 py-2 rounded-2xl border
        ${urgent
          ? 'bg-red-500/10 border-red-400/30'
          : warning
            ? 'bg-amber-500/10 border-amber-400/30'
            : 'bg-white/10 border-white/20'
        }`}
    >
      <Clock
        size={20}
        className={urgent ? 'text-red-400 animate-pulse' : warning ? 'text-amber-400' : ''}
      />
      <span
        className={`text-2xl font-mono font-bold ${urgent ? 'text-red-400' : warning ? 'text-amber-400' : ''
          }`}
      >
        {display}
      </span>
    </div>
  );
}

export default function ExamPage({ studentInfo, addResult, setStudentInfo, isDark, toggleTheme }) {
  const navigate = useNavigate();

  const [started, setStarted] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [examDurationSeconds, setExamDurationSeconds] = useState(3600);
  const [timerKey, setTimerKey] = useState(0);
  const [timeExpired, setTimeExpired] = useState(false);
  const [skipped, setSkipped] = useState(new Set());
  const [agentReply, setAgentReply] = useState("");
  const [totalQ, setTotalQ] = useState(0);
  const [question, setQuestion] = useState(null);
  const [index, setIndex] = useState(0);
  // At the top of your component:
  const sessionIdRef = useRef(null);



  // Exam Logic State
  const [selectedExam, setSelectedExam] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15 * 60);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [examView, setExamView] = useState("new");

  // User & Points State
  const [user, setUser] = useState(null);
  const [didAward, setDidAward] = useState(false);

  // Anti-Cheat & UI
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [unansweredIds, setUnansweredIds] = useState(new Set());
  const [focusStrikes, setFocusStrikes] = useState(0);
  const [disqualified, setDisqualified] = useState(false);
  const [showTutor, setShowTutor] = useState(false);
  const [activeTool, setActiveTool] = useState(null); // 'tutor' | 'exam' | null

  const questionRefs = useRef({});
  const isSubmittingRef = useRef(false);
  const lastFocusEventTsRef = useRef(0);

  const examActive = authenticated && selectedExam && !submitted;
  // Grade Filtering Logic
  const [dynamicExams, setDynamicExams] = useState([]);
  const [seenExams, setSeenExams] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("seenExams") || "[]");
    } catch {
      return [];
    }
  });
  const studentName = studentInfo?.name;
  // ─── NEW STATE: track this student's completed attempts ──────────────────
  // Keyed by exam title, since that's what actuallySubmitExam() stores on
  // the examResults doc (result.exam = selectedExam.title) -- there's no
  // examId field on that document to key by instead.
  const [attemptedMap, setAttemptedMap] = useState({});
  const [loading, setLoading] = useState(false);

  // ─── LISTEN FOR THIS STUDENT'S PAST ATTEMPTS ──────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, "examResults"),
      where("studentId", "==", user.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      const map = {};
      snap.docs.forEach((doc) => {
        const data = doc.data();
        const title = data.exam;
        if (!title) return;
        // Keep the most recent attempt per exam title.
        const existing = map[title];
        if (!existing || (data.completedTime || "") > (existing.completedTime || "")) {
          map[title] = {
            completedTime: data.completedTime || null,
            percentage: data.percentage,
            score: data.score,
            total: data.total,
          };
        }
      });
      setAttemptedMap(map);
    });

    return () => unsub();
  }, [user?.uid]);

  // ─── SPLIT INTO PENDING vs ALREADY-ATTEMPTED ──────────────────────────────
  const pendingExams = dynamicExams.filter((exam) => !attemptedMap[exam.title]);
  const completedExams = dynamicExams.filter((exam) => attemptedMap[exam.title]);

  // ─── FORMAT UPLOAD TIME ────────────────────────────────────────────────────
  const formatUploadTime = (iso) => {
    if (!iso) return "Unknown time";
    try {
      return new Date(iso).toLocaleString("en-ZA", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Unknown time";
    }
  };

  // Helper function to standardize question types from backend
  const normalizeType = (type) => {
    if (!type) return "mcq";
    const str = String(type).toLowerCase().trim();
    if (str.includes("mcq") || str.includes("multiple")) return "mcq";
    if (str.includes("true") || str.includes("false")) return "true_false";
    if (str.includes("match")) return "matching";
    if (str.includes("fill") || str.includes("blank")) return "fill_in_the_blank";
    return str;
  };


  // ─── AUTH & PROFILE SYNC ──────────────────────────────────────────────
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      setUser(u);

      if (!u) {
        localStorage.removeItem('user-session');
        return;
      }

      if (studentInfo && studentInfo.uid && studentInfo.uid !== u.uid) {
        setStudentInfo(null);
        localStorage.removeItem('user-session');
        return;
      }

    });
    return () => unsub();
  }, [studentInfo, didAward]);

  useEffect(() => {
    if (!studentInfo) navigate("/");
  }, [studentInfo, navigate]);



  // 2. Format Time Helper (HH:MM:SS or MM:SS)
  const formatTime = (totalSeconds) => {
    if (totalSeconds <= 0) return '00:00';
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const pad = (num) => String(num).padStart(2, '0');

    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  };

  // 3. Persistent Timer Effect
  useEffect(() => {
    const isAssignment = selectedExam?.type === 'assignment' || selectedExam?.assessmentType === 'assignment';
    if (!selectedExam || isAssignment) return;

    const storageKey = `exam_start_${selectedExam.id}`;
    const durationMins = Number(selectedExam.examDuration || selectedExam.duration || 60);
    const totalDurationSecs = durationMins * 60;

    // Track or resume the initial start time
    let startTime = localStorage.getItem(storageKey);
    if (!startTime) {
      startTime = Date.now().toString();
      localStorage.setItem(storageKey, startTime);
    }

    // Helper calculation to figure out exact seconds left against system clock
    const calculateSecondsLeft = () => {
      const elapsedSeconds = Math.floor((Date.now() - Number(startTime)) / 1000);
      const remaining = totalDurationSecs - elapsedSeconds;
      return remaining > 0 ? remaining : 0;
    };

    // Set initial calculated time
    setTimeLeft(calculateSecondsLeft());

    // Ticker loop
    const intervalId = setInterval(() => {
      const currentRemaining = calculateSecondsLeft();
      setTimeLeft(currentRemaining);

      if (currentRemaining <= 0) {
        clearInterval(intervalId);
        localStorage.removeItem(storageKey); // Clean up

        // 🚨 CRITICAL: Trigger the auto-submit function for the student here!
        if (typeof handleAutoSubmit === 'function') {
          handleAutoSubmit();
        }
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [selectedExam]);



  // ─── TIMER LOGIC ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!examActive) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          actuallySubmitExam(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [examActive]);

  // ─── EXAM SELECTION & PERMISSIONS ─────────────────────────────────────
  const handleSelectExam = (exam) => {
    const attemptsKey = `${studentInfo.name}_${exam.title}_attempts`;
    const attempts = parseInt(localStorage.getItem(attemptsKey) || "0", 10);

    if (attempts >= 3) {
      swal.fire({
        title: "Limit Reached",
        text: "You have already completed the maximum of 3 attempts for this revision test.",
        icon: "error",
        background: isDark ? '#111827' : '#fff',
        color: isDark ? '#fff' : '#000',
      });
      return;
    }

    swal.fire({
      title: `Start ${exam.title}?`,
      text: "Warning: Switching tabs or closing this window will result in disqualification.",
      icon: "info",
      showCancelButton: true,
      confirmButtonText: "Start Now",
      confirmButtonColor: "#22c55e",
      cancelButtonColor: "#ef4444",
      background: isDark ? '#111827' : '#fff',
      color: isDark ? '#fff' : '#000',
    }).then((result) => {
      if (result.isConfirmed) {
        setSelectedExam(exam);
        setAuthenticated(true);
        setTimeLeft(15 * 60);
        setAnswers({});
        setSubmitted(false);
        setFocusStrikes(0);
        setDisqualified(false);
      }
    });
  };

  // ─── ANTI-CHEAT ───────────────────────────────────────────────────────
  const handleFocusViolation = useCallback(() => {
    if (!examActive) return;
    const now = Date.now();
    if (now - lastFocusEventTsRef.current < 2000) return;
    lastFocusEventTsRef.current = now;

    setFocusStrikes((s) => {
      const next = s + 1;
      if (next === 1) {
        swal.fire("Warning", "Tab switch detected. One more switch = 0%.", "warning");
      } else if (next >= 2) {
        setDisqualified(true);
        actuallySubmitExam(true);
      }
      return next;
    });
  }, [examActive]);


  // ─── ANTI-CHEAT: BLOCK right-CLICK AND COPY + MONITOR TAB CLOSING ────────  
  useEffect(() => {
    if (!examActive) return;
    const block = (e) => e.preventDefault();
    document.addEventListener("contextmenu", block);
    document.addEventListener("copy", block);
    document.addEventListener("visibilitychange", handleFocusViolation);
    window.addEventListener("blur", handleFocusViolation);

    return () => {
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("copy", block);
      document.removeEventListener("visibilitychange", handleFocusViolation);
      window.removeEventListener("blur", handleFocusViolation);
    };
  }, [examActive, handleFocusViolation]);

  // ─── EARLY EXIT GRACE (NON-DESTRUCTIVE SAVE) ─────────────────────────────  
  useEffect(() => {
    const handleVisibilityChange = () => {
      // Guard — selectedExam may be null after submission or reset
      if (!selectedExam) return;

      const isAssignment = selectedExam.type === 'assignment'
        || selectedExam.assessmentType === 'assignment';
      if (isAssignment) return;

      if (document.hidden && !submitted) {
        actuallySubmitExam({ forceZero: false, isEarlyExit: true });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [answers, submitted, selectedExam]);

  // ─── SUBMISSION LOGIC ─────────────────────────────────────────────────
  const handleChange = (id, answer) => {
    setAnswers((prev) => ({ ...prev, [id]: answer }));
  };


  // ─── ACTUAL EXAM SUBMISSION (FIREBASE) ───────────────────────────────  
  const handleSubmitExam = () => {
    const qs = selectedExam?.question || [];
    const missing = qs.filter((q) => !answers[q.id]);

    // Check if this is an assignment or an exam
    const isAssignment = selectedExam.type === 'assignment' || selectedExam.assessmentType === 'assignment';

    if (missing.length > 0) {
      setTriedSubmit(true);
      setUnansweredIds(new Set(missing.map(q => q.id)));

      swal.fire({
        title: isAssignment ? "Unfinished Assignment" : "Unfinished Exam!",
        text: `You have ${missing.length} unanswered items left. Submit anyway?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Submit Anyway",
        cancelButtonText: "Go Back",
      }).then((res) => {
        if (res.isConfirmed) actuallySubmitExam({ forceZero: false, isEarlyExit: false });
      });
      return;
    }
    actuallySubmitExam({ forceZero: false, isEarlyExit: false });
  };

  const actuallySubmitExam = async ({ forceZero = false, isEarlyExit = false } = {}) => {
    if (isSubmittingRef.current || submitted) return;
    isSubmittingRef.current = true;
    setSubmitted(true);

    const qs = selectedExam?.question || [];
    let score = 0;

    // Calculate accurate score based on answers locked in up to this point
    const finalAnswers = qs.map((q) => {
      const isCorrect = answers[q.id] === q.correctAnswer;
      if (!forceZero && isCorrect) score++;
      return {
        question: q.question,
        answer: answers[q.id] || "No Answer",
        correct: isCorrect
      };
    });

    const totalQuestions = qs.length || 1; // Prevent division by zero errors
    const finalScore = forceZero ? 0 : score;
    const isAssignment = selectedExam.type === 'assignment' || selectedExam.assessmentType === 'assignment';

    const result = {
      studentId: user?.uid,
      name: studentInfo.firstName,
      grade: studentInfo.grade,
      exam: selectedExam.title,
      assessmentType: isAssignment ? 'assignment' : 'exam',
      score: finalScore,
      total: totalQuestions,
      percentage: ((finalScore / totalQuestions) * 100).toFixed(1),
      // Safely check if examDuration exists on the object, fallback to default 15 min calculation frame
      timeSpent: isAssignment ? "N/A" : formatTime((parseInt(selectedExam.examDuration) || 15) * 60 - timeLeft),
      completedTime: new Date().toISOString(),
      disqualified: forceZero,
      submittedViaExit: isEarlyExit // 📊 Meta-tag for teachers to see they closed the screen early
    };

    try {
      await addDoc(collection(db, "examResults"), result);

      // Increment localStorage tracking entries smoothly
      const key = `${studentInfo.firstName}_${selectedExam.title}_attempts`;
      localStorage.setItem(key, String(parseInt(localStorage.getItem(key) || "0") + 1));

      // Tailor sweetalert configurations to match context status
      let alertTitle = "Submitted Successfully!";
      let alertText = `Final Score: ${finalScore}/${totalQuestions} (${result.percentage}%)`;
      let alertIcon = "success";

      if (forceZero) {
        alertTitle = "Disqualified";
        alertText = "Test submitted with 0% due to security policy violations.";
        alertIcon = "error";
      } else if (isEarlyExit && !isAssignment) {
        alertTitle = "Exam Saved on Exit";
        alertText = `You navigated away. Your progress was locked in and graded. Score: ${finalScore}/${totalQuestions}`;
        alertIcon = "info";
      }

      swal.fire({
        title: alertTitle,
        text: alertText,
        icon: alertIcon
      }).then(() => navigate("/results"));
    } catch (e) {
      console.error("Save Error:", e);
      isSubmittingRef.current = false; // Release lock if submission fails
      setSubmitted(false);
    }
  };

  const handleLogout = () => {
    swal.fire({
      title: "Logout?",
      text: "Ready to take a break?",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Logout",
      background: isDark ? '#111827' : '#fff',
      color: isDark ? '#fff' : '#000',
    }).then((res) => {
      if (res.isConfirmed) {
        signOut(auth);
        setStudentInfo(null);
        localStorage.clear();
        navigate("/");
      }
    });
  };


  // ─── LISTEN FOR TEACHER UPLOADS ───────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    if (!studentInfo?.schoolId) {
      console.warn('[ExamPage] Student has no schoolId — cannot load exams');
      return;
    }

    // Query by schoolId only — filter grade/subject client-side.
    // Avoids composite index requirement and handles array subjects correctly.
    const q = query(
      collection(db, "exams"),
      where("schoolId", "==", studentInfo.schoolId),
      where("status", "==", "ready"),
      orderBy("uploadedAt", "desc"),
      limit(50)
    );

    const unsub = onSnapshot(q, (snap) => {
      const studentGrade = studentInfo.grade || '';
      const studentSubjects = Array.isArray(studentInfo.subjects)
        ? studentInfo.subjects.map(s => s.toLowerCase().trim())
        : (studentInfo.subject ? [studentInfo.subject.toLowerCase().trim()] : []);

      const exams = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(exam => {
          // Must be ready
          if (exam.status !== 'ready') return false;

          const normaliseGrade = (g) => {
            const s = String(g || '').toLowerCase().trim();
            // Extract the number: "form 4" → "4", "grade 12" → "12", "12" → "12"
            const match = s.match(/\d+/);
            return match ? match[0] : s;
          };
          const gradeMatch = !studentGrade
            || !exam.grade
            || normaliseGrade(exam.grade) === normaliseGrade(studentGrade)
            || exam.grade === studentGrade;  // exact match fallback

          // Subject match — student may study multiple subjects
          const examSubject = (exam.subject || '').toLowerCase().trim();
          const subjectMatch = studentSubjects.length === 0
            || studentSubjects.some(s => examSubject.includes(s) || s.includes(examSubject));

          return gradeMatch && subjectMatch;
        });

      setDynamicExams(exams);

      if (exams.length === 0) return;

      const latestExam = exams[0];

      // ✅ Only show if NOT seen
      if (!seenExams.includes(latestExam.id)) {

        Swal.fire({
          title: "📢 New Exam Uploaded!",
          html: `
          <b>${latestExam.title}</b><br/>
          Subject: ${latestExam.subject}<br/>
          Teacher: ${latestExam.teacherName}
        `,
          icon: "info",
          showCancelButton: true,
          showCloseButton: true,
          confirmButtonText: "Start Now",
          cancelButtonText: "Later",
          allowOutsideClick: false,
          background: isDark ? '#1e1b4b' : '#fff',
          color: isDark ? '#fff' : '#000',
        }).then((result) => {
          // Save as seen
          const updatedSeen = [...seenExams, latestExam.id];
          setSeenExams(updatedSeen);
          localStorage.setItem("seenExams", JSON.stringify(updatedSeen));

          if (result.isConfirmed) {
            navigate(`/student/exam/${latestExam.id}`);
          }
        });
      }

    });

    return () => unsub();
  }, [user, studentInfo, isDark, seenExams]);


  const startExam = async (overrideExamId) => {
    const user = auth.currentUser;

    if (!user) {
      alert("Session expired. Please sign in again.");
      return;
    }

    // Fall back to state if no override parameter was provided
    const targetExam = overrideExamId || selectedExam;
    const examId = typeof targetExam === "string" ? targetExam : targetExam?.id;

    if (!examId) {
      alert("Invalid exam selected");
      return;
    }

    setLoading(true);

    try {
      const token = await user.getIdToken(true);

      const res = await fetch(`${API}/start_exam`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ exam_id: examId })
      });

      const data = await res.json();

      if (data.error) throw new Error(data.error);
      if (!data.questions || data.questions.length === 0) {
        throw new Error("No questions returned from server");
      }

      const normalized = data.questions.map((q, idx) => ({
        ...q,
        id: q.id || `q_${idx}`,
        text: q.question,
        type: q.type ? String(q.type).toLowerCase() : "mcq", // 👈 Fallback inline
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

      window.__examQuestions = normalized;
      answers.current = {};

      setSessionId(sessionIdRef.current = data.session_id);
      setExamDurationSeconds((data.exam_duration_minutes || 60) * 60);

      setTimerKey((k) => k + 1);
      setTimeExpired(false);
      setAnswers({});
      setSkipped(new Set());
      setAgentReply("");
      setTotalQ(normalized.length);
      setQuestion(normalized[0]);
      setIndex(0);
      setStarted(true); // 🚀 Triggers active exam view
    } catch (err) {
      console.error("[startExam] ❌ error:", err.message);
      swal.fire("Error", err.message || "Failed to start exam", "error");
    } finally {
      setLoading(false);
    }
  };

  // Helper to handle both Static (Quiz) and Dynamic (PDF) exams
  const handleStartExam = async (exam) => {
    const examId = exam?.id || exam;

    if (!examId) {
      swal.fire({
        title: "Error",
        text: "Invalid exam selected.",
        icon: "error"
      });
      return;
    }

    // Update selected exam state
    setSelectedExam(examId);

    // If the paper has a direct drive link AND you still want students to have the choice,
    // prompt them, or launch the interactive runner directly:
    if (exam.isDynamic && exam.examDriveLink) {
      const res = await swal.fire({
        title: exam.title || "Start Assessment",
        text: `Do you want to take this interactive exam on Eduket, or open the reference PDF?`,
        icon: "question",
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: "▶ Take Interactive Exam",
        denyButtonText: "📄 View PDF",
        cancelButtonText: "Cancel"
      });

      if (res.isConfirmed) {
        // Launch interactive exam runner in-app
        await startExam(examId);
      } else if (res.isDenied) {
        // Open raw PDF reference
        window.open(exam.examDriveLink, "_blank");
      }
    } else {
      // Standard interactive exam/quiz — launch immediately
      await startExam(examId);
    }
  };

  const newExams = dynamicExams.filter(exam => !seenExams.includes(exam.id));

  // Helper for Date badge - NEW OR OLDER
  const getExamBadge = (uploadedAt) => {
    if (!uploadedAt) return { label: "OLDER", color: "text-gray-500 bg-gray-200 dark:bg-gray-700 dark:text-gray-300" };

    // Handle Firestore Timestamp or standard ISO/Date formats
    const uploadDate = uploadedAt?.toDate ? uploadedAt.toDate() : new Date(uploadedAt);
    const now = new Date();

    // Calculate difference in days
    const diffInDays = (now - uploadDate) / (1000 * 60 * 60 * 24);

    if (diffInDays <= 3) {
      return {
        label: "NEW",
        color: "text-indigo-600 bg-indigo-100 dark:bg-indigo-900/50 dark:text-indigo-300",
      };
    }

    return {
      label: "OLDER",
      color: "text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400",
    };
  };


  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-500">

      {/* ─── HEADER ─── */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-white/80 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4 w-1/3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg">
              {studentInfo?.firstName?.[0]}
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Student Portal</p>
              <h2 className="text-sm font-black dark:text-white leading-none">{studentInfo?.firstName} - {studentInfo?.grade}</h2>
            </div>
          </div>

          <div className="w-1/3 flex justify-center">
            <button onClick={() => setShowTutor(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl font-bold border border-indigo-100 dark:border-indigo-800 hover:bg-indigo-600 hover:text-white transition-all">
              <Sparkles size={18} />
              <span className="text-sm">Check Exam Here!</span>
            </button>
          </div>

          <div className="w-1/3 flex justify-end gap-3">
            <button onClick={toggleTheme} className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 dark:text-white">
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button onClick={handleLogout} className="p-2 rounded-xl bg-red-50 text-red-600 border border-red-100">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>


      {/* ─── AI TUTOR OVERLAY ─── */}
      {showTutor && (
        <div className="fixed inset-0 z-[100] bg-white dark:bg-gray-950 flex flex-col animate-in fade-in duration-300">

          {/* Header */}
          <div className="p-4 border-b dark:border-gray-800 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Sparkles className="text-indigo-600" size={24} />
              <h2 className="text-xl font-black dark:text-white uppercase tracking-tighter">
                Check Exam Here!
              </h2>
            </div>
            {/* Only allow closing if no active tool OR confirm exit */}
            <button
              onClick={() => {
                if (activeTool === 'exam') {
                  const confirm = window.confirm(
                    'You are currently in an exam. Closing this window will NOT submit your exam. Are you sure you want to exit?'
                  );
                  if (!confirm) return;
                }
                setActiveTool(null);
                setShowTutor(false);
              }}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full dark:text-white"
            >
              <X size={32} />
            </button>
          </div>

          {/* Tool selector — shown only when no tool is active */}
          {activeTool === null && (
            <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
              <div className="text-center mb-4">
                <h3 className="text-2xl font-black dark:text-white mb-2">
                  What would you like to do?
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Choose your exam session — you cannot switch between tabs once you start.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">

                {/* Exam Card */}
                <button
                  onClick={() => setActiveTool('exam')}
                  className="group flex flex-col items-center gap-4 p-8 bg-green-50 dark:bg-green-900/30
                       border-2 border-green-200 dark:border-green-700 rounded-3xl
                       hover:border-green-500 hover:bg-green-100 dark:hover:bg-green-900/50
                       transition-all shadow-sm hover:shadow-lg text-left"
                >
                  <div className="w-16 h-16 rounded-2xl bg-green-600 flex items-center justify-center">
                    <FileText size={32} className="text-white" />
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-green-700 dark:text-green-300 mb-1">
                      Assessments / Assignments
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                      Attempt a teacher uploaded exam or assignment and get it AI-marked or memoised under timed conditions.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-green-500 uppercase tracking-widest">
                    Start Session →
                  </span>
                </button>

              </div>
            </div>
          )}

          {/* Active: Exam only */}
          {activeTool === 'exam' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Active tool bar */}
              <div className="flex items-center justify-between px-4 py-2 bg-green-50 dark:bg-green-900/30 border-b dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-green-600" />
                  <span className="text-sm font-black text-green-700 dark:text-green-300 uppercase tracking-widest">
                    AI Session — Active
                  </span>
                </div>
                <button
                  onClick={() => {
                    const confirm = window.confirm(
                      '⚠️ Are you sure you want to exit the exam? Your current progress may be lost.'
                    );
                    if (confirm) setActiveTool(null);
                  }}
                  className="text-xs text-gray-500 hover:text-red-500 font-bold px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-red-300 transition-colors"
                >
                  ← Exit Exam
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="bg-gray-50 dark:bg-gray-900 rounded-3xl p-4 border dark:border-gray-800 shadow-inner min-h-full">
                  <AIExamMocker />
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ─── DASHBOARD ─── */}
      {!examActive && (
        <main className="max-w-7xl mx-auto pt-28 px-6 pb-20">

          <div className="my-10">
            <ExamResultsDisplay />
            <ResultsTab studentId={user?.uid} />
          </div>



        </main>
      )}

      {/* ─── PENDING: NOT YET ATTEMPTED ─── */}
      {examView === "new" && pendingExams.length > 0 && (
        <section className="mb-12 animate-in fade-in">
          <h2 className="text-3xl font-black mb-6 text-indigo-600">
            🔔 Check recent Uploads
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pendingExams.map((exam) => {
              const badge = getExamBadge(exam.uploadedAt);

              return (
                <div
                  key={exam.id}
                  className="p-6 rounded-3xl border-2 border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 shadow-xl"
                >
                  <span
                    className={`text-xs font-black uppercase px-2.5 py-1 rounded-full ${badge.color}`}
                  >
                    {badge.label}
                  </span>

                  <h3 className="text-lg font-bold mt-3 dark:text-white">
                    {exam.title}
                  </h3>

                  <p className="text-xs text-gray-500 mb-1">
                    {exam.subject || exam.subjectName || "General"} • {exam.teacherName || "Teacher"}
                  </p>

                  <p className="text-[11px] text-gray-400 mb-4 flex items-center gap-1">
                    <Clock size={12} /> Uploaded {formatUploadTime(exam.uploadedAt)}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ─── AUDIT TRAIL: ALREADY ATTEMPTED ─── */}
      {examView === "new" && completedExams.length > 0 && (
        <section className="mb-12 animate-in fade-in">
          <h2 className="text-lg font-black mb-4 text-gray-500 dark:text-gray-400">
            Previously Completed
          </h2>

          <div className="space-y-2">
            {completedExams.map((exam) => {
              const attempt = attemptedMap[exam.title];
              return (
                <div
                  key={exam.id}
                  className="flex items-center justify-between p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-200 truncate">
                      {exam.title}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {exam.subject || exam.subjectName || "General"} • Uploaded {formatUploadTime(exam.uploadedAt)}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right ml-4">
                    <p className="text-[11px] text-gray-400">
                      Attempted {formatUploadTime(attempt.completedTime)}
                    </p>
                    {attempt.percentage != null && (
                      <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                        {attempt.percentage}%
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ─── ACTIVE EXAM UI ─── */}
      {examActive && (
        <div className="fixed inset-0 z-[60] bg-indigo-950 text-white overflow-y-auto">

          {/* Timer Strip */}
          <div className="sticky top-0 z-[70] bg-black/40 backdrop-blur-md p-4 border-b border-white/10 flex justify-between items-center px-10">
            <h2 className="text-xl font-black italic text-white">{selectedExam.title}</h2>

            {(selectedExam.type === 'assignment' || selectedExam.assessmentType === 'assignment') ? (
              // ── STUDENT ASSIGNMENT DUE DATE STRIP ────────────────────────────────────────
              <div className="flex items-center gap-3 bg-indigo-500/10 px-5 py-2 rounded-2xl border border-indigo-500/20 text-indigo-200">
                <span className="text-xs font-black uppercase tracking-widest text-indigo-400">Due:</span>
                <span className="text-sm font-bold font-mono">
                  {selectedExam.dueDate ? (
                    new Date(selectedExam.dueDate).toLocaleDateString('en-ZA', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  ) : (
                    'No due date'
                  )}
                </span>
              </div>
            ) : (
              // ── STUDENT ACTIVE COUNTDOWN TIMER STRIP ───────────────────────────────
              <div className="flex items-center gap-4 bg-white/10 px-6 py-2 rounded-2xl border border-white/20 text-white">
                <Clock size={20} className={timeLeft < 180 ? 'text-red-400 animate-pulse' : ''} />
                <span className={`text-2xl font-mono font-bold ${timeLeft < 180 ? 'text-red-400' : ''}`}>
                  {formatTime(timeLeft)}
                </span>
              </div>
            )}
          </div>

          <div className="max-w-3xl mx-auto py-20 px-6">
            <div className="space-y-8">
              {(selectedExam?.question || []).map((q, idx) => (
                <div key={q.id} className={`p-8 rounded-3xl bg-white/5 border-2 transition-all ${unansweredIds.has(q.id) ? 'border-red-500 bg-red-500/5' : 'border-white/10'}`}>
                  <p className="text-sm font-black text-indigo-400 uppercase mb-2">Question {idx + 1}</p>
                  <h3 className="text-xl font-bold mb-8 leading-snug">{q.question}</h3>
                  <div className="grid gap-4">
                    {q.options.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => handleChange(q.id, opt)}
                        className={`p-5 rounded-2xl text-left font-bold transition-all border-2 ${answers[q.id] === opt ? 'bg-indigo-600 border-indigo-400 shadow-xl scale-[1.02]' : 'bg-white/5 border-white/5 hover:bg-white/10'
                          }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleSubmitExam}
              className="w-full mt-12 py-6 bg-emerald-500 text-white rounded-[2rem] text-2xl font-black shadow-2xl hover:bg-emerald-600 transition-all hover:scale-[1.02]"
            >
              FINALIZE SUBMISSION
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
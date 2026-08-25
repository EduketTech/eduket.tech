
/**
 * App.jsx — Eduket OS  Root Application  v5
 * ══════════════════════════════════════════════════════════════════════════════
 * Responsibilities:
 *   • Firebase Auth listener — resolves user + Firestore profile on every
 *     auth state change and stores the result in global state
 *   • Role-based routing — RequireRole blocks cross-role URL access
 *   • Legacy student session — restores/clears localStorage on auth change
 *   • Backend keep-alive ping — prevents Render cold starts during exams
 *   • Passes userProfile down to PasswordPage so the navbar ProfileChip
 *     can display the signed-in user without an extra Firestore read
 *
 * Route map:
 *   /                      → PasswordPage (landing + auth modal)
 *   /exam                  → ExamPage          [student only via ProtectedRoute]
 *   /results               → ResultPage        [student only via ProtectedRoute]
 *   /review                → ReviewPage        [no auth]
 *   /exam-rules            → ExamRules         [no auth]
 *   /payment/success       → PaymentSuccess    [no auth]
 *   /payment/cancel        → PaymentCancel     [no auth]
 *   /teacher-dashboard     → TeacherDashboard  [teacher only via RequireRole]
 *   /school-registration   → SchoolRegistration [principal only via RequireRole]
 *   /principal-dashboard   → PrincipalDashboard [principal only via RequireRole]
 *   *                      → redirect to /
 *
 * Auth listener sequence:
 *   Firebase Auth fires → read users/{uid} → read role collection profile
 *   → setUserProfile → if student: setStudentInfo + localStorage
 *                    → if not student: clear studentInfo + localStorage
 *   → setLoading(false)
 *
 * New in v5:
 *   ✓ userProfile passed to PasswordPage (navbar ProfileChip)
 *   ✓ RequireRole replaces RequireAuth — checks role not just auth
 *   ✓ "/" route waits for loading before redirecting (no flash)
 *   ✓ Legacy localStorage session validated against live uid + role
 *   ✓ Non-student sign-in clears any stale student state
 *   ✓ Backend keep-alive moved to useEffect (not inline)
 */

import { useState, useEffect } from 'react';
import {
  Routes, Route, Navigate,
  useLocation, useNavigate,
  Link,
} from 'react-router-dom';
import {
  Home, FileText, BarChart3,
  School, Sparkles, LayoutDashboard, HeartHandshake,
  Sun, Moon,
} from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { auth, db } from './utils/firebase';

// ── Page / component imports ───────────────────────────────────────────────
import PasswordPage from './components/PasswordPage';
import ExamPage from './components/ExamPage';
import ResultPage from './components/ResultPage';
import ExamRules from './utils/ExamRules';
import ProtectedRoute from './utils/ProtectedRoute';
import ReviewPage from './components/ReviewPage';
import TeacherDashboard from './components/TeacherDashboard';
import PaymentSuccess from './pages/PaymentSuccess';
import PaymentCancel from './pages/PaymentCancel';
import SchoolRegistration from './components/SchoolRegistration';
import PrincipalDashboard from './components/PrincipalDashboard';
import { SchoolProvider } from './utils/schoolContext';
import logo from './img/eduket.png';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import ContactUs from './pages/ContactUs';
import ParentDashboard from './components/ParentDashboard';


// ══════════════════════════════════════════════════════════════════════════════
// SHARED UI
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Full-screen spinner — rendered while Firebase Auth is resolving on first
 * load or while the Firestore profile read is in flight.
 * Without this, the "/" route flashes the landing page for a frame before
 * redirecting authenticated users to their dashboard.
 */
function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center
                    bg-white dark:bg-slate-900">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin w-10 h-10 border-4 border-indigo-600
                        border-t-transparent rounded-full" />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          Loading…
        </p>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// ROLE-AWARE ROUTE GUARD
// ══════════════════════════════════════════════════════════════════════════════

/**
 * RequireRole — wraps a route so only users with the matching role can access it.
 *
 * Decision matrix:
 *   loading                → spinner (never flash the wrong dashboard)
 *   not signed in          → redirect to /
 *   profile not yet loaded → spinner (Firestore read in flight)
 *   wrong role             → redirect to the user's own dashboard
 *   correct role           → render children
 *
 * This replaces the original RequireAuth which only checked authentication,
 * allowing a student who typed /teacher-dashboard into the URL to reach it.
 */
function RequireRole({ user, loading, userProfile, role, children }) {
  // 1. Wait for auth AND user profile to finish fetching
  if (loading || (user && !userProfile)) {
    return <LoadingSpinner />;
  }

  // 2. Not logged in -> send home
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // 3. Not approved -> send to pending approval page
  if (userProfile?.role !== 'principal' && userProfile?.approved !== true) {
    return <Navigate to="/pending-approval" replace />;
  }

  // 4. Role mismatch -> send home
  if (userProfile?.role !== role) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function PendingApprovalPage({ userProfile }) {
  const handleSignOut = async () => {
    const { signOut } = await import('firebase/auth');
    const { auth } = await import('./utils/firebase');
    await signOut(auth);
    localStorage.removeItem('user-session');
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-[#0A0D14] text-[#F3F6FB] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-[#141822] border border-white/10 rounded-3xl p-8 text-center shadow-2xl">
        <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-6 text-2xl">
          ⏳
        </div>
        <h2 className="text-2xl font-bold mb-2">Approval Pending</h2>
        <p className="text-sm text-[#AEB7C7] leading-relaxed mb-6">
          Your account for <strong className="text-white">
            {userProfile?.schoolName || 'your school'}
          </strong> has been created.
          Your Principal has been notified to review and approve your access.
        </p>
        <div className="p-4 rounded-xl bg-white/5 border border-white/5
                        text-xs text-[#AEB7C7] text-left space-y-1 mb-6">
          <p><span className="font-semibold text-white">Email:</span> {userProfile?.email}</p>
          <p><span className="font-semibold text-white">Role:</span> {userProfile?.role}</p>
          <p><span className="font-semibold text-white">School:</span> {userProfile?.schoolName}</p>
          <p><span className="font-semibold text-white">Status:</span>{' '}
            <span className="text-amber-400 font-bold">
              {userProfile?.approvalStatus === 'declined' ? '❌ Declined' : '⏳ Awaiting approval'}
            </span>
          </p>
        </div>

        {/* Declined message */}
        {userProfile?.approvalStatus === 'declined' && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30
                          rounded-xl text-xs text-red-400 text-left">
            <p className="font-bold mb-1">Your access was declined.</p>
            <p>Contact your school admin or{' '}
              <a href="mailto:support@eduket.tech"
                className="underline hover:text-red-300">
                support@eduket.tech
              </a>
              {' '}if you believe this is a mistake.
            </p>
          </div>
        )}

        <button
          onClick={handleSignOut}
          className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10
                     text-sm font-bold rounded-2xl transition-colors text-[#AEB7C7]"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════════════════════

function App() {

  // ── Global state ──────────────────────────────────────────────────────────
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  // Legacy student session — kept for ExamPage / ProtectedRoute compatibility
  const [studentInfo, setStudentInfo] = useState(null);

  // Local UI state
  const [results, setResults] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('eduket-theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [showTutor, setShowTutor] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();


  // ── Backend keep-alive ─────────────────────────────────────────────────────
  // Render's free tier spins down after 15 min of inactivity.
  // Pinging every 10 minutes prevents cold starts during exams.
  useEffect(() => {
    const BACKEND = import.meta.env.VITE_API_URL
      || 'https://chatbot-backend-educat.onrender.com';
    const ping = () => fetch(`${BACKEND}/`).catch(() => { });
    ping();                                        // immediate ping on load
    const id = setInterval(ping, 10 * 60 * 1000); // every 10 min
    return () => clearInterval(id);
  }, []);

  // ── getDocWithRetry — retries on permission-denied after registration ─────
  const getDocWithRetry = async (docRef, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await getDoc(docRef);
      } catch (err) {
        if (err.code === 'permission-denied' && i < retries - 1) {
          await new Promise(r => setTimeout(r, 1200 * (i + 1)));
          continue;
        }
        throw err;
      }
    }
  };

  // ── Primary Firebase auth listener ────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setUserProfile(null);
        setStudentInfo(null);
        localStorage.removeItem('user-session');
        setLoading(false);
        return;
      }

      setUser(firebaseUser);

      try {
        // Force fresh token — without this, new Google users get
        // permission-denied because the token hasn't propagated yet
        await firebaseUser.getIdToken(true);

        const userSnap = await getDocWithRetry(
          doc(db, 'users', firebaseUser.uid)
        );

        if (!userSnap.exists()) {
          // New user — no profile yet. ProfileSetupWizard will handle this.
          setUserProfile(null);
          return;
        }

        const { role, schoolId } = userSnap.data();

        const profileCol = role === 'principal' ? 'principals'
          : role === 'teacher' ? 'teachers'
            : role === 'parent' ? 'parents'
              : 'students';

        const profSnap = await getDocWithRetry(
          doc(db, profileCol, firebaseUser.uid)
        );

        const profile = profSnap.exists()
          ? { ...profSnap.data(), role, schoolId, uid: firebaseUser.uid }
          : { role, schoolId, uid: firebaseUser.uid };

        setUserProfile(profile);

        if (role === 'student') {
          setStudentInfo(profile);
          localStorage.setItem('user-session', JSON.stringify(profile));
        } else {
          // Restore localStorage session only if it belongs to this user
          try {
            const saved = localStorage.getItem('user-session');
            const parsed = saved ? JSON.parse(saved) : null;
            if (parsed?.uid === firebaseUser.uid && parsed?.role === 'student') {
              setStudentInfo(parsed);
            } else {
              setStudentInfo(null);
              localStorage.removeItem('user-session');
            }
          } catch {
            setStudentInfo(null);
            localStorage.removeItem('user-session');
          }
        }

      } catch (err) {
        console.error('[App] Profile load error:', err.code, err.message);
        setUserProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);


  // ── Close mobile menu on route change ─────────────────────────────────────
  useEffect(() => { setMenuOpen(false); }, [location]);

  // ── Prevent body scroll when AI tutor is open ─────────────────────────────
  useEffect(() => {
    document.body.style.overflow = showTutor ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [showTutor]);

  // ── Dark mode: sync class + persist ───────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('eduket-theme', isDark ? 'dark' : 'light');
  }, [isDark]);


  // ── Derived role flags ─────────────────────────────────────────────────────
  const isPrincipal = userProfile?.role === 'principal';
  const isTeacher = userProfile?.role === 'teacher';
  const isParent = userProfile?.role === 'parent';
  const isStudent = userProfile?.role === 'student' || (!!studentInfo && !userProfile);

  // SchoolProvider context
  const schoolId = userProfile?.schoolId || null;

  // Display info for navbar chip
  const displayName = userProfile?.displayName
    || userProfile?.name
    || studentInfo?.name
    || null;
  const displayGrade = userProfile?.grade || studentInfo?.grade || null;
  const displayRole = userProfile?.role || (studentInfo ? 'student' : null);


  // ── AI Tutor access guard ─────────────────────────────────────────────────
  const handleTutorAccess = () => {
    if (studentInfo || user) { setShowTutor(true); return; }
    Swal.fire({
      title: '<strong>Access Protected</strong>',
      icon: 'info',
      text: 'Please sign in or register to access the AI Tutor.',
      showCancelButton: true,
      confirmButtonText: 'Sign In / Register',
      cancelButtonText: 'Maybe Later',
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#ef4444',
    }).then((result) => {
      if (result.isConfirmed) navigate('/', { state: { openModal: true } });
    });
  };


  // ── Navigation links (filtered by role) ──────────────────────────────────
  const navLinks = [
    { to: '/exam', label: 'Take Exam', icon: Home, show: isStudent },
    { to: '/results', label: 'My Results', icon: BarChart3, show: isStudent },
    { to: '/teacher-dashboard', label: 'Teacher', icon: School, show: isTeacher },
    { to: '/principal-dashboard', label: 'Dashboard', icon: LayoutDashboard, show: isPrincipal },
    { to: '/parent-dashboard', label: 'Parent Portal', icon: HeartHandshake, show: isParent },
    { to: '/exam-rules', label: 'Rules', icon: FileText, show: true },
  ];


  // ─────────────────────────────────────────────────────────────────────────
  return (
    <SchoolProvider schoolId={schoolId}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">

        {/* ── App-level navbar ────────────────────────────────────────────── */}
        {location.pathname !== '/' && (
          <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl
                             bg-white/70 dark:bg-gray-900/70
                             border-b border-gray-200 dark:border-gray-800 shadow-lg">
            <div className="max-w-7xl mx-auto px-6 py-4
                            flex items-center justify-between">

              <Link to="/" className="flex items-center gap-3 group">
                <div className="relative">
                  <img
                    src={logo}
                    alt="Eduket"
                    className="h-10 w-auto rounded-xl shadow-lg
                               ring-4 ring-white/50 dark:ring-gray-800/50
                               group-hover:scale-110 transition-transform duration-300
                               dark:invert dark:hue-rotate-180"
                  />
                </div>
              </Link>

              <button
                onClick={() => setIsDark(prev => !prev)}
                className="h-11 w-11 rounded-full flex items-center justify-center
                           text-gray-600 dark:text-gray-300
                           hover:bg-gray-100 dark:hover:bg-gray-700
                           transition-all duration-300 shadow-sm shrink-0"
                title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {isDark ? <Sun size={20} /> : <Moon size={20} />}
              </button>

              {/* Desktop nav links */}
              <nav className="hidden lg:flex items-center gap-1">
                {navLinks.filter(l => l.show).map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl
                                font-medium transition-all duration-300 ${location.pathname === to
                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-gray-800 hover:text-indigo-600'
                      }`}
                  >
                    <Icon size={18} />
                    {label}
                  </Link>
                ))}
              </nav>

              {/* Right side — AI Tutor + identity chip */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleTutorAccess}
                  title={!user && !studentInfo ? 'Sign in to access AI Tutor' : 'Open AI Tutor'}
                  className="group flex items-center gap-2 px-4 py-2 rounded-xl
                             bg-indigo-100 dark:bg-indigo-900/30
                             text-indigo-600 dark:text-indigo-400
                             hover:bg-indigo-600 hover:text-white
                             transition-all duration-300 shadow-sm font-semibold
                             border border-transparent hover:border-indigo-400"
                >
                  <Sparkles
                    size={20}
                    className={!user && !studentInfo ? 'opacity-70' : 'animate-pulse'}
                  />
                  <span className="hidden sm:inline text-sm">AI Tutor</span>
                </button>

                {displayName && (
                  <div className="hidden md:flex flex-col items-end mr-1">
                    <span className="text-xs font-bold text-gray-800 dark:text-white">
                      {displayName}
                    </span>
                    <span className="text-[10px] text-gray-500 capitalize">
                      {displayRole === 'student' && displayGrade
                        ? `Grade ${displayGrade}`
                        : displayRole}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </header>
        )}


        {/* ── Routes ──────────────────────────────────────────────────────── */}
        <main className={location.pathname !== '/' ? 'pt-28 pb-12 px-6 max-w-7xl mx-auto' : ''}>
          <Routes>

            {/* ── Landing page ─────────────────────────────────────────── */}
            <Route
              path="/"
              element={
                loading ? (
                  <LoadingSpinner />
                ) : isPrincipal ? (
                  <Navigate to="/principal-dashboard" replace />

                ) : isTeacher ? (
                  userProfile?.approvalStatus === 'declined'
                    ? <Navigate to="/pending-approval" replace />
                    : <Navigate to="/teacher-dashboard" replace />

                ) : isParent ? (
                  <Navigate to="/parent-dashboard" replace />

                ) : (isStudent || studentInfo) ? (
                  userProfile?.approvalStatus === 'declined'
                    ? <Navigate to="/pending-approval" replace />
                    : <Navigate to="/exam" replace />

                ) : (
                  <PasswordPage
                    setStudentInfo={setStudentInfo}
                    userProfile={userProfile}
                  />
                )
              }
            />


            {/* ── Student: take exam ──────────────────────────────────── */}
            <Route
              path="/exam"
              element={
                <ProtectedRoute studentInfo={studentInfo}>
                  <div className="space-y-8 animate-in fade-in
                                  slide-in-from-bottom-4 duration-500">

                    <section className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-6 bg-white dark:bg-gray-800 rounded-3xl
                                        shadow-sm border border-gray-100 dark:border-gray-700
                                        hover:shadow-md transition-all">
                          <p className="text-gray-500 dark:text-gray-400 text-xs
                                         font-bold uppercase mb-1">
                            Registered School
                          </p>
                          <p className="text-xl font-bold dark:text-gray-100">
                            {studentInfo?.school || studentInfo?.schoolName || 'Private Student'}
                          </p>
                        </div>

                        <div className="p-6 bg-white dark:bg-gray-800 rounded-3xl
                                        shadow-sm border border-gray-100 dark:border-gray-700
                                        hover:shadow-md transition-all">
                          <p className="text-gray-500 dark:text-gray-400 text-xs
                                         font-bold uppercase mb-1">
                            Current Grade
                          </p>
                          <p className="text-xl font-bold dark:text-gray-100">
                            {studentInfo?.grade ? `Grade ${studentInfo.grade}` : 'N/A'}
                          </p>
                        </div>

                        <div className="p-6 bg-gradient-to-br from-indigo-600 to-purple-700
                                        text-white rounded-3xl shadow-lg shadow-indigo-500/20
                                        flex items-center justify-between group">
                          <div>
                            <p className="text-indigo-100 text-xs font-bold uppercase mb-1">
                              Portal Status
                            </p>
                            <p className="text-xl font-bold">Active Session</p>
                          </div>
                          <Sparkles className="group-hover:rotate-12 transition-transform" />
                        </div>
                      </div>
                    </section>

                    <hr className="border-gray-200 dark:border-gray-800" />

                    <section className="bg-white dark:bg-gray-900 rounded-3xl min-h-[400px]">
                      <ExamPage
                        studentInfo={studentInfo}
                        setStudentInfo={setStudentInfo}
                        addResult={(res) => setResults(prev => [...prev, res])}
                        isDark={isDark}
                      />
                    </section>
                  </div>
                </ProtectedRoute>
              }
            />

            {/* ── Student: results ─────────────────────────────────────── */}
            <Route
              path="/results"
              element={
                <ProtectedRoute studentInfo={studentInfo}>
                  <ResultPage results={results} studentInfo={studentInfo} />
                </ProtectedRoute>
              }
            />

            {/* ── Utility routes (no auth required) ───────────────────── */}
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/exam-rules" element={<ExamRules />} />
            <Route path="/payment/success" element={<PaymentSuccess />} />
            <Route path="/payment/cancel" element={<PaymentCancel />} />

            {/* ── Teacher dashboard ───────────────────────────────────── */}
            <Route
              path="/teacher-dashboard"
              element={
                <RequireRole
                  user={user}
                  loading={loading}
                  userProfile={userProfile}
                  role="teacher"
                >
                  <TeacherDashboard teacherProfile={userProfile} />
                </RequireRole>
              }
            />

            {/* ── Parent: main dashboard ───────────────────────────────── */}
            <Route
              path="/parent-dashboard"
              element={
                <RequireRole
                  user={user}
                  loading={loading}
                  userProfile={userProfile}
                  role="parent"
                >
                  <ParentDashboard parent={userProfile} />
                </RequireRole>
              }
            />

            {/* ── Principal: school registration wizard ────────────────── */}
            <Route
              path="/school-registration"
              element={
                <RequireRole
                  user={user}
                  loading={loading}
                  userProfile={userProfile}
                  role="principal"
                >
                  <SchoolRegistration
                    principalProfile={userProfile}
                    onComplete={() => navigate('/principal-dashboard')}
                  />
                </RequireRole>
              }
            />

            {/* ── Principal: main dashboard ────────────────────────────── */}
            <Route
              path="/principal-dashboard"
              element={
                <RequireRole
                  user={user}
                  loading={loading}
                  userProfile={userProfile}
                  role="principal"
                >
                  <PrincipalDashboard principal={userProfile} />
                </RequireRole>
              }
            />

            {/* ── Pending Approval Route ───────────────────────────── */}
            <Route
              path="/pending-approval"
              element={
                loading ? (
                  <LoadingSpinner />
                ) : !user ? (
                  <Navigate to="/" replace />
                ) : userProfile?.approvalStatus === 'approved' ? (
                  <Navigate
                    to={userProfile.role === 'teacher' ? '/teacher-dashboard' : '/exam'}
                    replace
                  />
                ) : (
                  <PendingApprovalPage userProfile={userProfile} />
                )
              }
            />

            {/* ── Privacy policy ──────────────────────────────────── */}
            <Route path="/privacy" element={<PrivacyPolicy />} />

            {/* ── Terms of service ──────────────────────────────────── */}
            <Route path="/terms" element={<TermsOfService />} />

            {/* ── Contact us ──────────────────────────────────── */}
            <Route path="/contact" element={<ContactUs />} />

            {/* ── Catch-all → landing ──────────────────────────────────── */}
            <Route path="*" element={<Navigate to="/" replace />} />

          </Routes>
        </main>

        {/* ── App footer (inner pages only) ─────────────────────────────── */}
        {location.pathname !== '/' && (
          <footer className="py-8 text-center text-gray-400 text-sm
                             border-t dark:border-gray-800">
            © {new Date().getFullYear()} Eduket Smart Learning Portal
            · Developed by Nextgen Skills Development
          </footer>
        )}

      </div>
    </SchoolProvider>
  );
}

export default App;




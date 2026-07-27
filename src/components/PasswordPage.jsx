import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import ReCAPTCHA from 'react-google-recaptcha';
import Swal from 'sweetalert2';
import { Shield, Lock, Eye, X as XIcon, EyeOff } from 'lucide-react';
import { auth, db } from '../utils/firebase';
import { ProfileSetupWizard } from './ProfileSetupWizard';
import Navbar from './landing/Navbar';
import Hero from './landing/Hero';
import FeatureStrip from './landing/FeatureStrip';
import VideoSection from './landing/VideoSection';
import Demosection from './landing/Demosection';
import HowItWorks from './landing/HowItWorks';
import CTA from './landing/CTA';
import ThreePaths from './landing/ThreePaths';
import Mission from './landing/Mission';
import Footer from './landing/Footer';

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

const AUTH_ERRORS = {
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled. Contact your school admin.',
  'auth/too-many-requests': 'Too many failed attempts. Please wait a few minutes.',
  'auth/email-already-in-use': 'An account with this email already exists. Try signing in.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/popup-closed-by-user': '',
  'auth/popup-blocked': 'Popup blocked. Please allow popups for this site.',
  'auth/network-request-failed': 'Network error. Check your connection.',
  'auth/password-does-not-meet-requirements': null, // handled separately
};

const AUTH_DEFAULT_ERROR = 'Something went wrong. Please try again.';
const getFriendlyError = (code) => AUTH_ERRORS[code] ?? AUTH_DEFAULT_ERROR;

// ══════════════════════════════════════════════════════════════════════════════
// EMAIL HELPERS — Netlify Functions
// ══════════════════════════════════════════════════════════════════════════════

const sendWelcomeEmail = (profile, dashboardUrl) => {
  fetch('/.netlify/functions/send-welcome-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: profile.email || '',
      displayName: profile.displayName || '',
      firstName: profile.firstName || '',
      role: profile.role,
      schoolName: profile.schoolName || '',
      grade: profile.grade || '',
      subjects: profile.subjects || [],
      dashboardUrl,
    }),
  })
    .then(r => r.json())
    .then(d => console.log('[Welcome Email]', d))
    .catch(err => console.warn('[Welcome Email] Failed:', err));
};

const notifyPrincipal = (profile) => {
  // Only for teachers and students — principals ARE the principal
  if (profile.role === 'principal') return;
  if (!profile.schoolId) return;

  fetch('/.netlify/functions/notify-principal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schoolId: profile.schoolId || '',
      schoolName: profile.schoolName || '',
      uid: profile.uid || '',
      email: profile.email || '',
      displayName: profile.displayName || '',
      firstName: profile.firstName || '',
      role: profile.role,
      grade: profile.grade || '',
      subjects: profile.subjects || [],
      photoURL: profile.photoURL || '',
    }),
  })
    .then(r => r.json())
    .then(d => console.log('[Notify Principal]', d))
    .catch(err => console.warn('[Notify Principal] Failed:', err));
};

// ══════════════════════════════════════════════════════════════════════════════
// ERROR BOX
// ══════════════════════════════════════════════════════════════════════════════

function ErrorBox({ message }) {
  if (!message) return null;
  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200
                    dark:border-red-800 text-red-700 dark:text-red-400
                    text-xs rounded-xl px-4 py-3 leading-relaxed whitespace-pre-line">
      {message}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH MODAL
// ══════════════════════════════════════════════════════════════════════════════

function AuthModal({ isOpen, onClose, onSuccess, onNeedsSetup, setStudentInfo }) {
  const navigate = useNavigate();

  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const captchaRef = useRef(null);

  const resetForm = useCallback(() => {
    setEmail(''); setPassword(''); setError('');
    setCaptchaToken(null);
    captchaRef.current?.reset();
  }, []);

  const handleClose = () => { resetForm(); onClose(); };
  const toggleMode = () => { setIsRegistering(v => !v); setError(''); };

  // ── Route existing users after sign-in ─────────────────────────────────
  const routeExistingUser = async (uid) => {
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (!userSnap.exists()) { onNeedsSetup?.(uid, email); return; }

    const { role, schoolId } = userSnap.data();
    const col = role === 'principal' ? 'principals'
      : role === 'teacher' ? 'teachers'
        : 'students';
    const profSnap = await getDoc(doc(db, col, uid));

    const profile = profSnap.exists()
      ? { ...profSnap.data(), role, schoolId, uid }
      : { role, schoolId, uid };

    if (role === 'student') {
      setStudentInfo?.(profile);
      localStorage.setItem('user-session', JSON.stringify(profile));
    }

    resetForm();

    // ── Check approval status ──────────────────────────────────────────────
    const isDeclined = profile.approvalStatus === 'declined';
    const isPending = role !== 'principal'
      && profile.approvalStatus == null;  // no field = not yet reviewed

    if (isDeclined) {
      onClose();
      await Swal.fire({
        icon: 'error',
        title: 'Access Declined',
        html: `
          <p>Your registration has been declined by the school principal.</p>
          <p style="font-size:13px;color:#6b7280;margin-top:8px">
            Contact your school admin or email
            <a href="mailto:support@eduket.tech">support@eduket.tech</a>
            if you believe this is a mistake.
          </p>
        `,
        confirmButtonColor: '#4F46E5',
        confirmButtonText: 'OK',
      });
      await signOut(auth);
      return;
    }

    if (isPending) {
      onClose();
      navigate('/pending-approval');
      return;
    }

    onSuccess?.(profile);
  };

  // ── Email sign-in / register ───────────────────────────────────────────
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!captchaToken) {
      setError('Please complete the security check first.');
      return;
    }
    setIsSubmitting(true);
    setError('');

    try {
      if (isRegistering) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        resetForm();
        onClose();
        onNeedsSetup?.(cred.user.uid, cred.user.email);
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        await routeExistingUser(cred.user.uid);
      }
    } catch (err) {
      console.error('[Auth] Failed:', err.code, err.message);

      let msg = '';
      if (err.code === 'auth/password-does-not-meet-requirements') {
        const match = err.message.match(/\[([^\]]+)\]/);
        if (match) {
          const reqs = match[1].split(',').map(r => r.trim()).join('\n• ');
          msg = `Password does not meet requirements:\n• ${reqs}`;
        } else {
          msg = 'Password does not meet the required security standards.';
        }
      } else {
        msg = getFriendlyError(err.code) || err.message || 'Something went wrong.';
      }

      setError(msg);
      setCaptchaToken(null);
      captchaRef.current?.reset();
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Google sign-in ─────────────────────────────────────────────────────
  const handleGoogle = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      const uid = cred.user.uid;
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) {
        await routeExistingUser(uid);
      } else {
        resetForm();
        onClose();
        onNeedsSetup?.(uid, cred.user.email);
      }
    } catch (err) {
      const msg = getFriendlyError(err.code);
      if (msg) setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4
                    bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl
                      w-full max-w-sm border border-slate-200 dark:border-slate-800
                      overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center
                            justify-center">
              <Shield size={16} className="text-white" />
            </div>
            <span className="font-black text-slate-800 dark:text-white">
              {isRegistering ? 'Create account' : 'Sign in'}
            </span>
          </div>
          <button onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <XIcon size={20} />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-3">
          <ErrorBox message={error} />

          {/* Google button */}
          <button
            onClick={handleGoogle}
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-3 py-3
                       border border-slate-200 dark:border-slate-700
                       rounded-2xl text-sm font-bold text-slate-700 dark:text-slate-300
                       hover:bg-slate-50 dark:hover:bg-slate-800
                       disabled:opacity-50 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z" />
              <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z" />
              <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18z" />
              <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z" />
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
            <span className="text-xs text-slate-400">or</span>
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
          </div>

          {/* Email form */}
          <form onSubmit={handleEmailSubmit} className="space-y-3">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase
                                tracking-widest block mb-1.5">
                Email
              </label>
              <input
                type="email" value={email} required
                onChange={e => setEmail(e.target.value)}
                placeholder="you@school.edu"
                className="w-full px-4 py-3 rounded-2xl border border-slate-200
                           dark:border-slate-700 bg-white dark:bg-slate-800
                           text-sm outline-none focus:border-indigo-500
                           dark:text-white transition-colors"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase
                                tracking-widest block mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password} required
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-11 rounded-2xl border border-slate-200
                             dark:border-slate-700 bg-white dark:bg-slate-800
                             text-sm outline-none focus:border-indigo-500
                             dark:text-white transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2
                             text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {isRegistering && (
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                  Must include uppercase, lowercase, number and special character
                </p>
              )}
            </div>

            {/* ReCAPTCHA */}
            <div className="flex justify-center">
              <ReCAPTCHA
                ref={captchaRef}
                sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY_V2}
                onChange={token => setCaptchaToken(token)}
                onExpired={() => setCaptchaToken(null)}
                theme="light"
                size="normal"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !captchaToken}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700
                         disabled:opacity-50 text-white font-black rounded-2xl
                         text-sm transition-colors flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white
                                border-t-transparent rounded-full animate-spin" />
              ) : (
                <Lock size={14} />
              )}
              {isRegistering ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <button
            onClick={toggleMode}
            className="w-full text-xs text-slate-500 hover:text-indigo-600
                       dark:hover:text-indigo-400 font-bold py-1 transition-colors"
          >
            {isRegistering
              ? 'Already have an account? Sign in'
              : "Don't have an account? Register"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PASSWORD PAGE (Landing)
// ══════════════════════════════════════════════════════════════════════════════

export default function PasswordPage({ setStudentInfo, userProfile }) {
  const navigate = useNavigate();

  const [modalOpen, setModalOpen] = useState(false);
  const [setupPending, setSetupPending] = useState(false);
  const [newUserUid, setNewUserUid] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');

  // ── Auth callbacks ─────────────────────────────────────────────────────
  const handleAuthSuccess = (profile) => {
    setModalOpen(false);
    if (!profile) return;
    if (profile.role === 'teacher') return navigate('/teacher-dashboard');
    if (profile.role === 'principal') return navigate('/principal-dashboard');
    // Students handled by routeExistingUser → /exam
  };

  const handleNeedsSetup = (uid, email) => {
    setModalOpen(false);
    setNewUserUid(uid);
    setNewUserEmail(email);
    setSetupPending(true);
  };

  // ── After wizard completes ─────────────────────────────────────────────
  const handleSetupComplete = async (profile) => {
    setSetupPending(false);
    if (!profile) return;

    try {
      const dashboardUrls = {
        principal: `${window.location.origin}/principal-dashboard`,
        teacher: `${window.location.origin}/teacher-dashboard`,
        student: `${window.location.origin}/exam`,
      };

      // Send welcome email (fire and forget)
      sendWelcomeEmail(
        profile,
        dashboardUrls[profile.role] || window.location.origin
      );

      // Notify principal (fire and forget) — teachers and students only
      notifyPrincipal(profile);

      if (profile.role === 'principal') {
        // Principals are auto-approved — go straight to dashboard
        await Swal.fire({
          icon: 'success',
          title: 'School Registered! 🏫',
          html: `
            <p style="margin-bottom:8px">
              <strong>${profile.schoolName}</strong> is now live on Eduket OS.
            </p>
            <p style="font-size:13px;color:#6b7280">
              📧 A welcome email has been sent to<br/>
              <strong>${profile.email}</strong>
            </p>
          `,
          confirmButtonText: 'Go to Dashboard',
          confirmButtonColor: '#7c3aed',
        });
        window.location.href = '/principal-dashboard';

      } else {
        // Teachers and students must wait for principal approval
        // Do NOT set studentInfo or localStorage — only after approval
        await Swal.fire({
          icon: 'success',
          title: 'Registration Complete! ✅',
          html: `
            <p style="margin-bottom:8px">
              Your ${profile.role} profile has been created successfully.
            </p>
            <p style="font-size:13px;color:#6b7280">
              📧 A welcome email has been sent to <strong>${profile.email}</strong><br/>
              ⏳ Your principal has been notified and will approve your access shortly.
            </p>
          `,
          confirmButtonText: 'OK',
          confirmButtonColor: '#1d4ed8',
        });
        window.location.href = '/pending-approval';
      }

    } catch (err) {
      console.error('[ProfileSetup] Navigation failed:', err);
    }
  };

  // ── Navigation helpers ─────────────────────────────────────────────────
  const handleDashboard = () => {
    if (!userProfile) { setModalOpen(true); return; }
    if (userProfile.role === 'teacher') return navigate('/teacher-dashboard');
    if (userProfile.role === 'principal') return navigate('/principal-dashboard');
    navigate('/exam');
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('user-session');
      setStudentInfo?.(null);
    } catch (err) {
      console.error('[PasswordPage] Sign out error:', err);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      <AuthModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleAuthSuccess}
        setStudentInfo={setStudentInfo}
        onNeedsSetup={(uid, email) => {
          setNewUserUid(uid);
          setNewUserEmail(email);
          setSetupPending(true);
        }}
      />

      {setupPending && (
        <ProfileSetupWizard
          uid={newUserUid}
          email={newUserEmail}
          onComplete={handleSetupComplete}
        />
      )}

      <Navbar
        profile={userProfile}
        onOpenModal={() => setModalOpen(true)}
        onDashboard={handleDashboard}
        onSignOut={handleSignOut}
      />

      <div className="min-h-screen bg-[#0A0D14]">
        <Hero onOpenModal={() => setModalOpen(true)} />
        <FeatureStrip />
        <VideoSection onOpenModal={() => setModalOpen(true)} />
        <Demosection />
        <HowItWorks />
        <CTA />
        <ThreePaths onOpenModal={() => setModalOpen(true)} />
        <Mission onOpenModal={() => setModalOpen(true)} />
        <Footer />
      </div>
    </>
  );
}
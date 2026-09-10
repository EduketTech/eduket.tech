// contexts/UserContext.js
import { createContext, useContext, useState, useEffect } from 'react';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../utils/firebase';

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getAuth();

    return onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        try {
          // Force token refresh before Firestore read
          await firebaseUser.getIdToken(true);

          const userDoc = await getDoc(
            doc(db, 'users', firebaseUser.uid)
          );

          setUserRole(
            userDoc.exists()
              ? userDoc.data().role
              : null
          );

        } catch (err) {
          console.error(
            '[UserContext]',
            err.code,
            err.message
          );

          setUserRole(null);
        }
      } else {
        setUserRole(null);
      }

      setLoading(false);
    });
  }, []);

  // Login existing user (works for Admin or Students)
  const login = async (email, password) => {
    try {
      const auth = getAuth();
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return userCredential.user;
    } catch (err) {
      console.error(
        '[UserContext] Login failed:',
        err.code,
        err.message
      );
      throw err;
    }
  };

  // Google Sign-In -- no password entry needed. Relies on Firebase's
  // "One account per email address" linking setting to match an existing
  // email/password account by email; the uid (and therefore the
  // users/{uid} and admins/{email} lookups elsewhere in the app) stays
  // the same as the original account when that setting is on. If it's
  // off, signing in with a Google account under an email that already
  // has a password-based account throws
  // auth/account-exists-with-different-credential instead of succeeding.
  const loginWithGoogle = async () => {
    try {
      const auth = getAuth();
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      return userCredential.user;
    } catch (err) {
      console.error(
        '[UserContext] Google login failed:',
        err.code,
        err.message
      );
      throw err;
    }
  };

  // Logout current Firebase user
  const logout = async () => {
    try {
      const auth = getAuth();
      await signOut(auth);

      // onAuthStateChanged will handle:
      // setUser(null)
      // setUserRole(null)
    } catch (err) {
      console.error(
        '[UserContext] Logout failed:',
        err.code,
        err.message
      );

      throw err;
    }
  };

  return (
    <UserContext.Provider
      value={{
        user,
        userRole,
        isAdmin: userRole === 'admin',
        loading,
        login,
        loginWithGoogle,
        logout,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
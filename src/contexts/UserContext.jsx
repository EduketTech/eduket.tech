// contexts/UserContext.js
import { createContext, useContext, useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
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
        loading,
        logout,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
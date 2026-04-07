import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';

interface UserData {
  uid: string;
  displayName: string;
  alias: string;
  email: string;
  photoURL: string;
  stats: any;
}

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  isAuthReady: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  isAuthReady: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    let unsubscribeDoc: () => void;

    const unsubscribeAuth = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        // Sync user to Firestore
        const userRef = doc(db, 'users', authUser.uid);
        try {
          const userDoc = await getDoc(userRef);
          if (userDoc.exists()) {
            const data = userDoc.data();
            await setDoc(userRef, {
              uid: authUser.uid,
              displayName: data.displayName || authUser.displayName || 'Player',
              alias: data.alias || authUser.displayName || 'Player',
              lastLogin: new Date().toISOString(),
            }, { merge: true });
          } else {
            await setDoc(userRef, {
              uid: authUser.uid,
              displayName: authUser.displayName || 'Player',
              alias: authUser.displayName || 'Player',
              email: authUser.email || '',
              photoURL: authUser.photoURL || '',
              stats: {
                wins: 0,
                losses: 0,
                gamesPlayed: 0,
                totalGoldSpent: 0,
                totalGoldEarned: 0,
                totalTilesClaimed: 0
              },
              lastLogin: new Date().toISOString(),
            });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${authUser.uid}`);
        }

        // Listen to user document
        unsubscribeDoc = onSnapshot(userRef, (doc) => {
          if (doc.exists()) {
            setUserData(doc.data() as UserData);
          }
        });
      } else {
        setUserData(null);
        if (unsubscribeDoc) unsubscribeDoc();
      }
      
      setUser(authUser);
      setLoading(false);
      setIsAuthReady(true);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc) unsubscribeDoc();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, userData, loading, isAuthReady }}>
      {children}
    </AuthContext.Provider>
  );
};

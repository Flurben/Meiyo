import React, { createContext, useContext, useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface UserData {
  uid: string;
  displayName: string;
  alias: string;
  photoURL: string;
  stats: any;
}

interface AuthContextType {
  user: { uid: string } | null;
  userData: UserData | null;
  loading: boolean;
  isAuthReady: boolean;
  updateUser: (data: Partial<UserData>) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  isAuthReady: false,
  updateUser: async () => {},
  signOut: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<{ uid: string } | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      let uid = localStorage.getItem('meiyo_uid');
      if (!uid) {
        uid = uuidv4();
        localStorage.setItem('meiyo_uid', uid);
      }

      try {
        const res = await fetch(`/api/users/${uid}`);
        if (res.ok) {
          const data = await res.json();
          setUserData({
            uid: data.id,
            displayName: data.alias,
            alias: data.alias,
            photoURL: data.photoURL,
            stats: data.stats
          });
        } else {
          const newUser = {
            id: uid,
            alias: 'Player ' + Math.floor(Math.random() * 1000),
            photoURL: '',
            stats: {
              wins: 0, losses: 0, gamesPlayed: 0,
              totalGoldSpent: 0, totalGoldEarned: 0, totalTilesClaimed: 0
            }
          };
          await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newUser)
          });
          setUserData({
            uid: newUser.id,
            displayName: newUser.alias,
            alias: newUser.alias,
            photoURL: newUser.photoURL,
            stats: newUser.stats
          });
        }
        setUser({ uid });
      } catch (error) {
        console.error("Auth error:", error);
      } finally {
        setLoading(false);
        setIsAuthReady(true);
      }
    };

    initAuth();
  }, []);

  const updateUser = async (data: Partial<UserData>) => {
    if (!userData) return;
    const updated = { ...userData, ...data };
    setUserData(updated);
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: updated.uid,
        alias: updated.alias,
        photoURL: updated.photoURL,
        stats: updated.stats
      })
    });
  };

  const signOut = () => {
    localStorage.removeItem('meiyo_uid');
    setUser(null);
    setUserData(null);
    window.location.reload();
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, isAuthReady, updateUser, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

import React, { createContext, useContext, useEffect, useState } from 'react';

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
  setAuthData: (uid: string, data: UserData) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  isAuthReady: false,
  updateUser: async () => {},
  signOut: () => {},
  setAuthData: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<{ uid: string } | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      const uid = localStorage.getItem('meiyo_uid');
      if (!uid) {
        setLoading(false);
        setIsAuthReady(true);
        return;
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
          setUser({ uid });
        } else {
          // User not found in DB, clear local storage
          localStorage.removeItem('meiyo_uid');
        }
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

  const setAuthData = (uid: string, data: UserData) => {
    localStorage.setItem('meiyo_uid', uid);
    setUser({ uid });
    setUserData(data);
  };

  const signOut = () => {
    localStorage.removeItem('meiyo_uid');
    setUser(null);
    setUserData(null);
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, isAuthReady, updateUser, signOut, setAuthData }}>
      {children}
    </AuthContext.Provider>
  );
};

import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  auth, 
  db, 
  doc, 
  onSnapshot, 
  handleFirestoreError, 
  OperationType 
} from '../firebase';
import { 
  onAuthStateChanged, 
  User, 
  signOut as firebaseSignOut 
} from 'firebase/auth';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isManager: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      if (!currentUser) {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (user && isAuthReady) {
      const userDocRef = doc(db, 'users', user.uid);
      const unsubscribeProfile = onSnapshot(userDocRef, (snapshot) => {
        if (snapshot.exists()) {
          setUserProfile({ ...snapshot.data() as UserProfile, uid: snapshot.id });
        } else {
          setUserProfile(null);
        }
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
        setLoading(false);
      });

      return () => unsubscribeProfile();
    }
  }, [user, isAuthReady]);

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const isAdmin = userProfile?.role === 'hr-admin';
  const isManager = userProfile?.role === 'manager';

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, isAuthReady, signOut, isAdmin, isManager }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db, doc, setDoc, Timestamp, getDocFromServer } from '../firebase';
import { getDoc } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import { Globe, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { Logo } from '../components/Logo';

const Login: React.FC = () => {
  const { t, language, setLanguage, isRtl } = useLanguage();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    const checkInitialization = async () => {
      try {
        console.log('Checking initialization status on database:', db.app.options.projectId);
        // Use getDoc to check status
        const statusDoc = await getDoc(doc(db, 'settings', 'status'));
        console.log('Status doc exists:', statusDoc.exists());
        if (!statusDoc.exists()) {
          console.log('System is uninitialized. Showing setup.');
          setShowSetup(true);
        } else {
          console.log('System is initialized:', statusDoc.data());
          setShowSetup(false);
        }
      } catch (err: any) {
        console.error('Error checking initialization:', err);
        // If it's a permission error, we might want to show setup anyway if we suspect it's the first run
        if (err.message?.includes('permission') || err.message?.includes('insufficient') || err.message?.includes('Missing')) {
          console.log('Permission error detected, possibly system is uninitialized. Showing setup.');
          setShowSetup(true);
        }
      }
    };
    checkInitialization();
  }, []);

  const handleSetupAdmin = async () => {
    if (!email || !password) {
      setError('Please enter email and password for the admin account');
      return;
    }
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Create user document
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        name: 'Initial Admin',
        email: email,
        role: 'hr-admin',
        createdAt: Timestamp.now(),
        position: 'HR Manager',
        employeeId: 'ADMIN-001'
      });

      // Mark as initialized
      await setDoc(doc(db, 'settings', 'status'), {
        initialized: true,
        initializedAt: Timestamp.now(),
        initializedBy: user.uid
      });

      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to setup admin');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/');
    } catch (err: any) {
      if (err.code === 'auth/operation-not-allowed') {
        setError('Email/Password login is disabled. Please enable it in Firebase Console > Authentication > Sign-in method.');
      } else {
        setError(t('auth.error'));
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("min-h-screen flex items-center justify-center bg-gray-50 px-4", isRtl ? "font-arabic" : "font-sans")}>
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center">
            <Logo className="h-24 w-auto" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            {t('auth.login')}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {t('app.title')}
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          {error && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="email-address" className="block text-sm font-medium text-gray-700">
                {t('auth.email')}
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                {t('auth.password')}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="remember-me" className={cn("block text-sm text-gray-900", isRtl ? "mr-2" : "ml-2")}>
                {t('auth.remember')}
              </label>
            </div>

            <button
              type="button"
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-500"
            >
              <Globe className="w-4 h-4" />
              {language === 'en' ? 'العربية' : 'English'}
            </button>
          </div>

          <div className="space-y-4">
            {showSetup ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleSetupAdmin}
                  disabled={loading}
                  className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 transition-all"
                >
                  {loading ? 'Setting up...' : 'Setup Initial Admin'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all"
                >
                  {loading ? t('auth.signing_in') : t('auth.login')}
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;

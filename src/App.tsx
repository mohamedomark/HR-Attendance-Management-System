import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import Employees from './pages/Employees';
import Settings from './pages/Settings';

import { Toaster } from 'sonner';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, isAuthReady } = useAuth();

  if (!isAuthReady || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  return <Layout>{children}</Layout>;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAdmin, loading } = useAuth();

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" />;

  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  const { isAdmin, isPO } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      <Route path="/" element={
        <ProtectedRoute>
          {isAdmin && !isPO ? <AdminDashboard /> : <Dashboard />}
        </ProtectedRoute>
      } />

      <Route path="/employees" element={
        <ProtectedRoute>
          <AdminRoute>
            <Employees />
          </AdminRoute>
        </ProtectedRoute>
      } />

      <Route path="/attendance" element={
        <ProtectedRoute>
          <AdminRoute>
            <AdminDashboard />
          </AdminRoute>
        </ProtectedRoute>
      } />

      <Route path="/settings" element={
        <ProtectedRoute>
          <AdminRoute>
            <Settings />
          </AdminRoute>
        </ProtectedRoute>
      } />

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <AuthProvider>
          <Router>
            <AppRoutes />
            <Toaster position="top-right" expand={false} richColors />
          </Router>
        </AuthProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

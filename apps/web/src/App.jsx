import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import AppLayout from './components/layout/AppLayout';

// Lazy load pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Login = lazy(() => import('./pages/Login'));
const Routers = lazy(() => import('./pages/Routers'));
const RouterDetails = lazy(() => import('./pages/RouterDetails'));
const Olts = lazy(() => import('./pages/Olts'));
const OltDetails = lazy(() => import('./pages/OltDetails'));
const GenieACS = lazy(() => import('./pages/GenieACS'));
const NetworkMap = lazy(() => import('./pages/NetworkMap'));
const Alerts = lazy(() => import('./pages/Alerts'));
const Issues = lazy(() => import('./pages/Issues'));
const Users = lazy(() => import('./pages/Users'));
const Settings = lazy(() => import('./pages/Settings'));
const Netwatch = lazy(() => import('./pages/Netwatch'));
const NotificationGroups = lazy(() => import('./pages/NotificationGroups'));
const Analytics = lazy(() => import('./pages/Analytics'));
const AnimationDemo = lazy(() => import('./pages/AnimationDemo'));
const Tenants = lazy(() => import('./pages/Tenants'));
const KioskView = lazy(() => import('./pages/KioskView'));

import { useSession, useRole } from './lib/auth-client';

import { Toaster } from 'react-hot-toast';

// Error Boundary to capture detailed errors
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-8">
          <div className="max-w-2xl text-center">
            <h1 className="text-2xl font-bold text-red-400 mb-4">Something went wrong</h1>
            <pre className="text-left text-sm bg-slate-900 p-4 rounded-lg overflow-auto max-h-64 text-red-300">
              {this.state.error?.toString()}
              {this.state.errorInfo?.componentStack}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-primary rounded-lg"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function ProtectedRoute({ children }) {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-dark text-white">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AdminRoute({ children }) {
  const { isAdmin, isPending } = useRole();

  if (isPending) {
    return null; // Or a loading spinner
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}


function OperatorRoute({ children }) {
  const { isAdmin, isOperator, isPending } = useRole();

  if (isPending) {
    return null;
  }

  if (!isAdmin && !isOperator) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function SuperAdminRoute({ children }) {
  const { isSuperAdmin, isPending } = useRole();

  if (isPending) {
    return null;
  }

  if (!isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  const loading = (
    <div className="min-h-[400px] flex items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-slate-400">Loading page...</p>
      </div>
    </div>
  );

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <Toaster position="top-right" />
        <BrowserRouter>
          <Suspense fallback={loading}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/animation-demo" element={<AnimationDemo />} />

              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="map" element={<NetworkMap />} />
                <Route path="routers" element={
                  <ErrorBoundary>
                    <Routers />
                  </ErrorBoundary>
                } />
                <Route path="routers/:id" element={<RouterDetails />} />
                <Route path="olts" element={<Olts />} />
                <Route path="olts/:id" element={<OltDetails />} />
                <Route path="genieacs" element={<GenieACS />} />
                <Route path="alerts" element={<Alerts />} />
                <Route path="issues" element={<Issues />} />
                <Route path="netwatch" element={
                  <AdminRoute>
                    <Netwatch />
                  </AdminRoute>
                } />
                <Route path="users" element={
                  <AdminRoute>
                    <Users />
                  </AdminRoute>
                } />
                <Route path="notification-groups" element={
                  <AdminRoute>
                    <NotificationGroups />
                  </AdminRoute>
                } />
                <Route path="analytics" element={
                  <OperatorRoute>
                    <Analytics />
                  </OperatorRoute>
                } />
                <Route path="settings" element={<Settings />} />
                <Route path="tenants" element={
                  <SuperAdminRoute>
                    <Tenants />
                  </SuperAdminRoute>
                } />
              </Route>
              <Route path="/kiosk" element={
                <ProtectedRoute>
                  <KioskView />
                </ProtectedRoute>
              } />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

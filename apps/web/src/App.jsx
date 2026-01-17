import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Routers from './pages/Routers';
import RouterDetails from './pages/RouterDetails';
import NetworkMap from './pages/NetworkMap';
import Alerts from './pages/Alerts';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Netwatch from './pages/Netwatch';
import NotificationGroups from './pages/NotificationGroups';
import Pppoe from './pages/Pppoe';
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

function App() {
  return (
    <ErrorBoundary>
      <Toaster position="top-right" />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

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
            <Route path="alerts" element={<Alerts />} />
            <Route path="pppoe" element={<Pppoe />} />
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
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;

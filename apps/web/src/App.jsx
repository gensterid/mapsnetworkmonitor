import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import AppLayout from './components/layout/AppLayout';

// Lazy load pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Login = lazy(() => import('./pages/Login'));
const Routers = lazy(() => import('./pages/routers/index'));
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
const VpnServers = lazy(() => import('./pages/settings/vpn-servers'));
const Billing = lazy(() => import('./pages/Billing'));
const MikhmonLayout = lazy(() => import('./pages/mikhmon/MikhmonLayout'));
const MikhmonDashboard = lazy(() => import('./pages/mikhmon/Dashboard'));
const MikhmonHotspotProfiles = lazy(() => import('./pages/mikhmon/hotspot/Profiles'));
const MikhmonIpBindings = lazy(() => import('./pages/mikhmon/hotspot/IpBindings'));
const MikhmonWalledGarden = lazy(() => import('./pages/mikhmon/hotspot/WalledGarden'));
const MikhmonSimpleQueues = lazy(() => import('./pages/mikhmon/queues/Simple'));
const MikhmonHotspotUsers = lazy(() => import('./pages/mikhmon/hotspot/Users'));
const MikhmonHotspotActive = lazy(() => import('./pages/mikhmon/hotspot/Active'));
const MikhmonHotspotHosts = lazy(() => import('./pages/mikhmon/hotspot/Hosts'));
const MikhmonHotspotCookies = lazy(() => import('./pages/mikhmon/hotspot/Cookies'));
const MikhmonServerProfiles = lazy(() => import('./pages/mikhmon/hotspot/ServerProfiles'));
const MikhmonPppSecrets = lazy(() => import('./pages/mikhmon/ppp/Secrets'));
const MikhmonPppProfiles = lazy(() => import('./pages/mikhmon/ppp/Profiles'));
const MikhmonPppActive = lazy(() => import('./pages/mikhmon/ppp/Active'));
const MikhmonIpPool = lazy(() => import('./pages/mikhmon/ip/Pool'));
const MikhmonDhcpLease = lazy(() => import('./pages/mikhmon/ip/DhcpLease'));
const MikhmonAddressList = lazy(() => import('./pages/mikhmon/ip/AddressList'));
const MikhmonSystemLog = lazy(() => import('./pages/mikhmon/system/Log'));
const MikhmonSystemScheduler = lazy(() => import('./pages/mikhmon/system/Scheduler'));
const MikhmonSystemBackup = lazy(() => import('./pages/mikhmon/system/Backup'));
const MikhmonSystemPackages = lazy(() => import('./pages/mikhmon/system/Packages'));
const MikhmonVouchers = lazy(() => import('./pages/mikhmon/vouchers/Index'));
const MikhmonCetakCepat = lazy(() => import('./pages/mikhmon/vouchers/CetakCepat'));
const MikhmonReports = lazy(() => import('./pages/mikhmon/reports/Index'));
const MikhmonUploadLogo = lazy(() => import('./pages/mikhmon/settings/UploadLogo'));
const MikhmonTemplateEditor = lazy(() => import('./pages/mikhmon/settings/TemplateEditor'));
const VoucherPrint = lazy(() => import('./pages/VoucherPrint'));
const CekStatus = lazy(() => import('./pages/CekStatus'));
const Member = lazy(() => import('./pages/Member'));
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
    
    // Auto-reload on chunk load errors (common after new deployments)
    const isChunkError = error?.message?.includes('loading dynamically imported module') || 
                        error?.message?.includes('Failed to fetch dynamically imported module');
    
    if (isChunkError) {
      console.warn('Chunk load error detected. Attempting to fix by reloading...');
      // To avoid infinite reload loops, we check session storage
      const lastReload = sessionStorage.getItem('last-chunk-reload');
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload) > 30000) {
        sessionStorage.setItem('last-chunk-reload', now.toString());
        window.location.reload();
        return;
      }
    }
    
    this.setState({ errorInfo, isChunkError });
  }

  render() {
    if (this.state.hasError) {
      const isChunkError = this.state.isChunkError;
      
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-8">
          <div className="max-w-2xl text-center">
            <div className="mb-6 inline-flex p-4 bg-red-500/10 rounded-full text-red-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            
            <h1 className="text-2xl font-bold text-white mb-2">
              {isChunkError ? 'Update Aplikasi Tersedia' : 'Terjadi Kesalahan'}
            </h1>
            
            <p className="text-slate-400 mb-8 max-w-md mx-auto">
              {isChunkError 
                ? 'Versi baru aplikasi telah diinstal. Silakan muat ulang halaman untuk melanjutkan.' 
                : 'Kami mohon maaf atas ketidaknyamanan ini. Silakan coba muat ulang halaman atau hubungi administrator.'}
            </p>

            <div className="bg-slate-900 p-4 rounded-lg overflow-auto max-h-48 text-left text-xs text-red-300 font-mono mb-6 border border-red-500/20">
              <div className="font-bold mb-1">Error Trace:</div>
              {this.state.error?.toString()}
              <div className="mt-2 opacity-50">
                {this.state.errorInfo?.componentStack}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => window.location.reload(true)}
                className="w-full sm:w-auto px-6 py-3 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
                Muat Ulang Halaman
              </button>
              
              <button
                onClick={() => window.location.href = '/'}
                className="w-full sm:w-auto px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl transition-all"
              >
                Kembali ke Beranda
              </button>
            </div>
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
    <div className="fixed inset-0 flex items-center justify-center bg-[#020617] overflow-hidden">
      {/* Ambient radial glow */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0.04) 30%, transparent 65%)',
        }}
      />

      <div className="relative flex flex-col items-center gap-5">
        {/* Orbital ring stack */}
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 rounded-full border-2 border-primary/15" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
          <div
            className="absolute inset-2 rounded-full border-2 border-transparent border-b-sky-400/70"
            style={{ animation: 'spin 1.6s linear reverse infinite' }}
          />
          <div className="absolute inset-[30%] rounded-full bg-primary/80 blur-sm animate-pulse" />
        </div>

        <div className="flex flex-col items-center gap-1">
          <p className="text-sm font-medium text-slate-200 tracking-wide">NetMonitor</p>
          <p className="text-xs text-slate-500 tracking-[0.2em] uppercase">Loading</p>
        </div>
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
              <Route path="/cekstatus" element={<CekStatus />} />
              <Route path="/member" element={<Member />} />

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
                <Route path="billing" element={
                  <OperatorRoute>
                    <Billing />
                  </OperatorRoute>
                } />
                <Route path="mikhmon" element={
                  <OperatorRoute>
                    <MikhmonLayout />
                  </OperatorRoute>
                }>
                  <Route index element={<MikhmonDashboard />} />
                  <Route path="dashboard" element={<MikhmonDashboard />} />
                  <Route path="hotspot/profiles" element={<MikhmonHotspotProfiles />} />
                  <Route path="hotspot/ip-bindings" element={<MikhmonIpBindings />} />
                  <Route path="hotspot/walled-garden" element={<MikhmonWalledGarden />} />
                  <Route path="queues" element={<MikhmonSimpleQueues />} />
                  <Route path="hotspot/users" element={<MikhmonHotspotUsers />} />
                  <Route path="hotspot/active" element={<MikhmonHotspotActive />} />
                  <Route path="hotspot/hosts" element={<MikhmonHotspotHosts />} />
                  <Route path="hotspot/cookies" element={<MikhmonHotspotCookies />} />
                  <Route path="hotspot/server-profiles" element={<MikhmonServerProfiles />} />
                  <Route path="ppp/secrets" element={<MikhmonPppSecrets />} />
                  <Route path="ppp/profiles" element={<MikhmonPppProfiles />} />
                  <Route path="ppp/active" element={<MikhmonPppActive />} />
                  <Route path="ip/pool" element={<MikhmonIpPool />} />
                  <Route path="ip/dhcp-lease" element={<MikhmonDhcpLease />} />
                  <Route path="ip/address-list" element={<MikhmonAddressList />} />
                  <Route path="system/log" element={<MikhmonSystemLog />} />
                  <Route path="system/scheduler" element={<MikhmonSystemScheduler />} />
                  <Route path="system/backup" element={<MikhmonSystemBackup />} />
                  <Route path="system/packages" element={<MikhmonSystemPackages />} />
                  <Route path="vouchers" element={<MikhmonVouchers />} />
                  <Route path="cetak-cepat" element={<MikhmonCetakCepat />} />
                  <Route path="reports" element={<MikhmonReports />} />
                  <Route path="settings/upload-logo" element={<MikhmonUploadLogo />} />
                  <Route path="settings/template" element={<MikhmonTemplateEditor />} />
                </Route>
                <Route path="settings" element={<Settings />} />
                <Route path="tenants" element={
                  <SuperAdminRoute>
                    <Tenants />
                  </SuperAdminRoute>
                } />
                <Route path="settings/vpn-servers" element={
                  <SuperAdminRoute>
                    <VpnServers />
                  </SuperAdminRoute>
                } />
              </Route>
              <Route path="/kiosk" element={
                <ProtectedRoute>
                  <KioskView />
                </ProtectedRoute>
              } />
              <Route path="/billing/vouchers/print/:id" element={
                <ProtectedRoute>
                  <VoucherPrint />
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

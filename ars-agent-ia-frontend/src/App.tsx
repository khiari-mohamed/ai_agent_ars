import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useSessionGuard } from '@/lib/hooks/useSessionGuard';
import { canAccessRoute } from '@/admin/access';
import ErrorBoundary from '@/shared/components/ErrorBoundary';
import WidgetDemoPage from '@/widget/WidgetDemoPage';

const AdminLayout = lazy(() => import('@/admin/AdminLayout'));
const DashboardPage = lazy(() => import('@/admin/pages/DashboardPage'));
const ConversationsPage = lazy(() => import('@/admin/pages/ConversationsPage'));
const ConversationDetailPage = lazy(() => import('@/admin/pages/ConversationDetailPage'));
const TicketsPage = lazy(() => import('@/admin/pages/TicketsPage'));
const KnowledgeBasePage = lazy(() => import('@/admin/pages/KnowledgeBasePage'));
const AuditLogsPage = lazy(() => import('@/admin/pages/AuditLogsPage'));
const UsersPage = lazy(() => import('@/admin/pages/UsersPage'));
const SettingsPage = lazy(() => import('@/admin/pages/SettingsPage'));
const LoginPage = lazy(() => import('@/admin/pages/LoginPage'));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center" role="status" aria-live="polite">
      <span className="h-8 w-8 rounded-full border-2 border-slate-200 border-t-[#d62121] animate-spin motion-reduce:animate-none" />
      <span className="sr-only">Chargement…</span>
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();
  return isAuthenticated ? (
    <>{children}</>
  ) : (
    <Navigate to="/admin/login" replace state={{ from: location }} />
  );
}

function SessionGuard() {
  useSessionGuard();
  return null;
}

function RequireRoute({ path, children }: { path: string; children: ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);
  return canAccessRoute(role, path) ? <>{children}</> : <Navigate to="/admin/dashboard" replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <SessionGuard />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#fff',
              color: '#1e293b',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              fontSize: '14px',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.07)',
            },
          }}
        />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<WidgetDemoPage />} />
            <Route path="/admin/login" element={<LoginPage />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="conversations" element={<ConversationsPage />} />
              <Route path="conversations/:id" element={<ConversationDetailPage />} />
              <Route path="tickets" element={<TicketsPage />} />
              <Route path="knowledge" element={<KnowledgeBasePage />} />
              <Route path="audit" element={<RequireRoute path="/admin/audit"><AuditLogsPage /></RequireRoute>} />
              <Route path="users" element={<RequireRoute path="/admin/users"><UsersPage /></RequireRoute>} />
              <Route path="settings" element={<RequireRoute path="/admin/settings"><SettingsPage /></RequireRoute>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
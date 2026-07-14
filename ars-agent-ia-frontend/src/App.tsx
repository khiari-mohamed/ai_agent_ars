import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

// Admin pages
import AdminLayout    from '@/admin/AdminLayout';
import DashboardPage  from '@/admin/pages/DashboardPage';
import ConversationsPage from '@/admin/pages/ConversationsPage';
import ConversationDetailPage from '@/admin/pages/ConversationDetailPage';
import TicketsPage    from '@/admin/pages/TicketsPage';
import KnowledgeBasePage from '@/admin/pages/KnowledgeBasePage';
import AuditLogsPage  from '@/admin/pages/AuditLogsPage';
import UsersPage      from '@/admin/pages/UsersPage';
import SettingsPage   from '@/admin/pages/SettingsPage';
import LoginPage      from '@/admin/pages/LoginPage';
import SignupPage     from '@/admin/pages/SignupPage';

// Widget (demo page)
import WidgetDemoPage from '@/widget/WidgetDemoPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/admin/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
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
      <Routes>
        {/* Widget demo */}
        <Route path="/" element={<WidgetDemoPage />} />

        {/* Admin auth */}
        <Route path="/admin/login" element={<LoginPage />} />

        {/* Admin (protected) */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard"    element={<DashboardPage />} />
          <Route path="conversations" element={<ConversationsPage />} />
          <Route path="conversations/:id" element={<ConversationDetailPage />} />
          <Route path="tickets"      element={<TicketsPage />} />
          <Route path="knowledge"    element={<KnowledgeBasePage />} />
          <Route path="audit"        element={<AuditLogsPage />} />
          <Route path="users"        element={<UsersPage />} />
          <Route path="settings"     element={<SettingsPage />} />
        </Route>

        {/* Admin signup */}
        <Route path="/admin/signup" element={<SignupPage />} />

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
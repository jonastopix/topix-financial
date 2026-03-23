import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ViewModeProvider } from "@/hooks/useViewMode";
import ErrorBoundary from "@/components/ErrorBoundary";
import ScrollToTop from "@/components/ScrollToTop";
import Index from "./pages/Index";
import Reports from "./pages/Reports";
import Milestones from "./pages/Milestones";
import KPIs from "./pages/KPIs";
import Budget from "./pages/Budget";
import Handouts from "./pages/Handouts";

import Settings from "./pages/Settings";
import ChatShell from "./pages/ChatShell";
import Members from "./pages/Members";
import MemberDetail from "./pages/MemberDetail";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import AdminConfig from "./pages/AdminConfig";
import ReportDebug from "./pages/ReportDebug";
import EmailTemplates from "./pages/EmailTemplates";
import BulkImport from "./pages/BulkImport";
import ReportReviewQueue from "./pages/ReportReviewQueue";
import AdminFeedback from "./pages/AdminFeedback";
import AdminGroups from "./pages/AdminGroups";
import AdminGroupDetail from "./pages/AdminGroupDetail";
import Onboarding from "./pages/Onboarding";
import GroupDashboard from "./pages/GroupDashboard";
import GroupBudget from "./pages/GroupBudget";
import AdvisorGroupList from "./pages/AdvisorGroupList";
import AdvisorGroupDashboard from "./pages/AdvisorGroupDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, needsOnboarding } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/auth" replace />;
  if (needsOnboarding) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
};

const AdvisorRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, isAdvisor } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdvisor) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const returnUrl = new URLSearchParams(window.location.search).get("returnUrl");
  if (loading) return null;
  if (user) return <Navigate to={returnUrl || "/"} replace />;
  return <>{children}</>;
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <ViewModeProvider>
            <ScrollToTop />
            <Routes>
              <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
              <Route path="/budget" element={<ProtectedRoute><Budget /></ProtectedRoute>} />
              <Route path="/milestones" element={<ProtectedRoute><Milestones /></ProtectedRoute>} />
              <Route path="/handouts" element={<ProtectedRoute><Handouts /></ProtectedRoute>} />
              <Route path="/kpis" element={<ProtectedRoute><KPIs /></ProtectedRoute>} />
              <Route path="/chat" element={<ProtectedRoute><ChatShell /></ProtectedRoute>} />
              
              <Route path="/members" element={<AdvisorRoute><Members /></AdvisorRoute>} />
              <Route path="/members/:userId" element={<AdvisorRoute><MemberDetail /></AdvisorRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/admin/config" element={<AdminRoute><AdminConfig /></AdminRoute>} />
              <Route path="/admin/emails" element={<AdminRoute><EmailTemplates /></AdminRoute>} />
              <Route path="/admin/import" element={<AdminRoute><BulkImport /></AdminRoute>} />
              <Route path="/admin/review-queue" element={<AdminRoute><ReportReviewQueue /></AdminRoute>} />
              <Route path="/admin/report-debug/:reportId" element={<AdminRoute><ReportDebug /></AdminRoute>} />
              <Route path="/admin/feedback" element={<AdminRoute><AdminFeedback /></AdminRoute>} />
              <Route path="/admin/groups" element={<AdminRoute><AdminGroups /></AdminRoute>} />
              <Route path="/admin/groups/:groupId" element={<AdminRoute><AdminGroupDetail /></AdminRoute>} />
              <Route path="/groups" element={<AdvisorRoute><AdvisorGroupList /></AdvisorRoute>} />
              <Route path="/groups/:groupId" element={<AdvisorRoute><AdvisorGroupDashboard /></AdvisorRoute>} />
              <Route path="/group" element={<ProtectedRoute><GroupDashboard /></ProtectedRoute>} />
              <Route path="/group/budget" element={<ProtectedRoute><GroupBudget /></ProtectedRoute>} />
              <Route path="/group/onboarding" element={<Navigate to="/" replace />} />
              <Route path="/group/setup-complete" element={<Navigate to="/" replace />} />
              {/* Old group chat routes — redirect to unified /chat */}
              <Route path="/group/chat" element={<Navigate to="/chat" replace />} />
              <Route path="/group-chats" element={<Navigate to="/chat" replace />} />
              <Route path="/group-chats/:groupId/chat" element={<Navigate to="/chat" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </ViewModeProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;

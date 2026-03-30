import React, { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ViewModeProvider } from "@/hooks/useViewMode";
import ErrorBoundary from "@/components/ErrorBoundary";
import ScrollToTop from "@/components/ScrollToTop";

// Synchronous — needed on initial load
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";

// Lazy — member/advisor routes
const Reports = lazy(() => import("./pages/Reports"));
const Milestones = lazy(() => import("./pages/Milestones"));
const KPIs = lazy(() => import("./pages/KPIs"));
const Budget = lazy(() => import("./pages/Budget"));
const Handouts = lazy(() => import("./pages/Handouts"));
const Settings = lazy(() => import("./pages/Settings"));
const ChatShell = lazy(() => import("./pages/ChatShell"));
const Members = lazy(() => import("./pages/Members"));
const MemberDetail = lazy(() => import("./pages/MemberDetail"));
const Guide = lazy(() => import("./pages/Guide"));
const AnnualBaseline = lazy(() => import("./pages/AnnualBaseline"));
const Community = lazy(() => import("./pages/Community"));
const PulseCheckin = lazy(() => import("./pages/PulseCheckin"));
const ReportReviewQueue = lazy(() => import("./pages/ReportReviewQueue"));

// Lazy — admin-only routes
const AdminConfig = lazy(() => import("./pages/AdminConfig"));
const ReportDebug = lazy(() => import("./pages/ReportDebug"));
const EmailTemplates = lazy(() => import("./pages/EmailTemplates"));
const BulkImport = lazy(() => import("./pages/BulkImport"));
const AdminFeedback = lazy(() => import("./pages/AdminFeedback"));
const AdminGroups = lazy(() => import("./pages/AdminGroups"));
const AdminGroupDetail = lazy(() => import("./pages/AdminGroupDetail"));

// Lazy — group routes
const GroupDashboard = lazy(() => import("./pages/GroupDashboard"));
const GroupBudget = lazy(() => import("./pages/GroupBudget"));
const AdvisorGroupList = lazy(() => import("./pages/AdvisorGroupList"));
const AdvisorGroupDashboard = lazy(() => import("./pages/AdvisorGroupDashboard"));

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
            <Suspense fallback={
              <div className="flex h-screen items-center justify-center bg-background">
                <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            }>
            <Routes>
              <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
              <Route path="/auth/*" element={<AuthRoute><Auth /></AuthRoute>} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
              <Route path="/budget" element={<ProtectedRoute><Budget /></ProtectedRoute>} />
              <Route path="/milestones" element={<ProtectedRoute><Milestones /></ProtectedRoute>} />
              <Route path="/handouts" element={<ProtectedRoute><Handouts /></ProtectedRoute>} />
              <Route path="/kpis" element={<ProtectedRoute><KPIs /></ProtectedRoute>} />
              <Route path="/chat" element={<ProtectedRoute><ChatShell /></ProtectedRoute>} />
              <Route path="/pulse" element={<ProtectedRoute><PulseCheckin /></ProtectedRoute>} />
              <Route path="/community" element={<ProtectedRoute><Community /></ProtectedRoute>} />
              <Route path="/guide" element={<ProtectedRoute><Guide /></ProtectedRoute>} />
              <Route path="/annual-baseline" element={<ProtectedRoute><AnnualBaseline /></ProtectedRoute>} />
              
              <Route path="/members" element={<AdvisorRoute><Members /></AdvisorRoute>} />
              <Route path="/members/:userId" element={<AdvisorRoute><MemberDetail /></AdvisorRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/admin/config" element={<AdminRoute><AdminConfig /></AdminRoute>} />
              <Route path="/admin/emails" element={<AdminRoute><EmailTemplates /></AdminRoute>} />
              <Route path="/admin/import" element={<AdminRoute><BulkImport /></AdminRoute>} />
              <Route path="/admin/review-queue" element={<AdvisorRoute><ReportReviewQueue /></AdvisorRoute>} />
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

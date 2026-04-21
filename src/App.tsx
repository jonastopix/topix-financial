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
const BookSession = lazy(() => import("./pages/BookSession"));
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
const AdminEmailLog = lazy(() => import("./pages/AdminEmailLog"));
const BulkImport = lazy(() => import("./pages/BulkImport"));
const AdminFeedback = lazy(() => import("./pages/AdminFeedback"));
const AdminGroups = lazy(() => import("./pages/AdminGroups"));
const AdminGroupDetail = lazy(() => import("./pages/AdminGroupDetail"));
const AdminLegat = lazy(() => import("./pages/AdminLegat"));

// Lazy — group routes
const GroupDashboard = lazy(() => import("./pages/GroupDashboard"));
const GroupBudget = lazy(() => import("./pages/GroupBudget"));
const AdvisorGroupList = lazy(() => import("./pages/AdvisorGroupList"));
const AdvisorGroupDashboard = lazy(() => import("./pages/AdvisorGroupDashboard"));
const LegatDashboard = lazy(() => import("./pages/LegatDashboard"));

// Lazy — demo routes (no auth)
const DemoLayout = lazy(() => import("./demo/DemoLayout"));
const DemoDashboard = lazy(() => import("./demo/DemoDashboard"));
const DemoRapportering = lazy(() => import("./demo/DemoRapportering"));
const DemoBudget = lazy(() => import("./demo/DemoBudget"));
const DemoMilestones = lazy(() => import("./demo/DemoMilestones"));
const DemoKPIs = lazy(() => import("./demo/DemoKPIs"));
const DemoChat = lazy(() => import("./demo/DemoChat"));
const DemoHandouts = lazy(() => import("./demo/DemoHandouts"));

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, needsOnboarding, isAdvisor, membershipTier } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/auth" replace />;
  if (needsOnboarding) return <Navigate to="/onboarding" replace />;
  if (!isAdvisor && membershipTier === "expired") return <Navigate to="/" replace />;
  return <>{children}</>;
};

const MemberRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, needsOnboarding, isLegat, isAdvisor, membershipTier } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/auth" replace />;
  if (needsOnboarding) return <Navigate to="/onboarding" replace />;
  if (isLegat) return <Navigate to="/legat" replace />;
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
  const qs = new URLSearchParams(window.location.search);
  const returnUrl = qs.get("returnUrl");
  const force = qs.get("force");
  if (loading) return null;
  if (user && !force) return <Navigate to={returnUrl || "/"} replace />;
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
              <Route path="/" element={<MemberRoute><Index /></MemberRoute>} />
              <Route path="/reports" element={<MemberRoute><Reports /></MemberRoute>} />
              <Route path="/budget" element={<MemberRoute><Budget /></MemberRoute>} />
              <Route path="/milestones" element={<ProtectedRoute><Milestones /></ProtectedRoute>} />
              <Route path="/handouts" element={<ProtectedRoute><Handouts /></ProtectedRoute>} />
              <Route path="/kpis" element={<MemberRoute><KPIs /></MemberRoute>} />
              <Route path="/chat" element={<ProtectedRoute><ChatShell /></ProtectedRoute>} />
              <Route path="/book-session" element={<ProtectedRoute><BookSession /></ProtectedRoute>} />
              <Route path="/pulse" element={<ProtectedRoute><PulseCheckin /></ProtectedRoute>} />
              <Route path="/community" element={<ProtectedRoute><Community /></ProtectedRoute>} />
              <Route path="/guide" element={<ProtectedRoute><Guide /></ProtectedRoute>} />
              <Route path="/annual-baseline" element={<ProtectedRoute><AnnualBaseline /></ProtectedRoute>} />
              
              <Route path="/members" element={<AdvisorRoute><Members /></AdvisorRoute>} />
              <Route path="/members/:userId" element={<AdvisorRoute><MemberDetail /></AdvisorRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/admin/config" element={<AdminRoute><AdminConfig /></AdminRoute>} />
              <Route path="/admin/emails" element={<AdminRoute><EmailTemplates /></AdminRoute>} />
              <Route path="/admin/email-log" element={<AdminRoute><AdminEmailLog /></AdminRoute>} />
              <Route path="/admin/import" element={<AdminRoute><BulkImport /></AdminRoute>} />
              <Route path="/admin/review-queue" element={<AdvisorRoute><ReportReviewQueue /></AdvisorRoute>} />
              <Route path="/admin/report-debug/:reportId" element={<AdminRoute><ReportDebug /></AdminRoute>} />
              <Route path="/admin/feedback" element={<AdminRoute><AdminFeedback /></AdminRoute>} />
              <Route path="/admin/groups" element={<AdminRoute><AdminGroups /></AdminRoute>} />
              <Route path="/admin/groups/:groupId" element={<AdminRoute><AdminGroupDetail /></AdminRoute>} />
              <Route path="/admin/legat" element={<AdminRoute><AdminLegat /></AdminRoute>} />
              <Route path="/groups" element={<AdvisorRoute><AdvisorGroupList /></AdvisorRoute>} />
              <Route path="/groups/:groupId" element={<AdvisorRoute><AdvisorGroupDashboard /></AdvisorRoute>} />
              <Route path="/legat" element={<ProtectedRoute><LegatDashboard /></ProtectedRoute>} />
              <Route path="/group" element={<ProtectedRoute><GroupDashboard /></ProtectedRoute>} />
              <Route path="/group/budget" element={<ProtectedRoute><GroupBudget /></ProtectedRoute>} />
              <Route path="/group/onboarding" element={<Navigate to="/" replace />} />
              <Route path="/group/setup-complete" element={<Navigate to="/" replace />} />
              {/* Old group chat routes — redirect to unified /chat */}
              <Route path="/group/chat" element={<Navigate to="/chat" replace />} />
              <Route path="/group-chats" element={<Navigate to="/chat" replace />} />
              <Route path="/group-chats/:groupId/chat" element={<Navigate to="/chat" replace />} />
              {/* Demo routes — no auth required */}
              <Route path="/demo" element={<DemoLayout />}>
                <Route index element={<Navigate to="/demo/dashboard" replace />} />
                <Route path="dashboard" element={<DemoDashboard />} />
                <Route path="rapportering" element={<DemoRapportering />} />
                <Route path="budget" element={<DemoBudget />} />
                <Route path="milestones" element={<DemoMilestones />} />
                <Route path="kpis" element={<DemoKPIs />} />
                <Route path="handouts" element={<DemoHandouts />} />
                <Route path="chat" element={<DemoChat />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
            </ViewModeProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;

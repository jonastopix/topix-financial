import React, { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
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
const Milestones = lazy(() => import("./pages/Milestones"));
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
const AdminContent = lazy(() => import("./pages/AdminContent"));
const Akademiet = lazy(() => import("./pages/Akademiet"));

// Lazy — admin-only routes
const AdminConfig = lazy(() => import("./pages/AdminConfig"));
const ReportDebug = lazy(() => import("./pages/ReportDebug"));
const EmailTemplates = lazy(() => import("./pages/EmailTemplates"));
const AdminEmailLog = lazy(() => import("./pages/AdminEmailLog"));
const BulkImport = lazy(() => import("./pages/BulkImport"));
const AdminFeedback = lazy(() => import("./pages/AdminFeedback"));
const AdminLegat = lazy(() => import("./pages/AdminLegat"));
const LegatDashboard = lazy(() => import("./pages/LegatDashboard"));

// Lazy — designprøve (Projekt Hjemmebane V0)
const PreviewHjemmebane = lazy(() => import("./pages/PreviewHjemmebane"));

// Lazy — Hb-forsiden "Dit Boardroom" (route-parallel; advisor-gated indtil swap-GO)
const Boardroom = lazy(() => import("./pages/Boardroom"));

// Lazy — Hb-rapporteringen (bærer /reports efter Rapportering-GO 2026-08-06)
const Rapportering = lazy(() => import("./pages/Rapportering"));

// Lazy — Hb-KPI-fladen (bærer /kpis efter KPI-GO 2026-08-06)
const Noegletal = lazy(() => import("./pages/Noegletal"));

// Lazy — Hb-budgetfladen (bærer /budget efter Budget-GO 2026-08-06)
const Budgettering = lazy(() => import("./pages/Budgettering"));

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
  if (needsOnboarding && !isAdvisor) return <Navigate to="/onboarding" replace />;
  if (!isAdvisor && membershipTier === "expired" && window.location.pathname !== "/") return <Navigate to="/" replace />;
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
  if (needsOnboarding && !isAdvisor) return <Navigate to="/onboarding" replace />;
  if (isLegat) return <Navigate to="/legat" replace />;
  if (!isAdvisor && membershipTier === "expired" && window.location.pathname !== "/") return <Navigate to="/" replace />;
  return <>{children}</>;
};

/* KPI-GO (2026-08-06): /noegletal → /kpis. Hash/query bevares —
   #goals er Guide-kontrakt og skal overleve redirectet. */
const NoegletalRedirect = () => {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: "/kpis", search, hash }} replace />;
};

/* Rapportering-GO (2026-08-06): /rapportering → /reports. Hash/query
   bevares — ?reportId= er email-kontrakt og #upload/#annual-reports er
   Guide-kontrakt; begge skal overleve redirectet. */
const RapporteringRedirect = () => {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: "/reports", search, hash }} replace />;
};

/* Budget-GO (2026-08-06): /budgettering → /budget. Hash/query bevares —
   #forecast er Guide-kontrakt og detect-financial-alerts' deep_link
   "/budget" er notifikations-kontrakt; begge skal overleve redirectet. */
const BudgetteringRedirect = () => {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: "/budget", search, hash }} replace />;
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

const OnboardingRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, needsOnboarding, isAdvisor } = useAuth();

  // Mobile/PWA hardening: if the app is resumed from background while
  // sitting on /onboarding, force a re-check by reloading the route.
  // This catches iOS standalone "last route restore" edge cases.
  React.useEffect(() => {
    const onResume = () => {
      try {
        if (
          window.location.pathname === "/onboarding" &&
          localStorage.getItem("tbr.onboarded") === "1"
        ) {
          window.location.replace("/");
        }
      } catch { /* ignore */ }
    };
    window.addEventListener("pageshow", onResume);
    document.addEventListener("visibilitychange", onResume);
    return () => {
      window.removeEventListener("pageshow", onResume);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/auth" replace />;
  if (isAdvisor) return <Navigate to="/" replace />;
  if (!needsOnboarding) return <Navigate to="/" replace />;
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
              <Route path="/onboarding" element={<OnboardingRoute><Onboarding /></OnboardingRoute>} />
              <Route path="/" element={<MemberRoute><Index /></MemberRoute>} />
              {/* Rapportering-GO (2026-08-06): /reports bærer Hb-rapporteringen.
                  MemberRoute som før — advisors passerer (ingen isAdvisor-gate)
                  og vælger virksomhed via company-override, præcis som på
                  gammel /reports. */}
              <Route path="/reports" element={<MemberRoute><Rapportering /></MemberRoute>} />
              {/* Budget-GO (2026-08-06): /budget bærer Hb-budgetfladen.
                  MemberRoute som før — advisors passerer (ingen isAdvisor-gate)
                  og vælger virksomhed via company-override, præcis som på
                  gammel /budget. */}
              <Route path="/budget" element={<MemberRoute><Budgettering /></MemberRoute>} />
              <Route path="/milestones" element={<ProtectedRoute><Milestones /></ProtectedRoute>} />
              <Route path="/handouts" element={<ProtectedRoute><Handouts /></ProtectedRoute>} />
              {/* KPI-GO (2026-08-06): /kpis bærer Hb-KPI-fladen. MemberRoute
                  som før — advisors passerer (ingen isAdvisor-gate) og vælger
                  virksomhed via company-override, præcis som på gammel /kpis. */}
              <Route path="/kpis" element={<MemberRoute><Noegletal /></MemberRoute>} />
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
              {/* Hjemmebane C1 — indholdsstyring (advisor-only, standalone Hb-skal) */}
              <Route path="/admin/indhold" element={<AdvisorRoute><AdminContent view="content" /></AdvisorRoute>} />
              <Route path="/admin/indhold/partnere" element={<AdvisorRoute><AdminContent view="partners" /></AdvisorRoute>} />
              <Route path="/admin/indhold/events" element={<AdvisorRoute><AdminContent view="events" /></AdvisorRoute>} />
              <Route path="/admin/indhold/fremdrift" element={<AdvisorRoute><AdminContent view="progress" /></AdvisorRoute>} />
              <Route path="/admin/indhold/boardroom" element={<AdvisorRoute><AdminContent view="boardroom" /></AdvisorRoute>} />
              <Route path="/admin/report-debug/:reportId" element={<AdminRoute><ReportDebug /></AdminRoute>} />
              <Route path="/admin/feedback" element={<AdminRoute><AdminFeedback /></AdminRoute>} />
              <Route path="/admin/legat" element={<AdminRoute><AdminLegat /></AdminRoute>} />
              <Route path="/legat" element={<ProtectedRoute><LegatDashboard /></ProtectedRoute>} />
              {/* Hjemmebane C1 trin 3 — Akademiet (medlemsvisning, standalone Hb-skal) */}
              <Route path="/akademiet" element={<ProtectedRoute><Akademiet /></ProtectedRoute>} />
              <Route path="/akademiet/:area" element={<ProtectedRoute><Akademiet /></ProtectedRoute>} />
              <Route path="/akademiet/:area/:slug" element={<ProtectedRoute><Akademiet /></ProtectedRoute>} />
              {/* Designprøve (Hjemmebane V0) — standalone, bag login */}
              <Route path="/preview/hjemmebane" element={<ProtectedRoute><PreviewHjemmebane /></ProtectedRoute>} />
              {/* Hb-forsiden "Dit Boardroom" — AdvisorRoute KUN i byggeperioden;
                  swap-PR'en (GO) flytter den til "/"-medlemsgrenen. */}
              <Route path="/boardroom" element={<AdvisorRoute><Boardroom /></AdvisorRoute>} />
              {/* Rapportering-GO gennemført 2026-08-06: /reports bærer fladen
                  (email-kontrakt); /rapportering redirecter m. bevaret hash/query. */}
              <Route path="/rapportering" element={<RapporteringRedirect />} />
              {/* KPI-GO gennemført 2026-08-06: /kpis bærer fladen (notifikations-
                  kontrakt); /noegletal redirecter m. bevaret hash/query. */}
              <Route path="/noegletal" element={<NoegletalRedirect />} />
              {/* Budget-GO gennemført 2026-08-06: /budget bærer fladen
                  (notifikations-deep_link + Guide-hash er kontrakt);
                  /budgettering redirecter m. bevaret hash/query. */}
              <Route path="/budgettering" element={<BudgetteringRedirect />} />
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

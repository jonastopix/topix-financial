import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { useInactivityLogout } from "./useInactivityLogout";
import { InactivityWarningDialog } from "@/components/InactivityWarningDialog";
import { useQuery } from "@tanstack/react-query";
import { computeMembershipTier } from "@/lib/membershipTier";

/** Hvor langt virksomhedsopslaget er nået — så "ved det ikke endnu" kan
    skelnes fra "gik galt". Før denne tilstand var begge `companyId ===
    null`, og en bruger hvis kobling til virksomheden fejlede, stod på
    forsidens DashboardSkeleton for evigt (docs/indgangsfladen-design.md §5).
    - pending: opslaget kører (eller ingen session endnu).
    - resolved: brugeren har en virksomhed (company_members eller PPI-succes).
    - none: opslaget SVAREDE, og svaret var "ingen virksomhed" — det normale
      for en rådgiver uden egen virksomhed (PPI: no_pending_invitation).
    - failed: kaldet til process-pending-invitation GIK GALT (HTTP-fejl,
      exception, eller et svar der ikke er et af de kendte). */
export type CompanyResolution = "pending" | "resolved" | "none" | "failed";

interface AuthContext {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdvisor: boolean;
  isAdmin: boolean;
  isLegat: boolean;
  profile: { full_name: string; company_name: string; avatar_url: string; tour_completed_at: string | null } | null;
  companyId: string | null;
  companyName: string | null;
  /** The advisor's own company (unaffected by override) */
  ownCompanyId: string | null;
  ownCompanyName: string | null;
  /** True when viewing a different company than the advisor's own */
  isCompanyOverride: boolean;
  needsOnboarding: boolean;
  /** Membership tier: full (contract), subscriber (stripe), expired, or null */
  membershipTier: "full" | "subscriber" | "expired" | null;
  /** Se CompanyResolution. Index læser "failed" og viser en menneskelig
      flade i stedet for skelettet. */
  companyResolution: CompanyResolution;
  setCompanyOverride: (id: string, name: string) => void;
  clearCompanyOverride: () => void;
  setOnboardingComplete: () => void;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContext>({
  user: null,
  session: null,
  loading: true,
  isAdvisor: false,
  isAdmin: false,
  isLegat: false,
  profile: null,
  companyId: null,
  companyName: null,
  ownCompanyId: null,
  ownCompanyName: null,
  isCompanyOverride: false,
  needsOnboarding: false,
  membershipTier: null,
  companyResolution: "pending",
  setCompanyOverride: () => {},
  clearCompanyOverride: () => {},
  setOnboardingComplete: () => {},
  refreshProfile: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

/** Reads session_timeout_minutes from app_config */
function useSessionTimeout() {
  const { data } = useQuery({
    queryKey: ["app-config-session-timeout"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_config")
        .select("config_value")
        .eq("config_key", "session_timeout_minutes")
        .maybeSingle();
      return (data?.config_value as number) ?? undefined;
    },
    staleTime: 5 * 60 * 1000,
  });
  return data;
}

/** Svar fra process-pending-invitation der er SVAR, ikke fejl: brugeren
    har rettelig ingen virksomhed (endnu). Alt andet med success: false
    regnes som fejl — herunder "already_member", for så siger serveren at
    der findes et medlemskab, som opslaget ovenfor ikke kunne se; brugeren
    ville ellers stå uden virksomhed i state og ramme skelettet. */
const PPI_NORMALE_SVAR = new Set(["no_pending_invitation"]);

/** Uddrager status + grund fra en fejl fra supabase.functions.invoke, så
    den kan genfindes i Supabase-loggen sammen med funktionens egen linje.
    FunctionsHttpError bærer Response i `context`; relay-/fetch-fejl har
    kun en besked. */
async function laesInvokeFejl(err: unknown): Promise<string> {
  const ctx = (err as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.clone().json()) as { reason?: string; error?: string; detail?: string };
      const grund = body?.reason ?? body?.error ?? body?.detail;
      return `http_${ctx.status}${grund ? ` ${String(grund)}` : ""}`;
    } catch {
      return `http_${ctx.status}`;
    }
  }
  return err instanceof Error ? err.message : String(err);
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdvisor, setIsAdvisor] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLegat, setIsLegat] = useState(false);
  const [profile, setProfile] = useState<AuthContext["profile"]>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [membershipTier, setMembershipTier] = useState<"full" | "subscriber" | "expired" | null>(null);
  const [companyResolution, setCompanyResolution] = useState<CompanyResolution>("pending");
  const [ownCompanyId, setOwnCompanyId] = useState<string | null>(null);
  const [ownCompanyName, setOwnCompanyName] = useState<string | null>(null);

  // Override state
  const [overrideCompanyId, setOverrideCompanyId] = useState<string | null>(null);
  const [overrideCompanyName, setOverrideCompanyName] = useState<string | null>(null);

  const companyId = overrideCompanyId ?? ownCompanyId;
  const companyName = overrideCompanyName ?? ownCompanyName;
  const isCompanyOverride = overrideCompanyId != null;

  const setCompanyOverride = useCallback((id: string, name: string) => {
    setOverrideCompanyId(id);
    setOverrideCompanyName(name);
  }, []);

  const clearCompanyOverride = useCallback(() => {
    setOverrideCompanyId(null);
    setOverrideCompanyName(null);
  }, []);

  const setOnboardingComplete = useCallback(() => {
    setNeedsOnboarding(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("full_name, company_name, avatar_url, onboarded_at, tour_completed_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) setProfile(data);
  }, [user]);

  const fetchUserData = async (userId: string) => {
    const [rolesRes, profileRes, companyRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("full_name, company_name, avatar_url, onboarded_at, tour_completed_at").eq("user_id", userId).maybeSingle(),
      supabase
        .from("company_members" as any)
        .select("company_id, companies:company_id(id, name)" as any)
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
    ]);
    const roles = rolesRes.data?.map((r) => r.role) ?? [];
    const isAdv = roles.includes("advisor") || roles.includes("admin");
    setIsAdvisor(isAdv);
    setIsAdmin(roles.includes("admin" as any));
    let legatRow: any = null;
    if (!isAdv) {
      const { data } = await supabase
        .from("legat_enrollments" as any)
        .select("id")
        .eq("user_id", userId)
        .in("status", ["active", "completed"])
        .maybeSingle();
      legatRow = data;
      setIsLegat(!!legatRow);
    } else {
      setIsLegat(false);
    }
    setProfile(profileRes.data);
    // Advisors never need onboarding
    const profileData = profileRes.data as any;
    const legatActive = !isAdv && !!legatRow;
    const profileOnboarded = !!(profileData?.onboarded_at);

    // Invalidate stale localStorage flag if server has been reset. Without this,
    // a stale "1" could mask a server-side onboarding reset within the same
    // session before the persist block below runs.
    const localFlag = localStorage.getItem("tbr.onboarded");
    const serverOnboarded = isAdv || profileOnboarded || legatActive;
    if (localFlag === "1" && !serverOnboarded) {
      try { localStorage.removeItem("tbr.onboarded"); } catch { /* ignore */ }
    }

    const computedNeedsOnboarding = !isAdv && !legatActive && !profileOnboarded;
    setNeedsOnboarding(computedNeedsOnboarding);

    // Persist a "known onboarded" flag for the pre-React redirect in main.tsx,
    // so iOS standalone / mobile restoring /onboarding gets bounced instantly.
    try {
      if (isAdv || profileOnboarded || legatActive) {
        localStorage.setItem("tbr.onboarded", "1");
      } else {
        localStorage.removeItem("tbr.onboarded");
      }
    } catch {
      // ignore
    }

    const cm = companyRes.data as any;
    if (cm?.company_id) {
      setOwnCompanyId(cm.company_id);
      setOwnCompanyName(cm.companies?.name || null);
      setCompanyResolution("resolved");

      // Determine membership tier
      if (isAdv) {
        setMembershipTier("full");
      } else {
        const { data: companyTierData } = await supabase
          .from("companies")
          .select("contract_end_date, subscription_status, subscription_current_period_end")
          .eq("id", cm.company_id)
          .maybeSingle();

        if (!companyTierData) {
          setMembershipTier("full");
        } else {
          // no_date → "full" preserves pre-existing UX: legacy or manually managed
          // companies appear as full to their own users. Members.tsx renders no_date
          // as a distinct badge — that drift is intentional, not fixed here.
          const tier = computeMembershipTier(companyTierData);
          setMembershipTier(tier === "no_date" ? "full" : tier);
        }
      }

      // Trigger onboarding agent if this is first login for an imported company
      const { data: companyMeta } = await supabase
        .from("companies")
        .select("onboarding_completed, application_context")
        .eq("id", cm.company_id)
        .maybeSingle();

      if (companyMeta?.onboarding_completed === false && companyMeta?.application_context && profileOnboarded) {
        // Mark completed immediately to prevent duplicate runs on rapid re-auth
        await supabase
          .from("companies")
          .update({ onboarding_completed: true })
          .eq("id", cm.company_id);

        // Fire and forget — non-blocking. TØR (lukket 2026-08-25): forslagene
        // lander i agent_proposals og godkendes af en rådgiver — intet når
        // medlemmet uden godkendelse.
        supabase.functions.invoke("run-company-agent", {
          body: {
            company_id: cm.company_id,
            trigger: "onboarding",
            period_key: new Date().toISOString().slice(0, 7),
            period_label: new Date().toLocaleDateString("da-DK", { month: "long", year: "numeric" }),
            dry_run: true,
          },
        }).catch((err) => console.warn("Onboarding agent failed:", err));
      }
    } else {
      // No company membership — check for pending invitation
      const authUser = (await supabase.auth.getUser()).data.user;
      const userEmail = authUser?.email;
      const inviteTokenMeta = authUser?.user_metadata?.invite_token;
      if (userEmail) {
        // Tre fejlgrene (HTTP-fejl, uventet svar, exception) sætter alle
        // companyResolution = "failed", så Index kan vise noget menneskeligt
        // frem for et skelet der aldrig fyldes. Et SVAR der siger "ingen
        // invitation" er ikke en fejl — det er en rådgiver uden egen
        // virksomhed, hver eneste gang. Loglinjen bærer user_id og PPI's
        // grund, så den kan genfindes i Supabase-loggen.
        const markerFejl = (grund: string) => {
          console.error(
            `[useAuth] process-pending-invitation fejlede user_id=${userId} reason=${grund}`,
          );
          setOwnCompanyId(null);
          setOwnCompanyName(null);
          setMembershipTier(null);
          setCompanyResolution("failed");
        };
        try {
          const { data: invResult, error: invError } = await supabase.functions.invoke(
            "process-pending-invitation",
            { body: { user_id: userId, invite_token: inviteTokenMeta || null } }
          );
          if (invError) {
            // HTTP-fejl: invoke returnerer fejlen i stedet for at kaste.
            // Før lå den skjult som "invResult undefined" i else-grenen.
            markerFejl(await laesInvokeFejl(invError));
          } else if (invResult?.success) {
            setOwnCompanyId(invResult.company_id);
            setOwnCompanyName(invResult.company_name);
            setCompanyResolution("resolved");
          } else if (typeof invResult?.reason === "string" && PPI_NORMALE_SVAR.has(invResult.reason)) {
            setOwnCompanyId(null);
            setOwnCompanyName(null);
            setMembershipTier(null);
            setCompanyResolution("none");
          } else {
            markerFejl(
              typeof invResult?.reason === "string"
                ? invResult.reason
                : typeof invResult?.error === "string"
                  ? invResult.error
                  : "uventet_svar",
            );
          }
        } catch (e) {
          markerFejl(e instanceof Error ? e.message : String(e));
        }
      } else {
        setOwnCompanyId(null);
        setOwnCompanyName(null);
        setMembershipTier(null);
        setCompanyResolution("none");
      }
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        // Stamp activity immediately on sign-in to prevent inactivity hook
        // from seeing a stale timestamp after OAuth redirects (Google etc.)
        if (_event === "SIGNED_IN") {
          localStorage.setItem("lastActivityAt", Date.now().toString());
        }
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Log login event
          if (_event === "SIGNED_IN") {
            supabase.rpc("log_user_login" as any).then(({ error }) => {
              if (error) console.error("Failed to log login:", error);
            });
          }
          setTimeout(async () => {
            try {
              await fetchUserData(session.user.id);
            } catch (e) {
              console.error("[useAuth] fetchUserData failed:", e);
            } finally {
              setLoading(false);
            }
          }, 0);
        } else {
          setIsAdvisor(false);
          setIsAdmin(false);
          setIsLegat(false);
          setProfile(null);
          setNeedsOnboarding(false);
          try { localStorage.removeItem("tbr.onboarded"); } catch { /* ignore */ }
          setOwnCompanyId(null);
          setOwnCompanyName(null);
          setOverrideCompanyId(null);
          setOverrideCompanyName(null);
          setMembershipTier(null);
          setCompanyResolution("pending");
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session) setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  // Inactivity auto-logout (reads session_timeout_minutes from app_config)
  const sessionTimeoutMinutes = useSessionTimeout();
  const { showWarning, secondsLeft, extendSession } = useInactivityLogout(!!user, sessionTimeoutMinutes);

  return (
    <AuthContext.Provider value={{
      user, session, loading, isAdvisor, isAdmin, isLegat, profile,
      companyId, companyName,
      ownCompanyId, ownCompanyName,
      isCompanyOverride, needsOnboarding,
      membershipTier, companyResolution,
      setCompanyOverride, clearCompanyOverride, setOnboardingComplete,
      refreshProfile, signOut,
    }}>
      {children}
      <InactivityWarningDialog
        open={showWarning}
        secondsLeft={secondsLeft}
        onExtend={extendSession}
      />
    </AuthContext.Provider>
  );
};

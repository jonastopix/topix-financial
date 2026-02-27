import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContext {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdvisor: boolean;
  isAdmin: boolean;
  profile: { full_name: string; company_name: string; avatar_url: string } | null;
  companyId: string | null;
  companyName: string | null;
  /** The advisor's own company (unaffected by override) */
  ownCompanyId: string | null;
  ownCompanyName: string | null;
  /** True when viewing a different company than the advisor's own */
  isCompanyOverride: boolean;
  needsOnboarding: boolean;
  setCompanyOverride: (id: string, name: string) => void;
  clearCompanyOverride: () => void;
  setOnboardingComplete: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContext>({
  user: null,
  session: null,
  loading: true,
  isAdvisor: false,
  isAdmin: false,
  profile: null,
  companyId: null,
  companyName: null,
  ownCompanyId: null,
  ownCompanyName: null,
  isCompanyOverride: false,
  needsOnboarding: false,
  setCompanyOverride: () => {},
  clearCompanyOverride: () => {},
  setOnboardingComplete: () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdvisor, setIsAdvisor] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState<AuthContext["profile"]>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
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

  const fetchUserData = async (userId: string) => {
    const [rolesRes, profileRes, companyRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("full_name, company_name, avatar_url, onboarded_at").eq("user_id", userId).maybeSingle(),
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
    setProfile(profileRes.data);
    // Advisors never need onboarding
    const profileData = profileRes.data as any;
    setNeedsOnboarding(!isAdv && profileData && !profileData.onboarded_at);

    const cm = companyRes.data as any;
    if (cm?.company_id) {
      setOwnCompanyId(cm.company_id);
      setOwnCompanyName(cm.companies?.name || null);
    } else {
      // No company membership — check for pending invitation
      const userEmail = (await supabase.auth.getUser()).data.user?.email;
      if (userEmail) {
        try {
          const { data: invResult } = await supabase.functions.invoke(
            "process-pending-invitation",
            { body: { user_id: userId, email: userEmail } }
          );
          if (invResult?.success) {
            setOwnCompanyId(invResult.company_id);
            setOwnCompanyName(invResult.company_name);
          } else {
            setOwnCompanyId(null);
            setOwnCompanyName(null);
          }
        } catch (e) {
          console.error("Failed to process pending invitation:", e);
          setOwnCompanyId(null);
          setOwnCompanyName(null);
        }
      } else {
        setOwnCompanyId(null);
        setOwnCompanyName(null);
      }
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(async () => {
            await fetchUserData(session.user.id);
            setLoading(false);
          }, 0);
        } else {
          setIsAdvisor(false);
          setIsAdmin(false);
          setProfile(null);
          setNeedsOnboarding(false);
          setOwnCompanyId(null);
          setOwnCompanyName(null);
          setOverrideCompanyId(null);
          setOverrideCompanyName(null);
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

  return (
    <AuthContext.Provider value={{
      user, session, loading, isAdvisor, isAdmin, profile,
      companyId, companyName,
      ownCompanyId, ownCompanyName,
      isCompanyOverride, needsOnboarding,
      setCompanyOverride, clearCompanyOverride, setOnboardingComplete,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

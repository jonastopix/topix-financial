import { useState, useEffect, useRef, createContext, useContext, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { useInactivityLogout } from "./useInactivityLogout";
import { erTjenestekonto } from "./tjenestekonti";
import { inaktivitetsLogudAktiv, laeseMarkeringTilladt } from "@/lib/tjenestekonto";
import { InactivityWarningDialog } from "@/components/InactivityWarningDialog";
import { useQuery } from "@tanstack/react-query";
import {
  medTimeout,
  PPI_TIMEOUT_MEDLEM_MS,
  skalHenteBrugerdata,
  skalKaldePendingInvitation,
  skalLoggeLogin,
  skalStarteOnboardingAgent,
  tierFraVirksomhed,
  type HentningsTilstand,
  type VirksomhedsFelter,
} from "@/lib/authIndlaesning";

/** Hvor langt virksomhedsopslaget er nået — så "ved det ikke endnu" kan
    skelnes fra "gik galt". Før denne tilstand var begge `companyId ===
    null`, og en bruger hvis kobling til virksomheden fejlede, stod på
    forsidens DashboardSkeleton for evigt (docs/indgangsfladen-design.md §5;
    komponenten er fjernet 3/9 — Index viser CompanyLinkFailedGate).
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
  /** Rollen partner (Ø2, 18/9): præcis Jonas og Morten — økonomioverblikket.
      Arves ikke af admin og arver intet (has_role kender kun admin → advisor). */
  isPartner: boolean;
  isLegat: boolean;
  profile: { full_name: string; company_name: string; avatar_url: string; tour_completed_at: string | null } | null;
  companyId: string | null;
  companyName: string | null;
  /** The advisor's own company (unaffected by override) */
  ownCompanyId: string | null;
  ownCompanyName: string | null;
  /** True when viewing a different company than the advisor's own */
  isCompanyOverride: boolean;
  /** Membership tier: full (contract), subscriber (stripe), expired, or null */
  membershipTier: "full" | "subscriber" | "expired" | null;
  /** Se CompanyResolution. Index læser "failed" og viser en menneskelig
      flade i stedet for skelettet. */
  companyResolution: CompanyResolution;
  /** TJENESTEKONTI (30/9-2026, src/lib/tjenestekonto.ts): true når et ja står
      (også efter en fejlet genhentning); false når svaret er nej, henter
      eller fejlede uden et tidligere ja. Samme query som logud-reglen. */
  erTjenestekonto: boolean;
  /** Må det at SE skrive et spor (læst, set, visning)? laeseMarkeringTilladt-
      dommen: nej for en tjenestekonto og mens opslaget henter. Stederne står
      i kildeværnet tjenestekonto.guard dom 6. */
  laeseMarkeringTilladt: boolean;
  setCompanyOverride: (id: string, name: string) => void;
  clearCompanyOverride: () => void;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContext>({
  user: null,
  session: null,
  loading: true,
  isAdvisor: false,
  isAdmin: false,
  isPartner: false,
  isLegat: false,
  profile: null,
  companyId: null,
  companyName: null,
  ownCompanyId: null,
  ownCompanyName: null,
  isCompanyOverride: false,
  membershipTier: null,
  companyResolution: "pending",
  erTjenestekonto: false,
  laeseMarkeringTilladt: false,
  setCompanyOverride: () => {},
  clearCompanyOverride: () => {},
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

/** Medlemmets tier ud fra virksomhedens kontraktdatoer og abonnement —
    én regel, brugt både når company_members-rækken findes ved opslaget
    (trin D) og når process-pending-invitation lige har koblet den
    (trin 10, docs/indgangen-overhaling.md §7.1: PPI-grenen satte før kun
    companyId, aldrig tier, så det nykoblede medlem stod på skelettet til
    næste auth-event). Ingen række (RLS/mangler) og no_date giver begge
    "full": legacy eller manuelt styrede virksomheder ser ud som fulde for
    deres egne brugere. Members.tsx viser no_date som en særskilt badge —
    den drift er bevidst, ikke rettet her. */
async function afgoerMedlemsTier(companyId: string): Promise<"full" | "subscriber" | "expired"> {
  const { data: companyTierData } = await supabase
    .from("companies")
    .select("contract_end_date, subscription_status, subscription_current_period_end")
    .eq("id", companyId)
    .maybeSingle();
  return tierFraVirksomhed(companyTierData);
}

/** Medlemskabet med virksomhedens tier- og onboarding-felter i SAMME
    join (29/9, analyse-hastighed.md #1): før var tier og onboarding-flaget
    to rundture mere i serie efter dette opslag. Felterne er de samme, som
    afgoerMedlemsTier og onboarding-opslaget læste hver for sig — samme
    tabel, samme RLS. Fejler den brede forespørgsel alligevel (fx en
    kolonne-rettighed), falder hentningen tilbage på den smalle med de to
    gamle enkeltopslag, så det værste udfald er den gamle hastighed —
    aldrig et medlem uden virksomhed. */
const MEDLEMSKAB_BRED =
  "company_id, companies:company_id(id, name, contract_end_date, subscription_status, subscription_current_period_end, onboarding_completed, application_context)";
const MEDLEMSKAB_SMAL = "company_id, companies:company_id(id, name)";

function hentMedlemskab(userId: string, felter: string) {
  return supabase
    .from("company_members" as any)
    .select(felter as any)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  /** Bruger-id'et i den session, auth-handleren SIDST så (null = ingen
      session). En ref, ikke `user` fra closure: handleren registreres én
      gang (deps []), så `user` derinde er altid mount-værdien (null). Se
      overgangs-logikken i handleren. */
  const sidsteBrugerIdRef = useRef<string | null>(null);
  /** Hvor langt brugerdata-hentningen er (lib/authIndlaesning.ts
      skalHenteBrugerdata): hentet færdig for hvem, og kører der en nu. */
  const hentningRef = useRef<HentningsTilstand>({ hentetFor: null, igangFor: null });
  const [isAdvisor, setIsAdvisor] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPartner, setIsPartner] = useState(false);
  const [isLegat, setIsLegat] = useState(false);
  const [profile, setProfile] = useState<AuthContext["profile"]>(null);
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

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("full_name, company_name, avatar_url, onboarded_at, tour_completed_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) setProfile(data);
  }, [user]);

  /** Henter roller, profil, legat og virksomhed for brugeren og sætter
      state. Svarer true, når alt er afgjort; false, når koblingen til
      virksomheden fejlede eller ikke nåede at svare — så næste
      auth-hændelse prøver igen (skalHenteBrugerdata). */
  const fetchUserData = async (authUser: User): Promise<boolean> => {
    const userId = authUser.id;
    // ÉN rundtur (29/9, analyse-hastighed.md #1): legat hentes nu for alle
    // i samme Promise.all — før var det en rundtur mere i serie for
    // medlemmer. For en rådgiver smides svaret væk (isLegat er altid
    // false for rådgivere, som før).
    const [rolesRes, profileRes, bredRes, legatRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("full_name, company_name, avatar_url, onboarded_at, tour_completed_at").eq("user_id", userId).maybeSingle(),
      hentMedlemskab(userId, MEDLEMSKAB_BRED),
      supabase
        .from("legat_enrollments" as any)
        .select("id")
        .eq("user_id", userId)
        .in("status", ["active", "completed"])
        .maybeSingle(),
    ]);
    let companyRes = bredRes;
    let bredtHentet = true;
    if (bredRes.error) {
      console.warn(
        `[useAuth] bredt medlemskabsopslag fejlede user_id=${userId} — falder tilbage på enkeltopslag:`,
        bredRes.error,
      );
      companyRes = await hentMedlemskab(userId, MEDLEMSKAB_SMAL);
      bredtHentet = false;
    }
    const roles = rolesRes.data?.map((r) => r.role) ?? [];
    const isAdv = roles.includes("advisor") || roles.includes("admin");
    setIsAdvisor(isAdv);
    setIsAdmin(roles.includes("admin" as any));
    setIsPartner(roles.includes("partner" as any));
    setIsLegat(!isAdv && !!legatRes.data);
    setProfile(profileRes.data);
    // Onboarding-porten er pensioneret (trin 7, docs/indgangen-overhaling.md
    // §9): auth-kontraktens onboarding-flag, localStorage-flaget og
    // udledningen fra profilens stempel er væk. profiles.onboarded_at
    // læses stadig i opslaget ovenfor som historik.

    const cm = companyRes.data as any;
    if (cm?.company_id) {
      // Virksomhedens felter: fra joinet (ingen ekstra rundtur), eller —
      // kun hvis den brede forespørgsel fejlede — fra de to gamle
      // enkeltopslag, præcis som før.
      let virksomhed: VirksomhedsFelter | null;
      let tier: "full" | "subscriber" | "expired";
      if (bredtHentet) {
        virksomhed = (cm.companies ?? null) as VirksomhedsFelter | null;
        tier = isAdv ? "full" : tierFraVirksomhed(virksomhed);
      } else {
        tier = isAdv ? "full" : await afgoerMedlemsTier(cm.company_id);
        const { data: companyMeta } = await supabase
          .from("companies")
          .select("onboarding_completed, application_context")
          .eq("id", cm.company_id)
          .maybeSingle();
        virksomhed = companyMeta as VirksomhedsFelter | null;
      }
      setOwnCompanyId(cm.company_id);
      setOwnCompanyName(cm.companies?.name || null);
      setCompanyResolution("resolved");
      // Determine membership tier (rådgiveren er altid "full", som før)
      setMembershipTier(tier);

      // Trigger onboarding agent if this is first login for an imported company
      // (trin 6, docs/indgangen-overhaling.md §9): betingelsen bærer IKKE
      // profileOnboarded. onboarding_completed er det egentlige værn (sættes
      // true lige herunder, før kaldet), Onboarding.tsx:89 har altid kørt
      // uden leddet, og profiles.onboarded_at holder op med at blive
      // skrevet når porten pensioneres i trin 7.
      if (skalStarteOnboardingAgent(virksomhed)) {
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
      return true;
    } else {
      // No company membership — check for pending invitation.
      // Email og invite_token læses af sessionens bruger (29/9): før var det
      // en ekstra rundtur (auth.getUser) før PPI. process-pending-invitation
      // validerer selv JWT'en på serveren; her er det kun kaldets input.
      const userEmail = authUser.email;
      const inviteTokenMeta = authUser.user_metadata?.invite_token;
      // Dommen skalKaldePendingInvitation (3/10, pakke D): en KENDT
      // rådgiver/admin kalder ALDRIG PPI — PPI kan koble en virksomhed på
      // kontoen, og huset forbyder det (attach-user-to-company/index.ts:66-87).
      // Rollen er kendt fra Promise.all ovenfor — ingen ekstra ventetid.
      // Ukendt rolle (roller-opslaget fejlede) og medlemmer kalder som før.
      const kalderPpi = skalKaldePendingInvitation({
        rolleKendt: !rolesRes.error,
        erRaadgiver: isAdv,
      });
      if (!kalderPpi) {
        setOwnCompanyId(null);
        setOwnCompanyName(null);
        setMembershipTier(null);
        setCompanyResolution("none");
        return true;
      }
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
        // Her er kontoen aldrig en kendt rådgiver (dommen ovenfor): ét timeout.
        const ppiTimeoutMs = PPI_TIMEOUT_MEDLEM_MS;
        try {
          // Ventetiden kappes (29/9, analyse-hastighed.md #2): før kunne en
          // koldstart holde forsiden tilbage i ubestemt tid. Kaldet kører
          // videre på serveren; kun ventetiden er kappet.
          const ppi = await medTimeout(
            supabase.functions.invoke(
              "process-pending-invitation",
              { body: { user_id: userId, invite_token: inviteTokenMeta || null } }
            ),
            ppiTimeoutMs,
          );
          if (ppi.udfald === "timeout") {
            markerFejl(`timeout_${ppiTimeoutMs}ms`);
            return false;
          }
          const { data: invResult, error: invError } = ppi.vaerdi;
          if (invError) {
            // HTTP-fejl: invoke returnerer fejlen i stedet for at kaste.
            // Før lå den skjult som "invResult undefined" i else-grenen.
            markerFejl(await laesInvokeFejl(invError));
            return false;
          } else if (invResult?.success) {
            setOwnCompanyId(invResult.company_id);
            setOwnCompanyName(invResult.company_name);
            setCompanyResolution("resolved");
            // Koblingen lykkedes — tier afgøres med SAMME regel som når
            // rækken fandtes ved opslaget ovenfor. Uden denne linje stod
            // det nykoblede medlem med tier null, og Index viste gaten om
            // noget der gik godt (trin 10, §7.1). Rækken er lige skrevet
            // med service role, så user_company_id() finder den, og RLS
            // på companies slipper opslaget igennem.
            setMembershipTier(await afgoerMedlemsTier(invResult.company_id));
            return true;
          } else if (typeof invResult?.reason === "string" && PPI_NORMALE_SVAR.has(invResult.reason)) {
            setOwnCompanyId(null);
            setOwnCompanyName(null);
            setMembershipTier(null);
            setCompanyResolution("none");
            return true;
          } else {
            markerFejl(
              typeof invResult?.reason === "string"
                ? invResult.reason
                : typeof invResult?.error === "string"
                  ? invResult.error
                  : "uventet_svar",
            );
            return false;
          }
        } catch (e) {
          markerFejl(e instanceof Error ? e.message : String(e));
          return false;
        }
      } else {
        setOwnCompanyId(null);
        setOwnCompanyName(null);
        setMembershipTier(null);
        setCompanyResolution("none");
        return true;
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
          // Det grønne blink efter login (trin 13, docs/indgangen-overhaling.md
          // §7.1): porten skal lukkes mens fetchUserData afgør tier, ellers
          // slipper MemberRoute igennem med membershipTier === null og Index
          // tegner det gamle DashboardSkeleton (fjernet 3/9; i dag ville det
          // være CompanyLinkFailedGate). Betingelsen er OVERGANGEN
          // ingen-session → session — IKKE `_event === "SIGNED_IN"`. auth-js
          // 2.97 udsender SIGNED_IN i fire situationer ud over login
          // (~/Downloads/recon-loading.md §3):
          //   1. hvert faneskift tilbage til appen (_onVisibilityChanged →
          //      _recoverAndRefresh), medmindre token er ≤ 90 s fra udløb;
          //   2. cross-tab broadcast — et SIGNED_IN i en anden fane
          //      genudsendes her;
          //   3. kodeordsskift i Settings (re-auth via signInWithPassword);
          //   4. hard reload (_initialize → _recoverAndRefresh).
          // I alle fire findes brugeren allerede, og et loading=true ville
          // afmontere hele rute-træet under guarden: kodeordsfelter,
          // upload-tilstand og Tiptap-kladder ville forsvinde midt i en
          // handling. Kun når handleren sidst så INGEN session (login efter
          // /auth, login efter udlogning), er der noget at holde porten
          // lukket for. Ved hard reload er loading allerede sand fra
          // useState — kaldet er harmløst.
          //
          // Genhentningen følger SAMME overgang (29/9, analyse-hastighed.md
          // #3): før hentede HVER hændelse med session alt igen — SIGNED_IN
          // ved hvert faneskift, TOKEN_REFRESHED hver time — og loggede et
          // nyt login ved hvert SIGNED_IN. Nu hentes kun, når data ikke
          // allerede er hentet (eller hentes) for SAMME bruger-id, og kun
          // overgangen til en ny bruger logges. En hentning, der fejlede,
          // tæller ikke som hentet — næste hændelse prøver igen, som før.
          const nyBrugerId = session.user.id;
          const forrigeBrugerId = sidsteBrugerIdRef.current;
          sidsteBrugerIdRef.current = nyBrugerId;
          const skalHente = skalHenteBrugerdata(hentningRef.current, nyBrugerId);
          if (forrigeBrugerId === null && skalHente) setLoading(true);
          // Log login event
          // En tjenestekonto logger intet login (30/9-2026): user_login_log
          // læses af rådgiverforsidens kohorte. Opslaget fejler → den normale
          // regel (logges), som laeseMarkeringTilladt.
          if (skalLoggeLogin(_event, forrigeBrugerId, nyBrugerId)) {
            void erTjenestekonto(nyBrugerId)
              .catch(() => false)
              .then((tjeneste) => {
                if (tjeneste) return;
                return supabase.rpc("log_user_login" as any).then(({ error }) => {
                  if (error) console.error("Failed to log login:", error);
                });
              });
          }
          if (!skalHente) return;
          hentningRef.current = { ...hentningRef.current, igangFor: nyBrugerId };
          const authUser = session.user;
          setTimeout(async () => {
            let fuldfoert = false;
            try {
              fuldfoert = await fetchUserData(authUser);
            } catch (e) {
              console.error("[useAuth] fetchUserData failed:", e);
            } finally {
              // Kun hvis denne hentning stadig er den aktuelle (ikke afløst
              // af en udlogning eller en anden bruger imens).
              if (hentningRef.current.igangFor === nyBrugerId) {
                hentningRef.current = { hentetFor: fuldfoert ? nyBrugerId : null, igangFor: null };
              }
              setLoading(false);
            }
          }, 0);
        } else {
          // Sessionen er væk (SIGNED_OUT, eller INITIAL_SESSION uden
          // session). Markørerne nulstilles, så det NÆSTE login igen tæller
          // som overgang, holder porten lukket og henter alt.
          sidsteBrugerIdRef.current = null;
          hentningRef.current = { hentetFor: null, igangFor: null };
          setIsAdvisor(false);
          setIsAdmin(false);
          setIsLegat(false);
          setProfile(null);
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
  // TJENESTEKONTI (30/9-2026, src/lib/tjenestekonto.ts): claude@topix.dk logges
  // ikke ud efter inaktivitet — alle andre som før. Fejl → den normale regel;
  // mens opslaget henter, venter reglen (et gammelt stempel ville ellers logge
  // tjenestekontoen ud i samme øjeblik, reglen slås til).
  const tjenestekontoQuery = useQuery({
    queryKey: ["tjenestekonto", user?.id ?? null],
    queryFn: () => erTjenestekonto(user!.id),
    enabled: !!user,
    retry: false,
    staleTime: 10 * 60 * 1000,
  });
  const logudAktiv = inaktivitetsLogudAktiv(!!user, tjenestekontoQuery.status, tjenestekontoQuery.data);
  const { showWarning, secondsLeft, extendSession } = useInactivityLogout(logudAktiv, sessionTimeoutMinutes);
  const erTjenestekontoNu = tjenestekontoQuery.data === true;
  const maaMarkereLaest = laeseMarkeringTilladt(!!user, tjenestekontoQuery.status, tjenestekontoQuery.data);

  return (
    <AuthContext.Provider value={{
      user, session, loading, isAdvisor, isAdmin, isPartner, isLegat, profile,
      companyId, companyName,
      ownCompanyId, ownCompanyName,
      isCompanyOverride,
      membershipTier, companyResolution,
      erTjenestekonto: erTjenestekontoNu, laeseMarkeringTilladt: maaMarkereLaest,
      setCompanyOverride, clearCompanyOverride,
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

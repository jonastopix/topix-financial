import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useAppConfig } from "@/hooks/useAppConfig";
import { supabase } from "@/integrations/supabase/client";
import { APP_BRANDING, PERFORMANCE_SCORE, GAMIFICATION } from "@/lib/appConfig";
import { cn } from "@/lib/utils";
import { HbButton } from "../../HbButton";
import { HbCard } from "../../HbCard";
import { HbSection } from "../../HbSection";
import { HbTag } from "../../HbTag";
import { HbField, HbInput } from "../HbField";

/**
 * Platform-konfiguration i Hjemmebane (4/9) — konvertering af
 * src/pages/AdminConfig.tsx (målt 4/9: 804 linjer i én komponent, én
 * AlertDialog, ingen tabel, elleve native inputs). Kald, validering og
 * tekster står som i den gamle fil — kun udtrykket og rækkefølgen er ny.
 *
 * SKALLEN er HbMemberShell (side-flow), som LegatView og EmailLogView:
 * siden er et «Platform»-punkt i admin-blokken, ikke en af HbAdminShells
 * indholdssektioner. Menuen røres ikke (se AdminConfig.tsx).
 *
 * RÅDGIVERLISTEN STÅR FØRST OG STØRST. Målt 4/9: siden er det ENESTE
 * sted i fladen hvor rådgivere inviteres og fjernes og admin-rollen
 * skiftes — manage-advisor invite/remove/toggle-admin har ingen anden
 * kalder. I den gamle side lå den som ét glass-card mellem «Test & Debug»
 * og «Branding». Her er den sin egen sektion med rubrik, invitér-felt og
 * en liste der viser hvem der er rådgiver, hvem der er admin, og hvem der
 * stadig venter på at oprette sig. manage-advisor-kaldene er urørte.
 *
 * BEKRÆFTELSEN ved «Fjern» er INLINE i rækken — DeleteSpec-formen fra
 * EditorBar (editors/shared.tsx:129-172): spørgsmålet, «Annuller» og en
 * rust-knap tager handlingernes plads, ingen portal. HbOverlejring
 * (milestones/HbOverlejring.tsx) er overvejet og fravalgt: den findes til
 * dialoger med indhold (felter, kalender); et ja/nej på én linje har sin
 * plads dér hvor handlingen blev udløst, og huset gør det allerede sådan
 * i editorens bundlinje. Teksten er den gamle AlertDialogs.
 *
 * DE ELLEVE INPUTS er HbField-familien (HbField + HbInput, native), med
 * samme type/step/min/max/maxLength/placeholder som før.
 *
 * TRE DELE HAR INGEN LÆSER I DRIFT (målt 4/9): branding-navnet læses kun
 * af det gamle design, Performance Score og Møde læses af ingen flade.
 * De BEHOLDES i denne PR — om de skal væk er en beslutning, ikke en
 * konvertering — og står samlet nederst under «Øvrige indstillinger»
 * med en stille linje om at ingen læser dem. Se markeringerne ved hver
 * sektion nedenfor.
 */

interface AdvisorEntry {
  email: string;
  name: string;
  status: 'active' | 'pending';
  isAdmin: boolean;
  created_at?: string;
}

const VELKOMST_GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sektionskortets bundlinje: valgfri «Nulstil til standard» som stille
    link, gem-knappen til højre — EditorBar-formen uden status. */
const Bundlinje = ({
  onNulstil,
  onGem,
  gemmer,
  gemLabel = "Gem",
  disabled,
}: {
  onNulstil?: () => void;
  onGem: () => void;
  gemmer: boolean;
  gemLabel?: string;
  disabled?: boolean;
}) => (
  <div className="mt-6 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-hb-line pt-4">
    {onNulstil && (
      <button
        type="button"
        onClick={onNulstil}
        className="mr-auto px-1 text-sm text-hb-ink-soft underline-offset-4 transition-colors hover:text-hb-ink hover:underline"
      >
        Nulstil til standard
      </button>
    )}
    <HbButton className="h-9 px-5 text-sm" onClick={onGem} disabled={gemmer || disabled}>
      {gemmer ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {gemLabel}
    </HbButton>
  </div>
);

const Sektionsoverskrift = ({ titel, tekst }: { titel: string; tekst?: string }) => (
  <div>
    <h3 className="font-editorial text-xl font-medium text-hb-ink">{titel}</h3>
    {tekst && <p className="mt-1 text-sm text-hb-ink-soft">{tekst}</p>}
  </div>
);

export const ConfigView = () => {
  const { isAdmin } = useAuth();
  const { branding, performanceScore, gamification, meetings, velkomstvideoGuid, updateConfig } = useAppConfig();

  const [saving, setSaving] = useState<string | null>(null);
  const [testingWeeklyFocus, setTestingWeeklyFocus] = useState(false);

  const handleTestWeeklyFocus = async () => {
    setTestingWeeklyFocus(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-weekly-focus", {
        body: { company_id: "927a4f36-748d-4326-9259-bff940da7e3d" },
      });
      if (error) throw error;
      toast.success(`Ugens fokus genereret: ${JSON.stringify(data)}`);
    } catch (err: any) {
      toast.error(`Fejl: ${err.message}`);
    } finally {
      setTestingWeeklyFocus(false);
    }
  };

  // ─── Advisor management state ───────────────────────────
  const [advisors, setAdvisors] = useState<AdvisorEntry[]>([]);
  const [advisorsLoading, setAdvisorsLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  // Inline bekræftelse: e-mailen på den rådgiver hvis række viser
  // «Fjern advisor-rolle?» — kun én ad gangen.
  const [bekraeftFjern, setBekraeftFjern] = useState<string | null>(null);
  const [fjerner, setFjerner] = useState<string | null>(null);

  // ─── Branding state ─────────────────────────────────────
  const [brandForm, setBrandForm] = useState({
    name: "",
    shortName: "",
    advisorLabel: "",
    chatPlaceholder: "",
  });

  useEffect(() => {
    setBrandForm({
      name: branding.name || "",
      shortName: branding.shortName || "",
      advisorLabel: branding.advisorLabel || "",
      chatPlaceholder: branding.chatPlaceholder || "",
    });
  }, [branding.name, branding.shortName, branding.advisorLabel, branding.chatPlaceholder]);

  // ─── Performance Score state ────────────────────────────
  const [perfForm, setPerfForm] = useState({
    weights: [0.3, 0.25, 0.25, 0.2] as number[],
    growthMultiplier: 2,
    marginMultiplier: 2,
    profitMultiplier: 3,
    liquidityMonths: 6,
    defaultSalaryFallback: 50000,
  });

  useEffect(() => {
    setPerfForm({
      weights: [...(performanceScore.weights || [0.3, 0.25, 0.25, 0.2])],
      growthMultiplier: performanceScore.growthMultiplier ?? 2,
      marginMultiplier: performanceScore.marginMultiplier ?? 2,
      profitMultiplier: performanceScore.profitMultiplier ?? 3,
      liquidityMonths: performanceScore.liquidityMonths ?? 6,
      defaultSalaryFallback: performanceScore.defaultSalaryFallback ?? 50000,
    });
  }, [performanceScore.growthMultiplier, performanceScore.marginMultiplier, performanceScore.profitMultiplier, performanceScore.liquidityMonths, performanceScore.defaultSalaryFallback]);

  // ─── Gamification state ─────────────────────────────────
  const [gamForm, setGamForm] = useState({
    pointsPerReport: 10,
    pointsPerMilestone: 25,
    levels: [] as { threshold: number; label: string; emoji: string }[],
  });

  useEffect(() => {
    setGamForm({
      pointsPerReport: gamification.pointsPerReport ?? 10,
      pointsPerMilestone: gamification.pointsPerMilestone ?? 25,
      levels: [...(gamification.levels || [])].map((l) => ({ ...l })),
    });
  }, [gamification.pointsPerReport, gamification.pointsPerMilestone, gamification.levels]);

  // ─── Meetings state ─────────────────────────────────────
  const [meetingDate, setMeetingDate] = useState<string>(
    meetings.next_meeting_date || ""
  );

  useEffect(() => {
    setMeetingDate(meetings.next_meeting_date || "");
  }, [meetings.next_meeting_date]);

  // ─── Velkomstvideo state ────────────────────────────────
  const [velkomstGuid, setVelkomstGuid] = useState<string>(velkomstvideoGuid);
  useEffect(() => {
    setVelkomstGuid(velkomstvideoGuid);
  }, [velkomstvideoGuid]);
  const velkomstGuidUgyldig = velkomstGuid.trim() !== "" && !VELKOMST_GUID_RE.test(velkomstGuid.trim());

  // ─── Load advisors ─────────────────────────────────────
  const loadAdvisors = async () => {
    setAdvisorsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-advisor", {
        body: { action: "list", email: "placeholder" },
      });
      if (error) throw error;
      setAdvisors(data.advisors || []);
    } catch (err: any) {
      console.error("Load advisors error:", err);
    } finally {
      setAdvisorsLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) loadAdvisors();
  }, [isAdmin]);

  const handleInviteAdvisor = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-advisor", {
        body: { action: "invite", email: inviteEmail.trim() },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      toast.success(data.message);
      setInviteEmail("");
      loadAdvisors();
    } catch (err: any) {
      let message = err?.message || "Kunne ikke invitere advisor";

      if (err?.context && typeof err.context.json === "function") {
        try {
          const payload = await err.context.json();
          if (payload?.error) {
            message = payload.error;
          }
        } catch {
          // ignore parsing error and use fallback message
        }
      }

      toast.error(message);
      setInviting(false);
    }
  };

  const handleRemoveAdvisor = async (email: string) => {
    setFjerner(email);
    try {
      const { data, error } = await supabase.functions.invoke("manage-advisor", {
        body: { action: "remove", email },
      });
      if (error) throw error;
      toast.success(data.message || "Advisor fjernet");
      setBekraeftFjern(null);
      loadAdvisors();
    } catch (err: any) {
      toast.error(err.message || "Kunne ikke fjerne advisor");
    } finally {
      setFjerner(null);
    }
  };

  const handleToggleAdmin = async (email: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-advisor", {
        body: { action: "toggle-admin", email },
      });
      if (error) throw error;
      toast.success(data.message);
      loadAdvisors();
    } catch (err: any) {
      toast.error(err.message || "Kunne ikke ændre admin-rolle");
    }
  };

  if (!isAdmin) return <Navigate to="/" replace />;

  const handleSave = async (
    key: "branding" | "performance_score" | "gamification" | "meetings" | "velkomstvideo_guid",
    value: any
  ) => {
    setSaving(key);
    try {
      await updateConfig(key, value);
      toast.success("Konfiguration gemt");
    } catch {
      toast.error("Kunne ikke gemme");
    }
    setSaving(null);
  };

  const weightLabels = ["Vækstrate", "Bruttomargin", "Nettoresultat", "Likviditet"];
  const vaegtSum = perfForm.weights.reduce((s, w) => s + w, 0);
  const antalAdmins = advisors.filter((a) => a.status === "active" && a.isAdmin).length;
  const antalAfventer = advisors.filter((a) => a.status === "pending").length;

  // ─── Rådgiverrækken ─────────────────────────────────────
  const raadgiverRaekke = (a: AdvisorEntry) => {
    const bekraefter = bekraeftFjern === a.email;
    return (
      <li key={a.email} className={cn("px-4 py-3", bekraefter && "bg-hb-sage/20")}>
        <div className="flex flex-wrap items-center gap-3">
          {a.status === "active" ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-hb-evergreen" aria-label="Aktiv">
              <Check className="h-3.5 w-3.5 text-white" />
            </span>
          ) : (
            <span className="h-8 w-8 shrink-0 rounded-full border border-dashed border-hb-line" aria-label="Afventer signup" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] text-hb-ink">{a.name || a.email}</p>
            {a.name && <p className="truncate text-xs text-hb-ink-soft">{a.email}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {a.status === "pending" && (
              <HbTag className="border border-hb-line bg-hb-paper px-2 py-0.5 text-[11px] text-hb-ink-soft">Afventer signup</HbTag>
            )}
            {a.status === "active" && (
              a.isAdmin ? (
                <HbTag className="bg-hb-evergreen/10 px-2 py-0.5 text-[11px] text-hb-evergreen">Admin</HbTag>
              ) : (
                <HbTag className="border border-hb-line bg-hb-paper px-2 py-0.5 text-[11px]">Advisor</HbTag>
              )
            )}
          </div>

          {bekraefter ? (
            /* DeleteSpec-formen, inline: spørgsmålet tager handlingernes
               plads. Teksten er den gamle AlertDialogs (:379-381). */
            <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 sm:w-auto sm:justify-end">
              <p className="min-w-0 text-sm text-hb-ink">
                Fjern advisor-rollen fra <strong className="font-medium">{a.name || a.email}</strong>?{" "}
                <span className="text-hb-ink-soft">Denne handling kan ikke fortrydes.</span>
              </p>
              <div className="flex items-center gap-2">
                <HbButton
                  variant="secondary"
                  className="h-8 px-3.5 text-sm"
                  onClick={() => setBekraeftFjern(null)}
                  disabled={fjerner === a.email}
                >
                  Annuller
                </HbButton>
                <button
                  type="button"
                  onClick={() => handleRemoveAdvisor(a.email)}
                  disabled={fjerner === a.email}
                  className="inline-flex h-8 items-center rounded-full bg-hb-rust px-3.5 text-sm font-medium text-white transition-colors hover:bg-hb-rust/90 disabled:pointer-events-none disabled:opacity-50"
                >
                  {fjerner === a.email ? "Fjerner…" : "Fjern"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-3 text-sm">
              {a.status === "active" && (
                <button
                  type="button"
                  onClick={() => handleToggleAdmin(a.email)}
                  className="text-hb-ink-soft underline-offset-4 transition-colors hover:text-hb-ink hover:underline"
                >
                  {a.isAdmin ? "Fjern admin-rolle" : "Gør til admin"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setBekraeftFjern(a.email)}
                className="text-hb-ink-soft underline-offset-4 transition-colors hover:text-hb-rust hover:underline"
              >
                Fjern
              </button>
            </div>
          )}
        </div>
      </li>
    );
  };

  return (
    <div>
      {/* Header (Virksomheder-mønstret) */}
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Platform</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
          Platform-konfiguration
        </h1>
        <p className="mt-3 text-base text-hb-ink-soft">Administrer globale indstillinger for hele platformen</p>
      </section>

      {/* ─── Rådgivere — sidens vigtigste del ───────────────── */}
      <HbSection eyebrow="Rådgivere" title="Hvem der er rådgiver, og hvem der er admin." hairline className="mt-12">
        <p className="max-w-2xl text-sm text-hb-ink-soft">
          Dette er det eneste sted rådgivere inviteres og fjernes, og hvor admin-rollen skiftes.
          {advisors.length > 0 && (
            <>
              {" "}
              {advisors.length} {advisors.length === 1 ? "rådgiver" : "rådgivere"}
              {antalAdmins > 0 && <> · {antalAdmins} admin</>}
              {antalAfventer > 0 && <> · {antalAfventer} afventer signup</>}.
            </>
          )}
        </p>

        {/* Invitér */}
        <div className="mt-6 flex flex-wrap items-end gap-3">
          <HbField label="Invitér ny rådgiver" htmlFor="config-invite" className="min-w-[240px] flex-1">
            <HbInput
              id="config-invite"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Email på ny rådgiver..."
              onKeyDown={(e) => e.key === "Enter" && handleInviteAdvisor()}
            />
          </HbField>
          <HbButton className="h-[46px] px-5 text-sm" onClick={handleInviteAdvisor} disabled={inviting || !inviteEmail.trim()}>
            {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Invitér
          </HbButton>
        </div>
        <p className="mt-2 text-xs text-hb-ink-soft">
          Hvis brugeren allerede har en konto, får de advisor-rollen med det samme. Ellers sendes en invitation.
        </p>

        {/* Listen */}
        <div className="mt-6 overflow-hidden rounded-hb border border-hb-line bg-hb-surface">
          {advisorsLoading ? (
            <ul className="divide-y divide-hb-line">
              {[0, 1, 2].map((i) => (
                <li key={i} aria-hidden className="px-4 py-3">
                  <div className="h-4 w-2/5 animate-pulse rounded bg-hb-line/60" />
                  <div className="mt-2 h-3 w-1/4 animate-pulse rounded bg-hb-line/40" />
                </li>
              ))}
            </ul>
          ) : advisors.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-hb-ink-soft">Ingen rådgivere endnu</p>
          ) : (
            <ul className="divide-y divide-hb-line">{advisors.map(raadgiverRaekke)}</ul>
          )}
        </div>
      </HbSection>

      {/* ─── Indstillinger med læser i drift ────────────────── */}
      <HbSection eyebrow="Indstillinger" hairline className="mt-14">
        <div className="grid gap-6">
          {/* Velkomstvideo — læses af tjeklisten og get-video-embed. */}
          <HbCard className="p-6">
            <Sektionsoverskrift
              titel="Velkomstvideo"
              tekst="Vises for nye medlemmer første gang de logger ind, og som punkt 1 i onboarding-tjeklisten"
            />
            <div className="mt-5 max-w-md">
              <HbField
                label="Bunny-video-ID (GUID)"
                htmlFor="config-velkomst"
                error={velkomstGuidUgyldig ? "Ikke et gyldigt video-ID — GUID-form forventes (8-4-4-4-12 hex)." : null}
                help={
                  velkomstGuidUgyldig
                    ? undefined
                    : velkomstGuid.trim() === ""
                      ? "Tomt felt = velkomsten er slået fra: overlejringen vises ikke, og punktet «Se velkomsten» udgår af tjeklisten (fem punkter)."
                      : "Velkomsten er slået til — tjeklisten har seks punkter."
                }
              >
                <HbInput
                  id="config-velkomst"
                  type="text"
                  value={velkomstGuid}
                  onChange={(e) => setVelkomstGuid(e.target.value)}
                  spellCheck={false}
                  placeholder="fx 5c6191a2-c148-470a-b5d2-e9740a25fac7"
                  className="font-mono text-sm"
                />
              </HbField>
              <p className="mt-3 text-xs text-hb-ink-soft">
                GUID'et findes i Bunny: Stream → library <span className="font-mono">boardroom-hjemmebane</span> → videoen → «Video ID».
                Videoen skal ligge i det library — det er dét der er signeret og tilladt for app.theboardroom.dk.
              </p>
            </div>
            <Bundlinje
              gemLabel="Gem video-ID"
              gemmer={saving === "velkomstvideo_guid"}
              disabled={velkomstGuidUgyldig}
              onGem={async () => {
                if (velkomstGuidUgyldig) {
                  toast.error("Ikke et gyldigt Bunny-video-ID (GUID-form forventes)");
                  return;
                }
                setSaving("velkomstvideo_guid");
                await handleSave("velkomstvideo_guid", velkomstGuid.trim());
                setSaving(null);
              }}
            />
          </HbCard>

          {/* Gamification — læses af CommunityProgress. */}
          <HbCard className="p-6">
            <Sektionsoverskrift titel="Gamification" />
            <div className="mt-5 grid grid-cols-2 gap-4">
              <HbField label="Point pr. rapport" htmlFor="config-gam-rapport">
                <HbInput
                  id="config-gam-rapport"
                  type="number"
                  min="0"
                  value={gamForm.pointsPerReport}
                  onChange={(e) =>
                    setGamForm((p) => ({
                      ...p,
                      pointsPerReport: parseInt(e.target.value) || 0,
                    }))
                  }
                />
              </HbField>
              <HbField label="Point pr. milestone" htmlFor="config-gam-milestone">
                <HbInput
                  id="config-gam-milestone"
                  type="number"
                  min="0"
                  value={gamForm.pointsPerMilestone}
                  onChange={(e) =>
                    setGamForm((p) => ({
                      ...p,
                      pointsPerMilestone: parseInt(e.target.value) || 0,
                    }))
                  }
                />
              </HbField>
            </div>
            <div className="mt-5">
              <p className="mb-2 block text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Niveauer</p>
              <div className="space-y-2">
                {gamForm.levels.map((level, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <HbInput
                      type="text"
                      value={level.emoji}
                      maxLength={4}
                      aria-label="Emoji"
                      onChange={(e) => {
                        const next = [...gamForm.levels];
                        next[i] = { ...next[i], emoji: e.target.value };
                        setGamForm((p) => ({ ...p, levels: next }));
                      }}
                      className="w-16 px-2 text-center"
                    />
                    <HbInput
                      type="number"
                      min="0"
                      value={level.threshold}
                      aria-label="Points"
                      onChange={(e) => {
                        const next = [...gamForm.levels];
                        next[i] = {
                          ...next[i],
                          threshold: parseInt(e.target.value) || 0,
                        };
                        setGamForm((p) => ({ ...p, levels: next }));
                      }}
                      className="w-24 px-2"
                      placeholder="Points"
                    />
                    <HbInput
                      type="text"
                      value={level.label}
                      maxLength={30}
                      aria-label="Niveau-navn"
                      onChange={(e) => {
                        const next = [...gamForm.levels];
                        next[i] = { ...next[i], label: e.target.value };
                        setGamForm((p) => ({ ...p, levels: next }));
                      }}
                      className="flex-1"
                      placeholder="Niveau-navn"
                    />
                  </div>
                ))}
              </div>
            </div>
            <Bundlinje
              gemmer={saving === "gamification"}
              onGem={() => handleSave("gamification", gamForm)}
              onNulstil={() =>
                setGamForm({
                  pointsPerReport: GAMIFICATION.pointsPerReport,
                  pointsPerMilestone: GAMIFICATION.pointsPerMilestone,
                  levels: [...GAMIFICATION.levels].map((l) => ({ ...l })),
                })
              }
            />
          </HbCard>

          {/* Test & Debug */}
          <HbCard className="p-6">
            <Sektionsoverskrift titel="Test & Debug" />
            <div className="mt-5 flex gap-2">
              <HbButton variant="secondary" className="h-9 px-4 text-sm" onClick={handleTestWeeklyFocus} disabled={testingWeeklyFocus}>
                {testingWeeklyFocus ? "Genererer..." : "Test Ugens Fokus"}
              </HbButton>
            </div>
          </HbCard>
        </div>
      </HbSection>

      {/* ─── Øvrige indstillinger — INGEN LÆSER I DRIFT (målt 4/9) ─────
          Branding-navnet læses kun af det gamle design; Performance Score
          og Møde læses af ingen flade. De beholdes i denne PR — om de skal
          væk er en beslutning, ikke en konvertering. */}
      <HbSection eyebrow="Øvrige indstillinger" hairline className="mt-14">
        <p className="max-w-2xl text-sm text-hb-ink-soft">
          Ingen flade læser de tre indstillinger nedenfor i dag (målt 4/9). De står her indtil det er besluttet om de skal væk.
        </p>
        <div className="mt-6 grid gap-6">
          {/* Branding — INGEN LÆSER I DRIFT (målt 4/9): kun det gamle
              design læser navnet. Beholdt. */}
          <HbCard className="p-6">
            <Sektionsoverskrift titel="Branding" tekst="Læses kun af det gamle design." />
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {([
                { key: "name", label: "App-navn" },
                { key: "shortName", label: "Kort navn (logo)" },
                { key: "advisorLabel", label: "Rådgiver-label" },
                { key: "chatPlaceholder", label: "Chat-placeholder" },
              ] as const).map((field) => (
                <HbField key={field.key} label={field.label} htmlFor={`config-brand-${field.key}`}>
                  <HbInput
                    id={`config-brand-${field.key}`}
                    type="text"
                    value={brandForm[field.key]}
                    onChange={(e) =>
                      setBrandForm((p) => ({ ...p, [field.key]: e.target.value }))
                    }
                    maxLength={100}
                  />
                </HbField>
              ))}
            </div>
            <Bundlinje
              gemmer={saving === "branding"}
              onGem={() => handleSave("branding", brandForm)}
              onNulstil={() =>
                setBrandForm({
                  name: APP_BRANDING.name,
                  shortName: APP_BRANDING.shortName,
                  advisorLabel: APP_BRANDING.advisorLabel,
                  chatPlaceholder: APP_BRANDING.chatPlaceholder,
                })
              }
            />
          </HbCard>

          {/* Performance Score — INGEN LÆSER I DRIFT (målt 4/9). Beholdt. */}
          <HbCard className="p-6">
            <Sektionsoverskrift titel="Performance Score" tekst="Ingen flade læser den i drift." />
            <div className="mt-5 space-y-5">
              <div>
                <p className="mb-2 block text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                  Scoring-vægte (skal summe til 1.0)
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {perfForm.weights.map((w, i) => (
                    <HbField key={i} label={weightLabels[i]} htmlFor={`config-perf-w-${i}`}>
                      <HbInput
                        id={`config-perf-w-${i}`}
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={w}
                        onChange={(e) => {
                          const next = [...perfForm.weights];
                          next[i] = parseFloat(e.target.value) || 0;
                          setPerfForm((p) => ({ ...p, weights: next }));
                        }}
                      />
                    </HbField>
                  ))}
                </div>
                {Math.abs(vaegtSum - 1) > 0.01 && (
                  <p className="mt-2 text-xs text-hb-rust">
                    Vægtene summer til {vaegtSum.toFixed(2)} — bør være 1.00
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {([
                  { key: "growthMultiplier", label: "Vækst-multiplikator" },
                  { key: "marginMultiplier", label: "Margin-multiplikator" },
                  { key: "profitMultiplier", label: "Profit-multiplikator" },
                  { key: "liquidityMonths", label: "Likviditets-måneder" },
                ] as const).map((field) => (
                  <HbField key={field.key} label={field.label} htmlFor={`config-perf-${field.key}`}>
                    <HbInput
                      id={`config-perf-${field.key}`}
                      type="number"
                      step="0.5"
                      min="0"
                      value={perfForm[field.key]}
                      onChange={(e) =>
                        setPerfForm((p) => ({
                          ...p,
                          [field.key]: parseFloat(e.target.value) || 0,
                        }))
                      }
                    />
                  </HbField>
                ))}
              </div>
            </div>
            <Bundlinje
              gemmer={saving === "performance_score"}
              onGem={() => handleSave("performance_score", perfForm)}
              onNulstil={() =>
                setPerfForm({
                  weights: [...PERFORMANCE_SCORE.weights],
                  growthMultiplier: PERFORMANCE_SCORE.growthMultiplier,
                  marginMultiplier: PERFORMANCE_SCORE.marginMultiplier,
                  profitMultiplier: PERFORMANCE_SCORE.profitMultiplier,
                  liquidityMonths: PERFORMANCE_SCORE.liquidityMonths,
                  defaultSalaryFallback: PERFORMANCE_SCORE.defaultSalaryFallback,
                })
              }
            />
          </HbCard>

          {/* Møde — INGEN LÆSER I DRIFT (målt 4/9): den gamle sides
              undertekst («Vises på alle members' dashboard») beskriver et
              kort ingen flade viser i dag. Beholdt med teksten som før. */}
          <HbCard className="p-6">
            <Sektionsoverskrift
              titel="Næste boardroom-møde"
              tekst="Vises på alle members' dashboard som nedtælling til mødet"
            />
            <div className="mt-5 max-w-xs">
              <HbField
                label="Dato for næste møde"
                htmlFor="config-moede"
                help={
                  meetingDate
                    ? `Vises som: ${new Date(meetingDate).toLocaleDateString("da-DK", {
                        weekday: "long", day: "numeric", month: "long", year: "numeric",
                      })}`
                    : "Ingen dato sat — mødekortet vises ikke på dashboard"
                }
              >
                <HbInput
                  id="config-moede"
                  type="date"
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                />
              </HbField>
            </div>
            <Bundlinje
              gemLabel="Gem dato"
              gemmer={saving === "meetings"}
              onGem={async () => {
                setSaving("meetings");
                await handleSave("meetings", { next_meeting_date: meetingDate || null });
                setSaving(null);
              }}
            />
          </HbCard>
        </div>
      </HbSection>
    </div>
  );
};

import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useAppConfig } from "@/hooks/useAppConfig";
import { supabase } from "@/integrations/supabase/client";
import { APP_BRANDING } from "@/lib/appConfig";
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
 * TRE DØDE DELE ER SLETTET (kort 82, målt 4/9, bekræftet 10/9 og 11/9,
 * besluttet 11/9, bygget 13/9): Performance Score, Møde og Gamification.
 * Ingen monteret flade læste dem — PerformanceScore.tsx og
 * CommunityProgress.tsx (de eneste læsere af performance_score og
 * gamification) blev importeret ingen steder, og «meetings» havde ingen
 * læser overhovedet (målt 13/9 på cecf1f61: grep i src/, supabase/ og
 * scripts/ → kun denne fil og useAppConfig). Komponenterne, konstanterne
 * (appConfig.ts), hook-felterne (useAppConfig.ts) og sektionerne her er
 * væk; app_config-rækkerne slettes af migrationen
 * 20260913231500_platformconfig_doede_raekker.sql (prod målt 11/9 11:43
 * — FØR-værdierne står i migrationen).
 *
 * BRANDING BEHOLDES til det gamle design er væk: branding.name læses af
 * AppLayout.tsx og AppSidebar.tsx (AnnualBaseline, LegatDashboard,
 * PulseCheckin, målt 13/9). De tre andre felter (shortName, advisorLabel,
 * chatPlaceholder) læses af ingen, men følger navnet i samme række.
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
  const { branding, velkomstvideoGuid, updateConfig } = useAppConfig();

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
    key: "branding" | "velkomstvideo_guid",
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

      {/* ─── Øvrige indstillinger — kun Branding tilbage ────────────
          Performance Score og Møde stod her til 13/9 (kort 82); de er
          slettet sammen med Gamification ovenfor, se filhovedet. Branding
          beholdes til det gamle design er væk: kun navnet læses
          (AppLayout, AppSidebar). */}
      <HbSection eyebrow="Øvrige indstillinger" hairline className="mt-14">
        <p className="max-w-2xl text-sm text-hb-ink-soft">
          Kun det gamle design læser navnet nedenfor. Sektionen forsvinder med det.
        </p>
        <div className="mt-6 grid gap-6">
          {/* Branding — læses kun af det gamle design (AppLayout.tsx,
              AppSidebar.tsx: branding.name). Beholdt. */}
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
        </div>
      </HbSection>
    </div>
  );
};

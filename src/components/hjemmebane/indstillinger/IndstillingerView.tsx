import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2, LogOut, Trash2, Upload } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { INDUSTRY_OPTIONS } from "@/lib/brancher";
import { computeMembershipTier } from "@/lib/membershipTier";
import { FANE_PARAM, laesFaneParam, type SettingsFane } from "@/lib/hjemmebane/profilUdfyldt";
import { PROFIL_FELTER, klipTilGraense, tilGemmevaerdi, type ProfilFeltNoegle } from "@/lib/hjemmebane/netvaerksprofil";
import { getMyMemberProfile, listExistingExpertise, saveMyCompanyDescription, saveMyMemberProfile } from "@/lib/hjemmebane/memberProfile";
import {
  AFTALE_KILDER, AFTALE_UDEN_TAL, aftaleLinjer, betalingsLinjer, EMAIL_INDSTILLINGER, fletPraeferencer, laesPraeferencer,
  UGENS_FOKUS_TEKST, type AftaleInput, type EmailPraeferencer, type PeriodeInput, type TraekInput,
} from "@/lib/hjemmebane/indstillinger";
import CompanyInvitations from "@/components/CompanyInvitations";
import type { Json } from "@/integrations/supabase/types";
import { HbButton } from "../HbButton";
import { HbCard } from "../HbCard";
import { HbSection } from "../HbSection";
import { HbTag } from "../HbTag";
import { HbField, HbInput, HbSelect, HbTextarea } from "../admin/HbField";

/**
 * /settings — INDSTILLINGERNE i Hjemmebane (10/9), konverteret som kontoen
 * blev det (KontoView, 9/9): samme skal, samme byggesten (HbSection/HbCard/
 * HbField/HbButton), samme skrivninger som før — flyttet, ikke omskrevet.
 *
 * Tre faner, som før, styret af ?fane= (profilUdfyldt.laesFaneParam — de
 * tre nudges til netværksprofilen lander på /settings?fane=profil, #758):
 *   Virksomhed     — AFTALEN (ny 10/9), betalingen (kun når der er rækker),
 *                    virksomhedens data, teamet, Ugens fokus, farlig zone.
 *   Profil i netværket — de tre felter + links og nøgleord (#765), samme
 *                    logik i Hb-udtryk.
 *   Notifikationer — en RIGTIG indstilling (afgjort 10/9): fem mailtyper
 *                    koden læser + Ugens fokus. Rådgiverens gamle tekst er
 *                    væk; rådgivere sendes til /konto (Settings.tsx).
 *
 * AFTALEN læser KUN AFTALE_KILDER fra companies plus company_perioder og
 * company_traek (medlemspolicyer #756). Aldrig fornyelsestabellen — den er
 * vores noter om dem, ikke deres aftale (FORBUDTE_KILDER i
 * lib/hjemmebane/indstillinger.ts; testen låser denne fils kildekode mod
 * hvert af navnene).
 *
 * NOTIFIKATIONSPRÆFERENCERNE hentes DIREKTE fra profiles (rettet 10/9): den
 * gamle fane læste (profile as any).notification_email_prefs fra useAuth,
 * som ikke henter kolonnen — så kontakterne stod altid på «til» uanset hvad
 * der var gemt.
 */

interface CompanyData extends AftaleInput {
  id: string;
  name: string;
  cvr_number: string | null;
  contact_email: string | null;
  website: string | null;
  description?: string | null;
  contact_phone: string | null;
  logo_url: string | null;
  industry_code: string | null;
  industry_label: string | null;
  weekly_focus_enabled: boolean | null;
}

const Kort = ({ titel, children, className }: { titel: string; children: ReactNode; className?: string }) => (
  <HbCard className={cn("p-5", className)}>
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">{titel}</p>
    <div className="mt-4">{children}</div>
  </HbCard>
);

/** Én rolig label/værdi-linje — samme form som virksomhedssidens «Aftalen». */
const Linje = ({ label, children, rust }: { label: string; children: ReactNode; rust?: boolean }) => (
  <div className="grid grid-cols-1 gap-x-4 py-1.5 text-sm sm:grid-cols-[9rem_1fr]">
    <span className="text-hb-ink-soft">{label}</span>
    <span className={cn("min-w-0 break-words", rust ? "text-hb-rust" : "text-hb-ink")}>{children}</span>
  </div>
);

/** Native kontakt i Hb-udtryk (ingen shadcn-Switch: den er stylet med appens mørke tokens). */
const HbToggle = ({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/40 disabled:opacity-50",
      checked ? "border-hb-evergreen bg-hb-evergreen" : "border-hb-line bg-hb-line/60",
    )}
  >
    <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} />
  </button>
);

const FANER: { key: SettingsFane; label: string }[] = [
  { key: "virksomhed", label: "Virksomhed" },
  { key: "profil", label: "Profil i netværket" },
  { key: "notifikationer", label: "Notifikationer" },
];

export const IndstillingerView = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const fane: SettingsFane = laesFaneParam(searchParams.get(FANE_PARAM));
  const saetFane = (f: SettingsFane) => {
    const next = new URLSearchParams(searchParams);
    if (f === "virksomhed") next.delete(FANE_PARAM); else next.set(FANE_PARAM, f);
    setSearchParams(next, { replace: true });
  };

  // ── Virksomheden ──
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [companyForm, setCompanyForm] = useState({ name: "", cvr_number: "", contact_email: "", website: "", contact_phone: "", industry_code: "", industry_label: "" });
  const [savingCompany, setSavingCompany] = useState(false);
  const [weeklyFocusEnabled, setWeeklyFocusEnabled] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leaveConfirmName, setLeaveConfirmName] = useState("");
  const [leaving, setLeaving] = useState(false);

  // ── Netværksprofilen ──
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [expertiseTags, setExpertiseTags] = useState<string[]>([]);
  const [expertiseInput, setExpertiseInput] = useState("");
  const [expertiseSuggestions, setExpertiseSuggestions] = useState<string[]>([]);
  const [detLaverVi, setDetLaverVi] = useState("");
  const [askMeAbout, setAskMeAbout] = useState("");
  const [workingOn, setWorkingOn] = useState("");
  const [savedWorkingOn, setSavedWorkingOn] = useState<string | null>(null);
  const [savingMemberProfile, setSavingMemberProfile] = useState(false);

  // ── Notifikationerne ──
  const [prefs, setPrefs] = useState<EmailPraeferencer>(laesPraeferencer(null));
  const [gemtPrefsJson, setGemtPrefsJson] = useState<unknown>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    if (!user) return;
    getMyMemberProfile(user.id)
      .then((mp) => {
        if (!mp) return;
        setLinkedinUrl(mp.linkedin_url || "");
        setExpertiseTags(mp.expertise || []);
        setAskMeAbout(mp.ask_me_about || "");
        setWorkingOn(mp.working_on || "");
        setSavedWorkingOn(mp.working_on ?? null);
      })
      .catch(() => {});
    listExistingExpertise().then(setExpertiseSuggestions).catch(() => {});
    // Præferencerne direkte fra profiles (se filhovedet).
    supabase.from("profiles").select("notification_email_prefs").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        const json = (data as { notification_email_prefs?: unknown } | null)?.notification_email_prefs ?? null;
        setGemtPrefsJson(json);
        setPrefs(laesPraeferencer(json));
      });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const fetchCompany = async () => {
      const { data: cm } = await supabase.from("company_members").select("company_id").eq("user_id", user.id).limit(1).maybeSingle();
      if (!cm?.company_id) return;
      const { data } = await supabase
        .from("companies")
        .select(`id, name, cvr_number, contact_email, website, contact_phone, logo_url, industry_code, industry_label, weekly_focus_enabled, description, ${AFTALE_KILDER.join(", ")}`)
        .eq("id", cm.company_id)
        .single();
      if (!data) return;
      const c = data as unknown as CompanyData;
      setCompany(c);
      setCompanyForm({
        name: c.name || "", cvr_number: c.cvr_number || "", contact_email: c.contact_email || "", website: c.website || "",
        contact_phone: c.contact_phone || "", industry_code: c.industry_code || "", industry_label: c.industry_label || "",
      });
      setLogoUrl(c.logo_url || null);
      setDetLaverVi(c.description || "");
      setWeeklyFocusEnabled(c.weekly_focus_enabled ?? false);
    };
    fetchCompany().catch((e) => console.error("[Indstillinger] fetchCompany failed:", e));
  }, [user]);

  // Betalingen — kun når virksomheden er kendt; medlemspolicyerne (#756) afgrænser til egen.
  const betalingQuery = useQuery({
    queryKey: ["indstillinger", "betaling", company?.id],
    enabled: !!company?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [perioder, traek] = await Promise.all([
        supabase.from("company_perioder").select("id, art, betalingsmodel, beloeb_oere, periode_start, periode_slut").eq("company_id", company!.id).order("periode_start", { ascending: false }),
        supabase.from("company_traek").select("stripe_invoice_id, status, beloeb_oere, betalt_at, fejlet_at, faktura_nummer, hosted_invoice_url").eq("company_id", company!.id).order("periode_start", { ascending: false }).limit(100),
      ]);
      if (perioder.error) throw perioder.error;
      if (traek.error) throw traek.error;
      return betalingsLinjer((perioder.data ?? []) as PeriodeInput[], (traek.data ?? []) as TraekInput[]);
    },
  });

  // ── Handlers: samme kald som Settings havde ──
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !company) return;
    if (!file.type.startsWith("image/")) { toast.error("Vælg en billedfil"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Logoet må højst være 2 MB"); return; }
    setUploadingLogo(true);
    const filePath = `${company.id}/logo`;
    const { error: uploadError } = await supabase.storage.from("company-logos").upload(filePath, file, { upsert: true, contentType: file.type });
    if (uploadError) { toast.error("Kunne ikke uploade logo"); setUploadingLogo(false); return; }
    const cleanUrl = supabase.storage.from("company-logos").getPublicUrl(filePath).data.publicUrl;
    const { error: updateError } = await supabase.from("companies").update({ logo_url: cleanUrl }).eq("id", company.id);
    if (updateError) toast.error("Kunne ikke gemme logo-URL");
    else { setLogoUrl(`${cleanUrl}?t=${Date.now()}`); toast.success("Logo uploadet"); }
    setUploadingLogo(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveLogo = async () => {
    if (!company) return;
    setUploadingLogo(true);
    await supabase.storage.from("company-logos").remove([`${company.id}/logo`]);
    const { error } = await supabase.from("companies").update({ logo_url: null }).eq("id", company.id);
    if (error) toast.error("Kunne ikke fjerne logo");
    else { setLogoUrl(null); toast.success("Logo fjernet"); }
    setUploadingLogo(false);
  };

  const handleSaveCompany = async () => {
    if (!company || !user) return;
    const name = companyForm.name.trim();
    const cvr = companyForm.cvr_number.trim();
    const email = companyForm.contact_email.trim();
    const website = companyForm.website.trim();
    const phone = companyForm.contact_phone.trim();
    const industryCode = companyForm.industry_code.trim();
    const industryLabel = companyForm.industry_label.trim();
    if (!name || name.length > 200) { toast.error("Virksomhedsnavn skal udfyldes (max 200 tegn)"); return; }
    if (cvr && !/^\d{8}$/.test(cvr)) { toast.error("CVR-nummer skal være præcis 8 cifre"); return; }
    if (email && (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) { toast.error("Ugyldig e-mailadresse"); return; }
    if (website && website.length > 500) { toast.error("Hjemmeside-URL er for lang (max 500 tegn)"); return; }
    if (phone && (phone.length > 30 || !/^[+\d\s\-()]+$/.test(phone))) { toast.error("Ugyldigt telefonnummer"); return; }
    setSavingCompany(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({ name, cvr_number: cvr || null, contact_email: email || null, website: website || null, contact_phone: phone || null, industry_code: industryCode || null, industry_label: industryLabel || null })
        .eq("id", company.id);
      if (error) { toast.error("Kunne ikke gemme virksomhedsdata"); return; }
      toast.success("Virksomhed opdateret");
      // KPI-benchmarks synkes kun når branchen faktisk ændres (som før).
      const industryChanged = industryCode !== (company.industry_code || "");
      if (industryCode && industryChanged) {
        const KPI_KEY_MAP: Record<string, string> = { gross_margin_pct: "db_margin", ebitda_margin_pct: "ebitda_margin" };
        const { data: industryBenchmarks } = await supabase.from("industry_benchmarks").select("kpi_key, benchmark_value, benchmark_label, source_label").eq("industry_code", industryCode);
        if (industryBenchmarks && industryBenchmarks.length > 0) {
          for (const ib of industryBenchmarks) {
            const mappedKey = KPI_KEY_MAP[ib.kpi_key] || ib.kpi_key;
            await supabase.from("kpi_benchmarks").upsert(
              { company_id: company.id, user_id: user.id, kpi_key: mappedKey, benchmark_value: ib.benchmark_value, benchmark_label: ib.benchmark_label, source_label: ib.source_label },
              { onConflict: "company_id,kpi_key" },
            );
            await supabase.from("kpi_targets").upsert(
              { company_id: company.id, user_id: user.id, kpi_key: mappedKey, target_value: ib.benchmark_value, target_label: ib.benchmark_label, lower_is_better: false },
              { onConflict: "company_id,kpi_key" },
            );
          }
          toast.info("KPI-mål opdateret fra branchestandard");
        }
      }
      setCompany({ ...company, name, cvr_number: cvr || null, contact_email: email || null, website: website || null, contact_phone: phone || null, industry_code: industryCode || null, industry_label: industryLabel || null });
    } finally {
      setSavingCompany(false);
    }
  };

  const handleLeaveCompany = async () => {
    if (!user || !company) return;
    setLeaving(true);
    try {
      const { error } = await supabase.from("company_members").delete().eq("user_id", user.id).eq("company_id", company.id);
      if (error) throw error;
      toast.success(`Du har forladt ${company.name}`);
      setLeaveDialogOpen(false);
      navigate("/auth", { replace: true });
    } catch {
      toast.error("Noget gik galt. Prøv igen.");
    } finally {
      setLeaving(false);
    }
  };

  const mergeExpertiseTags = (tags: string[], raw: string): string[] => {
    let next = tags;
    for (const part of raw.split(",")) {
      const tag = part.trim();
      if (tag && !next.includes(tag)) next = [...next, tag];
    }
    return next;
  };
  const addExpertiseTag = (raw: string) => { setExpertiseTags((tags) => mergeExpertiseTags(tags, raw)); setExpertiseInput(""); };
  const removeExpertiseTag = (tag: string) => setExpertiseTags((tags) => tags.filter((t) => t !== tag));
  const tekster: Record<ProfilFeltNoegle, string> = { det_laver_vi: detLaverVi, vaeret_igennem: askMeAbout, leder_efter: workingOn };
  const saetTekst = (noegle: ProfilFeltNoegle, v: string) => {
    if (noegle === "det_laver_vi") setDetLaverVi(v);
    else if (noegle === "vaeret_igennem") setAskMeAbout(v);
    else setWorkingOn(v);
  };

  const handleSaveMemberProfile = async () => {
    if (!user) return;
    const finalTags = mergeExpertiseTags(expertiseTags, expertiseInput);
    setExpertiseTags(finalTags);
    setExpertiseInput("");
    setSavingMemberProfile(true);
    try {
      const nextWorkingOn = workingOn.trim() || null;
      await saveMyMemberProfile(user.id, { linkedin_url: linkedinUrl.trim() || null, expertise: finalTags, ask_me_about: askMeAbout.trim() || null, working_on: nextWorkingOn }, savedWorkingOn);
      setSavedWorkingOn(nextWorkingOn);
      if (company) {
        const next = tilGemmevaerdi(detLaverVi);
        if (next !== (company.description ?? null)) {
          await saveMyCompanyDescription(company.id, next);
          setCompany({ ...company, description: next });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["member-profile"] });
      queryClient.invalidateQueries({ queryKey: ["member-directory"] });
      toast.success("Netværksprofil opdateret");
    } catch (e) {
      toast.error("Kunne ikke gemme netværksprofilen", { description: e instanceof Error ? e.message : undefined });
    }
    setSavingMemberProfile(false);
  };

  const gemPrefs = async () => {
    if (!user) return;
    setSavingPrefs(true);
    const flettet = fletPraeferencer(gemtPrefsJson, prefs);
    const { error, data } = await supabase.from("profiles").update({ notification_email_prefs: flettet as Json }).eq("user_id", user.id).select("user_id");
    setSavingPrefs(false);
    if (error || !data || data.length === 0) { toast.error("Indstillingerne blev ikke gemt", { description: error?.message ?? "Skrivningen ramte nul rækker." }); return; }
    setGemtPrefsJson(flettet);
    toast.success("Notifikationsindstillinger gemt");
  };

  const saetUgensFokus = async (next: boolean) => {
    if (!company) return;
    setWeeklyFocusEnabled(next);
    const { error } = await supabase.from("companies").update({ weekly_focus_enabled: next }).eq("id", company.id);
    if (error) { setWeeklyFocusEnabled(!next); toast.error("Kunne ikke ændre indstillingen"); return; }
    toast.success(next ? "Ugens fokus er slået til" : "Ugens fokus er slået fra");
  };

  const tier = company ? computeMembershipTier(company) : "no_date";
  const aftalen = company ? aftaleLinjer(company, tier, new Date()) : [];
  const aftaleUdenTal = !!company && company.contract_end_date == null && company.indgangspris_oere == null;

  return (
    <div>
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Indstillinger</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">Din virksomhed og dine valg</h1>
        <p className="mt-3 text-sm text-hb-ink-soft">
          Aftalen, virksomheden, din profil i netværket og hvad vi må skrive til dig om. Navn, adgangskode og login står under{" "}
          <Link to="/konto" className="text-hb-evergreen underline-offset-4 hover:underline">Konto</Link>.
        </p>
      </section>

      <nav className="mt-8 flex flex-wrap gap-1" aria-label="Indstillinger">
        {FANER.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => saetFane(f.key)}
            className={cn(
              "relative flex h-10 items-center rounded-full px-4 text-[15px] transition-colors",
              fane === f.key ? "bg-hb-sage/60 font-medium text-hb-ink" : "text-hb-ink-soft hover:bg-hb-sage/30 hover:text-hb-ink",
            )}
          >
            {f.label}
          </button>
        ))}
      </nav>

      {fane === "virksomhed" && (
        <>
          <HbSection eyebrow="Aftalen" hairline className="mt-10 max-w-3xl">
            <div className="grid gap-4 md:grid-cols-2">
              <Kort titel="Dit medlemskab">
                {!company ? (
                  <p className="text-sm text-hb-ink-soft">Henter…</p>
                ) : (
                  <>
                    <div className="divide-y divide-hb-line">
                      {aftalen.map((l) => (
                        <Linje key={l.label} label={l.label} rust={l.rust}>{l.vaerdi}</Linje>
                      ))}
                    </div>
                    {aftaleUdenTal && <p className="mt-3 text-sm leading-relaxed text-hb-ink-soft">{AFTALE_UDEN_TAL}</p>}
                    <p className="mt-3 text-xs leading-relaxed text-hb-ink-soft">Spørgsmål til aftalen? Skriv til din rådgiver i chatten.</p>
                  </>
                )}
              </Kort>
              {/* Betalingen vises KUN når der er perioder eller træk (målt 9/9: 27 af 27 har nul). */}
              {betalingQuery.data && betalingQuery.data.length > 0 && (
                <Kort titel="Betaling">
                  <div className="divide-y divide-hb-line">
                    {betalingQuery.data.map((l) => (
                      <Linje key={l.id} label={l.label} rust={l.rust}>
                        {l.vaerdi}
                        {l.fakturaUrl && (
                          <>
                            {" · "}
                            <a href={l.fakturaUrl} target="_blank" rel="noopener noreferrer" className="text-hb-evergreen underline-offset-4 hover:underline">Se fakturaen</a>
                          </>
                        )}
                      </Linje>
                    ))}
                  </div>
                </Kort>
              )}
            </div>
          </HbSection>

          <HbSection eyebrow="Virksomheden" hairline className="mt-12 max-w-3xl">
            <Kort titel="Virksomhedens data">
              {!company ? (
                <p className="text-sm text-hb-ink-soft">Henter…</p>
              ) : (
                <>
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-hb-line bg-hb-sage">
                      {logoUrl ? <img src={logoUrl} alt="Virksomhedslogo" className="h-full w-full object-contain" /> : <span className="text-xs text-hb-ink-soft">Logo</span>}
                    </div>
                    <div>
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      <div className="flex flex-wrap items-center gap-2">
                        <HbButton type="button" variant="secondary" className="h-9 gap-1.5 px-4 text-sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingLogo}>
                          {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                          {logoUrl ? "Skift logo" : "Upload logo"}
                        </HbButton>
                        {logoUrl && (
                          <button type="button" onClick={handleRemoveLogo} disabled={uploadingLogo} className="inline-flex items-center gap-1 text-sm text-hb-ink-soft underline-offset-4 hover:text-hb-ink hover:underline">
                            <Trash2 className="h-3.5 w-3.5" /> Fjern
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-hb-ink-soft">PNG eller JPG, højst 2 MB.</p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <HbField label="Virksomhedsnavn" htmlFor="v-navn" className="md:col-span-2">
                      <HbInput id="v-navn" value={companyForm.name} onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))} />
                    </HbField>
                    <HbField label="CVR" htmlFor="v-cvr">
                      <HbInput id="v-cvr" value={companyForm.cvr_number} onChange={(e) => setCompanyForm((f) => ({ ...f, cvr_number: e.target.value }))} placeholder="12345678" inputMode="numeric" />
                    </HbField>
                    <HbField label="Hjemmeside" htmlFor="v-web">
                      <HbInput id="v-web" value={companyForm.website} onChange={(e) => setCompanyForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://…" />
                    </HbField>
                    <HbField label="Telefon" htmlFor="v-tlf">
                      <HbInput id="v-tlf" value={companyForm.contact_phone} onChange={(e) => setCompanyForm((f) => ({ ...f, contact_phone: e.target.value }))} autoComplete="tel" />
                    </HbField>
                    <HbField label="Kontakt-e-mail" htmlFor="v-mail">
                      <HbInput id="v-mail" type="email" value={companyForm.contact_email} onChange={(e) => setCompanyForm((f) => ({ ...f, contact_email: e.target.value }))} />
                    </HbField>
                    <HbField label="Branche" htmlFor="v-branche" className="md:col-span-2" help="Branchen bestemmer hvilke branchetal vi sammenligner dine tal med.">
                      <HbSelect
                        id="v-branche"
                        value={companyForm.industry_code}
                        onChange={(e) => {
                          const v = e.target.value;
                          const found = INDUSTRY_OPTIONS.flatMap((g) => g.sub).find((s) => s.value === v);
                          setCompanyForm((f) => ({ ...f, industry_code: v, industry_label: found?.label || "" }));
                        }}
                      >
                        <option value="">Vælg branche</option>
                        {INDUSTRY_OPTIONS.map((g) => (
                          <optgroup key={g.value} label={g.label}>
                            {g.sub.map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </HbSelect>
                    </HbField>
                  </div>
                  <HbButton type="button" className="mt-4 h-10 px-5" onClick={handleSaveCompany} disabled={savingCompany}>
                    {savingCompany ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Gem virksomhed
                  </HbButton>
                </>
              )}
            </Kort>
          </HbSection>

          <HbSection eyebrow="Teamet" hairline className="mt-12 max-w-3xl">
            {/* Invitationerne (CompanyInvitations) er en selvstændig komponent og
                henter selv — uændret, i appens gamle tokens inde i Hb-skallen
                (samme accepterede skift som admin-siderne, #603). */}
            <CompanyInvitations />
          </HbSection>

          <HbSection eyebrow="Farlig zone" hairline className="mt-12 max-w-3xl">
            <HbCard className="border-hb-rust/40 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-hb-rust" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-hb-ink">Forlad virksomheden</p>
                  <p className="mt-1 text-sm leading-relaxed text-hb-ink-soft">Du mister adgang til alle rapporter, milepæle og chatten. Det kan ikke fortrydes.</p>
                  <HbButton type="button" variant="secondary" className="mt-3 h-10 gap-2 border-hb-rust/40 px-5 text-hb-rust hover:bg-hb-rust/10" onClick={() => { setLeaveConfirmName(""); setLeaveDialogOpen(true); }} disabled={!company}>
                    <LogOut className="h-4 w-4" /> Forlad {company?.name ?? "virksomheden"}
                  </HbButton>
                </div>
              </div>
            </HbCard>
          </HbSection>
        </>
      )}

      {fane === "profil" && (
        <HbSection eyebrow="Netværket" hairline className="mt-10 max-w-3xl">
          <Kort titel="Din profil i netværket">
            <p className="text-sm leading-relaxed text-hb-ink-soft">
              Det her ser de andre medlemmer. Branche, by, stiftelsesår og website henter vi fra din virksomhed — tal viser vi aldrig.
            </p>
            <div className="mt-5 space-y-5">
              {PROFIL_FELTER.map((f) => {
                const vaerdi = tekster[f.noegle];
                return (
                  <HbField key={f.noegle} label={f.label} htmlFor={`profil-${f.noegle}`} help={`${f.hjaelp} ${vaerdi.length}/${f.graense}`}>
                    <HbTextarea
                      id={`profil-${f.noegle}`}
                      value={vaerdi}
                      onChange={(e) => saetTekst(f.noegle, klipTilGraense(e.target.value, f.noegle))}
                      maxLength={f.graense}
                      rows={f.noegle === "det_laver_vi" ? 2 : 3}
                      placeholder={f.eksempel}
                    />
                  </HbField>
                );
              })}
              <p className="pt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Links og nøgleord</p>
              <HbField label="LinkedIn" htmlFor="profil-linkedin">
                <HbInput id="profil-linkedin" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/…" />
              </HbField>
              <HbField label="Spidskompetencer" htmlFor="profil-expertise" help="Skriv og tryk Enter — fx E-commerce, Ledelse. Forslagene nedenfor er fra netværket.">
                {expertiseTags.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {expertiseTags.map((tag) => (
                      <HbTag key={tag} className="gap-1 pr-1.5">
                        {tag}
                        <button type="button" onClick={() => removeExpertiseTag(tag)} aria-label={`Fjern ${tag}`} className="rounded-full px-1 text-hb-ink-soft hover:text-hb-rust">×</button>
                      </HbTag>
                    ))}
                  </div>
                )}
                <HbInput
                  id="profil-expertise"
                  value={expertiseInput}
                  onChange={(e) => setExpertiseInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addExpertiseTag(expertiseInput); } }}
                  placeholder="Skriv og tryk Enter"
                />
                {expertiseSuggestions.filter((s) => !expertiseTags.includes(s)).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {expertiseSuggestions.filter((s) => !expertiseTags.includes(s)).slice(0, 12).map((s) => (
                      <button key={s} type="button" onClick={() => addExpertiseTag(s)} className="rounded-full border border-hb-line px-2.5 py-1 text-xs text-hb-ink-soft transition-colors hover:bg-hb-sage/40 hover:text-hb-ink">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </HbField>
            </div>
            <HbButton type="button" className="mt-5 h-10 px-5" onClick={handleSaveMemberProfile} disabled={savingMemberProfile}>
              {savingMemberProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Gem netværksprofil
            </HbButton>
          </Kort>
        </HbSection>
      )}

      {fane === "notifikationer" && (
        <HbSection eyebrow="Notifikationer" hairline className="mt-10 max-w-3xl">
          <div className="grid gap-4 md:grid-cols-2">
            <Kort titel="E-mails fra os">
              <p className="text-sm leading-relaxed text-hb-ink-soft">Vælg hvad vi må skrive til dig om. Beskederne i appen påvirkes ikke.</p>
              <ul className="mt-4 divide-y divide-hb-line">
                {EMAIL_INDSTILLINGER.map((i) => (
                  <li key={i.noegle} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-hb-ink">{i.label}</p>
                      <p className="text-xs leading-relaxed text-hb-ink-soft">{i.beskrivelse}</p>
                    </div>
                    <HbToggle label={i.label} checked={prefs[i.noegle]} onChange={(v) => setPrefs((p) => ({ ...p, [i.noegle]: v }))} />
                  </li>
                ))}
              </ul>
              <HbButton type="button" className="mt-4 h-10 px-5" onClick={gemPrefs} disabled={savingPrefs}>
                {savingPrefs ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Gem
              </HbButton>
            </Kort>
            <Kort titel="Ugens fokus">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-hb-ink">{UGENS_FOKUS_TEKST.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-hb-ink-soft">{UGENS_FOKUS_TEKST.beskrivelse}</p>
                </div>
                <HbToggle label={UGENS_FOKUS_TEKST.label} checked={weeklyFocusEnabled} onChange={saetUgensFokus} disabled={!company} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-hb-ink-soft">Gemmes med det samme.</p>
            </Kort>
          </div>
        </HbSection>
      )}

      <AlertDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Er du sikker?</AlertDialogTitle>
            <AlertDialogDescription>
              Du er ved at forlade {company?.name}. Du mister adgang til alle rapporter, milestones og chat. Skriv virksomhedens navn for at bekræfte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            value={leaveConfirmName}
            onChange={(e) => setLeaveConfirmName(e.target.value)}
            placeholder={company?.name || ""}
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-destructive/30"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setLeaveConfirmName("")}>Annuller</AlertDialogCancel>
            <AlertDialogAction onClick={handleLeaveCompany} disabled={leaving || leaveConfirmName !== company?.name} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
              {leaving ? "Forlader..." : "Forlad virksomhed"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

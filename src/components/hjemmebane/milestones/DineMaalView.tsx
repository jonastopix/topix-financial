import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import { MILESTONE_CATEGORIES, type MilestoneCategory } from "@/lib/milestoneCategories";
import { MILESTONE_SUGGESTIONS } from "@/lib/milestoneSuggestions";
import { dineMaalDom, DINE_SKRIDT_FEJL_TEKST, TILFOEJ_SKRIDT_FEJL_TEKST, TILFOEJ_SKRIDT_OK_TEKST, type SkridtTilDineMaal } from "@/lib/hjemmebane/dineMaal";
import type { MaalRaekke } from "@/lib/hjemmebane/planen";
import { MAX_AKTIVE_MAAL } from "@/lib/hjemmebane/maal";
import { HbAdvisorCompanyPrompt } from "../HbAdvisorCompanyPrompt";
import { HbSection } from "../HbSection";
import { HbCard } from "../HbCard";
import { HbTag } from "../HbTag";
import { HbButton } from "../HbButton";
import { HbMaalRaekke } from "./HbMaalRaekke";
import { HbMaalForklaring } from "./HbMaalForklaring";
import { useMilestones, type Milestone, type NyMilestone } from "./useMilestones";
import { MilestoneDetaljeDialog, OpretMilestoneDialog, SletMilestoneDialog } from "./MilestoneDialoger";

/**
 * «Dine mål» — /milestones i Hjemmebane, «Én plan pr. virksomhed», fase 3
 * (16/9-2026). Afløser MilestonesView (etape 1, 4/9): samme rute, samme
 * datalag (useMilestones — en ren flytning af de gamle skrivninger), samme
 * tre portaler (MilestoneDialoger). Nyt er det planen giver: målene med
 * SKRIDTENE under (◻ aktive med frist, ? venter, ✓ gjorte som historik),
 * fremdriften «2 af 3 skridt gjort · 67 %» fra maal.ts/planen.ts (samme
 * motor som opgave-luk skriver med og som rådgiverens «Planen» viser),
 * «Marker som nået», og grænsen på tre aktive sagt i klart sprog.
 *
 * HVEM EJER MÅLENE — Jonas 16/9, ordret: «Nej. Vi er rådgivere, men det er
 * medlemmernes virksomheder.» Medlemmet opretter, omdøber, parkerer,
 * sletter og markerer som nået selv (klienten skriver direkte til
 * milestones som før — RLS er UÆNDRET i alle faser); rådgiveren kan det
 * samme fra «Planen» (maal-skriv); AI'en kan ikke. Højst tre aktive for
 * alle — håndhævet af databasen (trigger 20260917150000); fladen siger det
 * på forhånd (graenseTekst) og oversætter afvisningen (maalFejlTekst).
 * Planens punkter «ingen opret-knap» og «ingen slet/parkér/redigér» UDGÅR.
 *
 * DOMMEN er ren (lib/hjemmebane/dineMaal → planen → milepaelDom): fladen
 * filtrerer og dømmer intet selv — den tegner dom.aktive/parkerede/naaede
 * og x.handlinger. SKYDEREN (klik på baren / «nuværende værdi») kun for mål
 * UDEN skridt (kanSaetteFremdrift); mål med skridt får fremdriften fra
 * skridtene.
 *
 * SKRIDTENE hentes her (company_actions med maal_id, alle statusser —
 * gjorte er historik) med kraevRaekker: fejl er ikke tom. «Gjort» på et
 * aktivt skridt kalder opgave-luk (samme vej som forsiden); derefter
 * genhentes både skridt og mål, så fremdriften rykker i samme render.
 * Parkerede og nåede står foldet.
 */

const STARTER_PICKS: { title: string; cat: MilestoneCategory }[] = [
  { title: "Opnå positiv bundlinje", cat: "profit" },
  { title: "Nå 100 aktive kunder", cat: "kunder" },
  { title: "Reducér driftsomkostninger med 20%", cat: "profit" },
];

/** useMilestones' række → planens form (deadline som «YYYY-MM-DD»). */
const tilMaalRaekke = (m: Milestone): MaalRaekke => ({
  id: m.id,
  title: m.title,
  status: m.dbStatus ?? "active",
  progress: m.progress,
  deadline: m.deadline ? m.deadline.toISOString().slice(0, 10) : null,
  category: m.category,
  source: m.source,
  progress_updated_at: m.progress_updated_at,
  completed_at: m.completed_at,
  created_at: m.created_at,
});

export const DineMaalView = () => {
  const { user, companyId, isAdvisor: rawAdvisor } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const { milestones, loading, saetFremgang, saetNuvaerendeVaerdi, markerNaaet, slet, opdaterFelt, opret, genhent } = useMilestones({
    userId: user?.id ?? null,
    companyId: companyId ?? null,
    isAdvisor,
  });
  const queryClient = useQueryClient();

  // Skridtene under målene: alle company_actions med maal_id hos virksomheden
  // (også gjorte/lukkede — historik). KASTER ved fejl: tom er et svar, fejl er ikke.
  const skridtQuery = useQuery({
    queryKey: ["dine-maal", "skridt", companyId],
    queryFn: async () => {
      const skridtRes = await supabase
        .from("company_actions")
        .select("id, title, status, due_date, maal_id, closed_at")
        .eq("company_id", companyId!)
        .not("maal_id", "is", null)
        .order("created_at", { ascending: true })
        .limit(200);
      return kraevRaekker(skridtRes, "company_actions") as SkridtTilDineMaal[];
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  // «Gjort» på et skridt — opgave-luk (udfald done); fremdriften skrives af
  // functionen (rykMaalFremdrift), så begge kilder genhentes bagefter.
  const gjortMutation = useMutation({
    mutationFn: async (opgaveId: string) => {
      const { error } = await supabase.functions.invoke("opgave-luk", { body: { opgaveId, udfald: "done" } });
      if (error) {
        let besked = error.message;
        try {
          const svar = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.();
          if (svar?.error) besked = svar.error;
        } catch { /* behold error.message */ }
        throw new Error(besked);
      }
    },
    onSuccess: async () => {
      toast.success("Skridtet er gjort");
      await queryClient.invalidateQueries({ queryKey: ["dine-maal"] });
      await queryClient.invalidateQueries({ queryKey: ["boardroom"] });
      genhent();
    },
    onError: (e: Error) => toast.error("Skridtet blev ikke lukket", { description: e.message }),
  });

  // «Tilføj skridt» (skridt-tilfoej, 17/9 — Jonas «ja», fristen «1»): medlemmets
  // eget skridt under et aktivt mål, aktivt fra start. Functionen dømmer
  // (medlemskab, målet aktivt, titel, frist, dubletkontrol); fejl-body'en vises
  // ordret under formularen (opgaveMutation-mønstret); bagefter genhentes
  // skridt og mål, så fremdriften rykker i samme render.
  const tilfoejMutation = useMutation({
    mutationFn: async (input: { maalId: string; titel: string; dueDate: string }) => {
      const { error } = await supabase.functions.invoke("skridt-tilfoej", { body: { companyId, ...input } });
      if (error) {
        let besked = error.message;
        try {
          const svar = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.();
          if (svar?.error) besked = svar.error;
        } catch { /* behold error.message */ }
        throw new Error(besked);
      }
    },
    onSuccess: async () => {
      toast.success(TILFOEJ_SKRIDT_OK_TEKST);
      await queryClient.invalidateQueries({ queryKey: ["dine-maal"] });
      await queryClient.invalidateQueries({ queryKey: ["boardroom"] });
      genhent();
    },
  });
  const tilfoejSkridt = async (maalId: string, titel: string, dueDate: string): Promise<string | null> => {
    try {
      await tilfoejMutation.mutateAsync({ maalId, titel, dueDate });
      return null;
    } catch (e) {
      const besked = e instanceof Error ? e.message : String(e);
      toast.error(TILFOEJ_SKRIDT_FEJL_TEKST, { description: besked });
      return besked;
    }
  };

  const [opretAaben, setOpretAaben] = useState(false);
  const [forudfyldt, setForudfyldt] = useState<Partial<NyMilestone> | null>(null);
  const [aabenId, setAabenId] = useState<string | null>(null);
  const [sletId, setSletId] = useState<string | null>(null);

  const dom = useMemo(
    () => dineMaalDom(milestones.map(tilMaalRaekke), skridtQuery.data ?? [], new Date()),
    [milestones, skridtQuery.data],
  );
  const msAf = useMemo(() => new Map(milestones.map((m) => [m.id, m])), [milestones]);
  const aaben: Milestone | null = milestones.find((m) => m.id === aabenId) ?? null;
  const aabenBeregnet = aaben ? [...dom.aktive, ...dom.parkerede, ...dom.naaede].find((x) => x.plan.maal.id === aaben.id)?.plan.beregnet ?? false : false;
  const tilSletning: Milestone | null = milestones.find((m) => m.id === sletId) ?? null;
  const busy = gjortMutation.isPending || tilfoejMutation.isPending;

  if (isAdvisor && !companyId) {
    return <HbAdvisorCompanyPrompt />;
  }

  const aabnMedForslag = (pick: { title: string; cat: MilestoneCategory }) => {
    const s = MILESTONE_SUGGESTIONS[pick.cat]?.find((x) => x.title === pick.title);
    if (!s) return;
    setForudfyldt({ title: s.title, description: s.description, category: pick.cat });
    setOpretAaben(true);
  };
  const aabnTom = () => {
    setForudfyldt(null);
    setOpretAaben(true);
  };

  const raekke = (x: (typeof dom.aktive)[number]) => {
    const ms = msAf.get(x.plan.maal.id);
    if (!ms) return null;
    return (
      <HbMaalRaekke
        key={ms.id}
        x={x}
        ms={ms}
        busy={busy}
        onAabn={() => setAabenId(ms.id)}
        onFremgang={(p) => void saetFremgang(ms.id, p)}
        onNaaet={() => void markerNaaet(ms.id)}
        // Genåbn/aktivér: status active — det fjerde aktive afvises af databasen (husets tekst via maalFejlTekst).
        // Et mål nået på 100 % uden skridt sættes tilbage til 0 (som skiftFuldfoert gjorde).
        onGenaabn={() => void opdaterFelt(ms.id, { status: "active", ...(!x.plan.beregnet && x.plan.fremdrift >= 100 ? { progress: 0 } : {}) })}
        onAktiver={() => void opdaterFelt(ms.id, { status: "active" })}
        onParker={() => void opdaterFelt(ms.id, { status: "parked" })}
        onSlet={() => setSletId(ms.id)}
        onSkridtGjort={(id) => gjortMutation.mutate(id)}
        onTilfoejSkridt={tilfoejSkridt}
      />
    );
  };

  const opretKnap = (
    <HbButton onClick={aabnTom} className="gap-1.5" disabled={!dom.kanOprette} title={dom.kanOprette ? undefined : dom.graenseTekst}>
      <Plus className="h-4 w-4" />
      Sæt et mål
    </HbButton>
  );

  return (
    <div data-dine-maal-aktive={dom.aktive.length} data-dine-maal-over-graensen={dom.overGraensen ? "1" : "0"}>
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Dine tal</p>
          <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">Dine mål</h1>
          <p className="mt-3 text-sm text-hb-ink-soft">Højst {MAX_AKTIVE_MAAL} aktive mål ad gangen — og skridtene der fører derhen.</p>
        </div>
        {!loading && !dom.tom && opretKnap}
      </section>

      {loading ? (
        <div aria-hidden className="mt-10">
          <div className="h-4 w-1/3 animate-pulse rounded bg-hb-line/60" />
          <div className="mt-4 h-24 animate-pulse rounded-hb bg-hb-line/40" />
        </div>
      ) : dom.tom ? (
        <HbSection eyebrow="Kom i gang" title="Sæt dit første mål" hairline className="mt-10">
          {/* «Hvad er et mål?» (tillæg 17/9) — samme kilde og samme åbne form som forsidens «Din plan» uden mål. */}
          <HbMaalForklaring />
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-hb-ink-soft">
            Start med et af forslagene, eller sæt dit eget — din rådgiver kan også sætte mål sammen med dig.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {opretKnap}
            <Link to="/handouts" className="inline-flex items-center gap-2 text-sm text-hb-evergreen underline-offset-4 hover:underline">
              <BookOpen className="h-4 w-4" />
              Gå til Handouts — løftestængerne kan blive til mål
            </Link>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {STARTER_PICKS.map((pick) => {
              const cfg = MILESTONE_CATEGORIES[pick.cat];
              const Ikon = cfg.icon;
              const s = MILESTONE_SUGGESTIONS[pick.cat]?.find((x) => x.title === pick.title);
              if (!s) return null;
              return (
                <HbCard
                  key={pick.title}
                  role="button"
                  tabIndex={0}
                  onClick={() => aabnMedForslag(pick)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); aabnMedForslag(pick); }
                  }}
                  className="cursor-pointer p-5 text-left"
                >
                  <HbTag className="gap-1 px-2 py-0.5 text-[11px]">
                    <Ikon className="h-3 w-3" />
                    {cfg.label}
                  </HbTag>
                  <h3 className="mt-3 font-editorial text-lg font-medium leading-snug text-hb-ink">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-hb-ink-soft line-clamp-2">{s.description}</p>
                </HbCard>
              );
            })}
          </div>
        </HbSection>
      ) : (
        <>
          {/* ── Jeres mål: de aktive med skridtene under ── */}
          <HbSection eyebrow={`Jeres mål · ${dom.aktive.length}`} hairline className="mt-10">
            <p className={dom.overGraensen ? "-mt-2 mb-3 text-sm font-medium text-hb-rust" : "-mt-2 mb-3 text-sm text-hb-ink-soft"} data-graense-tekst>
              {dom.graenseTekst}
            </p>
            {skridtQuery.isError && (
              <p className="mb-3 text-sm text-hb-rust">
                {DINE_SKRIDT_FEJL_TEKST}{" "}
                <button type="button" onClick={() => void skridtQuery.refetch()} className="underline-offset-4 hover:underline">Prøv igen</button>
              </p>
            )}
            <HbCard className="px-5 py-2">
              {dom.aktive.length > 0 ? (
                <ul className="divide-y divide-hb-line">{dom.aktive.map(raekke)}</ul>
              ) : (
                <p className="py-3 text-sm text-hb-ink-soft">Ingen aktive mål lige nu — aktivér et parkeret, eller sæt et nyt.</p>
              )}
            </HbCard>
          </HbSection>

          {/* ── Nået: historik med dato — foldet ── */}
          {dom.naaede.length > 0 && (
            <HbSection eyebrow={`Nået · ${dom.naaede.length}`} hairline className="mt-12">
              <details data-dine-maal-naaede={dom.naaede.length}>
                <summary className="cursor-pointer text-sm text-hb-ink-soft">Vis de nåede mål</summary>
                <HbCard className="mt-3 px-5 py-2">
                  <ul className="divide-y divide-hb-line">{dom.naaede.map(raekke)}</ul>
                </HbCard>
              </details>
            </HbSection>
          )}

          {/* ── Parkeret — foldet ── */}
          {dom.parkerede.length > 0 && (
            <HbSection eyebrow={`Parkeret · ${dom.parkerede.length}`} hairline className="mt-12">
              <details data-dine-maal-parkerede={dom.parkerede.length}>
                <summary className="cursor-pointer text-sm text-hb-ink-soft">Vis de parkerede mål — fremdriften kan ikke ændres, før de er aktiveret igen</summary>
                <HbCard className="mt-3 px-5 py-2">
                  <ul className="divide-y divide-hb-line">{dom.parkerede.map(raekke)}</ul>
                </HbCard>
              </details>
            </HbSection>
          )}
        </>
      )}

      {/* ── Portalerne (MilestoneDialoger, etape 2): opret, detalje/rediger, slet ── */}
      <OpretMilestoneDialog
        open={opretAaben}
        onOpenChange={(v) => { setOpretAaben(v); if (!v) setForudfyldt(null); }}
        forudfyldt={forudfyldt}
        onOpret={opret}
      />
      <MilestoneDetaljeDialog
        ms={aaben}
        open={!!aaben}
        onOpenChange={(v) => { if (!v) setAabenId(null); }}
        // Mål MED skridt: fremdriften regnes af skridtene — detaljens hurtig-fremdrift og «nuværende værdi» siger det i stedet for at skrive.
        onQuickProgress={aabenBeregnet ? () => toast.info("Fremdriften regnes af skridtene under målet") : saetFremgang}
        onUpdateField={opdaterFelt}
        onUpdateCurrentValue={aabenBeregnet ? async () => { toast.info("Fremdriften regnes af skridtene under målet"); } : saetNuvaerendeVaerdi}
      />
      <SletMilestoneDialog
        ms={tilSletning}
        open={!!tilSletning}
        onOpenChange={(v) => { if (!v) setSletId(null); }}
        onSlet={() => {
          if (tilSletning) slet(tilSletning.id, tilSletning.title);
          setSletId(null);
        }}
      />
    </div>
  );
};

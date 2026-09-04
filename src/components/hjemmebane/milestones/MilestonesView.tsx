import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { cn } from "@/lib/utils";
import { MILESTONE_CATEGORIES, CATEGORY_OPTIONS, type MilestoneCategory } from "@/lib/milestoneCategories";
import { MILESTONE_SUGGESTIONS } from "@/lib/milestoneSuggestions";
import { HbAdvisorCompanyPrompt } from "../HbAdvisorCompanyPrompt";
import { HbSection } from "../HbSection";
import { HbCard } from "../HbCard";
import { HbTag } from "../HbTag";
import { HbButton } from "../HbButton";
import { HbProgressBar } from "../akademi/HbProgressBar";
import { HbMilestoneRaekke } from "./HbMilestoneRaekke";
import { useMilestones, sorterAktive, type Milestone, type NyMilestone } from "./useMilestones";
import { MilestoneDetaljeDialog, OpretMilestoneDialog, SletMilestoneDialog } from "./MilestoneDialoger";

/**
 * /milestones i Hjemmebane — ETAPE 1 (4/9): siden, listen og rækkerne.
 *
 * HVORFOR: /milestones var den ENESTE flade i medlemmets menu der landede
 * i det gamle mørke design (Jonas 4/9: «rigtig dårlig oplevelse» — og
 * medlemmerne betaler 50.000). Besluttet samme dag: det gamle design
 * KONVERTERES, ikke flyttes ind i skallen — et skalskifte ville give lys
 * tekst på lyst papir og mørke bokse. Målt før: 31 text-foreground, 43
 * text-muted-foreground, 7 glass-card, rå tailwind-farver for
 * kategorierne, fire Radix-portaler.
 *
 * HVAD DER ER MED — alt siden viste (Milestones.tsx + MilestonesList.tsx):
 * samlet fremdrift, tællinger (i alt / fuldført / aktive), kategorifiltre
 * (kun brugte kategorier), grupperne Aktive / Gennemført / Køleskab med
 * samme sortering, hver milestone med mål, fremdrift, deadline, baseline,
 * kategori, kilde (AI / fra handout), status; den tomme tilstand med tre
 * startforslag og handout-linket; opret, rediger, slet, parker,
 * afkrydsning, fremgang. Datalaget er en ren flytning (useMilestones.ts).
 *
 * FORMEN er husets: HbSection med eyebrow, HbCard til grupperne,
 * HbProgressBar til fremdrift («3 af 8» + hairline), rækker i HbItemRows
 * form, HbTag til kategorier. Ingen procenter i overblikket — «3 af 8»
 * siger det samme.
 *
 * ETAPE 2 — PORTALERNE: opret, rediger og slet kræver Dialog/AlertDialog/
 * Popover/Select. De åbner ind til de GAMLE portaler, flyttet ordret til
 * MilestoneDialoger.tsx, som portalerer til <body> uden for
 * .theme-hjemmebane og derfor ser MØRKE ud. Det er accepteret i denne
 * etape; de virker uændret. Etape 2 bygger dem i skallens eget DOM-træ.
 *
 * Den gamle MilestonesList.tsx står urørt (målt 4/9: dens eneste
 * importør var pages/Milestones.tsx; DashboardMilestones.tsx er sin egen
 * komponent og importerer den ikke).
 */

const STARTER_PICKS: { title: string; cat: MilestoneCategory }[] = [
  { title: "Opnå positiv bundlinje", cat: "profit" },
  { title: "Nå 100 aktive kunder", cat: "kunder" },
  { title: "Reducér driftsomkostninger med 20%", cat: "profit" },
];

export const MilestonesView = () => {
  const { user, companyId, isAdvisor: rawAdvisor } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const { milestones, loading, saetFremgang, saetNuvaerendeVaerdi, skiftFuldfoert, slet, opdaterFelt, opret } = useMilestones({
    userId: user?.id ?? null,
    companyId: companyId ?? null,
    isAdvisor,
  });
  const [kategoriFilter, setKategoriFilter] = useState<MilestoneCategory | "all">("all");
  // Portalerne (etape 2): hvilken milestone der er åben hvor.
  const [opretAaben, setOpretAaben] = useState(false);
  const [forudfyldt, setForudfyldt] = useState<Partial<NyMilestone> | null>(null);
  const [aabenId, setAabenId] = useState<string | null>(null);
  const [sletId, setSletId] = useState<string | null>(null);

  // Tællinger og filtre — Milestones.tsx:59-64.
  const total = milestones.length;
  const fuldfoert = milestones.filter((m) => m.progress >= 100).length;
  const brugteKategorier = useMemo(() => new Set(milestones.map((m) => m.category)), [milestones]);
  const filtreret = kategoriFilter === "all" ? milestones : milestones.filter((m) => m.category === kategoriFilter);
  const aktive = useMemo(() => sorterAktive(filtreret.filter((m) => m.status !== "done" && m.status !== "parked")), [filtreret]);
  const gennemfoert = filtreret.filter((m) => m.status === "done");
  const parkeret = filtreret.filter((m) => m.status === "parked");
  const aaben: Milestone | null = milestones.find((m) => m.id === aabenId) ?? null;
  const tilSletning: Milestone | null = milestones.find((m) => m.id === sletId) ?? null;

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

  const gruppe = (items: Milestone[]) => (
    <ul className="divide-y divide-hb-line">
      {items.map((ms) => (
        <HbMilestoneRaekke
          key={ms.id}
          ms={ms}
          onAabn={() => setAabenId(ms.id)}
          onToggle={() => skiftFuldfoert(ms.id)}
          onFremgang={(p) => saetFremgang(ms.id, p)}
          onParker={() => opdaterFelt(ms.id, { status: ms.status === "parked" ? "active" : "parked" })}
          onSlet={() => setSletId(ms.id)}
        />
      ))}
    </ul>
  );

  return (
    <div>
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Dine tal</p>
          <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">Milestones</h1>
          <p className="mt-3 text-sm text-hb-ink-soft">Sæt og følg dine vigtigste mål.</p>
        </div>
        {!loading && total > 0 && (
          <HbButton onClick={aabnTom} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Opret milestone
          </HbButton>
        )}
      </section>

      {loading ? (
        <div aria-hidden className="mt-10">
          <div className="h-4 w-1/3 animate-pulse rounded bg-hb-line/60" />
          <div className="mt-4 h-24 animate-pulse rounded-hb bg-hb-line/40" />
        </div>
      ) : total === 0 ? (
        /* ── Tom tilstand — Milestones.tsx:150-197 ── */
        <HbSection eyebrow="Kom i gang" title="Sæt dit første mål" hairline className="mt-10">
          <p className="max-w-xl text-sm leading-relaxed text-hb-ink-soft">
            Milestones hjælper dig med at holde fokus på de vigtigste mål for din virksomhed. Start med et af forslagene nedenfor, eller opret dit eget.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <HbButton onClick={aabnTom} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Opret milestone
            </HbButton>
            <Link to="/handouts" className="inline-flex items-center gap-2 text-sm text-hb-evergreen underline-offset-4 hover:underline">
              <BookOpen className="h-4 w-4" />
              Gå til Handouts — generer milestones automatisk
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
          {/* ── Samlet fremdrift — Milestones.tsx:202-235: «3 af 8» i stedet for procent ── */}
          <HbSection eyebrow="Samlet fremdrift" hairline className="mt-10">
            <HbCard className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-[15px] text-hb-ink">
                  {fuldfoert} af {total} {total === 1 ? "milestone" : "milestones"} nået
                </p>
                <p className="text-xs text-hb-ink-soft">
                  {total} i alt
                  {fuldfoert > 0 && <span> · {fuldfoert} fuldført</span>}
                  {total - fuldfoert > 0 && <span> · {total - fuldfoert} aktive</span>}
                </p>
              </div>
              <HbProgressBar done={fuldfoert} total={total} className="mt-3" />
            </HbCard>

            {/* ── Kategorifiltre — Milestones.tsx:238-270, kun brugte kategorier ── */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setKategoriFilter("all")}
                className={cn(
                  "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  kategoriFilter === "all" ? "bg-hb-evergreen text-white" : "bg-hb-sage/60 text-hb-ink hover:bg-hb-sage",
                )}
              >
                Alle
              </button>
              {CATEGORY_OPTIONS.filter((opt) => brugteKategorier.has(opt.value)).map((opt) => {
                const cfg = MILESTONE_CATEGORIES[opt.value];
                const Ikon = cfg.icon;
                const aktiv = kategoriFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setKategoriFilter(aktiv ? "all" : opt.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      aktiv ? "bg-hb-evergreen text-white" : "bg-hb-sage/60 text-hb-ink hover:bg-hb-sage",
                    )}
                  >
                    <Ikon className="h-3 w-3" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </HbSection>

          {/* ── Aktive — MilestonesList.tsx:767-777 ── */}
          <HbSection eyebrow={`Aktive · ${aktive.length}`} hairline className="mt-12">
            <HbCard className="px-5 py-2">
              {aktive.length > 0 ? gruppe(aktive) : (
                <p className="py-3 text-sm text-hb-ink-soft">Ingen aktive milestones{kategoriFilter !== "all" ? " i denne kategori" : ""}.</p>
              )}
            </HbCard>
          </HbSection>

          {/* ── Gennemført — MilestonesList.tsx:779-788 ── */}
          {gennemfoert.length > 0 && (
            <HbSection eyebrow={`Gennemført · ${gennemfoert.length}`} hairline className="mt-12">
              <HbCard className="px-5 py-2">{gruppe(gennemfoert)}</HbCard>
            </HbSection>
          )}

          {/* ── Køleskab — MilestonesList.tsx:790-802 ── */}
          {parkeret.length > 0 && (
            <HbSection eyebrow={`Køleskab · ${parkeret.length}`} hairline className="mt-12">
              <p className="-mt-2 mb-3 text-xs text-hb-ink-soft">Parkerede mål. Fremgangen kan ikke ændres, før de er genaktiveret.</p>
              <HbCard className="px-5 py-2">{gruppe(parkeret)}</HbCard>
            </HbSection>
          )}
        </>
      )}

      {/* ── ETAPE 2 — portalerne (mørke, accepteret). Se MilestoneDialoger.tsx. ── */}
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
        onQuickProgress={saetFremgang}
        onUpdateField={opdaterFelt}
        onUpdateCurrentValue={saetNuvaerendeVaerdi}
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

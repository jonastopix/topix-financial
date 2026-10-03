import { useState, useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Lightbulb, ArrowLeft, ArrowRight, Lock, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";
import { useNavigationReset } from "@/hooks/useNavigationReset";
import { handoutConfigs, moduleOrder, type HandoutModule } from "@/lib/handoutConfig";
import { calcHandoutProgress } from "@/lib/handoutUtils";
import { loadHandoutSummaries } from "@/lib/handoutEngine";
import { kraevRaekke } from "@/lib/kraevRaekker";
import { kildeAf, sektionsfejlTekst } from "@/lib/hjemmebane/hentefejl";
import { RETNING_MODUL, RETNING_STI, modulFraParam } from "@/lib/hjemmebane/oevelse";
import { HbAdvisorCompanyPrompt } from "../HbAdvisorCompanyPrompt";
import { HbSection } from "../HbSection";
import { HbCard } from "../HbCard";
import { HbButton } from "../HbButton";
import { HbHandoutCard } from "./HbHandoutCard";
import { HbHandoutDetail } from "./HbHandoutDetail";

/** Hb-handoutfladen, liste-delen (spejler Handouts.tsx 1:1 i adfærd):
    fremgang, kom-godt-i-gang, kort-grid m. Legat-dag-oplåsning, valgte
    løftestænger, milepæls-rejsen, advisor-prompt + user-id-resolution
    og ?module=-deep-linket (Akademi-broens kontrakt). Al data går
    gennem handoutEngine (H1c); detaljen er HbHandoutDetail. */

interface HandoutSummary {
  module: HandoutModule;
  status: "not_started" | "in_progress" | "completed";
  progress: number;
  completedAt: string | null;
  levers: string[];
  checklist: Record<string, boolean>;
}

export const HandoutsView = () => {
  const { user, companyId, isAdvisor: rawAdvisor, isLegat, membershipTier, companyResolution } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const [searchParams, setSearchParams] = useSearchParams();
  const [summaries, setSummaries] = useState<HandoutSummary[]>(
    moduleOrder.map(m => ({ module: m, status: "not_started" as const, progress: 0, completedAt: null, levers: [], checklist: {} }))
  );
  // ?module= læses i INITIALISERINGEN for listens flader (rådgiver, legat,
  // abonnent): deres deep-link åbner detaljen, og parametret ryddes
  // bagefter, så «Tilbage» til listen er ren. Medlemsgrenen læser IKKE
  // denne state — den læser URL'en direkte (se nedenfor).
  const [activeModule, setActiveModule] = useState<HandoutModule | null>(() =>
    modulFraParam(searchParams.get("module")),
  );
  /* Handouts i Akademiet (1/10-2026 nat; Jonas: «Handouts hører til
     Akademiet … Enkelthed er et nøgleord»): listen er ikke det fulde
     medlems flade længere — menuen har intet punkt, og øvelsen nås fra
     lektionen (OevelseKort). Ruten LEVER for gamle links og mails:
       · medlem på /handouts uden modul       → /akademiet (replace)
       · medlem på /handouts?module=overordnet → /milestones (retningen bor
         i Dine mål — aldrig et handout for et medlem)
       · medlem på /handouts?module=<øvelse>  → editoren direkte, med
         «Tilbage» til lektionen (HbHandoutDetail tilbageTilAkademiet,
         afsenderen i `fra=`)
     Medlemsgrenen læser modulet DIREKTE fra URL'en og rydder aldrig
     parametrene (rådets fund 1 og 3, 2/10): den gamle mount-effekt
     (setSearchParams({})) overhalede <Navigate to=/milestones> og landede
     medlemmet på /handouts uden modul; og uden parametret i URL'en gik
     editoren tabt ved reload og bogmærke. Rydningen var til «tilbage til
     listen», som medlemmet ikke har.
     Rådgiveren (ikke «se som medlem»), legatet OG abonnenten beholder
     listen (rådets fund 2, 2/10 — beslutning): rådgiverens «Dine tal ›
     Handouts» er vejen ind i virksomhedens handouts, legatforløbet låser
     modulerne op dag for dag uden adgang til Akademiet, og abonnenten
     (exit-produktet) har ingen lektioner — uden listen mistede abonnenten
     sine handouts og landede i et tomt Akademi. */
  const erAbonnent = membershipTier === "subscriber";
  const erMedlemsvisning = !isAdvisor && !isLegat && !erAbonnent;
  /* membershipTier er null, mens useAuth afgør den (companyResolution
     «pending») — null er UAFGJORT, ikke «fuldt medlem»: en abonnent må ikke
     sendes til Akademiet i de renders. Rådgiver og legat afgøres af deres
     egne flag og venter ikke. */
  const tierUafgjort = !isAdvisor && !isLegat && companyResolution === "pending";
  const [isLoading, setIsLoading] = useState(true);
  /* Hentefejl (16/9, mangellisten «Tavse queryFn'er — de flader tjeklisten
     fører til»): tjeklistens punkt 6 («Dit første handout») førte hertil
     (siden 1/10 fører det til Akademiet; listen er rådgiverens, legatets og abonnentens), og
     før lignede en fejlet hentning «Kom godt i gang med handouts» — summaries
     beholdt sine not_started-defaults, og ingen sagde noget. Nu kaster
     loadHandoutSummaries (kraevRaekker), fejlen fanges her med kildens navn,
     og fladen viser husets linje (sektionsfejlTekst) i stedet for grid'et og
     kom-godt-i-gang-kortet. Tom (ingen rækker) ser ud som før. */
  const [hentefejl, setHentefejl] = useState<string | null>(null);

  // Resolved member userId for the selected company (advisor view)
  const [memberUserId, setMemberUserId] = useState<string | null>(null);
  // Per-module user_id from existing handout rows
  const [moduleUserMap, setModuleUserMap] = useState<Record<string, string>>({});

  // Legat module gating (ordret fra Handouts.tsx). Kaster ved fejl (16/9):
  // «ingen aktiv indskrivning» er null uden fejl (kraevRaekke); en fejl
  // fanges af TanStack, og fladen siger det (legatQuery.isError). Gaten
  // står som før: uden legatDay er alle moduler åbne — det var den også ved
  // en tavs fejl, nu siger fladen det bare.
  const legatQuery = useQuery({
    queryKey: ["legat-enrollment-handouts", user?.id],
    queryFn: async (): Promise<{ start_date: string; status: string } | null> => {
      if (!user) return null;
      const svar = await (supabase as any)
        .from("legat_enrollments")
        .select("start_date, status")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      return kraevRaekke<{ start_date: string; status: string }>(svar, "legat_enrollments");
    },
    enabled: !!user && isLegat,
  });
  const legatEnrollment = legatQuery.data;

  const legatDay = legatEnrollment ? Math.min(
    Math.max(
      Math.floor((Date.now() - new Date(legatEnrollment.start_date).getTime()) / 86400000) + 1,
      1
    ),
    10
  ) : null;

  const LEGAT_UNLOCK_DAYS: Record<string, number> = {
    overordnet: 1, bogholderi: 3, administration: 5, salg: 7, marketing: 9,
  };

  const isModuleUnlocked = (moduleKey: string): boolean => {
    if (!isLegat || legatDay === null) return true;
    return legatDay >= (LEGAT_UNLOCK_DAYS[moduleKey] ?? 1);
  };

  // Deep-link på LISTENS flader (rådgiver, legat, abonnent): modulet er
  // læst i useState-initialiseringen; her ryddes parametret, så «Tilbage»
  // til listen er ren. Først når det er afgjort, at der ER en liste —
  // medlemsgrenen rydder ALDRIG (modulet og afsenderen skal overleve reload).
  useEffect(() => {
    if (tierUafgjort || erMedlemsvisning) return;
    if (searchParams.get("module")) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kun når dommen falder, ikke ved hver URL-ændring
  }, [tierUafgjort, erMedlemsvisning]);

  // Navigation reset: when nav is clicked while on this page, go back to list
  const resetKey = useNavigationReset();
  useEffect(() => {
    if (resetKey) {
      setActiveModule(null);
    }
  }, [resetKey]);

  // Resolve member userId for the selected company (advisor view only)
  // Use deterministic selection: oldest company_members row (first created member = owner)
  useEffect(() => {
    if (!isAdvisor || !companyId) {
      setMemberUserId(null);
      return;
    }
    supabase
      .from("company_members")
      .select("user_id")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true })
      .limit(1)
      .then(({ data }) => {
        setMemberUserId(data?.[0]?.user_id || null);
      });
  }, [isAdvisor, companyId]);

  useEffect(() => {
    if (!user || !companyId) return;
    // Medlemmet ser ingen liste (grenen nedenfor) — intet opslag for den.
    if (erMedlemsvisning) return;
    setIsLoading(true);
    setHentefejl(null);
    const load = async () => {
      // H1c i motoren — advisor ser virksomhedens rækker, medlem sine egne.
      // Kaster HentningsFejl("handouts") ved fejl; fanges nederst.
      const data = await loadHandoutSummaries({ userId: user!.id, companyId: companyId!, isAdvisor });

      // Build per-module user_id map for advisor deep-linking
      const userMap: Record<string, string> = {};
      const map = new Map((data || []).map(d => {
        userMap[d.module] = d.user_id;
        return [d.module, d];
      }));
      setModuleUserMap(userMap);

      setSummaries(moduleOrder.map(m => {
        const d = map.get(m);
        if (!d) return { module: m, status: "not_started" as const, progress: 0, completedAt: null, levers: [], checklist: {} };
        const config = handoutConfigs[m];
        const levers = (d.levers as string[]) || [];
        const progress = calcHandoutProgress(
          config,
          (d.responses as Record<string, string>) || {},
          (d.checklist as Record<string, boolean>) || {},
          levers
        );
        const checklist = (d.checklist as Record<string, boolean>) || {};
        return { module: m, status: d.status as HandoutSummary["status"], progress, completedAt: (d as any).completed_at || null, levers, checklist };
      }));
      setIsLoading(false);
    };
    load().catch((e: unknown) => {
      // Fejl er ikke tom: kildens navn (handouts) bliver til fladens linje.
      setHentefejl(kildeAf(e));
      setIsLoading(false);
    });
    // `user?.id` — ikke user-objektet (samme fokus-event-mønster som
    // BudgetteringViews load-effekt, hb-budget-persistens-recon §1c):
    // effekten afhænger kun af bruger-identiteten; objektet skiftes ved
    // hvert auth-event og gav unødig genindlæsning/spinner-flimmer.
  }, [user?.id, activeModule, companyId, erMedlemsvisning]);

  // Uafgjort tier (se tierUafgjort) — intet dømmes, før useAuth har svaret.
  if (tierUafgjort) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-hb-evergreen" />
      </div>
    );
  }

  // Medlemmets gren (se erMedlemsvisning ovenfor) — efter ALLE hooks.
  // Modulet læses fra URL'en, ikke fra state: reload og bogmærke holder.
  if (erMedlemsvisning) {
    const modul = modulFraParam(searchParams.get("module"));
    if (!modul) return <Navigate to="/akademiet" replace />;
    if (modul === RETNING_MODUL) return <Navigate to={RETNING_STI} replace />;
    return (
      <HbHandoutDetail
        config={handoutConfigs[modul]}
        onBack={() => undefined}
        tilbageTilAkademiet
        fra={searchParams.get("fra")}
      />
    );
  }

  if (activeModule) {
    // Resolve the correct member userId for this module
    const resolvedUserId = isAdvisor
      ? (moduleUserMap[activeModule] || memberUserId)
      : undefined; // members use their own user.id via default

    // In advisor view, fail gracefully if we can't resolve a member
    if (isAdvisor && !resolvedUserId) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <p className="text-sm text-hb-ink-soft">
            Ingen medlemmer fundet for denne virksomhed. Handout kan ikke vises.
          </p>
          <button
            type="button"
            onClick={() => setActiveModule(null)}
            className="inline-flex items-center gap-1.5 text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
          >
            <ArrowLeft className="h-4 w-4" /> Tilbage
          </button>
        </div>
      );
    }

    return (
      <HbHandoutDetail
        config={handoutConfigs[activeModule]}
        onBack={() => setActiveModule(null)}
        onModuleSelect={(m) => setActiveModule(m)}
        userId={resolvedUserId || undefined}
      />
    );
  }

  const totalProgress = summaries.length > 0
    ? Math.round(summaries.reduce((s, h) => s + h.progress, 0) / summaries.length)
    : 0;
  const completedCount = summaries.filter(s => s.status === "completed").length;
  const fejlet = hentefejl != null;

  if (isAdvisor && !companyId) {
    return <HbAdvisorCompanyPrompt />;
  }

  return (
    <div>
      {/* ── Header ── */}
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Dine tal</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
          Handouts
        </h1>
        <p className="mt-3 text-sm text-hb-ink-soft">
          Udfyld dine handouts for hvert modul · {totalProgress}% samlet udfyldt
        </p>
      </section>

      {/* ── Hentefejl (16/9): fejl og tom er to beskeder. Linjen står i stedet
          for grid'et, fremgangen og kom-godt-i-gang — en fejlet hentning må
          aldrig se ud som «du har ikke udfyldt noget». ── */}
      {fejlet && (
        <HbCard className="mt-8 p-5">
          <p className="text-sm text-hb-ink">{sektionsfejlTekst(hentefejl)}</p>
          <p className="mt-1 text-xs text-hb-ink-soft">Prøv igen om lidt.</p>
        </HbCard>
      )}
      {legatQuery.isError && (
        <p className="mt-4 text-sm text-hb-ink-soft">{sektionsfejlTekst("legat_enrollments")}</p>
      )}

      {/* ── Din fremgang ── */}
      {!isAdvisor && !isLoading && !fejlet && summaries.length > 0 && (
        <HbCard className="mt-8 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-hb-ink">Din fremgang</p>
              <p className="mt-0.5 text-xs text-hb-ink-soft">
                {completedCount} af {summaries.length} moduler gennemført
              </p>
            </div>
            <span className="font-editorial text-2xl font-medium text-hb-ink">{totalProgress}%</span>
          </div>
          <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-hb-line">
            <div className="h-full rounded-full bg-hb-evergreen/70 transition-all duration-500" style={{ width: `${totalProgress}%` }} />
          </div>
          {totalProgress === 100 && (
            <p className="mt-2 text-xs font-medium text-hb-evergreen">
              🎉 Alle moduler gennemført — du har lagt et stærkt fundament
            </p>
          )}
        </HbCard>
      )}

      {/* ── Kom godt i gang ── (kun når hentningen LYKKEDES og alt er urørt) */}
      {!isAdvisor && !isLoading && !fejlet && summaries.every(s => s.status === "not_started" && s.progress === 0) && (
        <HbCard className="mt-4 flex items-start gap-4 p-5">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-hb-sage/60">
            <Lightbulb className="h-5 w-5 text-hb-evergreen" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-sm font-semibold text-hb-ink">Kom godt i gang med handouts</p>
            <p className="mb-3 text-sm text-hb-ink-soft">
              Handouts hjælper dig med at strukturere og dokumentere de vigtigste områder i din virksomhed. Start med at sætte dine mål, og fortsæt derefter med bogholderiet.
            </p>
            <HbButton variant="secondary" className="h-9 px-4 text-xs" onClick={() => setActiveModule("overordnet")}>
              Start med Målsætning 12 mdr. <ArrowRight className="h-3.5 w-3.5" />
            </HbButton>
          </div>
        </HbCard>
      )}

      {/* ── Modul-grid ── (ved fejl står linjen ovenfor — intet grid af tomme kort) */}
      <section className="mt-8">
        {fejlet ? null : isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-hb-evergreen" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {summaries.map(s => {
              const locked = !isModuleUnlocked(s.module);
              return (
                <div key={s.module} className="relative">
                  {locked ? (
                    <div className="flex items-center gap-4 rounded-hb border border-hb-line bg-hb-paper p-5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-hb-line/50">
                        <Lock className="h-5 w-5 text-hb-ink-soft/50" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-hb-ink-soft">
                          {s.module === "bogholderi" ? "Bogholderi & Økonomi" :
                           s.module === "administration" ? "Administration & Kundeservice" :
                           s.module === "salg" ? "Salg" :
                           s.module === "marketing" ? "Marketing" : s.module}
                        </p>
                        <p className="mt-0.5 text-xs text-hb-ink-soft/70">
                          Åbner på dag {LEGAT_UNLOCK_DAYS[s.module] ?? "?"} af dit forløb
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-hb-line/50 px-2.5 py-1 text-xs text-hb-ink-soft/70">
                        Dag {LEGAT_UNLOCK_DAYS[s.module] ?? "?"}
                      </span>
                    </div>
                  ) : (
                    <HbHandoutCard
                      config={handoutConfigs[s.module]}
                      status={s.status}
                      progress={s.progress}
                      completedAt={s.completedAt}
                      onClick={() => setActiveModule(s.module)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Dine valgte løftestænger ── */}
      {!isAdvisor && !isLoading && !fejlet && (() => {
        const allLevers = summaries.flatMap(s =>
          s.levers.map(lever => ({
            lever,
            module: s.module,
            moduleTitle: handoutConfigs[s.module]?.title || s.module,
          }))
        );

        return (
          <>
            {allLevers.length > 0 && (
              <HbSection eyebrow="Handling" title="Dine valgte løftestænger" className="mt-12">
                <p className="-mt-2 mb-4 text-sm text-hb-ink-soft">
                  Dette er de konkrete indsatser du har valgt at arbejde med i dit forløb.
                  Del dem gerne med din rådgiver i chatten. · {allLevers.length} aktive
                </p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {allLevers.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg border border-hb-line bg-hb-surface p-3.5">
                      <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-hb-evergreen" />
                      <div className="min-w-0">
                        <p className="text-sm leading-snug text-hb-ink">{item.lever}</p>
                        <p className="mt-0.5 text-[10px] text-hb-ink-soft">{item.moduleTitle}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </HbSection>
            )}

            {allLevers.length === 0 && summaries.some(s => s.progress > 0) && (
              <HbCard className="mt-8 flex items-center gap-4 p-5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-hb-sage/60">
                  <Lightbulb className="h-5 w-5 text-hb-evergreen" />
                </div>
                <div>
                  <p className="text-sm font-medium text-hb-ink">Vælg dine løftestænger</p>
                  <p className="mt-0.5 text-xs text-hb-ink-soft">
                    Løftestænger er de konkrete indsatser du vil arbejde med. Du finder dem i hvert handout-modul.
                  </p>
                </div>
              </HbCard>
            )}
          </>
        );
      })()}

      {/* ── Milepæls-rejsen ── */}
      {!isAdvisor && !isLoading && !fejlet && (() => {
        const allChecklistModules = summaries
          .map(s => {
            const config = handoutConfigs[s.module];
            const checklistItems = config.sections
              .flatMap(sec => sec.checklist || []);
            if (checklistItems.length === 0) return null;
            const checkedCount = checklistItems.filter(item => s.checklist?.[item.key]).length;
            return {
              module: s.module,
              title: config.title,
              items: checklistItems,
              checklist: s.checklist || {},
              checkedCount,
              total: checklistItems.length,
            };
          })
          .filter(Boolean);

        if (allChecklistModules.length === 0) return null;

        const totalItems = allChecklistModules.reduce((sum, m) => sum + m!.total, 0);
        const totalChecked = allChecklistModules.reduce((sum, m) => sum + m!.checkedCount, 0);
        const pct = totalItems > 0 ? Math.round((totalChecked / totalItems) * 100) : 0;

        return (
          <HbSection eyebrow="Rejsen" title="Din rejse mod en professionelt drevet virksomhed" className="mt-12">
            <HbCard className="p-6">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs text-hb-ink-soft">{totalChecked} af {totalItems} trin nået</p>
                <span className="font-editorial text-2xl font-medium text-hb-ink">{pct}%</span>
              </div>
              <div className="mb-6 mt-2 h-[3px] overflow-hidden rounded-full bg-hb-line">
                <div className="h-full rounded-full bg-hb-evergreen/70 transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="space-y-6">
                {allChecklistModules.map(m => m && (
                  <div key={m.module}>
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{m.title}</p>
                      <span className="text-[11px] text-hb-ink-soft">{m.checkedCount}/{m.total}</span>
                    </div>
                    <div className="space-y-2">
                      {m.items.map(item => (
                        <div key={item.key} className="flex items-start gap-3">
                          <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                            m.checklist[item.key]
                              ? "border-hb-evergreen bg-hb-evergreen"
                              : "border-hb-line bg-transparent"
                          }`}>
                            {m.checklist[item.key] && (
                              <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <span className={`text-xs leading-relaxed ${
                            m.checklist[item.key] ? "text-hb-ink" : "text-hb-ink-soft"
                          }`}>
                            {item.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {pct < 100 && (
                <p className="mt-6 text-center text-[11px] text-hb-ink-soft">
                  Udfyld handout-modulerne for at markere trinene som nået
                </p>
              )}
              {pct === 100 && (
                <p className="mt-6 text-center text-[11px] font-medium text-hb-evergreen">
                  🎉 Du driver en professionelt struktureret virksomhed
                </p>
              )}
            </HbCard>
          </HbSection>
        );
      })()}
    </div>
  );
};

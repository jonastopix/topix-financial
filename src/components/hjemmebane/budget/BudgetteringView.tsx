import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { useScrollToHash } from "@/hooks/useScrollToHash";
import { formatCompact, formatDKK, SHORT_MONTHS } from "@/lib/financialUtils";
import { GROUP_LABELS, GROUP_ORDER, type BudgetTemplate } from "@/lib/budgetTemplates";
import {
  computeEbitda,
  deriveBudgetFill,
  erMaanedUdfyldt,
  loadBudget,
  resolveAutoYear,
  writeTemplateMarker,
} from "@/lib/budgetEngine";
import { catToRow, MONTHS, SCENARIOS, type BudgetRow, type ScenarioKey } from "@/components/budget/types";
import { HbAdvisorCompanyPrompt } from "../HbAdvisorCompanyPrompt";
import { HbButton } from "../HbButton";
import { HbCard } from "../HbCard";
import { HbSection } from "../HbSection";
import { HbSegmented } from "../admin/HbSegmented";
import { HbBudgetBva } from "./HbBudgetBva";
import { HbBudgetCashflow } from "./HbBudgetCashflow";
import { HbBudgetEditTable } from "./HbBudgetEditTable";
import { HbBudgetExcelImport, HbBudgetFromAccounts } from "./HbBudgetImport";
import { HbBudgetSimulator } from "./HbBudgetSimulator";
import { HbBudgetTemplateGuide } from "./HbBudgetTemplateGuide";
import { QuietNote, TalStat, hbBudgetTooltipStyle } from "./hbBudgetShared";

/** Hb-budgetfladen (budget-design §c, godkendt 2026-08-05): SEKTIONERET
    side — ritualet overblik → sammenlign → planlæg → simulér. Route-
    parallel byggeflade på /budgettering (AdvisorRoute i byggeperioden);
    GO = swap på /budget (notifikations-deep_link + Guide-hash er
    kontrakt). Al data går gennem budgetEngine (én sandhed m. gammel
    flade); kvitteringer er stille; tal-afvigelser er attention, aldrig
    alarm (budgetTone). #forecast-sektionen er ALTID i DOM — det indfrier
    Guide-hash'en strukturelt (recon §7.4). State-roden spejler Budget.tsx
    (år, scenarie, template, scenarioData, dbLoaded, auto-år-guarden). */

type EmptyFlow = "choice" | "guide" | "import" | "accounts";

export const BudgetteringView = () => {
  useScrollToHash();
  const { user, companyId, isAdvisor: rawAdvisor } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [activeScenario, setActiveScenario] = useState<ScenarioKey>("base");
  const { data: facts = [] } = useCompanyFacts();
  const [selectedTemplate, setSelectedTemplate] = useState<BudgetTemplate | null>(null);
  const [templateFromMarker, setTemplateFromMarker] = useState(false);
  const [scenarioData, setScenarioData] = useState<Record<ScenarioKey, BudgetRow[]> | null>(null);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [labelOverrides, setLabelOverrides] = useState<Record<string, string>>({});
  const [emptyFlow, setEmptyFlow] = useState<EmptyFlow>("choice");
  const [confirmingTemplateChange, setConfirmingTemplateChange] = useState(false);
  const [changingTemplate, setChangingTemplate] = useState(false);
  const [headerNote, setHeaderNote] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [fravalgte, setFravalgte] = useState<{ key: string; label: string }[]>([]);
  const [importGitterAabent, setImportGitterAabent] = useState(false);
  const autoYearAdjustedFor = useRef<string | null>(null);

  // Load — samme forløb som Budget.tsx' effekt, over motoren.
  useEffect(() => {
    if (!user || !companyId) return;

    const load = async () => {
      setSelectedTemplate(null);
      setTemplateFromMarker(false);
      setScenarioData(null);
      setLabelOverrides({});
      setDbLoaded(false);

      try {
        const result = await loadBudget(companyId, year);
        if (result.empty || !result.decoded) return;

        const jumpYear = resolveAutoYear(result.availableYears, year);
        if (jumpYear && autoYearAdjustedFor.current !== companyId) {
          autoYearAdjustedFor.current = companyId;
          setYear(jumpYear);
          return;
        }

        setSelectedTemplate(result.decoded.template);
        setTemplateFromMarker(result.decoded.templateFromMarker);
        setLabelOverrides(result.decoded.labelOverrides);
        setScenarioData(result.decoded.scenarioData);
        setFravalgte(result.decoded.fravalgte);
      } catch (e) {
        console.error("[Budgettering] loadBudget failed:", e);
      } finally {
        setDbLoaded(true);
      }
    };

    void load();
    // `user?.id` — IKKE user-objektet: supabase affyrer auth-events ved
    // fane-fokus (SIGNED_IN/TOKEN_REFRESHED), useAuth sætter da et NYT
    // user-objekt, og med objektet som dep re-kørte effekten → nulstilling
    // af scenarioData/dbLoaded → unmount af import-komponenterne → tab af
    // indlæste forslag (hb-budget-persistens-recon §1c). Effekten afhænger
    // reelt kun af bruger-IDENTITETEN.
  }, [user?.id, companyId, year, reloadNonce]);

  const viewRows = useMemo(
    () => (scenarioData ? scenarioData[activeScenario] : []),
    [scenarioData, activeScenario],
  );
  const fill = useMemo(() => deriveBudgetFill(viewRows), [viewRows]);
  const ebitda = useMemo(() => computeEbitda(viewRows), [viewRows]);

  const revenueRows = viewRows.filter((r) => r.group === "indtaegter");
  const costRows = viewRows.filter((r) => r.group !== "indtaegter");
  const totalOmsaetning = revenueRows.reduce((s, r) => s + r.values.reduce((a, b) => a + b, 0), 0);
  const totalCosts = costRows.reduce((s, r) => s + Math.abs(r.values.reduce((a, b) => a + b, 0)), 0);
  const totalEbitda = ebitda.reduce((s, v) => s + v, 0);

  const chartData = useMemo(
    () =>
      MONTHS.map((month, i) => ({
        month,
        omsaetning: viewRows
          .filter((r) => r.group === "indtaegter")
          .reduce((s, r) => s + r.values[i], 0),
        ebitda: ebitda[i],
      })),
    [viewRows, ebitda],
  );

  const costByGroup = useMemo(
    () =>
      GROUP_ORDER.filter((g) => g !== "indtaegter")
        .map((g) => {
          const groupRows = viewRows.filter((r) => r.group === g);
          const total = groupRows.reduce(
            (sum, row) => sum + Math.abs(row.values.reduce((s, v) => s + v, 0)),
            0,
          );
          return { group: g, label: GROUP_LABELS[g], total, count: groupRows.length };
        })
        .filter((g) => g.total > 0 || g.count > 0),
    [viewRows],
  );

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const std = [0, 1, 2].map((o) => String(current + o - 1));
    return std.includes(year) ? std : [...std, year].sort();
  }, [year]);

  const scenarioLabel = SCENARIOS.find((s) => s.key === activeScenario)?.label ?? "";

  const handleTemplateSelect = async (tmpl: BudgetTemplate) => {
    setSelectedTemplate(tmpl);
    setTemplateFromMarker(true);
    setScenarioData({
      base: tmpl.categories.map(catToRow),
      optimistisk: tmpl.categories.map(catToRow),
      pessimistisk: tmpl.categories.map(catToRow),
    });
    setLabelOverrides({});
    setChangingTemplate(false);
    setEmptyFlow("choice");
    if (user && companyId) {
      await writeTemplateMarker(user.id, companyId, tmpl.key);
    }
    setHeaderNote(`Skabelonen "${tmpl.label}" er valgt`);
  };

  // Efter import/generering: skrivevejene (W5/W6) HAR persisteret — fladen
  // genindlæser fra motoren (én sandhed) frem for at samle state lokalt.
  // Uden marker viser headeren "Importeret budget" (§e(i), klik-valg A).
  const handleImported = (result: { year: string }) => {
    setEmptyFlow("choice");
    setChangingTemplate(false);
    setHeaderNote(`Budget ${result.year} er på plads`);
    if (result.year !== year) setYear(result.year);
    else setReloadNonce((n) => n + 1);
  };

  const isEmptyState = dbLoaded && !selectedTemplate && !scenarioData;
  const isLoading = !isEmptyState && !scenarioData;

  const templateLine = !scenarioData
    ? null
    : templateFromMarker && selectedTemplate
      ? `Skabelon: ${selectedTemplate.label}`
      : "Importeret budget — uden skabelon";

  if (isAdvisor && !companyId) {
    return <HbAdvisorCompanyPrompt />;
  }

  return (
    <div>
      {/* ── Header ── */}
      <section>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Dine tal</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
            Budget
          </h1>
          <HbSegmented
            value={year}
            options={yearOptions.map((y) => ({ value: y, label: y }))}
            onChange={setYear}
            aria-label="Vælg budgetår"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-hb-ink-soft">
          {templateLine && <span>{templateLine}</span>}
          {scenarioData && !confirmingTemplateChange && !changingTemplate && (
            <button
              type="button"
              onClick={() => setConfirmingTemplateChange(true)}
              className="underline-offset-4 hover:text-hb-ink hover:underline"
            >
              Skift skabelon
            </button>
          )}
          <QuietNote note={headerNote} error={null} />
        </div>

        {/* Inline-bekræftelse — fladen har ingen dialog-broer (§c1). */}
        {confirmingTemplateChange && (
          <HbCard className="mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-hb-ink">
              Skift af skabelon nulstiller dit nuværende budget — de indtastede tal kan ikke gendannes.
            </p>
            <div className="flex items-center gap-3">
              <HbButton
                variant="secondary"
                className="h-9 px-5 text-sm"
                onClick={() => {
                  setConfirmingTemplateChange(false);
                  setChangingTemplate(true);
                }}
              >
                Nulstil og vælg ny
              </HbButton>
              <button
                type="button"
                onClick={() => setConfirmingTemplateChange(false)}
                className="text-sm text-hb-ink-soft underline-offset-4 hover:underline"
              >
                Fortryd
              </button>
            </div>
          </HbCard>
        )}
      </section>

      {/* ── Skift skabelon (data findes) ── */}
      {changingTemplate && scenarioData && (
        <HbSection eyebrow="Skabelon" title="Vælg en ny skabelon" className="mt-10">
          <button
            type="button"
            onClick={() => setChangingTemplate(false)}
            className="mb-4 text-sm text-hb-ink-soft underline-offset-4 hover:underline"
          >
            ← Tilbage til budgettet
          </button>
          <HbBudgetTemplateGuide onSelect={(t) => void handleTemplateSelect(t)} />
        </HbSection>
      )}

      {/* ── Tom-tilstanden: invitation + tre valg ── */}
      {isEmptyState && (
        <HbSection eyebrow="Kom i gang" title={`Byg dit budget for ${year}`} className="mt-10">
          {emptyFlow === "choice" && (
            <>
              <p className="max-w-xl text-sm text-hb-ink-soft">
                Start med en skabelon der passer til din virksomhed, importér dit eksisterende
                budgetark, eller lad os foreslå et budget ud fra dit regnskab. Tallene sammenlignes
                automatisk med dine rapporter under Budget vs. realiseret.
              </p>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {[
                  {
                    key: "guide" as const,
                    title: "Vælg en skabelon",
                    text: "Service, handel, produktion og SaaS — to spørgsmål finder den rigtige.",
                  },
                  {
                    key: "import" as const,
                    title: "Importér fra Excel",
                    text: "Upload dit eksisterende budgetark — vi læser hver linje og foreslår kategorierne.",
                  },
                  {
                    key: "accounts" as const,
                    title: "Generér fra regnskab",
                    text: "Upload din resultatopgørelse — vi foreslår næste års budget med valgfri vækst.",
                  },
                ].map((card) => (
                  <button
                    key={card.key}
                    type="button"
                    onClick={() => setEmptyFlow(card.key)}
                    className="rounded-hb border border-hb-line bg-hb-surface p-5 text-left transition-colors hover:border-hb-evergreen/50 hover:bg-hb-sage/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/60"
                  >
                    <p className="font-editorial text-lg font-medium text-hb-ink">{card.title}</p>
                    <p className="mt-1 text-sm text-hb-ink-soft">{card.text}</p>
                  </button>
                ))}
              </div>
            </>
          )}
          {emptyFlow !== "choice" && (
            <div>
              <button
                type="button"
                onClick={() => setEmptyFlow("choice")}
                className="mb-4 text-sm text-hb-ink-soft underline-offset-4 hover:underline"
              >
                ← Tilbage
              </button>
              {emptyFlow === "guide" && (
                <HbBudgetTemplateGuide onSelect={(t) => void handleTemplateSelect(t)} />
              )}
              {emptyFlow === "import" && (
                <HbBudgetExcelImport
                  userId={user?.id}
                  companyId={companyId ?? undefined}
                  onImported={handleImported}
                  skabelonKey={templateFromMarker && selectedTemplate ? selectedTemplate.key : null}
                />
              )}
              {emptyFlow === "accounts" && (
                <HbBudgetFromAccounts userId={user?.id} companyId={companyId ?? undefined} onImported={handleImported} />
              )}
            </div>
          )}
        </HbSection>
      )}

      {/* ── Loading ── */}
      {isLoading && (
        <div className="mt-10 space-y-4">
          <div className="h-24 animate-pulse rounded-hb bg-hb-sand/60" />
          <div className="h-64 animate-pulse rounded-hb bg-hb-sand/60" />
          <div className="h-40 animate-pulse rounded-hb bg-hb-sand/60" />
        </div>
      )}

      {/* ── Hovedfladen ── */}
      {scenarioData && !changingTemplate && (
        <div className="space-y-12">
          {/* Prik-båndet: udfyldnings-rejsen som roligt bånd (§c2) */}
          <HbCard className="mt-8 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                Budget {year}
                {activeScenario !== "base" && ` · ${scenarioLabel}-scenariet`}
              </p>
              <p className="text-sm text-hb-ink-soft">
                {fill.state === "empty"
                  ? "Ikke udfyldt endnu — start under Scenarier eller Importér"
                  : `${fill.filledMonths} af 12 måneder udfyldt`}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {MONTHS.map((m, i) => {
                // Samme dom som tælleren ovenfor (erMaanedUdfyldt) — før
                // talte prikkerne kun positiv omsætning og kunne vise otte
                // fyldte ved siden af "12 af 12 måneder udfyldt".
                const udfyldt = erMaanedUdfyldt(viewRows, i);
                return (
                  <span key={m} className="flex flex-col items-center gap-1" title={`${m} — ${udfyldt ? "udfyldt" : "ikke udfyldt"}`}>
                    <span
                      className={cn(
                        "h-4 w-4 rounded-full border",
                        udfyldt ? "border-hb-evergreen bg-hb-evergreen" : "border-hb-line",
                      )}
                    />
                    <span className="text-[10px] text-hb-ink-soft">{SHORT_MONTHS[i]}</span>
                  </span>
                );
              })}
            </div>
          </HbCard>

          {/* OVERSIGT (overblik) */}
          <HbSection eyebrow="Overblik" title={`Budget ${year}`} id="oversigt">
            <HbCard className="p-5">
              <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
                <TalStat label="Omsætning" value={formatDKK(totalOmsaetning)} />
                <TalStat label="Omkostninger" value={formatDKK(totalCosts)} />
                <TalStat label="EBITDA" value={formatDKK(totalEbitda)} attention={totalEbitda < 0} />
                <TalStat
                  label="EBITDA-margin"
                  value={totalOmsaetning > 0 ? `${((totalEbitda / totalOmsaetning) * 100).toFixed(1)} %` : "—"}
                  attention={totalEbitda < 0}
                />
              </div>
              {facts.length > 0 && (
                <p className="mt-4 border-t border-hb-line pt-3 text-sm text-hb-ink-soft">
                  Der er rapport-tal for {year} —{" "}
                  <a href="#sammenlign" className="text-hb-rust underline-offset-4 hover:underline">
                    se sammenligningen nedenfor
                  </a>
                  .
                </p>
              )}
            </HbCard>

            <HbCard className="mt-4 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                  Måned for måned
                </p>
                <p className="text-xs text-hb-ink-soft">Lys søjle omsætning · mørk søjle EBITDA</p>
              </div>
              <div className="mt-3">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} barGap={4} barCategoryGap="25%">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--hb-line))" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: "hsl(var(--hb-ink-soft))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "hsl(var(--hb-ink-soft))" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => formatCompact(v)}
                      width={48}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatDKK(value),
                        name === "omsaetning" ? "Omsætning" : "EBITDA",
                      ]}
                      {...hbBudgetTooltipStyle}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--hb-line))" />
                    <Bar dataKey="omsaetning" fill="hsl(var(--hb-evergreen))" opacity={0.3} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="ebitda" radius={[3, 3, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.ebitda >= 0 ? "hsl(var(--hb-evergreen))" : "hsl(var(--hb-rust))"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </HbCard>

            {costByGroup.length > 0 && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {costByGroup.map((g) => (
                  <HbCard key={g.group} className="p-5">
                    <TalStat
                      label={g.label}
                      value={g.total > 0 ? formatDKK(g.total) : "—"}
                      sub={`${g.count} ${g.count === 1 ? "linje" : "linjer"}`}
                    />
                  </HbCard>
                ))}
              </div>
            )}
          </HbSection>

          {/* BUDGET VS. REALISERET (sammenlign) */}
          <HbSection eyebrow="Sammenlign" title="Budget vs. realiseret" id="sammenlign" className="scroll-mt-24">
            <HbBudgetBva baseRows={scenarioData.base} year={year} companyId={companyId ?? undefined} />
          </HbSection>

          {/* SCENARIER (planlæg) */}
          <HbSection eyebrow="Planlæg" title="Scenarier" id="scenarier">
            <HbBudgetEditTable
              scenarioData={scenarioData}
              setScenarioData={setScenarioData}
              activeScenario={activeScenario}
              setActiveScenario={setActiveScenario}
              year={year}
              userId={user?.id}
              companyId={companyId ?? undefined}
              selectedTemplate={selectedTemplate}
              labelOverrides={labelOverrides}
              setLabelOverrides={setLabelOverrides}
              fravalgte={fravalgte}
              onGenindlaes={() => setReloadNonce((n) => n + 1)}
            />
          </HbSection>

          {/* IMPORT (planlæg, fortsat). Når importgitteret er åbent, fylder
              det HELE bredden — "Generér fra regnskab" er en anden opgave og
              står ikke ved siden af et åbent gennemsyn. */}
          <HbSection eyebrow="Planlæg" title="Importér" id="import">
            <div className={cn("grid gap-4", !importGitterAabent && "lg:grid-cols-2")}>
              <HbCard className="p-5">
                <HbBudgetExcelImport
                  userId={user?.id}
                  companyId={companyId ?? undefined}
                  onImported={handleImported}
                  onAabenSkift={setImportGitterAabent}
                  skabelonKey={templateFromMarker && selectedTemplate ? selectedTemplate.key : null}
                />
              </HbCard>
              {!importGitterAabent && (
                <HbCard className="p-5">
                  <HbBudgetFromAccounts userId={user?.id} companyId={companyId ?? undefined} onImported={handleImported} />
                </HbCard>
              )}
            </div>
          </HbSection>
        </div>
      )}

      {/* HVAD-HVIS (simulér) — ALTID i DOM: #forecast er Guide-kontrakt (§c7). */}
      <HbSection eyebrow="Simulér" title="Hvad-hvis" id="forecast" className="mt-12 scroll-mt-24">
        {scenarioData && !changingTemplate ? (
          <HbBudgetSimulator
            rows={viewRows}
            year={year}
            companyId={companyId ?? undefined}
            userId={user?.id}
          />
        ) : (
          <HbCard className="p-5">
            <p className="text-sm text-hb-ink-soft">
              Hvad-hvis kræver et budget med tal — start ovenfor, så kan du simulere ansættelser,
              marketing og lokaler her.
            </p>
          </HbCard>
        )}
      </HbSection>

      {/* CASHFLOW (konsekvens) */}
      {scenarioData && !changingTemplate && (
        <HbSection eyebrow="Konsekvens" title="Cashflow" id="cashflow" className="mt-12">
          <HbBudgetCashflow rows={viewRows} year={year} companyId={companyId ?? undefined} />
        </HbSection>
      )}
    </div>
  );
};

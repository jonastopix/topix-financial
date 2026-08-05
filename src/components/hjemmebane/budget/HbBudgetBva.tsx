import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { formatCompact, formatDKK } from "@/lib/financialUtils";
import { computeEbitda, getBudgetRowReportField } from "@/lib/budgetEngine";
import { GROUP_LABELS, GROUP_ORDER } from "@/lib/budgetTemplates";
import { MONTHS, REVENUE_GROUPS, type BudgetRow } from "@/components/budget/types";
import { HbCard } from "../HbCard";
import { deriveBudgetTone } from "./budgetTone";
import { TalStat, fmtNumber, hbBudgetTooltipStyle } from "./hbBudgetShared";

/** Budget vs. Realiseret (design-blok §c4): afledningerne spejler
    BudgetVsActualTab 1:1 (actualsMap, delt-felt-dommen, EBITDA-rækken);
    afvigelser dømmes af budgetTone (quiet/attention — aldrig
    alarm-ikoner). Tabellen beholder 12 månedskolonner (paritet) m. ny
    ÅTD-førstekolonne og to-lags-celler; rækker uden rapportfelt vises
    ærligt uden tone-dom (§e(iii)). */

interface Props {
  baseRows: BudgetRow[];
  year: string;
  companyId: string | undefined;
}

const toneClass = (tone: "quiet" | "attention") =>
  tone === "attention" ? "text-hb-rust" : "text-hb-ink-soft";

const pctLabel = (pct: number | null) =>
  pct == null ? "" : `${pct > 0 ? "+" : ""}${pct.toFixed(0)} %`;

export const HbBudgetBva = ({ baseRows, year, companyId }: Props) => {
  const { data: facts = [] } = useCompanyFacts(companyId);

  // Realiserede felter pr. måned — spejler BudgetVsActualTab.tsx:47-67.
  const actualsMap = useMemo(() => {
    const map: Record<number, Record<string, number>> = {};
    for (const fact of facts) {
      const [factYear, monthStr] = fact.period_key.split("-");
      if (factYear !== year) continue;
      const monthIdx = parseInt(monthStr, 10) - 1;
      if (monthIdx < 0 || monthIdx > 11) continue;

      const kf = factsToDanishMetrics(fact.metrics);
      if (!map[monthIdx]) map[monthIdx] = {};
      if (kf.omsaetning != null) map[monthIdx]["omsaetning"] = Math.abs(kf.omsaetning);
      if (kf.direkte_omkostninger != null) map[monthIdx]["direkte_omkostninger"] = Math.abs(kf.direkte_omkostninger);
      if (kf.loenninger != null) map[monthIdx]["loenninger"] = Math.abs(kf.loenninger);
      if (kf.salgsomkostninger != null) map[monthIdx]["salgsomkostninger"] = Math.abs(kf.salgsomkostninger);
      if (kf.lokaleomkostninger != null) map[monthIdx]["lokaleomkostninger"] = Math.abs(kf.lokaleomkostninger);
      if (kf.administrationsomkostninger != null)
        map[monthIdx]["administrationsomkostninger"] = Math.abs(kf.administrationsomkostninger);
    }
    return map;
  }, [facts, year]);

  const hasAnyActuals = Object.keys(actualsMap).length > 0;
  const isBudgetEmpty = baseRows.every((r) => r.values.every((v) => v === 0));
  const lastActualIdx = Object.keys(actualsMap).reduce((max, k) => Math.max(max, Number(k)), -1);

  // Delt-felt-dommen — spejler BudgetVsActualTab.tsx:73-87.
  const sharedFieldRows = useMemo(() => {
    const fieldCount: Record<string, number> = {};
    for (const row of baseRows) {
      const field = getBudgetRowReportField(row.key);
      if (field) fieldCount[field] = (fieldCount[field] || 0) + 1;
    }
    return new Set(
      baseRows
        .filter((r) => {
          const f = getBudgetRowReportField(r.key);
          return f && fieldCount[f]! > 1;
        })
        .map((r) => r.key),
    );
  }, [baseRows]);

  const groupedRows = GROUP_ORDER.map((g) => ({
    group: g,
    label: GROUP_LABELS[g],
    rows: baseRows.filter((r) => r.group === g),
  })).filter((g) => g.rows.length > 0);

  const budgetEbitda = computeEbitda(baseRows);

  const actualEbitda = MONTHS.map((_, i) => {
    if (!actualsMap[i]) return null;
    const rev = actualsMap[i]["omsaetning"] ?? 0;
    const costs =
      (actualsMap[i]["direkte_omkostninger"] ?? 0) +
      (actualsMap[i]["loenninger"] ?? 0) +
      (actualsMap[i]["salgsomkostninger"] ?? 0) +
      (actualsMap[i]["lokaleomkostninger"] ?? 0) +
      (actualsMap[i]["administrationsomkostninger"] ?? 0);
    return rev - costs;
  });

  const revenueRows = baseRows.filter((r) => r.group === "indtaegter");
  const costRows = baseRows.filter((r) => r.group !== "indtaegter");
  const totalBudgetRevenue = revenueRows.reduce((s, r) => s + r.values.reduce((a, b) => a + b, 0), 0);
  const totalBudgetCosts = costRows.reduce((s, r) => s + Math.abs(r.values.reduce((a, b) => a + b, 0)), 0);
  const totalBudgetEbitda = totalBudgetRevenue - totalBudgetCosts;

  const totalActualRevenue = MONTHS.reduce((s, _, i) => s + (actualsMap[i]?.["omsaetning"] ?? 0), 0);
  const totalActualCosts = MONTHS.reduce(
    (s, _, i) =>
      s +
      (actualsMap[i]?.["direkte_omkostninger"] ?? 0) +
      (actualsMap[i]?.["loenninger"] ?? 0) +
      (actualsMap[i]?.["salgsomkostninger"] ?? 0) +
      (actualsMap[i]?.["lokaleomkostninger"] ?? 0) +
      (actualsMap[i]?.["administrationsomkostninger"] ?? 0),
    0,
  );
  const totalActualEbitda = totalActualRevenue - totalActualCosts;

  const chartData = MONTHS.map((month, i) => ({
    month,
    budget: Math.round(budgetEbitda[i]),
    actual: actualEbitda[i] !== null ? Math.round(actualEbitda[i]!) : null,
  }));

  const summaryCards = [
    {
      label: "Omsætning",
      budget: totalBudgetRevenue,
      actual: hasAnyActuals ? totalActualRevenue : null,
      isRevenue: true,
    },
    {
      label: "Omkostninger",
      budget: totalBudgetCosts,
      actual: hasAnyActuals ? totalActualCosts : null,
      isRevenue: false,
    },
    {
      label: "EBITDA",
      budget: totalBudgetEbitda,
      actual: hasAnyActuals ? totalActualEbitda : null,
      isRevenue: true,
    },
  ];

  return (
    <div className="space-y-5">
      {!hasAnyActuals && (
        <p className="text-sm text-hb-ink-soft">Ingen rapporter for {year} endnu.</p>
      )}

      {/* Tre kort: budget + realiseret + tone-farvet afvigelse */}
      <div className="grid gap-4 sm:grid-cols-3">
        {summaryCards.map((card) => {
          const tone = deriveBudgetTone({ budget: card.budget, actual: card.actual, isRevenue: card.isRevenue });
          return (
            <HbCard key={card.label} className="p-5">
              <TalStat
                label={card.label}
                value={formatDKK(card.budget)}
                sub={
                  card.actual != null ? (
                    <>
                      Realiseret {formatDKK(card.actual)}
                      {tone.pct != null && (
                        <span className={cn("ml-2", toneClass(tone.tone))}>{pctLabel(tone.pct)}</span>
                      )}
                    </>
                  ) : (
                    "Realiseret —"
                  )
                }
              />
            </HbCard>
          );
        })}
      </div>

      {/* EBITDA-graf budget vs. realiseret */}
      {hasAnyActuals && !isBudgetEmpty && (
        <HbCard className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
              EBITDA pr. måned
            </p>
            <p className="text-xs text-hb-ink-soft">Lys søjle budget · mørk søjle realiseret</p>
          </div>
          <div className="mt-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barGap={2} barCategoryGap="30%">
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
                  formatter={(value: number | null, name: string) =>
                    value !== null
                      ? [formatDKK(value), name === "budget" ? "Budget" : "Realiseret"]
                      : ["—", name === "budget" ? "Budget" : "Realiseret"]
                  }
                  {...hbBudgetTooltipStyle}
                />
                <ReferenceLine y={0} stroke="hsl(var(--hb-line))" />
                <Bar dataKey="budget" fill="hsl(var(--hb-evergreen))" opacity={0.3} radius={[3, 3, 0, 0]} />
                <Bar dataKey="actual" fill="hsl(var(--hb-evergreen))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </HbCard>
      )}

      {/* Tomme tilstande som invitationer */}
      {isBudgetEmpty ? (
        <HbCard className="p-5">
          <p className="text-sm text-hb-ink-soft">
            {hasAnyActuals
              ? "Budgettet er ikke udfyldt endnu — udfyld det under Scenarier, så sammenligner vi med dine rapporter her."
              : "Udfyld dit budget og upload månedlige rapporter — så mødes de her."}
          </p>
        </HbCard>
      ) : (
        <HbCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hb-line">
                  <th className="sticky left-0 z-10 min-w-[190px] bg-hb-surface px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                    Kategori
                  </th>
                  {hasAnyActuals && (
                    <th className="min-w-[90px] border-r border-hb-line px-2 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                      ÅTD
                    </th>
                  )}
                  {MONTHS.map((m) => (
                    <th
                      key={m}
                      className="min-w-[76px] px-2 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft"
                    >
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupedRows.map((group) => (
                  <>
                    <tr key={`bva-group-${group.group}`} className="bg-hb-sage/25">
                      <td
                        colSpan={hasAnyActuals ? 14 : 13}
                        className="sticky left-0 z-10 bg-hb-sage/25 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft"
                      >
                        {group.label}
                      </td>
                    </tr>
                    {group.rows.map((row) => {
                      const isRevenue = REVENUE_GROUPS.has(row.group);
                      const reportField = getBudgetRowReportField(row.key);
                      const ytdBudget = row.values.slice(0, lastActualIdx + 1).reduce((s, v) => s + v, 0);
                      const ytdActual = reportField
                        ? MONTHS.slice(0, lastActualIdx + 1).reduce(
                            (s, _, i) => s + (actualsMap[i]?.[reportField] ?? 0),
                            0,
                          )
                        : null;
                      const ytdTone = deriveBudgetTone({
                        budget: ytdBudget,
                        actual: hasAnyActuals ? ytdActual : null,
                        isRevenue,
                      });
                      return (
                        <tr key={row.key} className="border-b border-hb-line/60">
                          <td className="sticky left-0 z-10 bg-hb-surface px-4 py-2 text-xs font-medium text-hb-ink">
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              {row.label}
                              {!reportField && (
                                <span className="text-[10px] font-normal text-hb-ink-soft">
                                  ikke koblet til rapportfelt
                                </span>
                              )}
                              {sharedFieldRows.has(row.key) && (
                                <span className="text-[10px] font-normal text-hb-ink-soft">(delt felt)</span>
                              )}
                            </span>
                          </td>
                          {hasAnyActuals && (
                            <td className="border-r border-hb-line px-2 py-1.5 text-right">
                              <span className="block text-[11px] tabular-nums text-hb-ink-soft">
                                {fmtNumber(ytdBudget)}
                              </span>
                              {reportField ? (
                                <span className="block text-[11px] font-medium tabular-nums text-hb-ink">
                                  {ytdActual != null ? fmtNumber(ytdActual) : "—"}
                                  {ytdTone.pct != null && (
                                    <span className={cn("ml-1", toneClass(ytdTone.tone))}>
                                      {pctLabel(ytdTone.pct)}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="block text-[11px] text-hb-ink-soft/60">—</span>
                              )}
                            </td>
                          )}
                          {row.values.map((budgetVal, i) => {
                            const actualVal =
                              reportField && actualsMap[i] ? actualsMap[i][reportField] ?? null : null;
                            const tone = deriveBudgetTone({ budget: budgetVal, actual: actualVal, isRevenue });
                            return (
                              <td key={i} className="px-2 py-1.5 text-right">
                                <span className="block text-[11px] tabular-nums text-hb-ink-soft">
                                  {budgetVal === 0 ? "—" : fmtNumber(budgetVal)}
                                </span>
                                {reportField && (
                                  <span className="block text-[11px] font-medium tabular-nums text-hb-ink">
                                    {actualVal != null ? fmtNumber(actualVal) : ""}
                                    {actualVal != null && budgetVal !== 0 && tone.pct != null && (
                                      <span className={cn("ml-1 font-normal", toneClass(tone.tone))}>
                                        {pctLabel(tone.pct)}
                                      </span>
                                    )}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </>
                ))}
                <tr className="border-t border-hb-line bg-hb-sand/40">
                  <td className="sticky left-0 z-10 bg-hb-sand/40 px-4 py-2 text-xs font-medium text-hb-ink">
                    EBITDA
                  </td>
                  {hasAnyActuals && (
                    <td className="border-r border-hb-line px-2 py-1.5 text-right">
                      <span className="block text-[11px] tabular-nums text-hb-ink-soft">
                        {fmtNumber(budgetEbitda.slice(0, lastActualIdx + 1).reduce((s, v) => s + v, 0))}
                      </span>
                      <span className="block text-[11px] font-medium tabular-nums text-hb-ink">
                        {fmtNumber(
                          actualEbitda
                            .slice(0, lastActualIdx + 1)
                            .reduce((s: number, v) => s + (v ?? 0), 0),
                        )}
                      </span>
                    </td>
                  )}
                  {budgetEbitda.map((bVal, i) => {
                    const aVal = actualEbitda[i];
                    const tone = deriveBudgetTone({ budget: bVal, actual: aVal, isRevenue: true });
                    return (
                      <td key={i} className="px-2 py-1.5 text-right">
                        <span
                          className={cn(
                            "block text-[11px] tabular-nums",
                            bVal < 0 ? "text-hb-rust/80" : "text-hb-ink-soft",
                          )}
                        >
                          {fmtNumber(bVal)}
                        </span>
                        {aVal != null && (
                          <span
                            className={cn(
                              "block text-[11px] font-medium tabular-nums",
                              tone.tone === "attention" ? "text-hb-rust" : "text-hb-ink",
                            )}
                          >
                            {fmtNumber(aVal)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="border-t border-hb-line px-4 py-2 text-[11px] text-hb-ink-soft">
            Alle beløb i kr. · Øverst budget, nederst realiseret · rust = bag budget (mere end 10 % =
            markant afvigelse) · linjer uden rapportfelt sammenlignes ikke.
          </p>
        </HbCard>
      )}
    </div>
  );
};

# Recon: spor 3 — budgetlinjer ↔ CanonicalMetrics

Rå observationer med fil- og linjereferencer. Ingen konklusioner, ingen forslag.
Dato: 2026-08-24. Branch: fix/import-overskrift-og-udeladt (d3157a9f).
Grundlag: docs/import-model-design.md §3 + §6.5, ~/Downloads/kontoplan-recon.md (findes stadig, 471 linjer).

---

## 1. CanonicalMetrics

`supabase/functions/_shared/canonicalTypes.ts:27-60`. Filhoved (:1-4): *"Canonical Output
Schema — Phase 4 Template Registry. Single source of truth for all financial report
normalization."* Interfacet har INGEN kommentarer pr. felt — kun blok-overskriften
`// ── Canonical Metrics (English names, all nullable) ──` (:26). Danske navne findes ikke
i denne fil; de ligger i oversættelseskortene (§8).

Ordret, alle 32 felter (linje 28-59), alle `number | null`:

```ts
export interface CanonicalMetrics {
  revenue: number | null;
  cogs: number | null;
  gross_profit: number | null;
  gross_margin_pct: number | null;
  payroll: number | null;
  payroll_related: number | null;
  other_staff_costs: number | null;
  sales_costs: number | null;
  facility_costs: number | null;
  admin_costs: number | null;
  vehicle_costs: number | null;
  ebitda: number | null;
  depreciation: number | null;
  ebit: number | null;
  financial_costs: number | null;
  extraordinary_items: number | null;
  ebt: number | null;
  net_result: number | null;
  assets_total: number | null;
  inventory: number | null;
  receivables_total: number | null;
  trade_receivables: number | null;
  unbilled_wip: number | null;
  cash: number | null;
  equity_total: number | null;
  equity_ratio_pct: number | null;
  related_party_net: number | null;
  provisions_total: number | null;
  current_liabilities: number | null;
  debt_total: number | null;
  vat_payable: number | null;
  liabilities_total: number | null;
}
```

Inddeling. Grundlag: `SEMANTIC_TO_CANONICAL` i `_shared/canonicalEngine.ts:811-850` har
selv blok-kommentarerne `// P&L fields` (:812) og `// Balance-sheet fields` (:836); de to
`_pct`-felter optræder i INGEN af de to blokke (ingen semantisk kilde mapper til dem).

| Klasse | Felter (antal) |
|---|---|
| Resultatopgørelse (17) | revenue, cogs, gross_profit, payroll, payroll_related, other_staff_costs, sales_costs, facility_costs, admin_costs, vehicle_costs, ebitda, depreciation, ebit, financial_costs, extraordinary_items, ebt, net_result |
| Balance (13) | assets_total, inventory, receivables_total, trade_receivables, unbilled_wip, cash, equity_total, related_party_net, provisions_total, current_liabilities, debt_total, vat_payable, liabilities_total |
| Nøgletal/procenter (2) | gross_margin_pct, equity_ratio_pct |

Linjeniveau-typerne i samme fil: `RawLineEntry` (:90-97, navn + period/ytd_amount +
raw_sign/account_no/class) og `NormalizedLineEntry` (:100-108, med `canonical_class` og
`canonical_name`). `CanonicalOutput` bærer begge lister (:134-135) plus `metrics` (:139).

---

## 2. Budget mod realiseret — den nuværende vej

Fladen er `src/components/hjemmebane/budget/HbBudgetBva.tsx` (Hjemmebane). De gamle
tab-komponenter den spejler (BudgetVsActualTab m.fl., citeret i kommentarer :24, :45, :71)
findes ikke længere — `src/components/budget/` indeholder i dag kun `types.ts`.

**Teksten** kommer fra HbBudgetBva.tsx:294-298:

```tsx
{!reportField && (
  <span className="text-[10px] font-normal text-hb-ink-soft">
    ikke koblet til rapportfelt
  </span>
)}
```

Fodnote i samme fil :398-401: *"linjer uden rapportfelt sammenlignes ikke."*

**Hvad afgør koblingen**: `reportField = getBudgetRowReportField(row.key)`
(HbBudgetBva.tsx:276). Opslaget er RENT key-baseret — `src/lib/budgetEngine.ts:286-292`:

```ts
export function getBudgetRowReportField(key: string): string | null {
  for (const [field, keys] of Object.entries(REPORT_FIELD_TO_BUDGET_KEYS)) {
    if (keys.includes(key)) return field;
  }
  return null;
}
```

Importerede budgetlinjer har nøgler på formen `import_{slug}_{raekkeIndex}`
(`src/lib/importSkrivning.ts:314`) — ingen af dem optræder i mappingen, så hver
importeret linje får `null` → "ikke koblet til rapportfelt". Etiketten indgår ikke i
opslaget.

**REPORT_FIELD_TO_BUDGET_KEYS i sin helhed** — `src/lib/budgetEngine.ts:268-281`
(inkl. dens egen kommentar :268-270):

```ts
/** Rapportfelt → budget-keys-mappingen (BudgetVsActualTab.tsx:16-29 ordret
    — flyttet hertil som én sandhed; gammel BvA-tab og Hb-fladen deler den).
    NB (recon §1.4): mappingen dækker IKKE alle skabelon-keys — ukoblede
    rækker vises ærligt (design-blok §e(iii)), mappingen kurateres ikke her. */
export const REPORT_FIELD_TO_BUDGET_KEYS: Record<string, string[]> = {
  omsaetning: ["omsaetning"],
  direkte_omkostninger: ["vareforbrug", "direkte_omk", "fragt_levering",
    "betalingsgebyrer", "produktions_omk", "lager_logistik"],
  loenninger: ["loenninger", "personale", "konsulenter_freelance",
    "rekruttering", "personale_udvikling"],
  salgsomkostninger: ["marketing", "digital_marketing", "seo_content",
    "email_marketing", "salg_kundepleje", "reklame"],
  lokaleomkostninger: ["lokaler", "leje_lokaler", "forsikring_abonnementer",
    "el_vand_varme"],
  administrationsomkostninger: ["admin", "admin_regnskab", "tech_software",
    "platform_tech", "it_udstyr", "forsikring", "revision_jura",
    "kontorhold", "andet"],
};
```

Design-dokumentet §3 (import-model-design.md:150) siger om denne mapping: *"kan slettes
frem for udbygges"*.

**Hvad der reelt kan sammenlignes i dag** — actualsMap bygges kun for seks danske felter
(HbBudgetBva.tsx:56-62): `omsaetning`, `direkte_omkostninger`, `loenninger`,
`salgsomkostninger`, `lokaleomkostninger`, `administrationsomkostninger` (alle gennem
`Math.abs`). Dvs.:

- Rapportsiden i sammenligningen: 6 af de 32 canonical-felter (revenue, cogs, payroll,
  sales_costs, facility_costs, admin_costs — via oversættelsen i §4).
- Budgetsiden: kun rækker hvis `key` står i listerne ovenfor (31 keys i alt: 1+6+5+6+4+9).
- EBITDA-rækken sammenlignes UDEN kobling: budget via `computeEbitda`
  (budgetEngine.ts:120-128), realiseret som rev − Σ af de 5 omkostningsfelter
  (HbBudgetBva.tsx:96-106). NB: uden `afskrivninger` — jf. §7 hvor KPI-fladen
  regner totalomkostninger MED afskrivninger.
- "Delt felt"-dommen (HbBudgetBva.tsx:71-86): flere budget-rækker på samme rapportfelt
  markeres "(delt felt)" — de sammenlignes hver især mod HELE feltets realiserede tal.

---

## 3. De seks visningsgrupper

Definition: `budgetTemplates.ts:11` (union-typen), `GROUP_LABELS` :227-234,
`GROUP_ORDER` :236. Hver skabelon-kategori bærer `group` (fx :32-43).
`REVENUE_GROUPS = new Set(["indtaegter"])` — `src/components/budget/types.ts:62`.

Alle fundne steder der filtrerer/summerer på `group`:

| Sted | Hvad |
|---|---|
| budgetEngine.ts:121-127 `computeEbitda` | rev-rækker (group === "indtaegter") minus Σ\|cost\| — **beregning** |
| budgetEngine.ts:143-147 `deriveBudgetFill` | empty-dommen på indtægtsgruppens sum — **beregning** |
| budgetEngine.ts:213-218 `autoFillFromValues` | fordeler beløb forskelligt for indtægter/løn/øvrige — **beregning** |
| budgetEngine.ts:376-385 (decode) | __group__-markør valideres mod de seks; ugyldig → "variable", stille |
| budgetEngine.ts:587-593 (save) | skriver `__group__{år}_{key}` med `period: r.group` for ikke-skabelon-keys |
| budgetEngine.ts:637 `generateAIScenario` | group sendes med i AI-payload |
| BudgetteringView.tsx:123-150 | totaler (rev/cost), chart-omsætning, `costByGroup`-fordeling — beregning + visning |
| HbBudgetBva.tsx:88-92, 108-112, 275 | gruppering af tabellen; totalkort; `isRevenue = REVENUE_GROUPS.has(row.group)` styrer tone-dommen — **beregning** |
| HbBudgetCashflow.tsx:88-94 | budgetteret nettolikviditet: rev-grupper minus Σ\|cost\| — **beregning** |
| HbBudgetEditTable.tsx:72-73, 86, 272, 440, 570-612, 678 | totaler, scenarie-resumé, gruppeoverskrifter, "Tilføj linje" pr. gruppe (ny række arver gruppens nøgle) |
| HbBudgetSimulator.tsx:80-85, 361 | budget-rev/cost-serier; marketing-preset henter gennemsnit fra salg_marketing-rækker — **beregning** |
| HbBudgetImport.tsx:634, 678, 723-726 | årsmål rammer kun indtaegter-kategorier; vækstfaktor (fuld/halv) vælges efter group; total-rev/cost i preview — **beregning** |
| HbBudgetTemplateGuide.tsx:158 | viser hvilke grupper en skabelon dækker — visning |
| importGitterModel.ts:109-117 `normaliseretVaerdi` | **fortegnsreglen**: absolutværdi for alle grupper undtagen indtaegter — beregning, deles af gitter-visning OG skriveplan |
| importSkrivning.ts:250-311 | skriveplanen opløser gruppe pr. række og skriver den i `__group__`-markøren |

Observation: group er IKKE kun visning. Den afgør (a) fortegnsnormalisering ved import,
(b) EBITDA/likviditet/udfyldningsdom, (c) tone-dommen isRevenue i BvA, (d) vækst- og
årsmålslogik i regnskabs-importen. Ingen af stederne kobler group til canonical-felter.

---

## 4. Hvor kommer de realiserede tal fra

Kæden, led for led:

1. **Parsing** → `financial_reports.normalized_data -> 'metrics'` (canonical engelske
   nøgler; CanonicalOutput, canonicalTypes.ts:139). Kolonner på financial_reports:
   `src/integrations/supabase/types.ts` (financial_reports-blokken; normalized_data,
   manual_normalized_data, extracted_data, raw_extracted_data m.fl.).
2. **Commit-kandidat** — `resolve_report_commit_candidate`
   (nyeste version: supabase/migrations/20260722130000_add_ebitda_ebit_to_manual_commit_mapping.sql).
   Tre grene (manual :88-108, v2 :130-146, v1 :152-168). V1/V2 whitelist-filtrerer
   metrics til præcis 18 nøgler (:138-141 og :165-168):
   `revenue, gross_profit, payroll, cogs, sales_costs, facility_costs, admin_costs,
   depreciation, ebt, ebitda, ebit, net_result, assets_total, equity_total, cash,
   trade_receivables, current_liabilities, trade_payables, unbilled_wip`.
   NB: `trade_payables` findes IKKE i CanonicalMetrics (canonicalTypes.ts:27-60).
   Manual-grenen mapper ~20 danske input-nøgler → 17 canonical via SQL-CASE (:89-108).
3. **Facts-tabellen** — `financial_report_facts`
   (migrations/20260316210844_…sql:8-19): `metrics jsonb NOT NULL`,
   `UNIQUE(company_id, period_key)`, `source_type IN ('canonical','manual')`.
   Tabel-kommentar (:22-25): *"Only canonical English metric keys are stored in
   metrics jsonb."* Én jsonb pr. virksomhed pr. periode — feltet der holder tallene er
   `metrics`.
4. **Klient-læsning** — `useCompanyFacts` (src/hooks/useCompanyFacts.ts:44-52): selecter
   `metrics` m.fl., `parseMetrics` (:26-33) beholder kun numeriske værdier.
5. **Oversættelse** — `factsToDanishMetrics` (src/lib/factsAdapter.ts:44-59) via
   `CANONICAL_TO_DANISH` (:22-40, 17 par). Filhoved (:1-13): *"TEMPORARY COMPATIBILITY
   BRIDGE … DO NOT treat Danish-key remapping as the long-term target model."*
6. **Fladen** — HbBudgetBva.tsx:46-65 bygger `actualsMap[månedsindex][danskFelt]` for de
   6 felter (Math.abs på alle).

**Navngivning af rækkerne i sammenligningen**: de realiserede tal har INGEN egne
rækkenavne — de lander i den budgetrækkes celle hvis `key` slår op til feltet
(HbBudgetBva.tsx:323-344, nederste lag i to-lags-cellen). Rækkens navn er budgetrækkens
`label` (:293). Gruppeoverskrifterne er GROUP_LABELS (:88-92). Rapportlinjernes egne
navne (raw_lines/normalized_lines) optræder ingen steder i denne flade;
import-model-design.md §6.5 (:218-219): *"Rapportsiden gemmer allerede linjeniveau i
`normalized_data.raw_lines`, som ingen læser (§7.2)."*

---

## 5. generate-budget-from-accounts

`supabase/functions/generate-budget-from-accounts/index.ts` (199 linjer).
`grep -n canonical` i filen: 0 hits — funktionen refererer ingen steder CanonicalMetrics
eller canonicalTypes.

**Kategorisættet** — systemprompt :51-63 (ordret uddrag):

```
2. Gruppér posterne i budget-kategorier. Brug disse nøgler:
   - "omsaetning" … - "vareforbrug" … - "loenninger" … - "marketing" …
   - "lokaler" … - "tech_software" … - "admin" … - "afskrivninger" …
   - "finansielle" … - "betalingsgebyrer" … - "fragt_levering" …
   - For alt andet, brug et beskrivende key (snake_case, kun a-z og underscore)
```

Tool-skemaet :116-125: `key` er fri string ("snake_case, f.eks. 'omsaetning'");
`group` er enum over PRÆCIS de seks visningsgrupper:
`["indtaegter", "variable", "personale", "salg_marketing", "drift", "faste"]` (:124).

**Forhold til grupperne**: LLM'en vælger selv group pr. kategori (enum). Forhold til
CanonicalMetrics: intet — nøglerne er de 11 navngivne + frie snake_case; 7 af de 11
(omsaetning, vareforbrug, loenninger, marketing, lokaler, tech_software, admin,
betalingsgebyrer, fragt_levering) overlapper tilfældigt med keys i
REPORT_FIELD_TO_BUDGET_KEYS; `afskrivninger` og `finansielle` gør ikke.

**Persistens-observation**: `confirmBudgetFromAccounts` (budgetEngine.ts:800-850) skriver
KUN værdirækker (`category: cat.key`, :836-844) — ingen `__group__`- og ingen
`__label__`-markører. HbBudgetImport.tsx:703 sender kun `{ key, monthly }` til confirm.
LLM'ens group bruges altså kun i preview-UI'et (HbBudgetImport.tsx:634, 678, 723-726);
ved genindlæsning best-matches en skabelon (budgetEngine.ts:334-347), og frie keys uden
markør falder til `group: "variable"` (budgetEngine.ts:376-385).
Design-dokumentet §3 (:152): *"De 29 enum-nøgler og `generate-budget-from-accounts`'
frie snake_case-nøgler dør begge."*

---

## 6. Kan et budget-tal og et rapport-tal mødes — granularitet

**Rapportsidens granularitet i facts**: ét `metrics`-jsonb pr. (company, period_key)
(UNIQUE-constraint, migration 20260316210844:18) med maks. de 18 whitelist-nøgler fra §4
— dvs. felt-niveau, IKKE linjeniveau. Der er ingen linjerækker i facts.

**Linjeniveau findes** kun opstrøms på `financial_reports.normalized_data`:
`raw_lines: RawLineEntry[]` og `normalized_lines: NormalizedLineEntry[]`
(canonicalTypes.ts:134-135; typerne :90-108 med `canonical_class`/`canonical_name` pr.
linje). Jf. §6.5-citatet ovenfor: ingen læser dem i dag.

**Skema for financial_report_facts** (migrations/20260316210844:8-19):

```sql
CREATE TABLE public.financial_report_facts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id),
  period_key       text NOT NULL,
  period_label     text NOT NULL,
  source_report_id uuid NOT NULL REFERENCES public.financial_reports(id),
  source_type      text NOT NULL CHECK (source_type IN ('canonical','manual')),
  metrics          jsonb NOT NULL,
  committed_at     timestamptz NOT NULL DEFAULT now(),
  committed_by     uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, period_key)
);
```

**Udtræk forsøgt**: Supabase MCP når kun projektet `boardroom-2-prod`
(tmhjionsbtgrwuzwjbgb) — `SELECT … FROM public.financial_report_facts` dér fejler med
`42P01 relation does not exist` (kørt 2026-08-24). Lovable-prod
(loiavmastgeieqyiwyyr) kan kun nås manuelt i Lovable SQL editor (CLAUDE.md), så intet
live-udtræk herfra. I stedet — formen som koden selv fastlægger:

- metrics-indholdet er whitelist-delmængden af CanonicalMetrics (18 nøgler, §4 pkt. 2).
- In-repo eksempel på formen (testfixture, src/lib/__tests__/retDataRoundTrip.test.ts:29-41):
  `{ admin_costs: 16984.83 }`, `{ revenue: 2500000.75, payroll: 84250.5, … }`.
- Prod-målinger af indholdet er tidligere bogført i import-model-design.md §1 (:39-51)
  og kontoplan-recon.md (afsnittet om normalized_data).

**Budgetsidens granularitet**: `budget_targets`-rækker pr. kategori-key pr. måned
(`period: "{år}-base-{månedsindex}"`, importSkrivning.ts:397-411 / budgetEngine.ts:836-844)
plus `__label__`/`__group__`-markørrækker. Dvs. linje-niveau med medlemmets egne nøgler.

Mødet i dag: budgetlinje (fri key) → REPORT_FIELD_TO_BUDGET_KEYS → ét af 6 danske felter
→ factsToDanishMetrics ← 18 canonical-nøgler ← facts.metrics. Felt-niveau mod felt-niveau,
kun for de 6 felter og kun for skabelon-keys.

---

## 7. Hvad bruger KPI-siden

Fladen er `src/components/hjemmebane/noegletal/NoegletalView.tsx`; definitionerne er
`src/lib/kpiDefs.ts` (delt med CompanyChatPane.tsx og advisor-fladen, jf. filhoved :4-6).

**KPI-nøglerne** (kpiDefs.ts:44-51): `omsaetning`, `db_margin`, `loenninger`, `resultat`,
`omkostninger`, `ebitda_margin` — et FJERDE vokabularium (hverken kategori-keys, grupper,
canonical eller rapportfelter; tre af navnene sammenfalder tilfældigt med danske
KF-nøgler). Targets/benchmarks nøgles på samme (useKpiTargets.ts, useKpiBenchmarks.ts).

**Datakilden er den samme som BvA'ens realiserede side**: `useCompanyFacts` →
`factsToDanishMetrics` (kpiDefs.ts:88; NoegletalView.tsx:127, 161) → danske KF-nøgler →
`VALUE_EXTRACTORS` (kpiDefs.ts:53-60):

```ts
omsaetning:  (kf) => kf.omsaetning ?? null,
db_margin:   (kf) => calcDbMargin(kf) ?? null,          // daekningsbidrag/omsaetning
loenninger:  (kf) => kf.loenninger != null ? Math.abs(kf.loenninger) : null,
resultat:    (kf) => kf.resultat_foer_skat ?? null,
omkostninger:(kf) => { const v = calcTotalExpenses(kf); return v > 0 ? v : null; },
ebitda_margin:(kf) => calcResultMargin(kf) ?? null,     // resultat_foer_skat/omsaetning
```

`calcTotalExpenses` (financialUtils.ts:186-194) summerer SEKS bidrag inkl.
`afskrivninger` — hvor BvA'ens realiserede omkostninger/EBITDA (HbBudgetBva.tsx:99-104,
115-124) summerer FEM uden afskrivninger. Trend-grafen bruger derudover
`daekningsbidrag` og `bank_balance` (NoegletalView.tsx:169-173).

**Vokabularie-deling**: KPI deler danske KF-nøgler med BvA'ens rapportside (samme
factsAdapter-bro) — ikke med budgettets kategori-keys eller grupper. Budgetdata indgår
slet ikke i KPI-fladen.

---

## 8. Eksisterende oversættelser mellem vokabularier

Vokabularier: (A) kategori-key, (B) gruppe, (C) canonical-felt, (D) dansk rapportfelt/KF,
(E) KPI-nøgle, (F) sektionsnavn (import), (G) linjeklasse/semantisk felt (parser-side).

| # | Oversættelse | Sted |
|---|---|---|
| 1 | D→C: `KF_TO_CANONICAL` (31 par) | supabase/functions/_shared/canonicalEngine.ts:41-73 |
| 2 | G→C: `CLASS_TO_CANONICAL` (8 par) | _shared/canonicalEngine.ts:76-85 (brugt :503) |
| 3 | G→C: `SEMANTIC_TO_CANONICAL` (36 par; 23 P&L + 13 balance) | _shared/canonicalEngine.ts:811-850 (brugt :1038) |
| 4 | C→D: `CANONICAL_TO_DANISH` (17 par) — facts→UI-broen | src/lib/factsAdapter.ts:22-40 |
| 5 | C→D + D→C: `CANONICAL_TO_DANISH` (16 par) + `DANISH_TO_CANONICAL` — SEPARAT kopi til "Ret data" | src/lib/reportOverrideHelpers.ts:87-108 |
| 6 | D→C i SQL: manual-CASE (~20 par) + V1/V2-whitelist (18 nøgler) | migrations/20260722130000:88-108, :138-141, :165-168 (tidl. versioner 20260320192456 m.fl.) |
| 7 | D↔A: `REPORT_FIELD_TO_BUDGET_KEYS` + `getBudgetRowReportField` | src/lib/budgetEngine.ts:271-281, :286-292 |
| 8 | A→B: `decodeImportedRows`-switch (7 keys → gruppe) | src/lib/budgetEngine.ts:249-264 |
| 9 | A→B: skabelonernes `category.group` pr. key | src/lib/budgetTemplates.ts:11, :32-43 osv. (8 skabeloner) |
| 10 | B-fallback ved decode: __group__-validering, ugyldig → "variable" | src/lib/budgetEngine.ts:376-385 |
| 11 | F→B: `gruppeForslag` (sektionsnavn-regex → gruppe) | src/lib/importGitterModel.ts:73-81 |
| 12 | B-encode: `__group__{år}_{key}` med gruppen i `period` | src/lib/importSkrivning.ts:426-432; src/lib/budgetEngine.ts:587-593 |
| 13 | (fri tekst)→A+B: LLM-prompt + group-enum | supabase/functions/generate-budget-from-accounts/index.ts:51-63, :116-125 |
| 14 | D→E: `VALUE_EXTRACTORS` + calc-hjælperne | src/lib/kpiDefs.ts:53-60; src/lib/financialUtils.ts:186-210 |
| 15 | D→(interne aggregater): actualsMap-byggerne | HbBudgetBva.tsx:54-62; HbBudgetCashflow.tsx:74-83; HbBudgetSimulator.tsx:66-75 |
| 16 | kontonr.→(parser-klasser)→C: range-tabeller pr. skabelon | dkDineroResultatopgoerelseCsvV1.ts:47-58; dkEconomicSaldobalanceXlsxV1.ts:59-80 (detaljeret i kontoplan-recon.md §1-§2) |

Afvigelser mellem kopierne, som observeret:
- factsAdapter (17 par) har `ebitda: "ebitda"` og `gaeld_i_alt`; reportOverrideHelpers
  (16 par) har `gaeld_i_alt`/`debt_total` men INGEN ebitda/ebit.
- SQL-whitelisten (18) indeholder `trade_payables` og `unbilled_wip`, som factsAdapter
  ikke oversætter (de når facts men ingen dansk nøgle → usynlige for alle klient-flader).
- `ebit` når facts (whitelist) men har ingen dansk nøgle i factsAdapter → usynlig.
- KF_TO_CANONICAL (parser-ind) og CANONICAL_TO_DANISH (facts-ud) er ikke inverse:
  parser-ind har 31 danske nøgler mange-til-én; ud-broen vælger én dansk nøgle pr.
  canonical (fx cash → "bank_balance", ikke "likvider").
- kontoplan-recon.md §2e/§2f angav 32/38 par for KF/SEMANTIC; optalt i dag: 31/36
  (kortene er ændret siden det recon).

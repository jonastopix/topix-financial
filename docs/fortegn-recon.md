# Fortegn-recon: de seks omkostningsnøgler i kode-lagene
> Skrevet 2026-08-27. Øjebliksmåling — linjenumre og tal gælder den dag, ikke i dag.

Ren recon, 2026-08-27. Kodebasen læst på main (10a4fff1). Nøglerne: `payroll`,
`depreciation`, `admin_costs`, `cogs`, `sales_costs`, `facility_costs`.
Fund rapporteres som fund. Afvigelser fra den målte prod-tilstand er markeret
med **⚠ MODSIGELSE/NUANCE**.

---

## 1. extract-annual-report: hvor sættes de seks nøgler, og pålægges fortegn?

Fil: `supabase/functions/extract-annual-report/index.ts`.

Værdierne sættes ét sted, via hjælperen `monthly` (årstal/12):

```
207:  const monthly = (val: number | null | undefined) => val != null ? Math.round(val / 12) : null;

209:  const baseMetrics: Record<string, number | null> = {
210:    revenue: monthly(extracted.nettoomsaetning),
211:    gross_profit: monthly(extracted.bruttoresultat),
212:    payroll: monthly(extracted.personaleomkostninger),
213:    ebt: monthly(extracted.resultat_foer_skat),
214:    depreciation: monthly(extracted.afskrivninger),
215:    cogs: monthly(extracted.direkte_omkostninger),
216:    admin_costs: monthly(extracted.andre_eksterne_omkostninger),
217:  };
```

**Der pålægges intet fortegn.** `monthly()` er kun `Math.round(val / 12)` —
dokumentets tal skrives igennem med PDF'ens fortegn. Funktionens eneste
`Math.abs` er i revenue-afledningsfallbacket (linje 195), som ikke rører de
seks nøgler.

AI-prompten beder aktivt om dokumentets fortegn:

```
108: - Negative tal (underskud, tab) angives som negative tal
137:   personaleomkostninger: { type: "number", description: "Negativt tal" },
```

Tool-skemaet for `personaleomkostninger` (→ `payroll`) siger altså eksplicit
"Negativt tal". Det negative fortegn i annual_report-rækkerne er dermed ikke et
uheld i mapping-laget — det er bestilt i prompten og skrevet uændret igennem.

**⚠ NUANCE ift. målingen:** extract-annual-report sætter kun FIRE af de seks
nøgler: `payroll`, `depreciation`, `cogs`, `admin_costs`. `sales_costs` og
`facility_costs` skrives ALDRIG af årsrapport-vejen (de findes ikke i
tool-skemaet, linje 130–148). De 180 negative annual_report-værdier kan altså
kun fordele sig på de fire første nøgler. Bemærk også den semantiske mapping:
`admin_costs` ← `andre_eksterne_omkostninger` (linje 216) — et bredere begreb
end administrationsomkostninger.

`sales_costs`/`facility_costs` optræder i annual_report-vejen præcis nul
steder; kun `save-annual-baseline` (source_type `manual_baseline`) og
`auto-create-baseline-budget` skriver lignende /12-rækker, og de skriver heller
ikke de to nøgler.

---

## 2. ALLE læsere af de seks nøgler (hovedspørgsmålet)

Nøglerne læses i to lag: (a) direkte på de engelske facts-nøgler, (b) på de
danske nøgler efter oversættelse i factsAdapter/financialUtils
(`loenninger`, `direkte_omkostninger`, `salgsomkostninger`,
`lokaleomkostninger`, `administrationsomkostninger`, `afskrivninger`).
Begge lag er medtaget — fortegnshåndteringen ligger spredt over begge.

### 2a. Oversættelseslag (ren gennemskrivning — ingen fortegnshåndtering)

| Sted | Linjer | Fortegn |
|---|---|---|
| `src/lib/factsAdapter.ts` | 31–36 (map), 57–63 og 76–81 (gennemskrivning) | **Ingenting** — værdien kopieres uændret |
| `src/lib/financialUtils.ts` `getCanonicalOrLegacyMetrics` | 86–91 (`m.payroll` → `loenninger` osv.) | **Ingenting** |
| `src/lib/financialUtils.ts` `getEffectiveMetrics` (manual-stien) | 146–151 | **Ingenting** |
| `supabase/functions/validate-facts-parity/index.ts` | 81–86 og 101–106 (maps), 147–162 (gennemskrivning) | **Ingenting** |
| Migration `20260722130000_add_ebitda_ebit_to_manual_commit_mapping.sql` (manual-commit-RPC'en) | 92–97 | **Ingenting** — dansk→kanonisk 1:1; ingen abs/negation i SQL'en. Det er ad denne vej de 95 negative manual-værdier er landet i facts |

### 2b. Læsere med Math.abs

| Sted | Linjer | Håndtering |
|---|---|---|
| `src/lib/financialUtils.ts` `calcTotalExpenses` | 187–192 | `Math.abs` på alle seks danske nøgler. Kommentar kalder det "the single shared definition". Bruges af kpiDefs (`omkostninger`), NoegletalView-hero m.fl. |
| `src/lib/kpiDefs.ts` `VALUE_EXTRACTORS` | 61 (`loenninger`), 63 (`omkostninger` via calcTotalExpenses) | `Math.abs` |
| `supabase/functions/_shared/weeklyFocusKpi.ts` `KPI_EXTRACTORS` | 43–46 (`payroll`), 72–85 (sum af alle seks) | `Math.abs` pr. led; kommentar linje 68–71: "Fortegn varierer mellem kilder, derfor Math.abs pr. led" |
| `src/components/PerformanceScore.tsx` | 73 | `Math.abs(latest.loenninger …)` i likviditetsscore |
| `src/components/CombinedBudgetWidget.tsx` | 68–70 | `Math.abs` på alle seks |
| `src/components/hjemmebane/budget/HbBudgetBva.tsx` | 66–71 | `Math.abs` på fem (afskrivninger indgår ikke i BvA-actuals) |
| `src/components/hjemmebane/budget/HbBudgetSimulator.tsx` | 69–74 | `Math.abs` på alle seks |
| `src/components/hjemmebane/budget/HbBudgetCashflow.tsx` | 78–82 | `Math.abs` på fem (uden afskrivninger — cash-logik) |

### 2c. Læsere UDEN fortegnshåndtering (rå læsning)

| Sted | Linjer | Konsekvens ved negativ værdi |
|---|---|---|
| `src/components/PerformanceOverview.tsx` | 52–53 | "Løn % af oms." = `kf.loenninger / kf.omsaetning` — **ingenting**. Negativ payroll giver negativ procent i UI i dag |
| `src/components/hjemmebane/noegletal/NoegletalView.tsx` | 234 | `loenninger: kf.loenninger ?? null` rå ind i trend-grafserien — **ingenting**. (Hero-kortene samme fil linje 203 går derimod via VALUE_EXTRACTORS og er abs'et) |
| `src/pages/MemberDetail.tsx` | 625 | KPI-kort "Lønninger" viser rå værdi; trend-pilene (611–620) regner pct på de fortegnsbærende tal — **ingenting** |
| `supabase/functions/run-company-agent/index.ts` | 854 | `payroll_pct = (m.payroll / m.revenue) * 100` — **ingenting**. Prompten (linje 86) fortæller samtidig AI'en at "cogs, payroll, admin_costs: positive tal = omkostninger" |
| `supabase/functions/ai-financial-feedback/index.ts` | 13–18 (nøgleliste), 22–33 (prompt) | Værdier sendes rå til AI; prompten hævder "Tallene er allerede normaliserede … du skal IKKE gætte på fortegn" og "positiv = omkostning" — **ingenting** i koden; kontrakten bæres alene af prompten |
| `supabase/functions/auto-create-baseline-budget/index.ts` | 90, 135 (payroll gennemskrives rå); 178–189 | **Betinget fortegnsfølsom**: `> 0`-gates — en negativ cogs/payroll/sales_costs/facility_costs/admin_costs/depreciation droppes stille fra budgetkategorierne |
| `supabase/functions/save-annual-baseline/index.ts` | 91, 102 | `metrics.payroll = pay / 12` — **ingenting**; brugerens indtastning skrives igennem (UI-placeholder i `src/pages/AnnualBaseline.tsx:32` foreslår positivt tal) |
| `src/lib/reportOverrideHelpers.ts` `computeDerivedMetrics` | 280–284, 287–289 | **Betinget**: EBITDA = db − (loenninger+salgs+lokale+admin) med guard `opex > 0` — negativ konvention deaktiverer stille afledningen (dokumenteret i kommentaren linje 266–269); EBIT = ebitda − afskrivninger er fortegnsfølsom subtraktion |
| `src/hooks/useCompanyFacts.ts` (PARITY_DEBUG) | 106–117 | Værdi-identitetssammenligning facts vs. rapport — fortegnsbevarende; flip på én side ville tælle som mismatch |
| `supabase/functions/validate-facts-parity/index.ts` | 193–206 | Samme: `Math.abs(factVal - uiVal) > 0.01` er kun tolerance — sammenligningen i sig selv er fortegnsfølsom identitet |
| `supabase/functions/_shared/extractionCompare.ts` | 118–121, 218–219 | Old/new-udtræk sammenlignes; diff er abs'et, men match kræver samme fortegn |
| `src/components/ReportReviewDialog.tsx` | 68–76 (labels), preview-visning | Viser `metrics_preview` rå — **ingenting** |
| `src/pages/ReportDebug.tsx` | 294–300 | Debug-tabel, rå visning — **ingenting** |
| `src/demo/DemoKPIs.tsx` | 24 | `extract: (f) => f.payroll` rå — demo-data (`src/demo/demoData.ts:5–16`) er positive pr. konstruktion |
| `src/lib/periodeOpgoerelse.ts` | (generisk) | Læser ingen nøgler selv; summerer via kalderens `udtraek`-funktioner = VALUE_EXTRACTORS (kpiDefs), så loenninger/omkostninger arver abs derfra. Flow-summen af en rå nøgle ville arve råt fortegn |

### 2d. Skrivelag (normalisering ved kilden — medtaget for fuldstændighed)

| Sted | Linjer | Håndtering |
|---|---|---|
| `supabase/functions/_shared/canonicalEngine.ts` | 171 (`alwaysPositiveExpenseFields` = loenninger, marketing, lokaler, admin, tech_software, afskrivninger), 225–229 (`Math.abs` + korrektion) | Tvinger positiv — det er dét der giver canonical/canonical_v2 de positive værdier |
| samme fil, **cogs-undtagelsen** | 205–222 | `direkte_omkostninger` er IKKE altid-positiv: negativ cogs BEHOLDES når deterministisk + `revenue − cogs = gross_profit` afstemmer (contra-cost) |
| `src/lib/financialParser.ts` / `supabase/functions/_shared/financialParser.ts` | src 287 / shared 280 | `COST_LABELS` → `Math.abs(raw_value)` ved parsing |
| `supabase/functions/_shared/normalizationProfiles.ts` | 71, 156, 177 (equity-familier), cost_like-familier | Profilstyret keep/negate/abs pr. kildefamilie |

Ikke-læsere frasorteret: budget-domænets nøgler af samme navne
(`budgetEngine.ts`, `HbBudgetEditTable.tsx` `quickValues.payroll`,
`budgetTemplates.ts`, `importGitterModel.ts`, `import-budget-excel`,
`generate-budget-from-accounts`, `notify-kpi-comment` label-map,
`MemberDetail.tsx:169–170` kategorimap) er budgetrækker/kategorinøgler, ikke
læsninger af facts-metrics-nøglerne.

---

## 3. factsAdapter: nøglerne og "equity"

`src/lib/factsAdapter.ts`:

```
31:  payroll: "loenninger",
32:  cogs: "direkte_omkostninger",
33:  sales_costs: "salgsomkostninger",
34:  facility_costs: "lokaleomkostninger",
35:  admin_costs: "administrationsomkostninger",
36:  depreciation: "afskrivninger",
...
42:  equity_total: "egenkapital",
```

De seks nøgler mappes 1:1, værdi uændret (gennemskrivningen, linje 57–63):

```
57:  for (const [canonicalKey, value] of Object.entries(metrics)) {
58:    if (value == null) continue;
59:    const danishKey = CANONICAL_TO_DANISH[canonicalKey];
60:    if (danishKey) {
61:      out[danishKey] = value;
62:    }
63:  }
```

**"equity" DROPPES.** Kun `equity_total` står i mappet (linje 42); en nøgle
uden opslag falder ud ved `if (danishKey)` (linje 60). Årsrapport-vejens
`metrics.equity` (skrevet i `extract-annual-report/index.ts:224`) når derfor
aldrig frem til `egenkapital` i UI'et. En repo-bred søgning finder ingen læser
af den bare nøgle `equity` — hverken i `src/` eller `supabase/functions/`.
Fund: årsrapportens egenkapital skrives til facts, men er i praksis forældreløs
i hele visningslaget (MemberDetail's egenkapital-kort, linje 628, læser
`kf.egenkapital`, som kun `equity_total` kan fylde).

---

## 4. Hvad ville give FORKERT resultat, hvis de seks nøgler blev gjort positive?

Skarpt afgrænset til "forkert", ikke blot "ændret":

1. **Contra-cost-cogs i canonical-motoren.**
   `canonicalEngine.ts:205–222` beholder bevidst negativ `cogs` når
   `revenue − cogs = gross_profit` kun afstemmer med det negative fortegn
   (gross_profit > revenue). Gøres cogs positiv dér, bryder
   GP-afstemningen, og `phase4_e2e_test.ts:1531` fejler
   (`"COGS should be negative in contra-cost case"`). Tilsvarende ville
   valideringen `revenue − cogs ≟ gross_profit`
   (`src/lib/financialParser.ts:419–423`, shared:403) fejle for et ægte
   contra-cost-dokument. Dette gælder NYE parses — en flip af eksisterende
   prod-rækker rammer kun dette hvis en contra-cost-række findes.

2. **Paritetsvalidatorerne.** Både `validate-facts-parity/index.ts:193–206`
   og `useCompanyFacts.ts:106–117` (PARITY_DEBUG) sammenligner
   facts-værdier 1:1 mod `financial_reports.normalized_data.metrics` hhv.
   `manual_normalized_data.metrics`. Flippes facts-siden uden at
   rapport-sidens kopier flippes samtidig, melder begge massemismatch
   (−85.000 ≠ 85.000). Ikke en brugerflade, men et valideringsværktøj der
   ville rapportere falsk alarm.

Ændret-men-ikke-nødvendigvis-forkert (nævnt så listen er komplet):

- `reportOverrideHelpers.computeDerivedMetrics` (280–289): i dag deaktiverer
  negative manual-tal stille EBITDA/EBIT-afledningen (`opex > 0`-guarden);
  positive tal ville AKTIVERE den. Adfærdsændring for den virksomhed med de
  95 negative manual-værdier — nye afledte nøgler ville opstå ved næste gem.
- `auto-create-baseline-budget` (178–189): `> 0`-gates ville begynde at
  medtage kategorier der i dag droppes stille.
- Trend-pile/M/M-procenter på rå serier (`MemberDetail.tsx:611–620`,
  `PerformanceOverview.tsx:52–53`, NoegletalView-grafens loenninger-serie):
  retning og fortegn i visningen skifter — dagens visning af negative tal er
  dog selv tvivlsom, så "forkert" afhænger af hvilken konvention man kalder
  facit.

**⚠ MODSIGELSE ift. målingen:** Målingen siger canonical/canonical_v2 gemmer
altid positivt. Koden GARANTERER det ikke: cogs har en bevidst, test-låst
undtagelse (contra-cost) hvor canonical gemmer negativt. Prod har åbenbart
ingen sådan række i dag, men "altid positivt" er en observation om data, ikke
en invariant i koden.

**⚠ INTERN MODSIGELSE i manual-vejen:** `OverrideFormFields.tsx:26–32` viser
placeholders med NEGATIVE eksempler ("Eks. -600000", "Eks. -320000" …) for
netop de seks felter — UI'et opfordrer altså til den negative konvention, som
`computeDerivedMetrics` (samme flow) eksplicit ikke kan regne på
(`opex > 0`-guarden, kommentar linje 266–269: "omkostninger tastet i negativ
konvention" → intet beregnes). De 95 negative manual-værdier hos én virksomhed
er konsistente med at brugeren fulgte placeholderne.

---

## 5. Test/fixtures der låser nuværende fortegn fast

Låser POSITIV konvention for canonical:

- `supabase/functions/extract-financial-data/phase4_e2e_test.ts:1525`
  (`Payroll should be positive`), 2355 (`COGS must be positive per canonical
  convention`), 2364 ff. ("All values should be positive"), 1117–1123
  (positive beløbs-asserts).
- `supabase/functions/extract-financial-data/engine_test.ts:214, 321–326`
  (cogs 800000, payroll 400000, sales_costs 100000, facility_costs 80000,
  depreciation 40000 — alle positive).
- `src/lib/__tests__/canonicalTechSoftwareMerge.test.ts:48, 80, 104` og
  `retDataRoundTrip.test.ts` / `retDataEbitdaLoss.test.ts:73–77`
  (positive manual-/canonical-værdier).

Låser NEGATIV/betinget fortegn:

- `phase4_e2e_test.ts:1531`: `COGS should be negative in contra-cost case` —
  låser at canonical-motoren bevarer negativ cogs i contra-cost.
- `phase4_e2e_test.ts:2338–2362`: dokumenteret "LOCAL EXCEPTION" — legacy-cogs
  negativ, semantic positiv; magnitude-sammenligning via dobbelt abs.
- `supabase/functions/_test_fixtures/normalizationProfileFixtures.ts:102–116`
  (`fixture_economic_pnl_cogs_contra`): raw −50000 → expected −50000,
  action "conditional".

Låser at LÆSERE skal tåle begge fortegn (abs-adfærden):

- `src/lib/__tests__/weeklyFocusKpi.test.ts:132–156`: "loenninger tager
  absolut værdi (negativ payroll → positivt tal)" og blandede fortegn i
  omkostningssummen (payroll −50.000, cogs 30.000, sales_costs −10.000 …).

**Ingen test låser årsrapport-vejens fortegn:** `extract-annual-report/` har
ingen testfil (mappen indeholder kun `index.ts`). Passthrough'et af PDF'ens
negative fortegn er udokumenteret af tests — kun prompten (linje 108/137)
definerer det.

---

## Sammenfatning af fund (som fund, ikke konklusioner)

1. Årsrapport-vejen skriver dokumentets fortegn uændret igennem og BEDER
   AI'en om negative omkostninger; ingen fortegnshåndtering findes i
   funktionen. Kun 4 af de 6 nøgler skrives af den vej.
2. Fortegnshåndteringen hos læserne er inkonsistent: abs-lejren
   (calcTotalExpenses, kpiDefs, weeklyFocusKpi, alle Hb-budget-flader,
   PerformanceScore, CombinedBudgetWidget) mod rå-lejren (PerformanceOverview
   løn-%, NoegletalView-trendserien, MemberDetail-kort, run-company-agents
   payroll_pct, ai-financial-feedbacks AI-input, computeDerivedMetrics'
   guard, auto-create-baseline-budgets `> 0`-gates).
3. factsAdapter mapper de seks nøgler uændret og dropper `equity` — årsrapport-
   egenkapitalen når aldrig en visning.
4. En positivering ville bryde contra-cost-afstemningen (test-låst) og få
   paritetsvalidatorerne til at melde falsk mismatch, medmindre rapport-sidens
   kopier flippes i samme greb. Alt andet er adfærdsændringer, ikke brud.
5. Canonical-konventionen er tæt test-låst; annual_report- og manual-vejenes
   negative fortegn er IKKE test-låst nogen steder.

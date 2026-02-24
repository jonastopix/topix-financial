
# Platformanalyse: Bugs, Dupleret Kode, Hardcoded Værdier og Forbedringer

## 1. Dupleret Kode (DRY-overtrædelser)

### 1.1 DANISH_MONTHS og SHORT_MONTHS er defineret 3 steder
- `src/lib/financialUtils.ts` (den kanoniske kilde)
- `src/pages/Reports.tsx` (linje 64-69) -- dupleret lokalt
- `src/components/DeliveryOverview.tsx` (linje 15-20) -- dupleret lokalt

**Fix:** Fjern de lokale kopier og importer fra `financialUtils.ts`.

### 1.2 parseReportPeriodToKey er defineret 3 steder
- `src/lib/financialUtils.ts` (eksporteret)
- `src/pages/Reports.tsx` (linje 71-80) -- lokal kopi
- `src/components/DeliveryOverview.tsx` (linje 22-31) -- lokal kopi

**Fix:** Fjern de lokale kopier og importer fra `financialUtils.ts`.

### 1.3 getKeyFigures er defineret 2 steder
- `src/lib/financialUtils.ts` (eksporteret)
- `src/pages/Reports.tsx` (linje 82-85) -- lokal kopi

**Fix:** Importer fra `financialUtils.ts`.

### 1.4 formatDKK er defineret 3 steder
- `src/lib/financialUtils.ts` (eksporteret)
- `src/pages/Reports.tsx` (linje 87-88) -- lokal kopi
- `src/pages/Members.tsx` (linje 194-195) -- endnu en variant
- `src/pages/MemberDetail.tsx` (linje 227-228) -- endnu en variant

**Fix:** Brug den eksporterede version fra `financialUtils.ts` konsistent.

### 1.5 formatCompact er defineret 2 steder
- `src/lib/financialUtils.ts`
- `src/pages/Reports.tsx` (linje 90-94)

### 1.6 statusConfig er defineret 3 steder
- `src/pages/Reports.tsx` (linje 58-62)
- `src/pages/MemberDetail.tsx` (linje 100-104)
- `src/components/DeliveryOverview.tsx` (linje 33-37)

**Fix:** Brug `reportStatusConfig` fra `financialUtils.ts` og tilpas de manglende felter.

### 1.7 getInitials er defineret 3 steder
- `src/pages/Chat.tsx` (linje 259-260)
- `src/pages/Members.tsx` (linje 186-187)
- `src/pages/MemberDetail.tsx` (linje 224-225)

**Fix:** Opret en delt `getInitials` utility-funktion.

### 1.8 calcProgress / calcHandoutProgress er duplikeret
- `src/pages/Handouts.tsx` (linje 17-30)
- `src/pages/MemberDetail.tsx` (linje 87-98) -- identisk logik

**Fix:** Flyt til en delt utility, f.eks. `src/lib/handoutUtils.ts`.

---

## 2. Bugs og Potentielle Fejl

### 2.1 Console-fejl: forwardRef mangler i AIProgressWidget
Konsol-loggen viser:
> "Function components cannot be given refs. Check the render method of `AIProgressWidget`."

`Dialog` fra Radix sender en ref til `AIProgressWidget`, som ikke bruger `forwardRef`. Selvom det virker, giver det runtime-advarsler.

**Fix:** Wrap `AIProgressWidget` i `React.forwardRef`, eller juster Dialog-brugen.

### 2.2 Budget.tsx: Hardcoded year "2026" som default
Linje 141: `const [year, setYear] = useState("2026");`
Og kun to valgmuligheder i dropdown: "2025" og "2026" (linje 448-450).

**Fix:** Brug `new Date().getFullYear().toString()` som default, og generer year-options dynamisk.

### 2.3 Chat.tsx: Hardcoded tekst "Skriv direkte til Morten og Jonas"
Linje 278: `"Skriv direkte til Morten og Jonas"` -- hardcoded rådgivernavne.

**Fix:** Hent rådgivernavne dynamisk, eller brug en generisk tekst som "Skriv direkte til dine rådgivere".

### 2.4 Chat.tsx: Alle beskeder hentes uden limit
Linje 73-75: `supabase.from("messages").select("...").order(...)` -- henter ALLE beskeder i systemet for advisor-visningen (op til 1000 pga. Supabase standard). Kan blive en flaskehals.

**Fix:** Tilfoej `.limit()` og hent kun seneste besked per conversation i stedet for alle.

### 2.5 Auth.tsx: "BR" logo er hardcoded
Linje 68 og 108: `<span>BR</span>` -- "BR" for "The Boardroom" er hardcoded flere steder.

**Fix:** Brug en delt konstant eller logo-komponent.

### 2.6 Budget.tsx: handleImportComplete bruger altid BUDGET_TEMPLATES[0]
Linje 242: `const tmpl = BUDGET_TEMPLATES[0];` -- efter import vælges altid den første skabelon uanset branche.

**Fix:** Forsog at matche importerede kategorier til den bedste skabelon (som allerede gores i loadBudget).

### 2.7 KPIs.tsx: Hardcoded tooltip styles
Linje 196-202: `tooltipStyle` bruger faste HSL-værdier i stedet for CSS-variabler, hvilket bryder dark/light mode konsistens.

**Fix:** Brug `hsl(var(--background))` og `hsl(var(--border))` som i Reports.tsx.

### 2.8 Manglende error handling i flere data-loads
Flere useEffect-blokke ignorerer fejl fuldstændigt:
- `PerformanceScore.tsx` linje 41-48: `.then(({ data }) => ...)` -- ingen fejlhåndtering
- `RevenueChart.tsx` linje 14-22: Samme mønster
- `BudgetOverview.tsx` linje 14-22: Samme mønster
- `ActivityFeed.tsx` linje 34: Ingen catch/error handling
- `AttentionNeeded.tsx` linje 40: Ingen catch/error handling

**Fix:** Tilfoej `.catch(console.error)` eller vis fejl-state til brugeren.

### 2.9 Reports.tsx: `Legend` import men bruges ikke
Linje 35: `Legend` importeres fra recharts men bruges aldrig (erstattet af custom legend).

**Fix:** Fjern ubrugt import.

### 2.10 Budget.tsx: `as any` type-casting i insert
Linje 228: `.insert({ ... })` for budget_targets -- dette er korrekt, men gentagne `as any` casts pa messages-inserts (Reports.tsx linje 228, MemberDetail.tsx linje 201) tyder pa type-mismatches med den auto-genererede type.

---

## 3. Hardcoded Værdier

### 3.1 KPIs.tsx: FALLBACK_TARGETS og DEFAULT_BENCHMARKS
Linje 68-85: Hardcoded KPI-targets og benchmarks (120.000 DKK, 60%, etc.). Disse bruges som fallback, men brugere der ikke har sat targets ser fiktive tal uden at vide det.

**Fix:** Tydeliggor i UI'et at dette er fallback-vardier ("Standard-target -- juster efter din virksomhed").

### 3.2 KPIs.tsx: INDUSTRY_TEMPLATES
Linje 94-167: Komplet hardcoded branche-benchmarks. Ikke nødvendigvis forkert, men bor valideres og evt. hentes fra database.

### 3.3 CommunityProgress.tsx: Hardcoded scoring (10 pts pr rapport, 25 pts pr milestone)
Linje 49 og 67: Scoring er hardcoded. Svar til ændringer i gamification-logikken kræver kodeændring.

### 3.4 PerformanceScore.tsx: Hardcoded scoring-formler
Linje 65-77: Score-beregninger bruger faste multiplikatorer (`* 2`, `* 3`, `/ 6`). Disse er ikke umiddelbart forkerte men er ugennemsigtige for brugeren.

### 3.5 Budget.tsx: Default period hardcoded
I databasen: `budget_targets.period` har default `'Oktober 2025'` -- dette er en gammel hardcoded default.

---

## 4. Arkitekturproblemer

### 4.1 Dashboard laver individuelle API-kald fra mange widgets
Hver widget (`PerformanceScore`, `AttentionNeeded`, `ActivityFeed`, `BudgetOverview`, `CommunityProgress`, `AIProgressWidget`, `RevenueChart`, `RecentReports`) laver sine egne Supabase-kald. Dashboard kan lave 10+ API-kald ved load.

**Fix (fremtidig):** Centraliser data-fetching i et dashboard-hook eller brug React Query til caching.

### 4.2 Ingen React Query brug trods dependency
`@tanstack/react-query` er installeret og QueryClientProvider wrappet, men ingen komponenter bruger `useQuery`. Al data-fetching er manuel med `useState` + `useEffect`.

**Fix:** Migrer gradvist til `useQuery` for automatisk caching, refetching og loading states.

### 4.3 Chat.tsx realtime subscription lækker ikke, men conversation-listen opdateres ikke
Linje 206-234: Realtime subscription opdaterer kun `messages` state -- men `conversations`-listen (sidebar) opdateres ikke automatisk.

---

## 5. Implementeringsplan

### Fase 1: Kritiske fixes (bugs)
1. Fjern hardcoded "Morten og Jonas" i Chat.tsx
2. Fix hardcoded year "2026" i Budget.tsx
3. Fjern unused `Legend` import i Reports.tsx
4. Fix AIProgressWidget forwardRef-advarsel

### Fase 2: DRY-oprydning
5. Fjern duplerede `DANISH_MONTHS`, `SHORT_MONTHS`, `parseReportPeriodToKey`, `getKeyFigures`, `formatDKK`, `formatCompact` fra Reports.tsx og DeliveryOverview.tsx
6. Opret delt `getInitials` utility
7. Flyt `calcHandoutProgress` til delt utility
8. Konsolider `statusConfig` definitioner

### Fase 3: Robusthed
9. Tilfoej error handling til alle Supabase-kald i widgets
10. Tilfoej `.limit()` til Chat.tsx all-messages fetch
11. Fix KPIs.tsx tooltip styles til CSS-variabler
12. Budget import: Match til bedste skabelon

### Tekniske detaljer

**Filer der skal rettes:**
- `src/pages/Reports.tsx` -- fjern 6 duplerede funktioner/konstanter, fjern unused import
- `src/pages/Chat.tsx` -- fjern hardcoded navne, tilfoej limit
- `src/pages/Budget.tsx` -- dynamisk år
- `src/pages/KPIs.tsx` -- tooltip CSS-fix
- `src/pages/Members.tsx` -- brug delt formatDKK
- `src/pages/MemberDetail.tsx` -- brug delte utilities
- `src/components/DeliveryOverview.tsx` -- fjern duplerede konstanter/funktioner
- `src/components/AIProgressWidget.tsx` -- fix forwardRef
- `src/components/PerformanceScore.tsx` -- tilfoej error handling
- `src/components/RevenueChart.tsx` -- tilfoej error handling
- `src/components/BudgetOverview.tsx` -- tilfoej error handling
- `src/components/ActivityFeed.tsx` -- tilfoej error handling
- `src/components/AttentionNeeded.tsx` -- tilfoej error handling
- `src/lib/utils.ts` eller ny `src/lib/uiUtils.ts` -- tilfoej delt `getInitials`
- `src/lib/handoutUtils.ts` (ny) -- delt `calcHandoutProgress`

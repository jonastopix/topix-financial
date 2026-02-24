

# Dashboard Fixes — 6 Konkrete Problemer

## 1. Handouts viser forkert total (100% / "1 af 1")

**Problem**: Widgetten tæller kun rækker i `handouts`-tabellen. Hvis brugeren kun har oprettet 1 handout, viser den "1 af 1 = 100%", selvom der er 5 moduler i alt.

**Fix**: Brug de 5 hardcodede moduler fra `handoutConfig.ts` (`moduleOrder.length = 5`) som total i stedet for `handouts.length`. Completed tælles stadig fra databasen.

**Fil**: `src/components/DashboardHandouts.tsx`

---

## 2. Budget-widget viser meningsløse data

**Problem**: Viser top 5 budget_targets sorteret efter beløb — men uden måned, kontekst eller sammenligning med actuals. Det er bare 5 bars med kategorinavne.

**Fix**: Erstat med en "Budget vs. Actual" mini-widget der viser:
- Samlet budgetteret omsætning vs. realiseret omsætning (fra seneste rapport)
- Samlet budgetterede omkostninger vs. realiserede
- En simpel afvigelsesindikator (grøn/rød pil)
- Link til /budget for detaljer

**Fil**: `src/components/BudgetOverview.tsx`

---

## 3. Milestones er ulæselige og ubrugelige

**Problem**: Titler afkortes ved `max-w-[70%]` + `truncate`, og der er ingen interaktionsmuligheder.

**Fix**:
- Fjern `truncate` og brug `line-clamp-2` i stedet, så titler kan folde over 2 linjer
- Tilføj en lille "done"-knap (checkmark-ikon) ved hver milestone, der sætter progress til 100 og status til "completed" direkte fra dashboardet
- Vis deadline hvis den findes (kompakt datoformat)

**Fil**: `src/components/DashboardMilestones.tsx`

---

## 4. AI Progress croppes i kompakt tilstand

**Problem**: Compact-mode renderer stadig det fulde 80x80px SVG + 3-kolonne counter-grid, som er for bredt/højt til et 1/4-bredde kort.

**Fix**:
- I compact-mode: Reducer SVG til 64x64, reducer radius
- Placer donut og counters vertikalt i stedet for horisontalt (de 3 tællere stables under donut'en)
- Fjern "Se alle X anbefalinger"-linket i compact og erstat med et simpelt "Se detaljer"-link

**Fil**: `src/components/AIProgressWidget.tsx`

---

## 5. Bank-KPI mangler data

**Problem**: Dashboardet tager kun `bank_balance` fra den seneste rapport. Men den seneste rapport (Januar 2026) er en resultatopgørelse uden balancedata. Kun saldobalancer (fx Juni 2025, April 2025) har `bank_balance`.

**Fix**: I dashboard-queryen, find separat den seneste rapport der HAR `bank_balance` (dvs. ikke nødvendigvis den allerseneste rapport). Vis bank-saldo fra den rapport med en subtitle der angiver hvilken periode den stammer fra.

**Fil**: `src/pages/Index.tsx` (dashboard query-logik)

---

## 6. Udgifter-KPI er uklar

**Problem**: "Udgifter" viser kun `loenninger + direkte_omkostninger`. Subtitlen siger "løn + direkte omk." — men brugeren undrer sig over om marketing, lokaler, admin etc. er med.

**Fix**:
- Inkluder ALLE driftsomkostninger: loenninger + direkte_omkostninger + marketing + lokaler + admin + tech_software + afskrivninger
- Omdøb subtitlen til "samlede driftsomk."
- Opdater også RevenueChart-komponenten, så "Udgifter"-linjen bruger samme beregning for konsistens

**Filer**: `src/pages/Index.tsx`, `src/components/RevenueChart.tsx`

---

## Opsummering af filer der ændres

| Fil | Ændring |
|-----|---------|
| `src/components/DashboardHandouts.tsx` | Brug 5 moduler som total |
| `src/components/BudgetOverview.tsx` | Erstat med Budget vs. Actual mini-widget |
| `src/components/DashboardMilestones.tsx` | Bedre tekst-visning + done-knap |
| `src/components/AIProgressWidget.tsx` | Fix compact layout (vertikal, mindre SVG) |
| `src/pages/Index.tsx` | Bank fallback + udgifter beregning |
| `src/components/RevenueChart.tsx` | Samme udgifter-beregning for konsistens |

Ingen nye filer, ingen database-ændringer, ingen nye dependencies.

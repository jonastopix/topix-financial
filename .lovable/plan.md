

## Redesign af Rapporteringssiden: Leveringsoverblik + Finansiel udvikling med periodevalg

### Problemet
- **Leveringsoverblik** er bundet til et "12-måneders program" baseret på `start_date`, men platformen kender ikke altid programperioden, og det skaber forvirring.
- **Finansiel udvikling** viser altid alle data uden mulighed for at vælge periode (seneste 12 mdr, år til dato, custom).
- Labels og kontekst kan forbedres.

### Plan

#### 1. Redesign DeliveryOverview — årsbaseret i stedet for 12-måneders program

**Fil:** `src/components/DeliveryOverview.tsx`

Fjern hele "Dit 12-måneders program"-konceptet. Erstat med:
- **Årsbaseret visning** grupperet efter kalenderår (f.eks. "2025", "2026")
- Vis alle måneder i hvert år (Jan-Dec), hvor rapporter der er uploadet markeres med checkmark
- Tæller: "X af Y leveret" per år (hvor Y er antal måneder i året der er relevante — f.eks. hvis virksomheden startede i marts 2026, vis kun Mar-Dec for 2026)
- Progress-bar per år
- Bevar farvekodning: grøn=processed, gul=processing, rød=error, tom=mangler
- Fjern `programStart` prop — komponenten kigger nu kun på hvilke måneder der faktisk har rapporter og grupperer dem

#### 2. Tilføj periodevalg til Finansiel udvikling

**Fil:** `src/pages/Reports.tsx` (trend chart-sektionen, linje ~390-549)

Tilføj en period-selector oven over grafen med tre valg:
- **Seneste 12 mdr** (default) — viser de seneste 12 måneder med data
- **År til dato** — viser jan-nu for indeværende kalenderår
- **Vælg periode** — to date-pickers (fra-måned, til-måned) til custom range

Implementer som simpel state + filter i `trendData` useMemo. UI: tabs/knapper i header-linjen ved siden af titlen.

Tilføj tydelig label der viser den valgte periode, f.eks. "Mar 2025 – Feb 2026" under titlen.

#### 3. Tilføj periodevalg til FinancialOverview

**Fil:** `src/components/FinancialOverview.tsx`

Samme periodevalg-mønster som ovenfor. Komponenten modtager allerede `reports` og filtrerer dem — tilføj intern state for periode-filter.

Fjern `programStart` prop og reference-line til programstart (irrelevant nu).

#### 4. Tilføj periodevalg til RevenueChart (Dashboard)

**Fil:** `src/components/RevenueChart.tsx`

Fjern filtrering baseret på `company.start_date/end_date`. Brug samme "seneste 12 mdr" som default, med mulighed for at skifte til "År til dato".

#### 5. Opdater Reports.tsx — fjern programStart-afhængighed

**Fil:** `src/pages/Reports.tsx`
- Fjern `programStart` state og fetch af `companies.start_date`
- Fjern `programStart` prop fra `DeliveryOverview` og `FinancialOverview`

### Tekniske detaljer

- Ingen database-ændringer nødvendige
- Periodevalg er ren client-side filtering af allerede fetchede rapporter
- Periodevalg-UI genbruges som en lille shared komponent eller inline i hver sektion
- Custom periode-picker bruger simple `<select>` dropdowns for måned/år (ikke full calendar)

### Opsummering af ændrede filer
1. `src/components/DeliveryOverview.tsx` — komplet redesign til årsbaseret
2. `src/pages/Reports.tsx` — fjern programStart, tilføj periodevalg til trend chart
3. `src/components/FinancialOverview.tsx` — tilføj periodevalg, fjern programStart
4. `src/components/RevenueChart.tsx` — fjern start/end-dato filtrering, tilføj periodevalg


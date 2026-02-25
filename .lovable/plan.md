

## Dashboard KPI-kort: Månedlig + År-til-dato visning

### Nuværende situation
Dashboard KPI-kortene viser kun den seneste rapporterede måneds tal (omsætning, udgifter, resultat, bank) med sammenligning til forrige måned. Der vises ingen YTD-tal og ingen sammenligning med samme måned sidste år.

### Plan

**1. Udvid data-hentning i `src/pages/Index.tsx`**
- Tilføj YTD-felter fra `extracted_data.key_figures`: `omsaetning_aar`, `resultat_foer_skat_aar`
- Find samme måned fra sidste år i den sorterede rapport-liste for Y/Y-sammenligning
- Beregn YTD-udgifter ved at summere alle måneders udgifter i indeværende år

**2. Redesign KPI-sektionen til to rækker**
- **Række 1 -- Seneste måned (3-4 kort):** Omsætning, Udgifter, Resultat, Bank -- med badge for M/M og Y/Y %-ændring
- **Række 2 -- År-til-dato (3 kort):** YTD Omsætning, YTD Resultat, YTD Bank/Likviditet -- fra `_aar`-felterne i rapporten

**3. Udvid `KPICard` komponenten**
- Tilføj support for en sekundær change-badge (Y/Y) så kortet kan vise fx "+5.2% vs forrige md" og "-1.3% vs samme md. sidste år" samtidigt
- Tilføj en optional `secondaryChange` og `secondaryTrend` prop

### Teknisk detalje

```text
KPI Layout:
+------------------+------------------+------------------+------------------+
| Oms. (md)        | Udgifter (md)    | Resultat (md)    | Bank             |
| 195.000 kr.      | 142.000 kr.      | 53.000 kr.       | 312.000 kr.      |
| +3.2% M/M        |                  | +8.1% M/M        |                  |
| -1.5% Y/Y        |                  | +12% Y/Y         |                  |
+------------------+------------------+------------------+------------------+
| YTD Omsætning    | YTD Resultat     | YTD Udgifter     |
| 1.245.000 kr.    | 287.000 kr.      | 958.000 kr.      |
+------------------+------------------+------------------+
```

### Filer der ændres
- `src/components/KPICard.tsx` -- tilføj `secondaryChange` / `secondaryTrend` props
- `src/pages/Index.tsx` -- udvid query-logik med YTD-data og Y/Y-sammenligning, tilføj anden række KPI-kort


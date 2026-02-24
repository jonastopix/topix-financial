

# Intelligent Leveringsoverblik

## Problem
Det nuvaerende leveringsoverblik viser et stift kalenderaar (Jan-Dec) for hvert aar. Det skaber problemer:
- Et nyt medlem der starter i juni ser 5 tomme maaneder (Jan-Maj) som foeler sig "bagud"
- Historisk data blandes visuelt med programperioden uden forskel
- Der er ingen tydelig markering af "dit 12-maaneders program" vs. "ekstra historik"

## Losning: Medlemscentreret tidslinje

Erstat det nuvaerende kalenderaars-grid med en tidslinje der er centreret om medlemmets start og slut, men stadig tillader historisk data.

### Visuelt koncept

```text
Leveringsoverblik
─────────────────────────────────────────────────────────
  HISTORISK DATA          DIT 12-MAANEDERS PROGRAM
  (foer opstart)         (fra medlemskabsstart)
  
  [Mar] [Apr] [Maj] │ [Jun] [Jul] [Aug] [Sep] [Okt] ...
   ✓     ✓     ✓   │   ✓    ✓    ○     ○     ○
                    │
              Programstart: Juni 2025
              Status: 5 af 12 leveret
```

- **Venstre side**: Historiske rapporter (vist i en dempet stil med label "Historik")
- **Hoejre side**: De 12 programmaaneder (tydeligt fremhaevet som kerneperioden)
- En visuel separator og label viser praecis hvornaar programmet starter
- Maaneder i fremtiden vises bloedt, fortidige uden rapport vises som "mangler"

### Datakilder

- **Programstart**: Hentes fra `profiles.created_at` (hvornaar brugeren oprettede sig) - dette er allerede tilgaengeligt
- **Rapporter**: Allerede hentet fra `financial_reports`-tabellen
- Ingen nye tabeller eller kolonner er noedvendige

### Implementeringsplan

**1. Beregn programperiode (i `Reports.tsx`)**
- Brug brugerens `created_at` til at definere de 12 programmaaneder
- Generer en sorteret liste af alle relevante maaneder: historiske + program

**2. Opdater Leveringsoverblik-sektionen**
- Erstat det nuvaerende `yearGroups`-grid med en todelt visning:
  - "Historik"-sektion (kun hvis der er rapporter foer programstart) - vises kompakt
  - "Program"-sektion med de 12 maaneder som hoved-grid
- Tilfoej en progress-bar: "X af 12 leveret"
- Behold farvekoderne: groen (processed), gul (processing), roed (error), graa (tom)

**3. Filtrer grafer intelligent**
- Tilfoej en simpel toggle/filter oeverst paa trendgraferne: "Programperiode" / "Al data"
- Standard er "Al data" saa historik altid vises i graferne
- Graferne faar en visuel markering (vertikal linje) der viser programstart

**4. Fremtidssikring**
- Maaneder efter de 12 programmaaneder vises ikke i programgriddet, men rapporter kan stadig uploades og vil vises i historik/grafer
- Ingen haard afgraensning - systemet accepterer alt data

### Tekniske aendringer

| Fil | Aendring |
|-----|---------|
| `src/pages/Reports.tsx` | Erstat `yearGroups` logik med `programMonths` + `historicMonths` beregning. Opdater JSX for leveringsoverblikket. Tilfoej filter-state for grafer. |
| `src/pages/Reports.tsx` | Hent `profiles.created_at` i `loadData` for at kende programstart |
| `src/components/FinancialOverview.tsx` | Tilfoej valgfri `programStart` prop for visuel markering |

Ingen database-aendringer er noedvendige.


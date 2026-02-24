
# Dashboard Redesign: Kompakt, Visuelt og WOW

## Problem
- Hojre sidebar (4 kolonner) har 6 widgets stablet vertikalt, inkl. MilestonesList der viser ALLE milestones med fuld redigering
- Venstre side (8 kolonner) har kun 2 elementer (chart + rapporter) og er ofte tom
- Resultatet er en skæv, lang scroll-oplevelse

## Ny Layout-Struktur

```text
+------------------------------------------------------+
| Greeting + periode                                    |
+------------------------------------------------------+
| KPI 1    | KPI 2     | KPI 3      | KPI 4           |
+------------------------------------------------------+
| Attention Needed (kun hvis items)                     |
+------------------------------------------------------+
| Performance   | Revenue Chart (kompakt)               |
| Score         |                                       |
| (donut)       |                                       |
+-------------+-----------------------------------------+
| Handout     | Budget    | Milestones  | AI Progress   |
| Progress    | Snapshot  | (top 3)     | (kompakt)     |
+-------------+-----------+-------------+---------------+
| Aktivitet (horisontal tidslinje, max 5 items)         |
+------------------------------------------------------+
```

## Konkrete Aendringer

### 1. Nyt layout i `src/pages/Index.tsx`
- **Sektion 1**: KPI-kort (beholdes som-er, 4-grid)
- **Sektion 2**: AttentionNeeded (beholdes som-er)
- **Sektion 3**: 2-kolonne grid (4+8) med PerformanceScore (kompakt) og RevenueChart
- **Sektion 4**: 4-kolonne grid med fire kompakte "snapshot" kort:
  - **Handout-fremgang**: Ny mini-widget der viser samlet handout-completiongrad (antal faerdige/total) med en progress-bar og link til /handouts
  - **Budget-snapshot**: BudgetOverview (allerede kompakt nok, beholdes)
  - **Milestones-snapshot**: NY kompakt version der kun viser top 3 aktive milestones som simple progress-bars, med "Se alle" link til /milestones -- INGEN redigering paa dashboardet
  - **AI Progress**: Kompakt version (kun donut + taellere, ingen liste)
- **Sektion 5**: Aktivitetsfeed som horisontal kort-raekke (max 5) i stedet for vertikal liste
- **FJERNES fra dashboard**: CommunityProgress (tilgaengelig via sidebar), RecentReports (rapporter staar allerede i aktivitet + AttentionNeeded), fuld MilestonesList

### 2. Ny komponent: `src/components/DashboardMilestones.tsx`
- Viser max 3 aktive milestones som kompakte progress-linjer
- Ingen edit/delete knapper
- Footer med "Se alle X milestones" link til /milestones
- Ca. 60 linjer kode

### 3. Ny komponent: `src/components/DashboardHandouts.tsx`
- Henter handout-data fra Supabase
- Viser antal faerdige / total modules som en cirkel-progress
- Link til /handouts
- Ca. 50 linjer kode

### 4. Kompakt ActivityFeed: `src/components/DashboardActivity.tsx`
- Horisontal scroll med max 5 aktivitets-kort
- Hvert kort: ikon + kort tekst + tidsstempel
- Mere visuelt interessant end en vertikal liste

### 5. Kompakt AI Progress i dashboard-kontekst
- Genbrug AIProgressWidget men vis kun donut + 3 taellere (ingen liste af anbefalinger)
- Tilfoej prop `compact?: boolean` til AIProgressWidget

## Teknisk Plan

### Filer der oprettes
- `src/components/DashboardMilestones.tsx` - kompakt milestone-widget
- `src/components/DashboardHandouts.tsx` - handout-fremgang widget
- `src/components/DashboardActivity.tsx` - horisontal aktivitetsfeed

### Filer der aendres
- `src/pages/Index.tsx` - helt nyt layout med de nye widgets
- `src/components/AIProgressWidget.tsx` - tilfoej `compact` prop der skjuler anbefalingslisten

### Filer der IKKE aendres
- Alle eksisterende widgets beholdes intakte (de bruges stadig paa deres egne sider)
- Ingen database-aendringer
- Ingen nye dependencies

## Resultat
- Dashboardet passer paa en enkelt skaerm (max lille scroll)
- Alle vigtige informationer fra alle sider er repraesenteret som kompakte snapshots
- Hvert snapshot linker til den fulde side for detaljer
- Visuelt balanceret med brug af hele skaermbredden
- WOW-faktor via glassmorphism-kort, progress-cirkler og farvekodede accenter

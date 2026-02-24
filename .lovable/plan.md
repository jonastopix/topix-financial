
# Fjern AI Progress-siden og integrer som Dashboard-widget

## Overblik
AI Progress-siden (`/feedback`) fjernes som selvstændig side. Den unikke logik -- krydskobling mellem AI-anbefalinger og milestones -- flyttes ind som en kompakt widget pa Dashboard-siden.

## Trin

### 1. Opret ny widget-komponent
Ny fil: `src/components/AIProgressWidget.tsx`
- Genbruger den centrale logik fra `Feedback.tsx`: henter `financial_reports` med `ai_analysis` og `milestones`, matcher dem, og beregner status (actioned/improved/pending/regressed)
- Kompakt visning med:
  - Cirkulaer progress-ring (mindre end den nuvaerende) + procenttal
  - 3 stat-tal (Forbedret, Afventer, Forvaerret) i en raekke
  - Liste over de 3-5 vigtigste "pending/regressed" anbefalinger med status-ikon
  - "Se alle"-knap der ekspanderer eller aabner en dialog med den fulde liste (da siden fjernes)

### 2. Integrer widget pa Dashboard
I `src/pages/Index.tsx`:
- Importer `AIProgressWidget`
- Placer den i secondary-kolonnen (col-span-4), efter `PerformanceScore` og foer `CommunityProgress`

### 3. Fjern AI Progress-siden
- Slet `src/pages/Feedback.tsx`
- Fjern `/feedback`-ruten fra `src/App.tsx`
- Fjern `Feedback`-importen fra `src/App.tsx`

### 4. Opdater sidebar-navigation
I `src/components/AppSidebar.tsx`:
- Fjern `{ icon: MessageSquare, label: "AI Progress", path: "/feedback" }` fra `baseNavItems`

## Tekniske detaljer

### AIProgressWidget dataflow
```text
financial_reports (ai_analysis.key_findings)
        |
        +---> match title/source_report ---> milestones (progress, status)
        |
        v
  ProgressItem[] med status: actioned | improved | pending | regressed
        |
        v
  Kompakt widget: ring + stats + top-N items
```

### Widget-struktur (pseudo)
- Glass-card container med header "AI Progress"
- Venstre: SVG cirkel (80x80px) med procent
- Hoejre: 3 mini-stat bokse
- Nedenunder: max 4 pending/regressed items med ikon + tekst
- Footer: "Se alle anbefalinger" knap der aabner en Dialog med fuld liste + tabs

### Filer der aendres
| Fil | Aendring |
|-----|----------|
| `src/components/AIProgressWidget.tsx` | Ny fil -- kompakt widget |
| `src/pages/Index.tsx` | Tilfoej widget i sekundaer kolonne |
| `src/App.tsx` | Fjern `/feedback` route + import |
| `src/components/AppSidebar.tsx` | Fjern "AI Progress" nav-item |
| `src/pages/Feedback.tsx` | Slet filen |

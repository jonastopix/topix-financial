

## Guided Tour på Dashboard

### Hvad bygges
En interaktiv step-by-step tour der vises automatisk for nye brugere (lige efter onboarding) og guider dem igennem dashboardets vigtigste elementer. Touren kan også genstartes manuelt.

### Tilgang
Bygges som en ren React-komponent uden eksterne biblioteker. En overlay med spotlight-effekt (highlight af det aktuelle element) og en tooltip-boble med tekst + navigation (Næste / Spring over).

### Trin i touren (4-5 steps)

1. **Velkommen** - Generel velkomst overlay (ingen spotlight), forklarer hvad dashboardet viser
2. **KPI-kort** - Highlighter KPI-grid'et: "Her ser du din seneste måneds nøgletal"
3. **Rapporter** - Peger mod sidebar "Rapporter" link: "Upload din regnskabsrapport her for at få AI-analyse"
4. **Chat** - Peger mod sidebar "Chat" link: "Skriv til din rådgiver her"
5. **Færdig** - Afsluttende besked med konfetti-effekt (canvas-confetti er allerede installeret)

### Database-ændring
Tilføj `tour_completed_at` kolonne til `profiles`-tabellen for at tracke om touren er vist. Dermed vises den kun én gang.

### Nye filer

- **`src/components/GuidedTour.tsx`** - Tour-komponent med:
  - State for current step
  - Spotlight overlay (CSS clip-path baseret på target elements getBoundingClientRect)
  - Tooltip-boble positioneret ved target element
  - "Næste", "Spring over", "Færdig" knapper
  - Gemmer `tour_completed_at` i profiles ved afslutning
  - Bruger `canvas-confetti` på sidste step

### Ændringer i eksisterende filer

- **`src/pages/Index.tsx`** - Importér og rendér `<GuidedTour />` komponent. Vis touren hvis bruger ikke er advisor og `tour_completed_at` er null.
- **`src/hooks/useAuth.tsx`** - Tilføj `tour_completed_at` til profile select query så vi ved om touren skal vises.

### Teknisk detalje

Tour-steps defineres med CSS-selektorer eller data-attributter (`data-tour="kpi-cards"` etc.) på de relevante dashboard-elementer. Spotlight-effekten laves med en fuld-skærm overlay med `pointer-events: none` og et "hul" klippet ud med CSS `clip-path` omkring target-elementet. Touren kører kun client-side og kræver ingen edge functions.


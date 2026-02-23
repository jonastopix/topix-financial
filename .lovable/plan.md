

# Plan: AI Progress Redesign + Auto-Milestones fra AI Feedback

Vi tager punkt 3 og 4: Et visuelt redesign af AI Progress-siden og automatisk genererede milestones baseret på AI-analysen.

---

## Del 1: AI Progress Redesign (`/feedback`)

Den nuværende side er en lang liste af cards der alle ser ens ud. Det nye design skal give et klart overblik over hvor man er, og hvad der kraver handling.

### Nyt layout

**Top-sektion: Scoreboard**
- Cirkulaer progress-ring (ligesom PerformanceScore) med samlet procent
- 3 stat-bokse: Forbedret / Afventer / Forvaerret (som nu, men visuelt staerkere)
- Tekst: "Du har handlet pa X af Y anbefalinger"

**Midt-sektion: Filtrering med tabs**
- Tabs: "Alle" | "Kraever handling" | "Forbedret" | "Forvaerret"
- Giver hurtig adgang til det vigtigste -- specielt "Kraever handling"

**Anbefalings-cards: Redesign**
- Kompakt format med tydelig status-farve i venstre kant (border-left)
- Metric-aendring vises som inline "pill" med pil (ROAS: 2.1x -> 3.4x) direkte i card-headeren
- AI-kommentar vises som collapsible (default foldet ud for "Kraever handling", foldet ind for resten)
- Rapport-kilde vises som diskret tag

**Tidslinje-indikator**
- Gruppering per rapport-maaned med en tynd tidslinje-linie mellem grupper
- Giver kontekst om hvornaar anbefalingen kom

### Teknisk
- Omskriv `src/pages/Feedback.tsx` fuldstaendigt
- Tilfoej tab-state med `useState`
- Brug eksisterende UI-komponenter (Tabs fra radix)
- Brug SVG cirkel-progress (ligesom PerformanceScore)

---

## Del 2: Auto-Milestones fra AI Feedback

Naar AI-analysen genererer anbefalinger, foresl as automatiske milestones som medlemmet kan acceptere, afvise eller redigere.

### Nyt UI pa Milestones-siden

**Ny sektion: "AI-foreslaaede milestones"**
- Vises oeverst paa `/milestones` i et adskilt kort med Sparkles-ikon
- Hver foreslaaet milestone viser:
  - Titel (genereret fra AI-anbefaling)
  - Foreslaaet deadline
  - Kilde-rapport
  - 3 knapper: "Accepter" (gron) | "Rediger" (neutral) | "Afvis" (rod)
- Accepterede milestones flyttes ned i den normale milestone-liste
- "Rediger" aabner inline-edit med titel og deadline-felter
- Afviste milestones forsvinder (med toast-besked)

**Opdateret MilestonesList**
- Tilfoej visuelt tag pa milestones der kom fra AI ("AI-foreslaaet") 
- Tilfoej mulighed for at klikke pa en milestone og se detaljer/redigere

### Data-struktur (hardcoded demo foerst)
- Nye suggested milestones array med `source: "ai"`, `sourceReport`, `suggestedDeadline`
- Lokal state til at handtere accept/reject/edit

### Filer der aendres
- `src/pages/Milestones.tsx` -- tilfoej AI-forslag sektion
- `src/components/MilestonesList.tsx` -- tilfoej source-tag og klikbar detalje-visning
- `src/pages/Feedback.tsx` -- fuldstaendigt redesign

---

## Raekkefoelge

1. Redesign AI Progress (`Feedback.tsx`) -- stoerste visuelle loft
2. Opdater Milestones med AI-forslag (`Milestones.tsx` + `MilestonesList.tsx`)

Ingen database-aendringer i denne omgang -- alt koerer med demo-data for nu (ligesom resten af platformen). Naar vi senere tilfojer authentication og database, kan vi goere det persistent.


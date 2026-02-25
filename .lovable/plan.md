

## Baseline / nuværende status på milestones

Tilføj et felt til milestones, der registrerer udgangspunktet (baseline), så fremgang kan måles relativt. For eksempel: "Nuværende omsætning: 800.000 kr." når målet er "Nå 2M kr. i årlig omsætning".

### Hvad der ændres

**1. Database: Ny kolonne `baseline` på `milestones`-tabellen**
- Tilføj en nullable `text`-kolonne kaldet `baseline`
- Text-type giver fleksibilitet til både tal ("800.000 kr.") og kvalitative udsagn ("Ingen NPS-måling endnu")
- Ingen RLS-ændringer nødvendige -- eksisterende policies dækker allerede

**2. Opret-dialogen i `src/pages/Milestones.tsx`**
- Tilføj et nyt inputfelt "Nuværende status / baseline" mellem beskrivelse og kategori
- Placeholder-tekst der guider brugeren, f.eks. "F.eks. 800.000 kr. i omsætning"
- Feltet er valgfrit
- Værdien gemmes ved oprettelse via `handleCreate`

**3. Milestone-forslag med baseline-hints**
- Udvid `MilestoneSuggestion`-interfacet i `src/lib/milestoneSuggestions.ts` med et valgfrit `baselineHint`-felt
- Når brugeren klikker et forslag, udfyldes baseline-feltet med et hint (f.eks. "Indtast nuværende årsomsætning")

**4. Visning i `src/components/MilestonesList.tsx`**
- Vis baseline-værdien under milestone-titlen når den er udfyldt, f.eks. som en lille "Udgangspunkt: 800.000 kr."-label

### Teknisk tilgang

- En database-migration tilføjer kolonnen: `ALTER TABLE milestones ADD COLUMN baseline text;`
- Typen opdateres automatisk i `types.ts`
- Forslagenes `baselineHint` er statisk og kræver ingen database-ændring
- Simpel UX: feltet er synligt men valgfrit, så det ikke bremser brugere der bare vil oprette hurtigt

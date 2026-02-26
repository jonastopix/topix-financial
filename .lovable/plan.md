

# Onboarding-side for nye inviterede brugere

## Oversigt
Nye brugere der accepterer en invitation og logger ind for forste gang, bliver modt af en onboarding-side hvor de kan udfylde deres profil og se information om den virksomhed de er blevet tilknyttet. Derefter sendes de videre til dashboardet.

## Hvordan vi detecter "forste gang"
Vi tilfojer et `onboarded_at` felt til `profiles`-tabellen. Hvis det er `null`, vises onboarding-siden. Nar brugeren fuldforer onboarding, saettes feltet til `now()`.

## Trin

### 1. Database-migration
- Tilfoj kolonne `onboarded_at timestamptz` (nullable, default null) til `profiles`-tabellen
- Saet `onboarded_at = now()` for alle eksisterende profiler, sa de ikke ser onboarding

### 2. Opret `src/pages/Onboarding.tsx`
En venlig velkomstside pa dansk med:
- Velkomstbesked med virksomhedsnavnet brugeren er tilknyttet
- Felt til at opdatere fulde navn (pre-udfyldt fra signup)
- Evt. profilbillede-upload
- "Kom i gang"-knap der saetter `onboarded_at` og navigerer til dashboard

### 3. Opdater `useAuth.tsx`
- Tilfoj `needsOnboarding: boolean` til auth context (baseret pa `onboarded_at === null`)
- Hent `onboarded_at` sammen med profil-data

### 4. Opdater `App.tsx` routing
- Tilfoj `/onboarding` route
- I `ProtectedRoute`: hvis bruger er logget ind men `needsOnboarding === true`, redirect til `/onboarding`

## Tekniske detaljer
- Onboarding-siden bruger eksisterende UI-komponenter (Card, Button, Input)
- Profil-opdatering sker via `supabase.from('profiles').update()`
- Ingen nye RLS-policies nodvendige -- eksisterende "Users can update own profile" daekker det
- Siden er pa dansk og folger appens eksisterende design-stil


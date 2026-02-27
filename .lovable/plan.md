

## Fix: Inviterede brugere skal lande på "Opret konto"-formularen

### Problem
Invitationsmailen linker til `https://topix.lovable.app/auth`, som viser login-formularen som standard. Nye brugere ved ikke, at de skal klikke "Opret konto" for at skifte visning.

### Losning

**1. Auth-siden: Understot `?mode=signup` query-parameter** (`src/pages/Auth.tsx`)
- Laes URL query-parameteren `mode` ved indlasning
- Hvis `mode=signup`, saet `isLogin` til `false` sa signup-formularen vises direkte
- Brugeren lander dermed pa "Opret konto" med det samme

**2. Invitationslinket: Opdater URL** (`src/pages/Members.tsx`)
- Aendr `signup_url` fra `https://topix.lovable.app/auth` til `https://topix.lovable.app/auth?mode=signup`
- Gaelder for `handleStandaloneInvite`-funktionen

**3. E-mail-skabelonen: Opdater fallback-tekst** (`supabase/functions/send-invitation-email/index.ts`)
- Knapteksten i fallback-HTML'en siger allerede "Accepter invitation", sa den er fin
- Ingen aendringer nodvendige i edge-funktionen

### Resultat
Nar Morten (eller andre inviterede) klikker pa linket i mailen, lander de direkte pa "Opret konto"-formularen med felter til navn, virksomhed, email og adgangskode.

### Filer der aendres
| Fil | Aendring |
|-----|---------|
| `src/pages/Auth.tsx` | Tilfoej useSearchParams, saet isLogin baseret pa `?mode=signup` |
| `src/pages/Members.tsx` | Aendr signup_url til at inkludere `?mode=signup` |


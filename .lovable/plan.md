

# Diagnose og fix af invitations-problemer

## Fundne problemer

### 1. Email-template bruger CSS-klasser i stedet for inline styles
Invitation-emailen i databasen bruger `class="text-primary underline"` på linket — CSS-klasser virker **ikke** i emails. Mange email-klienter stripper dem, så linket kan se ud som almindelig tekst eller slet ikke vises korrekt. Det kan forklare hvorfor Susanne ikke "ser" mailen — knappen er nærmest usynlig.

### 2. Duplikerede brugere ved signup
Flere virksomheder har duplikerede medlemmer:
- **Two socks**: Simon Frimann med 2 konti (simon@simonfrimann.dk + simon@two-socks.com)
- **PHILBERT ApS**: Nille med 2 konti (info@philbert.design + nille@philbert.design)
- **Fortyfivefaces**: Sebastian + Amalie (2 medlemmer)
- **Topix.dk**: Jonas + Jonas test

Dette sker fordi `handle_new_user`-triggeren opretter en ny virksomhed hvis der ikke findes en pending invitation, og monday-webhook har oprettet brugere med andre emails end invitations-emailen.

### 3. 6 brugere mangler rolle i user_roles
De har profiles og company_members men ingen rolle-tildeling, hvilket kan give adgangsproblemer.

## Plan

### Trin 1: Fix email-template i databasen
Opdater `body_html` i `email_templates` tabellen for "Invitation til virksomhed" så linket bruger **inline styles** med en tydelig grøn knap (emerald `#0fa968`) i stedet for CSS-klasser. Tilsvarende opdatering af `FALLBACK_HTML` i edge function-koden.

### Trin 2: Oprydning af duplikerede brugere
Tilføj en `cleanup-duplicates` action til `manage-advisor` edge function der:
- Finder virksomheder med mere end 1 medlem
- Identificerer den "korrekte" bruger (den med matching invitation)
- Fjerner duplikerede auth-konti og profiler

Alternativt: lav dette manuelt via den eksisterende "Fjern medlem"-funktion på MemberDetail-siden for de specifikke duplikater.

### Trin 3: Tildel manglende roller
Kør en migration der indsætter `member`-rolle for de 6 brugere der mangler det, så de kan tilgå platformen korrekt.

### Trin 4: Gensend invitation til Susanne
Når email-templaten er fixet med inline-styled knap, gensend invitationen til susanne@two-socks.com.

## Filer der ændres
- `supabase/functions/send-invitation-email/index.ts` — opdater FALLBACK_HTML med inline-styled knap
- Database: opdater `email_templates.body_html` via migration
- Database: indsæt manglende `user_roles` via migration

## Hvad der IKKE røres
- Virksomheder, financial documents, storage — alt bevares


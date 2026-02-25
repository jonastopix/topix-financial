
# Fuld Monday.com Integration: Automatisk onboarding ved "I gang"

## Hvad skal ske
Når en ansøger på Monday-boardet (board ID 1899777797) skifter status til "I gang", skal systemet:
1. Hente alle relevante kolonnedata fra Monday via API (CVR, branche, kontaktperson, email, hjemmeside, by osv.)
2. Oprette virksomheden i databasen med alle felter udfyldt
3. Sende en invitation til kontaktpersonens email, så de kan oprette en bruger og automatisk blive tilknyttet virksomheden

## Forudsætning: Monday API Token
En **Monday API Token** er nødvendig for at hente kolonnedata. Du finder den i Monday.com under:
- Klik dit profilbillede (nederst til venstre) -> "Developers" -> "My access tokens"
- Eller: monday.com -> Administration -> API

Tokenet skal gemmes som en sikker hemmelighed i backend.

## Teknisk plan

### Trin 1: Gem Monday API Token som secret
- Brug `add_secret` til at bede om `MONDAY_API_TOKEN`

### Trin 2: Opdater `supabase/functions/monday-webhook/index.ts`
Den nuværende webhook opretter kun en virksomhed med navn. Den skal udvides:

**a) GraphQL-kald til Monday API**
- Når status er "I gang", brug `pulseId` (item ID) til at kalde Monday GraphQL API:
```
query { items(ids: [PULSE_ID]) { column_values { id title text value } } }
```
- Dette returnerer alle kolonneværdier for det specifikke item

**b) Mapping af Monday-kolonner til companies-felter**
- Vi skal mappe kolonne-ID'er fra boardet til vores database-felter (CVR, branche, kontaktperson, email, hjemmeside, adresse, by, postnr.)
- Da vi ikke kender de præcise kolonne-ID'er endnu, bygger vi en fleksibel mapping der logger alle kolonner ved første kald, så vi kan tilpasse

**c) Opret virksomhed med alle data**
- Indsæt i `companies`-tabellen med alle felter udfyldt fra Monday

**d) Send invitation automatisk**
- Hvis kontaktpersonens email er tilgængelig fra Monday, opret en `company_invitation` med status "pending"
- Kontaktpersonen kan derefter oprette sig via det normale signup-flow og bliver automatisk tilknyttet virksomheden (via `handle_new_user`-triggeren der allerede tjekker for pending invitations)

### Trin 3: Konfigurér webhook i Monday.com
- Webhook URL: `https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/monday-webhook`
- Boardet: 1899777797
- Event: Når en statuskolonne ændres
- Dette er allerede delvist sat op (challenge-verification virker), men skal verificeres

## Filer der ændres
- `supabase/functions/monday-webhook/index.ts` -- hovedlogikken udvides med Monday API-kald og invitation-oprettelse

## Flowdiagram
```text
Monday Board: Status -> "I gang"
        |
        v
  Webhook fires -> Edge Function
        |
        v
  GraphQL kald til Monday API (hent alle kolonner)
        |
        v
  Opret virksomhed med fulde data (companies)
        |
        v
  Opret invitation (company_invitations) med kontakt-email
        |
        v
  Kontaktperson modtager besked -> Signup -> Auto-tilknyttet
```

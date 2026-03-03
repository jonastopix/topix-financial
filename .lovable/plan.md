

# Fix Monday.com webhook signaturvalidering

## Problem
Alle webhook-events fra Monday.com afvises med "Invalid Monday.com webhook signature". Monday.com retrier hvert ~2 minut, men alle fejler. Floren Engros og fremtidige virksomheder oprettes derfor ikke automatisk.

## Årsag
`MONDAY_SIGNING_SECRET` i edge function-konfigurationen matcher ikke den aktuelle signing secret i Monday.com. Dette sker typisk når Monday.com roterer secrets, eller når appen er blevet gen-installeret/opdateret.

## Plan

### Trin 1: Opdater MONDAY_SIGNING_SECRET
Du skal hente den korrekte signing secret fra Monday.com:
1. Gå til **monday.com → Developer → Apps → din app → Features → Webhooks**
2. Find **Signing Secret** (ikke API token)
3. Jeg beder dig om at indsætte den nye værdi via Lovable's secret-manager

### Trin 2: Tilføj debug-logging (midlertidigt)
Tilføj et log-statement der viser om Authorization-headeren overhovedet er til stede og dens format (uden at afsløre selve værdien), så vi kan bekræfte at verifikationen virker efter opdatering.

### Trin 3: Redeploy og test
Redeploy `monday-webhook` edge function og verificer i logs at næste Monday-event behandles korrekt. Monday retrier automatisk, så Floren Engros bør oprettes inden for få minutter.

## Filer der ændres
- `supabase/functions/monday-webhook/index.ts` — tilføj debug-logging
- Secret: `MONDAY_SIGNING_SECRET` — opdateres med ny værdi


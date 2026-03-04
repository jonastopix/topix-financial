

## Plan: Fix auth i 2 Edge Functions

### 1. `process-pending-invitation` — Skift fra `getUser()` til `getClaims()`

Linje 28-37 erstattes med standard-mønsteret:
- Opret `authClient` med `SUPABASE_ANON_KEY`
- Kald `authClient.auth.getClaims(token)` i stedet for `getUser(token)`
- Udtræk `userId` fra `claimsData.claims.sub`
- Brug `userId` i stedet for `caller.id` til security-tjekket (linje 42)

### 2. `generate-budget-scenarios` — Tilføj auth-validering

Funktionen har i dag **ingen auth-check overhovedet**. Tilføj:
- Authorization header check med Bearer prefix
- `getClaims(token)` validering via anon client
- 401-response ved ugyldigt/manglende token
- Indsættes lige efter OPTIONS-håndteringen (linje 13), før body parsing

### Ingen database-ændringer

Begge funktioner har allerede `verify_jwt = false` i `config.toml`, hvilket er korrekt — auth valideres i koden.


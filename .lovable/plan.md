

# Fix: Inactivity logout virker ikke ved genbesøg

## Root cause

1. **`stampActivity()` på linje 41** nulstiller timeren ved hver page load. Når Morten åbner browseren efter en nat, skriver hooken "nu" som sidste aktivitet — før den når at checke om sessionen er udløbet. Timeout slår derfor aldrig igennem.

2. **`session_timeout_minutes` mangler i `app_config`**. Hooken falder korrekt tilbage til 30 min default, men konfigurationen er ikke gemt i databasen.

## Fix

### 1. `useInactivityLogout.ts` — check-before-stamp

Erstat den ubetingede `stampActivity()` på linje 41 med en check:

```text
// Pseudo-logic:
const existing = getLastActivity();
const elapsed = Date.now() - existing;
if (elapsed > timeoutMs) {
  // Session allerede udløbet — log ud med det samme
  supabase.auth.signOut();
  return;
}
// Session stadig gyldig — stamp og start timer
stampActivity();
```

Dette sikrer at en udløbet session altid fanges ved page load, uanset om brugeren har været væk i timer eller dage.

### 2. Database — indsæt `session_timeout_minutes`

Migration: `INSERT INTO app_config (config_key, config_value) VALUES ('session_timeout_minutes', 30)` så den faktisk er persisteret og kan ændres fra admin-panelet.

## Files changed

| File | Change |
|------|--------|
| `src/hooks/useInactivityLogout.ts` | Check-before-stamp logik |
| Migration SQL | Insert `session_timeout_minutes` row |

## Acceptance tests

1. Luk browseren, vent > 30 min (eller sæt timeout til 1 min for test), åbn igen → bruger logges ud
2. Aktiv bruger inden for timeout → session forlænges normalt
3. Warning-dialog vises stadig 2 min før udløb
4. `session_timeout_minutes` kan ændres i admin config

## Exclusions

- Ingen ændringer til Supabase token refresh (server-side session)
- Ingen ændringer til andre auth flows


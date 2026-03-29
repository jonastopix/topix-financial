

# Implementering af prioriterede fixes

## Overblik
Implementering af de 4 højest prioriterede punkter fra analysen.

---

## 1. Fix `auth.getUser` → `auth.getClaims` i generate-weekly-focus

**Fil:** `supabase/functions/generate-weekly-focus/index.ts` (linje 34-49)

Erstat `authClient.auth.getUser(token)` med `authClient.auth.getClaims(token)` og brug `claimsData.claims.sub` til at hente userId — i overensstemmelse med projektets auth-pattern.

---

## 2. Fix ebitda_margin mapping i weekly focus T5

**Fil:** `supabase/functions/generate-weekly-focus/index.ts` (linje 277-283)

Ret `ebitda_margin: "ebitda"` til `ebitda_margin: "ebitda_margin_pct"` så margin-procent sammenlignes med margin-target (ikke et absolut beløb). Fjern den manuelle on-the-fly beregning (linje 293-295) da `ebitda_margin_pct` allerede er en procentværdi i metrics.

---

## 3. Fix hardcoded `done: false` for milestones i dashboard

**Fil:** `src/pages/Index.tsx` (linje 411)

Beregn om der er mindst én aktiv milestone med progress > 0 eller status "done" denne måned. Brug eksisterende milestones-query (hvis den allerede er tilgængelig) eller tilføj en simpel count-query for milestones med `updated_at` i denne måned.

---

## 4. Tilføj toast-feedback ved KPI sync

**Fil:** `src/pages/Settings.tsx` (linje 601-633)

Efter sync-loopet afsluttes, vis en informativ toast: "KPI-mål opdateret fra branchestandard" så brugeren ved at deres targets er ændret.

---

## Tekniske detaljer

### generate-weekly-focus auth fix (punkt 1)
```typescript
// Before:
const { data: claimsData } = await authClient.auth.getUser(token);
if (claimsData?.user) { ... claimsData.user.id ... }

// After:
const { data: claimsData } = await authClient.auth.getClaims(token);
const callerId = claimsData?.claims?.sub as string | undefined;
if (callerId) { ... callerId ... }
```

### ebitda mapping fix (punkt 2)
```typescript
// Before:
ebitda_margin: "ebitda",  // WRONG: ebitda is an amount, not a margin

// After:
ebitda_margin: "ebitda_margin_pct",  // CORRECT: compare margin % with margin target
```
Fjern linje 293-295 (on-the-fly ebitda margin beregning) da `ebitda_margin_pct` allerede er den korrekte procentværdi.

### Milestones done-status (punkt 3)
Tilføj en query for milestones denne måned og beregn `hasMilestoneProgressThisMonth` baseret på om der er mindst én milestone med `status = 'done'` eller `progress > 0` opdateret i denne måned.

### Toast feedback (punkt 4)
Tilføj `toast.info("KPI-mål opdateret fra branchestandard")` efter sync-loopet.




# Plan: Stop dubletter af AI-finansanalyser

## Problem
`generate-financial-commentary` opretter en ny commentary hver gang den kaldes — også hvis der allerede findes en frisk (ikke-stale) analyse for **samme periode med samme metrics-hash**. I nat resulterede det i to identiske Marts 2026-analyser for Alina Beauty & Skincare (02:27 og 02:34, begge basis hash `56788ae3…`).

Januar-agenten kørte korrekt: Anja committede en manuel januar-override kl. 02:25, og post-commit pipelinen i `ReportReviewDialog` trigger `run-company-agent` + `generate-financial-commentary` som designet.

## Løsning
Tilføj en **idempotency-guard** i `supabase/functions/generate-financial-commentary/index.ts` som tjekker for en eksisterende, ikke-stale commentary med samme hash før en ny indsættes.

### Ændringer i `generate-financial-commentary/index.ts`

Lige efter `basisMetricsHash` er beregnet (linje ~137), før insert (linje ~141), tilføjes:

```ts
// Idempotency: hvis der allerede findes en frisk commentary for samme
// (company_id, period_key, basis_metrics_hash), returnér den i stedet for
// at oprette en dublet. Dette beskytter mod dobbelt-trigger fra
// ReportReviewDialog (fx ved "Erstat gammel data" eller dobbeltklik).
const { data: existing } = await adminClient
  .from("financial_commentaries")
  .select("*")
  .eq("company_id", company_id)
  .eq("period_key", period_key)
  .eq("basis_metrics_hash", basisMetricsHash)
  .eq("is_stale", false)
  .order("generated_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (existing) {
  console.log(
    `[generate-financial-commentary] Skipping duplicate for ${company_id}/${period_key} — existing id ${existing.id}`
  );
  return new Response(JSON.stringify(existing), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

Bemærk: AI-kaldet (`fetch(aiFeedbackUrl, …)`) flyttes **efter** denne guard, så vi heller ikke spilder AI-tokens på et duplikat. Konkret: hele blokken fra linje 98 ("Call ai-financial-feedback") til 134 ("needs_more_data") flyttes til efter guard'en.

## Rækkefølge i den opdaterede funktion
1. Auth + access check
2. Hent committed facts
3. Beregn `basisMetricsHash`
4. **NYT:** tjek for eksisterende ikke-stale commentary med samme hash → returnér hvis fundet
5. Hent budget-kontekst
6. Kald `ai-financial-feedback`
7. Persistér ny commentary
8. Returnér

## Hvad det IKKE løser (med vilje)
- `run-company-agent` skriver stadig en chat-besked hver gang (det er ønsket — agenten må gerne kvittere, og dens output er kort og personligt, ikke en lang analyse-rapport).
- Eksisterende dubletter i databasen ryddes ikke automatisk. Hvis du vil rydde nat-duplikatet manuelt, kan jeg slette commentary `2df843a7-0b40-4e37-9994-e96e6d99ec1c` og dens tilhørende system-besked `46e43581-…` separat efter approval.

## Filer der ændres
- `supabase/functions/generate-financial-commentary/index.ts` (én funktion, omflytning + ny guard, ~25 linjer)


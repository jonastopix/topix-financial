

## Problem

Email-loggen viser **alle rækker** fra `email_send_log` uden deduplikering. Hver email opretter først en `pending`-række og derefter en `sent`-række (samme `message_id`). Derfor ser du dobbelt så mange rækker som reelle emails, og "Afventer"-tallet er oppustet fordi gamle `pending`-rækker aldrig forsvinder fra visningen.

## Løsning

Dedupliker på `message_id` så kun den **nyeste status** per email vises. Supabase JS-klienten understøtter ikke `DISTINCT ON`, så vi henter data og deduplicerer client-side.

## Plan

**Fil: `src/pages/AdminEmailLog.tsx`**

1. **Dedupliker rækker efter fetch**: Efter query-resultatet returneres, grupper rækkerne på `message_id` og behold kun den nyeste (`created_at` DESC) per gruppe. Rækker uden `message_id` beholdes som-de-er.

2. **Opdater stats til at bruge deduplikerede rækker**: `countByStatus` og `failedCount` skal beregnes på de deduplikerede rækker, ikke de rå rækker. Ligeledes `total`-visningen i headeren.

3. **Opdater `uniqueTypes`-filter**: Basér også på deduplikerede rækker.

Denne ændring sker udelukkende i queryFn's return og de afledte beregninger — ingen ændring af query eller andre filer.


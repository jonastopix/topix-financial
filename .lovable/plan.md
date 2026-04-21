

## Plan: Én samlet velkomst fra advisor — ingen anonyme afsendere

### Problem
Når en ny founder afslutter onboarding, oprettes **to** velkomstbeskeder:

1. **`send-welcome-message`** indsætter en `message_type: "welcome"` besked. Renderen i `CompanyChatPane` har ingen case for `"welcome"`, så den falder ned i bruger-bobbel-renderen. Den finder ikke advisor i `participants` (advisors er ikke i `company_members`), så afsenderen vises som **"M Medlem"** med default-avatar.
2. **`run-company-agent`** trigger `onboarding` (kaldet fra `useAuth` når `onboarding_completed=false` og `profileOnboarded=true`) bruger sit `write_chat_message`-tool, som tvinger `sender_id = conv.member_id` og `message_type: "system"`. Det rendes som en grå **"SYSTEM"-boks** med Sparkles-ikon.

Begge brydes med vores princip: chatbeskeder skal komme fra en navngiven advisor med billede.

### Løsning — én velkomst, fra advisor, med navn og avatar

**1. Fjern den separate `send-welcome-message`-trigger**
- Slet kaldet i `src/pages/Onboarding.tsx` (linje 73-78). Agenten leverer nu velkomsten — vi har ikke brug for to kanaler.
- Behold edge function-filen for nu (kan kaldes manuelt fra admin), men marker den som deprecated i en kommentar.

**2. Lav agentens velkomst til en rigtig advisor-besked (ikke "system")**
I `supabase/functions/run-company-agent/index.ts` `write_chat_message`-toolet:
- Tilføj en valgfri parameter `as_advisor: boolean` (default `false`).
- Når `as_advisor === true`:
  - Slå `conv.assigned_advisor_id` op; fald tilbage til første bruger med rolle `advisor` eller `admin`.
  - Sæt `sender_id = advisorId`, `message_type = "user"` (så den rendes som almindelig chat-bobbel), `context_type = null`, ingen `context_meta.source = agent` (skjul "Var dette nyttigt?"-knapperne for velkomstbeskeden).
- Opdatér onboarding-prompten til at kalde `write_chat_message` med `as_advisor: true` for selve velkomsten. Andre agent-beskeder (post-commit analyse osv.) forbliver `system`-bokse som i dag.

**3. Sørg for at advisor-profilen kan vises i chatten for founders**
`CompanyChatPane`-renderen slår sender op i `participants` (kun company_members) eller `profilesMap`. For at "billede + navn" virker for advisor:
- Når vi henter beskeder, udvid `profilesMap` så den også indeholder `assigned_advisor_id` for samtalen (hent profil + avatar én gang).
- Hvis advisor stadig ikke kan opløses (edge case), vis "Rådgiver" + advisor-initial — **aldrig** "Medlem"/"M".

**4. Idempotens**
Agentens onboarding-kørsel sætter allerede `onboarding_completed = true` med det samme (eksisterende fix), så den kører kun én gang. Vi behøver ingen ekstra guard når `send-welcome-message` ryger ud.

**5. Ryd op i eksisterende test-data**
Manuel SQL-cleanup af Topix.dk ApS + bruger så du kan teste forfra med et tomt slate.

### Filer der ændres
- `src/pages/Onboarding.tsx` — fjern `send-welcome-message`-kald
- `supabase/functions/run-company-agent/index.ts` — tilføj `as_advisor` til `write_chat_message`, opdater onboarding-prompt
- `src/components/CompanyChatPane.tsx` — sørg for advisor-profil hentes ind i `profilesMap`, fallback til "Rådgiver" i stedet for "Medlem"
- SQL: hard-delete af Topix.dk ApS + kontakt@topix.dk

### Resultat
Founder ser **én** velkomstbesked i chatten — fra navngiven advisor (assigned eller fallback) med rigtigt avatar/navn. Ingen "Medlem"-boks, ingen "SYSTEM"-boks ved onboarding. Efterfølgende agent-beskeder (post-commit analyse) forbliver som "SYSTEM"-bokse, som de skal.


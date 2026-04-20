
Målet er at få “Kør agent” til faktisk skrive en agent-besked i chatten — og vise en reel fejl, hvis agenten ikke lykkes.

1. Ret den konkrete backend-fejl i `supabase/functions/run-company-agent/index.ts`
- Fjern den duplikerede `get_kpi_targets` tool-definition i `tools` arrayet.
- Det er den primære årsag til fejlen lige nu: AI-kaldet bliver afvist, så agenten når aldrig til `write_chat_message`.
- Behold resten af tool-kontrakten uændret.

2. Gør edge-funktionen fail-safe i stedet for “success despite failure”
- Stop med at returnere `{ ok: true }`, hvis AI-gatewayen fejler eller agent-loopet afbrydes uden at have skrevet en besked.
- Returnér en struktureret fejlrespons med fx:
  - `ok: false`
  - `error`
  - `done`
  - evt. `diagnostics` om hvorfor agenten stoppede
- Track eksplicit om `write_chat_message` faktisk blev kaldt og lykkedes.
- Hvis ingen chatbesked blev skrevet, skal funktionen returnere fejlstatus, selv hvis HTTP-responsen stadig er 200.

3. Stram frontend-håndteringen i `src/pages/MemberDetail.tsx`
- Behold den nye `invoke`-fejlcheck, men udvid den til også at validere responsens `data.ok` og ikke kun `error`.
- Vis success-toast kun når funktionen både:
  - ikke returnerer `error`
  - og returnerer `data.ok === true`
  - og gerne `data.done === true`
- Vis en tydelig fejltoast med backendens fejlbesked, hvis agenten ikke skrev noget til chatten.

4. Gør samme responshåndtering konsekvent i de øvrige agent-kald
- Opdatér de andre manuelle/automatiske kald til `run-company-agent`, så de ikke logger falsk succes:
  - `src/components/ReportReviewDialog.tsx`
  - `src/pages/ReportDebug.tsx`
- For non-blocking flows kan de stadig være “best effort”, men de skal logge backendens `ok:false` tydeligt.

5. Ingen ændring nødvendig i chat-renderingen
- `CompanyChatPane` renderer allerede `system`/`ai` beskeder.
- `write_chat_message` indsætter allerede `message_type: "system"` og `context_type: "agent"`.
- Derfor ligger problemet ikke i visningen, men i at agenten aldrig når til at skrive beskeden.

Tekniske noter
- Den nuværende logik i edge-funktionen bryder AI-loopet ved gateway-fejl, men returnerer bagefter stadig `{ ok: true, iterations, done }`.
- Logs viser den konkrete fejl: `Duplicate function declaration found: get_kpi_targets`.
- `supabase/config.toml` er allerede sat korrekt op for `run-company-agent`; der behøves ikke flere config-ændringer.

Validering efter implementering
- Kør “Kør agent” på en committed rapport fra `MemberDetail`.
- Bekræft at:
  - der kommer en ny system/agent-besked i virksomhedens chat
  - success-toast kun vises ved reel succes
  - fejltoast vises, hvis AI-kaldet eller beskedskrivningen fejler
- Tjek også at den automatiske post-commit trigger stadig virker uden at blokere rapport-flowet.

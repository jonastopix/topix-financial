

## Slack-notifikation ved ny feedback

### Koncept
Ny edge function `send-slack-feedback-notification` der poster til Slack-kanalen når en virksomhedsbruger indsender feedback. Følger samme arkitektur som de eksisterende Slack-notifikationer (chat, rapport, handout).

### Teknisk plan

| Trin | Beskrivelse |
|------|-------------|
| 1 | Oprette `supabase/functions/send-slack-feedback-notification/index.ts` — edge function der: autentificerer caller via JWT claims, henter feedback-record + profil + virksomhedsnavn via service-role, poster til `SLACK_ADVISOR_CHANNEL_ID` med kategori-emoji (🐛/💡/💬), titel, preview af beskrivelse, afsendernavn og virksomhed |
| 2 | Registrer funktionen i `supabase/config.toml` med `verify_jwt = false` |
| 3 | Oprette `src/lib/feedbackNotify.ts` — fire-and-forget helper (same pattern som `chatNotify.ts`, `reportNotify.ts`, `handoutNotify.ts`) |
| 4 | Kalde `notifyFeedbackSubmitted(feedbackId)` fra `FeedbackDialog.tsx` efter succesfuld insert |

### Edge function detaljer
- Auth: JWT claims-validering + caller must match feedback.user_id
- Guard: Skip hvis afsender er advisor/admin (de behøver ikke notificere sig selv)
- Idempotency: Simpel — funktionen kaldes kun én gang ved submit, ingen log-tabel nødvendig
- Slack-besked format: Enkelt blok med header (`🐛 Ny bug-rapport` / `💡 Nyt forslag` / `💬 Ny feedback`), virksomhedsnavn, afsender, titel og beskrivelse-preview
- Opretter også en `advisor_notifications` record for in-app notifikation




# Plan: Samlet kommunikationsarkitektur

Al kommunikation samles i chatten med kontekst-cards og AI system-beskeder.

## Implementeret

### Database
- `messages` tabel udvidet med `message_type`, `context_type`, `context_id`, `context_meta`
- message_type: 'user' (normal), 'system' (aktivitet), 'ai' (AI-analyse)
- context_type: 'report', 'milestone', 'budget', null
- context_meta: JSON med titel, status etc. til rendering af kontekst-cards

### Chat UI (Chat.tsx)
- Kontekst-cards vises på beskeder der refererer til rapporter/milestones
- AI/system-beskeder vises centreret med Sparkles-ikon

### MemberDetail (advisor-side)
- Kommentarer på rapporter sendes som chat-beskeder med context_type='report'

### Reports (medlem-side) — FULD PIPELINE
- Upload → gem i DB → AI-ekstraktion → AI-analyse → auto-milestones → chat-notifikation
- Fjernet al mock-data, viser kun rigtige DB-rapporter
- AI-analyse bruger rigtige data fra financial_reports tabellen
- Kommentarer via chat med rapport-kontekst

### Milestones — DB-BACKED
- Læser fra milestones-tabellen i stedet for hardcoded data
- Gemmer ændringer i DB (progress, deadline, titel)
- AI opretter automatisk milestones fra rapport-analyse (advarsel/kritisk findings)
- Poster aktivitets-besked i chat ved completion

### Aktivitets-beskeder
- [x] AI-feedback fra rapport-analyse postes automatisk som system-beskeder i chatten
- [x] Aktivitets-beskeder (rapport uploadet, milestone completed) postes automatisk

## TODO
- [ ] Milestones-side bruger chat-baserede kommentarer
- [ ] Feedback.tsx kobles til rigtige data

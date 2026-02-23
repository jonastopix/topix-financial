

# Plan: Samlet kommunikationsarkitektur

Al kommunikation samles i chatten med kontekst-cards og AI system-beskeder.

## Implementeret

### Database
- `messages` tabel udvidet med `message_type`, `context_type`, `context_id`, `context_meta`
- `report_comments` tabel droppet – alt kører via messages
- message_type: 'user' (normal), 'system' (aktivitet), 'ai' (AI-analyse)
- context_type: 'report', 'milestone', 'budget', null
- context_meta: JSON med titel, status etc. til rendering af kontekst-cards

### Chat UI (Chat.tsx)
- Kontekst-cards vises på beskeder der refererer til rapporter/milestones
- AI/system-beskeder vises centreret med Sparkles-ikon
- Normale beskeder med kontekst viser "Re: [rapport-titel]" som tag

### MemberDetail (advisor-side)
- Kommentarer på rapporter sendes som chat-beskeder med context_type='report'
- Viser eksisterende kommentartråd fra chatten
- Placeholder "sendes til chatten" i input

### Reports (medlem-side)
- Svar på kommentarer sendes som chat-beskeder med rapport-kontekst
- Viser kommentartråd fra chatten

## TODO
- [x] AI-feedback fra rapport-analyse postes automatisk som system-beskeder i chatten
- [ ] Aktivitets-beskeder (rapport uploadet, milestone completed) postes automatisk
- [ ] Milestones-side bruger samme chat-baserede kommentar-system



## Hvorfor rnl@larsen.dk fik 5 e-mails kl. 02:00

### Årsag: Dobbelt-notifikationer + cron-batch ved midnat

Der er **to separate problemer** der tilsammen skaber e-mail-spam:

### Problem 1: Dobbelt-notifikation per advisor-besked

Når en advisor sender en chat-besked, oprettes **to notifikationer** for samme bruger:

1. `chat_reply` — via `notify-chat-reply` edge function (kaldt fra CompanyChatPane)
2. `advisor_replied` — via `send-slack-chat-notification` edge function (som også skriver en in-app notifikation)

Begge resulterer i separate e-mails. Så **én advisor-besked = 2 e-mails**.

### Problem 2: Alle akkumulerede notifikationer sendes i én batch

`send-notification-email` kører som cron-job og sender e-mail for alle usete notifikationer ældre end 15 minutter. Alle notifikationer fra hele dagen (kl. 10:58, 11:05, 13:26, 18:41) samles op og sendes i midnats-kørslen — fordi anti-spam tælleren nulstilles ved midnat (den tæller "i dag").

For rnl@larsen.dk var der 3 advisor-beskeder → 6 notifikationer (3× `chat_reply` + 3× `advisor_replied`), men `MAX_EMAILS_PER_DAY = 5` stoppede den 6. e-mail.

### Data der bekræfter dette

```text
Notifikation             Oprettet           Email sendt
advisor_replied          07/04 10:58        08/04 00:00:10
advisor_replied          07/04 11:05        08/04 00:00:12
chat_reply               07/04 11:05        08/04 00:00:14
advisor_replied          07/04 13:26        08/04 00:00:16
chat_reply               07/04 13:26        08/04 00:00:16
chat_reply (18:41)       — stoppet af MAX_EMAILS_PER_DAY=5
```

### Løsning

**Fil: `supabase/functions/send-notification-email/index.ts`**

1. **Dedup `chat_reply` + `advisor_replied`**: Når begge typer eksisterer for samme bruger med reference til samme besked/tidsrum, send kun én e-mail og marker begge som sendt.

2. **Aggreger chat-notifikationer**: I stedet for én e-mail per besked, send én samlet "Du har X ulæste beskeder fra din rådgiver" e-mail per bruger.

**Fil: `supabase/functions/send-slack-chat-notification/index.ts`**

3. **Fjern `advisor_replied`-notifikationen herfra**: Denne edge function bør kun sende Slack-notifikationen. `notify-chat-reply` håndterer allerede in-app notifikationen. Det eliminerer duplikatet ved roden.

**Fil: `supabase/functions/send-notification-email/index.ts`**

4. **Tilføj `chat_reply` og `member_message` til `EMAIL_SUBJECTS` og `NOTIFICATION_TEMPLATE_NAMES`**: Så disse typer også håndteres korrekt af template-systemet (i stedet for at falde igennem uden match).

### Bygge-fejl

Build-fejlen med `total` er et stale artefakt — filen bruger allerede `dedupedTotal` overalt. En genstart af preview bør løse den.


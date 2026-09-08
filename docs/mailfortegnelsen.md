# Mailfortegnelsen — hver mail huset kan sende, hvornår, og til hvem

**Lavet 8. september 2026, formiddag**, EFTER Lovables mailopdatering samme
dag kl. 06:52-06:58 (19 commits direkte til main: køen og
`process-email-queue` er væk, alle afsendere går gennem
`_shared/managedEmail.ts`, som sender synkront gennem Lovables API).
Linjenumre gælder HEAD `68d86a46`.

**Hvad der er målt i prod (Lovable SQL editor, 8/9):** 14 skabeloner i
`email_templates`, 3 slået til (de tre rapport-påmindelser); 18 forskellige
`template_name` i `email_send_log` de sidste 30 dage; alle 14 skabeloners
`sender_email` opdateret kl. 09:31 til `noreply@theboardroom.dk`.
Fornyelsesvarslerne bevist sendt 7/9 kl. 11:57. **Alt andet er læst i
kode** — cron-jobbene fra migrationerne (prod-listen kan afvige, SQL 4c),
udløsere, modtagere og gates. Kolonnen «sidst sendt» udfyldes af SQL 4a.

**Hvornår den skal opdateres:** hver gang en mail tilføjes, fjernes eller
skifter udløser, og hver gang et cron-job planlægges, ændres eller
fjernes. Samme PR som ændringen (dokumentations-disciplinen i CLAUDE.md).
Skabelonens `enabled` slår ingen mail til eller fra — kun udløseren og
kodens egne gates gør (§2.2).

## De fem fund — læs dem først

1. **Ni ting findes som kode og har aldrig sendt en mail** (K1–K9 i
   §1d): Velkomstbeskeden er en chatbesked ingen kalder; «Ugens fokus»
   har prioritet `info`, som mail-motoren aldrig tager; fire skabeloner
   dækker typer der kun går til rådgivere, og rådgiver-mail er slået fra
   i koden; `advisor_replied` og `report_manual_entry` skrives af ingen;
   Lovables nye template-registry er tom.
2. **M9 og M10 går til samme person for samme betaling:** en 1:1-session
   giver både `session-booking-confirmation` direkte fra webhooken og en
   notifikation `session_booked`, som mail-motoren sender efter 15 min
   (D1 i §3.3).
3. **`pulse-reminder` blev unscheduleret 12/6, men funktionen lever**
   (M13) — den kan tændes igen ved at køre migration `20260331063447`.
4. **Auth-mailene skriver ikke i `email_send_log`:** signup, invite,
   magic-link, recovery, email-change og reauthentication (M20) sendes
   af Lovables `createAuthEmailHandler` og er usynlige i vores egen
   historik. Deres log findes kun hos Lovable.
5. **`monthly-digest` har ingen dag-gate i koden:** cronen kører den 22.,
   men admin-knappen «Send digest» sender til alle founders når som
   helst den trykkes (D4).

Fortegnelsen er en FORTEGNELSE, ikke en analyse: hvad der skal gøres ved
fundene, er Jonas' og Mortens beslutning (kortene står i
`docs/mangelliste.html`).

---

## 1. TABELLEN — sorteret efter modtager (medlem først)

navn = `template_name` i `email_send_log` (= `label` hos Lovable).
«tekst fra» = `email_templates` (DB) eller kode.

### 1a. Til MEDLEMMET (kontoens e-mail via `auth.users`/`profiles`, eller `companies.contact_email` for indgang/fornyelse)

| # | navn | bygges | udløses af | til hvem | tekst fra | slået til | sidst sendt |
|---|---|---|---|---|---|---|---|
| M1 | `report-reminder` (3 varianter: venlig/presserende/kritisk × upload/godkend) | `send-report-reminder/index.ts:199-262` | cron `daily-report-reminder` 09:00 UTC hver dag (`20260327094748`); funktionen sender KUN den 7., 15. og 20. (`:111-112`), for forrige måned, til virksomheder med `status = 'active'` uden committet fact for perioden (`:287`, `:298-301`) | ÉT medlem pr. virksomhed (`company_members … limit(1)`, `:330`); springer over ved `notification_email_prefs.report_reminders === false` (`:346`) | DB-skabelonerne «Rapport-påmindelse (venlig/presserende/kritisk)» når `enabled` (`:220-225`), ellers kode-fallback (`:35`, `:153-160`) | JA (cron aktiv i prod-listen 1/9; de tre skabeloner er de eneste `enabled` i prod). Skriver også notifikation `report_reminder` (`:408-415`), som mail-motoren springer over (`send-notification-email:168`) | kræver prod |
| M2 | `notification-report_review_ready` «Dine tal er klar til gennemsyn» | `send-notification-email/index.ts:535-620` (`buildEmailHtml` `:100-130`) | cron `process-notification-emails` */5 min (`20260901112000:57`, prod jobid 8) → notifikation skrevet af `extract-financial-data:1726-1747` ved upload med eligible metrics; mail først efter 240 min (`notificationEmailSelection.ts:70-72`), disposes hvis rapporten committes/slettes/ses (`:150`) | medlemmet der uploadede (`user_id`) | DB «Notifikation: Rapport klar til gennemsyn» hvis `enabled`, ellers kode (`EMAIL_SUBJECTS:61-72`) | JA | kræver prod |
| M3 | `notification-report_error` «Din rapport kunne ikke behandles» | samme motor | samme cron → `extract-financial-data:1711-1717` (`priority: action_required`), 240 min | uploaderen | DB «Notifikation: Rapport fejl» / kode | JA | kræver prod |
| M4 | `notification-chat_reply` «Ny besked fra din rådgiver» | samme motor | samme cron → `notify-chat-reply:70-77` (`important`), kaldt af chatten når rådgiveren svarer (`CompanyChatPane.tsx:767`); 15 min, kun hvis ulæst | medlemmet i samtalen | DB «Notifikation: Ny besked fra rådgiver» / kode | JA | kræver prod |
| M5 | `notification-chat_aggregated` «Ny besked fra din rådgiver» (samlet) | `send-notification-email:395-440` | samme cron; når et medlem har FLERE ulæste `chat_reply`/`advisor_replied` (`CHAT_NOTIFICATION_TYPES:86`) samles de i én mail | medlemmet | kode | JA | kræver prod |
| M6 | `notification-community_opslag` «{navn} har skrevet i Community: {titel}» | `_shared/opslagsMail.ts:147-221` via `send-notification-email:585` | samme cron → `notify-community-opslag:106-112` (`important`), kaldt af `communityApi.ts:189` når et medlem opretter et opslag | alle med community-adgang (`har_aktivt_medlemskab`), minus nævnte | kode | JA (bevist 3/9: 27 notifikationer) | kræver prod |
| M7 | `notification-event_reminder` | motoren, generisk | cron `event-reminders` 07:00 UTC (`20260810230000:90`) → `event-reminders:102-131` (`important`), dagen før og samme dag | tilmeldte medlemmer | kode (ingen skabelon) | JA (cron i prod-listen) | kræver prod |
| M8 | `notification-alert_revenue_drop` / `alert_negative_cash` / `alert_result_negative` / `alert_financial_summary` | motoren, generisk | samme cron → `detect-financial-alerts:136-246` (`important`/`action_required`), kaldt af klienten efter hver commit (`ReportReviewDialog:363`, `reportCommit.ts:160`) | medlemmet (`memberUserId`) | kode (ingen skabelon, fallback-emne = `notif.title`) | JA | kræver prod |
| M9 | `notification-session_booked` «Din betaling er modtaget — book din session nu» | motoren, generisk | samme cron → `stripe-webhook:950-960` (`important`) ved `checkout.session.completed` med `mode = "payment"` (1:1-session) | køberen | kode | JA — se D1: samme betaling giver også M10 | kræver prod |
| M10 | `session-booking-confirmation` | `stripe-webhook/index.ts:962-1000` | direkte i webhooken, samme gren som M9, efter Calendly-link er lavet (`:929-931`) | køberen | kode | JA | kræver prod |
| M11 | `intro-reminder` «Du har en sparring med mig til gode» | `intro-reminder-cron/index.ts:33-61` | cron `intro-session-reminder` 09:00 UTC (`20260901112000:83`); kandidat = fuldt medlem ≥ 2 dage, `intro_session_used_at IS NULL`, sidst sendt > 30 dage (`:103-130`); **TØRKØRSEL som standard** — sender kun med body `{"dry_run": false}` (`:235-236`) | medlemmet (`company_members` → `auth.users`), opt-out via `notification_email_prefs` (`:170-175`) | kode | KRÆVER PROD: om cron-jobbets body bærer `dry_run: false` (4c) — ellers er den tændt men tør. Afsendernavn «Morten fra The Boardroom» (`:27`) | kræver prod |
| M12 | `monthly-digest` «Dit {måned}-overblik» | `send-monthly-digest/index.ts:69-330` | cron `send-monthly-digest` 08:00 UTC den 22. (`20260810230000:74`) OG admin-knappen «Send digest» (`EmailTemplatesView.tsx:754-766`); **ingen dag-gate i koden** (grep `getDate`: 0) | alle founders med aktivt medlemskab (`:113-120`), opt-out `digestPrefs` (`:178-182`); springes over når der intet er at sige (`:277`) | kode | JA — se D4 | kræver prod |
| M13 | `pulse-reminder` «Husk dit pulse check-in» | `send-pulse-reminder/index.ts:12-38` | cron `send-pulse-reminder` — **UNSCHEDULERET 12/6** (`20260612090000:26`); funktionen lever og sender kun den 10. (`:50-56`) | medlemmer uden pulse for måneden | kode | NEJ (jobbet fjernet; kræver prod at bekræfte at det ikke er kommet tilbage) | kræver prod |
| M14 | `invitation` «Du er inviteret til The Boardroom» | `send-invitation-email/index.ts:12-50` (fallback) | fem veje: Members.tsx `:749` (invitér medlem), `:770` (gensend), `:1006` (ny virksomhed + invitation); `CompanyInvitations.tsx:190` (medlemmet inviterer kollega); `import-application:277`; `_shared/sikrIndgangsInvitation.ts:106` fra `stripe-webhook` efter betaling (6 kaldesteder, `:398-872`) | den inviterede adresse | DB «Invitation til virksomhed» hvis `enabled` (`:163-172`), ellers kode | JA | kræver prod |
| M15 | `indgang-dag0` «Velkommen i The Boardroom — sådan kommer du i gang» | `_shared/indgangsMail.ts:119` via `_shared/indgangsBetalingsmail.ts:199-212` | `monday-webhook` ved status «Godkendt» (`:80`, `:218-221`) og `saet-indgangs-prisniveau` (rådgiverens prissætning) | `companies.contact_email` (`:176`) | kode | JA i kode — men **0 rækker i `company_betalingslink`** (7/9): aldrig udløst | kræver prod |
| M16 | `indgang-dag14` «Din plads står klar» / `indgang-dag25` «Fem dage til din frist» / `indgang-dag31` «Din faktura til The Boardroom» | `_shared/indgangsMail.ts:144, 163, 187` via `indgangs-paamindelser-cron:301-307` | cron `indgangs-paamindelser` (planlægges manuelt, `:31-63`; 10:00 foreslået); **tørkørsel som standard**; dag 31 kun efter Stripe-faktura via `sendIndgangsFaktura` | `contact_email` | kode | KRÆVER PROD: står jobbet i `cron.job`, og med `dry_run: false`? | kræver prod |
| M17 | `fornyelse-varsel1` «Dit år med The Boardroom slutter {dato}» / `fornyelse-varsel2` «Påmindelse: dit medlemskab slutter …» | `_shared/fornyelsesMail.ts:70, 113` via `fornyelsesvarsel-cron:324-331` | cron `fornyelsesvarsler` 11:00 UTC (planlagt 7/9 kl. 14:51); motoren `afgoerForfaldentVarsel`: 30 dage / 7 dage før slutdato, kun med rådgiverbeslutning `tilbyd`; tørkørsel uden body | `contact_email` | kode | JA (bevist 7/9 kl. 11:57: PHILBERT varsel 1, CARMA varsel 2). Underskrift Jonas Herlev | 7/9 kl. 11:57 (kræver prod for nyere) |
| M18 | `legat-welcome` «Velkommen til The Boardroom Legat, {fornavn}» | `create-legat-enrollment/index.ts:230-292` | admin-knap «opret forløb» i Legat-fladen (`LegatView.tsx:165`) | den nye legatbruger | kode | JA (knappen findes) | kræver prod |
| M19 | `legat-upgrade` «du er nu medlem af The Boardroom» | `upgrade-legat-to-member/index.ts:60-110` | admin-knap «opgradér» (`LegatView.tsx:185`) | legatbrugeren | kode | JA | kræver prod |
| M20 | Auth: `signup` «Bekræft din e-mail» · `invite` «Du er inviteret til The Boardroom» · `magiclink` «Dit login-link» · `recovery` «Nulstil din adgangskode» · `email_change` «Bekræft din nye e-mail» · `reauthentication` «Din bekræftelseskode» | `_shared/email-templates/{signup,invite,magic-link,recovery,email-change,reauthentication}.tsx` via `auth-email-hook/index.ts:123-185` (`createAuthEmailHandler`, email-js 0.1.0) | Supabase Auth-hændelser (opret konto, glemt kode, skift mail …) — hook'en skal være koblet på i Lovable → Users → Auth settings | den bruger hændelsen vedrører | kode (React Email) | KRÆVER OPSLAG (dashboard). **Skriver IKKE `email_send_log`** (grep i filen: 0) — «sidst sendt» findes kun hos Lovable (`listEmailLogs` i email-js, eller Cloud → Emails) | kræver opslag |

### 1b. Til RÅDGIVEREN / ADMIN

| # | navn | bygges | udløses af | til hvem | tekst fra | slået til | sidst sendt |
|---|---|---|---|---|---|---|---|
| R1 | `indgang-raadgiver-mangler-pris` («haster»-emne, `indgangsMail.ts:223-241`) | via `indgangsBetalingsmail.ts:96-165` | `monday-webhook` «Godkendt» når virksomheden mangler prisniveau | fast adresse i secret **`RAADGIVER_MAIL_TIL`** (`:104`); ikke sat → ingen mail, kun log | kode | JA i kode; om secret'en er sat: kræver opslag; aldrig udløst (0 betalingslinks) | kræver prod |
| R2 | `advisor-invitation` «Velkommen til The Boardroom» (rådgiver) | `manage-advisor/index.ts:16-24` | admin-knap «invitér rådgiver» (`ConfigView.tsx:228`, action `invite`, `manage-advisor:352`) | den inviterede rådgiver-adresse | kode (DB «Advisor invitation»/«Rådgiver-invitation» fra migration `20260418124333` LÆSES IKKE af koden — grep `email_templates` i manage-advisor: 0) | JA | kræver prod |
| R3 | Notifikationer til rådgivere (`report_committed` `info`, `member_message`, `milestone_completed`, `pulse_checkin_received` — skrevet af `send-slack-report-notification:69-78`, `send-slack-chat-notification:294`) | — | mail-motoren | rådgivere | — | **NEJ**: `send-notification-email:233` `const ADVISOR_EMAIL_DISABLED = true;` («Advisors receive Slack notifications — email is for members only»), og `report_committed` er `priority: "info"`, som motoren aldrig tager (`:166`). Rådgiverne får Slack | aldrig |

### 1c. Til EN FAST ADRESSE / TEST

| # | navn | bygges | udløses af | til hvem | tekst fra | slået til | sidst sendt |
|---|---|---|---|---|---|---|---|
| T1 | `template-test` `[TEST] {emne}` | `send-template-email/index.ts:74-95` | admin-knap «Send testmail til mig» / feltet «Send test-email» (`EmailTemplatesView.tsx:443-454`, `:710-715`) | `test_email` (typisk admin selv); `is_test = true` | DB (den valgte skabelon) | JA | kræver prod |
| T2 | `report-reminder` i testmode | `send-report-reminder:114`, `:268` | kald med `testEmail` i body (ingen knap i fladen — grep `send-report-reminder` i src: 0) | `testEmail` | DB/kode | kun ved håndkald | kræver prod |

### 1d. Findes som kode, sender ALDRIG mail (hører med i fortegnelsen fordi de ligner mails)

| # | navn | hvad det er |
|---|---|---|
| K1 | «Velkomstbesked» (DB-skabelon, `send-welcome-message:120-148`) | en CHAT-besked (`messages.insert`), ikke en mail — og INTET kalder funktionen (grep i src/functions/migrations: 0). OVERLEVERING 7/9 bekræfter |
| K2 | `notification-weekly_focus_ready` (DB-skabelon «Notifikation: Ugens fokus klar») | `generate-weekly-focus:580-581` skriver notifikationen med `priority: "info"` → motoren tager kun `action_required`/`important` (`send-notification-email:166`). Aldrig mailet |
| K3 | `notification-report_committed`, `notification-member_message`, `notification-milestone_completed`, `notification-pulse_checkin_received` (fire DB-skabeloner) | typerne skrives KUN til rådgivere (R3) → advisor-mail slået fra. Aldrig mailet til nogen |
| K4 | `notification-advisor_replied` | typen skrives af ingen function (grep: kun UI-filer og skabelonlisten); `notify-chat-reply` skriver `chat_reply` | aldrig |
| K5 | `report_manual_entry` | `reportCommit.ts:33` nævner dedup-nøglen; ingen writer i functions (grep: INGEN) | aldrig |
| K6 | `_shared/transactional-email-templates/{send-email.ts, registry.ts}` + `preview-transactional-email` | Lovables scaffold 8/9: `TEMPLATES = {}` (`registry.ts:20-23`), `sendTemplateEmail` har ingen kaldere (grep: 0) | aldrig |
| K7 | `nudge-report-no-reflection` (`daily-reflection-nudge`), `legat-reminder-cron`, `send-engagement-nudge` | chat-beskeder, ikke mails; reflection-nudge slukket for godt 1/9 (`20260901110000`) |
| K8 | `system` (rækker i `email_send_log`) | ikke en mail: `handle-email-events:24-28` bogfører Lovables bounce/klage/afmeldings-events med `template_name: 'system'` og status `bounced`/`complained`/`suppressed` |
| K9 | Stripe-fakturaen dag 31 (`_shared/indgangsFaktura.ts:197-199`), Stripes kvitteringer, Calendly-bekræftelser | sendes af Stripe/Calendly fra DERES afsender — ikke i vores log |

---

## 2. Kilderne

### 2.1 `email_templates` — de 14 i prod (navnene, som koden kender dem)

Koden auto-opretter skabeloner tre steder (alle `enabled: false`):
`send-notification-email:194-215` (de ni «Notifikation: …»),
`send-report-reminder:179-195` (de tre påmindelser),
`send-welcome-message:128-137` («Velkomstbesked»); admin-fladen
`EmailTemplatesView.tsx:807-893` (`REQUIRED_TEMPLATES`) opretter de samme.
Migration `20260418124333` skriver `body_html` til «Advisor invitation»,
«Invitation til virksomhed», «Rapport-påmindelse» (uden suffix) og de tre
med suffix. Kandidater til de 14: 9 notifikationer + 3 påmindelser +
Velkomstbesked + Invitation til virksomhed + Advisor invitation +
Rapport-påmindelse = 16 navne. Hvilke 14 og hvilke der læses af kode:

| skabelon | læses af | effekt af `enabled` |
|---|---|---|
| Rapport-påmindelse (venlig/presserende/kritisk) | `send-report-reminder:220-225` | JA — tekst, emne og afsendernavn fra DB |
| Notifikation: Ny besked fra rådgiver / Rapport klar til gennemsyn / Rapport fejl / Rapport godkendt / Milestone fuldført / Ny besked i chatten / Pulse check-in modtaget / Ugens fokus klar | `send-notification-email:538-560` | JA for tekst; men fire af dem (K2-K3) mailes aldrig |
| Invitation til virksomhed | `send-invitation-email:163-172` | JA |
| Velkomstbesked | `send-welcome-message:120-126` (chat) | chat-tekst, aldrig kaldt |
| Advisor invitation / Rådgiver-invitation | INGEN (`manage-advisor` læser ikke `email_templates`) | ingen |
| Rapport-påmindelse (uden suffix) | INGEN (`TEMPLATE_NAMES` har kun de tre med suffix) | ingen |

Alle 14 blev opdateret i prod 8/9 kl. 09:31 til `noreply@theboardroom.dk`
(FØR: 13 med `noreply@boardroom.topix.dk`, 1 med `noreply@mail.topix.dk`).
Koden læser i øvrigt ikke feltet som afsender:
`send-notification-email:608-610` bruger kun `sender_name`;
`resolveSenderFromTemplate` (`send-invitation-email:61-67`,
`send-report-reminder:16-31`, `send-template-email:10-21`) overstyrer
fremmede domæner til `VERIFIED_FROM_EMAIL` med en warn.

### 2.2 Slået til — hvad afgør det, i rækkefølge

1. **Udløseren.** Crons (repoet, `cron.schedule`): `daily-report-reminder`
   09:00, `intro-session-reminder` 09:00, `process-notification-emails`
   */5, `send-monthly-digest` 08:00 d. 22., `event-reminders` 07:00,
   `generate-weekly-focus` 06:00 mandag (skriver kun notifikation),
   `fornyelsesvarsler` 11:00 (kun i prod, ikke i en migration),
   `indgangs-paamindelser` (manuel planlægning, ikke bekræftet). Fjernet:
   `send-pulse-reminder` (12/6), `daily-reflection-nudge` (1/9),
   `send-notification-email` */15 (10/8, dublet af job 8). Dødt:
   `process-email-queue` (funktionen slettet 8/9 — jobbet står i
   `20260402084424`). Prod-listen er sandheden (4c).
2. **Kodens egen gate:** tørkørsel som standard (`intro-reminder-cron`,
   `indgangs-paamindelser-cron`, `fornyelsesvarsel-cron`), dag-gate
   (report-reminder 7/15/20, pulse 10.), prioritet (kun
   `action_required`/`important`), ventetid (15 min / 240 min),
   `ADVISOR_EMAIL_DISABLED`, opt-out i `notification_email_prefs`, 5
   mails/dag/bruger (`MAX_EMAILS_PER_DAY`), kun kl. 07-20 dansk for
   kvote-udskudte.
3. **Skabelonens `enabled`** — kun tekstvalg.

### 2.3 Auth-mails

Seks typer (M20). Hook'en er Lovables `createAuthEmailHandler`
(`auth-email-hook:123-185`) med `from: "The Boardroom
<noreply@theboardroom.dk>"`, `senderDomain: "notify.theboardroom.dk"`.
Om Supabase Auth faktisk kalder hook'en, og om Lovable ellers sender
auth-mails fra sin egen standardafsender: **kræver opslag** i Lovable →
Users → Auth settings → Email. Hook'en logger ikke i `email_send_log`.

---

## 3. Særskilt

### 3.1 (spm. 8) Findes som kode, aldrig sendt — krydset mod loggens labels

Kode-labels (fuld liste): `report-reminder`, `notification-<type>` (typer:
report_review_ready, report_error, chat_reply, advisor_replied,
member_message, report_committed, milestone_completed,
pulse_checkin_received, weekly_focus_ready, community_opslag,
event_reminder, session_booked, alert_revenue_drop, alert_negative_cash,
alert_result_negative, alert_financial_summary), `notification-chat_aggregated`,
`session-booking-confirmation`, `intro-reminder`, `monthly-digest`,
`pulse-reminder`, `invitation`, `advisor-invitation`, `indgang-dag0`,
`indgang-dag14`, `indgang-dag25`, `indgang-dag31`,
`indgang-raadgiver-mangler-pris`, `fornyelse-varsel1`, `fornyelse-varsel2`,
`legat-welcome`, `legat-upgrade`, `template-test`, `system` (events).

Aldrig sendt IFØLGE KODEN (uafhængigt af loggen): K1 Velkomstbesked
(ingen kalder, og det er chat), K2 `weekly_focus_ready` (info), K3 de fire
rådgivertyper (advisor-mail fra), K4 `advisor_replied` (ingen writer), K5
`report_manual_entry`, K6 Lovables template-registry (tom), M15/M16/R1
indgangens fire + rådgivermailen (0 betalingslinks 7/9), M13
pulse-reminder (cron fjernet 12/6). Kræver prod for at bekræfte «aldrig»
i loggen: 4a (de 30 dage) og 4b (al tid).

### 3.2 (spm. 9) Sendes, men står i ingen skabelon eller fortegnelse

Alt uden for `email_templates`: M5 chat_aggregated, M6 community-opslag,
M7 event-påmindelser, M8 de fire alerts, M9 session_booked, M10
session-booking-confirmation, M11 intro-reminder, M12 monthly-digest, M15-M17
indgang og fornyelse, M18-M19 legat, R1, R2, T1, M20 auth. Det er 20+
labels mod 14 skabeloner — og `docs/email-flows.md` (22/7) beskriver kun
otte flows. Hvilke 18 loggen faktisk bærer: 4a.

### 3.3 (spm. 10) Kan sendes TO gange fra to veje

| # | mail | vej 1 | vej 2 | værn |
|---|---|---|---|---|
| D1 | 1:1-session betalt | M10 `session-booking-confirmation` direkte i `stripe-webhook:986` | M9 notifikation `session_booked` (`:950-960`, `important`) → mail-motoren efter 15 min hvis ulæst | ingen — to mails om samme betaling er koden, ikke en fejl i kørslen |
| D2 | invitation | Members.tsx `:749`/`:770`/`:1006`, CompanyInvitations `:190` (knapper, inkl. «gensend») | `import-application:277`, `sikrIndgangsInvitation:106` (webhook, 6 kaldesteder) | `sikrIndgangsInvitation` dedup'er på eksisterende invitation («fandtes allerede»); knapperne sender igen med vilje |
| D3 | ugodkendt rapport | M2 `report_review_ready` 4 t efter upload | M1 report-reminder i «godkend»-variant d. 7/15/20 (`send-report-reminder:352-370`) | forskellige labels, samme budskab |
| D4 | månedsdigest | cron d. 22. | admin-knappen «Send digest» (`EmailTemplatesView:754-766`) — funktionen har ingen dag-gate, så et klik sender til alle founders igen | ingen `idempotencyKey` i kaldet (`send-monthly-digest:314-322`) |
| D5 | notifikations-mail ved gentaget kørsel | motoren skriver `email_sent_at` efter succes (`:612-616`) | cronen kører hvert 5. min; ved fejl i stemplet sendes igen. Nyt 8/9: `idempotencyKey: notification-${notif.id}` (`:603`) — Lovable dedup'er, og `email_send_log`s unikke `sent`-indeks afviser rækken | delvist |
| D6 | fornyelsesvarsel | cron dagligt | stemplet `varsel_N_sendt_at` sættes kun ved succes; ved spærret modtager sendes forsøget hver dag (recon-fornyelsen §4) | stempel |
| D7 | prod-cron `process-notification-emails` */5 + repoets `send-notification-email` */15 | samme funktion to gange | */15 unscheduleret 10/8 | kræver prod (4c) |

---

## 4. KRÆVER PROD — SQL (kun SELECT)

```sql
-- 4a. Sidst sendt pr. label, 30 dage — udfylder kolonnen «sidst sendt»
select template_name,
       count(*)                                   as raekker_30d,
       count(*) filter (where status = 'sent')    as sendt,
       count(*) filter (where status = 'failed')  as fejlet,
       count(*) filter (where status = 'suppressed') as spaerret,
       count(*) filter (where is_test)            as test,
       max(created_at) filter (where status = 'sent' and not is_test) as sidst_sendt_rigtig,
       max(created_at)                            as sidst_forsoeg
from public.email_send_log
where created_at > now() - interval '30 days'
group by template_name
order by template_name;

-- 4b. Al tid: hvilke labels har NOGENSINDE sendt (krydses mod §3.1)
select template_name, min(created_at) as foerste, max(created_at) as seneste,
       count(*) filter (where status = 'sent') as sendt_i_alt
from public.email_send_log
group by template_name order by template_name;

-- 4c. Hvilke crons kører, og med hvilken body (dry_run!)
select jobid, jobname, schedule, active,
       (command like '%dry_run%')            as naevner_dry_run,
       (command like '%"dry_run": false%')   as sender_live,
       left(command, 200)                    as command
from cron.job
order by schedule, jobname;

-- 4d. De 14 skabeloner: navn, enabled, afsender, og om koden læser dem
select name, enabled, sender_name, sender_email, trigger_type, updated_at,
       case when name in (
         'Rapport-påmindelse (venlig)','Rapport-påmindelse (presserende)','Rapport-påmindelse (kritisk)',
         'Invitation til virksomhed','Velkomstbesked',
         'Notifikation: Ny besked fra rådgiver','Notifikation: Ny besked i chatten',
         'Notifikation: Rapport klar til gennemsyn','Notifikation: Rapport fejl',
         'Notifikation: Rapport godkendt','Notifikation: Milestone fuldført',
         'Notifikation: Pulse check-in modtaget','Notifikation: Ugens fokus klar')
         then 'læses af kode' else 'læses IKKE af kode' end as kode
from public.email_templates order by name;

-- 4e. Notifikationer der venter på mail lige nu, pr. type (motoren tager action_required/important)
select type, priority, count(*) as venter, min(created_at) as aeldste
from public.notifications
where email_sent_at is null and seen_at is null
group by type, priority order by type;

-- 4f. Rådgiver-secret og indgang: er der noget at sende til?
select count(*) as betalingslinks from public.company_betalingslink;
select beslutning, count(*), count(varsel_1_sendt_at) as varsel1, count(varsel_2_sendt_at) as varsel2
from public.company_fornyelse group by beslutning;
```

Uden for SQL, kræver opslag: `RAADGIVER_MAIL_TIL` sat? (secrets kan ikke
læses — kald `send-indgangs-betalingsmail` for en virksomhed uden pris og
læs loggen); auth-hook'en aktiv? (Users → Auth settings); Lovables egen
maillog for auth-mails (Cloud → Emails).

---

## Kilder læst (intet ændret)

supabase/functions: send-notification-email (12-30, 57-95, 155-175,
225-260, 352-440, 497-620), _shared/notificationEmailSelection.ts
(25-215), _shared/notificationWriter.ts, send-report-reminder (35-60,
100-120, 153-262, 268-300, 325-415), send-pulse-reminder (12-60,
100-125), send-monthly-digest (5-9, 69-120, 178-330), intro-reminder-cron
(1-30, 64-130, 170-236), indgangs-paamindelser-cron (1-63, 296-335),
_shared/{indgangsBetalingsmail.ts (29-54, 63-212), indgangsMail.ts,
fornyelsesMail.ts, opslagsMail.ts, managedEmail.ts, indgangsMailAfsendelse.ts,
sikrIndgangsInvitation.ts (95-120), indgangsFaktura.ts (197-207),
email-templates/*.tsx, transactional-email-templates/*},
fornyelsesvarsel-cron (85-90, 320-356), send-invitation-email (1-67,
163-200), manage-advisor (16-55, 352), create-legat-enrollment (230-292),
upgrade-legat-to-member (60-110), stripe-webhook (398-423, 803-872,
876-1000), send-template-email (7-95), send-welcome-message,
auth-email-hook (10-30, 95-185), handle-email-events (kun læst),
preview-transactional-email, extract-financial-data (1707-1747),
detect-financial-alerts (136-246), generate-weekly-focus (580-581),
notify-community-opslag (90-112), event-reminders (6-131),
notify-chat-reply (70-77), send-slack-chat-notification (69-81, 274-294),
send-slack-report-notification (36-78), run-company-agent (683-692),
nudge-report-no-reflection, legat-reminder-cron, monday-webhook (1-31,
56-80, 218-221), saet-indgangs-prisniveau (1-46).
supabase/migrations: alle `cron.schedule`/`unschedule` (20260327094748,
20260329192545, 20260330182519, 20260331063447, 20260402084424,
20260402084559, 20260611150000, 20260612090000, 20260810230000,
20260825233000, 20260901090000, 20260901110000, 20260901112000),
20260418124333, 20260226223456.
src: EmailTemplatesView.tsx (140, 443-454, 710-715, 754-785, 805-893),
Members.tsx (736-770, 996-1006), CompanyInvitations.tsx (175-192),
ConfigView.tsx (207-274), LegatView.tsx (165, 185), CompanyChatPane.tsx
(767), communityApi.ts (183-189), reportCommit.ts, ReportReviewDialog.tsx.
docs: email-flows.md (overskrifter), OVERLEVERING.md (fornyelseskæden,
indgangen), ~/Downloads/recon-fornyelsen-efter-opdateringen.md (§4).

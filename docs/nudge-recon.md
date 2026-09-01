# Nudge-recon — hvad puffer til medlemmet, på tværs (2026-09-01)
> Skrevet 2026-09-01. Øjebliksmåling — linjenumre og tal gælder den dag, ikke i dag.

Grundlag: main pr. denne recon, docs/email-flows.md (kortlagt 22/7 —
autoritativ for mail-kæden, med forbehold noteret nedenfor),
docs/chat-design.md C6, cron-migrationerne, deriveFocus. Målt 1/9:
Chat 88 %, Rapportering 56 %, Budget 41 %, Refleksion 29 %, KPI-mål
15 %, Aftaler 9 %; tolv virksomheder har aldrig lagt en fil op.
Fund, ingen forslag.

---

## 1. HVER mekanisme der puffer i dag

### Forsiden (in-app, ved besøg)

| Mekanisme | Udløser | Siger | Lander | Drift |
|---|---|---|---|---|
| Fokus-kortet (deriveFocus, 9 slots — se §4) | afledt af data ved sidevisning | "Upload dine august-tal" m.fl. | /reports, /chat, /pulse, #dine-aftaler … | I DRIFT |
| "Dine aftaler" | aktive opgaver + ét forslag | knapper (accept/udskyd/luk) | på stedet | I DRIFT |
| Tomtilstande + anerkendelseslinjen | fravær af data | "tomheden må aldrig blive '0 rapporter'" | — | I DRIFT |
| Ulæst-badges (AppSidebar/AppLayout/forside) | read_at/typefiltre | tal-badges | /chat | I DRIFT, men tre forskellige filtre (chat-recon-2 §3) |

### Chatten

| Mekanisme | Udløser | Siger | Drift |
|---|---|---|---|
| reflection-nudge (cron daily-reflection-nudge 09:00 UTC → nudge-report-no-reflection) | committet rapport >3 dage, ingen pulse for perioden, tildelt rådgiver | chat-besked MED RÅDGIVERENS sender_id ("Hej. Rapporten for {måned} er på plads…") + chat_reply-notifikation → mail efter 15 min uset | I DRIFT. Bemærk email-flows §3.5: samme persona-praksis som send-engagement-nudge blev NEDLAGT for ("damages trust") — policy-inkonsistensen står stadig |
| Agent-linjer (system·agent) | run-company-agent (nu kun via weekly focus/handlinger — chat-skrivning er blocklistet for alle triggere) | historiske analyser + ja/nej-feedback som ingen læser | chat-skrivning DØD (bevidst), historik synlig |
| welcome-beskeder | send-welcome-message (rådgiver-udløst) | velkomst | I DRIFT, men message_type 'welcome' kan aldrig markeres læst (C9, ikke rettet) |

### Mails og notifikationer (email-flows.md §1, med senere ændringer)

| Flow | Udløser | Drift |
|---|---|---|
| report_review_ready / report_manual_entry / report_error | upload → notifikation (action_required) → mail-motor efter 15 min uset | I DRIFT, fikset i PR #152 (dispose ved commit/slet) |
| report_reminder (daily-report-reminder 09:00 UTC) | manglende COMMITTEDE facts for forrige måned; eskalerer dag 7/15/20 | I DRIFT. Kendt kant: den der HAR uploadet men ikke godkendt, får stadig "din rapport mangler" (P6 i email-flows) |
| daily-reflection-nudge | se chatten ovenfor | I DRIFT |
| weekly_focus_ready | generate-weekly-focus (man 06:00 UTC + on-commit) → notifikation (important) → evt. mail | I DRIFT — parret med fokus-slot (d) |
| monthly-digest | d. 22. kl. 08:00 UTC (flyttet fra d. 5. i cron-oprydningen — email-flows' "d. 5." er forældet) | I DRIFT. Indhold nævner milestones ≤30 dage og ulæste beskeder |
| event-reminders (07:00 UTC) | kommende events, dedup pr. event+trin | I DRIFT (aktiveret 10/8) |
| notify-kpi-comment | rådgiver-kommentar på KPI | I DRIFT |
| send-pulse-reminder | — | DØD: unscheduled 20260612 (funktionen består) |
| intro-reminder-cron | fuldt medlem uden booket intro-session; 2 dage efter start, så månedligt | **I DRIFT — begge påstande om det modsatte er trukket tilbage 1/9.** Jobbet hedder `intro-session-reminder` i prod (jobid 249, `0 9 * * *`, aktivt) og har kørt siden 13/8. Fjorten virksomheder er markeret, og tretten af dem har en afsendt mail i email_send_log; kun Floren Engros fejlede ("Emails disabled for this project", dead letter 13/8). Kadencen virker: BRILLEVÆRK er markeret 21/8, Livja 25/8, Capture IT 26/8 — jobbet fanger nye løbende. MEN cron'en er en PROD-ZOMBIE: der findes ingen migration i repoet der schedulerer den, præcis som process-notification-emails og daily-circle-sync. Den kan ikke genskabes fra repoet hvis den forsvinder. Og den stempler FØR den ved om mailen kom ud: Floren Engros blev markeret som mindet uden at modtage noget, og ville først være fanget igen 12/9. Stemplet er nulstillet manuelt 1/9, så de fanges i næste kørsel. Slot-note: jobbet ligger 09:00 UTC — samme minut som daily-report-reminder og daily-reflection-nudge. Tre jobs i samme slot. |
| legat-reminder-cron, run-weekly-agent | — | DØDE: stadig Deno.cron-only |
| send-engagement-nudge | — | NEDLAGT med princip-begrundelse (persona) |
| Prod-only-zombier | process-notification-emails (*/5) og daily-circle-sync (03:00) fandtes i prod 22/7 uden repo-modstykke; intro-session-reminder (jobid 249, 0 9 * * *) fundet 1/9 som den tredje | P2 i email-flows. Klassen er nu bekræftet: prod bærer cron-jobs der ikke kan genskabes fra repoet. En fuld cron.job-optælling mod migrationshistorikken er ikke lavet. |

### Push og in-app-kanal

- **Web-push findes ikke.** AddToHomescreenPrompt (AppLayout) er PWA-installation, ikke push.
- **In-app-klokken (NotificationCenter) bor i AppSidebar** — den GAMLE skal.
  **Stort fund**: efter Hb-GO'erne har medlemmer INGEN synlig
  notifikations-klokke på forsiden, KPI, rapportering, budget,
  handouts eller chatten — kun på rest-siderne (/milestones, /pulse,
  /settings…). Konsekvens: `seen_at` sættes sjældent, og mail-motoren
  ("mail efter 15 min USET") eskalerer derfor OFTERE til mail end
  designet forudsatte. Hb-migreringen har stille gjort mail-kanalen
  mere støjende.

  **Dom 1/9: klokken genindføres ikke i Hb.** Målt på de rene
  visnings-typer (§5): en chat-notifikation ses i 90 % af tilfældene,
  en ugefokus-notifikation i 22 % — forskellen er ikke klokken, det er
  at chatten selv trækker medlemmet ind. En genindført klokke ville
  løfte tallene uden at løfte noget virkeligt — samme fejl som
  feedback-knappen (C13). En kanal der kun virker når brugeren
  allerede er på vej, er ikke en nudge.

### Rettelser efter måling

Reconens første udgave påstod at intro-påmindelsen aldrig havde kørt.
Det var forkert, og fejlen er lærerig: påstanden byggede på at der
ikke fandtes en migration i repoet. Fraværet i repoet er ikke det
samme som fravær i drift — prod har mindst tre cron-jobs uden
repo-modstykke. Cron-tilstand skal måles i `cron.job`, ikke udledes af
migrationshistorikken.

## 2. Konkurrerer de? Ja — målbart

Samme-dags-kollisioner findes by design:

- **Rapport-casen** (værst): et medlem der ikke har rapporteret d. 7.
  får report_reminder-MAILEN (09:00 UTC), fokus-slot (a) "Upload dine
  {måned}-tal" ved forsidebesøg, og digest d. 22. nævner hullet igen.
  Har de uploadet uden at godkende: reminder-mailen siger "mangler"
  (kanten fra P6) MENS fokus-slot (b) siger "Godkend" — to formuleringer
  af to forskellige opfattelser samme dag.
- **Weekly focus**: mandag 06:00 skriver kortet + notifikation ("Ugens
  fokus er klar") → evt. mail efter 15 min + fokus-slot (d) med SAMME
  titel + (før C2-sletningen også et chat-kort). Notifikation + fokus
  + mail om samme genstand.
- **Refleksion**: efter commit kan medlemmet samme uge få
  reflection-nudge-chat-beskeden (som "rådgiver"), chat_reply-mailen,
  ulæst-badgen OG fokus-slot (g) "Tag stilling til dine tal" — fire
  udtryk for én manglende pulse.
- **Aftaler**: forslag findes kun i "Dine aftaler" (bevidst, C6-linjen
  om én ting ad gangen) — det ENESTE spor uden mail/notifikation.

Ingen mekanisme kender de andres eksistens: der findes ingen fælles
kvote på tværs af mail-motor (5/dag), report_reminder (uden om
motoren) og digest (egen dagsdedup) — tre separate afsendere med hver
sin dedup.

## 3. Onboarding fra dag ét

- **handle_new_user** (signup-triggeren) opretter profil/company/invite-
  grene — ingen nudges i sig selv.
- **needsOnboarding-gaten** tvinger /onboarding-wizarden (navn, branche
  — dataindsamling, ikke oplevelse; konvergens §2.1 afgør dens skæbne i
  onboarding-epicen).
- **Onboarding-agentkørslen** (run-company-agent, trigger 'onboarding',
  første login for importeret virksomhed): siden 25/8 TØR som default —
  forslagene (2 milestones, 1 handling, welcome-headline i weekly
  focus) lander i agent_proposals og venter på rådgiver-godkendelse.
  Velkomst i chatten er "rådgiverens egen opgave" (send-welcome-message,
  manuel).
- **Intro-sessionen**: BookSessionView viser gratis intro, og
  påmindelsen kører (§1, rettet 1/9). Den er dermed platformens
  ENESTE fungerende led i en onboarding-sekvens — men den er også kun
  ét led: den minder om intro-sessionen og intet andet.
- **Guiden** (/guide) er tekst-manualen — gammel verden, afgøres i
  onboarding-epicen ("aldrig to onboardings").
- **Der findes ingen sekvens** i betydningen "dag 1 → dag 3 → dag 7":
  kun report_reminder-eskaleringen (dag 7/15/20 i MÅNEDEN, ikke i
  medlemskabet) og intro-reminderens døde "2 dage efter start".
  Sekvensmotor-reconen (docs/sekvensmotor-recon.md, 27/8) kortlagde
  netop legat (14 dage) + onboarding (30 dage) som kandidater til én
  delt motor — ikke bygget.

## 4. Rækkefølgen — deriveFocus ER husets eneste nedskrevne prioritering

Fokus-motoren (nextStep.ts:158-346), byggerækkefølge = prioritet:

| Prio | Slot | Betingelse | Begrundelse i koden |
|---|---|---|---|
| 1 | (a) missing-report | forrige måneds facts mangler | "udelukker (b) pr. datalogik" |
| 2 | (b) pending-approval | uploadet, ikke committet | — |
| 3 | (c) unread-messages, så unread-agent | ulæste | "rådgiver før agent" |
| 4 | (d) weekly-focus | uges kort ikke set | titlen matcher notifikations-kontrakten |
| 5 | (e) milestone-deadline ≤14 dage | alle kandidater, nærmeste først | tærskel arvet fra ActionCenter |
| 6 | (f) company-actions | aktive aftaler (+arv); forslag udeladt | "omtale i fokus, handling i sektionen" |
| 7 | (g) pulse | committet men ingen pulse | "rapport først, så pulse som stillingtagen" |
| 8 | (h) løftestang uden milestone | ét samlet punkt | "pr.-løftestang-spam undgås bevidst" |
| 9 | (i) tom netværksprofil | ask_me_about tom | "LAVEST prioritet: kun i en rolig uge" |

Implicit filosofi, læst ud af begrundelserne: **tal før samtale før
plan før profil** — og "rapport først" gentages to steder ((a)/(b)
øverst, (g) gated bag commit). Det matcher C6's foreløbige
observation ("afhængighed frem for tal: uden målte måneder er budget
meningsløst"). MEN: mails har sin EGEN rækkefølge (motorens
priority-felt: action_required > important), og de to hierarkier er
aldrig afstemt — fx er events (mail dagligt 07:00) slet ikke i
fokus-motoren, og aftaler (fokus/sektion) er slet ikke i mails.

## 5. Måles virkningen? Nej — kæden ender ved afsendelsen

- **Sendes**: email_send_log (autoritativ pr. mail), notifications
  (dedup_key, email_sent_at — med den kendte dobbeltbetydning, P3).
- **Ses — men pas på feltet**: `notifications.seen_at` har TO skrivere
  med to betydninger. Skriver 1 er `mark_notifications_seen`, kaldt når
  NotificationCenter ÅBNES — ægte visning, men alt-eller-intet (åbner
  man klokken, markeres samtlige usete). Skriver 2 er
  `dispose_report_notifications`-triggeren på financial_reports: ved
  sletning af en rapport sættes seen_at på dens notifikationer, fordi
  kravet bortfaldt — ikke fordi nogen så noget. Migrationen
  20260810240000 backfillede det historisk. Konsekvens for enhver
  andel læst ud af feltet: report-typernes seen_at er INFLATERET af
  sletning og oprydning; alle andres er DEFLATERET af at klokken
  forsvandt fra medlemmets flader ved Hb-GO'erne.

  Målt 1/9 på de rene visnings-typer, hvor kun skriver 1 findes:

  | type | antal | set |
  |---|---|---|
  | chat_reply | 260 | 90 % |
  | weekly_focus_ready | 54 | 22 % |
  | report_reminder | 46 | 13 % |
  | event_reminder | 31 | 6 % |

  Alle fire er medlemsvendte. Forskellen er ikke klokken — det er at
  chatten selv trækker medlemmet ind. En chat-notifikation ses fordi
  medlemmet går i chatten alligevel (88 % bruger den). En
  ugefokus-notifikation ses ikke, fordi intet bringer medlemmet hen
  til den.

  Øvrige set-signaler: weekly_focus.seen_at sættes af forsiden
  (markSeen); mark_messages_read for chat.
- **Klikkes**: INTET. Ingen UTM/klik-tracking i mail-CTA'er, ingen
  event-logging på fokus-kortets knapper, intet der kobler "reminder
  sendt d. 7." til "upload d. 8.". Nærmeste proxy: user_login_log
  (90-dages vindue i Members) + aktiveringsmålingen 27/8
  (docs/aktiveringsmaaling-27-august.md: "fjorten uden ét målt tal") —
  begge er øjebliksbilleder lavet i hånden, ikke instrumentering.
- B6's egen forskrift ("accept-raten skal observeres") har heller
  ingen måler endnu — kun rådataene (accepted_at).

## 6. De tolv der aldrig har uploadet — SQL

```sql
-- Hvem er de, hvornår kom de, logger de ind?
select c.id, c.name, c.created_at::date as oprettet,
  (select max(l.logged_in_at) from public.user_login_log l
   join public.company_members cm on cm.user_id = l.user_id
   where cm.company_id = c.id) as seneste_login
from public.companies c
where not exists (select 1 from public.financial_reports r
                  where r.company_id = c.id)
order by c.created_at;

-- Hvor mange påmindelser har de fået, af hvilken type?
select c.name, n.type, count(*) as notifikationer,
  count(*) filter (where n.email_sent_at is not null) as mail_haandteret,
  count(*) filter (where n.seen_at is not null) as set_i_app,
  min(n.created_at)::date as foerste, max(n.created_at)::date as seneste
from public.companies c
join public.company_members cm on cm.company_id = c.id
join public.notifications n on n.user_id = cm.user_id
where not exists (select 1 from public.financial_reports r
                  where r.company_id = c.id)
group by c.name, n.type
order by c.name, notifikationer desc;

-- Faktisk afsendte mails til dem (email_send_log er sandheden om sends;
-- tabellen har ingen user_id — koblingen går via recipient_email):
select
  c.name                                                  as virksomhed,
  c.created_at::date                                      as oprettet,
  count(e.*)                                              as mails,
  count(distinct e.template_name)                         as typer,
  min(e.created_at)::date                                 as foerste,
  max(e.created_at)::date                                 as seneste
from companies c
join company_members cm on cm.company_id = c.id
join auth.users u        on u.id = cm.user_id
left join email_send_log e
       on lower(e.recipient_email) = lower(u.email)
      and coalesce(e.is_test, false) = false
where not exists (
  select 1 from financial_reports r where r.company_id = c.id
)
group by c.name, c.created_at
order by count(e.*) desc;
```

(Bemærk report_reminder-flowets udvælgelse: "kun committed tæller" —
bestanden HAR fået dag-7/15/20-mails hver måned siden de kom ind,
medmindre opt-out.)

**Målt 1/9 — svaret på spørgsmålet:**

| virksomhed | oprettet | mails |
|---|---|---|
| Limo Group | 19/6 | 32 |
| TOFT ADMINISTRATION | 21/5 | 18 |
| TuaMea Jewelry | 28/3 | 18 |
| Friends & Fries | 4/3 | 18 |
| Homie Håndværkerservice | 20/5 | 14 |
| Studio Mini | 30/3 | 12 |
| Bastant Design | 28/3 | 12 |
| Coskun Holding | 16/3 | 6 |
| Alexander Lunds virksomhed | 31/8 | 4 |
| Startkørekort | 12/3 | 4 |
| **Stadio** | 12/3 | **0** |
| **Sebastian & Amalie** | 4/3 | **0** |
| **Regnskabsvikar** | 12/3 | **0** |

138 mails i alt til tretten virksomheder der aldrig har lagt en fil op.
Limo Group har fået 32 siden juni og skriver flittigt i chatten (23
beskeder) — men rapporterer ikke. **Mere post er ikke svaret; kæden
virker, beskederne kommer frem, de virker bare ikke.**

Og tre fik aldrig én eneste mail: Stadio, Sebastian & Amalie og
Regnskabsvikar — alle fra marts, alle blandt de fem der udløb i maj
uden nogensinde at få et tal ind. De er de eneste hvor mere
kommunikation kunne have gjort en forskel, og de er væk.

**Mailkæden er i øvrigt sund**, målt samme dag: 692 mails afsendt,
elleve endt i dead letter — ti af dem fra april, mest testadresser.
Hver mail logges to gange (pending ved kø, sent ved afsendelse), så en
naiv optælling af "status ≠ sent" ser ud som 50 % fejl og er det ikke.

Den nyeste i dead letter er værd at bemærke: 13/8, intro-reminder til
floren@mail.dk, "Emails disabled for this project". Det er samme dag
som fjorten virksomheder fik intro_reminder_last_sent_at sat — cron'en
markerede dem som mindet, og mindst én mail nåede aldrig ud. Hvor
mange af de fjorten der faktisk fik noget, er ikke afklaret.

## 7. Tekniske forudsætninger — hvad findes

- **notifications-tabellen**: dedup_key UNIQUE pr. user (idempotens),
  seen_at, email_sent_at (dobbeltbetydning, P3-anbefaling om
  disposed_at står åben), priority (action_required/important/…),
  type. Skrives af edge functions + writeNotificationToMany.
- **Mail-kæden**: enqueue_email (pgmq) → process-email-queue → Resend;
  send-notification-email som 15-min-fallback-motor med 5/dag-kvote,
  advisor-suppression, aggregering af chat-typer og vindue 07-20 dansk
  (efter #152). email_send_log/email_send_state.
- **Dedup**: dedup_key-konventioner pr. flow (event_reminder:{id}:{a|b},
  report_review_ready:{reportId} …) — pr. flow, IKKE på tværs.
- **Unsubscribe/præferencer**: profiles.notification_email_prefs
  (pr. kategori: report_reminders, monthly_digest, pr.-prioritet
  opt-out i motoren), email_unsubscribe_tokens + suppressed_emails.
  UI'et for præferencerne bor i Settings.tsx — GAMMEL verden, dvs.
  også uden Hb-hjem i dag.
- **Push**: findes ikke (ingen service worker-push, ingen tokens).
- **In-app**: NotificationCenter (AppSidebar) — intet Hb-modstykke.
- **Ingen fælles nudge-motor**: tre afsendere (motor, report_reminder,
  digest) med hver sin kvote/dedup; fokus-motoren og mail-hierarkiet
  er uafstemte; sekvenser findes ikke (sekvensmotor-reconen er
  grundlaget hvis de skal).

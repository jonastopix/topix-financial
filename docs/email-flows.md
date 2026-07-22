# Email- og notifikationsflows omkring rapportering

**Kortlagt**: 2026-07-22, kode-evidens fra main + PR #152 (`fix/report-review-email-flow`, merged 2026-07-22).
**Metode**: recon af `supabase/functions/`, `supabase/migrations/` (cron-definitioner), `src/lib/reportCommit.ts`, `src/pages/Reports.tsx`, `src/components/ReportReviewDialog.tsx` og `CompanyChatPane.tsx`, afstemt mod prod-observationer (email_send_log 08/7 + 22/7, cron.job-opslag).

> **Cron-forbehold**: cron-migrationer deployes manuelt i Lovable og kan afvige fra repoet. Prod-opslag 22/7 bekræftede repo-cronerne + **to prod-only jobs** der ikke findes i repoet: `process-notification-emails` (*/5) og `daily-circle-sync` (03:00). Se §Strukturproblemer.

---

## 0. Fælles infrastruktur (læses først)

**To lag**: (1) *producenter* skriver `notifications`-rækker og/eller enqueue'r mails direkte; (2) *afsendelseskæden* er `enqueue_email` (pgmq) → `process-email-queue` → Resend. Repo-migrationen (20260402084424) schedulerer `process-email-queue` hvert 5. sekund, men **jobbet findes IKKE i prod-cron-opslaget 22/7** — noget dræner køen på ~4-5 s (empirisk: pending→sent 00:00:07→00:00:11-12), men mekanismen er **uverificeret** (cron-forbeholdet ovenfor gælder; afklaring føjet til P2 i §4). `email_send_state.retry_after_until` er **kun** Resend-429-cooldown — den er IKKE midnats-mekanismen (afkræftet mistanke, se §Strukturproblemer pkt. 1).

**`notifications`-tabellen**: `dedup_key` UNIQUE per user (idempotens), `seen_at` (in-app set), `email_sent_at` (mail-siden "håndteret" — **dobbeltbetydning**, se §Strukturproblemer pkt. 4).

**`send-notification-email`** (cron `*/15`): mail-fallback-motoren. Udvælgelse: `email_sent_at IS NULL AND seen_at IS NULL AND priority IN (action_required, important) AND created_at < now()-15min AND type != report_reminder`, limit 50. Chat-typer aggregeres til én mail/bruger; alt andet var før PR #152 én mail per notifikation. Anti-spam: max 5 mails/dag/bruger. Advisors får aldrig mail herfra (`ADVISOR_EMAIL_DISABLED` — de har Slack). Opt-out per prioritet via `profiles.notification_email_prefs`.

---

## 1. Flow-for-flow

### 1.1 `report_review_ready` — "Dine tal er klar til gennemsyn"

| | |
|---|---|
| **Trigger** | Upload: `extract-financial-data` skriver notifikation når `resolve_report_commit_candidate` siger `eligible` (variant: `report_manual_entry:` dedup-nøgle når ekstraktion fejlede men dokumentet er finansielt). `priority: action_required`. Mail via send-notification-email-motoren. |
| **Udvælgelse** | Motorens fælles query (§0). Før PR #152: **ingen** join mod rapportens tilstand. Efter #152: batched join mod `financial_reports` (deleted_at, periode) + `financial_report_facts` (committed) via `_shared/notificationEmailSelection.ts`. |
| **Throttle/tidspunkt** | Normalt ~15-30 min efter upload. Over-kvote (5/dag): før #152 flush ved UTC-midnat-kvotereset = **kl. 02 dansk nat**; efter #152 kun kl. 07-20 dansk. |
| **Suppress/dispose** | `seen_at` (in-app set): JA, stopper. **Godkendelse**: før #152 kun frontend-best-effort (`clearReportReviewNotification`, RLS-scoped — advisor-commit rammer 0 rækker); efter #152 autoritativ server-gate på committed. **Sletning**: før #152 NEJ (rodårsagen til fejlsporet); efter #152 JA i begge ender. **Dublet** (to rapporter, samme company+periode): før #152 to mails; efter #152 én (nyeste vinder). |
| **Indhold** | "Dine tal er klar til gennemsyn" → CTA "Gennemgå mine tal →" → `/reports?reportId=…`. |

### 1.2 `report_error` — "Din rapport kunne ikke behandles"

Samme motor og mekanik som 1.1 (`action_required`, dedup per reportId). Efter #152 disposes den også når rapporten slettes — man skal ikke mindes om fejl i en fil man har fjernet. Indhold: "Prøv igen →" med eksport-vejledning.

### 1.3 `report_reminder` — "Din rapport for {periode} mangler" (daily-report-reminder)

| | |
|---|---|
| **Trigger** | Cron `daily-report-reminder` **09:00 UTC = 11:00 dansk sommertid** (ikke 09:00 dansk). Selvgater til dag **7 (venlig) / 15 (presserende) / 20 (kritisk)**. |
| **Udvælgelse** | Aktive companies med membership ≠ expired, hvor `financial_report_facts` **mangler** række for forrige måneds period_key. Kun **committed** tæller — en uploadet-men-ugodkendt rapport stopper IKKE påmindelsen (bevidst: reminderen presser mod godkendelse, ikke upload). Første medlem per company får mailen. |
| **Throttle** | Sender mail DIREKTE (uden om 15-min-motoren; skriver notifikation med `email_sent_at` sat straks så motoren ikke dobbeltsender). Ingen dagskvote-interaktion. Dedup per (company, periode, dag) via dedup_key. |
| **Suppress** | Opt-out: `notification_email_prefs.report_reminders === false`. `seen_at` er irrelevant (mailen sendes uafhængigt af in-app-state). Godkendelse (commit) stopper næste eskalationstrin; sletning er irrelevant (flowet kigger på fravær af facts). |
| **Indhold** | Eskalerende tone: "Husk at uploade…" → "…mangler stadig" → "Vigtigt: forsinket". CTA "Upload rapport" → `/reports`. |

### 1.4 `reflection-nudge` (daily-reflection-nudge) — refleksion mangler efter godkendt rapport

| | |
|---|---|
| **Trigger** | Cron `daily-reflection-nudge` **09:00 UTC = 11:00 dansk** (kræver `{"dry_run": false}` fra cron-body'en — default er tørkørsel). |
| **Udvælgelse** | Seneste committede periode ≤ 2 mdr. gammel, `committed_at` > 3 dage siden, ingen `pulse_checkins` for perioden, samtale har tildelt advisor, ikke allerede nudget for (company, periode). |
| **Mekanik** | Poster en **chat-besked med advisorens sender_id** (persona-tekst "Hej. Rapporten for {måned} er på plads…") + notifikation af type **`chat_reply`** ("Ny besked fra din rådgiver") → mail-fallback efter 15 min uset via motoren, aggregeret som var det en menneskelig besked. |
| **Suppress** | Pulse-check-in for perioden stopper fremtidige; `seen_at`/chat-læsning stopper mailen; idempotent per (company, periode). |
| **UX-flag** | Automatik der performer menneskelig kontakt fra advisorens navn — præcis den praksis `send-engagement-nudge` blev **nedlagt** for ("damages trust", se 1.8). Policy-inkonsistens. |

### 1.5 `weekly_focus_ready` — "Ugens fokus er klar"

Trigger: cron `generate-weekly-focus` mandag 06:00 UTC (08:00 dansk) **og** on-commit (`propagateReportCommit` invoker funktionen). Skriver notifikation (`important`, dedup per company+uge) til alle medlemmer → mail efter 15 min uset via motoren, under dagskvoten. Sletning/godkendelse: irrelevant (ikke rapport-bundet). Indhold: headline fra AI-analysen, deep link `/`.

### 1.6 `monthly-digest` — månedsopsummering

Trigger: cron `send-monthly-digest` d. 5. kl. 08:00 UTC (10:00 dansk); kan også trigges af advisor/admin fra UI. Direkte mail (uden om notifications). Udvælgelse: én founder per company (første medlem), membership ≠ expired, advisors udeladt. Dedup: max én per modtager **per dag** via email_send_log-opslag. Opt-out: `notification_email_prefs.monthly_digest`. Indhold: KPI-bevægelse (seneste to committede perioder), milestones ≤ 30 dage, ulæste advisor-beskeder, seneste agent-indsigt.

### 1.7 `report_committed` — "Ny rapport godkendt" (til advisors)

Trigger: `propagateReportCommit` → `send-slack-report-notification` → Slack + `writeNotificationToMany` til alle advisors (dedup per reportId). **Mail sendes aldrig** (advisor-suppression i motoren) — kanalen er Slack + in-app. Ingen støjrisiko mod medlemmer.

### 1.8 Nedlagte/retirerede flows

- **`send-engagement-nudge`**: hard-disabled i koden med begrundelsen at automatiske chat-beskeder fra advisorens user_id "creates false impressions of human contact and damages trust". (Kontrast: 1.4 gør præcis dette.)
- **`send-pulse-reminder`**: cron unscheduled via migration 20260612 (funktionen består, single-purpose, kan gentændes).
- **`notify-kpi-comment`** (`advisor_kpi_comment`, important, dedup per company+kpi+periode): mail via motoren — nærmeste naboflow, medtaget for fuldstændighed.

---

## 2. Jonas' mistanke: sendes `report_review_ready` EFTER godkendelse?

**JA — bekræftet med kode-evidens, i fire stier (alle før PR #152):**

1. **Advisor-commit**: `clearReportReviewNotification` kører i browseren med committerens JWT. RLS-policyen "Users update own notifications" tillader kun opdatering af egne rækker → når en advisor committer et medlems rapport, rammer suppress **0 rækker** (stille), og medlemmets pending notifikation mailes senere.
2. **"Erstat"-flowet** (`ReportReviewDialog.handleReplace`): den NYE rapports notifikation suppresses, men den GAMLE (soft-deletede) rapports notifikation blev aldrig disposet → mail om at gennemgå tal for en rapport der netop er erstattet og godkendt i ny form. *Dette matcher fejlsporet 22/7 empirisk.*
3. **Fire-and-forget-fejl**: suppress er non-blocking (`.catch(warn)`); netværksfejl eller lukket fane efter commit efterlader notifikationen pending.
4. **Kvote-udskydelse forstærker**: sti 1-3's overlevende notifikationer flushede ved UTC-midnat — deraf "natlige mails om allerede-godkendte tal".

Note: `commit_report_facts` sætter **ikke** `financial_reports.reviewed_at` — det felt er advisorens "markér som læst"-flag i chatten (`CompanyChatPane`). Godkendelses-sandheden er `financial_report_facts.source_report_id`. Enhver logik der bruger `reviewed_at` som godkendelses-proxy er forkert.

**Efter PR #152**: server-gaten disposer alle kandidater hvis rapport er committet/slettet/forsvundet, uanset hvilken sti der fejlede.

**Empirisk bekræftet (2026-07-22, korrigeret test — join mod `financial_report_facts.committed_at`)**: **60+ post-godkendelses-mails siden marts** — `report_review_ready`-mails sendt EFTER at rapportens periode var committet. Klassen var altså langt mere udbredt end fejlsporets to natlige mails antydede. Bulk-serier: **Brick Works 23-29/4** (op til 5 natlige mails i op til 6 på hinanden følgende nætter) og **Fjeldgaardshop 14-18/4**. 5-per-nat-mønsteret er kvote-mekanikken i aktion: dagskvoten (5) flushede ved hver UTC-midnat, og backloggen af forældreløse notifikationer drænede med 5/nat indtil den var tom. Afstemningen bekræfter sti-modellen ovenfor — ingen ukendt femte sti observeret.

**Levende bevis for fixet (2026-07-22, efter merge + deploy af PR #152)**: frontend-dispose ved sletning målt til **110 ms** (notifikationen markeret håndteret i samme øjeblik rapporten slettes), og server-gate-dispose bekræftet ved cron-kørslen **09:10:05Z** — kandidaten disposet uden mail. Begge ender af defence-in-depth verificeret i prod.

---

## 3. Strukturproblemer (fundet undervejs, på tværs af flows)

1. **Midnats-throttlen** (fixet i #152): dagskvoten i send-notification-email tælles i et vindue der nulstilles ved UTC-midnat (`setHours(0,0,0,0)` på UTC-server); over-kvote-notifikationer skippes uden markering → flush 00:00 UTC. Forstærket af at commit-suppress talte med i kvoten (`email_sent_at`-tælling), så aktive dage brændte kvoten uden reelle mails. `email_send_state.retry_after_until` var IKKE mekanismen.
2. **Dobbelt-cron-risiko**: prod kører både `process-notification-emails` (*/5, **findes ikke i repoet**) og `send-notification-email` (*/15). Empirien (én mail per rapport per nat) tyder på at */5-jobbet 404'er eller er inert, men det er uverificeret. Skal afklares i Lovable → Edge functions og deaktiveres/dokumenteres.
3. **Zombie-cron**: `daily-circle-sync` (03:00) kører mod den fjernede Circle-integration. Ren støj + fejllog. Deaktivering kræver prod-handling.
4. **`email_sent_at`-dobbeltbetydningen** (skrøbeligt designmønster): feltet betyder både "mail faktisk sendt" og "mail skal aldrig sendes" (commit-suppress, advisor-skip, opt-out, dispose). Konsekvenser: kvoten talte suppressions som sends (fixet i #152 ved at tælle mod email_send_log), og telemetri kan ikke skelne "sendt" fra "undertrykt". Varig løsning: eksplicit tilstand (fx `email_state: sent|disposed|suppressed` eller `disposed_at`-kolonne) — kræver migration, se anbefaling P3.
5. **Persona-inkonsistens**: reflection-nudgen (1.4) poster automatik som advisor-beskeder, samme mønster som engagement-nudgen blev nedlagt for. Enten er princippet fra 1.8 gældende, eller også er det ikke.
6. **UTC-vs-dansk-drift i cron-tider**: "09:00"-jobs kører 11:00 dansk sommertid, digest 10:00, weekly focus 08:00 — ingen af dem er valgt i dansk tid, og de forskydes ved DST-skift.

---

## 4. UX-vurdering (beslutningsgrundlag — ikke fixes)

### Værdiskabende
- **`report_review_ready` (én, frisk, for en levende rapport)**: kernen i produkt-loopet — upload → godkend → AI aktiveres. Høj værdi når den er singulær og rettidig.
- **`report_error`**: actionable, tidskritisk, lav frekvens. Behold.
- **`report_reminder` med eskalering**: driver den vigtigste medlemsadfærd. Værdifuld, men "kun committed tæller"-reglen betyder at et medlem der HAR uploadet og venter på hjælp stadig får "din rapport mangler" — det opleves som at systemet ikke så deres handling. Overvej en variant-tekst for "uploadet men ikke godkendt".
- **`monthly-digest`**: god kadence, egen opt-out, dagsdedup. Behold.

### Støj / "dumme" mails (før #152)
- **Mails om slettede rapporter** kl. 02 om natten: ren skade — underminerer tilliden til alle øvrige mails. (Lukket af #152.)
- **Dublet-mails for samme periode**: signalerer at systemet ikke ved hvad det selv har sendt. (Lukket af #152.)
- **Mails om allerede-godkendte tal** (sti 1-3 i §2): beder brugeren gøre noget de netop har gjort — den mest tillidsbrydende kategori. (Lukket af #152.)
- **Gråzone**: reflection-nudgen — værdifuld intention (refleksion øger udbyttet), men personaen er lånt. Hvis et medlem svarer "tak!" i chatten til en advisor der aldrig skrev beskeden, er tilliden i risiko.

### Det rene flow (mål-billede)
1. **Én** mail ved klar-til-review per (company, periode) — nyeste rapport vinder.
2. **Intet** derefter hvis godkendt eller slettet — uanset hvem der godkendte/slettede og fra hvilken flade.
3. **Én** venlig reminder efter X dage hvis hverken godkendt eller slettet (i dag delvist dækket af dag-7/15/20-eskaleringen — overvej at forankre den i dage-siden-upload i stedet for dag-i-måneden).
4. **Alle** udskudte/batch-mails i menneskelige vinduer (07-20 dansk); kun friske, transaktionelle mails døgnet rundt.
5. Max **én** rapport-relateret mail per bruger per dag (digest-princip ved kollision).

### Prioriteret anbefalingsliste
| Prio | Anbefaling | Status/omkostning |
|---|---|---|
| **P1** | Merge + deploy PR #152 | UDFØRT 22/7 — merget, deployet (eksplicit build-chat-deploy) og bevist i prod: frontend-dispose 110 ms, server-gate-dispose ved cron 09:10:05Z uden mail. |
| **P2** | Afklar `process-notification-emails` (*/5) i Lovable; deaktivér dublet-afsender eller dokumentér som inert. Deaktivér `daily-circle-sync`. Afklar også hvad der faktisk dræner `transactional_emails`-køen (~4-5 s empirisk) — `process-email-queue` findes ikke i prod-cron-opslaget 22/7, se §0. | Prod-handling, 15 min |
| **P3** | Migration: eksplicit `email_state`/`disposed_at` på notifications — afliv `email_sent_at`-dobbeltbetydningen. Ærlig kvote + telemetri. | Lille migration + motor-tilpasning |
| **P4** | Flyt cron-tider til bevidste danske tidspunkter (reminder/nudge til dansk morgen; DST-robust). | Cron-ændring i Lovable |
| **P5** | Policy-beslutning om reflection-nudgens persona (system-afsender med advisor-signatur vs. status quo) — jf. princippet der nedlagde engagement-nudgen. | Beslutning + lille ændring |
| **P6** | `report_reminder`-variant for "uploadet men ikke godkendt" ("Du mangler kun at godkende…"). | Lille funktionsændring |

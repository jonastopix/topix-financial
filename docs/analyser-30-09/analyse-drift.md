# Driften — stille fejl (analyse 30/9-2026)

Kilde: `origin/main` @ `49d5218` (#1156), læst i `/home/claude/wt-drift`. KUN kodelæsning og OVERLEVERING. **Intet er målt i prod.** Alt om prod-tilstanden står som «umålt» og afgøres af SQL'en i §4. SQL'en er kørt mod en lokal mock med samme kolonner. Den er altså syntaks-prøvet, ikke prøvet på prod-data.

Forkortelser: **kald_edge-standard** = 30 s (`20260910180000_kald_edge.sql:130-134`). **Vagten** = `vagt_cron()` 9. version (`20260916170000_vagtens_samlemail.sql`). **Alarm** = mail til `driftModtager()` (`_shared/driftModtager.ts:17`, jonas@theboardroom.dk).

---

## 0. Top-10 — prioriteret, med rettelse

| # | Fund | Hvorfor det er stille | Rettelse (fil · hvad · størrelse) |
|---|---|---|---|
| 1 | **Vagten melder ikke rødt, når kun ét job fejler.** Den melder rødt ved `v_jobs_ikke_200 >= 2` (`20260916170000_vagtens_samlemail.sql:369`) eller ved en SQL-fejl i cron (:375). Et enkelt job, der svarer 500 eller får timeout ved hver kørsel, giver **grøn** og ikke engang gul. Fx `ansoegning-rykker-cron` (`index.ts:315` svarer 500 ved `ok=false`), `indgangs-paamindelser` (`:609`) og `klokke-mail` (`:329`). | Det er husets eneste generelle vagt, og den tæller jobs, ikke fejl. | Ny migration med **10. version**: rødt ved ≥ 1 job med ikke-200 i to kørsler i træk (eller ≥ 1 for døgnjobs), gult ved ét enkelt. Tallene i `tal` beholdes. Kør `SELECT * FROM public.vagt_cron()` bagefter (DEL 4). **S** |
| 2 | **Fejl i enkelte rækker giver HTTP 200.** Kun 6 af 22 edge-crons har en alarm (`klaviyo-gensend`, `klaviyo-profil`, `meta-send`, `ga-send`, `klokke-mail`, `webinar-mail`). De andre tæller `fejlet++`/`fejl.push`, skriver til `console.error` og svarer 200: `indgangs-paamindelser-cron/index.ts:414-420` («FAKTURA I HÅNDEN»: dag 31-faktura kunne ikke sendes) og `:461-472` («KRITISK»: mail sendt uden stempel); `fornyelsesvarsel-cron/index.ts:373-398` (samme to); `slet-medlemsdata-cron/index.ts:164-176` (sletning fejlede, `ok` forbliver true); `ansoegning-rykker-cron/index.ts:215-236` (`fejlet`/`fejl`, `ok` forbliver true); `onboarding-rytme`, `intro-reminder-cron`, `legat-reminder-cron` (`fejl[]`); `event-reminders/index.ts:117-118` (fejl i RPC sluges). | Vagten ser kun statuskoden. Rækkefejlene står kun i function-loggen, som ingen læser. Det gælder penge (faktura), persondata (sletning) og ansøgere. | Ny `_shared/cronAlarm.ts`, generaliseret fra `_shared/webinarMailAlarm.ts`: drift-klokke plus mail til `driftModtager()`, dedup pr. (job, dansk DATO) jf. lærestreg (k). Kaldes når `fejlet > 0`, `faktura_i_haanden.length > 0` eller et «KRITISK»-stempel fejler. Først i `indgangs-paamindelser-cron`, `fornyelsesvarsel-cron`, `slet-medlemsdata-cron` og `ansoegning-rykker-cron`, derefter resten. Nyt værn i stil med `klokkeMail.guard`: en cron med `fejlet` i sit svar skal kalde alarmen. **M** |
| 3 | **Dublet ved timeout i `ansoegning-rykker`.** Timeouten er 30 s (`20260918210000_ansoegning_rykker_cron.sql`, `kald_edge(…, 30000, 900000)`), der er intet tidsbudget, og `BATCH = 50` (`ansoegning-rykker-cron/index.ts:66`). Alle rykkere, der forfalder uden for vinduet, udskydes til vinduets start (`_shared/rykkerkoe.ts:319`), så de samles i én kørsel kl. 07. Mailen sendes (`_shared/ansoegningMotor.ts:571`) FØR `status: "sendt"` (`:591-593`). Afbryder pg_net kørslen imellem, står rækken stadig som `planlagt` og sendes igen 15 min senere. Dagsreglen (`sendtIDag`, `index.ts:87-106`) læser kun rækker med `sendt` og beskytter derfor ikke. Den eneste bremse er Lovables `idempotency_key` (`_shared/managedEmail.ts:133`), og om Lovable dedupliserer på den, er **umålt**. | Samme klasse som webinarmail-dubletten: ekstern afsendelse før sporet, ingen reservation af rækken. | I `ansoegning-rykker-cron/index.ts` og `_shared/ansoegningMotor.ts`: (a) `BUDGET_MS = 20_000` før hver række (som `meta-send-cron/index.ts:438`) og resten markeres «udsat»; (b) **reservér rækken før afsendelse**: `update status='sender' where id=… and status='planlagt' returning`, og nul rækker betyder spring over. Kræver at `status`-CHECK'en udvides med `sender` (migration KØRT før udrulning). Tjek også, at `sendSvarMailNu` (`ansoegningMotor.ts:610`) bruger samme reservation, for i dag kan den og cronen sende samme række samtidig. **M** |
| 4 | **`webinar-mail-cron` kan overskride sin egen timeout.** Budgettet på 45 s tjekkes FØR en mail (`webinar-mail-cron/index.ts:122`, `:323`). Derefter kan ics-hentningen tage 8 s (`_shared/mimeInvitation.ts:66`, `index.ts:334`), Mailgun 10 s (`_shared/mailgunAfsendelse.ts:65`, `index.ts:360`) og så kommer insert i sporet (`:373`). Det giver op til ca. 63 s + insert mod en timeout på **60 s** (`20260922172000_webinar_mail_cron.sql:62`). Afbrydes kørslen efter Mailguns 200, findes der ingen ok-række, og det unikke indeks kan ikke fange dubletten. Næste slot sender igen (Mailgun har ingen idempotens). #1152 hævede loftet til 1000/time, og «~80–150 mails pr. kørsel» (`docs/opstart-30-09.md` B) betyder, at kørslerne nu jævnligt løber helt ud til budgettet. | Det er præcis klassen fra 29/9, bare udløst af tid i stedet for probation. | `webinar-mail-cron/index.ts:122`: `BUDGET_MS = 60_000 − INVITATION_TIMEOUT_MS − TIMEOUT_MS − 7_000 = 35_000`, og regnestykket skal stå i kommentaren. Værn: `BUDGET_MS + 8000 + 10000 < jobbets timeout` (dom i `webinarMail.guard`). Holder 10 s margin ikke, er den varige løsning en `sender`-række før afsendelse. **S** (eksplicit deploy) |
| 5 | **Alarmkanalen er den samme som den, der fejler, og ingen holder øje med vagten selv.** Alle alarmer går gennem Lovables mail-API (`sendManagedEmail`), og kaldet har ingen timeout fra vores side (`_shared/managedEmail.ts:122-137`, ingen `AbortSignal`). Modtageren jonas@theboardroom.dk ligger på afsenderens domæne. Spærres den, som kontakt@ blev 18/9 (OVERLEVERING DEL 2 §13), forsvinder alle alarmer i tavshed. Stopper `vagt-cron` eller pg_cron helt (Lovable-vedligehold 15/9), opdager intet det: vagten tæller sine egne fejl kun i `tal` (`:291`), og intet sammenligner med «forventet sidste kørsel». | En alarm, der kun kan lyde når platformen virker, er ikke en alarm. | (a) **Ekstern puls:** GitHub Actions `schedule` hver time. Den kalder en ny Bucket B-function `drift-puls`, der kun svarer med `max(tid)` og `dom` fra `cron_vagt_log`. Workflowet fejler, hvis `tid` er ældre end 90 min eller `dom = roed`, og så mailer GitHub selv uden om Lovable. (b) `AbortSignal.timeout(15_000)` i `managedEmail.ts`. **M** |
| 6 | **PostgREST-loftet på 1.000 rækker klipper stille.** `send-report-reminder/index.ts:328-331`: `.limit(10000)` på `financial_report_facts` (measured) og `financial_reports`, og `.limit(5000)` på `company_members`. `max-rows` giver 1.000 uden fejl (DEL 4, #929). En virksomhed med målte tal ser så ud til at mangle dem og får den forkerte påmindelse. `onboarding-rytme/index.ts:140-144`: `company_members` ascending `.limit(5000)`, så det er de **nyeste** medlemmer, dem rytmen er til for, der falder fra, når tabellen passerer 1.000. | Det er den kendte fælde, men her står den med et tal over 1.000, der ligner et loft uden at være det. | Brug `hentAlleSider`, eller et `distinct company_id` gennem et RPC (`select distinct company_id … where data_basis='measured'`). Et nyt værn skal fange `.limit(n)` med n > 1000 uden `.range`. Antal rækker i dag: **umålt** (SQL §4, sektion 8). **S** |
| 7 | **Intet opdager et job, der ikke kører.** Vagten ser kun de sidste 60 min og kun svar, der findes. Et job, der er slukket, afplanlagt eller aldrig er blevet planlagt, er usynligt. Kendte kandidater: `klaviyo-hentning` («findes ikke i prod», `docs/marketingmotoren.md:385`), `indgangs-paamindelser` (120 s-migrationen `20260919160000` har «IKKE KØRT» i hovedet), og `fornyelsesvarsler`, `slet-medlemsdata` og `onboarding-rytme`, der **kun findes i prod** (ingen migration har deres faktiske form). Kun `meta-annoncer` har sin egen vagt (`meta_hentning_vagt`). | Merge planlægger intet, og CLAUDE.md siger, at repoet ikke er sandheden om cron. | (a) Kør SQL'en (§4). (b) Ny tabel `cron_forventning(jobname, maks_stilhed interval)` og vagtens 10. version: rød, når seneste `succeeded` for et forventet job er ældre end `maks_stilhed`, eller når jobbet mangler. (c) Bogfør de tre prod-only jobs som migrationer med ordret prod-kommando (`KØRT`-hoved). **M** |
| 8 | **Meta-tokens udløber uden varsel.** `meta-annoncer-cron` læser `META_ADS_TOKEN` og ellers nødnavnet `META_CAPI_TOKEN` (`_shared/metaAdsToken.ts:53-56`). `meta-send-cron` læser `META_SEND_TOKEN` (`_shared/metaSendAfsendelse.ts:28`). Et bruger-token udløber, og data access udløber efter 90 dage. I dag ses det først EFTER fejlen: klokken fra functionen, `meta_hentning_vagt` næste morgen og alarmen fra meta-send. Om tokenerne er system user-tokens, der aldrig udløber, er **umålt**. | Annoncetallene og Conversions API stopper en nat, og nyt token kræver en godkendelsesrunde hos Morten (`metaAdsToken.ts:11-12`). | I `meta-annoncer-cron`: dagligt `GET /debug_token` for begge tokens, `expires_at` og `data_access_expires_at` gemt i `meta_hentning.tal`. `meta_hentning_vagt` giver en klokke 14 dage før. Ryd samtidig nødnavnet. **S** |
| 9 | **`indgangs-paamindelser` (dag 31 = faktura + mail).** Jobbet kører i prod med kald_edge-standarden på 30 s, medmindre `20260919160000` er kørt (hovedet siger IKKE KØRT, **umålt**). Stripe-kald uden timeout (`_shared/indgangsFaktura.ts:148`, `:161`) og mail **uden** `idempotencyKey` (`sendIndgangsMailMedUdfald`, `index.ts:431-438`) før stemplet (`:461`). En kørsel, der afbrydes mellem mail og stempel, giver samme dag N-mail igen næste dag. Webinarholdet 13/10 skriver under samme aften og rammer derfor dag 31 samme dag. | Kunden får to rykkere. Fakturaen er dog idempotent (Idempotency-Key, `indgangsFaktura.ts:147`). | (a) Mål jobbets kommando (SQL sektion 1). Mangler `120000`, køres `20260919160000`. (b) `idempotencyKey: \`indgang-dag${trin}-${company_id}\`` i `_shared/indgangsBetalingsmail.ts`. Samme for `fornyelse-${varsel}-${company_id}-${contract_end_date}` i `fornyelsesvarsel-cron`. (c) `AbortSignal.timeout(10_000)` på Stripe-kaldene. **S** |
| 10 | **Låse og tørkørsler, der står forkert, ser grønne ud.** Låsene er fail-closed: `meta_send_aktiv` (false 21/9), `klaviyo_afmeld_aktiv`, `ga_send_aktiv` og `webinar_mail_aktiv`. Et job, der kører 11 gange i timen og svarer 200 «LÅST», er grønt i vagten. Omvendt er `send-notification-email`, `send-report-reminder`, `event-reminders` og `generate-weekly-focus` **LIVE som standard** (ingen tørkørsel uden `{"dry_run":true}`), så et manuelt `kald_edge('<navn>')` i SQL editor sender rigtigt. | Et beslutningsflag, der ingen steder er synligt, bliver glemt. Lærestreg 22/9: «en lås, man glemmer at have sat, ikke er en lås». | Vagtens `tal` og forsidens driftlinje viser de fire låse (sektion 5 i SQL'en er formen). Tørkørsel som standard i de fire live-functions, når de alligevel røres. **S** |

---

## 1. Kortlægning — alle cron-jobs i repoet og i OVERLEVERING

Kilder: timeout og kommando er repoets form. Prod-formen er **umålt** for alle jobs, SQL sektion 1 måler den. «Fejl opdages» = hvad der sker uden et menneske.

| Job (skema) | Kilde | Kalder | Timeout | Function-standard | Idempotens / halv kørsel | Fejl opdages af |
|---|---|---|---|---|---|---|
| `vagt-cron` (7 * * * *) | 20260909234500 | `vagt_cron()` SQL | — | — | én række i `cron_vagt_log` | **intet** hvis den selv fejler (kun `tal.vagt_selv_fejlet_60m`) |
| `cleanup-stale-processing-reports` (*/5) | 20260901112000 | SQL-funktion | — | — | ren SQL, atomisk | vagt (SQL-fejl = rød) |
| `process-notification-emails` (*/5) | 20260901112000 (rå `net.http_post`) | `send-notification-email` | repo: **5 s** (pg_net); prod umålt | LIVE | mail FØR stempel (`index.ts:736`, `:1054`); samlemail har `idempotencyKey` (`_shared/samlemail.ts:593`), chatmails ikke påvist | vagt kun ved ≥ 2 jobs; køen står stille → rød (`:382`) |
| `daily-report-reminder` (0 9) | 20260327094748 (prod-form afviger, `kald_edge.sql:77`) | `send-report-reminder` | umålt | LIVE | notifikation `dedup_key` (`:444-477`); mailen uden nøgle | 500 kun ved exception (`:512`) |
| `generate-weekly-focus` (0 6 * * 1) | 20260329192545 (afviger) | `generate-weekly-focus` | 150 s planlagt, umålt | LIVE | AI pr. virksomhed, budget i functionen | 500 ved exception |
| `event-reminders` (0 7) | 20260810230000 | `event-reminders` | umålt | LIVE | `notifications UNIQUE(user_id, dedup_key)` | RPC-fejl slugt (`:117-118`) |
| `event-reminders-time` (*/15) | 20260910200000 | `event-reminders` `{vindue:time}` | 30 s | LIVE | som ovenfor | som ovenfor |
| `intro-session-reminder` (0 9) | 20260901112000 | `intro-reminder-cron` | umålt | tørkørsel | mail før `intro_reminder_last_sent_at` (`:219-239`), ingen nøgle | `ok:false` kun ved opslag |
| `onboarding-rytme` (prod `0 8`, repo `15 9`) | kun prod | `onboarding-rytme` | prod: kald_edge-standard (DEL 2) | tørkørsel | stemplet = `email_send_log`-rækken (`:23-26`) | `ok:false` kun ved opslag; `.limit(5000)` (§0 #6) |
| `legat-reminder-cron` (30 9) | 20260910210000 | `legat-reminder-cron` | 30 s | tørkørsel | eksistens-tjek i `messages` (`:98-112`) | `fejl[]` med 200 |
| `report-review-cron` (20 5) | 20260910230000 | `report-review-cron` | 30 s | tørkørsel | notifikation-dedup | 500 ved exception |
| `opgave-udloeb` (0 4), `agentforslag-udloeb` (5 4), `opgave-forfald` (10 4), `agent-runs-opbevaring` (0 5), `webinar-delinger-opbevaring` (52 4) | 20260901090000 / 20260911000000 / 20260911010000 / 20260825233000 / 20260922021000 | ren SQL | — | — | én sætning, atomisk | vagt (SQL-fejl) |
| `ansoegning-rykker` (*/15 5-15 * * 1-5) | 20260918210000 («IKKE KØRT»-hoved, men i drift jf. CLAUDE.md) | `ansoegning-rykker-cron` | 30 s | tørkørsel | **mail før `sendt`** (§0 #3); `idempotensnoegle` til Lovable (umålt effekt) | 500 kun ved opslag; rækkefejl 200 |
| `indgangs-paamindelser` (0 10) | 20260919160000 («IKKE KØRT») / prod 544 | `indgangs-paamindelser-cron` | prod: 30 s (16/9) eller 120 s (umålt) | tørkørsel | Stripe idempotent; mail uden nøgle før stempel (§0 #9) | rækkefejl 200, «FAKTURA I HÅNDEN» kun i log |
| `fornyelsesvarsler` (0 11) | **kun prod** (545) | `fornyelsesvarsel-cron` | 30 s (målt 15/9) | tørkørsel | mail uden nøgle før stempel (`:366-391`) | rækkefejl 200, «KRITISK» kun i log |
| `slet-medlemsdata` (0 12) | **kun prod** (546) | `slet-medlemsdata-cron` | umålt | tørkørsel | `data_slettet_at` sidst = genoptagelig (`:31-34`) | `fejl[]` med 200 — **persondata** |
| `klaviyo-hentning` (*/15) | 20260920100000 (**ikke kørt**, `marketingmotoren.md:385`) | `klaviyo-hentning-cron` | 60 s | tørkørsel | — | — (findes ikke) |
| `meta-annoncer` (33 3) + `meta-hentning-vagt` (33 4) | 20260921090000 (kørt 20/9, OVERLEVERING §2) | `meta-annoncer-cron` / SQL | 60 s | tørkørsel | upsert | klokke fra function + `meta_hentning_vagt` → klokke-mail |
| `stille-klokker` (30 4) | 20260921100000 (566) | `stille-klokker-cron` | 60 s | tørkørsel | notifikation-dedup | 500 ved opslag |
| `klaviyo-gensend` (1-59/5) | 20260921160000 (567) | `klaviyo-gensend-cron` | 60 s | tørkørsel | Klaviyo `unique_id` | **alarm** |
| `klaviyo-profil` (17 *) | 20260921200000 (571) | `klaviyo-profil-cron` | 60 s | tørkørsel | profil-upsert | **alarm** |
| `meta-send` (11/t) | 20260921235500 (568) | `meta-send-cron` | 60 s, budget 45 s + 8 s | tørkørsel + lås | Meta dedup på `event_id`; spor-upsert | **alarm** (1/døgn) |
| `ga-send` (6/t) | 20260922011000 (569) | `ga-send-cron` | 60 s, budget 45 s + 8 s | tørkørsel + lås | spor EFTER kald (`:215`); Google dedupliserer ikke | **alarm** (1/døgn) |
| `klokke-mail` (4-59/15) | 20260922071000 (572) | `klokke-mail-cron` | 60 s, intet budget | tørkørsel | `mailet_at` efter afsendelse + `idempotencyKey` | **alarm** |
| `webinar-mail` (11/t) | 20260922172000 (573) | `webinar-mail-cron` | 60 s, budget 45 s | tørkørsel + lås | unikt indeks på ok-rækker; spor EFTER (§0 #4) | **alarm** (`_shared/webinarMailAlarm.ts`) |
| `certifikat-klokke` (15 6) | 20260929200000 (574) | `certifikat-klokke` | 60 s | tørkørsel | notifikation-dedup | 500 ved opslag |
| **Afplanlagt i repoet:** `send-monthly-digest`, `send-pulse-reminder`, `daily-reflection-nudge`, `process-email-queue`, `send-notification-email`, `daily-circle-sync`, `weekly-engagement-nudge` | 20260810230000, 20260612090000, 20260901110000, 20260913190000 | — | — | — | — | SQL sektion 2 fanger dem, hvis de står endnu |
| **Function uden job:** `berig-virksomheder` («ikke planlagt» 15/9), `klaviyo-afmeld-bagud` (manuel), `ewebinar-import` (manuel) | — | — | — | — | — | — |

Låse i `app_config`, alle fail-closed: `webinar_mail_aktiv`, `meta_send_aktiv`, `ga_send_aktiv`, `klaviyo_afmeld_aktiv` (`meta-send-cron/index.ts:166`, `ga-send-cron/index.ts:106`, `webinar-mail-cron/index.ts:200`, `klaviyo-afmeld-bagud/index.ts:109`).

---

## 2. Alle fund

### (1) Jobs uden alarm ved fejl
- **Vagten melder kun rødt ved ≥ 2 jobs**: `20260916170000_vagtens_samlemail.sql:369` (§0 #1).
- **Rækkefejl giver 200** i 16 af 22 edge-crons (§0 #2). Linjerne er `indgangs-paamindelser-cron/index.ts:414-420`, `:461-472`; `fornyelsesvarsel-cron/index.ts:373-398`; `slet-medlemsdata-cron/index.ts:164-176`; `ansoegning-rykker-cron/index.ts:215-236`; `legat-reminder-cron/index.ts:65`, `:90-146`; `event-reminders/index.ts:117-118`.
- **Vagtens titel indeholder tal** (`:461`, «%s cron-jobs … (%s; %s timeouts)»), men dedup sker på titlen (`:466-470`). Hver time med nye tal giver en ny klokke og en ny mail. Det er samme støj som lærestreg (k).
- **Vagtens join-vindue og «undervejs»-frist er 2 min** (`:145`, `:256`). Det bygger stadig på pg_nets 5 s. `kald_edge.sql:113-126` bad om `ceil(loft/60000)+1 = 4 min`, og det er ikke gjort. Mange jobs har nu 60–120 s timeout og deler næsten hvert minut (listen i `20260922172000:13-22`), så et svar kan blive tilskrevet det forkerte job. `jobs_ikke_200` kan dermed både under- og overtælle.
- **Ingen vagt for vagten** og ingen puls uden for platformen (§0 #5).
- **Alarmen og det, den melder om, deler kanal** (Lovable-mail), og modtageren ligger på samme domæne (§0 #5; `_shared/driftModtager.ts:17`).
- **Webhooks uden liv-tjek** (ikke cron, men samme klasse): Stripe 500 fejler stille (DEL 4). `ewebinar-webhook` og `calendly-webhook`: intet opdager, at tredjeparten holder op med at sende, fx hvis en abonnementsstatus bliver `disabled`. **Umålt.**
- **`cron.job_run_details` ryddes ikke** af noget job (DEL 4: «pg_cron rydder aldrig selv»). Med ca. 80 kørsler i timen bliver det ca. 1.900 om dagen. Vagten læser gennem `runid`, så den tåler det, men tabellen vokser igen mod 10/9-tilstanden.

### (2) Kan dobbeltudføre en skrivning eller mail ved retry eller timeout
Mønstret: ekstern afsendelse → pg_net-timeout afbryder functionen (DEL 4, målt 3/9 og 10/9) → sporet eller stemplet skrives ikke → næste kørsel sender igen.
- `webinar-mail-cron`: budget + ics + Mailgun > 60 s (§0 #4). Mailgun har ingen idempotens.
- `ansoegning-rykker-cron`: 30 s, intet budget, 50 rækker, mail før `sendt` (§0 #3). Der er også en kapløbsrisiko med `sendSvarMailNu` (`_shared/ansoegningMotor.ts:610-632`), fordi ingen af dem reserverer rækken.
- `send-notification-email`: mail før stempel (`:736`, `:1054`). Prod-timeouten er **umålt**: repoet siger rå `net.http_post` = 5 s, og 10/9 blev hvert andet kald afbrudt. Samlemailen kl. 17 kan være op til 500 rækker (`:260`, `:274`).
- `indgangs-paamindelser-cron`, `fornyelsesvarsel-cron`, `intro-reminder-cron`, `send-report-reminder`, `onboarding-rytme`: mail **uden** `idempotencyKey` før stemplet. Grep: kun `ansoegning-rykker`, `klokke-mail`, `webinar-mail`, `meta/ga-send`, `klaviyo-*`, samlemailen og `stripe-webhook` bærer en nøgle.
- `ga-send-cron`: spor efter kaldet (`:215`), og Google dedupliserer ikke. En afbrudt kørsel giver dobbelthændelser i GA. Det har lav betydning.
- **Lovables `idempotency_key`** (`_shared/managedEmail.ts:88`, `:133`) er husets eneste dedup for alle Lovable-mails. Om Lovable faktisk dedupliserer, er **umålt**. Måling: send samme nøgle to gange til jonas@ og tæl mails.
- Idempotente pr. konstruktion (intet fund): notifikationer (`UNIQUE(user_id, dedup_key)`), `slet-medlemsdata` (stempel sidst), Stripe-fakturaen (Idempotency-Key), `meta-send` (Metas `event_id`), `legat` (eksistens-tjek), SQL-jobbene.

### (3) Secrets og nøgler, der kan udløbe eller dø uden varsel
| Secret | Læses i | Udløb | Varsel i dag |
|---|---|---|---|
| `META_ADS_TOKEN` / nødnavn `META_CAPI_TOKEN` | `_shared/metaAdsToken.ts:53-56` | bruger-token 60 d, data access 90 d. Om det er et system user-token: **umålt** | først efter fejl (klokke + `meta_hentning_vagt`) |
| `META_SEND_TOKEN` | `_shared/metaSendAfsendelse.ts:28` | som ovenfor, **umålt** | alarm efter fejl, og **kun hvis låsen er åben**: med `meta_send_aktiv=false` sendes intet, og intet fejler |
| `KLAVIYO_API_KEY`, `KLAVIYO_AFMELD_KEY` | `_shared/klaviyo*.ts` | private nøgler udløber ikke. De kan tilbagekaldes | gensend- og profil-alarm; afmeldingen i webhooken har **ingen** alarm (fejlede afmeldinger fanges af gensenderen, CLAUDE.md) |
| `MAILGUN_SECRET` | `_shared/mailgunAfsendelse.ts` | kan deaktiveres (probation, business verification) | alarm (`noegle_afvist`/403) — men alarmen går via Lovable |
| `LOVABLE_API_KEY` / `LOVABLE_SEND_URL` | `_shared/managedEmail.ts:96`, `:137` | ejes af Lovable, rotation **umålt** | **ingen**: alle alarmer går gennem den samme nøgle |
| `STRIPE_SECRET_KEY` | `_shared/indgangsFaktura.ts:233`, `:255` | udløber ikke, medmindre den rulles med udløb | «FAKTURA I HÅNDEN» kun i log (§0 #2) |
| `BUNNY_*` (Stream + chat) | `chat-video`, `bunny-content-admin`, `get-video-embed` | statiske | ikke cron. Fejl ses af brugeren |
| `EWEBINAR_API_KEY`, `EWEBINAR_WEBHOOK_SIGNING_SECRET` | `_shared/ewebinarApi.ts`, `ewebinar-webhook` | **umålt** | ingen: en roteret signeringsnøgle giver 401 på alle webhooks i tavshed |
| `CALENDLY_API_KEY` | `_shared/calendlyApi.ts:45` | personligt token, **umålt** | ingen |
| `GA4_SEND_SECRET` | `_shared/gaSendAfsendelse.ts:30` | udløber ikke | alarm |
| `DATACVR_API_KEY` | `_shared/virksomhedsOprettelse.ts:95` | **umålt** | ikke cron |
| vault `email_queue_service_role_key` | `kald_edge` | slettes eller roteres | `kald_edge` kaster, SQL-fejl giver rød vagt inden for en time (`kald_edge.sql:47-51`). Dette **virker** |

### (4) Hårde lofter og paginering, der kan tabe rækker stille
- `send-report-reminder/index.ts:328-331`: `.limit(5000)`/`.limit(10000)` over PostgREST-loftet på 1.000 (§0 #6).
- `onboarding-rytme/index.ts:140-144`: ascending `.limit(5000)`, så de nyeste taber (§0 #6).
- `meta-send-cron/index.ts:208`, `:216`: `.limit(SIDE * 5)` = 5.000, i praksis 1.000. Vinduet er 8 dage, så det er lav risiko i dag.
- `indgangs-paamindelser-cron/index.ts:275-278` og `fornyelsesvarsel-cron` (ingen `.range`): hele tabellen i ét kald, så grænsen er 1.000 rækker. Det er langt væk.
- `send-notification-email/index.ts:245` (50 pr. kørsel) og `:274` (samlemail 500). Det er en kø, der ordner ældste først, så intet tabes, men den kan halte bagud. Vagten ser det (`koe_staar_stille`).
- `report-review-cron/index.ts:25`, `:53`: `LOFT = 500`, nyeste først. Ved mere end 500 processerede rapporter falder de ældste ud. **Umålt** om det betyder noget.
- `ansoegning-rykker-cron/index.ts:66`: `BATCH = 50`, ældste først. Det er en kø, så intet tabes.
- Vagtens 2.000 kørsler (`:134`) svarer ved ca. 80 kørsler i timen til ca. 25 timer, og `koersler_loft_ramt` står i tal. OK.
- `net._http_response` ryddes af pg_net (TTL, standard 6 t, **umålt** i prod). «7 dage» i SQL'en dækker kun det, der er tilbage, og sektion 4 skriver den ældste række.

### (5) Cron-jobs i repoet, der måske ikke findes i prod
- **Formentlig ikke i prod:** `klaviyo-hentning` (`20260920100000`, `docs/marketingmotoren.md:385`).
- **Hovedet siger IKKE KØRT, tilstanden er umålt:** `indgangs-paamindelser` i 120 s-form (`20260919160000`), `ansoegning-rykker` (`20260918210000`, CLAUDE.md siger i drift) og `klaviyo-hentning`.
- **Kun i prod, ingen migration med den faktiske form:** `fornyelsesvarsler` (545), `slet-medlemsdata` (546), `onboarding-rytme` (555, repoets fil siger «KØR IKKE»), `indgangs-paamindelser` (544, oprindelig form), og `daily-report-reminder` og `generate-weekly-focus` (prod-formen afviger, `kald_edge.sql:54-58`).
- **Skal være væk:** de syv afplanlagte (tabellen i §1).
- SQL'en herunder afgør alle punkter i ét resultatsæt.

---

## 3. Rækkefølge for rettelserne (ét skridt ad gangen)
1. Kør SQL'en (§4), før noget andet bygges. Den kan vende #7, #9 og #10.
2. #4 (`webinar-mail-cron` BUDGET_MS 35 s) **før 7-dagsholdet 6/10**, sammen med den udestående deploy af #1152.
3. #1 (vagtens 10. version, S), derefter #2 (`cronAlarm`, M) i de fire penge-/persondata-crons.
4. #3 (reservation i ansøgningskøen), før næste webinar giver en stor morgenkø.
5. #6, #9 og #8 (hver S), derefter #5 og #7 (M).

---

## 4. SQL — Lovable → SQL editor (ét resultatsæt, sektionskolonne)

Kun SELECT. Intet skrives. Kolonnerne `sektion · noegle · vaerdi`. Lovables CSV kommer med semikolon og alfabetisk kolonneorden (DEL 4). Sektioner: **1 job** (prod-kommandoen: mål, timeout, dry_run) · **2 repo mod prod** (forventede jobs der mangler, prod-jobs repoet ikke kender, døde jobs der står endnu) · **3 kørsler 7d** (pr. job gennem `runid`, aldrig `start_time`, jf. DEL 4) · **4 http** (fejlrate samlet og pr. job, tilskrevet som vagten, altså usikkert) · **5 låse** · **6 vagten** · **7 spor** · **8 lofter**.

```sql
with forventet(jobname, kilde) as (
  values
    ('agent-runs-opbevaring', '20260825233000'),
    ('agentforslag-udloeb', '20260911000000'),
    ('ansoegning-rykker', '20260918210000'),
    ('certifikat-klokke', '20260929200000'),
    ('cleanup-stale-processing-reports', '20260901112000'),
    ('daily-report-reminder', '20260327094748 (prod-form afviger)'),
    ('event-reminders', '20260810230000'),
    ('event-reminders-time', '20260910200000'),
    ('fornyelsesvarsler', 'kun prod (7/9) — ingen migration'),
    ('ga-send', '20260922011000'),
    ('generate-weekly-focus', '20260329192545 (prod-form afviger)'),
    ('indgangs-paamindelser', '20260919160000 (hoved: IKKE KØRT)'),
    ('intro-session-reminder', '20260901112000'),
    ('klaviyo-gensend', '20260921160000'),
    ('klaviyo-hentning', '20260920100000 (hoved: IKKE KØRT)'),
    ('klaviyo-profil', '20260921200000'),
    ('klokke-mail', '20260922071000'),
    ('legat-reminder-cron', '20260910210000'),
    ('meta-annoncer', '20260921090000'),
    ('meta-hentning-vagt', '20260921090000'),
    ('meta-send', '20260921235500'),
    ('onboarding-rytme', 'kun prod (0 8 * * *) — migrationen afviger'),
    ('opgave-forfald', '20260911010000'),
    ('opgave-udloeb', '20260901090000'),
    ('process-notification-emails', '20260901112000'),
    ('report-review-cron', '20260910230000'),
    ('slet-medlemsdata', 'kun prod (8/9) — ingen migration'),
    ('stille-klokker', '20260921100000'),
    ('vagt-cron', '20260909234500'),
    ('webinar-delinger-opbevaring', '20260922021000'),
    ('webinar-mail', '20260922172000')
),
doede(jobname) as (
  values ('send-monthly-digest'), ('send-pulse-reminder'), ('daily-reflection-nudge'),
         ('process-email-queue'), ('send-notification-email'), ('daily-circle-sync'),
         ('weekly-engagement-nudge')
),
jobs as (
  select j.jobid, j.jobname, j.schedule, j.active, j.command,
         coalesce(substring(j.command from $r$kald_edge\(\s*'([a-z0-9-]+)'$r$),
                  substring(j.command from 'functions/v1/([a-z0-9-]+)'),
                  substring(j.command from '(public\.[a-z_]+)\('),
                  left(regexp_replace(j.command, '\s+', ' ', 'g'), 60)) as maal,
         case
           when j.command like '%kald_edge%' then coalesce(substring(j.command from $r$'::jsonb\s*,\s*(\d+)$r$), '30000 (kald_edge-standard)')
           when j.command like '%timeout_milliseconds%' then 'sat i net.http_post'
           when j.command like '%net.http_post%' then '5000 (pg_net-standard!)'
           else '— (ren SQL)'
         end as timeout_ms,
         coalesce(substring(j.command from $r$"dry_run"\s*:\s*(true|false)$r$), '(ingen dry_run i body)') as dry_run
  from cron.job j
),
koersler as (
  select d.runid, d.jobid, d.status, d.start_time, d.end_time, d.return_message
  from (
    select runid, jobid, status, start_time, end_time, return_message
    from cron.job_run_details
    order by runid desc
    limit 30000
  ) d
  where d.start_time > now() - interval '7 days'
),
koersel_pr_job as (
  select k.jobid,
         count(*) as n,
         count(*) filter (where k.status = 'failed') as fejlet,
         count(*) filter (where k.status = 'failed' and (k.return_message ilike '%startup timeout%' or k.return_message ilike '%connection%')) as startup,
         max(k.start_time) as sidst,
         (array_agg(k.status order by k.runid desc))[1] as sidste_status,
         (array_agg(left(coalesce(k.return_message, ''), 120) order by k.runid desc) filter (where k.status = 'failed'))[1] as sidste_fejl
  from koersler k
  group by k.jobid
),
svar as (
  select distinct on (r.id)
         r.id, r.status_code, r.timed_out, r.error_msg, r.created, k.jobid,
         (coalesce(r.timed_out, false) or r.error_msg ~* '(timeout|timed out)') as er_timeout
  from net._http_response r
  left join koersler k on k.start_time between r.created - interval '3 minutes' and r.created
  where r.created > now() - interval '7 days'
  order by r.id, k.start_time desc nulls last
)

-- 1. Hvert job i prod
select '1 job' as sektion,
       concat(j.jobid, ' · ', j.jobname) as noegle,
       concat(j.schedule, ' · active=', j.active, ' · mål=', j.maal, ' · timeout=', j.timeout_ms, ' · dry_run=', j.dry_run) as vaerdi
from jobs j

union all
-- 2a. Repoets forventede jobs mod prod
select '2 repo mod prod', f.jobname,
       case when j.jobid is null then 'FINDES IKKE I PROD — kilde: ' || f.kilde
            when not j.active then 'findes, men active=false — kilde: ' || f.kilde
            else 'ok (jobid ' || j.jobid || ')' end
from forventet f left join jobs j on j.jobname = f.jobname

union all
-- 2b. Jobs i prod, som repoet ikke kender — eller som skulle være døde
select '2 repo mod prod', j.jobname,
       case when exists (select 1 from doede d where d.jobname = j.jobname) then 'SKULLE VÆRE AFPLANLAGT — står stadig (active=' || j.active || ')'
            else 'i prod, IKKE i repoets liste (mål=' || j.maal || ')' end
from jobs j
where not exists (select 1 from forventet f where f.jobname = j.jobname)

union all
-- 3. Kørsler de seneste 7 dage pr. job (læst gennem runid, aldrig start_time)
select '3 kørsler 7d', j.jobname,
       case when p.jobid is null then 'INGEN KØRSLER på 7 dage (active=' || j.active || ', ' || j.schedule || ')'
            else concat('n=', p.n, ' · failed=', p.fejlet, ' (heraf startup ', p.startup, ') · sidst=',
                        to_char(p.sidst at time zone 'Europe/Copenhagen', 'DD/MM HH24:MI'), ' dansk · sidste status=', p.sidste_status,
                        coalesce(' · sidste fejl: ' || p.sidste_fejl, '')) end
from jobs j left join koersel_pr_job p on p.jobid = j.jobid

union all
-- 3b. Er 30.000-loftet ramt før 7 dage? (så mangler der kørsler i sektion 3)
select '3 kørsler 7d', '(loft)',
       concat('læst ', (select count(*) from koersler), ' kørsler inden for 7 dage; ældste læste: ',
              (select to_char(min(start_time) at time zone 'Europe/Copenhagen', 'DD/MM HH24:MI') from koersler),
              ' · job_run_details i alt ≈ ', coalesce((select nullif(reltuples, -1)::bigint::text from pg_class where oid = 'cron.job_run_details'::regclass), 'ukendt'))

union all
-- 4a. net._http_response samlet (tabellen ryddes af pg_net — se «ældste»)
select '4 http samlet', 'i alt / ældste række',
       concat((select count(*) from svar), ' svar · ældste ',
              coalesce((select to_char(min(created) at time zone 'Europe/Copenhagen', 'DD/MM HH24:MI') from net._http_response), '—'),
              ' dansk (alt før det er ryddet — «7 dage» dækker kun dette)')

union all
select '4 http samlet', 'kode ' || x.kode, x.n::text || ' (' || round(100.0 * x.n / nullif(sum(x.n) over (), 0), 1) || ' %)'
from (
  select case when er_timeout then 'timeout'
              when status_code is null and error_msg is not null then 'transportfejl'
              when status_code is null then 'intet_svar_endnu'
              else status_code::text end as kode,
         count(*) as n
  from svar group by 1
) x

union all
-- 4b. Fejlrate pr. job (tilskrevet efter nærmeste kørsel ≤ 3 min før svaret — samme regel som vagten, kan fejltilskrive)
select '4 http pr job', coalesce(j.jobname, '(intet job — manuelt kald)'),
       concat('svar=', count(*), ' · ikke-200=', count(*) filter (where s.status_code is distinct from 200),
              ' · timeouts=', count(*) filter (where s.er_timeout),
              ' · fejlrate=', round(100.0 * count(*) filter (where s.status_code is distinct from 200) / nullif(count(*), 0), 1), ' %')
from svar s left join cron.job j on j.jobid = s.jobid
group by j.jobname

union all
-- 5. Låsene i app_config (fail-closed: ikke sat = false = sender intet)
select '5 låse', l.noegle, coalesce((select a.config_value::text from public.app_config a where a.config_key = l.noegle), 'ikke sat → false')
from (values ('webinar_mail_aktiv'), ('meta_send_aktiv'), ('ga_send_aktiv'), ('klaviyo_afmeld_aktiv')) l(noegle)

union all
-- 6. Vagten selv
select '6 vagten', 'seneste dom',
       coalesce((select concat(v.dom, ' · ', to_char(v.tid at time zone 'Europe/Copenhagen', 'DD/MM HH24:MI'), ' dansk · grunde=', array_to_string(v.grunde, ','))
                 from public.cron_vagt_log v order by v.id desc limit 1), 'INGEN RÆKKER')
union all
select '6 vagten', 'domme 7d', coalesce(string_agg(concat(d.dom, '=', d.n), ' · '), 'ingen')
from (select dom, count(*) as n from public.cron_vagt_log where tid > now() - interval '7 days' group by dom) d
union all
select '6 vagten', 'vault-nøgle', (select count(*)::text from vault.secrets where name = 'email_queue_service_role_key') || ' række(r) med email_queue_service_role_key'

union all
-- 7. Sporene — fejl, der kun står i en tabel
select '7 spor', 'webinar_mails 7d', coalesce(string_agg(concat(x.udfald, '=', x.n), ' · '), 'ingen')
from (select udfald, count(*) as n from public.webinar_mails where forsoegt_at > now() - interval '7 days' group by udfald) x
union all
select '7 spor', 'meta_haendelser 7d', coalesce(string_agg(concat(x.udfald, '=', x.n), ' · '), 'ingen')
from (select udfald, count(*) as n from public.meta_haendelser where sidste_forsoeg_at > now() - interval '7 days' group by udfald) x
union all
select '7 spor', 'ga_haendelser 7d', coalesce(string_agg(concat(x.udfald, '=', x.n), ' · '), 'ingen')
from (select udfald, count(*) as n from public.ga_haendelser where sidste_forsoeg_at > now() - interval '7 days' group by udfald) x
union all
select '7 spor', 'klaviyo_haendelser 7d', coalesce(string_agg(concat(x.udfald, '=', x.n), ' · '), 'ingen')
from (select udfald, count(*) as n from public.klaviyo_haendelser where sendt_at > now() - interval '7 days' group by udfald) x
union all
select '7 spor', 'email_send_log 7d', coalesce(string_agg(concat(x.status, '=', x.n), ' · '), 'ingen')
from (select status, count(*) as n from public.email_send_log where created_at > now() - interval '7 days' group by status) x
union all
select '7 spor', 'planlagte_haendelser',
       concat('fejlet i alt=', count(*) filter (where status = 'fejlet'),
              ' · planlagt og forfalden > 1 t=', count(*) filter (where status = 'planlagt' and planlagt_til < now() - interval '1 hour'))
from public.planlagte_haendelser
union all
select '7 spor', 'meta_hentning',
       coalesce((select concat(sidste_udfald, ' · ', to_char(sidste_koersel at time zone 'Europe/Copenhagen', 'DD/MM HH24:MI'), ' · hentet_til=', hentet_til, coalesce(' · ' || left(sidste_fejl, 120), ''))
                 from public.meta_hentning where art = 'annoncer'), 'INGEN RÆKKE')

union all
-- 8. Lofterne: PostgREST klipper ved 1.000 rækker uden fejl
select '8 lofter', 'company_members (onboarding-rytme .limit(5000), send-report-reminder .limit(5000))', count(*)::text from public.company_members
union all
select '8 lofter', 'financial_report_facts measured (send-report-reminder .limit(10000))', count(*)::text from public.financial_report_facts where data_basis = 'measured'
union all
select '8 lofter', 'financial_reports uden deleted_at (send-report-reminder .limit(10000))', count(*)::text from public.financial_reports where deleted_at is null

order by 1, 2;
```

**Læses sådan:** sektion 2 «FINDES IKKE I PROD» eller «SKULLE VÆRE AFPLANLAGT» er fund (5). Sektion 1 med `timeout=5000 (pg_net-standard!)` er fund (2) for det job. Sektion 3 «INGEN KØRSLER» på et aktivt job er fund (1)/(5). Sektion 4 «pr job» med fejlrate > 0 og vagten grøn i sektion 6 bekræfter §0 #1. Sektion 8 over 1.000 bekræfter §0 #6.

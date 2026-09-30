# Gamification — recon og værdianalyse (30/9-2026)

Repo læst read-only, HEAD `e83cfcc`. Intet er ændret, committet eller kørt mod prod. Alle linjehenvisninger er til repoet. Tal fra prod er kun citeret, hvor et dokument i repoet allerede har målt dem (med dokumentet som kilde); alt andet er markeret «ikke målt».

**Læseregel:** DEL 1 er kun fund. DEL 2 er vurdering og er skrevet, så den kan skilles fra. `types.ts` er Lovables genererede typer og kan halte efter migrationer; kolonnerne i SQL'en nederst står alle i `types.ts`.

---

# DEL 1 — FUND (mål, ikke mening)

## 1.1 Hvad platformen registrerer i dag

Ejerskab: «medlem» = bruger via `company_members` (user_id ↔ company_id, `types.ts:1646`); «virksomhed» = `companies` (rod-entitet, `types.ts:1249`). En virksomhed kan have flere brugere; chatten er pr. virksomhed (`conversations.company_id`), ikke pr. person (policy «Company members can view company conversations», `20260224222456_…sql:256`).

| Aktivitet | Tabel (`types.ts`-linje) | Tidsstempler | Ejer af rækken |
|---|---|---|---|
| Chatbesked | `messages` (3526) | `created_at`, `read_at`, `edited_at`, `pinned_at`; `message_type` (`user`/`system`/`ai`/`welcome`/`reflection-nudge`/`legat-momentum-reminder`), `sender_id`, `conversation_id`, `svar_paa_id` | Afsender (`sender_id`); samtalen tilhører virksomheden |
| Samtaletilstand | `conversations` (2072) | `created_at`, `last_message_at`, `last_member_message_at`, `last_advisor_reply_at`, `acknowledged_at`, `resolved_at`, `follow_up_at`; `awaiting_reply_from` (`advisor`/`company`/null), `assigned_advisor_id` | Virksomheden (`company_id`), `member_id` = oprindeligt medlem |
| Læst-tilstand pr. samtale | `conversation_last_seen` (2013) | `last_seen_at` | `user_id` |
| Community-tråd | `community_traade` (1154) | `created_at`, `updated_at`, `sidste_svar_at`; `antal_svar`, `antal_visninger` (cache), `status` aktiv/skjult/slettet, `kilde_type` | `forfatter_id` |
| Community-svar | `community_svar` (1113) | `created_at`, `updated_at` | `forfatter_id` |
| Likes | `community_reaktioner` (1074) — kun `type = 'like'` (`20260811140000_community.sql:129-130`) | `created_at` | `bruger_id` |
| Læste tråde | `community_visninger` (1223) | `set_at` (unik pr. bruger pr. tråd) | `bruger_id` |
| Event-tilmelding | `event_registrations` (2356) | `registered_at`, `cancelled_at`; `response` kun `attending`/`declined` (`20260810210000_event_svar.sql:18`) | `user_id` |
| Akademi-fremdrift | `member_progress` (3449) | `seen_at`, `acknowledged_at`, `skipped_at`, `brugbar_at`, `updated_at`; `last_position_seconds` | `user_id` |
| Godkendte månedstal | `financial_report_facts` (2595) | `committed_at`, `created_at`; `period_key` (YYYY-MM), `data_basis` measured/estimated | `company_id` (unik pr. virksomhed+periode) |
| Uploadede rapporter | `financial_reports` (2652) | `uploaded_at`, `processed_at`, `reviewed_at`, `deleted_at`; `status` | `user_id` + `company_id` |
| Puls-check-ins | `pulse_checkins` (4098) | `created_at`; `period_key` | `user_id` + `company_id` |
| Opgaver / skridt | `company_actions` (1396) | `created_at`, `accepted_at`, `completed_at`, `dismissed_at`, `closed_at`, `due_date`, `expires_at`; `status` (proposed/active/done/not_done/dropped/dismissed/expired, overgangssæt med open/parked — `20260822220000_opgave_model_kolonner.sql:33-36`), `deferral_count`, `proposed_by` | `user_id` + `company_id` |
| Milepæle | `milestones` (3785) | `created_at`, `completed_at`, `progress_updated_at`, `deadline`; `progress` | `user_id` + `company_id` |
| KPI-mål / budget | `kpi_targets` (3325), `budget_targets` (1009) | `created_at`, `updated_at` | `user_id` + `company_id` |
| Handouts | `handouts` (2881) | `created_at`, `completed_at`, `ai_feedback_at`; `status` | `user_id` + `company_id` |
| Ugens fokus vist | `weekly_focus` (4875) | `generated_at`, `seen_at` | `company_id` |
| Login | `user_login_log` (4450) | `logged_in_at` (én række pr. SIGNED_IN inkl. faneskift) | `user_id` |
| Sidst logget ind | `auth.users.last_sign_in_at` via RPC `get_users_last_login` (`types.ts:5187`) | dato | bruger |
| Sidst set forsiden | `forside_sidst_set` (2765) | `set_at` — ÉN række pr. bruger, kun seneste. **RETTET 30/9 aften (målt): tabellen har kun 3 rækker, alle rådgiveres — den er IKKE et medlemssignal** (medlemmerne skriver ikke til den) | `user_id` |
| Onboarding | `profiles` (4050) | `onboarded_at`, `tour_completed_at`, `velkomstvideo_set_at`, `deling_hentet_at`, `created_at` | `user_id` |
| Profil | `member_profiles` (3416) | `updated_at`, `working_on_updated_at` | `user_id` |
| Certifikat-hentninger | `certificate_downloads` (1050) | `created_at`; `design`, `format` | `user_id` |
| Sessioner (Calendly) | `session_bookings` (4189) | `created_at`, `start_tid`, `slut_tid`; `status`, `advisor` (tekst) | `user_id` + `company_id` |
| Legat-forløb | `legat_enrollments` (3369) | `start_date`, `upgraded_at`; `momentumkald_booked` | `user_id` + `company_id` |
| Feedback (produkt) | `feedback` (2485) | `created_at`, `resolved_at` | `user_id` |
| Klokker til medlem | `notifications` (3859) | `created_at`, `seen_at`, `read_at`, `email_sent_at`, `push_sent_at` | `user_id` |
| Ansøgning | `ansoegninger` (770), `ansoegning_beslutninger` (655) | `created_at`, `indsendt_at`, `trin_sat_at`, `truffet_at`; `truffet_af` (uuid, kun for `truffet_via = 'raadgiver'` — `20260918200000_ansoegninger.sql:216-222`) | Ansøgeren; beslutning ejes af `truffet_af` |
| Invitationer | `company_invitations` (1602), `advisor_invitations` (135) | `created_at` m.fl. | Virksomhed / rådgiver |

**Pr. rådgiver** (rådgiver = `user_roles.role IN ('advisor','admin')`; admin arver advisor):

| Aktivitet | Tabel | Bemærkning |
|---|---|---|
| Chatbeskeder sendt | `messages.sender_id` = rådgiverens id, `message_type = 'user'` | Trigger sætter kun samtaletilstand for `user` (`20260311050600_…sql:15`); auto-beskeder bærer også en rådgivers `sender_id` men en anden type: nudge (`nudge-report-no-reflection/index.ts:189-193`), velkomst (`send-welcome-message/index.ts:153-155`), legat-påmindelse (`legat-reminder-cron/index.ts:136-137`) |
| Tildeling | `conversations.assigned_advisor_id` | Sættes til første rådgiver, der skriver, hvis tom (`20260311050600_…sql:35`) |
| Community-svar | `community_svar.forfatter_id` ∈ rådgivere | Ingen særskilt rådgiver-markering udover rollen |
| Ansøgningsbeslutninger | `ansoegning_beslutninger.truffet_af`, `truffet_at` | Menneske-tvang: `truffet_via = 'raadgiver'` kræver `truffet_af` |
| Egen to-do | `raadgiver_opgaver` (4142) | `ejer_id`, `oprettet_af`, `frist` (DATE), `gjort_at`, `status` aaben/gjort |
| Kvittering på virksomhed | `advisor_company_acknowledgments` (53) | `advisor_id`, `acknowledged_at`, `snoozed_until`, `udfald` |
| Finansielle handlinger | `advisor_financial_actions` (100), `advisor_milestone_actions` (162) | `actioned_by_advisor_id`, `actioned_at` |
| Sessionsnoter | `advisor_session_notes` (253) | `generated_by`, `generated_at` |
| Rådgiver-klokker | `advisor_notifications` (200) | `advisor_id`, `created_at`, `read_at`, `mailet_at` — «klokke læst» er målbar pr. rådgiver |
| Sessioner | `session_bookings.advisor` (tekst, ikke uuid) | |

Hvem rådgiverne er: to, Jonas og Morten (`docs/OVERLEVERING.md:10297`, klokke-mail-tørkørslen: «rådgivere: Jonas … og Morten …»).

## 1.2 Findes der allerede noget, der ligner gamification?

**Kun i det stille — og det eneste point/niveau-system er slettet:**

1. **Slettet 13/9.** En `gamification`-konfiguration med point (`pointsPerReport: 10`, `pointsPerMilestone: 25`) og fem niveauer (Starter 0, Aktiv 25, Dedikeret 75, Stjerneelev 150, Mester 300, med emoji) blev seedet 24/2 (`supabase/migrations/20260224095552_2ae5d594-377f-4c26-bf0f-b75cccd541ad.sql:41-43`) og **slettet 13/9** (`20260913231500_platformconfig_doede_raekker.sql:39`), fordi ingen monteret flade læste den; `PerformanceScore.tsx` og `CommunityProgress.tsx` var importeret ingen steder. `src/lib/appConfig.ts:5` og `ConfigView.tsx:46` dokumenterer sletningen. Der er altså ingen levende point-/niveau-kode i dag.
2. **Onboarding-tjekliste med fremdriftsbar.** `src/lib/onboardingTjekliste.ts` (otte punkter: velkomst, profil, præsentation, virksomhed, rapport, handout, besked, deling; «Gjort betyder HANDLING, ikke besøg»), data i `src/hooks/useOnboardingTjekliste.ts`, flade `HbOnboardingTjekliste.tsx:401` (`HbProgressBar`), «ankomst»-domme i `src/lib/hjemmebane/ankomst.ts`. Rytmemails til de første dage i `supabase/functions/_shared/onboardingRytme.ts`.
3. **Fremdriftsbar med udtrykkelig designregel.** `src/components/hjemmebane/akademi/HbProgressBar.tsx:10`: «Stille fremdrift: "3 af 8" + hairline-bar. Ingen procenter, ingen badges.» `HbKursusKort.tsx:63-67`: gennemført kort har kun en evergreen-venstrekant, «ingen badge, ingen farvet baggrund». Det er husets designsprog i dag.
4. **«Din måned»** på medlemmets forside (`src/lib/hjemmebane/dinMaaned.ts`): tre tal med retning mod forrige måned i ord og en 12-måneders sparkline af MÅLTE måneder; vedtaget 17/9 som «ingen sammenligning med andre» (filhoved, linje 1-5). Mangelliste-kortet om en udvidet «Din måned» (fire tal, gennemsnit kun ved N ≥ 5, «ingen point, ingen ranglister») står som idé: `docs/mangelliste.html:3532`.
5. **Certifikat efter 12 måneder.** `src/lib/certifikat/dom.ts`, `src/hooks/useCertificate.ts`, `src/components/hjemmebane/certifikat/format.ts:67-71` (`getCertificateStatus`; åbner 7 dage før 12-måneders dagen), klokke `supabase/functions/_shared/certifikatKlokke.ts`, hentninger i `certificate_downloads`. Bygget 29/9 (#1133); skærmbevis udestår (`docs/opstart-30-09.md:29-32`). Det er i dag husets eneste genstand, der ligner en «badge».
6. **Fremdrift pr. lektion/modul.** `HbKursusKort.tsx:91` («N af M gennemført»), tilstandsprikker i `HbItemRow.tsx:9`, rådgiverens overblik `admin/views/ProgressView.tsx` (kun TRACKED B1-video; rådgiveren kan sætte `acknowledged_at` manuelt).
7. **Rådgiverside: kø-buckets.** Forsiden har fem buckets, bl.a. «Venter på dit svar», «Ikke hørt fra længe» (`docs/raadgiverfladen-design.md:34`, `AdvisorDashboard.tsx:1129-1135`); kort «Ubesvarede opslag» (`src/hooks/ubesvaredeOpslag.ts`); «Nye medlemmer (30 dage)»-kohortelinje (`src/hooks/kohorte.ts`); stille-klokker for medlemmer der er tavse (`20260921100000_stille_klokker_cron.sql`).

**Findes IKKE (grep i `src/` og `supabase/functions` på streak, leaderboard, ranglist, gamif, pointsPer, xp_, levels): streaks, leaderboards, rangeringer, point.** De få hits er sletningskommentarer (`appConfig.ts`, `useAppConfig.ts`, `ConfigView.tsx`) og urelaterede ord (`levels` i editor/password-komponenter). `Badge` bruges kun som statusmærke i UI (fx `EventsView.tsx`, `VirksomhedView.tsx`), ikke som præmie. Ordene findes ellers kun i docs (BACKLOG, RAEKKEFOELGE, c0-inventar), hvor Circle-topbaren havde et Leaderboard: Circle-topbaren havde et Leaderboard, og «skal noget bevares?» stod som åbent punkt (`docs/hjemmebane/c0-inventar.md:131`).

**Eksisterende beslutninger om gamification (binder analysen i DEL 2):**
- `BACKLOG.md:1486-1505` (Jonas 13/8): «Northstar er vanen — ugentlig selvstyret tilbagevenden — og gamification skal tjene den, ikke konkurrencen.» Ramme: selvstyret progression, aggregeret social proof («dig mod gennemsnittet»), **«INGEN personidentificerende feeds, scoreboards eller rangeringer. Det bryder med den premium-tone og med privatlivshensynet.»** Åbent: «hvad der overhovedet skal tælles».
- `docs/RAEKKEFOELGE.md:74-79`: gamification står i tempo 6 «Fastholdelse» med begrundelsen «Gamification kræver et ærligt grundlag … Bygges det før, måler man på milestones med 8 % fuldførelse.»
- `docs/RAEKKEFOELGE.md:31`: «Kun 11 af 34 virksomheder har tal nyere end 60 dage … intet at gamificere.»
- `docs/OVERLEVERING.md:2205-2211`: «Netværkseffekter der forudsætter aktivitet (peer-matching, anbefalinger, gamification, top posts). Ingen aktivitet at bygge på.»
- Regel 4a i `docs/claude-regelsaet.md:61-75` («Værdi før byg»): nye funktioner bygges kun, når gevinsten er klar og målt; ellers lægges de frem for Jonas med målingen.

**Konflikt at være opmærksom på:** Jonas' nye udsagn («folk er konkurrencemennesker … noget at jagte») trækker mod det, BACKLOG-rammen fra 13/8 udelukker (rangeringer). Det er en beslutning, ikke en detalje — se DEL 2, punkt D1.

## 1.3 Rådgiver-svartid: kan den beregnes?

**Ja, fra eksisterende data, men IKKE fra de kolonner, der ligner den.**

Felter, der kan bære beregningen (alle i `messages`, `types.ts:3527-3542`):
- Afsenderrolle: `messages.sender_id` slået op i `user_roles` (`role IN ('advisor','admin')`) — samme dom som triggeren bruger (`20260311050600_…sql:17-19`).
- Tid: `messages.created_at`.
- Tråd/virksomhed: `messages.conversation_id` → `conversations.company_id` (`types.ts:2078`).
- Filter: `message_type = 'user'` (udelukker kvitteringer, session_prep, AI, velkomst, nudge og legat-påmindelse, som ellers bærer en rådgivers `sender_id`).

**Hvorfor `conversations`-kolonnerne ikke dur til svartid:** triggeren OVERSKRIVER `last_advisor_reply_at` og `last_member_message_at` ved hver ny besked (`20260311050600_…sql:24-38`). De rummer kun seneste tidspunkt, ikke første ubesvarede medlemsbesked. En svartid skal derfor regnes fra `messages` (SQL nedenfor: første medlemsbesked i en række → næste rådgiverbesked i samme samtale).

**Findes der allerede en beregning eller visning?** Nej. Grep på `svartid`, `responstid`, `SLA`, `median.*svar` i `src/` og `supabase/` giver ingen beregning (eneste hits: en marketing-linje og «svartiden røber» i to auth-kommentarer). Det, der findes, er tilstands-baseret:
- `conversations.awaiting_reply_from = 'advisor'` som «Venter på dit svar» (`AdvisorDashboard.tsx:201, 528`; sortering på `last_member_message_at`, `CompanyChatPane.tsx:604-607`).
- Ét UI-løfte til medlemmet: «Vi svarer typisk inden for 24 timer.» (`src/components/MemberChatPane.tsx:998`) — **uden nogen måling bag**.
- Én bevidst modbevægelse i markedsføringsgrundlaget: chatten er «to numre, man kan ringe til … Ikke en supportkanal med svartid.» (`src/lib/marketing/grundlag.ts:76`). Svartid som synlig SLA over for medlemmer er altså i strid med, hvordan huset selv beskriver sig.
- «Læst»-kvittering vises til medlemmet på egen seneste besked (`docs/medlemschat-recon.md:38`).

**Datastørrelse (fra 31/8, `docs/chat-design.md`):** 564 menneskebeskeder i alt over 34 virksomheder, 52 % medlem / 48 % rådgiver (chat-design.md:1-30, 51-58); chat brugt af 88 % af virksomhederne (chat-design.md:19). Altså få hundrede spørgsmål i alt og to rådgivere: medianer pr. måned og pr. rådgiver hviler på små n.

**Andre målbare rådgiver-KPI'er:**
- Ansøgning: tid fra `ansoegninger.indsendt_at` til første `ansoegning_beslutninger` med `truffet_via = 'raadgiver'` (`truffet_af` + `truffet_at`). Rådgiveren rykkes allerede selv (dag 3 og 7 for «ny», dag 2 for «afholdt») — CLAUDE.md, afsnittet om ansøgningsmotoren.
- Community: tid fra `community_traade.created_at` til første `community_svar` af en rådgiver; tråde uden rådgiversvar (kortet «Ubesvarede opslag» kender vinduet, `ubesvaredeOpslag.ts`).
- Klokke-reaktion: `advisor_notifications.read_at − created_at` pr. `advisor_id`.
- Egne to-dos: `raadgiver_opgaver` (`gjort_at` mod `frist`, pr. `ejer_id`).
- Ventende medlemsbeskeder nu: `conversations.awaiting_reply_from = 'advisor'` (allerede talt af forsiden).
- Foreslåede skridt: `company_actions.proposed_by` + `source_type = 'advisor'` (rådgiver foreslår, medlem accepterer): acceptrate og fuldførelsesrate.
- Kontaktdækning: seneste rådgiverbesked pr. virksomhed (`messages` + `assigned_advisor_id`).

## 1.4 Hvad kan IKKE måles i dag

1. **Hvem der åbnede en besked.** `mark_messages_read` sætter `read_at = now()` uden at gemme, hvem der læste (`20260420223823_cc6942b6-….sql:24-30`). «Reaktionstid» pr. rådgiver (åbnet, men ikke svaret) findes ikke; kun «hvem svarede».
2. **«Kræver ikke svar».** Handlingen sætter `awaiting_reply_from = null` og gemmer hverken hvem eller hvornår (`CompanyChatPane.tsx:1098-1110`). En medlemsbesked, der blev afgjort uden svar, er i `messages` ikke til at skelne fra en glemt besked. Nævneren for en svartid er derfor uren (se SQL-notat).
3. **Svar uden for chatten.** Telefon, mail (kontakt@), Calendly-sessioner og møder registreres ikke som svar; `session_bookings` har `status`/`start_tid` men intet om indholdet, og `advisor` er tekst.
4. **Rådgivernes arbejdstid og fravær.** Der er ingen ferie-/tilgængelighedskalender pr. rådgiver. `src/lib/hverdage.ts` kender hverdage, helligdage og «husets tre lukkedage» (til cron-vinduer); det giver en husur, ikke en persons ur.
5. **Kvalitet og tilfredshed.** Ingen vurdering af rådgiversvar; `feedback` (2485) er produktfeedback; `member_progress.brugbar` findes kun på lektioner.
6. **Fremmøde til events.** `event_registrations.response` er kun `attending`/`declined` (`20260810210000_event_svar.sql:18`); der er ingen indtjekning. Webinar-fremmøde (`webinar_tilmeldinger.set_procent`) gælder ansøgere/leads, ikke medlemmer.
7. **Aktive dage.** `user_login_log` tæller faneskift og reloads (618 rækker for én bruger, `VirksomhedslisteView.tsx:184-187`); brugbart kun som distinkt dag pr. bruger. `forside_sidst_set` har kun den seneste række — ingen historik at bygge en streak på.
8. **Første godkendelse af en måned.** RPC'en, der genindlæser en periode, overskriver `committed_at = now()` (`20260317200420_…sql:275`); `committed_at` er altså SENESTE godkendelse. Streaks skal bygges på `period_key`, ikke på `committed_at`.
9. **Andres aktivitet.** Et medlem kan ikke læse andre virksomheders rækker (RLS); et «dig mod gennemsnittet» kræver en aggregeret funktion eller et snapshot, som ikke findes. Community og medlemsoversigt viser i dag kun profiler og tråde (`get_member_directory`, `20260810120000_member_profiles.sql:157`); online-status er bevidst kun for rådgivere (`20260917100000_online_presence.sql`).
10. **Baseline for adfærden.** Ingen af de nedenstående mekanikker har en målt baseline i repoet. Der findes gamle målinger (`docs/aktiveringsmaaling-27-august.md`: 14 af 33 virksomheder har aldrig haft en målt måned; `docs/chat-design.md:19`: chat 88 %, rapportering 56 %, budget 41 %, refleksion 29 %, KPI-mål 15 %, aftaler 9 %), men de er 1 måned gamle og skal måles igen (SQL nedenfor).
11. **Community-aktivitet som tal.** `OVERLEVERING.md:2211` kalder den «ingen aktivitet»; hvor meget der reelt er, er ikke målt i repoet (dækkes af SQL sektion 6).

---

# DEL 2 — VÆRDIANALYSE (vurdering, ikke måling)

**Hovedindtryk:** Grundlaget for de to sider er meget forskelligt. Rådgiversiden har data nu, få personer og et konkret uverificeret løfte at holde regnskab med. Medlemssiden har data (facts, opgaver, chat), men få, uens aktive medlemmer (~34 virksomheder), et etableret designsprog uden badges, og en tidligere beslutning imod rangeringer.

## D1. Beslutning der skal tages først (Jonas)

Konkurrence kan gøres på tre måder, med stigende risiko:
- **A. Mod sig selv** (måned mod måned, rytme, mål): allerede rammen fra 13/8. Ingen risiko for tone eller fortrolighed.
- **B. Anonymt mod gruppen** («du har rapporteret 5 af seneste 6 måneder; medianen er 3», kun når N ≥ 5): opfylder «noget at jagte» uden navne. Kræver en ny aggregeret funktion (SECURITY DEFINER eller snapshot-cron), altså en ny sikkerhedsflade.
- **C. Navngivet** (rangliste, «månedens medlem»): bryder med rammen fra 13/8 og med privatlivet mellem virksomheder, der kan være direkte konkurrenter.

Min anbefaling: A nu, B når N og baseline er målt, C ikke som rangering. Hvis Jonas vil have C, så kun som positiv, ikke-rangeret anerkendelse med samtykke (fx «har holdt rytmen i 6 måneder»), aldrig ordnet efter et tal.

## Medlemmer — fem mekanikker

### M1. «Din rytme» (måneder i træk med godkendte, målte tal)
- **Adfærd og værdi:** at uploade og godkende månedstal er platformens kernemangel (14 af 33 aldrig målt, 11 af 34 med tal under 60 dage, RAEKKEFOELGE.md:31; aktiveringsmåling 27/8). Uden tal er der ingen KPI'er, ingen rapporter, intet at rådgive om. En rytme, der viser «5 af de seneste 6 måneder», gør adfærden synlig og gør hullet konkret.
- **Data:** `financial_report_facts` (`period_key`, `data_basis = 'measured'`); forsiden læser allerede alle rækker til «Din måned» (`dinMaaned.ts`), altså ingen ny hentning. Udelad estimerede rækker (som sparklinen).
- **Risiko:** belønner upload, ikke kvalitet (dog ligger «godkend» som menneskelig handling ind, `commit_report_facts`); regnskabsafhængighed (måneden lukker først ~den 10.-15., og en ekstern bogholder kan være sen) — kræver en nådeperiode og «i de seneste N måneder» frem for en skrøbelig kæde, der nulstilles; medlemmer, der aldrig har uploadet, får et tomt kort (brug «Din måned»-mønstret: «det bliver til …»). Tone: ord, ikke flammer — som «højere end i juni».
- **Størrelse:** S (ren dom + linje i eksisterende kort, med paritet/test efter husets mønster).

### M2. «Din rejse» — en samlet fremdriftslinje ud over de første 30 dage
- **Adfærd og værdi:** tjeklisten (`onboardingTjekliste.ts`) forsvinder, når den er færdig; derefter er der ingen visuel «hvor er jeg», før certifikatet efter 12 måneder. En enkelt vandret linje (Kom godt i gang → første godkendte måned → første aftalt skridt gjort → første mål → 12 måneder/certifikat) giver «visuel og overskuelig», bygger på de stille elementer, huset allerede har (hairline-bar, «3 af 8»), og forbinder certifikatet til det, der ligger foran det.
- **Data:** alt findes: `profiles.onboarded_at`, `financial_report_facts`, `company_actions.completed_at`, `milestones.completed_at`, `companies.contract_start_date` (certifikatdatoen). Ingen ny tabel.
- **Risiko:** kan ligne en tjekliste igen (der er allerede én); skal være kort og ikke skabe skyldfølelse for medlemmer, der ikke har brug for alle trin (legat, abonnent har andre veje: certifikatdommen udelukker dem allerede, `certifikat/dom.ts`).
- **Størrelse:** S–M.

### M3. Skridt holdt — «aftaler holdt» (selvsammenlignet)
- **Adfærd og værdi:** rådgivningens værdi ligger i handling efter samtalen. Opgavemodellen skelner nu done/not_done/dropped/expired (`opgave-model-design.md`), og «Dine skridt» findes. Et tal som «3 af 4 skridt holdt i kvartalet» (mod en selvvalgt dato) gør opfølgning til noget at jagte.
- **Data:** `company_actions` (`status`, `accepted_at`, `completed_at`, `due_date`); `raadgiver`-forslag via `proposed_by`.
- **Risiko:** højt. Fuldførelse er lav (8 % på milepæle, RAEKKEFOELGE.md:79), så et tal kan straffe, hvor der endnu ikke er en vane; `dropped` er en legitim beslutning og må aldrig tælle som fiasko; det belønner nemme skridt. Bør derfor først tændes, når baseline er målt (SQL sektion 6, `opgaver_status_oprettet_90d`).
- **Størrelse:** S–M.

### M4. Anonymt «dig mod huset» på rytmen (N ≥ 5)
- **Adfærd og værdi:** det tætteste, man kommer «konkurrence», uden navne. Kun på adfærd (rytme, skridt holdt, Akademi-lektioner set), aldrig på omsætning, resultat eller vækst: virksomhederne er af meget forskellig størrelse og i nogle tilfælde konkurrenter, og en størrelsesrangering er både uretfærdig og fortroligt.
- **Data:** samme som M1/M3, men på tværs af virksomheder — kræver en ny SECURITY DEFINER-funktion eller natlig snapshot-tabel med grænse (`N ≥ 5`) og afrunding. Dette er en ny sikkerhedsflade og skal med i `SECURITY_BASELINE.md`.
- **Risiko:** med ~34 virksomheder (færre aktive) kan små grupper afsløre enkeltes tal; «gennemsnit» af få er misvisende; en rytme på 0 % blandt mange kan demotivere. Skal først bygges, når M1 har kørt et par måneder.
- **Størrelse:** M.

### M5. Community-anerkendelse (positiv, ikke-rangeret)
- **Adfærd og værdi:** flere medlemmer, der svarer hinanden (peer-hjælp), er en netværkseffekt platformen mangler. Anerkendelse, fx «dit svar hjalp N», når andre likes/reagerer.
- **Data:** `community_reaktioner` (`svar_id`), `community_svar`; kun `like` findes.
- **Risiko:** aktiviteten er ikke målt; hvis Community er tyndt, belønner det 2-3 personer og virker udelukkende. Like-farming; medlemmer, der er direkte konkurrenter, deler måske ikke viden. OVERLEVERING.md:2211 lægger den bevidst i bunden.
- **Størrelse:** M. Udsættes til aktiviteten er målt.

## Rådgivere — tre mekanikker

### R1. Svartid og «ældste ubesvarede» (team-mål, kun internt)
- **Adfærd og værdi:** hurtigere første svar på medlemmets spørgsmål. Platformen lover udadtil «Vi svarer typisk inden for 24 timer» (`MemberChatPane.tsx:998`) og på sitet «rådgivere, der er der, når beslutningen opstår» (`OVERLEVERING.md:7743`) — ingen af delene er målt. Det er en direkte værdi at kunne sige «vores median er X timer», eller at opdage, at løftet ikke holder. Jonas' ønske («gns. svartid … presse os til at levere bedre») rammes direkte.
- **Data:** `messages` + `user_roles` (se 1.3); ingen ny tabel. Vis: median (kalendertimer) pr. 30 dage, andel besvaret inden næste hverdag kl. 12, ældste ubesvarede nu, og `n`.
- **Risiko:**
  - Kun to personer: en tavle pr. rådgiver er en duel mellem to medstiftere; anbefal ÉT teammål og ét privat «mit eget» tal.
  - Nævneren er uren (1.4 pkt. 2, 3): «Kræver ikke svar» og svar pr. telefon/mail tæller som ubesvaret. Tal skal vises som «målt i chatten», ikke som en dom.
  - Kalendertimer straffer weekender og helligdage; brug `hverdage.ts` for et husur (huset, ikke personen).
  - Belønner hurtigt fremfor godt («ok, vender tilbage» tæller som svar). Mål første substantielle svar eller kombiner med ældste ubesvarede.
  - Aldrig synlig for medlemmer som SLA (`grundlag.ts:76`: «Ikke en supportkanal med svartid»); brug den som intern styring, ikke som løfte.
  - Den, der SVARER, er ikke nødvendigvis den, der er tildelt (`assigned_advisor_id`).
- **Størrelse:** S til beregning og et kort på rådgiverforsiden; M hvis husuret og «kræver ikke svar»-registrering (én kolonne + skrivning) tages med.

### R2. «Intet venter» — ventetid på tværs af chat, community og ansøgninger
- **Adfærd og værdi:** ansøgere er omsætning, og en ansøgning der venter, er en tabt lead; community-tråde uden rådgiversvar skader netværkets værdi. Et samlet mål som «ingen ting hos os ældre end 2 hverdage» (og antal hverdage i træk, hvor det holder) er et konkret «noget at jagte».
- **Data:** `ansoegninger.indsendt_at` mod første `ansoegning_beslutninger` (`truffet_via = 'raadgiver'`); `community_traade` mod første rådgiver-`community_svar`; chat som R1. Rykkerne findes allerede (ansøgningstrappen; stille-klokker).
- **Risiko:** overlap med de eksisterende køer og klokker (`klokke-mail-cron`, rykkeren) — risiko for at duplikere alarmer og skabe støj; mål på «næste hverdag» kræver husur. Nævner for tråde er en lille mængde (få opslag).
- **Størrelse:** M.

### R3. Kontaktdækning — «alle har hørt fra et menneske de sidste 30 dage»
- **Adfærd og værdi:** proaktiv kontakt, ikke kun svar. Buckets «Ikke hørt fra længe» og stille-klokkerne finder tavse virksomheder; et samlet dækningstal pr. måned (fx «31 af 34 virksomheder har fået en rådgiverbesked de sidste 30 dage») er et fælles mål, ikke en duel.
- **Data:** `messages` (rådgiver, `message_type = 'user'`) pr. `company_id` + `is_demo`, `companies.status`/kontrakt (for at udelukke udløbne).
- **Risiko:** belønner tomme «hej»-beskeder (kvalitet kan ikke måles, se 1.4 pkt. 5); kræver enighed om, hvilke virksomheder der tæller (legat, abonnent, udløbne, demo).
- **Størrelse:** S–M.

## Anbefalet første skive

Værdi før byg (regel 4a): der er ikke bevist, at adfærden findes i data. Den første skive er derfor MÅLINGEN, og bygningen følger kun, hvis tallene bærer den.

**Trin 0 — mål (SQL nedenfor, kun SELECT, ét resultatsæt).** Svarer på: (a) hvor hurtigt svarer vi i dag, og holder «24 timer»? (b) hvor mange virksomheder har en rytme, som M1 kan vise? (c) er Community og opgaver aktive nok til M3-M5? (d) hvor mange spørgsmål har vi til at regne svartid på?

**Trin 1 — hvis SQL viser, at svartid kan regnes (n ≳ 100 spørgsmål):** byg **R1** som et lille kort på rådgiverforsiden (kun læsning, ingen migration, ingen medlemsflade). Det er det, der giver mest for mindst: det rammer Jonas' udtrykkelige ønske, det afprøver et løfte, huset allerede giver, og det kan ikke gå ud over medlemmer.

**Trin 2 — medlemssiden, parallelt og lige så lille:** **M1** som én linje i «Din måned» (data er allerede hentet). Kun hvis sektion 6 viser, at rytmen varierer mellem virksomhederne (flere med 1-5 af 6 måneder); hvis næsten alle har 0 eller 6, er der intet at jagte, og løsningen er ikke gamification, men aktivering (importen — jf. RAEKKEFOELGE.md:31).

**Udskudt bevidst:** M4 (kræver ny sikkerhedsflade + baseline), M5 (kræver aktivitet), point/niveauer (slettet 13/9 af gode grunde; kun tilbage, hvis D1 ender i «C»).

## SQL til Lovable SQL editor (kun SELECT, ét resultatsæt)

Skal køres i Lovable → SQL editor som ÉN sætning. Alle kolonner er `text`, så UNION ALL virker; sorteret på sektion og nøgle. Testet for syntaks og logik mod en lokal Postgres 16 med tabeller af samme kolonnenavne (fra `types.ts`) — **ikke kørt mod prod**. Læs ikke tal i sektion 6 som procent uden nævneren (`virksomheder_ikke_demo`).

Notater til læsningen:
- Sektion 1-3: et «spørgsmål» er første medlemsbesked i en række (forrige `user`-besked i samtalen var en rådgivers eller findes ikke). Svaret er den første senere rådgiver-`user`-besked i samme samtale. Kalendertimer, ikke arbejdstimer. `ubesvaret_aeldre_end_48t` rummer også samtaler, der blev afgjort med «Kræver ikke svar» (ikke registreret).
- `median_timer` og `p90_timer` er kun meningsfulde ved n ≳ 30; se `n=` i kolonnen `ekstra`.
- Sektion 6 tæller virksomheder (ikke demo) eller brugere (ikke rådgivere) som angivet i `ekstra`. `logget_ind_30d` er en distinkt tælling, så faneskift ikke forvrænger.
- `maalte_maaneder_af_seneste_6=N` er fordelingen af, hvor mange af de seneste seks kalendermåneder (incl. den igangværende) en virksomhed har en godkendt, målt række for; den igangværende måned kan endnu ikke være godkendt, så toppen er 5 for de fleste.
- Sektion 7 er rådgiver-KPI'erne. `raadgiveropgaver_*`, `klokke_laest_*` og `2_chat_svartid_pr_svarer` viser navne; det er MÅLING til Jonas, ikke en flade.

```sql
WITH raadg AS (
  SELECT DISTINCT user_id FROM public.user_roles WHERE role IN ('advisor','admin')
),
u AS (
  SELECT m.id, m.conversation_id, m.created_at, m.sender_id,
         (m.sender_id IN (SELECT user_id FROM raadg)) AS er_r
  FROM public.messages m
  WHERE m.message_type = 'user'
),
s AS (
  SELECT u.*, lag(u.er_r) OVER (PARTITION BY u.conversation_id ORDER BY u.created_at, u.id) AS forrige_r
  FROM u
),
st AS (
  SELECT * FROM s WHERE NOT er_r AND (forrige_r IS NULL OR forrige_r)
),
par AS (
  SELECT st.id, st.conversation_id, st.created_at AS sp_at, r.created_at AS svar_at, r.sender_id AS svarer,
         EXTRACT(EPOCH FROM (r.created_at - st.created_at)) / 3600.0 AS timer
  FROM st
  LEFT JOIN LATERAL (
    SELECT u2.created_at, u2.sender_id FROM u u2
    WHERE u2.conversation_id = st.conversation_id AND u2.er_r AND u2.created_at > st.created_at
    ORDER BY u2.created_at LIMIT 1
  ) r ON true
),
virk AS (
  SELECT id FROM public.companies WHERE COALESCE(is_demo, false) = false
),
ikke_r AS (
  SELECT cm.user_id, cm.company_id FROM public.company_members cm
  WHERE cm.company_id IN (SELECT id FROM virk) AND cm.user_id NOT IN (SELECT user_id FROM raadg)
),
maal6 AS (
  SELECT v.id, COUNT(f.id) AS n
  FROM virk v
  LEFT JOIN public.financial_report_facts f
    ON f.company_id = v.id AND f.data_basis = 'measured'
   AND f.period_key >= to_char(now() - interval '6 months', 'YYYY-MM')
  GROUP BY v.id
)
SELECT '1_chat_svartid_samlet' AS sektion, 'spoergsmaal_i_alt' AS noegle, COUNT(*)::text AS vaerdi, '' AS ekstra FROM par
UNION ALL SELECT '1_chat_svartid_samlet', 'besvaret', COUNT(svar_at)::text, '' FROM par
UNION ALL SELECT '1_chat_svartid_samlet', 'ubesvaret_aeldre_end_48t', COUNT(*)::text, 'kan vaere «kraever ikke svar» - ikke gemt' FROM par WHERE svar_at IS NULL AND sp_at < now() - interval '48 hours'
UNION ALL SELECT '1_chat_svartid_samlet', 'median_timer', ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY timer))::numeric, 1)::text, '' FROM par WHERE svar_at IS NOT NULL
UNION ALL SELECT '1_chat_svartid_samlet', 'p90_timer', ROUND((percentile_cont(0.9) WITHIN GROUP (ORDER BY timer))::numeric, 1)::text, '' FROM par WHERE svar_at IS NOT NULL
UNION ALL SELECT '1_chat_svartid_samlet', 'pct_besvaret_inden_4t', ROUND(100.0 * COUNT(*) FILTER (WHERE timer <= 4) / NULLIF(COUNT(*), 0))::text, 'af besvarede' FROM par WHERE svar_at IS NOT NULL
UNION ALL SELECT '1_chat_svartid_samlet', 'pct_besvaret_inden_24t', ROUND(100.0 * COUNT(*) FILTER (WHERE timer <= 24) / NULLIF(COUNT(*), 0))::text, 'af besvarede' FROM par WHERE svar_at IS NOT NULL
UNION ALL SELECT '2_chat_svartid_pr_svarer', COALESCE(p.full_name, par.svarer::text), ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY par.timer))::numeric, 1)::text, 'n=' || COUNT(*)
  FROM par LEFT JOIN public.profiles p ON p.user_id = par.svarer WHERE par.svar_at IS NOT NULL GROUP BY COALESCE(p.full_name, par.svarer::text)
UNION ALL SELECT '3_chat_svartid_pr_maaned', to_char(sp_at AT TIME ZONE 'Europe/Copenhagen', 'YYYY-MM'), ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY timer))::numeric, 1)::text, 'n=' || COUNT(*)
  FROM par WHERE svar_at IS NOT NULL GROUP BY 2
UNION ALL SELECT '4_chat_aktivitet_pr_maaned', to_char(u.created_at AT TIME ZONE 'Europe/Copenhagen', 'YYYY-MM'),
  'medlem=' || COUNT(*) FILTER (WHERE NOT u.er_r) || ' raadgiver=' || COUNT(*) FILTER (WHERE u.er_r),
  'virksomheder_der_skrev=' || COUNT(DISTINCT c.company_id) FILTER (WHERE NOT u.er_r)
  FROM u JOIN public.conversations c ON c.id = u.conversation_id GROUP BY 2
UNION ALL SELECT '5_ubesvaret_nu', 'samtaler_der_venter_paa_raadgiver', COUNT(*)::text,
  'aeldste_timer=' || COALESCE(ROUND(MAX(EXTRACT(EPOCH FROM (now() - last_member_message_at)) / 3600.0))::text, '-')
  FROM public.conversations WHERE awaiting_reply_from = 'advisor'
UNION ALL SELECT '6_medlem_30_90d', 'virksomheder_ikke_demo', COUNT(*)::text, '' FROM virk
UNION ALL SELECT '6_medlem_30_90d', 'skrev_i_chat_30d', COUNT(DISTINCT c.company_id)::text, 'virksomheder'
  FROM u JOIN public.conversations c ON c.id = u.conversation_id WHERE NOT u.er_r AND u.created_at > now() - interval '30 days' AND c.company_id IN (SELECT id FROM virk)
UNION ALL SELECT '6_medlem_30_90d', 'logget_ind_30d', COUNT(DISTINCT i.company_id)::text, 'virksomheder (faneskift taeller; kun distinkt)'
  FROM public.user_login_log l JOIN ikke_r i ON i.user_id = l.user_id WHERE l.logged_in_at > now() - interval '30 days'
UNION ALL SELECT '6_medlem_30_90d', 'godkendte_tal_60d', COUNT(DISTINCT company_id)::text, 'virksomheder (committed_at = seneste godkendelse)'
  FROM public.financial_report_facts WHERE committed_at > now() - interval '60 days' AND company_id IN (SELECT id FROM virk)
UNION ALL SELECT '6_medlem_30_90d', 'maalte_maaneder_af_seneste_6=' || n, COUNT(*)::text, 'virksomheder' FROM maal6 GROUP BY n
UNION ALL SELECT '6_medlem_30_90d', 'community_forfattere_90d', COUNT(DISTINCT x.uid)::text, 'brugere (traad eller svar)'
  FROM (SELECT forfatter_id AS uid FROM public.community_traade WHERE created_at > now() - interval '90 days' AND status = 'aktiv'
        UNION ALL SELECT forfatter_id FROM public.community_svar WHERE created_at > now() - interval '90 days' AND status = 'aktiv') x
  WHERE x.uid IN (SELECT user_id FROM ikke_r)
UNION ALL SELECT '6_medlem_30_90d', 'community_reagerede_90d', COUNT(DISTINCT bruger_id)::text, 'brugere (likes)'
  FROM public.community_reaktioner WHERE created_at > now() - interval '90 days' AND bruger_id IN (SELECT user_id FROM ikke_r)
UNION ALL SELECT '6_medlem_30_90d', 'community_laeste_30d', COUNT(DISTINCT bruger_id)::text, 'brugere (unik visning pr. traad)'
  FROM public.community_visninger WHERE set_at > now() - interval '30 days' AND bruger_id IN (SELECT user_id FROM ikke_r)
UNION ALL SELECT '6_medlem_30_90d', 'akademi_set_30d', COUNT(DISTINCT user_id)::text, 'brugere'
  FROM public.member_progress WHERE seen_at > now() - interval '30 days' AND user_id IN (SELECT user_id FROM ikke_r)
UNION ALL SELECT '6_medlem_30_90d', 'event_tilmeldte_90d', COUNT(DISTINCT user_id)::text, 'brugere (kun tilmelding, ikke fremmoede)'
  FROM public.event_registrations WHERE registered_at > now() - interval '90 days' AND response = 'attending' AND cancelled_at IS NULL AND user_id IN (SELECT user_id FROM ikke_r)
UNION ALL SELECT '6_medlem_30_90d', 'opgaver_status_oprettet_90d=' || status, COUNT(*)::text, 'raekker'
  FROM public.company_actions WHERE created_at > now() - interval '90 days' AND company_id IN (SELECT id FROM virk) GROUP BY status
UNION ALL SELECT '6_medlem_30_90d', 'pulse_checkin_90d', COUNT(DISTINCT company_id)::text, 'virksomheder'
  FROM public.pulse_checkins WHERE created_at > now() - interval '90 days' AND company_id IN (SELECT id FROM virk)
UNION ALL SELECT '6_medlem_30_90d', 'certifikat_hentet_brugere', COUNT(DISTINCT user_id)::text, 'brugere' FROM public.certificate_downloads
UNION ALL SELECT '7_raadgiver_kpi', 'community_foerste_raadgiversvar_median_timer',
  ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (rs.svar_at - t.created_at)) / 3600.0))::numeric, 1)::text, 'n=' || COUNT(*)
  FROM public.community_traade t
  JOIN LATERAL (SELECT MIN(s2.created_at) AS svar_at FROM public.community_svar s2 WHERE s2.traad_id = t.id AND s2.status = 'aktiv' AND s2.forfatter_id IN (SELECT user_id FROM raadg)) rs ON rs.svar_at IS NOT NULL
  WHERE t.status = 'aktiv' AND t.forfatter_id NOT IN (SELECT user_id FROM raadg)
UNION ALL SELECT '7_raadgiver_kpi', 'community_traade_uden_raadgiversvar_over_48t', COUNT(*)::text, 'traade fra medlemmer'
  FROM public.community_traade t
  WHERE t.status = 'aktiv' AND t.forfatter_id NOT IN (SELECT user_id FROM raadg) AND t.created_at < now() - interval '48 hours'
    AND NOT EXISTS (SELECT 1 FROM public.community_svar s2 WHERE s2.traad_id = t.id AND s2.status = 'aktiv' AND s2.forfatter_id IN (SELECT user_id FROM raadg))
UNION ALL SELECT '7_raadgiver_kpi', 'ansoegning_indsendt_til_foerste_raadgiverbeslutning_median_timer',
  ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (b.foerste - a.indsendt_at)) / 3600.0))::numeric, 1)::text, 'n=' || COUNT(*)
  FROM public.ansoegninger a
  JOIN (SELECT ansoegning_id, MIN(truffet_at) AS foerste FROM public.ansoegning_beslutninger WHERE truffet_via = 'raadgiver' GROUP BY ansoegning_id) b ON b.ansoegning_id = a.id
  WHERE a.indsendt_at IS NOT NULL
UNION ALL SELECT '7_raadgiver_kpi', 'raadgiveropgaver_' || COALESCE(p.full_name, o.ejer_id::text),
  'aaben=' || COUNT(*) FILTER (WHERE o.status = 'aaben') || ' gjort=' || COUNT(*) FILTER (WHERE o.status = 'gjort'),
  'gjort_efter_frist=' || COUNT(*) FILTER (WHERE o.status = 'gjort' AND o.frist IS NOT NULL AND o.gjort_at::date > o.frist)
  FROM public.raadgiver_opgaver o LEFT JOIN public.profiles p ON p.user_id = o.ejer_id GROUP BY COALESCE(p.full_name, o.ejer_id::text)
UNION ALL SELECT '7_raadgiver_kpi', 'klokke_laest_median_timer_' || COALESCE(p.full_name, n.advisor_id::text),
  ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (n.read_at - n.created_at)) / 3600.0))::numeric, 1)::text, 'n=' || COUNT(*)
  FROM public.advisor_notifications n LEFT JOIN public.profiles p ON p.user_id = n.advisor_id
  WHERE n.advisor_id IS NOT NULL AND n.read_at IS NOT NULL GROUP BY COALESCE(p.full_name, n.advisor_id::text)
ORDER BY 1, 2;
```

**Hvad tallene afgør (beslutningsregel, skrevet FØR målingen så den ikke tilpasses bagefter):**
- `spoergsmaal_i_alt` < ca. 60 eller `besvaret` langt under `spoergsmaal_i_alt`: svartid er ikke at bygge et mål på endnu; registrér «Kræver ikke svar» først (én kolonne).
- `median_timer` og `pct_besvaret_inden_24t`: viser, om «24 timer» holder. Hvis den ikke gør, er løftet i `MemberChatPane.tsx:998` selv en fejl, der bør rettes før eller sammen med R1.
- `maalte_maaneder_af_seneste_6=…` fordelt over 0–6: bred spredning = M1 har noget at vise; en klump ved 0 = problemet er aktivering, ikke motivation.
- `opgaver_status_oprettet_90d=*`: hvis `done` er en meget lille andel af `active`+`done`+`not_done`, så vent med M3.
- `community_forfattere_90d` og `community_traade_uden_raadgiversvar_over_48t`: tyndt = vent med M5 og med community-delen af R2.

---

## Kilder (læst)
`BACKLOG.md:1486-1505` · `docs/RAEKKEFOELGE.md:31, 58-79, 215` · `docs/claude-regelsaet.md:61-75` · `docs/chat-design.md` · `docs/medlemschat-recon.md` · `docs/raadgiverfladen-design.md` · `docs/aktiveringsmaaling-27-august.md` · `docs/OVERLEVERING.md:2205-2211, 6801-6825, 7743, 10297` · `docs/mangelliste.html:3532` · `docs/hjemmebane/c0-inventar.md:131` · `docs/opstart-30-09.md:29-32` · `supabase/migrations/20260224095552…:41-43`, `20260913231500…`, `20260311050600…`, `20260420223823…`, `20260317200420…:270-278`, `20260822220000…`, `20260918200000_ansoegninger.sql:216-222`, `20260908170000_raadgiver_opgaver.sql` · `src/integrations/supabase/types.ts` (tabelrækker som angivet) · `src/components/CompanyChatPane.tsx:1098-1110` · `src/components/MemberChatPane.tsx:998` · `src/lib/marketing/grundlag.ts:76` · `src/lib/hjemmebane/dinMaaned.ts` · `src/lib/onboardingTjekliste.ts` · `src/lib/certifikat/dom.ts` · `src/components/hjemmebane/akademi/HbProgressBar.tsx`, `HbKursusKort.tsx`.

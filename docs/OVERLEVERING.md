# Overlevering

> ## 15/9 — START HER (skrevet 15/9 eftermiddag efter STRIPE-MIGRERINGENS AFSLUTNING — Dashboard og prod-SQL, INGEN PR i dag; DEL 2 «15. september» §1–§7 — HEAD `8cb93d38` = #890 (de seks idéer før webinaret), commit-tid 15/9 00:42:13 dansk; #889 = `e9f8fed1` 00:33:46 dansk (podcasten er ude, og de tyve før webinaret); #888 = `130c366f` 00:24:57 dansk (podcasten ud af platformen); #887 = `5f80e71b` 14/9 23:31:40 dansk (Stripe-migreringen er i gang); #886 = `319f3f40` 14/9 23:24:56 dansk (tjeklistepunktet «Fortæl det videre»). `gh pr view 886 --json number,title,state,mergedAt` svarede ordret: `{"mergedAt":"2026-09-14T21:24:57Z","number":886,"state":"MERGED","title":"Delingens del 2 — tjeklistepunktet «Fortæl det videre»"}`; samme for 887: `{"mergedAt":"2026-09-14T21:31:40Z","number":887,"state":"MERGED","title":"Bogføring — Stripe-migreringen er i gang"}`. 14/9-blokkens HEAD-liste sprang #886 og #887 over, og DEL 3 sagde at delingens del 2 var åben — begge ER merget (§7). Blokken «14/9 — START HER» nedenfor er historik.)
>
> **MIGRERINGEN ER FÆRDIG — 13 AF 13 (§1). Intet af det er kode; alt er gjort i Stripe Dashboard og målt via MCP (begge konti, livemode). Klokkeslæt er dansk tid.** De elleve gamle abonnementer på Topix.dk (`acct_1QP3Js4DoYItGRbI`) er annulleret af Jonas 15/9 kl. 17:05:04–17:37:33 dansk, alle «Immediately» + «No refund», i fristrækkefølge; efter hver er målt status `canceled`, det gamle schedule annulleret i samme sekund, ingen ny faktura, kundesaldo 0 — samme form som forlægget (Livjas annullering 14/9). Tabellen med alle elleve (Stripe-navn, gammelt `sub_…`, `ended_at`, nyt `sub_sched_…`, nyt start, nye træk, talt) står i §1. De nye starter: KJ AUTO og Homie 20/9 · Two Socks 26/9 · WESDEX og YKRG 29/9 · TuaMea, Floren og BR Roset 3/10 · Brick Works og ANLA 7/10 · Launch Lab 15/10 — alle kl. 00:00 dansk. **Sweep:** Topix.dk har TO aktive tilbage, begge med `cancel_at` = periodens slut (21/9 kl. 18:33 og 29/9 kl. 11:02 dansk — passer med Pro-Vision og PHILBERT, kundenavnene er IKKE læst; de fornys, flyttes ikke). The Boardroom (`acct_1U6mzp3CvBmCx5Pt`) har 13 schedules, alle `not_started`, ingen annulleret eller frigivet. **Rollback-vinduet (19/9 23:57 UTC) bruges ikke.**
> **YKRG — EN ÅBEN FAKTURA, VOIDET OG ERSTATTET (§2).** Fundet før annulleringen: `UVXL7LPI-0003` (`in_1TndPW4DoYItGRbImwCneZ3j`), juni-raten 29/6–29/7-2026, 5.468,75 kr. inkl. moms, 0 betalt, 9 forsøg, ingen flere planlagt. Stripes dokumentation: en annullering stopper opkrævningen af abonnementets åbne fakturaer, men lukker dem ikke — de kan stadig betales. Jonas' valg: annullér som de andre; juni sendt som manuel faktura i e-conomic 15/9; Stripe-fakturaen VOIDET kl. 17:18:09 dansk med intern note (void, ikke uncollectible — en voidet kan ikke betales). Tælling: 4 betalte + juni (e-conomic) + 7 nye = 12. **ÅBENT, ikke kode: bogholderen skal have besked om at `UVXL7LPI-0003` er voidet og erstattet.** VURDERING: tre af hendes fire træk krævede 2–8 forsøg, så første træk 29/9 kl. 00:00 dansk fejler sandsynligvis første gang — i så fald det første rigtige `invoice.payment_failed` og beviset for #815's klokke. Nye fælder i DEL 4: tjek åbne fakturaer FØR annullering; et ustartet schedule har intet abonnement-objekt og kan se «ikke oprettet» ud.
> **BR ROSET — FUND 20 LUKKET (§3).** 7 betalte (686P23XT-0001–0007), første 3/3-2026, gammelt `cancel_at` 3/3-2027 = 12 træk; nyt schedule 5, så 7 + 5 = 12. «Ti måneder» var en forkert STARTDATO (3/5) i platformen, ikke ti rater. Jonas bekræftede 15/9 start 3/3-2026 og rettede `contract_start_date` (vejen er ikke oplyst); MÅLT i SQL: 2026-03-03 → 2027-03-03, active, `stripe_customer_id` tom.
> **LAUNCH LAB ER PLATFORMENS «remm.» (§4).** SQL på `companies.name ILIKE '%launch%'` gav NUL rækker; via `daniel@launchlab.dk` → `auth.users` → `company_members`: remm. (`9f00e582-1050-4d47-ba8f-221e75e72fab`), kontrakt 2026-06-15 → 2027-06-15, active. Stripe-kunden er Launch Lab ApS (`cus_UhtEkpmNL8TlrN`, `eu_vat` DK44921952). Trækket 15/9 på den gamle konto betalt kl. 08:53 dansk (B0SIZONV-0004); 4 betalte, 8 tilbage. Nyt schedule i hånden som Livjas: `sub_sched_1UFyOj3CvBmCx5Pta4mZHhFA`, start 15/10 00:00 dansk, slut 15/6-2027 00:00 dansk = 8 måneder, `nyt_50000_rate12` (4.375 kr. ekskl. moms, samme beløb), fase-metadata art/company_id/migreret_fra/migreret_dato; det gamle annulleret først efter målingen af det nye. Ny fælde i DEL 4: et navn er ikke en nøgle mellem platform og Stripe (remm. = Launch Lab ApS, ANLA GLAS = ANLA A/S, Two Socks = «TS Warehuose», YKRG = «Tapas@tapasamor.dk»).
> **MÅLT FØR FØRSTE TRÆK PÅ DEN NYE KONTO (§5).** Alle 13 schedules har `default_payment_method` null; alle 13 kunder har `invoice_settings.default_payment_method` sat — fakturaerne bruger kundens, så «elleve af fjorten uden betalingsmiddel på abonnementet» er ikke en risiko for første træk (kortenes gyldighed IKKE målt). Metadata ligger på FASEN og skrives på abonnementet når fasen starter — Livjas fase starter 15/9 kl. 22:00 UTC, beviset er `customer.subscription.created` i Workbench → Event deliveries 16/9. TuaMeas kort matcher på brand/last4/udløb/funding (fingerprints er forskellige på to konti); hendes schedule slutter 1/2-2027, stadig 4 træk. Et schedule der slutter præcis på et træktidspunkt, giver ikke et træk mere. **ÅBENT (nyt kort):** de tre Dashboard-lavede schedules (Livja, Fjeldgaardshop, Launch Lab) bærer fakturafooteren «… kontakt@topix.dk · theboardroom.dk» — fladerne siger kontakt@theboardroom.dk (#852, #856, #860); formentlig kontoens standard (IKKE målt). Livjas første træk 16/9 går uden varsel (fund 19 står åbent).
> **DEN GAMLE KONTO, FØR DEN LUKKES (§6; nyt kort).** Åbne fakturaer efter voiden: ingen blandt de 13. Tilbage: Olsen & Kompagni ApS `C6URSTNW-0002` og `-0004` (4.375 kr. hver, abonnement ikke aktivt), `RAH8SGET-0001` Ditte Lindemose (50.000 kr., manuel 22/5-2025) og en række Premium/VÆKST-årsfakturaer fra marts 2025 — skal afgøres før kontoen lukkes. e-conomic-integrationen står på de betalte med «Your free trial has expired». Trækhistorikken (§44 fra 14/9) er stadig ikke hentet.
> **RETTELSER (§7):** DEL 4 «22:00 UTC er midnat dansk» gælder kun til sommertiden slutter 25/10-2026 — derefter trækker de nye kl. 23:00 dansk dagen FØR (Livja 15/11 kl. 23:00, ikke 16/11). #886 og #887 er merget (svaret ovenfor). Dashboard viser «More actions» og «Failed», ikke «⋯» og «Open» — knapnavne dikteres ikke af hukommelsen, og Dashboardets tidsstempler er dansk tid.
> **ÅBENT EFTER I DAG:** bogholderen og `UVXL7LPI-0003` · Livjas event 16/9 (bevis for `metadata.art`) · YKRG's første træk 29/9 (VURDERING: #815-bevis) · fakturateksten med kontakt@topix.dk · åbne fakturaer på den gamle konto før den lukkes · `stripe_customer_id` for de tretten (SQL) · trækhistorikken ind i `company_traek` · varsler før træk (fund 19, valg eller forglemmelse).
> **RETTELSER TIL BOGFØRINGEN, 15/9 SEN EFTERMIDDAG (samme dag, før commit):** (1) BR Roset-rækken i DEL 3 havde fire celler — «Var:»-citatet bar den gamle rækkes lodrette streg; omskrevet. (2) «Ren frontend» om #886 var ikke målt — PR'ens tolv filer er nu læst med `gh` og står ordret i §7: to ligger under `supabase/` (`_shared/onboardingRytme.ts` og migrationen `20260914220000_deling_hentet_at.sql`), så udrulningen kræver mere end Update-klik; om migrationen er kørt, er IKKE målt. (3) DEL 3-rækken «ÅBENT — del 2 (tjeklistepunktet)» er rettet til MERGET 14/9 (#886, `319f3f40`); mangellistens kort nr. 3 af 18 har fået linjen. (4) De to nye lukket-mærker i mangellisten har fået `class="tag loest"` som husets andre. (5) Vindue B's recon af SQL'en for de 35 (`~/Downloads/recon-de-35-kontaktperson.md`) bogført i DEL 2 «14. september» §39 «RETTET 15/9 — SQL-TEKSTEN»: teksten findes kun i sessionsudskriften `78e51945…jsonl:308`; SELECT og UPDATE står ordret som IKKE KØRT; guarden er `coalesce(trim(contact_person), '') = ''` med `status = 'active'` og kilden `application_context->>'contact_name'`, ikke `AND contact_person = ''`; hvem der læser feltet (mailtiltaler, signup-forudfyldning, liste/virksomhedsside kun uden owner, søgning altid) står med fil:linje; DEL 3-rækken og mangellistens kort rettet. Ingen SQL kørt.
> **AFTEN — SAMLEMAILENS MOTOR BYGGET (§8) OG #886'S UDRULNING MÅLT (§9); ingen PR endnu.** Jonas 15/9: højst én samlemail pr. modtager pr. dansk døgn fra kl. 17 dansk, tidspunktet på hver linje; præsentationer MED (fund H afgjort; fallback: info i to uger hvis ikke bevist 21/9); typerne `event_published` + `community_opslag` (chattens forslag, ikke modsagt); datoformatet er eventMails.ts' `datoOrd`/`tidOrd`, genbrugt VED IMPORT — chattens beslutning 15/9 (tilføjelsen til opgaven), ikke Jonas' (tre formater i huset, fil:linje i §8; ingen tredje kopi). Motoren: ÉN fil, `supabase/functions/_shared/samlemail.ts` (som eventMails/opslagsMail), importerer originalerne (datoOrd/tidOrd, escHtml, knappen, tiltale, copenhagenHour — kun gjort export), rene funktioner (tid i dansk tid, én pr. dansk døgn, 48 t, emne, tidsmærke, mail), testet fra `src/lib/__tests__/samlemail.test.ts` (39 tests); tsc 0; 3477 tests (229 filer); deno check grøn. Første udgave (src/lib-spejl + importfri kopier) er omarbejdet FØR commit — importen fjernede grunden til spejlet, og kopierne kunne glide. ÅBENT: rammen findes i tre kopier (§8) — IKKE integreret i `send-notification-email`; næste skridt er integrationen med tørkørsel, og 12-timers-reglen skal undtages for samlemailens typer. #886: migrationen `deling_hentet_at` er KØRT (målt 20:03), `onboarding-rytme` udrullet 18:09 UTC (Lovables udsagn); ubevist: mail A's linje og frontenden. CI på #891 grøn med én Node 20-advarsel (ordret i §9). Fejl i dag: fund H kaldt «besluttet» uden at læse kortet — rettet samme besked. DEL 3: mailloft-rækken BESLUTTET/motor bygget, to nye rækker (#886's udrulning, CI-annotationen); DEL 4: skalsyntaks-fælden udvidet. Mangellisten: w-h → BESLUTTET (mangler, bygges), n14-11 ført à jour, w3's mærke rettet.
> **SENT — MAILLOGGENS STATUSREGEL (§10) OG LOVABLES EKSTRA COMMIT (§11); migration skrevet — KØRT 15/9 kl. 21:14 dansk efter #893, målt efter med `rate_limited` i reglen (§10).** Målt i prod 15/9: `email_send_log` HAR CHECK'en `email_send_log_status_check` med syv værdier — uden `rate_limited`. `managedEmail.ts` log() (`:94-112`) gør kun `console.error` ved fejl, så et 429 har ALDRIG stået i loggen siden #857 — køen stopper rigtigt, sporet mangler; de sidste 7 dage: sent 216, failed 11. Reglen kom fra `20260319090407_email_infra.sql`, som Lovable slettede 8/9 (`68d86a46`): filen væk, reglen i prod; to filhoveder sagde «text uden CHECK» — rettet. Migrationen `20260915210000` tilføjer kun `rate_limited` (KØRT 21:14 dansk, `pg_get_constraintdef` efter viser den); værnet `emailSendLogStatus.guard.test.ts` kræver hver logget status tilladt og beviser sig selv på en kopi uden værdien. tsc 0; 3481 tests (230 filer); deno grøn på de to rørte filer. Alle steder der sagde «429 står som rate_limited i loggen» er mærket RETTET 15/9 (§10). §11: udrulningsprompten til `onboarding-rytme` gav to Lovable-commits på main (`9780f1cf` +3 i `types.ts`, `76f7e735` merge) mens build-chatten svarede «ingen filer rørt» — ændringen er rigtig, CI grøn på #892; set i `git pull`, ikke i svaret. DEL 4: ny fælde (slettet migrationsfil, regel i prod) og «deployet ✅»-fælden udvidet; DEL 3: ny række.
> **SENEST — SAMLEMAILENS MOTOR DEL 2 (§12), CARMA STUDIO (§13); migrationen og kontaktpersonerne er KØRT.** Motor del 2 i `_shared/samlemail.ts`: vinduet 17–20 dansk (chattens beslutning a), mapperne `punktFraEvent`/`punktFraOpslag` med udeladelsesgrunde (b–c), forældet 48 t (d), rådgiver/pref/ingen mail/kvote (e), «sidst sendt» via `email_send_log` label `notification-samlemail` og idempotency-nøgle pr. dansk dato (f), fornavn = første ord (g) — ALT chattens beslutninger, ikke Jonas'. `fordelSamlemail` med invarianten «hver række præcis ét sted»; 60 tests; tsc 0; Test Files 230 passed (230), Tests 3505 passed (3505); deno grøn. IKKE integreret — næste skridt er `send-notification-email` med tørkørsel og bevidst opdatering af kildeværnene (§12). **Kørt i prod 15/9 aften:** migrationen `20260915210000` kl. 21:14 dansk (`rate_limited` i reglen, målt), og kontaktpersonerne for de 25 i to trin (9 fra ansøgningen, 16 fra ejerens profilnavn — Jonas' valg A); tilbage uden: kun CARMA STUDIO — *RETTET 15/9 (§14): et UDLØBET medlem i forlængelsesvinduet, ikke et tidligere; Camilla Risager skal skrives som contact_person, ÅBENT*. DEL 4: CI-blokken skal vente på ALLE kørsler på commit-id'et, «Tests» iblandt. Mangellisten: n14-4 LUKKET (bliver stående); n14-11 og w-h ført à jour; 163 kort, 16 lukkede.
> **SIDST — FORLÆNGELSESVINDUET (§14): CHATTENS FEJL, JONAS' BESLUTNINGER, RETTELSER.** Chatten foreslog «tilbyd_ikke» + «tidligere» for CARMA STUDIO og Studio Mini for at stoppe rapportpåmindelser — Jonas afviste det: «Hvad nu hvis? CARMA Studio gerne vil forlænge om to dage …». CARMA er et UDLØBET medlem i forlængelsesvinduet (`udloebet_tilbyd`, dag 4 af 14 den 15/9, tilbud t.o.m. 25/9), ikke tidligere; §13, §39, DEL 3 og n14-4 er mærket RETTET; Camilla Risager skal skrives som contact_person (ÅBENT, egen række). Jonas 15/9: udløbne i vinduet skal ikke have rapportpåmindelser «og alle mulige andre ting» fra platformen, men en til to mails — valg A: dag 1 og dag 11, kun ved «tilbyd»; /virksomheder: ikke på oversigten, men skal kunne findes. Målt 21:37: «Viser 27 af 29» — fem `active` uden for listen, filtrene ikke målt; recon i vindue B. Chattens retning (ikke besluttet): én mailregel i køen og hver strøm, vinduesmails stemplet som varslerne, søgning uden for oversigten, tilstanden er `afgoerFornyelsestilstand`. Studio Mini: FORLÆNGER IKKE (6/9) står, intet ændret, vinduet lukker efter 19/9. DEL 4: ny fælde «Et udløbet medlem er ikke et tidligere medlem». Mangellisten: nyt kort (Betaling og fornyelse), 164 kort, 16 lukkede.
>
> **Mangellisten:** migrationskortet LUKKET (13 af 13; resterne henviser til deres egne kort) og «BR Rosets kontrakt er ti måneder» LUKKET (startdatoen rettet) — begge bliver stående; «Tre har en anden mail …» udvidet med navnene fra fælden; «Ingen varsler før et træk …» noterer at Livjas første træk 16/9 går uden varsel, beslutningen står åben; «Beviser der udestår» et ellevte (Livjas event 16/9) og et tolvte (YKRG 29/9, VURDERING); Rækkefølgens punkt 2: (1)–(3) gjort. To nye kort (Betaling og fornyelse): «Fakturaerne på den nye konto siger kontakt@topix.dk» og «Åbne fakturaer på den gamle konto skal afgøres før den lukkes». 163 kort (162 + skabelonen), 15 lukkede, 148 åbne. DEL 3: migrationsrækken GJORT 15/9, BR Roset-rækken LUKKET, DE TYVE (1)–(3) GJORT, seks nye rækker. DEL 4: «22:00 UTC er midnat dansk» rettet (kun til 25/10); tre nye fælder (en annullering lukker ikke åbne fakturaer; et navn er ikke en nøgle; et ustartet schedule har intet abonnement-objekt); knapnavne under «En URL dikteres ikke af hukommelsen».
>
> ## 14/9 — START HER (skrevet 14/9 formiddag; OPDATERET 14/9 MIDDAG efter #853–#857, og IGEN 14/9 EFTERMIDDAG efter #858–#860, og IGEN efter GENNEMKØRSLEN 11:26–11:38 UTC, og IGEN 14/9 SEN EFTERMIDDAG efter #863–#864, og IGEN 14/9 AFTEN efter #865–#876, og SIDST 14/9 SEN AFTEN efter #877–#880, og IGEN 14/9 NAT efter #882–#884, og SIDST 14/9 NAT efter #885 og STRIPE-MIGRERINGEN (Dashboard, ingen PR — §41–§44) — HEAD `7260a38a` = #885 (bogføringen: dagskvoten, kontaktpersonen, klokken, vinduet), merget 20:27:25 UTC; #884 = `a417618b` 20:10:24 (klokken: ren tekst, læselig driftsbesked, knappen øverst); #883 = `719076a7` 20:04:13 (kontaktpersonen ad begge veje); #882 = `ee598862` 17:55:51 (dagskvoten tæller kun «sent»); #881 = `72efb590` 15:59:21 (bogføringen: sidste runde); #880 = `87a03508` 15:51:53 (like fra feedet); #879 = `003fc3a7` 15:30:47 (cover/contain i px); #878 = `70f80e06` 15:27:06 (bogføringen: delingen er bygget); #877 = `8accaab2` 15:23:42 (menupunktet «Fortæl det videre»); #876 = `a7dc51d8` 15:15:52 (optagelsesdatoen fra kontrakten); #875 = `011cc580` 15:11:06 (billedversionen); #874 = `a445526d` 14:54:59 (teksten til opslaget); #873 = `c3a84745` 14:42:19 (Hent PNG); #872 = `16340752` 14:29:17 (billederne huskes); #871 = `cf664a3d` 14:25:18 (tolv varianter); #870 = `a5dd8213` 13:51:11 (hendes data); #869 = `1331a2f3` 13:41:58 (skalaen); #868 = `140fea16` 13:27:16 (galleri og fuldskærm); #867 = `ec5ff360` 13:21:45 (bogføringen: nr. 16); #866 = `64223ce2` 13:06:26 (første kreativ); #865 = `e9c47ec0` 12:49:19 (designfilerne ind i repoet); #864 = `4f82e7c4` 12:16:20 (kortet siger hvad man gør); #863 = `eecb52bd` 11:57:49 (bogføringen efter gennemkørslen); #862 = `5c18abd7` 11:21:33 (eftermiddagens bogføring); #861 = `5796943d` 11:18:06 (velkomstteksten); #860 = `fc3b2565` 11:00:28 UTC; #859 = `a30851cf` 10:44:53; #858 = `048fcbfe` 10:33:32 (middagens bogføring); #857 = `588db663` 10:00:35 UTC; #856 = `0f4d8396` 09:56:59; #855 = `b60df81d` 09:48:17; #854 = `0fd6d216` 09:44:47 (formiddagens bogføring); #853 = `c115e737` 09:23:16; #852 = `66b4a732` 08:01:50; #851 = `72d25525` 07:43:29 UTC. OG 15/9 NAT: HEAD `130c366f` = #888, merget 14/9 22:24:57 UTC (00:24 dansk) — podcasten ud af platformen (§45); DE TYVE FØR 22/9 står i §46; DE SEKS IDÉER FØR 22/9 (Jonas 15/9 kl. 01:00) i §47. Blokken «13/9 — START HER» nedenfor er historik.)
>
> **FUND 1 — INDGANGENS KÆDE HAR ALDRIG VIRKET, fordi den aldrig havde en indgang.** Mondays indbyggede «send a webhook»-opskrift sender INGEN Authorization-header (Mondays udviklerdokumentation: signeret JWT kommer kun når webhooken oprettes via `create_webhook` med en integrations-apps OAuth-token og appens signing secret). `monday-webhook` krævede headeren (`:194-198` før #851) og afviste 401 før alt andet. DERTIL: de to Monday-automationer der kaldte webhooken (oprettet 21/3 2026 kl. 22:31) pegede på Supabase-projektet `hzlkypibayzkkumwohap` — IKKE platformens `loiavmastgeieqyiwyyr`. Ref'en har NUL træffere i arbejdstræet og NUL i hele git-historikken. `.lovable/plan.md` bar 25/2 2026 kl. 12:30:57 den RIGTIGE URL; linjen blev fjernet 13:32:45 samme dag, og ni minutter senere (13:41:29) gik automation 157778880 i `store.webhooks.error.unauthorized`. **Konsekvens, målt:** `company_betalingslink` har nul rækker, og `monday-webhook` er det ENESTE INSERT i den tabel i hele repoet — /betal, dag 0-mailen, de fire påmindelser, `indgangs-paamindelser`-cronen, dag 31-fakturaen, `opret-indgangs-checkout` og prisknapperne hænger alle på en række kun Monday kan lave. Mangellistens nr. 1 er omskrevet: det var ikke et manglende forsøg, det var en kæde uden indgang. **LØST i kode — #851** (værn med to veje i `_shared/mondayVaern.ts`; DEL 2 «14. september» §1). **Driftsbevis, indirekte:** ny Monday-automation «Ny ny platform» (webhook-id 185108519, oprettet 14/9 ca. kl. 10 med `?noegle=`) blev STÅENDE TÆNDT efter ét statusskift — Monday slår selv fra ved 401: «Ny platform» (id 185102661, oprettet ca. kl. 09 UDEN nøgle) blev tændt, fik 401, og Monday slog den fra med banneren «The webhook endpoint requires authentication». Lovables log er ikke læst. (Rettet 14/9: diktaten byttede de to id'er om.) **ÅBENT:** hvad `hzlkypibayzkkumwohap` er, og om det gemte data (automation 161201319 «når et emne oprettes» sendte dertil 21/3–14/9, fire kørsler i run history; slået fra 14/9); board 1899777797 skal ryddes for fire webhooks (185102661, 161201327, 161201319, 157778880) — FØRST når kæden er bevist på et rigtigt «Godkendt»; tre bliver (185108519 «Ny ny platform», 137371356 «Periodiseret omsætning» → Make, 135778522 «RapportBOARD+Slack» → Make). Kilde: API-udtræk `webhooks(board_id: 1899777797)` 14/9.
> **FUND 2 — INVITATIONSMAILEN VAR FALLBACK'EN, og valget var tavst — LØST #852.** Målt i prod: `email_templates` «Invitation til virksomhed» har `enabled=false` (updated_at 2026-09-08 07:31:35, updated_by = Jonas' uuid). Fallback'en havde fire usandheder («by Topix», «Ignorer denne besked…», «hvilken som helst e-mail», hardkodet «The Boardroom» uden `{{company_name}}`), og `maybeSingle()` uden error-læsning gav fallback ved fire tilstande med SAMME `template_name` i `email_send_log` — ingen kunne se det. Nu: dommen ren og testet (`_shared/invitationsSkabelonvalg.ts`), logges altid med årsag, vej + årsag i `email_send_log.metadata`, `template_name` urørt; mailen i indgangsfamiliens form (`_shared/invitationsMail.ts`), kontakt@theboardroom.dk efter knappen (BESLUTTET af Jonas 14/9). **Bevist på skærm 14/9 kl. 10:07** (testinvitation, slettet bagefter) og **i drift 08:10:16** — Lisbeths mail, metadata ordret `{"skabelon_id": null, "company_name": "Nordic By Hand ApS", "skabelonvalg": "fallback", "fallback_aarsag": "enabled_false"}`. **NYT ÅBENT:** Lovables mail-lag lægger «Afmeld abonnement»/«Unsubscribe from these emails» på — engelsk, under vores danske footer — på en transaktionel mail; hvad en afmelding rammer, er IKKE målt.
> **FUND 3 — JONAS-SESSIONEN ER LUKKET FOR 23 AF 38, i hånden 13/9.** `companies.jonas_session_used_at` er sat på 23 af 38 — 23 forskellige tidsstempler 13/9 kl. 20:50:13–20:54:51 UTC, ~11 sekunder imellem, i STRENG ALFABETISK rækkefølge (ANLA GLAS → YKRG): et menneske ned ad en sorteret liste i `EditCompanyDialog`, to minutter efter #844's skærmbevis. Ikke en DEFAULT (ingen af de to session-kolonner har en), ikke en migration, ikke Claude Code. Krydset mod Mortens: 9 begge (aldrig samme tidsstempel), 14 kun Jonas, 4 kun Morten, 11 ingen af dem; alle 23 er `status=active`. DEL 3's række «ÅBENT — ikke gjort» var FORKERT og er omskrevet. **ÅBENT:** 11 har begge rettigheder stående.
> **FUND 4 — IMPORTEN SKRIVER ALDRIG `contact_person`.** `byggVirksomhedsRaekke` (`_shared/virksomhedsraekke.ts:171-211`) har ikke feltet i rækken; værdien lander i `application_context.contact_name`. Kolonnen har `DEFAULT ''`. Kendt siden 2/9 (`20260902190000_lookup_invite_email_kontakt.sql:22-27`: 35 af 39 med tom streng) — aldrig rettet. Kun `monday-webhook` skriver kolonnen (B5). Rammer hver eneste import fra webinaret.
> **FUND 5 — BETALING UDEN OM PLATFORMEN HAR INGEN FLADE.** Fornyelsesmotoren læser `companies.indgangspris_oere`/`fornyelsespris_oere` (ikke `company_betalingslink`); reglen er `Math.floor(indgangspris_oere / 2)` mod tre prispunkter (15.000/20.000/25.000 kr.), ellers `ukendt_prispunkt`. INGEN flade i `src/` og ingen edge function ud over `stripe-webhook` skriver de to kolonner. Et fakturabetalt medlem kræver SQL i hånden; ellers `ingen_indgangspris`, intet bånd, `sprunget_over.ingen_pris` i cronen. Bastant Design står allerede sådan.
> **FUND 6 — CVRAPI'S KVOTE HÆNGER PÅ IP, IKKE PÅ OS — og fejlen er tavs.** `hentCvrData` (`_shared/virksomhedsOprettelse.ts:64-102`) er den ENESTE CVR-kilde: anonymt kald, ingen nøgle. Målt 14/9: importen af Nordic By Hand kl. 08:10:15 gav «cvrapi svarede error=QUOTA_EXCEEDED» — berigelsen var IKKE kørt, importen koster højst ét opslag pr. ny virksomhed. **Beviset:** kl. 10:37 svarede cvrapi 200 med fulde data på CVR 46415124 fra Jonas' maskine med samme User-Agent; kl. 10:40 QUOTA_EXCEEDED på SAMME CVR fra Supabases edge-runtime. Rådgiverens kvittering er ORDRET den samme uanset udfald; `cvr_fetched_at IS NULL` er eneste spor. **BESLUTTET 14/9:** Virk/Erhvervsstyrelsens CVR-API erstatter cvrapi; ingen nøgle findes (secret-listen og repoet) — Jonas opretter den. Synligheden bygges uafhængigt af kilden. **SYNLIGHEDEN LØST — #855 (middag, se nedenfor); kvoten uddybet: fri igen kl. 12:00, vinduet er kortere end et døgn.**
> **DAGENS MEDLEM — NORDIC BY HAND ApS** (`a4481db0-1cbc-4f2f-801e-29d5693da08d`, CVR 46415124, Lisbeth Gade, mail@nordicbyhand.dk): betalt 40.000 kr. ved TO fakturaer à 20.000 ekskl. moms, uden om platformen; kontrakt 14/9-2026 → 14/9-2027; importeret 08:10:16, invitation pending, mailen sendt og bevist. Sat i hånden bagefter, fordi ingen flade kan: `contact_person`/adresse (10:14), `indgangspris_oere = 4000000` (10:24), registrets adresse «Østre Alle 6» + `industry_code` 475510 «Detailhandel med møbler» + `cvr_fetched_at` (10:53). **MÅ ALDRIG SÆTTES TIL «Godkendt» I MONDAY** — webhooken genbruger virksomheden på CVR, men opretter OGSÅ et betalingslink og sender en betalingsmail på 40.000 kr. Varsel 1 forfalder 15/8-2027. BETALING-kortet står tomt hele året.
> **MIDDAG — FIRE PR'ER SIDEN FORMIDDAGENS BOGFØRING (#854), alle merget og udrullet.** **#853** (`c115e737`, 09:23:16 UTC; udrullet 09:25) — onboardingmailene: mail A lover ikke længere at «Jonas eller Morten skriver til dig i chatten» (ikke automatiseret); den siger «Skriv til din rådgiver i chatten, når du vil — Jonas eller Morten svarer», samme initiativ som tjeklistens sidste punkt. Mail B (dag 10) kender begge inkluderede sessioner og har en gren: `jonas_session_used_at` sat → Jonas nævnes ikke (14 af cronens kandidater havde brugt retten). **#855** (`b60df81d`, 09:48:17 UTC) — **en fejlet CVR-berigelse er ikke længere tavs.** Dommen ren i `src/lib/cvrBerigelse.ts:65` (gyldigt CVR, `cvr_fetched_at` tom, adresse eller branchekode tom); tre flader: kvitteringen efter import, virksomhedssidens «Hvad skal du vide nu» (kø `stamdata_mangler`, alvor 50 — forsidens dom springer den over), og mærket «CVR-opslag mangler» på listen. Selvrensende. **BEVIST PÅ SKÆRM kl. 11:50–11:51, begge grene:** Nordic By Hand bærer intet mærke (fyldt i hånden 10:53), YKRG APS bærer «CVR-opslag mangler — adresse står tomt» på siden og som mærke på listen — én af 26 rækker, ingen falske positiver. **#856** (`0f4d8396`, 09:56:59 UTC) — dag 0-mailen (den med betalingslinket) sagde «så skriv til mig»; fornyelsens KVITTERING sagde «svar på denne mail eller skriv til jonas@topix.dk». Begge siger nu kontakt@theboardroom.dk; `KONTAKT_ADRESSE` bor ét sted (`_shared/indgangsMail.ts:67`), re-eksporteret fra `invitationsMail.ts`; kildeværn på alle tre mailfiler. **#857** (`588db663`, 10:00:35 UTC; fem functions udrullet 10:03) — **429 er `rate_limited`, ikke `failed`** (`_shared/mailFejl.ts:45-48`); `email_send_log` får status `rate_limited` (ingen CHECK, `EmailLogView` kender værdien, ingen migration); dagskvoten (`MAX_EMAILS_PER_DAY = 5`) tæller ikke den status; begge løkker i `send-notification-email` stopper ved første rate limit. **Rate limit-grenen er UBEVIST i drift** — kun en rigtig 429 kan bevise den; udrulningen bevist indirekte (`send-report-reminder` tørkørte 12:04 og svarede «Period: August 2026 | Day: 14» uden exception).
> **FUND 7 — MAILLOFTET ER PR. TIME OG PR. WORKSPACE, og fire events brugte det på et kvarter.** Målt 14/9: events oprettet 08:30, 08:39, 08:45 og 08:50 gav 109 mails til 26 adresser på femten minutter; fra 09:10:13 status `failed` på seks adresser (tapas, peterjacobsen, marianne, rnl, bsl, caspar); tapas lykkedes 09:15, fem fejlede igen. Lovable sendte 09:10 «Sending rate limit has been reached» — «Any new emails from your projects will be rejected until the current window resets». Lovables dokumentation (docs.lovable.dev/features/custom-emails): loftet er PR. TIME og PR. WORKSPACE, ikke pr. projekt — Pro 100 app-mails/time, Business 300, Enterprise 1.000; auth-mails eget loft (Pro 500); 50.000 transaktionelle/måned; advarsel ved 80 % i More → Cloud → Emails; kan hæves via Lovable Support. **KONSEKVENS:** alle app-mails deler loftet — invitationer, betalingsmails, påmindelser, varsler. Med 36 medlemmer efter webinaret rammer TRE events loftet; rammer vi det den 22., er det en ny ansøgers betalingslink der afvises, og hun ved ikke at hun venter. **Arkitekturen** (`recon-event-fanout.md`): `publish-event` sender ingen mails — den skriver N rækker i `notifications`; cronen `process-notification-emails` tømmer køen hvert 5. minut, 50 ad gangen, kun rækker ældre end 15 min og stadig usete; `email_sent_at` stemples kun ved succes, så køen prøver selv igen. Fire events inden for tyve minutter gjorde alle 104 rækker modne samtidig. **JONAS 14/9: nye events skal samles i én mail. IKKE BYGGET.** Anmodning sendt 14/9 til Lovable Support om 300 app-mails/time — svar afventes.
> **FUND 8 — YKRG APS' CVR FINDES IKKE I REGISTRET.** Målt 14/9 ca. 12:00: cvrapi svarer 404 NOT_FOUND på CVR 44891917. Hun kan aldrig beriges; berigelsen tæller hende som kandidat (kun otte cifre tjekkes, `_shared/berigelse.ts:88-93`) og brænder ét opslag pr. kørsel, i al fremtid. Mærket fra #855 er korrekt, men handlingen («kør berigelsen») hjælper hende ikke. Nyt kort: berigelsen skelner ikke «ikke slået op endnu» fra «kan ikke slås op» — et NOT_FOUND burde markeres. **RETTET 14/9 ca. 11:47 UTC — NUMMERET VAR TRANSPONERET (§26):** det rigtige er 44891719 (to cifre byttet om); cvrapi 200; adresse og `cvr_fetched_at` sat i hånden; mærket forsvandt af sig selv 11:49. Fundet er skærpet til FUND 13 nedenfor.
> **FUND 9 — AFSENDELSESGRENEN ER BEVIST.** `intro-reminder-cron` sendte 14/9 kl. 09:00:10 en rigtig mail til kontakt@topix.dk (Topix.dk ApS); `email_send_log` ordret: «Din sparring med Morten er inkluderet · intro-reminder · sent». 25 minutter FØR #853 blev udrullet (09:25), så den bar den gamle tekst — ingen skade, egen konto. Kort 6 af 18's «afsendelsesgrenen er ubevist» er lukket. **RETTELSE:** formiddagens «25 kandidater» var et skøn; cronen fandt FEM, hvoraf fire sprunget over med `ingen_medlemsbruger` — den gater også på medlemskabsstart og på at der findes en medlemsbruger, ikke kun på `intro_session_used_at`. Tallet er kodens.
> **RECONEN OM LISBETHS FØRSTE UGE** (`recon-hendes-foerste-uge.md`): uden velkomstvideo UDGÅR punktet rent — ingen tom boks, ingen død knap; tjeklisten har SEKS punkter (pillen siger «0 af 6»), ikke fem som `maalinger-foer-webinaret.md` påstod (rettet i §26 og i «Beslutninger der står fast»); 1 af 6 er gjort fra start (virksomhed — importen satte website, branche og CVR). Tom-tilstandene i Nøgletal, Budget og Rapportering er RENE: søgt efter 0, «—», NaN og tomme grafer ved nul committede tal — INGEN fundet; hver flade har en rigtig sætning med et link. Kort 7 af 18 er derfor et skærmbevis, ikke en bygning.
> **FUND 10 — FUND A ER RETTET I KODE (#849, `837ca15a`, i HEAD) — mangellisten sagde stadig det modsatte.** `Betal.tsx:157` læser `betalt=1` gennem `laesBetaltHint`; dommen `afgoerKvittering` (`src/lib/betalKvittering.ts:68-85`) viser «Tak — vi bekræfter din betaling» uden knapper og henter igen hvert 3. sekund (`KVITTERING_RETRY_MS = 3_000`) i op til 30 sekunder (`KVITTERING_GRAENSE_MS = 30_000`), derefter «Vi mangler den sidste bekræftelse» med «Tjek igen»/«Skriv til os». Den gamle adfærd — betalingsskærmen igen med tre aktive knapper — findes ikke i koden. Kortet var LUKKET med forbehold (ikke bevist udrullet) — **EFTERMIDDAG: BEVIST PÅ SKÆRM 12:47 og igen 13:02, ingen betalingsknapper.** Forbeholdet er væk. Af «I STYKKER» er B nu også løst (#859, nedenfor); kun C står tilbage — og C's skabelon i `email_templates` er stadig `enabled=false`, så fallback'en (husets form siden #852) ER mailen.
> **FUND 11 — GENNEMKØRSLENS PRIS ER MÅLT** (`recon-gennemkoerslen.md` §2–§3): billigste første træk er rate12 på niveau 40.000 = 3.500 kr. ekskl. moms (ca. 4.375 kr. med 25 % moms; Stripe Tax regner ud fra adressen i Checkout). Det opretter et abonnement der trækker hver måned i tolv måneder; `cancel_at` sættes af webhooken til start + 12 mdr − 1 dag. Ingen testtilstand: én `STRIPE_SECRET_KEY`, ingen `sk_test`-gren i nogen function. Ingen lavere pris: `tjekPrisniveau` afviser alt uden for de to niveauer (`INDGANGS_PRISPUNKTER_OERE` = 40.000 og 50.000, `indgangspris.ts:43`).
> **FUND 12 — EN REFUSION RYDDER IKKE OP (ny fælde, DEL 4).** `stripe-webhook` har grene for `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid` og `invoice.payment_failed` — INGEN for `charge.refunded`, `charge.dispute.*`, `invoice.voided` eller `credit_note.*` (grep 14/9); alt andet svarer `{ received: true }`. Refunderes en betaling, står `contract_end_date`, `indgangspris_oere`, `status='active'`, `company_perioder`-rækken og invitationen som før — medlemmet beholder adgang, og fornyelseskæden regner videre. At opsige et rate-abonnement i Stripe rører heller ikke platformen (`customer.subscription.deleted` springer over når `metadata.art` er sat, `:840`). **KONSEKVENS: oprydning efter en testvirksomhed er sletning i platformen, ikke refusion i Stripe.**
> **EFTERMIDDAG — FIRE TING SIDEN MIDDAGENS BOGFØRING (#858).** **#859** (`a30851cf`, 10:44:53 UTC; udrullet 10:46) — **FUND B: invitationens udfald forsvinder ikke længere.** Seks kaldesteder i `stripe-webhook` kaldte `sikrIndgangsInvitation` uden at læse svaret (`:1225`, `:1235`, `:1299` indgangsgrenen; `:700`, `:706`, `:730` fakturagrenen) — de fire udfald endte i `console.error`. Nu: «sendt» og «fandtes_allerede» logges stille; «sprunget_over» (secret mangler) og «fejlet» giver rådgiverne en besked i klokken gennem `skrivRaadgiverBesked` (#815's form, én række pr. rådgiver, link til virksomhedssiden, udvejen «invitér manuelt i /virksomheder»). Ny type `invitation_fejlet` (som `traek_fejlet`). Dedup på `reference_type` «company» + `reference_id` = `companies.id` — IKKE Stripe-sessionen (kolonnen er uuid, begge veje ender på samme virksomhed); prisen står i koden: fejler invitationen igen for samme virksomhed efter en manuel invitation, ringer klokken ikke igen. `meldInvitationsUdfald` (`stripe-webhook/index.ts:195`) kaster ALDRIG videre — betalingen er registreret, og en besked må ikke koste svaret til Stripe. `sikrIndgangsInvitation` urørt. Målt selv efter udrulning: 400 «Invalid signature» (som 13/9) — kæden ikke brudt. **GRENEN ER UBEVIST I DRIFT** — kun en invitation der faktisk fejler kan bevise den. Tre ubeviste grene nu: #815's klokke, #857's rate limit, #859's invitation. **#860** (`fc3b2565`, 11:00:28 UTC) — **FUND E: fladen sendte medlemmer til en personlig indbakke.** Set på skærm 12:47: /betal «Spørgsmål? Skriv til jonas@topix.dk» — skærmen man står på MENS betalingen bekræftes. Målingen fandt ATTEN forekomster i SEKS filer: `Betal.tsx:115, :117, :144-145`; `CompanyLinkFailedGate.tsx:67, :80-81`; `MembershipExpiredGate.tsx:217-218, :337, :427-428`; `FornyelseKvittering.tsx:72, :91-92`; `BookSessionView.tsx:225`; `ChatShell.tsx:69` — husets fejltilstande, dér hvor nogen skriver. Adressen bor nu i `src/lib/kontaktadresse.ts` (`mailtoKontakt()`, emnerne bevaret); `src/` kan ikke importere `_shared/indgangsMail.ts`, så værdien står to steder, men `kontaktadresseFladen.guard.test.ts` læser BEGGE og sammenligner literalerne. Én tekst ud over adressen: abonnentens knap «Kontakt Jonas om fuldt medlemskab» → «Kontakt os». **BEVIST PÅ SKÆRM 13:02:** /betal viser kontakt@theboardroom.dk. Dermed er alle fire steder fra i dag ryddet — #852 invitationsmailen, #856 dag 0 og fornyelsens kvittering, #860 fladen. Fund E lukket. **VELKOMSTVIDEOEN ER I DRIFT.** Morten optog den 14/9; filen i Bunny Stream, GUID sat i /admin/config. Målt i SQL 12:49: `app_config.velkomstvideo_guid` = `ee29bc22-e323-4427-939d-da85964a8824`, 36 tegn, gyldigt GUID — rå værdi bærer anførselstegn i JSONB som den skal, `#>> '{}'` giver den rene streng (fælden fra måling 4; 38 tegn ville have været forkert). **BEVIST PÅ SKÆRM 13:01** på kontakt@topix.dk: fokuskortet viser «Se velkomsten» med «Gør det nu», overlejringen åbner, videoen spiller. Tjeklisten har nu SYV punkter (seks uden video). Kort 4 af 18 lukket. **ÅBENT, fundet samtidig:** overlejringens tekst siger «Tjeklisten nederst på siden følger med dig», men pillen trækker sig netop på forsiden (#569, `ankomst.ts`) — rettes nu i et andet vindue; bogført som åbent. IKKE rettet, bevidst: «Se senere»/«Kom i gang»-knapperne og at videoen er optaget i portræt inde i en 16:9-ramme — kosmetik, ikke på listen. **GENNEMKØRSLEN ER FORBEREDT, IKKE KØRT.** `recon-gennemkoerslen.md` (uden for repoet) bærer køreplanen: Monday-oprettelsen, prisen, trinnene efter betalingen med det der kan måles, og oprydningen. BESLUTTET 14/9: køres med rate12 på 40.000 = 3.500 kr. ekskl. moms, EFTER at fund A, B og E var lukket — så testen bliver et bevis frem for en fejlsøgning.
> **GENNEMKØRSLEN ER GENNEMFØRT 14/9 kl. 11:26–11:38 UTC — mangellistens nr. 1. Første gang kæden har kørt hel siden marts.** Testvirksomhed på FLOOR1's CVR 41772239, «GENNEMKØRSEL — slettes», jonas+gennemkoersel@topix.dk. FØR (målt 13:25 dansk): 0 betalingslink, 0 perioder med `art=indgang`, 31 aktive, FLOOR1 findes ikke, mailen ubrugt. **Kæden:** Monday-emne 3222994956 (mail, CVR, Gennem/Kørsel, pris 40.000, INGEN adresse — bevidst, så CVR-opslaget var eneste kilde) → «Godkendt» → på halvandet sekund: virksomhed `e5e93593-81f6-4415-af56-155b3b416344` active, `contact_person` «Gennem Kørsel» SAT (Monday-vejen skriver den — fund 4 set fra den anden side), `company_betalingslink` 11:27:51.337 med prisniveau 4000000 og `monday_item_id` 3222994956 — **FØRSTE RÆKKE I TABELLEN NOGENSINDE**, betalingsmail stemplet 11:27:51.907, `email_send_log` 11:27:52.369 «Velkommen i The Boardroom — sådan kommer du i gang», sent. MEN `cvr_fetched_at` tom, adresse tom, ingen `industry_code` — cvrapi afviste for TREDJE gang i dag (fri 12:00, brugt op 13:27 dansk). Dag 0-mailen: header og footer rene, 40.000 ekskl. moms, frist 14. oktober, token `b7252f59-…` = databasens — MEN «så skriv til mig»: #856 var merget 12:06 og IKKE udrullet (de fem functions gik 10:03, før #856 fandtes) — fælden fra DEL 0 punkt 2, fanget af gennemkørslen selv; udrullet 11:39 med `monday-webhook`, teksten ubevist til næste rigtige «Godkendt». /betal: tre modeller, kataloget beløb, fodnoten kontakt@theboardroom.dk (#860 i drift — Update var klikket, mailen ikke udrullet: to kanaler, to tilstande). **Betalt** rate12/40.000, Stripe Tax 25 % → 4.375 kr. Skærmen viste den ENDELIGE tilstand «Tak — … er inde», ikke mellemtilstanden — **FUND A BEVIST I DRIFT på en rigtig betaling.** Webhooken skrev kontrakt 2026-09-14 → 2027-09-14, `indgangspris_oere` 4000000, `stripe_customer_id` `cus_VG4F6BnGwJ4zU2` (FØRSTE virksomhed med feltet sat af kæden selv — 27 aktive stod med NULL, målt 10/9), `company_perioder` 4200000 rate12 (40.000 + 5 % — `indgangspris.ts` holder i drift), `company_invitations` pending med `invited_by` = morten@molainvest.dk — **`INVITATION_AFSENDER_USER_ID` ER BEVIST SAT OG RIGTIG, måling 1 lukket**; `sidste_checkout_session_id` nulstillet; `advisor_notifications` 0 rækker — fund B's klokke ringede IKKE, fordi invitationen lykkedes; grenen stadig ubevist, og det er korrekt. Invitationsmailen 11:32:31, sent, «Din adgang til The Boardroom er klar», virksomhedens navn, «Den står allerede udfyldt», kontakt@theboardroom.dk; metadata ordret `{"skabelonvalg": "fallback", "fallback_aarsag": "enabled_false"}` — #852's værn i drift. Signup: mailfeltet låst, «Invitationen er sendt til denne adresse», navnet forudfyldt fra Monday. Første login: «Velkommen, Gennem.», overlejringen med Mortens video og #861's tekst ordret «Tjeklisten står under «Dit næste skridt» her på forsiden og følger med dig, indtil alt er på plads.» — **#861 bevist på en rigtig ny bruger en time efter merge.** MEN tjeklisten var **0 af 7, ikke 1 af 7**: reconen antog «Din virksomhed» gjort fra start, men det gælder IMPORTVEJEN; Monday-vejen satte branche-label og CVR, ikke website. **FORSKEL MELLEM DE TO INDGANGE** — nyt kort. **Oprydningen:** `sub_1UFY7W3CvBmCx5PtSwaKxhhV` annulleret immediately med refusion 4.375 kr. (kreditnota automatisk; bilaget står i Stripe som TBR-0003 fra 3/9); webhooken havde selv sat `cancel_at` = 14/9-2027 (12 mdr − 1 dag), som Stripe viser som `canceled_at` — designet adfærd, bevist. Platformen ryddet i SQL 11:38 med navngivne id'er: otte rækker i syv tabeller, alle 1; EFTER: nul forældreløse i fem tabeller, 0 betalingslink, 31 aktive — som før; `email_send_log`s to rækker bevaret som historik. **Lukker:** nr. 1, måling 1 og Monday-sporet (måling 7) — bevist gennem brug, som målingsfilen sagde de måtte. **IKKE bevist:** `RAADGIVER_MAIL_TIL` — prisen var sat fra start, rådgivermail-grenen blev aldrig udløst. Argumentet for Virk er nu målt tre gange.
> **SEN EFTERMIDDAG — #864 (`4f82e7c4`, merget 12:16:20 UTC; ren frontend, KRÆVER Update-klik — ikke bevist på skærm): NÅR EN UPLOAD STRANDER, SIGER KORTET HVAD MAN GØR. Mangellistens nr. 8 lukket.** Serveren har hele tiden stemplet hver upload med et kildefingeraftryk (economic | dinero | combined_dk | unknown, gemt i `raw_extracted_data.routing_trace.source_fingerprint.source_system`, `extract-financial-data/index.ts:480`), men det blev kun brugt til ét hint i toasten. Kortet sagde HVORFOR (`rapportFejlgrund`), ikke HVAD. Kilden er nu koblet til `EKSPORT_VEJE` i `src/lib/hjemmebane/rapporteringTekst.ts` — ren, testet, samme konstant som siden og historik-mailen bruger (paritetstestet i `onboardingRytme.test.ts:174`). INGEN GÆT: combined_dk er et strukturelt aftryk, ikke et program → «Andre», som serverens egne kildenavne gør det; unknown/null/tomt → «Andre»; Billy står i `EKSPORT_VEJE` men har intet fingeraftryk, så ingen kilde fører dertil. MÅLT I KODEN: e-conomics saldobalance som EXCEL er det stærkeste spor — HIGH fingeraftryk på to faste rækker (CVR i række 2, «Saldobalance for perioden» i række 4, `sourceFingerprint.ts:103-117`) og TO skabeloner (`dkEconomicSaldobalanceXlsxV1` score 88, først i registret; `dkCombinedBalancePnlV1` 85/92); resultatopgørelsen som Excel har ét fingeraftryk og ÉN skabelon med additiv score, der falder til 0 hvis ordet «aktiver» står i filen (`dkEconomicResultatopgoerelseXlsxV1.ts:315-320`). Derfor peger en strandet e-conomic-fil nu på saldobalancen, ikke på «prøv igen». `gross_profit_sum` gav FØR ingen grund (checknavnet filtreredes væk, `reportCardView.ts:103`) — den og ni beslægtede checks har nu menneskelige tekster; dem uden belæg er bevidst uden tekst og viser label alene. Rå validator-output kan stadig ses i review-dialogens detalje (rådgiverens flade, urørt) — ikke på medlemmets kort. PARSEREN ER URØRT: ingen ny skabelon, ingen ændring i vareforbrugs-matcheren, intet fingeraftryk for Billy — kort 12 (PHILBERTs to filer) står derfor ÅBENT; det kræver filerne, som ikke er set. tsc 0, 3242 tests (213 filer). Alle tekster ordret i §25.
> **FUND 13 — ET TRANSPONERET CVR-NUMMER PASSERER ALLE HUSETS TJEK.** YKRG's nummer i platformen var 44891917; det rigtige er 44891719 — to cifre byttet om. Rettet i hånden 14/9 ca. 11:47 UTC med guard (kun hvis adressen stadig var tom); FØR: cvr 44891917, adresse tom, `cvr_fetched_at` NULL. cvrapi svarede 200 på det rigtige: YKRG ApS, Industriparken 44A, 2750 Ballerup, industrycode 562100 «Event catering», seks ansatte, tapas@tapasamor.dk. `industry_code`/`industry_label` BEVIDST urørt — feltet stod ikke NULL men «food_restaurant», husets egen branchenøgle; 562100 dér ville bytte en husnøgle ud med en registerkode i det felt der bruges til branchesammenligning («CVR-branche og faktisk branche er to ting»). BEVIST PÅ SKÆRM 11:49: mærket «CVR-opslag mangler» forsvandt fra hendes række af sig selv — #855's selvrensende dom er dermed bevist på BEGGE grene (kom 11:51 i formiddags, forsvandt nu). Det skarpe: otte cifre passerer `CVR_FORMAT`, `harCvr` og berigelsens kandidatvalg; kun registret kan afvise det — og når det gør, siger koden «no data», nøjagtig samme svar som når kvoten er brugt op. Vi troede i formiddags at YKRG var ramt af kvoten; hun var ramt af en tastefejl. De to ser ens ud i koden. NOT_FOUND-kortet er derfor vigtigere end det så ud (§26; DEL 4-fælden skærpet).
> **DELINGSKREATIVEN — DESIGNET ER LAVET.** Jonas lavede det i Claude Design 14/9; ligger i `docs/delingskreativ/` (designfiler, ikke bogføring). Tre layouts (3a «Tre på række», 3b «Optagelsen», 3c «Optaget i»), hver i mørk og lys, hver stående og liggende = tolv varianter; ti færdige eksporter i `eksport/` — 1080×1080 (kvadrat) og 1200×627 (liggende), målt 14/9 med sips. Pladsholdere memberName, companyName, dateLabel, plus et billedfelt til medlemmets eget portræt. **JONAS' TO BESLUTNINGER 14/9:** medlemmet SKAL kunne vælge mellem varianterne — valget er en del af gaven; og bygningen DELES: del 1 er siden med kreativerne, billedvalg, download og tekstudkast, del 2 er tjeklistepunktet, som tages bagefter — del 1 virker uden del 2 (linket sendes i chatten). **PORTRÆT-PÅSTANDEN RETTET:** «Jonas' portræt er 300 px — der skal et nyt» gælder KUN platformens fil (`public/jonas-herlev.png`, 300×283); designarkivet har `jonas-hi.png` 1044×1044 og originalen `Jonas1-kopi.jpg` 2000×1334, Mortens `morten-hi.png` 728×728 (målt 14/9). Intet nyt foto skal tages — to filer kopieres ind i `public/`. Reconen (`recon-delingskreativen.md`, uden for repoet) fandt: html2canvas 1.4.1 er ALLEREDE i brug (`exportPdf.ts:20-29`, scale 2, useCORS), Parkinsans og Manrope hentes allerede fra Google Fonts (`index.css:1-2`), men «ocean» findes ikke som token og Hjemmebane har ingen mørke tokens; «Del direkte på LinkedIn» kan ikke bygges (share-URL tager kun et link) — download + kopiér er kravet. §27–§28.
> **FUND 14 — NR. 16 ER NÆSTEN TOMT, OG HOOKEN HOLDT OP MED AT LOGGE 8/9** (`recon-auth-mails.md`, uden for repoet; §29). Af de seks auth-mails hooken kender (`auth-email-hook/index.ts:125-183`) udløses KUN ÉN i vores kode: «Nulstil din adgangskode» (`recovery`, `Auth.tsx:171`). Bekræftelsesmailen ved signup er slået fra siden 2/9 (Auto-confirm TIL; `confirmation_sent_at = NULL`, `indgangen-overhaling.md:103-107`) og bekræftet i praksis af gennemkørslen 14/9; magiclink, invite, email_change og reauthentication har ingen udløser i `src/` eller `supabase/functions/`. KONSEKVENS: en «jeg fik ingen mail» fra en ny ansøger kan ikke handle om en bekræftelsesmail — den handler om betalingslinket, invitationen eller dag 0-mailen, som alle står i `email_send_log`. Hullet er ét felt bredt. DERTIL: før 8/9 skrev hooken selv en `pending`-række med `template_name = emailType` (gammel `index.ts:246-251`, version `b6008c51`, 11/5 → 8/9 07:00:24 UTC); efter Lovables skift til `createAuthEmailHandler` skriver den intet (ingen `.from(`/`.insert(` i `dist/index.js:189-250`). Ingen opdagede det — `EmailLogView`s labels (`:78-83`) er arv og viser kun gamle rækker. Tredje stille skift fundet i dag (#851, #852). Prioritering (Jonas 14/9): nulstil-mailen rettes IKKE før 22/9. DEL 4-fælden «LOVABLE KAN BYGGE OM UNDER OS» skærpet.
> **AFTEN — DELINGEN ER BYGGET: ni PR'er #868–#876 mellem 13:27 og 15:15 UTC (§30–§33).** /deling har nu et galleri med tolv små kort (tre layouts × mørk/lys × kvadrat/liggende), fuldskærm med skift og «Hent PNG» i kreativens eget pixelmål, hendes eget navn, virksomhed, portræt og logo, fire tekster til opslaget med kopiér-knap og en vejledning om rækkevidde, og «Optaget {måned år}» fra kontraktens start — som kan slås fra. Logoet gemmes som virksomhedens (company-logos + `companies.logo_url`); portrættet i en ny privat bucket `deling-portraetter` — **migrationen KØRT I HÅNDEN 14/9 ca. 16:31 dansk, bekræftet: public=false, 2097152, image/\*, fire policies (DELETE, INSERT, SELECT, UPDATE)**. Ren frontend ellers — kræver Update-klik. Menupunktet «Fortæl det videre» bygges nu i et andet vindue; del 2 (tjeklistepunktet) venter.
> **FUND 15 — ET NYT BILLEDE KUNNE IKKE SES, og det var bredere end delingen (#875, §33).** Jonas så det på /deling: logoet kunne ikke skiftes. To lag: `getPublicUrl` giver samme URL for samme sti, så browseren beder aldrig om billedet igen; og `cache-control: max-age=3600`, MÅLT på fire objekter — storage-js' standard (`dist/index.mjs:531`), ingen af husets uploads satte andet. Portrættet virkede kun som BIVIRKNING af at signerede URL'er bærer et token med udløb. UDEN FOR DELINGEN: `KontoView` bustede sin egen visning med `?t=` i state, men gav den rene URL videre gennem `refreshProfile` — sidebar og topbar viste det gamle billede resten af sessionen, og andre medlemmer så det gamle avatar i op til en time i MemberProfile, MemberDirectory og PushView. Det har været sådan hele tiden. **JONAS' BESLUTNING: versionen i den GEMTE URL, ikke fjernet cache** — en fjernet cache betales hver gang et billede vises (medlemsoversigten henter 30 avatarer pr. besøg); en version koster kun når billedet skifter. De to `?t=` i state er ude (ny URL ved HVERT render). Eksisterende URL'er migreres ikke.
> **FUND 16 — FULDSIDES-SKÆRMBILLEDET LØJ (#868–#869, §30).** Tre gange (15:08, 15:29, 15:56 dansk) så det ud som om kreativen flød ud over fuldskærmens kant. #869 målte pixels i skærmbillederne: fladen var en tom rektangel i kreativens farve UNDER dialogens boks — dialogen slutter i y=1198, billedet er 1357 px højt. BEVIST 16:10 med et almindeligt skærmbillede (Cmd+Shift+4): INGEN flade. Værktøjet var GoFullPage, som fanger hele siden, mens en fixed-overlejring kun dækker viewporten. Ny fælde i DEL 4. De to rettelser var ikke spildte: #869 fandt en ÆGTE fejl undervejs — containeren målte sig selv gennem `height:100 %`, faldt tilbage på bredden ved `clientHeight=0`, og næste måling bekræftede den forkerte skala.
> **BESLUTNINGER 14/9 AFTEN (står fast, nederst):** menupunktet hedder «Fortæl det videre», ikke «Deling» — det beskriver gaven, ikke mekanikken. Medlemmet vælger selv variant. **Ansøgningens tekster må ALDRIG bruges offentligt** — det lukker «forudfyld profilen fra ansøgningen»; kort nr. 9 er omskrevet: det der står tilbage, er at præsentationsudkastet giver tre overskrifter med tomme afsnit, og det er en tekstopgave med EKSEMPLER, ikke hendes egne ord. **NYT KORT — AFFILIATE (Jonas 14/9):** et medlem der henviser et nyt MEDLEM (ikke et lead) får 10.000 kr.; fem henvisninger svarer til et gratis år ved prisniveau 50.000. Ikke undersøgt: sporing, hvornår en henvisning tæller, udbetaling eller modregning, en statusflade. Større end alt der blev bygget 14/9 tilsammen; hører sammen med delingen — den bliver en kanal frem for kun en gave. Efter 22/9. Mangellisten havde allerede et affiliate-kort (11/9, kredit på fornyelsen) — det er skærpet, ikke dubleret.
> **SEN AFTEN — TRE PR'ER EFTER BOGFØRINGEN #878 (§34–§36).** **#877** (`8accaab2`, 15:23:42): menupunktet «Fortæl det videre» sidst i medlemmets menu; abonnenten får det ikke. **#879** (`003fc3a7`, 15:30:47): **logoet blev strakt i den hentede PNG** — set på skærm OG i fil 17:20 dansk; html2canvas 1.4.1 KENDER IKKE `object-fit` (ordet findes ikke i pakken) og tegner `drawImage(hele billedet → hele boksen)`. Portrættet var ramt på samme måde, men skjult af at rådgiverbillederne er kvadratiske. Cover og contain regnes nu i px af en ren funktion (`deling/billedTilpasning.ts`), og `<img>`-boksen ER det viste — rammen klipper (html2canvas honorerer `border-radius` og `overflow: hidden`). BEVIST PÅ SKÆRM 17:44 i begge formater. Ny fælde i DEL 4. **#880** (`87a03508`, 15:51:53): **like fra feedet** — mekanikken fandtes (tabel, RLS, toggle-RPC, tallet i feedet), kun knappen manglede; rækken var ét `<Link>`, nu ligger linket på titlen og strækkes, knappen ligger over; hjertet navigerer ikke. UDEN NOTIFIKATION, bevidst (Jonas 14/9). Feedets første test.
> **FUND 17 — GÆSTEFELTET GATER KUN NETVÆRKET (kort nr. 13; `recon-community-gate.md`, uden for repoet; §36).** Fem domme er uenige om NULL i `contract_end_date`: `computeMembershipTier` svarer `no_date`, og `useAuth.tsx:130` oversætter det til «full»; `har_aktivt_medlemskab` (SQL bag community, indhold, events, storage) kræver `IS NOT NULL` (`20260907141500:56`); `is_membership_active` siger true på NULL (`:70`). Resultatet: menuen viser Community, siden åbner, tjeklisten beder om en præsentation — og databasen afviser opslaget. `companies.status` og `contract_start_date` indgår i INGEN dom. FIRE manuelle genveje, ikke én. **MÅLT I PROD 14/9 ca. 17:42 dansk: TO virksomheder i tilstanden**, begge med én bruger, oprettet 31/8 og 1/9, navne på formen «X's virksomhed» — den form `handle_new_user` laver (`20260319101733:65-70`). **JONAS 14/9: de to er GÆSTER, ikke medlemmer**, allerede sat som gæster 2/9 (`companies.vis_i_netvaerk = false`, migration `20260902110000_gaest_i_netvaerk`; formularen kalder feltet «Gæst — har adgang til platformen, men vises ikke i Netværket», `EditCompanyDialog.tsx:38-51, :116, :247`). MEN kolonnen læses KUN af `get_member_directory` — den gater Netværket, intet andet, og indgår ikke i `membershipTier` eller nogen adgangsdom. **JONAS' BESLUTNING: en gæst SKAL kunne se Community, men ikke skrive.** Adgangen er altså næsten rigtig; det der mangler er GRÆNSEN: i dag opdager hun det som en FEJL når hun trykker gem, og tjeklisten beder hende præsentere sig i et fællesskab hun ikke kan skrive i. Kort nr. 13 omskrevet til det.
> **NAT — TRE PR'ER EFTER BOGFØRINGEN #881 (§37–§40). Klokkeslæt i UTC; notaterne fra aftenen var lokale og er regnet om.** **#882** (`ee598862`, merget 17:55:51 UTC; edge-funktion, auto-udrullet ved merge) — **DAGSKVOTEN TALTE MAILS MEDLEMMET ALDRIG FIK.** Målt i prod 17:38 UTC (PR-teksten skriver 19:38 — lokalt; PR'en er merget 17:55:51 UTC, så målingen ligger før merge): køen havde ikke sendt noget i 216 minutter. Cron-vagten svarede 200 på hvert kald, nul fejl, nul timeouts — funktionen GATEDE, den fejlede ikke. En funktion der kaldes, svarer 200 og ikke sender noget, er ikke en fejl; det er en gate der lukker. Årsagen: `MAX_EMAILS_PER_DAY` talte rækker i `email_send_log` UANSET status. Formiddagens fire eventmails plus to afvisninger på Lovables loft kl. 09:10 — FØR #857 blev udrullet 10:03, så de står som `failed`, ikke `rate_limited` — gav fem. Fem adresser var spærret efter kun TRE modtagne mails: bsl@larsen.dk, caspar@brick-works.dk, marianne@mmoelgaard.com, peterjacobsen2000@yahoo.dk, rnl@larsen.dk. #857 undtog kun `rate_limited`; nu tælles KUN `sent` — det der nåede frem (`KVOTE_STATUSSER = ["sent"]`, `_shared/dagskvote.ts:42`, kildeværn mod en lokal grænse i funktionen; testen dækker også `pending` og `dlq` fra den gamle kø). **MÅLT FØR UDRULNING — det der gjorde den forsvarlig:** 13 kandidater under 12 timer, alle fra i dag — 5 `chat_reply`, 5 `event_published`, 2 `member_message`, resten info. **BEVIST I DRIFT:** cronens egen kørsel kort efter udrulningen sendte FIRE mails («sent»: 4); målt 19:51 UTC: de fem spærrede står med 4 sendt og 2 failed — fire i kvoten, ikke seks; de har plads igen. (Notatet skriver «udrullet 19:47» — lokalt, 17:47 UTC, otte minutter FØR merge-tiden; auto-udrulningen ligger ved merge, så klokkeslættet er læsemarkeringens nedenfor.) **#883** (`719076a7`, 20:04:13 UTC) — **IMPORTEN SKREV ALDRIG KONTAKTPERSONEN** (fund 4: kendt siden 2/9, 35 af 39 ramt, aldrig rettet; gennemkørslen viste forskellen — Monday-vejen satte feltet, importvejen ikke). Navnet bygges nu ét sted (`bygKontaktperson`, `virksomhedsraekke.ts:132`, kanonisk i `src/lib`, spejlet i `_shared`) og bruges af begge veje — Monday har fornavn og efternavn i hver sin kolonne, importen et samlet navn; et tomt navn giver tom streng, aldrig «undefined». Kildeværn håndhæver at begge kaldere sender `contact_name` ind. En genbrugt virksomhed får også navnet sat. **ÅBENT: SQL til de 35 eksisterende er SKREVET, IKKE KØRT** — med guard på at feltet stadig er tomt. **#884** (`a417618b`, 20:10:24 UTC; frontend + edge-funktion — frontend KRÆVER Update-klik) — **KLOKKEN: RÅ HTML, EN JSON-MUR OG KNAPPEN I BUNDEN.** Set på skærm 17:43 UTC: en besked fra et medlem viste sine egne HTML-tags som tekst i uddraget («<p>Hej Jonas, </p><p>Jo, det virkede ok! :-)<br>…»); en besked uden formatering så ren ud, så det ramte hver gang nogen brugte afsnit eller linjeskift. Uddraget dannes i `send-slack-chat-notification:126` og er nu ren tekst; strippen `renTekst` bor i `src/lib/hjemmebane/richtext.ts` og er SPEJLET i `_shared/richtext.ts` med paritetstest, fordi uddraget dannes både i fladen og i edge-funktionen; klokken renser selv de rækker der allerede ligger med tags. Vagtens driftsbesked fyldte en halv skærm med tredive nøgler i rå JSON — to lag: vagten skriver `v_tal::text` i `body`, OG klokkens `line-clamp-2` var dødt, fordi `block` stod ved siden af (Tailwinds display ligger efter lineClamp i stylesheetet). Tallene står nu i læselig form i overskriften («3 × 500»), detaljerne er klippet, og de er stadig i rækken og i `cron_vagt_log`. «Markér alle som læst» flyttet fra bund til top. Klokken havde INGEN tests; nu har den. Mangellistens to klokke-kort fra 11/9 lukket; det tredje («åbner indbakken, ikke samtalen») står — ikke rørt.
> **DE 587 GAMLE ER MARKERET SOM LÆST — kørt i hånden 17:47 UTC (§38).** Målt 17:41 UTC: 618 usendte notifikationer, hvoraf 587 ældre end et døgn — næsten alle rådgivernotifikationer (`report_committed` 229, `report_uploaded` 226, `pulse_checkin` 41), alle med priority «info». BEKRÆFTET I KODEN: info-filteret ligger på DATABASESIDEN af hentningen (`send-notification-email/index.ts:187`, `.in("priority", ["action_required", "important"])`), så en info-række kommer aldrig ind i funktionen — de kunne aldrig være sendt. JONAS 14/9: «Alt gammelt kan bare slettes. Vi er fuldt opdateret på platformen alligevel.» Valgt form: markeret som LÆST frem for slettet — samme effekt på kø og badge, men kan rulles tilbage. 587 rækker fik `read_at`; 33 tilbage, alle fra i dag. **Det åbne:** writerne skriver videre, så info-rækker til rådgivere hober sig op igen — nyt kort (Drift).
> **FUND 18 — DER FINDES ET AFSENDELSESVINDUE 07–20, OG DET STOD INGEN STEDER SOM REGEL.** Opdaget i tørkørslens log 19:49 UTC: fem eventmails stod som «[venter] uden for vinduet 07–20» (`send-notification-email/index.ts:430`). Koden: `SEND_WINDOW_START_HOUR = 7`, `SEND_WINDOW_END_HOUR = 20` (eksklusiv), dansk tid via Intl (`_shared/notificationEmailSelection.ts:139-141`); udskudte kandidater (> 6 timer gamle — holdt tilbage af kvoten) OG alle handlingsudløste typer (`EMAIL_DELAY_MINUTES_BY_TYPE`, fx `event_published`) sendes kun kl. 07–20 dansk; friske default-kandidater sendes døgnet rundt (`:284-296`, `:358-380`). Mails sendes altså IKKE om aftenen for de typer — og det ændrer hvad man kan forvente af køen: en kø der «står stille» efter kl. 20 dansk (18:00 UTC) er ikke en fejl, og en aftenmåling af «usendte» tæller vinduets ventende med. DEL 4 nævnte det ikke, mangellisten heller ikke; DEL 2 «10. september» §8 og §11 nævner det kun i forbifarten (vagtens tærskel «kun 07–20»; tælleren `venter_paa_vindue`). Nu en fælde i DEL 4 og en linje på mailloftet-kortet. Sammenhængen med #882: aftenens 216 minutter uden afsendelse var kvoten (målt 17:38 UTC = 19:38 dansk, INDE i vinduet), ikke vinduet — men fra kl. 20 dansk ville vinduet have gjort det samme, stille.
> **STRIPE-MIGRERINGEN ER I GANG — 14/9 AFTEN (§41–§44). Intet af det er kode; alt er gjort i Stripe Dashboard. Klokkeslæt i UTC — notatets 22:39 og 23:05 var lokale (klokken var 21:20 UTC da notatet kom).** Gammel konto Topix.dk `acct_1QP3Js4DoYItGRbI` (opsat via Circle, 0,5 % application fee) → ny konto The Boardroom `acct_1U6mzp3CvBmCx5Pt`. Piloten doggybed flyttet 2/9, trak korrekt 13/9. MÅLT 14/9 kl. 19:00: 15 aktive på den gamle; to i sidste periode (PHILBERT 29/9, Pro-Vision 21/9) FORNYS frem for at flyttes; 13 skal flyttes. **(1) Kundekopi** (trin 1–2 i husets rækkefølge, migration-recon §24): 13 kunder kopieret med «Copy customers», CSV uden overskrift (§21); ALLE 13 fik betalingsmiddel med — bekræftet på hver enkelt. Det ubekendte er besvaret: Launch Labs pm var type `link` (ikke et kort gemt via Link som doggybeds), og Stripes dokumentation svarede ikke entydigt — MÅLT: kopieret rent, nyt pm-id, typen bevaret. Og de 13 er BLANDEDE: Livja havde to kopier af samme kort (samme fingerprint, én med adresse og én uden — kundens og abonnementets default kopieres hver for sig); Fjeldgaardshop BÅDE et kort med wallet.link OG en ren link-pm. Man kan ikke slutte fra én kunde til de andre. **(2) To flyttet i hånden, helt igennem:** Livja (`cus_T44oqJhzxlpPCf`, company `5d7fb0a3-7ffa-467f-ad24-b3145961a0a6`): `sub_sched_1UFgaM3CvBmCx5PtcDTnN0a1`, start 16/9, slut 15/12, `nyt_40000_rate12`, proration none, metadata art/company_id/migreret_fra/migreret_dato; gammelt `sub_1S7wf34DoYItGRbIRwtynK9h` ANNULLERET 20:39 UTC (immediately, ingen refusion). Fjeldgaardshop (`cus_UAcxhBRUM4CJzw`, company `95657412-41e1-4576-8ace-59d526c14ef2`): `sub_sched_1UFglk3CvBmCx5PtDaQdoS3D`, start 18/9, slut 17/3-2027; gammelt `sub_1TCHhb…` annulleret. **(3) TÆLLINGEN ER REGLEN, IKKE DATOEN (Jonas 14/9): «Der skal være 12 træk i alt.»** Det gamle abonnements `cancel_at` er IKKE pålideligt: Fjeldgaardshops stod til 15/5-2027 = 15 træk; MÅLT på fakturaer havde hun betalt 6, altså 6 tilbage. Livja: 9 betalte, 3 tilbage — fakturanumrene springer fra 0004 til 0008 (fire måneders pause dec–april): 12 træk over 15 måneder. OG sidste træk dækker en måned frem, så abonnementet slutter en måned EFTER sidste træk, ikke dagen efter (Jonas' rettelse). **(4) BILLING MIGRATION TOOLKIT — fundet og brugt** (Dashboard → Subscriptions → Migrations: CSV-upload, validering før oprettelse, ingen kode). To fund: **(a) `cancel_at` findes IKKE som kolonne og droppes TAVST** — kun `cancel_at_period_end` (boolean); første forsøg havde `cancel_at` med, valideringen klagede ikke, kolonnen var væk i den validerede fil. Uden ophør ville abonnementerne trække for evigt. **(b) `start_date` skal være mindst 24 timer ude** — Launch Lab (træk 15/9) afvist af netop den regel (husets egen fra 1/9: migrér ikke tæt på et træk). `metadata.` understøttes (bliver `metadata_art` osv. i eksporten). **(5) Ti oprettet via toolkit 21:05 UTC:** migration `bm*AaCht0C6BwAAAKvS`, 10 af 10 valideret, 10 af 10 planlagt; Jonas satte `cancel_at` på alle ti bagefter i hånden. MÅLT EFTER: alle ti har end_date sat, antallet af træk er korrekt. **TIDSZONEN:** end_date og start_date står kl. 22:00 UTC = midnat dansk — de NYE trækker ved midnat dansk på trækdagen, de GAMLE senere samme dag (YKRG kl. 13:30). De gamle skal annulleres FØR den 20/9, ikke bare «inden næste træk». **VINDUE:** kan rulles tilbage fra Dashboard indtil 20/9 kl. 01:57 dansk (19/9 23:57 UTC); derefter live. **(6) IKKE GJORT — SKAL GØRES:** de ti gamle er IKKE annulleret, frist FØR 20/9 (Jonas: i morgen med friske øjne — en annullering kan ikke rulles tilbage, mens de nye stadig kan). Launch Lab ikke flyttet: trækker 15/9 på den GAMLE konto som planlagt, flyttes bagefter. `companies.stripe_customer_id` ikke skrevet for nogen af dem. **FUND 19 — MAILS VED MIGRERING:** den gamle konto sender INGEN mail ved annullering (ingen cancellation-indstilling), men «Send emails about upcoming renewals» er TIL med 7 dages varsel — medlemmer kan have fået varsel om et træk der i stedet kommer fra den nye konto. Den NYE konto har trial- OG fornyelsesvarsler SLUKKET: ingen dobbeltvarsler, men også intet varsel før et træk på 4.375 kr. ÅBENT: valg eller forglemmelse? **FUND 20 — DATAGRUNDLAGET:** Jonas' Excel-udtræk (Monday «Ansøgninger», 27 aktive) med «Startdato» og «Samlet betaling (historisk)» gav antal træk uden fakturaopslag. KJ AUTO, Warburg og Capture IT er på ANDET år — KJ AUTO på `fornyelse_15000_rate12` (1.312,50/md.), bekræftet af `companies.indgangspris_oere` = 30.000. TRE af de elleve har ANDEN mail i platformen end i Stripe (BR Roset RNL@ mod bsl@, Homie thomas@ mod nicolai@, Two Socks simon@two-socks.com mod simon@simonfrimann.dk) — et opslag på mail alene finder dem ikke. OG BR Roset har kontrakt 3/5-2026 → 3/3-2027: TI måneder, ikke tolv — ikke afklaret, åbent. **JONAS' BESLUTNING — TRÆKHISTORIKKEN:** den gamle kontos træk skal ind i `company_traek`, «fra medlemskabets start», med beløb, dato og fakturanummer — FØR den gamle konto lukkes; data kan ikke hentes bagefter. Livja har ni betalinger (39.375 kr.) der kun står ét sted nu. Recon lavet (`recon-traekhistorik.md`, uden for repoet): tabellen kan bære det, UNIQUE på `stripe_invoice_id` gør en import idempotent, men platformen kan IKKE tale med den gamle konto (én `STRIPE_SECRET_KEY`, den nye), og koblingen gammelt `sub_…` → `companies.id` findes kun i reconens tabel og i de nye abonnementers `migreret_fra`. Ikke bygget. Nye fælder i DEL 4: en CSV-kolonne kan droppes tavst af et værktøj; et gammelt abonnements `cancel_at` er ikke antallet af træk; 22:00 UTC er midnat dansk — det nye trækker før det gamle samme dag; man kan ikke slutte fra én kundes betalingsmiddel til de andres.
> **15/9 NAT — PODCASTEN ER UDE (#888, `130c366f`, merget 14/9 22:24:57 UTC; ren frontend, KRÆVER Update-klik — ikke bevist på skærm) — OG DE TYVE FØR 22/9 (§45–§46).** Beslutning 17 gennemført: menupunktet «Podcast & Talks» og `PodcastTalksView` (352 linjer) slettet, ruten væk; ét Spotify-tekstlink nederst i `HbSidebar` for medlemmer og abonnenter, ikke rådgivere; konstanten i `lib/hjemmebane/podcastSpotify.ts`. Forsidens podcastkort, `podcastRss.ts` og `podcast-rss`-funktionen er IKKE med i #888 (står stadig). **DE TYVE** — Jonas bad om en prioritering 15/9 kl. 00:30, lavet ud fra det fulde udtræk (161 kort, 148 åbne): frist der ikke kan flyttes (1–4: de ti gamle Stripe-abonnementer FØR 20/9; BR Rosets ti måneder FØR hendes gamle annulleres; Launch Lab efter trækket 15/9; Studio Minis tilbyd-række før 20/9) · rammer de 10–15 nye (5–12) · rydder op efter 14/9 (13–16) · indhold og små huller (17–20). **NÅR HAN KUN NÅR FEM: 1, 2, 5, 6, 7.** Hele listen med begrundelse i §46; kortene selv er uændrede. **DE SEKS IDÉER FØR 22/9 (Jonas 15/9 kl. 01:00; §47)** — kriteriet: kan idéen kun gøres nu, eller bliver den bedre af at de 10–15 ankommer samtidig? (1) «De første 30 dage» — målingen, den eneste der KUN kan gøres før webinaret · (2) peer-matching, manuel form · (3) tom-tilstandene bevist på skærm · (4) video-rating med ét tryk · (5) «Online nu» på rådgiverne · (6) henvis til et tal i chatten, frossen udgave. Droppes først hvis tiden går: 6, derefter 5. En vurdering, ikke en måling; kortene uændrede.

> **Mangellisten:** otte nye kort formiddag (§8); middag: fire lukket (fund G #853, den tavse berigelse #855, de to mails #856, fund A #849 — med forbehold), tre nye (mailloftet, YKRG's CVR, berigelsens NOT_FOUND), to omskrevet (kort 6 og 7 af 18) — §16, §17; eftermiddag: fund A's forbehold væk, fund B lukket (#859), fund E lukket (#860), kort 4 af 18 lukket (videoen i drift), «I STYKKER»-linjen siger kun C tilbage — §20–§23; efter gennemkørslen: nr. 1 lukket (bevist i drift), kort 5 af 18 og CVR-kilden omskrevet, et nyt kort (tjeklisten 0 af 7 ad Monday-vejen) — §24; sen eftermiddag: nr. 8 lukket (#864, kræver Update-klik), YKRG's CVR lukket (transponeret — rettet i hånden 11:47, mærket væk 11:49), NOT_FOUND-kortet skærpet (fund 13), delingen omskrevet (designet lavet, de to beslutninger, portræt-påstanden rettet), kort 12 uændret (parseren urørt), «Beviser der udestår» et tiende — §25–§28; aften: nr. 16 omskrevet (ét felt bredt — kun nulstil-mailen mangler i loggen; ikke før 22/9, Jonas), nyt kort «auth-email-hook holdt op med at logge 8/9» — §29; aften: nr. 3 omskrevet (del 1 BYGGET #868–#876; del 2 og menupunktet venter), nr. 9 omskrevet (ansøgningen aldrig offentligt — tilbage er en tekstopgave med eksempler), affiliate-kortet skærpet (10.000 kr. pr. henvist medlem, efter 22/9) — §30–§33; sen aften: nr. 13 omskrevet (en gæst skal møde en grænse, ikke en fejl — fund 17), nr. 18 «Community-idéerne» delvist bygget (like fra feedet #880; åbent: notifikation ved like) — §34–§36; nat: to klokke-kort fra 11/9 lukket (rå HTML, rå JSON — #884), contact_person-kortet omskrevet (rettet i kode #883; SQL for de 35 skrevet, ikke kørt), mailloftet-kortet og «Beviser der udestår» ført à jour (#882 bevist i drift; fund 18, vinduet 07–20), nyt kort «Rådgivernes info-notifikationer hober sig op — kan aldrig mailes» (Drift) — §37–§40; sidst i nat: migrationskortet omskrevet («12 af 13 flyttet — de ti gamle skal annulleres FØR 20/9»), «Platformen kan ikke se hvem der betaler» ført à jour (kunde-id'erne kendes nu, `stripe_customer_id` stadig ikke skrevet), fire nye kort (trækhistorikken ind i company_traek før kontoen lukkes; ingen varsler før træk på den nye konto — valg eller forglemmelse; BR Rosets kontrakt er ti måneder; tre har en anden mail i platformen end i Stripe), «Fakturanummer-serien» udvidet, Rækkefølgens punkt 2 omskrevet — §41–§44. DEL 4: fire nye fælder formiddag, fire middag, én efter gennemkørslen (to kanaler, to tilstande); sen eftermiddag: «Et gyldigt format er ikke en eksisterende post» skærpet — registrets «findes ikke» ligner kvotens «no data»; aften: «LOVABLE KAN BYGGE OM UNDER OS» skærpet — hooken holdt op med at logge ved ombygningen 8/9; sen aften: tre nye fælder (fuldsides-skærmbillede af en fixed-overlejring; to vinduer, ét git-index; samme sti giver samme URL — browseren spørger aldrig igen); sidst: html2canvas genimplementerer CSS selv og kender ikke alt (#879); nat: to nye fælder (en gate der lukker ligner ikke en fejl — 200 og nul timeouts kan være nul mails; afsendelsesvinduet 07–20 står kun i koden); sidst i nat, migreringen: fire nye fælder (en CSV-kolonne kan droppes tavst af et værktøj; et gammelt abonnements cancel_at er ikke antallet af træk; 22:00 UTC er midnat dansk — det nye trækker før det gamle samme dag; man kan ikke slutte fra én kundes betalingsmiddel til de andres). 15/9 nat: nr. 10 af 18 «Podcasten ud af platformen» LUKKET (#888; §45) — 161 kort (160 + skabelonen), 13 lukkede, 147 åbne; Rækkefølgens linje for nr. 10 rettet; de tyve før 22/9 i §46 ændrer ingen kort.
>
> ## 13/9 — START HER (skrevet 13/9 eftermiddag; opdateret 13/9 sen eftermiddag efter #826 og igen efter udrulningen kl. 14:20 UTC — og igen 13/9 aften efter bygning 3, og igen efter kort 40 og #833, og igen 13/9 aften efter oprydningen del 1 (#836), og igen 13/9 sen aften efter kort 56 (#837) og bogføringen af oprydningen (#838), og igen 13/9 sen aften efter Calendly-kæden (#842), og igen 13/9 sen aften efter den inkluderede session med Jonas (#844) og reconen «efter sessionen», og igen 13/9 sen aften efter ansøgningssporet, webinarets tidsramme og kort 29's recon — HEAD `e99019c5` = #847, merget 13/9 kl. 21:24:30 UTC — OG 14/9 MORGEN: HEAD `b6585db2` = #848 (docs); planen frem mod webinaret i DEL 2 «13. september» §26–§27; prod målt kl. 14:01, `~/Downloads/query-results-export-2026-09-13_14-01-42.csv`)
>
> **14/9 MORGEN — I MORGEN, I RÆKKEFØLGE** (detaljen i DEL 2 «13. september» §26 og §27; kort 82 er bogført i §25):
> **(1) MÅLINGERNE FØRST.** De ni prod-målinger fra A's recon §7 står klar med tærskler i `~/Downloads/maalinger-foer-webinaret.md`: ÉN SQL (kun SELECT, 16 dele, kolonnen `dom` siger OK/FEJL/UBEVIST pr. linje) i Lovable → SQL editor dækker nr. 1–7's spor; nr. 1, 2, 3 og 7 er secrets og kan kun ses som NAVN i Lovable → Cloud → Secrets (værdier er skjulte, DEL 4) — beviset går gennem noget der bruger dem; nr. 8 er Stripe Dashboard (endpoint `we_1UAtaW3CvBmCx5PtL736lAJN`, seks events, failed-webhook-mail TIL); nr. 9 er theboardroom.dk i view-source og LinkedIns Post Inspector. Tre fund fra FIND FØRST: cron-JOBNAVNE er ikke funktionsnavne (`onboarding-rytme` «0 8 \* \* \*», `intro-session-reminder` «0 9», `indgangs-paamindelser` «0 10» — filen 20260909180000 siger «15 9» og er forkert); Monday-boardets id er en KODEKONSTANT (`mondayAnsoegning.ts:16` = 1899777797), ikke en secret; og at slå invitationsskabelonen fra løser intet (fallback'en i koden har de samme fire usandheder).
> **(2) GENNEMKØRSLEN** (mangellistens nr. 1 «Indgangens kæde har aldrig haft en virksomhed»): testvirksomhed → «Godkendt» i Monday → /betal → Stripe → signup → første login. Den afslører fund A, B og C på et menneske og lukker syv kort; de tre «UBEVIST» i målingerne (secret 1, secret 2, Monday) lukkes af den, ikke af flere målinger.
> **(3) DE TRE RETTELSER — I STYKKER, øverst i mangellisten:** A `betalt=1` læses aldrig (`Betal.tsx:131`; betalingsskærmen igen med tre aktive knapper efter betalingen — rammer HVER betalende), B invitationens udfald kastes væk (`stripe-webhook:1224/1231/1290`; rettelsen er `skrivRaadgiverBesked`, + fund D), C invitationsmailens fire usandheder — teksten står i `email_templates`, én UPDATE i SQL editoren + fallback'en i koden. Alle tre er små; ingen er estimeret i dage (DEL 4, ny fælde).
> **(4) DELINGEN** (§27, nr. 3 af de atten): Jonas' krav 13/9 — kreativ med Morten og Jonas, medlemmets billede eller logo, 3–4 tekster, som tjeklistepunkt for NYE medlemmer (besluttet: eksisterende får ikke listen åbnet igen). Stakken kan det uden nyt bibliotek (`html2canvas` 1.4.1, `HbDropzone`, Konto-mønstret); det der blokerer er DESIGNET og otte spørgsmål på kortet — ikke koden. «Del direkte på LinkedIn» kan ikke bygges (OAuth). Jonas' portræt er 300 px — der skal et nyt.
> **De atten kort** står i mangellisten med tag «22/9 · nr. N af 18» og som nummereret liste øverst i «Rækkefølgen». Fund A–K er blevet syv kort (A+E, B+D, C, K, G, F/I/J, H). Mangellisten: 135 → 141 kort (kort 82 fjernet som løst — det stod der stadig).
> **Bevist i dag — doggybeds træk gik igennem.** Sektion `a_doggybed_traek`,
> ordret: «betalt · in_1UF8tR3CvBmCx5PthFjFOjFc;a_doggybed_traek;2026-09-13T09:36:24.309794+00:00
> | beloeb 437500 | id 781b4c5c-77d8-4ecf-8b45-30e085cc79b0» — kl. 09:36:24
> UTC (11:36:24 dansk), 437.500 øre = 4.375 kr., ÉN række. **#572 BEVIST.**
> Sektion `b_doggybed_abonnement`, ordret: «Doggybed;b_doggybed_abonnement;subscription_status
> NULL | stripe_customer_id NULL | slutdato 2026-10-13». **#563 BEVIST** —
> grenen sprang over med vilje. Bemærk: `stripe_customer_id` er STADIG
> NULL; det er det der blokerer kundeportal-linket (kort 26).
> **Driften** (sektion `e_drift`, ordret): «cron-job
> send-monthly-digest;e_drift;0» og «cron-jobs i alt;e_drift;18» —
> digesten er stadig slukket, og 18 = 19 (målt 11/9 kl. 09:20) minus
> digesten. Sektion `d_praesentation`: INGEN række i resultatet — 0 tråde
> med `kilde_type = 'praesentation'`.
>
> **#815 er IKKE bevist — og KAN ikke bevises af dette træk.** Sektion
> `c_klokke_traek_fejlet`, ordret: «ingen raekker i alt
> (kontrol);c_klokke_traek_fejlet;0». Et vellykket træk sender aldrig
> `invoice.payment_failed`; beviset kræver et fejlet træk, og hvornår det
> sker, er ukendt.
>
> **stripe-webhook — navnet er i ental, og funktionen er udrullet.**
> Mappen hedder `supabase/functions/stripe-webhook`, og `config.toml:61`
> siger `[functions.stripe-webhook]`. Denne fil skrev «stripe-webhooks»
> fire steder — rettet 13/9 (ny fælde i DEL 4); to kodekommentarer
> (`fornyelsesperiode.ts:39` i begge kopier) tages med i næste bygning i
> vindue A. Udrullet 13/9 kl. 12:04 UTC (14:04 dansk) i Lovables
> build-chat, EFTER trækket. Lovable ordret: «Udrulningen af stripe-webhook
> lykkedes kl. 2026-09-13 12:04 UTC. Endpointet svarer live med HTTP 400
> Invalid signature (forventet). Ingen filer, andre funktioner eller
> migrationer blev rørt.» Nu kører main — men `payment_failed`-grenen er
> stadig ubevist i drift.
>
> **Kort 83 er I DRIFT — PR #820** (`fix/fjern-halv-sletning-members`,
> commit `16f0ab27`, fem filer +82/−230). Fire beviser, i rækkefølge:
> (1) merget — `gh pr view 820 --json mergedAt,mergeCommit`, ordret:
> «{"mergeCommit":{"oid":"1b45add2d242eb27d665485398f05e7418929794"},"mergedAt":"2026-09-13T12:17:29Z"}»
> (14:17:29 dansk); (2) diffen læst i chatten før merge — serveren mistede
> hele grenen (91 linjer), `ADVISOR_ALLOWED_ACTIONS` og
> `fjern-fra-virksomhed` urørte; fladen mistede knap, dialog og de
> imports der kun tjente den; `maaFjerneMedlem` væk, `erOwner` og
> `maaFjerneFraVirksomhed` uændrede; kildeværnet læser fire filer med
> regex på HELE ordet plus et værn mod at action-routingen kender navnet,
> og A kørte en NEGATIV PRØVE (teksten indsat → 2 af 15 tests fejlede,
> prøvelinjerne fjernet igen); tsc nul fejl, tests 2891 → 2892,
> `check:edge-auth` PASS (69 filer); (3) `manage-advisor` udrullet
> EKSPLICIT i Lovables build-chat, ordret: «Udrulningen af manage-advisor
> lykkedes kl. 2026-09-13 12:18 UTC. Endpointet svarer live med HTTP 401
> Unauthorized (forventet). Ingen filer, andre funktioner eller
> migrationer blev rørt.» (14:18 dansk) — uden den ville grenen leve
> videre på serveren; (4) fladen bevist på skærm kl. 14:22:53
> (`screencapture-app-theboardroom-dk-members-2026-09-13-14_22_53.pdf`:
> BR Roset udfoldet, TEAM (2) viser René Larsen (owner) og Betina Larsen
> (member) UDEN fjern-kryds) og kl. 14:21:55 på virksomhedssiden
> (`screencapture-…-virksomhed-7b0056eb-…-14_21_55.pdf`: «Fjern fra
> virksomheden» står ved Betina (member), IKKE ved René (owner)).
> **Forbehold: serveren er UDRULLET, IKKE drifts-bevist.** Et driftsbevis
> kræver et admin-token i browserkonsollen; chatten bad Jonas om det, og
> han afviste med rette (Jonas 13/9: «Du skal teste på en anden måde frem
> for at jeg skal lege udvikler»). Beviset blev droppet, ikke glemt (DEL
> 4, ny fælde). Det der holder grenen væk, er kildeværnet i testen plus
> at Lovable udrullede fra main. FIND FØRST-fundene står i DEL 2 «13.
> september» §4.
> **Køen efter kort 83:** 40 GJORT (#832, §13) → branchelinjen GJORT
> (#833, §14) → brancheafsnittet GJORT (#834, §15) → oprydningen DEL 1
> GJORT (#836, §16: run-weekly-agent slettet, digestens kode fjernet) →
> oprydningen DEL 2: podcasten ud — og «Standardmål»-mærket, der er død
> kode efter kort 40 → 56 GJORT (#837, §17) → 76 BYGGET (#839, #840 — ikke bogført) → 82 → 57 → 29. **A4:** recon af hvordan linjen for en ny refleksion lukkes
> (forslag 21).
>
> **Åbne beviser:** kort 60's tre (tjeklistens punkt på et medlems skærm;
> den første rigtige præsentation — 0 i dag; velkomstmailens nye tekst);
> #815's fejl-gren (kræver et fejlet træk); 14/9 første hele uge med
> `weekly_focus.seen_at` på forsiden. **Åbne beslutninger:** 20, 21 og 22
> (forslag fra chatten, stående uden indsigelse) samt migrationen af de
> 13 — betingelsen fra 2/9 (at trækket 13/9 gik igennem) er opfyldt;
> hvornår og i hvilke portioner er IKKE besluttet (DEL 3).
>
> **`/members` — LØST 13/9: ALLE TRE BYGNINGER ER I DRIFT.** Jonas 13/9,
> ordret: «Hvornår fanden bliver /members lavet om og konverteret til
> hjemmebane design? Det er en lorteside.» — reconen, målingen 14:45 og de
> fire beslutninger står i DEL 2 «13. september» §5. **Bygning 1** (#823,
> #824, #825): importen som panel på /virksomheder, noten i Aftalen,
> forsidens linjer til udsnittet — §6. **Bygning 2** (#826, udrullet 14:20
> UTC): syv af elleve veje ind — §7; Guiden afgjort — §8. **Bygning 3**
> (#828 «feat: /members og Guiden slettes (bygning 3)», `gh pr view`
> ordret: mergedAt «2026-09-13T14:47:38Z», mergeCommit
> «d9080ad52bc4e846aab7b894908f4a505b025380»; 22 filer, +49/−3486; tsc 0,
> tests 2978 → 2955, check:edge-auth PASS 69) — §9. Slettet: Members.tsx +
> syv komponenter, Guide.tsx, GuidedTour.tsx, ruterne /members og /guide,
> Guide-punktet i AppSidebar, manage-advisors delete-company-gren. Blev:
> `importensAdvarsel.ts` (HbAnsoegningsimport importerer den — reconen
> sagde otte filer, det blev syv), `/members/:userId` (978
> notifikationer), `useScrollToHash` + test (omdøbt: ankrene er
> dyb-link-ankre, IKKE notifikationernes kontrakt — deep_links er stier
> uden hash; §8's påstand holdt ikke, rettet i §9). Seks værn rettet, ikke
> fem — det sjette var kort 83's eget fra samme formiddag; to læste på
> modulniveau, så 281 linjer værn for andre flader ville være væltet (ny
> fælde i DEL 4). `SECURITY_BASELINE.md:30` rettet til de målte kaldere.
> Update klikket; bevist på skærm — /members og /guide giver NotFound
> (Jonas 13/9, ordret: «De er begge væk»). **manage-advisor UDRULLET kl.
> 14:50 UTC** (16:50 dansk), Lovable ordret: «Udrulningen af manage-advisor lykkedes kl. 2026-09-13 14:50 UTC. Endpointet svarer live med HTTP 401 Unauthorized (forventet). Ingen filer, andre funktioner eller migrationer blev rørt.»
> Sendt EFTER skærmbeviset — rækkefølgen holdt hele vejen: Update →
> skærmbevis → udrulning; der fandtes aldrig et vindue hvor slet-knappen
> stod på skærmen uden en gren bag. **Målt kl. 16:53 (§10,
> `query-results-export-2026-09-13_16-53-25.csv`): sletningen fjernede
> intet der blev brugt** — «Nulstil & gensend», Legatforløb og Indgangen
> havde nul spor; importen er i brug (4 på 90 dage, skarp signatur), tilknyt
> sidst i marts, fornyelseslistens død kostede én virksomhed (PHILBERT, som
> står på forsiden). **NOTEN ER BEVIST I DRIFT:** PHILBERT ApS' note gemt
> 13:57 UTC — tre minutter efter #825 blev merget. **Åbne beviser:**
> rådgivermailens knap i drift (§8), forsidelinkene på skærm (§6), #815's
> fejl-gren (§1).
> **Det der venter — EFTERLADENSKABERNE (§10–§11):** målt 16:53: 129 filer
> uden ejer i `financial-documents` (+2 logoer, +1 screenshot), 30
> frakoblede invitationer, 4 forældreløse konti, 98 mails til 22 adresser.
> Kilderne fundet (A's recon, `recon-efterladenskaberne.md`):
> `hardDeleteCompany` rører ALDRIG storage (nul `storage.from(` i
> `companyHardDelete.ts`) og sluger fejl fra `deleteUser` med `console.warn`
> (`:103-106`) — det er filerne og kontiene; de 30 er `cleanup-shells`'
> bevidste arkivspor (`accepted` + `preserveInvitations`), ikke en fejl; de
> 98 mails har ingen FK. De ti «no action»-FK'er blokerer IKKE de to
> rigtige veje (begge sletter alle ti eksplicit) — kun SQL i hånden og
> kaskaden fra `auth.users`. Slettefunktionen har aldrig slettet selv (8 ×
> `i_haanden`; første kandidat 26/10). **LÆKAGEN ER LUKKET OG UDRULLET
> (§12):** PR #830 «fix: hardDeleteCompany sletter filerne og melder fejlet
> kontosletning», `gh pr view` ordret: mergedAt «2026-09-13T15:31:14Z»,
> mergeCommit «72d10566110948a02b63115efdd4dd2b9603b405»; fire filer,
> +427/−32; tsc 0, tests 2955 → 2967 (192 filer), check:edge-auth PASS 69.
> Udrullet kl. 15:33 UTC (17:33 dansk), Lovable ordret: «Begge edge-funktioner er udrullet fra nuværende main kl. 2026-09-13 15:33 UTC: manage-advisor ✅ live, svarer HTTP 401 Unauthorized; admin-cleanup-test-data ✅ live, svarer HTTP 401 Unauthorized. Ingen filer, andre funktioner eller migrationer blev rørt.»
> Ingen Update nødvendig (kun server). Skarpere end reconen:
> `auth.admin.deleteUser` KASTER ikke — den returnerer `{ error }`, så
> try/catch fangede ingenting, og returværdien blev ignoreret TRE steder
> (companyHardDelete, bulk-remove-members, cleanup-shells trin 0); og
> rækkefølgen (profil før konto) var kilden til de halve. Nu: kontoen
> FØRST, filerne listes rekursivt og tømmes, svarene er kun ok når intet
> fejlede. **Ubevist i drift** (åbent bevis, venter på en hændelse): at
> filerne slettes og en fejlet kontosletning står i svaret — ingen af de
> to veje har en kalder i src. **Åbent:** oprydningen af de eksisterende
> 129 + 2 + 1 filer og fire konti (måling først); bruger-bucket-spørgsmålet
> (skal `hardDeleteCompany` med `deleteUsers` også tømme avatars,
> feedback-screenshots, chat-attachments, community-* — ikke afgjort); og
> om de to admin-veje uden frist og spor (`bulk-remove-members`,
> `cleanup-shells`, `admin-cleanup-test-data` — admin-JWT, ingen kalder i
> src) skal lægges om til slettefunktionens mønster, gates strammere eller
> blive som driftsværktøj — beslutningskortet. Ny fælde i DEL 4: «En fanget
> fejl uden en modtager er en tavs halv sletning» — værre end den så ud:
> catch'en var tomt teater tre steder. Mangellisten 132 → 131 (to kort
> fjernet som løst, to omskrevet, ét nyt — siden omskrevet til
> beslutningskortet). Tests: 2892 → 2978 → 2955 → 2967 (192 filer).
>
> **KORT 40 ER GJORT — KPI-FALLBACKEN ER FJERNET HELT (§13).** PR #832
> «feat: KPI-fallbacken fjernes helt — intet standardmaal (kort 40)», `gh
> pr view` ordret: mergedAt «2026-09-13T15:57:43Z», mergeCommit
> «d46fd7bd01037fecbb846cf6f73429bf3968314e»; otte filer; tsc 0, tests
> 2967 → 2977 (193 filer). Tre ting i én bygning: `KPI_FALLBACK_TARGETS`
> væk og `fletKpiMaal` returnerer kun nøgler med en række i `kpi_targets`
> (en nøgle uden aftalt mål er FRAVÆRENDE, ikke 0 — «intet mål» og «målet
> er nul» kan skelnes); `getTargetStatus.hit` er `boolean | null`, og
> chattens «Se tal»-skuffe tegner kun rust ved `hit === false` (før: rust
> uden mål); brancheskiftets upsert i `kpi_targets` er væk, så
> standardmålet ikke kommer tilbage som «aftalt» — benchmarket synkes
> stadig. Begrundelsen (Jonas 11/9: «Jeg er helt enig med dig!»): et mål
> er noget der er aftalt; 4 af 30 aktive havde en eneste række. **BEVIST
> PÅ SKÆRM kl. 18:26:57**
> (`screencapture-app-theboardroom-dk-kpis-2026-09-13-18_26_57.pdf`, ANLA
> GLAS: «DINE MÅL: Ingen mål sat endnu», ingen mål-tekst, mærke eller rust
> på kortene). **Opfølgning:** «Standardmål»-mærket er død
> kode (eget kort, Lille). **Branchelinjen på KPI-kortet (§14):** samme
> skærm viste «OMSÆTNING / 1.388.412 / branche 150K · −31,5 %» — «150K» er
> `KPI_DEFAULT_BENCHMARKS` (seks estimater for alle, én etage under
> fallbacken), siden modsiger sit eget brancheafsnit (faktisk branche:
> «52-78 % for reklame og design»), og −31,5 % er M/M limet på som en
> afvigelse fra branchen. **Besluttet 13/9 (Jonas): estimatet væk, kortet
> sammenligner med forrige måneds eget tal** («det er jo virksomheder i
> vidt forskellige størrelser»); uden gyldig forrige måned ingen linje.
> **BYGGET — PR #833** «feat: KPI-kortet sammenligner med forrige maaned,
> ikke med et estimat», `gh pr view` ordret: mergedAt
> «2026-09-13T16:21:03Z», mergeCommit
> «ab0fb09f81cf689c1f33bd7f177944d3d440065f»; fire filer (+116/−50), tests
> 2977 → 2982; **bevist på samme skærm 18:26:57**: «1.388.412 / −31,5 %
> M/M», «35,4 % / +1,1 pp M/M», «448.780 / +1,3 % M/M» — intet «branche
> 150K». Nyt fund på skærmen: **M/M arver målets tone** — «+1,1 pp M/M» i
> grøn hos en virksomhed med resultat −242.091; retningen af én måned er
> oplysning, ikke en dom (eget kort, Lille). **BRANCHEAFSNITTET ER MÅLT
> KL. 18:28 OG DØR (§15)** (`query-results-export-2026-09-13_18-28-41.csv`):
> 18 aktive × 2 nøgler = 36 domme, TRE «indenfor» — gross «indenfor 2 /
> over 13 / under 3», ebitda «indenfor 1 / over 11 / under 6». Fire
> virksomheder uden vareforbrug står «over» med 100 % dækningsbidrag —
> intervallet er forkert for dem, ikke omvendt. Alle 130 rækker seedet
> 29/3, aldrig rørt, ingen kilde, intet årstal. 26 af 27 aktive har en
> kode med benchmarks (Bastant Design mangler), 18 har en afsluttet måned.
> Jonas: «Enig med dig» — afsnittet fjernes fra `/kpis`. **MERGET — PR
> #834** «feat: brancheafsnittet fjernes fra Noegletal — intervallerne
> skelner ikke», `gh pr view` ordret: mergedAt «2026-09-13T16:52:02Z»,
> mergeCommit «19e26ca110454afb7bc3e29167bd229adc7d3705» (18:52:02
> dansk). `NoegletalView.tsx` 1296 → 1240 linjer (hentningen, mappingen,
> gaugeRows og render-blokken væk; en kommentar med hele målingen står i
> stedet). Undervejs: `bun run test` på hele suiten kl. 18:40 gav 1 af 2982
> fejlet — #833's eget værn `ingenBranchefallback.guard.test.ts:55` låste
> at afsnittet hentede `from("industry_benchmarks")`; præmissen var
> bortfaldet, og it-blokken blev OMSKREVET til at låse at kortets benchmark
> kommer gennem hooken. A's verifikation havde meldt grønt på egne filer
> alene — tredje gang 13/9 at commit-blokkens egen kørsel fangede det (DEL
> 4, skærpet). Chatten svarede «PR #834 er oprettet» på et vedhæftet output
> der var tomt i beskeden, FØR PR'en fandtes — og gentog fejlen to gange
> mere (ny fælde i DEL 4: «Et tomt dokument er ikke et grønt svar»,
> skærpet: hent filen fra disken). Committen bar også del 3 af denne
> bogføring (docs +428/+130), fordi index'et bar begge — PR-teksten nævner
> kun koden (ny fælde: «`git add <filer>` afgrænser ikke en commit»).
> **Update klikket; BEVIST PÅ SKÆRM kl. 18:58:00**
> (`screencapture-app-theboardroom-dk-kpis-2026-09-13-18_58_00.pdf`, ANLA
> GLAS): siden går fra «MÅNED FOR MÅNED» direkte til «AI-ANALYSE», intet
> hul, ingen tom sektion. Bliver: tabellen og synken til
> `kpi_benchmarks`. Tre
> kort fra målingen: triggeren `BENCHMARK_BELOW` (beslutning — den bruger
> de samme intervaller og rører ugefokus), «tal der ikke kan passe» (Brick
> Works resultatmargin 259,4 % `measured`, Doggybed −101,4 %; og navnet
> `ebitda_margin_pct` lyver — formlen er resultat før skat), M/M-tonen.
> Mangellisten 131 → 132 → 134 (kort 40 og branchelinjen fjernet som løst,
> «Aftalt»- og CVR-branche-kortet omskrevet, fem nye). Tests: 2967 → 2977
> → 2982 (194 filer; #834 ændrede ikke antallet).
>
> **OPRYDNINGEN DEL 1 ER GJORT — run-weekly-agent SLETTET, DIGESTENS KODE
> FJERNET (§16).** PR #836 «feat: run-weekly-agent slettes og digestens
> kode fjernes (oprydning 1 af 2)», `gh pr view` ordret: mergedAt
> «2026-09-13T17:08:09Z», mergeCommit
> «f23b991955148948c4a0f29c119aac6cffae14d7» (19:08:09 dansk); 21 filer,
> +114/−955; tsc 0; tests 2982 → 2961 (192 filer: 19 digest-tests + 2
> DAEKKEDE-poster; sentinellerne agentKaldesteder 10 → 9 og
> agentToerkoersel 6 → 5); check:edge-auth PASS 79 scannede (før 81).
> Beslutningerne er fra 11/9 (Jonas, ordret: «A» og «Sluk den»).
> **Fundet der ændrer billedet:** «weekly_cron» i `KNOWN_TRIGGERS`
> (`run-company-agent/index.ts:1035`) var IKKE død kode — så længe navnet
> stod i hvidlisten, kunne et service-role-kald starte en mandagskørsel
> ingen havde besluttet, med prompt-grenen «Det er mandag morgen …» og
> retten til at skrive i weekly focus. Navnet er fjernet; kaldet afvises
> nu med 400. Reconen 11/9 kaldte alle fem grene «døde» — fire var det;
> rettet i §16. Migrationen `20260913190000_monthly_digest_slukkes.sql`
> følger `20260901110000`-mønstret (DO-blok med IF EXISTS + efter-SELECT;
> chattens nøgne `cron.unschedule` ville have kastet, jobbet har været væk
> siden 11/9 kl. 12:07) — **KØRT i SQL editoren 13/9: «Query succeeded. No
> rows returned»**. Gemte `monthly_digest`-værdier bevares
> (`fletPraeferencer`; nøglen i `SKJULTE_NOEGLER`, ingen backfill).
> **run-company-agent UDRULLET kl. 17:09 UTC**, Lovable ordret:
> «Udrulningen af run-company-agent lykkedes kl. 2026-09-13 17:09 UTC.
> Endpointet svarer live med HTTP 401 Missing or invalid authorization
> (forventet). Ingen filer, andre funktioner eller migrationer blev
> rørt.» Update klikket; **BEVIST PÅ SKÆRM kl. 19:13:00**
> (`screencapture-app-theboardroom-dk-admin-emails-2026-09-13-19_13_00.pdf`,
> `/admin/emails`: kortet «Månedlig digest» med «Send test» og «Send til
> alle» er væk, ingen digest-skabelon i listen) **og kl. 19:16:58**
> (`screencapture-app-theboardroom-dk-settings-2026-09-13-19_16_58.pdf`,
> `/settings` → Notifikationer: «E-MAILS FRA OS» har FIRE punkter,
> «Månedsoverblik — Den 22. i måneden» er væk, «Ugens fokus» i sit eget
> kort). Chatten dikterede først `/admin/email-templates` og
> `/indstillinger` — begge «Siden findes ikke»; ruterne er `/admin/emails`
> og `/settings` (`App.tsx:271`, `:269`; ny fælde i DEL 4: «En URL
> dikteres ikke af hukommelsen»). **Åbent:** de to slettede funktioner
> ligger formentlig stadig udrullet hos Lovable — ingen kalder, ingen
> cron, men skal de afregistreres?; etiketten `AgentForslagPanel.tsx:44`
> og fire kommentarer (kortet «Oprydningens rester»). **Del 2 venter:
> podcasten ud** (kortet «Podcasten ud af platformen — ét link til
> Spotify»). Mangellisten 134 → 134 (ét kort fjernet som løst, ét nyt,
> tre omskrevet). **NB:** denne bogføring blev taget med i vindue A's
> commit `3e3fd9ed` = **PR #837** (kort 56) kl. 19:27:10, fordi begge
> vinduer delte index'et — forudsætningen «A skriver ikke» holdt ikke.
> Genskabt og staged på main igen; se §16's sidste punkt. **Udfald:** #837
> blev merget 17:29:00 UTC med §16 om bord (docs +212/−9 og +37/−16 i
> `146a1596`); resten af bogføringen (NB'en og fælden) gik som **PR #838**
> «docs: oprydningen del 1 bogfoert, og index-faelden skete igen», `gh pr
> view` ordret: mergedAt «2026-09-13T17:35:45Z», mergeCommit
> «32c7eb32874e4ef77694b85f8c10ece1121d50d7» (+30/−1, +4/−0).
>
> **KORT 56 ER GJORT — HANDOUT-SIDEN LINKER TIL DE LEKTIONER DER HØRER
> TIL (§17).** PR #837 «feat: handout-siden linker til de lektioner der
> hoerer til (kort 56)», `gh pr view` ordret: mergedAt
> «2026-09-13T17:29:00Z», mergeCommit
> «146a159601bafdbbedf794a3473e4c0281fe1c92» (19:29:00 dansk). FEM filer:
> tre egne (`HbHandoutDetail.tsx` +39, `lektionerForModul.ts` +58 og dens
> test +86) og de to docs-filer fra §16 (index-fælden). tsc 0; tests 2961
> → 2968 (192 → 193 filer; +7 = den nye testfil). Koblingen fandtes envejs
> (`content_items.handout_module`, lektion → handout i ElementView); nu er
> den vendt om som en DELT, ren motor — `lektionerForModul` (kun
> publicerede, position så created_at), `lektionsSti` (ruten
> `/akademiet/:area/:slug` ét sted) og `hoererTilTekst` (bøjer efter
> antal) — fordi «Måske relevant for dig» skal bruge samme mapping. Fladen
> genbruger cache-nøglen `["akademi","items"]` (ingen ny hentning); fejlet
> ≠ tom (`sektionsfejlTekst`), nul lektioner viser intet. RLS afgør: en
> legat-bruger får nul rækker (`har_aktivt_medlemskab` kræver `is_legat =
> false`) og ser intet link — ikke en fejl. Prod-grundlag 11/9 kl. 11:43:
> 14 elementer bærer et modul (overordnet 1, bogholderi 4, administration
> 3, salg 3, marketing 3); 34 classroom-lektioner har intet. **BEVIST I
> DRIFT:** Update klikket; Jonas 13/9 aften, ordret: «Det virker» (uden
> skærmbillede, som klokkens link 11/9). **Opfølgning** (§17): ruten
> bygges stadig inline syv steder ved siden af `lektionsSti` (nyt kort,
> Lille); to forud-eksisterende eslint-fund i `HbHandoutDetail.tsx` ikke
> rørt. Mangellisten 134 → 134 (kortet «Handout → lektion» FJERNET SOM
> LØST; ét nyt; «Måske relevant for dig» omskrevet: motoren findes).
>
> **CALENDLY-PÅSTANDEN ER FALSIFICERET — MÅLT 13/9 KL. 21:30 (§18).** Ét
> GET-kald med Jonas' personal access token mod
> `/webhook_subscriptions?organization=…28fc12fd…&scope=organization`
> gav HTTP 200 og ordret
> `{"collection":[],"pagination":{"count":0,…}}`. Det beviser to ting:
> Jonas' plan (standard, paid, ét medlem — recon F5) TILLADER webhooks,
> og der findes NUL abonnementer på hans organisation; Mortens ligger på
> HANS organisation og dækker kun den. Påstanden «reparationen kræver
> Calendly premium» stod tre steder som kendsgerning (DEL 3-rækken,
> mangellistens kort, `betaltSession.ts:15`) siden 3/9, begrundede
> nedprioriteringen af hele Calendly-kæden i ti dage, og er grunden til at
> Rallysupports mødedatoer blev sat i hånden 13/9 kl. 20:48 — uden at
> nogen havde sendt kaldet. De to docs-steder er rettet (gammel ordlyd
> står med «var»); kodekommentaren hører til A's bygning og skal med
> dér. **Tilbage:** to hindringer i KODE (`calendly-webhook` filtrerer
> `advisor = 'morten'` `:122`/`:157` og matcher på et id `stripe-webhook`
> ikke indlejrer `:1351-1356`); signaturen er IKKE en hindring
> (`signing_key` vælges selv — samme nøgle som Mortens kan bruges, men
> den kendes ikke i klartekst); abonnementet på Jonas' organisation er
> IKKE oprettet; A reconer (`recon-calendly-reparationen.md`, ikke læst).
> **Sikkerhed:** tokenet (`webhooks:write`, `organizations:write`) blev
> delt i chatten i klartekst og skal REVOKERES — Jonas er bedt om det.
> Ny fælde i DEL 4: «En begrundelse for ikke at bygge skal måles som alt
> andet.» **HEAD var da `d31726e6`:** #839 og #840 (kort 76) — bogført for
> sig i #841.
>
> **CALENDLY-KÆDEN ER LUKKET I DRIFT — PR #842 merget 13/9 kl. 20:04:19
> UTC (§19).** Elleve filer, +382/−136; tests 2992 → 3002;
> check:edge-auth PASS, check:verify-jwt PASS. Det der var galt, målt i
> A's recon: `stripe-webhook` gemte det single-use bookinglink RÅT uden
> rækkens id, så `calendly-webhook` havde intet at matche på — og den
> filtrerede desuden på `advisor='morten'`. Mortens vej lægger id'et på
> præcis samme slags link; der var ingen teknisk forskel, kun en
> manglende linje. Nu bærer hvert nyt link id'et, funktionen matcher på
> id alene, genåbningen af den gratis intro gates på RÆKKENS advisor (en
> host-aflyst BETALT session giver ikke virksomheden en ekstra gratis),
> dommen er en ren, testet funktion (`_shared/calendlyWebhookDom.ts`, ti
> tests — webhooken havde ingen), og der er TO signing keys, én pr.
> abonnement, så en rotation ét sted ikke dræber begge. Udrullet 20:05
> UTC — Lovable ordret: «calendly-webhook ✅ live, svarer HTTP 401 invalid
> signature; stripe-webhook ✅ live, svarer HTTP 400 Invalid signature;
> create-free-intro-booking ✅ live, svarer HTTP 401 Missing or invalid
> authorization.» Secret `CALENDLY_WEBHOOK_SIGNING_KEY_JONAS` sat og
> BEVIST læst (signeret kald uden booking-id → HTTP 200 «fremmed event»);
> abonnementet oprettet 20:16:47 UTC, `state: active`, uri
> `…/webhook_subscriptions/9bca1b66-7ce2-466f-aa5b-47770c0dbec2`.
> Rækkefølgen kode → secret → bevis → abonnement blev holdt; omvendt
> ville hver event give 401, og abonnementet være `disabled` efter 24
> timer — uden vej tilbage. Reglen står i «Beslutninger der står fast».
> **UBEVIST I DRIFT:** at en rigtig booking kommer tilbage — kræver et køb
> gennem et id-bærende link, og de findes først fra 22:05 dansk.
> Rallysupports to rækker kan aldrig rammes og forbliver håndsatte
> (20:48). Værtsidentiteten (`created_by`, `event_memberships[].user`)
> logges, håndhæves ikke — måles først i function-logs. To fejl af
> chatten samme aften (udklipsholderen; bash-syntaks i zsh) — DEL 4.
> Tokenet skal stadig revokeres. Mangellisten 134 → 133. HEAD var
> `4bf3d405` = #842; den inkluderede Jonas-session er bogført nedenfor.
>
> **DEN INKLUDEREDE SESSION MED JONAS ER I DRIFT — PR #844 merget 13/9
> kl. 20:42:15 UTC (§20).** «feat: den inkluderede session med Jonas kan
> bookes (kort: de tre sessionstyper)», mergeCommit `7ba2a3b1`; sytten
> filer, +1157/−287; tests 3002 → 3049; check:edge-auth PASS. RETTEN: ny
> kolonne `companies.jonas_session_used_at` (migration `20260913220000`,
> kørt i Lovable 22:42 — begge kolonner timestamptz, begge nullable) —
> søster til Mortens `intro_session_used_at`, ikke en tabel: en tabel
> ville flytte asymmetrien, ikke fjerne den. FLADEN: én dom for begge
> rettigheder — Morten-kortet forsvinder når retten er brugt, Jonas-kortet
> findes altid og skifter fra inkluderet til købt (Jonas 13/9, ordret i
> §20); «link-ready» hører til det INKLUDEREDE kort, for den vej sender
> ingen mail. Linket bærer rækkens id fra start — første spor bygget med
> Calendly-kæden lukket; abonnementet fra 22:16 dækker hele
> organisationen. Secret `JONAS_CALENDLY_EVENT_SLUG` = «intro-snak»
> (Calendly-eventet «Onboarding», 30 min). Fire functions udrullet 20:45
> UTC (Lovable: alle fire live, tre 401, stripe-webhook 400). **BEVIST PÅ
> SKÆRM kl. 22:48:25:** to symmetriske kort, «30 minutter · Online ·
> Fleksibelt», «Inkluderet i dit medlemskab · én session per
> virksomhed». Chattens gæt om «en time» var forkert — A havde 30
> minutter rigtigt uden at blive spurgt. **Rammen for teksterne (Jonas
> 13/9):** medlemmet bestemmer selv hvad sessionen bruges til, retten
> udløber ikke, 30 minutter — «onboarding» og «strategi-session» er for
> snævre til kortene. **ÅBENT:** teksterne rettes i vindue A nu
> (rådgiverlinjen er en etiket, brødteksterne er næsten ens, «én session
> per virksomhed» står som grå fodnote) — ikke læst. **ÅBENT:** mange
> gamle virksomheder skal ikke have tilbuddet (Jonas 13/9) — én ad gangen
> i `EditCompanyDialog`, eller én SQL-sætning; ikke gjort, hvilke er ikke
> afgjort. **UBEVIST:** en rigtig booking der kommer tilbage (som §19).
>
> **HVAD DER SKER EFTER EN SESSION: INTET (§21).** A's recon
> (`recon-efter-sessionen.md`) udløste STOP-betingelse 1:
> `advisor_session_notes` er IKKE en note efter et møde — migrationens
> egen kommentar siger «caching AI-generated session prep notes»
> (`generated_by`, `note_text`, `generated_at`), den levede under ét døgn
> i koden (26/3: oprettet, koblet, fjernet samme dag), og har i dag
> præcis to forekomster, begge slettere. Ingen tabel peger på
> `session_bookings`; rækken har ingen fritekst; «afholdt» er en dom,
> ikke en tilstand; medlemmet ser intet; designet har aldrig taget
> stilling, og `raadgiver_opgaver`-migrationen udelukker sessioner
> eksplicit («Sessioner hører ikke til her»). En note efter en session
> har aldrig eksisteret i huset. Rallysupport har betalt 1000 kr. for to
> sessioner, og platformen ved kun at de fandt sted. IKKE afgjort om der
> skal bygges noget — nyt kort «En afholdt session efterlader intet
> spor»; `advisor_session_notes` sat på slettelisten. Mangellisten 133 →
> 135. **HEAD er `e99019c5` = #847** (siden #844: #845 teksterne på Book
> session, merget 21:02:21 UTC; #846 bogføringen af §20–§21, 21:07:34 UTC;
> #847 kort 82 — platformconfigs tre døde dele slettet, 21:24:30 UTC.
> Kort 82 er IKKE bogført i denne fil endnu; kortet står i mangellisten).
>
> **WEBINARET 22/9 — TIDSRAMMEN DER ÆNDRER PRIORITERINGEN (§22).** Jonas
> 13/9, ordret: «Den 22. september, altså om ni dage, afholder vi et
> webinar, og jeg regner med, at der kommer ca. 350 tilmeldte. Vi ved fra
> tidligere data, at ca. 40% møder op, og at de 40%, der møder op, regner
> vi med næsten 10% ansøger. Så vi kan måske forvente et sted mellem 10 og
> 15 ansøgere, hvis alt går godt.» Og: «hvis alt går vel, så har vi inden
> for de næste fjorten dage minimum fem nye ansøgere eller medlemmer på
> vores platform, og dem skal vi tage godt imod. Vi skal selvfølgelig have
> en onboarding, der spiller.» Konsekvens: kortene sorteres efter hvad en
> NY ansøger møder de første fjorten dage — ikke efter hvad der står
> øverst. A reconer det (`~/Downloads/recon-de-nye-medlemmer.md` — ikke
> skrevet endnu ved denne bogføring, ikke læst). Jonas RETTEDE chattens
> vurdering af SoMe-deling: nyheden er OPTAGELSEN («det er faktisk en stor
> ting for mange at få lov til at blive medlem»), og den er stærkest i
> samme uge — ikke efter oplevet værdi i uge 2–4, som chatten havde
> antaget og placeret lavt.
>
> **NYT STORT SPOR — ANSØGNINGSPROCESSEN IND PÅ PLATFORMEN (§23, DEL 3
> øverst).** Jonas 13/9 sen aften: «Jeg kunne godt tænke mig, at noget af
> det næste, man får kigget ind i også, det er, at hele
> ansøgningsprocessen, den bliver bygget op i vores egen platform i stedet
> for i Monday.» Afklaringssamtale / afvis / følg op om X måneder;
> genåbning når en plads bliver ledig; aftalegrundlag → «godkendt» →
> betalingslink → medlemskab; påmindelser på bookinglinket dag 2, 5 og 10;
> tracking af leads fra Meta. Det meste EFTER godkendelsen findes
> (chattens læsning, ikke en måling): Calendly-kæden (§19),
> `import-application`, `company_betalingslink` med 30-dages frist,
> `indgangs-paamindelser-cron`, `intro-reminder-cron` som eksempel på en
> påmindelseskæde der virker. Det der mangler er selve ansøgningen og alt
> før godkendelsen. **BESLUTTET 13/9: bygges IKKE før webinaret — det
> holder til efter.** Kræver først en recon af hvad Monday faktisk gør i
> dag.
>
> **KORT 29 («Fra budget») ER RECONNET — IKKE KLAR TIL AT BYGGES (§24).**
> `~/Downloads/recon-kort29.md`: præmissen holder (intet bygget, kort 40
> indfriet, budgettet er månedligt, `budgetNoegleFor` findes og er
> testet), men to spørgsmål mangler svar: ENHEDEN (prod-målingen 11/9
> talte nøglen `loenninger`; koden kobler pr. GRUPPE — `saas_b2b` har
> ingen `loenninger`, importerede budgetter bærer egne nøgler; samme fælde
> som kort 76) og FORMLEN (ingen afvigelsesfunktion på KPI-niveau, tre
> forskellige domme i huset). Bygges ikke før de to er afgjort. Tre
> bifund som nyt kort («Budgettets tre skjulte fejl»). Mangellisten 135 →
> 136.
>
> **12/9:** i repoet skete der INTET — #819 blev merget 11/9 kl. 10:55:26
> UTC, og næste commit er ikke kommet. Om der skete noget i prod, Stripe
> eller Lovable den 12/9: ikke målt, ikke bogført.
>
> Detaljen står i DEL 2 «13. september» (§1–§24).

> ## 11/9 EFTERMIDDAG — START HER (dagen lukket; skrevet 11/9 eftermiddag efter #817, digestens slukning kl. 12:07 og målingerne 11:33, 11:43, 12:07 og 12:18)
>
> **I drift:** #815 og #816 (formiddagen, Update 11:12). **Kort 60 er I
> DRIFT — PR #818 (commit `550b90ad`), 12 filer, tsc nul fejl, tests
> 2868 → 2891 grønne** (`~/Downloads/verifikation-kort60.txt` RETTELSE 3).
> De fem beviser (DEL 2 §3): (1) merget — `gh pr view 818`:
> «mergedAt 2026-09-11T10:25:37Z» (12:25:37 dansk tid), mergeCommit
> `c0f456af`; (2) migrationen kørt — CSV 12:26 viser begge CHECK'er med
> `'praesentation'`; (3) Update før 12:28 (ikke målt præcist) og
> skærmbilledet `screencapture-app-theboardroom-dk-community-2026-09-11-12_28_09.pdf`
> (composeren «Hej, jeg er Jonas Herlev» med de tre overskrifter); (4)
> `onboarding-rytme` udrullet EKSPLICIT i Lovables build-chat kl. 10:28
> UTC (12:28 CEST); (5) tørkørsel 9091, status 200, samme tal som 9035 fra
> 09:26 (27 virksomheder, 2 kandidater, 0 sendt).
>
> **Slukket:** månedsdigesten — `cron.unschedule` kl. 12:07. FØR ordret
> (CSV 12:07): jobid 550, jobname `send-monthly-digest`, schedule
> «0 8 22 * *», command « SELECT public.kald_edge('send-monthly-digest'); »,
> active true, fjernet true. EFTER (CSV 12:18, a): «jobs med navnet
> send-monthly-digest | 0». Tilbagerulning: planlæg med samme navn, skema
> og kommando. Koden står stadig (indstillingen «Månedsoverblik»,
> admin-knapperne «Månedlig digest», `send-monthly-digest`) og fjernes i
> oprydnings-PR'en.
>
> **Jonas' fire beslutninger 11/9** (ordret i DEL 2 §1): run-weekly-agent
> «A» — slettes; digesten «Sluk den»; podcasten ud af platformen med ét
> elegant link til Spotify («det er jo ikke indhold der er forbeholdt
> medlemmer»); KPI-mål trin 2 «Jeg er enig med dig!» — intet standardmål.
>
> **Åbne beviser:** 13/9 (søndag) doggybeds træk (#563, #572, #815 og
> stripe-webhook version — DEL 3); 14/9 første hele uge med
> `weekly_focus.seen_at` på forsiden; **kort 60, tre beviser der stadig
> mangler** (DEL 3): tjeklistens punkt på et medlems skærm; den første
> rigtige præsentation (`community_traade` med `kilde_type =
> 'praesentation'` og `status = 'aktiv'`); velkomstmailens nye tekst
> (første nye medlem dag 0–1).
>
> **Køen til i morgen — A:** kort 83 → 40 (hele fallbacken, ikke kun
> trin 1) → oprydningen (run-weekly-agent slettes, digestens kode ud,
> podcasten ud af platformen) → 56 → 76 → 82 → 57 → 29. **A4:** recon af
> hvordan linjen for en ny refleksion lukkes (forslag 21).
> **Beslutninger at bekræfte** (forslag fra chatten, stående uden
> indsigelse): **20** «strandet upload» bygges IKKE som slags nu (1
> virksomhed, CSV 12:18 d); **21** én linje pr. ny refleksion, samme alvor
> over tærsklen, ingen trigger og ingen `company_actions` i første
> version; **22** et medlem der har gjort alle seks punkter og ikke lukket
> boksen, får listen igen med 6 af 7.
>
> Detaljen står i DEL 2 «11. september, eftermiddag» (§1–§8).

> ## 11/9 FORMIDDAG — START HER (skrevet 11/9 formiddag, efter #816 og målingerne 11:18, 11:27 og 11:28)
>
> **Prod målt fire gange FØR noget blev kørt — 09:20, 11:18, 11:27, 11:28.**
> Kl. 09:20: alle seks migrationer stod allerede i prod, onboarding-rytmen
> var planlagt i hånden («0 8 * * *», `dry_run false`) — §0A havde intet
> at køre; kilderne var uenige, og denne fil havde ret. Kl. 11:18:
> `20260908190000_session_tid` er også kørt; samtalelistens 500-vindue er
> ikke ramt (604 beskeder, 25 samtaler); fantomen er tre welcome-rækker;
> 163 af 251 `new_message`-rækker i klokken har HTML-tags; 3 invitationer
> afventer (ældste 1/9); ingen bruger har to virksomheder; begge FK'er på
> `financial_report_facts` er NO ACTION. **Kl. 11:27: checkout-døren er
> LUKKET** — prods `hent_betalingsdata_til_checkout` er tegn for tegn
> filens (md5 `76178b0711e70b02ea86a6fe8a2ed8b9`); forbeholdet fra 09:20
> var chattens fejl: den blev målt med tilbuddets mønster, og de to
> skriver hinandens modsætning. `20260911050000` er helt i prod. Kl. 11:28:
> kort 60's udgangspunkt — de to CHECK'er på `community_traade`, RPC'en
> sender `p_kilde_type` uændret, 10 tråde uden kilde.
>
> **Bygget og i drift:** #815 (rådgivernes klokke ved fejlet træk, klokkens
> virksomhedslink i ental) og #816 (feedback i Hb-skallen) er merget;
> Update klikket kl. 11:12. **Beviser ført:** klokkens link (Jonas ca.
> 11:15, «Ny resultatopgørelse fra remm.» → virksomhedssiden); feedbackens
> skrivevej i prod (række, fil med mappetjek, klokke — Jonas' test 09:15
> UTC (11:15 dansk), «TEST 11/9 — ignorér»). **Udestående bevis:**
> stripe-webhook version — doggybeds event 13/9 (søndag), svaret bærer
> `traek.id` eller `klokke`. **Stripe:** opsigelse i kundeportalen slået
> FRA kl. 10:01; login-linket er ikke aktiveret på nogen konto.
> **Onboarding-rytmens afsendelsesgren er ubevist** (tørkørsel
> `ville_sende 0`, kl. 10 sendte intet). **Feedet (beslutning 17):** alle
> 18 episoder har guid — forudsætningen fra beslutning 8 er opfyldt — men
> podcasten har ikke udgivet siden 17/9 2025; kort 69 og 62 venter til Jonas
> og Morten har afgjort om podcasten fortsætter. B2 er dermed 56 og 57.
>
> **Det der venter, i rækkefølge:**
> 1. **Kort 60 er næste bygning** — præsentationen dag 1–3 med de fire
>    beslutninger på kortet; prod-udgangspunktet (CHECK'erne ordret, RPC'en,
>    de fire funktioner der nævner `kilde_type`) står på kortet og i DEL 2
>    §9.
> 2. **B2 (56, 57), B3 (40, 29, 82) og A2 (76, 83) har recon og
>    beslutninger** på kortene — kan bygges som de står. Kort 3 er løst, 46
>    er ud af A2, 69 og 62 venter på podcast-beslutningen.
> 3. **§0B er IKKE besluttet** — `run-weekly-agent` (A/B/C) og digesten;
>    ugefokus-tallene fra 09:32 står i DEL 2 §3.
> 4. **Kort 24** (retries opbrugt → `/send`) — fem forudsætninger på
>    kortet; haster ikke før 13/9.
> 5. **13/9 (søndag):** doggybeds træk og beviset for #563, #572 og #815;
>    Stripe-migrationen — 27 aktive har NUL `stripe_customer_id`.
>
> Detaljen står i DEL 2 «11. september, formiddag» (§1–§9).

> ## ✅ LØST — VAULT VAR TOM I OTTE TIMER 9/9 (historik, ikke en opgave)
>
> **Hvad der skete:** `vault.secrets` havde nul rækker — hemmeligheden
> `email_queue_service_role_key` var slettet, formentlig med Lovables
> mailopdatering 9/9 kl. 06:52–06:58 (`process-email-queue` slettet, og
> nøglen var dens). Alle ni cron-jobs sendte `Bearer ` uden nøgle og fik
> **401**; målt kl. 23:39: 77 kald med 401, nul med 200, så langt
> `net._http_response` rakte (kl. 15:20). `cron.job_run_details` sagde
> «succeeded» for dem alle — det betyder kun at `net.http_post` blev
> afsendt (DEL 4).
>
> **Løst 9/9 kl. 23:50:** Lovable genskabte `email_queue_service_role_key`,
> og `fornyelsesvarsel-cron` svarede **200**. Mails går igen.
>
> **Det der gik tabt** (`~/Downloads/recon-hvad-gik-tabt.md`): kun dagsdomme
> kan tabes — rapportpåmindelsen d. 7/9 hvis nøglen allerede var væk, og
> event-påmindelser med T−7/T−1 i udfaldet. Køerne hentede sig selv: da
> `process-notification-emails` blev tændt igen 10/9 kl. 08:57, gik **26
> community-mails ud om et opslag fra dagen før** — det gav aldersgrænsen
> (#770, DEL 2 «10. september»).
>
> **Værnet** er vagten (#768, #770) — som ikke virkede første gang, se
> DEL 2 «10. september» og DEL 4.

> **MÅLT I PROD 7. SEPTEMBER 2026 KL. 20:42 — DAGENS SIDSTE OG VIGTIGSTE
> MÅLING. 29 AF 37 VIRKSOMHEDER ER FALDET UD. TO BRUGER PLATFORMEN SOM
> TÆNKT.** **RETTET 8/9 KL. 08:49: 19 AF 27.** Tallet var forkert —
> filtret manglede `status`, og to gæster var mærket som kunder (se
> «Rettelsen» under tabellen). Konklusionen var ikke forkert: de otte
> aktive er de samme, og kun to af dem svarer på forslag. Dette blok kan
> læses uden resten af filen. Det er en måling,
> ikke en opgave og ikke en anbefaling — hvad der skal gøres, er Jonas'
> og Mortens beslutning.
>
> **Kriteriet for «faldet ud»:** mere end tre måneder siden seneste
> MÅLTE rapport (`financial_report_facts.data_basis = 'measured'`) OG nul
> besvarede opgaveforslag de seneste tre måneder. Mængden, ordret
> (rettet 8/9): `er_kunde = true AND is_legat = false AND status = 'active'`.
> Målingen 7/9 brugte kun de to første led.
>
> | | 7/9 kl. 20:42 (forkert filter) | **8/9 kl. 08:49 (rettet)** |
> |---|---|---|
> | I alt | 37 virksomheder | **27** |
> | Faldet ud | 29 | **19** |
> | Aktive | 8 | **8** |
> | Midt imellem | 0 | **0** (27 = 19 + 8) |
> | Aldrig uploadet en målt rapport | 17 | **10** |
>
> **Rettelsen, 8/9.** Målingen 7/9 var forkert på to punkter, opdaget om
> morgenen 8/9 — tolv timer efter tallet blev skrevet øverst i denne fil:
>
> 1. **Filtret manglede `status`.** De OTTE virksomheder med
>    `status = 'tidligere'` (sat 2/9, migration 20260902113000) blev talt
>    med som medlemmer: Alina Beauty & Skincare (slut 29/5), Coskun,
>    Regnskabsvikar, Sebastian & Amalie og Stadio (alle 6/5), Startkørekort
>    (21/5), Friends & Fries (22/8), LineAlmegaard (1/9).
> 2. **To GÆSTER var mærket som kunder.** Alexander Lunds virksomhed
>    (oprettet 31/8) og Martin Larsens virksomhed (1/9). Jonas 8/9: «de er
>    nogle gæster der bare lige har fået lov til at komme ind og kigge. De
>    er ikke en del af netværket.» Ingen slutdato, ingen pris, ingen
>    betaling, ingen rapporter. RETTET i prod 8/9 kl. 08:48: `er_kunde`
>    sat til `false` på begge (FØR-værdi: `true`). Nu er tre skjulte for
>    rådgiveren: Topix.dk ApS, Alexander Lund, Martin Larsen.
>
> Med det rette filter, målt i prod 8/9 kl. 08:49: i alt 27, faldet ud
> 19, aktive 8, aldrig uploadet 10. Kriteriet er uændret. Læren står i
> DEL 4 («Et filter er en del af målingen»).
>
> **Indeni tallet, og det er værre** (tal fra 7/9 — de fem af navnene
> nedenfor der er gæster eller tidligere, er ikke længere i mængden;
> aldrig uploadet er 10, ikke 17, målt 8/9):
>
> - **SYTTEN har ALDRIG uploadet en målt rapport** (rettet 8/9: TI —
>   Martin Larsen og Alexander Lund er gæster, LineAlmegaard, Friends &
>   Fries og Coskun er tidligere). Ikke én. Blandt dem
>   virksomheder der har logget ind for få dage siden: TOFT ADMINISTRATION
>   4/9, Martin Larsen 1/9, remm. 1/9, Limo Group og LineAlmegaard 31/8,
>   Alexander Lund 31/8, Fjeldgaardshop 25/8, Friends & Fries 24/8,
>   Bastant Design 20/8, Coskun 17/8. De KOMMER — de gør bare ikke det
>   platformen er bygget til.
> - **Tre har aldrig logget ind:** Din økonomiafdeling, Two Socks, WESDEX.
> - **Fem har fået forslag men svarer ikke:** Rallysupport 17 forslag / 0
>   svar, ANLA GLAS 15/0, Capture IT 9/0, remm. 9/0, BRILLEVÆRK 4/0.
> - **CARMA STUDIO:** seneste målte rapport juni 2025 — femten måneder.
>
> **Og af de otte «aktive» svarer kun to på forslag:**
>
> | Virksomhed | foreslået | besvaret |
> |---|---|---|
> | Floren Engros | 18 | **6** |
> | Rezycl.com | 12 | **6** |
> | Booking Innovation | 15 | 0 |
> | BR Roset | 16 | 0 |
> | Doggybed | 12 | 0 |
> | PHILBERT | 7 | 0 |
> | Warburg | 14 | 0 |
> | Livja | 0 | 0 |
>
> Målt igen 8/9 kl. 08:49 med det rette filter: de otte aktive er DE SAMME,
> og stadig kun to svarer — Floren Engros 6 af 12, Rezycl.com 6 af 9
> (tre-måneders-vinduet er flyttet én dag, derfor andre tællere).
>
> **Det rigtige billede: to virksomheder ud af syvogtredive bruger
> platformen som tænkt** — rettet 8/9: ud af **syvogtyve**. Tallet var
> forkert, konklusionen var ikke.
>
> **I forhold til dagen.** Alt hvad der er rettet 7/9 — fornyelseskæden
> der sender, de tavse fejl der nu kaster, fortegnet på omkostningerne,
> årsrapport-udtrækkets huller, de manglende måneder — gør platformen mere
> KORREKT for de otte. Det ændrer ikke at de niogtyve (rettet 8/9:
> nitten) ikke er der.
>
> **I forhold til de tre målinger tidligere i dag.** De 73 ventende
> uploads (rapporter der aldrig blev godkendt — `recon-ventende-uploads`),
> de under ti procent der svarer på opgaveforslag (DEL 2
> «Opgave-modellen»), og remm./YKRG's årsrapport-huller, der kun ses fordi
> ingen målt måned overskriver dem (DEL 2 «Årsrapport-udtrækket»). Alle
> tre var symptomer på DETTE. Hver for sig så det ud som et
> godkendelsesproblem, et svarproblem og et udtræksproblem. Det var først
> den fjerde måling der viste hvor stor gruppen er.
>
> **Sådan gentages målingen — om en måned, med samme kriterium, så tallene
> kan sammenlignes.** Formen (kolonnenavne efterprøves i `types.ts` før
> kørsel — `company_actions`' svartidsstempel er ikke slået op her).
> Filtret er rettet 8/9: `status = 'active'` er det tredje led — uden det
> tælles de otte «tidligere» med. Sammenlign mod 8/9-tallene, ikke 7/9:
>
> ```sql
> WITH kunder AS (
>   SELECT id, name FROM public.companies
>   -- Filtret ORDRET (rettet 8/9): kunde, ikke legat, aktiv.
>   -- 7/9 manglede status, og de otte 'tidligere' blev talt med.
>   WHERE er_kunde = true AND is_legat = false AND status = 'active'
> ),
> seneste_maalte AS (
>   SELECT company_id, max(period_key) AS seneste_periode, max(committed_at) AS seneste_commit
>   FROM public.financial_report_facts
>   WHERE data_basis = 'measured'
>   GROUP BY company_id
> ),
> svar AS (
>   SELECT company_id,
>          count(*) FILTER (WHERE created_at >= now() - interval '3 months')                              AS foreslaaet_3m,
>          count(*) FILTER (WHERE status IN ('active','done','not_done','dropped','dismissed')
>                             AND created_at >= now() - interval '3 months')                              AS besvaret_3m
>   FROM public.company_actions
>   WHERE status <> 'expired'
>   GROUP BY company_id
> )
> SELECT k.name,
>        m.seneste_periode,
>        m.seneste_commit,
>        coalesce(s.foreslaaet_3m, 0) AS foreslaaet_3m,
>        coalesce(s.besvaret_3m, 0)   AS besvaret_3m,
>        CASE
>          WHEN (m.seneste_commit IS NULL OR m.seneste_commit < now() - interval '3 months')
>           AND coalesce(s.besvaret_3m, 0) = 0 THEN 'faldet ud'
>          WHEN m.seneste_commit >= now() - interval '3 months'
>           AND coalesce(s.besvaret_3m, 0) > 0 THEN 'aktiv'
>          ELSE 'midt imellem'
>        END AS tilstand
> FROM kunder k
> LEFT JOIN seneste_maalte m ON m.company_id = k.id
> LEFT JOIN svar s ON s.company_id = k.id
> ORDER BY tilstand, m.seneste_commit NULLS FIRST, k.name;
> ```
>
> Og tælleren, til sammenligning måned for måned:
>
> ```sql
> SELECT tilstand, count(*) FROM ( …samme SELECT som ovenfor… ) t GROUP BY tilstand;
> ```
>
> Referencen 7/9 kl. 20:42 (FORKERT filter, uden `status`): faldet ud 29 ·
> aktive 8 · midt imellem 0 · aldrig uploadet 17 · aldrig logget ind 3.
> **Referencen 8/9 kl. 08:49 (rettet filter, `er_kunde = true AND is_legat
> = false AND status = 'active'`): i alt 27 · faldet ud 19 · aktive 8 ·
> midt imellem 0 · aldrig uploadet 10.** Det er 8/9-tallene der
> sammenlignes mod. Mangellisten bærer kortet «19 af 27 er faldet ud»
> (før: «29 af 37»).

> ## PLANEN FOR 8. SEPTEMBER — godkendt og prioriteret af Jonas 7/9 sen aften
>
> **Status ved dagens slut 8/9:** formiddagen blev taget af Lovables
> mailopdatering, Alina-sagen og slettefunktionen; eftermiddagen tog
> punkt 4 (digesten, #741/#742) og punkt 5 (kvitteringsmailen, #739) —
> plus fire ting der ikke stod i planen: forslaget kan ses (#740),
> Mortens to fejl (#743, #744) og to-do-listen (#745). Detaljen i DEL 2
> «Eftermiddagen 8/9». Punkt 6 (toasten) og 7 (den tomme platform) står
> stadig og er i DEL 3.
>
> Kan læses alene. Lavet efter at HELE mangellisten (167 kort) er læst
> efter målingen ovenfor, og efter en recon af hvad et medlem uden tal
> ser (`~/Downloads/recon-den-tomme-platform.md`, uden for repoet —
> fundene er bogført i mangellisten, se punkt 7).
>
> **PRINCIPPET, ét:** otte virksomheder er aktive, og to bruger
> platformen som tænkt. Det der rammer DEM, og det de sytten uden tal
> møder, kommer først. Alt om skala, netværkseffekter og en større
> portefølje måler ingenting ved otte aktive — det tages ikke i morgen.
>
> **FORMIDDAG — det der rammer alle otte, hver dag**
>
> 1. **Mobilens grønne bundstykke.** Alle otte, hver side, også login.
>    Rettelsen er kendt: husets dvh-utilities (`min-h-screen-safe`) på
>    de tre skaller (HbMemberShells side-variant, `HB_RAMME`,
>    HbAdminShell) plus papirfarvet `html`. Jonas: «kan vi tage hurtigt
>    nu» — PÅBEGYNDT 7/9 aften. Beviset er skærmen: intet grønt under
>    login og under en Hb-side, i Safari og Chrome (mangellisten «Mobil:
>    tomt grønt bundstykke»).
> 2. **Mailene fra topix.dk.** BESLUTTET af Jonas: de skal sendes fra
>    `@theboardroom.dk`, ikke `boardroom.topix.dk`. Kræver
>    domæneopsætning i mailtjenesten (SPF/DKIM/verificeret afsender)
>    PLUS afsenderkonstanten i koden (`VERIFIED_FROM_EMAIL` =
>    `noreply@boardroom.topix.dk` i send-invitation-email, stripe-
>    webhook, send-welcome-message m.fl. — grep 4/9; intro-påmindelsen
>    underskrives «Morten fra The Boardroom»). **MÅL hvad der skal til
>    FØR noget ændres** — en afsender der ikke er verificeret, sender
>    ingenting.
> 3. **PHILBERTs seks ventende rapporter.** Én aktiv virksomhed, seks
>    rapporter parset (PASS) og aldrig committet siden januar. Godkend
>    dem via virksomhedssidens blok 6 → ReportReviewDialog (RPC'en
>    tillader rådgiveren), eller bed dem — men de skal blive til tal.
>    Jonas: «super». (Reconen 7/9: `commit_report_facts` kaldes KUN fra
>    tre klik i src/; ingen automatik.)
>
> **EFTERMIDDAG — det der rammer PHILBERT 22. og 29. september**
>
> 4. **VIGTIGT: månedsdigesten viser overskredne milepæle som
>    kommende.** `send-monthly-digest` kører den 22. hver måned — det
>    er en frist: 22/9 er også dagen for PHILBERTs varsel 2.
> 5. **VIGTIGT: ingen mail til den der lige har fornyet.** PHILBERT
>    betaler efter 22/9 (slutdato 29/9), og i det øjeblik pengene
>    falder, siger platformen ingenting — kun Stripes kvittering.
>    Fornyelsesgrenen i `stripe-webhook` har ingen mail og ingen
>    rådgivernotifikation (grep 4/9). Samme mailfamilie som varslerne
>    (`indgangsMailHtml`/`sendIndgangsMail`).
> 6. **Toasten der kan ramme forkert den anden vej.** Samme dag, samme
>    medlem: `Index.tsx` vælger kvitterings-toasten på tier, og lander
>    webhooken FØR redirectet, får den der VAR udløbet «fortsætter uden
>    afbrydelse». Jonas: «super».
>
> 7. **VIGTIGT — DEN TOMME PLATFORM.** Reconen målte hvad en virksomhed
>    uden tal ser. Der ER en vej videre næsten overalt: tjeklisten er
>    fokuskortets eneste kilde til den er færdig, TalStrip linker til
>    rapportering, og hver tom flade (nøgletal, budget, milestones,
>    handouts) har et klik. Men FIRE ting er ødelagte — hver sit kort i
>    mangellisten (Indgangen og Dine tal), «Alt er ajour» er det
>    vigtigste:
>    - **a) «ALT ER AJOUR.» KAN STÅ TIL EN DER ALDRIG HAR UPLOADET.**
>      `BoardroomView.tsx:1384-1395`, med teksten «Rapport, refleksion og
>      milestones er på plads — brug momentum i dit forløb.» Kommentaren
>      i koden siger det udtrykkeligt: «Alle tal nul (nyt medlem) → den
>      hidtidige sætning uændret» (:1810-1814). Det er ikke en
>      forglemmelse, det er en beslutning der er forkert. `journeyLine`
>      bygges :1815 og kan allerede sige noget andet — rettelsen er
>      formentlig en gren dér. Ordlyden er IKKE besluttet.
>    - **b) Tjeklisten kan lukkes pr. enhed og er så VÆK.** Lukket-
>      tilstanden er `localStorage["tbr.tjekliste-lukket"]`
>      (useTjeklisteLukket.ts) — pr. enhed, ikke i databasen. Lukket på
>      telefonen = intet på skærmen der siger hvad de skal; kun
>      menupunktet «Kom godt i gang» henter den frem.
>    - **c) «Dine tal» krydses af ved UPLOAD, ikke ved GODKENDELSE.**
>      `onboardingTjekliste.ts:163-166`: «Uploadet er nok — godkendelsen
>      … er rådgiverens skridt, ikke medlemmets.» Det forklarer de 73
>      ventende rapporter: medlemmet uploader, tjeklisten siger færdig,
>      rapporten godkendes aldrig — og bliver aldrig til tal.
>    - **d) Rapporteringen forklarer HVAD, ikke HVOR.** Upload-zonen
>      (HbReportUploadZone.tsx:402-404): «Upload din månedsrapport /
>      Saldobalance eller resultatopgørelse — PDF, Excel eller CSV. Klik
>      eller træk hertil.» Det er alt. Ikke fra hvilket program, ikke
>      hvordan man eksporterer, ikke hvilken måned. Ordene e-conomic,
>      Dinero og Billy findes kun i FEJLBESKEDER efter en mislykket
>      upload.
>    Dertil: chattens velkomstbesked (`send-welcome-message`, «Hej
>    {fornavn}! Velkommen til The Boardroom 🎉 …») findes som kode, men
>    intet i src/ eller supabase/ kalder den. Den tomme samtale siger
>    «Dine rådgivere læser dine tal og svarer hurtigt» til en uden tal.
>
> **DET DER LADES LIGGE — og hvorfor, så ingen tager det op i god tro:**
>
> - **De 115 tavse queryFn'er.** Rammer kun ved fejl; punkt 1–5 på
>   rangeringen er lukket (#703, #706, #708, #712). Resten er
>   admin-lister og berigelser.
> - **Alt om skala og ydeevne** (`hentAdvisorDashboard` henter hele
>   porteføljen, bundle, indeks, sekvensmotorens tre kopier). Måler
>   ingenting ved 37 virksomheder.
> - **Netværkseffekter der forudsætter aktivitet** (peer-matching,
>   anbefalinger, gamification, top posts). Ingen aktivitet at bygge på.
> - **De ni ufuldstændige årsrapporter** (to til fire af fem felter
>   mangler). De rammer to FALDNE virksomheder; rimelighedstesten (SQL
>   i `recon-aarsrapport-labels.md`) står klar til den dag.
> - **Opgave-model-epic'et** (EPIC, gentagelses-semantik, under ti
>   procent svarer, aktive opgaver udløber aldrig). Handler om de to
>   der svarer.
> - **Indgangens dag 31-fejl** (fakturateksten, beløbet i mailen,
>   rykkere). Ingen virksomhed er i indgangen: NUL rækker i
>   `company_betalingslink`.
>
> **TO OPRYDNINGER, når der er luft:** badge-kortet «Badget kender kun
> varsel 1» er LØST i #719, men står stadig i mangellisten (skal slettes
> efter listens egen regel); og der er 37 grene på origin ud over main
> (`gh pr list --state merged` afgør hvilke — `git diff` lyver, DEL 1).

**Sidst opdateret: 10. september 2026 — vault-udfaldet er historik, vagten
byggede og fejlede to gange, `/members` er tømt, `/settings` er
konverteret (DEL 2 «10. september», #763–#773).** Før det: 8. september,
aften — SYV PR'ER PÅ EN EFTERMIDDAG:
milepælenes dom (#741, #742), forslaget kan ses (#740), Mortens to fejl
(#743, #744), to-do-listen (#745), fornyelseskvitteringen (#739). DEL 2
«Eftermiddagen 8/9». Middag: DE OTTE ER SLETTET.**
Kørt i prod kl. 12:14–12:26, i fire hold, med FØR-måling og sweep hver
gang, efter `docs/koereplan-de-syv-tidligere.md` (nu historik): 12:16
Coskun Holding (30 loginposter, én konto med sidste login 17/8 — tre
måneder EFTER de stoppede 6/5); 12:18 Regnskabsvikar og Sebastian &
Amalie; 12:20 Stadio, Startkørekort og Friends & Fries; 12:25
LineAlmegaard — den største: 328 loginposter, 93 beskeder, 60 mails, 51
rådgivernotifikationer, 12 fact-rækker, og ATTEN filer i TRE buckets
(logo, avatar, seksten chat-vedhæftninger — præsentationer og
produktfotos, den seneste fra 31/8, dagen før de stoppede). Resultat:
**8 af 8 tidligere har `data_slettet_at`** (Alina fra formiddagen plus de
syv); sidste sweep over alle otte: ingen rester i sytten tabeller, ingen
filer i storage; otte arkivspor tilbage med navn, CVR og kontraktperiode.
TRE LÆRER, DEL 4: sweepet fandt noget HVER gang (en `message_reaction`
hos Coskun — en tabel Alina intet havde i; ti hos LineAlmegaard) — en
sletning er færdig når sweepet er tomt, ikke når planen er kørt; filerne
lå TRE steder, ikke ét — den første måling talte kun `financial-documents`
og fandt én fil, der var atten; og folk kommer tilbage efter de er holdt
op — indtil i dag kunne de logge ind på deres gamle data. Sagen står i
DEL 2 «De otte tidligere». Mangellisten: sletteknappens kort er slettet
som løst (#736); «Ingen opbevaringspolitik» står tilbage som beslutning.**

**8. september 2026, aften — SLETTEFUNKTIONEN ER I
DRIFT.** Kørt i prod kl. 11:57–12:01 efter `docs/koereplan-slettefunktionen.md`
(nu historik): migrationen `20260908120000_data_slettet.sql` kørt kl. 11:57
— tre kolonner, Alina stemplet `i_haanden` med 22 bogførte tabeller som
JSON på sin egen række (rollback findes ikke; tallene gør), bevist ikke
længere kandidat. `slet-medlemsdata-cron` udrullet kl. 11:59 fra
`ff548d1e` med `_shared/sletning.ts`, svarer 401 uden JWT. TØRKØRSEL på
rigtige data kl. 12:00: undersøgt 35, fundet 0, slettet 0, fejlet 0 —
det forventede og det rigtige: Alina er stemplet ude, og ingen med
slutdato efter 10/9 er nået til dag 45; en tom rapport er beviset på at
afgrænsningen holder. Cron-jobbet `slet-medlemsdata` planlagt kl. 12:01,
`0 12 * * *` UTC (14:00 dansk), aktivt, `dry_run: false`, tolvte job,
alene på klokkeslættet, EFTER fornyelsesvarslerne kl. 11. **Kæden er
hel: en anmodning bliver til en sletning efter syv dage, uden at nogen
skal huske det.** Alina ventede 103 dage fordi feltet ingen læste; nu er
der en læser. DET DER MANGLER: kvitteringen i `MembershipExpiredGate`
siger stadig «Jonas kontakter dig inden for 2 hverdage» — den skal sige
en DATO, ellers ved medlemmet ikke at fristen er deres fortrydelsesret
(DEL 2 «Slettefunktionen», DEL 3). Mangellisten: kortet «Der findes
ingen slettefunktion» er slettet som løst; sletteknappens kort handler
nu kun om teksten.**

**8. september 2026, dagens slut (skrevet før driften blev bogført) —
LOVABLE BYGGEDE MAILPLATFORMEN OM UNDER OS, SLETTEFUNKTIONEN ER BYGGET
(sat i drift kl. 11:57–12:01, blokken ovenfor), OG DE SYV TIDLIGERE
SLETTES I MORGEN — COSKUN FØRST.** Kl. 06:52-06:58 lagde
Lovable 19 commits direkte på main, alle kaldt «Changes»: køen og
`process-email-queue` slettet, migrationen `20260319090407_email_infra.sql`
slettet, transporten flyttet til `_shared/managedEmail.ts`, tretten
afsendere flyttet til `theboardroom.dk`. Vores eget afsenderarbejde fra
samme formiddag blev overflødigt; tre literaler stod tilbage og er rettet
(#731), de fjorten skabelonrækker er rettet i prod kl. 09:31, og
mailfortegnelsen over 38 mails ligger i `docs/mailfortegnelsen.md` (#730).
Auth-guardrailen fejlede på main indtil #732: `handle-email-events` bruger
en webhook-indpakning værnet ikke kendte — gaten fandtes, værnet gjorde
ikke. MÅLINGEN ØVERST ER RETTET (#728): 19 af 27, ikke 29 af 37 — filtret
manglede `status`, og to gæster var mærket som kunder. SLETTEFUNKTIONEN
(#734): tre veje, tørkørsel som standard, bilagsværn, motor først med
paritetstest — sat i drift samme dag kl. 11:57–12:01 (blokken ovenfor).
BESLUTTET af Jonas 8/9: de syv tidligere slettes som Alina, i
hånden efter `docs/koereplan-de-syv-tidligere.md` — Coskun Holding først,
så de seks. LÆREN, DEL 4: Lovable kan bygge om under os; efter en
Lovable-opdatering køres typecheck, tests OG guardrail på main før noget
bygges ovenpå. I MORGEN: DEL 3 øverst.**

**8. september 2026, formiddag — ALINA-SAGEN: EN
SLETTEANMODNING LÅ 103 DAGE, FORDI KNAPPEN LOVEDE NOGET INGEN HØRTE.**
2. juni kl. 19:28 trykkede Alina Beauty & Skincare «Ja, slet min data» i
`MembershipExpiredGate`. Knappen skrev `companies.offboarding_requested_at`
og sagde «Jonas kontakter dig inden for 2 hverdage». Kolonnen læses ingen
steder — ingen notifikation, ingen cron, ingen flade. Anmodningen blev
fundet 8/9 kl. 08:33 under en recon om tidligere medlemmers data;
GDPR-fristen for at svare er én måned. Slettet i prod 8/9 kl. 09:57-10:08,
tabel for tabel, med FØR-tal — 13 rapporter, 13 filer, 30 beskeder, 198
loginposter med IP, én konto — og virksomhedsrækken beholdt som arkivspor
(navn, CVR, kontraktperiode, `status = 'tidligere'`,
`offboarding_requested_at`). Fire lærer, DEL 4: knappen lovede noget ingen
hørte; kaskaden tager ikke alt; `hardDeleteCompany` kan ikke bruges til en
kunde med bilag; det tog en formiddag i hånden. Sagen står i DEL 2
«Alina-sagen». Kort i mangellisten: sletteknappen (nu kun teksten) og
opbevaringspolitikken; slettefunktionens kort er løst og slettet 8/9.**

**7. september 2026, aften — EN FEJL VI SELV LAVEDE:
CARMA-SAGEN. Kl. 11:57 sendte `fornyelsesvarsel-cron` varsel 2 til CARMA
STUDIO — den første rigtige mail systemet har sendt — MED EN KNAP DER
IKKE VIRKEDE. Målt kl. 16:33: CARMAs slutdato var 7/9, ordningen træder
i kraft 10/9, og `afgoerFornyelsestilstand` siger `uden_for_ordningen`
FØR beslutningen læses; `hent-fornyelsestilbud` gav `tilbud: null`,
checkout ville svare 403, båndet ville ikke vises. FEJLEN: varselsmotoren
dømte på beslutning og dage og spurgte aldrig tilstandsmotoren. Motorens
grænse var rigtig — «der er ingen dag at sende noget i». RETTET (#716):
varselsmotoren spørger tilstandsmotoren; KAN_HANDLE er KALDERNES gate
(klar_til_tilbud, i_god_tid — det hent-fornyelsestilbud og
opret-fornyelse-checkout siger ja til), ikke et skøn; `blokeret_af`
bærer grunden. OG CAMILLA: Jonas besluttede at hun SKAL kunne bruge sit
link — slutdatoen flyttet 7/9 → 11/9 i prod kl. 18:23; hun får ingen
flere mails (stemplet fra 11:57 lukker begge grene, tørkørsel 18:26:
ville_sende 0), bevist på skærm 18:29. LÆREN, DEL 4: «en ny ting skal
spørge de eksisterende hvad de siger» — tre gange 7/9 (#696, #704, #716)
blev den nye ting reconnet grundigt, og forbindelsen til det den PÅVIRKER
aldrig undersøgt (DEL 2 «Fornyelseskæden», DEL 4). SENT: OMKOSTNINGERNES
FORTEGN — to af fire skriveveje skrev omkostninger negativt (annual_report
24 af 132 rækker, manual 16 af 67); alle fire skriver nu positivt (#721),
og de 40 rækker er rettet i prod kl. 19:58 med SELECT før og efter. Et
fund der IKKE var rettet: Floren Engros' 2025-tal så hundrede gange for
små ud — 4.335 mod 248.112. RAPPORTEN ER LÆST, kl. 20:15, og diagnosen
var for hård: udtrækket havde taget rapportens LILLE linje «Direkte
omkostninger» (52.018) til cogs og tabt «Vareforbrug» (3.155.034) — et
match på ORDET, ikke på betydningen. Bruttoresultat, resultat, omsætning
og personale var rigtige hele tiden; kun fordelingen mellem posterne var
gal. Rettet i prod kl. 20:15, tolv rækker. Det åbne er større end
Floren — MÅLT kl. 20:24 på ALLE ELLEVE årsrapporter: rimelighedstesten
ledte efter flere Floren-tilfælde og fandt noget andet og større. KUN TO
AF ELLEVE UDTRÆK ER HELE — men målt igen kl. 20:32: hullerne BLIVER
OVERSKREVET når virksomheden rapporterer månedligt, og ingen af de seks
mangler omsætning i de seneste tolv rækker. Det rammer dem der IKKE
rapporterer: remm. (0 af 12 målte, ni måneder uden rapport) og YKRG (2 af
12, og ti rækker med omsætning NUL — ikke manglende, nul, som dommene
ikke er beskyttet mod). DAGENS VIGTIGSTE SAMMENHÆNG: det er SAMME GRUPPE
som de 73 ventende uploads og de under ti procent der svarer på
opgaveforslag — tre målinger, tre sider af det samme: de medlemmer der
ikke bruger platformen, får en platform der bliver forkert, og ingen af
de tre målinger så det alene. Testen kunne kun prøve fire af elleve,
fordi et felt der ikke findes har ingen andel. De tre værste:
YKRG 2024 med omsætning NUL og 1,4 mio. i lønninger, Topix 2025 med
negativt bruttoresultat uden vareforbrug, Booking Innovation 2025 med
fire af fem felter manglende — og Booking 2024 med personale 46 kr. om
måneden, læst tusind gange for lille (DEL 2 «Årsrapport-udtrækket», DEL
3, DEL 4).**

**7. september 2026, sidst på dagen — FORNYELSESBESLUTNINGEN
KAN TRÆFFES FRA VIRKSOMHEDSSIDEN (#707): før kunne den KUN træffes i
`FornyelsesSektion` på /members, som er ude af menuen — hele kæden hang
på en URL skrevet i hånden. Aftalen-kortet sætter tilbyd, sætter
tilbyd_ikke og FJERNER; «fjern» er ikke tilbyd_ikke, ingen række betyder
«endnu ikke besluttet». Samlet samme dag (#709): `company_fornyelse`
skrives ÉT sted, låst af et værn; `skrivFornyelsesnote` er sin egen
funktion, fordi en ny note ikke er en ny beslutning. DE TAVSE FEJL,
PUNKT 1–4 LUKKET: forsiden (#703), virksomhedslisten (#706), /members
og medlemmets forside (#708) — alle med `kraevRaekker`, alle med en
isError-gren, alle under det samme værn, som nu også fanger `.data ??
[]`. Medlemmets forside viser fejlen PR. SEKTION. Tilbage: punkt 5–11 og
de 115 queryFn'er der slet ikke kaster. STANDARDMÅL MARKERES (Jonas
7/9): `KPI_FALLBACK_TARGETS` er ét sæt for alle, og fire af de seks er
absolutte kronebeløb — en virksomhed der omsætter for 40.000 fik «mål
120.000» som var det deres eget. Oprindelsen bæres nu som et VALGFRIT
felt på værdien, så ukendt aldrig stemples som standard; tallene selv er
en åben faglig opgave. INVITATIONEN SIGER «SENDT» KUN NÅR DEN ER SENDT
(#705). IKKE RETTET, målt hvorfor: `Betal.tsx` siger «vi har sendt en
faktura» ud fra 30 dage, mens cronen sender kl. 10:00 på dag 31 — i ti
timer usandt; `faktura_sendt_at` findes, men `hent_betalingstilbud`
returnerer det ikke, og den er SECURITY DEFINER. OG ET FUND FOR SIG:
INDGANGENS KÆDE HAR ALDRIG HAFT EN VIRKSOMHED — NUL rækker i
`company_betalingslink` i prod. Cronen finder ingenting, hver dag. Det
er ikke det samme som at kæden virker (DEL 2 «Fornyelseskæden», «De
tavse fejl», «Indgangen», «Rådgiverfladen»; DEL 3). SENT: omdøbningen
19/3 tog en TREDJE ting — advisor-policyen på `email_send_log` sidder på
legacy-tabellen, så Morten (kun advisor) kan ikke se e-mail-loggen nogen
steder. Migration skrevet, IKKE kørt: advisor får SELECT, med
forudsætningen at advisor betyder «Jonas eller Morten» (DEL 2 «De tavse
fejl», DEL 3, «Beslutninger»).**

**7. september 2026, sen eftermiddag — FORNYELSEN
SENDER: bevist i produktion kl. 11:57 med rigtige mails til rigtige
mennesker. PHILBERT fik varsel 1 (22 dage, 20.000 kr.), CARMA STUDIO fik
varsel 2 på dag 0 — og IKKE varsel 1, præcis som motoren lover om den
sene beslutning. Kæden er hel: motor (#680), cron (#681), afsendelse og
stempling (#695), bånd (#691, #692), forsidens linje (#696), mails
(#694). Tørkørslen fandt en fejl ingen test kunne have fanget: varsel 2
hed «Om en uge slutter dit år», men sendes ved 7 dage ELLER FÆRRE —
CARMA ville have fået den på deres sidste dag; nu tre trin (#697).
LØST 7/9 kl. 14:51: cron-jobbet «fornyelsesvarsler» er PLANLAGT og aktivt
  (0 11 * * * UTC = 13:00 dansk, ellevte job, alene paa klokkeslaettet —
  maalt i cron.job). Foerste koersel 8/9 finder ingen forfaldne: PHILBERT og
  CARMA er stemplet. Naeste rigtige afsendelse er PHILBERTs varsel 2 den
22/9, og det sker kun hvis nogen kører funktionen i hånden (DEL 2
«Fornyelseskæden», DEL 3). SLUTDATOEN ER DEN SIDSTE DAG MED ADGANG (#698,
#699, migration kørt kl. 14:26): før mistede et medlem adgangen kl. 02
dansk tid NATTEN FØR sin egen slutdato, mens mails og bånd sagde «slutter
i dag». To lag flyttede sig sammen — TypeScript-dommen i begge kopier og
de to SECURITY DEFINER-funktioner — for kun det ene lag ville have givet
en ÅBEN skal med LUKKET community. Målt før og efter: ændringen ramte
præcis én virksomhed, CARMA, og gav dem den dag de havde betalt for (DEL
2 «Slutdatoen»). SENDT-LOGGEN HAR VÆRET DØD I ET HALVT ÅR (#701): den
læste to kolonner der forsvandt ved omdøbningen 19/3, kaldet fejlede
med 400, og skærmen sagde «Ingen afsendelser endnu» over 1.664 rækker —
den så TOM ud, ikke ØDELAGT. DE TAVSE FEJL ER MÅLT (recon-tavse-fejl):
115 af 139 queryFn'er gør en Supabase-fejl til tom data, og ingen
query-fejl er nogensinde blevet logget. Rettet i dag: global fejllogning
(#702) og forsidens ni delkald (#703); rangeringen for de 115 står (DEL 2
«De tavse fejl», DEL 1 «Kodearbejde», DEL 3, DEL 4).**

**7. september 2026, formiddag — BASELINEN ER NUL, OG CI HÅNDHÆVER
DEN: de fire sidste typefejl er rettet uden at skjule nogen (#675), og
`test.yml` kører nu `tsc` FØR testene, uden kendt-liste og uden
`continue-on-error` — bevist i drift, kørsel 34092921389 (#676; DEL 1
«Kodearbejde»). Gaten virkede første gang samme dag: TILBUDSVINDUET
EFTER UDLØB er bygget som tilstanden `udloebet_vindue_lukket` (#678,
besluttet 27/8), og tsc fangede de to Record-aftagere den nye status
manglede i. Elleve statusser; `hent-fornyelsestilbud` kalder nu MOTOREN,
så tilbud og betaling dømmer på samme kilde — hullet «et tilbud der
aldrig udløber» er lukket. Bevist i drift kl. 09:36–09:38 på Topix.dk
ApS: dag 10 gav tilbud, dag 15 tog det væk (DEL 2 «Fornyelseskæden»).
Før tilstanden blev paritetstesten styrket (#677), fordi den ellers var
blevet grøn uden at røre den nye gren. Varselsstemplerne på
`company_fornyelse` er i prod (#674, kl. 08:51), og AFSENDERENS TAL ER
BESLUTTET: mail 1 dag 30 før slutdato, mail 2 dag 7, tilbuddet lever 14
dage efter; rådgiverbeslutningen skal foreligge senest dag 30, ellers
sendes intet (fornyelsesordningen §7). Forsidens pukkel peger nu på
virksomheden når den dækker én (#672). En fejl jeg selv lavede: `git
checkout -b` BÆRER uncommitted arbejde med — #673 fik to vinduers
arbejde i én commit og blev splittet i #674 og #675; ny regel i DEL 1
«Git» og DEL 4. Det åbne: datogaten omgås stadig (udløbsgrenen afgøres
FØR den), og afsenderen selv — mail, skabelon, cron — er næste stykke
(DEL 3).**

**6. september 2026, aften — VORES EGEN VIRKSOMHED ER
IKKE LÆNGERE EN KUNDE i rådgiverens billede: nyt felt `companies.er_kunde`
(#666 migration, #668 flader), ren fail-open-funktion `erKunde`, læst i
præcis tre læsestier, bevist på skærm af Jonas (DEL 2, «er_kunde»). Tre
reconer målte kæderne mod 10/9: FORNYELSESORDNINGEN HAR INGEN AFSENDER,
10/9 er ikke en tændingsdato, datogaten omgås på tilbuds- og
checkout-vejen, og alle forudsætninger (fire tabeller, ni priser, seks
webhook-events, fire udrullede funktioner, ti cron-jobs) er grønne —
detaljen står i fornyelseskædens §10 og §13 og ordningens §5 og §7 (DEL 2,
«Fornyelseskæden»). BESLUTTET (Jonas): medlemmet skal høre om sin
fornyelse fra SYSTEMET, i indgangens form; den reelle deadline er midten
af november, ikke 10/9 (DEL 3). Agentkæden er målt: ugeagenten kører
LIVE, ikke tørt — og formentlig slet ikke, for dens cron findes ikke i
prod (DEL 2, «Agentkæden»). Tre værktøjsfund: CI kører ikke typecheck,
Lovable regenererede `types.ts` og gav elleve typefejl, og
build-chatten opgav en gren og en commit der ikke fandtes (DEL 1, DEL 4).
SEN AFTEN: de elleve er rettet (#670) — baselinen er FIRE igen, og et
tsc-trin i CI er ikke længere blokeret (DEL 1, DEL 3). Målt kl. 22:18:
«8 agentforslag venter» var Topix (6) og remm. (2); forsiden siger nu 2
— et andet bevis for `er_kunde` — og godkendelse skriver INDEVÆRENDE
uges nøgle på et forslag fra august (DEL 2 «Agentkæden», DEL 4).
Gaten viser ikke længere en teknisk fejlbesked (#667). Dagene 4/9 sen
aften står i DEL 2 «Konverteringen» og i DEL 3.**

**4. september 2026, sen aften — efter at ALLE OTTE
gamle admin-sider blev konverteret til Hjemmebane på cirka to timer
(#645 Legat, #646 e-mail-log, #647 Review Queue, #648 Platformconfig,
#649 Import, #651 Feedback, #653 ReportDebug, #654 EmailTemplates —
to former der manglede i huset, fold+JSON og faner, blev bygget
undervejs), rådgiverens chat blev Hjemmebane hele vejen (#655 udtrykket,
#657 sidebar/skuffe/⋯-menu, #658 skallen på `/chat`) — RÅDGIVERENS
HVERDAG ER NU HJEMMEBANE HELE VEJEN (DEL 2, «Konverteringen»),
Milestones' fire Radix-portaler blev bygget om
med den nye primitiv `HbOverlejring` (#644), og forsiden kom ind på
roden — rådgiveren lander nu i det nye (#650). MÅLT SENT PÅ AFTENEN:
`/members` KAN IKKE swappes — elleve dele findes kun dér, syv af dem er
handlinger ingen anden flade kan udføre, og designets §11 punkt 6
nævner kun to af dem (DEL 3). `EmailTemplates` skal stadig DESIGNES;
udtrykket er konverteret. Menuen er målt: Review Queue kan ud,
Platformconfig og Legat kan ikke, Import hører på virksomhedssiden;
navnene er ikke afgjort. Tidligere samme eftermiddag: forsiden gik fra KØ til OPGAVE og
DOMMEN BLEV BEVIST PÅ SKÆRM kl. 13:04:
syv linjer, hvor køerne gav 38 rækker. Køerne (#630) blev set og
forkastet, designet skrevet om fra bunden (#631), opgave-modellen
bogført som ét epic (#632), `/forside` mærket råmateriale (#633),
tærsklen målt til 70 (#634), dommen bygget som ren funktion med 36 tests
(#635), fladen lagt på dommen (#637), køerne fjernet (#638) og chattens
rulning af hele virksomhedssiden rettet (#639). Besluttet samme
eftermiddag: det gamle design KONVERTERES, ikke flyttes — `/milestones`
først, `Members` sidst (DEL 3). Formiddagen: virksomhedssiden hel (#607,
#611–#624), owner-hullet lukket i `handle_new_user` (#622, i prod
kl. 10:33), M/M for marginer i procentpoint (#623), MemberDetail
slettet.**

Læses først i enhver ny samtale. Claude husker intet mellem samtaler;
denne fil skal kunne bære det. Den fortæller hvordan vi arbejder, hvor
vi står, hvad der venter, og hvilke fælder der har kostet tid — og peger
på det dokument der bærer detaljen. Detaljen bogføres DÉR, ikke her.

**Én regel har formet filen:** hver påstand er enten målt (med kilde),
eller mærket som ikke målt. En tidligere overlevering begyndte med en
sætning der var forkert, og det kostede en time.

---

## DEL 0 · Start her — det en ny samtale skal vide før alt andet

Du er Claude i chatten (claude.ai). Du taler med Jonas Herlev,
medstifter af The Boardroom, en finansiel rådgivningsplatform for
danske SMV'er. Morten er medstifter og rådgiver sammen med Jonas; de
to er «rådgiverportrætterne» i signup-skærmen. Claude Code er et
SEPARAT værktøj i Jonas' terminal, som du skriver prompter til.

**START HER:** læs denne fil til ende. Spørg så Jonas hvad han vil tage
fat på, og foreslå ud fra DEL 3's tabel (de datosatte rækker først).
Antag intet om tilstanden ud over det der står her, med dato og kilde.

**Sprog.** Alt er på dansk: chat, kode, identifikatorer, kommentarer,
commit-beskeder, PR-titler og -bodies, dokumenter. Engelsk kun hvor
tredjepart dikterer det (Stripes feltnavne, biblioteks-API'er).

**Arbejdsdelingen.** Jonas udfører ALT teknisk selv. Du dikterer
præcise, kopierbare skridt, ét ad gangen: én kodeblok pr. svar, og
intet andet der ligner kode. Destinationen står som almindelig tekst
OVER kodeblokken — Terminal, Lovable SQL editor, Lovable build-chat,
Claude Code, browser-URL — aldrig som `#`-kommentar inde i blokken
(zsh læser ikke `#` interaktivt). Facit skrives som tekst. Er du i
tvivl, spørg med A/B-valg; Jonas svarer med bogstaver.

**Claude Code.** Startes med:

    cd ~/topix-financial && claude

og derefter `/model fable` i Claude Code. Den læser selv `CLAUDE.md`
(stack, RLS-mønstre, deploy-kanaler, FORBIDDEN-listen), så det skal
ikke gentages i prompten. Recon kommer ALTID før kode: Claude Code
bruges til at finde hvad der allerede findes, hvilke navne og
kontrakter ny kode skal stemme med, og hvem der kalder hvad, før nogen
ny SQL-funktion, edge function, migration eller flade skrives.
Enhver prompt slutter med at den selv skriver resultatet til
`~/Downloads` og siger hvilken fil: diffen ved kodeændringer
(`git add -A && git --no-pager diff --cached > ~/Downloads/diff-<navn>.txt`),
dokumentet ved recon (`~/Downloads/recon-<navn>.md`). Jonas uploader
filen til chatten. Recon-prompter beder ALTID om KUN fund — ingen
forslag, ingen vurdering — og om at STOPPE frem for at gætte.

**AFGJORT 3/9: Claude Code opretter IKKE grene.** Den bliver på `main`
og committer ikke; chatten dikterer grenen ved commit (`git checkout -b
<navn>` → commit → push → `gh pr create`). Det fjerner dubletten af
grene, som hidtil kostede en oprydningsrunde pr. opgave. Skriv det i
prompten, indtil det sidder.

**To Claude Code-vinduer** er tilladt når HØJST ÉT skriver. To reconer
samtidig er fint; en recon plus en kodeændring er fint; to skrivninger
er det ikke — heller ikke når den ene «bare» er dokumentation. Sker det
alligevel: `git reset` det staged, og `git add` med navngivne stier.
Bekræftet 3/9 aften: to vinduer kørte hele aftenen (recon i det ene,
bogføring i det andet) uden problemer, fordi højst ét skrev ad gangen.
**Og FØR `git checkout -b`, når to vinduer kører: `git status --short`.**
`checkout -b` bærer uncommitted arbejde fra det andet vindue med over på
den nye gren (7/9, #673 — DEL 1 «Git», DEL 4).

**Rutinen efter merge, som handlinger** (rækkefølgen er den faktiske):

1. **Migration** (`supabase/migrations/…`): Jonas åbner Lovable → SQL
   editor, indsætter HELE migrationsfilen (ikke et uddrag — 3/9 kostede
   et uddrag RLS og kommentarer på `company_traek`), kører, og
   verificerer med en SELECT mod `information_schema`/`pg_policies`.
2. **Ny edge function eller ny `_shared/`-fil**: ruller IKKE med merge.
   Jonas beder build-chatten i Lovable om at deploye funktionen ved
   navn. Build-chattens «deployet ✅» er IKKE bevis — et kald er: kald
   funktionen uden nøgle og se 401 (eller 400), ikke 404. Ændringer i
   en eksisterende function uden ny delt fil auto-deployer.
3. **Frontend** (`src/`): Jonas klikker «Update» i Lovable, når synken
   har commit'en. Hard reload i browseren før noget bevises.
4. **Webhook-grene**: kig i Stripe Workbench → Webhooks → Event
   deliveries bagefter. En 500 fejler stille for os.
5. **Grene ryddes** med `gh pr list --state merged` — aldrig med `git
   diff` (GitHub squasher, så diffen lyver). Slet derefter med `git
   push origin --delete <gren>` og `git branch -D <gren>`.

**Hjemmebane («Hb»)** er platformens nye designsprog: lyst, redaktionelt,
tokens scoped til `.theme-hjemmebane`; komponenter hedder `Hb…`
(`HbMemberShell`, `HbSpinner`, `HbSidebarDrawer`), og medlemsfladen
bæres af `HbMemberShell`. **AppLayout er det gamle design** — mørkt,
Radix-baseret — som store dele af rådgiverfladen stadig ligger i.
Designsproget står i `docs/hjemmebane-designsprog.md`; hvad der er
flyttet og hvad der venter står i `docs/hjemmebane/konvergens.md`.

**Hvad du kan nå herfra, og hvad du ikke kan.** Du har MCP mod Stripe
(The Boardroom-kontoen) og kan læse og skrive der — hvert kald med
eksplicit `stripe_context` og `livemode: true`. Du har IKKE adgang til
Supabase-dashboardet (Supabase-MCP'en rammer ikke Lovable-projektet),
ikke til Lovable (SQL editor, build-chat, Update, Auth-indstillinger,
Storage), og ikke til Stripes Event deliveries-log. Dem kigger Jonas i,
og du dikterer hvad han skal køre eller se efter.

---

## DEL 1 · Arbejdsgangen

Jonas eksekverer alt teknisk. Claude er teknisk arkitekt og dikterer
præcis ét næste skridt ad gangen. Alt eksekverbart står i chatten, aldrig
som en henvisning til en fil Jonas skal finde. Reglerne nedenfor står
der fordi det modsatte har kostet noget konkret, med dato.

### Værktøjsvalg — Claude har ansvaret for at vælge rigtigt uden at blive bedt

Tre værktøjer, tre styrker:

| værktøj | styrke | bruges til |
|---|---|---|
| **Lovable SQL editor** | måler PRODUKTIONENS faktiske tilstand | `pg_proc`, `pg_policies`, `information_schema`, `cron.job`, tal i tabeller. Migrationshistorik er ikke bevis. |
| **Shell / heredoc** | læser enkeltfiler ORDRET, skriver rene datadumps hvor hvert tegn er kendt på forhånd | `cat`, `grep`, `sed -n`, bogføring af målinger |
| **Claude Code** | ÆNDRER kode, og finder sammenhænge på tværs af hele repoet som hverken Claude i chatten eller SQL editor kan se | alle kodeændringer, al recon der følger tråde mellem filer |

**Claude Code SKAL bruges før enhver ny SQL-funktion, edge function,
migration eller flade**, til at afdække: (a) om noget lignende allerede
findes, (b) hvilke navne, tilstande og kontrakter den nye kode skal
stemme overens med, (c) hvem der kalder hvad.

Dokumenterede anledninger 2/9: `hent_betalingstilbud` blev skrevet med
tilstandsnavnet «aaben», som ikke stemte med `afgoerBetalingsfrist`s
«afventer_betaling», skrevet en time forinden — fordi de aldrig blev set
ved siden af hinanden. Og `intro-reminder-cron` blev erklæret død ud fra
et forældet filhoved; Claude Code fandt cron-jobbet der kalder den
(jobnavnet `intro-session-reminder` matchede ikke funktionsnavnet).

**Ved recon: bed UDTRYKKELIGT om KUN fund.** Ingen forslag, ingen
vurdering. Ellers blandes måling og mening. Reconen skrives til en fil,
aldrig kun til skærmen.

**ENHVER prompt til Claude Code slutter med at den selv skriver
resultatet til `~/Downloads`** — diffen ved kodeændringer, dokumentet
ved recon. Fast afslutning:

    Til sidst, uanset udfald:
      git add -A && git --no-pager diff --cached > ~/Downloads/diff-<navn>.txt
    Sig hvilken fil den ligger i.

Uden det bliver hver ændring til tre runder i stedet for én. Og:
dokumenter Claude Code skal SKRIVE til repoet, skriver den selv — Claude
i chatten dikterer ikke en heredoc med indhold en model lige har lavet.

### Ét skridt ad gangen

Aldrig to handlinger i samme besked. Ikke en commit og en recon. Ikke en
SQL-kørsel og en terminal-kommando. Én kodeblok pr. svar, og intet andet
der ligner kode — facit skrives som tekst. Destinationen står som
almindelig tekst OVER blokken (Terminal, Lovable SQL editor, Lovable
build-chat, Claude Code, browser-URL), aldrig som `#`-kommentar inde i
den: zsh læser ikke `#` som kommentar interaktivt («# TERMINAL» gav
`command not found: #`). Målt 1–2/9: to handlinger i én besked kostede
tre gange en ekstra runde, og én gang en commit direkte på `main`.

### Mål, påstå ikke

Fravær i data er ikke en tilstand før det er undersøgt. Skriv aldrig
«der findes ikke» uden at have målt det — og et «findes ikke» skal bære
den grep eller SQL der viste det. Fravær i repoet er ikke fravær i drift;
fravær i hukommelsen er ikke fravær i repoet.

Ret dig selv højt og med det samme: hvad du troede, hvad der viste sig,
hvad det ændrer. Dokumenterede fejl 1–2/9: en Monday-kolonne der skal
dø blev gjort til kilde for indgangsprisen; en margin (`cancel_at`) blev
sat i den forkerte retning fordi kun konklusionen var skrevet ned; en
testfil blev «læst» ved kun at se assertions, ikke tallene; en påstand
om at en opdatering var gået igennem, da hele transaktionen faktisk var
rullet tilbage af en constraint-fejl; fristen blev regnet fra
betalingsmailen, hvor aftalegrundlaget siger fra underskriften.

### Destruktive ændringer

SELECT før, skriv, SELECT efter. Skriv FØR-værdierne ud i svaret, så de
kan rulles tilbage uden at lede. Guard hver UPDATE på den forventede
nuværende værdi (`and cvr_number is null`, `and status = 'active'`), så
en allerede rettet række rammer nul frem for at blive overskrevet.

Lovables SQL editor kører hele scriptet i ÉN transaktion: fejler ét
statement, rulles HELE kørslen tilbage — også det der så ud til at
lykkes. DDL og en `rollback`-måling må aldrig stå i samme script. Og
editoren eksporterer kun det SIDSTE resultatsæt: flere målinger samles
i ét med `UNION ALL` og en `sektion`-kolonne, alle grene castet til
samme kolonneantal og -type.

### Kodearbejde

- **Motor før flade.** Rene, testede funktioner bevist før noget nogen
  kan trykke på. Spejles en motor til Deno (`_shared/`), er filhovedet
  den eneste forskel, og en paritetstest i `src/lib/__tests__` låser det.
- **En queryFn kaster; fladen skelner fejl fra tom (7/9).** `const {
  data } = await supabase…` og `res.data || []` gør en fejl til et tomt
  svar: TanStack ser en succes, `isError` bliver aldrig sand, og fladen
  siger «ingen … endnu» om noget der er ødelagt — sendt-loggen stod
  sådan i et halvt år. Læs `error` og kast; `kraevRaekker(svar, kilde)`
  (`src/lib/kraevRaekker.ts`) kaster med kildens navn. Fladen viser
  «kunne ikke hentes» ved `isError`, aldrig samme tekst som ved tom
  liste. Hvor det er rettet, låser et kildelæsende værn det (DEL 2 «De
  tavse fejl»).
- **Læs rå diffs før commit-go** — aldrig referater.
- **Merge er ikke udrulning.** Frontend kræver Update-klik i Lovable
  når synken har commit'en. Nye edge functions OG ændringer der trækker
  en ny delt fil ind (`_shared/…`) ruller ikke med merge — de deployes
  eksplicit via build-chat, og verificeres med at funktionen svarer
  noget andet end 404 (målt 31/8 på `foreslaa-opgave`, 1/9 på
  `_shared/stripePris.ts`). Migrationer køres manuelt i SQL editoren og
  auto-deployer aldrig.
- `gh run list --branch`, ikke `gh pr checks` (Vercel-appen hænger check-
  suites i `queued`).
- `bunx tsc --noEmit -p tsconfig.app.json` (uden `-p` checkes nul filer).
  **Baselinen er NUL (#675, 7/9), og CI HÅNDHÆVER DEN (#676).**
  `test.yml` kører tsc FØR `bun run test` i jobbet «Tests» — ingen
  kendt-liste, ingen `continue-on-error`: baselinen var nul da trinnet
  blev indført, så gaten har aldrig haft undtagelser. KUN i det ene job:
  «MCP Tests» kører samme kodebase, og et typecheck dér ville betale for
  samme svar to gange (står i workflow-filen). **Bevist i drift:**
  kørsel 34092921389, jobbet «Tests», trin 6 «Typecheck» → success, før
  «Run tests». Gaten virkede første gang samme dag: #678's nye status
  fik tsc til at fejle på præcis de to Records der manglede den. **De
  fire sidste blev rettet uden at skjule nogen** (#675, princippet fra
  #670 — de genererede typer er sandheden): `analysis`-castet i
  CompanyChatPane erstattet af `laesAnalysisData` (eksplicit indsnævring
  i `src/lib/financialAnalysis.ts`, 11 tests); PushViews `metadata`
  bygget med husets eget udtryk (samme som Evergreen/Redaktionelt/
  UgensVideo); `reportCardRefs` typet som `HTMLElement` (`HTMLDivElement`
  var en løgn — ref'en sidder på et `<li>`); og `period_label`, som
  ALDRIG har eksisteret på `financial_commentaries` — «`period_label ??
  period_key`» var død kode siden den blev skrevet, og listen «Analyser
  uden tilknyttet rapport» har hele tiden vist `period_key`. Nu står
  der `period_key` med kommentar. **Én adfærdsændring:**
  `laesAnalysisData` dropper et nøglefund med ukendt `severity`; før
  blev det vist. Reglen står i læserens filhoved. Baselinen var FIRE
  fra 6/9 sen aften (#670) og 15 i nogle
  timer 6/9: Lovable REGENEREREDE HELE `types.ts` (commit `2cd553e2`
  «Work in progress», 1903 linjer skrevet, 1898 slettet) med en anden
  generatorversion end 3/9, så nullable kolonner blev valgfri felter
  (`ends_at?: string` i stedet for `string | null`), og husets
  håndskrevne interfaces krævede dem stadig. **Rettet efter princippet
  at de genererede typer er sandheden om databasen (#670):**
  `EventTimes.ends_at` og de fire felter på `MemberProgress` er nu
  valgfrie OG nullable, og reglen står skrevet begge steder — null og
  undefined betyder det samme, «det er ikke sket». Ingen casts, intet
  non-null, ingen ændring i `types.ts`; tretten nye tests låser reglen,
  inkl. grænsen ved `starts_at` + 90 min. Sker det igen, er det
  opskriften — og nu fanger CI det (#668 var grøn med 15 typefejl; det
  kan ikke ske igen). Kør stadig tsc FØR diff-filen skrives: CI er
  sidste værn, ikke første. `bun run test`, ikke `bun test`. Deno-tests i
  `_shared/*_test.ts` kører kun i hånden; `deno check` er ikke en gate
  i CI. `bun run check:edge-auth` kører i CI; `check:verify-jwt` kun lokalt.
- CLAUDE.md's «FORBIDDEN»-liste gælder: ingen ændring af
  SECURITY DEFINER-funktioner, `handle_new_user` eller
  `protect_*`-triggers uden eksplicit grønt lys.

### Git og Claude Code — grene, sletning, samtidighed (målt 2.–3. september)

- **`git diff` kan IKKE afgøre om en gren må slettes i dette repo.**
  GitHub squasher ved merge, så grenens commits findes aldrig i `main`
  under samme id. Både to-prik (`origin/main..gren`) og tre-prik
  (`origin/main...gren`) giver forkerte svar, og `git branch -d` nægter
  at slette selv når arbejdet ER inde — advarslen «has been merged to
  refs/remotes/origin/… but not yet merged to HEAD» er præcis det.
  **Det der virker:** `gh pr list --state merged` — spørg den der ved
  det. Claude fejlede på det to gange 3/9 og nåede tre forskellige
  forkerte konklusioner, før den spurgte GitHub.
- **Læs retningen, når du alligevel læser en diff.** `git diff main..gren`
  viser hvad grenen ville ændre HVIS den blev merget. Store
  sletningstal betyder at grenen MANGLER det `main` har — den er ældre —
  ikke at den ville fjerne noget. En gren der «sletter 3267 linjer» er
  typisk bare lavet før de sidste PR'er blev merget.
- **Claude Code lavede sine egne grene, og de blev aldrig merget.**
  Claude Code oprettede selv en gren med sit eget navn, mens Claude
  (chatten) committede på en gren med et andet navn. Resultatet var en
  dublet efter hver opgave — 3/9 stod der fire tilbage ved
  eftermiddagens slutning (`feat/forsidesektion-faellesskab`,
  `feat/hb-visning-som`, `feat/registrer-traek`, `feat/traek-badge`)
  plus flere om formiddagen; alle ryddet 3/9 (målt: ingen af dem findes
  lokalt eller på `origin`). **AFGJORT 3/9 (DEL 0):** Claude Code
  opretter IKKE grene og committer ikke; den bliver på `main`, og
  chatten dikterer grenen ved commit.
- **To kodeændringer må ikke køre samtidig i to Claude Code-vinduer.**
  Reglen har hidtil kun stået som CLAUDE.md's «Lovable og Claude Code
  skriver ALDRIG samtidig»; den gælder også to Claude Code-vinduer.
  Skærpet 3/9: Claude satte en bogføring i gang mens en kodeændring
  kørte — begge skriver til repoet, og `git add -A` ville have blandet
  dem. Det gik godt kun fordi bogføringen ikke nåede at skrive endnu.
  **Når det ALLIGEVEL sker:** commit med filerne NAVNGIVET (`git add
  sti1 sti2 …`) frem for `git add -A`, og `git reset` først hvis noget
  allerede er staged. Reglen står ved magt: to reconer samtidig er
  fint, en recon plus en kodeændring er fint, to skrivninger er det
  ikke — heller ikke når den ene «bare» er dokumentation.
- **`git checkout -b` BÆRER uncommitted arbejde med over på den nye
  gren** (7/9, en fejl jeg selv lavede). Vindue 2 stod med en
  typerettelse staged på `main`; vindue 1 lavede gren og committede sin
  migration med navngiven `git add` — og fik typerettelsen med, fordi
  den allerede lå i indekset og fulgte med over på grenen (#673, lukket
  og splittet i #674 og #675). Navngiven `git add` beskytter mod at
  committe forkerte filer — den beskytter IKKE mod at bære dem med.
  **NY REGEL:** kør `git status --short` FØR `git checkout -b` når to
  vinduer kører; står der noget, så afklar hvis det er, før grenen
  laves.

### Dokumentation slås op

Ved tredjepartsværktøjer: slå op frem for at huske. Stripe især — otte
opslag på to døgn rettede otte antagelser (`cancel_at` i Checkout,
mailbekræftelse, kundekopi, moms-id, `proration_behavior`, expire-
endpointet, idempotency-nøgler, invoice-events). **Det gælder også
offentlige registre** (lærdom 3/9): CVR's branchekode skiftede fra DB07
til DB25 1/1 2025, og både designdokumentet og opgaven til
branchemotoren blev skrevet fra hukommelsen mod det gamle register — et
register vi bygger på kan være skiftet ud, uden at noget i repoet siger
det. Supabase-MCP'en har IKKE adgang til Lovable-projektet
(`execute_sql` svarer «You do not have permission») — prod måles i SQL
editoren.

### Regnestykker skrives ud

Afgør en beregning penge eller datoer, skal selve regnestykket stå i
kommentaren, ikke kun resultatet: «rate12 trækker i måned 0–11, næste
træk ville falde i måned 12, start + 12 måneder − 1 dag rammer efter
sidste aftalte træk og før det næste.»

### Hvor kommer feltet fra

Spørg altid hvor data stammer fra, og om kilden overlever. Et felt der
bygger på noget der skal dø, dør med det (Monday-kolonnen «Pris på
forlængelse», 1/9). Før et felt foreslås: grep på dansk OG engelsk, og
list alle `ALTER TABLE … ADD COLUMN` — de er spredt over mange
migrationer.

### Spørg med svarmuligheder

Er Claude i tvivl, stilles spørgsmålet direkte med A/B-valg frem for
åbent. Jonas svarer med bogstaver.

### Værktøjer, adresser

Repo `jonastopix/topix-financial` i `~/topix-financial`, Lovable-ejet
Supabase-projekt `loiavmastgeieqyiwyyr`. Claude Code i terminalen med
`/model fable`. Stripe: egen konto `acct_1U6mzp3CvBmCx5Pt` («The
Boardroom») siden 1/9; den gamle Topix.dk-konto
bærer stadig 13 abonnementer (konto-id: slå op i Stripe, ikke huskes). Hvert Stripe-MCP-kald kræver eksplicit
`stripe_context` OG `livemode: true`. Bunny Stream library `720547`,
referrer-låst til `app.theboardroom.dk`.

---

## DEL 2 · Tilstanden

Kort, med det dokument der bærer detaljen.

**Mailene — alle mails huset kan sende, hvornår og til hvem:**
`docs/mailfortegnelsen.md` (8/9, efter Lovables mailopdatering; fem fund
øverst). Opdateres hver gang en mail tilføjes eller en cron ændres.

### Fornyelseskæden — bevist i drift 1/9; tilbudsvinduet, varselsmotoren, cron-rapporten, betaling FØR slutdatoen og fornyelsesbåndet bygget 7/9; MAILENE SENDER, bevist i produktion 7/9 kl. 11:57 — cron-jobbet er PLANLAGT 7/9 kl. 14:51

`docs/fornyelseskaeden-1-september.md`, `docs/fornyelsesordningen.md`.
Indgangsprisen er data (`companies.indgangspris_oere`, `fornyelsespris_oere`),
perioder er rækker (`company_perioder`), kontrakten løber fra
betalingsdagen — og fra 7/9 fra den GAMLE slutdato, når der betales før
den (fornyelseskæden §15.3) — beslutningen (`company_fornyelse`) forlader
aldrig serveren. Motoren `afgoerFornyelsestilstand` (ELLEVE tilstande fra 7/9),
fladen `FornyelsesSektion` på /members, gaten `MembershipExpiredGate`,
`hent-fornyelsestilbud` og `opret-fornyelse-checkout` — begge på
motoren fra 7/9 — og fornyelsesgrenen i `stripe-webhook` med
`cancel_at` sat fra abonnementets start. Ordningen træder i kraft 10/9.
Åbne punkter står i fornyelseskædens §10; det der blev bygget 7/9
formiddag i §14, eftermiddag i §15.

**Bygget 7/9** (detaljen i fornyelseskædens §14 og ordningens §3 og §7):

- **Tilbudsvinduet efter udløb er en tilstand (#678):**
  `udloebet_vindue_lukket`, KUN efter beslutningen `tilbyd` — `tilbyd_ikke`
  har aldrig haft et tilbud og har derfor intet vindue at lukke. Grænsen
  er 14 hele UTC-kalenderdage efter slutdato
  (`FORNYELSE_TILBUDSVINDUE_EFTER_UDLOEB_DAGE`, ikke at forveksle med
  beslutningsvinduet på 60 dage før): slutdato 1/10 giver sidste
  tilbudsdag 15/10, lukket 16/10. Er `dage_til_udloeb` null, bevares
  tilbuddet frem for at lukke på et tal vi ikke har. Alle seks aftagere
  er med: de to Records (tsc fangede dem — DEL 1), `SKJULTE_STATUSSER`
  (som `ophoert`: intet at gøre, rækken kræver ikke opmærksomhed),
  forsidensDom (ingen grund — forsiden er handlinger, ikke status),
  `hent-fornyelsestilbud` og `opret-fornyelse-checkout` (uændret; den
  krævede allerede `udloebet_tilbyd`). **Vigtigst:** `hent-fornyelsestilbud`
  kalder nu MOTOREN frem for selv at tjekke tier og beslutning, så tilbud
  og betaling dømmer på samme kilde. Det lukker hullet «et tilbud der
  aldrig udløber». Udrullet eksplicit fra `36204422` inkl.
  `_shared/fornyelse.ts` (den trak en NY delt fil ind).
- **Bevist i drift 7/9 kl. 09:36–09:38** på Topix.dk ApS (`er_kunde =
  false`, så ingen rigtig kunde blev rørt): slutdato sat 10 dage tilbage
  med beslutning `tilbyd` og indgangspris 40.000 → gaten viste tilbud på
  20.000 kr. ekskl. moms med alle tre betalingsmodeller (12 rater à
  1.750 kr., altså 5 %-tillægget fra `fornyelse_20000_rate12`). Slutdato
  flyttet til 15 dage → tilbudskortet FORSVANDT, og gaten faldt tilbage
  til «Vil du fortsætte? Skriv til os». Grænsen holder fra begge sider.
  Topix rullet tilbage og målt: slut = 2030-04-20, indgangspris = NULL,
  ingen fornyelsesrække, fem rækker i alt i `company_fornyelse`.
- **Paritetstesten blev styrket FØRST (#677).** Den var svagere end
  betalingsfristens: én now-dato, ti cases, ingen bred fejning, ingen
  sammenligning af konstanterne — og dens udløbs-cases lå 11 dage efter
  slutdato, altså INDE i vinduet; den ville være blevet grøn uden at
  røre den nye gren. Nu: fejning over dag −100…+60 × tre beslutninger ×
  med/uden abonnement × to now-datoer, en konstant-blok, og
  `ALLE_STATUSSER` som `Record` over unionen — som virker nu hvor CI
  kører tsc.
- **Varselsstemplerne på `company_fornyelse` er i prod (#674, kørt
  kl. 08:51):** `varsel_1_sendt_at` og `varsel_2_sendt_at`, begge
  nullable, plus en eksplicit service-role-policy. To navngivne kolonner
  frem for et dag-nummer, fordi de to varsler kan sendes uafhængigt: en
  sen beslutning skal kunne give varsel 2 uden varsel 1. Tabellen har
  INGEN trigger (målt), så skrivestien — også cron'en — skal selv sætte
  `updated_at`.
- **Afsenderens tal er besluttet (Jonas 7/9):** mail 1 ved 30 dage før
  slutdato, mail 2 ved 7 dage, og tilbuddet lever 14 dage efter.
  Calendly-linket til «En snak om din fornyelse» er
  https://calendly.com/topix-jonas/fornyelse — et almindeligt link, ikke
  et engangslink (betalte bookinger registreres aldrig tilbage, målt
  3/9). **Konsekvens:** rådgiverbeslutningen skal foreligge senest dag
  30, ellers sendes intet. En glemt beslutning forsinker ikke mailen —
  den aflyser den. Ordningens §7 bærer reglen.
- **ÅBENT, IKKE LUKKET:** udløbsgrenen afgøres stadig FØR datogaten, så
  en virksomhed med slutdato før 10/9 og beslutning `tilbyd` får stadig
  et tilbud de første 14 dage. Uændret adfærd (fornyelseskæden §13.3).

**Bygget 7/9 eftermiddag** (detaljen i fornyelseskædens §15 og
ordningens §1 og §7):

- **Varselsmotoren (#680):** `afgoerForfaldentVarsel` i begge kopier,
  paritetstestet. Varsel 1 ved 30 dage før slutdato, varsel 2 ved 7.
  **Den sene beslutning er reglen der betyder noget:** træffes `tilbyd`
  først fem dage før, er begge forfaldne, og så sendes KUN varsel 2 —
  varsel 1 sendes aldrig bagefter, fordi den anden mail ville være
  forældet i samme øjeblik den blev sendt. Det er også derfor stemplerne
  er to kolonner (#674) og ikke et dag-nummer. Fail-closed på ulæselig
  slutdato. Efter slutdatoen sendes intet: tilbuddet lever stadig 14
  dage, men et varsel om noget der allerede er sket, er forkert.
- **Fornyelsesvarsel-cron (#681),** udrullet 7/9 kl. 08:15 UTC fra
  `f5c250d6`. Bucket B med `authenticateServiceRole`, tørkørsel som
  standard. I denne version en REN RAPPORT: sender intet, stempler intet.
  Cron-SQL'en står som kommentar i filhovedet (slot `0 11 * * *` UTC =
  13:00 dansk), men jobbet var IKKE planlagt i den version — en cron der
  kører en rapport ingen læser, er støj. *(Planlagt 7/9 kl. 14:51, da
  kæden sendte: `fornyelsesvarsler`, `0 11 * * *`, aktivt.)* **Tørkørslen 7/9 kl. 10:15, på rigtige
  data:** fundet 3, ingen fejl. PHILBERT → varsel 1, 22 dage til
  slutdato. CARMA STUDIO → varsel 2, NUL dage, med grunden «varsel 1
  springes over: sen beslutning». Studio Mini → intet, slutdatoen er
  passeret. Den sene beslutning virkede i drift, første gang, på rigtige
  data. **Besluttet af Jonas: ingen nedre grænse for varsel 2** — dag 0
  er en påmindelse, ikke en advarsel, og det er dér man handler. CARMA
  får sin påmindelse.
- **Betaling FØR slutdatoen (#683 motoren, #684 pengevejen),** udrullet
  7/9 kl. 08:53 UTC fra `85a0753e` — alle tre funktioner, `stripe-webhook`
  med den nye delte fil `_shared/fornyelsesperiode.ts`. Før i dag kunne
  et medlem på dag 22 hverken se eller betale sit tilbud: checkout
  svarede 403, `hent-fornyelsestilbud` gav null, og gaten vises kun for
  udløbne. Vi fortalte dem det en måned før og bad dem vente på at blive
  lukket ude. Det ændrer beslutningen fra 1/9 («fornyelse betales EFTER
  udløb»). **Regnestykket, ordret:** betalt FØR eller PÅ slutdatoen →
  GAMMEL SLUTDATO + 12 måneder. Betalt EFTER → BETALINGSDAGEN + 12.
  Grænsen er kontinuert, målt: 28/9 og 29/9 giver begge 2027-09-29, 30/9
  giver 2027-09-30. `periode_start` er UDLEDT af invarianten i
  `company_perioder`, ikke valgt: den nye periode begynder hvor den gamle
  slutter, uden overlap og uden hul. **29. februar er nu en synlig
  gren:** «12 måneder frem» er samme kalenderdag året efter; findes dagen
  ikke, er slutdatoen 1/3 året efter, fordi slutdatoen er eksklusiv og
  28/2 ville give én dag mindre end et kalenderår. **ÅBENT:** et
  ikke-udløbet medlem har intet sted at SE tilbuddet — gaten vises kun
  ved `expired`. Designbeslutning, ikke truffet endnu (DEL 3).
- **RETTELSE — jeg tog fejl om `cancel_at`.** Jeg påstod at
  `sikrOphoerPaaFornyelsesAbonnement` ville lade det sidste rate-træk
  falde bort, når kontrakten regnes fra den gamle slutdato. Det er
  FORKERT, og målingen viser hvorfor: tolv rater betalt 8/9-2026 falder
  8/9, 8/10 … 8/8-2027. Sidste træk er 8/8; `cancel_at` 7/9-2027 ligger
  en måned efter. Alle tolv trækkes. **Min foreslåede rettelse ville have
  kostet medlemmet penge:** med `cancel_at = periode_slut − 1 dag`
  (28/9-2027) ville Stripe trække et TRETTENDE træk 8/9. For to rater et
  tredje træk på 25.000 kr. Fornyelseskædens §7 dokumenterer at en
  tidligere version havde præcis den fejl, med plus én dag i stedet for
  minus. **Fejlen i tænkningen:** abonnementet måler ikke adgang. Det er
  betalingsplanen for prisen; adgangen bæres af `contract_end_date`
  alene, og fornyelsesabonnementer rører aldrig `subscription_status`
  (§11). To ure, to forskellige ting. Den eneste betingelse de skal
  overholde, er at alle aftalte træk falder før ophøret — og det gør de.
  **Konsekvens der skal kendes:** for en der betaler tidligt, ophører
  abonnementet nogle uger FØR kontrakten udløber. Det er ikke en fejl,
  men det ser forkert ud for den der kigger i Stripe uden at kende
  forskellen. Står som fælde i DEL 4 og som kort på mangellisten.
- **Kvitteringen løj (#687).** Efter en fornyelsesbetaling stod der «Vi
  åbner din adgang om et øjeblik». Sandt så længe fornyelse kun kunne
  betales efter udløb — men siden #684 er den første der betaler
  tidligt, netop et FULDT medlem, og de fik at vide at vi åbnede en
  adgang de aldrig mistede. Kvitterings-grenen i `Index` springes over
  for et fuldt medlem (den kræver tier `expired`), så toasten er hele
  oplevelsen. Nu to beskeder efter tier: full får «Betalingen er
  modtaget. Dit medlemskab fortsætter uden afbrydelse — den nye periode
  begynder hvor den nuværende slutter»; expired får den gamle. Den nye
  slutdato nævnes bevidst ikke: `useAuth` eksponerer kun tier, og et
  opslag hører ikke til der. **Målt i samme recon**
  (`~/Downloads/recon-fornyelse-efter-betaling.md`, uden for repoet):
  for et fuldt medlem returnerer reload-løkken på første linje, låsen
  slippes i samme commit, og stemplet ryddes. Intet poller, intet
  venter, intet kan låse sig fast. **ÅBENT, ikke rettet:** lander
  webhooken FØR browseren når tilbage, er tier allerede `full` for en
  der VAR udløbet — så får de «fortsætter uden afbrydelse», selv om
  adgangen lige er åbnet igen. Tier-dommen skelner ikke «var full hele
  tiden» fra «blev full for tre sekunder siden». Ikke målt, men
  uundgåeligt. Mangellisten bærer kortet.
- **Trappen mangler til den dør vi åbnede — LØST 7/9 (#691), bevist på
  skærm kl. 12:45.** Serversiden tillod betaling fra `klar_til_tilbud`
  (#684), men den eneste dør til checkout var `MembershipExpiredGate:88`,
  monteret KUN ved `expired` (målt, reconen §6): ét kaldested i hele
  `src/`. Reconen kortlagde otte eksisterende mønstre; chattens
  udløbsbånd (sage-flade, rust-ikon, gatet på tilstand) var formmæssigt
  tættest, og det blev formen. **Fornyelsesbåndet** (`FornyelsesBaand`,
  ren tekstfunktion i `lib/hjemmebane/fornyelsesbaand.ts` med fem tests)
  står øverst på medlemmets forside, mellem hilsenen og «Dit næste
  skridt», KUN når `hent-fornyelsestilbud` siger der er et tilbud. Dommen
  er serverens — motoren — så klienten læser hverken tier eller tilstand,
  og svaret røber ingen kategori (ordningens §2 holder). `kr()` bevarer
  ører; en ulæselig slutdato udelader datoen frem for at vise noget
  forkert. `enabled` er `!isAdvisor`: en rådgiver i «Visning som» ville
  ellers kalde funktionen for sin egen ikke-eksisterende virksomhed.
  **Målt frem for antaget:** forsiden laver i forvejen 19 `useQuery`-kald,
  så ét mere ændrer ikke billedet. **Bevist på Topix** (slutdato sat 20
  dage ude): «Dit medlemskab udløber 27. september 2026 — Forny nu til
  20.000 kr. ekskl. moms», tre betalingsmodeller, 12 rater à 1.750 kr. i
  alt 21.000 — 5 %-tillægget som i Stripe. **ÅBENT:** `kr()` findes nu i
  TRE kopier (gaten, `Betal.tsx`, båndet), identiske i dag; at samle dem
  rører pengevejen — mangellisten bærer kortet. **UNDERVEJS (Jonas 7/9):**
  formen strammes — større tekst, ÉN primær knap der folder de tre
  modeller ud, og luft. Mangellistens kort «Trappen mangler» er slettet.
- **Kvitteringen (#687) og de to åbne punkter fra samme recon** —
  toasten der kan ramme forkert den anden vej, og dobbeltbetaling der er
  lukket ved et held — står som kort på mangellisten siden #689 og
  gentages ikke her.
- **Dobbeltbetaling er lukket — ved et held, ikke ved en regel.** Efter
  en gennemført fornyelse ligger den nye slutdato tolv måneder ude, så
  motoren siger `i_god_tid` og checkout svarer 403. Værnet er
  60-dagesvinduet (`FORNYELSES_VINDUE_DAGE`), ikke en eksplicit regel om
  at man kun kan forny én gang. Værd at vide hvis vinduet nogensinde
  ændres. Mangellisten bærer kortet.

**Bevist i produktion 7/9 kl. 11:57 — KÆDEN ER HEL** (detaljen i
fornyelseskædens §15 og ordningens §7):

- **Rigtige mails til rigtige mennesker.** `fornyelsesvarsel-cron` kørt
  skarpt: PHILBERT fik varsel 1 (nille@…, 22 dage til slutdato, 20.000
  kr.), CARMA STUDIO fik varsel 2 på dag 0. Begge stemplet. CARMA har
  `varsel_2_sendt_at` og IKKE `varsel_1_sendt_at` — den sene beslutning
  sprang varsel 1 over, præcis som motoren lover (#680). `email_send_log`
  viser `pending` kl. 11:57:50–51 og `sent` kl. 11:57:53 for begge.
- **Tørkørslen fandt en fejl ingen test kunne have fanget.** Varsel 2's
  emne hed «Om en uge slutter dit år», men varslet sendes ved 7 dage
  ELLER FÆRRE — CARMA ville have fået «om en uge» på deres sidste dag.
  Nu tre trin (#697): dag 0 «i dag», dag 1 «i morgen», dag 2–7 datoen.
  Den slags ser man kun ved at læse den mail der faktisk ville gå ud,
  mod en rigtig række.
- **Leddene:** motor (#680), cron (#681), afsendelse og stempling (#695
  — `sendIndgangsMail` med `metadata.company_id`, stempel KUN ved lykket
  enqueue), bånd på medlemmets forside (#691, #692), forsidens linje til
  rådgiveren «Varslet er sendt — N dage til udløb» (#696, alvor 65 —
  under tærsklen med vilje: varslet er gået, det haster ikke længere) og
  mailene selv (#694). Hvert led er brugt af det næste.
- **LØST 7/9 kl. 14:51: cron-jobbet er planlagt.** `fornyelsesvarsler`,
  `0 11 * * *` UTC (13:00 dansk sommertid), aktivt — målt i `cron.job`:
  ellevte job, alene på klokkeslættet. SQL'en stod i cron'ens filhoved og
  blev kørt i hånden i SQL editoren, som huset gør med alle cron-jobs
  (vault-nøglen slås op live). Første kørsel 8/9 finder ingen forfaldne:
  PHILBERT og CARMA er stemplet. Næste rigtige afsendelse er PHILBERTs
  varsel 2 den 22/9 (slutdato 29/9), og den sker af sig selv.
- **Fornyelsens grænser flyttede sig én dag** som følge af #698
  (slutdatoen er nu den sidste dag MED adgang — DEL 2 «Slutdatoen»):
  «i dag» i varsel 2 er nu en dag man stadig kan logge ind, og
  tilbudsvinduets 14 dage regnes fra en dag senere.

**CARMA-SAGEN, 7/9 — en fejl vi selv lavede, rettet samme aften (#716).**
Skrevet som en fejl, ikke som en note, fordi den er den første rigtige
mail systemet har sendt, og den var forkert.

- **11:57** — `fornyelsesvarsel-cron` sendte varsel 2 til CARMA STUDIO
  (camilla@carmastudio.dk). Dag 0, sen beslutning, varsel 1 sprunget
  over. Vi fejrede det ovenfor som «kæden er hel».
- **16:33, målt:** CARMAs slutdato var 7/9. Ordningen træder i kraft
  10/9, og `afgoerFornyelsestilstand` returnerer `uden_for_ordningen`
  FØR beslutningen overhovedet læses (grænsen er «på eller før»,
  besluttet med #698: slutdatoen er den sidste dag med adgang, så
  præcis 10/9 har ingen dag at sende noget i). Konsekvens hele vejen
  ned: `hent-fornyelsestilbud` gav `{ tilbud: null }`,
  `opret-fornyelse-checkout` ville have svaret 403, og
  fornyelsesbåndet ville ikke være vist. **Vi sendte hende en mail med
  en knap der ikke virkede.**
- **Fejlen:** `afgoerForfaldentVarsel` dømte på beslutning og dage til
  slutdato. Den kaldte tilstandsmotoren — for at få dagene — men læste
  aldrig `status`. Den kendte ikke grænsen og spurgte aldrig. Motorens
  grænse var RIGTIG; dens egen kommentar siger hvorfor: «der er ingen
  dag at sende noget i». Det var afsenderen der ikke spurgte.
- **Rettet (#716):** varselsmotoren spørger nu tilstandsmotoren og tier
  når medlemmet ikke kan handle. KAN_HANDLE er valgt på KALDERNES gate
  frem for et skøn: `klar_til_tilbud` og `i_god_tid`, fordi det er dem
  `hent-fornyelsestilbud` (:122) og `opret-fornyelse-checkout` (:125)
  siger ja til før slutdatoen (`udloebet_tilbyd` ligger efter og fanges
  af «passeret»). `blokeret_af` bærer tilstanden i svaret, og cronen
  tæller `kan_ikke_handle` for sig med grunden i `sprunget_over_liste` —
  så «uden for ordningen» ikke drukner i «intet forfaldent».
  Abonnementsfelterne sendes stadig som null, og det er bevist rigtigt:
  til og med slutdagen er tier `full` uanset abonnement, og et varsel
  kan kun være forfaldent til og med slutdagen. Begge kopier identiske;
  CARMAs øjeblik (slutdato 7/9, nu 7/9 kl. 11:57) er låst som test og
  giver nu intet. Testankeret flyttede fra 1/9 til 1/10 — med grænsen
  ville slutdatoer 0–9 dage efter 1/9 aldrig få et varsel.
- **Og Camilla — besluttet af Jonas 7/9: hun SKAL kunne bruge sit
  link.** Slutdatoen flyttet 7/9 → 11/9 i prod kl. 18:23 (FØR-værdi:
  `2026-09-07`). Fire dage, over ikrafttrædelsen, så hun er i ordningen
  og linket virker. Hun får INGEN flere mails: begge varselsgrene kræver
  `varsel_2_sendt_at = null`, og hendes stempel fra 11:57 lukker dem
  begge — bevist i tørkørsel 18:26: `ville_sende 0`, `kan_ikke_handle
  0`. Konsekvens: hun får fire dages adgang mere end hun havde. Det er i
  hendes favør og ikke en fejl. Data siger nu noget andet end
  kontrakten — mangellisten bærer kortet.
- **Bevist på skærm 18:29:** «Fuldt til 11. sep. 2026», «Besluttet: vi
  tilbyder», «Påmindelse sendt · 7. sep.». Og set i samme billede:
  badget siger «Klar til tilbud», fordi `fornyelsesBadge` kun kender
  `varsel_1_sendt_at` — CARMA har kun varsel 2. Mangellisten.

**Beslutningen kan træffes fra virksomhedssiden (#707) — og skrives ét
sted (#709), 7/9 sidst på dagen.** Målt først: beslutningen kunne KUN
træffes i `FornyelsesSektion`, som er monteret ét sted, `Members.tsx` på
/members — og /members er ude af menuen (ruten lever, `App.tsx`). Hele
kæden — uden «tilbyd» sender cronen intet — hang på en URL skrevet i
hånden. Nu:

- **Aftalen-kortet** (VirksomhedView blok 7) kan sætte `tilbyd`, sætte
  `tilbyd_ikke` og FJERNE beslutningen. «Fjern» er ikke `tilbyd_ikke`:
  ingen række betyder «endnu ikke besluttet» (tabellens kontrakt,
  migration 20260811120000). Fornyelse-linjen står nu også UDEN række —
  «Ikke besluttet» — fordi det er den tilstand kæden hænger på, og
  handlingerne skal kunne nås dér. Ordene er `beslutningsOrd`; noten
  bevares ved skift og kan kun redigeres på /members.
- **Skrivevejen tjekker antal berørte rækker, ikke kun `error`:** en
  advisor-write der rammer nul rækker pga. RLS returnerer succes med
  tom data i Supabase. Efter bekræftet skrivning invalideres alle tre
  læsere af `company_fornyelse` (siden, forsidens dom, /members-listen —
  `invaliderFornyelsesLaesere`), og invalideringen AWAITES før toasten.
- **Samlet samme dag (#709):** `FornyelsesSektion` kalder nu de samme
  tre funktioner — `skrivFornyelsesbeslutning`, `skrivFornyelsesnote`,
  `sletFornyelsesbeslutning` i `src/hooks/useVirksomhed.ts` — så tabellen
  skrives ÉT sted, låst af `fornyelseSkrivevej.guard.test.ts` (prøvet
  ved forfalskning). `skrivFornyelsesnote` blev sin egen funktion: en ny
  note er ikke en ny beslutning, og `besluttet_af`/`besluttet_at` må
  ikke stemples om. Listens cache-patch er væk — sandheden hentes igen
  frem for at hver flade har sin egen udgave af rækken.

**Målt 6/9** (`~/Downloads/recon-fornyelsen-10-september.md`, uden for
repoet — genskabes hvis den bruges; fundene er bogført i
fornyelseskædens §10 og §13 og ordningens §5 og §7, som bærer detaljen):

- **Ordningen har ingen afsender.** Ingen mail, ingen skabelon, ingen
  cron, ingen kode bag §1's «brief før slutdato». Kæden er to menneskelige
  klik (rådgiverens «Tilbyd», medlemmets valg i gaten) og ét
  Stripe-event. Medlemmet hører først om sin fornyelse ved at MISTE
  adgangen og selv finde tilbuddet i `MembershipExpiredGate`
  (fornyelseskæden §13.1; ordningens §5 punkt 5). *Delvist ændret 7/9
  eftermiddag:* motoren (#680) og cron-rapporten (#681) findes og er
  tørkørt på rigtige data; mailene, rådgivernotifikationen, stemplingen
  og planlægningen af jobbet mangler («Bygget 7/9 eftermiddag» ovenfor).
  *Ændret igen 7/9 sen eftermiddag:* mailene, stemplingen og forsidens
  linje FINDES og er bevist i produktion (#694–#696, «Bevist i
  produktion» ovenfor); kun planlægningen af jobbet mangler.
- **10/9 er ikke en tændingsdato.** `FORNYELSE_IKRAFT_DATO` sammenlignes
  med virksomhedens `contract_end_date`, ikke med dags dato; efter 10/9
  kan ingen aktiv virksomhed have slutdato ≤ 10/9, så konstanten bliver
  virkningsløs. Intet kører den dag (§13.2).
- **Datogaten omgås hvor pengene skifter hænder.** *Delvist ændret 7/9:*
  `hent-fornyelsestilbud` kalder nu motoren (#678), men både den og
  `opret-fornyelse-checkout` kræver `udloebet_tilbyd`, som afgøres i
  udløbsgrenen FØR datogaten. En virksomhed «uden for ordningen» med
  beslutning `tilbyd` får stadig et systemtilbud de første 14 dage efter
  udløb. Værnet er et menneske (§13.3). Åbent.
- **Fjortendagesvinduet (besluttet 27/8) — BYGGET 7/9 (#678),** se
  «Bygget 7/9» ovenfor. Det tidligere fund («`udloebet_tilbyd` har ingen
  tidsgrænse») gælder ikke længere.
- **Kalenderen i prod** (fem beslutninger, 25 af 30 uden, to måneders hul
  efter 13/10, fjorten fornyelser marts–juni 2027) og **forudsætningerne**
  (seks migrationer kørt, ni priser, seks events, fire udrullede
  funktioner, ti cron-jobs uden fornyelse) står i §13.4–13.5. Den reelle
  deadline for en mailkæde er midten af november (Livja 16/12 minus 30
  dage), ikke 10/9 (DEL 3).
- **Retningen er besluttet 6/9** (ordningens §7): medlemmet hører om sin
  fornyelse fra systemet, i indgangens form. DEL 3 bærer rækken.

*Løst 6/9 (#667):* `handleSubscribe` i `MembershipExpiredGate` viste
`err.message` direkte til et medlem der lige havde mistet sin adgang. Nu
ordret samme neutrale besked som `handleFornyelse`, i samme form (én
streng, ingen description); fejlen logges med `console.error`.

### er_kunde — vores egen virksomhed er ikke en kunde (6/9, #666, #668)

**Feltet.** `companies.er_kunde boolean NOT NULL DEFAULT true`
(migration `20260906210000_companies_er_kunde.sql`). Falsk = vores egen
virksomhed, ikke en kunde. Topix.dk ApS
(`3ffccc0f-f6a9-4a23-9515-db2e22e8ad49`) er den eneste med `false`; 37 er
`true`. **Målt efter kørslen 6/9 kl. 21:18:** kolonne, kommentar, én
ikke-kunde, 37 kunder.

**Motoren.** `erKunde()` i `src/lib/raadgiverensKunder.ts`, ren funktion
med fire tests. **FAIL-OPEN:** kun eksplicit `false` betyder ikke-kunde;
`true`, `null` og `undefined` giver alle `true` — fordi en række hentet
uden kolonnen aldrig må forsvinde fra rådgiverens billede; et manglende
felt er ikke en beslutning.

**Læses tre steder, og kun der (#668):** `hentAdvisorDashboard`
(forsidens datalag), `VirksomhedslisteView` (/virksomheder) og
`Members.tsx` (/members, begge filtre). Rører IKKE virksomhedssiden (skal
kunne åbnes på direkte URL), chatten, de tre virksomhedsvælgere, nogen
edge function, nogen cron, nogen RLS. **Bevist på skærm 6/9 af Jonas:**
Topix er væk fra rådgiverfladerne.

**Hvorfor et nyt felt** (målt 6/9, `~/Downloads/recon-skjul-topix.md`,
uden for repoet): `is_legat` tager community, indhold, events og storage
fra medlemmet (`har_aktivt_medlemskab`); `status <> active` stopper
rapportpåmindelser, ugeagent og berigelse; `is_demo` filtrerer kun i én
restriktiv RLS-policy, som UNDTAGER admin — og jonas@topix.dk har både
advisor OG admin (målt), så den ville kun skjule for Morten. **Hvorfor
navnet:** en kendsgerning, ikke en virkning; «skjul» kan ikke svare på
om noget skal tælles som kunde.

**Målt i prod 6/9 kl. 21:00 — lukker fem åbne spørgsmål:**

- `is_demo = false` på ALLE 38 rækker. Den restriktive demo-policy fra
  3/9 filtrerer derfor INTET i dag; den er et sovende værn.
- jonas@topix.dk (`23e81de4-…`) har rollerne advisor OG admin.
  morten@molainvest.dk (`b4dcc529-…`) har advisor uden admin.
- Topix.dk ApS: `status = active`, `is_legat = false`,
  `vis_i_netvaerk = true`, kontrakt 2026-04-19 → 2030-04-20,
  `subscription_status` NULL, INGEN `company_betalingslink`-række (står
  derfor ikke i `IndgangsSektion`). kontakt@topix.dk (`dff1d372-…`) er
  owner, og medlemskontoen skal virke NØJAGTIG som i dag.

### Agentkæden — målt 6/9: ugeagenten kører LIVE, ikke tørt — og formentlig slet ikke

> **STATUS 13/9:** `run-weekly-agent` er SLETTET (#836; Jonas 11/9: «A»),
> så «kører LIVE» gælder ikke længere nogen ugekørsel — `weekly_cron`
> afvises nu med 400 i `run-company-agent`. Rapport- og anomali-triggerne
> står som før (DEL 2 «13. september» §16).

`~/Downloads/recon-agentens-skrivninger.md` (uden for repoet — genskabes
hvis den bruges). Anledningen var `er_kunde`: måtte feltet gate cronen?

- **`run-weekly-agent` sender `dry_run: false`.** `run-company-agent`
  skriver da LIVE i `weekly_focus`, `company_actions` og `milestones` —
  alle tre ser MEDLEMMET (Dit Boardroom og /milestones). Agenten kører
  altså IKKE tørt; kun tre kaldere er tørkørsler (`useAuth` onboarding,
  `AgentForslagPanel`, `ReportDebugView`), mens ugecronen og alle fire
  kald ved rapport-commit er live og går uden om godkendelseslaget.
  **DERFOR gater `er_kunde` ingen cron:** slukkes agenten for en
  virksomhed, ændres medlemmets hverdag.
- `run-company-agent` sender ingen mail, skriver ingen
  `notifications`-række, og `write_chat_message` + `notify_advisor` er
  blokeret for alle seks triggere. Godkendelseslaget
  (`agent-forslag-afgoer`) kan KUN godkende `update_weekly_focus`; alt
  andet kan kun forkastes.
- **~~To mandagsjobs skriver begge `company_actions`~~ — RETTET 10/9: kun
  ét gør.** `generate-weekly-focus` 06:00 UTC (`source_type ai_weekly`)
  kører og har kørt seks uger i træk. `run-weekly-agent` 07:00
  (`source_type agent`) har aldrig kørt — kun `Deno.cron`, ingen
  `Deno.serve`, nul `weekly_cron` i `agent_runs` (målt i prod 10/9
  kl. 21:08). Valget om den står som ÅBENT PUNKT i afsnittet «Ugefokus
  og ugeagenten» nedenfor.
- **`run-weekly-agent` har KUN `Deno.cron` og står IKKE i prods
  `cron.job`** (målt 6/9: ti jobs, ingen af dem den — listen står i
  fornyelseskædens §13.5). Repoet dokumenterer selv at `Deno.cron` aldrig
  eksekverer på Supabases edge-runtime (DEL 4). Ugeagenten kører altså
  formentlig slet ikke. Ikke efterprøvet ud over `cron.job` (DEL 3).

**Målt 6/9 kl. 22:18 — hvad «N agentforslag venter» dækker over.**
Otte uafgjorte forslag i prod, på TO virksomheder: Topix.dk ApS (6) og
remm. (2). Forsiden viser nu 2, fordi `er_kunde` filtrerer Topix fra —
overleveringen sagde 8 den 4/9 (afsnittet «Forsiden — fra KØ til
OPGAVE»). Det er et ANDET bevis på skærm for #668, målt på et tal ingen
kiggede efter. Alle otte er fra 25. august og alle fra TØRKØRSLER
(`report_committed` og `company_review`). Fordelingen på værktøj: fire
`update_weekly_focus` (kan godkendes), fire der KUN kan forkastes — tre
`write_session_prep` og ét `write_company_action`. Bemærk:
`write_session_prep` optræder i rækkerne, men stod ikke i
SKRIVE_TOOLS-listen i `recon-agentens-skrivninger.md` — værktøjssættet
har ændret sig siden 25/8, eller reconens liste var ufuldstændig. Ikke
afklaret.

**Puklen taber virksomheden på vej til fladen** (målt 6/9): linjen «N
agentforslag venter på din afgørelse» linker til `/virksomheder` uden
filter (`RaadgiverForsideView.tsx:197`), så rådgiveren selv skal lede.
Forslag kan KUN afgøres i `AgentForslagPanel`, monteret alene på
`/virksomhed/:companyId` (`VirksomhedView.tsx:330`). Dommen kender
virksomhederne bag puklen og kaster dem væk i linket. Mangellisten
bærer kortet.

**FÆLDE, målt 6/9 — LUKKET 7/9 (#688): godkendelse skriver INDEVÆRENDE
uges nøgle.** `agent-forslag-afgoer` kalder `skrivUgensFokus`
(`_shared/agentSkriveveje.ts:34`), som upserter `weekly_focus` på
(`company_id`, `getISOWeekKey(new Date())`). Godkendes et forslag fra
25. august i dag, får medlemmet et «ugens fokus»-kort dateret DENNE uge,
skrevet ud fra augusts tal. Forslag havde ingen udløbsmekanik. *Lukket af
udløbsdommen nedenfor: et forslag kan kun godkendes i sin egen ISO-uge,
så det kan ikke længere lande forkert. Mangellistens kort er slettet.*

**Puklen talte døde forslag — rettet 7/9 (#682).** Linjen «N
agentforslag venter på din afgørelse» filtrerede på `decided_at is
null`. Men en `expired`-række har OGSÅ `decided_at = NULL` — fire
`write_session_prep`-forslag blev sat i hånden 1/9, da evnen blev fjernet
(`docs/status-1-september.md`) — og `AgentForslagPanel` viser kun
knapper for `proposed`. Rådgiveren klikkede ind på noget der ikke kunne
afgøres. Filtret er nu på `status` begge steder (`AdvisorDashboard` og
`useVirksomhed`; det andet havde samme fejl). Et driftværn låser
kildeteksten, og værnet er PRØVET: forfalskes filtret, fejler netop den
fils tests. **Bevist på skærm 7/9:** forsiden siger nu «1 agentforslag
venter», ikke 2. Fælden står i DEL 4.

**Forslag udløber (#688),** udrullet 7/9 kl. 09:31 UTC fra `f7f77627`.
**Besluttet af Jonas: et forslag udløber når dets egen ISO-uge er
passeret.** HVORFOR UGEN og ikke 7×24 timer: den eneste godkendbare
skrivevej, `update_weekly_focus`, skriver UGENS fokus med GODKENDELSENS
ugenøgle — et forslag fra en anden uge er ikke bare gammelt, det er om
en anden uge end den det ville lande i. Med ISO-ugen er «kan det
godkendes» og «hvor lander det» det samme spørgsmål. Ren funktion
(`afgoerForslagsgyldighed`) i begge kopier (`src/lib/forslagUdloeb.ts`,
`_shared/forslagUdloeb.ts`), paritetstestet, grænsen låst fra begge
sider (søndag 23:59:59 gyldigt, mandag 00:00:00 udløbet). Ulæseligt
`proposed_at` er fail-closed. `agent-forslag-afgoer` afviser en
GODKENDELSE med 409; en FORKASTELSE er stadig mulig. Dommen ligger før
service-rollen, og rækken røres ikke — status `expired` skrives ikke.
Fladen (`AgentForslagPanel`) bruger SAMME dom. **Bevist på skærm 7/9
kl. 11:31 hos remm.:** knapperne væk, badget «Udløbet», og grunden
skrevet ud — «forslaget er fra 2026-W35; en godkendelse ville lande i
2026-W37 — forslaget kan kun forkastes». **Anledningen, som skal stå:**
forslaget fra 25/8 handlede om «Budget for Januar 2025 … din reelle
forventning til den kommende periode». Godkendt i uge 37 ville det være
blevet medlemmets fokus DENNE uge. **Tidszone, arvet og ikke indført
her:** `getISOWeekKey` læser LOKALE datokomponenter. Deno kører UTC,
browseren i brugerens zone — tæt på midnat søndag/mandag kan de være
uenige med op til to timer. Afgørelsen i Deno er den bindende. Står som
fælde i DEL 4.

**Puklen tæller ikke udløbne — LØST 7/9 (#689).** Besluttet af Jonas
7/9: udløbne forslag skal væk fra forsiden. Puklen hedder «venter på din
afgørelse», og oprydning er ikke en afgørelse. Dommen kan ikke udtrykkes
i SQL uden at duplikere ISO-ugen, så den filtreres i JS efter hentningen
— forsidens pukkel (`AdvisorDashboard`) og virksomhedssidens signal
(`useVirksomhed`), begge med samme `afgoerForslagsgyldighed`. **Hele
kæden er dermed bevist:** motoren, afgørelsen og fladen (#688), puklen og
signalet (#689) — på skærm 7/9 kl. 11:31 hos remm.: knapper væk, badge
«Udløbet», grunden skrevet ud.

**Ingen cron bogfører `expired`.** Skemaets egen kommentar forudser den
(`20260825200000_agent_proposals.sql:10`: «expired (cron-dom, ikke
bygget endnu)»), men ingen kode sætter status. De fire fra 1/9 blev sat
i hånden. **Konsekvens efter puklen ovenfor:** et udløbet forslag
forsvinder fra forsiden, men ligger som `proposed` i databasen. Cron'en
er en selvstændig opgave, og den SKAL bruge `afgoerForslagsgyldighed`,
så der er én dom — ikke en SQL-kopi af ISO-ugen. Mangellisten bærer
kortet.

### Opgave-modellen — målt 7/9: cronen virker, aktive opgaver udløber aldrig, under ti procent svarer

`~/Downloads/recon-opgavers-udloeb.md` (uden for repoet — genskabes hvis
den bruges). Anledningen var forsiden: en opgave med «Fristen var 4.
september», tre dage forfalden, med knapperne Gjort / Ikke endnu / Drop
den — lige efter at vi havde bygget en udløbsdom for agentforslag (#688).

**Opgave-udløbs-cronen VIRKER — og det var værd at måle.** Målt i prod
7/9 kl. 12:40: 31 forslag stod som `proposed` med `expires_at` i
fortiden, og `opgave-udloeb` havde kørt kl. 04:00 med `UPDATE 0` seks
dage i træk. Det lignede en fejl. **Det var det ikke.** Prods kommando er
ORDRET migrationens (`20260901090000`), og alle 31 udløb ligger mellem
06:00:05 og 06:02:05 SAMME dag — alle `ai_weekly`, altså mandagens
ugefokus-forslag født 24/8 kl. 06:00 (`generate-weekly-focus`, 0 6 \* \*
1) med fjorten dages levetid. Cronen kører kl. 04:00, to timer FØR de
udløber, og rydder dem i nat. **Konsekvensen der skal stå:** et
`ai_weekly`-forslag lever altid fjorten dage PLUS tyve timer, fordi det
fødes kl. 06 og ryddes kl. 04. Ikke skadeligt — men «forslag lever
fjorten dage» er ikke sandt, hvis det nogensinde skrives på en flade
eller i en mail. Står som fælde i DEL 4.

**Aktive opgaver udløber ALDRIG.** «Fristen var …» er KUN en tekst
(`lib/hjemmebane/aftaler.ts`, `fristTekst`: `due_date < i dag`). Der er
ingen cron, ingen status, ingen kolonne der siger forfalden — opgaven
bliver stående på forsiden til nogen trykker Gjort, Ikke endnu eller Drop
den, uden øvre grænse. Migrationen 22/8 forudså det selv
(`20260822220000_opgave_model_kolonner.sql:52-53`): «de to kommende
cron-job: udløb af forslag (B8) og forfald af aktive opgaver (B2)». Det
første blev bygget 1/9; det andet findes ikke, og indekset
`idx_company_actions_due` står ubrugt. Rådgiveren SER det: forsidens dom
giver «Opgaven «…» forfaldt for N dage siden» (alvor 75), men
virksomhedssidens bullet «N opgaver venter på svar» tæller kun `proposed`
og `open`. **I dag rammer det præcis ÉN virksomhed i hele produktionen —
Topix' egen,** tre dage forfalden. Det er en beslutning, ikke en brand.
Mangellisten bærer kortet.

**Tre udløbsformer i huset, som fund:** agentforslag på en KALENDERUGE
(dømt i kode, `afgoerForslagsgyldighed`, ikke bogført i databasen);
opgaveforslag på et TIDSSTEMPEL 14–30 dage efter oprettelsen
(`beregnUdloeb`, dømt både i kode — `erUdloebet`, `filtrerUdloebneForslag`
— og af cronen, bogført som `expired`); aktive opgaver på INGENTING.
Tidszonen følger med: uge og dag dømmes på lokale komponenter,
tidsstemplet i UTC. Hører til opgave-model-epic'et (DEL 3). Mangellisten
bærer kortet.

**Tallet der siger mest om opgave-modellen som produkt, målt 7/9:** 97
forslag i alt — 10 gjorte, 63 udløbne, 7 afviste, 1 aktiv. Medlemmerne
svarer på under ti procent af det systemet foreslår. Ikke en fejl i koden
— et produktspørgsmål, og det hører i epic'et. Mangellisten bærer kortet.

### Indgangen — kæden FØR platformen er hel 3/9: «Godkendt» → betalingsmail → påmindelser → dag 31-faktura → betaling → adgang

`docs/indgangen-design.md` §1–31 (§22–31 er dagens bogføring).

| led | fil | status |
|---|---|---|
| Monday «Godkendt» → virksomhed, prisniveau, token | `monday-webhook`, `_shared/mondayAnsoegning.ts`, `_shared/virksomhedsOprettelse.ts` | bygget; dedup på `monday_item_id`; e_mail-fejlen rettet (kolonnen hedder `email`) |
| dag 0-mail / rådgivermail | `_shared/indgangsBetalingsmail.ts`, `send-indgangs-betalingsmail` (Bucket B, kun manuelle kald) | bygget; kræver secret `RAADGIVER_MAIL_TIL` |
| udløser 2: rådgiver sætter pris | `saet-indgangs-prisniveau` (Bucket A) + `IndgangsSektion` på /members | bygget og bevist 2/9 |
| /betal, checkout, webhook | `Betal.tsx`, `hent_betalingstilbud`, `hent_betalingsdata_til_checkout`, `opret-indgangs-checkout`, indgangsgrenen i `stripe-webhook` (kontrakt, indgangspris, ophør, invitation) | bevist 2/9 med en gennemført betaling |
| påmindelser dag 14/25/31 | `indgangs-paamindelser-cron` (tørkørsel som standard) | bygget; **cron-jobbet `indgangs-paamindelser` planlagt 3/9 (0 10 \* \* \*), aktivt**; springet bevist (dag 31 uden dag 14 først) |
| dag 31-faktura + betaling | `_shared/indgangsFaktura.ts` (motor, #559), cronen kalder den FØR dag 31-mailen (#561), `invoice.paid`-gren i `stripe-webhook` (#561), migration 20260903130000 (kørt 3/9) | **bevist i drift 3/9 kl. 10:00–10:11 på FLOOR1**: faktura TBR-0003 med moms (adressen fra #560 kom med), markeret betalt uden for Stripe → periode `'faktura'`, kontraktdatoer, invitation; kreditnota bagefter. `invoice.paid` tilmeldt formiddag (fem events; sjette, `invoice.payment_failed`, kom eftermiddag med #572; `invoice.created` bevidst ikke) |
| motoren | `src/lib/betalingsfrist.ts` + spejl | fristen er KONTRAKTENS: 30 dage fra underskriften (rettet 2/9, migration 20260902140000) |
| værn mod dobbeltbetaling | `_shared/checkoutSession.ts` i alle fire checkout-funktioner | bygget: udløb forrige session, 30 min levetid, id gemt |

Seks migrationer fra 2/9 skal være kørt i SQL editoren for at kæden
holder: `20260902140000` (frist fra underskrift), `150000`
(sidste_checkout_session), `160000` (monday_item_id), `170000`
(velkomstvideo_set_at), `180000` (velkomstvideo_guid), `190000`
(lookup_invite email+kontakt). **Alt er kørt og verificeret: målt 2/9
kl. 19:46 i Lovable SQL editor gav de elleve tjek nedenfor alle `true`.**
SQL'en beholdes, så den kan køres igen efter en genskabelse:

```sql
select 'company_betalingslink findes' as sektion,
       to_regclass('public.company_betalingslink') is not null as ok
union all select 'monday_item_id på linkrækken',
       exists (select 1 from information_schema.columns
               where table_name = 'company_betalingslink' and column_name = 'monday_item_id')
union all select 'sidste_checkout_session_id på company_betalingslink',
       exists (select 1 from information_schema.columns
               where table_name = 'company_betalingslink' and column_name = 'sidste_checkout_session_id')
union all select 'sidste_checkout_session_id på companies',
       exists (select 1 from information_schema.columns
               where table_name = 'companies' and column_name = 'sidste_checkout_session_id')
union all select 'vis_i_netvaerk på companies',
       exists (select 1 from information_schema.columns
               where table_name = 'companies' and column_name = 'vis_i_netvaerk')
union all select 'velkomstvideo_set_at på profiles',
       exists (select 1 from information_schema.columns
               where table_name = 'profiles' and column_name = 'velkomstvideo_set_at')
union all select 'velkomstvideo_guid i app_config',
       exists (select 1 from public.app_config where config_key = 'velkomstvideo_guid')
union all select 'hent_betalingstilbud findes',
       to_regprocedure('public.hent_betalingstilbud(uuid)') is not null
union all select 'hent_betalingsdata_til_checkout findes',
       to_regprocedure('public.hent_betalingsdata_til_checkout(uuid)') is not null
union all select 'lookup_invite_company_info giver email',
       pg_get_functiondef('public.lookup_invite_company_info(uuid)'::regprocedure) like '%''email''%'
union all select 'hent_betalingstilbud regner fra underskrevet_at',
       pg_get_functiondef('public.hent_betalingstilbud(uuid)'::regprocedure) like '%underskrevet_at%';
```

Kendte huller (recon-indgangen-fuld 2/9, ikke rettet): /members'
«Send invitation»-knap kan invitere en ubetalt virksomhed (adgang uden
betaling); en «tidligere»-virksomhed genbrugt på CVR sidder fast som
«betalt»; «enqueued» stemples som «sendt». *Løst 3/9:* dag 31-mailen
lovede en faktura ingen sendte — nu sendes fakturaen først (§30).
*Nyt 3/9:* `sikrIndgangsInvitation` kender ikke «allerede accepteret»
(DEL 3).

**MÅLT I PROD 7/9 — INDGANGENS KÆDE HAR ALDRIG HAFT EN VIRKSOMHED.**
NUL rækker i `company_betalingslink`. Fem mails,
`indgangs-paamindelser`-cronen der kører hver dag kl. 10, fakturaen på
dag 31 — og ingen at sende til. Cronen finder ingenting, hver dag. Det
er ikke det samme som at kæden virker: FLOOR1-beviset 3/9 var en
gennemført enkeltkørsel, ikke drift, og rækken er væk. Det står i skarp
kontrast til fornyelsen, som ER bevist i drift i dag med rigtige mails
til rigtige mennesker. Konsekvens: fejl i indgangens tekster rammer nul
mennesker i dag — men de rammer den FØRSTE virksomhed der bruger
indgangen.

**Fakturateksten er usand i ti timer — IKKE RETTET, og det er målt
hvorfor (7/9).** `Betal.tsx` siger «Vi har sendt en faktura på det
fulde beløb» ud fra `status === "frist_overskredet"`, som SQL'en regner
af DAGE siden underskrift (> 30), mens cronen først sender fakturaen kl.
10:00 på dag 31 — fra midnat til ti siger vi at vi har sendt noget vi
ikke har sendt. Stemplet findes: `company_betalingslink.faktura_sendt_at`
(migration 20260903130000). Men `hent_betalingstilbud` returnerer det
ikke — målt ordret i prod: `status`, `virksomhed`, `prisniveau_oere`,
`frist`, `dage_tilbage` — og funktionens kommentar siger udtrykkeligt
«aldrig andet». At rette teksten kræver en ændring i en SECURITY
DEFINER-funktion (FORBIDDEN uden grønt lys). Den mindste sande tekst med
det der ER i svaret: «Fristen udløb {frist}. Du får en faktura på det
fulde beløb …» — den påstår ingen afsendelse. Kortet står i mangellisten.

### Migrationen af abonnementerne — pilot gennemført, 13 venter

`docs/migration-recon-1-september.md` §1–25. 14 skal flyttes (ikke 18).
Piloten doggybed er flyttet 2/9 (`sub_1UB6wE3CvBmCx5Ptq3hHp2vt`, første
faktura 13/9 på 4.375 kr.). **Besluttet 2/9: de tretten andre venter til
trækket 13/9 er bevist gået igennem** — derefter i portioner. YKRG kan
ikke flyttes før kortet virker (§7). Piloten bærer `company_id` i
metadata (§22); listen over UUID'er for de tretten næste er ikke lavet
(§16, præciseret 3/9). **Fundet 3/9 (§26, #563):** abonnementet bærer
`art = "migreret"`, og webhookens subscription-grene sprang kun over ved
indgang/fornyelse — trækket 13/9 ville have skrevet `subscription_status
= active` på doggybed, og 13/10 kl. 00:00–08:35 UTC ville tier blive
`subscriber` (usynlig i FornyelsesSektion, intet fornyelsestilbud, 403
på checkout). Rettet til hvidliste: kun det art-løse selvbetjenings-
abonnement skriver. Adgangen var aldrig i fare (tier læser
`contract_end_date` først). **Lukket 3/9 kl. 10:42 (§26):** skrivningen
fra 2/9 udeblev ikke fordi eventet manglede — `customer.subscription.created`
BLEV leveret, og webhooken svarede 500 (skrivningen kastede); Stripe
gentog fem gange. Efter #563 blev eventet gensendt manuelt og svarede
200 `skipped: migreret_subscription` («Recovered») — hvidlisten er
dermed bevist på det rigtige event, og webhooken får subscription-
events. Hvad der kastede i skrivningen, afdækkes bevidst ikke (grenen
når aldrig derhen igen for et abonnement med en art); det art-løse
selvbetjeningsabonnement går stadig gennem den kode, og der findes ingen
i dag.

### Onboarding-tjeklisten — bygget 2/9

`src/lib/onboardingTjekliste.ts` (motor, 21 tests), `useOnboardingTjekliste`,
`HbOnboardingTjekliste` monteret i `HbMemberShell` (19 filer bruger shellen), «Kom
godt i gang» i sidebaren. Seks punkter når der er velkomstvideo, fem uden
(«vi viser ikke tomt indhold»). Velkomstvideoen sættes i `/admin/config`
(`app_config.velkomstvideo_guid`) og indlejres via `get-video-embed`
`{ velkomst: true }` — ingen content_items-række. Settings, Milestones og
PulseCheckin er AppLayout og har ikke boksen (accepteret).
Recon: `~/Downloads/recon-onboarding-tjekliste.md`, `recon-velkomstvideo.md`.
**Siden 2/9 nat er tjeklisten også forsidens fokuskilde** (trin 8–9,
#546/#547): så længe den ikke er færdig, viser «Dit næste skridt» dens
ikke-gjorte punkter i stedet for (a)–(i), og hilsenen siger «Velkommen».
Pillen står stadig ved siden af — ikke afgjort (indgangen-overhaling §10).

### Adgangsrejsen — RUTEN ER FÆRDIG 3/9 formiddag: trin 5–13 bevist i drift, 1–4 bygget

`docs/indgangsfladen-design.md` (design §1–8, 2/9 nat; tillæg §9–13,
2/9 aften) og `~/Downloads/recon-adgangsrejsen.md` (designet holdt op
mod koden, med de syv trin i rækkefølge og hvad der kan gå galt).
Bygget (#537) og **bevist i drift 2/9 kl. 20:30 på Two Socks' rigtige
invitation** (§9): `lookup_invite_company_info` giver `email` + `kontakt`
(migration 20260902190000), og /auth forudfylder mail (låst) og navn
(redigerbart) fra invitationen. Datahul fundet samme aften:
`contact_person` var tomt på 35 af 39 virksomheder, fordi kun
monday-webhookens «Godkendt»-gren skriver det; tre er rettet med Monday
som kilde, 32 står tomme (`docs/indgangen-design.md` §32). Invitationer
har ingen udløbsmekanik, og en invitation er ikke nødvendigvis
medlemmets egen adgang (§13). **Resten er designet som ét epic i
`docs/indgangen-overhaling.md`** (2/9 aften): målet er to skærme
(signup → Dit Boardroom); mailbekræftelsen slås fra; Onboarding-porten
pensioneres (agentens stempel skal flyttes først); ankomsten står selv
uden video; branchen udledes af CVR via en ny ren motor; de dårlige
dage (skelet uden udgang, dødt token, indlogget browser) får Hb-flader;
rækkefølgen i dets §9. **Bevist 2/9 aften/nat, trin 5–9:** mail-
bekræftelsen slået fra (kl. 21:56); agentens betingelse rettet og
bevist med `onboarded_at` NULL (#544, kl. 20:53); Onboarding-porten
pensioneret (#545, kl. 23:03 — seks skærme blev til tre: signup,
spinner, forside); ankomstens motor (#546, 21 nye tests) og flade
(#547, kl. 23:20: «Velkommen, Jonas.» + første tjeklistepunkt som
fokus, ikke «Upload dine august-tal»). `profiles.onboarded_at` skrives
ikke længere af ruten; kolonnen står som historik. **Hele Auth-fladen
er Hjemmebane, 2/9 nat (trin 11–12):** signup som delt skærm med de to
rådgiverportrætter i den nye `HbRaadgiverPortraetter` (#549), login
rolig uden portrætter, nulstil, «Tjek din mail», «Konto oprettet»
(#550), `HbSpinner` i stedet for de tre grønne spinnere og `AuthRoute`s
null, ResetPassword og 404, feltklasser i `hjemmebane/hbFormKlasser.ts`
(#551). Google er fjernet fra signup og findes kun på login — besluttet,
fordi Google-vejen ikke bærer invitationstokenet (§3); den rigtige
løsning er at koble Google på bagefter (§10). Jonas bekræftede login,
signup og nulstil på skærm. **Det grønne blink efter login er væk, 3/9
morgen (trin 13, #554):** `useAuth` sætter `loading = true` ved
overgangen ingen-session → session (en `useRef`, ikke `user` fra
closure) og nulstiller markøren når sessionen forsvinder. Betingelsen
er bevidst overgangen og IKKE `_event === "SIGNED_IN"`, fordi auth-js
udsender SIGNED_IN ved faneskift, cross-tab broadcast, re-auth ved
kodeordsskift og hard reload — et `loading = true` dér ville afmontere
hele rute-træet midt i en handling. Bevist af Jonas 3/9 i alle fire
scenarier. **Blindgyden er lukket, 3/9 formiddag (trin 10, #557):**
Index viste `DashboardSkeleton` i `AppLayout` når tier var null for en
ikke-rådgiver — mørkegrønt, uden grænse, uden besked, uden knap. Nu
vises `CompanyLinkFailedGate` straks. Ingen timeout, og det er
besluttet: efter #554 er tier null aldrig en ventetilstand (hænger et
opslag, holder `loading` porten og HbSpinner vises — Index tegnes
ikke); tegnes siden med tier null, er opslaget afgjort, og der er intet
at vente på. Den tredje vej ind i skelettet (PPI-succes satte aldrig
tier) er lukket i `useAuth` med `afgoerMedlemsTier`, samme regel som
trin D. Bevist kl. 08:53 med en fremkaldt tilstand: `company_members`-
rækken for `jonas+test3` slettet → gaten «Vi mangler et led, Jonas»,
ikke skelettet; rækken rullet tilbage med oprindeligt id. *Metoden er
værd at huske:* en blindgyde kan fremkaldes billigt på en testbruger
der alligevel skal slettes. **RUTEN ER FÆRDIG:** trin 5–13 bevist i
drift, trin 1–4 bygget (udestående bevis for trin 4, se afsnittet
nedenfor). Fra invitationslink til Dit Boardroom: to skærme, Hjemmebane
hele vejen, en ankomst der tager imod, og ingen tilstand hvor et medlem
kan stå fast uden en vej videre. Uden for ruten, stadig åbent: §7.2–7.4
og §7.7, de tre `valueCards` uden hjem, pillens rolle i ankomsten,
velkomst-punktet uden knap i kortet (skal løses før `velkomstvideo_guid`
sættes), Google-kobling som kontoindstilling. (`DashboardSkeleton` er
fjernet, #571.)
Målt 2/9 i prod: `handle_new_user` er IKKE fail-closed på
`email_confirmed_at` og afviser signup uden invitation med P0001;
rådgivergrenen kommer først. CLAUDE.md er rettet (#537).

### Branchemotoren — trin 1–4 bygget og deployet 3/9; ét bevis udestår

`docs/indgangen-overhaling.md` §6 og §9 trin 1–4. Ren motor
`udledBranchekode` i `src/lib/branchekode.ts` (#553): opslag seks →
fire → tre → to cifre, tabel med begrundelse pr. række, 113 tests.
`INDUSTRY_OPTIONS` er flyttet fra `Settings.tsx` til `src/lib/brancher.ts`,
så motoren og Settings deler én kilde til labels — **bevist i prod 3/9
formiddag** (branche-vælgeren virker efter Update-klik, værdien læses
korrekt). Besluttet 3/9 (Jonas): motoren sætter `industry_code`;
`industry_label` KUN hvor feltet ellers ville være tomt (input, så
CVR-tekst, så motorens label); rammer mappingen ikke, står begge felter
tomme, og der sættes ALDRIG `other_general`. **Registret er DB25, ikke
DB07** — CVR skiftede 1/1 2025; §6 er rettet 3/9, motoren er bygget mod
DB25 (fixture fra Danmarks Statistik). **Trin 3–4 (#556):**
`byggVirksomhedsRaekke` oversætter CVR-koden ved oprettelse (ikke ved
genbrug på CVR); motor og taksonomi spejlet til `_shared/`, paritetstest
kører alle 738 underklasser gennem begge kopier; `virksomhedsraekke` har
nu én import, og importstien er den eneste tilladte forskel mellem
kopierne. `monday-webhook` og `import-application` deployet 3/9 via
build-chat (401 uden autorisation, ikke 404). **Udestående bevis:** at
en ny virksomhed faktisk får `industry_code` sat — 401 beviser kun at
funktionen svarer. Kommer ved næste rigtige «Godkendt» eller «Importér
ansøgning». Branchedataene i prod er rettet 3/9 kl. 11:50–12:00 med
engangs-berigelsen `berig-virksomheder` (#567): 29 af 30 aktive har nu
kode og label, ingen registerkoder tilbage; adresse på 26 af 30,
kontakt-email på 30 af 30 (§10). Otte uenigheder mellem CVR og
platformen er bevidst ikke rørt — én samtale (§10).

### Rådgiverfladen — medlemsskiftet løst og bevist 3/9; fladen kortlagt, overhalingen er et epic

`docs/hjemmebane/konvergens.md` §2.2-noten 3/9 og §2.9. **Medlemsskiftet
(#573):** en rådgiver kunne SÆTTE company-override fra fire Hb-flader
(Rapportering, KPI'er, Budget, Handouts via `HbAdvisorCompanyPrompt`),
men ikke RYDDE det fra nogen af dem — HbMemberShell kendte hverken
`isCompanyOverride` eller `clearCompanyOverride`. Værst: «Dit Boardroom»
viste MEDLEMMETS forside, fordi `companyId` var sat, så Index sprang
rådgivergrenen over. De eneste veje ud var tilfældige: tre nav-punkter
til gamle AppLayout-sider hvor banneret dukker op (/milestones, /chat,
/settings), adresselinjen, eller en genindlæsning der taber valget.
Rettet med `HbVisningSom`: en sticky linje øverst i indholdskolonnen,
«Du ser {virksomhed} · Tilbage til dig selv». Dommen er en ren funktion
i `src/lib/hjemmebane/visningSom.ts` med AppLayout-bannerets betingelse
ORDRET (`isCompanyOverride && !viewingAsMember && isAdvisor`) — «se som
medlem» er en anden ting og udelukker linjen, som den altid har gjort.
Samme adfærd som banneret: `clearCompanyOverride()` + `navigate("/")`.
Samme komponent løser HbAdminShell, hvis tilbage-link ellers landede på
medlemmets forside. Override-mekanikken i useAuth er URØRT. **Bevist på
skærm af Jonas 3/9 kl. 13:26:** «Du ser Booking Innovation · Tilbage til
dig selv» på Rapportering, og linket virker. *Observation, ikke fejl:*
sidebaren viser MEDLEMMETS navigation mens man er inde i en anden
virksomhed — ingen vej til /members herfra ud over linjen; åbent punkt
hvis det klemmer.

**Fladen er kortlagt 3/9** (`~/Downloads/recon-raadgiverfladen.md` —
uden for repoet, genskabes hvis den bruges). Jonas' ord: «uoverskueligt
at være rådgiver fordi data og admin indstillinger ligger hulter til
bulter», «rådgiverplatformen er simpelthen forfærdelig». Målt: af elleve
administrative områder er KUN TRE i Hjemmebane — indhold/Akademiet
(/admin/indhold med ugens-video, redaktionelt, evergreen, boardroom-push),
events og partnere. Gamle: e-mails, e-mail-log, feedback, legat,
platformconfig, import (to steder), review queue, agent-forslag,
rådgiver-notifikationer, rådgiverforvaltning. «Medlemmer» findes BEGGE
steder (bevidst dobbelthed, konvergens §2.2-noten): /members i gammelt
design bærer Indgangen, Fornyelsesbeslutninger, virksomhedsrækkerne og
afventende invitationer; /admin/indhold/fremdrift er Hb. Hele Hb-admin'en
nås KUN ved at kende URL'en. Det løbende rådgiverarbejde — chat,
rapport-review, agent-forslag, fornyelser, indgang, medlemsoverblik —
ligger næsten alt i gammelt design. **Overhalingen er et EPIC, ikke en
opgaveliste** (DEL 3): på størrelse med indgangen (to dage), og den
starter med en designsamtale om gruppering, ikke med kode.

### Community — opslagsmail, escaping, vægt på forsiden og medlemssporet: bygget og bevist 3/9 eftermiddag

`docs/community-design.md` (nyt 3/9). Målt i prod 3/9: seks tråde, to
svar, 26 med adgang; det vigtigste tal er visningerne — det mest sete
opslag er set af FIRE ud af 26. Folk svarer ikke fordi de aldrig ser
opslagene.

| led | fil | status |
|---|---|---|
| opslagsmail til alle med adgang (#576) | `notify-community-opslag` (Bucket A), gren i `send-notification-email`, `_shared/opslagsMail.ts` | **BEVIST I DRIFT 3/9 kl. 14:39 — ved andet forsøg.** Første forsøg kl. 14:30 gav nul notifikationer og en TOM function-log: browseren kørte den gamle CommunityView (kaldet kom med #576). Efter hard reload: 27 notifikationer, mailen landede i Jonas' medlemskonto med portræt, uddrag og knap. Modtagerdommen genbrugt fra nævnelsen (`get_community_medlemmer`); mailen bygges af tråden via `reference_id`; skjult tråd → ingen mail (community-design §4) |
| **escaping i mailkæden (#576) — står selv om resten forsvinder** | `_shared/htmlEscape.ts`, `send-notification-email` begge render-stier, guard-test | title/body blev lagt ind som rå HTML; trådtitel, broadcast og aflysningsbegrundelse er brugerskrevet. Rettet for alle typer |
| «Fra fællesskabet» med vægt (#577) | `forsideOpslag.ts`, `uddrag.ts`, `FremhaevetOpslag` i `BoardroomView` | nyeste OPRETTEDE opslag som hovedhistorie-kort med portræt, uddrag, billede; ingen ny forespørgsel |
| «Præsentér dig selv» | `member_profiles` (`ask_me_about`, `working_on`), tjeklistens «Din profil» | FINDES allerede — Netværket er præsentationen (community-design §7); et nyt tjeklistepunkt ville være en dublet |
| medlemmerne i Community (#579) | `communityMedlemmer.ts` (rene domme), `CommunityMedlemmer.tsx`, `CommunityView.tsx` | BYGGET OG SET 3/9: alle medlemmer (ikke rådgivere) fra Netværkets data → /medlemmer/{id}; dem med `ask_me_about` først, alfabetisk i hver gruppe, ingen skjules; den indloggede øverst med egen tekst eller opfordringen. Ingen ny datamodel, ingen ny RPC (community-design §8) |

### Månedstrækkene — bygget, udrullet og bogført 3/9 eftermiddag; bevis 13/9

`docs/indgangen-design.md` §31 (løsningen øverst). Indtil 3/9
eftermiddag fandtes ingen registrering af at rate 2–12 blev betalt, og
et fejlet træk var usynligt uden for Stripe. **#572:** tabellen
`company_traek` — ét spor pr. abonnementsfaktura (status
`betalt`/`fejlet`, beløb, tidspunkter, forsøg, næste forsøg, Stripes
fejlkode og -besked, fakturanummer og -link); `stripe_invoice_id` er
UNIK, så et senere event opdaterer samme række og en fejlet rate der
betales bliver `betalt` af sig selv. Grene i `stripe-webhook` for
`invoice.paid` (abonnementsfakturaer) og `invoice.payment_failed`;
faktura → virksomhed via abonnementets metadata i både ny og gammel
API-form; kaster aldrig. Logik i `_shared/abonnementstraek.ts`.
**Alle tre manuelle skridt er gjort 3/9:** migration
`20260903150000` kørt i prod (verificeret: 23 kolonner, RLS, to
policies, kommentar — men først ved anden kørsel; den første tog kun
`CREATE TABLE` fra et afkortet uddrag), `stripe-webhook` deployet via
build-chat, og `invoice.payment_failed` tilmeldt endpointet, som nu
har SEKS events (uafhængig GET). **#574:** badge i `chart-warning` på
virksomhedsrækken på /members ved siden af den grønne kontraktbadge
(med vilje: kontrakten løber, OG et træk er fejlet), udfoldet med
beløb, tidspunkt, Stripes forklaring, forsøg, næste forsøg og
fakturalink; kun de fejlede hentes. Update-klik gjort. **Adgang er
urørt.** Restancepolitikken (`past_due` = åben, `unpaid` = lukket) er
besluttet og IKKE bygget — den rører `computeMembershipTier` i tre
spejle plus fornyelsesmotoren, og en fejl dér lukker et betalende
medlem ude. Naturlig næste opgave. **Bevis udestår 13/9** (DEL 3).

### Slutdatoen er den sidste dag med adgang — rettet 7/9 (#698 kode, #699 SQL, migration kørt kl. 14:26)

Før 7/9 var slutdatoen EKSKLUSIV i koden og INKLUSIV i sproget.
`computeMembershipTier` og de to SQL-domme regnede `contract_end_date`
som første dag UDEN adgang, så et medlem mistede adgangen ved
UTC-midnat — kl. 02 dansk tid — NATTEN FØR sin egen slutdato, mens
varselsmails, fornyelsesbåndet og kvitteringen sagde «slutter i dag».
Kontrakten sagde én dag, adgangen gav en anden.

- **To lag skulle flytte sig SAMMEN:** `computeMembershipTier` i begge
  kopier (`src/lib/membershipTier.ts`, `_shared/membershipTier.ts`,
  paritetstestet, #698) og de to SECURITY DEFINER-funktioner
  `har_aktivt_medlemskab` og `is_membership_active` (#699, migration
  kørt i prod 7/9 kl. 14:26). Kun det ene lag ville have givet en ÅBEN
  skal med LUKKET community — værre end at være helt ude, for medlemmet
  kan logge ind og se dørene lukkede. Derfor blev SQL'en kørt i samme
  time som koden blev rullet.
- **Rækkevidden, målt:** `har_aktivt_medlemskab` gater 14 RLS-policies
  plus én storage-policy; `is_membership_active` kaldes af tre
  DEFINER-funktioner (`get_member_directory`, `get_event_participants`,
  `get_event_non_responders`). Sessionens tidszone er UTC, så
  `contract_end_date + 1 > now()` er præcis samme grænse som
  TypeScript-reglen — ingen dansk-tid-forskydning imellem lagene.
- **Målt FØR:** CARMA STUDIO (slutdato = dagen) `false`/`false` i de to
  SQL-domme. **Målt EFTER:** CARMA `true`/`true`, Studio Mini (udløbet
  5/9) stadig `false`, PHILBERT `true`. Ændringen ramte præcis én
  virksomhed og gav dem den dag de havde betalt for.
- **Konsekvens for fornyelsen:** grænserne flyttede sig én dag (DEL 2
  «Fornyelseskæden»). `docs/adgangsdomme.md` bærer reglen; de tre
  SQL-domme rettes stadig i hånden med en migration — kun de to
  TypeScript-kopier har en paritetstest.

### Adgangsdommene — kortlagt 3/9 aften

*7/9: slutdatoen er nu INKLUSIV i alle fem domme — afsnittet ovenfor.*


`docs/adgangsdomme.md`. Adgang og tier afgøres **fem steder, ikke tre**:
`computeMembershipTier` i to TypeScript-kopier, og SQL-funktionerne
`is_membership_active` (fail-open), `har_aktivt_medlemskab` (læser kun
`contract_end_date`; bærer community, indhold, events, storage) og
`har_aktivt_abonnement` (læser kun abonnementet). Kun de to
TypeScript-kopier er dækket af en paritetstest; **de to SQL-domme der
styrer indhold har ingen.** Hele repoet sammenligner
`subscription_status` med præcis strengen `active` og intet andet.
Målt i prod 3/9 kl. 20:32: **`subscription_status` er NULL på alle 38
virksomheder**; de tre SQL-funktioner matcher migrationsfilerne;
`company_traek` har 0 rækker. Restancepolitikken er udskudt på det
grundlag (DEL 3). Filhovederne i begge `membershipTier.ts` og CLAUDE.md
peger nu på dokumentet (#583).

### Rådgiverfladen — designet er låst 3/9 aften

`docs/raadgiverfladen-design.md` (#584, #586) og `docs/emneliste.md`
(#587). Kort: **fire rådgiverflader mod atten ruter** i dag — forside
(Dit Boardroom med alt der venter), indbakke (`/chat`),
virksomhedsliste (Virksomheder) og virksomhedsside — plus
platformdriften som egen blok under admin. Rådgiveren får medlemmets
menu. **Én vej ind til en virksomhed mod fire**: siden nøgles på
`companyId` (`/virksomhed/:companyId`), ikke `user_id`, fordi
virksomheden er en aftale og medlemmet en adgang — og fordi tre
virksomheder uden medlemmer i dag ikke kan åbnes. **Syv blokke**: hvad
skal du vide nu (ren automatik), deres ord og din forberedelse,
emnerne I har talt om, chatten, tallene, aktivitet, aftalen. Chatten
flytter ind på virksomhedssiden i fuld højde; `/chat` bliver stående
som bevidst dublet til de travle morgener. **Emne-opsamlingen** giver
chatten hukommelse: hver besked klassificeres mod ni faste emner
(udledt af 55 læste medlemsbeskeder, `docs/emneliste.md`), og formen
MÅLES før den bygges — holder målingen ikke, står opgave-historikken
som opsamling. C8 i `docs/chat-design.md` er delvist omgjort for det.
**Ingen kode er skrevet endnu.** Det der mangler før kode står i
designets §10 (DEL 3).

### Rådgiverfladen — listen og virksomhedssiden HEL 4/9 formiddag (#603, #605, #607, #611–#616, #619, #621, #624); owner-rollen og margin-M/M rettet (#620, #622, #623)

Rækkefølgen fra designets §11 er fulgt: motor før flade, én kilde før
to aftagere, de billige forudsætninger før de dyre ombygninger. Punkt 1
(én kilde til tallene, #604) står i DEL 3. Derefter tre flader:

- **#603 admin-blokken i Hb-menuen.** Rådgiveren havde ingen vej til
  admin fra en Hjemmebane-flade: nul menupunkter pegede på
  `/admin/indhold`, og `/admin/import` havde intet link i `src`
  overhovedet. Nu to punkter — Virksomheder, og Platform med otte
  underpunkter — hægtet på BEGGE nav-grene. `HbNavEntry` fik et
  additivt `admin`-felt. Punkterne peger på AppLayout-sider, så
  designsproget skifter ved klik; det er et bevidst valg, ikke en
  forglemmelse.
- **#605 den rene virksomhedsliste** på `/virksomheder`, ny Hb-flade;
  den gamle på `/members` står urørt indtil swappet. Præcis de syv
  felter fra designets §3.6. To definitioner besluttet 4/9: «sidste
  kontakt» = `conversations.last_message_at` (samme kilde som forsidens
  køer); «sidste rapportering» = seneste committede periode i
  `financial_report_facts`, ikke seneste upload. Rækken linker til
  `/members/:userId` indtil virksomhedssiden findes.
- **#607 virksomhedssiden, etape 1** på `/virksomhed/:companyId`.
  **Datalaget er VENDT:** `useVirksomhed` slår alt op fra `companies.id`
  og udad i ét `Promise.all`; intet er gated på et `user_id`-opslag. De
  tre virksomheder uden medlemmer kan åbnes for første gang. Blok 1
  bruger motoren (#589) og kan endelig udfylde `senesteBeskedAt` og
  `agentforslagVenter`, som MemberDetail sendte som null og 0. Blok 7
  bygges fra `/members`-listens data. Visning, ingen handlinger.

**Anden halvdel af formiddagen — siden fik resten af blokkene og
handlingerne:**

- **#611 etape 2:** blok 5 (Tallene) og blok 6 (Aktivitet).
  data_basis-kontrakten er overholdt: estimater mærkes, og når M/M ikke
  kan beregnes, FORKLARER fladen hvorfor («en af de to seneste perioder
  er et estimat»). Akademi er IKKE med: `member_progress` er nøglet på
  `user_id` alene uden `company_id` — målt, ikke gættet.
- **#612 blok 2:** refleksionen i rådgiverens rækkefølge (største
  udfordring først, så «søger hjælp til», så hvad gik godt), ansøgningen
  foldet sammen bag «Vis» indtil AI-sammenfatningen findes (§4 blok 2),
  sessionsforberedelsen bag en knap — aldrig ved sidevisning.
- **#613 fire handlinger monteret**, ingen af komponenterne ændret:
  `AgentForslagPanel` i blok 1, `AdvisorAIChat` og forecast i blok 5,
  `EditCompanyDialog` i blok 7 (kun admin). Én fælde løst:
  `EditCompanyDialog` lukker sig selv FØR den kalder `onSaved`, så
  lukningen holdes tilbage i en microtask indtil hookens invalidering er
  færdig (DEL 4-fælden om `void invalidateQueries`).
- **#614 blok 4:** `CompanyChatPane` fik en VALGFRI prop
  `laastTilCompanyId`. Målt: komponenten havde ingen props, og den eneste
  vej til én virksomhed var rådgiverens globale company-override.
  Prop'en er additiv, så `/chat` er uændret. Målt: alle 35 virksomheder
  med en samtale har præcis én.
- **#615 listelinket** skiftet til `/virksomhed/:companyId`. Alle rækker
  kan nu klikkes — også de tre uden medlemmer, som før var døde. Og
  `company_members`-hentningen forsvandt fra listen: ét netværkskald
  mindre.
- **#616 rapportarbejdet:** hele rapportlisten med badges (Committed,
  Afventer godkendelse, Indtast manuelt, Behandles, Fejl, «Rettet»),
  udfoldning med tal fra facts via `source_report_id` (ingen nye
  talstier hentes), «Godkend rapport →» og rapport-kommentarer med ordret
  samme `messages`-insert og `notifyChatMessage` som MemberDetail.
  Kommentarerne hentes i samme `Promise.all` via
  `conversations!inner(company_id)`. Pilene ▲▼ er ink, ikke rust — et
  fald er et tal, ikke en afvigelse; afvigelser dømmes i blok 1 og 5.

**Formiddagens sidste otte PR'er — siden er hel, og to fejl fundet
undervejs er rettet:**

- **#619 de to sidste handlinger og deep-links.** «Åbn handout» i
  læse-tilstand via `HandoutDetail` med rækkens ejer, ellers første
  medlem — ingen ændring i HandoutDetail eller handoutEngine; knappen er
  skjult uden medlem. «Fjern medlem» pr. medlem i blok 7, gated af
  `maaFjerneMedlem`, med en dialog der siger sandheden: den sletter
  brugeren fra platformen, ikke bare medlemskabet; `invalider` awaites
  før lukning. Siden læser `?reportId`, `?handout` og `?section` som
  MemberDetail, med ankrene `section-reports/-milestones/-handouts` og
  `report-<id>` — forudsætningen for viderestillingen.
- **#624 de fem sidste visninger:** grafen «Finansiel udvikling» med
  budget-overlay (estimerede perioder prikket, som NoegletalView),
  `DeliveryOverview`, samtalestatus med «Tildelt: {rådgiver}»,
  sparklines og `section-session`-ankeret. **MemberDetail kan
  pensioneres** — alt hvad den viser og gør, findes nu på
  `/virksomhed/:companyId`. Kun blok 3 (emnerne) mangler, og den venter
  på klassificeringen (§11 punkt 7).
- **#621 kontaktperson = ejeren.** Kolonnen i listen viser nu OWNERENS
  navn, ellers `contact_person`. Målt 4/9 kl. 10:23: `contact_person`
  var udfyldt på 4 af 30, mens en owner med navn fandtes på 27; de to
  kilder overlappede ét sted (PHILBERT). Owner-navnet er det medlemmet
  selv har skrevet — den bedre kilde.
- **#620, #622 owner-rollen — hullet er lukket i koden.** Ni
  virksomheder uden owner blev rettet i data kl. 10:17 (DEL 3), men
  reconen (`~/Downloads/recon-owner-rollen.md`) viste at KUN ÉN vej i
  koden gav owner: signup hvor invitationen IKKE bar et `company_id`
  (ny virksomhed). Alle andre — inklusive den nuværende indgang
  (Monday → betaling → `sikrIndgangsInvitation` MED `company_id`) —
  skrev `member`. Næste virksomhed gennem døren ville have fået et
  første medlem uden owner igen. **Rettet i `handle_new_user` (#622,
  grønt lys givet; funktionen står på FORBIDDEN-listen):** i grenen med
  `company_id` bliver rollen `owner` når virksomheden ingen
  `company_members`-rækker har i forvejen, ellers `member`. ÉN ændring,
  alt andet ordret. Besluttet (Jonas): rettelsen ligger i funktionens
  egen gren, ikke i en trigger der ville skrive `owner` oven i et
  `member` koden lige har skrevet — usynligt og lyver. **Migrationen
  `20260904110000_handle_new_user_foerste_medlem_owner.sql` er kørt i
  prod 4/9 kl. 10:33 og verificeret:** betingelsen er inde i
  `pg_get_functiondef`, triggeren `on_auth_user_created` er intakt
  (`enabled: O`), rollefordelingen uændret (35 owner, 3 member). **Bevis
  i drift udestår** — det kræver en rigtig signup på en invitation med
  `company_id`; fire pending ligger klar. Tre andre veje
  (`process-pending-invitation`, `attach-user-to-company`,
  legat-vejene) kan stadig give et første medlem uden owner; de er
  sjældne, menneskekaldte og ikke på FORBIDDEN-listen — rettes med samme
  betingelse senere (står i migrationens kommentar).
- **#623 M/M for marginer i procentpoint.** Set på skærm kl. 10:25:
  «RESULTAT MARGIN 35,4 % · +7996,4 % M/M». `deriveKpiMetrics` brugte
  den relative formel `(nu − før) / |før| × 100` for alle seks nøgler,
  også marginerne, hvor begge værdier selv er procenttal — forrige
  margin var ca. 0,44 %. Nu regnes beløb relativt og procent-KPI'er i
  PROCENTPOINT (`nu − før`, vist «+15.6 pp»), og `changeArt` gør formen
  eksplicit. Selve margin-formlen er rigtig og urørt — Topix' 96,9 %
  er korrekt for en konsulentvirksomhed uden vareforbrug, Florens
  45,7 % for engroshandel. `pctChange` og motorens `pctAendring` regner
  på beløb og er urørt. `deriveKpiMetrics` havde INGEN tests; den har
  nu seksten. **Åbent, ikke rettet:** «mål 60 %» for DB-margin er
  `KPI_FALLBACK_TARGETS`, ikke et mål nogen har sat — ét fælles
  fallback-mål dømmer engros som «under» uanset branche; et
  branchespecifikt eller fraværende fallback er en beslutning. *Ændret
  7/9:* standardmål MARKERES nu på skærmen (oprindelsen som valgfrit
  felt på værdien — DEL 2 «De tavse fejl»); tallene selv står stadig
  åbne, og fire af de seks er absolutte kronebeløb (DEL 3).

**BEVIST PÅ SKÆRM 4/9 kl. 09:47–09:50:** `/virksomheder` viser alle 30
virksomheder med de syv felter. Kontaktperson er tom for 26 af 30 — kun
Monday-webhookens «Godkendt»-gren skriver `contact_person`; kolonnen er
rigtig, men næsten tom. `/virksomhed/:companyId` virker for Floren
Engros (fuld) OG for Two Socks (uden medlemmer, uden samtale, uden tal):
Two Socks tegner sig helt igennem med rolige tomme tilstande, og «Har
aldrig skrevet» står øverst i blok 1 — det signal der er uopnåeligt på
forsiden (pending-gaten). `company_perioder` er tom for begge, også for
en virksomhed med kontrakt til 2027: tabellen kom med fornyelseskæden
1/9, så kun de der er gået gennem den nye indgang har rækker. Blokken
siger sandheden.

**Status på de ni handlinger MemberDetail har** (målt 4/9,
`~/Downloads/recon-memberdetail-rest.md`): alle ni er på plads efter
#613, #616 og #619; de fem sidste visninger kom med #624. Blok 3
(emnerne) venter på klassificeringen (§11 punkt 7). **MemberDetail er
tom for enestående indhold og kan viderestille.**

**MÅLT 4/9 — det der afgør at swappet DELES:** `Members.tsx` er ENESTE
montering af `IndgangsSektion`, `FornyelsesSektion`, Legatforløb-listen
og `MembersAdminSection`. Fornyelsesordningen træder i kraft 10/9, og
`FornyelsesSektion` er det eneste sted en fornyelsesbeslutning
registreres. *Ændret 7/9 (#707):* Aftalen-kortet på virksomhedssiden
kan nu sætte og fjerne beslutningen ad samme skrivevej (#709); noten
kan stadig kun redigeres på /members. **`/members` kan derfor IKKE
swappes, før §11 punkt 6 (forsiden) har givet indgange og fornyelser et
hjem.**
`/members/:userId` kan derimod viderestille nu. En rådgivermail
(`_shared/indgangsMail.ts:251`) og en test peger på `/members`, fordi
IndgangsSektion bor der — de følger med, når den flytter.

**MÅLT I PROD 4/9 kl. 09:54 — deep-links, og det afgør swappet.**
`notifications` med `deep_link like '/members/%'`: 978 i alt —
`report_uploaded` 524, `report_committed` 382, `handout_completed` 40,
`pulse_checkin_received` 26, `milestone_completed` 6. Formerne: 604 med
`?reportId`, 40 med `?handout`, 6 med `?section`, 328 uden parameter.
**Sidste 30 dage: 150** — `report_uploaded` 76, `report_committed` 62,
`pulse_checkin_received` 12; tre typer sendt så sent som 3/9.
`handout_completed` og `milestone_completed` er ikke sendt siden 10.–15.
juni; om de er holdt op med at udløse, eller der bare intet er sket, kan
ikke afgøres herfra. **KONSEKVENS:** `/members/:userId` kan IKKE bare
forsvinde — se DEL 3.

### Forsiden — fra KØ til OPGAVE, 4/9 eftermiddag (#630–#639); dommen BEVIST på skærm kl. 13:04 — syv linjer mod 38 rækker

- **#630 køerne — bygget, set og forkastet.** `/forside` blev bygget som
  designets syv køer og set på skærm 4/9 kl. 11:35: **38 rækker, hvoraf
  16 sagde «ingen dialog i N dage» og intet andet.** Jonas: «ekstremt
  lang, mega uoverskuelig, tæt på ubrugelig». Fejlen var ikke mængden
  af data, men at en kø viser alt der matcher en betingelse, mens en
  rådgiver om morgenen har brug for at vide hvad han skal gøre.
- **#631 designet skrevet om fra bunden** (`docs/forsiden-design.md`).
  Skiftet er fra KØ til OPGAVE — **en virksomhed, en grund og en
  handling.** Otte slags fra fire kilder (aftalen, samtalen, tallene,
  deres arbejde). **Hændelse, tilstand og pukkel skilles ad** — det var
  dem der blev blandet i køerne: en hændelse er noget der skete, en
  tilstand er noget der er, en pukkel er mange af det samme. To porte
  (alvor og vindue), én sortering, samling pr. virksomhed.
- **#632 opgave-modellen som ét epic** (DEL 3). 64 proposed, 63 expired,
  10 done. Årsagen er modellens eget design: tre forslag pr. virksomhed
  hver mandag, ét vises ad gangen, ingen besked. **VIGTIG RETTELSE:** de
  63 er arven fra FØR modellen, lukket manuelt 31/8 — cron'en har intet
  lukket endnu, første bølge udløber 7/9. Beviset for cron'en kommer om
  tre dage.
- **#633 `/forside` mærket RÅMATERIALE** i koden (filhovedet i
  `RaadgiverForsideView.tsx` og `Forside.tsx`), så ingen tror køerne var
  meningen. Fladen virker stadig og genbruger datalaget; det er
  visningen der skiftes ud.
- **#634 tærsklen er 70.** Ikke et nyt tal: både `VirksomhedView` og
  `RaadgiverForsideView` farver rust ved `alvor >= 70`; fladen sagde
  «vigtigt» ved 70 før dommen fandtes. **Målt samtidig: motoren har
  alvor for kun to og en halv af de otte slags** — tavshed og «stikker
  ud» fuldt, ulæste som et antal; fornyelse og indgang giver tilstand og
  dagtal uden alvor; rapporteringsfejl, opgave nær deadline og
  handout/refleksion har intet. Dommen skal derfor tildele alvor til
  nye slags (`docs/forsiden-design.md` §12).
- **#635 dommen** — `src/lib/forsidensDom.ts`, 36 tests. Ren funktion,
  ingen I/O, «nu» som parameter (samme form som motoren #589). Seks af
  otte slags; de to AI-baserede har plads i typen men ingen
  implementering, låst af en test, så de ikke kan glide ind uden en
  beslutning.
- **#637 forsiden viser dommen.** `/forside` tegner dommens linjer i
  stedet for køerne. Motorerne køres i `hentAdvisorDashboard`s `queryFn`
  — fornyelsesbeslutninger, betalingslink og aktive opgaver med frist
  hentes dér, hvor alt andet hentes — og dommen tager deres UDFALD, ikke
  deres råstof. Grunden følger med i klikket
  (`/virksomhed/:companyId?grund=<slags>`), så kontrakten til «derfor er
  du her» (§6) findes; virksomhedssiden læser den ikke endnu. **En fælde
  løst undervejs:** `company_actions.due_date` er en date-kolonne og skal
  læses som LOKAL kalenderdag (`new Date(aar, md - 1, dag)`), ikke som
  UTC-midnat — ellers skrider fristen en dag vest for Greenwich. **Og en
  fejl fundet i #630:** de to sidste svar i `queryFn`s `Promise.all` stod
  byttet om (`goalHandoutRes` fik agent_proposals-rækkerne og omvendt);
  rettet i samme greb.
- **BEVIST PÅ SKÆRM 4/9 kl. 13:04 — dagens vigtigste måling.** Dommen gav
  **syv linjer**, hvor køerne gav 38 rækker. Hver linje bar en
  virksomhed, en grund og en handling som VERBUM: «Skriv til Topix.dk om
  Afslut handout for bogholderi», «Send tilbuddet til PHILBERT», «Svar
  Booking Innovation», «Tag det op med Floren Engros». **Floren Engros
  stod ÉN gang med tre grunde** (omsætningsfald, ulæst besked, 22 dages
  tavshed), hvor den før fyldte tre steder. **De femten tavse blev én
  linje.** Puklen stod under stregen som «8 agentforslag venter på din
  afgørelse». Målingen på fladen: tærskel 70, syv linjer over stregen,
  femten samlet i tilstande, **NUL under tærsklen — ingen faldt ud.**
  Tærsklen 70 var et bud; nu er den målt. **PHILBERT er værd at nævne:**
  beslutningen ER truffet («tilbyd»), men tilbuddet er ikke sendt — så
  den står som en opgave med handlingen «Send tilbuddet», ikke som en
  beslutning der mangler.
- **#638 køerne fjernet** fra forsiden; 124 linjer væk. Filhovedet siger
  nu hvad fladen ER og bærer historikken om hvorfor (køerne var første
  udgave; fejlen var at en kø viser alt der matcher en betingelse).
  `hentAdvisorDashboard`s `buckets` er urørt — den gamle forside på «/»
  bruger dem til swappet.
- **#639 chatten ruller ikke længere hele siden.** Målt: `scrollIntoView`
  ruller ALLE scrollbare forfædre. På `/chat` er der én container; på
  virksomhedssiden er der TO — beskedlisten og Hb-skallens
  indholdskolonne — og blok 4 ligger midt i den. Derfor rullede hele
  siden sig ned ved hver ændring i `messages`: første indlæsning, hver
  realtime-besked, pin, redigering, sletning. Rettet med `scrollTop` på
  listen selv, som per definition ikke kan røre forfædrene. `smooth` er
  fjernet, fordi en glidende rulning under indlæsning kæmper mod at
  listen stadig vokser. Billederne var IKKE årsagen — alle fem `<img>`
  sidder i wrappere med fast højde. Og i låst tilstand rulles der ikke
  ved første indlæsning: man kommer til virksomhedssiden for at læse
  blok 1. DEL 4 bærer fælden.

**To beslutninger fra designsamtalen, som er principielle:**

- **AI må tilføje, aldrig fjerne.** En analyse kan råbe op om noget
  harmløst — det ser du og fravælger. Den kan tie om noget alvorligt —
  det ser du ALDRIG. Derfor giver en ny refleksion ALTID en opgave;
  AI'en afgør kun om den står øverst. Målt: refleksioner koster 3–7
  linjer om måneden, så reglen er gratis.
- **Læring på signaltype, ikke på virksomhed.** «Ikke relevant» gemmes
  med signaltype, virksomhed og tidspunkt. En signaltype der
  systematisk fravælges er en fejl i dommen og rettes i KODEN. En motor
  der lærer at tie om en bestemt virksomhed, bliver blind netop der hvor
  det er ubehageligt — og reglen fra 3/9 er at ingen må glemmes.

### Konverteringen — Milestones etape 2 og ALLE OTTE admin-sider, 4/9 eftermiddag og aften (#644–#649, #651, #653, #654); forsiden ind på roden (#650); rådgiverens chat i tre trin (#655, #657, #658) — RÅDGIVERENS HVERDAG ER HJEMMEBANE HELE VEJEN

Beslutningen fra samme eftermiddag (DEL 3, «det gamle design
KONVERTERES, ikke flyttes») blev gennemført i ét stræk. Mønsteret er nu
bevist syv gange og går hurtigere for hver: tynd side i `src/pages/`
der monterer `HbMemberShell`, fladen som view under
`src/components/hjemmebane/admin/views/`, felter i `HbField`-familien,
lister som grid-listen fra `VirksomhedslisteView`, liste-plus-detalje
som `HbAdminSplit`, bekræftelser inline i `DeleteSpec`-formen, ingen
Radix-portaler. Skallen kræver et `active`-nav-punkt, og Platform-
punkterne har bevidst intet; hver side sender derfor en værdi der ikke
matcher noget, med en kommentar — menuen blev ikke rørt.

**#644 Milestones etape 2 — de fire portaler bygget om.** Ny primitiv
`HbOverlejring` (`src/components/hjemmebane/milestones/HbOverlejring.tsx`)
i skallens eget DOM-træ. Huset havde ingen: de to overlejringer der
fandtes (sidebar-drawer, velkomst) er ad hoc og fanger hverken fokus
eller Escape. Det Radix gav gratis er genskabt EKSPLICIT og
dokumenteret i filhovedet: fokusfangst med Tab-cyklus, Escape,
overlay-klik der IKKE lukker advarselsdialogen, fokus tilbage til det
der åbnede. Escape-lagdelingen kører i capture-fasen, så datovælgeren
lukker uden at tage dialogen med. Ikke genskabt: scroll-låsen på body —
Hb-skallen scroller indholdskolonnen, så låsen ville alligevel ikke
virke. Primitiven ligger i `milestones/` fordi etape 2 ikke måtte røre
andet; den kan løftes til `hjemmebane/` den dag en anden flade skal
bruge den.

**De seks admin-sider,** i den rækkefølge de blev taget (letteste
først, målt i `~/Downloads/recon-admin-omkostning.md`, uden for
repoet): #645 Legat (377 linjer, nul portaler — `HbAdminSplit`,
fremdriften pr. handout i `StateDot`-formen), #646 e-mail-log (311 →
21 + view; grid-listen med seks kolonner, native selects, paginering i
ny form), #647 Review Queue, #648 Platformconfig, #649 Import, #651
Feedback (fem portaler → `HbAdminSplit`, inline slet, `title` i stedet
for Tooltip, ét listen med «Løst»-fold i stedet for to tabeller,
screenshot med reserveret plads så intet flytter sig når det lander).

**Tre af dem bar en beslutning, som skal huskes:**

- **Review Queue (#647):** konverteringen begyndte med at afgøre HVAD
  siden er — en flag-liste over rapporter med pipeline-problemer, ikke
  et godkendelsessted (godkendelsen bor i `ReportReviewDialog`). Ni
  kolonner blev til fire i rækken plus en dæmpet metalinje med
  pipeline-diagnosen: den er BAG flagene, ikke det man leder efter. De
  ni rå tailwind-farver blev IKKE oversat én til én — rust for det der
  er galt, sage for det der er en note. **Ordet siger hvad flaget er;
  tonen siger kun om det er en fejl.**
- **Platformconfig (#648):** rådgiverlisten fik plads øverst, fordi
  siden er det ENESTE sted i platformen hvor man kan invitere og fjerne
  rådgivere og skifte admin-rollen — `manage-advisor` invite/remove/
  toggle-admin har ingen anden kalder. I den gamle lå den gemt mellem
  indstillinger. Tre dele er markeret som uden læser i drift
  (branding-navn, Performance Score, Møde) men BEHOLDT: om de skal væk
  er en beslutning, ikke en konvertering.
- **Import (#649):** bruger nu rapporteringsfladens Hb-zone
  (`HbReportUploadZone`) i stedet for `FileUploadZone` (963 linjer).
  Afgjort ved ORDRET sammenligning: `adminMode` gør reelt kun én ting —
  springer notifikationen over — og den gamle side sendte aldrig
  `conversationId`, så notifikationen kunne ikke udløses der uanset.
  Hb-zonen med `conversationId={null}` er identisk.

**#650 forsiden ind på roden.** Rådgiveren lander nu i det nye.
`/forside` viderestiller til `/`. `AdvisorDashboard` bliver stående,
fordi `hentAdvisorDashboard` bor der — men dens JSX er uden aftager, og
det står i filhovedet.

**#653 ReportDebug og #654 EmailTemplates — de sidste to.** Dermed er
ALLE OTTE gamle admin-sider konverteret på cirka to timer. To former
manglede helt i huset og er bygget undervejs, begge markeret så de kan
løftes til `hjemmebane/`: **foldbare sektioner med JSON-blokke**
(ReportDebug — native `<details>`, ikke Radix Collapsible; mono på
papir, ruller i sig selv) og **faner** (EmailTemplates — `HbSegmented`
var nærmest og bærer fane-linjen over ét panel). I EmailTemplates er den
gamle `RichTextEditor` monteret UÆNDRET og markeret, som Milestones'
portaler i etape 1: Hb-editorens Link-extension ville smide `data-cta`-
attributterne og `text-align` væk ved parse, så en eksisterende CTA-knap
blev til et almindeligt link ved næste gem — tab af data i mails, ikke
bare af knapper. Fladen skal stadig GENTÆNKES (DEL 3, «DESIGNPUNKT»);
udtrykket er konverteret, så den sidste gamle admin-side er væk.

**#655 rådgiverens chat, etape 1.** Udtrykket skulle ikke opfindes:
`MemberChatPane` er 965 linjer ren Hjemmebane og en ORDRET kopi af
`CompanyChatPane` med rådgiverdelene slettet — filhovedet siger at
skeletterne er bevidst dublerede, så medlemssiden kunne designes frit.
Klasserne er kopieret derfra. De seks delte byggesten fik
`variant="hb"`, som rådgiveren sendte 0 af 8 mulige steder, selv om
komponenterne allerede kunne det. `TOPIC_COLORS` er off-token og
droppet.

**#657 rådgiverens chat, etape 2 — sidebaren, «Se tal»-skuffen og
⋯-menuen.** Efter etape 2 er der INGEN `glass-card`, `bg-card`,
`text-foreground` eller `border-border` tilbage i `CompanyChatPane`.
Samtalelisten er husets listeform: papir, hairlines, søgefelt i
`hbControlClasses` som virksomhedslisten, grupper som eyebrow med
tælleren som `HbTag`. «Kræver svar» er rust, **«Tjek ind» er blæk hvor
den før var amber — en påmindelse er ikke en fejl.** Samme princip som
Review Queue: tonen siger kun om noget haster. Skuffen beholder
vaul-Draweren, så overlay og swipe er som før, og får `theme-hjemmebane`
på indholdet — samme greb som `MobileMessageActionDrawer`; `KPICard` er
erstattet af en kopi af virksomhedssidens kort uden sparkline, og dommen
(`getTargetStatus`) er den samme. ⋯-menuen er ikke længere en Radix
Popover, men en lokal `HbMenu` i DOM-træet: `HbPopover` (i
`HbOverlejring`) er venstre-forankret og bygget til datovælgeren under
et felt, mens ⋯ står i headerens højre kant. **En `align`-prop på
`HbPopover` ville gøre `HbMenu` overflødig** — det står i koden som gæld.

**#658 `/chat` har fået Hjemmebane-skallen.** Chatten var konverteret,
men siden lå stadig i `AppLayout`, så det papirfarvede panel stod i den
mørke skal med den gamle menu ved siden. Rådgiverens gren bruger nu
`HbMemberShell` som de tre andre grene i `ChatShell`; medlemmets og
abonnentens er urørte. Højden følger virksomhedssidens blok 4, som
allerede havde løst en chat i bundet højde inde i en skal der selv
scroller. `scrollTop`-fixet fra #639 holder — det virker netop fordi det
ikke rører forfædre. Og gælden fra etape 2 er betalt: «Indbakke»-
overskriftens egen `theme-hjemmebane` er væk, fordi hele siden nu er Hb.

**STATUS VED DAGENS SLUTNING 4/9: rådgiverens hverdag er Hjemmebane hele
vejen** — forsiden (#650), virksomhedslisten (#605), virksomhedssiden
(#607–#624), chatten (#655, #657, #658), Milestones (#643, #644) og alle
otte admin-sider (#645–#649, #651, #653, #654).

**Det der står tilbage, som åbne punkter (DEL 3 bærer hver sin række):**

- `/members` kan ikke swappes — elleve dele findes kun dér.
- `EmailTemplates` skal designes, ikke konverteres.
- Milestones' FUNKTION afventer opgave-modellen; kun udtrykket er gjort.
- Forsidens dom mangler de to AI-baserede slags (§8's AI-læsning).
- Ingen af de otte admin-sider er set på skærm.
- `align`-prop på `HbPopover`, så `HbMenu` kan udgå.

**Menuen** er målt samme aften, og `/members` er målt igen sent på
aftenen — begge står i DEL 3.

### Alina-sagen — en sletteanmodning der lå 103 dage; slettet i prod 8/9 kl. 09:57-10:08

**Forløbet.** 2. juni 2026 kl. 19:28 trykkede Alina Beauty & Skincare
(kontrakt 29/5-2025 til 29/5-2026, `status = 'tidligere'` siden 2/9) «Ja,
slet min data» i `MembershipExpiredGate`. Knappen gjorde to ting: den
skrev `companies.offboarding_requested_at` (`src/components/MembershipExpiredGate.tsx:123-131`),
og den viste hende teksten «Vi har modtaget din anmodning om sletning af
data. Jonas kontakter dig inden for 2 hverdage for at bekræfte.»
(`:141-144`). Kolonnen læses INGEN steder — grep i `src` og
`supabase/functions` uden `types.ts` finder kun den ene skrivning. Ingen
notifikation, ingen cron, ingen rådgiverflade. Samme dag var hendes
sidste login.

Anmodningen blev fundet 8/9 kl. 08:33, 103 dage senere, under reconen om
tidligere medlemmers data (`~/Downloads/recon-tidligere-medlemmers-data.md`
§4, SQL 7d — «Offboarding-anmodninger — hele basen»). GDPR-fristen for at
svare på en sletteanmodning er én måned. Sletningen blev planlagt linje
for linje (`~/Downloads/recon-alinas-sletning.md`, uden for repoet) og
udført i Lovables SQL editor 8/9 kl. 09:57-10:08, tabel for tabel, med
SELECT før og efter.

**Hvad der blev slettet — FØR-tallene.** Rollback-referencen findes ikke
(ingen backup vi selv styrer, og en sletning kan ikke fortrydes); derfor
står tallene her, så det kan ses hvad der fandtes:

| tabel / sted | rækker |
|---|---|
| `budget_targets` | 240 |
| `user_login_log` (med IP-adresse) | 198 |
| `messages` | 30 |
| `advisor_notifications` | 27 |
| `email_send_log` | 21 |
| `financial_report_facts` | 15 |
| `financial_reports` | 13 |
| filer i `financial-documents` | 13 |
| `notifications` | 12 |
| `slack_report_notification_log` | 10 |
| `financial_commentaries` | 8 |
| `weekly_focus` | 6 |
| `handouts` | 5 |
| `milestones` | 3 |
| `kpi_benchmarks` | 2 |
| `conversations` | 1 |
| `company_invitations` | 1 |
| `company_members` | 1 |
| `user_roles` | 1 |
| `pulse_checkins` | 1 |
| `conversation_last_seen` | 1 |
| `auth.users` (anjahojgaard@gmail.com) | 1 konto |

Plus persondata på selve `companies`-rækken, sat til NULL: kontaktperson,
mail, telefon, adresse, postnummer, by, hjemmeside, årsomsætning.

**Hvad der blev stående, og hvorfor.** Virksomhedsrækken: navn, CVR,
kontraktperiode (29/5-2025 til 29/5-2026), `status = 'tidligere'` og
`offboarding_requested_at`. Rækken er ARKIVSPORET — beviset på at hun
bad, og at det blev efterkommet. Slettes rækken, findes der intet spor af
at anmodningen nogensinde blev håndteret. `er_kunde` er sat til false.
Der var INTET bilag at beskytte: nul `company_perioder`, nul
`company_traek`, nul `company_betalingslink`, nul `session_bookings`, og
`stripe_customer_id` var null — hun har aldrig betalt gennem platformen.
Skellet, som Jonas satte det 8/9: kundens eget materiale og alt personligt
slettes; vores eget bilag bliver; virksomhedens navn og CVR arkiveres.

**Fire lærer** (også i DEL 4):

1. **Knappen lovede noget ingen hørte.** `offboarding_requested_at`
   skrives af medlemmet og læses af ingen. Det er ikke en manglende
   notifikation — det er et løfte i en tekst, uden en modtager.
2. **Kaskaden tager ikke alt.** Efter at brugerkontoen var slettet, stod
   198 loginposter med IP-adresser, 5 handouts, 1 pulse-checkin og 1
   `conversation_last_seen` tilbage (tabellerne har `user_id` uden FK,
   DEL 2 «recon-tidligere-medlemmers-data» §6). Havde vi stoppet ved
   kontoen — hvilket var det oplagte — ville hendes IP-historik have
   ligget tilbage efter en sletteanmodning. Det blev kun fanget fordi
   hver tabel med `user_id` og `company_id` blev listet fra
   `information_schema` og målt ÉN FOR ÉN.
3. **`hardDeleteCompany` kunne ikke bruges.** Den sletter
   `companies`-rækken til sidst (`_shared/companyHardDelete.ts:110`), og
   tre bilagstabeller — `company_perioder`, `company_traek`,
   `company_betalingslink` — er `ON DELETE CASCADE` mod den, så den
   ville have taget salgshistorikken med. For Alina var der intet bilag,
   men for et betalende medlem ville den slette vores eget
   regnskabsmateriale.
4. **Det tog en formiddag i hånden.** Listen over hver tabel, hver
   rækkefølge og hver kontrol står i `~/Downloads/recon-alinas-sletning.md`
   (uden for repoet) og i denne bogføring. Næste sletning skal tage fem
   sekunder, ikke en formiddag — bygget (#734) og i drift samme dag kl.
   12:01; kortet «Der findes ingen slettefunktion» er slettet som løst
   (næste afsnit «Slettefunktionen»).

Syv andre virksomheder står stadig som `tidligere` med alle deres data
(Coskun, Regnskabsvikar, Sebastian & Amalie, Stadio, Startkørekort,
Friends & Fries, LineAlmegaard); ingen af dem har trykket på knappen
(målt 8/9, SQL 7d). **BESLUTTET af Jonas 8/9, dagens slut: de slettes som
Alina.** De fik et tilbud om at forlænge manuelt, uden for systemet, og
sagde nej — men de er aldrig blevet spurgt om deres data; formålet er
ophørt. Målt 8/9 kl. 10:27: ingen af dem har perioder, træk, betalingslink,
bookinger eller `stripe_customer_id`; ni brugerkonti i alt (Friends &
Fries og Startkørekort har to hver); én fil i storage, hos LineAlmegaard —
identiske sager med Alina. Køreplanen står i
`docs/koereplan-de-syv-tidligere.md`: FØR-måling, værn, én transaktion i
FK-orden, EFTER-måling, kontoen sidst, og den sidste sweep over
`information_schema` der fangede Alinas 198 loginposter. **Coskun Holding
først (ældst, slut 6/5), så de seks** — syv på én gang er hurtigere, men
en fejl midtvejs bliver til syv sager. Slettefunktionen (#734, næste
afsnit) tager dem IKKE: de falder uden for ordningen med vilje.

### Slettefunktionen — tre veje, tørkørsel som standard; bygget 8/9 (#734), I DRIFT 8/9 kl. 11:57–12:01

**Den ene læser af `offboarding_requested_at`.** Bygget på Alina-sagens
specifikation (`~/Downloads/recon-alinas-sletning.md`, spec-slettefunktionen)
og merget som #734 8/9 kl. 08:45 UTC: `src/lib/sletning.ts` (motoren,
`afgoerSletning`), `supabase/functions/_shared/sletning.ts` (Deno-spejl,
paritetstestet i `sletningParitet.test.ts`),
`supabase/functions/slet-medlemsdata-cron/index.ts` (edge function),
`supabase/migrations/20260908120000_data_slettet.sql` (sporet), og
værnet `sletningRoererIkkeBilag.guard.test.ts`.

**Tre veje, besluttet af Jonas 8/9** (`sletning.ts:18-29`, konstanterne
`:54-64`): (1) **anmodning** — medlemmet trykkede «slet min data»:
sletning **7 dage** efter trykket; fristen er medlemmets fortrydelsesret,
ikke vores betænkningstid, og kvitteringen skal sige datoen. (2) **tilbud
ubesvaret** — 30 dage efter at tilbudsvinduet lukkede (dag 15), altså
**dag 45** efter slutdatoen. (3) **aldrig tilbudt** — samme dag 45;
ellers ligger de for evigt, som de otte gjorde.

**Afgrænsningen er den bedste del:** vej 2 og 3 gælder KUN virksomheder
inden for ordningen — slutdato efter `FORNYELSE_IKRAFT_DATO` (10/9),
samme skel som fornyelsesmotorens `uden_for_ordningen` — så der findes ÉT
skel og ikke to (`sletning.ts:34-37`). De syv med slutdato maj–september
falder udenfor og bliver ikke kandidater; de er en beslutning, ikke en
regel, og køres som engangssag med eksplicitte id'er (køreplanen
ovenfor). **Vej 1 er derimod IKKE gated på ikrafttrædelsen: en anmodning
er en anmodning**, uanset hvornår kontrakten udløb.

**Formen er husets:** motoren først — ren funktion i begge kopier,
paritetstestet, grænserne låst fra begge sider (dag 44 sletter ikke, dag
45 gør). Edge function i **Bucket B** med `authenticateServiceRole` bag
`verify_jwt = true` (`config.toml:159-163`), HTTP-indgang (ikke
`Deno.cron`), og **TØRKØRSEL SOM STANDARD**: uden body findes kandidaterne
og rapporteres pr. virksomhed, pr. tabel, pr. bucket, pr. bruger — intet
slettes, intet skrives; kun et eksplicit `{ "dry_run": false }` sletter.
Det var tørkørslen der fangede CARMA-fejlen 7/9. Funktionen tager ingen
`company_id` i body — gaten er på rækken, ikke på kalderen. **Et værn
låser at (b) aldrig røres**: `company_perioder`, `company_traek`,
`company_betalingslink`, `session_bookings` og Stripe-felterne står i
`ROERES_ALDRIG` og har ingen delete-kæde; `companies` slettes aldrig, kun
UPDATE, og den rører hverken Stripe eller kontraktperioden
(`sletningRoererIkkeBilag.guard.test.ts:44-76`). Rækkefølgen er FK-ordenen
fra Alina-sagen (15 trin): storage først, analyser før facts før
rapporter, de FK-løse persontabeller eksplicit (de 198 loginposter),
koblingen, kontoen, og til sidst UPDATE af virksomhedsrækken med
stemplet. STOP for en virksomhed uden at slette noget af den, hvis en af
dens brugere bærer en anden virksomhed eller har `session_bookings`.

**Sporet:** migrationen tilføjer `data_slettet_at` (idempotens-nøglen —
sat sidst; kaldes funktionen igen, er kandidaten væk), `data_slettet_vej`
(CHECK: `anmodning`, `tilbud_ubesvaret`, `aldrig_tilbudt`, `i_haanden`)
og `data_slettet_raekker` (jsonb med FØR-tallene pr. tabel og bucket) på
`companies` — rækken ER arkivsporet. Migrationen stempler Alinas række
med hendes FØR-tal, så hun ikke bliver kandidat igen (vej 1 er ikke
datogatet).

**I DRIFT — kørt og målt 8/9, efter `docs/koereplan-slettefunktionen.md`
(nu historik med resultater under hvert skridt):**

| kl. | hvad | målt |
|---|---|---|
| 11:57 | migrationen `20260908120000_data_slettet.sql` i SQL editoren | tre kolonner oprettet: `data_slettet_at`, `data_slettet_vej` (CHECK på fire værdier), `data_slettet_raekker` (jsonb). Alina stemplet med vej `i_haanden` og 22 bogførte tabeller — de 240 budgetmål, 198 loginposter og resten står nu på hendes række som JSON. Rollback findes ikke; tallene gør. Bevist: hun er ikke længere kandidat |
| 11:59 | `slet-medlemsdata-cron` udrullet fra commit `ff548d1e` sammen med `_shared/sletning.ts` | svarer 401 uden JWT, ikke 404 |
| 12:00 | tørkørsel på rigtige data | `undersoegt 35 · fundet 0 · slettet 0 · fejlet 0`, tomme kandidatlister. Det FORVENTEDE og det RIGTIGE: Alina er stemplet ude, og ingen med slutdato efter ordningens ikrafttrædelse (10/9) er nået til dag 45. En tom rapport er beviset på at afgrænsningen holder |
| 12:01 | cron-jobbet `slet-medlemsdata` planlagt | `0 12 * * *` UTC (14:00 dansk), aktivt, `dry_run: false`. Tolvte job, alene på klokkeslættet. Lagt EFTER `fornyelsesvarsler` kl. 11, så en virksomhed der lige har fået sit varsel, ikke slettes i samme time |

**Kæden er nu hel.** En anmodning bliver til en sletning efter syv dage,
uden at nogen skal huske det. Alina ventede 103 dage fordi feltet ingen
læste; nu er der en læser. Første rigtige kandidat kommer af sig selv:
CARMA STUDIO (slutdato 11/9, `tilbyd`) bliver `ikke_nu` fra 12/9 og
kandidat tidligst 26/10 ad vej `tilbud_ubesvaret` — medmindre de fornyer.

**Et fund fra samme tørkørsel:** `indgangs-paamindelser` kørte kl. 10:00
med fundet 0 på alle trin. Kæden er live og har aldrig haft en
virksomhed at arbejde med — nul rækker i `company_betalingslink`. Det
står i `docs/mailfortegnelsen.md` (M15–M16); gentages ikke her.

**HVAD DER MANGLER — næste skridt:** kvitteringen til medlemmet siger
stadig «Vi har modtaget din anmodning om sletning af data. Jonas
kontakter dig inden for 2 hverdage for at bekræfte.»
(`src/components/MembershipExpiredGate.tsx:141-144`) og før klikket
«Slet din data og luk din konto. Vi sender en bekræftelse og håndterer
det inden for 2 hverdage.» (`:320-321`). Den skal sige en DATO — «din
data slettes den 15. september» — regnet som `offboarding_requested_at`
+ 7 dage, samme regel som motoren (`SLETTEFRIST_ANMODNING_DAGE`). Uden
datoen ved medlemmet ikke at fristen er deres fortrydelsesret. Dertil
udestår migrationsfilen der bogfører cron-planlægningen (formen fra
`20260901112000_prod_cron_bogfoert.sql`). Målt ved merge af #734: tsc nul
fejl, 2053 tests grønne, guardrail PASS.

### De otte tidligere — slettet 8/9 kl. 12:14–12:26, i fire hold, med FØR-måling og sweep hver gang

**Beslutningen** (Jonas 8/9): de syv der stod som `tidligere` med slutdato
maj–september (uden anmodning, og med vilje uden for slettefunktionens
regel — `sletning.ts:34-37`, «de gamle er en beslutning, ikke en regel»)
slettes som Alina: kundens materiale og alt personligt væk, virksomhedens
navn, CVR, kontraktperiode og `status` bliver som arkivspor. Coskun først,
så de seks. Kørt i Lovables SQL editor efter
`docs/koereplan-de-syv-tidligere.md` (nu historik) — FØR-måling, værn i
scriptet, én transaktion i FK-orden, EFTER-måling, kontoen sidst, og et
sweep over `information_schema` bagefter — for HVERT hold.

**Holdene, med FØR-tallene (rollback-referencen findes ikke — derfor står tallene):**

| kl. | virksomhed | slettet |
|---|---|---|
| 12:16 | **Coskun Holding** (slut 6/5) | 30 loginposter · 6 mails · 5 weekly_focus · 2 beskeder · 1 samtale · 1 advisor-notifikation · 1 notifikation · 1 last_seen · **1 message_reaction (fundet af sweepet)** · 1 konto (office@coskunholding.dk, **sidste login 17/8** — tre måneder efter de stoppede) |
| 12:18 | **Regnskabsvikar** (6/5) | 5 weekly_focus · 2 benchmarks · 2 loginposter · 1 samtale |
| 12:18 | **Sebastian & Amalie** (6/5) | 26 loginposter · 5 weekly_focus · 1 samtale |
| 12:20 | **Stadio** (6/5) | 6 loginposter |
| 12:20 | **Startkørekort** (21/5) | 4 loginposter · 4 mails · 2 benchmarks · 2 notifikationer · 2 konti |
| 12:20 | **Friends & Fries** (22/8) | 41 loginposter · 18 mails · 8 notifikationer · 3 beskeder · 2 konti |
| 12:25 | **LineAlmegaard** (1/9) — den største | 328 loginposter · 93 beskeder · 60 mails · 51 advisor-notifikationer · 35 notifikationer · 12 fact-rækker · **10 reaktioner (fundet af sweepet)** · 5 weekly_focus · 4 benchmarks · 2 KPI-mål · 1 rapport · 1 milepæl · 1 handout · **18 filer i tre buckets**: logo (`company-logos`), avatar (`avatars`) og seksten chat-vedhæftninger (`chat-attachments` — præsentationer og produktfotos, den seneste fra 31/8, dagen før de stoppede) |

Plus `companies`-rækkerne: personfelterne sat til NULL, `er_kunde = false`,
`data_slettet_at` sat, `data_slettet_vej = 'i_haanden'`, FØR-tallene i
`data_slettet_raekker` (migrationen var kørt kl. 11:57, så sporet er på
rækken og ikke kun her).

**Resultatet:** 8 af 8 tidligere (Alina + de syv) har `data_slettet_at`.
Sidste sweep over alle otte: **ingen rester i sytten tabeller, ingen filer
i storage.** Otte arkivspor tilbage med navn, CVR og kontraktperiode.
Intet bilag rørt — ingen af de otte havde perioder, træk, betalingslink,
bookinger eller `stripe_customer_id` (målt 8/9 kl. 10:27).

**Tre lærer** (også i DEL 4):

1. **Sweepet fandt noget hver gang.** Hos Alina 198 loginposter, 5
   handouts, pulse og last_seen. Hos Coskun én `message_reaction` — en
   tabel Alina ikke havde noget i. Uden sweepet ville ti reaktioner have
   ligget tilbage hos LineAlmegaard. REGLEN: en sletning er ikke færdig
   når planen er kørt; den er færdig når sweepet er tomt.
2. **Filerne lå tre steder, ikke ét.** Den første måling talte kun
   `financial-documents` og fandt én fil hos LineAlmegaard. Der var atten:
   `company-logos`, `avatars` og `chat-attachments`. En måling der kun
   kigger ét sted, giver et tal der ser rigtigt ud.
3. **Coskun loggede ind 17. august** — tre måneder efter de stoppede 6.
   maj. LineAlmegaard uploadede materiale 31. august, dagen før de
   stoppede. Folk kommer tilbage til platformen efter de er holdt op, og
   indtil i dag kunne de logge ind på deres gamle data.

Det der venter efter dette: ikke flere tidligere med data. Fra nu af er
det slettefunktionens regel (DEL 2 «Slettefunktionen») der afgør hvornår
en udløbet virksomhed slettes — første kandidat tidligst 26/10 — og en
opbevaringspolitik for det der ligger imellem er stadig en beslutning
(mangellisten «Ingen opbevaringspolitik»).

### Eftermiddagen 8/9 — milepælenes dom, forslaget, Mortens to fejl, to-do-listen, kvitteringen (#739–#745)

Syv PR'er på fire timer. Reconerne bag ligger i `~/Downloads/` (uden for
repoet — genskabes hvis de bruges): `recon-maanedsdigesten.md`,
`recon-opgaver-og-milepaele.md`, `recon-agentens-forslag.md`,
`recon-forsidens-to-fejl.md`, `analyse-todo-listen.md`,
`recon-sessionerne.md`, `recon-introsessionen.md`.

**1. Milepælene — én dom (#741), og digesten kalder den (#742).** Målt
8/9: **21 af 27 milepæle hos aktive virksomheder var overskredne;
Rallysupport ni, den ældste 145 dage; Brick Works otte.** Seks flader
dømte «færdig» på tre måder (`progress >= 100`, `progress < 100`,
`status = 'completed'`, `status <> 'completed'`, `progress < 50`), og
der fandtes INGEN forfalden-tilstand — ordet stod kun i et panel der
aldrig renderes. Nu én ren dom i begge kopier (`src/lib` og
`_shared`), kaldt af fem flader, låst af et værn. **Tre valg:** parkeret
vinder over alt, også over 100 % (et menneske lagde den i køleskabet);
færdig er `status` ELLER `progress`; og fristdagen selv er ikke
forfalden — samme skel som slutdatoen fik 7/9. Digesten (22/9) nævner
nu forfaldne i eget afsnit EFTER de kommende, højst tre, senest
passerede først, grænse tres dage nedad — resten tælles. **Og et fund
undervejs:** `json`-hjælperen i `send-monthly-digest` var aldrig
defineret — funktionen kastede EFTER afsendelse, hver gang. Mailene
gik ud; svaret var en 500.

**2. Forslaget kan ses (#740).** 97 forslag, 10 gjorte, 63 udløbne —
og reconen viste at det er designet, ikke medlemmerne: et
rådgiverforslag lå i «Dine aftaler» uden badge, uden tælling, uden
dato, uden afsender; systembeskeden i chatten talte ikke som ulæst
(tællerne tager kun `message_type = "user"`); og «Dit næste skridt»
udelod `proposed` med vilje. Nu: «Fra din rådgiver · foreslået i går ·
1 af 3», «2 forslag mere venter — de kommer frem når du har svaret på
dette», og «udløber om 3 dage» ved syv dage eller færre (rust ved i
dag/i morgen). **Ét ad gangen er bevaret bevidst** — flere knapsæt på
én skærm gør det sværere at svare; det medlemmet manglede var at VIDE
at der er flere. `nextStep.ts`' udeladelse af `proposed` står urørt og
skal genovervejes. Husets ord genbrugt: milestone-sidens «Aktive · 3»,
eventCountdown, chattens datoskille. Ingen ny badge — Hjemmebane har
ingen ulæst-markering på medlemssiden.

**3. Mortens to fejl (#743, #744).** *De tolv:* dommen bar dem
(`Tilstandslinje.virksomheder`), linket kastede dem væk
(`/virksomheder` uden parameter). Nu `?grund=<slags>` — og **listen
spørger DOMMEN frem for at regne selv**: forsidens og listens
universer er ikke ens (dommen har ingen `status`-betingelse og trækker
virksomheder med egen linje fra; listen kræver `status = active`), så
en egen udregning ville give elleve eller tretten. Samme hentning,
samme cache-nøgle, samme funktion; overskriften siger hvad der vises,
«Vis alle» er vejen tilbage. Dækker alle fire samlede slags (tavshed,
fornyelse, indgang, agentforslag). *Doggybed:* ikke en fejl, men et
manglende design. Linjen er to talsignaler (omsætning −17 %, resultat
−241 %), og et chatsvar ændrer ikke tallene — det stod bare ikke på
fladen, og for Jonas og Morten er linjerne OPGAVER. Derfor lukningen:
**«Færdiggjort» og «Ikke relevant», ingen «Udsæt»** (rangeringen
udsætter allerede). **Jonas' regel, ordret: «Færdiggjort holder på den
opgave der er. Der skal være sket noget NYT for at en opgave kan komme
op igen.»** Grundlaget er `period_key` for talsignaler — en rettelse af
august er ikke en ny måned — og **tavshed forbliver lukket selv når
dagene vokser**: her trækker Jonas' regel og «ingen må glemmes» hver
sin vej, og Jonas valgte reglen. Opgaven er VIRKSOMHEDENS, ikke
rådgiverens: lukker Morten, ser Jonas den heller ikke.

**4. To-do-listen (#745).** `~/Downloads/analyse-todo-listen.md` stillede
valget: et LAG på forsiden (§9's tildeling, spejlet vinder) eller en
LISTE VED SIDEN AF (hukommelsen vinder). **Jonas valgte listen ved siden
af** — forsiden regner, listen husker, og en liste med «gjort» ville
være den klaret-knap forsidens design §7 forbød, hvis de blev blandet.
Egen side på `/opgaver`, med ÉN linje under stregen på forsiden («N
punkter på jeres liste · M forfaldne»). Frit skrevet: tekst, valgfri
virksomhed, valgfri frist — intet lander automatisk. Ejerskab pr.
punkt, så Jonas kan skrive til Morten. Fristen sorterer men
notificerer ikke (to mennesker; en besked pr. forfalden ting bliver
støj). **Ingen kirkegård:** forfaldne står øverst, ikke gemt.
Sessioner hører ikke til her (Jonas 8/9: «Det er ikke en to-do»).
Mangellistens kort «Rådgiverens egen to-do — og de tre der allerede er
prøvet» er dermed afgjort og slettet: den fjerde tabel blev bygget, med
vilje, ved siden af og ikke i `company_actions`.

**5. Fornyelseskvitteringen (#739).** Medlemmet betalte for et år og fik
en toast der forsvandt, og Stripes egen kvittering. Nu en mail fra os:
beløb, betalingsmodel, ny slutdato skrevet ud, link ind. **Kaster
aldrig** — sendes EFTER at perioden er skrevet og `contract_end_date`
sat; en betaling der registreres uden mail er bedre end en mail der
koster en registrering. **To lag idempotens**, fordi Stripe kan sende
samme event to gange og gensendelsesgrenene også kalder hertil.

**6. Hvad der venter herfra** (DEL 3): *intro-sessionens tid* — Calendly
sender `scheduled_event.start_time` ved hver `invitee.created`, og
webhooken kaster den væk (`calendly-webhook:92` læser kun URI'en);
`intro_session_used_at` betyder «retten er brugt», sat ved klik, ikke
«afholdt» — BYGGES NU. *De betalte 1:1-sessioner* stopper ved
`booking_sent` (intet id i linket, webhooken matcher `morten`). *Agentens
forslag:* ugens fokus skriver op til tre pr. virksomhed hver mandag for
ALLE med flaget, agenten ét pr. rapport-godkendelse; ingen af dem læser
svarene, ingen dedup på titel, og «seks pr. virksomhed samme dag» kan
koden ikke forklare — kræver prod (`recon-agentens-forslag.md` P1).
Ingen har besluttet noget om det.

### 9. september — rådgiverfladen bygget om, onboardingen målt, to trin bygget (#744–#761)

Atten PR'er. Reconerne ligger i `~/Downloads/` (uden for repoet):
`recon-raadgiverens-menu.md`, `recon-puls-og-siden-sidst.md`,
`recon-philberts-seks.md`, `recon-i-gang.md`, `analyse-rytmen.md`.

**1. Rådgiverfladen.** Menuen vendt (#748): Forside, Virksomheder,
Indbakke, Community, Indhold øverst — før skulle rådgiveren forbi ni af
medlemmets punkter. «Din rådgiver › Chat» var det rigtige link under et
forkert navn: `/chat` er `CompanyChatPane` for en rådgiver, den flade
indbakke. Forsiden i to kolonner (#750): dom og liste til venstre, puls
og «siden sidst» til højre. To-do-listen (#745) blev først et menupunkt;
Jonas: «det bliver et menupunkt vi aldrig nogensinde kommer til at
arbejde med» — den flyttede ind under dommen. Pulsen (#752, rettet
#755): fire tal for porteføljen. Den lignede en modsigelse af dommen —
12 mod 14 tavse, 1 mod 2 fornyelser, «af 23» når der er 27 — fordi
dommen TRÆKKER FRA dem der har egen linje. Nu måler pulsen porteføljen:
«14 tavse · 3 står øverst». Filhovedet lovede det modsatte og er
rettet: **linjen er fladens rest, pulsen er tilstanden.** «Siden sidst»
(#753): syv dages loft, pr. rådgiver. Lukke-knapperne (#744):
«Færdiggjort» og «Ikke relevant», ingen «Udsæt» — rangeringen udsætter
allerede; grundlaget afgør hvornår opgaven kommer igen. Sidst online
(#751) forsvandt 4/9 uden en beslutning og er tilbage. Invitationerne
(#754) i det nye design, begge steder. Kontoen (#757) på `/konto` for
alle roller.

**2. Onboardingen — målt.** SEKS virksomheder har medlemmer og har
aldrig uploadet; Bastant og TuaMea i 165 dage. Alle seks har en
samtale, og alle seks venter på svar FRA dem. Tre fik én besked —
skrevet af AGENTEN i Jonas' navn, slået fra 25/8 — og så stilhed.
**Tærsklen er målt:** de der kom i gang, gjorde det inden for tre uger
(Livja 0 dage, YKRG 4, Floren 15); de langsomme er alle fra 2025.
**Bygget:** to trin på forsiden (#759, #761) — dag 7 «spørg hvilket
system de bruger», dag 21 «hjælp i gang», øvre grænse 90 dage så det
ikke bliver en kirkegård; samme dom, trinnet i grundlaget, spejlet i
`_shared/` med paritetstest. «Venter på velkomst» efter én kalenderdag.
Rapportpåmindelsen springer en ny uden nogen upload over og siger
hvorfor i tørkørslen (`sprunget_over_liste`). Rapporteringen beder om
historikken (#760) med eksportvejene frem fra fejlbeskederne.
**Det vigtigste er ikke kode:** resten af rytmen er at Jonas og Morten
skriver til dem på listen — og beder om historikken frem for at byde
velkommen.

**3. Læren** står i DEL 4: «Byg efter at medlemmerne er forskellige.»

**4. Det der står tilbage:** otte ting kun på `/members` (prisniveau i
indgangen, omdøb, merge, berig med ansøgning, importér, slet
virksomhed, onboarding-tragten, branchefilter); `/settings`' tre rester
(netværksprofilen hører til Netværket, virksomheden mangler «Aftalen»,
notifikationsfanen er en tekst uden knapper); medlemmets aftale-kort,
som venter på at nogen har en periode at vise — 27 af 27 har nul
(#756 gav kun læseadgangen). Mangellisten er rettet.

### 10. september — vagten der ikke virkede, `/members` tømt, `/settings` konverteret, notifikationernes alder (#763–#773)

Reconerne ligger i `~/Downloads/` (uden for repoet): `recon-vejen-ind.md`,
`analyse-onboardingens-rytme.md`, `recon-hvad-gik-tabt.md`,
`recon-gamle-notifikationer.md`.

**1. Vault-udfaldet er løst** (blokken øverst): nøglen genskabt 9/9 kl.
23:50, 200 fra `fornyelsesvarsel-cron`.

**2. Vagten (#768, #770) — bygget, merget, migrationen kørt, og den
VIRKEDE IKKE.** To fejl efter hinanden. **(a)** plpgsql-variablen `r` delte
navn med tabelaliasset `r`, så `r.created` blev læst som variablen. Rettet.
**(b)** Derefter timede den ud: `cron.job_run_details` havde **1.895.419
rækker** og intet indeks på `start_time`, og trin 2's korrelerede
underforespørgsel kørte én gang pr. svar-række. Et indeks kan IKKE oprettes
— «must be owner of table job_run_details», tabellen ejes af systemet.
**Årsagen til de 1,9 mio.:** næsten alle var `SELECT
public.email_queue_dispatch();` — mailkøens gamle afsender, planlagt som et
NYT engangs-cron-job pr. afsendelse i stedet for ét gentagende. Hver
efterlod en række; jobbene er væk. Lovable ryddede **1.892.693** rækker
10/9; 2.734 tilbage. Lærerne står i DEL 4.

**3. `/members` er tømt (#771, #772).** Invitationerne (#754), stamdata og
branchefiltret (#771), importens advarsel (#763) — flyttet. Tilknyt og
berig — fjernet, 284 linjer. Tilbage: importen, som bliver til
ansøgningsflowet flytter, og onboarding-tragten, som IKKE skal flyttes.
**Slet-knappen er den vigtige:** den kalder ikke `hardDeleteCompany` (den
tager bilaget), men stempler `offboarding_requested_at`, så
slettefunktionen gør arbejdet på dag syv — med syv dages fortrydelsesfrist.

**4. `/settings` er konverteret (#773).** Notifikationsfanen var en tekst
uden knapper; nu fem mailtyper (dem koden læser) plus
`weekly_focus_enabled`. **Fund:** den gamle fane læste præferencerne fra
`useAuth` via en `as any`-cast i stedet for fra `profiles` — kolonnen
hentes ikke dér, så kontakterne stod altid på «til». Formentlig grunden til
at den aldrig virkede. Aftalen for medlemmet viser slutdato og pris fra
egen række; perioderne kommer når nogen har nogen (27 af 27 har nul).
`company_fornyelse` læses aldrig — testen låser det.

**5. Notifikationernes alder (#770).** Da jobbet blev tændt igen kl. 08:57
efter otte timers nedbrud, sendte det 26 community-mails om et opslag fra
dagen før. Nu **tolv timer på begivenheder** (community-opslag, -svar,
-nævnelser, event-påmindelser) og «set i appen» dækker community via
`community_visninger`. Princippet står i koden: jo mere beskeden er en
BEGIVENHED, jo hurtigere forældes den; jo mere den er en OPGAVE, jo længere
holder den. Forældede disposes med `email_sent_at` og logges «IKKE SENDT».

**6. Event-dagene (#769).** Et event samme dag stod som «I morgen», fordi
dagene blev regnet som timer (`Math.ceil` af millisekunder) frem for
kalenderdage. Nu husets `kalenderdageTil`; «I dag» findes, «I gang» fra
15 minutter før start.

**7. Også i dag:** onboardingens rytme (#766: dag 0–1 «Sådan kommer du i
gang», dag 10 intro-påmindelsen i systemets stemme, dag 14–20 «Historikken
først»; migrationen skrevet, IKKE kørt), profilens nudge (#764/#765) og
importens advarsel (#763).

**8. Vagten tog OTTE versioner, alle fejl kun fundet i prod.** Ingen af
husets 2459 tests kører en linje plpgsql. (1) alias-kollision: variablen
`r` mod tabelaliasset `r`. (2) timeout uden indeks: 1,9 mio. rækker i
`cron.job_run_details`, som IKKE kan indekseres («must be owner») — læses
nu KUN gennem primærnøglen, `ORDER BY runid DESC LIMIT 2000`, aldrig
`WHERE start_time`. (3) array-konkatenering: `text[] || 'literal'` er
tvetydig, Postgres læser literalen som et array — `array_append`. (4)
`advisor_notifications.company_id` NOT NULL — læst i historikken, ikke
målt; nu nullable, en driftsbesked handler ikke om en virksomhed. (5)
vagtens egen tærskel (30 min) mod motorens 240 minutters ventetid — nu
motorens tal + margin, kun 07–20. (6) «intet svar» talt som fejl: pg_net
skriver rækken FØR svaret kommer; nu «undervejs» i to minutter. (7)
startup-timeout og SQL-fejl slået sammen — nu SQL-fejl rød, pg_crons
forbindelsesfejl gul ved tre på en time. (8) timeouts talt på `timed_out`,
som pg_net aldrig sætter i prod — teksten står i `error_msg`; nu kolonnen
ELLER `~* '(timeout|timed out)'`, og `error_msg` dømmes FØR alderen.
Migrationerne `20260909234500` … `20260910170000`; forsidens linje
«Driften» læser loggen (`cron_vagt_log`).

**9. Og den fandt noget på første fungerende kørsel.** Kl. 08:40 kunne to
jobs ikke starte — pg_crons hårdkodede ti sekunder til at få en
forbindelse (`CronTaskStartTimeout`, ingen indstilling), mens oprydningen
kørte. Og fem af tretten kald til notifikationsjobbet timede ud efter fem
sekunder (`recon-job-startup-timeout.md`, `recon-timeoutens-pris.md`).

**10. Timeouten.** pg_nets standard er 5.000 ms, og den er en
KLIENT-timeout: målt 3/9, edge-funktionen AFBRYDES når pg_net lukker —
kaldet tabes ikke, det KLIPPES midt i arbejdet. Målt i dag: DNS 203 ms,
handshake 60 ms, request/response 473 ms — resten af de fem sekunder er
funktionen selv. `public.kald_edge` samler nu URL, nøgle og timeout ét
sted: standard 30 sekunder, loft 150. Alle TI HTTP-jobs er genplanlagt,
ét ad gangen med bevis imellem, notifikationsjobbet sidst. De FIRE øvrige
(`agent-runs-opbevaring`, `cleanup-stale-processing-reports`, `opgave-udloeb`,
`vagt-cron`) er ren SQL og har intet at time ud — se punkt 13 om hvorfor
det står med fire og ikke tre. **Åbent:** ét job der klippes hvert femte minut er ikke
en grund i vagten (reglen kræver to jobs) — tallet står i `timeouts_60m`.

**11. Tællerne (#776).** `{processed: 1, sent: 0, skipped: 0}` så ud som
en fejl og var det ikke — en række der VENTER (for ung for sin types 240
minutter, eller uden for vinduet 07–20) stod i ingen tæller. Det kostede
en times fejlsøgning. Nu `venter_paa_tid` og `venter_paa_vindue`, og
`sent` tæller rækker så regnestykket går op; `mails_sendt` tæller mails.
Hentningens 15-minutters net forbliver bredt med vilje: dublet- og
rapport-væk-reglerne skal se hele familien i samme kørsel.

**12. Omlægningen til `kald_edge` — kl. 12:42–12:44, ét job ad gangen,
bevis imellem.** Rækkefølgen var planens (`plan-timeouten.md` §5):
`indgangs-paamindelser` først (den var bevist i hånden med et tørt kald),
`process-notification-emails` sidst. Alle ti HTTP-jobs kalder nu
`public.kald_edge('<funktion>', <body>)` — URL, nøgle og timeout ét sted,
standard 30 sekunder. `generate-weekly-focus` fik 150 sekunder: den kører
ugentligt og gør mest arbejde (ét AI-kald pr. virksomhed), og 150 er
platformens eget loft. **Bevist kl. 12:50:** notifikationsjobbet svarer
200 med `{processed: 1, sent: 0, venter_paa_tid: 1}` — ingen timeouts
siden omlægningen, hvor fem af tretten kald timede ud før.

**13. En fejl der skal stå, fordi den er min egen og blev fanget på fem
minutter.** `cleanup-stale-processing-reports` blev lagt ind i
`kald_edge` sammen med de andre. Men det job kalder IKKE en edge function
— det kalder en SQL-funktion: `SELECT public.cleanup_stale_processing_reports();`
Resultatet var 404 «Requested function was not found» hvert femte minut,
indtil det blev rullet tilbage kl. 12:52. **Årsagen:** jeg antog at
jobNAVNET var funktionsNAVNET. `20260901112000_prod_cron_bogfoert.sql:46`
sagde det tydeligt, og jeg så det ikke efter. **Og vagten ville have
fanget det:** 404 hvert femte minut er «ikke 200», og den ville have sagt
rødt inden for en time. Fire jobs er ren SQL og har intet at time ud:
`agent-runs-opbevaring`, `cleanup-stale-processing-reports`,
`opgave-udloeb` og `vagt-cron`. Læren står i DEL 4.

### 10. september, aften — de synlige ting, parseren, estimaterne, klokken (#774–#794) — og mangellisten ryddet

Jonas 10/9: «Bør vi ikke lige få opdateret mangellisten med alt det nye og få
sat flueben ved de ting der er klaret?» Listen viste 178 kort; omkring tyve
var lukket i dag uden at listen blev rørt, og overblikket
(`~/Downloads/overblik.md` §1) fandt tretten der var løst FØR i dag og
stadig stod åbne. Husets regel (listens filhoved, besluttet 4/9): et løst
kort SLETTES, og beviset står her. Kriteriet var strengt — et kort er lukket
når det der stod på det, ikke længere er sandt.

**Efter rydningen: 157 kort** — fejl 34 · mangler 81 · beslutninger 25 · idéer 17
(tælleren i listens værktøjslinje regner dem selv). 24 slettet, 8 omskrevet
til det der står tilbage (tag «Rettet 10/9»), 3 nye. Kortnumrene i dagens
recon-filer (`~/Downloads`) er positionen FØR rydningen.

**Slettet som løst — lukket i dag (#758–#794):**

| kort | lukket af |
|---|---|
| Ingen klokke når et nyt medlem venter | #759/#780 (venter-på-velkomst på forsidens dom), #790 (klokken viser det) |
| Rapporteringen forklarer HVAD, ikke HVOR | #760 — eksportvejene står FØR uploaden |
| Ingen samlede tal for en periode | #788 — ÅTD, seneste 12, frit interval på Nøgletal |
| Estimat-mærkets forklaring findes ikke på mobil | #789 — mærket er en knap med HbPopover, 44 × 44 punkter |
| Mobil: indhold går ud over kanten på virksomhedssiden | #663 (4/9) rettede de fire målte steder; #789 det sidste (mail-loggens Message-ID) |
| Budget-tabellen brækker procenterne | #791 — nowrap, kolonner 100/112 px, tabellen ruller |
| Milestones: kategorifarverne er rå | #791 — husets palet; Hb-fladerne læste allerede aldrig farverne |
| Gæst-flueben i rådgiverfladen | #791 — i EditCompanyDialog, `vis_i_netvaerk` |
| Medlemmets AI-fane og chattens loading-gren står i det gamle | #794 |
| To ting mere i agentpanelet (Godkend redigeret, ::selection) | #794 |
| Hjemmebane har ingen klokke — «set i appen» virker kun for community | #790 — `mark_notifications_seen` kaldes når klokken åbnes |
| Sortering og branchefilter på /virksomheder | #771 |
| /members er tømt — to dele står | #771/#772 — det der stadig peger på listen (Guide, indgangsMail, Slack-links) står nu på kortet «Pulse check-in og Guide» |
| Medlemmets aftale-kort er bygget — perioderne kommer når nogen har nogen | #773 — beviset (første rigtige periode, PHILBERT efter 22/9) står i DEL 3 |
| Medlemmet kan ikke se sin egen betalingshistorik | #773 — samme bevis |
| /settings er Hjemmebane — notifikationsfanen læste aldrig det gemte | #773 |
| Ét job der klippes hvert femte minut er ikke en grund i vagten | `kald_edge` (#779): timeouten hævet fra pg_nets 5 s til 30 s; vagtens ottende version tæller timeouts; tallet skal falde til nul |

**Slettet som løst — var løst før i dag, stod stadig åbent (overblikket §1):**

| kort | løst af |
|---|---|
| «Dine tal» krydses af ved upload, ikke ved godkendelse | 9/9 (`onboardingTjekliste.ts`: «RETTET 9/9 … godkendelsen ER medlemmets klik») |
| Nøgletals-mål: fejlen kaster og standardmål markeres | 7/9; tallene har eget kort («KPI-fallbackens fire kronebeløb») |
| De 63 udløbne er arv — beviset for cron'en kommer 7/9 | bevist 7/9 |
| Badget kender kun varsel 1 | #719 (7/9): `lib/varselTrin.ts`, ÉN regel for badge og dom, CARMA-tilfældet testet i begge |
| Strandede invitationer står, men ingen dom siger «strandet» | #754 (9/9) gav dem et sted med alder; dommen blev besluttet VÆK 3/9 |
| Mobil: tomt grønt bundstykke | #726 (8/9), låst af `hbFuldhoejde.guard` |
| remm. og YKRG ser kun årstal — og YKRG ser nuller | nullerne: #786 (et manglende tal er et hul, ikke nul); «kun årstal» er udtrækkets sag og står nu på kortet om de ni af elleve |

**Omskrevet — det der står tilbage:** årsrapport-udtrækket (fladen lyver ikke
længere, ni af elleve mangler stadig felter — beslutning: byg udtrækket om
eller manuel indtastning); rapport-uploaden (16 strandinger på 90 dage målt
10/9; fire domme rettet #783–#786; PHILBERTs PDF-layout og XLSX-mismatch står);
events (kalender, publiceringsmail og «om en time» bygget; bekræftelse og
lokation står); mørke tokens (agentpanelet konverteret; fire paneler bærer
stadig wrapperen); fejlovervågning (vagten ser cron og kø; edge functions og
webhooks er ubevogtede); tavse queryFn'er (medlemmets og rådgiverens flader
rettet; app-config, admin og mutationer står); onboardingens rytme (cron
skal planlægges gennem `kald_edge`); Pulse/Guide (de løse links til
`/members`).

**Nye kort:** PHILBERTs e-conomic-PDF'er rammer ingen skabelon — og to
måneder i én fil var usynlige før #785 (fejl, medlem); chat-mails ved ikke om
beskeden er læst i appen — `messages.read_at` læses ikke af mail-motoren
(mangler, medlem); «Online nu» — hvem er på platformen (idé, Jonas 10/9, ikke
afgjort; huset har ingen presence).

**Dagens PR'er der ikke lukkede et kort, men er bogført her:** #784 (et
underskud er ikke en vendt fil — `suspicious_sign_pattern` tæller nu kun
felter der ikke lovligt kan være negative; ÅTD 0 er ingen aflæsning), #785
(to måneder i én fil afvises med grund), #787 (et estimat tæller ikke som
realiseret i budgettet), #793 (rapportkortet siger hvorfor), #792 (mail når et
event publiceres), #781/#782 (fladerne siger fra — se kortet om tavse
queryFn'er), og de fire små i #791 (chattens skrivefelt: tre linjer at starte
på, en tredjedel af skærmen før det ruller).

### 10. september, sen aften — de ti synlige er alle bygget, parseren er bevist, ni af de nitten er lukket, fem crons i drift (#795–#801)

Tolv PR'er blev merget mellem den forrige bogføring og midnat (#789–#801). To
ruder byggede parallelt fra to lister: `~/Downloads/de-ti-naeste.md` (det man
kan pege på bagefter) og `~/Downloads/de-tyve.md` (stor impact for lille
indsats, grupperet i fire ad gangen, ingen fælles filer).

**1. De ti synlige forbedringer — alle bygget.** Kalenderknap på events med
Meet-linket i både LOCATION og beskrivelsen (#788/#792), samlede tal for
perioden (#788), estimat-mærkets trykflade og overløbet på mobil (#789), begge
klokker (#790), større skrivefelt, milepælenes farver, budgettets procenter og
gæst-flueben (#791), rapportkortets grund og badget der kender varsel 2 (#793),
agentpanelet der endelig kan læses (#794), CSV-download af egne tal og
budgetafvigelse på forsiden (#795).

**2. Parseren er bevist i drift.** Filnavnsreglen (#783), fortegnsdommen (#784),
gulvet på tre felter og profilernes fortegn (#796) og genkørslen (#785, #786).
Jonas klikkede knappen på ANLA GLAS' `2026-6.xlsx` kl. 18:53 — den gik fra «Fejl
i behandling» til «Afventer godkendelse».

**3. Ni af de nitten «stor impact» er bygget** — i praksis flere: rolletjek-buggen
(`.in("role",[…]).maybeSingle()` fejlede på en bruger med begge roller, tre
functions, #797), digestens gate (cron kun den 22., admin-knappen tester som
standard, «send til alle» bag bekræftelse, nøgle pr. modtager pr. måned, #797),
chat-mails der læser `messages.read_at` (#797), legat-cronen som Bucket B med
tørkørsel (#797), momsen i dag 0/25/31 (#799 — se nedenfor), dobbeltbetalings-
værnet i checkout OG webhook (`_shared/fornyelsesVaern.ts`, #799),
fornyelsesbeskeden i rådgiverens klokke i vagtens form (én række pr. rådgiver,
#799), owner-rollen i de tre edge-veje (`_shared/medlemsrolle.ts`, #799),
egenkapitalen (`equity` → «egenkapital»), balanceposterne kun i december og
regel 6 i dansk tid (#798), review-cronen (#798), forslagenes og opgavernes
udløb og tjeklisten i profilen (`profiles.notification_email_prefs.tjekliste_lukket`,
localStorage som cache, #800), sletningens grænse, status-CHECK'en og toasten
(#801). **#801's tre migrationer er SKREVET, ikke bekræftet kørt** — kortet
står på mangellisten med SELECT'erne.

**Momsen (#799) — reconen reddede nummer 6 fra en forkert rettelse.** Løsningen
lignede «skriv 62.500». Men mangler kundens adresse, slår Stripe Tax fra og
fakturaen lyder på 50.000; en EU-kunde med gyldigt momsnummer betaler 0 %. Og
TO mails havde problemet, ikke én. Så dag 0 og dag 25 siger «50.000 kr. ekskl.
moms» (som `/betal`, gaten og kvitteringen), og dag 31 skriver FAKTURAENS
faktiske total — cronen sender fakturaen før mailen og har `total` og
`moms_beregnet` i hånden. Dag 0 fik beløbet med (design §9: «beløbet konkret»;
parameteren blev sendt men aldrig brugt).

**4. Fem nye cron-jobs i drift** (Jonas 10/9): onboarding-rytme (kl. 10 dansk),
legat-reminder (11:30), report-review (07:20), agentforslag-udløb og
opgave-forfald (06:05 og 06:10). Alle gennem `kald_edge`. NB: migrationen
`20260909180000` siger `15 9 * * *` UTC (= 11:15 dansk) for onboarding-rytme;
står jobbet kl. 10, er det ændret i hånden — afgøres med
`SELECT jobname, schedule FROM cron.job WHERE jobname = 'onboarding-rytme';`.

**5. Tre lærer, alle fra i dag:**

- **Mål før du bygger.** Fortegnsdommen blev rettet uden at måle hvad der stod i
  ANLA GLAS' filer; det kostede tre ekstra rettelser (#784 → #796). Jonas: «hvis
  ikke man gør sit fodarbejde ordentligt, bygger man i blinde.»
- **Et grep er ikke en måling.** `role.*member` matchede en linje i
  `upgrade-legat-to-member`, men tabellen var `user_roles`, ikke
  `company_members` — og `owner` findes ikke i den enum. Rettelsen ville have
  fejlet i databasen. Læs linjen i sin sammenhæng, ikke i grep-udskriften.
- **Et kort kan bygge på en antagelse der ikke holder.** «Ulæst pr. læser»
  (delt ulæst-markering mellem rådgivere) antog fordelte virksomheder. Jonas 10/9:
  «Vi tildeler jo ikke virksomheder mere.» Kortet skal UD, ikke bygges — slettet
  fra mangellisten i denne bogføring.

**6. ÅBENT PUNKT til Jonas og Morten — digesten.** Reconen
(`~/Downloads/recon-digesten.md`) fandt: intet i månedsdigesten findes KUN dér
— alt er visning af det fladen viser. Den ene unikke rolle (overskredne milepæle
nåede kun medlemmet via mailen) forsvandt med #741, hvor milepæle-siden fik
«Fristen var …». Og der findes ingen beslutning i `docs/` om at digesten skal
findes eller hvad den skal være — kun fire om at få den til at virke (dag-gate,
dedup, dublet, «d. 5.»-teksten). Hvem den når og om nogen klikker, kræver prod
(ingen sporing). Det er ikke en anbefaling om at slukke den; det er
spørgsmålet: skal den findes, og hvad skal den så sige, som fladen ikke siger?
Slukkes den, er det én linje (`cron.unschedule('send-monthly-digest')`), og
indstillingsfanens «Månedsoverblik» skal så følge med.

**Mangellisten efter denne bogføring:** 17 kort slettet som løst eller trukket
(toasten, dobbeltbetaling, fornyelsesbesked, tre veje → member, «gennemgå dine
tal»-mailen, equity, balanceposter, chat-read_at, delt ulæst-markering,
expired-cron, opgavers udløb, budgetafvigelse, digest-gate, rolletjek,
legat-cron, tjekliste pr. enhed, status-constraint), 1 omskrevet (de tre
migrationer fra #801 der skal køres), og moms-sætningen i rykker-kortet rettet.
Tælleren i listens værktøjslinje regner selv.

### 10. september, nat — seks kort afgjort uden at bygge; listen bliver PRØVET, ikke bare afviklet

Jonas 10/9: «Hele den her mangelliste er opbygget over flere uger, så der kan
godt være nogle af tingene som ser anderledes ud, fordi vi har bygget meget
på platformen. Nogle ting som var en god idé, men ikke længere er det. Nogle
ting som kan blive endnu bedre, hvis man tør tænke dem lidt anderledes. Vi
sigter efter det absolut bedste, i stedet for bare at se os tilfredse med det
vi engang har noteret ned.» Præcedensen fra i eftermiddag: «ulæst pr. læser»
var korrekt om koden og byggede på en arbejdsform der ikke findes (Jonas:
«Vi tildeler jo ikke virksomheder mere») — taget af listen, ikke bygget.

To recons tog seks kort fra `~/Downloads/de-naeste-ti.md` og spurgte ikke «er
det sandt» men «er løsningen stadig den bedste, efter det der er bygget i
dag» (`recon-de-tre-andre.md` og `recon-de-tre-paa-ny.md`). **Ingen af de seks
skal bygges som de stod.** Det er et lige så godt udfald som en rettelse: seks
gange blev der ikke brugt en halv dag på noget der var rigtigt for tre uger
siden.

**Tre ud:**
- **Bekræftelsesmail ved event-tilmelding** — en tilmeldt får i dag fire
  kontaktpunkter: tilstanden på siden («Du er tilmeldt. Afmeld»,
  `EventDetailView:325`; «✓ Tilmeldt» på kortet), kalenderfilen (#788), mailen
  dagen før og mailen en time før (#792). En bekræftelsesmail ville være den
  femte og sige noget medlemmet lige har set på skærmen — og koste en edge
  function eller trigger, fordi tilmeldingen er en klient-INSERT. Kortet er
  omskrevet til det der står tilbage: events har ingen lokation.
- **`seen_at` på ugekortet er et dødt felt** — sandt (ingen UPDATE-policy på
  `weekly_focus`, `markSeen` rammer nul rækker tavst, 144 rækker null), men
  løsningen «gør feltet skrivbart» er ikke den bedste: punktet «Ugens fokus er
  klar» i næste-skridt-kortet peger på forsiden selv, hvor resuméet allerede
  vises. Erstattet af en beslutning: skal slot (d) findes overhovedet, eller
  er et «nyt denne uge»-mærke på resuméet nok (én gren i `nextStep.ts`).
- **«Fjern medlem» hedder forkert** — sandt OG værre: knappen kalder
  `auth.admin.deleteUser`, som kaskaderer ind i beskeder og samtaler (er
  personen samtalens `member_id`, forsvinder hele samtalen med rådgiverens
  svar), og fejler på FK hvis der findes godkendte tal fra personens
  rapporter — EFTER `company_members` og `profiles` er slettet: en halv
  sletning. Omdøbning løser intet. Erstattet af to kort: «fjern fra
  virksomheden» (kun `company_members`-rækken, reversibelt — bygges nu i det
  andet vindue) og «sletning af en person har ingen vej» (en vej som #734, med
  dom, frist og tørkørsel — senere).

**Tre omskrevet:**
- **500-vinduet** — `CompanyChatPane:389-395` henter 500 beskeder uden
  samtalefilter og regner både ulæst-tal og «seneste besked» af dem. Sandt;
  om vinduet er ramt kræver prod. Men løsningen er ikke at rette badgen:
  rådgiveren har siden fået forsidens `awaiting_reply_from` og klokken (#790)
  som svar på «hvem venter». Det bedste er at listen ikke henter løse beskeder
  overhovedet — tekst fra `conversations`, tal fra én smal hentning uden loft.
- **Fejlet træk** — «ingen besked til nogen» er sandt, men kortets løsning
  (ét kald til rådgivernes klokke) er kun halvdelen. To modtagere: medlemmet
  (klokke + mail, `action_required`, deep link til aftalen og fakturaen — det
  er deres kort) og rådgiverne (klokke, dedup pr. FAKTURA — Stripe sender
  `invoice.payment_failed` pr. forsøg, op til fire for én regning). Og Stripes
  egen kunde-mail skal afgøres FØRST, så vi ikke sender to. Kræver Stripe.
- **Community-fravalgsnøgle** — udsat, ikke løst. Fanen fik fem nøgler i dag
  (#773, «det koden læser»); community er inde i «Opdateringer». **Målt 10/9
  kl. 20:18: NUL af 31 profiler har slået noget fra** — men 102 community-mails
  på tredive dage til 26 modtagere, cirka fire opslag om ugen til alle. Fanen
  blev først brugbar i dag. Slår nogen «Opdateringer» fra, ved vi at de vil
  have færre mails, og så er en sjette nøgle svaret. Indtil da er det en
  løsning på et problem ingen har.

**Seks lukket som løst uden at være lukket** (`de-naeste-ti.md` §0, bekræftet
ved grep 10/9 aften): «Poster kan ikke slettes» (`HbBudgetEditTable:660-669`:
enhver række kan fjernes og hentes tilbage); «Session-forberedelsen skjules af
et rent UI-filter» (RLS-carve-out siden 31/8, `20260831131200:20`, «44 → 26
synlige, 18 → 0 session_prep» — ikke kun UI); «Velkomstbesked skriver ugyldig
værdi» (`send-welcome-message` har ingen kaldere — kortet var om en funktion
der ikke kører; den står i «Ni døde mails»); «to rester bærer stadig topix.dk»
(grep: kun to kommentarer tilbage); «send-pulse-reminder sender kun til
member» (cronen fjernet 12/6; kortet sagde selv «Ikke målt»); «Fantom-ulæste
beskeder» (samme kort som «delt ulæst-markering» — taget af listen af Jonas i
eftermiddag). Rykker-kortets titel rettet: beløbet er rettet (#799), rykkerne
mangler stadig.

**Mangellisten efter denne bogføring: 135 kort** — 3 slettet og 3 nye i deres
sted, 3 omskrevet, 6 lukket, 1 titel rettet (140 → 135). Tælleren i listens
værktøjslinje regner selv.

### Restancen — sat op i Stripe 10/9 kl. 20:50–21:05: ingen bliver lukket ned i tavshed

**Hvad vi fandt** (målt i Dashboard 10/9 kl. 20:43, ny konto
`acct_1U6mzp3CvBmCx5Pt`): «Send emails when card payments fail» var
SLÅET FRA, og «If all retries for a payment fail» stod på **CANCEL THE
SUBSCRIPTION**. Et medlem hvis kort fejlede, mistede sit abonnement efter
to ugers forsøg — uden at nogen fik besked, hverken medlemmet eller
rådgiveren. Og vores webhook havde ikke set det: alle subscription-events
for abonnementer med en `art` springes over (hvidlisten #563), så `canceled`
skrev intet i databasen; resten af årets rater kom aldrig, `contract_end_date`
stod, og adgangen løb året ud på en delvist betalt kontrakt. Det eneste spor
ville være en `fejlet`-række i `company_traek` og en badge på listen.

**Aftalen var ikke skrevet ned.** `docs/` havde to beslutninger — §9 i
fornyelseskæden (1/9: «Stripe skal ende i unpaid») og adgangsdomme §6
(3/9: udskudt; «en fejlet rate er en inddrivelsessag, ikke en adgangssag»)
— og ingen af dem sagde det Jonas husker: «I stedet for bare at lukke
deres abonnement ned, så sørger vi for at blive ved med at gøre opmærksom
på det og sender en invoice.» Reconen (`~/Downloads/recon-restance.md`)
slog Stripes regler op i dokumentationen frem for at huske dem — vi har
bogført at Stripes parametre ikke er til at gætte.

**Besluttet og sat op 10/9 — Stripe ender i `past_due`, ikke `unpaid` og
ikke `canceled`.** Slået op: `unpaid` stopper alle forsøg, lægger nye rater
som kladder og **invaliderer linket i Stripes fejl-mail**; `canceled` er
terminal og dræber schedulen; `past_due` holder fakturaerne åbne, nye
rater kommer og forsøges, og linket lever. Adgangen afgøres alligevel af
`contract_end_date`. Ændret på den nye konto: Smart Retries 8 over 2 uger →
**8 over 1 måned**; slutvalg → **leave past-due** (både for retries og for
«incomplete for 15 days»); kortfejl-mails og udløbende-kort-mails **TIL**;
«Payment method updates» fra fire URL'er på `www.theboardroom.dk` (forkert
vært, platformen er `app.`) → **Stripe-hosted page**; kundeportal-link
**TIL**; sprog **dansk**. «Upcoming renewals» **blev FRA med vilje** —
huset sender egne fornyelsesvarsler. Gammel konto (`acct_1QP3Js4DoYItGRbI`,
Circle, 13 abonnementer + YKRG): mails og portal var allerede til;
«incomplete» rettet til past-due; **retry-planen kan ikke ændres — Circle
ejer kontoen**, endnu en grund til at flytte de fjorten. §9 i
`fornyelseskaeden-1-september.md` er rettet i denne bogføring.

**Det der stadig skal bygges — to kort på mangellisten (Betaling):**
(1) rådgivernes klokke ved fejlet træk: ét kald til `skrivRaadgiverBesked`
(#799) i `invoice.payment_failed`-grenen, dedup på `company_traek.id`;
ingen mail til medlemmet fra os, Stripe sender den nu. (2) Retries opbrugt
→ fakturaen sendes automatisk (Jonas' aftale): når `next_payment_attempt`
er null, kald `invoices.send` — Stripe har ingen indstilling der gør det
(slået op: slutvalg, collection method, Automations). Begge før 13/9 hvis
det kan nås: doggybeds første træk på den nye konto er beviset.

**Fund ved siden af, ikke rettet:** `computeMembershipTier` gør `past_due`
til `expired` STRAKS for selvbetjeningsabonnementet (kender kun `"active"`)
— strengere end politikken «past_due = åben». Rammer nul i dag (ingen
selvbetjenere); rettes med de fem domme den dag den første findes
(adgangsdomme §6). Og webhookens `customer.subscription.deleted` kan ikke
se forskel på «afsluttet efter tolv rater via cancel_at» og «annulleret
efter fejl» — begge er `skipped`; med past-due sker det sidste ikke
længere automatisk, men en manuel annullering i Dashboard er stadig tavs.

### Ugefokus og ugeagenten — to funktioner, to pipelines; ÅBENT PUNKT til Jonas og Morten (10/9, nat)

> **STATUS 13/9:** punktet er AFGJORT 11/9 (Jonas, ordret: «A») og GJORT
> 13/9 — `run-weekly-agent` er slettet i #836, og `weekly_cron` er fjernet
> fra `run-company-agent`s hvidliste (DEL 2 «13. september» §16). Ugefokus
> kører uændret. Afsnittet nedenfor står som grundlaget for valget.

Jonas 10/9 kl. 22: «Jeg ved ikke om jeg er skarp nok til at vælge.» Det er
den rigtige grund til at vente. `run-weekly-agent` har ALDRIG kørt, så den
kan vente en dag mere uden at nogen mærker det. Grundlaget står her
(`~/Downloads/recon-ugeagenten.md` og `recon-ugefokus-vaerdien.md`, uden
for repoet — det væsentlige er gengivet nedenfor), så valget kan træffes på
fem minutter.

**1. Hvad der er målt — to funktioner med overlappende navne, to pipelines,
ét delt bord.**

- **`generate-weekly-focus`** (632 linjer) HAR `Deno.serve`, `verify_jwt =
  true`, kaldes af pg_cron `generate-weekly-focus` mandag kl. 06 UTC via
  `kald_edge` (150 s). Det er en **regelmotor**: ti deterministiske
  triggers (REPORT_UPLOADED, BUDGET_DEVIATION > 15 %, MILESTONE_DUE_SOON,
  MILESTONE_STALLED, KPI_OFF_TARGET, BENCHMARK_BELOW, NO_REPORT_60_DAYS,
  HANDOUT_OVERDUE, POSITIVE_MOMENTUM) regnes i kode; AI (Gemini 2.5 Flash)
  bruges KUN til at formulere headline + 2–3 sætninger, og kun når en
  trigger fyrer. Ingen trigger → `quiet`, ingen tekst. Ingen tal på 90
  dage → `no_data`, ingen tekst. Én række pr. virksomhed der passerer
  gaten (status active/null + tier ≠ expired, `ugensFokusGate.ts`) pr.
  uge — derfor **133 rækker over W32–W37, 25–30 om ugen**. Den skriver
  ALDRIG `agent_runs`. Den er ikke agenten.
- **`run-weekly-agent`** (90 linjer) er KUN et `Deno.cron("weekly-company-
  agent", "0 7 * * 1", …)` — ingen `Deno.serve`, ingen kalder. `Deno.cron`
  eksekverer ikke på Supabases edge-runtime (DEL 4; samme fejl som
  legat-cronen, lagt om i #797). Den skulle mandag kl. 07 kalde
  `run-company-agent` med `trigger: "weekly_cron"` og **`dry_run: false`**
  for hver aktiv virksomhed med godkendte tal. **Nul `weekly_cron`-rækker i
  `agent_runs`** (prod 10/9 kl. 21:08) — den har aldrig kørt.
- **De tre triggers der FAKTISK kører agenten:** `report_committed` (16,
  live ved hver rapportgodkendelse — `reportCommit.ts`, `ReportReviewDialog`),
  `anomaly_detected` (7, live når `detect-financial-alerts` finder noget;
  må ikke røre kortet med negativt), `company_review` (3, seneste 25/8 —
  rådgiverens knap i `AgentForslagPanel`, altid tør; ikke slået fra, bare
  ikke trykket på siden testene 25/8, samme dag #433 gjorde tør til
  standard og onboardingens chat-velkomst blev lukket).
- **Det delte bord:** begge skriver `weekly_focus` på `(company_id,
  week_key)` — regelmotoren direkte, agenten via værktøjet
  `update_weekly_focus` (`_shared/agentSkriveveje.ts`). Sidst skrevne
  vinder. Ved en rapportgodkendelse kaldes BEGGE inden for sekunder
  (`reportCommit.ts:12-36`); rækkefølgen er ikke styret. I prod kan de
  skelnes: agentens rækker har `trigger_data ? 'trigger'`.

**2. De tre valg for `run-weekly-agent` — vælg ét.**

| valg | for medlemmet | kræver | koster |
|---|---|---|---|
| **A. Slet** | Ingen ændring — den har aldrig kørt. Medlemmet får fortsat ugefokus (regelmotoren) hver mandag og agentens nøglefund ved hver rapportgodkendelse. Mandagen får ingen «anden stemme». | Slet filen og `config.toml:33-34`; ret kommentaren i `ugensFokusGate.ts:18`. En time. | Intet. |
| **B. Omlæg** (Bucket B som #797: `Deno.serve` + `authenticateServiceRole` + tørkørsel default + `kald_edge`) | **Tørt:** intet for medlemmet — 13–20 forslag lander i Agent-loggen hver mandag til rådgiverens godkendelse (i dag afgøres 0; de otte fra 25/8 lå til 6/9). **Live:** agenten overskriver ugefokus' kort med sit eget og lægger forslag (`source_type agent`) og milepæle direkte hos medlemmet, uden godkendelse — «slukkes agenten, ændres medlemmets hverdag» (Agentkæden 6/9). | Omlægning ½ dag; beslutning tørt/live; og en rådgiver der afgør forslag mandag morgen. Kl. 07 EFTER ugefokus kl. 06 → to skrivere til samme række. | 13–20 kald pr. mandag × op til 12 Gemini-iterationer ≈ 100–200 gateway-kald og 10–20 min kørsel om ugen, ud over ugefokus' egne 15–25 kald. Kroner: kræver Lovable-gatewayens forbrug for én `report_committed`-kørsel som målestok. |
| **C. Byg færdig** (omlæg OG afklar mod ugefokus: ÉN motor pr. mandag) | Ét mandagskort med én stemme — enten regelmotoren alene (som i dag) eller agenten alene med ugefokus' triggers som input; men så skal «tal kun når en trigger fyrer» bygges ind i agenten. | Design: hvem ejer mandagens kort, og hvad må skrives uden godkendelse? Det er opgave-epic'et (DEL 3), ikke en rettelse. | Dage. |

**Spørgsmålet bag valget:** vil I have en AI-agent der hver mandag, uden
menneske, ændrer medlemmets forside og lægger opgaver — ud over det
agenten allerede gør ved rapportgodkendelse? Nej → A. Kun med godkendelse
→ B tørt, og nogen skal afgøre forslagene mandag morgen. Ja → C.

**3. Spørgsmålet bag DET: giver ugefokus «overhovedet værdi», og larmer
den?** Jonas 10/9: «Hvornår giver det mening, fordi det kun er for dem der
sker noget ved … Vi vil jo ikke larme unødigt.» Fund:

- Motoren er ALLEREDE bygget efter det princip: `quiet` uden trigger,
  `no_data` uden tal, og forslag (`ai_weekly`) holdes tilbage når ét
  forslag venter ubesvaret (`maaSkriveForslag`, Jonas 8/9). Kun
  `active`-rækker bliver til tekst for et menneske. **Hvor mange af de 133
  der var `active`, er ikke målt** — det er tallet «larmer den?» handler
  om (SQL nedenfor).
- Det medlemmet ser er tre linjer i fokuskortet «Dit næste skridt»:
  overskriften **«Ugens fokus er klar»** (fast, `nextStep.ts:310`),
  manchetten = `weekly_focus.headline` (AI, ≤ 8 ord), brødteksten =
  `weekly_focus.summary` (AI, 2–3 sætninger med tal). Knappen «Se ugens
  fokus» peger på `/` — siden man står på — og **vises derfor aldrig**
  (`BoardroomView:1285`). Punktet har prioritet 4: under manglende
  rapport, rapport der venter, puls og ulæste beskeder; over milepæle og
  forslag. Er intet over det, ER det forsidens overskrift den uge.
- **`seen_at` er en død skrivevej** (0 af 133): `weekly_focus` har ingen
  UPDATE-policy for medlemmer (kun SELECT + service role, `20260329190316`),
  så forsidens `markSeen` rammer nul rækker uden fejl. Det er matematik,
  ikke adfærd — det siger intet om hvor mange der læser. **Rettes nu i det
  andet vindue.** Når skrivevejen virker, forsvinder punktet efter første
  visning — så spørgsmålet om værdi handler om **de tre LINJER** (er
  headline og summary noget medlemmet handler på, eller AI-tekst om det
  samme hver uge?), ikke om at kortet fylder.
- Recon-de-tre §1 pegede på et alternativ til at åbne skrivevejen: tage
  slot (d) ud og vise resuméet som tekst i kortet uden at optage en
  handlingsplads. Det er en designbeslutning; med skrivevejen rettet er
  den ikke længere nødvendig for at lukke fejlen.

**4. Hvad der skal måles FØR beslutningen — kræver prod.** `weekly_focus.
seen_at` kan ikke svare. Det der faktisk skrives, er notifikationen
`weekly_focus_ready` (prioritet `info`, én pr. medlem pr. uge), som klokken
(#790) stempler `seen_at` på ved åbning og `read_at` ved klik:

```sql
-- Læser nogen ugefokus? (klokken stempler seen_at/read_at — det eneste «set» der skrives i dag)
SELECT count(*) AS alle, count(seen_at) AS set_i_klokken, count(read_at) AS laest,
       count(DISTINCT user_id) AS medlemmer,
       count(DISTINCT user_id) FILTER (WHERE seen_at IS NOT NULL) AS medlemmer_der_saa
FROM public.notifications WHERE type = 'weekly_focus_ready' AND created_at > now() - interval '6 weeks';

-- Hvor tit taler den? active = der stod tre linjer for et menneske
SELECT week_key, count(*) AS raekker,
       count(*) FILTER (WHERE status = 'active') AS active,
       count(*) FILTER (WHERE status = 'quiet') AS quiet,
       count(*) FILTER (WHERE status = 'no_data') AS no_data,
       sum(actions_generated) AS forslag
FROM public.weekly_focus GROUP BY week_key ORDER BY week_key DESC;

-- Gentager den sig? Samme trigger uge efter uge for samme virksomhed = larm
SELECT company_id, count(*) AS uger_med_fokus, array_agg(DISTINCT t) AS triggers
FROM public.weekly_focus, jsonb_array_elements_text(triggers_fired) t
WHERE status = 'active' GROUP BY company_id ORDER BY uger_med_fokus DESC;

-- Svarer nogen på ugefokus' forslag? (ai_weekly mod agent mod rådgiver)
SELECT source_type, status, count(*) FROM public.company_actions GROUP BY source_type, status ORDER BY 1, 2;

-- Agentens kørsler pr. trigger (weekly_cron forventet 0)
SELECT trigger, mode, count(*), max(started_at) FROM public.agent_runs GROUP BY trigger, mode ORDER BY 1, 2;
```

Læses den (set_i_klokken og medlemmer_der_saa > 0) og taler den kun når
noget fyrer (active en brøkdel af raekker, få gentagelser), er ugefokus
værdien, og A er det rigtige for ugeagenten. Læser ingen den, er
spørgsmålet ikke A/B/C, men om de tre linjer skal skrives anderledes — og
det er en samtale med Morten om hvad et medlem skal møde mandag morgen.

### 10. september, nat, sidste — Morten-gaten, døren, ugefokus og kortgennemgangen (#805–#809)

Fem PR'er efter klokken ni. Tre er fejl vi selv lavede eller arvede, fundet af
det tredje vindues kortgennemgang samme aften; to er selve gennemgangen.

**1. Morten-gaten (#805).** #803s nye «Fjern fra virksomheden» blev bygget
ADMIN-ONLY: `manage-advisor` havde `ADVISOR_ALLOWED_ACTIONS = ['list']`, og
fladen dømte på `isAdmin` — Morten kunne hverken se eller bruge knappen, en
time efter vi byggede den. Det er kort 109's mønster («hver ny admin-gate er
en Morten-gate»), bygget ind igen. Nu gated på `isAdvisor` (advisor ELLER
admin) begge steder, med et kildeværn der læser server og flade
(`medlemsfjernelse.test.ts`). Fundet bredt, IKKE rettet: `generate-weekly-focus`
manuelt (admin), «Rediger virksomhedsdata» og «Slet virksomheden» (admin),
`session_bookings` (kun admin-SELECT), `get_admin_group_list` — samme mønster,
egen beslutning.

**2. Døren (#807).** «Betalt» blev dømt SEKS steder på at `contract_end_date`
FINDES, ikke at den GÆLDER — fire døre i indgangen, to af dem SQL
(`hent_betalingstilbud`, `hent_betalingsdata_til_checkout`), plus
`afgoerBetalingsfrist` i begge spejle, `indgangsFaktura` og påmindelsescronens
filter. Et tidligere medlem bærer sin gamle slutdato med sig: genbrugt på CVR
ved «Godkendt» sagde alle døre «betalt» — ingen dag 0-mail, ingen faktura,
«Tak — du er inde» på siden, checkout afvist tavst. Og fejlen bag: den der
alligevel betalte, stod som `tidligere` bagefter — usynlig på rådgiverlisten,
uden ugefokus og påmindelser, sletningskandidat. Nu: én dom
(`erGaeldendeSlutdato`, samme grænse som `computeMembershipTier`: slutdagen
tæller med), en betaling sætter `status = 'active'` (indgang OG fornyelse, samme
pen som datoen), den gamle kontrakt bevares som `note` på den nye periode når
ingen periode dækker den, rådgiverne får «X er tilbage», og
`doeren.guard.test.ts` låser alle seks. **Migrationen
`20260911050000` er KØRT; begge SQL-døre bekræftet i prod.** Rammer ingen i
dag — men den første der kommer tilbage.

**3. Ugefokus (#809).** `seen_at` var NUL i 133 rækker over seks uger — ikke
fordi ingen læser, men fordi `weekly_focus` manglede en UPDATE-policy. RLS
gjorde UPDATE'en til «0 rows» uden fejl, og `markSeen` læste ikke svaret —
samme fejl som `const { data }` i rolletjekket (#797). Nu: policy for egen
virksomheds række, trigger der låser alle andre kolonner for andre end
service role, `markSeen` kaster ved fejl OG nul rækker (MutationCache logger).
Punktet «Ugens fokus er klar» sad før på en af fire pladser hele ugen og pegede
på den side man stod på; et set punkt rykker nu bagerst (prioritet 10, «Ugens
fokus · Læs igen») frem for at forsvinde — kortet er resuméets eneste hjem på
forsiden, og stemplet sættes ved første RENDER, også som stille linje nr. 4.
**Migrationen `20260911060000` er KØRT.** **ÅBENT:** kolonne-grants dækker ALLE
kolonner, ikke kun `seen_at`, så et medlem kan teknisk ændre sin egen headline
og summary. Ikke farligt (kun egen række, fladen tilbyder det ikke), men bredere
end nødvendigt — en `GRANT UPDATE (seen_at)` ville lukke det.

**4. Kortgennemgangen (#806, #808).** Et tredje Claude Code-vindue gik hele
mangellisten igennem kort for kort — 1.141 linjer
(`~/Downloads/kortgennemgang.md`). Dommen over 135 kort: **43 står, 48
omskrives, 36 ud, 8 udsat, 2 løst** — under en tredjedel kunne bygges som de
stod. Elleve af de 36 «ud» viste sig at skulle blive, da dommene blev prøvet
en gang til. Listen er faldet fra 178 (i morges) til **99**. Det er dagens
egentlige fund: en liste bygget over uger beskriver en platform der ikke
findes længere, og det billigste arbejde var at PRØVE kortene, ikke bygge dem.

**Dagens tal:** 40 PR'er merget. Fem nye cron-jobs i drift (onboarding-rytme,
legat-reminder, report-review, agentforslag-udloeb, opgave-forfald). Restancen
sat op i Stripe på begge konti. Parseren bevist i drift på ANLA GLAS.

### 11. september, formiddag — prod målt før noget blev kørt; kort 23 og 85 bygget; portalen; fire recons (#815, #816)

Kilder: `~/Downloads/query-results-export-2026-09-11_09-20-04.csv` (prod),
`…_09-26-05.csv` og `…_09-28-31.csv` (rytmens tørkørsel), `…_09-32-31.csv`
(ugefokus), `recon-a1-restance.md`, `recon-b1-medlemmets-foerste-dage.md`,
`recon-b2-indholdslaget.md`, `recon-b3-tallene.md`,
`verifikation-a1-klokke.txt`, `verifikation-b1-feedback.txt`,
`diff-a1-klokke-fejlet-traek.txt`, `-2.txt`, `-3.txt`. Tal herfra er
citeret ordret; konklusioner fra chatten står som konklusioner.

**1. Prod-målingen 09:20 — kilderne var uenige, og prod gav denne fil ret.**
OVERLEVERING sagde `20260911050000` og `060000` KØRT og onboarding-rytmen i
drift gennem `kald_edge`; kortene «Migrationer der venter på prod» og
«Onboardingens rytme …», plan §0A og A1 sagde det modsatte. §0A havde intet
at køre. Per migration, fra CSV'en (sektion → værdi):

- `050000` (døren): `hent_betalingstilbud(betalingstoken uuid)` — «har
  «+ 1 > now()»: true | md5 3529d05e158a71873a6791f5cd08b0c5»;
  `hent_betalingsdata_til_checkout(betalingstoken uuid)` — «har «+ 1 >
  now()»: false | md5 76178b0711e70b02ea86a6fe8a2ed8b9». **LUKKET kl.
  11:27** (§9): prods krop er tegn for tegn filens (`20260911050000:83-
  114`), samme md5, «har_repoets_betingelse true | har_tilbuddets_moenster
  false». «false» kl. 09:20 var præcis hvad den kørte fil ville give:
  checkout skriver bevidst det modsatte af tilbuddets mønster —
  `contract_end_date is null or … + 1 <= now()` — fordi checkout skal lade
  dem uden gældende slutdato betale. Fejlen var chattens: funktionen blev
  målt med søsterfunktionens betingelse. Migrationen er helt i prod.
- `060000` (ugefokus): fire policies — «Advisors can view all weekly focus»
  SELECT, «Members can view own weekly focus» SELECT, «Members set seen_at
  on own weekly focus» UPDATE roller {authenticated}, «Service role can
  manage weekly focus» ALL; trigger `protect_weekly_focus_seen_only`
  BEFORE UPDATE; «rækker / med seen_at: 171 / 2».
- `040000` (status): `companies_status_check` CHECK status IN ('active',
  'tidligere'); `companies_data_slettet_vej_check` med de fire veje; «status
  not null: true».
- `030000` (feedback-bucket): «feedback-screenshots: grænse 5242880 | typer
  {image/*}»; tre policies — «Advisors can read feedback screenshots»
  SELECT foldername false, «Users can read own feedback screenshots» SELECT
  foldername true, «Users can upload own feedback screenshots» INSERT
  foldername true.
- `20260907180000` (mailloggen): fem policies på `email_send_log` — «Admins
  can read send log», «Advisors can read send log» (SELECT, authenticated,
  `has_role(auth.uid(), 'advisor')`), tre service-role.
- `20260911020000` (sletning 15 min): «Advisors can delete messages»
  `has_role(… 'advisor')`; «Users can delete own messages within 15 min»
  `sender_id = auth.uid() AND message_type = 'user' AND created_at > now()
  - '00:15:00'`.

`cron.job`: **19 jobs** = 14 fra kald_edge-omlægningen + 5 nye.
`onboarding-rytme` står «0 8 * * *» gennem `kald_edge('onboarding-rytme',
'{"dry_run": false}')` — planlagt i hånden; filen `20260909180000` siger rå
`net.http_post` og «15 9 * * *». `intro-session-reminder` («0 9 * * *») og
`indgangs-paamindelser` («0 10 * * *») bærer `{"dry_run": false}`;
`fornyelsesvarsler` («0 11 * * *») ligeså. `run-weekly-agent` står der ikke.
`send-monthly-digest` «0 8 22 * *». Filhovederne i de syv migrationer har
fået én linje hver («KØRT i prod — målt 11/9 kl. 09:20»; `20260909180000`
en ADVARSEL: kør ikke filen).

**2. Onboarding-rytmens tørkørsel 09:26:05 dansk** (`kald_edge` → id 9035;
svar «status 200 | timed_out false»): `{"ok":true,"dry_run":true,
"virksomheder":27,"kandidater":2,"sendt":0,"ville_sende":0,"pr_mail":
{"kom_i_gang":0,"historik":0},"sprunget_over":{"ingen_start":0,"legat":0,
"allerede_sendt":0,"har_uploadet":0,"uden_for_vindue":2,"ingen_email":0,
"opt_out":0},"fejlet":0}`. Kørslen kl. 10 sendte intet. **Afsendelsesgrenen
er ubevist.**

**3. Ugefokus 09:32 — grundlaget for §0B, som IKKE er besluttet.** Klokken
har stemplet siden 26/3 (sektion a: «første seen_at 2026-03-26
13:43:53.336926+00 | første read_at 2026-03-26 13:44:04.776193+00»).

- b) klokkens ugefokus pr. uge (alle | set | læst | medlemmer | medlemmer
  der så): W37 13 | 2 | 1 | 13 | 2 · W36 13 | 2 | 1 | 13 | 2 · W35 14 |
  4 | 1 | 14 | 4 · W34 11 | 3 | 0 | 11 | 3 · W33 10 | 3 | 1 | 10 | 3 ·
  W32 1 | 1 | 1 | 1 | 1.
- c) `weekly_focus` pr. uge (rækker | active | quiet | no_data | forslag |
  seen_at): W37 30 | 13 | 1 | 16 | 30 | 2 · W36 25 | 13 | 1 | 11 | 31 | 0 ·
  W35 25 | 13 | 1 | 11 | 33 | 0 · W34 25 | 10 | 2 | 13 | 25 | 0 · W33 24 |
  10 | 2 | 12 | 22 | 0 · W32 4 | 4 | 0 | 0 | 6 | 0 · W31 2 · W30 1 · W29 1
  · W27 4 · W26 1 · W25 1 · W24 5 · W23 4 (active 3, quiet 1) · W22 3 ·
  W21 2 · W20 3 · W19 3 · W18 3 · W17 3 · W16 2 (alle active, seen_at 0).
- d) gentagelse i `active`: Topix.dk ApS «uger active 13 | kombinationer
  5»; Doggybed 10 | 4; Floren Engros 9 | 3; Booking Innovation 9 | 4;
  Warburg VVS & Kloak Ekspres ApS 8 | 4; Rallysupport 7 | 5; BR Roset 7 |
  2; ANLA GLAS A/S 7 | 3; Capture IT A/S 6 | 2; Rezycl.com 4 | 3; remm. 4
  | 3; PHILBERT ApS 4 | 2; BRILLEVÆRK 4 | 2; Livja 2 | 1; Brick Works ApS
  2 | 1; YKRG APS, TOFT ADMINISTRATION ApS, Limo Group – Viborg Limousine
  Service, Homie Håndværkerservice ApS 1 | 1 (`["onboarding"]`).
- e) forslag og svar: ai_weekly · expired 90, proposed 56, dismissed 11,
  done 7, dropped 2; agent · expired 5, proposed 4, done 1; manual · done
  3, expired 1; advisor · dismissed 1.
- f) agentkørsler: report_committed · live «antal 13 | seneste 2026-09-10
  07:06:06.44+00»; anomaly_detected · live 7 | 2026-09-10 07:06:07.476+00;
  report_committed · dry_run 3 | 2026-08-25 08:56:03.357+00;
  company_review · dry_run 3 | 2026-08-25 12:46:18.582+00.

Konklusion fra chatten 11/9 (ikke en måling): ingen af DEL 2 «Ugefokus og
ugeagenten»s to grene passer rent på tallene; begge læsninger peger på A
(slet) for `run-weekly-agent`; hvad ugefokus skal sige er samtalen med
Morten; forsidens `seen_at` (060000 kørt) har sin første hele uge efter
mandag 14/9. **§0B er ikke besluttet.**

**4. Stripe 11/9.**
- **Kundeportalen:** login-linket er IKKE aktiveret på nogen af kontiene.
  Rettelse fra chatten: «kundeportal-link TIL» fra 10/9 (DEL 2 «Restancen»)
  er en anden indstilling, som ikke er identificeret.
- **Ny konto:** «Cancel subscriptions» stod TIL (cancel at end of billing
  period, cancellation reason TIL) og blev slået FRA kl. 10:01.
  Konfigurationen gemt som Default (`bpc_1UEPNp3CvBmCx5PtUR…`, afkortet på
  skærmen). Begrundelse: et medlem kunne stoppe sine rater, og webhooken
  springer `subscription.deleted` over for abonnementer med art. **ÅBENT:**
  om gemningen skrev standardværdier for de øvrige sektioner (preview'et
  viste bagefter moms-id og fakturahistorik).
- **Gammel konto:** konfiguration `bpc_1QmwE84DoYItGRbI78…` med opdatering
  og opsigelse i preview'et. Ikke rørt — Circle ejer kontoen.
- **Doggybeds abonnement:** art `migreret`, `company_id`
  `382fd787-3141-45c7-8eea-297b7b947fe0`, `migreret_fra`
  `sub_1SHhE54DoYItGRbIRxusRUjG`, kort ••••8134, 13/9 = 3.500 + 875 moms =
  4.375 kr., ophører 13/10 kl. 10:35, ingen fakturaer endnu. Kun ét træk på
  den nye konto.
- **Slået op i Stripes dokumentation:** `next_payment_attempt` er null ved
  manuel opkrævning, lukkede fakturaer og maksimale forsøg; API-referencen
  for `/send` siger intet om `charge_automatically`; events kommer ikke
  garanteret i rækkefølge og kan leveres igen; portalens opsigelse er slået
  til som standard.

**5. Bygget.**
- **#815 merget — kort 23 og klokkens virksomhedslink.** Reconen
  (`recon-a1-restance.md`) fandt at `payment_failed`-grenen upsertede
  `company_traek` og skrev `console.error` — intet andet; at upsertet ikke
  gav rækkens id tilbage; at webhooken ingen dedup har på event-id; og at
  `klokke.ts:109` byggede `/virksomheder/{id}` (flertal) mens ruten er
  `/virksomhed/:companyId` (`App.tsx:259`) — flertalsformen ramte NotFound,
  og testen låste kun strengen. Bygget: `maaRegistrereFejlet`,
  `TYPE_TRAEK_FEJLET`, `traekFejletBeskedTekst`, `beskedVedFejletTraek`
  (rene, testet), upsertet med `.select("id").single()`, `meldFejletTraek`
  (læser rækken tilbage, slår navnet op som fornyelsesgrenen, kalder
  `skrivRaadgiverBesked`; kaster aldrig, svaret er 200 som før med
  `klokke` i kroppen), `reference_type "traek"` → `/virksomhed/{id}?section=
  aftale`, linket i ental, kildeværn i `klokke.test.ts` der læser `App.tsx`.
  Dedup-regnestykket står i kommentaren: UNIQUE `stripe_invoice_id` → én
  række pr. faktura → ét `reference_id` → `skrivRaadgiverBesked` slår op
  på type + advisor_id + reference_id → otte forsøg giver én besked pr.
  rådgiver. **To rettelser efter diff-læsning:** (1) et betalt træk kunne
  vendes til fejlet af et forsinket event — `registrerAbonnementstraek`
  upsertede «fejlet» uden at se hvad rækken stod som; kommentaren over
  `meldFejletTraek` lovede et værn genlæsningen ikke gav; loglinjen ved
  «intet id tilbage» sagde «rækken mangler» om en skrevet række (diff-2:
  ren dom `maaRegistrereFejlet`, opslag før upsertet, `allerede_betalt`,
  egen loglinje). (2) Værnets kommentar lovede selvhelbredelse («et betalt
  event der kommer bagefter retter rækken») — men lander `invoice.paid`
  MELLEM opslag og upsert, er det allerede leveret; rækken står som
  `fejlet` med `betalt_at` sat, intet retter den, accepteret fordi vinduet
  er millisekunderne mellem to kald (diff-3). Tests 2841 → 2856; tsc exit
  0; `deno check --no-lock` nåede ikke typetjekket: «Could not find a
  matching package for 'npm:@lovable.dev/email-js@0.1.0'» i
  `managedEmail.ts:15`. **Update i Lovable klikket kl. 11:12** (dækker
  #815 og #816). **Skærmbeviset for linket er FØRT:** Jonas klikkede på
  «Ny resultatopgørelse fra remm.» i rådgiverens klokke og landede på
  virksomhedssiden — «Det virker umiddelbart» (chat 11/9 ca. 11:15, uden
  skærmbillede). **UDESTÅR:** stripe-webhook version bevises stadig af
  doggybeds event 13/9 (svaret bærer `traek.id` eller `klokke`).
- **#816 merget kl. ca. 11:05 — kort 85, feedback i Hb-skallen.** Motoren
  `src/lib/feedback.ts` (validering image/* og 5 MB, stien `{userId}/…`
  med kommentaren om storage-policyens mappetjek, grænser 120/2000, én
  IO-funktion i samme rækkefølge som før); `FeedbackDialog` bruger den
  («Bug» → «Fejl»); `HbFeedbackDialog` som HbDialog uden Radix; «Giv
  feedback» i sidebarens profilblok ved Indstillinger (`!isAdvisor`), i
  kolonnen og skuffen. Tests 2841 → 2853 (kildeværn mod migrationen
  20260911030000); tsc exit 0. Update kl. 11:12. **Bevis i prod
  (CSV 11:18, sektion a–c, ordret):** rækken i `feedback`
  «9dbf73b3-dc85-4e61-8a32-630fb55a602e | oprettet 2026-09-11
  09:15:59.737443+00 | titel TEST 11/9 — ignorér | kategori suggestion |
  virksomhed 3ffccc0f-f6a9-4a23-9515-db2e22e8ad49 | sti
  dff1d372-40f5-43fe-af8d-59e4e78b4119/1789118158396.png»; filen i
  `feedback-screenshots` «oprettet 2026-09-11 09:15:58.947622+00 | størrelse
  95723 | type image/png | første mappe = feedbackens user_id true»; én
  `advisor_notifications`-række «feedback_submitted | 1 siden 2026-09-11
  09:16:02.24866+00». **Rækken kl. 09:15 UTC (11:15 dansk) med titlen
  «TEST 11/9 — ignorér» er Jonas' test — ikke et medlem.**

**6. Recon-fund og beslutninger — skrevet ind i kortene** (mangellisten,
«RYDDET 11/9 FORMIDDAG»). Beslutninger er «besluttet 11/9 — forslag fra
chatten, stående uden indsigelse»: kort 24 ud af A1 med fem
forudsætninger; kort 26 ud af B1 (portalen er en indstilling, opsigelse
slået fra); præsentationen og profilen (kilde_type «praesentation» som
migration, mailen som ethvert opslag, skabelonen forudfyldes FRA profilen
uden at skrive tilbage, intet tidsvindue — de tre felter FINDES, #765);
57 bliver kolonnerne `hjalp`/`hjalp_at` på `member_progress`; 69 og 62
måler feedet for guid før bygning, episoder uden guid registreres ikke, 62
registrerer i begge afspillere; 40 retter chattens skuffe i samme bygning
(`afviger = !hit` dømmer uden mål); 29 bruger månedens budgettal, kun
omsætning og lønninger, rangorden budget > aftalt > standard, «Fra
budget» i panelet; 82 beholder `APP_BRANDING` til det gamle design er væk,
sletter de to umonterede komponenter, rækkerne først efter prod-måling.
Fem nye kort: rå HTML i klokkens chatbeskeder; driftlinjen dumper rå JSON;
en chatbesked i klokken åbner indbakken, ikke samtalen (set på skærm
10:49); slettefunktionens liste nævner ikke `community_reaktioner`,
`community_visninger`, `forside_sidst_set`, `raadgiver_opgaver`; «aftalt»
mål er ikke altid aftalt (tomt felt → 0, `NoegletalView.tsx:405`;
brancheskift skriver branchetal, `IndstillingerView.tsx:273`).

**7. Målingen 11:18** (`~/Downloads/query-results-export-2026-09-11_11-18-24.csv`,
sektion d–k ordret; læsningerne er chattens 11/9 og `recon-a2-raadgiverfladen.md`):

- **d — `session_bookings`** (`d_session_policy`, `d_session_skema`): «Admins
  can view all session bookings | SELECT | has_role(auth.uid(),
  'admin'::app_role)», «Advisors read all session bookings | SELECT |
  has_role(auth.uid(), 'advisor'::app_role)», «Service role can manage
  session bookings | ALL | (auth.role() = 'service_role'::text)», «Users can
  view own session bookings | SELECT | (auth.uid() = user_id)»; kolonner
  «advisor | text», «slut_tid | timestamp with time zone», «start_tid |
  timestamp with time zone». **Læsning: `20260908190000_session_tid` ER
  kørt** — `start_tid`, `slut_tid` og policyen «Advisors read all session
  bookings» findes. Filhovedet har fået linjen «KØRT i prod — målt 11/9 kl.
  11:18».
- **e — sessioner** (`e_sessioner`): «jonas · booking_sent · betalt | 3 |
  med calendly_event_uri 0», «jonas · pending · betalt | 9 | med
  calendly_event_uri 0», «morten · booked · gratis | 2 | med
  calendly_event_uri 2», «morten · booking_sent · gratis | 1 | med
  calendly_event_uri 0». **Læsning:** `amount_dkk > 0` betyder at sessionen
  koster penge, ikke at den er betalt. «pending» er en checkout der ikke
  blev gennemført; «booking_sent» er betalt (stripe-webhook ved
  `checkout.session.completed`, recon-a2 kort 76 §2).
- **f — samtalelistens vindue** (`f_vindue`, `f_vindue_ulaeste`): «beskeder
  i alt / samtaler med beskeder / samtaler hvis nyeste besked er ældre end
  nr. 500 | 604 / 25 / 0»; «ulæste medlemsbeskeder (user) ældre end nr. 500
  | 0». **Læsning: vinduet er ikke ramt i dag.**
- **g — beskedtyper** (`g_beskedtyper`): «system | 120 | ulæste 0», «user |
  481 | ulæste 8», «welcome | 3 | ulæste 3». **Læsning:** fantomen er de tre
  welcome-rækker; `legat-momentum-reminder` og `reflection-nudge` har ingen
  rækker i prod.
- **h — FK'erne på `financial_report_facts`** (`h_fk_facts`):
  «financial_report_facts_company_id_fkey | FOREIGN KEY (company_id)
  REFERENCES companies(id) | confdeltype a»,
  «financial_report_facts_source_report_id_fkey | FOREIGN KEY
  (source_report_id) REFERENCES financial_reports(id) | confdeltype a» —
  begge NO ACTION.
- **i — flere virksomheder** (`i_flere_virksomheder`): «brugere med mere end
  én company_members-række | 0».
- **j — invitationer** (`j_invitationer`, `j_invitationer_skema`): «accepted
  | 40 | ældste 2026-02-27 13:33:53.302158+00 | uden virksomhed 30»,
  «pending | 3 | ældste 2026-09-01 11:32:58.761229+00 | uden virksomhed 0»;
  «company_id nullable | YES». **Læsning: drift mellem repo og prod** —
  `company_invitations.company_id` er nullable i prod, men ingen migration
  i repoet fjerner NOT NULL (`20260225103844:3-13` opretter den NOT NULL;
  recon-a2 kort 3 §1).
- **k — HTML i klokken** (`k_klokke_html`, `advisor_notifications` pr.
  type, «antal | tekst med html-tags»): «agent_insight | 105 | 0», «drift |
  18 | 0», «feedback_submitted | 13 | 0», «handout_completed | 54 | 0»,
  «new_message | 251 | 163», «report_uploaded | 313 | 0». **Læsning: 163 af
  251 `new_message`-rækker har HTML-tags; alle andre typer 0.**

**8. A2-reconen og beslutningerne** (`~/Downloads/recon-a2-raadgiverfladen.md`;
skrevet ind i kortene, mangellisten «RYDDET 11/9 FORMIDDAG», del 2):

- **Kort 3 «Hængende invitationer har intet hjem» — FJERNET som løst.**
  Kortets påstande holdt ikke: `HbInvitationer` (#754) viser ALLE åbne
  invitationer på tværs på `/virksomheder` (`VirksomhedslisteView.tsx:524`),
  ældste først (`lib/invitationer.ts:41-43`), med alder, rust over 30 dage
  (`GAMMEL_DAGE = 30`), gensend og slet pr. række (`:36-72`); og
  `MembersAdminSection` viser «Afventende invitationer» for admin. Prod
  11:18: 3 afventer, ældste 1/9. Beviset står her.
- **Kort 83 «Fjern fra virksomheden … /members' knap sletter stadig
  mennesket»:** knappen ses kun af admin (`MemberCompanyRow.tsx:339
  maaFjerneMedlem(isAdmin, …)`); en admin kan stadig kalde `remove-member`
  direkte via API (gaten er `callerIsAdmin`, `manage-advisor/index.ts:104-
  109`); handlingen sletter i tre skridt uden transaktion (`:411-426`);
  begge FK'er på `financial_report_facts` er NO ACTION (målt 11:18, h);
  kildeværnet `medlemsfjernelse.test.ts:70-89` læser ikke `Members.tsx`.
  **Besluttet 11/9 — forslag fra chatten, stående uden indsigelse:** knappen,
  serverens `remove-member`-gren og `maaFjerneMedlem` fjernes i samme
  bygning. Rigtig sletning af en person har sit eget kort.
- **Kort 76 «Jonas ser Mortens sessioner og omvendt»:** påstanden om RLS
  holdt ikke — rådgiver-SELECT findes (`20260908190000:54-58`) og er kørt i
  prod (d). Betalte sessioner stopper ved `booking_sent` (recon-a2 kort 76
  §2: ingen booking-id i Calendly-linket, webhooken filtrerer `advisor =
  'morten'`). Prod: 3 `booking_sent`, 9 `pending`. **Besluttet 11/9 —
  forslag fra chatten, stående uden indsigelse:** `booking_sent`-rækker
  vises som «betalt {dato} · booking-link sendt» uden afholdt-dom; `pending`
  vises ikke.
- **Kort 46 «Rådgiverens samtaleliste regner tal … af 500 løse beskeder»:**
  ikke ramt 11:18 (f); `conversations` har ingen tekstkolonne (kun
  tidsstempler, recon-a2 kort 46 §1); der findes ingen RPC der tæller
  ulæste pr. samtale (§3) — begge kræver en migration. **Ud af A2 11/9.**
- **Kort «Én bruger med flere virksomheder»:** målt 0 (i) — parkeres som idé
  efter kortets egen regel.
- **Klokkefund (a) og (c):** (a) `send-slack-chat-notification/index.ts:126
  preview = (message.content || "").slice(0, 250)` — rå Tiptap-HTML, ingen
  strip — skrives til `advisor_notifications.body` (`:275-283`); ingen delt
  `stripHtml` findes i `src/lib` eller `_shared`; prod k: 163 af 251. (c)
  rækkens `reference_id` er `message.id`, ikke samtalens (`:275-283`);
  `/chat?conversationId=…&messageId=…` FORSTÅS af `CompanyChatPane.tsx:278-
  297`, og `notifications`-dual-write bærer allerede det link (`:293`) —
  `klokke.ts` kan ikke bygge det uden opslag, fordi samtale-id'et ikke
  står på rækken.
- **DEL 3-rækken «/members er tømt» holdt ikke:** header, «Importér
  ansøgning», «Inviter ny bruger», `MembersStatsBar`, listen med
  `MemberCompanyRow` og `MembersAdminSection` er stadig monteret
  (`Members.tsx:1044-1075, :1184-1200, :1239-1249`; recon-a2 kort 3 og 83
  §4). Rækken er rettet.

**9. Målingerne 11:27 og 11:28, og feedet** (`~/Downloads/query-results-
export-2026-09-11_11-27-14.csv`, `…_11-28-49.csv`,
`recon-feed-og-checkoutdoeren.md`).

- **Checkout-døren er lukket (11:27).** Prods krop af
  `hent_betalingsdata_til_checkout(betalingstoken uuid)` er tegn for tegn
  identisk med filens (`20260911050000:83-114`, citeret i reconens måling
  B); md5 uændret `76178b0711e70b02ea86a6fe8a2ed8b9`;
  «har_repoets_betingelse true | har_tilbuddets_moenster false». Linjen der
  dømmer: `and (c.contract_end_date is null or c.contract_end_date + 1 <=
  now())`. Målingen 09:20 ledte efter tilbuddets mønster «+ 1 > now()»;
  checkout skriver bevidst det modsatte, fordi checkout skal lade dem uden
  gældende slutdato betale (tilbuddet `:60-61` og checkout `:104` er
  hinandens komplement). «false» kl. 09:20 var præcis hvad den kørte fil
  ville give — fejlen var chattens, og punktet stod åbent i to timer.
  Migrationen `20260911050000` er dermed helt i prod; filhovedets linje 1
  siger det nu; kortet «Migrationer der venter på prod» er fjernet som
  løst; DEL 4 har fælden.
- **Feedet — beslutning 17** (reconens måling A, `curl` mod
  `podcast-rss/index.ts:19`, HTTP 200, 88021 bytes): 18 items; 18 med
  ikke-tom `<guid>`; 18 forskellige; 14 i UUID-form og 4 som
  `https://api.spreaker.com/episode/<tal>`; alle 18 med
  `isPermaLink="false"`; `<itunes:episode>` og `<itunes:season>` på alle 18,
  sæson 1 på alle, episodenummer unikt; parserens reserve
  (`PodcastTalksView.tsx:76`, `:93`) bruges ikke. Nyeste episode «Wed, 17
  Sep 2025 07:10:31 GMT», ældste «Fri, 14 Feb 2025 11:56:08 GMT».
  *Læsning fra chatten 11/9:* guid-forudsætningen i beslutning 8 er
  opfyldt; et anker kan ikke bruge guid direkte, fordi URL-formen har kolon
  og skråstreg — `itunes:episode` kan; podcasten har ikke udgivet i næsten
  et år. **Besluttet 11/9 — forslag fra chatten, stående uden indsigelse:**
  kort 69 og 62 venter til Jonas og Morten har afgjort om podcasten
  fortsætter. B2 er dermed kort 56 og 57.
- **Kort 60 — prod før bygning (11:28, ordret).** a) De to CHECK'er
  migrationen skal skrive om: `community_traade_kilde_type_check` = «CHECK
  ((kilde_type = ANY (ARRAY['content_item'::text, 'event'::text])))»;
  `community_traade_kilde_check` = «CHECK ((((kilde_type IS NULL) AND
  (kilde_item_id IS NULL) AND (kilde_event_id IS NULL)) OR ((kilde_type =
  'content_item'::text) AND (kilde_item_id IS NOT NULL) AND (kilde_event_id
  IS NULL)) OR ((kilde_type = 'event'::text) AND (kilde_event_id IS NOT
  NULL) AND (kilde_item_id IS NULL))))». b) `opret_community_traad(p_titel,
  p_indhold, p_kilde_type, p_kilde_item_id, p_kilde_event_id,
  p_indhold_json)` er «security definer true | md5
  b938754b9cab7ab28405b1a293dfe303» og sender `p_kilde_type` uændret til
  `INSERT INTO public.community_traade (…, kilde_type, kilde_item_id,
  kilde_event_id) VALUES (…, p_kilde_type, p_kilde_item_id,
  p_kilde_event_id)` uden egen kontrol — CHECK'en er vagten; kort 60 skal
  ikke ændre funktionen. c) Tråde: «null | 10 | status aktiv, slettet» —
  10 tråde, alle uden kilde. d) Kolonner: `kilde_type text`,
  `kilde_item_id uuid`, `kilde_event_id uuid`, alle «nullable YES». e)
  Funktioner der nævner `kilde_type`: `get_community_feed(p_limit,
  p_offset)` (security definer, md5 `cebb8f9b713156d0556451feb949f4e8`),
  `get_community_traad(p_traad_id)` (security definer, md5
  `7ff983c83dc8a42adfff69b545617390`), `opret_community_traad` (ovenfor),
  `protect_community_traad_immutable_fields()` (security definer false,
  md5 `fa746e7d4c6f540d0a636f1f30e9f3d9`) — deres linjer læses før
  bygningen.

### 11. september, eftermiddag — fire beslutninger; digesten slukket i prod; kort 60 bygget (#818); to recons; målingerne 11:33, 11:43, 12:07 og 12:18

Kilder: `~/Downloads/query-results-export-2026-09-11_11-33-55.csv`,
`…_11-43-37.csv`, `…_12-07-50.csv`, `…_12-18-39.csv` (prod, ordret),
`~/Downloads/verifikation-kort60.txt` (bygningen, tre rettelser),
`~/Downloads/recon-a4-forsidens-dom.md` (kort 81 og 52),
`~/Downloads/recon-tre-oprydninger.md` (run-weekly-agent, digesten,
podcasten). Jonas' ord står som «Jonas 11/9»; det chatten foreslog og han
ikke svarede på, står som «forslag fra chatten, stående uden indsigelse».
Er en kilde uklar, står der «ikke målt».

**1. Jonas' fire beslutninger (Jonas 11/9, ordret).**

- run-weekly-agent: «A» — funktionen slettes (reconens vej A, §7).
- Digesten: «Sluk den». Slukket i prod kl. 12:07 (§2).
- Podcasten: «Jeg er enig i, at podcasten ikke giver mening lige nu. Men
  måske kunne man linke ind til vores podcast på Spotify et sted, hvor der
  er elegant. For det er sejt vi har det. Og vi har planer om at genoptage
  det faktisk. Vi lover bare ingen fast rytme. Og det er jo ikke indhold
  der er forbeholdt medlemmer. Det er for alle. Så det skal ikke fylde så
  meget.» Showets adresse (Jonas 11/9):
  `https://open.spotify.com/show/4T8krtMFTkRgF21bkNsQ6Q` — kanonisk uden
  «?si=»; siden verificeret 11/9: IVÆRKSÆTTERLIVET, Topix, værter Morten
  Larsen og Jonas Herlev. Feedet selv bærer ingen show-adresse (§7).
- KPI-mål trin 2: «Jeg er enig med dig!» — intet standardmål; hele
  fallbacken fjernes (§8).

**2. Digesten slukket i prod — kl. 12:07.** Kørt i SQL editoren:
`cron.unschedule('send-monthly-digest')`. FØR, ordret fra
`…_12-07-50.csv` (kolonner `active;command;fjernet;jobid;jobname;schedule`):
«true;" SELECT public.kald_edge('send-monthly-digest'); ";true;550;send-monthly-digest;0 8 22 * *».
Ét job, ikke to — reconens spørgsmål om dobbelt planlægning
(`recon-tre-oprydninger.md:90-93`: `20260810230000` kalder `cron.schedule`
med samme navn uden `unschedule`) er dermed besvaret af prod: jobid 550 var
det eneste. EFTER, ordret fra `…_12-18-39.csv` sektion `a_digest_efter`:
«jobs med navnet send-monthly-digest;a_digest_efter;0». Tilbagerulning:
planlæg med samme navn, skema og kommando. Koden står stadig
(indstillingen «Månedsoverblik», admin-knapperne «Månedlig digest» og
funktionen `send-monthly-digest`) og fjernes i oprydnings-PR'en (§8). Den
22/9 sender derfor kun PHILBERTs varsel 2 (DEL 3).

**3. Kort 60 — bygget, PR #818 (commit `550b90ad`), merget og i drift 11/9
eftermiddag (beviserne nederst i afsnittet).** Kilde: `verifikation-kort60.txt`. Tests før 2868 (187
filer); efter 2891 (188 filer), alle grønne; tsc nul fejl (RETTELSE 3,
`:382-389`). Tolv filer. Bygget (`:203-215`): A
`supabase/migrations/20260911120000_praesentation_kilde.sql`; A
`src/lib/hjemmebane/praesentation.ts`; A `…/__tests__/praesentation.test.ts`
(17 tests, kildeværn der læser migrationens udførte ALTER-linjer); M
`src/lib/onboardingTjekliste.ts` (syv punkter; gate); M
`onboardingTjekliste.test.ts` (37); M `src/hooks/useOnboardingTjekliste.ts`;
M `CommunityView.tsx` (`?praesentation=1` → udkast; kildeType; tag
«Præsentation»; invaliderer tjeklisten); M `communityApi.ts` (to
typelinjer). Dertil de tre rettelser:

- *Rettelse 1 — «gjort» = en AKTIV præsentation* (`:222-228`):
  `useOnboardingTjekliste.ts` gik fra `.neq("status","slettet")` til
  `.eq("status","aktiv")`. Afvigelse B (`:19-28`: medlemmets SELECT-policy
  `USING (status = 'aktiv' AND har_aktivt_medlemskab(auth.uid()))`,
  `20260811160000_community_adgang.sql:66-69`, så en skjult tråd kan ikke
  tælles i klienten) «er dermed bortfaldet: dommen og RLS siger det samme».
- *Rettelse 2 — tsc i to testfiler uden for listen* (`:249-319`):
  `TjeklisteInput` fik to påkrævede felter; fixtures i
  `focus.test.ts:365` og `:486` og `onboardingRytme.test.ts:120` byggede
  typen og fejlede tsc (3 fejl). Fixtures fik `kan_oprette_traad: true,
  har_praesentation: …` → tsc nul; én rød test tilbage.
- *Rettelse 3 — velkomstmailen A følger tjeklisten* (`:322-341`):
  `onboardingRytme.test.ts:125` låser paritet mellem mail A og tjeklisten;
  mailen hardkodede seks punkter. Jonas valgte vej (a): nyt punkt efter
  «Din profil» i begge kopier (`src/lib/onboardingRytme.ts:194-207`,
  `supabase/functions/_shared/onboardingRytme.ts:133-146`): «Præsentér dig
  i fællesskabet — et opslag om hvem du er, med et udkast ud fra din
  profil.» Ingen forventning ændret; paritetstesten grøn.

Fundene der står tilbage (ikke bygget):

- *Afvigelse A* (`:9-17`): `communityApi.ts:23` og `:102` fik
  `"praesentation"` i værdilisten for `kilde_type` — kun typen, ingen
  adfærd.
- *Afvigelse C / FIND 1* (`:30-35`): der findes ikke én klient-funktion der
  svarer til `har_aktivt_medlemskab`; punktet vises når `!isAdvisor &&
  !isLegat && membershipTier === "full"`. (a) `contract_end_date NULL`:
  klienten dømmer «full» (`useAuth.tsx:121-131`, `:130`), SQL false; (b)
  legat: klienten læser `legat_enrollments`, SQL `companies.is_legat`.
- *RETTELSE 3 punkt 3* (`:343-379`): `onboarding-rytme/index.ts:168`
  «companies-opslaget læser KUN id, name, is_legat»; `contract_end_date`
  læses ingen steder i filen. LEGAT: nej (`:133`). ABONNENT: får mailen,
  ikke tråden. VIRKSOMHED UDEN SLUTDATO: «JA … får mail A dag 0–1 med
  punktet «Præsentér dig i fællesskabet», mens har_aktivt_medlemskab
  kræver contract_end_date IS NOT NULL (20260907141500:56) —
  INSERT-policyen (20260811160000:75) og opret_community_traad afviser
  tråden. Samme hul har tjekliste-boksen: klienten giver no_date tier
  "full" (useAuth.tsx:130)». Skrevet ind som nyt fejl-kort i mangellisten.

Udrulningen — rækkefølgen fra `:217-219` («Uden SQL først afviser
CHECK'en præsentationen (23514)») — og beviserne, ét pr. trin:

1. *Merge.* `gh pr view 818 --json mergedAt,mergeCommit`, ordret:
   `{"mergeCommit":{"oid":"c0f456af1654c0ca41b7e2958a86cf41a7c3eb29"},"mergedAt":"2026-09-11T10:25:37Z"}`
   — 10:25:37 UTC = 12:25:37 dansk tid (CEST).
2. *Migrationen kørt i SQL editoren.*
   `~/Downloads/query-results-export-2026-09-11_12-26-41.csv` (kolonner
   `conname;def`), begge rækker ordret:
   «community_traade_kilde_check;CHECK ((((kilde_type IS NULL) AND
   (kilde_item_id IS NULL) AND (kilde_event_id IS NULL)) OR ((kilde_type =
   'content_item'::text) AND (kilde_item_id IS NOT NULL) AND
   (kilde_event_id IS NULL)) OR ((kilde_type = 'event'::text) AND
   (kilde_event_id IS NOT NULL) AND (kilde_item_id IS NULL)) OR
   ((kilde_type = 'praesentation'::text) AND (kilde_item_id IS NULL) AND
   (kilde_event_id IS NULL))))» og «community_traade_kilde_type_check;CHECK
   ((kilde_type = ANY (ARRAY['content_item'::text, 'event'::text,
   'praesentation'::text])))». Mod FØR-værdierne 11:28 (formiddagens §9
   a): den fjerde OR-gren og den tredje ARRAY-værdi er nye.
3. *Update og skærm.* Update klikket før 12:28 — ikke målt præcist.
   Skærmbilledet
   `~/Downloads/screencapture-app-theboardroom-dk-community-2026-09-11-12_28_09.pdf`
   (findes, 622336 bytes). Hvad det viser (chat 11/9): adressen
   `/community` uden parameter; composerens titel «Hej, jeg er Jonas
   Herlev»; overskrifterne «Det laver vi», «Det har jeg været igennem»,
   «Det leder jeg efter»; Jonas' egen tekst under «Det har jeg været
   igennem»; «Podcast & Talks» står stadig i menuen (podcasten ud er ikke
   bygget endnu).
4. *onboarding-rytme — udrullet EKSPLICIT i Lovables build-chat.* Lovables
   svar (chat 11/9), ordret: «Udrulningen af onboarding-rytme lykkedes kl.
   10:28 UTC (12:28 CEST) fredag 11. september 2026. Ingen filer, andre
   funktioner eller migrationer blev rørt.» Byggeriets verifikation havde
   skrevet at funktionen «deployer ved merge» — det var ikke målt, og om
   Lovable ruller en ændret delt fil i `_shared` ud ved merge, er stadig
   ikke målt (DEL 4, ny fælde).
5. *Tørkørsel.* `~/Downloads/query-results-export-2026-09-11_12-31-25.csv`:
   «request_id» «9091». `…_12-31-51.csv` (kolonner
   `id;indhold;sektion;vaerdi`), ordret:
   «9091;"{""ok"":true,""dry_run"":true,""virksomheder"":27,""kandidater"":2,""sendt"":0,""ville_sende"":0,""pr_mail"":{""kom_i_gang"":0,""historik"":0},""sprunget_over"":{""ingen_start"":0,""legat"":0,""allerede_sendt"":0,""har_uploadet"":0,""uden_for_vindue"":2,""ingen_email"":0,""opt_out"":0},""fejlet"":0}";svar;status 200 | timed_out false | fejl  | oprettet 2026-09-11 10:31:24.909872+00».
   Sammenholdt med 9035 fra 09:26 (`…_09-28-31.csv`): samme tal — 27
   virksomheder, 2 kandidater, 0 sendt, 0 ville_sende, 2 uden_for_vindue,
   0 fejlet. Funktionen svarer med den nye kode uden at ændre dommen for
   de 27.

Stadig ubevist (DEL 3, rækken «Kort 60 — tre åbne beviser»): tjeklistens
punkt på et medlems skærm; den første rigtige præsentation
(`community_traade` med `kilde_type = 'praesentation'` og `status =
'aktiv'`); velkomstmailens nye tekst (første nye medlem dag 0–1).

**4. Målingen 11:33 — de fire SQL-funktioner der nævner `kilde_type`,
linje for linje** (`…_11-33-55.csv`, kolonner `funktion;linje;linje_nr`;
læst FØR kort 60 blev bygget, som formiddagens §9 krævede).
`get_community_feed(p_limit integer, p_offset integer)`: linje 0001-0005
«CREATE OR REPLACE FUNCTION …», «RETURNS TABLE(id uuid, titel text,
indhold text, indhold_json jsonb, status text, fastgjort boolean,
antal_svar integer, antal_visninger integer, sidste_svar_at timestamp with
time zone, created_at timestamp with time zone, updated_at timestamp with
time zone, kilde_type text, kilde_item_id uuid, kilde_event_id uuid,
forfatter_id uuid, forfatter_navn text, forfatter_avatar_url text,
antal_reaktioner bigint, jeg_har_reageret boolean, seneste_aktivitet_at
timestamp with time zone)», «LANGUAGE plpgsql», «STABLE SECURITY DEFINER»,
«SET search_path TO 'public'»; linje 0023-0031 «t.sidste_svar_at,»
«t.created_at,» «t.updated_at,» «t.kilde_type,» «t.kilde_item_id,»
«t.kilde_event_id,» «t.forfatter_id,» «p.full_name,» «p.avatar_url,».
`get_community_traad(p_traad_id uuid)`: samme kolonneliste og samme
udvalg — `kilde_type` føres igennem som `text` uden betingelse.
`protect_community_traad_immutable_fields()`: linje 0028-0041 «IF
NEW.sidste_svar_at IS DISTINCT FROM OLD.sidste_svar_at THEN» «RAISE
EXCEPTION 'sidste_svar_at cannot be changed';» «END IF;» «IF
NEW.kilde_type IS DISTINCT FROM OLD.kilde_type THEN» «RAISE EXCEPTION
'kilde_type cannot be changed';» … «kilde_item_id cannot be changed» …
«kilde_event_id cannot be changed» … «RETURN NEW;» «END;». Læsning: ingen
af de tre skelner på værdien af `kilde_type`; migrationen skal kun skrive
de to CHECK'er om (formiddagens §9 a). `opret_community_traad` stod i
formiddagens måling (11:28 b).

**5. Målingen 11:43 — pr. kort** (`…_11-43-37.csv`, kolonner
`noegle;sektion;vaerdi`; alt ordret).

- *Kort 56 (indholdslaget), sektion `a_56_fordeling`* (area · module; antal
  | published): «academy · null;27 | published 27», «classroom ·
  administration;3 | published 3», «classroom · bogholderi;4 | published
  4», «classroom · marketing;3 | published 3», «classroom · null;34 |
  published 34», «classroom · salg;3 | published 3», «evergreen · null;4 |
  published 4», «push · null;2 | published 1», «start_her · null;2 |
  published 2», «start_her · overordnet;1 | published 1», «talks · null;3 |
  published 3», «ugens_video · null;2 | published 2». Sektion
  `a_56_kolonne`: «handout_module;text | nullable YES». Læsning: 34 af 47
  classroom-elementer har intet modul; `talks` har 3 (migrationen målte 0
  den 13/8, `recon-tre-oprydninger.md:124`).
- *Kort 57 (fremskridt), sektion `b_57_kolonner`*: acknowledged_at
  timestamptz YES; content_item_id uuid NO; created_at timestamptz NO; id
  uuid NO; last_position_seconds integer YES; seen_at timestamptz YES;
  skipped_at timestamptz YES; updated_at timestamptz NO; user_id uuid NO.
  Sektion `b_57_policies`: «Advisors can insert progress;INSERT | roller
  {authenticated} | » (tom qual), «Advisors can update progress;UPDATE |
  roller {authenticated} | has_role(auth.uid(), 'advisor'::app_role)»,
  «Advisors can view all progress;SELECT | roller {authenticated} |
  has_role(auth.uid(), 'advisor'::app_role)», «Service role can manage
  progress;ALL | roller {public} | (auth.role() = 'service_role'::text)»,
  «Users can manage own progress;ALL | roller {authenticated} | (auth.uid()
  = user_id)». Sektion `b_57_raekker`: «rækker / set / gennemført /
  sprunget over;287 / 287 / 261 / 1».
- *Kort 82 (app_config), sektion `c_82_app_config`* (nøgle; værdi |
  opdateret | af): «branding;{"name": "The Boardroom", "shortName": "BR",
  "advisorLabel": "dine rådgivere", "chatPlaceholder": "Skriv direkte til
  dine rådgivere"} | opdateret 2026-02-24T09:55:51.972469+00:00 | af null»;
  «extraction_v2_rollout;{"scope": {"all_companies": true}, "enabled":
  true, "review_path_deployed": true} | opdateret
  2026-04-20T20:52:58.284174+00:00 | af null»; «gamification;{"levels":
  [{"emoji": "🌱", "label": "Starter", "threshold": 0}, {"emoji": "⚡",
  "label": "Aktiv", "threshold": 25}, {"emoji": "🔥", "label": "Dedikeret",
  "threshold": 75}, {"emoji": "⭐", "label": "Stjerneelev", "threshold":
  150}, {"emoji": "🏆", "label": "Mester", "threshold": 300}],
  "pointsPerReport": 10, "pointsPerMilestone": 25} | opdateret
  2026-02-24T09:55:51.972469+00:00 | af null»;
  «meetings;{"next_meeting_date": "2026-04-30"} | opdateret
  2026-03-27T07:05:35.982904+00:00 | af null»;
  «notification_v2_rollout;{"enabled": true, "test_user_ids":
  ["23e81de4-db14-40b6-92ed-0d84ed3c71f1"], "member_rollout": {"enabled":
  true, "all_members": true, "company_ids":
  ["927a4f36-748d-4326-9259-bff940da7e3d"]}} | opdateret
  2026-08-10T20:11:42.009308+00:00 | af null»;
  «performance_score;{"weights": [0.3, 0.25, 0.25, 0.2], "liquidityMonths":
  6, "growthMultiplier": 2, "marginMultiplier": 2, "profitMultiplier": 3,
  "defaultSalaryFallback": 50000} | opdateret
  2026-02-24T09:55:51.972469+00:00 | af null»; «session_timeout_minutes;30
  | opdateret 2026-03-17T13:23:28.562062+00:00 | af null»;
  «velkomstvideo_guid;"" | opdateret 2026-09-02T14:26:00.925792+00:00 | af
  null». Otte rækker; `updated_by` er null på alle.
- *Kort 29 (budget), sektion `d_29_budget`*: «loenninger;6 virksomheder |
  72 rækker i 2026-base», «omsaetning;7 virksomheder | 84 rækker i
  2026-base». Sektion `d_29_perioder`: «rækker hvis period ikke har formen
  YYYY-scenarie-måned;233 af 4760».
- *Kort 40 (KPI-mål), sektion `e_40_daekning`*: «aktive virksomheder med
  mindst én kpi_targets-række;4 af 30». Sektion `e_40_kpi_targets`
  (metric; rækker | med mål … | virksomheder): «db_margin;4 | med mål 0 0 |
  virksomheder 4», «ebitda_margin;4 | med mål 0 0 | virksomheder 4»,
  «loenninger;2 | med mål 0 0 | virksomheder 2», «omkostninger;2 | med mål
  0 0 | virksomheder 2», «omsaetning;2 | med mål 0 0 | virksomheder 2»,
  «resultat;2 | med mål 0 0 | virksomheder 2». Cellen har formen «antal
  | med mål 0 <tal> | virksomheder N» — «med mål 0 0» er 0 rækker med
  `target_value = 0`. Læsning: 26 af 30 aktive virksomheder har ingen
  egen mål-række; ingen af de 16 rækker har et 0-mål, så tomt-felt-grenen
  (`NoegletalView.tsx:405`) har ingen rækker i prod 11/9.

**6. A4-reconen (kort 81 og 52) og målingen 12:18 — forslag 20 og 21.**
Kilde `recon-a4-forsidens-dom.md`.

- *Kort 81 — «strandet upload» som slags.* Fem af seks påstande holder
  (`:16-21`); den sjette, «slags 6 kan dømmes af samme SQL som de seks
  andre», «holder ikke som beskrevet» (`:21`): dommen er ikke SQL — den er
  `afgoerForsidensDom` i TypeScript over det `hentAdvisorDashboard` henter
  (`AdvisorDashboard.tsx:1153-1200`), og den hentning bærer hverken
  `validation_status`, `validation_errors`, `needs_manual_entry` eller
  `quality_signals` (`:51-55`). §2's slags 6 er desuden en anden end
  «strandet upload»: «Tal der stikker SÅ meget ud at det ligner en fejl i
  rapporteringen» (`forsiden-design.md:120-124`, reconens `:34`); «Ikke
  målt hvor ofte det sker» (`:476-478`, reconens `:37`). Strandet i koden =
  `genkoersel.ts:74-78 erStrandet` (`status === "error"` eller `processed`
  med `validation_status === "FAIL" || needs_manual_entry`, reconens
  `:44`); grunden på rapportkortet er en klientfunktion pr. kort
  (`reportCardView.ts:66-100`, `:45`). `report-review-cron` rører kun
  `processed` uden facts (`:59-60`). Målingen 12:18 (`…_12-18-39.csv`),
  ordret: sektion `b_rapporter_status` «processed · PASS;129 | seneste 90
  dage 60», «processed · null;13 | seneste 90 dage 6», «processed ·
  FAIL;46 | seneste 90 dage 14», «error · FAIL;5 | seneste 90 dage 5»;
  sektion `c_strandet` «FAIL;46 uploads | 9 virksomheder | seneste 90 dage
  14», «error;5 uploads | 4 virksomheder | seneste 90 dage 5»; sektion
  `d_strandet_uloest` «virksomheder med en strandet upload de seneste 90
  dage og intet godkendt tal siden;1». **Forslag 20 (forslag fra chatten,
  stående uden indsigelse):** «strandet upload» som slags bygges IKKE nu —
  1 virksomhed; tallet er en nedre grænse (målingen tæller kun
  virksomheder uden et godkendt tal siden). Kort 81 deles: «strandet
  upload» (20) og designets slags 6, som venter på en måling af hvor ofte
  tal springer.
- *Kort 52 — refleksionens udgang.* Alle tre påstande holder (`:70-72`):
  efter upsert (`PulseCheckinModal.tsx:199-210`) sker kun toast,
  invalidering, `send-slack-report-notification` med
  `pulse_checkin_received` og «Bevidst INGEN agent-kald her»; ingen
  `company_actions`-række; ingen trigger på tabellen. Beslutningen ordret
  (`forsiden-design.md:370-374`, reconens `:71`, `:77`): «en AI-analyse må
  TILFØJE en opgave, aldrig FJERNE en. En ny refleksion giver ALTID en
  opgave». `company_actions` kender `reflection` som type med 21 dages
  udløb (`opgaveUdloeb.ts:19-24`), men ingen writer sætter den (`:99`).
  Ingen fil i HEAD invoker agenten med `trigger: "pulse_submitted"`
  (`:89`); prod har «ugefokus-rækker med triggeren pulse_submitted;3 |
  seneste 2026-06-05T14:04:21.049+00:00» (`…_12-18-39.csv` sektion
  `f_pulse_submitted`) — fra en kaldevej der ikke findes i HEAD. Husets
  mønster for «skriv i en anden tabel fra en trigger» er AFTER-trigger +
  SECURITY DEFINER (fire af fem, `:103-112`); `CLAUDE.md:97-101` forbyder
  «Ændring af … andre SECURITY DEFINER-funktioner» (`:114`). Målingen
  12:18, sektion `e_refleksioner` (måned; antal | med «søger hjælp til» |
  virksomheder), ordret: «2026-09;6 | med «søger hjælp til» 4 |
  virksomheder 4», «2026-08;5 | med «søger hjælp til» 5 | virksomheder 4»,
  «2026-07;4 | med «søger hjælp til» 3 | virksomheder 4», «2026-06;7 | med
  «søger hjælp til» 6 | virksomheder 6», «2026-05;3 | med «søger hjælp til»
  2 | virksomheder 3», «2026-04;1 | med «søger hjælp til» 1 | virksomheder
  1», «2026-03;1 | med «søger hjælp til» 0 | virksomheder 1». **Forslag 21
  RETTET (forslag fra chatten, stående uden indsigelse):** hver ny
  refleksion giver én linje på rådgiverens forside med samme alvor over
  tærsklen (fx 80) indtil en rådgiver har læst den; ingen trigger og ingen
  `company_actions` i første version. «Søger hjælp til» er udfyldt i de
  fleste og skelner derfor ikke det akutte. Hvordan linjen lukkes, kræver
  recon (A4 i morgen).

**7. Reconen af de tre oprydninger** (`recon-tre-oprydninger.md`).

- *A. run-weekly-agent* (`:14-48`): én fil, 90 linjer; `:7 Deno.cron(…)`,
  ingen HTTP-indgang; `:67-83` kalder `run-company-agent` med `trigger:
  "weekly_cron"` og `dry_run: false` (chat 11/9: Deno.cron kører ikke på
  Supabases runtime, så filen har ikke kørt derfra; ikke målt i prod).
  `config.toml:33-34`. Nævnt i `ugensFokusGate.ts:18` (begge kopier, kun
  kommentar), `check-edge-function-auth.ts:233-237` (kommentar; mapper
  findes dynamisk), tests `factsDataBasisReadGuard.test.ts:42` (filen står
  i en værnet liste) og `agentKaldesteder.test.ts:20`, `:64-76`
  (kaldested-scanning). De døde `weekly_cron`-grene i
  `run-company-agent/index.ts:673, :1035, :1092, :1095, :1260` tages med i
  oprydningen (chat 11/9) — og `run-company-agent` skal derfor udrulles
  eksplicit efter merge. Etiketten `AgentForslagPanel.tsx:44`: ikke
  afgjort. Ingen `cron.schedule` for den. PROD «`agent_runs.trigger = 'weekly_cron'`»:
  ikke målt (OVERLEVERING:3865 siger 0). Jonas 11/9: «A» — filen slettes.
- *B. Digesten* (`:56-96`): 382 linjer; `config.toml:108-109 verify_jwt =
  true`; auth `:90-113`; `digestGate.ts:26 DIGEST_DAG = 22`; admin-knapper
  `EmailTemplatesView.tsx:766-802`, `:1089-1118`; opt-out
  `index.ts:233-237`; ingen `email_templates`-række; indstillingen
  `indstillinger.ts:188`, `:201` («Månedsoverblik — Den 22. i måneden: dine
  tal, milepæle og ulæste beskeder.»); tests der låser de fem nøgler
  `indstillinger.test.ts:96-97, :111, :119-120`. Cron-blokken ordret i
  reconen (`20260810230000:73-87`); første udgave dag 5
  (`20260330182519:3-15`) blev aldrig afplanlagt i en migration — prod
  viste ét job (§2). Slukket 12:07; koden fjernes i oprydnings-PR'en.
- *C. Podcasten* (`:104-168`): ti steder (`App.tsx:293`,
  `PodcastTalks.tsx:11-13`, `PodcastTalksView.tsx`, `hbNav.ts:92, :97,
  :109, :129, :67`, `BoardroomView.tsx:23, :740, :1470-1493, :886,
  :2109-2126`, `podcastRss.ts`, `podcast-rss/index.ts:19`,
  `config.toml:104-105`, tests `podcastRss.test.ts`, `hbNav.test.ts:37,
  :44-47, :76`, `ankomst.test.ts:54`, `pushSelection.test.ts:172-196`).
  Talks er ingen liste (`PodcastTalksView.tsx:272-284` henviser til
  Events). Feedet ordret (`:129-137`): `<title>` «IVÆRKSÆTTERLIVET»,
  `<link>` «https://www.topix.dk/», `<itunes:author>` «Topix»,
  `<itunes:owner>` Topix / kontakt@topix.dk, intet `<image>`-element; 18
  URL'er med «spotify», alle episode-links under
  `https://podcasters.spotify.com/pod/show/topixdk/episodes/`; «Feedet
  indeholder ingen show-URL på Spotify» (`:159`). Skallen har intet mønster
  for et eksternt link (`:163`: `HbSidebar.tsx:83-92` tegner `<a href="#">`
  for punkter uden `to`; `HbNavEntry` har intet `href`-felt); mønstrene
  findes på forsiden (`BoardroomView.tsx:783-788` knap, `:617-625`
  tekstlink, `:165-167`).

**8. Forslagene fra chatten — stående uden indsigelse.**

- *Beslutning 17 RETTET* (formiddagens §9 sagde: kort 69 og 62 venter til
  podcastens fremtid er afgjort): podcasten flyttes ud af platformen.
  Menupunktet «Podcast & Talks», ruten `/podcast`, forsidens podcastkort,
  `podcast-rss` og parseren fjernes; ét stille tekstlink «Lyt til
  Iværksætterlivet på Spotify» nederst i sidebaren for medlemmer og
  abonnenter, ikke rådgivere, til showets adresse (§1). Kort 69, 62 og 61
  UDGÅR (mangellistens RYDDET 11/9 EFTERMIDDAG). Nyt kort: «Podcasten ud af
  platformen — ét link til Spotify» (Lille).
- *Kort 40*: hele `KPI_FALLBACK_TARGETS` (`src/lib/appConfig.ts:112-119`)
  fjernes i samme bygning som trin 1; chattens skuffe dømmer ikke uden mål;
  brancheskiftets skrivning af branchetal som `kpi_targets`
  (`IndstillingerView`) fjernes med.
- *Digesten*: koden (indstillingen «Månedsoverblik», admin-knapperne
  «Månedlig digest» og `send-monthly-digest`) fjernes i oprydnings-PR'en;
  kortene «Ugens nyheder med auto-tråd» og «Ugens push med kommentarer»
  afgøres for sig — de hang på digesten, og digesten er afgjort.
- *Kort 60*: 18 RETTET — gjort = en AKTIV præsentation; 19 — punktet efter
  profilen; 22 — accepteret følge: et medlem der har gjort alle seks punkter
  og ikke lukket boksen, får listen igen med 6 af 7; velkomstmailen følger
  tjeklisten i begge kopier.
- *20 og 21*: se §6.
- *Oprydningens rækkefølge i køen*: kort 83 → 40 (hele fallbacken) →
  oprydningen (run-weekly-agent, digestens kode, podcasten ud) → 56 → 76 →
  82 → 57 → 29. A4: recon af hvordan linjen for en ny refleksion lukkes.

### 13. september — doggybeds træk gik igennem (#563 og #572 bevist, #815 ubevist); stripe-webhook i ental og udrullet 12:04 UTC; kort 83 bygget og i drift (#820, merget 12:17:29 UTC, manage-advisor udrullet 12:18 UTC); /members bygning 1 FÆRDIG (#823, #824, #825 — merget 13:08:25, 13:33:58 og 13:54:51 UTC; panelet på skærm 15:38); bygning 2 LØST (#826, merget 14:13:00 UTC; fire funktioner udrullet 14:20 UTC); Guiden AFGJORT — dør i bygning 3, ankrene bliver; bygning 3 GJORT — /members og Guiden slettet (#828, merget 14:47:38 UTC; Update klikket; /members og /guide NotFound på skærm; manage-advisor udrullet 14:50 UTC); målt kl. 16:53 — sletningen fjernede intet i brug, NOTEN BEVIST I DRIFT, efterladenskaber fra tidligere sletninger fundet; kilderne fundet i A's recon; lækagen LUKKET (#830, merget 15:31:14 UTC) og udrullet 15:33 UTC; kort 40 GJORT — KPI-fallbacken fjernet helt (#832, merget 15:57:43 UTC; Update og skærmbevis åbne); branchelinjen på KPI-kortet fundet på skærmen kl. 18:00 — BESLUTTET: estimatet væk, forrige måneds eget tal i stedet — BYGGET (#833, merget 16:21:03 UTC) og BEVIST PÅ SKÆRM 18:26:57, som også beviser kort 40; brancheafsnittet MÅLT 18:28 (3 af 36 domme indenfor) og BESLUTTET: det dør — #833's værn låste afsnittet (1 af 2982 fejlede kl. 18:40), værnet omskrevet, og #834 MERGET 16:52:02 UTC (bar også del 3 af denne bogføring — index'et bar begge); Update klikket og BEVIST PÅ SKÆRM 18:58:00 — afsnittet er væk, siden går fra «MÅNED FOR MÅNED» direkte til «AI-ANALYSE»; oprydningen DEL 1 GJORT — run-weekly-agent slettet og digestens kode fjernet (#836, merget 17:08:09 UTC; run-company-agent udrullet 17:09 UTC; migrationen kørt; BEVIST PÅ SKÆRM 19:13:00 og 19:16:58) — «weekly_cron» i hvidlisten var en åben dør, ikke død kode; kort 56 GJORT — handout-siden linker til de lektioner der hører til (#837, merget 17:29:00 UTC; committen bar også §16 — index-fælden igen; Update klikket; Jonas: «Det virker»); bogføringen af oprydningen i mål som #838 (merget 17:35:45 UTC); CALENDLY-PÅSTANDEN FALSIFICERET kl. 21:30 — ét GET-kald, HTTP 200: planen rækker, nul abonnementer på Jonas' organisation; «kræver premium» stod tre steder i ti dage uden at nogen havde sendt kaldet; CALENDLY-KÆDEN LUKKET — #842 merget 20:04:19 UTC, tre functions udrullet 20:05 UTC, secret sat og bevist læst, Jonas' abonnement oprettet 20:16:47 UTC (`state: active`); en rigtig booking er UBEVIST, og Rallysupports to rækker forbliver håndsatte; DEN INKLUDEREDE SESSION MED JONAS I DRIFT — #844 merget 20:42:15 UTC, migrationen kørt 22:42, fire functions udrullet 20:45 UTC, BEVIST PÅ SKÆRM 22:48:25 (to symmetriske kort, 30 minutter) — teksterne rettes i vindue A; og reconen «efter sessionen»: INTET sker — `advisor_session_notes` er en død AI-cache, en note efter en session har aldrig eksisteret; KORT 82 GJORT — #847 merget 21:24:31 UTC, migrationen kørt 23:25 (tre rækker slettet, fem tilbage; §25); og 14/9 morgen: PLANEN FREM MOD WEBINARET (§26) og DELINGEN SOM KRAV (§27)

Kilder: `~/Downloads/query-results-export-2026-09-13_14-01-42.csv` (prod,
målt kl. 14:01, kolonner `noegle;sektion;vaerdi`, ordret),
`~/Downloads/verifikation-kort83.txt` (FIND FØRST, målt FØR nogen
kodeændring), repoet ved `3ce1e7dc` (mappen og `config.toml`), Lovables
build-chat (udrulningen, ordret). Jonas' ord står som «Jonas 13/9»; det
chatten foreslog og han ikke svarede på, står som «forslag fra chatten,
stående uden indsigelse». Er en kilde uklar, står der «ikke målt». I
repoet skete der INTET 12/9: HEAD er stadig `3ce1e7dc` (#819, `gh pr view
819`: «mergedAt 2026-09-11T10:55:26Z»), og næste commit er ikke kommet.
Om der skete noget i prod, Stripe eller Lovable den 12/9: ikke målt.

**1. Trækket og de tre beviser.**

- **#572 BEVIST.** Sektion `a_doggybed_traek`, ordret: «betalt ·
  in_1UF8tR3CvBmCx5PthFjFOjFc;a_doggybed_traek;2026-09-13T09:36:24.309794+00:00
  | beloeb 437500 | id 781b4c5c-77d8-4ecf-8b45-30e085cc79b0». Kl. 09:36:24
  UTC = 11:36:24 dansk; 437.500 øre = 4.375 kr.; ÉN række i
  `company_traek` med `status = 'betalt'`.
- **#563 BEVIST.** Sektion `b_doggybed_abonnement`, ordret:
  «Doggybed;b_doggybed_abonnement;subscription_status NULL |
  stripe_customer_id NULL | slutdato 2026-10-13». `subscription_status`
  forblev NULL efter trækket — grenen sprang over med vilje. Bemærk:
  `stripe_customer_id` er STADIG NULL for doggybed; det er det der
  blokerer kundeportal-linket (kort 26). `customer.subscription.updated`
  grøn i Stripes Event deliveries: ikke målt.
- **#815 IKKE BEVIST — og KAN ikke bevises af dette træk.** Sektion
  `c_klokke_traek_fejlet`, ordret: «ingen raekker i alt
  (kontrol);c_klokke_traek_fejlet;0» — nul rækker i
  `advisor_notifications` med `type = 'traek_fejlet'`, som forventet. Et
  vellykket træk sender aldrig `invoice.payment_failed`; grenen
  (`skrivRaadgiverBesked`, dedup på `company_traek.id`, værnet mod at et
  betalt træk vendes til fejlet) bevises først af et fejlet træk. Hvornår
  det sker, er ukendt. Beviset står uændret i DEL 3.
- **Betingelsen fra 2/9 er opfyldt:** de tretten andre ventede på at
  trækket 13/9 gik igennem. Hvornår og i hvilke portioner de migreres, er
  en ÅBEN BESLUTNING — ikke truffet (DEL 3, rækken om migrationen af de
  13).

**2. stripe-webhook — navnet og udrulningen.**

- **Navnet er i ental.** Målt i repoet 13/9: mappen hedder
  `supabase/functions/stripe-webhook`, og `supabase/config.toml:61` siger
  `[functions.stripe-webhook]`. ÉN funktion. «stripe-webhooks» fandtes
  seks steder som tekst: fire i denne fil (de to START HER-blokke fra
  11/9, DEL 2 «11. september, formiddag» under #815, DEL 3's 13/9-række)
  — rettet 13/9 — og to kodekommentarer, `src/lib/fornyelsesperiode.ts:39`
  og `supabase/functions/_shared/fornyelsesperiode.ts:39`, som IKKE er
  rørt i denne bogføring (det er kode) og tages med i næste bygning i
  vindue A. Ingen af de seks var et kald — intet var i stykker. Ny fælde
  i DEL 4.
- **Udrullet 13/9 kl. 12:04 UTC (14:04 dansk)** i Lovables build-chat,
  EFTER trækket. Lovables svar ordret: «Udrulningen af stripe-webhook
  lykkedes kl. 2026-09-13 12:04 UTC. Endpointet svarer live med HTTP 400
  Invalid signature (forventet). Ingen filer, andre funktioner eller
  migrationer blev rørt.» Hvorfor: doggybeds event beviste kun
  `invoice.paid`-grenen; #815 rørte `payment_failed`-grenen, og om DEN
  version var i drift, var ikke målt. Efter udrulningen kører main — men
  grenen er stadig ubevist i drift (§1).

**3. Driften.** Sektion `e_drift`, ordret: «cron-job
send-monthly-digest;e_drift;0» og «cron-jobs i alt;e_drift;18». Digesten
er stadig slukket (`cron.unschedule` 11/9 kl. 12:07), og 18 = 19 (målt
11/9 kl. 09:20) minus digesten. Sektion `d_praesentation`: INGEN række i
resultatet — 0 tråde i `community_traade` med `kilde_type =
'praesentation'`. Kort 60's bevis «den første rigtige præsentation» står
stadig åbent (DEL 3, rækken «Kort 60 — tre åbne beviser»).

**4. Kort 83 — bygget i vindue A og I DRIFT: den halve sletning er væk
fra /members (#820).** Grenen `fix/fjern-halv-sletning-members`, ét
commit `16f0ab27` («fix: den halve sletning fjernes fra /members (kort
83)», 2026-09-13T14:14:49+02:00), fem filer, 82 indsættelser / 230
sletninger. Beviserne, i rækkefølge:

- **Merget.** `gh pr view 820 --json mergedAt,mergeCommit`, ordret:
  «{"mergeCommit":{"oid":"1b45add2d242eb27d665485398f05e7418929794"},"mergedAt":"2026-09-13T12:17:29Z"}»
  — 12:17:29 UTC, 14:17:29 dansk. (Denne bogføring er skrevet på main ved
  `3ce1e7dc` uden pull; merge-committet er ikke hentet lokalt.)
- **Diffen læst i chatten før merge** (chat 13/9): serveren mistede hele
  grenen (91 linjer), `ADVISOR_ALLOWED_ACTIONS` og `fjern-fra-virksomhed`
  urørte; fladen mistede knap, dialog og de imports der kun tjente den;
  `maaFjerneMedlem` væk, `erOwner` og `maaFjerneFraVirksomhed` uændrede.
  Kildeværnet læser fire filer med regex på HELE ordet
  (`bulk-remove-members` fanges ikke) plus et værn mod at
  action-routingen kender navnet. A kørte en NEGATIV PRØVE: med teksten
  indsat fejlede 2 af 15 tests, og prøvelinjerne blev fjernet igen. tsc
  nul fejl; tests 2891 → 2892; `check:edge-auth` PASS (69 filer).
- **Udrullet EKSPLICIT.** `manage-advisor` i Lovables build-chat, ordret:
  «Udrulningen af manage-advisor lykkedes kl. 2026-09-13 12:18 UTC.
  Endpointet svarer live med HTTP 401 Unauthorized (forventet). Ingen
  filer, andre funktioner eller migrationer blev rørt.» (14:18 dansk.)
  Uden den ville grenen leve videre på serveren, selv om knappen er væk i
  fladen.
- **Fladen bevist på skærm.** Kl. 14:22:53
  (`screencapture-app-theboardroom-dk-members-2026-09-13-14_22_53.pdf`):
  BR Roset udfoldet, TEAM (2) viser René Larsen (owner) og Betina Larsen
  (member) UDEN fjern-kryds. Kl. 14:21:55 på virksomhedssiden
  (`screencapture-…-virksomhed-7b0056eb-…-14_21_55.pdf`): «Fjern fra
  virksomheden» står ved Betina (member) og IKKE ved René (owner) —
  owner-værnet på den rigtige handling holder. Update-klikket for
  frontend-builden: ikke oplyst, ikke målt; skærmbilledet er beviset.
- **SERVEREN ER UDRULLET, IKKE DRIFTS-BEVIST.** Et driftsbevis (at et
  direkte kald med `action: 'remove-member'` svarer 400 fra den udrullede
  version) kræver et admin-token i browserkonsollen, og chatten bad Jonas
  om det; han afviste med rette (Jonas 13/9: «Du skal teste på en anden
  måde frem for at jeg skal lege udvikler»). Beviset blev droppet, ikke
  glemt. Det der holder grenen væk, er kildeværnet i testen plus at
  Lovable udrullede fra main. Ny fælde i DEL 4.

Udgangspunkt FØR bygningen: `main = origin/main = 3ce1e7dc`, rent træ;
tests 188 filer / 2891 tests, alle grønne. De fem filer: `src/pages/Members.tsx`,
`src/components/members/MemberCompanyRow.tsx`,
`src/lib/medlemsfjernelse.ts`,
`src/lib/__tests__/medlemsfjernelse.test.ts`,
`supabase/functions/manage-advisor/index.ts` — ingen andre. FIND FØRST
(`~/Downloads/verifikation-kort83.txt`, målt FØR nogen kodeændring):

- *Kaldere af action `remove-member`:* `src/pages/Members.tsx:693`
  (`body: { action: 'remove-member', target_user_id }`) er ENESTE kalder
  i `src/`; serverens gren er
  `supabase/functions/manage-advisor/index.ts:340-431`. Kun kommentarer,
  ingen kald: `index.ts:101, :264, :348, :371`;
  `_shared/fjernFraVirksomhed.ts:5, :31` og
  `hjemmebane/virksomhed/VirksomhedView.tsx:1356` (røres ikke — urørt-
  listen); `medlemsfjernelse.ts:4, :10, :16, :21, :42`. Tests:
  `medlemsfjernelse.test.ts:64` (testnavn) og `:81` (hævder KUN at
  `remove-member` ikke står i `ADVISOR_ALLOWED_ACTIONS` — ikke at den
  skal findes). Scripts: ingen fund. Identifikatoren `removeMember`
  findes ingen steder.
- *Kaldere af `maaFjerneMedlem`:* `MemberCompanyRow.tsx:18` (import) og
  `:339` (gaten på knappen) — ENESTE brug i `src/`; testfilen `:8`,
  `:27-45` (enhedstests), `:65`, `:87`. Deno-kopi: NEJ — serveren
  inliner owner-tjekket (`index.ts:364-379`, `m.role === 'owner'`) og
  henviser kun i en kommentar (`:361-362`). `OWNER_ROLLE` i
  `_shared/fjernFraVirksomhed.ts:57` og `_shared/medlemsrolle.ts:20` er
  urelateret.
- *Hvad grenen deler med andre grene:* FÆLLES og bliver — `corsHeaders`
  (`:5-9`), `adminSupabase` (`:83`), `userId` (`:77`), `callerIsAdmin`
  (`:96`), destruktureringen `:99` (`target_user_id` bruges også af
  `fjern-fra-virksomhed`, `:267, :281, :331`), per-action-gaten og
  `ADVISOR_ALLOWED_ACTIONS` (`:104-112`, remove-member står IKKE i
  listen), `if (!email)` → 400 «Missing email» (`:434-438`) og
  fallthrough → 400 «Unknown action» (`:658-660`). KUN remove-member:
  hele blokken `:340-431` (owner-opslag, invitations-reset med
  `accepted_by` + email-fallback, DELETE `company_members`, DELETE
  `profiles`, `auth.admin.deleteUser`); ingen hjælpefunktion, konstant
  eller type er eksklusiv for grenen, og den importerer intet fra
  `_shared`. Efter fjernelsen rammer et direkte kald `{ action:
  'remove-member', target_user_id }` først `if (!email)` og svarer 400
  «Missing email»; med email 400 «Unknown action». Begge 400, intet
  slettes.
- *Kildeværnet* `medlemsfjernelse.test.ts:70-89` læser
  `manage-advisor/index.ts` og `VirksomhedView.tsx` — IKKE `Members.tsx`,
  `MemberCompanyRow.tsx` eller `medlemsfjernelse.ts`. Enhedstestene
  `:27-45` (4 tests) dækker kun `maaFjerneMedlem` → fjernes; `:64-67`
  sammenligner de to domme → omskrives til kun at hævde
  `maaFjerneFraVirksomhed`.
- *Tilstand knyttet til knappen:* `Members.tsx:161`
  (`removingMember`), `:687-706` (`handleRemoveMember`: owner-guard,
  invoke, toast, `refetchMembers`), `:1192`, `:1196` → væk; ingen egen
  dialog i `Members.tsx` — bekræftelsen er `AlertDialog` inline i
  `MemberCompanyRow.tsx:340-372`; `refetchMembers` og typen
  `CompanyMember` (`:22`, brugt `:422`) bliver. I `MemberCompanyRow.tsx`
  går `AlertDialog*`-imports (`:9-13`), ikonet `X` (`:6`), typen
  `CompanyMember` (`:16`) og props `removingMember` (`:27, :45`) /
  `onRemoveMember` (`:31, :49`) væk; `Loader2` (`:538, :547`) og
  `isAdmin` (`:265, :532, :541, :550, :558`) bliver.
- *STOP-tjek:* tre gange nej — `maaFjerneMedlem` bruges kun af knappen;
  `remove-member` deler ingen kode med `fjern-fra-virksomhed`; ingen test
  hævder at `remove-member` SKAL findes.

Kortet ««Fjern fra virksomheden» findes og virker for begge rådgivere —
/members' knap sletter stadig mennesket» er FJERNET SOM LØST fra
mangellisten (RYDDET 13/9). Det der står tilbage om `/members`, står i
§5 nedenfor, i START HER 13/9 og på kortet «/members lukkes i tre
bygninger» (omskrevet 13/9 fra «Tre handlinger uden hjem før /members kan
lukkes») — kortet er FJERNET SOM LØST 13/9 aften (§9); historikken står her.

**5. `/members` — reconen, målingen 14:45, Jonas' fire beslutninger og
planen.** Kilder: `~/Downloads/recon-members-hvad-staar-tilbage.md` (kun
fund; alle linjenumre fra HEAD `0b3cb67a` = #820's src — HEAD flyttede sig
to gange under reconen, og begge filer blev genlæst) og
`~/Downloads/query-results-export-2026-09-13_14-45-10.csv` (prod, målt
kl. 14:45, kolonner `noegle;sektion;vaerdi`, ordret). Reconen skelner
(K) hvad koden siger, (P) hvad kun prod kan afgøre, (S) hvad kun skærmen
kan afgøre.

- **Kortet der spærrede — to af tre præmisser holder ikke (reconen
  afsnit 0).** *Omdøb* er flyttet: `VirksomhedStamdata.tsx:56-103`
  (`OmdoebVirksomhed`), `VirksomhedView.tsx:1559-1565`,
  `useVirksomhed.ts:514-522` — #771; kortets «kun `Members.tsx:680`» er
  overhalet, og `VirksomhedView.tsx:66` («omdøb, inviter, slet osv.
  kommer senere, §3.6») er en forældet filhoved-kommentar, ikke en
  tilstand. *«Merge»* findes ikke som handling: `grep -rn -i merge src
  supabase/functions` giver 19 filer, ingen er en virksomheds-merge;
  ordet kom fra `raadgiverfladen-design.md:512` (nr. 16, «Automatisk
  sletning af kildevirksomhed ved «Tilknyt bruger» (merge)»), og den
  bivirkning blev fjernet med #772 (`afe13a56`, 284 slettede linjer);
  `attach-user-to-company` sletter ingen kildevirksomhed. *Import* står —
  men kortets «findes som admin-side ImportView» er forkert:
  `ImportView.tsx:16-18` er rapport-upload for en valgt virksomhed, ikke
  ansøgningsimport; ingen Hb-flade har «Importér ansøgning» (grep i
  `src/components/hjemmebane`: 0).
- **Det der KUN findes på /members i dag (K, reconens sammenfatning):**
  ansøgningsimport (Excel → `import-application`, `Members.tsx:36-146`,
  dialogen `:1363-1527`, handler `:580-666`, kald `:625`), tilknyt
  eksisterende bruger (`attach-user-to-company`, grenen `:641-644`,
  handler `:193-230`), øjeblikkelig `delete-company` med «slet også
  brugerkonti» (`:748-780`, dialogen `:1228-1296`), «Nulstil & gensend»
  på accepteret invitation (`MemberCompanyRow.tsx:493-501`, skrivning
  `Members.tsx:686-725`), fornyelses-NOTEN (`skrivFornyelsesnote` kaldes
  kun fra `FornyelsesSektion.tsx:146`; `VirksomhedView.tsx:1413-1414`
  «kan kun redigeres på /members») og fornyelseslisten på tværs
  (`FornyelsesSektion.tsx:172-185`), Indgangen som liste på tværs
  (`IndgangsSektion.tsx`), onboarding-tragten
  (`MembersOnboardingFunnel.tsx`, regler `Members.tsx:999-1016`),
  statsbjælkens seks tal + login-spandene (`MembersStatsBar.tsx`,
  `Members.tsx:967-997`), Legatforløb-listen (`companies.is_legat`,
  `Members.tsx:1188-1212`), rækkens Refleksion/Chat-kolonner og
  status-prik, «Ret navn»-mærket, omsætning fra ansøgningen.
- **Dubleret (samme tabel/skrivevej i Hb):** omdøb, prisniveau
  (`saet-indgangs-prisniveau` fra `VirksomhedStamdata.tsx:113`),
  fornyelsesbeslutning uden note (`useVirksomhed.ts:434-480`, «DEN ENE
  skrivevej»), invitationer opret/gensend/slet (`HbInvitationer.tsx`,
  `hooks/invitationer.ts`), rediger virksomhedsdata (samme
  `EditCompanyDialog`, `VirksomhedView.tsx:13, 1716`),
  søg/branchefilter/sortering (`VirksomhedslisteView.tsx:487-503`),
  tier-badges, fejlede træk, sidst online.
- **Veje ind — planens «syv veje», fire filer, elleve linjer (K):**
  gammel `AppSidebar.tsx:65` («Medlemmer», path `/members`), `:530` og
  `:590` (`navigate("/members")` fra virksomhedsvælgeren); `Guide.tsx:105,
  :114, :123, :139` (routet `App.tsx:240`, ikke i Hb-menuen; teksterne
  beskriver funktioner der ikke findes på siden, fx broadcast);
  `_shared/indgangsMail.ts:286` «knap: { tekst: "Åbn i platformen", url:
  `${APP_URL}/members` }» — låst af `_shared/indgangsMail_test.ts:173`
  («assertStringIncludes(m.html,
  'href="https://app.theboardroom.dk/members"')»);
  `send-slack-report-notification/index.ts:189, :273, :292`
  (`/members?companyId=…` som fallback — formen læses ingen steder i
  `Members.tsx`, den lander på listen uden filter). Hb-menuen har INTET
  punkt til /members (`hbNav.ts:118-146`). `AdvisorDashboard.tsx` har NUL
  /members-links i dag — de fire fra bogføringen forsvandt med `6e97bd67`
  (#626). `GuidedTour.tsx` importeres ingen steder OG indeholder ikke
  ordet «members».
- **Det der dør med siden (K, reconen afsnit 3):** otte filer der kun
  importeres af `Members.tsx` — `MembersStatsBar.tsx` (90 linjer),
  `MembersOnboardingFunnel.tsx` (116), `MembersAdminSection.tsx` (182),
  `IndgangsSektion.tsx` (317), `MemberCompanyRow.tsx` (526),
  `FornyelsesSektion.tsx` (309, + to tests), `types.ts`,
  `src/lib/importensAdvarsel.ts` (+ egen test). Edge functions der mister
  eneste kalder: `import-application`, `attach-user-to-company`,
  `manage-advisor` action `delete-company`. **Fem tests der læser
  filen:** `src/test/factsDataBasisReadGuard.test.ts:30`,
  `src/lib/__tests__/forsidenKaster.guard.test.ts:123` og `:146`,
  `src/lib/__tests__/emailSendLogKolonner.guard.test.ts:68`,
  `src/hooks/__tests__/fornyelseSkrivevej.guard.test.ts:46`,
  `src/lib/__tests__/fornyelsesOrd.test.ts:64` og `:73`. `scripts/`:
  ingen læser Members.
- **Målingen 14:45 — ordret, og hvad den afgjorde.** Sektion
  `a_nye_virksomheder` (90 dage, uden legat): «2026-06 · intet
  betalingslink · slutdato sat;a_nye_virksomheder;1 | Limo Group - Viborg
  Limousine Service»; «2026-08 · intet betalingslink · ingen
  slutdato;a_nye_virksomheder;1 | Alexander Lunds virksomhed»; «2026-08
  · intet betalingslink · slutdato sat;a_nye_virksomheder;1 | Livja»;
  «2026-09 · intet betalingslink · ingen slutdato;a_nye_virksomheder;1 |
  Martin Larsens virksomhed»; «2026-09 · intet betalingslink · slutdato
  sat;a_nye_virksomheder;3 | Two Socks ApS, Din økonomiafdeling Danmark
  ApS, WESDEX ApS». Læsning (chat 13/9): «intet betalingslink · slutdato
  sat» er importens signatur (reconen 2.1: `company_betalingslink` findes
  KUN for Monday-vejen, `monday-webhook/index.ts:41-42`) — fem på 90
  dage, tre i september; de tre er de samme som skærmbilledets tre
  afventende invitationer (sendt 1/9 og 9/9). Importen er i brug og skal
  flyttes, ikke dø. Forbehold: signaturen er et indicium, ikke et bevis
  — `companies` har ingen kilde-kolonne. Sektion `b_legat_kilder`: INGEN
  rækker i resultatet — ingen virksomhed har `companies.is_legat = true`,
  og ingen har en `legat_enrollments`-række; Legatforløb-listen viser
  altså ingenting i prod i dag. Sektion `c_legat_forael`, ordret:
  «legat_enrollments-raekker uden en companies-raekke;c_legat_forael;0».
- **Jonas' fire beslutninger 13/9** (efter chattens anbefalinger; Jonas
  13/9, ordret: «Jeg er helt enig i dine anbefalinger»):
  1. IMPORTEN flyttes til `/virksomheder` ved siden af «Inviter» — den
     opretter en virksomhed og kan derfor ikke bo på en virksomhedsside.
     Tilknyt-grenen (`attach-user-to-company`) følger med, fordi den er
     en gren af importen.
  2. Den ØJEBLIKKELIGE SLETNING (`manage-advisor` `delete-company` med
     «slet også brugerkonti») dør. Begrundelse: samme fejl som
     `remove-member` — synkron `auth.admin.deleteUser` med FK'er som NO
     ACTION giver en halv sletning. Hb's `bedOmSletning` (7 dages frist,
     `useVirksomhed.ts:530-540`) er den rigtige vej.
  3. «NULSTIL & GENSEND» på en ACCEPTERET invitation dør. Begrundelse:
     brugeren findes allerede, så et nyt signup-link hjælper ikke; og den
     efterlader en tilstand hvor personen er medlem mens invitationen
     siger pending, så onboarding-tragtens tal bliver forkerte. Ikke målt
     om Jonas bruger den.
  4. LEGATFORLØB-LISTEN dør. `/admin/legat` bliver.
- **Planen — tre bygninger** (forslag fra chatten, stående uden
  indsigelse): **(1) Flyt:** importen + tilknyt til `/virksomheder`;
  fornyelsesnoten til virksomhedssiden; fornyelseslisten og Indgangen som
  udsnit på `/virksomheder`. **(2) Ret de syv veje ind:**
  `AppSidebar.tsx:65, :530, :590`; `Guide.tsx:105, :114, :123, :139`;
  `_shared/indgangsMail.ts:286` (låst af
  `_shared/indgangsMail_test.ts:173`);
  `send-slack-report-notification/index.ts:189, :273, :292`. **(3) Slet
  siden** og de otte filer der kun importeres af den (`MembersStatsBar`,
  `MembersOnboardingFunnel`, `MembersAdminSection`, `IndgangsSektion`,
  `MemberCompanyRow`, `FornyelsesSektion`, `types.ts`,
  `importensAdvarsel.ts`) samt de fem tests der læser `Members.tsx`
  (ovenfor). **Status ved skrivetidspunktet 13/9: bygning 1 er i gang i
  vindue A — TRIN 1 (motoren `src/lib/ansoegningsimport.ts`, ingen
  flade).** Ikke merget, ikke færdigt; forventede ændringer i
  `src/lib/ansoegningsimport.ts`, `src/lib/__tests__/ansoegningsimport.test.ts`
  og `src/pages/Members.tsx` (ingen af dem stod i arbejdstræet da dette
  blev skrevet). **Overhalet 13/9 sen eftermiddag: bygning 1 er FÆRDIG —
  §6 nedenfor. Planens «(1) … fornyelseslisten og Indgangen som udsnit på
  /virksomheder» blev ændret undervejs; §6 bogfører skiftet.**
- **To fejl i mangellisten, som reconen fandt — rettet 13/9.** (a) Kortet
  «Guiden er død kode, pulsen er flyttet — og Slack-fallback peger stadig
  på en tømt /members» sagde «Rådgivermailen `indgangsMail.ts` gør det
  IKKE (grep 10/9: 0)» — det holder ikke: `_shared/indgangsMail.ts:286`
  linker til `/members`, låst af `indgangsMail_test.ts:173`. (b) Samme
  kort sagde at `GuidedTour.tsx`'s «fire /members-links dør med den» —
  de fire links er i `Guide.tsx`, ikke `GuidedTour.tsx`, som ikke
  indeholder ordet «members». Dertil er «`AdvisorDashboard.tsx`' fire
  links» forældet (nul i dag, forsvandt med #626) — rettet på kortet
  «Sletteliste: fem ting der er bygget og aldrig kobles til en flade».
  Historikken står på kortene.

**6. `/members` bygning 1 — FÆRDIG og I DRIFT: importen som panel på
/virksomheder (#823, #824), noten på virksomhedssiden og forsidens samlede
linjer til udsnittet (#825).** Kilder:
`~/Downloads/verifikation-import-motor.txt` (trin 1, HEAD `0b3cb67a`),
`~/Downloads/verifikation-import-panel.txt` (trin 2, HEAD `c0a2de83`),
`~/Downloads/verifikation-fornyelsesnote.txt` og
`~/Downloads/verifikation-forsidelinks.txt` (begge HEAD `1f15250e`),
`~/Downloads/recon-hb-moenstre.md` og
`~/Downloads/recon-de-to-sektioner.md` (kun fund, HEAD `c0a2de83`),
`gh pr view` for de tre PR'er (ordret), og to skærmbilleder kl. 15:37:00 og
15:38:11 (læst 13/9). Skrevet på main ved `78d58a63` (= #825's
merge-commit, hentet). Jonas' ord står som «Jonas 13/9»; det chatten
foreslog og han ikke svarede på, som «forslag fra chatten, stående uden
indsigelse»; er noget ikke målt, står der «ikke målt».

- **De tre PR'er, ordret fra `gh pr view <n> --json mergedAt,mergeCommit`:**
  - **#823** «refactor: ansoegningsimportens motor ud af Members.tsx (trin
    1 af 2)» — mergedAt «2026-09-13T13:08:25Z» (15:08:25 dansk),
    mergeCommit «c0a2de8397111f2640742949d389a8c542e78423». Tre filer:
    `src/lib/ansoegningsimport.ts` (ny),
    `src/lib/__tests__/ansoegningsimport.test.ts` (ny),
    `src/pages/Members.tsx`.
  - **#824** «feat: ansoegningsimporten som panel paa /virksomheder (trin
    2 af 2)» — mergedAt «2026-09-13T13:33:58Z» (15:33:58), mergeCommit
    «1f15250eab09b3fbaaccd64bd35281451f2ac944». Fire filer:
    `src/components/hjemmebane/HbDropzone.tsx` (ny),
    `src/components/hjemmebane/__tests__/HbDropzone.test.tsx` (ny),
    `src/components/hjemmebane/virksomheder/HbAnsoegningsimport.tsx` (ny),
    `src/components/hjemmebane/virksomheder/HbInvitationer.tsx`.
  - **#825** «feat: fornyelsesnoten paa virksomhedssiden + forsidens
    samlede linjer linker til udsnittet» — mergedAt
    «2026-09-13T13:54:51Z» (15:54:51), mergeCommit
    «78d58a6364ada708efc8cfe0945a503558150b9b». Fire filer:
    `src/components/hjemmebane/forside/RaadgiverForsideView.tsx`
    (+13/−15),
    `src/components/hjemmebane/forside/__tests__/samledeLinjerLinker.guard.test.ts`
    (+38, ny), `src/components/hjemmebane/virksomhed/VirksomhedView.tsx`
    (+80/−22), `src/hooks/__tests__/fornyelseSkrivevej.guard.test.ts` (+9).
  Edge functions: ingen rørt i de tre. Update-klikket for frontend-builden
  efter #824: ikke målt; skærmbilledet kl. 15:38 er beviset for at den er
  publiceret. Efter #825: ikke målt, ikke bevist.

- **#823 — motoren.** `src/lib/ansoegningsimport.ts`: `parseAnsoegning`
  (rows → `{ felter, advarsler }`; kaster `FEJL_INGEN_HEADER` / `FEJL_INGEN_DATA`
  med de to gamle tekster), `validerAnsoegning` (alle seks afslag i
  `handleImport`s rækkefølge, teksterne ordret som `Members.tsx:581-621`),
  `byggImportBody` (ordret `:626-632`), `tolkOmsaetning`, `tolkExcelDato`,
  `findHeaderRaekke` og konstanterne. Testen: 39 it-blokke, 76 tests
  (it.each udfoldet), inkl. et kildeværn der læser
  `import-application/index.ts` og kræver at hver nøgle i `byggImportBody`
  står i `interface ApplicationPayload`. `Members.tsx`: «26 linjer ind, 142
  ud» — `laesAnsoegningsfil` (FileReader + xlsx bliver i fladen) →
  `parseAnsoegning`; `handleImport` → `validerAnsoegning` + `byggImportBody`;
  svar-håndteringen urørt. Verifikationen ordret: «Adfærden er FLYTTET,
  ikke ændret». Én bevidst forskel: tomme felter er nu `""` i stedet for
  `null`/`undefined` (samme sandhedsværdi, samme body; React-advarslen om
  `value={null}` forsvinder). tsc nul fejl — «main har pt. NUL
  baseline-fejl»; tests 2892 → 2968 (+1 fil, +76). Husets validering
  fandtes ikke i `src/lib` (CVR-8-cifre står inline to steder:
  `Members.tsx:585` og `IndstillingerView.tsx:249` — kandidat til at dele
  dommen senere; ikke rørt).

- **#824 — panelet, og de tre formvalg.** FIND FØRST
  (verifikation-import-panel) udløste STOP-betingelse 2: ingen af husets
  tre dropzoner kunne bruges uden at kopieres — `HbUploadZone.tsx:42`
  uploader til bucketen og har ingen `onFile`-prop (`kind`/`ownerId`
  påkrævet); `HbReportUploadZone.tsx:32-47, :413` er bundet til
  rapport-pipelinen; `HbBudgetImport.tsx:29-44` har zonen som inline JSX
  med modul-private hjælpere. `EditorShell` er tilstands-monteret men
  bygget til admin-skallens højdebegrænsede split (`HbAdminShell.tsx:110-131`)
  — på en scrollende side kollapser den. Tre formvalg afgjort 13/9
  (forslag fra chatten, stående uden indsigelse):
  1. **PANEL frem for dialog.** Husets største Hb-dialog har syv felter
     (MilestoneDialoger); importen har fjorten; ingen dropzone står i en
     dialog. Formen er `HbBudgetImport`s — ét komponenttræ der skifter på
     tilstand (dropzone → gennemsyn → tilknyt), uden rute, uden overlay.
  2. **`<input type="date">` som LegatViews panel, IKKE
     kalender-popoveren.** `Datovaelger` i `MilestoneDialoger.tsx:77` er
     ikke eksporteret; chattens første råd byggede på dialog-mønsteret og
     blev rettet, da panelet var valgt.
  3. **/members' dialog BLIVER til bygning 3.** Ingen dobbelt-sletning i
     bygning 1.
  Bygget: `HbDropzone.tsx` (den frie dropzone efter HbUploadZones
  button-form `:64-108`: `onFile`, `accept`, `tekst`, `undertekst`, `busy`,
  `busyTekst`, `disabled`; 6 tests: tekst + skjult input med accept, drop →
  første fil, input-valg → onFile og nulstil, klik åbner inputtet, busy
  spærrer, disabled spærrer). `HbAnsoegningsimport.tsx`:
  `ImporterAnsoegningKnap` (samme signatur som `InviterKnap`, aria-expanded,
  toggler) og panelet: filen læses med `arrayBuffer` + dynamisk
  `import("xlsx")` + `sheet_to_json(…, { header: 1, defval: null })` →
  `parseAnsoegning`; parserens fejl → `toast.error("Kunne ikke læse filen",
  …)` som før; alle fjorten felter (de tre der ikke stod i /members' dialog
  — Omsætning (interval), Hjemmeside, Telefon — er med); **motorens
  advarsler vises som stille liste under «Ansøgning læst»**;
  `importAdvarsel()` før knappen «Importér og send invitation»;
  indsendelse: `validerAnsoegning` → første fejl som toast,
  `byggImportBody` → `import-application`; svar som `Members.tsx`
  (`invitation_already_exists` → warning + luk; `user_already_exists` →
  tilknyt-trinnet med CVR-opslag → `attach-user-to-company`;
  `reused_company` → «Virksomheden findes allerede — ny invitation sendt»;
  ellers «Ansøgning importeret ✓»); efter succes
  `invaliderInvitationer(queryClient, company_id)` (dækker `["invitationer"]`
  og `["virksomhedsliste"]`). Montering: `HbInvitationer.tsx:176-181` —
  knap-linjen i en `flex gap-2`-wrapper med `InviterKnap`, panelet lige
  under linjen, inde i sektionen som `VirksomhedslisteView.tsx:524` gate'r
  med `!harUdsnit`; gate `isAdvisor` (sektionens egen, ingen `isAdmin`).
  Tolkninger: «Annullér» rydder OG lukker; «Vælg en anden fil» går til
  dropzonen med panelet åbent. Panelet testes ikke som komponent
  (supabase + edge functions); motoren og dropzonen er låst. tsc nul
  fejl, eslint nul på de fire filer; tests 2968 → 2974 (+1 fil, +6).

- **#825 — noten og forsidelinkene (to vinduer, én PR).** *Noten*
  (verifikation-fornyelsesnote, vindue A): fjerde link-knap «Tilføj
  note»/«Rediger note» i Aftalens `FornyelsesHandlinger`
  (`VirksomhedView.tsx`), KUN når der er en beslutning —
  `skrivFornyelsesnote` (`useVirksomhed.ts:471-481`) er en UPDATE der
  rammer nul rækker uden en række og kaster `:478-480` «Skrivningen ramte
  nul rækker — noten er IKKE gemt (RLS).»; uden beslutning står der intet
  notefelt, som på /members (noten følger beslutningen). Formen er
  MilestoneDialogers felt-for-felt (`:463-494`: åbn med forudfyldt kladde,
  Gem/Annullér, feltet lukkes FØRST efter succes) med link-knapper i
  `FornyelsesHandlingers` egen stil (`:1456`) og gemme-vejen gennem `koer`
  (genindlæsning AWAITes før toasten; `koer` svarer nu boolean).
  `HbTextarea rows={2}`; kun `<span>`-elementer (Linjes værdicelle er et
  span). Docstringen `:1413-1414` («kan kun redigeres på /members») rettet.
  Nyt værn i `fornyelseSkrivevej.guard.test.ts` (+9): importen fra den ene
  skrivevej + kaldet «skrivFornyelsesnote(companyId,». eslint: 1
  præeksisterende fejl uden for diffen (`:998` «as any»). *Forsidelinkene*
  (verifikation-forsidelinks, vindue B): `RaadgiverForsideView.tsx`
  importerede ikke `forsideLinks` — den havde sin egen `grundLink` (:85) og
  `pukkelLink` (:95-96) skrevet FØR #743 og aldrig koblet om; de samlede
  linjer pegede nøgent på `"/virksomheder"` tre steder (:147 DomLinje,
  :356 under stregen tilstande, :365 pukler). Nu `samletLinjeLink(l)`,
  `samletLinjeLink(t)`, `samletLinjeLink(p)` (:145, :354, :363);
  `pukkelLink` slettet; `enkelt` (:144) beholdt — den styrer kun
  tegningen (navn · handling), og for en tilstandslinje er `antal ===
  virksomheder.length` af konstruktion (`forsidensDom.ts:873, :875`).
  Alle fire slags med samlet linje (fornyelse, indgang, tavshed,
  agentforslag) har et gyldigt udsnit (`FORM` `:255-262`, `laesGrundParam`
  `:61-66`) — ingen STOP. Linjen «N andre virksomheder har noget mindre
  presserende» (:346) og «Se virksomhederne» (:371) er ikke slags og
  beholder den nøgne sti. **Pulsen: ingen ændring** — de fire tal linkede
  allerede med `?puls=<nøgle>` via `pulsLinjer` (`pulsen.ts:290-301`, eneste
  kalder `RaadgiverForsideView.tsx:300`). Afvigelse mellem forsidens tal og
  listens rækker er dækket af overskriften selv (`forsideLinks.ts:114`
  «(forsiden talte N)»), og listen slår op i SAMME dom (samme
  cache-nøgle). Når `?grund=` ikke længere findes i dommen:
  `VirksomhedslisteView.tsx:453-457` «Forsiden har ikke længere det tal,
  du klikkede på — listen viser alle virksomheder.»; findes udsnittet men
  ingen rækker matcher: `:562-563` «Ingen af forsidens virksomheder er på
  listen». Nyt værn `samledeLinjerLinker.guard.test.ts` (tre it-blokke;
  verifikationen skrev «4 tests» — det fjerde var vindue A's, DEL 4).
  Fælles kørsel før commit: tsc nul fejl; «Test Files 191 passed (191)» /
  «Tests 2978 passed (2978)».

- **Skærmbevis 13/9 — panelet i drift.** Kl. 15:38:11
  (`screencapture-app-theboardroom-dk-virksomheder-2026-09-13-15_38_11.pdf`,
  læst 13/9): på /virksomheder under «ÅBNE INVITATIONER · 3» står panelet
  «Importér ansøgning — Opretter virksomhed, slår CVR op og sender
  invitationsmail automatisk» med et ægte Monday-ark læst: linjen
  «Ansøgning læst — gennemgå og ret hvis nødvendigt», advarslen «Kolonnen
  «Kontaktperson» blev ikke fundet i arket.» øverst, EMAIL
  j@gourmensch.dk, VIRKSOMHEDSNAVN GOURMENSCH, CVR-NUMMER 40364390,
  KONTAKTPERSON tom, ÅRLIG OMSÆTNING (KR.) 3200000, OMSÆTNING (INTERVAL)
  «D) 2.000.000-4.999.999 kr.», HJEMMESIDE https://www.gourmensch.dk,
  TELEFON 4522185007, KONTRAKTSTART tom, KONTRAKTSLUT 23.01.2027, de tre
  fritekstfelter udfyldt, boksen «Det her sker når du importerer» og
  knappen «Importér og send invitation». **Advarslerne er NYE:** /members'
  dialog gav op i stilhed (utolkelig kolonne → `""`, verifikation-import-
  motor pkt. 1 «ukendt kolonne → "" (stille)»). Kl. 15:37:00
  (`…15_37_00.pdf`): knappen «Importér ansøgning» ved siden af «Inviter»
  over de tre åbne invitationer (WESDEX ApS, Din økonomiafdeling Danmark
  ApS, Two Socks ApS). Om importen blev GENNEMFØRT (knappen klikket,
  GOURMENSCH oprettet): ikke målt, ikke bogført. **Noten og forsidelinkene
  (#825, merget 15:54:51 — EFTER skærmbillederne): ikke bevist på skærm
  ved skrivetidspunktet.** *NOTEN BEVIST I DRIFT, målt kl. 16:53 (§10):
  «h_2026-09-02 PHILBERT ApS;6_fornyelse;tilbyd · af jonas@topix.dk ·
  note=4 tegn · updated 2026-09-13 13:57 · slutdato=2026-09-29» — 13:57
  UTC er tre minutter efter #825 blev merget (13:54:51 UTC).
  Forsidelinkene: stadig ikke bevist på skærm.*

- **Beslutningen der ændrede sig — bogført som skift, ikke kun resultat.**
  Planen fra tidligere 13/9 (§5 og START HER, ordret): «(1) Flyt: importen
  + tilknyt til `/virksomheder`; fornyelsesnoten til virksomhedssiden;
  fornyelseslisten og Indgangen som udsnit på `/virksomheder`.» Det holdt
  ikke, i to trin:
  1. **Et udsnit kan ikke bære knapper** (recon-hb-moenstre 4.3): rækken
     er ét `Link` (`VirksomhedslisteView.tsx:571-573`); `grep -n
     "<button\|HbButton\|onClick"` i filen → 0 fund; filhovedet `:26-32`
     forbyder «ingen Indgang/Fornyelse/Legat/admin-sektion — de hører
     andre steder hen (§11 pkt. 6) eller er ikke afgjort». Chatten
     foreslog derpå SEKTIONER efter HbInvitationer-mønsteret (skjult i
     udsnit, egen hentning og key).
  2. **Reconen af de to sektioner væltede også det**
     (recon-de-to-sektioner): (a) designet gav dem FORSIDEN, ikke listen —
     `raadgiverfladen-design.md:823-832` §11 pkt. 6 «de syv køer, med
     indgange og fornyelser flyttet fra `/members`»; forsiden fik dem i
     #630 og mistede dem med køerne i #638 (denne fil `:5146`). (b) Alt de
     kan, findes i Hb på nær noten: forsidens dom pr. virksomhed
     (`forsidensDom.ts` «fornyelse» `:236`, «indgang» `:237`),
     prisknapperne på virksomhedssiden (`VirksomhedStamdata.tsx:107-141`,
     samme kald og samme fejltolkning som `IndgangsSektion.tsx:148-189`),
     beslutningen i Aftalen. (c) Listerne er ikke bare overflødige, de er
     FORKERTE: `FornyelsesSektion` henter ikke varselstemplerne og siger
     «Klar til tilbud» efter varslet (`VirksomhedView.tsx:98-106`,
     recon 1.2: «grep `varsel` → 0 fund i FornyelsesSektion.tsx»); «N
     kræver opmærksomhed» (`:215`) tæller seks statusser, hvoraf tre
     (`udloebet_tilbyd_ikke`, `klar_til_afsked`, `uden_for_ordningen`)
     ikke kræver nogen handling — forsiden tæller tre
     (`FORNYELSE_VENTER_STATUSSER`, `forsidensDom.ts:561`: «udloebet_tilbyd,
     klar_til_tilbud, beslutning_mangler»). (d) Indgangen: (S) ikke på
     skærmbilledet 13/9 → formentlig nul rækker i prod (ikke målt).
  **BESLUTTET 13/9 (forslag fra chatten, stående uden indsigelse): BEGGE
  lister dør uden erstatning i bygning 3.** Kun noten flyttedes (#825), og
  forsidens linjer fik udsnittet (#825), så arbejdsformen «se alle der
  venter, ét sted» findes i Hjemmebane: forsidens fornyelseslinje → 
  `/virksomheder?grund=fornyelse` («N virksomheder med en fornyelse der
  venter på dig» + «Vis alle»). Designdokumentet (§11 pkt. 6) og listens
  filhoved er IKKE rettet — de siger stadig «forsiden» og «ingen
  Indgang/Fornyelse-sektion»; det første er nu sandt igen af en anden
  grund (forsidens dom bærer dem), det andet holdt.

- **Fund der skal blive — hvor de står.**
  - *Fem nedarvede fejl i importens parser* (verifikation-import-motor
    afsnit A–E), låst i test som «NEDARVET FEJL», IKKE rettet (trin 1
    ændrede ingen adfærd): (A) ISO-datotekst tolkes som Excel-serienummer
    → 1905, afbødet af valideringens 2020-grænse; (B) tekstdato uden
    tidszone kan blive én dag for tidlig i dansk tid (ikke låst — flaky på
    CI); (C) danske datoformater tolkes ikke; (D) «E-mail» med bindestreg
    rammer ikke søgenøglen «Email»; (E) ugyldig datostreng passerer
    valideringen (NaN-sammenligninger er false). Nyt kort (Indgangen),
    Lille.
  - *To værn fejler den dag bygning 3 sletter filerne:*
    `fornyelseSkrivevej.guard.test.ts:43-47` «expect(filer).toContain(
    "src/components/members/FornyelsesSektion.tsx")»;
    `forsidenKaster.guard.test.ts:122-165` læser `Members.tsx` («queryKey:
    ["members-data"» til «enabled: !!user && !!isAdvisor», otte
    `kraevRaekker` og «Listen kunne ikke hentes. Prøv igen.»). På
    /members-kortet som noget bygning 3 SKAL rette.
  - *HbDropzone er husets fjerde dropzone.* De tre ældre (HbUploadZone,
    HbReportUploadZone, HbBudgetImport) er BEVIDST ikke lagt oven på den
    (uden for de tilladte filer; samme greb som `HbOverlejring.tsx:18-20`
    tog for HbDialog). Nyt kort (Design), Lille, «når nogen rører dem
    alligevel».
  - *`listeLink`/`samletLinjeLink` har fandtes siden #743 uden en eneste
    kalder* (recon-hb-moenstre 4.2: «grep i `src` uden tests → ingen
    kaldere uden for `forsideLinks.ts`»). Et FUND om hvordan en hjælper
    kan skrives, testes og bogføres uden at blive brugt — ikke en fejl der
    er rettet; det nye værn `samledeLinjerLinker.guard.test.ts` er
    rettelsen (importen findes, tre kaldesteder findes, den gamle «?
    grundLink(…) : "/virksomheder"»-form findes ikke). Intet kort.
  - *Fornyelseslistens tæller og manglende varselstempler* dør med listen
    — begrundelse på /members-kortet, ikke egne kort.

- **To skrivende vinduer i samme træ — og et testtal der ikke var et
  testtal.** Noten (vindue A) og forsidelinkene (vindue B) blev bygget
  samtidig på main uden gren. Det gik kun godt fordi de rørte forskellige
  filer; begge vinduer opdagede hinanden ved `git add -A` og advarede
  (verifikation-forsidelinks «STOP-NOTE — vindue A's ændringer dukkede op
  EFTER forudsætningstjekket»; verifikation-fornyelsesnote «ADVARSEL —
  FREMMEDE ÆNDRINGER I TRÆET (opdaget ved git add -A)» med «To andre
  claude-processer (pid 91781/91782) kører»). De to vinduer meldte 2975 og
  2978; den fælles kørsel før commit gav 2978 (191 filer); chatten
  forudsagde 2979. To nye fælder i DEL 4.

- **Tallene.** Tests: 2892 (før #823) → 2968 (#823) → 2974 (#824) → 2978
  (#825), 188 → 191 filer. Mangellisten: 128 → 130 (to nye kort; ét
  omskrevet — /members-kortet med bygning 1 markeret som løst, planen
  rettet og de to værn). Intet kort fjernet.

**7. `/members` bygning 2 — vejene ind: SYV AF ELLEVE rettet (#826), Guiden
står som åbent spørgsmål, udrulningen udestår.** *(Begge afgjort samme
eftermiddag — §8.)* Kilder:
`~/Downloads/verifikation-veje-ind.txt` (FIND FØRST + BYG, HEAD `78d58a63`),
`gh pr view 826` (ordret), reflog i dette træ. Skrevet på main ved
`f85e59ef` (= #826's merge-commit). Bygget i et andet vindue mens §6 blev
bogført: tests kørt 16:01:20, filerne staged 16:01:54, commit `ad81c8ed` på
`fix/veje-ind-i-members`, merget 16:13:00 dansk.

- **PR #826, ordret fra `gh pr view --json mergedAt,mergeCommit`:** «fix:
  vejene ind i /members peger nu paa Hjemmebane (bygning 2)» — mergedAt
  «2026-09-13T14:13:00Z» (16:13:00 dansk), mergeCommit
  «f85e59ef4e30d1cb7e119905ebf56a0d6df8264d». Fire filer:
  `src/components/AppSidebar.tsx` (+4/−6),
  `supabase/functions/_shared/indgangsMail.ts` (+3/−2),
  `supabase/functions/_shared/indgangsMail_test.ts` (+2/−2),
  `supabase/functions/send-slack-report-notification/index.ts` (+3/−3).
  Verifikationen ordret: «Filer rørt: præcis de fire tilladte. Ingen andre
  filer havde behov.» tsc: «(ingen output) TSC EXIT=0»; `bun run test` før
  og efter «Test Files 191 passed (191)» / «Tests 2978 passed (2978)»
  (ingen vitest-fil låser AppSidebar-menuen eller slack-funktionen; den
  eneste låsende test var `indgangsMail_test.ts:173` — rettet);
  `check:edge-auth`: «PASS — all 69 triggered files contain at least one
  auth predicate» (81 index.ts skannet).

- **Syv af elleve veje er rettet — fire står tilbage (Guiden).**
  - *AppSidebar.tsx.* Menupunktet «Medlemmer» fjernet fra `advisorNavItems`
    (`:64-67` før: «{ icon: UserCog, label: "Medlemmer", path: "/members" }»;
    `UserCog`-importen med — brugtes kun der). De to `navigate("/members")`
    i company-pickeren («Vis som virksomhed», mobil `:525-531` og desktop
    `:585-591`, kommentaren før: «Navigate to members list — from there
    click into MemberDetail» — MemberDetail er slettet, #626) →
    `navigate("/virksomheder")`. FUND: AppSidebar monteres KUN af
    `AppLayout.tsx` (`:340, :357, :373`), som lever på fem sider —
    `Members.tsx`, `Guide.tsx`, `AnnualBaseline.tsx`, `LegatDashboard.tsx`
    (3 steder), `PulseCheckin.tsx`; ingen Hb-skal bruger den. Efter bygning
    3: fire sider.
  - *`_shared/indgangsMail.ts:286`.* Knappen i rådgivermailen «mangler et
    prisniveau» (`raadgiverManglerPrisMail`, `:258-290`; docblok: «Husets
    FØRSTE mail til en rådgiver … BEVIDST undtagelse, besluttet af Jonas
    2/9») — før: «knap: { tekst: "Åbn i platformen", url:
    `${APP_URL}/members` }»; nu `${APP_URL}/virksomhed/${a.companyId}`.
    Mailen bar ALLEREDE id'et: `:264` «companyId: string» (påkrævet), `:287`
    «efterKnap: [`Virksomheds-id: ${a.companyId}`]» — det stod som tekst
    under knappen — og `indgangsBetalingsmail.ts:143-150` sender
    `companyId` med. Testen `indgangsMail_test.ts:173` låste før
    «href="https://app.theboardroom.dk/members"»; låser nu
    «href="https://app.theboardroom.dk/virksomhed/0f0f0f0f-0000-4000-8000-000000000001"».
  - *`send-slack-report-notification/index.ts`.* De tre fallbacks —
    `:189` (milepæl, in-app `deep_link`), `:273` (puls, in-app), `:292`
    (puls, Slack-linket) — før `/members?companyId=…`, nu
    `/virksomhed/{companyId}`. Fallbacken rammes når `memberUserId` er
    undefined, dvs. virksomheden har INGEN `company_members`-række
    (opslaget `:160-167` og `:221-228`); den gamle form blev ALDRIG læst
    af `Members.tsx` (query-parametret `companyId` findes ikke i filen).
    Hovedvejene `/members/{userId}` (`:76, :100, :484` og
    `send-slack-handout-notification/index.ts:131`) er urørt — de
    viderestilles af `MedlemTilVirksomhed.tsx:65-66` med bevaret
    search/hash.
  - *Bredt grep* i `src/` og `supabase/` (`/members` + anførselstegn/`?`/
    `#`/backtick/linjeslut/mellemrum, `members?companyId`,
    `APP_URL}/members`, `appUrl}/members`): kode-hits = præcis de elleve
    fra reconen + `App.tsx:243` (selve ruten, dør i bygning 3). Alt andet er
    kommentarer. Reconen manglede intet.

- **Guiden — IKKE RØRT, et spørgsmål der ikke er afgjort.** `Guide.tsx:105,
  :114, :123, :139` står tilbage (FIND FØRST 4). Siden har INTET menupunkt
  i Hb (`hbNav.ts`: hverken medlemmets eller rådgiverens nav har /guide);
  rute `App.tsx:240`, ProtectedRoute; nås kun fra den gamle AppSidebar
  (`:60`, secondaryNavItems) eller ved at skrive URL'en. `GuidedTour.tsx:9`
  navigerer til /guide, men GuidedTour er ikke monteret nogen steder (grep
  `<GuidedTour` → 0). Teksterne beskriver funktioner der ikke findes:
  `:105` «Skal alle founders have samme besked? Brug broadcast-funktionen
  i member-oversigten» og `:123` «Broadcast» — ordet broadcast findes ikke
  i `Members.tsx` eller `Virksomheder.tsx`; `AdvisorBroadcast.tsx` monteres
  kun i `AdvisorDashboard.tsx`, som selv ikke er monteret (broadcast-UI'et
  er dødt; edge-funktionen `advisor-broadcast` findes stadig). `:114`
  «Medlemmer»-kortet: delvist — rapporteringsstatus, branche og
  invitationer lever på /virksomheder, «Udvid et medlem for at se
  login-aktivitet» er /members-UI. `:139` «Sæt slutdato på member …
  'Rediger virksomhedsdata' (kun admin)» er /members-specifik; stamdata er
  flyttet til virksomhedssiden (#771, `VirksomhedStamdata.tsx:23`).
  Verifikationens blik (ikke en afgørelse): «Guiden er uden menupunkt i
  Hjemmebane, uden indgang (GuidedTour er ikke monteret), og beskriver en
  flade der forsvinder.» HVIS den rettes: `:105` og `:123` har intet mål
  (fjernes, eller /chat hvis broadcast ikke genopstår); `:114` →
  /virksomheder; `:139` → virksomhedssiden. **SPØRGSMÅLET «ret eller dø»
  er IKKE afgjort.** Bygning 3 kan ikke slette /members før de fire links
  er håndteret. Åbent punkt i START HER og på /members-kortet.

- **Fund → to nye kort.** (a) *To Deno-tests i `indgangsMail_test.ts`
  fejler på urørt main:* `deno test --no-check` efter ændringen: «FAILED |
  17 passed | 2 failed» — «dag 0: subject, tiltale, knap, frist og
  faktura-konsekvens» (`:118`) og «dag 31: subject, beløb, Stripe — og
  INGEN knap» (`:148`). FORUD-EKSISTERENDE: samme 2 fejler på det urørte
  træ (A beviste det med `git stash` 13/9). De vedrører `dag0Mail`/
  `dag31Mail`'s faktura-sætninger. Deno-testene kører hverken i `bun run
  test` eller i CI (kun Tests-workflowet og `check:edge-auth`), så ingen
  har set dem. Hvornår de begyndte at fejle: ikke undersøgt. Nyt kort
  (Drift), Lille. (b) *Company-pickeren lander på rådgiverlisten:* efter
  «vis som virksomhed» navigerer AppSidebar nu til /virksomheder (før
  /members). Chattens læsning 13/9 (ikke en måling): er man i
  medlemsvisning, hører man formentlig til på medlemmets forside, ikke på
  rådgiverens liste. Pickeren har `c.id` i hånden, så `/virksomhed/{id}`
  eller `"/"` ville begge være mulige. Ikke afgjort, ikke bygget. Nyt kort
  (Rådgiverfladen), Lille.

- **Udrulning — ikke gjort endnu.** `_shared/indgangsMail.ts` er en DELT
  fil. Seks funktioner importerer den eller `indgangsBetalingsmail` (målt
  13/9 med grep i `supabase/functions --include=index.ts`):
  `stripe-webhook`, `monday-webhook`, `saet-indgangs-prisniveau`,
  `indgangs-paamindelser-cron`, `send-indgangs-betalingsmail`,
  `fornyelsesvarsel-cron`. Dertil `send-slack-report-notification`, som
  selv er ændret. Hvilke der faktisk SENDER rådgivermailen
  (`raadgiverManglerPrisMail`): ikke målt endnu. DEL 4's fælde «En ændret
  delt fil i `_shared` udrulles eksplicit — og beviset er en tørkørsel»
  gælder her: om Lovable ruller en funktion ud når kun en delt fil er
  ændret, er ikke målt. Udrulningen UDESTÅR; indtil den er bevist, peger
  prod-mailens knap stadig på /members.

- **Tallene.** Tests 2978 → 2978 (191 filer). Mangellisten 130 → 132 (to
  nye kort; /members-kortet og «Guiden er død kode …» omskrevet). Intet
  kort fjernet.

**8. Guiden afgjort (den dør — ankrene bliver), og udrulningen gjort kl.
14:20 UTC.** Kilder: chat 13/9 (Jonas' ord ordret), grep i `src` og
`supabase/functions` 13/9 (målt igen ved bogføringen, HEAD `f85e59ef`),
Lovables build-chat (ordret).

- **Guiden dør.** Jonas 13/9, ordret: «enig» (til chattens anbefaling).
  Chattens begrundelse, stående uden indsigelse: en hjælpeside som ingen
  kan finde, og som beskriver en flade der forsvinder, gør mere skade end
  gavn — den lover funktioner der ikke er der. Skal Hjemmebane have en
  guide, skrives den forfra til den flade der findes; det er et eget
  stykke arbejde. **DØR i bygning 3:** `src/pages/Guide.tsx` (lazy-import
  `App.tsx:29`), ruten `App.tsx:240` «<Route path="/guide"
  element={<ProtectedRoute><Guide /></ProtectedRoute>} />»,
  `src/components/GuidedTour.tsx` (grep `<GuidedTour` i `src` → 0) og
  «Guide»-punktet i AppSidebars `secondaryNavItems` (`AppSidebar.tsx:59`
  «{ icon: BookMarked, label: "Guide", path: "/guide" }»).
- **MEN — ankrene skal blive.** Målt 13/9: `App.tsx` nævner
  Guide-kontrakten fire steder — `:112` «#goals er Guide-kontrakt og skal
  overleve redirectet.», `:129` «Guide-kontrakt; begge skal overleve
  redirectet.», `:136` «#forecast er Guide-kontrakt og
  detect-financial-alerts' deep_link», `:308` «(notifikations-deep_link +
  Guide-hash er kontrakt)». Det er hash-ankre der skal overleve
  viderestillinger (`/budgettering` → `/budget` m.fl.), og `#forecast` er
  også deep_link fra `detect-financial-alerts`. Ankrene bruges altså af
  NOTIFIKATIONER, ikke kun af Guiden. *RETTET i §9 (13/9 aften): det
  holdt ikke — deep_links er stier uden hash; ankrene er dyb-link-ankre,
  ikke notifikations-kontrakt.* `src/hooks/useScrollToHash.ts` og
  dens test `src/hooks/__tests__/useScrollToHash.test.tsx` (describe
  `:33` «useScrollToHash → documented Guide anchors»; fire it-blokke,
  bl.a. kold-load efter ~1 s) SKAL blive. **Udtrykkeligt punkt til
  bygning 3:** testens navn og begrundelse omskrives (ankrene er
  notifikationernes kontrakt), så den næste ikke sletter den fordi
  «Guiden er væk». Guidens afgørelse tilføjer intet kort — kortet «Guiden
  er død kode …» bærer den. *Kortet er FJERNET SOM LØST 13/9 aften (§9).*
- **Udrulningen — målt først.** Grep 13/9 i `supabase/functions`:
  `raadgiverManglerPrisMail` kaldes kun fra
  `_shared/indgangsBetalingsmail.ts:44` (import) og `:143` (kaldet) —
  plus `_shared/indgangsMail.ts:259` (definitionen) og dens test. Tre
  funktioner importerer `indgangsBetalingsmail` (`--include=index.ts`):
  `monday-webhook`, `saet-indgangs-prisniveau`,
  `send-indgangs-betalingsmail`. De tre øvrige fra §7's liste
  (`stripe-webhook`, `indgangs-paamindelser-cron`,
  `fornyelsesvarsel-cron`) importerer `indgangsMail` til ANDRE mails og
  ændrer ikke adfærd — de er ikke udrullet, og behøver det ikke.
- **Udrullet 13/9 kl. 14:20 UTC (16:20 dansk)** i Lovables build-chat,
  fire funktioner: `monday-webhook`, `saet-indgangs-prisniveau`,
  `send-indgangs-betalingsmail` (rådgivermailens knap) og
  `send-slack-report-notification` (sine egne tre fallbacks). Lovable
  ordret: «Alle fire edge-funktioner er udrullet fra nuværende main kl.
  2026-09-13 14:20 UTC: monday-webhook ✅ live, svarer HTTP 401;
  saet-indgangs-prisniveau ✅ live, svarer HTTP 401;
  send-indgangs-betalingsmail ✅ live, svarer HTTP 401;
  send-slack-report-notification ✅ live, svarer HTTP 401. Ingen filer,
  andre funktioner eller migrationer blev rørt.» 401 på et usigneret kald
  er det forventede svar (auth foran alt andet — Bucket A/C). DEL 4's
  fælde om delte filer blev fulgt: udrulningen bedt om eksplicit, ikke
  antaget fra merge.
- **UBEVIST I DRIFT:** at rådgivermailens knap faktisk peger på
  virksomhedssiden. Det kræver at mailen sendes, dvs. en godkendt
  virksomhed uden prisniveau (Monday «Godkendt» → `monday-webhook` →
  `indgangsBetalingsmail.ts:143`). Samme klasse som #815's fejl-gren: et
  åbent bevis der venter på hændelsen. Slack-fallbacks: bevises først når
  en virksomhed uden `company_members`-række udløser en milepæl eller
  puls — ikke målt, samme klasse.
- **Tallene.** Mangellisten 132 → 132 (to kort omskrevet: /members-kortet
  og «Guiden er død kode …»; intet tilføjet, intet fjernet).

**9. Bygning 3 — SLETNINGEN: /members og Guiden er væk (#828, merget
14:47:38 UTC); Update klikket og bevist på skærm; manage-advisor sendt til
udrulning.** Kilder: `~/Downloads/recon-bygning3-sletningen.md` (A's recon,
målt på `f85e59ef`), `~/Downloads/verifikation-bygning3.txt` (testregnskabet),
`~/Downloads/diff-bygning3-stat.txt`, `gh pr view 828`, grep på main
`d9080ad5` ved bogføringen, chat 13/9.

- **PR #828 «feat: /members og Guiden slettes (bygning 3)».** `gh pr view
  828 --json mergedAt,mergeCommit`, ordret:
  «"mergeCommit":{"oid":"d9080ad52bc4e846aab7b894908f4a505b025380"},"mergedAt":"2026-09-13T14:47:38Z"»
  (16:47:38 dansk). 22 filer, 49 linjer ind, 3486 ud. tsc 0 fejl, tests
  2978 → 2955 (191 testfiler → 191), `check:edge-auth` PASS (69 filer).
- **SLETTET:** `src/pages/Members.tsx` (1454 linjer) + syv komponenter i
  `src/components/members/`: `FornyelsesSektion` (309), `IndgangsSektion`
  (317), `MemberCompanyRow` (527), `MembersAdminSection` (182),
  `MembersOnboardingFunnel` (116), `MembersStatsBar` (90), `types.ts` (59);
  `src/pages/Guide.tsx` (318); `src/components/GuidedTour.tsx` (13); de to
  lazy-imports og ruterne `/members` og `/guide` i `App.tsx`;
  «Guide»-punktet i AppSidebars `secondaryNavItems` (nu kun Community,
  `AppSidebar.tsx:57-59`); `manage-advisor`s `delete-company`-gren (27
  linjer — grep `delete-company` i `index.ts` → 0; `Unknown action` står
  `:541`). Tilbage i `src/components/members/`: kun `EditCompanyDialog.tsx`
  (VirksomhedView bruger den).
- **BLEV — og én rettelse af reconen.** `src/lib/importensAdvarsel.ts`
  blev: reconen 13/9 middag (§5) talte otte filer der kun importeres af
  Members; #824 gav den en anden importør (`HbAnsoegningsimport.tsx:7`
  «import { importAdvarsel } from "@/lib/importensAdvarsel"»), så det blev
  syv. `/members/:userId` (`App.tsx:253`, MedlemTilVirksomhed) blev — 978
  notifikationer og Slack-URL'er peger dér. `useScrollToHash.ts` og dens
  test blev (ankrene nedenfor). `import-application` og
  `attach-user-to-company` blev — begge kaldes af HbAnsoegningsimport
  (`:113`, `:168`).
- **SEKS VÆRN RETTET, ikke fem.** A's recon fandt et sjette:
  `medlemsfjernelse.test.ts:85-86` — kort 83's EGET kildeværn fra samme
  formiddag (#820) læste `MemberCompanyRow.tsx` og `Members.tsx` ad
  sti-streng. De seks: `factsDataBasisReadGuard.test.ts` (listeposten),
  `forsidenKaster.guard.test.ts` (/members-blokken `:122-165`),
  `emailSendLogKolonner.guard.test.ts` (sentinellen `:68`),
  `fornyelseSkrivevej.guard.test.ts` (sentinellen `:46`),
  `fornyelsesOrd.test.ts` (posten `:64` og strengen `:73`),
  `medlemsfjernelse.test.ts` (to poster). Hver rettelse bærer nu en
  kommentar om hvorfor værnet blev smallere — `forsidenKaster.guard.test.ts:31-34`,
  ordret: «HISTORIK: /members, FornyelsesSektion og IndgangsSektion blev
  slettet 13/9 (bygning 3), og /members-blokken i dette værn med dem —
  værnet blev ikke smallere ved et uheld; siden findes ikke.»;
  `medlemsfjernelse.test.ts:77-78`: «/members selv blev slettet 13/9
  (bygning 3), så værnet låser de to filer der lever: serveren og
  dommen.»; `emailSendLogKolonner.guard.test.ts:64-65`: «sentinellen er to
  filer — ikke en forglemmelse.» To af de seks (`forsidenKaster.guard`
  `:124` og `fornyelsesOrd.test` `:66-68`) læste filerne på MODULNIVEAU —
  uden rettelse ville `readFileSync` kaste ved modul-load og vælte hele
  filen: 281 linjer værn for AdvisorDashboard, virksomhedslisten og
  BoardroomView (forsidenKaster) og de rene fornyelsesBadge-tests
  (fornyelsesOrd). Alle seks læser ad sti-streng; tsc ser dem ikke. Ny
  fælde i DEL 4.
- **Testregnskabet, ordret fra `verifikation-bygning3.txt`:**
  «forsidenKaster.guard.test.ts 61 → 43 (−18): /members-blokken — 1
  import-it + 8 kilder × 2 it + 1 isError-it», «emailSendLogKolonner.guard.test.ts
  11 → 9 (−2): de to per-fil-it'er for Members.tsx (læser af
  email_send_log) — filen er væk», «fornyelseSkrivevej.guard.test.ts 6 → 5
  (−1): per-fil-it'et «FornyelsesSektion.tsx: skriver ikke selv til
  company_fornyelse» — filen er væk», «medlemsfjernelse.test.ts 15 → 13
  (−2): it'erne for MemberCompanyRow.tsx og Members.tsx i kildeværnet kort
  83 — filerne er væk», «fornyelsesOrd.test.ts 12 → 12 (0): kun strenge
  fjernet», «factsDataBasisReadGuard.test.ts 2 → 2 (0): kun listepost
  fjernet», «Sum: 18+2+1+2 = 23. Testfiler: 191 → 191 (ingen testfil
  slettet).» Målt per fil i HEAD (`git stash`) mod arbejdstræet.
- **ÉN ægte rækkefølge** (A's recon pkt. 7): `factsDataBasisReadGuard`s
  listepost `"src/pages/Members.tsx"` og markøren `Members.tsx:210`
  («// data_basis-undtagelse: …») skulle skifte i SAMME commit — fjernes
  posten først, fejler test 2 («hverken flere eller færre»); fjernes
  markøren først, fejler test 1 (filen læser facts uden dom). Ingen
  rækkefølge med grønt træ skiller dem ad. Alt andet kunne skilles ad: fil
  + import + rute hænger sammen for tsc, men de fem andre værn er
  ordens-uafhængige (at fjerne en streng gør kun værnet smallere),
  GuidedTour havde nul importører, og edge-grenen var uafhængig i træet.
- **`SECURITY_BASELINE.md:30` rettet.** Før: «Only known caller:
  `src/pages/Members.tsx` (advisor-route)» om `get_users_last_login` —
  allerede forkert (tre andre kaldere) og efter sletningen en fil der ikke
  findes. Nu, ordret: «Known callers (målt med grep 13/9, efter /members
  blev slettet): `src/components/hjemmebane/virksomheder/VirksomhedslisteView.tsx`,
  `src/hooks/useVirksomhed.ts`, `src/components/AdvisorDashboard.tsx` —
  alle advisor-flader». Migrationskommentaren
  `20260507120000_harden_get_users_last_login.sql:10` siger stadig det
  gamle — historik, ikke rørt.
- **UDRULNING og BEVIS — i bevidst rækkefølge.** (1) Update klikket i
  Lovable EFTER merge. (2) Målt på skærm: `/members` og `/guide` giver begge
  NotFound — Jonas 13/9, ordret: «De er begge væk». (3) DEREFTER
  `manage-advisor` sendt til udrulning i Lovables build-chat — ved §9's
  skrivetidspunkt var svaret ikke modtaget; **UDRULLET kl. 14:50 UTC**,
  bogført ordret i §10. Rækkefølgen er
  deploy-asymmetrien (A's recon pkt. 3; CLAUDE.md): frontend først ved
  Update, edge ved merge — men udrulningen af `manage-advisor` blev bedt om
  eksplicit, som DEL 4's fælde siger. Frontend uden knap FØR server uden
  gren, så der aldrig fandtes et vindue hvor /members' slet-knap svarede
  «Unknown action». Rækkefølgen holdt hele vejen (§10): der fandtes
  aldrig et vindue hvor slet-knappen stod på skærmen uden en gren bag.
- **Ankrene — en påstand der ikke holdt.** §8 skrev, efter `App.tsx:136`,
  at `#forecast` er `detect-financial-alerts`' deep_link, og at ankrene
  «bruges af NOTIFIKATIONER». A målte det: funktionens deep_links er
  `"/kpis"` (`:147`, `:172`) og `"/budget"` (`:160`) — UDEN hash; grep
  `deep_link.*#` i `supabase/functions` → 0 (alle ni deep_links i huset er
  rene stier). Notifikations-kontrakten er STIEN, ikke ankeret. De fire
  kommentarer i `App.tsx` er rettet — `:140-142`, ordret: «13/9: Guiden er
  slettet; notifikations-kontrakten er STIEN /budget (deep_link uden hash),
  og #forecast er et dyb-link-anker BudgetteringView altid holder i DOM.»
  `useScrollToHash.ts:8-12` siger nu hvad ankrene er: «dyb-link-ankre på
  /kpis (#goals), /reports (#upload, #annual-reports) og /budget
  (#forecast), som redirect-komponenterne i App.tsx og fladerne lover at
  bevare»; testens describe `:42` hedder «useScrollToHash → dyb-link-ankre
  på /kpis, /reports og /budget» (var «documented Guide anchors»). Ingen
  anden kode sender hash-links — grep på de fire ankre i `src` og
  `supabase` uden tests: kun kommentarer (App.tsx, Noegletal.tsx:8,
  Rapportering.tsx:7, Budgettering.tsx:7, RapporteringView:936,
  BudgetteringView:48, HbHandoutDetail:24). Guiden var eneste afsender, og
  den er væk. (P/S) Om mails, bogmærker eller Slack-links udefra bærer et
  anker, kan koden ikke afgøre — derfor bliver ankrene og hooken. Tre
  sidekommentarer (Noegletal.tsx:8, Rapportering.tsx:7, Budgettering.tsx:7)
  siger stadig «Guide-kontrakt» — tekst; tages når filerne rører sig.
- **Tallene.** Mangellisten 132 → 130: FJERNET SOM LØST «/members lukkes i
  tre bygninger …» (alle tre bygninger i drift; historikken i §5–§9) og
  «Guiden er død kode, pulsen er flyttet …» (Guiden slettet,
  Slack-fallbacks rettet #826; om pulsen sagde kortet selv «ingen
  selvstændig handling» — epic'et bærer den). OMSKREVET «Sletteliste …»
  (GuidedTour og MembersStatsBar slettet — tre ting tilbage) og «Sletning
  af en person har ingen vej …» (delete-company væk; de synkrone
  `deleteUser`-kald der er tilbage, målt på `d9080ad5`:
  `bulk-remove-members` `:118`/`:151` og `cleanup-shells` `:178`/`:185` +
  `hardDeleteCompany` `:210` med `deleteUsers: true` →
  `companyHardDelete.ts:103`; syv actions). Ingen nye kort.
- **Åbent ved §9's skrivetidspunkt — rettet i §10:** manage-advisors
  udrulning (GJORT 14:50 UTC) og noten på skærm (BEVIST I DRIFT 16:53) er
  lukket. Tilbage: rådgivermailens knap i drift (§8); forsidelinkene på
  skærm (§6); #815's fejl-gren (§1).

**10. Efter bygning 3 — manage-advisor udrullet 14:50 UTC; målingen kl.
16:53: sletningen var ufarlig, NOTEN ER BEVIST I DRIFT — og efterladenskaber
fra tidligere sletninger.** Kilder: Lovables build-chat (ordret),
`~/Downloads/query-results-export-2026-09-13_16-53-25.csv` (otte sektioner,
kolonner `noegle;sektion;vaerdi`; SQL'en formuleret i
`~/Downloads/recon-hvad-bruges-paa-members.md`, kun læsning, kørt i Lovables
SQL editor), chat 13/9.

- **manage-advisor er udrullet — §9's «udestår» er ikke længere sandt.**
  Lovable ordret: «Udrulningen af manage-advisor lykkedes kl. 2026-09-13 14:50 UTC. Endpointet svarer live med HTTP 401 Unauthorized (forventet). Ingen filer, andre funktioner eller migrationer blev rørt.» (16:50 dansk.) Rækkefølgen holdt hele
  vejen: Update → skærmbevis (/members og /guide NotFound) → udrulning. Der
  fandtes aldrig et vindue hvor slet-knappen stod på skærmen uden en gren
  bag. 401 på et usigneret kald er det forventede (auth foran alt andet).
- **NOTEN — bevist i drift.** Sektion `6_fornyelse`, ordret: «b_med_note
  (note ikke tom);6_fornyelse;1», «h_2026-09-02 PHILBERT ApS;6_fornyelse;tilbyd
  · af jonas@topix.dk · note=4 tegn · updated 2026-09-13 13:57 ·
  slutdato=2026-09-29», «f_seneste_updated_at_paa_raekke_med_note;6_fornyelse;2026-09-13
  13:57:18.165+00». 13:57 UTC = 15:57 dansk — tre minutter efter #825 blev
  merget (13:54:51 UTC). **Beviset for noten i drift er FØRT** (Jonas'
  læsning 13/9); «Åbne beviser» i START HER, §6 og §9 er rettet.
  Forbehold, ikke et åbent bevis: rækken bærer `updated_at`, ikke fladen —
  begge flader brugte samme skrivevej (`useVirksomhed.ts:434-480`), og
  Update-klikket efter #825 blev ikke målt (§6). De øvrige fem rækker:
  «c_pr_beslutning;6_fornyelse;tilbyd: 4 · tilbyd_ikke: 2»,
  «d_seneste_besluttet_at;6_fornyelse;2026-09-10 08:53:37.173+00»,
  «g_varsler (varsel_1 sat / varsel_2 sat);6_fornyelse;1 / 1».
- **IMPORTEN er i brug — og signaturen fra 14:45 var for grov.** Sektion
  `1_import`, ordret: «b_skarp_signatur (90 d · uden legat · intet link ·
  invitation 0-10 min efter oprettelse);1_import;4», «c_pr_vej (90 d · uden
  legat);1_import;import: 4 · ingen_invitation: 3», «a_gammel_signatur (90
  d · uden legat · intet link · slutdato sat);1_import;5». De fire:
  «d_2026-06-19 Limo Group - Viborg Limousine Service;1_import;import ·
  link=0 · slutdato=2027-06-19 · inv efter 00:00:00.131519 ·
  inv-status=accepted · medl=1 · invited_by=jonas@topix.dk (rådgiver)»;
  «d_2026-09-01 Din økonomiafdeling Danmark ApS;… inv efter 00:00:00.168589
  · inv-status=pending · medl=0 · invited_by=jonas@topix.dk (rådgiver)»;
  «d_2026-09-01 Two Socks ApS;… inv efter 00:00:00.122555 ·
  inv-status=pending …»; «d_2026-09-01 WESDEX ApS;… inv efter
  00:00:00.263614 · inv-status=pending …» — alle med invitation under ét
  sekund efter oprettelsen, alle med Jonas som afsender. Den gamle
  signatur «intet betalingslink · slutdato sat» gav fem (§5): den femte,
  «d_2026-08-13 Livja;1_import;ingen_invitation · link=0 ·
  slutdato=2026-12-16 · inv efter — · inv-status=— · medl=1 ·
  invited_by=—», kom ad en anden vej — ingen invitation på virksomheden,
  ét medlem. **RETTELSE af §5's læsning:** tidsafstanden oprettelse →
  første invitation er importens signatur; slutdatoen er det ikke (den
  fanger også virksomheder der fik slutdato ad andre veje). Dertil
  «e_invitationsmails 90 d (email_send_log · template_name=invitation ·
  status=sent);1_import;22 mails · 20 adresser» og
  «f_invited_by-fordeling (invitationer oprettet 90 d);1_import;jonas@topix.dk
  (rådgiver): 13» — ingen anden afsender på 90 dage; Monday-vejens
  `INVITATION_AFSENDER_USER_ID` har ikke oprettet nogen invitation.
- **TILKNYT har været brugt — sidst i marts.** Ordret:
  «a_medlemmer_uden_invitation_accepteret_af_dem (uden rådgivere);2_tilknyt;4»,
  «b_medlem_oprettet_over_10_min_efter_kontoen (uden rådgivere);2_tilknyt;3»;
  «c_2026-03-04 Floren Engros;2_tilknyt;floren@mail.dk · konto 2026-03-04
  09:14 · medlem 2026-03-04 09:14 · inv-accepteret=ingen», «c_2026-03-28
  Bastant Design;2_tilknyt;gry@bastantdesign.dk · konto 2026-02-23 22:41 ·
  medlem 2026-03-28 12:14 · inv-accepteret=ingen», «c_2026-03-28
  Rallysupport;2_tilknyt;peterjacobsen2000@yahoo.dk · konto 2026-03-02
  12:34 · medlem 2026-03-28 12:03 · inv-accepteret=ingen», «c_2026-03-28
  TuaMea Jewelry;2_tilknyt;marianne@mmoelgaard.com · konto 2026-02-23 22:41
  · medlem 2026-03-28 12:14 · inv-accepteret=ingen»;
  «d_invitation_accepteret_over_10_min_efter_kontoen;2_tilknyt;0». Ikke
  siden marts. Floren (konto og medlem samme minut) bærer ikke
  tilknyt-mærket «medlem >10 min efter kontoen» — det gør de tre fra 28/3.
  Grenen fulgte med importen til /virksomheder (#824,
  `HbAnsoegningsimport.tsx:168`).
- **De tre døde var tomme.** «a_pending_med_medlem (invitation pending ·
  medlem med samme email i virksomheden);4_nulstil;0»,
  «c_pending_hvor_kontoen_findes (uanset virksomhed — signup-link hjælper
  ikke);4_nulstil;0» — «Nulstil & gensend» har ingen spor
  («d_accepterede_uden_accepted_by;4_nulstil;2» er to gamle accepter uden
  bærer, ikke nulstillinger). «5_legat»: «a_companies_is_legat;5_legat;0»,
  «b_legat_enrollments pr status;5_legat;0», «c_enrollments_uden_companies_raekke;5_legat;0»,
  «d_enrollments_hvis_virksomhed_ikke_is_legat;5_legat;0». «7_indgang»:
  «a_raekker;7_indgang;0», «b_ubetalte (tilstand ≠ betalt);7_indgang;0»,
  «d_seneste_oprettet (created_at);7_indgang;ingen». **Sletningen
  fjernede intet der blev brugt.**
- **Udsnittet nu** («8_udsnit», ordret): «a_univers (er_kunde · ikke legat
  · ikke udløbet · ikke kun-pending);8_udsnit;22»; «b_fornyelse (status
  active/null · tier full · slutdato > 2026-09-10 · ≤60 dage · beslutning
  null eller tilbyd);8_udsnit;1: PHILBERT ApS (16 d, tilbyd)»; «c_indgang
  (betalingslink i universet · ikke betalt);8_udsnit;0»,
  «c2_indgang_gennem_porten …;8_udsnit;0»; «d_tavshed_signal (aldrig
  besked · eller >21 dage);8_udsnit;10», «d2_tavshed_gennem_porten (aldrig
  · eller ≥33 dage ⇔ alvor ≥70);8_udsnit;8: Bastant Design (138 d),
  Capture IT A/S (94 d), BRILLEVÆRK (76 d), KJ AUTO OG MIKROMAKKER (68 d),
  ANLA GLAS A/S (67 d), TuaMea Jewelry (40 d), Rallysupport (40 d), Brick
  Works ApS (40 d)»; «e_agentforslag (status proposed · proposed_at i
  indeværende ISO-uge);8_udsnit;0 forslag · 0 virksomheder · i universet:
  0». Fornyelseslistens død kostede altså én virksomhed — og den står på
  forsiden.
- **EFTERLADENSKABER — noget der IKKE handler om /members.** Sektion
  `3_sletning`, ordret: «f_storage_uden_ejer (første sti-led er et uuid
  uden companies/auth.users-række);3_sletning;company-logos: 2 ·
  feedback-screenshots: 1 · financial-documents: 129»;
  «c_foraeldreloese_konti (auth.users uden medlemskab · uden rolle · uden
  legat);3_sletning;4: mads@scandimate.dk (oprettet 2026-02-23, sidst
  aldrig), lars@dasgruppen.dk (oprettet 2026-02-23, sidst aldrig),
  jeppe1864@gmail.com (oprettet 2026-02-23, sidst aldrig),
  jh@jonasherlev.dk (oprettet 2026-02-27, sidst 2026-06-01)»;
  «d_foraeldreloese_profiler (profiles uden medlemskab · uden
  rolle);3_sletning;1»; «e_mails_til_adresser_uden_raekke (email_send_log ·
  ingen invitation/contact_email/konto);3_sletning;98 mails · 22
  adresser»; «g_invitationer_frakoblet (company_id null · status accepted
  — cleanup-shells-spor);3_sletning;30»; «a_hb_slettet (data_slettet_at
  sat) pr vej;3_sletning;i_haanden: 8»; «b_hb_anmodet_ikke_slettet
  (offboarding_requested_at sat · data_slettet_at null);3_sletning;0».
  FK'erne mod `companies` («h_fk_til_companies (on delete)», ordret for de
  ti): «budget_targets.company_id=no action», «conversations.company_id=no
  action», «feedback.company_id=no action»,
  «financial_report_facts.company_id=no action»,
  «financial_reports.company_id=no action», «handouts.company_id=no
  action», «kpi_benchmarks.company_id=no action», «kpi_targets.company_id=no
  action», «milestones.company_id=no action»,
  «slack_handout_notification_log.company_id=no action»; «set null» på
  `raadgiver_opgaver` og `session_bookings`; resten cascade. **Læsning
  (chat 13/9, ikke en måling):** de ti «no action»-tabeller hænger ikke
  ved når en virksomhed forsvinder — de bliver liggende. *RETTET i §11
  (A's recon): for bredt — både slettefunktionen og `hardDeleteCompany`
  sletter alle ti eksplicit før `companies`-rækken; de ti blokerer kun SQL
  i hånden og kaskaden fra `auth.users`.* `hardDeleteCompany`
  sletter dem rækkevis før `companies`-rækken, men rører ikke storage
  (grep `storage` i `companyHardDelete.ts` → 0), og en sletning i
  SQL-editoren (de otte 8/9 og Alina, stemplet `i_haanden`) gør heller
  ikke — de 129 filer under `financial-documents/<id>/` er formentlig
  deres. De 30 frakoblede invitationer matcher `cleanup-shells`'
  `preserveInvitations` (`manage-advisor/index.ts:208-213`). De fire konti
  er fra 23.–27. februar; tre har aldrig logget ind. Hvad der skal ske
  (slet, stempl, lad ligge) er ikke afgjort. **Vindue A reconer
  efterladenskaberne netop nu; reconen er ikke læst.** Det gør kortet
  «Sletning af en person har ingen vej …» større, ikke mindre — der ligger
  allerede rester fra de sletninger der er sket. Skrevet som EGET kort
  (Drift), fordi det handler om virksomhedssletningers rester, ikke om en
  manglende vej for personer, og fordi person-kortet allerede bærer tre
  lange afsnit; person-kortet henviser.
- **Tallene.** Mangellisten 130 → 131: NYT «Efterladenskaber fra tidligere
  sletninger …» (Drift); person-kortet omskrevet (udrulningen gjort,
  henvisning). START HER's åbne beviser: rådgivermailens knap (§8),
  forsidelinkene på skærm (§6), #815 (§1).

**11. Efterladenskaberne og deres kilder — A's recon læst; lækagen lukkes
i vindue A.** Kilder: `~/Downloads/recon-efterladenskaberne.md` (A's recon,
KUN FUND, målt på `d9080ad5`; fil og linje herfra), målingen 16:53 (§10,
sektion `3_sletning`), chat 13/9. Reconens mærker gælder: (K) kode, (P) kun
prod.

- **ÉN vej har regel, frist og spor** — slettefunktionen
  (`slet-medlemsdata-cron`, vej 1–3 i `src/lib/sletning.ts`: anmodning 7
  dage `:52`, tilbud_ubesvaret/aldrig_tilbudt dag 45 `:55-63`). Den har
  ALDRIG slettet noget selv: alle 8 stemplede rækker er `i_haanden` (Alina
  8/9 kl. 09:57–10:08, de syv 8/9 kl. 12:14–12:26). Første rigtige
  kandidat tidligst 26/10 (`docs/koereplan-slettefunktionen.md:534`).
  Cron-jobbet er planlagt i hånden 8/9 og har ingen migrationsfil (kun
  kommentaren `20260910180000_kald_edge.sql:83`) — DEL 3's punkt står.
- **TO admin-veje kan stadig kaldes med et admin-JWT, uden frist og uden
  spor:** `manage-advisor` `bulk-remove-members` (`:118-176` — for alle
  medlemmer minus advisor/admin: company_members, profiles, user_roles,
  `deleteUser` i try/catch pr. bruger `:148-155`, derefter DELETE af ALLE
  invitationer `:158-162`) og `cleanup-shells` (`:178-231` — trin 0
  `deleteUser` pr. id, trin 1 stempler `accepted` `:196-203`, trin 2
  `hardDeleteCompany(…, { deleteUsers: true, preserveInvitations: true })`
  `:208-213`), plus `admin-cleanup-test-data` (`hard_delete_company`
  `:75-115`, `delete_orphan_user` `:117-171`, `delete_dangling_invitations`
  `:173-200`, `purge_old_email_log` `:202-228`). Ingen af dem har en kalder
  i `src/` (grep 13/9 → 0). `delete-company` og `remove-member` er væk
  (#820, #828). Nyt beslutningskort — en beslutning, ikke en fejl.
- **Kilderne til de fire efterladenskaber** (K; (P) for de konkrete rækker):
  - (a) **129 filer i `financial-documents`** (+2 `company-logos`, +1
    `feedback-screenshots`): `hardDeleteCompany` rører ALDRIG storage — nul
    forekomster af `storage.from(` i `_shared/companyHardDelete.ts`; den
    sletter `financial_reports`-rækkerne (`:72`) og lader filerne ligge.
    Samme for kaskaden fra `auth.users` (`financial_reports.user_id`
    CASCADE, `20260223141214:21`). Slettefunktionen sletter i syv buckets,
    men `financial-documents` kun ad `financial_reports.file_path`
    (`:285-289`) — aldrig ved at liste mappen `<company_id>/` (det gør den
    for `company-logos`, `:290`) — så filer uden rapportrække overlever
    også den. Grep `.remove(` i `supabase/functions` → kun
    `slet-medlemsdata-cron/index.ts:194`.
  - (b) **4 forældreløse konti** (23/2 ×3, 27/2): `companyHardDelete.ts:103-106`
    fanger fejl fra `auth.admin.deleteUser` med `console.warn` og går videre
    — virksomhed, medlemskab og profil forsvinder, kontoen bliver. *RETTET
    i §12: `deleteUser` kaster ikke — den returnerer `{ error }`; catch'en
    fangede ingenting, og returværdien blev ignoreret TRE steder, ikke ét
    (også `bulk-remove-members` og `cleanup-shells` trin 0).* Tre af
    de fire har ingen profil, skønt triggeren altid opretter én
    (`profiles.user_id` CASCADE, `20260223152943:30-38`): profilen er
    slettet uden at kontoen blev det — mønstret i `hardDeleteCompany:100-106`,
    `bulk-remove-members:149-155` og den gamle `remove-member`. (P) hvilken
    hændelse for netop de fire; kontiene er fra før invitationsgaten
    (`handle_new_user` 23/2 lagde kun profil + samtale,
    `20260223152943:91-103`; 24/2 fik hver profil en virksomhed,
    `20260224222456:88-93`). `d_foraeldreloese_profiler: 1` er en konto der
    findes uden medlemskab og rolle — en af de fire.
  - (c) **30 frakoblede invitationer:** IKKE en fejl — `cleanup-shells`'
    bevidste aftryk. Trin 1 stempler `accepted`
    (`manage-advisor/index.ts:196-203`), trin 2 kalder `hardDeleteCompany`
    med `preserveInvitations: true`, som sætter `company_id = null`
    (`companyHardDelete.ts:82-86`) fordi FK'en ellers ville tage rækkerne
    med (`20260225103844:5`). Aktionen kom 3/3 (commit `f0e4c2f7`). Det
    ser mærkeligt ud i en måling, men er arkivsporet: adressen HAR haft en
    invitation. Usynlige for alle gates og flader (alle filtrerer på
    `pending`), men to skriveveje kan vække dem: `opretInvitation` med
    `companyId: null` genbruger rækken (`hooks/invitationer.ts:93-110`), og
    `send-invitation-email` har intet statusfilter (`:120-124`).
  - (d) **98 mails til 22 adresser:** `email_send_log` har ingen FK og
    røres ikke af `hardDeleteCompany`; kun slettefunktionen sletter
    (a)-labels for den virksomhed den behandler (`:375-382`). (P) hvilke
    labels — `indgang-*`/`fornyelse-*` er (b)-bilag og bliver med vilje;
    målingen skelner ikke (reconen §4b bærer SQL'en).
- **De ti «no action»-FK'er BLOKERER IKKE de to rigtige veje — §10's
  billede er rettet.** Både slettefunktionen (`:314-350`) og
  `hardDeleteCompany` (`:61, :72-78, :65, :95`) sletter alle ti eksplicit
  før `companies`-rækken. De blokerer SQL i hånden og kaskaden fra
  `auth.users` (`financial_reports.user_id` CASCADE →
  `financial_report_facts.source_report_id` UDEN ON DELETE,
  `20260316210844:13`). §10 stillede dem op som en generel fare; det var
  for bredt.
- **Sletning af en PERSON har stadig ingen vej** (mangellisten :1470).
  `fjern-fra-virksomhed` fjerner kun adgangen med vilje
  (`_shared/fjernFraVirksomhed.ts:13-16`). Kaskaden fra `auth.users` tager
  samtale, beskeder og rapporter, men blokeres af
  `financial_report_facts.source_report_id` — halve sletninger.
- **Lækagen lukkes — bygget 13/9 i vindue A; LUKKET og udrullet, se §12:**
  `hardDeleteCompany` skal slette filerne og må ikke sluge fejl fra
  `deleteUser` (rører `_shared/companyHardDelete.ts`,
  `manage-advisor/index.ts`, `admin-cleanup-test-data/index.ts` og en
  test). **Oprydningen af de EKSISTERENDE 129 filer er en anden opgave:**
  kræver en måling af hvilke virksomheder filerne tilhører (reconen §2c
  bærer SQL'en pr. mappe; nogle kan være aktive, og mapper fra 23–25/2 kan
  være nøglet på `auth.uid()`, `20260223141214:10-16`) og en beslutning om
  hvad der slettes. Direkte `DELETE` på `storage.objects` blokeres af
  platformens `protect_delete`-trigger (DEL 4) — det skal gå gennem
  Storage-API'et. Selvstændigt åbent punkt på person-kortet.
- **Ny fælde i DEL 4:** «En fanget fejl uden en modtager er en tavs halv
  sletning.»
- **Tallene.** Mangellisten 131 → 131: efterladenskabs-kortet OMSKREVET til
  «To admin-veje kan slette uden frist og uden spor …» (beslutning;
  tallene flyttet til person-kortet, så ét kort bærer målingen og ét
  bærer beslutningen); person-kortet OMSKREVET (kilderne, lækagen lukkes,
  oprydningen som åbent punkt). Ingen nye kort.

**12. Lækagen er LUKKET og udrullet — PR #830, merget 15:31:14 UTC,
udrullet 15:33 UTC.** Kilder: `gh pr view 830`,
`~/Downloads/verifikation-laekagen.txt` (A's verifikation), Lovables
build-chat (ordret), chat 13/9.

- **PR #830 «fix: hardDeleteCompany sletter filerne og melder fejlet
  kontosletning».** `gh pr view 830 --json mergedAt,mergeCommit`, ordret:
  «"mergeCommit":{"oid":"72d10566110948a02b63115efdd4dd2b9603b405"},"mergedAt":"2026-09-13T15:31:14Z"»
  (17:31:14 dansk). Fire filer, +427/−32:
  `src/lib/__tests__/companyHardDelete.test.ts` (ny, 232 linjer, 12 tests),
  `supabase/functions/_shared/companyHardDelete.ts` (+126),
  `admin-cleanup-test-data/index.ts` (+9), `manage-advisor/index.ts` (+92).
  tsc 0 fejl, tests 2955 → 2967 (191 → 192 filer), `check:edge-auth` PASS
  (69). `deno check` grøn på companyHardDelete og admin-cleanup-test-data;
  manage-advisor bærer to forud-eksisterende fejl (advisors-listens
  email-type, de samme på urørt HEAD).
- **Hvad der faktisk var galt — reconens billede blev skarpere under
  bygningen.** (1) **`auth.admin.deleteUser` KASTER ikke** — den returnerer
  `{ error }` (auth-js `GoTrueAdminApi.deleteUser:260-280`: `_request`
  pakkes i try/catch, en AuthError kommer tilbage som `{ data: { user:
  null }, error }`; kun netværksfejl kastes). Derfor fangede try/catch
  ingenting, og returværdien blev ignoreret TRE steder, ikke ét:
  `companyHardDelete.ts:103-106`, `bulk-remove-members` (løkken `:144-156`
  — `deleted++` uanset) og `cleanup-shells` trin 0 (`:183-190`). §11 sagde
  ét sted — rettet dér. (2) **Rækkefølgen var kilden til de halve
  sletninger:** profil og loginlog blev slettet FØR kontoen (`:100-101` før
  `:103`); fejlede kontoen, stod den tilbage uden noget omkring sig. (3)
  `.delete()`-kaldene i `bulk-remove-members` (`:148-150`) tjekkede heller
  ikke `{ error }`. (4) Svarene sagde altid `success: true` / `ok: true`
  (`manage-advisor:167-172`, `:223-229`; `admin-cleanup-test-data:112`) —
  en virksomhed talte som `deleted` selv om `deleteUser` fejlede for alle
  dens brugere.
- **Hvad der er bygget.** *Kontoen FØRST:* pr. bruger slettes `auth.users`
  før profil, loginlog og medlemskab; fejler den (≠ «not found»), røres de
  tre ikke — kontoen står hel, brugeren samles i `brugereIkkeSlettet`,
  løkken fortsætter, og fejlen går med i svaret. «not found» tolereres som
  allerede slettet (idempotent, samme regel som cronens trin 14). *Storage
  FØRST* (cronens trin 1): `COMPANY_BUCKETS = ['financial-documents',
  'company-logos']` listes under `<company_id>/` og tømmes efter husets
  mønster fra `slet-medlemsdata-cron:182-196` — men REKURSIVT, fordi
  `financial-documents` har to niveauer (`<company_id>/<report_id>/<fil>`
  og `<company_id>/annual/<fil>`) og rækkerne lige er slettet, så der er
  intet at gå ad. Storage-fejl afbryder intet (filerne er ikke kilden til
  sandheden), men samles i `fejl[]`. *Svarene lyver ikke længere:*
  returtypen `HardDeleteResultat { ok, userIds, conversationIds, handoutIds,
  storage, fejl, brugereIkkeSlettet }`; `ok` er kun sand når intet fejlede.
  `cleanup-shells` melder `deleted_with_leftovers` pr. virksomhed med
  storage-fejl og brugere der ikke blev slettet, og trin 0 læser `{ error }`
  → `auth_users_not_deleted`; `bulk-remove-members` sletter kontoen først,
  læser `{ error }`, melder `not_deleted`, `success` kun når listen er tom;
  `hard_delete_company` svarer `ok = result.ok`. Ingen `console.warn`
  tilbage — alt logges med `console.error` OG står i svaret. *Testen* (12,
  mod en mock-klient — `companyHardDelete.ts` har ingen imports og kan
  importeres af vitest, samme mønster som `sletningParitet`): rekursiv
  listning i financial-documents + ét niveau i company-logos, remove med
  de rigtige stier, kun de to buckets, tom mappe → ingen remove,
  storage-fejl afbryder ikke, fejlet deleteUser → `brugereIkkeSlettet` +
  `ok: false` + løkken fortsætter + profil/loginlog urørt for den fejlede,
  «not found» tolereres, uden `deleteUsers` røres ingen konto — plus
  kildeværn: ingen `console.warn` i filen, ingen hårdkodet `success: true`
  i manage-advisor, `{ error }` læses ved hvert `deleteUser`, `result.ok`
  bruges i admin-cleanup-test-data, bucket-valget matcher policyerne
  (`20260226070216`, `20260225124103`, `20260911030000`).
  `data_basis`-markøren (`:60` før) står uændret — `factsDataBasisReadGuard`
  kræver den.
- **Valget RETURNERE frem for KASTE** — begrundet i filhovedet: begge
  kaldesteder er bulk (cleanup-shells' løkke over virksomheder;
  hardDeleteCompanys egen løkke over brugere). Et kast midt i brugerløkken
  ville stoppe de øvrige brugere og efterlade `companies`-rækken (`:110`
  kommer efter) — og et gen-kald ville finde nul medlemmer og slette
  virksomheden alligevel, med kontoen stadig tilbage.
- **IKKE RØRT — meldt som beslutninger, ikke som glemt.** (1)
  `feedback-screenshots` er BRUGER-præfikset (`auth.uid()`,
  `feedback.ts:60-63`; policy `20260911030000:24-30`), ikke
  company-præfikset — mappen `<company_id>/` findes ikke dér, og den ene
  forældreløse fil hører til en slettet KONTO. Om `hardDeleteCompany` med
  `deleteUsers` også skal tømme bruger-buckets (`avatars`,
  `feedback-screenshots`, `chat-attachments`, `community-*`) for de konti
  den sletter: IKKE afgjort — punkt på person-kortet. (2)
  `slet-medlemsdata-cron` er urørt: den går ad `financial_reports.file_path`,
  så filer uden rapportrække overlever også den (reconens hul i 1a
  består). (3) Den kendte fejlårsag for `deleteUser` —
  `financial_report_facts.source_report_id` UDEN ON DELETE
  (`20260316210844:13`) — er uændret; den ender nu i svaret frem for i en
  konsol.
- **UDRULLET kl. 15:33 UTC (17:33 dansk).** Lovable ordret: «Begge edge-funktioner er udrullet fra nuværende main kl. 2026-09-13 15:33 UTC: manage-advisor ✅ live, svarer HTTP 401 Unauthorized; admin-cleanup-test-data ✅ live, svarer HTTP 401 Unauthorized. Ingen filer, andre funktioner eller migrationer blev rørt.»
  Ingen Update nødvendig — ændringen er kun på serveren. Udrulningen bedt
  om eksplicit (DEL 4's fælde om delte filer — `_shared/companyHardDelete.ts`
  er delt).
- **UBEVIST I DRIFT — et åbent bevis der venter på en hændelse, ikke en
  mangel:** at filerne faktisk slettes, og at en fejlet kontosletning står
  i svaret. Det kræver at en af de to veje kaldes (`cleanup-shells`,
  `hard_delete_company`), og ingen af dem har en kalder i `src/`. Testen
  låser adfærden mod en mock-klient; prod-beviset kommer den dag en af
  vejene bruges.
- **Fælden i DEL 4 fik en linje:** den var værre end den så ud —
  funktionen kastede slet ikke, så catch'en var tomt teater tre steder.
- **Tilbage på person-kortet:** oprydningen af de eksisterende 129 + 2 + 1
  filer og fire konti (måling først — reconen §2c og §3c bærer SQL'en),
  bruger-bucket-spørgsmålet, og de to admin-veje uden frist og spor
  (beslutningskortet). Mangellisten 131 → 131 (person-kortet og
  beslutningskortet omskrevet; intet nyt).

**13. Kort 40 — KPI-fallbacken er FJERNET: PR #832, merget 15:57:43 UTC;
Update og skærmbevis ÅBNE ved skrivetidspunktet.** Kilder: `gh pr view 832
--json mergedAt,mergeCommit` (ordret nedenfor),
`~/Downloads/verifikation-kort40.txt` (A's verifikation, målt på main
FØR og EFTER ændringen), chat 11/9 og 13/9.

- **PR #832 «feat: KPI-fallbacken fjernes helt — intet standardmaal (kort
  40)».** `gh pr view 832 --json mergedAt,mergeCommit`, ordret:
  «"mergeCommit":{"oid":"d46fd7bd01037fecbb846cf6f73429bf3968314e"},"mergedAt":"2026-09-13T15:57:43Z"»
  (17:57:43 dansk). Otte filer: `src/lib/appConfig.ts`, `src/lib/kpiMaal.ts`,
  `src/lib/kpiDefs.ts`, `src/components/CompanyChatPane.tsx`,
  `src/components/hjemmebane/indstillinger/IndstillingerView.tsx`, og tre
  tests (`kpiMaal.test.ts`, `kpiMaalEtSted.guard.test.ts` og den nye
  `ingenDomUdenMaal.guard.test.ts`). tsc 0 fejl (før 0), tests 2967 → 2977
  (192 → 193 filer): +2 i kpiMaal, +2 i kpiMaalEtSted, +6 i den nye fil;
  ingen test fjernet eller skippet. eslint på de rørte filer: identisk
  antal fund som på HEAD (CompanyChatPane bærer 33 forud-eksisterende,
  ingen på rørte linjer).
- **Tre ting i samme bygning, fordi de hænger sammen.** *(a) Fallbacken
  væk:* `KPI_FALLBACK_TARGETS` (før `appConfig.ts:112-119`) er slettet, og
  `kpiMaal.ts` importerer intet fra `appConfig`. `fletKpiMaal` returnerer nu
  KUN nøgler med en række i `kpi_targets` (alle med kilde «aftalt»); en
  nøgle uden aftalt mål er FRAVÆRENDE i kortet frem for `{ value: 0, label:
  "—", kilde: "standard" }`. Det er det der lader aftagerne skelne «intet
  mål» (`targets[k]` er undefined) fra «målet er nul» (nøglen findes med
  value 0 og kilde «aftalt») — før fik de to SAMME kilde, og 0 var
  «intet»-signalet. Begge aftagere havde allerede `targets[key] ?? { value:
  0, label: "—" }` (`kpiDefs.ts:171`, `NoegletalView.tsx:205`), så ingen
  typeændring og ingen fil uden for fillisten. *(b) Ingen dom uden mål:*
  `getTargetStatus` (`kpiDefs.ts`) returnerer nu `hit: boolean | null` —
  `null` når `targetNum ≤ 0`. Chattens «Se tal»-skuffe
  (`CompanyChatPane.tsx:1936, :1946`) brugte `afviger={!status.hit}` og
  tegnede RUST uden mål-tekst — en afvigelse fra et mål der ikke fandtes;
  nu `afviger={status.hit === false}`. Rust kræver et mål der ikke er nået.
  *(c) Brancheskiftet skriver ikke mål:* `IndstillingerView`s upsert i
  `kpi_targets` (før `:273-276`, med toasten «KPI-mål opdateret fra
  branchestandard») er fjernet, så standardmålet ikke kommer tilbage under
  navnet «aftalt» næste gang en branchekode ændres. Synken til
  `kpi_benchmarks` fra `industry_benchmarks` (branchesammenligningen)
  beholdes uændret — det er det ærlige alternativ: branchen oplyser, den
  dømmer ikke.
- **Begrundelsen** (Jonas 11/9, ordret: «Jeg er helt enig med dig!»): et
  mål er noget der er aftalt. De to marginer 60 % og 15 % dømte engros
  (45,7 %) som «under» og lod en konsulent (96,9 %) «ramme». Prod 11/9 kl.
  11:43 (`e_40_daekning`): 4 af 30 aktive virksomheder havde en eneste
  række i `kpi_targets` — 26 fik KUN fallbacken, og uden den har de intet
  mål. Det er beslutningen.
- **Sidegevinst fra verifikationen — kortet ««Aftalt» mål er ikke altid
  aftalt» bliver mindre skadeligt, ikke værre.** `NoegletalView.tsx:388-390`
  forudfylder mål-feltet fra `getTarget`, og `:404-412` gemmer
  `parseFloat(ev?.value || "0") || 0` for alle seks nøgler. FØR skrev et gem
  uden redigering FALLBACKTALLET som «aftalt» (feltet var forudfyldt med
  det); nu forudfyldes feltet med "0"/"—", og gemmet skriver 0 — som
  nedstrøms behandles som «intet mål» (`target > 0`-værnene). Grenen står
  tilbage som kode (ikke i fillisten), ikke som data: prod 11/9 havde 0
  rækker med `target_value = 0`. Kortet er omskrevet: branche-upserten er
  væk, tomt-felt-grenen står tilbage.
- **Kildeværn.** Ny `ingenDomUdenMaal.guard.test.ts` (6): `getTargetStatus`
  giver `hit: null` uden mål og dømmer som før med mål; CompanyChatPanes to
  `SkuffeKpiKort`-kald bruger `status.hit === false` og aldrig `!status.hit`;
  IndstillingerView nævner hverken `kpi_targets` eller «branchestandard»,
  men synker stadig `kpi_benchmarks` fra `industry_benchmarks`.
  `kpiMaalEtSted.guard.test.ts` er VENDT (4 → 6): appConfig definerer ikke
  `KPI_FALLBACK_TARGETS`; kpiMaal importerer intet fra appConfig; ingen
  kildefil under `src/` (kommentarer strippet) nævner konstanten i kode; de
  to hentninger (`useKpiTargets.ts:53`, `useVirksomhed.ts:345`) går stadig
  gennem `fletKpiMaal`. Værnet låser nu både «ét sted» og «fallbacken kommer
  ikke tilbage». `kpiMaal.test.ts` (9 → 11): tom liste → `{}`; blanding →
  kun nøgler med række; «intet mål» vs «mål = 0» skelnes; ingen post bærer
  «standard». Serverside: ingen kopi at fjerne — `generate-weekly-focus`
  (`:282-289`), `ai-data-chat` og `run-company-agent` læser `kpi_targets`
  direkte; grep i `supabase/` giver nul.
- **OPFØLGNING, ikke rørt — mærket «Standardmål» er nu død kode.** Ingen
  kodesti producerer længere kilde «standard», men typen `MaalKilde` beholder
  medlemmet (ellers TS2367 i `kpiTone.ts:47`), og `erStandardMaal` /
  `STANDARDMAAL_*` eksporteres stadig. Stederne: `kpiTone.ts:46-49` (state
  «standard»), `StandardmaalMaerke.tsx`, `NoegletalView.tsx:708` og `:1220`,
  `VirksomhedView.tsx:585-588`, `MaalKilde`-medlemmet «standard», plus tre
  tests (`domKraeverAftaltMaal.guard.test.ts` — låser nu død kode —
  `kpiTone.test.ts:52-60, 74-77`, `deriveKpiMetrics.test.ts:225-229`) og
  stale kommentarer (`useKpiTargets.ts:1-14, :50-52`,
  `useVirksomhed.ts:340-344`, `kpiTone.ts:11-19`, `VirksomhedView.tsx:585-587`).
  Kan ryddes i én PR; ingen adfærd afhænger af det nu. Eget kort, Lille.
  Prod-data: de 16 eksisterende `kpi_targets`-rækker hos 4 virksomheder er
  uberørte; nogle kan være skrevet af den fjernede branche-upsert (kendes på
  `target_label` = benchmark-label). Ingen migration i denne bygning.
- **BEVIST PÅ SKÆRM 13/9 kl. 18:26:57**
  (`screencapture-app-theboardroom-dk-kpis-2026-09-13-18_26_57.pdf`, ANLA
  GLAS A/S, `/kpis`): «DINE MÅL: Ingen mål sat endnu» står øverst, og
  kortene bærer hverken mål-tekst, mærke eller rust — samme skærm der
  beviser #833 (§14), så Update er klikket efter begge merges. Ved
  skrivetidspunktet for §13's første version (før 18:26) var det åbent: det
  refererede skærmbillede kl. 18:00 var ikke set; det er 18:26-billedet der
  gælder som bevis.

**14. Branchelinjen på KPI-kortet — fundet på skærmen 13/9 kl. 18:00
(ANLA GLAS, `/kpis`); BESLUTTET: estimatet væk, kortet sammenligner med
forrige måneds eget tal; BYGGET (#833, merget 16:21:03 UTC) og BEVIST PÅ
SKÆRM kl. 18:26:57.** Kilder: skærmen 13/9 kl. 18:00 (Jonas' læsning),
`gh pr view 833` (ordret nedenfor), diffen `ab0fb09f` (læst 13/9 aften),
`screencapture-app-theboardroom-dk-kpis-2026-09-13-18_26_57.pdf`,
`src/lib/appConfig.ts:116-123`, `src/hooks/useKpiBenchmarks.ts:52-60`,
`src/components/hjemmebane/noegletal/NoegletalView.tsx:934-967, 1094-1118`,
`src/lib/kpiDefs.ts:207-210`, chat 13/9.

- **Det kortet viste:** «OMSÆTNING / 1.388.412 / branche 150K · −31,5 %».
  Tre fejl i én linje:
  1. **«branche 150K» er `KPI_DEFAULT_BENCHMARKS`** (`appConfig.ts:116-123`)
     — seks tal for ALLE virksomheder (omsætning 150.000, DB-margin 55 %,
     lønninger 60.000, resultat 12.000, omkostninger 90.000, resultatmargin
     12 %), source «Estimat, The Boardroom». `useKpiBenchmarks.ts:55-60`
     fletter dem ind for hver nøgle uden række i `kpi_benchmarks` — samme
     klasse som fallback-målene, én etage nede. Filens egen kommentar
     (`:112-115`): tallene «er under faglig kuratering
     (hb-branchetal-review.md)» — det dokument findes ikke i repoet (find
     13/9: nul træffere, heller ikke i git-historikken).
  2. **Siden modsiger sig selv.** Brancheafsnittet nederst
     (`NoegletalView.tsx:1094-1118`) læser virksomhedens FAKTISKE branche via
     `companies.industry_code` → `industry_benchmarks` (`:471-491`) og viser
     «52-78 % for reklame og design»; kortet (`:934-967`) læser
     `benchmarksResolved` og viser estimatet («branche 55 %»). To tal for
     samme margin på samme side, fra to kilder.
  3. **−31,5 % er M/M-ændringen** (`kpiDefs.ts:207-210`, `change`), samme
     tal som står i FINANSIEL UDVIKLING som «OMSÆTNING −31,5 % M/M». Formen
     limer «branche 150K» og «−31,5 %» sammen på én linje, så M/M læses som
     en afvigelse fra branchen.
- **BESLUTTET 13/9 (Jonas): estimatet væk — kortet sammenligner med
  FORRIGE MÅNEDS EGET TAL.** Ordret: «det er jo virksomheder i vidt
  forskellige størrelser» — seks faste tal siger intet til nogen; forrige
  måned siger noget til alle, fordi det er deres eget. Chattens anbefaling,
  stående uden indsigelse: uden gyldig forrige måned (`changePct` null —
  `momErGyldig` falsk, under to perioder, eller en af de to seneste et
  estimat) vises INGEN sammenligningslinje, heller ikke en forklaring —
  siden siger det allerede ét sted øverst («Baseret på N målte måneder og M
  estimerede») og i grafens prikkede linje.
- **BYGGET — PR #833 «feat: KPI-kortet sammenligner med forrige maaned,
  ikke med et estimat».** `gh pr view 833 --json mergedAt,mergeCommit`,
  ordret:
  «"mergeCommit":{"oid":"ab0fb09f81cf689c1f33bd7f177944d3d440065f"},"mergedAt":"2026-09-13T16:21:03Z"»
  (18:21:03 dansk). Fire filer, +116/−50: `src/lib/appConfig.ts` (−15:
  `KPI_DEFAULT_BENCHMARKS`-blokken væk), `src/hooks/useKpiBenchmarks.ts`
  (import fra appConfig væk; kortet indeholder KUN nøgler med en række i
  `kpi_benchmarks` — «et benchmark er noget virksomheden har», samme form
  som `fletKpiMaal` i #832: «intet benchmark» = nøglen fraværende, «benchmark
  er nul» = `{ value: 0 }`), `NoegletalView.tsx` (kortets linje: `harMaal`,
  `benchLabel`, `harMoM = changePct != null`; M/M-tallet bærer husets ord
  «M/M» så det ikke læses som en afvigelse fra branchen; intet at vise →
  ingen linje, samme regel som målene) og det nye kildeværn
  `src/lib/__tests__/ingenBranchefallback.guard.test.ts` (5: appConfig
  definerer ikke konstanten; hooken importerer intet fra appConfig og
  opfinder ingen række; M/M bærer «M/M» og vises kun med gyldigt grundlag;
  intet at vise → ingen linje; brancheafsnittet henter stadig den faktiske
  branche uden om hooken). Tests 2977 → 2982. `kpiDefs.ts` blev IKKE rørt —
  M/M-tallet var rigtigt, kun formen var forkert.
- **BEVIST PÅ SKÆRM 13/9 kl. 18:26:57**
  (`screencapture-app-theboardroom-dk-kpis-2026-09-13-18_26_57.pdf`, ANLA
  GLAS A/S): kortene viser nu «1.388.412 / −31,5 % M/M», «35,4 % / +1,1 pp
  M/M», «448.780 / +1,3 % M/M» — intet «branche 150K». Brancheafsnittet
  nederst stod uændret med «52-78 % for reklame og design» (det er §15).
- **NYT FUND PÅ SAMME SKÆRM — M/M arver målets tone.** DB-margin står
  «+1,1 pp M/M» i grøn, mens virksomheden har resultat −242.091 og
  resultatmargin −17,4 %. Tonen dømmer på retningen af én måneds ændring
  uden at vide om niveauet er sundt. Kortets egen kommentar siger «Mål
  dømmer, benchmark oplyser — benchmark farver ALDRIG toner»; M/M er også
  oplysning, ikke en dom. I koden: kortets M/M-span (`NoegletalView.tsx:982`)
  bærer `toneCls` (`:933` — MÅLETS tone: rust ved missed mål, ellers
  ink-soft), og FINANSIEL UDVIKLING (`:866-876`) farver efter retning
  (evergreen-pil ved «up», rust ved «down»). Det var sådan FØR #833 (skjult
  bag branchetallet), så det er ikke en regression — men nu er farven det
  eneste linjen siger. Eget kort, Lille.


**15. Brancheafsnittet — MÅLT kl. 18:28 og BESLUTTET: det dør. Tre nye
kort fra målingen.** Kilder: `~/Downloads/recon-brancheafsnittet.md`
(fundene med fil og linje, SQL'en),
`~/Downloads/query-results-export-2026-09-13_18-28-41.csv` (prod, målt kl.
18:28, kolonner `noegle;sektion;vaerdi`, ordret), chat 13/9.

- **Dækningen** (sektion `a_daekning`, ordret): «1 aktive i alt;27», «2
  aktive med industry_code;26», «3 aktive hvis kode HAR benchmarks;26», «4
  aktive med kode UDEN benchmarks (registerkode?);0 |», «5 aktive UDEN
  industry_code;1 | Bastant Design», «6 aktive med benchmarks OG en
  afsluttet måned i facts;18», «7 aktive med benchmarks UDEN en afsluttet
  måned i facts;8 | Studio Mini ApS, WESDEX ApS, Homie Håndværkerservice
  ApS, Limo Group - Viborg Limousine Service, TOFT ADMINISTRATION ApS,
  TuaMea Jewelry, Two Socks ApS, Din økonomiafdeling Danmark ApS», «8
  kontrol: status = active uanset er_kunde/legat;30», «9 kontrol: aktive
  hvis ALLERSENESTE facts-række er indeværende måned;0». Læsning: 26 af 27
  aktive KAN få afsnittet (kun Bastant Design mangler kode); 18 har også en
  afsluttet måned at dømme på; 8 har ingen. Kontrol 8 forklarer 11/9's «30
  aktive»: det tal er `status = 'active'` uden `er_kunde`/legat-filtret.
  Kontrol 9 = 0: fladens «dig» (allerseneste række) og målingens (seneste
  afsluttede måned) er samme række for alle 18.
- **FORDELINGEN — det er svaret** (sektion `b_dom_*`, ordret):
  `b_dom_gross_margin_pct` «indenfor;2», «over;13», «under;3»;
  `b_dom_ebitda_margin_pct` «indenfor;1», «over;11», «under;6» — alle med
  «heraf estimat 0». 18 virksomheder × 2 nøgler = 36 domme, hvoraf TRE er
  «indenfor». Chattens læsning: et interval hvor 92 % falder udenfor,
  skelner ikke.
- **HVORFOR intervallerne er forkerte for huset** (sektion `c_udenfor_*`,
  ordret): «Booking Innovation;c_udenfor_gross_margin_pct;over | dig 100.0 |
  55-75% for HR og rekruttering | 2026-08 | measured»,
  «Rallysupport;c_udenfor_gross_margin_pct;over | dig 100.0 | 25-45% for
  eventrejser | 2026-04 | measured»,
  «Rezycl.com;c_udenfor_gross_margin_pct;over | dig 100.0 | 45-80% for
  tech-startup | 2026-07 | measured»,
  «Fjeldgaardshop.dk;c_udenfor_gross_margin_pct;over | dig 99.2 | 30-50% for
  detailhandel | 2026-03 | measured». For en virksomhed uden vareforbrug ER
  100 % dækningsbidrag rigtigt — så intervallet er forkert for dem, ikke
  omvendt. Intervallerne er ikke kalibreret til de virksomheder der er i
  huset. ANLA GLAS selv: «under | dig 35.4 | 52-78% for reklame og design |
  2026-05» og «under | dig -17.4 | 10-26% for reklame | 2026-05».
- **ALDEREN** (sektion `e_alder`, ordret): «1 rækker i
  industry_benchmarks;130 | koder 65 | nøgler ebitda_margin_pct,
  gross_margin_pct», «2 source_label: Branchestandard (The Boardroom);130 |
  created 2026-03-29T19:03:15.809879+00:00 → 2026-03-29T21:19:53.951439+00:00
  | updated 2026-03-29T19:03:15.809879+00:00 →
  2026-03-29T21:19:53.951439+00:00», «3 nøgle ebitda_margin_pct;65 | med
  interval (max > min) 65 | uden 0», «3 nøgle gross_margin_pct;65 | med
  interval (max > min) 65 | uden 0». Alle 130 rækker seedet 29/3, ingen har
  rørt dem siden, ingen ekstern kilde, intet årstal. Virksomhedsniveauet
  (`kpi_benchmarks`, aktive): «Branchestandard (The Boardroom);22 |
  virksomheder 11», «E-handel DK;6 | virksomheder 1», «Estimat, The
  Boardroom;6 | virksomheder 1», «Tech-branchen DK;6 | virksomheder 1» —
  14 aktive har egne benchmark-rækker; én har husets estimat GEMT som
  sit eget (panelet skrev det før #833).
- **Brancherne i brug** (sektion `d_brancher`): 23 kombinationer af kode og
  label for 27 virksomheder — `retail_other` 4, `creative_advertising` 2,
  resten 1 hver. Labels er virksomhedens egne ord («3,bar, produktion,
  branding», «Webshop - B2B - B2C / Smykkebranchen - smykkebrand»), ikke
  tabellens. Spredt på 22 koder à 1–2 kan tallene ikke kurateres branche
  for branche med husets egne data.
- **Reconens fund om formen** (`recon-brancheafsnittet.md` §3–4):
  tabellen har KUN to nøgler, så afsnittet kan aldrig vise mere end to
  linjer; bjælken KLEMMER prikken til kanten (`NoegletalView.tsx:1100`,
  `pos` clamped 0–100), så «langt under» ser ud som «lige akkurat udenfor»
  — Doggybed på −101,4 % og Brick Works på 259,4 % står begge i kanten;
  «dig» er den ALLERSENESTE fact-række, også når den er et estimat
  (mærket `:1111`).
- **BESLUTTET 13/9 (chattens anbefaling, Jonas ordret: «Enig med dig»):
  afsnittet fjernes fra `/kpis`.** BLIVER: tabellen `industry_benchmarks`
  (ugefokus' T6 læser den) og IndstillingerViews synk til `kpi_benchmarks`
  (låst af `ingenDomUdenMaal.guard`). Kortet «CVR-branche og faktisk
  branche er to ting» er omskrevet: spørgsmålet ændrer sig når afsnittet
  dør — tilbage er triggeren og synken.
- **BYGGET i vindue A 13/9 aften** (skrevet FØR merge — merget som #834,
  se nedenfor). Kilder: `~/Downloads/verifikation-brancheafsnittet.txt` og
  `~/Downloads/diff-brancheafsnittet.txt` (læst 13/9 aften). Én fil,
  `NoegletalView.tsx`, 1296 → 1240 linjer; verifikationen skriver +20/−76,
  og diff-filen tæller 73 fjernede og 20 tilføjede linjer (Jonas' «128 ud,
  11 ind» i bogføringsopgaven stemmer ikke med filen — filens tal gælder).
  Fjernet: header-ordet «benchmark-gauge» (`:59`), `INDUSTRY_TO_DEF_KEY`
  med doc-kommentar (`:76-84`), hentningen `useQuery(["industry-benchmarks-for-company"])`
  (`:469-491`; query-key'en fandtes ingen andre steder — ingen invalidering,
  ingen deling), `gaugeRows` (`:544-553`) og render-blokken (`:1107-1136`).
  Indsat: én kommentar på sektion 6's plads med målingen (3 af 36 indenfor,
  de 99-100 %-virksomheder, tabellens alder og kilde, clamp-fejlen, og at
  tabellen BLIVER), så den næste ikke bygger afsnittet igen uden at kende
  tallene. Intet dødt tilbage (grep `industryBenchmarkData|gaugeRows|
  INDUSTRY_TO_DEF_KEY` = 0). *A fandt og lod stå:* `senesteErEstimat`-mærket
  blev vist to steder og findes stadig på kortene (`:215`, trend-overblik
  og månedstabel); Download PDF rasteriserer `#kpi-export-area`, som
  afsnittet lå inde i, så det forsvinder af sig selv fra PDF'en; CSV'en
  (`bygFactsCsv`) indeholdt aldrig afsnittet — skærm og fil siger fortsat
  det samme. Tom-tilstanden er uændret (afsnittet lå i else-grenen af
  `monthlyData.length === 0`). Sektionsnumrene i kommentarerne beholdes (5,
  6-kommentar, 7, 8, 9). *Fundet undervejs, ikke rørt:*
  `src/components/IndustryBenchmarkGauge.tsx` importeres INGEN steder —
  gammel, forældreløs komponent (skrevet på slettelisten). tsc 0 fejl;
  eslint 9 fund på filen, identisk på HEAD.
- **VÆRNET FRA #833 LÅSTE EN PRÆMIS DER VAR BORTFALDET — og kæden
  stoppede.** `bun run test` på hele suiten 13/9 kl. 18:40: 1 failed af
  2982. Ordret:
  «FAIL src/lib/__tests__/ingenBranchefallback.guard.test.ts > KPI-kortets
  linje under tallet > brancheafsnittet nederst henter stadig virksomhedens
  faktiske branche — ikke gennem hooken» — «AssertionError: expected
  'import * as React from "react";\nimpo…' to contain
  'from("industry_benchmarks")'» (`:55:18`). Værnet er fra #833, tre timer
  tidligere: det beviste at afsnittet hentede UDEN OM `useKpiBenchmarks`,
  så fjernelsen af fallbacken ikke kunne slå det ihjel. Afsnittet er nu
  væk, og hentningen med det. Værnet gør altså sit arbejde — det fanger, at
  en præmis er skiftet. A's anbefaling (STOP i verifikationen): slet
  assertionen `toContain('from("industry_benchmarks")')` og omdøb it-blokken
  til det den stadig låser (kortets benchmark kommer gennem hooken); den
  anden assertion (`useKpiBenchmarks(companyId ?? undefined)`) er stadig
  sand. Alternativet — vende den til `not.toContain` som værn mod at
  afsnittet bygges igen — er en ny låsning, ikke en oprydning. **Sådan
  blev det rettet (i #834, 14 linjer):** it-blokken er OMSKREVET, ikke
  bare fjernet — den hedder nu «kortets benchmark kommer gennem hooken —
  ingen egen hentning i visningen» og låser
  `useKpiBenchmarks(companyId ?? undefined)`; en kommentar i testen
  (`:56-64`) forklarer hvad der stod, hvorfor præmissen skiftede (målt
  18:28: 3 af 36) og at «værnet blev ikke smallere ved et uheld: der er
  ikke længere nogen hentning at låse». Præmissen skiftede, låsen blev
  flyttet til noget der findes. **Vigtigt:** A's verifikation meldte GRØNT i chatten; den
  havde kun kørt sin egen delmængde, ikke hele suiten. Filen
  `verifikation-brancheafsnittet.txt` bærer nu (læst 13/9 aften) den fulde
  kørsel med fejlen og STOP'et. Det er TREDJE gang 13/9 at commit-blokkens
  egen kørsel fangede noget en verifikation havde meldt grønt (de to
  første: tsc på to testfiler uden for listen, og velkomstmailens paritet).
  Fælden i DEL 4 er skærpet.
- **CHATTENS FEJL, som skal stå:** da terminaloutputtet blev sendt som et
  vedhæftet dokument, var det TOMT i chattens kontekst. Chatten svarede
  alligevel «PR #834 er oprettet», som om kæden var gået igennem. Den var
  stoppet ved `bun run test`, og der blev aldrig lavet en gren — målt 13/9
  aften: `gh pr view 834` → «Could not resolve to a PullRequest with the
  number of 834»; seneste PR er #833. Jonas fangede det: «at der var noget
  der fejlede betyder ikke noget?». Ny fælde i DEL 4: «Et tomt dokument er
  ikke et grønt svar.» Chatten gentog fejlen to gange mere samme aften —
  anden gang LÅ filen på disken og kunne have været læst; fælden er
  skærpet med det.
- **MERGET — PR #834 «feat: brancheafsnittet fjernes fra Noegletal —
  intervallerne skelner ikke».** `gh pr view 834 --json mergedAt,mergeCommit`,
  ordret:
  «"mergeCommit":{"oid":"19e26ca110454afb7bc3e29167bd229adc7d3705"},"mergedAt":"2026-09-13T16:52:02Z"»
  (18:52:02 dansk). Committen bar FIRE filer, +567/−101:
  `NoegletalView.tsx` (−96 netto: 1296 → 1240 linjer),
  `ingenBranchefallback.guard.test.ts` (14 linjer, værnet omskrevet) — OG
  `docs/OVERLEVERING.md` (+428) og `docs/mangelliste.html` (+130): del 3 af
  denne bogføring, som vindue B havde staged med `git add -A`, fulgte med,
  fordi commit-blokken tog HELE index'et og ikke kun de to filer den
  navngav. PR-teksten nævner kun koden. Ingen skade — bogføringen skulle
  alligevel i main — men PR-teksten lyver om sit eget indhold (ny fælde i
  DEL 4). Kommentaren der står tilbage i `NoegletalView.tsx:1062-1080`
  bærer hele målingen (3 af 36, de 99-100 % dækningsbidrag, alderen på de
  130 rækker, clamp-fejlen, hvorfor tabellen bliver), så afsnittet ikke
  bygges igen uden den. **BEVIST PÅ SKÆRM 13/9 kl. 18:58:00 efter Update (`screencapture-app-theboardroom-dk-kpis-2026-09-13-18_58_00.pdf`, ANLA GLAS A/S, `/kpis`):**
  siden går nu direkte fra sammenligningstabellen «MÅNED FOR MÅNED» til
  «AI-ANALYSE». Afsnittet «BRANCHESAMMENLIGNING · MEDIER, KULTUR OG
  KREATIVE ERHVERV» er væk, og der er hverken tom sektion eller hul hvor
  det stod — præcis det bevis PR-teksten bad om. Tests efter rettelsen:
  194 filer / 2982 (uændret antal — ingen test slettet, én omskrevet).
- **Tre nye kort fra målingen.** *(a) «Triggeren BENCHMARK_BELOW fyrer på
  intervaller der ikke skelner»* — `generate-weekly-focus/index.ts:293-320`
  bruger `benchmark_min` fra de samme 130 rækker; målingen: 6 af 18 er
  under på ebitda, 3 af 18 på gross. Om triggeren skal blive, lægges om
  eller dø, er IKKE afgjort — og den rører ugefokus, så den kræver en
  måling af hvor ofte den faktisk fyrer (`weekly_focus`-rækker med
  `BENCHMARK_BELOW` i triggers). Beslutning, Lille. *(b) «Tal der ikke kan
  passe står på skærmen»* — ordret: «Brick Works
  ApS;c_udenfor_ebitda_margin_pct;over | dig 259.4 | 10-26% for reklame |
  2026-03 | measured» og «Doggybed;c_udenfor_ebitda_margin_pct;under | dig
  -101.4 | 3-8% for detailhandel | 2026-08 | measured». En resultatmargin
  på 259,4 % kan ikke passe; kilden er `measured`, ikke estimat. Chattens
  læsning: det handler ikke om branchen, men om at siden viser tal der ikke
  kan passe — kræver sin egen måling (rækkens `metrics` ordret:
  `revenue`, `ebt`, `source_report_id`, `source_type`). Dertil fra reconen:
  formlen bag «ebitda_margin» er resultat FØR SKAT i procent af omsætningen
  (`financialUtils.ts:205-210`, filens egen NOTE: «This is NOT EBITDA
  margin»), mens nøglen i databasen hedder `ebitda_margin_pct` og kortet
  hedder «RESULTAT MARGIN». Navnet i databasen lyver — står på kort (b).
  Fejl, rammer medlem, Lille. *(c) «M/M arver målets tone»* — fundet på
  skærmen 18:26:57, se §14. Mangellisten 134 → 134 (CVR-branche-kortet
  og slettelisten omskrevet; intet nyt).

**16. Oprydningen del 1 — run-weekly-agent er SLETTET og digestens kode
FJERNET: PR #836, merget 17:08:09 UTC; run-company-agent udrullet 17:09
UTC; migrationen kørt; BEVIST PÅ SKÆRM 19:13:00 og 19:16:58.** Kilder:
`~/Downloads/verifikation-oprydningen.txt` (FIND FØRST mod HEAD
`19e26ca1`, BYG, rå slutlinjer), `~/Downloads/diff-oprydningen.txt` (den
stagede diff, 49 KB), reconen 11/9 del A og B (gengivet i «11. september,
eftermiddag» §7 — filen `recon-tre-oprydninger.md` lå ikke i ~/Downloads
13/9 aften), Lovables build-chat og de to skærmbeviser. Beslutningerne er
fra 11/9 — Jonas, ordret: «A» (run-weekly-agent slettes) og «Sluk den»
(digesten); de står i «11. september, eftermiddag» §1 og gentages ikke
her.

- **MERGET — PR #836 «feat: run-weekly-agent slettes og digestens kode
  fjernes (oprydning 1 af 2)».** `gh pr view 836 --json
  mergedAt,mergeCommit`, ordret:
  «"mergeCommit":{"oid":"f23b991955148948c4a0f29c119aac6cffae14d7"},"mergedAt":"2026-09-13T17:08:09Z"»
  (19:08:09 dansk). 21 filer, +114/−955 (`git show --stat f23b9919`).
  Slettet: `run-weekly-agent/index.ts` (90 linjer),
  `send-monthly-digest/index.ts` (382), `_shared/digestGate.ts` (71),
  `_shared/digestMilepaele.ts` (114), `digestGate.test.ts` (7 it) og
  `digestMilepaele.test.ts` (12 it); begge blokke i `config.toml`. Ny:
  `20260913190000_monthly_digest_slukkes.sql` (40 linjer). Rettet:
  `run-company-agent/index.ts` (16 linjer), `EmailTemplatesView.tsx` (−87:
  state, de to handlers og kortet «Månedlig digest»), `EmailLogView.tsx`,
  `indstillinger.ts` og dens test, fem værn/tests, `ugensFokusGate.ts` i
  begge kopier (paritetstesten sammenligner funktionsresultater, ikke
  kildetekst — grøn), `check-edge-function-auth.ts` (kommentaren var
  forældet siden 10/9: ingen cron-only-functions tilbage, grenen bliver).
  tsc 0 fejl. Tests 2982 → 2961 (194 → 192 filer): 19 digest-tests (7 +
  12) slettet med kilden, plus 2 fra `milepaelDom.guard`, som genererer én
  it() pr. DAEKKEDE-post (to poster ud) = 21, ingen anden forskel. To
  sentineller sænket med kommentar: `agentKaldesteder` fra 10 til 9
  kaldesteder (det tiende var run-weekly-agents rå fetch `:67`; de ni
  invoke() står), `agentToerkoersel` fra 6 til 5 triggere.
  `check:edge-auth` PASS: 79 scannede mod 81 før — de to slettede
  funktioner (68 triggered, 0 skip-no-http; før 69 og 1).
  `check-verify-jwt-invariant` PASS (79 scannede, 15 affected). eslint på
  de fire rørte frontend-filer: fejltal identisk med HEAD.
- **FUNDET DER ÆNDRER BILLEDET — «weekly_cron» i `KNOWN_TRIGGERS` var IKKE
  død kode.** Reconen 11/9 (§7, del A) kaldte de fem `weekly_cron`-grene i
  `run-company-agent/index.ts` «døde», og A's opgave 13/9 sagde «rører
  IKKE weekly_cron i run-company-agent»; chatten lagde grenene i
  oprydningen alligevel, og A fandt ved FIND FØRST at ÉN af dem var en
  åben dør. `KNOWN_TRIGGERS` (`:1035`) er hvidlisten der afviser ukendte
  triggere med 400 (`:1039-1043`). Så længe navnet stod der, kunne et
  vilkårligt service-role-kald med `trigger: "weekly_cron"` starte en
  mandagskørsel ingen havde besluttet — med prompt-grenen «Det er mandag
  morgen …» (`:1260`) og retten til at skrive i weekly focus. De fire
  øvrige forekomster (titlen `:673`, `POOL_BLOCKLIST` `:1092`, to
  kommentarer) var døde: de eksekveres kun når triggeren er kommet
  igennem. Navnet er fjernet, så kaldet afvises med 400 — fail-closed, som
  resten af listen og som kommentaren `:1026-1030` vil have det; en
  kommentar på stedet (`:1034-1036`) bærer hvorfor. Det er en RETTELSE af
  reconens billede: «død kode» gjaldt fire af fem; den femte var den
  eneste der gjorde noget, og det den gjorde var at TILLADE.
- **Migrationen — husets mønster, ikke chattens forslag.**
  `20260913190000_monthly_digest_slukkes.sql`. Reconen 11/9 og
  mangellistens kort foreslog en fil «der kun kalder `cron.unschedule`»;
  A fandt at `20260901110000_reflection_nudge_slukkes.sql` løste præcis
  samme situation 1/9 (jobbet fjernet manuelt i prod, repoet schedulerede
  det stadig) og fulgte den: en DO-blok med `IF EXISTS (SELECT 1 FROM
  cron.job WHERE jobname = 'send-monthly-digest') THEN PERFORM
  cron.unschedule(…)`, og en efter-verifikations-SELECT der forventes at
  give 0 rækker (samme værn i `20260810230000:44-55`, `20260825233000:82-87`,
  `20260901090000:68-73`). Et nøgent `cron.unschedule('send-monthly-digest')`
  ville have KASTET, fordi jobbet har været væk siden 11/9 kl. 12:07 (jobid
  550). Migrationen er dermed værnet mod at `20260810230000` (`:73-87`)
  genkøres og tænder et job mod en funktion der ikke findes. **KØRT i
  Lovables SQL editor 13/9 (efter merge)**, ordret: «Query succeeded. No
  rows returned» — som forventet: 0 jobs fjernet, SELECT'en tom.
  Migrationsfilen bærer selv beslutningen, tilstanden 11/9, og at revert
  kræver en ny beslutning og en ny funktion.
- **Gemte værdier bevares.** `monthly_digest` i
  `profiles.notification_email_prefs` røres ikke: `fletPraeferencer`
  (`indstillinger.ts:219-223`) spreder hele det gemte objekt og
  overskriver kun nøglerne i `EMAIL_INDSTILLINGER`; `laesPraeferencer`
  læser kun kendte nøgler. Nøglen er tilføjet `SKJULTE_NOEGLER` efter
  `pulse_reminders`-præcedensen (12/6), og testen låser at en gemt
  `monthly_digest: false` overlever et gem. Ingen læser af nøglen findes
  efter sletningen (grep 0). Ingen backfill.
- **UDRULNING OG BEVIS, i rækkefølge.** *(1)* `run-company-agent` udrullet
  EKSPLICIT (som reconen 11/9 krævede) 13/9 kl. 17:09 UTC (19:09 dansk),
  Lovable ordret: «Udrulningen af run-company-agent lykkedes kl.
  2026-09-13 17:09 UTC. Endpointet svarer live med HTTP 401 Missing or
  invalid authorization (forventet). Ingen filer, andre funktioner eller
  migrationer blev rørt.» Uden den ville hvidlisten på serveren stadig
  kende `weekly_cron`. *(2)* Migrationen kørt: nul rækker (ovenfor).
  *(3)* Update klikket. **BEVIST PÅ SKÆRM kl. 19:13:00**
  (`screencapture-app-theboardroom-dk-admin-emails-2026-09-13-19_13_00.pdf`,
  `/admin/emails`): kortet «Månedlig digest» med knapperne «Send test» og
  «Send til alle» er væk; skabelonlisten har ingen digest-skabelon.
  **Kl. 19:16:58**
  (`screencapture-app-theboardroom-dk-settings-2026-09-13-19_16_58.pdf`,
  `/settings` → Notifikationer): «E-MAILS FRA OS» viser FIRE punkter —
  «Når dine tal venter på dig», «Opdateringer», «Rapportpåmindelser», «Din
  sparring med Morten». «Månedsoverblik — Den 22. i måneden» er væk.
  «Ugens fokus» står i sit eget kort.
- **CHATTENS FEJL, som skal stå:** chatten dikterede først
  `/admin/email-templates` og `/indstillinger` som de sider der skulle
  fotograferes. Begge gav «Siden findes ikke». De rigtige ruter er
  `/admin/emails` og `/settings` (`App.tsx:271`, `:269`) — chatten gættede
  på stierne ud fra komponentnavnene i stedet for at måle dem. En forkert
  sti ser ud som en fejlet bygning: to NotFound-skærme lige efter en
  Update er præcis det billede en tabt build ville give. Ny fælde i DEL 4:
  «En URL dikteres ikke af hukommelsen.»
- **Efterladt — uden for A's filliste, intet brydes af det** (kortet
  «Oprydningens rester», Lille): etiketten `AgentForslagPanel.tsx:44`
  (`AGENT_TRIGGER_LABELS.weekly_cron: "Ugentlig gennemgang"`) kan aldrig
  vises — den slås op med `agent_runs.trigger`, der har nul
  `weekly_cron`-rækker bagud (målt 10/9; 11/9 kl. 09:32 viste stadig kun
  report_committed, anomaly_detected og company_review), og ingen ny kan
  opstå efter fjernelsen fra hvidlisten; én linje. Fire kommentarer
  nævner stadig det slettede: `mcp/src/supabase/client.ts:4`,
  `generate-weekly-focus/index.ts:67`, `Noegletal.tsx:7`
  (send-monthly-digest som /kpis-deep-link-skriver),
  `IndstillingerView.tsx:40` («fem mailtyper» — nu fire).
  Migrationskommentarer der nævner navnene (otte filer, `20260330182519`
  → `20260911040000`) er historik og røres ikke. Dertil, BEVIDST:
  `EmailLogView.tsx:75` mistede etiketten «Månedlig digest», så gamle
  rækker i `email_send_log` med `template_name = 'monthly-digest'` (de
  digests der faktisk blev sendt) nu viser det rå navn — ærligt for
  historik, og etiketten tjente kun digesten.
- **ÅBENT — drift og repo siger ikke det samme.** `run-weekly-agent` og
  `send-monthly-digest` er slettet fra repoet, men ligger formentlig
  stadig udrullet hos Lovable (ikke målt). De har ingen kalder og ingen
  cron (`cron.job` målt 13/9 kl. 14:01: 0 `send-monthly-digest`;
  `run-weekly-agent` stod der aldrig), så de gør ingenting — men skal de
  afregistreres? Står på kortet «Oprydningens rester». Den næste der
  lister funktioner hos Lovable, må ikke læse de to som levende.
- **Mangellisten 134 → 134:** kortet «run-weekly-agent slettes — besluttet
  A» FJERNET SOM LØST (begge halvdele gjort); «Ugens nyheder med
  auto-tråd» og ««Ugens push» med kommentarer» bar allerede «afgøres for
  sig» fra 11/9 — tjekket, og «koden fjernet 13/9» føjet til; podcasten
  står tilbage som oprydningens del 2 (kortet omskrevet); ét nyt kort,
  «Oprydningens rester» (etiketten, fire kommentarer, de to funktioner
  hos Lovable); Rækkefølgens «Små …»-liste mistede «run-weekly-agent —
  slet eller læg om». Tests: 2982 → 2961 (192 filer).
- **FORUDSÆTNINGEN HOLDT IKKE — og fælden slog til igen samme aften.**
  Bogføringsopgaven sagde «Vindue A skriver ikke». Målt 13/9 kl. 19:27:
  mens vindue B skrev denne §16, byggede vindue A kort 56 i samme træ
  (`HbHandoutDetail.tsx`, `lektionerForModul.ts` + test). B's afsluttende
  `git add -A` (kl. ~19:27:00) stagede både docs og A's halve
  src-ændringer; A's commit-blok kørte kl. 19:27:10, tog HELE index'et,
  og committede docs OG kode som `3e3fd9ed` «feat: handout-siden linker
  til de lektioner der hoerer til (kort 56)» på
  `feat/handout-til-lektion` — pushet, og åbnet som **PR #837**, hvis
  tekst kun nævner koden. B's tjek et halvt minut senere: `git status`
  RENT på main, docs-ændringerne VÆK fra disken (branchen var checket ud
  og main igen). Genskabt på main fra `~/Downloads/diff-bogfoering-oprydningen.txt`
  (`git apply`, ren) og staged igen. Konsekvens for Jonas: denne §16
  ligger nu BÅDE i #837 (som A's commit) og staged på main; merges #837
  først, er main's kopi identisk og falder bort ved pull — merges den
  ikke, bærer main's kopi bogføringen. Anden gang på én aften (#834 var
  første); fælden i DEL 4 er skærpet: to vinduer på samme main deler ét
  index, og «A skriver ikke» er en påstand der skal måles med `git
  status` lige før `git add`, ikke antages.

**17. Kort 56 — HANDOUT-SIDEN LINKER TIL DE LEKTIONER DER HØRER TIL: PR
#837, merget 17:29:00 UTC; Update klikket; BEVIST I DRIFT — Jonas: «Det
virker».** Kilder: `~/Downloads/verifikation-kort56.txt` (A's FIND FØRST
mod HEAD `f23b9919`, BYG, rå slutlinjer), `~/Downloads/diff-kort56.txt`
(den stagede kodediff, 225 linjer), reconen 11/9 (`recon-b2-indholdslaget.md`,
gengivet på kortet), prod-målingen 11/9 kl. 11:43 (sektion
`a_56_fordeling`, gengivet i «11. september, eftermiddag») og Jonas' ord
13/9 aften.

- **MERGET — PR #837 «feat: handout-siden linker til de lektioner der
  hoerer til (kort 56)».** `gh pr view 837 --json mergedAt,mergeCommit`,
  ordret:
  «"mergeCommit":{"oid":"146a159601bafdbbedf794a3473e4c0281fe1c92"},"mergedAt":"2026-09-13T17:29:00Z"»
  (19:29:00 dansk). Committen bar FEM filer, ikke tre (`git show
  --numstat 146a1596`): `docs/OVERLEVERING.md` +212/−9,
  `docs/mangelliste.html` +37/−16,
  `src/components/hjemmebane/handouts/HbHandoutDetail.tsx` +39/−0,
  `src/lib/hjemmebane/__tests__/lektionerForModul.test.ts` +86/−0,
  `src/lib/hjemmebane/lektionerForModul.ts` +58/−0 — i alt +432/−25,
  hvoraf koden er +183/−0 og docs +249/−25. De to docs-filer er §16
  (oprydningen del 1), som vindue B havde staged på samme main — index-
  fælden, bogført i §16's sidste punkt og i DEL 4. PR-teksten nævner kun
  koden. Udfaldet af §16's «enten/eller»: #837 gik først, så main's kopi
  af §16 faldt bort ved pull, og det der stod tilbage (NB'en og den
  skærpede fælde) blev **PR #838** «docs: oprydningen del 1 bogfoert, og
  index-faelden skete igen», ordret: mergedAt «2026-09-13T17:35:45Z»,
  mergeCommit «32c7eb32874e4ef77694b85f8c10ece1121d50d7» (+30/−1,
  +4/−0). A's rå slutlinjer: tsc «(ingen output) exit 0 — 0 fejl»; `bun
  run test` «Test Files 193 passed (193) / Tests 2968 passed (2968)» mod
  FØR 192 / 2961 — +1 fil, +7 tests = den nye testfil, ingen anden
  forskel; `bunx eslint` på de tre filer: 1 error og 1 warning, BEGGE
  forud-eksisterende på uændrede linjer (`:54` no-explicit-any på
  `aiFeedback`, `:135` exhaustive-deps `companyId`) — ikke rørt.
- **HVAD DER BLEV BYGGET — koblingen vendt om, som en DELT motor.**
  Koblingen fandtes envejs: `content_items.handout_module` (TEXT,
  nullable, CHECK på de fem moduler, ingen UNIQUE, ingen FK —
  `20260805120000:21-25`) læses af `ElementView.tsx:270` (lektion →
  handout, refleksionskortet med `Link to={/handouts?module=…}`) og
  skrives af `ItemEditor.tsx:414` (admin-select); handout-siden
  importerede intet fra `content_items`. Nu vendes den om. Motoren er
  DELT og REN — kortets egen betingelse fra 11/9 («som en DELT funktion,
  for «Måske relevant for dig» skal bruge samme mapping») — og bor i
  `src/lib/hjemmebane/lektionerForModul.ts` uden supabase-kald: kataloget
  gives ind. Tre funktioner: `lektionerForModul(rækker, modul)` — kun
  `status === "published"` og `handout_module === modul`, sorteret på
  `position` så `created_at` (kursets rækkefølge, som `akademiApi`);
  tomt/ukendt/null-modul giver tom liste, og input muteres ikke.
  `lektionsSti(area, slug)` — ruten `/akademiet/:area/:slug`
  (`App.tsx:291`; nøglen er area+slug, aldrig id) ÉT sted. Og
  `hoererTilTekst(antal)` — «Hører til lektionen» / «Hører til
  lektionerne», null ved nul. Værnet: 7 tests i
  `lektionerForModul.test.ts` (match og kun match; tom/ukendt/null; en
  kladde og et arkiv bliver aldrig et link; sortering; ingen mutation;
  stien; bøjningen). Modulnøglen på handout-siden er `config.module`
  (`HandoutConfig.module: HandoutModule`, `handoutConfig.ts:1, :23`) —
  samme fem værdier som CHECK-constrainten, 1:1.
- **FLADEN — én linje under undertitlen, ingen ny hentning.**
  `HbHandoutDetail.tsx`: `useQuery({ queryKey: ["akademi","items"],
  queryFn: listPublishedItems })` i topblokken (`:70`, FØR `if (loading)`
  `:177` — React #310-reglen), så handout-siden deler cachen med
  Akademiet: nøglen bæres allerede af `useAkademiData.ts:39`,
  `ProgressView.tsx:122` og `CommunityComposer.tsx:664`, og
  `handout_module` følger med i `select("*")`. `useAkademiData()` blev
  fravalgt: den koster fire queries (collections, items, joined,
  progress); til én linje er den rene items-query nok (præcedens:
  ProgressView, CommunityComposer). Linjen står under
  «{subtitle} · {progress}% udfyldt» i samme typografi (`text-sm
  text-hb-ink-soft`); flere lektioner vises alle, adskilt af «, » og
  « og »; linket er `text-hb-evergreen` (husreglen — rust bærer allerede
  fire betydninger). **Fejlet ≠ tom** (`hentefejl.ts:14-17` «TOM OG
  FEJLET ER TO BESKEDER»): ved `isError` vises én stille linje
  `sektionsfejlTekst("akademiet")` som i `ElementView.tsx:151` og
  `OmraadeView.tsx:22`; nul lektioner viser intet. `listPublishedItems`
  kaster ved fejl (`throwIfError`, `akademiApi.ts:40-43`), så fejlen når
  `isError`. **RETTELSE af reconens ord:** reconen 11/9 kaldte
  `listPublishedItems()` «ufiltreret» — den ER filtreret på
  `status = 'published'` (`akademiApi.ts:59-67`); ufiltreret er den på
  `handout_module` og `area`, og det var det reconen mente. Motoren
  filtrerer alligevel selv på published, så formen holder uanset hvem der
  leverer rækkerne.
- **RLS AFGØR HVAD MEDLEMMET SER — legat får intet link, og det er
  rigtigt.** Medlemmets SELECT på `content_items`
  (`20260813100000:76-84`): `status = 'published' AND
  (har_aktivt_medlemskab(auth.uid()) OR (har_aktivt_abonnement(auth.uid())
  AND area = 'talks'))`; ingen senere migration rører policyen (grep i
  `20260813153000`, `20260813160000`, `20260907141500`: tomt).
  `har_aktivt_medlemskab` kræver `c.is_legat = false`
  (`20260907141500_slutdagen_taeller_med.sql:54`), så en legat-bruger får
  NUL rækker — ingen fejl, RLS filtrerer — og ser derfor intet link: ikke
  en fejl, og ikke en fejlbesked om noget de ikke har adgang til.
  Legat-brugeren når handout-siden som før: `handouts` er self-only
  (`20260224071122:35-36`) plus advisor-bred (`:39-40`), company-bred
  SELECT droppet `20260310194637:4`, ingen medlemskabsgate; HandoutsView
  har sin egen «Legat-dag-oplåsning». En rådgiver der ser et medlems
  handout, ser lektionerne (advisor-policyen). Drip: linket bygges uden
  drip-kontekst; et dryp-låst element mødes af ElementViews låseskærm —
  samme accepterede præcedens som `CommunityDokument.tsx:236-241`.
- **PROD-GRUNDLAGET fra 11/9 kl. 11:43** (sektion `a_56_fordeling`,
  gengivet ordret i «11. september, eftermiddag»): 14 elementer bærer et
  modul med fem værdier — overordnet 1 (`start_her`), bogholderi 4,
  administration 3, salg 3, marketing 3 (alle `classroom`). 34
  classroom-lektioner har intet modul. Linjen viser altså kun det der er
  mærket i `ItemEditor`; hvilke af de 34 der burde bære et modul, er et
  redaktionelt valg (Jonas/Morten), ikke kode.
- **BEVIST I DRIFT — uden skærmbillede.** Update klikket i Lovable, og
  Jonas bekræftede 13/9 aften, ordret: «Det virker». Det står som bevis
  uden skærmbillede, som klokkens link 11/9 («Det virker umiddelbart»,
  «11. september, formiddag»). PR-teksten dikterede beviset: åbn et
  handout hvis modul har lektioner (bogholderi 4, administration 3, salg
  3, marketing 3) — linjen «Hører til lektionerne …» under undertitlen,
  linket fører til `/akademiet/:area/:slug`.
- **OPFØLGNING — det A fandt og lod stå.** *(1)* `lektionsSti` bærer
  ruten ét sted, men KUN handout-siden kalder den (grep `lektionsSti` i
  `src`: én kalder). Målt nu på HEAD `32c7eb32` (grep `/akademiet/${` i
  `src`): element-ruten `/akademiet/${area}/${slug}` bygges stadig inline
  SYV steder — `ForsideView.tsx:35` og `:134`, `HbItemRow.tsx:71`,
  `HbKursusKort.tsx:56`, `CommunityDokument.tsx:245`,
  `BoardroomView.tsx:1412`, `ElementView.tsx:318` — plus tre områderuter
  `/akademiet/${areaKey}` (`ForsideView.tsx:67`, `KursusView.tsx:21`,
  `ElementView.tsx:333`), som `lektionsSti` ikke dækker. A's verifikation
  sagde «8 steder», PR-teksten «tre flader» — det målte tal er 7 + 3.
  Ingen fejl i drift; men næste gang ruten ændres, skal den ændres otte
  steder. Nyt kort, Lille: «Lektionsstien bygges inline syv steder ved
  siden af `lektionsSti`». *(2)* De to forud-eksisterende eslint-fund i
  `HbHandoutDetail.tsx` (`:54` `any` på `aiFeedback`, `:135`
  exhaustive-deps `companyId` i `save`) er ikke rørt — de lå der før
  kortet og hører til filens egen oprydning. *(3)* «Måske relevant for
  dig» er motorens anden kalder: kortet er omskrevet med at mappingen nu
  findes (`lektionerForModul(katalog, modul)`), så V1 kan kalde den
  direkte. *(4)* Ingen test rører `HbHandoutDetail` eller læser
  `content_items` direkte — værnet ligger på motoren, ikke på fladen
  (som `drip.test.ts`, `itemProgressState.test.ts`, `hentefejl.test.ts`).
- **Mangellisten 134 → 134:** kortet «Handout → lektion: det omvendte
  link («Hører til …»)» FJERNET SOM LØST; ét nyt kort («Lektionsstien
  bygges inline syv steder …», Drift, Lille); «Måske relevant for dig»
  omskrevet (motoren findes); Status 11/9's «Fire på en time hver»:
  handout → lektion mærket gjort. Tests: 2961 → 2968 (193 filer).
- **FORUDSÆTNINGEN HOLDT IKKE — TREDJE GANG, men STOP-reglen virkede.**
  Bogføringen af kort 56 begyndte med rent træ (`git status --short
  --branch` = «## main...origin/main», HEAD `32c7eb32` = #838) og opgaven
  sagde igen «Vindue A skriver ikke». `git status --short` kørt FØR `git
  add -A`, ordret: « M docs/OVERLEVERING.md», « M docs/mangelliste.html»,
  «?? src/lib/betaltSession.ts» — en tredje fil, untracked, som vindue A
  var begyndt på imens (kort 76, næste i køen: filens hoved siger «Dommen
  over de BETALTE 1:1-sessioner … kort 76, mangelliste «De betalte
  1:1-sessioner stopper ved booking_sent»»). Målt igen to minutter senere:
  « M src/components/hjemmebane/virksomhed/VirksomhedView.tsx», «??
  src/lib/__tests__/betaltSession.test.ts», «?? src/lib/betaltSession.ts»
  — A skrev videre mens B bogførte. Opgavens regel var
  STOP, og den blev fulgt: INTET blev staged, `git add -A` blev ikke
  kørt, og diffen til `~/Downloads/diff-bogfoering-kort56.txt` er
  skrevet fra arbejdstræet (`git diff -- docs`), ikke fra index'et. Det
  er første gang fælden blev fanget FØR den slog til; de to gange før
  (#834, #837) blev den bogført bagefter. Reglen i DEL 4 står: mål med
  `git status` lige før `git add`, og stage aldrig med `-A` når to
  vinduer deler main.

**18. Calendly-påstanden er FALSIFICERET — målt 13/9 kl. 21:30 med ét
GET-kald: planen rækker, der findes intet webhook-abonnement på Jonas'
organisation.** Kilder: målingen (Jonas' personal access token, chatten
13/9 kl. 21:30 — 19:30 UTC), `~/Downloads/recon-de-tre-sessioner.md` F5
(målt 13/9 kl. 20:57 via Calendly-MCP), `~/Downloads/maaling-calendly-webhook.md`
(13/9 kl. 21:03 — signing key), koden ved HEAD `d31726e6`.
`~/Downloads/recon-calendly-reparationen.md` (A's recon, i gang) er IKKE
læst og lå ikke i ~/Downloads da dette blev skrevet.

- **MÅLINGEN, ordret.** Kald mod Calendlys API med et personal access
  token fra Jonas' konto:
  `GET https://api.calendly.com/webhook_subscriptions?organization=https://api.calendly.com/organizations/28fc12fd-844f-4051-988e-9f60089f3aa0&scope=organization`
  → HTTP 200. Svaret:
  `{"collection":[],"pagination":{"count":0,"next_page":null,"next_page_token":null,"previous_page":null,"previous_page_token":null}}`.
  Organisations-URI'en er den `users-get_current_user` gav 13/9
  (`current_organization`, `maaling-calendly-webhook.md`).
- **HVAD DET BEVISER.** *(1)* Jonas' Calendly-plan TILLADER webhooks: et
  200 på webhook-endpointet med `scope=organization` afvises ikke af
  planen. Organisationen «Topix.dk» er `kind: single`, `plan: standard`,
  `stage: paid`, ét medlem (Jonas, owner) — reconens F5, målt 13/9 via
  `organizations-get_organization` og `list_organization_memberships`;
  Calendlys hjælpeside nævner Standard i plan-listen. *(2)* Der er NUL
  webhook-abonnementer på Jonas' organisation (`count: 0`). Mortens
  abonnement ligger på HANS organisation; et abonnement dækker kun sin
  egen organisation, og Morten er ikke medlem af Jonas' (ét medlem). Det
  er derfor Jonas' sessioner aldrig er kommet tilbage — ikke planen.
- **PÅSTANDEN DER STOD SOM KENDSGERNING, tre steder.** «Reparationen
  kræver Calendly-abonnement på premium» (DEL 3-rækken «Betalte
  1:1-bookinger registreres aldrig som `booked`», fra 3/9 aften),
  «reparationen kræver Calendly premium» (mangellistens kort «De betalte
  1:1-sessioner stopper ved `booking_sent`», rettet 8/9) og
  kodekommentaren `src/lib/betaltSession.ts:15` («Reparationen kræver
  Calendly premium — nedprioriteret 3/9», #839). DEL 3-rækken henviste
  til `recon-kontoskifte.md` og `recon-1til1-link.md`, som ikke længere
  ligger i ~/Downloads — hvad påstanden byggede på, kan ikke ses (F5).
  De to docs-steder er rettet i denne bogføring; den gamle ordlyd står
  som historik med «var». **Kodekommentaren er IKKE rørt** — den hører
  til A's bygning (kort 76, #839/#840) og skal med i A's næste ændring
  af filen: linjen skal sige det målte, ikke «premium».
- **KONSEKVENSEN.** Påstanden har begrundet nedprioriteringen af hele
  Calendly-kæden siden 3/9 («Prioritet LAV, besluttet»), og den er grunden
  til at Rallysupports mødedatoer (køb 23/6 og 30/6; «Event started 25
  June at 09:45 (CEST)» og «1 July at 08:30 (CEST)») måtte sættes i
  HÅNDEN 13/9 kl. 20:48 i stedet for at komme fra Calendly. Den blev
  aldrig efterprøvet: beviset var ét GET-kald, som tog ét minut og
  svarede 200. Reconen F5 (kl. 20:57) sagde «kan ikke bekræftes herfra —
  planen ser tilstrækkelig ud, beviset mangler», og målingen kl. 21:03
  stoppede uden at kunne sende kaldet (ingen nøgle lokalt, MCP'en har
  intet webhook-værktøj); kl. 21:30 sendte Jonas det selv. Ny fælde i DEL
  4: «En begrundelse for ikke at bygge skal måles som alt andet.»
- **HVAD DER STÅR TILBAGE — åbent; A reconer nu.** *(a)* To hindringer
  er KODE, ikke plan: `calendly-webhook` filtrerer på `advisor =
  'morten'` (`.eq("advisor", "morten")` ved opdatering `:122` og
  aflysning `:157`), og den matcher rækken via det booking-id som
  `create-free-intro-booking` lægger i Calendly-URL'en
  (`salesforce_uuid` + `utm_content`, `:162-163`; læses
  `calendly-webhook:78`) — `stripe-webhook` skriver linket råt uden id
  (`createCalendlySingleUseLink`, `:1351-1356`). *(b)* Signaturen er IKKE
  en hindring: `signing_key` er et felt i POST-body'en og vælges af den
  der opretter abonnementet — Calendly genererer den ikke
  (`maaling-calendly-webhook.md`). Jonas' abonnement kan derfor bruge
  SAMME nøgle som Mortens, og funktionen behøver hverken ny secret eller
  ændret verifikation (`calendly-webhook:54` læser én secret,
  `CALENDLY_WEBHOOK_SIGNING_KEY`). Mortens nøgle kendes dog ikke i
  klartekst af os — den står som Supabase-secret hos Lovable, ikke i
  repoet — åbent punkt; alternativet er en ny secret og en løkke over to
  nøgler (`:54-67`). *(c)* Abonnementet skal oprettes på Jonas'
  organisation (`POST /webhook_subscriptions`, `scope: organization`,
  som med ét medlem er lig `scope: user`). IKKE gjort. *(d)* Detaljen
  bliver A's `recon-calendly-reparationen.md`, når den ligger der.
- **SIKKERHED — tokenet skal revokeres.** Et Calendly personal access
  token med `webhooks:write` og `organizations:write` blev delt i
  chatten i KLARTEKST 13/9 for at sende målingen. Jonas er bedt om at
  revokere det (calendly.com → Integrations → API & Webhooks). Det står
  her, så en senere gennemgang kan tjekke at det er sket; indtil det er
  revokeret, kan enhver med chatteksten oprette og slette
  webhook-abonnementer på organisationen.
- **Mangellisten 134 → 134:** kortet «De betalte 1:1-sessioner stopper
  ved `booking_sent`» omskrevet — blokeringen er ikke planen, men koden
  plus et manglende abonnement; ingen fjernet, ingen tilføjet.
- **Uden for denne bogføring:** HEAD er `d31726e6` — #839 «feat: de
  betalte 1:1-sessioner vises som det de er (kort 76)» og #840 «fix:
  betalingsdatoen er created_at, og tiden beviser afholdt — ikke
  Calendlys URI» (commit-tider 17:52:16 og 18:33:55 UTC; `gh pr view`
  ikke kørt) er merget og IKKE bogført her. Kort 76 bogføres for sig.

**19. CALENDLY-KÆDEN LUKKET — PR #842 merget 13/9 kl. 20:04:19 UTC, tre
functions udrullet 20:05 UTC, secret sat og bevist læst, Jonas'
webhook-abonnement oprettet 20:16:47 UTC. En rigtig booking er UBEVIST.**
Kilder: `~/Downloads/recon-calendly-reparationen.md` (A's recon — nu
læst; det er den §18 ventede på), `~/Downloads/verifikation-calendly-kaeden.txt`
(baseline og slutlinjer, målt FØR og EFTER), `~/Downloads/diff-calendly-kaeden.txt`
(diffen, 677 linjer), `gh pr view 842`, Lovables build-chat og Calendlys
svar (ordret, chatten 13/9 sen aften).

- **PR'EN.** #842 «feat: Calendly-kaeden lukkes for Jonas' spor».
  `gh pr view 842 --json mergedAt,mergeCommit`, ordret: mergedAt
  «2026-09-13T20:04:19Z», mergeCommit
  «4bf3d40586ee64c49be153918903551bdac76d01» (22:04:19 dansk). Elleve
  filer, +382/−136: `stripe-webhook/index.ts`,
  `calendly-webhook/index.ts`, `create-free-intro-booking/index.ts`, den
  nye `_shared/calendlyWebhookDom.ts` og dens test
  `src/lib/__tests__/calendlyWebhookDom.test.ts`, `betaltSession.ts`
  (filhovedet — premium-linjen fra §18, nu det målte), `introSession.ts`
  og `VirksomhedView.tsx` (kommentarer), de to betaltSession-tests og
  `SECURITY_BASELINE.md` (Bucket C med to nøgler). Verifikationen: FØR
  195 filer / 2992 tests, tsc nul fejl; EFTER tsc nul fejl, `bun run test`
  196 filer / **3002 tests** (+1 fil, +10 tests = den nye dom-test: 4
  routing + 6 genåbnings-gate; alle 2992 gamle grønne, incl.
  `betaltSession.guard`), `bun run check:edge-auth` PASS (68 af 68),
  `bun run check:verify-jwt` PASS (15 af 15). `deno check` rent på
  `calendly-webhook` og `create-free-intro-booking`; på `stripe-webhook`
  fejler den FØR den nye kode nås («Could not find a matching package for
  'npm:@lovable.dev/email-js@0.1.0'», `_shared/managedEmail.ts:15`) —
  lokal npm-opløsning, ikke ændringen.
- **HVAD DER VAR GALT — målt i reconen, ikke gættet.** `stripe-webhook`
  gemte det single-use bookinglink RÅT (`:1355-1362`): idempotens-select'en
  (`:1338`) hentede `status, calendly_booking_url` men IKKE rækkens `id`,
  og ingen linje satte det på linket. Så bar intet betalt link et id — og
  `calendly-webhook` matcher UDELUKKENDE på `payload.tracking.salesforce_uuid
  || utm_content` (`:77-82`), så den havde intet at matche på; hver event
  fra Jonas' spor ville være endt som 200 «fremmed event» før nogen
  DB-adgang. Oven i det filtrerede begge UPDATE'er på
  `.eq("advisor","morten")` (`:122`, `:157`). Mortens vej
  (`create-free-intro-booking:161-164`) indlejrer id'et som
  `salesforce_uuid` + `utm_content` på PRÆCIS samme slags link — begge
  veje er `POST /scheduling_links` med `max_event_count: 1` (recon F1),
  og pass-through på single-use links er bevist i prod (2 af 3
  Morten-rækker har `calendly_event_uri`, F3). Den eneste strukturelle
  forskel er HVORNÅR id'et findes: Morten genererer det før linket,
  Jonas' række er oprettet af `create-stripe-checkout` før betalingen med
  DB-default id (F2). Der var ingen teknisk forskel mellem sporene, kun
  en manglende linje. Reparationen: `id` med i select'en, og de fire
  linjer fra Mortens vej dubleret efter `createCalendlySingleUseLink`
  (anden gang Calendly-hjælperne står i begge filer; en samling i
  `_shared/calendly.ts` er et eget run). Mangler rækken
  (`create-stripe-checkout` logger og fortsætter ved insert-fejl), gemmes
  linket råt som før og der logges en `warn` — ingen regression, kun en
  booking webhooken ikke kan ramme.
- **TRE BESLUTNINGER (chatten 13/9).** *(a)* **TO signing keys frem for
  én delt.** `calendly-webhook` læser nu `CALENDLY_WEBHOOK_SIGNING_KEY`
  (Mortens abonnement — navnet er arv) og
  `CALENDLY_WEBHOOK_SIGNING_KEY_JONAS`, filtrerer de manglende fra og
  prøver hver nøgle mod signaturen; den der matchede, logges. En delt
  nøgle kobler sporene: roteres den ét sted, svarer funktionen 401 til
  BEGGE abonnementer, Calendly retry'er i 24 timer med back-off og sætter
  derefter begge `disabled` — og en `disabled` subscription kan ikke
  genaktiveres, den skal slettes og oprettes igen (recon §5a, F9). Med to
  nøgler er rotation uafhængig pr. abonnement. Og funktionen tåler at den
  anden secret MANGLER: én nøgle i listen er præcis som før 13/9, ingen
  nøgle er 503 som hidtil — derfor kunne koden udrulles FØR secret og
  abonnement fandtes, uden regression for Morten. Vej (a) i reconen
  (genbrug Mortens nøgle) blev fravalgt af samme grund, og fordi Mortens
  værdi kun findes som secret hos Lovable. *(b)* **Advisor-filteret er
  FLYTTET, ikke fjernet.** `.eq("advisor","morten")` gjorde ikke matchet
  mere entydigt — `id` er PRIMARY KEY — det afskar bare Jonas' spor. Men i
  aflysningsgrenen bar det én skjult sideeffekt: `:166-177` genåbnede
  `companies.intro_session_used_at` ved `canceler_type === "host"` uden
  at se på rækkens advisor. Var filteret bare slettet, ville en
  host-aflysning af en BETALT Jonas-session have givet virksomheden en
  ekstra gratis intro (recon F4). Nu matcher begge grene på `id` alene,
  select'en tager `advisor` med, og genåbningen gates på RÆKKENS advisor:
  kun `(host, morten)` er sand. *(c)* **Webhookens beslutning blev en
  ren, testet funktion.** Funktionen havde INGEN test overhovedet (recon
  F8: tre værn læser `stripe-webhook`-kilden, intet læser
  `calendly-webhook`). Nu ligger «hvad gør vi ved denne event» i
  `_shared/calendlyWebhookDom.ts`: `doemCalendlyEvent` (event-type +
  `rescheduled` → book / aflys / ignorer med grund) og `genaabnerGratis`
  (canceler_type + advisor → bool), kaldt FØR nogen DB-adgang og testet i
  ti tests — hele matricen, kun host/morten genåbner; strengen `"true"`
  er ikke en flytning (feltet er boolean); no-show, recap, routing-form
  og ukendte typer ignoreres med grund.
- **VÆRTSIDENTITETEN LOGGES, IKKE HÅNDHÆVES.** Calendlys OpenAPI-spec
  lover top-level `created_by` («The user who created the webhook» —
  abonnementets opretter) og
  `payload.scheduled_event.event_memberships[].user`/`user_email`
  (værten). Ingen har set felterne i en FAKTISK payload — samme forbehold
  som funktionens egen note om `scheduled_event` fra 8/9. Funktionen
  logger dem nu ved HVER event, også fremmede, sammen med hvilken nøgle
  der verificerede (`[calendly-webhook] <event> verificeret med '<spor>'.
  created_by=… vaert.user=… vaert.user_email=…`). De måles først i
  function-logs; indtil da styrer rækkens advisor sideeffekterne. To
  strukturelle signaler bærer imens: et abonnement ser kun sin egen
  organisations events (ét medlem i Jonas'), og nøglen der verificerede,
  er i sig selv beviset for hvilket abonnement beskeden kom fra.
- **UDRULNING OG BEVISER, i rækkefølge med tidspunkter.**
  1. **Tre functions udrullet 13/9 kl. 20:05 UTC (22:05 dansk)**, auto
     fra merge. Lovable ordret: «calendly-webhook ✅ live, svarer HTTP 401
     invalid signature; stripe-webhook ✅ live, svarer HTTP 400 Invalid
     signature; create-free-intro-booking ✅ live, svarer HTTP 401 Missing
     or invalid authorization.» At `calendly-webhook` svarede 401 og ikke
     503 beviste allerede dér at Mortens nøgle stadig læses gennem det
     nye loop — listen var ikke tom.
  2. **Secret `CALENDLY_WEBHOOK_SIGNING_KEY_JONAS` sat i Lovable** — 64
     hex-tegn, genereret lokalt og båret i en fil med umask 077, ikke i
     udklipsholderen (se fejl (a) nedenfor).
  3. **BEVIST at funktionen læser den:** et kald signeret lokalt med den
     nye nøgle, UDEN gyldigt booking-id, svarede HTTP 200
     «{"received":true,"skipped":"fremmed event"}» — signaturen godkendt
     af den nye nøgle, og funktionen stoppede før nogen DB-adgang, som
     den skal. Reconens trin 3 («bekræft med ét test-kald før POST'et»)
     fulgt.
  4. **Abonnementet oprettet 13/9 kl. 20:16:47 UTC (22:16:47 dansk)**
     med `POST /webhook_subscriptions` (Jonas' personal access token i
     shellen, aldrig i repoet). Svaret ordret: state «active», scope
     «organization», events [invitee.created, invitee.canceled], uri
     «https://api.calendly.com/webhook_subscriptions/9bca1b66-7ce2-466f-aa5b-47770c0dbec2»,
     organization «…/28fc12fd-844f-4051-988e-9f60089f3aa0», creator
     «…/users/f3e23f1c-cc7c-4f4d-a6b8-8220e35e58f5» (Jonas' user-URI,
     målt 13/9 kl. 20:57). Målingen kl. 21:30 (§18) sagde `count: 0`; nu
     er der ét.
  5. **Nøglefilen slettet lokalt; tokenet bedt revokeret** (samme token
     som §18's sikkerhedspunkt — det blev brugt igen til POST'et og skal
     stadig væk; ikke bevist revokeret).
- **RÆKKEFØLGEN VAR KRITISK og blev holdt: kode → secret → bevis på at
  nøglen læses → abonnement.** Omvendt — abonnement før nøglen kan læses
  — ville hver event have givet 401, Calendly ville retry'e i 24 timer
  med back-off og derefter sætte abonnementet `disabled`, som ikke kan
  genaktiveres (recon F9 og §8 «den eneste farlige rækkefølge»). Rettes
  fejlen inden 24 timer, leveres de kø'ede events; efter 24 timer er
  abonnementet dødt og events tabt. Det står nu som regel for ETHVERT
  fremtidigt webhook-abonnement i «Beslutninger der står fast».
- **UBEVIST I DRIFT — åbent bevis: at en rigtig booking faktisk kommer
  tilbage.** Det kræver et køb gennem et id-bærende link, og de findes
  først fra kl. 22:05 dansk (udrulningen). Beviset når det kommer: rækken
  i `session_bookings` får `booked`, `calendly_event_uri`, `start_tid` og
  `slut_tid`, og function-loggen viser «invitee.created: booking <id>
  (jonas) -> booked (…)» plus værts-linjen. Rallysupports to gamle rækker
  kan ALDRIG rammes: deres links (juni) bærer intet id, og
  `stripe-webhook`s idempotens (`calendly_booking_url` sat →
  `already_processed`) udsteder aldrig et nyt — deres tider blev håndsat
  13/9 kl. 20:48 og forbliver håndsatte (recon F6, §4). Åbent fra reconen
  stadig: om Calendly kopierer `tracking` til den nye invitee ved
  flytning (antaget siden 23/6; en flytning uden tracking efterlader
  rækken `booked` med den gamle tid).
- **TO FEJL AF CHATTEN samme aften.** *(a)* Nøglen blev lagt i
  udklipsholderen, og chatten bad derefter Jonas kopiere et secret-NAVN —
  så var nøglen væk: det der blev gemt i Lovable, var ikke det der blev
  signeret med, og testkaldet fejlede med 401. Anden gang i træk den
  fælde. Løsningen blev en fil skrevet med umask 077, læst af begge trin,
  slettet bagefter. Ny fælde i DEL 4: «Udklipsholderen er ét felt — læg
  aldrig en hemmelighed der, hvis brugeren skal kopiere noget andet
  undervejs.» *(b)* Chatten dikterede `read -rs -p` (bash-syntaks) til en
  zsh-terminal og fik «no coprocess». Fælden om URL'er i DEL 4 gælder
  også skalsyntaks: mål miljøet, gæt ikke — udvidet dér.
- **Mangellisten 134 → 133:** kortet «De betalte 1:1-sessioner stopper
  ved `booking_sent`» FJERNET SOM LØST for fremtiden; noten om at de to
  Rallysupport-rækker forbliver håndsatte står på kort 76's kort («Jonas
  ser Mortens sessioner og omvendt …»). Kortet om Calendly premium var
  allerede rettet i #841. DEL 3-rækken markeret lukket.
- **Uden for denne bogføring:** vindue A bygger nu den INKLUDEREDE
  Jonas-session (rører `src/` og `supabase/`). Bogført i §20.

**20. DEN INKLUDEREDE SESSION MED JONAS — PR #844 merget 13/9 kl.
20:42:15 UTC, migrationen kørt 22:42, fire functions udrullet 20:45 UTC,
BEVIST PÅ SKÆRM kl. 22:48:25. Kortenes tekster er ÅBNE (rettes i vindue
A nu).** Kilder: `~/Downloads/verifikation-jonas-session.txt` (målt 13/9
kl. 22:35 på `cc60921f`, FØR merge), `~/Downloads/diff-jonas-session.txt`
(diffen, sytten filer), migrationen
`supabase/migrations/20260913220000_jonas_session_used_at.sql` (ordret),
`gh pr view 844`, Lovables build-chat, skærmen kl. 22:48:25 og Jonas'
ord (chatten 13/9, ordret). A's tekstrettelser er IKKE læst — de er
uncommitted i A's arbejdstræ, mens dette skrives.

- **PR'EN.** #844 «feat: den inkluderede session med Jonas kan bookes
  (kort: de tre sessionstyper)». `gh pr view 844 --json mergedAt,mergeCommit`,
  ordret: mergedAt «2026-09-13T20:42:15Z», mergeCommit
  «7ba2a3b1670e19922e945994816a4b8fc50d5ea3» (22:42:15 dansk). Sytten
  filer, +1157/−287: `BookSessionView.tsx`, `VirksomhedView.tsx`,
  `EditCompanyDialog.tsx`, `betaltSession.ts`, `bookSessionTilstand.ts`,
  `hjemmebane/indstillinger.ts`, `_shared/calendlyWebhookDom.ts`,
  `calendly-webhook`, `create-free-intro-booking`,
  `create-stripe-checkout`, `stripe-webhook`, migrationen,
  `SECURITY_BASELINE.md` og fire testfiler. Verifikationen: tsc nul fejl;
  `bun run test` 197 filer / **3049 tests** — fra 3002 (+1 fil, +47:
  `betaltSession.test.ts` 21 → 28, `bookSessionTilstand.test.ts` 18 → 34,
  `calendlyWebhookDom.test.ts` 10 → 19, ny `inkluderetSession.guard.test.ts`
  15); `bun run check:edge-auth` PASS (68 af 68).
- **RETTEN — en søsterkolonne, ikke en ny tabel.** Ny kolonne
  `companies.jonas_session_used_at timestamptz NULL` (migration
  `20260913220000`), søster til `intro_session_used_at` (Mortens, fra
  `20260619120000`). **Kørt i Lovable → SQL editor 13/9 kl. 22:42 —
  verificeret: begge kolonner `timestamptz`, begge nullable.** Nullable
  uden default, så alle eksisterende virksomheder starter med retten
  intakt; ingen RLS-ændring («Advisors can update all companies» dækker
  admin-afkrydsningen, edge functionen skriver med service role).
  Begrundelsen står i migrationen, ordret: «En separat tabel (company_id,
  advisor, used_at) ville IKKE fjerne asymmetrien — den ville flytte den:
  Mortens ret i en kolonne, Jonas' i en tabel, to gates af forskellig
  form. Symmetrien mellem de to rettigheder er vigtigere end at undgaa
  endnu en kolonne med et raadgivernavn i.» Og: «Mortens ret er EN kolonne
  med fire skrivere (claim, rollback, host-genaabning, admin-afkrydsning)
  og fire laesere … En soesterkolonne faar praecis samme skrivere og
  laesere med samme kode — den atomiske gate (UPDATE ... WHERE <ret> IS
  NULL, 409 ved nul raekker), den guardede rollback paa samme ts, og
  admin-afkrydsningen der bevarer tidspunktet.» `intro_session_used_at`
  RØRES IKKE — navnet bliver. Kolonnekommentaren i prod siger det samme:
  «Saettes af create-free-intro-booking (advisor=jonas) eller
  admin-markering; nulstilles ved host-aflysning i calendly-webhook.»
- **FLADEN — én dom for begge rettigheder.** Jonas 13/9, ordret:
  «introsession med Jonas virker som et link der kun kan bookes én gang.
  Derefter skal boksen med Jonas skifte til den betalte. Mortens boks kan
  ligeledes bookes én gang, og derefter skal den forsvinde som den gør i
  dag». Det er præcis det der er bygget: Morten-kortet forsvinder når
  retten er brugt (som før); Jonas-kortet findes ALTID og skifter fra
  inkluderet til købt — `afgoerBookSession` i `bookSessionTilstand.ts`
  giver `JonasKort = { kort: "inkluderet"; tilstand: "book" | "loading"
  | "link-ready" } | { kort: "koebt" }`, dømt af samme
  `InkluderetTilstand` som Mortens kort (`MortenTilstand` er nu et alias).
  **«link-ready» hører til det INKLUDEREDE kort**, ikke det købte: den
  inkluderede vej (`create-free-intro-booking`) sender ingen mail, så
  linket findes kun på skærmen og må ikke forsvinde før tiden er valgt
  — kortet står som inkluderet med linket, indtil `calendly-webhook`
  skriver `booked`. På virksomhedssiden er der TRE spor dømt ét sted
  (`afgoerSessionSpor` i `betaltSession.ts`): «Session med Morten ·
  inkluderet» (advisor morten, amount 0), «Session med Jonas · inkluderet»
  (advisor jonas, amount 0 — fandtes ikke før 13/9) og «Session med Jonas
  · købt» (advisor jonas, amount > 0, én linje pr. købt række). Før
  #844 ville en inkluderet Jonas-række være faldet mellem to stole:
  amount 0 gik til det gratis spor, og kun advisor morten blev taget som
  den inkluderede linje. `EditCompanyDialog` har to afkrydsninger —
  «Session med Morten · inkluderet — brugt» og «Session med Jonas ·
  inkluderet — brugt» — samme mønster: afkrydsning ↔ timestamp, hentet
  tidspunkt bevares ved gem. `jonas_session_used_at` er endnu ikke i
  `types.ts` (Lovable regenererer den) — derfor den utypede klient to
  steder, som kommentarerne siger.
- **LINKET BÆRER RÆKKENS ID FRA START.** Det er det første spor der er
  bygget EFTER at Calendly-kæden blev lukket (§19): `create-free-intro-booking`
  tager body `{ advisor }` (default `morten`), bruger den atomiske gate
  `UPDATE companies … WHERE <ret> IS NULL` på den kolonne der hører til
  rådgiveren, og lægger rækkens id i linket som Mortens vej altid har
  gjort. Abonnementet fra 22:16 (§19) dækker hele Jonas' organisation, så
  de inkluderede events kommer tilbage ad samme vej som de købte. I
  `calendly-webhook` gates genåbningen ved host-aflysning nu på rækkens
  advisor OG `amount_dkk` (`genaabnerGratis`, `_shared/calendlyWebhookDom.ts`,
  19 tests): (host, morten, 0) → `intro_session_used_at` nulstilles;
  (host, jonas, 0) → `jonas_session_used_at` nulstilles; en KØBT
  Jonas-række genåbner aldrig noget. `SECURITY_BASELINE.md` (Bucket C)
  opdateret i samme PR.
- **SECRET `JONAS_CALENDLY_EVENT_SLUG`** sat i Lovable 13/9 med værdien
  «intro-snak» — Calendly-eventet «Onboarding», 30 min,
  `https://calendly.com/topix-jonas/intro-snak`. Eventets NAVN i Calendly
  er stadig «Onboarding»; kortet siger ikke det ord (se rammen nedenfor).
- **UDRULNING OG BEVISER, i rækkefølge.** *(1)* Merge 20:42:15 UTC.
  *(2)* Migrationen kørt 22:42 dansk og verificeret (ovenfor). *(3)*
  **Fire functions udrullet 13/9 kl. 20:45 UTC (22:45 dansk)** —
  `create-free-intro-booking`, `calendly-webhook`, `create-stripe-checkout`,
  `stripe-webhook`. Lovable ordret: alle fire live, tre med HTTP 401,
  `stripe-webhook` 400. *(4)* **BEVIST PÅ SKÆRM kl. 22:48:25:** to
  symmetriske kort på `/book-session`, begge «30 minutter · Online ·
  Fleksibelt», begge «Inkluderet i dit medlemskab · én session per
  virksomhed». Frontend-builden er dermed udgivet. **Chattens gæt om «en
  time» var forkert** — A havde 30 minutter rigtigt uden at blive spurgt;
  begge inkluderede sessioner er 30 minutter (Jonas 13/9).
- **HVAD SESSIONERNE ER — Jonas 13/9, ordret. Rammen teksterne skal
  holde sig inden for.** Om Mortens: «Den der one-to-one med Morten … det
  er jo egentlig en one-to-one-session, som medlemmet selv kan vælge,
  hvad den skal bruges til. Det er ikke os, der sætter rammerne for den
  snak, de har med Morten. Det er dem selv.» Om sin egen: «Den med Jonas.
  Ja, det kan være en onboarding-session. Hvis de ikke føler, at de har
  behov for det, så må de gerne bruge den til noget andet. Det er jo ikke
  sådan, at den udløber.» Rammen: begge er 30 MINUTTER, ikke en time;
  medlemmet bestemmer selv indholdet; retten udløber ikke. Ordene
  «onboarding» og «strategi-session» er derfor for snævre til kortene —
  «onboarding» er et eksempel Jonas selv nedtoner, og «strategi-session»
  sætter rammen for en snak Jonas siger vi ikke sætter rammen for.
  Calendly-eventet må gerne hedde «Onboarding»; kortet må ikke.
- **ÅBENT — TEKSTERNE (vindue A, nu; ikke læst).** Det der stod på
  skærmen kl. 22:48:25, holder sig inden for rammen, men siger det
  dårligt: rådgiverlinjen («Session med Jonas · inkluderet») er en
  etiket, ikke en sætning; de to brødtekster er næsten identiske («Som
  medlem får du én session med Morten/Jonas inkluderet. Du bestemmer selv
  hvad den skal bruges til …»); og «én session per virksomhed» står som
  grå fodnote under «Inkluderet i dit medlemskab», skønt det er kortets
  vigtigste oplysning. A retter det i `BookSessionView.tsx` nu. Bogføres
  når det er merget.
- **ÅBENT — MANGE GAMLE VIRKSOMHEDER SKAL IKKE HAVE TILBUDDET (Jonas
  13/9).** Kolonnen er NULL for alle eksisterende virksomheder, så
  Jonas-kortet står som inkluderet hos alle — også dem der har været
  medlem i et år. `EditCompanyDialog` kan markere retten som brugt én
  virksomhed ad gangen (#844); skal mange lukkes på én gang, er én
  SQL-sætning i Lovables SQL editor hurtigere (`UPDATE public.companies
  SET jonas_session_used_at = now() WHERE …` — hvilke, er ikke afgjort;
  SELECT først). IKKE gjort. Ny række i DEL 3 og nyt kort.
- **UBEVIST I DRIFT:** at en rigtig inkluderet booking hos Jonas kommer
  tilbage som `booked` med tid — samme åbne bevis som §19, nu med to
  spor der kan levere det (inkluderet og købt).
- **Mangellisten 133 → 135:** to nye kort («En afholdt session
  efterlader intet spor», §21; «Gamle virksomheder skal ikke have
  tilbuddet om Jonas-sessionen»); to omskrevet (kort 76 «Jonas ser
  Mortens sessioner og omvendt …» fik det tredje spor og den nye ret;
  «Sletteliste: fire ting …» → «fem ting» med `advisor_session_notes`,
  §21). Ingen fjernet.
- **Uden for denne bogføring:** A's tekstrettelser (uncommitted).

**21. HVAD DER SKER EFTER EN SESSION: INTET — reconet 13/9 sen aften.
STOP-betingelse 1 blev udløst: `advisor_session_notes` er ikke det
navnet siger. En note efter en session har aldrig eksisteret i huset.**
Kilde: `~/Downloads/recon-efter-sessionen.md` (A's recon, kildelæsning
ved HEAD `cc60921f`; ingen kald mod Supabase, Calendly eller Stripe; KUN
fund). Reconens SQL (§4, seks forespørgsler mod de to virksomheder
Rallysupport og ANLA GLAS) er IKKE kørt.

- **STOP-BETINGELSE 1 — tabellen er en død AI-cache, ikke et notatfelt.**
  Migrationens egen kommentar, `20260326130754:2`, ordret: «Create
  advisor_session_notes table for caching AI-generated session prep
  notes». Kolonnerne er `generated_by`, `note_text`, `generated_at` — en
  GENERERET tekst FØR et møde, ikke en skrevet efter. Den levede under ét
  døgn i koden: `97bc4035` (26/3) oprettede den, `679cd80b` samme dag
  koblede `SessionPrepSection` i `AdvisorCompanyOverview.tsx` til
  `ai-financial-feedback` med `request_type "session_prep"` og INSERT'ede
  svaret, og `606571f7` SAMME DAG fjernede begge kald igen. Siden 26/3 har
  ingen linje i `src/` eller `supabase/functions/` læst eller skrevet den.
  I dag: præcis to forekomster, begge SLETTERE —
  `_shared/companyHardDelete.ts:176` og `slet-medlemsdata-cron/index.ts:337`.
  RLS: kun rådgivere SELECT/INSERT/DELETE, ingen UPDATE-policy, ingen
  medlems-policy. Tabellen er 12 dage ÆLDRE end `session_bookings` (26/3
  mod 7/4) og har ingen reference til den. Om der ligger rækker i prod
  fra 26/3: ikke målt (reconens SQL 4.1). **Den hører på slettelisten** —
  død kode med to slettere.
- **FRA EN SESSION KAN MAN KOMME TIL INTET (recon F1–F2).** Ingen tabel
  har en fremmednøgle mod `session_bookings`: nul `REFERENCES
  public.session_bookings`, nul `booking_id`/`session_booking_id` i
  `supabase/migrations/`, nul `referencedRelation: "session_bookings"` i
  `types.ts`. Rækkens relationer peger kun UD (`company_id`, `user_id`,
  Stripe, `calendly_event_uri`). Rækken har ingen fritekst-kolonne, intet
  «afholdt», intet «udeblev»: statussættet er `pending, paid,
  booking_sent, booked, cancelled, refunded`. «Afholdt» er en DOM (booked
  OG `slut_tid` passeret, `lib/introSession` og `lib/betaltSession`) —
  ingen skriver noget når tiden passerer, ingen hændelse udløses.
  `company_actions.source_type` tillader ikke en session-kilde;
  `messages.context_type` har ingen session-værdi ud over `session_prep`
  (forberedelse, og produktionen af den blev fjernet 31/8).
- **MEDLEMMET SER INTET (F9).** `/book-session` viser booket/aflyst/link
  for nyeste inkluderede række — «booket», ikke «afholdt», intet om
  indholdet; forsiden nævner «session» kun om live-sessions; chatten
  skjuler `session_prep` for medlemmet; menuen har «Chat, Book session»,
  ingen «Dine sessioner». Det eneste sted et rådgiver-skrevet udfald når
  medlemmet, er «Dine aftaler» via `foreslaa-opgave` fra CHATTEN — knyttet
  til virksomhed og samtale, ikke til en session (F5).
- **DESIGNET HAR ALDRIG TAGET STILLING (F6–F8).** «Referat» findes ét sted
  i hele `docs/` — om commits (`OVERLEVERING.md:1255`).
  «Opfølgning»/«efter sessionen» i sessions-betydning: nul træffere i
  `raadgiverfladen-design.md`, `chat-design.md`, `opgave-model-design.md`,
  `OVERLEVERING.md`. `opgave-model-design.md:13-15` («Intet i platformen
  registrerer i dag en aftale mellem rådgiver og medlem …») blev besvaret
  for CHATTEN med opgave-modellen 22/8; ordet «session» står ikke i det
  afsnit. Blok 3 «Emnerne I har talt om» gælder chattens beskeder.
  `raadgiver_opgaver`-migrationen udelukker sessioner endda EKSPLICIT
  (`20260908170000:13`, ordret: «Sessioner hører ikke til her») — den
  eneste sætning i huset der tager stilling, og den holder dem ude. Der er
  INGEN besluttet form der bare ikke er bygget.
- **HUSETS MØNSTER for «noget skete, her er hvad der kom ud af det» er
  RAPPORTEN (F11):** hændelsen er en række (`financial_reports`), udfaldet
  er `report_comments` FK'et til den (rådgiver ELLER medlem, ekko i
  chatten via `notifyChatMessage`), tilstanden er «Godkend rapport», og
  AI'ens udlægning (`financial_commentaries.facts_id`) bliver `is_stale`
  når tallene ændrer sig. Næstnærmest: opgaveforslaget fra chatten, hvor
  rækken og systembeskeden refererer hinanden (`context_meta.action_id`).
  Fælles: hændelsen HAR et id, og udfaldet peger på det. Sessionen har et
  id — intet peger på det.
- **KONKLUSION.** En note efter en session har aldrig eksisteret i huset —
  hverken som tabel, kolonne eller flade. Rallysupport har betalt 1000 kr.
  for to sessioner (23/6 og 30/6, afholdt 25/6 og 1/7), og platformen ved
  kun at de fandt sted. ANLA GLAS havde en inkluderet med Morten 1/7 —
  samme. **IKKE afgjort om der skal bygges noget**; reconen er grundlaget,
  ikke et forslag. Nyt kort: «En afholdt session efterlader intet spor».
- **Åbne spørgsmål fra reconen (ikke stoppende, ikke målt):** rækker i
  `advisor_session_notes` i prod (SQL 4.1); `conversations.follow_up_at`
  findes som kolonne (`types.ts:1459`), ingen kode læser eller skriver den
  — hvornår kom den, bærer prod værdier; hvor Jonas og Morten i dag
  skriver deres mødenoter uden for platformen — står ingen steder i
  repoet; `kpi_chart_comments` er en anden død tabel (F10: nul læsere, nul
  skrivere, kun sletteren `companyHardDelete.ts:167`) — ikke sat på
  slettelisten i denne runde, kun noteret her.

**22. WEBINARET 22/9 — TIDSRAMMEN DER ÆNDRER PRIORITERINGEN. Skrevet
13/9 sen aften; ingen kode.** Jonas 13/9, ordret: «Den 22. september,
altså om ni dage, afholder vi et webinar, og jeg regner med, at der
kommer ca. 350 tilmeldte. Vi ved fra tidligere data, at ca. 40% møder
op, og at de 40%, der møder op, regner vi med næsten 10% ansøger. Så vi
kan måske forvente et sted mellem 10 og 15 ansøgere, hvis alt går godt.»
Og: «hvis alt går vel, så har vi inden for de næste fjorten dage minimum
fem nye ansøgere eller medlemmer på vores platform, og dem skal vi tage
godt imod. Vi skal selvfølgelig have en onboarding, der spiller.»
- **Regnestykket, skrevet ud** (Jonas' tal, ikke målt her): 350 tilmeldte
  × 40 % = 140 fremmødte; 140 × «næsten 10 %» ≈ 10–15 ansøgere; «minimum
  fem» nye ansøgere eller medlemmer inden for fjorten dage fra 22/9,
  dvs. senest omkring 6/10.
- **Hvad det ændrer:** kortene sorteres efter hvad en NY ansøger møder de
  første fjorten dage — ansøgningen (i dag Monday), afklaringssamtalen,
  aftalegrundlaget, betalingslinket, signup, ankomsten, tjeklisten,
  første upload, første rapport, første session — ikke efter hvad der
  står øverst på listen. A reconer det nu
  (`~/Downloads/recon-de-nye-medlemmer.md` — filen fandtes ikke ved
  denne bogføring; ikke læst).
- **RETTELSE af chattens vurdering — SoMe-deling.** Chatten havde
  antaget at et medlem først deler efter oplevet værdi (uge 2–4) og
  placerede delings-kortet lavt i de fjorten dage. Jonas 13/9, ordret:
  «i og med at Morten er et kendt navn, så er der mange, der vil have
  lyst til at skrive på deres LinkedIn, at de har fået Morten som
  rådgiver i deres virksomhed, bare ved at blive medlem. Det er jo ikke
  alle, der kan blive medlem. Man skal udvælges, man skal sende en
  ansøgning, og man skal godkendes på en afklaringssamtale. Så det er
  faktisk en stor ting for mange at få lov til at blive medlem.»
  Nyheden er OPTAGELSEN, og den er stærkest i samme uge. Delings-kortet
  («medlem af The Boardroom», V1) hører derfor til i det en ny ansøger
  møder de første fjorten dage, ikke bagefter. Kortet i mangellisten
  bærer rettelsen.
- **Sammenhæng med det der allerede er datosat:** 22/9 er også PHILBERTs
  varsel 2 (fornyelseskæden) og «første rigtige periode på /settings»
  (DEL 3). Indgangens kæde har aldrig haft en rigtig virksomhed (nul
  rækker i `company_betalingslink`, målt 7/9) — de første ansøgere fra
  webinaret bliver beviset for hele kæden fra «Godkendt» til adgang.

**23. NYT STORT SPOR — ANSØGNINGSPROCESSEN IND PÅ PLATFORMEN. Skrevet
13/9 sen aften i Jonas' egne ord; ingen kode. BESLUTTET: ikke før
webinaret.** Jonas 13/9 sen aften, ordret: «Jeg kunne godt tænke mig, at
noget af det næste, man får kigget ind i også, det er, at hele
ansøgningsprocessen, den bliver bygget op i vores egen platform i stedet
for i Monday. Det ville jo give nogle helt andre muligheder at lave en
rigtig lækker ansøgningsformular, som er visuelt overskuelig og lækker
at gå igennem. Og så har vi ligesom al viden om virksomhederne allerede
fra start.»
- **Flowet, som Jonas beskriver det:**
  - Nogle ansøgere skal tilbydes en AFKLARINGSSAMTALE med Jonas (i dag et
    Calendly-link fra Monday).
  - Nogle skal AFVISES.
  - Nogle skal FØLGES OP PÅ om X måneder.
  - «hvis vi for eksempel afviser nogen på en branche eller hvad det
    måtte være eller en niche, jamen så skal vi selvfølgelig kunne åbne
    op for dem eller kontakte dem igen når der så bliver en plads ledig».
  - Efter afklaringssamtalen underskrives et aftalegrundlag/en kontrakt.
  - Når den er underskrevet, sættes i dag status «godkendt» i Monday, og
    platformen opretter virksomheden på den godkendelse. De får et
    betalingslink, og når det er betalt, starter medlemskabet.
  - PÅMINDELSER på booking-linket: «Hvis ikke de har booket inden for to
    dage, så får de en påmindelse. Hvis ikke de har booket inden for fem
    dage, så får de en påmindelse. Hvis ikke de har booket inden for ti
    dage, så får de en sidste påmindelse.» — «alle de her flows skal der
    selvfølgelig være styr på, så vi ikke taber ansøgere i det.»
  - TRACKING: «det er jo leads for os i forhold til vores annoncering på
    Meta og så videre. Så hele tracking delen og datadelen skal der være
    sindssygt meget styr på.»
  - «Det kræver jo, at der er styr på tracking og sådan nogle ting også»
    og «Det kræver en grundig overvejelse. Det kræver at have styr på,
    hvilke mails der skal sendes hvornår.»
- **Hvad der ALLEREDE findes af delene — chattens læsning 13/9, IKKE en
  måling:** Calendly-kæden er lukket siden 13/9 kl. 22:16 dansk (§19:
  webhook-abonnement på Jonas' organisation, `state: active`; en rigtig
  booking er ubevist). `import-application` opretter virksomheder
  (`opretEllerGenbrugVirksomhed` i `_shared/virksomhedsOprettelse.ts`);
  `monday-webhook` gør det samme på «Godkendt» og sætter prisniveau,
  betalingstoken og dag 0-mail. `company_betalingslink` bærer indgangen
  med 30-dages frist fra underskriften (`20260902140000`, «Fristen er
  kontraktens»). `indgangs-paamindelser-cron` (0 10 \* \* \*) sender
  påmindelserne på BETALINGEN (dag 14, dag 25, dag 31-faktura).
  `intro-reminder-cron` er et eksempel på en påmindelseskæde der allerede
  virker (`onboardingRytme.ts`). Det der MANGLER er selve ansøgningen og
  alt før godkendelsen: formularen, ansøger-databasen med tilstand
  (afklaringssamtale / afvist / følg op om X måneder / genåbnet),
  bookinglinkets påmindelser dag 2, 5 og 10, aftalegrundlaget, og
  lead-tracking mod Meta.
- **BESLUTTET 13/9: sporet bygges IKKE før webinaret 22/9 — det holder
  til efter.** Det kræver en recon af hvad Monday faktisk gør i dag
  (boardet Ansøgninger: kolonner, statusser, automatiseringer,
  Calendly-linket, mails og deres timing), før sporet kan beskrives.
  Mangellistens kort «Ansøgningsflowet skal flyttes til platformen»
  (Indgangen) er pladsholderen og peger hertil; sporet er for stort til
  et kort. Mondays flow er gennemtænkt og skal læres af, ikke kasseres
  (kortets egen sætning, står).
- **Hører sammen med:** niche-eksklusiviteten («Du møder aldrig din
  konkurrent» — «konkurrentfelt» findes ikke i data; genåbning «når en
  plads bliver ledig» forudsætter at pladsen/nichen er et felt),
  affiliate («henvist af» på ansøgningen), og kortet om ansøgningen
  sammenfattet med AI (`import-application`s enrichment).

**24. KORT 29 («Fra budget» som målkilde på Nøgletal) ER RECONNET — IKKE
KLAR TIL AT BYGGES. `~/Downloads/recon-kort29.md`, 13/9 sen aften; HEAD
`cecf1f61` ved målingen; ingen kode.**
- **Præmissen holder:** «Fra budget» er ikke bygget (0 træf som UI-tekst
  i `src/`); det gamle `KPIs.tsx` (slettet i `bf9e4836`) brugte
  kalenderårets sum/12 for omsætning og EBITDA; kort 40 er indfriet
  (#832), så rangordenen er «budget > aftalt > intet» — `MaalKilde` er
  stadig `"aftalt" | "standard"`, men «standard» produceres ikke
  (`kpiMaal.ts:24-31`). Budgettet ER månedligt (`period =
  "YYYY-base-{0..11}"`, `budgetEngine.ts:21`), så ingen fordelingsregel
  er nødvendig, og `budgetNoegleFor("2026-07") → "2026-base-6"` findes
  og er testet (`budgetSignalInput.ts:34-41`). Nøgletal viser senestes
  tal uden periode-etiket (`NoegletalView.tsx:647-668`) — holder.
- **Spørgsmål 1 — ENHEDEN (samme fælde som kort 76: en recon måler det
  den bliver bedt om).** Prod-målingen 11/9 («loenninger;6 virksomheder
  | 72 rækker») talte nøglen `loenninger`. Men koden kobler budget til
  rapportfelt PR. GRUPPE, ikke pr. nøgle (`GROUP_TO_REPORT_FIELD`,
  `budgetEngine.ts:296-310`; spor3-design §2 B1 — nøgle-opslag blev
  prøvet og forkastet 24/8: «27 af 44 skabelon-keys manglede og alle
  importerede linjer stod ukoblede»). Skabelonen `saas_b2b` har INGEN
  nøgle `loenninger` — den har `loenninger_dev`, `loenninger_salg`,
  `loenninger_admin` (`budgetTemplates.ts:145-147`); `service_b2b` har
  også `uddannelse` i personale; importerede budgetter bærer medlemmets
  egne nøgler + en `__group__`-markør (`importSkrivning.ts:416-440`). Et
  nøgle-opslag overser dem alle. Omsætning holder, fordi alle otte
  skabeloner har præcis én indtægtsnøgle `omsaetning` — det er derfor
  forsidens og virksomhedssidens opslag virker. Gruppe-summen pr. måned
  findes kun inde i `decodeBudgetRows` + `HbBudgetBva.tsx:84-98`; der er
  INGEN ren funktion «(rækker, periode, rapportfelt) → budgettal».
- **Spørgsmål 2 — FORMLEN.** Der findes INGEN afvigelsesfunktion på
  KPI-niveau, men TRE forskellige domme i huset: budgetfladens
  `deriveBudgetTone` (`budgetTone.ts:24-31`: 10 %, fortegnsbevidst,
  favorable/near/off, «attention, aldrig alert»), forsidens
  `afgoerVirksomhedsSignaler` (`virksomhedsSignaler.ts:331-344`: 10 %,
  kun omsætning, friskhedsgatet, alvor 50/40) og Nøgletals egen
  `deriveKpiTone` (`kpiTone.ts:41-60`: målopfyldelse i % af mål, 0–150).
  Beslutningen 11/9 siger «afvigelsen på Nøgletal med forsidens motor» —
  som er omsætning-only og friskhedsgatet. Hvilken formel der skal gælde
  for to KPI'er på Nøgletal, står ingen steder.
- **Bygges IKKE før de to er afgjort.** Og uden prod kan det ikke
  afgøres om kortet er værd at bygge: 11/9-tallet siger hvem der HAR
  budget, ikke hvor mange der også har en MÅLT måned for samme periode
  (data-basis-kontrakten: estimater tæller ikke). Reconens §6 har SQL
  (6a enheden pr. rapportfelt, 6b/6c målte måneder mod budget, 6d de 233
  «anden form»-rækker og dubletter). De to prod-filer fra 11/9
  (`recon-b3-tallene.md`, `query-results-export-2026-09-11_11-43-37.csv`)
  findes ikke længere i Downloads; tallene står ordret i denne fils DEL 2
  «11. september, eftermiddag».
- **Tre bifund, nyt kort «Budgettets tre skjulte fejl» (Dine tal):**
  (1) `budget_targets` har UNIQUE `(company_id, user_id, category,
  period)` — to brugere i samme virksomhed kan have hver sin række for
  samme måned; `confirmBudgetFromAccounts` sletter kun pr. `user_id` +
  `company_id` (`budgetEngine.ts:994-1010`); `.find()` tager den første,
  `decodeBudgetRows` den sidste. (2) `get_my_group_budget_summary`
  (`20260316113038:106`) regner pr. gruppe med månedsindeks 1..12 mod
  klientens 0..11 og kaldes ingen steder. (3) `run-company-agent`s
  `get_budget_vs_actual` (`index.ts:505-537`) matcher engelske
  metric-navne mod danske kategorier og summerer alle år og scenarier —
  svarer i praksis tomt. Dertil demo-seed med `-base-1..12`
  (`20260316115536:50-59`); om rækkerne findes i prod: ikke målt.

**25. KORT 82 — PLATFORMCONFIGS TRE DØDE DELE ER SLETTET, I KODE OG I PROD.
PR #847 «feat: platformconfigs tre doede dele slettes (kort 82)», merget
13/9 kl. 21:24:31 UTC (`gh pr view 847 --json mergedAt,mergeCommit`, ordret:
«"mergedAt":"2026-09-13T21:24:31Z"», «"oid":"e99019c5656d957b99b29a336c9a97f63932bc06"»
— e99019c5); migrationen `20260913231500_platformconfig_doede_raekker.sql`
kørt i Lovable → SQL editor 13/9 kl. 23:25 dansk. Bogført 14/9 morgen.**
- **Hvad der blev slettet i koden** (migrationens eget hoved, ordret):
  «ingen monteret flade læste performance_score, gamification eller
  meetings. De eneste læsere var PerformanceScore.tsx og
  CommunityProgress.tsx (importeret ingen steder) og formularerne i
  ConfigView — alle slettet i koden i samme PR. useAppConfig ignorerer
  ukendte rækker, så sletningen er også harmløs for en frontend-build der
  endnu ikke er opdateret (defaults fylder ud).» `APP_BRANDING` og
  rækken `branding` beholdes til det gamle design er væk (AppLayout,
  AppSidebar).
- **Prod, 13/9 kl. 23:25:** `DELETE FROM public.app_config WHERE config_key
  IN ('performance_score', 'gamification', 'meetings')` → **tre rækker
  slettet, fem tilbage:** `branding`, `extraction_v2_rollout`,
  `notification_v2_rollout`, `session_timeout_minutes`,
  `velkomstvideo_guid` — præcis migrationens «Forventet EFTER».
- **FØR-værdierne, ordret fra migrationsfilen** (målt 11/9 kl. 11:43,
  `query-results-export-2026-09-11_11-43-37.csv`, sektion
  `c_82_app_config`), så de kan genskabes hvis nogen savner dem:
  - `meetings` `{"next_meeting_date": "2026-04-30"}` — opdateret
    2026-03-27T07:05:35.982904+00:00; ikke seedet af nogen migration;
    gemt fra ConfigView, datoen er passeret.
  - `performance_score` `{"weights": [0.3, 0.25, 0.25, 0.2],
    "liquidityMonths": 6, "growthMultiplier": 2, "marginMultiplier": 2,
    "profitMultiplier": 3, "defaultSalaryFallback": 50000}` — opdateret
    2026-02-24T09:55:51.972469+00:00; seed-værdien fra 20260224095552,
    aldrig ændret.
  - `gamification` `{"levels": [Starter 0 🌱, Aktiv 25 ⚡, Dedikeret 75 🔥,
    Stjerneelev 150 ⭐, Mester 300 🏆], "pointsPerReport": 10,
    "pointsPerMilestone": 25}` — opdateret 2026-02-24T09:55:51.972469+00:00;
    seed-værdien fra 20260224095552, aldrig ændret.
- **Mangellisten:** kortet «Platformconfig: slet de tre dele ingen kode
  læser» stod STADIG i listen 14/9 morgen (DEL 11 i listens filhoved
  sagde det, ordret: «står stadig og er IKKE bogført i denne runde»);
  forudsætningen for denne bogføring («allerede fjernet») holdt ikke.
  Fjernet 14/9 som løst — kun her og i listens filhoved.
- **Velkomstvideo-fælden består:** `velkomstvideo_guid` er én af de fem
  tilbageværende og står tom (`'""'::jsonb`, 2/9) — se §26 måling 4.

**26. PLANEN FREM MOD WEBINARET 22/9 — SKREVET 14/9 MORGEN; INGEN KODE.
Tre recons: A's `~/Downloads/recon-de-nye-medlemmer.md` (medlemmets vej
trin 1–10, atten kort prioriteret, elleve fund uden kort, ni målinger),
`~/Downloads/recon-delingen.md` (delingens pris i vores stak) og
`~/Downloads/maalinger-foer-webinaret.md` (de ni målinger med FIND FØRST,
tærskler og én SQL). HEAD `b6585db2` = #848.**
- **Rækkefølgen i morgen:** (1) målingerne → (2) gennemkørslen → (3) de
  tre rettelser A/B/C → (4) delingen (§27). Målingerne først, fordi hver
  af de ni kan ødelægge det første møde uden at kunne ses i repoet;
  gennemkørslen dernæst, fordi den lukker syv kort og de tre «UBEVIST»
  på én gang; rettelserne er små og bliver konkrete af gennemkørslen;
  delingen er den eneste ting der virker udad, og dens kritiske sti er
  designet, som ikke er kode.
- **De ni målinger — hvor, og hvad det rigtige svar er** (detaljen med
  fil:linje for hver og SQL'en står i `maalinger-foer-webinaret.md`):
  1. `INVITATION_AFSENDER_USER_ID` — læses ét sted,
     `_shared/sikrIndgangsInvitation.ts:49`; mangler den: `sprunget_over`,
     ingen invitation, kun `console.error`, og webhooken læser ikke
     udfaldet (`stripe-webhook:1224/1231/1290`). Rigtigt: navnet i
     Lovable → Cloud → Secrets, værdien = Mortens uuid
     (`indgangen-design.md:559`; SQL'en viser rådgiverkontiene), og
     SQL-linjen «betalt uden login» tom. Forkert: tilføj secret'en;
     invitér manuelt i /members indtil da.
  2. `RAADGIVER_MAIL_TIL` — `_shared/indgangsBetalingsmail.ts:104`;
     mangler den: 200 `ingen_raadgiver_mail`, virksomheden står som
     `afventer_pris` uden at nogen hører det. Rigtigt: navnet i listen,
     og efter gennemkørslen én `email_send_log`-række
     `indgang-raadgiver-mangler-pris` med modtageren = værdien.
  3. `JONAS_CALENDLY_EVENT_SLUG` — `create-free-intro-booking/index.ts:45,
     :206-211`; mangler den: 503 + rollback («ikke konfigureret endnu»);
     findes slug'en ikke hos Calendly: 502. Rigtigt: navnet i listen,
     `https://calendly.com/topix-jonas/intro-snak` viser eventet (30 min),
     og én testbooking giver en `session_bookings`-række `advisor='jonas'`,
     `amount_dkk=0`, `booking_sent` → `booked`.
  4. `velkomstvideo_guid` — `get-video-embed:76-104`,
     `useOnboardingTjekliste.ts:109`, `onboarding-rytme:172`; tom: 404
     `ingen_velkomstvideo`, tjeklisten SEKS punkter (rettet 14/9: pillen
     siger «0 af 6»; punktet udgår rent — «fem» var forkert), ingen overlejring;
     ikke et GUID: 500. Rigtigt: et Bunny-GUID sat på /admin/config (eller
     BEVIDST tom med kort 4's tekst-overlejring bygget). Læses med
     `config_value #>> '{}'` — rå tekst er `""` på to tegn.
  5. Cron — tre JOB, ikke tre functions: `onboarding-rytme` «0 8 \* \* \*»
     (prod 11/9; filen 20260909180000 siger «15 9» og er forkert),
     `intro-session-reminder` «0 9 \* \* \*» → `intro-reminder-cron`,
     `indgangs-paamindelser` «0 10 \* \* \*» → `indgangs-paamindelser-cron`.
     Rigtigt: findes, aktive, præcis de tider, kommandoen nævner
     funktionen OG `"dry_run": false` (uden det tørkører jobbet hver dag og
     sender ALDRIG), seneste kørsel `succeeded` inden for et døgn, og
     `email_queue_service_role_key` i vault (kald_edge kaster uden). SQL'en
     dømmer alt det pr. linje. Afsendelsesgrenen er stadig ubevist
     (tørkørslen 11/9: `ville_sende: 0`).
  6. `email_templates` «Invitation til virksomhed» —
     `send-invitation-email/index.ts:162-171` bruger rækken når `enabled`;
     ellers `FALLBACK_HTML` (`:12-58`) med de SAMME fire usandheder og
     «The Boardroom» i stedet for firmanavnet; to rækker med samme navn
     giver også fallback (`maybeSingle`). Rigtigt i morgen (før
     rettelsen): præcis 1 række, enabled, C1–C4 «USANDHED i DB» ×4 —
     målingen bekræfter at Lovable ikke har ændret den siden
     20260418124333, og viser `subject` og afsender, som ikke står i
     repoet. Efter rettelsen: «OK: rettet» ×4.
  7. Monday — board-id'et er en KODEKONSTANT, `_shared/mondayAnsoegning.ts:16`
     = 1899777797; et andet board svarer 200 `forkert_board` og intet
     oprettes (`monday-webhook:230-233`). Secret'en `MONDAY_SIGNING_SECRET`
     (`:188-204`): mangler → 500, forkert → 401. Rigtigt: boardets URL
     ender på `/boards/1899777797`; automationen peger på
     `…/functions/v1/monday-webhook`; et statusskift til andet end
     «Godkendt» på en testansøgning giver «signature verified» +
     «ignoreret» i loggen (harmløs signaturtest); `company_betalingslink`
     får en række med `monday_item_id` efter gennemkørslen. Andet board =
     kodeændring, ikke en indstilling — brug det gamle board 22/9.
  8. Stripe — Developers → Webhooks → `we_1UAtaW3CvBmCx5PtL736lAJN`:
     Enabled, præcis seks events (`checkout.session.completed`,
     `customer.subscription.created/updated/deleted`, `invoice.paid`,
     `invoice.payment_failed`; ALDRIG `invoice.created`), 0 fejlede
     leveringer; og notifikationen om fejlende endpoints slået til for
     jonas@topix.dk (kort 14 (b), nul kode).
  9. theboardroom.dk — view-source: `og:title/og:description/og:image`;
     LinkedIns Post Inspector; mobilvisning 375 px. Rigtigt: beskrivelsen
     siger hvad produktet ER (netværk, Morten og Jonas, man ansøger), IKKE
     app'ens «Rapportér, budgettér …» (fund K); billedet loader 1200×630;
     ansøgningsknappen står over folden og åbner formularen. Sitet er ikke
     i repoet — forkert rettes dér; indtil da sendes delingspakken med
     billedet vedhæftet, ikke som link-preview.
  - **Målt FØRST, tre fund der ikke står i reconens resumé:** secrets kan
    ikke læses (DEL 4, 3/9) — derfor er tre af de ni «UBEVIST» indtil
    gennemkørslen; cron-jobnavne ≠ funktionsnavne (det var derfor en
    tidligere recon troede intro-påmindelsen aldrig havde kørt,
    20260901112000:16-19); og migrationsfilen 20260909180000 er IKKE
    referencen for onboarding-rytmens tidsplan — prod er.
- **Fund A–K uden kort → syv kort i mangellisten** (Indgangen, øverst, de
  tre første med klasse `blocked`, `data-status="fejl"` og tag «22/9 · I
  STYKKER»): **A** `betalt=1` læses aldrig (`Betal.tsx:131`; RETTET #849,
  i HEAD — «14. september» §17; kortet lukket 14/9 med forbehold: ikke
  bevist udrullet);
  `opret-indgangs-checkout:111-114` kalder det selv «et hint»; efter
  betalingen står betalingsskærmen igen med tre aktive knapper, klik giver
  403-toast eller en NY Checkout-session — rammer HVER betalende ansøger;
  + **E**, kontakt `jonas@topix.dk` på /betal mod dag 0-mailen signeret
  Morten). **B** invitationens udfald kastes væk
  (`sikrIndgangsInvitation.ts:49-55, :129-135`; `stripe-webhook:1224/1231/1290`
  læser ikke returværdien; rettelsen er `skrivRaadgiverBesked`,
  `_shared/raadgiverBesked.ts:59`; + **D**, ingen rådgiverbesked ved ny
  indgangsbetaling). **C** invitationsmailens fire usandheder — i
  `email_templates`, ikke kun i koden (måling 6). **K** app-linkets
  preview «Alt-i-én platform til økonomistyring for vækstvirksomheder»
  (`index.html:8, :20-21, :26-27`, `manifest.json:4`) — det et nyt medlems
  netværk ser hvis hun deler app-linket; fejl, Indgangen. **G** dag
  10-mailen nævner kun Morten (`onboardingRytme.ts`, to spejle). **F/I/J**
  tre instrukser der ikke er kode: «send juni–august først» (indeværende
  måneds rapport er limbo uden knapper i op til en uge, og mail C
  undertrykkes fordi `harBegyndt` = uploads > 0), importvejen bruges ikke
  til webinar-ansøgerne (springer betalingen over), e-mailkolonnen
  udfyldes FØR «Godkendt» (`monday-webhook:278-282` svarer 200
  `ingen_email`). **H** præsentations-fanout
  (`notify-community-opslag:108` `important` + mail til alle for hvert
  opslag; beslutning: `info` for `praesentation` i de to uger, eller
  accepter det) — Fællesskabet.
- **De atten kort i prioriteret rækkefølge** (reconens afsnit 6; titel ·
  størrelse · trin i medlemmets vej): 1 Indgangens kæde har aldrig haft en
  virksomhed (bevis: prøv den selv · 1–5) · 2 Ankomstens løse ender (Lille
  · 4–5) · 3 Delingen (Lille V1 · 3/6) · 4 Velkomstvideoen (Lille · 6) · 5
  Indgangens huller — advarsel og secret (Lille · 1) · 6 Onboardingens
  rytme (Lille · 7) · 7 Tom-tilstande (Lille · 6–8) · 8 Når en upload
  strander (Lille · 8) · 9 Profilen forfra (Mellem · 6) · 10 Podcasten ud
  (Lille · 6) · 11 Jonas ser Mortens sessioner — bevis-delen (Lille · 9) ·
  12 PHILBERT: to filer (Mellem · 8) · 13 Uden slutdato ser Community
  (Lille · 6) · 14 Edge functions har ingen fejllæser — vej (b) (Mellem ·
  3–4) · 15 Beskrivelser på de 13 kurser (indhold · 6) · 16 Auth-mails i
  egen log (Lille · 5) · 17 Efter dag 31 (beslutning · 3) · 18
  Community-idéerne: like fra feedet (Lille · 10). Rækkefølgen kan ses i
  mangellisten: hvert kort bærer tag «22/9 · nr. N af 18» (rust, klasse
  `tag webinar`) og id `w1`..`w18`; «Rækkefølgen» har en tier øverst med de
  atten som nummereret liste med links. Valgt sådan fordi et tag er
  synligt på kortet, søgbart («22/9» finder alle), rører ikke rangeringens
  tal, og lader kortene blive i deres emne; en ny sektion ville flytte dem,
  et data-attribut ville være usynligt.
- **Mangellisten 14/9:** 135 → 141 kort (fjernet 1: kort 82 som løst;
  tilføjet 7; delingen omskrevet og flyttet Idéer → Indgangen, idé →
  mangler) — fejl 22 · mangler 62 · beslutninger 26 · idéer 31.
- **Ikke gjort, med vilje:** ingen kode; ingen måling kørt; kortet
  «Onboardingens rytme er bygget — cron-jobbet er ikke planlagt» beholder
  sin forældede titel (jobbet ER planlagt siden 11/9 — kortets tekst siger
  det; titlen rettes når kortet omskrives efter målingen).

**27. DELINGEN SOM KRAV — JONAS 13/9; BOGFØRT 14/9 MORGEN MED RECONENS
PRIS. Ingen kode.** Jonas 13/9, ordret: «et smart setup, hvor der er et
design med Morten og mig, hvor medlemmet kan uploade et billede af sig
selv eller deres logo, som genererer det færdige billede der er lækkert
visuelt til at slå op på LinkedIn. Vi kommer også med 3-4 udkast til
tekster de kan bruge. Og optimalt har vi ikke kun ét, men et par
forskellige kreativer, som de kan bruge. Det skal være opsigtsvækkende,
lækkert og nemt, så de netop får det gjort.» Og: «Det skal ikke være i en
velkomstbesked. Det skal være et forslag i deres onboarding, at de deler
det på LinkedIn. Og så skal de nemt kunne kopiere copy fra siden samt
generere kreativet fra samme sted.»
- **Hvad stakken har** (`~/Downloads/recon-delingen.md`, 14/9, målt i
  koden): `html2canvas` 1.4.1 er installeret og i brug
  (`src/lib/exportPdf.ts:20-29`, scale 2, `useCORS`); rå Canvas 2D bruges
  i `reportUploadEngine.ts:214-220`; download som fil er Blob +
  `<a download>` to steder (`NoegletalView.tsx:342-350`,
  `EventDetailView.tsx:36-46`). `HbDropzone` (13/9) giver kalderen
  `File`-objektet uden bucket (`HbDropzone.tsx:17-19`); husets
  preview-mønster er `URL.createObjectURL` (`CommunityComposer.tsx:903`).
  En ny side er 13 linjer + én rute (Konto-mønstret, `App.tsx:268`;
  `/konto` har intet menupunkt — etableret). Billedet kan laves og hentes
  helt i browseren: ingen edge function, ingen bucket, ingen migration.
- **Tjeklisten er en FAST liste på syv id'er** i en ren motor
  (`onboardingTjekliste.ts:54, :151-159`), låst af test
  (`__tests__/onboardingTjekliste.test.ts:49-54, :72-92, :194-215`). Et
  nyt punkt = motor + hook + test + stempelkolonne (migration i Lovable,
  som `velkomstvideo_set_at`, 20260902170000) + `HbAktiv`-værdi. «Gjort»
  er handling, ikke besøg (filhovedet `:10-14`) — det målbare er «hentede
  billedet» og/eller «kopierede en tekst».
- **BESLUTTET 13/9 (Jonas): de eksisterende medlemmer får IKKE tjeklisten
  åbnet igen — punktet gælder kun nye, med en datogrænse i dommen.**
  Uden grænsen gør motoren listen ufærdig for alle 27 (`nextStep.ts:132-136`
  slot 0, `HbMemberShell.tsx:96-99` menupunktet, pillen).
- **Fonte og portrætter:** Google Fonts via `@import` (Fraunces
  `hjemmebane.css:6`), ingen `document.fonts`-håndtering i repoet;
  Fraunces' `opsz`-akse i html2canvas 1.4.1 skal prøves én gang før
  designet låses (ren-canvas-vejen kræver `document.fonts.load`). Jonas'
  portræt `public/jonas-herlev.png` er **300×283 px — for lille** til stor
  visning (rækker til ~150 px i 2×); der skal et nyt foto i mindst ~800 px.
  Morten er 1035×830. `og-image.jpg` er 1200×630 og same-origin.
  **RETTET 14/9 («14. september» §27): påstanden gælder kun platformens
  fil — designarkivet har `jonas-hi.png` 1044×1044 og originalen
  `Jonas1-kopi.jpg` 2000×1334; intet nyt foto, to filer kopieres til
  `public/`.**
- **Kan IKKE bygges:** «Del direkte på LinkedIn» (LinkedIn-API med OAuth
  og app-godkendelse; intet i repoet; share-URL tager kun et link);
  admin-redigerbare tekster i databasen (ny tabel + policies + flade);
  gemte billeder/galleri (bucket + migration). Kravet er download +
  kopiér — det er ikke i vejen, men skal siges højt.
- **Åbne beslutninger — den kritiske sti er DESIGNET, ikke koden** (står
  som spørgsmål på kortet): antal kreativer til 22/9; format 1200×627
  eller 1080×1080 eller begge; hvad der står på billedet; om medlemmets
  navn skal med (og kunne rettes — `full_name` kan være et mail-præfiks);
  logo eller portræt eller begge, og hvad når kun det ene findes; om
  Morten og Jonas står på alle, og hvor store; hvem tegner kreativerne og
  hvornår. Dertil for koden: hvad tæller som «gjort», plads i rækkefølgen,
  kun fulde medlemmer, menupunkt eller ej, rute og navn.
- **Om reconens estimat («4–5 udviklingsdage»):** det er præcis den slags
  tal DEL 4-fælden «Chattens tidsestimater er for høje» handler om. Det
  der skal gøres: én side, to DOM-skabeloner + html2canvas, ét
  tjeklistepunkt med datogrænse, 3–4 tekster som ren skabelonfunktion, én
  prøve af Fraunces/CORS. Det der blokerer: designet af kreativerne, det
  nye Jonas-foto, og svarene ovenfor. Intet af det er kode.
- **Mangellisten:** kortet «Delings-/SoMe-miljø …» (Idéer, idé siden 11/9)
  er omskrevet til «Delingen på LinkedIn — et krav til 22/9 …» og flyttet
  til Indgangen som `mangler` med klasse `decision`; det bærer tag «22/9 ·
  nr. 3 af 18».

### 14. september — kæden havde ingen indgang (fund 1, #851 merget 07:43:29 UTC, driftsbevis indirekte); invitationsmailen var fallback'en (fund 2, #852 merget 08:01:50 UTC, bevist på skærm 10:07 og i drift 08:10:16); Jonas-sessionen lukket for 23 af 38 i hånden 13/9 (fund 3); importen skriver aldrig contact_person (fund 4); betaling uden om platformen har ingen flade (fund 5); cvrapi's kvote hænger på IP (fund 6, BESLUTTET: Virk); dagens medlem Nordic By Hand ApS — MIDDAG: onboardingmailene (#853, 09:23:16 UTC), synligheden af en fejlet CVR-berigelse (#855, 09:48:17, bevist på skærm 11:50–11:51), kontaktadressen i dag 0 og fornyelsens kvittering (#856, 09:56:59), 429 som rate_limited (#857, 10:00:35, udrullet 10:03, grenen ubevist); mailloftet målt (109 mails på et kvarter, fund 7); YKRG's CVR findes ikke (fund 8); afsendelsesgrenen bevist 09:00:10 (fund 9); Lisbeths første uge reconnet — EFTERMIDDAG: fund B i klokken (#859, 10:44:53 UTC, grenen ubevist), fund E på fladen (#860, 11:00:28, bevist 13:02), fund A bevist på skærm 12:47 og 13:02, velkomstvideoen i drift (GUID målt 12:49, skærm 13:01), gennemkørslen forberedt — OG GENNEMFØRT 11:26–11:38 UTC: første hele kæde siden marts, første række i company_betalingslink, fund A bevist i drift, måling 1 og 7 lukket, tjeklisten 0 af 7 ad Monday-vejen, dag 0-teksten ubevist (#856 udrullet 11:39)

Kilder: Monday (automationernes indstillinger, run history og banneren, læst af Jonas 14/9), `.lovable/plan.md`'s historik (git), prod (SQL editor: `company_betalingslink`, `email_templates`, `email_send_log.metadata`, `companies`), Lovables build-chat (udrulning; dens 401-udsagn var forkert, se §1), `curl` mod `monday-webhook`, cvrapi.dk fra Jonas' maskine og fra edge-runtimen, repoet ved `66b4a732`. Tider er UTC medmindre andet står. Det der IKKE er målt, står som «ikke målt».

**1. FUND 1 — INDGANGENS KÆDE HAR ALDRIG VIRKET: en kæde uden indgang. LØST i kode med #851.**

- **Header-kravet.** Mondays indbyggede «send a webhook»-opskrift sender INGEN Authorization-header. Mondays udviklerdokumentation: den signerede JWT kommer kun når webhooken oprettes via `create_webhook`-mutationen med en integrations-apps OAuth-token, signeret med appens signing secret fra Developer Center. `monday-webhook` krævede headeren (`index.ts:194-198` før #851) og afviste 401 før alt andet — hvert eneste board-kald.
- **Den forkerte vært.** De to Monday-automationer der kaldte `monday-webhook` (oprettet 21/3 2026 kl. 22:31) pegede på Supabase-projektet `hzlkypibayzkkumwohap` — IKKE platformens `loiavmastgeieqyiwyyr`. Ref'en har NUL træffere i arbejdstræet og NUL i hele git-historikken. `.lovable/plan.md` bar 25/2 2026 kl. 12:30:57 den RIGTIGE URL (`loiavmastgeieqyiwyyr/functions/v1/monday-webhook`); linjen blev fjernet igen 13:32:45 samme dag, og ni minutter senere (13:41:29) gik automation 157778880 i `store.webhooks.error.unauthorized`.
- **Konsekvens, målt:** `company_betalingslink` har nul rækker. `monday-webhook` er det ENESTE INSERT i den tabel i hele repoet. Hele indgangen — /betal, dag 0-mailen, de fire påmindelser, `indgangs-paamindelser`-cronen, dag 31-fakturaen, `opret-indgangs-checkout`, prisknapperne — hænger på en række kun Monday kan lave. Kortet «Indgangens kæde har aldrig haft en virksomhed» er omskrevet: det var ikke et manglende forsøg, det var en kæde uden indgang.
- **Den fremmede vært svarer** 200 `{"ok":true,"skipped":"no event"}` på en tom POST — en udgave UDEN signaturtjek. Vores svarer 400 `{"error":"No event in payload"}`. Hvad `hzlkypibayzkkumwohap` er, er IKKE afklaret. Automation 161201319 («når et emne oprettes») stod tændt og sendte dertil fra 21/3 til 14/9; run history viste fire kørsler (Success 13/9 15:29 og 07:15, Fail 8/9 06:52 og 4/9 17:57). Slået fra 14/9. Om modtageren gemte noget: ikke målt.
- **LØST — #851 «fix(monday-webhook): værn på delt hemmelighed i URL'en»** (`72d25525`, merget 14/9 kl. 07:43:29 UTC). Værn med to veje i `_shared/mondayVaern.ts`: JWT når Authorization er der (uændret; `MONDAY_SIGNING_SECRET`-tjekket flyttet ind i grenen, så board-kald ikke rammer 500), ellers `?noegle=` mod `MONDAY_WEBHOOK_SECRET` sammenlignet i konstant tid (`_shared/konstantTidLighed.ts` — husets første; forbeholdet står i filhovedet `:19-22`). Challenge-grenen urørt og uden værn, så Monday kan gemme URL'en. `verifyMondayJwt` flyttet til `_shared` men kaldes stadig ved navn i `index.ts` (`:181`), så `scripts/check-edge-function-auth.ts:133` stadig matcher — CI-værnet er IKKE løsnet.
- **Driftsbevis, i rækkefølge:** merget `72d25525` → udrullet 07:44 UTC → `curl` uden secret gav 500 «Server configuration error» (kun den nye kode kan svare det; Lovables build-chat rapporterede fejlagtigt 401) → `MONDAY_WEBHOOK_SECRET` oprettet → samme `curl` gav 401 → ny Monday-automation «Ny ny platform» (webhook-id 185108519, oprettet 14/9 ca. kl. 10, event `change_status_column_value`, kolonne `color_mkpt4hyt`, værdi `$any$`) oprettet med `?noegle=` → tændt → ét statusskift → AUTOMATIONEN BLEV STÅENDE TÆNDT. Monday slår selv fra ved 401: «Ny platform» (id 185102661, oprettet ca. kl. 09 UDEN nøgle) blev tændt, fik 401, og Monday slog den fra med den røde banner «The webhook endpoint requires authentication» (kl. 9:15) — så tændt tilstand ER beviset. (Rettet 14/9: diktaten byttede de to id'er om; Kilde: API-udtræk `webhooks(board_id: 1899777797)` 14/9.) **Bevismidlet er indirekte — Lovables log blev ikke læst.**
- **ÅBENT — rydningen af board 1899777797, FØRST når kæden er bevist på et rigtigt «Godkendt».** Kilde: API-udtræk `webhooks(board_id: 1899777797)` 14/9. **VÆK (fire):** 185102661 «Ny platform» — uden nøgle, slukket af Monday (401); 161201327 uden titel — peger på `hzlkypibayzkkumwohap`, slukket; 161201319 «når et emne oprettes» — peger på `hzlkypibayzkkumwohap`, slukket af Jonas 14/9 efter fire kørsler (Success 13/9 15:29 og 07:15, Fail 8/9 06:52 og 4/9 17:57); 157778880 uden titel — `state=error`, `store.webhooks.error.unauthorized` siden 25/2 2026 13:41:29. **BLIVER (tre):** 185108519 «Ny ny platform» — den der virker, `?noegle=`, tændt; 137371356 «Periodiseret omsætning» — status «I gang» → Make, urørt; 135778522 «RapportBOARD+Slack» — status «Medlem» → Make, urørt. Bekræftet mod udtrækket 14/9: syv webhooks på boardet — fire væk, tre bliver. Og `hzlkypibayzkkumwohap` (ovenfor).

**2. FUND 2 — INVITATIONSMAILEN: fallback'en var mailen, og valget var tavst. LØST med #852.**

- **Målt i prod:** `email_templates`-rækken «Invitation til virksomhed» har `enabled=false` (`updated_at` 2026-09-08 07:31:35, `updated_by` = Jonas' uuid). `send-invitation-email` faldt derfor tilbage til sin egen `FALLBACK_HTML` — DET var mailen nye medlemmer fik. Fire usandheder i den: «by Topix» (udgik 1/9), «Ignorer denne besked hvis du ikke forventer den» (modtageren har lige betalt), «du kan oprette dig med en hvilken som helst e-mail» (usandt: mailfeltet er readOnly når invitationen bærer en adresse, `Auth.tsx:111-115` og `:363-364` — på DB-niveau er tokenet alene nok, men det er ikke det mennesket møder), og et hardkodet «The Boardroom» hvor firmanavnet skulle stå (fallback'en havde slet ingen `{{company_name}}`).
- **Værre end teksten: valget var tavst.** `maybeSingle()` uden error-læsning gav fallback ved fire forskellige tilstande (ingen række, `enabled=false`, flere rækker, opslagsfejl), og `email_send_log` fik samme `template_name` på begge veje — derfor kunne ingen se det.
- **LØST — #852 «fix(send-invitation-email): invitationsmailen i husets form, og skabelonvalget logges»** (`66b4a732`, merget 14/9 kl. 08:01:50 UTC). Dommen ren og testet i `_shared/invitationsSkabelonvalg.ts`, fem udfald, logges altid med årsag, vej + årsag i `email_send_log.metadata`. `template_name` urørt (aftagere: `src/hooks/invitationer.ts:62`, `EmailLogView.tsx:77`). Mailen omskrevet i indgangsfamiliens form (`_shared/invitationsMail.ts`); linjen efter knappen nævner kontakt@theboardroom.dk (BESLUTTET af Jonas 14/9) frem for at love svar fra noreply. `company_name` escapes i HTML, aldrig i emnet; `signup_url` ingen af stederne — rammer bevidst også DB-skabelonen.
- **BEVIST PÅ SKÆRM 14/9 kl. 10:07** med en testinvitation: header uden «by Topix», footer uden «Ignorer denne besked», teksten siger at adressen står udfyldt, og virksomheden hed «Din økonomiafdeling Danmark ApS». Testinvitationen slettet.
- **FØRSTE DRIFTSBEVIS:** Lisbeths mail 14/9 kl. 08:10:16, `email_send_log.metadata` ordret: `{"skabelon_id": null, "company_name": "Nordic By Hand ApS", "skabelonvalg": "fallback", "fallback_aarsag": "enabled_false"}`.
- **NYT ÅBENT:** Lovables mail-lag lægger «Afmeld abonnement»/«Unsubscribe from these emails» på — på engelsk, under vores danske footer. En invitation er transaktionel. Hvad en afmelding rammer, er IKKE målt. Nyt kort.

**3. FUND 3 — JONAS-SESSIONEN er lukket for 23 af 38, i hånden 13/9 aften.**

- `companies.jonas_session_used_at` er sat på 23 af 38. Ikke en DEFAULT (målt: ingen af de to session-kolonner har en), ikke en migration, ikke Claude Code: 23 forskellige tidsstempler 13/9 mellem 20:50:13 og 20:54:51 UTC, ~11 sekunder imellem, i STRENG ALFABETISK rækkefølge (ANLA GLAS → YKRG). Et menneske ned ad en sorteret liste i `EditCompanyDialog`, to minutter efter #844's skærmbevis (22:48:25 dansk).
- Krydset mod Mortens kolonne: 9 begge (aldrig samme tidsstempel), 14 kun Jonas, 4 kun Morten, 11 ingen af dem. Alle 23 er `status=active`.
- DEL 3's række «ÅBENT — ikke gjort, hvilke er ikke afgjort» var FORKERT og er omskrevet. Nye virksomheder får NULL og ser sessionen som inkluderet.
- **ÅBENT:** 11 har begge rettigheder stående åbne.

**4. FUND 4 — IMPORTEN SKRIVER ALDRIG `contact_person`.**

- `byggVirksomhedsRaekke` (`_shared/virksomhedsraekke.ts:171-211`) har ikke feltet i rækken; værdien lander i `application_context.contact_name` (`:207`). Kolonnen har `DEFAULT ''` (`20260225104718:4`). Kendt siden 2/9: migrationskommentaren `20260902190000_lookup_invite_email_kontakt.sql:22-27` siger ordret at 35 af 39 stod med tom streng. Aldrig rettet. Kun `monday-webhook` skriver kolonnen (B5, `index.ts:312-323`). Rammer hver eneste import fra webinaret. Nyt kort.

**5. FUND 5 — BETALING UDEN OM PLATFORMEN HAR INGEN FLADE.**

- Fornyelsesmotoren læser IKKE `company_betalingslink`, men `companies.indgangspris_oere` og `companies.fornyelsespris_oere` (`_shared/fornyelsespris.ts:66-90`). Reglen er en konstant: `Math.floor(indgangspris_oere / 2)` (`:83`), og resultatet skal ramme et af tre prispunkter (`PRISPUNKTER_OERE` = 15.000/20.000/25.000 kr., `:28`), ellers `ukendt_prispunkt` (`:90`).
- INGEN flade i `src/` og ingen edge function ud over `stripe-webhook` skriver de to kolonner. Et medlem der betaler ved faktura kræver derfor SQL i hånden, ellers fejler varslet med `ingen_indgangspris` (`:78`), båndet vises ikke, og cronen tæller `sprunget_over.ingen_pris` (`fornyelsesvarsel-cron/index.ts:297`). Bastant Design står allerede sådan. Nyt kort.

**6. FUND 6 — CVRAPI'S KVOTE HÆNGER PÅ IP, IKKE PÅ OS — og den fejler tavst. BESLUTTET: Virk.**

- `hentCvrData` (`_shared/virksomhedsOprettelse.ts:64-102`) er den ENESTE CVR-kilde i repoet: anonymt kald mod cvrapi.dk, ingen nøgle, kun en User-Agent.
- **Målt 14/9:** import af Nordic By Hand kl. 08:10:15 gav «cvrapi svarede error=QUOTA_EXCEEDED». Berigelsen var IKKE kørt (bekræftet af Jonas); den har selv et værn (`MAKS_OPSLAG = 45`, 500 ms pause, tørkørsel som standard, står ikke i `cron.job`), og importen koster højst ét opslag pr. NY virksomhed (genbrugstjek på CVR ligger FØR opslaget). Frontenden slår ikke op.
- **BEVISET:** kl. 10:37 svarede cvrapi 200 med fulde data på CVR 46415124 fra Jonas' maskine med samme User-Agent. Kl. 10:40 svarede den QUOTA_EXCEEDED på SAMME CVR fra Supabases edge-runtime. Tre minutter, samme forespørgsel, forskellig afsender. Kvoten er altså ikke vores at styre.
- **OG DEN FEJLER TAVST:** `hentCvrData` kaster aldrig, importen fortsætter, og rådgiverens kvittering er ORDRET den samme uanset udfald — svaret bærer `cvr_data`, men ingen fil i `src/` læser det. `cvr_fetched_at IS NULL` er det eneste spor, og kolonnen opdateres aldrig efter oprettelsen.
- **BESLUTTET 14/9:** Virk/Erhvervsstyrelsens CVR-API skal erstatte cvrapi. Ingen nøgle findes (bekræftet i secret-listen og i repoet). Jonas opretter den. Synligheden bygges uafhængigt af kilden. To nye kort (kilden; den tavse fejl).

**7. DAGENS MEDLEM — NORDIC BY HAND ApS.**

- `company_id` `a4481db0-1cbc-4f2f-801e-29d5693da08d`, CVR 46415124, Lisbeth Gade, mail@nordicbyhand.dk. Betalt 40.000 kr. ved TO fakturaer à 20.000 ekskl. moms, uden om platformen — ekstraordinær aftale. Kontrakt 14/9-2026 → 14/9-2027.
- Importeret 08:10:16 via «Importér ansøgning»; invitation pending; mailen sendt og bevist i husets form (§2).
- Sat i hånden bagefter, fordi ingen flade kan: `contact_person`/adresse (10:14), `indgangspris_oere = 4000000` (10:24, så fornyelsen regner til 20.000 kr.), og registrets adresse «Østre Alle 6» + `industry_code` 475510 «Detailhandel med møbler» + `cvr_fetched_at` (10:53).
- **MÅ ALDRIG SÆTTES TIL «Godkendt» I MONDAY:** `monday-webhook` genbruger vel virksomheden på CVR, men opretter OGSÅ et betalingslink og sender en betalingsmail på 40.000 kr. til en der har betalt.
- Varsel 1 forfalder 15/8-2027; beslutningen «tilbyd» skal foreligge senest da. BETALING-kortet står tomt hele året — de to fakturaer har ingen plads i huset (§5).

**8. MANGELLISTEN — lukket, omskrevet, nyt.** Lukket som løst (kortene står med `data-status="loest"`, ikke slettet — Jonas 14/9: «Luk de kort der er løst frem for at slette dem»): fund C (invitationsmailen, #852). Omskrevet: nr. 1 «Indgangens kæde har aldrig haft en virksomhed» (kæden uden indgang; #851), «Gamle virksomheder skal ikke have tilbuddet om Jonas-sessionen» (23 lukket 13/9; 11 åbne). Otte nye kort: (1) betaling uden om platformen har ingen flade (fund 5); (2) importen skriver ikke `contact_person` (fund 4); (3) CVR-kilden skal skiftes til Virk (fund 6); (4) en fejlet CVR-berigelse er tavs over for rådgiveren (fund 6); (5) Lovables afmeldingslink på transaktionelle mails (fund 2); (6) Monday-oprydningen på board 1899777797 — fire webhooks væk, tre bliver, først når kæden er bevist (#851); (7) `hzlkypibayzkkumwohap` — hvad er det, og fik det data (fund 1); (8) `indgangsMail.ts:163` (dag 0) og `fornyelsesMail.ts:200` lover svar fra noreply; fornyelsesmailen bruger jonas@topix.dk frem for kontakt@theboardroom.dk — fornyelsesmailen sendes til PHILBERT den 22/9.

**9. MIDDAG — #853: ONBOARDINGMAILENE lover ikke noget vi ikke holder, og dag 10 kender begge sessioner** (`c115e737`, merget 09:23:16 UTC; udrullet 09:25).

- **Mail A (dag 0–1)** sagde «Jonas eller Morten skriver til dig i chatten i løbet af de første dage». Det er ikke automatiseret, og ingen påmindelse sikrer det. BESLUTTET (Jonas 14/9): vi lover ikke noget vi er i tvivl om; som udgangspunkt er det medlemmet der skriver, og vi svarer. Ny linje under knappen (`LOEFTET`, begge spejle): «Skriv til din rådgiver i chatten, når du vil — Jonas eller Morten svarer.» Samme initiativ som tjeklistens sidste punkt «Skriv til din rådgiver — Sig hej, så ved vi, hvor du er» (`onboardingTjekliste.ts:279-280`; punkt 6 uden velkomstvideo, 7 med). Kildeværn (`onboardingRytme.guard.test.ts`) forbyder «skriver til dig i chatten» i begge spejle.
- **Mail B (dag 10)** hed «Din sparring med Morten er inkluderet» og omtalte kun Morten (fund G). Siden 13/9 (#844) er der to inkluderede sessioner à 30 minutter. Teksten bruger /book-session-kortenes ord ordret («Blikket udefra — Morten er investor og ser din forretning udefra …», «Blikket indefra — Jonas er partner i The Boardroom og kender platformen og dine tal indefra.», «Én session per virksomhed, ikke per bruger.»). **Review-fund før merge, tal fra prod:** `jonas_session_used_at` er sat på 23 af 38, og 14 af cronens 25 kandidater havde ALLEREDE brugt Jonas-retten — en statisk «to sessioner» ville love dem en session de ikke har. `introPaamindelseTekst(fornavn, jonasRetBrugt)`: brugt → emne «Din sparring med Morten er inkluderet» og Jonas udelades; ikke brugt → «Din sparring med Morten og Jonas er inkluderet». `intro-reminder-cron` selecter `jonas_session_used_at` og giver svaret ind (`index.ts:135`, `:205`, `:215`); tørkørslens log siger «én session»/«to sessioner» pr. kandidat. Rammen i cronen bar sit eget mærkat «Din sparring med Morten» — nu «Inkluderet i dit medlemskab», som på fladen.
- Teksten står i TO spejle (`src/lib/onboardingRytme.ts`, `_shared/onboardingRytme.ts`) — husets spejlmønster med ordret paritet efter filhovedet; de kan ikke slås sammen uden at ændre mønstret, som også bærer fornyelsespris, betalingsfrist og virksomhedsraekke. Ingen af rytmens mails bruger `indgangsMailHtml`; de har hver sin ramme (`onboarding-rytme/index.ts:81`, `intro-reminder-cron/index.ts:53`), som gengiver kun `afsnit` for dag 10 — rammerne er ikke lagt om.

**10. #855 — EN FEJLET CVR-BERIGELSE ER IKKE LÆNGERE TAVS** (`b60df81d`, merget 09:48:17 UTC; Update klikket; kun synligheden — `hentCvrData` er urørt, ingen retry, ingen ny udbyder, ingen kø; Virk bygges ikke i dag).

- **Dommen** ren i `src/lib/cvrBerigelse.ts:65` (`cvrOpslagMangler`): gyldigt CVR (otte cifre), `cvr_fetched_at` tom, og adresse eller branchekode tom → mangler, med felterne navngivet. Uden gyldigt CVR er der intet at slå op — ikke en fejlet berigelse. **Selvrensende:** `cvr_fetched_at` sættes kun ved oprettelsen (`virksomhedsraekke.ts:199`) og aldrig siden, så mærket forsvinder når felterne fyldes — af berigelsen eller i hånden.
- **Tre flader, samme dom:** (1) kvitteringen efter import (`importKvittering`, `cvrBerigelse.ts:107`) læser `cvr_data`, som `import-application` altid svarer (`index.ts:236`): opslaget fejlede → advarsel i 15 sekunder, «Importeret — men CVR-opslaget lykkedes ikke … Adresse og branchekode mangler: CVR-registret svarede ikke (dagskvoten kan være brugt). Kør berigelsen (berig-virksomheder) når CVR-kvoten er fri — den udfylder de tomme felter fra CVR. Virksomheden er mærket «CVR-opslag mangler» på listen og på sin side, indtil felterne er fyldt.»; lykkedes → «… Adresse og branche er hentet fra CVR.»; intet gyldigt CVR → «Uden CVR-nummer er adresse og branche ikke hentet.»; genbrug → som før. Virksomheden ER oprettet og invitationen ER sendt i alle grene — en mangel, ikke en fejl. (2) Virksomhedssidens «Hvad skal du vide nu» — et signal i motoren (`virksomhedsSignaler.ts:380-395`, ny kø `stamdata_mangler`, alvor 50: under agentforslag 55, over «over budget» 40), tekst «CVR-opslag mangler — adresse og branchekode står tomt» med handlingen som detalje. Forsidens dom springer køen bevidst over (`forsidensDom.ts` `grundeFraMotoren`, `continue`) — forsiden er uændret; `AdvisorDashboard` giver ikke feltet (valgfrit i `VirksomhedsInput`). (3) Virksomhedslisten — rust-mærket «CVR-opslag mangler» ved siden af tier-badgen, samme plads som træk-mærket; hooken og listen henter `address, industry_code, cvr_fetched_at`.
- **Handlingen peger på berigelsen**, fordi det er den eneste vej der fylder felterne: rådgiverens `EditCompanyDialog` har intet adressefelt og sætter kun branche-labelen (`:113`), ikke koden; kun medlemmet (Indstillinger) og berigelsen skriver `industry_code`.
- **BEVIST PÅ SKÆRM 14/9 kl. 11:50–11:51, begge grene:** Nordic By Hand bærer INTET mærke (felterne udfyldt i hånden kl. 10:53); YKRG APS bærer «CVR-opslag mangler — adresse står tomt» på virksomhedssiden og som mærke på listen. Én af 26 rækker. Ingen falske positiver.
- Tests: `cvrBerigelse.test.ts` (dommen; de fire kvitteringsudfald — uden `cvr_data` giver mangel-beskeden, med gør ikke, begge siger «er oprettet, og invitationen er sendt»); signalmotorens test (signalet, fraværet uden stamdata, placeringen). 205 → 206 filer, 3162 → 3181 tests; typecheck 0 → 0.

**11. #856 — KONTAKTADRESSEN i dag 0 og fornyelsens kvittering** (`0f4d8396`, merget 09:56:59 UTC).

- **Målt først** i hele `_shared` og indgangens/fornyelsens functions (jonas@, morten@, @topix.dk, @molainvest.dk, «skriv til mig», «svar på denne mail»): præcis to fund — `indgangsMail.ts:163` (dag 0, den der bærer BETALINGSLINKET): «Skulle noget gå i vejen med betalingen, så skriv til mig — så finder vi ud af det.» og `fornyelsesMail.ts:200`: «Har du spørgsmål til fornyelsen, så svar på denne mail eller skriv til jonas@topix.dk.» Begge sendes fra noreply@theboardroom.dk, så et svar forsvinder. **Præcisering:** fundet i `fornyelsesMail.ts` sidder i KVITTERINGEN (`kvitteringMail`, sendes af `stripe-webhook` efter betaling) — varsel 1 og varsel 2 (som cronen `fornyelsesvarsler` sender PHILBERT 22/9) bærer ingen adresselinje overhovedet. Rettelsen skal stadig i drift før 22/9.
- **De to nye linjer, ordret:** «Skulle noget gå i vejen med betalingen, så skriv til kontakt@theboardroom.dk — så finder vi ud af det.» og «Har du spørgsmål til fornyelsen, så skriv til kontakt@theboardroom.dk.»
- **Konstanten deles ét sted:** `KONTAKT_ADRESSE` lå i `invitationsMail.ts` (#852, i drift), som selv importerer fra `indgangsMail.ts` — en import tilbage ville være cirkulær. Definitionen er flyttet til basismodulet (`_shared/indgangsMail.ts:67`); `invitationsMail.ts` importerer og re-eksporterer den, så `send-invitation-email` og dens test er urørte. `deno check` grønt på alle tre moduler.
- **Samme klasse, IKKE rettet (listet, som instrueret):** `indgangsMail.ts:184` (dag 14): «Har du spørgsmål, er jeg kun en mail væk.» og `:207` (dag 25): «Er der noget i vejen, så sig til. Jeg vil hellere høre fra dig end sende en faktura.» — ingen adresse, samme løfte.
- **Kildeværn** `kontaktadresse.guard.test.ts`: ingen af de seks former i de to filer (kommentarer strippet), definitionen ét sted, brugen via konstanten i fornyelsesmailen, og begge færdige mails RENDRET indeholder adressen og de to sætninger ordret. Tests 206 → 209 filer, 3181 → 3200 (heraf vindue B's tre filer); typecheck 0 → 0.

**12. #857 — 429 ER RATE_LIMITED, IKKE FAILED** (`588db663`, merget 10:00:35 UTC; fem functions udrullet 10:03 UTC).

- **Dommen** ren i `_shared/mailFejl.ts:55` (`klassificerMailFejl`): spærret modtager → `recipient_suppressed` (ikke retryable); 429 → `rate_limited`, retryable, med `retryAfterSeconds` (kan være null); alt andet → `failed`, retryable ved 5xx (`erRetryableStatus`, `:51`). `managedEmail.ts` returnerer en union med tre grene. `email_send_log` får status `rate_limited` — kolonnen har ingen CHECK, `EmailLogView.tsx:66` kender værdien («Rate-limited»), ingen migration. *RETTET 15/9 (DEL 2 «15. september» §10): prod HAR CHECK-constrainten `email_send_log_status_check`, og den kendte ikke `rate_limited` — `managedEmail.ts` log() blev afvist i tavshed, så et 429 har ALDRIG stået i loggen. Migrationen `20260915210000` tilføjer værdien (skrevet, ikke kørt).*
- **Dagskvoten** (`send-notification-email`, `MAX_EMAILS_PER_DAY = 5`, `:64`) tæller ikke `rate_limited`-rækker (`:305`, `.neq("status", "rate_limited")`) — kun den status er undtaget. Begge løkker stopper ved første rate limit og logger hvor mange der var tilbage.
- **RATE LIMIT-GRENEN ER UBEVIST I DRIFT** — den kan kun bevises af en rigtig 429, som #815's klokke venter på et fejlet træk. **Udrulningen bevist indirekte:** `send-report-reminder` tørkørte 12:04 og svarede «Period: August 2026 | Day: 14» uden exception, altså er den udvidede returtype ikke brudt hos en kalder. Vindue B's egen bogføring af koden: `mailFejl.test.ts`, `mailFejl.guard.test.ts`.

**13. FUND 7 — MAILLOFTET: pr. time, pr. workspace, og fire events brugte det på et kvarter. IKKE BYGGET.**

- **Målt 14/9:** fire events oprettet 08:30, 08:39, 08:45 og 08:50 gav 109 mails til 26 adresser på femten minutter. Fra 09:10:13 status `failed` på seks adresser (tapas, peterjacobsen, marianne, rnl, bsl, caspar); tapas lykkedes 09:15, fem fejlede igen. Lovable sendte 09:10 «Sending rate limit has been reached» — ordret: «Any new emails from your projects will be rejected until the current window resets».
- **Lovables dokumentation** (docs.lovable.dev/features/custom-emails): loftet er PR. TIME og PR. WORKSPACE, ikke pr. projekt. Pro 100 app-mails/time, Business 300, Enterprise 1.000. Auth-mails har eget loft (Pro 500). 50.000 transaktionelle mails/måned inkluderet. Advarsel ved 80 % i More → Cloud → Emails. Kan hæves ved at kontakte Lovable Support.
- **Konsekvens:** alle app-mails deler loftet — invitationer, betalingsmails, påmindelser, varsler. Med 36 medlemmer efter webinaret rammer TRE events loftet. Rammer vi det den 22., er det en ny ansøgers betalingslink der afvises, og hun ved ikke at hun venter. (Efter #857 står den som `rate_limited` i loggen frem for `failed`, og køen prøver igen — men mailen er stadig ikke fremme.)
- **Arkitekturen** (`recon-event-fanout.md`): `publish-event` sender ingen mails — den skriver N rækker i `notifications` (en kø); cronen `process-notification-emails` tømmer den hvert 5. minut, 50 ad gangen, kun notifikationer ældre end 15 min og stadig usete. Køen prøver af sig selv igen, fordi `email_sent_at` kun stemples ved succes. Fire events inden for tyve minutter gjorde alle 104 rækker modne samtidig.
- **JONAS 14/9: nye events skal samles i én mail. IKKE BYGGET.** Nyt kort (Drift). **SENDT 14/9:** anmodning til Lovable Support om 300 app-mails/time — svar afventes.

**14. FUND 8 — CVR-KVOTEN, uddybet: fri igen kl. 12:00; og YKRG APS' CVR findes ikke.**

- Kl. 10:37 200 fra Jonas' Mac, kl. 10:40 QUOTA_EXCEEDED fra edge-runtimen på samme CVR (§6) — og kl. 12:00 var kvoten fri igen. Vinduet er kortere end et døgn, målt to gange. Berigelsen var ikke kørt (Jonas), den har eget værn (`MAKS_OPSLAG` 45, 500 ms pause, tørkørsel som standard, ikke i `cron.job`), importen koster højst ét opslag pr. NY virksomhed (genbrugstjek før opslag, `virksomhedsOprettelse.ts:113-127` før `:131`), frontenden slår ikke op. Regnestykket går ikke op med vores egne kald.
- **YKRG APS (CVR 44891917):** målt 14/9 ca. 12:00 svarer cvrapi 404 NOT_FOUND. Hun kan aldrig beriges. Berigelsen tæller hende som kandidat, fordi den kun tjekker otte cifre (`harCvr`, `_shared/berigelse.ts:88-93`) — ikke at nummeret findes — og brænder derfor ét opslag hver gang den kører, i al fremtid. Mærket fra #855 er korrekt; handlingen «kør berigelsen» hjælper hende ikke. **Nyt kort:** berigelsen skelner ikke «ikke slået op endnu» fra «kan ikke slås op» — et NOT_FOUND burde markeres. **ÅBENT:** YKRG's rigtige CVR-nummer er ikke fundet — Jonas' opgave. **RETTET 14/9 ca. 11:47 UTC (§26): nummeret var transponeret — det rigtige er 44891719; cvrapi 200; rettet i hånden med guard; mærket forsvandt 11:49. Hun var ikke ramt af kvoten, men af en tastefejl — og de to ser ens ud i koden.**

**15. FUND 9 — AFSENDELSESGRENEN ER BEVIST; formiddagens «25 kandidater» var et skøn.**

- `intro-reminder-cron` sendte 14/9 kl. 09:00:10 en rigtig mail til kontakt@topix.dk (Topix.dk ApS). `email_send_log` ordret: «Din sparring med Morten er inkluderet · intro-reminder · sent». Det var 25 minutter FØR #853 blev udrullet (09:25), så den bar den gamle tekst. Ingen skade — egen konto. Kort 6 af 18's «afsendelsesgrenen er ubevist» er lukket (send-vejen `sendManagedEmail` → `email_send_log` er den samme for rytmens tre mails).
- **RETTELSE:** «25 kandidater» i formiddagens bogføring (§9's review-tal) var et skøn ud fra `intro_session_used_at`. Cronen fandt FEM, hvoraf fire springes over med `ingen_medlemsbruger` — den gater også på medlemskabsstart (`introPaamindelseModen`, dag 10) og på at der findes en medlemsbruger (`intro-reminder-cron/index.ts:131-135` og trin 2+3), ikke kun på `intro_session_used_at`. Tallet i bogføringen skal være kodens (tørkørslens svar), ikke et skøn — ny fælde i DEL 4.

**16. LISBETHS FØRSTE UGE — reconen** (`recon-hendes-foerste-uge.md`), og mangellisten.

- Uden velkomstvideo UDGÅR punktet rent — ingen tom boks, ingen død knap. Tjeklisten har SEKS punkter (pillen siger «0 af 6»), ikke fem som `maalinger-foer-webinaret.md` påstod; rettet i «13. september» §26 pkt. 4 og i «Beslutninger der står fast». 1 af 6 er gjort fra start (virksomhed), fordi importen satte website, branche og CVR.
- Tom-tilstandene i Nøgletal, Budget og Rapportering er RENE: reconen søgte efter 0, «—», NaN og tomme grafer ved nul committede tal og fandt INGEN; hver flade har en rigtig sætning med et link. Kort 7 af 18 er derfor ikke en bygning, men et skærmbevis.
- **Mangellisten, middag:** lukket (`data-status="loest"`): fund G (#853), «En fejlet CVR-berigelse er tavs» (#855), «To mails lover svar fra noreply» (#856). Omskrevet: kort 6 af 18 (afsendelsesgrenen bevist; migrationsfilen står tilbage), kort 7 af 18 (skærmbevis, ikke bygning), «Tre instrukser» (mail A's løfte er væk), CVR-kilden (kvoten fri 12:00, YKRG). Nye: mailloftet (Drift), YKRG's CVR findes ikke, berigelsen skelner ikke NOT_FOUND (Indgangen). Rækkefølgens linjer for nr. 6 og 7 rettet.

**17. FUND A ER RETTET I KODE — #849 (`837ca15a`, i HEAD); mangellisten sagde stadig det modsatte.**

- `Betal.tsx:157` læser `betalt=1` gennem `laesBetaltHint`. Dommen `afgoerKvittering` (`src/lib/betalKvittering.ts:68-85`) viser «Tak — vi bekræfter din betaling» uden knapper og henter status igen hvert 3. sekund (`KVITTERING_RETRY_MS = 3_000`, `:36`) i op til 30 sekunder (`KVITTERING_GRAENSE_MS = 30_000`, `:39`); derefter «Vi mangler den sidste bekræftelse» med «Tjek igen»/«Skriv til os». Dommen «betalt» kommer stadig fra databasen (webhooken), ikke fra parameteren.
- Den gamle adfærd — betalingsskærmen igen med tre aktive knapper efter betalingen — findes ikke i koden. Kortet «I STYKKER — fund A» er lukket, **med forbehold: rettet i kode, IKKE bevist udrullet.** Det er frontend og kræver Update-klik i Lovable; beviset er skærmen efter gennemkørslens betaling. Rækkefølgens «I STYKKER»-linje siger nu at kun B og C står tilbage (C er lukket #852).

**18. GENNEMKØRSLENS PRIS ER MÅLT** (`recon-gennemkoerslen.md` §2–§3).

- Billigste første træk: rate12 på niveau 40.000 = 3.500 kr. ekskl. moms (ca. 4.375 kr. med 25 % moms; Stripe Tax beregner ud fra adressen i Checkout). Det opretter et abonnement der trækker hver måned i tolv måneder; `cancel_at` sættes af webhooken til start + 12 mdr − 1 dag.
- Ingen testtilstand: én `STRIPE_SECRET_KEY`, ingen `sk_test`-gren i nogen function. Ingen lavere pris: `tjekPrisniveau` afviser alt uden for de to niveauer — `INDGANGS_PRISPUNKTER_OERE = [4_000_000, 5_000_000]` (`src/lib/indgangspris.ts:43`).

**19. EN REFUSION RYDDER IKKE OP — ny fælde i DEL 4.**

- `stripe-webhook` har grene for `checkout.session.completed` (`index.ts:945`), `customer.subscription.created/updated/deleted`, `invoice.paid` og `invoice.payment_failed`. Der er INGEN gren for `charge.refunded`, `charge.dispute.*`, `invoice.voided` eller `credit_note.*` (grep 14/9). Alt andet svarer `{ received: true }` (`:858`).
- Refunderes en betaling, står `contract_end_date`, `indgangspris_oere`, `status='active'`, `company_perioder`-rækken og invitationen som før. Medlemmet beholder adgang, og fornyelseskæden regner videre på `indgangspris_oere`. At opsige et rate-abonnement i Stripe rører heller ikke platformen — `customer.subscription.deleted` springer over når `metadata.art` er sat (`:840`: «springer status-skrivning over (kun selvbetjening skriver)»).
- **KONSEKVENS:** oprydning efter en testvirksomhed er sletning i platformen (slettefunktionen), ikke refusion i Stripe. Gælder gennemkørslen 22/9-forberedelsen (§18).

**20. EFTERMIDDAG — #859: FUND B, invitationens udfald forsvinder ikke længere** (`a30851cf`, merget 10:44:53 UTC; udrullet 10:46).

- **Før:** seks kaldesteder i `stripe-webhook` kaldte `sikrIndgangsInvitation` uden at læse svaret — `:1225`, `:1235`, `:1299` (indgangsgrenen) og `:700`, `:706`, `:730` (fakturagrenen). De fire udfald (`sendt`, `fandtes_allerede`, `sprunget_over`, `fejlet`) endte i `console.error`: et betalt medlem uden login, som ingen fik at vide.
- **Nu:** `meldInvitationsUdfald` (`stripe-webhook/index.ts:195`, kaldt `:748`, `:755`, `:780` og i indgangsgrenen): «sendt» og «fandtes_allerede» logges og larmer ikke; «sprunget_over» (secret `INVITATION_AFSENDER_USER_ID` mangler) og «fejlet» giver rådgiverne en besked i klokken gennem `skrivRaadgiverBesked` (`_shared/raadgiverBesked.ts` — #815's form, én række pr. rådgiver) med link til virksomhedssiden og udvejen: invitér manuelt i /virksomheder. Ny type-værdi `invitation_fejlet`, samme navneform som `traek_fejlet`.
- **Dedup:** `reference_type` «company» + `reference_id` = `companies.id` — IKKE Stripe-sessionen (kolonnen er uuid, og begge veje ender på samme virksomhed). Prisen står i koden: fejler invitationen igen for samme virksomhed efter en manuel invitation, ringer klokken ikke igen.
- `meldInvitationsUdfald` kaster ALDRIG videre — betalingen er registreret, og en besked må ikke koste svaret til Stripe. `sikrIndgangsInvitation` er urørt.
- **Driftsbevis:** udrullet 10:46 UTC; målt selv med et kald uden signatur → 400 «Invalid signature» (som 13/9), altså er kæden ikke brudt. **GRENEN ER UBEVIST I DRIFT** — den kan kun bevises af en invitation der faktisk fejler. Samme klasse som #815's klokke og #857's rate limit: tre ubeviste grene nu (mangellisten «Beviser der udestår»).

**21. #860 — FUND E: fladen sendte medlemmer til en personlig indbakke** (`fc3b2565`, merget 11:00:28 UTC; Update klikket).

- **Set på skærm 12:47:** /betal viste «Spørgsmål? Skriv til jonas@topix.dk» — det fjerde og sidste sted fra reconens fund, og den skærm et menneske står på MENS betalingen bekræftes. BESLUTTET (Jonas 14/9): adressen i indgangen er kontakt@theboardroom.dk.
- **Målingen først, hele `src/`:** ATTEN forekomster i SEKS filer, ikke én — `Betal.tsx:115, :117` (mailto-konstanterne), `:144-145` (fodnoten); `CompanyLinkFailedGate.tsx:67` (knappen), `:80-81`; `MembershipExpiredGate.tsx:217-218`, `:337` (knappen under «Vil du fortsætte?»), `:427-428`; `FornyelseKvittering.tsx:72`, `:91-92`; `BookSessionView.tsx:225` og `ChatShell.tsx:69` (abonnentens knap). Det er husets fejltilstande — dér hvor nogen skriver. Dertil en kommentar i `src/test/afsenderDomaeneGuard.test.ts:18-19`, der omtalte adressen som fladens kontaktvej.
- **Rettelsen:** `src/lib/kontaktadresse.ts` med `KONTAKT_ADRESSE` og `mailtoKontakt(emne?)`; alle atten steder går gennem den, de eksisterende emnelinjer («mit betalingslink», «min betaling mangler bekræftelse», «min konto», «min fornyelse», «Opgradering til fuldt medlemskab») er bevaret. Den nye linje på /betal, ordret: «Spørgsmål? Skriv til kontakt@theboardroom.dk». Én tekst ud over adressen: abonnentens knap «Kontakt Jonas om fuldt medlemskab» → «Kontakt os om fuldt medlemskab», fordi mailen ikke længere går til Jonas' egen adresse.
- **Sync med Deno-siden:** `src/` kan ikke importere `_shared/indgangsMail.ts` (Deno-import med `.ts`-endelse og esm.sh-afhængigheder), så værdien står to steder — men `kontaktadresseFladen.guard.test.ts` læser BEGGE filer og sammenligner literalerne; driver de fra hinanden, fejler testen. Værnet låser desuden at ingen kildefil under `src/` nævner jonas@, morten@, @topix.dk eller @molainvest.dk, og at de fire flader der viser adressen viser `{KONTAKT_ADRESSE}`. Tests 211 → 212 filer, 3213 → 3218; typecheck 0 → 0.
- **BEVIST PÅ SKÆRM 13:02:** /betal viser kontakt@theboardroom.dk. **Dermed er alle fire steder fra i dag ryddet:** #852 invitationsmailen, #856 dag 0 og fornyelsens kvittering, #860 fladen. Fund E lukket.

**22. FUND A ER BEVIST UDRULLET — forbeholdet fra §17 er væk.**

- `Betal.tsx:157` læser `betalt=1` gennem `laesBetaltHint`; `afgoerKvittering` (`src/lib/betalKvittering.ts:68-85`) viser «Tak — vi bekræfter din betaling» uden knapper, henter igen hvert 3. sekund i op til 30 sekunder, derefter «Vi mangler den sidste bekræftelse». **BEVIST PÅ SKÆRM 12:47 og igen 13:02 — ingen betalingsknapper.** Kortet lukket uden forbehold.
- **«I STYKKER»** i mangellistens Rækkefølge: i morges stod A, B og C; middag kun B og C; nu er B også løst (#859). Kun C er tilbage — og C's skabelon i `email_templates` er stadig `enabled=false`, så fallback'en (husets form siden #852) er mailen.

**23. VELKOMSTVIDEOEN ER I DRIFT; gennemkørslen er forberedt, ikke kørt.**

- **Videoen:** Morten optog den 14/9; filen i Bunny Stream, GUID sat i /admin/config. Målt i SQL 12:49: `app_config.velkomstvideo_guid` = `ee29bc22-e323-4427-939d-da85964a8824`, 36 tegn, gyldigt GUID. Den rå værdi bærer anførselstegn i JSONB som den skal; `#>> '{}'` giver den rene streng — netop fælden fra måling 4 i «13. september» §26 (38 tegn ville have været forkert). **BEVIST PÅ SKÆRM 13:01** på kontakt@topix.dk: fokuskortet viser «Se velkomsten» med «Gør det nu», overlejringen åbner, videoen spiller. Tjeklisten har nu SYV punkter (seks uden video, §16). Kort 4 af 18 lukket.
- **ÅBENT, fundet samtidig:** overlejringens tekst siger «Tjeklisten nederst på siden følger med dig», men pillen trækker sig netop på forsiden (#569, `ankomst.ts`). Rettes nu i et andet vindue — bogført som åbent, ikke løst. **IKKE rettet, bevidst:** knapperne «Se senere»/«Kom i gang», og at videoen er optaget i portræt inde i en 16:9-ramme. Kosmetik, ikke på listen.
- **Gennemkørslen:** `recon-gennemkoerslen.md` (uden for repoet) bærer køreplanen — hvad der skal oprettes i Monday, prisen (§18), hvad der sker trin for trin efter betalingen med det der kan måles, og oprydningen (§19: sletning, ikke refusion). BESLUTTET 14/9: køres med rate12 på 40.000 = 3.500 kr. ekskl. moms, EFTER at fund A, B og E var lukket — så testen bliver et bevis frem for en fejlsøgning. Ikke kørt endnu. **Kørt 11:26–11:38 UTC — §24.**

**24. GENNEMKØRSLEN — GENNEMFØRT 14/9 kl. 11:26–11:38 UTC. Mangellistens nr. 1. Første gang kæden har kørt hel siden marts.**

Testvirksomhed: FLOOR1's CVR 41772239, navn «GENNEMKØRSEL — slettes», mail jonas+gennemkoersel@topix.dk. Køreplanen i `recon-gennemkoerslen.md` (uden for repoet).

- **FØR (målt 13:25 dansk):** 0 rækker i `company_betalingslink`, 0 `company_perioder` med `art=indgang`, 31 aktive virksomheder, FLOOR1 findes ikke, mailen ubrugt.
- **1. Monday:** emne 3222994956 oprettet, status «Ny ansøgning». Felter: mail, CVR 41772239, fornavn/efternavn Gennem/Kørsel, pris 40.000. INGEN adresse — bevidst, så CVR-opslaget blev eneste kilde.
- **2. «Godkendt» → kæden kørte på halvandet sekund:** virksomhed `e5e93593-81f6-4415-af56-155b3b416344` oprettet, `status=active`, `contact_person` «Gennem Kørsel» SAT — Monday-vejen skriver den (B5), hvor importvejen ikke gør: fund 4 set fra den anden side. `company_betalingslink` 11:27:51.337 med `prisniveau_oere` 4000000 og `monday_item_id` 3222994956 — **FØRSTE RÆKKE I TABELLEN NOGENSINDE.** `betalingsmail_sendt_at` 11:27:51.907. `email_send_log` 11:27:52.369, «Velkommen i The Boardroom — sådan kommer du i gang», sent. **MEN:** `cvr_fetched_at` tom, adresse tom, ingen `industry_code` — cvrapi afviste IGEN, tredje måling i dag (kvoten var fri kl. 12:00 og brugt op kl. 13:27 dansk). Argumentet for Virk er målt tre gange (§6, §14).
- **3. Dag 0-mailen læst:** header og footer rene, beløb 40.000 ekskl. moms, frist 14. oktober, token `b7252f59-1d1b-4ee4-ba72-c7abecf6f027` = samme som i databasen. **MEN teksten sagde stadig «så skriv til mig»** — #856 var merget 12:06 dansk og IKKE udrullet: de fem functions blev udrullet 10:03, FØR #856 fandtes. Fælden fra DEL 0 punkt 2 (en merge er ikke en udrulning), fanget af gennemkørslen selv. Dag 0-mailen udrullet 11:39 sammen med `monday-webhook`. **TEKSTEN ER IKKE BEVIST** — den kan først ses ved næste rigtige «Godkendt».
- **4. /betal** viste tre modeller med kataloget beløb og fodnoten kontakt@theboardroom.dk — #860 i drift. Fladen var opdateret, fordi Update var klikket; mailen ikke, fordi functionen ikke var udrullet: **to kanaler, to tilstande** (ny fælde, DEL 4).
- **5. Betalt** med rate12 på 40.000. Stripe Tax lagde 25 % på: 4.375 kr. Skærmen efter betalingen viste den ENDELIGE tilstand «Tak — … er inde», ikke mellemtilstanden — **FUND A BEVIST I DRIFT på en rigtig betaling** (§22 var skærmbevis uden betaling). Skrevet af webhooken: kontrakt 2026-09-14 → 2027-09-14; `indgangspris_oere` 4000000; `stripe_customer_id` `cus_VG4F6BnGwJ4zU2` — FØRSTE virksomhed med feltet sat af kæden selv (27 aktive stod med NULL, målt 10/9); `company_perioder` `beloeb_oere` 4200000, model rate12 (40.000 + 5 % ratetillæg — regnestykket i `indgangspris.ts` holder i drift); `company_invitations` pending med `invited_by` = morten@molainvest.dk — **SECRET'EN `INVITATION_AFSENDER_USER_ID` ER BEVIST SAT OG RIGTIG, måling 1 lukket**; `sidste_checkout_session_id` nulstillet. `advisor_notifications`: 0 rækker — fund B's klokke (#859) ringede IKKE, fordi invitationen lykkedes. Grenen er stadig ubevist, og det er korrekt.
- **6. Invitationsmailen** 11:32:31, sent, «Din adgang til The Boardroom er klar», med virksomhedens navn, «Den står allerede udfyldt» og kontakt@theboardroom.dk. `metadata` ordret: `{"skabelonvalg": "fallback", "fallback_aarsag": "enabled_false"}` — #852's værn i drift.
- **7. Signup:** mailfeltet låst, «Invitationen er sendt til denne adresse», navnet forudfyldt fra Monday. Konto oprettet.
- **8. Første login:** «Velkommen, Gennem.», velkomstoverlejringen åbnede med Mortens video og den NYE tekst fra #861 ordret: «Tjeklisten står under «Dit næste skridt» her på forsiden og følger med dig, indtil alt er på plads.» — **#861 bevist på en rigtig ny bruger en time efter merge.** **MEN tjeklisten var 0 af 7, ikke 1 af 7:** reconen (§16) antog at «Din virksomhed» var gjort fra start, men det gælder IMPORTVEJEN (website, branche, CVR fra regnearket). Monday-vejen satte branche-label og CVR, men ikke website — så punktet står ugjort. **FORSKEL MELLEM DE TO INDGANGE** — nyt kort (Indgangen).
- **Oprydningen:** abonnementet `sub_1UFY7W3CvBmCx5PtSwaKxhhV` annulleret immediately med refusion 4.375 kr. (kreditnota udstedt automatisk; bilaget bliver stående i Stripe som TBR-0003 fra 3/9). Webhooken havde selv sat `cancel_at` til 14/9-2027 (12 mdr − 1 dag), som Stripe registrerer som `canceled_at` — den designede adfærd, bevist i drift. Platformen ryddet med navngivne id'er i SQL 11:38: otte rækker i syv tabeller, alle 1 (§19: en refusion rydder ikke op — sletningen var i hånden). **EFTER-måling:** nul forældreløse i fem tabeller, 0 betalingslink, 31 aktive — som før. `email_send_log`s to rækker bevaret som historik.
- **Det gennemkørslen LUKKER:** mangellistens nr. 1 «Indgangens kæde har aldrig haft en virksomhed» — bevist i drift. Måling 1 (`INVITATION_AFSENDER_USER_ID`) og Monday-sporet (måling 7) er bevist gennem brug, som `maalinger-foer-webinaret.md` sagde de måtte. **IKKE bevist:** `RAADGIVER_MAIL_TIL` — prisen var sat fra start, så rådgivermail-grenen (`indgangsBetalingsmail.ts:104-107`) blev aldrig udløst; står stadig som UBEVIST (kort 5 af 18). Dag 14/25/31 fra cronen: ikke prøvet (rækken slettet samme dag).

**25. #864 — NÅR EN UPLOAD STRANDER, SIGER KORTET HVAD MAN GØR (mangellistens nr. 8). `4f82e7c4`, merget 12:16:20 UTC. Ren frontend — kræver Update-klik; ikke bevist på skærm.**

- **Fundet (recon-strandet-upload.md, uden for repoet):** serveren stempler hver upload med et kildefingeraftryk — `detectSourceSystem` (`_shared/sourceFingerprint.ts`: economic | dinero | combined_dk | unknown), gemt i `raw_extracted_data.routing_trace.source_fingerprint.source_system` (`extract-financial-data/index.ts:480`). Det blev kun brugt til ét hint i toasten (`reportUploadEngine.ts`) — og dér stod «dinero» og «combined_dk» råt. Kortet sagde HVORFOR (`rapportFejlgrund`, #793) men ikke HVAD man gør, og `gross_profit_sum` gav slet ingen grund: checknavne filtreredes væk som teknik (`reportCardView.ts:103`), og en test låste det.
- **Koblingen (ren, i lib):** `src/lib/hjemmebane/rapporteringTekst.ts` fik `kildeNavn`, `eksportVejForKilde` og `naesteSkridtTekst`. Kilden peger på SIT objekt i `EKSPORT_VEJE` — samme konstant som «Sådan henter du den» på /rapportering og historik-mailen (`_shared/onboardingRytme.EKSPORT_VEJE_TEKST`, paritetstestet i `onboardingRytme.test.ts:174`), så kort, side og mail siger den samme vej. economic → e-conomic-linjen, dinero → Dinero-linjen; alt andet (unknown, combined_dk, null, tomt, ukendte ord) → «Andre» uden at nævne et program. combined_dk er et strukturelt aftryk (Balance + Nummer/Navn + periodekolonne, `sourceFingerprint.ts:138-158`), ikke et program — serverens KILDENAVNE kalder det «dit regnskabssystem» (`index.ts:872-876`); før kaldte `getFriendlyErrorMessage` det e-conomic, et gæt, nu «dit regnskabsprogram». Billy står i `EKSPORT_VEJE` men har intet fingeraftryk: ingen kilde fører dertil.
- **MÅLT I KODEN — hvilken fil:** e-conomics saldobalance som EXCEL er det stærkeste spor. Fingeraftrykket er HIGH på to faste rækker (CVR i række 2, «Saldobalance for perioden» i række 4; `sourceFingerprint.ts:103-117` — det første tjek i XLSX-grenen), og TO skabeloner dækker den: `dkEconomicSaldobalanceXlsxV1` (fast score 88 efter fire hårde gates: otte cifre i række 2, «saldobalance» i række 4, «Nr.»/«Navn» i række 6, mindst fem kontonumre 1000–9999; først i registret, `templateRegistry.ts:157-158`) for varianten uden subtotaler, og `dkCombinedBalancePnlV1` (85/92, «DK Combined Balance/P&L (Saldobalance)») for varianten med. Resultatopgørelsen som Excel: ét fingeraftryk (HIGH, `:119-136`) og ÉN skabelon med additiv score (+40/+20/+15/+10/+5, maks ~90), der falder til 0 hvis ordet «aktiver» står i filen (`dkEconomicResultatopgoerelseXlsxV1.ts:315-320`). Belægget står i filhovedet i `rapporteringTekst.ts`.
- **Kortet (`reportCardView.ts`):** nyt felt `naesteSkridt` på error- og needs_manual_entry-kortene, egen linje under label og grund (ikke klippet af `kortGrund`); `rapportNaesteSkridt` er en ren dom over samme kilder som grunden plus fingeraftrykket: spænd-afvisningen får serverens egen hale, som `kortGrund` klipper af grunden («Eksportér én måned pr. fil, og upload dem hver for sig.»); «ikke afsluttet» får intet (grunden siger det allerede); alt andet får vejen for kilden. `KONTROL_GRUNDE` + `kontrolNavn`/`kontrolGrund` oversætter «navn: details» (`index.ts:1407`) og «Kontrol af dokumentet — navn: details» (`:1410`, skabelonernes egne) i formularens ord (`reportOverrideHelpers.FIELD_LABELS`).
- **Kablingen:** `RapporteringView.tsx` henter kilden via PostgREST-JSON-stien `kilde:raw_extracted_data->routing_trace->source_fingerprint->>source_system` i select'en (klienten castes før select — stien ligger uden for den typede parser). Første brug af en JSON-sti i en select i huset; MÅLT mod prod-PostgREST med anon-nøglen: gyldig select giver 200 og tom liste (RLS), en bevidst ugyldig kolonne giver 400 — så stien parser, og den kan ikke vælte listen. Ældre rækker uden fingeraftryk og AI-vejen giver null → «Andre».
- **Alle nye tekster, ordret.** Næste skridt, e-conomic: «Den fil vi læser sikrest fra e-conomic, er saldobalancen som Excel: Regnskab → Rapporter → Balance (eller Saldobalance) → Excel.» Dinero: «Sådan henter du en fil vi kan læse fra Dinero: Rapporter → Resultatopgørelse → CSV eller PDF.» Ukendt: «Vi kan ikke se, hvilket regnskabsprogram filen kommer fra. Resultatopgørelse eller saldobalance som PDF eller Excel — kan vi ikke læse den, indtaster du de vigtigste tal selv.» To måneder i én fil: «Eksportér én måned pr. fil, og upload dem hver for sig.» Grunde: gross_profit_sum «Dækningsbidraget stemmer ikke med omsætning minus direkte omkostninger — tjek de tre tal på kortet.» (belæg `canonicalEngine.ts:625-636`; i drift var fire af fire fortegnsvendte, `docs/import-model-design.md:80-83`) · required_fields_present «Vi fandt ikke omsætningen og resultatet før skat i filen — indtast tallene på kortet.» (kun de felter der mangler nævnes) · revenue_present og missing_core_totals uden omsætning «Vi fandt ingen omsætning i filen — indtast tallene på kortet.» · missing_core_totals uden balancetotaler «Vi fandt hverken aktiver i alt eller passiver i alt i filen — indtast tallene på kortet.» · ebt_present «Vi fandt intet resultat før skat i filen — indtast tallene på kortet.» · cost_lines_present «Filen har omsætning, men ingen omkostninger — resultatet ville blive lig omsætningen. Indtast tallene på kortet.» · mixed_period_columns_detected «Vi kunne ikke se, om tallene gælder måneden eller året til dato — tjek perioden og tallene på kortet.» · period_consistency «Tallet for året til dato er mindre end tallet for måneden — tjek, hvilken kolonne der er hvad.» · suspicious_sign_pattern «Fortegnene ser vendte ud: omsætning eller omkostninger står som negative tal — tjek fortegnene på kortet.» · impossible_margin_check «Dækningsgraden er uden for det mulige (over 100 %) — tjek omsætning og direkte omkostninger på kortet.» · result_consistency «Resultat før skat er større end dækningsbidraget — tjek fortegnene på kortet.» · balance_equation «Aktiver i alt og passiver i alt stemmer ikke overens — tjek totalerne på kortet.»
- **Uden grund på kortet, bevidst (intet belæg for en menneskelig tekst, eller intet felt medlemmet kan rette):** ebit_calculation, ebitda_calculation, numeric_values_only, deterministic_parser_status, sign_convention, sign_convention_detected, defaulted_fields, ambiguous_lines, ambiguous_ebt_impact, financial_costs_present, depreciation_present, balance_lines_skipped, structural_acceptance, sign_consistency, parser_validation, no_subtotals, minimum_classes, costs_present, balance_present, balance_check, assets_present — plus «AI returned no tool call» og «Unknown error» som før. Rå validator-output ses stadig i review-dialogens detalje (rådgiverens flade, urørt) — aldrig på medlemmets kort.
- **Parseren er URØRT:** ingen ny skabelon, ingen ændring i vareforbrugs-matcheren (`dkEconomicResultatopgoerelseXlsxV1.ts:197`), intet fingeraftryk for Billy. Kort 12 (PHILBERTs to filer) står ÅBENT — det kræver filerne, som ikke er set.
- **Tal:** tsc 0 → 0; 213 testfiler → 213; 3223 → 3242 tests (+19: rene domme først — economic/dinero/unknown, gross_profit_sum giver nu en grund i begge former, hver tekst bærer sin linjes vej ordret, paritet med `EKSPORT_VEJE`). Den gamle test der låste gross_profit_sum til null, er rettet til de checknavne der stadig er teknik. Frontend: kræver Update-klik; bevis = ét strandet kort på skærm med grund OG næste skridt (Rækkefølgens nr. 8; «Beviser der udestår», et tiende).

**26. YKRG'S CVR VAR TRANSPONERET — rettet 14/9 ca. 11:47 UTC. FUND 13: et transponeret CVR-nummer passerer alle husets tjek.**

- **Nummeret** i platformen var 44891917. Det rigtige er 44891719 — to cifre byttet om. cvrapi svarede 200 på det rigtige: YKRG ApS, Industriparken 44A, 2750 Ballerup, industrycode 562100 «Event catering», seks ansatte, tapas@tapasamor.dk.
- **Rettet i hånden** med guard (kun hvis adressen stadig var tom). FØR-værdier: cvr 44891917, adresse tom, `cvr_fetched_at` NULL. `industry_code` og `industry_label` er BEVIDST urørt: feltet stod ikke NULL men «food_restaurant» — husets egen branchenøgle, ikke registrets kode. At skrive 562100 ind ville bytte en husnøgle ud med en registerkode i det felt der bruges til branchesammenligning. Hører under «CVR-branche og faktisk branche er to ting».
- **BEVIST PÅ SKÆRM 11:49:** mærket «CVR-opslag mangler» forsvandt fra hendes række af sig selv. #855's selvrensende dom er dermed bevist på BEGGE grene — mærket kom 11:51 i formiddags da adressen manglede, og forsvandt nu.
- **FUND 13, skarpere end kortet fra i formiddags:** ET TRANSPONERET CVR-NUMMER PASSERER ALLE HUSETS TJEK. Otte cifre — `CVR_FORMAT` godkender, `harCvr` godkender (`_shared/berigelse.ts:88-93`), berigelsen tæller det som kandidat. Kun registret kan afvise det — og når det gør, siger koden «no data» (`hentCvrData`, `_shared/virksomhedsOprettelse.ts:74-83`), nøjagtig samme svar som når kvoten er brugt op. Vi troede i formiddags (§14) at YKRG var ramt af kvoten; hun var ramt af en tastefejl. De to ser ens ud i koden. Det gør kortet om NOT_FOUND vigtigere end det så ud — kortet er skærpet, DEL 4-fælden ligeså. YKRG's eget kort er lukket.

**27. PORTRÆTTET — rettelse til mangellisten: intet nyt foto skal tages.**

- Kortet om delingen (og «13. september» §27) sagde «Jonas' portræt er 300 px — der skal et nyt». Det er kun sandt om PLATFORMENS fil: `public/jonas-herlev.png` er 300×283. Målt 14/9 i designarkivet (`docs/delingskreativ/`, sips): `assets/jonas-hi.png` 1044×1044, originalen `uploads/Jonas1-kopi.jpg` 2000×1334; Mortens `assets/morten-hi.png` 728×728, og `uploads/564a5476-kopi.JPG` 1035×830 — samme mål som platformens `public/morten-hesselholt.jpg` og `morten-larsen.jpg`.
- Der skal altså INTET nyt foto tages — der skal kopieres to filer ind i `public/`. Kortet er rettet; §27-linjen fra 13/9 har fået rettelsen inline.

**28. DELINGSKREATIVEN — DESIGNET ER LAVET (Jonas, Claude Design, 14/9). Bygningen deles i to; medlemmet vælger varianten.**

- **Designet** ligger i `docs/delingskreativ/` (designfiler — ikke bogføring; røres ikke af bogføringen). Tre layouts: 3a «Tre på række», 3b «Optagelsen», 3c «Optaget i» — hver i mørk og lys, hver i stående og liggende = tolv varianter. Ti færdige eksporter i `eksport/`: fem gange kvadrat 1080×1080 og liggende 1200×627 (filerne hedder 1a–1c og 2a–2b; målt 14/9 med sips — sammenhængen mellem filnavn og layoutnavn er ikke målt). Pladsholdere: memberName, companyName, dateLabel. Plus et billedfelt til medlemmets eget portræt.
- **JONAS' BESLUTNINGER 14/9 (står fast):** (1) medlemmet SKAL kunne vælge mellem varianterne — valget er en del af gaven. (2) Bygningen DELES: del 1 er siden med kreativerne, billedvalg, download og tekstudkast; del 2 er tjeklistepunktet, som tages bagefter. Del 1 virker uden del 2 — linket sendes i chatten.
- **Reconen** (`recon-delingskreativen.md`, uden for repoet), efterprøvet 14/9: html2canvas 1.4.1 er ALLEREDE i brug (`exportPdf.ts:20-29`, scale 2, useCORS; `package.json` ^1.4.1); Parkinsans og Manrope hentes allerede fra Google Fonts (`index.css:1-2`); «ocean» findes ikke som token (grep i `index.css`: 0), og Hjemmebane har ingen mørke tokens. «Del direkte på LinkedIn» kan ikke bygges — share-URL'en tager kun et link; download + kopiér er kravet.
- **Svaret af designet** (mangellistens åbne beslutninger fra 13/9): antal og format (tolv varianter, begge formater), hvad der står på billedet (navn, virksomhed, dato som pladsholdere), portrættet (billedfelt), hvem der tegner (Jonas, gjort). **Stadig åbent for koden:** hvad der tæller som «gjort» i tjeklisten (del 2), hvor i rækkefølgen, kun fulde medlemmer, menupunkt eller kun fra tjeklisten, rute og navn, og teksterne (3–4 udkast) i kode.

**29. NR. 16 VENDT PÅ HOVEDET — auth-mails i loggen er ét felt bredt; og hooken holdt op med at logge 8/9 (recon-auth-mails.md, uden for repoet). Prioritering, ikke løsning.**

- **De seks typer og hvem der sender:** `auth-email-hook/index.ts:125-183` renderer signup («Bekræft din e-mail»), invite, magiclink («Dit login-link»), recovery («Nulstil din adgangskode»), email_change og reauthentication; transporten er Lovables (`createAuthEmailHandler` → `sendLovableEmail`, `dist/index.js:226-241`), kalderen verificeres med `LOVABLE_API_KEY` (`:204`), ikke med en Supabase-hook-hemmelighed. Om Supabase Auth i prod er sat til at kalde hooken, står ingen steder i repoet (`config.toml` har ingen `[auth]`-sektion; `mailfortegnelsen.md:171-173`: kræver opslag under Auth settings).
- **Kun én udløses i vores kode:** `supabase.auth.resetPasswordForEmail` (`Auth.tsx:171-173`) → `recovery`. Signup-bekræftelsen: slået fra 2/9 ca. 21:54 (Auto-confirm TIL), bevist 21:56 med `confirmation_sent_at = NULL` og `email_confirmed_at` +0,25 sek. (`indgangen-overhaling.md:103-107`; før, 1/9: +0,24/+28 sek.), og bekræftet af gennemkørslen 14/9 (§24 trin 7-8: «Konto oprettet» → første login). `Auth.tsx:163` (`data.session ? "auto" : "confirm"`) viser «Tjek din mail» kun hvis indstillingen vendes. Koden springer INTET over på grund af invitationen — `signUp` kaldes ens med og uden token (`:149-158`); triggeren har ingen betingelse på `email_confirmed_at` (CLAUDE.md:92). Magiclink/invite/email_change/reauthentication: ingen `signInWithOtp`, `inviteUserByEmail`, `updateUser({ email })` eller `reauthenticate` i `src/` eller `supabase/functions/` (grep); legatets `generateLink({ type: "magiclink" })` (`create-legat-enrollment:187-193`) sender ikke — linket lægges i `legat-welcome`, som logges. Google-login er OAuth uden mail (`Auth.tsx:191`).
- **Konsekvens for «jeg fik ingen mail» om otte dage:** den kan ikke handle om en bekræftelsesmail. Betalingslinket (`indgangsBetalingsmail`), invitationen (`invitation`, `send-invitation-email:170-177` via `sendManagedEmail`) og dag 0-mailen (`onboarding-dag0`) står alle i `email_send_log`. Det eneste hul er en nulstil-mail.
- **Hooken holdt op med at logge 8/9 — nyt fund i git:** version `b6008c51` (11/5 → 8/9 07:00:24 UTC) skrev en `pending`-række (`message_id`, `template_name = emailType`, `recipient_email`, `status: 'pending'`) FØR afsendelse og lagde mailen i køen `auth_emails` via `enqueue_email` (gammel `auth-email-hook/index.ts:246-251, :253-267`), og en `failed`-række hvis køen fejlede (`:272-278`). Lovables ombygning 8/9 (`b45007eb`, DEL 4 «LOVABLE KAN BYGGE OM UNDER OS») erstattede det med SDK'ens handler, som skriver intet i loggen: ingen `.from(`/`.insert(` i `@lovable.dev/email-js@0.1.0/dist/index.js:189-250`. `mailfortegnelsen.md:37-40` skrev 8/9 «Auth-mailene skriver ikke i `email_send_log`» — som om det altid havde været sådan; at det var et SKIFT, blev ikke set. `EmailLogView.tsx:78-83` bærer stadig labels for de seks typer — arv fra den gamle hook — så fladen så ud som om den kendte dem. Ældre rækker fra før 8/9 kan findes med SQL (reconen §2b, ikke kørt); rækker efter 8/9 kommer ikke.
- **Andre fund fra reconen:** ingen flade slår op på én adresse på tværs — `EmailLogView` søger klientside i den hentede side (100 rækker, `:142-146, :179-185`); `VirksomhedMailLog` (`:75-78`) kommer tættest, kun for adresser knyttet til en virksomhed, kun `email_send_log`. `handle-email-events:24-30` bogfører bounces som `template_name: 'system'` uden label — så en bouncet nulstil-mail LANDER i loggen (som `system · bounced`), selv om afsendelsen ikke gjorde. `email_send_state` (`auth_email_ttl_minutes` …) læses af ingen kode længere (hørte til den slettede kø). `auth.audit_log_entries` er ikke i repoet eller typerne; `auth.users` nås kun gennem `get_users_last_login` (SECURITY DEFINER, `20260507120000`).
- **Tredje stille skift fundet i dag:** Monday-webhooken (opskriften uden Authorization-header, #851), invitationsmailens `enabled_false` (#852), og nu hookens logning (8/9). Fælden i DEL 4 er skærpet med dette eksempel frem for en ny.
- **Prioritering (Jonas 14/9), ikke løsning:** nulstil-mailen rettes IKKE før 22/9. Kortet nr. 16 er omskrevet til det reconen fandt (ét felt bredt; størrelse fortsat Lille); nyt kort om hooken (Rådgiverfladen). Vejene der findes står i reconen §5 uden anbefaling.

**30. DELINGEN, DEL 1 — GALLERI, FULDSKÆRM OG ET OVERLØB DER IKKE VAR DER (#866, #868, #869).**

- **#866 (`64223ce2`, 13:06:26 UTC): første kreativ på skærmen** — 3a «Tre på række» i mørk kvadrat, målt ordret fra designets v2 (`docs/delingskreativ/`, ind i repoet med #865 `e9c47ec0` 12:49:19). Alle mål er px, farverne designets otte hex, fontene Parkinsans og Manrope (allerede i `index.css:1-2`).
- **#868 (`140fea16`, 13:27:16): galleri og fuldskærm.** Jonas 14/9: kreativerne skal ikke vises store på siden. Overblik med små kort, klik for stort, skift mellem dem, tilbage. Listen i `kreativer.tsx`, så en ny variant kun er en post. `SkaleretKreativ` ejer skala og mål — `transform: scale()` ændrer ikke flowet, den utransformerede 1080-boks blev stående under indholdet. **Husets `HbDialog` FRAVALGT med begrundelse i koden:** `max-w-lg` er 512 px, kreativen er 1080.
- **Fejlen der IKKE var en fejl.** Tre gange (15:08, 15:29, 15:56 dansk) så det ud som om kreativen flød ud over kanten. #869 (`1331a2f3`, 13:41:58) målte pixels i skærmbillederne: fladen var en tom rektangel i kreativens farve UNDER dialogens boks — dialogen slutter i y=1198, billedet er 1357 px højt. **BEVIST 16:10 med et almindeligt skærmbillede (Cmd+Shift+4): ingen flade.** Værktøjet var GoFullPage, som fanger hele siden, mens en fixed-overlejring kun dækker viewporten. Ny fælde i DEL 4.
- **Den ægte fejl #869 fandt undervejs:** containeren i boks-tilstand målte sig selv gennem `height:100 %` — en procent der kun løser sig hvis forælderens højde er definit; løste den sig ikke, så første måling `clientHeight = 0`, koden faldt tilbage på bredden, skalaen blev 1, rammen 1080 px høj, og NÆSTE måling så 1080 og bekræftede den. I headless Chrome løste procenten sig (684 px), på Jonas' skærm ikke. Nu tre lag (`SkaleretKreativ.tsx:19-32`): der måles aldrig en procent (flex-elementet ejer højden), intet tilbagefald (0 giver 0), og `overflow: hidden` som sidste værn. `skala.ts` er ren og testet.

**31. DELINGEN, DEL 1 — HENDES DATA, TOLV VARIANTER, BILLEDERNE HUSKES, HENT PNG (#870–#873).**

- **#870 (`a5dd8213`, 13:51:11): kreativen med hendes egne data.** Navn og virksomhed fra `useAuth`, portræt fra `avatar_url`, logo fra `logo_url`. Navn og virksomhed kan rettes i felterne, men GEMMES ALDRIG — testen KASTER hvis nogen kalder `update`. Jonas 14/9 bekræftede at nulstilling ved refresh er ønsket: «Jeg kan jo bare rette det derinde og downloade.» **BEMÆRK:** #870 indeholder også `src/lib/kreativEksport.ts` og dens test, som hører til det andet vindues arbejde (PNG-motoren: html2canvas i fuld størrelse, `scale: 1`, skaleringen fjernes på klonen). De to vinduer deler ét git-index, og `git commit` committer hele indekset. Filerne er identiske med det der blev målt — ingen kode mangler, kun commit-beskeden er upræcis. Bogført som sket; fælde i DEL 4.
- **#871 (`cf664a3d`, 14:25:18): alle tolv varianter.** Tre layouts × mørk/lys × kvadrat/liggende. `DelingView` og `KreativFuldskaerm` UÆNDREDE: formen fra #868 holdt, elleve varianter kostede elleve poster. Listen genereres nu fra layouts × udgaver × formater; målene er data pr. kombination, ikke beregnede (`delingskreativ.ts` 617 linjer). Alle tre layouts bærer Morten og Jonas (`KreativRaadgivere` i 3a, `KreativRaadgiverStak` i 3b og 3c).
- **#872 (`16340752`, 14:29:17): billederne huskes.** Jonas: «hvis jeg refresher siden, forsvinder tingene igen.» Logoet ad vej (a): eksisterende bucket `company-logos` + `companies.logo_url`, ordret som Indstillinger — så det også er virksomhedens logo, og fladen siger det FØR hun trykker. Portrættet ad vej (b): ny PRIVAT bucket `deling-portraetter`, ingen «anyone can view» som avatars; RLS kun egen mappe på alle fire cmd. INGEN NY KOLONNE: stien `{uid}/portraet` er deterministisk, URL'en signeres ved visning. Grænserne er avatar-uploadens (image/*, 2 MB); et billede under slot'ens 310 px får en oplysning, ikke en afvisning. **Migrationen `20260914170000_deling_portraetter_bucket.sql` KØRT I HÅNDEN 14/9 ca. 16:31 dansk — bekræftet: public=false, 2097152, image/*, fire policies (DELETE, INSERT, SELECT, UPDATE).**
- **#873 (`c3a84745`, 14:42:19): «Hent PNG».** Motoren fandtes (`kreativEksport.ts`), knappen manglede. Henter den åbne kreativ i dens eget format, spærret mens den tegner. **Det vigtigste greb:** tomtilstanden slås fra med `flushSync` FØR html2canvas kloner — ellers ville «Medlemmets portræt» og den stiplede ring ende i filen hun deler.

**32. DELINGEN, DEL 1 — TEKSTEN TIL OPSLAGET (#874) OG OPTAGELSESDATOEN (#876).**

- **#874 (`a445526d`, 14:54:59). Første forsøg: Jonas' dom var «røvsyge», og den var rigtig.** Fejlen var prompten («ikke markedsføring» gav noget ingen læser færdigt), ikke bygningen. Anden runde: fire VEJE, ikke fire længder — «Glad og ligefrem», «Ærlig», «Forretningsmæssig», «Invitation» — Jonas' egne ord, ordret som skabeloner med virksomhed og dato sat ind (`src/lib/delingstekster.ts`). **«Ejerleder» er væk:** målt på theboardroom.dk er målgruppen «soloselvstændige og ejerledere», og de fleste medlemmer er nærmere det første; to tests håndhæver det. **Løftet er hentet ORDRET fra websitet:** «Rådgivere, der er der, når beslutningen opstår. Ikke bare hvert kvartal.» og «12 måneder med to rådgivere, der har bygget, drevet og solgt virksomheder – og som har dine tal ved hånden, fordi du uploader dem hver måned.» Hver tekst har en kopiér-knap (RabataftalerViews «Kopieret»-mønster); «fire år» i «Ærlig» er markeret som et eksempel hun retter selv. **NYT: en vejledning ved siden af teksterne** — tag Morten (linkedin.com/in/mortenlarsen) og Jonas (linkedin.com/in/jonasherlev) i selve opslaget, læg linket til theboardroom.dk i første kommentar (LinkedIn viser opslag med eksterne links til færre), svar på kommentarer den første time, billedet først og teksten under. Kun de fire punkter — intet mere om algoritmen. The Boardroom har ingen LinkedIn-side i brug, så der tagges ingen virksomhed.
- **#876 (`a7dc51d8`, 15:15:52): optagelsesdatoen.** Kreativen sagde «Optaget september 2026» på alle tolv, også for en virksomhed der blev medlem for et år siden — datoen kom fra dagens dato (`dateLabel(new Date())`), altså hvornår kreativen laves. Kilden er nu `companies.contract_start_date` (sat af `stripe-webhook:681` og `import-application:171`), hentet i samme opslag som logoet; `optagelsesLabel` læser kun år og måned. **Uden startdato: ingen dato** — aldrig en gættet — og fladen siger hvorfor. **Linjen KAN SLÅS FRA** (Jonas 14/9: «det kunne godt være en tekst folk ikke er interesserede i står der»); valget gemmes ikke, som navn og virksomhed. **Målt i de tre layouts:** overskriften flyder EFTER datolinjen i alle tre (3a/3c: topblokken; 3b: hele kolonnen), så et fjernet element ville rykke alt op. Derfor fjernes teksten, ikke boksen: linjen beholder sin højde med et hårdt mellemrum og får `visibility: hidden` (`datoLinje.ts`) — intet flytter sig, og html2canvas tegner den ikke. Teksterne til opslaget følger samme dato.

**33. FUND 15 — ET NYT BILLEDE KUNNE IKKE SES, hverken logo eller avatar (#875, `011cc580`, 15:11:06). Bredere end delingen.**

- **Symptomet:** Jonas så på /deling at logoet ikke kunne skiftes. **To lag, målt:** (1) strengen ændrer sig aldrig — `getPublicUrl` giver samme URL for samme sti, så browseren beder aldrig om billedet igen; (2) `cache-control: max-age=3600`, målt på fire objekter — storage-js' standard (`dist/index.mjs:531`), og ingen af husets uploads satte noget andet. Portrættet i delingen virkede kun som BIVIRKNING af at signerede URL'er bærer et token med udløb — ikke som et bevidst greb.
- **Uden for delingen — det har været sådan hele tiden:** `KontoView` bustede sin egen visning med `?t=` i state, men gav den rene URL videre gennem `refreshProfile`, så sidebar og topbar viste det gamle billede resten af sessionen; andre medlemmer så det gamle avatar i op til en time i MemberProfile, MemberDirectory og PushView.
- **Jonas' beslutning: versionen i den GEMTE URL, ikke fjernet cache.** En fjernet cache betales hver gang et billede vises (medlemsoversigten henter 30 avatarer pr. besøg); en version koster kun når billedet skifter. `src/lib/billedVersion.ts` sætter versionen ved upload (KontoView, IndstillingerView, delingsbilleder); de to `?t=` i komponent-state er ude — de gav en ny URL ved HVERT render. Eksisterende URL'er uden version migreres IKKE. Logo-testen tåler at URL'en bærer en version (delene tjekkes hver for sig — et tidsstempel i en forventet værdi er en test der fejler igen).

**34. MENUPUNKTET (#877) OG LOGOET DER BLEV STRAKT I PNG'EN (#879).**

- **#877 (`8accaab2`, 15:23:42): «Fortæl det videre».** Siden var i drift uden en linje i menuen. Sidst i medlemmets menu, fordi den vender ud af huset — og ikke «Deling», som beskriver mekanikken frem for gaven (beslutning nederst). Abonnenten får det ikke: hun er ikke optaget. `hbNav.ts` + menu-testen; `Deling.tsx` markerer linjen.
- **#879 (`003fc3a7`, 15:30:47): logoet blev strakt i den hentede PNG.** Set på skærm OG i fil 17:20 dansk: logokortet var rigtigt i forhåndsvisningen og forkert i PNG'en. Årsagen bekræftet i pakkens kode: html2canvas 1.4.1 KENDER IKKE `object-fit` — ordet findes ikke i pakken — og tegner `drawImage(hele billedet → hele boksen)`. **Portrættet var også ramt, men skjult:** rådgiverbillederne er kvadratiske og passer i en kvadratisk slot, så cover og stræk gav samme resultat; et medlem med et aflangt billede ville have set det. Det html2canvas HONORERER er `border-radius` og `overflow: hidden`. Så cover og contain regnes nu i px af en ren funktion (`src/components/hjemmebane/deling/billedTilpasning.ts`, testet i `__tests__/billedTilpasning.test.tsx`), og `<img>`-boksen ER det viste — rammen klipper. Samme geometri som `object-fit`, uændret skærm. **BEVIST PÅ SKÆRM 17:44 i begge formater.** tsc 0, 3352 tests. Ny fælde i DEL 4: en rettelse der virker på skærmen, kan være forkert i filen — og omvendt; begge skal ses.

**35. LIKE FRA FEEDET (#880, `87a03508`, 15:51:53) — mangellistens nr. 18 «Community-idéerne», trin 10.**

- **Hvorfor nu:** om otte dage præsenterer 10-15 nye sig, og femten præsentationer uden en reaktion er stilhed.
- **Reconen fandt at ALT fandtes:** `community_reaktioner` med constraints og unikke indekser, RLS, `saet_community_reaktion` som toggle, og feed-RPC'en leverer `antal_reaktioner` OG `jeg_har_reageret` pr. række. Tallet stod endda allerede i metalinjen. Kun knappen manglede. Ingen migration.
- **Det svære var rækken:** hele feedrækken var ét `<Link>`, og en `<button>` inde i et `<a>` er ugyldig DOM der navigerer ved klik. Nu sidder linket på TITLEN og strækkes over rækken, mens knappen ligger som søskende med `relative z-10` — over det strakte lag. Hele rækken klikkes stadig; hjertet navigerer ikke. Ingen `stopPropagation`. `LikeKnap` flyttet til egen fil (`community/LikeKnap.tsx`), så feed og trådside deler én. Ingen optimistisk UI (husets præcedens: tallet er databasens).
- **UDEN NOTIFIKATION, BEVIDST (Jonas 14/9):** den der bliver liket får ikke besked. Det kræver en ny edge-funktion, dedup-regler og en beslutning om fortrudte likes. Åbent punkt under kortet.
- **Feedet havde INGEN tests;** nu er der en (`community/__tests__/CommunityView.test.tsx`), og den låser at et klik på knappen ikke navigerer. tsc 0, 3358 tests.

**36. FUND 17 — GÆSTEFELTET GATER KUN NETVÆRKET. Kort nr. 13 omskrevet: en gæst skal møde en grænse, ikke en fejl (`recon-community-gate.md`, uden for repoet).**

- **Fem domme, uenige om NULL i `contract_end_date`:** `computeMembershipTier` svarer `no_date` (`membershipTier.ts:72`), og `useAuth.afgoerMedlemsTier` oversætter det til «full» (`useAuth.tsx:112-131`, bevidst: «legacy eller manuelt styrede virksomheder ser ud som fulde for deres egne brugere»; ingen række giver også «full», `:128`). `har_aktivt_medlemskab` — SQL bag 14 RLS-policies på community, indhold, events, storage og ca. 25 community-RPC'er — kræver `contract_end_date IS NOT NULL` (`20260907141500:56`). `is_membership_active` (Netværket, deltagerlister) siger true på NULL (`:70`). Resultatet: menuen viser Community, siden åbner, tjeklisten beder om en præsentation (`useOnboardingTjekliste.ts:158`) — og databasen afviser opslaget (INSERT-policyen `20260811160000:74-75`). `companies.status` og `contract_start_date` indgår i INGEN af dommene. Ét sted har set problemet og gatet lokalt på selve datoen: `BookSessionView.tsx:134-136`.
- **Fire manuelle genveje til tilstanden, ikke én:** importen kræver kun mail og navn selv om «Kontraktslut» har en stjerne (`HbAnsoegningsimport.tsx:187, :262`; `import-application:167-172` skriver null); Monday-vejen sætter aldrig datoer (`virksomhedsOprettelse.ts:29-38`) — en manuel invitation før betaling giver login uden slutdato; `EditCompanyDialog.tsx:109-110` gemmer tomt felt som null; og en `company_invitations`-række uden `company_id` får `handle_new_user` til at oprette en virksomhed med KUN et navn (`20260319101733:88-90`).
- **MÅLT I PROD 14/9 ca. 17:42 dansk:** TO virksomheder i tilstanden, begge med én bruger, oprettet 31/8 og 1/9. Navnene («X's virksomhed») er den form `handle_new_user` laver (`|| 's virksomhed'`, `20260319101733:65-70`) — altså den fjerde genvej. Det er de to gæster fra 2/9 (Alexander Lunds og Martin Larsens virksomheder, `20260902110000:82-90`), som også bærer mangellistens kort «To virksomheder uden slutdato rammer aldrig fornyelsesordningen».
- **JONAS 14/9: de to er GÆSTER, ikke medlemmer.** Gæstefeltet findes: kolonnen hedder `companies.vis_i_netvaerk` (false = gæst; formularens felt hedder `gaest`, `EditCompanyDialog.tsx:38-51, :95, :116`, etiketten «Gæst — har adgang til platformen, men vises ikke i Netværket», `:247`), migration `20260902110000_gaest_i_netvaerk` (kørt 2/9). De er allerede sat som gæster — derfor er de væk fra Netværket og /virksomheder. MEN kolonnen læses KUN af `get_member_directory` (kolonnekommentaren `:23`: «Laeses kun af get_member_directory») og indgår IKKE i `membershipTier` eller nogen adgangsdom. Den gater Netværket, intet andet.
- **JONAS' BESLUTNING 14/9: en gæst SKAL kunne se Community, men ikke skrive.** Adgangen er allerede næsten rigtig — SQL'en lukker for skrivning (og for læsning: SELECT-policyen kræver også `har_aktivt_medlemskab`, `20260811160000:66-69`; om gæsten i dag SER feedet, er derfor ikke givet — fladen er ikke målt for en gæst). Det der mangler er GRÆNSEN: i dag opdager hun det som en FEJL når hun trykker gem, ikke som en tydelig besked, og tjeklisten beder hende præsentere sig i et fællesskab hun ikke kan skrive i. Kort nr. 13 er omskrevet til det: ikke «fem domme skal blive enige», men «en gæst skal møde en grænse i stedet for en fejl» — med de fem uenige domme som den underliggende årsag. SELECT'erne til at se tilstanden står i reconen (ikke kørt herfra; Jonas' måling 17:42 er den der gælder).

**37. DAGSKVOTEN TALTE MAILS MEDLEMMET ALDRIG FIK (#882, `ee598862`, merget 17:55:51 UTC; edge-funktion, auto-udrullet ved merge). Klokkeslæt i UTC — aftenens notater var lokale.**

- **Målt i prod 17:38 UTC** (PR-teksten skriver 19:38 — lokalt; PR'en er merget 17:55:51 UTC, så målingen ligger før merge): køen havde ikke sendt noget i 216 minutter. Cron-vagten svarede 200 på hvert kald, nul fejl, nul timeouts. En funktion der kaldes, svarer 200 og ikke sender noget, er ikke en fejl — det er en gate der lukker. Vagten måler svar, ikke virkning; kun `email_send_log` kunne vise det.
- **Årsagen:** `MAX_EMAILS_PER_DAY` (5) talte rækker i `email_send_log` UANSET status — #857's `.neq("status", "rate_limited")` var den eneste undtagelse. Formiddagens fire eventmails plus to afvisninger på Lovables loft kl. 09:10 — FØR #857 blev udrullet 10:03, så de står som `failed`, ikke `rate_limited` — gav fem. Fem adresser var spærret resten af dagen efter kun TRE modtagne mails (5 rækker: sendt 3, failed 2): bsl@larsen.dk, caspar@brick-works.dk, marianne@mmoelgaard.com, peterjacobsen2000@yahoo.dk, rnl@larsen.dk. *RETTET 15/9 (DEL 2 «15. september» §10): prod HAR CHECK-constrainten `email_send_log_status_check`, og den kendte ikke `rate_limited` — `managedEmail.ts` log() blev afvist i tavshed, så et 429 har ALDRIG stået i loggen. Migrationen `20260915210000` tilføjer værdien (skrevet, ikke kørt).*
- **Dommen vendt om:** #857 undtog én fejlstatus ad gangen; den næste afvisning med en anden status ville æde kvoten igen. Nu tælles det der NÅEDE FREM: `KVOTE_STATUSSER = ["sent"]` (`_shared/dagskvote.ts:42`) i DB-filteret (`send-notification-email:310`) og `taelDagskvote` på rækkerne (`:312`) — dommen står ét sted, og kildeværnet (`mailFejl.guard.test.ts`) forbyder en lokal grænse i funktionen. Statusserne er kortlagt i filhovedet: `sent`, `failed`, `rate_limited`, `suppressed`, `bounced`/`complained` — og arven `pending`/`dlq` fra den gamle kø; testen (`dagskvote.test.ts`) dækker dem alle. *RETTET 15/9 (DEL 2 «15. september» §10): prod HAR CHECK-constrainten `email_send_log_status_check`, og den kendte ikke `rate_limited` — `managedEmail.ts` log() blev afvist i tavshed, så et 429 har ALDRIG stået i loggen. Migrationen `20260915210000` tilføjer værdien (skrevet, ikke kørt).*
- **Målt FØR udrulning — det der gjorde udrulningen forsvarlig:** 13 kandidater under 12 timer — 5 `chat_reply`, 5 `event_published`, 2 `member_message`, resten info — alle fra i dag. Ingen forældet mail ville gå ud, når gaten åbnede.
- **BEVIST I DRIFT:** cronens egen kørsel kort efter udrulningen sendte FIRE mails («sent»: 4). Målt 19:51 UTC: de fem spærrede står med 4 sendt og 2 failed — fire i kvoten, ikke seks. De har plads igen. (Notatet skriver «udrullet 19:47» — lokalt = 17:47 UTC, otte minutter før merge-tiden; auto-udrulningen ligger ved merge, klokkeslættet er læsemarkeringens i §38.) #857's egen 429-gren er stadig ubevist — den kræver et rigtigt 429 — men #882's gate er bevist på første kørsel.
- tsc 0, edge-auth 68/68, 3369 tests (225 filer).

**38. DE 587 GAMLE NOTIFIKATIONER ER MARKERET SOM LÆST — kørt i hånden 17:47 UTC.**

- **Målt 17:41 UTC:** 618 usendte notifikationer (`email_sent_at IS NULL`), hvoraf 587 ældre end et døgn — næsten alle rådgivernotifikationer: `report_committed` 229, `report_uploaded` 226, `pulse_checkin` 41, alle med priority «info».
- **BEKRÆFTET I KODEN:** info-filteret ligger på DATABASESIDEN af hentningen — `send-notification-email/index.ts:187` `.in("priority", ["action_required", "important"])` — så en info-række kommer aldrig ind i funktionen, og `selectNotificationEmails` ser den aldrig. De kunne aldrig være sendt; de fyldte kun i tællingen af «usendte».
- **JONAS 14/9: «Alt gammelt kan bare slettes. Vi er fuldt opdateret på platformen alligevel.»** Valgt form: markeret som LÆST (`read_at`) frem for slettet — samme effekt på kø og badge, men kan rulles tilbage. 587 rækker; 33 tilbage, alle fra i dag.
- **Det åbne:** writerne skriver videre (`send-slack-report-notification` skriver `pulse_checkin_received` med `priority: "info"`, `:263-274`; `report_committed` og `report_uploaded` ligeså), så info-rækker til rådgivere hober sig op igen — de kan aldrig mailes og vises kun i klokken. Nyt kort i mangellisten (Drift): enten skal de ikke skrives, eller også skal de ryddes af sig selv.

**39. IMPORTEN SKREV ALDRIG KONTAKTPERSONEN (#883, `719076a7`, merget 20:04:13 UTC) — fund 4 rettet i kode; SQL'en for de 35 står åben.**

- Kendt siden 2/9 (`20260902190000:22-27`: 35 af 39 med tom streng), aldrig rettet. Gennemkørslen 14/9 (§24) viste forskellen: Monday-vejen satte feltet («Gennem Kørsel»), importvejen ikke (Nordic By Hand, sat i hånden 10:14). Den 22. importeres ti til femten ansøgere ad importvejen.
- **Navnet bygges ét sted:** `bygKontaktperson(...dele)` i `src/lib/virksomhedsraekke.ts:132` (kanonisk) og spejlet i `_shared/virksomhedsraekke.ts:132` (paritetstestet); `byggVirksomhedsRaekke` skriver `contact_person: bygKontaktperson(input.contact_name)` (`:226`). Monday har fornavn og efternavn i hver sin kolonne (`mondayAnsoegning.ts`), importen et samlet navn — begge ender i samme funktion, så et tomt navn giver tom streng og ikke teksten «undefined». Kildeværnet (`contactPerson.guard.test.ts`) håndhæver at begge kaldere (`monday-webhook`, `import-application`) sender `contact_name` ind, så en tredje vej ikke kan glemme det. En genbrugt virksomhed får også navnet sat, ikke kun nye.
- **ÅBENT: SQL til de 35 eksisterende er SKREVET, IKKE KØRT** — med guard på at feltet stadig er tomt (`AND contact_person = ''`), så en rettelse i hånden aldrig overskrives. Køres i Lovables SQL editor; optælling før og efter.
- **RETTET 15/9 — SQL-TEKSTEN (vindue B's recon, `~/Downloads/recon-de-35-kontaktperson.md` §1b, §3, §5 — kun fund; ingen SQL kørt, prod ikke målt).** Teksten findes KUN i sessionsudskriften `~/.claude/projects/-Users-jonas-topix-financial/78e51945-2d58-4936-a2fb-56904a104e78.jsonl` linje 308 (14/9 19:59:07 UTC, chattens slutrapport) — ikke i PR #883/#885 (bodies og kommentarer), ikke i repoet, ikke i `~/Downloads`. Ordret, mærket **IKKE KØRT** — SELECT først:

  ```sql
  -- IKKE KØRT
  SELECT id, name, contact_person,
         application_context->>'contact_name' AS kontakt_i_ansoegning
  FROM public.companies
  WHERE status = 'active'
    AND coalesce(trim(contact_person), '') = ''
    AND coalesce(trim(application_context->>'contact_name'), '') <> ''
  ORDER BY name;
  ```

  UPDATE med guard på at feltet stadig er tomt:

  ```sql
  -- IKKE KØRT
  UPDATE public.companies
  SET contact_person = trim(application_context->>'contact_name')
  WHERE status = 'active'
    AND coalesce(trim(contact_person), '') = ''
    AND coalesce(trim(application_context->>'contact_name'), '') <> '';
  ```

  Kør SELECT'en igen bagefter; den skal give nul rækker. **Afvigelsen:** punktet ovenfor, DEL 3-rækken og mangellistens kort gengav guarden som `AND contact_person = ''`; den rigtige tekst bruger `coalesce(trim(contact_person), '') = ''` (rammer også NULL og blanke) og har to betingelser mere: `status = 'active'` og en ikke-tom `application_context->>'contact_name'` — som også er KILDEN til navnet (ingen profil, ingen ejer, ingen Monday-kolonne). Tallet 35 er målingen fra 2/9 kl. 20:10 (`20260902190000:22-30`: 35 tomme + 1 NULL + 3 udfyldte af 39); en ny optælling er ikke gjort. **Før UPDATE'en:** se en SELECT med navnet ved siden af `contact_email` og ejerens navn — kørslen ændrer mailtiltaler (næste punkt).
- **HVEM LÆSER FELTET (reconens §3, med fil:linje) — en udfyldt `contact_person` ændrer:** tiltalen i dag 0-mailen (`_shared/indgangsBetalingsmail.ts:190` — «Kære,» → «Kære <fornavn>,»), betalingspåmindelserne (`indgangs-paamindelser-cron:209`) og fornyelsesvarslerne (`fornyelsesvarsel-cron:199`, modtager `contact_email`); kontaktlinjen i rådgivermailen «mangler pris» (`_shared/indgangsBetalingsmail.ts:132-135`); og navnefeltets forudfyldning på signup (`lookup_invite_company_info` → `Auth.tsx:118-119`). Listen og virksomhedssiden viser den KUN når ingen owner med navn findes (`VirksomhedslisteView.tsx:243`, `VirksomhedView.tsx:1926`), men søgningen matcher den altid (`:268-276`). Invitationsmailen læser den ikke. **Skrivere:** kolonnens `DEFAULT ''` (`20260225104718:4`), rækkebyggeren siden #883, `monday-webhook` B5 (`:314-320`, kun ikke-tomme felter, eneste vej for en genbrugt virksomhed), `slet-medlemsdata-cron` (sætter null). Ingen frontend-dialog og ingen SQL-funktion skriver feltet.
- **KØRT 15/9 (kl. ca. 21:01–21:09 dansk) — i to trin, med tælling først (`query-results-export-2026-09-15_21-01-48.csv`): aktive 32, uden kontaktperson 26, kandidater fra ansøgningen 9 — tallet 35 var 2/9-målingen.** FØR var tom tekst (`''`) for alle 25, ikke NULL. **Trin 1:** de 9 fra `application_context->>'contact_name'`, begrænset til de 9 id'er, guard på tomt felt, én transaktion med tjek på præcis 9 (`…21-03-21.csv`: Booking Innovation → Ole Holdgaard, Brick Works ApS → Caspar Jensen Bennedsen, Rallysupport → Peter Holst Jacobsen, Rezycl.com → Peter Hyldgaard, Studio Mini ApS → Louise Bomhoff, Topix.dk ApS → Jonas Herlev, TuaMea Jewelry → Marianne Mølgaard, Warburg VVS & Kloak Ekspres ApS → Christina Warburg, YKRG APS → Yasin Kara); målt efter (`…21-04-21.csv`): aktive 32, tomme 17, kandidater 0. **Trin 2:** 16 fra ejerens profilnavn (Jonas' valg A 15/9), navnene låst som VALUES, samme værn med tjek på præcis 16 (`…21-07-42.csv`: Alexander Lunds virksomhed, ANLA GLAS A/S, Bastant Design, BR Roset, BRILLEVÆRK, Capture IT A/S, Doggybed, Fjeldgaardshop.dk, Floren Engros, Homie Håndværkerservice ApS, KJ AUTO OG MIKROMAKKER, Limo Group, Livja, Martin Larsens virksomhed, remm., TOFT ADMINISTRATION ApS); målt efter (`…21-08-39.csv`): de 16 med navn, aktive 32, uden kontaktperson 1. **CARMA STUDIO bevidst uden:** tidligere medlem (Jonas 15/9); kontaktpersonen er Camilla Risager (Jonas 15/9), IKKE skrevet, fordi huset tømmer personfelter på tidligere medlemmer (`slet-medlemsdata-cron`, køreplanen for de syv tidligere) — se DEL 2 «15. september» §13. Kørslen ændrede mailtiltalerne for de 25 fra og med næste mail (dag 0/påmindelser/fornyelsesvarsler) og signup-forudfyldningen. Mangellistens kort n14-4 LUKKET (bliver stående). *RETTET 15/9 (§14): CARMA STUDIO er et UDLØBET medlem i forlængelsesvinduet (`udloebet_tilbyd`, dag 4 af 14 den 15/9), ikke et tidligere medlem; præmissen «huset tømmer personfelter på tidligere medlemmer» gælder ikke her. Camilla Risager (Jonas 15/9) skal skrives som `contact_person` — ikke gjort endnu, ÅBENT.*
- tsc 0, edge-auth 68/68, 3420 tests (227 filer).

**40. KLOKKEN: RÅ HTML, EN JSON-MUR OG KNAPPEN I BUNDEN (#884, `a417618b`, merget 20:10:24 UTC; frontend + edge-funktion — frontend kræver Update-klik). Mangellistens to klokke-kort fra 11/9 lukket.**

- **Set på skærm 17:43 UTC:** en besked fra et medlem viste ORDRET «<p>Hej Jonas, </p><p>Jo, det virkede ok! :-)<br>Når forretningen er så lille som her (går også ud fr…» — taggene som tekst. En besked uden formatering (Dans) så ren ud: chatten sender Tiptap-HTML (`ChatRichInput.tsx:305-310`: `getHTML()`, medmindre beskeden er ren tekst), så det ramte hver gang nogen brugte afsnit eller linjeskift.
- **Uddraget dannes i edge-funktionen, ikke i fladen:** `send-slack-chat-notification/index.ts:126` klippede de første 250 tegn af rå `content` og skrev dem til `advisor_notifications.body`, `notifications.body` OG Slack. Nu går det gennem `renTekst` FØR klippet (tags væk, afsnit og `<br>` til mellemrum, entiteter oversat, whitespace normaliseret). Strippen bor i `src/lib/hjemmebane/richtext.ts` (husets richtext-håndtering; `hasRichTextContent` bruger den nu) og er SPEJLET i `_shared/richtext.ts` — ren funktion uden DOM, fordi Deno ikke har `DOMParser`; pariteten låst i `richtext.test.ts` (ni tilfælde) med kildeværn på at funktionen danner `preview` af `renTekst`. Klokken (`klokke.ts` `klokkeTekst`) renser desuden selv, så rækker der allerede ligger med tags, vises rent uden migration.
- **JSON-muren havde TO lag:** vagten skriver `'… Tallene: ' || v_tal::text` i `body` (`20260910170000:368`, tredive nøgler), OG klokkens `line-clamp-2` var dødt — `block` stod ved siden af, og Tailwinds display-utility ligger EFTER lineClamp i stylesheetet (3.4.17: `corePluginList` lineClamp 20, display 21), så `block` overskrev `display: -webkit-box`. Nu: `driftTitel` skriver svarkoderne som forsidens linje («3 × 500, 1 × intet svar», 200 udelades), `driftTekst` beholder tiden og udelader JSON'en («Tallene står i cron_vagt_log»), `block` er væk. Tallene er ikke tabt: de står i rækken og i `cron_vagt_log`. **Vagten selv (plpgsql) er BEVIDST ikke rørt** — det ville være syvende version af en 350-linjers funktion, deployet i hånden; foreslået form, hvis den skal rettes ved kilden: titel med koderne som «3 × 500», body «Cron-vagten kl. HH:MM · tallene står i cron_vagt_log».
- **«Markér alle som læst»** lå nederst — med mange linjer skulle man scrolle forbi alt for at nå den, og det er netop dér man vil bruge den. Nu øverst, før listen.
- **Klokken havde INGEN tests; nu har den** (`HbKlokke.test.tsx`): rå HTML vises aldrig som tekst, drift uden JSON, tekst-spannet har `line-clamp-2` og ikke `block`, knappen ligger før listen i DOM'en (`compareDocumentPosition`) og kalder `markAllRead`, ingen knap hos medlemmet. Plus `klokke.test.ts` og `richtext.test.ts`. tsc 0, edge-auth 68/68, 3420 tests (227 filer).
- **Ikke rørt:** de gamle skaller (`NotificationCenter`, `AdvisorNotifications`) viser stadig `body` råt; og «En chatbesked i klokken åbner indbakken, ikke samtalen» (kort fra 11/9) står — `raadgiverSti` giver stadig `/chat`.

**41. STRIPE-MIGRERINGEN ER I GANG — kundekopien og de to flyttet i hånden (14/9 aften; Stripe Dashboard, ingen PR). Klokkeslæt i UTC — notatets 22:39 og 23:05 var lokale (klokken var 21:20 UTC da notatet kom).**

- **Rammen:** gammel konto Topix.dk `acct_1QP3Js4DoYItGRbI` (opsat via Circle: `application: ca_GF3jRjjC9o8Ueg72EKCED0GM7oofFHYF`, `application_fee_percent: 0.5`, `controller.type: "application"`, migration-recon §11) → ny konto The Boardroom `acct_1U6mzp3CvBmCx5Pt`. Piloten doggybed flyttet 2/9 (§22), trak korrekt 13/9 (`in_1UF8tR3CvBmCx5PthFjFOjFc`, 4.375 kr., DEL 2 «13. september» §1). **MÅLT 14/9 kl. 19:00: 15 aktive abonnementer på den gamle.** To i sidste periode — PHILBERT (29/9) og Pro-Vision (21/9) — FORNYS frem for at flyttes (som Studio Mini og CARMA før dem, mangellistens kort). 13 skal flyttes.
- **Kundekopi — trin 1 og 2 i husets rækkefølge (migration-recon §24):** 13 kunder kopieret med Stripes «Copy customers», CSV uden overskrift (§21). ALLE 13 fik betalingsmiddel med — bekræftet på hver enkelt, ikke sluttet fra doggybed. **Det ubekendte fra 1/9 er besvaret:** Launch Labs betalingsmiddel var type `link` (ikke et kort gemt VIA Link som doggybeds, §20); Stripes dokumentation svarede ikke entydigt på om Link-pm'er kopierer. MÅLT: kopieret rent, nyt pm-id på den nye konto, type `link` bevaret.
- **De 13 er BLANDEDE, og det er fundet i sig selv:** Livja havde TO kopier af samme kort (samme fingerprint — én med adresse, én uden; kundens default og abonnementets default kopieres hver for sig). Fjeldgaardshop havde BÅDE et kort med `wallet.link` OG en ren link-pm. Man kan ikke slutte fra én kunde til de andre — hver kunde skal ses. Ny fælde i DEL 4.
- **Livja flyttet helt igennem** (`cus_T44oqJhzxlpPCf`, company `5d7fb0a3-7ffa-467f-ad24-b3145961a0a6`): ny subscription schedule `sub_sched_1UFgaM3CvBmCx5PtcDTnN0a1`, start 16/9, slut 15/12, pris `nyt_40000_rate12`, `proration_behavior: none`, metadata `art`/`company_id`/`migreret_fra`/`migreret_dato` (formen fra §22). Gammelt `sub_1S7wf34DoYItGRbIRwtynK9h` ANNULLERET 20:39 UTC (immediately, ingen refusion) — trin 5.
- **Fjeldgaardshop flyttet helt igennem** (`cus_UAcxhBRUM4CJzw`, company `95657412-41e1-4576-8ace-59d526c14ef2`): `sub_sched_1UFglk3CvBmCx5PtDaQdoS3D`, start 18/9, slut 17/3-2027. Gammelt `sub_1TCHhb…` annulleret.
- **Bemærk formen:** de to er subscription SCHEDULES (`sub_sched_…`), ikke rå abonnementer som piloten (`sub_1UB6wE…`). Webhookens hvidliste (#563) springer alt med en `art` over; om `customer.subscription.created` for et schedule-født abonnement bærer `metadata.art` på samme måde, er ikke målt herfra — det ses i Workbench → Event deliveries ved første træk 16/9.

**42. TÆLLINGEN ER REGLEN, IKKE DATOEN — og Billing Migration Toolkit: ti oprettet 21:05 UTC.**

- **Jonas 14/9: «Der skal være 12 træk i alt.»** Det gamle abonnements `cancel_at` er IKKE pålideligt som mål for hvor mange træk der er tilbage: Fjeldgaardshops stod til 15/5-2027, hvilket ville have givet 15 træk. MÅLT på fakturaer: hun havde betalt 6 — altså 6 tilbage, slut 17/3-2027. Livja: 9 betalte, 3 tilbage — fakturanumrene springer fra 0004 til 0008 (fire måneders pause december–april), så 12 træk fordeler sig over 15 måneder. Reglen: tæl de betalte fakturaer, træk fra 12, sæt ophøret derefter. Ny fælde i DEL 4.
- **Jonas' rettelse om slutdatoen:** sidste træk dækker en måned FREM, så abonnementet slutter en måned EFTER sidste træk — ikke dagen efter. (Livja: sidste træk 16/11, slut 15/12.)
- **Billing Migration Toolkit — fundet og brugt.** Stripe har et værktøj til netop Stripe-til-Stripe-migrering: Dashboard → Subscriptions → Migrations. CSV-upload, validering før oprettelse, ingen kode. To fund ved brug: **(a) `cancel_at` findes IKKE som kolonne og droppes TAVST** — kun `cancel_at_period_end` (boolean) findes. Første forsøg havde `cancel_at` med; valideringen klagede ikke, men kolonnen var væk i den validerede fil. Uden ophør ville abonnementerne trække for evigt. Ny fælde i DEL 4. **(b) `start_date` skal være mindst 24 timer ude:** Launch Lab (træk 15/9) blev afvist af netop den regel — samme regel som husets egen fra 1/9 (§5: migrér ikke tæt på et træk). `metadata.`-kolonner understøttes (bliver til `metadata_art` osv. i eksporten).
- **Ti oprettet via toolkit 21:05 UTC:** migration `bm*AaCht0C6BwAAAKvS`, 10 af 10 valideret, 10 af 10 planlagt. Jonas satte `cancel_at` på alle ti bagefter i hånden (pga. (a)). **MÅLT EFTER:** alle ti har end_date sat, og antallet af træk er korrekt (tællingen ovenfor).
- **TIDSZONEN:** end_date og start_date står kl. 22:00 UTC = midnat dansk. De NYE abonnementer trækker altså ved midnat dansk på trækdagen, mens de GAMLE trækker senere samme dag (fx YKRG kl. 13:30). Konsekvens: de gamle skal annulleres FØR den 20/9 — ikke bare «inden næste træk» — ellers trækker begge samme dag. Ny fælde i DEL 4.
- **VINDUE:** migreringen kan rulles tilbage fra Dashboard indtil 20/9 kl. 01:57 dansk (19/9 23:57 UTC). Derefter er de ti live.

**43. IKKE GJORT — SKAL GØRES; og to fund om mails og data.**

- **De ti gamle abonnementer er IKKE annulleret.** Frist: FØR 20/9 (§42, tidszonen). Jonas 14/9: gøres i morgen med friske øjne, fordi en annullering ikke kan rulles tilbage, mens de nye stadig kan (vinduet til 19/9 23:57 UTC). Rækkefølgen er husets egen (§24 trin 5: annullér det gamle SIDST) og Stripes (fornyelseskæden §8: «de gamle annulleres FØRST derefter — og før de trækker igen»).
- **Launch Lab er ikke flyttet.** Hun trækker 15/9 på den GAMLE konto som planlagt (24-timers-reglen); flyttes bagefter. Så bliver det 13 af 13.
- **`companies.stripe_customer_id` er ikke skrevet for nogen af de tolv.** Notatet kalder det «skridt 6 i husets tjekliste» — husets rækkefølge i §24 har fem trin og nævner det ikke; det står som «Kobling til `companies.id`» i §16 og som mangellistens kort «Platformen kan ikke se hvem der betaler» (27 aktive med NUL, målt 10/9; doggybed stadig NULL 13/9). Kunde-id'erne BEVARES ved kopi (fornyelseskæden §8 trin 1), så koblingen er kendt pr. virksomhed nu — det er SQL i hånden, ikke kode.
- **FUND 19 — MAILS VED MIGRERING.** Den gamle konto sender INGEN mail ved annullering — der findes ingen cancellation-indstilling. Men «Send emails about upcoming renewals» er TIL med 7 dages varsel, så medlemmer kan have fået varsel om et træk der i stedet kommer fra den nye konto (Livja 16/9, Fjeldgaardshop 18/9 — varslet gik ud fra den gamle før annulleringen). Den NYE konto har både trial- og fornyelsesvarsler SLUKKET. Ingen dobbeltvarsler — men også intet varsel før et træk på 4.375 kr. **ÅBENT (nyt kort): er det et valg eller en forglemmelse?** Huset har sine egne varsler for FORNYELSE (varsel 1 og 2, fornyelseskæden) — ikke for et månedstræk.
- **FUND 20 — DATAGRUNDLAGET.** Jonas leverede et Excel-udtræk med alle 27 aktive virksomheder (Monday-boardet «Ansøgninger»). Felterne «Startdato» og «Samlet betaling (historisk)» gjorde det muligt at regne antal træk uden fakturaopslag. KJ AUTO, Warburg og Capture IT er på ANDET år — KJ AUTO på `fornyelse_15000_rate12` (1.312,50/md.), bekræftet af `companies.indgangspris_oere` = 30.000 (som migration-recon §14 forudsagde: kuponen `TB2026V2` svarer til fornyelsesprisen). **Tre af de elleve har ANDEN mail i platformen end i Stripe:** BR Roset RNL@ (platform) mod bsl@ (Stripe), Homie thomas@ mod nicolai@, Two Socks simon@two-socks.com mod simon@simonfrimann.dk. Et opslag på mail alene finder dem ikke — koblingen skal gå på kunde-id eller CVR (Stripe-kunderne bærer CVR, §9). Nyt kort. **BR Roset har kontrakt 3/5-2026 → 3/3-2027, altså TI måneder, ikke tolv.** Ikke afklaret — om det er en tastefejl i platformen, en aftale, eller ti rater. Nyt kort.

**44. JONAS' BESLUTNING: TRÆKHISTORIKKEN FRA DEN GAMLE KONTO SKAL IND I `company_traek` — før kontoen lukkes. Recon lavet, intet bygget.**

- **Beslutningen:** historikken skal stå under virksomhedens træk, «fra medlemskabets start», med beløb, dato og fakturanummer. Skal gøres FØR den gamle konto lukkes — data kan ikke hentes bagefter. Livja har ni betalinger (39.375 kr.) der kun står ét sted nu; `company_traek` starter først i september 2026.
- **Reconen** (`~/Downloads/recon-traekhistorik.md`, uden for repoet — kun fund, ingen kode) fandt: tabellen KAN bære det — `beloeb_oere` (inkl. moms), `betalt_at`/`periode_start`, `faktura_nummer`, og fladerne viser alle tre (`VirksomhedView.tsx:1746-1750`, `indstillinger.ts:174-178`); påkrævet er `company_id`, `stripe_subscription_id`, `stripe_invoice_id`, `beloeb_oere`, `status` (kun `betalt`/`fejlet` — CHECK `20260903150000:60`); UNIQUE på `stripe_invoice_id` (`:59`) gør en import idempotent, forudsat de gamle fakturaers RIGTIGE `in_…4DoYItGRbI…`-id'er bruges. Kun `stripe-webhook` skriver i tabellen (`index.ts:360-456`), og RLS giver klienter kun SELECT — en import er service_role: SQL i Lovables editor eller en ny Bucket B-funktion. **Platformen kan IKKE tale med den gamle konto:** én `STRIPE_SECRET_KEY`, den nye siden 1/9; kontoen er Connect-styret af Circle, og om Topix.dk kan udstede en nøgle på den, står ingen steder. Koblingen gammelt `sub_…` → `companies.id` findes kun i migration-reconens tabel (§13) og i de nye abonnementers `metadata.migreret_fra`. Tre veje er beskrevet uden anbefaling: SQL fra et Stripe-udtræk kørt i hånden; en edge-funktion med en nøgle til den gamle konto; og alternativerne (genskab på ny konto som paid_out_of_band — webhooken springer fakturaer uden abonnement over; egen historik-tabel — fladerne læser kun `company_traek`). `art`: de nye træk får `migreret` fra abonnementets metadata; samme ord for den gamle kontos historik ville gøre de to uskelnelige uden id-præfikset — ingen flade viser `art` for træk i dag, så en ny værdi brækker intet og vises heller ikke. Faldgruber: `beloeb_oere` er INKL. moms (gamle fakturaers `total`, ikke `subtotal`); `hosted_invoice_url` dør med kontoen; refusioner ses ikke i `total`; `periode_start` skal med (fladerne sorterer på den).
- Nyt kort på mangellisten (Betaling og fornyelse), DEL 3-række.

**45. 15/9 NAT — PODCASTEN UD AF PLATFORMEN (#888, `130c366f`, merget 14/9 22:24:57 UTC = 00:24 dansk 15/9; ren frontend — KRÆVER Update-klik, ikke bevist på skærm). Mangellistens nr. 10 af 18 lukket.**

- **Beslutning 17 fra 11/9 er gennemført.** Menupunktet «Podcast & Talks» og hele `PodcastTalksView` (`src/components/hjemmebane/podcasttalks/PodcastTalksView.tsx`, 352 linjer) er slettet; ruten er væk (`App.tsx`, `pages/PodcastTalks.tsx` slettet, `hbNav.ts` uden `podcastTalks`).
- **Tilbage: ét Spotify-tekstlink nederst i `HbSidebar`** — «Lyt til Iværksætterlivet på Spotify», eksternt link i ny fane (`target="_blank" rel="noopener noreferrer"`), IKKE en `HbNavEntry` (skallen har intet mønster for eksterne menupunkter). `HbMemberShell` giver det kun til medlemmer og abonnenter — ikke rådgivere. URL'en som konstant ét sted: `lib/hjemmebane/podcastSpotify.ts` (`PODCAST_SPOTIFY_URL` = `https://open.spotify.com/show/4T8krtMFTkRgF21bkNsQ6Q`, uden `?si=`; `PODCAST_SPOTIFY_TEKST`).
- **Den låste menu-test (`hbNav.test.ts`) opdateret med vilje**; ny `HbSidebar.test.tsx` (63 linjer); `ankomst.test.ts` rettet; designsprogets tabel (`docs/hjemmebane-designsprog.md`) opdateret. 13 filer, +175/−399. tsc 0, 3441 tests (228 filer).
- **IKKE med i #888 — står stadig på main (målt 15/9):** forsidens podcastkort (`BoardroomView.tsx` `PodcastCard` :740, `podcastQuery` :1470), `src/lib/hjemmebane/podcastRss.ts` + `podcastRss.test.ts`, og `supabase/functions/podcast-rss` (`config.toml:102`). Kortets recon (del C) havde dem med i listen; de er ikke rørt. Noteret i det lukkede kort, ikke som nyt kort.
- Mangellisten: nr. 10 lukket (bliver stående), Rækkefølgens linje rettet; 161 kort (160 + skabelonen), 13 lukkede.

**46. DE TYVE FØR 22/9 — Jonas bad om en prioritering 15/9 kl. 00:30, lavet ud fra det fulde udtræk af mangellisten (161 kort, 148 åbne; `~/Downloads/mangelliste-overblik.md`). Rækkefølgen er chattens vurdering; kortene selv er uændrede.**

- **Frist der ikke kan flyttes:** **(1)** annullér de ti gamle Stripe-abonnementer FØR 20/9 (§42–§43: de nye trækker ved midnat dansk, rollback-vinduet lukker 19/9 23:57 UTC). **(2)** Afklar BR Rosets ti måneder FØR hendes gamle annulleres (fund 20). **(3)** Flyt Launch Lab efter trækket 15/9 (24-timers-reglen). **(4)** Ryd Studio Minis tilbyd-række før 20/9 (ellers lukker vinduet den selv).
- **Rammer de 10–15 nye:** **(5)** fanout'en — én mail i stedet for mange; dækker både events (fund 7, mailloftet) og fund H's præsentationer. **(6)** De tre instrukser der ikke er kode (F: send juni–august først; I: importvejen ikke til webinar-ansøgerne; J: e-mailkolonnen før «Godkendt»). **(7)** Kør SQL'en for de 35 uden `contact_person` (§39; skrevet, ikke kørt). **(8)** `sikrIndgangsInvitation` kender ikke «allerede accepteret». **(9)** Tjeklisten 0 af 7 ad Monday-vejen (website sættes ikke). **(10)** Gæsten møder en fejl i Community, ikke en grænse (fund 17). **(11)** Fund K, link-preview'et — delingen er i drift nu, så app-linket bliver delt. **(12)** Fakturateksten lyver om tidspunktet (midnat til kl. 10 på dag 31).
- **Rydder op efter 14/9:** **(13)** ryd Monday-boardets fire døde webhooks — betingelsen («kæden bevist på et rigtigt Godkendt») er opfyldt af gennemkørslen §24. **(14)** Skriv `stripe_customer_id` for de tretten (kunde-id'erne kendes, §43). **(15)** Bevis delingspunktet med et medlem efter grænsen (#886, tjeklistepunktet). **(16)** Skriv til Virk om CVR-nøglen (fund 6, besluttet).
- **Indhold og små huller:** **(17)** beskrivelser på de 13 kurser (nr. 15 af 18). **(18)** Profilens præsentationsudkast med eksempler (nr. 9 af 18). **(19)** Events mangler lokation. **(20)** Notifikation ved like (Jonas 14/9: uden, bevidst — står som åbent punkt).
- **BEVIDST UDE:** PHILBERTs filer (kræver filerne), affiliate og trækhistorikken (store, efter 22/9), de 19 faldet-ud (samtale, ikke kode), mobil-mønsteret.
- **NÅR HAN KUN NÅR FEM: 1, 2, 5, 6, 7.**

**47. DE SEKS IDÉER FØR 22/9 — Jonas bad 15/9 kl. 01:00 om en prioritering af idéerne (mangellistens `data-status="ide"`, 31 kort) før webinaret. Står ved siden af de tyve (§46), så begge kan læses i morgen. En vurdering, ikke en måling; kortene selv er uændrede.**

- **Kriteriet:** kan idéen kun gøres NU, eller bliver den bedre af at de 10–15 ankommer samtidig? Det der kan gøres om tre måneder uden tab, står ikke her.
- **(1) «De første 30 dage» — målingen.** Den ENESTE der kun kan gøres FØR webinaret. Rytmen dag 0–21 er bygget (#759, #761, #766, #780, #790), men der er intet nulpunkt. Ankommer femten uden at det er sat, kan spørgsmålet «virkede rytmen» aldrig besvares. En times arbejde at beslutte hvad der tælles.
- **(2) Peer-matching, manuel form.** «Foreslå intro» som rådgiverhandling på virksomhedssiden, ingen algoritme (kortets egen «bedre form nu»). Femten nye på samme tid er det øjeblik hvor det giver mest; om tre måneder er de faldet til ro hver for sig.
- **(3) Tom-tilstandene bevist PÅ SKÆRM.** Reconen 14/9 sagde at Nøgletal, Budget og Rapportering er rene, men det var en kodelæsning. Log ind som et medlem uden tal og se efter. Holder det, lukkes kortet (nr. 7 af 18).
- **(4) Video-rating med ét tryk i Akademiet.** `member_progress.acknowledged_at` findes allerede, så det er en knap og en kolonne. Femten nye ser lektionerne i deres første uge — den eneste gang så mange svar kommer så hurtigt. I dag vides ikke hvilke af de tretten kurser der virker.
- **(5) «Online nu» på rådgiverne.** Grunden er ikke teknik, det er tomhed: et nyt medlem der ser et stille rum, tror ikke der sker noget.
- **(6) Henvis til et tal i chatten, FROSSEN udgave** (kortet siger selv at frosset er det billige — et snapshot i `context_meta`). Femten der uploader deres første regnskab giver spørgsmål om konkrete tal; i dag skrives tallet af i hånden.
- **DROPPES FØRST hvis tiden går: 6, derefter 5.** De fire første kan ikke gøres om bagefter.
- **BEVIDST UDE og hvorfor:** affiliate og direkte regnskabsintegration er for store; «Ugens nyheder med auto-tråd» bygger på en digest der er slukket (11/9); idébanken, gamification, à la carte og Rådgiver-MCP gør intet for de femten i deres første uge.

### 15. september — migreringen er færdig, 13 af 13 (Stripe Dashboard, ingen PR); YKRG's åbne junifaktura voidet og erstattet i e-conomic; BR Rosets «ti måneder» var en forkert startdato — fund 20 lukket; Launch Lab er platformens «remm.»; målt før første træk på den nye konto; den gamle konto før den lukkes; tre rettelser til overleveringen

Kilder: Stripe via MCP (begge konti, livemode) læst af chatten 15/9; prod-SQL kørt af Jonas 15/9 (`query-results-export-2026-09-15_17-30-30.csv`, `query-results-export-2026-09-15_17-31-28.csv`); Stripe Dashboard (annulleringerne, voiden og Launch Labs schedule — Jonas); Stripes dokumentation og API-beskrivelser hvor det står. Klokkeslæt er dansk tid og står som «dansk»; UTC står som UTC. Det der er VURDERING eller IKKE MÅLT, står som det.

**1. MIGRERINGEN ER FÆRDIG — 13 AF 13. De elleve gamle abonnementer på Topix.dk (`acct_1QP3Js4DoYItGRbI`) er annulleret 15/9.**

- **Gjort af Jonas i Dashboard 15/9, alle «Immediately» + «No refund», i fristrækkefølge.** Efter hver annullering er målt: status `canceled`, det gamle schedule annulleret i samme sekund, ingen ny faktura, kundesaldo 0 — samme form som forlægget (Livjas annullering 14/9, målt 15/9).

| Stripe-navn | gammelt abonnement | ended_at (15/9, dansk) | nyt schedule på The Boardroom | nyt start (dansk) | nye træk | talt |
|---|---|---|---|---|---|---|
| KJ AUTO (Per Sørig Jensen) | `sub_1TZ6sv4DoYItGRbI3DQF4e3f` | 17:05:04 | `sub_sched_1UFh3q3CvBmCx5PtyQuA8d2U` | 20/9 00:00 | 8 | 16 fakturaer udstedt på kunden (stemmer med 12 første år + 4) — ikke talt på betalte |
| Homie Håndværkerservice ApS | `sub_1TZ9gh4DoYItGRbIes9Lyl9d` | 17:07:09 | `sub_sched_1UFh3q3CvBmCx5Pt7c5jiH9e` | 20/9 00:00 | 8 | 4 betalte (KBIYKMD1-0002–0005); 0001 voidet 20/5 — et afbrudt checkout-forsøg på et andet abonnement (`sub_1TZ9ew4DoYItGRbI6pcFmbte`) |
| Two Socks («TS Warehuose») | `sub_1T4yFu4DoYItGRbIUtGiRrKG` | 17:08:15 | `sub_sched_1UFh3o3CvBmCx5PtFlCw3t7s` | 26/9 00:00 | 5 | 7 udstedt |
| WESDEX | `sub_1SuvT94DoYItGRbIkkFGzupi` | 17:12:49 | `sub_sched_1UFh3p3CvBmCx5PtqLUBKVBi` | 29/9 00:00 | 4 | 8 udstedt |
| YKRG («Tapas@tapasamor.dk») | `sub_1TRWKT4DoYItGRbIMpzVvibR` | 17:22:42 | `sub_sched_1UFh3r3CvBmCx5PtPUX1htiv` | 29/9 00:00 | 7 | 4 betalte + juni i e-conomic (§2) |
| TuaMea Jewelry ApS | `sub_1SwW1V4DoYItGRbIaSXlovXH` | 17:24:11 | `sub_sched_1UFh3o3CvBmCx5PtZIpo2zbY` | 3/10 00:00 | 4 | 8 udstedt |
| Floren engros | `sub_1T6qX54DoYItGRbI3PXeOP3G` | 17:25:11 | `sub_sched_1UFh3q3CvBmCx5Pt5o7oR9AD` | 3/10 00:00 | 5 | 7 udstedt |
| BR Roset | `sub_1T6wlH4DoYItGRbI7Vw8OJbN` | 17:25:54 | `sub_sched_1UFh3p3CvBmCx5PtYNcGYVVL` | 3/10 00:00 | 5 | 7 betalte (686P23XT-0001–0007) |
| Brick Works ApS | `sub_1TJTJC4DoYItGRbIylBR1pIq` | 17:26:46 | `sub_sched_1UFh3o3CvBmCx5PtuA2JixWJ` | 7/10 00:00 | 6 | 6 udstedt |
| ANLA A/S | `sub_1TUOmK4DoYItGRbIiVKojDEK` | 17:27:42 | `sub_sched_1UFh3o3CvBmCx5PtIW1EgsFe` | 7/10 00:00 | 7 | 5 udstedt |
| Launch Lab ApS | `sub_1TiTS94DoYItGRbItgCb6fhu` | 17:37:33 | `sub_sched_1UFyOj3CvBmCx5Pta4mZHhFA` | 15/10 00:00 | 8 | 4 betalte (B0SIZONV-0001–0004) |

- **«Udstedt» = kundens `next_invoice_sequence` − 1:** fakturaer på kunden, ikke betalte. Hver af dem stemmer med oprettelsesdato + månedlige træk.
- **Sweep bagefter:** Topix.dk har TO aktive tilbage, begge med `cancel_at` = periodens slut: 21/9 kl. 18:33 og 29/9 kl. 11:02 dansk. Datoerne passer med Pro-Vision og PHILBERT, men kundenavnene er IKKE læst; de fornys og flyttes ikke. The Boardroom (`acct_1U6mzp3CvBmCx5Pt`) har 13 schedules, alle `not_started`, ingen annulleret eller frigivet.
- **Rollback-vinduet (19/9 23:57 UTC) bruges ikke.**

**2. YKRG — EN ÅBEN FAKTURA, VOIDET OG ERSTATTET I E-CONOMIC.**

- **Fundet før annulleringen:** `UVXL7LPI-0003` (`in_1TndPW4DoYItGRbImwCneZ3j`), juni-raten 29/6–29/7-2026, 5.468,75 kr. inkl. moms (4.375 + 1.093,75), 0 betalt, 9 forsøg, ingen flere planlagt. Hendes øvrige: 0001 29/4 (1 forsøg), 0002 betalt 31/5 (2 forsøg), 0004 betalt 10/8 (8 forsøg), 0005 betalt 10/9 (7 forsøg).
- **Stripes dokumentation:** en annullering stopper den automatiske opkrævning af abonnementets åbne fakturaer, men lukker dem ikke — de kan stadig betales. Ny fælde i DEL 4.
- **Jonas' valg:** annullér som de andre; juni sendt som manuel faktura i e-conomic 15/9. Så den ikke kan betales to gange, er Stripe-fakturaen voidet kl. 17:18:09 dansk med intern note om erstatningen. Void og ikke uncollectible: en voidet faktura kan ikke betales, en uncollectible kan og bogføres som tab (Stripes status-overgange). Fakturaen havde tom metadata, mens de betalte bærer e-conomic-integrationens fejllog fra betalingsflowet — den er formentlig aldrig bogført fra Stripe.
- **ÅBENT, ikke kode:** bogholderen skal have besked om, at `UVXL7LPI-0003` er voidet og erstattet. Nyt kort («Åbne fakturaer på den gamle konto …»), DEL 3-række.
- **Tælling:** 4 betalte + juni (e-conomic) + 7 nye = 12. Voiden rørte ikke abonnementet.
- **Undervejs så YKRG «ikke oprettet» ud på den nye konto:** et `not_started` schedule har intet abonnement-objekt, og kunden hedder efter mailen («Tapas@tapasamor.dk»). Hun blev målt til stede og set af Jonas under kunden. Ny fælde i DEL 4.
- **VURDERING, ikke måling:** tre af hendes fire træk krævede 2–8 forsøg, så første træk 29/9 kl. 00:00 dansk fejler sandsynligvis første gang — i så fald det første rigtige `invoice.payment_failed` og dermed beviset for #815's klokke. «Beviser der udestår», DEL 3-række.

**3. BR ROSET — FUND 20 LUKKET. «Ti måneder» var en forkert startdato i platformen, ikke ti rater.**

- **Stripe:** 7 betalte (686P23XT-0001–0007), første (`subscription_create`) 3/3-2026, gammelt `cancel_at` 3/3-2027 = 12 træk; nyt schedule 5 træk, så 7 + 5 = 12.
- **Jonas bekræftede 15/9 start 3/3-2026 og rettede `contract_start_date` i platformen** (vejen er ikke oplyst). MÅLT i SQL (`query-results-export-2026-09-15_17-30-30.csv`): `contract_start_date` 2026-03-03, `contract_end_date` 2027-03-03, `status` active, `stripe_customer_id` tom.
- Platformens 3/5 var altså en forkert startdato — ikke ti rater. Kortet lukket (bliver stående); DEL 3-rækken lukket.

**4. LAUNCH LAB ER PLATFORMENS «remm.».**

- **SQL på `companies.name ILIKE '%launch%'` gav NUL rækker** — chattens antagelse om navnet holdt ikke. SQL på `daniel@launchlab.dk` via `auth.users` → `company_members` samt `company_invitations` (`query-results-export-2026-09-15_17-31-28.csv`): remm. (`9f00e582-1050-4d47-ba8f-221e75e72fab`), `daniel@launchlab.dk` owner og invitation, kontrakt 2026-06-15 → 2027-06-15, active. Stripe-kunden er Launch Lab ApS (`cus_UhtEkpmNL8TlrN`, `eu_vat` DK44921952). Datoerne matcher Stripes første træk 15/6-2026 og det gamle `cancel_at` 15/6-2027. Ny fælde i DEL 4 (et navn er ikke en nøgle).
- **Trækket 15/9 på den gamle konto er betalt kl. 08:53 dansk** (B0SIZONV-0004, 5.468,75 kr.); 4 betalte, 8 tilbage.
- **Nyt schedule lavet i hånden i Dashboard som Livjas 14/9:** `sub_sched_1UFyOj3CvBmCx5Pta4mZHhFA`, `not_started`, start 14/10 22:00 UTC (15/10 00:00 dansk), slut 14/6-2027 22:00 UTC (15/6 00:00 dansk) = 8 måneder, pris `nyt_50000_rate12` (`price_1UApAN3CvBmCx5PtWfBLnlq8`, 4.375 kr. ekskl. moms, `tax_behavior` exclusive — samme beløb som før), `automatic_tax`, proration none, `end_behavior` cancel, fase-metadata `art=migreret`, `company_id=9f00e582-1050-4d47-ba8f-221e75e72fab`, `migreret_fra=sub_1TiTS94DoYItGRbItgCb6fhu`, `migreret_dato=2026-09-15`. Det gamle blev annulleret først efter målingen af det nye (17:37:33 dansk, §1).

**5. MÅLT FØR FØRSTE TRÆK PÅ DEN NYE KONTO.**

- **Betalingsmidlet:** alle 13 schedules har `default_payment_method` null på schedule og fase; alle 13 kunder har `invoice_settings.default_payment_method` sat. Uden et på schedulet bruger fakturaerne kundens (Stripes API-beskrivelse af feltet). Mangellistens «elleve af fjorten har intet betalingsmiddel på abonnementet» er derfor ikke en risiko for første træk. Kortenes gyldighed er IKKE målt.
- **Metadata ligger på FASEN** (Livja, Fjeldgaardshop og Launch Lab kun på fasen; toolkittets ti på både schedule og fase). Fasens metadata skrives på abonnementet, når fasen starter (Stripes API-beskrivelse). Livjas fase starter 15/9 kl. 22:00 UTC; beviset er `customer.subscription.created` i Workbench → Event deliveries 16/9. «Beviser der udestår», DEL 3-række.
- **TuaMea havde som den eneste sit eget kort på det gamle abonnement** (oprettet 27/5). Kundens fakturastandard på den nye konto matcher på brand (Mastercard), last4 4804, udløb 04/2029 og funding (credit); fingerprints er forskellige på de to konti, så matchet bygger på felterne. Den gamle kundes standard var samme kort.
- **TuaMeas nye schedule slutter 1/2-2027 kl. 22:00 UTC,** dagen før mønstret; antal træk er stadig 4.
- **Et schedule der slutter præcis på et træktidspunkt, giver ikke et træk mere** (Stripes installment-model: iterationer × interval = antal træk, `end_behavior` cancel).
- **Fakturateksten:** de tre schedules lavet i Dashboard (Livja, Fjeldgaardshop, Launch Lab) bærer beskrivelsen «Tak for samarbejdet i The Boardroom.» og footeren «Topix.dk ApS · CVR 45281736 · Brunbjergvej 4, st. · 8240 Risskov · kontakt@topix.dk · theboardroom.dk» — også Launch Labs, hvor feltet skulle være tomt. Toolkittets ti har ingen. Formentlig kontoens standard (IKKE målt). **ÅBENT:** fakturaerne siger kontakt@topix.dk, fladerne kontakt@theboardroom.dk (#852, #856, #860). Nyt kort, DEL 3-række.

**6. DEN GAMLE KONTO, FØR DEN LUKKES.**

- **Åbne fakturaer** (listen går tilbage til 9/3-2025 og har flere ældre): efter voiden ingen blandt de 13. Tilbage: Olsen & Kompagni ApS `C6URSTNW-0002` (15/3-2026) og `C6URSTNW-0004` (15/5-2026), 4.375 kr. inkl. moms hver (abonnement `sub_1T12384DoYItGRbIwBL0ToMu`, ikke aktivt); `RAH8SGET-0001` Ditte Lindemose, 50.000 kr. inkl. moms (manuel, 22/5-2025); og en række Premium/VÆKST-årsfakturaer fra marts 2025. Skal afgøres før kontoen lukkes. Nyt kort, DEL 3-række.
- **e-conomic-integrationen** (stripe-economic.cloudify.biz) står på de betalte fakturaer med fejlloggen «Your free trial has expired» — i tråd med migration-recon §10.
- **Trækhistorikken** (§44 fra 14/9) er stadig ikke hentet.

**7. RETTELSER TIL OVERLEVERINGEN.**

- **DEL 4 «22:00 UTC er midnat dansk» gælder kun til sommertiden slutter 25/10-2026.** Stripe ankrer i UTC, så fra 25/10 trækker de nye abonnementer kl. 23:00 dansk dagen FØR (Livja 15/11 kl. 23:00, ikke 16/11; hendes slut 15/12 kl. 23:00 dansk). Målt i schedulernes tidsstempler. Fælden er rettet.
- **§46 punkt 15 kalder tjeklistepunktet «#886», men HEAD-listen i 14/9-blokken springer #886 og #887 over, og DEL 3 siger del 2 er åben.** `gh pr view 886 --json number,title,state,mergedAt` svarede ordret: `{"mergedAt":"2026-09-14T21:24:57Z","number":886,"state":"MERGED","title":"Delingens del 2 — tjeklistepunktet «Fortæl det videre»"}`. Samme for 887: `{"mergedAt":"2026-09-14T21:31:40Z","number":887,"state":"MERGED","title":"Bogføring — Stripe-migreringen er i gang"}`. Begge er merget; git: #886 = `319f3f40`, #887 = `5f80e71b`. PR'ens tolv filer (`gh pr view 886 --json files --jq '.files[].path'`, 15/9): `src/components/hjemmebane/boardroom/__tests__/focus.test.ts`, `src/components/hjemmebane/deling/DelingView.tsx`, `src/components/hjemmebane/deling/KreativFuldskaerm.tsx`, `src/components/hjemmebane/deling/__tests__/DelingView.test.tsx`, `src/components/hjemmebane/deling/__tests__/KreativFuldskaerm.test.tsx`, `src/hooks/useDelingHentet.ts`, `src/hooks/useOnboardingTjekliste.ts`, `src/lib/__tests__/onboardingTjekliste.test.ts`, `src/lib/onboardingRytme.ts`, `src/lib/onboardingTjekliste.ts`, `supabase/functions/_shared/onboardingRytme.ts`, `supabase/migrations/20260914220000_deling_hentet_at.sql`. IKKE ren frontend: to filer ligger under `supabase/` — `supabase/functions/_shared/onboardingRytme.ts` og `supabase/migrations/20260914220000_deling_hentet_at.sql` — så udrulningen kræver mere end Update-klik: migrationen skal køres i Lovables SQL editor (om den er kørt, er IKKE målt), og den delte fil udrulles med de functions der bruger den (DEL 4 «En ændret delt fil i `_shared` udrulles eksplicit»). Ubevist på skærm. Bogføringens første udgave (15/9 eftermiddag) skrev «ren frontend, kræver Update-klik» om #886 uden at have målt filerne — rettet. Ny DEL 3-række; rækken «ÅBENT — del 2 (tjeklistepunktet) …» har fået første celle rettet til MERGET.
- **Chatten dikterede «⋯» og status «Open» for en faktura;** Dashboard viser knappen «More actions» og mærket «Failed» (API: `open`). Dashboardets tidsstempler er dansk tid. Tilføjet under DEL 4 «En URL dikteres ikke af hukommelsen».

**8. SAMLEMAILEN — BESLUTNINGERNE OG MOTOREN (15/9 aften; rene funktioner uden afsendelse; ingen PR endnu).**

- **Jonas 15/9:** højst én samlemail pr. modtager pr. dansk døgn, sendt fra kl. 17:00 dansk tid; tidspunktet står på hver linje (Jonas' eksempel: et opslag om «live session i morgen» skal stadig kunne læses rigtigt).
- **Jonas 15/9:** præsentationer er med i samlemailen. Fallback hvis samlemailen ikke er i drift og bevist senest 21/9: præsentationer som info (kun klokken) i to uger.
- **Chattens forslag, ikke modsagt:** de samlede typer er præcis `event_published` og `community_opslag` (inkl. præsentationer). Alt andet mailes som i dag.
- **Datoformatet — chattens beslutning 15/9 (tilføjelsen til opgaven), ikke Jonas':** der findes tre formater i huset: `_shared/eventMails.ts:51-58` (`datoOrd`/`tidOrd`, «onsdag 23. september» / «14:00», timeZone Europe/Copenhagen), `event-reminders/index.ts:39-57` (`fmtDate` med år, `fmtTime`) og `cancel-event/index.ts:131-135` (`dateLabel` uden timeZone). Samlemailen bruger eventMails.ts' format; ældre end i går = «{datoOrd} kl. {tidOrd}». `datoOrd`/`tidOrd` er eksporteret (`:53`, `:56`) og genbruges VED IMPORT — ingen tredje kopi, eventMails.ts er ikke rettet. Claude Codes første udgave (vindue A, samme aften) havde kopieret de to funktioner og valgt formen selv — afløst.
- **Motoren er bygget — ÉN fil i `_shared`, uden afsendelse:** `supabase/functions/_shared/samlemail.ts`, som husets andre mailbyggere (eventMails.ts, opslagsMail.ts), testet fra `src/lib/__tests__/samlemail.test.ts` (39 tests). Importerne, alle originaler og alle rene: `datoOrd`/`tidOrd` (`./eventMails.ts`), `escHtml` (`./htmlEscape.ts`), `bulletproofButton`/`fallbackLinkBlock` (`./emailButtonHelpers.ts`), `tiltale` (`./indgangsMail.ts`), `copenhagenHour` (`./notificationEmailSelection.ts`). Eksporter: `SAMLEMAIL_TYPER`/`erSamlemailType`, `SAMLEMAIL_TIME_DANSK` = 17, `danskDato`, `erSamlemailTid`, `SAMLEMAIL_MAKS_ALDER_TIMER` = 48 og `erForaeldetTilSamlemail`, `samlemailEmne`, `tidsmaerke`, `bygSamlemail` (og `sorterPunkter`, `samlMedOg`). Målt efter omarbejdningen: `bunx tsc --noEmit -p tsconfig.app.json` exit 0; `bun run test`: Test Files 229 passed (229), Tests 3477 passed (3477); `deno check supabase/functions/_shared/samlemail.ts` grøn. Ingen function importerer motoren endnu; ingen flade, cron, migration eller mail er rørt. **Spejlet og paritetstesten er fjernet FØR commit:** første udgave (Claude Code, vindue A) var `src/lib/samlemail.ts` + spejl med importfri kopier af husets hjælpere; da motoren fik sin import af eventMails.ts, faldt grunden til spejlet bort, og kopierne kunne glide — rammen og datoformatet var ikke vogtet. Chatten foreskrev spejlet i opgaven; det var det forkerte mønster for en mailbygger — præcedensen er eventMails/opslagsMail. Beviset for at omarbejdningen ikke ændrede adfærd: ingen eksisterende test i `samlemail.test.ts` er ændret, kun importstien; tre tjek er tilføjet nederst (knappen og fallback-linjen ordret fra emailButtonHelpers; tidsmærket = `datoOrd`/`tidOrd`; kilden uden kopi af datoOrd/escHtml og uden Date.now()).
- **De tekniske valg:** dansk tid via Intl med `timeZone: "Europe/Copenhagen"`, aldrig et fast UTC-offset — `copenhagenHour` (`notificationEmailSelection.ts:266-274`) er kun gjort `export` og bruges — samme kontrakt, Date ind, dansk time 0–23 ud; ingen anden ændring i den fil — og dagsnøglen sv-SE (`event-reminders/index.ts:42`, `maanedsnoegle.ts:21`). Én pr. dansk døgn: `erSamlemailTid(nu, sidstSendt)` er sand når dansk klokkeslæt ≥ 17 OG sidste afsendelse ligger på en anden dansk dato — en fejlet kørsel kl. 17 prøves igen ved næste kørsel samme aften, efter midnat venter rækkerne til næste dag kl. 17; testet i sommertid (15/9), vintertid (15/11) og på skiftedagen 25/10-2026. 48 t med regnestykket: samlemailen sendes én gang i døgnet; en række skrevet lige efter gårsdagens udsendelse er ca. 24 t gammel ved næste; 48 t giver én mislykket dag som margin; ældre er forældet (grænsen eksklusiv som køens `erForaeldet`). Tom liste bygges aldrig: `bygSamlemail` og `samlemailEmne` kaster «samlemail uden punkter». Emnet «Nyt i The Boardroom: N nye medlemmer har præsenteret sig, N nye events og N nye opslag» (kun dele > 0; ental/flertal; « og » kun før sidste del). Mailen: præsentationer, events, øvrige opslag — ældste først i hver gruppe; hver linje titel + tidsmærke («i dag kl. …» / «i går kl. …» / «{datoOrd} kl. {tidOrd}») + evt. tekst + link (deep_link sættes på appUrl); tiltale «Hej {fornavn},» / «Hej,»; én knap til platformen; al brugertekst escapes.
- **ÅBENT — rammen findes i tre kopier:** `indgangsMailHtml` (`indgangsMail.ts:122-152`) er en eksporteret, selvstændig funktion, men dens kontrakt escaper alle afsnit og kræver en underskrift, så linjer med fed titel, link-anker og gruppeoverskrift kan ikke gå igennem den uden at ændre mailens form (og de eksisterende tests). Samlemailens ramme er derfor en kopi med kilde af `indgangsMail.ts:130-151`, som `opslagsMail.ts:173-204` også kopierer — tre kopier i huset (indgangsMail, opslagsMail, samlemail). Ingen ændring i indgangsMail.ts. Samles, når nogen tager rammen ud som funktion med råt indhold; ikke nu.
- **Næste skridt — integrationen i `send-notification-email`, med tørkørsel:** mapningen fra `notifications`-rækker til punkter (`event_published`: title «Nyt event: …» + body fra `publiceringsBesked`, `eventMails.ts:79-91`; `community_opslag`: title «{navn} har skrevet et nyt opslag», body = trådtitel, `notify-community-opslag/index.ts:109-110`; præsentation = trådens `kilde_type = 'praesentation'`, som ikke står på rækken og skal slås op); «sidst sendt» pr. modtager (findes ikke som felt i dag); stempling af alle samlede rækker ved én sendt mail (som chat-samlingen, `index.ts:566-568`); dagskvoten og vinduet 07–20; og fallback'en for præsentationer hvis det ikke er bevist 21/9. **12-timers-reglen skal undtages:** `BEGIVENHED_TYPES` (`notificationEmailSelection.ts:76-82`) forælder `community_opslag` efter 12 t (`erForaeldet`, `:132-137`), så en samlemail kl. 17 ville aldrig få formiddagens opslag med — samlemailens typer skal springe den regel over i integrationen og bruge motorens 48 t. `event_published` har ingen aldersgrænse i dag.
- **Fejlen i dag, bogført:** chatten kaldte fund H «besluttet» ud fra reconens ordlyd («Fund H's beslutning (‹info› for `kilde_type = 'praesentation'`) er IKKE i koden», `recon-samlet-notifikationsmail.md` §0) uden at læse kortet `w-h`, som var en ÅBEN beslutning («info … eller accepter det som liv i netværket») — rettet i samme besked efter. Jonas afgjorde den derefter (punkt 2 ovenfor). Samme klasse som DEL 4 «Et kort der spærrer, skal efterprøves før det bruges».
- **Skalsyntaks, to gange i dag** (DEL 4, under «mål miljøet»): `grep --include=*.ts` uden anførselstegn til zsh («zsh: no matches found») og `git show` uden `--no-pager` (outputtet stoppede ved pagerens «:»).

**9. #886 — UDRULNINGEN MÅLT (15/9 aften).**

- **Migrationen `20260914220000_deling_hentet_at.sql` er KØRT i prod** — målt 15/9 (`query-results-export-2026-09-15_20-03-56.csv`): `profiles.deling_hentet_at` findes, type `timestamp with time zone`, kommentaren ordret som i filen: «Onboarding-tjeklistens punkt 8 «Fortæl det videre» (14/9-2026): første gang medlemmet hentede en PNG på /deling. NULL = ikke hentet. Sættes af fladen (KreativFuldskaerm → useDelingHentet), kun når tom. Et besøg på siden tæller ikke.» §7's «om den er kørt, er IKKE målt» er dermed afløst.
- **Den delte fil `_shared/onboardingRytme.ts`:** kun `onboarding-rytme` kalder `komIGangTekst` (`index.ts:48`, `:118`); `intro-reminder-cron` importerer kun `introPaamindelseModen` og `introPaamindelseTekst` (`:178`, `:215`), som #886 ikke ændrede. Efterprøvet med grep 15/9.
- **`onboarding-rytme` udrullet eksplicit i Lovables build-chat.** Lovable ordret: «Udrulningen af `onboarding-rytme` lykkedes kl. 2026-09-15 18:09 UTC — live, svarer HTTP 403 «Forbidden — service-role required» (forventet for Bucket B uden service-role-token), og den har nu den ændrede delte fil fra main. Ingen filer, andre funktioner eller migrationer blev rørt.» Kald uden header 15/9: HTTP 401 `{"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}` — funktionen findes; versionen er Lovables udsagn, ikke målt af chatten. Chattens Supabase-forbindelse har ikke adgang til projektet (`get_edge_function`: «You do not have permission»).
- **UBEVIST:** mail A's nye linje (ses kun i en rigtig mail A) og frontenden (Update-klik; tjeklistepunktet og #888's podcastlink).
- **CI på #891** (merge-commit `7b3ae459`; run 35004530693 på grenens `4ace8ea3`): begge jobs success — «Tests» 1m41s, «MCP Tests» 14s. Én annotation på begge jobs, ordret: «Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/cache@v4, actions/checkout@v4. For more information see: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/» — en advarsel, ingen fejl. Ingen kode planlagt.

**10. MAILLOGGENS STATUSREGEL AFVISER rate_limited (15/9 aften; migration skrevet — og KØRT 15/9 kl. 21:14 dansk).**

- **Målt i prod 15/9** (`query-results-export-2026-09-15_20-58-05.csv`), ordret: constraint `email_send_log_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'suppressed'::text, 'failed'::text, 'bounced'::text, 'complained'::text, 'dlq'::text])))`. Indekser: `email_send_log_pkey1` (id); `idx_email_send_log_created` (created_at DESC); `idx_email_send_log_message` (message_id); `idx_email_send_log_message_sent_unique` UNIQUE (message_id) WHERE status = 'sent'; `idx_email_send_log_recipient` (recipient_email). Kolonner: `created_at` timestamptz NOT NULL default now(); `error_message` text; `id` uuid NOT NULL default gen_random_uuid(); `is_test` boolean NOT NULL default false; `message_id` text; `metadata` jsonb; `recipient_email` text NOT NULL; `status` text NOT NULL; `subject` text; `template_name` text NOT NULL. Status de sidste 7 dage: sent 216, failed 11 — ingen `rate_limited`, ingen `suppressed` (ikke undersøgt hvilke 11).
- **log()'s adfærd** (`_shared/managedEmail.ts`): `log()` (`:94`) indsætter (`:105`) og gør ved fejl kun `console.error` (`:106-110`); filhovedet `:64` siger «Kaster aldrig»; ved 429 returneres `rate_limited` (`:144-146`) efter `await log(logStatusFor(dom.reason), …)` (`:139`; `mailFejl.ts:71-75` giver `suppressed` | `rate_limited` | `failed`).
- **Konsekvensen:** køen stopper korrekt (`skalKoeStoppe`, begge løkker), men logrækken afvises af CHECK'en og forsvinder — et 429 er usynligt i `email_send_log`. `EmailLogView` (kender værdien, `:66`, `:106`) og #857's udestående bevis («429 skal stå som rate_limited i loggen») kan aldrig vise det som bygget. Fejllinjen står kun i funktionens log. Bogføringen siden 14/9 sagde «kolonnen har ingen CHECK, ingen migration» (§13, §37, DEL 3, DEL 4, mangellisten) — alle steder er mærket RETTET 15/9 med henvisning hertil; intet slettet.
- **Alle skrivere af `email_send_log.status`, målt 15/9 (grep i `supabase/functions`, `src` og `supabase/migrations`):** `managedEmail.ts:139` → `logStatusFor` = `suppressed` / `rate_limited` / `failed`; `managedEmail.ts:152` → `sent`; `handle-email-events/index.ts:24` (`bogfoer`) → `bounced` (`:49`), `complained` (`:52`), `suppressed` (`:55`), template `system`. Alt andet læser eller sletter: `send-notification-email:306`, `stripe-webhook:265`, `onboarding-rytme:213`, `_shared/indgangsBetalingsmail.ts:119`, `admin-cleanup-test-data:211/220` (delete), `slet-medlemsdata-cron:274/377` (delete), `src` (EmailLogView, EmailTemplatesView, VirksomhedMailLog, invitationer — SELECT). Ingen migration INSERT'er eller UPDATE'r tabellen. `pending` og `dlq` skrives ikke af koden i dag (arv fra den gamle kø).
- **Oprindelsen:** reglen stammer fra `20260319090407_email_infra.sql` (CREATE TABLE `:32` og backfill `:79-83`, samme syv værdier), som Lovable-commit `68d86a46` (gpt-engineer-app[bot], 8/9 07:00:24 UTC, «Changes» — ombygningen af mailplatformen) slettede — filen forsvandt, reglen blev i prod. Ingen migration i repoet nævnte `email_send_log_status_check` før i dag. Kommentarerne «text uden CHECK (20260226224654:7)» i `dagskvote.ts:17-18` og `mailFejl.ts:22-24` pegede på CREATE TABLE-filen fra februar og var forkerte om prod — rettet (kun kommentarer). Ny fælde i DEL 4.
- **Migrationen `20260915210000_email_send_log_rate_limited.sql`:** i én transaktion `DROP CONSTRAINT IF EXISTS email_send_log_status_check` og `ADD CONSTRAINT … CHECK (status IN (de syv + 'rate_limited'))`. Kun `rate_limited` tilføjes — de seks værdier koden skriver (sent, failed, rate_limited, suppressed, bounced, complained) er dermed alle dækket, og intet andet mangler. **KØRT 15/9 kl. 21:14 dansk (19:14 UTC)** i Lovables SQL editor efter #893 (`889ec57e`, merget 19:13:40 UTC). Målt efter (`query-results-export-2026-09-15_21-14-22.csv`), ordret: `CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'suppressed'::text, 'failed'::text, 'bounced'::text, 'complained'::text, 'dlq'::text, 'rate_limited'::text])))`. Fra nu af kan et 429 stå i loggen — #857's udestående bevis kræver stadig et rigtigt 429. Var: «IKKE KØRT. Køres i Lovables SQL editor efter merge, med pg_get_constraintdef før og efter.» DEL 3-række.
- **Værnet `src/lib/__tests__/emailSendLogStatus.guard.test.ts`:** finder den nyeste migration der nævner constrainten, udtrækker værdierne fra dens sidste `ADD CONSTRAINT … CHECK (status IN (…))`, og kræver at hver status koden kan logge er med — `logStatusFor` importeret fra `mailFejl.ts` (ren), `await log("sent")` og `bogfoer(…, '<status>', …)` læst som kilde (npm-imports). Beviset for at værnet virker ligger i testen selv: en kopi af migrationsteksten i hukommelsen uden `'rate_limited'` fejler med «statusregel mangler: rate_limited (mailFejl.ts logStatusFor("rate_limited"))» — filen er ikke rørt. Målt: `bunx tsc --noEmit -p tsconfig.app.json` exit 0; `bun run test`: Test Files 230 passed (230), Tests 3481 passed (3481); `deno check` af `mailFejl.ts` og `dagskvote.ts` grøn — `managedEmail.ts` kan ikke checkes lokalt («Could not find a matching package for 'npm:@lovable.dev/email-js@0.1.0'», DEL 4 «`deno check` lokalt kræver npm-opløsning»; filen er uændret siden HEAD).
- **Ikke rørt, men sagt:** `mailFejl.guard.test.ts:81-89` hedder «email_send_log.status har ingen CHECK» og læser `20260226224654` — påstanden holder for DEN fil, ikke for prod; testen er grøn og ikke ændret (uden for opgaven). De 11 `failed` på 7 dage er ikke undersøgt.

**11. LOVABLE RØRTE types.ts UNDER UDRULNINGEN (15/9 aften; fundet i `git pull`-outputtet, ikke i Lovables svar).**

- **Udrulningsprompten til `onboarding-rytme` gav TO commits på main:** `9780f1cf` (gpt-engineer-app[bot], 18:08:48 UTC, «Work in progress», +3 i `src/integrations/supabase/types.ts`: `deling_hentet_at: string | null` på `profiles` i Row, Insert og Update) og merge-commit `76f7e735` (18:09:23 UTC, «Lovable update», forældre `7b3ae459` og `9780f1cf`, med chattens prompt som commit-besked — «Du må IKKE ændre, oprette eller slette nogen filer …»). Efterprøvet 15/9 med `git show --stat` og `git log -1 --format=%P`.
- **Build-chattens svar «Ingen filer, andre funktioner eller migrationer blev rørt» var forkert.** Ændringen er rigtig i sig selv: typerne matcher #886's migration (`grep -c deling_hentet_at src/integrations/supabase/types.ts` = 3), og tsc og CI er grønne på #892 («Tests» 2m1s, «MCP Tests» 18s, «Edge Function Auth Guardrail» 7s — alle pass). Fundet blev set i `git pull`-outputtet (`Updating 76f7e735..3e502c2b`), ikke i Lovables svar. Ny udvidelse af DEL 4-fælden «Build-chattens «deployet ✅» er ikke et bevis».

**12. SAMLEMAILEN — MOTOR DEL 2: VINDUE, MAPNING, FORDELING (15/9 sent; rene funktioner + tests, ingen afsendelse).**

- **CHATTENS beslutninger 15/9 (ikke Jonas'):** **a)** samlemailen sendes kun i vinduet 17:00–20:00 dansk; ikke sendt inden 20 → næste dag kl. 17 (begrundelse: Jonas' valg af kl. 17 — en aftenmail læses først næste morgen — og køens vindue 07–20, fund 18). **b)** `event_published` → punkt: titel = `events.title`; tekst = «{datoOrd(starts_at)} kl. {tidOrd(starts_at)}» + « · Online» når `meet_url` er sat; link = rækkens `deep_link`; oprettet = `created_at`; UDELADES (stemples uden mail, med grund) når eventet ikke findes, status ≠ `published`, eller `starts_at` ≤ nu. **c)** `community_opslag` → punkt: titel = trådens titel; tekst = «{navn} har præsenteret sig» når `kilde_type = 'praesentation'`, ellers «{navn} har skrevet i Community»; navn efter husets visningsnavn-regel (`opslagsMail.ts:134`, importeret); link = `deep_link`; `erPraesentation` = (`kilde_type = 'praesentation'`); UDELADES når tråden mangler eller status ≠ `aktiv`, eller når modtageren har åbnet tråden (samme dom som køen: `set_i_app === true` → dispose, `notificationEmailSelection.ts:311-314`; opslaget i `community_visninger` er I/O i `index.ts:380-399` og gøres af kalderen). **d)** forældet (`erForaeldetTilSamlemail`, > 48 t) → stemples uden mail, med grund — køens 12-timers `erForaeldet` bruges ikke og skal undtages i integrationen. **e)** pr. modtager: rådgiver/admin → rækkerne stemples uden mail (som i dag); `notification_email_prefs.important === false` → stemples uden mail; ingen auth-mail → venter (intet stempel); dagskvote nået → venter. **f)** «sidst sendt» = seneste `email_send_log` med `template_name 'notification-samlemail'` og status `sent` for modtagerens mail; label `notification-samlemail` (tæller i dagskvoten som én mail, matcher `notification-%`); idempotency-nøgle `notification-samlemail-{userId}-{danskDato(nu)}` — prod har UNIQUE (`message_id`) WHERE status = 'sent' (målt 15/9), så en anden sendt række samme dag afvises af databasen. **g)** fornavn = første ord i `profiles.full_name`; tomt → null.
- **Bygget i `_shared/samlemail.ts`** (kun den fil + testen rørt; ingen function, migration eller flade): `SAMLEMAIL_SLUT_TIME_DANSK` = 20, `erISamlemailVindue`, `erSendtIDag`, `erSamlemailTid` (nu kun sand for 17 ≤ time < 20 og ny dansk dato siden sidst); `punktFraEvent`, `punktFraOpslag` → `{ punkt }` eller `{ udelad: grund }` med grundene som konstanter (`UDELAD`: event_mangler, event_ikke_publiceret, event_passeret, traad_mangler, traad_ikke_aktiv, set_i_app, foraeldet, raadgiver, pref_fra; `VENT`: uden_for_vinduet, sendt_i_dag, modtager_ukendt, ingen_mail, dagskvote_naaet); `fornavnFraFuldtNavn`; `samlemailIdempotencyKey`; `SAMLEMAIL_LABEL`; `fordelSamlemail({ nu, raekker, opslaaet pr. række, modtagere pr. userId }) → { mails: [{ userId, email, fornavn, punkter, raekkeIder, idempotencyKey }], stemplesUdenMail: [{ id, grund }], venter: [{ id, grund }] }`. Rækkefølgen pr. række: forældet → stemples; uden for vinduet → venter; modtager ukendt → venter; sendt i dag → venter; rådgiver / pref fra → stemples; ingen mail / kvote → venter; mapning → punkt eller stemples. En modtager hvis punkter alle er udeladt, får ingen mail. **INVARIANT:** hver række præcis ét sted — testet som køens «regnestykket går op» over en blandet mængde med syv modtagere. Genbrug ved import: `visningsnavn` (opslagsMail), `datoOrd`/`tidOrd` (eventMails), `copenhagenHour` (selection). `fornavnAf` (`indgangsMailAfsendelse.ts:130-134`) har samme regel som g) men kan ikke importeres — filen importerer `managedEmail` (npm) og en https:-type — så reglen står i motoren med kilde.
- **Tests (`src/lib/__tests__/samlemail.test.ts`, 60 tests):** hver udeladelsesgrund; rådgiver; pref fra; ingen mail; kvote nået; sidst sendt i dag / i går; vinduet før 17, 17–20 og efter 20 (19:59 sand, 20:00 falsk i sommertid, vintertid og på 25/10); forældet; præsentation vs almindeligt opslag; event aflyst / passeret / mangler; idempotency-nøglen over dansk midnat (22:00 UTC om sommeren, 23:00 UTC om vinteren); invarianten. Ingen eksisterende test svækket — kun `erSamlemailTid`-blokkene fik vinduets slut som nye `it`. Målt: `bunx tsc --noEmit -p tsconfig.app.json` exit 0; `bun run test`: Test Files 230 passed (230), Tests 3505 passed (3505); `deno check supabase/functions/_shared/samlemail.ts` grøn.
- **Næste skridt — integrationen i `send-notification-email`, med tørkørsel:** en `dry_run` der tager «nu» ind i body'en, så vinduet og «sidst sendt» kan prøves uden at sende; kalderen slår op (`events` på `reference_id`, `community_traade` + forfatterens `profiles.full_name` + `community_visninger`, `user_roles`, `profiles.notification_email_prefs`, auth-mail, `email_send_log` for sidst sendt og dagskvote) og stempler alle samlede rækker ved én sendt mail (som chat-samlingen). Kildeværnene skal opdateres BEVIDST: `dagskvote.test.ts:91-125` og `mailFejl.guard.test.ts:37-64` låser præcis to kvote-gates, to advisor-tjek, to `if (!userEmail)` og to `skalKoeStoppe`-løkker — en tredje løkke vælter dem, og det er meningen (recon-samlemail-integration.md §8). 12-timers-reglen (`BEGIVENHED_TYPES`) skal undtages for samlemailens typer. **Modtagerne afgøres af skriverne** (`get_event_non_responders` i `publish-event`, `get_community_medlemmer` i `notify-community-opslag`) og ændres ikke af samlemailen.

**13. CARMA STUDIO — TIDLIGERE MEDLEM, STÅR SOM active (15/9 sent; målt, intet ændret).** *RETTET 15/9 (§14): overskriften er forkert — CARMA er et UDLØBET medlem i forlængelsesvinduet, ikke et tidligere medlem.*

- **Målt 15/9** (`query-results-export-2026-09-15_21-08-39.csv`): `status` active; `contract_start_date` 2025-09-07, `contract_end_date` 2026-09-11; `stripe_customer_id`, `stripe_subscription_id` og `subscription_status` tomme; `data_slettet_at` tom; `indgangspris_oere` 4000000; `is_legat` false; `contact_email` camilla@carmastudio.dk; 1 `company_members` (owner). `company_fornyelse`: beslutning «tilbyd», `besluttet_at` 2026-09-03T07:59:37Z, `varsel_1_sendt_at` null, `varsel_2_sendt_at` 2026-09-07T11:57:50Z. Jonas 15/9: ikke medlem mere; kontaktpersonen er Camilla Risager — ikke skrevet i `contact_person` (§39 «KØRT 15/9»), fordi huset tømmer personfelter på tidligere medlemmer. *RETTET 15/9 (§14): CARMA STUDIO er et UDLØBET medlem i forlængelsesvinduet (`udloebet_tilbyd`, dag 4 af 14 den 15/9), ikke et tidligere medlem; præmissen «huset tømmer personfelter på tidligere medlemmer» gælder ikke her. Camilla Risager (Jonas 15/9) skal skrives som `contact_person` — ikke gjort endnu, ÅBENT.*
- **ÅBENT:** hvilken status og beslutning et medlem der ikke fornyer skal have — samme mønster som Studio Mini (DE TYVE (4), vinduet lukker af sig selv 20/9). Recon i gang i vindue B; intet ændret. DEL 3-række. *RETTET 15/9 (§14): status og beslutning skal IKKE ændres — «tilbyd» og `active` er rigtige for et udløbet medlem med åbent tilbud (dag 0–14). Det åbne er vinduets adfærd (mails, vinduesmails, /virksomheder), ikke CARMA's værdier.*

**14. FORLÆNGELSESVINDUET — ET UDLØBET MEDLEM ER IKKE ET TIDLIGERE MEDLEM (15/9 sent; Jonas' beslutninger, chattens fejl og rettelser; ingen kode, intet ændret i prod).**

- **CHATTENS FEJL (bogføres som fejl):** efter `recon-medlem-der-ikke-fornyer.md` foreslog chatten for CARMA STUDIO og Studio Mini at sætte fornyelsesbeslutningen til «tilbyd_ikke» og status til «tidligere». Det ville have stoppet rapportpåmindelserne ved at fjerne tilbuddet om at forlænge. Jonas afviste det, ordret: «Hvad nu hvis? CARMA Studio gerne vil forlænge om to dage, så har vi uddlagt den mulighed, fordi vi vil lave et quick fix nu.» Årsagen: chatten læste Jonas' «Carma er ikke medlem mere» som afsluttet, ikke som udløbet med åbent tilbud. Samme fejllæsning holdt Camilla Risagers navn ude af `contact_person` (§39 «KØRT 15/9», §13 — begge mærket RETTET). Ny fælde i DEL 4.
- **JONAS 15/9, ordret:** «Vi har brug for at få en status, som når der er nogen der udløber og har det her vindue, hvor de kan forlænge deres medlemskab, så skal de selvfølgelig ikke have sendt rapport på minde og alle mulige andre ting. indenfra platformen. De skal have en til to mails i deres periode, hvor de bliver minde om, at det vil være deres sidste chance eller hvis de gerne vil forlænge, så er det en mulighed, selvfølgelig kun hvis vi har tilbudt dem forlængelse.» Og om /virksomheder: «Jeg synes, det er fint, at de ikke bare fremgår på oversigten, fordi det er dem, vi rådgiver, men det kunne måske være fint at kunne finde virksomheder frem på den ene eller anden måde, som vi potentielt skal kunne forholde os til.»
- **JONAS' VALG A 15/9:** to mails i vinduet — dag 1 («udløbet, du kan stadig forlænge til og med {dato}») og dag 11 («sidste chance, tilbuddet lukker {dato}») — kun ved beslutning «tilbyd». Vinduet er dag 0–14 efter slutdatoen (`FORNYELSE_TILBUDSVINDUE_EFTER_UDLOEB_DAGE = 14`, `fornyelse.ts:49`).
- **CHATTENS RETNING (ikke besluttet; recon først):** tilstanden findes allerede som `afgoerFornyelsestilstand` (`udloebet_tilbyd`) og skal ikke være en ny kolonne. (a) Én regel for hvem der må få platformens mails, håndhævet i køen og i hver strøm uden om den. (b) Vinduesmails dag 1 og dag 11, stemplet som varslerne. (c) /virksomheder: oversigten uændret; søgning finder også virksomheder uden for den, under egen overskrift med tilstand. (d) Camilla Risager skrives som CARMA STUDIO's `contact_person`.
- **RECON-FORNYER (vindue B, `~/Downloads/recon-medlem-der-ikke-fornyer.md`), fundene i kort form:** `companies.status` er `'active' | 'tidligere'` (CHECK `20260911040000:33-35`); `'tidligere'` sættes kun i hånden (`20260902113000:27-41`) — ingen flade, function eller SQL-funktion skriver den. Adgangen styres af `contract_end_date`, ikke status: `computeMembershipTier` → `expired` (`membershipTier.ts:68-85`) → ruteværn (`App.tsx:93-107`) → `MembershipExpiredGate` (`Index.tsx:226-230`). CARMA ser i dag tilbuddet og kan betale t.o.m. 25/9 (dag 14; `fornyelse.ts:162-166`, `hent-fornyelsestilbud:122`, `opret-fornyelse-checkout:105-118`). `send-report-reminder` filtrerer kun `status = 'active'` (`:293-295`) → udløbne får stadig rapportpåmindelser. `notify-chat-reply` (`:54-79`), `advisor-broadcast` (`:58-107`) og `notify-kpi-comment` (`:46-70`) skriver til alle `company_members` uden medlemskabsdom, og køen har ingen (`send-notification-email:179-188`). Event-påmindelse B/C (`event-reminders:130-160`) og `cancel-event` (`:101-146`) rammer tidligere tilmeldte. Fornyelsesvarsel-motoren sender intet efter slutdatoen (`fornyelsesvarsel.ts:133-137`). `company_fornyelse.beslutning` er `'tilbyd' | 'tilbyd_ikke'` (`20260811120000:29-31`), skrives kun fra `VirksomhedView`. `slet-medlemsdata` tager CARMA tidligst 26/10 (vej `tilbud_ubesvaret`, `sletning.ts:64-65, :199-219`). Studio Mini (slut 5/9) er uden for ordningen og slettes aldrig automatisk (`sletning.ts:179-183`). `membershipTier.ts:37-42` siger stadig at SQL-dommene ikke er rettet til +1-reglen, mens `20260907141500:43-84` retter dem.
- **MÅLT PÅ SKÆRM 15/9 kl. 21:37** (Jonas, /virksomheder, `screencapture-app-theboardroom-dk-virksomheder-2026-09-15-21_37_28.pdf`): nederst «Viser 27 af 29 virksomheder». Ikke på listen, men `status` active i prod (chattens SQL 15/9): CARMA STUDIO, Studio Mini ApS, Alexander Lunds virksomhed, Martin Larsens virksomhed, Topix.dk ApS. recon-fornyer §1 skrev ud fra koden at CARMA «står på listen» (`VirksomhedslisteView.tsx:230`) — det holdt ikke; hvilke filtre der fjerner de fem, er IKKE målt; recon i gang (vindue B, `recon-forlaengelsesvinduet.md`). Kontaktpersonerne på listen er ejerens navn (fx «Peter fra Rezycl», «Caspar Bennedsen») — husets regel #621 (ejeren vinder), ikke en fejl i aftenens skrivning af `contact_person`.
- **STUDIO MINI:** Jonas' beslutning 6/9 «Studio Mini FORLÆNGER IKKE» står (`fornyelseskaeden-1-september.md:567-575`); rækken er stadig «tilbyd»; vinduet lukker af sig selv efter 19/9. Intet ændret 15/9; ingen vinduesmails til dem uden Jonas' ord.
- **Rettet i bogføringen (mærket RETTET 15/9 (§14), intet slettet):** §13 (overskrift, «tidligere medlem», det åbne spørgsmål om status/beslutning), §39 «KØRT 15/9», DEL 3-rækkerne om de 35 og om CARMA, kort n14-4, og START HER-linjen fra motor del 2. Nye DEL 3-rækker: forlængelsesvinduet og Camilla Risager. Nyt kort på mangellisten (Betaling og fornyelse).

### Mailplatformen — bygget om af Lovable 8/9 kl. 06:52-06:58; afsenderne, fortegnelsen og værnet (#728, #730, #731, #732)

**Hvad Lovable gjorde.** 19 commits direkte til main mellem kl. 06:52 og
06:58, alle med beskeden «Changes» (`b45007eb`…`68d86a46`, 32 filer):
`process-email-queue` slettet (364 linjer), migrationen
`20260319090407_email_infra.sql` slettet (292 linjer — den bar DDL'en for
den nuværende `email_send_log`, `suppressed_emails`,
`email_unsubscribe_tokens` og `email_send_state`; tabellerne findes
stadig i prod, deres definition findes ikke længere i repoet), `_shared/managedEmail.ts`
og `_shared/transactional-email-templates/` tilføjet, `handle-email-events`
og `preview-transactional-email` tilføjet, `auth-email-hook` skrevet om til
`createAuthEmailHandler`, og tretten afsendere flyttet til
`FROM_DOMAIN = "theboardroom.dk"` / `SENDER_DOMAIN = "notify.theboardroom.dk"`
(`managedEmail.ts:17-22`). Alt uden PR. Det blev fanget fordi et push på
~900 objekter så forkert ud for en ændring på 84 linjer.

**Vores afsenderarbejde blev overflødigt** — punkt 2 i planen for 8/9
var netop at flytte afsenderen fra `boardroom.topix.dk`. Tilbage stod tre
literaler med de gamle domæner (`send-welcome-message:10`,
`EmailTemplatesView:288, :892`), rettet i #731 sammen med et kildelæsende
værn (`src/test/afsenderDomaeneGuard.test.ts`: ingen kode nævner
`boardroom.topix.dk`/`mail.topix.dk`, kun `managedEmail.ts` tildeler
`VERIFIED_FROM_EMAIL`, editorens default er lig managedEmail's). De
fjorten skabelonrækker i `email_templates` bar stadig det gamle domæne
(13 `boardroom.topix.dk`, 1 `mail.topix.dk`) — rettet i prod kl. 09:31. Om
feltet betød noget: tre functions har hver sin kopi af
`resolveSenderFromTemplate`, som erstatter alt uden for `theboardroom.dk`
med `noreply@theboardroom.dk`; den fjerde (`send-notification-email`)
læser aldrig feltet. Så det sendte var allerede rigtigt — feltet løj, og
advarslen i loggen forsvandt med rettelsen (`~/Downloads/recon-skabelonernes-afsender.md`).

**Mailfortegnelsen** (#730, `docs/mailfortegnelsen.md`, Jonas: «vi skal
virkelig have skabt os et fuldt overblik over alle mails der er opsat»):
38 mails fra tre kilder — de 14 skabeloner, mailene bygget i kode, og
auth-mailene — med udløser, modtager, kilde, gate og sidst sendt. Fem fund
øverst i filen; det vigtigste: ni ting findes som kode og har aldrig
sendt en mail, og `monthly-digest`s admin-knap sender til alle founders
når som helst. Fortegnelsen opdateres i samme PR som enhver mailændring.

**Auth-guardrailen fejlede på main** fra 06:58 til #732:
`handle-email-events/index.ts:9` konstruerer en service-role-klient, og
værnet fandt ingen gate. Gaten FINDES — målt, ikke antaget: pakken
`@lovable.dev/email-js@0.1.0` blev hentet som npm-tarball og læst;
`createEmailWebhookHandler` kalder `verifyWebhookRequest` fra
`@lovable.dev/webhooks-js@0.0.1` som første handling efter metode-tjekket,
HMAC-SHA256 over tidsstempel og body med `LOVABLE_API_KEY`, fem minutters
tolerance — præcis samme funktion `auth-email-hook` kaldte direkte før.
Værnet matcher på navn med regex, og navnet stod ikke længere i filen.
#732 sætter `createEmailWebhookHandler` på listen med begrundelse og
låser importen til `@0.1.0`, så en opgradering fejler i stedet for
stiltiende at ændre hvad der verificeres (`~/Downloads/recon-webhook-vaernet.md`).
Ét fund undervejs, bogført i fortegnelsen: ingen kode læser
`suppressed_emails` — en spærring forurener loggen, men stopper ingen
afsendelse.

**Målingen øverst blev rettet** (#728): «29 af 37» manglede `status` i
filtret, så de otte `'tidligere'` blev talt med, og Alexander Lunds og
Martin Larsens virksomheder var mærket som kunder (gæster; `er_kunde`
sat til false i prod kl. 08:48). Rettet tal med filtret ordret: **19 af
27**, aktive 8, aldrig uploadet 10. Konklusionen holdt. Læren står i DEL
4: et filter er en del af målingen.

### De tavse fejl — målt og rangeret 7/9; sendt-loggen (#701), global fejllogning (#702) og punkt 1–4 på rangeringen (#703, #706, #708) rettet

Husets største systematiske hul, målt i `~/Downloads/recon-tavse-fejl.md`
(uden for repoet — genskabes hvis den bruges; tallene står her, så de
ikke går tabt):

- **139 `useQuery` i alt. 122 læser KUN `data` og `isLoading`** — aldrig
  `isError`.
- **115 af 139 queryFn'er kaster IKKE.** `const { data } = await
  supabase…` uden `error`-tjek (52 kald) eller `res.data || []` gør en
  Supabase-fejl til tom data, og TanStack ser en SUCCES. Der er ingen
  `isError` at læse — det hjælper ikke at læse den.
- **65 `useMutation`, 25 uden `onError`, 50 mutationFn'er uden throw** —
  klik der ingenting gør.
- **Ingen global fejlhåndtering, indtil i dag:** `new QueryClient()` uden
  caches, `Sentry.captureException` kaldt ét sted i hele `src/`
  (ErrorBoundary). Ingen query-fejl er nogensinde blevet logget.

**Sendt-loggen har været død i et halvt år (#701).** `EmailTemplatesView`
sorterede på `sent_at` og læste `template_id` — begge kolonner hørte til
den gamle tabel og forsvandt ved omdøbningen 19/3
(`email_send_log_legacy`). Kaldet fejlede med 400 (42703), men
komponenten læste kun `data` og `isLoading`, aldrig `isError`, så
skærmen sagde «Ingen afsendelser endnu» mens tabellen havde 1.664
rækker. Den så TOM ud, ikke ØDELAGT — derfor savnede ingen den.
`Members.tsx` havde samme fejl, skjult af en fallback til invitationens
`created_at`. Nu: `created_at` og `template_name` som `EmailLogView`
(facit), en fejllinje ved `isError`, og «Sendt {dato}» på invitationer
bygger på seneste `sent`-række med `template_name = 'invitation'`. Et
guard-værn (`emailSendLogKolonner.guard.test.ts`) scanner hele `src/` og
låser at ingen læser de døde kolonner; værnet er prøvet ved forfalskning.
**Den TREDJE ting omdøbningen tog (målt i prod 7/9 sent):** advisor-
policyen. Den oprindelige tabel (26/2) havde «Advisors can view send
log»; policies følger tabellen ved omdøbning, så den sidder i dag på
`email_send_log_legacy`. Den levende tabel har fire policies — tre
service-role og «Admins can read send log». Jonas har advisor + admin;
Morten har KUN advisor og kan derfor ikke se e-mail-loggen nogen steder
(`/admin/email-log` er desuden gatet af `AdminRoute`). Det er også
derfor `Members.tsx` viser «Oprettet» i stedet for «Sendt» for en ren
rådgiver, uden fejl — RLS filtrerer til nul rækker. **Besluttet (Jonas
7/9): advisor skal kunne LÆSE loggen** — migration
`20260907180000_email_send_log_advisor_read.sql`, KUN SELECT (skriverne
er service-role), skrevet, IKKE kørt; køres i hånden med SELECT før og
efter. **Forudsætningen står i migrationen, ordret:** det gælder mens
advisor betyder «Jonas eller Morten»; kommer der en ekstern rådgiver, er
advisor ikke længere det samme som huset, og policyen er for bred.
Mangellisten bærer kortet «Advisor og admin er ikke skilt ad».
*7/9 sidst på dagen (#705):* teksten skelner nu — «Sendt {dato}» kun når
`email_send_log` bærer en afsendt invitationsmail, ellers «Oprettet
{dato}» fra invitationens `created_at`. Det var FALLBACKEN til
`created_at` der løj, ikke tidspunktet. `VirksomhedView` siger stadig
«Afventer · sendt» på `created_at` — den henter ikke loggen.

**Rettet i dag:**

- **Global fejllogning (#702):** query- og mutationsfejl logges nu fra
  QueryClientens caches. En fejl der før forsvandt, efterlader nu et spor.
- **Forsidens ni delkald kaster (#703):** `hentAdvisorDashboard` havde 25
  × `res.data || []` og nul throw — fejlede `company_fornyelse`,
  `company_betalingslink` eller `agent_proposals`, forsvandt den slags
  fra dommen, og forsiden sagde «Der er ikke noget der haster i dag».
  `RaadgiverForsideView` HAVDE en `isError`-gren, men den kunne aldrig
  fyre. Nu læses de ni kilder dommen hviler på gennem `kraevRaekker(svar,
  kilde)` (`src/lib/kraevRaekker.ts`), som kaster med kildens navn; de ti
  øvrige (pulse, aktivitetsfeed, milestones, kpi_targets,
  rådgiverprofiler, handouts, medlemsnavne, sidste login) føder kun den
  pensionerede komponent eller er berigelser og læses som før — et valg,
  låst af `forsidenKaster.guard.test.ts`.

**Punkt 1–4 lukket, 7/9 sidst på dagen.** Virksomhedslisten (#706),
/members og medlemmets forside (#708) — samme greb som forsiden: alle
delkald gennem `kraevRaekker`, alle flader med en `isError`-gren, alle
låst af det samme værn — som nu også fanger `.data ?? []`, ikke kun
`.data || []`. **Medlemmets forside er særlig:** fejlen vises PR.
SEKTION, ikke på hele siden. Begrundelsen står i koden — et medlem der
mister hele sin forside fordi én hentning fejlede, er en dårligere
byttehandel end en rådgiver der mister sin liste.

**Nøgletals-målene (punkt 6) — hooks kaster, og STANDARDMÅL MARKERES
(Jonas 7/9).** `useKpiTargets`/`useKpiBenchmarks` læser nu svaret
gennem `kraevRaekker` og returnerer `isError`; fallback er stadig rigtigt
når rækkerne bare er tomme. Markeringen: `KPI_FALLBACK_TARGETS` er seks
tal, ét sæt for alle — og FIRE af dem er absolutte kronebeløb (omsætning
120.000, lønninger 50.000, resultat 10.000, omkostninger 80.000). En
virksomhed der omsætter for 40.000 fik «mål 120.000» som var det deres
eget. Benchmarks har haft princippet siden 5/8 («`source_label` påstår
aldrig mere end vi kan dokumentere»); målene får det nu. Oprindelsen
bæres som et felt på værdien, VALGFRIT i typen — så en hentning der ikke
sætter det, markerer ikke: ukendt er ikke standard, og et aftalt mål kan
aldrig fejlagtigt stemples. ÅBENT, faglig opgave: tallene selv — de fire
kronebeløb passer kun til én virksomhedsstørrelse (DEL 3).

**Rangeringen, som den skal bruges når resten tages** (punkt 5–11 og
de 115 står tilbage — stadig husets største systematiske hul):

1. Rådgiverens forside — RETTET (#703).
2. `/virksomheder` — RETTET (#706).
3. `/members` — RETTET (#708); `FornyelsesSektion`/`IndgangsSektion` får
   ikke længere tom liste ind ved fejl.
4. Medlemmets «Dine aftaler» og ulæste — RETTET (#708), pr. sektion.
5. Rapportering — «Ingen rapporter endnu — upload din første» til et
   medlem med 20; opfordrer til dubletter.
6. Nøgletals-mål og benchmarks — hooks kaster og standardmål markeres
   (7/9, ovenfor); TALLENE står tilbage som faglig opgave.
7. App-config — adfærd skifter stille til standard.
8.–11. Admin-lister, community, events, medlemsliste, mutationer uden
   `onError`.

Reglen står i DEL 1 «Kodearbejde»; fælderne i DEL 4.

### Omkostningernes fortegn — rettet i alle fire skriveveje 7/9 (#721), data rettet i prod kl. 19:58

Målt i prod 7/9 kl. 19:00: **to af fire skriveveje skrev omkostninger
NEGATIVT** (regnskabets fortegn) — `annual_report` 24 af 132 rækker med
negativ personaleudgift (9 virksomheder), `manual` 16 af 67 med negativ
personale OG 16 med negativ afskrivning (10 virksomheder). Månedsvejen
(`canonical`/`canonical_v2`, 118 rækker) skrev positivt, nul negative.
Mangellistens tal (elleve virksomheder) var 9 + 10 med overlap. Fejlen
var IKKE kun arv: den manuelle vej bruges hver gang nogen retter data i
hånden.

- **Hvorfor positivt er rigtigt — læst, ikke antaget.** Månedsvejen er
  flertallet og den kanoniske: `normalizationProfiles` ender i positiv
  konvention i alle syv profiler (`cost_like: ABS` i fem, `NEGATE` af
  negative kilder i én, `KEEP` i én hvis kilde allerede er positiv),
  `canonicalEngine` regner `ebitda = gross_profit − opex` med `opex > 0`,
  og hver læser der summerer — `calcTotalExpenses`, BVA, ugefokus,
  `budgetAktualer`, Dinero-skabelonen — tager `abs` selv. **Ingen læser
  lægger en negativ omkostning til.** Et negativt fortegn var derfor
  aldrig «rigtigt» nogen steder; det var en glidning fra formularens
  placeholders («Eks. -320000») og fra AI'ens råtal på årsrapport-vejen
  (den blev rettet 27/8, #440/#444, men rækkerne fra før stod).
- **En TREDJE skrivevej fundet undervejs:** `save-annual-baseline` gemte
  `payroll` som tastet. Også rettet. Nu: den manuelle vej kører
  `positiveOmkostninger` (`src/lib/omkostningsFortegn.ts`) FØR
  afledningen; årsrapport-vejen går gennem `normaliserAarsrapport` regel
  1; baseline-vejen tager `Math.abs`; månedsvejen var rigtig. Et
  kildelæsende værn (`omkostningsFortegn.guard.test.ts`) låser alle
  fire — og navngiver den ene `KEEP`-profil som eksplicit undtagelse, så
  en ny `KEEP` fejler. Læserne er ikke rørt.
- **Sidegevinst:** EBITDA og EBIT afledes nu også for tal tastet med
  minus. Før udelod `opex > 0`-guarden dem, så en manuel rettelse med
  regnskabets fortegn tabte to nøgletal uden at sige det.
- **Datarettelsen — kørt i prod 7/9 kl. 19:58 med SELECT før og efter.**
  FØR: `payroll` 40, `depreciation` 16, `cogs` 28, `admin_costs` 28
  negative. EFTER: nul i alle fire. Stikprøve ANLA GLAS 2026-05 →
  448.780 / 208.687 / 897.547. **Rollback er ikke triviel:** de gamle
  værdier er ikke gemt; de kan genskabes ved at vende fortegnet på de
  samme rækker (`UPDATE … SET metrics = metrics || jsonb_build_object(k,
  -(metrics->>k)::numeric)` for de fire nøgler, afgrænset til
  `source_type IN ('annual_report','manual')` og `committed_at` før
  19:58).
- **De to mønstre, værd at kende.** ANLA GLAS havde seksten måneder med
  ALLE fire poster negative — konsekvent regnskabskonvention, tastet i
  hånden. Floren Engros havde fireogtyve måneder kopieret fra to
  årsrapporter, hvor 2024 havde POSITIVE `cogs` og `admin_costs` men
  negativ `payroll`, mens 2025 havde alle tre negative. Samme virksomhed,
  samme vej, to udtræk, to fortegn — AI'ens råtal er ikke en konvention.

**FLOREN ENGROS 2025 — først skrevet kl. 19:58 som «HUNDREDE GANGE FOR
SMÅ … påvirker alt Floren ser af nøgletal for 2025: dækningsbidrag,
EBITDA, omkostningsandel» (#722). RETTELSE kl. 20:15, efter at rapporten
var læst: DEN DIAGNOSE VAR FOR HÅRD.** Det så sådan ud — `cogs` 4.335
kr. om måneden i 2025 mod 248.112 i 2024 — men det var ikke en
tusindtalsfejl og ikke «alle nøgletal».

- **Hvad der VAR galt: linjevalget.** Årsregnskab 2025 (Dansk Regnskab,
  underskrevet af Mette Skov 23/03/2026) har TO linjer: «Vareforbrug»
  3.155.034 (note 1: varekøb minus lagerregulering) og «Direkte
  omkostninger» 52.018 (note 2: KM-penge og arbejdstøj). Udtrækket tog
  «Direkte omkostninger» til `cogs` og TABTE vareforbruget — **et match på
  ORDET, ikke på betydningen.** 2024 blev læst rigtigt (2.977.338 = note
  1's 2024-tal), men det er ikke udtrækkets kvalitet der svinger: 2024 er
  et SKATTEBILAG («Bilag til oplysningsskema») med én linje, 2025 et
  rigtigt årsregnskab med begge.
- **Hvad der IKKE var galt.** Bruttoresultat og resultat var korrekte
  hele tiden — 92.290 og −1.674 om måneden, præcis rapportens tal.
  Omsætning og personale også. `admin_costs` 53.468 er summen af salg,
  bil, ejendom, admin og andre personaleomkostninger (5.631 + 16.168 +
  15.874 + 12.727 + 3.070) — korrekt sammenlagt. Florens dækningsgrad så
  rigtig ud (22,3 %, som rapporten). Fejlen var FORDELINGEN mellem
  omkostningsposterne — vareforbruget manglede, omkostningsstrukturen var
  ubrugelig — ikke totalerne.
- **Rettet i prod 7/9 kl. 20:15:** tolv rækker, `cogs` fra 4.335 til
  262.919, guardet på 4335 så en allerede rettet række rammer nul. Året i
  alt 3.155.028 mod rapportens 3.155.034 — seks kroner i afrunding, fordi
  tallet ikke går op i tolv. Omsætningen stemmer på kronen. FØR-værdi til
  rollback: `cogs = 4335`.
- **Det åbne er større end Floren.** Floren blev fundet ved et TILFÆLDE —
  under en fortegnsrettelse, fordi et tal så forkert ud ved siden af året
  før. *Målt kl. 20:24 på alle elleve årsrapporter — afsnittet nedenfor:*
  det er ikke linjevalget der er problemet; det er at kun to af elleve
  udtræk er hele. Mangellisten bærer kortet «Kun to af elleve
  årsrapport-udtræk er hele»; DEL 3 bærer rækken.

### Årsrapport-udtrækket — målt 7/9 kl. 20:24 og 20:32: kun to af elleve udtræk er hele, og det rammer dem der IKKE rapporterer månedligt

Rimelighedstesten fra Floren-sagen (vareforbrug som andel af omsætning)
blev kørt på ALLE årsrapporter i prod kl. 20:24. Den ledte efter flere
tilfælde af det forkerte linjevalg. **Den fandt noget andet og større** —
og en måling kl. 20:32 nuancerede det afgørende: hvem der faktisk SER
hullerne. Første måling, elleve
årsrapporter, felter pr. måned (`financial_report_facts`, `source_type =
'annual_report'`, `/12`-fordelt), ordret som målt:

| Rapport | oms | cogs | payroll | gross | admin | |
|---|---|---|---|---|---|---|
| Alina Beauty & Skincare 2025 | 150.691 | 38.601 | 46.796 | 112.090 | 29.892 | **HEL** |
| Floren Engros 2024 | 357.266 | 248.112 | 61.042 | 62.551 | 46.603 | **HEL** |
| Floren Engros 2025 | 413.013 | 262.919 | 91.761 | 92.290 | 53.468 | **HEL** (rettet kl. 20:15) |
| ANLA GLAS A/S 2024 | MANGLER | MANGLER | 310.629 | 376.753 | MANGLER | |
| Booking Innovation 2024 | 83.665 | MANGLER | **46** | 17.047 | MANGLER | |
| Booking Innovation 2025 | 62.493 | MANGLER | MANGLER | MANGLER | MANGLER | |
| Doggybed 2025 | 15.836 | 5.066 | MANGLER | 10.770 | 13.925 | |
| Livja 2025 | MANGLER | MANGLER | 34.547 | 34.615 | MANGLER | |
| remm. 2025 | 109.671 | MANGLER | MANGLER | 34.199 | MANGLER | |
| Topix.dk ApS 2025 | 48.930 | MANGLER | 19.587 | **−14.966** | MANGLER | |
| YKRG APS 2024 | **0** | MANGLER | 117.444 | 45.565 | MANGLER | |

(«To af elleve» er Alina og Floren 2024; Floren 2025 er hel fordi den
blev rettet i hånden samme aften.)

- **Rimelighedstesten, vareforbrug som andel af omsætning — kun FIRE
  rapporter kan prøves,** fordi resten mangler det ene eller det andet:
  Alina 25,6 % · Doggybed 32,0 % · Floren 2024 69,4 % · Floren 2025
  63,7 %. Alle plausible. Florens spring fra 1 % til 64 % bekræfter
  rettelsen kl. 20:15.
- **Personale som andel:** Alina 31,1 % · Floren 17,1 og 22,2 % · Topix
  40,0 % · **Booking Innovation 2024: 0,1 % — 46 kr. om måneden.** Det er
  ikke en manglende linje, det er et tal læst tusind gange for lille.
- **De tre værste, hver på sin måde:**
  - **YKRG 2024:** omsætning NUL, men bruttoresultat 45.565 og personale
    117.444 om måneden. En virksomhed med nul omsætning og 1,4 mio. i
    lønninger. (Regel 2 i `normaliserAarsrapport` gør revenue 0 til
    null — for NYE udtræk; denne række er fra før.)
  - **Topix.dk 2025:** bruttoresultat MINUS 14.966 med omsætning 48.930
    og intet vareforbrug — vores egen virksomhed.
  - **Booking Innovation 2025:** kun omsætning. Fire af fem felter
    mangler.

**Konklusionen, skarpt:** det er IKKE enkeltfejl i linjevalget. **Kun to
af elleve udtræk er hele.** Men de 108 ufuldstændige månedsrækker er
IKKE alle det medlemmerne ser — det afgør målingen kl. 20:32.

**Målt kl. 20:32 — hullerne BLIVER OVERSKREVET når virksomheden
rapporterer månedligt.** De seneste tolv rækker pr. virksomhed (dem
grafer, KPI'er og domme læser), ordret som målt:

| Virksomhed | seneste række | målte af 12 | årsrapport af 12 | |
|---|---|---|---|---|
| ANLA GLAS A/S | 2026-05, manual | **12/12** | 0 | |
| Booking Innovation | 2026-08, frisk | 8/12 | 4 | |
| Livja | 2026-07, frisk | 7/12 | 5 | |
| Topix.dk ApS | 2026-07, frisk | 7/12 | 5 | |
| remm. | 2025-12, **IKKE frisk** | **0/12** | **12/12 ÅRSRAPPORT** | ramt NU |
| YKRG APS | 2026-04, **IKKE frisk** | 2/12 | 10 | ramt NU — **og TI AF TOLV RÆKKER HAR OMSÆTNING NUL** |

Ingen af de seks mangler omsætning i de seneste tolv — hullerne er
overskrevet af målte måneder. Årsrapport-udtrækkets huller er derfor et
problem for dem der IKKE rapporterer månedligt, ikke for alle ni. **To er
ramt nu:**

- **remm.:** alt hvad de ser er fordelte årstal — tolv af tolv rækker er
  årsrapport, og de har ikke rapporteret i ni måneder (seneste 2025-12).
  Deres graf, KPI'er og «Omk. total» er ét årstal delt med tolv, uden
  vareforbrug og uden personale (tabellen ovenfor).
- **YKRG — nul er ikke manglende, og det er værre.** Ti af tolv rækker
  har omsætning **NUL** — ikke manglende, nul. Dommene er beskyttet mod
  MANGLENDE værdier: `virksomhedsSignaler` kræver `!= null`,
  `pctAendring` returnerer null når `prev === 0`, `calcDbMargin`/
  `calcResultMargin` returnerer null når `rev === 0`. De er beskyttet i
  NÆVNEREN — ikke mod nul i TÆLLEREN: en målt måned fulgt af en
  årsrapport-måned med 0 giver «omsætningsfald −100 %» (`stikker_ud`),
  KPI «Omsætning» viser 0, grafen ligger på nullinjen, BVA siger −100 %
  mod budget, og «Omk. total» er 1,4 mio. i løn uden omsætning. (Regel 2
  i `normaliserAarsrapport` gør revenue 0 til null — for NYE udtræk;
  YKRGs rækker er fra før.) **Det skal måles hvad YKRG faktisk ser, før
  nogen retter noget** — kræver prod:

```sql
-- YKRGs seneste tolv rækker: hvad står der, og hvor kommer det fra
SELECT f.period_key, f.source_type, f.data_basis,
       (f.metrics->>'revenue')::numeric      AS revenue,
       (f.metrics->>'gross_profit')::numeric AS gross_profit,
       (f.metrics->>'payroll')::numeric      AS payroll,
       (f.metrics->>'ebt')::numeric          AS ebt,
       f.committed_at
FROM public.financial_report_facts f
JOIN public.companies c ON c.id = f.company_id
WHERE c.name ILIKE 'YKRG%'
ORDER BY f.period_key DESC
LIMIT 12;

-- Hvilke domme og tal bygger på nullerne: de to seneste rækker (M/M),
-- og om de to seneste begge er målte (momErGyldig) eller én er estimat
SELECT f.period_key, f.data_basis, (f.metrics->>'revenue')::numeric AS revenue
FROM public.financial_report_facts f
JOIN public.companies c ON c.id = f.company_id
WHERE c.name ILIKE 'YKRG%'
ORDER BY f.period_key DESC
LIMIT 2;

-- Alle virksomheder: rækker med omsætning præcis 0 (ikke null) — hvem
-- ellers har nuller som tal
SELECT c.name, f.source_type, count(*) AS raekker_med_nul
FROM public.financial_report_facts f
JOIN public.companies c ON c.id = f.company_id
WHERE (f.metrics->>'revenue')::numeric = 0
GROUP BY c.name, f.source_type ORDER BY raekker_med_nul DESC;
```

**DAGENS VIGTIGSTE SAMMENHÆNG — tre målinger, tre sider af det samme.**
Det er SAMME GRUPPE som de 73 ventende uploads
(`~/Downloads/recon-ventende-uploads.md`: «PASS er ikke enden på flowet»
— rapporter der aldrig blev godkendt, så medlemmet uploadede igen) og de
under ti procent der svarer på opgaveforslag (DEL 2 «Opgave-modellen»).
remm. har en invitation der har hængt i 80 dage og ingen rapport i ni
måneder; YKRG rapporterede sidst i april. **De medlemmer der ikke bruger
platformen, får en platform der bliver forkert** — årstal delt med tolv
i stedet for måneder, nuller i stedet for tal, forslag der udløber
usvarede — og ingen af de tre målinger så det alene. Hver for sig så det
ud som et udtræksproblem, et godkendelsesproblem og et svarproblem. Det
er ét problem: fravær, og en platform der ikke siger fravær men viser
noget andet i stedet.

Det ændrer hvor alvorligt årsrapport-sporet er — ikke til «ni af elleve
er forkerte», men til: **udtrækket fylder huller ind som ingen ser, indtil
en virksomhed holder op med at rapportere — og så er hullerne alt hvad
de ser.**

**Det næste skridt — kortlagt, ikke anbefalet:** elleve PDF'er
(`financial_reports` bag de elleve `source_report_id`), én tabel over
hvad hver rapport FAKTISK indeholder — hvilke linjer den har, med hvilke
navne, og hvilket tal udtrækket tog eller tabte for hver af de fem
felter — og derefter én beslutning: skal årsrapport-udtrækket bygges om
(betydning frem for ord; skattebilag og årsregnskab som to forskellige
dokumenttyper), eller erstattes af manuel indtastning for de felter det
ikke kan finde (`save-annual-baseline` findes allerede som vej, med fem
felter). Indtil beslutningen er truffet, er hullerne det remm. og YKRG ser
— og det enhver virksomhed vil se, den dag den holder op med at
rapportere og de målte måneder glider ud af de seneste tolv. Mangellisten
bærer tre kort: «Kun to af elleve årsrapport-udtræk er hele», «Booking
Innovations personale er 46 kr. om måneden» og «remm. og YKRG ser kun
årstal — og YKRG ser nuller».

### Mørke tokens på lyst papir — målt og rettet 7/9 (#685)

`~/Downloads/recon-moerke-tokens-paa-papir.md` (uden for repoet —
genskabes hvis den bruges). Anledningen var knappen «Redigér og godkend»
i `AgentForslagPanel`, som var ulæselig på virksomhedssiden.

**Årsagen er strukturel:** `index.html` bærer `class="dark"` permanent,
og `.theme-hjemmebane` definerer KUN `--hb-*`-tokens — den overstyrer
ikke shadcns. Enhver rå shadcn-komponent i en Hb-flade får derfor
mørke-temaets værdier på lyst papir. Fem komponenter var bogført som
bevidst ukonverterede, «tegner i appens gamle tokens» (`VirksomhedView`
ved `AgentForslagPanel`, `AdvisorAIChat`, `DeliveryOverview`,
`HandoutDetail`; `EmailTemplatesView` ved `RichTextEditor`). **Men det
var ikke det der skete:** de arvede TEKSTFARVEN fra Hjemmebane-skallen
(`HbMemberShell`: `text-hb-ink`, 12 % lyshed) oven på `.dark`-baggrunde
(`bg-background`, 9 %) — en hybrid af to temaer på ét element. Knappen
var 12 % på 9 %; indtastet tekst i `Input`/`Textarea` var usynlig, mens
placeholderen på 55 % så fin ud. Ikke det gamle udtryk bevaret — noget
tredje.

**Rettelsen (#685):** en wrapper på hver af de fem komponenters rod
sætter nu appens tekstfarve eksplicit (`text-foreground`), så intet arves
fra skallen — og BEVIDST IKKE baggrunden. Første forsøg satte
`bg-background` med, men skærmen viste at panelet i praksis er LYST
(`bg-muted/20` blandet over papiret), så baggrunden ville have ændret
udtrykket frem for at rette fejlen. En rettelse truffet på et billede
frem for på tokens. Wrapperen ligger på komponentens rod, ikke på
kaldestedet, så en konvertering fjerner den i samme fil frem for at
efterlade en mørk wrapper om en lys komponent. Den er markeret til
fjernelse. Kun agentpanelet er set på skærm efter rettelsen.

**Konverteringen af de fem paneler er sin egen opgave** — mangellisten
bærer kortet. Andre rå shadcn-steder på papir, som IKKE er bogført som
ukonverterede og derfor ikke rørt: `EditCompanyDialog`,
`ReportManualOverride`, de to `AlertDialogContent` i `VirksomhedView` og
`RapporteringView`, kalenderen i `BoardroomView`, og `FinancialAIChat`
(mangellisten). Reconen bærer listen med lysheder.

### RLS-hullet — fundet og lukket 3/9 kl. 22:48

`supabase/SECURITY_BASELINE.md` §5 og migration
`20260903230000_demo_policies_restrictive.sql` (#591). Aftenens
vigtigste fund.

**Hvad der var galt.** Fire policies med «demo» i navnet («Hide demo
company/conversations/facts/milestones from non-members») var
PERMISSIVE, hvor de skulle have været RESTRICTIVE. Permissive policies
stakker med OR: en række slipper igennem hvis bare én policy siger ja.
En policy hvis første led er `company_id <> demo` er sand for ALT der
ikke er demo — den gav adgang til alle andre virksomheders rækker i
stedet for at nægte adgang til demoens. Der fandtes nul restriktive
policies i hele `public` (0 af 268), så intet trak adgangen tilbage.

**Målt kl. 22:46** som et almindeligt medlem med én virksomhed (lånt
identitet via `set_config('request.jwt.claims', …)` + `set local role
authenticated`):

| kilde | kunne se | ejede selv |
|---|---|---|
| companies | 38 | 1 |
| milestones | 102 | 0 |
| financial_report_facts | 314 | 0 |
| conversations | 35 | 1 |

Ethvert logget-ind medlem kunne læse alle virksomheders regnskabstal og
alle samtaler mellem rådgivere og kunder. Elleve brugere har rollen
member.

**Rettet kl. 22:48** i Lovable SQL editor: de fire policies droppet og
genskabt `AS RESTRICTIVE`, samme udtryk. Efter, samme bruger: 1 / 0 /
0 / 1 — præcis det brugeren ejer. Rådgiveradgangen urørt: målt som
advisor+admin 38 / 102 / 314 / 35, uændret.

**Demo-virksomheden findes ikke i prod** (hverken `is_demo = true`
eller id `a0de0000-…0001`). Policyerne bevares som restriktive, så en
genoprettet demo ikke lækker. Morten (advisor uden admin) ville ikke
kunne se en demo-virksomhed under dem — det er hensigten, ikke en fejl.

**Migrationen er bogføring af en rettelse der ALLEREDE er kørt — den
skal IKKE køres igen.** Den er idempotent, så den kan køres efter en
genskabelse uden at fejle.

**Gennemgang af alle policies i prod bagefter, kl. 22:57:** ingen flere
af samme slags. Hver tabel i `public` har RLS og mindst én
SELECT-policy. To policies med `true` (`app_config`,
`industry_benchmarks`) er bevidst åbne og indeholder ingen persondata.
To med negation (`advisor_notifications`, `events`) har den AND'et med
en rolle- eller medlemskabsdom og kan ikke åbne noget.

### Motoren bag rådgiverens signaler (#589)

`src/lib/virksomhedsSignaler.ts` samler de to inline-domme
(`AdvisorDashboard.tsx` l. 803–851 og `MemberDetail.tsx` l. 726–832) til
én ren funktion, `afgoerVirksomhedsSignaler`, med 45 tests. Fem af
forsidens køer afgøres dér; fornyelser og indgange kommer fra egne
motorer. **«Ikke hørt fra længe» er vendt** (designets §3.5): kravet om
committede tal er væk, og en virksomhed der aldrig har skrevet er nu det
stærkeste signal (alvor 95). **Syv valg** står dokumenteret i filhovedet
hvor de to gamle domme var uenige: friskhedsgate på alle tal-signaler,
kun fald i MoM, abs-nævner, ulæste alerts 30 dage med dedup mod facts,
alvorsskala, milestones ude, intet loft. **En reel fejl rettet:** MoM
blev regnet uden `Math.abs` på nævneren, så et resultat der falder fra
−100 til −150 stod som en stigning på 50 %. `isFiguresFresh` er flyttet
ordret. **Ingen flade bruger den endnu** — AdvisorDashboard og
MemberDetail står uændrede indtil de lægges om (DEL 3).

### Oprydningen 2/9

Otte udløbne virksomheder markeret `status = 'tidligere'`
(20260902113000); testvirksomheden slettet; gæster holdes ude af
Netværket med `vis_i_netvaerk` (20260902110000); `hent_betalingsdata_til_checkout`
bogført (den kørte kun i prod, #524). `companies.status` har ingen
CHECK-constraint — «tidligere» er en værdi der blev defineret i
migrationen.

### Platformen i tal (målt 1/9)

33 rigtige virksomheder, 14 uden ét målt tal, 13 har aldrig uploadet,
chatten bruges af 88 %, rapportering 56 %, KPI-mål 15 %. *Om tallene i
denne fil:* «33 rigtige» er 1/9 før oprydningen; «30 aktive» (3/9) er
efter at otte blev `'tidligere'` 2/9; «38 virksomheder» (3/9) er alle
rækker i `companies` inkl. de otte tidligere, efter at testvirksomhederne
blev slettet.
`docs/status-1-september.md` og `docs/prioritering-1-september.md` bærer
facit og rækkefølge; `docs/chat-design.md` chattens form.

---

## DEL 3 · Det der venter

| hvornår | hvad | hvor det står |
|---|---|---|
| **ÅBENT 15/9 — FORLÆNGELSESVINDUET: udløbne medlemmer i vinduet får platformens mails, mangler vinduesmails (Jonas: dag 1 og 11, kun ved tilbyd) og kan ikke findes på /virksomheder; recon i gang (vindue B)** | **Et udløbet medlem i forlængelsesvinduet (`udloebet_tilbyd`, dag 0–14) behandles som aktivt.** `send-report-reminder` filtrerer kun `status = 'active'`; chat/broadcast/KPI skriver til alle `company_members`; event B/C og aflysning rammer tidligere tilmeldte; køen har ingen medlemskabsdom. Jonas 15/9: ikke rapportpåmindelser og alt muligt andet indefra platformen; en til to mails i perioden — valg A: dag 1 og dag 11, kun ved «tilbyd». /virksomheder: oversigten uændret, men de skal kunne findes. Målt 15/9 21:37: «Viser 27 af 29» — CARMA, Studio Mini, Alexander Lund, Martin Larsen og Topix.dk er `active` men ikke på listen; filtrene IKKE målt. Chattens retning: én mailregel i køen og hver strøm; vinduesmails stemplet som varslerne; søgning uden for oversigten; `afgoerFornyelsestilstand` er tilstanden, ingen ny kolonne. | DEL 2 «15. september» §14; `recon-medlem-der-ikke-fornyer.md`, `recon-forlaengelsesvinduet.md` (vindue B, uden for repoet); mangellisten (Betaling og fornyelse) |
| **ÅBENT 15/9 — SQL i hånden, ikke kode** | **Camilla Risager som CARMA STUDIO's `contact_person`** (Jonas 15/9). Holdt ude 15/9 aften på den forkerte præmis «tidligere medlem → personfelter tømmes» (§39 «KØRT 15/9», RETTET). CARMA er udløbet i vinduet med åbent tilbud til 25/9. Samme form som trin 2 af de 16: guard på tomt felt, tjek på præcis 1. | DEL 2 «15. september» §14; §39 |
| **ÅBENT 15/9 — recon i gang i vindue B; intet ændret** | **CARMA STUDIO er tidligere medlem, men står `active`** (Jonas 15/9): slutdato 2026-09-11, ingen Stripe-id'er, `company_fornyelse` «tilbyd» (3/9), varsel 2 sendt 7/9. Hvilken status og beslutning skal et medlem der ikke fornyer have — samme mønster som Studio Mini (DE TYVE (4))? Kontaktpersonen (Camilla Risager) er bevidst ikke skrevet. *RETTET 15/9 (§14): CARMA er et UDLØBET medlem i vinduet (`udloebet_tilbyd`), ikke tidligere; `active` og «tilbyd» er rigtige og skal ikke ændres; Camilla Risager skal skrives som contact_person (egen række). Studio Mini-mønstret gælder ikke — Studio Mini FORLÆNGER IKKE (Jonas 6/9), CARMA skal kunne forlænge.* | DEL 2 «15. september» §13; `query-results-export-2026-09-15_21-08-39.csv` |
| **BYGGET 15/9 sent — motor del 2 (vindue 17–20, mapning, fordeling) i `_shared/samlemail.ts`; IKKE integreret; ingen PR endnu** | **Samlemailens motor del 2.** Chattens beslutninger a–g (vindue 17–20 dansk; mapning af event/opslag med udeladelsesgrunde; forældet 48 t; rådgiver/pref/ingen mail/kvote; sidst sendt via `email_send_log` label `notification-samlemail`; idempotency-nøgle pr. dansk dato; fornavn = første ord). `fordelSamlemail` med invarianten «hver række ét sted». 60 tests. Næste: integrationen i `send-notification-email` med tørkørsel og bevidst opdatering af kildeværnene. | DEL 2 «15. september» §12; `recon-samlemail-integration.md` (uden for repoet); mangellisten (n14-11, w-h) |
| **KØRT 15/9 kl. 21:14 dansk (19:14 UTC) efter #893 (`889ec57e`); målt efter: `pg_get_constraintdef` viser `rate_limited` som ottende værdi (§10). Var: ÅBENT 15/9 — migrationen skrevet, køres i SQL editor efter merge** | **Mailloggens statusregel afviser `rate_limited`.** Prod har `email_send_log_status_check` med syv værdier (målt 15/9, ordret i §10) — arv fra `20260319090407_email_infra.sql`, som Lovable slettede 8/9. `managedEmail.ts` log() gør kun `console.error` ved fejl, så et 429 har aldrig stået i loggen siden #857. Migrationen tilføjer kun `rate_limited`; værnet `emailSendLogStatus.guard.test.ts` kræver at hver status koden logger er tilladt. Kør før/efter: `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'email_send_log_status_check';`. | DEL 2 «15. september» §10; DEL 4 «En slettet migrationsfil fjerner ikke dens regel i prod»; mangellisten (Drift, n14-11) |
| **MÅLT 15/9 AFTEN — #886 udrullet: migrationen KØRT i prod (20:03), `onboarding-rytme` udrullet 18:09 UTC (Lovables udsagn); UBEVIST: mail A's nye linje og frontenden (Update-klik)** | **#886's udrulning.** `profiles.deling_hentet_at` findes med typen og kommentaren fra filen (`query-results-export-2026-09-15_20-03-56.csv`). Kun `onboarding-rytme` kalder `komIGangTekst`; `intro-reminder-cron` rører ikke det #886 ændrede. Lovable: «Udrulningen af `onboarding-rytme` lykkedes kl. 2026-09-15 18:09 UTC …»; kald uden header giver 401 `UNAUTHORIZED_NO_AUTH_HEADER` — funktionen findes, versionen er Lovables ord. Rækkerne «MERGET 14/9 — #886» nedenfor: «om migrationen er kørt, er ikke målt» er afløst. | DEL 2 «15. september» §9 |
| **NOTE 15/9 — CI-annotation på #891, ingen fejl; ingen kode planlagt** | **«Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/cache@v4, actions/checkout@v4. For more information see: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/»** — ordret fra begge jobs på run 35004530693; «Tests» og «MCP Tests» begge success. En advarsel om runnerens Node-version i actions, ikke om husets kode. | DEL 2 «15. september» §9; `.github/workflows` |
| **ÅBENT 15/9 — ikke kode; bogholderen** | **YKRG's junifaktura `UVXL7LPI-0003` er voidet og erstattet** (`in_1TndPW4DoYItGRbImwCneZ3j`, 29/6–29/7-2026, 5.468,75 kr. inkl. moms, 0 betalt, 9 forsøg): juni sendt som manuel faktura i e-conomic 15/9, Stripe-fakturaen voidet 17:18:09 dansk med intern note (void, ikke uncollectible). Bogholderen skal have besked. Tælling: 4 betalte + juni + 7 nye = 12. | DEL 2 «15. september» §2; mangellisten «Åbne fakturaer på den gamle konto …» |
| **BEVIS 16/9 — Workbench → Event deliveries** | **Livjas `customer.subscription.created`.** Hendes fase starter 15/9 kl. 22:00 UTC; metadata ligger på FASEN og skrives på abonnementet når fasen starter (Stripes API-beskrivelse). Bærer eventet `metadata.art`, så webhookens hvidliste (#563) springer over som for piloten? Første schedule-født abonnement i huset. | DEL 2 «15. september» §5; mangellisten «Beviser der udestår» |
| **VURDERING — 29/9 kl. 00:00 dansk** | **YKRG's første træk på den nye konto** (`sub_sched_1UFh3r3CvBmCx5PtPUX1htiv`): tre af hendes fire betalte træk krævede 2–8 forsøg, så første træk fejler sandsynligvis første gang — i så fald det første rigtige `invoice.payment_failed` og beviset for #815's klokke. Ikke målt; en vurdering. | DEL 2 «15. september» §2; mangellisten «Beviser der udestår» |
| **ÅBENT 15/9 — indstilling i Stripe, ikke kode; første faktura med teksten: Livja 16/9** | **Fakturaerne på den nye konto siger kontakt@topix.dk.** De tre Dashboard-lavede schedules (Livja, Fjeldgaardshop, Launch Lab) bærer beskrivelsen «Tak for samarbejdet i The Boardroom.» og footeren «Topix.dk ApS · CVR 45281736 · Brunbjergvej 4, st. · 8240 Risskov · kontakt@topix.dk · theboardroom.dk» — også Launch Labs, hvor feltet skulle være tomt; toolkittets ti har ingen. Formentlig kontoens standard (IKKE målt). Fladerne siger kontakt@theboardroom.dk (#852, #856, #860). | DEL 2 «15. september» §5; mangellisten «Fakturaerne på den nye konto siger kontakt@topix.dk» |
| **ÅBENT 15/9 — FØR den gamle konto lukkes** | **Åbne fakturaer på Topix.dk** (målt 15/9; listen går tilbage til 9/3-2025): efter voiden ingen blandt de 13. Tilbage: Olsen & Kompagni ApS `C6URSTNW-0002` (15/3-2026) og `C6URSTNW-0004` (15/5-2026), 4.375 kr. inkl. moms hver (`sub_1T12384DoYItGRbIwBL0ToMu`, ikke aktivt); `RAH8SGET-0001` Ditte Lindemose, 50.000 kr. inkl. moms (manuel, 22/5-2025); en række Premium/VÆKST-årsfakturaer fra marts 2025. Hver skal afgøres. | DEL 2 «15. september» §6; mangellisten «Åbne fakturaer på den gamle konto …» |
| **MERGET 14/9 — #886 og #887; 14/9-blokkens HEAD-liste sprang dem over** | **`gh pr view 886 --json number,title,state,mergedAt` svarede ordret:** `{"mergedAt":"2026-09-14T21:24:57Z","number":886,"state":"MERGED","title":"Delingens del 2 — tjeklistepunktet «Fortæl det videre»"}`. **887:** `{"mergedAt":"2026-09-14T21:31:40Z","number":887,"state":"MERGED","title":"Bogføring — Stripe-migreringen er i gang"}`. Git: #886 = `319f3f40`, #887 = `5f80e71b`. Rækken «del 2 (tjeklistepunktet) …» nedenfor er rettet til MERGET (§46 punkt 15). IKKE ren frontend: to filer ligger under `supabase/` — `supabase/functions/_shared/onboardingRytme.ts` og `supabase/migrations/20260914220000_deling_hentet_at.sql` — så udrulningen kræver mere end Update-klik: migrationen skal køres i Lovables SQL editor (om den er kørt, er IKKE målt), og den delte fil udrulles med de functions der bruger den (DEL 4 «En ændret delt fil i `_shared` udrulles eksplicit»). Ubevist på skærm. Filerne står ordret i §7. | DEL 2 «15. september» §7 |
| **DE TYVE FØR 22/9 — prioriteret 15/9 kl. 00:30 (chattens rækkefølge, kortene uændrede)** | **Frist:** (1) ti gamle Stripe-abonnementer annulleres FØR 20/9 — GJORT 15/9 (elleve, kl. 17:05–17:37 dansk) · (2) BR Rosets ti måneder FØR hendes gamle annulleres — GJORT 15/9 (startdatoen rettet, 7 + 5 = 12) · (3) Launch Lab efter trækket 15/9 — GJORT 15/9 (`sub_sched_1UFyOj…`) · (4) Studio Minis tilbyd-række før 20/9. **De nye:** (5) fanout → én mail · (6) de tre instrukser · (7) SQL for de 35 uden contact_person · (8) «allerede accepteret» · (9) tjeklisten 0 af 7 · (10) gæstens grænse · (11) fund K · (12) fakturateksten. **Oprydning:** (13) Monday-webhooks · (14) stripe_customer_id for tretten · (15) bevis delingspunktet · (16) Virk-nøglen. **Indhold:** (17) kursusbeskrivelser · (18) præsentationsudkast · (19) eventlokation · (20) notifikation ved like. **Kun fem: 1, 2, 5, 6, 7.** | DEL 2 «14. september» §46; (1)–(3): DEL 2 «15. september» §1, §3, §4 |
| **DE SEKS IDÉER FØR 22/9 — prioriteret 15/9 kl. 01:00 (vurdering, ikke måling; kortene uændrede)** | Kriteriet: kun nu, eller bedre af at de 10–15 ankommer samtidig. (1) «De første 30 dage» — målingen, nulpunktet FØR de femten · (2) peer-matching, manuel «Foreslå intro» · (3) tom-tilstandene bevist på skærm · (4) video-rating med ét tryk (acknowledged_at findes) · (5) «Online nu» på rådgiverne · (6) henvis til et tal i chatten, frossen. **Droppes først: 6, så 5.** Ude: affiliate, regnskabsintegration (for store), auto-tråd (digesten slukket), idébank/gamification/à la carte/Rådgiver-MCP (intet for de femten i første uge). | DEL 2 «14. september» §47 |
| **LUKKET I KODE 15/9 NAT — #888 (`130c366f`, merget 14/9 22:24:57 UTC); ren frontend, kræver Update-klik; ubevist på skærm** | **Podcasten ud af platformen (nr. 10 af 18):** menupunkt, rute og `PodcastTalksView` slettet; ét Spotify-tekstlink nederst i `HbSidebar` for medlemmer og abonnenter, ikke rådgivere (`podcastSpotify.ts`). Bevis = Update-klik, log ind som medlem: intet «Podcast & Talks» i menuen, linket nederst; som rådgiver: intet link. Forsidens podcastkort, `podcastRss.ts` og `podcast-rss` er ikke rørt. | DEL 2 «14. september» §45; mangellisten nr. 10 (lukket) |
| **ÅBENT 14/9 — Monday-oprydning (FØRST når kæden er bevist på et rigtigt «Godkendt») og den fremmede vært** | **(1) Board 1899777797 — fire webhooks væk, tre bliver** (Kilde: API-udtræk `webhooks(board_id: 1899777797)` 14/9.): VÆK 185102661 «Ny platform» (uden nøgle, slukket af Monday), 161201327 uden titel (→ `hzlkypibayzkkumwohap`, slukket), 161201319 «når et emne oprettes» (→ `hzlkypibayzkkumwohap`, slukket af Jonas 14/9), 157778880 uden titel (`state=error` siden 25/2 13:41:29). BLIVER 185108519 «Ny ny platform» (den der virker, `?noegle=`, tændt), 137371356 «Periodiseret omsætning» (→ Make), 135778522 «RapportBOARD+Slack» (→ Make). **(2) `hzlkypibayzkkumwohap`** — hvad Supabase-projektet er, er IKKE afklaret; automation 161201319 («når et emne oprettes») sendte dertil 21/3–14/9 (fire kørsler i run history: Success 13/9 15:29 og 07:15, Fail 8/9 06:52 og 4/9 17:57), slået fra 14/9. Om modtageren gemte noget: ikke målt. Den svarer 200 `{"ok":true,"skipped":"no event"}` på en tom POST — en udgave uden signaturtjek. | DEL 2 «14. september» §1; mangellisten, to kort (Drift) |
| **ÅBENT 14/9 — ikke målt** | **Lovables afmeldingslink på transaktionelle mails.** Mail-laget lægger «Afmeld abonnement»/«Unsubscribe from these emails» på — engelsk, under vores danske footer — også på invitationsmailen. Hvad en afmelding rammer (kun marketing, eller alt fra domænet), er ikke målt. | DEL 2 «14. september» §2; mangellisten (Drift) |
| **LUKKET 15/9 — SQL'en KØRT i to trin (9 fra ansøgningen, 16 fra ejerens profilnavn — Jonas' valg A); målt efter: aktive 32, uden kontaktperson 1 (CARMA STUDIO, bevidst — «tidligere medlem», §13). *RETTET 15/9 (§14): CARMA STUDIO er et UDLØBET medlem i forlængelsesvinduet (`udloebet_tilbyd`, dag 4 af 14 den 15/9), ikke et tidligere medlem; præmissen «huset tømmer personfelter på tidligere medlemmer» gælder ikke her. Camilla Risager (Jonas 15/9) skal skrives som `contact_person` — ikke gjort endnu, ÅBENT.* Tallet 35 var 2/9; 15/9 var det 25. Var: RETTET I KODE 14/9 — #883; ÅBENT: SQL'en for de 35 eksisterende (skrevet, ikke kørt)** | **Importen skriver nu `contact_person`:** `bygKontaktperson` ét sted (`virksomhedsraekke.ts:132`, kanonisk + spejl), begge veje, kildeværn på begge kaldere; en genbrugt virksomhed får også navnet. De 35 virksomheder fra før står stadig med tom streng — SQL'en er skrevet, ikke kørt (Lovables SQL editor; optælling før og efter). **RETTET 15/9 (§39 «RETTET 15/9 — SQL-TEKSTEN»):** guarden er `coalesce(trim(contact_person), '') = ''` med `status = 'active'` og ikke-tom `application_context->>'contact_name'` (kilden) — ikke `AND contact_person = ''` som her stod; teksten findes kun i sessionsudskriften (`78e51945…jsonl:308`), gengivet ordret i §39. Kørslen ændrer mailtiltaler (dag 0, påmindelser, fornyelsesvarsler) og signup-forudfyldningen; se en SELECT med navnet ved siden af `contact_email` og ejerens navn FØR UPDATE'en. Tallet 35 er 2/9-målingen, ikke talt igen. Var før: rækkebyggeren lagde navnet i `application_context.contact_name`, kolonnen fik `DEFAULT ''`; kendt siden 2/9; Monday-vejen satte feltet i gennemkørslen (§24); Nordic By Hand sat i hånden 10:14. | DEL 2 «14. september» §4, §24, §39 (inkl. «RETTET 15/9 — SQL-TEKSTEN» og «KØRT 15/9»); DEL 2 «15. september» §13; mangellisten (Indgangen, n14-4 lukket) |
| **ÅBENT 14/9 — Bastant Design og Nordic By Hand står allerede sådan** | **Betaling uden om platformen har ingen flade.** Fornyelsen regner af `companies.indgangspris_oere` (`Math.floor(/2)` mod 15.000/20.000/25.000); ingen flade og ingen function ud over `stripe-webhook` skriver kolonnen. Fakturabetalte kræver SQL i hånden, ellers `ingen_indgangspris`/`sprunget_over.ingen_pris`. | DEL 2 «14. september» §5; mangellisten (Betaling og fornyelse) |
| **BESLUTTET 14/9 — Jonas opretter nøglen; ÅBENT: bygningen. SYNLIGHEDEN LØST #855 (`b60df81d`, 09:48:17 UTC; bevist på skærm 11:50–11:51)** | **CVR-kilden skiftes fra cvrapi.dk til Virk/Erhvervsstyrelsens CVR-API.** cvrapi's kvote hænger på IP (10:37 200 fra Jonas' maskine, 10:40 QUOTA_EXCEEDED fra edge-runtimen, samme CVR; fri igen kl. 12:00 — vinduet er kortere end et døgn). Ingen nøgle findes i secret-listen eller repoet. **Uafhængigt af kilden er en fejlet berigelse nu SYNLIG (#855):** dommen `cvrOpslagMangler` (`src/lib/cvrBerigelse.ts:65`), kvitteringen siger hvad der mangler og hvad rådgiveren skal gøre, signal på virksomhedssiden (kø `stamdata_mangler`), mærke «CVR-opslag mangler» på listen; selvrensende. YKRG APS bærer det (én af 26), Nordic By Hand ikke. **Tredje afvisning 14/9 (§24):** gennemkørslens virksomhed fik hverken adresse eller branchekode kl. 11:27 UTC — kvoten fri 12:00, brugt op 13:27 dansk. | DEL 2 «14. september» §6, §10, §14, §24; mangellisten (Indgangen: kilden åben, synligheden lukket) |
| **LØST 14/9 — #856 (`0f4d8396`, merget 09:56:59 UTC); skal være udrullet før 22/9** | **To mails lovede svar fra noreply — rettet:** `indgangsMail.ts:163` (dag 0) siger nu «så skriv til kontakt@theboardroom.dk — så finder vi ud af det.», og fornyelsens KVITTERING (`fornyelsesMail.ts:200`, `kvitteringMail` — sendes af `stripe-webhook` efter betaling; varsel 1 og 2 bærer ingen adresselinje) siger «så skriv til kontakt@theboardroom.dk.» `KONTAKT_ADRESSE` bor ét sted (`_shared/indgangsMail.ts:67`), re-eksporteret fra `invitationsMail.ts`; kildeværn på alle tre mailfiler. Samme klasse, IKKE rettet: `indgangsMail.ts:184` (dag 14: «er jeg kun en mail væk») og `:207` (dag 25: «så sig til»). **Gennemkørslen 14/9 fangede at #856 IKKE var udrullet** (dag 0-mailen kl. 11:27 sagde «så skriv til mig»; functions udrullet 10:03, før #856) — udrullet 11:39 med `monday-webhook`; **teksten ubevist** til næste rigtige «Godkendt». | DEL 2 «14. september» §11, §24; mangellisten (lukket) |
| **15/8-2027 — varsel 1 for Nordic By Hand; «tilbyd» skal foreligge senest da. MÅ ALDRIG «Godkendt» i Monday** | **Nordic By Hand ApS** (`a4481db0-…`, CVR 46415124): betalt 40.000 kr. ved to fakturaer uden om platformen; kontrakt 14/9-2026 → 14/9-2027; `indgangspris_oere = 4000000` sat i hånden 10:24, så fornyelsen regner til 20.000 kr. Et «Godkendt» i Monday ville oprette et betalingslink og sende en betalingsmail på 40.000 kr. BETALING-kortet står tomt hele året. | DEL 2 «14. september» §7 |
| **BESLUTTET 15/9 (Jonas) — MOTOR BYGGET, IKKE INTEGRERET. Jonas' tre: én samlemail pr. modtager pr. dansk døgn fra kl. 17 med tidspunkt på hver linje; præsentationer MED (fund H afgjort samme dag); fallback info i to uger hvis ikke bevist 21/9. Chattens: typerne event_published + community_opslag (forslag, ikke modsagt) og datoformatet eventMails.ts' (chattens beslutning 15/9, tilføjelsen til opgaven, genbrugt ved import). Support-svar afventes stadig. Var: ÅBENT 14/9 — IKKE BYGGET (Jonas: nye events samles i én mail)** | **Mailloftet er pr. time og pr. workspace (Pro 100 app-mails/time; Business 300; Enterprise 1.000; docs.lovable.dev/features/custom-emails).** Målt 14/9: fire events (08:30, 08:39, 08:45, 08:50) gav 109 mails til 26 adresser på et kvarter; fra 09:10:13 `failed` på seks adresser; Lovable 09:10: «Sending rate limit has been reached». Alle app-mails deler loftet — med 36 medlemmer rammer TRE events det, og den 22. er det en ny ansøgers betalingslink der afvises uden at hun ved hun venter. `publish-event` skriver N rækker i `notifications`; `process-notification-emails` tømmer hvert 5. minut, 50 ad gangen, ældre end 15 min; `email_sent_at` kun ved succes, så køen prøver igen. **15/9:** motoren `supabase/functions/_shared/samlemail.ts` — ÉN fil som eventMails/opslagsMail, importerer originalerne; testet fra `src/lib/__tests__/samlemail.test.ts` (rene funktioner: tid, dato, 48 t, emne, tidsmærke, mail; 39 tests, tsc 0, hele suiten 3477; spejlet og paritetstesten fjernet før commit) er bygget — ingen function importerer den; integrationen i `send-notification-email` med tørkørsel er næste skridt, og 12-timers-reglen (`BEGIVENHED_TYPES`) skal undtages for samlemailens typer. Der findes ingen egen DEL 3-række for fund H — den bæres her og af DE TYVE (5). | DEL 2 «15. september» §8; DEL 2 «14. september» §13; `recon-samlet-notifikationsmail.md` og `recon-event-fanout.md` (uden for repoet); mangellisten (Drift, kort n14-11; kort w-h) |
| **UBEVIST I DRIFT — #857 (`588db663`, merget 10:00:35 UTC; fem functions udrullet 10:03)** | **Rate limit-grenen:** 429 klassificeres `rate_limited` (`_shared/mailFejl.ts:45-48`), `email_send_log` får status `rate_limited` (ingen CHECK, ingen migration; `EmailLogView.tsx:66`), dagskvoten tæller den ikke (`send-notification-email:305`), begge løkker stopper ved første. Kan kun bevises af en rigtig 429 — som #815's klokke venter på et fejlet træk. Udrulningen bevist indirekte: `send-report-reminder` tørkørte 12:04, «Period: August 2026 \| Day: 14», ingen exception. **NAT: dagskvotens undtagelse fra #857 er afløst af #882 (kun `sent` tæller) — 429-grenens klassificering står stadig ubevist.** | DEL 2 «14. september» §12, §37; mangellisten «Beviser der udestår» *RETTET 15/9 (DEL 2 «15. september» §10): prod HAR CHECK-constrainten `email_send_log_status_check`, og den kendte ikke `rate_limited` — `managedEmail.ts` log() blev afvist i tavshed, så et 429 har ALDRIG stået i loggen. Migrationen `20260915210000` tilføjer værdien (skrevet, ikke kørt).* |
| **BEVIST I DRIFT 14/9 — #882 (`ee598862`, merget 17:55:51 UTC; auto-udrullet): første cron-kørsel efter udrulningen sendte 4** | **Dagskvoten tæller kun `sent`** (`_shared/dagskvote.ts:42`, kildeværn mod en lokal grænse). Før: alle rækker uanset status — fem adresser spærret efter tre modtagne mails, køen stille i 216 min (målt 17:38 UTC) mens vagten så 200 på hvert kald. Målt 19:51 UTC: de fem står med 4 sendt + 2 failed = fire i kvoten. Målt før udrulning: 13 kandidater under 12 timer, alle fra i dag. | DEL 2 «14. september» §37; DEL 4 |
| **ÅBENT 14/9 — info-rækker til rådgivere hober sig op igen; 587 markeret læst i hånden 17:47 UTC** | **Info-notifikationer kan aldrig mailes** — filteret ligger på databasesiden af hentningen (`send-notification-email:187`), og writerne (`report_committed` 229, `report_uploaded` 226, `pulse_checkin` 41 af de 587) skriver videre. Læst, ikke slettet (Jonas: «Alt gammelt kan bare slettes») — kan rulles tilbage på `read_at`. 33 tilbage 17:47 UTC, alle fra i dag. Afgør: skal de skrives, eller ryddes af sig selv? | DEL 2 «14. september» §38; mangellisten (Drift) |
| **FUND 18 — kendt nu; ikke et krav, en forventning** | **Afsendelsesvinduet 07–20 dansk** (`_shared/notificationEmailSelection.ts:139-141`): udskudte kandidater og ALLE handlingsudløste typer (fx eventmails) sendes ikke om aftenen; fem stod «[venter] uden for vinduet» i tørkørslens log 19:49 UTC. En stille kø efter kl. 20 dansk er ikke en fejl — træk `venter_paa_vindue` fra, før noget kaldes en fejl. Stod kun i koden og i forbifarten i DEL 2 «10. september» §8/§11. | DEL 2 «14. september» fund 18; DEL 4; mangellisten (Drift, mailloftet) |
| **OMSKREVET 14/9 sen aften — kort nr. 13: en gæst skal møde en grænse, ikke en fejl (Jonas: gæster ser Community, skriver ikke)** | **Fund 17:** `vis_i_netvaerk` gater kun Netværket; de fem adgangsdomme er uenige om NULL i `contract_end_date` (klienten «full», SQL nej, Netværket ja). To gæster i prod (31/8, 1/9, `handle_new_user`-navne). Mangler: en grænse i Community-composeren i stedet for en afvist INSERT, og at tjeklistens præsentationspunkt udgår for gæster. Bevis før: om en gæst i dag SER feedet (SELECT-policyen kræver også `har_aktivt_medlemskab`). | DEL 2 «14. september» §36; `recon-community-gate.md`; mangellisten nr. 13 |
| **ÅBENT — notifikation ved like (Jonas 14/9: uden, bevidst)** | **Den der bliver liket får ikke besked.** Kræver en ny edge-funktion, dedup-regler og en beslutning om fortrudte likes. Like-knappen selv er i drift i feedet og på trådsiden (#880). | DEL 2 «14. september» §35; mangellisten nr. 18 |
| **BEVIST PÅ SKÆRM 17:44 — #879 (`003fc3a7`): PNG'en viser logo og portræt som skærmen** | html2canvas kender ikke `object-fit`; cover/contain regnes i px (`deling/billedTilpasning.ts`), rammen klipper. Begge formater set i fil. Resten af delingens skærmbevis (hendes data, hentet PNG) står i rækken nedenfor. | DEL 2 «14. september» §34; DEL 4 |
| **BYGGET 14/9 13:06–15:15 UTC — del 1 af delingen (#866, #868–#876); frontend kræver Update-klik; migrationen kørt ca. 16:31 dansk** | **/deling:** galleri med tolv varianter, fuldskærm, «Hent PNG» i 1080×1080/1200×627, hendes navn/virksomhed/portræt/logo (logoet er virksomhedens; portrættet i privat bucket `deling-portraetter`), fire tekster med kopiér-knap og vejledning, «Optaget {måned år}» fra `contract_start_date` og kan slås fra. Bevis = ét skærmbillede af /deling med hendes data og én hentet PNG i fuld størrelse (Cmd+Shift+4, ikke GoFullPage). | DEL 2 «14. september» §30–§32; mangellisten nr. 3 af 18 |
| **MERGET 14/9 — #886 (`319f3f40`, 21:24:57 UTC); ubevist på skærm. Var: ÅBENT — del 2 (tjeklistepunktet) og menupunktet «Fortæl det videre» (bygges 14/9 aften i et andet vindue)** | **Delingen som punkt i onboardingen** for NYE medlemmer (datogrænse, besluttet 13/9): hvad tæller som «gjort», hvor i rækkefølgen, kun fulde medlemmer. Motor + hook + test + stempelkolonne (migration). Menupunktet ændrer den låste menu-test (`hbNav`). | mangellisten nr. 3 af 18; DEL 2 §28, §31; DEL 2 «15. september» §7 |
| **ÅBENT — AFFILIATE (Jonas 14/9), efter 22/9; større end alt bygget 14/9 tilsammen** | **10.000 kr. pr. henvist nyt MEDLEM (ikke lead); fem = et gratis år ved 50.000.** Ikke undersøgt: sporing af hvem der henviste hvem, hvornår en henvisning tæller, udbetaling eller modregning i fornyelsen, statusflade. Hører sammen med delingen — kanal, ikke kun gave. Kortet fra 11/9 (kredit på fornyelsen, `fornyelsespris_oere`) er skærpet, ikke dubleret. | mangellisten (Idéer: affiliate); DEL 2 §33 |
| **FUND 15 — LUKKET I KODE #875 (`011cc580`); ubevist på skærm (Update-klik)** | **Et nyt billede kunne ikke ses:** samme sti = samme URL (browseren spørger aldrig igen) + `cache-control: max-age=3600` (storage-js' standard). Ramte logo, avatar og alle visninger. Versionen ligger nu i den gemte URL (`billedVersion.ts`); `?t=` i state er ude; gamle URL'er migreres ikke. Bevis = skift avatar under Konto og se sidebaren skifte uden reload. | DEL 2 «14. september» §33; DEL 4 |
| **OMSKREVET 14/9 — nr. 16 er ét felt bredt; IKKE før 22/9 (Jonas 14/9)** | **Auth-mails i loggen:** kun «Nulstil din adgangskode» (`recovery`, `Auth.tsx:171`) udløses i vores kode og logges ikke; signup-bekræftelsen er slået fra siden 2/9 (`confirmation_sent_at = NULL`), de fire andre typer har ingen udløser. En «jeg fik ingen mail» fra en ny ansøger handler om betalingslink, invitation eller dag 0 — alle i `email_send_log`. NYT: hooken holdt op med at logge ved Lovables ombygning 8/9 (`b6008c51` → `b45007eb`); ingen opdagede det. Om Supabase Auth kalder hooken: kun Auth settings kan vise det. | DEL 2 «14. september» §29; `recon-auth-mails.md` (uden for repoet); mangellisten nr. 16 + nyt kort (Rådgiverfladen); DEL 4 |
| **LUKKET 14/9 ca. 11:47 UTC — nummeret var transponeret; rettet i hånden, mærket væk 11:49 (skærm)** | **YKRG APS' CVR var 44891917; det rigtige er 44891719** (cvrapi 200: Industriparken 44A, 2750 Ballerup, 562100 «Event catering»). Adresse og `cvr_fetched_at` sat med guard; `industry_code` bevidst urørt («food_restaurant» er husets nøgle). **FUND 13 står tilbage:** et transponeret nummer passerer `CVR_FORMAT`, `harCvr` og kandidatvalget, og registrets «findes ikke» giver samme «no data» som kvoten (`virksomhedsOprettelse.ts:74-83`) — NOT_FOUND-kortet er vigtigere end det så ud. | DEL 2 «14. september» §26; mangellisten (Indgangen: YKRG lukket, NOT_FOUND skærpet); DEL 4 |
| **UBEVIST PÅ SKÆRM — #864 (`4f82e7c4`, merget 12:16:20 UTC); ren frontend, kræver Update-klik** | **Når en upload strander, siger kortet hvad man gør (nr. 8):** kilden (`source_fingerprint.source_system`) → `EKSPORT_VEJE` (`rapporteringTekst.eksportVejForKilde`, ren, paritetstestet); e-conomic peger på saldobalancen som Excel (belæg: HIGH fingeraftryk + to skabeloner); unknown/combined_dk → «Andre», aldrig et gæt; `gross_profit_sum` og ni beslægtede checks har menneskelige tekster. Parseren urørt — kort 12 åbent. Bevis = ét strandet kort på skærm med grund OG næste skridt. | DEL 2 «14. september» §25; mangellisten (nr. 8 lukket; «Beviser der udestår», et tiende) |
| **DESIGNET LAVET 14/9 — del 1 (siden) bygges næst; del 2 (tjeklistepunktet) bagefter** | **Delingskreativen:** tolv varianter (3a/3b/3c × mørk/lys × stående/liggende), ti eksporter 1080×1080 og 1200×627 i `docs/delingskreativ/eksport/`; pladsholdere memberName/companyName/dateLabel + portrætfelt. Medlemmet vælger selv varianten (Jonas 14/9). Intet nyt foto: `jonas-hi.png` 1044×1044 og `morten-hi.png` 728×728 kopieres til `public/`. html2canvas og fontene er allerede i huset; ingen «ocean»-token, ingen mørke Hjemmebane-tokens; «Del direkte» kan ikke bygges. | DEL 2 «14. september» §27–§28; mangellisten kort 3 af 18 |
| **BEVIST 14/9 kl. 09:00:10 — kort 6 af 18's «ubevist» lukket** | **Afsendelsesgrenen:** `intro-reminder-cron` sendte en rigtig mail til kontakt@topix.dk (Topix.dk ApS); `email_send_log` ordret «Din sparring med Morten er inkluderet · intro-reminder · sent» — 25 minutter før #853 (09:25), den gamle tekst, egen konto. Cronen fandt FEM kandidater, fire sprunget over (`ingen_medlemsbruger`); «25 kandidater» var et skøn og er rettet. Kort 6's rest står: filen `20260909180000_onboarding_rytme_cron` skal bogføre prod. | DEL 2 «14. september» §15; mangellisten kort 6 af 18 |
| **LUKKET 14/9 — #849 (`837ca15a`); BEVIST PÅ SKÆRM 12:47 og 13:02, ingen betalingsknapper** | **Fund A: `betalt=1` læses (`Betal.tsx:157`, `laesBetaltHint`); `afgoerKvittering` (`betalKvittering.ts:68-85`) viser «Tak — vi bekræfter din betaling» uden knapper, henter igen hvert 3. sekund i op til 30 sekunder, derefter «Vi mangler den sidste bekræftelse» med «Tjek igen»/«Skriv til os».** Den gamle skærm med tre aktive knapper findes ikke i koden — og ikke på skærmen. | DEL 2 «14. september» §17, §22; mangellisten (Indgangen, lukket) |
| **LUKKET 14/9 — #859 (`a30851cf`, merget 10:44:53 UTC, udrullet 10:46); GRENEN UBEVIST I DRIFT** | **Fund B: invitationens udfald forsvinder ikke længere.** Seks kaldesteder i `stripe-webhook` læste ikke svaret fra `sikrIndgangsInvitation`; nu giver «sprunget_over» og «fejlet» rådgiverne en klokke-besked (`skrivRaadgiverBesked`, type `invitation_fejlet`, dedup på `reference_type` «company» + `companies.id`) med link og udvejen «invitér manuelt». `meldInvitationsUdfald` kaster aldrig. Måling efter udrulning: 400 «Invalid signature» — kæden ikke brudt. Beviset kræver en invitation der faktisk fejler; tre ubeviste grene nu (#815, #857, #859). | DEL 2 «14. september» §20; mangellisten «Beviser der udestår» |
| **LUKKET 14/9 — #860 (`fc3b2565`, merget 11:00:28 UTC); BEVIST PÅ SKÆRM 13:02** | **Fund E: personlig adresse på fladen.** Atten forekomster i seks filer (Betal, CompanyLinkFailedGate, MembershipExpiredGate, FornyelseKvittering, BookSessionView, ChatShell) — nu `src/lib/kontaktadresse.ts` (`mailtoKontakt()`), kildeværn sammenligner src/lib mod `_shared/indgangsMail.ts`. /betal viser «Spørgsmål? Skriv til kontakt@theboardroom.dk». Alle fire steder fra i dag ryddet (#852, #856, #860). | DEL 2 «14. september» §21 |
| **GENNEMFØRT 14/9 kl. 11:26–11:38 UTC — rate12 på 40.000, 4.375 kr. med moms, refunderet; platformen ryddet 11:38 (otte rækker i syv tabeller); EFTER = FØR** | **Gennemkørslen** (mangellistens nr. 1): hele kæden kørte på et menneske. Lukket: nr. 1, måling 1 (`INVITATION_AFSENDER_USER_ID` = morten@molainvest.dk), måling 7 (Monday). Fundet undervejs: dag 0-mailen bar «så skriv til mig» (#856 ikke udrullet — udrullet 11:39, teksten ubevist); tjeklisten 0 af 7 ad Monday-vejen (website mangler); cvrapi afviste tredje gang. Ikke bevist: `RAADGIVER_MAIL_TIL`, dag 14/25/31. | DEL 2 «14. september» §24; `recon-gennemkoerslen.md` (uden for repoet) |
| **NYT 14/9 — fra gennemkørslen; ingen kode planlagt** | **Tjeklisten er 0 af 7 ad Monday-vejen mod 1 af 7 ad importvejen.** «Din virksomhed» dømmes gjort på website + branche + CVR; importvejen får alle tre fra regnearket, Monday-vejen sætter branche-label og CVR, ikke website — punktet står ugjort. Reconen (§16) antog 1 af 6/7 fra start — det gælder kun importen. Et nyt medlem fra Monday ser altså «0 af 7» ved første login. | DEL 2 «14. september» §24; mangellisten (Indgangen) |
| **MÅLT 14/9 — prisen på gennemkørslen** | **Billigste første træk: rate12 på 40.000 = 3.500 kr. ekskl. moms (ca. 4.375 kr. med moms).** Opretter et abonnement der trækker hver måned i tolv måneder, `cancel_at` = start + 12 mdr − 1 dag. Ingen testtilstand (én `STRIPE_SECRET_KEY`, ingen `sk_test`-gren), ingen lavere pris (`tjekPrisniveau` afviser alt uden for 40.000/50.000). Oprydning bagefter: sletning i platformen — refusion rører ikke platformen (næste række). | DEL 2 «14. september» §18; `recon-gennemkoerslen.md` §2–§3 (uden for repoet) |
| **FÆLDE 14/9 — ingen kode planlagt** | **En refusion rydder ikke op.** `stripe-webhook` har ingen gren for `charge.refunded`, `charge.dispute.*`, `invoice.voided`, `credit_note.*`; alt andet end de seks kendte events svarer `{ received: true }`. Efter en refusion står `contract_end_date`, `indgangspris_oere`, `status='active'`, `company_perioder` og invitationen som før. Opsigelse af et rate-abonnement i Stripe springes over når `metadata.art` er sat. | DEL 2 «14. september» §19; DEL 4 |
| **RECONNET 14/9 — skærmbevis, ikke bygning** | **Lisbeths første uge** (`recon-hendes-foerste-uge.md`): tjeklisten har seks punkter uden video (pillen «0 af 6»; «fem» rettet to steder), punktet udgår rent; tom-tilstandene i Nøgletal/Budget/Rapportering er rene (0, «—», NaN, tomme grafer: ingen); 1 af 6 gjort fra start (virksomhed, fra importen). Kort 7 af 18 = én skærmgennemgang. | DEL 2 «14. september» §16; mangellisten kort 7 af 18 |
| **22/9 — WEBINARET; de fjorten dage efter (til ca. 6/10) er tidsrammen** (Jonas 13/9). A reconer «hvad en ny ansøger møder» (`~/Downloads/recon-de-nye-medlemmer.md` — ikke skrevet ved bogføringen, ikke læst) | **Ca. 350 tilmeldte, 40 % møder op, næsten 10 % af dem ansøger → 10–15 ansøgere; «minimum fem nye ansøgere eller medlemmer inden for de næste fjorten dage, og dem skal vi tage godt imod».** Kortene sorteres efter hvad en NY ansøger møder de første fjorten dage — ansøgning (Monday), afklaringssamtale, aftalegrundlag, betalingslink (kæden har aldrig haft en rigtig virksomhed — nul rækker i `company_betalingslink`), signup, ankomst, tjekliste, første upload, første session. RETTELSE af chattens vurdering: SoMe-deling er ikke «efter oplevet værdi, uge 2–4» — nyheden er OPTAGELSEN og er stærkest i samme uge (Jonas: «det er faktisk en stor ting for mange at få lov til at blive medlem»). | DEL 2 «13. september» §22; mangellistens delings-kort |
| **14/9 — PLANEN FREM MOD 22/9** (skrevet 14/9 morgen; ingen kode; DEL 2 «13. september» §26–§27) | **Målinger → gennemkørsel → A/B/C → delingen.** De ni prod-målinger står klar med tærskler og én SQL i `~/Downloads/maalinger-foer-webinaret.md` (tre er secrets og kan kun bevises gennem brug; cron-JOBNAVNE ≠ funktionsnavne; Monday-board-id er en kodekonstant). Gennemkørslen (mangellistens nr. 1) lukker syv kort og de tre «UBEVIST». Tre fund er I STYKKER og har fået kort øverst i mangellisten: A `betalt=1` læses aldrig (rammer hver betalende) — **LUKKET #849, bevist på skærm 12:47/13:02 («14. september» §22)**, B invitationens udfald kastes væk (betalt medlem uden login, tavst) — **LUKKET #859 (§20; grenen ubevist i drift)**, C invitationsmailens fire usandheder (i `email_templates`) — **LUKKET #852** (skabelonen stadig `enabled=false`; fallback'en er mailen). Fund E (jonas@topix.dk på /betal) — **LUKKET #860, bevist 13:02 (§21)**. Delingen er et krav (§27): kreativ + upload + 3–4 tekster som tjeklistepunkt for nye; kritisk sti er designet. De atten kort bærer tag «22/9 · nr. N af 18». | DEL 2 «13. september» §25–§27; mangellisten «Rækkefølgen» (tier øverst); `~/Downloads/recon-de-nye-medlemmer.md`, `recon-delingen.md`, `maalinger-foer-webinaret.md` (uden for repoet) |
| **STORT ÅBENT SPOR — Jonas 13/9 sen aften. BESLUTTET: IKKE før webinaret 22/9; først en recon af hvad Monday faktisk gør i dag** | **Hele ansøgningsprocessen ind på platformen i stedet for Monday.** Jonas: «en rigtig lækker ansøgningsformular, som er visuelt overskuelig og lækker at gå igennem. Og så har vi ligesom al viden om virksomhederne allerede fra start.» Flowet: afklaringssamtale med Jonas / afvis / følg op om X måneder / genåbn når en plads bliver ledig; aftalegrundlag → «godkendt» → betalingslink → medlemskab; påmindelser på bookinglinket dag 2, 5 og 10 («så vi ikke taber ansøgere i det»); tracking af leads fra Meta («sindssygt meget styr på»); «hvilke mails der skal sendes hvornår». Det meste EFTER godkendelsen findes (chattens læsning, ikke målt): Calendly-kæden (§19), `import-application`/`monday-webhook`, `company_betalingslink` med 30-dages frist, `indgangs-paamindelser-cron`, `intro-reminder-cron` som mønster. Det der mangler er selve ansøgningen og alt før godkendelsen. Pladsholder i mangellisten: «Ansøgningsflowet skal flyttes til platformen». | DEL 2 «13. september» §23 |
| **RECONNET 13/9 sen aften — IKKE KLAR; to spørgsmål skal afgøres først** | **Kort 29 — «Fra budget» som målkilde på Nøgletal.** (1) ENHEDEN: prod-målingen 11/9 talte nøglen `loenninger`, men koden kobler pr. GRUPPE (`GROUP_TO_REPORT_FIELD`); `saas_b2b` har ingen `loenninger`, importerede budgetter bærer egne nøgler — nøgle-opslaget overser dem (samme fælde som kort 76). (2) FORMLEN: ingen afvigelsesfunktion på KPI-niveau; tre forskellige domme i huset (budgetfladens 10 % fortegnsbevidst, forsidens 10 % omsætning-only friskhedsgatet, Nøgletals målopfyldelse). Holder: intet bygget, budgettet er månedligt, `budgetNoegleFor` findes. SQL for enheden og for målte måneder mod budget i reconens §6. Tre bifund som eget kort. | DEL 2 «13. september» §24; `~/Downloads/recon-kort29.md` |
| **I DRIFT 13/9 sen aften (#844, merget 20:42:15 UTC; migrationen kørt 22:42; fire functions udrullet 20:45 UTC; BEVIST PÅ SKÆRM 22:48:25) — TEKSTERNE ÅBNE (vindue A, nu)** | **Den inkluderede session med Jonas kan bookes.** Ny kolonne `companies.jonas_session_used_at` (søster til Mortens `intro_session_used_at`; en tabel ville flytte asymmetrien, ikke fjerne den); `create-free-intro-booking` tager `{ advisor }` og lægger rækkens id i linket fra start; `calendly-webhook` genåbner retten pr. rådgiver ved host-aflysning, aldrig for en købt række; én dom for begge rettigheder på `/book-session` — Morten-kortet forsvinder når retten er brugt, Jonas-kortet findes altid og skifter fra inkluderet til købt; «link-ready» hører til det inkluderede kort (ingen mail på den vej). Secret `JONAS_CALENDLY_EVENT_SLUG` = «intro-snak». **Det der venter:** (1) kortenes tekster — rådgiverlinjen er en etiket, brødteksterne næsten ens, «én session per virksomhed» som grå fodnote; rammen er Jonas' ord 13/9 (medlemmet bestemmer selv, udløber ikke, 30 minutter — ikke «onboarding», ikke «strategi-session»); A retter nu. (2) En rigtig inkluderet booking der kommer tilbage som `booked` med tid — ubevist. | DEL 2 «13. september» §20; `~/Downloads/verifikation-jonas-session.txt`, `diff-jonas-session.txt` (uden for repoet) |
| **GJORT 13/9 kl. 20:50:13–20:54:51 UTC, i hånden — fundet 14/9 (denne række sagde «ikke gjort» og var FORKERT). ÅBENT: 11 har begge rettigheder stående** | **Jonas-sessionen er lukket for 23 af 38.** `companies.jonas_session_used_at` er sat på 23 af 38 med 23 forskellige tidsstempler ~11 sekunder imellem, i streng alfabetisk rækkefølge (ANLA GLAS → YKRG) — et menneske ned ad en sorteret liste i `EditCompanyDialog`, to minutter efter #844's skærmbevis. Ikke en DEFAULT, ikke en migration, ikke Claude Code. Krydset mod Mortens kolonne: 9 begge, 14 kun Jonas, 4 kun Morten, 11 ingen af dem; alle 23 `status=active`. Nye virksomheder får NULL og ser sessionen som inkluderet. Om de 11 skal lukkes: ikke afgjort. | DEL 2 «14. september» §3; mangellisten «Gamle virksomheder skal ikke have tilbuddet om Jonas-sessionen» (omskrevet 14/9) |
| **RECONET 13/9 sen aften — IKKE afgjort om der skal bygges noget** | **Efter en session sker INTET.** Ingen tabel peger på `session_bookings`, rækken har ingen fritekst, «afholdt» er en dom, medlemmet ser intet, designet har aldrig taget stilling, og `raadgiver_opgaver` udelukker sessioner eksplicit. `advisor_session_notes` er ikke det navnet siger (AI-forberedelses-cache, død siden 26/3, to slettere) — på slettelisten. Husets mønster for «noget skete, her er hvad der kom ud af det» er rapporten (hændelsesrække + kommentartabel FK'et til den + ekko i chatten). Reconens SQL (§4) er ikke kørt. | DEL 2 «13. september» §21; `~/Downloads/recon-efter-sessionen.md` (uden for repoet); mangellisten «En afholdt session efterlader intet spor» |
| **AFGJORT 11/9 (Jonas: «A»), GJORT 13/9 (#836)** | **`run-weekly-agent` er SLETTET.** Filen, `config.toml`-blokken og `weekly_cron` i `run-company-agent`s hvidliste er væk; `run-company-agent` udrullet 17:09 UTC. Den havde aldrig kørt (kun `Deno.cron`, 0 `weekly_cron` i `agent_runs`). Ugefokus (`generate-weekly-focus`) kører uændret hver mandag. Det der står tilbage af spørgsmålet — om nogen læser ugefokus — er samtalen med Morten; `weekly_focus.seen_at` på forsiden har første hele uge efter 14/9. Åbent: funktionen ligger formentlig stadig udrullet hos Lovable (kortet «Oprydningens rester»). | DEL 2 «13. september» §16; «Ugefokus og ugeagenten» (grundlaget for valget) |
| **FØR 13/9** — Stripe er sat op 10/9 kl. 20:50–21:05 (past-due, mails til, dansk); **(1) BYGGET 11/9 (#815), UDRULLET 13/9 kl. 12:04 UTC — UBEVIST I DRIFT**; (2) uændret, ikke bygget | **Restancen:** (1) ~~rådgivernes klokke ved fejlet træk~~ → **bygget 11/9 (#815)**: `skrivRaadgiverBesked` i `payment_failed`, dedup `company_traek.id`, værn mod at et betalt træk vendes til fejlet. Update klikket 11/9 kl. 11:12; `stripe-webhook` udrullet eksplicit 13/9 kl. 12:04 UTC i Lovables build-chat (ordret: «Endpointet svarer live med HTTP 400 Invalid signature (forventet)»). **Ubevist i drift:** doggybeds træk 13/9 gik igennem (`betalt` kl. 09:36:24 UTC, DEL 2 «13. september» §1), så `invoice.payment_failed` blev aldrig sendt; grenen bevises først af et fejlet træk — hvornår det sker, er ukendt. Beviset når det kommer: svaret bærer `traek.id` og `klokke`; en række pr. rådgiver i `advisor_notifications` med `type = 'traek_fejlet'`, `reference_type = 'traek'`, `reference_id = company_traek.id`; klokkens link `/virksomhed/<id>?section=aftale`; et senere `payment_failed` for samme faktura svarer `sprunget_over: allerede_betalt`. (2) retries opbrugt → `invoices.send` når `next_payment_attempt` er null — **ud af A1 11/9, uændret 13/9**, forudsætningerne står på kortet (otte forsøg over en måned). | DEL 2 «13. september» §1–§2; DEL 2 «11. september, formiddag»; fornyelseskæden §9; mangellisten (Betaling) |
| **LØST — MÅLT KØRT 11/9 kl. 09:20** (alle tre stod i prod; `query-results-export-2026-09-11_09-20-04.csv`). Var: SKREVET 10/9 (#801), IKKE BEKRÆFTET KØRT | **Tre migrationer:** `20260911020000_messages_delete_15min.sql` (to DELETE-policies erstattes af «within 15 min» + advisor), `20260911030000_feedback_bucket_mappetjek.sql` (mappetjek, 5 MB, image/*), `20260911040000_companies_status_check.sql` (CHECK + NOT NULL; prod målt 30/8, 0 NULL). Bevis: SELECT'en nederst i hver fil — indtil da gælder de gamle policies. | DEL 2 «10. september, sen aften»; `SECURITY_BASELINE.md` §5 |
| **RETTET 11/9 — «/members er tømt» holdt ikke** (recon-a2 kort 3 og 83 §4): `Members.tsx` renderer stadig header «Virksomheder», «Importér ansøgning» (`:1058-1065`), «Inviter ny bruger» (`:1066-1070`), `MembersStatsBar` (`:1074`), listen med `MemberCompanyRow` (`:1184-1200`: omdøb, invitér, gensend, fjern, slet, redigér virksomhed), «Slet virksomhed / + brugere» (`:1316`) og `MembersAdminSection` (`:1239-1249`); ruten `App.tsx:243` kræver advisor. Var: «RETTET 10/9 (#771–#773): `/members` er tømt — kun importen og onboarding-tragten står». `/settings` ER konverteret (#773). **EFTER 9/9** — det der stod tilbage efter rådgiverfladen og de to trin | ~~Otte ting kun på `/members`~~ → **10/9: importen bliver til ansøgningsflowet flytter; onboarding-tragten skal IKKE flyttes.** 11/9: siden er ikke tømt — se rækkens første celle; «Fjern»-knappen og `remove-member` fjernes i samme bygning (besluttet 11/9, kortet «Fjern fra virksomheden»). ~~`/settings`' tre rester~~ → **10/9: konverteret (#773).** **Aftale-kortet** er bygget med slutdato og pris; perioderne vises når nogen har nogen — 27 af 27 har nul. **Bevis:** `_shared/ikkeIGang.ts` i «View code» efter merge, Update for forsiden. **Ikke kode:** skriv til de seks der aldrig har uploadet — bed om historikken. | DEL 2 «9. september», mangellisten «Rådgiverfladen» |
| **9/9 — I MORGEN** (punkt 1 og 2 er KØRT 8/9: de syv slettet kl. 12:14–12:26, DEL 2 «De otte tidligere»; kvitteringen siger en dato og kan fortrydes, #736) | **1) KØRT 8/9 kl. 12:14–12:26** — de syv tidligere slettet i fire hold efter `docs/koereplan-de-syv-tidligere.md` (nu historik); 8 af 8 stemplet, sweep tomt. **2) KØRT (#736)** — kvitteringen siger «Din data slettes den …» (motorens frist) og kan fortrydes til dagen før. **3) Cron-migrationsfilen** der bogfører `slet-medlemsdata` (`0 12 * * *`), formen fra `20260901112000_prod_cron_bogfoert.sql`. **4) Planen for 8/9, punkt 6–7** (punkt 4 og 5 er GJORT 8/9 eftermiddag: digesten kalder milepælsdommen #741/#742, kvitteringsmailen #739 — DEL 2 «Eftermiddagen 8/9»): toasten i `Index.tsx`, og den tomme platform (a–d). **5) Intro-sessionens tid** — starttiden ankommer i `calendly-webhook` og kastes væk; bygges (det andet vindue 8/9 aften). **6) Åbne fund uden beslutning:** de betalte 1:1-sessioner der stopper ved `booking_sent`; agentens forslag (op til tre pr. virksomhed pr. mandag + ét pr. rapport, ingen læser svarene) — mangellisten bærer begge. | `docs/koereplan-de-syv-tidligere.md`; `docs/koereplan-slettefunktionen.md`; DEL 2 «Slettefunktionen»; øverst «PLANEN FOR 8. SEPTEMBER» |
| **22/9 — BEVIS** (kortene «aftale-kortet» og «betalingshistorik» er slettet fra mangellisten 10/9; beviset står her) | **Første rigtige periode på `/settings`.** #773 viser aftalen (slutdato, start, pris fra `companies`) og «Betaling» (perioder og fakturaer) — men målt 9/9 har 27 af 27 nul rækker i `company_traek`/perioder. PHILBERTs varsel 2 går 22/9 og bliver den første række. **Digesten er slukket 11/9 kl. 12:07** (`cron.unschedule`, CSV 12:07 FØR / CSV 12:18 EFTER «0») — digesten sender ikke den 22/9; de øvrige daglige jobs kører som før. Bevis: kortet viser perioden og fakturaen på skærmen, og `company_fornyelse` læses ikke (låst med test). | DEL 2 «10. september» (#773); «11. september, eftermiddag» §2 |
| **10/9** — MÅLT 6/9: ikke en tændingsdato | Fornyelsesordningen træder i kraft. Tre udløber inden og falder udenfor. **Intet sker i koden den dag:** `FORNYELSE_IKRAFT_DATO` sammenlignes med virksomhedens slutdato, ikke dags dato, og bliver virkningsløs efter 10/9. Kædens forudsætninger er alle grønne (seks migrationer kørt, ni priser, seks events, fire funktioner udrullet — men 401 beviser kun at de findes, ikke hvilken version; driftsbeviset fra 1/9 ligger før #529, #561, #563, #572 og #583). **Det der IKKE er klar: ordningen har ingen afsender** — rækken «BESLUTTET 6/9» nedenfor. | fornyelseskæden §13; fornyelsesordningen §5, §7; DEL 2 «Fornyelseskæden» |
| BESLUTTET 6/9 (Jonas), TALLENE 7/9 — KÆDEN ER HEL og BEVIST I PRODUKTION 7/9 kl. 11:57 (#680, #681, #691, #692, #694–#697); LØST 7/9 kl. 14:51: cron-jobbet er PLANLAGT (0 11 * * *, aktivt) — **22/9** er PHILBERTs varsel 2 | **Medlemmet skal høre om sin fornyelse fra SYSTEMET, ikke ved at miste adgangen.** Formen, med tal fra 7/9: mail 1 ved 30 dage før slutdato, mail 2 ved 7 dage, tilbuddet lever 14 dage efter slutdato (bygget som tilstand, #678); et tilbud om at booke «En snak om din fornyelse» via https://calendly.com/topix-jonas/fornyelse (almindeligt link, ikke engangslink); og en notifikation til rådgiveren når mail 1 er sendt, så den personlige chatbesked kommer EFTER systemets mail og ikke i stedet for. **Konsekvens:** rådgiverbeslutningen skal foreligge senest dag 30, ellers sendes intet — en glemt beslutning aflyser mailen, den forsinker den ikke. **LØST 7/9 kl. 14:51:** jobbet er planlagt — `fornyelsesvarsler`, `0 11 * * *` UTC (13:00 dansk), aktivt, målt i `cron.job`. Første kørsel 8/9 finder ingen forfaldne (PHILBERT og CARMA er stemplet); næste rigtige afsendelse er PHILBERTs varsel 2 den 22/9, og den sker af sig selv. Rådgiveren ser stemplet på forsiden («Varslet er sendt — N dage», #696); en egen notifikation til rådgiveren er ikke bygget. *Bevist i produktion 7/9 kl. 11:57:* PHILBERT fik varsel 1, CARMA fik varsel 2 på dag 0 uden varsel 1, begge stemplet (DEL 2 «Fornyelseskæden»). Motoren `afgoerForfaldentVarsel` (#680) og `fornyelsesvarsel-cron` (#681) FINDES; tørkørslen kl. 10:15 fandt PHILBERT → varsel 1 og CARMA → varsel 2 med «varsel 1 springes over: sen beslutning» (DEL 2 «Fornyelseskæden», fornyelseskæden §15). Stemplerne findes (`varsel_1_sendt_at`, `varsel_2_sendt_at`, #674, i prod 7/9 kl. 08:51; ingen trigger — skrivestien sætter selv `updated_at`). **Formen SPEJLER INDGANGENS KÆDE** (målt 6/9, `~/Downloads/recon-indgangens-mailkaede.md`, uden for repoet): pg_cron → `net.http_post` med vault-nøglen → Bucket B-funktion med `authenticateServiceRole` → TØRKØRSEL SOM STANDARD → ren motor afgør hvilken dag hver række står på → byg mail → enqueue → stempl KUN når afsendelsen lykkedes. **Datamodellen (LØST 7/9, #674):** stempel-felterne findes nu — to navngivne kolonner frem for et dag-nummer, fordi de to varsler kan sendes uafhængigt. **Calendly (LØST 7/9):** event-typen findes, linket står ovenfor. Betalte bookinger registreres i dag aldrig tilbage i platformen (målt 3/9), så linket i mailen skal være et almindeligt link — vi lover ikke en måling vi ikke kan holde. **Tempoet, målt i prod 6/9:** efter Doggybed 13/10 er der ingen fornyelse før Livja 16/12 — to måneders hul; derefter fjorten virksomheder marts–juni 2027, over halvdelen af porteføljen. Deadline for mailkæden: Livja minus 30 dage. | fornyelsesordningen §7; fornyelseskæden §13.4; indgangen-design §26 (formen) |
| åbent, målt 6/9, delvist ændret 7/9 — værnet er stadig et menneske | **Datogaten omgås stadig hvor pengene skifter hænder.** `hent-fornyelsestilbud` kalder nu motoren (#678), men både den og `opret-fornyelse-checkout` kræver `udloebet_tilbyd`, som afgøres i udløbsgrenen FØR datogaten. En virksomhed «uden for ordningen» med beslutning `tilbyd` får derfor stadig et systemtilbud og kan betale — nu dog kun de første 14 dage efter udløb. Om gaten SKAL gælde der, er en beslutning — i dag er det rådgiverens finger der er værnet. | fornyelseskæden §13.3 |
| LØST 7/9 (#678) — vinduet; Studio Minis række er nu en BESLUTNING om timing | **Tilbudsvinduet efter udløb er en tilstand:** `udloebet_vindue_lukket`, kun efter `tilbyd`, fra dag 15 efter slutdato; bevist i drift kl. 09:36–09:38 (DEL 2 «Fornyelseskæden»). **Studio Mini (slut 5/9, `tilbyd`) FORLÆNGER IKKE (Jonas 6/9):** i dag er de dag 2 i vinduet; fra 20/9 lukker vinduet af sig selv, og rækken bliver `udloebet_vindue_lukket` uden at nogen rører den. Beslutningen er om den skal ryddes FØR — indtil da viser gaten dem et tilbud. CARMA STUDIO (7/9, `tilbyd`) håndteres manuelt i dialog. **15/9:** intet ændret; Jonas' beslutning 6/9 står (`fornyelseskaeden-1-september.md:567-575`), rækken er stadig «tilbyd», og vinduet lukker af sig selv efter 19/9 (dag 14; 20/9 er dag 15 → `udloebet_vindue_lukket`). Ingen vinduesmails til dem uden Jonas' ord (DEL 2 «15. september» §14). | fornyelsesordningen §3; fornyelseskæden §13.4, §14 |
| BYGGET 7/9 eftermiddag (#683 motoren, #684 pengevejen), udrullet kl. 08:53 UTC — ændrer beslutningen fra 1/9 | **Fornyelse kan betales FØR slutdatoen.** Før kunne et medlem på dag 22 hverken se eller betale sit tilbud (checkout 403, `hent-fornyelsestilbud` null, gaten kun for udløbne). **Regnestykket, ordret:** betalt FØR eller PÅ slutdatoen → GAMMEL SLUTDATO + 12 måneder; betalt EFTER → BETALINGSDAGEN + 12. Grænsen er kontinuert (28/9 og 29/9 → 2027-09-29; 30/9 → 2027-09-30). `periode_start` er udledt af `company_perioder`s invariant: ny periode begynder hvor den gamle slutter. 29. februar er en synlig gren (→ 1/3 året efter, slutdatoen er eksklusiv). **`cancel_at` er IKKE ændret, og skal ikke ændres** — abonnementet er betalingsplanen, ikke adgangen; en der betaler tidligt får et abonnement der ophører FØR kontrakten, og det er rigtigt (DEL 2 «Fornyelseskæden», rettelsen; DEL 4). | fornyelseskæden §15.3, §7; fornyelsesordningen §1 |
| LØST 7/9 (#691) — fornyelsesbåndet, bevist kl. 12:45; formen strammes (UNDERVEJS, Jonas 7/9) | **Et ikke-udløbet medlem kan betale, men kan ikke SE tilbuddet — LØST: båndet på forsiden.** `MembershipExpiredGate` vises kun ved tier `expired` (`Index.tsx`), og ingen anden flade viser fornyelsen til et medlem (målt 7/9). Betalingsvejen er åben fra dag 60 (`klar_til_tilbud`), men den eneste vej til checkout er gaten. Hvor tilbuddet skal vises før slutdatoen — forsiden, en mail, et kort — er ikke besluttet. *Målt 7/9 middag (`~/Downloads/recon-fornyelse-efter-betaling.md` §6, uden for repoet): `MembershipExpiredGate:88` er det ENESTE kaldested i `src/`; reconen kortlagde otte eksisterende mønstre at vælge imellem, og chattens udløbsbånd (sage-flade, rust-ikon, gatet på tilstand) er formmæssigt tættest — og det blev formen.* *LØST 7/9 kl. 12:45 (#691): `FornyelsesBaand` øverst på forsiden, kun når serveren siger tilbud; bevist på Topix med 20.000 kr. og tre modeller (DEL 2 «Fornyelseskæden»). Kortet er slettet fra mangellisten. Undervejs: større tekst, én primær knap, luft.* | DEL 2 «Fornyelseskæden»; fornyelseskæden §15.3 |
| samtale, målt 6/9 | **To virksomheder uden slutdato rammer aldrig ordningen:** Alexander Lunds virksomhed og Martin Larsens virksomhed (`ingen_slutdato`). Og **Bastant Design** (31/12-2027) har ingen indgangspris, så fornyelsesprisen er ukendt — et `tilbyd` dér ville give et tomt tilbudskort. | fornyelseskæden §13.4 |
| **LØST 13/9 — #563 og #572 BEVIST** (prod målt kl. 14:01, `query-results-export-2026-09-13_14-01-42.csv`); #815 står tilbage — se rækken «FØR 13/9» | **Doggybeds træk på 4.375 kr. gik igennem.** Sektion `a_doggybed_traek`, ordret: «betalt · in_1UF8tR3CvBmCx5PthFjFOjFc;a_doggybed_traek;2026-09-13T09:36:24.309794+00:00 \| beloeb 437500 \| id 781b4c5c-77d8-4ecf-8b45-30e085cc79b0» — kl. 09:36:24 UTC (11:36:24 dansk), 437.500 øre = 4.375 kr., ÉN række i `company_traek` med `status = 'betalt'` (**#572**). Sektion `b_doggybed_abonnement`, ordret: «Doggybed;b_doggybed_abonnement;subscription_status NULL \| stripe_customer_id NULL \| slutdato 2026-10-13» — `companies.subscription_status` forblev NULL på doggybed (`382fd787-3141-45c7-8eea-297b7b947fe0`), fordi grenen springer over med vilje (**#563**); `stripe_customer_id` er STADIG NULL (kort 26). `customer.subscription.updated` grøn i Stripes Event deliveries: ikke målt. **#815 er IKKE bevist og KAN ikke bevises af dette træk:** sektion `c_klokke_traek_fejlet`, ordret: «ingen raekker i alt (kontrol);c_klokke_traek_fejlet;0» — et vellykket træk sender aldrig `invoice.payment_failed`, og der skrives ingen besked, præcis som grenen skal. Beviset kræver et fejlet træk; hvornår det sker, er ukendt (formuleringen står i rækken «FØR 13/9»). `stripe-webhook`s version: udrullet eksplicit 13/9 kl. 12:04 UTC, efter trækket. Var før 13/9: «MÅL at det gik igennem» med beviserne for #563 (migration-recon §26), #572 og #815 (11/9); skærmbeviset for klokkens link var FØRT 11/9 ca. 11:15 («Ny resultatopgørelse fra remm.» → virksomhedssiden, Jonas: «Det virker umiddelbart», uden skærmbillede; Update klikket 11:12). TuaMea (2/9), Floren engros og BR Roset (3/9) venter til efter egne træk. | DEL 2 «13. september» §1–§2; migration-recon §25, §26; indgangen-design §31 |
| **Kort 60 — tre åbne beviser** (i drift 11/9: merget 12:25:37, migration 12:26, Update før 12:28, `onboarding-rytme` udrullet 12:28, tørkørsel 9091 kl. 12:31 — DEL 2 «11. september, eftermiddag» §3) | **1)** Tjeklistens punkt «Præsentér dig i fællesskabet» på et medlems skærm (ikke rådgiver, ikke legat, `membershipTier === "full"`) — skærmbillede eller Jonas' ord. **2)** Den første rigtige præsentation: en række i `community_traade` med `kilde_type = 'praesentation'` og `status = 'aktiv'` (SQL editor) — og at punktet derefter står som gjort. **3)** Velkomstmailens nye tekst: første nye medlem dag 0–1 får mail A med det syvende punkt «Præsentér dig i fællesskabet — …» (`email_send_log` eller mailen selv). Hver dag uden nyt medlem er dag uden bevis for 3). | DEL 2 «11. september, eftermiddag» §3; `~/Downloads/verifikation-kort60.txt` |
| LØST 3/9 kl. 10:42 | **Hvorfor skrev webhooken ikke på 2/9?** Eventet BLEV leveret; webhooken svarede 500 i skrivningen (fem gentagelser fra Stripe). Efter #563 gensendt manuelt → 200 `skipped: migreret_subscription`, «Recovered». Webhooken får subscription-events; hvidlisten er bevist på det rigtige event. Hvad der kastede, afdækkes bevidst ikke — men det art-løse selvbetjeningsabonnement går stadig gennem den kode. | migration-recon §26 |
| **22/9** varsel 2 — jobbet ER planlagt (RETTET 11/9: `cron.job` målt kl. 09:20 har `fornyelsesvarsler` «0 11 * * *» gennem `kald_edge('fornyelsesvarsel-cron', '{"dry_run": false}')`; «jobbet er ikke planlagt» var forældet siden 7/9 kl. 14:51); **29/9** er PHILBERTs sidste dag MED adgang (#698) | PHILBERTs fornyelse: `tilbyd` står i `company_fornyelse`, prisen er gyldig (20.000 kr.). *7/9 kl. 11:57:* **varsel 1 ER SENDT** (nille@…, 22 dage, 20.000 kr.) og stemplet `varsel_1_sendt_at`; båndet på forsiden viser tilbuddet (#691), så PHILBERT kan både se og betale før 29/9 (#684). **Varsel 2 forfalder 22/9** — og sendes af jobbet kl. 11 UTC (målt 11/9); intet manuelt kald. **Digesten sender ikke den 22/9:** `send-monthly-digest` («0 8 22 * *», jobid 550) er slukket 11/9 kl. 12:07 — CSV 12:18 sektion `a_digest_efter`: «0»; de øvrige daglige jobs kører som før. Doggybed 13/10 står som `tilbyd_ikke`. | fornyelseskæden §13.4; prioritering §1; DEL 2 «11. september, eftermiddag» §2 |
| LØST 3/9 — **14/9: cronen har aldrig haft en linkrække at ramme** | **Cron-jobbet `indgangs-paamindelser` (0 10 \* \* \*)** er planlagt og aktivt, verificeret i `cron.job`. Tørkørsel og rigtig kørsel bevist på FLOOR1 (enkeltkørsel i hånden). Secret `RAADGIVER_MAIL_TIL` er ikke bekræftet sat i denne bogføring — **heller ikke af gennemkørslen 14/9: prisen var sat fra start, så rådgivermail-grenen blev aldrig udløst (§24).** Fundet 14/9: den eneste vej til en linkrække (`monday-webhook`) var lukket siden 21/3 (DEL 2 «14. september» §1); første rigtige række kom 14/9 kl. 11:27:51 (gennemkørslen, slettet igen 11:38). | indgangen-design §26, §30 |
| LØST 3/9 | **Dag 31-fakturaen** (#559–#561): motoren opretter kunde + faktura med `metadata[company_id]` på begge, cronen sender den FØR dag 31-mailen, `invoice.paid` er tilmeldt (fem events formiddag, seks efter #572; `invoice.created` bevidst ikke) og skriver samme kæde som checkout med `betalingsmodel 'faktura'` og beløb uden moms. Bevist i drift 3/9 kl. 10:00–10:11 inkl. betaling og kreditnota. | indgangen-design §30 |
| LØST 3/9 eftermiddag (#572, #574) | **Månedstrækkene registreres** — både betalte og fejlede, i `company_traek`; `invoice.payment_failed` tilmeldt (seks events); fejlet træk ses på /members. Migration kørt, webhook deployet, Update klikket. Bevis 13/9. | indgangen-design §31 |
| UDSKUDT 3/9 aften | **Restancepolitikken** (`past_due` = åben adgang, `unpaid` = lukket) er besluttet og bygges IKKE nu. Tre grunde: den rammer nul rækker (`subscription_status` er NULL på alle 38, målt kl. 20:32, og kun det art-løse selvbetjeningsabonnement kan sætte det — der findes ingen); den ville ændre FEM domme, ikke tre, og to af dem (`har_aktivt_medlemskab`, `har_aktivt_abonnement`) er ikke paritetstestede og bærer community, indhold, events og storage; og formen er forkert for rateabonnementer, hvor en fejlet rate er en inddrivelsessag (`company_traek`, #572/#574), ikke en adgangssag. Bygges den dag det første selvbetjeningsabonnement oprettes: motor før flade, paritetstest på alle fem domme. | `docs/adgangsdomme.md` |
| åbent | **`sikrIndgangsInvitation` kender ikke «allerede accepteret»**: den leder efter pending; findes en accepteret række, fejler insert på `UNIQUE(company_id, email)`, og invitationen sendes ikke. Set 3/9 på FLOOR1. Kan ikke ske for indgangen i drift, men tilstanden er ikke håndteret. | indgangen-design §30 |
| åbent, besluttet | **Rykkere på dag 31-fakturaen**: Stripes egne påmindelser slås IKKE til (`auto_advance=false` med vilje — en fjerde stemme på engelsk fra en anden afsender ville skurre). Skal der rykkes, er det vores egen kæde. Ikke bygget. Bemærk også: dag 31-mailen siger 50.000 kr, fakturaen 62.500 kr inkl. moms — ikke ændret. | indgangen-design §30 |
| LØST 3/9 kl. 11:50–12:00 | **Adressen på de eksisterende virksomheder**: `berig-virksomheder` (#567) hentede den fra CVR for 26 af 30 aktive (før 1 af 30). Uden: tre uden CVR-nummer (Alexander Lund, Martin Larsen, Bastant Design) og YKRG, som registret ingen adresse har for. | indgangen-design §33 |
| **GJORT 15/9 — 13 AF 13. De elleve gamle annulleret 15/9 kl. 17:05:04–17:37:33 dansk («Immediately» + «No refund», i fristrækkefølge; hver målt: canceled, schedule annulleret samme sekund, ingen ny faktura, saldo 0); Launch Lab flyttet efter trækket 15/9 (`sub_sched_1UFyOj3CvBmCx5Pta4mZHhFA`, start 15/10, 8 træk). Sweep: to aktive tilbage på Topix.dk med cancel_at ved periodens slut (21/9 og 29/9 — Pro-Vision/PHILBERT efter datoen, navnene ikke læst); 13 schedules not_started på The Boardroom. Rollback-vinduet bruges ikke. Tilbage af rækken: stripe_customer_id (rækken nedenfor), trækhistorikken, varslerne, de nye rækker ovenfor. Var: I GANG 14/9 AFTEN — 12 af 13 flyttet (Livja og Fjeldgaardshop i hånden, ti via Billing Migration Toolkit 21:05 UTC). FRIST FØR 20/9: annullér de ti gamle abonnementer (Jonas: i morgen med friske øjne). Rollback muligt til 19/9 23:57 UTC** | **Migrationen af de 13:** kundekopien lykkedes for alle 13 (betalingsmiddel med, bekræftet enkeltvis; Launch Labs `link`-pm kopierede). Livja `sub_sched_1UFgaM…` 16/9 → 15/12 (gammelt annulleret 20:39 UTC); Fjeldgaardshop `sub_sched_1UFglk…` 18/9 → 17/3-2027 (gammelt annulleret); ti planlagt i migration `bm*AaCht0C6BwAAAKvS`, `cancel_at` sat i hånden bagefter (toolkittet dropper kolonnen tavst), alle ti målt med end_date og rigtigt antal træk. Reglen: 12 træk i alt — tæl betalte fakturaer, ikke `cancel_at`; sidste træk dækker en måned frem. De nye trækker kl. 22:00 UTC (midnat dansk), de gamle senere samme dag — derfor annullér FØR dagen. **Launch Lab flyttes efter sit træk 15/9 på den gamle konto** (24-timers-reglen). PHILBERT (29/9) og Pro-Vision (21/9) fornys, flyttes ikke. Var: «ÅBEN BESLUTNING — betingelsen opfyldt 13/9». | DEL 2 «15. september» §1 (tabellen med alle elleve); DEL 2 «14. september» §41–§43; migration-recon §16, §24; mangellisten (migrationskortet — lukket, bliver stående) |
| **ÅBENT 14/9 — SQL i hånden, ikke kode; efter flytningen** | **`companies.stripe_customer_id` (og `stripe_subscription_id`) for de tolv flyttede.** Kunde-id'erne bevares ved kopi, så koblingen er kendt pr. virksomhed (Livja `cus_T44oqJhzxlpPCf`, Fjeldgaardshop `cus_UAcxhBRUM4CJzw`, resten i migration-recon §13). Tre af de elleve har anden mail i platformen end i Stripe (BR Roset, Homie, Two Socks) — kobl på kunde-id eller CVR, aldrig på mail. | DEL 2 «14. september» §43; mangellisten «Platformen kan ikke se hvem der betaler» |
| **BESLUTTET 14/9 (Jonas) — FØR den gamle konto lukkes; recon lavet, intet bygget** | **Trækhistorikken fra den gamle konto ind i `company_traek`** — «fra medlemskabets start», beløb, dato, fakturanummer. Tabellen kan bære det (UNIQUE `stripe_invoice_id` = idempotent import med de rigtige `in_…4DoYItGRbI…`-id'er; kun `betalt`/`fejlet`; `beloeb_oere` inkl. moms). Platformen kan ikke nå den gamle konto (én nøgle, den nye); koblingen sub → company findes kun i reconens tabel og i `migreret_fra`. Tre veje uden anbefaling i `recon-traekhistorik.md`. Livja: 9 betalinger, 39.375 kr., kun i Stripe i dag. | DEL 2 «14. september» §44; `recon-traekhistorik.md` (uden for repoet); mangellisten (Betaling) |
| **ÅBENT 14/9 — valg eller forglemmelse?** | **Ingen varsler før et træk på den nye konto.** Trial- og fornyelsesvarsler er SLUKKET på The Boardroom-kontoen; den gamle havde «upcoming renewals» TIL med 7 dages varsel (ingen mail ved annullering). Ingen dobbeltvarsler nu — men heller intet varsel før 4.375 kr. trækkes. Husets egne varsler gælder fornyelsen, ikke månedstrækket. | DEL 2 «14. september» §43 (fund 19); mangellisten (Betaling) |
| **LUKKET 15/9 — startdatoen var forkert, rettet i platformen; 7 + 5 = 12** | **BR Rosets kontrakt er ti måneder — LUKKET 15/9:** «ti måneder» var en forkert STARTDATO (3/5) i platformen, ikke ti rater. Stripe: 7 betalte (686P23XT-0001–0007), første 3/3-2026, gammelt `cancel_at` 3/3-2027 = 12; nyt schedule `sub_sched_1UFh3p3CvBmCx5PtYNcGYVVL` 5 træk fra 3/10, så 7 + 5 = 12. Jonas rettede `contract_start_date` (vejen ikke oplyst); MÅLT i SQL: 2026-03-03 → 2027-03-03, active. Var: «ÅBENT 14/9 — ikke afklaret: BR Rosets kontrakt er ti måneder (3/5-2026 → 3/3-2027), ikke tolv. Tastefejl, aftale eller ti rater? Afgør før hendes gamle abonnement annulleres og det nye ophør sættes endeligt.» | DEL 2 «15. september» §3; DEL 2 «14. september» §43 (fund 20); mangellisten (kortet lukket, bliver stående) |
| målt 3/9 aften — VIRKER for medlemmet | **1:1-sessionernes Calendly-kæde efter kontoskiftet.** Målt i Stripe (MCP, livemode): `session_1on1` findes som præcis én aktiv pris på den nye konto (`price_1UApFg3CvBmCx5PtyGkNPRmm`, 500 kr. ekskl. moms; kunden betaler 625 kr. med `automatic_tax`); `abonnement_maanedlig` findes ligeledes (`price_1UApQx3CvBmCx5Pt8GxtQsze`, 399 kr.). Webhook-endpointet `we_1UAtaW3CvBmCx5PtL736lAJN` er enabled med seks events inkl. `checkout.session.completed` og peger på `loiavmastgeieqyiwyyr`. **Kæden virker for medlemmet:** to betalte 1:1-sessioner er booket OG afholdt (23/6 og 30/6, målt i Calendly 3/9 aften). Det der fejler, er registreringen — rækken nedenfor. | — |
| **LUKKET 13/9 sen aften — #842 merget 20:04:19 UTC, abonnementet oprettet 20:16:47 UTC (`active`); UBEVIST I DRIFT indtil et køb efter 22:05 dansk kommer tilbage** (var: nedprioriteret 3/9 aften; begrundelsen falsificeret 13/9 kl. 21:30) | **Betalte 1:1-bookinger registreres aldrig som `booked`.** Målt 3/9 aften: **0 af 12 betalte bookinger har `calendly_event_uri`, mod 2 af 3 gratis.** Årsagen er tredelt: (1) `stripe-webhook` (linje 917 og 925) skriver Calendlys `booking_url` RÅT i `session_bookings.calendly_booking_url`, mens `create-free-intro-booking` (161–162) indlejrer bookingens id i URL'en (`salesforce_uuid` + `utm_content`), og `calendly-webhook` (75–80) matcher kun på dem; (2) `calendly-webhook` matcher desuden på `advisor = 'morten'` (l. 94, 129), og de betalte rækker er `'jonas'` (default, migration 20260621120000); (3) Jonas' Calendly-organisation har kun ét medlem, så Mortens webhook-abonnement kan ikke dække Jonas' events — et abonnement dækker kun sin egen organisation, og Morten er ikke medlem af Jonas'. **Prioritet LAV, besluttet 3/9:** det koster ikke medlemmet noget — de booker og mødes — og reparationen *var* «kræver Calendly-abonnement på premium». **Det holdt ikke — MÅLT 13/9 kl. 21:30** (DEL 2 «13. september» §18): `GET /webhook_subscriptions?organization=…28fc12fd…&scope=organization` med Jonas' token → HTTP 200, `"collection":[]`, `"count":0`. Planen (standard, paid) TILLADER webhooks; der findes bare INTET abonnement på Jonas' organisation. Blokeringen er kode plus et manglende abonnement: `calendly-webhook` filtrerer `advisor = 'morten'` (`:122`, `:157`) og matcher via det id som `create-free-intro-booking` lægger i URL'en (`:162-163`), som `stripe-webhook` ikke lægger (`:1351-1356`); signaturen er IKKE en hindring (`signing_key` vælges af den der opretter abonnementet). Abonnementet på Jonas' organisation er ikke oprettet. Påstanden begrundede nedprioriteringen i ti dage og er grunden til at Rallysupports mødedatoer blev sat i hånden 13/9 kl. 20:48. Ikke en følge af kontoskiftet; det har været sådan hele tiden. **LUKKET 13/9 (#842, DEL 2 «13. september» §19):** `stripe-webhook` indlejrer nu rækkens id i linket (som Mortens vej), `calendly-webhook` matcher begge spor på id alene og gater genåbningen af den gratis på rækkens advisor, to signing keys (én pr. abonnement), og abonnementet på Jonas' organisation er oprettet 20:16:47 UTC (`state: active`, `9bca1b66-…`). Rækkefølgen kode → secret → bevis → abonnement blev holdt. Åbent bevis: en rigtig booking der kommer tilbage som `booked` med tid. Rallysupports to rækker forbliver håndsatte for altid — deres links bærer intet id. | `~/Downloads/recon-calendly-reparationen.md`, `verifikation-calendly-kaeden.txt`, `diff-calendly-kaeden.txt` (uden for repoet) |
| **I DRIFT 14/9 — GUID målt 12:49, BEVIST PÅ SKÆRM 13:01. ÅBENT: overlejringens tekst (rettes i et andet vindue)** | **Velkomstvideoen er optaget (Morten, 14/9), i Bunny Stream, GUID sat i /admin/config:** `app_config.velkomstvideo_guid` = `ee29bc22-e323-4427-939d-da85964a8824` (36 tegn; `#>> '{}'`, ikke den rå JSONB på 38). Skærm 13:01 (kontakt@topix.dk): fokuskortet «Se velkomsten» → «Gør det nu» → overlejringen åbner, videoen spiller. Tjeklisten har syv punkter. Åbent: teksten «Tjeklisten nederst på siden følger med dig» passer ikke — pillen trækker sig på forsiden (#569, `ankomst.ts`). Ikke rettet, bevidst: «Se senere»/«Kom i gang», og portræt i 16:9-ramme. | DEL 2 «14. september» §23; recon-velkomstvideo, indgangen-overhaling §10 |
| åbent | **Rundvisningen** — interaktiv førstegangs-oplevelse efter velkomsten; bygges efter C3-indflytningen; må aldrig eksistere ved siden af Guiden. | BACKLOG [P2·EPIC] Platform-onboarding |
| EPIC, designet 3/9 aften | **Rådgiverfladens overhaling** — tages SAMLET, på størrelse med indgangen. Designsamtalen ER holdt 3/9 aften: designet er låst i `docs/raadgiverfladen-design.md` (fire flader, syv blokke, `companyId`-nøgling, chat ind på virksomhedssiden, emne-opsamling målt før flade), emnelisten i `docs/emneliste.md` (ni emner, to holdt udenfor). **Det der mangler før kode** (designets §10): emnelisten skal bevises ved klassificering af alle 588 menneskebeskeder i et idempotent engangsjob, og målingen skal holde; buckets' linkmål for `primary: "company"` (`AdvisorDashboard.tsx:1130–1134`) er ikke læst; hvilke `advisor_notifications.type`-værdier der findes; hvad de fire AI-edge-functions (`ai-financial-feedback`, `ai-data-chat`, `generate-ai-forecast`, `run-company-agent`/`agent-forslag-afgoer`) læser og skriver serverside; og den samlede rene funktion bag «hvad stikker ud» — det sidste er gjort (#589). **Byggeomkostnings-reconen er kørt 3/9 sen aften** (`~/Downloads/recon-byggeomkostning.md`, uden for repoet — genskabes hvis den bruges). Den viste: (1) en flytning er **tre skridt i fast rækkefølge**, målt på de fire der allerede er sket (KPI'er, Rapportering, Budget, Handouts): motoren udskilles først som ren flytning med tests; den gamle flade lægges om til motoren og fryses; derefter bygges den nye flade på en midlertidig route — og swappes til sidst ind på den GAMLE URL, fordi URL'er er kontrakter i mails og notifikationer. (2) **Handouts er det reneste facit**: `HandoutDetail` 381 linjer → `HbHandoutDetail` 385; `HandoutLeverItem` 89 → 89. Samme motor, UI-primitiver byttet — når datalaget er delt på forhånd, koster en flytning næsten intet i logik. (3) **Rådgiverfladen er dyrere end alle fire**, af grunde ingen af dem havde: datalaget skal vendes fra `user_id` til `company_id`, blokken «Aftalen» skal bygges fra `/members`-listen (findes ikke på MemberDetail), og to inline-domme skulle samles til én — det sidste er gjort (#589). (4) Der findes **ingen opskrift som dokument**; BACKLOG's fire GO-punkter er den de facto-tjekliste, med samme skabelon hver gang. (5) **Ombygningen betaler gæld tilbage**: `HandoutDetail`-trioen, `PeriodSelector`, `AIFinancialAnalysis` og `FileUploadZone` kan først pensioneres når MemberDetail konverteres; ni komponenter i `src/components/` har allerede nul importører. Medlemsskiftet er løst uafhængigt (#573). De tre reconer bag designet ligger uden for repoet (`~/Downloads/recon-raadgiverfladen-2.md`, `recon-virksomhedssiden.md`, `recon-emner.md`) og skal genskabes hvis de bruges. | `docs/raadgiverfladen-design.md` §9–10, `docs/emneliste.md` §7 |
| UDGÅR, besluttet 4/9 | **`notifications` company-først (designets §11 punkt 2) bygges IKKE.** Punktet stod som forudsætning for blok 1, fordi `notifications` er den eneste af motorens kilder uden advisor-policy («Users read own notifications», `user_id = auth.uid()`, bekræftet i prod 3/9 kl. 22:43). **Målt 4/9** (`~/Downloads/recon-notifications-noedvendig.md`, uden for repoet — genskabes hvis den bruges): ingen af virksomhedssidens syv blokke kræver det. Hver af blok 1's fem ting bæres af andre tabeller — ny rapportering af `financial_report_facts.committed_at`, «stikker ud» af facts og `budget_targets`, opgaver af `conversations.awaiting_reply_from` og `company_actions`, agentforslag af `agent_runs`/`agent_proposals`, sidst talt af `conversations.last_message_at`. `VirksomhedsInput` har ikke ét felt fra `notifications`. Det er en direkte følge af at alerts røg ud af motoren (#595): den eneste grund til at læse tabellen company-først var alert-rækkerne, og dem dømmer motoren ikke længere på. Rådgiverens klokke læser `advisor_notifications` (egen advisor-policy) i kodens default; `notifications`-klokken rammer kun `test_user_ids` under rollout-flaget. Det der IKKE kan ses uden ændringen — medlemmets set/læst-tilstand på systembeskeder og alert-historikken med kvitteringer — er bevidst fravalgt. Det øvrige fund fra 3/9 står: `handouts` og `milestones` har haft `company_id NOT NULL` siden februar, og en virksomhed uden medlemmer giver nul rækker, ikke en fejl — bevist 4/9 med #607, hvor de tre kan åbnes. | `docs/raadgiverfladen-design.md` §11 punkt 2, §4 blok 1; `~/Downloads/recon-notifications-noedvendig.md` |
| LØST 3/9 kl. 22:48 | **RLS-hullet: fire demo-policies var permissive** og gav ethvert medlem læseadgang til alle virksomheders tal og samtaler (38/102/314/35 mod ejede 1/0/0/1). Rettet i prod til `AS RESTRICTIVE`; efter 1/0/0/1, rådgivere uændret. Bogført i migration `20260903230000_demo_policies_restrictive.sql` — kørt, skal ikke køres igen. Gennemgang af alle 268 policies kl. 22:57: ingen flere. | `supabase/SECURITY_BASELINE.md` §5; DEL 2 «RLS-hullet» |
| LØST 3/9 sen aften (#589, #594, #595, #597) | **Motoren `afgoerVirksomhedsSignaler`** (`src/lib/virksomhedsSignaler.ts`) bygget (#589) og begge flader lagt om. **#594:** `MemberDetail.tsx` («Hvad stikker ud») kalder motoren; IIFE'en slettet. **#595:** alerts ud af motoren — Jonas' beslutning: `detect-financial-alerts` udløses kun ved commit fra klienten (ingen upload, ingen alerts) og skriver én kopi pr. rådgiver, så `read_at` er pr. modtager. Konsekvens: uden friske facts giver «stikker ud» nu intet. **#597:** `AdvisorDashboard.tsx` lagt om; fire af fem bunker kommer fra motoren, bunke «positive» står uændret fordi den ikke findes i motoren og ikke er i designets §3.5; `isFiguresFresh` bor nu i motoren og importeres derfra. **Dommen findes nu ÉT sted** — det var tre steder ved aftenens start (to inline-domme plus motoren midlertidigt). **Synlig ændring i drift:** «Ikke hørt fra længe» er vendt, så virksomheder der aldrig har skrevet nu står øverst (alvor 95); målt 1/9 var fjorten af treogtredive uden ét måltal — køen bliver længere med vilje. **ÅBENT:** budgetafvigelse kan ikke komme på forsiden, fordi AdvisorDashboards `queryFn` ikke henter `budget_targets` — `budgetOmsaetning` står bevidst som null. Skal løses når forsiden bygges om. **BEVIST PÅ SKÆRM 3/9 kl. 23:36 — og to fejl fundet samme sted.** Forsiden i drift efter Update-klik og hard reload: «Ikke hørt fra længe» viser 14 virksomheder, hvor køen før var tom for dem uden committede tal. Den vendte regel virker. MEN skærmbilledet afslørede to fejl i motoren, begge i køen `ikke_hoert_fra_laenge`: **(1) Sorteringen er forkert.** Rækkefølgen på skærmen var 57, 126, 66, 85, 86, 78, 59, 86, 77, 45 dage — ikke faldende. Årsagen er alvorsformlen `60 + Math.min(dage - 21, 30)`: alt over 51 dage rammer loftet 90 og får samme alvor, hvorefter indlæsningsrækkefølgen afgør. Bastant Design med 126 dage stod som nummer to. Loftet blev sat for at holde «aldrig skrevet» (95) over de tavse, men det ødelagde rangordenen mellem dem. **RETTET (#599):** alvor er nu en kurve der er strengt stigende — `95 − 35 / (1 + (dage − 21) / 30)` — så to forskellige dagtal aldrig får samme alvor, og «aldrig skrevet» (95) ligger over alle uanset dage. Fem tests låser det, heriblandt præcis den rækkefølge der var forkert på skærmen. **(2) «Har aldrig skrevet» optrådte ikke — og det er IKKE en fejl i motoren.** Alle fjorten rækker viste et dagtal («Ingen dialog i N dage»), ingen viste «Har aldrig skrevet». Målt i prod 3/9 kl. 23:37: alle 35 samtaler har en `last_message_at` — INGEN er null; og tre aktive virksomheder af tredive har slet ingen samtalerække — de samme tre der ingen medlemmer har (Din økonomiafdeling, Two Socks, WESDEX). `senesteBeskedAt` er altså null præcis når den skal være det. Signalet er bygget rigtigt, men er i praksis dødt indtil en virksomhed uden samtale når frem til dommen: de tre eneste mulige kandidater er dem uden medlemmer, og om de overhovedet når frem afhænger af om de indgår i `investorSummaries`-løkken i AdvisorDashboards `queryFn`. **BESVARET 3/9 kl. 23:45:** de ER med — løkken går over `companies` (l. 613), så virksomheder uden `company_members` og uden samtale når frem til motoren. Det er **pending-gaten** (l. 738–746: virksomhed med hængende invitation OG ingen medlemmer skjules fra alle fem bunker) der fjerner dem bagefter. «Har aldrig skrevet» er dermed uopnåeligt på forsiden i dag, men af den grund — se rækken om hængende invitationer nedenfor. | DEL 2 «Motoren bag rådgiverens signaler»; `docs/raadgiverfladen-design.md` §4 blok 1 |
| åbent, designpunkt — hængende invitationer har intet sted | **Målt i prod 3/9 kl. 23:45–23:46: fire pending invitationer i alt.** TRE af dem (Din økonomiafdeling, Two Socks, WESDEX) er kun to dage gamle (sendt 1/9) og sidder på virksomheder UDEN medlemmer. De er skjult fra ALLE fem bunker på forsiden af pending-gaten i AdvisorDashboard (l. 738–746: skjuler virksomhed med pending invitation OG ingen `company_members`). Det er rimeligt for en invitation på to dage. **Den fjerde, remm. (chatrine@remm.dk), er sendt 15/6 og er 80 DAGE gammel.** Virksomheden HAR medlemmer, så den er ikke skjult — men ingen flade fortæller at invitationen hænger. Det eneste sted den er synlig er `MembersAdminSection` nederst på `/members`. **Konsekvens for motoren:** signalet «Har aldrig skrevet» (alvor 95) er UOPNÅELIGT i dag — de eneste virksomheder uden samtale er netop de tre, og de er filtreret fra. Reglen blev vendt så ingen skulle glemmes, og de tre mest oversete forsvinder stadig — men fordi de er nye, ikke fordi de er glemt. Og selv når en af dem kommer frem, rendres rækken UDEN KNAPPER: både «Åbn chat» og «Se virksomhed» kræver et `convId` hhv. `userId` de ikke har (AdvisorDashboard l. 1191–1206). **BESLUTNING (Jonas, 3/9 sen aften): der bygges IKKE en dom nu** — ét tilfælde retfærdiggør ikke en motor. Men en invitation der er ældre end omkring fjorten dage er ikke på vej, den er strandet, og det er den slags der bliver til fem tilfælde hen over et halvår uden at nogen opdager det. Hører hjemme på forsiden ved siden af «Indgange der ikke er betalt» — samme slags: nogen venter, nogen bør handle. | `~/Downloads/recon-virksomheder-uden-medlemmer.md` (uden for repoet, genskabes hvis den bruges); `docs/raadgiverfladen-design.md` §3.5 |
| LØST 4/9 (#604) | **Forsiden har nu ÉN kilde til tallene: `financial_report_facts`.** Før regnede AdvisorDashboards `queryFn` MoM og nøgletal ud af `financial_reports` (T15/T16/B2), mens NoegletalView og virksomhedssiden brugte facts gennem `useCompanyFacts` og `trendMoM.ts` — to kilder til de samme tal, og motoren (#589) fik derfor to varianter af sit input (`FactPunkt` af rapporter på forsiden, af facts på MemberDetail). Flytningen blev taget som egen opgave med måling FØR (3/9 kl. 23:56, `~/Downloads/recon-to-kilder.md`: 151 punkter over 20 virksomheder ad rapport-vejen mod 314 over 21 ad facts-vejen, heraf 144 `estimated`; **nul uenigheder** hvor begge kilder har en værdi) og bevis EFTER. **To bevidste forskelle i drift:** (1) estimater fra årsrapporter og baselines (de 144 punkter) kommer med, så `has_verified_metrics` bliver sand for en virksomhed der kun har estimater; (2) rapporter der aldrig blev committet falder ud — Brick Works ApS, «April 2026», 1.349.013 kr. Begge er tilsigtede: estimaterne er tal nogen har godkendt, ikke-committede rapporter er tal ingen har godkendt. **M/M gates nu på `data_basis` via `momErGyldig`** (`src/lib/dataGrundlag.ts`): begge punkter skal være `measured`, så et estimat aldrig udløser et faldsignal mod en måling — samme regel som NoegletalView. **Manuelle overrides falder bort** i forsidens læsning, fordi `resolve_report_commit_candidate` allerede indregner dem ved commit; facts ER det effektive tal. De to facts-hentninger i `queryFn` (aktivitetsfeedets og den nye) er slået sammen til én. **BEVIST PÅ SKÆRM 4/9 kl. 08:34:** forsiden er UÆNDRET — alle fem bunker viser det samme som før flytningen. Det er beviset for at målingen (nul uenigheder) holdt. Det der stod om genbrug (3/9, `~/Downloads/recon-dashboard-queryfn.md`) gælder stadig: én fælles datamotor kan ikke bygges, alle hentninger i `queryFn` er porteføljebrede; det er FORMERNE der genbruges pr. virksomhed — og det er dét #607 gjorde med `useVirksomhed`. | `docs/raadgiverfladen-design.md` §11 punkt 1, §4 blok 1 og 5; `~/Downloads/recon-facts-flytning.md`, `~/Downloads/recon-to-kilder.md` |
| LØST 4/9 formiddag (#603, #605, #607, #611–#616, #619, #621, #624) — kun blok 3 udestår, MemberDetail kan pensioneres | **De første to rådgiverflader i Hjemmebane + admin-blokken — og virksomhedssiden er HEL: alle blokke på nær emnerne, alle ni handlinger (#619: åbn handout, fjern medlem), deep-links (#619) og de fem sidste visninger (#624: Finansiel udvikling med budget-overlay, DeliveryOverview, «Tildelt», sparklines, `section-session`); listen viser ejeren som kontaktperson (#621, 27 af 30 mod 4 af 30 med `contact_person`). DEL 2 bærer detaljen.** Det følgende er historikken fra første halvdel af formiddagen: (etape 2: #611 blok 5+6; etape 3: #612 blok 2, #614 blok 4; handlinger: #613 fire monteret, #616 rapportarbejdet; #615 listen linker til siden; DEL 2 bærer detaljen). Designets §11 punkt 3, 4 og første del af 5, i rækkefølge. **#603 admin-blokken i Hb-menuen:** før havde rådgiveren ingen vej til admin fra en Hjemmebane-flade — nul menupunkter pegede på `/admin/indhold`, `/admin/import` havde intet link i `src` overhovedet. Nu Virksomheder og Platform (otte underpunkter) på BEGGE nav-grene; `HbNavEntry` fik et additivt `admin`-felt; punkterne peger på AppLayout-sider, så designsproget skifter ved klik — bevidst. **#605 den rene virksomhedsliste** på `/virksomheder`: præcis syv felter; den gamle `/members` står urørt til swappet. Besluttet 4/9: «sidste kontakt» = `conversations.last_message_at`, «sidste rapportering» = seneste committede periode i facts, ikke seneste upload. Rækken linker til `/members/:userId` indtil virksomhedssiden findes. **#607 virksomhedssiden, etape 1** på `/virksomhed/:companyId`: datalaget er VENDT — `useVirksomhed` slår alt op fra `companies.id` og udad i ét `Promise.all`, intet gated på et `user_id`-opslag; de tre virksomheder uden medlemmer kan åbnes for første gang. Blok 1 bruger motoren og udfylder endelig `senesteBeskedAt` og `agentforslagVenter` (MemberDetail sendte null og 0). Blok 7 fra `/members`-listens data. Visning, ingen handlinger. **UDESTÅR:** «åbn handout» og «fjern medlem» (de to sidste af ni handlinger, under bygning); blok 3 (emnerne) efter klassificeringen; swappet af `/members` → `/virksomheder` som VIDERESTILLING (rækken nedenfor); forsidens køer linker stadig til `/members/:userId`. |
| DELES, besluttet 4/9 — `/members/:userId` viderestiller (GJORT, #626), `/members` venter — MÅLT IGEN 4/9 sen aften (næste række): elleve dele, ikke fire | **Swappet er DELT i to.** `/members/:userId` viderestiller til `/virksomhed/:companyId` med parametrene bevaret — siden forstår `?reportId`, `?handout` og `?section` siden #619, og MemberDetail er tom for enestående indhold (#624). `/members` (listen) kan IKKE swappes endnu: målt 4/9 er `Members.tsx` ENESTE montering af `IndgangsSektion`, `FornyelsesSektion`, Legatforløb-listen og `MembersAdminSection`; fornyelsesordningen træder i kraft 10/9, og FornyelsesSektion er det eneste sted en beslutning registreres — de skal have et hjem på forsiden (§11 punkt 6) først. En rådgivermail (`_shared/indgangsMail.ts:251`) og en test peger på `/members` af samme grund. **Formen, som besluttet:** en VIDERESTILLING, ikke en flytning. Målt i prod 4/9 kl. 09:54: 978 `notifications` har `deep_link like '/members/%'` (604 med `?reportId`, 40 med `?handout`, 6 med `?section`, 328 uden parameter), 150 af dem sendt de sidste 30 dage, tre typer så sent som 3/9 — plus Slack-beskedernes absolutte URL'er, som ikke kan ændres bagud (`send-slack-report-notification`, `send-slack-handout-notification`). Ruten `/members/:userId` bliver derfor stående, slår virksomheden op ud fra `user_id` (både `financial_reports` og `handouts` bærer `company_id NOT NULL`, så oversættelsen kan lade sig gøre) og sender videre til `/virksomhed/:companyId` med parametrene bevaret. Så virker alle gamle links og alle fremtidige beskeder, uden at én edge function skal ændres. **Forudsætning:** virksomhedssiden skal FORSTÅ `?reportId` (udfold + scroll til rapporten), `?handout` og `?section` — under bygning. Når den gør, kan MemberDetail pensioneres; til da lever de to sider side om side. | `~/Downloads/recon-memberdetail-rest.md` §4–5; `docs/raadgiverfladen-design.md` §11 punkt 4 | `docs/raadgiverfladen-design.md` §3.1, §3.6, §4, §11 punkt 3–5; `~/Downloads/recon-virksomhedslisten.md`, `~/Downloads/recon-virksomhedssidens-datalag.md` |
| RETTET 9/9: OTTE dele, ikke elleve (rækken «EFTER 9/9» øverst) — MÅLT 4/9 sen aften — `/members` KAN IKKE SWAPPES; ELLEVE dele findes kun dér, og designets §11 punkt 6 er UFULDSTÆNDIGT | **`/members` kan ikke swappes til `/virksomheder` — målt igen efter #638 (køerne væk), #645 (Legat) og #650 (roden)** (`~/Downloads/recon-members-swap.md`, uden for repoet — genskabes hvis den bruges). Formiddagens fire dele er blevet ELLEVE, og SYV af dem er handlinger ingen anden flade kan udføre: **1. `IndgangsSektion`** — sæt prisniveau, som udløser betalingsmailen (`saet-indgangs-prisniveau` har ingen anden kalder i `src`; eneste montering `Members.tsx:1154`). **2. `FornyelsesSektion`** — registrér og fjern fornyelsesbeslutning (eneste skrivning i `company_fornyelse` i `src`; `useVirksomhed.ts:243` læser kun; ordningen træder i kraft 10/9; eneste montering `Members.tsx:1156`). Forsiden monterede begge i #630 og mistede dem igen med køerne i #638 — i dag har hverken `RaadgiverForsideView` eller `Index.tsx` en import af dem, og forsiden hverken registrerer en beslutning eller sætter en pris (kun links). Virksomhedssidens blok 7 VISER beslutning og prisniveau (`VirksomhedView.tsx:1353, :1358`), skriver ikke. **3. `MembersAdminSection`** — afventende invitationer (virksomhed + standalone), gensend, slet invitation, tre tal; virksomhedssiden viser kun én sætning om en ubrugt invitation (`VirksomhedView.tsx:1444-1446`). **4. «Inviter ny bruger»** (`send-invitation-email` i rådgiver-brug; `CompanyInvitations` i Settings er medlemmets egen). **5. «Importér ansøgning» / «Berig med ansøgning»** (`import-application`, `attach-user-to-company` — ingen anden kalder). **6. «Tilknyt»** — merge af bruger uden virksomhed, en inline-kæde over otte tabeller (`Members.tsx:787-813`). **7. «Slet virksomhed»** (`manage-advisor delete-company`, eneste kalder `Members.tsx:833`). **8. «Omdøb virksomhed»** — `EditCompanyDialog` har intet navnefelt. **9. «Gensend invitation»** pr. virksomhed. **10. `MembersStatsBar` og `MembersOnboardingFunnel`** — ni tal og login-stats (`get_users_last_login`); `AdvisorDashboard` viste dem, men den er uden aftager siden #650. **11. Rækkens** refleksion, ulæste, «klar til session», Slack-kanal, antal brugere, «afventer», «ret navn», committed-tæller — plus sortering og branchefilter, som `VirksomhedslisteView` ikke har. **Dele der HAR fået et hjem:** virksomhedslisten (`VirksomhedslisteView`), Legatforløb (`LegatView`, #645 — nøglet på `legat_enrollments` frem for `companies.is_legat`; om alle `is_legat` har en række er IKKE målt, kræver prod), rediger virksomhedsdata og fjern teammedlem (virksomhedssiden), «se data» (viderestillingen #626), «åbn chat» (blok 4). **EN FEJL I DESIGNET:** `docs/raadgiverfladen-design.md` §11 punkt 6 (`:823-832`) siger kun at «indgange og fornyelser» skal flytte til forsiden. Den nævner IKKE invitationer, import, merge, slet eller omdøb. Designet er ufuldstændigt, ikke bare uafsluttet — swappet kræver mere end de to sektioner, og hvor de ni øvrige skal bo er ikke designet. **Det der stadig peger på listen** og følger med et swap: `AppSidebar.tsx:65, :530, :590`; `Guide.tsx:105, :114, :123, :139` (to af dem om en «broadcast», som `Members.tsx` ikke har); rådgivermailen `_shared/indgangsMail.ts:251` + testen `indgangsMail_test.ts:173`; tre Slack-fallback-links `send-slack-report-notification/index.ts:189, :273, :292` med `?companyId=`, som `Members.tsx` ikke læser. `HbMemberShell`s admin-blok peger ikke på `/members`. | `~/Downloads/recon-members-swap.md`; `docs/raadgiverfladen-design.md` §11 punkt 6; rækken «DELES» ovenfor |
| observation under omlægning — efterprøves før sletning | **Dødt kød i `AdvisorDashboard.tsx`**, målt 3/9 kl. 23:26 midt i omlægningen (ikke en afgjort dødsdom): `companies` og `legatCompanyIds` hentes og læses aldrig; `activityFeed`, `companyMap` og `recentReportsData` læses kun af kode der ikke er nået fra JSX; og `handleAssignAdvisor` (l. 1085–1092) er det eneste sted i filen der SKRIVER (`UPDATE conversations` + `invalidateQueries`), men kaldes ikke fra nogen JSX. Skal efterprøves med grep og en gennemlæsning af JSX'en FØR noget slettes — målingen er taget mens filen var under ombygning. | `~/Downloads/recon-dashboard-queryfn.md` (uden for repoet) |
| LØST 4/9 (#608) — med en rettelse | **«Fjern medlem» har nu ét værn, serverside.** Fundet 3/9 lød at kaldet havde to gates: `MemberCompanyRow` krævede `isAdmin && role !== 'owner'`, MemberDetail kun `isAdvisor`. **RETTELSE, målt 4/9: det var IKKE et adgangshul.** `manage-advisor` har per-action-autorisation med default-deny — en rådgiver uden admin må kun kalde `list`, alt andet giver 403, og rollen læses fra `user_roles` med service-role-klienten. Det der manglede var **owner-værnet serverside**: `remove-member` læste ikke målets `company_members.role`, og grenen sletter `company_members`, `profiles` OG auth-brugeren — irreversibelt. En admin kunne altså slette en owner fra MemberDetail, hvor listen ville have nægtet det; værnet fandtes kun i fladen, og kun ét sted. **Besluttet 4/9 (Jonas): en owner kan ALDRIG fjernes med `remove-member`.** Skal virksomheden væk, slettes virksomheden (`delete-company`); skal owneren skiftes, er det en anden handling. Dommen ligger i den rene, testede `src/lib/medlemsfjernelse.ts` (`erOwner`, `maaFjerneMedlem` = admin OG ikke owner) og er spejlet ordret i edge-funktionen, som nu slår målets rækker op FØR noget slettes og afviser med 403 og dansk besked. **Værnet afviser hvis målet er owner i NOGEN virksomhed**, fordi sletningen selv er global (`.eq('user_id', …)` rammer alle rækker, ikke én virksomhed) — `company_members` har kun `UNIQUE(company_id, user_id)`. Begge flader bruger samme funktion; MemberDetail kræver nu `isAdmin` som serveren. **NYT ÅBENT PUNKT:** knappen hedder «Fjern medlem», men handlingen er «slet dette menneske fra platformen» — navnet lyver, og det bør rettes. Og: **«skift owner» findes ikke som handling.** **UDESTÅENDE:** `manage-advisor` ruller ikke med merge og skal deployes eksplicit via build-chat; beviset er at et kald uden token svarer 401/400, ikke 404. | `docs/raadgiverfladen-design.md` §9; `src/lib/medlemsfjernelse.ts`; `~/Downloads/diff-owner-vaern.txt` |
| LØST 4/9 kl. 10:17 — i DATA, ikke i kode | **Ni aktive virksomheder havde ingen owner, så owner-værnet (#608) dækkede dem ikke.** Målt i prod 4/9 kl. 10:14, mens virksomhedssidens «Fjern medlem» blev set på skærm: `company_members` havde 26 rækker med rolle `owner` og 12 med `member`, og NI aktive virksomheder havde INGEN owner — hver med præcis ét medlem, med rollen `member`: ANLA GLAS, Booking Innovation, Homie, Limo Group, PHILBERT, remm., TOFT, Topix.dk og YKRG. Flere er betalende kunder. **Konsekvensen, hvis intet var gjort:** deres eneste bruger kunne slettes med `remove-member`, virksomheden ville stå uden adgang, og auth-brugeren er væk uden fortryd. **Besluttet (Jonas, 4/9): rettelsen er i data, ikke i kode.** De ni havde hver ét medlem, så der var ingen tvivl om hvem der var ejeren — rollen var ikke et valg, den var bare aldrig sat. Alternativet, et «sidste medlem»-værn i edge-funktionen, ville have kompenseret for manglende data med mere kode i en gren der sletter mennesker. **Rettet i prod 4/9 kl. 10:17** (Lovable SQL editor). UPDATE'en var guardet tre gange: kun `role = 'member'`, kun hvor virksomheden ingen owner havde, og kun hvor der var PRÆCIS ét medlem — en virksomhed med to member-rækker rammes ikke, for dér ville det være et valg. **Efter:** 35 owner, 3 member, og ingen aktiv virksomhed uden owner. De tre tilbageværende `member` er kolleger i virksomheder der allerede har en owner — det er den situation rollen er lavet til. **Følge, som beslutning:** «sidste medlem»-værnet bygges IKKE. Owner-værnet dækker nu alle aktive virksomheder, og det skal blive ved med at være data der bærer dommen, ikke et lag kode der gætter når data mangler. **ÅBENT PUNKT:** rollen sættes forskelligt afhængigt af hvordan et medlem kommer ind — de ni opstod uden at nogen valgte det. Hvor `company_members.role` skrives (`handle_new_user`, `process-pending-invitation`, `attach-user-to-company`, `create-legat-enrollment`, `upgrade-legat-to-member`, migrationernes backfills — ikke afdækket hvilke der giver `member` til en virksomheds FØRSTE bruger), og om en ny virksomhed altid får en owner, er ikke målt. **MÅLT samme formiddag og RETTET i koden — se rækken nedenfor (#620, #622).** | DEL 4 «En rolle der aldrig blev sat»; `~/Downloads/recon-memberdetail-rest.md` |
| LØST 4/9 kl. 10:33 i prod (#620, #622) — bevis i drift udestår | **Owner-hullet er lukket i `handle_new_user`: det FØRSTE medlem i en virksomhed bliver owner.** Reconen (`~/Downloads/recon-owner-rollen.md`) fandt at kun ÉN vej i koden gav owner — signup hvor invitationen ikke bar et `company_id` (ny virksomhed). Alle andre gav `member`, inklusive den nuværende indgang (Monday → betaling → `sikrIndgangsInvitation` MED `company_id` → `handle_new_user`s company_id-gren). Ingen skrivevej udelader rollen (kolonnens `DEFAULT 'owner'` bruges aldrig), ingen CHECK, ingen trigger, ingen test sikrede en owner. **Rettet i `handle_new_user` (#622, grønt lys givet — funktionen står på FORBIDDEN-listen):** ÉN ændring i company_id-grenen, `CASE WHEN EXISTS (company_members for virksomheden) THEN 'member' ELSE 'owner' END`; alt andet ordret. Beslutning (Jonas): rettelsen i funktionens egen gren, ikke en trigger der skriver oven i. Migration `20260904110000_handle_new_user_foerste_medlem_owner.sql` **kørt i prod kl. 10:33 og verificeret:** betingelsen står i `pg_get_functiondef`, `on_auth_user_created` intakt (`enabled: O`), 35 owner / 3 member uændret. **Bevis i drift udestår:** en rigtig signup på en invitation MED `company_id` på en tom virksomhed skal give `owner`, og på en virksomhed med et medlem `member` — fire pending invitationer ligger klar. **Åbent, i migrationens kommentar:** `process-pending-invitation`, `attach-user-to-company` og legat-vejene skriver stadig `member`; sjældne, menneskekaldte, ikke på FORBIDDEN-listen, rettes med samme betingelse senere. Sidebemærkning fra reconen: `send-pulse-reminder` sender KUN til rollen `member` — datarettelsen kl. 10:17 kan have slukket påmindelsen for de ni, hvis cron'en kører; ikke målt. | `supabase/migrations/20260904110000_…`; `~/Downloads/recon-owner-rollen.md` |
| LØST 4/9 (#623) | **M/M for marginer er procentpoint, ikke relativ ændring.** `deriveKpiMetrics` brugte `(nu − før) / \|før\| × 100` for alle seks nøgler — også DB-margin og resultat-margin, hvor begge værdier selv er procenttal. Set på skærm kl. 10:25: «RESULTAT MARGIN 35,4 % · +7996,4 % M/M» (forrige ≈ 0,44 %), «DB MARGIN 45,7 % · +51,8 % M/M» (forrige ≈ 30,1 %, altså +15,6 procentpoint). Nu: beløb relativt (som før), procent-KPI'er `nu − før` vist som «+15.6 pp»; `changeArt` (`relativ` \| `procentpoint`) gør formen eksplicit for aftagerne (/kpis, virksomhedssiden, chattens «Se tal»). Margin-FORMLEN (gross_profit/revenue, ebt/revenue) er rigtig og urørt; `pctChange` og motorens `pctAendring` regner på beløb og er urørt. `deriveKpiMetrics` havde ingen tests; nu seksten (`noegletal/__tests__/deriveKpiMetrics.test.ts`). **Åbent, ikke rettet:** «mål 60 %» for DB-margin er `KPI_FALLBACK_TARGETS`, ikke et sat mål; ét fælles fallback dømmer engros (45,7 %) som «under» og lader konsulent (96,9 %) «ramme» uden at sige noget om branchen — branchespecifikt eller fraværende fallback er en beslutning. | `~/Downloads/recon-kpi-margins.md`; `src/lib/kpiDefs.ts` |
| ved næste oprettelse — **MÅLT 14/9: den første import gav INGEN branchekode** | **Udestående bevis for trin 4** (branchen): næste rigtige «Godkendt» på Monday eller «Importér ansøgning» skal give en række med `industry_code` sat. 14/9 kl. 08:10:15 gav importen af Nordic By Hand «cvrapi svarede error=QUOTA_EXCEEDED» — ingen `industry_code`, ingen adresse, `cvr_fetched_at` NULL; sat i hånden 10:53. Kvoten hænger på Supabases IP (DEL 2 «14. september» §6). Beviset for trin 4 venter på en ny CVR-kilde (Virk, besluttet 14/9). **YKRG APS (CVR 44891917) kan ALDRIG beriges:** cvrapi svarer 404 NOT_FOUND (målt 14/9 ca. 12:00); berigelsen tæller hende alligevel som kandidat og brænder ét opslag pr. kørsel. | `docs/indgangen-overhaling.md` §6, §9 trin 4; DEL 2 «14. september» §6, §14 |
| LØST 3/9 kl. 11:50–12:00 | **Branchedataene og kontakt-email i prod** (#567): 29 af 30 aktive har kode og label, ingen registerkoder (Two Socks → `food_restaurant`, WESDEX → `construction_craft`, begge med benchmarks nu); 30 af 30 har kontakt-email — 14 fra eget medlem, 3 fra den ventende invitation (Din økonomiafdeling, Two Socks, WESDEX: de har ingen medlemmer). Tilbage: Bastant Design uden kode og label (intet CVR, ingen gemt DB25). | `docs/indgangen-overhaling.md` §10 |
| samtale | **De otte uenigheder mellem CVR og platformen** er ikke rørt: ANLA GLAS, Brick Works, Homie, Limo Group, Studio Mini, TOFT, Topix, TuaMea. Ti af ti målte koder uenige med motoren; Brick Works og TuaMea ville MISTE deres sammenligning (motoren svarer null). Ikke kosmetisk: ANLA GLAS' DB-margin på 50 % flytter fra venstre kant til over midten. Hvem der har ret kan ikke afgøres fra data (Topix: mennesket; Limo Group: registret). Én samtale, ingen kode. | `docs/indgangen-overhaling.md` §10, `~/Downloads/recon-branche-uenighed.md` |
| LØST 3/9 (#571) | **`DashboardSkeleton` fjernet** — komponentfilen slettet; de fire træffere tilbage i `src/` er kommentarer der fortæller historien. | `docs/indgangen-overhaling.md` §10 |
| LØST 3/9 (#569) | **Ankomstens løse ender**: fokuskortet åbner velkomstvideoen via URL-hashen `#velkomst` (boksen læser, åbner, rydder), og den sammenfoldede pille trækker sig KUN på forsiden og KUN mens kortet viser tjeklisten — Jonas: «Det er vigtigt vi får et nyt medlem godt i gang, så den må ikke forsvinde for dem.» De to hang sammen (pillen var eneste vej tilbage efter «Se senere»). **Bevis udestår:** pillen væk på forsiden/stående på Rapportering kræver en konto med uafsluttet tjekliste (testbrugerne er slettet — næste rigtige medlem); velkomst-punktets knap kræver `velkomstvideo_guid`. «Dine tal»-kortets tomme tilstand står stadig nederst — åbent. | `docs/indgangen-overhaling.md` §5, §10 |
| LØST 3/9 kl. 10:52–10:57 | **Testopstillingen er ryddet (trin 14).** FLOOR1 I/S med `jonas+test1/2/3` slettet via /members' slet-dialog med brugere; «Jonas legat» (april-testvirksomheden, bar de to annullerede testabonnementer) slettet efter at storage-filerne først var fjernet i Lovables Storage-flade; den forældreløse `jonas+test45login` slettet fra SQL editoren inkl. `auth.users`. Målt efter: 38 virksomheder, 44 auth-brugere, 41 profiler, ingen rester, ingen storage-filer. **Stripe-testkunderne bliver stående (besluttet):** `cus_VBtMOGBenIfWt4` bærer faktura TBR-0003 og kreditnota TBR-0003-CN-01 — bilag skal kunne læses; to kunder fra «Jonas legat» står uden abonnement og uden kort. Ingen af de tre hører til en virksomhed i databasen. | `docs/indgangen-overhaling.md` §11 |
| åbent (Community-opdagelse LØST 3/9) | Nudge-formen som designdokument, ~~Community-opdagelse~~ (**LØST 3/9 med #576/#577**: opslagsmail + vægt på forsiden — uden om nudge-formen, fordi mailkæden fandtes), Events (bekræftelse, kalender, lokation), Milepælene ud — rækkefølgen fra 1/9 står for resten. | prioritering §2–5, community-design §4–6 |
| LØST 3/9 (#579) | **Medlemmerne i Community.** Bygget som spor på /community: alle medlemmer fra Netværkets data, dem med profiltekst først, ingen skjules, den indloggede øverst. Set på skærm af Jonas. | community-design §8 |
| LØST 3/9 kl. 14:39 | **Bevis for opslagsmailen i drift.** Første forsøg kl. 14:30 fejlede (nul notifikationer, tom function-log — browseren kørte gammel frontend); andet forsøg efter hard reload gav 27 notifikationer og en rigtig mail med portræt, uddrag og knap i Jonas' medlemskonto. | community-design §4 |
| observation | **Reaktionsknappen findes kun inde i tråden** (`CommunityTraadView:402`) — ingen like fra feed eller forside; den letteste interaktion kræver et klik ind. Ikke besluttet. | community-design §9 |
| åbent | **Ingen fravalgsnøgle for Community**: opslagsmailen følger «Opdateringer» (`important`) med alt andet; dagskvoten 5 gælder. | community-design §9 |
| noteret | **Svar udløser ingen mail til andre end de nævnte** (`notify-community-svar` findes, in-app til forfatteren). Ikke afdækket nu. | community-design §9 |
| ikke afdækket | **Nudging generelt** — Jonas spurgte 3/9; ingen recon lavet. | community-design §9 |
| epic (rådgiverfladen) | **Rådgiver som medlem.** Jonas 3/9: «jeg som rådgiver også skal have en virksomhed, hvor jeg kan switche imellem, om jeg vil se platformen som rådgiver, eller om jeg vil agere rådgiver eller være inde på min medlemsvirksomhed.» IKKE company-override («se en andens virksomhed»); rådgiveren ER selv medlem et sted og skifter hat. Jonas har i dag TO auth-brugere (rådgiver + medlemskonto på Topix.dk — dén modtog opslagsmailen). | konvergens §2.9, community-design §9 |
| EPIC, én samtale (Jonas 4/9) — ikke tre løse tråde | **Opgave-modellen, Milestones og refleksionens form hænger sammen og tages SAMLET.** **Målt i prod 4/9 kl. 11:48:** `company_actions` har 64 `proposed`, 63 `expired`, 10 `done`, 7 `dismissed`, 1 `active`. Modellen kører, men bruges ikke. **ÅRSAGEN, målt i koden samme dag** (`~/Downloads/recon-opgavemodellen.md`, uden for repoet — genskabes hvis den bruges): `generate-weekly-focus` skriver op til TRE forslag pr. virksomhed HVER MANDAG kl. 06 (72 forslag fra 24.–31. august = to kørsler); levetiden er 14 dage (`opgaveEngine.ts`); «Dine aftaler» på medlemmets forside viser ÉT forslag ad gangen (`BoardroomView` + `aftaler.ts`, kilde-rangeret: advisor før reflection før ai_weekly/agent); og der er INGEN besked om et nyt forslag — `weekly_focus_ready` skrives med `priority: "info"` og holdes bevidst ude af mailkæden, `foreslaa-opgave` rører ikke `awaiting_reply_from`, og der findes ingen ulæst-markering nogen steder. Fire kilder opretter opgaver: W1 ugefokus, W2 agenten, W3 rådgiverens «foreslå opgave», W4 en død komponent der aldrig rendres. **KONSEKVENSEN, som skal læses rigtigt: de 63 udløbne opgaver er IKKE tegn på at medlemmerne ikke gider.** De 63 er arven fra før modellen (lukket manuelt 31/8); cron'en har endnu intet lukket, første bølge udløber 7/9. Platformen foreslår langt mere end den viser, og fortæller ingen om det. Modellens eget designdokument forudså det (`docs/opgave-model-design.md`, B8): «uden en udgang vokser bunken med cirka 150 om året pr. aktiv virksomhed». `deferral_count` (udskydelser, højst to) og `week_key` (sporbarhed, uden logik) er bygget, men har formentlig aldrig været i brug — der er ÉN aktiv opgave i prod, og den er den første registrerede aftale i platformens levetid (31/8, Topix, «Afslut handout for bogholderi»). **DET DER SKAL AFGØRES — åbne spørgsmål, ikke besvaret her:** (1) Skal der foreslås færre, eller vises flere? Tre om ugen pr. virksomhed mod ét synligt ad gangen er en ubalance, uanset hvilken vej den rettes. (2) Skal et nyt forslag give besked? I dag gør det ikke. (3) Milestones og `company_actions` er to tabeller for beslægtede ting — hvad er forskellen, og skal de forenes? Menuen har stadig et Milestones-punkt (Jonas 4/9: «den funktion skal vi have fundet ud af hvordan vi gør langt mere nyttig og brugbar»). (4) Refleksionens tre spørgsmål. Målt 4/9: formen er IKKE problemet — 20 af 24 refleksioner har alle tre felter udfyldt, og andelen der reflekterer STIGER (12 % i marts til 67 % i juni). Men antallet der rapporterer FALDER: 17, 14, 12, 9, 8 ud af tredive. Undersøges ikke nu (Circle-exit og nye medlemmer ændrer forudsætningerne), men hører til samme samtale. De samme punkter står som det designet ikke afgør i `docs/forsiden-design.md` §12. *Målt 7/9 kl. 12:40: 97 forslag i alt — 10 gjorte, 63 udløbne, 7 afviste, 1 aktiv; medlemmerne svarer på under ti procent. Aktive opgaver udløber aldrig (B2-cronen forudset 22/8, aldrig bygget; rammer i dag én virksomhed, Topix' egen). Tre udløbsformer i huset. Detaljen i DEL 2 «Opgave-modellen»; mangellisten bærer tre kort.* | `docs/forsiden-design.md` §12; `docs/opgave-model-design.md` B6–B10; `docs/opgaver-og-chat-31-august.md` §2, §8; `~/Downloads/recon-opgavemodellen.md` |
| NÆSTE — rækkefølgen for forsiden (4/9 sen eftermiddag) | **1. Fladen på dommen — GJORT og BEVIST (#637, #638).** `/forside` viser dommen; målt på skærm 4/9 kl. 13:04: syv linjer mod køernes 38 rækker, nul under tærsklen. Køerne er fjernet; DEL 2 bærer detaljen. **2. Virksomhedssiden der læser «derfor er du her»** (§6): linjen bærer allerede grunden som `?grund=<slags>` (#637) — virksomhedssiden viser den ikke endnu; formen (parameterens navn er sat, visningen øverst i blok 1 er ikke) er det næste skridt. **3. Swappet ind på roden — GJORT 4/9 aften (#650).** `/forside` viderestiller til `/`; rådgiveren lander i det nye. `AdvisorDashboard` bliver stående, fordi `hentAdvisorDashboard` bor der — dens JSX er uden aftager, og det står i filhovedet. **`/members` venter stadig** på at Indgang, Fornyelse, Legat og admin-sektionen får et hjem: Indgang og Fornyelse ER på forsiden som slags 1 og 2 gennem dommen, men knapperne (beslut, sæt pris, send mail) findes kun i sektionerne på `/members`; Legat og admin-sektionen har intet sted i designet endnu. Se også rækken om konverteringen nedenfor — `Members` konverteres SIDST. | `docs/forsiden-design.md` §6, §12, §13; DEL 2 «Forsiden — fra KØ til OPGAVE» |
| BESLUTTET 4/9 eftermiddag — det gamle design KONVERTERES, ikke flyttes; rækkefølgen står | **Det gamle design skal konverteres, ikke flyttes.** Jonas 4/9: «vi springer aldrig over hvor gærdet er lavest — vi bygger det ordentligt.» Anledningen var ønsket om at få den gamle menu væk fra adminfladen («pisseirriterende at flyve frem og tilbage mellem nyt og gammelt design»), og idéen om at skifte SKALLEN uden at røre siderne. **Målt samme dag** (`~/Downloads/recon-admin-skallen.md`, uden for repoet — genskabes hvis den bruges): ingen af de ni admin-sider (`/admin/emails`, `/admin/email-log`, `/admin/review-queue`, `/admin/config`, `/admin/feedback`, `/admin/legat`, `/admin/import`, `/admin/report-debug/:reportId`, `/members`) bruger noget fra `AppLayout` — nul `useContext`/`useOutletContext`, ingen props; de importerer den kun som wrapper, så et skalskifte er teknisk trivielt. **MEN:** `index.html` har hardkodet `class="dark"`, og `hjemmebane.css` definerer kun `--hb-*`-variabler; alle ni har overskrifter med `text-foreground` (lys tekst fra `.dark`), som ville stå direkte på Hjemmebanes lyse papir og blive ulæselige, og indholdet (`glass-card`, `bg-card`, shadcn) ville blive mørke bokse på lys baggrund — præcis det udtryk Jonas afviste på virksomhedssidens chat (blok 4). Et skalskifte flytter altså problemet frem for at løse det. **Valget er A: hver side konverteres rigtigt, én ad gangen, i den rækkefølge de gør skade.** **RÆKKEFØLGEN:** **1. `/milestones` FØRST** — den eneste flade i MEDLEMMETS menu der lander i det gamle design; den rammer kunder, ikke rådgivere. Bemærk: dens FUNKTION afventer opgave-modellen (epic'et fra #632, rækken ovenfor), men dens SKAL er et problem nu. Udtrykket konverteres med den funktion siden har; bliver funktionen lavet om senere, er skallen allerede rigtig. **2. Admin-siderne — SEKS af otte GJORT samme eftermiddag** (#645 Legat, #646 e-mail-log, #647 Review Queue, #648 Platformconfig, #649 Import, #651 Feedback; rækken «KONVERTERINGEN» nedenfor og DEL 2). `ReportDebug` er under konvertering; `EmailTemplates` konverteres IKKE, den designes (egen række). **3. `Members` SIDST**, fordi den alligevel skal skæres op: Indgang og Fornyelse flytter til forsiden, listen er erstattet af `/virksomheder`, og Legat og admin-sektionen skal have et hjem. At konvertere den nu ville være at gøre en side pæn, som skal deles i fire. Opskriften er den fra byggeomkostnings-reconen (rækken om rådgiverfladens overhaling): motor først, gammel flade fryses på motoren, ny flade på midlertidig route, swap på den gamle URL. | `~/Downloads/recon-admin-skallen.md`; `docs/raadgiverfladen-design.md` §9–10; DEL 2 «Rådgiverfladen — designet er låst» |
| LØST 4/9 aften — begge etaper GJORT (etape 2: #644); målingen står, så den kan læses bagud | **`/milestones` er konverteret til Hjemmebane i to etaper.** **HVORFOR DEN KOMMER FØRST:** det er den ENESTE flade i MEDLEMMETS menu der lander i det gamle mørke design (`HbMemberShell.tsx:147` → `ProtectedRoute` + `AppLayout`, `App.tsx:197`). Jonas 4/9: «rigtig dårlig oplevelse». Den rammer kunder, ikke rådgivere — de øvrige ni gamle sider er admin (rækken ovenfor). **FORMEN FINDES — konverteringen følger et mønster frem for at opfinde et:** `HbProgressBar` (`hjemmebane/akademi/HbProgressBar.tsx`: «3 af 8» + hairline-bar, ingen procenter, ingen badges); `HbItemRow` (`hjemmebane/akademi/HbItemRow.tsx`: række med tilstandsprik i fire tilstande, titel, meta, hele rækken som link); `HbHandoutCard` (`hjemmebane/handouts/HbHandoutCard.tsx`: kort med status, fremdriftsbar og klik som handling); `HbOnboardingTjekliste` (afkrydsningsrække med gjort-tilstand); virksomhedssidens milestones-blok i læse-tilstand (`hjemmebane/virksomhed/VirksomhedView.tsx:1037–1063`); og `hjemmebane/handouts/HbHandoutLeverRow.tsx:75–84` — den ENESTE Hb-flade der i dag viser en milestone med fremgang. **MÅLT 4/9, omfanget** (`~/Downloads/recon-milestones.md`, uden for repoet — genskabes hvis den bruges): `pages/Milestones.tsx` 18 `text-foreground`, 14 `text-muted-foreground`, 2 `glass-card`, 5 shadcn-imports; `MilestonesList.tsx` 13, 29, 4, 6; `DashboardMilestones.tsx` 2, 5, 1, 0. Dertil rå tailwind-farver for kategorierne (`emerald/blue/indigo/pink-500/15`, `dark:text-…-400`) fra `lib/milestoneCategories.ts`. Tekst DIREKTE på skallens baggrund, som bliver ulæselig på lyst papir: `Milestones.tsx:137, 140, 156, 159`. `MilestonesList.tsx` har INGEN — alt ligger i `glass-card` eller i portaler. Data: ingen `useQuery`; læsning på `company_id` (`select("*")`), alle skrivninger direkte i tabellen, ingen edge function i skrivevejen (de tre `functions.invoke` er Slack-notifikationer bagefter). **DET DER GØR DEN DYR — de fire RADIX-PORTALER:** `Dialog`, `AlertDialog`, `Popover` og `Select` portalerer til `<body>`, uden for `.theme-hjemmebane`, og arver appens mørke tokens. Huset har lært det før: `HbOnboardingTjekliste.tsx:31–34` («IKKE EN RADIX-DIALOG») og `HbSidebar.tsx:168–170` («bevidst IKKE shadcn Sheet»). De skal derfor BYGGES OM, ikke omfarves — det er datovælgeren (`Popover`+`Calendar`), kategorivælgeren (`Select`), detalje-dialogen (`Dialog`) og slet-bekræftelsen (`AlertDialog`). **ETAPEDELINGEN, besluttet 4/9:** **Etape 1 (GJORT 4/9):** siden, listen og rækkerne i Hjemmebane, monteret i `HbMemberShell`; handlinger der krævede en portal åbnede ind til den gamle komponent uændret. **Etape 2 (GJORT 4/9 aften, #644):** de fire portaler bygget om med den nye primitiv `HbOverlejring` — fokusfangst, Escape i capture-fasen, overlay-klik der ikke lukker advarselsdialogen, fokus tilbage; scroll-låsen på body bevidst ikke genskabt (DEL 2 «Konverteringen»). Om #644 også afgjorde de to punkter nedenfor er ikke efterprøvet i denne bogføring. **TO TING DER SKAL AFGØRES i etape 2 eller før:** (1) Kategorifarverne er rå tailwind i mange kulører; Hjemmebane bruger få farver med vilje. Skal de oversættes eller erstattes af noget roligere? (2) «Nået» dømmes forskelligt: `/milestones` bruger `progress >= 100` (`Milestones.tsx:60`, `MilestonesList.tsx:52`), mens virksomhedssidens blok bruger `status === "completed"` (`VirksomhedView.tsx:976`). To domme for det samme — samme slags dublet som dem vi fjernede 3/9. **OG BEMÆRK,** som allerede står i epic'et fra #632: Milestones' FUNKTION afventer opgave-modellen. Det her er dens UDTRYK. Bliver funktionen lavet om senere, er skallen allerede rigtig. | `~/Downloads/recon-milestones.md`; rækken «det gamle design KONVERTERES» ovenfor; epic-rækken fra #632; `docs/opgave-model-design.md` §3.1 |
| LØST 4/9 aften — ALLE OTTE admin-sider GJORT på cirka to timer (#645–#649, #651, #653, #654); `EmailTemplates` skal stadig designes (rækken nedenfor) | **Alle otte gamle admin-sider er i Hjemmebane.** Rækkefølgen var den letteste først, målt i `~/Downloads/recon-admin-omkostning.md` (uden for repoet — genskabes hvis den bruges): #645 Legat (377 linjer, nul portaler), #646 e-mail-log (311 → 21 + view), #647 Review Queue, #648 Platformconfig, #649 Import, #651 Feedback (fem portaler, næstdyrest), #653 ReportDebug (fold+JSON — ny form, native `<details>`), #654 EmailTemplates (dyrest: 1140 + 530; faner — ny form på `HbSegmented`; den gamle `RichTextEditor` monteret uændret og markeret, fordi Hb-editoren ville smide CTA-attributterne væk). Begge nye former er markeret så de kan løftes. Mønsteret er bevist syv gange med Milestones og går hurtigere for hver; DEL 2 «Konverteringen» bærer formen og de tre beslutninger der lå i Review Queue (flag-liste, ikke godkendelsessted; «ordet siger hvad flaget er, tonen siger kun om det er en fejl»), Platformconfig (rådgiverlisten øverst — eneste sted rådgivere inviteres; tre dele uden læser BEHOLDT) og Import (`HbReportUploadZone` med `conversationId={null}` er identisk med `adminMode`, afgjort ved ordret sammenligning). **Fælles for alle otte:** siden sender et `active` der ikke matcher noget nav-punkt (Platform-punkterne har bevidst intet), med kommentar — menuen er ikke rørt, for hvad den skal indeholde er målt separat (rækken «MENUEN» nedenfor). **Ikke efterprøvet:** ingen af de otte er set på skærm i denne session; typecheck og tests var grønne for hver. | DEL 2 «Konverteringen»; `~/Downloads/recon-admin-omkostning.md`; rækken «det gamle design KONVERTERES» ovenfor |
| DESIGNPUNKT, Jonas 4/9 — ikke en konvertering | **E-mails (`/admin/emails`, `EmailTemplates`) skal ikke konverteres — den skal DESIGNES.** Målt 4/9: 1140 linjer plus `RichTextEditor` på 530, fire Select i filen og tre portaler i editoren, og to former findes ikke i Hjemmebane: faner (fem i dag) og HTML/preview. Det er den tungeste af de otte. Jonas 4/9: den skal blive det FULDE overblik over alle mails — transaktionelle, påmindelser og marketing — med hvornår de kører, hvad der udløser dem, og mulighed for at rette dem. Det er en flade der skal designes som indgangen og forsiden blev det: HVAD først, form bagefter. **Udtrykket ER konverteret (#654, samme aften):** den gamle side er væk fra AppLayout; filhovedet i `EmailTemplatesView.tsx` siger hvad fladen skal blive til. Det der står tilbage er gentænkningen — og Hb-editoren uden portaler, som kræver CustomLink + TextAlign + CTA-værktøj (eller kommer med gentænkningen). | `~/Downloads/recon-admin-omkostning.md` §5–6; DEL 2 «Konverteringen» |
| MENUEN — målt 4/9 aften (`~/Downloads/recon-admin-menuen.md`, uden for repoet — genskabes hvis den bruges); navnene er IKKE afgjort | **Hvad admin-blokken skal indeholde, målt punkt for punkt.** **Review Queue KAN fjernes fra menuen:** godkendelsen bor et andet sted (`ReportReviewDialog`), og Jonas åbner den kun hvis nogen siger at noget mangler. **Platformconfig KAN IKKE fjernes:** eneste sted rådgivere kan inviteres og fjernes og admin-rollen skiftes (`manage-advisor` har ingen anden kalder). **Import hører på VIRKSOMHEDSSIDEN, ikke som eget punkt** — men funktionen skal med: den er eneste vej til upload for en virksomhed uden company-override og uden rådgiver-notifikation. **Legat KAN IKKE fjernes:** de to edge functions (`create-legat-enrollment`, `upgrade-legat-to-member`) har ingen anden kalder. **NAVNENE:** Jonas 4/9: «tingene skal hedde det de er» — Review Queue, Platformconfig og Import er ord ingen har valgt. Ikke afgjort. Menuen (`HbMemberShell.tsx`, admin-blokken) er ikke rørt af konverteringerne; de seks sider markerer bevidst intet nav-punkt, indtil blokken tegnes om efter denne måling. | `~/Downloads/recon-admin-menuen.md`; `HbMemberShell.tsx` admin-blokken; rækken «KONVERTERINGEN» ovenfor |
| RÅDGIVERENS CHAT — GJORT 4/9 aften i tre trin (#655 etape 1, #657 etape 2, #658 skallen); én gæld står: `align` på `HbPopover` | **Rådgiverens chat (`CompanyChatPane`) er Hjemmebane hele vejen.** **Etape 1 (#655):** udtrykket skulle ikke opfindes: `MemberChatPane` er 965 linjer ren Hjemmebane og en ORDRET kopi af `CompanyChatPane` med rådgiverdelene slettet — filhovedet siger at skeletterne er bevidst dublerede, så medlemssiden kunne designes frit. Klasserne er kopieret derfra. De seks delte byggesten fik `variant="hb"`, som rådgiveren sendte 0 af 8 mulige steder, selv om komponenterne allerede kunne det. `TOPIC_COLORS` er off-token og droppet. Chatten i blok 4 på virksomhedssiden (låst til én virksomhed, #614) fulgte med, for det er samme komponent. **Etape 2 (#657) er GJORT.** Sidebaren, «Se tal»-skuffen og ⋯-menuen. Efter etape 2 er der INGEN `glass-card`, `bg-card`, `text-foreground` eller `border-border` tilbage i `CompanyChatPane`. Samtalelisten er husets listeform: papir, hairlines, søgefelt i `hbControlClasses` som virksomhedslisten, grupper som eyebrow med tælleren som `HbTag`. «Kræver svar» er rust, **«Tjek ind» er blæk hvor den før var amber — en påmindelse er ikke en fejl.** Samme princip som Review Queue: tonen siger kun om noget haster. Skuffen beholder vaul-Draweren, så overlay og swipe er som før, og får `theme-hjemmebane` på indholdet — samme greb som `MobileMessageActionDrawer`. `KPICard` er erstattet af en kopi af virksomhedssidens kort uden sparkline; dommen (`getTargetStatus`) er den samme. ⋯-menuen er ikke længere en Radix Popover, men en lokal `HbMenu` i DOM-træet: `HbPopover` (i `HbOverlejring`) er venstre-forankret og bygget til datovælgeren under et felt, mens ⋯ står i headerens højre kant. **En `align`-prop på `HbPopover` ville gøre `HbMenu` overflødig** — det står i koden som gæld. **#658: `/chat` har fået Hjemmebane-skallen.** Chatten var konverteret, men siden lå stadig i `AppLayout`, så det papirfarvede panel stod i den mørke skal med den gamle menu ved siden. Rådgiverens gren bruger nu `HbMemberShell` som de tre andre grene i `ChatShell`; medlemmets og abonnentens er urørte. Højden følger virksomhedssidens blok 4, som allerede havde løst en chat i bundet højde inde i en skal der selv scroller. `scrollTop`-fixet fra #639 holder — det virker netop fordi det ikke rører forfædre. Og gælden fra etape 2 er betalt: «Indbakke»-overskriftens egen `theme-hjemmebane` er væk, fordi hele siden nu er Hb. | DEL 2 «Konverteringen»; `docs/chat-design.md` |
| ÅBENT ved dagens slutning 4/9 — det der står tilbage efter at rådgiverens hverdag blev Hjemmebane hele vejen | **Seks punkter, hver med sin egen række eller sit eget sted:** (1) `/members` kan ikke swappes — elleve dele findes kun dér (rækken «MÅLT 4/9 sen aften» ovenfor). (2) `EmailTemplates` skal designes, ikke konverteres (rækken «DESIGNPUNKT»). (3) Milestones' FUNKTION afventer opgave-modellen; kun udtrykket er gjort (rækken «EPIC, én samtale»). (4) Forsidens dom mangler de to AI-baserede slags — §8's AI-læsning (`docs/forsiden-design.md` §8, §12; `src/lib/forsidensDom.ts` har pladsen i typen). (5) Ingen af de otte admin-sider er set på skærm — beviset er Update og et klik på hver. (6) `align`-prop på `HbPopover`, så `HbMenu` i `CompanyChatPane` kan udgå (gælden fra #657). | DEL 2 «Konverteringen» (status ved dagens slutning) |
| driftsgæld | Fejlovervågning: query- og mutationsfejl i frontend logges globalt fra 7/9 (#702) — men ingen alarm, og edge functions er ubevogtede; restore er aldrig afprøvet; `run-weekly-agent` er SLETTET 13/9 (#836) — den stod aldrig i `cron.job` og kørte aldrig (DEL 2 «Agentkæden»; «13. september» §16); 73 uploads bestod validering uden at blive committet; e-conomic-integrationen er død (migration-recon §10). | status-1-sept §6; den forrige overlevering (§7, før omskrivningen i #538) findes kun i git-historikken |
| MÅLT 6/9 — LØST VED SLETNING 13/9 (#836) | **Løst: `run-weekly-agent` findes ikke længere** (Jonas 11/9: «A»; DEL 2 «13. september» §16) — agenten er hændelsesdrevet (rapport og anomali). *Som det stod 6/9:* **Ugeagentens cron findes ikke i prod.** `run-weekly-agent` har kun `Deno.cron` (kører aldrig på edge-runtimen); `cron.job` har ti jobs, ingen kalder den. Kun `generate-weekly-focus` (0 6 \* \* 1) kører mandag. Om agenten NOGENSINDE har kørt fra cron, er ikke efterprøvet (`agent_runs.trigger` kan svare). Skal den køre, er vejen pg_cron + `net.http_post` som `intro-reminder-cron` — men den kører LIVE og skriver det medlemmet ser, så det er en beslutning, ikke en rettelse. | DEL 2 «Agentkæden»; DEL 4 (`Deno.cron`) |
| LØST 6/9 sen aften (#670) | **De elleve typefejl efter Lovables regenerering af `types.ts`** er rettet ved at lade husets egne interfaces sige sandheden om databasen — `EventTimes.ends_at` og de fire felter på `MemberProgress` er valgfrie OG nullable — og ved at skrive reglen ned begge steder: null og undefined betyder det samme, «det er ikke sket». Ingen casts, intet non-null, ingen ændring i `types.ts`. Tretten nye tests låser reglen, inkl. grænsen ved `starts_at` + 90 min. **Målt efter:** tsc giver præcis fire fejl (CompanyChatPane, PushView, RapporteringView ×2), 1656 tests grønne. | DEL 1 «Kodearbejde» |
| LØST 7/9 kl. 14:51 — jobbet er planlagt; **22/9** er PHILBERTs varsel 2 | **Cron-jobbet for fornyelsesvarsler skal planlægges.** Kæden sender og er bevist i produktion 7/9 kl. 11:57 (DEL 2 «Fornyelseskæden»), og jobbet ER planlagt 7/9 kl. 14:51: `fornyelsesvarsler`, `0 11 * * *` UTC (13:00 dansk), aktivt — målt i `cron.job`, ellevte job, alene på klokkeslættet. Kæden kører af sig selv. Første rigtige afsendelse er PHILBERTs varsel 2 den 22/9. | fornyelseskæden §15; DEL 2 «Fornyelseskæden» |
| MÅLT 7/9 — punkt 1–4 LUKKET (#703, #706, #708); 5–11 og de 115 står | **De tavse fejl.** 122 af 139 `useQuery` læser aldrig `isError`; 115 queryFn'er gør en Supabase-fejl til tom data, så TanStack ser en succes; 52 kald med `const { data } = await` uden `error`-tjek; 25 mutationer uden `onError`, 50 uden throw. Global fejllogning findes fra #702; forsidens ni delkald kaster fra #703. **Rækkefølgen for resten:** 2) `/virksomheder`, 3) `/members`, 4) medlemmets «Dine aftaler» og ulæste, 5) Rapportering («Ingen rapporter endnu» til et medlem med 20), 6) nøgletals-mål og benchmarks — FORKERTE tal, ikke tomme, egen alvor — 7) app-config, 8–11) admin-lister, community, mutationer. Mønstret: `kraevRaekker` + `isError`-gren + kildelæsende værn (DEL 1 «Kodearbejde»). *7/9 sidst på dagen:* punkt 1–4 er lukket (#703, #706, #708) og standardmål markeres; punkt 5–11 og de 115 står tilbage — stadig husets største systematiske hul. | DEL 2 «De tavse fejl»; `~/Downloads/recon-tavse-fejl.md` (uden for repoet) |
| LØST 7/9 sidst på dagen (#707, #709) | **Fornyelsesbeslutningen kan træffes fra virksomhedssiden**, og `company_fornyelse` skrives ét sted, låst af et værn. Livjas beslutning (slut 16/12) skal foreligge senest 16/11 for at varsel 1 kan gå — nu uden at nogen skal skrive /members i hånden. | DEL 2 «Fornyelseskæden» |
| RETTET 7/9 aften (#716); CARMAs slutdato flyttet i hånden kl. 18:23 | **Varselsmotoren sendte til en der ikke kunne betale.** CARMA STUDIO fik varsel 2 kl. 11:57 med en knap der ikke virkede (slutdato 7/9 ≤ ikrafttrædelsen 10/9 → `uden_for_ordningen`). Nu spørger `afgoerForfaldentVarsel` tilstandsmotoren og tier med `blokeret_af`; cronen tæller `kan_ikke_handle`. Camillas slutdato er 11/9 (før: 2026-09-07), så linket virker; ingen flere mails. Åbent: badget kender kun varsel 1 (mangellisten). | DEL 2 «Fornyelseskæden — CARMA-sagen»; DEL 4 |
| **BEVIST I DRIFT 14/9 kl. 11:26–11:38 UTC — gennemkørslen: Monday «Godkendt» → første række i `company_betalingslink` → dag 0-mail → /betal → Stripe (rate12, 4.375 kr.) → webhook → invitation → signup → første login. LUKKET (mangellistens nr. 1)** | **Indgangens kæde har aldrig haft en virksomhed — fordi Monday aldrig kunne nå den.** Mondays board-webhook sender ingen Authorization-header, og `monday-webhook` afviste 401 før alt andet; dertil pegede de to automationer (21/3) på `hzlkypibayzkkumwohap`, ikke `loiavmastgeieqyiwyyr`. `monday-webhook` er det eneste INSERT i `company_betalingslink` — /betal, dag 0, påmindelserne, dag 31-fakturaen, checkout og prisknapperne hænger på den række. FLOOR1 3/9 var en enkeltkørsel i hånden. Nu: værn med to veje (`_shared/mondayVaern.ts`), ny automation «Ny ny platform» med `?noegle=`. **Gennemkørslen 14/9 (§24) beviste hele kæden** på testvirksomheden «GENNEMKØRSEL — slettes» (CVR 41772239): `company_betalingslink` 11:27:51 (første række nogensinde), `stripe_customer_id` sat af kæden selv, `INVITATION_AFSENDER_USER_ID` rigtig, fund A i drift. Ikke prøvet: dag 14/25/31 fra cronen, rådgivermail-grenen. | DEL 2 «14. september» §1, §24; mangellistens nr. 1 (lukket 14/9) |
| MÅLT 7/9 — kræver DEFINER-ændring | **Fakturateksten i `Betal.tsx` er usand i ti timer** (dag 31 kl. 00–10). `faktura_sendt_at` findes, men `hent_betalingstilbud` returnerer den ikke; ellers den mindste sande tekst («Fristen udløb {frist}. Du får en faktura …»). Rammer nul i dag, den første i morgen. | DEL 2 «Indgangen» |
| **LØST 13/9 (#832, merget 15:57:43 UTC) — HELE fallbacken fjernet, ikke kun de fire kronebeløb; et mål er noget der er aftalt (Jonas 11/9). BEVIST PÅ SKÆRM 18:26:57 («DINE MÅL: Ingen mål sat endnu», ANLA GLAS).** Var: BESLUTNING (Jonas), faglig — 7/9 | **KPI-fallbackens fire kronebeløb passer kun til én virksomhedsstørrelse.** Markeringen er bygget; tallene (omsætning 120.000, lønninger 50.000, resultat 10.000, omkostninger 80.000, plus 60 % / 15 %) er ét sæt for alle. Branchespecifikt, størrelsesafhængigt eller fraværende fallback er en faglig beslutning, ikke en rettelse. | DEL 2 «13. september» §13; «De tavse fejl», «Rådgiverfladen — listen og virksomhedssiden» (#623) |
| **LØST — MÅLT KØRT 11/9 kl. 09:20** (fem policies på `email_send_log`, «Advisors can read send log» med; `query-results-export-2026-09-11_09-20-04.csv`). Var: SKREVET 7/9, IKKE KØRT | **Advisor kan ikke læse `email_send_log` — den tredje ting omdøbningen 19/3 tog.** Advisor-policyen fra 26/2 sidder på `email_send_log_legacy`; den levende tabel har kun service-role + admin. Morten (kun advisor) ser ingen log. Migration `20260907180000_email_send_log_advisor_read.sql` giver advisor SELECT (kun SELECT), med forudsætningen ordret i filen: gælder mens advisor betyder «Jonas eller Morten». Verifikation: `SELECT policyname, cmd, roles, qual FROM pg_policies WHERE tablename = 'email_send_log'` — fire før, fem efter. Uden den kan en mail-log på virksomhedssiden ikke bygges for rådgivere (recon-mailloggen-pr-virksomhed §6). | DEL 2 «De tavse fejl»; migrationens filhoved |
| LØST 7/9 (#701) | **Sendt-loggen var død i et halvt år.** `EmailTemplatesView` og `Members.tsx` læste `sent_at`/`template_id`, som forsvandt ved omdøbningen 19/3; 400-fejlen blev til «Ingen afsendelser endnu» over 1.664 rækker. Rettet til `created_at`/`template_name` som `EmailLogView`, fejllinje ved `isError`, guard over hele `src/`. | DEL 2 «De tavse fejl» |
| LØST 7/9 (#698, #699, migration kl. 14:26) | **Slutdatoen er den sidste dag MED adgang** — begge TypeScript-kopier og de to SQL-domme, flyttet sammen; målt før/efter: præcis én virksomhed (CARMA) ramt. | DEL 2 «Slutdatoen»; adgangsdomme.md |
| LØST 7/9 (#675, #676) | **Baselinen er nul, og CI kører typecheck** — `bunx tsc --noEmit -p tsconfig.app.json` FØR testene i jobbet «Tests», uden kendt-liste og uden `continue-on-error`. Beslutningen om de fire blev «rettes» (#675), ingen af dem skjult. Bevist i drift: kørsel 34092921389, trin 6 «Typecheck» → success. Gaten fangede #678's to Record-aftagere samme dag. | DEL 1 «Kodearbejde» |
| hører til opgave-epic'et, målt 6/9 kl. 22:18 | **Godkendelse skriver indeværende uges nøgle, og halvdelen af de uafgjorte forslag kan kun forkastes.** Otte forslag fra 25/8 (Topix 6, remm. 2, alle tørkørsler); fire `update_weekly_focus` kan godkendes, fire (`write_session_prep` ×3, `write_company_action`) kan kun forkastes — linjen lover «din afgørelse» om noget hvor den ene mulighed ikke findes. Og godkendes et augustforslag i dag, lander det som DENNE uges fokus (`skrivUgensFokus` → `getISOWeekKey(new Date())`). Forslag har ingen udløbsmekanik. *Puklen peger nu direkte på virksomheden når den dækker én (#672, 7/9); dækker den flere, er det stadig `/virksomheder`, for der findes ingen flade der viser forslag på tværs — kendt, står i koden.* Mangellisten bærer to kort. *Rettet 7/9 (#682): puklen tæller nu kun `proposed` — de fire `expired` session_prep-rækker talte med, fordi filtret var `decided_at is null`; forsiden siger «1 agentforslag venter», ikke 2 (DEL 2 «Agentkæden»).* *LUKKET 7/9 (#688): et forslag udløber når dets egen ISO-uge er passeret — godkendelse afvises med 409, forkastelse er stadig mulig, og «lander i denne uge»-fælden er dermed væk (bevist på skærm hos remm. kl. 11:31). LØST (#689): puklen og virksomhedssidens signal filtrerer udløbne fra i JS. ÅBENT: ingen cron skriver `expired`; udløbne ligger som `proposed` i databasen (DEL 2 «Agentkæden»).* | DEL 2 «Agentkæden»; DEL 4; `docs/opgave-model-design.md` |
| LØST 7/9 (#721 + data kl. 19:58) | **Omkostningernes fortegn:** alle fire skriveveje skriver positivt; 40 rækker (payroll 40, depreciation 16, cogs 28, admin_costs 28) rettet i prod med SELECT før/efter, EFTER nul. Rollback = vend fortegnet på samme rækker. | DEL 2 «Omkostningernes fortegn» |
| MÅLT 7/9 kl. 20:24 og 20:32 — KUN TO AF ELLEVE udtræk er hele, men hullerne overskrives af månedsrapporter; ramt NU: remm. og YKRG | **Årsrapport-udtrækket finder for ni af elleve rapporter ikke det det skal — og det rammer dem der ikke rapporterer.** Floren (linjevalg, rettet kl. 20:15) var ét symptom. Kl. 20:32: ingen af de seks mangler omsætning i de seneste tolv rækker; ANLA 12/12 målte, Booking/Livja/Topix 7–8/12. remm. 0/12 målte (ni måneder uden rapport), YKRG 2/12 — og ti rækker med omsætning NUL, som dommene ikke er beskyttet mod i tælleren. SAMME GRUPPE som de 73 ventende uploads og de under ti procent der svarer: fravær, og en platform der viser noget andet i stedet. **Det næste:** elleve PDF'er, én tabel over hvad hver rapport faktisk indeholder, beslutningen byg om / manuel indtastning — og FØRST: mål hvad YKRG ser (SQL i DEL 2). | DEL 2 «Årsrapport-udtrækket»; mangellisten «Kun to af elleve …», «remm. og YKRG …», «Booking Innovations personale …» |
| ÅBENT, målt 7/9 kl. 20:24 — rettes når nogen ser rapporten | **Booking Innovations personale er 46 kr. om måneden** (2024, `annual_report`), 0,1 % af omsætningen — læst tusind gange for lille, ikke en manglende linje. Konkret og målbar: én PDF, ét tal. | DEL 2 «Årsrapport-udtrækket»; mangellisten |
| oprydning, målt 6/9 | **37 grene på origin ud over `main`** (Jonas' måling 6/9; `git ls-remote --heads` gav 38 ved bogføringen samme aften). `gh pr list --state merged` er den eneste der kan afgøre hvilke der må slettes (DEL 1). | DEL 1 «Git og Claude Code» |

---

## DEL 4 · Fælder

De konkrete ting der har kostet tid. Led efter dem.

- **«succeeded» i `cron.job_run_details` er IKKE bevis for at kaldet
  lykkedes.** Det betyder kun at `net.http_post` blev afsendt. 9/9 stod
  alle ni jobs som «succeeded» mens hvert kald fik 401, fordi vault-nøglen
  var slettet — otte timer, 77 kald, nul mails. Beviset er `status_code`
  i `net._http_response` (som ryddes løbende — mål samme dag). Løst 9/9
  kl. 23:50 (blokken øverst er historik).
- **En plpgsql-variabel må ALDRIG dele navn med et tabelalias.** Vagten
  (#768) havde `r` som variabel OG som alias; `r.created` blev læst som
  variablen, og funktionen var stille forkert. Kald variablen noget andet
  end noget der kan stå efter FROM.
- **EN VAGT MÅ ALDRIG AFHÆNGE AF AT DET DEN VAGTER, ER LILLE.**
  `cron.job_run_details` havde 1.895.419 rækker (10/9) — mailkøens gamle
  afsender planlagde ét engangs-cron-job pr. afsendelse — og vagtens
  korrelerede underforespørgsel timede ud. **Tabellen kan IKKE indekseres:**
  «must be owner of table job_run_details», den ejes af systemet. Læs den
  KUN gennem primærnøglen — `ORDER BY runid DESC LIMIT n` er en
  indeks-skanning baglæns; `WHERE start_time > …` er et fuldt gennemløb
  uanset vinduet (rettet 10/9, ottende version). Og ryd tabellen: pg_cron
  rydder aldrig selv (Lovable ryddede 1.892.693 rækker 10/9; 2.734 tilbage).
- **Læs ikke en kolonnes constraints i migrationshistorikken — mål dem.**
  `advisor_notifications.company_id` stod som «nullable» i en recon 9/9 og
  var NOT NULL fra oprettelsen: `NOT NULL` stod SIDST på linjen, efter
  FK-klausulen, og blev overset. Vagten faldt på det i prod (fejl 4 af 8).
  Ét `SELECT is_nullable FROM information_schema.columns` afgør det.
- **plpgsql testes af ingen — kør SELECT'en efter migrationen.** Otte
  versioner af vagten på to dage, alle otte fejl kun fundet i prod; tre af
  dem var SQL der svarede forkert uden en lyd (undervejs, timeouts). Det
  der ville have fanget dem alle: `SELECT * FROM public.vagt_cron()` lige
  efter kørslen — den står i hvert filhoved og blev sprunget over hver gang.
- **`text[] || 'literal'` er tvetydig i plpgsql.** Literalen er `unknown`,
  Postgres vælger `anyarray || anyarray` og læser strengen som et array
  («malformed array literal»). `array_append(arr, 'x'::text)`. Og
  `net.http_post`s 5 sekunder er en KLIENT-timeout der AFBRYDER
  funktionen — sæt `timeout_milliseconds` (nu samlet i `public.kald_edge`).
- **`Deno.cron` kører ikke på Supabases edge-runtime.** En funktion med
  kun `Deno.cron` kører aldrig. Påmindelser skal have en HTTP-indgang og
  planlægges med pg_cron (net.http_post + vault-nøglen
  `email_queue_service_role_key`).
- **Auth-indstillingerne ligger i Lovable, ikke i et Supabase-dashboard.**
  Cloud-fanen → Users → Auth settings → Email. «Auto-confirm email»
  vender modsat: TIL fjerner bekræftelsen (gjort 2/9). Supabase-MCP'en
  har ikke adgang.
- **`agent_runs.trigger`, ikke `trigger_type`.** Kostede en måling 2/9.
- **`invited_by` afgør hvis en invitation er.** En pending invitation
  med en anden `invited_by` end rådgiverens er virksomhedens egen
  (kolleger inviteres ind); den er ikke et hul. Læs kolonnen før du
  kalder noget et hul (indgangsfladen §12).
- **Et cron-job kan hedde noget andet end funktionen det kalder.** Søg på
  URL'en i `cron.job.command`, ikke kun på jobnavnet
  (`intro-session-reminder` → `intro-reminder-cron`).
- **Et cron-jobs NAVN er ikke det den kalder. Læs kommandoen, ikke navnet.**
  10/9 kl. 12:44 blev `cleanup-stale-processing-reports` lagt om til
  `kald_edge` som en edge function — den kalder en SQL-funktion. 404 hvert
  femte minut i otte minutter (DEL 2 «10. september», punkt 13).
- **`app_config.config_value` er JSON, ikke text.** `'""'::json` er en
  tom streng — parset `""`, rå `""` på to tegn. Dommen ligger i
  `laesVelkomstvideoGuid` (testet); brug den, gæt ikke.
- **En UPDATE der rammer nul rækker ser ud som succes uden `.select()`.**
  Tjek både `{ error }` og antal berørte rækker (FornyelsesSektion-
  mønstret). Samme fælde ramte velkomst-stemplet 2/9.
- **`void invalidateQueries` lukker en dialog før tilstanden er hentet.**
  Await invalideringen (eller refetch) FØR du lukker, ellers viser fladen
  det gamle i et render til.
- **En webhook der svarer 500 fejler STILLE for os.** Stripe prøver igen
  i timevis (doggybeds `customer.subscription.created` 2/9: fem
  gentagelser over 19 timer), og intet i vores egen flade eller log
  siger det. Stripes Workbench → Webhooks → Event deliveries er det
  eneste sted det ses. Kig der efter enhver ændring i en webhook-gren,
  og efter enhver migration.
- **En sortliste på `metadata.art` fejler stille, når en ny art
  tilføjes.** Webhookens subscription-grene sprang kun over ved
  indgang/fornyelse; doggybeds migrerede abonnement (art «migreret», 3/9)
  faldt igennem og ville have skrevet `subscription_status` på et fuldt
  medlem. Hvidliste, hvor det er muligt — og især hvor feltet styrer
  adgang eller tier (#563).
- **«1 active subscriber» i Stripes Billing overview er et ABONNEMENT,
  ikke en faktura.** En dag 31-faktura tæller ikke med der; de migrerede
  rateabonnementer gør.
- **Migrationshistorik er ikke bevis for produktionens tilstand.**
  Funktioner har kørt i prod uden fil (`hent_betalingsdata_til_checkout`
  indtil #524); cron-jobs var slukket i prod mens repoet schedulerede dem.
  Mål i `pg_proc`, `pg_policies`, `cron.job`.
- **En slettet migrationsfil fjerner ikke dens regel i prod.** 15/9:
  `email_send_log_status_check` (syv værdier, uden `rate_limited`) kom fra
  `20260319090407_email_infra.sql`, som Lovable slettede 8/9 (`68d86a46`).
  Filen var væk, reglen blev — og to filhoveder sagde «text uden CHECK»
  med henvisning til en ÆLDRE fil. Et 429 blev derfor afvist i tavshed i
  loggen fra 14/9. Regler måles i `pg_constraint`
  (`pg_get_constraintdef`), ikke i repoet. (DEL 2 «15. september» §10)
- **Et udløbet medlem er ikke et tidligere medlem.** 15/9: for at stoppe
  rapportpåmindelser til CARMA STUDIO foreslog chatten «tilbyd_ikke» og
  status «tidligere» — det havde lukket døren til at forlænge, som stod
  åben til 25/9 (Jonas: «Hvad nu hvis? CARMA Studio gerne vil forlænge om
  to dage …»). En løsning der stopper symptomerne (mails) ved at lukke
  døren (tilbuddet) er ikke en løsning. Afgør tilstanden først —
  `afgoerFornyelsestilstand` findes (`udloebet_tilbyd`, dag 0–14) — og ret
  hvert sted der behandler tilstanden forkert (rapportpåmindelser, chat/
  broadcast/KPI, event B/C, køen). Samme fejllæsning holdt et navn ude af
  `contact_person`. (DEL 2 «15. september» §14)
- **Et filhoved beskriver hvornår det blev skrevet, ikke hvordan det er
  nu.** `intro-reminder-cron`s header sagde «havde aldrig kørt» længe
  efter den kørte dagligt.
- **Edge-runtimens `SUPABASE_SERVICE_ROLE_KEY` er en sb_secret uden
  JWT-claims.** En function-til-function-HTTP-kald mod en `verify_jwt =
  true`-funktion afvises i gatewayen. Del logikken i `_shared/` og kald
  den i samme proces (indgangsBetalingsmail-mønstret).
- **Radix-dialoger portalerer til `<body>`** uden for
  `.theme-hjemmebane` og arver appens mørke tokens. Hb-overlejringer
  bygges som `HbSidebarDrawer`: fixed, egen overlay, i DOM-træet.
- **Bunny er referrer-låst på library-niveau** til `app.theboardroom.dk`.
  En 403 i Lovables preview-domæne er ikke en fejl i vores kode.
- **PostgREST-embedding går én vej i huset:** fra child ind mod
  `companies` (`companies:company_id(...)`). Ingen kode henter
  `companies` med en embedded child-tabel.
- **`companies.status` har ingen CHECK**, og default `'active'` gør
  enhver ny (ubetalt) virksomhed «aktiv» fire steder. `is_membership_active`
  er fail-open på `contract_end_date IS NULL`.
- **Stripe:** `tax_behavior`/`interval` kan ikke ændres på en pris;
  `lookup_key` frem for price-id; `subscription_data[cancel_at]` findes
  ikke i Checkout; Checkout-sessioner lever 24 timer uanset databasen
  (nu 30 min); `enabled_events` på et webhook-endpoint ERSTATTER listen;
  delvis kundekopi kræver CSV uden overskrift.
- **CVR's branchekode er DB25, ikke DB07** (siden 1/1 2025; 738 koder på
  87 afdelinger, dansk underopdeling af NACE rev. 2.1). Designdokument
  og opgave blev skrevet mod DB07 fra hukommelsen; stikprøver mod
  cvrapi.dk 3/9 (`478100`, `953190`) fandt koder der kun findes i DB25,
  og DB07's afdeling 45 (biler) er nedlagt. Virksomheder slået op før
  2025 bærer stadig DB07-koder i `raw_cvr_data`. Et offentligt register
  kan være skiftet ud uden spor i repoet — slå op.
- **`invoice.created` må IKKE tilmeldes webhook-endpointet.** Stripe
  udsætter finaliseringen af fakturaer i op til 72 timer, hvis webhooken
  ikke svarer på det event — og det gælder ALLE kontoens fakturaer, ikke
  kun vores. Endpointet har seks events (3/9 eftermiddag):
  checkout.session.completed, customer.subscription.created/updated/
  deleted, invoice.paid, invoice.payment_failed.
- **En kreditnota på en betalt faktura skal være «Credit outside of
  Stripe»**, ikke kundesaldo — ellers efterlader den et tilgodehavende på
  kunden, som næste faktura modregner. Set 3/9 ved oprydningen af
  FLOOR1's testfaktura.
- **`application_context.raw_cvr_data` er IKKE hele cvrapi-svaret.**
  `hentCvrData` plukker felter ud, og kun dem gemmes. Skal et nyt felt
  bruges (som adressen 3/9), skal det læses ind dér — og feltnavnet
  måles mod cvrapi.dk, ikke huskes (`address`, `zipcode`, `city`).
- **`net.http_post` har 5 sekunders timeout som standard — og når
  klienten lukker forbindelsen, AFBRYDES edge-funktionen.** De to første
  berigelseskørsler 3/9 nåede kun fem CVR-opslag hver, alfabetisk fra A
  og frem; funktionen kørte ikke videre serverside, som man kunne tro.
  Løsningen er `timeout_milliseconds := 150000` på kaldet. Gælder
  ethvert langvarigt edge-kald fra SQL editoren.
- **Byg engangsjobs idempotent (udfyld kun tomt).** Det var dét, der
  reddede berigelsen: fire kald i træk fortsatte hvor det forrige slap,
  uden at røre det allerede satte.
- **Build-chattens «deployet ✅» er ikke et bevis; et kald er.**
  `berig-virksomheder` blev meldt deployet, men et kald gav 404
  NOT_FOUND — funktionen fandtes ikke. Efter et redeploy svarede den 401
  (auth-værnet), og så virkede den. Kald funktionen uden nøgle og se
  401, før du tror på deployet. *… og «ingen filer blev rørt» er heller ikke et bevis (15/9, DEL 2 «15. september» §11): udrulningsprompten til `onboarding-rytme` gav to commits på main med +3 linjer i `types.ts`, mens build-chatten svarede ordret at intet var rørt. Læs `git pull`-outputtet efter en build-chat-opgave — det er dér ændringen står.*
- **SQL editoren NÅR `auth`-skemaet.** Bevist 3/9: `DELETE FROM
  auth.users` virkede (efter `notifications` og `user_login_log`;
  `profiles` og `user_roles` fulgte i kaskaden). Det er vejen til en
  forældreløs bruger, når `admin-cleanup-test-data` ikke kan bruges —
  den funktion autentificerer en BRUGER (`getClaims` → `has_role`
  admin), ikke service-rollen, så vault-nøglen giver 401/403, og
  cron-mønstret med `net.http_post` virker IKKE på den. Vejen til
  `hardDeleteCompany` er /members' slet-dialog (`manage-advisor`
  `delete-company`), som ikke har dry-run — mål før.
- **Storage ryddes ALDRIG af koden.** `hardDeleteCompany` og ingen
  edge function kalder `storage.remove()`. Slet filerne FØR
  virksomheden, mens stien (`company_id`) er kendt, og gør det i
  Lovables Storage-flade — direkte `DELETE` på `storage.objects`
  blokeres af platformens `protect_delete`-trigger.
- **`profiles` er nøglet på `user_id`, ikke `id`.**
- **To betydninger af «sendt»:** `betalingsmail_sendt_at` betyder
  enqueued; `email_send_log.status = 'sent'` betyder leveret til Lovable.
  DLQ (TTL 60 min, fem forsøg) efterlader stemplet sat.
- **En tom edge function-log er et svar.** Er loggen tom, blev
  funktionen aldrig kaldt, og fejlen ligger i fladen — ikke i
  funktionen. Opslagsmailen 3/9 kl. 14:30: nul notifikationer, tom log
  for `notify-community-opslag`; koden var rigtig, browseren kørte den
  gamle CommunityView.
- **Et Update-klik er ikke nok, hvis browseren har gammel kode.** Hard
  reload FØR du beviser noget i frontenden — ellers beviser du det gamle.
  Andet forsøg efter reload: 27 notifikationer.
- **`git diff` lyver om merged grene — GitHub squasher.** Hverken
  `origin/main..gren`, `origin/main...gren` eller `git branch -d` kan
  se at arbejdet er inde under et andet commit-id. Spørg `gh pr list
  --state merged`. Og læs diff-retningen: «sletter 3267 linjer» betyder
  at grenen er ÆLDRE end `main`, ikke at den fjerner noget (3/9, to
  fejlslutninger). (DEL 1, «Git og Claude Code»)
- **Claude Code oprettede sin egen gren pr. opgave.** Fire forældreløse
  grene 3/9 eftermiddag, som ikke bar noget `main` manglede. Afgjort
  3/9: den opretter ikke grene; chatten dikterer grenen ved commit
  (DEL 0).
- **Kør HELE migrationsfilen i SQL editoren, ikke et uddrag.** 3/9 gav
  Claude en afkortet udgave af `20260903150000_company_traek.sql`;
  første kørsel tog kun `CREATE TABLE`, og RLS, policies og kommentar
  kom først da filen blev kørt i sin helhed. En tabel uden RLS er åben.
- **To Claude Code-vinduer må ikke skrive samtidig — heller ikke når
  den ene er dokumentation.** `git add -A` blander dem. Sker det
  alligevel: `git reset` det staged, og `git add` med navngivne stier.
  (3/9: en bogføring startet mens en kodeændring kørte; gik godt kun
  fordi den ikke nåede at skrive.)
- **En dom på `subscription_status` findes FEM steder, ikke tre.**
  `computeMembershipTier` i to TypeScript-kopier, `is_membership_active`
  (SQL, fail-open), `har_aktivt_medlemskab` (SQL, læser kun
  `contract_end_date`) og `har_aktivt_abonnement` (SQL, læser kun
  abonnementet). De to sidste er ikke dækket af nogen paritetstest, så
  en tier-ændring der kun rettes i de tre kendte spejle efterlader
  indholdsadgangen (community, indhold, events, storage) på den gamle
  dom. Målt 3/9 aften; `docs/adgangsdomme.md` §1.
- **Secrets kan IKKE læses i Lovable.** Målt 3/9 aften: værdierne er
  skjulte i fladen. Enhver måling der kræver at kende en secret (hvilken
  Calendly-konto `CALENDLY_API_KEY` tilhører, om `RAADGIVER_MAIL_TIL` er
  sat), skal gå gennem noget der BRUGER den — et kald, en log, et
  resultat — ikke gennem at kigge på den.
- **En gren bygget på `main` FØR en PR merges giver konflikt bagefter,
  fordi GitHub squasher:** samme indhold får to commit-id'er. Målt 3/9
  (#585, lukket uden merge som dublet). Vejen ud er ikke at flette, men
  at bygge grenen om med `cherry-pick` oven på en frisk `main`. Og:
  `git push origin --delete <gren>` fejler når GitHub allerede har
  slettet fjerngrenen ved merge — brug `;` og ikke `&&` mellem
  sletningerne, så den lokale sletning kører alligevel.
- **Policies kan opstå uden om repoet.** De fire demo-policies og
  kolonnen `companies.is_demo` stod ALDRIG i en migration — de blev
  lavet direkte i Lovable (grep på «Hide demo» og «is_demo» i
  `supabase/migrations/` 3/9: nul træffere). En gennemgang af
  migrationsfilerne kan derfor ikke svare på hvad RLS tillader.
  `pg_policies` i prod er den eneste kilde.
- **Dokumentationen kan være forkert om sikkerhed.** CLAUDE.md og
  SECURITY_BASELINE.md påstod begge at alle policies i `public` er
  RESTRICTIVE og stakker med AND. Målt 3/9: 0 restriktive ud af 268.
  Det er sandsynligvis derfor fejlen overlevede — den der læste
  dokumentet og tilføjede en «hide»-policy troede den strammede. Begge
  dokumenter er rettet (#591). Reglen: en policy der skal NÆGTE noget
  («hide», «skjul», «kun») er forkert hvis den er permissive.
- **En RLS-ændring skal bevises med en lånt identitet.** Måden er:
  `set_config('request.jwt.claims', json_build_object('sub', <uuid>)::text, true)`
  + `set local role authenticated`, derefter tælle hvad brugeren kan se
  mod hvad brugeren ejer, i ét resultatsæt (`UNION ALL`, SQL editoren
  eksporterer kun det sidste). Kør den som BÅDE et medlem og en
  rådgiver — ellers opdages det først i drift, hvis rettelsen lukkede
  for meget. Migration `20260903230000_demo_policies_restrictive.sql`
  bærer målingens tal og `pg_policies`-verifikationen; selve
  lånt-identitets-SQL'en står IKKE i repoet (kørt i SQL editoren 3/9) og
  skal skrives igen efter opskriften her.
- **To kendte, åbne sikkerhedspunkter med lavere alvor** (bogført i
  `supabase/SECURITY_BASELINE.md` §5, 3/9 sen aften, ikke rettet):
  (1) `messages` DELETE har ingen tidsgrænse overhovedet, og to
  overlappende policies ligger der («Members can delete own messages»
  og «Users can delete own messages», sidstnævnte bredest med
  `sender_id OR advisor`) — ingen indskrænkning tabes, men dubletten
  står. (2) Storage-policyen «Authenticated users can upload feedback
  screenshots» har `WITH CHECK` på `bucket_id` alene uden mappetjek, så
  enhver authenticated kan skrive til enhver sti i den bucket; læsning
  er ejermappe eller advisor. `chat-attachments` blev lukket 6/8 og
  mangler det IKKE.
- **Grenfælden — målt tre gange 3/9** (#585→#586, #590→#591,
  #596→#597). Mønsteret: en ny gren laves fra den FORRIGE gren i stedet
  for fra `main`, fordi man går videre uden at skifte tilbage. Når den
  forrige PR så merges, squasher GitHub den, og samme indhold får to
  commit-id'er → konflikt, og PR'en bærer en fremmed commit. Kendetegn:
  pushen sender uventet mange objekter (38–41 KB mod 3–5 KB for samme
  ændring). Vejen ud er `cherry-pick` oven på en frisk `main`, ikke at
  flette. **REGLEN:** enhver ny gren startes med
  `git checkout main && git pull && git checkout -b <gren>` — aldrig
  `git checkout -b` alene.
- **Grenfælden ramte to gange mere 4/9** (#606→#607, og #605, der
  krævede stash-dansen for at komme fri). Reglen fra i går blev brudt
  igen af samme grund som før: man går videre fra den gren man står
  på, i stedet for at skifte tilbage til `main` først. Kendetegnet er
  stadig pushens størrelse — 54 KB mod 10 KB for samme ændring. Ser du
  et stort push-tal på en lille ændring, så stop og tjek `git log
  --oneline main..HEAD` FØR du åbner PR'en.
- **`git add` fjerner IKKE det et andet vindue allerede har staget.**
  Målt 4/9: `git add <to filer>` gav en commit med TRE, fordi
  `CompanyChatPane` lå staget fra vindue 2's diff-linje (`git add -A`).
  Indekset er delt mellem vinduerne; det der ligger der, følger med i
  næste commit uanset hvem der kører den. Vejen ud er `git restore
  --staged <fil>` FØR commit — og diff-linjen i prompterne, der navngiver
  sine egne filer (`git add <fil1> <fil2> && git diff --cached -- <fil1>
  <fil2>`) i stedet for `git add -A`. Tjek `git status --short` for
  `M ` (staget, første kolonne) før hver commit.
- **En rolle der aldrig blev sat, gør et værn tandløst uden at nogen
  opdager det.** Owner-værnet (#608) afviser `remove-member` når målet
  er owner — og var bevist på skærm. Målt i prod samme formiddag (4/9
  kl. 10:14): ni aktive virksomheder havde ingen owner, kun ét medlem
  med rollen `member`, så værnet dækkede dem ikke, og deres eneste
  bruger kunne slettes uden fortryd. Kode-testen var grøn, fordi den
  tester dommen, ikke data. Lærdommen: **når et værn dømmer på en
  kolonne, så MÅL kolonnens fordeling i prod før værnet erklæres for
  dækkende** (`SELECT role, count(*) … GROUP BY 1`, og «findes der rækker
  uden den værdi værnet leder efter?»). Rettelsen var data, ikke kode
  (DEL 3) — og samme formiddag blev det målt hvor rollen skrives:
  hullet lå i `handle_new_user`, og det er lukket (#622, DEL 3).
- **`gh` kan fejle med «error connecting to api.github.com» selv når
  GitHub melder alt operationelt og `git push` netop er lykkedes — i
  SAMME kommando.** Ramte fire gange 4/9. **Målt: det er DNS hos
  udbyderen der falder ud i korte perioder** — `ping github.com` gav
  «cannot resolve», mens `ping 1.1.1.1` virkede. Pushen var allerede
  igennem (forbindelsen stod), API-kaldet slog navnet op igen og fik
  intet svar. Vejen ud er at prøve igen; virker det ikke, opret PR'en i
  browseren fra den pushede gren — koden ER oppe, det er kun
  PR-oprettelsen der mangler. Tjek ikke GitHubs status først; den siger
  intet om udbyderens DNS.
- **`git checkout main` afvises af ustagede filer — og `;` i kæden
  gemmer fejlen.** I en `&&`-kæde stopper det hele når checkout
  afvises; står der `;` løber kæden videre og laver den nye gren det
  forkerte sted (oven på den gren man stod på — grenfælden igen). Ramte
  igen 4/9. **REGLEN:** `git stash` FØRST når der er ustaget arbejde,
  og `&&` hele vejen — aldrig `;` mellem checkout og `checkout -b`.
- **Build-chatten opgav en gren og en commit der ikke fandtes** (6/9:
  `edit/edt-2b6e495d…`, `0cfda05c`). Substansen blev pushet direkte til
  `main` under «Changes» og «Work in progress». Verificér ALTID med
  `git fetch` + `git log`, og læs HVAD commit'en rørte — ikke kun at det
  den lovede er der: «Work in progress» (`2cd553e2`) regenererede hele
  `types.ts` og gav elleve typefejl, som ingen bad om (DEL 1).
- **Lovable kan regenerere `types.ts` med en anden generatorversion.**
  Felter der var krævede bliver valgfri, og husets håndskrevne
  interfaces knækker uden at nogen fil vi rørte er nævnt i fejlen. Tjek
  `git show --stat` på et Lovable-commit før du tror at en typefejl er
  din (6/9, DEL 1).
- **CI VAR grøn uden typecheck til 7/9** (#668 blev merget med 15
  typefejl, 6/9). Fra #676 kører `test.yml` tsc FØR testene, og nul
  betyder nul. Kør stadig `bunx tsc --noEmit -p tsconfig.app.json` FØR
  diff-filen — CI er sidste værn, ikke første — og husk `-p`: uden den
  checkes nul filer, og kommandoen er grøn uanset hvad.
- **`git checkout -b` bærer uncommitted arbejde med — også det andet
  vindues.** 7/9: vindue 2 havde en typerettelse staged på `main`;
  vindue 1 lavede gren og committede sin migration med navngiven `git
  add`, og typerettelsen fulgte med, fordi den allerede lå i indekset
  (#673 → splittet i #674 og #675). Navngiven `git add` beskytter mod at
  committe forkerte filer, IKKE mod at bære dem med over. **REGLEN:**
  `git status --short` FØR `git checkout -b`, når to vinduer kører
  (DEL 1 «Git»).
- **Et godkendt agentforslag skriver INDEVÆRENDE uges nøgle, ikke
  forslagets.** `skrivUgensFokus` upserter på `getISOWeekKey(new
  Date())` (`_shared/agentSkriveveje.ts:34`). Otte forslag fra 25/8 lå
  uafgjorte 6/9; godkendes ét i dag, ser medlemmet «ugens fokus» for
  denne uge, regnet på augusts tal. *Lukket 7/9 (#688): et forslag kan
  kun godkendes i sin egen ISO-uge — netop fordi nøglen er
  godkendelsens. Fælden står som historik; regnestykket bag den er
  uændret.*
- **`getISOWeekKey` læser LOKALE datokomponenter — Deno kører UTC,
  browseren i brugerens zone.** Tæt på midnat søndag/mandag kan de to
  være uenige om ugen med op til to timer (dansk tid er UTC+1/+2). Det
  er arvet fra `week.ts`/`isoUge.ts`, ikke indført af udløbsdommen
  (#688). Afgørelsen i Deno (`agent-forslag-afgoer`) er den bindende;
  fladen kan i det vindue vise knapper som serveren afviser med 409 —
  eller omvendt. Ikke set; udledt af koden (DEL 2 «Agentkæden»).
- **En test der importerer et datalags-modul, vælter suiten uden at
  fejle en test.** `akademiApi` importerer Supabase-klienten på
  modulniveau; den starter en auto-refresh-timer der kaster
  `storage.getItem is not a function` i jsdom som «Unhandled Error» —
  alle tests grønne, exit 1 (6/9, #670). Mock klienten med `vi.mock`
  som `handoutEngineWritePaths.test.ts`, og læs exit-koden, ikke kun
  tælleren.
- **`scrollIntoView` ruller ALLE scrollbare forfædre — i en flade med to
  scroll-containere flytter den hele siden.** Målt 4/9 (#639): chatten
  kaldte `scrollIntoView` på den sidste besked ved hver ændring i
  `messages`. På `/chat` er der én container, så det så rigtigt ud; på
  virksomhedssiden er der TO (beskedlisten og Hb-skallens
  indholdskolonne), og blok 4 ligger midt i kolonnen — så hele siden
  rullede ned ved første indlæsning, hver realtime-besked, pin,
  redigering og sletning. Billederne var ikke årsagen (alle `<img>`
  har wrappere med fast højde). **Brug `scrollTop` på den container der
  skal rulle** — den kan per definition ikke røre forfædrene. Og drop
  `smooth` under indlæsning: en glidende rulning kæmper mod en liste der
  stadig vokser.
- **`decided_at IS NULL` betyder ikke «venter».** En `expired`-række på
  `agent_proposals` har også tom `decided_at` (constrainten kræver den
  ikke), og fladen viser ingen knapper for den. Puklen talte fire døde
  session_prep-forslag som ventende (#682, 7/9). Døm «venter» på
  `status = 'proposed'`, aldrig på fraværet af en afgørelse — og lås
  filtret med et driftværn der læser kildeteksten (DEL 2 «Agentkæden»).
- **Abonnementets `cancel_at` måler ikke adgang — det er
  betalingsplanen.** `contract_end_date` bærer adgangen alene; et
  fornyelsesabonnement rører aldrig `subscription_status`
  (fornyelseskæden §11). De to ure SKAL være forskellige: `cancel_at` =
  start + 12 måneder − 1 dag ligger efter sidste aftalte træk og før det
  næste, uanset hvad kontrakten siger. Regn dem aldrig sammen: med
  `cancel_at = periode_slut − 1 dag` ville en der betalte 12 rater fra
  8/9 få et TRETTENDE træk 8/9 året efter — jeg foreslog præcis det 7/9
  og tog fejl (DEL 2 «Fornyelseskæden», rettelsen; fornyelseskæden §7).
  For en der betaler tidligt, ophører abonnementet derfor nogle uger FØR
  kontrakten udløber. Det er rigtigt. Ret det ikke.
- **`<html class="dark">` er permanent, og `.theme-hjemmebane` overstyrer
  IKKE shadcn-tokens.** En rå shadcn-komponent i en Hb-flade får
  mørke-temaets baggrunde (9 %) og arver Hb-skallens tekstfarve
  (`text-hb-ink`, 12 %) — mørkt på mørkt. «Tegner i appens gamle tokens»
  var ikke sandt for de fem bogførte paneler; de tegnede i en hybrid
  (#685, 7/9). Konvertér, eller sæt tekstfarven eksplicit på roden — og
  sæt ikke baggrunden med, før du har set panelet på skærm: det var
  lyst, ikke mørkt (DEL 2 «Mørke tokens på lyst papir»).
- **`UPDATE 0` seks dage i træk er ikke en død cron.** `opgave-udloeb`
  (04:00) så ud til at overse 31 udløbne forslag; de udløb alle kl. 06:00
  samme dag — mandagens `ai_weekly`-forslag født kl. 06:00 med 14 dages
  levetid. Et `ai_weekly`-forslag lever derfor 14 dage PLUS 20 timer.
  Læs `cron.job.command` og forslagenes `expires_at` før du kalder en
  cron død (7/9, DEL 2 «Opgave-modellen»).
- **«Fristen var …» er en tekst, ikke en tilstand.** En aktiv opgave med
  passeret `due_date` er «forfalden» i motoren (`erForfalden`), men ingen
  cron, status eller kolonne bogfører det, og den udløber aldrig — den
  står til medlemmet trykker. Forveksl den ikke med «udløbet», som kun
  gælder `proposed` via `expires_at` (DEL 2 «Opgave-modellen»).
- **Slutdatoen var EKSKLUSIV i koden og INKLUSIV i sproget.** Adgangen
  lukkede ved UTC-midnat natten FØR `contract_end_date`, mens mails og
  bånd sagde «slutter i dag». Og adgang dømmes FEM steder: retter man kun
  TypeScript-laget, får medlemmet en ÅBEN skal med LUKKET community
  (`har_aktivt_medlemskab` gater 14 policies + storage). Kode og SQL
  flyttes i samme time, og målingen tages FØR og EFTER på den virksomhed
  grænsen rammer (7/9, #698, #699 — DEL 2 «Slutdatoen»).
- **En liste der siger «ingen … endnu» kan være ØDELAGT.** Sendt-loggen
  sagde «Ingen afsendelser endnu» i et halvt år over 1.664 rækker, fordi
  kaldet fejlede (400) og komponenten aldrig læste `isError`. Tom og
  fejlet SKAL se forskellige ud på skærmen — ellers savner ingen den
  (7/9, #701).
- **Policies følger tabellen ved omdøbning — ikke navnet.** `ALTER TABLE
  … RENAME` tog `email_send_log`s advisor-policy med over på
  `email_send_log_legacy`, og den nye tabel med samme navn fik kun
  service-role. Tre ting forsvandt ved samme omdøbning: `sent_at`,
  `template_id` og advisor-læsningen — fundet et halvt år senere, hver
  for sig. Ved omdøbning: læs `pg_policies` for BEGGE navne bagefter
  (7/9, DEL 2 «De tavse fejl»).
- **`res.data || []` og `const { data } = await supabase…` gør en fejl
  til et tomt svar.** TanStack ser en succes, `isError` er falsk, og
  «Der er ikke noget der haster i dag» kan betyde at `company_fornyelse`
  ikke kunne hentes. 115 af 139 queryFn'er står sådan. Læs `error`, kast
  med kildens navn (`kraevRaekker`), og lad fladen skelne (7/9, #703 —
  DEL 2 «De tavse fejl»).
- **«Om en uge» er ikke en emnelinje for dag 0.** Varsel 2 sendes ved 7
  dage ELLER FÆRRE, og den sene beslutning kan give det på dag 0. Ingen
  enhedstest fangede det; det blev set ved at læse den mail der faktisk
  ville gå ud, mod en rigtig række i tørkørslen. Tørkør ALTID mod rigtige
  data og læs teksten som modtageren (7/9, #697).
- **EN NY TING SKAL SPØRGE DE EKSISTERENDE HVAD DE SIGER.** Tre gange
  7/9 ramte samme klasse: (1) forsidens dom sagde «Send tilbuddet til X»
  efter systemet HAVDE sendt det (#696); (2) virksomhedssidens badge
  sagde «Klar til tilbud» efter varslet var gået (#704); (3)
  varselsmotoren sendte til en der ikke kunne betale — CARMA STUDIO,
  varsel 2 kl. 11:57 med en knap der ikke virkede (#716). Hver gang blev
  den nye ting reconnet grundigt — og forbindelsen til det den PÅVIRKER
  blev aldrig undersøgt, fordi den lå uden for det der blev bygget.
  REGLEN: bygger vi noget der fører et menneske videre — en mail med et
  link, en knap, et bånd — skal reconen svare på «hvad møder de i den
  anden ende, og siger den ja?». Ikke som en tilføjelse; som en del af
  recon. Konkret: find gaten i den anden ende (tilbud, checkout, bånd,
  badge) og kald den med den SAMME række, før noget sendes (7/9, DEL 2
  «Fornyelseskæden — CARMA-sagen»).
- **MEDLEMMERNE NAVIGERER FORSKELLIGT — TÆNK DET IND HVER GANG.** Jonas
  8/9, ordret: «Vi er nødt til altid at have for øje, at når man har så
  mange medlemmer, navigerer de forskelligt. Nogle ser videoer, nogle
  laver rapportering, nogle chatter vi med, nogle bruger overhovedet ikke
  tingene. Og det skal tænkes ind hver eneste gang vi bygger noget.»
  DET KONKRETE EKSEMPEL: ugens fokus. Bygget til en der arbejder med
  platformen — rapporterer, sætter milepæle, udfylder handouts — og fyrer
  HÅRDEST på dem der ikke gør: tre af ni triggers er stilstand (milepæl
  uden bevægelse i 30 dage, ingen rapport i 60, handout ubesvaret i 30),
  virksomhedsvalget var ét flag (`weekly_focus_enabled`, default true),
  og ingen skriver læste svarene. Målt 8/9: Rallysupport og ANLA GLAS,
  begge faldet ud, fik seks forslag hver; tolv virksomheder havde 61
  ventende, 97 forslag i alt gav 10 gjorte. Maskinen sagde mest til dem
  der lyttede mindst — og for dem var det ikke et nudge, det var støj
  til en de allerede havde forladt. Jonas: «Maskinen skal selvfølgelig
  ikke foreslå noget, hvis der ikke er noget at foreslå på.» REGLEN, når
  noget bygges der HENVENDER sig til et medlem (mail, forslag, fokus,
  påmindelse, digest): spørg FØR det sendes (1) er medlemmet der — tier,
  status (husets dom, `computeMembershipTier`, samme regel som
  `run-weekly-agent` havde); (2) bruger de den del af platformen det
  handler om — en der aldrig har rapporteret skal ikke nudges om tal, en
  der aldrig har åbnet et handout skal ikke høre om løftestænger; (3)
  ligger der allerede noget ubesvaret fra os — så er svaret ikke mere.
  Bygget 8/9 aften i `generate-weekly-focus` (`ugensFokusGate.ts`: tier
  og status som gate, ingen nye forslag mens ét ligger ubesvaret) og de
  tabte forslag gjort synlige på virksomhedssiden («N forslag udløb uden
  svar»). Det der IKKE er gjort: (2) — triggerne fyrer stadig på
  stilstand for dem der er der, og om det er rigtigt for en der aldrig
  rapporterer, er en beslutning (mangellisten «Agenten laver seks forslag
  om ugen som ingen svarer på»).
- **Ét felt, fire skriveveje — spørg dem alle, og spørg DATA.** Fortegnet
  på omkostninger stod som «årsrapport-vejens» fejl (kort #38, 27/8),
  vejen blev rettet samme dag, og sagen lå. Målt i prod 7/9: den manuelle
  vej skrev stadig negativt (16 af 67), og en tredje vej
  (`save-annual-baseline`) gjorde det også. Én kode-rettelse retter ikke
  rækkerne, og én vej er sjældent den eneste. Når et felt kan skrives
  fra flere steder: tæl pr. `source_type` i prod FØR og EFTER, og lås
  alle vejene med ét værn (7/9, #721 — DEL 2 «Omkostningernes fortegn»).
- **Et rigtigt fortegn er ikke et rigtigt tal — og en genkendt fejl er
  ikke en læst fejl.** Da fortegnet var vendt, stod Floren Engros'
  2025-omkostninger som 4.335 om måneden mod 248.112 året før. Stikprøven
  afslørede fejlen, men den FØRSTE diagnose var forkert: «hundrede gange
  for lille» var et mønster jeg genkendte (tusindtalsfejl), og jeg skrev
  «alle nøgletal for 2025» ud fra det. Sandheden var en ANDEN LINJE i
  samme rapport — udtrækket havde taget «Direkte omkostninger» 52.018 og
  tabt «Vareforbrug» 3.155.034; totalerne var rigtige hele tiden. Læs
  KILDEN, ikke kun tallet — og skriv først konklusionen når kilden er
  læst. En datarettelse der kun rører det den er sat til, afslører det
  næste lag; det næste lag skal også læses før det får en overskrift
  (7/9, #722 rettet samme aften — DEL 2 «Omkostningernes fortegn»).
  **Og en rimelighedstest ser kun det der findes.** Testen (vareforbrug
  som andel af omsætning) fandt Floren, men kunne kun prøve FIRE af
  elleve rapporter — fordi en MANGLENDE post er usynlig for en test der
  regner en andel. Et felt der ikke findes, har ingen andel; det giver
  ingen alarm, det giver ingenting. Testen skal derfor stilles som TO
  spørgsmål: er tallet sandsynligt, OG findes tallet overhovedet. Det
  andet spørgsmål fandt ni af elleve (7/9 kl. 20:24, DEL 2
  «Årsrapport-udtrækket»).
- **ET FILTER ER EN DEL AF MÅLINGEN.** «29 af 37 er faldet ud» blev
  skrevet som dagens vigtigste tal 7/9 kl. 20:42 og stod øverst i denne
  overlevering i tolv timer, før nogen spurgte om de tidligere medlemmer
  var talt med. Det var de: filtret var `er_kunde = true AND is_legat =
  false` og manglede `status = 'active'`, så de otte `'tidligere'` fra
  2/9 stod som medlemmer — og to gæster (Alexander Lund, Martin Larsen)
  stod som kunder, fordi ingen havde sat `er_kunde` på dem. Rettet 8/9
  kl. 08:48-08:49: `er_kunde = false` på de to, og målingen kørt igen med
  tre led: 19 af 27, ikke 29 af 37. Konklusionen holdt (samme otte
  aktive, samme to der svarer); tallet gjorde ikke. REGLEN: når en
  måling tæller mennesker eller virksomheder, skal filtret stå ORDRET i
  bogføringen — ikke som «blandt kunder» eller «ikke legat», men som den
  præcise where-sætning (`WHERE er_kunde = true AND is_legat = false AND
  status = 'active'`). Ellers kan ingen se hvad der er talt med, og
  ingen kan gentage målingen og få et sammenligneligt tal. Og
  bogføringen selv bar advarslen: DEL 2 «Platformen i tal» skelnede
  allerede «30 aktive» fra «38 rækker inkl. de otte tidligere» (3/9) —
  målingen 7/9 læste den ikke (8/9, øverst «Rettelsen»).

- **En knap der skriver en kolonne ingen læser, er et løfte uden
  modtager.** «Ja, slet min data» skrev `offboarding_requested_at` og
  sagde «Jonas kontakter dig inden for 2 hverdage». Ingen hørte det i
  103 dage (Alina, 2/6 → 8/9). Når en flade lover en handling, så find
  den der udfører handlingen FØR knappen bygges — grep efter kolonnen:
  én skriver og nul læsere er alarmen (DEL 2 «Alina-sagen»).
- **Kaskaden fra `auth.users` tager ikke alt.** `user_login_log` (med
  IP), `handouts`, `pulse_checkins`, `conversation_last_seen`,
  `notifications`, `feedback`, `kpi_*`, `budget_targets`, `milestones`
  har `user_id` uden FK og bliver stående når kontoen slettes. En
  sletning der stopper ved `auth.admin.deleteUser` efterlader
  IP-historik efter en sletteanmodning. List HVER tabel med `user_id`
  og `company_id` fra `information_schema` og mål én for én, før og
  efter (8/9, Alina: 198 loginposter stod tilbage).
- **`hardDeleteCompany` sletter vores eget bilag.** Den ender med
  `companies`-rækken, og `company_perioder`, `company_traek` og
  `company_betalingslink` er `ON DELETE CASCADE` mod den. Brug den
  aldrig på en virksomhed der har betalt — og aldrig uden at vide om
  den har (SELECT på de tre tabeller + `stripe_customer_id` først).
  Arkivsporet (navn, CVR, kontraktperiode, status,
  `offboarding_requested_at`) skal blive stående som bevis på at
  anmodningen blev efterkommet (8/9).
- **En sletning i hånden tager en formiddag — og skal gøres én gang.**
  Rækkefølgen, tabellerne og kontrollerne fra Alinas sletning
  (`~/Downloads/recon-alinas-sletning.md`) er specifikationen for
  slettefunktionen. Gentag ikke formiddagen; byg den — bygget (#734) og i
  drift 8/9 kl. 12:01 (DEL 2 «Slettefunktionen»).
- **html2canvas genimplementerer CSS selv — og kender ikke alt.** 1.4.1
  kender ikke `object-fit` (ordet findes ikke i pakken) og tegner
  `drawImage(hele billedet → hele boksen)`: logokortet var rigtigt på
  skærmen og strakt i PNG'en (14/9 17:20); portrættet var ramt på samme
  måde, skjult af kvadratiske rådgiverbilleder. Det den honorerer er
  `border-radius` og `overflow: hidden` — derfor regnes cover/contain i px
  (`billedTilpasning.ts`), og rammen klipper. Reglen: en rettelse der
  virker på skærmen, kan være forkert i filen — og omvendt. BEGGE skal ses
  (skærm + hentet fil), hver gang kreativen ændres. (DEL 2 «14.
  september» §34)
- **Et fuldsides-skærmbillede af en fixed-overlejring er ikke et bevis.**
  Tre gange 14/9 (15:08, 15:29, 15:56) så kreativen ud til at flyde ud
  over fuldskærmens kant. #869 målte pixels: en tom rektangel i kreativens
  farve UNDER dialogens boks (boksen slutter i y=1198, billedet er 1357 px).
  Værktøjet var GoFullPage, som syr hele siden sammen, mens en
  `position: fixed`-overlejring kun dækker viewporten — de to regner med
  hver sit viewport. Et almindeligt skærmbillede (Cmd+Shift+4) 16:10 viste
  ingen flade. Reglen: en overlejring bevises med et viewport-skærmbillede,
  aldrig med et fuldsides. (DEL 2 «14. september» §30)
- **To vinduer, ét git-index: `git commit` tager hele indekset med.** #870
  (`a5dd8213`) bærer `kreativEksport.ts` og dens test fra det andet vindue,
  fordi begge vinduer skriver i samme arbejdstræ og samme index — det ene
  vindues `git add -A` stagede det andets filer, og commit'en tog dem med.
  Ingen kode manglede, men commit-beskeden er upræcis. Reglen: ALDRIG
  `git add -A` med to vinduer; stage kun egne filer med eksplicitte stier,
  og skriv diffen med `git diff -- <stier>` (plus `--no-index` for nye
  filer), ikke `git diff` alene. (DEL 2 «14. september» §31)
- **Samme sti giver samme URL, og browseren spørger aldrig igen.** Et
  billede uploadet med `upsert: true` på en fast sti får den samme
  `getPublicUrl`-streng som før; browseren har den i cache
  (`cache-control: max-age=3600`, storage-js' standard, målt på fire
  objekter), så det nye billede ses først en time senere — eller aldrig i
  den session. `?t=` i komponent-state skjulte det ét sted og gav en ny
  URL ved hvert render. Reglen: versionen ligger i den GEMTE URL
  (`billedVersion.ts`), ikke i cache-headere og ikke i state. (DEL 2 «14.
  september» §33)
- **En gate der lukker ligner ikke en fejl: 200 og nul timeouts kan være
  nul mails.** 14/9 kl. 17:38 UTC havde køen ikke sendt i 216 minutter;
  vagten så 200 på hvert kald, nul fejl, nul timeouts — funktionen kørte
  og valgte at sende intet, fordi dagskvoten talte `failed`-rækker som
  modtagne mails (fem adresser spærret efter tre). Vagten måler svar, ikke
  virkning. Reglen: en kø bevises af `email_send_log` (status `sent` inden
  for den sidste time), aldrig af funktionens statuskode; og en tæller der
  skal undtage fejl, skal tælle succeser (`sent`), ikke opremse
  fejlstatusser — #857 undtog én, og den næste status åd kvoten igen (#882).
  (DEL 2 «14. september» §37)
- **Der findes et afsendelsesvindue 07–20 dansk, og det står kun i koden.**
  `SEND_WINDOW_START_HOUR = 7`, `SEND_WINDOW_END_HOUR = 20`
  (`_shared/notificationEmailSelection.ts:139-141`): udskudte kandidater
  (> 6 timer, holdt tilbage af kvoten) og ALLE handlingsudløste typer
  (`EMAIL_DELAY_MINUTES_BY_TYPE`, fx eventmails) sendes kun i vinduet;
  friske default-mails går døgnet rundt. Opdaget 14/9 19:49 UTC i
  tørkørslens log: fem eventmails «[venter] uden for vinduet 07–20». Reglen:
  en aftenmåling af «usendte» eller en «stille» kø efter kl. 20 dansk skal
  først trækkes for vinduets ventende (`venter_paa_vindue` i funktionens
  svar), før den kaldes en fejl — og regn aldrig på «hvad går ud nu» uden
  vinduet. (DEL 2 «14. september» fund 18)
- **En CSV-kolonne kan droppes tavst af et værktøj — læs den validerede
  fil, ikke den du sendte.** Stripes Billing Migration Toolkit (14/9)
  kender ikke `cancel_at`, kun `cancel_at_period_end`; første forsøg havde
  kolonnen med, valideringen sagde intet, og kolonnen var væk i den
  validerede fil. Uden ophør havde ti abonnementer trukket for evigt.
  Reglen: efter enhver validering sammenlignes kolonnesættet i udfilen med
  indfilen, og det der mangler, sættes i hånden bagefter (som Jonas gjorde
  på alle ti). (DEL 2 «14. september» §42)
- **Et gammelt abonnements `cancel_at` er ikke antallet af træk — tæl
  fakturaerne.** Fjeldgaardshops stod til 15/5-2027 = 15 træk; hun havde
  betalt 6, så 6 var tilbage. Livjas fakturanumre sprang fra 0004 til 0008
  (fire måneders pause), så 12 træk over 15 måneder. Reglen (Jonas 14/9):
  12 træk i alt — betalte fakturaer trækkes fra 12, ophøret sættes efter
  det, og sidste træk dækker en måned frem (slut = en måned efter sidste
  træk). Datoen i Stripe er et resultat, ikke en kilde. (DEL 2 «14.
  september» §42)
- **22:00 UTC er midnat dansk — det nye abonnement trækker FØR det gamle
  samme dag. GÆLDER KUN TIL SOMMERTIDEN SLUTTER 25/10-2026.** Toolkittets
  start/end_date står kl. 22:00 UTC; de nye trækker ved midnat dansk på
  trækdagen, de gamle senere samme dag (YKRG 13:30). «Annullér inden
  næste træk» er derfor for sent på selve dagen — det gamle skal væk FØR
  trækdagen (her: før 20/9). Og rollback-vinduet vises i lokal tid i
  Dashboard (20/9 01:57 dansk = 19/9 23:57 UTC). (DEL 2 «14. september»
  §42) *RETTET 15/9: Stripe ankrer i UTC, ikke i dansk tid. Fra 25/10-2026
  er 22:00 UTC kl. 23:00 dansk, så de nye abonnementer trækker kl. 23:00
  dansk dagen FØR trækdagen — Livja 15/11 kl. 23:00, ikke 16/11; hendes
  slut 15/12 kl. 23:00 dansk. Målt i schedulernes tidsstempler. (DEL 2
  «15. september» §7)*
- **Man kan ikke slutte fra én kundes betalingsmiddel til de andres.**
  Piloten (doggybed) havde et kort gemt via Link; Launch Lab havde en ren
  `link`-pm; Livja to kopier af samme kort (kundens og abonnementets
  default kopieres hver for sig); Fjeldgaardshop både kort med
  `wallet.link` og en ren link-pm. Alle 13 kopierede rent — men det vidste
  vi først da hver enkelt var set. Reglen: «kortet kom med» bekræftes pr.
  kunde, aldrig pr. stikprøve. (DEL 2 «14. september» §41)
- **En annullering stopper opkrævningen af et abonnements åbne
  fakturaer, men lukker dem ikke — tjek åbne fakturaer FØR annullering.**
  15/9: YKRG's junifaktura `UVXL7LPI-0003` stod `open` med 0 betalt og 9
  forsøg da hendes gamle abonnement skulle annulleres. Stripes
  dokumentation: annulleringen stopper den automatiske opkrævning, men
  fakturaen forbliver åben og kan stadig betales — også efter at raten er
  sendt ad en anden vej (her e-conomic). Reglen: list abonnementets åbne
  fakturaer før annulleringen, og afgør hver (betal, void eller
  uncollectible); void hvis den er erstattet, for en voidet kan ikke
  betales, en uncollectible kan. (DEL 2 «15. september» §2)
- **Et navn er ikke en nøgle mellem platform og Stripe.** 15/9: SQL på
  `companies.name ILIKE '%launch%'` gav nul rækker — Launch Lab ApS
  (Stripe) hedder remm. i platformen. ANLA GLAS = ANLA A/S, Two Socks =
  «TS Warehuose», YKRG = «Tapas@tapasamor.dk». Og tre har en anden mail i
  platformen end i Stripe (fund 20). Slå op på id, på mail via
  `auth.users` → `company_members`, eller på kunde-id — aldrig på navnet.
  (DEL 2 «15. september» §4)
- **Et schedule der ikke er startet, har intet abonnement-objekt — og
  kan se «ikke oprettet» ud.** 15/9: YKRG så ud til at mangle på den nye
  konto; et `not_started` schedule har ingen `subscription`, og kunden
  hed efter mailen. Hun var der — under kunden, som schedule. Mål på
  `sub_sched_…` og kunde-id, ikke på abonnementslisten. (DEL 2 «15.
  september» §2)
- **LOVABLE KAN BYGGE OM UNDER OS.** 8/9 kl. 06:52-06:58: 19 commits
  direkte på main på seks minutter, alle kaldt «Changes», som slettede en
  edge function (`process-email-queue`) og en migration
  (`20260319090407_email_infra.sql` — DDL'en for fire levende tabeller),
  skrev `auth-email-hook` om og flyttede tretten afsendere. Ingen PR,
  ingen CI før det lå på main. Det blev kun fanget fordi et push på ~900
  objekter så forkert ud for en ændring på 84 linjer — ikke fordi noget
  sagde til. Konsekvensen samme formiddag: auth-guardrailen fejlede på
  main (en gate værnet ikke kendte), vores eget afsenderarbejde var
  overflødigt, og tabeller i prod har ikke længere deres definition i
  repoet. REGLEN: **efter en Lovable-opdatering køres typecheck
  (`bunx tsc --noEmit -p tsconfig.app.json`), `bun run test` OG
  `bun run check:edge-auth` på main, FØR noget bygges ovenpå** — 19
  bot-commits har aldrig været gennem en PR, og CI's gate på PR'er ser dem
  ikke. Læs `git log` og `git show --stat` på hvert «Changes»-commit; læs
  HVAD det rørte, ikke kun at det virker (DEL 1 «Git», 6/9-lærdommen om
  `types.ts`, gentaget 8/9 i større format). Og skriv fortegnelsen over
  det der forsvandt, mens det stadig kan læses i `git show <før>:<sti>`.
  **SKÆRPET 14/9 — det der forsvandt, var ikke kun DDL:** ved samme
  ombygning holdt `auth-email-hook` op med at logge. Før skrev den en
  `pending`-række i `email_send_log` med `template_name = emailType`
  (gammel `index.ts:246-251`, `b6008c51`); Lovables `createAuthEmailHandler`
  skriver intet (`dist/index.js:189-250`). Ingen så det på seks dage:
  `mailfortegnelsen.md:37-40` bogførte det samme formiddag som et
  FAKTUM («auth-mailene skriver ikke i loggen»), ikke som et skift, og
  `EmailLogView.tsx:78-83` bar stadig labels for typerne. Tredje stille
  skift fundet 14/9 (Monday-opskriften #851, `enabled_false` #852).
  Reglen udvides: læs ikke kun HVAD et «Changes»-commit rørte, men hvad
  den gamle version GJORDE som den nye ikke gør — `git show <før>:<sti>`
  linje for linje mod den nye, og hver `.insert(`/`.rpc(`/`.update(` der
  er væk, er en logning eller en skrivning der er væk. (DEL 2 «14.
  september» §29)

- **En sletning er færdig når sweepet er tomt — ikke når planen er
  kørt.** Alle otte (8/9): sweepet over `information_schema` fandt noget
  HVER gang. Hos Alina 198 loginposter, 5 handouts, pulse og last_seen;
  hos Coskun én `message_reaction` — en tabel Alina intet havde i, og
  som derfor ikke stod i planen; hos LineAlmegaard ti. Planen er skrevet
  ud fra den forrige sag; den næste sag har rækker i en tabel den forrige
  ikke havde. Kør sweepet med de slettede id'er og adresser som
  literaler, og læs det til nul (DEL 2 «De otte tidligere»).
- **Filerne ligger tre steder, ikke ét — en måling der kun kigger ét
  sted, giver et tal der ser rigtigt ud.** Den første måling af
  LineAlmegaard talte kun `financial-documents` og fandt én fil. Der var
  atten: `company-logos` (virksomheds-nøglet), `avatars` og
  `chat-attachments` (bruger-nøglede). Storage-tælleren skal gå over ALLE
  syv buckets med begge nøgler (`recon-alinas-sletning.md` §2), og
  bruger-nøglede stier skal læses FØR kontoen slettes (8/9).
- **Folk kommer tilbage efter de er holdt op.** Coskun loggede ind
  17/8, tre måneder efter slutdatoen 6/5; LineAlmegaard uploadede
  præsentationer og produktfotos 31/8, dagen før de stoppede. Indtil 8/9
  kunne en udløbet virksomhed logge ind på alle sine gamle data i
  månedsvis — udløbsgaten lukker fladen, ikke kontoen. Det er
  slettefunktionens dag 45 der lukker den nu; hvad der skal gælde
  imellem, er opbevaringspolitikkens beslutning.
- **Byg efter at medlemmerne er forskellige.** Jonas 9/9, ordret: «når
  man har så mange medlemmer, navigerer de forskelligt. Nogle ser
  videoer, nogle laver rapportering, nogle chatter vi med, nogle bruger
  overhovedet ikke tingene. Og det skal tænkes ind hver eneste gang vi
  bygger noget.» Ugens fokus var eksemplet: bygget til en der arbejder
  med platformen, og fyrede hårdest på dem der ikke gør (#749). Spørg
  ved hver flade: hvad ser den der aldrig har uploadet?
- **Dokumenter der er uenige om prod, skal måles FØR noget køres.** 11/9
  kl. 09:20: OVERLEVERING sagde KØRT, mangellisten og planen sagde IKKE
  KØRT om de samme seks migrationer. Prod havde dem alle. Var §0A blevet
  kørt som skrevet, var seks migrationer kørt oven i sig selv. Ét SELECT
  (pg_policies, pg_constraint, pg_get_functiondef, cron.job) før
  SQL-editoren — hver gang to kilder siger noget forskelligt.
- **Et job planlagt i hånden er ikke migrationsfilen.** `onboarding-rytme`
  står i prod som `kald_edge` «0 8 * * *»; filen `20260909180000` siger rå
  `net.http_post` og «15 9 * * *». Køres filen, overskriver den formentlig
  prod-jobbet med filens rå `net.http_post` og «15 9 * * *», og
  `kald_edge`s timeout forsvinder — pg_cron's dokumentation viser at
  `cron.schedule` med et navn der findes, ændrer det eksisterende job og
  beholder dets jobid. Kun hvis filen køres som en anden databasebruger
  kan navnet findes to gange — det er ikke målt. Bogfør prod i filen
  (formen fra `20260901112000`), og sæt en ADVARSEL i filhovedet indtil da
  (gjort 11/9).
- **`deno check` lokalt kræver npm-opløsning.** `managedEmail.ts:15`
  importerer `npm:@lovable.dev/email-js@0.1.0`; uden `deno install` eller
  `nodeModulesDir` standser typetjekket der, før det når filen man ville
  tjekke (11/9, stripe-webhook). Tjek det rene modul alene, og skriv i
  verifikationen at helheden IKKE blev typetjekket.
- **Et upsert uden værn kan vende en slutstatus.** `company_traek` upsertede
  «fejlet» oven på «betalt» hvis `invoice.payment_failed` kom efter
  `invoice.paid` — Stripe garanterer ikke rækkefølgen, og events leveres
  igen. Værnet er en ren dom FØR upsertet (`maaRegistrereFejlet`, #815),
  ikke en genlæsning bagefter. Og skriv ærligt at opslag og upsert er to
  kald: lander det betalte event imellem, står rækken forkert og intet
  retter den.
- **En test der kun låser en streng, så ikke NotFound.** Klokken byggede
  `/virksomheder/{id}` i to dage; testen forventede præcis den streng, og
  ruten hed `/virksomhed/:companyId`. Kildeværn: testen læser `App.tsx` og
  fejler hvis ruten klokken bygger ikke står der som `path="…"` (#815).
- **Stripes kundeportal har opsigelse slået til som standard.** På den nye
  konto stod «Cancel subscriptions» TIL uden at nogen havde valgt det;
  med et portal-link kunne et rateabonnement opsiges af medlemmet, og
  webhooken springer `subscription.deleted` over for abonnementer med
  art. Slået FRA 11/9 kl. 10:01. Tjek portalens sektioner FØR et link
  sættes op.
- **`gh run list --branch <navn>` viser også kørsler fra ældre grene med
  samme navn.** 11/9 stod #651 («Feedback i Hjemmebane», admin-fladen fra
  4/9) under `feat/feedback-hjemmebane` ved siden af #816 — samme grennavn,
  fem måneder imellem. Læs titel og alder på hver kørsel, ikke kun
  grennavnet, før en status tilskrives den PR man venter på.
- **En funktion måles med sin egen betingelse, ikke med søsterfunktionens.**
  11/9 blev checkout-døren holdt åben i to timer, fordi
  `hent_betalingsdata_til_checkout` blev målt med tilbuddets mønster
  «+ 1 > now()» — og de to skriver hinandens modsætning: tilbuddet dømmer
  «betalt» på `+ 1 > now()`, checkout tillader betaling på `is null or
  + 1 <= now()`. «false» var det rigtige svar for en kørt fil. Mål mod
  funktionens egen linje i filen (eller mod md5 af hele kroppen), aldrig
  mod et mønster lånt fra en anden funktion.
- **En afgrænset filliste skal spørge efter alle der bygger typen.** Kort
  60 (11/9) gjorde to felter påkrævede i `TjeklisteInput`; to testfiler
  uden for opgavens liste (`focus.test.ts:365`, `:486`,
  `onboardingRytme.test.ts:120`) byggede typen og fejlede tsc — commit-
  blokkens tsc fangede det (`verifikation-kort60.txt` RETTELSE 2). Når en
  type får et påkrævet felt, grep efter alle der konstruerer den, også
  fixtures, før listen låses.
- **Commit-blokken kører selv tsc og tests — og stopper kæden.** To gange
  11/9 stoppede den før en gren blev lavet: tsc én gang («Found 3 errors
  in 2 files» — de to testfiler ovenfor) og én test (velkomstmailens
  paritet med tjeklisten, `onboardingRytme.test.ts:127`). «Tre gange»
  stod i chattens prompt og var chattens fejl. Det er meningen. En «grøn» melding fra
  bygningen tæller først, når blokkens egen kørsel har sagt det samme.
  **Skærpet 13/9 — tredje gang på én dag:** brancheafsnittets fjernelse
  (§15) meldte grønt i chatten; `bun run test` på HELE suiten kl. 18:40
  gav 1 failed af 2982 — `ingenBranchefallback.guard.test.ts:55`, #833's
  eget værn fra tre timer tidligere, låste `from("industry_benchmarks")` i
  `NoegletalView.tsx`. To lærdomme: (1) *En verifikation der kun har kørt
  egne filer, er ikke en verifikation.* Kør hele suiten — ét kald, 25
  sekunder — og skriv slutlinjerne ordret; «grønt» uden «Test Files N
  passed (N)» er en påstand. (2) *Et kildeværn i en anden mappe kan låse
  præcis det man lige har fjernet.* Værnene under `src/lib/__tests__`
  læser komponentfiler som tekst (`toContain`), så en fjernelse i
  `src/components` kan vælte en test der aldrig importerer den. Grep
  værnene for filnavnet og de strenge man fjerner, FØR man kalder det
  færdigt. Værnet er ikke fejlen — det fangede at en præmis var skiftet;
  det er dét de er til. **Skærpet 15/9 — CI-blokken:** chattens CI-blok tog den FØRSTE kørsel på commit-id'et — «Edge Function Auth Guardrail» — og meldte grønt før «Tests» var set; og chattens facit forventede «MCP Tests» som egen kørsel, men det er et job i kørslen «Tests». Reglen: vent til ALLE kørsler på commit-id'et er completed og «Tests» er iblandt (`gh run list --commit <sha>` → hver `conclusion`), før noget meldes grønt.
- **Et tomt dokument er ikke et grønt svar.** 13/9 aften blev
  terminaloutputtet fra commit-blokken sendt som et vedhæftet dokument, og
  det var TOMT i chattens kontekst. Chatten svarede alligevel «PR #834 er
  oprettet», som om kæden var gået igennem — den var stoppet ved `bun run
  test`, der blev aldrig lavet en gren, og PR 834 findes ikke (`gh pr view
  834`: «Could not resolve to a PullRequest»). Jonas fangede det: «at der
  var noget der fejlede betyder ikke noget?». Når et vedhæftet output ikke
  kan læses, skal det siges — «dokumentet er tomt hos mig, send teksten» —
  ikke fyldes ud med det forventede. Samme klasse som «Mål, påstå ikke»
  (DEL 1): et svar der ikke kan læses, er ikke et svar, og det forventede
  udfald er ikke et bevis. **Skærpet samme aften — chatten gentog fejlen
  to gange mere.** Anden gang var årsagen en anden end den påstod: den
  uploadede fil LÅ i uploadmappen og kunne være læst med et værktøj; det
  var kun den indlejrede visning i beskeden der var tom. Chatten kaldte
  den «tom» i stedet for at læse den — selv om den havde læst alle dagens
  øvrige diffs fra samme mappe med samme værktøj. Jonas fangede begge
  gange. *Sådan hænger stierne sammen:* `~/Downloads/` er JONAS' maskine —
  det er dér Claude Code skriver, og derfor nævner prompterne den sti.
  Chatten kan IKKE læse den mappe. Chatten kan kun læse filer Jonas
  uploader, og de lander i uploadmappen; derfra læses de med et værktøj.
  Reglen: når en vedhæftet fil ikke kan læses i beskeden, så læs den fra
  uploadmappen med et værktøj — den er der. Er der ingen fil (fx
  terminaloutput indsat direkte i chatten), så sig at det er tomt og bed
  om teksten eller en måling. Antag aldrig resultatet.
- **`git add <filer>` afgrænser ikke en commit — index'et gør.** 13/9
  aften kørte vindue B `git add -A` (docs) mens chatten byggede
  commit-blokke med `git add <to kodefiler>`. Committen tog HELE index'et,
  så #834 bar både koden (`NoegletalView.tsx`,
  `ingenBranchefallback.guard.test.ts`) og bogføringen
  (`docs/OVERLEVERING.md` +428, `docs/mangelliste.html` +130), og
  PR-teksten nævnte kun koden. Ingen skade — men PR-teksten løj om sit
  eget indhold. Kør `git diff --cached --stat` OG læs den, før du
  committer; eller ryd index'et først (`git restore --staged .`) og stage
  præcis det committen skal bære. To vinduer på samme main deler ét index.
  *Skete igen samme aften, kl. 19:27:* vindue B's `git add -A` (docs, §16)
  landede i vindue A's commit-blok ti sekunder senere — `3e3fd9ed`, PR
  #837 (kort 56) bærer bogføringen af oprydningen, og PR-teksten nævner
  kun koden. Forudsætningen «Vindue A skriver ikke» stod i opgaven og
  holdt ikke. Før `git add -A`: kør `git status --short` og STOP hvis der
  står andet end dine egne filer; og commit-blokken skal altid læse `git
  diff --cached --stat` før den committer (DEL 2 «13. september» §16).
  *Udfald:* #837 blev merget 17:29:00 UTC med §16 om bord (`146a1596`,
  docs +212/−9 og +37/−16); resten gik som #838 (17:35:45 UTC). *Tredje
  gang, fanget i tide:* kort 56's egen bogføring (§17) kørte `git status
  --short` før `git add -A` og fandt `?? src/lib/betaltSession.ts` — vindue
  A var i gang med kort 76 trods «A skriver ikke». STOP: intet staged,
  diffen skrevet fra arbejdstræet. Reglen virker kun når den køres.
- **En dom må ikke love mere end RLS giver.** Kort 60's første tælling
  brugte `status <> 'slettet'` og lovede at en tråd skjult af en rådgiver
  stadig tæller; medlemmets SELECT-policy viser kun `status = 'aktiv'`
  (`20260811160000:66-69`), så den skjulte tråd nåede aldrig tællingen.
  Rettet til `.eq("status","aktiv")`, så dommen og RLS siger det samme.
  Læs policyen på tabellen før dommen formuleres i klienten.
- **Mål et felts udfyldning før det bruges som alvor.** Forslaget om at
  lade «Søger hjælp til» skelne den akutte refleksion faldt på målingen
  12:18: feltet er udfyldt i de fleste (sektion `e_refleksioner`: 4 af 6,
  5 af 5, 3 af 4, 6 af 7 …). Et felt der næsten altid er udfyldt, skelner
  ikke. Mål fordelingen først; ellers får alle samme alvor og ingen står
  øverst.
- **En Terminal-blok i SQL editoren giver syntax error ved «cd».** Sket to
  gange 11/9: en blok skrevet til Terminalen blev sat i Lovables SQL
  editor og faldt på «cd»; intet blev kørt. Marker hver blok med hvor den
  skal køres, og læs første linje før Run.
- **En ændret delt fil i `_shared` udrulles eksplicit — og beviset er en
  tørkørsel.** 11/9 skrev byggeriets verifikation at `onboarding-rytme`
  «deployer ved merge», uden måling; den blev i stedet udrullet i Lovables
  build-chat kl. 10:28 UTC og bevist med tørkørsel 9091 (status 200, samme
  tal som 9035). Om Lovable ruller en funktion ud, når kun en delt fil
  under `_shared` er ændret, er ikke målt. Bed om udrulningen, og kør
  tørkørslen bagefter.
- **Et funktionsnavn i overleveringen skal være mappens navn.** Chatten
  skrev «stripe-webhooks» i flere dages bogføring (fire steder i denne
  fil, plus to kodekommentarer i `fornyelsesperiode.ts:39` i begge
  kopier); funktionen hedder `stripe-webhook` — mappen
  `supabase/functions/stripe-webhook`, `config.toml:61`. Intet gik i
  stykker, fordi det kun stod i tekst — men det sender den næste til en
  mappe der ikke findes. Slå navnet op i `supabase/functions/` og
  `config.toml`, frem for at huske det. Rettet 13/9 (DEL 2 «13.
  september» §2).
- **Et driftsbevis der kræver at brugeren åbner en browserkonsol, er
  ikke et bevis — det er en opgave.** 13/9 foreslog chatten et
  konsol-kald med admin-token for at skelne to versioner af
  `manage-advisor` (om `remove-member` svarer 400 fra den udrullede
  kode); Jonas afviste: «Du skal teste på en anden måde frem for at jeg
  skal lege udvikler». Når et bevis kun kan hentes af den der bygger,
  skal værnet i koden bære det i stedet — kildeværnet i testen plus den
  eksplicitte udrulning fra main (DEL 2 «13. september» §4).
- **Et kort der spærrer, skal efterprøves før det bruges som
  begrundelse.** Kortet «Tre handlinger uden hjem før /members kan
  lukkes» har spærret /members siden 4/9; reconen 13/9 viste at omdøb
  blev flyttet 10/9 (#771) og merge fjernet 10/9 (#772) — kortet blev
  aldrig rettet, og beslutningen ventede på en præmis der var faldet bort
  for tre dage siden. Når et kort er begrundelsen for at vente, læs dets
  præmisser mod koden i HEAD først (DEL 2 «13. september» §5).
- **To skrivende vinduer i samme træ.** 13/9 satte chatten begge vinduer
  til at bygge samtidig — noten i vindue A, forsidelinkene i vindue B,
  begge på main uden gren. Det gik kun godt fordi de tilfældigvis rørte
  forskellige filer; begge vinduer opdagede hinanden ved `git add -A` og
  advarede (verifikation-forsidelinks.txt «STOP-NOTE», verifikation-
  fornyelsesnote.txt «ADVARSEL»), og begges testtal målte hinandens halve
  arbejde. CLAUDE.md siger «Lovable og Claude Code skriver ALDRIG
  samtidig» — det gælder også to Claude Code-vinduer. Ét skrivende vindue
  ad gangen; det andet reconer eller bogfører (DEL 2 «13. september» §6).
- **Et testtal fra to samtidige vinduer er ikke et testtal.** De to
  vinduer meldte 2975 og 2978; den fælles kørsel før commit gav 2978 (191
  filer). Chatten forudsagde 2979 ved at gentage et vindues optælling af
  sin egen test (verifikationen skrev «4 tests»; filen har tre it-blokke,
  målt 13/9 med grep — det fjerde var det andet vindues værn). Tæl
  testene i diffen, eller kør én fælles kørsel — gentag ikke et tal.
- **Et kildeværn kan holde en fil i live.** Da /members skulle slettes
  13/9 (bygning 3, #828), læste SEKS tests de døende filer ad sti-streng
  (`readFileSync(resolve(process.cwd(), "src/pages/Members.tsx"))` o.l.),
  ikke via import: factsDataBasisReadGuard, forsidenKaster.guard,
  emailSendLogKolonner.guard, fornyelseSkrivevej.guard, fornyelsesOrd.test
  og medlemsfjernelse.test. Reconen 13/9 middag fandt fem; det sjette var
  kort 83's eget kildeværn, bygget samme formiddag (#820) — det læste
  `MemberCompanyRow.tsx` og `Members.tsx` for at bevise at knappen var
  væk. To af de seks (forsidenKaster.guard `:124`, fornyelsesOrd.test
  `:66-68`) læste på MODULNIVEAU: en sletning uden rettelse ville have
  kastet ved modul-load og væltet hele filen — 281 linjer værn for
  AdvisorDashboard, virksomhedslisten og BoardroomView, plus de rene
  badge-tests — for flader der intet havde med /members at gøre. Og tsc
  ville have været grønt hele vejen: stier i strenge er ikke typer. Når en
  fil skal dø: grep efter dens STI som streng (`"src/pages/Members.tsx"`,
  `components/members/`) i `src/` og `scripts/`, ikke kun efter imports;
  læs hvert fund for om det står på modulniveau (vælter filen) eller inde
  i et it (vælter én test); og lad hver rettelse bære hvorfor værnet blev
  smallere (DEL 2 «13. september» §9).
- **En fanget fejl uden en modtager er en tavs halv sletning.**
  `companyHardDelete.ts:103-106` har siden 3/3 fanget fejl fra
  `auth.admin.deleteUser` med `console.warn` og ladet kæden fortsætte;
  `bulk-remove-members:152-155` gør det samme pr. bruger. Resultatet, målt
  13/9 kl. 16:53: fire konti hvis virksomhed, medlemskab og profil er væk
  — og ingen fik det at vide, for svaret til kalderen sagde success.
  Lovables logs opbevares kort og læses af ingen. En catch der kun logger,
  skal have en modtager: svaret til kalderen — fejlen i responsen, kæden
  stoppet, eller sletningen bogført som halv — ikke kun konsollen. Samme
  klasse som Alina-sagen (knappen lovede noget ingen hørte). Lukket 13/9
  (#830, udrullet 15:33 UTC — DEL 2 «13. september» §12). *Den var værre
  end den så ud: funktionen kastede slet ikke — `auth.admin.deleteUser`
  returnerer `{ error }` (auth-js `GoTrueAdminApi.deleteUser`), så
  catch'en var tomt teater tre steder (companyHardDelete,
  bulk-remove-members, cleanup-shells trin 0). Når en klient-SDK
  returnerer `{ error }` frem for at kaste, fanger try/catch ingenting; læs
  signaturen frem for at antage.*
- **En URL dikteres ikke af hukommelsen.** 13/9 aften bad chatten om
  skærmbeviser fra `/admin/email-templates` og `/indstillinger`; begge gav
  «Siden findes ikke». Ruterne hedder `/admin/emails` og `/settings`
  (`App.tsx:271`, `:269`) — chatten havde gættet stierne ud fra
  komponentnavnene (`EmailTemplatesView`, `IndstillingerView`) i stedet
  for at slå dem op. To NotFound-skærme lige efter en Update ligner en
  tabt build, og et bevis der aldrig kunne tages, tæller som et bevis der
  fejlede. Mål ruten i `App.tsx` (`path="…"`) FØR du beder om et
  skærmbevis, og skriv stien fra filen, ikke fra komponentens navn. Samme
  klasse som «Et funktionsnavn i overleveringen skal være mappens navn»
  (DEL 2 «13. september» §16). *Gælder også SKALSYNTAKS (13/9 sen aften,
  §19): chatten dikterede `read -rs -p` — bash — til en zsh-terminal og
  fik «no coprocess». Terminalen står i miljøbeskrivelsen (Shell: zsh);
  mål miljøet før du dikterer en kommando, gæt ikke ud fra hvad der
  plejer at virke.* *Gælder også KNAPNAVNE i Stripe Dashboard (15/9, DEL 2 «15. september» §7): chatten dikterede «⋯» og status «Open» for en faktura; Dashboard viser knappen «More actions» og mærket «Failed» (API: `open`). Og Dashboardets tidsstempler er dansk tid, ikke UTC — mål fladen før du dikterer et klik.* *Og skalsyntaks igen 15/9 (DEL 2 «15. september» §8): chatten dikterede `grep --include=*.ts` uden anførselstegn til zsh («zsh: no matches found» — zsh globber selv) og `git show` uden `--no-pager` (outputtet stoppede ved pagerens «:»). Brug `--include='*.ts'` og `git --no-pager`.*
- **En begrundelse for ikke at bygge skal måles som alt andet.**
  Påstanden «reparationen kræver Calendly premium» stod tre steder
  (DEL 3-rækken, mangellistens kort, `betaltSession.ts:15`) i ti dage,
  fra 3/9 til 13/9, formuleret som en kendsgerning, og afgjorde en
  prioritering: hele Calendly-kæden for Jonas' sessioner blev sat LAV.
  Ingen havde sendt kaldet. Da det endelig blev sendt (13/9 kl. 21:30:
  `GET /webhook_subscriptions?organization=…&scope=organization` med
  Jonas' token), tog det ét minut og svarede 200 med en tom liste —
  planen rækker, der manglede bare et abonnement. Imens var Rallysupports
  mødedatoer sat i hånden kl. 20:48. En blokering er også en påstand — og
  en påstand der SPARER arbejde, bliver sjældnere efterprøvet end en der
  koster, fordi ingen har lyst til at måle sig til mere arbejde. Reglen:
  når noget nedprioriteres med en teknisk begrundelse, skal begrundelsen
  have samme bevis som en bygning — et kald, en række, et skærmbillede —
  og en kilde der kan slås op. Står der «kræver X» uden måling, er det en
  hypotese og skal stå som en. (DEL 2 «13. september» §18)
- **Udklipsholderen er ét felt — læg aldrig en hemmelighed der, hvis
  brugeren skal kopiere noget andet undervejs.** 13/9 sen aften
  genererede chatten Jonas' Calendly signing key, lagde den i
  udklipsholderen, og bad i NÆSTE trin Jonas kopiere secret'ens NAVN
  (`CALENDLY_WEBHOOK_SIGNING_KEY_JONAS`) ind i Lovable. Navnet overskrev
  nøglen: det der blev gemt som secret, var ikke det der blev signeret
  med, og testkaldet fejlede med 401 — og fejlen blev først søgt i koden.
  Anden gang i træk. En hemmelighed der skal bruges to steder (sættes i
  Lovable, signeres med lokalt) skal ligge i en FIL skrevet med umask
  077, som begge trin læser, og som slettes bagefter — ikke i et felt som
  næste kopiering tømmer. (DEL 2 «13. september» §19)
- **Byg ikke på en recons tal — mål rækkerne bag kortet, i den enhed
  koden regner i.** En recon måler det den bliver bedt om. Kort 29's
  prod-måling 11/9 talte `budget_targets.category = 'loenninger'` og fik
  «6 virksomheder | 72 rækker»; koden kobler budget til rapportfelt PR.
  GRUPPE (`GROUP_TO_REPORT_FIELD`), og mindst én skabelon (`saas_b2b`)
  og alle importerede budgetter har ingen række med den nøgle. Tallet var
  rigtigt og enheden forkert — og kortets beslutning («kun omsætning og
  lønninger», «en dag») hvilede på det i to dage. Samme klasse som kort
  76 (recon-a2's RLS-påstand holdt ikke). Reglen: før en prod-måling
  citeres på et kort, skal SQL'en stemme med den kobling koden faktisk
  bruger (find opslaget — `find`, `eq`, `JOIN` — og mål DEN), og kortet
  skal sige hvilken enhed tallet er i. (DEL 2 «13. september» §24)
- **Chattens tidsestimater er for høje.** Jonas 13/9, ordret: «Du
  overestimerer altid tiden. Når du skriver 5 arbejdsdage, så er det reelt
  ikke en gang én dag. Når du skriver 1 time er det oftest 10 min.» Målt
  mod dagen selv: 13/9 blev kort 83, hele /members-planen i tre bygninger,
  KPI-målene, lækagen i `hardDeleteCompany`, Calendly-kæden, den
  inkluderede session og kort 82 bygget og udrullet på én eftermiddag og
  aften — 28 PR'er. Estimater regnet «i udviklingsdage for én person»
  (som recon-delingens «4–5 dage», 14/9) rammer ved siden af i denne
  arbejdsform, og de gør skade: et kort der «koster fem dage» udsættes,
  selv om det er gjort før frokost. Reglen: angiv hvad der SKAL gøres og
  hvad der BLOKERER (en beslutning, et design, et foto, en prod-måling)
  — ikke hvor lang tid det tager. Er et estimat nødvendigt, så mål det mod
  hvad der faktisk blev gjort på en dag (13/9 er målestokken), og skriv
  hvad det er målt mod. (DEL 2 «13. september» §26–§27)

- **En webhook-URL i et eksternt system er en prod-måling, ikke en
  antagelse.** Mondays to automationer pegede fra 21/3 til 14/9 på
  `hzlkypibayzkkumwohap` — et Supabase-projekt der ikke findes i repoet
  eller i git-historikken — og `monday-webhook` krævede en header Monday
  aldrig sender. Ingen af delene stod i koden; begge stod hos Monday. Tre
  recons og en «kæden er hel 3/9» (FLOOR1, i hånden) så aldrig efter.
  Reglen: en integration bevises fra afsenderens side — læs URL'en og
  headeren i det eksterne system, og lad afsenderen sende ét rigtigt kald
  — før noget kaldes «bevist». Et bevis i hånden er ikke et bevis for
  indgangen. (DEL 2 «14. september» §1)
- **Et tavst fallback-valg er en fejl, selv når fallback'en virker.**
  `send-invitation-email` valgte mellem DB-skabelon og indbygget HTML med
  `if (tpl && tpl.enabled)` efter et `maybeSingle()` hvis `error` aldrig
  blev læst, og loggede samme `template_name` på begge veje. Rækken var
  slået fra siden 8/9 kl. 07:31, og ingen kunne se at hvert nyt medlem
  fik fallback'en — med fire usandheder i. Reglen: når koden vælger
  mellem to kilder, skal valget og ÅRSAGEN logges og stå i det spor
  driften læser (`email_send_log.metadata`), og `error` fra opslaget skal
  læses — ellers er «det virker» kun «det sendte noget». (DEL 2 «14.
  september» §2)
- **En kvote hos en anonym tredjepart hænger på afsenderens IP — og
  Supabases edge-runtime deler IP med fremmede.** cvrapi.dk svarede 200
  fra Jonas' maskine kl. 10:37 og QUOTA_EXCEEDED fra edge-runtimen kl.
  10:40 på samme CVR med samme User-Agent. Vores eget forbrug (højst ét
  opslag pr. ny virksomhed; berigelsen ikke kørt) forklarede intet.
  Reglen: en ekstern kilde uden nøgle er ikke en kilde der kan regnes
  med i drift; og når den fejler, skal fejlen NÅ mennesket — `hentCvrData`
  kaster aldrig, kvitteringen er den samme, og sporet er kun
  `cvr_fetched_at IS NULL`. (DEL 2 «14. september» §6)
- **Lovables build-chat er ikke et måleinstrument for svarkoder.** Efter
  #851 rapporterede build-chatten 401 på et kald uden secret; `curl` gav
  500 «Server configuration error» — den svarkode kun den nye kode kan
  give, og dermed beviset for at udrulningen var den rigtige. Reglen:
  svarkoden måles med `curl` (eller Lovables log), aldrig med chattens
  gengivelse; og et driftsbevis der hviler på et eksternt systems
  adfærd (Monday slår fra ved 401 — automationen blev stående tændt)
  skal skrives som INDIREKTE, med det der ikke blev læst (Lovables log)
  nævnt. (DEL 2 «14. september» §1)
- **Ét mailloft for hele workspacet — og en fan-out pr. event æder det.**
  Fire events på tyve minutter gav 109 mails på et kvarter (14/9), Lovable
  afviste alt nyt fra 09:10, og seks adresser fik `failed`. Loftet er pr.
  TIME og pr. WORKSPACE (Pro 100), ikke pr. projekt; invitationer,
  betalingslinks, påmindelser og varsler står i SAMME kø som et
  event-opslag til 26 medlemmer. Reglen: en mail der bærer en handling
  (betalingslink, invitation) må aldrig konkurrere med en udsendelse — N
  hændelser samles i én mail (Jonas 14/9, ikke bygget), og et 429 skal
  stå som `rate_limited` i loggen, ikke som `failed` (#857), så nogen kan
  se HVORFOR den ikke kom frem. (DEL 2 «14. september» §12–§13) *RETTET 15/9 (§10): det har den aldrig gjort — prod's CHECK afviste rækken i tavshed; migrationen `20260915210000` tilføjer `rate_limited`.*
- **Et gyldigt format er ikke en eksisterende post — og registrets
  «findes ikke» ligner kvotens «no data».** YKRG APS' CVR stod som
  44891917: otte cifre, men to byttet om (det rigtige er 44891719 — rettet
  14/9 11:47). Et transponeret nummer passerer ALLE husets tjek —
  `CVR_FORMAT`, `harCvr`, berigelsens kandidatvalg — og kun registret kan
  afvise det; når det gør, svarer `hentCvrData` det samme «no data» som
  når kvoten er brugt op. I formiddags læste vi det som kvoten; det var en
  tastefejl. Reglen: et opslag der svarer «findes ikke» er en anden
  tilstand end «ikke slået op endnu» OG en anden end «kvoten er brugt», og
  skal gemmes som sådan, så hverken cron eller flade prøver igen — og så
  et menneske ser «ret nummeret», ikke «kør berigelsen». (DEL 2 «14.
  september» §14, §26)
- **Tallet om en crons målgruppe er tørkørslens, ikke et skøn.** «25
  kandidater» for intro-påmindelsen (14/9 formiddag) var regnet af
  `intro_session_used_at IS NULL`; cronen fandt FEM, fordi den også gater
  på medlemskabsstart og på at der findes en medlemsbruger. Skønnet stod
  i en bogføring og i et review-fund. Reglen: når et tal om hvem en cron
  rammer skal stå i huset, køres tørkørslen og svaret citeres — kodens
  gater kan ikke regnes ud fra én kolonne. (DEL 2 «14. september» §15)
- **En refusion i Stripe rydder ikke op i platformen.** `stripe-webhook`
  lytter på `checkout.session.completed`, `customer.subscription.*`,
  `invoice.paid` og `invoice.payment_failed` — ikke på `charge.refunded`,
  `charge.dispute.*`, `invoice.voided` eller `credit_note.*` (grep 14/9);
  alt andet svarer `{ received: true }`. Refunderes en betaling, står
  `contract_end_date`, `indgangspris_oere`, `status='active'`,
  `company_perioder`-rækken og invitationen som før: medlemmet beholder
  adgang, og fornyelsen regner videre. Opsiges et rate-abonnement i
  Stripe, springer webhooken over når `metadata.art` er sat. Reglen:
  oprydning efter en testvirksomhed (gennemkørslen 22/9: 3.500 kr. ekskl.
  moms, ingen testtilstand) er SLETNING i platformen — slettefunktionen —
  aldrig en refusion; og en refusion til et rigtigt medlem skal følges af
  de samme skrivninger i hånden, for ingen kode gør det. (DEL 2 «14.
  september» §18–§19)
- **To kanaler, to tilstande — en udrulning bevises pr. kanal, og
  gennemkørslen fangede den selv.** Dag 0-mailen kl. 11:27 sagde «så
  skriv til mig», selv om #856 var merget 12:06 dansk: de fem functions
  var udrullet 10:03, FØR #856 fandtes. Samme minut viste /betal den
  rigtige adresse (#860), fordi Update var klikket. Frontend og edge
  functions er to kanaler med hver sin tilstand (DEL 0 punkt 2), og «i
  HEAD» er ingen af dem. Reglen: før en kæde køres som bevis, listes hver
  PR der skal være i drift, med kanal og udrulningstidspunkt — og en
  tekst der først kan ses ved næste rigtige kald, bogføres som UBEVIST,
  ikke som udrullet. (DEL 2 «14. september» §24)

---

## Beslutninger der står fast

Skal ikke genforhandles uden ny måling.

- **En fejlet rate lukker aldrig et abonnement (10/9).** Stripe ender i `past_due` — ikke `unpaid`, ikke `canceled` — og bliver ved med at forsøge og fortælle det (kortfejl-mails TIL). Adgangen afgøres af `contract_end_date`, ikke af Stripes tilstand; en fejlet rate er en inddrivelsessag. (fornyelseskæden §9, adgangsdomme §6)
- **Fristen er kontraktens:** 30 dage fra underskriften. (indgangen §27)
- **Et webhook-abonnement oprettes SIDST, og hvert abonnement har sin
  egen signing key (13/9).** Rækkefølgen er kode → secret → bevis på at
  funktionen læser nøglen (et signeret kald svarer på indholdet, ikke
  503) → abonnement. Oprettes abonnementet før nøglen kan læses, svarer
  funktionen 401 på hver event, Calendly retry'er i 24 timer og sætter
  abonnementet `disabled` — som ikke kan genaktiveres, kun slettes og
  oprettes igen. Og aldrig én delt nøgle på to abonnementer: en rotation
  ét sted dræber begge. (DEL 2 «13. september» §19)
- **Kommunikation kun ved «tilbyd».** Et medlem der ikke skal tilbydes
  fornyelse, får intet. (fornyelsesordningen §1)
- **Medlemmet hører om sin fornyelse fra SYSTEMET, ikke ved at miste
  adgangen** (6/9). Formen spejler indgangens kæde: cron, tørkørsel som
  standard, ren motor, stempel kun ved lykket afsendelse; rådgiverens
  personlige besked kommer EFTER systemets mail. (fornyelsesordningen §7)
- **Tallene i fornyelsen (7/9):** mail 1 dag 30 før slutdato, mail 2 dag
  7, tilbuddet lever 14 dage efter slutdato — og KUN efter `tilbyd`;
  `tilbyd_ikke` har intet vindue. Rådgiverbeslutningen skal foreligge
  senest dag 30, ellers sendes intet. (fornyelsesordningen §3, §7)
- **Den sene beslutning sender KUN varsel 2** (7/9): er begge varsler
  forfaldne når `tilbyd` træffes, sendes varsel 2 alene — varsel 1 sendes
  aldrig bagefter. **Ingen nedre grænse for varsel 2:** dag 0 er en
  påmindelse, ikke en advarsel. Efter slutdatoen sendes intet.
  (fornyelseskæden §15.1)
- **Fornyelse kan betales FØR slutdatoen** (Jonas 7/9, ændrer 1/9).
  Betalt før eller på slutdatoen: ny slutdato = gammel slutdato + 12
  måneder — den der handler tidligt mister ingen dage. Betalt efter:
  betalingsdagen + 12 — dagene uden adgang gives ikke tilbage. 29/2 → 1/3
  året efter. `cancel_at` regnes stadig fra abonnementets start.
  (fornyelseskæden §15.3, §7; fornyelsesordningen §1)
- **Et agentforslag udløber når dets egen ISO-uge er passeret** (Jonas
  7/9, #688). Ugen, ikke 7×24 timer: den godkendbare skrivevej skriver
  ugens fokus med godkendelsens nøgle, så «kan det godkendes» og «hvor
  lander det» er samme spørgsmål. Godkendelse afvises; forkastelse er
  stadig mulig. **Puklen «venter på din afgørelse» tæller kun det der
  kan afgøres** — oprydning er ikke en afgørelse. Enhver fremtidig cron
  der skriver `expired`, SKAL bruge `afgoerForslagsgyldighed`. (DEL 2
  «Agentkæden»)
- **`er_kunde` læses KUN i rådgiverens læsestier** og gater ingen cron,
  ingen edge function, ingen RLS (6/9). Slukkes noget for en virksomhed,
  ændres medlemmets hverdag — og det var netop kravet at den ikke måtte.
  Reglen er fail-open: kun eksplicit `false` er en beslutning.
  (DEL 2 «er_kunde»)
- **To mails i to øjeblikke, aldrig samtidig:** betalingsmail ved
  underskrift, invitation efter betaling. (indgangen §21)
- **Vi viser ikke tomt indhold.** Uden video ingen velkomst — punktet udgår
  rent, ingen tom boks, ingen død knap; tjeklisten har seks punkter (rettet
  14/9; «fem» var forkert, pillen siger «0 af 6»).
- **Prisen ændres ikke når den først er sat** (409). Skal den rettes, er
  det en samtale. (indgangen §28)
- **Dag 31-fakturaen er det FULDE beløb, sendes FØR dag 31-mailen, og
  Stripes egne påmindelser slås ikke til** (`auto_advance=false`). Skal
  der rykkes, er det vores egen kæde. (indgangen §4, §30)
- **Stripe-testkunderne slettes ikke.** En kunde med faktura og
  kreditnota er ejer af regnskabsbilag, og bilag skal kunne læses. De
  tre testkunder er bogført og hører ikke til nogen virksomhed.
  (indgangen-overhaling §11)
- **«Gjort» betyder handling, ikke besøg.** (tjeklisten)
- **Ét forslag ad gangen** i «Dine aftaler». **En opgave er en udgang,
  ikke et mål.** **Medlemmet sætter datoen** ved accept (B6). **Ingen AI
  skriver i et menneskes navn.** **Klokken og feedback-knappen
  genindføres ikke.** **Rådgiverfladen tages samlet.**
- **Forsiden viser opgaver, ikke køer** — en virksomhed, en grund, en
  handling (4/9, #631). **AI må tilføje, aldrig fjerne:** en ny
  refleksion giver ALTID en opgave, AI'en afgør kun om den står øverst.
  **Læring på signaltype, ikke på virksomhed:** en signaltype der
  systematisk fravælges rettes i koden; motoren må aldrig lære at tie om
  én virksomhed. **Alvorstærsklen er 70** (#634).
- **Slutdatoen er den sidste dag MED adgang** (7/9, #698, #699). Adgang
  til og med `contract_end_date`, i alle fem domme. (adgangsdomme.md)
- **En queryFn kaster; tom og fejlet ser forskellige ud** (7/9). En fejl
  bliver aldrig til et tomt svar; fladen viser «kunne ikke hentes» ved
  `isError`. (DEL 1 «Kodearbejde»)
- **Advisor må læse e-mail-loggen — mens advisor betyder «Jonas eller
  Morten»** (7/9). Kommer der en ekstern rådgiver, skal skellet mellem
  advisor og admin bruges, og adgangen genovervejes. (migration
  `20260907180000`, mangellisten «Advisor og admin er ikke skilt ad»)
- **Omkostninger er POSITIVE tal i `financial_report_facts.metrics`**
  (7/9, #721). Regnskabets minus vendes ved skrivning, i alle fire veje;
  resultat, bruttoresultat og balance beholder deres fortegn. Læserne
  må stadig tage `abs` — de er værnet mod arv. (DEL 2 «Omkostningernes
  fortegn», `omkostningsFortegn.guard.test.ts`)
- **Linjen er fladens rest, pulsen er tilstanden** (9/9, #755). Dommen
  trækker fra dem der har egen linje; pulsen måler hele porteføljen og
  siger hvor mange der står øverst. **Ingen «Udsæt»-knap** (#744):
  rangeringen udsætter, grundlaget afgør hvornår opgaven kommer igen.
- **Ét signal, flere trin — aldrig to signaler for det samme** (9/9,
  #761, som fornyelsens varsel 1 og 2). Trinnet står i grundlaget.
- **Ansøgningssporet bygges IKKE før webinaret 22/9 (13/9).** Hele
  ansøgningsprocessen skal ind på platformen i stedet for Monday — men
  det holder til efter, og først efter en recon af hvad Monday faktisk
  gør i dag. (DEL 2 «13. september» §23)
- **Nyheden er OPTAGELSEN (13/9).** Et nyt medlem deler i samme uge som
  det bliver optaget — «man skal udvælges, man skal sende en ansøgning,
  og man skal godkendes på en afklaringssamtale» — ikke først efter
  oplevet værdi. Delings-kortet hører til i de første fjorten dage.
  (DEL 2 «13. september» §22)
- **Delingskreativen: medlemmet vælger selv varianten (14/9).** Valget er
  en del af gaven — ikke ét kreativ tildelt af os. (DEL 2 «14. september»
  §28)
- **Delingen bygges i to dele (14/9).** Del 1 er siden med kreativerne,
  billedvalg, download og tekstudkast; del 2 er tjeklistepunktet, bagefter.
  Del 1 virker uden del 2 — linket sendes i chatten. (DEL 2 «14. september»
  §28)
- **Menupunktet hedder «Fortæl det videre», ikke «Deling» (14/9).** Det
  beskriver gaven, ikke mekanikken. (DEL 2 «14. september» §31)
- **Ansøgningens tekster må ALDRIG bruges offentligt (Jonas 14/9).** Det
  hun skrev til os om situation, mål og hjælp, er betroet — ikke råstof til
  en profil, et opslag eller en kreativ. Lukker «forudfyld profilen fra
  ansøgningen». (DEL 2 «14. september» §31; mangellisten nr. 9)
- **En gæst ser Community, men skriver ikke (Jonas 14/9).** Gæsten
  (`companies.vis_i_netvaerk = false`, ingen slutdato) har adgang til
  platformen og skal møde en GRÆNSE i Community — ikke en fejl ved gem, og
  ikke et tjeklistepunkt der beder hende skrive. (DEL 2 «14. september»
  §36)
- **Et like giver ingen besked (Jonas 14/9).** Notifikation ved like kræver
  en edge-funktion, dedup og en beslutning om fortrudte likes — åbent punkt,
  ikke bygget med knappen. (DEL 2 «14. september» §35)
- **Et nyt billede bærer sin version i den gemte URL — ikke en fjernet
  cache (Jonas 14/9).** Cachen betales hver gang et billede vises; en
  version kun når det skifter. (DEL 2 «14. september» §33)
- **Kvoten tæller det der nåede frem — kun `sent` (14/9, #882).** En mail
  medlemmet aldrig så, bruger ikke hans kvote; undtagelser opremses ikke
  pr. fejlstatus. (DEL 2 «14. september» §37)
- **Gamle notifikationer markeres læst, ikke slettet (Jonas 14/9: «Alt
  gammelt kan bare slettes»).** Samme effekt på kø og badge, men kan rulles
  tilbage. 587 rækker 14/9. (DEL 2 «14. september» §38)
- **Tællingen er reglen, ikke datoen (Jonas 14/9): 12 træk i alt.** Et
  migreret abonnements ophør sættes efter betalte fakturaer, ikke efter det
  gamle `cancel_at`; sidste træk dækker en måned frem, så abonnementet
  slutter en måned efter sidste træk. (DEL 2 «14. september» §42)
- **De gamle abonnementer annulleres med friske øjne, aldrig samme nat
  (Jonas 14/9).** En annullering kan ikke rulles tilbage, mens de nye kan
  (til 19/9 23:57 UTC) — men FØR 20/9, fordi de nye trækker ved midnat
  dansk. (DEL 2 «14. september» §43)
- **Trækhistorikken fra den gamle konto skal ind i `company_traek`, fra
  medlemskabets start, FØR kontoen lukkes (Jonas 14/9).** Beløb, dato og
  fakturanummer. (DEL 2 «14. september» §44)
- **PHILBERT og Pro-Vision fornys, flyttes ikke (14/9).** De to i sidste
  periode går fornyelseskædens vej på den nye konto. (DEL 2 «14.
  september» §41)
- **Vi går ikke på kompromis** — hvert led bliver brugt af det næste.

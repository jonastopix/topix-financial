# Overlevering

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
> stripe-webhooks version — doggybeds event 13/9 (søndag), svaret bærer
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
  skærmbillede). **UDESTÅR:** stripe-webhooks version bevises stadig af
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
| **ÅBENT — Jonas og Morten, ikke i aften** (10/9 kl. 22: «Jeg ved ikke om jeg er skarp nok til at vælge») | **`run-weekly-agent`: slet (A), omlæg tørt/live (B) eller byg færdig som én mandagsmotor (C).** Den har aldrig kørt (kun `Deno.cron`, 0 `weekly_cron` i `agent_runs`), så intet haster. Mål FØRST om nogen læser ugefokus: `notifications` type `weekly_focus_ready` → `seen_at`/`read_at` (SQL i DEL 2). `weekly_focus.seen_at` kan ikke bruges (død skrivevej, rettes i det andet vindue). | DEL 2 «Ugefokus og ugeagenten» |
| **FØR 13/9** — Stripe er sat op 10/9 kl. 20:50–21:05 (past-due, mails til, dansk); **(1) BYGGET 11/9 (#815)**, (2) ikke bygget | **Restancen:** (1) ~~rådgivernes klokke ved fejlet træk~~ → **bygget 11/9 (#815)**: `skrivRaadgiverBesked` i `payment_failed`, dedup `company_traek.id`, værn mod at et betalt træk vendes til fejlet; udestår Update og bevis på skærm. (2) retries opbrugt → `invoices.send` når `next_payment_attempt` er null — **ud af A1 11/9**, forudsætningerne står på kortet; haster ikke før 13/9 (otte forsøg). Bevis: doggybeds træk 13/9 (søndag) — går det igennem, skrives `betalt`; fejler det, skal klokken ringe og badgen stå, og svaret bærer `traek.id` eller `klokke`. | DEL 2 «11. september, formiddag»; fornyelseskæden §9; mangellisten (Betaling) |
| **LØST — MÅLT KØRT 11/9 kl. 09:20** (alle tre stod i prod; `query-results-export-2026-09-11_09-20-04.csv`). Var: SKREVET 10/9 (#801), IKKE BEKRÆFTET KØRT | **Tre migrationer:** `20260911020000_messages_delete_15min.sql` (to DELETE-policies erstattes af «within 15 min» + advisor), `20260911030000_feedback_bucket_mappetjek.sql` (mappetjek, 5 MB, image/*), `20260911040000_companies_status_check.sql` (CHECK + NOT NULL; prod målt 30/8, 0 NULL). Bevis: SELECT'en nederst i hver fil — indtil da gælder de gamle policies. | DEL 2 «10. september, sen aften»; `SECURITY_BASELINE.md` §5 |
| **RETTET 11/9 — «/members er tømt» holdt ikke** (recon-a2 kort 3 og 83 §4): `Members.tsx` renderer stadig header «Virksomheder», «Importér ansøgning» (`:1058-1065`), «Inviter ny bruger» (`:1066-1070`), `MembersStatsBar` (`:1074`), listen med `MemberCompanyRow` (`:1184-1200`: omdøb, invitér, gensend, fjern, slet, redigér virksomhed), «Slet virksomhed / + brugere» (`:1316`) og `MembersAdminSection` (`:1239-1249`); ruten `App.tsx:243` kræver advisor. Var: «RETTET 10/9 (#771–#773): `/members` er tømt — kun importen og onboarding-tragten står». `/settings` ER konverteret (#773). **EFTER 9/9** — det der stod tilbage efter rådgiverfladen og de to trin | ~~Otte ting kun på `/members`~~ → **10/9: importen bliver til ansøgningsflowet flytter; onboarding-tragten skal IKKE flyttes.** 11/9: siden er ikke tømt — se rækkens første celle; «Fjern»-knappen og `remove-member` fjernes i samme bygning (besluttet 11/9, kortet «Fjern fra virksomheden»). ~~`/settings`' tre rester~~ → **10/9: konverteret (#773).** **Aftale-kortet** er bygget med slutdato og pris; perioderne vises når nogen har nogen — 27 af 27 har nul. **Bevis:** `_shared/ikkeIGang.ts` i «View code» efter merge, Update for forsiden. **Ikke kode:** skriv til de seks der aldrig har uploadet — bed om historikken. | DEL 2 «9. september», mangellisten «Rådgiverfladen» |
| **9/9 — I MORGEN** (punkt 1 og 2 er KØRT 8/9: de syv slettet kl. 12:14–12:26, DEL 2 «De otte tidligere»; kvitteringen siger en dato og kan fortrydes, #736) | **1) KØRT 8/9 kl. 12:14–12:26** — de syv tidligere slettet i fire hold efter `docs/koereplan-de-syv-tidligere.md` (nu historik); 8 af 8 stemplet, sweep tomt. **2) KØRT (#736)** — kvitteringen siger «Din data slettes den …» (motorens frist) og kan fortrydes til dagen før. **3) Cron-migrationsfilen** der bogfører `slet-medlemsdata` (`0 12 * * *`), formen fra `20260901112000_prod_cron_bogfoert.sql`. **4) Planen for 8/9, punkt 6–7** (punkt 4 og 5 er GJORT 8/9 eftermiddag: digesten kalder milepælsdommen #741/#742, kvitteringsmailen #739 — DEL 2 «Eftermiddagen 8/9»): toasten i `Index.tsx`, og den tomme platform (a–d). **5) Intro-sessionens tid** — starttiden ankommer i `calendly-webhook` og kastes væk; bygges (det andet vindue 8/9 aften). **6) Åbne fund uden beslutning:** de betalte 1:1-sessioner der stopper ved `booking_sent`; agentens forslag (op til tre pr. virksomhed pr. mandag + ét pr. rapport, ingen læser svarene) — mangellisten bærer begge. | `docs/koereplan-de-syv-tidligere.md`; `docs/koereplan-slettefunktionen.md`; DEL 2 «Slettefunktionen»; øverst «PLANEN FOR 8. SEPTEMBER» |
| **22/9 — BEVIS** (kortene «aftale-kortet» og «betalingshistorik» er slettet fra mangellisten 10/9; beviset står her) | **Første rigtige periode på `/settings`.** #773 viser aftalen (slutdato, start, pris fra `companies`) og «Betaling» (perioder og fakturaer) — men målt 9/9 har 27 af 27 nul rækker i `company_traek`/perioder. PHILBERTs varsel 2 går 22/9 og bliver den første række. Bevis: kortet viser perioden og fakturaen på skærmen, og `company_fornyelse` læses ikke (låst med test). | DEL 2 «10. september» (#773) |
| **10/9** — MÅLT 6/9: ikke en tændingsdato | Fornyelsesordningen træder i kraft. Tre udløber inden og falder udenfor. **Intet sker i koden den dag:** `FORNYELSE_IKRAFT_DATO` sammenlignes med virksomhedens slutdato, ikke dags dato, og bliver virkningsløs efter 10/9. Kædens forudsætninger er alle grønne (seks migrationer kørt, ni priser, seks events, fire funktioner udrullet — men 401 beviser kun at de findes, ikke hvilken version; driftsbeviset fra 1/9 ligger før #529, #561, #563, #572 og #583). **Det der IKKE er klar: ordningen har ingen afsender** — rækken «BESLUTTET 6/9» nedenfor. | fornyelseskæden §13; fornyelsesordningen §5, §7; DEL 2 «Fornyelseskæden» |
| BESLUTTET 6/9 (Jonas), TALLENE 7/9 — KÆDEN ER HEL og BEVIST I PRODUKTION 7/9 kl. 11:57 (#680, #681, #691, #692, #694–#697); LØST 7/9 kl. 14:51: cron-jobbet er PLANLAGT (0 11 * * *, aktivt) — **22/9** er PHILBERTs varsel 2 | **Medlemmet skal høre om sin fornyelse fra SYSTEMET, ikke ved at miste adgangen.** Formen, med tal fra 7/9: mail 1 ved 30 dage før slutdato, mail 2 ved 7 dage, tilbuddet lever 14 dage efter slutdato (bygget som tilstand, #678); et tilbud om at booke «En snak om din fornyelse» via https://calendly.com/topix-jonas/fornyelse (almindeligt link, ikke engangslink); og en notifikation til rådgiveren når mail 1 er sendt, så den personlige chatbesked kommer EFTER systemets mail og ikke i stedet for. **Konsekvens:** rådgiverbeslutningen skal foreligge senest dag 30, ellers sendes intet — en glemt beslutning aflyser mailen, den forsinker den ikke. **LØST 7/9 kl. 14:51:** jobbet er planlagt — `fornyelsesvarsler`, `0 11 * * *` UTC (13:00 dansk), aktivt, målt i `cron.job`. Første kørsel 8/9 finder ingen forfaldne (PHILBERT og CARMA er stemplet); næste rigtige afsendelse er PHILBERTs varsel 2 den 22/9, og den sker af sig selv. Rådgiveren ser stemplet på forsiden («Varslet er sendt — N dage», #696); en egen notifikation til rådgiveren er ikke bygget. *Bevist i produktion 7/9 kl. 11:57:* PHILBERT fik varsel 1, CARMA fik varsel 2 på dag 0 uden varsel 1, begge stemplet (DEL 2 «Fornyelseskæden»). Motoren `afgoerForfaldentVarsel` (#680) og `fornyelsesvarsel-cron` (#681) FINDES; tørkørslen kl. 10:15 fandt PHILBERT → varsel 1 og CARMA → varsel 2 med «varsel 1 springes over: sen beslutning» (DEL 2 «Fornyelseskæden», fornyelseskæden §15). Stemplerne findes (`varsel_1_sendt_at`, `varsel_2_sendt_at`, #674, i prod 7/9 kl. 08:51; ingen trigger — skrivestien sætter selv `updated_at`). **Formen SPEJLER INDGANGENS KÆDE** (målt 6/9, `~/Downloads/recon-indgangens-mailkaede.md`, uden for repoet): pg_cron → `net.http_post` med vault-nøglen → Bucket B-funktion med `authenticateServiceRole` → TØRKØRSEL SOM STANDARD → ren motor afgør hvilken dag hver række står på → byg mail → enqueue → stempl KUN når afsendelsen lykkedes. **Datamodellen (LØST 7/9, #674):** stempel-felterne findes nu — to navngivne kolonner frem for et dag-nummer, fordi de to varsler kan sendes uafhængigt. **Calendly (LØST 7/9):** event-typen findes, linket står ovenfor. Betalte bookinger registreres i dag aldrig tilbage i platformen (målt 3/9), så linket i mailen skal være et almindeligt link — vi lover ikke en måling vi ikke kan holde. **Tempoet, målt i prod 6/9:** efter Doggybed 13/10 er der ingen fornyelse før Livja 16/12 — to måneders hul; derefter fjorten virksomheder marts–juni 2027, over halvdelen af porteføljen. Deadline for mailkæden: Livja minus 30 dage. | fornyelsesordningen §7; fornyelseskæden §13.4; indgangen-design §26 (formen) |
| åbent, målt 6/9, delvist ændret 7/9 — værnet er stadig et menneske | **Datogaten omgås stadig hvor pengene skifter hænder.** `hent-fornyelsestilbud` kalder nu motoren (#678), men både den og `opret-fornyelse-checkout` kræver `udloebet_tilbyd`, som afgøres i udløbsgrenen FØR datogaten. En virksomhed «uden for ordningen» med beslutning `tilbyd` får derfor stadig et systemtilbud og kan betale — nu dog kun de første 14 dage efter udløb. Om gaten SKAL gælde der, er en beslutning — i dag er det rådgiverens finger der er værnet. | fornyelseskæden §13.3 |
| LØST 7/9 (#678) — vinduet; Studio Minis række er nu en BESLUTNING om timing | **Tilbudsvinduet efter udløb er en tilstand:** `udloebet_vindue_lukket`, kun efter `tilbyd`, fra dag 15 efter slutdato; bevist i drift kl. 09:36–09:38 (DEL 2 «Fornyelseskæden»). **Studio Mini (slut 5/9, `tilbyd`) FORLÆNGER IKKE (Jonas 6/9):** i dag er de dag 2 i vinduet; fra 20/9 lukker vinduet af sig selv, og rækken bliver `udloebet_vindue_lukket` uden at nogen rører den. Beslutningen er om den skal ryddes FØR — indtil da viser gaten dem et tilbud. CARMA STUDIO (7/9, `tilbyd`) håndteres manuelt i dialog. | fornyelsesordningen §3; fornyelseskæden §13.4, §14 |
| BYGGET 7/9 eftermiddag (#683 motoren, #684 pengevejen), udrullet kl. 08:53 UTC — ændrer beslutningen fra 1/9 | **Fornyelse kan betales FØR slutdatoen.** Før kunne et medlem på dag 22 hverken se eller betale sit tilbud (checkout 403, `hent-fornyelsestilbud` null, gaten kun for udløbne). **Regnestykket, ordret:** betalt FØR eller PÅ slutdatoen → GAMMEL SLUTDATO + 12 måneder; betalt EFTER → BETALINGSDAGEN + 12. Grænsen er kontinuert (28/9 og 29/9 → 2027-09-29; 30/9 → 2027-09-30). `periode_start` er udledt af `company_perioder`s invariant: ny periode begynder hvor den gamle slutter. 29. februar er en synlig gren (→ 1/3 året efter, slutdatoen er eksklusiv). **`cancel_at` er IKKE ændret, og skal ikke ændres** — abonnementet er betalingsplanen, ikke adgangen; en der betaler tidligt får et abonnement der ophører FØR kontrakten, og det er rigtigt (DEL 2 «Fornyelseskæden», rettelsen; DEL 4). | fornyelseskæden §15.3, §7; fornyelsesordningen §1 |
| LØST 7/9 (#691) — fornyelsesbåndet, bevist kl. 12:45; formen strammes (UNDERVEJS, Jonas 7/9) | **Et ikke-udløbet medlem kan betale, men kan ikke SE tilbuddet — LØST: båndet på forsiden.** `MembershipExpiredGate` vises kun ved tier `expired` (`Index.tsx`), og ingen anden flade viser fornyelsen til et medlem (målt 7/9). Betalingsvejen er åben fra dag 60 (`klar_til_tilbud`), men den eneste vej til checkout er gaten. Hvor tilbuddet skal vises før slutdatoen — forsiden, en mail, et kort — er ikke besluttet. *Målt 7/9 middag (`~/Downloads/recon-fornyelse-efter-betaling.md` §6, uden for repoet): `MembershipExpiredGate:88` er det ENESTE kaldested i `src/`; reconen kortlagde otte eksisterende mønstre at vælge imellem, og chattens udløbsbånd (sage-flade, rust-ikon, gatet på tilstand) er formmæssigt tættest — og det blev formen.* *LØST 7/9 kl. 12:45 (#691): `FornyelsesBaand` øverst på forsiden, kun når serveren siger tilbud; bevist på Topix med 20.000 kr. og tre modeller (DEL 2 «Fornyelseskæden»). Kortet er slettet fra mangellisten. Undervejs: større tekst, én primær knap, luft.* | DEL 2 «Fornyelseskæden»; fornyelseskæden §15.3 |
| samtale, målt 6/9 | **To virksomheder uden slutdato rammer aldrig ordningen:** Alexander Lunds virksomhed og Martin Larsens virksomhed (`ingen_slutdato`). Og **Bastant Design** (31/12-2027) har ingen indgangspris, så fornyelsesprisen er ukendt — et `tilbyd` dér ville give et tomt tilbudskort. | fornyelseskæden §13.4 |
| **13/9** | doggybeds træk på 4.375 kr. på den nye konto — MÅL at det gik igennem. Derefter flyttes de tretten i portioner. TuaMea (2/9), Floren engros og BR Roset (3/9) venter til efter egne træk. **Samme dag, beviset for #563 (nu stærkere):** `companies.subscription_status` skal forblive NULL på doggybed (`382fd787-3141-45c7-8eea-297b7b947fe0`) efter trækket — fordi grenen springer over med vilje, ikke fordi noget fejler — og `customer.subscription.updated` skal stå grøn i Stripes Event deliveries. SQL'en står i migration-recon §26. **Samme dag, beviset for #572:** en række i `company_traek` for doggybeds faktura med `status = 'betalt'` (SQL editor); fejler trækket, skal rækken stå som `fejlet` og badgen vise sig på /members (#574). **Beviset for #815 (11/9):** svaret på `invoice.payment_failed` bærer `traek.id` og `klokke` (skrevet/fandtes pr. rådgiver); en række pr. rådgiver i `advisor_notifications` med `type = 'traek_fejlet'`, `reference_type = 'traek'`, `reference_id = company_traek.id`; klokkens link er `/virksomhed/382fd787-…?section=aftale`. Går trækket igennem, skrives ingen besked, og et senere `payment_failed` for samme faktura svarer `sprunget_over: allerede_betalt`. 13/9 er søndag. **Skærmbeviset for klokkens link er FØRT 11/9 ca. 11:15** («Ny resultatopgørelse fra remm.» → virksomhedssiden, Jonas: «Det virker umiddelbart», uden skærmbillede; Update klikket 11:12); det der står tilbage her er stripe-webhooks version, som doggybeds event beviser. | migration-recon §25, §26; indgangen-design §31; DEL 2 «11. september, formiddag» |
| LØST 3/9 kl. 10:42 | **Hvorfor skrev webhooken ikke på 2/9?** Eventet BLEV leveret; webhooken svarede 500 i skrivningen (fem gentagelser fra Stripe). Efter #563 gensendt manuelt → 200 `skipped: migreret_subscription`, «Recovered». Webhooken får subscription-events; hvidlisten er bevist på det rigtige event. Hvad der kastede, afdækkes bevidst ikke — men det art-løse selvbetjeningsabonnement går stadig gennem den kode. | migration-recon §26 |
| **22/9** varsel 2 — jobbet ER planlagt (RETTET 11/9: `cron.job` målt kl. 09:20 har `fornyelsesvarsler` «0 11 * * *» gennem `kald_edge('fornyelsesvarsel-cron', '{"dry_run": false}')`; «jobbet er ikke planlagt» var forældet siden 7/9 kl. 14:51); **29/9** er PHILBERTs sidste dag MED adgang (#698) | PHILBERTs fornyelse: `tilbyd` står i `company_fornyelse`, prisen er gyldig (20.000 kr.). *7/9 kl. 11:57:* **varsel 1 ER SENDT** (nille@…, 22 dage, 20.000 kr.) og stemplet `varsel_1_sendt_at`; båndet på forsiden viser tilbuddet (#691), så PHILBERT kan både se og betale før 29/9 (#684). **Varsel 2 forfalder 22/9** — og sendes af jobbet kl. 11 UTC (målt 11/9); intet manuelt kald. Doggybed 13/10 står som `tilbyd_ikke`. | fornyelseskæden §13.4; prioritering §1 |
| LØST 3/9 | **Cron-jobbet `indgangs-paamindelser` (0 10 \* \* \*)** er planlagt og aktivt, verificeret i `cron.job`. Tørkørsel og rigtig kørsel bevist på FLOOR1. Secret `RAADGIVER_MAIL_TIL` er ikke bekræftet sat i denne bogføring. | indgangen-design §26, §30 |
| LØST 3/9 | **Dag 31-fakturaen** (#559–#561): motoren opretter kunde + faktura med `metadata[company_id]` på begge, cronen sender den FØR dag 31-mailen, `invoice.paid` er tilmeldt (fem events formiddag, seks efter #572; `invoice.created` bevidst ikke) og skriver samme kæde som checkout med `betalingsmodel 'faktura'` og beløb uden moms. Bevist i drift 3/9 kl. 10:00–10:11 inkl. betaling og kreditnota. | indgangen-design §30 |
| LØST 3/9 eftermiddag (#572, #574) | **Månedstrækkene registreres** — både betalte og fejlede, i `company_traek`; `invoice.payment_failed` tilmeldt (seks events); fejlet træk ses på /members. Migration kørt, webhook deployet, Update klikket. Bevis 13/9. | indgangen-design §31 |
| UDSKUDT 3/9 aften | **Restancepolitikken** (`past_due` = åben adgang, `unpaid` = lukket) er besluttet og bygges IKKE nu. Tre grunde: den rammer nul rækker (`subscription_status` er NULL på alle 38, målt kl. 20:32, og kun det art-løse selvbetjeningsabonnement kan sætte det — der findes ingen); den ville ændre FEM domme, ikke tre, og to af dem (`har_aktivt_medlemskab`, `har_aktivt_abonnement`) er ikke paritetstestede og bærer community, indhold, events og storage; og formen er forkert for rateabonnementer, hvor en fejlet rate er en inddrivelsessag (`company_traek`, #572/#574), ikke en adgangssag. Bygges den dag det første selvbetjeningsabonnement oprettes: motor før flade, paritetstest på alle fem domme. | `docs/adgangsdomme.md` |
| åbent | **`sikrIndgangsInvitation` kender ikke «allerede accepteret»**: den leder efter pending; findes en accepteret række, fejler insert på `UNIQUE(company_id, email)`, og invitationen sendes ikke. Set 3/9 på FLOOR1. Kan ikke ske for indgangen i drift, men tilstanden er ikke håndteret. | indgangen-design §30 |
| åbent, besluttet | **Rykkere på dag 31-fakturaen**: Stripes egne påmindelser slås IKKE til (`auto_advance=false` med vilje — en fjerde stemme på engelsk fra en anden afsender ville skurre). Skal der rykkes, er det vores egen kæde. Ikke bygget. Bemærk også: dag 31-mailen siger 50.000 kr, fakturaen 62.500 kr inkl. moms — ikke ændret. | indgangen-design §30 |
| LØST 3/9 kl. 11:50–12:00 | **Adressen på de eksisterende virksomheder**: `berig-virksomheder` (#567) hentede den fra CVR for 26 af 30 aktive (før 1 af 30). Uden: tre uden CVR-nummer (Alexander Lund, Martin Larsen, Bastant Design) og YKRG, som registret ingen adresse har for. | indgangen-design §33 |
| efter 13/9 | Migrationen af de 13 (billing_cycle_anchor, cancel_at, default_payment_method, YKRG's kort, kobling til companies.id). | migration-recon §16, §25 |
| målt 3/9 aften — VIRKER for medlemmet | **1:1-sessionernes Calendly-kæde efter kontoskiftet.** Målt i Stripe (MCP, livemode): `session_1on1` findes som præcis én aktiv pris på den nye konto (`price_1UApFg3CvBmCx5PtyGkNPRmm`, 500 kr. ekskl. moms; kunden betaler 625 kr. med `automatic_tax`); `abonnement_maanedlig` findes ligeledes (`price_1UApQx3CvBmCx5Pt8GxtQsze`, 399 kr.). Webhook-endpointet `we_1UAtaW3CvBmCx5PtL736lAJN` er enabled med seks events inkl. `checkout.session.completed` og peger på `loiavmastgeieqyiwyyr`. **Kæden virker for medlemmet:** to betalte 1:1-sessioner er booket OG afholdt (23/6 og 30/6, målt i Calendly 3/9 aften). Det der fejler, er registreringen — rækken nedenfor. | — |
| bevidst nedprioriteret 3/9 aften — LAV | **Betalte 1:1-bookinger registreres aldrig som `booked`.** Målt 3/9 aften: **0 af 12 betalte bookinger har `calendly_event_uri`, mod 2 af 3 gratis.** Årsagen er tredelt: (1) `stripe-webhook` (linje 917 og 925) skriver Calendlys `booking_url` RÅT i `session_bookings.calendly_booking_url`, mens `create-free-intro-booking` (161–162) indlejrer bookingens id i URL'en (`salesforce_uuid` + `utm_content`), og `calendly-webhook` (75–80) matcher kun på dem; (2) `calendly-webhook` matcher desuden på `advisor = 'morten'` (l. 94, 129), og de betalte rækker er `'jonas'` (default, migration 20260621120000); (3) Jonas' Calendly-organisation har kun ét medlem, så Mortens webhook-abonnement kan ikke dække Jonas' events. **Prioritet LAV, besluttet:** det koster ikke medlemmet noget — de booker og mødes — og reparationen kræver Calendly-abonnement på premium. Det er nedprioriteret, ikke glemt. Ikke en følge af kontoskiftet; det har været sådan hele tiden. | `~/Downloads/recon-kontoskifte.md`, `recon-1til1-link.md` (uden for repoet) |
| åbent | **Velkomstvideoen skal optages** (Morten). Pladsen er bygget; GUID'et sættes i /admin/config. Siden 3/9 (#569) kan fokuskortet åbne videoen via `#velkomst`, så velkomst-punktet ikke længere er en fælde den dag GUID'et sættes — beviset på skærm kommer først da. | recon-velkomstvideo, indgangen-overhaling §10 |
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
| ved næste oprettelse | **Udestående bevis for trin 4** (branchen): næste rigtige «Godkendt» på Monday eller «Importér ansøgning» skal give en række med `industry_code` sat (SQL editor) og branchesammenligning i NoegletalView. 401 fra de deployede funktioner beviser kun at de svarer. | `docs/indgangen-overhaling.md` §6, §9 trin 4 |
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
| driftsgæld | Fejlovervågning: query- og mutationsfejl i frontend logges globalt fra 7/9 (#702) — men ingen alarm, og edge functions er ubevogtede; restore er aldrig afprøvet; `run-weekly-agent` står ikke i `cron.job` (**bekræftet 6/9:** ti jobs i prod, ingen af dem den — ugeagenten kører formentlig slet ikke, DEL 2 «Agentkæden»); 73 uploads bestod validering uden at blive committet; e-conomic-integrationen er død (migration-recon §10). | status-1-sept §6; den forrige overlevering (§7, før omskrivningen i #538) findes kun i git-historikken |
| MÅLT 6/9 — egen opgave | **Ugeagentens cron findes ikke i prod.** `run-weekly-agent` har kun `Deno.cron` (kører aldrig på edge-runtimen); `cron.job` har ti jobs, ingen kalder den. Kun `generate-weekly-focus` (0 6 \* \* 1) kører mandag. Om agenten NOGENSINDE har kørt fra cron, er ikke efterprøvet (`agent_runs.trigger` kan svare). Skal den køre, er vejen pg_cron + `net.http_post` som `intro-reminder-cron` — men den kører LIVE og skriver det medlemmet ser, så det er en beslutning, ikke en rettelse. | DEL 2 «Agentkæden»; DEL 4 (`Deno.cron`) |
| LØST 6/9 sen aften (#670) | **De elleve typefejl efter Lovables regenerering af `types.ts`** er rettet ved at lade husets egne interfaces sige sandheden om databasen — `EventTimes.ends_at` og de fire felter på `MemberProgress` er valgfrie OG nullable — og ved at skrive reglen ned begge steder: null og undefined betyder det samme, «det er ikke sket». Ingen casts, intet non-null, ingen ændring i `types.ts`. Tretten nye tests låser reglen, inkl. grænsen ved `starts_at` + 90 min. **Målt efter:** tsc giver præcis fire fejl (CompanyChatPane, PushView, RapporteringView ×2), 1656 tests grønne. | DEL 1 «Kodearbejde» |
| LØST 7/9 kl. 14:51 — jobbet er planlagt; **22/9** er PHILBERTs varsel 2 | **Cron-jobbet for fornyelsesvarsler skal planlægges.** Kæden sender og er bevist i produktion 7/9 kl. 11:57 (DEL 2 «Fornyelseskæden»), og jobbet ER planlagt 7/9 kl. 14:51: `fornyelsesvarsler`, `0 11 * * *` UTC (13:00 dansk), aktivt — målt i `cron.job`, ellevte job, alene på klokkeslættet. Kæden kører af sig selv. Første rigtige afsendelse er PHILBERTs varsel 2 den 22/9. | fornyelseskæden §15; DEL 2 «Fornyelseskæden» |
| MÅLT 7/9 — punkt 1–4 LUKKET (#703, #706, #708); 5–11 og de 115 står | **De tavse fejl.** 122 af 139 `useQuery` læser aldrig `isError`; 115 queryFn'er gør en Supabase-fejl til tom data, så TanStack ser en succes; 52 kald med `const { data } = await` uden `error`-tjek; 25 mutationer uden `onError`, 50 uden throw. Global fejllogning findes fra #702; forsidens ni delkald kaster fra #703. **Rækkefølgen for resten:** 2) `/virksomheder`, 3) `/members`, 4) medlemmets «Dine aftaler» og ulæste, 5) Rapportering («Ingen rapporter endnu» til et medlem med 20), 6) nøgletals-mål og benchmarks — FORKERTE tal, ikke tomme, egen alvor — 7) app-config, 8–11) admin-lister, community, mutationer. Mønstret: `kraevRaekker` + `isError`-gren + kildelæsende værn (DEL 1 «Kodearbejde»). *7/9 sidst på dagen:* punkt 1–4 er lukket (#703, #706, #708) og standardmål markeres; punkt 5–11 og de 115 står tilbage — stadig husets største systematiske hul. | DEL 2 «De tavse fejl»; `~/Downloads/recon-tavse-fejl.md` (uden for repoet) |
| LØST 7/9 sidst på dagen (#707, #709) | **Fornyelsesbeslutningen kan træffes fra virksomhedssiden**, og `company_fornyelse` skrives ét sted, låst af et værn. Livjas beslutning (slut 16/12) skal foreligge senest 16/11 for at varsel 1 kan gå — nu uden at nogen skal skrive /members i hånden. | DEL 2 «Fornyelseskæden» |
| RETTET 7/9 aften (#716); CARMAs slutdato flyttet i hånden kl. 18:23 | **Varselsmotoren sendte til en der ikke kunne betale.** CARMA STUDIO fik varsel 2 kl. 11:57 med en knap der ikke virkede (slutdato 7/9 ≤ ikrafttrædelsen 10/9 → `uden_for_ordningen`). Nu spørger `afgoerForfaldentVarsel` tilstandsmotoren og tier med `blokeret_af`; cronen tæller `kan_ikke_handle`. Camillas slutdato er 11/9 (før: 2026-09-07), så linket virker; ingen flere mails. Åbent: badget kender kun varsel 1 (mangellisten). | DEL 2 «Fornyelseskæden — CARMA-sagen»; DEL 4 |
| MÅLT 7/9 — bevis mangler | **Indgangens kæde har aldrig haft en virksomhed.** NUL rækker i `company_betalingslink` i prod; fem mails, den daglige cron og dag 31-fakturaen har ingen at ramme. Kæden er bevist som enkeltkørsel (FLOOR1 3/9), ikke i drift. Første rigtige virksomhed er beviset — og rammer alle indgangens ubeviste tekster. | DEL 2 «Indgangen» |
| MÅLT 7/9 — kræver DEFINER-ændring | **Fakturateksten i `Betal.tsx` er usand i ti timer** (dag 31 kl. 00–10). `faktura_sendt_at` findes, men `hent_betalingstilbud` returnerer den ikke; ellers den mindste sande tekst («Fristen udløb {frist}. Du får en faktura …»). Rammer nul i dag, den første i morgen. | DEL 2 «Indgangen» |
| BESLUTNING (Jonas), faglig — 7/9 | **KPI-fallbackens fire kronebeløb passer kun til én virksomhedsstørrelse.** Markeringen er bygget; tallene (omsætning 120.000, lønninger 50.000, resultat 10.000, omkostninger 80.000, plus 60 % / 15 %) er ét sæt for alle. Branchespecifikt, størrelsesafhængigt eller fraværende fallback er en faglig beslutning, ikke en rettelse. | DEL 2 «De tavse fejl», «Rådgiverfladen — listen og virksomhedssiden» (#623) |
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
  401, før du tror på deployet.
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

---

## Beslutninger der står fast

Skal ikke genforhandles uden ny måling.

- **En fejlet rate lukker aldrig et abonnement (10/9).** Stripe ender i `past_due` — ikke `unpaid`, ikke `canceled` — og bliver ved med at forsøge og fortælle det (kortfejl-mails TIL). Adgangen afgøres af `contract_end_date`, ikke af Stripes tilstand; en fejlet rate er en inddrivelsessag. (fornyelseskæden §9, adgangsdomme §6)
- **Fristen er kontraktens:** 30 dage fra underskriften. (indgangen §27)
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
- **Vi viser ikke tomt indhold.** Uden video ingen velkomst, fem punkter.
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
- **Vi går ikke på kompromis** — hvert led bliver brugt af det næste.

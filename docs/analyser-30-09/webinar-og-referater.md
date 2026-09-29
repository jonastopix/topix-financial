# Erstat eWebinar (A) og automatiske referater (B) — recon, research og plan

Skrevet 29/9-2026 til opstart 30/9. Repo læst, intet rørt (read-only). Alle fund er fil:linje fra `/home/claude/topix-financial` (HEAD `e83cfcc`). Research er hentet 29/9 via web; hvor en kilde ikke kunne læses eller ikke svarer, står det som «ikke bekræftet». Hvad der ikke er målt i prod (Supabase, Bunny-dashboard, Google Workspace, eWebinar-dashboard), står som «umålt» — intet her er målt i drift.

---

# DEL A — ERSTAT eWEBINAR

## A0. Værdivurdering først (regelsættet §4a)

- **Er det relevant?** eWebinar er webinarets eneste afspiller, tilmeldingsflade, chat og kilde til fremmøde. Alt fra Klaviyo-fremmødehændelser til Meta-tragten hænger på det (A1). Prisen er 99 USD/md for Level 1 (1 publiceret webinar) — Capterra-oversigten, se kilder; om det er den plan, I står på, er ikke målt herfra.
- **Hvem får det bedre?** Ikke tilmeldte: de oplever det samme webinar. Fordelen er (1) ét sted for al data (i dag skal to systemer sys sammen på e-mail), (2) ingen åben `.ics` med navn+e-mail (fund `a22-ewebinar-ics-aaben`, `docs/tracking.md:452-463`), (3) egen tilmeldingsflade, egen tracking og egne tekster, (4) kan bygges videre sammen med ansøgningsmotoren (CTA'en er allerede vores).
- **Hvad koster det?** Ca. 99 USD × 12 ≈ 1.200 USD/år sparet mod et bygge, jeg skønner til 6–9 ugers udvikling + parallelkørsel (A5, skøn, ikke målt) og en driftsrisiko på jeres vigtigste leadkanal. **Rent økonomisk er det ikke en besparelse, der forsvarer sig selv; det forsvarer sig kun, hvis kontrollen og integrationen er værdien.** Dommen er Jonas'; min anbefaling: byg det inkrementelt bag eWebinar (A5), så hvert trin allerede giver værdi (egen kalenderfil, egne join-links, egen fremmødedata), og opsig først, når parallelkørslen har bevist paritet.

## A1. FUND — alt vi gør med eWebinar i dag

### A1.1 Indgående: webhook, API, tabeller

| Hvad | Hvor | Bemærk |
|---|---|---|
| **Webhook** `ewebinar-webhook` (Bucket C, `verify_jwt = false`, HMAC-signatur over rå body, trigger «All») | `supabase/config.toml:113-117`; `supabase/functions/ewebinar-webhook/index.ts:1-64`; `_shared/ewebinarSignatur.ts` | gemmer hver besked rå + flettet tilstand; secret `EWEBINAR_WEBHOOK_SIGNING_SECRET` |
| **Loggen** `webinar_haendelser` (idempotent på SHA-256 af body) | `supabase/migrations/20260919130000_webinar_tilmeldinger.sql:47` | slettes aldrig; er kilden til nye felter |
| **Tilmeldingen** `webinar_tilmeldinger` (én række pr. registrant, `ewebinar_id` unik) | samme migration `:75-` ; typer `_shared/webinarDom.ts:49-62` | state, sidste_action, `set_procent` (går aldrig ned), `session_tid`, `session_type`, utm/fbclid/origin/referrer, by/land/enhed, `raa` |
| **De tre links** `join_link` (personligt), `kalender_link` (`/v1/attendees/<id>/ics`), `replay_link` | `20260922170000_webinar_tilmeldinger_links.sql`; `webinarDom.ts:107-116, 272-303` | fyldt fra `raa` på 691 rækker 22/9 |
| **REST API v2** (engangsimport, målinger, `hentAlleRegistranter/Webinarer/Registrant`) | `_shared/ewebinarApi.ts:33` (base `https://api.ewebinar.com/v2`), `:175-185`; `ewebinar-import/index.ts` (525 l.); secret `EWEBINAR_API_KEY` | tre tilstande (mål/tørkørsel/skriv); køres aldrig med `send_fremmoede` uden tanke (`docs/OVERLEVERING.md` 21/9 §9) |
| **Prøven** `ewebinar-proeve` | `supabase/functions/ewebinar-proeve/index.ts` | signerer indefra, `PROEVE-`-id; bevist i drift 20/9 |
| **Bedømmelse + CTA-klik** læses ud af fritekstfeltet `raa->>interactionsSummary` (format: `Feedback: <spørgsmål>: 5`, `CallToAction: calltoaction_ansgTilTheBoardroom: Clicked`) | `_shared/webinarDashboard.ts:58-65, 262-275`; `src/hooks/webinar.ts:25-36` | målt 22/9: 55 af 384 bar feltet. **Chat/Q&A-tekster læses ikke noget sted i repoet** — de bor kun i eWebinars indbakke (umålt hvor mange spørgsmål, og om der ligger noget værd at gemme) |

### A1.2 Domme afledt af eWebinars tal

- **Fremmødedommen** `set` (≥ 75 %) / `delvist` / `mødte ikke op` udledes ALTID af `set_procent`, aldrig af hændelsestypen: `_shared/webinarDom.ts:16, 32-33` (`SET_GRAENSE_PROCENT = 75`), spejlet i `src/lib/webinarDom.ts`. Uden tal falder den tilbage på eWebinars `state`. `set_procent` kommer fra feltet «Total watched %», hvis nøgle blev fundet ved måling (`webinarDom.ts:24, 231-249`; `ewebinar-import/index.ts:494`).
- **Overgange** «deltog»/«mødte ikke op» → Klaviyo-hændelser, unik `<ewebinar_id>:<grad>`: `_shared/webinarHaendelser.ts:92-155`; kaldt fra webhook og import.
- **Rådgiverfladen** `/webinar` + **delingen til eksterne** (`webinar-delt`, `webinar-deling`), tragten (tilmeldt → deltog → ≥ 75 % → CTA-klik → ansøgt): `src/components/hjemmebane/webinar/WebinarView.tsx`, `src/hooks/webinar.ts`, `_shared/webinarDashboard.ts`, `src/lib/webinar/dashboard.ts:452-490` (kommende sessioner pr. `session_tid`).
- **Sessionen** er enheden: `webinar_id` + `session_tid` (eWebinars ord `Scheduled | Replay | JustInTime | OnDemand`, `webinarDom.ts:57`). Replay/OnDemand har ingen `session_tid`.

### A1.3 Udgående mails og hvad der stadig kommer fra eWebinar

- **Platformen sender allerede** bekræftelse, 14/7/3/1 dage, «dagen» og «en time før» via Mailgun EU: `supabase/functions/webinar-mail-cron/index.ts` (læser tilmeldinger `:211`), dommen `_shared/webinarMailDom.ts`, tekster `_shared/webinarMailTekster.ts`, loft `_shared/webinarMailLoft.ts`. Så **påmindelsesmails er ikke en eWebinar-afhængighed** (som opgaven siger), MEN:
  - **invite.ics hentes fra eWebinar** (`addToCalendarLink`) og lægges i mailen: `_shared/mimeInvitation.ts:51-59, 83-104`; `MED_INVITATION` = `bekraeftelse` + `fjorten_dage` (`webinarMailDom.ts:25`). Filen bærer eWebinars UID/ORGANIZER; går eWebinar, dør kilden.
  - **`join_link` er eWebinars personlige link** (`webinarMailDom.ts:338-347, 460`); uden det står påmindelsen uden knap (doc-kommentar i `20260922170000...sql`).
  - **10-minutters-påmindelsen sendes stadig af eWebinar** (`docs/webinaret-og-annoncerne.md` §7e tabellen; `docs/marketingmotoren.md:216`). Skal overtages (ny art → CHECK-migration FØR udrulning, `webinarMail.guard` dom 10).
  - **Afmelding:** eWebinars «Unsubscribed» (`sidste_action`/`subscribed`) læses af `erAfmeldt` (`webinarMailDom.ts:368-372`) og sendes videre til Klaviyo (`_shared/klaviyoAfmelding.ts`, `ewebinar-webhook`, `klaviyo-afmeld-bagud`). Platformen har egen afmelding `supabase/functions/webinar-afmeld/index.ts:18-29`. Uden eWebinar skal «afmeld» kun leve her.
- **Efter webinaret** ejer Klaviyo (flows `Wq3MkG`, `SDVvCW`), udløst af platformens hændelser: `docs/marketingmotoren.md` §9.1.

### A1.4 Klaviyo-, Meta- og GA-koblinger

- **Klaviyo:** «Deltog i webinar» / «Moedte ikke op» med `session_tid`, `set_procent`, `frisk` (fra `webinarHaendelser.ts`); `tb_naeste_webinar` skrives af `klaviyo-profil-cron` fra `webinar_tilmeldinger` (`supabase/functions/klaviyo-profil-cron/index.ts:132, 150`); `klaviyo-gensend-cron` gensender fejlede.
- **Sitet (topix.dk, andet repo):** eWebinar-widget på `topix.dk/webinar` (`.ewebinar__RegisterButton` lyttes af GTM → dataLayer `ewebinar_form_submit` → GA4 `generate_lead` + Klaviyo `identify`); `/webinar/tak?data=` med eWebinars krypterede attendee-payload; `WebinarTak.tsx`/`ewebinar.ts`: `docs/tracking.md:121-126` (rækkerne 12, 13, 17). **Tilmeldingssiden selv er ikke i dette repo** — kun `docs/recon-sitet-...` i `~/Downloads`. Jeg har ikke set sitets kode (umålt herfra).
- **Meta:** eWebinars egen pixel `858180112996496` sender «Visit Registration» (3,3 t.), «Fuldfør registrering» (=CompleteRegistration, 587), «Joined Session» (38) (`docs/tracking.md:126, 481`). **Det er annoncemålingen for tilmeldingen** — forsvinder med eWebinar og skal genskabes (pixel + CAPI m. `event_id`). eWebinar: `gdprBannerMode: Off`, `showConsentCheckbox: false` (`tracking.md:165`).
- **Meta CAPI fra platformen** låner webinartilmeldingens `fbclid` (seneste tilmelding på samme `lower(email)`, ≤ 90 dage før ansøgning): `_shared/metaSend.ts:319-321, 415-`; `meta-send-cron/index.ts:174`. Kolonnerne `utm_*`, `fbclid`, `ad_id_udledt` (`20260919150000`, `20260921130000`) er eWebinars registrantfelter; en egen tilmelding skal skrive de samme kolonner.
- **GA:** `ga-send-cron` sender IKKE for webinarvejen (ingen `ga_client_id`, `tracking.md:487`); ingen ændring.

### A1.5 Det, eWebinar leverer, som vi afhænger af (samlet)

Registreringsside + widget · tidsplan/sessioner (faste datoer; replay/on-demand) · simuleret live med tidsstyret start · chat/Q&A med moderator-svar (også pr. mail, når man er væk) · interaktioner (i brug: 1–5 stjerner «Del din feedback!», to CTA'er «Ansøg til The Boardroom» og «Ikke klar til at ansøge endnu») · replay-link · fremmøde + set-procent · personlig join-URL + `.ics` · 10-min-mail · afmelding · webhook + API · Meta-pixel. Ikke i brug (så vidt kendt): serier, SSO, adgangsstyring, AI-moderator, personlige resuméer, SMS/WhatsApp, Universal Dashboard.

## A2. RESEARCH — hvad eWebinar tilbyder (så intet overses)

Kilder: [eWebinar features](https://ewebinar.com/features), [scheduling](https://ewebinar.com/features/scheduling), [interactions](https://ewebinar.com/features/interactions), [chat](https://ewebinar.com/features/chat), [analytics](https://ewebinar.com/features/analytics), [notifications](https://ewebinar.com/features/notifications), [access control](https://ewebinar.com/features/access-control), [registration](https://ewebinar.com/features/registration), [AI](https://ewebinar.com/features/ai), [webhook-hjælp](https://ewebinar.com/help/webhook), [Capterra (priser/ulemper)](https://www.capterra.com/p/213778/eWebinar/). Interaktions-hjælpesiden kunne ikke læses i detaljer (kun metadata).

| Område | eWebinar tilbyder | Bruger vi det? | Bør erstatningen have det? |
|---|---|---|---|
| **Sessioner** | On-demand · Just-in-time · Recurring · Replay (m. chat og interaktion) · fast tidszone eller deltagerens lokale · blackout dates · åbningstider · replay-link-udløb · alle former samtidig | Faste datoer + replay-link i webhook; JIT/on-demand: umålt | **Skal:** faste sessioner + tidszone. **Bør:** replay-politik (A3.7). **Senere:** JIT |
| **Registrering** | Landingsside-bygger, widgets (knap/popup/bar/kort), in-video-registrering, ugated adgang, Zapier, valgfrie/skjulte/egne felter, samtykkeboks, e-mailvalidering, tak-side, pixel, cookiebanner | Widget på topix.dk; samtykkeboks **slået fra** | **Skal:** endpoint + formular på topix.dk, skjulte felter til utm/fbclid, e-mailvalidering. Senere: in-video-registrering |
| **Adgang** | Blokér private/temp-mails, hvid/sortliste, SSO, registreringsloft | Umålt | Loft + temp-mail-blok er billige; SSO nej |
| **Interaktioner** | 25+: polls, quizzer (1/multi), ratings, thumbs-up, spørgsmål, private beskeder, kontaktformularer, testimonials, CTA/tilbud/links/downloads, conversion-alerts, udløbende tilbud, in-video-registrering, «næste eWebinar»-registrering, video-overlays, agenda, tips, pause video, betinget visning, tidslinje-editor | 1–5 stjerner + 2 CTA'er | **Skal:** CTA (m. logning), feedback-stjerner, tekst-tips. **Bør:** poll. **Nej v1:** resten |
| **Chat** | Præ-tildelte moderatorer, notifikation pr. mail/browser/Slack, svar fra Slack, auto-velkomst med navn, auto-svar hvis ingen moderator, **svar pr. mail hvis deltager er væk**, «live now»-besked, chat kan slås fra | Umålt brug | **Skal** (spørgsmål til rådgiver + mail-svar), auto-velkomst. Slack: valgfrit (`slack_*`-infrastruktur findes) |
| **AI** | Bygger fra video, Chatbase-baseret AI-moderator, interaktionsforslag, landingsside-tekst, mailtekst, personlige resuméer af bogmærker/noter, session highlights | Nej | Nej v1. Rådgiver-udkast til svar (LLM) er en oplagt v2 |
| **Analytics** | Fremmøde og watch time pr. sessionstype, hvem gik tidligt, drop-off, engagement-heatmap, pr.-deltager svar, tragt besøg→registrant→deltager→konvertering, rapporter uden login, universal dashboard | Vi har egen tragt via `set_procent`; heatmap: nej | **Skal:** pr.-deltager set-sekunder (A3.4). Heatmap: senere (Bunny leverer aggregeret heatmap) |
| **Mails** | ≥ 2 bekræftelser, 2 påmindelser, 2 opfølgninger, redigerbare, kalenderinvitation + add-to-calendar, SMS/WhatsApp (Twilio), eget afsenderdomæne | **Overtaget af os på nær 10-min-mailen** | 10-min-mail + egen `.ics`. SMS: nej |
| **Andet** | Serier/learning paths, branding, embeddet player, mobil uden download, integration til CRM (Zapier/HubSpot m.fl.) | Nej | Mobil-afspilning **skal** virkelig testes (A3.3) |
| **Pris** | 99/199/299 USD pr. md; 1/5/15 publicerede webinarer | 99? | — |
| **Kendte svagheder (Capterra)** | Kun chat-svar (ingen lyd), begrænset regsiden, analyse-udtræk besværligt, kan ikke vise tidligere kommentarer til nye deltagere | — | Vi kan gøre bedre på pr.-deltager-data |

**Webhook-siden** dokumenterer 40+ registrantfelter og handlingerne `Registered, Joined, Left, WatchedWebinar, WatchedReplay, MissedWebinar, WebinarFinished, Converted, Unsubscribed` — men **ingen signering** (vores signatur-check er målt selv; `CLAUDE.md`/webinar-afsnittet). De samme ni handlinger er facit for vores egne overgange (A3.5).

## A3. PLAN — egen webinarmotor på Bunny

Princip (regelsættet): **motor før flade**, ren og testet dom først; **byg beviset ind** i hvert svar; **merge udruller ikke** — hver ny function og migration har sin deploy-rækkefølge (`CLAUDE.md`, «Deployment af edge functions»); nye migrationer med filhoved-linje `-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).`

### A3.1 Genbrug af det, der findes

- **Bunny + token**: `get-video-embed` signerer allerede embed-URL'er (`supabase/functions/get-video-embed/index.ts:170-190`, `sha256(TOKEN_AUTH_KEY + guid + expires)`, TTL 3600) og `HbVideoEmbed.tsx:60-100` kører `player.js` (`timeupdate`, `ended`, `resumeAt`). `chat-video` viser et separat Bunny-bibliotek til chat (`chat-video/index.ts:54-74`) — samme mønster kan bruges til et eget «webinar»-bibliotek, så sikkerhedsindstillingerne (`docs/hjemmebane/c0-bunny.md:42-75`: token TIL, direct play FRA, MP4 fallback FRA) ikke blandes med Akademiet.
- **Upload**: TUS-flowet i `bunny-content-admin` (`index.ts:75-121`) + `HbBunnyPicker.tsx:58-72`.
- **Tokens gemt som SHA-256** (`webinar_delinger`, `_shared/delingstokenAuth.ts`) → samme mønster til deltager-join-token.
- **Mail**: `webinar-mail-cron` + `sendManagedEmail`/Mailgun; **kalenderfil**: `src/lib/kalenderfil.ts` (events).
- **Dommen** `webinarDom.ts` (`set_procent` → set/delvist/mødte ikke) og overgange `webinarHaendelser.ts` genbruges uændret; motoren skal blot FYLDE de samme kolonner.

### A3.2 Datamodel (nye tabeller — forslag)

- `webinarer` (id, slug, titel, `bunny_video_id`, `varighed_sek`, tidszone `Europe/Copenhagen`, `interaktioner jsonb` = tidslinje `[{pos_sek, type: cta|feedback|poll|tip, indhold}]`, replay-politik, status).
- `webinar_sessioner` (id, webinar_id, `starter_at`, `lobby_min` = 15, `sen_indgang_min`, kapacitet, status planlagt/afholdt/aflyst). Sessionen er enheden (som `dashboard.ts:473`).
- **Tilmeldingen: behold `webinar_tilmeldinger`** frem for en ny tabel — alle læsere (mailcron, Klaviyo-profil, Meta, dashboard, delingen) læser den. Tilføj `session_id`, `kilde_system` ('ewebinar' | 'platform'), `join_token_hash`. `ewebinar_id` er `NOT NULL UNIQUE` og indgår i Klaviyo-`unique_id` og Meta-`event_id`; **beslutning til Jonas:** enten lade platformen skrive `ewebinar_id = 'P-<uuid>'` (som `PROEVE-`-præcedensen; nul ændring i læsere, men navnet lyver), eller migrere kolonnen til `registrerings_id` (ren, men rører alle læsere og deres paritetstests). Jeg anbefaler præfiks-vejen i fase 1 og omdøbning efter opsigelse.
- `webinar_heartbeats` (append-only: tilmelding_id, session_id, `pos_sek`, `serverside_tid`, event `join|beat|pause|leave`) → afledt `set_sekunder` (union af afspillede intervaller ÷ varighed, aldrig ned) → `set_procent`.
- `webinar_interaktion_svar` (tilmelding_id, interaktion_id, svar, tid). CTA-klik = «Converted»-analog.
- `webinar_chat` (session_id, tilmelding_id, besked, tid, `svar`, `svaret_af`, `svaret_at`, `sendt_som_mail_at`). RLS: deltageren ser kun sine egne; rådgivere alt (mønsteret fra `SECURITY_BASELINE.md` §5; permissive policies stakker med OR — ingen «skjul»-policy uden `AS RESTRICTIVE`).

### A3.3 «Live-simuleret» afspilning — alle ser samme tidspunkt, ingen spoling

- **Serveren ejer uret.** Ny function `webinar-afspil` (Bucket A-variant: token som legitimation, `verify_jwt = false`, prædikat FØRST — som `webinar-delt`) svarer med `{embedUrl, serverNu, startsAt, offsetSek, interaktioner}`. Beviset ind fra start: `offsetSek` og `serverNu` i svaret, kun ny kode kan svare.
- **Bunny har ingen parameter, der slår spoling fra.** Embed-parametrene jeg kunne finde er `autoplay, muted, preload, t, captions, loop, rememberPosition, showSpeed, compactControls` ([embedding](https://docs.bunny.net/stream/embedding)); Player.js har `play/pause/setCurrentTime/getCurrentTime` og events `ready, play, pause, ended, timeupdate, progress, seeked, error` ([playback-api](https://docs.bunny.net/stream/playback-api)). Det giver en **blød** håndhævelse:
  1. `t=<offset>` i embed-URL'en ved start, embed-tokenets udløb = varighed + 30 min (ikke 3600 blindt).
  2. En **gennemsigtig overlay** over kontrolbjælken (iframe er cross-origin, kan ikke styles); pauseknap fjernet.
  3. **Driftkorrektion** hver sekund: `forventet = serverNu + (Date.now() − klientNuVedSvar) − startsAt`; er `|getCurrentTime() − forventet| > 3 s` → `setCurrentTime(forventet)`. Fanger piletaster, `seeked` og pauser. `pause`-event → `play()` igen.
  4. **Klik for at gå ind:** browsere blokerer autoplay med lyd; lobbyen har en «Gå ind»-knap, som er brugerens gestus og starter med lyd. **Skal testes på iOS Safari og Android Chrome** — eWebinar sælger «ingen download, mobil» ([features](https://ewebinar.com/features)), og det er her flest kunder falder fra.
  - **Ærlig grænse:** en, der åbner udviklerværktøj, kan omgå det. Det kan eWebinar også (klientside). Hård håndhævelse kræver egen HLS-afspiller (hls.js) over Bunnys CDN med pull-zone-token, hvilket kræver at løsne «Block Direct URL File Access»-indstillingen i `c0-bunny.md` — **anbefales ikke i v1**.
- **Lobby** fra `starter_at − 15 min` (nedtælling, «Sessionen starter om …»); **sen indgang** op til N min (beslutning: default 10 min, indgår ved offset — tæller mod `set_procent`, men da ≥ 75 % er grænsen, er en sen ankomst efter 25 % dømt «delvist» — det er samme regel som eWebinar); **efter det** → replay-tilbud (A3.7).
- **Tid:** alt lagres UTC, vises og planlægges i `Europe/Copenhagen` (sommertid; jf. «session_tid er string hos Klaviyo», `docs/marketingmotoren.md:374`).
- **Skala:** 384 samtidige (22/9) × ét slag pr. 15 s ≈ 26 kald/s mod en edge function. Batch i klienten (30 s) + `navigator.sendBeacon` ved forlad. Umålt: Lovable Clouds grænser for concurrent edge-kald — **lastprøve i fase 6 med 500 simulerede deltagere før første rigtige session.**

### A3.4 Fremmøde og visningsdata

- **Heartbeat er sandheden**, Bunny-events er kilden i browseren: `timeupdate` → `pos_sek`. Bunnys eget analytics giver kun aggregeret watch-time/heatmap pr. video ([metrics](https://bunny.net/blog/better-streaming-insights-with-new-stream-metrics/)); at der findes per-seer-data i API, er **ikke bekræftet** — derfor egen heartbeat.
- `webinar-afslut-cron` (Bucket B, tørkørsel som standard; lås i `app_config`) kører `sessionens slut + 30 min`: regner `set_procent` (interval-union), sætter `state` Watched/Joined/Missed og `sidste_action` `WebinarFinished`, **og kalder de eksisterende `afgoerOvergang/byggFremmoede`** → Klaviyo «Deltog»/«Moedte ikke op» med samme `unique_id`-form. Dermed er hele Klaviyo-mailprogrammet (§9 i `marketingmotoren.md`) uberørt.
- **Grænsen ≥ 75 %** står i ét spejlet sted (`SET_GRAENSE_PROCENT`) — ændres ikke.
- Nye hændelser svarende til eWebinars ni handlinger: Registered (tilmelding), Joined/Left (heartbeat), WatchedWebinar/MissedWebinar/WebinarFinished (afslut-cron), WatchedReplay (replay-side), Converted (CTA-klik), Unsubscribed (`webinar-afmeld`).

### A3.5 Chat / spørgsmål til rådgiver

- Deltager skriver «Spørg Morten» i sidepanel (ikke offentlig chat v1; eWebinar kan også have privat). Skrives til `webinar_chat` via function med token; Supabase Realtime eller 5 s polling for svar (Realtime-tilgængelighed på Lovable Cloud: umålt).
- **Rådgiverinbox**: ny klokke-type `webinar_spoergsmaal` i `advisor_notifications` — **skal på en liste i `_shared/klokkeMail.ts`** (ellers fælder `klokkeMail.guard`); MORGEN-mail eller straks til `driftModtager`-modtagere under sessionen (beslutning).
- **Svar**: `webinar-chat-svar` (Bucket A, rådgiver-gate). Er deltageren online → vises straks; ellers **mail** via Mailgun (eWebinar gør det samme). Ny mail-art i `webinar_mails` kræver CHECK-migration FØR udrulning (`webinarMail.guard` dom 10) — eller en separat tabel.
- **Auto-velkomst** («Hej <fornavn>, skriv dit spørgsmål her …») og auto-svar efter N min uden rådgiver (som eWebinar). AI-forslag til svar (kladde til rådgiveren, aldrig auto-send) i v2 — præcedens for LLM: `handout-ai-feedback/index.ts:139-146` (Lovable AI Gateway, `google/gemini-2.5-flash`).

### A3.6 CTA til ansøgning på tidspunkt X

- Interaktionstidslinjen bor i `webinarer.interaktioner`; klienten tegner overlay, når det drift-korrigerede `getCurrentTime()` passerer `pos_sek`.
- CTA-knappen linker til `https://app.theboardroom.dk/ansoeg?kilde=webinar&utm_source=webinar&utm_medium=...` — `afgoerKilde` læser `?kilde=` FØRST og kilden er en CHECK med seks ord (`CLAUDE.md`, afsnittet «Kilden»): **tilføj IKKE et nyt ord**; brug utm-felter til session/CTA. Klik logges i `webinar_interaktion_svar` FØR redirect (`sendBeacon`).
- «Ikke klar til at ansøge endnu» logges som eget svar (tragten `docs/webinaret-og-annoncerne.md:358` bruger begge).
- **Brobygning til dashboardet:** dommen læser i dag fritekst (`webinarDashboard.ts:262-275`). Fase 3 lader platformen skrive **samme tekstformat** i en afledt kolonne, så `/webinar` og delingen virker uændret; en ren struktureret læser kan tage over senere (regel: «et felt, vi ikke selv sætter, er en observation» — nu sætter vi det selv, og kan gøre det til en nøgle).
- **Timing**: eWebinars tidspunkter for CTA'erne står kun i deres editor. **Skal aflæses manuelt (screenshot) i fase 0** — ikke fundet i repo eller via API.

### A3.7 Replay-politik (beslutning)

Tre muligheder: (a) **ingen replay** — som Jonas 28/9 (optagelsen sendes ikke, siden er taget ned; `docs/marketingmotoren.md:455`, `webinar-mail` lover ingen optagelse); (b) **replay som «ny session»**: den, der mødte ikke op, tilmelder sig næste dato (nuværende linje i mailen «Kan du ikke alligevel? Så meld dig til en anden dag»); (c) **on-demand med interaktion** (eWebinars «Replay»). Anbefaling: **(b)** — det er allerede vedtaget; motoren skal kunne holde en session pr. uge uden ekstra arbejde. `WatchedReplay` udgår. Hvis (c) senere ønskes, er tokenet + samme afspiller nok, uden servertidssynk.

### A3.8 Tilmelding og sitet

- Ny `webinar-tilmeld` (offentlig POST, **rate-limit + Cloudflare Turnstile**, e-mailvalidering, dublet-tjek på `(lower(email), session_id)`), returnerer join-token (vises i mailen; kun SHA-256 gemmes). Skriver `webinar_tilmeldinger` med `utm_*`/`fbclid`/`origin`/`referrer` fra skjulte felter (samme kolonner som eWebinar-tilmeldingen fylder i dag).
- **Sitet (topix.dk, andet repo):** widgetten `.ewebinar__RegisterButton` og `/webinar/tak?data=` skal erstattes af egen formular og tak-side; GTM-triggeren `ewebinar_form_submit` (Klaviyo-identify hænger på den, `tracking.md:201`) skal genskabes med samme dataLayer-navn — eller Klaviyo-identify flyttes serverside.
- **Tracking:** «Visit Registration»/«Fuldfør registrering» (eWebinars pixel) skal genskabes på egen side (Meta pixel + CAPI m. `event_id` for dedup; `docs/tracking.md` er det ENE dokument — læses FØR ændring). Samtykke: eWebinar har ingen samtykkeboks; den nye side skal følge topix.dk's banner (default `denied`).
- **`.ics`**: egen fil via `kalenderfil.ts`-mønstret (METHOD:REQUEST, egen UID/ORGANIZER, SEQUENCE); erstatter `mimeInvitation.ts`' hentning fra eWebinar. **Det lukker samtidig det åbne-ics-fund** (ingen offentlig, tæller-baseret URL; egen fil vedhæftes, aldrig linkes).

### A3.9 Migration af eksisterende tilmeldinger — den svære del

- **Data**: 691 rækker + `webinar_haendelser` ligger allerede hos os. Der er intet at «flytte» for historikken; skal blot markeres `kilde_system = 'ewebinar'`.
- **Fremtidige sessioner registreret i eWebinar** (fx 13/10: 317+ personer; `docs/webinaret-og-annoncerne.md` §7f): deres kalenderpost har **eWebinars UID/ORGANIZER og eWebinars personlige join-link**. **En fremmed ORGANIZER kan vi ikke opdatere** (kalendere afviser typisk opdateringer fra en anden organizer — dette er min viden om kalenderprotokollen, ikke målt her). Slukkes eWebinar, før sessionen er afholdt, er linket i deres kalender dødt.
  - **Konsekvens:** eWebinar må ikke opsiges, før den sidste session med eWebinar-tilmeldte er afholdt. Nye datoer efter det kan køre på platformen fra dag ét; eWebinar-tilmeldte til senere datoer får en **ny invitation** (ny UID) + en mail «vi har skiftet system, brug dette link» — dubletrisiko i kalenderen accepteres og forklares.
- **Afmeldte** skal føres over 1:1 (`webinar_afmeldinger` findes; `webinarMailDom.ts:368`). **En tilmeldt, der er afmeldt hos eWebinar, må aldrig modtage noget fra os.**

### A3.10 Fase- og omfangsplan (skøn, ikke målt; én udvikler)

| Fase | Indhold | Skøn | Kan udrulles alene? |
|---|---|---|---|
| **0 Recon** | Hent kildevideo (Cloudflare Stream/eWebinar-upload), CTA-tidslinje, chat-eksport, mål brug af chat; Bunny-bibliotek til webinar; beslutninger A4 | 2–3 dage | ja |
| **1 Grundlag** | Migrationer (sessioner, kolonner, token), `webinar-tilmeld`, egen `.ics`, `join_link` = egen URL i mailcronen bag flag; 10-min-mail | 1–1,5 uge | ja, bag flag |
| **2 Afspiller + fremmøde** | `webinar-afspil`, lobby, drift-korrektion, heartbeat, `webinar-afslut-cron` → eksisterende Klaviyo-hændelser | 1,5–2 uger | skygge-session |
| **3 Interaktioner** | CTA + stjerner + poll, logning, tekstadapter til dashboard | 1 uge | ja |
| **4 Chat** | Spørgsmål, rådgiverinbox, mail-svar, auto-velkomst | 1–1,5 uge | ja |
| **5 Admin + site + tracking** | Admin-UI (opret webinar + sessioner + tidslinje), ny formular på topix.dk, pixel/CAPI-genskabelse | 1–1,5 uge (+ site-repo) | ja |
| **6 Parallelkørsel + cutover** | se A5 | 2–4 uger kalendertid | — |
| **Sum** | | **ca. 6–9 ugers udvikling** | |

### A3.11 Risici (rangeret)

1. **Kalenderposter/join-links til allerede tilmeldte** (A3.9) — kan give døde links til hundreder. Afbødning: opsig aldrig før sidste eWebinar-session er afholdt.
2. **Mobil/autoplay/iframe** — den blødere «ingen spoling» kan svigte på iOS; kan give «det virker ikke»-mails i sessionens første minutter. Afbødning: lobbyens klikknap, test på rigtige enheder, reserve: rådgiver kan sende «åbn i browser»-link.
3. **Belastning på ét tidspunkt** (alle 384 i samme sekund) mod edge functions og Supabase — umålt. Lastprøve.
4. **Annoncemåling** — eWebinars pixel er kilden til «Fuldfør registrering»; mangler hændelsen i Metas optimering, falder leveringen. Genskab (og verificér i Events Manager) FØR cutover.
5. **Bunny-indstillingerne** — direct play/MP4 fallback må ikke løsnes for at få spoling-kontrol; blødt design undgår det.
6. **Scope-creep** — eWebinar har 25+ interaktioner; vi bygger tre. Skriv det ned.
7. **Datavarighed** — eWebinar-eksport før opsigelse: registranter er hos os, men **chat, kommentarer og svarlister ligger kun dér** (umålt omfang).

## A4. Beslutninger til Jonas før fase 1

1. `ewebinar_id`: præfiks `P-` nu, omdøbning efter opsigelse — ok?
2. Sen indgang: hvor mange minutter?
3. Replay: (b) ny session — ok? (kræver ingen ekstra bygge)
4. Chat: kun rådgiver-svar, eller også synlige svar til alle?
5. Skal Slack-notifikation af spørgsmål med (eWebinar har det)?
6. Hvilken eWebinar-plan er I på i dag (Level 1 pr. Capterra)? og hvor mange publicerede webinarer/sessioner bruges (umålt)?
7. Er kildevideoen tilgængelig som fil (Cloudflare Stream-embedden fra optagelsessiden tyder på det, umålt)?

## A5. Hvad skal parallelkøres, før eWebinar opsiges

Bevis-krav (hver har et konkret svar, kun ny kode kan give):

1. **Skygge-session:** én rigtig session (fx 20 interne + frivillige) kører på platformen SAMTIDIG med eWebinar-sessionen; samme e-mail i begge. Sammenlign `set_procent` pr. person: afvigelse ≤ 5 procentpoint for ≥ 90 %.
2. **Synk:** 3 enheder (iPhone Safari, Android Chrome, desktop) viser samme videotidspunkt ±2 s (læses af `webinar_heartbeats.pos_sek` mod serverur).
3. **Klaviyo-paritet:** «Deltog»/«Moedte ikke op»-hændelser fra afslut-cron matcher `unique_id`-formen; `klaviyo_haendelser` viser dem uden dubletter (`docs/marketingmotoren.md` §2).
4. **Mails:** alle syv arter + 10-min-mail sendt til intern testliste i tørkørsel, derefter `email` + `art`-prøven; `.ics` åbnet i Apple Mail, Gmail, Outlook.
5. **Tracking:** «Fuldfør registrering» set i Events Manager fra egen side; dedup-rate målt.
6. **Afmelding:** en intern testadresse afmelder → ingen mails, `klaviyo_afmeldinger` har række med `kilde` der peger på platformen.
7. **CTA-tragt:** platformens CTA-tal for testsessionen stemmer med `webinar_interaktion_svar`; dashboardet (`/webinar`) og delingen viser tallet uændret.
8. **Lastprøve** 500 samtidige joins; ingen 5xx i function-log.
9. **Rulleback:** eWebinar-abonnementet bevares ≥ 1 måned efter cutover; eksport af chat/svar taget.

---

# DEL B — AUTOMATISKE REFERATER

## B1. FUND — hvordan events holdes i dag

- **Ingen Zoom/Teams fundet.** Søgning på zoom, teams.microsoft, jitsi, whereby, livekit, daily.co i `src`, `supabase`, `docs` giver kun UI-biblioteksfalske træf. **Live events holdes i Google Meet:** editorens hjælpetekst/placeholder `https://meet.google.com/…` (`src/components/hjemmebane/admin/editors/EventEditor.tsx:319-328`), valideret som `https://`-URL (`:121, 158`), knapmærket «Google Meet» (`src/components/hjemmebane/events/EventDetailView.tsx:244-262`).
- **Linket sættes i hånden.** `events.meet_url` er fri tekst; ingen kode opretter Meet-rum eller kalder Google (ingen `googleapis`/OAuth-kode i `supabase/functions`). Ansøgningssamtalerne er separate: **Calendly opretter booking + Meet-link** (`supabase/functions/ansoegning-samtale/index.ts:10-17`, `_shared/calendlyApi.ts`).
- **Events-tabellen:** `supabase/migrations/20260804120000_hjemmebane_content_layer.sql:288-303` — `id, title, description, kind (live_sparring|workshop|andet), starts_at, ends_at, meet_url, capacity, recording_item_id UUID → content_items ON DELETE SET NULL, status (draft|published|cancelled|completed)`; tilmeldinger `event_registrations` `:350-` (event_id, user_id, registered_at, cancelled_at). Medlemmer ser alt undtagen kladder. Der er **ingen kolonne til referat/transskription**. Hvordan et event bliver `completed`, er **ikke fundet** i functions (ingen cron sætter det; må være manuelt — umålt).
- **Faserne** (`eventMeetPhase`: live fra 15 min før til ende; `src/lib/hjemmebane/eventPhase`) styrer Meet-knappen; «after» viser optagelsen.
- **Påmindelser:** `supabase/functions/event-reminders/index.ts:137-163` (i morgen + om en time, til `response='attending'`); **publicering:** `publish-event/index.ts:1-20` skriver klokke/mail til aktive medlemmer.
- **Optagelser knyttes allerede til events — manuelt.** `events.recording_item_id` peger på et publiceret `content_items` (episode/video); EventEditor:337-346 («Efter afholdelse: peg på episoden/videoen med optagelsen (B8)»); kandidaterne hentes i `adminContentApi.ts:192`, vises via `getRecordingItem` (`akademiApi.ts:264-273`) i `EventDetailView.tsx:97-107, 270-310` med `HbVideoEmbed` (no-op callbacks, skriver ikke Akademi-progression). Kun `media_provider = 'bunny'` afspilles; `external` giver link. Docs-notat: `docs/hjemmebane/c0-datamodel.md:95, 202`; `docs/indhold-recon.md:280`.
- **Bunny-upload-flow (manuelt i admin):** browseren beder `bunny-content-admin` (action `create`) om et video-GUID + TUS-signatur (`sha256(libraryId+apiKey+expires+guid)`, `index.ts:93-113`), uploader direkte til `https://video.bunnycdn.com/tusupload` (`HbBunnyPicker.tsx:10, 58-72`), poller `video-info` (`index.ts:121`), og skaber et content-item med `bunny_video_id`. Secrets: `BUNNY_STREAM_LIBRARY_ID/API_KEY/TOKEN_AUTH_KEY` (Akademiet) og `BUNNY_CHAT_*` (chat). **Ingen Bunny-webhook, ingen transskription, ingen captions** er brugt nogen steder (`grep caption|transcript` giver 0 i functions). Ingen serverside-upload; ingen kode henter noget fra Google.
- **Nogen som helst referat-tanke i repoet:** «Referat» findes kun i mangellisten som et ønske («første session efterlader intet spor — ingen note, intet referat», `docs/mangelliste-gennemgang-22-09.md:112`, `docs/mangelliste-lister-22-09.md:84`) og som designhul (`docs/OVERLEVERING.md:6596`).
- **AI i huset i dag:** Lovable AI Gateway (`ai.gateway.lovable.dev`, model `google/gemini-2.5-flash`) i `handout-ai-feedback/index.ts:139-146`, `ai-financial-feedback/index.ts:229-237` m.fl.; secret `LOVABLE_API_KEY`. Hvor gatewayen behandler data (region/DPA), er **umålt**.
- **Persondata:** ansøger-teksten `src/lib/ansoegning/persondata.ts`; **ingen medlemstekst om optagelse/AI er fundet** (umålt om den ligger i sitet/vilkår).

## B2. RESEARCH

### B2.1 Hente optagelsen automatisk

**Google Meet** (I bruger Meet):
- Meet REST API giver `conferenceRecords.recordings` (MP4), `.transcripts` og smart notes; **alle artefakter gemmes i mødets organisators Drive** ([overview](https://developers.google.com/workspace/meet/api/guides/overview), [artifacts](https://developers.google.com/workspace/meet/api/guides/artifacts)); recording peger på `DriveDestination` (`file` = Drive-fil-id, `exportUri`); artefakter er «typisk klar kort efter mødet»; **transcript-entries slettes 30 dage efter mødet**.
- **Hændelser:** Workspace Events API → Pub/Sub. Typer bl.a. `google.workspace.meet.conference.v2.ended`, `recording.v2.fileGenerated`, `transcript.v2.fileGenerated`, `smartNote.v2.fileGenerated`; abonnement på **bruger-ressourcen** (`//cloudidentity.googleapis.com/users/USER`) modtager events for alle rum, brugeren ejer — ét abonnement dækker Jonas' events ([events-meet](https://developers.google.com/workspace/events/guides/events-meet)). Payload bærer kun ressourcenavne; man henter selv. Abonnementernes levetid/fornyelse er **ikke læst** — slås op ved bygning.
- **Auth:** brugerens OAuth eller domain-wide delegation (kræver Workspace-admin).
- **Edition:** transskription kræver Business Standard eller højere ([Workspace-listen](https://workspaceupdates.googleblog.com/2025/03/more-languages-for-recorded-captions-and-transcripts-in-google-meet.html), [hjælpen](https://support.google.com/meet/answer/12849897)); optagelse følger Business-tiers. **Hvilken edition Jonas har: umålt.**
- **DANSK:** Meets egne transskripter dækker (pr. Googles sider hentet 29/9) engelsk, fransk, tysk, italiensk, japansk, koreansk, portugisisk og spansk — **ikke dansk**; Geminis «Take notes for me» er ligeså listet uden dansk ([sprog](https://support.google.com/meet/answer/14925782)). **Konsekvens: brug KUN Meets MP4-optagelse og transskribér selv.** Siderne kan være ældre end virkeligheden — slå op igen ved bygning.

**Zoom** (hvis det nogensinde skifter): `recording.completed`-webhook + Get Meeting Recording API, VTT-transskript, kræver betalt plan og slået-til lydtransskription; **kilden siger kun engelsk understøttes** ([Recall.ai](https://www.recall.ai/blog/zoom-transcript-api)) — kan være forældet. Ikke relevant nu.

**Praktisk risiko ved store MP4'er:** en 60-min-optagelse kan være 0,5–2 GB; en edge function kan ikke sikkert streame det (execution/memory-grænser er ikke målt i repoet). Bunnys «Fetch video» kan trække fra en URL, men Drive kræver auth-header — om Bunny kan sende headers er **ikke verificeret** (ikke bekræftet). Alternativ: lille worker (fx Cloudflare/Fly) der streamer Drive → Bunny-TUS.

### B2.2 Transskription

| Valg | Dansk | Pris | Databeliggenhed | Bemærkning |
|---|---|---|---|---|
| **Bunny Transcribe AI** | **Ikke bekræftet** — Bunny siger 56–57 sprog, Danish ikke nævnt på de sider jeg kunne læse; model «Whisper» ([blog](https://bunny.net/blog/introducing-transcribe-ai-for-bunny-stream/), [produkt](https://bunny.net/stream/transcribe-ai/)) | 0,10 USD pr. sprog-minut ([pricing](https://bunny.net/docs/stream/pricing)) | Bunny (EU-selskab) — region for AI: umålt | Webhook-status 9 `CaptionsGenerated`, 10 `TitleOrDescriptionGenerated` ([webhooks](https://docs.bunny.net/stream/webhooks)) — **giver hele pipelinen inde i Bunny**; `docs.bunny.net`-detaljesiderne (API-body, sprogliste) kunne ikke læses herfra |
| **OpenAI transskription** (Whisper/gpt-4o-transcribe) | Støtter dansk; men **basis-Whisper-large-v3 har 27,5 % CER på samtale-dansk** (mod 10,1 % læst) på CoRal-v3-testen ([HF: Røst](https://huggingface.co/CoRal-project/roest-v3-whisper-1.5b)) | gpt-4o-transcribe ca. 0,0045 USD/min ([sammenligning](https://www.digitalapplied.com/blog/openai-gpt-transcribe-stt-model-comparison-2026)) | EU-projekt (Europe-region) findes med nul lagring, men **kun for nye projekter, og om lyd-endpoints er omfattet, er ikke bekræftet** ([OpenAI](https://openai.com/index/introducing-data-residency-in-europe/)) | Ingen taleridentifikation i gpt-transcribe (særskilt diarize-model) |
| **ElevenLabs Scribe** | Dansk understøttet, 99 sprog, speaker-diarization, tidsstempler; egen FLEURS-WER 3,1/4,1 % (interne tal, ikke Dansk-samtale) ([ElevenLabs](https://elevenlabs.io/speech-to-text/danish)) | ikke læst | EU-region: **ikke bekræftet** | Diarization er en fordel for «hvem sagde hvad» i sparring |
| **Røst (Alexandra Instituttet/CoRal)** | Bygget til dansk: **11,6 % CER på samtale** (læst 4,5 %), klart bedre end basis-Whisper; OpenRAIL-licens (kommerciel brug tilladt, forbud mod bl.a. biometrisk identifikation) ([HF](https://huggingface.co/CoRal-project/roest-v3-whisper-1.5b)) | egen GPU | fuld kontrol (selv-hostet) | Kræver GPU-hosting — passer ikke på Supabase edge; senere valg |
| **Meet/Gemini-transskript** | **Nej** (B2.1) | — | — | Udgået |

**Læsning:** dansk *samtale* med flere talere, tal og fagord (regnskab, moms, EBITDA) er den hårde case. **Forvent fejl i navne, tal og fagtermer; derfor rådgivergodkendelse og en dom i koden, der afviser tal i referatet, som ikke står i transskriptet** (samme ånd som `udkastVaern`/«MANGLER er en værdi»). Ingen kilde giver dansk-samtale-WER for de kommercielle API'er — **mål selv:** tag 3 rigtige sparring-optagelser, håndrens 5 min pr. stk. som facit, kør Bunny/OpenAI/Scribe, beregn WER, og vælg på tallet (og dataregion). Det er fase 0 i B3.

### B2.3 Referat og bullets med LLM

- Modellen læser transskript + event-metadata (titel, dato, deltagerantal) og giver **struktureret JSON**: resumé (3–5 sætninger), hovedpunkter, aftalte handlinger/opgaver, kapitler med tidsstempel, emner. Krav: hvert punkt bærer et **tidsstempel** (så rådgiveren kan slå det op), tal og navne skal kunne findes ordret i transskriptet, ellers `MANGLER`. Prompten versioneres; modellen og `prompt_version` gemmes ved hvert udkast.
- **Lange transskripter:** 60 min tale ≈ 9–10.000 ord; passer i én prompt til moderne modeller, ellers kapitel-vis (map-reduce).
- **Præcedens i huset:** `handout-ai-feedback` og `ai-financial-feedback` kalder Lovable AI Gateway m. `google/gemini-2.5-flash` — men **transskripter indeholder medlemmers virksomhedstal og navne**; brug en leverandør med databehandleraftale og EU-region, ikke bare den bekvemme gateway (umålt hvad den tilbyder).
- **Anonymisering:** sparring handler ofte om ét medlems egne tal. Standard: referatet nævner ikke virksomhedsnavne/tal, medmindre rådgiveren aktivt har slået det til.

### B2.4 GDPR og AI

- **Oplysningspligt (art. 13):** deltagerne skal vide, at der optages, hvorfor, hvem der modtager (Google, Bunny, transskriptions-/LLM-leverandør), hvor længe der opbevares, og retten til indsigt/sletning/indsigelse. **Fire steder:** (1) ved tilmelding til eventet, (2) i eventbeskrivelsen, (3) mundtligt/skriftligt ved start (Meet viser selv «optagelse»-banner — bekræft), (4) i privatlivspolitikken. Jeg har **ikke** fundet en medlemstekst om optagelse/AI i repoet.
- **Behandlingsgrundlag:** typisk legitim interesse (art. 6(1)(f)) for at give medlemmer et referat, hvor optagelsen er kendt og forventelig — men når optagelsen **vises til andre medlemmer** og indeholder én persons virksomhedsdata, er samtykke eller en tydelig fravalgsmulighed sikrere. Det er en juridisk vurdering; jeg er ikke jurist, og **Datatilsynets afgørelse jeg fandt om offentliggørelse af lyd på YouTube gjaldt en rent privat aktivitet og er ikke relevant her** ([afgørelse](https://datatilsynet.dk/afgoerelser/afgoerelser/2020/aug/offentliggoerelse-af-lydoptagelse-paa-youtube)). Få en jurist til at læse teksten (legal-skill kan bruges til udkast).
- **Databehandlere:** Google (Meet/Drive), Bunny, transskriptionsleverandør, LLM-leverandør — DPA'er, tredjelandsoverførsler og underdatabehandlere skal dokumenteres; vælg EU-regioner (A/B2.2).
- **Opbevaring:** slet rå transskript efter fx 90 dage (Meet-entries slettes selv efter 30 dage); behold godkendt referat. Optagelsen selv: politik (fx 12 mdr.), som `webinar_delinger`-cronen.
- **AI-forordningen art. 50:** gennemsigtighedspligterne trådte i kraft 2/8-2026 og gælder deployers uden udsættelse; en intern rådgivergodkendt tekst er næppe direkte omfattet af de navngivne tilfælde (chatbot, deepfake, «offentlig interesse»-tekst), men **mærk referatet «Lavet med AI, gennemset af <rådgiver>»** som god praksis ([Morgan Lewis](https://www.morganlewis.com/blogs/sourcingatmorganlewis/2026/08/eu-ai-acts-transparency-rules-what-went-into-effect-on-2-august)). Vurdering, ikke juridisk rådgivning.
- **Ret til at slippe:** en deltager kan bede om at få sit indslag fjernet → vi må kunne slette optagelsen/referatet og gen-udgive uden; byg «slet»-knap fra start.

## B3. PLAN — møde slut → referat på eventet

### B3.1 Flow

1. **Kilde til optagelsen** (to veje, samme kø):
   - **v1 (manuel, billig):** rådgiveren uploader MP4'en via det eksisterende TUS-flow, men **knyttet til et event** (nyt trin i EventEditor: «Upload optagelse» i stedet for kun at pege på et item).
   - **v2 (automatisk):** Workspace Events-abonnement på Jonas' Google-konto → Pub/Sub push til ny function `meet-optagelse-webhook` (Bucket C, verificér Pub/Sub's OIDC-token FØR parsing) → `recording.fileGenerated` → henter Drive-fil → Bunny. **Match til event** via mødekode (regex på `meet_url`: `abc-defg-hij`) mod `conferenceRecords.space.meetingCode`; fald tilbage til tidsvindue (`starts_at ± 30 min`) + rådgiverbekræftelse; **umatchede optagelser står i en kø, aldrig i et vilkårligt event.**
2. **Bunny:** opret video i eget bibliotek/collection «events» (GUID + titel), upload, `Finished` (status 3) via **Bunny-webhook** (`bunny-webhook`, Bucket C, HMAC-SHA256 med bibliotekets read-only nøgle over RÅ body; headers `X-BunnyStream-Signature*`, [webhooks](https://docs.bunny.net/stream/webhooks)).
3. **Transskription:** enten Bunny (`CaptionsGenerated`, VTT) eller egen STT (B2.2) — valg efter WER-prøven. Gem i `event_transskripter` (event_id, sprog, vtt/tekst, leverandør, model, `sha256`), RLS: kun rådgivere.
4. **Referatudkast:** `event-referat-generer` (Bucket B, tørkørsel som standard; lås i `app_config`) → LLM → `event_referater` (status `udkast`, JSON, model, prompt_version, transskript-hash). **Værn før lagring** (ren, testet dom): alle tal/navne skal findes i transskript, ellers `MANGLER`; ingen virksomhedsnavne uden rådgiverflag.
5. **Rådgivergodkendelse (default, altid i v1):** klokke `event_referat_klar` (ny type — skal på en liste i `_shared/klokkeMail.ts`, ellers fælder `klokkeMail.guard`), redigering i EventEditor (resumé, punkter, kapitler, fjern afsnit), knapper «Godkend og udgiv» / «Afvis».
6. **Udgivelse:** `event-referat-udgiv` (Bucket A, rådgiver-gate) opretter/aktiverer `content_items` (episode/video, `media_provider='bunny'`), sætter `events.recording_item_id`, `events.status = 'completed'`, skriver `event_referater.status='udgivet'`, og giver de tilmeldte besked via `writeNotificationToMany` (mønster: `publish-event`). `EventDetailView` viser under optagelsen: resumé, punkter, kapitler (klik → `setCurrentTime`), «AI-genereret, gennemset af X».
7. **Aldrig auto-udgivelse** før WER, fejlrate og fortrolighed er bevist på mindst 5 events.

### B3.2 Datamodel (forslag)

`event_optagelser` (event_id, kilde `manuel|meet`, `bunny_video_id`, status, fejl, tider) · `event_transskripter` · `event_referater` (udkast/godkendt/udgivet/afvist, `godkendt_af`, `godkendt_at`) · `events`: ingen ændring nødvendig ud over evt. `referat_publiceret_at`. Alle nye tabeller: service-role-skrivning, rådgiver-læsning, medlemmer kun det udgivne (via `events`-forbundet view/policy; **`AS RESTRICTIVE` hvis noget skal skjules**).

### B3.3 Faser og omfang (skøn, ikke målt)

| Fase | Indhold | Skøn |
|---|---|---|
| **0 Måling** | 3 rigtige optagelser → Bunny / OpenAI / Scribe → WER på 5 min facit; bekræft Bunnys danske sprog og Workspace-edition; vælg leverandør + DPA | 1–2 dage + Jonas' tid |
| **1 MVP (manuel upload)** | tabeller, `bunny-webhook`, transskription, `event-referat-generer` m. værn og tests, EventEditor-panel til godkendelse, visning på eventet | 6–8 dage |
| **2 Auto-hent fra Meet** | OAuth/DWD, Events-abonnement + fornyelse, Pub/Sub-webhook, Drive→Bunny-streaming (worker), match-kø | 5–8 dage + Google-opsætning |
| **3 Gør det pænt** | kapitler i afspilleren, medlemsbesked, retention-cron, slet-flow | 3–4 dage |
| **GDPR/tekst** (parallelt) | oplysning ved tilmelding + eventtekst + privatlivspolitik + DPA'er | Jonas + jurist |

### B3.4 Risici

1. **Dansk kvalitet i samtale** — dokumenteret svag for basis-Whisper (27,5 % CER); godkendelse er obligatorisk, ikke pynt.
2. **Fortrolighed** — medlemmers egne tal i en optagelse, der vises til alle medlemmer. Standard: kun tilmeldte kan se; anonymiseret referat; samtykke ved tilmelding.
3. **Store filer** gennem edge functions — worker eller manuel v1.
4. **Google-afhængighed** — edition, DWD-godkendelse, abonnementsfornyelse; derfor er v1 uden Google.
5. **Match** af optagelse til event ved ad hoc-møder.
6. **Prisen** er lille (Bunny 0,10 USD/min: en 60-min-optagelse ≈ 6 USD; LLM-kald cents), ikke en beslutningsfaktor.

## B4. Beslutninger til Jonas

1. Start med v1 (manuel upload) — ok? Auto-hent først når fase 1 har bevist værdi (regelsættet §4a).
2. Må optagelsen ses af ALLE medlemmer, eller kun tilmeldte til eventet?
3. Skal referatet være med virksomhedsnavne/tal, eller anonymiseret som standard?
4. Hvilken Workspace-edition har I, og er «optag» slået til for jeres rum?
5. Hvilken leverandørprofil: alt-i-Bunny (hvis dansk virker), eller egen STT (Scribe/OpenAI-EU) + LLM med DPA?

---

# Kilder (hentet 29/9-2026)

eWebinar: https://ewebinar.com/features · /features/scheduling · /features/interactions · /features/chat · /features/analytics · /features/notifications · /features/access-control · /features/registration · /features/ai · https://ewebinar.com/help/webhook · https://www.capterra.com/p/213778/eWebinar/
Bunny: https://docs.bunny.net/stream/embedding · https://docs.bunny.net/stream/playback-api · https://docs.bunny.net/stream/webhooks · https://bunny.net/docs/stream/pricing · https://bunny.net/blog/introducing-transcribe-ai-for-bunny-stream/ · https://bunny.net/stream/transcribe-ai/ · https://bunny.net/blog/better-streaming-insights-with-new-stream-metrics/ (docs.bunny.net/stream/transcribing m.fl. redirecter kunne ikke hentes)
Google: https://developers.google.com/workspace/meet/api/guides/overview · /guides/artifacts · https://developers.google.com/workspace/events/guides/events-meet · https://workspaceupdates.googleblog.com/2025/03/more-languages-for-recorded-captions-and-transcripts-in-google-meet.html · https://support.google.com/meet/answer/14925782 · https://support.google.com/meet/answer/12849897
Zoom: https://www.recall.ai/blog/zoom-transcript-api
STT: https://huggingface.co/CoRal-project/roest-v3-whisper-1.5b · https://elevenlabs.io/speech-to-text/danish · https://www.digitalapplied.com/blog/openai-gpt-transcribe-stt-model-comparison-2026 · https://openai.com/index/introducing-data-residency-in-europe/
Jura: https://www.morganlewis.com/blogs/sourcingatmorganlewis/2026/08/eu-ai-acts-transparency-rules-what-went-into-effect-on-2-august · https://datatilsynet.dk/afgoerelser/afgoerelser/2020/aug/offentliggoerelse-af-lydoptagelse-paa-youtube

# Ting, jeg ikke har målt (samlet)

Prod-data (antal sessioner/webinar_id, chat-brug hos eWebinar) · eWebinar-plan og CTA-tidspunkter · sitets kode (topix.dk-repo) · Bunny-biblioteket (auto-transskription slået til? dansk?) · Jonas' Workspace-edition og om Meet-optagelse er tændt · om Lovable AI Gateway har EU/DPA · edge-function-grænser (tid/hukommelse/concurrency) · Realtime på Lovable Cloud · Workspace Events-abonnementers levetid.

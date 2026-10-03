# Webinarmotoren

Husets egen lead-motor, der skal erstatte eWebinar. Spec'en er `docs/webinarmotor-spec.md` (skrevet 30/9-2026 som `~/topix-financial-webinarmotor-spec.md`; flyttet ind uændret 3/10-2026). Den interaktive pakke er specificeret i §9. Dette dokument er bogføringen: hvad der er bygget, hvad der står i drift, og hvad der mangler.

**Status 3/10-2026 (efter denne bogføring):** skive 1–3 (v2-grenene), `ti_minutter` (§4), værtskonsollen (§7.7), ansøgningskoblingen (§7.8), tilmeldingernes CAPI (#1262, §7.9) og chattens bagende (§7.10) er bygget på stablede grene; ingen af motorens migrationer er kørt, og intet er udrullet. **#1262 (`CompleteRegistration` bag låsen `webinarmotor_meta_aktiv`) skal bygges om til samtykke-krydset** (rådet 3/10) — se §2-rækken om Meta-pixlen. Den interaktive pakke er SPEC, ikke kode (§9).

**Status 30/9-2026 (historik): skive 1 (motoren) er bygget på grenen `feat/webinarmotor-skive1` (PR #1158), skive 2 (seerens flade, §6) på `feat/webinarmotor-skive2` (PR #1161) oven på den, og skive 3 (det, der mangler til en INTERN prøvesession, §7) på `feat/webinarmotor-skive3` oven på skive 2 (med main flettet ind for #1162/#1167).** Intet er merget, ingen migration er kørt, og intet er udrullet. Runbooken for den interne prøvesession står i §7.3.

**Nummereringen:** Jonas' «skive 2» (30/9) er seerens flade — spec'ens skive 3 og dele af skive 4. Jonas' «skive 3» (30/9, §7) er dele af spec'ens skive 2 (motor-cron og mails, §4) og en enkel udgave af spec'ens skive 6 (opsætningen).

**2/10-2026 — grenen `feat/webinarmotor-skive1-v2`:** main flettet ind (ingen adfærdsændring), og migrationen er OMDØBT `20260930100000_webinarmotor_skive1.sql` → `20261003010000_webinarmotor_skive1.sql`. Grunden: main har kørte migrationer helt op til `20261002276000`, og en ukørt fil må aldrig sortere før en kørt (husreglen; `metaSend.guard` dom 11 — `ukoerteFoerKoerte`). Indholdet er uændret.

**2/10-2026 — grenene `feat/webinarmotor-skive2-v2` og `feat/webinarmotor-skive3-v2`:** stablet oven på skive1-v2 (merge, ingen rebase). Skive 3's to migrationer er omdøbt af samme grund: `20260930160000_webinarmotor_skive3.sql` → `20261003030000_webinarmotor_skive3.sql` og `20260930161000_webinar_motor_cron.sql` → `20261003031000_webinar_motor_cron.sql`. Rækkefølgen er uændret (skive 1 → skive 3 → cron), og alle henvisninger i dette dokument, CLAUDE.md, SECURITY_BASELINE.md, koden og værnene er flyttet med. Eneste indholdsændring i en migration: kommentarteksten (`COMMENT ON`) i skive 1's migration og filhovederne i skive 3's to nævner de nye navne.

## 1. Arkitektur i én skærm

```
topix.dk-formular ──POST──▶ webinar-tilmeld ──▶ webinar_tilmeldinger (kilde_system = platform, ewebinar_id = P-<id>)
                               │  værn: origin · honningfelt · IP-dagshash-loft          │
                               └─▶ svar: token (én gang) + /w/<slug>?t=<token>             ▼
                                                                          webinar-mail-cron · klaviyo-profil-cron ·
                                                                          meta-send-cron · /webinar (læser UÆNDRET)
seerens side ──POST {t}──▶ webinar-rum  ──▶ rum, position, signeret Bunny-embed, aktive interaktioner
             ──GET ?t&handling=ics──▶ husets egen .ics
             ──POST {t, puls[], handlinger[]}──▶ webinar-puls ──▶ webinar_puls_skriv (én transaktion)
                                                                   ├ webinar_deltagelser.set_bits (bitmap, 5 s)
                                                                   ├ webinar_pulser (rå, 90 dage)
                                                                   └ webinar_tilmeldinger.set_procent (eWebinars skala)
```

**Principperne:**
- **Serveren ejer uret.** `ur.ts:positionDom(session, nuMs)` giver rummet (`foer_lobby → lobby → intro → afspilning → exitrum → afsluttet`, eller `aflyst`) og den forventede position. Klienten styrer efter den (`spoledom`) og afgør aldrig, hvad der er set.
- **Set = en bitmap over 5-sekundersstykker.** `puls.ts:pulsDom` krediterer kun strækket siden forrige puls fra samme enhed og kun når ankeret spillede, Δpos ≤ Δserverur + 5 s og |pos − forventet| ≤ 10 s. Bits OR'es, så `set_procent` aldrig går ned, og to enheder eller en dublet aldrig giver dobbelt kredit. `set_procent = round(least(100, least(stykker · 5, varighed) · 100 / varighed), 2)` står ordret både i TS og i SQL.
- **Paritet med eWebinar.** Motoren skriver de samme kolonner i `webinar_tilmeldinger`, med eWebinars ord. Dommene (`webinarDom`), mailcronen, Klaviyo, Meta og `/webinar` læser rækkerne, som de gør i dag.
- **Deltagertokenet er en HMAC** (`token.ts`): `base64url(uuid ‖ version).base64url(HMAC-SHA256(secret, "<uuid>:<version>"))`. Tokenet gemmes aldrig. Mailcronen kan bygge linket igen, og `token_version += 1` tilbagekalder det. Secret'en `WEBINAR_JOIN_SECRET` læses kun i `_shared/webinarDeltagerAuth.ts`.
- **Seerne bruger ikke Realtime** (spec §D3: Pro-loftet er 500 forbindelser). Værtens svar, «i rummet» og tidslinjens version kommer med i pulsens svar.
- **Ærlighed** (beslutning G1, anbefalet og endnu ikke besluttet af Jonas): «X venter» vises kun fra 10 og er det reelle tal. `ctaVindue` nægter en nedtælling uden en kilde, vi selv ejer. Quizzens facit sendes først, når seeren har svaret.
- **Ingen log pr. puls.** `webinar-puls` samler fejl i hukommelsen og skriver én sum pr. minut.
- **Beviset i hvert svar:** `motor: "boardroom-2"` (fra skive 2; skive 1 svarede «boardroom-1»).

**Filerne:**

| Lag | Filer |
|---|---|
| Rene domme (spejlet ordret, paritetstest) | `src/lib/webinarMotor/{ur,spolning,puls,interaktioner,sessionplan,tilmelding,ics,token,svar}.ts` ↔ `supabase/functions/_shared/webinarMotor/` |
| Deno-side | `_shared/webinarDeltagerAuth.ts` (prædikat + secret), `_shared/webinarTilmeldVaern.ts` (prædikat for den offentlige indgang), `_shared/webinarMotorHent.ts` (session/webinar med 10 s cache, frysning af tidslinjen, «i rummet») |
| Functions | `webinar-tilmeld` (`tilmeld`, `sessioner`), `webinar-rum` (`tilstand`, GET `ics`), `webinar-puls` |
| Data | migration `20261003010000_webinarmotor_skive1.sql` |
| Værn | `webinarMotor.test.ts` (dommene og kanterne), `webinarMotor.paritet.test.ts`, `webinarMotor.guard.test.ts` (seks domme med mutationer), `bodyFelter.guard` (STRIKS), `check-edge-function-auth` (to nye prædikater) |

**Afvigelser fra spec'en** (hver med begrundelsen i koden):
1. **Pulsloftet er 1 s mellem kald pr. enhed, ikke 4 s** (`puls.ts:MIN_KALD_AFSTAND_MS`). Med 4 s blev en play-puls lige efter en pause kastet, og de næste 15 sekunders visning gav ingen kredit.
2. **Tokenets version står i tokenet.** Det gør, at HMAC'en kan regnes før databaseopslaget, som spec'ens rækkefølge (§D2) kræver.
3. **CTA-klik og feedback ligger i `webinar_svar`** (art `cta`/`feedback`) og ikke i egne tabeller. Hændelsen står desuden i `webinar_motor_log` (`cta_klik`/`feedback`).
4. **`webinar-handling` er ikke en egen function.** Svar, spørgsmål og reaktioner går med pulsen (opgavens skive 1).
5. **`webinar_motor_log.kilde` har CHECK'en skrevet som `= any (array[…])`**, fordi `enumsMatcherDatabasen.guard` ellers læser den som ansøgningens kildeord.
6. **En afmeldt, der tilmelder sig igen, ophæves ikke.** Det er en sletning i `webinar_afmeldinger` og venter på Jonas (§3). Loggen bærer `afmeldt: true`.
7. **En tvetydig vægtid i .ics'en skrives i UTC.** Et eksempel er 25/10 kl. 02:30, som findes to gange. RFC 5545 læser en tvetydig TZID-tid som den første forekomst.

## 2. Status: eWebinar-afhængighed → erstatning

| eWebinar giver i dag | Erstatning | Status |
|---|---|---|
| Tilmeldingsformular (widget på topix.dk) | Formular på topix.dk → `webinar-tilmeld` | **Motor bygget (skive 1)**, formular = skive 8 |
| Registrant-id, `state`, `sidste_action`, `session_tid`, utm/fbclid i `webinar_tilmeldinger` | Samme kolonner, `ewebinar_id = P-<id>`, `kilde_system = platform` | **Bygget (skive 1)**: Registered ved tilmelding, Joined ved første indgang |
| «Total watched %» (`set_procent`) | Bitmap over 5 s-stykker → `set_procent` på samme skala | **Bygget (skive 1)**. Paritetsbeviset er skyggesessionen (skive 9) |
| Personligt `joinLink` | HMAC-token → `/w/<slug>?t=…` | **Bygget (skive 1 + 3)**: `webinar-mail-cron` udleder linket for motorens rækker (§7.1) |
| `invite.ics` (`addToCalendarLink`) | `bygIcs` (egen UID, SEQUENCE, Europe/Copenhagen) + `webinar-rum` GET `ics` | **Bygget (skive 1 + 3)**: `webinar-mail-cron` vedhæfter husets egen fil for motorens rækker (§7.1) |
| Synkron afspilning, venteværelse, exitrum | `positionDom` + signeret Bunny-embed (webinarbiblioteket) | **Motor (skive 1) + flade (skive 2, §6)**: `/w/:slug`. Mobil-spike på fysiske enheder UMÅLT |
| CTA, poll, quiz, feedback på tidskoder | `webinar_interaktioner` (frossen tidslinje pr. session) + `webinar_svar` | **Motor (skive 1) + kort (skive 2)**: cta, poll, quiz, feedback, spoergsmaal_prompt. `haand`/`ressource` tegnes ikke endnu. Kortene (også `placering: overlay`) står UNDER videoen |
| Testimonial (citat, foto, person, rolle, firma, evt. CTA) | Arten `testimonial` (hjørne af videoen på desktop, under på mobil) | **Spec skrevet 3/10 (§9.3), ikke bygget** — skive 9a–9e; beslutning I3, I6 |
| Image/Button Overlay, Hotspot (klikbart område med varighed og glimmer) | Arterne `billede`, `knap`, `hotspot` i et interaktionslag over Bunny-iframen, under spolespærren | **Spec skrevet 3/10 (§9.1, §9.4), ikke bygget** — 9a–9e; visuel placering = 9g; beslutning I5–I7 |
| Poll med kumulative resultater efter svar | `webinar_poll_resultat` (aggregat) → `poll_resultater` i pulsens svar | **Spec skrevet 3/10 (§9.5), ikke bygget** — 9a–9d; beslutning I2 |
| Private Message på tidskode med `{firstName}`, velkomstbesked | Arten `chatbesked` (`indgang · tidskode · exitrum`), afledt i klienten, mærket «Automatisk» | **Spec skrevet 3/10 (§9.7), ikke bygget** — 9a, 9d, 9e; beslutning I1a. Auto-svar: ikke med (I4) |
| (findes ikke hos eWebinar) Fremhævet spørgsmål + svar på skærmen for alle | `webinar_spoergsmaal.offentlig_tekst/offentlig_svar/fremhaevet_at` → `fremhaevet` i pulsens svar; konsollens «Vis for alle»/«Tag ned» | **Spec skrevet 3/10 (§9.6), ikke bygget** — 9a–9d, 9f; bag låsen `webinar_fremhaev_aktiv`; beslutning I1b, I10 |
| Tip, Special Offer, Next Webinar | Dækket: `chatbesked`/`knap`, `cta` med sand frist (`ctaVindue`), «Tag næste session» | **Bygges ikke** (§9.8, beslutning I4b) |
| Chat/spørgsmål + svar pr. mail | `webinar_spoergsmaal` + svar i pulsens svar | **Spørgsmål ind og svar ud live (skive 1), panelet i rummet (skive 2), konsollen (§7.7)**. **Klokken ved et nyt spørgsmål og svaret på mail til den, der er gået: BYGGET 3/10-2026 (gren `feat/webinar-chat-bagende`), IKKE udrullet — §7.10.** Svaret på mail står bag låsen `webinar_svar_mail_aktiv` (false) |
| Fremmøde-hændelser til Klaviyo (Deltog/Mødte ikke op) | `webinar-motor-cron` via `afgoerOvergang/byggFremmoede` | **Bygget (skive 3, §7.2)** — efter sessionen, ikke ved indgangen |
| `interactionsSummary` i `raa` (stjerner på /webinar) | `raaAdapter` | **Ikke bygget** (skive 2). `raa` = `{kilde: "platform", motor}` |
| Påmindelse 10 min før | Mailart `ti_minutter` (CHECK-migration først) | **Bygget 3/10-2026 (gren `feat/webinar-ti-minutter`), IKKE udrullet**: kun motorens rækker, vinduet T−30 … T−5 min (udvidet 3/10 efter CTO-rådets fund 1), porten `webinar_ti_minutter_klar` (§4). Migration `20261003040000` KØRT før deploy |
| Opsætning af webinar/tidslinje/sessioner | `webinar-admin` + editor | **Bygget, enkel (skive 3, §7.4)**: `/webinar/motor` gennem RLS. Bunny-upload, gentagelser, flyt og preview mangler |
| Analytics (faldkurve, tragt) | `faldkurve` (ren, bygget) + flade | **Dom bygget (skive 1)**, flade = skive 7 |
| Meta-pixel «Fuldfør registrering» | Pixel på topix.dk + evt. CAPI (beslutning G3) | **CAPI-delen bygget bag lås (#1262, §7.9), IKKE udrullet; SKAL BYGGES OM til samtykke-krydset** (rådet 3/10) — hændelsen må kun sendes for en tilmelding, hvor seeren har sat krydset; hvordan krydset ser ud og gemmes, er ikke specificeret her. Pixlen (topix.dk) er ikke bygget. ~~D2.3 (30/9): koden bag låsen `webinarmotor_meta_aktiv`, men først efter privatlivsteksten — se §7.5~~ (afløst af #1262) |

## 3. Udrulning af skive 1 (når Jonas siger til, i denne rækkefølge)

1. **Merge først efter kørt migration** (claude-regelsaet §1a): migrationen i SQL editor, EFTER-SELECT'en gemt, og `GET /rest/v1/webinar_tilmeldinger?select=kilde_system,session_id,token_version&limit=0` → 200.
2. **Secrets:** `WEBINAR_JOIN_SECRET` (32 tilfældige bytes, base64). Senere til skive 3: `BUNNY_WEBINAR_LIBRARY_ID` og `BUNNY_WEBINAR_TOKEN_AUTH_KEY`. Uden dem svarer rummet `embed: null, embed_status: "ikke_sat_op"`.
3. **Deploy** af `webinar-tilmeld`, `webinar-rum` og `webinar-puls` fra build-chatten («kør deploy-værktøjet og vis resultatet»).
4. **Beviset:** et testwebinar (`status = 'aktiv'`) og en session, oprettet i SQL editor. Derefter tilmeld (Origin `https://topix.dk`, en EGEN testadresse) → rum → 10 pulser med 15 s mellemrum → én række i `webinar_deltagelser` med `set_procent` > 0, og `motor: "boardroom-1"` i alle svar (`"boardroom-2"`, når skive 2 er med).
   - **Indtil skive 2** sender `webinar-mail-cron` bekræftelsen uden rum-link til platformens rækker (`join_link` er null). Derfor kun egne testadresser.

## 4. Motor-cron og mails (spec'ens skive 2 — DELVIST bygget i skive 3, §7)

`webinar-motor-cron` (Bucket B, hvert minut, tørkørsel som standard, lås `app_config.webinar_motor_aktiv`):
- sessionsstatus planlagt → aaben ved lobbyen (fryser snapshot'et og overtager `frysTidslinje`) → afholdt
- fremmøde → `state`/`sidste_action` (Watched/Missed) og Klaviyo-outbox via `afgoerOvergang/byggFremmoede` med `unique_id` `P-…:<grad>`
- `raaAdapter` → `interactionsSummary`
- opbevaring af `webinar_pulser` (90 dage)

`webinar-mail-cron`:
- udledte join-links (token)
- `bygIcs` i processen for platformens rækker
- mailarten `ti_minutter` (CHECK-migration KØRT før udrulning) — **bygget 3/10-2026** (gren `feat/webinar-ti-minutter`, IKKE udrullet):
  - **Kun motorens rækker.** PLANENs linje bærer `kunMotor: true`; `doemMail` svarer `ikke_motor` som det FØRSTE (fail-closed: `motorRaekke !== true`), og `planlaegKoersel` udleder `motorRaekke` af `ewebinar_id` (`erMotorRaekke`, ORDRET samme form som `webinarMotor/mail.ts` `MOTOR_ID_FORM` — dommen har nul imports, så formen er gentaget og holdt i takt af `webinarMail.guard` dom 20). Bagefter kræver `mailVejDom` stadig `kilde_system = 'platform'`. eWebinars rækker får aldrig arten — eWebinar sender selv sin 10-minutters-mail. Kaldet er `planlaegKoersel({ raekker, afmeldte, sendte, fejlede, ukendte, nu: a.nu, tiMinutterPort })` — porten er det eneste nye (`webinarMotorSkive3.guard` dom 2, `webinarMail.guard` dom 21). Er samme mail tilmeldt samme tidspunkt i BEGGE systemer, vinder eWebinars række (`bedsteRaekke`: den har join_link), og vi sender ikke.
  - **Vinduet, regnestykket** (står også ved PLANEN i `_shared/webinarMailDom.ts`): cronen kører i minutterne 9, 14, 24, 27, 29, 37, 39, 44, 47, 57, 59 (job 573 `webinar-mail`, KILDEN: migration `20260922172000_webinar_mail_cron.sql`; ingen senere migration planlægger jobbet om — grep 3/10) — største hul 10 min. Med den almindelige regel (fra T−10, nåde 2 t) ville en session kl. hh:10 få mailen kl. hh:09. Derfor eget vindue: `tidligstFoerMs` **20 min** og `naadeMs` 5 min → **T−30 … T−5 min**. ~~Første udgave: `tidligstFoerMs` 5 min → T−15 … T−5.~~ **Rettet 3/10 efter CTO-rådets fund 1 (HØJ):** det smalle vindue gav kun ÉT slot for sessioner kl. hh:00 og hh:30 — og én kørsel når kun ca. 80–150 mails inden for tidsbudgettet (`webinarMailBudget.ts`: seneste start 40 s uden invitation); resten stod `udsat` og var tabt, når vinduet lukkede. **Slots i vinduet pr. startminut** (et slot fyrer et par sekunder efter sit minut, så slot s tæller, når m−30 ≤ s ≤ m−6 mod 60): **min 3** (m = 18, 19, 28–32), **maks 7** (m = 53, 54); **kl. hh:00: 4** (:37 :39 :44 :47), **kl. hh:30: 3** (:09 :14 :24). Det gamle vindue gav min 1, maks 3, og 1 for både :00 og :30. Hele tabellen (m = 0…59) står ved PLANEN og prøves ordret i `webinarMailDom.test.ts` («CRONENS SLOTS»: ≥ 3 for hvert minut, 4 for :00, 3 for :30, hvert tilbud i T−30 … T−5, sendt én gang; mutationsbeviset viser, at T−15 ville fælde). Seneste ja T−5 min + budgettets seneste start 40 s + Mailguns timeout 10 s = **T−4 min 10 s** — Mailgun har mailen senest dér (leveringen derfra er UMÅLT). `kraeverIkkeBegyndt` lukker fra T. Ingen indhentning (ingen næste art), og arten er ingen grænse i de andre arters kæde (`naesteTidssatteArt` springer `kunMotor` over). Linket kan nu komme før lobbyen (`lobby_min`, standard 15): rummet viser da «foer_lobby» (`webinarMotor/ur.ts`) — teksten lover intet om lobbyen.
  - **KAPACITETEN pr. kørsel er UMÅLT — skal MÅLES i lastprøven før åbningen 14/10** (§8.1 trin 13): «3 slots × ca. 80–150 mails» er en antagelse, ikke et tal. Mål: hvor mange `ti_minutter` én kørsel får ud (svarets `sendt` og `budget.forloebet_ved_stop_ms` mod `udsat`), med et realistisk hold på én session. Rækker det ikke, er alternativerne: (a) **et ekstra slot i job 573** for sessioner kl. :00/:30 (fx minut 50 og 20 — en ny `cron.schedule`-migration, `kolliderer()` mod de andre jobs først), eller (b) **Mailguns batch-afsendelse med recipient-variables** (ét kald, op til mange modtagere med hver sin variabel — dokumentationen slås op før bygning; sporet skal da skrives pr. modtager).
  - **Rækkefølgen** i en kørsel: bekræftelser → `ti_minutter` (kort nåde), **nærmeste frist først** (planlagt + `naadeFor` — samme regnestykke som alarmens `fristFor`; 3/10, fund 1) → resten efter planlagt. Uden arten i listen er sorteringen ordret som før (prøvet mod den gamle sammenligning på eWebinar-rækker).
  - **Teksten** (`webinarMailTekster.ts`, husets): **klokkeslættet, aldrig et antal minutter** (rettet 3/10 før merge — mailen går 5–30 min før, og husets regel er, at teksten skal være sand, jf. indhentningens loft): emne «Vi begynder kl. 11.00 — her er dit link» (`emneFor` sætter klokkeslættet ind), brødtekst «Vi begynder kl. 11.00.» (`webinarKlokke` i `_shared/klaviyoDato.ts`, samme format som `webinarTekst`, Europe/Copenhagen; prøvet hen over skiftet 25/10-2026), og en prøve fælder «10 minutter»/«om 10». **Ingen påstand om lobbyen** (rettet 3/10 før merge; ~~åbent punkt: «venteværelset er åbent» holdt kun ved `lobby_min` ≥ 15~~ — LUKKET): `lobby_min` står hverken i dommens input eller i cronens opslag, så sætningen er fjernet fra emne og krop i stedet for at blive dømt — ingen ny hentning; en prøve fælder «venteværelse»/«lobby»/«er åbent». Knappen til rummet, ingen kalenderrække (`UDEN_KALENDER`) og ingen kalenderfil (ikke i `MED_INVITATION`), intet «optag…» og intet «live» (D2.1).
  - **Alarmen:** `fristFor("ti_minutter")` = planlagt + egen nåde = T−5 min (`naadeFor`). **Egen alarmart `ti_minutter`** (3/10, CTO-rådets fund 1; `webinarMailAlarm.ts`), samme mekanisme som de andre — mail til `driftModtager()` + `drift`-klokke, opslag i `email_send_log` før — med nøgle **pr. dansk TIME** (som `fejl`; alvorsorden fejl > ti_minutter > tabt > frist > loft), når (a) en `ti_minutter` står **udsat** (budgettet — cronen lægger nu de udsatte i svarets `udsatte`) eller **over loftet** (`ventende`) med `fristFor` ≤ 10 min ude (`TI_MINUTTER_ALARM_MS`: cronens største hul er 10 min, så længere ude har den et slot mere), eller (b) dommen har dømt den **`for_sent` uden en ok-række** for en, der var tilmeldt senest **frist − største hul = (T−5) − 10 min = T−15** (`erTabtKortNaade` → planens `kortNaadeTabte`, nøglerne; ukendt `registreret_at` tæller — hellere en alarm for meget). ~~«tilmeldt senest ved fristen»~~ — rettet i runde 2 (fund 1): en tilmelding kl. T−7 kan ligge efter vinduets sidste slot (hullet er op til 10 min, `STOERSTE_HUL_MS`, låst til slotlisten i testen) og har aldrig fået et tilbud; T−7 er ikke tabt, T−16 er. **En aflyst session er ikke et tab** (runde 2, fund 2): cronen slår de tabte nøgler op og fraregner dem, `mailVejDom` dømmer `aflyst` (den rene `taelTabteUdenAflyste` i `webinarMotor/mail.ts`, begge spejle); `ikke_fundet`, `ikke_platform`, `ingen_session` og `ingen_secret` tæller fortsat. Vinder `fejl` alvorsordenen, bærer fejl-mailen stadig ti_minutter-afsnittet (runde 2, fund 3). Aldrig i en tørkørsel.
  - **Aldrig tre mails i samme kørsel** (runde 2, fund 4): får samme person (samme `ewebinar_id`) `bekraeftelse` eller `en_time` i kørslen (`SAMME_KOERSEL_ARTER`), springes `ti_minutter` over med springgrunden `samme_koersel` (skrives aldrig i sporet; tælles i svarets `sprunget.samme_koersel`). Typisk en sen tilmelding ca. 20 min før start. Næste slot i vinduet kan tage den. Begge spejle. **Kun når et senere slot er garanteret før fristen** (runde 3; margen runde 4): `nu + STOERSTE_HUL_MS + SLOT_FORSINKELSE_MARGEN_MS ≤ planlagt + naadeFor(ti_minutter)` (= T−5; margenen 60 s dækker et slot, der fyrer sent); ellers går `ti_minutter` med i samme kørsel — hellere tre mails end en tabt. Prøvet: session hh:02, tilmelding :46, kørsel :47:03 → 47:03 + 10 + 1 min = 58:03 > 57:00 → sendes i samme kørsel, intet tabt; grænsen :46:00 springes over, :46:00.001 sendes; session hh:00, kørsel :39:03 → 39:03 + 10 + 1 min = 50:03 ≤ 55:00 → springes over, og slot :44 sender. ~~Kendt følge: springes den over i vinduets sidste slot, bliver den `for_sent` og tæller som tabt~~ — LUKKET i runde 3 af betingelsen. Værn: `webinarMail.guard` dom 20 (mutation fjerner betingelsen).
  - **KENDT, IKKE RETTET — «om en time» til en sen tilmelding tæt på start** (bogført 3/10, runde 2, fund 4): `en_time` er `{ minutterFoer: 60, kraeverIkkeBegyndt: true }` uden egen nåde, så `doemMail` sender den, når `0 ≤ nu − (T − 60 min) ≤ SEN_TILMELDING_NAADE_MS` (2 t — `naadeFor` falder tilbage på den) og sessionen ikke er begyndt (`kraeverIkkeBegyndt` → `sessionen_begyndt` fra T). Altså går «Vi starter om en time — her er dit link» til enhver, der tilmelder sig i den sidste time — også kl. T−3 i slottet før start. Teksten er da usand (gælder både eWebinars og motorens rækker). En rettelse (fx egen nåde eller et klokkeslæt i teksten som `ti_minutter`) er ikke bygget.
  - **Porten** (3/10, CTO-rådets fund 3): migrationen lægger `app_config.webinar_ti_minutter_klar = true` (`ON CONFLICT DO NOTHING`) i SAMME transaktion som CHECK'en. Cronen læser den fail-closed FØR dommen (læsefejl → `laesefejl`; ingen/ikke-true → `migration_mangler`; kun true → `klar`) og giver den til `planlaegKoersel` (`tiMinutterPort`), som uden «klar» tager arten UD af kørslen (begge spejle ordret). Så kan en udrulning før migrationen ikke sende mails, CHECK'en afviser. At slukke arten: slet nøglen (rollback-rækkefølgen i migrationen). Værn `webinarMail.guard` dom 21.
  - **Svaret** bærer `ti_minutter: { port, ikke_motor, skal_sendes, tabt }` og `sprunget.ikke_motor` — beviset for udrulningen (kun den nye kode har feltet). **Samme grundlag** (rådets fund 5): alle tre tal er talt efter prøvens filter (med `email` er rækkerne allerede læst for den ene adresse; med en anden `art` er de 0). Den ene forskel er bevidst: `ikke_motor`/`tabt` er dommens tal FØR `mailVejDom`, `skal_sendes` er EFTER (en motor-række uden link står i `motor_mail.uden_link`).
  - **Rækkefølgen ved udrulning:** merge → migration `20261003040000_webinar_mails_ti_minutter.sql` KØRT i SQL editor (FØR/EFTER i filhovedet: `webinar_mails_art_check` med otte arter) → eksplicit deploy af `webinar-mail-cron` fra build-chatten → beviset: en tørkørsel (`SELECT public.kald_edge('webinar-mail-cron');`) svarer med `ti_minutter` og `port: "klar"`. ~~«med eWebinars hold kommende: `ikke_motor` > 0»~~ — rettet 3/10 (rådets fund 4, målt i koden): `ikke_motor` tæller eWebinar-personer (én pr. (mail, session)) blandt de tilmeldinger, cronen LÆSER — `session_tid ≥ kørslens nu − 3 døgn` (cronens `graense`, trin 1) — og dommen svarer `ikke_motor` FØR tiden. Så: **med mindst én eWebinar-tilmelding til en session fra 3 døgn før kørslen og frem (og porten `klar`) er `ikke_motor` > 0**, uanset hvor langt ude sessionen er; efter eWebinars sidste session (13/10) + 3 døgn er 0 det rigtige svar. `skal_sendes` er 0, medmindre en motor-session er i sit vindue → prøven til én motor-tilmelding på en intern session (`{"dry_run": false, "email": …, "art": "ti_minutter"}` inden for vinduet). Kører migrationen IKKE først: mailen sendes, rækken afvises (23514), og næste slot i vinduet sender IGEN.

`klokkeMail.ts`: typerne `webinar_spoergsmaal`/`webinar_haand`/`webinar_drift`, før nogen klokke ringes.

## 5. Ikke bygget i skive 1 (bevidst)

- Ingen flade (motor før flade).
- Ingen gentagelser/JIT (`materialiser`, `naesteJitSession`). JIT er bag flag og uden for v1 (G6).
- Ingen `fremmoedeDom`/`raaAdapter`/Klaviyo (skive 2).
- Ingen `spor`-handling (anonym sidevisning) i `webinar-tilmeld` (skive 8).
- Ingen `haand` (kræver klokketype, skive 5), `fra_webinar` i `ansoegning-gem` (skive 4) og `preview` (skive 6). `gen_tilmeld` og `forudfyld` er bygget i skive 2 (§6).
- Nyhedsbrevssamtykket gemmes (`samtykke_nyhedsbrev_at`), men sendes ikke til Klaviyo (skive 4/8, bag lås).
- ~~Seerens egen hilsen («Hej Anne») er ikke med.~~ **Løst i skive 2 (§6):** `hilsen.fornavn` gennem en navngiven undtagelse. `fornavn` står stadig på listen over forbudte nøgler — overalt andre steder.

## 6. Skive 2 — seerens flade (30/9-2026, grenen `feat/webinarmotor-skive2`)

**Ruterne** (offentlige, uden login, uden skal, i INGEN menu — `webinarRum.guard` dom 5):

| Rute | Hvad |
|---|---|
| `/w/:slug` | Med et token (`?t=` fra mailen, ellers fanens sessionStorage): **rummet**. Uden: **tilmeldingen** |
| `/w/:slug/tilmeld` | Altid tilmeldingen (spec §D5's reserveformular — den, skyggesessionen bruger) |
| `/w/:slug/kalender?t=` | Videre til husets `.ics` (`webinar-rum` GET `handling=ics`) — til mails |

`rumSti` (`webinarMotor/token.ts`) peger allerede på `/w/<slug>?t=…`, så mailcronens link (spec'ens skive 2) lander her uden ændring.

**Tokenet** flyttes til `sessionStorage` (pr. webinar) og fjernes fra adresselinjen med `history.replaceState`; siden sætter `<meta name="referrer" content="no-referrer">`, mens den er åben, og Bunnys iframe får `referrerPolicy="strict-origin"` (kun oprindelsen — hvis webinarbiblioteket har en referrer-liste, består den). Enhedens id står også i `sessionStorage`, så en genindlæsning ikke bruger en af de fem enheder, serveren tillader. Ingen localStorage, ingen cookie, ingen pixel/GTM/GA (dom 3; `tracking.md` række 27).

**Faserne** (`src/lib/webinarRum/fase.ts:visningsFase`): venter → venteværelse → sen indgang | gå ind → live → exitrum → afsluttet (+ aflyst). Klienten regner motorens `positionDom` på serverens fem tider (`urFraTider`) med sit ur rettet af `urForskydning` (tre første målinger, mindste rundtur; derefter glattet ±250 ms, spring over 5 s). Krydses en grænse, hentes `tilstand` igen (embed'en signeres kun i intro og afspilning) — højst ét forsøg i sekundet, til serveren er enig. Den, der sidder i venteværelset, når det begynder, er gået ind af sig selv; alle andre trykker «Gå ind» (lyd kræver en gestus).

**Afspilleren** (`components/webinarRum/Afspiller.tsx`, player.js — allerede en afhængighed): `spoleDom` ved hver `timeupdate` (3 s tolerance, én korrektion pr. 8 s, aldrig under buffer — player.js har ingen buffer-hændelse, så «spiller» uden timeupdate i 2,5 s er «buffer»); et gennemsigtigt lag over kontrolbjælken (søgebjælken kan ikke trækkes); egne knapper under videoen: Pause / Tilbage til webinaret (skive 3: uden ordet «live», D2.1), Lyd, Fuld skærm (kun hvor `document.fullscreenEnabled`). **iPhone, plan A:** står afspilleren på pause 1,5 s efter «ready», spilles der uden lyd fra serverens position, og «Tryk for lyd» vises (`autoplayDom`).

**Pulsen** (`pulsplan.ts`): tjekkes hvert sekund, sendes når intervallet er gået (15 s spiller · 60 s ellers · 5 s i 10 min efter et spørgsmål), straks ved play/pause/ended/fanen skjult/fejl, og som `fetch(keepalive)` ved `pagehide`. Aldrig tættere end 1,2 s (serverens loft er 1 s). Køen holder de fire nyeste ved en netfejl (serveren dedupper på seq). Uden for hovedvideoen er tilstanden «lobby» og positionen 0 — intet anker på introens tal.

**Kortene** (`overlay.ts:kortPaaSkaermen`): rummets `tilstand` bærer nu HELE den frosne tidslinje (`seerTidslinje`: uden kapitler, MED betingelsen, quiz' facit først efter svar, CTA'ernes sande nedtælling regnet af serveren), og klienten viser et kort med motorens egen `aktiveInteraktioner` på serverens position. Hvert svar dømmes stadig af `webinar-puls`. Arter med kort: cta, poll, quiz, feedback, spoergsmaal_prompt. CTA-klikket sendes med `fetch(keepalive)` FØR ansøgningen åbnes.

**Exitrummet:** «Tak fordi du så med, Anne», tidslinjens exitrums-kort (feedback, CTA), ellers en fast knap til ansøgningen, «Tag næste session», spørgsmålspanelet. **Ansøgningen** åbnes som `/ansoeg?kilde=webinar#wt=<token>` — tokenet i FRAGMENTET (sendes aldrig til en server eller i en Referer); `/ansoeg` henter navn og mail med `webinar-rum` «forudfyld» (`hooks/useWebinarForudfyld.ts`) og udfylder kun tomme felter. `landingUdenToken` skræller nu også fragmentet af (begge spejle), så tokenet aldrig når sporet eller Metas `event_source_url`.

**Motor og functions — ændret i skive 2:**
1. `webinar-rum` «tilstand» bærer `tidslinje`, `egne_svar` (seerens egne svar — betingelserne skal kende valget) og `hilsen: { fornavn }`.
2. `webinar-rum` «gen_tilmeld»: «Tag næste session» med ét tryk. Serveren vælger sessionen (næste efter nu, ikke den nuværende, ikke fuld); `tilmeldDom` afgør samme/flyt/ny som i `webinar-tilmeld`. En NY række arver annoncesporet (utm_*, fbclid, origin, referrer, fbp, fbc_cookie, ga_client_id), aldrig samtykket (dom 2). Svaret bærer tokenet til den række, personen står på — kalderen har et gyldigt token til samme mail. Loggen: `gen_tilmeldt`. **Observation:** den nye rækkes `registreret_at` er gen-tilmeldingens tid; `meta-send` bruger den som fbc-tidspunkt (et senere tidspunkt end klikket).
3. `webinar-rum` «forudfyld»: `{ forudfyld: { navn, email } }` til tokenets ejer. Loggen: `ansoegning_fra_webinar` med `trin: "forudfyld"`.
4. `svar.ts`: `NAVNGIVNE_UNDTAGELSER` (`hilsen.fornavn`; `forudfyld.navn`, `forudfyld.email`) og `findMotorForbudteMed` — PRÆCISE stier, kun i `webinar-rum`, i præcis ét svar hver (dom 1). `MOTOR_VERSION` = «boardroom-2».
5. `interaktioner.ts`: `seerTidslinje` (spejlet ordret).
6. `webinar-tilmeld` «sessioner» bærer også `beskrivelse`, `vaert_billede`, `intro_sek`.
Ingen ny migration.

**Værn:** `webinarRum.test.ts` (fase, puls, overlay, links, seerTidslinje, undtagelserne) og `webinarRum.guard.test.ts` (seks domme med mutationer: undtagelserne, arven, ingen tracking/lagring, hooks i topblokken, ruterne, fragmentet).

**Ikke bygget i skive 2 (bevidst):**
- `haand`, `ressource` og poll-resultater tegnes ikke (klokketype, link via token og en optælling mangler).
- Klientens egne hændelser (`lydtest`, `korrektion`, `pause`, `live_igen`, `afspillerfejl`, `interaktion_vist`) når ikke `webinar_motor_log`: `webinar-puls` tager kun `svar`/`spoergsmaal`/`reaktion`. Korrektioner og lyd står på pulserne (`korrigeret`, `lyd`).
- ~~`ansoegninger.webinar_tilmelding_id` sættes ikke — det kræver `ansoegning-gem` «fra_webinar» (spec §A9).~~ **BYGGET 3/10-2026** som feltet `webinar_token` i «opret» (ikke en ny handling) — §7.8.
- Svar pr. mail til den, der er gået (spec'ens skive 5) — derfor lover panelet kun svar «her i rummet».
- Nyhedsbrevs-knappen i exitrummet («Ikke klar endnu» → samtykke) — kræver Klaviyo-vejen bag lås.
- Poll-resultater, intro-video-sidebar, ventemusik.

## 7. Skive 3 — det, der mangler til en INTERN prøvesession (30/9-2026, grenen `feat/webinarmotor-skive3`)

Bygget efter Jonas' beslutninger 30/9 (D2):

| # | Beslutning | I skive 3 |
|---|---|---|
| D2.1 | «optaget» står ingen steder, og «live» ikke som påstand om sendingen | Rettet i rummet: «Live nu» → «I gang nu», mærket «Live» → «I gang», «Webinaret kører videre live» → «Webinaret kører videre», «Tilbage til live» → «Tilbage til webinaret», CTA-kildens tekst for `optag_frist` → «Ansøgningsfristen lukker om». Værn `webinarMotorSkive3.guard` dom 1 fælder «optaget», «optagelse» og «live» (ordgrænse, kodeord og kommentarer undtaget) i rummet, tilmeldingen, motorens domme, mailteksterne og motorens mailfil |
| D2.2 | Tilmeldingen bliver hos eWebinar til efter 13/10 | Intet i eWebinar-vejen er ændret: `ewebinar-webhook` og topix.dk er urørte, og mailcronens eWebinar-gren er ordret som før (værn dom 2) |
| D2.3 | Pixel + CAPI på tilmeldingen bag låsen `webinarmotor_meta_aktiv` | **IKKE bygget** — se §7.5 |
| D2.4 | Ingen spoling; pause med «Tilbage til …» uden ordet live | Tjekket i skive 2: overlaget dækker kontrolbjælken (`overlay.ts:daekKontroller`), `spoleDom` retter hvert hop, pause er tilladt. Teksten rettet (D2.1) |
| D2.5 | Intet replay; efter 25 % tilbydes næste session | Tjekket: ingen replay-sti findes; `senIndgangDom` tilbyder næste session, når mere end 25 % er forbi (100 − `SET_GRAENSE_PROCENT_MOTOR` 75) |
| D2.6 | JIT og SMS: ikke nu | Ikke bygget |
| D2.7 | Ingen offentlig parallelkørsel — kun en INTERN prøvesession | `webinar_sessioner.intern`; se nedenfor |

### 7.1 Mails for motorens tilmeldinger (`webinar-mail-cron`)

**Dommen er urørt:** `planlaegKoersel`, PLANEN med de fem aktive arter (#1167), dubletværnet, nåden, indhentningen, loftet (#1152) og budgettet (#1162) kaldes præcis som før, og hovedforespørgslen læser de samme kolonner — så cronen virker også FØR skive 1's migration. EFTER dommen afgør `webinarMotor/mail.ts:mailVejDom` linkene pr. sending:

| Rækken | Link i mailen | Kalenderfil (`bekraeftelse`, `fjorten_dage`) |
|---|---|---|
| eWebinars (`ewebinar_id` uden «P-») | `join_link` / `kalender_link` fra rækken — som før | eWebinars `invite.ics`, hentet med `hentInvitation` — som før |
| Motorens (`P-<uuid>`, opslaget siger `kilde_system = 'platform'`) | `https://app.theboardroom.dk/w/<slug>?t=<HMAC>` og `/w/<slug>/kalender?t=…` | Husets egen, `bygIcs` i processen (UID `<id>@webinar.topix.dk`, SEQUENCE = `ics_sekvens`, samme beskrivelse som `webinar-rum` GET `ics`, `icsBeskrivelse`) |
| Motorens, men linket kan ikke bygges | — mailen forsøges IKKE (ingen række i sporet; den tages igen næste kørsel, indtil nåden lukker den) | — |

Grundene til «uden link»: `ikke_fundet` · `ikke_platform` · `ingen_session` · `ingen_secret` (WEBINAR_JOIN_SECRET mangler) · `aflyst`. Opslaget (`_shared/webinarMotorMail.ts`) laves KUN for «P-»-rækker; fejler det, skrives grunden i `fejl`, og eWebinars mails går som før. Sporets `invitation` er «hentet» for husets fil («filen var i hånden») — CHECK'en er urørt, og rækken kendes på «P-». **Beviset i drift:** svaret bærer `motor_mail: { vej_motor, uden_link }`.

**~~Ikke med:~~ mailarten `ti_minutter`** (eWebinars 10-minutters-mail har motorens tilmeldte ikke) — **BYGGET 3/10-2026** (gren `feat/webinar-ti-minutter`, IKKE udrullet; §4): kun motorens rækker, vinduet T−30 … T−5 min (udvidet 3/10, fund 1), CHECK-migration `20261003040000` (med porten) KØRT før deploy. `mailVejDom` er urørt og afgør linket som for de andre arter; en motor-række uden link forsøges ikke og tabes, når vinduet lukker.

### 7.2 `webinar-motor-cron` — fremmøde og opbevaring

Bucket B (`verify_jwt = true`, `authenticateServiceRole` først), tørkørsel som standard, lås `app_config.webinar_motor_aktiv` (fraværende = false). **Den interne undtagelse:** `{"dry_run": false, "session_id": "<id>"}` på en INTERN session skriver uden låsen. Body (STRIKS): `dry_run · session_id · nu` (`nu` kun i en tørkørsel).

1. **Fremmødet** dømmes, når exitrummet har været lukket i 5 min (`FREMMOEDE_MARGIN_MS`; regnestykket i `fremmoede.ts`), af bitmappen (`webinar_deltagelser`) med eWebinars ord:

   | Deltagelsen | `state` · `sidste_action` | `doemSetGrad` bagefter |
   |---|---|---|
   | `set_procent` > 0 | Watched · WatchedWebinar, `set_procent` = max(tilmeldingens, deltagelsens) | set (≥ 75) / delvist |
   | gik ind, intet stykke set | Joined · Left, `set_procent` 0 | delvist |
   | kun lobbyen, eller aldrig | Missed · MissedWebinar | moedte_ikke |

   Rettelsen går kun FREM (state i rang, procent op) og overskriver aldrig «Unsubscribed» i `sidste_action` (afmeldingens port). Hver UPDATE er vagtet på den state, cronen læste. `set_procent_kilde` = «boardroom-bitmap» (`SET_PROCENT_KILDE_MOTOR` i `fremmoede.ts` — samme navn, som `webinar_puls_skriv` skriver under sessionen; rettet 30/9 efter rådet, før stod der «boardroom-1» i SQL'en og MOTOR_VERSION i cronen). **En bevidst forskel fra eWebinar:** lobbyen alene tæller ikke som fremmøde (eWebinar skrev «Joined» i venteværelset; motoren først ved indgangen i hovedvideoen).
2. **Klaviyo ad den eksisterende vej:** `afgoerOvergang` → `byggFremmoede` → `sendHvisMail` (samme som `ewebinar-webhook`; `unique_id` `P-<id>:<grad>`). «Før»-graden er den, cronen SELV dømte sidst (`webinar_motor_log` art `fremmoede_dom` — motorens hukommelse), så «deltog» og «mødte ikke op» sendes én gang, og delvist → set igen. En afmeldt (`webinar_afmeldinger` eller «Unsubscribed») får ingen hændelse. Loggen skrives EFTER afsendelsen; går kørslen ned imellem, afviser Klaviyo dubletten på `unique_id`. Fejlede afsendelser tager `klaviyo-gensend-cron` som altid.
3. **Sessionen** sættes til «afholdt» (`afsluttet_at`) først, når ALLE dens tilmeldinger er dømt; budgettet (`SENESTE_START_MS` = 60 000 − 5 000 − 13 000 = 42 000 ms) udsætter resten til næste kørsel. En session ældre end 7 døgn (`DOM_VINDUE_DAGE`) tælles som `for_gammel` — et driftsfund.
4. **Opbevaringen:** `webinar_pulser` ældre end **90 dage** slettes — kun i den globale kørsel med låsen, aldrig i prøven. Begrundelsen: dommen står i aggregatet (`webinar_deltagelser`) og i `webinar_tilmeldinger`; de rå pulser bruges kun til at efterprøve synk og bitmap, og det længste bevis, der har brug for dem, er parallelkørslen (P0 → P2, ~60 dage) plus en måneds efterprøvning. Længere er persondata uden formål (spec §C6).

`/webinar`, delingen, `webinarDom` og `meta-send` læser motorens rækker uændret. **Ikke med:** `raaAdapter` (`interactionsSummary`, stjernerne på `/webinar`) — motorens rækker viser ingen stjerner endnu.

### 7.3 Den interne prøvesession (D2.7)

- `webinar_sessioner.intern` (migration `20261003030000`). En intern session står ALDRIG i `webinar-tilmeld` «sessioner» eller i `naesteSessioner` (uden `medInterne`).
- Vejen ind er rådgiverens **prøvelink** `/w/<slug>/tilmeld?session=<id>` (`tilmeldSti`, vist og kopierbart på `/webinar/motor`). «sessioner» med `session_id` svarer med netop den ene (`intern: true`).
- «tilmeld» til en intern session kræver en adresse på **præcis** `topix.dk` eller `theboardroom.dk` (`internDom` FØR dubletdommen; ellers 403 «intern»). Rækken får `raa.intern = true`, så den kan filtreres fra i tallene senere.
- Rummets «Tag næste session» tilbyder kun interne sessioner til husets egne adresser (`erInternAdresse`).
- **Låsen `app_config.webinarmotor_offentlig_aktiv`** (fraværende = false; migrationen lægger den som false) — rådets fund 30/9, §7.6. Lukket: ingen OFFENTLIG session vises i «sessioner» eller i rummet, og «tilmeld» til en svarer 403 «ikke_aaben». Kun den interne prøvesession virker. Den åbnes med én SQL, når Jonas siger til.
- **`/webinar` og delingen tæller IKKE den interne session** (rettet 30/9 efter rådet, §7.6): dashboard-dommen filtrerer rækker med `raa.intern = true` fra i begge spejle — og fra 2/10 også målstregerne og annoncepriserne (§8.4).
- **Hvad en prøve stadig rammer (bevidst):** `klaviyo-profil-cron` opdaterer testadressens profil med `session_tid`; `webinar-motor-cron` sender testadressens «Deltog»/«Mødte ikke op» til Klaviyo (det ER beviset E3.3). Brug kun egne adresser.
- **Testadresser må IKKE være tilmeldt eWebinar-sessionen 13/10** (rådets fund 30/9). `webinar-mail-cron`'s dubletværn giver kun den NÆRMESTE kommende session påmindelser — og det dømmes pr. `lower(email)` på tværs af eWebinars og motorens rækker. En testadresse, der står på både 13/10 (eWebinar) og den interne prøve, mister påmindelserne til den senere af de to (`senere_session`), og prøven beviser da ikke mailvejen. Mål før trin 7: `select ewebinar_id, session_tid from public.webinar_tilmeldinger where email = '<testadresse>';` → ingen række uden «P-».

**RUNBOOK — i denne rækkefølge, ét skridt ad gangen, hvert med sit bevis:**

1. **Merge** #1158 → #1161 → skive 3 (i den rækkefølge; hver oven på den forrige).
2. **Secrets** (Lovable → Cloud → Secrets):
   - `WEBINAR_JOIN_SECRET` — 32 tilfældige bytes, base64 (Terminal: `openssl rand -base64 32`). Uden den: tilmeld svarer 503, og mailcronen tæller motorens mails som `uden_link.ingen_secret`.
   - `BUNNY_WEBINAR_LIBRARY_ID` og `BUNNY_WEBINAR_TOKEN_AUTH_KEY` — webinarbiblioteket i Bunny (EU, token-auth til, tilladt referrer `app.theboardroom.dk`). Uden dem svarer rummet `embed_status: "ikke_sat_op"` (rummet virker, videoen ikke).
   - Findes allerede og bruges uændret: Mailgun-nøglen, afmeldingens secret og `KLAVIYO_API_KEY`.
3. **Migrationer** i Lovable → SQL editor, hver med FØR-SQL og EFTER-SQL fra filhovedet (resultatet gemt):
   1. `20261003010000_webinarmotor_skive1.sql`
   2. `20261003030000_webinarmotor_skive3.sql`
   - **Bevis** (browser/terminal med anon-nøglen fra bundlen): `GET /rest/v1/webinar_tilmeldinger?select=kilde_system,session_id,token_version&limit=0` → 200 og `GET /rest/v1/webinar_sessioner?select=intern&limit=0` → 200.
   - `20261003031000_webinar_motor_cron.sql` køres IKKE nu (trin 10).
4. **Deploy** fra Lovable build-chat («kør deploy-værktøjet og vis resultatet»): `webinar-tilmeld`, `webinar-rum`, `webinar-puls`, `webinar-motor-cron`, `webinar-mail-cron`, **`webinar-delt`** (bruger `_shared/annoncepriser.ts`, `_shared/webinarMaalstreger.ts` og `_shared/webinarDashboard.ts`, hvor den interne prøve nu filtreres — CTO-rådets fund 2; beviset er feltet `interne_fraregnet` i et delt-svar, et TAL) og **`drift-agent-cron`** (importerer `_shared/webinarMailAlarm.ts` — og dermed `_shared/webinarMailDom.ts` — gennem `_shared/driftDom.ts`; `fristFor` er uændret for de gamle arter, men bundlen bærer den nye art; beviset er `"drift_agent": "skive-1"` i en tørkørsel og ingen `fejl`) — og **`ansoegning-gem`** (den delte fil `_shared/ansoegningSkema.ts` er ændret i skive 2: `landingUdenToken` skræller `#`-fragmentet af, så deltagertokenet fra exitrummets knap aldrig lander i `landing`/Metas `event_source_url`; merge udruller ikke en function, hvis delte fil er ændret). `ansoegningSkema.ts` importeres også af `ansoegning-cvr` og `ansoegning-cvr-opslag` (målt med grep 30/9) — de bruger ikke `landingUdenToken`, så de behøver ikke udrulles for denne ændring.
   - **`_shared/klaviyoDato.ts`** fik den nye export `webinarKlokke` (til `ti_minutter`s tekst). Ændringen er RENT TILFØJENDE — ingen eksisterende export er rørt — så de andre importører kræver IKKE udrulning for den: `klaviyo-profil-cron` (direkte) og, gennem `_shared/klaviyoAfsendelse.ts`/`_shared/klaviyoProfil.ts`, bl.a. `ansoegning-gem`, `ewebinar-import`, `ewebinar-webhook`, `klaviyo-afmeld-bagud`, `klaviyo-gensend-cron`, `ring-mig-op`, `stripe-webhook`, `webinar-afmeld` og `webinar-motor-cron` (målt med grep 3/10). Kun `webinar-mail-cron` bruger den.
   - **Bevis** (SQL editor, svaret i `net._http_response`):
     - `SELECT public.kald_edge('webinar-motor-cron', '{}'::jsonb);` → `"motor":"boardroom-3"`, `"dry_run":true`.
     - `webinar-delt`: åbn et delt link (`/delt/webinar?t=…`) og læs svaret — feltet `interne_fraregnet` (et tal, 0 før den første interne prøve) findes; ingen `@` i svaret.
     - `SELECT public.kald_edge('drift-agent-cron', '{}'::jsonb);` → `"drift_agent":"skive-1"`.
     - `SELECT public.kald_edge('webinar-mail-cron', '{}'::jsonb);` → svaret har `"motor_mail":{"vej_motor":0,…}` (feltet findes kun i den nye kode).
     - `ansoegning-gem`: ændringen giver intet nyt felt i svaret, så beviset er en rigtig måling: åbn `/ansoeg?kilde=webinar#wt=prove` i et privat vindue, start ansøgningen, og `select landing from public.ansoegninger order by created_at desc limit 1;` → ingen `#`.
     - Låsen: `select config_value from public.app_config where config_key = 'webinarmotor_offentlig_aktiv';` → `false`.
5. **Update** i Lovable (frontend). **Bevis:** `https://app.theboardroom.dk/webinar/motor` åbner for en rådgiver.
6. **Opret webinaret** på `/webinar/motor`: titel, slug, Bunny-GUID (webinarbiblioteket), varighed (videoens præcise længde), evt. CTA-tid + mål + tekst + knap → «Opret som kladde». Læg interaktioner i kladden (tidskode, type, tekst) → «Udgiv version 1» → «Sæt til aktiv».
   - Opret en session med **«Intern prøvesession»** sat, mindst 70 min ude i fremtiden (så «om en time»-mailen også prøves). Opret INGEN offentlig session.
   - **Bevis** (SQL editor): `select id, starter_at, intern, status from public.webinar_sessioner order by created_at desc limit 3;` → `intern = true`.
7. **Tilmeld** som testadresse: åbn prøvelinket fra `/webinar/motor` i et privat vindue, fornavn + egen `@topix.dk`-adresse → kvitteringen.
   - **Bevis:** `select id, ewebinar_id, kilde_system, state, raa from public.webinar_tilmeldinger where session_id = '<session-id>';` → én række, `P-…`, `platform`, `Registered`, `raa.intern = true`. En adresse uden for husets domæner får «Den session er en intern prøve …» (403).
8. **Mails:** `webinar_mail_aktiv` er tændt i drift (cron 573), så bekræftelsen kommer i næste slot (≤ 10 min).
   - **Bevis:** `select art, udfald, invitation, ewebinar_id from public.webinar_mails where ewebinar_id ~ '^P-[0-9a-f]{8}-' order by forsoegt_at desc;` → `bekraeftelse · ok · hentet · P-…`. I indbakken: knappen «Gå til webinaret» peger på `/w/<slug>?t=…`, og den vedhæftede invitation har UID `<tilmeldings-id>@webinar.topix.dk`. «Om en time» kommer 60 min før.
9. **Sessionen:** åbn linket fra mailen — venteværelset → «Gå ind» → videoen. Se mindst nogle minutter, gerne på en telefon og en computer.
   - **Bevis:** `select set_procent, foerste_ind_at, enheder from public.webinar_deltagelser where session_id = '<session-id>';` → `set_procent > 0`; og `select count(*) from public.webinar_pulser p join public.webinar_deltagelser d on d.id = p.deltagelse_id where d.session_id = '<session-id>';` > 0.
10. **Efter sessionen** (exitrummets slut + 5 min): kør dommen for NETOP den interne session (låsen røres ikke):
    `SELECT public.kald_edge('webinar-motor-cron', '{"dry_run": false, "session_id": "<session-id>"}'::jsonb);`
    - **Bevis:** svaret `"sender_rigtigt":true`, sessionen `"afsluttet":true`; `select state, sidste_action, set_procent, set_procent_kilde from public.webinar_tilmeldinger where session_id = '<session-id>';` → Watched/WatchedWebinar/… /`boardroom-bitmap`; `select data from public.webinar_motor_log where session_id = '<session-id>' and art in ('fremmoede_dom','session_afsluttet');`; `select metric, unikt_id, udfald from public.klaviyo_haendelser where unikt_id ~ '^P-[0-9a-f]{8}-';` → «Deltog i webinar» med `P-<id>:set` (eller `:delvist`).
    - Først nu, og kun hvis Jonas vil have dommen til at køre af sig selv: `20261003031000_webinar_motor_cron.sql` (jobbet er ufarligt uden låsen: det tørkører).

### 7.4 Rådgiverens opsætning (`/webinar/motor`)

Bag `AdvisorRoute`, i INGEN menu (værn dom 6). Opret webinar (titel, slug, Bunny-GUID, varighed, vært, venteværelse/exitrum, CTA-tid/mål/tekst/knap), status (kladde → aktiv → arkiveret), sessioner (dansk dato og tid → UTC gennem `kbhTilUtc`, pladser, intern ja/nej, aflys), og tidslinjen: interaktioner (tidskode fra/til, type, hvor, tekst) lægges i en **kladde** (version = udgivet + 1) og udgives samlet. «Ret tidslinjen» kopierer den udgivne version til en ny kladde. Formularerne dømmes i `lib/webinarMotorAdmin/opsaetning.ts` (interaktionerne af SAMME `interaktionSkema` som serveren); skrivningerne går gennem RLS (`hooks/webinarMotorAdmin.ts`), og databasen dømmer igen:

- RLS (`20261003030000`): rådgivere INSERT/UPDATE på `webinarer` og `webinar_sessioner`, INSERT/UPDATE/DELETE på `webinar_interaktioner` KUN når `version > tidslinje_version`.
- Triggere: `webinar_tidslinje_frem` (versionen går kun frem; slug'en er fast, når der er sessioner — den står i mailenes links), `webinar_session_laast` (en session med tilmeldte kan ikke flyttes — aflys og opret en ny; flyt med mail og SEQUENCE + 1 er spec'ens skive 6).

**Afvigelser fra spec'en (B1–B3):** varigheden TASTES (spec'en: målt fra Bunnys video-info — kræver webinarbibliotekets API-nøgle; et tastet tal er en observation, så det skal være videoens præcise længde); ingen Bunny-upload, ingen skrubber/preview, ingen gentagelser, ingen flyt. CTA-målene i editoren er kun «ansøgningen» og «ikke klar endnu» (skemaets «ressource»/«link» har ingen vej i seerens kort endnu).

### 7.5 Ikke bygget i skive 3 (bevidst)

- **D2.3 — Pixel + Conversions API på tilmeldingen:** pixlen hører til topix.dk-formularen (site-repoet, spec'ens skive 8), og tilmeldingen bliver hos eWebinar til efter 13/10 (D2.2); rummet og reserveformularen er uden tracking (`webinarRum.guard` dom 3). En CAPI-hændelse fra platformen kræver en ny `art` i `meta_haendelser`' CHECK — en ikke-tilføjende migration på et spor i drift — og privatlivsteksten først (Jonas). Når den bygges: bag låsen `webinarmotor_meta_aktiv` (fraværende = false), værnet `webinarTilmeldMeta.guard` (spec §C6).
- `ti_minutter`, `raaAdapter`, klokketyperne, konsollen og svar pr. mail (spec'ens skive 2 og 5). *(3/10: `ti_minutter` bygget, §4; en minimal konsol bygget, §7.7.)*
- ~~Et filter, der holder den interne sessions rækker ude af `/webinar`-tallene~~ — **LØST 30/9** efter rådet (§7.6, fund 5).
- Mobil-spiken på fysiske enheder (UMÅLT) og Bunny-playerens cookies (UMÅLT, spec §C6).

### 7.6 Det tekniske råds fund (30/9-2026, dom «RET FØRST») — rettet i skive 3

| # | Fund | Rettet |
|---|---|---|
| 1 | HØJ — `webinar-tilmeld` FLYTTEDE en tilmelding uden legitimation: enhver med en andens mail kunne flytte vedkommendes tilmelding til en anden session | Den offentlige vej bruger `offentligTilmeldDom`, som ALDRIG flytter: samme mail på en anden session bliver en NY række (to rækker får ikke dobbelte påmindelser — mailcronens dubletværn giver kun den nærmeste session påmindelser pr. mail). Flyt findes KUN i `webinar-rum` «gen_tilmeld», hvor deltagertokenet beviser personen (`tilmeldDom`). Værn `webinarMotorRaad.guard` dom 1 |
| 2 | MELLEM — enumeration: svaret sagde `dublet: "samme"`/`"flyttet"`, og en kendt mail fik 200 på en afholdt session, hvor en ukendt fik 409 «forbi» | ÉT ensartet svar for alt andet end en ny række: `{ ok, session, token: null, link_paa_mail: true }` (også honningfeltet og kapløbet); intet `dublet`. Sessionens afvisninger (aflyst · forbi · fuld) dømmes FØR «kendt», for alle. Fladen siger «Tjek din mail». **Rest-risiko (bevidst):** en ny række bærer tokenet, en kendt ikke — men at prøve en fremmed mail, der ikke står på listen, OPRETTER en tilmelding og sender personen en bekræftelse: støjende og synligt. Værn dom 2 |
| 3 | MELLEM — `webinar-puls`: intet loft over tid på spørgsmål og reaktioner | Loft pr. (tilmelding, time): **10 spørgsmål, 120 reaktioner** (regnestykket i `puls.ts:HANDLING_LOFT_PR_TIME`), talt i `webinar_motor_log` FØR indsættelsen, fail-closed; over loftet `over_loft` (en gentaget, allerede modtaget `klient_id` er stadig `dublet`). Værn dom 3 |
| 4 | MELLEM — intet stod mellem en offentlig session og en tilmelding | Låsen `webinarmotor_offentlig_aktiv` (§7.3), `laasDom` FØR dubletdommen, `bagLaasen` foran hver `naesteSessioner` i `webinar-tilmeld` og `webinar-rum`; migrationen lægger nøglen = false (`ON CONFLICT DO NOTHING`). Værn dom 4 |
| 5 | MELLEM — `/webinar` og delingen talte den interne prøve | `erInternTilmelding` filtrerer FØR hele dommen i begge spejle; begge hentninger beder om tekststien `intern:raa->>intern` (aldrig hele `raa`). Paritet + test. Værn dom 5. **Tilføjet 2/10:** målstregerne og annoncepriserne fik de rå rækker og talte den interne prøve — nu samme filter i hver doms indgang i begge spejle; værn `webinarMotorRaad.guard` dom 5b (§8.4) |
| 6 | MELLEM — dubletværnets «nærmeste session» er pr. mail på tværs af eWebinar og motoren | Dokumenteret i §7.3: testadresser må ikke stå på eWebinar 13/10 |
| 7 | LAV — `ansoegning-gem` manglede i deploy-listen, selv om den delte `_shared/ansoegningSkema.ts` er ændret | Tilføjet i runbookens trin 4 med sit bevis |
| 8 | LAV — `set_procent_kilde` hed «boardroom-1» i SQL'en og MOTOR_VERSION i cronen; migrationskommentaren påstod, at `varighed_sek` kom fra Bunny | ÉT navn, «boardroom-bitmap» (`fremmoede.ts:SET_PROCENT_KILDE_MOTOR`), i begge; kommentaren siger nu, at varigheden TASTES. Værn dom 8 |
| 9 | LAV — tokenet i URL'en | Bogført i `docs/tracking.md` række 27 |

**Målt i prod 3/10-2026 ca. 01:05 — «P-» er ikke et sikkert filter i SQL:** én eWebinar-tilmelding har et registrant-id, der begynder med «P-» (`P-JirsFNyOpp0cKQN99pf`; 1 af 845 rækker, 3 rækker i `webinar_mails`). Koden er sikker — `erMotorId` kræver hele formen «P-<uuid>» (`mail.ts:MOTOR_ID_FORM`) — men en `like 'P-%'` i en bevis-SQL tæller eWebinar-rækken med. Runbookens trin 8 og 10 bruger derfor `~ '^P-[0-9a-f]{8}-'`; brug den form (eller `kilde_system = 'platform'`) i al SQL om motorens rækker.

**Værn:** `webinarMotorSkive3.test.ts` (fremmøde, mailvej, intern, formularerne) og `webinarMotorSkive3.guard.test.ts` (seks domme med mutationer: ordene, mailvejen, cronen, den interne session, migrationerne, opsætningen). Paritet: `fremmoede.ts` og `mail.ts` er spejlet ordret (elleve filer). `MOTOR_VERSION` = «boardroom-3».

### 7.7 Værtskonsollen (minimal) — `/webinar/motor/session/:id` (3/10-2026, grenen `feat/webinar-vaertskonsol`, IKKE udrullet)

§8.4 punkt 4. Bag `AdvisorRoute`, i INGEN menu — nås fra knappen «Konsollen» på sessionens række på `/webinar/motor`. Viser sessionens titel, tid og rum (motorens `positionDom` på **serverens ur**: `webinar_server_nu()` måles hvert minut, `urForskydning` som i seerens rum; før migrationen står «Efter dit ur»), **antal i rummet nu** og **spørgsmålskøen** hentet hvert 10. sekund (TanStack `refetchInterval`, **ingen Realtime** — spec §D3; spec'ens §B4 foreslog Realtime for rådgiverne, opgaven sagde polling) med ét svarfelt pr. ubesvaret spørgsmål. Rene domme i `src/lib/webinarMotorAdmin/konsol.ts` (sortering nyeste øverst, «ubesvaret» = status `ny`, svaret trimmet 1–1000 tegn, leveringens ord, fejlens art), I/O i `src/hooks/webinarKonsol.ts`, fladen `components/hjemmebane/webinarMotor/WebinarKonsol.tsx`.

**Målt før bygningen (kodelæst i de reviewede migrationer — de er IKKE kørt i prod):**
- `20261003010000`: `webinar_spoergsmaal` har RLS med «Service role can manage» (ALL) og «Advisors can view» (SELECT, `has_role(auth.uid(),'advisor')` — tjenestekonti er IKKE udelukket). **Ingen UPDATE for rådgivere og ingen trigger** — seerens felter var kun beskyttet af, at ingen klient havde UPDATE. `20261003030000` rører ikke tabellen.
- **Svarvejen til seeren** (`webinar-puls` trin 3): service role læser rækker med seerens `tilmelding_id`, `status = 'besvaret'` og `leveret IS NULL`, sender `svar_tekst` i pulsens svar og sætter `leveret = 'live'`, `leveret_at`. Svaret skrives altså i `svar_tekst` + `status = 'besvaret'`. Pulsen leverer kun, mens seeren pulser (rummet ≠ `foer_lobby`/`aflyst`); svar på mail til den, der er gået, er skive 5 og IKKE bygget — konsollen lover det ikke.
- **«I rummet»:** rådgivere har SELECT på `webinar_deltagelser` → `count` med `sidste_puls_at > serverens nu − I_RUMMET_SEK` (60 s, samme vindue som pulsens tal). Rådgiveren ser det reelle tal, også under 10.
- **Fornavn:** rådgivere har SELECT på `webinar_tilmeldinger` (`20260919130000`), så køen indlejrer `webinar_tilmeldinger(fornavn)` — KUN fornavn (værn dom 3). Spørgsmål fra eWebinar findes ikke.
- Tabelrettigheden (`GRANT UPDATE` til authenticated) er UMÅLT; migrationens FØR-SQL måler den (sektion 4) og siger STOP, hvis den er false.

**Migration `20261003050000_webinar_vaertskonsol.sql`** (kun tilføjende, ingen SECURITY DEFINER, ingen anon, ingen DROP af andres objekter): (1) UPDATE-politikken «Advisors can answer webinar_spoergsmaal» — rådgivere MINUS tjenestekonti (husets mønster for skrivning, som `opkaldsanmodninger`); (2) BEFORE UPDATE-triggeren `webinar_spoergsmaal_vaert_kolonnevaern` (SECURITY INVOKER, form som `opkald_raadgiver_kolonnevaern`): en klient må KUN ændre `status`, `svar_tekst`, `svaret_af`, `svaret_at`; kun `ny → besvaret` (ét svar pr. spørgsmål — en rettelse kunne nå seeren som den gamle tekst, fordi pulsen læser før den markerer); kun mens `leveret IS NULL`; 1–1000 tegn efter trim; `svaret_af = auth.uid()`; `svaret_at = now()` (serverens ur); service_role og postgres passerer; (3) `webinar_server_nu()` (SECURITY INVOKER, `select now()`, EXECUTE kun authenticated).

**Tjenestekontoen** (CTO 3/10, LAV): svarfeltet vises aldrig for den (`visSvarfelt` med `erTjenestekonto` fra AuthContext), mutationen afviser den før skrivningen, og 0 rækker for den hedder «tjenestekonto» (`nulRaekkerGrund`); RLS siger det samme. Fladens tekst: «Svaret vises for seeren ved næste puls, hvis seeren stadig er i rummet — der sendes intet på mail.» Migrationens prøve dækker tjenestekonto → 0 rækker, medlem → 0 rækker og andet svar → 55000 (savepoints, forventet udfald pr. linje).

**Fail-soft:** før skive 1 (42P01/PGRST205/42703/PGRST204) står «Konsollen virker, når migrationen er kørt.» Efter skive 1, men før `050000`, læser konsollen alt, men et svar rammer 0 rækker (RLS) — hooken læser rækken igen og siger «konsollen kan først svare, når migrationen 20261003050000 er kørt» (står den stadig `ny`), ellers «en anden har svaret imens».

**Rækkefølgen:** merge → `20261003010000` KØRT (forudsætning) → `20261003050000` KØRT: FØR-SQL og EFTER-SQL som ét resultatsæt hver (filhovedet; facit: tre politikker, triggeren, funktionen, `has_table_privilege` = true, anon uden EXECUTE) og prøven i én transaktion med `rollback` (filhovedet) → **Update**. Ingen edge function er ændret; intet skal udrulles.

**Værn:** `webinarKonsol.guard.test.ts` (syv domme med mutationer: ruten bag AdvisorRoute og i ingen menu; ingen Realtime; kun fornavn; svaret kun i svar-kolonnerne og vagtet på `ny`; migrationen; hooks i topblokken; tjenestekontoen) og `webinarKonsol.test.ts`. `webinarMotorSkive3.guard` dom 6 tillader nu `konsol.ts` som stiens eneste bygger; `webinarMotor.guard` dom 5 kender den nye migration.

**Ikke bygget (bevidst):** afvis, «offentlig/FAQ», hænder oppe som egen liste, synk/afspillerfejl, «online»-status og autosvar (spec §A7/§B4). ~~svar på mail (skive 5), klokketyper~~ — **BYGGET 3/10-2026, §7.10** (klokketypen `webinar_spoergsmaal`; `webinar_haand`/`webinar_drift` er stadig ikke bygget).

### 7.8 Ansøgningen kobles til tilmeldingen på id — `ansoegninger.webinar_tilmelding_id` (3/10-2026, grenen `feat/webinar-ansoegning-kobling`, IKKE udrullet)

§8.4 punkt 7 (spec §A9, «skive 4»). For første gang kobles ansøgning og webinar på **id**, ikke kun på mail.

**Målt før bygningen (kodelæst, ikke prod):**
- `ansoegning-gem` «opret» er STRIKS (`KENDTE_FELTER`, `ukendteFelter` → 400; `bodyFelter.guard` + `ansoegningGemKendteFelter.guard`). Fladen sender `kilde, kilde_raa, annoncespor, ga, meta, svar, firma, visning_id`. Insert'en er ÉN `insert(...)` af kilde/ip_hash/svar; alt andet (annoncespor + user agent, GA, Metas cookier, visningen) er EGNE fail-softe updates bagefter — mønstret, koblingen følger.
- Deltagertokenet verificeres af `verifyDeltagertoken` (`_shared/webinarDeltagerAuth.ts`): form → HMAC i konstant tid (ingen databaseopslag for et forfalsket token) → rækken → `token_version` → `kilde_system = 'platform'`. Grundene: `ingen_secret · form · aftryk · ukendt · version · ikke_platform · opslag`. Tokenet har intet udløb — «udløbet» er tilbagekaldelsen (`token_version += 1` → `version`). `WEBINAR_JOIN_SECRET` læses KUN dér (`webinarMotor.guard` dom 4).
- Fladen: exitrummet åbner `/ansoeg?kilde=webinar#wt=<token>`; `useWebinarForudfyld` læste tokenet ved mount, fjernede fragmentet og smed tokenet væk efter «forudfyld». `landingUdenToken` skræller fragmentet af i begge spejle (`webinarRum.guard` dom 6), og annoncesporets `landing` læses af den URL, siden blev ÅBNET med — tokenet nåede aldrig sporet. `?kilde=webinar` er et af de seks kildeord; intet nyt.
- **Kolonnen findes allerede i skive 1's migration** (`20261003010000` §5: `webinar_tilmelding_id uuid references webinar_tilmeldinger(id) on delete set null` + det delvise indeks `ansoegninger_webinar_tilmelding_idx`, «skive 4 skriver den»). FK'en kræver kun `webinar_tilmeldinger` (i prod siden `20260919130000`), men koblingen virker først efter skive 1 — prædikatet læser `kilde_system`/`token_version`.
- RLS på `ansoegninger` (`20260918200000` §6): rådgivere SELECT + UPDATE, service role ALL, **ingen anon- og ingen medlemspolitik** → kolonnen kan ikke skrives af anon eller et medlem. Rådgivere kan (som alle kolonner) — uændret.

**Valget — og hvorfor (afviger bevidst fra spec'ens egen handling `fra_webinar`):** tokenet rejser med «opret» som det valgfrie felt **`webinar_token`**, ikke i en ny handling. Forudfyldningen findes allerede i `webinar-rum` «forudfyld» (skive 2), så en `fra_webinar`-handling i `ansoegning-gem` ville være en anden vej til de samme persondata; koblingen skal ske på rækken, og rækken findes først ved «opret». Én vej, ét kald, intet nyt svar med persondata.

**Bygget:**
- `_shared/ansoegningWebinarKobling.ts` — `koblWebinarTilmelding(admin, ansøgnings-id, token, prædikat)`: kaster aldrig; skriver KUN `webinar_tilmelding_id` (vagtet `is null`); prædikatet gives ind (det rigtige er `verifyDeltagertoken`, importeret i index.ts — koblingen selv importerer kun typer og læser hverken secret eller HMAC).
- `ansoegning-gem` «opret»: `webinar_token` på `KENDTE_FELTER`; koblingen er en EGEN fail-soft update EFTER de fire andre; svaret bærer **`webinar_kobling`** = `koblet · intet_token · ugyldigt · fejl` (ingen persondata) — **beviset for udrulningen**, kun den nye kode har feltet. `ugyldigt` = tokenets skyld (form, aftryk, ukendt, version, ikke_platform); `fejl` = vores (ingen secret, opslag, 42703 «kolonne_mangler», update, nul rækker, undtagelse). Grunden logges (`console.warn`), tokenet aldrig. Honningfeltets svar har samme form (`udfaldUdenKobling`, intet opslag).
- Fladen: `useWebinarForudfyld` returnerer nu en ref med tokenet — KUN i sidens hukommelse (aldrig localStorage/sessionStorage, aldrig i URL'en efter mount); `Ansoeg.tsx` sender den med `opretAnsoegning` og nulstiller den efter en lykkedes «opret».
- **Ingen egen migration.** Kolonnen og indekset står i skive 1 (`20261003010000` §5), som ikke ændres. En migration med kun en kolonnekommentar ville være en kørsel uden virkning for Jonas (koordinatoren 3/10 — et første udkast `20261003060000` med kommentar + idempotent gentagelse blev bygget og FJERNET før merge). Kolonnens beskrivelse står som kode-kommentar i `_shared/ansoegningWebinarKobling.ts`.

**Kendt grænse:** koblingen sker KUN ved «opret». Har personen en levende kladde i localStorage og åbner exitrummets link, genoptages kladden (forudfyldningen udfylder kun tomme felter), og intet kobles — mailkoblingen er reserven. Et forsøg på at koble ved «gem» er bevidst ikke bygget (tokenet ville skulle leve længere i hukommelsen for et sjældent tilfælde).

**Læseren — IKKE bygget i denne skive:** tragten på `/webinar` (`src/lib/webinar/dashboard.ts` ⇄ `_shared/webinarDashboard.ts`, `annoncepriser`) kobler stadig på mail, med rådgiverens bekræftede kobling (`medWebinarKobling`, 1/10) som erstatning. **Sådan skal kolonnen bruges, når læseren bygges:** `hooks/webinar.ts` (og `webinar-delt`) henter `webinar_tilmelding_id` og den indlejrede `webinar_tilmeldinger(email)` og lægger tilmeldingens mail i `AnsoegerMail.webinar_email` — SAMME felt og SAMME `medWebinarKobling`, så tragt, sessioner, tid, annoncespor og koblingstal følger på én gang; forrang: id-koblingen → rådgiverens bekræftede kobling → ansøgningens egen mail. **Afvigelsen er et fund, aldrig en stille tælling** (CTO 3/10, LAV): læseren sammenholder `lower(ansoegninger.email)` med tilmeldingens mail; er de forskellige (et videresendt link — tokenet beviser LINKET, ikke at ansøgeren er tilmeldingens person), tælles koblingen ikke i stilhed, men vises som et fund ved ansøgningen og i tragten («koblet på id, men mailen afviger»), så en rådgiver kan tage stilling — samme ånd som «forslag + klik» (1/10). **For 3/11 gør den koblingen entydig:** en ansøger, der tilmeldte sig under én mail og ansøgte under en anden, eller som stod på flere sessioner, peger på præcis den tilmelding, hvis exitrum hun kom fra — mailkoblingen kan hverken finde den første eller skelne den anden. Paritetstest og `findMailVaerdier`-værnet i `webinar-delt` skal med i den PR.

**Rækkefølgen:** merge → `20261003010000` (skive 1) KØRT → kolonnen MÅLT: `GET /rest/v1/ansoegninger?select=webinar_tilmelding_id&limit=0` → 200 (42703 = skive 1 ikke kørt) → eksplicit deploy af `ansoegning-gem` fra build-chatten (delt fil `ansoegningWebinarKobling.ts` trækkes ind — merge udruller ikke) → **beviset:** en «opret» med honningfeltet udfyldt (`firma` ≠ tom — opretter INGEN række) svarer `"webinar_kobling": "intet_token"`; kun den nye kode har feltet. Derefter, med et rigtigt token fra en intern prøvesession: `"koblet"` og `select webinar_tilmelding_id from ansoegninger where id = …` sat → **Update** (fladen sender tokenet). **Aldrig Update før deploy:** den gamle function er STRIKS og ville afvise `webinar_token` med 400 — hver ansøger fra exitrummet ville få en fejl ved første «Næste».

**Værn:** `webinarAnsoegningKobling.guard.test.ts` (seks domme med mutationer: tokenet gemmes aldrig — kolonne (skive 1's migration), enhed; tokenet når aldrig `landing`; fail-soft — efter insert'en, ingen afvisning før svaret, alle fejludfald; kun prædikatet fra `webinarDeltagerAuth.ts`; STRIKS kender feltet og kun «opret» sender det; koblingen skriver KUN `webinar_tilmelding_id` og KUN når den er null — én update, `.is(…, null)`, ingen insert/upsert/delete/rpc, `ansoegning-gem` rører ikke kolonnen selv, og ingen egen migration for skive 4). `ansoegningGemKendteFelter.guard` dækker feltet uændret (det står i `opretAnsoegning`'s args-type). `check-edge-function-auth` uændret: `ansoegning-gem` bærer allerede `verifyAnsoegningstoken`, og `verifyDeltagertoken` er registreret.

### 7.10 Webinarchattens bagende — klokken ved et nyt spørgsmål og svaret på mail (3/10-2026, grenen `feat/webinar-chat-bagende`, IKKE udrullet)

Spec'ens skive 5 (bagenden; fladen er minimal). **Målt i prod 3/10:** i Mortens webinar 22/9 skrev 83 af 384 i chatten (154 beskeder) — chatten er det mest brugte. Motor før flade: dommene er rene og spejlet ordret (`src/lib/webinarMotor/{klokke,svarMail}.ts` ⇄ `supabase/functions/_shared/webinarMotor/`; paritetstesten kender nu tretten filer).

**Målt før bygningen (kodelæst i migrationshistorikken — ikke i prod):**
- `advisor_notifications.type` er `TEXT NOT NULL` **uden CHECK** (20260226070216; ingen senere migration tilføjer en). Derfor ingen CHECK-migration for typen. Migrationens FØR-SQL sektion 3 MÅLER det i prod — står der en CHECK, STOP.
- **`dedupKunUlaeste` passer på reglen, men ikke på vejen:** `skrivRaadgiverBesked` (a) logger ved fejl (`console.error`), og `webinar-puls` må kun logge fejlsummen (`webinarMotor.guard` dom 3); (b) den indsætter alle rækker i ÉN insert, så en 23505 fra delindekset ville tabe de andre rådgiveres rækker. Reglen genbruges derfor, ikke writeren: `raadgivereUdenUlaestKlokke` (klokke.ts) er bevist lig `raadgivereUdenRaekke(…, kunUlaeste = true)` på alle 64 kombinationer (`webinarChatBagende.test.ts`), og I/O'en `_shared/webinarSpoergsmaalKlokke.ts` er en egen, tavs skriver.
- Pulsens levering «live» er allerede vagtet (`.is("leveret", null)`). Den samme vagt bærer mailens idempotens.

**A. Klokken ved et nyt spørgsmål** (`webinar-puls` → `ringSpoergsmaalKlokke`):
- **Højst én gang pr. pulskald** (CTO 3/10, fund 4): efter handlingsløkken, og kun når mindst ét spørgsmål blev «ok», ringer klokken `webinar_spoergsmaal` hos **alle rådgivere — også tjenestekonti** (fund 2: husets regel for klokker, CLAUDE.md «Tjenestekonti» — kontoen skal se alt; MAILEN filtreres i `klokke-mail-cron` med `udenTjenestekonti`). `reference_type = webinar_session`, `reference_id` = sessionens id → konsollen `/webinar/motor/session/<id>` (`raadgiverSti` gennem `konsolSti` ⇄ `klokkeMail.klokkeSti`, paritet i `klokkeMail.test`). Titlen er «Nyt spørgsmål i webinaret «<titel>»». Brødteksten nævner aldrig seeren eller spørgsmålet.
- **Højst én ULÆST pr. (rådgiver, session):** dedup-opslaget før indsættelsen, plus delindekset `advisor_notifications_webinar_spoergsmaal_ulaest_uidx` (migration `20261003080000`) for to spørgsmål i samme sekund. **Én INSERT pr. rådgiver** (fund 5): et 23505 gælder kun den ene række og tælles som «fandtes». En læst klokke spærrer ikke.
- **Støjen** (fund 3): morgenmailen springer en webinarklokke over, når dens session ikke har ét spørgsmål med status «ny» (`udenBesvaredeWebinarKlokker` i `_shared/klokkeMail.ts`; `klokke-mail-cron` slår sessionerne op; læsefejl = fail-open, klokken mailes; rækken stemples ikke, så et nyt ubesvaret spørgsmål stadig kommer med; svaret bærer `webinar_uden_ubesvarede`). Og konsollen markerer sessionens klokke LÆST, når en rådgiver har den åben (ved åbning og ved hver hentning af køen, `useMarkerKonsolKlokkeLaest`) — gated af `laeseMarkeringTilladt`, så tjenestekontoen intet markerer (`tjenestekonto.guard` dom 6).
- **Listen er MORGEN** (`_shared/klokkeMail.ts`, spec'ens §B1-forslag). Der sendes aldrig en mail pr. spørgsmål under en session, for værterne sidder i konsollen. Et webinar kører dog også, når ingen sidder der: en klokke, ingen har læst før kl. 07, står i næste hverdags morgenmail («et signal, kun en browser kan vise, er ikke et signal»).
- **Fail-soft:** klokken ringes EFTER indsættelsen og FØR «ok». Den kaster aldrig, logger aldrig og har en frist på 2 s (`KLOKKE_FRIST_MS`, `Promise.race`). Dens fejl lægges i pulsens fejlsum, og spørgsmålet er «ok» uanset klokken.

**B. Svaret på mail til den, der er gået** (`webinar-motor-cron` → `_shared/webinarSvarMailKoersel.ts`):
- **Hvilke svar:** et besvaret spørgsmål med `leveret IS NULL`, svaret inden for 7 døgn (`SVAR_MAIL_VINDUE_DAGE` — en ny lås må ikke sende gamle svar ud), hvor seeren **ikke har pulset i 180 s**, eller sessionen er slut (exitrummets slut, `sessionTider`; en aflyst session er slut).
- **N = 180 s — regnestykket** (står ved `SVAR_MAIL_GAAET_SEK`): «i rummet» = en puls inden for `I_RUMMET_SEK` = 60 s. Den langsomste puls er 60 s (venteværelse og pause). En skjult fane drosles (Chrome: højst én timer i minuttet), så en 60 s-puls kan lande op til ~120 s efter den forrige. 3 × 60 = 180 s > 120 s → tre tomme «i rummet»-vinduer i træk er en seer, der er gået. Cronen kører hvert 5. min, så mailen når frem 3–8 min efter, at seeren gik. Det svarer til spec'ens «efter 3 min», og «180 s > 2 × `PULS_ROLIG_MS`» er prøvet.
- **Til hvem:** KUN tilmeldingens egen mail (`kilde_system = 'platform'`). **Afmeldte aldrig** (`webinar_afmeldinger` ELLER «Unsubscribed» på rækken; kan afmeldingerne ikke læses, sendes INTET). En **intern** session kun til husets adresser (`erInternAdresse`). En adresse, Mailgun har afvist («ugyldig» i loggen), prøves aldrig igen på mail, og et spørgsmål opgives på mail efter **6 tydelige afvisninger** (`SVAR_MAIL_MAKS_AFVISNINGER`, husets tal; talt i loggen, art «afvist» — fund 6). **Uden Mailgun-nøgle tages intet** (fund 6).
- **Idempotensen — valgt: en vagtet UPDATE FØR afsendelsen** (`set leveret = 'mail', leveret_at = nu where id and status = 'besvaret' and leveret is null`), ikke spec'ens spor `webinar_svar_mails` med unikt indeks. Begrundelsen: et spor skrives EFTER afsendelsen (husets form) og kan ikke stoppe pulsen, der imens leverer samme svar live. Vagten på selve rækken kan: pulsen og cronen (og to kørsler) rammer samme vagt, og den, der får 0 rækker, har tabt (`taget_imens`). Udfaldet står bagefter i `webinar_motor_log` (art `svar_leveret`, `via: "mail"`, udfald, status og mailgun_id — aldrig mail, navn eller Mailguns tekst):
  - ok → rækken er «mail», `mail_udfald = 'sendt'`.
  - **Ukendt** (timeout · `fejl` uden status · `fejl` ≥ 500 — ordret `afsendelseUkendt`, prøvet på alle udfald × statusser) → rækken BLIVER «mail» med `mail_udfald = 'ukendt'` og sendes **aldrig igen automatisk** (husets dubletværn: hellere ét manglende svar end en dublet). Alarmen siger, at Mailguns log skal slås op.
  - En **tydelig afvisning** → rækken gives FRI igen med `mail_udfald = 'afvist'`, vagtet på vores eget stempel (`leveret = 'mail' and leveret_at = <vores>`). Så kan pulsen levere den, hvis seeren kommer tilbage, og næste kørsel kan prøve igen (højst til de 7 døgn). 403/420/429 stopper kørslen.
- **Mailgun EU** (`sendMailgun`, aldrig Lovables mail-API), afsender `AFSENDER` (Morten), svar-til `SVAR_TIL` og `List-Unsubscribe`. **Mailgun-kontoen er én** (spec §D6): passet regner `beregnKoerselsLoft` over både `webinar_mails`' forsøg og sine egne (loggen) de sidste 60 min, og det venter under en pause. **Kendt hul:** `webinar-mail-cron` tæller ikke svarmailene med i sit eget loft (højst et par hundrede pr. session mod loftet 1000).
- **Teksten** (`bygSvarMail`): emnet «Svar på dit spørgsmål fra webinaret», «Hej <fornavn>», webinarets titel, **spørgsmålet ordret og svaret ordret** (escapet i HTML), «Har du flere spørgsmål, kan du svare på denne mail», hilsen fra værtens fornavn (ellers Morten) og afmeldingslinket som i de andre webinarmails. Uden `WEBINAR_AFMELD_SECRET` sendes intet, og intet tages. Ingen påstand om «live», ingen «optagelse», intet gensyn (prøvet).
- **Låsen** `app_config.webinar_svar_mail_aktiv` (fraværende = false, fail-closed; migrationen lægger den som false `ON CONFLICT DO NOTHING`). En rigtig afsendelse kræver `dry_run: false` OG (låsen ELLER prøven). **Prøven:** body-feltet `email` (den STRIKSE body er nu `dry_run · session_id · nu · email`) sender uden låsen, KUN til den adresse.
- **Isoleret:** passet kører EFTER fremmødet (også når fremmødet væltede), kaster aldrig og rører aldrig fremmødets `ok`/`fejl`/status. Budgettet: `SVAR_MAIL_SENESTE_START_MS` = 60 000 − 5 000 − (5 000 + 10 000 + 5 000) = 35 000 ms. **Passet springes HELT over — før første læsning — når forløbet ved dets start er over 35 000 ms** (fund 1, `svarPassetMaaBegynde`): fremmødet starter en tilmelding senest ved 42 000 ms (`fremmoede.SENESTE_START_MS`) og kan slutte ved 55 000 ms; da er alle svar udsat til næste kørsel (svaret: `sprunget_over_af_budget`, `forloebet_ved_start_ms`). Hver mail tjekker samme grænse igen.
- **Beviset:** svaret bærer `svar_mail: { laas_aktiv, sender_rigtigt, proeve, kandidater, skal_sendes, sendt, sprunget, sprunget_grunde, taget_imens, fejlede, ukendte, udsat, stoppet, loft, alarm, fejl }`. Kun den nye kode har feltet.
- **Alarmen:** én mail pr. dansk TIME (`webinar-svar-mail:<dato>T<time>`; `email_send_log` slås op først) gennem `sendManagedEmail` til `driftModtager()`, kun i en rigtig kørsel og kun ved afviste, ukendte, stop eller fejl. Ingen drift-klokke (den ville kræve `reference_type` på `SELVMAILENDE_REFERENCER`; mailen er nok).
- **Konsollen siger sandheden:** «der sendes intet på mail» er erstattet af den rene dom `svarLoefteTekst(laas)` (konsol.ts), som følger låsen og med låsen åben tager forbeholdet «hvis seeren kan modtage mail (ikke afmeldt, og adressen tager imod)» (fund 7). Låsen læses fail-soft i `useSvarMailLaas`: en fejl giver «kan ikke læses lige nu», en manglende række giver «lukket». **Leveringen skelner** (fund 7) på rækkens `mail_udfald` (rådgivere læser ikke `webinar_motor_log`): «Sendt på mail kl. …» · «Forsøgt sendt … — det vides ikke, om den kom frem» · «Mailen blev afvist — svaret vises, hvis seeren kommer tilbage i rummet».

**Migration `20261003080000_webinar_chat_bagende.sql`** (IKKE KØRT; kun tilføjende, én transaktion, porten: skive 1 kørt): låsen = false, klokkens delindeks og kolonnen `webinar_spoergsmaal.mail_udfald` (CHECK sendt · ukendt · afvist; værtskonsollens kolonneværn lader ingen klient ændre den). FØR- og EFTER-SQL står som ét resultatsæt hver i filhovedet.

**Rækkefølgen (ét skridt ad gangen):**
1. Merge (efter skive 1 → 2 → 3, konsollen og skive 4 (ansøgningskoblingen), som denne gren står på — stakken omordnet 3/10: tilmeldingernes CAPI-gren ligger nu OVEN PÅ denne) → `20261003010000` (skive 1) og `20261003050000` (konsollen) KØRT.
2. `20261003080000` KØRT: FØR-SQL gemt (sektion 3 = «ingen», ellers STOP) → migrationen → EFTER-SQL gemt (låsen `false`, indekset).
3. Eksplicit deploy fra build-chatten, i DENNE rækkefølge (rådets LAV 3/10): **først `klokke-mail-cron`** (`_shared/klokkeMail.ts` har fået typen på MORGEN-listen og dommen for webinarklokken — udrulles `webinar-puls` først, kan en klokke nå morgenmailen som typen «ukendt», uden sessionsdommen), og beviset er feltet `webinar_uden_ubesvarede` i en tørkørsel; **derefter `webinar-puls`** og **`webinar-motor-cron`**. Nye delte filer: `webinarSpoergsmaalKlokke.ts`, `webinarSvarMailKoersel.ts`, `webinarMotor/klokke.ts`, `webinarMotor/svarMail.ts` — merge udruller ikke.
4. **Beviserne:** (a) `SELECT public.kald_edge('webinar-motor-cron');` → svaret bærer `svar_mail` med `laas_aktiv: false`, `sender_rigtigt: false` og `fejl: []`, og fremmødets felter er uændrede. (b) `klokke-mail-cron`s bevis er taget i trin 3, FØR `webinar-puls`. (c) Et spørgsmål i en intern prøvesession → én række `webinar_spoergsmaal` i `advisor_notifications` pr. rådgiver (også tjenestekontoen); et spørgsmål nr. to giver ingen ny ulæst; åbnes konsollen, står klokken læst.
5. Update i Lovable (konsollens tekst og klokkens vej).
6. **Prøven** til en HUSADRESSE (`@topix.dk` eller `@theboardroom.dk` — fund 8: kun dem kan tilmelde sig en intern session, `internDom`, og svarmailen til en intern session går kun til husets adresser; `lh@greensolar.dk` kan derfor IKKE bruges her): tilmeld adressen den interne session, stil et spørgsmål, svar i konsollen, luk fanen og vent 3 min → `{"dry_run": false, "email": "<husadressen>"}` → `svar_mail.sendt = 1`, rækken står med `leveret = 'mail'` og `mail_udfald = 'sendt'`, og mailen ligger i indbakken med spørgsmålet og svaret ordret. En ny kørsel sender den IKKE igen. **OBS:** `dry_run: false` (med eller uden `email`) kører OGSÅ fremmødepasset for alvor, når `webinar_motor_aktiv` er åben (og for en intern session med `session_id`) — prøven er kun en grænse for SVARMAILEN. Kør den derfor mens `webinar_motor_aktiv` er lukket, eller med vished om, at fremmødedommen for de afsluttede sessioner må skrives (og deres Klaviyo-hændelser sendes).
7. **Jonas åbner låsen** (SELECT før/efter, UPDATE vagtet på false): `update public.app_config set config_value = 'true'::jsonb, updated_at = now() where config_key = 'webinar_svar_mail_aktiv' and config_value = 'false'::jsonb;`

**Værn:** `webinarChatBagende.guard.test.ts` (elleve domme med mutationsbevis: låsen fail-closed; ingen mail til afmeldte; én pr. spørgsmål; tjenestekonti FÅR klokken (vendt efter CTO-rådet); klokketypen på en liste; pulsen ringer højst én gang pr. kald, én insert pr. rådgiver; cronens pas isoleret og efter fremmødet (mutation: rækkefølgen byttet); konsollens tekst og leveringen; budgettet før første læsning; støjen (morgenmail + læst i konsollen); loftet på afvisninger og ingen nøgle → intet taget) og `webinarChatBagende.test.ts`. `tjenestekonto.guard`: klokkens I/O på `EDGE_UNDTAGET` (klokker), konsollens hook på `LAESE_STEDER`.

**CTO-rådets ni fund 3/10 (dom «RET FØRST») — rettet på samme gren:** (1) budgettet før første læsning; (2) klokken også til tjenestekonti — husets regel; (3) morgenmailen uden besvarede sessioner + konsollen markerer klokken læst (gated); (4) højst én klokke pr. pulskald, efter løkken; (5) én insert pr. rådgiver; (6) loft på 6 afvisninger, og uden Mailgun-nøgle tages intet; (7) forbehold i løftet og leveringen skelner sendt/ukendt/afvist (`mail_udfald`); (8) prøven på en husadresse, og at `dry_run: false` også kører fremmødet for alvor; (9) mutation for rækkefølgen i dom 7. Flyttet til den nye sandhed (ikke slækket): `webinarMotor.guard` dom 3 (pulsens imports, og den nye fil logger aldrig) og dom 5, `webinarKonsol.guard` dom 5 (migrationen efter) og dom 1 (klokken er `konsolSti`s anden kalder), `klokkeChat.guard` (klokke.ts' import af `konsolSti`) og `webinarMotor.paritet` (tretten filer).

**Ikke bygget (bevidst):** `webinar_haand`/`webinar_drift`; autosvar og «online»-status; afvis/«offentlig» i konsollen; Realtime i konsollen; at `webinar-mail-cron`s loft tæller svarmailene med.

## 8. Vejen til første offentlige session (udkast 3/10-2026 nat — AFVENTER JONAS' BESLUTNINGER)

Jonas 2/10: første rigtige session på egen platform i starten af november, tilmelding åben ca. tre uger før — «vi skal have styr på hele setuppet snarest». Planen er lagt af planlægningsagenten 3/10 nat (kun læsning) og efterprøvet mod prod på ét punkt (§7.6-noten om «P-»). **Intet her er besluttet, før Jonas har svaret på §8.2.**

**Målt i prod 2/10 aften:** den eneste programsatte session er eWebinars 13/10 kl. 11 (370 tilmeldte). Der findes ingen novembersession nogen steder.

### 8.1 Den kritiske sti (forslag: session tirsdag 3/11 kl. 11, tilmelding åben onsdag 14/10)

14/10 er dagen efter eWebinars sidste programsatte session — widgetten har alligevel ingen dato derefter.

| # | Hvornår | Skridt | Hvem | Beviset før næste skridt |
|---|---|---|---|---|
| 1 | lør 3/10 | Beslutningerne §8.2 | Jonas | Bogført her |
| 2 | søn 4/10 | Merge skive 1 → 2 → 3 (v2-grenene; afløser #1158/#1161/#1173) | Claude PR, Jonas go | CI grøn på hver (`gh run list --branch`) |
| 3 | søn–man | Migrationerne `20261003010000` og `20261003030000` (IKKE `031000`) | Jonas, SQL editor | EFTER-SELECT gemt; begge `GET …?limit=0` → 200 |
| 4 | man 5/10 | Secrets `WEBINAR_JOIN_SECRET`, `BUNNY_WEBINAR_LIBRARY_ID`, `BUNNY_WEBINAR_TOKEN_AUTH_KEY`; Bunny-biblioteket «Webinar» (EU, token-auth, referrer app.theboardroom.dk) | Jonas | Rummet svarer ikke `embed_status: "ikke_sat_op"` |
| 5 | man 5/10 | Deploy `webinar-tilmeld`, `-rum`, `-puls`, `-motor-cron`, `-mail-cron`, **`webinar-delt`** (delte filer `annoncepriser.ts`/`webinarMaalstreger.ts`/`webinarDashboard.ts`), **`drift-agent-cron`** (`webinarMailAlarm.ts` via `driftDom.ts`), `ansoegning-gem` → Update (`klaviyoDato.ts`' nye `webinarKlokke` er rent tilføjende — dens andre importører udrulles IKKE for den, §7.3 trin 4) | Jonas/Lovable | `"motor":"boardroom-3"`, `motor_mail` og `ti_minutter.port` i mailcronens svar, `interne_fraregnet` i et delt-svar, `"drift_agent":"skive-1"`, `/webinar/motor` åbner |
| 6 | man 5/10 | Videoen ud af eWebinar (MP4 + CTA-tidskoder) → Bunny; varigheden tastes sekundpræcist | Jonas | GUID og længde noteret her |
| 7 | 6–7/10 | Intern prøvesession (runbook §7.3 trin 6–10) | Jonas + 2–3 interne | Mail med `/w/…?t=` + husets .ics; `set_procent > 0`; fremmødedom + Klaviyo `P-…:set`. **iPhone Safari og Android Chrome MED LYD på fysiske telefoner; Bunnys cookies i DevTools** |
| 8 | **fre 9/10** | **Go/no-go 1:** åbner vi tilmelding på platformen? | Jonas | Punkt 7 grønt — ellers reserve A |
| 9 | 8–12/10 | Privatlivstekst på topix.dk, tilmeldingsformularen (B2), Meta-signalet (B3) | Jonas, Claude | Teksten publiceret FØR første Meta-hændelse; `CompleteRegistration` set i Events Manager → Test events |
| 10 | man 12/10 | Det offentlige webinar + sessionen 3/11 oprettes, status aktiv | Jonas | Præcis én offentlig session |
| 11 | tir 13/10 kl. 11 | **P0-skygge:** intern session samtidig med eWebinars | 20–30 interne | `set_procent` afviger ≤ 5 pp for ≥ 90 % af dem i begge; synk p95 < 3 s |
| 12 | ons 14/10 | Låsen `webinarmotor_offentlig_aktiv` → true (SELECT før/efter, UPDATE vagtet på false); widget og annoncer peger på formularen | Jonas, marketing | En ekstern tilmelding står som `P-<uuid>`, bekræftelsen `ok` |
| 13 | 14–30/10 | `ti_minutter`, minimal konsol, lastprøve (~300 samtidige), afmelding prøvet, .ics i Apple Mail/Gmail/Outlook. **Lastprøven MÅLER `ti_minutter`-kapaciteten pr. kørsel** (CTO-rådets fund 1): ét realistisk hold på én session kl. hh:00 (4 slots) og kl. hh:30 (3 slots, det laveste for en halv/hel time) — `sendt`, `udsat` og `budget.forloebet_ved_stop_ms` pr. slot. Rækker 3 slots ikke til holdet: ekstra slot i job 573 for :00/:30, eller Mailguns batch med recipient-variables (§4) | Claude bygger, Jonas udruller | Ét resultatsæt med E3-punkterne; kapaciteten pr. kørsel som tal, og ingen `ti_minutter`-alarm i prøven |
| 14 | **tir 27/10** | **Go/no-go 2:** afholder vi på platformen? | Jonas | 11 og 13 grønne |
| 15 | tir 3/11 | **P1** | Morten/Jonas i konsollen | Fremmødedommen kørt; `/webinar` viser sessionen uden kodeændring |

**Før åbningen 14/10:** 2–7, 9, 10, 12. **Før 3/11:** 11, lastprøven, afmeldingsprøven, konsollen (hvis der loves svar undervejs). **Kan vente til efter P1:** `raaAdapter`, analytics, gentagelser/flyt/aflys-mails (en aflysning på platformen sender i dag INGEN mail), Bunny-upload fra fladen, klokker, svar pr. mail. **Undtagelsen:** `ansoegninger.webinar_tilmelding_id` (skive 4) — uden den kan tragten for 3/11 kun genskabes på mail bagefter.

**Uge 41–42:** ca. 8–10 udrulningsrunder for Jonas på ti dage; uge 42 er efterårsferie.

### 8.2 Beslutninger kun Jonas kan tage

| | Beslutning | Anbefaling | Blokerer |
|---|---|---|---|
| B1 | G1 ærlighed (ingen falsk chathistorik; «X venter» først fra 10, det reelle tal) | Ja | Formularens og rummets løfter |
| B2 | Hvor tilmeldingen bor | Et indlejret script, serveret fra app'en og sat ind på topix.dk som eWebinars widget — pixlen fyrer da i topix.dk's eget samtykke-/GTM-miljø, og app'en forbliver uden tracking (`webinarRum.guard` dom 3). Alternativ: `/w/:slug/tilmeld` (bygget) — så er CAPI eneste Meta-vej | Punkt 9 og 12 |
| B3 | G3 Meta | Pixel + CAPI med dedup på `event_id` (= tilmeldings-id) | Annoncernes signal; «Fuldfør registrering» kommer i dag fra eWebinars pixel |
| B4 | Privatlivsteksten | Spec §C6. Løftet «Selve din tilmelding deler vi ikke med Meta» SKAL ændres før første CAPI-hændelse | Åbning + CAPI |
| B5 | Hvem afholder, svares der undervejs? | Morten i en minimal konsol, svar kun i rummet. ~~Der findes i dag ingen rådgiverflade til spørgsmål~~ — bygget 3/10 (§7.7), ikke udrullet | Om konsollen er på stien |
| B6 | Video | eWebinars video til intern prøve og P0 (P0 kræver samme video). Ny optagelse til 3/11 kun hvis færdig senest ~20/10 | 6, 7 |
| B7 | Dato | Tirsdag 3/11 kl. 11 (samme ugedag/tid — tallene kan sammenlignes) | 10 |
| B8 | P0 13/10 | Ja, med alias-adresser (fx `navn+ew@topix.dk` hos eWebinar) — dubletværnet dømmer «nærmeste session» pr. `lower(email)` på tværs af systemerne (§7.3). Om topix.dk-mailen tager plus-adresser: UMÅLT | Paritetsbeviset |
| B9 | Merge-go + go/no-go-datoerne 9/10 og 27/10 | | Alt |

### 8.3 Risici og reserve

- **9/10 — lyd/autoplay på iPhone er UMÅLT.** Fejler den: plan B (egen HLS-afspiller) koster 3–4 dage.
- **12/10 — registreringssignalet.** Ikke bevist i Test events = tre ugers kampagne uden signal. Største kommercielle risiko.
- **Formularen på topix.dk:** hvem der kan publicere, og hvor hurtigt — UMÅLT (site-repoet er ikke i sessionen).
- **Videoen:** format, og om den kan hentes ud af eWebinar — UMÅLT.
- **Punktet uden vej tilbage er åbningen 14/10:** tilmeldte på platformen kan ikke flyttes rent til eWebinar. Derfor porten 9/10.

**Reserve A (anbefalet, hvis 9/10 ikke er grøn; besluttes senest 12/10):** 3/11 oprettes i eWebinar, widgetten bliver, motoren kører skygge samme dag (P0 flyttes til 3/11). En måned mere med eWebinar; annoncerne ikke i fare.
**Reserve B (tilmelding i eWebinar, afholdelse hos os) FRARÅDES:** to sæt mails, links og kalenderfiler (eWebinars UID/ORGANIZER), og en bro, der hverken er specificeret eller bygget.
**Reserve C (go/no-go 2 fejler):** 3/11 aflyses manuelt med en mail og tilbud om ny dato — aflysningsmailen er ikke bygget (skive 6).

### 8.4 Det, Claude bygger uden beslutninger (rækkefølge = hvor meget det afkorter stien)

1. PR'er for v2-grenene (skive 1 → 2 → 3).
2. Denne runbook (§8).
3. ~~`ti_minutter` — CHECK-migration efter `20261003031000` (KØRT før deploy), kun for motorens rækker (eWebinar sender selv sin 10-minutters-mail).~~ **BYGGET 3/10-2026** (gren `feat/webinar-ti-minutter`, IKKE udrullet) — se §4. Rækkefølgen: migration `20261003040000` KØRT og EFTER-SELECT'en gemt (otte arter i `webinar_mails_art_check`, og porten `webinar_ti_minutter_klar` = true) → eksplicit deploy af `webinar-mail-cron` → beviset: feltet `ti_minutter` (`port` «klar» · `ikke_motor` · `skal_sendes` · `tabt`) i en tørkørsels svar — kun den nye kode har det. **CTO-rådets fund 3/10 (dom «RET FØRST»), rettet på grenen `fix/ti-minutter-raad`:** (1, HØJ) vinduet T−15 → **T−30** … T−5 (≥ 3 slots for hvert startminut; kapaciteten MÅLES i lastprøven, trin 13), nærmeste frist først, og alarmart `ti_minutter`; (2, MELLEM) deploy-listen med `webinar-delt` og `drift-agent-cron`, og beviset `interne_fraregnet`; (3) porten; (4) påstanden om `ikke_motor` rettet; (5) svarets tal på samme grundlag; (6) migrationen i én transaktion med ét `alter table`.
4. ~~Minimal værtskonsol `/webinar/motor/session/:id` — FØRST måles, om RLS giver rådgivere UPDATE på `webinar_spoergsmaal`.~~ **BYGGET 3/10-2026** (gren `feat/webinar-vaertskonsol`, IKKE udrullet) — se §7.7. Målt: rådgivere havde KUN SELECT; migration `20261003050000` giver UPDATE (minus tjenestekonti) med kolonneværn. Rækkefølgen: `20261003050000` KØRT og EFTER-SELECT gemt → Update.
5. Server-side CAPI bag låsen `webinarmotor_meta_aktiv` (CHECK-migration på `meta_haendelser`, ikke kørt; værn `webinarTilmeldMeta.guard`).
6. Lastprøve (k6), P0-sammenligningens SQL og E3-tjeklisten som ét resultatsæt.
7. ~~`ansoegninger.webinar_tilmelding_id` (skive 4).~~ **BYGGET 3/10-2026** (gren `feat/webinar-ansoegning-kobling`, IKKE udrullet) — se §7.8. Rækkefølgen: `20261003010000` (skive 1) KØRT → kolonnen målt (`GET /rest/v1/ansoegninger?select=webinar_tilmelding_id&limit=0` → 200) → eksplicit deploy af `ansoegning-gem` → beviset `webinar_kobling` i et «opret»-svar (honningfeltet: ingen række) → Update (aldrig før deploy — STRIKS-body'en ville afvise `webinar_token`). Tragten læser endnu ikke kolonnen (§7.8 «Læseren»).
8. Efter B2: udkast til indlejrings-scriptet (honningfelt, utm/fbclid, `_fbp`/`_fbc` kun med samtykke, `CompleteRegistration` med `eventID` = tilmeldings-id).
9. **Den interaktive pakke — SPEC SKREVET 3/10-2026, IKKE BYGGET** (§9). Testimonials, overlays over videoen (billede, knap, hotspot), poll-resultater, fremhævet spørgsmål på skærmen og automatiske chatbeskeder. Skiverne 9a–9g (§9.10), hver med færdig-definition; beslutningerne I1a–I10 står i §9.11 og skal tages, før de skiver, de blokerer, går i gang. **Ikke på stien til 3/11** (Mortens 22/9 brugte chat, feedback og CTA — det har motoren), men 9a–9c kan påbegyndes med anbefalingerne som standardværdier (I2, I5, I6 og I7 er hver én konstant i 9a); I1a, I1b, I3 og I10 blokerer først fladerne (9d–9f) og låsen. **I6 kræver Jonas' svar før 9b** (bucketten er en del af migrationen), og 9b kræver Jonas' ja (regelsættet §3: RLS, der gør adgang bredere).

**~~Kendt hul (fra v2-flettet)~~ — LUKKET 2/10-2026** (gren `fix/webinar-intern-maal-annoncer`): `maalstreger` og `annoncepriser` filtrerer nu `erInternTilmelding` i dommens indgang i begge spejle (`src/lib/webinar/maalstreger.ts` ⇄ `_shared/webinarMaalstreger.ts`, `src/lib/webinar/annoncepriser.ts` ⇄ `_shared/annoncepriser.ts`) — målt: de fik de RÅ rækker fra hooken og fra `webinar-delt`, og begge hentninger beder allerede om `intern:raa->>intern`. Prøver i `maalstreger.test.ts` og `annoncepriser.test.ts`; værn `webinarMotorRaad.guard` dom 5b (med mutationer). Ruller med næste udrulning af `webinar-delt` (delt fil) og Update.

## 9. Den interaktive pakke — spec (3/10-2026, KUN DOKUMENTATION, intet bygget)

**Bestillingen (Jonas 3/10 kl. 06:01, ordret):** «Lige nu kan man lave interaktioner, vise testimonials, CTA, oprette Hotspots på slideshowet, lave automatiske chatbeskeder til deltagere, opsætte polls, stille spørgsmål osv, og sætte dem til at blive skudt på bestemte tidspunkter i løbet af et webinar. Og alt det skal vi kunne, for at den interaktive del af webinaret blive fed. Folk skal kunne stille spørgsmål, som vi nemt kan svare på i chat til dem. Måske endda i løbet af webinaret highlighte spørgsmål, som kommer frem på skærmen, så alle deltagere kan se det og hvad der er svaret til det.»

**Skrevet til den agent, der bygger** (Fable, søndag 4/10). Alt, der står som «bygget» nedenfor, er læst i koden på grenen `feat/webinar-chat-bagende` (8fe0c29e). Intet er målt i prod, og ingen af motorens migrationer er kørt. Hvor en forudsætning ikke holder, når du bygger: **STOP og skriv det her** — gæt ikke.

### 9.0 Grundlaget — målt og læst

**Målt i prod 3/10 (recon):** Mortens webinar 22/9 — 384 tilmeldte — brugte **chat** (83 personer, 154 beskeder), **feedback** (40 stjerner, 15 kommentarer) og **CTA** (17 «Ansøg» + 17 «Ikke klar endnu»). Ingen polls, quiz, testimonials eller hotspots blandt dem, der reagerede. eWebinar logger kun reaktioner, så om Morten havde *opsat* andre interaktioner, som ingen rørte, er UMÅLT.

**eWebinars funktioner** (spec §K's kilder; ikke genlæst 3/10): Testimonial (citat, foto, navn, titel, firma, evt. CTA) · Hotspot (usynligt klikbart område over videoen med varighed og «glimmer») · Image/Button Overlay · Private Message (1:1-chatbesked på tidskode med `{firstName}`, betingelser) · velkomstbesked · auto-svar · Poll (kumulative resultater efter svar) · Tip · Special Offer · Next Webinar. eWebinars chat er bevidst privat; «fremhæv for alle» findes ikke dér — det er vores eget.

**Læst i koden (det, pakken bygger videre på):**

| Hvad | Hvor | Betydning for §9 |
|---|---|---|
| Ni arter: `cta, feedback, poll, quiz, spoergsmaal_prompt, reaktion, haand, ressource, kapitel` | `INTERAKTION_ARTER` (`webinarMotor/interaktioner.ts`, spejlet ordret) = CHECK `webinar_interaktioner.art` (`20261003010000`) | Nye arter kræver begge, i takt |
| `placering`: `overlay · sidepanel · exitrum` | samme | `overlay` findes allerede — men **tegnes i dag UNDER videoen**, ikke oven på (`WebinarRum.tsx`: `kortListe` står efter `<Afspiller>`) |
| `webinar_svar.art` CHECK: `cta, feedback, poll, quiz, spoergsmaal_prompt`; unik på `(deltagelse_id, interaktion_id)` — det første svar står | `20261003010000` §9 | Klik på nye arter kræver CHECK-udvidelse |
| `doemSvar` tager kun svar for de fem; alt andet → `ikke_et_svar` | `interaktioner.ts` | Udvides for klik |
| `laesTidslinje` kasserer en række, skemaet ikke kender (fail-closed) | `interaktioner.ts` | En function, der ikke er udrullet med den nye skemafil, viser simpelthen intet af det nye — godt |
| Snapshot'et er de RÅ rækker; skemaet dømmer ved LÆSNING | `_shared/webinarMotorHent.ts:frysTidslinje` | Ingen ændring i frysningen |
| `findMotorForbudte` afviser HELE svaret (500 `svar_afvist`), hvis en nøgle hvor som helst i træet hedder `navn`, `fornavn`, `email`, `by`, `enhed`, `origin`, `raa` … | `webinarMotor/svar.ts:MOTOR_FORBUDTE_NOEGLER` | **Et testimonial med nøglen `navn` eller `by` ville lægge rummet ned for alle.** Personfelterne på et testimonial omgår IKKE listen med andre nøglenavne — de går gennem en NAVNGIVEN UNDTAGELSE (§9.2) |
| Kortene (`KORT_ARTER`): cta, poll, quiz, feedback, spoergsmaal_prompt | `webinarRum/overlay.ts` | Testimonial kommer på listen; knap/billede/hotspot får et eget lag |
| Afspillerboksen: `relative aspect-video`; spolespærren = `div` `absolute inset-x-0 bottom-0 z-10 h-14` (`data-spolespaerre`); «Tryk for lyd» og «Tilbage til webinaret» `z-20` | `components/webinarRum/Afspiller.tsx` | Det nye lag skal ind mellem iframen og spærren — §9.1 |
| Fuld skærm = `boksRef.requestFullscreen()` (boksen, ikke iframen), kun hvor `document.fullscreenEnabled` | samme | Alt i boksen følger med i fuld skærm; kort, panel og bånd UNDER boksen gør ikke |
| Pulsen: hvert 15. s (spiller), 60 s (lobby/pause), 5 s i 10 min efter et spørgsmål; svaret bærer `svar[]`, `i_rummet`, `tidslinje_version` | `webinar-puls`, `webinarRum/pulsplan.ts` | Fremhævet spørgsmål og poll-resultater rider med her — ingen Realtime for seerne (spec §D3) |
| Cache pr. isolat 10 s (`CACHE_MS`) for rumdata og «i rummet» | `webinarMotorHent.ts` | Samme mønster for de nye aggregater |
| `webinar_spoergsmaal.offentlig` (bool, default false) og `offentlig_tekst` (text) FINDES; ingen kolonne til et offentligt SVAR | `20261003010000` | §9.6 tilføjer `offentlig_svar`, `fremhaevet_at`, `fremhaevet_af` |
| Rådgiverens UPDATE på `webinar_spoergsmaal` er låst af kolonneværnet: KUN `status, svar_tekst, svaret_af, svaret_at`, KUN `ny → besvaret`, KUN mens `leveret IS NULL` | `20261003050000` `webinar_spoergsmaal_vaert_kolonnevaern` | «Vis for alle» kræver en ny gren i værnet (§9.6) — ikke et hul |
| `hilsen.fornavn` er den ENE vej, seerens fornavn når klienten | `svar.ts:NAVNGIVNE_UNDTAGELSER` | `{fornavn}` i automatiske beskeder udfyldes i KLIENTEN med den (§9.7) |
| `sessionStorage` kun i `webinarRum/lager.ts`; ingen localStorage/cookie/pixel | `webinarRum.guard` dom 3 | Indgangspositionen til chatbeskeder gemmes dér (§9.7) |
| `vaert_billede` er en fri URL, tegnet med `<img src>` | `WebinarTilmelding.tsx`, `Vaerelse.tsx` | Nye billeder får en værtsliste (§9.2) — `vaert_billede` er ikke omfattet i denne pakke |
| Ingen storage-bucket til webinarbilleder (grep i migrationerne 3/10: kun `aftaler`, community, chat m.fl.) | — | Beslutning I6 |
| Editoren: `EDITOR_ARTER` = cta, poll, quiz, feedback, spoergsmaal_prompt, kapitel; tidskoder tastes; **ingen skrubber, ingen preview** (§7.4) | `webinarMotorAdmin/opsaetning.ts` | Hotspots kan placeres med tal først, visuelt senere (9g) |
| `CTA_MAAL` = `ansoeg, ikke_klar, ressource, link`; editoren tilbyder kun de to første («et mål, der ikke fører nogen steder hen, tilbydes ikke») | samme | §9.2 giver `link` en vej |

### 9.1 Laget over videoen — fælles for alt, der står OVEN PÅ afspilleren

**Problemet:** Bunnys iframe er cross-origin. Vi kan hverken style den indefra eller lægge noget ind i den. Alt, der skal stå «på videoen», er derfor søskende til iframen inde i afspillerboksen, absolut placeret over den.

**Lagene i `Afspiller.tsx`s boks, nedefra og op (z-index er en del af spec'en):**

| z | Lag | pointer-events | Hvad |
|---|---|---|---|
| 0 | iframen | — | Bunny |
| 10 | **interaktionslaget** (nyt, `data-interaktionslag`) | `none` på laget, `auto` på hvert barn | billede, knap, hotspot, testimonial (kun desktop), fremhævet-toast og fuld-skærm-toast |
| 20 | spolespærren (`data-spolespaerre`) — **flyttes fra z-10 til z-20** | `auto` | dækker kontrolbjælken, som i dag |
| 30 | «Tryk for lyd» og «Tilbage til webinaret» — **flyttes fra z-20 til z-30** | `auto` | som i dag; på pause dækker «Tilbage til webinaret» alt, også laget |

- **Spolespærren bevares, og den vinder altid:** laget ligger UNDER spærren. Et barn i laget, der rækker ned i spærrens område (de nederste 56 px), dækkes af spærren og kan ikke klikkes dér — klippet sker i den rene dom `fladeOverVideo` (nedenfor), ikke i CSS-held. Spærren tegnes, når `overlayDom.daekKontroller` er sand — uændret.
- **Klik uden for et barn går til Bunny** (laget er `pointer-events: none`). Et tryk på videoen pauser den, som i dag — pause er tilladt (D2.4).
- **Koordinater er procent af videobilledet** (`x`, `y`, `b`, `h` ∈ [0, 100], højst én decimal), målt fra øverste venstre hjørne. Boksen er `aspect-video` (16:9). **Er Mortens video ikke 16:9, letterboxer Bunny den, og procenterne rammer skævt.** Videoens billedformat er UMÅLT → `webinarer.billedformat` (beslutning I7, standard `16:9`), og `fladeOverVideo` regner den indre ramme ud fra boksens og videoens format.
- **Den rene dom** (`src/lib/webinarRum/overlayFlade.ts`, kun klient, tiden og målene gives ind):
  ```
  fladeOverVideo({ x, y, b, h }, boks: { bredde, hoejde }, billedformat, spaerrePx = 56)
    → { venstre, top, bredde, hoejde } i px | null
  ```
  1. Den indre ramme: `rammeHoejde = min(boks.hoejde, boks.bredde / format)`, `rammeBredde = rammeHoejde · format`, centreret (letterbox).
  2. Rektanglet i rammen.
  3. **Klip** mod `boks.hoejde − spaerrePx` (spærren vinder).
  4. **Træfflade ≥ 44 × 44 px** (WCAG 2.5.5-pejling, husets `h-11`): er rektanglet mindre, udvides KLIKFLADEN symmetrisk (den synlige ramme bliver).
  5. **`null`, når der er under 24 px højde tilbage efter klippet** — så tegnes barnet IKKE over videoen, kun i listen under videoen (nedenfor). Regnestykket skrives ud i kommentaren: på en 360 px bred telefon er boksen 202,5 px høj, og spærren tager 56 px = 27,7 %.
- **Mobil (< 768 px, `md`):** kun `hotspot`, `billede` og `knap` står over videoen — de er små. Alt med læsbar tekst (testimonial, CTA, poll, quiz, feedback, prompt) står UNDER videoen, som kortene gør i dag. Den rene dom `overlayPlads(art, placering, breddePx) → "over_video" | "under_video"` afgør det ét sted.
- **Desktop:** testimonial med `placering: "overlay"` står i et hjørne af videoen (højst 40 % af bredden, `hjoerne` i indholdet); de andre kort står under videoen som i dag. **Kortene flyttes IKKE op på videoen i denne pakke** — det er en designændring for sig (beslutning I8).
- **Fuld skærm:** kun boksen er i fuld skærm. Det, der står under den (kort, chatpanel, fremhævet bånd), ses ikke. Derfor: når `document.fullscreenElement === boks`, viser laget en lille toast nederst over spærren (ikke i den), når noget nyt kommer ud for videoen: «Ny besked fra Morten», «Spørgsmål på skærmen», «Nyt kort under videoen» — med knappen «Afslut fuld skærm» (`document.exitFullscreen()`). Toasten står 8 s og tages ikke igen for samme id. iPhone har ingen elementfuld skærm (`fullscreenEnabled` er falsk; knappen tegnes ikke i dag), så grenen findes ikke dér.
- **Tilgængelighed — gælder alle børn i laget:**
  - Hvert klikbart barn er et RIGTIGT `<a>` eller `<button>` med `aria-label` = indholdets `tekst` (hotspottets er påkrævet i skemaet). Aldrig `div onClick` (værn).
  - Synlig fokusring (`focus-visible:ring-2`), også på et ellers usynligt hotspot. Tab-rækkefølge: laget står i DOM'en EFTER iframen og FØR kontrolknapperne under videoen.
  - Når et barn kommer frem, læses det op ÉN gang gennem en `aria-live="polite"`-region i boksen («Ny knap på videoen: Hent tjeklisten») — aldrig igen for samme id, aldrig hvert sekund.
  - **Listen «På videoen nu»** under videoen (synlig, ikke kun `sr-only`): alle klikbare børn, der er aktive nu, som almindelige links/knapper. Den er tastatur- og skærmlæservejen, den er mobilvejen for et hotspot, `fladeOverVideo` gav `null`, og den er sikkerhedsnettet for et usynligt område, ingen kan se.
  - `prefers-reduced-motion`: ingen glimmer, ingen indtoning — en statisk kant.
- **Tiden:** et barn står der, når `iVindue` siger ja på **serverens** forventede position (`kortPaaSkaermen`-mønstret). Afspillerens egen position bruges aldrig — en, der snyder med spolingen, udløser intet før tid (princippet fra skive 1).

### 9.2 Nye arter og skemaer (`interaktionSkema`, `doemSvar`)

Fem nye arter: **`testimonial`, `billede`, `knap`, `hotspot`, `chatbesked`**. `INTERAKTION_ARTER` og CHECK'en på `webinar_interaktioner.art` får dem i SAMME PR. `webinar_svar.art` får de fire klikbare (`testimonial`, `billede`, `knap`, `hotspot`); `chatbesked` er aldrig et svar.

**Personfelter går gennem en navngiven undtagelse, aldrig uden om listen** (rådet 3/10). Et testimonials `person`, `rolle`, `virksomhed` og `foto_url` er persondata om en tredjemand, også selv om nøglerne ikke står i `MOTOR_FORBUDTE_NOEGLER` i dag. Derfor:
- **`MOTOR_FORBUDTE_NOEGLER` udvides med `person`, `rolle`, `virksomhed` og `foto_url`** (begge spejle), så de er forbudte OVERALT i motorens svar.
- **`NAVNGIVNE_UNDTAGELSER` får `testimonial`**, som KUN tillader stierne `tidslinje[N].indhold.person`, `….rolle`, `….virksomhed` og `….foto_url` — og kun når `tidslinje[N].art = "testimonial"` OG `tidslinje[N].indhold.samtykke === true`. Undtagelsen dømmes på det konkrete element, ikke på stien alene: `findMotorForbudteMed` får en ren prædikatfunktion pr. undtagelse (`testimonialSti(svar, sti)`), som slår elementet op. Kun `webinar-rum` «tilstand» bruger den (samme regel som `hilsen`: præcis ét svar).
- Et testimonial uden `samtykke: true` fælder dermed svaret — skemaet afviser det allerede ved gemningen, så det er et andet lag af samme dom.
- De andre nye arter bruger ingen personnøgle. Værn 2 (§9.9) fælder enhver anden placering.

**Fælles for de klikbare:** `maal` ∈ `{ansoeg, link}`.
- `ansoeg` → `ansoegUrl(token)` (tokenet i FRAGMENTET, som i dag — `webinarRum.guard` dom 6).
- `link` → `url`: `https://` og en vært på `LINK_VAERTER` (beslutning I5; anbefaling: `topix.dk`, `www.topix.dk`, `theboardroom.dk`, `www.theboardroom.dk`). Ingen query-parametre med token, mail eller navn — `url` må ALDRIG indeholde tokenet (værn). `target="_blank" rel="noopener noreferrer"`.
- **Klikket sendes FØR navigationen** med `sendFoerNavigation` (keepalive), som CTA'ens «Ansøg» i dag, som handlingen `svar` med `{ maal }`. `CTA_MAAL` er uændret; editoren får nu lov at tilbyde `link`, fordi det har en vej.

| Art | `indhold` (skemaet) | `placering` | Svar (`doemSvar`) |
|---|---|---|---|
| `testimonial` | `citat` (1–600) · `person` (1–100; personfelt — kun gennem undtagelsen ovenfor) · `rolle` (≤ 100, valgfri) · `virksomhed` (≤ 100, valgfri) · `foto_url` (valgfri; https + `BILLED_VAERTER`) · `samtykke` (skal være `true` — editorens kryds «Personen har givet lov til, at citatet og navnet vises», I3) · `knap` (valgfri: `{ tekst 1–80, maal, url? }`) · `hjoerne` (valgfri: `oe_h · oe_v · ne_h · ne_v`, standard `ne_h`) | `overlay` (hjørne på desktop, under på mobil) · `sidepanel` (under videoen) · `exitrum` | `{ maal }` — kun når der er en knap |
| `billede` | `billed_url` (https + `BILLED_VAERTER`) · `alt` (1–200, påkrævet; tomt alt kun med `pynt: true`) · `x, y, b, h` · `maal`/`url` (valgfri — uden er billedet ikke klikbart) | kun `overlay` | `{ maal }` — kun når klikbart |
| `knap` | `tekst` (1–60) · `x, y` (knappens øverste venstre hjørne; bredden følger teksten, højst 60 % af videoen) · `maal`, `url?` · `stil` (`primaer · sekundaer`) | kun `overlay` | `{ maal }` |
| `hotspot` | `tekst` (1–80, PÅKRÆVET — det er `aria-label` og linjen i «På videoen nu») · `x, y, b, h` (b, h ≥ 3) · `maal`, `url?` · `glimmer` (bool, standard `true`) | kun `overlay` | `{ maal }` |
| `chatbesked` | `tekst` (1–1000) · `tekst_uden_navn` (PÅKRÆVET, når `tekst` indeholder `{fornavn}`; må ikke selv indeholde `{`) · `udloeser` (`indgang · tidskode · exitrum`) · `knap` (valgfri: `{ tekst, maal, url? }`) | kun `sidepanel` | — |

- **Pladsholdere:** kun `{fornavn}`. Enhver anden `{…}` i `tekst` afvises af skemaet (fail-closed) — en skrivefejl som `{fornavm}` må aldrig nå en seer som rå tekst.
- **Rektanglet** (`x, y, b, h`): tal i [0, 100] med højst én decimal; `x + b ≤ 100`, `y + h ≤ 100`; `b, h ≥ 3` for hotspot og billede. Skemaet afviser alt andet.
- **`vis_til_sek` er PÅKRÆVET for `billede`, `knap` og `hotspot`** (højst 600 s efter `vis_fra_sek`): et overlay uden slut står over videoen resten af webinaret. For `testimonial` på `overlay` det samme; på `sidepanel`/`exitrum` som kortene i dag.
- **`chatbesked`:** `vis_fra_sek` bruges kun ved `udloeser: "tidskode"`; ved `indgang`/`exitrum` gemmes 0 (CHECK'en kræver ≥ 0) og læses ikke. `vis_til_sek` er null. `betingelse` virker som for alle andre (`efter_svar`, `min_set_procent`) — det er eWebinars «betingede private messages».
- **`iVindue`, `aktiveInteraktioner` og `svarKanModtages` returnerer FALSK for `chatbesked`** (som `kapitel`) — en chatbesked er aldrig et kort og aldrig et svar. Den har sin egen dom (§9.6).
- **`svarKanModtages` for de klikbare** følger `iVindue` + `SVAR_NAADE_SEK` (30 s) som i dag; et klik efter vinduet + nåde er `ikke_aktiv`.
- **`webinar-puls` logger klikket** som `cta_klik` (eksisterende log-art — ingen ændring i `webinar_motor_log`s CHECK) med `data: { interaktion_id, version, art, maal }`. Linje 185 (`logArt`) udvides: alle fire klikbare arter → `cta_klik`.
- **`BILLED_VAERTER`** (beslutning I6): anbefaling en offentlig bucket `webinar-billeder` i husets Supabase Storage, skrivbar kun for rådgivere (minus tjenestekonti), læsbar for alle; skemaet kræver præfikset `https://<projekt>.supabase.co/storage/v1/object/public/webinar-billeder/`. Om Supabase Storage sætter cookies på et offentligt objekt: UMÅLT — måles i skive 9d (DevTools → Application) og bogføres i `docs/tracking.md` som Bunnys.

### 9.3 Funktion 1 — Testimonials

**Formål:** socialt bevis på det tidspunkt i videoen, hvor Morten taler om netop det. Ærligt: et rigtigt citat fra en rigtig person, der har sagt ja.

**Seeren ser:**
- **Desktop, `placering: overlay`:** et kort i det valgte hjørne af videoen (inden for laget, over spærrens højde, højst 40 % af bredden): citat i anførselstegn (`font-editorial`), foto (rundt, 48 px, `alt=""` — navnet står ved siden af), `person` · `rolle`, `virksomhed`, evt. knap. «×» lukker det for denne seer (som kortene, `lukkede`).
- **Mobil eller `sidepanel`:** samme kort under videoen, i kortlisten.
- **`exitrum`:** i exitrummets kortliste.
- Skærmlæser: kortet er en `<figure>` med `<blockquote>` og `<figcaption>`, og annonceres én gang («Udtalelse fra …»).

**Værten gør (editoren):** art «Udtalelse», felterne fra §9.2, foto-upload til bucketten (9e; indtil da en URL), krydset «Personen har givet lov …» — uden kryds kan kortet ikke gemmes.

**Data:** arten i begge CHECK'er; klik i `webinar_svar` (art `testimonial`).

**Måling:** «vist» UDLEDES af bitmappen — en deltager har set testimonialet, når `set_bits` har mindst ét stykke i `[vis_fra_sek/5, vis_til_sek/5)` (ingen ny skrivning, samme bits som `set_procent`). «Klik» = rækker i `webinar_svar`. En SQL-funktion til fladen (skive 7) er ikke en del af pakken; beviset i 9d er en SELECT.

**Ærlighed:** ingen opdigtede udtalelser, ingen stockfotos af «kunder». Krydset er en påmindelse, ikke et bevis. **Samtykket gemmes uden for repoet** (tabel eller Jonas' mappe, I3); repoet bærer kun antal og henvisning. Det er min vurdering, ikke juridisk rådgivning, at markedsføringsloven kræver, at en udtalelse er ægte og repræsentativ.

### 9.4 Funktion 2 — Billede, knap og hotspot over videoen

**Formål:** eWebinars «Image/Button Overlay» og «Hotspot»: et klikbart område på et slide («Hent tjeklisten her»), en knap, der dukker op, mens Morten siger «klik her», eller et billede (et logo, en QR-kode, et skærmbillede).

**Seeren ser:**
- `knap`: en rund knap (husets `h-12`, primær eller sekundær) på positionen; tones ind på 200 ms (ikke med reduceret bevægelse).
- `billede`: billedet på rektanglet (`object-contain`), klikbart hvis det har et mål (så med fokusring og `aria-label` = `alt`).
- `hotspot`: et usynligt område — med `glimmer: true` en blød, pulserende kant de første 3 s og igen hvert 10. s (CSS-animation; ingen ved reduceret bevægelse — da en statisk, tynd kant hele tiden, så det ikke er usynligt for den, der ikke kan se animationen). Hover: markøren bliver en hånd, og kanten bliver synlig.
- Altid: linjen i «På videoen nu» under videoen (§9.1).
- **Mobil:** som desktop, men med `fladeOverVideo`s træfflade ≥ 44 × 44 og fald-tilbage til listen.

**Værten gør:** editoren (9e) — art, tidskode fra/til, `x, y, b, h` som tal (procent), mål/URL, tekst. **Visuel placering** (træk en ramme over videoen) kræver en afspiller i editoren med en signeret embed for en rådgiver — `webinar-rum` «preview» eller tilsvarende Bucket A-signering findes IKKE (spec §B2, «skive 6»). Den er skive 9g. Indtil da: tallene + en intern prøvesession (§7.3) som forhåndsvisning.

**Data:** arterne i begge CHECK'er; klik i `webinar_svar`.

**Måling:** «vist» af bitmappen som §9.3; klik pr. interaktion; klik ÷ vist under «for få» (< 5) vises ikke som procent (husets regel).

### 9.5 Funktion 3 — Poll-resultater (kumulative, efter svar, aggregat)

**Formål:** eWebinars «kumulative resultater efter svar»: seeren svarer og ser, hvad de andre svarede. Det gør en poll interessant at svare på.

**Seeren ser:** efter sit eget svar (aldrig før — resultatet må ikke styre svaret, samme princip som quiz' facit) en vandret bar pr. valg med procent og «N har svaret» — ordlyden afhænger af grundlaget (I2): «… af dem, der har set webinaret» eller «… i dag». Under `POLL_MINDST = 5` svarere: «For få svar endnu — vi viser resultatet, når flere har svaret» (husets «for få»-regel, samme tal som `KURVE_MINDST`). Ved flervalg: «Man kunne vælge flere» (summen er over 100 %). Barerne har tekst (procent og antal), ikke kun farve; `role="img"` med en `aria-label`, der læser alle tal op.

**Værten gør:** i editoren et kryds «Vis resultatet efter svar» (`indhold.vis_resultat`, standard `true`, I2). Skemaet: `vis_resultat` er boolean eller fraværende.

**Data og server:**
- **SQL-funktionen** `public.webinar_poll_resultat(p_interaktion_id uuid, p_session_id uuid, p_kumulativ boolean) returns table (valg integer, antal integer, svarere integer)` — `SECURITY INVOKER`, `STABLE`, EXECUTE KUN til `service_role` (som `webinar_puls_skriv`). `antal` = rækker i `webinar_svar` for interaktionen, hvor `svar->'valg'` indeholder valget; `svarere` = rækker i alt. `p_kumulativ = true`: alle sessioner med samme interaktion (interaktions-id'et er fælles for alle sessioner, der har frosset samme version) **minus interne sessioner** (`webinar_sessioner.intern`), plus den aktuelle session, hvis den selv er intern. `false`: kun `p_session_id`. **Den returnerer aldrig et id på en seer, en deltagelse eller et svar.**
- **`webinar-puls`** svarer med **`poll_resultater`**: `Array<{ interaktion_id, svarere, fordeling: number[] | null, grundlag: "webinar" | "session" }>` — `fordeling` er `null` under `POLL_MINDST`. Kun for polls, der (a) har `vis_resultat`, (b) er i vindue eller i nåden (`svarKanModtages`), og (c) DENNE seer har svaret (ét opslag `webinar_svar where deltagelse_id = … and interaktion_id in (…)` — kun når der ER en aktiv poll med resultat; ellers intet opslag). Aggregatet caches pr. (interaktion, grundlag) i 10 s (`CACHE_MS`). Fejl = fail-soft: feltet udelades for den poll, fejlsummen tæller.
- **Ren dom** `pollResultatDom(raekker, antalValg, mindst) → { svarere, fordeling | null }` (spejlet ordret, paritet) — normaliserer til præcis `antalValg` pladser, kaster aldrig.

**Måling:** fordelingen er selve målingen; den står allerede i `webinar_svar`.

### 9.6 Funktion 4 — Fremhævet spørgsmål og svar på skærmen for alle

**Formål (Jonas):** «highlighte spørgsmål, som kommer frem på skærmen, så alle deltagere kan se det og hvad der er svaret til det.» Det gør den private chat synlig som socialt bevis — uden at afsløre, hvem der spurgte.

**Seeren ser:**
- Et **bånd lige under videoen**, over kortene: eyebrow «Spørgsmål fra en deltager» (ordlyden er I1b), spørgsmålet (`offentlig_tekst`), og under det «Morten svarer:» + svaret (`offentlig_svar`). Båndet står, til værten tager det ned eller sætter et nyt op. Det er en `<section aria-labelledby>` med en `aria-live="polite"`-region, der læser det NYE spørgsmål op én gang.
- **Over videoen** en kort toast i laget (8 s, øverst): «Nyt spørgsmål på skærmen ↓» — på desktop og mobil; i fuld skærm toasten fra §9.1 med spørgsmålets første 80 tegn.
- Også i **exitrummet** (værten svarer stadig dér). Ikke i venteværelset (ingen er «på skærmen» endnu) og ikke i `afsluttet`.
- Spørgeren selv ser sit spørgsmål i båndet som alle andre — intet «dit spørgsmål blev vist» (det ville afsløre over for en, der kigger med på skærmen).

**Værten gør (konsollen, 9f):**
- Ved et BESVARET spørgsmål: knappen **«Vis for alle»** åbner en lille formular med to felter: «Spørgsmålet, som alle ser» (forudfyldt med spørgsmålet) og «Svaret, som alle ser» (forudfyldt med svaret). Begge kan rettes — fx «Hej Anne» ud, firmanavnet ud. **Spærre:** den rene dom `anonymDom(tekst, fornavn)` (`webinarMotorAdmin/fremhaev.ts`) finder spørgerens fornavn (helt ord, uden store/små bogstaver), en mailadresse, et telefonnummer (8 cifre med eller uden mellemrum, +45) eller et CVR-lignende tal (8 cifre) i NOGEN af de to tekster og blokerer «Vis for alle» med grunden — værten retter teksten. Fail-closed: ukendt fornavn = kun mail/telefon/CVR-tjek.
- Ved et UBESVARET spørgsmål: **«Svar og vis for alle»** — svaret går til spørgeren (som i dag), og samme formular åbner bagefter. Et spørgsmål vises aldrig uden et svar (videoen er optaget; Morten kan ikke svare mundtligt).
- Øverst i konsollen: **«På skærmen nu»** med teksten og knappen **«Tag ned»**. Sættes et nyt op, tages det gamle ned i samme handling.
- Tjenestekontoen ser hverken «Vis for alle» eller «Tag ned» (`visSvarfelt`-mønstret), og RLS siger det samme.

**Data (migration, §9.9):**
- Nye kolonner på `webinar_spoergsmaal`: `offentlig_svar text` (1–1000 efter trim, null), `fremhaevet_at timestamptz`, `fremhaevet_af uuid references auth.users on delete set null`. `offentlig` (findes) sættes `true`, første gang spørgsmålet vises — det betyder «har været vist for alle», ikke «må genbruges i senere sessioner» (det er spec §A7's «Spørgsmål fra tidligere deltagere» og beslutning I9).
- **Højst ét fremhævet pr. session:** delvist unikt indeks `webinar_spoergsmaal_et_fremhaevet_uidx on (session_id) where fremhaevet_at is not null` (husets mønster fra community-spørgsmålet). Skrivevejen er en RPC — `public.webinar_fremhaev_spoergsmaal(p_id uuid, p_tekst text, p_svar text)` og `public.webinar_tag_ned(p_session_id uuid)` — **SECURITY INVOKER** (ingen SECURITY DEFINER), som i én transaktion rydder sessionens nuværende og sætter det nye; RLS + kolonneværnet dømmer stadig hver række.
- **Kræver Jonas' ja (regelsættet §3: RLS, der gør adgang bredere):** rådgivere får skriveadgang til fem nye kolonner på `webinar_spoergsmaal` (fremhæv-grenen), og det, de skriver, når alle seere. Gælder hele 9b.
- **Kolonneværnet udvides** (`create or replace function public.webinar_spoergsmaal_vaert_kolonnevaern()` — en funktion fra vores egen `20261003050000`, IKKE en af de forbudte `protect_*`): **to grene**, valgt af hvilke kolonner der ændres:
  1. *Svar-grenen* — uændret ordret: kun `status, svar_tekst, svaret_af, svaret_at`, kun `ny → besvaret`, kun mens `leveret IS NULL`.
  2. *Fremhæv-grenen* — KUN `offentlig, offentlig_tekst, offentlig_svar, fremhaevet_at, fremhaevet_af`; kræver `old.status = 'besvaret'`; når `new.fremhaevet_at` ikke er null: `offentlig_tekst` og `offentlig_svar` 1–1000 efter trim, `fremhaevet_af = auth.uid()`, `fremhaevet_at = now()` (serverens ur, som `svaret_at`), `offentlig = true`; «tag ned» = KUN `fremhaevet_at → null` (og `fremhaevet_af` urørt).
  3. En UPDATE, der blander kolonner fra begge grene, afvises (42501). Service role og postgres passerer som i dag.
  Migrationens PRØVE (savepoints, forventet udfald pr. linje, som `050000`'s) dækker: fremhæv et `ny` → 55000; blanding → 42501; to fremhævede i samme session via direkte UPDATE → 23505; tjenestekonto → 0 rækker; medlem → 0 rækker; `fremhaevet_af` ≠ dig → 42501.
- **Serveren:** `webinar-puls` svarer med **`fremhaevet`**: `{ id, spoergsmaal, svar, siden_ms } | null` — KUN `offentlig_tekst` og `offentlig_svar`, ALDRIG `tekst`, `svar_tekst`, `tilmelding_id` eller noget om spørgeren (værn). Opslaget er ét indekseret `select … where session_id = … and fremhaevet_at is not null limit 1`, cachet pr. session i **5 s** (ikke 10: værten skal kunne se det komme frem). I rummene `lobby`, `intro`, `afsluttet` og `aflyst` er feltet `null` uden opslag.
- **Forsinkelsen, regnestykket:** cache 5 s + pulsinterval 15 s (spiller) = **op til 20 s**, før en seer ser et nyt fremhævet spørgsmål (60 s på pause — men da dækker «Tilbage til webinaret» alligevel). Konsollen siger det: «Vises for seerne inden for ca. 20 sekunder.» Det er godt nok og koster ingen Realtime (spec §D3).

**Måling:** rækken bærer `fremhaevet_at`/`fremhaevet_af` for den SENESTE visning; hvor mange der var i rummet, kan udledes af `webinar_deltagelser`/`webinar_pulser` på tidspunktet. Historikken over flere visninger af samme spørgsmål gemmes ikke (et bevidst valg; en egen tabel, hvis I9 åbner genbrug).

**Ærlighed og privatliv:**
- **«En deltager spurgte» — ÅBEN beslutning I1b** (anbefaling: anonymt, ingen by, ingen branche). Spec §A7 foreslog «En direktør fra Aarhus spurgte …» til de kuraterede; det er mere persondata, end båndet behøver.
- Det er en behandling af spørgerens tekst for andre. **Privatlivsteksten** på topix.dk (B4) skal derfor også sige: «Dine spørgsmål kan blive vist anonymt for de andre deltagere, hvis vi svarer på dem for alle.» Og panelets løfte («Kun Morten ser det») skal rettes, FØR fremhævningen tændes: «Kun Morten ser dit navn. Svarer han for alle, vises spørgsmålet uden navn.» (værn: teksten følger låsen — se nedenfor).
- **Låsen `app_config.webinar_fremhaev_aktiv`** (fraværende = false, fail-closed): uden den viser konsollen ikke knapperne, og pulsen svarer altid `fremhaevet: null`. Låsen åbnes først, når privatlivsteksten er publiceret.

### 9.7 Funktion 5 — Automatiske chatbeskeder på tidskode (og velkomst)

**Formål:** eWebinars «Private Message» og velkomstbesked: en besked i chatpanelet, der kommer på et bestemt tidspunkt («Hej Anne — skriv gerne dit spørgsmål her, jeg svarer løbende»; «Om lidt viser jeg regnearket — du får det i exitrummet»).

**Seeren ser:**
- I chatpanelet (`SpoergPanel`, der bliver en samtale) beskederne og seerens egne spørgsmål og svar i ÉN tidsordnet liste. Beskedens tid = sessionens start + intro + `vis_fra_sek` (for `indgang`: seerens indgang; for `exitrum`: exitrummets start).
- **Mærkningen (anbefaling, ÅBEN beslutning I1a):** hver automatisk besked har en lille etiket over sig, **«Automatisk besked fra Morten»**, i en anden tone end værtens svar («Morten svarer»). Ingen «Morten skriver …», ingen kunstig forsinkelse, ingen tid, der foregiver at være «lige nu». Alternativet (eWebinars: beskeden står som Mortens uden etiket) frarådes — det er præcis den live-illusion, G1 siger nej til.
- `{fornavn}` udfyldes i KLIENTEN med `hilsen.fornavn` (den navngivne undtagelse); er fornavnet ukendt, vises `tekst_uden_navn`. Den rene dom `udfyldBesked(indhold, fornavn) → string` (spejlet, paritet) — aldrig «Hej , …».
- En knap i beskeden virker som §9.2's klikbare (`maal`, klik med `sendFoerNavigation`).
- **Ny besked, mens panelet ikke er i syne** (mobil: panelet står under videoen og kortene): en lille boble nederst på skærmen «Ny besked fra Morten» (`aria-live="polite"`), der ruller panelet ind ved tryk. I fuld skærm: toasten fra §9.1.
- Seeren kan svare i panelet. Svaret er et ALMINDELIGT spørgsmål (`webinar_spoergsmaal`) og lander i konsollen — rigtigt, ikke simuleret.

**Hvornår en besked vises — den rene dom** `synligeBeskeder(tidslinje, rum, posSek, indgangPosSek, k) → Besked[]` (`webinarMotor/interaktioner.ts`, spejlet):
- `indgang`: i `lobby`, `intro`, `afspilning` og `exitrum` — altid først i listen.
- `tidskode`: når `rum = afspilning` og `posSek ≥ vis_fra_sek`, eller rummet er `exitrum`/`afsluttet` — **men kun hvis `vis_fra_sek ≥ indgangPosSek − 60`**: en sen indgang får IKKE alle de passerede beskeder på én gang, fordi de er FORÆLDEDE: en besked skrevet til minut 12 («om lidt viser jeg regnearket») er usand for den, der kommer ind i minut 30 — og husets regel er, at teksten skal være sand, når den læses (samme regel som mailenes indhentningsloft, §4). `indgangPosSek` = serverens forventede position, første gang seeren gik ind i denne fane, gemt i `sessionStorage` gennem `webinarRum/lager.ts` (pr. token; den ENE fil, der må — `webinarRum.guard` dom 3). En genindlæsning beholder den; en ny fane eller enhed begynder forfra (bevidst).
- `exitrum`: i `exitrum`.
- `betingelse` (`efter_svar`, `min_set_procent`) som for kortene, på seerens egne svar og serverens `set_procent`.
- **Ingen opbevaring:** beskederne er AFLEDT af tidslinje + position + indgang. De skrives aldrig i `webinar_spoergsmaal`, `webinar_svar` eller loggen — så der findes ingen «chathistorik», der kan forveksles med en rigtig (værn 9-6).

**Værten gør (editoren, 9e):** art «Chatbesked», udløser (ved indgang / på tidskode / i exitrummet), tidskode, tekst med `{fornavn}`-knap, «tekst uden navn» (påkrævet, når `{fornavn}` står i teksten), valgfri knap, valgfri betingelse. En forhåndsvisning viser begge udgaver («Anne» og uden navn). Velkomsten er blot en `chatbesked` med `udloeser: "indgang"`. **Konsollen (9f)** viser «Næste automatiske besked kl. 11.23: …», så værten ved, hvad seerne lige har fået.

**Data:** arten i `webinar_interaktioner`s CHECK (ikke i `webinar_svar`s). Ingen nye kolonner.

**Måling:** «vist» = deltagere, der pulsede i `afspilning` på beskedens tidspunkt og var gået ind før `vis_fra_sek + 60` (udledes af `webinar_deltagelser.foerste_ind_at` og `webinar_pulser`). «Svar på beskeden» = spørgsmål stillet inden for 3 min efter (`webinar_spoergsmaal.pos_sek`). Begge er SQL til skive 7; ingen ny skrivning.

**Ikke med (bevidst):** eWebinars **auto-svar** («Morten er ikke ved tasterne …») kræver en «online»-status i konsollen — ikke bygget (§7.7, spec §A7). Beslutning I4.

### 9.8 Funktion 6 — Tip, Special offer, Next webinar: vurdering

**Vurderingen:** ingen af de tre er nødvendige for paritet med det, Morten faktisk bruger (chat, feedback, CTA — §9.0). De dækkes af det, der findes, eller af pakken:

| eWebinar | Hos os | Ny kode? |
|---|---|---|
| **Special Offer** (tilbud med udløb) | `cta` med `nedtaelling: true` + `udloeber_kilde` — KUN en sand frist (`ctaVindue`, spec §A6.1) | Nej |
| **Next Webinar** | «Tag næste session» i exitrummet, efter `afsluttet` og ved sen indgang (`gen_tilmeld`, skive 2) | Nej |
| **Tip** (en kort tekst på skærmen) | `chatbesked` på tidskode, eller `knap`/`billede` over videoen | Nej |

**Anbefaling: byg dem ikke.** Spec'ens risiko 6 («scope-creep — eWebinar har 25+ interaktioner») gælder. Jonas kan vende den (beslutning I4b).

### 9.9 Værn (mutationsbeviser) og migrationen

**Migrationen** `2026100309xxxx_webinar_interaktiv.sql` — tidsstemplet vælges, så filen sorterer EFTER enhver kørt, efter `20261003080000` OG efter #1262's migration (`20261003070000_meta_haendelser_tilmelding.sql` i dag), når den omdøbes efter `20261003080000` — stakken omordnes med #1262 øverst (rådet 3/10). Mål navnet på #1262's fil, når 9b bygges; sorterer 9b ikke efter den, STOP (`metaSend.guard` dom 11 `ukoerteFoerKoerte`). Første linje `-- IKKE KØRT. DEPLOY: …`. ÉN transaktion, kun tilføjende bortset fra de to CHECK'er og kolonneværnets funktion. Porten: `raise exception`, hvis skive 1 (`webinar_interaktioner`) eller konsollen (`webinar_spoergsmaal_vaert_kolonnevaern`) ikke findes.
1. `webinar_interaktioner.art` CHECK: drop + add med de 14 arter. **Navnet på den nuværende CHECK MÅLES i FØR-SQL** (`pg_constraint`, `conrelid = 'public.webinar_interaktioner'::regclass and contype = 'c'`) — forventet `webinar_interaktioner_art_check`; afviger det, STOP.
2. `webinar_svar.art` CHECK: drop + add med de 9 (`cta, feedback, poll, quiz, spoergsmaal_prompt, testimonial, billede, knap, hotspot`). Samme måling.
3. `webinar_spoergsmaal`: `offentlig_svar`, `fremhaevet_at`, `fremhaevet_af` + CHECK'er + det delvise unikke indeks.
4. Kolonneværnet: `create or replace` med de to grene (§9.6).
5. RPC'erne `webinar_fremhaev_spoergsmaal`, `webinar_tag_ned` (SECURITY INVOKER; EXECUTE `authenticated`, ikke `anon`).
6. `webinar_poll_resultat` (SECURITY INVOKER, STABLE; EXECUTE kun `service_role`).
7. Låsen `webinar_fremhaev_aktiv = false` (`ON CONFLICT DO NOTHING`).
8. (Hvis I6 = Supabase Storage) bucketten `webinar-billeder` og dens politikker: SELECT `public`, INSERT/UPDATE/DELETE `to authenticated` med `has_role(auth.uid(),'advisor')` og NOT tjenestekonto. Ellers udelades punktet. **Kræver Jonas' ja (regelsættet §3: RLS, der gør adgang bredere — en offentlig læsepolitik).**

**Hele 9b kræver Jonas' ja før kørsel** (regelsættet §3: RLS, der gør adgang bredere — punkt 4 og 8).
FØR- og EFTER-SQL som ÉT resultatsæt hver (UNION ALL med sektionskolonne — Lovables SQL editor eksporterer kun det sidste), ROLLBACK i filhovedet, PRØVEN fra §9.6 i én transaktion med `rollback`.

**Værnet `webinarInteraktiv.guard.test.ts`** — hver dom med et mutationsbevis (mutationen skrives i testen og SKAL fælde):

| # | Dommen | Mutationen, der skal fælde |
|---|---|---|
| 1 | `INTERAKTION_ARTER` = den nyeste CHECK på `webinar_interaktioner.art`; de klikbare + de fem gamle = CHECK'en på `webinar_svar.art` | en art fjernet fra CHECK'en; en art tilføjet i TS alene |
| 2 | `person`, `rolle`, `virksomhed`, `foto_url` står i `MOTOR_FORBUDTE_NOEGLER` (begge spejle); de passerer KUN gennem undtagelsen `testimonial` på `tidslinje[N].indhold.*`, når elementets `art = testimonial` og `samtykke === true`, og kun i `webinar-rum` «tilstand». Et eksempel af hver ny art gennem `seerTidslinje` → `findMotorForbudteMed(…, "testimonial")` = tom; samme felter i enhver anden placering (et andet svar, en anden art, `samtykke` false/fraværende, et andet niveau, pulsens svar) fælder | `person` fjernet fra listen; undtagelsen gjort sti-baseret uden art/samtykke-tjek; undtagelsen brugt i `webinar-puls`; en `knap` med `indhold.person` |
| 3 | `poll_resultater` bærer kun `interaktion_id, svarere, fordeling, grundlag`; `fordeling` = null under `POLL_MINDST`; kun for polls, seeren har svaret | `POLL_MINDST` = 0; opslaget i egne svar fjernet |
| 4 | `fremhaevet` læser KUN `offentlig_tekst`/`offentlig_svar` — `webinar-puls` nævner aldrig `tekst`/`svar_tekst` i det opslag; feltet er null uden låsen | `select("tekst, …")` i opslaget; låsen ignoreret |
| 5 | Hver `chatbesked` tegnes med etiketten (`AUTOMATISK_ETIKET` fra én konstant — ordlyden er I1a) | etiketten fjernet fra komponenten |
| 6 | Ingen fil skriver en `chatbesked` til `webinar_spoergsmaal`, `webinar_svar` eller `webinar_motor_log`; `svarKanModtages` er falsk for arten | en insert fra tidslinjen; `iVindue` sand for `chatbesked` |
| 7 | Spolespærren står over interaktionslaget (z-20 > z-10) og tegnes, når `daekKontroller` | z-værdierne byttet; spærren bag et `if` på laget |
| 8 | Hvert klikbart barn i laget er `<a>`/`<button>` med `aria-label`; intet `div onClick`; «På videoen nu» findes | et hotspot som `div onClick`; listen fjernet |
| 9 | `url` er `https://` på `LINK_VAERTER`, og intet klikbart barns `href` indeholder tokenet uden for `ansoegUrl`s fragment | `http://` accepteret; tokenet lagt i en query |
| 10 | Kolonneværnet: fremhæv-grenen kræver `besvaret`; blanding af grene afvises; det delvise unikke indeks findes | grenvalget fjernet; indekset uden `where` |
| 11 | Migrationen: IKKE KØRT-hovedet, porten, ÉN transaktion, sorterer efter enhver kørt, ingen SECURITY DEFINER | `security definer` på en af RPC'erne |
| 12 | `udfyldBesked`: `{fornavn}` uden fornavn giver `tekst_uden_navn`; en ukendt `{…}` afvises af skemaet | fald-tilbage til `tekst` med tom streng |
| 13 | `fladeOverVideo`: klip mod spærren, træfflade ≥ 44 px, `null` under 24 px, letterbox regnet | klippet fjernet; minimumsfladen 0 |
| 14 | `anonymDom` blokerer fornavn, mail, telefon og 8-cifret tal i begge tekster | telefonmønstret fjernet |
| 15 | Hooks i topblokken i alle nye komponenter (React #310) | en hook efter en betinget return |

Eksisterende værn, der skal FLYTTES til den nye sandhed (ikke slækkes): `webinarMotor.paritet` (nye/ændrede spejlede filer), `webinarMotor.guard` dom 5 (den nye migration), `webinarRum.guard` dom 3 (`lager.ts`s nye nøgle), `webinarKonsol.guard` dom 4 (svaret skrives stadig kun i svarkolonnerne af SVAR-handlingen; fremhævningen går gennem RPC'en) og dom 5 (migrationen efter), `webinarMotorSkive3.guard` dom 6 (editorens nye arter), `tjenestekonto.guard` (konsollens nye knapper).

### 9.10 Skiverne — motor før flade

Hver skive: egen gren fra den forrige → `bun run test` + `bunx tsc --noEmit -p tsconfig.app.json` + `bun run check:edge-auth` grønne → bogført i dette dokument (nyt underafsnit §9.12 ff. pr. skive) → ingen merge uden Jonas. «Færdig» betyder alle punkter, ikke de fleste.

| Skive | Indhold | Afhænger af | Færdig når |
|---|---|---|---|
| **9a Motoren** | `interaktioner.ts`: de fem arter, skemaerne, `doemSvar` for klik, `iVindue`/`svarKanModtages` falsk for `chatbesked`, `synligeBeskeder`, `udfyldBesked`, `pollResultatDom` (spejlet ordret, paritet). `svar.ts`: de fire personnøgler på `MOTOR_FORBUDTE_NOEGLER` + undtagelsen `testimonial` med art/samtykke-prædikatet (spejlet ordret). Klient-domme: `overlayFlade.ts` (`fladeOverVideo`, `overlayPlads`), `fremhaev.ts` (`anonymDom`). `KORT_ARTER` + `testimonial`. Ingen migration, ingen function, ingen flade | — | Prøver for hver dom inkl. kanterne (25/10-skiftet er ikke relevant; letterbox 4:3 i 16:9-boks; 360 px-telefonen; `{fornavn}` med og uden; en sen indgang 40 % inde med 5 passerede beskeder → kun dem fra −60 s; flervalgs-poll; 4 svarere → null) · værn 1 (TS-delen), 2, 6, 12, 13, 14 grønne med mutationsbevis · paritetstesten kender de nye/ændrede filer |
| **9b Data** | Migrationen §9.9 (punkt 1–7; 8 efter I6). **I6 besvaret før 9b bygges; Jonas' ja før kørsel** (regelsættet §3) | 9a, I6 | FØR/EFTER/PRØVE/ROLLBACK i filhovedet; værn 1 (SQL-delen), 10, 11 grønne · **ikke kørt** — Jonas kører den |
| **9c Serveren** | `webinar-puls`: klik på de nye arter (`cta_klik`), `poll_resultater`, `fremhaevet` (låsen, 5 s cache), fejl i fejlsummen, aldrig log pr. kald. `MOTOR_VERSION` = «boardroom-4». `webinar-rum` uændret bortset fra den delte fil | 9a, 9b | Værn 3, 4 grønne · `webinarMotor.guard` dom 3 (pulsens imports, intet `console` ud over fejlsummen) grøn · svaret bærer `poll_resultater` og `fremhaevet` (også som `[]`/`null`) — beviset for udrulningen |
| **9d Seerens flade** | Interaktionslaget (§9.1), `knap`/`billede`/`hotspot`, «På videoen nu», testimonial-kortet, poll-resultat i `InteraktionsKort`, fremhævet-båndet + toast, samtalen i `SpoergPanel` (beskeder + egne spørgsmål), boblen og fuld-skærm-toasten, panelets nye løfte bag låsen | 9a, 9c | Værn 5, 7, 8, 9, 15 grønne · prøvet i browser (Claude_Browser, en lokal side med syntetiske data — ingen prod) på 360 px og 1280 px, tastatur alene, VoiceOver eller NVDA på ét overlay, `prefers-reduced-motion` · **Bunny-iframe i fuld skærm prøvet på desktop**; mobil på fysiske enheder hører til runbookens §8.1 trin 7 (UMÅLT) |
| **9e Editoren** | `EDITOR_ARTER` + formularer for de fem arter, `{fornavn}`-forhåndsvisning, samtykke-krydset, `vis_resultat`, `link`-målet; foto-upload hvis I6 = Storage (ellers URL-felt med værtslisten) | 9a (9b for at gemme) | `webinarMotorSkive3.guard` dom 6 flyttet · formularerne dømmes af SAMME `interaktionSkema` (prøvet: editoren og serveren afviser det samme for hver art) |
| **9f Konsollen** | «Vis for alle» / «Svar og vis for alle» med `anonymDom`, «På skærmen nu» + «Tag ned», «Næste automatiske besked», knapperne skjult for tjenestekonti og bag låsen | 9a, 9b | `webinarKonsol.guard` flyttet · `tjenestekonto.guard` grøn · fail-soft før migrationen (42883/PGRST202 → knapperne vises ikke, med grunden) |
| **9g Visuel hotspot-placering** | En afspiller i editoren med signeret embed for en rådgiver (Bucket A; `authenticateUser` + rådgiver FØR signering) og en trækbar ramme, der skriver `x, y, b, h` | 9e; spec §B2 «preview» | `check-edge-function-auth` grøn · ingen embed uden rådgiver-JWT (prøvet) · **kan vente til efter P1** |

**Rækkefølgen ved udrulning — efter regelsættet §1a (merge først efter kørt migration), ét skridt ad gangen, når Jonas siger til:**
1. **Merge 9a** (ingen migration — rene domme og spejl).
2. **Kør 9b's migration** i SQL editor (Jonas' ja først, regelsættet §3; FØR-SQL gemt, CHECK-navnene som forventet, ellers STOP) og **mål**: `GET /rest/v1/webinar_spoergsmaal?select=offentlig_svar,fremhaevet_at&limit=0` → 200.
3. **Merge 9b.**
4. **Merge 9c og udrul de functions, der bundler de ændrede delte filer** (eksplicit deploy fra build-chatten). Målt med grep 3/10: `_shared/webinarMotor/interaktioner.ts` bundles af **tre** functions — `webinar-rum` og `webinar-puls` direkte og via `_shared/webinarMotorHent.ts`, `webinar-tilmeld` transitivt via `webinarMotorHent.ts` (`hentOffentligLaas`). **`webinar-motor-cron` bundler IKKE `interaktioner.ts`**; den importerer `_shared/webinarMotor/svar.ts` (`MOTOR_VERSION`), og 9a ændrer `svar.ts` (undtagelsen `testimonial`, de fire nye forbudte nøgler), 9c `MOTOR_VERSION` — derfor udrulles den også, ellers svarer den stadig «boardroom-3». Beviset: `motor: "boardroom-4"` i alle fire, og `poll_resultater`/`fremhaevet` i et pulssvar.
5. **Merge 9d–9f.**
6. **Update** i Lovable — aldrig før trin 4: den gamle `webinar-puls` afviser klikkene som `ikke_et_svar`, og den gamle `laesTidslinje` kasserer de nye arter (fail-closed, men en udgivet tidslinje med nye arter viser da intet).
7. Prøve i en intern session (§7.3) med én af hver art.
8. **Jonas åbner `webinar_fremhaev_aktiv`** (SELECT før/efter, UPDATE vagtet på `false`) først efter privatlivsteksten (I10).

~~«alle fire functions, der bundler `interaktioner.ts` gennem `webinarMotorHent.ts` … `webinar-motor-cron` (målt med grep 3/10)»~~ — **rettet 3/10 (rådet):** første udgave af §9 sagde fire. Jeg troede, at `webinar-motor-cron` importerede `webinarMotorHent.ts`; grep'en viser, at den fra motoren kun importerer `ur.ts` og `svar.ts`. Den udrulles stadig, men af grunden i trin 4.

### 9.11 Beslutninger, Jonas skal tage

| | Beslutning | Anbefaling | Blokerer |
|---|---|---|---|
| **I1a** | Automatiske chatbeskeder: mærket «Automatisk besked fra Morten» (G1), eller som eWebinar uden mærke? | **Mærket.** Det er G1's ånd: ingen live-illusion i et hus, der sælger tillid | 9d (ordlyden i `AUTOMATISK_ETIKET`) |
| **I1b** | Fremhævet spørgsmål: «Spørgsmål fra en deltager» helt anonymt, eller med by/branche? | **Helt anonymt.** Båndet behøver ikke mere persondata | 9d, 9f |
| **I2** | Poll-resultater: kumulativt over alle (ikke-interne) sessioner med samme version, eller kun denne session? Og `vis_resultat` som standard til? | **Kumulativt, mærket «af dem, der har set webinaret»**, standard til. Én session når sjældent 5 svar på en poll tidligt | 9a (`grundlag`), 9c |
| **I3** | Testimonials: hvor gemmes samtykket? | **Uden for repoet** (rådet 3/10): en tabel (fx `webinar_testimonial_samtykke`, kun rådgivere, med hvem/hvornår/hvordan) ELLER Jonas' egen mappe. Repoet bærer KUN antallet og en henvisning til, hvor samtykket ligger — aldrig navne. Editorens kryds er en påmindelse, ikke beviset | 9b (hvis tabel), 9e |
| **I4** | Auto-svar («Morten er ikke ved tasterne …») og en «online»-status i konsollen | **Ikke nu.** Svaret på mail (§7.10) dækker den, der er gået | — |
| **I4b** | Tip / Special offer / Next webinar som egne arter (§9.8) | **Nej** — dækket | — |
| **I5** | `LINK_VAERTER` — hvilke værter må en knap/hotspot/besked linke til? | `topix.dk`, `www.topix.dk`, `theboardroom.dk`, `www.theboardroom.dk` | 9a |
| **I6** | Hvor bor billederne (testimonial-foto, billed-overlay)? | En offentlig Supabase Storage-bucket `webinar-billeder`, kun rådgivere skriver. Alternativ: Bunny Storage (ny secret, ny pull zone) | 9a (`BILLED_VAERTER`), 9b punkt 8, 9e |
| **I7** | Videoens billedformat — er Mortens video 16:9? | Mål den (Bunnys `video-info` `width`/`height`); `webinarer.billedformat` kun, hvis den ikke er 16:9 (ellers en konstant) | 9a (`fladeOverVideo`) |
| **I8** | Skal de eksisterende kort (CTA, poll, quiz, feedback) også op OVER videoen på desktop, som hos eWebinar? | **Ikke i denne pakke.** De står under videoen i dag; at flytte dem er et designvalg, der skal ses på skærme først | — |
| **I9** | Må fremhævede spørgsmål genbruges i SENERE sessioner («Spørgsmål fra tidligere deltagere», spec §A7)? | **Ikke nu** — kræver en egen visning og et ord i privatlivsteksten | — |
| **I10** | Privatlivsteksten (B4) udvides med fremhævningen og panelets løfte, FØR låsen `webinar_fremhaev_aktiv` åbnes | Ja — samme publicering som B4 | Låsen |

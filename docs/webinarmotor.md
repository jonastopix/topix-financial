# Webinarmotoren

Husets egen lead-motor, der skal erstatte eWebinar. Spec'en er `~/topix-financial-webinarmotor-spec.md` (30/9-2026). Den ligger uden for repoet, indtil den flyttes ind. Dette dokument er bogføringen: hvad der er bygget, hvad der står i drift, og hvad der mangler.

**Status 30/9-2026: skive 1 (motoren) er bygget på grenen `feat/webinarmotor-skive1` (PR #1158), skive 2 (seerens flade, §6) på `feat/webinarmotor-skive2` (PR #1161) oven på den, og skive 3 (det, der mangler til en INTERN prøvesession, §7) på `feat/webinarmotor-skive3` oven på skive 2 (med main flettet ind for #1162/#1167).** Intet er merget, ingen migration er kørt, og intet er udrullet. Runbooken for den interne prøvesession står i §7.3.

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
| CTA, poll, quiz, feedback på tidskoder | `webinar_interaktioner` (frossen tidslinje pr. session) + `webinar_svar` | **Motor (skive 1) + kort (skive 2)**: cta, poll, quiz, feedback, spoergsmaal_prompt. `haand`/`ressource` tegnes ikke endnu |
| Chat/spørgsmål + svar pr. mail | `webinar_spoergsmaal` + svar i pulsens svar | **Spørgsmål ind og svar ud live (skive 1), panelet i rummet (skive 2)**. Konsol og mailsvar = spec'ens skive 5 |
| Fremmøde-hændelser til Klaviyo (Deltog/Mødte ikke op) | `webinar-motor-cron` via `afgoerOvergang/byggFremmoede` | **Bygget (skive 3, §7.2)** — efter sessionen, ikke ved indgangen |
| `interactionsSummary` i `raa` (stjerner på /webinar) | `raaAdapter` | **Ikke bygget** (skive 2). `raa` = `{kilde: "platform", motor}` |
| Påmindelse 10 min før | Mailart `ti_minutter` (CHECK-migration først) | **Bygget 3/10-2026 (gren `feat/webinar-ti-minutter`), IKKE udrullet**: kun motorens rækker, vinduet T−30 … T−5 min (udvidet 3/10 efter CTO-rådets fund 1), porten `webinar_ti_minutter_klar` (§4). Migration `20261003040000` KØRT før deploy |
| Opsætning af webinar/tidslinje/sessioner | `webinar-admin` + editor | **Bygget, enkel (skive 3, §7.4)**: `/webinar/motor` gennem RLS. Bunny-upload, gentagelser, flyt og preview mangler |
| Analytics (faldkurve, tragt) | `faldkurve` (ren, bygget) + flade | **Dom bygget (skive 1)**, flade = skive 7 |
| Meta-pixel «Fuldfør registrering» | Pixel på topix.dk + evt. CAPI (beslutning G3) | **Ikke bygget.** D2.3 (30/9): koden bag låsen `webinarmotor_meta_aktiv`, men først efter privatlivsteksten — se §7.5 |

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
- `ansoegninger.webinar_tilmelding_id` sættes ikke — det kræver `ansoegning-gem` «fra_webinar» (spec §A9).
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

**Fail-soft:** før skive 1 (42P01/PGRST205/42703/PGRST204) står «Konsollen virker, når migrationen er kørt.» Efter skive 1, men før `050000`, læser konsollen alt, men et svar rammer 0 rækker (RLS) — hooken læser rækken igen og siger «konsollen kan først svare, når migrationen 20261003050000 er kørt» (står den stadig `ny`), ellers «en anden har svaret imens».

**Rækkefølgen:** merge → `20261003010000` KØRT (forudsætning) → `20261003050000` KØRT: FØR-SQL og EFTER-SQL som ét resultatsæt hver (filhovedet; facit: tre politikker, triggeren, funktionen, `has_table_privilege` = true, anon uden EXECUTE) og prøven i én transaktion med `rollback` (filhovedet) → **Update**. Ingen edge function er ændret; intet skal udrulles.

**Værn:** `webinarKonsol.guard.test.ts` (seks domme med mutationer: ruten bag AdvisorRoute og i ingen menu; ingen Realtime; kun fornavn; svaret kun i svar-kolonnerne og vagtet på `ny`; migrationen; hooks i topblokken) og `webinarKonsol.test.ts`. `webinarMotorSkive3.guard` dom 6 tillader nu `konsol.ts` som stiens eneste bygger; `webinarMotor.guard` dom 5 kender den nye migration.

**Ikke bygget (bevidst):** afvis, «offentlig/FAQ», hænder oppe som egen liste, synk/afspillerfejl, «online»-status og autosvar (spec §A7/§B4), svar på mail (skive 5), klokketyper.

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
7. `ansoegninger.webinar_tilmelding_id` (skive 4).
8. Efter B2: udkast til indlejrings-scriptet (honningfelt, utm/fbclid, `_fbp`/`_fbc` kun med samtykke, `CompleteRegistration` med `eventID` = tilmeldings-id).

**~~Kendt hul (fra v2-flettet)~~ — LUKKET 2/10-2026** (gren `fix/webinar-intern-maal-annoncer`): `maalstreger` og `annoncepriser` filtrerer nu `erInternTilmelding` i dommens indgang i begge spejle (`src/lib/webinar/maalstreger.ts` ⇄ `_shared/webinarMaalstreger.ts`, `src/lib/webinar/annoncepriser.ts` ⇄ `_shared/annoncepriser.ts`) — målt: de fik de RÅ rækker fra hooken og fra `webinar-delt`, og begge hentninger beder allerede om `intern:raa->>intern`. Prøver i `maalstreger.test.ts` og `annoncepriser.test.ts`; værn `webinarMotorRaad.guard` dom 5b (med mutationer). Ruller med næste udrulning af `webinar-delt` (delt fil) og Update.

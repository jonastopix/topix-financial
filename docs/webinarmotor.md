# Webinarmotoren

Husets egen lead-motor, der skal erstatte eWebinar. Spec'en er `~/topix-financial-webinarmotor-spec.md` (30/9-2026). Den ligger uden for repoet, indtil den flyttes ind. Dette dokument er bogføringen: hvad der er bygget, hvad der står i drift, og hvad der mangler.

**Status 30/9-2026: skive 1 (motoren) er bygget på grenen `feat/webinarmotor-skive1`.** Den er ikke merget, migrationen er ikke kørt, og intet er udrullet. Der er ingen flade.

**2/10-2026 — grenen `feat/webinarmotor-skive1-v2`:** main flettet ind (ingen adfærdsændring), og migrationen er OMDØBT `20260930100000_webinarmotor_skive1.sql` → `20261003010000_webinarmotor_skive1.sql`. Grunden: main har kørte migrationer helt op til `20261002276000`, og en ukørt fil må aldrig sortere før en kørt (husreglen; `metaSend.guard` dom 11 — `ukoerteFoerKoerte`). Indholdet er uændret.

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
- **Beviset i hvert svar:** `motor: "boardroom-1"`.

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
| Personligt `joinLink` | HMAC-token → `/w/<slug>?t=…` | **Token bygget (skive 1)**. Mailcronen bruger det ikke endnu (skive 2) |
| `invite.ics` (`addToCalendarLink`) | `bygIcs` (egen UID, SEQUENCE, Europe/Copenhagen) + `webinar-rum` GET `ics` | **Bygget (skive 1)**. Mailcronen vedhæfter den ikke endnu (skive 2) |
| Synkron afspilning, venteværelse, exitrum | `positionDom` + signeret Bunny-embed (webinarbiblioteket) | **Motor bygget (skive 1)**, flade = skive 3 |
| CTA, poll, quiz, feedback på tidskoder | `webinar_interaktioner` (frossen tidslinje pr. session) + `webinar_svar` | **Motor bygget (skive 1)**, overlays = skive 4 |
| Chat/spørgsmål + svar pr. mail | `webinar_spoergsmaal` + svar i pulsens svar | **Spørgsmål ind og svar ud live (skive 1)**. Konsol og mailsvar = skive 5 |
| Fremmøde-hændelser til Klaviyo (Deltog/Mødte ikke op) | `webinar-motor-cron` via `afgoerOvergang/byggFremmoede` | **Ikke bygget** (skive 2) |
| `interactionsSummary` i `raa` (stjerner på /webinar) | `raaAdapter` | **Ikke bygget** (skive 2). `raa` = `{kilde: "platform", motor}` |
| Påmindelse 10 min før | Mailart `ti_minutter` (CHECK-migration først) | **Ikke bygget** (skive 2) |
| Opsætning af webinar/tidslinje/sessioner | `webinar-admin` + editor | **Ikke bygget** (skive 6). Rækker oprettes i SQL editor indtil da |
| Analytics (faldkurve, tragt) | `faldkurve` (ren, bygget) + flade | **Dom bygget (skive 1)**, flade = skive 7 |
| Meta-pixel «Fuldfør registrering» | Pixel på topix.dk + evt. CAPI (beslutning G3) | **Ikke bygget** (skive 8) |

## 3. Udrulning af skive 1 (når Jonas siger til, i denne rækkefølge)

1. **Merge først efter kørt migration** (claude-regelsaet §1a): migrationen i SQL editor, EFTER-SELECT'en gemt, og `GET /rest/v1/webinar_tilmeldinger?select=kilde_system,session_id,token_version&limit=0` → 200.
2. **Secrets:** `WEBINAR_JOIN_SECRET` (32 tilfældige bytes, base64). Senere til skive 3: `BUNNY_WEBINAR_LIBRARY_ID` og `BUNNY_WEBINAR_TOKEN_AUTH_KEY`. Uden dem svarer rummet `embed: null, embed_status: "ikke_sat_op"`.
3. **Deploy** af `webinar-tilmeld`, `webinar-rum` og `webinar-puls` fra build-chatten («kør deploy-værktøjet og vis resultatet»).
4. **Beviset:** et testwebinar (`status = 'aktiv'`) og en session, oprettet i SQL editor. Derefter tilmeld (Origin `https://topix.dk`, en EGEN testadresse) → rum → 10 pulser med 15 s mellemrum → én række i `webinar_deltagelser` med `set_procent` > 0, og `motor: "boardroom-1"` i alle svar.
   - **Indtil skive 2** sender `webinar-mail-cron` bekræftelsen uden rum-link til platformens rækker (`join_link` er null). Derfor kun egne testadresser.

## 4. Skive 2 (næste)

`webinar-motor-cron` (Bucket B, hvert minut, tørkørsel som standard, lås `app_config.webinar_motor_aktiv`):
- sessionsstatus planlagt → aaben ved lobbyen (fryser snapshot'et og overtager `frysTidslinje`) → afholdt
- fremmøde → `state`/`sidste_action` (Watched/Missed) og Klaviyo-outbox via `afgoerOvergang/byggFremmoede` med `unique_id` `P-…:<grad>`
- `raaAdapter` → `interactionsSummary`
- opbevaring af `webinar_pulser` (90 dage)

`webinar-mail-cron`:
- udledte join-links (token)
- `bygIcs` i processen for platformens rækker
- mailarten `ti_minutter` (CHECK-migration KØRT før udrulning)

`klokkeMail.ts`: typerne `webinar_spoergsmaal`/`webinar_haand`/`webinar_drift`, før nogen klokke ringes.

## 5. Ikke bygget i skive 1 (bevidst)

- Ingen flade (motor før flade).
- Ingen gentagelser/JIT (`materialiser`, `naesteJitSession`). JIT er bag flag og uden for v1 (G6).
- Ingen `fremmoedeDom`/`raaAdapter`/Klaviyo (skive 2).
- Ingen `spor`-handling (anonym sidevisning) i `webinar-tilmeld` (skive 8).
- Ingen `haand` (kræver klokketype, skive 5), `gen_tilmeld`, `forudfyld`/`fra_webinar` (skive 4) og `preview` (skive 6).
- Nyhedsbrevssamtykket gemmes (`samtykke_nyhedsbrev_at`), men sendes ikke til Klaviyo (skive 4/8, bag lås).
- Seerens egen hilsen («Hej Anne») er ikke med. `fornavn` er på listen over forbudte nøgler, indtil skive 3 beslutter det.

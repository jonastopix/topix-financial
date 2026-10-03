# Webinarmotoren

Husets egen lead-motor, der skal erstatte eWebinar. Spec'en er `~/topix-financial-webinarmotor-spec.md` (30/9-2026). Den ligger uden for repoet, indtil den flyttes ind. Dette dokument er bogføringen: hvad der er bygget, hvad der står i drift, og hvad der mangler.

**Status 30/9-2026: skive 1 (motoren) er bygget på grenen `feat/webinarmotor-skive1` (PR #1158), og skive 2 (seerens flade, §6) på `feat/webinarmotor-skive2` oven på den.** Intet er merget, migrationen er ikke kørt, og intet er udrullet.

**Nummereringen:** Jonas' «skive 2» (30/9) er seerens flade — spec'ens skive 3 og dele af skive 4. Spec'ens skive 2 (motor-cron og mails) står i §4 og er IKKE bygget.

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
| Personligt `joinLink` | HMAC-token → `/w/<slug>?t=…` | **Token bygget (skive 1)**. Mailcronen bruger det ikke endnu (skive 2) |
| `invite.ics` (`addToCalendarLink`) | `bygIcs` (egen UID, SEQUENCE, Europe/Copenhagen) + `webinar-rum` GET `ics` | **Bygget (skive 1)**. Mailcronen vedhæfter den ikke endnu (skive 2) |
| Synkron afspilning, venteværelse, exitrum | `positionDom` + signeret Bunny-embed (webinarbiblioteket) | **Motor (skive 1) + flade (skive 2, §6)**: `/w/:slug`. Mobil-spike på fysiske enheder UMÅLT |
| CTA, poll, quiz, feedback på tidskoder | `webinar_interaktioner` (frossen tidslinje pr. session) + `webinar_svar` | **Motor (skive 1) + kort (skive 2)**: cta, poll, quiz, feedback, spoergsmaal_prompt. `haand`/`ressource` tegnes ikke endnu |
| Chat/spørgsmål + svar pr. mail | `webinar_spoergsmaal` + svar i pulsens svar | **Spørgsmål ind og svar ud live (skive 1), panelet i rummet (skive 2)**. Konsol og mailsvar = spec'ens skive 5 |
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
4. **Beviset:** et testwebinar (`status = 'aktiv'`) og en session, oprettet i SQL editor. Derefter tilmeld (Origin `https://topix.dk`, en EGEN testadresse) → rum → 10 pulser med 15 s mellemrum → én række i `webinar_deltagelser` med `set_procent` > 0, og `motor: "boardroom-1"` i alle svar (`"boardroom-2"`, når skive 2 er med).
   - **Indtil skive 2** sender `webinar-mail-cron` bekræftelsen uden rum-link til platformens rækker (`join_link` er null). Derfor kun egne testadresser.

## 4. Motor-cron og mails (spec'ens skive 2 — IKKE bygget)

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

**Afspilleren** (`components/webinarRum/Afspiller.tsx`, player.js — allerede en afhængighed): `spoleDom` ved hver `timeupdate` (3 s tolerance, én korrektion pr. 8 s, aldrig under buffer — player.js har ingen buffer-hændelse, så «spiller» uden timeupdate i 2,5 s er «buffer»); et gennemsigtigt lag over kontrolbjælken (søgebjælken kan ikke trækkes); egne knapper under videoen: Pause / Tilbage til live, Lyd, Fuld skærm (kun hvor `document.fullscreenEnabled`). **iPhone, plan A:** står afspilleren på pause 1,5 s efter «ready», spilles der uden lyd fra serverens position, og «Tryk for lyd» vises (`autoplayDom`).

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

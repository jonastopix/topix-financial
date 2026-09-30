# Webinarmotoren — husets egen lead-motor i stedet for eWebinar

**Produkt- og teknisk spec, klar til at bygge efter.** Skrevet 30/9-2026 nat på Jonas' bestilling (29/9 23:42). Repo læst read-only på `origin/main` `84323f3` (worktree `/home/claude/wt-webinarspec`). Intet er rørt, intet er målt i prod. Hvor noget ikke er målt, står der **UMÅLT**. Research er hentet 30/9 via web. URL'erne står ved påstandene og samlet i §K.

Spec'en bygger videre på `docs/analyser-30-09/webinar-og-referater.md` del A (recon af alt, vi får fra eWebinar i dag). Den gentager ikke recon'en, men tager stilling der, hvor recon'en lod noget stå åbent. **Tre steder går den bevidst imod recon'en eller opgaveteksten, og begrundelsen står hvert sted:**

1. **Join-tokenet er HMAC, ikke et gemt SHA-256-aftryk** (§D2). Mailcronen skal kunne bygge linket igen i syv mails over 14 dage.
2. **Seerne får ikke Supabase Realtime** (§D3). Pro-loftet er 500 samtidige forbindelser, og målet er 500 seere.
3. **Ingen simuleret chat-historik og ingen falske «X ser med»-tal** (§A7, §G1).

---

## 0. Kort fortalt

- **Hvad:** et live-simuleret webinar på platformen. Tilmelding (formular på topix.dk → vores function) → bekræftelse med vores egen `.ics` → påmindelser (den eksisterende `webinar-mail-cron`) → venteværelse → synkron afspilning fra Bunny med serverens ur → interaktioner på tidskoder → spørgsmål til rådgiveren → exitrum med feedback og en ansøgning, der er udfyldt på forhånd.
- **Data:** alt bliver hos os. Hver seer har en bitmap over de 5-sekundersstykker, der faktisk er set. Den giver `set_procent` på eWebinars skala og faldkurven pr. 5 sekunder. Hver interaktion, hvert spørgsmål og hver feedback har sin egen række. Rå puls i 90 dage.
- **Ingen læser skal skrives om:** motoren skriver de samme kolonner i `webinar_tilmeldinger`, som eWebinar-webhooken skriver i dag, med eWebinars ordforråd (`state`, `sidste_action`, `set_procent`, utm/fbclid, `session_tid`). Derfor virker `webinarDom.ts`, Klaviyo-fremmødet (`webinarHaendelser.ts`), `meta-send` (webinarens `fbclid`), `klaviyo-profil-cron`, `/webinar`-dashboardet og delingen uændret. Paritet er et krav, ikke et ønske.
- **Byggeplan:** ti skiver (0–9, §F), motoren først. Ca. 38–41 agentdage i alt. Med 3–4 agenter parallelt efter skive 1 er der **ca. 4–5 ugers kalendertid til den første skyggesession**. Den rigtige flaskehals er udrulningsrunderne i Lovable (ca. 20), som Jonas kører én ad gangen.
- **eWebinar opsiges tidligst**, når den sidste session med eWebinar-tilmeldte er afholdt, de ni beviser i §E3 står grønne, og data er eksporteret.

---

## Hvad vi ved fra vores egne tal (det vigtigste grundlag)

Målt i prod 22/9 og 28/9 (`docs/webinaret-og-annoncerne.md` §7b, §7f), ikke af mig:

| Led | Tal | Andel |
|---|---:|---|
| Tilmeldte 22/9 | 384 | |
| Mødte op | 159 | 41 % af tilmeldte |
| Så ≥ 75 % | 113 | 29 % af tilmeldte · 71 % af de fremmødte |
| Klikkede «Ansøg» i webinaret | 17 | 15 % af dem, der så ≥ 75 % |
| Klikkede «Ikke klar endnu» | 17 | |
| Så ≥ 75 % og klikkede intet | 35 | |
| Indsendte samme dag | 4 af de 17 | **11 af de 17 forsvandt, før der overhovedet fandtes en række** (introsiden med prisen, CVR som første spørgsmål) |

**Til sammenligning** (andres platforme, andre publikummer, så kun som pejling): ON24 måler 57–60 % fra tilmelding til fremmøde og 49 minutters gennemsnitligt engagement ([ON24 2026-benchmarks](https://www.on24.com/blog/key-takeaways-from-the-webinar-benchmarks-report/), [MarketingProfs/ON24](https://www.marketingprofs.com/charts/2025/52917/b2b-webinar-benchmarks-conversion-attendance-personalization?e=4)). Goldcast måler 33 % fremmøde og ca. 29 minutters gennemsnitlig visning ([Goldcast 2025](https://www.goldcast.io/blog-post/2025-webinar-statistics-b2b-marketers-should-know)).

**Hvad tallene betyder for designet:**
1. **Det største tab ligger mellem CTA-klikket og ansøgningens første række (11 af 17).** Den billigste gevinst er derfor et exitrum, der sender ind i en ansøgning, som allerede kender navn og e-mail (§A9). Det slår enhver ny interaktionstype.
2. **Det næststørste tab ligger før fremmødet (225 af 384).** Venteværelse, kalenderfil, 10-minutters-mail og «tilbyd næste session» går efter det.
3. **Fastholdelsen er god (71 %).** Faldkurven skal vise, *hvor* de resterende 29 % går, så videoen kan klippes. I dag kan vi ikke se det.

---

# A. Oplevelsen, trin for trin, for seeren

Ét princip gælder alle trin: **serveren ejer uret og sandheden, browseren viser den.** Alle tidspunkter er UTC i databasen og vises i `Europe/Copenhagen` (samme `kbhDele`/`klaviyoDato` som mailene).

## A1. Tilmeldingssiden

**Hvor den bor:** en formularkomponent på **topix.dk/webinar** (site-repoet), der POSTer til vores `webinar-tilmeld`. Begrundelsen er i §G2: topix.dk har allerede samtykkebanneret, GTM, pixlen og de 13 links, der fører til `/webinar`. `app.theboardroom.dk` har ingen af delene (`docs/tracking.md` §2 række 18), og seerrummet skal forblive uden tredjeparts-tracking.

**Indhold (egen branding):**
- Overskrift, Mortens portræt, 3 punkter om udbyttet, varighed og «optaget webinar — Morten svarer live på spørgsmål i chatten» (§G1).
- **Sessionsvalg:** de næste 3 planlagte sessioner som knapper («tirsdag 13. oktober kl. 11.00»), den nærmeste valgt på forhånd.
  - Er JIT slået til (§G6): øverst «Starter om 12 min», med nedtælling, regnet af `naesteJitSession(nu)`.
  - En fuld session (valgfri `kapacitet`) vises ikke.
- **Felter:** fornavn (påkrævet), e-mail (påkrævet). Samtykkeboksen «Ja tak til Mortens nyhedsbrev» er valgfri og ikke sat på forhånd. **Kun den giver Hovedliste-samtykke.** En tilmelding er ikke samtykke (Jonas 22/9, `tracking.md` §6 punkt 13).
- **Skjult, samlet ved submit:**
  - `utm_*` og `fbclid` fra URL'en eller `localStorage["topix_utm_params"]`
  - `landing`, `referrer`
  - `_fbp`/`_fbc`, men kun hvis cookierne findes, dvs. med samtykke
  - GA-klient-id'et, med samme forbehold
  - et visnings-id, der kun lever i hukommelsen
- **Værn:**
  - honningfelt og IP-dagshash-loft (præcedens: `ansoegning-gem`, `SPOR_PR_IP_PR_TIME`)
  - e-mailform som `EMAIL_FORM` i `metaSend.ts`
  - Turnstile kun, hvis spam viser sig (UMÅLT, om topix.dk ligger bag Cloudflares proxy)
- **Svar (samme side, ingen redirect):** «Du er tilmeldt tirsdag 13. oktober kl. 11.00». Knapperne «Føj til Google-kalender», «Outlook» og «Apple/andet (.ics)». Linket til rummet og «Stil Morten et spørgsmål allerede nu» (lægges i køen, §A7).
- **Tracking ved succes:** `dataLayer.push({event: "webinar_tilmeldt", tilmelding_id})` og Meta-pixlens `CompleteRegistration` med `eventID = tilmelding_id`, når der er samtykke. Om der også sendes en CAPI-hændelse fra serveren, afgøres i §G3.
  - **I parallelperioden** skubbes også det gamle navn `ewebinar_form_submit`, så GTM/Stape/Klaviyo-identify (`tracking.md` §2 række 12) ikke går i stykker, før containeren er rettet. En ændring ad gangen.

**Dubletregler** (ren dom `tilmeldDom`, §C4):
- Samme e-mail og samme session: samme tilmelding returneres (idempotent). Bekræftelsen sendes ikke igen inden for 10 min.
- Samme e-mail og en *anden fremtidig* session af samme webinar: tilmeldingen **flyttes**, i stedet for at der kommer en ny. Historikken står i loggen. Det giver færre mails og ren data.
- En afmeldt (`webinar_afmeldinger`), der tilmelder sig igen: den nye, udtrykkelige tilmelding ophæver afmeldingen af *platformens webinarmails* (logget). **Klaviyo-samtykket røres aldrig.**

## A2. Bekræftelse

- **Mail straks:** den eksisterende art `bekraeftelse` i `webinar-mail-cron`, uændret tekst.
- **Kalenderfilen bygger vi selv** (`bygIcs`, ren, §C4) og lægger ind via `mimeInvitation.bygMime` (inline + vedhæftet, `method=REQUEST`, som i dag):
  - `UID:<tilmelding_id>@webinar.topix.dk` — *vores* UID, så en flyttet eller aflyst session kan opdatere samme aftale (`SEQUENCE` = `webinar_sessioner.ics_sekvens`, `METHOD:CANCEL` ved aflysning).
  - `ORGANIZER;CN=Morten Larsen:mailto:webinar@webinar.topix.dk`, `ATTENDEE;RSVP=FALSE`. RSVP=FALSE, fordi ingen læser svarene i v1. Svar går til en Mailgun-route, der logger «tilføjet til kalender» (v2-datapunkt, §C3).
  - `LOCATION` og `URL` = det personlige link til rummet, `DESCRIPTION` = link + «stil spørgsmål på forhånd».
  - `VALARM -PT15M`. Klienter, der ignorerer alarmer i invitationer, ignorerer den bare.
- **Det lukker samtidig fundet `a22-ewebinar-ics-aaben`** for vores egne tilmeldte: der er ingen offentlig, fortløbende URL, filen vedhæftes, og downloadet kræver token.

## A3. Påmindelser

Genbrug `webinar-mail-cron` og `webinarMailDom.ts` (PLANEN, nåden, indhentningen, loftet, alarmen). **Kun tre ændringer:**

| Art | Hvornår | Kanal | Status |
|---|---|---|---|
| `bekraeftelse` | straks | mail + ics | findes |
| `fjorten_dage` | 14 d. kl. 08:00 | mail + ics | findes |
| `syv_dage`, `tre_dage`, `en_dag` | kl. 08:00 | mail | findes |
| `dagen` | kl. 07:30 | mail | findes |
| `en_time` | −60 min | mail | findes |
| **`ti_minutter`** | −10 min | mail | **ny**. Overtager eWebinars sidste mail. CHECK-migration **FØR** udrulning (`webinarMail.guard` dom 10) |
| **`starter_nu`** (valgfri, §G) | +2 min, kun til dem uden puls | mail | ny. «Vi er i gang — gå ind her». Bliver kun, hvis den måles til at løfte fremmødet |

- **Join-linket** er for platformens rækker *udledt* ved afsendelse (`joinLink(tilmelding)`, HMAC, §D2) og aldrig gemt. Kolonnen `join_link` står `null` for dem. `planlaegKoersel` får det udledte link ind fra cronen, så dommen forbliver ren.
- **`MED_INVITATION`-arterne** henter ikke længere en fil fra eWebinar for platformens rækker. Cronen kalder `bygIcs` i processen. `hentInvitation` bliver kun til eWebinar-rækkerne.
- **SMS:** ikke i v1 (§G6). Tallene for SMS-løft kommer fra SMS-leverandørernes egne sider ([salesmessage](https://www.salesmessage.com/texting-playbook/increase-webinar-attendance), [mobile-text-alerts](https://mobile-text-alerts.com/articles/how-to-double-your-easywebinar-attendance-using-sms)) og er markedsføring, ikke målinger. EverWebinar tilbyder SMS og telefonopkald ([supplygem](https://supplygem.com/reviews/everwebinar/)). Datamodellen har plads (`telefon`, samtykke), så det kan prøves som et A/B-eksperiment senere.

## A4. Venteværelset

**Hvornår:**
- Rummet åbner `lobby_min` (standard 15) før `starter_at`. eWebinar gør det samme: «a countdown page so early arrivals know they're in the right place» ([eWebinar: rooms](https://ewebinar.com/help/intro-waiting-exit-rooms)).
- Før det: «Rummet åbner kl. 10.45», plus kalenderknapper og spørgsmålsfeltet.

**Indhold:**
- **Nedtælling** til start, regnet af serverens ur (§A5 urmodel), ikke af enhedens.
- **Tjekliste med tre tjek:**
  1. «Tryk for at teste lyden» spiller en kort lyd. **Tjekket er samtidig den brugergestus, der låser lyd op i browseren** (§A5 iOS).
  2. Forbindelsen: en lille Bunny-testklip-prefetch, der måler tiden til første billede. Tallet logges.
  3. «Hold fanen åben — webinaret starter af sig selv».
- **Stil et spørgsmål på forhånd:** det lander i rådgiverkøen med `pos_sek = null` («før start»).
- **Tilstedeværelse:** «23 venter i rummet». Tallet er det **reelle** antal med puls i lobbyen inden for de sidste 60 s. Det vises først fra 10 personer. Aldrig pustet op (§G1).
- **Musik:** valgfri knap «Ventemusik», og først efter lydtesten (autoplay med lyd kræver en gestus: [WebKit](https://webkit.org/blog/6784/)).
- **Intro-video (valgfri):** afspilles *før* hovedvideoen og tæller ikke med i `set_procent`, præcis som eWebinars «intro room» («not counted toward watch-percentage analytics», samme kilde). Længden lægges til sessionens tidsplan.

## A5. Live-simuleret afspilning

**Urmodellen (ren funktion `positionDom`, §C4):**
```
forventet_pos_sek = (server_nu − session.starter_at − intro_sek) / 1000
rum = foer_lobby | lobby | intro | afspilning | exitrum | afsluttet
```
- Klienten synkroniserer uret NTP-agtigt: de tre første svar fra `webinar-rum`/`webinar-puls` bærer `server_nu_ms`, og den forskydning, der har den mindste rundturstid, vinder: `offset = server_nu − (t_send + rtt/2)`. Uret genmåles ved hver puls, og ændringer glattes med ±250 ms.
- **Sen indgang:** afspilleren starter ved `forventet_pos` (`t=`-parameter i embed-URL'en, [Bunny embedding](https://docs.bunny.net/stream/embedding)). **Dommen `senIndgangDom`:** er `forventet_pos / varighed > 1 − SET_GRAENSE_PROCENT/100` (dvs. > 25 %), kan personen ikke længere nå 75 %. Rummet siger det ærligt og tilbyder to knapper: «Se med alligevel» og «Tag den næste session (tirsdag 3. nov.)», som gen-tilmelder med ét klik via tokenet. Grænsen afledes af `SET_GRAENSE_PROCENT`, så den flytter sig med den.

**Ingen spoling frem (blød håndhævelse):**
- Bunny har ingen parameter, der fjerner søgebjælken. Parametrene er `autoplay, muted, preload, loop, playsinline, t, showSpeed, rememberPosition, captions, compactControls, showHeatmap, chromecast, disableAirplay, disableIosPlayer` ([Bunny embedding](https://docs.bunny.net/stream/embedding)).
- Player.js giver `play, pause, getPaused, mute, unmute, getMuted, setVolume, getVolume, getDuration, setCurrentTime, getCurrentTime, on/off, supports` og hændelserne `ready, progress, timeupdate {seconds,duration}, play, pause, ended, seeked, error` ([Bunny playback-API](https://bunny.net/docs/stream/playback-api)).
- Håndhævelsen:
  1. Embed-URL: `autoplay=true&playsinline=true&showSpeed=false&rememberPosition=false&chromecast=false&disableAirplay=true&t=<pos>`, token-signeret som `get-video-embed` (`sha256(TOKEN_AUTH_KEY + guid + expires)`) med **udløb = sessionens slut + 30 min**, ikke 3600 blindt.
  2. Et gennemsigtigt overlay over den nederste kontrolbjælke. Iframen er cross-origin og kan ikke styles indefra.
  3. **Spoledommen `spoleDom(forventet, faktisk, tilstand, sidsteKorrektion)`** kører ved hver `timeupdate`:
     - `|faktisk − forventet| ≤ 3 s` → ok
     - `faktisk > forventet + 3` → `setCurrentTime(forventet)` (spolet frem)
     - `faktisk < forventet − 3`, og tilstanden er `spiller`, og der er ikke buffering → hop frem (bagud af afbrydelse)
     - **Hysterese:** højst én korrektion pr. 8 s, og ingen under buffering, så en langsom forbindelse ikke fanges i en søgeløkke. Hver korrektion logges med afvigelsen.
  4. **Pause er tilladt, spoling er ikke.** Pausen viser «Webinaret kører videre live. [Tilbage til live]», og knappen hopper til `forventet`. Pausetiden tæller ikke som set (bitmappen fyldes kun af puls i tilstanden `spiller`).
- **Ærlig grænse:** en, der åbner udviklerværktøjerne, kan omgå det, præcis som hos eWebinar. Det skader kun personens egen `set_procent`. Hård håndhævelse kræver egen HLS-afspiller (plan B nedenfor).

**Genoptagelse efter afbrydelse** (genindlæsning, mistet net, låst telefon):
- Samme token → `webinar-rum` regner positionen igen → afspilningen fortsætter live.
- Bitmappen giver ikke dobbelt kredit. Hullet står som hul i kurven.
- `puls.seq` er monoton pr. enhed. En ny enhed eller fane får sit eget `enhed_id`, og dækningen er foreningen.

**iOS/Android — den største tekniske risiko, derfor en SPIKE på dag 1 af skive 3:**
- Lyd kræver en gestus, og muted autoplay er tilladt ([WebKit](https://webkit.org/blog/6784/)). En gestus i vores side overføres ikke med sikkerhed til en cross-origin-iframe (WebKit-fejl 190794 handler om netop `allow=autoplay` efter click-to-play; [bugs.webkit.org](https://bugs.webkit.org/show_bug.cgi?id=190794), ikke læst i detaljer).
- **Plan A:** iframen indlæses ved «Gå ind» (brugerens gestus), `autoplay=true&muted=false`. Nægter browseren lyd, falder den tilbage til `muted=true` og et stort «Tryk for lyd», der kalder `player.unmute()`.
- **Plan B**, hvis A fejler på iOS Safari: egen `<video>` med HLS fra et Bunny-bibliotek med CDN-token (samme oprindelse som siden, fuld kontrol, også hård spolespærre). Det kræver en egen sikkerhedsopsætning af webinarbiblioteket, og `c0-bunny.md`'s Akademi-opsætning røres ikke.
- **Beviset:** tre fysiske enheder (iPhone Safari, Android Chrome, desktop) viser samme tidspunkt ±2 s, målt i `webinar_pulser.afvigelse_sek`.

## A6. Interaktioner på tidskoder

Tidslinjen er versioneret og **fryses ved sessionens start** (`webinar_sessioner.tidslinje_snapshot`). En redigering midt i en session ændrer ikke, hvad seerne ser, og analysen peger på den version, der blev vist. **Tidspunktet regnes af `forventet_pos`, ikke af afspillerens position.** Alle ser kortet samtidig, og en, der snyder med spolingen, udløser intet før tid.

| Art (v1) | Hvad seeren ser | Data |
|---|---|---|
| `cta` | Kort med tekst og knap. Valgfri nedtælling, **kun med en rigtig frist** (§A6.1) | vist, klik (sendBeacon **før** navigation), «ikke nu» |
| `feedback` | 1–5 stjerner + valgfri tekst. Typisk i exitrummet | svar |
| `poll` | 1 eller flere svar, resultat vist bagefter (valgfrit) | svar |
| `quiz` | Som poll + rigtigt svar og forklaring | svar, rigtigt/forkert |
| `spoergsmaal_prompt` | «Hvad er din største udfordring med …?» — fritekst | svar |
| `reaktion` | Altid-til-stede emojibjælke (👍 💡 ❤️ 😂). Tidskodede prompts valgfrie | pr. 5 s-stykke |
| `haand` | «Jeg vil gerne tale med Morten» → klokke til rådgiveren. **Ingen booking** (se nedenfor) | tidspunkt |
| `ressource` | Download (PDF i Bunny/Storage), link via token | klik |
| `kapitel` | Agenda-mærker i en sidebar, ikke en søgebjælke | — |

**Ikke med i v1:**
- «Pause video» (bryder synkroniteten).
- Kontaktformularer (vi har tilmeldingen).
- Testimonials og «næste eWebinar» (i stedet «Tag næste session» i exitrummet).
- Betinget visning ud over én regel: `betingelse` = «kun for dem, der svarede X på interaktion Y» eller «kun når set ≥ N %». eWebinar har betinget visning ([eWebinar interactions](https://ewebinar.com/features/interactions)). Vi bygger dommen fra start, men kun de to regler.

**`haand` fører ikke til booking.** Ansøgningsmotoren er vejen (`ny → indkaldt → booket …`, «DIREKTE TILBUD FINDES IKKE»). Hånden er et signal til rådgiveren og en anden måde at sige «jeg vil gerne tale»: rådgiveren svarer, og svaret peger på ansøgningen.

### A6.1 Nedtællinger — kun sande
Jonas bad om nedtælling. **Dommen `ctaVindue` nægter en nedtælling uden en kilde**, dvs. et felt `udloeber_kilde`, der peger på noget, vi selv ejer:
- sessionens slut: «Morten svarer på spørgsmål i 10 min endnu»
- en optagsfrist i `app_config`
- næste sessions start

Et opdigtet «tilbuddet udløber om 09:59» er i strid med husets princip «et felt, vi ikke selv sætter, er en observation», og formentlig også med markedsføringsloven om vildledning. Det er min vurdering, ikke juridisk rådgivning. eWebinar sælger «expiring offers» ([eWebinar interactions](https://ewebinar.com/features/interactions)). Vi tilbyder dem kun, hvis fristen findes.

## A7. Chat og spørgsmål

- **Privat «Spørg Morten» i et sidepanel.** Der er ingen offentlig chatstrøm i v1. Et spørgsmål lander i `webinar_spoergsmaal` og i rådgiverkonsollen (§B3). Beskeden «Tak — Morten svarer her, eller på mail, hvis du er gået» er sand.
- **Automatisk velkomst ved indgang:** «Hej Anne, skriv dit spørgsmål her — Morten svarer løbende». Automatisk svar, hvis ingen rådgiver er markeret «online» i konsollen: «Morten er ikke ved tasterne lige nu — du får svaret på mail». Begge dele svarer til eWebinar ([eWebinar chat](https://ewebinar.com/features/chat)).
- **Svar:**
  - Rådgiveren svarer i konsollen. Er seeren i rummet (puls inden for 45 s), ligger svaret i næste pulssvar og vises med det samme.
  - Ellers sender `webinar-svar-cron` det **på mail** efter 3 min via Mailgun (eget spor, `webinar_svar_mails`, fordi `webinar_mails`' unikke indeks er én pr. person, session og art, og en person kan få flere svar).
  - eWebinar gør det samme: «your reply is sent automatically via email» (samme kilde).
- **Ingen simuleret chat-historik.** EverWebinar importerer gamle samtaler og viser dem, som var de live ([supplygem](https://supplygem.com/reviews/everwebinar/)). Det er vildledende, og det er i strid med tonen i huset. Alternativet er «**Spørgsmål fra tidligere deltagere**»: kuraterede, rigtige spørgsmål og svar, tydeligt mærket, vist ved deres tidskode. Et spørgsmål kommer kun med, når rådgiveren har sat `offentlig = true`, og det vises anonymiseret («En direktør fra Aarhus spurgte …»).
- **Senere (v2):** et LLM-udkast til svaret, som rådgiveren godkender (aldrig automatisk afsendelse). Præcedens er Lovable AI Gateway i `handout-ai-feedback`. Hvor gatewayen behandler data (region/DPA), er UMÅLT (recon B2.3).

## A8. Exitrummet (takkerummet)

eWebinars exitrum har en konfigurerbar varighed («typical values: 5, 10, 15»), en primær CTA, en CTA efter exitrummet og en redirect for dem, der ikke mødte op ([eWebinar: rooms](https://ewebinar.com/help/intro-waiting-exit-rooms)). Vores:

1. **Straks ved videoens slut:** «Tak fordi du så med, Anne» og **feedback** (1–5 stjerner + «Hvad tager du med?»). Én skærm, ikke en formular.
2. **Derefter den primære CTA:** «Ansøg om en plads i The Boardroom». Knappen åbner `app.theboardroom.dk/ansoeg?kilde=webinar&wt=<token>` (§A9).
   - Den sekundære knap «Ikke klar endnu» logges som svar. Tragten bruger begge, og i dag er de lige store (17/17).
3. «Ikke klar endnu» → «Vil du have Mortens nyhedsbrev?» Det er et **udtrykkeligt** samtykke, én knap. Det lægger personen på Hovedlisten via Klaviyo `client/subscriptions`, samme vej som topix.dk-footeren. Det er ikke en automatisk optagelse. Det overholder 22/9-beslutningen.
4. Spørgsmålspanelet er åbent i hele exitrummet (`exitrum_min`, standard 15). Rådgiveren kan svare videre.
5. Efter exitrummet: siden står stille med CTA'en, «Tak for i dag» og «Næste session: …».

## A9. Fra exitrum til ansøgning — der hvor 11 af 17 forsvandt

- `wt=<join-token>` i CTA-linket. Samme oprindelse, ny fane.
- `/ansoeg` kalder `ansoegning-gem` med en **ny handling `fra_webinar`** (token som legitimation, `verifyDeltagertoken` FØRST). Den svarer **kun** med `navn` og `email` på tilmeldingen, og kun til den, der har tokenet. **Ingen persondata i URL'en.**
- Ved «opret» skrives **`ansoegninger.webinar_tilmelding_id`**. For første gang kobles ansøgning og webinar på **id**, ikke kun på e-mail. E-mailkoblingen (`hooks/webinar.ts`) bliver ved siden af som reserve.
- **Ingen egne utm-parametre på CTA'en.** Utm'erne er annoncens, ikke vores egne knappers. Ansøgningens annoncespor ville ellers blive overskrevet med «webinar/cta», og koblingen til den Meta-annonce, der skaffede personen, ville kun gå over e-mail. `kilde=webinar` er et af de seks ord i CHECK'en. **Intet nyt kildeord.**
- **Eksperiment, som Jonas skal tage stilling til senere, ikke nu:** springer en webinar-klikker over introsiden (prisen står jo i webinaret)? Det måles i `ansoegning_visninger`, der allerede findes (28/9).

## A10. Replay-politik og efter-flowet

- **Ingen replay** (Jonas 28/9: optagelsen sendes ikke, siden er taget ned). `WatchedReplay` udgår.
- **Den, der ikke mødte op**, får «Tag næste session» med ét klik (gen-tilmelding via tokenet). Den samme knap står i rummet efter `afsluttet`. Datamodellen understøtter on-demand (`session_type = 'OnDemand'`) uden ændring, hvis beslutningen nogensinde vendes.
- **Efter webinaret ejer Klaviyo stadig flowene** (`Wq3MkG`, `SDVvCW`), udløst af «Deltog i webinar»/«Moedte ikke op». Motoren sender dem med samme form og `unique_id` (§C5).

---

# B. Rådgiverens side (alt bag login, rådgiver-gate)

## B1. Opret et webinar

Ny flade `/webinar/motor` under det eksisterende `/webinar`:
- Titel, slug, værtsnavn og portræt, beskrivelse (Tiptap findes), `lobby_min`, `exitrum_min`.
- **Video:** upload via det eksisterende TUS-flow (`bunny-content-admin` + `HbBunnyPicker`) til et **eget Bunny-bibliotek «Webinar»** med egne secrets (`BUNNY_WEBINAR_LIBRARY_ID/API_KEY/TOKEN_AUTH_KEY`), EU, token til, direct play fra og tilladt referrer `app.theboardroom.dk`. Akademiets opsætning (`c0-bunny.md`) røres ikke.
  - **`varighed_sek` læses fra Bunnys `video-info`, aldrig tastet.** Et tastet tal er en observation, et målt tal er en nøgle.
- Intro-video (valgfri, samme bibliotek).
- **Status:** `kladde` → `aktiv` → `arkiveret`. En aktiv tidslinje kan redigeres, men redigeringen gælder kun sessioner, der ikke er startet.

## B2. Tidslinje-editoren

- En vandret tidslinje over videoens varighed med en miniature-skrubber. Rådgiveren må gerne spole her, det er hans forhåndsvisning.
- Interaktionerne ligger som klodser. Man trækker for at flytte `vis_fra_sek` og `vis_til_sek`. En sidepanel-formular pr. art med skemavalidering (`interaktionSkema`, ren, delt med serveren).
- **Forhåndsvisning «som seer»:** afspil fra et vilkårligt sekund med overlays, uden at skrive data (`preview=true` i `webinar-rum`, kun med rådgiver-JWT).
- **Faldkurven og Bunnys heatmap lagt under tidslinjen**, når der findes data. Så ser rådgiveren, hvor folk går, lige der hvor han flytter CTA'en.
- «Udgiv version» øger `tidslinje_version`. Gamle versioner bevares, fordi svarene peger på dem.

## B3. Planlæg sessioner

- **Faste datoer:** dato og klokkeslæt (dansk), `kapacitet` (valgfri).
- **Gentagelse:** en regel («hver anden tirsdag kl. 11», slutdato). Cronen `webinar-motor-cron` materialiserer sessioner 8 uger frem. Helligdage og husets lukkedage springes over med `hverdage.ts`' regel. eWebinar har blackout dates og åbningstider ([eWebinar scheduling](https://ewebinar.com/features/scheduling)).
- **JIT** (bag flag, §G6): interval 15/30/60 min inden for åbningstider. `naesteJitSession(nu)` giver det næste slot, ligesom EasyWebinars «15 minutes, 30 minutes, 45 minutes, or 1 hour» ([EasyWebinar](https://support.easywebinar.com/en/articles/6986089-how-to-set-up-just-in-time-webinars-and-instant-replays)). En JIT-session materialiseres først ved den første tilmelding.
- **Flyt eller aflys** en session: `session_tid` opdateres på tilmeldingerne i samme transaktion (functionen), `ics_sekvens` øges, og mailarten `flyttet`/`aflyst` sender den nye invitation (`METHOD:REQUEST` med højere `SEQUENCE` eller `METHOD:CANCEL`). Nye arter kræver CHECK-migration først.

## B4. Live-overvågning (konsollen)

Under en session: `/webinar/motor/session/:id/live`. **Rådgiverne bruger Realtime** (få forbindelser). RLS-læsning af `webinar_spoergsmaal`, `webinar_svar` og `webinar_deltagelser` gennem Postgres changes. Tællere hentes hvert 10. s fra `webinar-konsol`.

- **Nu:** i lobbyen / i rummet (puls < 45 s) / gået / på pause, fordelt på desktop/mobil. Afspillerfejl (antal med `error` eller 0 puls efter indgang).
- **Synk:** median og p95 af `afvigelse_sek`. En alarm-bjælke, når p95 > 5 s, eller når > 10 % har afspillerfejl.
- **Spørgsmålskøen:** nyeste øverst, markeret «før start», tidskode og navn. Man kan svare, afvise eller markere «offentlig/FAQ». Status for levering: live / mail kl. 11:47.
- **Hænder oppe:** navn, tidspunkt, «svar» (samme svarvej).
- **Live-strøm:** CTA-klik, «ikke klar», feedback-stjerner efterhånden som de kommer, reaktioner pr. minut.
- **«Jeg er online»-knap:** styrer autosvaret (§A7).

## B5. Analytics — pr. session og på tværs

Motor-rækkerne er i `webinar_tilmeldinger`, så **`/webinar`-dashboardet og delingen virker uden ændring** (tragt, pr. session, annoncepriser). Den nye flade *udvider* med det, eWebinar aldrig gav:

1. **Hele tragten pr. session:**
   > tilmeldingsside vist → tilmeldt → bekræftelse leveret (Mailgun ok) → ics hentet → i lobbyen → gik ind → set 25 / 50 / 75 / 100 % → CTA vist → CTA-klik → ansøgning oprettet (**på `webinar_tilmelding_id`**) → indsendt → kvalificeret → medlem (husets `blevMedlem`)

   - Tilmeldingssidens visning kræver et anonymt spor fra topix.dk (handling `spor` i `webinar-tilmeld`, samme form som `ansoegning_visninger`: ingen persondata, id kun i hukommelsen).
2. **Faldkurven pr. 5 s:** andelen af de fremmødte, der så stykket, med interaktionsmarkørerne ovenpå. Bunnys eget heatmap (`GET …/videos/{id}/heatmap`, intensitet 0–100 pr. stykke, [Bunny heatmap-API](https://bunny.net/docs/api-reference/stream/manage-videos/get-video-heatmap.md)) vises ved siden af **som uafhængig kontrol af vores bitmap**. Afviger formen, er der en fejl i vores kode.
3. **Interaktionssvar:** fordeling pr. poll, quiz-korrekthed, CTA-klik pr. interaktion (vist → klik), svartider.
4. **Feedback:** gennemsnit, fordeling, alle tekster, med mulighed for at filtrere på set-grad.
5. **Spørgsmål:** antal, svartid (median), andel besvaret live vs. mail. Emnerne ordnet efter hyppighed (v2: LLM-klynger).
6. **Segmenter:** annonce (`coalesce(ad_id_udledt, utm_content)`), kanal (`annoncekilde.ts`), enhed, sen indgang ja/nej, første gang vs. gen-tilmeldt, dage fra tilmelding til session.
7. **Statistikken er husets egen:** Wilson-intervaller (`src/lib/marketing/statistik.ts`), «for få» (< 5) erstatter procenten, og tæller og nævner dækker samme vindue (`afkort`). En session, der ikke er afholdt, siger det.

**Eksport:** CSV pr. session (rådgiver, Bucket A), én række pr. tilmelding med dom, procent, svar og spørgsmål. **Delingen til eksterne** (`webinar-delt`) får kun tal: kurven, fordelingerne og tragten, aldrig rækker (`findForbudteNoegler`).

---

# C. Data

## C1. Tabeller (nye og ændrede)

Alle nye migrationer starter med `-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).` og har FØR/EFTER-SQL i ét resultatsæt (UNION ALL), som husets form foreskriver.

**RLS-grundregel:** *ingen `anon`-politik på nogen webinartabel.* Alt offentligt går gennem functions med token. Rå data er **service-role-only**. Rådgivere læser (SELECT `has_role(auth.uid(),'advisor')`). Konfigurationen (webinarer, interaktioner, sessioner) kan rådgivere skrive via RLS. Ingen «skjul»-politik uden `AS RESTRICTIVE` (`SECURITY_BASELINE.md` §5).

### `webinarer`
| kolonne | type | note |
|---|---|---|
| id | uuid pk | |
| slug | text unique | `^[a-z0-9-]{3,60}$` |
| titel, beskrivelse, vaert_navn, vaert_billede | text | |
| bunny_video_id | text | GUID-form |
| intro_video_id | text null | |
| varighed_sek | int not null check > 0 | **fra Bunny video-info** |
| intro_sek | int not null default 0 | fra Bunny |
| lobby_min | int default 15 check 0–60 | |
| exitrum_min | int default 15 check 0–60 | |
| status | text check in (kladde, aktiv, arkiveret) | |
| tidslinje_version | int default 0 | øges ved «udgiv» |
| created_at, updated_at, oprettet_af | | |
RLS: advisor select/insert/update. Service role alt.

### `webinar_interaktioner`
id · webinar_id fk · version int · art text CHECK (cta, feedback, poll, quiz, spoergsmaal_prompt, reaktion, haand, ressource, kapitel) · vis_fra_sek int · vis_til_sek int null · placering CHECK (overlay, sidepanel, exitrum) · indhold jsonb (valideret af `interaktionSkema`) · betingelse jsonb null · udloeber_kilde text null CHECK (session_slut, optag_frist, naeste_session) · created_at. Unique (webinar_id, version, id). **Rækker for en udgivet version ændres aldrig** (en trigger afviser UPDATE, når version ≤ `webinarer.tidslinje_version`. Det er en BEFORE UPDATE-trigger på en ny tabel, ikke en ændring af de forbudte triggers).

### `webinar_sessioner`
id · webinar_id fk · starter_at timestamptz · type CHECK (Scheduled, JustInTime, OnDemand) **(eWebinars ord, så `session_type` på tilmeldingen passer)** · kapacitet int null · status CHECK (planlagt, aaben, afholdt, aflyst) · tidslinje_version int null · tidslinje_snapshot jsonb null (fryses ved `aaben`) · ics_sekvens int default 0 · gentagelse_id uuid null · afsluttet_at timestamptz null (sat af motor-cronen) · created_at. Unique (webinar_id, starter_at). Indeks (status, starter_at).

### `webinar_gentagelser`
id · webinar_id · regel jsonb (ugedag, interval_uger, tid, fra, til) · aktiv bool.

### `webinar_tilmeldinger` — ÆNDRET, ikke ny
```
add column kilde_system text not null default 'ewebinar' check (kilde_system in ('ewebinar','platform')),
add column session_id uuid null references webinar_sessioner(id),
add column token_version int not null default 1,
add column samtykke_nyhedsbrev_at timestamptz null,
add column fbp text null, add column fbc_cookie text null,
add column ga_client_id text null, add column user_agent text null,
add column fornavn text null,
add column flyttet_fra_session_id uuid null
```
- `ewebinar_id` = `'P-' || id` for platformens rækker (§G7). Klaviyos `unique_id` (`<ewebinar_id>:<grad>`) og alle læsere forbliver uændrede.
- `webinar_id` = `webinarer.id::text`. `session_tid` = `webinar_sessioner.starter_at`, afledt og skrevet af motoren, aldrig af klienten.
- `join_link`/`kalender_link` = **null** for platformen, fordi de udledes (§D2). `raa` = motorens adapterobjekt (§C5).
- Indeks: `(session_id)`, delindeks `(lower(email), session_id) WHERE kilde_system='platform'` unique.

### `webinar_deltagelser` — én pr. (tilmelding, session)
| kolonne | type | note |
|---|---|---|
| id | uuid pk | |
| tilmelding_id, session_id | uuid fk | unique sammen |
| foerste_lobby_at, foerste_ind_at, sidste_puls_at | timestamptz | |
| set_bits | bytea | **én bit pr. 5-s-stykke af hovedvideoen**: 60 min = 720 bit = 90 bytes |
| synlig_bits | bytea | samme, men kun når fanen var synlig |
| set_sek | int | popcount × 5, afkortet ved varighed |
| set_procent | numeric(5,2) | `set_sek / varighed_sek × 100`. Går aldrig ned |
| maks_pos_sek | int | |
| sen_indgang_sek | int null | `forventet_pos` ved første indgang |
| enheder | int | antal `enhed_id`'er |
| korrektioner | int | antal spoledom-hop |
| afspillerfejl | int | |
| lyd_til | bool | har spillet med lyd mindst én gang |
| seneste_seq | jsonb | `{enhed_id: seq}`, dedup |
| updated_at | | |
Service role skriver. Rådgiver læser.

### `webinar_pulser` — rå puls, append-only, 90 dage
id bigserial · deltagelse_id · enhed_id text · seq int · modtaget_at timestamptz default now() · klient_ms bigint · pos_sek numeric(8,2) · tilstand CHECK (lobby, spiller, pause, buffer, slut, skjult) · synlig bool · lyd bool · forventet_pos_sek numeric · afvigelse_sek numeric · korrigeret bool · rum text. **BRIN** på `modtaget_at`, btree på `(deltagelse_id, modtaget_at)`. Service-role-only (heller ingen rådgiver-SELECT; aggregaterne er nok).

### `webinar_motor_log` — hændelsesloggen (append-only, 24 mdr.)
id · tid · tilmelding_id null · session_id null · art text (kataloget §C2, CHECK) · data jsonb · klient_id text null **unique** (idempotens for klienthændelser) · kilde CHECK (klient, server, cron, raadgiver). Service-role-only. Rådgiver-SELECT uden `data->ip`.

### `webinar_svar`
id · deltagelse_id · tilmelding_id · session_id · interaktion_id · tidslinje_version · art · svar jsonb · pos_sek · svaret_at. Unique `(deltagelse_id, interaktion_id)` for alt undtagen `reaktion`.

### `webinar_reaktioner`
session_id · stykke int (5 s) · emoji text · antal int. PK (session_id, stykke, emoji). Opdateres med `on conflict do update set antal = antal + 1`. Rå reaktioner står i loggen.

### `webinar_spoergsmaal`
id · session_id · tilmelding_id · tekst (1–2000) · pos_sek null (null = før start) · stillet_at · art CHECK (spoergsmaal, haand) · status CHECK (ny, besvaret, afvist, auto) · svar_tekst · svaret_af uuid · svaret_at · leveret CHECK (live, mail) null · leveret_at · offentlig bool default false · offentlig_tekst text null (anonymiseret). RLS: advisor select/update. **I Realtime-publikationen** (til konsollen).

### `webinar_svar_mails` — spor for svar pr. mail
Samme form som `webinar_mails` (udfald, status, mailgun_id, grund), plus `spoergsmaal_id` unique `WHERE udfald='ok'`.

### Ændringer andre steder
- `webinar_mails.art` CHECK: `+ ti_minutter` (og `flyttet`, `aflyst`, `starter_nu`, efterhånden som de bygges). **Migrationen skal være kørt FØR functionen udrulles** (23514-fælden, CLAUDE.md).
- `ansoegninger.webinar_tilmelding_id uuid null` (FK `on delete set null`).
- `advisor_notifications`: nye typer `webinar_spoergsmaal`, `webinar_haand`, `webinar_drift`. **Hver type skal stå på en liste i `_shared/klokkeMail.ts`** (ellers fælder `klokkeMail.guard`). Forslag: `webinar_spoergsmaal`/`webinar_haand` → MORGEN (fanges live i konsollen), `webinar_drift` → ALARM.
- `app_config`: `webinar_motor_aktiv` (låsen for alt, der skriver udad: Klaviyo, mails, Meta), `webinar_jit_aktiv`.

## C2. Hændelseskataloget

`webinar_motor_log.art` er ét ord pr. linje. Payloaden er `data`. **Aldrig e-mail, navn eller IP i `data`.** Personen er `tilmelding_id`.

| art | kilde | data | eWebinar-analog |
|---|---|---|---|
| `side_vist` | klient (topix) | visning_id, kilde, utm_*, landing | Visit Registration |
| `tilmeldt` | server | session_id, dublet (ny/samme/flyttet), kilde_system, har_fbclid, samtykke_nyhedsbrev | Registered |
| `flyttet` | server | fra_session_id, til_session_id | — |
| `afmeldt` | server | via (mail_link, raadgiver) | Unsubscribed |
| `gen_tilmeldt` | server | fra_session_id (mødte ikke / sen indgang) | — |
| `mail_sendt` | cron | art, udfald (spejl af `webinar_mails`) | — |
| `ics_hentet` | server | via (mail_link, takside) | — |
| `rum_aabnet` | server | rum, enhed (desktop/mobil/tablet), browser-familie | — |
| `lydtest` | klient | ok, ttff_ms | — |
| `gik_ind` | server | forventet_pos_sek, sen (bool) | Joined |
| `genoptog` | server | hul_sek | — |
| `korrektion` | klient | fra_sek, til_sek, grund (frem, bagud) | — |
| `pause` / `live_igen` | klient | pos_sek | — |
| `afspillerfejl` | klient | kode, plan (A/B) | — |
| `forlod` | klient (sendBeacon) | pos_sek | Left |
| `interaktion_vist` | server (afledt) | interaktion_id, version | — |
| `svar` | klient | interaktion_id, art | — |
| `cta_klik` | klient (sendBeacon) | interaktion_id, maal (ansoeg, ikke_klar, ressource) | Converted |
| `reaktion` | klient | emoji, stykke | — |
| `spoergsmaal` / `haand` | klient | spoergsmaal_id | — |
| `svar_leveret` | server | spoergsmaal_id, via (live, mail) | — |
| `exitrum` | server | — | WebinarFinished |
| `feedback` | klient | stjerner (tekst i `webinar_svar`) | Feedback |
| `session_afsluttet` | cron | tilmeldt, moedt, set_75 | — |
| `fremmoede_dom` | cron | grad, set_procent, overgang (deltog, moedte_ikke, ingen) | WatchedWebinar/MissedWebinar |
| `klaviyo_sendt` | cron | metric, unique_id, udfald | — |
| `ansoegning_fra_webinar` | server (`ansoegning-gem`) | ansoegning_id | — |

## C3. Pulsen — frekvens, dedup, loft

- **Frekvens:**
  - hver **15 s** i tilstanden `spiller`
  - hver **60 s** i lobbyen/på pause
  - **med det samme** ved `play`, `pause`, `ended`, `visibilitychange`, `error` og ved forladelse (`navigator.sendBeacon`)
  - Mens personen har et ubesvaret spørgsmål: hver **5 s** i højst 10 min, så svaret når frem hurtigt uden Realtime.
- **Batch:** klienten samler op til 4 pulser, hvis nettet hakker, og sender dem i ét kald (`puls: [...]`).
- **Dedup:** `(deltagelse_id, enhed_id, seq)`. En `seq` ≤ `seneste_seq[enhed_id]` ignoreres (200, `dublet: true`).
- **Loft:** højst én puls pr. 4 s pr. `(deltagelse, enhed)`, dvs. 1 pr. s i batch, og højst 5 enheder pr. tilmelding. Over loftet: 200 `{ignoreret: "loft"}` og ingen skrivning. **Ingen 429, som ville få klienten til at gentage.**
- **Hvad en puls må markere** (`pulsDom`, ren):
  - kun stykker mellem forrige og nuværende `pos_sek`
  - kun i tilstanden `spiller`
  - kun når `Δpos ≤ Δserverur + 5 s` (man kan ikke «se» hurtigere end tiden går)
  - kun når `|pos − forventet| ≤ 10 s` (en spolet position giver ingen kredit)
  - **Resultat:** `set_bits` øges, og `set_procent` går aldrig ned.
- **Logning:** Supabases loft er «100 events per 10 seconds» pr. function ([Supabase: functions-limits](https://supabase.com/docs/guides/functions/limits)). **`webinar-puls` må aldrig `console.log` pr. kald.** Kun fejlsummer pr. minut (i hukommelsen, skrevet af det første kald efter minutskiftet).
- **Kalendersvar (v2):** en Mailgun-route på `webinar@webinar.topix.dk`, som parser `PARTSTAT=ACCEPTED/DECLINED` → `ics_svar` i loggen. Det er et nyt datapunkt, «lagde det i kalenderen».

## C4. De rene funktioner (spejlet, paritetstest)

Hver fil ligger i `supabase/functions/_shared/webinarMotor/*.ts` og er spejlet **ordret** i `src/lib/webinarMotor/*.ts`. Nul imports (eller kun indbyrdes). Paritetstest som `webinarDom.paritet`. **Tiden gives ind** (`nu`), aldrig `new Date()` indeni (§5 i `webinaret-og-annoncerne.md`).

| Fil | Eksporterer | Afgør |
|---|---|---|
| `ur.ts` | `positionDom(session, webinar, nuMs)` → `{rum, forventetPosSek, sekTilStart, sekTilSlut}` | Rummet og positionen. Grænser: lobby-åbning, intro, video, exitrum, afsluttet |
| `spolning.ts` | `spoleDom(forventet, faktisk, tilstand, sidsteKorrektionMs, nuMs)` → `ok \| hop(til) \| vent` | Hysterese 8 s, tolerance 3 s, ingen hop under buffering |
| `senIndgang.ts` | `senIndgangDom(forventetPos, varighed)` → `{kanNaaSet, tilbydNaeste}` | Afledt af `SET_GRAENSE_PROCENT` |
| `puls.ts` | `pulsDom(forrige, puls, serverDeltaMs, forventetPos, stykkeSek=5)` → `{stykker:[fra,til] \| null, grund}`; `saetBits`, `taelBits`, `bitsTilProcent` | Hvad der er set |
| `fremmoede.ts` | `fremmoedeDom(deltagelse \| null, session, nu)` → `{state, sidste_action, set_procent, set_procent_kilde}` **med eWebinars ord** | At `doemSetGrad` giver det samme, som eWebinar ville |
| `interaktioner.ts` | `aktiveInteraktioner(snapshot, forventetPos, svarSaa, rum)`, `ctaVindue(interaktion, session, config, nu)` (nægter nedtælling uden kilde), `interaktionSkema` | Hvad vises hvornår |
| `tilmelding.ts` | `tilmeldDom(input, eksisterende[], afmeldt, sessioner, nu)` → ny/samme/flyt/afvis(grund) | Dubletter, kapacitet, fortid |
| `sessionplan.ts` | `materialiser(regel, fra, til, lukkedage)`, `naesteJitSession(interval, aabningstider, nu)` | Hvilke sessioner findes |
| `ics.ts` | `bygIcs({uid, sekvens, metode, start, slut, titel, beskrivelse, url, organizer, attendee})` | RFC 5545: foldning 75 oktetter, escaping (genbrug `icsEscape` fra `kalenderfil.ts`), CRLF |
| `token.ts` (kun `_shared`, Deno) | `deltagerToken(tilmeldingId, version, secret)`, `laesDeltagerToken` | §D2 |
| `raaAdapter.ts` | `bygRaa(svar, interaktioner)` → `{kilde:"platform", interactionsSummary:"-- Interactions --\n\nFeedback: …: 5\nCallToAction: …: Clicked"}` | At `/webinar`-dommens fritekstlæser (`FEEDBACK_LINJE`) virker uændret |

**Prøver, der skal findes fra dag ét:**
- sommertidsskiftet (25/10) midt i en session
- en sen indgang på præcis 25 %
- en puls, der springer 30 s frem
- to enheder, der overlapper
- en puls efter videoens slut
- en session, der ikke er begyndt
- en ics-linje på 200 tegn med æøå
- tokenets konstanttidssammenligning
- `raaAdapter` læst af den eksisterende `webinarDashboard`-dom, der giver samme stjernetal

## C5. Paritet — det, der skal virke UÆNDRET

| Læser | Læser i dag | Motoren skriver |
|---|---|---|
| `webinarDom.doemSetGrad` | `set_procent`, `state`, `session_tid`, `attended` | `set_procent` (bitmap), `state` ∈ Registered/Joined/Watched/Missed, `attended` null |
| `webinarHaendelser.afgoerOvergang/byggFremmoede` → Klaviyo | overgange i graden | **Samme funktioner**, kaldt af `webinar-motor-cron` (§D1). «Deltog» ved første indgang (grad delvist, **som eWebinar gjorde 22/9 kl. 09:00:04**), «deltog» igen ved delvist→set, «Moedte ikke op» ved `afsluttet_at` + 5 min |
| `webinarMailDom.planlaegKoersel` | `session_tid`, `join_link`, `kalender_link`, `subscribed`, `sidste_action` | `session_tid`. Links udledes af cronen. `subscribed` = null, afmelding i `webinar_afmeldinger` (læses allerede) |
| `klaviyo-profil-cron` | `session_tid` pr. e-mail | uændret |
| `meta-send` (`webinar_fbclid`) | seneste tilmelding på `lower(email)` før ansøgningen, `registreret_at` | `fbclid`, `registreret_at` |
| `/webinar` + `webinar-delt` | kolonnerne + `raa->>interactionsSummary` | kolonnerne + adapter-`raa` |
| `annoncepriser` | `utm_content`, `ad_id_udledt` | `utm_*` fra formularen |

**Én skala for `set_procent`:** eWebinars «Total watched %» er andelen af videoen, der er set (0–100), og vores er set-stykker ÷ alle stykker × 100. **Paritetsbeviset** er skyggesessionen i §E: afvigelse ≤ 5 procentpoint for ≥ 90 % af deltagerne, der er i begge.

## C6. Samtykke, GDPR og opbevaring (holdt op mod `docs/tracking.md`)

- **Seerrummet på `app.theboardroom.dk/w/…` har ingen tredjeparts-tracking** (ingen pixel, GTM eller GA, som resten af app'en, `tracking.md` §2 række 18). Enheden gemmer kun join-tokenet i `sessionStorage`. Det er strengt nødvendigt for den tjeneste, personen selv har bedt om, så der kræves ikke cookiesamtykke. Tokenet fjernes fra adresselinjen med `history.replaceState`, og siden sætter `Referrer-Policy: no-referrer`.
- **Bunnys player sætter muligvis egne cookies/lagring: UMÅLT.** Det skal måles i skive 3 (DevTools → Application) og står i tracking.md, før skyggesessionen.
- **Behandlingsgrundlag (min vurdering, ikke juridisk rådgivning; Jonas 21/9: ingen jurist):**
  - Levering, påmindelser og rummet: aftale (art. 6(1)(b)).
  - Måling af visning, svar og kobling til en senere ansøgning: legitim interesse (art. 6(1)(f)).
  - **Det skal stå på tilmeldingssiden og i topix.dk's privatlivspolitik, med ordene** «vi måler, hvor meget af webinaret du ser, dine svar og spørgsmål, og bruger det, hvis du senere søger om medlemskab».
- **Løftet i privatlivspolitikken** «Selve din tilmelding deler vi ikke med Meta» (`tracking.md` §3, topix.dk #3) **bindes af §G3.** Sendes en CAPI-hændelse for tilmeldingen, skal teksten ændres FØR første afsendelse. Værn: `webinarTilmeldMeta.guard` holder koden og teksten i takt, som de øvrige tekstværn.
- **Aldrig:** rå IP i en kolonne (kun `ip_dagshash` til loftet), CVR, e-mail/navn i `webinar_motor_log.data` eller i et svar til en ekstern.
- **Opbevaring (forslag; indarbejdes i slettefunktionens køreplan, `docs/koereplan-slettefunktionen.md`):**
  - `webinar_pulser` 90 dage. Aggregatet i `webinar_deltagelser` bliver.
  - `webinar_motor_log` 24 mdr.
  - Tilmelding, deltagelse, svar og spørgsmål: 24 mdr. efter sessionen, medmindre personen er blevet ansøger (så følger ansøgningens opbevaring).
  - `webinar_afmeldinger`: e-mailen bevares som spærring.
  - Én SQL-cron `webinar-opbevaring` (ren SQL, som `webinar-delinger-opbevaring`).
- **Indsigt/sletning:** sletning af en tilmelding kaskaderer til deltagelse, puls, svar og spørgsmål. Loggen nulstilles pr. `tilmelding_id` (rækken bliver, personen går).
- **`tracking.md` er det ENE dokument:** nye rækker for formularens dataLayer, pixlen/CAPI (efter §G3), Mailgun-svar-mails og rummets fravær af tracking. Skrives i samme PR som koden.

---

# D. Arkitektur

## D1. Edge functions

`verify_jwt = false` på alle offentlige (bevidst, som huset). Hvert prædikat registreres i `scripts/check-edge-function-auth.ts`. Versioner pinnes (`@2.97.0`).

| Function | Bucket | Prædikat FØRST | Hvad |
|---|---|---|---|
| `webinar-tilmeld` | offentlig (som `ansoegning-gem` «opret») | **`verifyOffentligTilmelding()`** (nyt): origin-allowlist (`topix.dk`, `www.topix.dk`, preview-origin i test), honningfelt, IP-dagshash-loft, kropsfelter mod `KENDTE_FELTER` (ukendte afvises, jf. #1027) | Handlinger `tilmeld`, `spor` (anonym sidevisning), `sessioner` (de næste 3 + JIT). Svarer med token én gang |
| `webinar-rum` | token | **`verifyDeltagertoken()`** (nyt) | `tilstand` (rum, ur, snapshot, signeret embed-URL kun i `intro`/`afspilning`, udløb = slut + 30 min), `gen_tilmeld`, `ics` (GET → fil), `forudfyld` (til `ansoegning-gem`), `preview` (kun rådgiver-JWT → Bucket A-gren) |
| `webinar-puls` | token | `verifyDeltagertoken()` | Puls (batch), svarer med `{nu_ms, forventet_pos, rum, nye_svar[], i_rummet, tidslinje_version}`. **Kun DB, intet udadgående kald.** |
| `webinar-handling` | token | `verifyDeltagertoken()` | `svar`, `cta_klik`, `reaktion`, `spoergsmaal`, `haand`, `feedback`, `nyhedsbrev_ja` (→ Klaviyo `client/subscriptions`). Idempotent på `klient_id` |
| `webinar-admin` | A | `authenticateUser` + rådgiver | Opret/ret webinar, udgiv tidslinje, Bunny-upload-signatur (webinarbiblioteket), sessioner, flyt/aflys |
| `webinar-konsol` | A | `authenticateUser` + rådgiver | Tællere, svar på spørgsmål (live, ellers markeret til mail), «online»-status, eksport |
| `webinar-motor-cron` | B, hvert minut | `authenticateServiceRole` | Sessionsstatus (planlagt→aaben ved lobby: frys snapshot; →afholdt ved exitrummets slut), materialisér gentagelser, **fremmøde-outbox → Klaviyo** via `afgoerOvergang/byggFremmoede`, `state/sidste_action/set_procent` → `webinar_tilmeldinger`, `raa`-adapter, «Moedte ikke op» efter afslutning. Tørkørsel som standard, lås `webinar_motor_aktiv` |
| `webinar-svar-cron` | B, hvert minut | `authenticateServiceRole` | Svar til dem, der ikke er i rummet, via Mailgun (`sendMailgun`, samme loft `beregnKoerselsLoft` som webinarmailene: **Mailgun-kontoen er én, og loftet er fælles**) |
| `webinar-mail-cron` | B (findes) | uændret | + `ti_minutter`, udledte links, `bygIcs` for platformens rækker |
| `ansoegning-gem` | findes | `verifyDeltagertoken()` i den nye gren | Handlingen `fra_webinar` + `webinar_tilmelding_id` ved «opret» |
| `meta-send-cron` | findes | uændret | Kun hvis §G3 = CAPI: ny art `webinar_tilmeldt` (migration på sporets CHECK FØR udrulning) |

**Rækkefølgen ved hver ny function** (CLAUDE.md): merge → **eksplicit deploy fra build-chatten med «kør deploy-værktøjet og vis resultatet»** → beviset er et kald, der svarer med noget, kun ny kode kan svare. Hver function får fra start et felt `motor_version` i svaret. Først derefter cron-job, mails og links.

## D2. Tokens

- **Deltagertokenet** er en bærer-legitimation for én tilmelding. Formen: `base64url(tilmelding_id_16_bytes) + "." + base64url(HMAC-SHA256(WEBINAR_JOIN_SECRET, tilmelding_id + ":" + token_version))`, ca. 66 tegn.
  - **Verifikation:** form-tjek FØR opslag → HMAC regnes igen → `erKonstantTidLig` (findes) → række slået op → `token_version` skal passe → tilmeldingen må ikke være slettet.
  - Svaret udadtil er ét 403 for alt (som `webinar-delt`).
- **Hvorfor HMAC og ikke et SHA-256-aftryk som `delingstokenAuth.ts`:** delingstokenet vises én gang og lever kun i modtagerens link. Join-linket skal derimod **bygges igen af `webinar-mail-cron` i op til syv mails over 14 dage**. Et gemt aftryk kan ikke give linket tilbage. Alternativet, at gemme tokenet i klartekst, er præcis det, `delingstokenAuth.ts` forklarer, hvorfor huset ikke gør.
  - HMAC giver begge dele: intet gemt, og cronen kan udlede linket. Præcedensen i huset er `webinarAfmeldToken.ts` (HMAC over mailen).
  - **Tilbagekaldelse:** `token_version += 1`.
- **Secret:** `WEBINAR_JOIN_SECRET` (egen, 32 bytes), læst ét sted (`_shared/webinarMotor/token.ts`). Rotation = alle links dør, så den skal have en ældre nøgle i en overgangsperiode (`WEBINAR_JOIN_SECRET_FORRIGE`).
- **Bunny-embed-tokenet** er som `get-video-embed`, men i webinarbiblioteket og med udløb = sessionens slut + 30 min.
- **Rådgiverens deling** af analytics bruger den eksisterende `webinar_delinger` (SHA-256-aftryk). Der ændres intet.

## D3. Realtime eller polling

- **Seerne: polling via pulsen, ikke Supabase Realtime.** Supabases lofter er Pro: **500** samtidige forbindelser og 500 beskeder/s, Team: 10.000 ([Supabase: realtime-limits](https://supabase.com/docs/guides/realtime/limits)). Hvilken plan Lovable Cloud giver projektet, er UMÅLT. 500 seere + rådgivere ville ramme Pro-loftet. Pulsen skal alligevel køre, så svar, tællere og tidslinjeversion rider med i pulsens svar. Forsinkelsen er 5–15 s, og det er godt nok til et spørgsmålssvar.
- **Rådgiverne: Realtime** (Postgres changes på `webinar_spoergsmaal`, RLS-respekteret), under 10 forbindelser. Mønstret findes allerede i huset (`AdvisorNotifications.tsx`, chatten).
- **Lobbyens «X venter»:** et tal i pulssvaret, regnet som `count(*)` på `webinar_deltagelser` med `sidste_puls_at > now() − 60 s`. Det caches i functionens hukommelse i 10 s.

## D4. Skalering til 500 samtidige seere

- **Belastning:**
  - Puls: 500 ÷ 15 s ≈ **33 kald/s** i steady state.
  - Indgangsbølgen: 500 kald til `webinar-rum` over ca. 2 min, dvs. ~4/s, med toppe på ~20/s i minuttet før start.
  - Lobbyen: 500 ÷ 60 s ≈ 8/s.
- **Grænserne:** 256 MB hukommelse, **2 s CPU pr. kald**, 150 s idle-timeout ([Supabase: functions-limits](https://supabase.com/docs/guides/functions/limits)). Pulsen er få ms CPU: HMAC + én UPDATE via RPC. Om der er et loft for samtidige kald på Lovable Cloud, er UMÅLT.
- **Databasen:** én skrivning pr. puls via en SQL-funktion `webinar_puls_skriv(deltagelse_id, enhed, seq, fra_stykke, til_stykke, …)`:
  - `SECURITY INVOKER`, EXECUTE kun til `service_role` (**ikke** SECURITY DEFINER, altså ingen berøring af de forbudte), der gør dedup + `set_bit` + popcount + pulsrække i én transaktion.
  - ~33 små transaktioner/s + ~33 inserts/s i `webinar_pulser` (~120.000 rækker for en 60-min-session med 500 seere, ~15 MB).
- **Bunny** leverer videoen fra CDN, så vi bærer ingen videotrafik. Starttiden (TTFF) på Bunny er UMÅLT. Den måles af lydtesten i lobbyen og i skyggesessionen.
- **Lastprøven** (skive 9): et k6-script med 500 virtuelle seere (tilmeld → rum → puls hvert 15. s i 60 min → handlinger) mod en testsession. **Krav:** 0 × 5xx, p95 < 400 ms på puls, ingen tabte `seq`, `set_procent` korrekt for de syntetiske mønstre (fuld, halv, sen, pause).

## D5. Ruter i React-appen (offentlige, uden login, uden app-skal)

| Rute | Side | Note |
|---|---|---|
| `/w/:slug?t=` | `WebinarRum.tsx` | Tilstandsmaskine: foer_lobby → lobby → intro → afspilning → exitrum → afsluttet. Tokenet flyttes til `sessionStorage` og fjernes fra URL'en |
| `/w/:slug/kalender?t=` | redirect til `webinar-rum?handling=ics` | Til mails (Apple/Outlook desktop) |
| `/w/:slug/tilmeld` | valgfri reserve-formular | **Kun** hvis topix.dk-formularen ikke er klar ved skyggesessionen (§G2) |
| `/webinar/motor/*` | rådgiver (login) | B1–B5 |

- Ikke under `/webinar` (rådgiverdashboardet) og ikke under `/delt/webinar` (delingen).
- **React-reglen:** alle hooks i komponentens topblok før enhver betinget return (#310-lærdommen). Rummet er netop en stor betinget komponent.
- **Branding:** hjemmebanens designsprog (`docs/hjemmebane-designsprog.md`), med Topix/Morten som afsender.
- **Domænet:** seeren tilmelder sig på topix.dk og ser på app.theboardroom.dk. Det er acceptabelt, fordi CTA'en alligevel lander dér. Et eget domæne (fx `se.topix.dk`) kræver et custom domain i Lovable. UMÅLT om muligt, ikke nødvendigt.

## D6. Mails og kalenderfil, genbrugt

- `webinar-mail-cron` bliver den ENE afsender af webinarmails. Tre indgreb: arten `ti_minutter`, udledte links, `bygIcs`. Loftet (`MAILGUN_LOFT_PR_TIME`, nu 1000 efter #1152) og alarmen gælder uændret. **`webinar-svar-cron` deler loftet** ved at læse samme vindue i begge spor.
- Teksterne står i `webinarMailTekster.ts`. **«optagelse» må stadig ikke stå i nogen art** (prøvet), og «vedhæftet» følger filen (dom 11).

---

# E. Parallelkørsel og overgang fra eWebinar

## E1. Det, der ikke kan flyttes

- **Tilmeldte i eWebinar har eWebinars UID, ORGANIZER og personlige join-link i deres kalender.** En fremmed ORGANIZER kan vi ikke opdatere (recon A3.9). **eWebinar må derfor ikke opsiges, før den sidste session med eWebinar-tilmeldte er afholdt.**
- Hvor mange der er tilmeldt sessioner efter 13/10 i eWebinar, er UMÅLT. SQL til Lovable SQL editor:

```sql
select 'efter_13_10' as sektion, to_char(session_tid at time zone 'Europe/Copenhagen','YYYY-MM-DD HH24:MI') as noegle, count(distinct email)::text as vaerdi
from public.webinar_tilmeldinger where session_tid > '2026-10-13 12:00:00+02' group by 2
union all
select 'naeste_uden_session', 'uden session_tid', count(*)::text from public.webinar_tilmeldinger where session_tid is null
order by 1, 2;
```

- **Kildevideoen, CTA-tidskoderne og chat-/spørgsmålshistorikken ligger kun hos eWebinar** (recon A1.5 og A3.11 pkt. 7). **De tre skal hentes FØR noget andet** (skive 0).

## E2. Faserne

| Fase | Hvad | Hvem tilmelder hvor |
|---|---|---|
| **P0 Skygge** | Én intern session (20–30 personer: huset, venner, Round Table) SAMTIDIG med en eWebinar-session. Samme mennesker tilmeldt begge med samme e-mail. De ser i to faner/enheder (en i hver, skiftevis) | intern formular `/w/:slug/tilmeld` |
| **P1 Første rigtige session** | Én ny dato KUN på platformen. Annoncerne fortsætter til topix.dk, men formularen sender til platformen for den dato. eWebinar-sessioner, der allerede har tilmeldte, kører videre | topix.dk-formularen (platform) + eWebinar-widget for de gamle datoer skjult |
| **P2 Alt nyt på platformen** | Alle nye tilmeldinger går til platformen. eWebinar betjener kun allerede tilmeldte. `ewebinar-webhook` bliver tændt | topix.dk-formularen |
| **P3 Opsigelse** | Når §E3 er grøn, og den sidste eWebinar-session er afholdt + 30 dage (replay-links, sene spørgsmål) | — |

**Meta-pixlen på tilmeldingssiden** skal være bevist i Events Manager (Test events) **før P1**. Ellers mister webinarkampagnen sit optimeringssignal («Fuldfør registrering» = 587 fra eWebinars pixel, `tracking.md` §5 punkt 5). Dedup kræver samme `event_id` og samme `event_name` i pixel og CAPI inden for 48 timer ([Meta: dedup](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events)).

**Join-links:** nye tilmeldinger får `/w/:slug?t=`, og eWebinar-rækkerne beholder `join_link` fra `raa`. `webinarMailDom` skelner allerede ikke, fordi linket kommer ind udefra. Der er **ingen omskrivning af gamle links** og ingen «vi har skiftet system»-mail, så længe eWebinar kører til den sidste session.

## E3. Beviset, før eWebinar opsiges (hvert punkt har et svar, kun ny kode kan give)

1. **`set_procent`-paritet (P0):** afvigelse ≤ 5 procentpoint for ≥ 90 % af deltagerne i begge. SQL på `ewebinar_id` ↔ `'P-'||id` via e-mail.
2. **Synk:** 3 fysiske enheder (iPhone Safari, Android Chrome, desktop) ±2 s, læst i `webinar_pulser.afvigelse_sek`. p95 < 3 s over hele P1.
3. **Klaviyo:** «Deltog i webinar»/«Moedte ikke op» fra motor-cronen med `unique_id` `P-…:<grad>`, i `klaviyo_haendelser` uden dubletter, og flowene `Wq3MkG`/`SDVvCW` optager dem (flow-rapporten).
4. **Mails:** alle arter inkl. `ti_minutter` i tørkørsel → prøve til én adresse → P1. Vores `.ics` åbnet og opdateret (flyt-prøve med `SEQUENCE+1`) i Apple Mail, Gmail, Outlook web og Outlook desktop.
5. **Meta:** `CompleteRegistration` fra egen side set i Test events. Dedup målt (§G3).
6. **Afmelding:** en testadresse afmelder → ingen flere mails, og `klaviyo_afmeldinger` har en række.
7. **Tragten:** P1's CTA-klik i `webinar_svar` = dashboardets tal. Mindst én ansøgning med `webinar_tilmelding_id` sat. `/webinar` og delingen viser P1 uden kodeændring.
8. **Lastprøve:** 500 samtidige, krav som i §D4.
9. **Eksport og rulleback:** eWebinars registranter + interactionsSummary + chat eksporteret og lagt i `webinar_haendelser`/Storage. eWebinar-abonnementet bevares ≥ 1 måned efter P2.

---

# F. Byggeplan i skiver

**Regler for hver skive:** egen branch → PR → grøn `bun run test` + `bunx tsc --noEmit -p tsconfig.app.json` + `bun run check:edge-auth` → merge → migration i SQL editor → eksplicit deploy → bevis i drift → bogføring i `docs/webinarmotoren.md` (nyt dokument, CLAUDE.md-afsnit i samme PR). **Motor før flade.**

«Agentdage» er en AI-agents arbejde inkl. prøver og Jonas' review-runder, ikke kalendertid. Udrulningsrunderne står for sig, fordi de er Jonas' og går én ad gangen.

| # | Skive | Indhold | Afhænger af | Agentdage | Udrulningsrunder |
|---|---|---|---|---:|---:|
| **0** | **Hentning** (Jonas + agent) | Kildevideo (MP4) fra eWebinar/Cloudflare Stream · CTA-tidskoder (skærmbillede af editoren) · eksport af chat/spørgsmål · Bunny-biblioteket «Webinar» + secrets · §E1-SQL · beslutningerne i §G | — | 1 | 0 |
| **1** | **MOTOREN** | Migrationer (webinarer, interaktioner, sessioner, gentagelser, deltagelser, pulser, motor_log, svar, reaktioner, spørgsmål + ændringerne i tilmeldinger og ansøgninger) og SQL-funktionen `webinar_puls_skriv`. **Rene funktioner:** ur, spolning, senIndgang, puls/bits, fremmøde, interaktioner/ctaVindue, tilmelding, sessionplan, ics, raaAdapter, spejlet med paritetstest. `token.ts` + prædikatet i CI-værnet. **Functions:** `webinar-tilmeld`, `webinar-rum` (uden flade), `webinar-puls`. Bevis: et curl-forløb tilmeld → rum → 10 pulser → række i `webinar_deltagelser` med `set_procent` og `motor_version` i svaret | 0 | **6–7** | 3 |
| 2 | **Paritet og mails** | `webinar-motor-cron` (status, snapshot, fremmøde → `webinar_tilmeldinger` + Klaviyo-outbox bag lås, raa-adapter, Missed) · `webinar-mail-cron`: udledte links, `bygIcs`, `ti_minutter` (CHECK først) · `webinar-handling` | 1 | 4 | 3 |
| 3 | **Seerens flade** | **Dag 1: mobil-SPIKE (plan A/B, §A5)** · `WebinarRum.tsx`: lobby, lydtest, nedtælling, afspiller med urmodel og spoledom, pause/live, genoptag, sen indgang, exitrum-skelet, afsluttet → næste session | 1 (og 2 for rigtige mails) | 5–6 | 1 (Update) |
| 4 | **Interaktioner og hand-off** | Overlays for de 9 arter, reaktionsbjælke, feedback, CTA via sendBeacon, `ansoegning-gem` `fra_webinar` + `webinar_tilmelding_id`, nyhedsbrev-samtykke i exitrummet | 1, 3 | 4 | 2 |
| 5 | **Spørgsmål og konsol** | Sidepanel, autovelkomst/-svar, `webinar-konsol`, Realtime-konsol, `webinar-svar-cron` (Mailgun, fælles loft), klokketyper på lister | 1 (flade: 3) | 4 | 3 |
| 6 | **Rådgiverens opsætning** | `webinar-admin`, Bunny-upload til webinarbiblioteket, tidslinje-editor med preview, sessioner/gentagelse/flyt/aflys (+ mailarterne `flyttet`/`aflyst`) | 1 | 5 | 2 |
| 7 | **Analytics** | Tragt, faldkurve + Bunny-heatmap, interaktioner, feedback, spørgsmål, segmenter, CSV, udvidelse af delingen (kun tal) | 1, 2 (data fra 4–5 for fuld værdi) | 4 | 1 |
| 8 | **Tilmeldingssiden og tracking** | Formular på topix.dk (site-repo), sessionsvalg, anonymt spor, dataLayer (gammelt + nyt navn), pixel `CompleteRegistration` m. `eventID`, evt. CAPI (§G3) + privatlivstekst + `tracking.md` | 1 | 3 | 2 + site-publicering |
| 9 | **Bevis** | k6-lastprøve, P0-skyggesession med sammenligningsSQL, enhedsmatrix, E3-tjeklisten som ét resultatsæt | alle | 2 | 1 |
| | **Sum** | | | **≈ 38–41** | **≈ 20** |

**Parallelitet:** skive 1 er serielt og kritisk (ca. 1 uge inkl. tre udrulningsrunder). Derefter kan 2, 3, 5 (motordelen), 6 og 8 køre side om side med 3–4 agenter, fordi de rører forskellige filer. 4 venter på 3, 7 på 2. Den kritiske vej er **1 → 3 → 4 → 9 ≈ 17–19 agentdage**.

**Kalendertid til P0 ≈ 4–5 uger.** Det, der kan forlænge den:
- Jonas' udrulningsrunder (≈ 20, én ad gangen, hver med bevis)
- mobil-spikens udfald (plan B koster +3–4 dage)
- site-repoets publicering

Til P1 skal der lægges en rigtig sessionsdato oveni, og P3 ligger mindst én måned efter P2. **Overestimér ikke parallelismen:** to agenter i samme `_shared`-fil er én agent.

---

# G. Beslutninger, Jonas skal tage

1. **Ærlighed i rummet** — skal webinaret kaldes «optaget, Morten svarer live i chatten», og skal falsk chat-historik og oppustede tællere forbydes?
   **Anbefaling: ja til begge.** Den simulerede live-illusion er branchestandard (EverWebinar importerer gamle chats), men den er vildledende, og huset sælger tillid til økonomisk rådgivning. Rigtige, mærkede «spørgsmål fra tidligere deltagere» giver det sociale bevis uden løgnen.
2. **Hvor tilmeldingen bor:** topix.dk-formular → vores function, eller en side i app'en?
   **Anbefaling: topix.dk.** Banneret, pixlen, GTM og de 13 links findes dér, og app'en skal blive fri for tredjeparts-tracking.
3. **Meta for tilmeldingen:** (a) kun pixel efter samtykke, eller (b) pixel + CAPI med hashet e-mail og dedup, og privatlivstekstens løfte «Selve din tilmelding deler vi ikke med Meta» ændres først.
   **Anbefaling: (b)**, efter princip (g). I dag sender eWebinars pixel «Fuldfør registrering» UDEN samtykke-banner. (a) ville give kampagnen færre signaler end nu, og (b) er både mere lovlig og bedre matchet. Teksten ændres FØR første afsendelse, med værn.
4. **Spoling og pause:** intet spol frem eller tilbage, og pause tilladt med «Tilbage til live»?
   **Anbefaling: ja.** Pausetid tæller ikke som set.
5. **Sen indgang og replay:** ingen replay (bekræfter 28/9), sen indgang altid tilladt, og efter 25 % tilbydes næste session med ét klik?
   **Anbefaling: ja.** Grænsen afledes af 75 %-reglen.
6. **Kanaler, der IKKE er med i v1:** JIT-sessioner, SMS, offentlig chat og Slack-notifikation?
   **Anbefaling: udenfor v1.** Datamodellen bærer JIT og SMS, så de kan prøves som målte eksperimenter, når P2 kører. JIT uden en rådgiver online giver ingen live-svar.
7. **Id-kolonnen:** `ewebinar_id = 'P-<uuid>'` i parallelperioden og omdøbning til `registrerings_id` efter opsigelse?
   **Anbefaling: ja.** Nul ændringer i Klaviyo-`unique_id`, Meta og læsere nu. Navnet lyver i en periode, og det står i kolonnekommentaren.

---

# H. Risici (rangeret)

1. **Mobil lyd/autoplay i en cross-origin-iframe.** Afbødning: spike på dag 1 af skive 3 og en klar plan B (egen HLS-afspiller).
2. **Annoncesignalet** falder, hvis pixel/CAPI ikke er bevist før P1. Afbødning: §E2 og §G3.
3. **Kalendere med eWebinars UID.** Afbødning: opsig aldrig før den sidste eWebinar-session.
4. **Belastning på ét tidspunkt.** Afbødning: pulsen er kun DB, lastprøve, ingen logning pr. kald (loftet er 100 log-hændelser/10 s).
5. **Mailgun-loftet er fælles** for påmindelser og svar. Afbødning: samme `beregnKoerselsLoft` over begge spor.
6. **Scope-creep** (eWebinar har 25+ interaktioner). Afbødning: listen i §A6 er lukket for v1.
7. **Lovable Cloud-grænser** (Realtime-plan, samtidige functions) er UMÅLT. Afbødning: arkitekturen afhænger ikke af Realtime for seerne.

# I. Det, der ikke er målt (samlet)

- Lovable Clouds Supabase-plan (Realtime-loft, samtidige functions)
- om Bunny-playeren sætter cookies
- Bunnys TTFF for vores publikum
- iOS-adfærd for lyd i iframe efter en gestus i forældresiden
- eWebinar-tilmeldte efter 13/10 (SQL i §E1)
- kildevideoens placering og format
- CTA-tidskoderne i eWebinar
- chat-/spørgsmålsvolumen hos eWebinar
- om topix.dk ligger bag Cloudflares proxy (Turnstile)
- et custom domain i Lovable

# K. Kilder (hentet 30/9-2026)

- eWebinar: https://ewebinar.com/features/interactions · https://ewebinar.com/features/scheduling · https://ewebinar.com/features/chat · https://ewebinar.com/help/intro-waiting-exit-rooms · (webhook-handlingerne: https://ewebinar.com/help/webhook via recon'en). Schedule-hjælpesiderne (`/help/schedule-event-types`, `/help/feature-glossary-of-best-practices-schedule-tab`) gav kun metadata — JIT-intervallerne er derfor fra EasyWebinar.
- Konkurrenter: EverWebinar https://supplygem.com/reviews/everwebinar/ · EasyWebinar JIT https://support.easywebinar.com/en/articles/6986089-how-to-set-up-just-in-time-webinars-and-instant-replays · Demio https://bloggingwizard.com/demio-review/ · Livestorm https://www.hubilo.com/blog/livestorm-pros-cons-feature-analysis
- Benchmarks: ON24 https://www.on24.com/blog/key-takeaways-from-the-webinar-benchmarks-report/ · https://www.marketingprofs.com/charts/2025/52917/b2b-webinar-benchmarks-conversion-attendance-personalization?e=4 · Goldcast https://www.goldcast.io/blog-post/2025-webinar-statistics-b2b-marketers-should-know · AEvent (længde/frafald, uden tal) https://aevent.com/?p=46581 · SMS (leverandørpåstande) https://www.salesmessage.com/texting-playbook/increase-webinar-attendance · https://mobile-text-alerts.com/articles/how-to-double-your-easywebinar-attendance-using-sms
- Bunny: https://docs.bunny.net/stream/embedding · https://bunny.net/docs/stream/playback-api · https://bunny.net/docs/api-reference/stream/manage-videos/get-video-heatmap.md
- Supabase: https://supabase.com/docs/guides/realtime/limits · https://supabase.com/docs/guides/functions/limits
- Browser: https://webkit.org/blog/6784/ · https://bugs.webkit.org/show_bug.cgi?id=190794 (ikke læst i detaljer)
- Meta: https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events

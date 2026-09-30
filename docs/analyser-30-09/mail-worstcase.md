# Mail-worst-case for en webinartilmeldt: kortlægning, 22/9-dubletten, tidslinjer og rettelser

Skrevet 29/9-2026. **Intet er rørt:** Klaviyo er kun læst (get_*, query_metric_aggregates), repoet er læst i worktree `/home/claude/wt-mailaudit` (origin/main `84323f3`), og prod-databasen er ikke læst. Hver påstand er mærket:

- **[K]** målt i Klaviyo i dag
- **[kode]** læst i koden, fil:linje
- **[doc]** repoets dokumenter
- **[ikke målt]** kan ikke læses herfra

Alle klokkeslæt er dansk tid (CEST), medmindre der står Z.

---

## 0. Kort fortalt

1. **Årsagen til 22/9:** «Det er i dag» blev sendt to gange, fordi både en Klaviyo-KAMPAGNE og et Klaviyo-FLOW sendte den, og de ramte de samme mennesker:
   - Kampagnen hed «Webinar 22-09 — på dagen (optakt uden for flow)», gik kl. 05:00 til listen `Sz5fdA` og havde **ingen ekskludering og Smart Sending slået fra**.
   - Flowet var `UiECQS` «Før webinar». Dets «Det er i dag»-trin gik kl. 07:0x.
   - Klaviyo talte **669 afsendelser men kun 345 unikke profiler**. Det betyder, at **324 profiler fik mailen to gange**, altså stort set alle flowets modtagere [K].
2. **Det kan ikke ske igen ad samme vej:**
   - `UiECQS` er slettet (404).
   - Begge optakt-kampagner er sendt, og der er ingen planlagte kampagner mod `Sz5fdA`.
   - De sidste 7 dage har Klaviyo kun sendt fra `SDVvCW`, `Wq3MkG`, `TGxxUc` og kampagnen 29/9 [K].
   - Platformen kan ikke sende samme art to gange til samme (person, session). Databasen afviser det via `webinar_mails_en_pr_person_uidx WHERE udfald='ok'` [kode].
3. **Deltagerens klage gentager sig alligevel 13/10, bare uden dubletten.** Som det er sat op i dag, får en deltager på selve dagen:
   - platformens «dagen» 07:30
   - platformens «en time før» 10:00
   - eWebinars 10-minutters-mail 10:50
   - Klaviyos tak-mail ca. 13:00, hvis personen står på Hovedlisten

   Det er «3 før og en tak», som han beskrev det.
4. **Worst case i dag er 27 mails på 30 dage (28/9–27/10), højst 5 på én dag.** Det gælder varianten med to sessioner, se §3. Hovedscenariet (deltager + ansøger) giver 18 mails, højst 5 på én dag.
5. **Efter rettelserne i §4 er worst case 13 mails, højst 4 på én dag.** Den ene af de 4 er kvitteringen på ansøgningen, som er svar på noget, personen selv lige har gjort. Uden den er det højst 3 pr. dag.

---

## 1. Alle afsendere, der kan ramme en webinartilmeldt

### 1a. Platformen (Mailgun EU og Lovables managed email)

| Afsender | Fil | Hvornår og til hvem | Værn mod dubletter | Rammer en tilmeldt? |
|---|---|---|---|---|
| **`webinar-mail-cron`** via Mailgun, «Morten Larsen \<morten@webinar.topix.dk\>» | `supabase/functions/webinar-mail-cron/index.ts`; dommen `_shared/webinarMailDom.ts` | `PLANEN` (`webinarMailDom.ts:81-95`): se listen under tabellen | Én person pr. (mail, session): `planlaegKoersel` `:421-429`. Unikt indeks pr. (email, session_tid, art) `WHERE udfald='ok'`. Afmeldte udelades `:431-435`. Loft 90→1000 i timen (#1152) | **JA, alle tilmeldte** (servicemail, ingen samtykke-gate) |
| **Ansøgningens kvittering** via `sendManagedEmail` (Lovable), fra noreply@theboardroom.dk-familien | `_shared/ansoegningMotor.ts:298-336` | Straks ved indsendelse, uden om vinduet og dagsreglen | `idempotencyKey ansoegning-kvittering-<id>` | JA, hvis personen ansøger |
| **Rykkerkøen** (`ansoegning-rykker-cron`) | `_shared/rykkerkoe.ts:34-70`, `ansoegningMotor.ts:562-600` | Se trapperne under tabellen. Cron `*/15 5-15 * * 1-5` UTC | UNIQUE idempotensnøgle. Reglen «én mail pr. person pr. dag» tæller KUN køens egne rækker (`rykkerkoe.ts:25-28`), **ikke Mailgun- eller Klaviyo-mails** | JA, ved ansøgning |
| **Samtalebeskeden** (book, flyt, aflys) | `_shared/samtaleBesked.ts:33-60` | Straks, når samtalen bookes via Calendly | idempotent | JA, hvis personen booker. **Calendly sender desuden sin egen bekræftelse** [ikke målt] |
| **Indgang og betaling**: invitation, `indgang-dag0/14/25/31`, `aftale-link` | `docs/mailfortegnelsen.md` M14–M16; `send-til-underskrift/index.ts:381` | Efter underskrift | se mailfortegnelsen | Ikke inden for 14 dage i praksis |
| `send-notification-email`, `event-reminders`, `monthly-digest`, `intro-reminder`, `report-reminder`, `onboarding-rytme` | mailfortegnelsen M1–M13 | Kun **medlemmer** | — | NEJ (kun hvis personen også er medlem) |
| `klokke-mail-cron`, rådgiver-rykkerne (`ny`, `afholdt`), rådgivermailen om ny ansøgning, `webinar-mail`-alarmen | `_shared/klokkeMail.ts`, `rykkerkoe.ts:56-63`, `ansoegningMotor.ts:338-356`, `_shared/webinarMailAlarm.ts` | Til **rådgivere/kontakt@/driftModtager** | — | NEJ |
| Auth-mails (signup, magic link …) | `auth-email-hook` | Ved kontohændelser | — | NEJ (en tilmeldt har ingen konto) |

`webinar-mail-cron`s plan (`PLANEN`):

- `bekraeftelse`: straks, kun ved tilmelding efter 22/9 17:03Z (`BEKRAEFTELSE_FRA`)
- `fjorten_dage`: 08:00, 14 kalenderdage før
- `syv_dage`: 08:00, 7 dage før
- `tre_dage`: 08:00, 3 dage før
- `en_dag`: 08:00, dagen før
- `dagen`: 07:30 samme dag
- `en_time`: 60 minutter før
- Nåden er 2 timer. En sen tilmelding får ikke tidligere arter bagud. En mail, der er fejlet, indhentes (`:286-318`).

Rykkerkøens trapper for ansøgeren (`rykkerkoe.ts:34-70`):

- `kladde`: dag 2 kl. 10, hvis ansøgningen ikke er indsendt
- `indkaldt`: dag 0, derefter dag 2, 7 og 11
- `booket`: dagen før kl. 10 og samme morgen kl. 07
- `aftalegrundlag`: dag 0, derefter dag 2, 5, 9 og 14
- `afslag`: dag 0

Alle trapper sendes på hverdage mellem 07 og 16.

**To dubletrisici i platformens egen kode** [kode, ikke målt i drift]:

- **Timeout betyder ikke «ikke sendt».** `mailgunAfsendelse.ts:278-289` skriver `udfald='timeout'`, når Mailgun ikke svarer inden 10 s. Den nøgle tælles som «fejlet» (`webinar-mail-cron:235`) og **indhentes** ved næste kørsel. Har Mailgun alligevel taget imod mailen, får personen den to gange. Mailgun har ingen idempotensnøgle.
- **Sporet skrives EFTER afsendelsen.** Dør kørslen mellem Mailgun-svaret «ok» og skrivningen i sporet (cron-timeout 60 s), sendes mailen igen i næste kørsel. Det står som bevidst valg i CLAUDE.md.

### 1b. Klaviyo (konto `Xb7Esq`; alle afsendere «Morten Larsen \<noreply@send.topix.dk\>», svar til kontakt@topix.dk)

**Flows** [K: get_flows, get_flow med definitionen]:

| Flow | Status | Trigger / filtre | Genindtræden | Mails (status, forsinkelse, emne) | Smart Sending |
|---|---|---|---|---|---|
| `Wq3MkG` «Jonas - Deltog i webinar» | **live** | Metrik «Deltog i webinar» (`Y9rrmF`) med `frisk = ja`. Profilfilter: Hovedliste `RZtwMb` OG kan modtage (samtykke «any») | 14 dage | 1. **live**, +2 t: «Tak, fordi du brugte timen» · 2. **live**, +1 dag kl. 20:30: «Hvad der faktisk sker, hvis du søger» (kun hvis 0 × «Ansoegning sendt») · 3. **live**, +3 dage kl. 13:00: «De to ting, folk siger nej med» (samme betingelse) · 4. draft: «Du skal ikke vente på næste møde» · 5. draft: «Så stopper jeg her» | **fra** på alle |
| `SDVvCW` «Jonas - Moedte ikke op» | **live** | Metrik «Moedte ikke op» (`WJ8PrD`) med `frisk = ja`. Samme profilfilter | 14 dage | 1. **live**, +1 t: «Du nåede det ikke — vi kører igen» · 2. **live**, +2 dage kl. 08:15: «De fem spørgsmål, jeg stiller alle mine investeringer» (0 ansøgninger) · 3. **live**, +4 dage kl. 08:30: «Hvis du ikke når timen» (målt 28/9 med emnet «Så får du kernen her i stedet», 185 stk.) | **fra** |
| `TGxxUc` «Velkomst — nye på Hovedlisten» | **live** | Tilføjet til Hovedlisten. Filter: ikke på `Xr6Pm9` (Medlemmer) | — | 1. straks: «Velkommen — og de fem spørgsmål» · 2. +3 dage: «Den dyreste lektie fra Hungry» · 3. +5 dage: «Jeg lavede den samme fejl to gange» · 4. +6 dage: «Hvad venter du egentlig på?» · derefter sættes `velkomst_gennemfoert` | **fra** |
| `XCqPKg` «Sunset — 180 dage uden åbning» | **draft** (skal tændes efter 13/10) | Segment `WNygMq` «Døde — 180 dage». **Intet profilfilter** | 365 dage | 1. straks: «Skal jeg blive ved med at skrive til dig?» · 2. +7 dage kl. 08:15: «Hvis du kun læser én af mine mails» · 3. +7 dage kl. 08:15: «Jeg tager dig af listen i morgen». Alle trin er draft | **fra** |
| `R3HF5H` «Meta Ads \| Tilmelding til Webinar-link» | draft | Liste `TNpnEJ` | — | 3 mails | — |
| `UFppkY`, `VVCbpM`, `XngABT` (Texta) | draft og arkiveret | — | — | — | — |
| `UiECQS` «Før webinar», `WFzxH9` «bekræftelse», `YcBF9f` «Efter webinar» | **slettet** (404). `UiECQS` sendte sidst 22/9 [K] | — | — | — | — |

Kun to flows udløses af en metrik (`Y9rrmF`, `WJ8PrD`). **«Ansoegning paabegyndt», «Ansoegning sendt» og «Blev medlem» udløser intet flow** [K]. Platformens hændelser til Klaviyo er:

- «Deltog i webinar» og «Moedte ikke op», sendt fra `ewebinar-webhook` via `_shared/webinarHaendelser.ts`. `unique_id` er `<ewebinar_id>:<grad>`, og «Deltog» sendes allerede ved LOGIN.
- «Ansoegning paabegyndt» og «Ansoegning sendt».
- «Blev medlem».
- Profilfelterne `tb_naeste_webinar` og `tb_naeste_webinar_tekst`, som skrives hvert time på minut 17 og fjernes ved første kørsel, efter at sessionen er begyndt [kode: `klaviyo-profil-cron/index.ts:130-183`].

**Kampagner** [K: get_campaigns, alle opdateret efter 25/8 samt alle med status Scheduled]:

| Kampagne | Status | Sendt / planlagt | Målgruppe → ekskluderet | Smart Sending |
|---|---|---|---|---|
| «Webinar 22-09 — 1 dag før (optakt uden for flow)» | Sendt | 21/9 10:00Z | `Sz5fdA` → **ingen** | fra |
| **«Webinar 22-09 — på dagen (optakt uden for flow)»**, «Det er i dag» | Sendt | **22/9 03:00Z = 05:00** | `Sz5fdA` → **ingen** | **fra** |
| «Ikke mødt op 22/9 → invitation til 13/10» | Sendt, 197 modtagere | 29/9 08:00Z | `RKxTH8` → `Xr6Pm9` | fra |
| «Så webinaret 22/9 → ansøgning» | **Scheduled** | 1/10 08:00Z | `Su9sJq` → `RVwauf`, `Xr6Pm9` | fra |
| «Morten skriver #5» | **Scheduled** | 7/10 08:15, `is_local=true` (modtagerens lokaltid) | `QQsbKZ` → `RVwauf`, `SGwMAk`, `SicZVb`, `Xr6Pm9` | til |
| «Morten skriver #6» | **Scheduled** | 15/10 08:15, `is_local=true` | samme | til |
| «Morten skriver #3» og «#4» | Draft | — | `QQsbKZ` | til |
| «Morten skriver #1» og «#2» | Sendt 8/9 og 15/9 | — | `QQsbKZ` | til |
| «Sunset — Re-engagement» (gammel) | Annulleret | — | — | — |

**Der er INGEN kampagne planlagt omkring 13/10 til de tilmeldte**, og det skal blive sådan (se §4 P0-2). Segmentdefinitionerne [K]:

- `RVwauf` = `tb_naeste_webinar` er sat.
- `RKxTH8` og `Su9sJq` = «Moedte ikke op» / «Deltog» inden for 30 dage OG `tb_naeste_webinar` ikke sat OG 0 ansøgninger.
- `WNygMq` = alle disse betingelser samtidig:
  - på Hovedlisten
  - 0 åbninger og 0 klik i 180 dage
  - 0 ansøgninger
  - `tb_naeste_webinar` ikke sat
  - mindst 3 modtagne mails i 180 dage
- `QQsbKZ` = SUBSCRIBED OG en åbning eller et klik inden for 90 dage.

**Fund:** `docs/marketingmotoren.md` §9.1 siger, at «den, der har en kommende session, får INGEN efter-webinar- eller kampagnemails om den forrige». **Det holder for kampagnerne, men ikke for flowene.** `Wq3MkG` og `SDVvCW` har intet filter på `tb_naeste_webinar` og ingen udelukkelse af `Xr6Pm9` (medlemmer) [K].

### 1c. eWebinar

Hvad koden og dokumenterne viser:

- **Bekræftelsen er SLUKKET** fra 22/9 19:03 [doc: `webinaret-og-annoncerne.md` §7e].
- **1-times-påmindelsen er SLUKKET** fra 22/9 aften [doc: `marketingmotoren.md` §2.4].
- **10-minutters-påmindelsen er BEHOLDT** og oversat til dansk [doc: §7e-tabellen; `analyser-30-09/webinar-og-referater.md` A1.3].
- Deltagerens indbakke 22/9 viser to eWebinar-mails: 08:01 (1 time før, nu slukket) og 08:51 (10 min før). **Der kom ingen eWebinar-opfølgning før 10:09**, men om der kom en senere på dagen, er **ikke målt**.
- eWebinar kan også sende: 2 opfølgninger («tak for din deltagelse» og «vi savnede dig», evt. med genudsendelse), en «starter nu»-besked, chatsvar pr. mail, sms/WhatsApp og en tilføj-til-kalender-mail [doc: `webinar-og-referater.md` A2, eWebinars featureside]. **Hvilke af dem der er slået til, kan ikke læses herfra.**

**Skal tjekkes i eWebinars flade** [ikke målt; stien er mit bedste bud ud fra eWebinars featureside og er ikke set]: eWebinar → *Webinars* → Mortens webinar → *Edit* → **Notifications / Emails**. Tjek:

1. «Registration confirmation» er **FRA**.
2. Reminders: «1 hour before» er **FRA**, «10 minutes before» er **TIL**, og alle andre (1 dag, «starting now», «webinar is live») er **FRA**.
3. **Follow-ups: «Thank you for attending», «Sorry we missed you» og replay-mails er FRA.** Klaviyo ejer alt efter webinaret, og optagelsen sendes ikke (beslutning 28/9).
4. SMS/WhatsApp er **FRA**.
5. *Chat* → mail-notifikation til deltageren ved moderatorsvar. Det er acceptabelt (et svar på et spørgsmål), men noter det.
6. *Integrations*: ingen Zapier, HubSpot eller Klaviyo-integration, der selv sender mails eller lægger folk på lister.
7. Ser indstillingerne ens ud for **hver session**, også 13/10 kl. 11?
8. Hvad gør eWebinar, hvis den samme mail tilmelder sig samme session to gange: én registrant eller to? Bliver det til to 10-minutters-mails?

---

## 2. 22/9: hvorfor «Det er i dag» kom to gange

**Målt i Klaviyo** (Received Email `XxZFZq` 21.–22/9 pr. emne og flow, timebuckets i UTC):

| Emne | Kilde | Tidspunkt (UTC) | Sendt | Unikke |
|---|---|---|---:|---:|
| «Det er i dag» | kampagnen «på dagen (optakt uden for flow)» → liste `Sz5fdA` | 22/9 03:00Z = **05:00** | 338 (+1 kl. 17Z) | 338 |
| «Det er i dag» | flowet **`UiECQS`** | 22/9 05:00Z = **07:00** | 324 (+ 5 løse) | 324 |
| **«Det er i dag», begge kilder** | — | 22/9 | **669** | **345** |
| «Vi ses i morgen — tag én beslutning med», begge kilder | kampagne 340 (10:00Z) + flow 9 (12:00Z) | 21/9 | 351 | 348 |

**669 − 345 = 324 profiler fik «Det er i dag» to gange.** Det svarer præcis til flowets modtagere: alle, der fik flowets mail, stod også på optakt-listen `Sz5fdA` og fik kampagnen. Deltagerens tidspunkter (05:00 og 07:06) passer med hver sin kilde.

**Årsagen:** kampagnen var tænkt til dem, flowet IKKE dækkede («optakt uden for flow»), men den blev sendt til hele listen, **uden ekskludering af flowets modtagere og med Smart Sending slået fra**. Emne og preheader var ens. Hvorfor flowtrinnet «i morgen» 21/9 kun ramte 9 (3 dubletter), mens «i dag» 22/9 ramte 324, kan ikke aflæses, fordi `UiECQS` er slettet (404). Et bud er, at trinnet først blev tændt mellem de to dage [ikke målt].

Deltagerens øvrige mails samme dag:

- 08:01 og 08:51: eWebinars 1-times- og 10-minutters-påmindelse
- 10:05: `Wq3MkG` «Tak fordi du var med — og optagelsen» (83 kl. 08Z + 57 kl. 09Z)

Han fik altså **5 mails på 5 timer fra 3 afsendere**.

**Kan det ske igen i dag (29/9)?** Ikke ad den vej:

- Klaviyo har intet live før-webinar-flow (`UiECQS` og `WFzxH9` er slettet).
- Ingen planlagt kampagne rammer 13/10-tilmeldte (alle tre planlagte ekskluderer `RVwauf` eller rammer kun 22/9-deltagere).
- Klaviyos afsendelser 23.–29/9 kom kun fra `SDVvCW`, `Wq3MkG`, `TGxxUc` og kampagnen 29/9 [K].
- Platformens `fjorten_dage` i dag kan ikke dubleres af indekset. **Undtagelsen er timeout-vejen i §1a** [ikke målt; SQL i §5].
- Kampagnen 29/9 (`RKxTH8`) og `fjorten_dage` rammer adskilte grupper, fordi `tb_naeste_webinar` ikke er sat for de ene. Der er en smal race: en person, der tilmeldte sig 13/10 mellem 09:17 og 10:00, havde endnu ikke feltet og kan have fået begge.

**Mekanismen lever videre som risiko:** laver nogen «optakt»-kampagner til 13/10 som til 22/9 (dokumenterne nævner «kampagnerne til 13/10», frist 6/10: `webinaret-og-annoncerne.md` §7c), gentager dubletten sig mod platformens mails, som Klaviyos Smart Sending ikke kan se.

---

## 3. Worst case: tidslinjer for én person til 13/10 kl. 11

**Antagelser:**

- Personen tilmelder sig **28/9 (man) kl. 14:00** via topix.dk/webinar og skriver sig samtidig på nyhedsbrevet på `/webinar/tak`. Dermed kommer personen på Hovedlisten og i velkomstflowet samme minut.
- Personen åbner og klikker aldrig. Er personen allerede på Hovedlisten fra før, trækkes 4 velkomstmails fra.
- Vinduet er **28/9–27/10** (tilmelding til 14 dage efter).
- eWebinar-opfølgninger er regnet som **FRA**. Er de TIL, lægges +1 til på webinardagen.
- Dato og ugedag: 13/10-2026 er en tirsdag.
- `P` = platformen (Mailgun), `L` = Lovable managed email (ansøgningen), `K` = Klaviyo, `E` = eWebinar.

### Scenarie A (bestilt): deltager, klikker «Ansøg», påbegynder og indsender 13/10 kl. 12:00; rådgiveren trykker «tal med dem» 14/10 kl. 09; ansøgeren booker aldrig

| Dato | Kl. | Kilde | Mail |
|---|---|---|---|
| 28/9 | 14:00 | P | Bekræftelse (med invite.ics) |
| 28/9 | 14:00 | K `TGxxUc` | Velkommen — og de fem spørgsmål ⚠ **samme minut** |
| 29/9 | 08:00 | P | Om to uger (med invite.ics) |
| 1/10 | 14:00 | K `TGxxUc` | Den dyreste lektie fra Hungry |
| 6/10 | 08:00 | P | Om en uge |
| 6/10 | 14:00 | K `TGxxUc` | Jeg lavede den samme fejl to gange |
| 10/10 (lør) | 08:00 | P | Om tre dage |
| 12/10 | 08:00 | P | I morgen |
| 12/10 | 14:00 | K `TGxxUc` | Hvad venter du egentlig på? ⚠ opfordrer til at ansøge dagen før webinaret |
| **13/10** | 07:30 | P | Det er i dag |
| **13/10** | 10:00 | P | Om en time (join-link) |
| **13/10** | 10:50 | E | Om 10 minutter ⚠ **overlap** med P 10:00 (to påmindelser inden for 50 min.) |
| **13/10** | 12:00 | L | Kvittering for ansøgningen |
| **13/10** | 13:00 | K `Wq3MkG` 1 | Tak, fordi du brugte timen (login 11:00 + 2 t) |
| 14/10 | 09:00 | L | Indkaldelse (trappen `indkaldt`, dag 0). `Wq3MkG` 2 springes over, fordi personen har ansøgt |
| 16/10 | 10:00 | L | Rykker 1 (dag 2) |
| 21/10 | 10:00 | L | Rykker 2 (dag 7) |
| 26/10 | 10:00 | L | Rykker 3 (dag 11 = søn 25/10 → næste hverdag) |

**I alt 18 mails. Pr. dag:**

- 28/9: 2
- 29/9: 1
- 1/10: 1
- 6/10: 2
- 10/10: 1
- 12/10: 2
- **13/10: 5**
- 14/10: 1
- 16/10: 1
- 21/10: 1
- 26/10: 1

**Højst 5 på én dag (13/10).** Sunset rammer ikke, fordi personen har ansøgt og dermed er ude af `WNygMq`. Gør Apples maskinåbninger (MPP) personen «engageret», kommer «Morten skriver #6» 15/10 oveni (+1).

### Scenarie B: mødte ikke op, ansøger ikke, sunset-kandidat

Til og med 12/10 er det som scenarie A: **9 mails**. Derefter:

| Dato | Kl. | Kilde | Mail |
|---|---|---|---|
| **13/10** | 07:30 / 10:00 / 10:50 | P / P / E | Det er i dag · Om en time · Om 10 min |
| **13/10** | ~13:00 | K `SDVvCW` 1 | Du nåede det ikke — vi kører igen («Missed» ~12:00 + 1 t) |
| 13/10 | 11:17 | — | `tb_naeste_webinar` fjernes → personen opfylder nu `WNygMq` (Hovedliste, 0 åbninger, 5 modtagne, ingen ansøgning) |
| 14/10 | — | K `XCqPKg` 1 | «Skal jeg blive ved med at skrive til dig?», hvis sunset tændes 14/10 som planlagt ⚠ **dagen efter «vi kører igen»** |
| 15/10 | 08:15 | K `SDVvCW` 2 | De fem spørgsmål … |
| 19/10 | 08:30 | K `SDVvCW` 3 | Hvis du ikke når timen |
| 21/10 | 08:15 | K `XCqPKg` 2 | Hvis du kun læser én af mine mails |

**I alt 17 mails, højst 4 på én dag (13/10).** Sunset-mail 3 («Jeg tager dig af listen i morgen») kommer 28/10, uden for vinduet.

### Scenarie C: tilmeldt to sessioner, 13/10 og en (hypotetisk) session 20/10 kl. 11, begge tilmeldt 28/9; deltager 13/10, bliver væk 20/10, ansøger ikke

Platformen dømmer pr. (mail, session) og sender derfor **to hele serier** [kode: `planlaegKoersel` `:421-429`]. `Wq3MkG` og `SDVvCW` har intet filter på `tb_naeste_webinar` [K].

| Dato | Mails | Antal |
|---|---|---:|
| 28/9 | P bekræftelse A · **P bekræftelse B** · K velkomst 1 | 3 |
| 29/9 | P 14 dage A | 1 |
| 1/10 | K velkomst 2 | 1 |
| 6/10 | P 7 dage A 08:00 · **P 14 dage B 08:00 (samme minut)** · K velkomst 3 | 3 |
| 10/10 | P 3 dage A | 1 |
| 12/10 | P 1 dag A · K velkomst 4 | 2 |
| **13/10** | P dagen A 07:30 · **P 7 dage B 08:00** · P en time A · E 10 min · K `Wq3MkG` 1 | **5** |
| 14/10 | K `Wq3MkG` 2, 20:30 | 1 |
| 17/10 | P 3 dage B · K `Wq3MkG` 3 | 2 |
| 19/10 | P 1 dag B | 1 |
| 20/10 | P dagen B · P en time B · E 10 min · **K `SDVvCW` 1 «Du nåede det ikke»** til en, der deltog for en uge siden ⚠ | 4 |
| 21/10 | K `XCqPKg` 1 (sunset, hvis tændt; deltagelse ekskluderer ikke) | 1 |
| 22/10 | K `SDVvCW` 2 | 1 |
| 26/10 | K `SDVvCW` 3 | 1 |

**I alt 27 mails, højst 5 på én dag. Det er husets worst case i dag.**

**Undervariant, samme session to gange med samme mail:** platformen slår dem sammen til én person (ingen dublet). Men fremmødet dømmes pr. registrering (`webinarHaendelser.ts:92-122`; `unique_id` = `<ewebinar_id>:<grad>`). Findes der to eWebinar-registranter, og personen går ind med den ene, får den anden «Missed». Så sendes både «Deltog» og «Moedte ikke op», og personen kommer i **begge** flows: «Tak, fordi du brugte timen» + «Du nåede det ikke» samme eftermiddag, altså +3 mails over 6 dage. 22/9 blev der målt «ingen profil fik begge», men om eWebinar kan lave to registranter pr. mail, er **ikke målt** (SQL i §5, eWebinar-punkt 8).

### Dubletter og overlap, samlet

| # | Hvad | Hvor | Type |
|---|---|---|---|
| O1 | «Det er i dag» fra kampagne og flow (22/9) | Klaviyo | **Dublet, forbi** (mekanismen kan genopstå, se P0-2) |
| O2 | P «en time» 10:00 + E «10 min» 10:50 | platform + eWebinar | overlap: to påmindelser inden for 50 min. |
| O3 | P «dagen» 07:30 efter P «i morgen» dagen før og før P «en time» | platform | tre mails på under 27 timer med samme budskab |
| O4 | P bekræftelse + K velkomst 1 i samme minut | platform + Klaviyo | overlap |
| O5 | K velkomst 3 og 4 samme dag som P 7 dage og P 1 dag. Velkomst 4 «Hvad venter du egentlig på?» dagen før webinaret | Klaviyo | overlap / modsatrettet |
| O6 | To sessioner giver to fulde serier. P 7 dage A og P 14 dage B i samme minut | platform | **dublet i praksis** |
| O7 | `Wq3MkG`/`SDVvCW` til en med en kommende session (ingen `tb_naeste_webinar`-port i flowene) | Klaviyo | modsiger §9.1 |
| O8 | `SDVvCW` «Du nåede det ikke» + sunset «Skal jeg blive ved …» dagen efter | Klaviyo | modsatrettet |
| O9 | Deltog + Moedte ikke op på samme person (to registranter / to sessioner) | Klaviyo | **dublet i budskab** |
| O10 | Timeout eller nedbrud efter Mailgun-ok → mailen indhentes igen | platform | **mulig dublet** [ikke målt] |
| O11 | Samtalebeskeden + Calendlys egen bekræftelse; rykkerne «i morgen»/«i dag» + Calendlys egne påmindelser | platform + Calendly | mulig dublet [ikke målt] |
| O12 | «Ikke mødt op → 13/10»-kampagnen 29/9 efter `SDVvCW` 1–3 (22/9, 24/9, 28/9) med næsten samme emne | Klaviyo | fire «vi kører igen»-mails på 7 dage til de 197 |

---

## 4. Rettelser: hvor, hvad og forventet effekt

### P0: før 13/10, ingen kode (Jonas i fladerne)

1. **eWebinar-tjeklisten i §1c.** Kun 10-minutters-påmindelsen må være TIL; opfølgninger og 1 time skal være FRA. Effekt: forhindrer +1 pr. session. Ikke-verificerede indstillinger er den største ukendte i tallene ovenfor.
2. **Ingen optakt-kampagner til de tilmeldte.**
   - Husregel: enhver Klaviyo-kampagne i perioden 6/10–15/10 skal ekskludere `RVwauf`, og ingen kampagne må dække noget, platformens `PLANEN` allerede sender.
   - Tagget `tb_naeste_webinar_tekst` hører kun hjemme i efter-webinar-mails og kampagner til IKKE-tilmeldte.
   - Effekt: forhindrer gentagelse af 22/9, dvs. +1–2 pr. person.
3. **`Wq3MkG` og `SDVvCW`: profilfilter** (Klaviyo → Flows → [flow] → Trigger → *Flow filters*; filteret tjekkes før hvert trin):
   - (a) `tb_naeste_webinar` **is not set**
   - (b) **ikke** på listen `Xr6Pm9`
   - (c) **kun `SDVvCW`:** «Deltog i webinar» count = 0 inden for de sidste 14 dage

   Effekt: fjerner O7, O9 og «vi kører igen» til en, der har deltaget, og til en, der allerede har meldt sig til næste. Scenarie C: −6.
4. **`XCqPKg` sunset før den tændes:** flowfilter
   - ikke `Xr6Pm9`
   - «Deltog i webinar» = 0 og «Moedte ikke op» = 0 inden for de sidste 60 dage
   - plus de tre rettelser i `analyser-30-09/klaviyo-gennemgang.md` §5

   Effekt: fjerner O8. Scenarie B: −2, scenarie C: −1.
5. **`TGxxUc` velkomst:** mail 2–4 får *Additional filter* «`tb_naeste_webinar` is not set» (så springes kun det trin over, og personen bliver i flowet), og **Smart Sending slås TIL** på mail 2–4. Mail 1 bliver, fordi den svarer på tilmeldingen. Effekt: −3 for en tilmeldt i scenarie A, B og C (fjerner O5).
6. **Smart Sending TIL på alle flowmails** (Settings → Smart Sending; vinduet sættes til 24 t). Dækker kun Klaviyo-mod-Klaviyo; ser ikke Mailgun og eWebinar. Bemærk: et trin, Smart Sending springer over, sendes aldrig senere.
7. **Calendly** (ved booking): Event type → *Notifications / Workflows*. Slå Calendlys egne påmindelser til ansøgeren fra, hvis vores `ansoegning-samtale-i-morgen`/`-i-dag` og samtalebeskeden er de gyldige (O11) [ikke målt].

### P1: kode, helst før 13/10 (Claude Code, feature-branch → PR; merge udruller ikke)

8. **Skær i `PLANEN`** (`_shared/webinarMailDom.ts:81-95` og spejlet `src/lib/webinar/mailDom.ts`; `ARTER` og `webinarMail.guard` dom 10).
   - Forslag: fjern `tre_dage` og `dagen`.
   - Tilbage bliver: bekræftelse · 14 dage (bærer invitationen til de ~217 fra før 22/9) · 7 dage · 1 dag · 1 time, plus eWebinars 10 min.
   - `webinar_mails_art_check` må gerne beholde ordene (historik), så der kræves ingen migration for at FJERNE.
   - Effekt: −2 pr. session (O3). Beslutningen er Jonas' (hvilke to).
9. **Kun nærmeste session får påmindelser** (`planlaegKoersel` `:421-470`, begge spejle + test).
   - Har én mail flere kommende sessioner, får kun den nærmeste påmindelserne. Bekræftelsen går stadig pr. session (den bærer sessionens invite.ics).
   - Er sessionen passeret, overtager den næste. Arter, der er gået tabt, er `for_sent`, som i dag.
   - Effekt: fjerner O6. Scenarie C: −5.
10. **En timeout udløser ikke en ny afsendelse** (`webinar-mail-cron/index.ts:235`, `_shared/mailgunAfsendelse.ts:278-289`).
    - `timeout` skal ikke tælle som «fejlet» til indhentning.
    - Send med `v:noegle=<noegle()>` og slå op i Mailguns Events API på nøglen, før der sendes igen.
    - Mål først med SQL'en i §5.
    - Effekt: fjerner O10.
11. **Et dagsloft på tværs af afsendere** (ny ren dom `_shared/mailDagsloft.ts` + spejl + test).
    - Tæller pr. `lower(email)` pr. dansk dato: `webinar_mails` (ok) + `email_send_log` (sent) + `planlagte_haendelser` (sendt).
    - Bruges af `rykkerkoe.afgoerSending` (en rykker udskydes til næste hverdag, hvis loftet er nået) og af `webinar-mail-cron` (tæller, men udskyder ikke tidsbundne påmindelser. Undtagelse: arter uden tidsværdi).
    - Effekt: rykkere lander ikke på webinardage eller oven i en påmindelse.
12. **Klaviyo kan se platformens mails.**
    - `klaviyo-profil-cron` skriver `tb_sidste_platformmail` (dato) ud fra `webinar_mails` og `email_send_log`.
    - Flowene får *Additional filter* «ikke inden for de sidste 1 dag».
    - **Mål**, at Klaviyo læser feltet som dato og ikke som tekst (lærdommen fra `session_tid`, `webinarHaendelser.ts:48-56`).

### P2: bogføring

13. Ret `docs/marketingmotoren.md` §9.1 (`tb_naeste_webinar` er IKKE en port i flowene før P0-3), `webinaret-og-annoncerne.md` §7e og `mailfortegnelsen.md`. Mailfortegnelsen er fra 8/9 og kender hverken `webinar-mail-cron`, ansøgningsmotoren eller Klaviyo. Dette dokument skal ind i repoet, og worst case-tallet skal stå i CLAUDE.md-afsnittet «Platformens webinarmails».

### Forventet antal efter rettelserne (P0 1–6 + P1 8–9)

| Scenarie | Før | Efter | Højst pr. dag før → efter |
|---|---:|---:|---|
| A: deltager og ansøger | 18 | **13** | 5 → 4 (3 uden kvitteringen) |
| B: mødte ikke op, sunset-kandidat | 17 | **10** | 4 → 3 |
| C: to sessioner | 27 | **11** | 5 → 3 |
| **Worst case i alt** | **27** | **13** | **5 → 4** |

Efter-tidslinje for A:

- 28/9: bekræftelse + velkomst 1 (2)
- 29/9: 14 dage (1)
- 6/10: 7 dage (1)
- 12/10: 1 dag (1)
- 13/10: en time, eWebinar 10 min, kvittering, `Wq3MkG` 1 (4)
- 14/10: indkaldelse (1)
- 16/10, 21/10, 26/10: rykker (1 hver dag)

### Husreglen (forslag til CLAUDE.md og `marketingmotoren.md` §9)

> **Højst 2 mails pr. person pr. dansk kalenderdag på tværs af platform, Klaviyo og eWebinar.**
>
> - Svar på noget, personen selv har gjort i samme øjeblik, tæller ikke. Det er bekræftelse, kvittering, samtaleboking og afmeldingskvittering.
> - **Webinardagen har loftet 3:** en time før, 10 min før, og ÉN efter-mail (tak eller ikke-mødt).
> - Højst 1 markedsføringsmail (Klaviyo) pr. 48 timer.
> - Ingen markedsføringsmail til en med en kommende session (`tb_naeste_webinar` sat), heller ikke fra et flow.
> - Én ejer pr. mail. Dækker to afsendere det samme budskab, er det en fejl, ikke en backup.

Hvem håndhæver hvad:

- **Platformen:** dagsloftet (P1-11) og «kun nærmeste session» (P1-9).
- **Klaviyo:** Smart Sending 24 t på alt (P0-6), `tb_naeste_webinar`-porte på flows og kampagner (P0-2, P0-3, P0-5) og `tb_sidste_platformmail` (P1-12).
- **eWebinar:** kun 10 minutter (P0-1).
- **Et værn:** et kildeværn, der fælder en ny art i `PLANEN` eller en ny trappe uden plads i husreglens tælling, som `klokkeMail.guard` gør for klokketyperne.

---

## 5. Måling Jonas kan køre (Lovable SQL editor, kun SELECT, ét resultatsæt)

```sql
select 'timeout_fulgt_af_ok' as sektion, count(*)::text as vaerdi from (
  select email, session_tid, art from public.webinar_mails group by 1,2,3
  having bool_or(udfald = 'timeout') and bool_or(udfald = 'ok')) x
union all
select 'fejl_fulgt_af_ok', count(*)::text from (
  select email, session_tid, art from public.webinar_mails group by 1,2,3
  having bool_or(udfald = 'fejl') and bool_or(udfald = 'ok')) x
union all
select 'max_platformmails_ok_samme_dag', coalesce(max(n),0)::text from (
  select email, (forsoegt_at at time zone 'Europe/Copenhagen')::date d, count(*) n
  from public.webinar_mails where udfald = 'ok' group by 1,2) x
union all
select 'mails_med_2plus_kommende_sessioner', count(*)::text from (
  select lower(email) from public.webinar_tilmeldinger
  where session_tid > now() group by 1 having count(distinct session_tid) > 1) x
union all
select 'samme_mail_samme_session_flere_registranter', count(*)::text from (
  select lower(email), session_tid from public.webinar_tilmeldinger
  where session_tid is not null group by 1,2 having count(*) > 1) x;
```

`timeout_fulgt_af_ok > 0` betyder, at O10 kan have ramt nogen: hver sådan nøgle kan være sendt to gange. Tjek den i Mailguns log.

---

## Kilder

- **Klaviyo:** get_flows (aktive + arkiverede), get_flow `Wq3MkG`/`SDVvCW`/`TGxxUc`/`XCqPKg` med definitionen, get_campaigns (efter 25/8 og status Scheduled), get_segments `RVwauf`/`RKxTH8`/`Su9sJq`/`Tc3fFm`/`WNygMq`/`QQsbKZ`, get_metrics, query_metric_aggregates på Received Email 20.–29/9 pr. emne og flow.
- **Kode:** `webinarMailDom.ts`, `webinar-mail-cron/index.ts`, `mailgunAfsendelse.ts`, `rykkerkoe.ts`, `ansoegningMotor.ts`, `samtaleBesked.ts`, `webinarHaendelser.ts`, `klaviyo-profil-cron/index.ts`, migration `20260922171000_webinar_mails.sql`.
- **Dokumenter:** CLAUDE.md, `docs/marketingmotoren.md` §2.1–2.4 og §9, `docs/webinaret-og-annoncerne.md` §7–7f, `docs/mailfortegnelsen.md`, `docs/analyser-30-09/klaviyo-gennemgang.md`, `docs/analyser-30-09/webinar-og-referater.md`, `docs/OVERLEVERING.md` (uddrag).

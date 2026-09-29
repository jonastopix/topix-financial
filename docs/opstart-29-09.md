# Opstart — tirsdag 29. september 2026, kl. 09:06

**Dette dokument erstatter `opstart-29-09.md` fra kl. 08:50.** Det gamle kaldte dagens
kørsel en generalprøve og bad om at forvente 317 `ok`. Generalprøven er kørt, og den
fejlede. Alt herunder er målt mellem 08:50 og 09:06.

Lægges i repoet som `docs/opstart-29-09.md` og henvises fra `docs/OVERLEVERING.md`.

---

## 1. AKUT — tilstanden lige nu

**Cron-job 573 `webinar-mail` er SLUKKET kl. 09:04.** Bekræftet: `active = false`.

FØR-værdier til rollback:
`jobid 573 · webinar-mail · active = true · schedule = 9,14,24,27,29,37,39,44,47,57,59 * * * *`
Rollback: `select cron.alter_job(573, active := true);`

**Mailgun-kontoen er midlertidigt deaktiveret** og frigives ca. **09:49**. Når den
frigives, sker der ingenting, fordi jobbet er slukket. Det er med vilje.

**De 211 manglende 14-dagsmails er ikke sendt og kommer ikke af sig selv.**
Af 319 modtagere til 13/10-sessionen er 108 sendt, 211 mangler. De er ikke tabt.

**Job 567 `klaviyo-gensend` kører videre og skal ikke røres.** Den håndterer
Klaviyo-hændelser, ikke Mailgun-mails — ingen af tidsstemplerne i `webinar_mails` ligger
på dens minutter.

### Hvad der skete, i rækkefølge

1. 08:09 fyrede job 573 første gang med den nye mailart `fjorten_dage` — 319 modtagere.
2. Mailgun-kontoen er på **probation**: max 100 mails/time. Omkring 100 gik igennem.
   Sidste `ok` er 08:14:41.
3. Job 573 kører **11 gange i timen** (`9,14,24,27,29,37,39,44,47,57,59`). Hver kørsel
   prøvede de resterende 211 igen. 2.125 forsøg i alt.
4. Mailgun deaktiverede kontoen: *"You are sending too fast… To maintain the rate the
   account has been temporarily disabled."*
5. Uden indgreb var det en løkke: konto frigives → 573 fyrer 211 → loft rammes →
   konto deaktiveres igen. Den bryder ikke af sig selv.

---

## 2. Mailgun — årsag, tal og hvad der skal gøres

### Hvorfor probation (målt, ikke gættet)

Kontoen er **ikke færdigregistreret**. Mailgun beder om forretningsoplysninger via en
formular: *"A few questions before completing your registration… we need extra
information about your business."* Svartid: **1 arbejdsdag.** Indtil da: 100 mails/time.

Det er ikke et omdømmeproblem, og det er ikke noget, vi har ødelagt.

### Den faktiske trafik gennem `webinar.topix.dk` (målt, 180 dage)

| | Sendt ok | Forsøg | Personer |
|---|---|---|---|
| September 2026 i alt | **221** | 2.238 | 325 |
| art `bekraeftelse` | 113 | 113 | 113 |
| art `fjorten_dage` | 108 | 2.125 | 319 |

Travleste dage før i dag: **21, 22, 13, 21**. I dag: 112.

**Den vigtigste linje i hele dokumentet:** denne Mailgun-opsætning har aldrig sendt mere
end 22 mails på én dag. Bekræftelserne er drypvis, én pr. tilmelding. `fjorten_dage` er
en mailart fra i går (#1102), og i dag var første gang, platformen forsøgte en samlet
udsendelse gennem Mailgun overhovedet.

### Svar til Mailgun-formularen

Spørgsmålet *"How many emails do you expect to send and at what frequency?"* besvares
med de målte tal, ikke et rundt gæt — Mailgun sammenholder svaret med den trafik, de
selv kan se.

> We send transactional email for a Danish B2B advisory business (Topix / The Boardroom)
> from webinar.topix.dk. All recipients have signed up for a specific webinar on our own
> site; there is no purchased or rented data.
>
> Current volume: approximately 220 emails in September 2026, typically 15–25 per day.
> These are individual confirmation emails sent one at a time as people register.
>
> Going forward we also send scheduled reminders before each webinar. We run a webinar
> roughly every three weeks with 300–400 registrants. That produces a burst of
> 300–400 emails within a short window, 2–4 times per webinar (14 days before, 7 days
> before, 1 day before, and on the day).
>
> Expected steady state: 1.000–1.500 emails per month, with peaks of 300–400 within one
> hour, roughly every three weeks.
>
> We would like the hourly limit raised enough to allow those reminder bursts. If a
> limit remains, please tell us the number so we can throttle our sending to stay
> within it.

Den sidste sætning er bevidst: vi skal kende loftet, fordi throttlen skal bygges efter
det.

### Ikke målt

- Om andre af platformens mails end webinarmailene går gennem samme Mailgun-konto
  (fejlen nævner kun `webinar.topix.dk`, men formularen gælder hele kontoen).
- Hvad timeloftet bliver efter godkendelse.
- Præcis hvornår probation ophæves.

---

## 3. To kodefejl, der skal rettes — bogføres

### 3.1 Udfaldsmærkaterne er forkerte

Koden oversætter HTTP-status til `udfald` efter tal, ikke efter indhold. Det gav tre
forkerte mærkater i dagens data:

| Status | Mærket som | Hvad Mailgun faktisk sagde |
|---|---|---|
| 403 | `noegle_afvist` | `Your account is on probation and domains are limited to 100 messages / hour` |
| 420 | `ugyldig` | `recipient limit (26) exceeded` |
| 429 | `loft` | `request limit (101) exceeded` — **korrekt mærket** |

`noegle_afvist` sendte mig efter `KLAVIYO_API_KEY`, og `ugyldig` lod som om 151
mailadresser var defekte. Ingen af delene passede. Mærkaten skal afgøres af `svar`, ikke
af statuskoden alene — eller mærkaterne skal hedde noget, der ikke påstår en årsag.

### 3.2 `webinar-mail` har ingen throttle

Jobbet fyrer hele restmængden ved hver kørsel, 11 gange i timen, uanset om modparten har
sagt "for hurtigt". Ved et **timeloft** er hyppige gentagelser præcis den forkerte
strategi — det holder spærringen i live i stedet for at vente den ud.

Det skal bygges, før job 573 tændes igen:
- et loft på antal pr. kørsel, sat efter Mailguns grænse
- et stop, når svaret er 403/429 med et tidspunkt i beskeden — vent til det tidspunkt,
  prøv ikke igen inden

Dette er forudsætningen for 13/10, ikke en forbedring.

---

## 4. 13/10 — den reelle risiko

Webinaret er om 14 dage. Mailene til det kræver 300–400 afsendelser i ét hug, flere
gange. Det er aldrig lykkedes gennem denne opsætning.

Tre ting skal være på plads, i denne rækkefølge:

1. **Mailgun-formularen sendt** (i dag) og kontoen godkendt (1 arbejdsdag).
2. **Loftet kendt** — tallet skal stå skriftligt fra Mailgun.
3. **Throttlen bygget** i `webinar-mail` efter det tal, og bevist i tørkørsel.

Først derefter tændes job 573 igen, og de 211 manglende sendes.

Bliver formularen ikke besvaret i dag, skrider hele kæden.

---

## 5. Klaviyo — landskabet, målt 29/9 kl. 08:50

Uændret siden det tidligere dokument. Klaviyo er **ikke** berørt af Mailgun-fejlen —
det er to adskilte veje.

### Kampagner

| ID | Navn | Status | Sendes | Modtagere | Ekskl. |
|---|---|---|---|---|---|
| `01M3KRQM8NPRK7M3VD037SZC76` | Ikke mødt op 22/9 → invitation til 13/10 | **Scheduled** | **29/9 10:00** | `RKxTH8` (220) | `Xr6Pm9` |
| `01M3KSWX5GSH4QV5EMMYS18S9G` | Så webinaret 22/9 → ansøgning | **Scheduled** | **1/10 10:00** | `Su9sJq` (152) | `RVwauf`, `Xr6Pm9` |

Begge: smart sending FRA, `ignore_unsubscribes` false, afsender Morten Larsen
`noreply@send.topix.dk`, svar til `kontakt@topix.dk`.
Skabeloner `UNnCkd` (220) og `Ye78yP` (152).

**Kampagnen kl. 10:00 går uanset Mailgun-fejlen.** Kontrollér Recipients kl. 10:15 —
forvent ≈ 220 minus medlemslisten. 0 = sig til.

### Lister (5 i alt)

| ID | Navn | Opt-in |
|---|---|---|
| `RZtwMb` | **Hovedliste** | single |
| `Xr6Pm9` | **Medlemmer (ekskluderes)** — 25 profiler | single |
| `SMpNXm` | ZZ gammel - Zenegy webinar list 24.04.25 | double |
| `Sz5fdA` | ZZ gammel - Webinar 22-09-2026 — optakt | single |
| `TNpnEJ` | ZZ gammel - Meta \| Modtag Webinar \| OM | single |

Ikke på `Xr6Pm9`, fordi de ikke findes i Klaviyo: `gry@bastantdesign.dk`,
`info@doggybed.dk`, `thomas@homie.nu`. `kontakt@topix.dk` bevidst udeladt.

### Segmenter med antal

| ID | Navn | Antal |
|---|---|---|
| `XVQA7f` | **A1 · Må kontaktes** | **3.800** |
| `VEHaz9` | **A2 · Har sagt aktivt ja** | **1.738** |
| `VsmTCA` | **A3 · Kun webinar-relation** | **2.062** |
| `RKxTH8` | Mødte ikke op — ikke tilmeldt næste | 220 |
| `Su9sJq` | Deltog — ikke tilmeldt, ikke ansøgt | 152 |
| `RVwauf` | Tilmeldt kommende webinar | 325 |
| `Tc3fFm` | Har ansøgt | 7 |
| `XPLm5J` | Aldrig været tilmeldt et webinar | 1.811 |
| `WNygMq` | Døde — 180 dage | 419 |
| `QQsbKZ` | Engagerede — email, 90 dage | 1.864 |

**1.738 + 2.062 = 3.800.** A2 og A3 deler A1 uden overlap og uden hul — beviset for at
grundlagssegmenterne er rigtige.

`QQsbKZ` må ikke omdøbes eller arkiveres, før kampagne #5 og #6 er sendt.

### Flows

| ID | Navn | Status | Trigger |
|---|---|---|---|
| `TGxxUc` | **Velkomst — nye på Hovedlisten** | **live** | liste `RZtwMb`, filter: ikke på `Xr6Pm9`, ingen re-entry |
| `Wq3MkG` | Jonas - Deltog i webinar | live | metric |
| `SDVvCW` | Jonas - Moedte ikke op | live | metric |
| `XCqPKg` | **Sunset — 180 dage uden åbning** | **draft, færdigbygget** | segment `WNygMq`, re-entry 365 dage |
| `R3HF5H` | Meta Ads \| Tilmelding til Webinar-link | draft | liste |

Sunset-flowet er komplet: 3 mails + ventetider 7d/7d/1d + update-profile. Det mangler
kun at blive **tændt** — planen er efter 13/10.

`YcBF9f` («Jonas - Efter webinar») optræder ikke længere blandt ikke-arkiverede flows.
**Ikke målt hvorfor** — arkiveret eller slettet. Skal slås op, før nogen regner med, at
den er slukket.

**Klaviyos API kan ikke oprette eller ændre flows — kun læse.** Flows bygges i fladen.

---

## 6. Miljø — hvad der virker og ikke virker

**Supabase-MCP'en rammer det forkerte projekt.** Den peger på `boardroom-2-prod`
(`tmhjionsbtgrwuzwjbgb`), som ikke indeholder `webinar_mails`, `webinar_tilmeldinger`,
`ansoegninger` eller `klaviyo_haendelser`. **Al SQL køres i Lovables SQL editor.**
Claude kan ikke måle platformen selv og skal ikke påstå andet.

Klaviyo-MCP'en virker og kan læse alt samt oprette lister, skabeloner, kampagner og
profilændringer — men ikke flows.

---

## 7. Gårsdagens leverancer (28/9)

### Platformen (`jonastopix/topix-financial`)

| PR | Hvad |
|---|---|
| #1102 | ny mailart `fjorten_dage` (migration `20260928120000`) — **det er den, der fejlede i dag** |
| #1105 | medlemmet ser sine refleksioner |
| #1106 | prisen med begge beløb + milestone-tallet regnet ud i kommentaren |
| #1107 | optagelse-rester fjernet |
| #1108 | bogføring 28/9 |
| #1109 | «Se alle dine refleksioner» + rejselinjen tæller dem |
| #1110 | persondatateksten om sporet |
| (kilde) | kilde «nyhedsbrev» — migration `20260928140000` kørt 13:18 |
| (visning) | ansøgningsvisningen — migration `20260928170000` kørt ~16:26, `ansoegning-gem` udrullet, bevist 16:36 |

### topix.dk (`topix-reimagined`)

#4 nyhedsbrevsformular + optagelsen ned · #5 Klaviyo-revision `2026-07-15` ·
#6 optagelsessidens tekst

### theboardroom.dk (`theboardroom-topix`)

#5 medsendt kilde i `src/lib/utm.ts`

Nyhedsbrevstilmelding virker for første gang siden 17/8. Hovedlisten 3.113 → 3.115.

---

## 8. Åbne beslutninger

**Samtykke-hullet.** 2.104 profiler ind uden samtykke siden juni 2025 mod 32 med.
1.292 har ingen egenskaber; 48 har ikke engang mail. Anbefaling uændret: luk hullet ved
kilden (eWebinar + `/webinar/tak`), stil ét spørgsmål til de ~671 fra webinarvejen, rør
ikke de 1.292 tomme. `can_receive_email_marketing: true` styrer afsendelsen —
`NEVER_SUBSCRIBED` betyder ikke, at de ikke må kontaktes. Dansk markedsføringslov §10
kræver forudgående aktivt samtykke; det er dér hullet er.

**Ansøgningsfrafaldet.** 17 klikkede «Ansøg» 22/9, 6 oprettede. Målingen
(`ansoegning_visninger`: vist/start/tastet) er i drift siden i går 16:36. Årsagen er
ikke målt. Webview-teorien holdt ikke — 5 af 6 sad på computer.

**«Morten skriver» som evergreen flow** af de fem essays. Ikke bygget.

**`m28-hash-i-chatten`** — tre afgørelser mangler.
**`m28-refleksion-svar`** — forudsætningen er bygget (#1105, #1109), svarvejen mangler.

**Blogartiklernes meta og canonical** — alle svarer med forsidens meta.

**Morten skal læse velkomstseriens mail 1, 3 og 4.** Flowet er LIVE imens.

**Philbert-kontrakten** udløb 28/9, fornyelse ikke afklaret.
**Ventepladserne** til Lev Positiv og Tatti udløber 29/9 kl. 18:28.

---

## 9. Lærestreger

**Intet sendes i Mortens navn uden hans godkendelse.** «Morten skriver #3» gik til 1.644
uden, at han havde set den.

**Jeg må skrive Mortens formuleringer, men ikke hans erindringer.**

**`can_receive_email_marketing` styrer afsendelsen — ikke consent-ordet.**

**4.167 og 4.375 er begge rigtige.** 50.000/12 = 4.167 ved forudbetaling.
50.000 + 5 % = 52.500/12 = 4.375 ved ratebetaling. Regnestykket skal stå i kommentaren.

**`gh pr merge <nummer>` — altid med nummer.** Én ændring, én gren, én commit.

**Kolonnenavne og statuskoder måles, de gættes ikke.**

**Nyt i dag — fire fejl på tyve minutter, alle af samme slags:** jeg læste en mærkat i
stedet for indholdet bag den. `noegle_afvist` var probation. `ugyldig` var et
recipient-loft. «Gensenderen» var job 573, hvilket uret viste med det samme. Og
kampagnen, jeg sagde stod som Draft, var Scheduled. Hver gang havde svaret stået i
dataene. **Læs feltet, ikke navnet på feltet.**

---

## 10. Faste regler

- **Målt, ikke påstået.** «Det har jeg ikke målt» frem for «der findes ikke».
- **Ét skridt ad gangen.** Aldrig to handlinger i samme besked.
- **Destruktive ændringer:** SELECT før, skriv, SELECT efter. FØR-værdier skrives ud.
  Hver UPDATE guardes på den forventede nuværende værdi.
- **Lovables SQL editor eksporterer kun sidste resultatsæt** — saml med UNION ALL og en
  sektionskolonne.
- **Merge er ikke udrulning.** Frontend kræver Update-klik. Nye edge functions og
  ændringer, der trækker en ny delt fil ind, rulles ud eksplicit.
- **`gh run list --branch`**, ikke `gh pr checks`.
- **`bunx tsc --noEmit -p tsconfig.app.json`** og **`bun run test`**, ikke `bun test`.
- **Ved recon: kun fund.** Claude Code skal STOPPE frem for at gætte.
- **Tredjepartsdokumentation slås op.** Især Stripe — og nu også Mailgun.
- **Sporet i `ansoegning_visninger`** må aldrig identificere personer, sendes til
  tredjepart, bruges til retargeting eller som dom over en ansøger.

---

## 11. Første skridt i den nye chat

1. Bed om `docs/OVERLEVERING.md`.
2. **Send Mailgun-formularen** med svaret i §2. Alt andet venter på den.
3. Kl. 10:15: bekræft at Klaviyo-kampagnen til de 220 gik ud.
4. Når Mailgun svarer: få loftet skriftligt, byg throttlen i `webinar-mail` (§3.2),
   bevis den i tørkørsel, tænd job 573, send de 211.
5. Ret udfaldsmærkaterne (§3.1), så næste fejl ikke lyver om sin årsag.

**Job 573 må ikke tændes, før throttlen findes.** Den vil ellers gentage i dag.

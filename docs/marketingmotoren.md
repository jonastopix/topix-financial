# Marketingmotoren — seks lag, og hvad hvert lag må

**Skrevet 20/9-2026 (bogføringen af 19.–20/9), ført ajour efter #1036 og prøven kl. 08:41.** Kilder: commit-beskederne
#1030–#1036 (læst, ikke skrevet af), udkastmapperne i `~/Downloads/`, og
målinger mod den rigtige Klaviyo-konto og prod-basen 20/9 kl. 08:05–08:25.
Datoer og tider er danske. Se også `docs/webinaret-og-annoncerne.md` (kilden
til tallene, lagene måler på) og `docs/OVERLEVERING.md` DEL 2 «19.–20.
september» (dagen som den gik).

---

## 0. Hvad motoren er — i én linje

Platformen skal kunne **skrive, sende og lære** i vores kundekommunikation,
uden at en maskine nogensinde kan gøre skade, ingen kan læse bagud. Derfor er
den bygget i lag, og hvert lag har én ting, det må — og en liste over det, det
ikke må.

```
lag 1  GRUNDLAGET      det en agent må skrive ud fra          #1031  merget
lag 2  HÆNDELSERNE     platformen → Klaviyo                    #1030  merget  (+#1034 fremmøde, +#1036 prøven — BEVIST 08:41)
lag 3  MOTOREN         platformen kan bygge i Klaviyo          #1032  merget  (+#1035 afvigelsesdom)
lag 4  AGENTEN         den der foreslår                        —      IKKE BYGGET, ikke skitseret
lag 5  RETUR-DATA      Klaviyo → platformen                    —      SKITSERET (udkast-klaviyo-retur), ikke bygget
lag 6  DOMMEN          hvad tallene betyder — og hvornår ikke  #1033  merget
```

Rækkefølgen er ikke tilfældig: lag 6 blev bygget FØR lag 4 og 5, fordi det er
her, maskinen kan gøre skade. En agent uden dom konkluderer på tre
ansøgninger og ændrer noget, der virkede.

---

## 1. Lag 1 — grundlaget (#1031, 19/9 22:37)

**Hvorfor det findes:** 19/9 blev der skrevet seks mails til webinarholdet,
og alle seks ramte fagligt forkert. De sagde, at webinaret handler om regnskab
og nøgletal. Det handler om de to områder, der afgør vækst, og de fem
spørgsmål, Morten stiller sine investeringer. Fejlen var ikke sproglig — der
var ingen fakta at stå på, så hver mail blev bygget oven på den forrige
antagelse. En agent begår samme fejl hver gang, hvis grundlaget ikke findes.
**Derfor er dette lag vigtigere end selve skrivningen.**

- `src/lib/marketing/grundlag.ts`: produktet, afsenderne (Morten, Jonas),
  webinaret, citaterne og husets sprog — ét sted, læsbart for menneske og
  maskine. Et faktum vi ikke har, står som `MANGLER`, aldrig som `""`.
- `src/lib/marketing/udkastVaern.ts`: `kontrollerUdkast(tekst)` dømmer, om et
  udkast bygger på grundlaget eller på en antagelse, og siger ærligt hvad det
  ikke kan afgøre. Prøvet mod den faktiske ordlyd i Klaviyo, ikke fixtures —
  det fandt en mail, der stadig var forkert, og pegede på sætningen.
  Modprøven tæller lige så meget: den godkendte tekst giver nul udslag.
- I repoet, ikke i basen: værnet kører i vitest, som ikke kan nå prod; en
  ændring af prisen eller et citat skal kunne ses i git.

Udkast: `~/Downloads/udkast-marketing-grundlag/`.

---

## 2. Lag 2 — hændelserne til Klaviyo (#1030, 19/9 22:10; #1034, 20/9 08:07)

**Hvorfor:** efter-webinar-flowet skal udvides fra to til fem mails, og de tre
nye må kun gå til folk, der ikke har ansøgt. Klaviyo kunne ikke vide det —
formularen ligger på vores domæne.

- `_shared/klaviyo.ts` er **fundamentet** (`kald()` kaster aldrig; udfald
  `ok · ingen_noegle · ingen_mail · noegle_avist · loft · ugyldig · fejl ·
  timeout`; `revision 2026-07-15`; 3 s timeout). Det bærer også lag 3.
- `_shared/klaviyoHaendelser.ts`: tre hændelser — **Ansoegning paabegyndt**
  (fra kontaktskærmen, skærm 6, IKKE fra oprettelsen — rettet 19/9 aften,
  se §7 fejl 3), **Ansoegning sendt**, **Blev medlem** — med vores eget id
  som `unique_id`, så en gentagelse ikke tælles to gange.
- **Fail-soft er ufravigeligt:** en fejlet hændelse kan aldrig stoppe en
  ansøgning eller en betaling. Uden `KLAVIYO_API_KEY` sendes intet.
- **Sporet** `klaviyo_haendelser` (migration `20260919200000`, KØRT) logger
  HVERT forsøg — også `ingen_mail` og `ingen_noegle`. Det er halvdelen af
  pointen: når en maskine skriver i vores kundekommunikation, skal et
  menneske kunne læse det bagud.
- **#1034 — fremmødet:** Klaviyo ved intet om, hvem der kom (målt på 19
  profiler: én egenskab, `eWebinar: "MM/DD/YYYY"`, overskrives ved næste
  tilmelding — `recon-klaviyo-fremmoede`). Nu sender `ewebinar-webhook` to
  hændelser, når dommen skifter: **deltog** eller **mødte ikke op**, med
  session og tidspunkt på selve hændelsen, så historikken overlever en ny
  tilmelding. Grænsen på 75 % ligger i tallet ved siden af, ikke i navnet —
  dommen er vores, den er flyttet én gang før, og et navn kan ikke laves om
  hos Klaviyo bagefter. En der mødte op, bliver aldrig til en der ikke gjorde;
  en no-show, der ser optagelsen, er ikke en deltager. Ingen migration.

**Målt i Klaviyo 20/9 kl. 08:25:** metrikkerne `Ansoegning paabegyndt`
(`XgxCJf`, oprettet 19/9 23:05) og `Ansoegning sendt` (`XWaVxK`, 23:05)
findes. `Blev medlem` fandtes ikke, og heller ikke fremmøde-hændelserne — en
metrik oprettes først ved sin første hændelse. **Forældet kl. 08:40 (og det
er pointen):** prøven nedenfor udløste begge, og `Deltog i webinar` (`Y9rrmF`,
08:40:13) og `Moedte ikke op` (`WJ8PrD`, 08:40:46) findes nu, status 202.
`Blev medlem` findes stadig ikke — ingen er blevet medlem siden lag 2.

- **#1036 — prøven (`ewebinar-proeve`, 20/9 08:33):** webhooken kræver en
  signatur, og nøglen kan kun læses inde i en function, så prøven kunne
  hverken køres fra terminalen eller SQL-editoren — og uden en prøve ville
  mekanikken først ses virke tirsdag, samtidig med at den skulle virke.
  Functionen (Bucket A, `verify_jwt = true`) bygger prøve-registranten selv
  (webinar-id fastlåst, id tvunget til `PROEVE-`), signerer indefra og kalder
  den rigtige webhook gennem den ægte signaturkontrol. **Ikke et
  signerings-orakel:** den tager ikke en krop og signerer den; en rigtig
  tilmelding kan aldrig passere. **To veje afvist:** nøglen i basen (rotation
  i eWebinar to dage før 345 rammer webhooken) og en webhook uden signatur
  (åben dør). Den vigtigste prøve er, at signering og verifikation er ENIGE —
  ellers en 401 midt i webinaret. **Kørt 08:39–08:41: tre kald, tre gange
  `enig: true`.** #1034 er dermed bevist i drift før tirsdag.

Persondata: vi sender mailadressen til Klaviyo. Teksten er dækket af #1020
(`docs/OVERLEVERING.md` «19.–20. september» §4).

---

## 3. Lag 3 — motoren (#1032, 19/9 22:47; #1035, 20/9 08:24)

**Evnen til at handle:** læse og skrive flows, handlinger og skabeloner.

- `klaviyo-motor` (Bucket A, `verify_jwt = true`, rådgiver-gate) er det
  ENESTE, der skriver til Klaviyo. **Tørkørsel er standard**; der skrives
  kun ved et udtrykkeligt flag.
- **Det afgørende spørgsmål blev målt og besvaret:** et helt flow kan
  oprettes på én gang med alle sine handlinger, og det oprettes som
  **kladde** — Klaviyos egen standard. Derfor kan en agent bygge NYE flows
  frem for at rette gamle, og intet går i luften, før et menneske har set det.
- **Sporet** `klaviyo_spor` (migration `20260919210000`, KØRT): FØR, sendt og
  EFTER på hver eneste skrivning, `aendringer` udregnet, `udfald`
  (`toerkoersel · skrevet · afvist · fejl`), `udfoert_af` NOT NULL — også
  når lag 4 er en agent, handler den på vegne af et menneske.
- **#1035 — afvigelsesdommen:** to gange på ét døgn ændrede Klaviyo det, vi
  sendte, og svarede som om alt var i orden (§7 fejl 4 og 5). Motoren
  sammenligner nu det sendte med svaret felt for felt (`doemAfvigelse`,
  `doemFlowAfvigelse`) og lægger afvigelserne i `klaviyo_spor.klaviyo_afveg`
  (migration `20260919230000`, **KØRT — målt 20/9 08:25**). Reglen er
  bevidst generel: en regel, der kun kender den fælde vi er faldet i, fanger
  ikke den næste. En skabelonrettelse kan angive sit flow og afvises, hvis
  skabelonen ikke er den, flowet faktisk bruger. **Betingelser** på en
  flowmail (`additional_filters`, hvem den IKKE skal til) dømmes
  **fail-closed** af `doemBetingelser`: kan vi ikke stå inde for filteret,
  sendes det ikke — det farlige udfald er ikke en afvisning, men at Klaviyo
  ser bort fra filteret og sender til alle.

### De seks regler (fra `~/Downloads/udkast-klaviyo-motor/README.md` og `-2/`)

Regel 1–4 kan udledes af koden. **Regel 5 og 6 kan ikke, og de står derfor
her, i CLAUDE.md og i filhovederne:**

| # | Regel | Fundet |
|---|---|---|
| 5 | **En feltfiltreret læsning (`fields[flow-action]=…`) taber `definition.id`** og duer aldrig som grundlag for en PATCH — læs ufiltreret. En PATCH på en flowhandling skal sende **hele** definitionen tilbage, inkl. id og links; en PATCH er alt eller intet. | 19/9, ved at blive afvist to gange mod den rigtige konto |
| 6 | **Klaviyo KLONER en skabelon, når den kobles på en flowmail** (målt: `TVbT4b → SYKyM6`, 19/9 23:17). Originalen er frakoblet fra det øjeblik, og klonen kan ikke findes med `GET /api/templates` (hverken `any(id,[…])` eller filter på `created`) — kun hvis man kender id'et. Find altid en flowmails skabelon GENNEM FLOWET; begge id'er står i sporet. | 19/9 23:17 |
| — | Klaviyo ombyttede også `trigger_time` (bad om kl. 11, fik midnat) uden at sige det. | 20/9 |

Ingen af reglerne står i Klaviyos skema. Det er derfor afvigelsesdommen er
generel og ikke en liste.

Udkast: `~/Downloads/udkast-klaviyo-motor/`, `udkast-klaviyo-motor-2/`.

---

## 4. Lag 4 — agenten: IKKE BYGGET

Ikke skitseret. Det, den skal stå på, er bygget: grundlaget (lag 1), evnen
(lag 3), dommen (lag 6) og mindet (lag 6, §6). Det, den mangler, er lag 5.
Dommens `maaForeslaas(felter, dom)` er den ene funktion, en agent skal kalde,
før den stiller et forslag — den svarer på grænsen OG hukommelsen.

---

## 5. Lag 5 — retur-data fra Klaviyo: SKITSERET, ikke bygget

`~/Downloads/udkast-klaviyo-retur/README.md` (B, 19/9). Målt mod kontoen:
de tre metrikker findes med konto-specifikke id'er — `Received Email XxZFZq`,
`Opened Email RxGYRk`, `Clicked Email Tk8SmP` — og hver hændelse bærer
`$flow`, `$message` (flowBESKEDENS id), `Campaign Name`, `Subject` og
`Recipient Email Address`. Hentes med `GET /api/events`, filter på
`metric_id` + `datetime`, cursor-paginering.

**Det, lag 6 beder lag 5 om,** står i `~/Downloads/udkast-marketing-dom/
README.md` §2 som `MaalingsInput` (tre lister: `MailUdsendelse`, `Deltager`,
`Ansoegning`). Tre ting at vide, før det bygges:

- **`$message` er IKKE flowets trinnummer.** Rækkefølgen skal slås op på
  flowets actions (`/api/flows/{id}/flow-actions`). Kan det ikke i første
  omgang: `trin: 1` for alle — dommen sorterer så alfabetisk; en
  visningsting, ikke en regnefejl.
- **`ansoegninger.indsendt_at` er NULL for kladder** — filtrér dem væk.
- **Ingen aggregering:** dommen tæller selv; færdige procenter skjuler
  nævneren.

**Kun platformen ved, hvem der blev medlem og for hvor meget.** Klaviyo ser
åbninger, Meta ser klik; sammenføjningen er hele værdien.

---

## 6. Lag 6 — dommen (#1033, 19/9 23:37)

`src/lib/marketing/{statistik,maalingsdom,minde,marketingdom}.ts`. Læses af
et menneske (`somTekst`), bruges af en maskine (`doemMarketing`). **Skriver
ikke. Er ikke agenten.** Håndhævet af kildeværnet (elleve regler, hver bevist
på en kopi med fejlen sat ind).

**De fire spørgsmål:** hvad skete der pr. mail (åbnet/klikket/medlem +
ansøgte inden 24/48/168 t fra **modtaget**) · hvornår ansøger folk (median og
kvartiler fra webinaret; dem der ansøgte FØR holdes ude) · hvilken mail gik
forud (**forbeholdet bæres af typen:** «sidst åbnet før» er ikke «årsag til»)
· er det nok.

**Tre niveauer, dømt — ikke husket:** `observation` (ét webinar: kun hvad der
skete, ALDRIG en anbefaling) · `moenster` (tre) · `sammenligning` (otte ≈ 100
ansøgninger ved husets tal 345 → 37 % → 10 %). **Begge betingelser** —
sessioner OG mindste gruppe: tyve webinarer med fire mennesker i hver gruppe
er stadig observation.

**Wilson-intervallet**, valgt over rå tal, p-værdier og en Beta-posterior:
normaltilnærmelsen siger ved «0 af 3» «vi er sikre på, at ingen konverterer»
([0 ; 0]); Wilson siger [0 ; 0,56]. **Sammenligning på overlap, bevidst
konservativt:** overlappende intervaller betyder «vi kan ikke afgøre det» —
ikke «ingen forskel». Laget tier hellere end tager fejl. Ordet «ens» findes
kun som en benægtelse.

**«For få» er en værdi, ikke en fodnote:** sætningen ERSTATTER procenten
(`2 af 3 modtagere åbnede — FOR FÅ TIL AT SIGE NOGET`), og der er én vej til
et forhold (`forhold()`).

**Mindet** bygger på `klaviyo_spor` — ingen ny tabel; «hvad skete der» regnes,
gemmes ikke. Tørkørsler, afviste og fejlede rækker er ikke forsøg.
`erProevetFoer` sammenligner på de felter, der blev rørt, ikke på fri tekst.

**Grænsen:** ÉN ændring pr. runde, håndhævet af ventetiden (tre webinarer
siden sidste ændring). Aritmetik, ikke forsigtighed: to samtidige ændringer
tager fire gange så lang tid at afgøre som to efter hinanden. På
observationsniveau er budgettet altid nul.

**Onsdagsprøven** (`marketingFoersteKoersel.test.ts`) er den allerførste
kørsel bygget som test, ikke som påstand — og den fandt en fejl (§7 fejl 6).
Ønsket var «for få» på alle fire spørgsmål; det holder på tre. Spørgsmål 1
svarer med tal, fordi «72 af 200 åbnede» er en kendsgerning — men mail 1
(36 %) mod mail 5 (20 %), hvis intervaller ikke engang overlapper, nægtes
sammenlignet: ét webinar er én stikprøve af et publikum, ikke af 200
mennesker.

Udkast: `~/Downloads/udkast-marketing-dom/` (README §2 er lag 5's
grænseflade, §10–11 er prøven og mønstret).

---

## 7. Fejlene, der er værd at kende — fordi de gentager sig

| # | Fejl | Hvad den lærte os | Hvor den er lukket |
|---|---|---|---|
| 1 | **Seks mails skrevet om et webinar, hvis tilmeldingsside ingen havde læst** (19/9). Alle seks fagligt forkerte. | En agent uden fakta opfinder resten. **Det er grunden til, at lag 1 findes.** | #1031, `grundlag.ts` + `udkastVaern.ts` |
| 2 | **Persondata:** vi sender mail til Klaviyo. | Teksten skal være sand om det, koden gør. | #1020 |
| 3 | **«Ansoegning paabegyndt» blev aldrig sendt** (målt i prod 19/9 22:22). `opret` sker på første «Næste» (skærm 1 = CVR); mailen kommer på skærm 6; `sendHvisMail` returnerede FØR `sendHaendelse` — intet sendt OG intet logget. | Sporet skal logge ALT, også `ingen_mail`. Hændelsen flyttet til kontaktskærmen. Tallene: «påbegyndt» tæller nu dem, der nåede skærm 6 — ikke dem, der trykkede én gang. | #1032 (lag 2-rettelsen bar med) |
| 4 | **Klaviyo kloner en skabelon**, når den kobles på en flowmail. Originalen frakobles; klonen er usynlig i skabelonlisten. | Find skabelonen gennem flowet. Begge id'er i sporet. | #1035 (regel 6) |
| 5 | **En PATCH på en flowhandling skal sende hele definitionen tilbage**, inkl. id og links; feltfiltreret læsning taber `definition.id`. | Læs ufiltreret før en PATCH. Fundet ved at blive afvist to gange. | #1032, #1035 (regel 5) |
| 6 | **«0 % ansøgte inden 48 timer» tretten timer efter webinaret.** | En periode, der ikke er gået, er ikke en periode. Samme fejl som annoncepriserne (#1024), set fra den anden side — se `docs/webinaret-og-annoncerne.md` §5. De to steder henviser nu til hinanden. | #1033 (værn-regel 11) |
| 7 | **Klaviyo ombyttede `trigger_time`** (bad om kl. 11, fik midnat) uden at sige det. | Sammenlign sendt med svar — generelt, ikke pr. kendt fælde. | #1035 |

---

## 8. Hvad der venter — i rækkefølge

0. **FØR tirsdag 22/9 kl. 13:30: det gamle efter-webinar-flow `YcBF9f` slås
   fra.** Det udløses datostyret kl. 13:30 på eWebinar-datoen; er det live,
   får alle 345 tilmeldte dobbelt post (det gamle datostyrede + det nye
   hændelsesstyrede). Målt (Jonas 20/9): nul modtagere i syv dage — ingen
   sidder i det, det kan slås fra nu.
1. ✅ **Udrulningerne er sket** (08:38, `767bc68c`): `klaviyo-motor` (#1035)
   og `ewebinar-proeve` (#1036); `ewebinar-webhook` (#1034) bevist i drift af
   prøven 08:41. Migrationen `20260919230000` KØRT (08:25). Tilbage: en
   skrivning gennem motoren med `klaviyo_afveg` udfyldt.
2. **Lag 5** bygges efter `udkast-klaviyo-retur` mod `MaalingsInput`
   (`udkast-marketing-dom` §2). `$message → trin` skal måles mod et faktisk
   flow først.
3. **Første rigtige dom** onsdag 23/9 morgen: forventet «observation», ingen
   anbefaling, ingen ændring. Det er RIGTIGT — ikke en fejl.
4. **Lag 4** (agenten) — først når lag 5 giver tal, og kun gennem
   `maaForeslaas`.
5. **Efter-webinar-flowet** udvides fra to til fem mails i Klaviyo — som
   kladde via motoren, med betingelsen «har ikke ansøgt» (`Ansoegning sendt`
   som `profile-metric`, id `XWaVxK`).

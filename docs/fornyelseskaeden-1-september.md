# Fornyelseskæden — bogføring 1. september 2026

Beslutninger og fund fra opbygningen af fornyelseskæden 1. september
2026. Bygger oven på `docs/fornyelsesordningen.md` (27/8) og følger
samme regel: hver påstand er enten målt, eller mærket som ikke målt.
Begrundelserne står med, fordi det er dem der skal forsvare
beslutningerne når nogen om tre måneder spørger hvorfor.

## 1. Prisstigen

Listeprisen i dag er **50.000 kr. ekskl. moms**. Tre betalingsmodeller:

| model | beløb | bemærkning |
|---|---|---|
| fuld | 50.000 | ét træk |
| to rater | 25.000 × 2 = 50.000 | intet tillæg; trækkes ved start og efter 6 måneder |
| tolv rater | 4.375 × 12 = 52.500 | 5 % tillæg |

Fornyelse er **50 % af INDGANGSPRISEN** — ikke af listeprisen i dag, og
ikke af det senest betalte. Tre kohorter, målt på Monday 1/9:

| indgang | fornyelse | antal virksomheder |
|---|---|---|
| 30.000 | 15.000 | 4 |
| 40.000 | 20.000 | 22 |
| 50.000 | 25.000 | 7 |

Fordelingen dækker de 33 virksomheder. Fornyelser kan også betales i
rater, med samme regler som indgangen: 5 % tillæg på tolv rater, intet
tillæg på to.

## 2. Prisen som data — beslutningen der blokerede alt

Fornyelsesordningen §5.1 kaldte «indgangsprisen som data» det første af
fire led, og BACKLOG anbefalede et kohorte-felt frem for et beløb.

**Den anbefaling er trukket tilbage.** Begrundelse: Nordic By Hand fik
ekstraordinært lov at komme ind til 40.000 mens listeprisen var 50.000.
Et kohorte-felt kan ikke bære en individuel aftale — og havde vi udledt
prisen af kohorten, ville de være blevet faktureret forkert uden at
nogen opdagede det.

Valgt model, to kolonner på `companies`:

- **`indgangspris_oere`** — listeprisen virksomheden kom ind på.
- **`fornyelsespris_oere`** — normalt TOM; sættes kun ved en bevidst
  afvigelse fra 50 %-reglen.

Er afvigelsen tom, beregnes fornyelsen som 50 % af indgangsprisen. Er
den sat, vinder den.

Hvorfor gemme indgangsprisen frem for fornyelsesprisen? Fordi
fornyelsesmailen så kan sige «50 % af din oprindelige pris på 40.000
kr.», hvilket forklarer sig selv — og fordi indgangsprisen er et
historisk faktum der ikke ændrer sig.

Reglen er bekræftet af KJ AUTO: ind på 30.000 i 2025, fornyede i maj
2026 til 15.000, mens listeprisen var 50.000. **Prisen følger aftalen,
ikke datoen.**

## 3. Perioder som rækker, ikke som et felt

`company_perioder` er **append-only**. En fornyelse er en NY række —
aldrig en opdatering af den gamle.

Beviset for hvorfor: BRILLEVÆRK og Capture IT har begge fornyet, og
`contract_start_date` blev aldrig flyttet. BRILLEVÆRK står 2025-08-20 →
2027-08-20 — **to år i ét felt**. Historikken var væk.

`companies.contract_end_date` forbliver kanonisk for
`computeMembershipTier` og må ikke erstattes; perioderne er historikken
ved siden af, ikke en ny kilde til adgang.

Rådgivere har SELECT og INSERT — hverken UPDATE eller DELETE. Tabellens
formål er at være det sted der ikke kan overskrives.

Historiske perioder er **bevidst ikke backfillet**: beløbet afhænger af
betalingsmodellen, og Mondays felter modsiger hinanden for mindst én
virksomhed — Din økonomiafdeling står til 40.000 samtidig med
«12 × 4375» = 52.500. Perioderne starter ved første rigtige fornyelse.

## 4. Kontrakten løber fra betalingsdatoen

Ikke fra underskriften. Aftalegrundlaget giver 30 dages frist til at
komme i gang efter underskrift, så de to datoer kan ligge en måned fra
hinanden.

Konsekvens: virksomheden skal oprettes i platformen ved **betaling**,
ikke ved underskrift — og invitationen sendes derfra.

Begrundelsen kommer fra drift, ikke fra princip: fem betalende
medlemmer havde ingen række i `companies` overhovedet (Pro-Vision,
E-skilte, Wesdex, Din økonomiafdeling, Two socks). De havde betalt for
et år uden at få adgang, og ingen opdagede det — fordi et medlem der
ikke findes, heller ikke mangler noget.

**Ændret 7/9 for FORNYELSER (§15.3):** betales en fornyelse FØR eller PÅ
slutdatoen, løber den nye periode fra den GAMLE slutdato, ikke fra
betalingsdagen — ellers ville den der handler tidligt miste dage.
Betales den efter, gælder det ovenstående uændret. Indgangen er ikke
rørt: dér findes ingen gammel slutdato at regne fra.

## 5. Fjortendagesvinduet er en rådgivertilstand, ikke en betalingsspærre

Besluttet 1/9: **en sen betaling tages imod, også efter 30 dage.**

De fjorten dage handler om rådgivernes eget arbejde med at få medlemmet
forlænget — mails og opfølgning — ikke om hvornår kassen lukker.

Konsekvens: tilbudslinket udløber ikke. Og derfor må prisen ikke ligge
i linket: checkout oprettes serverside og slår virksomhedens gemte pris
op, så et videresendt link ikke kan give en anden kohortes pris.

**Ændret 7/9 (§14):** vinduet ER nu også en betalingsspærre. Fra dag 15
efter slutdato er tilstanden `udloebet_vindue_lukket`, og både
`hent-fornyelsestilbud` og `opret-fornyelse-checkout` kræver
`udloebet_tilbyd` — gaten viser intet tilbud, og checkout svarer 403.
Det der står ovenfor om at prisen ikke må ligge i linket, gælder stadig.
En sen betaling efter dag 14 er fra 7/9 en menneskelig samtale, ikke en
knap.

**Ændret 7/9 eftermiddag (§15.3): betaling FØR slutdatoen tages imod.**
Beslutningen fra 1/9 — «fornyelse betales EFTER udløb, ikke før» — er
ophævet af Jonas 7/9. Fra `klar_til_tilbud` og gennem hele tilbudsvinduet
kan der betales; kun `udloebet_vindue_lukket` og alt uden `tilbyd`
afvises. Vinduet er stadig en betalingsspærre i den ENE ende (dag 15
efter), ikke længere i den anden.

## 6. Beslutningen forlader aldrig serveren

`company_fornyelse` er advisor-only i RLS. Edge-funktionen
`hent-fornyelsestilbud` afgør serverside og returnerer enten
`{ tilbud: null }` eller prismulighederne. `tilbyd_ikke`, «ingen
beslutning» og — fra 7/9 — et lukket tilbudsvindue giver
**byte-identisk svar** — grupperne kan ikke skelnes, heller ikke af den
der ser på netværkstrafikken. Fra 7/9 kalder funktionen MOTOREN
(`afgoerFornyelsestilstand`) og giver kun tilbud ved `udloebet_tilbyd`;
før tjekkede den selv tier og beslutning (§14).

Fladen (`MembershipExpiredGate`) har bevidst **ingen
indlæsningstilstand**: en pladsholder der foldede ud for den ene gruppe
og kollapsede for den anden, ville lække dommen i selve overgangen.
Udgangstilstanden er kortet uden tilbud, og kun et faktisk tilbud
erstatter det.

Teksten uden tilbud lover intet: «Vil du fortsætte? Skriv til os, så
tager vi en snak om mulighederne.» Den gamle tekst («Skriv til os, så
vender vi tilbage med dit tilbud») lovede et tilbud til folk der aldrig
ville få et.

## 7. Stripe-kataloget

Ny konto **`acct_1U6mzp3CvBmCx5Pt`**, jeres egen. Den gamle
Topix.dk-konto er en connected account under Circle med **0,5 %
application fee på hver betaling** — dens `controller.type` er
`application`, mod `account` på den nye.

Kataloget: tre produkter, fjorten priser, alle DKK og alle
`tax_behavior: exclusive` (feltet kan ikke ændres efter oprettelse).
Medlemskabsproduktet er `prod_VBBXP0VYDpEtek` med tolv priser, og
opslag sker via **`lookup_key`** frem for hardkodede price-id'er —
netop den fejl der findes to steder i den gamle kode.

To beslutninger i opsætningen der skal forstås, ikke bare kendes:

- **Fuldbetaling er engangs, ikke årligt tilbagevendende.** Et
  automatisk fornyende abonnement ville forny uden at nogen havde
  besluttet at tilbyde det — i strid med ordningens §1, hvor
  kommunikation og fornyelse kun sker ved en eksplicit «tilbyd».
- **Ophør efter 2 eller 12 træk ligger IKKE i prisen.** Det sættes med
  `cancel_at` på abonnementet. Uden det trækker tolv-raters-modellen
  for evigt. Det er den farligste enkeltdetalje i opsætningen og skal
  have en test.

  **Stedet er vigtigt:** `cancel_at` kan IKKE sættes fra Checkout —
  `subscription_data[cancel_at]` findes ikke som parameter, og Stripe
  afviser den med `parameter_unknown` (målt i produktion 1/9). Ophøret
  sættes i stedet af `stripe-webhook` på det oprettede abonnement, ud
  fra abonnementets faktiske `start_date`.

  Regnestykket: rate12 trækker i måned 0–11, rate2 i måned 0 og 6, og
  næste træk ville i begge tilfælde falde i måned 12. `cancel_at` =
  start + 12 måneder MINUS 1 dag rammer efter sidste aftalte træk og
  før det næste. En tidligere version brugte PLUS 1 dag — den ville
  have givet rate12 et trettende træk.

  **Rettelse 7/9 — og den hører sammen med fejlen ovenfor.** Da
  betaling før slutdatoen blev bygget (§15.3), påstod jeg (Claude) at
  `sikrOphoerPaaFornyelsesAbonnement` ville lade det sidste rate-træk
  falde bort, når kontrakten nu regnes fra den gamle slutdato, og
  foreslog `cancel_at = periode_slut − 1 dag`. **Det var forkert, og
  målingen viser hvorfor:** tolv rater betalt 8/9-2026 falder 8/9, 8/10
  … 8/8-2027. Sidste træk er 8/8; `cancel_at` 7/9-2027 (start + 12
  måneder − 1 dag) ligger en måned efter. Alle tolv trækkes. **Min
  rettelse ville have kostet medlemmet penge:** med `cancel_at` =
  28/9-2027 ville Stripe trække et TRETTENDE træk 8/9. For to rater et
  tredje træk på 25.000 kr. — præcis den fejl afsnittet ovenfor
  beskriver, med minus én dag i stedet for plus.

  **Fejlen i tænkningen:** abonnementet måler ikke adgang. Det er
  betalingsplanen for prisen; adgangen bæres af `contract_end_date`
  alene, og fornyelsesabonnementer rører aldrig `subscription_status`
  (§11). To ure, to forskellige ting. Den eneste betingelse de skal
  overholde, er at alle aftalte træk falder før ophøret — og det gør de,
  fordi `cancel_at` regnes fra abonnementets `start_date`, som er
  betalingsdagen, uanset hvad kontrakten regnes fra.

  **Konsekvens, som ikke er en fejl:** for en der betaler tidligt,
  ophører abonnementet nogle uger FØR kontrakten udløber (betalt 8/9 mod
  slutdato 29/9: abonnementet ophører 7/9-2027, kontrakten 29/9-2027).
  Det ser forkert ud for den der kigger i Stripe uden at kende
  forskellen. Ret det ikke. Mangellisten bærer kortet, så ingen gør det
  i god tro.

## 8. Migrationen af de eksisterende — besluttet 1/9

**Alle atten aktive abonnementer flyttes til den nye konto**, frem for
at lade dem dræne naturligt frem til juni 2027. Begrundelse: Circles
0,5 % application fee stopper med det samme, og alle betalende
medlemmer samles under ét katalog med `company_id` i metadata —
overblikket findes i dag hverken i Stripe eller i platformen.

Ét af de atten står **`past_due` lige nu** (`sub_1TRWKT…`, på
4.375/md., periode 25/8–25/9) og skal ryddes før det flyttes — en
restance kan ikke migreres, den skal betales eller afskrives først.

Juridisk er der intet at flytte: samme selskab, samme CVR, samme
ydelse, samme pris. Kunden skifter ikke leverandør. Det regulerede er
kortdata, og Stripes selvbetjente kopiproces er PCI-compliant netop
derfor.

**Vejen** — Stripes dokumenterede proces, ikke en konstruktion:

1. **Kundekopi.** Customers → «Copy customers» fra Topix.dk til
   `acct_1U6mzp3CvBmCx5Pt`; modtageren godkender. Card-, Source-,
   PaymentMethod- og SEPA-objekter kopieres. Kunde-id'erne BEVARES;
   betalingsmiddel-id'erne ændres, og en CSV med `source_id_old` →
   `source_id_new` lander i modtagerens Documents.
2. **Abonnementer kopieres aldrig.** De genskabes på den nye konto med
   korrekt `billing_cycle_anchor` og `cancel_at`.
3. **De gamle annulleres FØRST derefter** — og før de trækker igen.
   Rækkefølgen er Stripes egen anvisning; det modsatte dobbeltopkræver.

**Rækkefølgen** — besluttet, og den er ikke til forhandling af hensyn
til medlemmerne:

a. **Cutoveren først:** nøgle, checkout og webhook peger på den nye
   konto, så der findes én vej ind, og den er prøvet.
b. **Én virksomhed flyttes som pilot** — den med længst tid til næste
   træk, så der er plads til at opdage noget.
c. **Bevis i drift, ikke antagelse:** trækket gennemføres, webhooken
   fyrer, perioden skrives, kontrakten forlænges. Alle fire målt.
d. **Derefter resten i portioner** — aldrig alle på én dag.

**Det der ikke kan garanteres på forhånd:** et kopieret kort kan kræve
fornyet SCA-godkendelse ved første off-session-træk. Det afgøres af
kortudstederen, ikke af Stripe, og kan kun måles ved at gennemføre ét
træk — det er hele grunden til at piloten kommer før de sytten andre.

**Forudsætning der skal løses før flytningen:** tretten af de atten
kører på 3.500/md., som er en lukket kohortes pris og IKKE findes i det
nye katalog. Enten oprettes en pris til dem, eller de flyttes først ved
fornyelse. Beslutningen udestår og skal træffes før trin b.

**Åbent spørgsmål, ikke målt:** abonnementerne bærer
`community_member_id` og er oprettet af Circles paywall. Annullering
kan fjerne medlemmets adgang til Circles community. Konsekvensen
afhænger af hvor langt Circle-exit'en er, og det er ikke undersøgt.

## 9. Restance

Adgangen bindes til Stripes egen tilstand, ikke til en tæller vi selv
fører:

- **`past_due`** — åben adgang, mens Stripe genforsøger i ca. tre uger.
- **`unpaid`** — adgang lukket; abonnementet lever videre og kan
  genoplives ved betaling.

Stripe skal sættes til at ende i `unpaid`, **ikke** `canceled`.

Kræver ændring i `computeMembershipTier`, som findes fire steder
(TypeScript, Deno, SQL og fornyelsesmotoren) og skal ændres samlet —
dommen skal stå ét sted. **Ikke bygget endnu.**

## 10. Åbne punkter

Status pr. punkt målt 6/9 i koden (`~/Downloads/recon-fornyelsen-10-september.md`,
uden for repoet); det målte står i kursiv efter hvert punkt. Løste
punkter står som løst, ikke slettet. De nye åbne punkter fra 6/9 står
nederst i listen; detaljen bag dem i §13.

- **Prisen for 3.500-kohorten:** oprettes i det nye katalog, eller
  flyttes de tretten først ved fornyelse. Blokerer migrationens trin b.
  *6/9: ikke afgørligt i repoet. Fornyelseskataloget kender 15.000,
  20.000 og 25.000 (`fornyelsespris.ts:28`); «3.500» findes kun som
  kommentar i indgangsprisen (40.000 i tolv rater). Webhooken kender en
  art «migreret» fra piloten 2/9. Beslutningen står i Stripe og
  `company_traek`, ikke i koden.*
- **Circles adgangskobling** ved annullering af et abonnement: ikke
  målt. *6/9: stadig ikke målt; intet i koden rører Circle.*
- **Nordic By Hand skal importeres** — startede 1/9, ingen
  platformrække. *6/9: ikke afgjort i denne måling (kræver prod:
  `select … from companies where name ilike '%nordic%'`).*
- **Checkout-sidens tekst ved rater:** Stripes standardtekst siger
  «indtil du opsiger» og «faktureres månedligt», men abonnementet
  stopper faktisk af sig selv efter tolv træk. Produktbeskrivelsen bør
  sige det tydeligere. *6/9: åbent — `opret-fornyelse-checkout` sender
  hverken `custom_text` eller beskrivelse; teksten bor i Stripe.*
- **LØST 6/9 (#667) — `handleSubscribe` i `MembershipExpiredGate`**
  viste `err.message` direkte til medlemmet. Nu ordret samme neutrale
  besked som `handleFornyelse` («Noget gik galt — skriv til os, så
  hjælper vi dig videre.»), i samme form; fejlen logges med
  `console.error`.
- **LØST 1/9 (#492) — Hjemmebane-konvertering** af
  `MembershipExpiredGate`. *Målt 6/9: `hjemmebane.css`, `HbCard`,
  `HbButton`, `theme-hjemmebane` på roden.*
- **LØST 2/9 (#515, #529) — betalingslink til nye medlemmer,** så
  Circles paywall er ude af indgangen. *Målt 6/9: `/betal` i `App.tsx`,
  `opret-indgangs-checkout`, `company_betalingslink`, indgangsgrenen i
  webhooken. Se `docs/indgangen-design.md`.*
- **`create-subscription-checkout`:** adgangstjekket er rettet og læst
  linje for linje, men ikke bevist i drift — det kræver et
  medlems-token. *6/9: stadig ubevist. Et kald uden nøgle giver 401
  (§13.5), men det beviser kun at funktionen findes, ikke at
  RLS-tjekket på `company_id` holder.*
- **Den gamle Topix.dk-konto har et forfaldent krav:**
  `person_1Qd8NC…verification.proof_of_liveness`. Det er kontoen med de
  atten betalende abonnementer. *6/9: ikke i koden; afgøres i Stripe.*
- **e-conomic-kobling:** eget spor efter fornyelseskæden.
  Fallback-fakturaer skal gå gennem Stripe Invoicing, ikke uden om
  Stripe — ellers fyrer webhooken ikke, og kontrakten forlænges ikke.
  *6/9: åbent; intet i koden ud over regnskabsparseren.*

**Nye åbne punkter, målt 6/9 (§13 bærer detaljen):**

- **Ordningen har ingen afsender.** Ingen mail, ingen skabelon, ingen
  cron, ingen kode bag §1's «brief før slutdato». Medlemmet hører først
  om sin fornyelse ved at miste adgangen (§13.1). Retningen er besluttet
  6/9 — `docs/fornyelsesordningen.md` §7.
- **Datogaten omgås stadig på tilbuds- og checkout-vejen** (§13.3).
  *7/9: `hent-fornyelsestilbud` kalder nu motoren, men udløbsgrenen
  afgøres FØR datogaten, så `uden_for_ordningen` håndhæves stadig ikke
  hvor pengene skifter hænder.* Værnet er et menneske. Om gaten skal
  gælde dér, er en beslutning.
- **LØST 7/9 (#678) — Fjortendagesvinduet som tilstand:**
  `udloebet_vindue_lukket`, kun efter `tilbyd`, fra dag 15. Bevist i
  drift samme formiddag (§14).
- **LØST 7/9 (#674) — varselsstempler på `company_fornyelse`:**
  `varsel_1_sendt_at`, `varsel_2_sendt_at` (§14).
- **Studio Minis `tilbyd`-række:** vinduet findes nu. Studio Mini (slut
  5/9) er 7/9 dag 2 i vinduet; fra 20/9 lukker det af sig selv, og
  rækken bliver `udloebet_vindue_lukket` uden at nogen rører den.
  Beslutningen er om den skal ryddes FØR (§13.4).
- **Afsenderen mangler stadig — delvist løst 7/9 eftermiddag:**
  varselsmotoren (#680) og cron-rapporten (#681) findes og er tørkørt på
  rigtige data (§15.1–15.2). Det der mangler: mailene selv,
  rådgivernotifikationen, stemplingen i cron'en og planlægningen af
  jobbet. Det er næste stykke.
- **Et ikke-udløbet medlem kan betale, men kan ikke SE tilbuddet**
  (nyt 7/9, §15.3): betalingsvejen er åben fra `klar_til_tilbud`, men
  gaten vises kun ved `expired`, og ingen anden flade viser fornyelsen
  til et medlem. Designbeslutning, ikke truffet.
- **To virksomheder uden slutdato** rammer aldrig ordningen, og
  **Bastant Design** har ingen indgangspris (§13.4).

## 11. Fornyelses-abonnementer rører ikke subscription_status

Alle tre subscription-lifecycle-grene i `stripe-webhook` (`created`,
`updated`, `deleted`) springer over når `sub.metadata.art ===
"fornyelse"`.

Begrundelse: `subscription_status` på `companies` er forbeholdt
exit-abonnementet. En ratebetalt fornyelse ville ellers få virksomheden
til at fremstå som selvbetjenende abonnent (tier «subscriber» i stedet
for fuldt medlem) — og et fornyelses-abonnement der rammer sit
`cancel_at` efter tolv træk, ville skrive «cancelled» på en virksomhed
der lige har haft et normalt medlemsår. Adgangen ved fornyelse bæres af
`contract_end_date`, ikke af abonnementsfeltet.

## 12. Kæden er bevist i produktion 1/9

Testen kørte på testvirksomheden «Jonas legat» med indgangspris 30.000,
fornyelse 15.000, betalt i tolv rater. Gennemført betaling på 1.640,63
kr. (1.312,50 + moms), refunderet bagefter.

Målt serverside:

- `company_perioder`: 2026-09-01 → 2027-09-01, `beloeb_oere` 1575000 —
  den samlede sum INKLUSIVE 5 %-tillægget, ikke grundbeløbet — rate12,
  fornyelse, med checkout-sessionens id som `stripe_reference`.
- `companies.contract_end_date` rykket til 2027-09-01.
- Abonnementets `cancel_at` sat 364 dage efter `start_date`, 23
  sekunder efter oprettelsen — altså af webhooken.
- `companies.subscription_status` forblev NULL gennem hele
  livscyklussen, også efter annulleringen.

Al testdata er rullet tilbage, verificeret: nul perioder, nul
beslutninger, slutdato og indgangspris NULL, legat-status genoprettet.

## 13. Målt 6/9 — kæden mod ikrafttrædelsen

Recon `~/Downloads/recon-fornyelsen-10-september.md` (uden for repoet —
genskabes hvis den bruges), kørt på `main` `b669ce5c` med de fire
fornyelsestestfiler grønne (60 tests) og motoren spejlet identisk i
`src/lib` og `_shared`. Prod-målingerne er Jonas' i SQL editor og
Stripe-MCP samme aften. Fire ting der skal kendes før 10/9, og en
kalender.

### 13.1 Ordningen har ingen afsender

Ingen mail, ingen skabelon, ingen cron, ingen kode bag §1's «brief før
slutdato». Grep på «fornyels» i `supabase/functions/` rammer motoren,
prisen, de to fornyelsesfunktioner, indgangen og webhooken — ingen af
dem sender mail; `email-templates/`, `send-notification-email`,
`notificationWriter` og `templateRegistry` har nul træffere. Kæden er
to menneskelige klik (rådgiverens «Tilbyd» i `FornyelsesSektion`,
medlemmets valg i `MembershipExpiredGate`) og ét Stripe-event
(`checkout.session.completed` med `metadata.art = "fornyelse"`).

Konsekvens: medlemmet hører først om sin fornyelse ved at MISTE
adgangen og selv opdage tilbuddet i gaten. `klar_til_tilbud` har hverken
flade eller mail — i vinduet op til slutdatoen er tier `full`, og
medlemmet er på den normale forside. Retningen er besluttet 6/9:
`docs/fornyelsesordningen.md` §7.

### 13.2 10/9 er ikke en tændingsdato

`FORNYELSE_IKRAFT_DATO = "2026-09-10"` findes to steder
(`src/lib/fornyelse.ts:37`, `_shared/fornyelse.ts:40`) og bruges i én
gate (`slutdag <= FORNYELSE_IKRAFT_DATO` → `uden_for_ordningen`). Den
sammenlignes med virksomhedens `contract_end_date`, ikke med dags dato,
og står EFTER udløbsgrenen. Intet i koden kører den dag: ingen cron,
ingen migration, ingen function læser datoen.

- Før 10/9: en aktiv virksomhed med slutdato ≤ 10/9 er allerede
  `uden_for_ordningen` i dag.
- 10/9 kl. 00:00 UTC: en virksomhed med slutdato præcis 10/9 bliver
  `expired` (`computeMembershipTier`: en ren datostreng parses som
  UTC-midnat) og rammer udløbsgrenen — datogaten nås ikke.
- Efter 10/9 kan ingen aktiv virksomhed have slutdato ≤ 10/9, så
  konstanten bliver virkningsløs.

### 13.3 Datogaten omgås hvor pengene skifter hænder

`hent-fornyelsestilbud` kalder ikke motoren — den tjekker kun tier
`expired` og `beslutning = 'tilbyd'` (linje 100–114).
`opret-fornyelse-checkout` kalder motoren, men kræver `udloebet_tilbyd`
(linje 108–116), som afgøres i udløbsgrenen FØR datogaten. En udløbet
virksomhed med slutdato før 10/9 og beslutning `tilbyd` får derfor et
fuldt systemtilbud og kan betale. Datogaten virker altså kun på
rådgiverens side (visningen «uden for ordningen» i `FornyelsesSektion`);
værnet mod at give et systemtilbud til én uden for ordningen er
rådgiverens finger, ikke koden. Om gaten SKAL gælde på tilbuds- og
checkout-vejen, er ikke besluttet.

*7/9:* `hent-fornyelsestilbud` kalder nu motoren (§14), så den første
halvdel af fundet er ændret — men rækkefølgen af grenene er den samme:
udløbsgrenen først, datogaten efter. En udløbet virksomhed med slutdato
før 10/9 og beslutning `tilbyd` får stadig et systemtilbud, nu i 14
dage. Punktet er ÅBENT, ikke lukket.

### 13.4 Fornyelseskalenderen, målt i prod 6/9

Fem beslutninger i alt:

| virksomhed | slutdato | beslutning | fornyelsespris |
|---|---|---|---|
| LineAlmegaard | 1/9 (tidligere) | tilbyd_ikke | 20.000 |
| Studio Mini | 5/9 | tilbyd | 20.000 |
| CARMA STUDIO | 7/9 | tilbyd | 20.000 |
| PHILBERT | 29/9 | tilbyd | 20.000 |
| Doggybed | 13/10 | tilbyd_ikke | 20.000 |

Alle fem har gyldig fornyelsespris — ingen får et tomt tilbudskort. 25
af 30 aktive har INGEN beslutning.

**Tempoet:** efter Doggybed 13/10 er der ingen fornyelse før Livja 16/12
— to måneders hul. Derefter fjorten virksomheder mellem marts og juni
2027, over halvdelen af porteføljen. Den reelle deadline for en mailkæde
er derfor midten af november (Livja minus 30 dage), ikke 10/9.

**Uden for kalenderen:** Alexander Lunds virksomhed og Martin Larsens
virksomhed har ingen slutdato og rammer aldrig ordningen
(`ingen_slutdato`). Bastant Design (31/12-2027) har ingen indgangspris,
så fornyelsesprisen er ukendt — et `tilbyd` dér giver `{ tilbud: null }`
og en `console.error`.

**Besluttet 6/9 (Jonas):** Studio Mini FORLÆNGER IKKE. Deres
`tilbyd`-række skal ryddes — men først når fjortendagesvinduet findes
som tilstand, så data siger det der er sandt. CARMA STUDIO håndteres
manuelt i dialog.

*7/9:* vinduet findes (§14). Studio Mini er dag 2 i det; fra 20/9 bliver
rækken `udloebet_vindue_lukket` af sig selv. Indtil da viser gaten dem
et tilbud på 20.000 kr., hvis de logger ind. Om rækken skal ryddes FØR,
er beslutningen der står.

### 13.5 Kædens forudsætninger — alle grønne, målt 6/9

- **Prod-databasen:** alle fire tabeller (`company_fornyelse`,
  `company_perioder`, `company_betalingslink`, `company_traek`) og alle
  tre kolonner (`indgangspris_oere`, `fornyelsespris_oere`,
  `sidste_checkout_session_id`) findes. De seks migrationer ER kørt —
  også `20260811120000` og `20260903150000`, hvis filhoveder ikke bar
  en kørt-note.
- **Stripe** (MCP, livemode, `acct_1U6mzp3CvBmCx5Pt`): alle NI
  fornyelsespriser findes, aktive, præcis én pr. `lookup_key`
  (`fornyelse_15000|20000|25000_fuld|rate2|rate12`), produkt
  `prod_VBBXP0VYDpEtek`, `tax_behavior exclusive`, rate12 med
  5 %-tillæg. Webhook `we_1UAtaW3CvBmCx5PtL736lAJN` er enabled med
  præcis de seks events koden håndterer.
- **Udrulning:** kald uden nøgle giver `hent-fornyelsestilbud` 401,
  `opret-fornyelse-checkout` 401, `create-subscription-checkout` 401,
  `stripe-webhook` 400. Alle fire er UDRULLET — men det beviser kun at
  de findes, ikke hvilken version; driftsbeviset fra 1/9 (§12) ligger
  før #529, #561, #563, #572 og #583.
- **`cron.job` i prod har TI jobs:** `agent-runs-opbevaring` 0 5,
  `cleanup-stale-processing-reports` \*/5, `daily-report-reminder` 0 9,
  `event-reminders` 0 7, `generate-weekly-focus` 0 6 \* \* 1,
  `indgangs-paamindelser` 0 10, `intro-session-reminder` 0 9,
  `opgave-udloeb` 0 4, `process-notification-emails` \*/5,
  `send-monthly-digest` 0 8 22 \* \*. INGEN fornyelses-job — og ingen
  `run-weekly-agent` (OVERLEVERING DEL 2 «Agentkæden»). Det lukker også
  et åbent punkt: `indgangs-paamindelser` STÅR aktivt.

## 14. Bygget 7/9 — tilbudsvinduet, stemplerne, beviset

Samme regel som resten af filen: målt eller mærket som ikke målt.

### 14.1 Tilbudsvinduet efter udløb som tilstand (#678)

Besluttet 27/8 (ordningens §3), bygget 7/9 som ÉN ny tilstand,
`udloebet_vindue_lukket`, KUN efter beslutningen `tilbyd`: `tilbyd_ikke`
har aldrig haft et tilbud og derfor intet vindue at lukke;
`udloebet_tilbyd_ikke` er uændret. Elleve statusser i alt.

Grænsen, i hele UTC-kalenderdage (`dage_til_udloeb` er negativ efter
slutdato): dag 0–14 efter slutdato → `dage_til_udloeb` 0…−14 →
`udloebet_tilbyd`; dag 15 og senere → ≤ −15 → `udloebet_vindue_lukket`.
Slutdato 1/10 giver sidste tilbudsdag 15/10, lukket 16/10. Konstanten
hedder `FORNYELSE_TILBUDSVINDUE_EFTER_UDLOEB_DAGE` (14) — bevidst ikke
til at forveksle med `FORNYELSES_VINDUE_DAGE` (60), som er rådgiverens
beslutningsvindue FØR udløb. Er `dage_til_udloeb` null (slutdatoen kan
ikke læses), bevares tilbuddet frem for at lukke på et tal vi ikke har.

**Rækkefølgen af grenene er urørt:** udløbsgrenen afgøres stadig FØR
datogaten. Derfor får en virksomhed med slutdato før 10/9 og beslutning
`tilbyd` stadig et tilbud de første 14 dage (§13.3, åbent).

**Alle seks aftagere er med.** De to `Record<FornyelseStatus, …>`
(`STATUS_VISNING` i `FornyelsesSektion`, `FORNYELSE_LABEL` i
`VirksomhedView`) — tsc fangede dem, det var hele pointen med at få
baselinen på nul og typecheck i CI samme morgen (OVERLEVERING DEL 1).
`SKJULTE_STATUSSER` — skjult som `ophoert`: ingen beslutning kan åbne
vinduet igen, så rækken kræver ingen opmærksomhed; historikken står i
`company_fornyelse`. `forsidensDom` — ingen grund: forsiden er
handlinger, ikke status. `hent-fornyelsestilbud` — kalder nu MOTOREN
frem for selv at tjekke tier og beslutning; kun `udloebet_tilbyd` giver
tilbud, alt andet giver `{ tilbud: null }` som hidtil. Tilbud og
betaling dømmer dermed på samme kilde; det lukker hullet «et tilbud der
aldrig udløber». `opret-fornyelse-checkout` — uændret; den krævede
allerede `udloebet_tilbyd` og afviser den nye tilstand med samme
neutrale 403. `MembershipExpiredGate` er IKKE rørt — hvad medlemmet ser
når vinduet er lukket, er næste PR; i dag er det kortet uden tilbud.

**Paritetstesten blev styrket FØRST (#677),** fordi den ellers var
blevet grøn uden at røre den nye gren: dens udløbs-cases lå 11 dage
efter slutdato, altså INDE i vinduet. Nu fejer den dag −100…+60 × tre
beslutninger × med/uden abonnement × to now-datoer, sammenligner
konstanterne mellem kopierne, og holder `ALLE_STATUSSER` som `Record`
over unionen — så tsc fejler den dag en status tilføjes uden case.

**Udrulning:** `hent-fornyelsestilbud` er udrullet eksplicit fra
`36204422` inkl. `_shared/fornyelse.ts` — den trak en NY delt fil ind,
og dem ruller merge ikke (OVERLEVERING DEL 0).

### 14.2 Bevist i drift 7/9 kl. 09:36–09:38

På Topix.dk ApS (`er_kunde = false` — ingen rigtig kunde blev rørt):

- Slutdato sat 10 dage tilbage, beslutning `tilbyd`, indgangspris
  40.000 → gaten viste tilbud på **20.000 kr. ekskl. moms** med alle tre
  betalingsmodeller; 12 rater à 1.750 kr., altså 5 %-tillægget fra
  `fornyelse_20000_rate12`.
- Slutdato flyttet til 15 dage tilbage → tilbudskortet FORSVANDT, og
  gaten faldt tilbage til «Vil du fortsætte? Skriv til os».

Grænsen holder fra begge sider. Topix rullet tilbage bagefter og målt:
`contract_end_date = 2030-04-20`, `indgangspris_oere = NULL`, ingen
fornyelsesrække; fem rækker i alt i `company_fornyelse` (§13.4's fem).

### 14.3 Varselsstemplerne på `company_fornyelse` (#674)

Kørt i prod 7/9 kl. 08:51: `varsel_1_sendt_at` og `varsel_2_sendt_at`,
begge nullable, plus en eksplicit service-role-policy. To navngivne
kolonner frem for et dag-nummer som `company_betalingslink.
sidste_paamindelse_dag`, fordi de to varsler kan sendes uafhængigt: en
sen beslutning skal kunne give varsel 2 uden varsel 1. Tabellen har
INGEN trigger (målt), så skrivestien — også cron'en — skal selv sætte
`updated_at`.

Tallene bag stemplerne er besluttet 7/9 og står i ordningens §7: mail 1
dag 30 før, mail 2 dag 7 før, tilbud 14 dage efter; beslutningen skal
foreligge senest dag 30, ellers sendes intet. Afsenderen selv — mail,
skabelon, cron — findes ikke (§13.1). *7/9 eftermiddag: motoren og
cron-rapporten findes nu (§15); mailene ikke.*

## 15. Bygget 7/9 eftermiddag — varselsmotoren, cron-rapporten, betaling før slutdatoen

Samme regel: målt, eller mærket som ikke målt. Bogført efter #679.

### 15.1 Varselsmotoren (#680)

`afgoerForfaldentVarsel` i `src/lib/fornyelsesvarsel.ts` og
`_shared/fornyelsesvarsel.ts`, paritetstestet som de andre motorer.
Varsel 1 ved 30 dage før slutdato, varsel 2 ved 7 — tallene fra
ordningens §7.

**Den sene beslutning er reglen der betyder noget.** Træffes `tilbyd`
først fem dage før slutdato, er begge varsler forfaldne — og så sendes
KUN varsel 2. Varsel 1 sendes aldrig bagefter, fordi den anden mail ville
være forældet i samme øjeblik den blev sendt: «om 30 dage» er ikke sandt,
og medlemmet skal have den besked der passer til hvor de er nu. Det er
også derfor stemplerne er to kolonner (§14.3) og ikke et dag-nummer: et
dag-nummer kan ikke udtrykke «2 sendt, 1 aldrig».

Fail-closed på ulæselig slutdato: kan dagene ikke regnes, sendes intet.
Efter slutdatoen sendes intet: tilbuddet lever stadig 14 dage (§14.1),
men et varsel om noget der allerede er sket, er forkert.

### 15.2 Fornyelsesvarsel-cron (#681) — en ren rapport

Udrullet 7/9 kl. 08:15 UTC fra `f5c250d6`. Bucket B med
`authenticateServiceRole` bag `verify_jwt = true`, tørkørsel som
standard — samme form som `indgangs-paamindelser-cron`. I denne version
en REN RAPPORT: den finder kandidaterne og siger hvad motoren ville
sende; den sender intet og stempler intet. Cron-SQL'en står som
kommentar i filhovedet (slot `0 11 * * *` UTC = 13:00 dansk, ledigt),
men jobbet er IKKE planlagt: en cron der kører en rapport ingen læser,
er støj.

**Tørkørslen 7/9 kl. 10:15, på rigtige data:** fundet 3, ingen fejl.

| virksomhed | udfald | dage til slutdato | grund |
|---|---|---|---|
| PHILBERT | varsel 1 | 22 | — |
| CARMA STUDIO | varsel 2 | 0 | «varsel 1 springes over: sen beslutning» |
| Studio Mini | intet | passeret | slutdatoen er passeret |

Den sene beslutning virkede i drift, første gang, på rigtige data.

**Besluttet af Jonas 7/9: ingen nedre grænse for varsel 2.** Dag 0 er en
påmindelse, ikke en advarsel, og det er dér man handler. CARMA får sin
påmindelse.

**Det der mangler før noget sendes:** mailene, rådgivernotifikationen
(ordningens §7), stemplingen i cron'en (KUN når afsendelsen lykkedes,
som indgangen), og planlægningen af jobbet.

### 15.3 Betaling FØR slutdatoen (#683 motoren, #684 pengevejen)

Udrullet 7/9 kl. 08:53 UTC fra `85a0753e` — alle tre funktioner
(`hent-fornyelsestilbud`, `opret-fornyelse-checkout`, `stripe-webhook`),
webhooken med den NYE delte fil `_shared/fornyelsesperiode.ts` (og dem
ruller merge ikke — OVERLEVERING DEL 0).

**Før i dag** kunne et medlem på dag 22 hverken se eller betale sit
tilbud: checkout svarede 403 (krævede `udloebet_tilbyd`),
`hent-fornyelsestilbud` gav `null`, og gaten vises kun for udløbne. Vi
fortalte dem det en måned før og bad dem vente på at blive lukket ude.
Det var beslutningen fra 1/9 (§5, ordningens §1) — ophævet af Jonas 7/9.

**Regnestykket, som skal stå ordret** (`beregnFornyelsesperiode`,
spejlet i begge kopier, paritetstestet):

- Betalt FØR eller PÅ slutdatoen (`foer_udloeb`): ny slutdato = GAMMEL
  SLUTDATO + 12 måneder. Gammel 2026-09-29, betalt 2026-09-07 → ny
  2027-09-29. Den der handler tidligt må ikke miste dage.
- Betalt EFTER slutdatoen (`efter_udloeb`): ny slutdato = BETALINGSDAGEN
  + 12 måneder — som §4 altid har sagt. Gammel 2026-09-29, betalt
  2026-10-05 → ny 2027-10-05. Dagene uden adgang gives ikke tilbage; de
  var ikke medlemmer i dem.
- Grænsen er «før eller på» når betalingsdagen ≤ slutdatoen, i hele
  UTC-kalenderdage — samme dagbegreb som resten af huset. Kontinuert,
  målt: 28/9 og 29/9 giver begge 2027-09-29; 30/9 giver 2027-09-30.

**`periode_start` er udledt, ikke valgt.** Begge eksisterende skrivere
(fornyelsesgrenen og `beregnIndgangsPeriode`) holder invarianten
`periode_slut = periode_start + 12 måneder`, og `company_perioder` er
append-only historik med CHECK `slut > start` (§3). Med ny slutdato =
gammel + 12 er den eneste `periode_start` der bevarer invarianten den
GAMLE slutdato: den nye periode begynder hvor den gamle slutter, uden
overlap og uden hul (slutdatoen er eksklusiv). I efter-grenen er
`periode_start` betalingsdagen, som før.

**29. februar er nu en synlig gren.** Reconen 7/9 fandt at
`setUTCMonth(+12)` rullede 29/2 tavst til 1/3, og at ingen kode
håndterede det. Reglen er skrevet ud og låst med test: «12 måneder frem»
er samme kalenderdag året efter; findes dagen ikke, er slutdatoen 1/3
året efter, fordi slutdatoen er eksklusiv og 28/2 ville give én dag
mindre end et kalenderår. Samme resultat som JavaScripts rul — nu en
gren i koden, ikke Date-objektets adfærd.

**`cancel_at` er IKKE ændret — og skal ikke ændres.** Jeg foreslog det
og tog fejl; rettelsen står i §7, hvor den tidligere cancel_at-fejl
allerede er dokumenteret.

**ÅBENT — designbeslutning:** et ikke-udløbet medlem har intet sted at
SE tilbuddet. Gaten vises kun ved `expired`, og ingen anden flade viser
fornyelsen til et medlem (målt 7/9). Betalingsvejen er åben fra dag 60,
men den eneste vej til checkout er gaten. Ikke truffet.

---

# Rettelse 1/9 — indgangsprisens kilde

## Hvad der stod forkert

Afsnit 2 beskriver backfill'en som «indgangspris = fornyelsespris × 2».
Tallene er rigtige, men **metoden er ikke en kilde og må ikke gentages.**

`Pris på forlængelse` på Monday er en midlertidig kolonne, der forsvinder
når platformen overtager fornyelsen. At udlede indgangsprisen af den er
at regne årsagen ud af virkningen — og det holder kun så længe
50 %-reglen aldrig fraviges. Nordic By Hand er allerede undtagelsen (ind
til 40.000 ved en bevidst beslutning); det var tilfældigt at deres
fornyelse på 20.000 gav det rigtige tal tilbage.

Backfill'en af de 33 var en ENGANGSREKONSTRUKTION af historiske data,
foretaget fordi indgangsprisen ikke fandtes nogen steder. Den er
afsluttet.

## Hvor indgangsprisen kommer fra fremover

**Fra betalingen.** Når et nyt medlem betaler, kender systemet præcis
hvilken pris de valgte, og grundbeløbet står i prisens metadata:

| lookup_key | `metadata.grundbeloeb` | `indgangspris_oere` |
|---|---|---|
| `nyt_50000_fuld` / `_rate2` / `_rate12` | 50000 | 5000000 |
| `nyt_40000_fuld` / `_rate2` / `_rate12` | 40000 | 4000000 |

Webhooken skal skrive feltet ved indgangsbetalingen. **Den gren findes
ikke endnu** — fornyelsesgrenen rører ikke indgangsprisen, fordi en
fornyelse ikke ændrer den. Den hører til indgangens kæde, se
`docs/indgangen-design.md`.

## Reglen der ikke må glemmes

`indgangspris_oere` er **listeprisen**, ikke det betalte beløb.
Ratetillægget på 5 % er finansiering, ikke pris. En der betaler 52.500 i
tolv rater er kommet ind på 50.000 og fornyer til 25.000 — ikke 26.250.

## Indtil grenen er bygget

Nye medlemmers indgangspris sættes i hånden, ud fra hvilken pris de
betalte — ALDRIG ud fra Monday-kolonnen. Er der givet en specialpris,
er det den aftalte listepris der skal stå, ikke summen af raterne.

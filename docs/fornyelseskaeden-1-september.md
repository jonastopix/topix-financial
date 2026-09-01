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

## 5. Fjortendagesvinduet er en rådgivertilstand, ikke en betalingsspærre

Besluttet 1/9: **en sen betaling tages imod, også efter 30 dage.**

De fjorten dage handler om rådgivernes eget arbejde med at få medlemmet
forlænget — mails og opfølgning — ikke om hvornår kassen lukker.

Konsekvens: tilbudslinket udløber ikke. Og derfor må prisen ikke ligge
i linket: checkout oprettes serverside og slår virksomhedens gemte pris
op, så et videresendt link ikke kan give en anden kohortes pris.

## 6. Beslutningen forlader aldrig serveren

`company_fornyelse` er advisor-only i RLS. Edge-funktionen
`hent-fornyelsestilbud` afgør serverside og returnerer enten
`{ tilbud: null }` eller prismulighederne. `tilbyd_ikke` og «ingen
beslutning» giver **byte-identisk svar** — de to grupper kan ikke
skelnes, heller ikke af den der ser på netværkstrafikken.

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

- **Prisen for 3.500-kohorten:** oprettes i det nye katalog, eller
  flyttes de tretten først ved fornyelse. Blokerer migrationens trin b.
- **Circles adgangskobling** ved annullering af et abonnement: ikke
  målt.
- **Nordic By Hand skal importeres** — startede 1/9, ingen
  platformrække.
- **Checkout-sidens tekst ved rater:** Stripes standardtekst siger
  «indtil du opsiger» og «faktureres månedligt», men abonnementet
  stopper faktisk af sig selv efter tolv træk. Produktbeskrivelsen bør
  sige det tydeligere.
- **`handleSubscribe` i `MembershipExpiredGate`** viser `err.message`
  direkte til medlemmet — en teknisk fejlbesked på den side hvor nogen
  lige har mistet sin adgang. Bør erstattes af en menneskelig besked,
  som `handleFornyelse` allerede gør.
- **Hjemmebane-konvertering** af `MembershipExpiredGate`.
- **Betalingslink til nye medlemmer,** så Circles paywall er ude af
  indgangen.
- **`create-subscription-checkout`:** adgangstjekket er rettet og læst
  linje for linje, men ikke bevist i drift — det kræver et
  medlems-token.
- **Den gamle Topix.dk-konto har et forfaldent krav:**
  `person_1Qd8NC…verification.proof_of_liveness`. Det er kontoen med de
  atten betalende abonnementer.
- **e-conomic-kobling:** eget spor efter fornyelseskæden.
  Fallback-fakturaer skal gå gennem Stripe Invoicing, ikke uden om
  Stripe — ellers fyrer webhooken ikke, og kontrakten forlænges ikke.

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

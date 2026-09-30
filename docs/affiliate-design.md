# Anbefalingsprogrammet (affiliate) — designpapir

**Skrevet 30/9-2026 aften. DESIGN — ingen kode, ingen migration.** Anledning, Jonas 30/9
17:47 (ordret): «Jeg drømmer også om, at vi snart får bygget vores Affiliate program op på
platformen … Et program, med et stort upside for medlemmerne til at hverve nye medlemmer.
Selvfølgelig medlemmer der stadig skal igennem ansøgningsprocessen, så det ikke bliver en
åben dør, men hvor de får egne links til vi kan tracke fra ende til anden.»

Læst før skrivning: `CLAUDE.md` (ansøgningsmotoren, kilden, sporet før ansøgningen, Meta,
GA), `docs/tracking.md`, `docs/adgangsdomme.md`, `docs/fornyelsesordningen.md`,
`docs/agentarkitektur.md` §1.3, `docs/claude-regelsaet.md` §4a. Repo `origin/main` =
`3c27fa8a`. Målinger i prod er taget med `query_database` 30/9 kl. 19:03 (kun SELECT).
Står der «ikke målt», er det ikke målt. Skatte- og momsregler er **ikke** slået op. De er
markeret «SKAL SLÅS OP» og skal afklares med revisor, før der udbetales noget.

**Ordet.** I koden hedder kilden allerede `anbefaling`. Programmet kaldes derfor
**anbefalingsprogrammet**, den der deler linket **anbefaleren**, og den der ansøger **den
anbefalede**. «Affiliate» bruges kun her i titlen.

---

## 0. Værdivurdering (regelsæt §4a) — kort

- **Relevant?** Ja, som ny kanal. Men den er **ikke målt**: af 11 indsendte ansøgninger i
  prod har **0** kilden `anbefaling` (5 webinar, 5 andet, 1 direkte). Det siger intet om,
  hvor mange medlemmer der anbefaler mundtligt. Det siger kun, at intet link bærer ordet i dag.
- **Hvem får det bedre?** Medlemmet (belønning), Topix (billigere kunder end annoncer:
  Metas fire Lead-annoncesæt har brugt ~16.900 kr., `tracking.md` §4), og rådgiveren
  (kender vejen ind).
- **Hvad koster det?** Skive 1 (§7) er lille: to kolonner, én tabel, én ren dom, ét felt i
  formularen. Penge (skive 3–4) er dyrt i risiko og kræver revisor.
- **Dom:** skive 1 kan bygges og giver målingen. Skive 3+ lægges frem for Jonas, når
  skive 1 har vist, at linkene bliver brugt.

---

## 1. Hvad findes — og hvad mangler (målt i koden)

### 1.1 Det, programmet kan bygge på

| Byggesten | Hvor | Hvad den giver |
|---|---|---|
| Ordet `anbefaling` i kilden | `src/lib/ansoegning/skema.ts:84`, spejl `supabase/functions/_shared/ansoegningSkema.ts:73`. CHECK i `20260918200000_ansoegninger.sql` (oprindelig), senest `20260928140000_ansoegninger_kilde_nyhedsbrev.sql` | Kilden kan allerede SIGE «anbefaling». Der kræves ingen ny CHECK for selve kilden. |
| `afgoerKilde` | `skema.ts:674–696` | `?kilde=` vinder over `utm_source`, som vinder over referrer. `?kilde=anbefaling` giver i dag kilden «anbefaling» med `kilde_raa = "anbefaling"`. **Men HVEM der anbefalede, gemmes ingen steder.** |
| Kilden læses ÉN gang ved mount | `src/pages/Ansoeg.tsx:112–119` | Samme øjeblik som annoncesporet (`:121–128`), før `?t=` erstatter URL'en. Et henvisnings-id læses bedst her, på samme måde. |
| «opret» gemmer sporet på rækken | `supabase/functions/ansoegning-gem/index.ts:255–305` | Kilden, `kilde_raa`, `ip_hash` (INSERT `:283`) og annoncesporet (`gemAnnoncespor`, `:297`, fail-soft). **Serversiden, på ansøgningen: præcis dér, en henvisning skal bo.** |
| STRIKS body | `ansoegning-gem/index.ts:88` (`KENDTE_FELTER`) | Et nyt felt (fx `henvisning`) skal på listen, ellers 400. Det giver os beviset for udrulningen (samme mønster som `meta`, `tracking.md` §4). |
| Genoptagelse | `Ansoeg.tsx:147–` (`?t=` eller `localStorage`) | Kun tokenet ligger på enheden. Det er funktionelt, for ansøgeren beder selv om at fortsætte. Henvisningen står på rækken fra «opret», så en genoptaget kladde beholder den **uden** nogen cookie. |
| Sporet før ansøgningen | `20260928170000_ansoegning_visninger.sql`, `ansoegning-gem` «spor» (`:237–246`) | Kan måle «link åbnet → ansøgning startet» for henvisningslinks uden persondata. **Om migrationen er kørt i prod: ikke målt** (tracking.md §2 række 26 siger «UDKAST»). |
| Én åben ansøgning pr. mail | `ansoegninger_aaben_email_uidx` (`20260918200000:190–192`) | Den samme person kan ikke have to åbne ansøgninger. Det lukker én slags snyd (to henvisere til samme ansøger via to kladder) ved indsendelse. |
| Motoren og trinnene | `_shared/ansoegningMotor.ts:683` (`udfoerOvergang`), trin ny → … → underskrevet | Henvisningens status kan UDLEDES af trinnet. Den skal ikke gemmes to steder. |
| Samme id ved underskrift | `konverterTilVirksomhed`, `ansoegningMotor.ts:811–845` | `companies.id = ansoegninger.id`. Henvisningen følger virksomheden gratis. **`genbrugt = true` (`:822`, `:845`)** betyder, at CVR'et var kunde før. Det er signalet for «tidligere kunde» (§2.5). |
| Første betaling | `company_perioder` (`20260901140000_medlemsperioder.sql:14–29`), `art in ('indgang','fornyelse')`, `betalingsmodel in ('fuld','rate2','rate12','faktura')`. Skrives KUN af `stripe-webhook` (`index.ts:650–656` og `:1456–1488` for indgang, `:1321–1327` for fornyelse) | «Betalt» er en række med `art = 'indgang'`. Meta-cronens Purchase læser allerede den række (CLAUDE.md, trin 2). Det er den samme dom. |
| Rater | `company_traek` (`20260903150000_company_traek.sql`; status `betalt`/`fejlet`) | Ved `rate12` er første række i `company_perioder` IKKE lig med «pengene er inde». Trækkene viser, hvor mange rater der faktisk er betalt. |
| Invitation efter betaling | `_shared/sikrIndgangsInvitation.ts`, kaldt fra `stripe-webhook` | Adgang gives ved BETALING. Den anbefalede bliver medlem på samme vej som alle andre. Programmet rører ikke `handle_new_user()` (FORBIDDEN-listen). |
| Idempotent spor mod tredjepart | `meta_haendelser`, `ga_haendelser`, `klaviyo_haendelser` | Mønstret for en belønningsbog: én række pr. (henvisning, hændelse), unik nøgle og append-only. |
| Menneske i løkken | `docs/agentarkitektur.md` §1.3: penge og prisændringer kommer «aldrig over N1» | Hver udbetaling godkendes af et menneske, også hvis en agent en dag foreslår den. |

**Målt i prod 30/9 19:03:** 11 indsendte ansøgninger (trin: 8 lukket, 2 indkaldt,
1 underskrevet). 2 rækker i `company_perioder`, begge `indgang`/`rate12`, median
`beloeb_oere` = **52.500 kr.** Om beløbet er med eller uden moms, er ikke målt.
43 kundevirksomheder (`er_kunde`, ikke demo, ikke slettet).

### 1.2 Det, der mangler

1. **Anbefalerens identitet.** Hverken kode, link, kolonne eller tabel findes. `grep` efter
   `henvist_af`, `anbefalet_af` og `referral` i `src/` og `supabase/` giver 0 træf. Det
   eneste spor er en linje i `docs/OVERLEVERING.md:6730`: «affiliate («henvist af» på
   ansøgningen)».
2. **NAVNEKOLLISION, sagt højt:** `ansoegninger.anbefaling` (jsonb, `20260918200000:159`)
   er **motorens anbefaling til rådgiveren** (`ansoegningAnbefaling`), ikke en henvisning.
   Nye kolonner må derfor ALDRIG hedde `anbefaling_*`. Forslag: `henvisning_*`.
3. **Belønningsbog og udbetaling.** Findes ikke.
4. **Refusioner.** `stripe-webhook` har ingen gren for `charge.refunded` eller kreditnotaer.
   Det eneste træf på «refund» er kommentaren `index.ts:1277` («pengene er taget og skal
   refunderes i hånden»). Clawback kan derfor i dag kun ske i hånden.
5. **Aftaleteksten.** `aftale_skabelon` er en PLADSHOLDER (CLAUDE.md). Opsigelses- og
   fortrydelsesvilkår, som optjeningen afhænger af, er ikke målt.
6. **En flade til medlemmet.** Findes ikke.

---

## 2. Sporingen fra ende til anden

```
link ──► besøg ──► ansøgning (opret) ──► indsendt ──► møde ──► underskrevet ──► 1. betaling ──► (fornyelse)
 kode     ingen      henvisning GEMT      ansøgeren     trin      samme id        company_perioder   company_perioder
          lagring    på rækken            BEKRÆFTER     booket/   (company_id)    art='indgang'      art='fornyelse'
          på enhed                        anbefaleren   afholdt
```

### 2.1 Linket

`https://app.theboardroom.dk/ansoeg?kilde=anbefaling&h=<kode>`, eller til sitet
`theboardroom.dk/?kilde=anbefaling&h=<kode>`, hvis sitet sender `h` videre på samme måde,
som det sender `kilde` (site-PR #5). **Hvad sitet gør med en ukendt parameter som `h`, er
ikke målt.** Skive 1 linker derfor direkte til `/ansoeg`.

- **Koden** er tilfældig, kort og fast pr. anbefaler, fx 8 tegn fra et alfabet uden 0/O/1/l.
  Den er IKKE medlemmets navn, id eller mail. Et link i et LinkedIn-opslag må ikke lække
  virksomhedens id.
- Koden er en **observation, aldrig en nøgle** (princip 2): fladen sender den rå, og
  serveren slår den op i `henvisningskoder` og gemmer id'et. En ukendt kode giver ingen
  henvisning, og det rå ord gemmes i `henvisning_raa`, som `kilde_raa` gør.
- `?kilde=anbefaling` kommer med, så den eksisterende kilde bliver rigtig uden at ændre
  `afgoerKilde`. Står `h` alene, sætter serveren kilden til `anbefaling`, når koden er
  gyldig. **Det er en beslutning i den rene dom, ikke i fladen.**

### 2.2 Hvor henvisningen gemmes — og hvorfor IKKE i en cookie

**På serveren, på ansøgningsrækken, ved «opret»** (samme vej som annoncesporet). Grundene,
med kilde:

- Platformen har **ingen cookiebanner og ingen tredjepartscookies** (`tracking.md` §2.3,
  række 18). Et henvisnings-id lagret i `localStorage` eller en cookie, der skal genkende
  den besøgende senere, er at lagre oplysninger på brugerens udstyr til et formål, som
  brugeren ikke selv har bedt om. Huset har allerede truffet samme valg for visnings-id'et:
  «aldrig i localStorage, fordi et statistik-id på enheden kræver samtykke» (CLAUDE.md,
  «Sporet før ansøgningen»). **Om cookiebekendtgørelsen konkret undtager
  henvisningssporing, er ikke slået op. Vi antager, at den ikke gør.**
- Princip (b) i `tracking.md` §1: platformen er kilden til sandheden, ikke et klik.

**Konsekvensen, sagt ærligt:** klikker nogen på linket, lukker fanen og kommer tilbage en
uge senere via Google, har vi intet spor. Svaret er IKKE en cookie. Svaret er **at spørge**:

- Ansøgningen får et **frivilligt felt**: «Har et medlem anbefalet os? (navn eller kode)».
  Kom ansøgeren via et link, er feltet **forudfyldt** med anbefalerens synlige navn
  («Anbefalet af Mette Hansen, Hansen ApS»), og ansøgeren kan fjerne det.
- **Ansøgerens bekræftelse ved indsendelse er dommen.** Linket er et forslag. Det giver
  (a) den rigtige anbefaler, også når linket blev tabt undervejs, (b) gennemsigtighed:
  ansøgeren ser, at en anbefaler knyttes til ansøgningen, og (c) stedet for samtykket til
  deling (§6).
- Et navn skrevet i fritekst uden kode matches IKKE automatisk. Rådgiveren kobler i hånden
  (§5). Et forkert automatisk match ville udbetale penge til den forkerte.

### 2.3 First-touch, last-touch og levetid

- **Én anbefaler pr. ansøgning.** Der er ingen deling og ingen kæde.
- Rækkefølgen: (1) den anbefaler, ansøgeren **bekræfter ved indsendelse**, (2) ellers
  koden ved «opret» (first-touch på ansøgningen), (3) ellers ingen. Last-touch giver ikke
  mening, for der er kun ét «opret» pr. ansøgning, og et link åbnet efter «opret» ændrer
  ikke rækken.
- **Levetid:**
  - Linket har ingen levetid, fordi det ikke gemmes nogen steder før «opret».
  - Henvisningen på ansøgningen lever med ansøgningen.
  - Retten til en belønning udløber, hvis første betaling ikke sker inden for **N måneder
    efter indsendelse** (forslag: 6). Det skal ses i lyset af «ikke nu = 3 mdr. pause» i
    rykkerkøen og betalingsforløbets 60 dage.
- **En lukket ansøgning, og så en ny:** den nye ansøgning bærer sin EGEN henvisning. Den
  gamle arves ikke. Rådgiveren kan koble i hånden, med grund.

### 2.4 To anbefalere

To medlemmer sender samme person et link. Den, ansøgeren bekræfter, vinder. Er ingen
bekræftet, vinder koden fra «opret». Den anden anbefaler får intet og ser intet: han har
ingen ansøgning at se, for hans link blev ikke brugt ved «opret». Der er ingen deling, for
deling kræver en tvist-regel, og det er ikke værd at bygge.

### 2.5 Selvhenvisning, eksisterende og tidligere kunder, snyd

Den rene dom `henvisningDom` (motor, testet, spejlet hvis en flade viser den) afgør
`gyldig | selvhenvisning | eksisterende_kunde | tidligere_kunde | egen_virksomhed |
ukendt_kode | udloebet`. **Ikke gyldig betyder ingen belønning**, men henvisningen gemmes
stadig. Målingen skal kunne se forsøget.

| Tilfælde | Signal i data | Dom |
|---|---|---|
| Anbefaleren ansøger selv via eget link | ansøgningens `lower(email)` = anbefalerens profilmail, eller ansøgningens CVR = anbefalerens virksomheds CVR | `selvhenvisning` |
| Ansøger fra anbefalerens egen virksomhed (kollega) | ansøgningens CVR = `companies.cvr` for anbefalerens virksomhed | `selvhenvisning` |
| Aktivt medlem på CVR'et | CVR matcher en virksomhed, hvor `computeMembershipTier` ≠ `expired` (ingen sjette adgangsdom; den kanoniske bruges) | `eksisterende_kunde` |
| Tidligere kunde | `konverterTilVirksomhed` → `genbrugt = true`, eller CVR-match på en virksomhed med `status = 'tidligere'` | `tidligere_kunde`, hvis kontrakten sluttede for **under 12 mdr.** siden (forslag, beslutning 5). Ældre end det tæller som ny. |
| Anbefalerens andre selskaber (holding, søsterselskab) | **ikke målbart automatisk i dag.** Om DataCVR-opslaget (`cvr_opslag`) bærer ejere/deltagere, er ikke målt | rådgiveren ser et flag «samme ejer?» og afgør (§5). Afgørelsen er N1. |
| Samme person, ny mail | ikke målbart | rådgiverens skøn. Der er ingen automatisk dom. |
| Masseoprettede kladder for at teste koder | `ip_hash`-loftet (`ansoegninger_ip_hash_created_idx`) gælder allerede. En kladde giver aldrig penge, kun en betaling gør | ingen ny regel |
| Anbefaler og anbefalet er konkurrenter (nichereglen) | «konkurrentfelt» findes ikke i data (OVERLEVERING:6728) | rådgiverens samtale. Programmet ændrer ikke optagelsen. |

**Den vigtigste snydeværn er, at der kun betales for en BETALING, og kun efter et vindue
(§3.4).** En falsk ansøgning koster snyderen 52.500 kr. for en belønning på en brøkdel.

---

## 3. Belønningsmodellen

**Moms og skat nedenfor er spørgsmål, ikke fakta. Alt markeret SKAL SLÅS OP skal
besvares af revisor, før skive 3.**

### 3.1 Mulighederne

| Form | For | Imod | Moms/skat — SKAL SLÅS OP |
|---|---|---|---|
| **A. Kontant til medlemsVIRKSOMHEDEN** (virksomheden fakturerer Topix et henvisningshonorar) | Enkel, «stort upside» er let at forstå, uafhængig af fornyelsen | Kræver en faktura fra medlemmet (friktion) eller en selvfaktureringsaftale | Er formidlingen momspligtig hos medlemmet? Kan Topix selvfakturere (aftalen skal i så fald stå skriftligt)? Fradrag hos Topix som salgsomkostning? |
| **B. Kontant til PERSONEN** | Personligt motiverende | Løn/B-indkomst? Indberetning (eIndkomst)? Personer, der ikke er ejere (ansatte hos medlemmet), bliver et arbejdsgiver-spørgsmål | SKAL SLÅS OP. **Frarådes:** belønningen tilfalder den virksomhed, der er medlem |
| **C. Kredit på egen fornyelse** | Holder pengene i huset | **Strider mod fornyelsesordningens bærende regel.** Fornyelse tilbydes kun ved rådgiverens «tilbyd», og «alt andet er tavshed indtil udløb» (`fornyelsesordningen.md` §1). En saldo «til din fornyelse» lover en fornyelse, som rådgiveren måske ikke tilbyder, og et medlem med `tilbyd_ikke` kan aldrig indløse den. Forskellen mellem de to kan også lække dommen (§2 dér). | Rabat på et senere salg: påvirker den momsgrundlaget på fornyelsen? SKAL SLÅS OP |
| **D. Måneder gratis** (kontraktforlængelse) | Ingen udbetaling | Ændrer `contract_end_date`, som alle fem adgangsdomme læser (`adgangsdomme.md` §1) og som kolonneværnet beskytter. Samme tavshedsproblem som C, fordi forlængelse er fornyelse ad bagdøren. 1 måned ≈ 52.500/12 ≈ 4.375 kr. | Vederlagsfri ydelse, moms af udtagningen? SKAL SLÅS OP |
| **E. Oplevelse/gave** (middag, event, plads til et arrangement) | Passer til et fællesskab. Lav administration | Svært at gøre «stort» | Gaveregler og repræsentation hos Topix? Skattepligtig for modtageren? SKAL SLÅS OP |
| **F. Trappe** (oven på A) | «Stort upside»: 1. = X, 3. = X + bonus, 5. = en større oplevelse | Kræver data om, hvad der virker. Bygges ikke før skive 5 | som A |

**Anbefaling: A som fast beløb pr. ny betalende medlem, udbetalt til virksomheden, med E
som symbolsk tak ved første henvisning. C og D fravælges** på grund af tavshedsreglen. Det
er et arkitekturargument, ikke en smagssag. Beløbet er Jonas' (beslutning 2). Regnestykket
som grundlag: 10 % af det målte median-indgangsbeløb = 0,10 × 52.500 = **5.250 kr.**
Momsstatus for de 52.500 er ikke målt. Til sammenligning: en ansøgning via Meta har ingen
målt pris pr. betalende kunde. Kun **1** ansøgning er underskrevet i alt, så tallet findes
ikke endnu.

### 3.2 Bogføring

- Belønningen er en **omkostning hos Topix** (salgsfremme/provision). Kontoen er Jonas' og
  revisors. SKAL SLÅS OP.
- Med model A modtager Topix en købsfaktura fra medlemsvirksomheden og betaler den som
  andre leverandørfakturaer. Platformen **bogfører ikke**. Den fører en belønningsbog med
  status og henviser til bilagsnummeret.
- Med selvfakturering udsteder Topix bilaget. Det kræver en skriftlig aftale med hver
  anbefaler. SKAL SLÅS OP.

### 3.3 Hvornår er den optjent?

Tre tidspunkter kan komme i betragtning. Kun det sidste tåler en refusion:

| Tidspunkt | Data | Problem |
|---|---|---|
| Underskrift | `trin = 'underskrevet'` | Der er ingen penge endnu. «Betalte ikke» på dag 60 findes (`betalte_ikke`/`udloeb`) |
| Første betaling | første `company_perioder`-række med `art = 'indgang'` | Ved `rate12` er det den første af tolv rater. En opsigelse eller refusion efter en måned ville have udløst en fuld belønning |
| **Første betaling + vindue** | første `indgang`-række, **og** N dage uden refusion, **og** ved rater: de forfaldne rater i `company_traek` er `betalt` | anbefales |

**Forslag:** optjent **90 dage efter første betaling**, når ingen rate i perioden står
`fejlet` uden en senere `betalt`, og ingen refusion er registreret (i hånden, jf. §1.2
punkt 4). Hvorfor 90: det dækker tre rater ved `rate12`. Et lovbestemt fortrydelsesvindue
for B2B har jeg ikke fundet (forbrugeraftaleloven er som udgangspunkt for forbrugere,
SKAL SLÅS OP). Aftalens egne vilkår er ikke målt, fordi skabelonen er en pladsholder.
Tallet 90 er Jonas' (beslutning 3).

### 3.4 Clawback

- **Før udbetaling:** en refusion eller ophævelse i vinduet giver status `bortfaldet` med
  grund. Der er intet at kræve tilbage.
- **Efter udbetaling:** anbefales ingen clawback. Vinduet er værnet. At kræve penge tilbage
  fra et medlem er dyrere i relation end beløbet. Refunderes pengene helt pga. svig, afgør
  rådgiveren det i hånden (en modpostering i bogen, N1).
- **Fornyelse:** skal den første fornyelse også give noget («stort upside»)? Den
  afhænger af rådgiverens «tilbyd». En bonus for den ville gøre anbefaleren interesseret i
  en beslutning, han ikke må kende. **Frarådes.**

---

## 4. Medlemmets flade

Placering: en side i hjemmebanen («Anbefal et medlem»). Hvilken sidebar-gruppe, afgøres i
skive 2. UX-rådet ser den.

1. **Eget link** med kopi-knap og QR-kode. Ved siden af står, i klar tekst, **mærknings­
   reglen** (§6.2) og en færdig delingstekst, der indeholder mærkningen.
2. **Status for egne henvisninger, uden persondata før samtykke:**

   | Den anbefaledes samtykke (§6.1) | Medlemmet ser |
   |---|---|
   | nej / ikke givet | «Én ansøgning via dit link, 12. oktober», og derefter kun optjent-status. Ingen navn, intet firma, intet trin |
   | ja | navn og firma + et **grovt** forløb: «Ansøgt» → «I dialog» → «Blevet medlem» → «Belønning optjent» |

   **«Afvist» vises ALDRIG.** En ansøgning, der lukkes (af enhver `lukkeaarsag`), vises som
   «Afsluttet» ligesom en, der trak sig. Det er fornyelsesordningens §2-regel spejlet: en
   afvisning må ikke lække gennem en tredjepart. Trinnene `booket`, `afholdt` og
   `aftalegrundlag_sendt` samles i «I dialog», så samtalens timing ikke lækker.
3. **Optjent / udbetalt:** en bog med beløb, dato og status (`afventer_vindue` · `optjent`
   · `godkendt` · `udbetalt` · `bortfaldet`) og, ved `udbetalt`, fakturanummeret.
4. **Hvem må se den:** alle brugere i medlemsvirksomheden (belønningen er virksomhedens),
   eller kun den, linket tilhører? **Forslag:** linket er personligt (kode pr. bruger),
   bogen er virksomhedens. Adgangen skal gå gennem `har_aktivt_medlemskab`, så en udløbet
   virksomhed ikke får nye links. En optjent belønning bortfalder IKKE ved udløb.
5. **Tjenestekonti og demo:** `tjenestekonti`, `is_demo` og `er_kunde = false` får intet
   link (samme fravalg som `klaviyoMedlem`).

## 5. Rådgiverens flade og kontrol

- **På ansøgningen** (`AnsoegningView`): «Anbefalet af X (firma)» med dommen fra
  `henvisningDom` og advarslerne (selvhenvisning, eksisterende/tidligere kunde, «samme
  ejer?»). Rådgiveren kan **koble en anbefaler i hånden** (fritekstsvaret) og **fjerne
  en** med obligatorisk grund. Begge dele skrives som en række i en append-only log. Ingen
  stille overskrivning.
- **Optagelsen er urørt.** Henvisningen giver ingen genvej gennem motoren. Trinnene og
  anbefalingen (`ansoegningAnbefaling`) læser den ikke.
- **Belønningsbogen:** en liste over `optjent`, som venter på godkendelse. **Hver
  udbetaling er et menneskes klik (N1, `agentarkitektur.md` §1.3: penge aldrig over N1).**
  Klikket skriver `godkendt_af`/`godkendt_at`. `udbetalt` sættes med bilagsnummeret.
  Bortfald kræver en grund.
- **Pr. anbefaler:** antal links åbnet (fra `ansoegning_visninger`, hvis kørt), ansøgninger,
  medlemmer og beløb. Det er grundlaget for trappen (skive 5).
- **Klokker:** «ny ansøgning med anbefaler» er en almindelig `ansoegning_ny`. Der kommer
  ingen ny klokketype i skive 1 (en ny type kræver plads i `klokkeMail.ts`'s lister, ellers
  fælder værnet). «Belønning optjent» → MORGEN-listen i skive 3.

---

## 6. Jura og GDPR

### 6.1 Hvad anbefaleren må se om den anbefalede

- At en person har ansøgt, er en personoplysning om den anbefalede. Den må ikke videregives
  til anbefaleren uden et grundlag. **Grundlaget er ansøgerens samtykke:** et frivilligt
  afkrydsningsfelt ved indsendelse, fx «Må vi fortælle [anbefalerens navn], at du har søgt,
  og hvor langt du er?». Standardværdien er IKKE krydset af. Samtykket gemmes med
  tidspunkt og kan trækkes tilbage (på statussiden `/ansoeg/status`).
- **Uden samtykke** ser anbefaleren kun et anonymt tal (§4). Men pas på: har anbefaleren
  kun sendt linket til én person, kan tallet i sig selv afsløre personen. Det kan ikke
  undgås helt. Derfor vises «Afvist» aldrig, og trinnet vises aldrig uden samtykke.
- Belønningen kan ikke skjules for anbefaleren, for den er hans penge. Den betyder «har
  betalt», og det er afsløring nok. **Samtykketeksten skal derfor sige, at anbefaleren får
  en belønning, hvis ansøgeren bliver medlem.** Om en anonym udbetaling kræver ansøgerens
  samtykke, SKAL SLÅS OP. Forslag: samtykket dækker det, og uden samtykke udbetales stadig,
  men anbefaleren ser kun «1 belønning optjent» uden dato-kobling til en ansøgning. **Det
  er beslutning 6.**
- `persondata.ts` (ansøgningens persondatatekst) skal nævne henvisningen, koden og
  samtykket. Teksten er Jonas' (tracking.md princip f).
- Henvisningen sendes ALDRIG videre: ikke til Meta, GA eller Klaviyo. `findForbudteNoegler`
  skal kende de nye nøgler, og `meta-send`/`ga-send` læser kun deres faste kolonner (målt:
  meta-cronen læser «kun seks kolonner», tracking.md §4). Klaviyo «Ansoegning paabegyndt»
  sender `{kilde}`, og ordet «anbefaling» er uskyldigt. Anbefalerens navn må ikke med.
- **Slettefunktionen:** `slet-medlemsdata-cron` skal rydde henvisningsfelterne på en slettet
  ansøgning og virksomhed. Belønningsbogen er et bogføringsgrundlag (5 år?, SKAL SLÅS OP),
  og den skal derfor pseudonymisere den anbefalede, ikke slette rækken.

### 6.2 Markedsføringsloven: mærkning og spam

- Et medlem, der deler linket mod en belønning, **reklamerer mod betaling**. Opslaget skal
  tydeligt vise, at det er reklame, fx «Reklame: jeg får en belønning, hvis du bliver
  medlem». Forbrugerombudsmandens retningslinjer for skjult reklame og influentmarkedsføring,
  og om de gælder for B2B-modtagere, SKAL SLÅS OP. Vi antager, at mærkningen kræves.
- **Topix er medansvarlig** for, hvad anbefalere skriver på vores vegne, så vidt det er
  slået op (SKAL SLÅS OP). Konsekvensen: vilkår, som anbefaleren accepterer, før linket
  vises (mærkning, ingen løfter om resultater, ingen masseudsendelse), og en færdig
  delingstekst med mærkningen i.
- **Uanmodede mails:** et medlem, der sender linket til en liste uden samtykke, kan bryde
  reglerne om elektronisk markedsføring. Vilkårene forbyder det. Personlige
  henvendelser, én til én, er normen. Hvor grænsen går, SKAL SLÅS OP.
- Anbefalerens egne udsagn om rådgivningens resultater (fx «vi fik 30 % mere i
  overskud») er dokumentationspligtige påstande. Vilkårene siger: fortæl din oplevelse,
  lov intet.

### 6.3 Samtykke til markedsføring

Et henvisningslink giver **intet** samtykke til nyhedsbrev. Den anbefalede kommer ind i
Klaviyo ad den eksisterende vej (kontaktskærmen → «paabegyndt»), og kun det.

---

## 7. Skiverne — motor før flade

**Skive 1 — «Hvem anbefalede dig» (måling, ingen penge).**
- Migration: `henvisningskoder` (kode unik, `user_id`, `company_id`, `oprettet_at`,
  `lukket_at`; service-role-skrivning, medlemmet læser egen) + kolonner på `ansoegninger`:
  `henvisning_kode_id`, `henvisning_raa`, `henvisning_bekraeftet` (bool),
  `henvisning_samtykke_at`, `henvisning_kilde` (`link` | `ansoeger` | `raadgiver`).
  `protect_ansoegning_motor_fields` er en eksisterende trigger. **At udvide dens liste er at
  ÆNDRE en protect_*-trigger og kræver Jonas' grønne lys** (FORBIDDEN-listen). Alternativet
  er en ny trigger på egen tabel. Det afgøres i skivens PR.
- Den rene dom `henvisningDom.ts` (§2.5) med tests og værn. Den læser `computeMembershipTier`
  og laver ingen egen adgangsdom.
- `Ansoeg.tsx` læser `h` ved mount (samme blok som kilden). «opret» sender `henvisning`
  (på `KENDTE_FELTER`). Serveren slår koden op i en egen fail-soft update, efter
  annoncesporet. Formularen får feltet «Anbefalet af» og samtykket.
- Rådgiveren ser «Anbefalet af» og dommen på ansøgningen og kan koble/fjerne med grund.
- Koder oprettes i hånden af rådgiveren til de første 3–5 medlemmer. Der er ingen
  medlemsflade endnu.
- **Beviset:** STRIKS-svaret nævner `henvisning`. Én prøveansøgning med en kode viser
  rækken med `henvisning_kode_id`. Prøven slettes bagefter.
- **Værdien:** efter en måned ved vi, om links bliver brugt, og om de giver betalende
  medlemmer. Jonas kan belønne i hånden i mellemtiden.

**Skive 2 — medlemmets flade:** eget link (kode oprettes første gang, siden åbnes),
vilkår og mærkning, og status efter §4. Der er intet beløb endnu, men «Belønning:
kommer». UX-rådet ser den.

**Skive 3 — belønningsbogen (motor):** `henvisning_beloenninger` (append-only, én række pr.
henvisning, unik på `ansoegning_id`), skrevet af en Bucket B-cron, der udleder `optjent` af
`company_perioder` + `company_traek` + vinduet (§3.3). Tørkørsel som standard og en lås i
`app_config`. **Forudsætter revisorsvaret (§3).**

**Skive 4 — udbetaling og rådgiverens godkendelse (N1):** godkend, udbetalt med bilag,
bortfald med grund, og belønningen på medlemmets flade. Refusioner registreres i hånden,
indtil `stripe-webhook` får en refusionsgren (et eget kort).

**Skive 5 — trappe og kit:** bonustrin efter data fra skive 1–4, delingsbilleder
(`docs/delingskreativ`), og pr.-anbefaler-tal til rådgiveren.

---

## 8. BESLUTNINGER TIL JONAS

1. **Hvem får belønningen: medlemsVIRKSOMHEDEN, ikke personen.** Anbefaling: virksomheden
   (model A), betalt mod faktura. Hvorfor: medlemskabet er virksomhedens. En udbetaling
   til en person rejser løn- og indberetningsspørgsmål. Skatten SKAL SLÅS OP hos revisor
   før skive 3.
2. **Belønningens form og størrelse.** Anbefaling: et fast kontantbeløb pr. nyt betalende
   medlem, fx **5.250 kr.** (10 % af den målte median, 52.500 kr., moms ikke målt), plus en
   symbolsk tak ved første henvisning. **IKKE kredit på fornyelse og IKKE gratis
   måneder.** Hvorfor: begge lover en fornyelse, som kun rådgiverens «tilbyd» må love
   (`fornyelsesordningen.md` §1–2), og gratis måneder ændrer `contract_end_date`, som alle
   fem adgangsdomme læser.
3. **Hvornår er den optjent?** Anbefaling: **90 dage efter første betaling**
   (`company_perioder` `art = 'indgang'`), med de forfaldne rater betalt og uden refusion.
   Ingen clawback efter udbetaling. Hvorfor: vinduet dækker tre rater ved `rate12` (de to
   målte betalinger er begge `rate12`). Et vindue er billigere i relation end at kræve
   penge tilbage.
4. **Hvem ejer henvisningen?** Anbefaling: **den, ansøgeren selv bekræfter ved
   indsendelse**, forudfyldt fra linket. Ingen cookie og intet på enheden. Hvorfor:
   platformen har intet samtykkebanner og gemmer aldrig sporing på enheden
   (`tracking.md` §2.3). Ansøgerens eget ja er samtidig det sted, samtykket bor.
5. **Tidligere kunder.** Anbefaling: en virksomhed, der var kunde inden for de sidste
   **12 måneder** (CVR-match eller `genbrugt = true`), giver ingen belønning. Ældre end det
   tæller som ny. Aktive kunder og anbefalerens egen virksomhed giver aldrig belønning.
   «Samme ejer» afgøres af rådgiveren.
6. **Hvad ser anbefaleren?** Anbefaling: uden ansøgerens samtykke kun et anonymt antal og
   anonyme belønninger. Med samtykke navn og et groft forløb. **«Afvist» vises aldrig**,
   kun «Afsluttet». Hvorfor: en afvisning må ikke lække gennem en tredjepart, samme regel
   som fornyelsens tavshed.
7. **Alle udbetalinger godkendes af et menneske (N1).** Anbefaling: ja, altid, også når
   bogen regner optjeningen selv. Hvorfor: `agentarkitektur.md` §1.3 sætter penge aldrig
   over N1, og refusioner ses i dag ikke af koden (§1.2 punkt 4).
8. **Start med skive 1 alene.** Anbefaling: byg målingen («Anbefalet af» på ansøgningen)
   og del koder til 3–5 medlemmer i hånden. Beløn manuelt, til revisor har svaret på §3.
   Hvorfor: 0 af 11 ansøgninger bærer i dag kilden `anbefaling`. Værdien er ikke målt, og
   pengedelen er den dyreste og mest risikable (regelsæt §4a).

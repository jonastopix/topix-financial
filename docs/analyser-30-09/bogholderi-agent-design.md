# Bogholderi-agenten — design for fuld automatik (e-conomic + Nordea)

Udarbejdet 29/9-2026 af Claude som teknisk arkitekt. **Erstatter** `bogholderi-automatisering-30-09.md` (den byggede på «kun forslag, et menneske bogfører» — det er forladt efter Jonas' beslutning 29/9: *«Jeg har ansvaret som menneske, men vi må gerne fuldautomatisere det.»*). Faktagrundlag fra Jonas 29/9 23:42: banken er **Nordea**; e-conomic har API-adgang, men skal «lige connectes korrekt».

**Hvad der er målt, og hvad der ikke er:** alt tredjepartsstof herunder er slået op (URL ved hvert punkt). **Intet er målt i jeres systemer**: kontoplan, momskoder, pakke, posteringsantal, leverandørliste, Nordea-konti og bogholderens kontrakt er ukendte for mig. Står der «ikke målt», er det netop det.

---

## 0. Beslutningen i syv linjer

1. **Agenten bogfører selv** i e-conomic gennem OpenAPI Journals: kladdelinjer i en *dedikeret agent-kladde* → bilag vedhæftet → `POST /journals/{journalNumber}/book`. Endepunktet findes og er det gældende (de gamle booking-endepunkter er flyttet til «Under deprecation», erstatningen er netop `JournalBooking`-sektionen). — https://apis.e-conomic.com/journalsapi/redoc.html
2. **Banken ind gennem Enable Banking** (Nordea DK dækket, samtykke op til 180 dage). e-conomics egen Aiia-feed beholdes tændt som *uafhængig anden kontrol* — men den kan ikke være agentens kilde: Nordea-poster når først e-conomic efter 1–3 bankdage, og bankafstemningsmodulet er ikke fundet i API'et.
3. **Separat Supabase-projekt ejet af Jonas** (ikke Lovable), eget repo `topix-bogholderi`, husets discipliner: tørkørsel som standard, lås i `app_config`, spor pr. ekstern skriver, rene domme med tests.
4. **Historikken er træningsdata:** de seneste 24 måneders bogførte posteringer i e-conomic (`/booked-entries`) sår regelmotoren. Det, bogholderen har gjort ens ≥ 3 gange, er en regel fra dag 1.
5. **Fuld automatik over en tillidsgrænse, en lille kø under den.** Alt bogført har bilag vedhæftet med SHA-256, en markør i teksten, og kan kun rettes ved modpostering.
6. **Dagligt bevis: bank = konto.** Går beviset rødt, stopper autobogføringen af sig selv (fail-closed), til det er grønt igen.
7. **Første skive kører inden for 7 dage** (bank ind, bilag ind, match, autobogføring af de faste abonnementer). **Bogholderen opsiges ca. dag 14**, så opsigelsesvarslet løber, mens oktober lukkes af både agent og bogholder parallelt — og forskellen mellem de to er den bedste test, I kan få.

---

## 1. Arkitektur

### 1.1 Hvor motoren bor
| | |
|---|---|
| **Projekt** | Nyt Supabase-projekt `topix-bogholderi` i Jonas' EGEN organisation (ikke Lovables), region EU. Fuld CLI: `supabase db push`, `supabase functions deploy` virker — modsat platformen. |
| **Hvorfor ikke platformen** | Platformen bærer medlemmernes persondata og er Lovable-ejet (ingen CLI, deploy via build-chat). Bank- og e-conomic-nøgler skal ikke ligge ved siden af kundedata, og en fejl i den ene må ikke ramme den anden. |
| **Repo** | `jonastopix/topix-bogholderi`. Kopiér ordret fra platformen: `_shared/hverdage.ts` (danske hverdage/helligdage), mønsteret `authenticateServiceRole`, spor-tabel-mønsteret, `findForbudteNoegler`-værnet. |
| **LLM** | Claude API (PDF-læsning + ukendt kontering), struktureret output, altid med kildefelter. Nøgle i secrets. |
| **Kanonisk sted** | **e-conomic** er bogføringssystemet: posteringer OG bilag ligger dér (vedhæftet via API). Motoren er et forsystem med kopier og spor. Det holder jer inden for «registreret system» (§ 4). |

### 1.2 Motorerne (cron, Bucket B — `authenticateServiceRole` først, tørkørsel som standard)
| Motor | Kadence | Gør |
|---|---|---|
| `bank-hent` | 4×/døgn (06, 11, 15, 22) — Enable Banking nævner, at mange banker loftet baggrundshentninger til 4/døgn (https://enablebanking.com/docs/faq/) | Henter transaktioner + saldo pr. konto → `bank_transaktion`, `bank_saldo`. Idempotent på bankens transaktions-id (fallback: hash af dato+beløb+tekst+løbenr.). |
| `bilag-indtag` | hvert 10. min | Gmail API på `bilag@topix.dk`: nye mails → vedhæftninger → SHA-256 → `bilag` (dublet = samme hash). Label `behandlet` sættes EFTER rækken er skrevet. |
| `bilag-hent-api` | dagligt 05:30 | Leverandør-API'er (§ 2.2): Stripe (egne salgsfakturaer + balance transactions), Bunny billing, m.fl. |
| `bilag-laes` | hvert 10. min | LLM udtrækker: leverandør, CVR/VAT-nr., fakturanr., dato, periode, netto, moms, total, valuta, land, linjer. Deterministisk kontrol bagefter (netto+moms=total ±0,02; momssats = moms/netto). |
| `match` | efter `bank-hent` og `bilag-laes` | Parrer bank ↔ bilag (§ 2.3). |
| `konter` | efter `match` | Regelmotor → ellers LLM-forslag → tillidsdom (§ 3.1). |
| `bogfoer` | hvert 30. min i hverdage 07–22, låst af `app_config.bogfoer_aktiv` | Kladde → vedhæft → book → læs tilbage → bevis. |
| `bevis-dagligt` | 06:30 | Bank = konto, Stripe-mellemregning = Stripe-saldo, kø-størrelse. Rød → `bogfoer_aktiv` sættes false automatisk + alarm. |
| `rapport-maaned` | 3. hverdag kl. 07 | Månedsrapport (§ 2.8). |
| `moms-klar` | 10 dage før hver momsfrist | Momsafstemning (§ 3.7). |

### 1.3 Datamodel (Postgres, alle tabeller service-role-only, ingen klient-mutation)
```
selskab            (id, navn, cvr, economic_aftale_nr, grant_secret_navn, bankkonto_konto_nr,
                    stripe_mellemregning_konto, momsperiode, aktiv)
bank_konto         (id, selskab_id, iban, eb_account_uid, economic_konto_nr, valuta)
bank_transaktion   (id, bank_konto_id, bank_ref UNIQUE, bogfoert_dato, valoer_dato, beloeb_oere,
                    valuta, tekst_raa, modpart_raa, modpart_noegle, status)       -- status: ny|matchet|bogfoert|koe
bank_saldo         (bank_konto_id, dato, saldo_oere, kilde, PRIMARY KEY(bank_konto_id, dato))
bilag              (id, selskab_id, sha256 UNIQUE, kilde, kilde_ref, filsti, mime, modtaget_at,
                    udtraek jsonb, udtraek_model, udtraek_kontrol_ok, leverandoer_id)
leverandoer        (id, navn, cvr_eller_vat, land, noegler text[], standard_regel_id)
match              (id, bank_transaktion_id, bilag_id, score, begrundelse jsonb, art)   -- art: bilag|stripe|intern_overfoersel|bankgebyr
konteringsregel    (id, selskab_id, leverandoer_id, konto_nr, momskode, periodisering_mdr,
                    beloebsloft_oere, niveau, kilde, n_ens, n_afvigelser, godkendt_af, gyldig_fra, gyldig_til)
                    -- niveau: auto|gennemse|spoerg ; kilde: historik|jonas|revisor|laert
postering          (id, selskab_id, match_id, regel_id, tillid, dato, linjer jsonb, markoer UNIQUE,
                    kladde_nr, economic_bilagsnr, status, bogfoert_at, modposteret_af)
                    -- status: planlagt|i_kladde|bogfoert|bevist|modposteret
bogfoeringsspor    (id, postering_id, trin, foer jsonb, sendt jsonb, svar jsonb, http, at)  -- append-only
koe                (id, art, ref_id, spoergsmaal, forslag jsonb, oprettet_at, besvaret_at, svar jsonb, besvaret_af)
bevis              (dato, selskab_id, art, forventet_oere, faktisk_oere, afvigelse_oere, groen, detaljer jsonb)
periode_laas       (selskab_id, periode, laast_at, laast_af)       -- PRIMARY KEY(selskab_id, periode)
laan               (id, selskab_id, laangiver, hovedstol_oere, rente_pct, rente_fastsat_af, rente_fastsat_at,
                    aftale_bilag_id, konto_gaeld, konto_rente)
app_config         (bogfoer_aktiv=false, loft_auto_oere, loft_ny_leverandoer_oere, ...)
```
Triggers: `bogfoeringsspor` og `bevis` er append-only (BEFORE UPDATE/DELETE → exception). `postering` med `status='bogfoert'` kan ikke ændres, kun få `modposteret_af` sat.

### 1.4 Agent-lag vs. deterministiske regler
| Deterministisk (ren kode, tests) | LLM |
|---|---|
| Match-score, beløbs-/datovindue, valutatolerance | Læse PDF'er og mails til strukturerede felter |
| Konteringsregler (leverandør → konto + momskode) | Foreslå konto/momskode for en **ukendt** leverandør, med begrundelse |
| Momsberegning og -kontrol | Formulere køens spørgsmål til Jonas i klartekst |
| Tillidsdom, beløbsloft, periodelås, nødstop | Skrive månedsrapportens kommentar til afvigelser |
| Bogføring, modpostering, bevis | — |

**Regel:** LLM'en skriver aldrig direkte til e-conomic og afgør aldrig en tærskel. Dens output er et felt i `udtraek`/`forslag`, som de deterministiske domme dømmer.

---

## 2. Flowet, fuldt automatisk

### 2.1 Transaktion ind
`bank-hent` → Enable Banking `GET /accounts/{uid}/transactions` (+ `/balances`). — https://enablebanking.com/docs/api/quick-start/ · Modpartsteksten normaliseres ÉT sted (`normaliserModpart`: store bogstaver, fjern kortnr./datoer/referencer, kendte præfikser som `GOOGLE*`, `FACEBK*`, `STRIPE`) → `modpart_noegle`. Husets princip: *et felt, vi ikke selv sætter, er en observation — aldrig en nøgle*; nøglen udledes, med tests.

### 2.2 Find/hent bilag
Rækkefølge pr. leverandør (fastlægges i leverandørlisten, dag 1):
1. **API** hvor det findes:
   - **Stripe — jeres salg:** fakturaer (`invoice_pdf`) og balance transactions (brutto, gebyr, netto pr. udbetaling) via en *restricted key, kun læs*. Salgsbilaget er Stripe-fakturaen.
   - **Stripe — gebyrfakturaer:** kun i Dashboard → Settings → Plans and fees → Invoice history, klar senest den 10. i næste måned; intet API eller mail nævnt. — https://support.stripe.com/questions/download-vat-or-gst-invoices-for-stripe-fees
   - **Bunny:** billing-API med download af faktura-PDF. — https://docs.bunny.net/api-reference/core/billing/download-payment-request-invoice-pdf (Bunny's API-nøgle er konto-bred → overvej mail frem for API.)
   - **Meta:** `business_invoices` kun for fakturerede konti; ved kortdebitering hentes kvitteringer i Billing. Ikke målt for jer. — https://developers.facebook.com/docs/marketing-api/2tier-bm-solution/guides/invoice-group
2. **Mail til `bilag@topix.dk`**: sæt billing-mail hos ALLE leverandører dertil (Lovable, Klaviyo, eWebinar, Calendly, Google Workspace, Mailgun, Meta …). Hvem der faktisk sender PDF: **måles** den første måned.
   - **Mailgun:** fakturaer ligger i Control Panel → Plan & Billing → Invoices; mail nævnes ikke. — https://help.mailgun.com/hc/en-us/articles/360011701634-Where-can-I-find-my-Mailgun-invoices
   - **Google Workspace:** Admin console → Billing → download af månedsfaktura; intet officielt API fundet. — https://support.google.com/a/answer/6271108
3. **Portaler uden API og mail** (Stripe-gebyrer, Mailgun, måske Workspace): en bilagssamler (GetMyInvoices, Invoice Radar el.l.), der logger ind og videresender til `bilag@` — købes, bygges ikke. Alternativt en månedlig browser-agent. **Vælg efter målingen**; forventet 2–4 leverandører.
4. **Rykker:** en banktransaktion uden bilag efter 5 hverdage → én samlet mail pr. dag til Jonas med direkte link til portalsiden. Mål: < 5 om måneden efter første måned.

### 2.3 Match (deterministisk, `match.ts`)
Score 0–1 = vægtet sum, hver del med sin begrundelse:
- **Beløb** (0,45): DKK eksakt = 1. Udenlandsk valuta: bilagets beløb × dagskurs (Nationalbankens kurs på bankdatoen) inden for ±3 % (kortgebyr/kursafvigelse) = 0,8–1 lineært.
- **Leverandør** (0,30): `modpart_noegle` ∈ `leverandoer.noegler` = 1; fuzzy på navn = 0,5.
- **Dato** (0,15): bilagsdato ∈ [bankdato −10 d; +3 d] = 1, faldende til 0 ved ±30 d.
- **Reference** (0,10): fakturanr./kunde-id i bankteksten = 1.

Særlige arter uden leverandørbilag: **overførsel mellem egne konti** (modsat beløb samme dag på to egne konti), **bankgebyr/renter** (Nordea som modpart — bankposten ER bilaget, regel godkendt af revisor én gang), **Stripe-udbetaling** (matches mod payout-id i Stripes balance transactions).

### 2.4 Kontering
1. **Regel findes** (`konteringsregel` for leverandøren) → konto + momskode fra reglen.
2. **Ingen regel** → LLM-forslag med kontoplanen og momskoderne *læst fra e-conomic* (`/accounts`, `/vat-accounts`; aldrig hardkodet) + de 20 nærmeste historiske posteringer som eksempler.
3. **Læring:** hver bogføring, der ikke rettes inden månedslukning, tæller `n_ens +1`. En rettelse (modpostering + ny kontering, fra køen eller fundet i e-conomic som en revisorpostering mod vores bilagsnr.) tæller `n_afvigelser +1` og opretter/retter reglen. Regel går til `auto` ved `n_ens ≥ 3 ∧ n_afvigelser = 0 i de seneste 10`; én afvigelse sender den til `gennemse`.

**Stripe-salg (fast skabelon, auto):** betalt faktura → debet `Stripe-mellemregning` / kredit omsætning + udgående moms (efter fakturaens egen momslinje). Gebyr → debet gebyrkonto / kredit mellemregning (momsbehandling af Stripe-gebyrer: revisor afgør ÉN gang — ikke gættet). Udbetaling → debet bank / kredit mellemregning. Mellemregningen skal ramme Stripes egen saldo hver dag (bevis).

### 2.5 Moms
Momskoden kommer fra reglen. Kontrol før bogføring: bilagets moms = netto × sats ± 0,02 kr. (dansk 25 %), og for udenlandske ydelser skal reglen bære en omvendt-betalingspligt-kode — ellers kø. Første gang pr. udenlandsk leverandør: kø (revisor-godkendt kode), derefter regel.

### 2.6 Kladde → automatisk bogføring
1. Postering får markøren `AGT-<8 tegn af postering.id>` i teksten og som `Idempotency-Key` (e-conomic cacher nøglen 1 time for ikke-GET — https://apis.e-conomic.com/journalsapi/redoc.html). Markøren er den varige idempotens: før oprettelse søges kladden OG `/booked-entries` efter markøren.
2. `POST /draft-entries` (eller `/draft-entries/bulk`, ≤ 500) i **agentens egen kladde** (oprettet én gang, navn «AGENT – må ikke bruges af mennesker», `entryTypeRestrictedTo` hvis relevant).
3. Vedhæft bilaget til kladdebilaget (REST voucher attachment; virker på kladde- og bogførte bilag — https://techtalk.e-conomic.com/new-feature-voucher-attachments-in-rest-api/). **Intet bilag vedhæftet = ingen bogføring** (undtagen de godkendte bankbilag-arter).
4. **Før `book`:** læs HELE agent-kladden. Hver linje skal have en markør, der findes i `postering` med `status='i_kladde'` og tillid over grænsen. Én fremmed linje → nægt, alarm. (`book` bogfører hele kladden — derfor må ingen andre skrive i den.)
5. `POST /journals/{journalNumber}/book`.
6. **Beviset:** læs `/booked-entries?filter=voucherNumber…` tilbage; markøren skal stå dér med samme beløb, konto og momskode, og bilaget skal kunne hentes. Først da `status='bevist'`. Afvigelse → alarm + modpostering foreslået.

Hver HTTP-udveksling i trin 2–6 skrives i `bogfoeringsspor` (FØR/sendt/svar), præcis som `klaviyo_spor`.

### 2.7 Afstemning
Dagligt `bevis-dagligt` (§ 3.6). Månedligt: bank, Stripe-mellemregning, moms, kreditorer, mellemregning med anpartshavere, skattekonto. e-conomics egen bankafstemning (Aiia-feed, auto-match) kører videre som uafhængig kontrol; dens uafstemte poster tjekkes ved lukning (i UI — ikke fundet i API'et).

### 2.8 Månedsrapport — mailet 3. hverdag kl. 07
Hverdagsreglen fra `_shared/hverdage.ts`. Til Jonas (+ Morten efter valg). Indhold, alt fra `/accounting-years/:year/totals` og egne tabeller:
- **Resultat** måned og år-til-dato mod budget (Topix 2026-budgettet — koblingen ikke målt).
- **Balance** (aktiver, gæld, egenkapital) og **likviditet**: bankbeholdning, moms til betaling næste frist, kendte faste træk næste 30 dage (fra reglerne), løbetid i måneder.
- **Afvigelser**: poster > 20 % fra budget, nye leverandører, regler degraderet, kø-poster ældre end 5 hverdage, manglende bilag.
- **Automatikgrad**: antal poster, andel autobogført, andel rettet, kø-størrelse, bevis-dage grønne/røde.
- **Periodelås:** rapporten sendes først, når måneden er låst (§ 3.8).

### 2.9 Revisorpakke (årsafslutning, knap i drift)
Saldobalance · afstemninger pr. balancekonto med bevis-historik · momsafstemninger pr. periode mod angivelser · bilagsliste (bilagsnr. → SHA-256 → fil) · regeltabellen med kilde/godkender · kø-historik (spørgsmål, svar, hvem) · modposteringsliste · låneaftaler og renteberegninger · procedurebeskrivelsen (bilag A) · SAF-T fra e-conomic. Skøn (periodiseringer ved årsskifte, afskrivninger, hensættelser, skat) laves af revisor — agenten leverer grundlaget.

---

## 3. Værnene, der gør fuld automatik forsvarlig

### 3.1 Tillidsscore og tærskel
`tillid = min(match.score, kontering.score, udtraek.kontrol)`. Tre niveauer:

| Niveau | Krav (ALLE) | Handling |
|---|---|---|
| **A — auto** | regel `auto` · match ≥ 0,95 · bilag vedhæftet og læst med kontrol OK · beløb ≤ `loft_auto` (start **25.000 kr.**; Stripe-salg 100.000 kr.) · periode åben · `bogfoer_aktiv` · dagens bevis grønt | Bogføres |
| **B — auto, gennemses** | ny dansk leverandør med CVR · 25 % moms regner · LLM-konto i hvidlisten (drifts-/SaaS-/marketing-konti) · beløb ≤ `loft_ny_leverandoer` (start **3.000 kr.**) | Bogføres, står i ugens «gennemse»-liste; en rettelse = modpostering + regel |
| **C — kø** | alt andet: udenlandsk moms første gang, over loft, mulige anlægsaktiver, ejer/lån, løn, skat, skattekonto, ukendt modpart, match < 0,95 | Intet bogføres; spørgsmål i køen |

Tærskler står i `app_config`, ikke i koden, og ændres kun af Jonas.

### 3.2 Beløbsloft
To lofter (ovenfor) + et **dagsloft** for samlet autobogført beløb (start 100.000 kr.). Over dagsloftet → resten venter til i morgen og køen får én linje.

### 3.3 Den lille «ukendt»-kø
Én mail pr. hverdag kl. 08 (kun hvis køen ikke er tom) med hvert spørgsmål som én linje og 2–3 svarknapper (signeret token pr. knap, som `/aftale?token=`-mønstret: SHA-256-aftryk i databasen, udløb 14 dage). Svaret bliver en regel. Mål: **< 10 spørgsmål/måned efter måned 2**.

### 3.4 Fuldt revisionsspor
Bilag: SHA-256 ved indtag, samme hash ved vedhæftning, og filen i `storage` (privat bucket) + i e-conomic. `bogfoeringsspor` append-only med request/response. Kø-svar med hvem/hvornår. Regler med kilde og godkender. Alt kan genspilles: fra et bilagsnr. i e-conomic → markør → postering → match → bank-transaktion → bilagshash → regel → hvem godkendte reglen.

### 3.5 Tilbageførsel = modpostering
Aldrig sletning. `modposter(postering_id, grund)` bogfører den spejlede postering i agent-kladden med teksten `MODP AGT-xxxx: <grund>` og samme bilag, sætter `modposteret_af`. Den rigtige postering bogføres derefter som ny. Rettelser efter periodelås → kun i åben periode med henvisning.

### 3.6 Dagligt afstemningsbevis
For hver bankkonto, dato D = i går:
```
forventet = bank_saldo(D, fra Enable Banking)
faktisk   = Σ booked-entries på bankkontoen til og med D   (fra e-conomic, ikke fra vores tabel)
afvigelse = forventet − faktisk − Σ bank_transaktion(dato ≤ D, status ∈ {ny, matchet, koe})
grøn      ⇔ afvigelse = 0
```
Samme for Stripe-mellemregningen mod Stripes `balance`. **Rød = `bogfoer_aktiv := false` automatisk**, alarmmail, og intet bogføres, før en grøn dag. Dagens bevis står i `bevis` (append-only) og i månedsrapporten.

### 3.7 Momsafstemning før indberetning
`moms-klar` 10 dage før fristen: Σ udgående/indgående/omvendt moms fra momskontiene i e-conomic = Σ fra vores `postering`-linjer; liste over alle omvendt-betalingspligt-køb; kø og manglende bilag i perioden skal være 0. Grøn → mail til Jonas: «Momsen er klar: X kr. Indberet i e-conomic» (indberetningen selv er et UI-klik; API til indberetning er ikke fundet). Rød → hvad der mangler.

### 3.8 Periodelåsning
Ved lukning (3. hverdag, efter grønt bevis for sidste dag i måneden og tom kø for perioden): `periode_laas` i motoren + e-conomics egen periodespærring (feltet på `/accounting-years/:year/periods` — **læs feltnavnet ved første kald, ikke gættet**). Motoren nægter enhver postering dateret i en låst periode.

### 3.9 Nødstop
Tre lag, hurtigste først:
1. **Stop-link** i hver mail fra agenten (signeret token) → `bogfoer_aktiv := false`. Genstart kræver Jonas i Supabase (bevidst besværligt).
2. `app_config.bogfoer_aktiv` direkte.
3. **Tilbagekald grant-tokenet** i e-conomic (tandhjul → Alle indstillinger → Udvidelser → Apps). — https://www.e-conomic.dk/support/artikler/om-api-token

Automatiske stop: rødt bevis, 3 fejlede `book` i træk, 429-storm, fremmed linje i agent-kladden, en postering i låst periode.

### 3.10 Særligt værn: ejer-mellemregning
En mellemregnings-/lånekonto til en anpartshaver, der går i *debet* (selskabet har penge til gode hos ejeren), → øjeblikkelig alarm til Jonas + revisor. Skattereglen i LL § 16 E består, selvom selskabslovens §§ 210–212 er ophævet pr. 1/1-2025. — https://erhvervsstyrelsen.dk/vejledning-ophaevelse-af-bestemmelser-om-kontrol-med-kapitalejerlaan

---

## 4. Lovkrav — og hvad Jonas godkender ÉN gang

### 4.1 Bogføringsloven (lov nr. 700 af 24/5-2022)
Efter Erhvervsstyrelsens vejledning (https://erhvervsstyrelsen.dk/vejledning-bogfoeringsloven):
- **§ 6 — beskrivelse af bogføringsprocedurer:** procedurer for løbende registrering af alle transaktioner, for betryggende opbevaring, og *hvilke medarbejdere der er ansvarlige*. Agenten SKAL stå i den → bilag A.
- **§ 7, stk. 1:** registrering «nøjagtigt og snarest muligt». Automatik styrker dette (bogføring samme døgn).
- **§ 7, stk. 3 og § 11:** afstemning med beholdningerne, senest ved fristerne for lovpligtige indberetninger → dagligt bevis + momsafstemning.
- **§ 9 / § 3, nr. 4–5:** alle registreringer dokumenteres ved bilag; kontrolspor → bilag vedhæftet + `bogfoeringsspor`.
- **§ 12:** opbevaring 5 år fra regnskabsårets udgang → e-conomic (registreret) + egen kopi.
- **§ 16:** digital registrering og opbevaring i digitalt bogføringssystem.

Loven kræver *ikke*, at et menneske taster posteringerne; den kræver, at ledelsen har tilrettelagt procedurer, der sikrer korrekt og løbende registrering, og at ansvaret er placeret. Jonas bærer det ansvar — det står i procedurebeskrivelsen.

### 4.2 e-conomic som registreret system
Visma e-conomic står på Erhvervsstyrelsens fortegnelse (registreret 19.12.2023). — https://erhvervsstyrelsen.dk/fortegnelse-over-registrerede-bogfoeringssystemer. **Designvalg:** alle registreringer og alle bilag ender i e-conomic via deres API; motoren er et forsystem. Dermed er bogføringssystemet stadig det registrerede. **Én bekræftelse fra revisor** (ikke en blokering): at dette ikke gør opsætningen til et «ikke-registreret/kombineret» system. — https://erhvervsstyrelsen.dk/ikke-registrerede-digitale-bogfoeringssystemer

### 4.3 Det, Jonas godkender ÉN gang
1. **Procedurebeskrivelsen** (bilag A) — underskrevet, dateret, lagt i e-conomic/Drive.
2. **Kontoplan + momskode-kortet** efter at revisor har set det (inkl. Stripe-gebyrer, udenlandske SaaS, bankgebyrer som bankbilag).
3. **Regelsættet sået fra historikken** (én liste: leverandør → konto → momskode → n).
4. **Tærskler**: `loft_auto`, `loft_ny_leverandoer`, dagsloft, hvidlisten af konti for niveau B.
5. **App-rettigheden** i e-conomic (rolle) og grant.
6. **Rentesatsen** på hvert ejerlån (4.4).

Ændres noget af 1–6, er det en ny godkendelse, logget i `app_config`-historikken.

### 4.4 Lån fra ejer til selskabet
**Bogføring (typisk — kontonumre fastlægges med revisor):**
- Indbetaling: debet bank / kredit «Gæld til anpartshaver [navn]» (kortfristet, hvis lånet er uden fast løbetid/opsigeligt; ellers langfristet). Bilag = låneaftalen + bankposten.
- Rente pr. måned: debet renteudgifter / kredit skyldige renter (eller lånekontoen, hvis renten tilskrives).
- Afdrag: debet lånekonto / kredit bank.
Agenten genkender indbetalingen (modpart = ejerens konto) → **kø første gang**, derefter regel for lånet.

**Rente — agenten foreslår, Jonas fastsætter:**
- SKAT: «Hvis en hovedaktionær låner penge ud til sit selskab, skal der betales en sædvanlig markedsrente» (LL § 2); domstolene har i konkrete sager accepteret diskontoen + 4 pct. som markedsrente. — https://info.skat.dk/data.aspx?oid=1946448
- Diskontoen er **2,10 % p.a.** fra 11/9-2026. — https://www.nationalbanken.dk/da/viden-og-nyheder/presse/arkiv/2026/renteforhoejelse-10-09-2026
- Agentens forslag vises som interval med regnestykket: **øvre reference = 2,10 % + 4 % = 6,10 % p.a.**; en rente under det er ikke ulovlig, men renten er fradrag for selskabet og skattepligtig for Jonas, så satsen er et skøn → **Jonas fastsætter, revisor ser den**. Rentefrit lån er et selvstændigt skønsspørgsmål → revisor.
- Renteberegning (skrevet ud i koden): `rente_oere = hovedstol_oere × sats × dage / 365`. Eksempel: 100.000 kr. × 6,10 % × 30/365 = 6.100 × 30/365 = **501,37 kr.**

**Låneaftale-skabelon:** bilag B.

---

## 5. Faser i dage (bygget af AI-agenter parallelt)

Forudsætning dag 0: adgangene i § 6, pkt. 1–4 er oprettet af Jonas (≈ 2 timers klik).

| Dage | Leverance | Parallelle spor |
|---|---|---|
| **1–2** | Projekt + repo + skema + secrets. e-conomic-klient (læs): kontoplan, momskoder, 24 mdr. `booked-entries`. **Leverandørliste og regelsæt sået fra historikken.** Enable Banking i restricted mode (egne konti — tilladt til «evaluation … before a contract», https://enablebanking.com/docs/api/linked-accounts/) → Nordea-transaktioner 12 mdr. tilbage. Gmail-indtag. | A: e-conomic · B: bank · C: bilag@ + LLM-læsning · D: normalisering + match-domme med tests |
| **3–4** | Match + regelmotor + tillidsdom mod historikken: **tørkørsel over de sidste 3 måneder** — agentens kontering sammenlignet linje for linje med bogholderens. Træfprocent pr. leverandør. | Samme fire spor + E: bogføringsklient mod **prøveregnskab** (14 dage, https://www.e-conomic.com/developer/connect): kladde → vedhæft → book → læs tilbage → modpostering |
| **5–7** | **SKIVE 1 I DRIFT:** niveau A (kun regler med ≥ 3 ens historiske forekomster, fx de faste abonnementer) bogføres automatisk i det rigtige regnskab fra 1/10. Dagligt bevis. Nødstop. Kø-mail. | Stripe-salg-skabelonen tørkørt |
| **8–14** | Stripe-salg + gebyrer + udbetalinger auto. Niveau B. Rykkermails for manglende bilag. Bilagssamler til portal-leverandørerne. Første ugentlige «gennemse»-liste. | Månedsrapport v1 · procedurebeskrivelse færdig |
| **~14** | **Kriterium for opsigelse af bogholderen** (se nedenfor) → opsigelse sendes. | |
| **15–25** | Momsafstemning, periodelås, ejer-mellemregnings-værn, lån, revisorpakke. **Oktober lukkes af agenten 4/11 (3. hverdag: 2/11, 3/11, 4/11)** — bogholderen lukker den samme måned parallelt i sin sidste periode; forskellene gennemgås linje for linje. | |
| **Første momsfrist efter 1/10** | Momsafstemningen kørt grønt, Jonas indberetter. | |

**Kriteriet for opsigelse (dag ~14), målt, ikke skønnet:**
1. 7 grønne bevis-dage i træk på alle bankkonti.
2. Tørkørslen over 3 historiske måneder: ≥ 95 % af posteringerne (efter antal) konteret identisk med bogholderen, og hver afvigelse forklaret (bogholderfejl eller ny regel).
3. Skive 1 har bogført ≥ 2 ugers faste poster uden modpostering.
4. Procedurebeskrivelsen er underskrevet.

**Sidste arbejdsdag for bogholderen** styres af opsigelsesvarslet i kontrakten (ikke målt — tjek det i dag). Er varslet ≥ 1 måned, dækker det oktober-lukningen i parallel, hvilket er præcis det, I vil have. Bed bogholderen om overlevering: åbne poster, igangværende sager, afstemningsmapper, adgange de har, og hvornår sidste momsangivelse og årsafslutning blev lavet.

**Morten/Mola Invest:** spørg i dag, hvilken stak de bruger (bank-aggregator, bilagssamler, regnskabssystem), og hvad revisor sagde. Det kan spare et spor.

---

## 6. Tjekliste — adgange Jonas opretter

**Regel for alle nøgler:** Jonas indsætter dem selv i det nye Supabase-projekt: *Dashboard → Project Settings/Edge Functions → Secrets* (eller `supabase secrets set NAVN=…` i egen terminal). **Aldrig i chat, aldrig i repo.** Hvor en OAuth-flow er muligt, skriver functionen selv tokenet i databasen (Vault), så det aldrig passerer udklipsholderen.

### 1. Supabase-projektet
supabase.com/dashboard → vælg **din egen** organisation (ikke Lovables) → *New project* → navn `topix-bogholderi` → region i EU → stærk DB-adgangskode (password manager) → Pro-plan (backups). Derefter *Account → Access Tokens* → nyt token til CLI (bruges af dig i terminalen, ikke delt).

### 2. e-conomic
- **Pakke:** API kræver **Plus** eller højere (https://www.e-conomic.dk/priser). Smart er IKKE nødvendig længere — agenten erstatter Smart Inbox og Bank Workflows. Tjek din nuværende pakke under abonnement.
- **Udvikleraftale:** https://www.e-conomic.com/developer → tilmeld gratis udvikleraftale → log ind i den. — https://www.e-conomic.com/developer/connect
- **App:** fanen *Apps* → *New app* → navn «Topix bogholderi-agent» → rolle **Bookkeeping** (giver journals, accounts, vat-accounts — https://www.e-conomic.com/developer/permissions). Vedhæftning er ikke nævnt for rollen: **test i prøveregnskabet**; fejler vedhæftningen med 403, skift til SuperUser. → *Create* → **AppSecretToken vises ÉN gang** → direkte i secret `ECONOMIC_APP_SECRET`.
- **Prøveregnskab:** opret 14-dages prøveregnskab til udvikling (samme side) → giv appen adgang som nedenfor → `ECONOMIC_GRANT_TEST`.
- **Grant til det rigtige regnskab:** log ind i e-conomic som administrator (er du logget ind gennem en anden aftale, klik først *Administrer* på den rigtige aftale — https://www.e-conomic.dk/support/artikler/authentication-and-tokens) → åbn appens *Installation URL* (i udvikleraftalen: appen → *Tokens*) → godkend → **AgreementGrantToken** → secret `ECONOMIC_GRANT_<SELSKAB>` (fx `ECONOMIC_GRANT_TOPIX`). Én pr. regnskab/selskab.
- **Bankintegration (Aiia) i e-conomic:** lad den være tændt/tænd den — uafhængig kontrol; MitID, fornyes hver 180. dag. — https://www.e-conomic.dk/support/artikler/introduktion-og-opsaetning-af-bankintegration-i-e-conomic
- **Tilbagekald** (nødstop): tandhjul → Alle indstillinger → Udvidelser → Apps.

### 3. Nordea via Enable Banking
- enablebanking.com → opret konto i Control Panel → *register application* → miljø Production → nøglepar genereres (privat nøgle downloades som `.pem`) → redirect-URL: `https://<projekt-ref>.supabase.co/functions/v1/bank-samtykke-retur`. (Panelets præcise knapnavne er ikke målt.)
- Applikationen står i **restricted mode**: *link accounts* → Danmark → **«Nordea»** (= Nordea Business, SMV'er; «Nordea Corporate» kun hvis I bruger Corporate Netbank; «Nordea First Card» hvis I har firmakort dér — https://enablebanking.com/docs/markets/dk/) → log ind med **Nordea ID-appen eller MitID** → vælg alle erhvervskonti.
- Secrets: `ENABLEBANKING_APP_ID`, `ENABLEBANKING_PRIVATE_KEY` (hele PEM-indholdet).
- **Kontrakt:** skriv til Enable Banking samme dag om produktionsaftale for én kunde med 1–3 konti. Pris er volumenbaseret med minimumsfakturering, ikke offentlig (https://enablebanking.com/docs/faq/). Restricted mode dækker evalueringen, til kontrakten er på plads.
- **Kalender:** påmindelse 170 dage frem — samtykket udløber efter højst 180 dage. Agenten mailer også 14 og 3 dage før.
- *Fravalgt:* Nordeas egen Open Banking-API (PSD2-adgang er for licenserede tredjeparter — https://openbankingtracker.com/provider/nordea/apis; en direkte virksomhedsaftale er ikke målt og er tungere end en aggregator). e-conomics Aiia-feed som kilde (Nordea-poster 1–3 bankdage forsinket, bankafstemningen ikke fundet i API'et).

### 4. bilag@topix.dk (Google Workspace)
- admin.google.com → *Directory → Users → Add new user* → `bilag@topix.dk` (egen postkasse; agenten skal IKKE have adgang til din).
- console.cloud.google.com → nyt projekt `topix-bogholderi` → *APIs & Services → Library* → **Gmail API** → *Enable* → *OAuth consent screen* → type **Internal** → *Credentials → Create credentials → OAuth client ID* → *Web application* → redirect-URI `https://<projekt-ref>.supabase.co/functions/v1/gmail-samtykke-retur` → secrets `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`.
- Åbn derefter functionens samtykkelink **logget ind som bilag@** → scope `gmail.modify` (læse + sætte label) → refresh-tokenet skrives af functionen i Vault. Ingen domain-wide delegation (den ville give adgang til alle postkasser).

### 5. Stripe (læs)
dashboard.stripe.com → *Developers → API keys* → *Create restricted key* → navn «bogholderi-agent (kun læs)» → **Read** på: Balance, Balance transactions, Payouts, Charges, Invoices, Credit notes, Refunds → alt andet None → secret `STRIPE_LAES_KEY`. (Adskilt fra platformens nøgle.)

### 6. Claude API
console.anthropic.com → *API Keys* → *Create key* «topix-bogholderi» → secret `ANTHROPIC_API_KEY`. Sæt et månedligt forbrugsloft.

### 7. Billing-mail hos leverandørerne
For hver leverandør på listen (dag 1): billing-/faktura-mail → `bilag@topix.dk`. Minimum: Google Workspace (Admin → Billing → kontakter), Meta (Business Settings → Billing & payments), Lovable, Klaviyo, Mailgun, eWebinar, Bunny, Calendly, Stripe (Settings → Business → e-mails for kvitteringer), telefoni, forsikring, revisor.

### 8. Revisor (én samtale, ~1 time)
Kontoplan + momskode-kort · momsbehandling af Stripe-gebyrer og udenlandske SaaS · bankbilag for gebyrer/renter · bekræftelse af «registreret system + forsystem» · rentesats på ejerlån · revisors adgang til e-conomic.

### 9. Beslutninger (Jonas)
Hvilke selskaber (Topix.dk ApS? The Boardroom? SnowWaves?) — én grant og én `selskab`-række pr. regnskab · startlofter (25.000 / 3.000 / 100.000 dagsloft) · rapportmodtagere · hvem der svarer på køen, når du er væk.

---

## Bilag A — Udkast: Beskrivelse af bogføringsprocedurer (bogføringslovens § 6)

**Topix.dk ApS, CVR [indsæt] — gældende fra [dato]. Ansvarlig: Jonas Herlev, direktør.**

1. **Bogføringssystem.** Selskabet bogfører i Visma e-conomic (registreret digitalt standardbogføringssystem, Erhvervsstyrelsens fortegnelse). Alle registreringer og bilag opbevares i e-conomic.
2. **Forsystem.** Registreringerne udføres automatisk af selskabets bogføringsagent (et forsystem drevet af selskabet i et separat Supabase-projekt i EU), som via e-conomics API opretter kladdeposteringer, vedhæfter bilag og bogfører. Agenten har adgang til e-conomic gennem en app med rollen [Bookkeeping], som ledelsen kan tilbagekalde når som helst.
3. **Indhentning af transaktioner.** Banktransaktioner hentes fra Nordea via Enable Banking (licenseret kontoinformationstjeneste) op til fire gange dagligt. Salg og gebyrer hentes fra Stripe.
4. **Indhentning af bilag.** Leverandører sender bilag til bilag@topix.dk; øvrige hentes via leverandørernes API'er eller portaler. Hvert bilag får et SHA-256-aftryk ved modtagelse; det samme bilag vedhæftes posteringen i e-conomic.
5. **Løbende registrering.** Transaktioner registreres som hovedregel samme dag, de foreligger (§ 7, stk. 1). En transaktion uden bilag efter fem hverdage rykkes hos ledelsen.
6. **Kontering og moms.** Kontering og momskode følger et regelsæt godkendt af ledelsen [dato] efter gennemgang med revisor. Automatisk bogføring sker kun, når alle betingelser i regelsættet er opfyldt (tillid, beløbsgrænser, åben periode, grøn daglig afstemning). Øvrige transaktioner forelægges ledelsen, hvis svar indgår i regelsættet.
7. **Rettelser.** Bogførte posteringer ændres aldrig; fejl rettes ved modpostering med henvisning til den oprindelige postering og begrundelse.
8. **Afstemning.** Bankkonti og Stripe-mellemregning afstemmes automatisk dagligt mod bankens og Stripes saldi. Afvigelse stopper automatisk bogføring, til den er afklaret. Moms afstemmes før hver indberetning; indberetningen foretages af ledelsen. Måneder låses efter afstemning senest 3. hverdag i efterfølgende måned.
9. **Kontrolspor.** Alle agentens handlinger logges uforanderligt (forespørgsel, svar, tidspunkt), og enhver postering kan følges fra bilagsnummer til banktransaktion, bilag, regel og godkender.
10. **Opbevaring og sikring.** Regnskabsmaterialet opbevares i e-conomic i mindst 5 år fra udgangen af det regnskabsår, det vedrører (§ 12), med kopi i forsystemet (EU, daglig backup). Adgangsnøgler opbevares som krypterede hemmeligheder, som kun ledelsen administrerer.
11. **Ansvar.** Ledelsen (Jonas Herlev) er ansvarlig for procedurerne, for regelsættet og tærsklerne, for besvarelse af forelagte transaktioner, for momsindberetning og for månedlig gennemgang af rapporten. Revisor [navn] foretager årsafslutningens skøn.
12. **Nødstop.** Ledelsen kan stoppe automatisk bogføring øjeblikkeligt via stop-link, konfiguration eller tilbagekaldelse af app-adgangen.

Dato / underskrift: ______________________

## Bilag B — Skabelon: Låneaftale (anpartshaver → selskab)

**Långiver:** [navn, adresse] · **Låntager:** Topix.dk ApS, CVR [ ]
1. **Beløb:** [ ] kr., udbetalt til låntagers konto [reg./konto] den [dato].
2. **Rente:** [ ] % p.a., fast/variabel [angiv reference], beregnet som hovedstol × sats × dage/365, tilskrives [månedligt/årligt] og betales [ved tilskrivning/sammen med afdrag]. Satsen er fastsat af ledelsen [dato] med henvisning til markedsrenten (LL § 2).
3. **Afdrag og løbetid:** [anfordringslån, opsigeligt med [ ] måneders varsel] / [afdrag [ ] kr. pr. [ ], sidste rate [dato]].
4. **Førtidig indfrielse:** låntager kan indfri helt eller delvist uden gebyr.
5. **Sikkerhed:** ingen / [ ].
6. **Efterstillelse:** [valgfrit — lånet står tilbage for selskabets øvrige kreditorer]. Aftales med revisor.
7. **Misligholdelse:** ved låntagers konkurs eller rekonstruktion forfalder restgælden.
8. **Lovvalg:** dansk ret.

Dato / underskrifter: långiver ______ · låntager (bestyrelse/direktion) ______

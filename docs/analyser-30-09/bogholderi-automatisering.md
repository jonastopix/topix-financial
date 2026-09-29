# Automatiseret bogholderi i e-conomic — recon og struktur

Udarbejdet 29/9-2026 (filnavn 30-09) af Claude som teknisk arkitekt. **Research-baseret, intet målt i jeres systemer**: ingen adgang til e-conomic, bank eller data. Alt, der står som «ikke målt», er netop det. Kilder står ved hvert punkt.

---

## 0. Konklusionen først

1. **e-conomic har allerede meget af det, I vil bygge.** Bankintegration (via Aiia, gratis i alle pakker, samtykke fornyes hvert 180. dag), bankafstemning med automatisk matching, en fast bilagsmail pr. aftale, og i Smart-pakken (399 kr./md.) automatisk aflæsning af bilag og konteringsforslag. Det første skridt er at slå de funktioner til og måle, hvad de klarer, *før* der bygges noget. At bygge en egen bank→afstemning-motor ved siden af en bankafstemning, I allerede betaler for, er den nemme vej forklædt som den ambitiøse.
2. **Enable Banking er formentlig ikke nødvendig i fase 1** — og deres gratis «restricted mode» er ifølge deres egen dokumentation til evaluering og «individual non-commercial use». Et selskabs bogholderi kræver en kontrakt (pris kun på forespørgsel). Brug den kun, hvis I skal have bankdata ind i jeres EGEN motor (fx til likviditet i månedsrapporten eller forhåndsmatch af bilag), og kun efter at have målt, at e-conomics egen bankfeed ikke rækker.
3. **Premissen om anpartshaverlån er forældet.** Selskabslovens §§ 210–212 blev ophævet pr. 1/1-2025 (lov nr. 1668 af 30/12-2024). Skattereglen i ligningslovens § 16 E består (ændret for lån fra 1/1-2026). Lån *fra* ejer *til* selskab var aldrig omfattet af § 210; dér er spørgsmålet renten (markedsrente, LL § 2).
4. **Motoren skal ikke bo i The Boardroom-platformens Supabase.** Det er et Lovable-ejet projekt med kunde-persondata, manuel deploy gennem build-chat og ingen CLI-adgang. Bogholderiet for selskabet er et andet domæne med andre hemmeligheder (bank, e-conomic). Anbefaling: et **separat Supabase-projekt, som I selv ejer**, med samme husregler (tørkørsel som standard, lås i `app_config`, spor-tabeller, værn).
5. **Autobogføring findes ikke i fase 1–2.** Motoren laver udkast i en kladde. Et menneske bogfører. Det er både ledelsens ansvar efter bogføringsloven og den eneste måde at bevise motorens træfsikkerhed på.
6. **Bogholderen kan opsiges, når tre måneders lukning er gået igennem med motoren uden rettelser fra revisor**, og revisor har godkendt bogføringsprocedurebeskrivelsen og kontoplanen. Ikke før.

---

## 1. e-conomic API

### 1.1 Autentifikation
- To tokens i hver request: `X-AppSecretToken` (udviklerens app) og `X-AgreementGrantToken` (adgangen til netop jeres regnskab). Udvikleraftalen er gratis. Man opretter en app, får App Secret Token, og sender appens «Installation URL» til en bruger i regnskabet, som godkender og får grant-tokenet. — https://www.e-conomic.com/developer/connect
- Demo: `X-AppSecretToken: demo` / `X-AgreementGrantToken: demo`, kun GET. — https://restdocs.e-conomic.com/
- Tokens ses og tilbagekaldes under tandhjul → Alle indstillinger → Udvidelser → Apps. Superbrugeren ser alle tokens på aftalen. — https://www.e-conomic.dk/support/artikler/om-api-token
- Test: 14-dages prøveregnskab med demodata eller blankt (forlængelse efter aftale). — https://www.e-conomic.com/developer/connect

### 1.2 Krævet abonnement og pris
- Prisside (hentet 29/9-2026, ekskl. moms): Basis 249 kr./md., Plus 299, Smart 399, Komplet 649. Fuld API-adgang («Fri adgang til integrationer (API)») er i **Plus, Smart og Komplet**; Basis kun udvalgte integrationer (lønsystemer). Bankintegration og bankafstemning i alle pakker. **Automatisering af bankafstemning (Bank Workflows, Autoforslag) og Smart Inbox (automatisk aflæsning + konteringsforslag) kun i Smart og Komplet.** Pakkerne skaleres efter posteringsantal pr. år (1.000 → 800.000), automatisk opgradering ved overskridelse. — https://www.e-conomic.dk/priser
- Konsekvens: **Smart (399 kr./md.) er minimum** for planen her. Hvilken pakke og posteringsniveau I er på i dag: ikke målt.

### 1.3 To API-generationer
- **REST** (restdocs.e-conomic.com) og **OpenAPI** (apis.e-conomic.com, versionerede delsystemer som `journalsapi`, `bookedentriesapi`, `documentsapi`, `webhooksapi`). Roadmap: SOAP udfases; nye API'er kommer på OpenAPI; ingen datoer. — https://www.e-conomic.com/developer/api-roadmap
- Anbefaling: byg på **OpenAPI**, hvor et endepunkt findes der; REST for resten. Kontrollér versionen ved start (Journals-API var v15.0.1 ved opslaget).

### 1.4 Kladder (journals) og posteringer
- OpenAPI Journals: `GET/POST/PUT/DELETE /draft-entries`, `POST /draft-entries/bulk` og `PUT /draft-entries/bulk` (op til 500 pr. kald), `DELETE /draft-entries/delete/{journalNumber}`, `GET /draft-entries/paged`, `GET /draft-entries/count`, periodiseringer (accruals) på kladdelinjer, `GET/POST/PUT/DELETE /journals`, og **`POST /journals/[id]/book`** (bogfør kladden). Posteringstyper: Customer Payment (2), Supplier Invoice (3), Supplier Payment (4), Finance Voucher (5), Manual Customer Invoice (10). Bilagsnummer valgfrit; serveren tildeler. — https://apis.e-conomic.com/journalsapi/redoc.html
- REST: `POST /journals/:journalNumber/vouchers` med de samme fem typer, flere typer i ét kald. — https://techtalk.e-conomic.com/journals-in-the-rest-api/
- **Designregel:** motoren må aldrig kalde `/book`. Bogføring sker i UI'et af et menneske (fase 1–2). Endepunktet findes — derfor skal det spærres i koden med et værn, ikke kun ved god vilje.

### 1.5 Bilag / vedhæftninger
- REST: vedhæftning pr. bilag med flere sider/elementer (`.../attachment` og `.../attachment/items`), PDF/JPG/JPEG/PNG, virker på både kladde- og bogførte bilag. — https://techtalk.e-conomic.com/new-feature-voucher-attachments-in-rest-api/
- OpenAPI Documents API: `POST /documentsapi/{version}/AttachedDocuments` (upload), `GET .../{number}`, `GET .../{number}/pdf`, liste over **ikke-tilknyttede** dokumenter (`?filter=voucherNumber$eq:$null`), `DELETE`. PDF/JPG/PNG. Hård timeout 5 min pr. upload. Ingen OCR nævnt. — https://www.e-conomic.dk/support/artikler/documents-api-developer-guide
- Filstørrelsesgrænse for API-upload: ikke fundet i dokumentationen. Inbox (UI/mail): **maks. 9 MB pr. fil, filer under 20 KB frasorteres**. — https://www.e-conomic.dk/support/artikler/upload-bilag

### 1.6 Kontoplan, moms, saldi
- REST: `/accounting-years`, `/accounting-years/:year/entries`, `/accounting-years/:year/totals`, `/accounting-years/:year/periods`. — https://restdocs.e-conomic.com/
- OpenAPI BookedEntries: `GET /booked-entries` (cursor, 1.000 pr. side), `/booked-entries/paged` (max 10.000 i alt), `/booked-entries/count`, filtre på `accountNumber`, `date`, `voucherNumber`; `POST /booked-entries/match` og `GET /booked-entries/matched-pairs` (udligning). — https://apis.e-conomic.com/bookedentriesapi/redoc.html
- Konti (`/accounts`) og momskoder (`/vat-accounts`) findes i REST-API'et (standardressourcer), men selve siderne blev ikke hentet i denne recon — **læs dem ved første kald, gæt ikke momskoderne**.
- Saldobalance: bygges af `/accounting-years/:year/totals` pr. konto/periode. Om e-conomics færdige rapporter (fx balance-PDF) kan hentes via API: ikke fundet.

### 1.7 Bankafstemning i e-conomic
- Bankposteringer kommer ind automatisk via bankintegration eller manuelt via CSV. Automatisk matching («Systemet parer selv de poster, der hører sammen») og manuel afstemning. — https://www.e-conomic.dk/support/artikler/om-bankafstemning
- Bankintegrationen leveres af **Aiia (Nordic API Gateway)**, godkendt af Finanstilsynet; **genaktivering hver 180. dag**, påmindelse pr. mail; **koster ikke ekstra** i nogen pakke. — https://www.e-conomic.dk/support/artikler/introduktion-og-opsaetning-af-bankintegration-i-e-conomic
- **Om bankafstemningsmodulet (bankposteringerne og deres match-status) kan læses eller skrives via API: ikke fundet i dokumentationen.** Det er det vigtigste åbne tekniske spørgsmål. Skriv til api@e-conomic.com, før der bygges noget på det.

### 1.8 Webhooks
- OpenAPI Webhooks: `GET /EventTypes` lister hændelser (fx `INVOICE_BOOKED`, `CUSTOMER_UPDATED`); `POST /webhooks` (eventType, name, url, contentType, op til 5 egne headers); **kun én webhook pr. hændelsestype pr. aftale**. **Signering/verifikation af payload er ikke beskrevet.** — https://apis.e-conomic.com/webhooksapi/redoc.html
- Konsekvens for husets Bucket C-regel: uden signatur må webhooken kun bruges som «noget er sket — hent selv» (delt hemmelighed i en custom header + genlæsning via API), aldrig som kilde til data.

### 1.9 Rate limits
- OpenAPI svarer 429 med ventetid i headers; konkrete tal er ikke oplyst. — https://apis.e-conomic.com/bookedentriesapi/redoc.html. REST: intet fundet. Byg med backoff og bulk-endepunkter fra start (samme lære som Mailgun-loftet 29/9).

### 1.10 Hvad kun kan gøres i UI (så vidt fundet)
- Bank Workflows/Autoforslag og Smart Inbox-forslagene: intet API fundet.
- Momsangivelse til SKAT og årsafslutning: e-conomic-funktioner i UI.
- Oprettelse af bankintegration og fornyelse af samtykke (MitID).

---

## 2. Enable Banking

- **Flow:** app registreres, private key genereres; JWT (RS256, `iss: enablebanking.com`, `aud: api.enablebanking.com`, `kid` = app-id, max 1 times udløb). `GET /aspsps?country=DK` → `POST /auth` (med `access.valid_until`) → bankens login (MitID) → redirect med `code` → `POST /sessions` → `GET /accounts/{uid}/balances` og `GET /accounts/{uid}/transactions`. — https://enablebanking.com/docs/api/quick-start/
- **Samtykke:** maks. `valid_until` bestemmes af banken (`maximum_consent_validity` i sekunder); «flertallet» understøtter 180 dage. — https://enablebanking.com/docs/faq/. Enable Banking skiftede standard til 180 dage i oktober 2025, og SCA-rammen blev ændret fra 90 til 180 dage (sekundær kilde: https://github.com/we-promise/sure/issues/2854).
- **Hentefrekvens:** «Many ASPSPs have the limit of 4 times a day» når brugeren ikke er online. Historik: typisk mindst ét år. — https://enablebanking.com/docs/faq/
- **Danske banker** (Enable Bankings Danmarks-side): Danske Bank, Nordea (+ Nordea Corporate, Nordea First Card), Jyske Bank, Sydbank, Nykredit Bank, Spar Nord Bank, Arbejdernes Landsbank, Saxo Bank, Vestjysk Bank. MitID som SCA; Nordea Business ofte via Nordea ID. **Spar Nord flyttet til Nykredits IT pr. juni 2026.** — https://enablebanking.com/docs/markets/dk/
- **Lunar: ikke fundet** på Enable Bankings Danmarks-side eller i openbankingtracker's liste (side 1). — https://www.openbankingtracker.com/api-aggregators/enablebanking/banks/1. Bruger I Lunar, skal det måles i `GET /aspsps?country=DK`.
- **Licens:** FAQ: kunder behøver ikke egen licens for at bruge standardinfrastrukturen (TPP'er med egne eIDAS-certifikater er en anden model). — https://enablebanking.com/docs/faq/ og https://enablebanking.com/docs/tpp/getting-started/. At Enable Banking selv er AISP under det finske finanstilsyn (FIN-FSA) står kun i en sekundær kilde (https://apis.io/providers/enable-banking/); de figurerer også i det estiske tilsyns register over grænseoverskridende betalingstjenesteudbydere (https://www.fi.ee/en/payment-services/payment-institutions/payment-services/providers-cross-border-payment-sevices/enable-banking-oy). **Mål i Finanstilsynets register før kontrakt.**
- **Pris:** volumenbaseret pr. forbundet konto pr. måned med minimumsfakturering; ingen offentlige tal. — https://enablebanking.com/docs/faq/, https://www.g2.com/products/enable-banking/pricing
- **Restricted mode** (egne konti linket, gratis at aktivere): til «evaluation in real-life scenarios before a contract» og «individual non-commercial use». — https://enablebanking.com/docs/api/linked-accounts/. **Et ApS' bogholderi er ikke non-commercial.** Brug det til proof-of-concept; drift kræver kontrakt.
- **Sammenligning:** e-conomics egen feed (Aiia) er gratis, 180 dage og lander direkte i bankafstemningen. Enable Banking giver JER rådata. Det er kun værd at betale for, hvis motoren selv skal bruge transaktionerne.

---

## 3. Bilagsindhentning — realistiske kanaler

| Kanal | Hvad | Kilde |
|---|---|---|
| **e-conomics bilagsmail** | Fast adresse pr. aftale (`xxxbilagxxxxxxx@e-conomic.dk`), PDF/PNG/JPEG/GIF, max 9 MB. Også upload, app, træk-og-slip og automatisk mailforbindelse via Microsoft. «Bilagsindsendere» kan oprettes. | https://www.e-conomic.dk/support/artikler/upload-bilag, https://www.e-conomic.dk/funktioner/bilagsindsendere |
| **Smart Inbox** (Smart/Komplet) | Automatisk aflæsning + konteringsforslag i e-conomic. | https://www.e-conomic.dk/priser |
| **Egen bilag@-indbakke** | Én adresse (fx bilag@topix.dk), som alle leverandører sender til; motoren læser, dedublerer, arkiverer og videresender/uploader. I bruger allerede Mailgun EU; om inbound-routing er slået til/muligt på jeres konto: **ikke slået op**. | — |
| **Stripe** | Stripes gebyrfakturaer (tax invoices) hentes i Dashboard → Settings → Plans and fees → Invoice history, klar senest den 10. i næste måned. API eller mail er ikke nævnt. Jeres *egne* kundefakturaer og payouts (balance transactions) findes i API'et. | https://support.stripe.com/questions/download-tax-invoices-for-stripe-fees |
| **Meta** | Ved månedlig fakturering mailes fakturaen til billing-kontakten. Ved betaling pr. debitering **mailes kvitteringen ikke** og skal hentes i Transaction History. Officielt API (`business_invoices`) findes kun for fakturerede konti: ikke målt for jer. | https://tailride.so/blog/download-meta-ads-invoices, https://developers.facebook.com/docs/marketing-api/2tier-bm-solution/guides/invoice-group |
| **Google Workspace** | Fakturaer i Admin console / Payments center; officielt download-API ikke fundet. Tredjepartsværktøjer skraber konsollen. | https://invoiceradar.com/how-to/download-invoices-from-google-workspace |
| **Mailgun, Klaviyo, Lovable, Bunny, eWebinar, Calendly m.fl.** | Ikke slået op enkeltvis. Erfaringsmæssigt faktura pr. mail og/eller i en portal. **Gør én ting:** sæt billing-mail til bilag@ i hver konto og mål, hvem der faktisk sender PDF. | — |
| **Tredjeparts bilagssamlere** (GetMyInvoices, Invoice Radar o.l.) | Logger ind i portalerne for jer. Et forsystem med jeres login — vurdér sikkerheden, før det tages i brug. | https://www.getmyinvoices.com/en/online-portals/meta-api-bills-invoices-download-1444797 |
| **E-fakturaer (OIOUBL/Peppol)** | Registrerede systemer SKAL kunne modtage dem direkte. Danske leverandører bør sende dertil. | https://erhvervsstyrelsen.dk/krav-til-digitale-standard-bogfoeringssystemer |

**OCR/AI-læsning:** Smart Inbox først (betalt, i systemet). Egen LLM-læsning af PDF kun til det, Smart Inbox ikke klarer: udenlandske fakturaer i USD/EUR, reverse charge og fakturaer uden CVR. Resultatet er altid et *forslag* med kildefelter, aldrig en postering.

**Opgørelsen, der skal laves før alt andet:** en liste over alle leverandører, der har trukket penge de sidste 12 måneder (fra kontoudtoget), med kolonnerne: kanal for faktura · mailes den? · valuta · EU/ikke-EU/DK · foreslået konto · momsbehandling. Det er fundamentet for regelmotoren, og det kan laves på en eftermiddag ud fra et kontoudtog.

---

## 4. Lovkrav og ansvar

### 4.1 Bogføringsloven (lov nr. 700 af 24/5-2022) — https://www.retsinformation.dk/eli/lta/2022/700
Opsummeret efter Erhvervsstyrelsens vejledning (https://erhvervsstyrelsen.dk/vejledning-bogfoeringsloven):
- Registrering «nøjagtigt og snarest muligt» (§ 7, stk. 1).
- Alle transaktioner dokumenteres ved bilag; kontrolspor.
- **Opbevaring i 5 år fra udgangen af det regnskabsår, materialet vedrører** (§ 12).
- Registreringer og bilag opbevares i det digitale bogføringssystem (§ 16, stk. 1, nr. 2).
- Nødvendige afstemninger, så grundlaget for lovpligtige indberetninger er opdateret (§ 11).
- **Beskrivelse af bogføringsprocedurer** er påkrævet (registrering, sikring, ansvarsfordeling). Motoren SKAL stå i den.
- ApS med registreret standardsystem: digital bogføring påkrævet fra 1/1-2024.

### 4.2 Registreret standardsystem
- **e-conomic står på Erhvervsstyrelsens fortegnelse** (Visma e-conomic A/S, CVR 29403473, registreret 19.12.2023). — https://erhvervsstyrelsen.dk/fortegnelse-over-registrerede-bogfoeringssystemer
- Funktionskrav bl.a.: 5 års opbevaring, e-faktura (OIOUBL + Peppol BIS), import af bankdata, automatisk backup, SAF-T. — https://erhvervsstyrelsen.dk/krav-til-digitale-standard-bogfoeringssystemer
- **Åbent spørgsmål til revisor:** bliver kombinationen «registreret system + eget forsystem» et *ikke-registreret/kombineret* system, som I selv skal stå inde for (ugentlig backup i EU/EØS, IT-sikkerhed osv.)? — https://erhvervsstyrelsen.dk/ikke-registrerede-digitale-bogfoeringssystemer. Vejledningen svarer ikke direkte. **Designet undgår spørgsmålet:** e-conomic er det ENESTE sted, hvor registreringer og bilag er kanoniske. Motoren er et forsystem, der kun laver forslag og arkiverer kopier.

### 4.3 Hvad en revisor forventer (typisk, ikke specifikt målt for jeres revisor)
Saldobalance med afstemte balancekonti (bank, moms, mellemregninger, debitorer/kreditorer), momsafstemning pr. periode mod angivelser, anlægskartotek og afskrivninger, periodiseringsliste, låneaftaler og saldobekræftelser, bilag på alle posteringer, bogføringsprocedurebeskrivelse. **Spørg jeres revisor, hvilken liste de selv bruger, og byg klargøringen efter den.**

### 4.4 Hvad IKKE automatiseres (skøn og ledelsens ansvar)
Periodiseringer ved årsskifte, afskrivningsprofiler og aktivering vs. udgiftsførsel, hensatte forpligtelser, nedskrivning af tilgodehavender, moms på grænsetilfælde (repræsentation, blandede ydelser), selskabsskat og udskudt skat, årsrapporten (ledelsen underskriver). Motoren kan *foreslå* og *markere*; den afgør ingen af dem.

### 4.5 Lån fra ejer til selskabet
- **Bogføring (neutral, typisk):** indbetaling bogføres debet bank / kredit en gældskonto til den nærliggende part — «mellemregning anpartshaver» eller «lån fra anpartshaver» under kortfristet/langfristet gæld efter vilkårene. Renter debet renteudgifter / kredit skyldige renter (eller mellemregningen). Én konto pr. långiver. Kontonumre fastlægges med revisor.
- **Låneaftale:** skriftlig: beløb, rente, afdrag/forfald, efterstillelse (relevant ved kapitaltab), underskrevet af begge. Den er bilaget.
- **Rente:** SKATs juridiske vejledning C.B.3.7: «Hvis en hovedaktionær låner penge ud til sit selskab, skal der betales en sædvanlig markedsrente» (LL § 2); domstolene har accepteret «diskontoen + 4 pct.» som udtryk for markedsrente i konkrete sager. Renten er fradragsberettiget for selskabet og skattepligtig for långiver. — https://info.skat.dk/data.aspx?oid=1946448. Rentefrihed og for høj rente er skønsspørgsmål → **revisor**.
- **Periodisering af rente** hos långiver: LL § 5, stk. 4–5. — https://info.skat.dk/data.aspx?oid=2167224
- **Den anden vej (selskab → ejer):** selskabslovens §§ 210–212 er **ophævet pr. 1/1-2025** (lov nr. 1668 af 30/12-2024); kontrollen er ophørt, og de almindelige regler om kapitalforhøjelse/udlodning (SL §§ 115–118, 127, 179) gælder. — https://erhvervsstyrelsen.dk/vejledning-ophaevelse-af-bestemmelser-om-kontrol-med-kapitalejerlaan. **Skattereglen i LL § 16 E består:** lånet beskattes ved optagelsen; for lån fra 1/1-2026 giver tilbagebetaling et skattemæssigt «gældskonto», så man kun beskattes af det højeste lånte beløb. — https://www.pwc.dk/da/artikler/2025/06/nye-regler-for-auktionaerlaan.html. **Motorregel:** en mellemregningskonto til en anpartshaver, der går i *debet* (selskabet har penge til gode), udløser straks en alarm til Jonas og revisor.

---

## 5. Arkitektur

### 5.1 Hvor motoren bor
| Mulighed | For | Imod |
|---|---|---|
| The Boardroom-projektet (Lovable-ejet Supabase) | Kendt stak | Kunde-persondata og bankdata i samme projekt; ingen CLI; manuel deploy via build-chat; forkert selskab/domæne; én fejl i platformen rammer bogholderiet og omvendt |
| **Separat Supabase-projekt, ejet af jer (anbefalet)** | Samme mønstre (Deno, cron, pg_net, spor-tabeller); fuld CLI og `db push`; egne secrets; lille blast-radius | Nyt projekt at drive; ~25 USD/md. for Pro (ikke slået op) |
| Make/n8n | Hurtigt at koble | Regelmotor, tests og kildeværn passer dårligt; svært at bevise |

Eget repo (fx `topix-bogholderi`) med samme discipliner: tørkørsel som standard, lås i `app_config`, spor-tabel pr. ekstern skriver, rene domme i `_shared/` med tests, kildeværn.

### 5.2 Dataflow
```
Bank ──(e-conomic Aiia-feed)──────────────► e-conomic Bankafstemning ◄── menneske afstemmer
  └─(Enable Banking, KUN hvis målt nødvendigt)─► bank_transaktioner (motor)

Leverandører ─mail─► bilag@ ─► bilag_indgaaet (motor: hash, dublet, afsender, beløb, dato, valuta)
                          └──► e-conomic bilagsmail / Documents API (kanonisk kopi)

bilag_indgaaet + bank_transaktioner + regler
      ─► konteringsforslag (konto, momskode, modpart, sikkerhed, begrundelse)
      ─► POST /draft-entries (kladde «AUTO-FORSLAG») + vedhæft bilag
      ─► MENNESKE gennemgår kladden i e-conomic ─► Bogfør (UI)
      ─► bookedentries læses tilbage ─► spor: forslag vs. bogført (træfsikkerhed pr. regel)
```

### 5.3 Menneske-i-løkken
1. Ny leverandør → ingen regel → forslaget markeres «ukendt», intet gæt på konto.
2. Enhver kladdelinje → menneske bogfører. `POST /journals/{id}/book` er forbudt i koden (værn).
3. Momskode på udenlandske ydelser (omvendt betalingspligt) → første gang pr. leverandør godkendes af revisor.
4. Månedslukning → Jonas godkender afstemningslisten, før rapporten sendes.
5. Alt over et beløbsloft (fx 10.000 kr.) → manuel gennemgang uanset regel.

### 5.4 Regelmotor for kontering
- Tabel `konteringsregler`: `modpart_noegle` (CVR, bankens modpartstekst eller afsenderdomæne — **en observation, aldrig en nøgle, før den er normaliseret ét sted**), `konto`, `momskode`, `valuta`, `periodisering` (fx 12 mdr.), `gyldig_fra/til`, `godkendt_af`.
- Dommen er ren og testet (`dømKontering(bilag, bankpost, regler) → forslag | ukendt`), med begrundelse i klartekst.
- Momskoder og konti læses fra e-conomic (`/vat-accounts`, `/accounts`), aldrig hardkodet; en regel, der peger på en konto, som ikke længere findes, fælder.
- Træfsikkerhed pr. regel måles fra sporet (forslag vs. faktisk bogført); en regel under fx 95 % over 20 forslag degraderes til «spørg».

### 5.5 Fejlfinding i eksisterende bogføring (kan køres read-only fra dag 1)
- Balancekonti uden afstemning: bank mod kontoudtog pr. månedsskifte, moms mod angivelser, mellemregninger.
- Dubletter: samme beløb + modpart + dato ±3 dage; samme bilagshash på to bilag.
- Posteringer uden vedhæftet bilag (bookedentries × Documents API).
- Momsfejl: udenlandsk leverandør uden omvendt betalingspligt; dansk leverandør med EU-kode; momsprocent ≠ 25 % af netto.
- Kontoplan: konti uden bevægelse, konti med modsat fortegn af forventet, poster på «diverse»/«ukendt».
- Periodeforskydning: bilagsdato vs. bogføringsdato > 1 måned.
Leveres som én rapport med én række pr. fund og et link til bilaget. **Ingen rettelser automatisk** — rettelser bogføres af et menneske i en kladde med henvisning til fundet.

### 5.6 Månedsrapport
Resultat pr. måned og år-til-dato mod budget, likviditet (bank), moms til betaling næste frist, debitorer/kreditorer, åbne fund fra fejlfindingen, bilag der mangler, antal forslag, andel bogført uden rettelse. Rene domme; tal for perioder, der ikke er afsluttet, markeres (husets «tæller og nævner over samme vindue»). Sendes til Jonas (og evt. Morten) den 5. hverdag. Budgetkobling til de eksisterende budgetark (Topix 2026): ikke målt.

---

## 6. Faser (skønnet omfang)

| Fase | Indhold | Skøn | Kriterium for at gå videre |
|---|---|---|---|
| **0 — Mål** | Snak med Morten om Mola Invest (hvad virkede, hvilken stak). Leverandørliste fra 12 mdr. kontoudtog. Nuværende pakke. Opgrader til Smart, slå Aiia-feed, bankafstemning, Bank Workflows og Smart Inbox til. Sæt billing-mail til bilag@ overalt. Spørg api@e-conomic.com om bankafstemning via API og webhook-signering. | 1 uge, næsten ingen kode | Tal: andel bankposter automatch'et, andel bilag med korrekt Smart-forslag |
| **1 — Læs** | Nyt Supabase-projekt + repo. e-conomic-klient (læs). Fejlfindingsrapport over indeværende og forrige regnskabsår. Kontoplan-gennemgang med revisor. | 2–3 uger | Revisor har set fejlrapporten; kontoplan låst |
| **2 — Foreslå** | bilag@-indtag, dublet- og manglende-bilag-dom, regelmotor, kladdeudkast (`/draft-entries`) + vedhæftning. Månedsrapport v1. | 3–5 uger | 2 måneder med ≥ 90 % forslag bogført uden rettelse |
| **3 — Lukke** | Månedslukningstjekliste i motoren (afstemninger, moms, mellemregninger), revisorpakke, låneregistrering med renteberegning (regnestykket skrevet ud). | 2–3 uger | 3 lukkede måneder uden revisorbemærkninger |
| **4 — (måske) autobogføring** | Kun for regler med dokumenteret træfsikkerhed, kun under et beløbsloft, kun med revisorens accept og opdateret procedurebeskrivelse. | — | Separat beslutning |

**Før bogholderen opsiges:** fase 3 gennemført; bogføringsprocedurebeskrivelsen opdateret og godkendt af revisor; der er en navngiven person (Jonas) med tid afsat hver uge; en aftale med revisor om ad hoc-skøn (moms, periodisering, årsafslutning); og bogholderens overlevering modtaget (åbne poster, igangværende sager, adgange, afstemningsmapper). Tjek opsigelsesvarslet i kontrakten nu — det sætter den reelle tidsplan.

---

## 7. Tjekliste — beslutninger og adgange (Jonas)

**Beslutninger**
- [ ] Hvilket selskab/hvilke selskaber (Topix ApS? The Boardroom? SnowWaves?) — ét regnskab pr. e-conomic-aftale, én grant pr. aftale.
- [ ] e-conomic-pakke: Smart (minimum) eller Komplet (godkendelsesflows, flere brugere).
- [ ] Enable Banking: ja/nej — først efter fase 0-målingen.
- [ ] Motorens hjem: separat Supabase-projekt (anbefalet).
- [ ] Beløbsloft for manuel gennemgang.
- [ ] Hvem modtager månedsrapporten.
- [ ] Revisorens rolle efter opsigelsen (løbende sparring vs. kun årsafslutning).

**Adgange (oprettes af Jonas selv — aldrig indsat i chat; direkte i Supabase secrets)**
- [ ] e-conomic udvikleraftale (gratis) → app → App Secret Token.
- [ ] Installation URL godkendt af en superbruger → Agreement Grant Token (én pr. regnskab). Tildel appen mindst mulige rettigheder.
- [ ] Prøveregnskab (14 dage, forlængelse) til udvikling — ALDRIG udvikling mod det rigtige regnskab.
- [ ] Postkasse bilag@ + (hvis Mailgun) inbound-route; eller Gmail/Workspace-API til postkassen.
- [ ] Billing-mail sat til bilag@ hos hver leverandør (liste fra fase 0).
- [ ] Bankintegration i e-conomic (MitID, fornyes hver 180. dag — kalenderpåmindelse).
- [ ] (Hvis valgt) Enable Banking-konto, app og private key; kontrakt før drift; licens målt i Finanstilsynets register.
- [ ] Revisorens adgang til e-conomic (gratis ifølge prissiden).
- [ ] Skriftlige låneaftaler for eksisterende og nye ejerlån.

**Spørgsmål, der skal besvares af andre**
- api@e-conomic.com: kan bankafstemningens poster/match læses eller skrives via API? Signeres webhooks? Konkrete rate limits? Filstørrelsesgrænse i Documents API?
- Revisor: kombineret system-spørgsmålet (§ 4.2); momskoder for jeres udenlandske SaaS-leverandører; kontoplan; låneaftalernes rente.
- Morten: Mola Invests opsætning — værktøjer, hvad virkede ikke, og hvad revisor sagde.

---

*Ikke målt i denne recon:* jeres nuværende e-conomic-pakke, kontoplan, bank(er), leverandørliste, bogholderens kontrakt, Morten/Mola Invests opsætning, Mailgun inbound, Supabase-projektpris, siderne for `/accounts` og `/vat-accounts`, API-adgang til e-conomics bankafstemning.

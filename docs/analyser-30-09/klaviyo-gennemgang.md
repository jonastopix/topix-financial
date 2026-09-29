# Klaviyo-gennemgang, The Boardroom / Topix.dk ApS, 30/9-2026

Metode: kun læsende kald (Klaviyo-MCP: get_*, query_metric_aggregates, flow- og kampagnerapporter) og læsning af repoet. Intet er oprettet, ændret, undertrykt, afmeldt, sendt eller importeret. Konto-id `Xb7Esq`. Alle tal er målt 29/9 sent til 30/9. Kilde står i [klammer]. «K:» = Klaviyo-kald, «D:» = dokument i repoet.

---

## 0. Anbefalinger (kort)

### Jonas skal beslutte

1. **Skal Sunset AFMELDE efter mail 3, eller skal et menneske stadig gøre det manuelt?** Som flowet er bygget, sætter det kun `sunset_afsluttet = ja` og gør ellers ingenting ved samtykket (§5). Mail 3 har emnelinjen «Jeg tager dig af listen i morgen» — det er et løfte, som ingen automatik holder. Min anbefaling: en manuel afmelding er fint, men kun af profiler med `sunset_afsluttet = ja` OG ingen åbning/klik siden flowstart, og den skal ske dagen efter mail 3 (se §5).
2. **Hvad gør vi ved de ca. 2.064 profiler, der kan modtage markedsføring uden nogensinde at have sagt ja** (`NEVER_SUBSCRIBED`, segment A3)? Repoets egen anbefaling (opstart 29/9 §8): luk hullet ved kilden, stil ét spørgsmål til de ~671 fra webinarvejen, rør ikke de tomme. Jeg kan ikke måle, hvor mange af de 2.064 der står på Hovedlisten og dermed rammes af flowene (§3).
3. **Hvilket afsenderpar er «det rigtige»?** Kampagnerne blander `noreply@`/`team@` som afsender og `kontakt@`/`team@` som svar-adresse (§4). Beslut én adresse, og bekræft at den svar-adresse, der bruges, faktisk læses.
4. **Skal «åbning» blive ved med at være definitionen på «engageret» og «død»?** Åbningstal er Apple-MPP-oppustede (§6). Jeres eget dokument har allerede afvist åbninger til måling (mangelliste, «levering JA · klik JA · åbninger NEJ»), men segmenterne «Engagerede» og «Døde» bygger stadig på åbninger.

### Klart at gøre (ingen beslutning mangler)

5. **Ret Sunset-flowet før 14/10** (tre konkrete fejl, §5): (a) ekskludér `Xr6Pm9` (Medlemmer), (b) ekskludér alle med «Deltog i webinar» / «Moedte ikke op» inden for de sidste 30–60 dage, (c) gør `sunset_afsluttet` betinget af at profilen ikke har åbnet/klikket siden flowstart. Tænd så flowet OG hvert enkelt mailtrin OG profilhandlingen (de står hver især som `draft`).
6. **Verificér i Klaviyos flade, hvad et segment-udløst flow gør ved profiler, der allerede er i segmentet, når flowet tændes.** Det har jeg ikke kunnet slå op (§5). Svaret afgør, om de 417 går ind på dag 1, eller om der overhovedet ikke sker noget.
7. **Vis den rigtige status på mangelliste-kortet `m28-velkomstserie` og i OVERLEVERING 29/9 nr. 8.** Begge siger «fire pladsholder-mails; en ny abonnent får intet». Klaviyo viser flowet `TGxxUc` som LIVE med fire mails med rigtige emnelinjer, opdateret 28/9 13:33 (§5, §6).
8. **Sæt en konverteringsmetrik på flowrapporterne** (`Ansoegning sendt`, `XWaVxK`). Alle flows viser i dag 0 konverteringer mod «Blev medlem» (metrikken er oprettet 29/9 13:39). Mod «Ansoegning sendt» er der 1 konvertering i alt (§6).
9. **Læs Klaviyos Billing-side selv, før en besparelse regnes ud.** Prisen kan ikke læses via API'et (§1), og repoets påstand om, at afmeldte profiler ikke tæller i betalingen, er ikke verificeret af mig.

---

## 1. Kontoen — plan og pris

| Punkt | Resultat | Kilde |
|---|---|---|
| Organisation | Topix.dk ApS, Brunbjergvej 4, st. tv, 8240 Risskov, Danmark | [K: get_account_details] |
| Standardafsender | «Morten Larsen» `noreply@send.topix.dk` | [K: get_account_details] |
| Tidszone / valuta | Europe/Copenhagen, DKK | [K: get_account_details] |
| Kontotype | Ikke testkonto (`test_account: false`) | [K: get_account_details] |
| **Plan, pris, prisgrænse** | **KAN IKKE LÆSES.** Klaviyo-MCP'en har ingen fakturerings- eller plan-endpoint, og `get_account_details` returnerer ingen planfelter. Jeg har ikke målt antal aktive profiler mod en grænse. | — |

Hvad repoet påstår om betaling (ikke verificeret af mig, WebFetch afviste at hente Klaviyos hjælpeside): «Afmeldte profiler tæller ikke i Klaviyos betaling (help.klaviyo.com «How Klaviyo billing works»), så en afmelding sparer det samme som en sletning» [D: docs/marketingmotoren.md §9.4 pkt. 2]. Læs selv siden og din faktura, før du regner en besparelse ud. Åbn Klaviyo → Account → Billing for at se profiltal og grænse.

---

## 2. Profiler

### Hvad der kan måles

| Mål | Antal | Kilde |
|---|---:|---|
| Medlemmer af Hovedlisten `RZtwMb` | **3.122** | [K: get_list, profile_count] |
| Segment A1 «Må kontaktes» (kan modtage e-mailmarkedsføring, uanset samtykkestatus) | **3.807** | [K: get_segment XVQA7f] |
| … heraf A2 «Har sagt aktivt ja» (SUBSCRIBED) | **1.743** | [K: get_segment VEHaz9] |
| … heraf A3 «Kun webinar-relation» (NEVER_SUBSCRIBED, men kan modtage) | **2.064** | [K: get_segment VsmTCA] |
| Kontrol: A2 + A3 = 1.743 + 2.064 = 3.807 = A1 | passer | egen regning |
| «Engagerede — email, 90 dage» (`QQsbKZ`) | 1.874 | [K: get_segment QQsbKZ] |
| «Døde — 180 dage» (`WNygMq`) | **417** | [K: get_segment WNygMq] |
| Medlemmer (ekskluderes) `Xr6Pm9` | 25 | [K: get_list Xr6Pm9] |
| «Har ansøgt» (`Tc3fFm`) | 7 | [K: get_segment Tc3fFm] |
| «Tilmeldt kommende webinar» (`RVwauf`) | 342 | [K: get_segment RVwauf] |
| «Aldrig været tilmeldt et webinar» (`XPLm5J`) | 1.812 | [K: get_segment XPLm5J] |

### Det jeg IKKE kan måle (skriver det, som du bad om)

- **Profiler i alt.** Der er intet endpoint med et samlet tal, og `get_profiles` giver højst 100 pr. side uden total. Nedre grænse: A1 = 3.807 kan modtage. Afmeldte, undertrykte og profiler uden mulighed for at modtage kommer oveni, uden at jeg kender antallet.
- **Antal SUBSCRIBED / NEVER_SUBSCRIBED / UNSUBSCRIBED / SUPPRESSED som profiltal.** Jeg har A2 og A3 (ovenfor). For afmeldte og undertrykte har jeg kun **hændelser** (nedenfor), ikke profiler.
- **Antal, der aldrig har åbnet eller klikket de sidste 90 dage.** Der findes ingen segment for det, og jeg må ikke oprette et. Klaviyos tal på 90 dage findes kun som «engageret» (1.874, med de problemer der står nedenfor).
- **Antal, der aldrig har åbnet eller klikket de sidste 180 dage** ud over de 417 i `WNygMq`. Det segment har en snæver definition (kræver ≥3 modtagne mails, ingen ansøgning, intet kommende webinar, medlem af Hovedlisten). Det er en **nedre grænse**, ikke det samlede tal.

### Segmenterne modsiger hinanden (uafklaret)

- `QQsbKZ` (engagerede, kræver SUBSCRIBED) = 1.874, men `VEHaz9` (SUBSCRIBED) = 1.743. En delmængde kan ikke være større end helheden.
- `V3JZ8D` («ZZ gammel — Sunset-kandidater», kræver SUBSCRIBED) = 4.980, men `XVQA7f` (alle der kan modtage) = 3.807.

Jeg kan ikke afgøre hvilket tal der er forkert (forskellig beregningstid, en betingelse der læses anderledes, eller noget tredje). Konsekvens: **stol ikke på segmenttallene som absolutte tal**, før du har set dem i Klaviyos flade.

### Undertrykkelser og afmeldinger (som HÆNDELSER, ikke profiler)

| Hændelse | Seneste 12 mdr. (okt. 2025–sept. 2026) | Kilde |
|---|---:|---|
| Afmeldt fra e-mailmarkedsføring (`RwPaFG`) | **812** (heraf feb. 2026: 353; sept. 2026: 68) | [K: query_metric_aggregates] |
| Afmeldt jan.–sept. 2025 | 214 | [K: query_metric_aggregates] |
| Bounce-undertrykkelse tilføjet (`RjmvQM`) | **77** | [K: query_metric_aggregates] |
| Markeret som spam (`QUFWeH`) | 3 | [K: query_metric_aggregates] |
| Manuelt undertrykt (`Uy9ekq`) | 8 | [K: query_metric_aggregates] |

Det er hændelser. En profil kan afmelde sig flere gange, eller tilmelde sig igen, så tallene er ikke antal profiler. Feb. 2026 (353) falder sammen med «Prisstigning feb. 2026»-serien på otte kampagner [K: get_campaigns]. Sept. 2026 (68) falder sammen med webinarflowene og kampagnerne.

### Hvor profilerne kom fra

- **Metas leadformular-liste** «Meta | Modtag Webinar | OM» (`TNpnEJ`): 261 nu; 273 «Subscribed to List» i april 2026, 5 i maj, 4 i juni, 2 i juli. Det er 12-måneders-tilgangen af egentlig SUBSCRIBED [K: query_metric_aggregates StLfFf grupperet på liste].
- **Hovedlisten**: kun 10 «Subscribed to List» i sept. 2026 (nyhedsbrevsformularen på topix.dk, live 28/9 14:13) [samme kald].
- **Zenegy-webinarliste** (`SMpNXm`, «ZZ gammel», double opt-in): 213 [K: get_list].
- **Optakt-listen** til webinaret 22/9 (`Sz5fdA`, «ZZ gammel»): 352 [K: get_list].
- **Alt andet** (import, eWebinar-tilmeldinger, platformens hændelser) er ikke opdelt i noget, jeg kan læse. Repoet: «2.104 profiler ind uden samtykke siden juni 2025 mod 32 med. 1.292 har ingen egenskaber; 48 har ikke engang mail» [D: docs/opstart-29-09.md §8]. Det tal har jeg ikke kunnet genskabe.
- **Stikprøve** (de 100 nyeste profiler, oprettet 23.–29/9): 90 NEVER_SUBSCRIBED (kan modtage), 9 SUBSCRIBED via API (nyhedsbrevsformularen; user-agent viser Chrome/Safari/Facebook-webview), 1 UNSUBSCRIBED via preference-side. Stikprøven er skæv (den dækker webinarbølgen), så den siger noget om tilgangen lige nu, ikke om hele basen.

---

## 3. Samtykke og regler

### Hvad Klaviyo viser

| Liste | Opt-in | Profiler | Kilde |
|---|---|---:|---|
| Hovedliste `RZtwMb` | **single opt-in** | 3.122 | [K: get_lists] |
| Medlemmer (ekskluderes) `Xr6Pm9` | single | 25 | [K: get_lists] |
| ZZ gammel — Zenegy webinar `SMpNXm` | **double opt-in** | 213 | [K: get_lists] |
| ZZ gammel — Webinar 22-09-2026 optakt `Sz5fdA` | single | 352 | [K: get_lists] |
| ZZ gammel — Meta \| Modtag Webinar `TNpnEJ` | single | 261 | [K: get_lists] |

- **Formularer:** Klaviyos MCP har ingen forms-endpoint. Jeg kan ikke læse, hvilke formularer der giver samtykke, eller deres tekst. Det, der er dokumenteret: nyhedsbrevet på topix.dk (footer og `/webinar/tak`) kalder Klaviyos `client/subscriptions` med samtykke, revision `2026-07-15`, og bevist 28/9 14:13 med `consent SUBSCRIBED` og `$source` «topix.dk footer» [D: docs/tracking.md §2.3; docs/marketingmotoren.md §9.3]. Klaviyo bekræfter mønstret i stikprøven (SUBSCRIBED, metode `API`).
- **Ingen double opt-in på det live nyhedsbrev.** Hovedlisten er single. Markedsføringsloven kræver forudgående, aktivt samtykke, ikke double opt-in. Men single opt-in giver ingen bekræftelse af, at mailen tilhører den, der skrev den ind, og bevisbyrden for samtykket ligger hos jer. Klaviyo gemmer tidspunkt og metode pr. profil (`consent_timestamp`, `method`, `method_detail`); det har jeg set i stikprøven.

### Det åbne «permits»-punkt

Jeg fandt ikke ordet «permits» i repoet (søgt i docs/*.md, docs/mangelliste.html, CLAUDE.md). Det nærmeste, der kan være det, du husker, er disse punkter. Jeg citerer og vurderer dem:

1. **Samtykke-hullet** [D: docs/opstart-29-09.md §8]: «2.104 profiler ind uden samtykke siden juni 2025 mod 32 med. […] `can_receive_email_marketing: true` styrer afsendelsen — `NEVER_SUBSCRIBED` betyder ikke, at de ikke må kontaktes. Dansk markedsføringslov §10 kræver forudgående aktivt samtykke; det er dér hullet er.» **Vurdering: ÅBENT, ikke løst.** Klaviyo bekræfter mekanikken (A3 = 2.064 kan modtage uden at have sagt ja; 90 af de 100 nyeste profiler). Jeg har ikke vurderet juraen; jeg citerer jeres egen konklusion.
2. **Hovedliste-kravet** [D: mangelliste `a22-hovedlisten`, LUKKET 22/9; docs/tracking.md §6 pkt. 13]: Jonas 22/9: «Hovedliste»-kravet BLIVER — tilmeldte, der ikke står på Hovedliste, skal IKKE ind. En webinartilmelding er ikke i sig selv samtykke til markedsføring.» **Vurdering: LØST som beslutning, men hullet i praksis består.** Flowene `Wq3MkG` og `SDVvCW` kræver Hovedliste OG «kan modtage» (`consent_status: any`) [K: get_flow]. Det er ikke det samme som SUBSCRIBED. En profil på Hovedlisten uden aktivt samtykke får altså stadig mailene.
3. **Afmeldinger fra eWebinar til Klaviyo** [D: CLAUDE.md «Afmeldinger fra eWebinar til Klaviyo»; mangelliste `a22-afmelding-klaviyo`]: i drift 22/9 13:57 og bevist hos Klaviyo. **Vurdering: LØST.** Klaviyo viser afmeldinger i sept. 2026 (68 hændelser).
4. **Platformens mails kan ikke afmeldes** [D: mangelliste `a20-afmeld-platform`]: «Ingen af platformens mails kan afmeldes — byg tabellen `kontakt_ikke`, `List-Unsubscribe`-header og afmeld-link i gråzone-mailene». Status: Jonas 22/9 «senere». **Vurdering: ÅBENT.** Det ligger uden for Klaviyo (platformen sender via Mailgun EU), men det er den anden halvdel af «permits fra de forskellige mailadresser».
5. **Afsender per kilde**: hvem der sender hvad, er nu fast [D: docs/marketingmotoren.md §9.1]: før webinar = platformen (Mailgun, `morten@webinar.topix.dk`), efter webinar og kampagner = Klaviyo (`noreply@send.topix.dk`), ansøgning = platformen. **Vurdering: løst som princip;** se §4 for hvad Klaviyo faktisk bruger.
6. **Sunset AFMELDER, sletter ikke** [D: docs/marketingmotoren.md §9.4 pkt. 2]. **Vurdering: løst som beslutning; åbent som bygning** (§5).

### Observationer, som ikke står i dokumenterne

- **Platformens før-webinar-mails (Mailgun) registreres ikke i Klaviyo.** Alle åbninger og klik på dem er usynlige for Klaviyos «døde»-regel. Konsekvens i §5.
- **Kampagnerne har `ignore_unsubscribes: false`** [K: get_campaigns send_options], hvilket er korrekt (afmeldte modtager ikke).

---

## 4. Afsendere

| Adresse | Bruges af | Kilde |
|---|---|---|
| `noreply@send.topix.dk`, «Morten Larsen», svar til `kontakt@topix.dk` | Alle Klaviyo-flows (`TGxxUc`, `SDVvCW`, `Wq3MkG`, `XCqPKg`), kampagnen til de 220 (29/9), «Så webinaret 22/9 → ansøgning» (1/10), optakt-kampagnerne 21–22/9 | [K: get_flow, get_campaigns] |
| `noreply@send.topix.dk`, «Morten Larsen», svar til **`team@send.topix.dk`** | «Morten skriver» #3, #4, #5, #6 (bl.a. #5 den 7/10 og #6 den 15/10, planlagt) | [K: get_campaigns] |
| **`team@send.topix.dk`**, svar til `team@send.topix.dk` | «Morten skriver» #1 (8/9) og #2 (15/9), begge SENDT; den annullerede gamle sunset-kampagne | [K: get_campaigns] |
| `team@send.topix.dk`, «Morten Larsen fra Topix» / «Topix» | Det gamle Meta-flow `R3HF5H` (kladde) | [K: get_flow] |
| Platformen: `morten@webinar.topix.dk` (Mailgun EU) | Før-webinar-mails | [D: docs/marketingmotoren.md §9.1] |
| Platformen (transaktion): `noreply@theboardroom.dk`-familien | Medlems- og ansøgningsmails | [D: OVERLEVERING] |

Konkrete fund:

1. **Fem forskellige svar-/afsenderkombinationer i Klaviyo.** Skiftet fra `team@` (#1, #2) til `noreply@` (#3–#6) midt i serien betyder, at samme serie er sendt fra to afsendere. Læserne af #1 og #2 kan have svaret til `team@send.topix.dk`.
2. **`team@send.topix.dk` som svar-adresse:** `send.topix.dk` er et afsenderdomæne. Jeg kan ikke måle, om der findes en postkasse (MX) bag det. **Ikke målt.** Hvis der ikke gør, forsvinder svar på «Morten skriver» — og de er netop det, en personlig mail-serie forventer. Tjek at `team@send.topix.dk` er en levende adresse eller ret svar-adressen til `kontakt@topix.dk` i #3–#6, inden #4 og #5 går ud.
3. **Fra-adressen er `noreply@` med et personnavn.** Det er i sig selv ikke ulovligt, når svar-adressen virker og afmelding er tydelig. Men det signalerer «ingen må svare», mens mailene er skrevet som personlige mails fra Morten.
4. **Domænet er rigtigt**, `send.topix.dk` er et undertrunk til Topix.dk ApS, og virksomhedens fysiske adresse i Klaviyo passer til Topix.dk ApS (påkrævet i footeren). Jeg har ikke kunnet se SPF/DKIM/DMARC-status for `send.topix.dk` (ikke tilgængeligt via MCP).

---

## 5. Flows

### Alle flows (aktive og kladder)

| Flow | ID | Status | Trigger | Mails | Kilde |
|---|---|---|---|---:|---|
| Velkomst — nye på Hovedlisten | `TGxxUc` | **LIVE** (opdateret 28/9 13:33) | Tilføjet til Hovedliste; profilfilter: ikke på `Xr6Pm9` | 4 (dag 0, +3, +5, +6) | [K: get_flow] |
| Jonas - Deltog i webinar | `Wq3MkG` | LIVE | Metrik «Deltog i webinar» med `frisk = ja`; Hovedliste + «kan modtage» | 5 designet; **3 live** (mail 4 og 5 er `draft`/slukket 28/9) | [K: get_flow] |
| Jonas - Moedte ikke op | `SDVvCW` | LIVE | Metrik «Moedte ikke op» med `frisk = ja`; Hovedliste + «kan modtage» | 3 | [K: get_flow] |
| Sunset — 180 dage uden åbning | `XCqPKg` | **DRAFT** | Segment «Døde — 180 dage» (`WNygMq`) | 3 mails + 1 profilhandling | [K: get_flow] |
| Meta Ads \| Tilmelding til Webinar-link | `R3HF5H` | DRAFT | Tilføjet til liste `TNpnEJ` | 3 | [K: get_flow] |
| Texta - Efter webinar / Event / Webinar | `UFppkY`, `VVCbpM`, `XngABT` | draft, **arkiveret** (2025) | — | — | [K: get_flows archived] |
| Jonas - Før webinar, Efter webinar, bekræftelse | `UiECQS`, `YcBF9f`, `WFzxH9` | **findes ikke længere** (404 «does not exist»), men har rapportdata fra før | — | — | [K: get_flow → 404; get_flow_report] |

Bemærk: flowene `UiECQS`, `YcBF9f` og `WFzxH9` optræder kun i rapporterne. Klaviyo svarer at `UiECQS` ikke findes. De er altså slettet; jeg kan ikke se, hvornår.

### SUNSET-flowet `XCqPKg` i detaljer

Opbygning [K: get_flow XCqPKg, definition]:

1. Trigger: segmentet «Døde — 180 dage» (`WNygMq`). Genindtræden: 365 dage. Smart sending: fra.
2. Mail 1: «Skal jeg blive ved med at skrive til dig?» (skabelon `XNw6tk`, ingen filter). **Draft.**
3. Vent 7 dage (kl. 08:15 dansk tid).
4. Mail 2: «Hvis du kun læser én af mine mails» (`YyqTyN`), kun hvis 0 åbninger og 0 klik siden flowstart. **Draft.**
5. Vent 7 dage.
6. Mail 3: «Jeg tager dig af listen i morgen» (`VneUdU`), samme filter. **Draft.**
7. Vent 1 dag.
8. Opdatér profil: `sunset_afsluttet = ja`. **Draft.**
9. Slut. Ingen afmelding, ingen undertrykkelse, ingen fjernelse fra liste.

**Svar på dit spørgsmål: flowet hverken undertrykker eller afmelder.** Det sender tre mails og sætter én egenskab. Afmeldingen skal gøres i hånden bagefter [D: OVERLEVERING 29/9 §7; docs/marketingmotoren.md §9.3].

Definitionen på segmentet `WNygMq` [K: get_segment]: medlem af Hovedlisten OG 0 åbninger i 180 dage OG 0 klik i 180 dage OG 0 «Ansoegning sendt» nogensinde OG `tb_naeste_webinar` ikke sat OG ≥3 «Received Email» i 180 dage. **417 profiler nu** (421 den 28/9, 419 den 29/9).

**Er det klar til 14/10? Nej, ikke som det står.** Ting der skal rettes eller afklares:

| # | Fund | Risiko |
|---|---|---|
| 1 | Alle fire handlinger (3 mails + profilhandling) og selve flowet er `draft`. I `Wq3MkG` ses, at hvert trin har sin egen status (`live`/`draft`). | At tænde flowet uden at tænde trinene sender ingenting. |
| 2 | **Uklart om de 417 nuværende medlemmer af segmentet går ind ved tænding.** Jeg har ikke kunnet slå op, hvordan Klaviyo behandler eksisterende segmentmedlemmer ved et segment-udløst flow. **Ikke verificeret.** | Enten sker der intet på dag 1, eller alle 417 får mail 1 samme dag. |
| 3 | **`sunset_afsluttet = ja` sættes for ALLE, der når enden**, også dem der åbnede/klikkede undervejs (mail 2 og 3 springes bare over for dem, mens profilhandlingen kører). En afmelding efter egenskaben alene ville afmelde profiler, der netop reagerede. | Afmelder engagerede, mod flowets egen idé. |
| 4 | **Ingen ekskludering af `Xr6Pm9` (Medlemmer).** `TGxxUc` og alle kampagnerne ekskluderer den. Sunset gør ikke. Betalende medlemmer, der bare ikke åbner mails, kan ramme segmentet. | Et medlem får «Skal jeg blive ved med at skrive til dig?». |
| 5 | **Ingen ekskludering af webinardeltagere.** Segmentet ekskluderer dem, der har ansøgt, og dem med et kommende webinar (`tb_naeste_webinar`). Efter 13/10 er feltet ryddet, så **tilmeldte til 13/10, som kun har svaret på platformens Mailgun-mails (usynlige for Klaviyo), ligner døde**. De får sunset-mails samtidig med efter-webinar-flowene (`Wq3MkG`/`SDVvCW`). | Kollision 14/10: tre mails fra Morten på få dage, og en «skal jeg blive ved»-mail til en, der lige har deltaget. |
| 6 | **Mail 3 lover «Jeg tager dig af listen i morgen».** Løftet holdes kun, hvis nogen afmelder præcis dagen efter. Flowets sidste trin kommer 1 dag efter mail 3. Manuelt arbejde. | Brudt løfte, eller afmelding for tidligt. |
| 7 | Åbningsdefinitionen er MPP-påvirket (§6). Segmentet finder kun dem, hvor ikke engang en maskine har åbnet. | Nedre grænse, ikke en fuld oprydning. Ingen skade. |
| 8 | Skabelonerne (`XNw6tk`, `YyqTyN`, `VneUdU`) har jeg ikke læst. Jeg har ikke tjekket, om de har afmeldingslink (Klaviyo tilføjer det normalt på markedsføringsmails), eller om de lover «optagelsen». | Ikke målt. |

Forløbet, hvis flowet tændes 14/10: mail 1 den 14/10, mail 2 den 21/10 kl. 08:15, mail 3 den 28/10 kl. 08:15, `sunset_afsluttet` den 29/10. Første fornuftige afmeldingsdato er altså **29–30/10**, ikke 14/10.

### Hvad der skal slås til den dag (14/10)

1. Ret punkt 3, 4 og 5 ovenfor (i flowfladen; API'et kan ikke oprette eller ændre flows, kun læse, jf. docs/opstart-29-09.md).
2. Sæt trin 2–8 til Live og selve flowet til Live.
3. Kontrollér at `WNygMq` stadig har 417 ± et par stykker, og at ingen medlemmer fra `Xr6Pm9` står i segmentet.
4. Om 29/10: byg/kør en afmelding af profiler med `sunset_afsluttet = ja` og ingen åbning/klik siden 14/10 (én kørsel, efter en tørkørsel med antal).

### Kampagner der ligger omkring 14/10 (kollisioner)

| Kampagne | Sendes | Modtagere | Kilde |
|---|---|---|---|
| «Så webinaret 22/9 → ansøgning» | 1/10 10:00 | `Su9sJq` (ekskl. `RVwauf`, `Xr6Pm9`) | [K: get_campaigns] |
| «Morten skriver #5» | 7/10 10:15 | `QQsbKZ` (ekskl. 4 segmenter/lister) | [K: get_campaigns] |
| «Morten skriver #6» | 15/10 10:15 | `QQsbKZ` (ekskl. `RVwauf`, `SGwMAk`, `SicZVb`, `Xr6Pm9`) | [K: get_campaigns] |
| «Morten skriver #3» og «#4» | **Kladde**, ingen dato | `QQsbKZ` | [K: get_campaigns] |

«Morten skriver» går til de engagerede og sunset til de døde, så de to overlapper ikke, men #6 den 15/10 ligger dagen efter sunset-start og dagen efter webinaret. #3 og #4 er stadig kladder, selvom #5 og #6 er planlagt; rækkefølgen i serien er hullet.

---

## 6. Hvad der er at hente

### Velkomstserien findes og er LIVE (mangelliste-kortet er forældet)

`TGxxUc` er tændt med fire rigtige mails: «Velkommen — og de fem spørgsmål», «Den dyreste lektie fra Hungry», «Jeg lavede den samme fejl to gange», «Hvad venter du egentlig på?» [K: get_flow]. Mangelliste-kortet `m28-velkomstserie` og OVERLEVERING 29/9 nr. 8 siger stadig «fire pladsholder-mails; en ny abonnent får i dag intet». Det er ikke længere rigtigt (opstart 29/9 §8 siger allerede «Flowet er LIVE imens»).

Målt effekt: 7 modtagere, mail 1 åbnet af 6 (86 %), 0 klik [K: get_flow_report]. Så få, at tallet ikke siger noget om effekten.

Svagheder ved velkomstserien (fra definitionen):
- Ingen udgang, når profilen ansøger eller bliver medlem. Mail 4 «Hvad venter du egentlig på?» kan ramme en, der allerede har ansøgt.
- Ingen samtykkebetingelse ud over Hovedliste-medlemskab. En NEVER_SUBSCRIBED-profil, der lægges på Hovedlisten, får serien (i overensstemmelse med Klaviyos «kan modtage»-logik).
- Serien er ikke læst af Morten endnu [D: opstart 29/9 §8: «Morten skal læse velkomstseriens mail 1, 3 og 4»].

### Performance (Klaviyo-rapporter)

Åbningsrater er i denne konto ikke pålidelige: **Morten skriver #1 og #2 har 56 % og 48 % åbning, men 0,3 % klik (5 unikke klik af ca. 1.650 leverede, begge gange)** [K: get_campaign_report]. I september 2026 åbnede 1.474 unikke profiler ud af 2.147 unikke modtagere (69 %), men kun 130 unikke klikkede (6 %) [K: query_metric_aggregates]. Det er MPP/proxy-mønstret, jeres egen mangelliste beskriver.

| Element (seneste 90 dage) | Modtagere | Åbning | Klik | Afmeld | Konverteringer mod «Ansoegning sendt» |
|---|---:|---:|---:|---:|---:|
| Wq3MkG «Deltog» (3 live mails) | 410 | 73 % | 3,7 % | 1,7 % | **1** (mail 1) |
| SDVvCW «Moedte ikke op» (3 mails) | 570 | 49 % | 7,4 % | 0,5 % | **0** |
| — mail 1 «Vælg en ny tid» | 192 | 54 % | **13,7 %** | 0 | 0 |
| Wq3MkG mail 2 og 3 | 136 / 132 | 71 % | **0 klik** | 2,9 % / 2,3 % | 0 |
| TGxxUc Velkomst | 7 | 86 % | 0 | 0 | 0 |
| Kampagne til de 220 (29/9) | 197 | 34 % | 2,5 % | 1,0 % | 0 |
| «Morten skriver» #1 / #2 | 1.674 / 1.644 | 56 % / 48 % | 0,3 % / 0,3 % | 1,03 % / 0,68 % | 0 |

[K: get_flow_report, get_campaign_report; konverteringsmetrik `XWaVxK`]

Det, der springer i øjnene:
- **Klik er samlet lavt.** Bedste enkeltmail er «Ikke op 01 — Vælg en ny tid» (13,7 % klik).
- **Efter 02 og Efter 03 i `Wq3MkG` har 0 klik** (136 og 132 modtagere). De har højere afmeldingsrate end resten (2,9 % og 2,3 %) og ingen anden effekt. Efter 02 er «Hvad der faktisk sker, hvis du søger». Har den overhovedet et link til ansøgningen? Ikke læst.
- **Konverteringerne er næsten nul overalt**: 1 ansøgning tilskrevet Wq3MkG og 1 tilskrevet den tidligere «Før webinar». «Blev medlem» (`W9hzr9`) blev oprettet 29/9 kl. 13:39, så den har ingen historik endnu. Klaviyo tilskriver ikke ansøgninger, der kommer via platformen uden for Klaviyos mails, så Klaviyo undervurderer sandsynligvis egen effekt. Ikke målt.
- «Morten skriver» #1 havde 1,4 % bounce og 0,06 % spam-klager på en liste, der er kaldt «engageret» (1.650 leverede).

### Huller og muligheder

1. **Ingen flow til «påbegyndt ansøgning».** Metrikken «Ansoegning paabegyndt» (`XgxCJf`) findes, men ingen flow bruger den [K: get_metrics, get_flows]. Repoet: 17 klikkede «Ansøg» 22/9, 6 oprettede [D: opstart 29/9 §8]. Rykkerne til ansøgere går via platformen (Mailgun), ikke Klaviyo. Det er en bevidst arkitektur (én ejer pr. mail), men segmentet «Har ansøgt» har kun 7 profiler, så Klaviyo ser næsten intet af ansøgningsforløbet.
2. **«Morten skriver» som evergreen** (fem essays) er ikke bygget; #3 og #4 er kladder [D: opstart 29/9 §8; K: get_campaigns].
3. **Ingen flow for medlemmer/onboarding i Klaviyo.** `Xr6Pm9` er bare en ekskluderingsliste. 3 af 28 betalende findes ikke i Klaviyo [D: marketingmotoren §9.2].
4. **Ingen udløb af `tb_naeste_webinar`-nøglen ved 13/10** er indbygget i Sunset (se §5 pkt. 5).
5. **Segmentet «Engagerede» (1.874) bygger på åbninger** og er modtager af hele «Morten skriver»-serien. Klik-baseret eller «klikkede/svarede inden for 180 dage» ville give en mindre, men reel gruppe. Jeg har ikke målt størrelsen.
6. **Gamle segmenter og lister roder:** syv segmenter er navngivet «ZZ gammel» (SGwMAk, SicZVb, SyCv2n, TS4ntE, TsEybU, WwdX4c, V3JZ8D), tre lister «ZZ gammel». To af dem bruges stadig som ekskludering på «Morten skriver» (`SGwMAk`, `SicZVb`), som er defineret ud fra en ældre «Placed Order»-metrik.
7. **Det gamle Meta-flow `R3HF5H`** er kladde, men har 268–280 modtagere historisk og en høj åbnings-/klikrate (mail 1: 21 % klik). Det er den bedste klikrate i kontoen, og den kører ikke. Verificér, om «Meta | Modtag Webinar»-listen stadig får tilgang (5 i maj, 4 i juni, 2 i juli), så er svaret nej.

---

## 7. Oprydning — hvor mange kunne undertrykkes

**BYGGET/KØRT: intet.** Det følgende er et estimat af, hvad der kan måles.

| Regel | Antal | Sikkerhed |
|---|---:|---|
| **A: Segmentet «Døde — 180 dage»** (Hovedliste, 0 åbninger og 0 klik i 180 dage, ≥3 modtagne mails, aldrig ansøgt, intet kommende webinar) | **417** [K: get_segment WNygMq] | Målt nu. Nedre grænse. |
| B: A minus dem der får en ny chance i Sunset og reagerer | Ukendt (afhænger af, hvor mange der åbner/klikker på mail 1–3) | Ikke målt, først efter 29/10 |
| C: «Ingen klik i 180 dage» (bredere, ikke MPP-følsom) | **Ikke målt.** Segmentet findes ikke, og jeg må ikke oprette det. | — |
| D: NEVER_SUBSCRIBED uden nogen åbning/klik | **Ikke målt.** Kræver et nyt segment. | — |

Om besparelsen: **kan ikke regnes, fordi prisen ikke kan læses** (§1). Hvis Klaviyos pris følger «aktive profiler», og afmeldte ikke tæller (repoets påstand, ikke verificeret af mig), er den maksimale profilreduktion 417 ud af mindst 3.807 (ca. 11 %) med regel A. Om det ændrer prisniveau, afhænger af, hvor tæt I er på en tier-grænse. Se Account → Billing.

Risici:
1. **Afmelding er permanent.** En afmeldt profil kan ikke sættes tilbage uden nyt samtykke. Det gælder også, hvis segmentet fejlagtigt rammer et medlem eller en aktiv webinardeltager (se §5 pkt. 4 og 5). Derfor: ekskludér `Xr6Pm9` og nylige webinarhændelser, og gør en tørkørsel med antal, inden noget afmeldes.
2. **Usynlig engagement.** Åbninger/klik på platformens Mailgun-mails ses ikke af Klaviyo. En person, der ses som «død» i Klaviyo, kan være aktiv via platformen (ansøgning, webinar).
3. **MPP** gør at «0 åbninger» bare betyder, at maskinen heller ikke hentede pixlen. Det gør kriteriet snævert, men det er sikkert i den retning at det ikke rammer aktive.
4. **Undertrykkelse (`bulk_suppress`) er ikke det samme som afmelding.** Undertrykkelse flytter kun rækkeevnen, afmelding flytter samtykket. Jeres beslutning (Jonas 22/9): en afmelding = global afmelding, ikke undertrykkelse. Brug samme princip her, så profilen ikke kan sættes tilbage ved en fejl.
5. **Slet ikke** før I har afgjort opbevaring og dokumentation. Afmeldte profiler bevarer historikken, det er hele pointen med jeres beslutning.

---

## Bilag: det jeg ikke kunne måle (samlet)

- Plan, pris, prisgrænse, antal aktive profiler mod grænse.
- Samlet antal profiler; antal afmeldte/undertrykte som profiler.
- Antal med 0 åbninger/klik i 90 dage; i 180 dage ud over `WNygMq`.
- Hvor mange af A3 (2.064) der står på Hovedlisten.
- Formularer og deres samtykketekst (ingen forms-endpoint).
- Om `team@send.topix.dk` er en levende postkasse; SPF/DKIM/DMARC for `send.topix.dk`.
- Hvordan Klaviyo behandler eksisterende segmentmedlemmer, når et segment-udløst flow tændes.
- Skabelonernes indhold (afmeldingslink, links, tekst) i Sunset og velkomstserien.
- Årsagen til, at `QQsbKZ` > `VEHaz9` og `V3JZ8D` > `XVQA7f`.
- Hvem/hvornår flowene `UiECQS`, `YcBF9f`, `WFzxH9` blev slettet.
- Ordet «permits» findes ikke i repoet; jeg har fortolket det som samtykkepunkterne i §3.

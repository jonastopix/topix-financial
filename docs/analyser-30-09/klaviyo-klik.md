# Klaviyo-rettelser: klik-for-klik (til i morgen, 30/9-2026)

Alt er læst live fra Klaviyo 29/9 (kun læsning, intet rørt). Navne er dem, du ser i Klaviyo:
lister **Hovedliste**, **Medlemmer (ekskluderes)**; segmenter **Tilmeldt kommende webinar**, **Døde — 180 dage**;
metrikker **Deltog i webinar**, **Moedte ikke op**, **Ansoegning sendt**, **Opened Email**, **Clicked Email**.
Klaviyos knapper kan hedde lidt anderledes; stien og resultatet er det, der tæller.

Regler der gælder alle flowrettelser (Klaviyo hjælp: «Understand flow triggers and filters»):
- **Flow filters** tjekkes ved indgang OG før hver handling (mail, profilopdatering). Filter, der fejler, springer trinnet over; personen bliver i flowet.
- **Additional filters på en mail** tjekkes kun lige før den mail.
- Flere filtre du tilføjer under hinanden = OG.
- Flowene Wq3MkG, SDVvCW og TGxxUc er LIVE: en ændring gælder, så snart du klikker Save. Tag dem ét ad gangen.

Anbefalet rækkefølge: 2 (5 min) → 5 (10 min) → 3 (25 min) → 4A (20 min). Samlet ca. 1 time.

---

## 2. Kampagner 6/10–15/10 ekskluderer «Tilmeldt kommende webinar»

**Formål:** ingen kampagne må ramme en person, der er tilmeldt næste webinar (forhindrer 22/9-dubletten).

**Målt nu:** de tre planlagte kampagner ekskluderer ALLEREDE segmentet (RVwauf). Du skal kun kontrollere, ikke rette.

| Kampagne | URL | Skal have i «Excluded» |
|---|---|---|
| Morten skriver #5 (7/10) | https://www.klaviyo.com/campaign/01M0ZW08CHD8VE94BFM1S4F9VX/wizard | Tilmeldt kommende webinar (+ Medlemmer, + 2 ZZ gammel) |
| Morten skriver #6 (15/10) | https://www.klaviyo.com/campaign/01M0ZW20VT98XYW721VYAX2KEV/wizard | samme |
| Så webinaret 22/9 → ansøgning (1/10) | https://www.klaviyo.com/campaign/01M3KSWX5GSH4QV5EMMYS18S9G/wizard | Tilmeldt kommende webinar, Medlemmer (ekskluderes) |

**Klik (pr. kampagne):**
1. Åbn URL'en → trin **Recipients** (Modtagere).
2. Kig i feltet **Excluded**: «Tilmeldt kommende webinar» skal stå der.
3. Står den der, luk fanen uden at gemme (ingen ændring nødvendig).
4. Mangler den (fx en ny kampagne eller kladden #3/#4, hvis de får dato 6/10–15/10): **Excluded → Add → Segments → «Tilmeldt kommende webinar» → Save**.

**Rigtigt når:** Excluded viser Tilmeldt kommende webinar. **Tid:** 5 min. Husregel fremover: hver ny kampagne 6/10–15/10 får den samme eksklusion, før den planlægges.

---

## 5. Velkomst — nye på Hovedlisten (TGxxUc): mail 2–4 springes over for tilmeldte

**Formål:** en person, der er tilmeldt et kommende webinar, får kun velkomstmail 1; mail 2–4 (og især «Hvad venter du egentlig på?» dagen før webinaret) springes over, og Smart Sending forhindrer to Klaviyo-mails tæt på hinanden.

**URL:** https://www.klaviyo.com/flow/TGxxUc/edit

**Klik (gentag for de tre mails: «Den dyreste lektie fra Hungry», «Jeg lavede den samme fejl to gange», «Hvad venter du egentlig på?»):**
1. Klik på mailkortet i flowet.
2. I højre panel → **Additional filters** (under mailens indstillinger) → **Add filter**.
3. Vælg **Properties about someone** → skriv/vælg `tb_naeste_webinar` → **is not set** (bliver ved med at være OK, hvis personen ikke er tilmeldt).
4. I samme panel: slå **Smart Sending** TIL.
5. **Save** (øverst til højre).

Rør IKKE mail 1 («Velkommen — og de fem spørgsmål») og ikke det flow-filter, der står i forvejen (ikke på Medlemmer). Sæt IKKE filteret på flowniveau: så ville trinnet «velkomst_gennemfoert» også blive sprunget over.

**Rigtigt når:** hver af mail 2, 3 og 4 viser ét additional filter «tb_naeste_webinar is not set» og Smart Sending = til; mail 1 viser ingen filtre. **Tid:** 10 min.

---

## 3. Flow «Deltog i webinar» (Wq3MkG) og «Moedte ikke op» (SDVvCW): porte

**Formål:** ingen efter-webinar-mail til medlemmer, til folk med en kommende session, eller (kun SDVvCW) til én der har deltaget de sidste 14 dage.

**Afvigelse fra rettelse 3 (bevidst):** for Wq3MkG lægges «tb_naeste_webinar is not set» på MAILENE, ikke på flowet. «Deltog i webinar» sendes ved LOGIN, og feltet ryddes først kl. :17 efter sessionens start. Et flowfilter tjekkes ved indgangen og ville afvise næsten alle deltagere, før feltet er væk. Mailfilteret tjekkes tidligst 2 timer senere.

### 3a. Wq3MkG «Jonas - Deltog i webinar»
**URL:** https://www.klaviyo.com/flow/Wq3MkG/edit

**Flow-filter (Medlemmer):**
1. Klik på triggeren øverst («Deltog i webinar») → i højre panel find **Flow filters** (ikke *Trigger filters*).
2. Der står allerede to: «is in Hovedliste» og «can receive email marketing». Klik **Add filter** (OG).
3. Vælg **If someone is in or not in a list or segment** → **is not in** → vælg listen **Medlemmer (ekskluderes)** → **Done/Save**.

**Mail-filter, på tre mails** («Efter 01 — Tak fordi du var med», «Efter 02 — Hvad der faktisk sker, hvis du søger», «Efter 03 — De to ting, folk siger nej med»):
1. Klik på mailkortet → **Additional filters**. (Mail 02 og 03 har to filtre i forvejen om «Ansoegning sendt»; RØR DEM IKKE.)
2. **Add filter** → **Properties about someone** → `tb_naeste_webinar` → **is not set**.
3. **Save**.
Mail 04 og 05 er kladder; lad dem ligge.

**Rigtigt når:** flow filters viser 3 rækker (Hovedliste, can receive email marketing, not in Medlemmer). Mail 01 har 1 additional filter, mail 02 og 03 har 3 (2 gamle + tb_naeste_webinar not set). **Tid:** 15 min.

### 3b. SDVvCW «Jonas - Moedte ikke op»
**URL:** https://www.klaviyo.com/flow/SDVvCW/edit

1. Klik på triggeren («Moedte ikke op») → **Flow filters** (der står to i forvejen: Hovedliste og can receive email marketing). Tilføj tre, ét ad gangen med **Add filter**:
   - **If someone is in or not in a list or segment** → **is not in** → **Medlemmer (ekskluderes)**
   - **Properties about someone** → `tb_naeste_webinar` → **is not set**
   - **What someone has done (or not done)** → **Deltog i webinar** → **zero times** → **over the last 14 days**
2. **Save**.

Her er flowfilter sikkert, fordi «Moedte ikke op» først sendes efter sessionens start (feltet er da ryddet).

**Rigtigt når:** flow filters viser 5 rækker: Hovedliste, can receive email marketing, not in Medlemmer, tb_naeste_webinar is not set, Deltog i webinar zero times in last 14 days. **Tid:** 10 min.

---

## 4. Sunset (XCqPKg): tre dele, A i morgen, B 14/10, C 29/10

**Formål:** sunset må ikke ramme medlemmer eller nylige webinarfolk, må kun sætte «sunset_afsluttet» på dem, der ikke har reageret, og mail 3's løfte («Jeg tager dig af listen i morgen») skal holdes.

**URL:** https://www.klaviyo.com/flow/XCqPKg/edit  (flowet er DRAFT; alle kort er draft)

**Kan Klaviyo afmelde i et flow? Nej.** Flowet kan sende mail, vente, splitte, sætte profilegenskaber og (evt.) ændre liste; jeg har ikke set en afmeld-handling i nogen definition eller i hjælpesiderne. Afmeldingen sker derfor uden for flowet (del C).

### 4A. I morgen: ret flowet (stadig draft, intet sendes)

**Flow-filter (medlemmer og webinar):**
1. Klik på triggeren øverst («Døde — 180 dage») → **Flow filters** (tom nu) → **Add filter**:
   - **If someone is in or not in a list or segment** → **is not in** → **Medlemmer (ekskluderes)**
   - **What someone has done** → **Deltog i webinar** → **zero times** → **over the last 60 days**
   - **What someone has done** → **Moedte ikke op** → **zero times** → **over the last 60 days**
2. **Save**.

**Betinget afslutning (så kun ikke-reagerende får «sunset_afsluttet = ja»):**
1. Find sidste trin i flowet: **Wait 1 day** efterfulgt af **Update profile property** (`sunset_afsluttet = ja`).
2. Fra venstre menu: træk et **Conditional split** ind mellem ventetiden og profilopdateringen.
3. Betingelse (begge, OG): **What someone has done** → **Opened Email** → **zero times** → **since starting this flow**; og **Clicked Email** → **zero times** → **since starting this flow**.
4. **Yes**-grenen kobles til **Update profile property**. **No**-grenen efterlades tom (slutter).
5. **Save**.

**Rigtigt når:** flow filters viser 3 rækker; kæden er Mail 1 → Wait 7 d → Mail 2 → Wait 7 d → Mail 3 → Wait 1 d → Conditional split → (Yes) Update profile property `sunset_afsluttet = ja`. **Tid:** 20 min.

### 4B. 14/10: tænd (ikke før)
1. Sæt hvert kort til **Live**: klik kortet → status-vælger (Draft) → **Live**. Gør det for de tre mails og for Update profile property.
2. Sæt selve flowet **Live** (øverst til højre).
3. **Vigtigt:** et segment-udløst flow tager KUN dem, der GÅR IND i segmentet efter tændingen. De ca. 417 nuværende medlemmer af «Døde — 180 dage» går ikke ind af sig selv (Klaviyo community: «flows fire on entry into a segment»). Vil du have dem med: i flow-buileren **Add past profiles** (vælg start af flowet; tjek antallet først; hvis du ikke finder knappen, søg «add past profiles» i Klaviyos hjælp).
4. Kontrollér inden: segmentet «Døde — 180 dage» ≈ 417, og ingen fra Medlemmer er i det.
**Tid:** 10 min. Første mail 14/10, mail 2 21/10 kl. 08:15, mail 3 28/10 kl. 08:15, flag 29/10 kl. 08:15.

### 4C. 29/10: afmelding (løftet i mail 3)
**Formål:** holde løftet «jeg tager dig af listen i morgen» dagen efter mail 3, kun for dem, der ikke har reageret.
1. Klaviyo → **Lists & Segments** (https://www.klaviyo.com/lists) → **Create List / Segment** → **Segment**. Navn: «Sunset — afmeldes».
2. Betingelser (alle OG): **Properties about someone** `sunset_afsluttet` **equals** `ja`; **Opened Email** zero times **since** 13/10-2026 (dagen før tænding); **Clicked Email** zero times **since** samme dato; **not in** Medlemmer (ekskluderes); **Deltog i webinar** og **Moedte ikke op** zero times over the last 60 days.
3. **Create Segment**, og skriv antallet ned.
4. Giv Claude segmentets navn 29/10 efter kl. 09. Så køres en tørkørsel med antal, og derefter en global afmelding fra e-mailmarkedsføring (samme princip som eWebinar-afmeldingerne: afmelding, ikke undertrykkelse). Jeg har ikke set, om Klaviyos UI har en bulk-afmeld på et segment; derfor køres den fra Claude/platformen, ikke ved klik.
**Tid:** 10 min for segmentet.

---

## Kilder
Flow-definitioner XCqPKg, Wq3MkG, SDVvCW, TGxxUc, segmenterne RVwauf og WNygMq, lister og kampagner: Klaviyo (læst 29/9-2026). Hjælp: [Klaviyo: Understand flow triggers and filters](https://help.klaviyo.com/hc/en-us/articles/115002779051); [Klaviyo community: segment-flows og eksisterende profiler](https://community.klaviyo.com/marketing-30/why-your-klaviyo-flow-isn-t-sending-to-people-already-in-your-segment-and-what-to-do-instead-19472).

# Mailplanen ved 14 dages kadence — og SMS som frivilligt tilvalg

Papir 1/10-2026. Grundlaget er Nicklas' marketingdokument (1/10, sessioner hver 14. dag) og Jonas 1/10 kl. 14:28 om SMS: «Nej, vi har ikke SMS. Men det kan da sættes op som en frivillig ting … vi gør intet blindt, og det skal have et klart formål.»

Status: **forslag, intet bygget.** Kodens tilstand er beskrevet i CLAUDE.md «Platformens webinarmails» og `docs/webinaret-og-annoncerne.md` §7d–7e.

---

## 1. Hvad der er målt (prod 1/10)

| Session | Tilmeldte | Median tilmeldt før sessionen |
|---|---|---|
| 25/8 | 91 | 3,9 dage |
| 22/9 | 384 | 13,5 dage |
| 13/10 | 362 | 22,8 dage (sessionen er ikke holdt endnu) |

Afstanden mellem sessionerne har været 4 og 3 uger. Med 14 dage mellem sessionerne vil næsten alle tilmelde sig **under 14 dage før** den session, de vælger, fordi den næste altid er højst 14 dage væk. Det er en forventning, ikke en måling. Den måles igen efter de første to sessioner med den nye kadence.

## 2. Hvad kadencen gør ved PLANEN

PLANEN i dag (`_shared/webinarMailDom.ts`) har fire arter:
- `bekraeftelse` (straks, med `invite.ics`);
- `fjorten_dage` (kl. 08 14 dage før, med `invite.ics`, loft 8 dage før);
- `syv_dage`;
- `en_dag`.

Hertil kommer `en_time` og eWebinars egen 10-minutters-mail.

**`fjorten_dage` bliver tom eller dobbelt.**
- Den blev tilføjet 28/9 til et bestemt hold: de ca. 217, der tilmeldte sig 13/10 før 22/9 kl. 17:03 (`BEKRAEFTELSE_FRA`) og aldrig fik en invitation.
- Ved 14 dages kadence tilmelder næsten ingen sig mere end 14 dage før. Mailen bliver derfor enten `for_sent` (tilmeldt efter dens tidspunkt) eller sendt samme dag som bekræftelsen, med samme invitation to gange.
- **Forslag:** efter sessionen 13/10 flyttes `fjorten_dage` fra PLANEN til `UDGAAEDE_ARTER`. Det kræver ingen migration (ordforrådet og CHECK'en beholder den), kun én linje i PLANEN i begge spejle plus værnet `webinarMail.guard` dom 10. Det er samme greb som 30/9 med `tre_dage` og `dagen`.

**Resten bliver stående:**
- `syv_dage` rammer dem, der tilmelder sig 8–14 dage før.
- `en_dag` og `en_time` rammer alle.
- **«Kun den nærmeste kommende session får påmindelser»** (dubletværnet 29/9, `senere_session`) er vigtigere ved 14 dage. Én, der tilmelder sig to sessioner, får kun påmindelser til den første, og den næste overtager, når den første er begyndt.

**En deltager får så:**
- tilmeldt 8–14 dage før: bekræftelse · 7 dage · 1 dag · 1 time = 4 mails + eWebinars egen;
- tilmeldt under 7 dage før: 3 mails + eWebinars egen.

Det er færre end i dag, hvor 14-dages-mailen er med. Det passer med Jonas' linje om ikke at overmaile (klagen 22/9).

## 3. SMS: formålet først

**Formålet er fremmøde, intet andet.** Den måling, der afgør, om SMS virker:
- **andelen, der mødte op**, blandt dem med SMS mod dem uden;
- samme session, regnet med lag 6's `wilson`/`sammenlign` som i annoncesporet.

Først når intervallerne ikke overlapper, siger vi, at SMS virker. Før det er det et forsøg.

**Det, SMS aldrig bruges til:**
- markedsføring;
- tilbud;
- opfølgning efter webinaret;
- noget som helst til en, der ikke selv har sat krydset.

### 3.1 Hvad der sendes
**Én SMS pr. tilmelding, 1 time før sessionen:**

> «Webinaret med Morten starter kl. 11:00. Her er dit link: <personligt link>. Svar STOP for ingen flere SMS.»

Teksten skrives færdig sammen med Morten. Den skal stå i én SMS (≤ 160 tegn uden æøå, ellers ≤ 70 tegn pr. del), så den regnes ud og testes.

**Spørgsmål til Jonas:** skal SMS'en ERSTATTE `en_time`-mailen for dem, der har sagt ja? Anbefaling: **ja**. Samme budskab to steder på samme time er overmailing, og SMS'en er den, der bliver læst.

### 3.2 Samtykket
- Afkrydsningsfeltet på tilmeldingen er **tomt som standard**. Ordlyden: «Send mig en SMS 1 time før webinaret starter (valgfrit)». Telefonfeltet vises først, når krydset er sat.
- Lovgrundlaget slås op før bygning. Markedsføringslovens § 10 kræver forudgående samtykke til elektronisk markedsføring, også SMS. Om en ren påmindelse om et webinar, man selv har tilmeldt sig, overhovedet er markedsføring, er et skøn. **Vi tager den sikre side:** udtrykkeligt samtykke, logget med tidspunkt og ordlyd. Ikke en jurist-vurdering.
- «STOP» og afmelding virker straks og gælder alle fremtidige sessioner.
- Telefonnummeret slettes, når sessionen er afholdt (formålet er opfyldt), eller gemmes med samme opbevaring som tilmeldingen. **Jonas afgør.** Anbefaling: slet det 7 dage efter sessionen.

### 3.3 Firma og telefon på tilmeldingen
Nicklas ønsker at kunne ringe til tilmeldte. Det er **et andet formål end SMS'en**, og det skal stå som et andet felt med sin egen ordlyd. Et nummer givet til en påmindelse må ikke bruges til et opkald.

**Forslag:**
- «Firma (valgfrit)».
- «Må vi ringe til dig efter webinaret? (valgfrit) + telefon».

To kryds, to formål, to spor. Begge er valgfri, så tilmeldingen ikke bliver tungere for dem, der ikke vil.

**Målt 1/10:** formularen på topix.dk spørger kun om session, navn og mail, og eWebinars rå tilmelding (`webinar_tilmeldinger.raa`) bærer intet telefonnummer og intet firma.

## 4. To veje til SMS'en

| | A — eWebinars egen Twilio-integration | B — platformen sender selv |
|---|---|---|
| Hvad | eWebinar har en Twilio-integration til påmindelser (SMS/WhatsApp), som opsættes som en notifikation i eWebinar ([eWebinar: Twilio](https://ewebinar.com/integrations/twilio), [hjælpeartikel](https://ewebinar.com/help/how-to-use-ewebinars-twilio-integration-to-send-messages-over-whatsapp)) | En `webinar-sms-cron` efter samme mønster som `webinar-mail-cron`: ren dom, spor, lås, tørkørsel som standard, én SMS pr. (nummer, session) som databasens dom |
| Kode | Ingen | En motor, et spor, en migration |
| Samtykket | **Ikke slået op**, hverken hvordan eWebinar indsamler nummeret, eller om der er et samtykkefelt. Det står ikke i hjælpeartiklen. | Vores eget felt, logget hos os |
| Måling | Kun det, eWebinar viser | Spor pr. SMS, kobling til fremmødet (lag 6) |
| Uafhængighed | Bundet til eWebinar + Twilio-konto (mindst 20 USD indbetalt ifølge hjælpeartiklen, for WhatsApp) | Udbyder vælges af os. **Ikke slået op**, ingen pris og intet API endnu |

**Anbefaling: A som forsøg på 2–3 sessioner, B kun hvis forsøget viser højere fremmøde.**
- A kræver ingen kode og kan slukkes med ét klik.
- B er et rigtigt stykke infrastruktur, og det bygger vi ikke, før formålet er bevist («vi gør intet blindt»).
- **Forudsætningen for A** er, at eWebinars indsamling af telefonnummeret har et tomt samtykkefelt med vores ordlyd. Kan den ikke det, er A udelukket, og B er vejen.

## 5. Rækkefølgen (ét skridt ad gangen)
1. **Jonas svarer:** SMS erstatter `en_time` for dem med ja (3.1)? Slet nummeret 7 dage efter (3.2)? Firma + «må vi ringe» som to felter (3.3)?
2. **Opslag (Claude):**
   - eWebinars indsamling af telefonnummer og samtykkefelt, i hjælpecentret eller ved at spørge deres support;
   - markedsføringslovens § 10 og Forbrugerombudsmandens vejledning om SMS.
3. **Efter 13/10:** `fjorten_dage` ud af PLANEN (kode, PR, værn). Rul ud.
4. **Forsøget med A** på de næste 2–3 sessioner, hvis forudsætningen holder. Fremmødet sammenlignes med Wilson.
5. **Beslutning om B** ud fra tallet.

## 6. Bogføring
- **Hvorfor `fjorten_dage` ikke tages ud nu:** sessionen 13/10 har stadig sit hold af gamle tilmeldte, der mangler invitationen. Mailen er planlagt 29/9 og indhentes til 5/10 (loft 8 dage før). Den gør sit arbejde for netop dem.
- **Åbent:** Nicklas' fire KPI-mål og «varme leads» bygges på /webinar, når hans dokument foreligger igen. Den kopi, Claude havde, forsvandt med komprimeringen 1/10 eftermiddag.

# Migrationen af de eksisterende abonnementer — recon 1. september 2026

Måling af alle abonnementer på Topix.dk-kontoen, foretaget 1/9 kl. ~21.
Grundlaget for flytningen til `acct_1U6mzp3CvBmCx5Pt`. Beslutningen om
at flytte står i `docs/fornyelseskaeden-1-september.md` §8.

## 1. Momsen ændrer sig ikke — bevist

Det største spørgsmål før en flytning var om medlemmerne kom til at
betale mere. De gamle priser har `tax_behavior: "unspecified"`; de nye
har `"exclusive"`.

**Målt på faktura `in_1U4aXP4DoYItGRbIkfID3Vnu` (Launch Lab, august):**

| | |
|---|---|
| subtotal | 437.500 øre (4.375,00 kr.) |
| moms | 109.375 øre (1.093,75 kr.) |
| `tax_behavior` på linjen | **exclusive** |
| total | 546.875 øre (5.468,75 kr.) |

Stripe Tax behandler `unspecified` som exclusive når automatisk moms er
slået til. Flytningen ændrer altså ikke hvad nogen betaler.

## 2. Fire abonnementer skal IKKE migreres

De er i deres SIDSTE periode: `cancel_at` er lig med næste træk. De har
betalt deres tolvte rate og stopper ved periodens udgang. De skal
fornys, ikke flyttes.

| abonnement | ophører |
|---|---|
| `sub_1S3zjB` | 05/09-2026 |
| `sub_1S4Y8w` | 07/09-2026 |
| `sub_1S9qCh` | 21/09-2026 |
| `sub_1SCcyF` | 29/09-2026 |

Datoerne matcher Studio Mini, CARMA STUDIO, Pro-Vision og PHILBERT.

**Migrationen er dermed 14 abonnementer, ikke 18.**

## 3. Migrationslisten

Sorteret efter næste træk. `pm` = `default_payment_method` på
abonnementet.

| abonnement | kunde | næste træk | ophør | pm |
|---|---|---|---|---|
| `sub_1SwW1V` | `cus_TuKgyHwTAepIPF` | 02/09-2026 | 02/02-2027 | sat |
| `sub_1T6qX5` | `cus_U50Yf3DR2g2w02` | 03/09-2026 | 03/03-2027 | NULL |
| `sub_1T6wlH` | `cus_U56zOT7t4OGKPa` | 03/09-2026 | 03/03-2027 | NULL |
| `sub_1TJTJC` | `cus_UI3QrNMxLMXQ2M` | 07/09-2026 | 07/04-2027 | NULL |
| `sub_1TUOmK` | `cus_UTLT1NKgoDuzFo` | 07/09-2026 | 07/05-2027 | NULL |
| `sub_1SHhE5` | `cus_TE9XePd7bWBkaO` | 13/09-2026 | 13/10-2026 | NULL |
| `sub_1TiTS9` | `cus_UhtEkpmNL8TlrN` | 15/09-2026 | 15/06-2027 | NULL |
| `sub_1S7wf3` | `cus_T44oqJhzxlpPCf` | 16/09-2026 | 15/12-2026 | sat |
| `sub_1TCHhb` | `cus_UAcxhBRUM4CJzw` | 18/09-2026 | 18/03-2027 | sat |
| `sub_1TZ6sv` | `cus_RvN8lZI83QVo8T` | 20/09-2026 | 20/05-2027 | NULL |
| `sub_1TZ9gh` | `cus_UYGBqhGIxGiqqF` | 20/09-2026 | 20/05-2027 | NULL |
| `sub_1T4yFu` | `cus_U34O099qBoXAru` | 26/09-2026 | 26/02-2027 | NULL |
| `sub_1SuvT9` | `cus_TsgqAg0mLpRdOn` | 29/09-2026 | 29/01-2027 | NULL |
| `sub_1TRWKT` | `cus_UQN4yeWvSiDOJe` | 29/09-2026 | 29/04-2027 | NULL |

Ni kører 3.500/md (kohorte 2025), fem kører 4.375/md.

## 4. Elleve af fjorten har intet betalingsmiddel på abonnementet

`default_payment_method` er NULL. Kortet ligger på KUNDEN, ikke på
abonnementet. Ved genskabelse på den nye konto skal betalingsmidlet
sættes eksplicit, ellers fejler første træk — kundekopien flytter
kortet, men ikke hvilket abonnement der bruger det.

## 5. Tre træk falder inden for 48 timer

`sub_1SwW1V` trækker 02/09, `sub_1T6qX5` og `sub_1T6wlH` trækker 03/09.
De må ikke migreres før efter deres træk, eller de risikerer at blive
opkrævet to gange. Stripes egen anvisning: opret nyt abonnement,
annullér det gamle FØR det trækker.

## 6. En rabat der ikke kopieres

`sub_1TZ6sv` bærer `di_1TZ6sv4DoYItGRbIuACNco1p` fra kuponen
`TB2026V2` (checkout-URL'en indeholder `?coupon_code=TB2026V2`).
Rabatter kopieres ikke ved en migration og skal genskabes manuelt,
ellers betaler kunden fuld pris efter flytningen.

## 7. YKRG kan ikke migreres endnu

`sub_1TRWKT` står `past_due` — kunde `cus_UQN4yeWvSiDOJe`, YKRG APS,
tapas@tapasamor.dk. Anden gang kortet fejler. En restance kan ikke
flyttes; den skal betales eller afskrives først, og kortet skal virke,
ellers fejler første træk på den nye konto på samme måde.

## 8. Alle abonnementer har en subscription schedule

Hvert abonnement har `schedule: sub_sched_…` — det er sådan Circles
paywall har implementeret ophøret efter tolv træk. Ved annullering skal
schedulen håndteres; en efterladt schedule kan i princippet genskabe et
abonnement.
IKKE MÅLT: om Stripe frigiver schedulen automatisk ved annullering.

## 9. Kunderne bærer CVR i Stripe

Fakturaen for Launch Lab viser `customer_tax_ids: [{ type: "eu_vat",
value: "DK44921952" }]` og `customer_name: "Launch Lab ApS"`.
Koblingen kunde → virksomhed kan derfor laves på CVR frem for på navn.
Det er den samme nøgle vi brugte til Monday-afstemningen, og navnene
lyver: Launch Lab hedder `remm.` i platformen.

ÅBENT: koblingen for de øvrige tretten er ikke lavet endnu. Den kræver
et fakturaopslag pr. abonnement.

## 10. DRIFTSFUND — e-conomic-integrationen er død

Samme faktura bærer:

    "Visma eco Invoice Error Log": "Your free trial has expired.
     To continue using this integration, please consider upgrading
     your plan"

Der findes altså en Stripe-til-e-conomic-integration via Cloudify, og
den har holdt op med at virke fordi prøveperioden udløb. Fakturaerne
når ikke bogholderiet.

Det ændrer §5 i fornyelseskædens dokument, hvor e-conomic-koblingen står
som noget der skal bygges: den findes, den skal genoplives eller
erstattes. Hvor længe den har været død, er ikke målt.

## 11. Circles greb om den gamle konto

Alle atten abonnementer bærer `application:
ca_GF3jRjjC9o8Ueg72EKCED0GM7oofFHYF` med
`application_fee_percent: 0.5`, og `paywall_url:
app.topix.dk/checkout/the-boardroom`. Kontoen har
`controller.type: "application"`.

## 12. Rækkefølgen når vi flytter

Fra `docs/fornyelseskaeden-1-september.md` §8, uændret:
a. Cutoveren er gennemført 1/9 — platformen taler med den nye konto.
b. ÉN virksomhed flyttes som pilot. Vælg en med langt til næste træk:
   `sub_1TRWKT` er udelukket (past_due), så `sub_1SuvT9` (29/9) eller
   `sub_1T4yFu` (26/9) er de bedste kandidater.
c. Bevis i drift: trækket gennemføres, beløbet er uændret, ophøret
   sidder.
d. Derefter resten i portioner, aldrig alle på én dag.

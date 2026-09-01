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

---

# Tillæg — koblingen og målpriserne (1/9 kl. ~21.30)

## 13. Hvem er de fjorten

Kunderne bærer virksomhedsnavnet i `name` og kontaktpersonen i
`description`. Koblingen er dermed direkte og kræver ingen gætteri.

| abonnement | kunde | virksomhed | mail |
|---|---|---|---|
| `sub_1SwW1V` | `cus_TuKgyHwTAepIPF` | TuaMea Jewelry ApS | marianne@mmoelgaard.com |
| `sub_1T6qX5` | `cus_U50Yf3DR2g2w02` | Floren engros | floren@mail.dk |
| `sub_1T6wlH` | `cus_U56zOT7t4OGKPa` | BR Roset | bsl@larsen.dk |
| `sub_1TJTJC` | `cus_UI3QrNMxLMXQ2M` | Brick Works ApS | caspar@brick-works.dk |
| `sub_1TUOmK` | `cus_UTLT1NKgoDuzFo` | ANLA A/S | anders@anlaglas.com |
| `sub_1SHhE5` | `cus_TE9XePd7bWBkaO` | doggybed | roskilde.dan@gmail.com |
| `sub_1TiTS9` | `cus_UhtEkpmNL8TlrN` | Launch Lab ApS | daniel@launchlab.dk |
| `sub_1S7wf3` | `cus_T44oqJhzxlpPCf` | Livja | skriv@livja.dk |
| `sub_1TCHhb` | `cus_UAcxhBRUM4CJzw` | Fjeldgaardshop.dk | kontakt@fjeldgaardshop.dk |
| `sub_1TZ6sv` | `cus_RvN8lZI83QVo8T` | KJ AUTO | per@kj-auto.dk |
| `sub_1TZ9gh` | `cus_UYGBqhGIxGiqqF` | Homie Håndværkerservice ApS | nicolai@homie.nu |
| `sub_1T4yFu` | `cus_U34O099qBoXAru` | Two Socks («TS Warehuose») | simon@simonfrimann.dk |
| `sub_1SuvT9` | `cus_TsgqAg0mLpRdOn` | WESDEX | jonas@wesdex.dk |
| `sub_1TRWKT` | `cus_UQN4yeWvSiDOJe` | YKRG APS | tapas@tapasamor.dk |

**Bemærk WESDEX og Two Socks.** De er to af de fem virksomheder der
manglede en række i `companies` (§4 i indgangens designdokument) — og
de har betalt via Stripe hele tiden. De blev importeret 1/9. Det er
belægget for at «findes ikke i platformen» og «betaler ikke» er to
uafhængige ting.

## 14. Rabatten løser sig selv — målt

`sub_1TZ6sv` (KJ AUTO) bærer kuponen `TB2026V2`. Målt på faktura
`in_1U6Sk24DoYItGRbIbhIgxYPy`:

| | |
|---|---|
| listepris | 437.500 øre (4.375,00 kr.) |
| rabat | 306.250 øre (3.062,50 kr.) |
| efter rabat | **131.250 øre (1.312,50 kr.)** |
| moms | 32.813 øre (328,13 kr.) |
| i alt | 164.063 øre (1.640,63 kr.) |

1.312,50 kr. er PRÆCIS prisen på `fornyelse_15000_rate12` i det nye
katalog. KJ AUTO kom ind på 30.000 i 2025 og fornyede til 15.000 i
tolv rater; paywallen implementerede det som listeprisen med en 70 %-
kupon. På den nye konto flyttes de til fornyelsesprisen UDEN rabat.
Kuponen skal ikke genskabes.

## 15. Målpris pr. abonnement på den nye konto

Alle på produktet `prod_VBBXP0VYDpEtek`.

| abonnement(er) | betaler i dag | ny lookup_key | beløb |
|---|---|---|---|
| `sub_1SwW1V`, `sub_1T6qX5`, `sub_1T6wlH`, `sub_1TJTJC`, `sub_1SHhE5`, `sub_1S7wf3`, `sub_1TCHhb`, `sub_1T4yFu`, `sub_1SuvT9` | 3.500/md | `nyt_40000_rate12` | 3.500 |
| `sub_1TUOmK`, `sub_1TiTS9`, `sub_1TZ9gh`, `sub_1TRWKT` | 4.375/md | `nyt_50000_rate12` | 4.375 |
| `sub_1TZ6sv` (KJ AUTO) | 1.312,50/md efter rabat | `fornyelse_15000_rate12` | 1.312,50 |

Prisen `nyt_40000_rate12` blev oprettet 1/9 netop til denne kohorte —
og med den dobbeltfunktion at 40.000 fremover kan bruges som en bevidst
specialpris. Se `docs/fornyelseskaeden-1-september.md`.

**Ingen medlemmer får ændret deres beløb ved flytningen.** Momsen
opfører sig ens (§1), og hver målpris er identisk med det de betaler i
dag.

## 16. Hvad der stadig mangler før flytningen

- `billing_cycle_anchor` skal sættes på hvert nyt abonnement, så næste
  træk falder på samme dag som i dag. Datoerne står i §3.
- `cancel_at` skal sættes efter genskabelsen — mekanikken er den samme
  som fornyelsens, bevist i produktion 1/9.
- `default_payment_method` skal sættes eksplicit for de elleve der har
  NULL (§4).
- YKRG skal have et kort der virker (§7).
- Kobling til `companies.id` er IKKE lavet: tabellen ovenfor giver navn
  og mail, men ikke virksomhedens UUID. Det er et opslag på CVR eller
  mail i `companies` og hører til lige før flytningen.

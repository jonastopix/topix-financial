# Recon: udløb, fornyelse og betalingsvejen
> Skrevet 2026-08-27. Øjebliksmåling — linjenumre og tal gælder den dag, ikke i dag.

Ren recon, 2026-08-27, main. Vigtigste korrektion af mangellisten
først: **"udløbsvarsel og afskedsmail — bygget og bevist" passer ikke på
mails. Der findes INGEN udløbsvarsel- eller afskedsmail i repoet** —
ingen skabelon, ingen edge function, ingen tekst. Det der er bygget og
bevist er BESLUTNINGSMOTOREN (`fornyelse.ts`, fuldt testdækket) og dens
tabel — og det er dén der står uden aftager. Dertil ét kritisk
tidsfund: **de tre virksomheder der udløber 1/9, 5/9 og 7/9 ligger ALLE
uden for ordningen by design** (ikrafttræden 10/9) — motoren vil aldrig
røre dem; de SKAL håndteres i personlig dialog.

---

## 1. Udløbsmotoren

`src/lib/fornyelse.ts` (165 linjer) — ren, IO-fri afgørelse i samme
mønster som deriveFocus. Ingen mails, ingen tidspunkter, ingen cron:
den klassificerer én virksomhed i én af TI statusser:

```
43:  | "ingen_slutdato" | "uden_for_ordningen" | "selvbetjener"
     | "udloebet_uden_beslutning" | "udloebet_tilbyd" | "udloebet_tilbyd_ikke"
     | "beslutning_mangler" | "klar_til_tilbud" | "klar_til_afsked" | "i_god_tid"
```

Bærende regler:

- **Vinduet**: `FORNYELSES_VINDUE_DAGE = 60` (21) — inden for 60 dage
  til udløb kræves en beslutning (`beslutning_mangler` →
  `klar_til_tilbud`/`klar_til_afsked`, 154-163).
- **Ikrafttrædelsen 10/9**: `FORNYELSE_IKRAFT_DATO = "2026-09-10"` (32).
  Slutdato PÅ ELLER FØR den dato → `uden_for_ordningen`, afgjort FØR alt
  andet (115-127): "Disse virksomheder er håndteret i personlig dialog
  uden for systemet. Ordningen … må ikke sende noget på bagkant."
  Grænsen er "på eller før" fordi adgangen forsvinder kl. 00:00 UTC på
  selve slutdagen (24-30). **Konsekvens for de tre akutte:**
  LineAlmegaard (1/9), Studio Mini (5/9) og CARMA STUDIO (7/9) er alle
  ≤ 10/9 → uden_for_ordningen. Motoren er bevidst designet til IKKE at
  hjælpe med dem.
- **Én udløbsdefinition**: tier delegeres til `computeMembershipTier`
  (8-12, 100-107) — "en lokal kopi … ville være kopi nr. 4" (kanonisk i
  `src/lib/membershipTier.ts`, spejlet i Deno
  `_shared/membershipTier.ts` og i SQL, migration 20260810150000).
- Stripe-selvbetjenere er egen tilstand (`selvbetjener`, 133-137) og
  "må ikke behandles som en almindelig fornyelse".

**"Bevist"** = `src/lib/__tests__/fornyelse.test.ts`: alle ti statusser
(37-107), hele ikrafttrædelses-grænsen inkl. på-dagen og dagen-efter
(109-155) og 60/61-dages grænserne (157-203). Ingen tørkørsel — der er
intet at tørkøre; motoren har ingen I/O.

**Ingen aftager, målt**: `afgoerFornyelsestilstand` importeres af
præcis én fil — sin egen test. MembershipExpiredGate bruger den ikke;
ingen edge function kender den.

## 2. Tilstand pr. virksomhed — findes den?

**Ja — feltet findes, men hverken UI eller læser.** Migration
`20260811120000_fornyelsesbeslutning.sql` opretter
`company_fornyelse`:

```sql
company_id  uuid PRIMARY KEY REFERENCES companies(id),
beslutning  text NOT NULL CHECK (beslutning IN ('tilbyd','tilbyd_ikke')),
besluttet_af uuid, besluttet_at timestamptz, note text, …
```

Med præcis den semantik beslutningsgrundlaget kræver: "ingen række =
ingen beslutning truffet, og intet må sendes automatisk uden en
eksplicit 'tilbyd'. Den sikre standard er tavshed." Egen tabel (ikke
kolonner på companies) fordi medlemmet ellers kunne læse rådgiverens
note om sig selv via sin egen companies-række; RLS er advisor-only
FOR ALL. **Mangler**: en rådgiver-UI der skriver rækkerne (i dag kun
SQL editor), og noget som helst der læser dem (motoren tager
beslutningen som input-parameter).

## 3. Adgangsgaten ved udløb

**Håndhævelsen er klient-side.** `src/pages/Index.tsx`:

```tsx
82:  if (!rawAdvisor && membershipTier === "expired") {
83:    return <MembershipExpiredGate />;
```

`membershipTier` beregnes i useAuth af `computeMembershipTier`
(contract_end_date + subscription_status/current_period_end). Gaten
(`MembershipExpiredGate.tsx`) er en fuldskærm med tre veje: (a)
selvbetjenings-abonnement via `create-subscription-checkout`, (b)
mailto:jonas@topix.dk om fornyelsestilbud ("Din fornyelsespris
afhænger af din oprindelige aftale", linje 106-119), (c) offboarding
(`offboarding_requested_at` sættes; "Jonas kontakter dig inden for 2
hverdage").

**RLS håndhæver IKKE udløb**: ingen company-scoped policy tjekker
contract_end_date — det udløbne medlems data og API-adgang er intakt;
kun UI'et er lukket. Spredte server-/UI-gates findes dertil:
intro-cron filtrerer på aktiv kontrakt, book-session skjules på
slutdagen (`bookSessionTilstand`: streng '>', testet), directory viser
kun aktive (migration 20260810150000).

Forskellen på de udløbne fra maj og et aktivt medlem er altså: de ser
gaten i stedet for dashboardet — men deres data, RLS-adgang og
chat-infrastruktur er der stadig.

## 4. Hvad skriver contract_end_date?

Tre steder — og **ingen automatisk forlængelse**:

1. **EditCompanyDialog** (advisor-UI, `members/EditCompanyDialog.tsx`
   93-109): direkte `companies.update({ contract_start_date,
   contract_end_date, … })` — den ENESTE vej til at forlænge i dag, og
   den er manuel pr. virksomhed.
2. **import-application** (Monday-importen): sætter datoen ved
   oprettelse (299) og på eksisterende KUN hvis feltet er tomt
   (152-153: `if (!existingCo.contract_end_date && …)`) — bevidst
   aldrig en forlængelse.
3. Stripe-webhook rører den IKKE (se §5).

Mangellistens "intet i kodebasen forlænger contract_end_date" står
ved magt for alt automatisk; den manuelle advisor-dialog kan.

## 5. Stripe i dag

Tre funktioner, alle i dette repo, og betalingsdata ender i DENNE
database (på companies):

- **create-subscription-checkout**: subscription-mode checkout med
  hardkodet pris `price_1TOkf44DoYItGRbIsXHMPhBq` (51),
  `metadata.company_id` på både session og subscription (64-65),
  genbruger `companies.stripe_customer_id` (69-70). Kaldes fra
  MembershipExpiredGate.
- **stripe-webhook** (Bucket C, stripe-signature): på
  `customer.subscription.created/updated` skrives
  `subscription_status`, `stripe_customer_id`,
  `subscription_current_period_end` på companies (88-98); på
  `deleted` sættes status "cancelled" (108-116). Og afgørende:
  `checkout.session.completed` for andre modes SPRINGES OVER (141) —
  én-gangs-betalinger opdaterer ingenting på kontrakten.
- **create-stripe-checkout**: payment-mode (én gang) med hardkodet
  pris `price_1TJXmx4DoYItGRbIw9DSzmuW` (88-93) — en enkeltydelse,
  ikke medlemskab.

Selvbetjenings-abonnementet ER altså en betalingsvej der virker hele
vejen ind i databasen og ind i adgangsdommen: `computeMembershipTier`
giver tier "subscriber" på aktivt abonnement, og Index slipper
subscriber-medlemmer ind (Index.tsx:98). Fuldpris-KONTRAKTEN har
derimod ingen betalingsvej — den lever på mail + Monday +
EditCompanyDialog.

## 6. Korteste vej til "betaling forlænger automatisk"

Den korte sandhed: **for abonnementsvejen findes den allerede** —
betaling → webhook → subscription_status/current_period_end → tier
"subscriber" → adgang. Det der mangler er KONTRAKT-fornyelsen:

1. **Et fornyelses-checkout** med den rigtige pris pr. virksomhed
   (priserne er individuelle — gaten siger det selv; kræver enten
   pris-felter i DB eller Stripe-produkter pr. kohorte). Mangler.
2. **En webhook-gren** for `checkout.session.completed` (mode payment)
   der læser `metadata.company_id` og skriver
   `contract_end_date = contract_end_date + interval` — grenen er i
   dag bevidst skippet (141). Mangler.
3. **Beslutningskoblingen**: send kun tilbudslinket ved
   `company_fornyelse.beslutning = 'tilbyd'` (tabellen findes; UI og
   læser mangler).
4. Varsels-/afskedsmailene selv + afsenderflade (findes ikke, jf. §1)
   — kan bygges oven på mail-infrastrukturen fra sekvensmotor-reconen
   (kø, dedup, prefs — alt genbrugeligt).

## 7. Hvem HAR fornyet — findes data?

Delvist: `companies.subscription_status` +
`subscription_current_period_end` + `stripe_customer_id` viser
selvbetjenings-fornyerne (og fornyelse.ts behandler dem som egen
tilstand). **Kontrakt-fornyelser findes IKKE som historik i databasen**
— der er ét muterbart datofelt, ingen fornyelses-log, ingen pris
(priserne er hardkodede i funktionerne, individuelle aftaler står i
mailen/gaten som "afhænger af din oprindelige aftale"). Kohorte og
pris ligger reelt på Monday (import-application bærer kontraktdatoer
IND derfra) og i Stripe-dashboardet for abonnenterne.

## 8. Hvad kan sendes i denne uge uden at bygge?

Udløbsmotoren er **ikke kaldbar** — den er en ren funktion uden
HTTP-flade, uden cron og uden mails; der ER intet at trigge manuelt.
Det der KAN bruges i denne uge, som det står:

1. **advisor-broadcast** (edge function, advisor-gated): sender en
   chatbesked til udvalgte `company_ids` — en manuel, menneskestyret
   pr.-virksomhed-kanal der virker i dag. Men bemærk målgruppen: de
   udløbne ser gaten, ikke chatten; broadcast rammer bedst dem der
   ENDNU ikke er udløbet (de tre akutte).
2. **EditCompanyDialog**: forlæng kontrakten manuelt for dem der
   forhandles på plads.
3. **company_fornyelse kan udfyldes nu** via Lovable SQL editor
   (advisor-RLS), så beslutningen er registreret før nogen motor
   bygges — ordningens forudsætning om menneskestyring er netop
   tabellen.
4. Selve varslet/afskeden pr. mail: findes ikke i systemet — i denne
   uge er det almindelig personlig mail. Hvilket for de tre akutte
   (alle uden_for_ordningen pr. design) alligevel er den besluttede
   kanal.

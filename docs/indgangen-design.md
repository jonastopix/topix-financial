# Indgangen — fra underskrift til aktivt medlem

**DESIGNDOKUMENT — intet af det beskrevne findes endnu.** Beslutningerne
er truffet 1. september 2026; dette er den besluttede form, ikke en
bogføring af noget bygget. Samme regel som de øvrige dokumenter: hver
påstand er enten målt, eller mærket som ikke målt/åben.

## 1. Den bærende skelnen

**Virksomheden er en AFTALE. Medlemmet er en ADGANG.** De to skabes af
hver sin begivenhed:

- **Underskrift** → virksomheden oprettes med alle data fra Monday
  (CVR, adresse, branche, kontaktperson, betalingsmodel). Ingen
  kontraktdatoer endnu. Ingen invitation. Ingen adgang.
- **Betaling** → kontraktdatoerne sættes fra betalingsdagen,
  invitationen sendes, adgangen åbner.

## 2. Hvorfor

I dag oprettes virksomheden først når medlemmet accepterer en
invitation (`monday-webhook` linje 226: «user creates their own company
at signup»). Sker det aldrig, findes virksomheden ikke — og så mangler
den heller ikke.

Målt 1/9: fem betalende medlemmer havde ingen række i `companies`
(Pro-Vision, E-skilte, Wesdex, Din økonomiafdeling, Two socks). To af
dem havde betalt for et helt år uden at få adgang. **Et medlem der ikke
findes, kan ingen savne.**

Med oprettelse ved underskrift bliver «har skrevet under, mangler at
betale» en TILSTAND der kan ses på rådgiverfladen, frem for et tomrum.

## 3. Adgangen må ikke åbne før betaling

En virksomhed uden kontraktdatoer giver `computeMembershipTier`
«no_date», som `useAuth` i dag oversætter til «full». En bruger på en
ubetalt virksomhed ville altså få FULD adgang.

Derfor: invitationen sendes først ved betaling. Underskriften giver en
virksomhed i systemet; betalingen giver adgang. Ingen kan komme ind
uden at have betalt.

**ÅBENT:** om `computeMembershipTier` i stedet burde kende en eksplicit
«afventer_betaling»-tilstand. Ikke afgjort — og husk at funktionen
findes fire steder og skal ændres samlet, hvis det besluttes.

## 4. De 30 dage

Aftalegrundlaget giver 30 dages frist fra underskrift til at komme i
gang. Påmindelser i den periode skal bygges som en TILSTAND i en ren
funktion — samme mønster som `afgoerFornyelsestilstand` — ikke som et
cron-job der gætter.

Foreslåede tilstande (ikke endeligt): `underskrevet`, `paamindet`,
`frist_naer`, `frist_overskredet`, `betalt`.

Rådgiverfladen skal kunne vise «N virksomheder har skrevet under og
mangler at betale», på samme måde som fornyelsesbeslutningerne vises i
dag.

## 5. Betalingslinket

Må IKKE være et statisk Stripe Payment Link: et statisk link kan ikke
bære HVEM der betaler, og uden det kan webhooken ikke sætte
kontraktdatoerne på den rigtige virksomhed eller sende invitationen.
Linket skal bære en reference til virksomheden.

**ÅBENT:** hvordan referencen bæres sikkert i en mail til en person der
endnu ikke har en konto på platformen. Et gættet eller videresendt link
må ikke kunne aktivere en fremmed virksomhed.

## 6. Ophøret på rate-modellerne gælder også her

Nye medlemmer kan betale i 2 eller 12 rater. Prisen bærer ikke selv et
ophør — samme fælde som ved fornyelse. `cancel_at` skal sættes af
webhooken på det oprettede abonnement, ud fra dets faktiske
`start_date`, 12 måneder minus 1 dag.

Mekanikken findes allerede og er bevist i produktion 1/9 (se
`docs/fornyelseskaeden-1-september.md` afsnit 12); den skal GENBRUGES,
ikke genopfindes.

## 7. Kendte fejl i den nuværende monday-webhook

- **Invitationen oprettes uden `company_id`,** så virksomhedsdata fra
  Monday (CVR, adresse, branche, kontraktdatoer) følger ikke med. Til
  sammenligning henter `import-application` det hele, men kræver et
  manuelt klik.
- **Rådgiveren der sættes som `invited_by` vælges med `.limit(1)` uden
  `order`** — hvem det bliver, afgøres af hvad databasen tilfældigvis
  returnerer.
- **Betalingslinket kommer ikke herfra.** Den mail Monday sender med
  Circle-linket er en separat automatisering der lever på Monday og
  skal flyttes.

## 8. Åbne punkter før dette kan bygges

- Mailene Monday sender i dag skal SES, så de kan flyttes som de er
  frem for at blive opfundet på ny.
- Hvordan betalingslinket bærer virksomhedsreferencen sikkert (§5).
- Om `computeMembershipTier` skal kende «afventer_betaling» (§3).
- Hvad der sker når de 30 dage overskrides uden betaling: bortfalder
  aftalen, eller står virksomheden bare videre?

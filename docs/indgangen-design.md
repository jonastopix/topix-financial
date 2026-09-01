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

**BESLUTTET 1/9:** `computeMembershipTier` skal IKKE kende
«afventer_betaling». Adgangen styres af at invitationen først sendes
ved betaling — ingen bruger findes på en ubetalt virksomhed, så
tier-spørgsmålet opstår ikke. De fire kopier af funktionen forbliver
uændrede.

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

**Efter fristen — besluttet 1/9:** på dag 31 sendes automatisk en
faktura på det fulde beløb gennem Stripe Invoicing — ikke gennem
e-conomic, for ellers fyrer webhooken ikke, og virksomheden aktiveres
aldrig. Aftalen bortfalder IKKE. Virksomheden skifter til tilstanden
`frist_overskredet` og dukker op på rådgiverfladen, så et menneske kan
tage fat. Fakturaen er altid det FULDE beløb: rater kræver et
abonnement med et kort, og en faktura er ét beløb. Det skal stå i
mailen fra dag 0, ikke opdages på dag 31.

## 5. Betalingslinket

Må IKKE være et statisk Stripe Payment Link: et statisk link kan ikke
bære HVEM der betaler, og uden det kan webhooken ikke sætte
kontraktdatoerne på den rigtige virksomhed eller sende invitationen.
Linket skal bære en reference til virksomheden — og et gættet eller
videresendt link må ikke kunne aktivere en fremmed virksomhed.

**Designet (besluttet 1/9):** mekanikken kopieres fra
invitationstokenet, som allerede løser samme problem: en mail til en
person uden konto, der skal kunne åbne præcis én ting.

Målt i repoet: `company_invitations.token` er `uuid NOT NULL DEFAULT
gen_random_uuid()` — 122 bits, kan ikke gættes. Politikken «Anyone can
read invitation by token» blev oprettet og DROPPET 44 sekunder senere
(migration 20260225103844 og …103928): RLS kan ikke se hvilket token
der stod i URL'en, så en sådan politik giver adgang til ALLE rækker.
Løsningen blev `lookup_invite_company_info(invite_token uuid)` —
SECURITY DEFINER, låst search_path, tokenet som ARGUMENT, og kun to
felter retur (navn og logo).

Betalingslinket følger samme form med tre forskelle:

- **Tokenet ligger på VIRKSOMHEDEN,** ikke på en invitation.
  Invitationen sendes først ved betaling, så den findes ikke endnu.
- **Tokenet UDLØBER efter de 30 dage.** Et invitationstoken uden udløb
  er acceptabelt; et betalingslink der virker om tre år er en genvej
  til at aktivere en virksomhed. Efter fristen skal linket sige at
  fristen er passeret og at der er sendt en faktura — ikke åbne en
  betaling.
- **Selve betalingen sker i en edge function,** ikke i SQL-funktionen:
  den validerer tokenet, bygger Stripe-sessionen og sætter `company_id`
  i metadata. Mekanikken er den samme som `opret-fornyelse-checkout`,
  blot med et token frem for et login.

Opslagsfunktionen må returnere KUN: virksomhedens navn, beløbet, de
tre betalingsmodeller med rater beregnet, og fristens dato. Ikke mail,
ikke CVR, ikke adresse, ikke `company_id`.

## 6. Ophøret på rate-modellerne gælder også her

Nye medlemmer kan betale i 2 eller 12 rater. Prisen bærer ikke selv et
ophør — samme fælde som ved fornyelse. `cancel_at` skal sættes af
webhooken på det oprettede abonnement, ud fra dets faktiske
`start_date`, 12 måneder minus 1 dag.

Mekanikken findes allerede og er bevist i produktion 1/9 (se
`docs/fornyelseskaeden-1-september.md` afsnit 12); den skal GENBRUGES,
ikke genopfindes.

## 7. Kendte fejl i den nuværende monday-webhook

- **Webhooken fyrer på «I gang», ikke på «Godkendt»** (linje 158) —
  se §8; invitationen følger derfor ikke underskriften.
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

## 8. Signalet fra Monday

Underskrift = status «Godkendt» på ansøgningsboardet.

**MÅLT FEJL:** `monday-webhook` fyrer i dag på «I gang» (linje 158),
ikke på «Godkendt». Invitationen sendes derfor ikke ved underskrift,
men når nogen sætter statussen til «I gang» — hvilket kan ske sent
eller aldrig. Det er en sandsynlig delforklaring på at fem betalende
medlemmer aldrig fik en række i `companies`.

Fremover: «Godkendt» opretter virksomheden og sender betalingsmailen.

## 9. De fire mails

Rytme besluttet 1/9: **dag 0** (ved underskrift), **dag 14**,
**dag 25**, **dag 31**. Dag 7 fra den nuværende Monday-automatik er
droppet — der er intet nyt at sige efter en uge, og en mail uden
budskab lærer folk at ignorere de næste.

Principper:

- Fristen angives med DATO, ikke som «30 dage».
- Beløbet nævnes konkret.
- Faktura-konsekvensen står allerede i dag 0-mailen.
- Faktura-boksen fra de nuværende mails er fjernet fra alle fire — den
  fyldte halvdelen af hver mail for at dække en undtagelse, og er nu
  en sætning i den første og en konsekvens på dag 31.
- Betalingsmodellen nævnes IKKE i mailene: den vælges ved betaling,
  ikke ved ansøgning (besluttet 1/9). Betalingssiden viser alle tre.

## 10. Åbne punkter før dette kan bygges — alle lukket 1/9

Dokumentets oprindelige åbne punkter er siden lukket:

- **Mailene Monday sender i dag** er set; rytmen og principperne står
  i §9 (dag 7 droppet, faktura-boksen fjernet).
- **Betalingslinkets virksomhedsreference:** løst med token efter
  invitations-mønsteret (§5).
- **«afventer_betaling» i `computeMembershipTier`:** nej —
  tier-spørgsmålet opstår ikke, når invitationen først sendes ved
  betaling (§3).
- **Efter de 30 dage:** faktura på det fulde beløb via Stripe
  Invoicing på dag 31; aftalen bortfalder ikke (§4).

## 11. Sådan bygges påmindelserne — recon 1/9

Mønsteret findes allerede i huset. `intro-reminder-cron` er det
nærmeste forlæg: samme opgave (find virksomheder hvor en frist nærmer
sig, send en mail, husk at den er sendt), og den skal KOPIERES frem for
at opfindes igen. `legat-reminder-cron` er en anden kandidat — ikke
læst.

**Målt i repoet:**

- **Send-vejen:** indsæt i `email_send_log` med status «pending»,
  derefter `rpc("enqueue_email", { queue_name: "transactional_emails",
  payload })` med `message_id` som både `message_id` og
  `idempotency_key`.
- **Fejler enqueue, må tidsstemplet IKKE opdateres** — så prøves
  mailen igen næste dag frem for at forsvinde. Det er eksplicit i
  `intro-reminder-cron` linje 220.
- **Kadencen styres af et tidsstempelfelt på `companies`,** ikke af en
  tæller. Forlæg: `intro_reminder_last_sent_at`.
- **Afsender:** «Morten fra The Boardroom <noreply@boardroom.topix.dk>».
  Bemærk at domænet stadig er topix.dk — værd at overveje ved
  Forside-GO, men ikke ændret her.
- **Opt-out** læses fra `profiles.notification_email_prefs`.
- **Funktionen er Bucket B:** `authenticateServiceRole` bag
  `verify_jwt = true`.

**Tørkørsel som standard — vigtigst:** uden body sender funktionen
INTET; den finder kandidaterne og logger dem. Kun et eksplicit
`{ "dry_run": false }` slår afsendelse til. Det betyder at målgruppen
kan bevises på rigtige data uden at nogen får en mail, og at et
fejlkald aldrig sender noget. Samme mønster som
`nudge-report-no-reflection`.

**Advarsel — den fejl der ikke må gentages:** `intro-reminder-cron`
havde oprindeligt kun `Deno.cron` og ingen HTTP-overflade. `Deno.cron`
eksekveres ALDRIG på Supabases edge-runtime, så funktionen kørte
aldrig, og `intro_reminder_last_sent_at` er NULL for alle virksomheder.
Påmindelser SKAL have en HTTP-indgang og planlægges med pg_cron.

**Cron-slots** (kortlagt 1/9 i migration 20260901090000): 04:00
opgave-udløb · 05:00 agent-runs-opbevaring · 06:00
generate-weekly-focus (mandag) · 07:00 event-reminders · 08:00
send-pulse-reminder (d. 10) og send-monthly-digest (d. 22) · 09:00
daily-report-reminder + daily-reflection-nudge.

**ÅBENT:** hvilket slot betalingspåmindelserne skal have. 10:00 ser
ledigt ud, men det skal måles mod `cron.job` før det vælges.

**Overvej ren SQL-cron i stedet:** migration 20260901090000
argumenterer for at en simpel dagsregel hører til som ren SQL-cron frem
for en edge function — edge-vejen er fem fejlkilder (URL, vault-nøgle,
verify_jwt, deploy, og en ny funktion der ikke auto-deployer). Men
påmindelserne skal SENDE mails, ikke kun opdatere en status, så
edge-vejen er formentlig nødvendig her. Ikke afgjort.

---

# Tillæg — prisniveauet og hvordan det når linket (1/9)

## 12. Prisniveauet er en rådgiverbeslutning, ikke et medlemsvalg

Et nyt medlem kommer normalt ind til 50.000. Men I kan beslutte at nogen
kommer ind til 40.000 — det skete for Nordic By Hand 25/8, og prisen
`nyt_40000_*` blev oprettet 1/9 netop for at gøre det muligt fremover.

Medlemmet vælger IKKE prisniveauet. De vælger kun **betalingsmodellen**:

| Niveau (I beslutter) | Medlemmet vælger mellem |
|---|---|
| 50.000 | 50.000 · 25.000 × 2 · 4.375 × 12 |
| 40.000 | 40.000 · 20.000 × 2 · 3.500 × 12 |

## 13. Kilden er `Pris (kontrakt)` på Monday

Kolonnen bruges i dag som tilbudspris ved ansøgning (målt 1/9: udfyldt
med 50.000 for ansøgere, tom for medlemmer). Fremover er den **kilden
til prisniveauet**: det I har aftalt, og dermed det linket skal bygges
på.

Den er IKKE kilden til `companies.indgangspris_oere`. Aftalt og betalt
er ikke det samme — en kan skrive under og aldrig betale, og så må
feltet ikke stå udfyldt. Indgangsprisen skrives af webhooken ved
betaling, se rettelsen i `docs/fornyelseskaeden-1-september.md`.

## 14. Kæden fra underskrift til betaling

    Monday: status → "Godkendt"
        ↓
    monday-webhook henter fra item'et:
        CVR, adresse, branche, kontaktperson, mail
        Pris (kontrakt)  →  prisniveau (40.000 eller 50.000)
        ↓
    opretter virksomheden med prisniveauet gemt på rækken
    genererer et betalingstoken (uuid, udløber efter 30 dage)
        ↓
    sender dag 0-mailen med linket:
        app.theboardroom.dk/betal?token=<uuid>
        ↓
    siden slår tokenet op SERVERSIDE, finder virksomheden,
    læser prisniveauet, viser de tre betalingsmodeller for netop det
        ↓
    betaling → webhooken sætter kontraktdatoer, skriver
    indgangspris_oere fra den valgte pris, sender invitationen

## 15. Linket er ens for alle — prisen ligger på virksomheden

Der findes ikke et «40.000-link» og et «50.000-link». Der findes ét
link pr. virksomhed, og prisniveauet ligger på virksomheden.

**Det er ikke kun enklere, det er nødvendigt.** Lå niveauet i URL'en,
kunne et 40.000-link videresendes til en der skulle betale 50.000. Det
er præcis den fælde der blev lukket ved fornyelsen (§5), og reglen er
den samme: prisen må aldrig ligge i linket.

## 16. Kontrollen det giver

Sætter du 40.000 på Monday, får de et 40.000-tilbud. Er niveauet sat
forkert, betaler de ikke det forkerte beløb ved et uheld — de får bare
det forkerte tilbud, og det opdages FØR pengene skifter hænder.

Et nyt felt på `companies` skal bære niveauet. Navnet er ikke afgjort;
det må ikke hedde noget der forveksles med `indgangspris_oere`, som
først sættes ved betaling.

**ÅBENT:** hvad der sker hvis `Pris (kontrakt)` er tom ved «Godkendt».
Falder den tilbage på 50.000, eller skal webhooken afvise og gøre
opmærksom på det? At gætte på listeprisen er en pris på 10.000 kr.

# Indgangen — fra underskrift til aktivt medlem

**DESIGNDOKUMENT MED BOGFØRING.** Beslutningerne er truffet 1. september
2026; §1–25 er den besluttede form, tillæggene (§26–33) bogfører hvad der
er bygget og bevist. **Status 3/9 formiddag: kæden FØR platformen er
hel** — «Godkendt» på Monday → virksomhed + betalingsmail → påmindelser
dag 14 og 25 → dag 31-faktura → betaling → adgang. Det sidste led (dag
31-fakturaen, §30) er bygget i #559–#561, deployet, bevist i drift og
tændt: `invoice.paid` er tilmeldt endpointet, og cron-jobbet er
planlagt. Sammen med `docs/indgangen-overhaling.md` (ruten EFTER
invitationen, færdig 3/9) er begge halvdele dermed færdige. Samme regel
som de øvrige dokumenter: hver påstand er enten målt, eller mærket som
ikke målt/åben.

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

**✅ BYGGET, DEPLOYET OG BEVIST I DRIFT 3/9 formiddag (#559, #561; §30):**
cronen opretter og sender fakturaen via Stripe Invoicing FØR dag
31-mailen, og `invoice.paid` skriver samme kæde som en checkout-betaling.
Motoren er `_shared/betalingsfrist.ts` (tilstandene blev `betalt`,
`afventer_pris`, `klar_til_mail`, `afventer_betaling`,
`frist_overskredet` — §27), fladen `IndgangsSektion` på /members (§29).

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

**Rettet 2/9** — webhooken er skrevet om (se §26). Punkterne står som
bogføring af det der var. Målt samme dag: kolonne-id'et `e_mail` fandtes
ikke på noget board (mailkolonnen hedder `email`), så webhooken svarede
`no_contact_email` for hver ansøgning; navnet lå i to ulæste kolonner
(`short_text` Fornavn, `text_mm2wy52n` Efternavn); og «I gang» var
make.coms ekko efter en betaling på den gamle Stripe-konto.

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

**Mønsteret er i drift og kan kopieres — rettet 2/9.** En tidligere
version af dette afsnit påstod at `intro-reminder-cron` «kørte aldrig»
og at `intro_reminder_last_sent_at` er NULL for alle. Det var tilstanden
FØR 13/8, og teksten stammede fra funktionens eget filhoved. Målt 2/9:

- Funktionen fik `Deno.serve` + `authenticateServiceRole` i commit
  `c8199691` den 13/8 (`intro-reminder-cron/index.ts:243-246`).
  `supabase/config.toml:115-116` har `verify_jwt = true`.
- Der findes et pg_cron-job der kalder den LIVE: jobnavn
  **`intro-session-reminder`**, `'0 9 * * *'`, `net.http_post` mod
  `/functions/v1/intro-reminder-cron` med body `{"dry_run": false}` og
  vault-nøglen `email_queue_service_role_key`. Bogført tegn for tegn i
  migration `20260901112000_prod_cron_bogfoert.sql` (jobid 249 i prod).
- Jobbet hedder altså noget ANDET end funktionen det kalder. Det er
  grunden til at en tidligere recon konkluderede at det ikke fandtes:
  der blev søgt på funktionsnavnet i `cron.job`, og det gav nul rækker.

**Advarslen der stadig gælder:** `Deno.cron` eksekveres ALDRIG på
Supabases edge-runtime. En funktion med kun `Deno.cron` kører ikke.
Påmindelser SKAL have en HTTP-indgang og planlægges med pg_cron — og
`intro-reminder-cron` er nu netop det forlæg.

**Fejlklasse, så den ikke gentages:** (1) et filhoved beskriver
tilstanden da det blev skrevet, ikke tilstanden nu — funktionens header
siger stadig «havde kun Deno.cron … havde aldrig kørt», og det blev
skrevet af som facit uden at kigge i `cron.job`. (2) Et cron-job kan
hedde noget andet end funktionen det kalder — søg på URL'en i
`cron.job.command`, ikke kun på jobnavnet.

**IKKE MÅLT:** om `intro_reminder_last_sent_at` stadig er NULL for alle
virksomheder i dag, og om funktionen faktisk har sendt en mail siden
13/8. Det kræver et opslag i prod, ikke i repoet.

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

**Hvor niveauet bor — besluttet 2/9:** IKKE på `companies`. En
tidligere version af dette afsnit sagde «et nyt felt på companies skal
bære niveauet»; det er trukket tilbage. Niveauet, tokenet og
påmindelsestilstanden ligger i en ny tabel
`public.company_betalingslink` med `company_id` som primærnøgle,
advisor- og service-role-adgang, og ingen adgang for medlemmer.

Begrundelsen er den samme som for `company_fornyelse` (migration
`20260811120000_fornyelsesbeslutning.sql`, linje 5-8): RLS i Postgres
er rækkeniveau, ikke kolonneniveau. Målt 2/9 har `companies`
politikken «Members can view own company» med `id =
user_company_id(auth.uid())` (migration 20260224222456:43-45) — et
medlem kan læse HELE sin egen række. Tokenet er en bæreradgang: den
der har det, kan åbne betalingen. Det må ikke ligge et sted et medlem
kan læse.

Felterne:

| felt | type | betydning |
|---|---|---|
| `company_id` | uuid, PK, FK → `companies` | én række pr. virksomhed |
| `prisniveau_oere` | integer, nullable | 4000000 eller 5000000; NULL = «afventer pris» (§17) |
| `underskrevet_at` | timestamptz | «Godkendt» på Monday |
| `token` | uuid, `default gen_random_uuid()` | bæreradgangen i linket |
| `betalingsmail_sendt_at` | timestamptz | dag 0; NULL = ikke sendt endnu (§19, idempotens) |
| `sidste_paamindelse_dag` | integer | 14, 25 eller 31 — seneste sendte trin i §9's rytme |

**Ikke et felt: `token_udloeber`.** Udløbet ER `underskrevet_at + 30
dage` — **RETTET 2/9:** fristen er kontraktens og løber fra underskriften,
ikke fra betalingsmailen (se §19). To
kilder til samme dato ville kunne drive fra hinanden — en rådgiver der
sætter prisen sent, eller en gensendt mail, ville give ét felt der
siger én ting og et andet der siger noget andet. Udløbet beregnes, det
gemmes ikke.

Navnet `prisniveau_oere` er valgt så det ikke forveksles med
`companies.indgangspris_oere`, som først sættes ved betaling (§13).

**ÅBENT:** hvad der sker hvis `Pris (kontrakt)` er tom ved «Godkendt».
Falder den tilbage på 50.000, eller skal webhooken afvise og gøre
opmærksom på det? At gætte på listeprisen er en pris på 10.000 kr.

---

# Tillæg — når prisniveauet mangler (besluttet 1/9)

## 17. Virksomheden oprettes alligevel

Er `Pris (kontrakt)` tom ved «Godkendt», oprettes virksomheden med alle
øvrige data, men UDEN prisniveau. Der sendes INGEN betalingsmail.

Alternativet — at afvise og ikke oprette — blev fravalgt, fordi det
modsiger §2: virksomheden oprettes ved underskrift netop for at «har
skrevet under, mangler noget» bliver en synlig tilstand frem for et
tomrum. En afvist godkendelse ville efterlade præcis det tomrum der
kostede jer fem medlemmer.

Virksomheden står derfor som **afventer pris** på rådgiverfladen.

## 18. Besked pr. MAIL, ikke Slack

Besluttet 1/9: beskeden skal komme som mail til rådgiverne. Begrundelsen
er Jonas' egen — en mail bliver set med sikkerhed, en Slack-besked kan
drukne. Det er en besked hvor konsekvensen af at overse den er, at et
nyt medlem sidder og venter på noget der aldrig kommer.

Mailen skal indeholde: virksomhedens navn, CVR, kontaktperson, hvornår
den blev godkendt, og et direkte link til virksomheden i platformen.

## 19. TO udløsere for betalingsmailen

Dette er det led der ellers ville blive glemt, og som ville låse en
virksomhed for evigt.

Betalingsmailen (dag 0) udløses af to forskellige begivenheder:

1. **«Godkendt» på Monday MED pris** — normalvejen. Virksomheden
   oprettes med prisniveau, og mailen sendes med det samme.
2. **Prisniveauet sættes MANUELT på en virksomhed der mangler det** —
   undtagelsesvejen. Mailen sendes i det øjeblik prisen gemmes.

Uden nummer 2 ville en virksomhed uden pris aldrig få sin mail: den
udløsende begivenhed («Godkendt») er allerede sket og kommer ikke igen.

**Idempotens:** mailen må sendes ÉN gang. Er den allerede sendt, må en
senere ændring af prisniveauet ikke udløse den igen. Et tidsstempel på
virksomheden bærer det — samme mønster som
`intro_reminder_last_sent_at`.

**30-dagesfristen løber fra UNDERSKRIFTEN — RETTET 2/9.** Den oprindelige
beslutning 1/9 («fra betalingsmailen, så en virksomhed der ventede fire
dage på sin pris ikke får fire dage mindre») var forkert:
aftalegrundlaget giver 30 dage fra underskrift, og det er kontraktens
frist, ikke vores at give. Konsekvensen er tilsigtet: sættes prisen fire
dage efter godkendelsen, har medlemmet 26 dage tilbage. Påmindelserne
14/25/31 følger samme ur (migration 20260902140000).

## 20. Rådgiverfladen

Virksomheder uden prisniveau skal kunne ses samlet — samme mønster som
fornyelsesbeslutningerne i `FornyelsesSektion`: kun dem der kræver
handling, med feltet der mangler og en måde at sætte det på.

## 21. To mails til medlemmet — aldrig samtidig

Betalingsmailen og invitationen er to forskellige mails i to forskellige
øjeblikke. De må ALDRIG sendes sammen.

| Handling | Systemet gør | Medlemmet får |
|---|---|---|
| «Godkendt» på Monday | Opretter virksomheden | — |
| — med pris | + sender betalingsmailen | Link til betaling |
| — uden pris | + sender mail til RÅDGIVEREN | Intet |
| Rådgiver sætter prisen | Sender betalingsmailen | Link til betaling |
| Medlemmet betaler | Sætter kontraktdatoer, sender invitationen | Login |

**Hvorfor invitationen ikke må følge prissætningen:** en virksomhed uden
kontraktdatoer giver `computeMembershipTier` værdien «no_date», som
`useAuth` oversætter til «full» (§3). Kunne de logge ind før betalingen,
ville de have FULD adgang uden at have betalt. Invitationen er
adgangens nøgle og hører derfor kun til efter betalingen.

---

# Tillæg — det sidste led er bygget (2/9)

## 22. Kæden er bygget og bevist i produktion 2/9

Syv led, alle live: `company_betalingslink` (migration 20260902080000),
`hent_betalingstilbud` (20260902090000), `/betal`
(`src/pages/Betal.tsx`), motorerne `src/lib/betalingsfrist.ts` og
`src/lib/indgangspris.ts` (spejlet til Deno med paritetstest),
`opret-indgangs-checkout` med `verifyBetalingstoken`, og indgangsgrenen
i `stripe-webhook` inkl. invitationen.

**MÅLT 2/9:** bevist med en gennemført betaling på 4.375,00 kr.
(3.500 + 875 moms) på testvirksomheden «Jonas legat», prisniveau 40.000,
tolv rater. Refunderet og rullet rent tilbage bagefter.

Målt serverside efter betalingen:

| | målt |
|---|---|
| `company_perioder` | 2026-09-02 → 2027-09-02, 42.000 kr., rate12, indgang |
| `contract_start_date` / `contract_end_date` | samme datoer — fra BETALINGSDAGEN |
| `indgangspris_oere` | 40.000 kr. |
| `subscription_status` | NULL |
| `stripe_customer_id` | `cus_VBWu40YVMihBgO` |
| `cancel_at` på abonnementet | 364 dage efter `start_date`, sat 30 sekunder efter oprettelsen |
| invitation | pending, til `companies.contact_email`, med afsender-id'et |

**42.000 i perioden, 40.000 som indgangspris.** Det er skelnen fra
rettelsen 1/9: perioden bærer det FAKTISK betalte inkl. 5 %-tillægget,
indgangsprisen er LISTEPRISEN. Fornyer de om et år, bliver det 20.000 —
halvdelen af 40.000, ikke af 42.000. Bevist i drift, ikke kun i kode.

**`subscription_status` forblev NULL.** Alle tre subscription-lifecycle-
grene i `stripe-webhook` springer nu over ved `art === "indgang"` såvel
som `"fornyelse"`. Uden det ville virksomheden fremstå som tier
«subscriber» — exit-abonnenten, der IKKE har rådgivning, IKKE community
og IKKE er en del af netværket — i stedet for fuldt medlem. Adgangen
bæres af `contract_end_date`, ikke af `subscription_status`.

## 23. Et nyt auth-mønster: token som legitimation

`opret-indgangs-checkout` kan ikke bruge noget af husets eksisterende
auth. **MÅLT 2/9:** `authenticateUser` kræver `claims.sub`, og
anon-nøglen har ingen — ingen Bucket A-funktion kan tage imod en
sessionsløs kalder. Og funktionen SKAL bruge service role, fordi
`company_betalingslink` kun har advisor- og service_role-policies
(20260902080000:53-61).

Løsningen er et ellevte prædikat i `scripts/check-edge-function-auth.ts`:

    { name: "verifyBetalingstoken()", pattern: /\bverifyBetalingstoken\s*\(/ }

Fire af de ti eksisterende prædikater er signaturverifikationer
(`verifyStripeSignature`, `verifyMondayJwt`, `verifyWebhookRequest`,
`verifyCalendlySignature`). Vores er samme klasse: legitimationen ligger
i KALDET, ikke i en session. Det er at udvide husets mønster frem for
at gå uden om værnet — og CI bekræftede det (Edge Function Auth
Guardrail grøn, PR #514).

`_shared/betalingstokenAuth.ts` kalder
`public.hent_betalingsdata_til_checkout(uuid)`: SECURITY DEFINER,
EXECUTE kun til `service_role`, svarer KUN når betaling er tilladt.
Dommen ligger i SQL; hjælperen har ingen egen logik. Et ugyldigt
uuid-format (Postgres 22P02) behandles som «ikke tilladt», ikke som
serverfejl.

`config.toml`: `verify_jwt = FALSE`, bevidst. Med `true` ville
gatewayen afvise kaldet før koden kører.

**ÅBENT, ikke undersøgt:** om Supabase har hastighedsbegrænsning på
edge-funktioner. Tokenet er 122 bits og kan ikke gættes, men hvert
forsøg koster et databasekald.

## 24. `invited_by` er ikke en afsender — besluttet 2/9

`company_invitations.invited_by` er `uuid NOT NULL` uden FK. **MÅLT:**
den læses ét eneste sted — `send-invitation-email` bruger den til at
afgøre om en IKKE-service-role-kalder må gensende en invitation. Vores
kald er service-role og springer den gren over. Ingen RLS-policy, ingen
visning, ingen tildeling rører feltet. Mailens afsendernavn kommer fra
`email_templates.sender_name`.

Jonas og Morten er begge rådgivere for ALLE virksomheder; der er ingen
tildeling at foretage, og «rådgiver påsat en virksomhed» bruges ikke.

Værdien kommer derfor fra secret'en `INVITATION_AFSENDER_USER_ID`
(Mortens bruger-id — står i Supabases secrets, ikke i koden), så den kan
ændres uden kodeændring — og så leddet senere kan bære «hvem godkendte
på Monday» ét sted. Mangler secret'en, sendes ingen invitation: der
logges, og grenen fortsætter.

## 25. Alt efter kontraktopdateringen må fejle uden at vælte grenen

Invitationen står EFTER at kontrakten er sat og pengene modtaget. Fejler
den — manglende secret, tom `contact_email`, mailfejl — logges det med
`company_id`, og grenen fortsætter til sit normale 200-svar.

Et kast ville få Stripe til at gensende et forløb der allerede er
gennemført. En manglende invitation er noget en rådgiver kan rette; en
tabt betaling er det ikke.

Idempotens på to niveauer: perioden på `stripe_reference = session.id`,
invitationen på en eksisterende pending invitation for virksomheden.

## 26. Det der mangler

- **Monday-grenen ved «Godkendt»**: bygget 2/9. `monday-webhook` gater
  på «Godkendt» (alt andet, også «Medlem»/«I gang», logges og ignoreres),
  læser de 18 kolonner (`_shared/mondayAnsoegning.ts`), opretter
  virksomheden via `opretEllerGenbrugVirksomhed`, sætter
  `contact_person` + adresse (datahullet for virksomheder fra før 2/9:
  §32), parser «Pris (kontrakt)» til øre, opretter
  `company_betalingslink` (PK-konflikt = gentaget «Godkendt», springes
  over) og udløser dag 0 i samme proces via
  `_shared/indgangsBetalingsmail.ts`. Den gamle invitationsvej er fjernet.
  **Ikke verificeret i prod endnu:** den rå `value`-form for email-,
  telefon- og link-kolonner (læseren falder tilbage på `text`), og at
  Mondays event bærer `boardId` (uden det springes board-tjekket over).
- **De fire mails** (dag 0, 14, 25, 31): bygget 2/9. Dag 0 og
  rådgivermailen sendes af `send-indgangs-betalingsmail`; dag 14/25/31
  af `indgangs-paamindelser-cron` (tørkørsel som standard). Begge går
  gennem `_shared/indgangsMailAfsendelse.ts` → `transactional_emails`.
  Udløser 2 (§19, prisen sættes manuelt): `saet-indgangs-prisniveau`
  (Bucket A, advisor-gate) skriver prisen med null-guard og udløser dag 0
  i samme kald; prisen ændres ikke når den først er sat (409).
  **✅ Cron-jobbet PLANLAGT 3/9 formiddag:** `indgangs-paamindelser`,
  `0 10 * * *`, aktiv — verificeret i `cron.job`. Det var det sidste
  manglende led. Secret'en `RAADGIVER_MAIL_TIL` (rådgivermailen ved
  manglende pris) er ikke bekræftet sat i denne bogføring.
- **✅ LØST 3/9 (#559, #561) — Fakturaen på dag 31 via Stripe Invoicing**
  (§4, §30): bygget, deployet, bevist i drift og tændt. Cronen kalder
  `sendIndgangsFaktura` FØR dag 31-mailen; fejler fakturaen, sendes
  mailen ikke, og virksomheden står i svarets `faktura_i_haanden` med
  grund. `invoice.paid` er tilmeldt og håndteret. Detaljer i §30.
- **Merchant Logo på kortudtoget**: **MÅLT 2/9** viser bankappen «THE
  BOARDROOM» uden ikon. Det er et Merchant Logo hos kortnetværkene, ikke
  det logo der er uploadet i Stripes branding. **IKKE UNDERSØGT:** om det
  er selvbetjent på denne kontotype eller kræver ansøgning.

---

# Tillæg — rettelser og de sidste led (2/9, aften)

## 27. RETTELSE 2/9 — fristen er kontraktens

**Hvad der var forkert:** §19 og den oprindelige kode regnede
30-dagesfristen fra BETALINGSMAILEN. Begrundelsen der blev skrevet ned
1/9 var: «ventede nogen fire dage på at få prisen sat, må de ikke miste
fire dage af fristen».

**Hvorfor det var forkert:** fristen er ikke vores at give. Den står i
aftalegrundlaget — 30 dage fra underskrift. Jonas havde sagt det flere
gange; begrundelsen ovenfor behandlede kontraktens frist som en
kulance.

**Rettet:** alle dage regnes nu fra `company_betalingslink.underskrevet_at`.
`betalingsmail_sendt_at` bruges stadig til at skelne `klar_til_mail` fra
`afventer_betaling` — men ikke til at regne dage.

Konsekvensen er tilsigtet: sættes prisen fire dage efter godkendelsen,
har medlemmet 26 dage tilbage. Og påmindelserne 14/25/31 regnes også fra
underskriften, så en sent sat pris ikke skubber hele rytmen og lader
dag 31-fakturaen komme efter fristen er passeret.

**Fjorten filer rørt** (jeg kendte fire; Claude Code fandt resten):
motoren og dens spejl, begge testfiler, de tre SQL-funktioner (migration
20260902140000), mailmodulerne, cronen, `IndgangsSektion` og
`Betal.tsx`.

**Bevist i produktion 2/9:** en linkrække med underskrift 26 dage
tilbage og betalingsmail sendt samme dag gav `frist: 2026-09-06,
dage_tilbage: 4`. Havde koden regnet fra mailen, ville svaret have været
30.

**Og rådgivermailen siger nu hvor travlt det har.** Fire tilstande:
over 7 dage («der er N dage tilbage»), 7 eller færre (samme plus «Det
haster», og emnelinjen bliver «HASTER: …»), nul («i dag er SIDSTE dag»),
og negativ («fristen er allerede passeret for N dage siden. Sættes
prisen nu, får medlemmet en betalingsmail med en frist der er
overskredet»). Emnelinjen skifter, så det kan ses i indbakken uden at
åbne mailen.

## 28. Udløser 2 er bygget og bevist 2/9

`saet-indgangs-prisniveau` (Bucket A, advisor-gate): skriver prisen med
en null-guard og udløser dag 0-mailen i SAMME kald.

**Hvorfor ét kald og ikke to skridt:** `company_betalingslink` har samme
politik-form som `company_fornyelse`, så fladen KAN skrive prisen
direkte. Men `send-indgangs-betalingsmail` er Bucket B og kan ikke
kaldes fra browseren. Skrev fladen prisen selv, ville der findes en
tilstand hvor prisen er sat og mailen aldrig gik — og rådgivermailen
lover udtrykkeligt at den sendes.

**Prisen ændres ikke når den først er sat** (409). Er mailen sendt, har
medlemmet fået et beløb at forholde sig til, og linket læser prisen live
— en ændring bagefter ville gøre linket til en anden aftale end den de
læste. Skal den rettes, er det en samtale, ikke et klik.

**Fejler mailen, rulles prisen IKKE tilbage.** Fladen viser en advarsel,
ikke en fejl. At fjerne prisen igen ville sætte virksomheden tilbage i
`afventer_pris` og udløse en NY rådgivermail — en løkke frem for en fejl
der kan ses.

## 29. IndgangsSektion på /members

Viser ALLE i indgangen, ikke kun problemerne: `afventer_pris`,
`frist_overskredet`, `afventer_betaling`, `klar_til_mail`. «Betalt»
vises ikke — de er medlemmer og står i listen nedenfor.

Sorteret så det der kræver noget står øverst. Vises kun når der er
mindst én. Bygget i /members' GAMLE design (AppLayout, glass-card,
shadcn), ikke Hjemmebane — rådgiverfladens konvertering er sit eget
spor.

Bevist i produktion 2/9: en linkrække uden pris viste «Mangler pris»,
et klik på «40.000 kr.» satte prisen, sendte dag 0-mailen til den
rigtige adresse med det rigtige fornavn, og rækken skiftede til
«Afventer betaling» med frist og dage tilbage.

## 30. Dag 31-fakturaen — LØST 3/9: bygget, deployet, bevist i drift og tændt

### ✅ Løsningen (3/9 formiddag, #559 → #560 → #561)

Målingen nedenfor fra 2/9 står som historik; den viste at grenen ikke
kunne bygges før fakturaen bar `company_id`. Derfor opretter vi den selv:

- **#559 — motoren** `_shared/indgangsFaktura.ts` (ren parameterdel i
  `indgangsFakturaParametre.ts`, testet). Rå fetch mod
  `POST /v1/customers` (kun når virksomheden ingen `stripe_customer_id`
  har; `metadata[company_id]` på kunden), `POST /v1/invoices`
  (`collection_method=send_invoice`, `days_until_due=4`, `auto_advance=false`,
  `automatic_tax[enabled]=true`, `metadata[company_id]`,
  `metadata[art]=indgang` PÅ SELVE FAKTURAEN), `POST /v1/invoiceitems`
  (frit beløb fra `prisniveau_oere`, `tax_behavior=exclusive` — IKKE en
  pris på lookup_key, for nøglerne dækker kun 50.000 og 40.000),
  `/finalize`, `/send`. Idempotens i tre lag: stemplet
  `company_betalingslink.faktura_invoice_id` + `faktura_sendt_at`
  (migration `20260903130000`, **kørt i prod 3/9, begge kolonner
  verificeret**), opslag hos Stripe på kundens fakturaer (List-API,
  konsistent), og Idempotency-Key pr. POST. Kaster aldrig.
- **#560 — adressen** (§33): uden den kunne Stripe Tax ikke placere
  kunden, og fakturaen gik uden moms.
- **#561 — kæden**: cronen kalder fakturaen FØR dag 31-mailen (mailens
  datid «har vi sendt dig en faktura» er så sand); fejler fakturaen,
  sendes mailen ikke og intet stemples. `invoice.paid`-gren i
  `stripe-webhook` FØR checkout-tjekket, kun på fakturaer med
  `metadata.art=indgang` + `metadata.company_id` på selve fakturaen
  (abonnementernes månedsfakturaer har tom metadata og ack'es som før).
  Samme kæde som checkout, via udtrukne hjælpere: `company_perioder`
  (`betalingsmodel='faktura'`, `stripe_reference=invoice-id`,
  `beloeb_oere = total_excluding_tax` — UDEN moms, som checkoutens
  `samlet_oere`; regnestykket står i `_shared/indgangsFakturaBetaling.ts`),
  `companies` (kontraktdatoer fra betalingsdagen, `indgangspris_oere`,
  `stripe_customer_id`), `nulstilIndgangsSession`, `sikrIndgangsInvitation`.
  Kaster aldrig; svarer 500 kun på et ufuldført forløb, så Stripe
  gensender ind i en idempotent kæde.
- **Endpointet** `we_1UAtaW3CvBmCx5PtL736lAJN` har siden 3/9 FEM events,
  sendt i samme kald fordi `enabled_events` erstatter listen:
  `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.deleted`, `customer.subscription.updated`,
  `invoice.paid`. Verificeret med uafhængig GET bagefter.
  **`invoice.created` er BEVIDST ikke tilmeldt:** Stripe udsætter
  finaliseringen af fakturaer i op til 72 timer, hvis webhooken ikke
  svarer på det event — og det gælder ALLE kontoens fakturaer, ikke kun
  vores.
- **Cron-jobbet** `indgangs-paamindelser` (`0 10 * * *`) planlagt og
  aktivt 3/9 — det sidste manglende led.

**Bevist i drift 3/9 kl. 10:00–10:11 på FLOOR1 (fremkaldt tilstand;
`docs/indgangen-overhaling.md` §11).** Opstilling: adresse sat
(Vestergade 41, 1. tv, 8600 Silkeborg), kontraktdatoerne nulstillet, en
`company_betalingslink`-række med prisniveau 5.000.000 øre,
`underskrevet_at` og `betalingsmail_sendt_at` 31 dage tilbage,
`sidste_paamindelse_dag` null.

1. **Tørkørsel** (body `{}`): 200, `fundet 1`, `ville_sende 1`,
   `pr_trin {14:0, 25:0, 31:1}` — springet virker (den seneste
   forfaldne, ikke dag 14 først); `faktura.sendt 0`,
   `faktura.ville_sende 1` — tørkørslen opretter ingen faktura. Kaldet
   gik gennem `net.http_post` med vault-nøglen
   `email_queue_service_role_key`, samme vej som cron-jobbet.
2. **Rigtig kørsel** (`dry_run: false`): faktura TBR-0003 /
   `in_1UBVaB3CvBmCx5PtAQOPtqVN` oprettet, finaliseret og sendt. 50.000 kr
   + 25 % moms = 62.500 kr, forfald 7/9. **Momsen BLEV beregnet** —
   beviser at adressen kom med. Stripe-kunden `cus_VBtMOGBenIfWt4`
   oprettet og skrevet tilbage til `companies.stripe_customer_id`.
   Linkrækken stemplet: `faktura_invoice_id`, `faktura_sendt_at 08:01:16`,
   `sidste_paamindelse_dag 31`. Dag 31-mailen sendt EFTER fakturaen
   (`email_send_log`: pending → sent).
3. **Betalingen**: fakturaen markeret betalt uden for Stripe
   (bankoverførsel — den rigtige arbejdsgang for en dansk B2B-faktura).
   `invoice.paid` udløst, webhooken skrev kæden: `company_perioder` med
   `betalingsmodel 'faktura'`, `art 'indgang'`, `beloeb_oere 5.000.000`
   (uden moms, som en kortbetaling), periode 2026-09-03 → 2027-09-03,
   `stripe_reference` = invoice-id; `companies` fik `contract_start_date`,
   `contract_end_date` og `indgangspris_oere`.
4. **Ryddet op**: kreditnota TBR-0003-CN-01 på hele 62.500 kr, «Credit
   outside of Stripe» — ikke kundesaldo, som ville have efterladt et
   tilgodehavende på FLOOR1. Regnskabet er rent.

**Fund fra beviset (bogført, ikke rettet):**

- **`sikrIndgangsInvitation` kender ikke tilstanden «invitationen er
  allerede ACCEPTERET».** Den leder efter pending; findes der en
  accepteret række, fejler insert på `UNIQUE(company_id, email)`, og
  invitationen sendes ikke. Set 3/9 på FLOOR1 (test-brugerne havde
  allerede accepteret). I drift kan det ikke ske for indgangen — en
  virksomhed der betaler dag 31-fakturaen, er aldrig kommet ind — men
  tilstanden er ikke håndteret. Åbent.
- **Dag 31-mailen siger 50.000 kr, fakturaen lyder på 62.500 kr** —
  listepris mod beløb inkl. moms. Forsvarligt for en B2B-modtager, der
  kender aftalens tal, men de to tal er ikke ens. Ikke ændret.
- **Mailen skrev «Hej,» uden navn**, fordi `contact_person` er tom på
  FLOOR1 — datahullet fra 2/9 (§32), ikke en kodefejl.

**Besluttet 3/9 (Jonas) — Stripes egne automatiske fakturapåmindelser
slås IKKE til.** Motoren sætter `auto_advance=false` med vilje. Fakturaen
har fire dages frist, og medlemmet har allerede fået tre mails i vores
egen tone; en fjerde stemme på engelsk fra en anden afsender ville
skurre. Skal der rykkes, hører det hjemme i vores egen kæde. Åbent
punkt, ikke bygget.

**LØST — det åbne punkt om `'faktura'`** nederst: værdien er nu begrundet
og skrives af `invoice.paid`-grenen (#561). `Betalingsmodel`-typen for
Checkout kender stadig kun fuld/rate2/rate12 — det er checkoutens
modeller, og fakturaen går ikke gennem den.

### Målingen 2/9 — historik

Dag 31-mailen siger «vi har sendt dig en faktura». Rådgiveren opretter
den i Stripe i hånden. Betaler medlemmet den, sker der INTET: kontrakt,
company_perioder, indgangspris_oere og invitationen skal alle sættes
manuelt.

**MÅLT 2/9, og det er værre end en manglende gren:** en gren på
`invoice.paid` ville modtage en betaling den ikke kan placere.

En dag 31-faktura oprettes for en virksomhed der aldrig har betalt — og
derfor ingen `stripe_customer_id` har (feltet skrives af webhooken ved
checkout.session.completed). Kunden rådgiveren opretter i dashboardet er
ny og ukendt for databasen. De seks mulige spor på invoice-objektet er
alle blinde:

| spor | hvorfor det ikke virker |
|---|---|
| `invoice.metadata.company_id` | tom; intet sætter den i dag |
| `invoice.customer` | virksomheden har ingen `stripe_customer_id` |
| `invoice.customer_email` | `companies.contact_email` er ikke unik (ingen constraint målt) |
| `invoice.number` | ingen kolonne gemmer den før betaling |
| `lines[].price` | siger hvad der er købt, ikke hvem |
| `parent.subscription_details.metadata` | en manuel faktura har `parent: null` |

**Konsekvensen:** grenen skal ikke bygges før fakturaen bærer
`company_id`. Og det kan den kun, hvis vi opretter den selv.

**Vejen, målt i Stripes dokumentation og API-detaljerne:**
1. `POST /v1/customers` (email, name, `metadata[company_id]`)
2. `POST /v1/invoices` (`customer`, `collection_method=send_invoice`,
   `days_until_due`, `metadata[company_id]`, `metadata[art]=indgang_faktura`)
3. `POST /v1/invoiceitems` (`customer`, `invoice`, og enten `price` via
   lookup_key eller `amount`+`description`)
4. `POST /v1/invoices/{id}/send` — finaliserer og mailer
Alle fire er almindelige v1-POST'er, samme form som
opret-indgangs-checkout bruger.

**Og eventet er ikke tilmeldt.** Endpointet we_1UAtaW3CvBmCx5PtL736lAJN
har fire events: checkout.session.completed og
customer.subscription.created/updated/deleted. Ingen `invoice.*`.
`POST /v1/webhook_endpoints/{id}` med `enabled_events[]` ERSTATTER hele
listen — kaldet skal sende de fire eksisterende plus de nye. Signing
secret ændres ikke.

**Hvilket event:** `invoice.paid` sendes både ved en Stripe-betaling OG
ved `paid_out_of_band` (registreret i hånden). `invoice.payment_succeeded`
kun ved en faktisk Stripe-betaling. Stripe anbefaler `invoice.paid`.

**IKKE UNDERSØGT:** om dashboardets fakturaeditor har et metadata-felt,
og om kontoen har en Billing-plan slået til for Invoicing (de to
eksisterende fakturaer er abonnementsfakturaer, som ikke kræver den).

**ÅBENT:** `company_perioder.betalingsmodel` tillader 'faktura'
(migration 20260901140000), men værdien er aldrig begrundet i repoet, og
ingen kode skriver den. `Betalingsmodel`-typen i TypeScript kender kun
fuld/rate2/rate12. En 'faktura'-række kan i dag kun opstå ved manuel
indsættelse.

## 31. Månedstrækkene registreres ikke — gælder også fornyelsen

**MÅLT 2/9:** de tre subscription-grene i stripe-webhook springer over
ved `art === "indgang"` og `"fornyelse"`. Det er rigtigt og bevidst —
uden det ville `subscription_status` blive skrevet, og virksomheden ville
fremstå som exit-abonnent (tier «subscriber», uden rådgivning og uden
netværk) i stedet for fuldt medlem.

Men konsekvensen er utilsigtet: **der findes ingen registrering i
databasen af at rate 2 til 12 faktisk blev betalt.** Én række i
company_perioder ved første betaling, og derefter intet. Og et FEJLET
månedstræk (`invoice.payment_failed`, abonnement `past_due`) når heller
ikke ind. *Note 3/9:* `invoice.paid` ER nu tilmeldt (§30), men grenen
handler kun på fakturaer med `metadata.art=indgang` på selve fakturaen;
abonnementernes månedsfakturaer har tom metadata og ack'es uden
handling. `invoice.payment_failed` er stadig ikke tilmeldt. Afsnittet
står derfor uændret i substans.

Adgangen hviler alene på `contract_end_date`, sat på betalingsdagen.
Holder et medlem op med at betale i måned fire, beholder de adgangen
året ud, og intet i platformen viser det. Det opdages kun i Stripe.

Det gælder ikke kun indgangen: **fornyelsen har samme forhold**, og den
kører nu. YKRG's fejlende kort blev opdaget 1/9 fordi nogen målte i
Stripe, ikke fordi noget sagde til (bogført i mangellisten som «Ingen ved
at et kort fejler»).

**Restancepolitikken er besluttet** (past_due = åben adgang, unpaid =
lukket) og ikke bygget. Den kræver at `computeMembershipTier` ændres
fire steder samlet.

---

# Tillæg — `contact_person` (2. september 2026, aften)

## 32. `contact_person` — datahullet, de tre rettede og skævheden

Feltet bærer fornavnet i dag 0-mailen og påmindelserne
(`_shared/indgangsBetalingsmail.ts:190`, `indgangs-paamindelser-cron:245`
via `fornavnAf`) og navnet på signup-skærmen (`lookup_invite_company_info`
→ `kontakt`, `docs/indgangsfladen-design.md` §9–10).

**Målt kl. 20:10:** tom streng på 35 af 39 virksomheder, NULL på 1,
udfyldt på 3. Årsag, målt i repoet: feltet skrives ÉT sted —
`monday-webhook/index.ts:320` via `bygKontaktnavn(fornavn, efternavn)` —
og kun i «Godkendt»-grenen fra 2/9 (§26). `import-application` skriver
det aldrig; den lægger navnet i `application_context.contact_name`
(`src/lib/virksomhedsRaekke.ts:150`). Kolonnen har `DEFAULT ''`
(migration `20260225104718`), så alt der er oprettet uden om webhooken
står med tom streng, ikke NULL.

**Rettet kl. 20:28.** Kilde: Monday board 1899777797, kolonne
`short_text` (Fornavn) + `text_mm2wy52n` (Efternavn), sammensat som
`bygKontaktnavn` — samme værdi webhooken ville have skrevet.

| virksomhed | company_id | før → efter |
|---|---|---|
| Two Socks ApS | `1c54625a-4a34-4d66-a8a6-4242a96b3d1d` | `''` → `'Simon Frimann'` |
| WESDEX ApS | `6ab77507-d3f3-4980-a699-6d23d1148fe4` | `''` → `'Jonas Wesley Kinana'` |
| Din økonomiafdeling | `25a801c3-062b-4c97-ba2b-8319a66ec0a9` | `''` → `'Nicolai Marc Haagen olesen'` |

Guard: `and contact_person = ''`. Optælling efter: 6 udfyldte (fra 3),
32 tomme (fra 35). Navnene blev IKKE rettet ortografisk («olesen» med
lille o står som i Monday), fordi webhooken ville skrive det samme;
rettelse hører hjemme i kilden, ikke i vores UPDATE.

Værnet om invitationslinkene under skrivningen (tokens før/efter, ingen
triggers på `companies` i prod) er bogført i
`docs/indgangsfladen-design.md` §11.

**Åbent — skævheden vi efterlod:**

- `application_context.contact_name` er stadig NULL på de tre.
  Webhooken skriver begge felter; de tre rækker har nu kun det ene.
- Alle tre Monday-items står med status «I gang», ikke «Godkendt» — den
  nye webhook-gren (§26) når dem aldrig af sig selv. Skulle de sættes
  til «Godkendt» i dag, ville `opretEllerGenbrugVirksomhed` genbruge
  virksomheden på CVR og B5 skrive det samme navn igen (kun ikke-tomme
  felter, over eksisterende).
- De resterende 32 tomme er ikke rettet. Hvilke af dem der har et navn
  på Monday, er ikke målt.

---

# Tillæg — adressen fra CVR (3. september 2026, formiddag)

## 33. Adressen — to lag var i stykker, rettet i #560

**Hvorfor det haster:** uden `address`, `postal_code` og `city` kan
Stripe Tax ikke placere kunden, og dag 31-fakturaen (§30) finaliseres
uden moms — Stripe slår Tax fra med `disabled_reason` frem for at fejle.

**Målt i prod 3/9:** kun 1 af 32 aktive virksomheder havde alle tre
felter. FLOOR1 I/S, oprettet 2/9 via «Importér ansøgning» MED
CVR-opslag, havde ingen af dem.

**Afdækket i koden (#560), to lag:**
1. Rækkebyggeren `byggVirksomhedsRaekke` bar ikke felterne, og
   `VirksomhedsInput` havde ingen adressefelter. `import-application`s
   payload havde `address/zip/city` i typen uden at bruge dem.
   `monday-webhook` satte adressen — men KUN fra Mondays egne kolonner,
   i en separat opdatering efter oprettelsen, aldrig fra CVR.
2. `hentCvrData` plukkede kun fire felter ud af cvrapi-svaret (name,
   startdate, industrycode, industrydesc), og det er DET subset der
   gemmes som `application_context.raw_cvr_data` — ikke hele svaret.
   Adressen nåede derfor aldrig databasen ad nogen vej.

**cvrapi.dk-feltnavnene er MÅLT live 3/9** (read-only opslag på CVR
41772239 med husets User-Agent), ikke husket: `address`
(«Vestergade 41, 1. tv.»), `zipcode` («8600»), `city` («Silkeborg»);
desuden `addressco` og `cityname`, som ikke bruges. De stod hverken i
koden, git-historikken, docs eller reconfilerne.

**Rettelsen:** `hentCvrData` læser de tre felter; rækkebyggeren (begge
kopier, paritetstestet) bærer `address/postal_code/city` med samme
forrang som branchen — input vinder felt for felt, CVR er fallback,
tomme og blanke strenge bliver null. `monday-webhook` og
`import-application` sender deres adressefelter ind som input. Kun ved
oprettelse: ved genbrug på CVR kaldes rækkebyggeren ikke. Deployet 3/9;
bevist indirekte ved §30's faktura, hvor momsen blev beregnet efter at
FLOOR1 fik adressen sat.

**Åbent:** de 31 eksisterende virksomheder uden adresse er en
datarettelse (samme formular som branche- og kontakt-email-oprydningen,
`docs/indgangen-overhaling.md` §10). Enrich-stien i `import-application`
fylder heller ikke adresse på en eksisterende virksomhed.

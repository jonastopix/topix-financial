# Overlevering

**Sidst opdateret: 3. september 2026, sen aften — efter at et RLS-hul
blev fundet og lukket (#591) og motoren bag rådgiverens signaler blev
bygget (#589).**

Læses først i enhver ny samtale. Claude husker intet mellem samtaler;
denne fil skal kunne bære det. Den fortæller hvordan vi arbejder, hvor
vi står, hvad der venter, og hvilke fælder der har kostet tid — og peger
på det dokument der bærer detaljen. Detaljen bogføres DÉR, ikke her.

**Én regel har formet filen:** hver påstand er enten målt (med kilde),
eller mærket som ikke målt. En tidligere overlevering begyndte med en
sætning der var forkert, og det kostede en time.

---

## DEL 0 · Start her — det en ny samtale skal vide før alt andet

Du er Claude i chatten (claude.ai). Du taler med Jonas Herlev,
medstifter af The Boardroom, en finansiel rådgivningsplatform for
danske SMV'er. Morten er medstifter og rådgiver sammen med Jonas; de
to er «rådgiverportrætterne» i signup-skærmen. Claude Code er et
SEPARAT værktøj i Jonas' terminal, som du skriver prompter til.

**START HER:** læs denne fil til ende. Spørg så Jonas hvad han vil tage
fat på, og foreslå ud fra DEL 3's tabel (de datosatte rækker først).
Antag intet om tilstanden ud over det der står her, med dato og kilde.

**Sprog.** Alt er på dansk: chat, kode, identifikatorer, kommentarer,
commit-beskeder, PR-titler og -bodies, dokumenter. Engelsk kun hvor
tredjepart dikterer det (Stripes feltnavne, biblioteks-API'er).

**Arbejdsdelingen.** Jonas udfører ALT teknisk selv. Du dikterer
præcise, kopierbare skridt, ét ad gangen: én kodeblok pr. svar, og
intet andet der ligner kode. Destinationen står som almindelig tekst
OVER kodeblokken — Terminal, Lovable SQL editor, Lovable build-chat,
Claude Code, browser-URL — aldrig som `#`-kommentar inde i blokken
(zsh læser ikke `#` interaktivt). Facit skrives som tekst. Er du i
tvivl, spørg med A/B-valg; Jonas svarer med bogstaver.

**Claude Code.** Startes med:

    cd ~/topix-financial && claude

og derefter `/model fable` i Claude Code. Den læser selv `CLAUDE.md`
(stack, RLS-mønstre, deploy-kanaler, FORBIDDEN-listen), så det skal
ikke gentages i prompten. Recon kommer ALTID før kode: Claude Code
bruges til at finde hvad der allerede findes, hvilke navne og
kontrakter ny kode skal stemme med, og hvem der kalder hvad, før nogen
ny SQL-funktion, edge function, migration eller flade skrives.
Enhver prompt slutter med at den selv skriver resultatet til
`~/Downloads` og siger hvilken fil: diffen ved kodeændringer
(`git add -A && git --no-pager diff --cached > ~/Downloads/diff-<navn>.txt`),
dokumentet ved recon (`~/Downloads/recon-<navn>.md`). Jonas uploader
filen til chatten. Recon-prompter beder ALTID om KUN fund — ingen
forslag, ingen vurdering — og om at STOPPE frem for at gætte.

**AFGJORT 3/9: Claude Code opretter IKKE grene.** Den bliver på `main`
og committer ikke; chatten dikterer grenen ved commit (`git checkout -b
<navn>` → commit → push → `gh pr create`). Det fjerner dubletten af
grene, som hidtil kostede en oprydningsrunde pr. opgave. Skriv det i
prompten, indtil det sidder.

**To Claude Code-vinduer** er tilladt når HØJST ÉT skriver. To reconer
samtidig er fint; en recon plus en kodeændring er fint; to skrivninger
er det ikke — heller ikke når den ene «bare» er dokumentation. Sker det
alligevel: `git reset` det staged, og `git add` med navngivne stier.
Bekræftet 3/9 aften: to vinduer kørte hele aftenen (recon i det ene,
bogføring i det andet) uden problemer, fordi højst ét skrev ad gangen.

**Rutinen efter merge, som handlinger** (rækkefølgen er den faktiske):

1. **Migration** (`supabase/migrations/…`): Jonas åbner Lovable → SQL
   editor, indsætter HELE migrationsfilen (ikke et uddrag — 3/9 kostede
   et uddrag RLS og kommentarer på `company_traek`), kører, og
   verificerer med en SELECT mod `information_schema`/`pg_policies`.
2. **Ny edge function eller ny `_shared/`-fil**: ruller IKKE med merge.
   Jonas beder build-chatten i Lovable om at deploye funktionen ved
   navn. Build-chattens «deployet ✅» er IKKE bevis — et kald er: kald
   funktionen uden nøgle og se 401 (eller 400), ikke 404. Ændringer i
   en eksisterende function uden ny delt fil auto-deployer.
3. **Frontend** (`src/`): Jonas klikker «Update» i Lovable, når synken
   har commit'en. Hard reload i browseren før noget bevises.
4. **Webhook-grene**: kig i Stripe Workbench → Webhooks → Event
   deliveries bagefter. En 500 fejler stille for os.
5. **Grene ryddes** med `gh pr list --state merged` — aldrig med `git
   diff` (GitHub squasher, så diffen lyver). Slet derefter med `git
   push origin --delete <gren>` og `git branch -D <gren>`.

**Hjemmebane («Hb»)** er platformens nye designsprog: lyst, redaktionelt,
tokens scoped til `.theme-hjemmebane`; komponenter hedder `Hb…`
(`HbMemberShell`, `HbSpinner`, `HbSidebarDrawer`), og medlemsfladen
bæres af `HbMemberShell`. **AppLayout er det gamle design** — mørkt,
Radix-baseret — som store dele af rådgiverfladen stadig ligger i.
Designsproget står i `docs/hjemmebane-designsprog.md`; hvad der er
flyttet og hvad der venter står i `docs/hjemmebane/konvergens.md`.

**Hvad du kan nå herfra, og hvad du ikke kan.** Du har MCP mod Stripe
(The Boardroom-kontoen) og kan læse og skrive der — hvert kald med
eksplicit `stripe_context` og `livemode: true`. Du har IKKE adgang til
Supabase-dashboardet (Supabase-MCP'en rammer ikke Lovable-projektet),
ikke til Lovable (SQL editor, build-chat, Update, Auth-indstillinger,
Storage), og ikke til Stripes Event deliveries-log. Dem kigger Jonas i,
og du dikterer hvad han skal køre eller se efter.

---

## DEL 1 · Arbejdsgangen

Jonas eksekverer alt teknisk. Claude er teknisk arkitekt og dikterer
præcis ét næste skridt ad gangen. Alt eksekverbart står i chatten, aldrig
som en henvisning til en fil Jonas skal finde. Reglerne nedenfor står
der fordi det modsatte har kostet noget konkret, med dato.

### Værktøjsvalg — Claude har ansvaret for at vælge rigtigt uden at blive bedt

Tre værktøjer, tre styrker:

| værktøj | styrke | bruges til |
|---|---|---|
| **Lovable SQL editor** | måler PRODUKTIONENS faktiske tilstand | `pg_proc`, `pg_policies`, `information_schema`, `cron.job`, tal i tabeller. Migrationshistorik er ikke bevis. |
| **Shell / heredoc** | læser enkeltfiler ORDRET, skriver rene datadumps hvor hvert tegn er kendt på forhånd | `cat`, `grep`, `sed -n`, bogføring af målinger |
| **Claude Code** | ÆNDRER kode, og finder sammenhænge på tværs af hele repoet som hverken Claude i chatten eller SQL editor kan se | alle kodeændringer, al recon der følger tråde mellem filer |

**Claude Code SKAL bruges før enhver ny SQL-funktion, edge function,
migration eller flade**, til at afdække: (a) om noget lignende allerede
findes, (b) hvilke navne, tilstande og kontrakter den nye kode skal
stemme overens med, (c) hvem der kalder hvad.

Dokumenterede anledninger 2/9: `hent_betalingstilbud` blev skrevet med
tilstandsnavnet «aaben», som ikke stemte med `afgoerBetalingsfrist`s
«afventer_betaling», skrevet en time forinden — fordi de aldrig blev set
ved siden af hinanden. Og `intro-reminder-cron` blev erklæret død ud fra
et forældet filhoved; Claude Code fandt cron-jobbet der kalder den
(jobnavnet `intro-session-reminder` matchede ikke funktionsnavnet).

**Ved recon: bed UDTRYKKELIGT om KUN fund.** Ingen forslag, ingen
vurdering. Ellers blandes måling og mening. Reconen skrives til en fil,
aldrig kun til skærmen.

**ENHVER prompt til Claude Code slutter med at den selv skriver
resultatet til `~/Downloads`** — diffen ved kodeændringer, dokumentet
ved recon. Fast afslutning:

    Til sidst, uanset udfald:
      git add -A && git --no-pager diff --cached > ~/Downloads/diff-<navn>.txt
    Sig hvilken fil den ligger i.

Uden det bliver hver ændring til tre runder i stedet for én. Og:
dokumenter Claude Code skal SKRIVE til repoet, skriver den selv — Claude
i chatten dikterer ikke en heredoc med indhold en model lige har lavet.

### Ét skridt ad gangen

Aldrig to handlinger i samme besked. Ikke en commit og en recon. Ikke en
SQL-kørsel og en terminal-kommando. Én kodeblok pr. svar, og intet andet
der ligner kode — facit skrives som tekst. Destinationen står som
almindelig tekst OVER blokken (Terminal, Lovable SQL editor, Lovable
build-chat, Claude Code, browser-URL), aldrig som `#`-kommentar inde i
den: zsh læser ikke `#` som kommentar interaktivt («# TERMINAL» gav
`command not found: #`). Målt 1–2/9: to handlinger i én besked kostede
tre gange en ekstra runde, og én gang en commit direkte på `main`.

### Mål, påstå ikke

Fravær i data er ikke en tilstand før det er undersøgt. Skriv aldrig
«der findes ikke» uden at have målt det — og et «findes ikke» skal bære
den grep eller SQL der viste det. Fravær i repoet er ikke fravær i drift;
fravær i hukommelsen er ikke fravær i repoet.

Ret dig selv højt og med det samme: hvad du troede, hvad der viste sig,
hvad det ændrer. Dokumenterede fejl 1–2/9: en Monday-kolonne der skal
dø blev gjort til kilde for indgangsprisen; en margin (`cancel_at`) blev
sat i den forkerte retning fordi kun konklusionen var skrevet ned; en
testfil blev «læst» ved kun at se assertions, ikke tallene; en påstand
om at en opdatering var gået igennem, da hele transaktionen faktisk var
rullet tilbage af en constraint-fejl; fristen blev regnet fra
betalingsmailen, hvor aftalegrundlaget siger fra underskriften.

### Destruktive ændringer

SELECT før, skriv, SELECT efter. Skriv FØR-værdierne ud i svaret, så de
kan rulles tilbage uden at lede. Guard hver UPDATE på den forventede
nuværende værdi (`and cvr_number is null`, `and status = 'active'`), så
en allerede rettet række rammer nul frem for at blive overskrevet.

Lovables SQL editor kører hele scriptet i ÉN transaktion: fejler ét
statement, rulles HELE kørslen tilbage — også det der så ud til at
lykkes. DDL og en `rollback`-måling må aldrig stå i samme script. Og
editoren eksporterer kun det SIDSTE resultatsæt: flere målinger samles
i ét med `UNION ALL` og en `sektion`-kolonne, alle grene castet til
samme kolonneantal og -type.

### Kodearbejde

- **Motor før flade.** Rene, testede funktioner bevist før noget nogen
  kan trykke på. Spejles en motor til Deno (`_shared/`), er filhovedet
  den eneste forskel, og en paritetstest i `src/lib/__tests__` låser det.
- **Læs rå diffs før commit-go** — aldrig referater.
- **Merge er ikke udrulning.** Frontend kræver Update-klik i Lovable
  når synken har commit'en. Nye edge functions OG ændringer der trækker
  en ny delt fil ind (`_shared/…`) ruller ikke med merge — de deployes
  eksplicit via build-chat, og verificeres med at funktionen svarer
  noget andet end 404 (målt 31/8 på `foreslaa-opgave`, 1/9 på
  `_shared/stripePris.ts`). Migrationer køres manuelt i SQL editoren og
  auto-deployer aldrig.
- `gh run list --branch`, ikke `gh pr checks` (Vercel-appen hænger check-
  suites i `queued`).
- `bunx tsc --noEmit -p tsconfig.app.json` (uden `-p` checkes nul filer).
  Fire baseline-typefejl er kendte: CompanyChatPane, PushView,
  RapporteringView ×2. `bun run test`, ikke `bun test`. Deno-tests i
  `_shared/*_test.ts` kører kun i hånden; `deno check` er ikke en gate
  i CI. `bun run check:edge-auth` kører i CI; `check:verify-jwt` kun lokalt.
- CLAUDE.md's «FORBIDDEN»-liste gælder: ingen ændring af
  SECURITY DEFINER-funktioner, `handle_new_user` eller
  `protect_*`-triggers uden eksplicit grønt lys.

### Git og Claude Code — grene, sletning, samtidighed (målt 2.–3. september)

- **`git diff` kan IKKE afgøre om en gren må slettes i dette repo.**
  GitHub squasher ved merge, så grenens commits findes aldrig i `main`
  under samme id. Både to-prik (`origin/main..gren`) og tre-prik
  (`origin/main...gren`) giver forkerte svar, og `git branch -d` nægter
  at slette selv når arbejdet ER inde — advarslen «has been merged to
  refs/remotes/origin/… but not yet merged to HEAD» er præcis det.
  **Det der virker:** `gh pr list --state merged` — spørg den der ved
  det. Claude fejlede på det to gange 3/9 og nåede tre forskellige
  forkerte konklusioner, før den spurgte GitHub.
- **Læs retningen, når du alligevel læser en diff.** `git diff main..gren`
  viser hvad grenen ville ændre HVIS den blev merget. Store
  sletningstal betyder at grenen MANGLER det `main` har — den er ældre —
  ikke at den ville fjerne noget. En gren der «sletter 3267 linjer» er
  typisk bare lavet før de sidste PR'er blev merget.
- **Claude Code lavede sine egne grene, og de blev aldrig merget.**
  Claude Code oprettede selv en gren med sit eget navn, mens Claude
  (chatten) committede på en gren med et andet navn. Resultatet var en
  dublet efter hver opgave — 3/9 stod der fire tilbage ved
  eftermiddagens slutning (`feat/forsidesektion-faellesskab`,
  `feat/hb-visning-som`, `feat/registrer-traek`, `feat/traek-badge`)
  plus flere om formiddagen; alle ryddet 3/9 (målt: ingen af dem findes
  lokalt eller på `origin`). **AFGJORT 3/9 (DEL 0):** Claude Code
  opretter IKKE grene og committer ikke; den bliver på `main`, og
  chatten dikterer grenen ved commit.
- **To kodeændringer må ikke køre samtidig i to Claude Code-vinduer.**
  Reglen har hidtil kun stået som CLAUDE.md's «Lovable og Claude Code
  skriver ALDRIG samtidig»; den gælder også to Claude Code-vinduer.
  Skærpet 3/9: Claude satte en bogføring i gang mens en kodeændring
  kørte — begge skriver til repoet, og `git add -A` ville have blandet
  dem. Det gik godt kun fordi bogføringen ikke nåede at skrive endnu.
  **Når det ALLIGEVEL sker:** commit med filerne NAVNGIVET (`git add
  sti1 sti2 …`) frem for `git add -A`, og `git reset` først hvis noget
  allerede er staged. Reglen står ved magt: to reconer samtidig er
  fint, en recon plus en kodeændring er fint, to skrivninger er det
  ikke — heller ikke når den ene «bare» er dokumentation.

### Dokumentation slås op

Ved tredjepartsværktøjer: slå op frem for at huske. Stripe især — otte
opslag på to døgn rettede otte antagelser (`cancel_at` i Checkout,
mailbekræftelse, kundekopi, moms-id, `proration_behavior`, expire-
endpointet, idempotency-nøgler, invoice-events). **Det gælder også
offentlige registre** (lærdom 3/9): CVR's branchekode skiftede fra DB07
til DB25 1/1 2025, og både designdokumentet og opgaven til
branchemotoren blev skrevet fra hukommelsen mod det gamle register — et
register vi bygger på kan være skiftet ud, uden at noget i repoet siger
det. Supabase-MCP'en har IKKE adgang til Lovable-projektet
(`execute_sql` svarer «You do not have permission») — prod måles i SQL
editoren.

### Regnestykker skrives ud

Afgør en beregning penge eller datoer, skal selve regnestykket stå i
kommentaren, ikke kun resultatet: «rate12 trækker i måned 0–11, næste
træk ville falde i måned 12, start + 12 måneder − 1 dag rammer efter
sidste aftalte træk og før det næste.»

### Hvor kommer feltet fra

Spørg altid hvor data stammer fra, og om kilden overlever. Et felt der
bygger på noget der skal dø, dør med det (Monday-kolonnen «Pris på
forlængelse», 1/9). Før et felt foreslås: grep på dansk OG engelsk, og
list alle `ALTER TABLE … ADD COLUMN` — de er spredt over mange
migrationer.

### Spørg med svarmuligheder

Er Claude i tvivl, stilles spørgsmålet direkte med A/B-valg frem for
åbent. Jonas svarer med bogstaver.

### Værktøjer, adresser

Repo `jonastopix/topix-financial` i `~/topix-financial`, Lovable-ejet
Supabase-projekt `loiavmastgeieqyiwyyr`. Claude Code i terminalen med
`/model fable`. Stripe: egen konto `acct_1U6mzp3CvBmCx5Pt` («The
Boardroom») siden 1/9; den gamle Topix.dk-konto
bærer stadig 13 abonnementer (konto-id: slå op i Stripe, ikke huskes). Hvert Stripe-MCP-kald kræver eksplicit
`stripe_context` OG `livemode: true`. Bunny Stream library `720547`,
referrer-låst til `app.theboardroom.dk`.

---

## DEL 2 · Tilstanden

Kort, med det dokument der bærer detaljen.

### Fornyelseskæden — bevist i drift 1/9

`docs/fornyelseskaeden-1-september.md`, `docs/fornyelsesordningen.md`.
Indgangsprisen er data (`companies.indgangspris_oere`, `fornyelsespris_oere`),
perioder er rækker (`company_perioder`), kontrakten løber fra
betalingsdagen, beslutningen (`company_fornyelse`) forlader aldrig
serveren. Motoren `afgoerFornyelsestilstand` (ti tilstande), fladen
`FornyelsesSektion` på /members, gaten `MembershipExpiredGate`,
`opret-fornyelse-checkout` og fornyelsesgrenen i `stripe-webhook` med
`cancel_at` sat fra abonnementets start. Ordningen træder i kraft 10/9.
Åbne punkter står i fornyelseskædens §10.

### Indgangen — kæden FØR platformen er hel 3/9: «Godkendt» → betalingsmail → påmindelser → dag 31-faktura → betaling → adgang

`docs/indgangen-design.md` §1–31 (§22–31 er dagens bogføring).

| led | fil | status |
|---|---|---|
| Monday «Godkendt» → virksomhed, prisniveau, token | `monday-webhook`, `_shared/mondayAnsoegning.ts`, `_shared/virksomhedsOprettelse.ts` | bygget; dedup på `monday_item_id`; e_mail-fejlen rettet (kolonnen hedder `email`) |
| dag 0-mail / rådgivermail | `_shared/indgangsBetalingsmail.ts`, `send-indgangs-betalingsmail` (Bucket B, kun manuelle kald) | bygget; kræver secret `RAADGIVER_MAIL_TIL` |
| udløser 2: rådgiver sætter pris | `saet-indgangs-prisniveau` (Bucket A) + `IndgangsSektion` på /members | bygget og bevist 2/9 |
| /betal, checkout, webhook | `Betal.tsx`, `hent_betalingstilbud`, `hent_betalingsdata_til_checkout`, `opret-indgangs-checkout`, indgangsgrenen i `stripe-webhook` (kontrakt, indgangspris, ophør, invitation) | bevist 2/9 med en gennemført betaling |
| påmindelser dag 14/25/31 | `indgangs-paamindelser-cron` (tørkørsel som standard) | bygget; **cron-jobbet `indgangs-paamindelser` planlagt 3/9 (0 10 \* \* \*), aktivt**; springet bevist (dag 31 uden dag 14 først) |
| dag 31-faktura + betaling | `_shared/indgangsFaktura.ts` (motor, #559), cronen kalder den FØR dag 31-mailen (#561), `invoice.paid`-gren i `stripe-webhook` (#561), migration 20260903130000 (kørt 3/9) | **bevist i drift 3/9 kl. 10:00–10:11 på FLOOR1**: faktura TBR-0003 med moms (adressen fra #560 kom med), markeret betalt uden for Stripe → periode `'faktura'`, kontraktdatoer, invitation; kreditnota bagefter. `invoice.paid` tilmeldt formiddag (fem events; sjette, `invoice.payment_failed`, kom eftermiddag med #572; `invoice.created` bevidst ikke) |
| motoren | `src/lib/betalingsfrist.ts` + spejl | fristen er KONTRAKTENS: 30 dage fra underskriften (rettet 2/9, migration 20260902140000) |
| værn mod dobbeltbetaling | `_shared/checkoutSession.ts` i alle fire checkout-funktioner | bygget: udløb forrige session, 30 min levetid, id gemt |

Seks migrationer fra 2/9 skal være kørt i SQL editoren for at kæden
holder: `20260902140000` (frist fra underskrift), `150000`
(sidste_checkout_session), `160000` (monday_item_id), `170000`
(velkomstvideo_set_at), `180000` (velkomstvideo_guid), `190000`
(lookup_invite email+kontakt). **Alt er kørt og verificeret: målt 2/9
kl. 19:46 i Lovable SQL editor gav de elleve tjek nedenfor alle `true`.**
SQL'en beholdes, så den kan køres igen efter en genskabelse:

```sql
select 'company_betalingslink findes' as sektion,
       to_regclass('public.company_betalingslink') is not null as ok
union all select 'monday_item_id på linkrækken',
       exists (select 1 from information_schema.columns
               where table_name = 'company_betalingslink' and column_name = 'monday_item_id')
union all select 'sidste_checkout_session_id på company_betalingslink',
       exists (select 1 from information_schema.columns
               where table_name = 'company_betalingslink' and column_name = 'sidste_checkout_session_id')
union all select 'sidste_checkout_session_id på companies',
       exists (select 1 from information_schema.columns
               where table_name = 'companies' and column_name = 'sidste_checkout_session_id')
union all select 'vis_i_netvaerk på companies',
       exists (select 1 from information_schema.columns
               where table_name = 'companies' and column_name = 'vis_i_netvaerk')
union all select 'velkomstvideo_set_at på profiles',
       exists (select 1 from information_schema.columns
               where table_name = 'profiles' and column_name = 'velkomstvideo_set_at')
union all select 'velkomstvideo_guid i app_config',
       exists (select 1 from public.app_config where config_key = 'velkomstvideo_guid')
union all select 'hent_betalingstilbud findes',
       to_regprocedure('public.hent_betalingstilbud(uuid)') is not null
union all select 'hent_betalingsdata_til_checkout findes',
       to_regprocedure('public.hent_betalingsdata_til_checkout(uuid)') is not null
union all select 'lookup_invite_company_info giver email',
       pg_get_functiondef('public.lookup_invite_company_info(uuid)'::regprocedure) like '%''email''%'
union all select 'hent_betalingstilbud regner fra underskrevet_at',
       pg_get_functiondef('public.hent_betalingstilbud(uuid)'::regprocedure) like '%underskrevet_at%';
```

Kendte huller (recon-indgangen-fuld 2/9, ikke rettet): /members'
«Send invitation»-knap kan invitere en ubetalt virksomhed (adgang uden
betaling); en «tidligere»-virksomhed genbrugt på CVR sidder fast som
«betalt»; «enqueued» stemples som «sendt». *Løst 3/9:* dag 31-mailen
lovede en faktura ingen sendte — nu sendes fakturaen først (§30).
*Nyt 3/9:* `sikrIndgangsInvitation` kender ikke «allerede accepteret»
(DEL 3).

### Migrationen af abonnementerne — pilot gennemført, 13 venter

`docs/migration-recon-1-september.md` §1–25. 14 skal flyttes (ikke 18).
Piloten doggybed er flyttet 2/9 (`sub_1UB6wE3CvBmCx5Ptq3hHp2vt`, første
faktura 13/9 på 4.375 kr.). **Besluttet 2/9: de tretten andre venter til
trækket 13/9 er bevist gået igennem** — derefter i portioner. YKRG kan
ikke flyttes før kortet virker (§7). Piloten bærer `company_id` i
metadata (§22); listen over UUID'er for de tretten næste er ikke lavet
(§16, præciseret 3/9). **Fundet 3/9 (§26, #563):** abonnementet bærer
`art = "migreret"`, og webhookens subscription-grene sprang kun over ved
indgang/fornyelse — trækket 13/9 ville have skrevet `subscription_status
= active` på doggybed, og 13/10 kl. 00:00–08:35 UTC ville tier blive
`subscriber` (usynlig i FornyelsesSektion, intet fornyelsestilbud, 403
på checkout). Rettet til hvidliste: kun det art-løse selvbetjenings-
abonnement skriver. Adgangen var aldrig i fare (tier læser
`contract_end_date` først). **Lukket 3/9 kl. 10:42 (§26):** skrivningen
fra 2/9 udeblev ikke fordi eventet manglede — `customer.subscription.created`
BLEV leveret, og webhooken svarede 500 (skrivningen kastede); Stripe
gentog fem gange. Efter #563 blev eventet gensendt manuelt og svarede
200 `skipped: migreret_subscription` («Recovered») — hvidlisten er
dermed bevist på det rigtige event, og webhooken får subscription-
events. Hvad der kastede i skrivningen, afdækkes bevidst ikke (grenen
når aldrig derhen igen for et abonnement med en art); det art-løse
selvbetjeningsabonnement går stadig gennem den kode, og der findes ingen
i dag.

### Onboarding-tjeklisten — bygget 2/9

`src/lib/onboardingTjekliste.ts` (motor, 21 tests), `useOnboardingTjekliste`,
`HbOnboardingTjekliste` monteret i `HbMemberShell` (19 filer bruger shellen), «Kom
godt i gang» i sidebaren. Seks punkter når der er velkomstvideo, fem uden
(«vi viser ikke tomt indhold»). Velkomstvideoen sættes i `/admin/config`
(`app_config.velkomstvideo_guid`) og indlejres via `get-video-embed`
`{ velkomst: true }` — ingen content_items-række. Settings, Milestones og
PulseCheckin er AppLayout og har ikke boksen (accepteret).
Recon: `~/Downloads/recon-onboarding-tjekliste.md`, `recon-velkomstvideo.md`.
**Siden 2/9 nat er tjeklisten også forsidens fokuskilde** (trin 8–9,
#546/#547): så længe den ikke er færdig, viser «Dit næste skridt» dens
ikke-gjorte punkter i stedet for (a)–(i), og hilsenen siger «Velkommen».
Pillen står stadig ved siden af — ikke afgjort (indgangen-overhaling §10).

### Adgangsrejsen — RUTEN ER FÆRDIG 3/9 formiddag: trin 5–13 bevist i drift, 1–4 bygget

`docs/indgangsfladen-design.md` (design §1–8, 2/9 nat; tillæg §9–13,
2/9 aften) og `~/Downloads/recon-adgangsrejsen.md` (designet holdt op
mod koden, med de syv trin i rækkefølge og hvad der kan gå galt).
Bygget (#537) og **bevist i drift 2/9 kl. 20:30 på Two Socks' rigtige
invitation** (§9): `lookup_invite_company_info` giver `email` + `kontakt`
(migration 20260902190000), og /auth forudfylder mail (låst) og navn
(redigerbart) fra invitationen. Datahul fundet samme aften:
`contact_person` var tomt på 35 af 39 virksomheder, fordi kun
monday-webhookens «Godkendt»-gren skriver det; tre er rettet med Monday
som kilde, 32 står tomme (`docs/indgangen-design.md` §32). Invitationer
har ingen udløbsmekanik, og en invitation er ikke nødvendigvis
medlemmets egen adgang (§13). **Resten er designet som ét epic i
`docs/indgangen-overhaling.md`** (2/9 aften): målet er to skærme
(signup → Dit Boardroom); mailbekræftelsen slås fra; Onboarding-porten
pensioneres (agentens stempel skal flyttes først); ankomsten står selv
uden video; branchen udledes af CVR via en ny ren motor; de dårlige
dage (skelet uden udgang, dødt token, indlogget browser) får Hb-flader;
rækkefølgen i dets §9. **Bevist 2/9 aften/nat, trin 5–9:** mail-
bekræftelsen slået fra (kl. 21:56); agentens betingelse rettet og
bevist med `onboarded_at` NULL (#544, kl. 20:53); Onboarding-porten
pensioneret (#545, kl. 23:03 — seks skærme blev til tre: signup,
spinner, forside); ankomstens motor (#546, 21 nye tests) og flade
(#547, kl. 23:20: «Velkommen, Jonas.» + første tjeklistepunkt som
fokus, ikke «Upload dine august-tal»). `profiles.onboarded_at` skrives
ikke længere af ruten; kolonnen står som historik. **Hele Auth-fladen
er Hjemmebane, 2/9 nat (trin 11–12):** signup som delt skærm med de to
rådgiverportrætter i den nye `HbRaadgiverPortraetter` (#549), login
rolig uden portrætter, nulstil, «Tjek din mail», «Konto oprettet»
(#550), `HbSpinner` i stedet for de tre grønne spinnere og `AuthRoute`s
null, ResetPassword og 404, feltklasser i `hjemmebane/hbFormKlasser.ts`
(#551). Google er fjernet fra signup og findes kun på login — besluttet,
fordi Google-vejen ikke bærer invitationstokenet (§3); den rigtige
løsning er at koble Google på bagefter (§10). Jonas bekræftede login,
signup og nulstil på skærm. **Det grønne blink efter login er væk, 3/9
morgen (trin 13, #554):** `useAuth` sætter `loading = true` ved
overgangen ingen-session → session (en `useRef`, ikke `user` fra
closure) og nulstiller markøren når sessionen forsvinder. Betingelsen
er bevidst overgangen og IKKE `_event === "SIGNED_IN"`, fordi auth-js
udsender SIGNED_IN ved faneskift, cross-tab broadcast, re-auth ved
kodeordsskift og hard reload — et `loading = true` dér ville afmontere
hele rute-træet midt i en handling. Bevist af Jonas 3/9 i alle fire
scenarier. **Blindgyden er lukket, 3/9 formiddag (trin 10, #557):**
Index viste `DashboardSkeleton` i `AppLayout` når tier var null for en
ikke-rådgiver — mørkegrønt, uden grænse, uden besked, uden knap. Nu
vises `CompanyLinkFailedGate` straks. Ingen timeout, og det er
besluttet: efter #554 er tier null aldrig en ventetilstand (hænger et
opslag, holder `loading` porten og HbSpinner vises — Index tegnes
ikke); tegnes siden med tier null, er opslaget afgjort, og der er intet
at vente på. Den tredje vej ind i skelettet (PPI-succes satte aldrig
tier) er lukket i `useAuth` med `afgoerMedlemsTier`, samme regel som
trin D. Bevist kl. 08:53 med en fremkaldt tilstand: `company_members`-
rækken for `jonas+test3` slettet → gaten «Vi mangler et led, Jonas»,
ikke skelettet; rækken rullet tilbage med oprindeligt id. *Metoden er
værd at huske:* en blindgyde kan fremkaldes billigt på en testbruger
der alligevel skal slettes. **RUTEN ER FÆRDIG:** trin 5–13 bevist i
drift, trin 1–4 bygget (udestående bevis for trin 4, se afsnittet
nedenfor). Fra invitationslink til Dit Boardroom: to skærme, Hjemmebane
hele vejen, en ankomst der tager imod, og ingen tilstand hvor et medlem
kan stå fast uden en vej videre. Uden for ruten, stadig åbent: §7.2–7.4
og §7.7, de tre `valueCards` uden hjem, pillens rolle i ankomsten,
velkomst-punktet uden knap i kortet (skal løses før `velkomstvideo_guid`
sættes), Google-kobling som kontoindstilling. (`DashboardSkeleton` er
fjernet, #571.)
Målt 2/9 i prod: `handle_new_user` er IKKE fail-closed på
`email_confirmed_at` og afviser signup uden invitation med P0001;
rådgivergrenen kommer først. CLAUDE.md er rettet (#537).

### Branchemotoren — trin 1–4 bygget og deployet 3/9; ét bevis udestår

`docs/indgangen-overhaling.md` §6 og §9 trin 1–4. Ren motor
`udledBranchekode` i `src/lib/branchekode.ts` (#553): opslag seks →
fire → tre → to cifre, tabel med begrundelse pr. række, 113 tests.
`INDUSTRY_OPTIONS` er flyttet fra `Settings.tsx` til `src/lib/brancher.ts`,
så motoren og Settings deler én kilde til labels — **bevist i prod 3/9
formiddag** (branche-vælgeren virker efter Update-klik, værdien læses
korrekt). Besluttet 3/9 (Jonas): motoren sætter `industry_code`;
`industry_label` KUN hvor feltet ellers ville være tomt (input, så
CVR-tekst, så motorens label); rammer mappingen ikke, står begge felter
tomme, og der sættes ALDRIG `other_general`. **Registret er DB25, ikke
DB07** — CVR skiftede 1/1 2025; §6 er rettet 3/9, motoren er bygget mod
DB25 (fixture fra Danmarks Statistik). **Trin 3–4 (#556):**
`byggVirksomhedsRaekke` oversætter CVR-koden ved oprettelse (ikke ved
genbrug på CVR); motor og taksonomi spejlet til `_shared/`, paritetstest
kører alle 738 underklasser gennem begge kopier; `virksomhedsraekke` har
nu én import, og importstien er den eneste tilladte forskel mellem
kopierne. `monday-webhook` og `import-application` deployet 3/9 via
build-chat (401 uden autorisation, ikke 404). **Udestående bevis:** at
en ny virksomhed faktisk får `industry_code` sat — 401 beviser kun at
funktionen svarer. Kommer ved næste rigtige «Godkendt» eller «Importér
ansøgning». Branchedataene i prod er rettet 3/9 kl. 11:50–12:00 med
engangs-berigelsen `berig-virksomheder` (#567): 29 af 30 aktive har nu
kode og label, ingen registerkoder tilbage; adresse på 26 af 30,
kontakt-email på 30 af 30 (§10). Otte uenigheder mellem CVR og
platformen er bevidst ikke rørt — én samtale (§10).

### Rådgiverfladen — medlemsskiftet løst og bevist 3/9; fladen kortlagt, overhalingen er et epic

`docs/hjemmebane/konvergens.md` §2.2-noten 3/9 og §2.9. **Medlemsskiftet
(#573):** en rådgiver kunne SÆTTE company-override fra fire Hb-flader
(Rapportering, KPI'er, Budget, Handouts via `HbAdvisorCompanyPrompt`),
men ikke RYDDE det fra nogen af dem — HbMemberShell kendte hverken
`isCompanyOverride` eller `clearCompanyOverride`. Værst: «Dit Boardroom»
viste MEDLEMMETS forside, fordi `companyId` var sat, så Index sprang
rådgivergrenen over. De eneste veje ud var tilfældige: tre nav-punkter
til gamle AppLayout-sider hvor banneret dukker op (/milestones, /chat,
/settings), adresselinjen, eller en genindlæsning der taber valget.
Rettet med `HbVisningSom`: en sticky linje øverst i indholdskolonnen,
«Du ser {virksomhed} · Tilbage til dig selv». Dommen er en ren funktion
i `src/lib/hjemmebane/visningSom.ts` med AppLayout-bannerets betingelse
ORDRET (`isCompanyOverride && !viewingAsMember && isAdvisor`) — «se som
medlem» er en anden ting og udelukker linjen, som den altid har gjort.
Samme adfærd som banneret: `clearCompanyOverride()` + `navigate("/")`.
Samme komponent løser HbAdminShell, hvis tilbage-link ellers landede på
medlemmets forside. Override-mekanikken i useAuth er URØRT. **Bevist på
skærm af Jonas 3/9 kl. 13:26:** «Du ser Booking Innovation · Tilbage til
dig selv» på Rapportering, og linket virker. *Observation, ikke fejl:*
sidebaren viser MEDLEMMETS navigation mens man er inde i en anden
virksomhed — ingen vej til /members herfra ud over linjen; åbent punkt
hvis det klemmer.

**Fladen er kortlagt 3/9** (`~/Downloads/recon-raadgiverfladen.md` —
uden for repoet, genskabes hvis den bruges). Jonas' ord: «uoverskueligt
at være rådgiver fordi data og admin indstillinger ligger hulter til
bulter», «rådgiverplatformen er simpelthen forfærdelig». Målt: af elleve
administrative områder er KUN TRE i Hjemmebane — indhold/Akademiet
(/admin/indhold med ugens-video, redaktionelt, evergreen, boardroom-push),
events og partnere. Gamle: e-mails, e-mail-log, feedback, legat,
platformconfig, import (to steder), review queue, agent-forslag,
rådgiver-notifikationer, rådgiverforvaltning. «Medlemmer» findes BEGGE
steder (bevidst dobbelthed, konvergens §2.2-noten): /members i gammelt
design bærer Indgangen, Fornyelsesbeslutninger, virksomhedsrækkerne og
afventende invitationer; /admin/indhold/fremdrift er Hb. Hele Hb-admin'en
nås KUN ved at kende URL'en. Det løbende rådgiverarbejde — chat,
rapport-review, agent-forslag, fornyelser, indgang, medlemsoverblik —
ligger næsten alt i gammelt design. **Overhalingen er et EPIC, ikke en
opgaveliste** (DEL 3): på størrelse med indgangen (to dage), og den
starter med en designsamtale om gruppering, ikke med kode.

### Community — opslagsmail, escaping, vægt på forsiden og medlemssporet: bygget og bevist 3/9 eftermiddag

`docs/community-design.md` (nyt 3/9). Målt i prod 3/9: seks tråde, to
svar, 26 med adgang; det vigtigste tal er visningerne — det mest sete
opslag er set af FIRE ud af 26. Folk svarer ikke fordi de aldrig ser
opslagene.

| led | fil | status |
|---|---|---|
| opslagsmail til alle med adgang (#576) | `notify-community-opslag` (Bucket A), gren i `send-notification-email`, `_shared/opslagsMail.ts` | **BEVIST I DRIFT 3/9 kl. 14:39 — ved andet forsøg.** Første forsøg kl. 14:30 gav nul notifikationer og en TOM function-log: browseren kørte den gamle CommunityView (kaldet kom med #576). Efter hard reload: 27 notifikationer, mailen landede i Jonas' medlemskonto med portræt, uddrag og knap. Modtagerdommen genbrugt fra nævnelsen (`get_community_medlemmer`); mailen bygges af tråden via `reference_id`; skjult tråd → ingen mail (community-design §4) |
| **escaping i mailkæden (#576) — står selv om resten forsvinder** | `_shared/htmlEscape.ts`, `send-notification-email` begge render-stier, guard-test | title/body blev lagt ind som rå HTML; trådtitel, broadcast og aflysningsbegrundelse er brugerskrevet. Rettet for alle typer |
| «Fra fællesskabet» med vægt (#577) | `forsideOpslag.ts`, `uddrag.ts`, `FremhaevetOpslag` i `BoardroomView` | nyeste OPRETTEDE opslag som hovedhistorie-kort med portræt, uddrag, billede; ingen ny forespørgsel |
| «Præsentér dig selv» | `member_profiles` (`ask_me_about`, `working_on`), tjeklistens «Din profil» | FINDES allerede — Netværket er præsentationen (community-design §7); et nyt tjeklistepunkt ville være en dublet |
| medlemmerne i Community (#579) | `communityMedlemmer.ts` (rene domme), `CommunityMedlemmer.tsx`, `CommunityView.tsx` | BYGGET OG SET 3/9: alle medlemmer (ikke rådgivere) fra Netværkets data → /medlemmer/{id}; dem med `ask_me_about` først, alfabetisk i hver gruppe, ingen skjules; den indloggede øverst med egen tekst eller opfordringen. Ingen ny datamodel, ingen ny RPC (community-design §8) |

### Månedstrækkene — bygget, udrullet og bogført 3/9 eftermiddag; bevis 13/9

`docs/indgangen-design.md` §31 (løsningen øverst). Indtil 3/9
eftermiddag fandtes ingen registrering af at rate 2–12 blev betalt, og
et fejlet træk var usynligt uden for Stripe. **#572:** tabellen
`company_traek` — ét spor pr. abonnementsfaktura (status
`betalt`/`fejlet`, beløb, tidspunkter, forsøg, næste forsøg, Stripes
fejlkode og -besked, fakturanummer og -link); `stripe_invoice_id` er
UNIK, så et senere event opdaterer samme række og en fejlet rate der
betales bliver `betalt` af sig selv. Grene i `stripe-webhook` for
`invoice.paid` (abonnementsfakturaer) og `invoice.payment_failed`;
faktura → virksomhed via abonnementets metadata i både ny og gammel
API-form; kaster aldrig. Logik i `_shared/abonnementstraek.ts`.
**Alle tre manuelle skridt er gjort 3/9:** migration
`20260903150000` kørt i prod (verificeret: 23 kolonner, RLS, to
policies, kommentar — men først ved anden kørsel; den første tog kun
`CREATE TABLE` fra et afkortet uddrag), `stripe-webhook` deployet via
build-chat, og `invoice.payment_failed` tilmeldt endpointet, som nu
har SEKS events (uafhængig GET). **#574:** badge i `chart-warning` på
virksomhedsrækken på /members ved siden af den grønne kontraktbadge
(med vilje: kontrakten løber, OG et træk er fejlet), udfoldet med
beløb, tidspunkt, Stripes forklaring, forsøg, næste forsøg og
fakturalink; kun de fejlede hentes. Update-klik gjort. **Adgang er
urørt.** Restancepolitikken (`past_due` = åben, `unpaid` = lukket) er
besluttet og IKKE bygget — den rører `computeMembershipTier` i tre
spejle plus fornyelsesmotoren, og en fejl dér lukker et betalende
medlem ude. Naturlig næste opgave. **Bevis udestår 13/9** (DEL 3).

### Adgangsdommene — kortlagt 3/9 aften

`docs/adgangsdomme.md`. Adgang og tier afgøres **fem steder, ikke tre**:
`computeMembershipTier` i to TypeScript-kopier, og SQL-funktionerne
`is_membership_active` (fail-open), `har_aktivt_medlemskab` (læser kun
`contract_end_date`; bærer community, indhold, events, storage) og
`har_aktivt_abonnement` (læser kun abonnementet). Kun de to
TypeScript-kopier er dækket af en paritetstest; **de to SQL-domme der
styrer indhold har ingen.** Hele repoet sammenligner
`subscription_status` med præcis strengen `active` og intet andet.
Målt i prod 3/9 kl. 20:32: **`subscription_status` er NULL på alle 38
virksomheder**; de tre SQL-funktioner matcher migrationsfilerne;
`company_traek` har 0 rækker. Restancepolitikken er udskudt på det
grundlag (DEL 3). Filhovederne i begge `membershipTier.ts` og CLAUDE.md
peger nu på dokumentet (#583).

### Rådgiverfladen — designet er låst 3/9 aften

`docs/raadgiverfladen-design.md` (#584, #586) og `docs/emneliste.md`
(#587). Kort: **fire rådgiverflader mod atten ruter** i dag — forside
(Dit Boardroom med alt der venter), indbakke (`/chat`),
virksomhedsliste (Virksomheder) og virksomhedsside — plus
platformdriften som egen blok under admin. Rådgiveren får medlemmets
menu. **Én vej ind til en virksomhed mod fire**: siden nøgles på
`companyId` (`/virksomhed/:companyId`), ikke `user_id`, fordi
virksomheden er en aftale og medlemmet en adgang — og fordi tre
virksomheder uden medlemmer i dag ikke kan åbnes. **Syv blokke**: hvad
skal du vide nu (ren automatik), deres ord og din forberedelse,
emnerne I har talt om, chatten, tallene, aktivitet, aftalen. Chatten
flytter ind på virksomhedssiden i fuld højde; `/chat` bliver stående
som bevidst dublet til de travle morgener. **Emne-opsamlingen** giver
chatten hukommelse: hver besked klassificeres mod ni faste emner
(udledt af 55 læste medlemsbeskeder, `docs/emneliste.md`), og formen
MÅLES før den bygges — holder målingen ikke, står opgave-historikken
som opsamling. C8 i `docs/chat-design.md` er delvist omgjort for det.
**Ingen kode er skrevet endnu.** Det der mangler før kode står i
designets §10 (DEL 3).

### RLS-hullet — fundet og lukket 3/9 kl. 22:48

`supabase/SECURITY_BASELINE.md` §5 og migration
`20260903230000_demo_policies_restrictive.sql` (#591). Aftenens
vigtigste fund.

**Hvad der var galt.** Fire policies med «demo» i navnet («Hide demo
company/conversations/facts/milestones from non-members») var
PERMISSIVE, hvor de skulle have været RESTRICTIVE. Permissive policies
stakker med OR: en række slipper igennem hvis bare én policy siger ja.
En policy hvis første led er `company_id <> demo` er sand for ALT der
ikke er demo — den gav adgang til alle andre virksomheders rækker i
stedet for at nægte adgang til demoens. Der fandtes nul restriktive
policies i hele `public` (0 af 268), så intet trak adgangen tilbage.

**Målt kl. 22:46** som et almindeligt medlem med én virksomhed (lånt
identitet via `set_config('request.jwt.claims', …)` + `set local role
authenticated`):

| kilde | kunne se | ejede selv |
|---|---|---|
| companies | 38 | 1 |
| milestones | 102 | 0 |
| financial_report_facts | 314 | 0 |
| conversations | 35 | 1 |

Ethvert logget-ind medlem kunne læse alle virksomheders regnskabstal og
alle samtaler mellem rådgivere og kunder. Elleve brugere har rollen
member.

**Rettet kl. 22:48** i Lovable SQL editor: de fire policies droppet og
genskabt `AS RESTRICTIVE`, samme udtryk. Efter, samme bruger: 1 / 0 /
0 / 1 — præcis det brugeren ejer. Rådgiveradgangen urørt: målt som
advisor+admin 38 / 102 / 314 / 35, uændret.

**Demo-virksomheden findes ikke i prod** (hverken `is_demo = true`
eller id `a0de0000-…0001`). Policyerne bevares som restriktive, så en
genoprettet demo ikke lækker. Morten (advisor uden admin) ville ikke
kunne se en demo-virksomhed under dem — det er hensigten, ikke en fejl.

**Migrationen er bogføring af en rettelse der ALLEREDE er kørt — den
skal IKKE køres igen.** Den er idempotent, så den kan køres efter en
genskabelse uden at fejle.

**Gennemgang af alle policies i prod bagefter, kl. 22:57:** ingen flere
af samme slags. Hver tabel i `public` har RLS og mindst én
SELECT-policy. To policies med `true` (`app_config`,
`industry_benchmarks`) er bevidst åbne og indeholder ingen persondata.
To med negation (`advisor_notifications`, `events`) har den AND'et med
en rolle- eller medlemskabsdom og kan ikke åbne noget.

### Motoren bag rådgiverens signaler (#589)

`src/lib/virksomhedsSignaler.ts` samler de to inline-domme
(`AdvisorDashboard.tsx` l. 803–851 og `MemberDetail.tsx` l. 726–832) til
én ren funktion, `afgoerVirksomhedsSignaler`, med 45 tests. Fem af
forsidens køer afgøres dér; fornyelser og indgange kommer fra egne
motorer. **«Ikke hørt fra længe» er vendt** (designets §3.5): kravet om
committede tal er væk, og en virksomhed der aldrig har skrevet er nu det
stærkeste signal (alvor 95). **Syv valg** står dokumenteret i filhovedet
hvor de to gamle domme var uenige: friskhedsgate på alle tal-signaler,
kun fald i MoM, abs-nævner, ulæste alerts 30 dage med dedup mod facts,
alvorsskala, milestones ude, intet loft. **En reel fejl rettet:** MoM
blev regnet uden `Math.abs` på nævneren, så et resultat der falder fra
−100 til −150 stod som en stigning på 50 %. `isFiguresFresh` er flyttet
ordret. **Ingen flade bruger den endnu** — AdvisorDashboard og
MemberDetail står uændrede indtil de lægges om (DEL 3).

### Oprydningen 2/9

Otte udløbne virksomheder markeret `status = 'tidligere'`
(20260902113000); testvirksomheden slettet; gæster holdes ude af
Netværket med `vis_i_netvaerk` (20260902110000); `hent_betalingsdata_til_checkout`
bogført (den kørte kun i prod, #524). `companies.status` har ingen
CHECK-constraint — «tidligere» er en værdi der blev defineret i
migrationen.

### Platformen i tal (målt 1/9)

33 rigtige virksomheder, 14 uden ét målt tal, 13 har aldrig uploadet,
chatten bruges af 88 %, rapportering 56 %, KPI-mål 15 %. *Om tallene i
denne fil:* «33 rigtige» er 1/9 før oprydningen; «30 aktive» (3/9) er
efter at otte blev `'tidligere'` 2/9; «38 virksomheder» (3/9) er alle
rækker i `companies` inkl. de otte tidligere, efter at testvirksomhederne
blev slettet.
`docs/status-1-september.md` og `docs/prioritering-1-september.md` bærer
facit og rækkefølge; `docs/chat-design.md` chattens form.

---

## DEL 3 · Det der venter

| hvornår | hvad | hvor det står |
|---|---|---|
| **10/9** | Fornyelsesordningen træder i kraft. Tre udløber inden og falder udenfor. | fornyelsesordningen.md §5, prioritering §1 |
| **13/9** | doggybeds træk på 4.375 kr. på den nye konto — MÅL at det gik igennem. Derefter flyttes de tretten i portioner. TuaMea (2/9), Floren engros og BR Roset (3/9) venter til efter egne træk. **Samme dag, beviset for #563 (nu stærkere):** `companies.subscription_status` skal forblive NULL på doggybed (`382fd787-3141-45c7-8eea-297b7b947fe0`) efter trækket — fordi grenen springer over med vilje, ikke fordi noget fejler — og `customer.subscription.updated` skal stå grøn i Stripes Event deliveries. SQL'en står i migration-recon §26. **Samme dag, beviset for #572:** en række i `company_traek` for doggybeds faktura med `status = 'betalt'` (SQL editor); fejler trækket, skal rækken stå som `fejlet` og badgen vise sig på /members (#574). | migration-recon §25, §26; indgangen-design §31 |
| LØST 3/9 kl. 10:42 | **Hvorfor skrev webhooken ikke på 2/9?** Eventet BLEV leveret; webhooken svarede 500 i skrivningen (fem gentagelser fra Stripe). Efter #563 gensendt manuelt → 200 `skipped: migreret_subscription`, «Recovered». Webhooken får subscription-events; hvidlisten er bevist på det rigtige event. Hvad der kastede, afdækkes bevidst ikke — men det art-løse selvbetjeningsabonnement går stadig gennem den kode. | migration-recon §26 |
| **29/9** | PHILBERTs fornyelse — beslutning skal registreres i FornyelsesSektion. Doggybed 13/10. | prioritering §1 |
| LØST 3/9 | **Cron-jobbet `indgangs-paamindelser` (0 10 \* \* \*)** er planlagt og aktivt, verificeret i `cron.job`. Tørkørsel og rigtig kørsel bevist på FLOOR1. Secret `RAADGIVER_MAIL_TIL` er ikke bekræftet sat i denne bogføring. | indgangen-design §26, §30 |
| LØST 3/9 | **Dag 31-fakturaen** (#559–#561): motoren opretter kunde + faktura med `metadata[company_id]` på begge, cronen sender den FØR dag 31-mailen, `invoice.paid` er tilmeldt (fem events formiddag, seks efter #572; `invoice.created` bevidst ikke) og skriver samme kæde som checkout med `betalingsmodel 'faktura'` og beløb uden moms. Bevist i drift 3/9 kl. 10:00–10:11 inkl. betaling og kreditnota. | indgangen-design §30 |
| LØST 3/9 eftermiddag (#572, #574) | **Månedstrækkene registreres** — både betalte og fejlede, i `company_traek`; `invoice.payment_failed` tilmeldt (seks events); fejlet træk ses på /members. Migration kørt, webhook deployet, Update klikket. Bevis 13/9. | indgangen-design §31 |
| UDSKUDT 3/9 aften | **Restancepolitikken** (`past_due` = åben adgang, `unpaid` = lukket) er besluttet og bygges IKKE nu. Tre grunde: den rammer nul rækker (`subscription_status` er NULL på alle 38, målt kl. 20:32, og kun det art-løse selvbetjeningsabonnement kan sætte det — der findes ingen); den ville ændre FEM domme, ikke tre, og to af dem (`har_aktivt_medlemskab`, `har_aktivt_abonnement`) er ikke paritetstestede og bærer community, indhold, events og storage; og formen er forkert for rateabonnementer, hvor en fejlet rate er en inddrivelsessag (`company_traek`, #572/#574), ikke en adgangssag. Bygges den dag det første selvbetjeningsabonnement oprettes: motor før flade, paritetstest på alle fem domme. | `docs/adgangsdomme.md` |
| åbent | **`sikrIndgangsInvitation` kender ikke «allerede accepteret»**: den leder efter pending; findes en accepteret række, fejler insert på `UNIQUE(company_id, email)`, og invitationen sendes ikke. Set 3/9 på FLOOR1. Kan ikke ske for indgangen i drift, men tilstanden er ikke håndteret. | indgangen-design §30 |
| åbent, besluttet | **Rykkere på dag 31-fakturaen**: Stripes egne påmindelser slås IKKE til (`auto_advance=false` med vilje — en fjerde stemme på engelsk fra en anden afsender ville skurre). Skal der rykkes, er det vores egen kæde. Ikke bygget. Bemærk også: dag 31-mailen siger 50.000 kr, fakturaen 62.500 kr inkl. moms — ikke ændret. | indgangen-design §30 |
| LØST 3/9 kl. 11:50–12:00 | **Adressen på de eksisterende virksomheder**: `berig-virksomheder` (#567) hentede den fra CVR for 26 af 30 aktive (før 1 af 30). Uden: tre uden CVR-nummer (Alexander Lund, Martin Larsen, Bastant Design) og YKRG, som registret ingen adresse har for. | indgangen-design §33 |
| efter 13/9 | Migrationen af de 13 (billing_cycle_anchor, cancel_at, default_payment_method, YKRG's kort, kobling til companies.id). | migration-recon §16, §25 |
| målt 3/9 aften — VIRKER for medlemmet | **1:1-sessionernes Calendly-kæde efter kontoskiftet.** Målt i Stripe (MCP, livemode): `session_1on1` findes som præcis én aktiv pris på den nye konto (`price_1UApFg3CvBmCx5PtyGkNPRmm`, 500 kr. ekskl. moms; kunden betaler 625 kr. med `automatic_tax`); `abonnement_maanedlig` findes ligeledes (`price_1UApQx3CvBmCx5Pt8GxtQsze`, 399 kr.). Webhook-endpointet `we_1UAtaW3CvBmCx5PtL736lAJN` er enabled med seks events inkl. `checkout.session.completed` og peger på `loiavmastgeieqyiwyyr`. **Kæden virker for medlemmet:** to betalte 1:1-sessioner er booket OG afholdt (23/6 og 30/6, målt i Calendly 3/9 aften). Det der fejler, er registreringen — rækken nedenfor. | — |
| bevidst nedprioriteret 3/9 aften — LAV | **Betalte 1:1-bookinger registreres aldrig som `booked`.** Målt 3/9 aften: **0 af 12 betalte bookinger har `calendly_event_uri`, mod 2 af 3 gratis.** Årsagen er tredelt: (1) `stripe-webhook` (linje 917 og 925) skriver Calendlys `booking_url` RÅT i `session_bookings.calendly_booking_url`, mens `create-free-intro-booking` (161–162) indlejrer bookingens id i URL'en (`salesforce_uuid` + `utm_content`), og `calendly-webhook` (75–80) matcher kun på dem; (2) `calendly-webhook` matcher desuden på `advisor = 'morten'` (l. 94, 129), og de betalte rækker er `'jonas'` (default, migration 20260621120000); (3) Jonas' Calendly-organisation har kun ét medlem, så Mortens webhook-abonnement kan ikke dække Jonas' events. **Prioritet LAV, besluttet:** det koster ikke medlemmet noget — de booker og mødes — og reparationen kræver Calendly-abonnement på premium. Det er nedprioriteret, ikke glemt. Ikke en følge af kontoskiftet; det har været sådan hele tiden. | `~/Downloads/recon-kontoskifte.md`, `recon-1til1-link.md` (uden for repoet) |
| åbent | **Velkomstvideoen skal optages** (Morten). Pladsen er bygget; GUID'et sættes i /admin/config. Siden 3/9 (#569) kan fokuskortet åbne videoen via `#velkomst`, så velkomst-punktet ikke længere er en fælde den dag GUID'et sættes — beviset på skærm kommer først da. | recon-velkomstvideo, indgangen-overhaling §10 |
| åbent | **Rundvisningen** — interaktiv førstegangs-oplevelse efter velkomsten; bygges efter C3-indflytningen; må aldrig eksistere ved siden af Guiden. | BACKLOG [P2·EPIC] Platform-onboarding |
| EPIC, designet 3/9 aften | **Rådgiverfladens overhaling** — tages SAMLET, på størrelse med indgangen. Designsamtalen ER holdt 3/9 aften: designet er låst i `docs/raadgiverfladen-design.md` (fire flader, syv blokke, `companyId`-nøgling, chat ind på virksomhedssiden, emne-opsamling målt før flade), emnelisten i `docs/emneliste.md` (ni emner, to holdt udenfor). **Det der mangler før kode** (designets §10): emnelisten skal bevises ved klassificering af alle 588 menneskebeskeder i et idempotent engangsjob, og målingen skal holde; buckets' linkmål for `primary: "company"` (`AdvisorDashboard.tsx:1130–1134`) er ikke læst; hvilke `advisor_notifications.type`-værdier der findes; hvad de fire AI-edge-functions (`ai-financial-feedback`, `ai-data-chat`, `generate-ai-forecast`, `run-company-agent`/`agent-forslag-afgoer`) læser og skriver serverside; og den samlede rene funktion bag «hvad stikker ud» — det sidste er gjort (#589). **Byggeomkostnings-reconen er kørt 3/9 sen aften** (`~/Downloads/recon-byggeomkostning.md`, uden for repoet — genskabes hvis den bruges). Den viste: (1) en flytning er **tre skridt i fast rækkefølge**, målt på de fire der allerede er sket (KPI'er, Rapportering, Budget, Handouts): motoren udskilles først som ren flytning med tests; den gamle flade lægges om til motoren og fryses; derefter bygges den nye flade på en midlertidig route — og swappes til sidst ind på den GAMLE URL, fordi URL'er er kontrakter i mails og notifikationer. (2) **Handouts er det reneste facit**: `HandoutDetail` 381 linjer → `HbHandoutDetail` 385; `HandoutLeverItem` 89 → 89. Samme motor, UI-primitiver byttet — når datalaget er delt på forhånd, koster en flytning næsten intet i logik. (3) **Rådgiverfladen er dyrere end alle fire**, af grunde ingen af dem havde: datalaget skal vendes fra `user_id` til `company_id`, blokken «Aftalen» skal bygges fra `/members`-listen (findes ikke på MemberDetail), og to inline-domme skulle samles til én — det sidste er gjort (#589). (4) Der findes **ingen opskrift som dokument**; BACKLOG's fire GO-punkter er den de facto-tjekliste, med samme skabelon hver gang. (5) **Ombygningen betaler gæld tilbage**: `HandoutDetail`-trioen, `PeriodSelector`, `AIFinancialAnalysis` og `FileUploadZone` kan først pensioneres når MemberDetail konverteres; ni komponenter i `src/components/` har allerede nul importører. Medlemsskiftet er løst uafhængigt (#573). De tre reconer bag designet ligger uden for repoet (`~/Downloads/recon-raadgiverfladen-2.md`, `recon-virksomhedssiden.md`, `recon-emner.md`) og skal genskabes hvis de bruges. | `docs/raadgiverfladen-design.md` §9–10, `docs/emneliste.md` §7 |
| målt 3/9 sen aften — ét skal løses før blok 1 | **Virksomhedsdata company-først** (`~/Downloads/recon-virksomhedsdata.md`, uden for repoet — genskabes hvis den bruges). `handouts` og `milestones` har BEGGE haft `company_id NOT NULL` siden februar 2026, så company-først-læsning kræver INGEN migration. Syv af de otte kilder motoren (#589) bruger kan en rådgiver læse direkte nøglet på `company_id`; policyerne kræver kun `has_role advisor`. **Den ottende, `notifications`, har KUN «Users read own notifications» (`user_id = auth.uid()`) — ingen advisor-policy** (bekræftet i prod 3/9 kl. 22:43). Rådgiveren ser alerts i dag fordi `detect-financial-alerts` skriver én kopi pr. rådgiver; en company-først-læsning ville ramme rådgiverens egne kopier, ikke virksomhedens. **DET SKAL LØSES før blok 1 kan tegnes.** En recon af alerts-kæden kører 3/9 sen aften. En virksomhed uden medlemmer giver nul rækker, ikke en fejl — virksomhedssiden kan tegnes tom. | `docs/raadgiverfladen-design.md` §3.3-noten, §4 blok 1 |
| LØST 3/9 kl. 22:48 | **RLS-hullet: fire demo-policies var permissive** og gav ethvert medlem læseadgang til alle virksomheders tal og samtaler (38/102/314/35 mod ejede 1/0/0/1). Rettet i prod til `AS RESTRICTIVE`; efter 1/0/0/1, rådgivere uændret. Bogført i migration `20260903230000_demo_policies_restrictive.sql` — kørt, skal ikke køres igen. Gennemgang af alle 268 policies kl. 22:57: ingen flere. | `supabase/SECURITY_BASELINE.md` §5; DEL 2 «RLS-hullet» |
| bygget 3/9 (#589) — første kode på rådgiverfladen | **Motoren `afgoerVirksomhedsSignaler`** (`src/lib/virksomhedsSignaler.ts`, 45 tests) — de to inline-domme samlet, stale-reglen vendt, syv valg i filhovedet. **Næste skridt:** læg `AdvisorDashboard.tsx` (buckets i `queryFn`) og `MemberDetail.tsx` («Hvad stikker ud») om til at kalde den, i én PR pr. flade, og slet de to inline-domme. Ingen flade bruger den endnu. | DEL 2 «Motoren bag rådgiverens signaler»; `docs/raadgiverfladen-design.md` §4 blok 1 |
| åbent, sikkerhed | **«Fjern medlem» har to forskellige gates for samme kald** (`manage-advisor`, `action: 'remove-member'`): `MemberCompanyRow.tsx:347` kræver `isAdmin && m.role !== 'owner'`; `MemberDetail.tsx:937–963` kræver kun `isAdvisor` (sidens gate l. 652). Skal afgøres og ensrettes **uafhængigt af ombygningen** — det er ét kald, og det skal have én dom. Fundet 3/9 sen aften. | `docs/raadgiverfladen-design.md` §9 |
| ved næste oprettelse | **Udestående bevis for trin 4** (branchen): næste rigtige «Godkendt» på Monday eller «Importér ansøgning» skal give en række med `industry_code` sat (SQL editor) og branchesammenligning i NoegletalView. 401 fra de deployede funktioner beviser kun at de svarer. | `docs/indgangen-overhaling.md` §6, §9 trin 4 |
| LØST 3/9 kl. 11:50–12:00 | **Branchedataene og kontakt-email i prod** (#567): 29 af 30 aktive har kode og label, ingen registerkoder (Two Socks → `food_restaurant`, WESDEX → `construction_craft`, begge med benchmarks nu); 30 af 30 har kontakt-email — 14 fra eget medlem, 3 fra den ventende invitation (Din økonomiafdeling, Two Socks, WESDEX: de har ingen medlemmer). Tilbage: Bastant Design uden kode og label (intet CVR, ingen gemt DB25). | `docs/indgangen-overhaling.md` §10 |
| samtale | **De otte uenigheder mellem CVR og platformen** er ikke rørt: ANLA GLAS, Brick Works, Homie, Limo Group, Studio Mini, TOFT, Topix, TuaMea. Ti af ti målte koder uenige med motoren; Brick Works og TuaMea ville MISTE deres sammenligning (motoren svarer null). Ikke kosmetisk: ANLA GLAS' DB-margin på 50 % flytter fra venstre kant til over midten. Hvem der har ret kan ikke afgøres fra data (Topix: mennesket; Limo Group: registret). Én samtale, ingen kode. | `docs/indgangen-overhaling.md` §10, `~/Downloads/recon-branche-uenighed.md` |
| LØST 3/9 (#571) | **`DashboardSkeleton` fjernet** — komponentfilen slettet; de fire træffere tilbage i `src/` er kommentarer der fortæller historien. | `docs/indgangen-overhaling.md` §10 |
| LØST 3/9 (#569) | **Ankomstens løse ender**: fokuskortet åbner velkomstvideoen via URL-hashen `#velkomst` (boksen læser, åbner, rydder), og den sammenfoldede pille trækker sig KUN på forsiden og KUN mens kortet viser tjeklisten — Jonas: «Det er vigtigt vi får et nyt medlem godt i gang, så den må ikke forsvinde for dem.» De to hang sammen (pillen var eneste vej tilbage efter «Se senere»). **Bevis udestår:** pillen væk på forsiden/stående på Rapportering kræver en konto med uafsluttet tjekliste (testbrugerne er slettet — næste rigtige medlem); velkomst-punktets knap kræver `velkomstvideo_guid`. «Dine tal»-kortets tomme tilstand står stadig nederst — åbent. | `docs/indgangen-overhaling.md` §5, §10 |
| LØST 3/9 kl. 10:52–10:57 | **Testopstillingen er ryddet (trin 14).** FLOOR1 I/S med `jonas+test1/2/3` slettet via /members' slet-dialog med brugere; «Jonas legat» (april-testvirksomheden, bar de to annullerede testabonnementer) slettet efter at storage-filerne først var fjernet i Lovables Storage-flade; den forældreløse `jonas+test45login` slettet fra SQL editoren inkl. `auth.users`. Målt efter: 38 virksomheder, 44 auth-brugere, 41 profiler, ingen rester, ingen storage-filer. **Stripe-testkunderne bliver stående (besluttet):** `cus_VBtMOGBenIfWt4` bærer faktura TBR-0003 og kreditnota TBR-0003-CN-01 — bilag skal kunne læses; to kunder fra «Jonas legat» står uden abonnement og uden kort. Ingen af de tre hører til en virksomhed i databasen. | `docs/indgangen-overhaling.md` §11 |
| åbent (Community-opdagelse LØST 3/9) | Nudge-formen som designdokument, ~~Community-opdagelse~~ (**LØST 3/9 med #576/#577**: opslagsmail + vægt på forsiden — uden om nudge-formen, fordi mailkæden fandtes), Events (bekræftelse, kalender, lokation), Milepælene ud — rækkefølgen fra 1/9 står for resten. | prioritering §2–5, community-design §4–6 |
| LØST 3/9 (#579) | **Medlemmerne i Community.** Bygget som spor på /community: alle medlemmer fra Netværkets data, dem med profiltekst først, ingen skjules, den indloggede øverst. Set på skærm af Jonas. | community-design §8 |
| LØST 3/9 kl. 14:39 | **Bevis for opslagsmailen i drift.** Første forsøg kl. 14:30 fejlede (nul notifikationer, tom function-log — browseren kørte gammel frontend); andet forsøg efter hard reload gav 27 notifikationer og en rigtig mail med portræt, uddrag og knap i Jonas' medlemskonto. | community-design §4 |
| observation | **Reaktionsknappen findes kun inde i tråden** (`CommunityTraadView:402`) — ingen like fra feed eller forside; den letteste interaktion kræver et klik ind. Ikke besluttet. | community-design §9 |
| åbent | **Ingen fravalgsnøgle for Community**: opslagsmailen følger «Opdateringer» (`important`) med alt andet; dagskvoten 5 gælder. | community-design §9 |
| noteret | **Svar udløser ingen mail til andre end de nævnte** (`notify-community-svar` findes, in-app til forfatteren). Ikke afdækket nu. | community-design §9 |
| ikke afdækket | **Nudging generelt** — Jonas spurgte 3/9; ingen recon lavet. | community-design §9 |
| epic (rådgiverfladen) | **Rådgiver som medlem.** Jonas 3/9: «jeg som rådgiver også skal have en virksomhed, hvor jeg kan switche imellem, om jeg vil se platformen som rådgiver, eller om jeg vil agere rådgiver eller være inde på min medlemsvirksomhed.» IKKE company-override («se en andens virksomhed»); rådgiveren ER selv medlem et sted og skifter hat. Jonas har i dag TO auth-brugere (rådgiver + medlemskonto på Topix.dk — dén modtog opslagsmailen). | konvergens §2.9, community-design §9 |
| driftsgæld | Fejlovervågning findes ikke; restore er aldrig afprøvet; `run-weekly-agent` står ikke i `cron.job`; 73 uploads bestod validering uden at blive committet; e-conomic-integrationen er død (migration-recon §10). | status-1-sept §6; den forrige overlevering (§7, før omskrivningen i #538) findes kun i git-historikken |

---

## DEL 4 · Fælder

De konkrete ting der har kostet tid. Led efter dem.

- **`Deno.cron` kører ikke på Supabases edge-runtime.** En funktion med
  kun `Deno.cron` kører aldrig. Påmindelser skal have en HTTP-indgang og
  planlægges med pg_cron (net.http_post + vault-nøglen
  `email_queue_service_role_key`).
- **Auth-indstillingerne ligger i Lovable, ikke i et Supabase-dashboard.**
  Cloud-fanen → Users → Auth settings → Email. «Auto-confirm email»
  vender modsat: TIL fjerner bekræftelsen (gjort 2/9). Supabase-MCP'en
  har ikke adgang.
- **`agent_runs.trigger`, ikke `trigger_type`.** Kostede en måling 2/9.
- **`invited_by` afgør hvis en invitation er.** En pending invitation
  med en anden `invited_by` end rådgiverens er virksomhedens egen
  (kolleger inviteres ind); den er ikke et hul. Læs kolonnen før du
  kalder noget et hul (indgangsfladen §12).
- **Et cron-job kan hedde noget andet end funktionen det kalder.** Søg på
  URL'en i `cron.job.command`, ikke kun på jobnavnet
  (`intro-session-reminder` → `intro-reminder-cron`).
- **`app_config.config_value` er JSON, ikke text.** `'""'::json` er en
  tom streng — parset `""`, rå `""` på to tegn. Dommen ligger i
  `laesVelkomstvideoGuid` (testet); brug den, gæt ikke.
- **En UPDATE der rammer nul rækker ser ud som succes uden `.select()`.**
  Tjek både `{ error }` og antal berørte rækker (FornyelsesSektion-
  mønstret). Samme fælde ramte velkomst-stemplet 2/9.
- **`void invalidateQueries` lukker en dialog før tilstanden er hentet.**
  Await invalideringen (eller refetch) FØR du lukker, ellers viser fladen
  det gamle i et render til.
- **En webhook der svarer 500 fejler STILLE for os.** Stripe prøver igen
  i timevis (doggybeds `customer.subscription.created` 2/9: fem
  gentagelser over 19 timer), og intet i vores egen flade eller log
  siger det. Stripes Workbench → Webhooks → Event deliveries er det
  eneste sted det ses. Kig der efter enhver ændring i en webhook-gren,
  og efter enhver migration.
- **En sortliste på `metadata.art` fejler stille, når en ny art
  tilføjes.** Webhookens subscription-grene sprang kun over ved
  indgang/fornyelse; doggybeds migrerede abonnement (art «migreret», 3/9)
  faldt igennem og ville have skrevet `subscription_status` på et fuldt
  medlem. Hvidliste, hvor det er muligt — og især hvor feltet styrer
  adgang eller tier (#563).
- **«1 active subscriber» i Stripes Billing overview er et ABONNEMENT,
  ikke en faktura.** En dag 31-faktura tæller ikke med der; de migrerede
  rateabonnementer gør.
- **Migrationshistorik er ikke bevis for produktionens tilstand.**
  Funktioner har kørt i prod uden fil (`hent_betalingsdata_til_checkout`
  indtil #524); cron-jobs var slukket i prod mens repoet schedulerede dem.
  Mål i `pg_proc`, `pg_policies`, `cron.job`.
- **Et filhoved beskriver hvornår det blev skrevet, ikke hvordan det er
  nu.** `intro-reminder-cron`s header sagde «havde aldrig kørt» længe
  efter den kørte dagligt.
- **Edge-runtimens `SUPABASE_SERVICE_ROLE_KEY` er en sb_secret uden
  JWT-claims.** En function-til-function-HTTP-kald mod en `verify_jwt =
  true`-funktion afvises i gatewayen. Del logikken i `_shared/` og kald
  den i samme proces (indgangsBetalingsmail-mønstret).
- **Radix-dialoger portalerer til `<body>`** uden for
  `.theme-hjemmebane` og arver appens mørke tokens. Hb-overlejringer
  bygges som `HbSidebarDrawer`: fixed, egen overlay, i DOM-træet.
- **Bunny er referrer-låst på library-niveau** til `app.theboardroom.dk`.
  En 403 i Lovables preview-domæne er ikke en fejl i vores kode.
- **PostgREST-embedding går én vej i huset:** fra child ind mod
  `companies` (`companies:company_id(...)`). Ingen kode henter
  `companies` med en embedded child-tabel.
- **`companies.status` har ingen CHECK**, og default `'active'` gør
  enhver ny (ubetalt) virksomhed «aktiv» fire steder. `is_membership_active`
  er fail-open på `contract_end_date IS NULL`.
- **Stripe:** `tax_behavior`/`interval` kan ikke ændres på en pris;
  `lookup_key` frem for price-id; `subscription_data[cancel_at]` findes
  ikke i Checkout; Checkout-sessioner lever 24 timer uanset databasen
  (nu 30 min); `enabled_events` på et webhook-endpoint ERSTATTER listen;
  delvis kundekopi kræver CSV uden overskrift.
- **CVR's branchekode er DB25, ikke DB07** (siden 1/1 2025; 738 koder på
  87 afdelinger, dansk underopdeling af NACE rev. 2.1). Designdokument
  og opgave blev skrevet mod DB07 fra hukommelsen; stikprøver mod
  cvrapi.dk 3/9 (`478100`, `953190`) fandt koder der kun findes i DB25,
  og DB07's afdeling 45 (biler) er nedlagt. Virksomheder slået op før
  2025 bærer stadig DB07-koder i `raw_cvr_data`. Et offentligt register
  kan være skiftet ud uden spor i repoet — slå op.
- **`invoice.created` må IKKE tilmeldes webhook-endpointet.** Stripe
  udsætter finaliseringen af fakturaer i op til 72 timer, hvis webhooken
  ikke svarer på det event — og det gælder ALLE kontoens fakturaer, ikke
  kun vores. Endpointet har seks events (3/9 eftermiddag):
  checkout.session.completed, customer.subscription.created/updated/
  deleted, invoice.paid, invoice.payment_failed.
- **En kreditnota på en betalt faktura skal være «Credit outside of
  Stripe»**, ikke kundesaldo — ellers efterlader den et tilgodehavende på
  kunden, som næste faktura modregner. Set 3/9 ved oprydningen af
  FLOOR1's testfaktura.
- **`application_context.raw_cvr_data` er IKKE hele cvrapi-svaret.**
  `hentCvrData` plukker felter ud, og kun dem gemmes. Skal et nyt felt
  bruges (som adressen 3/9), skal det læses ind dér — og feltnavnet
  måles mod cvrapi.dk, ikke huskes (`address`, `zipcode`, `city`).
- **`net.http_post` har 5 sekunders timeout som standard — og når
  klienten lukker forbindelsen, AFBRYDES edge-funktionen.** De to første
  berigelseskørsler 3/9 nåede kun fem CVR-opslag hver, alfabetisk fra A
  og frem; funktionen kørte ikke videre serverside, som man kunne tro.
  Løsningen er `timeout_milliseconds := 150000` på kaldet. Gælder
  ethvert langvarigt edge-kald fra SQL editoren.
- **Byg engangsjobs idempotent (udfyld kun tomt).** Det var dét, der
  reddede berigelsen: fire kald i træk fortsatte hvor det forrige slap,
  uden at røre det allerede satte.
- **Build-chattens «deployet ✅» er ikke et bevis; et kald er.**
  `berig-virksomheder` blev meldt deployet, men et kald gav 404
  NOT_FOUND — funktionen fandtes ikke. Efter et redeploy svarede den 401
  (auth-værnet), og så virkede den. Kald funktionen uden nøgle og se
  401, før du tror på deployet.
- **SQL editoren NÅR `auth`-skemaet.** Bevist 3/9: `DELETE FROM
  auth.users` virkede (efter `notifications` og `user_login_log`;
  `profiles` og `user_roles` fulgte i kaskaden). Det er vejen til en
  forældreløs bruger, når `admin-cleanup-test-data` ikke kan bruges —
  den funktion autentificerer en BRUGER (`getClaims` → `has_role`
  admin), ikke service-rollen, så vault-nøglen giver 401/403, og
  cron-mønstret med `net.http_post` virker IKKE på den. Vejen til
  `hardDeleteCompany` er /members' slet-dialog (`manage-advisor`
  `delete-company`), som ikke har dry-run — mål før.
- **Storage ryddes ALDRIG af koden.** `hardDeleteCompany` og ingen
  edge function kalder `storage.remove()`. Slet filerne FØR
  virksomheden, mens stien (`company_id`) er kendt, og gør det i
  Lovables Storage-flade — direkte `DELETE` på `storage.objects`
  blokeres af platformens `protect_delete`-trigger.
- **`profiles` er nøglet på `user_id`, ikke `id`.**
- **To betydninger af «sendt»:** `betalingsmail_sendt_at` betyder
  enqueued; `email_send_log.status = 'sent'` betyder leveret til Lovable.
  DLQ (TTL 60 min, fem forsøg) efterlader stemplet sat.
- **En tom edge function-log er et svar.** Er loggen tom, blev
  funktionen aldrig kaldt, og fejlen ligger i fladen — ikke i
  funktionen. Opslagsmailen 3/9 kl. 14:30: nul notifikationer, tom log
  for `notify-community-opslag`; koden var rigtig, browseren kørte den
  gamle CommunityView.
- **Et Update-klik er ikke nok, hvis browseren har gammel kode.** Hard
  reload FØR du beviser noget i frontenden — ellers beviser du det gamle.
  Andet forsøg efter reload: 27 notifikationer.
- **`git diff` lyver om merged grene — GitHub squasher.** Hverken
  `origin/main..gren`, `origin/main...gren` eller `git branch -d` kan
  se at arbejdet er inde under et andet commit-id. Spørg `gh pr list
  --state merged`. Og læs diff-retningen: «sletter 3267 linjer» betyder
  at grenen er ÆLDRE end `main`, ikke at den fjerner noget (3/9, to
  fejlslutninger). (DEL 1, «Git og Claude Code»)
- **Claude Code oprettede sin egen gren pr. opgave.** Fire forældreløse
  grene 3/9 eftermiddag, som ikke bar noget `main` manglede. Afgjort
  3/9: den opretter ikke grene; chatten dikterer grenen ved commit
  (DEL 0).
- **Kør HELE migrationsfilen i SQL editoren, ikke et uddrag.** 3/9 gav
  Claude en afkortet udgave af `20260903150000_company_traek.sql`;
  første kørsel tog kun `CREATE TABLE`, og RLS, policies og kommentar
  kom først da filen blev kørt i sin helhed. En tabel uden RLS er åben.
- **To Claude Code-vinduer må ikke skrive samtidig — heller ikke når
  den ene er dokumentation.** `git add -A` blander dem. Sker det
  alligevel: `git reset` det staged, og `git add` med navngivne stier.
  (3/9: en bogføring startet mens en kodeændring kørte; gik godt kun
  fordi den ikke nåede at skrive.)
- **En dom på `subscription_status` findes FEM steder, ikke tre.**
  `computeMembershipTier` i to TypeScript-kopier, `is_membership_active`
  (SQL, fail-open), `har_aktivt_medlemskab` (SQL, læser kun
  `contract_end_date`) og `har_aktivt_abonnement` (SQL, læser kun
  abonnementet). De to sidste er ikke dækket af nogen paritetstest, så
  en tier-ændring der kun rettes i de tre kendte spejle efterlader
  indholdsadgangen (community, indhold, events, storage) på den gamle
  dom. Målt 3/9 aften; `docs/adgangsdomme.md` §1.
- **Secrets kan IKKE læses i Lovable.** Målt 3/9 aften: værdierne er
  skjulte i fladen. Enhver måling der kræver at kende en secret (hvilken
  Calendly-konto `CALENDLY_API_KEY` tilhører, om `RAADGIVER_MAIL_TIL` er
  sat), skal gå gennem noget der BRUGER den — et kald, en log, et
  resultat — ikke gennem at kigge på den.
- **En gren bygget på `main` FØR en PR merges giver konflikt bagefter,
  fordi GitHub squasher:** samme indhold får to commit-id'er. Målt 3/9
  (#585, lukket uden merge som dublet). Vejen ud er ikke at flette, men
  at bygge grenen om med `cherry-pick` oven på en frisk `main`. Og:
  `git push origin --delete <gren>` fejler når GitHub allerede har
  slettet fjerngrenen ved merge — brug `;` og ikke `&&` mellem
  sletningerne, så den lokale sletning kører alligevel.
- **Policies kan opstå uden om repoet.** De fire demo-policies og
  kolonnen `companies.is_demo` stod ALDRIG i en migration — de blev
  lavet direkte i Lovable (grep på «Hide demo» og «is_demo» i
  `supabase/migrations/` 3/9: nul træffere). En gennemgang af
  migrationsfilerne kan derfor ikke svare på hvad RLS tillader.
  `pg_policies` i prod er den eneste kilde.
- **Dokumentationen kan være forkert om sikkerhed.** CLAUDE.md og
  SECURITY_BASELINE.md påstod begge at alle policies i `public` er
  RESTRICTIVE og stakker med AND. Målt 3/9: 0 restriktive ud af 268.
  Det er sandsynligvis derfor fejlen overlevede — den der læste
  dokumentet og tilføjede en «hide»-policy troede den strammede. Begge
  dokumenter er rettet (#591). Reglen: en policy der skal NÆGTE noget
  («hide», «skjul», «kun») er forkert hvis den er permissive.
- **En RLS-ændring skal bevises med en lånt identitet.** Måden er:
  `set_config('request.jwt.claims', json_build_object('sub', <uuid>)::text, true)`
  + `set local role authenticated`, derefter tælle hvad brugeren kan se
  mod hvad brugeren ejer, i ét resultatsæt (`UNION ALL`, SQL editoren
  eksporterer kun det sidste). Kør den som BÅDE et medlem og en
  rådgiver — ellers opdages det først i drift, hvis rettelsen lukkede
  for meget. Migration `20260903230000_demo_policies_restrictive.sql`
  bærer målingens tal og `pg_policies`-verifikationen; selve
  lånt-identitets-SQL'en står IKKE i repoet (kørt i SQL editoren 3/9) og
  skal skrives igen efter opskriften her.
- **To kendte, åbne sikkerhedspunkter med lavere alvor** (bogført i
  `supabase/SECURITY_BASELINE.md` §5, 3/9 sen aften, ikke rettet):
  (1) `messages` DELETE har ingen tidsgrænse overhovedet, og to
  overlappende policies ligger der («Members can delete own messages»
  og «Users can delete own messages», sidstnævnte bredest med
  `sender_id OR advisor`) — ingen indskrænkning tabes, men dubletten
  står. (2) Storage-policyen «Authenticated users can upload feedback
  screenshots» har `WITH CHECK` på `bucket_id` alene uden mappetjek, så
  enhver authenticated kan skrive til enhver sti i den bucket; læsning
  er ejermappe eller advisor. `chat-attachments` blev lukket 6/8 og
  mangler det IKKE.

---

## Beslutninger der står fast

Skal ikke genforhandles uden ny måling.

- **Fristen er kontraktens:** 30 dage fra underskriften. (indgangen §27)
- **Kommunikation kun ved «tilbyd».** Et medlem der ikke skal tilbydes
  fornyelse, får intet. (fornyelsesordningen §1)
- **To mails i to øjeblikke, aldrig samtidig:** betalingsmail ved
  underskrift, invitation efter betaling. (indgangen §21)
- **Vi viser ikke tomt indhold.** Uden video ingen velkomst, fem punkter.
- **Prisen ændres ikke når den først er sat** (409). Skal den rettes, er
  det en samtale. (indgangen §28)
- **Dag 31-fakturaen er det FULDE beløb, sendes FØR dag 31-mailen, og
  Stripes egne påmindelser slås ikke til** (`auto_advance=false`). Skal
  der rykkes, er det vores egen kæde. (indgangen §4, §30)
- **Stripe-testkunderne slettes ikke.** En kunde med faktura og
  kreditnota er ejer af regnskabsbilag, og bilag skal kunne læses. De
  tre testkunder er bogført og hører ikke til nogen virksomhed.
  (indgangen-overhaling §11)
- **«Gjort» betyder handling, ikke besøg.** (tjeklisten)
- **Ét forslag ad gangen** i «Dine aftaler». **En opgave er en udgang,
  ikke et mål.** **Medlemmet sætter datoen** ved accept (B6). **Ingen AI
  skriver i et menneskes navn.** **Klokken og feedback-knappen
  genindføres ikke.** **Rådgiverfladen tages samlet.**
- **Vi går ikke på kompromis** — hvert led bliver brugt af det næste.

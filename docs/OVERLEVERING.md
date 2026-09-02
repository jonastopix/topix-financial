# Overlevering

**Sidst opdateret: 2. september 2026, aften.**

Læses først i enhver ny samtale. Claude husker intet mellem samtaler;
denne fil skal kunne bære det. Den fortæller hvordan vi arbejder, hvor
vi står, hvad der venter, og hvilke fælder der har kostet tid — og peger
på det dokument der bærer detaljen. Detaljen bogføres DÉR, ikke her.

**Én regel har formet filen:** hver påstand er enten målt (med kilde),
eller mærket som ikke målt. En tidligere overlevering begyndte med en
sætning der var forkert, og det kostede en time.

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

### Dokumentation slås op

Ved tredjepartsværktøjer: slå op frem for at huske. Stripe især — otte
opslag på to døgn rettede otte antagelser (`cancel_at` i Checkout,
mailbekræftelse, kundekopi, moms-id, `proration_behavior`, expire-
endpointet, idempotency-nøgler, invoice-events). Supabase-MCP'en har
IKKE adgang til Lovable-projektet (`execute_sql` svarer «You do not have
permission») — prod måles i SQL editoren.

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

### Indgangen — alle led bygget 2/9

`docs/indgangen-design.md` §1–31 (§22–31 er dagens bogføring).

| led | fil | status |
|---|---|---|
| Monday «Godkendt» → virksomhed, prisniveau, token | `monday-webhook`, `_shared/mondayAnsoegning.ts`, `_shared/virksomhedsOprettelse.ts` | bygget; dedup på `monday_item_id`; e_mail-fejlen rettet (kolonnen hedder `email`) |
| dag 0-mail / rådgivermail | `_shared/indgangsBetalingsmail.ts`, `send-indgangs-betalingsmail` (Bucket B, kun manuelle kald) | bygget; kræver secret `RAADGIVER_MAIL_TIL` |
| udløser 2: rådgiver sætter pris | `saet-indgangs-prisniveau` (Bucket A) + `IndgangsSektion` på /members | bygget og bevist 2/9 |
| /betal, checkout, webhook | `Betal.tsx`, `hent_betalingstilbud`, `hent_betalingsdata_til_checkout`, `opret-indgangs-checkout`, indgangsgrenen i `stripe-webhook` (kontrakt, indgangspris, ophør, invitation) | bevist 2/9 med en gennemført betaling |
| påmindelser dag 14/25/31 | `indgangs-paamindelser-cron` (tørkørsel som standard) | bygget; **cron-jobbet er IKKE planlagt** |
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
«betalt»; dag 31-mailen lover en faktura ingen sender; «enqueued» stemples
som «sendt».

### Migrationen af abonnementerne — pilot gennemført, 13 venter

`docs/migration-recon-1-september.md` §1–25. 14 skal flyttes (ikke 18).
Piloten doggybed er flyttet 2/9 (`sub_1UB6wE3CvBmCx5Ptq3hHp2vt`, første
faktura 13/9 på 4.375 kr.). **Besluttet 2/9: de tretten andre venter til
trækket 13/9 er bevist gået igennem** — derefter i portioner. YKRG kan
ikke flyttes før kortet virker (§7). Kobling til `companies.id` er ikke
lavet (§16).

### Onboarding-tjeklisten — bygget 2/9

`src/lib/onboardingTjekliste.ts` (motor, 21 tests), `useOnboardingTjekliste`,
`HbOnboardingTjekliste` monteret i `HbMemberShell` (19 filer bruger shellen), «Kom
godt i gang» i sidebaren. Seks punkter når der er velkomstvideo, fem uden
(«vi viser ikke tomt indhold»). Velkomstvideoen sættes i `/admin/config`
(`app_config.velkomstvideo_guid`) og indlejres via `get-video-embed`
`{ velkomst: true }` — ingen content_items-række. Settings, Milestones og
PulseCheckin er AppLayout og har ikke boksen (accepteret).
Recon: `~/Downloads/recon-onboarding-tjekliste.md`, `recon-velkomstvideo.md`.

### Adgangsrejsen — trin 1–2 og mailbekræftelsen bevist i drift 2/9

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
rækkefølgen i dets §9. Mangler: mailbekræftelse slås fra i
Supabase Auth (uden for repoet; PPI's e-mail-fallback dør), Onboarding-
porten pensioneres (fem steder: App.tsx ×2, OnboardingRoute, useAuth,
main.tsx), /auth og /settings til Hjemmebane, de tre `valueCards` får et
hjem. Målt 2/9 i prod: `handle_new_user` er IKKE fail-closed på
`email_confirmed_at` og afviser signup uden invitation med P0001;
rådgivergrenen kommer først. CLAUDE.md er rettet (#537).

### Oprydningen 2/9

Otte udløbne virksomheder markeret `status = 'tidligere'`
(20260902113000); testvirksomheden slettet; gæster holdes ude af
Netværket med `vis_i_netvaerk` (20260902110000); `hent_betalingsdata_til_checkout`
bogført (den kørte kun i prod, #524). `companies.status` har ingen
CHECK-constraint — «tidligere» er en værdi der blev defineret i
migrationen.

### Platformen i tal (målt 1/9)

33 rigtige virksomheder, 14 uden ét målt tal, 13 har aldrig uploadet,
chatten bruges af 88 %, rapportering 56 %, KPI-mål 15 %.
`docs/status-1-september.md` og `docs/prioritering-1-september.md` bærer
facit og rækkefølge; `docs/chat-design.md` chattens form.

---

## DEL 3 · Det der venter

| hvornår | hvad | hvor det står |
|---|---|---|
| **10/9** | Fornyelsesordningen træder i kraft. Tre udløber inden og falder udenfor. | fornyelsesordningen.md §5, prioritering §1 |
| **13/9** | doggybeds træk på 4.375 kr. på den nye konto — MÅL at det gik igennem. Derefter flyttes de tretten i portioner. TuaMea (2/9), Floren engros og BR Roset (3/9) venter til efter egne træk. | migration-recon §25 |
| **29/9** | PHILBERTs fornyelse — beslutning skal registreres i FornyelsesSektion. Doggybed 13/10. | prioritering §1 |
| snarest | **Cron-jobbet `indgangs-paamindelser` (0 10 \* \* \*)** er ikke planlagt. Kommandoen står som kommentar i cronens filhoved; kør en tørkørsel i hånden først. Secret `RAADGIVER_MAIL_TIL` skal sættes. | indgangen-design §26 |
| snarest | **Dag 31-fakturaen**: ingen gren, og en manuel Stripe-faktura kan ikke kobles til en virksomhed (ingen `stripe_customer_id` før betaling). Skal oprettes af os selv med `metadata[company_id]`; `invoice.paid` skal tilmeldes endpointet (`enabled_events` erstatter hele listen). | indgangen-design §30, `~/Downloads/recon-invoice-paid.md` |
| snarest | **Månedstrækkene registreres ikke** — hverken rate 2–12 eller fejlede træk (`invoice.*` er ikke tilmeldt). Gælder også fornyelsen. Restancepolitikken er besluttet (past_due = åben, unpaid = lukket) og ikke bygget; kræver `computeMembershipTier` ændret fire steder samlet. | indgangen-design §31 |
| efter 13/9 | Migrationen af de 13 (billing_cycle_anchor, cancel_at, default_payment_method, YKRG's kort, kobling til companies.id). | migration-recon §16, §25 |
| åbent | **1:1-sessionernes Calendly-link efter kontoskiftet** — prisen `session_1on1` og `stripe-webhook`s Calendly-gren (`1to1-session-45`) er ikke efterprøvet på den nye konto. Noteret af Jonas 2/9; ikke målt i repoet. | — |
| åbent | **Velkomstvideoen skal optages** (Morten). Pladsen er bygget; GUID'et sættes i /admin/config. | recon-velkomstvideo |
| åbent | **Rundvisningen** — interaktiv førstegangs-oplevelse efter velkomsten; bygges efter C3-indflytningen; må aldrig eksistere ved siden af Guiden. | BACKLOG [P2·EPIC] Platform-onboarding |
| åbent | **Adminfladens overhaling** — rådgiverfladen tages samlet som ét epic, efter medlemsdesignet. /members har i dag IndgangsSektion + FornyelsesSektion i gammelt design. | prioritering §6 |
| åbent | Indgangens overhaling: branche-motor, porten ud, ankomsten (tjeklisten som fokuskort), /auth til Hb — tretten trin; trin 5 (mailbekræftelsen fra) bevist 2/9 kl. 21:56. | `docs/indgangen-overhaling.md` §9 |
| når ruten er bevist | **Testvirksomheden FLOOR1 I/S** (`fea24b90-…`, `jonas+test1/2/3@topix.dk`) skal fjernes helt: hardDelete med brugere + storage- og user_id-rester. | `docs/indgangen-overhaling.md` §11, `~/Downloads/recon-testvirksomhed.md` |
| åbent | Nudge-formen som designdokument, Community-opdagelse, Events (bekræftelse, kalender, lokation), Milepælene ud — rækkefølgen fra 1/9 står. | prioritering §2–5 |
| driftsgæld | Fejlovervågning findes ikke; restore er aldrig afprøvet; `run-weekly-agent` står ikke i `cron.job`; 73 uploads bestod validering uden at blive committet; e-conomic-integrationen er død (migration-recon §10). | status-1-sept §6, OVERLEVERING (forrige) §7 |

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
- **`profiles` er nøglet på `user_id`, ikke `id`.**
- **To betydninger af «sendt»:** `betalingsmail_sendt_at` betyder
  enqueued; `email_send_log.status = 'sent'` betyder leveret til Lovable.
  DLQ (TTL 60 min, fem forsøg) efterlader stemplet sat.

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
- **«Gjort» betyder handling, ikke besøg.** (tjeklisten)
- **Ét forslag ad gangen** i «Dine aftaler». **En opgave er en udgang,
  ikke et mål.** **Medlemmet sætter datoen** ved accept (B6). **Ingen AI
  skriver i et menneskes navn.** **Klokken og feedback-knappen
  genindføres ikke.** **Rådgiverfladen tages samlet.**
- **Vi går ikke på kompromis** — hvert led bliver brugt af det næste.

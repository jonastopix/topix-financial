# Overlevering

**Sidst opdateret: 2. september 2026.**

Læses først i enhver ny samtale. Den fortæller hvordan vi arbejder,
hvor vi står, og hvad der kommer nu — og peger på de dokumenter der
bærer detaljerne.

**Én regel har formet denne fil:** hver påstand er enten målt, eller
mærket som ikke målt. En tidligere overlevering begyndte med en sætning
der var forkert, og det kostede en time før nogen opdagede det.

---

## 1. Sådan arbejder vi

Jonas eksekverer alt teknisk. Claude er teknisk arkitekt og dikterer
præcis ét næste skridt ad gangen. Alt eksekverbart skrives direkte i
chatten — aldrig som en henvisning til en fil Jonas skal finde.

Reglerne står der fordi det modsatte har kostet noget konkret:

**Recon før kode.** Altid. Reconen har flere gange vist at opgaven var
en anden end den bestilte.

**Motor før flade.** Ren, testet logik før noget nogen kan trykke på.

**Mål, påstå ikke.** Og den skarpere version, lært 1/9: **fravær i
repoet er ikke fravær i drift.** Tre påstande faldt på præcis den fejl
samme dag — et cron-job der kørte mens dokumentet sagde det aldrig
havde kørt, tabeller der var droppet før listen udkom, et job der var
slukket i prod mens repoet stadig schedulerede det. Cron-tilstand måles
i `cron.job`. Politikker måles i `pg_policy`. Ikke i
migrationshistorikken.

**Én ting ad gangen — også i chatten.** Send aldrig to handlinger i
samme besked. Målt 1–2/9: det skete tre gange og kostede hver gang en
ekstra runde — en commit plus en recon-kommando, en SQL-kørsel plus en
terminal-kommando, og en commit der endte på `main` fordi
branch-oprettelsen blev sprunget over for at spare et trin.

**SELECT før alt destruktivt.** Før/efter-tal med faktiske tal på hver
ændring der sletter eller overskriver. Og den fulde form, lært 1–2/9:
**SELECT før, skriv, SELECT efter — og skriv før-værdierne ud i
svaret**, så de kan rulles tilbage uden at lede. Guard hver UPDATE på
den forventede nuværende værdi (`and cvr_number is null`, `and
contract_end_date = date '…'`), så en allerede rettet række rammer nul
frem for at blive overskrevet.

**Dokumentation slås op, den gættes ikke.**
`search_stripe_documentation` blev brugt fem gange 1–2/9 og rettede
hver gang en antagelse: at `cancel_at` kunne sættes fra Checkout, at
mailbekræftelse var nødvendig, at kundekopien var alt-eller-intet, at
et moms-id automatisk blev standard, og hvordan `proration_behavior`
virker med et fremtidigt anker. Fem antagelser, fem fejl.

**Spørg hvor et felt kommer FRA, og om kilden overlever.** 1/9 blev
indgangsprisen udledt af Monday-kolonnen «Pris på forlængelse» — en
kolonne der forsvinder når platformen overtager fornyelsen. Metoden
blev trukket tilbage samme dag (`docs/fornyelseskaeden-1-september.md`,
rettelsen). Et felt der bygger på noget der skal dø, dør med det.

**Ret dig selv højt.** Når en måling vælter en konklusion, trækkes den
tilbage eksplicit — også når den har ført til en beslutning.

**Rå diff læses før commit.** Beskrivelsen af en diff er ikke diffen.

**Dommen skal stå ét sted.** Fejlklassen der går igen: noget skrives,
noget læser det, og de to er ikke enige.

**Intet lever kun i chatten.** Beslutninger og fund havner i
`BACKLOG.md`, designdokumenterne og `SECURITY_BASELINE.md` — også dem
vi valgte fra, og hvorfor.

**Vi går ikke på kompromis.** Ikke som ambition, men som nødvendighed:
hvert led bliver brugt af det næste.

### Deploy-kæden — merge er ikke deploy

| ændring | hvad der kræves |
|---|---|
| frontend (`src/`) | **Update-klik i Lovable** efter merge, når synken har commit'en |
| eksisterende edge function | ruller med merge |
| **ny** edge function | **skal rulles ud eksplicit** — målt 31/8: `foreslaa-opgave` svarede 404 efter merge |
| ændring der trækker en **ny delt fil** ind (`_shared/…`) | **ruller heller ikke med merge** — målt 1/9 på `_shared/stripePris.ts`. Verificér altid at funktionen svarer noget andet end 404, før noget bygges på den |
| migration | **køres manuelt** i Lovable SQL editor. Auto-deployer aldrig |
| SQL-måling | køres manuelt |

**CI-verifikation:** altid `gh run list --branch`, aldrig `gh pr
checks` alene. Vercel-appen opretter check-suites der hænger i `queued`
for evigt og får kommandoen til at melde falsk tomt.

**I Lovable SQL editor kører hele scriptet i én transaktion.** DDL og
en `rollback`-måling må derfor aldrig stå i samme script — lært 31/8,
hvor en `create policy` blev rullet tilbage sammen med målingen.

**Lovable SQL editor eksporterer kun det SIDSTE resultatsæt.** Flere
`SELECT` i én kørsel giver kun det sidste i CSV-eksporten — lært 1/9.
Skal flere ting måles på én gang, samles de i ÉT resultatsæt med `UNION
ALL` og en `sektion`-kolonne, med alle grene castet til samme
kolonneantal og -type.

### Værktøjer

Repo `jonastopix/topix-financial` i `~/topix-financial`. Claude Code i
terminalen med `/model fable`; output skrives til `~/Downloads/` og
uploades som fil. Test: `bun run test`. Typecheck: `bunx tsc --noEmit
-p tsconfig.app.json` (uden `-p` checkes nul filer). Fire
baseline-typefejl er kendte og dokumenterede.

**Hvornår hvad — lært 1–2/9:**

- **Shell** (heredoc, `cat`, `grep`) til at LÆSE, og til rene datadumps
  hvor hvert tegn er kendt på forhånd. En heredoc er ordret pr.
  konstruktion; en model skriver tal af.
- **Claude Code** til at ÆNDRE kode, og til recon der kræver at følge
  tråde på tværs af filer — den fanger sammenhænge en
  enkeltfilslæsning ikke gør. Målt 1–2/9: den stoppede korrekt fordi
  `fornyelse.ts` ikke var spejlet, og den fandt selv at
  `customer.subscription.deleted` manglede samme værn som
  `created`/`updated`.
- **Ved recon: bed den udtrykkeligt om KUN at rapportere fund** — ingen
  forslag, ingen vurdering. Ellers blandes måling og mening.
- **Kodeblokke bærer destinationen som almindelig tekst OVER blokken**,
  ikke som en `#`-kommentar inde i den. Zsh læser ikke `#` som
  kommentar interaktivt: «# TERMINAL (ikke SQL editor)» gav
  `command not found: #` og `unknown file attribute: i`.

### Stripe — målt 1.–2. september

Egen konto `acct_1U6mzp3CvBmCx5Pt` siden 1/9. Det der kostede en runde
at lære:

- **Hvert MCP-kald kræver eksplicit `stripe_context` OG `livemode:
  true`.** Uden begge rammer man den forkerte konto eller testdata.
- **`tax_behavior` kan IKKE ændres på en pris.** Heller ikke `interval`
  eller `interval_count`. Forkert sat betyder ny pris og flytning af
  alle abonnementer der bruger den.
- **`lookup_key` frem for hardkodede price-id'er.** Et price-id er
  konto-specifikt og brækker ved kontoskifte; en nøgle er en rolle.
  Den gamle kode havde fejlen to steder.
- **`subscription_data[cancel_at]` findes IKKE som Checkout-parameter**
  — `parameter_unknown`, målt i produktion 1/9. Ophør sættes på
  abonnementet bagefter, fra dets faktiske `start_date`
  (`stripe-webhook`).
- **Delvis kundekopi kræver en CSV UDEN overskriftslinje.**
- **Ny delt fil ruller ikke med merge** — se deploy-kæden ovenfor.

---

## 2. Hvad platformen er

The Boardroom, `app.theboardroom.dk`. Dansk erhvervsrådgivning,
invitation-only. Cirka 33 medlemsvirksomheder, to rådgivere: Jonas og
Morten.

**Målet:** hundrede virksomheder med to rådgivere, uden at
rådgivningen bliver tyndere. Det kræver at platformen selv ved hvor
hver virksomhed står.

**Designsproget hedder Hjemmebane** — varmt papir, Fraunces til
overskrifter, hairlines, evergreen til handlinger, rust til fire
bestemte betydninger og ikke en femte. Tokens er scoped til
`.theme-hjemmebane`. Detaljer i `docs/hjemmebane-designsprog.md`.

**Konverteret:** forsiden, KPI'er, Rapportering, Budget, Handouts,
Akademiet, Events, Netværket, Community, og siden 31/8 medlemmets chat.

**Ikke konverteret:** loginsiden, Indstillinger, Pulse, Guide, Legat,
og hele rådgivermiljøet.

---

## 3. Hvor vi står

Grundlaget er tre dokumenter, i denne rækkefølge:

1. **`docs/status-1-september.md`** — mangellisten fra 27/8 målt mod
   koden. Femten punkter løst, seks påstande trukket tilbage, to nye
   spor. Det er facit, ikke mangellisten.
2. **`docs/prioritering-1-september.md`** — rækkefølgen og
   begrundelserne.
3. **`docs/chat-design.md`** — C1 til C13, chattens besluttede form.

Dertil tolv recon-noter i `docs/`, alle øjebliksmålinger med dato.

### Målt 1. september

| | |
|---|---|
| Virksomheder | 33 rigtige |
| Uden ét målt tal | 14 |
| Har aldrig uploadet en fil | 13 |
| Aktuelle (≤1 måned bagud) | 6 |
| Bruger chatten | 88 % |
| Bruger rapportering | 56 % |
| Bruger KPI-mål | 15 % |

**Chatten er den eneste funktion et flertal bruger.** For fem
virksomheder er den den eneste berøringsflade der findes — og alle fem
har nul målte måneder.

---

## 4. Hvad der kommer nu

Fuld begrundelse i `docs/prioritering-1-september.md`. Kort:

**To beslutninger blokerer syv spor, og de koster nul udviklingstid.**
Indgangsprisen som data blokerer hele fornyelseskæden. Nudge-formen
blokerer Community-opdagelse, events-påmindelser og
onboarding-sekvensen.

1. **Fornyelseskæden** — har en dato: ordningen træder i kraft 10/9.
2. **Nudge-formen som designdokument** — ikke kode.
3. **Community-opdagelse** — et nyt opslag udløser i dag ingenting.
4. **Events** — bekræftelse, så kalender, så lokationsfelt.
5. **Milepælene ud** — B9-migreringen, så pensionering af
   `/milestones`.
6. **Rådgiverfladen som ét epic** — Jonas' udtrykkelige ønske: samlet,
   ikke stykvis.

**Fire små ting undervejs**, fordi de bløder dagligt og blokerer
intet: intro-påmindelsens stempel før afsendelse,
`weekly_focus.seen_at` som dødt felt, `deriveFocus` der ikke kender
«aldrig begyndt», og et `DEPLOY_STAMP` der lyver.

---

## 5. Fejlklasser der går igen

Disse er fundet mange gange. Led efter dem.

**Amputeret beregning.** Noget bygges færdigt og kobles aldrig til en
flade. Mindst syv tilfælde, senest `community_visninger` og
`registrer_community_visning` med nul kaldesteder. **Kontrollér at en
beregning har en aftager, før den bygges.**

**Skrivning uden læser.** En tabel med INSERT- og DELETE-politik men
ingen SELECT — reaktioner blev skrevet i fem måneder og aldrig vist.
Rodårsag: et `DROP ... CASCADE` åd politikken uden spor i historikken.
**CASCADE-drops skal efterfølges af en `pg_policies`-diff i prod.**

**To skrivere, to betydninger.** `notifications.seen_at` sættes både
når nogen åbner klokken og når en rapport slettes. Enhver andel læst ud
af feltet er derfor delvis fiktion.

**Klient-filter som eneste beskyttelse.** Rådgiverens
session-forberedelse blev hentet ned i medlemmets browser og skjult i
renderingen. Lukket 31/8 med RLS.

**Stille skrivninger.** Klient-writes der rammer nul rækker og ikke
fejler. Tjek altid både `{ error }` og antal berørte rækker.

**Eksisterende felter overset.** Tre gange 1–2/9 blev et felt foreslået
som allerede fandtes: `companies.intro_reminder_last_sent_at`,
`company_invitations.accepted_at`, og to `lookup_invite_*`-funktioner
hvor der blev antaget én. **Før et felt foreslås: grep på dansk OG
engelsk, og list alle kolonner der nogensinde er lagt på tabellen** —
`ALTER TABLE … ADD COLUMN` er spredt over mange migrationer og ses ikke
i én `CREATE TABLE`. (`~/Downloads/recon-betalingslink.md` §1 har den
fulde liste for `companies`, 33 kolonner.)

**Påstået fravær uden måling.** «Der findes ikke et sted hvor det kan
ses» — der fandtes en `MembersOnboardingFunnel`. Søsteren til «fravær
i repoet er ikke fravær i drift»: fravær i hukommelsen er ikke fravær i
repoet. Et «findes ikke» skal bære den grep der viste det.

**Margin i den forkerte retning.** `cancel_at` blev først sat til start
PLUS 1 dag, hvor det skulle være MINUS 1 dag — rate12 ville have fået
et trettende træk. Rettet 1/9. **Regnestykket skrives ud i
kommentaren, ikke kun resultatet:** «rate12 trækker i måned 0–11,
næste træk ville falde i måned 12, start + 12 måneder − 1 dag rammer
efter sidste aftalte træk og før det næste.»

**Bygget videre på en kilde der skal dø.** Se «Spørg hvor et felt
kommer FRA» i §1. Fejlklassen: en kolonne der er midlertidig, bruges
som grundlag for noget varigt, og det holder kun så længe ingen fraviger
reglen — Nordic By Hand var allerede undtagelsen.

---

## 6. Beslutninger der står fast

Skal ikke genforhandles uden ny måling.

**Kommunikation kun ved «tilbyd».** Et medlem der ikke skal tilbydes
fornyelse, får intet — ingen varsel, ingen forklaring. Statussen
`klar_til_afsked` er en intern dom, ikke en besked.
(`docs/fornyelsesordningen.md` §1)

**Ét forslag ad gangen** i «Dine aftaler». Ti forslag er ikke ti
muligheder, det er en liste man scroller forbi.

**En opgave er en udgang, ikke et mål.** Sparring har værdi i sig selv.
Produktet spørger ikke «skal det være en opgave?» efter hver samtale.

**Medlemmet sætter datoen** ved accept. En dato medlemmet ikke selv har
valgt, er ikke en forpligtelse. (B6)

**Ingen AI skriver i et menneskes navn.** Reflection-nudgen er slukket
for godt, med samme begrundelse som nedlagde engagement-nudgen.

**Klokken og feedback-knappen genindføres ikke.** Begge målt: en kanal
der kun virker når brugeren allerede er på vej, er ikke en nudge.

**Rådgiverfladen tages samlet**, efter medlemsdesignet er færdigt.

---

## 7. Det der ikke er målt

Ærlighed om huller, så ingen bygger på dem.

- **Ydeevnen.** Ingen måling findes. AdvisorDashboard henter hele
  databasen og filtrerer i JavaScript.
- **Fejlovervågning.** Findes ikke. Alt hvad vi har fundet, er fundet
  ved at nogen gravede.
- **Restore.** Aldrig afprøvet. En backup man ikke har brugt, er en
  antagelse.
- **`run-weekly-agent`** står ikke i `cron.job` — den kører formentlig
  aldrig. Ikke bekræftet.
- **Godkendelsestrinnet:** 73 uploads bestod validering og blev aldrig
  committet. Målingen af hvorfor er ikke lavet.
- **PHILBERTs ventende uploads** — driftshandling, ikke bogført som
  taget.

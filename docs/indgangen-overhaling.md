# Indgangens overhaling — fra invitationslink til Dit Boardroom på to skærme

**DESIGNDOKUMENT — intet af det beskrevne er bygget.** Beslutningerne er
truffet af Jonas 2. september 2026 om aftenen. Samme regel som
`docs/indgangsfladen-design.md`: hver påstand er enten målt (med kilde),
eller mærket som ikke målt/forslag/åben. Reconerne bag ligger uden for
repoet (`~/Downloads/recon-adgangsruten.md`, `recon-branche.md`,
`recon-contact-person.md`); de målte fund er skrevet ind her, så
dokumentet står alene.

Afgrænsning: `docs/indgangen-design.md` bærer kæden FØR invitationen
(underskrift → betaling → invitation). `docs/indgangsfladen-design.md`
§1–8 er den første designblok for kæden EFTER, og §9–13 bogfører trin
1–2 (opslaget bærer mail og navn, /auth forudfylder) som bevist i drift
2/9 kl. 20:30. Dette dokument afløser §1–8's «to skridt» med den
fulde overhaling: ruten, mailbekræftelsen, porten, ankomsten, branchen
og de dårlige dage. Hvor de to dokumenter siger det samme, gælder dette.

---

## 1. Ruten i dag — målt

**Seks skærme fra klik i invitationsmailen til Dit Boardroom** (målt i
repoet 2/9 aften, `recon-adgangsruten.md` §1, med mailbekræftelse slået
til som i produktion):

| # | skærm | fil | design |
|---|---|---|---|
| S1 | Signup: navn (forudfyldt, redigerbart), mail (forudfyldt, låst), adgangskode | `src/pages/Auth.tsx:287-463` | gammelt |
| S2 | «Tjek din mail» — én knap «Tilbage til login» | `Auth.tsx:262-279` | gammelt |
| — | (klik i bekræftelsesmailen → lander på `/`) | `emailRedirectTo: window.location.origin`, `Auth.tsx:136` | — |
| S3 | Helskærms-spinner mens `useAuth` afgør tilstanden | `App.tsx:91-95` | gammelt |
| S4 | Onboarding trin 1: navn IGEN (forudfyldt fra profilen), branche (valgfrit) | `src/pages/Onboarding.tsx:131-204` | gammelt |
| S5 | Onboarding trin 2: tre værdikort, «Upload min første rapport» / «Se dashboardet først» | `Onboarding.tsx:205-240` | gammelt |
| S6 | Dit Boardroom | `Index.tsx:246-250` → `HbMemberShell` + `BoardroomView` | Hjemmebane |

**Rettelse til briefen:** «Konto oprettet — Vi logger dig ind nu…»
(`Auth.tsx:256-261`) er IKKE en syvende skærm. Den og «Tjek din mail» er
to gensidigt udelukkende grene af samme tilstand (`Auth.tsx:146`:
`setSignupResult(data.session ? "auto" : "confirm")`). Med bekræftelse
slået til ser medlemmet aldrig «Konto oprettet»; slås bekræftelsen fra
(§3), ser de aldrig «Tjek din mail». Ruten er seks skærme i dag, og
«Konto oprettet» bliver den mellemskærm der skal væk i morgen.

Navnet tastes to gange: S1 forudfylder fra invitationen
(`lookup_invite_company_info` → `kontakt`, `Auth.tsx:101-102`), S4 beder
om samme værdi igen (`Onboarding.tsx:151-158`, forudfyldt fra
`profile.full_name`, som triggeren satte fra S1). Fem af seks skærme er
gammelt design; kun den sidste er Hjemmebane (`recon-adgangsruten.md` §6).

**Mailbekræftelse er slået til.** Målt af Jonas i prod: signup 1/9 kl.
22:06:40, `confirmation_sent_at` +0,24 sek., `email_confirmed_at` +28 sek.
Repoet kan ikke se indstillingen (ingen `[auth]` i `supabase/config.toml`).

**Velkomstvideoen er ikke sat.** Målt: `app_config.velkomstvideo_guid`
er tom streng. Overlejringen vises kun med video
(`HbOnboardingTjekliste.tsx`, `harVelkomstvideo && velkomstvideo_set_at
=== null`), så medlemmet lander uden nogen ankomst: Dit Boardroom med en
sammenfoldet tjeklistepille nederst til højre (`udfoldet=false`,
`HbOnboardingTjekliste.tsx:181`).

---

## 2. Målet — BESLUTTET: to skærme

**Signup, derefter Dit Boardroom.** Alt derimellem skal væk eller ske
uden at mennesket ser det. Det betyder konkret:

- S2 («Tjek din mail») forsvinder med mailbekræftelsen (§3).
- «Konto oprettet — Vi logger dig ind nu…» (auto-grenen) må ikke blive
  en ny mellemskærm: `AuthRoute` (App.tsx:192) og Auth.tsx' egen lytter
  (:48-68) sender begge videre så snart sessionen findes; grenen skal
  vise intet eller det samme visuelle som S1 i låst tilstand, indtil
  navigationen sker. Ikke målt hvor længe grenen står i dag.
- S3 (spinneren) bliver ved med at findes teknisk, men i Hjemmebane og
  uden at være en skærm nogen læser — og aldrig uden udgang (§7).
- S4 og S5 forsvinder med porten (§4).
- S6 bærer ankomsten (§5).

---

## 3. Mailbekræftelsen slås fra — BESLUTTET

**GJORT 2/9 kl. ca. 21:54 — bevist i drift kl. 21:56 (§9 trin 5).**

**RETTELSE 2/9 aften:** indstillingen ligger IKKE i et Supabase-
dashboard. Projektet er Lovable Cloud, og indstillingen findes i
Lovable: Cloud-fanen (+ ved siden af Preview) → Users → Auth settings →
Email. Den hedder **«Auto-confirm email»** og vender MODSAT: den skal
slås TIL for at fjerne bekræftelsen. Lovables dokumentation:
docs.lovable.dev/features/email-auth. Supabase-MCP'en har ikke adgang
til projektet. Ingen kode; en driftshandling, bogført her.

**Bevis (test-signup `jonas+test1@topix.dk`, 2/9 kl. 21:56, SQL editor):**

- `confirmation_sent_at = NULL` — ingen mail afsendt.
- `email_confirmed_at` sat 0,25 sek. efter `created_at`.
- «Tjek din mail» blev aldrig vist; brugeren blev logget ind straks.
- Til sammenligning, signup 1/9 kl. 22:06:40: `confirmation_sent_at`
  +0,24 sek., `email_confirmed_at` +28 sek.

Triggeren koblede korrekt: profil med navn, `company_members` med rolle
`'member'` (ikke `'owner'`, fordi invitationen bar `company_id`),
invitationen `accepted` med `accepted_at` og `accepted_by`, én
conversation. Testopstillingen står i §11.

**Begrundelse, skrevet ud:** bekræftelsen beskytter ingenting i vores
kæde.

- `handle_new_user` har ingen betingelse på `email_confirmed_at` (målt
  2/9 i `pg_proc`, bogført i CLAUDE.md:87-91). Profil, `company_members`,
  samtale og invitationens `status = 'accepted'` skrives i AFTER INSERT
  på `auth.users` — altså FØR nogen bekræfter noget (migration
  `20260319101733:62-101`).
- Tokenet er 122 bit (`gen_random_uuid()`, migration
  `20260225103844:8`) og er sendt til netop den mailadresse invitationen
  bærer. Mailfeltet på /auth er låst til samme adresse
  (`Auth.tsx:94-98`, `readOnly` :388). Den der har tokenet, har adgang
  til postkassen; bekræftelsen beviser det samme én gang til.
- I dag er konsekvensen af bekræftelsen alene en ekstra skærm, en mail
  mere og 28 sekunder (målt 1/9).

**Følge der noteres:** `process-pending-invitation`s e-mail-fallback dør.
`:94-95` kræver `verifiedEmail && emailConfirmed` før opslag på
`company_invitations.email`. Med Auto-confirm slået til sætter Auth
`email_confirmed_at` ved signup — **målt 2/9 kl. 21:56: +0,25 sek.**
— så betingelsen er stadig sand; men designet må ikke hvile på det. Fallbacken er alligevel død på hovedruten: triggeren har allerede
sat invitationen til `accepted`, så PPI's token-opslag (`:85-91`,
`status='pending'`) finder intet, og e-mail-opslaget (`:101-107`, også
`pending`) heller ikke. PPI er kun relevant når triggeren IKKE koblede
virksomheden, og der svarer den `no_pending_invitation` → blindgyden i
§7.1. Det er den, der skal lukkes — ikke fallbacken der skal reddes.

**Google-vejen** (`Auth.tsx:165-181`) er urørt af beslutningen: tokenet
ligger kun i `redirect_uri`, triggeren falder til e-mail-match. Åbent
punkt (§10).

---

## 4. Onboarding-porten pensioneres — BESLUTTET

Porten er `src/pages/Onboarding.tsx` (S4+S5) og alt der sender derhen
eller læser dens stempel. Målt (recon-adgangsruten §2), det er SEKS
steder:

| sted | hvad | hvad der sker med det |
|---|---|---|
| `Onboarding.tsx` | siden | slettes |
| `App.tsx:221` `OnboardingRoute` + ruten `/onboarding` | guard + rute | slettes; `/onboarding` må ikke 404'e for gamle links i mails/bogmærker — redirect til `/` (som `/rapportering` → `/reports`, App.tsx:303) |
| `App.tsx:84` (`ProtectedRoute`) og `:97` (`MemberRoute`) | `needsOnboarding && !isAdvisor → /onboarding` | linjerne fjernes |
| `useAuth.tsx:194-218` | `needsOnboarding`, `tbr.onboarded`-flaget, `setOnboardingComplete` | `needsOnboarding` og flaget fjernes fra kontrakten; `onboarded_at` beholdes som stempel (nedenfor) |
| `main.tsx:24-33` | pre-React bounce fra `/onboarding` når `tbr.onboarded === "1"` | slettes |
| `Onboarding.tsx:40-45` | eget sikkerhedsnet | forsvinder med filen |

**Hvad porten indsamler, og hvor det flytter hen** (afgjort i
`docs/indgangsfladen-design.md` §3, står fast): branchen møder medlemmet
INDE på platformen — nu udledt af CVR (§6) og ellers spurgt via
tjeklisten; navnet er allerede tastet på S1; de tre værdikort
(`Onboarding.tsx:113-129`) har intet hjem — åbent punkt (§10).

### KRITISK KONSEKVENS: onboarding-agenten

Agenten (`run-company-agent`, `trigger: "onboarding"`, dry_run) fyres i
dag to steder, målt:

- `Onboarding.tsx:83-107`: i samme handler som skriver
  `profiles.onboarded_at` (:53-59), og kun hvis den skrivning lykkedes
  (:61-65). Betingelse: `companies.onboarding_completed === false &&
  application_context`.
- `useAuth.tsx:248-273`: ved hvert login, betingelse
  `onboarding_completed === false && application_context &&
  profileOnboarded` — hvor `profileOnboarded = !!profiles.onboarded_at`
  (:194).

`profiles.onboarded_at` sættes i dag KUN af `Onboarding.tsx:57` og af
`create-legat-enrollment:86` (målt: grep i `src` + `supabase/functions`).
Kolonnen er `DEFAULT NULL` (migration `20260226125413:1`);
`handle_new_user` sætter den ikke (migration `20260319101733:62-63`).

**Forsvinder porten uden at stemplet sættes et andet sted, fyrer
agenten aldrig for nye medlemmer:** Onboarding.tsx' kald er væk med
filen, og useAuth's kræver et stempel ingen længere skriver.

### BESLUTTET 2/9 aften: stemplet flyttes IKKE — betingelsen rettes

**Beslutning (Jonas, 2/9 aften):** `profileOnboarded` fjernes fra
agentens betingelse i `useAuth.tsx:254`, så den bliver
`onboarding_completed === false && application_context` — nøjagtig den
betingelse `Onboarding.tsx:89` allerede bruger i dag UDEN
`profileOnboarded` (målt, `recon-onboarded-at.md` §4). Vi fjerner altså
ikke et værn; vi retter en uoverensstemmelse mellem to kaldesteder.
`onboarding_completed` sættes til `true` i samme greb (:256-259, før
kaldet) og forhindrer selv gentagelse. Grenen ligger i `fetchUserData`
inde i `if (cm?.company_id)` (:221) og evalueres kun med en session og
en `company_members`-række — «medlemmet er inde» er allerede sandt når
den kører.

`profiles.onboarded_at` holder op med at blive skrevet når porten dør.
Kolonnen bliver stående med sin historik — den slettes ikke.
`create-legat-enrollment:82-87` bliver ved at stemple ubetinget; det er
uden virkning, fordi `needsOnboarding` allerede er falsk for
legat-brugere alene på `legatActive` (`useAuth.tsx:205`).

**Forkastet: at flytte stemplet til `useAuth`** (det tidligere forslag
her). Det holdt liv i et felt hvis eneste opgave var at gøre en
betingelse sand, og lagde en klientskrivning der kan fejle stille ind i
den vej agenten afhænger af.

**Forkastet: at lade `handle_new_user` stemple.** FORBIDDEN-listen
(CLAUDE.md:95-98), og stemplet ville blive identisk med `created_at` og
dermed betydningsløst.

**Målt 2/9 kl. 21:18 (Lovable SQL editor):** 42 af 43 profiler har
`onboarded_at` sat. Den ene uden er Morten Larsen, rådgiver uden
virksomhed — korrekt uden stempel. 39 profiler er koblet til en
virksomhed via `company_members`. Der findes altså ikke ét medlem der
mangler stemplet, og ingen bliver berørt bagudrettet.

**Målt i repoet (`recon-onboarded-at.md`, hele filen):** alt der
afhænger af feltet går gennem `useAuth.tsx:194`. Derfra to veje:
`needsOnboarding` (App.tsx:84, :97, :182, Onboarding.tsx:42, og
localStorage-flaget `tbr.onboarded` i main.tsx:27 og App.tsx:161) og
`profileOnboarded` (agent-udløseren useAuth:254). Ingen SQL, intet view,
ingen RPC, ingen RLS-policy, ingen trigger, ingen anden komponent og
ingen anden edge function læser feltet. Det indgår ikke i
auth-kontraktens `profile`-type. Skriverne er to: Onboarding.tsx:53-59
og create-legat-enrollment:82-87, plus engangs-backfillen
`20260226125413:4`. Begge veje forsvinder med porten (§4-tabellen);
den anden erstattes af den rettede betingelse ovenfor.

### Agentens baseline — målt 2/9 kl. 21:58

Da porten blev gennemført af testbrugeren (§11) kl. 21:58, fyrede
onboarding-agenten korrekt: `agent_runs` én række, `trigger =
'onboarding'`, `mode = 'dry_run'`, 2 iterationer, `stop_reason =
'finish'`, `produced_output = true`, 4,8 sekunder. Fem forslag
registreret og intet udført: to milestones, én company_action, én
weekly_focus, én session_prep. **FØR porten blev gennemført var
`agent_runs` 0** — et levende bevis på at trin 6 skal bevises før trin 7
(§9): forsvinder porten uden den rettede betingelse, står tælleren på 0
for hvert nyt medlem.

Det tomme branchevalg i porten skrev intet: `industry_code` forblev NULL
og `industry_label` uændret, som `recon-branche.md` §3 forudsagde.

Fund undervejs, bogført i BACKLOG.md (2/9): `agent_runs`' kolonne hedder
`trigger`, ikke `trigger_type`; og agenten kalder sine værktøjer med
virksomhedens NAVN i `company_id`-argumentet, mens de gemte forslag
bærer det rigtige UUID.

---

## 5. Ankomsten — BESLUTTET 2/9 aften: tjeklisten forfremmes til fokuskort

### Forsiden ved nul data — målt (`recon-forsiden-nul-data.md`)

- **Der findes INGEN gren for nyt medlem i medlemsfladen.** Hilsenen
  (`BoardroomView.tsx:139-145`, klokkeslæt `:77-83`, navn `:1832`) er
  ens ved første og hundrede besøg. Det eneste der sker første gang, er
  to usynlige stempler: `profiles.tour_completed_at` (`Index.tsx:169-181`,
  læses ingen andre steder) og `hb.forside.lastVisitAt` i localStorage
  (`BoardroomView.tsx:1389-1398`, tier «nye ting»-linjen).
- **Fokuskortets slot (a) `missing-report` fyrer ALTID for et
  nul-data-medlem** (`nextStep.ts:166-180`) og kender ikke virksomhedens
  `created_at`/`contract_start_date`: en virksomhed oprettet i går bliver
  bedt om forrige måneds tal («Upload dine august-tal» i september).
  Slot (i) «Fortæl de andre hvad du er god til» fyrer også. Fallbacken
  «Alt er ajour» (`BoardroomView.tsx:1269-1280`) kan et nyt medlem
  aldrig nå.
- **Tjeklisten starter altid sammenfoldet** (`HbOnboardingTjekliste.tsx:181`,
  `useState(false)`), gemmes ingen steder og nulstilles ved hver
  navigation. Målt for testvirksomheden (§11): «1 af 5» — punktet «Din
  virksomhed» gjort, hvilket efter motoren kræver website, branche OG
  CVR (`onboardingTjekliste.ts:110-113`).
- **Velkomstoverlejringen kan aldrig vises i dag**: `velkomstvideo_guid`
  er tom (målt 2/9), og `harVelkomstvideo` er første led i alle tre
  betingelser.
- **De tre redaktionelle sektioner** (Kommende, Fra fællesskabet, Fra os
  til dig) er globale og skjuler sig pænt når de er tomme
  (`BoardroomView.tsx:1947`, `:1997`, `:2038`).
- **Community-adgang kræver `contract_end_date` i fremtiden**
  (`har_aktivt_medlemskab`, migration `20260811160000:26-41`): et medlem
  oprettet via standalone-invitation får `INSERT INTO companies (name)`
  uden slutdato og dermed tomt feed — tomt og «ingen adgang» kan ikke
  skelnes (`communityApi.ts:75-77`).
- «Dine tal» står nederst med «Ingen godkendte tal endnu — upload din
  første rapport, så fylder vi båndet ud.» (`BoardroomView.tsx:906-925`).

### Beslutningen (Jonas, 2/9 aften) — står fast

**Ankomsten bliver IKKE en velkomstblok lagt oven på forsiden.** (Den
form dette afsnit beskrev tidligere samme aften — velkomstblok + udfoldet
tjekliste + plads til video — er FORKASTET.) I stedet skifter
fokuskortet kilde ved nul data: **TJEKLISTEN FORFREMMES FRA PILLE TIL
FOKUSKORT.** «Dit næste skridt» viser første ikke-gjorte tjeklistepunkt
stort og resten som linjer — samme form kortet allerede har (#1 stort,
#2–4 som linjer, `FocusCard`). Motoren `byggTjekliste` findes; det er
fokuskortets førsteprioritet der skal ændres.

- **Hilsenen får en gren:** «Velkommen, {fornavn}.» så længe intet er
  gjort.
- **Slot (a) skal kende `contract_start_date`,** så der ikke bedes om
  tal fra før virksomheden fandtes.
- **Varighed — VALGT A:** ankomsten varer indtil tjeklisten er færdig
  (alle punkter gjort), derefter almindelig prioritering. Markøren for
  «ankomst» er dermed tjeklistens egen tilstand (`byggTjekliste(...).faerdig`,
  data pr. medlem) — ingen ny kolonne, intet localStorage.
- **Videoen** glider ind som tjeklistepunktet «Se velkomsten» når
  `velkomstvideo_guid` sættes (punktet findes allerede i motoren og
  filtreres fra uden video, `onboardingTjekliste.ts:174-176`); dermed
  bliver den første ikke-gjorte linje i fokuskortet, uden ombygning.
- Hjemmebane-design; ingen fixed overlejring ud over den eksisterende
  video-overlejring.

**ÅBENT PUNKT der følger af A** (§10): et medlem der aldrig fylder de
fem punkter, ser aldrig den almindelige forside. Punkterne skal kunne
afsluttes — enten afvises enkeltvis, eller ankomsten giver op efter et
stykke tid. Ikke afgjort.

Hvad der findes at bygge på (målt): `HbOnboardingTjekliste` i
`HbMemberShell` (`:209-212`, ikke for rådgivere) med pille/liste/
«Alt er på plads»; `useOnboardingTjekliste` (syv queries, `markerVelkomstSet`);
`FocusCard` (`BoardroomView.tsx:1150-1294`) med `items`, `nextEntry`,
`journeyLine`; `deriveFocus` (`nextStep.ts:158-347`) med ni slots og
tests. Om pillen skal blive stående ved siden af fokuskortet i
ankomsten, er ikke afgjort (§10).

---

## 6. Branchen udledes af CVR — BESLUTTET

### Beslutningen

Ny ren motor, **motor før flade**: `udledBranchekode(db07: string):
string | null` → app-taksonomiens `industry_code` (nøglerne i
`INDUSTRY_OPTIONS`/`industry_benchmarks`, 48 underkategorier, målt
`Settings.tsx:25-108` og seed `20260329190316:143-268` + `211955`).
Kaldes ved oprettelsen. Mapping på DB07-kodens to første cifre
(afdelingsniveau), med undtagelser hvor to cifre er for groft.

**Rammer mappingen ikke, står feltet TOMT, og tjeklisten spørger
medlemmet.** Der sættes ALDRIG `other_general` som fald tilbage.
Begrundelse: en grov sammenligning der ser rigtig ud, men er tilfældig,
er værre end ingen — fordi ingen opdager den. Et tomt felt er synligt
(NoegletalView viser ingen branchesammenligning, `:429`; tjeklisten
viser «Branche» som mangler, `onboardingTjekliste.ts:160`); en forkert
benchmark ser ud som et tal.

### Hvorfor DB07 ikke bare lægges i `industry_code` — målt

- `industry_code` er nøgle til `industry_benchmarks.industry_code`
  (NoegletalView.tsx:431-433, generate-weekly-focus:272-274,
  Settings.tsx:598-602, migration 212047:47). Tabellens koder er
  app-taksonomiens (`retail_other`, `tech_software`, …; 66 seedede
  koder). En DB07-kode som `620100` matcher ingen række → nul
  benchmarks, uden fejl.
- `byggVirksomhedsRaekke` sætter derfor bevidst `industry_code: null`
  (`src/lib/virksomhedsraekke.ts:126-133` og Deno-spejlet), låst af
  `virksomhedsraekke.test.ts:134`. Kommentaren: «CVR's NACE/DB07-tal må
  IKKE i industry_code … en NACE-kode giver nul benchmarks.»
- DB07-koden bevares allerede: `hentCvrData` returnerer `industry_code =
  String(data.industrycode)` og `industry_label = data.industrydesc`
  (`_shared/virksomhedsOprettelse.ts:77-82`, kilde cvrapi.dk), og hele
  svaret gemmes i `application_context.raw_cvr_data`
  (`virksomhedsraekke.ts:156`). Kun for virksomheder oprettet gennem
  rækkebyggeren med et CVR der slog op; ved GENBRUG på CVR slås CVR
  ikke op igen (`virksomhedsOprettelse.ts:100-112`, `cvr_svar: null`).

### Hvad motoren bygger på

DB07 følger NACE Rev. 2's struktur: seks cifre, hvor de to første er
afdelingen (fx `62` = Computerprogrammering, konsulentbistand mv.).
NACE Rev. 2 har 88 afdelinger (01–99 med huller) — det er strukturens
tal, ikke noget der er målt i repoet. Mappingen bliver derfor en tabel
med op til 88 rækker afdeling → `industry_code | null`, plus en liste
af undtagelser på fire eller seks cifre hvor afdelingen spænder over
flere af vores underkategorier (fx afdeling `47` detailhandel dækker
`retail_grocery` … `retail_other`; her afgør gruppen `47.1x`–`47.9x`).
Tabellens indhold er IKKE lavet — det er trin 1 i §9, og det skal
skrives med begrundelse pr. række, ikke i én omgang.

Motoren er ren (nul imports), lever i `src/lib/branchekode.ts`, spejles
ordret til `_shared/branchekode.ts`, med paritetstest — mønstret fra
`betalingsfrist` og `virksomhedsraekke`. Taksonomien selv
(`INDUSTRY_OPTIONS`) skal flytte fra `Settings.tsx` til et delt modul,
så motor, Settings og benchmark-seedet har én kilde; Onboarding.tsx'
egen 15-liste (`:13-29`) dør med porten.

### De to felter — målt forskel, og FORSLAG for `industry_label`

Målt (`recon-branche.md` §5): `industry_code` driver benchmarks
(NoegletalView, generate-weekly-focus T6, kpi_benchmarks-synk).
`industry_label` driver agentens peer-match på EKSAKT tekstlighed
(`run-company-agent:785-791`), AI-prompterne (ai-financial-feedback,
handout-ai-feedback, generate-financial-commentary, weekly-focus:431)
og Netværket (views i `20260810*`, `MemberDirectoryView`). Labelen er
fritekst hos tre skrivere og kontrolleret vokabular hos to; migration
`20260810200000:56-60` bogfører at den «misbruges til beskrivelse» hos
nogle.

**Forslag (ikke besluttet):** `industry_label` FØLGER `industry_code`.
Sætter motoren en kode, sættes labelen til taksonomiens label for den
kode (samme opslag som `Settings.tsx:819-823` gør i dag). Rammer motoren
ikke, står BEGGE felter tomme — også labelen, selv om CVR har en tekst
(«Computerprogrammering»). Begrundelse: peer-match på eksakt tekst og
AI-kontekst får samme vokabular som benchmarks, og «branche mangler» i
tjeklisten bliver sand i stedet for at blive skjult af en CVR-tekst
ingen har valgt. Konsekvens der skal måles først: hvor mange
eksisterende virksomheder har en label uden kode, og hvor mange peers
agenten i dag finder på de tekster — UKLART.

Alternativ, fravalgt i forslaget: labelen beholder CVR-teksten når koden
mangler (som i dag). Det holder AI-prompterne informerede, men gør
tjeklisten stum og lader peer-match køre på cvrapi's ordlyd.

`import-application`s enrich-sti (`:97-98`, eneste skriver med guard på
tomt felt) og `EditCompanyDialog`s fritekstfelt (`:158-165`) er ikke
afgjort — åbent (§10).

---

## 7. De dårlige dage — hvad mennesket ser i dag, og hvad det skal blive

Alt «i dag» er målt (`recon-adgangsruten.md` §5).

### 7.1 Blindgyden: skelettet uden udgang

**I dag:** `fetchUserData` kaster (useAuth.tsx:352-358) → `loading=false`,
`membershipTier` forbliver `null` → `Index.tsx:202-208` viser
`AppLayout` + `DashboardSkeleton` — gammelt design, ingen timeout, ingen
besked, ingen knap. Samme skærm hvis triggeren ikke koblede
virksomheden: ingen `company_members`-række → PPI → `no_pending_invitation`
→ `companyResolution="none"`, tier `null` → samme skelet. (Kun
PPI-FEJL, ikke PPI-«ingen», rammer `CompanyLinkFailedGate`, Index:189.)

**Skal blive:** skelettet får en grænse. Efter N sekunder uden afgjort
tier vises `CompanyLinkFailedGate`-formen (Hjemmebane, findes:
`CompanyLinkFailedGate.tsx`) med «Prøv igen» og «Skriv til os» — og
`companyResolution="none"` for en IKKE-rådgiver behandles som fejl, ikke
som «rådgiver uden virksomhed» (useAuth.tsx:308-312 skelner ikke på
rolle). N er ikke afgjort (§10). Skelettet selv tegnes i Hb-tokens
(`DashboardSkeleton` er `glass-card` + shadcn `Skeleton`).

### 7.2 Dødt eller brugt token

**I dag:** `lookup_invite_company_info` svarer null → `Auth.tsx:91`
rammes ikke → signup-skærmen uden virksomhedsnavn, tomme redigerbare
felter, overskrift «Bliv en del af The Boardroom» (:316-321). Ingen
besked. Udfyldes formen, afviser triggeren med P0001, og
`error.message` vises råt som toast (:143).

**Skal blive:** opslaget skelner «findes ikke» fra «er brugt». Det
kræver at RPC'en svarer med en grund (i dag: kun `pending`-rækker
svarer, migration `20260902190000:57`) — designvalg i §10. Skærmen siger
i Hjemmebane hvad der er sket: brugt → «Du har allerede en konto — log
ind», med login-formen; ukendt → «Linket virker ikke længere — skriv
til os», uden signup-form (der er ingen invitation at opfylde).

### 7.3 Allerede indlogget browser

**I dag:** `AuthRoute` (App.tsx:192) sender ordløst til `/` når
sessionen findes; invitationen forbruges aldrig; signup-skærmen vises
ikke.

**Skal blive:** med `invite`-token i URL'en og en anden session i
browseren vises en Hjemmebane-skærm: «Du er logget ind som {mail}.
Invitationen er til {invitationens mail}.» med «Log ud og fortsæt» (som
`Onboarding.tsx:193-202` gør i dag med `signOut` + `/auth?force=true`)
og «Bliv logget ind». Er det SAMME mail: invitationen er formentlig
allerede accepteret — send til `/` som i dag. Hvad der sker hvis en
allerede indlogget bruger har en pending invitation til en ANDEN
virksomhed (kollega-scenariet, indgangsfladen §13): åbent.

### 7.4 Fejl i bekræftelseslinket

**I dag:** Supabase sender `error`/`error_description` i URL'en; repoet
læser ingen af dem (målt: nul træffere på `error_description|otp_expired|
access_denied` i `src`). Brugeren lander på `/` uden session →
`MemberRoute` → `/auth` login-form uden besked.

**Skal blive:** med bekræftelsen slået fra (§3) findes linket ikke
længere for nye medlemmer. Fejl-parametrene skal alligevel læses på
`/auth` (adgangskode-nulstilling bruger samme mekanik,
`Auth.tsx:154-156`) og vises som én sætning i Hjemmebane: «Linket er
udløbet — bed om et nyt.» Ingen rå `error.message`.

### 7.5 Auth.tsx' tilstande til Hjemmebane

Målt: `Auth.tsx` har fem visuelle tilstande — login, signup (med og
uden invitation), nulstil adgangskode, «Tjek din mail», «Konto
oprettet» — alle gammelt design (`bg-background`, `bg-card`,
`font-brand`; hverken `theme-hjemmebane` eller shadcn). Dertil
`/reset-password` (`ResetPassword.tsx`, ikke læst i denne recon) og
route-spinnerne (App.tsx:78-82, 91-95, 175-179, Suspense :206-210) i
gamle tokens; `AuthRoute` rendrer `null` mens den venter (:191).

Alle konverteres i dette epic, som standalone Hb-flader uden skal
(mønstret fra `MembershipExpiredGate` og `CompanyLinkFailedGate`:
`theme-hjemmebane min-h-screen bg-hb-paper`). Google-knappen beholdes
som den er (§3). Bogføres i `docs/hjemmebane/konvergens.md` §1 efter
vedligeholdsregel 2 (indgangsfladen §8).

### 7.6 ErrorBoundary og 404 — med eller uden for epic'et

- **404 (`NotFound.tsx`): MED.** Målt: standalone side, ingen skal, tre
  linjer, gamle tokens. Et nyt medlem kan ramme den fra et forkert
  skrevet link i en mail. Den koster én fil og deler form med
  gate-fladerne.
- **ErrorBoundary (`ErrorBoundary.tsx:33-60`): UDEN.** Målt: den omgiver
  HELE appen (App.tsx:197), også rådgiverfladen, som stadig er
  AppLayout/mørk (prioritering-1-september §6: rådgiverfladen tages
  samlet). En Hb-lysende fejlskærm oven på en mørk rådgiverside er en
  ny dobbelthed, ikke en konvertering. Den følger rådgiverfladens epic —
  eller det generelle Hb-sweep, hvad der kommer først. Bogføres som
  fravalg i konvergens.md.

---

### 7.7 Invitationsmailen lover den gamle vej

**I dag** (målt 2/9 aften på den modtagne mail): invitationsmailen
siger «Du kan oprette dig med en hvilken som helst e-mail — du bliver
automatisk tilknyttet The Boardroom via dit invitationslink.» Efter
#537 er mailfeltet på /auth `readOnly` og låst til invitationens adresse
(`Auth.tsx:388`); skriver man en anden, afviser triggeren. Teksten er en
rest fra den gamle vej (`send-invitation-email`/skabelonen, ikke læst
linje for linje her).

**Skal blive:** mailen siger det samme som skærmen — at kontoen
oprettes på netop denne adresse. Hører til trin 10 (§9), hvor /auth's
tilstande alligevel skrives om.

## 8. Hvad der IKKE ændres

- `handle_new_user` (FORBIDDEN uden grønt lys, CLAUDE.md:95-98). Det er
  netop derfor §4's forslag lægger stemplet i klienten.
- `lookup_invite_company_info`s form: tokenet som argument, kun
  `pending` svarer — indtil §7.2's designvalg er truffet.
- Kæden før invitationen (`docs/indgangen-design.md` §1–32).
- Rådgiverfladen (/members, IndgangsSektion, FornyelsesSektion).
- Google-vejen (§3).

---

## 9. Rækkefølge

Ét trin pr. linje. Hvert trin kan bevises i drift for sig; motorer før
flader. «Bevis» = hvad der måles før næste trin begynder.

1. **Motor `udledBranchekode`** (`src/lib/branchekode.ts`, ren, tabel
   afdeling → kode + undtagelser, tests pr. afdeling der er mappet OG
   pr. afdeling der bevidst giver null). Bevis: `bun run test` grøn,
   testene læst — tallene, ikke kun assertions.
2. **Taksonomien som ét modul** (`INDUSTRY_OPTIONS` ud af `Settings.tsx`
   til `src/lib/brancher.ts`; Settings importerer). Bevis: Settings'
   branche-select uændret i prod efter Update-klik; `tsc` med de fire
   kendte fejl.
3. **Spejl til Deno + paritetstest** (`_shared/branchekode.ts`,
   `branchekodeParitet.test.ts`). Bevis: paritetstest grøn; `deno check`
   på de funktioner der importerer den.
4. **Motoren kaldes ved oprettelsen** (i `byggVirksomhedsRaekke` eller
   umiddelbart efter i `opretEllerGenbrugVirksomhed`; `industry_code` og
   — hvis §6-forslaget besluttes — `industry_label` fra motoren; ny
   delt fil ⇒ eksplicit deploy af `monday-webhook` og
   `import-application`, ikke bare merge). Bevis: næste «Godkendt» på
   Monday giver en række med `industry_code` sat (SQL editor), og
   NoegletalView viser branchesammenligning for den.
5. **✅ BEVIST 2/9 kl. 21:56 — Mailbekræftelsen slået fra** (Lovable →
   Cloud → Users → Auth settings → Email → «Auto-confirm email» TIL, kl.
   ca. 21:54; §3). Bevis målt: `confirmation_sent_at = NULL`,
   `email_confirmed_at` +0,25 sek., «Tjek din mail» vist ikke, logget
   ind straks; triggeren koblede korrekt.
6. **`profileOnboarded` ud af agentens betingelse** (§4-beslutningen:
   `useAuth.tsx:254` bliver `onboarding_completed === false &&
   application_context`, som Onboarding.tsx:89). Bevis: ny konto med
   `onboarded_at` NULL → `companies.onboarding_completed` skifter til
   true ved første login, og agentens loglinje (`run-company-agent`,
   trigger `onboarding`) står i Supabase-loggen; eksisterende medlem
   med `onboarding_completed = true` udløser intet.
7. **Porten pensioneres** (de seks steder i §4; `/onboarding` → `/`).
   Bevis: ny konto lander på `/` uden at passere `/onboarding`;
   eksisterende medlem uændret; `grep needsOnboarding` = nul.
8. **Ankomstens motor** (§5-beslutningen, motor før flade): `deriveFocus`
   udvides med (1) `contract_start_date` som input, så slot (a) ikke
   beder om tal fra før virksomheden fandtes, og (2) tjeklisten som
   kilde med førsteprioritet så længe `byggTjekliste(...).faerdig` er
   falsk — første ikke-gjorte punkt som #1, resten som linjer. Rene
   funktioner, tests pr. slot og pr. overgang (sidste punkt gjort →
   almindelig prioritering). Bevis: `bun run test` grøn, testene læst.
9. **Ankomstens flade** (§5): `FocusCard` viser tjeklistekilden i sin
   eksisterende form; hilsenen får grenen «Velkommen, {fornavn}.» så
   længe intet er gjort; pillens rolle i ankomsten afgjort (§10). Bevis:
   testbruger med nul data ser «Velkommen, {fornavn}.» og første
   tjeklistepunkt som fokus; efter alle punkter er gjort, ser samme
   bruger «Godmorgen/…» og slot (a)–(i); med en test-GUID i
   `velkomstvideo_guid` bliver «Se velkomsten» første linje uden anden
   ændring.
10. **Blindgyden lukkes** (§7.1: grænse på skelettet, `none` = fejl for
   ikke-rådgivere, skelet i Hb-tokens). Bevis: fremkald tilstanden
   (bruger uden `company_members`-række i test) → gaten efter N
   sekunder, ikke skelettet.
11. **/auth til Hjemmebane** (§7.5: alle fem tilstande + spinnerne +
    `/reset-password`; §7.2 dødt/brugt token; §7.3 indlogget browser;
    §7.4 fejl-parametre; §7.7 invitationsmailens tekst). Bevis: hver
    tilstand fremkaldt og set; login og nulstilling virker for et
    eksisterende medlem; konvergens.md opdateret.
12. **404 til Hjemmebane** (§7.6). Bevis: forkert sti viser Hb-siden.
13. **Bogføring**: dette dokument opdateres pr. trin med dato og bevis;
    OVERLEVERING DEL 2/3 peger hertil. Testopstillingen (§11) fjernes
    når ruten er bevist.

Trin 1–4 (branchen) er uafhængige af 5–9 (ruten) og kan køre parallelt
i to grene; 5 er bevist; 6 SKAL være bevist før 7 (§4: `agent_runs` var
0 før porten blev gennemført); 8 og 9 bygger på 7; 10–12 er uafhængige
af hinanden.

---

## 10. Åbne punkter

- **LØST 2/9 aften — Stemplets placering** (§4): stemplet flyttes
  ikke; `profileOnboarded` fjernes fra agentens betingelse i
  `useAuth.tsx:254`. Kolonnen bliver stående. Se §4.
- **`upgrade-legat-to-member` og enrollment-status:** om funktionen
  ændrer `legat_enrollments.status`, og hvad `onboarded_at` i så fald
  betyder for en tidligere legat-bruger (bliver `legatActive` falsk,
  bærer stemplet alene at de ikke sendes til `/onboarding` — indtil
  porten dør). Ikke læst i reconen.
- **`industry_label` når motoren rammer/ikke rammer** (§6-forslag), og
  hvad der sker med `import-application`s enrich-guard og
  `EditCompanyDialog`s fritekstfelt. Ikke besluttet.
- **Mappingtabellens indhold**: hvilke afdelinger giver null, og hvilke
  undtagelser på fire/seks cifre. Skrives med begrundelse pr. række i
  trin 1; ikke påbegyndt.
- **Backfill af eksisterende virksomheder** uden `industry_code` fra
  `application_context.raw_cvr_data`: antal og hvor mange der har en
  DB07-kode gemt — UKLART. Er en datarettelse (SELECT før/efter,
  guard `industry_code IS NULL`), ikke en del af trin 4.
- **LØST 2/9 aften — Markøren for «første besøg»** (§5): ankomsten
  varer indtil tjeklisten er færdig (valg A), så markøren er
  `byggTjekliste(...).faerdig` — data pr. medlem, ingen ny kolonne.
- **Ankomsten kan vare for evigt** (følger af valg A, §5): et medlem der
  aldrig fylder de fem punkter, ser aldrig den almindelige forside.
  Punkterne skal kunne afsluttes — afvises enkeltvis, eller ankomsten
  giver op efter et stykke tid. Ikke afgjort.
- **Pillens rolle i ankomsten** (§5): bliver `HbOnboardingTjekliste`
  stående nederst til højre mens fokuskortet viser samme punkter, eller
  trækker den sig indtil ankomsten er slut. Ikke afgjort.
  *Note fra trin 9 (2/9, læst i koden — ikke målt på skærm):* mens
  ankomsten er aktiv, står de samme ikke-gjorte punkter to steder:
  fokuskortets #1 er den samme titel som pillens første ikke-gjorte
  række, og #2-4 er de samme rækker igen. Kortets knap og pillens række
  fører til samme sti. Én forskel: velkomst-punktet (sti «») åbner
  videoen fra pillen, men kortet kan ikke åbne overlejringen — den er
  boksens egen state, og der er ingen kobling fra forsiden; kortet
  viser punktet uden knap. Folder man pillen ud på forsiden, får
  indholdskolonnen bund-margin (skallen), så listen står både øverst i
  kortet og nederst i hjørnet samtidig.
- **N sekunder** før skelettet giver op (§7.1).
- **Dødt vs. brugt token** (§7.2): kræver at RPC'en svarer med en grund
  for ikke-pending tokens — ændrer hvad et token afslører (i dag: intet
  for brugte). Ikke besluttet.
- **Kollega-invitationen** (§7.3 + indgangsfladen §13): en indlogget
  bruger med pending invitation til en anden virksomhed. Ikke designet.
- **Google-vejen** med invitationstoken (§3). Eget trin, ikke her.
- **De tre værdikort** fra Onboarding trin 2. Intet hjem valgt.
- **LØST 2/9 kl. 21:18 — Medlemmer midt i det gamle flow:** ingen.
  42 af 43 profiler har stemplet; den ene uden er en rådgiver uden
  virksomhed (§4).
- **`ResetPassword.tsx`**: ikke læst; antaget gammelt design ud fra
  konvergens.md §1 («STANDALONE-GAMMEL»), ikke målt her.
- **Hvor længe «Konto oprettet»-grenen står** før navigationen (§2).
  Ikke målt.

---

## 11. Testopstillingen — bevisernes virksomhed (oprettet 2/9)

Bruges til at bevise trin 5–7 i drift. Fjernes helt når ruten er
bevist; intet af det er kundedata.

| hvad | værdi |
|---|---|
| Virksomhed | **FLOOR1 I/S**, `companies.id = fea24b90-3252-45f3-a2fb-f15fda3f2402`, CVR 41772239 |
| Oprettet | 2/9 kl. 21:47 via «Importér ansøgning» (`import-application`) med en Excel-fil vi selv lavede |
| Tilstand | `status = 'active'`, kontrakt 02.09.2026–02.09.2027, `vis_i_netvaerk = false` (sat 2/9 kl. 21:50, så den ikke ses i Netværket — det eneste felt der tager den ud af noget uden at tage adgangen, `recon-testvirksomhed.md` §2) |
| Bruger, trin 5 | `jonas+test1@topix.dk`, `user_id d06f68cc-76b3-4793-a575-85c0e6e657c2` — signup 2/9 kl. 21:56, porten gennemført kl. 21:58 |
| Planlagt | `jonas+test2@` og `jonas+test3@` til trin 6 og 7 — én adresse pr. trin, fordi en brugt adresse ikke kan genbruges (kontoen findes i `auth.users`). `UNIQUE (company_id, email)` tillader flere adresser på samme virksomhed |
| Synlig hvor | /members' liste og AdvisorDashboard (status active, ikke legat), MemberDetail; ikke i Netværket. `is_demo` findes ikke i repoet og ændrer intet (`recon-testvirksomhed.md` §1) |

**Oprydning når ruten er bevist:** `hardDeleteCompany` med
`deleteUsers: true` (via `admin-cleanup-test-data` `hard_delete_company`
med `delete_users: true`, dry-run først), plus de rester
`recon-testvirksomhed.md` §4–5 nævner: storage-objekter (`financial-
documents/{company_id}/…`, `company-logos`, `chat-attachments/{user_id}/…`),
notifikationer uden `company_id`, og `user_id`-tabeller uden FK-cascade
(`conversation_last_seen`, `message_reactions`, `report_comments`,
`circle_*`, `group_*`). `group_companies` ville blokere sletningen af
`companies`-rækken hvis en række findes (FK uden `ON DELETE`). SELECT
før/efter, og bogfør FØR-værdierne her.

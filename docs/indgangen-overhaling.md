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

Indstillingen ligger i Supabase Auth, uden for repoet. Ét klik i
dashboardet; ingen kode. Det er en driftshandling, og den skal bogføres
med dato i dette dokument når den er gjort.

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
`company_invitations.email`. Med bekræftelse slået fra sætter Supabase
`email_confirmed_at` ved signup (bibliotekets/Auths dokumenterede
adfærd — IKKE målt i vores projekt endnu; bevises i §9 trin 5), så
betingelsen er formentlig stadig sand — men designet må ikke hvile på
det. Fallbacken er alligevel død på hovedruten: triggeren har allerede
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

### FORSLAG (ikke besluttet): hvor stemplet sættes i stedet

**Forslag: `useAuth.fetchUserData` stempler `onboarded_at` ved første
vellykkede virksomhedskobling** — i grenen `cm?.company_id` (:221-224),
når `profiles.onboarded_at` er NULL: én UPDATE på `profiles` med
`.select("user_id, onboarded_at")` og tjek af rækkeantal (fælden fra
velkomst-stemplet, OVERLEVERING DEL 4), derefter den eksisterende
agent-gren (:248-273) uændret i samme kald med `profileOnboarded`
regnet fra det nye stempel.

Begrundelse:

- Samme skrivevej som Onboarding.tsx bruger i dag (klient, RLS
  «Users can update own profile», migration `20260223152943:43`) — ingen
  ny rettighed, ingen ny funktion.
- Stemplets betydning skifter fra «har set porten» til «har været inde
  første gang». Det er hvad agenten og alt andet faktisk venter på.
- Rører IKKE `handle_new_user` (FORBIDDEN-listen i CLAUDE.md:95-98).
  Alternativet — at triggeren sætter `onboarded_at` ved oprettelsen —
  er renere (serverside, kan ikke fejle klientside), men kræver
  eksplicit grønt lys til en SECURITY DEFINER-trigger, og gør
  stemplet identisk med `created_at`.
- Eksisterende medlemmer: alle profiler før 26/2 er backfilled
  (`20260226125413:4`), alle siden er stemplet af porten. Medlemmer der
  har oprettet konto men aldrig gennemført porten, har NULL og bliver
  stemplet ved næste login. Antal: UKLART (ikke målt).

Alternativ der er FRAVALGT i forslaget: at flytte agentens udløser til
`process-pending-invitation` — den nås ikke på hovedruten (§3).

---

## 5. Ankomsten skal stå selv — BESLUTTET

**Landingen på Dit Boardroom bærer velkomsten uden video:** medlemmets
fornavn, virksomhedens navn, og tjeklisten UDFOLDET ved første besøg.
Videoen skal kunne glide ind i pladsen senere, uden ombygning, når
Morten har optaget den. Hjemmebane-design.

Hvad der findes at bygge på (målt):

- `HbOnboardingTjekliste` er monteret i `HbMemberShell` på alle
  Hb-sider (`HbMemberShell.tsx:209-212`, ikke for rådgivere), med
  sammenfoldet pille som standard (`:181`) og «Kom godt i gang» i
  sidebaren. Motoren `byggTjekliste` giver fem punkter uden video, seks
  med (`src/lib/onboardingTjekliste.ts`).
- `VelkomstOverlejring` (samme fil) er videoens plads i dag: fixed
  inset-0, «Kom i gang» stempler `profiles.velkomstvideo_set_at`, «Se
  senere» udsætter for sessionen (`tbr.velkomst-udsat`).
- Fornavnet: `profile.full_name` (Index.tsx:183 bruger allerede
  `split(" ")[0]`); virksomheden: `companyName` fra `useAuth`.
- `BoardroomView` har en tom-tilstand «Ingen godkendte tal endnu —
  upload din første rapport…» (`BoardroomView.tsx:914`) og fokus-kortets
  «anerkendelse frem for tomhed» (:1274, :1657-1664) — ankomsten skal
  ikke konkurrere med dem, men stå over dem.

Formen (design, ikke bygget): én velkomstblok øverst i `BoardroomView`
ved første besøg — «Velkommen, {fornavn}. {virksomhed} er inde.» — med
tjeklisten udfoldet lige under (samme komponent, samme punkter, ikke en
kopi), og en tom plads i blokken hvor videoen kommer til at stå. Med
video sat: pladsen fyldes af `HbVelkomstVideoEmbed` i samme blok;
overlejringen som fixed inset-0 pensioneres til fordel for blokken.
Ved andet og senere besøg: blokken forsvinder, tjeklisten er pille som
i dag.

«Første besøg» skal have en markør. I dag findes: `velkomstvideo_set_at`
på `profiles` (kun meningsfuld med video), `tbr.tjekliste-lukket` /
`tbr.tjekliste-faerdig-set` i localStorage (per enhed) og efter §4
`onboarded_at`. Hvilken der bærer «har set ankomsten» er ÅBENT (§10);
bemærk at localStorage giver «første besøg pr. browser», ikke pr.
medlem.

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
5. **Mailbekræftelsen slås fra** (Supabase Auth, driftshandling). Bevis:
   test-signup → `data.session` findes, `email_confirmed_at` sat ved
   oprettelsen (SQL editor), «Tjek din mail» vises ikke; dato bogføres
   her.
6. **Stemplet flytter** (§4-forslaget efter beslutning: `onboarded_at`
   ved første kobling i `useAuth`, med `.select()` + rækkeantal). Bevis:
   ny konto → `onboarded_at` sat inden forsiden vises; agentens loglinje
   (`run-company-agent`, trigger `onboarding`) i Supabase-loggen.
7. **Porten pensioneres** (de seks steder i §4; `/onboarding` → `/`).
   Bevis: ny konto lander på `/` uden at passere `/onboarding`;
   eksisterende medlem uændret; `grep needsOnboarding` = nul.
8. **Ankomsten** (§5: velkomstblok + udfoldet tjekliste i `BoardroomView`,
   pladsen til videoen, markøren for første besøg). Bevis: ny konto ser
   blokken; andet besøg ser den ikke; med en test-GUID i
   `velkomstvideo_guid` glider videoen ind uden anden ændring.
9. **Blindgyden lukkes** (§7.1: grænse på skelettet, `none` = fejl for
   ikke-rådgivere, skelet i Hb-tokens). Bevis: fremkald tilstanden
   (bruger uden `company_members`-række i test) → gaten efter N
   sekunder, ikke skelettet.
10. **/auth til Hjemmebane** (§7.5: alle fem tilstande + spinnerne +
    `/reset-password`; §7.2 dødt/brugt token; §7.3 indlogget browser;
    §7.4 fejl-parametre). Bevis: hver tilstand fremkaldt og set; login
    og nulstilling virker for et eksisterende medlem; konvergens.md
    opdateret.
11. **404 til Hjemmebane** (§7.6). Bevis: forkert sti viser Hb-siden.
12. **Bogføring**: dette dokument opdateres pr. trin med dato og bevis;
    OVERLEVERING DEL 2/3 peger hertil.

Trin 1–4 (branchen) er uafhængige af 5–8 (ruten) og kan køre parallelt
i to grene; 6 SKAL være bevist før 7; 8 bygger på 7; 9–11 er
uafhængige af hinanden.

---

## 10. Åbne punkter

- **Stemplets placering** (§4): klient i `useAuth` (forslag) eller
  trigger (kræver grønt lys). Ikke besluttet.
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
- **Markøren for «første besøg»** (§5): `onboarded_at`,
  `velkomstvideo_set_at`, ny kolonne eller localStorage. Ikke besluttet.
- **N sekunder** før skelettet giver op (§7.1).
- **Dødt vs. brugt token** (§7.2): kræver at RPC'en svarer med en grund
  for ikke-pending tokens — ændrer hvad et token afslører (i dag: intet
  for brugte). Ikke besluttet.
- **Kollega-invitationen** (§7.3 + indgangsfladen §13): en indlogget
  bruger med pending invitation til en anden virksomhed. Ikke designet.
- **Google-vejen** med invitationstoken (§3). Eget trin, ikke her.
- **De tre værdikort** fra Onboarding trin 2. Intet hjem valgt.
- **Medlemmer midt i det gamle flow** (`onboarded_at` NULL, aldrig
  gennemført porten): antal UKLART; §4-forslaget stempler dem ved næste
  login.
- **`ResetPassword.tsx`**: ikke læst; antaget gammelt design ud fra
  konvergens.md §1 («STANDALONE-GAMMEL»), ikke målt her.
- **Hvor længe «Konto oprettet»-grenen står** før navigationen (§2).
  Ikke målt.

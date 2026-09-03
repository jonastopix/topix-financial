# Indgangens overhaling — fra invitationslink til Dit Boardroom på to skærme

**DESIGNDOKUMENT MED BOGFØRING.** Beslutningerne er truffet af Jonas
2. september 2026 om aftenen. **Status 3/9 formiddag: RUTEN ER FÆRDIG.**
Trin 5–13 i §9 er bevist i drift (5–9 den 2/9, 11–12 den 2/9 nat, 13 og
10 den 3/9 morgen, #554 og #557); trin 1–4 (branchen, #553 og #556) er
bygget og deployet, med ét udestående bevis for trin 4 (en rigtig
oprettelse med `industry_code` sat). Fra invitationslink til Dit
Boardroom: to skærme, Hjemmebane hele vejen, en ankomst der tager imod,
og ingen tilstand hvor et medlem kan stå fast uden en vej videre.
Samme formiddag blev kæden FØR platformen hel (dag 31-fakturaen,
`docs/indgangen-design.md` §30) — begge halvdele er dermed færdige.
**Rettelse 3/9:** registret bag branchemotoren er DB25, ikke DB07 — §6
er rettet, se noten der. Samme regel som
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

**Google-vejen — BESLUTTET 2/9 nat (Jonas), står fast:** Google er
fjernet fra SIGNUP (#550) og findes kun på login. Målt
(recon-adgangsruten §5d): Google-vejen bærer ikke invitationstokenet i
metadata, kun i `redirect_uri`, så triggeren falder tilbage til
e-mail-match. En Google-konto med en anden adresse end invitationens
afvises med P0001, og hvad brugeren ser, er uafklaret. Vi låser
mailfeltet omhyggeligt og skal ikke tilbyde en vej udenom ved siden af.
Den rigtige løsning er at kunne KOBLE en Google-konto på sin
eksisterende konto bagefter — en kontoindstilling, eget stykke (§10).

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

### ✅ BEVIST 2/9 kl. 20:53 — trin 6: agenten fyrer uden stemplet

PR #544 (`profileOnboarded` ud af betingelsen i `useAuth.tsx`). Bevist
på testbrugeren `jonas+test2@topix.dk` (§11): `agent_runs` på FLOOR1
gik fra 1 til 2 med `trigger = 'onboarding'`, `mode = 'dry_run'`,
`stop_reason = 'finish'` — mens `profiles.onboarded_at` var NULL.
Agenten fyrer altså uden portens stempel. `onboarding_completed`
skiftede selv tilbage til `true`, så engangs-værnet virker.

**Bemærk til fremtidig test:** flaget måtte nulstilles manuelt før
beviset (FØR-værdi `true`, fra kørslen kl. 21:58 dagen før), fordi
agenten kun må fyre én gang pr. virksomhed. Uden nulstillingen havde
beviset været umuligt at måle på samme virksomhed.

### ✅ BEVIST 2/9 kl. 23:03 — trin 7: porten er pensioneret

PR #545. De seks steder i tabellen øverst er gennemført: siden slettet,
`OnboardingRoute` og de to gate-linjer væk, `needsOnboarding` og
`setOnboardingComplete` ude af auth-kontrakten, localStorage-flaget
`tbr.onboarded` væk, pre-React-bouncen i `main.tsx` væk. `/onboarding`
redirecter til `/` med hash og query bevaret. `profileOnboarded` er
fjernet med — efter trin 6 var `needsOnboarding` dens eneste bruger.
`grep needsOnboarding|setOnboardingComplete|tbr.onboarded src/` = nul.

Bevist med `jonas+test3@topix.dk`: fra adgangskode til forside uden at
passere `/onboarding`. `onboarded_at` forblev NULL for både test2 og
test3 — kolonnen skrives ikke længere af ruten, som besluttet.
`tour_completed_at` stemples fortsat stille (`Index.tsx`). **Ruten gik
fra seks skærme til tre: signup, spinner, forside.**

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

### ✅ BYGGET OG BEVIST 2/9 — trin 8 (motor) og trin 9 (flade)

**Trin 8, PR #546 — bevist med tests.** `deriveFocus` (`nextStep.ts`)
har fået to VALGFRIE inputs; uden dem opfører motoren sig præcis som
før — bevist i test: en færdig tjekliste er identisk med ingen
tjekliste. (1) Tjeklisten er kortets ENESTE kilde så længe den ikke er
færdig: første ikke-gjorte punkt som #1, resten som linjer, i
tjeklistens egen rækkefølge; kind `tjekliste`, prioritet 0, titel/
beskrivelse/sti som title/description/ctaHref. (2)
`foersteRapportPeriode`: slot (a) beder aldrig om en periode fra før
kontrakten. Regnestykket: en rapport dækker en hel kalendermåned, så
den første måned kontrakten dækker HELT er startmåneden hvis kontrakten
begynder den 1., ellers måneden efter. Betalt 15/9 → første krav i
november, om oktober. Værnet gælder kun (a): findes der uploadede tal,
fyrer (b) og (g) som før. **Rettet undervejs:** else-grenen manglede
`hasProcessed` — uden den ville et nyt medlem, hvor (a) tier på
kontraktstarten, i stedet være blevet bedt om at godkende en rapport
der ikke findes. 1234 tests grønne, 21 nye.

**Trin 9, PR #547 — bevist i drift 2/9 kl. 23:20** på
`jonas+test3@topix.dk`: forsiden viser «Velkommen, Jonas.» og «Din
profil» som fokus med knappen «Gør det nu», med de tre øvrige
tjeklistepunkter som linjer. Ikke «Upload dine august-tal». Tjeklisten
hentes i `BoardroomView` med samme hook og query-nøgle som
`HbMemberShell` — cachen deles, ingen ekstra forespørgsel.
Kontraktstarten hentes for sig (én lille query på det viste
`companyId`; den fandtes ikke i nogen eksisterende query på forsiden).
`focusLoading` er udvidet med begge, så kortet ikke når at vise (a)–(i)
først. Pillen er urørt (åbent punkt, §10). Velkomst-punktet (sti «»)
står uden knap i kortet — overlejringen er tjekliste-boksens egen state
(§10).

---

## 6. Branchen udledes af CVR — BESLUTTET; trin 1 BYGGET 3/9 (#553)

### RETTET 3/9 — registret er DB25, ikke DB07

Afsnittet nedenfor blev skrevet 2/9 med «DB07» som CVR's branchekode, og
opgaven til trin 1 blev formuleret på samme grundlag. Det var forkert.
CVR skiftede 1. januar 2025 fra Dansk Branchekode 2007 (DB07) til
**Dansk Branchekode 2025 (DB25)**. Alle virksomheder har haft en
DB25-kode siden, og det er DB25-koden cvrapi.dk udstiller — også hvor
kode og titel er magen til DB07's. DB25 har 738 branchekoder på 87
afdelinger og er en dansk underopdeling af NACE rev. 2.1. Kilder:
Danmarks Statistik (dst.dk, «Dansk Branchekode 2025 er gældende») og
Erhvervsstyrelsen. Målt med stikprøver mod cvrapi.dk 3/9: `478100`
(detailhandel med motorkøretøjer) og `953190` (reparation af
motorkøretøjer i.a.n.) findes kun i DB25 — bilområdet er splittet op, og
DB07's afdeling 45 er nedlagt. Havde motoren fulgt opgaven, ville
bilbranchen have mappet mod en afdeling der ikke findes.

Motoren er bygget mod DB25 (fixture `src/lib/__fixtures__/
db25-branchekoder.txt`, hentet fra Danmarks Statistik 3/9). DB07-koder
fra før 2025 er IKKE understøttet; de findes kun på virksomheder
oprettet før skiftet, som migration `20260329212047` backfyldte. Hvor
DB07 nævnes nedenfor og i §10, er det rettet til DB25 — undtagen hvor
det handler om netop den historik.

**Læren** (bogført i OVERLEVERING DEL 1 og DEL 4): et register vi bygger
på kan være skiftet ud, uden at noget i repoet siger det. Slå op frem
for at huske — det gælder ikke kun tredjepartsværktøjer som Stripe, men
også offentlige registre.

### Beslutningen

Ny ren motor, **motor før flade**: `udledBranchekode(db25: string):
{ industry_code, industry_label } | null` → app-taksonomiens
`industry_code` (nøglerne i `INDUSTRY_OPTIONS`/`industry_benchmarks`,
48 underkategorier, målt `Settings.tsx:25-108` og seed
`20260329190316:143-268` + `211955`). Kaldes ved oprettelsen (trin 4,
bygget og deployet 3/9 i #556 — bevis udestående, se §9). Opslag fra det
mest specifikke niveau til det groveste:
seks cifre → fire → tre → to (afdelingen); første niveau der HAR en
post afgør, også når posten er null.

**Besluttet 3/9 (Jonas), skrevet ind i motorens filhoved:** motoren
sætter `industry_code`; `industry_label` sættes KUN hvis den er tom —
der overskrives aldrig noget nogen har skrevet. Rammer mappingen ikke,
står begge felter tomme, og der sættes ALDRIG `other_general`.

**Rammer mappingen ikke, står feltet TOMT, og tjeklisten spørger
medlemmet.** Der sættes ALDRIG `other_general` som fald tilbage.
Begrundelse: en grov sammenligning der ser rigtig ud, men er tilfældig,
er værre end ingen — fordi ingen opdager den. Et tomt felt er synligt
(NoegletalView viser ingen branchesammenligning, `:429`; tjeklisten
viser «Branche» som mangler, `onboardingTjekliste.ts:160`); en forkert
benchmark ser ud som et tal.

### Hvorfor CVR-koden (DB25) ikke bare lægges i `industry_code` — målt

- `industry_code` er nøgle til `industry_benchmarks.industry_code`
  (NoegletalView.tsx:431-433, generate-weekly-focus:272-274,
  Settings.tsx:598-602, migration 212047:47). Tabellens koder er
  app-taksonomiens (`retail_other`, `tech_software`, …; 66 seedede
  koder). En DB25-kode som `620100` matcher ingen række → nul
  benchmarks, uden fejl.
- `byggVirksomhedsRaekke` sætter derfor bevidst `industry_code: null`
  (`src/lib/virksomhedsraekke.ts:126-133` og Deno-spejlet), låst af
  `virksomhedsraekke.test.ts:134`. Kommentaren siger ordret «CVR's
  NACE/DB07-tal må IKKE i industry_code … en NACE-kode giver nul
  benchmarks» — «DB07» dér er kodens egen ordlyd fra før rettelsen;
  pointen gælder uændret for DB25.
- CVR-koden bevares allerede: `hentCvrData` returnerer `industry_code =
  String(data.industrycode)` og `industry_label = data.industrydesc`
  (`_shared/virksomhedsOprettelse.ts:77-82`, kilde cvrapi.dk), og hele
  svaret gemmes i `application_context.raw_cvr_data`
  (`virksomhedsraekke.ts:156`). Kun for virksomheder oprettet gennem
  rækkebyggeren med et CVR der slog op; ved GENBRUG på CVR slås CVR
  ikke op igen (`virksomhedsOprettelse.ts:100-112`, `cvr_svar: null`).

### Hvad motoren bygger på

DB25 følger NACE rev. 2.1's struktur: seks cifre, hvor de to første er
afdelingen (fx `62` = Computerprogrammering, konsulentbistand mv.).
DB25 har 87 afdelinger og 738 underklasser (Danmarks Statistik; fixture
`db25-branchekoder.txt`). Mappingen er en tabel afdeling →
`industry_code | null`, plus undtagelser på tre, fire eller seks cifre
hvor afdelingen spænder over flere af vores underkategorier (fx
afdeling `47` detailhandel dækker `retail_grocery` … `retail_other`;
gruppen `478` — DB25's afløser for DB07's afdeling 45 — giver
`retail_automotive`). **Tabellens indhold er lavet 3/9 (#553)**, med
begrundelse pr. række i filen; 113 tests, pr. afdeling der er mappet OG
pr. afdeling der bevidst giver null. Formidlingsklasserne, som DB25
indførte, står konsekvent som null.

Motoren lever i `src/lib/branchekode.ts` og har én import: taksonomien i
`src/lib/brancher.ts`, så Settings og motoren deler én kilde til
labels. **`INDUSTRY_OPTIONS` er flyttet ordret fra `Settings.tsx` til
`src/lib/brancher.ts` i #553** (Settings importerer den derfra) — det er
§9 trin 2's kodedel, gjort sammen med trin 1. **Trin 2 bevist i prod
3/9 formiddag:** branche-vælgeren i Indstillinger virker efter
Update-klik — grupper og underkategorier står som før, nuværende værdi
læses korrekt; flytningen brød ingenting.

**Trin 3–4 bygget og deployet 3/9 (#556):** `byggVirksomhedsRaekke`
oversætter nu CVR-registrets DB25-kode til app-taksonomiens
`industry_code`. Motoren og taksonomien er spejlet til `_shared/`
(`branchekode.ts`, `brancher.ts`); paritetstesten
(`branchekodeParitet.test.ts`) importerer begge kopier, sammenligner alle
fire tabeller felt for felt og kører hele registret (738 underklasser)
gennem begge. `industry_label` sættes kun hvor feltet ellers ville være
tomt: input vinder, så CVR-teksten, og motorens label sidst. Kun ved
oprettelse — ved genbrug på CVR røres branchefelterne ikke.
`virksomhedsraekke` havde før nul imports som bevidst egenskab; nu én
(`./branchekode`), og importstien er den eneste tilladte forskel mellem
kopierne (som `fornyelse.ts`). `monday-webhook` og `import-application`
er deployet 3/9 via build-chat; begge svarer 401 uden gyldig
autorisation, ikke 404. **Ikke bevist:** at en ny virksomhed faktisk får
`industry_code` sat — 401 beviser kun at funktionen svarer, ikke at det
er den nye kode (samme forbehold som stripe-webhook 2/9). Beviset kommer
ved næste rigtige oprettelse gennem «Godkendt» eller «Importér
ansøgning». Onboarding.tsx' egen 15-liste døde med porten (trin 7).

### De to felter — målt forskel; `industry_label` BESLUTTET 3/9

**Besluttet 3/9 (Jonas):** motoren sætter `industry_label` KUN hvis den
er tom — aldrig overskrive noget nogen har skrevet. Rammer motoren ikke,
står begge felter tomme. Det er forslaget nedenfor med én ændring: en
eksisterende label rører motoren ikke. Forslaget står som skrevet 2/9 for
begrundelsens skyld.

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

**✅ GENNEMFØRT OG BEVIST I DRIFT 3/9 formiddag (PR #557) — blindgyden
er lukket. Besluttet anderledes end «Skal blive» ovenfor (Jonas 3/9,
valg B):** INGEN grænse, og det er bevidst. Efter #554 er tier null for
en ikke-rådgiver ALDRIG en ventetilstand: hænger et opslag ved login,
holder `loading` porten, og `MemberRoute` viser `HbSpinner` — Index
tegnes ikke. Tegnes siden med tier null, er opslaget afgjort: svaret var
«ingen virksomhed» (`companyResolution = "none"`), eller `fetchUserData`
kastede (`"pending"` med `loading` falsk). Der er intet at vente på, så
en timeout ville være venten på noget der ikke sker — gaten kommer med
det samme. Index viser nu `CompanyLinkFailedGate` for enhver
ikke-rådgiver med tier null, ikke skelettet. Den tredje vej ind i
skelettet var ikke en fejl og er lukket i `useAuth` i stedet:
PPI-succesgrenen satte `companyId` men aldrig tier, så et nykoblet
medlem stod på skelettet til næste auth-event — gaten ville have sagt at
noget gik galt om noget der gik godt. Grenen sætter nu tier med samme
regel som trin D, udtrukket til `afgoerMedlemsTier` frem for skrevet af.
De to grene i Index (`failed` før fornyelses-kvitteringen, tier null
efter) er bevidst IKKE slået sammen: kvitteringen står imellem dem og
beholder sin forrang. Skelettet er ikke konverteret til Hb-tokens — det
tegnes ikke længere (`DashboardSkeleton` har ingen kaldere, §10).
**Bevist i drift 3/9 kl. 08:53 med en fremkaldt tilstand:**
`company_members`-rækken for `jonas+test3@topix.dk` blev slettet
(`cm_id 3f1e4f23-db8a-4e99-a868-4952641038d4`); login gav
`CompanyLinkFailedGate` — «Vi mangler et led, Jonas» med Prøv igen,
Skriv til os og Log ud — og IKKE skelettet. Rækken er rullet tilbage med
sit oprindelige id og tidsstempel; FLOOR1 har igen tre medlemmer. SELECT
før og efter i begge retninger. *Metoden:* en blindgyde kan fremkaldes
billigt på en testbruger der alligevel skal slettes. Ingen havde set den
skærm før.

**✅ GENNEMFØRT OG BEVIST I DRIFT 3/9 morgen (PR #554) — det grønne
blink efter login er væk.** `useAuth` sætter nu `loading = true` ved
OVERGANGEN ingen-session → session, læst fra en `useRef`
(`havdeSessionRef`) — ikke fra `user` i closure, fordi handleren
registreres én gang med tomme deps og derfor altid ser mount-værdien.
Markøren nulstilles i grenen uden session (SIGNED_OUT, INITIAL_SESSION
uden session), så et nyt login efter en udlogning igen holder porten.
Betingelsen er bevidst overgangen og IKKE `_event === "SIGNED_IN"`:
auth-js 2.97 udsender SIGNED_IN i fire situationer ud over login
(`~/Downloads/recon-loading.md` §3) — (1) faneskift tilbage til appen
(`_onVisibilityChanged → _recoverAndRefresh`), (2) cross-tab broadcast
fra en anden fane, (3) kodeordsskift i Settings (re-auth via
`signInWithPassword`), (4) hard reload. I alle fire findes brugeren
allerede, og et `loading = true` ville afmontere hele rute-træet under
guarden og smide kodeordsfelter, upload-tilstand og Tiptap-kladder væk
midt i en handling. Kommentaren i koden lister de fire, så betingelsen
ikke «forenkles» senere. **Bevist af Jonas 3/9, alle fire scenarier:**
log ud og ind giver ingen mørkegrøn skærm; faneskift midt i en session
giver ingen spinner; kodeordsskift i Settings gennemføres uden at
felterne forsvinder; hard reload uændret. Skelet-grenen i `Index.tsx`
er URØRT — den skal stadig gøres lys og have en udvej, men det er trin
10 (blindgyden), en anden rettelse. Målingen og retningen fra 3/9 nat
står nedenfor som historik.

**Det grønne blink efter login — MÅLT 3/9, rettet samme morgen (ovenfor)**
(`~/Downloads/recon-groent-blink.md`). Jonas så et stort grønt
blink EFTER login, før forsiden — også efter at spinnerne blev
`HbSpinner` (#551). Det er ikke en spinner. Det er SAMME gren som
blindgyden: `Index.tsx:202-208` tegner det gamle `DashboardSkeleton`
inde i `AppLayout` — fuld skærm ≈ #101E1C, 256 px sidebar ≈ #0E2521,
sytten kort med pulserende blokke, fade-in 0,4 s. `index.html`
hardkoder `<html class="dark">`, så alt uden for `.theme-hjemmebane`
løses i den mørkegrønne palet. Det er det eneste sted på medlemmets
forside-vej hvor `AppLayout` stadig rendres.

*Årsagen:* `useAuth` sætter `user` synkront ved `SIGNED_IN`, men sætter
ALDRIG `loading` tilbage til `true` — den var allerede `false` på
/auth (der findes intet `setLoading(true)` i filen ud over `useState`).
Så slipper `AuthRoute` og `MemberRoute` igennem med det samme, mens
`membershipTier` er `null`, og Index rammer skelet-grenen. Vinduet er
tre sekventielle Supabase-rundture i `fetchUserData` (roller/profil/
company_members → legat → tier). Ved HARD RELOAD sker det ikke:
`loading` er sand fra start, `HbSpinner` vises, og tier er sat før
Index tegnes. Blinket er specifikt for login-overgangen.

*Besluttet retning (Jonas 2/9 nat; bygget og bevist 3/9 morgen, #554,
se ovenfor):* rettelsen er IKKE at
konvertere `DashboardSkeleton` — det ville være at gøre ventetiden
pænere. Rettelsen er at sætte `loading = true` når `SIGNED_IN` fyrer og
`fetchUserData` går i gang, så `MemberRoute` holder porten lukket til
tier er afgjort — præcis som ved hard reload. Så rammes skelet-grenen
aldrig på login-vejen. **Forbehold:** `loading` er auth-kontraktens
mest brugte felt. Kræver recon på hvem der læser det FØR linjen skrives;
en fejl viser sig som en spinner der ikke går væk. Skelet-grenen skal
STADIG gøres lys og få en udvej — men det er trin 10 (blindgyden), ikke
denne rettelse. Trin 13 i §9.

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

**BESLUTNING (Jonas, 2/9 nat): næste spor er trin 10–12, hele
Auth-fladen til Hjemmebane.** Loginsiden skal ikke kun konverteres,
men gøres BEDRE: den er det første et menneske ser af platformen, og i
dag er den en centreret boks med tre felter. Om der skal være mere end
formularen på skærmen, er ikke afgjort.

### ✅ GENNEMFØRT 2/9 nat — hele Auth-fladen er Hjemmebane (trin 11–12)

- **#549 — signup som delt skærm.** Formularen til venstre; til højre
  virksomhedens navn, de to rådgiverportrætter og én linje («To
  rådgivere, der følger din virksomhed tæt — og et sted, hvor dine tal
  bliver til beslutninger.»). Kontekst-spalten står først i DOM, så den
  på mobil ligger øverst. Uden invitation vises intet virksomhedsnavn.
  Ny delt komponent `HbRaadgiverPortraetter` — fem steder i huset skrev
  hver sin `<img>` (recon-portraetter.md); de fire øvrige flytter
  senere. Rettet med: `BookSessionView` pegede på `/morten-larsen.png`,
  som ikke findes — Morten-kortet havde vist initialerne «ML» siden maj.
- **#550 — login og de øvrige tilstande.** Login er bevidst rolig —
  ingen delt skærm, ingen portrætter, ingen citater. Den ses hver uge;
  signup ses én gang. Nulstil, «Tjek din mail» og «Konto oprettet» i
  samme ramme. Google fjernet fra signup (§3). 251 linjer væk, 140 til;
  signup-grenene inde i det gamle login-træ ryddet.
- **#551 — spinnere, ResetPassword, 404.** `HbSpinner` erstatter de tre
  ens spinnere i App.tsx (ProtectedRoute, MemberRoute, Suspense) og
  `AuthRoute`s tomme `null`. Hairline-grå, ikke brandgrøn. Importerer
  selv `hjemmebane.css`, fordi den kan være det allerførste der tegnes.
  Feltklasserne flyttet fra Auth.tsx til `hjemmebane/hbFormKlasser.ts`
  og delt med `ResetPassword` og 404. ResetPassword og NotFound
  konverteret; adfærd ordret bevaret. `ErrorBoundary` bevidst urørt
  (§7.6).
- **Bevist i drift:** grep efter `bg-background`, `text-muted-foreground`
  og `glass-card` i Auth.tsx, ResetPassword.tsx, NotFound.tsx og
  HbSpinner giver nul. Jonas bekræftede login, signup og nulstil på
  skærm 2/9 nat. Bogført i konvergens.md §1 (/auth, /reset-password, 404).
- **Ikke gjort her:** §7.2 (dødt/brugt token), §7.3 (indlogget browser),
  §7.4 (fejl-parametre) og §7.7 (invitationsmailens tekst) er stadig
  åbne — de var lagt under trin 11, men er ikke bygget.

### 7.6 ErrorBoundary og 404 — med eller uden for epic'et

- **404 (`NotFound.tsx`): MED — ✅ GENNEMFØRT 2/9 nat (#551).** Målt:
  standalone side, ingen skal, tre linjer, gamle tokens. Et nyt medlem
  kan ramme den fra et forkert skrevet link i en mail. Nu Hjemmebane:
  «Siden findes ikke» + én linje + «Til forsiden», samme ramme som Auth;
  loglinjen bevaret.
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
- Google-LOGIN (§3). Google på SIGNUP er derimod fjernet (#550) — se §3.

---

## 9. Rækkefølge

Ét trin pr. linje. Hvert trin kan bevises i drift for sig; motorer før
flader. «Bevis» = hvad der måles før næste trin begynder.

1. **✅ BYGGET 3/9 morgen (PR #553) — Motor `udledBranchekode`**
   (`src/lib/branchekode.ts`, ren, tabel afdeling → kode + undtagelser
   på tre/fire/seks cifre, tests pr. afdeling der er mappet OG pr.
   afdeling der bevidst giver null). Bevis: `bun run test` grøn, 113 nye
   tests. *Rettelse undervejs:* registret er DB25, ikke DB07 (§6) —
   tabellerne er bygget mod DB25's 87 afdelinger. Beslutninger skrevet
   ind i filhovedet: `industry_code` sættes; `industry_label` kun hvis
   tom; ingen `other_general`. Ingen aftager endnu.
2. **✅ BEVIST I PROD 3/9 formiddag — Taksonomien som ét modul**
   (`INDUSTRY_OPTIONS` ud af `Settings.tsx` til `src/lib/brancher.ts`;
   Settings importerer; kodedelen i #553). Bevis målt: branche-vælgeren
   i Indstillinger virker efter Update-klik — grupper og underkategorier
   står som før, nuværende værdi læses korrekt. Flytningen brød
   ingenting.
3. **✅ BYGGET 3/9 (PR #556) — Spejl til Deno + paritetstest**
   (`_shared/branchekode.ts` + `_shared/brancher.ts`,
   `branchekodeParitet.test.ts`: importerer begge kopier, sammenligner
   alle fire tabeller felt for felt og kører alle 738 underklasser
   gennem begge). Bevis: paritetstest grøn.
4. **✅ BYGGET OG DEPLOYET 3/9 (PR #556) — Motoren kaldes ved
   oprettelsen** (i `byggVirksomhedsRaekke`; `industry_code` fra motoren;
   `industry_label` kun hvor feltet ellers ville være tomt — input, så
   CVR-tekst, så motorens label; kun ved oprettelse, ikke ved genbrug på
   CVR). `monday-webhook` og `import-application` deployet 3/9 via
   build-chat; begge svarer 401 uden gyldig autorisation, ikke 404.
   **BEVIS UDESTÅENDE:** at en ny virksomhed faktisk får `industry_code`
   sat — 401 beviser kun at funktionen svarer, ikke at det er den nye
   kode (samme forbehold som stripe-webhook 2/9). Bevis: næste rigtige
   oprettelse gennem «Godkendt» eller «Importér ansøgning» giver en
   række med `industry_code` sat (SQL editor), og NoegletalView viser
   branchesammenligning for den.
5. **✅ BEVIST 2/9 kl. 21:56 — Mailbekræftelsen slået fra** (Lovable →
   Cloud → Users → Auth settings → Email → «Auto-confirm email» TIL, kl.
   ca. 21:54; §3). Bevis målt: `confirmation_sent_at = NULL`,
   `email_confirmed_at` +0,25 sek., «Tjek din mail» vist ikke, logget
   ind straks; triggeren koblede korrekt.
6. **✅ BEVIST 2/9 kl. 20:53 (PR #544) — `profileOnboarded` ud af agentens betingelse** (§4-beslutningen:
   `useAuth.tsx:254` bliver `onboarding_completed === false &&
   application_context`, som Onboarding.tsx:89). Bevis: ny konto med
   `onboarded_at` NULL → `companies.onboarding_completed` skifter til
   true ved første login, og agentens loglinje (`run-company-agent`,
   trigger `onboarding`) står i Supabase-loggen; eksisterende medlem
   med `onboarding_completed = true` udløser intet. *Målt:* `agent_runs`
   1 → 2 på FLOOR1 med `onboarded_at` NULL; flaget måtte nulstilles
   manuelt først (§4).
7. **✅ BEVIST 2/9 kl. 23:03 (PR #545) — Porten pensioneres** (de seks steder i §4; `/onboarding` → `/`).
   Bevis: ny konto lander på `/` uden at passere `/onboarding`;
   eksisterende medlem uændret; `grep needsOnboarding` = nul. *Målt:*
   test3 fra adgangskode til forside uden `/onboarding`; grep = nul;
   seks skærme blev til tre (§4).
8. **✅ BEVIST MED TESTS 2/9 (PR #546) — Ankomstens motor** (§5-beslutningen, motor før flade): `deriveFocus`
   udvides med (1) `contract_start_date` som input, så slot (a) ikke
   beder om tal fra før virksomheden fandtes, og (2) tjeklisten som
   kilde med førsteprioritet så længe `byggTjekliste(...).faerdig` er
   falsk — første ikke-gjorte punkt som #1, resten som linjer. Rene
   funktioner, tests pr. slot og pr. overgang (sidste punkt gjort →
   almindelig prioritering). Bevis: `bun run test` grøn, testene læst.
   *Målt:* 1234 grønne, 21 nye; else-grenen rettet undervejs (§5).
9. **✅ BEVIST I DRIFT 2/9 kl. 23:20 (PR #547) — Ankomstens flade** (§5): `FocusCard` viser tjeklistekilden i sin
   eksisterende form; hilsenen får grenen «Velkommen, {fornavn}.» så
   længe intet er gjort; pillens rolle i ankomsten afgjort (§10). Bevis:
   testbruger med nul data ser «Velkommen, {fornavn}.» og første
   tjeklistepunkt som fokus; efter alle punkter er gjort, ser samme
   bruger «Godmorgen/…» og slot (a)–(i); med en test-GUID i
   `velkomstvideo_guid` bliver «Se velkomsten» første linje uden anden
   ændring. *Målt:* «Velkommen, Jonas.» + «Din profil» som fokus med
   «Gør det nu», tre punkter som linjer (§5). Pillens rolle er IKKE
   afgjort (§10); «efter alle punkter er gjort»- og GUID-beviserne er
   ikke kørt endnu.
10. **✅ GENNEMFØRT OG BEVIST I DRIFT 3/9 kl. 08:53 (PR #557) —
   Blindgyden lukket** (§7.1, valg B: INGEN grænse — tier null er efter
   #554 aldrig en ventetilstand; `none` og et kastet `fetchUserData` er
   fejl og viser `CompanyLinkFailedGate` straks; PPI-succes sætter nu
   selv tier via `afgoerMedlemsTier`; skelettet tegnes ikke længere og
   er derfor ikke konverteret). Bevis målt: `company_members`-rækken for
   `jonas+test3` slettet → login gav gaten «Vi mangler et led, Jonas»
   med Prøv igen, Skriv til os og Log ud, ikke skelettet; rækken rullet
   tilbage med oprindeligt id og tidsstempel, SELECT før/efter.
11. **✅ GENNEMFØRT 2/9 nat (#549, #550, #551) — /auth til Hjemmebane**
    (§7.5: alle fem tilstande + spinnerne + `/reset-password`). Bevis
    målt: grep efter gamle tokens i de fire filer = nul; Jonas
    bekræftede login, signup og nulstil på skærm; konvergens.md
    opdateret. *Rest uden for det byggede:* §7.2 dødt/brugt token, §7.3
    indlogget browser, §7.4 fejl-parametre, §7.7 invitationsmailens
    tekst — stadig åbne.
12. **✅ GENNEMFØRT 2/9 nat (#551) — 404 til Hjemmebane** (§7.6).
13. **✅ GENNEMFØRT OG BEVIST I DRIFT 3/9 morgen (PR #554) — Det grønne
    blink efter login** (§7.1). Reconen kom først
    (`~/Downloads/recon-loading.md`: ti læsere af `loading`, fem guards
    og fem sider; og auth-js udsender SIGNED_IN ved faneskift, cross-tab
    broadcast, re-auth og hard reload). Derfor sættes `loading = true`
    ved OVERGANGEN ingen-session → session via en `useRef`, ikke ved
    event-typen; markøren nulstilles når sessionen forsvinder. *Bevist
    af Jonas 3/9, alle fire scenarier:* log ud og ind uden mørkegrøn
    skærm; faneskift uden spinner; kodeordsskift i Settings uden at
    felterne forsvinder; hard reload uændret. Skelet-grenen i Index er
    urørt (trin 10).
14. **Bogføring**: dette dokument opdateres pr. trin med dato og bevis;
    OVERLEVERING DEL 2/3 peger hertil. Testopstillingen (§11) fjernes
    når ruten er bevist — den ER bevist 3/9, og opstillingen er vokset
    med en Stripe-side (kunde, faktura, kreditnota) fra dag 31-beviset,
    som oprydningen skal tage med.

**RUTEN ER FÆRDIG (3/9 formiddag).** Trin 5–13 er bevist i drift: 5–9
den 2/9, 11–12 den 2/9 nat, 13 den 3/9 morgen (#554), 10 den 3/9 kl.
08:53 (#557). Trin 1–4 (branchen) er bygget og deployet: 1 og 2 i #553
(2 bevist i prod 3/9 formiddag), 3 og 4 i #556 — med ét udestående
bevis for trin 4 (en rigtig oprettelse med `industry_code` sat). Fra
invitationslink til Dit Boardroom: to skærme, Hjemmebane hele vejen, en
ankomst der tager imod, og ingen tilstand hvor et medlem kan stå fast
uden en vej videre. Det der står tilbage, er ikke ruten: §10's åbne
punkter og trin 14's oprydning (testopstillingen i §11).

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
- **LØST 3/9 — `industry_label` når motoren rammer/ikke rammer** (§6):
  sættes KUN hvis den er tom; rammer motoren ikke, står begge felter
  tomme. *Stadig åbent:* hvad der sker med `import-application`s
  enrich-guard og `EditCompanyDialog`s fritekstfelt — ikke besluttet.
- **LØST 3/9 (#553) — Mappingtabellens indhold**: skrevet med
  begrundelse pr. række i `src/lib/branchekode.ts`, mod DB25 (§6).
- **Backfill af eksisterende virksomheder** uden `industry_code` fra
  `application_context.raw_cvr_data`: antal, og hvor mange der har en
  kode gemt — UKLART. Bemærk registerskiftet (§6): virksomheder slået op
  før 1/1 2025 bærer en DB07-kode, som motoren ikke forstår; kun
  DB25-koder kan udledes. Er en datarettelse (SELECT før/efter, guard
  `industry_code IS NULL`), ikke en del af trin 4.
  *Målt 3/9 formiddag — branchedataene i prod:* syv af 32 aktive
  virksomheder har ingen `industry_code` og dermed ingen benchmarks; to
  (WESDEX `439100`, Two Socks `563020`) har en REGISTERKODE stående i
  feltet og får derfor heller ingen; tre har værdier motoren aldrig
  ville sætte (`other_general`, `travel_event`, `tech_startup`); flere
  har en kategori der er uenig med CVR-registreringen (ANLA GLAS, Limo
  Group, Topix) — hvem der har ret kan ikke afgøres fra data, da en
  virksomhed kan skifte aktivitet uden at rette sin branchekode.
  Oprydningen er en datarettelse, ikke en kodeopgave.
- **Kontakt-email er tom på de fleste virksomheder**, herunder Topix
  (set 3/9 i Indstillinger). `sikrIndgangsInvitation` læser
  `companies.contact_email` og kræver feltet for at kunne sende
  invitationen. Hører sammen med branche-oprydningen — samme formular.
  Åbent.
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
  *Set på skærm 2/9 kl. 23:20 (test3):* pillen står nu med SAMME
  punkter som fokuskortet. **Claudes dom efter at have set det:** pillen
  bør trække sig mens kortet bærer punkterne — to lister med samme
  indhold på én skærm er støj. **Ikke besluttet af Jonas endnu.**
- **Velkomst-punktet står uden knap i fokuskortet** (trin 9): sti «»
  åbner videooverlejringen, som er tjekliste-boksens egen state, og
  forsiden har ingen kobling til den. Rammer ikke i dag, fordi
  `velkomstvideo_guid` er tom — men ankomstens FØRSTE punkt bliver
  noget man ikke kan trykke på, den dag videoen sættes. **Skal løses
  før GUID'et sættes.**
- **«Dine tal»-kortets tomme tilstand står nederst på forsiden**, under
  podcast og «Værd at se igen» — langt nede for et medlem hvis eneste
  opgave er at komme i gang. Ikke rørt i trin 9.
- **LØST 3/9 (#557) — N sekunder** før skelettet giver op (§7.1): der
  er ingen N. Tier null er efter #554 aldrig en ventetilstand, så gaten
  vises straks; en grænse ville være venten på noget der ikke sker.
- **`DashboardSkeleton` er død kode** (målt 3/9 efter #557: fire
  træffere i `src/`, alle kommentarer — Index, useAuth,
  CompanyLinkFailedGate). Ikke slettet i #557 for at holde rettelsen
  smal. Ryddes i en senere omgang.
- **Dødt vs. brugt token** (§7.2): kræver at RPC'en svarer med en grund
  for ikke-pending tokens — ændrer hvad et token afslører (i dag: intet
  for brugte). Ikke besluttet.
- **Kollega-invitationen** (§7.3 + indgangsfladen §13): en indlogget
  bruger med pending invitation til en anden virksomhed. Ikke designet.
- **LØST 2/9 nat — Google-vejen med invitationstoken** (§3): Google er
  fjernet fra signup (#550), kun login har den. Erstattet af punktet
  nedenfor.
- **Kobl en Google-konto på en eksisterende konto** (Jonas 2/9 nat): den
  rigtige løsning på Google-vejen er en kontoindstilling, hvor et medlem
  bagefter knytter sin Google-konto til den konto invitationen skabte —
  ikke Google på signup. Selvstændigt stykke; ikke designet.
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

Bruges til at bevise ruten i drift (trin 5–9 bevist på den 2/9).
Fjernes helt når ruten er bevist; intet af det er kundedata.

| hvad | værdi |
|---|---|
| Virksomhed | **FLOOR1 I/S**, `companies.id = fea24b90-3252-45f3-a2fb-f15fda3f2402`, CVR 41772239 |
| Oprettet | 2/9 kl. 21:47 via «Importér ansøgning» (`import-application`) med en Excel-fil vi selv lavede |
| Tilstand | `status = 'active'`, kontrakt 02.09.2026–02.09.2027, `vis_i_netvaerk = false` (sat 2/9 kl. 21:50, så den ikke ses i Netværket — det eneste felt der tager den ud af noget uden at tage adgangen, `recon-testvirksomhed.md` §2) |
| Bruger, trin 5 | `jonas+test1@topix.dk`, `user_id d06f68cc-76b3-4793-a575-85c0e6e657c2` — signup 2/9 kl. 21:56, porten gennemført kl. 21:58 |
| Bruger, trin 6 | `jonas+test2@topix.dk` — beviste 2/9 kl. 20:53 at agenten fyrer med `onboarded_at` NULL (`agent_runs` 1 → 2; `onboarding_completed` nulstillet manuelt først) |
| Bruger, trin 7 + 9 | `jonas+test3@topix.dk` — signup 2/9 kl. 23:03 uden `/onboarding`; kl. 23:20 «Velkommen, Jonas.» + «Din profil» som fokus. `onboarded_at` NULL for både test2 og test3 |
| Adresser | Én adresse pr. trin, fordi en brugt adresse ikke kan genbruges (kontoen findes i `auth.users`). `UNIQUE (company_id, email)` tillader flere adresser på samme virksomhed |
| Synlig hvor | /members' liste og AdvisorDashboard (status active, ikke legat), MemberDetail; ikke i Netværket. `is_demo` findes ikke i repoet og ændrer intet (`recon-testvirksomhed.md` §1) |
| Blindgyden, 3/9 kl. 08:53 | test3's `company_members`-række slettet og rullet tilbage (trin 10, §7.1) |
| **Dag 31-kæden, 3/9 kl. 10:00–10:11** | Opstillingen er VOKSET (`docs/indgangen-design.md` §30): adresse sat (Vestergade 41, 1. tv, 8600 Silkeborg — CVR-registrets), kontraktdatoerne nulstillet og sat igen af webhooken (2026-09-03 → 2027-09-03), `company_betalingslink`-række (prisniveau 5.000.000 øre, stemplet `faktura_invoice_id`, `faktura_sendt_at`, `sidste_paamindelse_dag 31`), `company_perioder`-række (`betalingsmodel 'faktura'`), **Stripe-siden:** kunde `cus_VBtMOGBenIfWt4` (skrevet i `companies.stripe_customer_id`), faktura TBR-0003 / `in_1UBVaB3CvBmCx5PtAQOPtqVN` (62.500 kr inkl. moms, markeret betalt uden for Stripe), kreditnota TBR-0003-CN-01 («Credit outside of Stripe»). Regnskabet er rent, men objekterne findes. |

**Oprydning når ruten er bevist:** `hardDeleteCompany` med
`deleteUsers: true` (via `admin-cleanup-test-data` `hard_delete_company`
med `delete_users: true`, dry-run først), plus de rester
`recon-testvirksomhed.md` §4–5 nævner: storage-objekter (`financial-
documents/{company_id}/…`, `company-logos`, `chat-attachments/{user_id}/…`),
notifikationer uden `company_id`, og `user_id`-tabeller uden FK-cascade
(`conversation_last_seen`, `message_reactions`, `report_comments`,
`circle_*`, `group_*`). `group_companies` ville blokere sletningen af
`companies`-rækken hvis en række findes (FK uden `ON DELETE`). SELECT
før/efter, og bogfør FØR-værdierne her. **Nyt 3/9: oprydningen skal
tage Stripe-siden med, ikke kun databasen** — kunden
`cus_VBtMOGBenIfWt4`, fakturaen `in_1UBVaB3CvBmCx5PtAQOPtqVN` og
kreditnotaen TBR-0003-CN-01 ligger på The Boardrooms Stripe-konto
(fakturaer kan ikke slettes i Stripe, kun voides/krediteres — det ER
gjort; kunden kan slettes). Ruten er bevist 3/9, så oprydningen kan gå
i gang.

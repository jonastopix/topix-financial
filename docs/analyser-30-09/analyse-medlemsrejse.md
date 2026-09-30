# Medlemmets rejse i The Boardroom — fra første login til fornyelse

> 30/9-2026. Repoet er kun læst (worktree `/home/claude/wt-rejse`, HEAD `49d5218`, origin/main). Intet er ændret, og intet er målt i prod.
> Tal fra prod er citeret fra dokumenter i repoet, med kilden ved siden af. Alt andet er kodelæsning, og det står der.
> Analysen bygger videre på `docs/analyser-30-09/gamification-analyse.md` og `community-analyse.md` og gentager dem ikke.
> Regel §4a («Værdi før byg») gælder: hver mulighed har en linje om, hvordan værdien måles. Ingen af de ti er bygget, og ingen er værdivurderet i prod endnu.

---

## 0. Konklusionen først

Platformen er allerede langt fremme på det, man normalt ville foreslå. Følgende findes:

- «Hvad skal jeg gøre nu» — fokus-motoren `deriveFocus` i `nextStep.ts:200`.
- Ankomst-tjeklisten, som er forfremmet til fokuskort.
- «Din måned», som viser tre tal med retning.
- Fejring af gjorte skridt (`FejringRaekke`).
- Rejselinjen, fornyelsesbåndet og certifikatet.

Forsiden er med andre ord ikke svagheden. Svagheden er fire andre ting:

1. **Det vigtigste månedlige øjeblik har ingen scene.** Medlemmet godkender sine tal og får en toast med «Se KPI'er →», som genindlæser hele siden. Kommentaren, agentens indsigt, ugens fokus og refleksionen lander hver for sig på fire forskellige steder bagefter. Refleksionen lander endda i det gamle mørke design (`/pulse`).
2. **Rådgiverens råd og medlemmets tal lever adskilt.** Rådgiverens graf-kommentar ligger kun under én nøgletalsgraf. Notifikationen peger på `/kpis` uden nøgletal og viser den rå nøgle «2026-07». Sessionsnoter (`advisor_session_notes`) har ingen flade overhovedet. Bookede sessioner vises aldrig med tidspunkt for medlemmet.
3. **Kerneflowet (at få tallene ind hver måned) er stadig manuelt.** Antallet, der rapporterer, falder: 17, 14, 12, 9, 8 af 30 (OVERLEVERING:11508, målt 4/9). 14 af 33 har aldrig haft en målt måned (`docs/aktiveringsmaaling-27-august.md` §2).
4. **Året har ingen bue.** Certifikatet bærer kun navn, virksomhed og periode (`certifikat/types.ts:9-18`). Fornyelsesbåndet beder om penge uden at vise, hvad året gav (`FornyelsesBaand.tsx`). Et medlem ser aldrig «måned 4 af 12».

---

## 1. Top-10 muligheder

Rækkefølgen er efter værdi for medlemmet sammenholdt med, hvor meget der allerede findes at bygge på. S betyder én PR uden migration. M betyder én til to PR'er, eventuelt med en lille migration. L betyder flere PR'er, en ny function eller integration og udrulning.

### 1. Månedsafslutningen: én scene efter «Godkend» — M

**I dag** giver `ReportReviewDialog.tsx:312-318` og `:451-456` en toast plus `window.location.href = "/kpis"`, som er en fuld genindlæsning. Samtidig kører tre ting blindt i baggrunden: `generate-financial-commentary`, `run-company-agent` og `generate-weekly-focus` (`:341-380`). Medlemmet ser aldrig, at de lander.

**Byg:** en fuldskærmsflade i Hb, «Juli er lukket», i tre trin:

- (a) Månedens tre tal mod forrige måned, mod budgettet og mod målet. Kilderne er `dinMaaned.ts`, `budgetEngine.loadBudget`/BvA og `kpi_targets`.
- (b) «Det lagde vi mærke til»: AI-kommentaren, når den lander (`useCompanyCommentary`, med poll eller realtime), og ellers «din rådgiver ser på den».
- (c) Refleksionen inline. `PulseCheckinModal` har allerede `inline`-tilstand. Det erstatter fokuspunkt (g) og flytten til `/pulse`.

Afslut med «Næste: ugens fokus» og et link til forsiden. Rejselinjen (`rejselinje.ts`) giver fejringen: «3 godkendte måneder i år».

**Måling:** andel af godkendte måneder, der får en refleksion samme dag (`pulse_checkins.created_at` mod `financial_report_facts.committed_at`). I dag er refleksionen et separat fokuspunkt.

### 2. Tallene kommer selv: e-conomic og Dinero træk i stedet for upload — L

Dette er det største løft. Det rammer kerneproblemet: faldende rapportering og 14 uden én målt måned.

**Byg på:**
- Parserens kanoniske output (saldobalance → facts med `pnl_coverage`, CLAUDE.md «Omkostningsnøgler»).
- `sourceFingerprint.detectSourceSystem` («economic»/«dinero»), som allerede genkender systemerne.
- `commit_report_facts` som den eneste skrivevej.

**Flow:** medlemmet kobler sit regnskabssystem én gang i Indstillinger → Virksomheden. En Bucket B-cron henter saldobalancen den 5. og lægger den som en rapport i «afventer godkendelse». Medlemmet får en klokke: «Dine augusttal er klar — godkend». Godkendelsen forbliver medlemmets klik; det er tjeklistens «HANDLING»-princip. Så åbner mulighed 1.

**Kræver:** OAuth/aftaletoken pr. virksomhed (en ny secret-tabel, service-role-only), en ny function og en migration. API-adfærden skal slås op, ikke gættes (Projektets regel). `bogholderi-automatisering.md` §1 har e-conomic-API'et for Topix' egen bogføring. Samme API, men en anden konto pr. medlem.

**Måling:** målte måneder pr. virksomhed pr. kvartal før og efter kobling.

**Billigere forløber (S):** «Inviter din bogholder» direkte fra upload-zonen. `CompanyInvitations` findes i Indstillinger → Teamet (`IndstillingerView.tsx:511-516`), men er ikke koblet til upload-trinnet.

### 3. Rådgiverens stemme ved tallene: én «Fra din rådgiver»-strøm — M

Tre kilder findes allerede, men er spredt:

- `kpi_chart_comments`, som kun kan ses under den valgte graf (`NoegletalView.tsx:1080-1092`).
- Agentindsigter i chatten (fokus «Din AI-chef har en ny indsigt» → `/chat`).
- Rådgiverforslag (`company_actions.proposed_by`, med ansigt via `raadgiverAnsigt`).

**Byg:** et lille afsnit i «Din måned»: «Morten om juli: …» med rådgiverens portræt (`HbAvatar`, `ansigter.ts`) og et link til grafen med nøgletallet forvalgt.

**Samtidig rettes:**
- `?kpi=`-parameter på `/kpis`. `NoegletalView` læser i dag ingen søgeparametre.
- Notifikationens `deep_link` (`notify-kpi-comment/index.ts:65`) peger i dag på `/kpis`.
- Fejlen i `period_label`, jf. §2.5.

**Måling:** læsning af kommentarer (`notifications.read_at` for `advisor_kpi_comment`) og svar i chatten inden for 48 timer.

### 4. Din næste session og hvad vi aftalte — M

`session_bookings.start_tid`/`slut_tid` findes. `BookSessionView` siger kun «Din session med Morten er booket. Du har fået en bekræftelse på mail» (`BookSessionView.tsx:458-462`), og tiden vises ingen steder for medlemmet. Kun rådgiveren ser den (`VirksomhedView.tsx:1471`, `dagensSessioner.ts`).

**Byg:**
- (a) Fokuspunkt og forsidelinje: «Session med Morten tirsdag 14:00 · Forbered: dine tal er godkendt til og med juli».
- (b) Efter sessionen: «Det aftalte vi», med skridtene oprettet af rådgiveren (`company_actions`, `proposed_by`). Referatet (`advisor_session_notes` har ingen UI i dag — kun sletning i `companyHardDelete.ts`) følger efter MVP'en i `webinar-og-referater.md`.

**Måling:** sessioner med mindst ét aftalt skridt, der bliver «gjort» inden for 30 dage.

### 5. «Dit år» — den synlige 12-måneders bue, der ender i fornyelsen — M

**Byg:** en tidslinje, «Måned 4 af 12», på forsiden under hilsenen og som en egen side, med de gjorte ting som milepæle:

- første godkendte måned
- første mål nået (`milestones.completed_at`)
- sessioner
- events deltaget (`event_registrations.response = attending`)
- lektioner (`member_progress`)
- præsentation i fællesskabet

Kilderne er `companies.contract_start_date`/`contract_end_date` og de tabeller, der står i `gamification-analyse.md` §1.1. Det holder sig inden for rammen fra 13/8: kun medlemmets eget, ingen rangering.

Ved måned 11 bliver den til **årsbrevet**: første målte måned mod seneste, mål nået, «det sagde du i marts» (refleksionerne). Det står **før** betalingsknappen i `FornyelsesBaand` og som bagside på certifikatet (`CertificatePage`).

**Måling:** fornyelsesrate for medlemmer med årsbrev mod uden (når N tillader det), og klik fra årsbrev til «Forny».

### 6. Fejring der mærkes, stadig uden konfetti — S

`FejringRaekke` findes kun for lukkede skridt og står i `FEJRING_VARIGHED_MS` (`BoardroomView.tsx:1414`, `:2204-2215`). Tre øjeblikke fejres i dag med ingenting:

- **Mål nået (100 %).** Målet «rykker ud» af planen i stilhed (`BoardroomView.tsx:2212`).
- **Første godkendte måned.** Den får den samme toast som den 12.
- **Tjeklisten færdig.** Fokuskortet skifter bare kilde (`nextStep.ts:215-230`).

**Byg:** et Hb-kort i Fraunces («Du nåede målet: …», med dato og tallet), som bliver stående til det er set. Et fælles lille felt `fejret_at` kan eventuelt tilføjes. Opslaget «Del med fællesskabet?» kan genbruge `CommunityComposer` i samme mønster som præsentationen.

**Måling:** andel af nåede mål, der deles.

### 7. «Hvad nu?» ved det, der er tomt og stille — S

Fokus-motoren dækker ajour-tilstanden («Alt er ajour» + rejselinjen). Den dækker ikke den stille uge efter tjeklisten: 63 udløbne forslag og mindre end 10 % svar (OVERLEVERING:11508). Forslagene kommer tre om ugen, men de vises ét ad gangen og uden besked.

**Byg:** når fokus kun har (j), altså ugens fokus set, foreslår kortet ÉN konkret handling ud fra data: «Du har ikke sat mål — 15 af 29 har ikke» (tallet findes allerede på rådgiverforsiden), «Budgettet mangler for 2027», «Næste event om 3 dage». Punkterne er rene og kan testes i `nextStep.ts`.

**Måling:** klik på fokuskortet pr. uge (kræver en hændelsestabel, eller brug `forside_sidst_set` plus handlingens egen tabel).

### 8. AI-rådgiveren der husker og kender rådgiverens råd — M

`FinancialAIChat` holder samtalen i `useState` (`FinancialAIChat.tsx:30`). Den er væk ved skift til fanen «Rådgiver», fordi `ChatShell.tsx:143` rendrer betinget, og den er væk ved reload. Den kender ikke ugens fokus, rådgiverens kommentarer eller medlemmets mål (kun `company_id` sendes, `:74`).

**Byg:**
- Gem tråden i en `ai_samtaler`-tabel, self-only.
- Giv `ai-data-chat` konteksten: mål, aktive skridt, seneste `kpi_chart_comments` og ugens fokus.
- Lad et svar kunne blive til et skridt («Gør det til et skridt» → `skridt-tilfoej`, samme function som forsiden).

**Måling:** AI-samtaler, der ender i et skridt, og gentagne brugere pr. måned.

### 9. Budgettet i live: «Du er 38.000 kr. foran budgettet» — S/M

Budget og BvA findes (`HbBudgetBva.tsx`), men «Din måned» nævner aldrig budgettet (`dinMaaned.ts`: «ingen sammenligning med andre» — budgettet er medlemmets eget, så det er ikke omfattet af forbuddet). Og hvis et medlem ikke har budget, siger forsiden intet om det.

**Byg:** en fjerde linje i «Din måned», «år-til-dato mod budget», og et fokuspunkt «Lav budget for 2027», når november nærmer sig. Budgetskabelonerne findes (`HbBudgetTemplateGuide`).

**Måling:** virksomheder med budget for indeværende og næste år.

### 10. Ét designsprog hele vejen: de sidste gamle rum — S

Tre steder falder medlemmet ud af Hb:

- `/pulse` rendrer `AppLayout` med den gamle menu (`PulseCheckin.tsx:30`). Forsidens fokuspunkt (g) sender hende derhen (`nextStep.ts:372`), og det samme gør chat-nudgens link. Flyttes ind i mulighed 1, eller får `HbMemberShell`.
- Abonnentmuren i chatten bruger appens tokens (`text-foreground`, `bg-primary`, `font-semibold`; `ChatShell.tsx:61`, `:71`).
- `CompanyInvitations` i «Teamet» (`IndstillingerView.tsx:512-515`, «i appens gamle tokens»).

Dette er ikke en ny funktion, men det er den billigste måde at fjerne «middelmådighed» på. Alle tre er S.

---

## 2. Fund pr. trin

«Fund» er kodelæsning, ikke prodmåling. «Mulighed» henviser til §1.

### 2.1 Indgangen: betaling → første login

- **Retur fra Stripe:** toast «Abonnement aktiveret 🎉» og derefter `setTimeout(reload, 1500)` (`Index.tsx:94-97`). Emoji i en ellers emojifri, redaktionel tone. Siden blinker væk og genindlæses, før velkomsten kan læses.
- **Fejlet kobling og ukendt tier** fører til `CompanyLinkFailedGate` med «Prøv igen / Skriv til os» (`Index.tsx:197-223`). Godt, ingen blindgyde.
- **`/onboarding` redirecter til `/`** (`App.tsx:146-149`). Gamle mail-links holder.
- **Invitationslink i en browser, der allerede er logget ind**, fører til `InvitationTilLoggetInd` (`App.tsx:229-231`). Godt.

### 2.2 Ankomsten: tjekliste og velkomst

- **Otte punkter i en fast rækkefølge** (`onboardingTjekliste.ts:17-26`), og de krydses kun af ved HANDLING. Mens listen ikke er færdig, er den fokus-motorens ENESTE kilde (`nextStep.ts:215-230`). Det er stærkt.
- **Mobil:** den udfoldede boks fylder op til 70vh, og indholdet får `pb-[72vh]` (`HbMemberShell.tsx:92-114`). På chatten monteres den ikke (`ankomst.ts`).
- **Hilsenen «Dag 1»** følger kontraktstart inden for 14 døgn (`BoardroomView.tsx:2266-2270`).
- **Manglende fejring, når listen er færdig:** kortet skifter bare kilde (mulighed 6).
- **Mailrytmen dag 0, 10 og 14–20** (`_shared/onboardingRytme.ts:16-22`) er i takt med tjeklisten.

### 2.3 Forsiden (`BoardroomView`)

- **Indlæsningen** er ren tekst, «Henter dit Boardroom…», uden skeleton (`BoardroomView.tsx:2252`). Designsproget kræver skeletons i reserveret højde (hjemmebane-designsprog §6). Hele forsiden venter på både Akademi-kataloget og facts, selvom de fleste sektioner kunne tegne uafhængigt.
- **Fejl er ikke tom** gennemført pr. sektion: plan (`:2426-2433`), events (`:2558-2560`), community (`:2616-2618`) og ulæste (`:2343-2345`). Forbilledligt.
- **«Din måned»** har tre tal og retning i ord (`dinMaaned.ts`), men ingen budget- og målkobling (mulighed 9) og ingen rådgiverstemme (mulighed 3).
- **Fokus (e) er udgået, og (f) viser ikke forslag.** Forslag bor i «Din plan», som viser dem under målet (`:2436-2548`). Der er ingen «nyt»-markering, og tre forslag om ugen forsvinder stille efter 14 dage (OVERLEVERING:11508).
- **Klik til værdi:** den vigtigste handling (upload) er 1 klik (fokus → `/reports`). At læse rådgiverens kommentar er 3+ klik (klokke → `/kpis` → vælg det rigtige nøgletal → scroll).

### 2.4 Rapportering → godkendelse (`/reports`, `ReportReviewDialog`)

- **Upload-zonen spærres ved en listefejl**, med en forklaring (`RapporteringView.tsx:631`, `:672-678`). Godt.
- **Efter godkendelse** kommer en toast plus en fuld genindlæsning til `/kpis` (`ReportReviewDialog.tsx:312-318`, `:451-456`). Tre AI-jobs fyres uden, at medlemmet får at vide, hvornår de lander (`:341-380`). Mulighed 1.
- **Samme toast for første og tolvte måned.** Mulighed 6.
- **Kerneflowet er manuel eksport** (`rapporteringTekst.ts:101-102` beskriver stien i e-conomic og Dinero). Mulighed 2.

### 2.5 Nøgletal (`/kpis`)

- **Rådgiverens graf-kommentar kan læses** som en liste under detaljegrafen for det VALGTE nøgletal (`NoegletalView.tsx:1080-1092`). Prikken er rust (`:537`), og klikket er kun for rådgivere (`:540-545`). En kommentar på et nøgletal, der ikke er valgt, er usynlig for medlemmet.
- **Fejl i notifikationens tekst.** Kaldet sender `period_label: commentPopover.periodKey` (`NoegletalView.tsx:338`), og functionen skriver `body: "Se kommentaren direkte på grafen for ${period_label}"` (`notify-kpi-comment/index.ts:63-64`). Medlemmet får «…for 2026-07», ikke «juli 2026». `deep_link: "/kpis"` (`:65`) vælger ikke nøgletallet, og `NoegletalView` læser ingen søgeparametre (grep `useSearchParams`: 0 hits). Mulighed 3.
- **AI-analysen står nederst** (`:1160`). Den genereres automatisk ved commit, men står lang scroll væk fra det øjeblik.

### 2.6 Budget (`/budget`)

- **FEJL VIST SOM TOM (alvorlig).** `loadBudget` kaster ved hentefejl (`hentAlleSider`). Effekten fanger fejlen og logger den bare (`BudgetteringView.tsx:102-103`), og `finally` sætter `dbLoaded = true` (`:105`). Så bliver `isEmptyState = dbLoaded && !selectedTemplate && !scenarioData` sand (`:196`). Et medlem MED budget ser «Kom i gang — Byg dit budget for {år}» (`:283`). Vælger hun en skabelon og gemmer, går skrivevejen gennem delete-før-insert (`budgetEngine.ts:569-580`), og det rigtige budget kan blive overskrevet. Det er husets eget anti-mønster («de nitten», DEL 1 «En queryFn kaster»). Fejlen går forrest efter §4a: «fejl som et medlem rammer».
- **`useCompanyFacts()` læses uden `isError`** (`BudgetteringView.tsx:61`). BvA'ens faktiske tal kan stille blive tomme.

### 2.7 Dine mål og skridt (`/milestones`, «Din plan» på forsiden)

- **Tom-tilstanden er en invitation** med forklaring og to knapper (`BoardroomView.tsx:2446-2455`). Godt.
- **Et mål, der når 100 %, forsvinder fra planen** («nået i planens dom og rykker ud», `:2212`). Kun skridtets fejring nævner det. Mulighed 6.
- **Baggrund:** «Én plan» fase 1–5 står som en åben beslutning (OVERLEVERING:8764).

### 2.8 Chat med rådgiveren og AI (`/chat`)

- **SENDEFEJL UDEN BESKED.** `MemberChatPane.tsx:432-439`: `if (!error && data) { … }`. Der er ingen else-gren, så en fejlet `insert` giver ingen toast og ingen linje. Teksten bliver stående i feltet, og medlemmet ved ikke, om beskeden er sendt. (Upload-fejl har en toast på `:401`.)
- **`togglePin` ignorerer fejl** og opdaterer UI optimistisk (`MemberChatPane.tsx:455-459`).
- **Løfte uden måling:** «Vi svarer typisk inden for 24 timer» (`MemberChatPane.tsx:997-998`). Ifølge `gamification-analyse.md` kan svartiden måles (`last_member_message_at` mod `last_advisor_reply_at`), men ingen gør det.
- **AI-fanen husker intet**, hverken ved fanebyt eller reload (`FinancialAIChat.tsx:30`, `ChatShell.tsx:143-153`). Mulighed 8.
- **Abonnentmuren står i gamle tokens** (`ChatShell.tsx:61`, `:71`). Mulighed 10.
- **Mobil-chatten** er rettet i #1148 og venter på Update + skærmbevis (`opstart-30-09.md` B).

### 2.9 Book session (`/book-session`)

- **Booket = ingen tid.** Medlemmet får «Din session med Morten er booket. Du har fået en bekræftelse på mail…» (`BookSessionView.tsx:458-462`), selvom `start_tid` findes i `session_bookings`. Ingen forsidelinje «din næste session». Mulighed 4.
- **Uendelig poll.** `refetchInterval: 2000` så længe `calendly_booking_url` mangler (`BookSessionView.tsx:131`), uden loft og uden fejlbesked. Hentningen læser kun `data` og aldrig `error` (`:123-128`). Hvis webhooken aldrig lander, poller siden hvert andet sekund, så længe fanen er åben.

### 2.10 Refleksion (`/pulse`)

- **Det gamle designsprog.** `PulseCheckin.tsx:30` rendrer `AppLayout` (mørk, gammel menu med punktet «Refleksion», `AppLayout.tsx:134`). Indgangen er forsidens fokuspunkt (g) (`nextStep.ts:364-373`) og chat-nudgens `/pulse?period=`. Lukning fører til `navigate("/")`. Mulighed 1 og 10.
- **Tal:** 20 af 24 refleksioner har alle tre felter udfyldt, og andelen, der reflekterer, stiger (OVERLEVERING:11508, målt 4/9). Formen virker. Placeringen er problemet.

### 2.11 Events

- **Godt:** inline-tilmelding, «Føj til kalender» (.ics), optagelse efter eventet og «LIVE NU» i menuen (`HbMemberShell.tsx:186-203`). Tom og fejl er skilt ad (`EventsView.tsx:136-222`).
- **Mangler:** deltagelse tæller ingen steder for medlemmet selv (ikke i rejselinjen, `rejselinje.ts:21-30`). Mulighed 5.

### 2.12 Community og Netværket

- **Se `community-analyse.md`.** Medlemmer kan ikke skrive til hinanden. Profilen har kun website og LinkedIn (`MemberProfileView.tsx:104-108`). Anbefalingen er en manuel intro-pilot før kode. Den gentages ikke her.
- **Forsiden** viser de aktive medlemmers ansigter og det fremhævede opslag (`BoardroomView.tsx:2620-2666`). Levende og godt.

### 2.13 Akademiet og handouts

- **«Fortsæt hvor du slap»** ved sekund (`akademi/views/ForsideView.tsx:18-39`) og én dom for forløbet (`forloeb.ts`). «Måske relevant» kobler ugens fokus til en lektion (`maaskeRelevant.ts`), men grundlaget er smalt: 14 lektioner har et modul (målt 11/9, filhovedet).
- **Handouts:** fejl og tom er skilt ad (`HandoutsView.tsx:236-245`).

### 2.14 Indstillinger og konto

- **Teamet:** `CompanyInvitations` står i gamle tokens (`IndstillingerView.tsx:512-515`). Den er ikke koblet til upload («inviter din bogholder»). Mulighed 2, forløberen.
- **Aftalen:** fakturaer med link (`IndstillingerView.tsx:402-430`). Godt.

### 2.15 Certifikat (måned 12)

- **Tomt for året:** det bærer kun navn, virksomhed og periode (`certifikat/types.ts:9-18`). Det åbner 7 dage før 12-måneders dagen (`gamification-analyse.md` §1.2 pkt. 5). Skærmbevis udestår (`opstart-30-09.md`). Mulighed 5.

### 2.16 Fornyelse og udløb

- **Båndet** viser dato og beløb, én knap og de tre betalingsmodeller foldet ud på stedet. Dommen er serverens (`FornyelsesBaand.tsx:11-55`). Kvitteringslåsen mod dobbeltbetaling er grundig (`Index.tsx:30-175`).
- **Ingen værdi før prisen.** Båndet beder om penge uden at vise, hvad året gav. Mulighed 5 (årsbrevet).
- **Udløbet medlem:** alle ruter redirecter til `/` og `MembershipExpiredGate` (`App.tsx:119-133`, `Index.tsx:228-230`). Den er i Hb. Godt, ingen blindgyde.

---

## 3. Det, der ikke kan afgøres herfra (skal måles før byg, jf. §4a)

1. Hvor mange medlemmer bruger e-conomic, hvor mange Dinero og hvor mange andet? `financial_reports` med `sourceFingerprint` kan svare. Det afgør, om mulighed 2 starter med e-conomic.
2. Hvor ofte læses `advisor_kpi_comment`-notifikationer (`read_at`), og hvor mange kommentarer findes i alt? Det afgør mulighed 3's størrelse.
3. Hvor mange `session_bookings` med `start_tid` findes pr. måned? Det afgør mulighed 4.
4. Budgetfejlen i §2.6: hvor ofte fejler `budget_targets`-hentningen? Kan ikke ses i prod herfra (klientlog). Rettelsen er alligevel lille og defensiv.
5. Om `ai-data-chat` bruges nok til, at hukommelse betyder noget (mulighed 8). Dens eget kaldlog skal måles.

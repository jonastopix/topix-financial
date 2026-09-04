# Rådgiverfladen — design

**Besluttet 3. september 2026, aften, af Jonas i samtale med Claude.
Opdateret samme aften, sent, efter reconen af virksomhedssiden.** Dette
er en designbeslutning, ikke en recon. Den er skrevet så nogen kan bygge
fra den om tre uger uden at have været med i samtalen. Hvad den IKKE
afgør står i §9, og hvad der skal ske før der skrives kode står i §10.

Grundlaget er to reconer fra samme aften, begge uden for repoet og
begge til genskabelse hvis de bruges: `~/Downloads/recon-raadgiverfladen-2.md`
(ruter, menuer, skaller) og `~/Downloads/recon-virksomhedssiden.md`
(hvad MemberDetail og /members-handlingerne læser og skriver, henført
til blokkene). De tal og linjenumre dokumentet hviler på, står gengivet
med kilde. Den tidligere kortlægning (`~/Downloads/recon-raadgiverfladen.md`,
3/9 middag) og `docs/hjemmebane/konvergens.md` §2.2 og §2.9 er
forhistorien. Medlemsskiftet (`HbVisningSom`, #573) er løst uafhængigt og
indgår som byggesten, ikke som opgave.

---

## 1. Grundlaget — målt 3/9 aften

| måling | tal | kilde |
|---|---|---|
| Ruter bag `AdvisorRoute`/`AdminRoute` | 18 | `src/App.tsx:225–244` |
| … heraf i AppLayout (det gamle design) | 10 | import + wrapper i hver `src/pages/*.tsx` |
| … heraf i HbAdminShell | 8 | alle under `/admin/indhold`, `src/pages/AdminContent.tsx` |
| … heraf i HbMemberShell | 0 | `HbMemberShell.tsx` har intet rådgiverpunkt (grep `/admin\|/members` → nul ud over en kommentar) |
| Menupunkter der peger på `/admin/indhold` | 0 | `AppSidebar.tsx:45–74`, `HbMemberShell.tsx:168–191`, `Guide.tsx` |
| Steder medlemslisten findes, med hver sine kolonner | 3 | `AdvisorDashboard.tsx:1219` (portefølje), `Members.tsx` (virksomhedsliste), `ProgressView.tsx` (fremdrift) |
| Veje ind til én virksomhed | 4 | forsidens tabel, `/members`-rækken («Se data», `MemberCompanyRow.tsx:534`), `AdvisorNotifications.tsx:89–128` (deep-links), company-override fra sidebaren (`AppSidebar.tsx:530, 590`) |
| Dele `/members` består af | 9 | header, `MembersStatsBar`, `MembersOnboardingFunnel`, `IndgangsSektion`, `FornyelsesSektion`, søgebar, virksomhedsliste, `MembersAdminSection`, dialoger (`Members.tsx:1106–1683`) |
| Tabeller `/members` læser | 12 | `Members.tsx:799–813, 304–309` og otte kald mod `company_invitations` |
| Buckets på rådgiverforsiden | 5 | `AdvisorDashboard.tsx:1129–1135`: Venter på dit svar · Noget stikker ud i tallene · Friske tal, fortjener sparring · Positive muligheder · Ikke hørt fra længe |
| Renderede dele på `MemberDetail` | 15 | `MemberDetail.tsx:654–1692` (elleve kommentar-markerede sektioner plus handout-visning, «Rediger»-knap, EditCompanyDialog og hero-headerens underdele) |
| Ting på MemberDetail/`/members` som ingen af de oprindelige seks blokke dækkede | 17 | recon-virksomhedssiden punkt 6; §8 her |
| Virksomheder uden medlemmer i prod | 3 | Din økonomiafdeling, Two Socks, WESDEX — målt 3/9 (`docs/indgangen-overhaling.md` §10) |
| Virksomheder uden ét målt tal / der aldrig har uploadet (1/9) | 14 af 33 / 13 | `docs/status-1-september.md` |

Hele Hb-admin'en nås altså kun ved at kende URL'en. Og funktionerne
findes allerede: forsidens fem buckets er den rigtige idé, MemberDetail
har det meste af det en rådgiver skal vide om én virksomhed.
**Problemet er spredning, ikke mangel** — med to forbehold som reconen
af virksomhedssiden fandt (§4-rettelsen og §7): dommen bag «hvad stikker
ud» findes to gange med forskellige regler, og aftalens betalingsdata
findes slet ikke på detaljesiden.

---

## 2. Diagnosen

En flade skal svare på ét spørgsmål. `/members` svarer på fem: hvordan
går det i porteføljen (statsbar, tragt), hvem skal jeg tage stilling til
(indgang, fornyelse), hvilken virksomhed leder jeg efter (søgebar,
liste), hvad skal jeg gøre ved den (otte handlinger pr. række), og hvem
har ikke svaret på invitationen (admin-sektionen). Fordi siden svarer på
alt, svarer den ikke på noget hurtigt, og rådgiverens daglige spørgsmål
— «hvem skal jeg tage fat i i dag?» — ligger på forsiden, i chatten og
på `/members` på én gang.

Samme mønster på virksomhedsniveau: en virksomhed nås ad fire veje, og
den vej der lander i Hjemmebane (override) viser MEDLEMMETS forside,
ikke rådgiverens blik på virksomheden. Rådgiveren ser det medlemmet ser,
og må selv finde det medlemmet ikke ser.

---

## 3. Beslutningerne

### 3.1 Rådgiveren får medlemmets menu

Samme punkter, samme rækkefølge som `HbMemberShell.tsx:168–191`: Dit
Boardroom, Dine tal, Din rådgiver, Akademiet, Podcast & Talks,
Rabataftaler, Events, Netværket, Community. **Indholdet skifter efter
rolle, ikke pladsen.** Dit Boardroom er rådgiverens forside (§3.5);
Dine tal er tallene for den valgte virksomhed eller en vælger; Chat er
indbakken. Rådgiveren skal ikke lære en anden menu end den medlemmet
har, og den dag medlemmet siger «jeg kan ikke finde X», ved rådgiveren
hvor X er.

Admin ligger i en **adskilt blok nedenunder** med to punkter:

| punkt | indhold |
|---|---|
| **Virksomheder** | virksomhedslisten (§3.6) |
| **Platform** | platformdriften: det der i dag er de otte Hb-admin-faner (indhold, rabataftaler, events, fremdrift) og AppLayout-admin'en (config, mails, log, feedback, legat, import) |

Det giver Hb-admin'en det menupunkt den aldrig har haft, og det giver
AppSidebars syv rådgiver- og admin-punkter ét hjem.

### 3.2 Virksomhedssiden er en dedikeret rådgivervisning

Ikke medlemmets forside. En egen side i Hjemmebane, bygget til
rådgiverens spørgsmål om én virksomhed (§4). **«Se som medlem» er en
knap** på den side — den sætter override og viser medlemmets flade,
præcis som i dag. Det vender `HbVisningSom` (#573) fra nødudgang til den
normale vej tilbage: linjen «Du ser {virksomhed} · Tilbage til dig selv»
bliver vejen fra medlemsvisningen tilbage til rådgivervisningen.

### 3.3 Siden nøgles på virksomheden

`/virksomhed/:companyId`, ikke `/members/:userId`. Begrundelsen er den
bærende beslutning fra indgangsarkitekturen (`docs/indgangen-design.md`,
`docs/adgangsdomme.md` §1): **virksomheden er en aftale, medlemmet er en
adgang.** Kontrakt, betaling, perioder, fornyelse, træk — alt hænger på
`companies.id`. Medlemmet er en `company_members`-række, der kan komme
og gå.

To målte følger af den nuværende nøgling på `user_id`
(`src/App.tsx:226`, `MemberCompanyRow.tsx:323, 534`):

- En virksomhed med to medlemmer har **to URL'er** til samme
  virksomhed.
- En virksomhed **uden medlemmer har ingen URL**. Din økonomiafdeling,
  Two Socks og WESDEX (målt 3/9) kan ses i listen, men ikke åbnes —
  «Se data» kræver `c.members[0]` (`MemberCompanyRow.tsx:533`).

De fire veje ind (§1) samles til én adresse. Deep-links fra
notifikationer, forsidens buckets og listen peger alle på
`/virksomhed/:companyId`.

**Note, målt 3/9 sen aften (recon-virksomhedssiden punkt 5): at nøgle
siden på `companyId` er IKKE en URL-ændring.** Ingen kilde på
MemberDetail kan læses fra `companies.id` alene. Fem af sidens queries
er nøglet direkte på `user_id` eller `member_id` (`profiles` l. 373,
`financial_reports` l. 384, `milestones` l. 387, `conversations` l. 388,
`handouts` l. 389), og virksomheden selv findes gennem
`company_members.eq("user_id", userId)` (l. 393–398). Alt der er nøglet
på `company_id` — `budget_targets`, `company_invitations`,
`pulse_checkins`, `notifications`, `financial_report_facts`,
`agent_runs` — er først aktiveret NÅR det opslag lykkedes
(`memberCompanyId`, l. 230; `enabled: !!memberCompanyId` l. 246, 270;
`if (cm?.companies)` l. 400). Slår opslaget fejl, giver `profiles`-
opslaget null, siden viser «Medlem ikke fundet» (l. 848–849), og resten
renderes ikke. **Hele dataindlæsningen skal skrives om**, fra
`companies.id` udad: virksomheden først, medlemmerne som en liste under
den, og de brugerbundne tabeller (rapporter, milestones, handouts,
samtale) slået op pr. medlem eller pr. `company_id` hvor kolonnen
findes. Beslutningen står ved magt; omfanget er større end da den blev
truffet.

### 3.4 Chatten flytter ind på virksomhedssiden — og `/chat` bliver stående

Chatten vises **på virksomhedssiden i fuld højde, med tallene ved
siden af** (§4, blok 4). Det er dér samtalen hører hjemme: ved siden af
det den handler om.

`/chat` bliver **stående som ren indbakke** — `CompanyChatPane`s flade
liste — til de dage hvor man skal svare hurtigt på tværs af alle.
**Det er en bevidst dublet, valgt frem for renhed**, fordi den hurtige
vej har værdi på en travl morgen. Begge flader skriver til samme
`conversations`/`messages`; ingen ny datamodel.

### 3.5 Forsiden bærer alt der venter på rådgiveren

Dit Boardroom for rådgiveren er én liste af det der venter, i denne
rækkefølge:

| # | kø | hvorfor dér | findes i dag som |
|---|---|---|---|
| 1 | **Ikke hørt fra længe** — med antal dage, ELLER «aldrig skrevet» | ØVERST, fordi det er dér rådgiveren selv tager fat, og den vigtigste regel er at **ingen må glemmes** (se rettelsen nedenfor) | bucket `stale`, `AdvisorDashboard.tsx:814–819` |
| 2 | Venter på dit svar | ubesvarede beskeder | bucket `waiting`, l. 803–806 |
| 3 | Noget stikker ud i tallene | afvigelser i seneste rapport | bucket `standsOut`, l. 821–836 |
| 4 | Fornyelser der skal besluttes | beslutning mangler i vinduet | `FornyelsesSektion` på `/members` |
| 5 | Indgange der ikke er betalt | betalingsmail sendt, ingen betaling | `IndgangsSektion` på `/members` |
| 6 | Agentforslag der venter på afgørelse | `agent_proposals` uden `decided_at` | `AgentForslagPanel` på MemberDetail (§8) |
| 7 | Friske tal | ny rapportering, fortjener sparring | bucket `fresh`, l. 808–812 |

**Indgangen og Fornyelsesbeslutninger flytter dermed FRA `/members` TIL
forsiden**, fordi de er arbejdskøer, ikke virksomhedsdata. Bucket
`positive` («Positive muligheder», l. 838–851) er ikke i rækkefølgen
ovenfor; om den lever videre som del af 3 eller 7 afgøres ved
implementering (ikke en åben designbeslutning, en detalje).

Hver række i en kø linker til `/virksomhed/:companyId`.

**Rettelse og beslutning om «Ikke hørt fra længe», 3/9 sen aften.**
Betingelsen i dag (`AdvisorDashboard.tsx:815–817`) er ordret:

```ts
        const lastContact = conv?.last_message_at;
        const daysSinceContact = lastContact ? Math.floor((now.getTime() - new Date(lastContact).getTime()) / 86400000) : 999;
        if (c.has_verified_metrics && lastContact && daysSinceContact > 21) {
```

Følgen, målt: en virksomhed UDEN samtale har ingen `lastContact` og
bliver aldrig stale; en virksomhed uden committede tal har ikke
`has_verified_metrics` (l. 666: `!!latest`) og bliver aldrig stale.
Målt 1/9 (`docs/status-1-september.md`): fjorten af treogtredive
virksomheder var uden ét målt tal, tretten havde aldrig uploadet.
**Halvdelen af porteføljen kan altså ikke optræde i køen** — og det er
netop den halvdel der er tavs.

**Besluttet (Jonas): reglen vendes.** At have været tavs hele vejen er
den STÆRKESTE grund til at stå på listen. Køen skal dække både «længe
siden sidste besked» (med antal dage) og «aldrig skrevet», og skal kunne
skelne de to i teksten. Kravet om committede tal falder bort. Jonas'
formulering: «vi må ikke glemme folk i det her.»

### 3.6 Virksomhedslisten bliver ren

Under Virksomheder: **et søgefelt og en række pr. virksomhed** med:
navn, branche, kontaktperson, medlemsstatus (tier-badgen), sidste
kontakt, sidste rapportering, plus **et advarselsmærke ved fejlet træk**
(`company_traek`, #574). Klik åbner virksomhedssiden.

**Alle handlinger flytter til virksomhedssiden:** omdøb, rediger
virksomhedsdata, inviter, gensend invitation, tilknyt bruger, berig med
ansøgning, slet — og som niende: tilknyt eksisterende bruger (§8). I
dag ligger de som otte callbacks på rækken (`MemberCompanyRow.tsx:78–579`)
og seks dialoger på listen (`Members.tsx:1310–1677`). En liste man leder
i skal ikke også være det sted man handler.

### 3.7 Nøgletallene og tragten skæres fra listen

`MembersStatsBar` (otte tal: Virksomheder, Teammedlemmer, Ubesvarede,
Har rapporteret, Uden slutdato, Udløbet, Inaktive, Aldrig logget ind)
og `MembersOnboardingFunnel` (Ikke inviteret → Inviteret → Aktiveret →
Rapporteret → Klar) fjernes fra listen. **Begrundelse:** de besvarer
ikke et dagligt spørgsmål. Skal de leve, hører de **nederst på forsiden
som én linje**. Foreslået af Claude, accepteret af Jonas, **kan omgøres**
hvis det viser sig at et af tallene faktisk bruges.

---

## 4. Virksomhedssiden — syv blokke i læserækkefølge

`/virksomhed/:companyId`, i HbMemberShell (medlemmets skal, med
rådgiverens menu, §3.1). Fra top til bund:

**1. Hvad skal du vide nu.** Bullets, ikke paneler. **Ren automatik**
(besluttet 3/9 sen aften): korte bullets udledt af data, som kan skimmes
på to sekunder. Ny rapportering siden sidst; hvad stikker ud i tallene;
opgaver der venter på svar; agentforslag der venter på afgørelse; hvor
længe siden I talte sammen. Hvilke bullets der fortjener plads afgøres
ved at se på rigtige virksomheder (§9).

**Rettelse, målt 3/9 sen aften:** dokumentet påstod at blok 1 bruger
«samme dom som forsidens buckets, ikke en ny beregning». Det er
forkert. Der findes i dag **to forskellige domme med samme navn, begge
inline i en komponent, ingen af dem en ren funktion**:

| hvor | betingelser (ordret fra koden) |
|---|---|
| `AdvisorDashboard.tsx:803–851` (inde i `queryFn`, l. 298–891) | bankovertræk (`c.cash < 0`), omsætningsfald (`c.revenueTrendPct <= -15`), ulæste alerts `alert_result_negative` / `alert_revenue_drop` inden for 30 dage (`notifications`, l. 728–740); de to første gated på `isFiguresFresh` (periode inden for tre kalendermåneder — den eneste rene funktion, l. 50–60) |
| `MemberDetail.tsx:726–832` (IIFE `standsOut` i komponenten) | persisterede alerts 60 dage uanset `read_at` (l. 254–272); MoM-tærskel 15 % på `omsaetning` og `resultat_foer_skat` uden friskhedsgate (l. 756–777); budgetafvigelse over 10 % (l. 780–794); forfaldne milestones og handout-løftestænger som én dæmpet række (l. 799–810); loft på fire signal-rækker (l. 815–831) |

**De skal samles til ÉN ren funktion med tests FØR nogen af fladerne
bygges — motor før flade.** Funktionen tager virksomhedens facts,
alerts, budget, samtale og agentforslag som input og giver bullets med
alvor som output; forsiden bruger den pr. virksomhed til køerne, og
blok 1 bruger den for én virksomhed. Til den samling hører også den
vendte stale-regel (§3.5).

**2. Deres ord og din forberedelse** (NY, besluttet 3/9 sen aften).
Lige under automatikken, adskilt fra den: det der ikke er udledt af
tal.

- **Refleksionen** fra `pulse_checkins` (seneste: største udfordring,
  søger hjælp til, hvad gik godt, milestone-fremgang;
  `MemberDetail.tsx:233–248, 1008–1053`). Sammenfattes IKKE — det er
  fire korte felter.
- **Ansøgningskonteksten**, SAMMENFATTET (§3.3-princippet vendt på
  indhold): `companies.application_context` (`current_situation`,
  `goals`, `help_needed`; `MemberDetail.tsx:1104–1129`) vises ikke i
  fuld længde. **Besluttet:** den sammenfattes med AI og GEMMES.
  Begrundelse: feltet er STATISK, skrevet ved oprettelsen (monday-webhook
  eller import-application) og uændret siden, så sammenfatningen laves
  ÉN GANG og persisteres — aldrig ved sidevisning, samme princip som §5's
  afvisning af det løbende resumé. Gennemførelse: **egen kolonne på
  `companies`**, så den kan genskabes uden at røre kilden; genereres ved
  oprettelse i `monday-webhook` og `import-application`; et **idempotent
  engangsjob** fylder de eksisterende ud (udfyld kun tomt), efter
  mønstret fra `berig-virksomheder` (#567).
- **Sessionsforberedelsen**: `ai-financial-feedback` med
  `request_type: "session_prep"` (`MemberDetail.tsx:321–344, 1152–1174`),
  udløst af rådgiveren, ikke persisteret i dag.

**3. Emnerne I har talt om.** Se §5. «I har talt om likviditet fire
gange, senest 12/8. Prissætning to gange, senest i maj.» Sorteret efter
hvad der er længst siden. Bemærk: MemberDetails nuværende sektion med
navnet «Samtaleemner» (l. 1344–1394) læser milestones og
handout-løftestænger, ikke `messages` — den er ikke denne blok, men
blok 6.

**4. Chatten** i fuld højde, med opgaveoprettelse. Samme tråd som
`/chat` viser, samme skrivevej. Med i tråden: **rapport-kommentarer**
skrevet med `context_type: "report"` (`MemberDetail.tsx:545–575`) som
kontekst-beskeder, og **«Tildelt: {rådgiver}»** (`conversations.
assigned_advisor_id`, l. 481–495, 981–986).

**5. Tallene.** Finansielt snapshot med **afvigelserne fremhævet frem
for alle tal**. Det MemberDetail i dag viser som «Finansielt
øjebliksbillede» (l. 1176–1235) og «Finansiel udvikling» (l. 1237–1342),
men vendt: det der er skævt først. Her hører også **AI-sparringen**
(`AdvisorAIChat` mod `ai-data-chat`, l. 1396–1404) og
**3-måneders-forecastet** (`generate-ai-forecast`, l. 1317–1339) til.

**6. Aktivitet.** Hvad de faktisk bruger: rapportering, akademi,
handouts — og milestones. Kort. **Med accept af at nogle skriver meget
og ser lidt video, mens andre gør det modsatte. Begge dele er i orden;
fladen må ikke fremstille det ene som svigt.** Ingen røde tal for «har
ikke set ugens video». Rapportlisten (l. 1501–1678) med «Se original
fil» (l. 1607–1616), Delivery Overview (l. 1680–1683), milestones og
handouts (l. 1406–1496) og quick stats (l. 894–912) hører her.

**7. Aftalen.** Kontrakt (start, slut, pris), betaling (perioder,
træk, fejlede træk), medlemmer (med «Aldrig logget ind»), invitationer
(afventende, gensend, og advarslen når invitationens email ikke er
profilens, `MemberDetail.tsx:417–452, 987–992`). Her ligger
handlingerne fra §3.6. Det er det `EditCompanyDialog`,
`MembersAdminSection` og rækkens udfoldede del bærer i dag.

**Konsekvens, målt 3/9 sen aften: blokkens indhold findes IKKE på
MemberDetail i dag.** `grep -n "company_traek\|company_perioder\|
company_betalingslink\|indgangspris\|fornyelse" src/pages/MemberDetail.tsx`
gav NUL træffere. MemberDetail viser kontraktdatoerne (l. 1130–1147) og
kan redigere dem (`EditCompanyDialog`), men perioder, træk, fejlede
træk, betalingslink og fornyelsestilstand ligger i `/members`-rækken
(`MemberCompanyRow.tsx:436–460`, `fejledeTraek`) og i
`IndgangsSektion`/`FornyelsesSektion`. **Blokken skal BYGGES fra
listen, ikke flyttes fra detaljesiden.**

---

## 5. Emne-opsamlingen — beslutningen står, formen måles først

Jonas' vigtigste ønske, nævnt tre gange i samtalen. **Skrevet om 3/9
sen aften efter emne-reconen** (`~/Downloads/recon-emner.md`, uden for
repoet, skal genskabes hvis den bruges). Beslutningen om emner står ved
magt; formen — hvad der vises, og om det vises — er ikke længere
besluttet på forhånd.

**Problemet:** chatten er i dag én lang tråd uden hukommelse. Den
rådgiver der åbner en samtale efter tre uger, må scrolle for at huske
hvad der blev talt om, og det de talte om i maj er væk.

**Løsningen er IKKE et resumé.** Et resumé bliver en ny lang tekst
ingen læser, og det skal genereres igen hver gang tråden vokser.

**Løsningen er emner** — hver besked klassificeret mod en **fast
liste** af rådgivningsemner. **Fast, ikke frit genereret.** Frie tags
driver fra hinanden og bliver til tres etiketter der betyder det samme
(«cash flow», «likviditet», «penge i kassen»). Det er samme lærdom som
webhook-hvidlisten, hvor hvidliste slog sortliste (#563,
`docs/adgangsdomme.md` §1), og som branchemotoren, der mapper mod et
fast register frem for at gætte (`docs/indgangen-overhaling.md` §6).
Mønstret i huset er `agent_proposals.decision_category`: fast liste med
CHECK i databasen, konstant i koden og paritetstest.

### 5.1 Hvad reconen fandt, og som ændrer formen (målt 3/9 sen aften)

- **Chattens designdokument har allerede afvist det.**
  `docs/chat-design.md` C5 fjerner emnevælgeren med begrundelsen: «Den
  ligner et overblik og er det ikke.» C8 afviser ordret: «Ingen
  emnefiltre, ingen AI-tematisering, ingen sammenfatninger i tråden.
  Overblikket bor i MCP; chatten er samtalen.» og: «Det er en afvisning
  af "AI der tematiserer chattens indhold" som selvstændig funktion.»
- **Målt 1/9** (`docs/status-1-september.md:430`): **elleve
  emnemærkede menneskebeskeder ud af 699 i alt.** Under to procent.
- **`messages.context_type` findes allerede**: TEXT uden CHECK, én værdi
  ad gangen, otte værdier i omløb (`report`, `handout`, `milestone`,
  `budget`, `agent`, `feedback`, `opgave_forslag`, `session_prep`) — en
  blanding af emne og systemkontekst. Kan ikke bære flere emner pr.
  besked.
- **`company_actions` bærer INGEN reference til besked eller samtale**:
  `source_id` er UUID uden FK, og `source_type`-CHECK indeholder hverken
  `message` eller `conversation`. Referencen går kun den modsatte vej,
  som `messages.context_meta->>'action_id'` fra
  `supabase/functions/foreslaa-opgave/index.ts:176`.
- **`messages` har ingen afsenderrolle**; medlem vs. rådgiver afgøres ved
  opslag i `user_roles` (triggeren `update_conversation_reply_state`,
  RPC'en `get_conversation_sender_profiles`).
- **MemberDetails sektion «Samtaleemner»** (l. 1344–1394) viser
  overskredne milestones og handout-løftestænger. Den læser ingen
  beskeder. Navnet er lånt; sektionen hører til blok 6 (Aktivitet), som
  §4 og §8 allerede siger.

### 5.2 Omgørelsen af C8 — kun for automatisk klassificering

**Besluttet (Jonas, 3/9 sen aften): C8 omgøres, men KUN for automatisk
klassificering.** C5 og C8 blev truffet om en MANUEL vælger, hvor
rådgiveren satte emne på sine egne beskeder og medlemmets beskeder
aldrig fik et — deraf de elleve ud af 699. Den lignede et overblik og
var det ikke, fordi den dækkede under to procent af tråden og kun den
ene parts ord. Automatisk klassificering af BEGGE parters beskeder er
en anden ting og retter præcis den fejl.

Afvisningen af emnefiltre, AI-tematisering og sammenfatninger INDE i
tråden står ved magt. Det der åbnes, er et overblik UDEN FOR tråden,
på virksomhedssiden (blok 3). Noten er skrevet ind under C5 og C8 i
`docs/chat-design.md`; C5 og C8 selv er ikke slettet.

### 5.3 Mål før flade

Claude foreslog at vise emner som antal og seneste dato («I har talt om
likviditet fire gange, senest 12/8»). **Det er statistik: det svarer på
OM, ikke på HVAD**, og rådgiveren skal alligevel klikke ind og læse.
Formen blev valgt fordi den var nem at bygge, ikke fordi den løser
problemet. Derfor bestemmes formen ikke nu:

1. **Emnelisten defineres ved at LÆSE** hvad der faktisk tales om i de
   699 beskeder — ikke fra et skrivebord.
2. **Klassificeringen køres som et IDEMPOTENT engangsjob** over hele
   historikken (udfyld kun tomt; mønster: `berig-virksomheder`, #567).
3. **Derefter MÅLES resultatet:** rammer klassificeringen rigtigt, og er
   det brugbart — eller bliver det tres etiketter og en tælling der
   ikke siger noget?
4. **Først når målingen holder, bygges fladen**, og FORMEN bestemmes af
   hvad målingen viser. Ingen visning designes på forhånd.
5. **Holder målingen ikke, står opgave-historikken som opsamling** (5.4),
   og C8 får ret. Det er det udtrykkelige alternativ, ikke en fodnote.

### 5.4 Alternativet der ikke kræver noget nyt

`company_actions` er allerede en historik over det der blev til
handling — titel, kontekst, dato, status, oprettet netop når noget
besluttes i chatten. Ingen AI, ingen ny datamodel, ingen omgørelse af
C8. Svagheden: en samtale der ikke førte til en opgave, efterlader
intet spor. Om det er et tab eller en naturlig filtrering, er ikke
afgjort — det er præcis det målingen i 5.3 skal vise.

### 5.5 Krav til datamodellen — fra dag ét, skærpet af fundene

**Referencen fra opgave til emne til besked skal ligge i datamodellen
fra den første version. Den kan ikke laves bagud.** Konkret:

- **Emner kan IKKE bo i `messages.context_type`** — én værdi, blandet
  betydning (5.1). En klassifikation er en række i en **egen tabel**:
  besked-id, emne (fra den faste liste, med CHECK som
  `decision_category`), tidspunkt, og hvem/hvad der satte den. Én
  besked kan bære flere emner.
- **Opgavens reference kræver enten en ny kolonne på `company_actions`
  eller at `source_type`-CHECK'en udvides** med `message`/`conversation`
  og `source_id` får en FK — i dag peger kun beskeden på opgaven, aldrig
  opgaven på beskeden (5.1). En opgave oprettet fra et emne bærer emnets
  id OG den eller de besked-id'er der var ophavet — ikke kun en
  fritekst.
- **Afsenderrollen** (medlem/rådgiver) skal kunne læses af
  klassifikationen uden opslag i `user_roles` pr. besked, hvis begge
  parters ord skal vægtes — enten som kolonne på klassifikationen eller
  ved at jobbet slår den op én gang pr. samtale.
- Emnelisten er data (en tabel eller en enum), ikke strenge spredt i
  koden, så et emne kan omdøbes uden at klassifikationerne mister
  betydning.

Bygges klassifikationen uden besked-referencen «fordi vi kun skal bruge
tællingen nu», kan «klik hopper til beskederne» og «opgave med samtalen
som ophav» ikke bygges bagefter uden at klassificere alt igen. Det er
et krav, ikke en note — og det gælder også engangsjobbet i 5.3: det
skriver til den rigtige tabel fra første kørsel.

---

## 6. Regnestykket

| | i dag | efter |
|---|---|---|
| rådgiverflader | 18 ruter i to skaller (10 AppLayout, 8 HbAdminShell) | **4**: forside (Dit Boardroom), indbakke (`/chat`), virksomhedsliste (Virksomheder), virksomhedsside (`/virksomhed/:companyId`) |
| platformdrift | 13 af de 18 ruter, spredt i to menuer og uden menu | én blok (Platform) under admin |
| menuer | AppSidebar (gammel), HbAdminShell-nav, HbMemberShell (uden rådgiverpunkter) | medlemmets menu + adminblokken |
| veje ind til én virksomhed | 4 | 1 |
| steder medlemslisten findes | 3 | 1 (+ forsidens køer, som er noget andet) |
| domme bag «hvad stikker ud» | 2, begge inline | 1, ren og testet |

Fire rådgiverflader plus platformdriften som egen blok.

---

## 7. Hvad der bevares uændret

- Override-mekanikken i `useAuth` (`setCompanyOverride`,
  `clearCompanyOverride`) — «Se som medlem» bruger den som i dag.
- `HbVisningSom` (#573) — bliver den normale vej tilbage.
- Forsidens buckets som IDÉ (`AdvisorDashboard.tsx`) — betingelserne
  samles i én ren funktion (§4, blok 1), køerne beholder deres navne.
- `afgoerFornyelsestilstand` og indgangens betalingsfrist-motor — køerne
  på forsiden bruger de samme domme som `FornyelsesSektion` og
  `IndgangsSektion` i dag.
- `/chat` som indbakke (bevidst dublet, §3.4).
- Alle adgangsdomme (`docs/adgangsdomme.md`) — ingen af dem rører
  rådgiverfladen.
- «Godkend rapport →» som link ud til `/admin/review-queue`
  (`MemberDetail.tsx:1587–1594`) — godkendelsen bliver hvor den er.

---

## 8. Hvad der ikke havde et hjem

Reconen af virksomhedssiden (3/9 sen aften) fandt sytten ting i
MemberDetail og `/members` som ingen af de oprindelige seks blokke
dækkede. Her er de, med hvor de bor i dag og hvilken blok de nu hører
til:

| # | hvad | bor i dag | henføres til |
|---|---|---|---|
| 1 | Sessionsforberedelse (`ai-financial-feedback`, `request_type: "session_prep"`) | `MemberDetail.tsx:321–344, 916–930, 1152–1174` | **blok 2** |
| 2 | Refleksion (`pulse_checkins`: største udfordring, søger hjælp til, hvad gik godt) | `MemberDetail.tsx:233–248, 1008–1053` | **blok 2** |
| 3 | Ansøgningskontekst (`companies.application_context`) | `MemberDetail.tsx:1104–1129` | **blok 2**, sammenfattet og gemt (§4) |
| 4 | AI Sparring-assistent (`AdvisorAIChat` mod `ai-data-chat`) | `MemberDetail.tsx:1396–1404`; `AdvisorAIChat.tsx:22, 60` | **blok 5** |
| 5 | 3-måneders forecast (`generate-ai-forecast`) | `MemberDetail.tsx:1317–1339` | **blok 5** |
| 6 | Agent log og forslag (`agent_runs`, `agent_proposals`; `agent-forslag-afgoer`, `run-company-agent`) | `AgentForslagPanel` via `MemberDetail.tsx:1499`; panelet l. 115–123, 158, 268 | **blok 1** som «afgørelser der venter», OG som kø på forsiden (§3.5, kø 6) |
| 7 | Milestones (liste, forfaldne, aktive) | `MemberDetail.tsx:1351–1365, 1408–1459` | **blok 6** (§4 nævnte kun rapportering, akademi, handouts) |
| 8 | Rapport-kommentarer med `context_type: "report"` (læser og skriver `messages`) | `MemberDetail.tsx:516–522, 545–575, 1618–1670` | **blok 4**, som kontekst-beskeder i tråden |
| 9 | «Godkend rapport →» | `MemberDetail.tsx:1587–1594`, `<a href="/admin/review-queue">` | link ud til review queue, **uændret** |
| 10 | «Se original fil» (`openReportFile`) | `MemberDetail.tsx:577–579, 1607–1616` | **blok 6** |
| 11 | Deep-link-ankre `?reportId=`, `?handout=`, `?section=` | `MemberDetail.tsx:207–223, 289–319`; skrives af `AdvisorNotifications.tsx:89, 104` | **skal bevares på den nye rute** (`/virksomhed/:companyId?reportId=…` osv.) |
| 12 | «Tildelt: {rådgiver}» (`conversations.assigned_advisor_id` → `profiles`) | `MemberDetail.tsx:486–495, 981–986` | **blok 4** |
| 13 | «Invitation sendt til {email}»-advarslen (invitations-email ≠ profil-email) | `MemberDetail.tsx:417–452, 987–992` | **blok 7** |
| 14 | Quick stats (rapporter / aktive milestones / handouts) | `MemberDetail.tsx:894–912` | **blok 6** |
| 15 | Tilknyt eksisterende bruger (`attach-user-to-company`) | `Members.tsx:199–236`, inde i import-dialogen | **blok 7**, tilføjes som **niende handling** (§3.6) |
| 16 | Automatisk sletning af kildevirksomhed ved «Tilknyt bruger» (merge) | `Members.tsx:807–814`: er kilden tom bagefter, slettes `conversations` og `companies` uden dialog | **blok 7**, bivirkning der **skal være synlig i dialogen** |
| 17 | Handout-visningen (`HandoutDetail`, erstatter hele siden) | `MemberDetail.tsx:654–664`, via `?handout=` eller klik i handout-kortet | **uafklaret** — se §9 |

---

## 9. Hvad dokumentet IKKE afgør

- **Hvilke emner der præcis er på den faste liste, og hvilken form
  emnerne vises i.** Listen læses ud af de 699 beskeder (§5.3), og
  formen bestemmes af målingen — ikke før. Listen skal være kort nok
  til at kunne huskes og lang nok til at rumme det der faktisk tales om.
- **Hvilke bullets der fortjener plads i «Hvad skal du vide nu».**
  Kræver at man ser på rigtige virksomheder og spørger hvad rådgiveren
  faktisk havde brug for at vide før mødet.
- **Handout-visningen:** hører den udfoldede handout (`HandoutDetail`
  med rådgiverens svar på medlemmets vegne) til virksomhedssiden, eller
  til `/handouts` med override? I dag erstatter den hele MemberDetail.
- **Rækkefølgen af selve ombygningen** — hvilken af de fire flader der
  bygges først, og om `/members` lever ved siden af undervejs.
- **Om AppLayout kan pensioneres helt bagefter.** Ti rådgiverruter
  ligger der i dag; Platform-blokken kan bære dem videre i gammelt
  design en tid, eller de kan flyttes. Ikke afgjort.
- **Den semantiske hukommelse på tværs af chat, tal, handouts og
  opgaver** ud over emne-opsamlingen. Det er et **eget epic, og det
  kommer EFTER strukturen** — ellers bygges hukommelse ind i en flade
  der flytter sig. Emne-opsamlingen (§5) er det første, afgrænsede
  skridt, og datamodelkravet i §5 er dét der gør resten muligt senere.

**Åbent punkt, sikkerhed — uafhængigt af ombygningen:** «Fjern medlem»
har TO forskellige gates for samme kald (`manage-advisor`,
`action: 'remove-member'`). `MemberCompanyRow.tsx:347` kræver
`isAdmin && m.role !== 'owner'`; `MemberDetail.tsx:937–963` kræver kun
`isAdvisor` (sidens gate l. 652). Skal afgøres og ensrettes, før eller
uafhængigt af flytningen.

---

## 10. Før der skrives kode

**To reconer ER kørt 3/9 sen aften**, begge uden for repoet og til
genskabelse hvis de bruges: `~/Downloads/recon-virksomhedssiden.md`
(MemberDetails sektioner og MemberCompanyRows handlinger — indarbejdet i
§3.3-noten, §3.5-rettelsen, §4-rettelsen og blok 2, blok 7's konsekvens,
§8 og sikkerhedspunktet i §9) og `~/Downloads/recon-emner.md`
(emne-opsamlingens grundlag — indarbejdet i §5).

**Det der STADIG mangler før kode:**

1. **Emnelisten selv**, læst ud af de 699 beskeder (§5.3, trin 1), og
   derefter engangsjobbet og målingen (trin 2–3). Formen kommer efter.
2. **Buckets' linkmål** for `primary: "company"` (`AdvisorDashboard.tsx:
   1130–1134`): klik-handleren er ikke læst, så det er ikke afgjort om
   de peger på `/members/:userId` eller sætter override. Skal kendes for
   at alle deep-links kan flyttes til `/virksomhed/:companyId`.
3. **Hvilke `advisor_notifications.type`-værdier der findes**, og hvilken
   edge function der skriver dem — `AdvisorNotifications.tsx` forgrener
   kun på `reference_type` (l. 86, 95, 111, 127), ikke på `type`.
4. **Hvad de fire AI-edge-functions læser og skriver serverside:**
   `ai-financial-feedback` (session_prep), `ai-data-chat`
   (sparringen), `generate-ai-forecast`, og `run-company-agent` /
   `agent-forslag-afgoer`. Nødvendigt for at vide hvad blok 2 og blok 5
   kan persistere, og for sammenfatningen af ansøgningskonteksten.
5. **Den samlede rene funktion bag blok 1 og forsidens køer** (§4-
   rettelsen): skrives og testes FØR nogen flade, med den vendte
   stale-regel (§3.5) og agentforslag som input.

Først når det er på plads, kan rækkefølgen af ombygningen (§9)
besluttes.

---

## 11. Rækkefølgen

**Fastlagt 3. september 2026, sen aften**, ud fra tre principper som
aftenens målinger gav: **motor før flade**, **én kilde før to
aftagere**, og **de billige forudsætninger før de dyre ombygninger**.
Hvert punkt står med hvad, hvorfor netop dér, og hvad der er målt om
det. Målingerne ligger i reconer uden for repoet (henvist ved hvert
punkt) og i `docs/OVERLEVERING.md` DEL 3.

### 1. Én kilde til tallene — LØST 4/9 (#604)

**Hvad:** forsiden (`AdvisorDashboard.tsx`, `queryFn`) regnede MoM og
nøgletal ud af `financial_reports`; resten af huset — NoegletalView og
virksomhedssiden — ud af `financial_report_facts` gennem
`useCompanyFacts` og den rene, testede `trendMoM.ts`. Forsiden er nu
flyttet til facts.

**Hvorfor først:** motoren (#589) fodres allerede med to sandheder —
`FactPunkt` bygges af rapporter på forsiden og af facts på MemberDetail.
Dommen blev samlet ét sted 3/9, men får to forskellige input. Alt andet
i rækkefølgen bygger ovenpå, og bygges virksomhedssiden før flytningen,
arver den dubletten som en tredje variant.

**Målt 3/9 kl. 23:56** (`~/Downloads/recon-to-kilder.md`): 151 punkter
over 20 virksomheder ad rapport-vejen mod 314 over 21 ad facts-vejen
(heraf 144 `estimated`). **Nul uenigheder** hvor begge kilder har en
værdi — flytningen er ufarlig for tallene selv. Det der ændrer sig er
hvilke perioder der findes: estimater fra årsrapporter og baselines
kommer med, ikke-committede rapporter (Brick Works, april 2026) falder
ud. **Betingelse:** `momErGyldig`-reglen fra NoegletalView skal følge
med, så et `estimated` punkt ikke udløser et faldsignal mod et
`measured`. Tages som egen opgave med måling før og efter, ikke som del
af en fladebygning.

**Målt undervejs 4/9** (`~/Downloads/recon-facts-flytning.md`):
manuelle overrides falder bort i forsidens læsning, fordi
`resolve_report_commit_candidate` allerede indregner dem ved commit
(migration 20260420190823, gentaget i 20260722130000) og sætter
`period_key := manual_report_period_key` — facts ER det effektive tal,
så `getEffectiveKeyFigures`/`getEffectiveReportPeriodKey` har intet at
gøre på forsiden længere. `momErGyldig` fulgte med som betinget:
M/M regnes kun når begge punkter er `measured`. De to facts-hentninger i
`queryFn` (aktivitetsfeedets og nøgletallenes) er slået sammen til én,
og læse-guardens markør (`// data_basis-undtagelse:`) dækker nu kun
aktivitetsfeedet — nøgletallene bærer `data_basis` i kode. Bevidste
forskelle i drift: `has_verified_metrics` bliver sand for en virksomhed
med kun estimater; Brick Works' april 2026 falder ud.

**BEVIST PÅ SKÆRM 4/9 kl. 08:34:** forsiden er uændret — alle fem
bunker viser det samme som før flytningen. Målingens «nul uenigheder»
holdt i drift.

### 2. `notifications` company-først — UDGÅET 4/9

**Hvad (oprindeligt):** `notifications` får en advisor-policy (eller en
anden vej), så en rådgiver kan læse virksomhedens rækker nøglet på
`company_id`.

**Hvorfor her:** syv af de otte kilder motoren bruger kan en rådgiver
allerede læse company-nøglet; kun `notifications` har udelukkende
«Users read own notifications» (`user_id = auth.uid()`) — **bekræftet i
prod 3/9 kl. 22:43** (`~/Downloads/recon-virksomhedsdata.md`). I dag ser
rådgiveren alerts fordi `detect-financial-alerts` skriver én kopi pr.
rådgiver; en company-først-læsning ville ramme egne kopier, ikke
virksomhedens. Blok 1 på virksomhedssiden kan ikke tegnes før det er
løst. **Bemærk:** alerts er ude af motoren (#595), så det haster kun for
det blok 1 ellers skal vise fra `notifications`.

**UDGÅET, målt 4/9** (`~/Downloads/recon-notifications-noedvendig.md`):
ingen af de syv blokke kræver det. Hver af blok 1's ting bæres af andre
tabeller — ny rapportering af `financial_report_facts.committed_at`,
«stikker ud» af facts og `budget_targets`, opgaver af
`conversations.awaiting_reply_from` og `company_actions`, agentforslag
af `agent_runs`/`agent_proposals`, sidst talt af
`conversations.last_message_at`. `VirksomhedsInput` har ikke ét felt
fra `notifications`. Det er en direkte følge af at alerts røg ud af
motoren (#595): den eneste grund til at læse tabellen company-først var
alert-rækkerne, og dem dømmer motoren ikke længere på. Punktet står
her med sin begrundelse, så historikken bevares — det er ikke glemt,
det er besluttet væk. **Bemærk:** reconen fandt at blok 1 i §4 har FEM
ting, ikke fire — «agentforslag der venter på afgørelse» står der også.
Punkt 5 nedenfor er skrevet efter de fem.

### 3. Menuen — LØST 4/9 (#603)

**Hvad:** rådgiveren får medlemmets menu; admin bliver en adskilt blok
med to punkter, Virksomheder og Platform (§3.1).

**Hvorfor her:** det er den eneste ændring der giver Hb-admins otte
ruter et menupunkt — i dag nås de kun ved at kende URL'en (målt 3/9,
`~/Downloads/recon-raadgiverfladen-2.md`: nul menupunkter peger på
`/admin/indhold`). Billig, og alt der bygges bagefter skal alligevel
ligge i den menu.

**Bygget 4/9 (#603):** admin-blokken med de to punkter, Virksomheder og
Platform (otte underpunkter), hægtet på BEGGE nav-grene. `HbNavEntry`
fik et additivt `admin`-felt. Målt før: nul menupunkter pegede på
`/admin/indhold`, og `/admin/import` havde intet link i `src`
overhovedet. Punkterne peger på AppLayout-sider, så designsproget
skifter ved klik — et bevidst valg, ikke en forglemmelse; om de tretten
driftsruter skal konverteres, er punkt 8.

### 4. Virksomhedslisten (§3.6) — LØST 4/9 (#605), swappet mangler

**Hvad:** ren visning under Virksomheder: søgefelt, én række pr.
virksomhed med navn, branche, kontaktperson, medlemsstatus, sidste
kontakt, sidste rapportering, og advarselsmærke ved fejlet træk.
Handlingerne flytter til virksomhedssiden.

**Hvorfor her:** billigst af de fire flader — hverken vendt datalag
eller syv blokke — og den første i det nye designsprog. Den giver en
rådgiverflade i Hjemmebane at stå på, før den dyre bygges.

**Bygget 4/9 (#605)** på den MIDLERTIDIGE rute `/virksomheder`; den
gamle liste på `/members` står urørt, og swappet mangler. To
definitioner er besluttet 4/9 og står nu fast: **«sidste kontakt» =
`conversations.last_message_at`** (samme kilde som forsidens køer, ikke
login); **«sidste rapportering» = seneste committede periode i
`financial_report_facts`**, ikke seneste upload. Målt før byggeriet
(`~/Downloads/recon-virksomhedslisten.md`): der findes ingen generisk
Hb-liste-komponent — fire steder (`HbTreeList`, `MemberDirectoryView`,
`HbAdvisorCompanyPrompt`, `ProgressView`) bygger hver sin liste og sit
eget filter inline. Rækken linker til `/members/:userId` indtil
virksomhedssiden er hel.

### 5. Virksomhedssiden (§4) — etape 1 LØST 4/9 (#607), etape 2–3 udestår

**Hvad:** `/virksomhed/:companyId` med de syv blokke. Datalaget vendes
fra `user_id` til `companyId` (§3.3-noten: hele dataindlæsningen
skrives om), blokken «Aftalen» bygges fra `/members`-listen (den findes
ikke på MemberDetail, §4 blok 7), chatten flytter ind i fuld højde
(§3.4), og de sytten hjemløse ting (§8) placeres.

**Hvorfor her:** den dyre. Den forudsætter punkt 1 (én kilde), punkt 2
(`notifications` for blok 1), punkt 3 (menuen den skal ligge i) og
punkt 4 (listen der linker til den). Målt 3/9
(`~/Downloads/recon-byggeomkostning.md`): alene på størrelse med de fire
tidligere Hjemmebane-flytninger tilsammen, af grunde ingen af dem
havde.

**Etape-opdelingen, besluttet 4/9** — siden kan ikke tages i én PR:

- **Etape 1 (#607, LØST 4/9):** ruten `/virksomhed/:companyId`, den
  samlede company-nøglede hook `useVirksomhed`, blok 1 (hvad skal du
  vide nu) og blok 7 (aftalen). Datalaget er vendt: alt slås op fra
  `companies.id` og udad i ét `Promise.all`, intet er gated på et
  `user_id`-opslag. De tre virksomheder uden medlemmer kan åbnes for
  første gang. Blok 1 bruger motoren (#589) og udfylder
  `senesteBeskedAt` og `agentforslagVenter`, som MemberDetail sendte som
  null og 0. Blok 7 bygges fra `/members`-listens data. Visning, ingen
  handlinger.
- **Etape 2:** blok 5 (Tallene) og blok 6 (Aktivitet).
- **Etape 3:** blok 4 (Chatten i fuld højde) og blok 2 (Deres ord og
  din forberedelse). Chatten er tungest, fordi `CompanyChatPane` er delt
  mellem medlem og rådgiver.
- **Blok 3 (emnerne) kommer sidst** og venter på klassificeringen
  (punkt 7).

**Målt før etape 1** (`~/Downloads/recon-virksomhedssidens-datalag.md`):
en naiv side med én `useQuery` pr. kilde ville lave 18 netværkskald
(19–20 med rådgivernavn og løftestænger). Kun `useCompanyFacts` fandtes
som company-nøglet hook; de øvrige tolv kilder MemberDetail henter havde
ingen. Ingen samlet hook eller RPC returnerede flere kilder for ét
`company_id` — derfor `useVirksomhed`.

### 6. Forsiden (§3.5)

**Hvad:** de syv køer, med indgange og fornyelser flyttet fra
`/members`, og «Ikke hørt fra længe» øverst med den vendte regel.

**Hvorfor her:** køerne linker til virksomhedssiden, så den skal findes
først. Her hører budgetafvigelse hjemme — den kan ikke komme på
forsiden i dag, fordi `queryFn` ikke henter `budget_targets`
(`budgetOmsaetning` står bevidst som null i #597). Punkt 1 har allerede
flyttet tallene til facts, så forsiden bygges på én kilde.

### 7. Emne-opsamlingen (§5)

**Hvad:** klassificér alle 588 menneskebeskeder mod de ni emner
(`docs/emneliste.md`) som et idempotent engangsjob (udfyld kun tomt,
mønster `berig-virksomheder`), **MÅL** om listen rammer, og bestem
derefter formen (§5.3).

**Hvorfor her:** blok 3 på virksomhedssiden er den flade der viser det,
men formen må ikke designes før målingen holder. Holder den ikke, står
opgave-historikken som opsamling og C8 får ret (§5.4). Datamodelkravet
(§5.5) gælder fra første kørsel.

### 8. Platform-blokken

**Hvad:** de tretten driftsruter (config, mails, log, feedback, legat,
import, review queue, report-debug og de otte Hb-admin-faner) samles
under ét menupunkt.

**Hvorfor sidst:** punkt 3 giver dem hjemmet; om de skal konverteres
til Hjemmebane eller blot have et hjem, er ikke afgjort (§9). Ingen af
dem er dagligt arbejde.

### Uafhængigt af rækkefølgen — småt, tages når nogen alligevel er i filen

- **«Fjern medlem» — LØST 4/9 (#608), med en rettelse.** Fundet 3/9 lød
  at kaldet havde to gates (`MemberCompanyRow` krævede admin og ikke
  owner, `MemberDetail` kun advisor). **Det var IKKE et adgangshul:**
  `manage-advisor` har per-action default-deny, en rådgiver uden admin
  må kun kalde `list`. Det der manglede var **owner-værnet serverside**
  — `remove-member` læste ikke målets `company_members.role`, og grenen
  sletter `company_members`, `profiles` OG auth-brugeren. Besluttet 4/9:
  en owner kan ALDRIG fjernes med `remove-member`; dommen ligger i
  `src/lib/medlemsfjernelse.ts` (testet) og er spejlet i
  edge-funktionen, som afviser med 403 hvis målet er owner i nogen
  virksomhed. Begge flader bruger samme funktion og kræver admin.
- **NYT ÅBENT: knappen hedder «Fjern medlem», men handlingen sletter
  mennesket fra platformen** (auth-brugeren ryger med). Navnet lyver og
  bør rettes — på begge flader og på virksomhedssiden når blok 7 får
  handlinger.
- **NYT ÅBENT: «skift owner» findes ikke som handling.** Skal
  virksomheden væk, slettes virksomheden; skal ejeren skiftes, er der
  ingen vej i dag.
- **Hængende invitationer mangler et sted.** remm. har hængt i 80 dage;
  de tre nye skjules af pending-gaten sammen med «Har aldrig skrevet»
  (OVERLEVERING DEL 3, målt 3/9 kl. 23:45). Ingen dom bygges nu; hører
  på forsiden ved siden af «Indgange der ikke er betalt».
- **Dødt kød i `AdvisorDashboard`** (`companies`, `legatCompanyIds`,
  `activityFeed`, `companyMap`, `recentReportsData`,
  `handleAssignAdvisor`) skal efterprøves før noget slettes — målingen
  blev taget kl. 23:26 midt i en ombygning.

### Ikke med, og hvorfor

- **1:1-bookingernes registrering** (`calendly_event_uri` sættes aldrig
  for betalte): bevidst nedprioriteret — medlemmet mærker intet, de
  booker og mødes.
- **Restancepolitikken:** rammer nul rækker (`docs/adgangsdomme.md` §6).
- **De otte CVR-uenigheder:** en samtale, ikke kode
  (`docs/indgangen-overhaling.md` §10).

### Om omfanget

Designets §1 og OVERLEVERING siger at rådgiverfladen er «på størrelse
med indgangen (to dage)». **Det tal stammer fra FØR byggeomkostningen
blev målt 3/9.** De fire tidligere Hjemmebane-flytninger (KPI'er,
Rapportering, Budget, Handouts) tog omtrent en dag hver, og
rådgiverfladen er dyrere end dem alle, fordi datalaget skal vendes.
Punkt 1–4 er hver for sig overskuelige; **punkt 5 er alene på størrelse
med de fire tilsammen.** To-dages-tallet er ikke efterprøvet og er
formentlig for lavt.

**Hvad formiddagen 4/9 viste:** punkt 1, 3 og 4 plus etape 1 af punkt 5
blev skrevet på én formiddag med to Claude Code-vinduer (#603, #604,
#605, #607, plus #608 uafhængigt). To-dages-tallet er stadig ikke
efterprøvet — etape 2 og 3 af punkt 5, punkt 6, 7 og 8 udestår — men
**opdelingen i etaper er dét, der gør punkt 5 håndterbart:** hver etape
er en PR der kan bevises på skærm for sig, og datalaget (`useVirksomhed`)
er vendt én gang for alle i etape 1, så de næste etaper er blokke, ikke
ombygning.

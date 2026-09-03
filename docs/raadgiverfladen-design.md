# Rådgiverfladen — design

**Besluttet 3. september 2026, aften, af Jonas i samtale med Claude.**
Dette er en designbeslutning, ikke en recon. Den er skrevet så nogen kan
bygge fra den om tre uger uden at have været med i samtalen. Hvad den
IKKE afgør står i §8, og hvad der skal ske før der skrives kode står i
§9.

Grundlaget er reconen fra samme aften, `~/Downloads/recon-raadgiverfladen-2.md`.
Den ligger uden for repoet og skal genskabes hvis den bruges; de tal fra
den som dokumentet hviler på, står gengivet i §1 med kilde. Den tidligere
kortlægning (`~/Downloads/recon-raadgiverfladen.md`, 3/9 middag) og
`docs/hjemmebane/konvergens.md` §2.2 og §2.9 er forhistorien.
Medlemsskiftet (`HbVisningSom`, #573) er løst uafhængigt og indgår som
byggesten, ikke som opgave.

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
| Sektioner på `MemberDetail` | 11 | `MemberDetail.tsx:852–1680` (kommentar-markørerne) |
| Virksomheder uden medlemmer i prod | 3 | Din økonomiafdeling, Two Socks, WESDEX — målt 3/9 (`docs/indgangen-overhaling.md` §10) |

Hele Hb-admin'en nås altså kun ved at kende URL'en. Og funktionerne
findes allerede: forsidens fem buckets er den rigtige dom, MemberDetail
har det meste af det en rådgiver skal vide om én virksomhed.
**Problemet er spredning, ikke mangel.**

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

### 3.4 Chatten flytter ind på virksomhedssiden — og `/chat` bliver stående

Chatten vises **på virksomhedssiden i fuld højde, med tallene ved
siden af** (§4, blok 3). Det er dér samtalen hører hjemme: ved siden af
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
| 1 | **Ikke hørt fra længe** — med antal dage | ØVERST, fordi det er dér rådgiveren selv tager fat, og den vigtigste regel er at **ingen må glemmes** | bucket `stale`, `AdvisorDashboard.tsx:1135` |
| 2 | Venter på dit svar | ubesvarede beskeder | bucket `waiting`, l. 1129 |
| 3 | Noget stikker ud i tallene | afvigelser i seneste rapport | bucket `standsOut`, l. 1130 |
| 4 | Fornyelser der skal besluttes | beslutning mangler i vinduet | `FornyelsesSektion` på `/members` |
| 5 | Indgange der ikke er betalt | betalingsmail sendt, ingen betaling | `IndgangsSektion` på `/members` |
| 6 | Friske tal | ny rapportering, fortjener sparring | bucket `fresh`, l. 1133 |

**Indgangen og Fornyelsesbeslutninger flytter dermed FRA `/members` TIL
forsiden**, fordi de er arbejdskøer, ikke virksomhedsdata. Bucket
`positive` («Positive muligheder», l. 1134) er ikke i rækkefølgen
ovenfor; om den lever videre som del af 3 eller 6 afgøres ved
implementering (ikke en åben designbeslutning, en detalje).

Hver række i en kø linker til `/virksomhed/:companyId`.

### 3.6 Virksomhedslisten bliver ren

Under Virksomheder: **et søgefelt og en række pr. virksomhed** med:
navn, branche, kontaktperson, medlemsstatus (tier-badgen), sidste
kontakt, sidste rapportering, plus **et advarselsmærke ved fejlet træk**
(`company_traek`, #574). Klik åbner virksomhedssiden.

**Alle handlinger flytter til virksomhedssiden:** omdøb, rediger
virksomhedsdata, inviter, gensend invitation, tilknyt bruger, berig med
ansøgning, slet. I dag ligger de som otte callbacks på rækken
(`MemberCompanyRow.tsx:78–579`) og seks dialoger på listen
(`Members.tsx:1310–1677`). En liste man leder i skal ikke også være det
sted man handler.

### 3.7 Nøgletallene og tragten skæres fra listen

`MembersStatsBar` (otte tal: Virksomheder, Teammedlemmer, Ubesvarede,
Har rapporteret, Uden slutdato, Udløbet, Inaktive, Aldrig logget ind)
og `MembersOnboardingFunnel` (Ikke inviteret → Inviteret → Aktiveret →
Rapporteret → Klar) fjernes fra listen. **Begrundelse:** de besvarer
ikke et dagligt spørgsmål. Skal de leve, hører de **nederst på forsiden
som én linje**. Foreslået af Claude, accepteret af Jonas, **kan omgøres**
hvis det viser sig at et af tallene faktisk bruges.

---

## 4. Virksomhedssiden — fem blokke i læserækkefølge

`/virksomhed/:companyId`, i HbMemberShell (medlemmets skal, med
rådgiverens menu, §3.1). Fra top til bund:

**1. Hvad skal du vide nu.** Bullets, ikke paneler. Ny rapportering
siden sidst; hvad stikker ud i tallene; opgaver der venter på svar; hvor
længe siden I talte sammen. **Samme dom som forsidens buckets, for én
virksomhed** — ikke en ny beregning. Hvilke bullets der fortjener plads
afgøres ved at se på rigtige virksomheder (§8).

**2. Emnerne I har talt om.** Se §5. «I har talt om likviditet fire
gange, senest 12/8. Prissætning to gange, senest i maj.» Sorteret efter
hvad der er længst siden.

**3. Chatten** i fuld højde, med opgaveoprettelse. Samme tråd som
`/chat` viser, samme skrivevej.

**4. Tallene.** Finansielt snapshot med **afvigelserne fremhævet frem
for alle tal**. Det MemberDetail i dag viser som «Financial snapshot» og
«Finansiel udvikling» (`MemberDetail.tsx:1176–1343`), men vendt: det
der er skævt først.

**5. Aktivitet.** Hvad de faktisk bruger: rapportering, akademi,
handouts. Kort. **Med accept af at nogle skriver meget og ser lidt
video, mens andre gør det modsatte. Begge dele er i orden; fladen må
ikke fremstille det ene som svigt.** Ingen røde tal for «har ikke set
ugens video».

**6. Aftalen.** Kontrakt (start, slut, pris), betaling (perioder,
træk, fejlede træk), medlemmer (med «Aldrig logget ind»), invitationer
(afventende, gensend). Her ligger handlingerne fra §3.6. Det er det
`EditCompanyDialog`, `MembersAdminSection` og rækkens udfoldede del
bærer i dag.

(Seks blokke, hvor listen i samtalen talte fem: emnerne er skilt ud som
egen blok fordi de er det vigtigste nye — §5.)

---

## 5. Emne-opsamlingen

Jonas' vigtigste ønske, nævnt tre gange i samtalen.

**Problemet:** chatten er i dag én lang tråd uden hukommelse. Den
rådgiver der åbner en samtale efter tre uger, må scrolle for at huske
hvad der blev talt om, og det de talte om i maj er væk.

**Løsningen er IKKE et resumé.** Et resumé bliver en ny lang tekst
ingen læser, og det skal genereres igen hver gang tråden vokser.

**Løsningen er emner.** Hver besked klassificeres løbende mod en **fast
liste** af rådgivningsemner — likviditet, prissætning, salg,
ansættelser, ejerskab, drift m.fl. (den præcise liste: §8).
**Fast, ikke frit genereret.** Frie tags driver fra hinanden og bliver
til tres etiketter der betyder det samme («cash flow», «likviditet»,
«penge i kassen»). Det er samme lærdom som webhook-hvidlisten, hvor
hvidliste slog sortliste (#563, `docs/adgangsdomme.md` §1), og som
branchemotoren, der mapper mod et fast register frem for at gætte
(`docs/indgangen-overhaling.md` §6).

**Visningen** på virksomhedssiden (blok 2): ét emne pr. linje med
antal og seneste dato — «I har talt om likviditet fire gange, senest
12/8.» — sorteret efter hvad der er **længst siden**, så det glemte står
øverst. **Klik hopper til beskederne** med det emne.

**Fra et emne kan der oprettes en opgave** med samtalen som ophav.
Opgaven bærer referencen til emnet, og emnet bærer referencerne til
beskederne.

### Krav til datamodellen — fra dag ét

**Referencen fra opgave til emne til besked skal ligge i datamodellen
fra den første version. Den kan ikke laves bagud.** Konkret:

- En klassifikation er en række: besked-id, emne (fra den faste
  liste), tidspunkt, og hvem/hvad der satte den. Én besked kan bære
  flere emner.
- En opgave oprettet fra et emne bærer emnets id OG den eller de
  besked-id'er der var ophavet — ikke kun en fritekst.
- Emnelisten er data (en tabel eller en enum), ikke strenge spredt i
  koden, så et emne kan omdøbes uden at klassifikationerne mister
  betydning.

Bygges klassifikationen uden besked-referencen «fordi vi kun skal bruge
tællingen nu», kan «klik hopper til beskederne» og «opgave med samtalen
som ophav» ikke bygges bagefter uden at klassificere alt igen. Det er
et krav, ikke en note.

---

## 6. Regnestykket

| | i dag | efter |
|---|---|---|
| rådgiverflader | 18 ruter i to skaller (10 AppLayout, 8 HbAdminShell) | **4**: forside (Dit Boardroom), indbakke (`/chat`), virksomhedsliste (Virksomheder), virksomhedsside (`/virksomhed/:companyId`) |
| platformdrift | 13 af de 18 ruter, spredt i to menuer og uden menu | én blok (Platform) under admin |
| menuer | AppSidebar (gammel), HbAdminShell-nav, HbMemberShell (uden rådgiverpunkter) | medlemmets menu + adminblokken |
| veje ind til én virksomhed | 4 | 1 |
| steder medlemslisten findes | 3 | 1 (+ forsidens køer, som er noget andet) |

Fire rådgiverflader plus platformdriften som egen blok.

---

## 7. Hvad der bevares uændret

- Override-mekanikken i `useAuth` (`setCompanyOverride`,
  `clearCompanyOverride`) — «Se som medlem» bruger den som i dag.
- `HbVisningSom` (#573) — bliver den normale vej tilbage.
- Forsidens buckets som dom (`AdvisorDashboard.tsx`) — flyttes, ikke
  omskrives.
- `afgoerFornyelsestilstand` og indgangens betalingsfrist-motor — køerne
  på forsiden bruger de samme domme som `FornyelsesSektion` og
  `IndgangsSektion` i dag.
- `/chat` som indbakke (bevidst dublet, §3.4).
- Alle adgangsdomme (`docs/adgangsdomme.md`) — ingen af dem rører
  rådgiverfladen.

---

## 8. Hvad dokumentet IKKE afgør

- **Hvilke emner der præcis er på den faste liste.** Kræver at man ser
  på rigtige samtaler — ikke gætter fra et skrivebord. Listen skal være
  kort nok til at kunne huskes og lang nok til at rumme det der faktisk
  tales om.
- **Hvilke bullets der fortjener plads i «Hvad skal du vide nu».**
  Kræver at man ser på rigtige virksomheder og spørger hvad rådgiveren
  faktisk havde brug for at vide før mødet.
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

---

## 9. Før der skrives kode

**En recon af hvad MemberDetails elleve sektioner og MemberCompanyRows
handlinger rent faktisk læser og skriver**, så intet tabes i
flytningen. Konkret, KUN fund:

1. `src/pages/MemberDetail.tsx` — for hver af de elleve sektioner
   (Hero, Refleksion, Hvad stikker ud, Ansøgningskontekst, Session prep,
   Financial snapshot, Finansiel udvikling, Samtaleemner, AI-sparring,
   Milestones + Handouts, Agent log, Reports, Delivery Overview): hvilke
   tabeller og RPC'er den læser, hvilke edge functions den kalder, og
   hvilken af de seks blokke i §4 den hører til — eller om den ikke hører
   til nogen.
2. `src/components/members/MemberCompanyRow.tsx` og `Members.tsx` — for
   hver af de otte handlinger (omdøb, inviter, tilknyt, fjern medlem,
   berig, gensend, rediger, slet): hvad den skriver, hvilken edge
   function eller RPC den går igennem, og hvilke værn (isAdmin/isAdvisor,
   bekræftelsesdialog, dry-run) den har i dag.
3. `AdvisorDashboard.tsx` — buckets' præcise betingelser (hvad er
   «stale», hvor mange dage; hvad er «stands out»), så forsidens køer
   kan bygges med samme dom.
4. `AdvisorNotifications.tsx` — hvilke deep-links der findes, og hvilke
   der skal pege på `/virksomhed/:companyId`.
5. Hvad de tre virksomheder uden medlemmer bærer af data i dag, så
   virksomhedssiden kan vises for en virksomhed uden `company_members`.

Først når det kort findes, kan rækkefølgen af ombygningen (§8)
besluttes.

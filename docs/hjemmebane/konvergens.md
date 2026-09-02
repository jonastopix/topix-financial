# Konvergens — helhedsregnskabet over eksisterende platform vs. Hjemmebane-laget

Projekt Hjemmebane · oprettet 2026-08-05 (fra hb-konvergens-recon, godkendt)

---

## §0 Formål + VEDLIGEHOLDSREGEL

Platformen taler i dag to designsprog: det gamle app-udtryk (mørk sidebar,
shadcn, glass-card, AppLayout) og Hb-identiteten (lys, premium-redaktionel,
`.theme-hjemmebane`). Dette dokument er det samlede regnskab over hvilke
flader der findes, hvilket sprog de taler, hvor dobbelthederne bor, og i
hvilket forum hver enkelt afgøres. Formålet er at konvergensen sker ved
BESLUTNINGER, ikke ved drift.

**VEDLIGEHOLDSREGEL (bindende):**

1. Dette dokument opdateres i ENHVER PR, der ændrer flader, navigation
   eller designsprog (nye routes, nav-punkter, konverteringer, pensioner).
2. ALLE fremtidige design-blokke skal indeholde et **"Konvergens"-afsnit**,
   der svarer på: (a) hvad findes i forvejen på/omkring fladen, (b) hvordan
   bygges der sammen med det, (c) hvilken dobbelthed afvikles — eller
   skabes — og i så fald hvor er afviklingen bogført (§2-punkt).
3. Enhver FLADE-design-blok skal desuden svare på: **"hvad er
   admin-modstykket, og hvor bor det i Admin-spejlet (§5)?"** — også når
   svaret er "intet" (så begrundes det).

---

## §1 FLADEREGNSKAB

Designsprog: **[GAMMEL]** = AppLayout/mørk sidebar/shadcn · **[HB]** =
`.theme-hjemmebane`, standalone skal · **[STANDALONE-GAMMEL]** = uden
AppLayout, gamle tokens.

Skæbner (konservativt — kun det besluttede er markeret besluttet):
**Konverteres-før-lancering** (princip 8, produktbeslutning 2026-08-05) ·
**Konverteres-til-Hb** · **Forbliver-indtil-videre** (m. retningsnote) ·
**Afgøres-i-onboarding-epic** · **Afgøres-i-demo-beslutning** ·
**Pension-kandidat**.

### Auth/onboarding

| Route | Side | Formål | Sprog | Skæbne |
|---|---|---|---|---|
| /auth(/\*) | Auth.tsx | Login/signup (invite-grene) | HB (2/9, indgangen-overhaling §7.5): alle fem tilstande — signup (delt skærm m. `HbRaadgiverPortraetter`, uden Google), login (rolig, Google kun her), nulstil, «Tjek din mail», «Konto oprettet». Route-spinnerne i App.tsx er stadig gamle tokens | Konverteret (spinnerne følger i trin 10-12) |
| /reset-password | ResetPassword.tsx | Kodeord-reset | STANDALONE-GAMMEL | Konverteres-før-lancering |
| /onboarding | Onboarding.tsx | Setup-wizard (navn/branche/virksomhed, needsOnboarding-gate) | STANDALONE-GAMMEL | Afgøres-i-onboarding-epic (dataindsamling vs. oplevelse, jf. §2.1) + Konverteres-før-lancering |

### Medlem (kerne)

| Route | Side | Formål | Sprog | Skæbne |
|---|---|---|---|---|
| / | Index.tsx | Dashboardet — KPI-kort, sundhed, prioriteringskø (advisor) | GAMMEL | Konverteres-før-lancering (navnet "Dit Boardroom" er allerede udrullet i Hb-nav'en; den tungeste enkelt-konvertering, §2.3) |
| /reports | Reports.tsx | Rapportering: upload + pipeline | GAMMEL | Konverteres-før-lancering — UNDER AFLØSNING: /rapportering er bygget; GO = swap HER (URL'en er email-kontrakt); fladen er frosset og bærer trash + trend/AI indtil deres nye hjem (trend/AI: INDFRIET af /noegletal — Rapportering-GO må ikke ligge før KPI-GO; trash → drift-gruppen) |
| /budget | Budget.tsx | Årsbudget, forecast, hvad-hvis | GAMMEL | Konverteres-før-lancering — UNDER AFLØSNING: /budgettering er bygget; GO = swap HER (URL'en er notifikations-kontrakt: detect-financial-alerts skriver /budget-deep-links; #forecast er Guide-kontrakt); maskinlaget (budgetEngine) er udskilt og deles |
| /milestones | Milestones.tsx | Mål + fremdrift | GAMMEL | Konverteres-før-lancering (do.) |
| /handouts | Handouts.tsx | Interaktive handouts (5 moduler) | GAMMEL | Konverteres-før-lancering (definitions-arkitekturen afgøres i handout-sprintet, §2.5) |
| /kpis | KPIs.tsx | Nøgletal m. trend/benchmark | GAMMEL | Konverteres-før-lancering — UNDER AFLØSNING: /noegletal er bygget (fuld paritet + trend/AI — forpligtelsen fra rapporterings-rækken INDFRIET her); GO = swap HER (URL'en er notifikations-/email-kontrakt: notify-kpi-comment, detect-financial-alerts, send-monthly-digest + #goals-Guide-ankeret) |
| /chat | ChatShell.tsx | Samlet chat (rådgiver/AI) | GAMMEL | Konverteres-før-lancering |
| /book-session | BookSession.tsx | Sessionsbooking | GAMMEL | Konverteres-før-lancering |
| /pulse | PulseCheckin.tsx | Måneds-refleksion (?period=) | GAMMEL | Konverteres-før-lancering |
| /community | Community.tsx | Bro til Circle-community | GAMMEL | Forbliver-indtil-videre — genbesøges ved Circle-exit (C3) + Konverteres-før-lancering |
| /guide | Guide.tsx | Guiden — tekst-onboarding/manual (founder + advisor-playbook) | GAMMEL | Afgøres-i-onboarding-epic (afløses/integreres — aldrig to onboardings, §2.1) + Konverteres-før-lancering |
| /annual-baseline | AnnualBaseline.tsx | Årsrapport-baseline-flow | GAMMEL | Konverteres-før-lancering |
| /settings | Settings.tsx | Indstillinger/profil | GAMMEL | Konverteres-før-lancering |

### Hjemmebane (medlemsflade)

| Route | Side | Formål | Sprog | Skæbne |
|---|---|---|---|---|
| /akademiet(/:area(/:slug)) | Akademiet.tsx | Forside → område → element (video/body/handout-kort/materialer/progress) | HB | Konverteret (C1 trin 3) |
| /boardroom | Boardroom.tsx | Hb-forsiden "Dit Boardroom" (push-hero, tal-strip, næste skridt, events, talks) | HB | Konverteres-til-Hb — UNDER BYGGERI, advisor-gated route; GO = swap-PR til "/" (§2.3) |
| /rapportering | Rapportering.tsx | Hb-rapporteringen — LEVERANCEN (upload/engine, leveringsbånd, nudges, tilstandskort, årsrapporter; dialoger som bro) | HB | Konverteres-til-Hb — UNDER BYGGERI, advisor-gated route; GO = swap på /reports (email-kontrakt), /rapportering → redirect |
| /noegletal | Noegletal.tsx | Hb-KPI-fladen — fuld paritet + trend/AI (mål-hero, trend-overblik, kort, detail m. advisor-kommentarer, gauge, tabel; AI i Hb-udtryk) | HB | Konverteres-til-Hb — UNDER BYGGERI, advisor-gated route; GO = swap på /kpis (notifikations-kontrakt), /noegletal → redirect; KPI-GO SKAL ligge før/samtidig m. Rapportering-GO |
| /budgettering | Budgettering.tsx | Hb-budgetfladen — fuld paritet (oversigt, scenarier/redigering, BvA, import ×2, hvad-hvis m. #forecast-anker, cashflow) | HB | Konverteres-til-Hb — UNDER BYGGERI, advisor-gated route; GO = swap på /budget (notifikations-deep_link + Guide-hash er kontrakt), /budgettering → redirect |
| /preview/hjemmebane | PreviewHjemmebane.tsx | V0-designprøve "Dit Boardroom" (døde links, bag login) | HB | Pension-kandidat — pensioneres i swap-PR'en (§2.3); indtil da referencen for miljø-udtrykket |

### Advisor

| Route | Side | Formål | Sprog | Skæbne |
|---|---|---|---|---|
| /members(/:userId) | Members/MemberDetail | Medlemsoversigt + enkeltmedlem | GAMMEL | Konverteres-før-lancering (advisor-dagligdagen, princip 8) |
| /admin/review-queue | ReportReviewQueue.tsx | Rapport-pipeline-kø | GAMMEL | Konverteres-før-lancering (advisor-dagligdagen, princip 8) |
| /admin/indhold(/partnere,/events,/fremdrift,/boardroom) | AdminContent.tsx | Hb-admin: indholdsstyring (C1) + fremdriftsværktøj + Dit Boardroom-push-editor (2026-08-05) | HB | Konverteret |

### Admin

| Route | Side | Formål | Sprog | Skæbne |
|---|---|---|---|---|
| /admin/config, /admin/emails, /admin/email-log, /admin/import, /admin/report-debug/:id, /admin/feedback, /admin/legat | (7 sider) | Platformdrift | GAMMEL | Forbliver-indtil-videre (interne værktøjer — lav konverterings-prioritet) |

### Legat (medlemsvariant)

| Route | Side | Formål | Sprog | Skæbne |
|---|---|---|---|---|
| /legat | LegatDashboard.tsx | Legat-forløbets dashboard | GAMMEL | Konverteres-før-lancering (§2.6) |

### Demo (uden auth)

| Route | Side | Formål | Sprog | Skæbne |
|---|---|---|---|---|
| /demo/\* | DemoLayout + 7 sider | Statisk salgsdemo på dåse-data | STANDALONE-GAMMEL | Afgøres-i-demo-beslutning (§2.4) |

### Diverse

| Route | Side | Formål | Sprog | Skæbne |
|---|---|---|---|---|
| \* | NotFound.tsx | 404 | STANDALONE-GAMMEL | Forbliver-indtil-videre |
| (ingen) | ~~pages/Demo.tsx~~, ~~pages/GroupChatRoom.tsx~~ | Forældreløse (uroutede, uimporterede) | — | **Pensioneret i denne PR** (§4) |

---

## §2 DOBBELTHEDER

### §2.1 Onboarding — fire artefakter · afgøres i: ONBOARDING-EPIC

**Hvad/hvor**: (a) Guiden (`/guide`) — tekst-manual, founder-featureliste +
advisor-playbook. (b) Setup-wizard'en (`/onboarding`) — obligatorisk
førstegangs-dataindsamling (needsOnboarding-gate i alle ruter; PWA-hardening
via localStorage `tbr.onboarded`, App.tsx:120-137). (c) BACKLOG-epicen
[P2·EPIC] — den interaktive førstegangs-oplevelse. (d) Forældreløse
`data-tour`-attributter uden forbruger (AppSidebar.tsx `nav-reports`/
`chat-link`, Index.tsx `kpi-cards`, Reports.tsx `upload-zone` ×2) — rester
af et tidligere rundtur-tilløb.

**Retning**: besluttet for (a)+(c): epicen afløser/integrerer Guiden —
aldrig to onboardings side om side. (b) er dataindsamling, ikke oplevelse —
rundturens forværelse eller separat; afgøres i epic-designet. (d):
epic-reconnen afklarer genbrug vs. oprydning af ankerpunkterne.
Epicens scope er alene PLATFORM-onboardingen — "Start her"-områdets rolle
er lukket separat (Akademi-intro, besluttet 2026-08-05, jf. §2.7).

### §2.2 Navigation — fire menu-sandheder · afgøres i: NAVIGATIONS-KONVERGENS

**Hvad/hvor**: AppSidebar (flad, m. legat-/mobilrådgiver-varianter)
+ mobil "Mere"-menu (AppLayout.tsx:118-125) · HbSidebars V0-nav (døde links)
· HbAkademiShells AKADEMI_NAV (rigtige links) · DemoLayouts NAV.
Tre forskellige informations-arkitekturer.

**Retning**: Hb-miljøstrukturen er mål-IA'en (§3). Rejsen ud af Hb lander i
gammel UI — inkl. "Dit Boardroom" → "/" (gamle Dashboard). Rejsen IND er
bygget som bevidst bro ("Akademiet"-punkt i AppSidebar, §4) — men
ADVISOR-GATED indtil eksplicit lancerings-GO (§2.8). Fuld konvergens
(Hb-skal på flere ruter, varianternes indplacering) er sit eget spor.
NOTE (2026-08-05): Hb-medlemssiderne deler nu ÉN skal (HbMemberShell,
afløser HbAkademiShell) — dens "Dit Boardroom"-mål er advisor-gated til
/boardroom i forside-byggeperioden (medlemmer ser uændret "/"; §2.3).
Admin-nav'en spejler nu medlems-nav'ens Hb-destinationer (Admin-spejlet,
§5): "Indhold"-fanen er omdøbt "Akademiet", og en ny "Dit Boardroom"-fane
(let push-editor) står først — keys/URL'er er bevaret.
NOTE (2026-08-05, rapporteringen): "Dine tal → Rapportering" i
HbMemberShell er advisor-gated til /rapportering i byggeperioden (samme
mønster som Dit Boardroom-målet); medlemmer ser uændret /reports.
Rapporteringens BROER (bevidste, jf. design-blokken): ReportReviewDialog +
ReportManualOverride + PulseCheckinModal (RP-1-hærdet flow åbnes uændret
over Hb-fladen; deres toasts består til dialog-konverteringen, BACKLOG
[P3]) samt AdvisorCompanyPrompt. Engine-laget (reportUploadEngine,
deliveryMonths) er udskilt som ren flytning og deles med gammel UI.
NOTE (2026-08-05, KPI'er): "Dine tal → KPI'er" i HbMemberShell er
advisor-gated til /noegletal i byggeperioden (samme mønster). KPI-fladens
broer: AI-broen er AFVIKLET (2026-08-05) — /noegletal bruger
HbFinancialAnalysis over useFinancialAnalysis-hooken (maskinen udskilt som
ren flytning; én sandhed for messages-idempotensen); gamle udtryk består
KUN på frosne /reports indtil dens swap (GO-koordineringen KPI-GO ≤
Rapportering-GO uændret). Intet admin-modstykke — generering sker
on-demand på medlemsfladen; commentary-maskinen (generate-financial-
commentary, stale-markering) hører drift/Medlemmer til. Tilbageværende
KPI-bro: gamle PeriodSelector (urørt; kun usePeriodFilter-hooken
genbruges). FinancialOverview (forældreløs, 0 importører) er pensioneret.
NOTE (2026-08-05, budget): "Dine tal → Budget" i HbMemberShell er
advisor-gated til /budgettering i byggeperioden (samme mønster).
Budgettets maskinlag (budgetEngine: loadBudget-afkodning + alle
klient-skriveveje W1-W7) er udskilt som ren flytning og deles m. gammel
UI — eneste bogførte semantik-ændringer er W6-company-filteret (recon
§7.3-rettelsen) og at "fra regnskab" ikke længere skriver en falsk
webshop_b2c-skabelonmarker (budget-design §e(i)). Budgettets broer:
CombinedBudgetWidget røres ikke (forside-konverteringens sag); toasts
består på gammel /budget-flade. (Koncern-broen budgetTemplates/MONTHS →
/group/budget er OPLØST 2026-08-05 — koncern fjernet, §2.6.) Pensioneret i samme PR
(0 importører): BudgetOverview.tsx, BudgetComparison.tsx,
RollingForecastCard.tsx.

**NOTE (2026-08-05, fremdriftsværktøjet)**: der findes nu TO medlemslister
i to designsprog — Members.tsx (/members, gammel UI: drift/økonomi) og
Fremdrift-fanen (/admin/indhold/fremdrift, Hb: Akademi-fremdrift +
markering). Bevidst skabt dobbelthed; retning: Members-konverteringen
(princip 8, "advisor-dagligdagen") forener listerne — Fremdrift-fanens
medlemsliste er forløberen for Hb-udgaven. Samtidig AFVIKLET: Circle-
eksport-dobbeltheden (BACKLOG [P1] omskrevet — API-sporet probet dødt
2026-08-05; værktøjet er afløseren).

### §2.3 Dashboard-forsiden vs. "Dit Boardroom" · afgøres i: FORSIDE-KONVERTERING

**Hvad/hvor**: "/" er det gamle Dashboard (Index.tsx). "Dit Boardroom"
findes som V0-attrap (/preview/hjemmebane) og som link-label i begge
Hb-nav'er — pegende på "/". Navnet er udrullet; fladen bag det er ikke bygget.

**Retning**: forsiden er den tungeste enkelt-konvertering (KPI-strip,
sundhed, advisor-prioriteringskø). Previewen er referencen og pensioneres
ved konverteringen (§1).

**STATUS (2026-08-05): UNDER KONVERTERING — route-parallel.** /boardroom er
bygget (preview-kernen m. rigtige kilder: push-hero, tal-strip fra
facts-laget, deriveNextStep-porten af ActionCenter-prioriteringen, events,
talks) bag AdvisorRoute; Index ("/") er FROSSET urørt. Midlertidig, bevidst
dobbelthed (to forsider) — begrænset til byggeperioden. GO = swap-PR:
"/"-MEDLEMSGRENEN renderer Boardroom (advisor-grenen/AdvisorDashboard
bevares uændret — egen konvertering), nav-målet → "/" for alle, gammel
medlems-Index + previewen pensioneres, dette punkt lukkes. Guard-inventar
og forudsætninger: BACKLOG "[P1] Forside-GO = swap-PR". Fælles medlems-skal
(HbMemberShell) afløste HbAkademiShell i samme PR — "Dit Boardroom"-målet i
skallen er advisor-gated til /boardroom i byggeperioden (medlemmer ser
uændret "/"; ingen døde links). Push-området er aktiveret (admin-fane +
forside-hero); Akademiet er forseglet mod push via akademi-flaget på AREAS
(ForsideView/OmraadeView/ElementView-værn). Bevidst udeladt af
næste-skridt-porten: weekly_focus, ulæste beskeder, company_actions,
announcements (bogført i forside-design-blokken).

### §2.4 Demo-miljøet · afgøres i: DEMO-BESLUTNING

**Hvad/hvor**: syv statiske kopisider af medlemsfladen i gammelt designsprog,
egen nav, uden auth, dåse-data (src/demo/). Drifter ved hver ændring af de
rigtige flader; viser et forældet produkt når Hb-konverteringen når
medlemsfladerne.

**Retning**: opdatér-til-Hb / frys-som-salgs-snapshot / pension — beslutningen
hører til sidst i konvergensen; ingen kode-signaler peger endnu.

### §2.5 Handout-arkitektur vs. indholdslag · afgøres i: HANDOUT-SPRINT

**Hvad/hvor**: handouts = kode-definitioner (handoutConfig.ts) + svar-tabel,
gammel UI på /handouts; indholdslaget = DB-drevet (content_\*), Hb-UI,
admin-flade. Broen findes (content_items.handout_module) men krydser
designsprog-grænsen: refleksionskortet (Hb) linker ind i gammel UI.

**Retning**: slutbilledet er ét indholdssystem. Eksplicit udskudt: BACKLOG
[P3] data-drevne handout-definitioner (orphan-problemet skal LØSES, ikke
arves) + [P3] fase 2 omvendt link. Koblingen peger på modul-nøglen og
overlever ombygningen.

### §2.6 Legat-varianten · afgøres i: LEGAT-STILLINGTAGEN

**Koncern: FJERNET 2026-08-05** — produktbeslutning (Jonas): funktionen
fjernes helt og gentænkes forfra ved behov (recon: hb-koncern-recon.txt).
Kode-PR feat/koncern-fjernelse sletter alle flader/ruter/edge-funktioner;
data-frigørelsen (SPOR 2) og DB-droppet (SPOR 3, SECURITY DEFINER-
objekter — eget grønt lys) følger.

**Hvad/hvor (legat)**: eget dashboard (/legat), egen hardcodet nav-variant
m. låste rækker + Momentumkald-CTA, server-side modul-gating
(legat_unlocked_modules) m. spejlet klient-logik (Handouts.tsx:67-74).

**Retning**: variant, ikke dobbelthed — men enhver navigations-/forside-
konvergens skal tage stilling (Hb-nav'en kender den ikke). BEMÆRK
(besluttet i denne PR): "Akademiet"-broen tilføjes IKKE i legat-variantens
hardcodede liste — legat-forløbet er kurateret; Akademi-adgang for legat
afgøres i legat-stillingtagen.

### §2.7 Småfund

Forældreløse filer pensioneret i denne PR (§4). "Start her"-området: rollen
er LUKKET (besluttet 2026-08-05, klik-valg A) — området ER Akademiets
introduktion; indholdet (samlingen "Kom godt i gang med vores Akademi",
3 videoer inkl. målsætnings-lektion m. overordnet handout-kobling) er
blivende, og "fyldes ikke endnu"-reglen er ophævet. Platformens onboarding
bor fortsat udenfor (BACKLOG-epicen, §2.1). Redirect-laget
(/group/chat m.fl.) er platformens eget mønster for flade-sammenlægning —
ophøjet til princip i §3.

### §2.8 Akademiet-lancering · afgøres i: SEPARAT PRODUKTBESLUTNING (GO fra Jonas)

**Hvad/hvor**: Akademiet-nav-punktet (AppSidebar) er ADVISOR-GATED
(advisorOnly-flag) — medlemmer ser det ikke, mens Circle stadig kører og
indflytningen er i gang; i mobil-"Mere"-menuen (som kun renderes for
medlemmer) er punktet fjernet. URL-adgang til /akademiet har eksisteret
siden C1 trin 3 og er uændret (RLS/published-gate + dryp beskytter
indholdet; fladen er blot ulinket for medlemmer).

**Retning**: medlemssynlighed kræver eksplicit lancerings-GO. Forudsætninger:
indhold klar, testindhold ryddet fra Start her, medlemskommunikation og
Circle-plan. GO'et gælder HELHEDEN — ikke Akademiet isoleret: lancering
forudsætter at hele medlemsrejsen er redesignet (princip 8).
BACKLOG: [P1] Akademiet-lancering.

---

## §3 PRINCIPPER (den røde tråd)

1. **Hb-miljøstrukturen er mål-IA'en for navigation** (Dit Boardroom · Dine
   tal · Din rådgiver · Akademiet · Community · …) — nye nav-beslutninger
   må ikke pege væk fra den.
2. **Ét designsprog pr. medlemsrejse** — sprogskift sker kun over BEVIDSTE
   broer (som Akademi-punktet og refleksionskortet), aldrig midt i en flade.
3. **ALDRIG to onboardings** side om side (produktbeslutning 2026-08-05).
4. **Ingen indholdsboks uden besluttet rolle** — ikke flere bokse end højst
   nødvendigt ("Start her"-reglen).
5. **Ingen døde links i rigtige medlemsflader** (HbAkademiShell-reglen; døde
   links hører kun hjemme i previews).
6. **Redirect-mønstret ved flade-sammenlægninger**: behold den gamle route,
   `Navigate` til den nye verden (som /group-chats → /chat).
7. **Hb-tokens forbliver scoped** til `.theme-hjemmebane` — aldrig `:root`;
   PDF-eksporten afhænger af app-temaet (:root/.dark i index.css).
8. **Intet åbnes halvfærdigt**: medlemmer får ALDRIG adgang til noget, de
   allerede kender, i ny men halvfærdig form — hele medlemsrejsen (alle
   medlemsvendte flader samt advisor-dagligdagen) redesignes til
   Hb-identiteten FØR lancerings-GO. Produktbeslutning (Jonas) 2026-08-05.

---

## §4 FØRSTE KONVERGENS-HANDLINGER (= denne PR)

1. **Dette dokument** oprettet + vedligeholdsregel og design-blok-kravet (§0).
2. **Bro ind i Akademiet**: "Akademiet"-punkt (GraduationCap) i AppSidebars
   baseNavItems efter Handouts, og i mobil-"Mere"-menuen (AppLayout,
   🎓 efter Handouts). Bevidst IKKE i legat-varianten (§2.6). Recon'ens
   formodede "mobil-dublet" i AppSidebar viste sig at være legat-listen;
   den reelle mobil-medlemsliste er AppLayouts moreMenuItems.
   **KORREKTION (2026-08-05, samme dag)**: punktet er ADVISOR-GATED indtil
   lancerings-GO (§2.8) — advisorOnly-flag i AppSidebar; i mobil-"Mere"-
   menuen (kun medlemmer) er punktet fjernet igen.
3. **CSS-kommentar-drift rettet**: hjemmebane.css-headeren nævner nu de tre
   faktiske importører (PreviewHjemmebane, AdminContent, Akademiet).
4. **Forældreløse filer pensioneret**: src/pages/Demo.tsx +
   src/pages/GroupChatRoom.tsx slettet (uroutede, uimporterede;
   tsc/build er kontrollen).

---

## §5 ADMIN-SPEJLET (besluttet 2026-08-05)

**(i) Princippet**: indholdsredaktion spejler medlemmets verden 1:1 —
admin-fanerne følger medlemmets destinationer og rækkefølge. Advisor-DRIFT
(værktøjer der ikke er indholdsredaktion) er sin egen gruppe, adskilt af en
diskret divider sidst i fanerækken. Redskabet passer til indholdet:
FORMÅLSBYGGEDE editorer over FÆLLES datamodel (PushView og ItemEditor
skriver begge content_items — push behøver fem felter, ikke lektions-
editorens fulde flade).

**(ii) Målbilledet** (HbAdminShell SECTIONS):
Dit Boardroom (let push-editor) · Akademiet (områder/samlinger/items —
tidl. "Indhold") · Rabataftaler · Events · | · Fremdrift (drift).
Keys/URL'er er historiske og bevaret — kun labels/rækkefølge spejler.
**BESLUTNING (Jonas 2026-08-05): Fremdrift omdøbes/udvides til
"MEDLEMMER" på sigt**, når advisor-dagligdagen konverteres — den samlede
drift-fane hvor medlemslisten (jf. §2.2-notens to-medlemslister-retning),
Akademi-fremdriften og rapport-pipeline-overvågningen (Review Queue,
/admin/review-queue) samles. Indtil da er Review Queue uændret på sin
route (rapporterings-design-blokkens admin-modstykke-svar).

**(iii) Fremtidige faner (bogført, ikke bygget)**:
- **Handouts**: NÅR definitionerne bliver data-drevne (BACKLOG [P3]) —
  indtil da er de kode (handoutConfig.ts), og ingen fane skal foregive
  andet.
- **Onboarding**: HVIS epicen gør flowet redaktionelt (video-/trin-
  indhold) — afgøres i epic-designet.
- **Events-tilmelding**: ændrer Events-FANENS indhold (deltagerlister
  m.v.), ikke fanerækken.
- **Gamle admin-værktøjer** (config/emails/email-log/import/feedback/
  legat): UDEN FOR spejlet — platformdrift i gammel UI;
  konverteres sidst (§1-skæbnerne uændret).

**(iv) Gate**: §0-vedligeholdsreglens punkt 3 — enhver flade-design-blok
skal svare på admin-modstykke-spørgsmålet.

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
| /auth(/\*) | Auth.tsx | Login/signup (invite-grene) | STANDALONE-GAMMEL | Konverteres-før-lancering |
| /reset-password | ResetPassword.tsx | Kodeord-reset | STANDALONE-GAMMEL | Konverteres-før-lancering |
| /onboarding | Onboarding.tsx | Setup-wizard (navn/branche/virksomhed, needsOnboarding-gate) | STANDALONE-GAMMEL | Afgøres-i-onboarding-epic (dataindsamling vs. oplevelse, jf. §2.1) + Konverteres-før-lancering |

### Medlem (kerne)

| Route | Side | Formål | Sprog | Skæbne |
|---|---|---|---|---|
| / | Index.tsx | Dashboardet — KPI-kort, sundhed, prioriteringskø (advisor) | GAMMEL | Konverteres-før-lancering (navnet "Dit Boardroom" er allerede udrullet i Hb-nav'en; den tungeste enkelt-konvertering, §2.3) |
| /reports | Reports.tsx | Rapportering: upload + pipeline | GAMMEL | Konverteres-før-lancering (naturlig Hb-kandidat under "Dine tal") |
| /budget | Budget.tsx | Årsbudget, forecast, hvad-hvis | GAMMEL | Konverteres-før-lancering (do.) |
| /milestones | Milestones.tsx | Mål + fremdrift | GAMMEL | Konverteres-før-lancering (do.) |
| /handouts | Handouts.tsx | Interaktive handouts (5 moduler) | GAMMEL | Konverteres-før-lancering (definitions-arkitekturen afgøres i handout-sprintet, §2.5) |
| /kpis | KPIs.tsx | Nøgletal m. trend/benchmark | GAMMEL | Konverteres-før-lancering (naturlig Hb-kandidat) |
| /chat | ChatShell.tsx | Samlet chat (rådgiver/AI/grupper) | GAMMEL | Konverteres-før-lancering |
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
| /preview/hjemmebane | PreviewHjemmebane.tsx | V0-designprøve "Dit Boardroom" (døde links, bag login) | HB | Pension-kandidat — når forsiden er konverteret (§2.3); indtil da referencen for miljø-udtrykket |

### Advisor

| Route | Side | Formål | Sprog | Skæbne |
|---|---|---|---|---|
| /members(/:userId) | Members/MemberDetail | Medlemsoversigt + enkeltmedlem | GAMMEL | Konverteres-før-lancering (advisor-dagligdagen, princip 8) |
| /admin/review-queue | ReportReviewQueue.tsx | Rapport-pipeline-kø | GAMMEL | Konverteres-før-lancering (advisor-dagligdagen, princip 8) |
| /admin/indhold(/partnere,/events) | AdminContent.tsx | Hb-indholdsstyring (C1) | HB | Konverteret (C1 trin 2) |
| /groups(/:groupId) | AdvisorGroupList/Dashboard | Koncern-flader (advisor) | GAMMEL | Forbliver-indtil-videre (§2.6) |

### Admin

| Route | Side | Formål | Sprog | Skæbne |
|---|---|---|---|---|
| /admin/config, /admin/emails, /admin/email-log, /admin/import, /admin/report-debug/:id, /admin/feedback, /admin/groups(/:id), /admin/legat | (8 sider) | Platformdrift | GAMMEL | Forbliver-indtil-videre (interne værktøjer — lav konverterings-prioritet) |

### Legat/koncern (medlemsvarianter)

| Route | Side | Formål | Sprog | Skæbne |
|---|---|---|---|---|
| /legat | LegatDashboard.tsx | Legat-forløbets dashboard | GAMMEL | Konverteres-før-lancering (§2.6) |
| /group(/budget) | GroupDashboard/GroupBudget | Koncern-flader (medlem) | GAMMEL | Konverteres-før-lancering (§2.6) |
| /group/onboarding, /group/setup-complete, /group/chat, /group-chats(/:id/chat) | — | Rene redirects | — | Forbliver (redirect-mønstret, §3) |

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

**Hvad/hvor**: AppSidebar (flad, m. legat-/mobilrådgiver-/koncern-varianter)
+ mobil "Mere"-menu (AppLayout.tsx:118-125) · HbSidebars V0-nav (døde links)
· HbAkademiShells AKADEMI_NAV (rigtige links) · DemoLayouts NAV.
Tre forskellige informations-arkitekturer.

**Retning**: Hb-miljøstrukturen er mål-IA'en (§3). Rejsen ud af Hb lander i
gammel UI — inkl. "Dit Boardroom" → "/" (gamle Dashboard). Rejsen IND er
bygget som bevidst bro ("Akademiet"-punkt i AppSidebar, §4) — men
ADVISOR-GATED indtil eksplicit lancerings-GO (§2.8). Fuld konvergens
(Hb-skal på flere ruter, varianternes indplacering) er sit eget spor.

### §2.3 Dashboard-forsiden vs. "Dit Boardroom" · afgøres i: FORSIDE-KONVERTERING

**Hvad/hvor**: "/" er det gamle Dashboard (Index.tsx). "Dit Boardroom"
findes som V0-attrap (/preview/hjemmebane) og som link-label i begge
Hb-nav'er — pegende på "/". Navnet er udrullet; fladen bag det er ikke bygget.

**Retning**: forsiden er den tungeste enkelt-konvertering (KPI-strip,
sundhed, advisor-prioriteringskø). Previewen er referencen og pensioneres
ved konverteringen (§1).

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

### §2.6 Legat- og koncern-varianterne · afgøres i: LEGAT/KONCERN-STILLINGTAGEN

**Hvad/hvor**: Legat: eget dashboard (/legat), egen hardcodet nav-variant m.
låste rækker + Momentumkald-CTA, server-side modul-gating
(legat_unlocked_modules) m. spejlet klient-logik (Handouts.tsx:67-74).
Koncern: /group(/budget) + /groups(/:id) + redirect-lag fra ældre struktur.

**Retning**: varianter, ikke dobbeltheder — men enhver navigations-/forside-
konvergens skal tage stilling (Hb-nav'en kender ingen af dem). BEMÆRK
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

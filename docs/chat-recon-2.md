# Chat-recon 2 — rå observationer 2026-08-24 (aften)

Grundlag: BACKLOG.md "Chat-epic — fund fra recon 2026-08-21" (BACKLOG.md:1634-1699),
docs/RAEKKEFOELGE.md tempo 5 (RAEKKEFOELGE.md:60-70), koden på main pr. commit 0cd06418.
Rå observationer med fil:linje. Ingen konklusioner, ingen forslag.

---

## 1. STATUS PÅ FASERNE

BACKLOG-afsnittet fra 2026-08-21 er uændret siden commit ab97ac63 (git-verificeret —
ingen senere commits rører afsnittet). Faserne er kun delvist defineret dér; fase 1/2/3's
indhold står i RAEKKEFOELGE.md:51-70 og docs/opgave-model-design.md:7.

### Fase 0 — ops-model fjernet: UDFØRT

- BACKLOG.md:1636-1643: "✅ LUKKET 2026-08-21 — Fase 0 SPOR 1 (PR #378)". Merged
  som dda60563 (2026-08-21 23:21). Beskrivelsen gælder stadig.
- Restpunkt bogført som [P4] døde DB-kolonner (BACKLOG.md:1676-1687):
  conversations.conversation_status, resolved_at, resolved_by_advisor_id,
  acknowledged_at, acknowledged_by_advisor_id, follow_up_at + tabellerne
  conversation_notes og advisor_company_acknowledgments. UÆNDRET — kolonnerne
  findes stadig i types (src/integrations/supabase/types.ts:1085-1102), og drop
  afventer per teksten "fase 1 er kørt og bevist".
- Ny berøring 2026-08-24: PR #413 fjernede den sidste LÆSNING af ops-kolonnerne —
  conversations-selecten i CompanyChatPane henter nu kun 9 navngivne kolonner
  (CompanyChatPane.tsx:288-291, kommentaren :285-287 nævner eksplicit at
  select("*") trak ops-resterne med).

### Fase 1 — opgave-modellen: DELVIST (motor + datamodel + RLS udført; skrivevej, UI og migrering mangler)

Udført siden recon'en 2026-08-21 (alle 2026-08-22 aften):

| PR | Commit | Indhold |
|---|---|---|
| #380/#381/#383 | 332874e6, 313a612f, f737b661 | docs/opgave-model-design.md — B1-B11 besluttet |
| #382 | 960e86f6 | Migration 20260822220000_opgave_model_kolonner.sql (due_date, accepted_at, deferral_count, expires_at, closed_at, proposed_by + 7 tilstande + 2 partielle indeks). Kørt i Lovable |
| #384 | 8bbf404c, d55a135e | src/lib/opgaveEngine.ts (237 linjer, ren motor) + 39 tests |
| #385 | 9c2c7d4a | Migration 20260822224100_opgave_model_rls.sql — alle klient-INSERT/UPDATE-politikker på company_actions droppet; skrivning KUN via service role. Kørt i Lovable 22:41 |
| #386 | e3eb4fd6, 17616eae | SECURITY_BASELINE opdateret (company_actions på service-role-only-listen) |
| #387 | 7780e6a5 | generate-weekly-focus skriver nu status "proposed" + expires_at (14 dage, B10) — generate-weekly-focus/index.ts:553-566 |

Står tilbage (observeret, ikke foreslået):

- opgaveEngine.ts har NUL kaldere uden for tests. Grep over hele repoet: kun
  src/lib/__tests__/opgaveEngine.test.ts, en kommentar i importEngine.ts:6, baseline
  (SECURITY_BASELINE.md:382) og RLS-migrationens kommentar. Ingen edge function,
  ingen komponent.
- Ingen edge functions til accept/udskyd/luk findes (ls supabase/functions/ — intet
  opgave-/action-navn). Se afsnit 4.
- Medlemsfladen læser stadig KUN status='open': BoardroomView.tsx:1348-1349
  (`.eq("status", "open")`). Rækker med status 'proposed' (dem generate-weekly-focus
  har skrevet siden PR #387) matcher ikke filteret.
- run-company-agent skriver stadig den GAMLE form: status "open", ingen expires_at
  (run-company-agent/index.ts:737-745, source_type "agent").
- B9-migreringen af de 102 milestones: ikke påbegyndt (ingen kode, ingen migration).
- Datamigrering af de 70 open/parked-rækker ("spor 2" i opgaveEngine.ts:9-10 og
  design-dokumentets §7): ikke påbegyndt.
- Cron-jobs til udløb/forfald: findes ikke; de to partielle indeks
  (idx_company_actions_expiry, idx_company_actions_due) står klar
  (opgave-model-design.md:237-239, "til de kommende cron-job").

Forældelse/uenighed i grundlaget:

- BACKLOG.md:1646+1662 placerer ulæst-samlingen OG splittet af CompanyChatPane i
  "fase 1". RAEKKEFOELGE.md:60-66 (tempo 5) placerer begge i "fase 3". PR #413's
  commit-besked (758bd50f) skriver "Ulæst-vinduet … hører til fase 3" og
  "fase 3-splittet afventer". De to dokumenter siger ikke det samme om, hvilken
  fase splittet og ulæst hører til.
- docs/opgave-model-design.md:4 siger "RLS er ikke besluttet" og §4.3 lister RLS som
  åbent spørgsmål — men RLS ER besluttet og kørt (migration 20260822224100,
  "beslutning A, 2026-08-22"). Design-dokumentets §4.3 er ikke opdateret.

### Fase 2 — tilstandslaget: IKKE PÅBEGYNDT

- Eneste kode der peger frem: opgaveEngine.ts:200-236, `opgoerTilstand()` —
  kommentaren :200-201 siger "Sammenfatning til tilstandslaget i fase 2". Ingen
  kaldere.
- Se afsnit 5 om kilderne.

### Fase 3 — rådgiverfladen som ét forløb: ET AF SYV PUNKTER STORT SET UDFØRT, RESTEN UÆNDRET

RAEKKEFOELGE.md:60-70 lister syv punkter:

1. Split af CompanyChatPane: UÆNDRET. Filen er 2056 linjer, stadig én komponent
   med isAdvisor-forgrening (afsnit 2).
2. Rollen som eksplicit tilstand: UÆNDRET. Udledes stadig
   (CompanyChatPane.tsx:118-120: `isAdvisor = rawAdvisor && !viewingAsMember`;
   RAEKKEFOELGE.md:143 om `isAdvisor && !companyId`).
3. Designkonvertering af AdvisorDashboard/medlemsliste/MemberDetail: UÆNDRET som
   design — men filerne ER rørt af nyttelast-arbejdet (#409, #411, #412).
4. "Ydeevne: dashboardet henter hele databasen og filtrerer i JavaScript":
   BESKRIVELSEN ER DELVIST FORÆLDET. PR #409 (6d39af42) skar rapport-blobs
   ~3.112 kB → ~134 kB via serverside jsonb-stier og slettede tre døde hentninger
   (budget_targets, weekly_focus, ulæste agent-beskeder). PR #410 (37b3173a) lagde
   måling i Sentry-span "advisor-dashboard.load". PR #411 (Members), #412
   (MemberDetail), #413 (CompanyChatPane) samme mønster. Ulæst-vinduets globale
   500-limit består dog (CompanyChatPane.tsx:304-308) — bekræftet uændret i #413's
   commit-besked.
5. Ulæst-begrebet samlet: UÆNDRET som samling — men landskabet har flyttet sig,
   se afsnit 3 (én måler er slettet i #409, og linjereferencerne i BACKLOG er
   drevet).
6. Dagslisten som primær visning: UÆNDRET (ikke påbegyndt).
7. MCP-serveren oven på tilstandslaget: kun recon (docs/mcp/RECON.md, seneste
   commit c32de79e "sprint 0 recon"). Ingen implementering.

Øvrige punkter i BACKLOG-afsnittet:

- [P3] send-welcome-message skriver ugyldig awaiting_reply_from='member'
  (BACKLOG.md:1666-1672): UÆNDRET — send-welcome-message/index.ts:157-163 sætter
  stadig 'member' (verificeret ved læsning af BACKLOG; filen ikke ændret siden,
  ingen commits rører den efter 2026-08-21). Står også i RAEKKEFOELGE tempo 2
  (RAEKKEFOELGE.md:39).
- [P4] Amputeret beregning (BACKLOG.md:1691-1699): mønsteret er genopstået ét
  sted — CompanyChatPane beregner `unreadCount` pr. samtale
  (CompanyChatPane.tsx:357-359, :384) men INGEN JSX læser feltet (grep: kun :85
  typedeklaration, :357 beregning, :384 tildeling). Desuden er pinnedMessages-memoet
  tilbage/stadig i filen (:727-730) og bruges kun af togglePin-markeringen via
  `msg.pinned_at` — selve pinnedMessages-listen har ingen JSX-aftager (grep:
  "pinnedMessages" forekommer kun :727).

---

## 2. COMPANYCHATPANE I DAG

**Størrelse**: 2056 linjer (src/components/CompanyChatPane.tsx). Mountes af
ChatShell.tsx:79 (rådgiver: flat indbakke) og :112 (medlem: fanen "Advisor" ved
siden af FinancialAIChat). ChatShell viser abonnent-mur før mount
(ChatShell.tsx:24-63).

**isAdvisor**: 38 forekomster. Udledning :118-120 (`rawAdvisor && !viewingAsMember`
fra useAuth + useViewMode). Forgreningslinjer: 118, 120, 141, 159, 191, 241, 295,
297, 309, 413, 421, 425, 451, 655, 711, 717, 721, 825, 826, 842, 845, 861, 908,
1157, 1210, 1341, 1368, 1545, 1550, 1683, 1708, 1726, 1737, 1762, 1780, 1836,
1893, 1899.

### State (alle i toppen, :125-144)

conversations, profilesMap, unreviewedReportIds, activeConvId, messages,
newMessage, sending, searchQuery, selectedTopic, isFullscreen, showMessages,
participants, companyMembers, assignmentPopoverOpen, showCompanyDrawer +
longPressedMessageId (:864). Refs: messagesEndRef, messageRefs,
messagesContainerRef, chatSubmitRef (:135-138).

### Queries (react-query)

- :147-160 `all-advisor-profiles` (RPC get_all_advisor_profiles) — `enabled: !isAdvisor`. MEDLEM.
- :168-193 `advisor-users-for-assignment` (user_roles + profiles, to-trins) — `enabled: !!isAdvisor`. RÅDGIVER.
- :696-713 `chat-pulse-context` (pulse_checkins.help_needed, 30 dage) — `enabled: !!isAdvisor`. RÅDGIVER.
- :682-693 drawer-hooks (useCompanyFacts/useKpiTargets/useKpiBenchmarks/useCompanyCommentary) — fyrer uanset drawer-tilstand (kommentar :679-680), bruges i "Se tal"-draweren (rådgiver-mobil).

### Effekter

- :197-215 deep-link (?conversationId, ?messageId).
- :218-224 Escape → exit fullscreen.
- :227-231 reset ved companyId-skift.
- :246-249 participants pr. aktiv samtale (RPC get_conversation_sender_profiles).
- :252-278 companyMembers pr. aktiv samtale (company_members + profiles).
- :281-421 loadConversations: fire parallelle hentninger (:301-317) —
  conversations (9 kolonner + companies-join, :288-291), ALLE profiles (:303),
  GLOBALT beskedvindue: seneste 500 beskeder på tværs af alle samtaler
  (:304-308), unreviewed financial_reports 7 dage (rådgiver, :309-316).
  Berigelse :353-397 (unreadCount :357-359, lastMessage, membershipTier),
  dedup pr. company_id :400-408, medlems-autoselect :413-417.
- :424-451 realtime på conversations (UPDATE) — KUN rådgiver (:425).
- :506-590 loadMessages pr. aktiv samtale: 11 kolonner, nyeste-først,
  limit(500), vendes (:516-522); mark_messages_read RPC (:525, :555);
  realtime INSERT/UPDATE/DELETE på messages (:531-585).
- :592-594 auto-scroll.

### Memo/afledt

- :454-503 groupedConversations (RÅDGIVER-grupperingen): needsReply
  (awaiting_reply_from='advisor', ældste først), needsCheckin (14 dage uden
  rådgiverkontakt, CHECKIN_THRESHOLD_MS :453), rest, legat, expired
  (search-reveal-only).
- :716-725 advisorConvList + prev/next-navigation. RÅDGIVER.
- :727-730 pinnedMessages (ingen aftager, se afsnit 1).
- :841-845 latestReadOwnMsgId ("Læst"-kvittering). MEDLEM.
- :849-861 reactions- og edit/delete-hooks (fælles).
- :879-886 useConversationLastSeen → "Nye beskeder"-divider (:1602-1621).

### Medlemsvendt vs. rådgivervendt i JSX

- :908-915 "Indbakke"-overskrift — rådgiver desktop.
- :918-1149 hele sidebar'en (søgning + grupperet liste) — kun rådgiver
  (`showSidebar = isAdvisor && …` :825).
- :1157-1302 rådgiver-header: firma-identitet, medlemsnavne, quick-nav-links til
  /members/:id (:1191-1207), "Se tal"-knap mobil (:1210-1220), "Afventer dit
  svar"-badge (:1222-1227), ⋯-menu med tildel rådgiver + "Kræver ikke svar"
  (:1229-1281), prev/next (:1283-1300).
- :1303-1338 medlems-header: rådgiver-avatarer + "Dine rådgivere".
- :1341-1347 pulse-banner ("Brug for hjælp til") — rådgiver.
- :1350-1818 beskedliste — fælles, men: session_prep skjules for medlem (:1368),
  system/AI-kort :1390-1595 (pin, report_card-kort :1433-1529, kontekst-chip med
  rådgiver-link :1530-1557, agent-feedback ja/nej :1558-1584), afsendernavn vises
  forskelligt (:1683-1684, :1708-1711, :1737-1738, :1762-1765), "Læst"-kvittering
  kun medlem (:1726-1731, :1780-1785).
- :1820-1889 composer: emne-vælger kun rådgiver (:1836-1865), expired-spærre
  (:1827-1833), send opdaterer awaiting_reply_from='company' + notify-chat-reply
  kun når rådgiver sender (:655-670).
- :1893-1897 medlems-tomtilstand med companyName; :1899-1921 tomtilstande.
- :1929-2043 "Se tal"-drawer (KPI-kort + AI-analyse) — rådgiver-mobil.

---

## 3. ULÆST-BEGREBET

BACKLOG.md:1646-1662 beskriver tre systemer. Ved genlæsning i dag findes SYV
kodesteder der afgør "ulæst" på hver sin måde. Linjereferencerne i BACKLOG er
drevet efter de sidste dages PR'er.

### Skrivesiden (fælles rod)

- `mark_messages_read` — migration 20260420223823 (nyeste definition): sætter
  read_at=now() for `sender_id != caller AND read_at IS NULL AND message_type IN
  ('user','system','ai')` i én samtale. read_at er ÉN kolonne delt af alle
  læsere — én rådgivers åbning rydder alles markering (BACKLOG punkt a, stadig
  gældende). Kaldes fra CompanyChatPane :525 (ved åbning) og :555 (ved realtime-
  INSERT fra modpart).
- Beskedtyper der ALDRIG rammes af IN-listen og derfor aldrig får read_at:
  `welcome` (send-welcome-message/index.ts:152; create-legat-enrollment/index.ts:230),
  `reflection-nudge` (nudge-report-no-reflection/index.ts:29+189),
  `legat-momentum-reminder` (legat-reminder-cron/index.ts:87).
  Agent-beskeder skrives som `system` (context_type='agent',
  run-company-agent/index.ts:484+534) eller `user` når as_advisor
  (:501) — de RAMMES af IN-listen.

### Læsesiden — de enkelte målere

1. **CompanyChatPane.tsx:357-359** (før: :303-305): tæller
   `sender_id != user.id && !read_at && message_type === 'user'` inden for det
   GLOBALE vindue af seneste 500 beskeder på tværs af alle samtaler (:304-308,
   limit(500) :308). Vinduet er bekræftet uændret i PR #413 (commit 758bd50f:
   "Ulæst-vinduet (:302-305, globalt limit 500) er BEKRÆFTET uændret").
   Resultatet `unreadCount` renderes ingen steder (grep: :85/:357/:384 er eneste
   forekomster).
2. **Members.tsx:428-439** (før: :400-406): `sender_id != user.id && read_at IS
   NULL` — INTET message_type-filter. welcome/nudge/reminder-beskeder tælles og
   forbliver ulæste for altid (BACKLOG punkt c, stadig gældende). Vises pr.
   virksomhed :470 og som totalUnread :1024. RÅDGIVEREN ser denne.
3. **AppSidebar.tsx** — TO grene i samme funktion (:193-226):
   - Rådgiver (:196-206): tæller SAMTALER med awaiting_reply_from='advisor',
     filtreret på `!assigned_advisor_id || assigned_advisor_id === user.id` —
     ikke read_at-baseret overhovedet.
   - Medlem (:211-221): messages-count med `read_at IS NULL` + `message_type IN
     ('user','system','ai')`.
4. **AppLayout.tsx:46-64** (før: :60): mobil medlems-badge. `message_type IN
   ('user','system')` — UDEN 'ai', dvs. tredje filtervariant. N+1: løkke over op
   til 10 samtaler med én count-forespørgsel pr. samtale (:53-62).
5. **BoardroomView.tsx:1361-1374** (medlems-forside, ikke nævnt i BACKLOG):
   userCount = ulæste `message_type='user'`, agentCount = ulæste
   `message_type='system' AND context_type='agent'`. Fjerde filtervariant.
6. **AdvisorDashboard.tsx:518-523 + :803-805**: "unreadMessages" pr. virksomhed
   er i virkeligheden `awaiting_reply_from === 'advisor'` pr. samtale (0/1) —
   ikke read_at. Bunke 1 hedder "Venter på dit svar (ulæst besked)" og skriver
   "N ulæste beskeder" i subteksten. Den read_at-baserede agent-besked-hentning
   der fandtes her, blev SLETTET i PR #409 (felt unreadAgentMessages fjernet,
   commit 6d39af42 DEL 1).
7. **useConversationLastSeen** (CompanyChatPane :879-886): per-bruger
   "sidst set"-markør til "Nye beskeder"-divideren (:1602-1621) — et separat,
   per-bruger system ved siden af read_at.

### Hvor de er uenige (observeret, samme datagrundlag)

- Medlemmets tre badges bruger tre forskellige type-filtre: sidebar
  (user/system/ai), mobil-layout (user/system), forside (user + system/agent
  separat).
- Rådgiverens to tal måler to forskellige ting: Members.tsx tæller beskeder uden
  type-filter (inkl. welcome/nudges der aldrig kan afmarkeres); AppSidebar og
  AdvisorDashboard tæller samtaler via awaiting_reply_from.
- CompanyChatPane's egen tælling (kun 'user', 500-vindue) afviger fra alle andre
  og vises ikke.

---

## 4. OPGAVE-MODELLENS SKRIVEVEJ

### Det der findes

- **Motoren**: src/lib/opgaveEngine.ts (237 linjer), 39 tests
  (src/lib/__tests__/opgaveEngine.test.ts). Funktioner: `lovligeOvergange` (:95),
  `beregnUdloeb` (:108, B10), `accepter` (:114, B1/B6), `udskyd` (:132, B7/B11),
  `luk` (:168), `erForfalden` (:177, B2), `erUdloebet` (:183, B8),
  `opgoerTilstand` (:202, til fase 2). Ren TS, "nu" som parameter, ingen
  supabase-import (:1-7).
- **Datamodel**: migration 20260822220000 — kolonner + CHECK
  (`status <> 'active' or due_date is not null`) + indeks. Kørt i Lovable.
- **RLS-kontrakten**: migration 20260822224100 — klienter har KUN SELECT;
  tabel-kommentaren siger "Skrivning sker UDELUKKENDE gennem edge functions med
  service role, saa opgaveEngine er den ene sandhed for tilstandsovergange"
  (:35). Dvs. skrivevejen SKAL være edge functions.
- **Én producent i ny form**: generate-weekly-focus skriver status='proposed' +
  expires_at (index.ts:553-566). Udløbsfristen er beregnet LOKALT i funktionen
  ("edge functions kan ikke importere fra src/", kommentar :550-552) — B10-reglen
  findes dermed to steder (opgaveEngine.ts:101-106 og generate-weekly-focus:553).

### Det der ikke findes (kravene står i docs/opgave-model-design.md)

Ingen af følgende har kode i dag — supabase/functions/ indeholder intet
opgave-relateret navn, og opgaveEngine har nul kaldere:

1. **Accept-vej** (B1/B6, design:40-64): medlem siger ja + vælger dato →
   proposed→active, accepted_at + due_date. Motorfunktion `accepter` klar.
2. **Udskydelses-vej** (B7/B11, design:66-103): 1. gang +14 dage automatisk,
   2. gang valgt dato, 3. gang afvist. Motorfunktion `udskyd` klar.
3. **Luk-vej** (B2/B7, design:45-46, 66-69): done / not_done / dropped /
   dismissed. Motorfunktion `luk` klar.
4. **Forfalds-spørgsmålet** (B2, design:45-46): "systemet spørger én gang:
   gjort / ikke gjort / ikke endnu" når due_date passerer. Kræver cron/trigger —
   indekset idx_company_actions_due står klar (design:237-239).
5. **Udløbs-cron** (B8/B10, design:71-76): proposed→expired når expires_at
   passerer. Indekset idx_company_actions_expiry står klar. opgaveEngine.ts:192-193
   nævner eksplicit "cron endnu ikke har lukket rækken" som forventet mellemtilstand.
6. **Rådgiverens forslagsvej** (source_type='advisor', 30 dage, design:90-96 +
   RAEKKEFOELGE:54): ingen flade, ingen function.
7. **Refleksionens udgang** (B5, source_type='reflection', design:54-55, 134-138):
   pulse_checkins har intet næste-skridt-felt; ingen vej fra refleksion til forslag.
8. **Medlemmets egen oprettelse** (B1, design:43: "springes accept-trinnet over").
   Den gamle klient-INSERT i DashboardActionCenter.tsx:214 (status 'open',
   klient-side) ville i dag fejle mod RLS'en — komponenten er dog død kode
   (grep: refereres kun i kommentarer; design:130 "kun i død kode").
9. **B9-migreringsvejen** (design:78-83): 102 milestones præsenteret som forslag.
10. **Spor 2-datamigrering** (design:220, opgaveEngine.ts:9-10, 89-92): de 70
    open/parked-rækker oversættes; motoren tager ikke stilling til dem
    (`lovligeOvergange` returnerer tom liste, opgoerTilstand tæller dem ikke :232).

### Producenter der skriver udenom modellen i dag

- run-company-agent/index.ts:737-745: status 'open', source_type 'agent', ingen
  expires_at. (source_type 'agent' blev gyldig i CHECK'en 2026-08-22, design:189.)
- create-legat-enrollment/index.ts:169-179 (per design:118): milestones, ikke
  company_actions — uændret.

### Læsere og deres filtre

- BoardroomView.tsx:1348-1349: `.eq("status", "open")` — ser ikke proposed.
- AdvisorDashboard: ingen company_actions-læsning (grep: nul forekomster i filen).
- Rådgiveren kan ikke se ubesvarede forslag nogen steder (design:168: "Nej i dag,
  verificeret. Løses i fase 2 via B8") — stadig gældende.

---

## 5. TILSTANDSLAGET (FASE 2)

Formuleringen "seks stores" findes IKKE i repoet. Grep over BACKLOG.md,
docs/RAEKKEFOELGE.md og docs/*.md giver ingen forekomst af "seks
stores/kilder/tabeller" i tilstandslags-sammenhæng. RAEKKEFOELGE.md:14 nævner at
"en læsbar HTML-udgave findes uden for repoet" — hvis seks-listen står dér, kan
den ikke efterprøves herfra. Det repoet faktisk siger:

- RAEKKEFOELGE.md:56: "Tilstandslaget: ét sted der svarer hvor en virksomhed står".
- RAEKKEFOELGE.md:58: uden opgave-modellen kan laget "kun rapportere stilhed og
  talfriskhed" — dvs. mindst tre kildefamilier er impliceret: aftaler (opgaver),
  stilhed (samtaler/beskeder), talfriskhed (rapporter/facts).
- opgave-model-design.md:72 (B8): udløbne forslag "fodrer tilstandslaget i fase 2
  … anledning på virksomhedskortet".
- opgave-model-design.md:168: rådgivers blik på ubesvarede forslag "løses i
  fase 2 via B8".
- RAEKKEFOELGE.md:159-161 (idébank): aktivitetslog pr. virksomhed "fodrer
  tilstandslaget" — findes ikke endnu.
- opgaveEngine.ts:187-198 definerer den første konkrete tilstandskontrakt:
  antalAktive, antalForfaldne, antalUbesvaredeForslag, antalUdloebneForslag,
  aeldsteUbesvaredeForslag, lukkede pr. udfald.

Ændringer siden 2026-08-21 der berører kildebilledet (observeret):

- `company_actions` bærer nu opgave-modellen (design:128-132) — én tabel dækker
  det milestones + company_actions var to af.
- `milestones` er besluttet erstattet via B9 (design:109-126) — som kilde er den
  en overgangsbestand, ikke en blivende store.
- `weekly_focus` erstattes IKKE (design:142-148) — den er forslagskilde, og
  rådgiveren ser i dag kun en boolean… som blev SLETTET i PR #409
  (hasWeeklyFocus fjernet fra AdvisorDashboard, commit 6d39af42 DEL 1). Ingen
  flade viser weekly_focus for rådgiveren nu.
- `pulse_checkins` består (design:134-140); help_needed når rådgiveren via
  chat-banneret (CompanyChatPane.tsx:1341-1347, query :696-713).
- Talfriskhed: målingen "11 af 34 nyere end 60 dage" (RAEKKEFOELGE:115) bygger på
  financial_reports/company_facts; AdvisorDashboard læser committed facts
  (:809-812, recentFactsRes).
- Samtale-tilstand: conversations.awaiting_reply_from + last_member_message_at +
  last_advisor_reply_at (vedligeholdt af update_conversation_reply_state-
  triggeren, BACKLOG:1641-1642).

---

## 6. HVAD BRUGER MEDLEMMERNE FAKTISK

Kolonnenavne verificeret mod src/integrations/supabase/types.ts (messages:
:2106-2120; conversations: :1085-1102; user_roles: :2709-2714). Køres i Lovable →
SQL editor (Supabase MCP rammer ikke Lovable-prod).

Forbehold ved tolkning (observeret i koden, påvirker tallene):

- `message_type='user'` er ikke det samme som "menneske": advisor-broadcast
  skriver 'user' (advisor-broadcast/index.ts:69), og run-company-agent kan sende
  som rådgiver med message_type='user' og sender_id=assigned_advisor_id
  (index.ts:240, :501). Agent-beskeder er ellers 'system' med
  context_type='agent' (:484, :534).
- Rådgiver/medlem-splittet nedenfor afgøres af user_roles på sender_id — admin
  arver advisor (CLAUDE.md), derfor tælles begge roller som rådgiver.

```sql
-- 6.1 Beskeder pr. samtale (med virksomhedsnavn) + system/menneske-split
select
  c.id as conversation_id,
  co.name as virksomhed,
  count(m.id) as beskeder_i_alt,
  count(m.id) filter (where m.message_type = 'user') as type_user,
  count(m.id) filter (where m.message_type <> 'user') as type_andet,
  max(m.created_at) as seneste_besked
from public.conversations c
left join public.companies co on co.id = c.company_id
left join public.messages m on m.conversation_id = c.id
group by c.id, co.name
order by beskeder_i_alt desc;

-- 6.2 Fordelingen af beskedtyper (afslører de faktiske message_type-værdier)
select message_type, context_type, count(*) as antal
from public.messages
group by message_type, context_type
order by antal desc;

-- 6.3 Median/max pr. samtale (efterprøver "median 26 / max 89" fra PR #413)
select
  percentile_cont(0.5) within group (order by antal) as median,
  max(antal) as max,
  count(*) as samtaler
from (
  select conversation_id, count(*) as antal
  from public.messages
  group by conversation_id
) t;

-- 6.4 Aktive samtaler seneste 30 dage — to definitioner side om side
select
  count(distinct m.conversation_id) as samtaler_med_beskeder_30d,
  count(distinct m.conversation_id) filter (where m.message_type = 'user')
    as samtaler_med_user_beskeder_30d
from public.messages m
where m.created_at >= now() - interval '30 days';

-- 6.5 Rådgiver- vs. medlemsbeskeder (menneskebeskeder, message_type='user')
select
  case when exists (
    select 1 from public.user_roles ur
    where ur.user_id = m.sender_id and ur.role in ('advisor','admin')
  ) then 'raadgiver' else 'medlem' end as afsender,
  count(*) as antal,
  count(*) filter (where m.created_at >= now() - interval '30 days') as antal_30d
from public.messages m
where m.message_type = 'user'
group by 1;

-- 6.6 Samme split pr. samtale — hvem bærer hvilke relationer
select
  co.name as virksomhed,
  count(*) filter (where ur.user_id is not null) as raadgiver_beskeder,
  count(*) filter (where ur.user_id is null) as medlems_beskeder
from public.messages m
join public.conversations c on c.id = m.conversation_id
left join public.companies co on co.id = c.company_id
left join lateral (
  select user_id from public.user_roles r
  where r.user_id = m.sender_id and r.role in ('advisor','admin')
  limit 1
) ur on true
where m.message_type = 'user'
group by co.name
order by raadgiver_beskeder + medlems_beskeder desc;
```

---

## 7. HVAD ER GÅET I STYKKER / FLYTTET SIG

### PR #413 (perf/chatpane-nyttelast, 758bd50f, merged 2026-08-24 13:57)

+13/−4 i CompanyChatPane.tsx alene. To ændringer:

1. conversations-select: "*" → 9 navngivne kolonner (:288-291). Realtime-
   handleren (:432-445) læser kun felter der findes i UPDATE-payloaden — upåvirket.
2. messages-select pr. samtale: "*" → 11 navngivne kolonner + `.order(desc)
   .limit(500)` + `.reverse()` (:516-522).

**Observation — edited_at**: `edited_at` er den ene kolonne der IKKE længere
hentes (commit-beskeden: "kun edited_at ulæst"). Men JSX'en læser
`(msg as any).edited_at` og viser "(redigeret)"-mærket to steder
(CompanyChatPane.tsx:1718-1722 mobil, :1772-1776 desktop). Efter #413 er feltet
`undefined` på alle beskeder hentet ved samtale-åbning; det sættes kun (a) lokalt
efter egen redigering (:894) og (b) via realtime-UPDATE-payload (:567-570), som
kun rammer sessioner der har samtalen åben i redigeringsøjeblikket. Ved genindlæsning
af samtalen vises "(redigeret)" ikke længere på historiske beskeder. `edited_at`
findes i messages-typen (types.ts:2114). Commit-beskedens formulering "kun
edited_at ulæst" og JSX'ens :1718/:1772 stemmer ikke overens.

**Uændret ved #413** (bekræftet i commit-besked + genlæsning): det globale
500-vindue til ulæst/lastMessage (:304-308), mark_messages_read-kaldene,
al forgrening.

**Ny afskæring**: samtaler over 500 beskeder viser nu de nyeste 500 (før: alle,
ældste først). Målt median 26 / max 89 (commit-besked) — loftet er ikke aktivt i
praksis i dag.

### PR #409 (rådgiverdashboard-nyttelast, 6d39af42)

- Slettede den read_at-baserede hentning af ulæste agent-beskeder + feltet
  unreadAgentMessages — én af ulæst-målerne fra 2026-08-21-recon'en findes ikke
  længere. "Ulæst" på dashboardet er nu udelukkende awaiting_reply-baseret
  (:518-523).
- Slettede hasWeeklyFocus — rådgiverens eneste weekly_focus-visning
  (design:148 beskrev den som boolean) er væk.
- Slettede budget_targets-hentningen (~13.000 rækker) og elleve døde felter.

### Drevne linjereferencer i grundlagsdokumenterne (målt i dag)

| Dokument-reference | Peger på i dag |
|---|---|
| BACKLOG:1655 "CompanyChatPane:303-305" (500-vinduet) | :304-308 |
| BACKLOG:1657-1659 "Members.tsx:400-406" | :428-439 |
| BACKLOG:1659 "AppSidebar:220" | :214-220 (uændret nok) |
| BACKLOG:1660 "AppLayout:60" | :53-61 |
| opgave-model-design:140 "CompanyChatPane.tsx:691-698" (help_needed-banner) | query :696-713, banner :1341-1347 |
| PR #413-besked "baseline-fejlen … :683 → :692" | typecheck-baseline-fejlen i filen er flyttet igen ved den endelige version |

### Øvrigt berørt siden 2026-08-22 (uden for chatten men i epicets flader)

- Members.tsx (#411): companies-select navngivet, reported_revenue-læsningen
  flyttet til de jsonb-stier der faktisk skrives, user_login_log 90-dages vindue.
  Ulæst-blokken (:428-439) uændret i indhold, kun flyttet.
- MemberDetail.tsx (#412): ai_analysis/raw_extracted_data ude af hentningen;
  budget_targets serverside-filtreret.
- AdvisorDashboard-målingen bor i Sentry-span (#410).
- Ingen edge functions i chat-kæden (send-welcome-message, notify-chat-reply,
  send-slack-chat-notification, advisor-broadcast, run-company-agent's
  beskedskrivning) er ændret siden 2026-08-21 (git log --since 2026-08-22 --
  supabase/functions: kun generate-weekly-focus i PR #387, 2026-08-22).
- Lovable har committet direkte til main 2026-08-24 16:09 UTC (ae3cb6bb "Work in
  progress", 6bf6edde "Lovable update") — bogført som [P3] i PR #419. Diffen er
  tjekket: begge rører kun src/integrations/supabase/client.ts og en ny
  previewAuthStorage.ts — ingen chatflader.

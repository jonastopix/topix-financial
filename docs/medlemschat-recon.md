# Medlemschat-recon — rå observationer 2026-08-31
> Skrevet 2026-08-31. Øjebliksmåling — linjenumre og tal gælder den dag, ikke i dag.

Grundlag: main pr. denne recon (CompanyChatPane.tsx = 2141 linjer efter
PR #455/#456; linjenumre gælder DEN version), ChatShell.tsx (125 linjer),
prod-målingen 31/8 (1052 beskeder: 53,6% user, 33,7% system·report,
9,7% system·session_prep). Fund, ingen forslag.

---

## 1. HVAD SER ET MEDLEM PRÆCIST

Medlemmet rammer CompanyChatPane via ChatShell:112 (fanen "Advisor").
`isAdvisor` udledes :118-127-området (`rawAdvisor && !viewingAsMember`);
alt nedenfor er målt mod den dom.

### Renderes FOR medlemmet

- **Header** (:1389-1424): rådgiver-avatarer (op til 3, `allAdvisors` fra
  RPC get_all_advisor_profiles, query gated `enabled: !isAdvisor`) +
  "Dine rådgivere: Jonas, Morten" (mobil: kun fornavne). Mobil har
  tilbage-pil (:1391-1398). Ingen andre kontroller i headeren.
- **Beskedliste** (:1436-1904): dato-separatorer, system/AI-kort,
  boble-beskeder, reaktioner, "Nye beskeder"-divider. Detaljer i §4.
- **Composer** (:1905-1975): ChatRichInput + send-knap. INGEN
  emne-vælger (den er :1921-1950, gated `isAdvisor`). Placeholder:
  "Skriv til {advisorNamesLabel}..." Expired-spærren (:1912-1918,
  membershipTier === "expired") rammer også medlemmer.
- **Tomtilstande**: (a) samtale findes men er tom (:1437-1448): "Din
  direkte linje til rådgiverne … Dine rådgivere læser dine tal og
  svarer hurtigt." — BEMÆRK: denne blok er IKKE gated; en rådgiver med
  en tom samtale ser samme medlemsstemte tekst. (b) ingen samtale
  (:1978-2007, gren `!isAdvisor` :1985-1999): virksomhedsbanner
  ("Samtale for {companyName} med …", :1979-1984) + "Din direkte linje
  til {advisorNamesLabel} … Vi svarer typisk inden for 24 timer."
  Medlemmet autoselectes dog til sin samtale i loadConversations, så
  (b) ses kun når samtalen slet ikke findes.
- **"Læst"-kvittering** på egen seneste læste besked (:1812-1817 mobil,
  :1866-1871 desktop, gated `!isAdvisor && isMine`; grundlaget
  `latestReadOwnMsgId` :898-902 er selv gated `if (isAdvisor) return
  null`). Kvitteringen bygger på den DELTE read_at-kolonne — én
  rådgivers åbning udløser den, uanset hvilken rådgiver.

### Skjult for medlemmet, og hvordan

Alle skjulinger er KLIENT-SIDE forgreninger på isAdvisor — ingen af dem
har serverside-modstykke (RLS på messages/conversations er
company-scoped, ikke type- eller rollescoped):

- Indbakke-overskrift (:965-972) og hele sidebar'en (søgning + grupperet
  liste) — `showSidebar = isAdvisor && …`.
- Rådgiver-headeren (:1244-1388): firma-identitet, medlemsnavne,
  quick-nav, "Se tal"-knap, "Afventer dit svar"-badge, ⋯-menuen (tildel
  rådgiver, "Kræver ikke svar", "Foreslå opgave"), prev/next.
- Pulse-banneret (:1427-1433, `isAdvisor && latestPulse?.help_needed`).
- session_prep-kort (:1454) — se §2.
- Chip-LINKS til /members/:id (:1616-1643): chippen vises for begge,
  men kun rådgiveren får den som klikbar knap (`isAdvisor && linkPath`
  :1636); medlemmet får en død chip.
- Afsendernavn PÅ boblen: rådgiveren ser navnet over fremmede bobler
  (:1769-1771/:1823-1825, `isAdvisor && !isMine`); medlemmet ser navnet
  INDE i boblen (:1794-1798/:1848-1852, `!isMine && !isAdvisor`).
- "Se tal"-draweren (:2014-2141) er teknisk renderbar for alle (Drawer
  mountes ubetinget), men eneste trigger-knap sidder i
  rådgiver-headeren — medlemmet kan ikke åbne den. Drawer-hooks
  (:687-698) fyrer dog OGSÅ for medlemmet (useCompanyFacts m.fl.,
  ugated) — det er i øvrigt dét der forsyner medlemmets report_card
  med tal (§3).

---

## 2. SESSION_PREP-FILTERET

Citat (:1454, første linje i beskedmap'en):

```tsx
if (msg.context_type === "session_prep" && !isAdvisor) return null;
```

**Rent UI.** loadMessages (:509-527) henter ALLE beskedtyper i samtalen
uden filter, og RLS på messages er company-scoped — medlemmet HENTER
altså de 102 session_prep-beskeder (9,7% af bestanden) til klienten ved
hver samtaleåbning; de renderes bare ikke. Der findes ingen
serverside-gate.

**Hvis filteret knækker**: medlemmet ser rådgiverens forberedelses-kort
med label "Session-dagsorden" (:1501) og fodnoten "Forberedelse til
næste session med founder" (:1671-1676) — indhold skrevet til
rådgiverens øjne.

**Afledt fund**: fordi session_prep er message_type 'system', tælles de
MED i medlemmets ulæst-badges (AppSidebar-medlemsgrenen tæller
user/system/ai; AppLayout user/system) indtil samtalen åbnes og
mark_messages_read rydder dem. Medlemmet kan altså have et badge drevet
af beskeder de aldrig kan se.

---

## 3. DE 354 RAPPORTKVITTERINGER (system · report)

**Hvor de skrives**: fra KLIENTEN, ikke en edge function. To producenter:

1. `src/lib/reportCommit.ts:90-98` — ved rapport-commit:
   `message_type: "system"`, `context_type: "report"`, `context_id:
   reportId`, `context_meta: { kind: "report_card", period_key }`,
   content "Ny rapport er klar i dit dashboard." Idempotent pr.
   (samtale, period_key) (:68-84 — genfundet kort opdateres til at pege
   på nyeste rapport i stedet for at duplikeres). `sender_id` er den
   bruger der committede (:86-88) — det kan være medlem eller rådgiver
   alt efter hvem der godkendte.
2. `src/hooks/useFinancialAnalysis.ts:147-175` — AI-analysen: samme
   `context_type: "report"` men `kind: "ai_analysis"`, samme
   idempotens-mønster.

Sletning følger rapporten: RapporteringView.tsx:398 sletter
report-beskederne når rapporten slettes (og
extract-financial-data:1440 sletter milestones via source_report — ikke
beskeder).

**Hvordan de renderes for medlemmet**: system-kortstien (:1476-1681).
`kind === "report_card"` (:1519-1615) giver det rige kort: virksomhed +
periode, "Åbn rapportfil"-knap (:1568-1587, slår file_path op og åbner
filen) og op til tre nøgletals-fliser (omsætning, resultat f. skat,
dækningsbidrag) med pct.-ændring mod forrige periode — tallene hentes
LIVE fra drawerFacts (:1524), ikke fra beskeden. `kind: "ai_analysis"`
falder til chip-stien (:1616-1643) — for medlemmet en død chip.

**Hvad et medlem kan gøre ved dem**: læse, åbne rapportfilen, og pinne
(pin-knappen :1487-1497 er IKKE gated på rolle — den skriver UPDATE på
messages). Ikke reagere (ReactionBar sidder kun på boble-stien :1876),
ikke redigere/slette (MessageActionMenu kun på boble-stien), ikke
besvare direkte. Agent-kortenes ja/nej-feedback (:1644-1670) er heller
ikke gated, men gælder kun context_type 'agent', ikke 'report'.

**Hvorfor i samtalen**: koden begrunder det ikke eksplicit. Det
observerbare: (a) kortet er idempotent pr. periode netop for ikke at
fylde (kommentaren :67), (b) content-teksten peger VÆK fra chatten
("klar i dit dashboard"), (c) de tæller som 'system' i
mark_messages_read og i flere ulæst-målere. Med 354 af 1052 beskeder
(33,7%) er kvitteringerne den næststørste bestand i samtalerne.

---

## 4. TRÅDEN FOR ET MEDLEM MED MANGE BESKEDER

**Findes**:

- **Rækkefølge**: ældste øverst. Hentes nyeste-først med limit(500) og
  vendes (:509-527) — over 500 beskeder vises de NYESTE 500 (median 26,
  max 89 i praksis; loftet er inaktivt i dag).
- **Dags-separatorer** (:1460-1473): "I dag"/"I går"/dato-label pr.
  kalenderdag (dateSeparatorLabel).
- **"Nye beskeder"-divider** (:1688-1708): per-bruger, via
  useConversationLastSeen (:935-943) — et SEPARAT system ved siden af
  read_at. Vises kun på boble-stien (system-kort kan ikke udløse den,
  :1689-grenen ligger efter system-return'en), kun én gang, og kun hvis
  forrige besked er præcis last-seen-markøren.
- **Ulæst-håndtering**: mark_messages_read RPC fyrer ved åbning (:523)
  og ved realtime-INSERT fra modparten (:553-området) — sætter read_at
  på ALT i IN-listen (user/system/ai) i samtalen. read_at er delt af
  alle læsere.
- **Auto-scroll** til bunden ved nye beskeder (:592-området) +
  deep-link-scroll til ?messageId.
- **Realtime**: INSERT/UPDATE/DELETE på messages holder den åbne
  samtale ajour.

**Mangler** (observeret fravær):

- Ingen "hop til første ulæste" — man lander i bunden; divideren kan
  stå over folden uden vej derop.
- Ingen gruppering af på-hinanden-følgende beskeder fra samme afsender;
  hver besked bærer egen boble + tid.
- Ingen pagination/hent-ældre: over 500 er de ældste utilgængelige i UI.
- pinnedMessages (:732-735) beregnes stadig uden nogen JSX-aftager
  (grep: eneste forekomst er memoet selv) — man kan pinne, men intet
  sted viser de pinnede samlet. [P4]-mønsteret består.
- edited_at-hullet fra PR #413 består: "(redigeret)" (:1804/:1858)
  vises kun for beskeder redigeret i indeværende session eller modtaget
  via realtime — kolonnen hentes ikke i loadMessages-selecten.
- welcome-beskeder (4 stk, uden for mark_messages_reads IN-liste)
  renderes som almindelige bobler men kan aldrig afmarkeres — de tæller
  evigt i Members.tsx' rådgiver-tælling; medlemmets egne badges rammes
  ikke (type-filtrene user/system/ai udelader 'welcome').

---

## 5. COMPOSEREN FOR MEDLEMMET

**Fælles (ikke gated)**:

- **Rich text**: ChatRichInput (:1952-1958) — HTML gemmes; visning
  sanitizes med DOMPurify, tilladte tags b/strong/i/em/ul/ol/li/a/p/br.
- **Vedhæftning**: attachments bor i context_meta og renderes af
  MessageAttachments (:1802/:1856); content falder tilbage til "📎"
  (:642). Begge roller.
- **Reaktioner**: useMessageReactions (:904-911); desktop
  ReactionPicker i hover-menuen (:1748-1751), mobil long-press-overlay
  (👍 ❤️ 📋, :1728-1734) + MobileMessageActionDrawer. Begge roller.
- **Redigering**: kun egne beskeder; medlem har 15-minutters vindue,
  rådgiver ubegrænset (useMessageActions.ts:68-72: `isAdvisor ||
  canEditMessage(createdAt)`, EDIT_WINDOW_MS = 15 min :5).
- **Sletning**: egne beskeder, ingen tidsgrænse, begge roller
  (useMessageActions.ts:74-76).
- **Pin**: begge roller, alle beskeder (:1737-1747 + :1487-1497).
- **Slack-notifikation**: notifyChatMessage fyrer ved HVERT send
  (:657); guards ligger server-side i send-slack-chat-notification
  (chatNotify.ts:4-7).

**Gated på isAdvisor**:

- Emne-vælgeren (:1921-1950) — kun rådgiver; medlemmets beskeder får
  aldrig context_type fra composeren. (Der findes ingen emne-kolonne;
  emnet gemmes som context_type på beskeden, :645-647.)
- Efter-send-opdateringen (:660-675): kun rådgiver-send sætter
  awaiting_reply_from='company' + kalder notify-chat-reply. Medlemmets
  send rører intet — samtale-tilstanden vedligeholdes af
  update_conversation_reply_state-triggeren.

---

## 6. CHATSHELL — DE TO FANER

ChatShell.tsx: abonnent-mur FØRST (:24-63, `!isAdvisor &&
membershipTier === "subscriber"` — opgraderings-CTA via mailto, ingen
chat overhovedet). Rådgiver får flat CompanyChatPane (:76-82).
Medlemmet (:85-122) får to faner:

- **Fane 1 "Advisor"** (desktop-label :104 — ENGELSK; mobil-label er
  "Rådgiver" :91) → CompanyChatPane: menneske-sparringen.
- **Fane 2 "Finansiel AI"** (mobil: "AI") → FinancialAIChat: AI-chat
  over egne tal. `?q=` i URL'en sendes som initialMessage (:116).

Default er advisor-fanen; `?tab=ai` deep-linker til AI (:20-22).
Fanevalget er lokal state — det overlever ikke navigation, og
ulæst-badge findes ikke PÅ fanerne (medlemmets badges bor i
AppSidebar/AppLayout/forsiden). Hvornår hvilken: rådgiver-fanen er
tråden med mennesker (og hele system-bestanden: kvitteringer,
agent-kort, opgave_forslag); AI-fanen er selvbetjening på tallene.
BoardroomViews fokus-punkter peger på /chat (rådgiver-fanen) via
"unread-messages", og på AI-indsigten via "unread-agent" — begge lander
i samme shell.

---

## 7. RENT MEDLEMSVENDTE STEDER (kan ændres uden at røre isAdvisor-forgreninger eller splitte filen)

1. **ChatShell:84-122** — medlemsgrenen: fane-labels (inkl.
   "Advisor"-på-dansk-flade-inkonsistensen), default-fane, ?tab/?q.
   Rådgivergrenen (:76-82) er urørt af ændringer her.
2. **Abonnent-muren** ChatShell:24-63 — tekst, CTA, billeder.
3. **Medlems-headeren** :1389-1424 — egen JSX-gren (else-grenen af
   rådgiver-headeren); avatarer, tekst, evt. flere elementer.
4. **all-advisor-profiles-query'en** :155-168-området (`enabled:
   !isAdvisor`) + advisorNamesLabel — fodrer kun medlemsflader
   (header, placeholder, tomtilstand).
5. **Medlems-tomtilstanden uden samtale** :1985-1999 + virksomheds-
   banneret :1979-1984 (begge gated `!isAdvisor`).
6. **"Læst"-kvitteringen** :1812-1817/:1866-1871 + latestReadOwnMsgId
   :898-902 — hele kæden er medlems-gated.
7. **Afsendernavnet i medlemmets bobler** :1794-1798/:1848-1852
   (`!isMine && !isAdvisor`).
8. **session_prep-filteret** :1454 — selve medlems-skjulingen (men
   enhver ændring af HVAD der skjules deler linje med rådgiverens
   visning).
9. **Composer-placeholderen** :1957 (advisorNamesLabel-varianten er
   medlemmets; rådgiverens variant styres af selectedTopic som
   medlemmet aldrig har).

**Forbehold, delte flader der LIGNER medlemsvendte**: tomtilstanden
:1437-1448 ("Din direkte linje til rådgiverne") renderes også for
rådgivere med tom samtale; system-kortene, report_card, chippen,
boblerne, reaktioner/edit/delete/pin og "Nye beskeder"-divideren er
fælles stier — ændringer dér rammer begge roller, selv når teksten er
medlemsstemt. Og de 102 session_prep + 354 kvitteringer ligger i SAMME
hentning som medlemmets 500-loft — bestanden af system-beskeder æder af
medlemmets vindue, selv når kortene ikke vises.

# Plan for 11. september — tredive kort, to vinduer, i rækkefølge

> **RETTET 11/9 formiddag** (prod målt kl. 09:20, `~/Downloads/query-results-export-2026-09-11_09-20-04.csv`; bogført i OVERLEVERING DEL 2 «11. september, formiddag»):
> - **§0A havde intet at køre.** Alle seks migrationer stod allerede i prod (020000, 030000, 040000, 050000, 060000, 20260907180000), og `onboarding-rytme` var planlagt i hånden gennem `kald_edge` med «0 8 * * *». Planen og kortene sagde det modsatte; OVERLEVERING havde ret. Forbeholdet om `hent_betalingsdata_til_checkout` er LUKKET kl. 11:27: prods krop er tegn for tegn filens (md5 `76178b0711e70b02ea86a6fe8a2ed8b9`); «false» kl. 09:20 var det rigtige svar, fordi checkout bevidst skriver modsætningen af tilbuddets mønster (`is null or … + 1 <= now()`). Fejlen var chattens (OVERLEVERING DEL 2 §9, DEL 4).
> - **13/9 er søndag, ikke lørdag** (11/9 er fredag). §2 punkt 2 står som skrevet.
> - **A1 mistede kort 116 og kort 24.** 116 (rytmens migration) var overhalet af prod; 24 (retries opbrugt → `/send`) er taget ud af bunken — det haster ikke før 13/9, og forudsætningerne står nu på kortet. Kort 23 er bygget (#815).
> - **B1 mistede kort 26 og blev delt i 85 og 60.** 26 (portalen) blev en Stripe-indstilling, ikke kode: opsigelse slået FRA 11/9 kl. 10:01, og login-linket er ikke aktiveret. 85 er bygget — **#816 merget kl. ca. 11:05, Update klikket 11:12** (dækker #815 og #816); beviset i prod fra målingen 11:18 (OVERLEVERING DEL 2 §5).
> - **A2 efter reconen (`~/Downloads/recon-a2-raadgiverfladen.md`, prod 11:18):** kort 3 (hængende invitationer) er LØST — `HbInvitationer` viser alle åbne på tværs med alder, rust, gensend og slet; 3 afventer, ældste 1/9. Kort 46 (samtalelistens 500-vindue) er ud af A2 — vinduet er ikke ramt (604 beskeder, 25 samtaler), og både tekst fra `conversations` og en ulæst-RPC kræver en migration. Beslutninger for 76 (booking_sent vises som «betalt {dato} · booking-link sendt», pending vises ikke) og 83 (knappen, `remove-member`-grenen og `maaFjerneMedlem` fjernes i samme bygning) står på kortene.
> - **B2 er kort 56 og 57 — beslutning 17 (feedet målt, `~/Downloads/recon-feed-og-checkoutdoeren.md`):** alle 18 episoder har guid, så forudsætningen fra beslutning 8 er opfyldt — men podcasten har ikke udgivet siden 17/9 2025. Besluttet 11/9 — forslag fra chatten, stående uden indsigelse: kort 69 og 62 venter til Jonas og Morten har afgjort om podcasten fortsætter.
> - **Kort 60's udgangspunkt i prod er målt kl. 11:28** (CHECK'erne ordret, RPC'en sender `p_kilde_type` uændret, 10 tråde uden kilde) og står på kortet og i OVERLEVERING DEL 2 §9.

Skrevet 10/9 2026 nat på `main` (`## main...origin/main`, rent træ) mod mangellisten som den står efter #810–#812:
130 kort. KUN FUND OG RÆKKEFØLGE. Kortnumrene er positionen i listen i aften (1 = skabelonen).

**Kriteriet:** forholdet mellem værdi og tid. Ikke det nemmeste, ikke kun det synlige. Tredive kort: 9 fejl der
rammer nogen, 15 mangler der blokerer noget, 6 idéer der ændrer noget. Ingen over «Mellem», og ingen der kræver en
designsamtale — de står i §5.

**Sådan læses den:** §0 er det Jonas gør alene før 9. §1 er de ti bunker, fem til vindue A og fem til vindue B, i den
orden de køres — A og B rører aldrig samme fil samtidig. §2 er hvorfor den orden. §3 er beslutningerne der ligger
INDE i bunkerne, så ingen opdager dem midt i en opgave. §4 timer og skærekant. §5 det der ikke er med.

---

## 0. Før nogen åbner et vindue — Jonas alene, 45 minutter

**A. Prod-morgen i Lovable SQL editor** (kort 118, i dets rækkefølge; hvert kort det lukker står på kortet):
1. `20260911050000_doeren_gaeldende_slutdato` — bevis: `pg_get_functiondef('public.hent_betalingstilbud')` indeholder `+ 1 > now()`.
2. `20260911060000_weekly_focus_seen_at` — bevis: `pg_policies` for `weekly_focus` har UPDATE-policyen.
3. `20260911040000_companies_status_check` — bevis: `pg_constraint` på `companies`, contype `c`.
4. `20260911030000_feedback_bucket_mappetjek`.
5. `20260907180000_email_send_log_advisor_read` — Morten ser mailloggen.
6. **IKKE** `20260909180000_onboarding_rytme_cron` — den skrives om først (bunke A1, første kort). Køres kl. 10.

Dertil fire SELECT'er der afgør fire kort på fem minutter (SQL'en står på kortene): kort 90 (bærer de tre crons
`dry_run: false`?), kort 46 (er 500-vinduet ramt?), kort 3 (hvor mange invitationer hænger?), kort 125 (har nogen to
virksomheder?). Svarene styrer om 46 og 3 bliver byg eller luk.

**B. Tre beslutninger Jonas og Morten træffer over kaffen — 20 minutter, ikke i løbet af dagen:**
- **run-weekly-agent** (kort 102): slet (A), omlæg (B) eller byg færdig (C). Grundlaget står i OVERLEVERING DEL 2
  «Ugefokus og ugeagenten». Ingen bunke rører den; men A eller B er en time i bunke A3 hvis det vælges.
- **Digesten** (recon-digesten.md): skal den findes? Intet i den findes kun der. Vælges «sluk», er det én linje i
  A3 plus indstillingsfanens tekst. Vælges «behold», bliver kort 58 (auto-tråd) og 59 til det samme spørgsmål igen.
- **De fem game changers** (ideerne-skarpt.md §2): hvilken ÉN starter i næste uge? Ingen af dem er på dagens liste —
  de er uger, ikke timer. Men den valgte får sin recon bestilt i dag, så den kan begynde mandag.

---

## 1. Bunkerne — vindue A (penge, rådgiver, drift) og vindue B (medlem, indhold, netværk)

Rækkefølgen ER tidsplanen. A1 og B1 starter samtidig kl. 9; hver bunke er én prompt (recon før byg, som i dag), ét diff.

### Kl. 9 — A1 · Penge: det der skal virke før 13/9 (2½ time)
| Kort | Hvad | Filer |
|---|---|---|
| 116 | Onboardingens rytme: migrationen skrives om til `public.kald_edge` — så Jonas kan køre den kl. 10 | `supabase/migrations/` (ny fil, erstatter 20260909180000) |
| 23 | Fejlet træk → rådgivernes klokke: ét `skrivRaadgiverBesked`-kald efter upsertet, dedup på `company_traek.id`, deep link til virksomhedssiden | `supabase/functions/stripe-webhook/index.ts` (payment_failed-grenen), `_shared/raadgiverBeskedTekst.ts`, `src/lib/hjemmebane/klokke.ts` (label) |
| 24 | Retries opbrugt → fakturaen sendes (`next_payment_attempt` null → `POST /v1/invoices/{id}/send`) + tydelig klokkebesked | samme gren i `stripe-webhook`, `_shared/abonnementstraek.ts` |
**Hvorfor først:** doggybeds træk 13/9 er det første der kan fejle tavst. Alt tre er samme fil, samme vindue.

### Kl. 9 — B1 · Medlemmets første dage (3 timer)
| Kort | Hvad | Filer |
|---|---|---|
| 85 | Feedback-knappen tilbage i Hjemmebane-skallen (banken venter) | `HbMemberShell.tsx`, `FeedbackButton.tsx` (genbrug) |
| 60 | Præsentation dag 1–3: tjeklistepunkt + trådskabelon; stemplet = «har en tråd med kilde præsentation» | `src/lib/onboardingTjekliste.ts`, `HbOnboardingTjekliste.tsx`, `lib/hjemmebane/communityApi.ts`, `CommunityComposer.tsx` |
| 26 | Customer Portal-linket under aftalen — opsigelse, kortskift, kvitteringer i én knap; Stripe-indstillingen slår Jonas selv til | `indstillinger/IndstillingerView.tsx`, `lib/hjemmebane/indstillinger.ts` |
**Hvorfor først:** rytmen tændes kl. 10 (A1), så de næste nye medlemmer møder tjeklisten — præsentationen skal være der.
Portalen er handlingen bag A1's fejlet-træk-besked.

### Kl. 12 — A2 · Rådgiverfladen siger sandheden (4 timer)
| Kort | Hvad | Filer |
|---|---|---|
| 46 | Samtalelisten: tekst og «venter» fra `conversations`, ulæst-tallet fra én smal hentning uden loft — vinduet forsvinder | `src/components/CompanyChatPane.tsx` (listen, `:380-475`) |
| 76 | De betalte 1:1-sessioner på virksomhedssiden ved siden af intro-sessionen (booket / afholdt / hvornår), synligt for begge rådgivere | `virksomhed/VirksomhedView.tsx` (blok med `IntroSessionLinje`), `lib/introSession.ts` |
| 3 | Hængende invitationer får et hjem: en sektion i invitationsfladen med alder og gensend (ikke forsiden — den har nok) | `virksomheder/HbInvitationer.tsx`, `lib/invitationer.ts` |
| 83 | `/members`' gamle knap: enten kalder den `fjern-fra-virksomhed`, eller den fjernes — den må ikke slette mennesker længere | `src/pages/Members.tsx`, `members/MemberCompanyRow.tsx`, `lib/medlemsfjernelse.ts` |
**Hvorfor her:** tre steder rådgiveren læser i dag og bliver ført bag lyset (tal, sessioner, invitationer), og én knap
der stadig er farlig.

### Kl. 12 — B2 · Akademiet og podcasten får signaler (3½ time)
| Kort | Hvad | Filer |
|---|---|---|
| 56 | Handout → lektion: «Hører til …»-link; opslaget som delt funktion (kort 126 skal bruge den) | `handouts/HbHandoutDetail.tsx`, ny `lib/hjemmebane/lektionForHandout.ts` |
| 57 | Video-rating: «Hjalp den dig?» ja/nej når lektionen er set færdig; tal pr. lektion i admin | migration `content_ratings`, `akademi/views/ElementView.tsx`, `admin/views/…` (tallet) |
| 69 | Podcast: `id={noegle}` pr. episode + `useScrollToHash` — så en episode kan linkes | `podcasttalks/PodcastTalksView.tsx` |
| 62 | Podcast-lytning registreres (én række pr. afspilning) — så kort 61 (global afspiller) kan afgøres på tal | migration `podcast_afspilninger`, samme fil som 69 |
**Hvorfor her:** fire små ting i indholdslaget der giver Jonas og Morten de første tal på hvad der bruges.

### Kl. 15 — A3 · Drift og dødt kød (2½ time)
| Kort | Hvad | Filer |
|---|---|---|
| 109 | Vagtens to første invarianter: ugenøgle (`week_key` = uge af `created_at`) og fortegn på facts | migration der udvider `vagt_cron` |
| 114 | Sletteliste: `DashboardActionCenter.tsx`, `GuidedTour`, `send-welcome-message`, `send-pulse-reminder` — de fire med nul kaldere (AdvisorDashboards JSX venter: filen bærer forsidens hentning) | de fire filer + `config.toml` |
| 91 | Slack-fallback-links fra `/members` til `/virksomheder`/virksomhedssiden | `_shared/indgangsMail.ts`, `send-slack-*-notification` (linkene) |
| 102 | run-weekly-agent: KUN hvis §0B valgte «slet» eller «omlæg» — én time; ellers springes over | `supabase/functions/run-weekly-agent/` + `config.toml` |
**Hvorfor her:** intet af det haster, men det er billigt, og vagten fanger næste ugenøgle-fejl af sig selv.

### Kl. 15 — B3 · Tallene: mål og fallback (3 timer)
| Kort | Hvad | Filer |
|---|---|---|
| 40 | KPI-fallbacken: de fire kronebeløb ud, «Sæt mål» vises; marginerne bliver stående til branchesamtalen | `src/lib/appConfig.ts` (`KPI_FALLBACK_TARGETS`), `lib/kpiMaal.ts` |
| 29 | «Fra budget» som mål: rangorden budget > aftalt > standard, afvigelsen på Nøgletal med forsidens motor (`budgetSignalInput`) | `lib/kpiMaal.ts`, `noegletal/NoegletalView.tsx`, `lib/budgetSignalInput.ts` |
| 82 | Platformconfig: slet branding, Performance Score og Møde — og nøglerne | `admin/views/ConfigView.tsx`, `src/lib/appConfig.ts` |
**Hvorfor sammen:** 40 og 82 rører begge `appConfig.ts`; 29 bygger oven på 40's tomme mål. Én PR, ingen konflikt.

### Kl. 17 — A4 · Forsidens dom bliver hel (3½ time)
| Kort | Hvad | Filer |
|---|---|---|
| 81 | Slags 6 «rapporteringsfejl» som ren dom (strandede uploads har en grund i data nu) — alvor tildeles (§3) | `src/lib/forsidensDom.ts`, `AdvisorDashboard.tsx` (hentningen af `financial_reports.status/validation_errors`), test |
| 52 | Refleksionens udgang: en refleksion giver ALTID en opgave (trigger på `pulse_checkins` → `company_actions`), og slags 8 «beder om hjælp» som dom på refleksionens ord | migration (trigger), `forsidensDom.ts`, `_shared/opgaveEngine.ts` (kilde `reflection`) |
**Hvorfor sidst i A:** de to hører sammen (kortet siger det), og de rører forsidensDom, som ingen anden bunke rører.

### Kl. 17 — B4 · Netværket bliver et netværk (4½ time)
| Kort | Hvad | Filer |
|---|---|---|
| 65 | Profilen forfra: faktalinjen (`city`, `start_date` ind i RPC'en) og de tre felter, forudfyldt fra ansøgningen | `members/MemberDirectoryView.tsx`, `members/…Profil…`, migration (RPC + kolonner), `lib/hjemmebane/netvaerksprofil.ts` |
| 66 | Redigering på egen profilside — og rådgiverne kan rette deres egen igen | `members/` (samme views), `lib/hjemmebane/netvaerksprofil.ts` |
| 54 | «Bed om kontakt»: platformen laver introen — notifikation + mail til X med Y's profil; intet beskedsystem | ny edge function `bed-om-kontakt` (Bucket A), `_shared/notificationWriter.ts` (ny type), `members/` (knappen), mailskabelon |
**Hvorfor sidst i B:** 65 og 66 er samme filer; 54 giver dem en grund. Og det er game changer nr. 3's første tre dage.

### Kl. 20 — A5 · Småt og synligt, hvis der er kræfter (2½ time)
| Kort | Hvad | Filer |
|---|---|---|
| 49 | Systembeskeder ud af chatstrømmen — klokken bærer dem | `MemberChatPane.tsx`, `CompanyChatPane.tsx` (render-filter), `lib/chatShared.ts` |
| 87 | To mails for samme 1:1-betaling → én (notifikationen bliver `info`) | `stripe-webhook/index.ts:1168-1177` |
| 77 | Adresse, by, postnummer kan rettes (rådgiverens dialog) | `EditCompanyDialog.tsx` |

### Kl. 20 — B5 · Community og rådgiverens dør, hvis der er kræfter (2½ time)
| Kort | Hvad | Filer |
|---|---|---|
| 71 | Like fra feedet (kun den del af det samlede kort) | `community/CommunityView.tsx`, `communityApi.ts` |
| 123 + 129 | Rådgiverens tilgængelighed: «åben nu / i dag / ikke», sat manuelt, mærke i menuen som «Live nu», Meet-link — «Online nu» dækkes 80 % uden presence | `app_config` (nøgle) eller migration, `HbMemberShell.tsx` (mærke), `booksession/BookSessionView.tsx`, `lib/hjemmebane/liveEvent.ts`-mønstret |

**Filerne krydser aldrig mellem A og B i samme time.** `HbMemberShell.tsx` rører B1 kl. 9 og B5 kl. 20 — samme
vindue. `stripe-webhook` rører A1 og A5 — samme vindue. `appConfig.ts` er kun B3. `VirksomhedView.tsx` er kun A2.

---

## 2. Hvorfor den rækkefølge

1. **Prod først, og rytmen tændt kl. 10.** Seks migrationer er skrevet og bevist i kode; de lukker fem kort uden
   én linje ny kode. Onboarding-rytmen skrives om som dagens første halve time, fordi den er det eneste der venter på
   noget nyt — og den skal køre før de næste medlemmer kommer ind.
2. **13/9 er lørdag.** Doggybeds træk er det første på den nye konto. A1 skal være i drift fredag aften: beskeden ved
   fejl, fakturaen ved opgivelse, portalen bag begge (B1).
3. **Rådgiverens skærm før medlemmets.** A2 retter tre steder Jonas og Morten læser hver dag og bliver ført bag lyset.
   Medlemmets tilsvarende (B2, B3) er signaler og mål — vigtige, men ingen lyver i dag.
4. **Det billige der låser op:** 56's opslag er 126's grundlag; 62's tal afgør 61; 40's tomme mål er 29's forudsætning;
   65+66's profil er 54's grund; 81 og 52 deler dom. Hver bunke er bygget så det næste kort bliver billigere.
5. **Det sidste er det der kan skæres.** A5 og B5 er kræfterne-tilbage-bunker; ingen af dem blokerer noget.

---

## 3. Beslutninger der ligger inde i bunkerne — tag dem om morgenen

| Bunke | Kort | Spørgsmålet | Foreslået svar, hvis ingen siger andet |
|---|---|---|---|
| A1 | 24 | Skal resten af raterne skifte til `send_invoice` når kortet er opgivet — eller kun DEN fakturaen? | kun den; resten er en samtale med restancepolitikken |
| A2 | 3 | Hjem: rådgiverforsiden eller invitationsfladen? | invitationsfladen — forsiden har nok linjer |
| A2 | 83 | `/members`' knap: om til «fjern fra virksomheden», eller væk? | væk — siden er tømt, og virksomhedssiden har knappen |
| A4 | 81, 52 | Alvor for slags 6 og 8 (§12 i forsiden-design) | 6 = 75 som forfalden; 8 = 90 — et menneske der beder om hjælp går forrest |
| B1 | 60 | Skabelonens tre spørgsmål (= profilens tre felter, kort 65)? | «Det laver vi / Det har jeg været igennem / Det leder jeg efter» |
| B3 | 40 | Kronebeløbene ud NU, marginerne senere? Det er beslutningskortet selv | ja — kortet argumenterer det selv |
| B4 | 54 | Må medlemmer kontakte hinanden gennem platformen — og ser rådgiverne introen? | ja, som intro (ikke chat); rådgiverne får en kopi i klokken |
| B5 | 123 | Hvem må se rådgiverens tilgængelighed? | alle aktive medlemmer; rådgiveren sætter den selv |
| §0B | 102, digesten, game changer | se §0B | — |

Ingen af de andre 21 kort kræver et valg — de er skrevet så præcist i aften at de kan bygges som de står.

---

## 4. Timerne — ærligt

| Vindue | Bunker | Timer |
|---|---|---|
| A | A1 2½ · A2 4 · A3 2½ · A4 3½ · A5 2½ | **15** |
| B | B1 3 · B2 3½ · B3 3 · B4 4½ · B5 2½ | **16½** |

Det er 31½ timers byggetid fordelt på to vinduer — plus recon før hver bunke, tests, diff, Jonas' læsning og merge. I
dag blev 40 PR'er merget over 18 timer med tre vinduer, mange som bundter af 3–4 kort; **25 kort på en dag er
bevist, 30 er grænsen.** Regn med at A5 og B5 ikke nås. Går det galt tidligere, er skærekanten:

1. Først ud: **A5 og B5** (5 kort, 5 timer) — intet blokeres.
2. Dernæst: **B4's 54** (intro-knappen, 2 timer) — 65+66 står alene.
3. Dernæst: **A3's 114 og 91** — dødt kød kan ligge en dag til.
4. **Aldrig ud:** A1, B1, A2, B3's 40, A4's 81. Det er de tolv kort dagen skal måles på.

Kernen — det der SKAL lande: **A1 (3) + B1 (3) + A2 (4) + B3 (3) + A4 (2) + B2 (4) = 19 kort, ca. 19 timer.**

---

## 5. Det der ikke er med, og hvorfor

- **Stripe-migrationen 13/9** (kort 22, 25, 27): datarbejde i Stripe og SQL, ikke kode. 27 aktive har NUL
  `stripe_customer_id` — det løses i hånden med fakturaerne som nøgle, som 1/9. Egen formiddag, ikke et vindue.
- **Årsrapport-udtrækket** (35, 36): en uge (skabelon for klasse B) plus én datarettelse i hånden (Booking 46 kr.).
- **PHILBERTs to filer** (32): en ny PDF-skabelon er parserarbejde med prøvefiler — en halv dag, og den rammer én
  virksomhed. Tages den dag der er en time til overs med filen ved hånden.
- **Designsamtaler:** ansøgningsflowet (4), opgave-epic'et (51), emnerne (47), indholdsmodellen (48), mailoverblikket
  (79), porteføljehentningen (106), semantisk hukommelse (121), rådgiver-MCP (120), integrationen (42), affiliate og
  SoMe (72, 124), gamification (73), video på opslag (75), advisor/admin (101), opbevaringspolitik (119), to rådgivere
  til hundrede (130). De fem game changers er her — de er uger, og §0B vælger den første.
- **Beslutningskort uden kode:** 5, 10, 17, 18, 19, 33, 34, 41, 44, 53, 78, 80, 117.
- **Kræver prod før noget kan siges:** 108 (indeks), 110 (restore — Jonas alene, en time, gerne i morgen tidlig),
  125 (flere virksomheder).
- **Mellem-ting der kan vente:** tavse queryFn'er (100, en dag), seks gamle komponenter (95), mobil (92), former til
  hjemmebane/ (94), verify_jwt (112), fonte (96), data-drevne områder (97), sekvensmotoren (128), push (127),
  kalender-link (64, fravalgt), mærket i menuen (86, drop), tom-tilstande (93 — kræver skærm, ti minutter med Jonas'
  testvirksomhed, gerne i pausen), `kr()` (113), indsæt i redigeringstabellen (37).
- **Løst, venter kun på prod:** 8, 23's medlemsdel, 30's grund, 99, 118 — §0A lukker dem.

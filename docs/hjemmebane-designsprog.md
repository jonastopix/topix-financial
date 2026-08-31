# Hjemmebane-designsproget — recon 2026-08-31
> Skrevet 2026-08-31. Øjebliksmåling — linjenumre og tal gælder den dag, ikke i dag.

Grundlag: main pr. denne recon. Fund, ingen forslag. Hvor der findes
noget skrevet, er det gengivet ordret.

---

## 1. Designdokumenter i repoet

Der findes **intet selvstændigt principdokument** ("sådan ser Hjemmebane
ud") i repoet. Identiteten bor tre steder: token-filen (§3),
komponenternes egne doc-kommentarer (§2/§6) og konvergens-dokumentet.
`docs/hjemmebane/` indeholder fem filer:

- **`konvergens.md`** — det bærende dokument: fladeregnskabet over
  gammel verden vs. Hb, med bindende vedligeholdsregel. §0 ordret:

  > Platformen taler i dag to designsprog: det gamle app-udtryk (mørk
  > sidebar, shadcn, glass-card, AppLayout) og Hb-identiteten (lys,
  > premium-redaktionel, `.theme-hjemmebane`). Dette dokument er det
  > samlede regnskab over hvilke flader der findes, hvilket sprog de
  > taler, hvor dobbelthederne bor, og i hvilket forum hver enkelt
  > afgøres. Formålet er at konvergensen sker ved BESLUTNINGER, ikke
  > ved drift.
  >
  > **VEDLIGEHOLDSREGEL (bindende):**
  > 1. Dette dokument opdateres i ENHVER PR, der ændrer flader,
  >    navigation eller designsprog (nye routes, nav-punkter,
  >    konverteringer, pensioner).
  > 2. ALLE fremtidige design-blokke skal indeholde et
  >    **"Konvergens"-afsnit**, der svarer på: (a) hvad findes i
  >    forvejen på/omkring fladen, (b) hvordan bygges der sammen med
  >    det, (c) hvilken dobbelthed afvikles — eller skabes — og i så
  >    fald hvor er afviklingen bogført (§2-punkt).
  > 3. Enhver FLADE-design-blok skal desuden svare på: **"hvad er
  >    admin-modstykket, og hvor bor det i Admin-spejlet (§5)?"** —
  >    også når svaret er "intet" (så begrundes det).

  Et chat-redesign er en flade-design-blok og er altså BUNDET af regel
  2 og 3.
- **`c0-datamodel.md`** — content-lagets datamodel (Circle-exit), ikke
  visuel identitet.
- **`c0-inventar.md`** — Circle-screenshot-inventar.
- **`c0-bunny.md`** — video-hosting.
- **`c3-vedhaeftninger-design.md`** — vedhæftninger på LEKTIONER
  (content_item_attachments) — ikke chattens vedhæftninger. Indeholder
  dog et eyebrow-eksempel der bekræfter mønstret: "MATERIALER ←
  eyebrow-stil (rust, uppercase, som øvrige)" (:147).

Uden for docs/: token-filens egen header (§3) og memory-noterne
(projekt-identiteten "lys premium-redaktionel", V0 = PR #157;
hb-tokens ALDRIG på :root pga. PDF-eksport; nye links/handlinger i
evergreen).

---

## 2. Hb-komponentbiblioteket

### Basen (src/components/hjemmebane/, alle I BRUG)

| Komponent | Gør | Import-filer |
|---|---|---|
| `HbCard.tsx` | Basen for alt kortindhold. Egen doc: "Hvid flade, hairline, stor radius, blød hover-elevation". Klasser: `rounded-hb border border-hb-line bg-hb-surface hover:shadow-hb-hover` | 25 |
| `HbButton.tsx` | Pill-knap, tre varianter: `primary` (bg-hb-evergreen, hvid tekst, h-11 px-6), `secondary` (border-hb-ink/25, hover:bg-hb-sage/50), `link` (text-hb-rust, underline) | 18 |
| `HbMemberShell.tsx` | Fælles medlemsskal for "/" og alle medlemsflader: V0-layoutmodellen (egen scroll-container på lg, sidebar som fuldhøjde-kolonne), nav-struktur inkl. abonnent-beskæring ("beholder KUN Dine tal og Podcast & Talks") | 16 |
| `HbSection.tsx` | Sektionswrapper: "rust-eyebrow, Fraunces-overskrift, valgfrit 'se alle'-link. Håndhæver sektions-rytmen ét sted." Opt-in `hairline` | 9 |
| `HbSidebar.tsx` | Desktop-nav + mobil-drawer; `HbNavEntry` (`to` = rigtig route; uden `to` er linket dødt, V0-adfærden) | 2 |
| `HbNav.tsx` | "Slank mobil-topbar: burger, mærke, avatar. Desktop-navigationen bor i HbSidebar" | 2 |
| `HbTag.tsx` | "Lille pill-label til kategorier" — `rounded-full bg-hb-sage text-xs font-medium text-hb-ink` | 4 |
| `HbAdvisorCompanyPrompt.tsx` | Rådgiverens virksomhedsvælger på Hb-flader (eyebrow "Rådgiver" i rust) | 4 |
| `EstimatMaerke.tsx` | Estimat-mærkning fra data_basis-kontrakten (#436) | 2 |
| `HbEpisodeRow.tsx` / `HbEventCard.tsx` / `HbVideoCard.tsx` | Række/kort-varianter til podcast, events, video | 1 hver |

### Fladekomponenter pr. domæne (alle routede og i brug)

- `boardroom/`: BoardroomView (forsiden), nextStep.ts (fokus-motoren),
  pushSelection.ts, youtube.ts
- `rapportering/`: RapporteringView, HbReportUploadZone, reportCardView.ts
- `noegletal/`: NoegletalView, HbFinancialAnalysis, kpiTone.ts, trendMoM.ts
- `budget/`: BudgetteringView + 8 delkomponenter (BvA, cashflow,
  edit-table, import ×2, simulator, template-guide, gitter)
- `handouts/`: HandoutsView, HbHandoutCard/Detail/LeverRow/AIFeedback
- `akademi/`: HbItemRow, HbKursusKort, HbProgressBar, HbVideoEmbed,
  useAkademiData + views
- `events/`: EventsView, EventDetailView, EventRegisterAction
  (inline-svar-mønstret, §6)
- `community/`: CommunityView, CommunityTraadView, CommunityComposer,
  CommunityDokument — **bemærk: CommunityComposer og CommunityTraadView
  er en eksisterende Hb-oversættelse af "skriv i en tråd"** — nærmeste
  slægtning til en chat-composer i Hb-sproget
- `members/`: MemberDirectoryView, MemberProfileView (Netværket)
- `podcasttalks/`, `rabataftaler/`, `booksession/`: én view hver
- `admin/`: HbAdminShell + editor-værktøjskassen (HbField
  (hbControlClasses — input-stilen), HbSegmented, HbStatusPill,
  HbTreeList, HbUploadZone, HbMediaPicker, HbEditorRichtext,
  HbMaterials, HbBunnyPicker) — **HbEditorRichtext er en eksisterende
  Hb-rich-text-editor** (admin-side)

Ikke i brug: ingen — alle basiskomponenter har mindst én importør.
(Uden for Hb-mappen findes Hb-stylede undtagelser i gamle filer:
`PulseCheckinModal` og `ReportReviewDialog` bruger hb-tokens direkte.)

---

## 3. Designtokens

Defineret ét sted: `src/styles/hjemmebane.css`, gengivet ordret:

```css
/* Hjemmebane (V0) — tokens for det lyse, premium-redaktionelle miljø.
   Additivt og scoped: variablerne findes kun under .theme-hjemmebane og
   importeres af Hb-fladerne (PreviewHjemmebane, AdminContent, Akademiet,
   Boardroom). App-temaet (:root/.dark i index.css) er urørt —
   PDF-eksporten afhænger af det. */
@import url('...Fraunces:opsz,wght@9..144,400..600...');

.theme-hjemmebane {
  /* Flader */
  --hb-paper: 40 33% 97%;      /* sidebaggrund — varmt papir */
  --hb-surface: 0 0% 100%;     /* kort/flader — rent hvidt mod papiret */

  /* Tekst */
  --hb-ink: 170 30% 12%;       /* primær — næsten-sort m. grøn undertone */
  --hb-ink-soft: 170 12% 38%;  /* sekundær — metadata, varigheder */

  /* Accenter */
  --hb-evergreen: 170 46% 14%; /* brandgrøn — handling; identisk med --primary (lys) */
  --hb-rust: 18 60% 45%;       /* redaktionel accent — eyebrows, links */
  --hb-sage: 155 30% 88%;      /* blid grøn tint — tags, hover-flader */

  /* Streger & form */
  --hb-line: 40 12% 88%;       /* hairline-borders — varm taupe */
  --hb-radius: 1rem;
}
```

Tailwind-mapping (`tailwind.config.ts:76-93`): `hb-paper/surface/ink/
ink-soft/evergreen/rust/sage/line` som farver, `rounded-hb` (1rem) og
skyggen `shadow-hb-hover` (`0 8px 30px hsl(170 30% 12% / 0.06)`).

**Scope-reglen**: tokens findes KUN under `.theme-hjemmebane` — aldrig
`:root`. Grunden står i filens header: app-temaet i index.css er urørt
fordi **PDF-eksporten afhænger af det** (også bogført i memory). En
chat-konvertering skal altså mountes under en `.theme-hjemmebane`-
wrapper (som HbMemberShell giver), ellers evaluerer alle hb-klasser
til ingenting.

---

## 4. Farverne — rust vs. evergreen

**Evergreen** (= brandgrønnen, identisk med gamle --primary i lys
tilstand) er **handlingsfarven**: HbButton primary, fokus-ringe,
"Forslag til dig"-overlinjen, valgt kalenderdag. Memory-reglen: "nye
Hjemmebane-links/handlinger i text-hb-evergreen, aldrig rust".

**Rust** er den **redaktionelle accent** — og den er overbelastet. Den
citerede kommentar findes i `BoardroomView.tsx:1913-1916` (forslags-
rækkens skelnen):

> Evergreen er Hjemmebanes handlingsfarve; rust bærer allerede fire
> betydninger og eyebrow'en.

De fire betydninger, målt i koden (ingen samlet liste findes skrevet —
dette er observation af faktisk brug):

1. **Eyebrows** — HbSection.tsx:28 (`uppercase tracking-[0.14em]
   text-hb-rust`), HbAdvisorCompanyPrompt.tsx:56, c3-designets
   "eyebrow-stil (rust, uppercase, som øvrige)".
2. **Links** — HbSection "se alle"-linket (:36), HbButton
   `link`-varianten (:12), PulseCheckinModal `msLink`.
3. **Advarsler/fejl** — ReportReviewDialog gennemgående (border-hb-rust,
   AlertTriangle text-hb-rust, fejltekster :564-853), PulseCheckinModal
   `iconWarn`.
4. **Fyldt destruktiv/accent-knap** — "Slet"-pillen på historiske
   årsrapporter (`bg-hb-rust ... text-white`, citeret i
   slet-aarsrapport-recon:27).

Reglen der kan udledes (og som memory bogfører som beslutning): rust
tilføjes IKKE en femte betydning; alt nyt der er en handling, er
evergreen.

---

## 5. Typografi

- **Fraunces** (`font-editorial`, tailwind.config.ts:20: `["Fraunces",
  "Georgia", "serif"]`, loadet i hjemmebane.css med optisk akse
  9..144, vægt 400..600) — overskrifter og store tal. Kanoniske
  størrelser målt i koden:
  - Sidehilsen (PageHeader, BoardroomView:139-145): `font-editorial
    text-4xl md:text-5xl font-medium leading-[1.1] tracking-tight`.
  - Fokus-kortets primærtitel: `text-3xl md:text-4xl font-medium
    leading-tight`.
  - HbSection-titel (:30): `text-2xl md:text-3xl font-medium
    leading-tight`.
  - Store enkelttal (events-datoen): `font-editorial text-3xl
    font-medium leading-none`.
  - Vægten er altid `font-medium` (500) — aldrig bold.
- **Brødtekst**: systemets sans (ingen hb-specifik brødskrift —
  arver appens sans-stack). Størrelser: `text-base leading-relaxed`
  (fokus-manchet), `text-sm leading-relaxed` (beskrivelser),
  `text-[15px] font-medium leading-snug` (række-titler),
  `text-sm text-hb-ink-soft` (metadata).
- **Mikrolabels**: `text-xs`/`text-[11px]`/`text-[10px]` `font-medium
  uppercase tracking-[0.14em]` — eyebrow-formen genbruges i alle
  småoverskrifter ("Forslag til dig", "Rådgiver", døgnets dato i
  events-rækken).
- Farvehierarkiet er to-trins: `text-hb-ink` bærer, `text-hb-ink-soft`
  understøtter. Ingen tredje grå.

---

## 6. Rytme og layout

**Siden**: papir-baggrund (hb-paper), indhold i HbMemberShell
(fuldhøjde-sidebar på lg, egen scroll-container; mobil: HbNav-topbar +
drawer). Shell'ens lodrette padding "deles af alle flader og må ikke
vokse for én" (kommentar BoardroomView:136-138 — luften ejes af
komponenten, ikke skallen).

**Sektioner**: `HbSection` håndhæver rytmen ét sted — eyebrow (rust,
uppercase) + valgfri Fraunces-titel + valgfrit "se alle"-link, header
med `min-h-6` og `hairline` = `border-b border-hb-line pb-3` over
`mb-5`. Forsidens afstande: første sektion `mt-10 md:mt-12`, alle
følgende `mt-14 md:mt-16`.

**Kort**: HbCard (`rounded-hb` = 1rem, `border-hb-line`, hvid flade,
`hover:shadow-hb-hover`). Fokus-kortet padder selv `p-7 md:p-9` og
`min-h-[230px]` med skeleton i reserveret højde — "ingen layout-hop".

**Lister**: RAMMELØSE rækker, ikke kort-stakke. Events-mønstret
(BoardroomView:1856-1880, kommentar :1843-1855): `<ul>` med
`border-t border-hb-line` pr. `<li>` (`last:border-b`), `py-4`,
`hover:bg-hb-sage/20` på rækken, link dækker indholdet og handlingen
står som SØSKENDE ("klikbar handling i et anker er ugyldig HTML").
"Dine aftaler" genbruger mønstret. Inline-handlinger i rækker er
TEKSTUELLE, ikke fyldte knapper — EventRegisterAction's egen doc:
"Tekstuel handling, IKKE en fyldt knap — rækken er stadig primært et
link til eventsiden, og handlingen skal ikke konkurrere med den."

**Fold-ud frem for navigation** i stille lister: fokus-kortets
quiet-punkter toggler `expandedKey`, titlen flugter ved kanten (pl-0,
"en indrykning ville netop bryde flugten med titlen").

**Skeletons**: `animate-pulse` på hb-line-toner med reserveret højde.

---

## 7. De konverterede flader (GO'et)

GO-stemplerne står i HbMemberShell/App.tsx som kommentarer:

| Flade | GO | Filer | Anderledes end forgængeren |
|---|---|---|---|
| Forsiden "/" ("Dit Boardroom") | Forside-GO 2026-08-12 (App.tsx:291) | boardroom/BoardroomView | Fokus-motor (deriveFocus) i stedet for widget-grid; tre lag (næste skridt → events → redaktionelt bånd → tal-strip); "Dine aftaler" (#454) |
| Rapportering /reports | GO 2026-08-06 | rapportering/RapporteringView | Leverance-fortælling (leveringsbånd, nudges, tilstandskort, årsrapporter) frem for pipeline-liste; trend/AI flyttet til /noegletal |
| KPI /kpis | KPI-GO 2026-08-06 | noegletal/NoegletalView | Fuld paritet + trend/AI i Hb-udtryk (mål-hero, kort, gauge, advisor-kommentarer); konvergens krævede KPI-GO før Rapportering-GO |
| Budget /budget | Budget-GO 2026-08-06 | budget/BudgetteringView + 8 dele | Fuld paritet (scenarier, BvA, import ×2, hvad-hvis m. #forecast-anker, cashflow); maskinlaget (budgetEngine) udskilt og delt |
| Handouts /handouts | Handouts-GO 2026-08-06 | handouts/* | Modulkort + detail m. løftestangsrækker (HbHandoutLeverRow) |
| Podcast & Talks /podcast | GO 2026-08-13 | podcasttalks/ | Ét nav-objekt delt mellem medlem og abonnent |
| BookSession /book-session | GO 2026-08-13 | booksession/ | — |
| Dertil HB fra start: Akademiet (C1 trin 3), Events, Community, Netværket (/medlemmer), Rabataftaler, admin-spejlet | | | |

GO-mekanikken var ens hver gang: byg på ny route (advisor-gated),
derefter swap på den GAMLE URL (URL'er er email-/notifikations-
kontrakter), ny route → redirect. **Chatten (/chat) står i
fladeregnskabet som GAMMEL med skæbnen "Konverteres-før-lancering"**
— den er den største tilbageværende medlemsflade i gammelt sprog.

---

## 8. Chatten i designsammenhæng

Der findes **ingen skitse og intet designafsnit** for chatten i
Hb-sammenhæng. Det skrevne, udtømmende:

1. **konvergens.md §1** (fladeregnskabet, :60): `| /chat |
   ChatShell.tsx | Samlet chat (rådgiver/AI) | GAMMEL |
   Konverteres-før-lancering |` — beslutningen om AT konvertere er
   truffet (princip 8, produktbeslutning 2026-08-05); intet om
   hvordan.
2. **RAEKKEFOELGE.md tempo 5** (fase 3, :59-70): "Splittet af
   CompanyChatPane i medlemsflade og rådgiverbord" + "Rollen som
   eksplicit tilstand" — dvs. den besluttede retning er at MEDLEMS-
   chatten og rådgiverbordet skilles ad; "Hvorfor samlet: Syv punkter,
   ét stykke arbejde … Laves de hver for sig, røres samme fil tre
   gange." (Bemærk spændingen: et medlemschat-redesign uden split
   rører netop samme fil.)
3. **docs/opgaver-og-chat-31-august.md §8**: chat-redesignet bogført
   som åbent, med grundlag i §4-målingen (44,4 % systembeskeder) og
   medlemschat-reconen; de ni rent medlemsvendte steder er listet dér
   og i `docs/medlemschat-recon.md` §7.
4. **Rester**: forældreløse `data-tour`-ankre inkl. `chat-link` i
   AppSidebar (konvergens :124) — et gammelt rundturs-tilløb, afgøres
   i onboarding-epicen.
5. **Nærmeste eksisterende Hb-forlæg for chat-elementer**:
   CommunityComposer/CommunityTraadView (skriv + tråd i Hb-sprog),
   EventRegisterAction (inline-handling i række), HbEditorRichtext
   (rich text, admin), c3-vedhaeftnings-mønstret (materialer på
   indhold — IKKE chattens vedhæftninger, som bor i
   messages.context_meta).

Bindinger et chat-redesign arver, samlet: konvergensens
vedligeholdsregel (Konvergens-afsnit + admin-modstykke-svar i
design-blokken), scope-reglen (.theme-hjemmebane-wrapper, aldrig
:root), evergreen-til-handling/rust-uden-femte-betydning, rammeløse
rækker med handling-som-søskende, Fraunces i font-medium til
overskrifter, og fase 3-beslutningen om at splittet af CompanyChatPane
hører til rådgiver-arbejdet.

# Recon: platformens viden om sit eget indhold

Rå observationer, 2026-08-25. Ingen ændringer foretaget. Fil- og linjereferencer
er mod main (a3175722). Prod-tal er IKKE målt i denne recon — Supabase MCP når
ikke Lovable-prod; de eneste prod-tal herunder er dem der står citeret i
migrations-kommentarer (målt 13-08-2026 af tidligere arbejde).

---

## 1. Akademiet — datamodellen

Alt indhold bor i tre tabeller. Der findes INGEN dedikeret "modul"- eller
"video"-tabel — begge er rækker i `content_items`.

### content_collections (kurser/moduler/sektioner)
Oprettet i `supabase/migrations/20260804120000_hjemmebane_content_layer.sql:20-35`.

| Kolonne | Type | Art |
|---|---|---|
| id | uuid PK | struktur |
| area | text, CHECK | struktur — nu 6 værdier: `classroom, academy, rabataftaler, talks, quick_wins, start_her` (`20260813153000:65-67`) |
| parent_id | uuid → content_collections | struktur (kursus → modul-hierarki, maks 2 niveauer i praksis, jf. useAkademiData.ts:86-91) |
| title | text NOT NULL | **fri tekst** |
| slug | text UNIQUE | struktur |
| description | text, nullable | **fri tekst** |
| cover_path | text, nullable | medie-ref |
| position | int | struktur (rækkefølge) |
| drip_after_days | int, nullable | struktur |
| status | text CHECK draft/published/archived | struktur |
| created_at / updated_at | timestamptz | audit |

Ingen kategori-, tag- eller emne-kolonner udover `area`.

### content_items (alt indhold — videoer, lektioner, push-indslag …)
Oprettet i `20260804120000:153-192`; aktuelt kolonnesæt i
`src/integrations/supabase/types.ts:930-1025`.

| Kolonne | Type | Art |
|---|---|---|
| id | uuid PK | struktur |
| area | text CHECK — 10 værdier: `classroom, academy, rabataftaler, talks, quick_wins, start_her, push, ugens_video, redaktionelt, evergreen` (`20260813153000:33-37`) | struktur |
| collection_id | uuid → content_collections, nullable | struktur |
| type | text CHECK: `video, lektion, skabelon, rabataftale, episode, push_indslag` (`20260804120000:159-161`) | struktur |
| title | text NOT NULL | **fri tekst** |
| slug | text UNIQUE | struktur |
| description | text, nullable | **fri tekst** |
| body | text, nullable (HTML fra Tiptap-editor, ItemEditor.tsx:288-289; renderes m. dangerouslySetInnerHTML i ElementView.tsx:241-245) | **fri tekst** |
| position | int | struktur |
| drip_after_days | int, nullable | struktur |
| tier_visibility | text DEFAULT 'all' | **DØD kolonne** — migrationskommentar `20260813100000`: "kolonnen er doed (ingen query, ingen komponent, ingen admin-flade; alle 84 raekker paa default 'all')" |
| media_provider | text CHECK: none/bunny/storage/external | struktur |
| bunny_video_id / storage_path / external_url | text, nullable | medie-ref |
| duration_seconds | int, nullable | struktur (hentes manuelt fra Bunny via knap, ItemEditor.tsx:325-360 — feltnavnet hos Bunny er stadig et gæt i koden) |
| cover_path | text, nullable | medie-ref |
| partner_id | uuid → partners, nullable | struktur |
| handout_module | text, nullable, CHECK: `overordnet, bogholderi, administration, salg, marketing` (`20260805120000:21-25`) | struktur — **eneste emne-agtige kolonne** |
| metadata | jsonb DEFAULT '{}' | struktur/fri — nøgler i brug: `author` + `expires_at` (push, ItemEditor.tsx:242-280), `link` (evergreen, EvergreenView.tsx:187), `link` + `quote` (redaktionelt, RedaktioneltView.tsx:190-199), `expires_at` læses i pushSelection.ts:26 |
| status | text CHECK draft/published/archived | struktur |
| published_at | timestamptz, nullable | struktur |
| created_at / updated_at | timestamptz | audit |

Der findes INGEN tag-, emne-, kategori- (udover area) eller målgruppe-kolonner
nogen steder i indholdslaget.

### content_item_attachments (materialer på en lektion)
`20260804210000:14-30`: item_id, kind (storage/link), label (**fri tekst**),
storage_path, external_url, position. Ingen beskrivelse af hvad materialet
handler om udover label.

### Tomt i praksis (citeret fra migrations-kommentarer, målt 13-08-2026)
- `tier_visibility`: alle 84 rækker på 'all' (`20260813100000`).
- Rækker pr. area (`20260813100000`): academy 27, classroom 47, evergreen 4,
  push 2, start_her 3, ugens_video 1, **talks 0**. I alt 84.
- `20260813153000:15-18`: skabeloner 0 rækker (begge tabeller), rabataftaler 0.
- description-dækning, metadata-dækning, published_at-dækning: **ikke målt** —
  queries i afsnit 3.

### Områdernes betydning (label ≠ nøgle)
`src/lib/hjemmebane/adminContentApi.ts:37-120`: start_her="Start her",
classroom="Fundamentet" (Jonas'/Mortens egen undervisning),
academy="Kurser" (eksterne eksperter), talks="Optagelser" (ren beholder, ingen
medlemsflade — optagelsen vises på sit event), quick_wins="Quick Wins"
("Korte, hurtige videoer"), push/ugens_video/redaktionelt/evergreen er
forside-kuratering med egne admin-views.

---

## 2. Hvad beskriver et modul eller en video

Hvad systemet ved om en konkret video (`type='video'`, media_provider='bunny'):

- **Titel** — fri tekst.
- **Beskrivelse** — fri tekst, nullable; vises til medlemmet på forsiden
  (ForsideView.tsx:30-31) og på elementsiden (ElementView.tsx:202-203).
- **Body** — valgfri rich-text under videoen.
- **Varighed** — duration_seconds, kun hvis admin har trykket hent-knappen.
- **Rækkefølge** — position + collection_id (samling har egen position);
  forløbsrækkefølgen udledes klient-side i useAkademiData.ts:63-96.
- **Kategori** — kun `area` (miljø) og evt. samlingens titel. Intet finere.
- **Emne** — KUN via `handout_module` (5 mulige værdier), og kun hvis sat.
- **Målgruppe** — findes ikke. `tier_visibility` er død.
- **Dryp** — drip_after_days (item eller arvet fra samling, drip.ts).

Hvad admin faktisk udfylder (ItemEditor.tsx-formfelter): area, type, title,
description, body, collection_id, drip_after_days, handout_module, partner_id,
media-felter, metadata (author/expires_at for push).

**Rigtigt prod-eksempel kunne ikke hentes**: Supabase MCP i denne opsætning når
ikke Lovable-prod-projektet (loiavmastgeieqyiwyyr) — kun boardroom-2-prod.
Query til Lovable SQL editor, der viser alt hvad systemet ved om én video:

```sql
SELECT i.title, i.description, i.body IS NOT NULL AS har_body,
       i.duration_seconds, i.area, i.type, i.position,
       i.handout_module, i.metadata, i.drip_after_days, i.published_at,
       c.title AS samling, c.description AS samling_beskrivelse,
       p.title AS kursus
FROM content_items i
LEFT JOIN content_collections c ON c.id = i.collection_id
LEFT JOIN content_collections p ON p.id = c.parent_id
WHERE i.type = 'video' AND i.status = 'published'
ORDER BY i.created_at DESC
LIMIT 3;
```

---

## 3. Mål indholdet — SELECTs til Lovable SQL editor

```sql
-- Antal samlinger og items pr. area/type/status
SELECT 'collections' AS kilde, area, NULL AS type, status, count(*)
FROM content_collections GROUP BY area, status
UNION ALL
SELECT 'items', area, type, status, count(*)
FROM content_items GROUP BY area, type, status
ORDER BY kilde, area, type;

-- Beskrivelses-dækning og -længde på items
SELECT area, type,
       count(*) AS i_alt,
       count(description) AS har_beskrivelse,
       count(body) AS har_body,
       round(avg(length(description))) AS gns_beskr_laengde,
       min(length(description)) AS min_laengde,
       max(length(description)) AS max_laengde
FROM content_items
WHERE status = 'published'
GROUP BY area, type ORDER BY area, type;

-- Samme for samlinger
SELECT area, count(*) AS i_alt, count(description) AS har_beskrivelse,
       round(avg(length(description))) AS gns_laengde
FROM content_collections WHERE status = 'published' GROUP BY area;

-- Emne-agtig struktur: handout_module-dækning
SELECT area, handout_module, count(*)
FROM content_items GROUP BY area, handout_module ORDER BY area;

-- Hvilke metadata-nøgler findes overhovedet, og hvor mange har nogen
SELECT area, jsonb_object_keys(metadata) AS noegle, count(*)
FROM content_items GROUP BY area, noegle
UNION ALL
SELECT area, '(tom metadata)', count(*)
FROM content_items WHERE metadata = '{}'::jsonb GROUP BY area;

-- Varighed og published_at-dækning
SELECT area, type, count(*) AS i_alt,
       count(duration_seconds) AS har_varighed,
       count(published_at) AS har_published_at
FROM content_items GROUP BY area, type ORDER BY area, type;
```

(Kolonnenavne verificeret mod types.ts:930-1025 og migrationerne ovenfor.)

---

## 4. Podcast

- Episoderne bor **udelukkende i det eksterne RSS-feed**:
  `https://anchor.fm/s/101a8bd38/podcast/rss` — konstant i
  `supabase/functions/podcast-rss/index.ts:19`.
- Edge-funktionen er en "dum CORS-proxy" (index.ts:1-15): Bucket A-auth,
  returnerer rå XML m. `Cache-Control: max-age=1800`, rører aldrig databasen.
- **Intet hentes ind.** Ingen tabel, ingen ingestion, ingen cron. Parsning sker
  klient-side pr. besøg (`src/lib/hjemmebane/podcastRss.ts:53-80`, React Query
  staleTime 30 min i PodcastTalksView.tsx:41-66).
- Hvad klienten ved om en episode — kun hvad feedet giver
  (podcastRss.ts:10-26): guid, title, description, link, audioUrl (enclosure),
  durationSeconds (itunes:duration), imageUrl, publishedAt, season, episode,
  episodeType. Alt forsvinder når cachen udløber.
- `type='episode'` findes i content_items' CHECK, men talks-arealet havde 0
  rækker i prod 13-08-2026, og admin-hintet siger eksplicit "podcast-episoder
  hentes automatisk via RSS, ikke her" (adminContentApi.ts:84).
- Ingen forbrugsregistrering på podcast: episoder har intet content_item-id,
  så member_progress kan ikke pege på dem. Afspilning sker i ét `<audio>`-
  element i PodcastTalksView; der skrives intet.

---

## 5. Handouts

To lag:

**Definitionen** (hvad handoutet handler om) er **kode, ikke data**:
`src/lib/handoutConfig.ts` — 5 moduler (`overordnet, bogholderi,
administration, salg, marketing`, moduleOrder:239) med title, subtitle, icon,
sektioner, spørgsmål (key+label) og checklists. Migrationskommentaren
`20260805120000:8-10` fastslår: "handout-definitionerne er kode … der findes
ingen definitions-tabel at pege på".

**Besvarelsen** er data: `handouts`-tabellen
(`20260224071122:3-16`, types.ts:1725-1780):
module (CHECK, 5 værdier), status (`not_started/in_progress/completed`),
responses jsonb (**fri tekst** — founderens svar pr. spørgsmåls-key),
checklist jsonb, levers jsonb (founderens egne løftestænger, fri tekst),
ai_feedback jsonb + ai_feedback_at (fra handout-ai-feedback-funktionen),
completed_at, company_id, user_id, UNIQUE(user_id, module).

Systemets viden om "hvad det handler om" = modul-nøglen. Alt indholdsmæssigt
(titler, spørgsmål) bor i frontend-koden; alt medlems-skrevet er ustruktureret
jsonb. `handout_lever_milestones` (types.ts:1686-1724) kobler en levers-index
til et milestone.

---

## 6. Forbrug

Tabellen er `member_progress` (`20260804120000:243-254`, types.ts:2035-2078).
**Én række pr. (user, content_item)** — UNIQUE-constraint. Ingen historik,
ingen visningstæller, ingen sessionslog. Felter og skrivesteder:

- `seen_at` — sættes ved FØRSTE visning af elementsiden, én gang
  (ElementView.tsx:121-126). Skrives for alle item-typer.
- `acknowledged_at` ("gennemført") — manuel knap (ElementView.tsx:177), kan
  fortrydes til null (:180), ELLER automatisk når 90 %-grænsen krydses nedefra
  under reel afspilning / 'ended' efter reel afspilning
  (HbVideoEmbed.tsx:8, 74-99 — kryds-nedefra-spærren er dokumenteret :24-31).
- `skipped_at` — "spring over"-knap (ElementView.tsx:181).
- `last_position_seconds` — throttled hvert 10. sekund under afspilning, straks
  ved pause, best-effort ved unmount (HbVideoEmbed.tsx:7, 85-93, 106-109).
  Bruges til genoptag (`resumeAt`, ElementView.tsx:210).

Så: systemet ved OM et element er set/gennemført/sprunget over, HVORNÅR (ét
tidsstempel pr. tilstand) og seneste position i sekunder. Det ved IKKE hvor
ofte, hvor meget samlet, eller noget om gentagne visninger.

Sporing af "gennemført" er bevidst begrænset til Bunny-videoer
(isTrackedItem, useAkademiData.ts:172-182: `media_provider === "bunny" &&
bunny_video_id`); øvrige items er "bibliotek uden sporings-UI".
Fremdriftstal ("3 af 8") tæller kun ulåste videoer (progressSummary :187-193).
Ingen sporing på attachments (akademiApi.ts:138-140) eller podcast (afsnit 4).

RLS: self-only for medlemmer, advisors kan læse alt (`20260804120000:258-267`)
og har egne write-policies til fremdriftsværktøjet (migration 20260805200000,
refereret i akademiApi.ts:81-84; admin-fladen er ProgressView.tsx).

---

## 7. Findes der allerede en kobling (tal/tilstand → indhold)?

Fire ting der ligner, med deres faktiske form:

1. **run-company-agent → handout-moduler** (den eneste tal→indhold-kobling).
   Tool `get_handout_levers` (run-company-agent/index.ts:136-147, eksekvering
   :410-417) returnerer KUN `module, status` fra handouts. Systemprompten
   :50 instruerer: "Hvis get_handout_levers viser et relevant ugennemført
   modul der matcher en udfordring i tallene, nævn det som et konkret næste
   skridt". Bemærk: tool-beskrivelsen :140 nævner et
   "'Likviditetsstyring'-modul" som eksempel — det modul findes ikke
   (handoutConfig.ts kender kun overordnet/bogholderi/administration/salg/
   marketing). Koblingen er altså: 5 modul-nøgler + status, matchet af
   LLM'en i fri tekst. Ingen videoer, ingen content_items.

2. **content_items.handout_module → refleksionskort** (indhold→handout,
   envejs). En lektion med handout_module sat viser et kort med medlemmets
   egen handout-status (ElementView.tsx:248-249, HandoutSection :66-110).
   Ikke drevet af tal — kun af hvilken lektion medlemmet står på.

3. **events.recording_item_id → content_items** — et event peger på sin
   optagelse (`20260804120000:298`, getRecordingItem i akademiApi.ts:256-273).
   Ren strukturel reference.

4. **Forside-kuratering** — pushSelection.ts (nyeste publicerede,
   ikke-udløbne vinder) og evergreen-rotation pr. ISO-uge
   (adminContentApi.ts:119 "roterer deterministisk pr. ISO-uge"). Ens for
   alle medlemmer — ingen medlemsdata indgår.

Derudover: milestoneSuggestions.ts er statiske skabelontekster pr. kategori —
hverken tal-drevet eller indholds-koblet. Grep efter
anbefal/recommend/"relevant for" på tværs af src/ og functions/ gav ingen kode
der vælger Akademi-indhold ud fra et medlems tal, tilstand eller historik.
Der findes ingen "måske relevant for dig"-flade.

---

## 8. Hvad agenten ved

`supabase/functions/run-company-agent/index.ts`. Model:
google/gemini-2.5-flash via Lovable AI-gateway (:1088). Maks 12 iterationer.

Læse-tools i poolen (:90-362, eksekvering :364-892):

| Tool | Kilde |
|---|---|
| get_company_facts | financial_report_facts (:366-386) |
| get_pulse_checkins | pulse_checkins (:388-398) |
| get_milestones | milestones (:400-408) |
| get_handout_levers | handouts — **kun module + status** (:410-417) |
| get_kpi_targets | kpi_targets (:419-437) |
| get_budget_vs_actual | budget_targets + facts (:439-472) |
| get_previous_agent_messages | messages, context_type='agent' (:761-782) |
| get_industry_benchmark | companies + facts, peers (:784-853) |
| get_financial_alerts | notifications, alert_* (:855-876) |
| get_application_context | companies.application_context (:878-887) |

Statisk kontekst i user-prompten (:1043-1061): virksomhedsnavn, founders
fornavn, branche, alder, trigger-instruktion.

**Agenten har INGEN adgang til indholdslaget**: intet tool læser
content_items, content_collections, member_progress, content_item_attachments
eller podcast-feedet. Ordene "akademi", "video", "content" optræder ikke i
funktionen. Den eneste indholdsnære viden er de 5 handout-modulnøgler med
status — dvs. agenten kan i dag sige "du har ikke udfyldt marketing-handoutet",
men kan ikke vide at der findes en video om at styre sit bureau, og ved ikke
om medlemmet har set noget som helst.

Skrive-tools: write_chat_message, create_milestone, update_milestone_progress,
notify_advisor, write_session_prep, update_weekly_focus, write_company_action,
finish — trigger-afhængigt blokeret via POOL_BLOCKLIST (:965-977).
run-weekly-agent kalder run-company-agent med trigger weekly_cron pr. aktiv
virksomhed (run-weekly-agent/index.ts:66-75).

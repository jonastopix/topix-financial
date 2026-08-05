# C0 — Indholdsdatamodel (leverance 2)

> **Status:** GODKENDT af Jonas 2026-08-04 (linjelæst; de fire B-afgørelser i afsnit 6 er
> truffet). Migrations-SQL'en nederst er skrevet i fuld
> længde men er IKKE kørt og IKKE lagt i `supabase/migrations/` endnu. Efter godkendelse
> committes den som migrationsfil i et senere sprint og deployes via Lovable → SQL editor
> (jf. CLAUDE.md — migrationer auto-deployer aldrig).

---

## 1. Recon — platformens eksisterende mønstre (læst før design)

Designet genbruger husets mønstre, aflæst direkte i migrationshistorikken:

**Tabelkonventioner** (fx `company_actions`, `weekly_focus` i `20260329190316`, `session_bookings` i `20260407114258`):
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- FK'er med eksplicit `ON DELETE`-adfærd (`CASCADE` til ejer-entitet, `SET NULL` ved løs reference)
- Status-/typefelter som `TEXT` + `CHECK (... IN (...))` — enums bruges kun til `app_role`
- `created_at`/`updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` + `update_updated_at_column()`-trigger
- Indeks-navngivning `idx_<tabel>_<kolonner>`

**RLS-mønstre** (jf. `SECURITY_BASELINE.md` §5):
- Company-scoped: `company_id = public.user_company_id(auth.uid())`
- Advisor-bred læsning/skrivning: `public.has_role(auth.uid(), 'advisor')` (admin arver advisor)
- Self-only: `auth.uid() = user_id`
- Service-role: `auth.role() = 'service_role'` (FOR ALL, både USING og WITH CHECK)
- Policy-navne på engelsk i mønstret "Members can view …", "Advisors can manage …", "Service role can manage …"

**Recon-observation (skal med i referatet):** `SECURITY_BASELINE.md` §5 siger at alle
public-schema-policies er RESTRICTIVE, men ingen af de 207 migrationsfiler indeholder
`AS RESTRICTIVE` — alle policies er skrevet som almindelige (permissive) `CREATE POLICY`.
SQL'en herunder følger den *faktiske* husstil fra migrationerne. Hvis baseline-påstanden er
korrekt for live-databasen (ændret uden migration), skal det verificeres i Lovable SQL editor
(`SELECT polname, polpermissive FROM pg_policy`) før deploy — men designet fungerer i begge
tilfælde, da hver policy her er selvstændigt stram.

**Storage-lektionerne** (aflæst i `20260317133757` og `20260523183330_fix_financial_documents_storage_rls.sql`):
1. `chat-attachments` blev oprettet som **public bucket** med "Anyone can read" — det er
   præcis fejlen, dette design undgår: **privat bucket + signerede URL'er fra dag ét.**
2. `storage.objects`-policies er PERMISSIVE (OR-stakker) — en enkelt løs policy åbner hele
   bucketen uanset hvor stramme de øvrige er. Derfor er hver storage-policy herunder skrevet
   med både bucket-check OG rolle-/path-check i samme prædikat.
3. Advisor-branch skal være eksplicit (has_role), fordi advisors typisk ikke har
   `company_members`-række og `user_company_id()` returnerer NULL for dem.

**Dryp-anker:** `company_members.created_at` findes (migration `20260224222456`) og bruges
som medlemmets "dag 0" for dryp-regler.

---

## 2. Designbeslutninger (med begrundelse)

**B1 — Indhold er platformsglobalt, ikke company-scoped.** Alt Circle-indhold er fælles for
alle medlemmer. Derfor bruges IKKE `company_id = user_company_id(...)`-mønstret på
indholdstabellerne — læseadgang er "authenticated + published". Det er et bevidst brud med
company-mønstret og gælder KUN indholdslaget; `member_progress` og `event_registrations` er
per-bruger (self-only).

**B2 — To-lags hierarki: `content_collections` + `content_items`.** Miljøerne (Classroom,
Academy, Skabeloner, Talks, Quick Wins, Start her) er faste flader i app'en og hardcodes som
`area`-felt. Grupperingerne INDE i miljøerne (Classroom-sektioner, Academy-kurser og deres
moduler, skabelon-kategorier) er data og bor i `content_collections` med `parent_id` til
kursus→modul. Flade miljøer (Talks, Quick Wins, Start her) har items uden collection.

**B3 — Én items-tabel, ikke én pr. type.** Fælles felter (titel, rækkefølge, status, dryp,
medie-reference, progress-relation) dominerer; typespecifikt bor i dedikerede nullable felter
+ `metadata JSONB`. Det matcher spec'ens typeliste: `video`/`lektion`/`skabelon`/
`rabataftale`/`episode`/`push_indslag`.

**B4 — Rabataftaler bor primært i `partners`.** Partneren, kategorien og indløsningen er
strukturerede felter dér. `content_items` har typeværdien `rabataftale` + `partner_id`-FK,
så en aftale KAN surfaces i indholdsflows (fx "Ugens push" der fremhæver en partner), men
Rabataftale-siden læser direkte fra `partners`.

**B5 — Medie-reference er trefløjet.** `media_provider` ∈ `bunny`/`storage`/`external`/`none`:
video → Bunny Stream (`bunny_video_id`, aldrig storage), filer (skabeloner, pdf'er, covers)
→ privat storage-bucket (`storage_path`), eksterne links → `external_url`. CHECK-constraint
kræver at det matchende referencefelt er udfyldt.

**B6 — Dryp håndhæves i app-laget i V1, ikke i RLS.** `drip_after_days` (NULL = straks
tilgængelig) regnes relativt til medlemmets `company_members.created_at`. RLS-håndhævelse
ville kræve en ny SECURITY DEFINER-helper (fx `user_joined_at()`), og nye SECURITY
DEFINER-funktioner er på FORBIDDEN-listen uden eksplicit grønt lys. App-laget filtrerer;
konsekvensen (et medlem der kalder API'et direkte kan se ikke-dryppet indhold tidligt) er
accepteret for V1 og noteret som hardening-kandidat. **Beslutning til Jonas:** ok?

**B7 — `tier_visibility` er til stede men ubrugt** (jf. spec). `TEXT NOT NULL DEFAULT 'all'`,
bevidst UDEN CHECK-constraint: tier-navnene er ikke besluttet, og en CHECK nu ville enten
gætte navne eller kræve migration ved første rigtige brug. Ingen kode må læse feltet i V1.

**B8 — `events` er egen tabel, ikke en item-type.** Events har tid, kapacitet og tilmeldinger
— en anden livscyklus end indhold. Afholdte events kan pege på deres optagelse via
`recording_item_id` → `content_items` (typisk en `episode`/`video`).

**B9 — `meet_url` er synlig for alle authenticated members** (ikke kun tilmeldte). Simpelt,
og medlemsskab er allerede betalt adgang. Hvis links skal beskyttes mod deling, flyttes
udlevering senere til en edge function (Bucket A). **Beslutning til Jonas:** ok?

**B10 — Sletning er arkivering.** `status = 'archived'` i stedet for DELETE i normal drift;
rigtige DELETE'er er advisor-/service-handlinger og kaskaderer progress med
(`ON DELETE CASCADE` på `member_progress.content_item_id` er bevidst: progress uden indhold
er støj).

---

## 3. Tabeldesign

### 3.1 `content_collections` — sektioner, kurser, moduler, kategorier

| Kolonne | Type | Note |
|---|---|---|
| `id` | UUID PK | |
| `area` | TEXT CHECK | `classroom` / `academy` / `skabeloner` / `talks` / `quick_wins` / `start_her` |
| `parent_id` | UUID FK → content_collections, ON DELETE CASCADE, NULL | kursus → modul; ellers NULL |
| `title` | TEXT NOT NULL | præcis titel (fra inventaret) |
| `slug` | TEXT NOT NULL UNIQUE | URL-stabil nøgle |
| `description` | TEXT | Circle-beskrivelsen (reddes via inventaret) |
| `cover_path` | TEXT | sti i privat bucket |
| `position` | INTEGER NOT NULL DEFAULT 0 | rækkefølge inden for parent/area |
| `drip_after_days` | INTEGER | NULL = straks; arves af items der ikke sætter egen |
| `status` | TEXT CHECK | `draft` / `published` / `archived`, default `draft` |
| `created_at` / `updated_at` | TIMESTAMPTZ | + trigger |

### 3.2 `content_items` — alt indhold

| Kolonne | Type | Note |
|---|---|---|
| `id` | UUID PK | |
| `area` | TEXT CHECK | som 3.1 + `rabataftaler` og `push` (Ugens push-indslag) — matcher SQL'ens CHECK; `rabataftaler` er fremtidssikring til items der surfacer en partneraftale |
| `collection_id` | UUID FK → content_collections, ON DELETE SET NULL, NULL | flade miljøer: NULL |
| `type` | TEXT CHECK | `video` / `lektion` / `skabelon` / `rabataftale` / `episode` / `push_indslag` |
| `title` | TEXT NOT NULL | |
| `slug` | TEXT NOT NULL UNIQUE | |
| `description` | TEXT | kort beskrivelse (kort-visning) |
| `body` | TEXT | lektions-/opslagstekst (Tiptap-HTML, som platformen allerede bruger) |
| `position` | INTEGER NOT NULL DEFAULT 0 | rækkefølge i collection/area |
| `drip_after_days` | INTEGER | NULL = arv fra collection, ellers item-specifik |
| `tier_visibility` | TEXT NOT NULL DEFAULT `'all'` | UBRUGT i V1 (B7) |
| `media_provider` | TEXT CHECK | `none` / `bunny` / `storage` / `external`, default `none` |
| `bunny_video_id` | TEXT | kræves når provider = bunny |
| `storage_path` | TEXT | kræves når provider = storage (skabelonfil, pdf) |
| `external_url` | TEXT | kræves når provider = external |
| `duration_seconds` | INTEGER | videolængde (visning + progress) |
| `cover_path` | TEXT | sti i privat bucket |
| `partner_id` | UUID FK → partners, ON DELETE SET NULL, NULL | kun relevant for `rabataftale` (B4) |
| `metadata` | JSONB NOT NULL DEFAULT `'{}'` | typespecifikt uden skemapres (fx gæstenavn på episode, filtype på skabelon, Circle-ID til sporbarhed under migreringen) |
| `status` | TEXT CHECK | `draft` / `published` / `archived`, default `draft` |
| `published_at` | TIMESTAMPTZ | sættes ved publicering |
| `created_at` / `updated_at` | TIMESTAMPTZ | + trigger |

### 3.3 `member_progress` — set / kvitteret / sprunget over

| Kolonne | Type | Note |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID NOT NULL FK → auth.users, ON DELETE CASCADE | |
| `content_item_id` | UUID NOT NULL FK → content_items, ON DELETE CASCADE | |
| `seen_at` | TIMESTAMPTZ | første visning |
| `acknowledged_at` | TIMESTAMPTZ | "kvitteret" (fx markeret som gennemført) |
| `skipped_at` | TIMESTAMPTZ | "sprunget over" |
| `last_position_seconds` | INTEGER | genoptag video |
| `created_at` / `updated_at` | TIMESTAMPTZ | + trigger |
| | UNIQUE(`user_id`, `content_item_id`) | én række pr. bruger pr. item |

Tilstande er uafhængige tidsstempler (ikke ét status-felt): "set" og "kvitteret" kan begge
være sande, og historikken bevares når et medlem fortryder et skip.

### 3.4 `partners` — rabataftaler

| Kolonne | Type | Note |
|---|---|---|
| `id` | UUID PK | |
| `name` | TEXT NOT NULL | |
| `category` | TEXT NOT NULL | fri tekst i V1 — kategorinavnene kommer fra inventaret; CHECK tilføjes når listen er kendt |
| `description` | TEXT | |
| `discount_text` | TEXT NOT NULL | aftalens indhold, præcis tekst |
| `redemption_type` | TEXT CHECK | `kode` / `link` / `kontakt` |
| `redemption_code` | TEXT | kun `kode` |
| `redemption_url` | TEXT | kun `link` |
| `redemption_contact` | TEXT | kun `kontakt` (navn/mail) |
| `logo_path` | TEXT | privat bucket |
| `website_url` | TEXT | |
| `valid_until` | DATE | NULL = løbende |
| `position` | INTEGER NOT NULL DEFAULT 0 | |
| `status` | TEXT CHECK | `draft` / `published` / `archived`, default `draft` |
| `created_at` / `updated_at` | TIMESTAMPTZ | + trigger |

### 3.5 `events` — Live sparring m.m.

| Kolonne | Type | Note |
|---|---|---|
| `id` | UUID PK | |
| `title` | TEXT NOT NULL | |
| `description` | TEXT | |
| `kind` | TEXT CHECK | `live_sparring` / `workshop` / `andet`, default `live_sparring` |
| `starts_at` | TIMESTAMPTZ NOT NULL | |
| `ends_at` | TIMESTAMPTZ | |
| `meet_url` | TEXT | synlig for authenticated (B9) |
| `capacity` | INTEGER | NULL = ubegrænset |
| `recording_item_id` | UUID FK → content_items, ON DELETE SET NULL | optagelsen efter afholdelse (B8) |
| `status` | TEXT CHECK | `draft` / `published` / `cancelled` / `completed`, default `draft` |
| `created_at` / `updated_at` | TIMESTAMPTZ | + trigger |

### 3.6 `event_registrations` — tilmeldinger

| Kolonne | Type | Note |
|---|---|---|
| `id` | UUID PK | |
| `event_id` | UUID NOT NULL FK → events, ON DELETE CASCADE | |
| `user_id` | UUID NOT NULL FK → auth.users, ON DELETE CASCADE | |
| `registered_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `cancelled_at` | TIMESTAMPTZ | afmelding = tidsstempel, ikke DELETE (kapacitetshistorik) |
| | UNIQUE(`event_id`, `user_id`) | |

---

## 4. RLS-design pr. tabel

Alle tabeller: `ENABLE ROW LEVEL SECURITY`. Mønster pr. tabel (policy-navne som i SQL'en):

| Tabel | Medlem (authenticated) | Advisor | Service role |
|---|---|---|---|
| `content_collections` | SELECT hvor `status='published'` | SELECT alt (inkl. drafts) + INSERT/UPDATE/DELETE | ALL |
| `content_items` | SELECT hvor `status='published'` | SELECT alt + INSERT/UPDATE/DELETE | ALL |
| `member_progress` | ALL på egne rækker (`auth.uid() = user_id`, både USING og WITH CHECK) | SELECT alt (engagement-indsigt) | ALL |
| `partners` | SELECT hvor `status='published'` | SELECT alt + INSERT/UPDATE/DELETE | ALL |
| `events` | SELECT hvor `status IN ('published','cancelled','completed')` (aflysning skal kunne ses) | SELECT alt + INSERT/UPDATE/DELETE | ALL |
| `event_registrations` | SELECT/INSERT/UPDATE egne rækker (INSERT med `WITH CHECK auth.uid() = user_id`; UPDATE til afmelding) | SELECT alt (deltagerlister) | ALL |

Noter:
- Medlemslæsning gater på `status`, ikke på dryp (B6) — dryp filtreres i app-laget i V1.
- Advisor-skrivning bruger `public.has_role(auth.uid(), 'advisor')` — admin arver automatisk.
- Ingen medlems-skriveadgang på indholdstabellerne overhovedet; medlemmers eneste skrivning
  er `member_progress` og `event_registrations` (self-only).
- `event_registrations` har bevidst ingen medlems-DELETE: afmelding er `cancelled_at`-UPDATE.

### Storage (bucket `content-assets`)

Privat bucket (`public = false` — modsat chat-attachments-fejlen). Path-konvention:
`covers/<item-uuid>/...`, `templates/<item-uuid>/<filnavn>`, `partners/<partner-uuid>/...`.

| Operation | Hvem | Prædikat |
|---|---|---|
| SELECT | authenticated | `bucket_id = 'content-assets'` — nødvendigt for `createSignedUrl()`; selve udleveringen sker KUN som signeret URL med udløb |
| INSERT/UPDATE/DELETE | advisor | `bucket_id = 'content-assets' AND has_role(auth.uid(), 'advisor')` |

Fordi storage-policies OR-stakker, indeholder hver policy bucket-checket i samme prædikat —
der oprettes ALDRIG en policy uden bucket-check. Videoer rører aldrig denne bucket (Bunny,
leverance 3).

### Konsekvenser for SECURITY_BASELINE.md (samme PR som migrationen)

- §5 udvides med det nye mønster "Platform-global content (authenticated read published)".
- Storage-afsnittet (§9) udvides med `content-assets`-bucketens policy-map.
- `member_progress`/`event_registrations` føjes til self-only-listen.

---

## 5. Migrations-SQL (fuld længde — KØRES IKKE endnu)

Foreslået filnavn: `supabase/migrations/<timestamp>_hjemmebane_content_layer.sql`

```sql
-- Migration: hjemmebane_content_layer
-- Sprint C0 (Projekt Hjemmebane) — indholdslaget til Circle-exit.
-- Opretter: content_collections, content_items, member_progress, partners,
--           events, event_registrations + privat storage-bucket 'content-assets'.
-- RLS: platform-globalt indhold (authenticated læser published, advisors skriver,
--      service role alt); progress/tilmeldinger er self-only.
-- Dryp (drip_after_days) håndhæves i app-laget i V1 — bevidst, se c0-datamodel.md B6.
-- DEPLOY: køres manuelt i Lovable -> SQL editor efter merge (auto-deploy findes ikke
-- for migrationer). Baseline-dokumentet opdateres i samme PR.
-- FØR DEPLOY — verificér baseline-påstanden om RESTRICTIVE-policies mod live-state:
--   SELECT c.relname, p.polname, p.polpermissive
--   FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
--   ORDER BY c.relname, p.polname;
-- (polpermissive = true → permissiv/OR-stak, som denne migrations policies antager.)

-- ─────────────────────────────────────────────────────────────────────────
-- 1. content_collections — sektioner, kurser, moduler, kategorier
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE public.content_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area TEXT NOT NULL
    CHECK (area IN ('classroom', 'academy', 'skabeloner', 'talks', 'quick_wins', 'start_her')),
  parent_id UUID REFERENCES public.content_collections(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  cover_path TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  drip_after_days INTEGER,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.content_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view published collections"
  ON public.content_collections FOR SELECT
  TO authenticated
  USING (status = 'published');

CREATE POLICY "Advisors can view all collections"
  ON public.content_collections FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can insert collections"
  ON public.content_collections FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can update collections"
  ON public.content_collections FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can delete collections"
  ON public.content_collections FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Service role can manage collections"
  ON public.content_collections FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_content_collections_area_position
  ON public.content_collections(area, status, position);

CREATE INDEX idx_content_collections_parent
  ON public.content_collections(parent_id, position);

CREATE TRIGGER set_content_collections_updated_at
  BEFORE UPDATE ON public.content_collections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. partners — rabataftaler (oprettes før content_items pga. FK)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  discount_text TEXT NOT NULL,
  redemption_type TEXT NOT NULL
    CHECK (redemption_type IN ('kode', 'link', 'kontakt')),
  redemption_code TEXT,
  redemption_url TEXT,
  redemption_contact TEXT,
  logo_path TEXT,
  website_url TEXT,
  valid_until DATE,
  position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- indløsningsfeltet skal matche indløsningstypen
  CONSTRAINT partners_redemption_matches_type CHECK (
    (redemption_type = 'kode' AND redemption_code IS NOT NULL)
    OR (redemption_type = 'link' AND redemption_url IS NOT NULL)
    OR (redemption_type = 'kontakt' AND redemption_contact IS NOT NULL)
  )
);

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view published partners"
  ON public.partners FOR SELECT
  TO authenticated
  USING (status = 'published');

CREATE POLICY "Advisors can view all partners"
  ON public.partners FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can insert partners"
  ON public.partners FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can update partners"
  ON public.partners FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can delete partners"
  ON public.partners FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Service role can manage partners"
  ON public.partners FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_partners_status_position
  ON public.partners(status, position);

CREATE TRIGGER set_partners_updated_at
  BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────
-- 3. content_items — alt indhold
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE public.content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area TEXT NOT NULL
    CHECK (area IN ('classroom', 'academy', 'skabeloner', 'rabataftaler',
                    'talks', 'quick_wins', 'start_her', 'push')),
  collection_id UUID REFERENCES public.content_collections(id) ON DELETE SET NULL,
  type TEXT NOT NULL
    CHECK (type IN ('video', 'lektion', 'skabelon', 'rabataftale',
                    'episode', 'push_indslag')),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  body TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  drip_after_days INTEGER,
  -- UBRUGT i V1 — til stede jf. plan §5. Ingen CHECK: tier-navne er ikke
  -- besluttet, og ingen kode må læse feltet før tiers indføres.
  tier_visibility TEXT NOT NULL DEFAULT 'all',
  media_provider TEXT NOT NULL DEFAULT 'none'
    CHECK (media_provider IN ('none', 'bunny', 'storage', 'external')),
  bunny_video_id TEXT,
  storage_path TEXT,
  external_url TEXT,
  duration_seconds INTEGER,
  cover_path TEXT,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- medie-referencen skal matche provideren
  CONSTRAINT content_items_media_matches_provider CHECK (
    (media_provider = 'none')
    OR (media_provider = 'bunny' AND bunny_video_id IS NOT NULL)
    OR (media_provider = 'storage' AND storage_path IS NOT NULL)
    OR (media_provider = 'external' AND external_url IS NOT NULL)
  )
);

ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view published content items"
  ON public.content_items FOR SELECT
  TO authenticated
  USING (status = 'published');

CREATE POLICY "Advisors can view all content items"
  ON public.content_items FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can insert content items"
  ON public.content_items FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can update content items"
  ON public.content_items FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can delete content items"
  ON public.content_items FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Service role can manage content items"
  ON public.content_items FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_content_items_area_position
  ON public.content_items(area, status, position);

CREATE INDEX idx_content_items_collection
  ON public.content_items(collection_id, position);

CREATE INDEX idx_content_items_partner
  ON public.content_items(partner_id) WHERE partner_id IS NOT NULL;

CREATE TRIGGER set_content_items_updated_at
  BEFORE UPDATE ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────
-- 4. member_progress — set / kvitteret / sprunget over
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE public.member_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  seen_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  skipped_at TIMESTAMPTZ,
  last_position_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, content_item_id)
);

ALTER TABLE public.member_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own progress"
  ON public.member_progress FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Advisors can view all progress"
  ON public.member_progress FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Service role can manage progress"
  ON public.member_progress FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_member_progress_user
  ON public.member_progress(user_id, updated_at DESC);

CREATE INDEX idx_member_progress_item
  ON public.member_progress(content_item_id);

CREATE TRIGGER set_member_progress_updated_at
  BEFORE UPDATE ON public.member_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────
-- 5. events — Live sparring m.m.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'live_sparring'
    CHECK (kind IN ('live_sparring', 'workshop', 'andet')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  meet_url TEXT,
  capacity INTEGER,
  recording_item_id UUID REFERENCES public.content_items(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Aflyste/afholdte events skal kunne ses af medlemmer (aflysningsbesked,
-- link til optagelse) — kun drafts er skjult.
CREATE POLICY "Members can view non-draft events"
  ON public.events FOR SELECT
  TO authenticated
  USING (status IN ('published', 'cancelled', 'completed'));

CREATE POLICY "Advisors can view all events"
  ON public.events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can insert events"
  ON public.events FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can update events"
  ON public.events FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can delete events"
  ON public.events FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Service role can manage events"
  ON public.events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_events_starts_at
  ON public.events(status, starts_at);

CREATE TRIGGER set_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────
-- 6. event_registrations — tilmeldinger
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE public.event_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  UNIQUE(event_id, user_id)
);

ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own registrations"
  ON public.event_registrations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can register themselves"
  ON public.event_registrations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Afmelding = cancelled_at-UPDATE; ingen medlems-DELETE (kapacitetshistorik).
CREATE POLICY "Users can update own registrations"
  ON public.event_registrations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Advisors can view all registrations"
  ON public.event_registrations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Service role can manage registrations"
  ON public.event_registrations FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_event_registrations_event
  ON public.event_registrations(event_id);

CREATE INDEX idx_event_registrations_user
  ON public.event_registrations(user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 7. Storage: privat bucket 'content-assets' + policies
-- ─────────────────────────────────────────────────────────────────────────
-- PRIVAT fra dag ét (public = false) — jf. chat-attachments-lektionen.
-- storage.objects-policies er PERMISSIVE (OR-stak), så hver policy bærer
-- selv bucket-checket. Udlevering til medlemmer sker KUN via signerede
-- URL'er (createSignedUrl kræver SELECT-policy'en herunder).
-- Videoer rører aldrig denne bucket — de bor i Bunny Stream.

INSERT INTO storage.buckets (id, name, public)
VALUES ('content-assets', 'content-assets', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Members can read content assets"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'content-assets');

CREATE POLICY "Advisors can upload content assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'content-assets'
    AND public.has_role(auth.uid(), 'advisor')
  );

CREATE POLICY "Advisors can update content assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'content-assets'
    AND public.has_role(auth.uid(), 'advisor')
  );

CREATE POLICY "Advisors can delete content assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'content-assets'
    AND public.has_role(auth.uid(), 'advisor')
  );
```

---

## 6. Afgørelser (truffet af Jonas 2026-08-04 — alle GODKENDT)

1. **B6 GODKENDT — dryp håndhæves i app-laget i V1.** Begrundelse: dryp er pædagogisk
   pacing, ikke sikkerhed — alt indhold er allerede betalt medlemsindhold, så et medlem
   der omgår app-filtreringen ser kun indhold, det har betalt for. Hardening-kandidaten
   (RLS-dryp via SECURITY DEFINER-helper) tilføjes som P4-note i `BACKLOG.md` når
   migrationen committes (C1).
2. **B9 GODKENDT — `meet_url` synlig for alle authenticated.** Begrundelse: medlemskabet
   ER adgangen. Edge function-udlevering (Bucket A) er eskaleringsvejen, hvis deling af
   links misbruges.
3. **Dryp-anker GODKENDT som `company_members.created_at`.** Begrundelse: forløbet
   tilhører medlemskabet (virksomheden), ikke den enkelte login-bruger — flere brugere i
   samme virksomhed skal se samme forløbs-tilstand.
4. **RESTRICTIVE-verifikation GODKENDT:** verifikations-query'en (`pg_policy` joinet med
   `pg_class`, kolonnen `polpermissive`) er indarbejdet i migrationens deploy-note-header
   i afsnit 5 og SKAL køres i Lovable SQL editor før deploy i C1.

---

## 8. Tillæg (2026-08-04, C3-forberedelse): `content_item_attachments`

Recon før C3-migreringen viste, at Circle-lektionens fulde form (video +
vedhæftede filer + links + tekst i ét opslag) ikke kunne repræsenteres i
modellen ovenfor — B5's medie-reference er én provider pr. item, og der fandtes
ingen attachments-relation. Arkitektbeslutning (godkendt): ny tabel
**`content_item_attachments`** — ordnet liste af materialer pr. item (`kind`
∈ `storage`/`link`, label, reference-CHECK der spejler B5-mønstret, position).
RLS følger platform-global-mønstret med én begrundet afvigelse: bilag har ingen
egen status og medlems-SELECT gater derfor på FORÆLDER-itemets
`status='published'` via EXISTS. Filer bor i `content-assets` under
`attachments/<item-uuid>/…`.

Fuld DDL, RLS-begrundelse og deploy-guide: migrationen
`supabase/migrations/20260804210000_content_item_attachments.sql` og
design-blokken `docs/hjemmebane/c3-vedhaeftninger-design.md` (afsnit 3 + 8-9).
Baseline: §5 + §9 opdateret i samme PR.

---

## 9. Tillæg (2026-08-05, lektion→handout-kobling): `content_items.handout_module`

Akademi-lektioner skal kunne linke ind i de interaktive handouts (medlemmets
refleksioner bliver på platformen — ingen dokument-kopier). Arkitektbeslutning
(godkendt, jf. hb-handouts-recon §4): dedikeret nullable kolonne
**`content_items.handout_module`** med CHECK der spejler `handouts.module`-
CHECK'en (fem værdier) — IKKE en attachments-kind (ville kræve dobbelt
CHECK-udvidelse + tredje render-gren) og IKKE metadata-jsonb (ingen
integritet). INGEN FK: handout-definitionerne er kode
(`src/lib/handoutConfig.ts`), ikke rækker — der findes ingen definitions-
tabel at referere. NULL = ingen kobling. RLS uændret (kolonnen arver
content_items' policies; medlemsstatus læses via handouts' self-only SELECT
gennem `getOwnHandout` i akademiApi). Fase 1 er envejs (lektion→handout);
omvendt visning er BACKLOG.

Fuld DDL og deploy-guide: migrationen
`supabase/migrations/20260805120000_content_items_handout_module.sql`.

---

*C0-leverance 2 · Projekt Hjemmebane · 2026-08-04 · SQL er design — intet er kørt.*

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

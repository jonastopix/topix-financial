-- Community: forum light med ét feed — datamodellen.
--
-- KUN tabeller, RLS, indekser og kommentarer. Ingen frontend, ingen edge
-- functions, ingen RPC'er, ingen triggere: antal_svar, antal_visninger og
-- sidste_svar_at er denormaliserede caches og vedligeholdes af SKRIVESTIEN.
--
-- RLS-mønstret er genbrugt ORDRET fra huset (20260804120000_hjemmebane_
-- content_layer.sql): status-gatet fælles SELECT som events, self-scoped
-- INSERT/UPDATE som event_registrations, ingen medlems-DELETE på indhold
-- (skjul via status = soft-cancel-princippet), advisor-bred adgang via
-- public.has_role(auth.uid(), 'advisor'). Ingen policies for anon.
--
-- Rent additiv: ingen backfill, ingen ændring af eksisterende tabeller,
-- ingen DROP. Idempotent: IF NOT EXISTS på tabeller og indekser,
-- pg_policies-eksistens-tjek på policies (CREATE POLICY har ikke
-- IF NOT EXISTS).
--
-- Deploy: køres MANUELT i Lovable -> SQL editor efter merge (jf. CLAUDE.md).
-- Verificér efter kørsel med:
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND tablename LIKE 'community_%'
--   ORDER BY tablename, policyname;

-- ─────────────────────────────────────────────────────────────────────────
-- 1) community_traade — trådene i det ene feed
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_traade (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forfatter_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titel           text NOT NULL,
  indhold         text NOT NULL,
  kilde_type      text
    CONSTRAINT community_traade_kilde_type_check
    CHECK (kilde_type IN ('content_item', 'event')),
  kilde_item_id   uuid REFERENCES public.content_items(id) ON DELETE SET NULL,
  kilde_event_id  uuid REFERENCES public.events(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'aktiv'
    CONSTRAINT community_traade_status_check
    CHECK (status IN ('aktiv', 'skjult', 'slettet')),
  fastgjort       boolean NOT NULL DEFAULT false,
  antal_svar      integer NOT NULL DEFAULT 0,
  antal_visninger integer NOT NULL DEFAULT 0,
  sidste_svar_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Kilde-felterne hænger sammen: ingen kilde = begge id'er NULL; en kilde
  -- peger på præcis den ene tabel dens type siger. Push er IKKE en egen
  -- tabel — ugens push bor i content_items med area='push', så et
  -- push-indslag refereres som content_item. Præcedens for
  -- kryds-referencen er events.recording_item_id → content_items(id).
  CONSTRAINT community_traade_kilde_check CHECK (
    (kilde_type IS NULL AND kilde_item_id IS NULL AND kilde_event_id IS NULL)
    OR (kilde_type = 'content_item' AND kilde_item_id IS NOT NULL AND kilde_event_id IS NULL)
    OR (kilde_type = 'event' AND kilde_event_id IS NOT NULL AND kilde_item_id IS NULL)
  )
);

COMMENT ON TABLE public.community_traade IS
  'Community-tråde (forum light, ét feed). Skjul/sletning sker via status — rækker fjernes aldrig af medlemmer. antal_svar, antal_visninger og sidste_svar_at er denormaliserede caches, der vedligeholdes af skrivestien (ingen triggere).';
COMMENT ON COLUMN public.community_traade.kilde_type IS
  'NULL = fri tråd. ''content_item'' eller ''event'' — push er ikke en egen tabel (ugens push bor i content_items med area=''push''), så push-indslag refereres som content_item.';
COMMENT ON COLUMN public.community_traade.kilde_item_id IS
  'Reference til content_items når kilde_type = ''content_item'' (inkl. push-indslag). Præcedens: events.recording_item_id.';
COMMENT ON COLUMN public.community_traade.kilde_event_id IS
  'Reference til events når kilde_type = ''event'' — bruges bl.a. til auto-tråd per live session.';
COMMENT ON COLUMN public.community_traade.status IS
  '''aktiv'' vises i feedet; ''skjult''/''slettet'' er moderation og medlems-soft-delete — ingen fysisk DELETE.';
COMMENT ON COLUMN public.community_traade.fastgjort IS
  'Fastgjorte tråde løftes øverst i feedet.';
COMMENT ON COLUMN public.community_traade.antal_svar IS
  'Denormaliseret cache af antal aktive svar — vedligeholdes af skrivestien.';
COMMENT ON COLUMN public.community_traade.antal_visninger IS
  'Denormaliseret cache af community_visninger (unikke brugere) — vedligeholdes af skrivestien.';
COMMENT ON COLUMN public.community_traade.sidste_svar_at IS
  'Tidspunkt for seneste svar — feedets sorteringsnøgle; vedligeholdes af skrivestien.';

-- Feedet: aktive tråde sorteret efter seneste aktivitet.
CREATE INDEX IF NOT EXISTS idx_community_traade_feed
  ON public.community_traade (status, sidste_svar_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 2) community_svar — svar i én tråd, ét niveau
-- ─────────────────────────────────────────────────────────────────────────

-- Ét niveau. Ingen parent_id, ingen svar på svar: ét niveau er en bevidst
-- begrænsning i forum light — feedet skal kunne læses som en samtale, ikke
-- som et træ.
CREATE TABLE IF NOT EXISTS public.community_svar (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  traad_id     uuid NOT NULL REFERENCES public.community_traade(id) ON DELETE CASCADE,
  forfatter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  indhold      text NOT NULL,
  status       text NOT NULL DEFAULT 'aktiv'
    CONSTRAINT community_svar_status_check
    CHECK (status IN ('aktiv', 'skjult', 'slettet')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.community_svar IS
  'Svar på community-tråde. Ét niveau — ingen parent_id, ingen svar på svar: en bevidst begrænsning i forum light. Skjul/sletning via status; ingen fysisk DELETE for medlemmer.';
COMMENT ON COLUMN public.community_svar.status IS
  '''aktiv'' vises i tråden; ''skjult''/''slettet'' er moderation og medlems-soft-delete.';

-- Trådvisningen: svar i kronologisk rækkefølge pr. tråd.
CREATE INDEX IF NOT EXISTS idx_community_svar_traad
  ON public.community_svar (traad_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────
-- 3) community_reaktioner — én markering pr. bruger pr. objekt
-- ─────────────────────────────────────────────────────────────────────────

-- Samme form som event_registrations' UNIQUE(event_id, user_id) — én
-- markering pr. bruger pr. objekt. CHECK-listen har kun 'like' i dag, så
-- nye typer er en bevidst udvidelse (ny migration), ikke frit tekstfelt.
CREATE TABLE IF NOT EXISTS public.community_reaktioner (
  traad_id   uuid REFERENCES public.community_traade(id) ON DELETE CASCADE,
  svar_id    uuid REFERENCES public.community_svar(id) ON DELETE CASCADE,
  bruger_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       text NOT NULL DEFAULT 'like'
    CONSTRAINT community_reaktioner_type_check
    CHECK (type IN ('like')),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Præcis ét af traad_id/svar_id er sat — aldrig begge, aldrig ingen.
  CONSTRAINT community_reaktioner_maal_check CHECK (
    (traad_id IS NOT NULL AND svar_id IS NULL)
    OR (traad_id IS NULL AND svar_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.community_reaktioner IS
  'Reaktioner på tråde eller svar — præcis ét mål pr. række, én reaktion pr. bruger pr. objekt (partielle UNIQUE-indekser). Kun ''like'' i dag; nye typer er en bevidst udvidelse. Ejeren må slette sin egen reaktion (fortryd et like).';

-- Én reaktion pr. bruger pr. objekt — partielle UNIQUE-indekser, fordi
-- målet er delt over to nullable kolonner.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_community_reaktioner_traad
  ON public.community_reaktioner (traad_id, bruger_id, type)
  WHERE traad_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_community_reaktioner_svar
  ON public.community_reaktioner (svar_id, bruger_id, type)
  WHERE svar_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) community_visninger — hvem har set tråden
-- ─────────────────────────────────────────────────────────────────────────

-- Unik pr. bruger pr. tråd — tælleren er "hvor mange har set", ikke "hvor
-- mange gange". antal_visninger på tråden er en denormaliseret cache af
-- denne tabel og vedligeholdes af skrivestien.
CREATE TABLE IF NOT EXISTS public.community_visninger (
  traad_id  uuid NOT NULL REFERENCES public.community_traade(id) ON DELETE CASCADE,
  bruger_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  set_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (traad_id, bruger_id)
);

COMMENT ON TABLE public.community_visninger IS
  'Én række pr. bruger pr. tråd — "hvor mange har set", ikke "hvor mange gange". community_traade.antal_visninger er en denormaliseret cache af denne tabel og vedligeholdes af skrivestien.';

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.community_traade      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_svar        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reaktioner  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_visninger   ENABLE ROW LEVEL SECURITY;

-- Policies oprettes med eksistens-tjek (idempotent uden DROP).
DO $$
BEGIN
  -- ── community_traade ──
  -- Fælles læsning: alle authenticated ser aktive tråde — samme form som
  -- events' status-gatede SELECT ("Members can view non-draft events").
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'community_traade' AND policyname = 'Members can view active threads') THEN
    CREATE POLICY "Members can view active threads"
      ON public.community_traade FOR SELECT
      TO authenticated
      USING (status = 'aktiv');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'community_traade' AND policyname = 'Members can create own threads') THEN
    CREATE POLICY "Members can create own threads"
      ON public.community_traade FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = forfatter_id);
  END IF;

  -- Skjul sker via status — ingen medlems-DELETE (soft-cancel-princippet
  -- fra event_registrations: "Afmelding = cancelled_at-UPDATE; ingen
  -- medlems-DELETE").
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'community_traade' AND policyname = 'Members can update own threads') THEN
    CREATE POLICY "Members can update own threads"
      ON public.community_traade FOR UPDATE
      TO authenticated
      USING (auth.uid() = forfatter_id)
      WITH CHECK (auth.uid() = forfatter_id);
  END IF;

  -- Moderation: rådgivere (admin arver advisor via has_role) ser og
  -- redigerer alt.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'community_traade' AND policyname = 'Advisors can view all threads') THEN
    CREATE POLICY "Advisors can view all threads"
      ON public.community_traade FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), 'advisor'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'community_traade' AND policyname = 'Advisors can update all threads') THEN
    CREATE POLICY "Advisors can update all threads"
      ON public.community_traade FOR UPDATE
      TO authenticated
      USING (public.has_role(auth.uid(), 'advisor'))
      WITH CHECK (public.has_role(auth.uid(), 'advisor'));
  END IF;

  -- ── community_svar ──
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'community_svar' AND policyname = 'Members can view active replies') THEN
    CREATE POLICY "Members can view active replies"
      ON public.community_svar FOR SELECT
      TO authenticated
      USING (status = 'aktiv');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'community_svar' AND policyname = 'Members can create own replies') THEN
    CREATE POLICY "Members can create own replies"
      ON public.community_svar FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = forfatter_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'community_svar' AND policyname = 'Members can update own replies') THEN
    CREATE POLICY "Members can update own replies"
      ON public.community_svar FOR UPDATE
      TO authenticated
      USING (auth.uid() = forfatter_id)
      WITH CHECK (auth.uid() = forfatter_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'community_svar' AND policyname = 'Advisors can view all replies') THEN
    CREATE POLICY "Advisors can view all replies"
      ON public.community_svar FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), 'advisor'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'community_svar' AND policyname = 'Advisors can update all replies') THEN
    CREATE POLICY "Advisors can update all replies"
      ON public.community_svar FOR UPDATE
      TO authenticated
      USING (public.has_role(auth.uid(), 'advisor'))
      WITH CHECK (public.has_role(auth.uid(), 'advisor'));
  END IF;

  -- ── community_reaktioner ──
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'community_reaktioner' AND policyname = 'Members can react themselves') THEN
    CREATE POLICY "Members can react themselves"
      ON public.community_reaktioner FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = bruger_id);
  END IF;

  -- Man skal kunne fortryde et like — reaktioner må slettes af ejeren selv
  -- (modsat tråde/svar, hvor skjul sker via status).
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'community_reaktioner' AND policyname = 'Members can delete own reactions') THEN
    CREATE POLICY "Members can delete own reactions"
      ON public.community_reaktioner FOR DELETE
      TO authenticated
      USING (auth.uid() = bruger_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'community_reaktioner' AND policyname = 'Advisors can view all reactions') THEN
    CREATE POLICY "Advisors can view all reactions"
      ON public.community_reaktioner FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), 'advisor'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'community_reaktioner' AND policyname = 'Advisors can update all reactions') THEN
    CREATE POLICY "Advisors can update all reactions"
      ON public.community_reaktioner FOR UPDATE
      TO authenticated
      USING (public.has_role(auth.uid(), 'advisor'))
      WITH CHECK (public.has_role(auth.uid(), 'advisor'));
  END IF;

  -- ── community_visninger ──
  -- SELECT kun egne rækker; ingen UPDATE, ingen DELETE — set_at er første
  -- visning, og tælleren på tråden er skrivestiens ansvar.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'community_visninger' AND policyname = 'Members can view own views') THEN
    CREATE POLICY "Members can view own views"
      ON public.community_visninger FOR SELECT
      TO authenticated
      USING (auth.uid() = bruger_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'community_visninger' AND policyname = 'Members can record own views') THEN
    CREATE POLICY "Members can record own views"
      ON public.community_visninger FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = bruger_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'community_visninger' AND policyname = 'Advisors can view all views') THEN
    CREATE POLICY "Advisors can view all views"
      ON public.community_visninger FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), 'advisor'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'community_visninger' AND policyname = 'Advisors can update all views') THEN
    CREATE POLICY "Advisors can update all views"
      ON public.community_visninger FOR UPDATE
      TO authenticated
      USING (public.has_role(auth.uid(), 'advisor'))
      WITH CHECK (public.has_role(auth.uid(), 'advisor'));
  END IF;
END $$;

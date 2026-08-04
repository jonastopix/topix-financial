-- Migration: content_item_attachments
-- C3-forberedelse (Projekt Hjemmebane) — vedhæftninger/materialer på items,
-- så Circle-lektionens form (video + filer + links + tekst) kan migreres 1:1.
-- Jf. designbeslutning 2026-08-04: ny relation; hverken metadata-JSONB eller
-- søster-items. RLS: platform-global content-mønster; medlems-SELECT gater på
-- FORÆLDER-itemets published-status via EXISTS (bilag har bevidst ingen egen
-- status — de følger deres lektion). Ingen kladde-bilag lækker.
-- Filer bor i eksisterende privat bucket 'content-assets' under
-- attachments/<item-uuid>/... — ingen nye storage-policies.
-- DEPLOY: køres manuelt i Lovable -> SQL editor efter merge (migrationer
-- auto-deployer aldrig). Verifikations-query FØR og bevis-query EFTER står i
-- deploy-guiden: docs/hjemmebane/c3-vedhaeftninger-design.md, afsnit 9.

CREATE TABLE public.content_item_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK (kind IN ('storage', 'link')),
  label TEXT NOT NULL,
  storage_path TEXT,
  external_url TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- referencen skal matche typen (spejler content_items_media_matches_provider)
  CONSTRAINT content_item_attachments_ref_matches_kind CHECK (
    (kind = 'storage' AND storage_path IS NOT NULL)
    OR (kind = 'link' AND external_url IS NOT NULL)
  )
);

ALTER TABLE public.content_item_attachments ENABLE ROW LEVEL SECURITY;

-- Medlemslæsning: KUN bilag på published items — forælder-gated EXISTS
-- (bilag har ingen egen status; content_items' egen RLS gælder desuden
-- inde i subquery'en som dobbelt bund).
CREATE POLICY "Members can view attachments of published items"
  ON public.content_item_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.content_items i
      WHERE i.id = content_item_attachments.item_id
        AND i.status = 'published'
    )
  );

CREATE POLICY "Advisors can view all attachments"
  ON public.content_item_attachments FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can insert attachments"
  ON public.content_item_attachments FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can update attachments"
  ON public.content_item_attachments FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can delete attachments"
  ON public.content_item_attachments FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Service role can manage attachments"
  ON public.content_item_attachments FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_content_item_attachments_item
  ON public.content_item_attachments(item_id, position);

CREATE TRIGGER set_content_item_attachments_updated_at
  BEFORE UPDATE ON public.content_item_attachments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

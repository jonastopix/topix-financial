-- Migration: partners.indhold — rig tekst til rabataftalens punktliste
--
-- Produktbeslutning 13-08-2026 (Jonas): en rabataftale skal kunne vise en
-- punktliste over hvad medlemmet faar — jf. forbilledet fra Circle, hvor
-- Dinero-aftalen har fem konkrete punkter. partners har i dag kun
-- discount_text (kort tekst, NOT NULL) og description (plain textarea).
-- Rig tekst med punktlister findes i dag KUN paa content_items.body.
-- Alternativet var at koble en aftale til et content_item via
-- partner_id — det er FRAVALGT: een aftale ville da bo i to tabeller,
-- raadgiveren skulle oprette to ting og huske at forbinde dem, og
-- halvdelen af aftalerne ville mangle deres anden halvdel. Feltet
-- laegges derfor direkte paa partners.
-- Kolonnen baerer advisor-skrevet HTML fra HbEditorRichtext, praecis som
-- content_items.body, og renderes med prose-hb-klassen (ElementView.tsx
-- :241-244), hvor ul/ol allerede er stylet.
--
-- Rent additiv: kolonnen er NULLABLE uden default — kan ikke bryde
-- eksisterende raekker, partners_redemption_matches_type eller nogen
-- policy. discount_text og description bestaar uaendret.
--
-- Deploy: koeres MANUELT i Lovable -> SQL editor efter merge.
-- Verificér efter koersel med:
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'partners'
--   ORDER BY ordinal_position;

ALTER TABLE public.partners ADD COLUMN indhold TEXT;

COMMENT ON COLUMN public.partners.indhold IS
  'Rig tekst (advisor-skrevet HTML fra HbEditorRichtext) med hvad medlemmet faar — typisk en punktliste. Samme format og samme visning som content_items.body: prose-hb, hvor ul/ol er stylet. NULL = aftalen har kun discount_text og description. Tilfoejet 13-08-2026, da discount_text er én kort linje og description er plain tekst uden formatering.';

-- Community: feed-indekset rettes — NULLS FIRST-fælden og fastgjort.
--
-- Det oprindelige feed-indeks idx_community_traade_feed (status,
-- sidste_svar_at DESC) er forkert. sidste_svar_at er NULL indtil nogen
-- svarer, og i Postgres sorterer DESC med NULLS FIRST som standard — enhver
-- ubesvaret tråd ville ligge over enhver besvaret tråd permanent. Desuden
-- indgår fastgjort slet ikke, selvom fastgjorte tråde skal løftes øverst.
-- Sorteringsnøglen er "seneste aktivitet": svartidspunktet hvis der er et,
-- ellers oprettelsestidspunktet.
--
-- DROP af det gamle indeks er tilladt og tilsigtet — indekset er tomt og
-- har aldrig været brugt. Ingen andre ændringer: tabeller, policies,
-- triggere og øvrige indekser er urørte.
--
-- Deploy: køres MANUELT i Lovable -> SQL editor efter merge (jf. CLAUDE.md).
-- Verificér efter kørsel med:
--   SELECT indexdef FROM pg_indexes
--   WHERE schemaname = 'public' AND indexname = 'idx_community_traade_feed';

DROP INDEX IF EXISTS public.idx_community_traade_feed;

CREATE INDEX IF NOT EXISTS idx_community_traade_feed
  ON public.community_traade (
    status,
    fastgjort DESC,
    (COALESCE(sidste_svar_at, created_at)) DESC
  );

-- Kanonisk feed-sortering — skal matche indekset ovenfor:
--   WHERE status = 'aktiv'
--   ORDER BY fastgjort DESC, COALESCE(sidste_svar_at, created_at) DESC

COMMENT ON COLUMN public.community_traade.sidste_svar_at IS
  'Tidspunkt for seneste aktive svar — vedligeholdes af trigger på community_svar. NULL indtil første svar; feedets sortering bruger derfor COALESCE(sidste_svar_at, created_at), så ubesvarede tråde sorterer på oprettelsestidspunktet i stedet for at ligge øverst via NULLS FIRST.';

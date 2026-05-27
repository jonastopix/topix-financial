-- Lukker advisor-lints 0028/0029 + reel email-kø-misbrugsvektor på de fire
-- pgmq RPC-wrappers (enqueue_email, read_email_batch, delete_email, move_to_dlq).
--
-- Baggrund: original definitions-migration (20260319090407_email_infra.sql,
-- linje 193-205) forsøgte at låse disse til service_role via:
--   REVOKE EXECUTE ... FROM PUBLIC;
--   GRANT  EXECUTE ... TO service_role;
-- Det fjernede PUBLIC-pseudorollens grant, men IKKE de eksplicitte grants som
-- Supabase auto-tildeler anon/authenticated via:
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
-- Live-tilstand før denne migration: public_exec=false, anon_exec=true,
-- auth_exec=true. Reelt åbent for anon-RPC via PostgREST (/rest/v1/rpc/...),
-- og consumer (process-email-queue) validerer ikke payload — anon kunne
-- enqueue arbitrære emails fra theboardroom.dk, læse magic-links/reset-tokens
-- fra auth_emails-køen, eller DoS leveringen.
--
-- Kaldergraf-verifikation (commit-historik): alle 16 call sites på tværs af
-- 13 unikke edge functions bruger service_role-klienter eksplicit bundet til
-- SUPABASE_SERVICE_ROLE_KEY. Frontend: 0 kaldere. Triggers/interne fns: 0
-- kaldere. Andre migrations: 0 kaldere. service_role-grantet fra original-
-- migrationen forbliver intakt, så ingen legitim flow påvirkes.
--
-- Patch: kun REVOKE-statements. Ingen ændring af funktions-kroppe, SECDEF-flag,
-- search_path eller andre privilegier. Argument-signaturerne er kopieret
-- præcist fra de eksisterende REVOKE-statements i email_infra.sql.

REVOKE EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) FROM anon, authenticated;

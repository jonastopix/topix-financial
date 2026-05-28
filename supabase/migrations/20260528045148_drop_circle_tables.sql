-- Drop forladt Circle.so-integration (fase 2).
--
-- Baggrund:
-- PR #34 (commit 36b617e5) fjernede frontend-koden og edge functions
-- (sync-circle, circle-oauth) for Circle.so-integrationen. Denne migration
-- afslutter oprydningen ved at fjerne de 5 datatabeller der ikke længere
-- har nogen læser eller skriver.
--
-- Tabellerne droppes i deterministisk rækkefølge (teknisk ligegyldig — recon
-- bekræftede ingen FK ind eller ud, ingen views/functions, ingen Realtime
-- publication). IF EXISTS gør migrationen idempotent. INGEN CASCADE: hvis
-- en uventet afhængighed dukker op, vil DROP fejle eksplicit i stedet for
-- at maskere problemet ved at rive afhængigheder med ned.
--
-- Triggers (update_circle_members_updated_at, update_circle_course_progress_updated_at)
-- og RLS-policies droppes automatisk sammen med tabellerne. Den delte
-- update_updated_at_column()-funktion bruges af andre tabeller og røres IKKE.
--
-- Lukker Lovable scan-Error "Claim unlinked circle member records" ved at
-- fjerne tabellen som UPDATE-policyen sad på.

DROP TABLE IF EXISTS public.circle_activity;
DROP TABLE IF EXISTS public.circle_course_progress;
DROP TABLE IF EXISTS public.circle_members;
DROP TABLE IF EXISTS public.circle_oauth_codes;
DROP TABLE IF EXISTS public.circle_oauth_tokens;

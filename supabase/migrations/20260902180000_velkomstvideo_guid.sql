-- Velkomstvideoen som platformindstilling: app_config.velkomstvideo_guid.
-- Skrevet 2/9; køres MANUELT i Lovable -> SQL editor (CLAUDE.md —
-- migrationer auto-deployer aldrig). Denne fil er bogføringen.
--
-- BESLUTNING 2/9 (Jonas): velkomsten er en hilsen, ikke undervisning —
-- derfor et felt i platformconfig med et Bunny-video-GUID, ikke et
-- content item i Akademiet. Tomt felt = ingen video = velkomsten er slået
-- fra: overlejringen vises ikke, og punktet «Se velkomsten» udgår af
-- onboarding-tjeklisten («Vi viser ikke tomt indhold»).
--
-- Samme form som session_timeout_minutes (20260317132329): én række,
-- jsonb-værdi, ON CONFLICT DO NOTHING. Værdien er en jsonb-STRENG (""),
-- ikke et objekt — useAppConfig læser den som tekst. Læses af
-- get-video-embed (velkomst-grenen, via kalderens RLS: alle
-- authenticated kan læse app_config) og af useOnboardingTjekliste.
-- Redigeres på /admin/config (admin-only). GUID'et findes i Bunny:
-- Stream -> library boardroom-hjemmebane -> videoen -> Video ID.

INSERT INTO public.app_config (config_key, config_value, description)
VALUES ('velkomstvideo_guid', '""'::jsonb, 'Bunny-video-GUID for velkomstvideoen i onboarding-tjeklisten. Tom streng = ingen video = velkomsten er slået fra.')
ON CONFLICT (config_key) DO NOTHING;

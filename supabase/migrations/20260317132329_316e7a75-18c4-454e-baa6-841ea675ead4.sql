INSERT INTO public.app_config (config_key, config_value, description)
VALUES ('session_timeout_minutes', '30'::jsonb, 'Antal minutter før automatisk logout ved inaktivitet')
ON CONFLICT (config_key) DO NOTHING;

-- App config table for dynamic configuration (key-value store)
CREATE TABLE public.app_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key text NOT NULL UNIQUE,
  config_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Everyone can read config
CREATE POLICY "Anyone authenticated can read config"
ON public.app_config FOR SELECT
TO authenticated
USING (true);

-- Only advisors can modify config
CREATE POLICY "Advisors can insert config"
ON public.app_config FOR INSERT
WITH CHECK (has_role(auth.uid(), 'advisor'::app_role));

CREATE POLICY "Advisors can update config"
ON public.app_config FOR UPDATE
USING (has_role(auth.uid(), 'advisor'::app_role));

CREATE POLICY "Advisors can delete config"
ON public.app_config FOR DELETE
USING (has_role(auth.uid(), 'advisor'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_app_config_updated_at
BEFORE UPDATE ON public.app_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default config values
INSERT INTO public.app_config (config_key, config_value, description) VALUES
  ('performance_score', '{"weights": [0.3, 0.25, 0.25, 0.2], "growthMultiplier": 2, "marginMultiplier": 2, "profitMultiplier": 3, "liquidityMonths": 6, "defaultSalaryFallback": 50000}', 'Vægte og formler til Performance Score'),
  ('gamification', '{"pointsPerReport": 10, "pointsPerMilestone": 25, "levels": [{"threshold": 0, "label": "Starter", "emoji": "🌱"}, {"threshold": 25, "label": "Aktiv", "emoji": "⚡"}, {"threshold": 75, "label": "Dedikeret", "emoji": "🔥"}, {"threshold": 150, "label": "Stjerneelev", "emoji": "⭐"}, {"threshold": 300, "label": "Mester", "emoji": "🏆"}]}', 'Gamification point-system og niveauer'),
  ('branding', '{"name": "The Boardroom", "shortName": "BR", "advisorLabel": "dine rådgivere", "chatPlaceholder": "Skriv direkte til dine rådgivere"}', 'App branding og tekster');

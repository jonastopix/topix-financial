
-- Create handouts table
CREATE TABLE public.handouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module text NOT NULL CHECK (module IN ('overordnet', 'bogholderi', 'administration', 'salg', 'marketing')),
  responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  levers jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  ai_feedback jsonb DEFAULT NULL,
  ai_feedback_at timestamptz DEFAULT NULL,
  completed_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);

-- Create handout_lever_milestones junction table
CREATE TABLE public.handout_lever_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handout_id uuid NOT NULL REFERENCES public.handouts(id) ON DELETE CASCADE,
  lever_index integer NOT NULL,
  milestone_id uuid NOT NULL REFERENCES public.milestones(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (handout_id, lever_index)
);

-- Enable RLS
ALTER TABLE public.handouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handout_lever_milestones ENABLE ROW LEVEL SECURITY;

-- Handouts RLS: members see own, advisors see all
CREATE POLICY "Users can view own handouts"
  ON public.handouts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Advisors can view all handouts"
  ON public.handouts FOR SELECT
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Users can insert own handouts"
  ON public.handouts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own handouts"
  ON public.handouts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Advisors can update all handouts"
  ON public.handouts FOR UPDATE
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Users can delete own handouts"
  ON public.handouts FOR DELETE
  USING (auth.uid() = user_id);

-- Lever milestones RLS
CREATE POLICY "Users can view own lever milestones"
  ON public.handout_lever_milestones FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.handouts WHERE handouts.id = handout_id AND handouts.user_id = auth.uid()
  ));

CREATE POLICY "Advisors can view all lever milestones"
  ON public.handout_lever_milestones FOR SELECT
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Users can insert own lever milestones"
  ON public.handout_lever_milestones FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.handouts WHERE handouts.id = handout_id AND handouts.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own lever milestones"
  ON public.handout_lever_milestones FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.handouts WHERE handouts.id = handout_id AND handouts.user_id = auth.uid()
  ));

-- Updated_at trigger for handouts
CREATE TRIGGER update_handouts_updated_at
  BEFORE UPDATE ON public.handouts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

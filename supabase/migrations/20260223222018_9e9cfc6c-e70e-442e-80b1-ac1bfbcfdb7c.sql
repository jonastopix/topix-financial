
-- Circle.so synced members
CREATE TABLE public.circle_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  circle_id BIGINT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  headline TEXT,
  bio TEXT,
  circle_created_at TIMESTAMP WITH TIME ZONE,
  last_seen_at TIMESTAMP WITH TIME ZONE,
  space_ids JSONB DEFAULT '[]'::jsonb,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.circle_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can view all circle members"
  ON public.circle_members FOR SELECT
  USING (has_role(auth.uid(), 'advisor'::app_role));

CREATE POLICY "Members can view own circle record"
  ON public.circle_members FOR SELECT
  USING (auth.uid() = user_id);

-- Circle.so course progress
CREATE TABLE public.circle_course_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  circle_member_id BIGINT NOT NULL,
  course_id BIGINT NOT NULL,
  course_name TEXT NOT NULL DEFAULT '',
  lessons_completed INT NOT NULL DEFAULT 0,
  lessons_total INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMP WITH TIME ZONE,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(circle_member_id, course_id)
);

ALTER TABLE public.circle_course_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can view all course progress"
  ON public.circle_course_progress FOR SELECT
  USING (has_role(auth.uid(), 'advisor'::app_role));

-- Circle.so community activity (posts, comments)
CREATE TABLE public.circle_activity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  circle_member_id BIGINT NOT NULL,
  activity_type TEXT NOT NULL, -- 'post', 'comment', 'like', 'reaction'
  circle_post_id BIGINT,
  space_name TEXT,
  title TEXT,
  content_preview TEXT,
  activity_at TIMESTAMP WITH TIME ZONE NOT NULL,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.circle_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can view all circle activity"
  ON public.circle_activity FOR SELECT
  USING (has_role(auth.uid(), 'advisor'::app_role));

-- Indexes for efficient lookups
CREATE INDEX idx_circle_members_email ON public.circle_members(email);
CREATE INDEX idx_circle_members_user_id ON public.circle_members(user_id);
CREATE INDEX idx_circle_course_progress_member ON public.circle_course_progress(circle_member_id);
CREATE INDEX idx_circle_activity_member ON public.circle_activity(circle_member_id);
CREATE INDEX idx_circle_activity_at ON public.circle_activity(activity_at DESC);

-- Triggers for updated_at
CREATE TRIGGER update_circle_members_updated_at
  BEFORE UPDATE ON public.circle_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_circle_course_progress_updated_at
  BEFORE UPDATE ON public.circle_course_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

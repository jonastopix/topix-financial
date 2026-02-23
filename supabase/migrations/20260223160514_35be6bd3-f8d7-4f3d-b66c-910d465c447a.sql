
-- Add context columns to messages for rich context-cards
ALTER TABLE public.messages
  ADD COLUMN message_type TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN context_type TEXT,
  ADD COLUMN context_id UUID,
  ADD COLUMN context_meta JSONB;

-- message_type: 'user' (normal), 'system' (AI feedback, activity), 'ai' (AI analysis)
-- context_type: 'report', 'milestone', 'budget', null
-- context_id: references the relevant entity
-- context_meta: { title, status, report_period, etc. } for rendering the card

-- Drop report_comments table since we're unifying into chat
DROP TABLE IF EXISTS public.report_comments;

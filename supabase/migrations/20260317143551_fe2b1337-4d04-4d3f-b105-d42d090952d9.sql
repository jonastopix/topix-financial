
-- ============================================================
-- Feature 1: Edit/Delete own messages
-- Add edited_at to both message tables
-- ============================================================

-- messages table: add edited_at
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at timestamptz DEFAULT NULL;

-- group_messages table: add edited_at
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz DEFAULT NULL;

-- UPDATE policy on messages: own messages only, within 15 minutes
CREATE POLICY "Users can update own messages within 15 min"
ON public.messages
FOR UPDATE
USING (
  sender_id = auth.uid()
  AND message_type = 'user'
  AND created_at > now() - interval '15 minutes'
)
WITH CHECK (
  sender_id = auth.uid()
  AND message_type = 'user'
);

-- DELETE policy on messages: own messages or advisors
CREATE POLICY "Users can delete own messages"
ON public.messages
FOR DELETE
USING (
  sender_id = auth.uid()
  OR public.has_role(auth.uid(), 'advisor'::app_role)
);

-- UPDATE policy on group_messages: own messages only, within 15 minutes
CREATE POLICY "Users can update own group messages within 15 min"
ON public.group_messages
FOR UPDATE
USING (
  sender_id = auth.uid()
  AND message_type = 'user'
  AND created_at > now() - interval '15 minutes'
)
WITH CHECK (
  sender_id = auth.uid()
  AND message_type = 'user'
);

-- DELETE policy on group_messages: own messages or advisors
CREATE POLICY "Users can delete own group messages"
ON public.group_messages
FOR DELETE
USING (
  sender_id = auth.uid()
  OR public.has_role(auth.uid(), 'advisor'::app_role)
);

-- ============================================================
-- Feature 2: Unread marker — track last seen message per conversation
-- ============================================================

CREATE TABLE public.conversation_last_seen (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  conversation_type text NOT NULL DEFAULT 'company',
  last_seen_message_id uuid,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, conversation_id, conversation_type)
);

ALTER TABLE public.conversation_last_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own last_seen"
ON public.conversation_last_seen
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can upsert own last_seen"
ON public.conversation_last_seen
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own last_seen"
ON public.conversation_last_seen
FOR UPDATE
USING (user_id = auth.uid());

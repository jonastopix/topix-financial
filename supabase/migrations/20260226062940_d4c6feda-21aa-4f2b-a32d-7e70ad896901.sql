
ALTER TABLE public.messages ADD COLUMN pinned_at timestamptz DEFAULT NULL;

-- Members can pin/unpin messages in their own conversations
CREATE POLICY "Members can update own conversation messages"
  ON public.messages FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.id = messages.conversation_id
    AND conversations.member_id = auth.uid()
  ));

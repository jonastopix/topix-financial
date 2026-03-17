
-- Create message_reactions table
CREATE TABLE public.message_reactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL,
  message_table text NOT NULL CHECK (message_table IN ('messages', 'group_messages')),
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, message_table, user_id, emoji)
);

-- Enable RLS
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated users can see reactions for messages they can access
CREATE POLICY "Users can view reactions on accessible messages"
  ON public.message_reactions FOR SELECT TO authenticated
  USING (
    (message_table = 'messages' AND EXISTS (
      SELECT 1 FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = message_reactions.message_id
        AND (c.member_id = auth.uid() OR c.company_id = user_company_id(auth.uid()) OR has_role(auth.uid(), 'advisor'))
    ))
    OR
    (message_table = 'group_messages' AND EXISTS (
      SELECT 1 FROM group_messages gm
      WHERE gm.id = message_reactions.message_id
        AND user_can_access_group_conversation(gm.conversation_id)
    ))
  );

-- INSERT: user_id must match auth.uid()
CREATE POLICY "Users can insert own reactions"
  ON public.message_reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- DELETE: only own reactions
CREATE POLICY "Users can delete own reactions"
  ON public.message_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;

-- Allow members to delete messages in their own conversation (for report cascade delete)
CREATE POLICY "Members can delete own conversation messages"
ON public.messages
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.id = messages.conversation_id
    AND conversations.member_id = auth.uid()
  )
);

-- Allow advisors to delete messages
CREATE POLICY "Advisors can delete messages"
ON public.messages
FOR DELETE
USING (has_role(auth.uid(), 'advisor'::app_role));
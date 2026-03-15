
-- Phase D: Group Chat tables, RLS, triggers, grants, backfill

-- 1. Tables
CREATE TABLE public.group_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL UNIQUE REFERENCES public.groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.group_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  message_type text NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_group_messages_conv_created
  ON public.group_messages(conversation_id, created_at DESC);

-- 2. Enable RLS
ALTER TABLE public.group_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

-- 3. Explicit table GRANTs
GRANT SELECT ON public.group_conversations TO authenticated;
GRANT SELECT, INSERT ON public.group_messages TO authenticated;

-- 4. RLS helper function
CREATE FUNCTION public.user_can_access_group_conversation(_conv_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_conversations gc
    WHERE gc.id = _conv_id
    AND (
      gc.group_id = user_group_id(auth.uid())
      OR advisor_has_group_access(auth.uid(), gc.group_id)
    )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.user_can_access_group_conversation FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_access_group_conversation TO authenticated;

-- 5. RLS policies for group_conversations
CREATE POLICY "Members can view own group conversation"
  ON public.group_conversations FOR SELECT TO authenticated
  USING (group_id = user_group_id(auth.uid()));

CREATE POLICY "Advisors can view accessible group conversations"
  ON public.group_conversations FOR SELECT TO authenticated
  USING (advisor_has_group_access(auth.uid(), group_id));

-- 6. RLS policies for group_messages
CREATE POLICY "Users can view group messages"
  ON public.group_messages FOR SELECT TO authenticated
  USING (user_can_access_group_conversation(conversation_id));

CREATE POLICY "Users can insert group messages"
  ON public.group_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND user_can_access_group_conversation(conversation_id));

-- 7. Immutability trigger (defense-in-depth)
CREATE FUNCTION public.protect_group_message_immutable_fields() RETURNS trigger AS $$
BEGIN
  IF NEW.sender_id IS DISTINCT FROM OLD.sender_id THEN RAISE EXCEPTION 'sender_id is immutable'; END IF;
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN RAISE EXCEPTION 'conversation_id is immutable'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path TO 'public';

CREATE TRIGGER trg_protect_group_message_fields
  BEFORE UPDATE ON public.group_messages FOR EACH ROW
  EXECUTE FUNCTION public.protect_group_message_immutable_fields();

-- 8. Auto-create trigger for new groups
CREATE FUNCTION public.create_group_conversation() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.group_conversations (group_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER trg_create_group_conversation
  AFTER INSERT ON public.groups FOR EACH ROW
  EXECUTE FUNCTION public.create_group_conversation();

-- 9. Backfill existing groups
INSERT INTO public.group_conversations (group_id)
SELECT g.id FROM public.groups g
WHERE NOT EXISTS (SELECT 1 FROM public.group_conversations gc WHERE gc.group_id = g.id);

-- 10. Enable realtime for group_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;

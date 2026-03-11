
-- Create conversation_notes table (one note per conversation, advisor-only)
CREATE TABLE public.conversation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  UNIQUE(conversation_id)
);

ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;

-- RLS: advisor-only access, enforce updated_by = auth.uid() on writes
CREATE POLICY "Advisors can select notes"
  ON public.conversation_notes FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'advisor'::app_role));

CREATE POLICY "Advisors can insert notes"
  ON public.conversation_notes FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'advisor'::app_role) AND updated_by = auth.uid());

CREATE POLICY "Advisors can update notes"
  ON public.conversation_notes FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'advisor'::app_role))
  WITH CHECK (updated_by = auth.uid());

CREATE POLICY "Advisors can delete notes"
  ON public.conversation_notes FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'advisor'::app_role));

-- Trigger to auto-stamp updated_at and updated_by on insert/update
CREATE OR REPLACE FUNCTION public.stamp_conversation_note_metadata()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_stamp_conversation_note
  BEFORE INSERT OR UPDATE ON public.conversation_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_conversation_note_metadata();

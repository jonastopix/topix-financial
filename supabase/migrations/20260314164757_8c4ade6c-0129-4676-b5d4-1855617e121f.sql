
-- Add screenshot column to feedback
ALTER TABLE public.feedback ADD COLUMN screenshot_path text;

-- Create storage bucket for feedback screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback-screenshots', 'feedback-screenshots', false);

-- Authenticated users can upload to feedback-screenshots
CREATE POLICY "Authenticated users can upload feedback screenshots"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'feedback-screenshots');

-- Advisors can read all feedback screenshots
CREATE POLICY "Advisors can read feedback screenshots"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'feedback-screenshots' AND has_role(auth.uid(), 'advisor'::app_role));

-- Users can read their own feedback screenshots
CREATE POLICY "Users can read own feedback screenshots"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'feedback-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

DELETE FROM public.circle_activity a
USING public.circle_activity b
WHERE a.circle_post_id IS NOT NULL
  AND a.circle_post_id = b.circle_post_id
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_circle_activity_post_id ON public.circle_activity(circle_post_id) WHERE circle_post_id IS NOT NULL;
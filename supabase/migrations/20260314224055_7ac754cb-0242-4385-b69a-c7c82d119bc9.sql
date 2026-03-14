-- Smoke test: Execute create_group as postgres (service-role equivalent)
-- This tests the full RPC happy path with anchor dedup
DO $$
DECLARE
  _result jsonb;
BEGIN
  SELECT public.create_group(
    'ee3438f1-bfa1-4bb9-acca-0f5b30a7a88f'::uuid,
    'Test Koncern Smoke'::text,
    '[{"mode": "attach", "company_id": "7b0056eb-1498-439b-ac3b-0f8e96e83cdd"}]'::jsonb
  ) INTO _result;
  RAISE NOTICE 'create_group result: %', _result;
END $$;
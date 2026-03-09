

## Plan: Create test member and conversation for Topix Test ApS

Run a single migration to insert:

1. **company_member** — link user `229122f6-b36b-40f0-bf63-55de408fc1e3` ("Jonas test virksomhed", jonas+test14@topix.dk) to company `927a4f36-748d-4326-9259-bff940da7e3d` as role `member`
2. **conversation** — create a conversation for this company with `member_id` set to the same user

```sql
INSERT INTO public.company_members (company_id, user_id, role)
VALUES ('927a4f36-748d-4326-9259-bff940da7e3d', '229122f6-b36b-40f0-bf63-55de408fc1e3', 'member')
ON CONFLICT DO NOTHING;

INSERT INTO public.conversations (member_id, company_id)
VALUES ('229122f6-b36b-40f0-bf63-55de408fc1e3', '927a4f36-748d-4326-9259-bff940da7e3d');
```

After this, you can log in as jonas+test14@topix.dk and send a message from the Topix Test ApS chat to test Slack notifications.


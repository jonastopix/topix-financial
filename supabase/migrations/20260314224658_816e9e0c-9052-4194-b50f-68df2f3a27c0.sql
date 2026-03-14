-- Cleanup E2E smoke test data
DELETE FROM group_advisor_access WHERE group_id = '2b0a9a9b-c6bc-42ce-b793-93126e31ce0f';
DELETE FROM group_companies WHERE group_id = '2b0a9a9b-c6bc-42ce-b793-93126e31ce0f';
DELETE FROM group_memberships WHERE group_id = '2b0a9a9b-c6bc-42ce-b793-93126e31ce0f';
DELETE FROM groups WHERE id = '2b0a9a9b-c6bc-42ce-b793-93126e31ce0f';
-- Remove the company_members row created by RPC for Jonas (advisor shouldn't have one)
DELETE FROM company_members WHERE user_id = '23e81de4-db14-40b6-92ed-0d84ed3c71f1' AND company_id = '82ae3ec6-9d5c-44d4-9d64-2a64eb45ab89';
-- Remove the test company
DELETE FROM companies WHERE id = '82ae3ec6-9d5c-44d4-9d64-2a64eb45ab89';
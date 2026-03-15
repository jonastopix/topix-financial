-- Pre-clean: remove any prior test data for the fixed group id
DELETE FROM group_advisor_access WHERE group_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
DELETE FROM group_companies WHERE group_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
DELETE FROM group_memberships WHERE group_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
DELETE FROM group_messages WHERE conversation_id IN (
  SELECT id FROM group_conversations WHERE group_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
);
DELETE FROM group_conversations WHERE group_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
DELETE FROM groups WHERE id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

-- Seed: minimal test group for Phase D QA
INSERT INTO groups (id, name, owner_user_id, anchor_company_id)
VALUES (
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'Test Koncern (Phase D QA)',
  '7f1a05ce-53e7-4922-b983-636b2db50b83',
  '927a4f36-748d-4326-9259-bff940da7e3d'
);

INSERT INTO group_memberships (group_id, user_id, role)
VALUES ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', '7f1a05ce-53e7-4922-b983-636b2db50b83', 'owner');

INSERT INTO group_companies (group_id, company_id, sort_order)
VALUES ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', '927a4f36-748d-4326-9259-bff940da7e3d', 0);

INSERT INTO group_advisor_access (group_id, advisor_user_id)
VALUES ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', '23e81de4-db14-40b6-92ed-0d84ed3c71f1');
-- Final cleanup: remove E2E Final Smoke test data + feature flag
DELETE FROM group_advisor_access WHERE group_id = 'b8798c78-4951-4fdc-909f-8e944e427091';
DELETE FROM group_companies WHERE group_id = 'b8798c78-4951-4fdc-909f-8e944e427091';
DELETE FROM group_memberships WHERE group_id = 'b8798c78-4951-4fdc-909f-8e944e427091';
DELETE FROM groups WHERE id = 'b8798c78-4951-4fdc-909f-8e944e427091';
DELETE FROM company_members WHERE user_id = '23e81de4-db14-40b6-92ed-0d84ed3c71f1' AND company_id = '5900f9cb-314f-4295-8ecb-769a0522e4d4';
DELETE FROM companies WHERE id = '5900f9cb-314f-4295-8ecb-769a0522e4d4';
DELETE FROM group_feature_flags WHERE user_id = '23e81de4-db14-40b6-92ed-0d84ed3c71f1';
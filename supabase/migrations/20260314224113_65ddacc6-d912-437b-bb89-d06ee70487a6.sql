-- Cleanup smoke test data so we can re-test dedup
DELETE FROM group_advisor_access WHERE group_id = 'cbb5f9be-f9ff-43a3-8ed6-d98b2858dc98';
DELETE FROM group_companies WHERE group_id = 'cbb5f9be-f9ff-43a3-8ed6-d98b2858dc98';
DELETE FROM group_memberships WHERE group_id = 'cbb5f9be-f9ff-43a3-8ed6-d98b2858dc98';
DELETE FROM groups WHERE id = 'cbb5f9be-f9ff-43a3-8ed6-d98b2858dc98';
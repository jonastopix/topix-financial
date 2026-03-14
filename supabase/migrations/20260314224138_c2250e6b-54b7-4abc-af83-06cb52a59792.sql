-- Cleanup: remove smoke test group and feature flag
DELETE FROM group_advisor_access WHERE group_id = 'eb614049-97dc-4dcb-94b5-298615f2ffb6';
DELETE FROM group_companies WHERE group_id = 'eb614049-97dc-4dcb-94b5-298615f2ffb6';
DELETE FROM group_memberships WHERE group_id = 'eb614049-97dc-4dcb-94b5-298615f2ffb6';
DELETE FROM groups WHERE id = 'eb614049-97dc-4dcb-94b5-298615f2ffb6';
DELETE FROM group_feature_flags WHERE user_id = 'ee3438f1-bfa1-4bb9-acca-0f5b30a7a88f';
-- Temporarily allow ops field updates, then reset resolved conversations to open
SET LOCAL app.allow_conversation_ops_update = '1';

UPDATE conversations
SET conversation_status = 'open',
    resolved_at = NULL,
    resolved_by_advisor_id = NULL
WHERE conversation_status = 'resolved';
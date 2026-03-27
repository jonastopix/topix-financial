

## Problem

When deleting "Jonas tests virksomhed", the delete fails with:
> "update or delete on table 'companies' violates foreign key constraint 'financial_reports_company_id_fkey' on table 'financial_reports'"

The `handleDeleteCompany` function in `src/pages/Members.tsx` (line 650) only **soft-deletes** financial reports (sets `deleted_at` timestamp) but does **not** actually remove the rows. When it then tries to hard-delete the company (line 670), the FK constraint blocks it because `financial_reports` rows still reference the company.

Other companies you deleted successfully simply had no financial reports, so the FK constraint was never triggered.

## Additional Missing Cleanup

Several other tables with `company_id` FK references are not cleaned up before the company delete:
- `financial_report_facts`
- `financial_commentaries`
- `advisor_notifications`
- `group_companies`
- `slack_conversation_threads`
- `slack_notification_log`

## Fix — Single File Change

**File:** `src/pages/Members.tsx`

In `handleDeleteCompany`, change the cleanup to:

1. **Hard-delete** `financial_report_facts` where `company_id` matches (must go before reports)
2. **Hard-delete** `financial_commentaries` where `company_id` matches
3. **Hard-delete** `financial_reports` instead of soft-delete (change `.update(...)` to `.delete()`)
4. Add cleanup for `advisor_notifications`, `group_companies`, and slack log tables

The updated Promise.all block would look roughly like:

```
await Promise.all([
  supabase.from("financial_commentaries").delete().eq("company_id", id),
  supabase.from("financial_report_facts").delete().eq("company_id", id),
  supabase.from("advisor_notifications").delete().eq("company_id", id),
]);

await supabase.from("financial_reports").delete().eq("company_id", id);

// ...existing handouts, milestones, budgets, kpis, invitations cleanup...
// ...existing conversations + messages cleanup...
// ...existing company_members cleanup...
// ...then company delete
```

Order matters: facts and commentaries reference reports, so they must be deleted first. Reports must be hard-deleted before the company.

## RLS Consideration

The `financial_report_facts`, `financial_commentaries`, and `advisor_notifications` tables currently have **no DELETE policies** for advisors. We need a migration to add DELETE policies so the advisor can clean up these rows:

```sql
CREATE POLICY "Advisors can delete facts" ON public.financial_report_facts
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can delete commentaries" ON public.financial_commentaries
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can delete notifications" ON public.advisor_notifications
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'advisor'));
```

## Summary of Changes

| What | Where |
|------|-------|
| Hard-delete reports + related data before company | `src/pages/Members.tsx` |
| Add DELETE RLS policies for advisor on 3 tables | New migration |


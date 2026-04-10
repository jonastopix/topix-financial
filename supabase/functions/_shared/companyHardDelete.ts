async function mustSucceed<T extends { error?: { message?: string } | null }>(
  operation: Promise<T>,
  step: string,
) {
  const result = await operation;
  if (result?.error) {
    throw new Error(`${step}: ${result.error.message || 'Ukendt fejl'}`);
  }
  return result;
}

export async function hardDeleteCompany(
  adminSupabase: any,
  companyId: string,
  options?: { deleteUsers?: boolean; preserveInvitations?: boolean },
) {
  const deleteUsers = options?.deleteUsers ?? false;
  const preserveInvitations = options?.preserveInvitations ?? false;

  const { data: anchoredGroup, error: anchoredGroupError } = await adminSupabase
    .from('groups')
    .select('id')
    .eq('anchor_company_id', companyId)
    .maybeSingle();

  if (anchoredGroupError) {
    throw new Error(`Kunne ikke tjekke koncernforankring: ${anchoredGroupError.message}`);
  }

  if (anchoredGroup?.id) {
    throw new Error('Virksomheden kan ikke slettes, fordi den er ankervirksomhed i en koncern');
  }

  const { data: members, error: membersError } = await adminSupabase
    .from('company_members')
    .select('user_id')
    .eq('company_id', companyId);

  if (membersError) {
    throw new Error(`Kunne ikke hente virksomhedens medlemmer: ${membersError.message}`);
  }

  const userIds = [...new Set((members || []).map((member: any) => member.user_id).filter(Boolean))];

  const { data: handouts, error: handoutsError } = await adminSupabase
    .from('handouts')
    .select('id')
    .eq('company_id', companyId);

  if (handoutsError) {
    throw new Error(`Kunne ikke hente handouts: ${handoutsError.message}`);
  }

  const handoutIds = (handouts || []).map((handout: any) => handout.id);
  if (handoutIds.length > 0) {
    await mustSucceed(
      adminSupabase.from('handout_lever_milestones').delete().in('handout_id', handoutIds),
      'Kunne ikke slette handout-links',
    );
  }

  const { data: conversations, error: conversationsError } = await adminSupabase
    .from('conversations')
    .select('id')
    .eq('company_id', companyId);

  if (conversationsError) {
    throw new Error(`Kunne ikke hente samtaler: ${conversationsError.message}`);
  }

  const conversationIds = (conversations || []).map((conversation: any) => conversation.id);

  await mustSucceed(adminSupabase.from('financial_commentaries').delete().eq('company_id', companyId), 'Kunne ikke slette financial_commentaries');
  await mustSucceed(adminSupabase.from('financial_report_facts').delete().eq('company_id', companyId), 'Kunne ikke slette financial_report_facts');
  await mustSucceed(adminSupabase.from('advisor_notifications').delete().eq('company_id', companyId), 'Kunne ikke slette advisor_notifications');
  await mustSucceed(adminSupabase.from('slack_conversation_threads').delete().eq('company_id', companyId), 'Kunne ikke slette slack_conversation_threads');
  await mustSucceed(adminSupabase.from('slack_notification_log').delete().eq('company_id', companyId), 'Kunne ikke slette slack_notification_log');
  await mustSucceed(adminSupabase.from('slack_handout_notification_log').delete().eq('company_id', companyId), 'Kunne ikke slette slack_handout_notification_log');
  await mustSucceed(adminSupabase.from('slack_report_notification_log').delete().eq('company_id', companyId), 'Kunne ikke slette slack_report_notification_log');
  await mustSucceed(adminSupabase.from('group_companies').delete().eq('company_id', companyId), 'Kunne ikke slette group_companies');
  await mustSucceed(adminSupabase.from('company_actions').delete().eq('company_id', companyId), 'Kunne ikke slette company_actions');
  await mustSucceed(adminSupabase.from('notifications').delete().eq('company_id', companyId), 'Kunne ikke slette notifications');
  await mustSucceed(adminSupabase.from('weekly_focus').delete().eq('company_id', companyId), 'Kunne ikke slette weekly_focus');
  await mustSucceed(adminSupabase.from('kpi_chart_comments').delete().eq('company_id', companyId), 'Kunne ikke slette kpi_chart_comments');
  await mustSucceed(adminSupabase.from('legat_enrollments').delete().eq('company_id', companyId), 'Kunne ikke slette legat_enrollments');
  await mustSucceed(adminSupabase.from('financial_reports').delete().eq('company_id', companyId), 'Kunne ikke slette financial_reports');
  await mustSucceed(adminSupabase.from('handouts').delete().eq('company_id', companyId), 'Kunne ikke slette handouts');
  await mustSucceed(adminSupabase.from('milestones').delete().eq('company_id', companyId), 'Kunne ikke slette milestones');
  await mustSucceed(adminSupabase.from('budget_targets').delete().eq('company_id', companyId), 'Kunne ikke slette budget_targets');
  await mustSucceed(adminSupabase.from('kpi_targets').delete().eq('company_id', companyId), 'Kunne ikke slette kpi_targets');
  await mustSucceed(adminSupabase.from('kpi_benchmarks').delete().eq('company_id', companyId), 'Kunne ikke slette kpi_benchmarks');
  await mustSucceed(adminSupabase.from('feedback').delete().eq('company_id', companyId), 'Kunne ikke slette feedback');
  await mustSucceed(adminSupabase.from('advisor_session_notes').delete().eq('company_id', companyId), 'Kunne ikke slette advisor_session_notes');
  await mustSucceed(adminSupabase.from('pulse_checkins').delete().eq('company_id', companyId), 'Kunne ikke slette pulse_checkins');

  if (preserveInvitations) {
    await mustSucceed(
      adminSupabase.from('company_invitations').update({ company_id: null }).eq('company_id', companyId),
      'Kunne ikke frakoble company_invitations',
    );
  } else {
    await mustSucceed(adminSupabase.from('company_invitations').delete().eq('company_id', companyId), 'Kunne ikke slette company_invitations');
  }

  if (conversationIds.length > 0) {
    await mustSucceed(adminSupabase.from('messages').delete().in('conversation_id', conversationIds), 'Kunne ikke slette messages');
  }

  await mustSucceed(adminSupabase.from('conversations').delete().eq('company_id', companyId), 'Kunne ikke slette conversations');
  await mustSucceed(adminSupabase.from('company_members').delete().eq('company_id', companyId), 'Kunne ikke slette company_members');

  if (deleteUsers) {
    for (const userId of userIds) {
      await mustSucceed(adminSupabase.from('profiles').delete().eq('user_id', userId), `Kunne ikke slette profil for ${userId}`);
      await mustSucceed(adminSupabase.from('user_login_log').delete().eq('user_id', userId), `Kunne ikke slette loginlog for ${userId}`);

      const { error: authDeleteError } = await adminSupabase.auth.admin.deleteUser(userId);
      if (authDeleteError) {
        console.warn(`[hardDeleteCompany] Could not delete auth user ${userId}:`, authDeleteError.message);
      }
    }
  }

  await mustSucceed(adminSupabase.from('companies').delete().eq('id', companyId), 'Kunne ikke slette companies');

  return { userIds, conversationIds, handoutIds };
}
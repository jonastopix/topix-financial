// hardDeleteCompany — admin-vejen der sletter en virksomhed HELT (rækken
// inklusive). Kaldes fra manage-advisor cleanup-shells (deleteUsers +
// preserveInvitations) og admin-cleanup-test-data hard_delete_company.
// Hb's vej (slet-medlemsdata-cron) er en anden: den tømmer rækken og
// bevarer bilaget. Denne fil er testvirksomheder og skaller.
//
// LÆKAGEN (recon 13/9, ~/Downloads/recon-efterladenskaberne.md 0.3-0.4):
// prod-målingen 13/9 kl. 16:53 fandt 129 filer i financial-documents uden
// ejer og fire auth-konti uden profil/medlemskab. Begge kom herfra:
//   (a) financial_reports-rækkerne blev slettet, men filerne i
//       financial-documents/<company_id>/… og company-logos/<company_id>/
//       blev aldrig rørt — filen havde nul forekomster af storage.from(.
//   (b) auth.admin.deleteUser fejlede EFTER profil, loginlog og medlemskab
//       var slettet, og fejlen forsvandt i en console.warn — virksomhed,
//       medlemskab og profil væk, kontoen tilbage.
//
// VALG (13/9): RETURNERE, ikke kaste, når en konto ikke kan slettes.
// Begge kaldesteder er bulk: cleanup-shells løber over flere virksomheder,
// og denne funktion løber over flere brugere. Et kast midt i brugerløkken
// ville (1) stoppe de øvrige brugere, (2) efterlade companies-rækken, og
// (3) et gen-kald ville finde nul medlemmer og slette virksomheden
// alligevel — med kontoen stadig tilbage. Derfor: kontoen slettes FØRST
// pr. bruger; fejler den, røres profil og loginlog IKKE (kontoen står hel
// frem for halv, og en admin kan tage den i hånden), brugeren samles i
// brugereIkkeSlettet, og løkken fortsætter. Svaret bærer ok: false, og
// kalderen må ikke melde succes uden at sige det. «not found» tolereres
// som allerede-slettet (idempotent, samme regel som cronen :394-395).
//
// STORAGE følger husets mønster fra slet-medlemsdata-cron :182-196: list
// mappen <company_id>/ og remove; fejl samles i fejl[] og afbryder INTET
// (filerne er ikke kilden til sandheden). Forskellen: financial-documents
// har TO niveauer (<company_id>/<report_id>/<fil> og <company_id>/annual/
// <fil>, src/lib/reportFileAccess.ts:27-29 og RapporteringView.tsx:999),
// og der er ingen rækker at gå ad (de slettes her), så mappen listes
// REKURSIVT. Kun de buckets hvor første sti-led er company_id (policyerne
// 20260226070216:42-48 og 20260225124103:10-15). Bruger-nøglede buckets
// (avatars, feedback-screenshots, chat-attachments, community-*) hører
// til kontoen, ikke virksomheden, og røres ikke her.
//
// Tabel-sletningerne kaster fortsat ved DB-fejl (mustSucceed) — dér er
// rækkerne kilden til sandheden, og et gen-kald tåler at ramme nul.
// Låst i src/lib/__tests__/companyHardDelete.test.ts.

/** Buckets hvor første sti-led er companies.id — mappen <company_id>/ kan listes. */
export const COMPANY_BUCKETS = ['financial-documents', 'company-logos'] as const;

export interface HardDeleteResultat {
  /** true kun når intet fejlede — hverken storage eller kontosletning. */
  ok: boolean;
  userIds: string[];
  conversationIds: string[];
  handoutIds: string[];
  /** Filer fjernet pr. bucket (tællingen FØR remove — som cronens rapport). */
  storage: Record<string, number>;
  /** Storage-trin der fejlede (list/remove) — filerne ligger stadig. */
  fejl: string[];
  /** Konti der IKKE blev slettet; profil og loginlog er da heller ikke rørt. Kun med deleteUsers. */
  brugereIkkeSlettet: { user_id: string; fejl: string }[];
}

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

/**
 * Alle filer under et præfiks, rekursivt. Supabase Storage giver mapper
 * som objekter med id === null (cronen :189 filtrerer dem fra — her går vi
 * ned i dem). Fejl samles og giver tom liste for den gren.
 */
async function listFilerRekursivt(adminSupabase: any, bucket: string, praefiks: string, fejl: string[]): Promise<string[]> {
  const { data, error } = await adminSupabase.storage.from(bucket).list(praefiks, { limit: 1000 });
  if (error) {
    fejl.push(`storage/${bucket}: list ${praefiks} fejlede: ${error.message}`);
    return [];
  }
  const stier: string[] = [];
  for (const o of (data ?? []) as { name: string; id: string | null }[]) {
    if (!o?.name) continue;
    const sti = `${praefiks}/${o.name}`;
    if (o.id === null) stier.push(...(await listFilerRekursivt(adminSupabase, bucket, sti, fejl)));
    else stier.push(sti);
  }
  return stier;
}

async function fjernFiler(adminSupabase: any, bucket: string, stier: string[], fejl: string[]): Promise<void> {
  if (stier.length === 0) return;
  const { error } = await adminSupabase.storage.from(bucket).remove(stier);
  if (error) fejl.push(`storage/${bucket}: remove fejlede: ${error.message}`);
}

export async function hardDeleteCompany(
  adminSupabase: any,
  companyId: string,
  options?: { deleteUsers?: boolean; preserveInvitations?: boolean },
): Promise<HardDeleteResultat> {
  const deleteUsers = options?.deleteUsers ?? false;
  const preserveInvitations = options?.preserveInvitations ?? false;
  const storage: Record<string, number> = {};
  const fejl: string[] = [];
  const brugereIkkeSlettet: { user_id: string; fejl: string }[] = [];

  const { data: members, error: membersError } = await adminSupabase
    .from('company_members')
    .select('user_id')
    .eq('company_id', companyId);

  if (membersError) {
    throw new Error(`Kunne ikke hente virksomhedens medlemmer: ${membersError.message}`);
  }

  const userIds = [...new Set((members || []).map((member: any) => member.user_id).filter(Boolean))] as string[];

  // ── Storage først (cronens trin 1): mappen <company_id>/ i de company-nøglede buckets ──
  for (const bucket of COMPANY_BUCKETS) {
    const stier = await listFilerRekursivt(adminSupabase, bucket, companyId, fejl);
    storage[bucket] = stier.length;
    await fjernFiler(adminSupabase, bucket, stier, fejl);
  }

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
  // data_basis-undtagelse: hard-delete-infrastruktur — sletter alle rækker, læser ingen tal
  await mustSucceed(adminSupabase.from('financial_report_facts').delete().eq('company_id', companyId), 'Kunne ikke slette financial_report_facts');
  await mustSucceed(adminSupabase.from('advisor_notifications').delete().eq('company_id', companyId), 'Kunne ikke slette advisor_notifications');
  await mustSucceed(adminSupabase.from('slack_conversation_threads').delete().eq('company_id', companyId), 'Kunne ikke slette slack_conversation_threads');
  await mustSucceed(adminSupabase.from('slack_notification_log').delete().eq('company_id', companyId), 'Kunne ikke slette slack_notification_log');
  await mustSucceed(adminSupabase.from('slack_handout_notification_log').delete().eq('company_id', companyId), 'Kunne ikke slette slack_handout_notification_log');
  await mustSucceed(adminSupabase.from('slack_report_notification_log').delete().eq('company_id', companyId), 'Kunne ikke slette slack_report_notification_log');
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
      // Kontoen FØRST. Fejler den, røres profil og loginlog ikke — kontoen
      // står hel, og fejlen går med i svaret (se filhovedet).
      const { error: authDeleteError } = await adminSupabase.auth.admin.deleteUser(userId);
      if (authDeleteError && !/not found/i.test(authDeleteError.message ?? '')) {
        brugereIkkeSlettet.push({ user_id: userId, fejl: authDeleteError.message || 'Ukendt fejl' });
        continue;
      }
      // profiles kaskaderer fra auth.users; user_login_log har ingen FK (cronens trin 10).
      await mustSucceed(adminSupabase.from('profiles').delete().eq('user_id', userId), `Kunne ikke slette profil for ${userId}`);
      await mustSucceed(adminSupabase.from('user_login_log').delete().eq('user_id', userId), `Kunne ikke slette loginlog for ${userId}`);
    }
  }

  await mustSucceed(adminSupabase.from('companies').delete().eq('id', companyId), 'Kunne ikke slette companies');

  return {
    ok: fejl.length === 0 && brugereIkkeSlettet.length === 0,
    userIds,
    conversationIds,
    handoutIds,
    storage,
    fejl,
    brugereIkkeSlettet,
  };
}

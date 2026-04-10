import { hardDeleteCompany } from "../_shared/companyHardDelete.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Helper: list all auth users (up to 1000)
async function listAllUsers(adminSupabase: any) {
  const { data } = await adminSupabase.auth.admin.listUsers({ perPage: 1000 });
  return data?.users || [];
}

function getSignupUrl() {
  const appUrl = Deno.env.get('PUBLIC_APP_URL') || Deno.env.get('APP_URL') || 'https://app.theboardroom.dk';
  return `${appUrl.replace(/\/$/, '')}/auth?mode=signup`;
}

async function sendAdvisorInvitationEmail(normalizedEmail: string, adminSupabase: any) {
  const signupUrl = getSignupUrl();
  const subject = 'Du er inviteret som rådgiver på The Boardroom';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0"><div style="max-width:480px;margin:0 auto;padding:20px 12px"><h1 style="color:#1a1a2e;font-size:24px;font-weight:bold;margin:20px 0 12px;font-family:'Space Grotesk',Arial,sans-serif;line-height:1.3">Velkommen til The Boardroom</h1><p style="color:#333333;font-size:14px;line-height:24px;margin:8px 0">Du er blevet inviteret som <strong style="font-weight:bold">rådgiver</strong> på The Boardroom — en platform der hjælper virksomheder med at få overblik over økonomi, milepæle og strategi.</p><p style="color:#333333;font-size:14px;line-height:24px;margin:8px 0">Som rådgiver får du adgang til alle virksomheders data, rapporter og chat — og kan følge deres fremskridt tæt.</p><p style="color:#333333;font-size:14px;line-height:24px;margin:8px 0;text-align:center"><a target="_blank" rel="noopener noreferrer nofollow" href="${signupUrl}" style="display:inline-block;background-color:#0fa968;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;font-family:'Space Grotesk',Arial,sans-serif;text-align:center"><strong style="font-weight:bold">Opret din konto</strong></a></p><p style="color:#333333;font-size:14px;line-height:24px;margin:8px 0">Opret dig med den e-mailadresse, denne invitation er sendt til — din rådgiverrolle aktiveres automatisk.</p><p style="color:#898989;font-size:12px;line-height:20px;margin-top:24px;border-top:1px solid #eee;padding-top:16px">Denne invitation er sendt fra The Boardroom. Har du spørgsmål, er du velkommen til at svare på denne mail.</p></div></body></html>`;

  // Enqueue email via Lovable Email queue
  const messageId = crypto.randomUUID();

  await adminSupabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: 'advisor-invitation',
    recipient_email: normalizedEmail,
    status: 'pending',
  });

  const { error: enqueueError } = await adminSupabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      idempotency_key: messageId,
      to: normalizedEmail,
      from: 'The Boardroom <noreply@mail.topix.dk>',
      sender_domain: 'mail.topix.dk',
      subject,
      html,
      text: subject,
      purpose: 'transactional',
      label: 'advisor-invitation',
      queued_at: new Date().toISOString(),
    },
  });

  if (enqueueError) {
    await adminSupabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'advisor-invitation',
      recipient_email: normalizedEmail,
      status: 'failed',
      error_message: 'Failed to enqueue email',
    });
    throw new Error(`Kunne ikke sende invitation: ${JSON.stringify(enqueueError)}`);
  }

  console.log(`[manage-advisor] Invitation email enqueued for: ${normalizedEmail}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token = authHeader.replace('Bearer ', '');

    // Validate caller token (compatible with signing keys)
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;

    if (claimsError || !userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

    // Check caller is advisor or admin
    const { data: callerRoles } = await adminSupabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['advisor', 'admin']);

    if (!callerRoles || callerRoles.length === 0) {
      return new Response(JSON.stringify({ error: 'Forbidden: not an advisor' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const callerIsAdmin = callerRoles.some((r: any) => r.role === 'admin');

    const body = await req.json();
    const { action, email, target_user_id } = body;

    // --- Per-action authorization: default-deny for non-admins ---
    const ADVISOR_ALLOWED_ACTIONS = ['list'];
    if (!callerIsAdmin) {
      if (!action || !ADVISOR_ALLOWED_ACTIONS.includes(action)) {
        console.warn(`[manage-advisor] DENIED action='${action || '(none)'}' caller=${userId} role=advisor`);
        return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ── BULK REMOVE ALL MEMBERS ──
    if (action === 'bulk-remove-members') {
      // Find all users with role 'member' (not advisor/admin)
      const { data: memberRoles } = await adminSupabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'member');

      const memberUserIds = (memberRoles || []).map((r: any) => r.user_id);

      // Also find users who are NOT in user_roles at all but ARE in company_members
      // (edge case: users without explicit role assignment)
      const { data: allCompanyMembers } = await adminSupabase
        .from('company_members')
        .select('user_id');

      // Get advisor/admin user ids to exclude
      const { data: privilegedRoles } = await adminSupabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['advisor', 'admin']);
      const privilegedIds = new Set((privilegedRoles || []).map((r: any) => r.user_id));

      // Combine: all company_members minus privileged users
      const allCompanyUserIds = new Set((allCompanyMembers || []).map((r: any) => r.user_id));
      const toDelete = [...allCompanyUserIds].filter(id => !privilegedIds.has(id));

      let deleted = 0;
      for (const uid of toDelete) {
        try {
          // Delete related data
          await adminSupabase.from('company_members').delete().eq('user_id', uid);
          await adminSupabase.from('profiles').delete().eq('user_id', uid);
          await adminSupabase.from('user_roles').delete().eq('user_id', uid);
          await adminSupabase.auth.admin.deleteUser(uid);
          deleted++;
        } catch (err) {
          console.error(`[bulk-remove] Failed to delete user ${uid}:`, err);
        }
      }

      // Also clear ALL company_invitations
      const { count: invitationsDeleted } = await adminSupabase
        .from('company_invitations')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // delete all
        .select('id', { count: 'exact', head: true });

      console.log(`[bulk-remove] Deleted ${deleted} members, cleared ${invitationsDeleted || 0} invitations`);

      return new Response(JSON.stringify({ 
        success: true, 
        deleted, 
        invitations_cleared: invitationsDeleted || 0,
        message: `${deleted} medlemmer fjernet og alle invitationer nulstillet` 
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── CLEANUP SHELL COMPANIES ──
    if (action === 'cleanup-shells') {
      const { accept_invitation_ids, delete_company_ids, delete_auth_user_ids } = body;

      // Step 0: Delete standalone auth users (when companies already removed via SQL)
      const authDeleteResults: string[] = [];
      for (const uid of (delete_auth_user_ids || [])) {
        try {
          await adminSupabase.auth.admin.deleteUser(uid);
          authDeleteResults.push(uid);
        } catch (e: any) {
          console.warn(`[cleanup-shells] Could not delete auth user ${uid}:`, e.message);
        }
      }
      if (authDeleteResults.length) {
        console.log(`[cleanup-shells] Deleted ${authDeleteResults.length} auth users`);
      }


      // Step 1: Mark active invitations as accepted
      if (accept_invitation_ids?.length) {
        await adminSupabase
          .from('company_invitations')
          .update({ status: 'accepted', accepted_at: new Date().toISOString() })
          .in('id', accept_invitation_ids);
        console.log(`[cleanup-shells] Marked ${accept_invitation_ids.length} invitations as accepted`);
      }

      // Step 2: Cascade-delete each shell company
      const results: { company_id: string; status: string; error?: string }[] = [];

      for (const companyId of (delete_company_ids || [])) {
        try {
          const { userIds } = await hardDeleteCompany(adminSupabase, companyId, {
            deleteUsers: true,
            preserveInvitations: true,
          });

          results.push({ company_id: companyId, status: 'deleted' });
          console.log(`[cleanup-shells] Deleted company ${companyId} with ${userIds.length} users`);
        } catch (err: any) {
          console.error(`[cleanup-shells] Error deleting company ${companyId}:`, err);
          results.push({ company_id: companyId, status: 'error', error: err.message });
        }
      }

      return new Response(JSON.stringify({
        success: true,
        accepted: accept_invitation_ids?.length || 0,
        deleted: results.filter(r => r.status === 'deleted').length,
        errors: results.filter(r => r.status === 'error'),
        results,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'delete-company') {
      const { company_id } = body;

      if (!company_id) {
        return new Response(JSON.stringify({ error: 'Missing company_id' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      await hardDeleteCompany(adminSupabase, company_id, {
        deleteUsers: false,
        preserveInvitations: false,
      });

      return new Response(JSON.stringify({ success: true, company_id }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'remove-member') {
      if (!target_user_id) {
        return new Response(JSON.stringify({ error: 'Missing target_user_id' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Reset any invitations accepted by this user back to pending
      const { count: resetByAcceptedBy } = await adminSupabase
        .from('company_invitations')
        .update({ status: 'pending', accepted_at: null, accepted_by: null })
        .eq('accepted_by', target_user_id)
        .select('id', { count: 'exact', head: true });

      // Fallback: if no invitations found via accepted_by, try email-based match
      if (!resetByAcceptedBy || resetByAcceptedBy === 0) {
        // Get the user's profile email and company
        const { data: profileData } = await adminSupabase
          .from('profiles')
          .select('email')
          .eq('user_id', target_user_id)
          .maybeSingle();
        const { data: membershipData } = await adminSupabase
          .from('company_members')
          .select('company_id')
          .eq('user_id', target_user_id)
          .maybeSingle();

        if (profileData?.email && membershipData?.company_id) {
          await adminSupabase
            .from('company_invitations')
            .update({ status: 'pending', accepted_at: null, accepted_by: null })
            .eq('company_id', membershipData.company_id)
            .ilike('email', profileData.email.trim())
            .eq('status', 'accepted');
        }
      }

      // Delete company_members
      const { error: cmErr } = await adminSupabase
        .from('company_members')
        .delete()
        .eq('user_id', target_user_id);
      if (cmErr) throw cmErr;

      // Delete profiles
      const { error: profErr } = await adminSupabase
        .from('profiles')
        .delete()
        .eq('user_id', target_user_id);
      if (profErr) throw profErr;

      // Delete auth user
      const { error: authErr } = await adminSupabase.auth.admin.deleteUser(target_user_id);
      if (authErr) throw authErr;

      return new Response(JSON.stringify({ success: true, message: 'Medlem fjernet' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!email) {
      return new Response(JSON.stringify({ error: 'Missing email' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (action === 'invite') {
      const allUsers = await listAllUsers(adminSupabase);
      const existingUser = allUsers.find((u: any) => u.email?.toLowerCase() === normalizedEmail);

      if (existingUser) {
        // Check if already advisor
        const { data: existingRole } = await adminSupabase
          .from('user_roles')
          .select('id')
          .eq('user_id', existingUser.id)
          .eq('role', 'advisor')
          .maybeSingle();

        if (existingRole) {
          return new Response(JSON.stringify({ error: 'Brugeren er allerede advisor' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Assign advisor role directly
        const { error: insertErr } = await adminSupabase
          .from('user_roles')
          .insert({ user_id: existingUser.id, role: 'advisor' });

        if (insertErr) throw insertErr;

        return new Response(JSON.stringify({ 
          success: true, 
          result: 'assigned',
          message: `${normalizedEmail} er nu advisor`
        }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // User doesn't exist — create or resend pending invitation
      const { data: existingInvite } = await adminSupabase
        .from('advisor_invitations')
        .select('id')
        .eq('email', normalizedEmail)
        .eq('status', 'pending')
        .maybeSingle();

      if (existingInvite) {
        await sendAdvisorInvitationEmail(normalizedEmail, adminSupabase);

        return new Response(JSON.stringify({
          success: true,
          result: 'resent',
          message: `Invitation genafsendt til ${normalizedEmail}`
        }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: createdInvite, error: inviteErr } = await adminSupabase
        .from('advisor_invitations')
        .insert({ email: normalizedEmail, invited_by: userId })
        .select('id')
        .single();

      if (inviteErr || !createdInvite) throw inviteErr || new Error('Kunne ikke oprette invitation');

      try {
        await sendAdvisorInvitationEmail(normalizedEmail, adminSupabase);
      } catch (emailError) {
        console.error('[manage-advisor] Failed to send advisor invitation email:', emailError);

        await adminSupabase
          .from('advisor_invitations')
          .delete()
          .eq('id', createdInvite.id);

        throw emailError;
      }

      return new Response(JSON.stringify({ 
        success: true, 
        result: 'invited',
        message: `Invitation sendt til ${normalizedEmail}`
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else if (action === 'remove') {
      const allUsersForRemove = await listAllUsers(adminSupabase);
      const existingUser = allUsersForRemove.find((u: any) => u.email?.toLowerCase() === normalizedEmail);

      if (existingUser) {
        await adminSupabase
          .from('user_roles')
          .delete()
          .eq('user_id', existingUser.id)
          .eq('role', 'advisor');
      }

      // Also remove any pending invitations
      await adminSupabase
        .from('advisor_invitations')
        .delete()
        .eq('email', normalizedEmail)
        .eq('status', 'pending');

      return new Response(JSON.stringify({ success: true, message: 'Advisor-rolle fjernet' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else if (action === 'list') {
      // List all advisors + admins + pending invitations
      const { data: roles } = await adminSupabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['advisor', 'admin']);

      // Deduplicate user_ids and track admin status
      const userRoleMap = new Map<string, Set<string>>();
      for (const r of (roles || [])) {
        if (!userRoleMap.has(r.user_id)) userRoleMap.set(r.user_id, new Set());
        userRoleMap.get(r.user_id)!.add(r.role);
      }
      const advisorUserIds = [...userRoleMap.keys()];
      
      const advisors: { email: string; name: string; status: 'active'; isAdmin: boolean }[] = [];
      if (advisorUserIds.length > 0) {
        const { data: profiles } = await adminSupabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', advisorUserIds);
        
        const allUsersForList = await listAllUsers(adminSupabase);
        const userEmailMap = new Map(allUsersForList.map((u: any) => [u.id, u.email || '']));

        for (const uid of advisorUserIds) {
          const profile = (profiles || []).find((p: any) => p.user_id === uid);
          advisors.push({
            email: userEmailMap.get(uid) || 'ukendt',
            name: profile?.full_name || '',
            status: 'active',
            isAdmin: userRoleMap.get(uid)?.has('admin') || false,
          });
        }
      }

      // Pending invitations
      const { data: pending } = await adminSupabase
        .from('advisor_invitations')
        .select('email, created_at')
        .eq('status', 'pending');

      const pendingList = (pending || []).map((p: any) => ({
        email: p.email,
        name: '',
        status: 'pending' as const,
        isAdmin: false,
        created_at: p.created_at,
      }));

      return new Response(JSON.stringify({ advisors: [...advisors, ...pendingList] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else if (action === 'toggle-admin') {
      // Only admins can toggle admin role
      if (!callerIsAdmin) {
        return new Response(JSON.stringify({ error: 'Kun admins kan ændre admin-rollen' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const allUsersForAdmin = await listAllUsers(adminSupabase);
      const targetUser = allUsersForAdmin.find((u: any) => u.email?.toLowerCase() === normalizedEmail);

      if (!targetUser) {
        return new Response(JSON.stringify({ error: 'Bruger ikke fundet' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Prevent removing own admin role
      if (targetUser.id === userId) {
        return new Response(JSON.stringify({ error: 'Du kan ikke fjerne din egen admin-rolle' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check current admin status
      const { data: existingAdmin } = await adminSupabase
        .from('user_roles')
        .select('id')
        .eq('user_id', targetUser.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (existingAdmin) {
        // Remove admin role
        await adminSupabase
          .from('user_roles')
          .delete()
          .eq('user_id', targetUser.id)
          .eq('role', 'admin');

        return new Response(JSON.stringify({ success: true, isAdmin: false, message: `Admin-rolle fjernet fra ${normalizedEmail}` }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        // Add admin role
        await adminSupabase
          .from('user_roles')
          .insert({ user_id: targetUser.id, role: 'admin' });

        return new Response(JSON.stringify({ success: true, isAdmin: true, message: `${normalizedEmail} er nu admin` }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error("manage-advisor error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

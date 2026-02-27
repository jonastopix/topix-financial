import { Resend } from 'npm:resend@4.0.0'

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
  const appUrl = Deno.env.get('PUBLIC_APP_URL') || Deno.env.get('APP_URL') || 'https://topix.lovable.app';
  return `${appUrl.replace(/\/$/, '')}/auth?mode=signup`;
}

async function sendAdvisorInvitationEmail(normalizedEmail: string, adminSupabase: any) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    throw new Error("Email er ikke konfigureret (mangler RESEND_API_KEY)");
  }

  const resend = new Resend(resendApiKey);
  const signupUrl = getSignupUrl();
  const subject = 'Du er inviteret som rådgiver på The Boardroom';

  const { data, error } = await resend.emails.send({
    from: 'The Boardroom <noreply@boardroom.topix.dk>',
    to: [normalizedEmail],
    subject,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0"><div style="max-width:480px;margin:0 auto;padding:0 12px"><h1 style="color:#1a1a2e;font-size:24px;font-weight:bold;margin:40px 0 20px">Velkommen til The Boardroom</h1><p style="color:#333;font-size:14px;line-height:24px;margin:16px 0">Du er blevet inviteret som <strong>rådgiver</strong> på The Boardroom — en platform der hjælper virksomheder med at få overblik over økonomi, milepæle og strategi.</p><p style="color:#333;font-size:14px;line-height:24px;margin:16px 0">Som rådgiver får du adgang til alle virksomheders data, rapporter og chat.</p><div style="text-align:center;margin:32px 0"><a href="${signupUrl}" target="_blank" style="background-color:#6366f1;border-radius:8px;color:#ffffff;display:inline-block;font-size:14px;font-weight:600;padding:12px 32px;text-decoration:none">Opret din konto</a></div><p style="color:#898989;font-size:12px;line-height:20px;margin-top:32px">Denne invitation er sendt fra The Boardroom. Opret dig med denne e-mailadresse for at aktivere din rådgiverrolle.</p></div></body></html>`,
  });

  // Log to email_send_log
  const { data: tpl } = await adminSupabase
    .from('email_templates')
    .select('id')
    .eq('name', 'Advisor invitation')
    .maybeSingle();

  if (tpl) {
    await adminSupabase.from('email_send_log').insert({
      template_id: tpl.id,
      recipient_email: normalizedEmail,
      subject,
      status: error ? 'failed' : 'sent',
      error_message: error ? JSON.stringify(error) : null,
      is_test: false,
    });
  }

  if (error) {
    throw new Error(`Kunne ikke sende invitation: ${JSON.stringify(error)}`);
  }

  console.log(`[manage-advisor] Invitation email sent to: ${normalizedEmail} (id: ${data?.id || 'unknown'})`);
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

    const { action, email } = await req.json();

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

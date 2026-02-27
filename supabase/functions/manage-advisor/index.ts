import { Resend } from 'npm:resend@4.0.0'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Helper: find a user by email across all pages
async function findUserByEmail(adminSupabase: any, email: string) {
  let page = 1;
  while (true) {
    const { data } = await adminSupabase.auth.admin.listUsers({ page, perPage: 100 });
    if (!data?.users?.length) return null;
    const found = data.users.find((u: any) => u.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 100) return null;
    page++;
  }
}

// Helper: get all users as a map of id→email
async function getAllUserEmails(adminSupabase: any): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let page = 1;
  while (true) {
    const { data } = await adminSupabase.auth.admin.listUsers({ page, perPage: 100 });
    if (!data?.users?.length) break;
    for (const u of data.users) {
      map.set(u.id, u.email || '');
    }
    if (data.users.length < 100) break;
    page++;
  }
  return map;
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

    // Validate caller is an advisor
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: userError } = await authClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

    // Check caller is advisor
    const { data: callerRole } = await adminSupabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'advisor')
      .maybeSingle();

    if (!callerRole) {
      return new Response(JSON.stringify({ error: 'Forbidden: not an advisor' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { action, email } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: 'Missing email' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (action === 'invite') {
      // Check if user already exists (paginated)
      const existingUser = await findUserByEmail(adminSupabase, normalizedEmail);

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

      // User doesn't exist — create pending invitation
      const { data: existingInvite } = await adminSupabase
        .from('advisor_invitations')
        .select('id')
        .eq('email', normalizedEmail)
        .eq('status', 'pending')
        .maybeSingle();

      if (existingInvite) {
        return new Response(JSON.stringify({ error: 'Der er allerede en afventende invitation til denne email' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error: inviteErr } = await adminSupabase
        .from('advisor_invitations')
        .insert({ email: normalizedEmail, invited_by: user.id });

      if (inviteErr) throw inviteErr;

      // Send invitation email
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (resendApiKey) {
        const resend = new Resend(resendApiKey);
        const signupUrl = 'https://topix.lovable.app/auth?mode=signup';
        
        await resend.emails.send({
          from: 'The Boardroom <noreply@boardroom.topix.dk>',
          to: [normalizedEmail],
          subject: 'Du er inviteret som rådgiver på The Boardroom',
          html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0"><div style="max-width:480px;margin:0 auto;padding:0 12px"><h1 style="color:#1a1a2e;font-size:24px;font-weight:bold;margin:40px 0 20px">Velkommen til The Boardroom</h1><p style="color:#333;font-size:14px;line-height:24px;margin:16px 0">Du er blevet inviteret som <strong>rådgiver</strong> på The Boardroom — en platform der hjælper virksomheder med at få overblik over økonomi, milepæle og strategi.</p><p style="color:#333;font-size:14px;line-height:24px;margin:16px 0">Som rådgiver får du adgang til alle virksomheders data, rapporter og chat.</p><div style="text-align:center;margin:32px 0"><a href="${signupUrl}" target="_blank" style="background-color:#6366f1;border-radius:8px;color:#ffffff;display:inline-block;font-size:14px;font-weight:600;padding:12px 32px;text-decoration:none">Opret din konto</a></div><p style="color:#898989;font-size:12px;line-height:20px;margin-top:32px">Denne invitation er sendt fra The Boardroom. Opret dig med denne e-mailadresse for at aktivere din rådgiverrolle.</p></div></body></html>`,
        });
        console.log(`[manage-advisor] Invitation email sent to: ${normalizedEmail}`);
      }

      return new Response(JSON.stringify({ 
        success: true, 
        result: 'invited',
        message: `Invitation sendt til ${normalizedEmail}`
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else if (action === 'remove') {
      // Remove advisor role (paginated user lookup)
      const existingUser = await findUserByEmail(adminSupabase, normalizedEmail);

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
      // List all advisors + pending invitations
      const { data: roles } = await adminSupabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'advisor');

      const advisorUserIds = (roles || []).map((r: any) => r.user_id);
      
      const advisors: { email: string; name: string; status: 'active' }[] = [];
      if (advisorUserIds.length > 0) {
        const { data: profiles } = await adminSupabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', advisorUserIds);
        
        // Paginated user email lookup
        const userEmailMap = await getAllUserEmails(adminSupabase);

        for (const uid of advisorUserIds) {
          const profile = (profiles || []).find((p: any) => p.user_id === uid);
          advisors.push({
            email: userEmailMap.get(uid) || 'ukendt',
            name: profile?.full_name || '',
            status: 'active',
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
        created_at: p.created_at,
      }));

      return new Response(JSON.stringify({ advisors: [...advisors, ...pendingList] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CIRCLE_BASE = "https://app.circle.so/api/admin/v2";
const BOARDROOM_ACCESS_GROUP_ID = "16745";
// "Classroom" space under The Boardroom — contains video lessons
const CLASSROOM_SPACE_ID = 1947777;
// Known Boardroom space IDs (from API discovery)
const BOARDROOM_SPACE_IDS = [1947776, 1947777, 1947778, 1947779, 1861841, 1861842];

async function circleGet(path: string, apiKey: string, params?: Record<string, string>) {
  const url = new URL(`${CIRCLE_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Circle API ${path} failed [${res.status}]: ${body}`);
  }
  return res.json();
}

// Fetch members of "The Boardroom" access group only
async function fetchBoardroomMembers(apiKey: string) {
  const members: any[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const data = await circleGet(
      `/access_groups/${BOARDROOM_ACCESS_GROUP_ID}/community_members`,
      apiKey,
      { per_page: String(perPage), page: String(page) }
    );

    const records = data?.records ?? data ?? [];
    if (!Array.isArray(records) || records.length === 0) break;
    members.push(...records);
    if (records.length < perPage) break;
    page++;
  }
  return members;
}

// Paginate through ALL Circle community members
async function fetchAllMembers(apiKey: string) {
  const members: any[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const data = await circleGet("/community_members", apiKey, {
      per_page: String(perPage),
      page: String(page),
      sort: "latest",
    });

    const records = data?.records ?? data ?? [];
    if (!Array.isArray(records) || records.length === 0) break;
    members.push(...records);
    if (records.length < perPage) break;
    page++;
  }
  return members;
}

// Fetch all spaces (courses are spaces with type "course")
async function fetchSpaces(apiKey: string) {
  const spaces: any[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const data = await circleGet("/spaces", apiKey, {
      per_page: String(perPage),
      page: String(page),
    });

    const records = data?.records ?? data ?? [];
    if (!Array.isArray(records) || records.length === 0) break;
    spaces.push(...records);
    if (records.length < perPage) break;
    page++;
  }
  return spaces;
}

// Fetch space groups to find "The Boardroom"
async function fetchSpaceGroups(apiKey: string) {
  const data = await circleGet("/space_groups", apiKey, { per_page: "100" });
  return data?.records ?? data ?? [];
}

// Fetch course lessons for a specific space (course type)
async function fetchCourseLessons(apiKey: string, spaceId: number) {
  const lessons: any[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const data = await circleGet("/course_lessons", apiKey, {
      space_id: String(spaceId),
      per_page: String(perPage),
      page: String(page),
    });

    const records = data?.records ?? data ?? [];
    if (!Array.isArray(records) || records.length === 0) break;
    lessons.push(...records);
    if (records.length < perPage) break;
    page++;
  }
  return lessons;
}

// Fetch space members for a specific space
async function fetchSpaceMembers(apiKey: string, spaceId: number) {
  const members: any[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const data = await circleGet("/space_members", apiKey, {
      space_id: String(spaceId),
      per_page: String(perPage),
      page: String(page),
    });

    const records = data?.records ?? data ?? [];
    if (!Array.isArray(records) || records.length === 0) break;
    members.push(...records);
    if (records.length < perPage) break;
    page++;
  }
  return members;
}

// Fetch posts for a specific space
async function fetchPosts(apiKey: string, spaceId?: number) {
  const params: Record<string, string> = { per_page: "100", sort: "latest" };
  if (spaceId) params.space_id = String(spaceId);

  const data = await circleGet("/posts", apiKey, params);
  return data?.records ?? data ?? [];
}

// Safe content preview extraction
function getContentPreview(body: any): string {
  if (!body) return "";
  if (typeof body === "string") return body.substring(0, 300);
  if (typeof body === "object") {
    const text = body.plain_text || body.text || body.html || "";
    if (typeof text === "string") return text.substring(0, 300);
  }
  return String(body).substring(0, 300);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    // Validate auth (mandatory)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const circleApiKey = Deno.env.get("CIRCLE_API_KEY");
    if (!circleApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "CIRCLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse request body for action
    let action = "sync";
    try {
      const body = await req.json();
      if (body?.action) action = body.action;
    } catch {
      // No body or not JSON, default to sync
    }

    // ─── Fetch Boardroom members (needed for both sync and cleanup) ───
    console.log("Fetching Boardroom access group members...");
    const boardroomMembers = await fetchBoardroomMembers(circleApiKey);
    // access_group endpoint returns community_member_id which matches circle_id in our table
    const boardroomCircleIds = new Set(boardroomMembers.map((m: any) => m.community_member_id));
    console.log(`Found ${boardroomCircleIds.size} Boardroom members`);

    // ─── CLEANUP MODE: Delete non-Boardroom users ───
    if (action === "cleanup") {
      console.log("Starting cleanup of non-Boardroom users...");
      
      // Get all circle_members with user_id that are NOT in Boardroom
      const { data: allLinked } = await supabase
        .from("circle_members")
        .select("circle_id, user_id, email, name")
        .not("user_id", "is", null);

      const toDelete = (allLinked || []).filter(
        (m: any) => !boardroomCircleIds.has(m.circle_id)
      );

      console.log(`Found ${toDelete.length} non-Boardroom users to delete`);

      let deleted = 0;
      let failed = 0;

      for (const member of toDelete) {
        const userId = member.user_id;
        try {
          // Delete auth user (cascades to profiles, user_roles, conversations via trigger/FK)
          const { error: delErr } = await supabase.auth.admin.deleteUser(userId, false);
          if (delErr) {
            console.error(`Failed to delete user ${member.email}:`, delErr);
            failed++;
          } else {
            // Clear user_id from circle_members
            await supabase
              .from("circle_members")
              .update({ user_id: null })
              .eq("circle_id", member.circle_id);
            deleted++;
          }
        } catch (e) {
          console.error(`Error deleting ${member.email}:`, e);
          failed++;
        }
      }

      const cleanupStats = {
        boardroom_members: boardroomCircleIds.size,
        non_boardroom_found: toDelete.length,
        deleted,
        failed,
      };

      console.log("Cleanup complete:", cleanupStats);

      return new Response(JSON.stringify({ success: true, action: "cleanup", stats: cleanupStats }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SYNC MODE (default) ───
    const stats = { members_synced: 0, boardroom_members: boardroomCircleIds.size, courses_synced: 0, activities_synced: 0, users_created: 0 };

    // Sync ALL Circle members (profiles only)
    console.log("Fetching all Circle members...");
    const allMembers = await fetchAllMembers(circleApiKey);
    console.log(`Found ${allMembers.length} total Circle members`);

    for (const m of allMembers) {
      const circleId = m.id;
      const email = m.email;
      const name = m.name || m.first_name
        ? `${m.first_name || ""} ${m.last_name || ""}`.trim()
        : email?.split("@")[0] || "Unknown";

      const { error: upsertErr } = await supabase
        .from("circle_members")
        .upsert(
          {
            circle_id: circleId,
            email: email,
            name: name,
            avatar_url: m.avatar_url || m.profile_image_url || null,
            headline: m.headline || null,
            bio: m.bio || null,
            circle_created_at: m.created_at || null,
            last_seen_at: m.last_seen_at || null,
            space_ids: m.space_ids || [],
            synced_at: new Date().toISOString(),
          },
          { onConflict: "circle_id" }
        );

      if (upsertErr) {
        console.error(`Failed to upsert member ${circleId}:`, upsertErr);
        continue;
      }

      // Only create auth user for Boardroom members
      if (!boardroomCircleIds.has(circleId)) {
        stats.members_synced++;
        continue;
      }
      console.log(`Boardroom member: ${email}`);

      const { data: existing } = await supabase
        .from("circle_members")
        .select("user_id")
        .eq("circle_id", circleId)
        .single();

      if (!existing?.user_id && email) {
        let userId: string | null = null;

        // Try creating user directly — if email exists, we'll link to existing
        {
          const tempPassword = crypto.randomUUID() + "Aa1!";
          const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
            email: email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: { full_name: name, source: "circle_sync" },
          });

          if (createErr) {
            if (createErr.message?.includes("already been registered")) {
              // Find existing user by listing and matching email
              const { data: userList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
              const found = userList?.users?.find(
                (u: any) => u.email?.toLowerCase() === email.toLowerCase()
              );
              if (found) {
                userId = found.id;
                console.log(`Linked existing user for ${email}`);
              }
            } else {
              console.error(`Failed to create user for ${email}:`, createErr);
            }
          } else if (newUser?.user) {
            userId = newUser.user.id;
            stats.users_created++;
            console.log(`Created Boardroom user for ${email}`);

            await supabase.from("user_roles").insert({
              user_id: userId,
              role: "member",
            });
          }
        }

        if (userId) {
          await supabase
            .from("circle_members")
            .update({ user_id: userId })
            .eq("circle_id", circleId);
        }
      }

      stats.members_synced++;
    }

    // ─── Use known Boardroom space IDs ───
    const classroomSpaceId = CLASSROOM_SPACE_ID;
    const boardroomSpaceIds = BOARDROOM_SPACE_IDS;
    console.log(`Using Classroom space ID: ${classroomSpaceId}, Boardroom spaces: ${boardroomSpaceIds.join(", ")}`);

    // ─── Sync Course Lessons from Classroom space ───
    if (classroomSpaceId) {
      console.log(`Fetching course lessons from Classroom space (ID: ${classroomSpaceId})...`);
      try {
        const lessons = await fetchCourseLessons(circleApiKey, classroomSpaceId);
        console.log(`Found ${lessons.length} course lessons`);

        // Get space members to track who has access
        const spaceMembers = await fetchSpaceMembers(circleApiKey, classroomSpaceId);
        console.log(`Found ${spaceMembers.length} Classroom space members`);

        // Store lessons as course progress records
        for (const member of spaceMembers) {
          const memberId = member.community_member_id || member.id;
          if (!memberId) continue;

          await supabase.from("circle_course_progress").upsert(
            {
              circle_member_id: memberId,
              course_id: classroomSpaceId,
              course_name: "Classroom",
              lessons_total: lessons.length,
              // We can't get individual lesson completion from this API, but we track enrollment
              synced_at: new Date().toISOString(),
            },
            { onConflict: "circle_member_id,course_id" }
          );
          stats.courses_synced++;
        }
      } catch (e) {
        console.warn("Could not sync course lessons:", e);
      }
    } else {
      console.warn("Classroom space not found in Boardroom space group");
    }

    // ─── Sync Activity from Boardroom spaces ───
    console.log("Fetching activity from Boardroom spaces...");
    for (const spaceId of boardroomSpaceIds) {
      try {
        const posts = await fetchPosts(circleApiKey, spaceId);
        console.log(`Found ${posts.length} posts in space ${spaceId}`);

        for (const post of posts) {
          const memberId = post.community_member_id || post.user_id;
          if (!memberId) continue;

          const { error: actErr } = await supabase.from("circle_activity").upsert(
            {
              circle_member_id: memberId,
              activity_type: "post",
              circle_post_id: post.id,
              space_name: post.space?.name || post.space_name || null,
              title: post.name || post.title || null,
              content_preview: getContentPreview(post.body),
              activity_at: post.created_at || new Date().toISOString(),
              synced_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );

          if (!actErr) stats.activities_synced++;
        }
      } catch (e) {
        console.warn(`Could not sync posts for space ${spaceId}:`, e);
      }
    }

    console.log("Sync complete:", stats);

    return new Response(JSON.stringify({ success: true, action: "sync", stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Circle sync error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

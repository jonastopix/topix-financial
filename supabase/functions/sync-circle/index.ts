import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CIRCLE_BASE = "https://app.circle.so/api/admin/v2";

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

// Paginate through all Circle community members
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

// Fetch courses list
async function fetchCourses(apiKey: string) {
  const data = await circleGet("/courses", apiKey, { per_page: "100" });
  return data?.records ?? data ?? [];
}

// Fetch course lessons for progress tracking
async function fetchCourseLessons(apiKey: string, courseId: number) {
  const data = await circleGet("/course_lessons", apiKey, {
    course_id: String(courseId),
    per_page: "200",
  });
  return data?.records ?? data ?? [];
}

// Fetch recent posts for activity
async function fetchRecentPosts(apiKey: string) {
  const data = await circleGet("/posts", apiKey, {
    per_page: "100",
    sort: "latest",
  });
  return data?.records ?? data ?? [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const circleApiKey = Deno.env.get("CIRCLE_API_KEY");
    if (!circleApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "CIRCLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Optionally check caller is an advisor
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: claims, error: claimsErr } = await supabase.auth.getUser(token);
      if (claimsErr || !claims?.user) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const stats = { members_synced: 0, courses_synced: 0, activities_synced: 0, users_created: 0 };

    // ─── 1. Sync Members ───
    console.log("Fetching Circle members...");
    const members = await fetchAllMembers(circleApiKey);
    console.log(`Found ${members.length} Circle members`);

    for (const m of members) {
      const circleId = m.id;
      const email = m.email;
      const name = m.name || m.first_name
        ? `${m.first_name || ""} ${m.last_name || ""}`.trim()
        : email?.split("@")[0] || "Unknown";

      // Upsert into circle_members
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

      // ─── Create auth user if not exists ───
      // Check if we already linked a user_id
      const { data: existing } = await supabase
        .from("circle_members")
        .select("user_id")
        .eq("circle_id", circleId)
        .single();

      if (!existing?.user_id && email) {
        // Try to find existing auth user by email
        const { data: userList } = await supabase.auth.admin.listUsers();
        const existingUser = userList?.users?.find(
          (u: any) => u.email?.toLowerCase() === email.toLowerCase()
        );

        let userId: string | null = null;

        if (existingUser) {
          userId = existingUser.id;
        } else {
          // Create user without sending email
          const tempPassword = crypto.randomUUID() + "Aa1!";
          const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
            email: email,
            password: tempPassword,
            email_confirm: true, // Mark as confirmed so no email is sent
            user_metadata: { full_name: name, source: "circle_sync" },
          });

          if (createErr) {
            console.error(`Failed to create user for ${email}:`, createErr);
          } else if (newUser?.user) {
            userId = newUser.user.id;
            stats.users_created++;
            console.log(`Created user for ${email}`);

            // Assign member role
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

    // ─── 2. Sync Course Progress ───
    console.log("Fetching Circle courses...");
    try {
      const courses = await fetchCourses(circleApiKey);
      console.log(`Found ${courses.length} courses`);

      for (const course of courses) {
        const courseId = course.id;
        const courseName = course.name || course.title || `Course ${courseId}`;

        // Get lessons for total count
        let totalLessons = 0;
        try {
          const lessons = await fetchCourseLessons(circleApiKey, courseId);
          totalLessons = lessons.length;
        } catch (e) {
          console.warn(`Could not fetch lessons for course ${courseId}:`, e);
        }

        // Upsert course progress for each member who has progress
        if (course.community_member_ids && Array.isArray(course.community_member_ids)) {
          for (const memberId of course.community_member_ids) {
            await supabase.from("circle_course_progress").upsert(
              {
                circle_member_id: memberId,
                course_id: courseId,
                course_name: courseName,
                lessons_total: totalLessons,
                synced_at: new Date().toISOString(),
              },
              { onConflict: "circle_member_id,course_id" }
            );
            stats.courses_synced++;
          }
        }
      }
    } catch (e) {
      console.warn("Could not sync courses (may require different API plan):", e);
    }

    // ─── 3. Sync Recent Activity ───
    console.log("Fetching recent Circle posts...");
    try {
      const posts = await fetchRecentPosts(circleApiKey);
      console.log(`Found ${posts.length} recent posts`);

      for (const post of posts) {
        const memberId = post.community_member_id || post.user_id;
        if (!memberId) continue;

        // Upsert activity by circle_post_id to avoid duplicates
        const { error: actErr } = await supabase.from("circle_activity").upsert(
          {
            circle_member_id: memberId,
            activity_type: "post",
            circle_post_id: post.id,
            space_name: post.space?.name || post.space_name || null,
            title: post.name || post.title || null,
            content_preview: (post.body?.plain_text || post.body || "").substring(0, 300),
            activity_at: post.created_at || new Date().toISOString(),
            synced_at: new Date().toISOString(),
          },
          { onConflict: "id" } // Use default id for upsert
        );

        if (!actErr) stats.activities_synced++;
      }
    } catch (e) {
      console.warn("Could not sync activity:", e);
    }

    console.log("Sync complete:", stats);

    return new Response(JSON.stringify({ success: true, stats }), {
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

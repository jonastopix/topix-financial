// Notificerer alle med community-adgang, når nogen skriver et NYT OPSLAG
// (opslagsmail 3/9). Søsterfunktion til notify-community-naevnelse —
// samme Bucket A-form, samme modtagerdom.
//
// Rækkefølgen i kroppen:
//   1. CORS-preflight.
//   2. authenticateUser(req) — kalderens identitet.
//   3. Validér traadId som ikke-tom streng, ellers 400.
//   4. Slå tråden op med KALDERENS klient (RLS-gated). Findes den ikke,
//      eller er den ikke aktiv: { notificeret: 0 } med 200 — kaldet er
//      en bivirkning, ikke en handling.
//   5. Modtagerne: get_community_medlemmer() med kalderens klient. Det er
//      NØJAGTIG nævnelsesfunktionens dom — har_aktivt_medlemskab(uid)
//      ELLER has_role(uid, 'advisor') (notify-community-naevnelse:147-162)
//      — bare regnet i SQL over alle profiler i ét kald frem for ét
//      RPC-kald pr. person (20260812150000:54-71: samme to prædikater,
//      og funktionens kommentar siger «netop dem, der selv kan se
//      community»). Ingen ny dom er opfundet.
//   6. Filtrér: forfatteren selv, og de @-nævnte (de får nævnelsen —
//      important + mail — og to beskeder for samme handling er støj).
//   7. FØRST derefter adminClient + writeNotificationToMany.
//
// priority "important": send-notification-email VIL sende en mail efter
// 15 minutter (index.ts:149) — det er hele hensigten. Mailen bygges dér
// ud fra reference_id (tråd + forfatter + virksomhed), ikke ud fra
// body: body er kun in-app-teksten.
//
// dedup_key er ÉN pr. tråd (community_opslag:{traadId}) og unik pr.
// (user_id, dedup_key): kaldes funktionen igen for samme tråd, får ingen
// to beskeder.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { writeNotificationToMany } from "../_shared/notificationWriter.ts";
import { samlNaevnteBrugere } from "../_shared/communityNaevnte.ts";
import { visningsnavn } from "../_shared/opslagsMail.ts";

export const COMMUNITY_OPSLAG_TYPE = "community_opslag";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // ── 1. CORS-preflight ──
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── 2. Auth (Bucket A) — MUST precede any service-role construction ──
  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerClient } = auth;

  // ── 3. Parse + validér input ──
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ugyldig JSON-body" }, 400);
  }
  const { traadId } = (body ?? {}) as { traadId?: unknown };
  if (typeof traadId !== "string" || traadId.trim() === "") {
    return jsonResponse({ error: "traadId mangler" }, 400);
  }

  // ── 4. Tråden, med KALDERENS klient (RLS gater) ──
  const { data: traad, error } = await callerClient
    .from("community_traade")
    .select("id, forfatter_id, titel, status, indhold_json")
    .eq("id", traadId)
    .maybeSingle();
  if (error) {
    console.error("[notify-community-opslag] traad-opslag fejlede:", error);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }
  if (!traad || traad.status !== "aktiv") return jsonResponse({ notificeret: 0 });

  // ── 5. Modtagerne: samme dom som nævnelsen, i ét kald ──
  const { data: medlemmer, error: medlemFejl } = await callerClient.rpc("get_community_medlemmer");
  if (medlemFejl) {
    console.error("[notify-community-opslag] get_community_medlemmer fejlede:", medlemFejl);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }
  const liste = (medlemmer ?? []) as { user_id: string; navn: string | null }[];

  // ── 6. Filtrér: forfatteren selv og de @-nævnte ──
  const naevnte = new Set(samlNaevnteBrugere(traad.indhold_json));
  const modtagere = liste
    .map((m) => m.user_id)
    .filter((uid) => uid !== traad.forfatter_id)
    .filter((uid) => !naevnte.has(uid));
  if (modtagere.length === 0) return jsonResponse({ notificeret: 0 });

  // Forfatterens navn til in-app-titlen: forfatteren har selv adgang og
  // står derfor i listen. Fallback som feedet og mailen.
  const forfatter = liste.find((m) => m.user_id === traad.forfatter_id);
  const navn = visningsnavn(forfatter?.navn);

  // ── 7. Service-role action — adminClient konstrueres FØRST nu ──
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const notificeret = await writeNotificationToMany(adminClient, modtagere, {
    type: COMMUNITY_OPSLAG_TYPE,
    priority: "important",
    title: `${navn} har skrevet et nyt opslag`,
    body: traad.titel,
    deep_link: `/community/${traad.id}`,
    reference_type: "community_traad",
    reference_id: traad.id,
    dedup_key: `${COMMUNITY_OPSLAG_TYPE}:${traad.id}`,
  });

  return jsonResponse({ notificeret });
});

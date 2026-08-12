// Notificerer medlemmer, der er @-nævnt i et community-opslag eller svar.
// Søsterfunktion til notify-community-svar — samme Bucket A-form.
//
// Rækkefølgen i kroppen:
//   1. CORS-preflight.
//   2. authenticateUser(req) — kalderens identitet.
//   3. Validér: præcis ét af traadId/svarId, ikke-tom streng, ellers 400.
//   4. Slå objektet op med KALDERENS klient (RLS-gated). Findes det ikke,
//      eller er det ikke aktivt: { notificeret: 0 } med 200 — kaldet er
//      en bivirkning, ikke en handling.
//   5. Udtræk nævnte bruger-id'er af indhold_json (TypeScript-rekursion).
//   6. Filtrér modtagerne: forfatteren selv, trådens forfatter (ved
//      svar), og alle uden community-adgang.
//   7. FØRST derefter adminClient + notifikations-skrivning.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { writeNotification } from "../_shared/notificationWriter.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Saml attrs.userId (eller attrs.user_id) fra alle noder med
    type = "naevnelse", deduplikeret. Der bruges bevidst IKKE jsonpath
    her: koden skal spejle motorens egen rekursion (communityDokument.ts
    følger kun content-arrayet), og en jsonpath-'$.**' ville også ramme
    noder gemt i andre felter end content. */
function samlNaevnteBrugere(dok: unknown): string[] {
  const fundne = new Set<string>();
  const gaa = (node: unknown) => {
    if (typeof node !== "object" || node === null || Array.isArray(node)) return;
    const n = node as Record<string, unknown>;
    if (n.type === "naevnelse") {
      const attrs =
        typeof n.attrs === "object" && n.attrs !== null && !Array.isArray(n.attrs)
          ? (n.attrs as Record<string, unknown>)
          : {};
      const id = attrs.userId ?? attrs.user_id;
      if (typeof id === "string" && id.trim() !== "") fundne.add(id.trim());
    }
    if (Array.isArray(n.content)) {
      for (const barn of n.content) gaa(barn);
    }
  };
  gaa(dok);
  return [...fundne];
}

Deno.serve(async (req) => {
  // ── 1. CORS-preflight ──
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── 2. Auth (Bucket A) — MUST precede any service-role construction ──
  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerClient } = auth;

  // ── 3. Parse + validér input: præcis ét af traadId/svarId ──
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ugyldig JSON-body" }, 400);
  }

  const { traadId, svarId } = (body ?? {}) as { traadId?: unknown; svarId?: unknown };
  const harTraadId = typeof traadId === "string" && traadId.trim() !== "";
  const harSvarId = typeof svarId === "string" && svarId.trim() !== "";
  if (harTraadId === harSvarId) {
    return jsonResponse({ error: "Angiv præcis ét af traadId eller svarId" }, 400);
  }

  // ── 4. Objektet, med KALDERENS klient (RLS gater). Manglende/inaktivt
  //       er ikke en fejl — kaldet er en bivirkning, ikke en handling. ──
  let objektId: string;
  let objektForfatterId: string;
  let indholdJson: unknown;
  let traadRef: { id: string; forfatter_id: string; titel: string } | null = null;
  let erSvar = false;

  if (harTraadId) {
    const { data: traad, error } = await callerClient
      .from("community_traade")
      .select("id, forfatter_id, titel, status, indhold_json")
      .eq("id", traadId as string)
      .maybeSingle();
    if (error) {
      console.error("[notify-community-naevnelse] traad-opslag fejlede:", error);
      return jsonResponse({ error: "Intern fejl" }, 500);
    }
    if (!traad || traad.status !== "aktiv") return jsonResponse({ notificeret: 0 });
    objektId = traad.id;
    objektForfatterId = traad.forfatter_id;
    indholdJson = traad.indhold_json;
    traadRef = { id: traad.id, forfatter_id: traad.forfatter_id, titel: traad.titel };
  } else {
    erSvar = true;
    const { data: svar, error } = await callerClient
      .from("community_svar")
      .select("id, traad_id, forfatter_id, status, indhold_json")
      .eq("id", svarId as string)
      .maybeSingle();
    if (error) {
      console.error("[notify-community-naevnelse] svar-opslag fejlede:", error);
      return jsonResponse({ error: "Intern fejl" }, 500);
    }
    if (!svar || svar.status !== "aktiv") return jsonResponse({ notificeret: 0 });

    const { data: traad, error: traadErr } = await callerClient
      .from("community_traade")
      .select("id, forfatter_id, titel, status")
      .eq("id", svar.traad_id)
      .maybeSingle();
    if (traadErr) {
      console.error("[notify-community-naevnelse] traad-opslag fejlede:", traadErr);
      return jsonResponse({ error: "Intern fejl" }, 500);
    }
    if (!traad || traad.status !== "aktiv") return jsonResponse({ notificeret: 0 });
    objektId = svar.id;
    objektForfatterId = svar.forfatter_id;
    indholdJson = svar.indhold_json;
    traadRef = { id: traad.id, forfatter_id: traad.forfatter_id, titel: traad.titel };
  }

  // ── 5. Nævnte brugere ud af dokumentet ──
  const naevnte = samlNaevnteBrugere(indholdJson);
  if (naevnte.length === 0) return jsonResponse({ notificeret: 0 });

  // ── 6. Filtrér modtagerne ──
  let modtagere = naevnte
    // Forfatteren selv: man notificeres ikke om at nævne sig selv.
    .filter((uid) => uid !== objektForfatterId)
    // Trådens forfatter, når objektet er et SVAR: vedkommende får
    // allerede en svar-notifikation (notify-community-svar) — to
    // beskeder for samme handling er støj, ikke information.
    .filter((uid) => !(erSvar && uid === traadRef!.forfatter_id));

  // Alle uden community-adgang fjernes: en nævnelse af nogen uden adgang
  // ville give en notifikation om et opslag, de ikke kan åbne. Rådgivere
  // har adgang via has_role og skal IKKE falde på medlemskabs-dommen —
  // pickeren (get_community_medlemmer) viser dem, så nævnelser af
  // dem skal også nå frem.
  const medAdgang: string[] = [];
  for (const uid of modtagere) {
    const { data: erMedlem } = await callerClient.rpc("har_aktivt_medlemskab", {
      _user_id: uid,
    });
    if (erMedlem === true) {
      medAdgang.push(uid);
      continue;
    }
    const { data: erRaadgiver } = await callerClient.rpc("has_role", {
      _user_id: uid,
      _role: "advisor",
    });
    if (erRaadgiver === true) medAdgang.push(uid);
  }
  modtagere = medAdgang;
  if (modtagere.length === 0) return jsonResponse({ notificeret: 0 });

  // ── 7. Service-role action — adminClient konstrueres FØRST nu. ──
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  let notificeret = 0;
  for (const modtagerId of modtagere) {
    const indsat = await writeNotification(adminClient, {
      user_id: modtagerId,
      type: "community_naevnelse",
      /* priority "important" — MODSAT svar-notifikationens "info": at
         blive nævnt ved navn er en direkte henvendelse til dig, ikke en
         opdatering på noget du har skrevet. Konsekvensen er bevidst:
         important betyder at send-notification-email VIL sende en mail
         (index.ts:149) efter DEFAULT_EMAIL_DELAY_MINUTES = 15 — efter
         hensigten, og i tråd med kadence-loftets undtagelse for direkte
         henvendelser. */
      priority: "important",
      title: "Du er nævnt i et opslag",
      body: traadRef!.titel,
      deep_link: `/community/${traadRef!.id}`,
      reference_type: "community_traad",
      reference_id: traadRef!.id,
      /* Dedup pr. objekt PR. MODTAGER: en redigering af samme opslag må
         ikke give to beskeder til samme person — men en NY person nævnt
         i redigeringen skal stadig have sin. (Egen loop over
         writeNotification frem for writeNotificationToMany, som ikke
         kan variere dedup_key pr. modtager.) */
      dedup_key: `community_naevnelse:${objektId}:${modtagerId}`,
    });
    if (indsat) notificeret++;
  }

  return jsonResponse({ notificeret });
});

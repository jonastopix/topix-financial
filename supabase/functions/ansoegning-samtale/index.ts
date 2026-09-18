// ansoegning-samtale — ansøgeren booker, flytter og aflyser afklaringssamtalen
// fra VORES side; bookingen oprettes i CALENDLY bagved (udkast 18/9-2026,
// rev. 2). Kalderen har ingen session; legitimationen er tokenet i body
// (verifyAnsoegningslink — det ene token-mønster, Jonas D7) FØR enhver anden
// service-role-handling. verify_jwt = false i config.toml af samme grund som
// ansoegning-link.
//
// Body: { token, handling: "tider" | "book" | "flyt" | "aflys", start? }
//   tider → { slots: [ISO…], varighed_min, samtale_start, samtale_slut, moede_link }
//           — Calendlys bookbare slots (hans Google-kalender og buffere er
//           trukket fra) filtreret af platformens dom (helligdage, 4 t varsel,
//           60 dage, allerede booket her). Kun for trin indkaldt/booket.
//   book  → fra «indkaldt». RÆKKEFØLGEN: (1) slottet regnes igen på serveren,
//           (2) Calendly FØRST (opretBooking: kalenderen + Meet-linket) — kan
//           den afvise, sker intet hos os, (3) platformen (udfoerOvergang
//           book; UNIQUE-indekset er sidste dommer: 23505 → 409), fejler den,
//           AFLYSES Calendly-bookingen igen (kompensation), (4) beskederne.
//           Webhooken (invitee.created) og vi kan begge nå frem: ansøgningen
//           genlæses efter Calendly, og kender den allerede eventet, springes
//           overgangen over (kun linket skrives).
//   flyt  → fra «booket»: som book med et nyt event; det gamle aflyses i
//           Calendly bagefter (API'et har ingen reschedule). Mail «ny tid».
//   aflys → fra «booket»: Calendly aflyses FØRST (fejler den, 502 og intet
//           ændres), så udfoerOvergang(aflys_booking) → «indkaldt» med ny
//           rykkertrappe, så mail «aflyst» + klokke.
// Svar: 200 { ok, trin, samtale_start, samtale_slut, moede_link, besked } ·
// 400 · 404 ukendt link · 409 forkert trin / tiden ikke ledig · 502 Calendly
// afviste · 503 kalenderen kunne ikke læses (fail-closed).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { verifyAnsoegningslink } from "../_shared/ansoegningLinkAuth.ts";
import { hentAnsoegning, udfoerOvergang } from "../_shared/ansoegningMotor.ts";
import { CalendlyFejl } from "../_shared/calendlyApi.ts";
import { erSlotLedig, slutAf } from "../_shared/samtaleSlots.ts";
import { aflysIKalenderen, bookIKalenderen, hentLedigeSamtaletider } from "../_shared/samtaleTider.ts";
import { meldSamtaleAendring } from "../_shared/samtaleBesked.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const HANDLINGER = ["tider", "book", "flyt", "aflys"] as const;
type Handling = (typeof HANDLINGER)[number];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Kun POST" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ugyldig JSON" }, 400);
  }
  const token = typeof body.token === "string" ? body.token : "";
  const handling = (HANDLINGER as readonly string[]).includes(String(body.handling)) ? (body.handling as Handling) : null;
  if (!token || !handling) return json({ error: "token og handling kræves" }, 400);
  const startRaa = typeof body.start === "string" && !Number.isNaN(Date.parse(body.start)) ? new Date(body.start).toISOString() : null;
  if ((handling === "book" || handling === "flyt") && !startRaa) return json({ error: "start (ISO-tidspunkt) kræves" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Prædikatet FØRST — ukendt token, kladde eller ugyldigt format → 404 uden grund.
  const a = await verifyAnsoegningslink(token, admin);
  if (!a) return json({ error: "Ukendt link" }, 404);
  if (a.trin !== "indkaldt" && a.trin !== "booket") return json({ error: "Samtalen kan ikke bookes fra dette trin" }, 409);
  if (a.paa_pause_til) return json({ error: "Ansøgningen er på pause" }, 409);

  const nu = new Date();
  const svar = (ekstra: Record<string, unknown> = {}) => ({
    ok: true,
    trin: a.trin,
    samtale_start: a.samtale_start,
    samtale_slut: a.samtale_slut,
    moede_link: a.trin === "booket" ? a.samtale_link : null,
    varighed_min: 30,
    ...ekstra,
  });

  if (handling === "aflys") {
    if (a.trin !== "booket") return json({ error: "Der er ingen samtale at aflyse" }, 409);
    const gammel = a.samtale_start ? new Date(a.samtale_start) : null;
    // Calendly FØRST: står eventet stadig i hans kalender, er intet aflyst.
    if (a.calendly_event_uri && !(await aflysIKalenderen(a.calendly_event_uri, "Aflyst af ansøgeren fra The Boardroom"))) {
      return json({ error: "Kalenderen kunne ikke aflyse lige nu — prøv igen om lidt" }, 502);
    }
    // Webhooken (invitee.canceled) kan have nået overgangen og mailen først — så er alt gjort.
    const frisk = (await hentAnsoegning(admin, a.id)) ?? a;
    if (frisk.trin !== "booket") {
      console.log(`[ansoegning-samtale] aflys på ${a.id}: webhooken nåede først (${frisk.trin}).`);
      return json({ ...svar(), trin: frisk.trin, samtale_start: null, samtale_slut: null, moede_link: null, besked: { mail: "sendt", klokke: 0 } });
    }
    const res = await udfoerOvergang(admin, { ansoegning: frisk, handling: { art: "aflys_booking" }, via: "ansoeger_link", truffetAf: null, nu });
    if (res.ok === false) return json({ error: res.grund }, res.status);
    const besked = await meldSamtaleAendring(admin, { a, aendring: "aflys", af: "ansoeger", nyStart: null, gammelStart: gammel, moedeLink: null, varighedMin: 30 });
    console.log(`[ansoegning-samtale] aflys på ${a.id}: ${res.fra} → ${res.til}, mail ${besked.mail}, klokke ${besked.klokke}`);
    return json({ ...svar(), trin: res.til, samtale_start: null, samtale_slut: null, moede_link: null, besked });
  }

  let tider;
  try {
    tider = await hentLedigeSamtaletider(admin, { nu, udenAnsoegningId: a.id });
  } catch (err) {
    console.error("[ansoegning-samtale] kalenderen kunne ikke læses — fail-closed:", err);
    return json({ error: "Kalenderen kunne ikke læses lige nu — prøv igen om lidt" }, 503);
  }
  if (handling === "tider") return json(svar({ slots: tider.slots, varighed_min: tider.varighedMin }));

  // book / flyt
  if (handling === "book" && a.trin !== "indkaldt") return json({ error: "Samtalen er allerede booket — brug flyt" }, 409);
  if (handling === "flyt" && a.trin !== "booket") return json({ error: "Der er ingen samtale at flytte — book i stedet" }, 409);
  const start = startRaa!;
  if (!erSlotLedig(start, tider.input)) return json({ error: "Tiden er ikke ledig længere — vælg en anden" }, 409);
  const slut = slutAf(start, tider.varighedMin);
  const gammel = a.samtale_start ? new Date(a.samtale_start) : null;
  const gammelEvent = a.calendly_event_uri;

  // (2) Calendly FØRST — kalenderen og Meet-linket.
  let kalender;
  try {
    kalender = await bookIKalenderen(a, start);
  } catch (err) {
    console.error(`[ansoegning-samtale] Calendly afviste ${start} for ${a.id}:`, err);
    const status = err instanceof CalendlyFejl && (err.status === 400 || err.status === 409 || err.status === 422) ? 409 : 502;
    return json({ error: status === 409 ? "Tiden er ikke ledig længere — vælg en anden" : "Kalenderen svarede ikke — prøv igen om lidt" }, status);
  }

  // (3) Platformen — medmindre webhooken allerede nåede at skrive netop dette event.
  const frisk = (await hentAnsoegning(admin, a.id)) ?? a;
  let fra = frisk.trin, til = frisk.trin, planlagt = 0, annulleret = 0;
  if (frisk.trin === "booket" && frisk.calendly_event_uri === kalender.eventUri) {
    const { error } = await admin.from("ansoegninger").update({ samtale_link: kalender.moedeLink }).eq("id", a.id);
    if (error) console.error("[ansoegning-samtale] samtale_link kunne ikke skrives:", error.message);
  } else {
    const res = await udfoerOvergang(admin, {
      ansoegning: frisk,
      handling: { art: "book" },
      via: "ansoeger_link",
      truffetAf: null,
      nu,
      samtale: { start: new Date(start), slut: new Date(slut), eventUri: kalender.eventUri, moedeLink: kalender.moedeLink },
    });
    if (res.ok === false) {
      // Kompensation: platformen sagde nej (23505/lås) — eventet må ikke blive stående i hans kalender.
      await aflysIKalenderen(kalender.eventUri, "Platformen kunne ikke gemme bookingen (dobbeltbooking) — aflyst automatisk");
      return json({ error: res.grund }, res.status);
    }
    ({ fra, til, planlagt, annulleret } = res);
  }

  // Flytning: det gamle event aflyses i Calendly bagefter (best effort — det nye står, og det er det der gælder).
  let gammelAflyst: boolean | null = null;
  if (handling === "flyt" && gammelEvent && gammelEvent !== kalender.eventUri) {
    gammelAflyst = await aflysIKalenderen(gammelEvent, "Flyttet af ansøgeren fra The Boardroom — ny tid er booket");
  }

  const aendring = handling === "flyt" ? "flyt" : "book";
  const besked = await meldSamtaleAendring(admin, { a, aendring, af: "ansoeger", nyStart: new Date(start), gammelStart: gammel, moedeLink: kalender.moedeLink, varighedMin: tider.varighedMin });
  console.log(`[ansoegning-samtale] ${aendring} på ${a.id}: ${fra} → ${til} (${start}), ${planlagt} planlagt, ${annulleret} annulleret, calendly ${kalender.eventUri}, gammel aflyst ${gammelAflyst}, mail ${besked.mail}, klokke ${besked.klokke}`);
  return json({ ...svar(), trin: til, samtale_start: start, samtale_slut: slut, moede_link: kalender.moedeLink, besked, ...(gammelAflyst === false ? { advarsel: "den gamle tid kunne ikke aflyses i kalenderen" } : {}) });
});

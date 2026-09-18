// ansoegning-rykker-cron — rykkerkøens ENE cron: sender de forfaldne rækker i
// planlagte_haendelser (18/9-2026). Bucket B: authenticateServiceRole FØRST,
// bag verify_jwt = true; pg_cron kalder gennem kald_edge hvert kvarter på
// hverdage (20260918210000). TØRKØRSEL SOM STANDARD: uden body findes og
// dømmes rækkerne, men intet sendes og intet skrives — kun et eksplicit
// { "dry_run": false } sender (indgangs-paamindelser-cron-mønstret).
//
// HVAD DEN GØR pr. forfalden række (ældste først, højst BATCH pr. kørsel):
//   1. Ansøgningen læses. Står den ikke længere på trappens trin, er lukket,
//      afleveret eller på pause (og trappen ikke er pausen) → rækken
//      ANNULLERES (regel 1, sagt igen her: en reaktion der nåede rækken før
//      køen gjorde, vinder).
//   2. afgoerSending (rykkerkoe.ts) dømmer: forfalden? i vinduet? har
//      modtageren fået en mail i dag? Nej → planlagt_til rykkes til
//      udskydTil (udskudt_antal++), intet sendes.
//   3. send_mail: ansoegningMotor.sendKoeMail — ÉT sted for cronen og for
//      «straks» (Jonas 18/9, pkt. 8: svar-mailen sendes med det samme af
//      motoren; cronen er reserven og sender rykkerne). Mailen bygges
//      (ansoegningRykkerMails.ts) og sendes gennem sendManagedEmail med
//      idempotencyKey = idempotensnoegle → message_id i email_send_log
//      (UNIQUE WHERE status = sent). Kun ved sendt: status sendt, sendt_til,
//      udfoert_at, message_id, og ansoegninger.rykkere_sendt tælles op
//      (trin_nr > 0). Spærret modtager → rækken markeres fejlet uden retry.
//      Anden fejl → fejl_antal++ (MAKS_FEJL forsøg, så fejlet).
//   4. luk_svarer_ikke / udloeb / marker_afholdt → udfoerOvergang (via koe)
//      → status udfoert; rådgiveren får en klokke. pause_slut → motorens
//      genoptag (samme dom som rådgiverens og ansøgerens, 18/9) → klokke.
//
// ÉN MAIL PR. PERSON PR. DAG (regel 3) måles i køen selv: sendt_til +
// udfoert_at i dansk dag, plus det der er sendt i DENNE kørsel. Aldrig i
// email_send_log — den bærer også andre systemers mails.
//
// BOOKINGLINKET er ansøgerens egen side (ansoegerLink): samtalen vælges i
// PLATFORMEN (udkast 18/9) og oprettes i Calendly bagved. Mødelinket til i
// dag/i morgen-mailene står på ansøgningen (samtale_link, fra Calendly-eventet).
// Trappen «kladde» (Jonas D6) er formularens påmindelse: den sendes kun mens
// ansøgningen stadig er en kladde med e-mail.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { skrivRaadgiverBesked } from "../_shared/raadgiverBesked.ts";
import { afgoerSending, taellerIkkeIDagsreglen, TRAPPER_PAA_LUKKET, type KoeHandling } from "../_shared/rykkerkoe.ts";
import { erAabentTrin, erPaaPause, trappensTrin } from "../_shared/ansoegningTrin.ts";
import { kbhDato, kbhTilUtc } from "../_shared/hverdage.ts";
import type { VentepladsKontekst } from "../_shared/ansoegningRykkerMails.ts";
import { hentAnsoegerensPladser, pladsUdloebet } from "../_shared/venteliste.ts";
import { erBloedUdgave } from "../_shared/ventelisteDom.ts";
import {
  afslaaPladsenLink,
  hentAnsoegning,
  KOE_RAEKKE_FELTER,
  RAADGIVER_BESKED,
  REFERENCE_TYPE,
  sendKoeMail,
  tagPladsenLink,
  udfoerOvergang,
  virksomhedsnavnAf,
  type AnsoegningRaekke,
  type KoeRaekke,
} from "../_shared/ansoegningMotor.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Højst så mange rækker pr. kørsel — kørslen varer under kald_edge's 30 s. */
const BATCH = 50;

interface Resultat {
  ok: boolean;
  dry_run: boolean;
  forfaldne: number;
  sendte: number;
  udfoerte: number;
  ville_sende: number;
  udskudt: { vindue: number; dagsregel: number };
  annulleret: number;
  fejlet: number;
  fejl: number;
  error?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** Mailadresser der har fået en kø-mail i dag (dansk dag). */
async function sendtIDag(admin: SupabaseClient, nu: Date): Promise<Set<string>> {
  const fra = kbhTilUtc(kbhDato(nu), 0, 0).toISOString();
  // Trapper uden dagsregel (kvitteringen) tæller ikke — ellers skubber kvitteringen indkaldelsen et døgn.
  const { data, error } = await admin
    .from("planlagte_haendelser")
    .select("sendt_til, trappe, trin_nr")
    .eq("status", "sendt")
    .gte("udfoert_at", fra);
  if (error) {
    console.error("[ansoegning-rykker-cron] sendtIDag fejlede — fail-closed: alle regnes som «har fået»:", error.message);
    return new Set(["*"]);
  }
  // Undtagne rækker (kvitteringen, ventepladsens tilbud) tæller ikke — ellers skubber de næste mail et døgn.
  return new Set(
    ((data ?? []) as { sendt_til: string | null; trappe: string; trin_nr: number }[])
      .filter((r) => !taellerIkkeIDagsreglen(r))
      .map((r) => (r.sendt_til ?? "").toLowerCase())
      .filter(Boolean),
  );
}

function raadgiverKlokke(a: AnsoegningRaekke, handling: KoeHandling): { type: string; title: string; body: string } {
  const navn = virksomhedsnavnAf(a);
  switch (handling) {
    case "marker_afholdt":
      return { type: RAADGIVER_BESKED.afholdt, title: `Samtalen med ${navn} er afholdt`, body: "Tilbud eller afslag? Beslutningen er din." };
    case "luk_svarer_ikke":
      return { type: RAADGIVER_BESKED.lukket_af_koen, title: `Lukket: ${navn} svarede ikke`, body: "Tre rykkere uden booking. Kan genåbnes fra ansøgningen." };
    case "udloeb":
      return { type: RAADGIVER_BESKED.lukket_af_koen, title: `Aftalegrundlaget til ${navn} udløb`, body: "Dag 21 uden underskrift. Kan genåbnes fra ansøgningen." };
    case "pause_slut":
      return { type: RAADGIVER_BESKED.pause_slut, title: `Pausen for ${navn} er slut`, body: "Tre måneder er gået siden «ikke nu». Skal vi skrive igen? Det er dit valg — køen gør intet af sig selv." };
    case "venteplads_udloeb":
      // Klokken skrives af _shared/venteliste.ts (pladsUdloebet) — grenen ovenfor
      // når aldrig hertil; her kun for udtømmende switch.
      return { type: "venteliste", title: `Tilbuddet til ${navn} udløb`, body: "Køen er gået videre." };
    default:
      return { type: RAADGIVER_BESKED.pause_slut, title: navn, body: handling };
  }
}

async function koer(admin: SupabaseClient, toer: boolean, nu: Date): Promise<Resultat> {
  const r: Resultat = { ok: true, dry_run: toer, forfaldne: 0, sendte: 0, udfoerte: 0, ville_sende: 0, udskudt: { vindue: 0, dagsregel: 0 }, annulleret: 0, fejlet: 0, fejl: 0 };

  const { data: raekker, error } = await admin
    .from("planlagte_haendelser")
    .select(KOE_RAEKKE_FELTER)
    .eq("status", "planlagt")
    .lte("planlagt_til", nu.toISOString())
    .order("planlagt_til", { ascending: true })
    .limit(BATCH);
  if (error) return { ...r, ok: false, error: error.message };
  r.forfaldne = raekker?.length ?? 0;
  if (r.forfaldne === 0) return r;

  const harFaaet = await sendtIDag(admin, nu);
  const failClosed = harFaaet.has("*");

  for (const raekke of raekker as KoeRaekke[]) {
    try {
      const a = await hentAnsoegning(admin, raekke.ansoegning_id);
      const trin = trappensTrin(raekke.trappe);
      // Rettelse 19/9 (recon-sammenhæng §2): den fjerde og sidste rå null-test. En pause hvis dato er nået,
      // er ingen pause — ellers annullerede cronen enhver ny række, hvis pause_slut-rækken var fejlet.
      const paaPause = erPaaPause(a?.paa_pause_til, nu);
      // Kladden lever FØR trinnene: rækken gælder kun mens ansøgningen stadig er
      // en kladde med e-mail; er den indsendt, vandt reaktionen (regel 1).
      // Ventelisten (udkast 18/9): trappen «venteplads» lever på en LUKKET
      // ansøgning — rækken gælder så længe ansøgeren har et tilbud ude.
      const venteplads = raekke.trappe === "venteplads" && a
        ? (await hentAnsoegerensPladser(admin, a.id)).find((p) => p.status === "tilbudt") ?? null
        : null;
      const skalAnnulleres = raekke.trappe === "kladde"
        ? (!a || a.indsendt_at !== null || !a.email)
        : raekke.trappe === "venteplads"
        ? (!a || !venteplads)
        // Afslagsmailen (18/9) lever også på en LUKKET ansøgning (TRAPPER_PAA_LUKKET):
        // den kræver trin = lukket i stedet for at blive annulleret af «ikke åben».
        // Ventepladsen er tjekket strengere ovenfor (tilbud ude), derfor står den først.
        : TRAPPER_PAA_LUKKET.includes(raekke.trappe)
        ? (!a || !a.indsendt_at || a.trin !== "lukket")
        : (!a || !a.indsendt_at || !erAabentTrin(a.trin) ||
          (trin !== null && a.trin !== trin) ||
          (raekke.trappe !== "pause" && paaPause) ||
          // Pause-rækken gælder så længe en pause er SAT — ikke «er på pause nu»: på selve slutdatoen er
          // erPaaPause allerede falsk, og med den test blev pause_slut annulleret den dag den skulle køre
          // (hul fundet 18/9 aften: kolonnen blev aldrig ryddet, klokken kom aldrig).
          (raekke.trappe === "pause" && !a.paa_pause_til));
      if (skalAnnulleres || !a) {
        if (!toer) {
          await admin.from("planlagte_haendelser")
            .update({ status: "annulleret", annulleret_at: nu.toISOString(), annulleret_grund: !a ? "ansøgningen findes ikke" : raekke.trappe === "venteplads" ? "intet tilbud ude på ventelisten" : `ansøgningen står på «${a.trin}»${paaPause ? " (pause)" : ""}` })
            .eq("id", raekke.id).eq("status", "planlagt");
        }
        r.annulleret++;
        continue;
      }

      const email = (a.email ?? "").toLowerCase();
      const dom = afgoerSending({
        nu,
        planlagtTil: new Date(raekke.planlagt_til),
        handling: raekke.handling,
        modtagerHarFaaetMailIDag: raekke.modtager === "ansoeger" && (failClosed || harFaaet.has(email)),
        trappe: raekke.trappe,
        trinNr: raekke.trin_nr,
      });
      if (dom.ok === false) {
        if (dom.grund === "ikke_forfalden") continue;
        if (dom.grund === "uden_for_vinduet") r.udskudt.vindue++;
        else r.udskudt.dagsregel++;
        if (!toer) {
          await admin.from("planlagte_haendelser")
            .update({ planlagt_til: dom.udskydTil.toISOString(), udskudt_antal: raekke.udskudt_antal + 1 })
            .eq("id", raekke.id).eq("status", "planlagt");
        }
        continue;
      }

      if (raekke.handling === "send_mail") {
        const email = (a.email ?? "").toLowerCase();
        if (toer) {
          console.log(`[ansoegning-rykker-cron] TØRKØRSEL ville sende ${raekke.skabelon} til ${email || "(ingen adresse)"} (${virksomhedsnavnAf(a)})`);
          r.ville_sende++;
          if (email) harFaaet.add(email);
          continue;
        }
        const ventepladsKontekst: VentepladsKontekst | null = venteplads
          ? {
              bloed: erBloedUdgave(a.lukket_at, nu),
              svarfrist: new Date(venteplads.tilbud_udloeber_at ?? nu.toISOString()),
              tagPladsenUrl: tagPladsenLink(a.token),
              afslaaPladsenUrl: afslaaPladsenLink(a.token),
            }
          : null;
        const res = await sendKoeMail(admin, raekke, a, nu, { venteplads: ventepladsKontekst, vej: "koe" });
        if (res.udfald === "sendt") {
          harFaaet.add(email);
          r.sendte++;
          continue;
        }
        if (res.udfald === "ingen_adresse" || res.udfald === "ukendt_skabelon") {
          r.fejlet++;
          continue;
        }
        if (res.reason === "rate_limited") {
          console.error("[ansoegning-rykker-cron] rate limit — kørslen stopper; resten tages næste kvarter");
          r.fejl++;
          break;
        }
        if (res.endeligt) r.fejlet++;
        else r.fejl++;
        continue;
      }

      // Interne handlinger
      if (toer) {
        r.ville_sende++;
        continue;
      }
      if (raekke.handling === "venteplads_udloeb") {
        // Dag 7 uden svar: tilbuddet udløber og køen går selv videre
        // (_shared/venteliste.ts skriver klokken). Ingen overgang i A's motor —
        // ansøgningen er og bliver lukket.
        const res = await pladsUdloebet(admin, a.id, nu);
        await admin.from("planlagte_haendelser").update({ status: "udfoert", udfoert_at: nu.toISOString() }).eq("id", raekke.id);
        console.log(`[ansoegning-rykker-cron] venteplads_udloeb for ${a.id}: ${res.udfald}${res.udfald === "udloebet" ? ` → ${res.naeste.udfald}` : ""}`);
        r.udfoerte++;
        continue;
      }

      if (raekke.handling === "pause_slut") {
        // Pausen slutter på datoen (18/9 aften): SAMME dom som rådgiverens «Genoptag nu» og ansøgerens
        // «Tag den op igen» — motorens genoptag rydder paa_pause_til, annullerer trappen «pause», skriver
        // sporet (via «koe») og starter INGEN trappe; klokken nedenfor er det, rådgiveren får. Rækken
        // stemples udført FØR motoren, så dens annullering af trappen ikke rammer netop denne række.
        // Er pausen flyttet frem (datoen efter i dag), er rækken forældet — den annulleres.
        const pauseDato = a.paa_pause_til;
        if (!pauseDato || pauseDato > kbhDato(nu)) {
          await admin.from("planlagte_haendelser").update({ status: "annulleret", annulleret_at: nu.toISOString(), annulleret_grund: pauseDato ? `pausen er flyttet til ${pauseDato}` : "ansøgningen er ikke på pause" }).eq("id", raekke.id);
          r.annulleret++;
          continue;
        }
        await admin.from("planlagte_haendelser").update({ status: "udfoert", udfoert_at: nu.toISOString() }).eq("id", raekke.id);
        const res = await udfoerOvergang(admin, { ansoegning: a, handling: { art: "genoptag" }, via: "koe", truffetAf: null, nu });
        if (res.ok === false) {
          console.error(`[ansoegning-rykker-cron] pause_slut: genoptag afvist for ${a.id}: ${res.grund}`);
          r.fejl++;
          continue;
        }
      } else {
        const art = raekke.handling === "marker_afholdt" ? "afholdt" : raekke.handling === "luk_svarer_ikke" ? "svarer_ikke" : "udloeb";
        const res = await udfoerOvergang(admin, { ansoegning: a, handling: { art }, via: "koe", truffetAf: null, nu });
        if (res.ok === false) {
          await admin.from("planlagte_haendelser").update({ status: "annulleret", annulleret_at: nu.toISOString(), annulleret_grund: res.grund }).eq("id", raekke.id);
          r.annulleret++;
          continue;
        }
      }
      await admin.from("planlagte_haendelser").update({ status: "udfoert", udfoert_at: nu.toISOString() }).eq("id", raekke.id);
      const klokke = raadgiverKlokke(a, raekke.handling);
      await skrivRaadgiverBesked(admin, { ...klokke, reference_type: REFERENCE_TYPE, reference_id: a.id });
      r.udfoerte++;
    } catch (err) {
      console.error(`[ansoegning-rykker-cron] række ${raekke.id} kastede:`, err);
      r.fejl++;
    }
  }
  return r;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;

  let toer = true;
  let nu = new Date();
  try {
    const body = await req.json();
    if (body?.dry_run === false) toer = false;
    // Kun i tørkørsel må «nu» sættes — til at læse hvad køen ville gøre på et andet tidspunkt.
    if (toer && typeof body?.nu === "string" && !Number.isNaN(Date.parse(body.nu))) nu = new Date(body.nu);
  } catch { /* ingen body: tørkørsel */ }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const resultat = await koer(admin, toer, nu);
  console.log("[ansoegning-rykker-cron] Summary:", JSON.stringify(resultat));
  return json(resultat, resultat.ok ? 200 : 500);
});

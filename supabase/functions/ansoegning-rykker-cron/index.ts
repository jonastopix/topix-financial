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
//   3. send_mail: mailen bygges (ansoegningRykkerMails.ts) og sendes gennem
//      sendManagedEmail med idempotencyKey = idempotensnoegle → message_id i
//      email_send_log (UNIQUE WHERE status = sent). Kun ved sendt: status
//      sendt, sendt_til, udfoert_at, message_id, og ansoegninger.rykkere_sendt
//      tælles op (trin_nr > 0). Spærret modtager → rækken markeres fejlet
//      uden retry. Anden fejl → fejl_antal++ (tre forsøg, så fejlet).
//   4. luk_svarer_ikke / udloeb / marker_afholdt → udfoerOvergang (via koe)
//      → status udfoert; rådgiveren får en klokke. pause_slut → klokke.
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
import { sendManagedEmail } from "../_shared/managedEmail.ts";
import { skrivRaadgiverBesked } from "../_shared/raadgiverBesked.ts";
import { afgoerSending, TRAPPER_PAA_LUKKET, TRAPPER_UDEN_DAGSREGEL, type KoeHandling } from "../_shared/rykkerkoe.ts";
import { grundTekst, koeNummer, type AfslagsIndhold } from "../_shared/afslagsTilbud.ts";
import type { VentepladsRaekke } from "../_shared/ventelisteDom.ts";
import { erAabentTrin, erPaaPause, trappensTrin, type Trappe } from "../_shared/ansoegningTrin.ts";
import { kbhDato, kbhTilUtc } from "../_shared/hverdage.ts";
import { bygRykkerMail, type VentepladsKontekst } from "../_shared/ansoegningRykkerMails.ts";
import { KONTAKT_ADRESSE } from "../_shared/indgangsMail.ts";
import { hentAnsoegerensPladser, pladsUdloebet } from "../_shared/venteliste.ts";
import { erBloedUdgave } from "../_shared/ventelisteDom.ts";
import { tagPladsenLink, afslaaPladsenLink } from "../_shared/ansoegningMotor.ts";
import { afgoerFremdrift, TOMME_SVAR, type AnsoegningsSvar } from "../_shared/ansoegningSkema.ts";
import {
  ansoegerLink,
  fornavnAf,
  hentAnsoegning,
  ikkeNuLink,
  RAADGIVER_BESKED,
  REFERENCE_TYPE,
  udfoerOvergang,
  virksomhedsnavnAf,
  type AnsoegningRaekke,
} from "../_shared/ansoegningMotor.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Højst så mange rækker pr. kørsel — kørslen varer under kald_edge's 30 s. */
const BATCH = 50;
/** Efter så mange fejl står rækken som fejlet og tages ikke igen. */
const MAKS_FEJL = 3;

interface Raekke {
  id: string;
  ansoegning_id: string;
  trappe: Trappe;
  trin_nr: number;
  handling: KoeHandling;
  skabelon: string | null;
  modtager: "ansoeger" | "raadgiver";
  planlagt_til: string;
  idempotensnoegle: string;
  udskudt_antal: number;
  fejl_antal: number;
}

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
    .select("sendt_til")
    .eq("status", "sendt")
    .not("trappe", "in", `(${TRAPPER_UDEN_DAGSREGEL.join(",")})`)
    .gte("udfoert_at", fra);
  if (error) {
    console.error("[ansoegning-rykker-cron] sendtIDag fejlede — fail-closed: alle regnes som «har fået»:", error.message);
    return new Set(["*"]);
  }
  return new Set((data ?? []).map((r: { sendt_til: string | null }) => (r.sendt_til ?? "").toLowerCase()).filter(Boolean));
}

/**
 * Afslagsmailen: grunden, køpladserne (C's ventepladser — nummeret regnes som
 * rådgiverens venteliste, sorterKoe; kun NUMRE, aldrig medlemmets navn) og om
 * der var en samtale (lukkeaarsag).
 * Fail-soft: kan køen ikke læses, sendes mailen uden pladsen (logget) — et nej
 * må ikke vente på en tabel.
 */
async function afslagsIndhold(admin: SupabaseClient, a: AnsoegningRaekke): Promise<AfslagsIndhold> {
  const ventepladser: AfslagsIndhold["ventepladser"] = [];
  try {
    // Samme læsning som C's hentAnsoegerensPladser/hentKoe (venteliste.ts), skrevet
    // inline så nummeret regnes over hele køen hos virksomheden; nummeret er C's sorterKoe.
    type Rad = { id: string; ansoegning_id: string; company_id: string; status: string; hvorfor: string | null; sat_at: string; ansoegninger: { lukket_at: string | null } | null };
    const tilRaekke = (r: Rad): VentepladsRaekke => ({ id: r.id, ansoegning_id: r.ansoegning_id, company_id: r.company_id, status: r.status as VentepladsRaekke["status"], sat_at: r.sat_at, afvist_at: r.ansoegninger?.lukket_at ?? null });
    const FELTER = "id, ansoegning_id, company_id, status, hvorfor, sat_at, ansoegninger!inner(lukket_at)";
    const { data: egne, error } = await admin.from("ventepladser").select(FELTER).eq("ansoegning_id", a.id).eq("status", "venter");
    if (error) throw new Error(error.message);
    for (const p of (egne ?? []) as unknown as Rad[]) {
      const { data: koe, error: koeErr } = await admin.from("ventepladser").select(FELTER).eq("company_id", p.company_id).in("status", ["venter", "tilbudt"]);
      if (koeErr) throw new Error(koeErr.message);
      const nummer = koeNummer(((koe ?? []) as unknown as Rad[]).map(tilRaekke), a.id);
      if (nummer !== null) ventepladser.push({ nummer });
    }
  } catch (err) {
    console.error(`[ansoegning-rykker-cron] ventepladser kunne ikke læses for ${a.id} — afslagsmailen sendes uden køplads:`, err);
  }
  return { grundTekst: grundTekst(a.afslagsgrund), ventepladser, efterSamtale: a.lukkeaarsag === "afslag_efter_samtale" };
}

/** Kladden: hvor mange af B's tolv felter mangler (afgoerFremdrift på rækkens svar). */
function manglendeSvar(a: AnsoegningRaekke): number {
  const svar: Record<string, unknown> = { ...TOMME_SVAR };
  for (const k of Object.keys(TOMME_SVAR)) svar[k] = (a as unknown as Record<string, unknown>)[k] ?? null;
  const f = afgoerFremdrift(svar as unknown as AnsoegningsSvar);
  return f.ialt - f.besvarede;
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
    .select("id, ansoegning_id, trappe, trin_nr, handling, skabelon, modtager, planlagt_til, idempotensnoegle, udskudt_antal, fejl_antal")
    .eq("status", "planlagt")
    .lte("planlagt_til", nu.toISOString())
    .order("planlagt_til", { ascending: true })
    .limit(BATCH);
  if (error) return { ...r, ok: false, error: error.message };
  r.forfaldne = raekker?.length ?? 0;
  if (r.forfaldne === 0) return r;

  const harFaaet = await sendtIDag(admin, nu);
  const failClosed = harFaaet.has("*");

  for (const raekke of raekker as Raekke[]) {
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
          (raekke.trappe === "pause" && !paaPause));
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
        if (!email) {
          if (!toer) await admin.from("planlagte_haendelser").update({ status: "fejlet", fejl: "ansøgningen har ingen e-mail", fejl_antal: raekke.fejl_antal + 1 }).eq("id", raekke.id);
          r.fejlet++;
          continue;
        }
        const mail = bygRykkerMail(raekke.skabelon ?? "", {
          fornavn: fornavnAf(a.navn),
          virksomhedsnavn: virksomhedsnavnAf(a),
          bookingUrl: ansoegerLink(a.token),
          moedeLink: a.samtale_link,
          nu,
          statusUrl: ansoegerLink(a.token),
          ikkeNuUrl: ikkeNuLink(a.token),
          samtaleStart: a.samtale_start ? new Date(a.samtale_start) : null,
          aftaleUrl: a.aftale_url,
          token: a.token,
          manglerSvar: raekke.trappe === "kladde" ? manglendeSvar(a) : null,
          afslag: raekke.trappe === "afslag" ? await afslagsIndhold(admin, a) : null,
          // Kvitteringen (trappen «indsendt», 18/9): det ansøgeren skrev, så de kan se vi har det.
          svar: { udfordring: a.udfordring, proevet: a.proevet, omTolvMaaneder: a.om_tolv_maaneder },
          venteplads: venteplads
            ? ({
                bloed: erBloedUdgave(a.lukket_at, nu),
                svarfrist: new Date(venteplads.tilbud_udloeber_at ?? nu.toISOString()),
                tagPladsenUrl: tagPladsenLink(a.token),
                afslaaPladsenUrl: afslaaPladsenLink(a.token),
              } satisfies VentepladsKontekst)
            : null,
        });
        if (!mail) {
          if (!toer) await admin.from("planlagte_haendelser").update({ status: "fejlet", fejl: `ukendt skabelon ${raekke.skabelon}`, fejl_antal: MAKS_FEJL }).eq("id", raekke.id);
          r.fejlet++;
          continue;
        }
        if (toer) {
          console.log(`[ansoegning-rykker-cron] TØRKØRSEL ville sende ${raekke.skabelon} til ${email} (${virksomhedsnavnAf(a)})`);
          r.ville_sende++;
          harFaaet.add(email);
          continue;
        }
        const res = await sendManagedEmail({
          adminClient: admin,
          to: email,
          subject: mail.emne,
          html: mail.html,
          text: mail.tekst,
          label: raekke.skabelon!,
          idempotencyKey: raekke.idempotensnoegle,
          // Svar går til Jonas (kontakt@ viderestilles — bekræftet 18/9), ikke til noreply@: tre af mailene siger «svar på denne mail».
          replyTo: KONTAKT_ADRESSE,
          metadata: { ansoegning_id: a.id, trappe: raekke.trappe, trin_nr: raekke.trin_nr },
        });
        if (res.sent === false) {
          const endeligt = res.reason === "recipient_suppressed" || raekke.fejl_antal + 1 >= MAKS_FEJL;
          await admin.from("planlagte_haendelser")
            .update({ status: endeligt ? "fejlet" : "planlagt", fejl: `${res.reason}${"error" in res ? `: ${res.error}` : ""}`.slice(0, 500), fejl_antal: raekke.fejl_antal + 1 })
            .eq("id", raekke.id);
          if (res.reason === "rate_limited") {
            console.error("[ansoegning-rykker-cron] rate limit — kørslen stopper; resten tages næste kvarter");
            r.fejl++;
            break;
          }
          if (endeligt) r.fejlet++;
          else r.fejl++;
          continue;
        }
        await admin.from("planlagte_haendelser")
          .update({ status: "sendt", udfoert_at: nu.toISOString(), sendt_til: email, message_id: res.messageId })
          .eq("id", raekke.id);
        if (raekke.trin_nr > 0) {
          await admin.from("ansoegninger").update({ rykkere_sendt: a.rykkere_sendt + 1 }).eq("id", a.id);
        }
        harFaaet.add(email);
        r.sendte++;
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
        // Rettelse 19/9 (recon §8 punkt 4): pausen skal slippe. Kolonnen ryddes når dagen er nået —
        // ellers ser statussiden, bookingen og rådgiverens samtaleafsnit «på pause» for evigt.
        // Kun den pause rækken hører til (samme dato), så en pause der er flyttet frem ikke ryddes.
        const pauseDato = a.paa_pause_til;
        if (pauseDato && pauseDato <= kbhDato(nu)) {
          const { error: pauseErr } = await admin.from("ansoegninger").update({ paa_pause_til: null }).eq("id", a.id).eq("paa_pause_til", pauseDato);
          if (pauseErr) console.error(`[ansoegning-rykker-cron] paa_pause_til kunne ikke ryddes for ${a.id}:`, pauseErr.message);
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

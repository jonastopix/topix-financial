/**
 * klaviyo-hentning-cron — LAG 5: Klaviyos mailhændelser tilbage i vores base.
 *
 * BUCKET B (service-role/cron). `authenticateServiceRole(req)` FØRST, før der
 * overhovedet læses en body.
 *
 * ── HVAD DEN GØR ────────────────────────────────────────────────────────────
 * For hver af de tre arter (modtaget · åbnet · klikket) henter den fra sit eget
 * vandmærke og fremad, side for side, og skriver én række pr. hændelse pr.
 * person. Kampagnehændelser sorteres fra — alt med `$flow` kommer med, uanset hvilket flow (20/9: ingen hardkodet liste).
 *
 * ── RYTMEN (Jonas 20/9) ─────────────────────────────────────────────────────
 * Hver time normalt; hvert kvarter på en dag med en session. Det ligger i
 * pg_cron-jobbet (migrationen), ikke her: ét job hvert kvarter, hvis SQL-vagt
 * kun lader kaldet gå igennem på hele timer — medmindre webinar_tilmeldinger
 * har en session i dag (dansk tid). Ingen skal huske at ændre noget tirsdag
 * morgen eller rulle tilbage onsdag.
 *
 * ── HISTORIKKEN KØRES I HÅNDEN ──────────────────────────────────────────────
 *   {"dry_run": false, "fra": "2025-01-01T00:00:00Z"}
 * — kaldt gentagne gange gennem kald_edge, til alt_faerdigt er true. Eksplicit
 * «fra» slår vandmærket; vandmærket går aldrig tilbage.
 *
 * ── TØRKØRSEL ER STANDARD ───────────────────────────────────────────────────
 * Uden body, eller uden «dry_run: false», hentes der, men skrives ikke. Så kan
 * kørslen prøves mod prod uden at efterlade noget. Samme regel som husets
 * øvrige croner.
 *
 * ── VANDMÆRKET RYKKES KUN VED FÆRDIG KØRSEL ─────────────────────────────────
 * Stopper vi på budget, loft eller fejl, bliver vandmærket stående. Næste kørsel
 * henter samme spænd igen, og dubletterne dør på `klaviyo_event_id`, som er unik.
 * **En dublet er til at leve med; et hul er ikke.** Havde vi rykket vandmærket
 * ved en halv kørsel, ville hullet aldrig blive fundet — ingen senere kørsel
 * leder efter det.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { hentArt, startAfIDag, STANDARD_BUDGET_MS } from "../_shared/klaviyoHentning.ts";
import { ARTER, type Mailart, type Mailhaendelsesraekke } from "../_shared/klaviyoMailhaendelser.ts";
import { KLAVIYO_SECRET } from "../_shared/klaviyo.ts";

const LOG = "[klaviyo-hentning-cron]";

/** Alt, cronen forstår. Står der noget andet i bodyen, afvises kaldet. */
export const KENDTE_FELTER = ["dry_run", "fra", "arter"] as const;


const json = (krop: unknown, status = 200) =>
  new Response(JSON.stringify(krop), { status, headers: { "Content-Type": "application/json" } });

interface ArtResultat {
  art: Mailart;
  hentet: number;
  skrevet: number;
  frasorteret_kampagner: number;
  ubrugelige: number;
  sider: number;
  faerdig: boolean;
  grund: string;
  vandmaerke_foer: string;
  vandmaerke_efter: string;
}

Deno.serve(async (req: Request) => {
  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;

  let toerKoersel = true;
  let raaBody: Record<string, unknown> | null = null;
  try {
    raaBody = (await req.json()) as Record<string, unknown>;
    if (raaBody?.dry_run === false) toerKoersel = false;
  } catch {
    /* ingen body, sikker tørkørsel */
  }

  // En body, man ikke forstår, må aldrig blive til en standardkørsel.
  // Se _shared/kendteFelter.ts — og PR #1027, hvor et vindue blev tavst ignoreret.
  const ukendte = ukendteFelter(raaBody, KENDTE_FELTER);
  if (ukendte.length > 0) {
    const besked = ukendteFelterBesked(ukendte, KENDTE_FELTER);
    console.error(`${LOG} ${besked}`);
    return json({ ok: false, koerte: true, toer_koersel: toerKoersel, grund: "ukendt_felt", error: besked }, 400);
  }

  const noegle = Deno.env.get(KLAVIYO_SECRET);
  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Hvilke arter? Standard: alle tre. En enkelt kan bedes om ved genopretning.
  const oenskede: Mailart[] = Array.isArray(raaBody?.arter)
    ? (raaBody!.arter as unknown[]).filter((a): a is Mailart => ARTER.includes(a as Mailart))
    : [...ARTER];
  if (oenskede.length === 0) {
    return json({ ok: false, koerte: true, grund: "ingen_arter", error: `«arter» skal være en delmængde af ${ARTER.join(", ")}` }, 400);
  }

  const start = Date.now();
  const resultater: ArtResultat[] = [];

  for (const art of oenskede) {
    // Budgettet DELES mellem arterne. Tre arter à 25 s ville blive 75 s, og
    // så er det ikke et budget længere.
    const brugt = Date.now() - start;
    const tilbage = STANDARD_BUDGET_MS - brugt;
    if (tilbage < 2000) {
      console.warn(`${LOG} budget brugt før ${art}`);
      break;
    }

    const { data: vm } = await db.from("klaviyo_hentning").select("hentet_til").eq("art", art).maybeSingle();
    const vandmaerke = typeof vm?.hentet_til === "string" ? vm.hentet_til : null;
    // EKSPLICIT SLÅR GEMT. Et «fra» i bodyen er en beslutning (den historiske
    // hentning); vandmærket er en bogføring. Uden begge: fra i dag.
    const fra = typeof raaBody?.fra === "string" ? raaBody.fra : (vandmaerke ?? startAfIDag(new Date()));

    const r = await hentArt({ noegle, art, fra, budgetMs: tilbage });

    let skrevet = 0;
    if (!toerKoersel && r.raekker.length > 0) {
      // I portioner: et upsert med tusindvis af rækker er én transaktion, der
      // kan ramme loftet og tabe det hele. 500 ad gangen taber højst 500.
      for (let i = 0; i < r.raekker.length; i += 500) {
        const portion: Mailhaendelsesraekke[] = r.raekker.slice(i, i + 500);
        const { error } = await db.from("klaviyo_mailhaendelser")
          .upsert(portion, { onConflict: "klaviyo_event_id", ignoreDuplicates: true });
        if (error) { console.error(`${LOG} ${art}: skrivning fejlede — ${error.message}`); break; }
        skrevet += portion.length;
      }
    }

    // VANDMÆRKET RYKKES KUN VED FÆRDIG KØRSEL — og ALDRIG TILBAGE. En historisk
    // hentning med «fra: 2025-01-01» når frem til i dag og må ikke efterlade
    // vandmærket i 2025; en kørsel, der stopper før det gemte, må ikke trække det.
    const nytVandmaerke = r.faerdig && r.naaet_til && (vandmaerke === null || r.naaet_til > vandmaerke) ? r.naaet_til : null;
    if (!toerKoersel && nytVandmaerke) {
      await db.from("klaviyo_hentning").upsert(
        { art, hentet_til: nytVandmaerke, sidste_koersel: new Date().toISOString(), sidste_grund: r.grund, antal_hentet: r.raekker.length },
        { onConflict: "art" },
      );
    }

    resultater.push({
      art, hentet: r.raekker.length, skrevet,
      frasorteret_kampagner: r.frasorteret_kampagner, ubrugelige: r.ubrugelige,
      sider: r.sider, faerdig: r.faerdig, grund: r.grund,
      vandmaerke_foer: vandmaerke ?? "(intet)", vandmaerke_efter: nytVandmaerke ?? vandmaerke ?? "(intet)",
    });
    console.log(`${LOG} ${art}: ${r.raekker.length} hentet, ${skrevet} skrevet, ${r.sider} sider, ${r.grund}`);
  }

  const altFaerdigt = resultater.length === oenskede.length && resultater.every((r) => r.faerdig);
  return json({
    ok: true,
    koerte: true,
    toer_koersel: toerKoersel,
    alt_faerdigt: altFaerdigt,
    varighed_ms: Date.now() - start,
    resultater,
  });
});

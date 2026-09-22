/**
 * cvr_opslag_cache — ÉN rækkebygger og ÉN skriver for alle tre forbrugere af
 * DataCVR-nøglen (19/9-2026, recon-boelgen-2 §3 + udkast-cvr-loft §9).
 *
 * FUNDET DER GJORDE DET NØDVENDIGT. Nøglen har tre forbrugere, men kun ÉN
 * skrev i cachen:
 *   ansoegning-cvr        skriver     → tælles   (dagsloftet gælder)
 *   berig-virksomheder    skrev IKKE  → usynlig  (20 pr. kørsel)
 *   send-til-underskrift  skrev IKKE  → usynlig  (1 pr. aftale ved cache-miss)
 *
 * `opslagIDag` tæller rækker i cvr_opslag_cache fra i dag. Derfor betød
 * «20 af 20 brugt» IKKE «20 af 25 brugt hos DataCVR»: én kørsel af
 * berigelsen lagde 20 oveni, som hverken tælleren, loftet eller klokken ved
 * 80 % kunne se. Med 25 opslag i døgnet (gratisplanen, målt 19/9) er den
 * blindhed større end selve loftet.
 *
 * HVORFOR DE TO IKKE SKREV — målt, ikke gættet: de kalder `slaaCvrOp(cvr)`,
 * som er en ren HTTP-funktion UDEN databaseadgang. Kun kalderen har en
 * klient, og indtil nu var det kun ansoegning-cvr, der brugte sin. Det var
 * ikke en forglemmelse i logikken; det var en signatur uden et sted at
 * skrive hen.
 *
 * OG HVORFOR DE IKKE BARE KUNNE SKRIVE DET, DE HAVDE. `CvrOpslag.svar` er en
 * OMDØBT DELMÆNGDE af DataCVR's svar (`founded`, `industry_label`, …), mens
 * `tolkCvrTilAnsoeger` læser den RÅ body (`startdate`, `industrydesc`,
 * `website`). En række skrevet ud fra `svar` alene ville få `visning: null`
 * — og ansoegning-cvr læser netop `udfald === "fundet" && visning` som
 * betingelse: en «fundet»-række uden visning bliver til «findes ikke» over
 * for ansøgeren. Derfor bygges rækken ÉT sted, af det rå svar, og alle tre
 * skriver den samme form.
 *
 * ALDRIG DEN RÅ BODY I BASEN. `svar` er den navngivne delmængde,
 * `visning` er de fire felter ansøgeren ser. Kildeværn holder på det.
 */
import { tolkCvrTilAnsoeger } from "./cvrAnsoeger.ts";
import type { CvrVisning } from "./ansoegningSkema.ts";
import { tolkDataCvrSvar, type CvrOpslag } from "./cvrOpslag.ts";

/**
 * DENNE FIL ER DENO-FRI MED VILJE. Den importerer hverken
 * virksomhedsOprettelse.ts (som har `Deno.env` og et esm.sh-import) eller
 * noget andet med globaler — for så snart en vitest-prøve importerer den,
 * trækkes hele kæden ind i tsc's graf, og `Deno` findes ikke dér. Derfor
 * gentages det rå svars form her som en STRUKTUREL type (den er assignable
 * fra virksomhedsOprettelse.DataCvrRaa), og selve hentningen bor hos
 * `slaaOpOgGem` i virksomhedsOprettelse.ts, hvor fetcheren allerede er.
 */
export type RaaSvar =
  | { slags: "svar"; status: number; body: unknown }
  | { slags: "noegle_mangler" }
  | { slags: "fejl"; grund: string };

/** Samme dom som virksomhedsOprettelse.udfaldAf — gentaget her for at holde filen Deno-fri. */
function udfaldAfRaa(raa: RaaSvar): CvrOpslag {
  if (raa.slags === "noegle_mangler") return { udfald: "noegle_mangler" };
  if (raa.slags === "fejl") return { udfald: "fejl", grund: raa.grund };
  return tolkDataCvrSvar(raa.status, raa.body);
}

/**
 * HVOR LÆNGE EN RÆKKE I CACHEN ER FRISK — ÉT HJEM (22/9-2026).
 *
 * Tallene stod som lokale konstanter i ansoegning-cvr. Da rådgiverens manuelle
 * opslag (ansoegning-cvr-opslag) skulle læse den SAMME cache med den SAMME
 * friskhed, ville en kopi have været to tal for det samme — og to functions,
 * der efter et halvt år er uenige om, hvornår et opslag er gammelt.
 */
/** Et fundet CVR genbruges fra cachen i så mange dage. */
export const CACHE_DAGE_FUNDET = 30;
/** «Findes ikke» genbruges én dag — en nystiftet virksomhed dukker op. */
export const CACHE_DAGE_FINDES_IKKE = 1;

/**
 * Er rækken stadig frisk? Ren funktion over rækkens eget udfald og alder.
 * Ugyldig `slaaet_op_at` er IKKE frisk (fail-closed): hellere ét opslag for
 * meget end en visning, der stammer fra en dato, vi ikke kan læse.
 */
export function erFriskCache(udfald: "fundet" | "findes_ikke", slaaetOpAt: string, nu: Date = new Date()): boolean {
  const t = Date.parse(slaaetOpAt);
  if (!Number.isFinite(t)) return false;
  const alderDage = (nu.getTime() - t) / 86_400_000;
  if (alderDage < 0) return false;
  return alderDage <= (udfald === "fundet" ? CACHE_DAGE_FUNDET : CACHE_DAGE_FINDES_IKKE);
}

/** Rækken i cvr_opslag_cache. Samme form fra alle tre skrivere. */
export interface CvrCacheRaekke {
  cvr: string;
  udfald: "fundet" | "findes_ikke";
  /** DataCVR's navngivne delmængde — aldrig den rå body. */
  svar: unknown;
  /** De fire felter ansøgeren ser. Null ville få formularen til at sige «findes ikke». */
  visning: CvrVisning | null;
  slaaet_op_at: string;
}

export interface Bygget {
  /**
   * Rækken der skal gemmes — null når opslaget hverken fandt eller afviste
   * (fejl, grænse, nøgle mangler). De cachetes med vilje IKKE: et genforsøg
   * skal være et nyt kald, ikke en gemt fiasko.
   */
  raekke: CvrCacheRaekke | null;
  /** Udfaldet, uændret, så kalderen kan handle som før. */
  udfald: CvrOpslag;
}

/**
 * Byg cache-rækken af det RÅ DataCVR-svar. Ren funktion — ingen database,
 * ingen Deno. Det er her de tre skrivere bliver ens.
 */
export function cacheRaekkeAf(cvr: string, raa: RaaSvar, nu: Date = new Date()): Bygget {
  const udfald = udfaldAfRaa(raa);
  if (udfald.udfald === "fundet") {
    const visning = raa.slags === "svar" ? tolkCvrTilAnsoeger(raa.body) : null;
    return {
      udfald,
      raekke: { cvr, udfald: "fundet", svar: udfald.svar, visning, slaaet_op_at: nu.toISOString() },
    };
  }
  if (udfald.udfald === "findes_ikke") {
    return { udfald, raekke: { cvr, udfald: "findes_ikke", svar: null, visning: null, slaaet_op_at: nu.toISOString() } };
  }
  return { udfald, raekke: null };
}

/** Så lidt af Supabase-klienten som skrivningen behøver — så modulet kan prøves uden en rigtig klient. */
export interface CacheSkriver {
  from(tabel: string): {
    upsert(raekke: unknown, valg: { onConflict: string }): PromiseLike<{ error: { message: string } | null }>;
  };
}

/**
 * Gem rækken. KASTER ALDRIG og stopper aldrig kalderen: en fejlet
 * cache-skrivning må ikke vælte en berigelse eller en aftaleudsendelse.
 * Fejler den, er konsekvensen kun, at opslaget ikke blev talt — og det
 * logges, så det kan ses.
 */
export async function gemICache(skriver: CacheSkriver, raekke: CvrCacheRaekke | null): Promise<void> {
  if (!raekke) return;
  try {
    const { error } = await skriver.from("cvr_opslag_cache").upsert(raekke, { onConflict: "cvr" });
    if (error) console.error(`[cvrCache] kunne ikke gemme opslaget på ${raekke.cvr} — det tælles derfor ikke:`, error.message);
  } catch (e) {
    console.error(`[cvrCache] cache-skrivningen kastede for ${raekke.cvr}:`, e);
  }
}

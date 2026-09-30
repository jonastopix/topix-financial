import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  andelsdom,
  annoncespor,
  SPOR_FORHOLD_FRA,
  sporForklaring,
  sporMaerke,
  type Tilmelding,
} from "@/lib/webinar/dashboard";
import { TROVAERDIG_FRA } from "@/lib/webinar/annoncepriser";
import { PERSONER_FOR_ET_FORHOLD } from "@/lib/marketing/maalingsdom";
import * as deno from "../../../../supabase/functions/_shared/webinarDashboard.ts";

/**
 * Wilson på annoncesporet (30/9-2026). Tre ting prøves:
 *   1. DOMMEN: lag 6's interval, «for få» ERSTATTER procenten under grænsen,
 *      og «skiller sig ud» KUN når linjen og resten ikke overlapper.
 *      Tallene er de rigtige fra 22/9 (målt i prod 30/9, marketinganalytikerens
 *      værdivurdering): 52 af 192 mod en lille på 7 af 8.
 *   2. PARITET: serverens spejl (webinar-delt) svarer det samme.
 *   3. KILDEVÆRN: fladen skriver aldrig en rå procent af fremmødet — kun
 *      dommens ord — og dommen har ingen egen formel.
 */

describe("grænsen er husets ene grænse", () => {
  it("SPOR_FORHOLD_FRA = annoncepriserne = lag 6 = 5", () => {
    expect(SPOR_FORHOLD_FRA).toBe(5);
    expect(SPOR_FORHOLD_FRA).toBe(TROVAERDIG_FRA);
    expect(SPOR_FORHOLD_FRA).toBe(PERSONER_FOR_ET_FORHOLD);
  });
});

describe("andelsdom — 22/9 i tal", () => {
  it("52 af 192 «så færdigt» mod kampagnens anden annonce (32 af 101): 27 % (21–34 %), kan ikke afgøres", () => {
    const d = andelsdom(52, 192, 52 + 32, 192 + 101);
    expect(d.ord).toBe("27 % (21–34 %)");
    expect(d.restenOrd).toBe("32 % (23–41 %)");
    expect(d.udfald).toBe("kan_ikke_afgoeres");
    expect(d.retning).toBeNull();
    expect(sporMaerke(d)).toBe("");
    // Overlap siges aldrig som «ens».
    expect(sporForklaring(d, "så det færdigt")).toContain("IKKE ens");
    expect(sporForklaring(d, "så det færdigt")).not.toMatch(/\ber ens\b/);
  });

  it("7 af 8 mod resten af kampagnen (13 af 64): 88 % (53–98 %), skiller sig ud · højere", () => {
    const d = andelsdom(7, 8, 7 + 13, 8 + 64);
    expect(d.ord).toBe("88 % (53–98 %)");
    expect(d.udfald).toBe("skiller_sig_ud");
    expect(d.retning).toBe("hoejere");
    expect(sporMaerke(d)).toBe("skiller sig ud · højere");
  });

  it("den modsatte vej: en klart lavere linje er «lavere», ikke en farve", () => {
    const d = andelsdom(2, 60, 2 + 60, 60 + 100);
    expect(d.udfald).toBe("skiller_sig_ud");
    expect(d.retning).toBe("lavere");
  });

  it("under grænsen ERSTATTER «for få» procenten — intervallet findes ikke", () => {
    for (const [s, n] of [[1, 2], [4, 4], [0, 3], [3, 4]] as const) {
      const d = andelsdom(s, n, s + 50, n + 200);
      expect(d.udfald).toBe("for_faa");
      expect(d.interval).toBeNull();
      expect(d.ord).toBe("for få");
      expect(d.ord).not.toMatch(/%/);
      expect(sporMaerke(d)).toBe("");
    }
  });

  it("præcis på grænsen (5) regnes der", () => {
    const d = andelsdom(1, 5, 30, 100);
    expect(d.interval).not.toBeNull();
    expect(d.ord).toMatch(/%/);
  });

  it("nul afholdte er «–», ikke 0 %", () => {
    const d = andelsdom(0, 0, 10, 50);
    expect(d.udfald).toBe("ingen_afholdt");
    expect(d.ord).toBe("–");
  });

  it("er RESTEN under grænsen, kan intet afgøres — uanset hvor langt fra hinanden", () => {
    const d = andelsdom(50, 50, 50 + 0, 50 + 4);
    expect(d.restenOrd).toBeNull();
    expect(d.udfald).toBe("kan_ikke_afgoeres");
  });
});

// ── Gennem annoncesporet ────────────────────────────────────────────────────
const AFHOLDT = "2026-09-22T07:00:00.000Z";
const KOMMENDE = "2026-10-13T09:00:00.000Z";
const NU = new Date("2026-09-30T12:00:00.000Z");
let nr = 0;
const R = (kampagne: string, annonce: string, set: number | null, session_tid = AFHOLDT): Tilmelding => {
  nr++;
  return {
    ewebinar_id: `id-${nr}`, email: `p${nr}@x.dk`, navn: `P ${nr}`, webinar_id: "w1", webinar_titel: "W", session_tid, session_type: "Scheduled",
    registreret_at: "2026-09-10T09:00:00.000Z",
    state: session_tid === AFHOLDT ? (set === null ? "Missed" : "Watched") : "Registered",
    sidste_action: null, attended: set === null ? null : "true", subscribed: null, set_procent: set, set_procent_kilde: set === null ? null : "watchedPercentage",
    utm_source: "fb", utm_medium: "paid", utm_campaign: kampagne, utm_content: annonce, utm_term: null, fbclid: null,
    origin: null, first_origin: null, referrer: null, first_referrer: null, widget_source: null, by: null, land: null, enhed: null, tidszone: null, ad_id_udledt: null,
  } as Tilmelding;
};
const gange = (antal: number, lav: () => Tilmelding) => Array.from({ length: antal }, lav);

/** 22/9's Adv+-kampagne i lille: værkstedet 7 af 8 færdigt, de andre 13 af 64. */
const ADV = [
  ...gange(7, () => R("Adv+", "07-vaerkstedet", 90)), ...gange(1, () => R("Adv+", "07-vaerkstedet", null)),
  ...gange(13, () => R("Adv+", "12-dubai", 90)), ...gange(51, () => R("Adv+", "12-dubai", null)),
  ...gange(1, () => R("Adv+", "05-baaden", 90)),
  // Tilmeldt 13/10: må IKKE stå i nævneren — hun kan ikke være mødt op endnu.
  ...gange(40, () => R("Adv+", "07-vaerkstedet", null, KOMMENDE)),
];

describe("annoncespor bærer målingen", () => {
  const s = annoncespor(ADV, new Set(), NU, true);
  const k = s.kampagner[0];
  const vaerk = k.annoncer.find((a) => a.navn === "07-vaerkstedet")!;
  const baad = k.annoncer.find((a) => a.navn === "05-baaden")!;

  it("nævneren er de afholdte: 40 kommende står i tilmeldte, men ikke i grundlaget", () => {
    expect(vaerk.tilmeldte).toBe(48);
    expect(vaerk.maaling.grundlag).toBe(8);
    expect(vaerk.maaling.saaFaerdigt.ord).toBe("88 % (53–98 %)");
    expect(vaerk.maaling.saaFaerdigt.udfald).toBe("skiller_sig_ud");
  });

  it("annoncen måles mod de andre annoncer i SIN kampagne; en på 1 er «for få»", () => {
    expect(vaerk.maaling.saaFaerdigt.restenOrd).toBe("22 % (13–33 %)");
    expect(baad.maaling.saaFaerdigt.ord).toBe("for få");
    expect(baad.maaling.saaFaerdigt.interval).toBeNull();
  });

  it("kampagnen alene i sporet har ingen «andre» — kan ikke afgøres", () => {
    expect(k.maaling.saaFaerdigt.restenOrd).toBeNull();
    expect(k.maaling.saaFaerdigt.udfald).toBe("kan_ikke_afgoeres");
  });

  it("kun det næste webinar: ingen er afholdt, intet at regne", () => {
    const naeste = annoncespor(ADV.filter((r) => r.session_tid === KOMMENDE), new Set(), NU, true);
    expect(naeste.kampagner[0].maaling.grundlag).toBe(0);
    expect(naeste.kampagner[0].maaling.fremmoede.udfald).toBe("ingen_afholdt");
  });

  it("målingen bærer ingen person — kun tal og ord", () => {
    const tekst = JSON.stringify(s.kampagner.map((x) => x.maaling));
    expect(tekst).not.toMatch(/@/);
  });

  it("serverens spejl svarer det samme (webinar-delt)", () => {
    expect(deno.annoncespor(ADV, new Set(), NU, true)).toEqual(s);
    expect(deno.andelsdom(7, 8, 20, 72)).toEqual(andelsdom(7, 8, 20, 72));
  });
});

// ── Kildeværn ───────────────────────────────────────────────────────────────
const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

/**
 * Fladen viser fremmøde/«så færdigt» KUN gennem dommens ord: ingen pct() af
 * sporlinjens rå andele, ingen division af tællingerne, og intervallet læses
 * aldrig direkte (så «for få» kan ikke omgås ved at tegne `interval`).
 */
export const fladenSkriverIngenRaaProcent = (view: string): boolean => {
  const kode = udenKommentarer(view);
  return kode.includes("<SporSikkerhed l={l} />") &&
    kode.includes("{a.ord}") &&
    !/pct\(\s*l\.(fremmoedeAndel|gennemfoerselAndel)/.test(kode) &&
    !/l\.(moedteOp|saaFaerdigt)\s*\//.test(kode) &&
    !/\.interval\b/.test(kode) &&
    !/\.(nedre|oevre)\b/.test(kode);
};

/** Dommen bruger lag 6 — wilson + sammenlign fra statistik — og har ingen egen formel. */
export const dommenErLag6s = (dom: string): boolean => {
  const kode = udenKommentarer(dom);
  return /import \{[^}]*\bwilson\b[^}]*\} from "@\/lib\/marketing\/statistik";/.test(kode) &&
    /import \{[^}]*\bsammenlign\b[^}]*\} from "@\/lib\/marketing\/statistik";/.test(kode) &&
    !kode.includes("Math.sqrt") &&
    !/1\.96/.test(kode) &&
    // Under grænsen: intervallet er null i selve svaret.
    /udfald: "for_faa"/.test(kode) &&
    /if \(antal < SPOR_FORHOLD_FRA\) \{\n\s*return \{ succes: s, n: antal, interval: null, udfald: "for_faa"/.test(kode);
};

describe("kildeværn — Wilson på annoncesporet", () => {
  const VIEW = "src/components/hjemmebane/webinar/WebinarView.tsx";
  const DOM = "src/lib/webinar/dashboard.ts";

  it("fladen skriver ingen rå procent af fremmødet", () => {
    const v = laes(VIEW);
    expect(fladenSkriverIngenRaaProcent(v)).toBe(true);
    // Værnet virker — hver fejl indsat på en kopi fanges:
    expect(fladenSkriverIngenRaaProcent(v.replace("{a.ord}", "{pct(a.interval?.andel ?? null)}"))).toBe(false);
    expect(fladenSkriverIngenRaaProcent(v.replace("<SporSikkerhed l={l} />", "<span>{pct(l.fremmoedeAndel)}</span>"))).toBe(false);
    expect(fladenSkriverIngenRaaProcent(v.replace("<SporSikkerhed l={l} />", "<SporSikkerhed l={l} /><span>{Math.round(l.saaFaerdigt / l.tilmeldte * 100)}</span>"))).toBe(false);
    expect(fladenSkriverIngenRaaProcent(v.replace("<SporSikkerhed l={l} />", ""))).toBe(false);
  });

  it("dommen er lag 6's, og «for få» sletter intervallet", () => {
    const d = laes(DOM);
    expect(dommenErLag6s(d)).toBe(true);
    expect(dommenErLag6s(d.replace("return { succes: s, n: antal, interval: null, udfald: \"for_faa\"", "return { succes: s, n: antal, interval: wilson(s, antal), udfald: \"for_faa\""))).toBe(false);
    expect(dommenErLag6s(d.replace("const i = wilson(s, antal);", "const i = { nedre: p - 1.96 * Math.sqrt(p * (1 - p) / antal) };"))).toBe(false);
  });
});

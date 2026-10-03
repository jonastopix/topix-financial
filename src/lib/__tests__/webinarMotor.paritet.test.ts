import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as srcUr from "@/lib/webinarMotor/ur";
import * as denoUr from "../../../supabase/functions/_shared/webinarMotor/ur.ts";
import * as srcPuls from "@/lib/webinarMotor/puls";
import * as denoPuls from "../../../supabase/functions/_shared/webinarMotor/puls.ts";
import * as srcSpol from "@/lib/webinarMotor/spolning";
import * as denoSpol from "../../../supabase/functions/_shared/webinarMotor/spolning.ts";
import * as srcInt from "@/lib/webinarMotor/interaktioner";
import * as denoInt from "../../../supabase/functions/_shared/webinarMotor/interaktioner.ts";
import * as srcTil from "@/lib/webinarMotor/tilmelding";
import * as denoTil from "../../../supabase/functions/_shared/webinarMotor/tilmelding.ts";
import * as srcIcs from "@/lib/webinarMotor/ics";
import * as denoIcs from "../../../supabase/functions/_shared/webinarMotor/ics.ts";
import * as srcTok from "@/lib/webinarMotor/token";
import * as denoTok from "../../../supabase/functions/_shared/webinarMotor/token.ts";
import * as srcPlan from "@/lib/webinarMotor/sessionplan";
import * as denoPlan from "../../../supabase/functions/_shared/webinarMotor/sessionplan.ts";
import * as srcFrem from "@/lib/webinarMotor/fremmoede";
import * as denoFrem from "../../../supabase/functions/_shared/webinarMotor/fremmoede.ts";
import * as srcMail from "@/lib/webinarMotor/mail";
import * as denoMail from "../../../supabase/functions/_shared/webinarMotor/mail.ts";

/**
 * Paritet for webinarmotorens rene domme (skive 1, 30/9-2026), samme form som
 * chatVideo.paritet: for HVER fil er kroppen efter filhovedet ORDRET ens, ingen
 * af dem importerer noget, og hver peger på sit spejl. Dommene svarer desuden
 * ens på samme input.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const krop = (k: string) => k.slice(k.indexOf("*/") + 2);
const SRC_DIR = "src/lib/webinarMotor";
const DENO_DIR = "supabase/functions/_shared/webinarMotor";
const FILER = readdirSync(resolve(process.cwd(), SRC_DIR)).filter((f) => f.endsWith(".ts")).sort();

describe("webinarMotor.paritet — kildeteksten", () => {
  it("de to mapper har PRÆCIS de samme filer (elleve — skive 3 lagde fremmoede.ts og mail.ts til)", () => {
    const deno = readdirSync(resolve(process.cwd(), DENO_DIR)).filter((f) => f.endsWith(".ts")).sort();
    expect(deno).toEqual(FILER);
    expect(FILER).toEqual(["fremmoede.ts", "ics.ts", "interaktioner.ts", "mail.ts", "puls.ts", "sessionplan.ts", "spolning.ts", "svar.ts", "tilmelding.ts", "token.ts", "ur.ts"]);
  });

  for (const f of FILER) {
    it(`${f}: kroppen er byte-ens, ingen imports, og hver peger på sit spejl`, () => {
      const a = laes(`${SRC_DIR}/${f}`), b = laes(`${DENO_DIR}/${f}`);
      expect(krop(b)).toBe(krop(a));
      expect(krop(a).length).toBeGreaterThan(500);
      expect(a).not.toMatch(/^\s*import\s/m);
      expect(a).not.toMatch(/\bDeno\./);
      expect(krop(a)).not.toMatch(/\bDate\.now\(\)/); // tiden gives ind
      expect(a).toContain(`${DENO_DIR}/${f}`);
      expect(b).toContain(`${SRC_DIR}/${f}`);
    });
  }

  it("VÆRNET VIRKER: en ændring i kun det ene spejl fanges", () => {
    const a = krop(laes(`${SRC_DIR}/puls.ts`)).replace("export const STYKKE_SEK = 5;", "export const STYKKE_SEK = 10;");
    expect(a).not.toBe(krop(laes(`${SRC_DIR}/puls.ts`)));
    expect(krop(laes(`${DENO_DIR}/puls.ts`))).not.toBe(a);
  });
});

describe("webinarMotor.paritet — dommene svarer ens", () => {
  const S = { starterMs: Date.parse("2026-10-25T00:30:00Z"), varighedSek: 3600, introSek: 60, lobbyMin: 15, exitrumMin: 15 };

  it("ur", () => {
    for (let m = -30; m <= 100; m += 7) {
      const nu = S.starterMs + m * 60_000 + 13_000;
      expect(denoUr.positionDom(S, nu)).toEqual(srcUr.positionDom(S, nu));
    }
    for (const p of [0, 899, 900, 901, 3600, 4000]) expect(denoUr.senIndgangDom(p, 3600)).toEqual(srcUr.senIndgangDom(p, 3600));
    expect(denoUr.embedUdloebSek(S)).toBe(srcUr.embedUdloebSek(S));
  });

  it("spolning", () => {
    for (const f of [80, 97, 100, 103.5, 130]) for (const t of ["spiller", "pause", "buffer"] as const) for (const k of [null, 0, 5000]) {
      expect(denoSpol.spoleDom(100, f, t, k, 10_000)).toEqual(srcSpol.spoleDom(100, f, t, k, 10_000));
    }
  });

  it("puls og bits", () => {
    for (const [fp, p, ms, fv, t] of [[0, 15, 15_000, 15, "spiller"], [100, 130, 15_000, 130, "spiller"], [3590, 3605, 15_000, 3600, "slut"], [0, 10, 10_000, 10, "pause"], [50, 40, 5_000, 40, "spiller"]] as const) {
      const anker = { posSek: fp, serverMs: 0, tilstand: "spiller" };
      expect(denoPuls.pulsDom(anker, { posSek: p, tilstand: t }, ms, fv, 3600)).toEqual(srcPuls.pulsDom(anker, { posSek: p, tilstand: t }, ms, fv, 3600));
    }
    const n = srcPuls.antalStykker(3600);
    const a = srcPuls.saetBits(srcPuls.tomBitmap(3600), 3, 400, n);
    const b = denoPuls.saetBits(denoPuls.tomBitmap(3600), 3, 400, n);
    expect(Array.from(b.bits)).toEqual(Array.from(a.bits));
    expect(denoPuls.tilPgHex(b.bits)).toBe(srcPuls.tilPgHex(a.bits));
    expect(denoPuls.bitsTilProcent(398, 3600)).toBe(srcPuls.bitsTilProcent(398, 3600));
    expect(denoPuls.laesPulsKrop([{ enhed_id: "enhed-abc1", seq: 1, klient_ms: 1, pos_sek: 1, tilstand: "spiller", x: 1 }], [])).toEqual(srcPuls.laesPulsKrop([{ enhed_id: "enhed-abc1", seq: 1, klient_ms: 1, pos_sek: 1, tilstand: "spiller", x: 1 }], []));
  });

  it("interaktioner, tilmelding, sessionplan og ics", () => {
    const i = { id: "00000000-0000-4000-8000-000000000001", art: "cta" as const, vis_fra_sek: 10, vis_til_sek: 20, placering: "overlay" as const, indhold: { tekst: "t", knap: "k", maal: "ansoeg", nedtaelling: true }, betingelse: null, udloeber_kilde: "session_slut" as const };
    const t = { version: 1, interaktioner: [i] };
    for (const pos of [5, 10, 19, 20]) expect(denoInt.aktiveInteraktioner(t, "afspilning", pos, { svar: {}, setProcent: 0 })).toEqual(srcInt.aktiveInteraktioner(t, "afspilning", pos, { svar: {}, setProcent: 0 }));
    expect(denoInt.ctaVindue(i, { sessionSlutMs: 100, naesteSessionMs: null, optagFristMs: null }, 50)).toEqual(srcInt.ctaVindue(i, { sessionSlutMs: 100, naesteSessionMs: null, optagFristMs: null }, 50));
    const krop = { slug: "raad-1", session_id: "00000000-0000-4000-8000-000000000009", fornavn: "Anne", email: "A@B.DK" };
    expect(denoTil.laesTilmeldInput(krop)).toEqual(srcTil.laesTilmeldInput(krop));
    const s = [{ id: "a", starterMs: 5, status: "planlagt", type: "Scheduled", kapacitet: null, tilmeldte: null }];
    expect(denoPlan.naesteSessioner(s, 0)).toEqual(srcPlan.naesteSessioner(s, 0));
    const ics = { tilmeldingId: "11111111-2222-4333-8444-555555555555", sekvens: 1, metode: "REQUEST" as const, startMs: S.starterMs, slutMs: S.starterMs + 3_600_000, stempelMs: 0, titel: "æøå", beskrivelse: "x".repeat(300), url: "https://a", deltagerMail: "a@b.dk" };
    expect(denoIcs.bygIcs(ics)).toBe(srcIcs.bygIcs(ics));
  });

  it("skive 3: fremmøde, mailvej, intern og stierne", () => {
    const d = { foerste_ind_at: "2026-10-13T09:01:00Z", set_procent: 81.4 };
    const t = { state: "Joined", sidste_action: "Joined", set_procent: 80 };
    for (const [dd, tt] of [[d, t], [null, { state: "Registered", sidste_action: "Registered", set_procent: null }], [{ foerste_ind_at: "x", set_procent: 0 }, t]] as const) {
      expect(denoFrem.fremmoedeDom(dd, tt)).toEqual(srcFrem.fremmoedeDom(dd, tt));
      expect(denoFrem.fremmoedeRettelse(tt, srcFrem.fremmoedeDom(dd, tt))).toEqual(srcFrem.fremmoedeRettelse(tt, srcFrem.fremmoedeDom(dd, tt)));
    }
    expect(denoFrem.sessionKlarTilDom(1000, 301_000)).toBe(srcFrem.sessionKlarTilDom(1000, 301_000));
    expect(denoFrem.SENESTE_START_MS).toBe(srcFrem.SENESTE_START_MS);
    const o = { tilmeldingId: "11111111-2222-4333-8444-555555555555", kildeSystem: "platform", tokenVersion: 1, email: "a@topix.dk", slug: "raad", titel: "T", vaertNavn: null, starterMs: 1, slutMs: 2, icsSekvens: 0, sessionStatus: "planlagt" };
    for (const id of ["P-11111111-2222-4333-8444-555555555555", "abc123", "P-x"]) expect(denoMail.mailVejDom(id, o, true)).toEqual(srcMail.mailVejDom(id, o, true));
    expect(denoTil.internDom(true, "a@firma.dk")).toEqual(srcTil.internDom(true, "a@firma.dk"));
    expect(denoTok.kalenderSti("raad", "t.k")).toBe(srcTok.kalenderSti("raad", "t.k"));
    expect(denoTok.tilmeldSti("raad", "s")).toBe(srcTok.tilmeldSti("raad", "s"));
    expect(denoIcs.icsBeskrivelse("https://a", null)).toBe(srcIcs.icsBeskrivelse("https://a", null));
    const s = [{ id: "a", starterMs: 5, status: "planlagt", type: "Scheduled", kapacitet: null, tilmeldte: null, intern: true }];
    expect(denoPlan.naesteSessioner(s, 0)).toEqual(srcPlan.naesteSessioner(s, 0));
    expect(denoPlan.naesteSessioner(s, 0, 3, true)).toEqual(srcPlan.naesteSessioner(s, 0, 3, true));
  });

  it("token: et token bygget af det ene spejl læses af det andet", async () => {
    const t = await srcTok.byggDeltagertoken("s", "11111111-2222-4333-8444-555555555555", 4);
    expect(await denoTok.byggDeltagertoken("s", "11111111-2222-4333-8444-555555555555", 4)).toBe(t);
    expect(await denoTok.laesDeltagertoken("s", null, t)).toEqual(await srcTok.laesDeltagertoken("s", null, t));
  });
});

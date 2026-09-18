import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for rettelserne fra recon-sammenhæng (19/9): 1) dubletten ved e-underskrift fra
// ansøgningen — send-til-underskrift starter aftalegrundlags-trappen fra trin 1, så køens dag 0
// (samme link som aftale-link-mailen) aldrig går; 2) statussiden kender ventepladsen på en lukket
// ansøgning (svaret bærer den, dommen har grenene, siden viser ja/nej). Cronens pause og sporets
// ordbøger har egne værn (vejenVidere.guard dom 4, ansoegningSporOrd.guard). Selvbevis på kopier.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const SEND = "supabase/functions/send-til-underskrift/index.ts";
const MOTOR = "supabase/functions/_shared/ansoegningMotor.ts";
const LINK = "supabase/functions/ansoegning-link/index.ts";
const STATUS = "src/lib/ansoegning/status.ts";
const SIDE = "src/pages/AnsoegStatus.tsx";

/** 1: tilbud fra send-til-underskrift bærer startFraTrinNr: 1, og motoren lader kalderens tal vinde over dommens. */
export const ingenDubletVedESignatur = (send: string, motor: string): boolean =>
  /udfoerOvergang\(admin, \{ ansoegning, handling: \{ art: "tilbud" \}, via: "raadgiver", truffetAf: callerId, aftaleUrl: url, nu, startFraTrinNr: 1 \}\)/.test(send) &&
  motor.includes("startFraTrinNr?: number;") && motor.includes("fraTrinNr: args.startFraTrinNr ?? o.start.fraTrinNr,");

/** 2: svaret bærer ventepladser for lukkede (antal + frist, aldrig navn); dommen har tilbud/kø-grenene; siden viser knapperne. */
export const ventepladsenPaaStatussiden = (link: string, status: string, side: string): boolean =>
  link.includes('const ventepladser = a.trin === "lukket"') && link.includes("await hentAnsoegerensPladser(admin, a.id)") &&
  /\n\s*ventepladser,\n/.test(link) && !/ventepladser[\s\S]{0,400}company_id/.test(link.slice(link.indexOf("const ventepladser"), link.indexOf("const svar = () => ({"))) &&
  status.includes('if (v?.tilbud) {') && status.includes('plads: "tilbud", titel: "Du har et tilbud om en plads"') &&
  status.includes('plads: "koe", titel: "Du står i kø"') &&
  side.includes('v.plads === "tilbud"') && side.includes('onClick={() => setPladsSvar("ja")}') && side.includes('onClick={() => setPladsSvar("nej")}');

describe("sammenhaeng.guard — dubletten og ventepladsen på statussiden", () => {
  it("1. e-underskrift fra ansøgningen: køens dag 0 springes over (startFraTrinNr: 1)", () => {
    expect(ingenDubletVedESignatur(udenKommentarer(laes(SEND)), udenKommentarer(laes(MOTOR)))).toBe(true);
  });
  it("2. lukket med venteplads: svaret, dommen og siden", () => {
    expect(ventepladsenPaaStatussiden(udenKommentarer(laes(LINK)), udenKommentarer(laes(STATUS)), udenKommentarer(laes(SIDE)))).toBe(true);
  });
});

describe("sammenhaeng.guard — selvbevis", () => {
  const send = udenKommentarer(laes(SEND)); const motor = udenKommentarer(laes(MOTOR));
  const link = udenKommentarer(laes(LINK)); const status = udenKommentarer(laes(STATUS)); const side = udenKommentarer(laes(SIDE));
  it("1: uden startFraTrinNr i kaldet, eller en motor der ignorerer det, falder", () => {
    expect(ingenDubletVedESignatur(send.replace(", startFraTrinNr: 1 })", " })"), motor)).toBe(false);
    expect(ingenDubletVedESignatur(send, motor.replace("fraTrinNr: args.startFraTrinNr ?? o.start.fraTrinNr,", "fraTrinNr: o.start.fraTrinNr,"))).toBe(false);
  });
  it("2: svaret uden ventepladser, eller en side uden knapperne, falder", () => {
    expect(ventepladsenPaaStatussiden(link.replace(/\n\s*ventepladser,\n/, "\n"), status, side)).toBe(false);
    expect(ventepladsenPaaStatussiden(link, status, side.replace('onClick={() => setPladsSvar("ja")}', "onClick={undefined}"))).toBe(false);
  });
});

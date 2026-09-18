import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as hverdageWeb from "@/lib/hverdage";
import * as hverdageDeno from "../../../supabase/functions/_shared/hverdage.ts";
import * as trinWeb from "@/lib/ansoegningTrin";
import * as trinDeno from "../../../supabase/functions/_shared/ansoegningTrin.ts";
import * as koeWeb from "@/lib/rykkerkoe";
import * as koeDeno from "../../../supabase/functions/_shared/rykkerkoe.ts";
import * as anbWeb from "@/lib/ansoegningAnbefaling";
import * as anbDeno from "../../../supabase/functions/_shared/ansoegningAnbefaling.ts";

// Paritet mellem src/lib og _shared for ansøgningsmotorens fire rene domme
// (maanedsnoegleParitet-mønstret): funktionerne giver samme svar, OG
// kildeteksten efter filhovedet er ordret ens når «.ts» i imports
// normaliseres. Driver de fra hinanden, fejler denne fil højt.

const PAR = [
  ["src/lib/hverdage.ts", "supabase/functions/_shared/hverdage.ts"],
  ["src/lib/ansoegningTrin.ts", "supabase/functions/_shared/ansoegningTrin.ts"],
  ["src/lib/rykkerkoe.ts", "supabase/functions/_shared/rykkerkoe.ts"],
  ["src/lib/ansoegningAnbefaling.ts", "supabase/functions/_shared/ansoegningAnbefaling.ts"],
] as const;

/** Kroppen: alt efter det første blokkommentar-filhoved; imports normaliseret. */
export function krop(kilde: string): string {
  const slut = kilde.indexOf("*/");
  const efter = slut === -1 ? kilde : kilde.slice(slut + 2);
  return efter.replace(/from "\.\/([A-Za-z]+)\.ts"/g, 'from "./$1"');
}

describe("ansoegningMotor.paritet — kildeteksten er ordret ens efter filhovedet", () => {
  for (const [web, deno] of PAR) {
    it(`${web} ≡ ${deno}`, () => {
      const a = krop(readFileSync(resolve(process.cwd(), web), "utf8"));
      const b = krop(readFileSync(resolve(process.cwd(), deno), "utf8"));
      expect(a).toBe(b);
      expect(a.length).toBeGreaterThan(500);
    });
  }
  it("krop() fanger en afvigelse (selvbevis)", () => {
    expect(krop("/** a */\nexport const x = 1;\n")).not.toBe(krop("/** b */\nexport const x = 2;\n"));
    expect(krop('/** a */\nimport { y } from "./y.ts";\n')).toBe(krop('/** b */\nimport { y } from "./y";\n'));
  });
});

describe("ansoegningMotor.paritet — funktionerne svarer ens", () => {
  const tider = ["2026-09-18T12:37:00Z", "2026-09-19T08:00:00Z", "2026-12-24T09:00:00Z", "2026-03-29T00:30:00Z", "2026-10-25T00:30:00Z"].map((s) => new Date(s));
  it("hverdage", () => {
    for (const d of tider) {
      expect(hverdageWeb.kbhDato(d)).toBe(hverdageDeno.kbhDato(d));
      expect(hverdageWeb.erISendevindue(d)).toBe(hverdageDeno.erISendevindue(d));
      expect(hverdageWeb.naesteSendevindue(d).toISOString()).toBe(hverdageDeno.naesteSendevindue(d).toISOString());
      for (const n of [-1, 0, 2, 4, 7, 11, 14, 21]) {
        expect(hverdageWeb.planlagtTidspunkt(d, n).toISOString()).toBe(hverdageDeno.planlagtTidspunkt(d, n).toISOString());
      }
    }
    for (const aar of [2024, 2025, 2026, 2027, 2030]) expect(hverdageWeb.danskeHelligdage(aar)).toEqual(hverdageDeno.danskeHelligdage(aar));
  });
  it("ansoegningTrin", () => {
    const handlinger: trinWeb.Handling[] = [
      { art: "tal_med_dem" }, { art: "afvis" }, { art: "book" }, { art: "aflys_booking" }, { art: "afholdt" }, { art: "tilbud" },
      { art: "afslag" }, { art: "underskrevet" }, { art: "svarer_ikke" }, { art: "udloeb" }, { art: "ikke_nu" }, { art: "luk", aarsag: "andet" }, { art: "genaabn" }, { art: "saet_pause", til: "2026-12-10" }, { art: "afvis", grund: "niche" }, { art: "afslag", grund: "for_tidligt" }, { art: "afvis", grund: "andet" },
    ];
    for (const fra of trinWeb.TRIN) {
      for (const h of handlinger) {
        for (const ctx of [{ paaPause: false, lukketFraTrin: null }, { paaPause: true, lukketFraTrin: "booket" as const }]) {
          expect(trinWeb.afgoerOvergang(fra, h, ctx)).toEqual(trinDeno.afgoerOvergang(fra, h as trinDeno.Handling, ctx));
        }
      }
    }
  });
  it("rykkerkoe", () => {
    const id = "22222222-2222-4222-8222-222222222222";
    for (const anker of tider) {
      for (const trappe of trinWeb.TRAPPER_NAVNE) {
        expect(koeWeb.planlaegTrappe({ ansoegningId: id, trappe, anker, nu: anker })).toEqual(koeDeno.planlaegTrappe({ ansoegningId: id, trappe, anker, nu: anker }));
      }
      for (const harFaaet of [true, false]) {
        expect(koeWeb.afgoerSending({ nu: anker, planlagtTil: tider[0], handling: "send_mail", modtagerHarFaaetMailIDag: harFaaet }))
          .toEqual(koeDeno.afgoerSending({ nu: anker, planlagtTil: tider[0], handling: "send_mail", modtagerHarFaaetMailIDag: harFaaet }));
      }
    }
    expect(koeWeb.TRAPPER).toEqual(koeDeno.TRAPPER);
    expect(koeWeb.KOE_SKABELONER).toEqual(koeDeno.KOE_SKABELONER);
  });
  it("ansoegningAnbefaling", () => {
    const inputs: anbWeb.AnbefalingsInput[] = [
      { omsaetningsnoegle: "D", antalAnsatte: 12, branche: "Tømrer", stiftetAar: 2019, selskabsform: "ApS", cvrStatus: "Aktiv", setWebinar: "ja", kilde: "webinar", kildeRaa: null, udfordring: null, proevet: "Har selv prøvet at ansætte en projektleder, men det gav ikke overblik.", omTolvMaaneder: null, startTidspunkt: "hurtigst_muligt", nu: tider[0] },
      { omsaetningsnoegle: "A", antalAnsatte: null, branche: null, stiftetAar: null, selskabsform: null, cvrStatus: null, setWebinar: null, kilde: "anbefaling", kildeRaa: "Morten", udfordring: "x".repeat(50), proevet: null, omTolvMaaneder: null, startTidspunkt: null, nu: tider[0] },
      { omsaetningsnoegle: "C", antalAnsatte: 3, branche: "VVS", stiftetAar: 2026, selskabsform: null, cvrStatus: "Ophørt", setWebinar: "nej", kilde: "linkedin", kildeRaa: null, udfordring: null, proevet: null, omTolvMaaneder: "kort", startTidspunkt: "senere", nu: tider[0] },
    ];
    for (const i of inputs) expect(anbWeb.afgoerAnbefaling(i)).toEqual(anbDeno.afgoerAnbefaling(i as anbDeno.AnbefalingsInput));
  });
});

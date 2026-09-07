import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Driftværn for mobilens grønne bundstykke (kortet fra 4/9; resten rettet
// 7/9). To greb hører sammen på ENHVER fuldhøjde-Hb-rod: (1) højden er
// h-screen-SAFE / min-h-screen-SAFE (dvh med vh-fallback, index.css), for
// Tailwinds h-screen er 100vh og på mobil større end det synlige — under
// roden lå bodys mørkegrønne .dark-baggrund; (2) useHbDokumentGrund maler
// html papir mens fladen er mountet, for index.html er <html class="dark">
// permanent, og alt uden for fladens boks (overscroll, glimtet mellem to
// sider) viser lærredet. Det ene uden det andet er halvt: HbAdminShell,
// Betal og HB_RAMME-siderne fik begge 4/9; gates, kvittering og spinner
// fik ingen af dem før 7/9.
//
// Kildelæsning (husets form). I scope: .tsx-filer hvis KODE (kommentarer
// strippet) bærer «theme-hjemmebane» sammen med en skærmhøjde-klasse, eller
// importerer HB_RAMME (rammen bærer klassen; siden skal selv kalde hooket).
// Nestede Hb-flader (dialoger, drawers, popovers) har ingen skærmhøjde og
// falder uden for. lg:/md:/sm:-varianter er desktop-layout og tæller ikke.

const ROD = resolve(process.cwd(), "src");

function alleTsx(mappe: string): string[] {
  return readdirSync(mappe).flatMap((navn) => {
    const sti = join(mappe, navn);
    if (statSync(sti).isDirectory()) return navn === "__tests__" || navn === "node_modules" ? [] : alleTsx(sti);
    return navn.endsWith(".tsx") && !navn.endsWith(".test.tsx") ? [sti] : [];
  });
}
const udenKommentarer = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/** Skærmhøjde-klasser der IKKE er -safe og IKKE er en breakpoint-variant. */
const USIKKER_HOEJDE = /(?<![\w:-])(?:min-)?h-screen(?!-safe)\b/g;

const filer = alleTsx(ROD).map((sti) => {
  const rel = relative(process.cwd(), sti);
  const raa = readFileSync(sti, "utf8");
  const kode = udenKommentarer(raa);
  const hbRod = kode.includes("theme-hjemmebane") && /(?<![\w:-])(?:min-)?h-screen/.test(kode);
  const hbRamme = kode.includes("HB_RAMME");
  return { rel, kode, iScope: hbRod || hbRamme };
});
const iScope = filer.filter((f) => f.iScope);

describe("fuldhøjde-Hb-rødder har BÅDE -safe-højde OG useHbDokumentGrund", () => {
  it("værnet ser de kendte rødder (ikke et tomt træ)", () => {
    const stier = iScope.map((f) => f.rel);
    for (const s of [
      "src/components/hjemmebane/HbMemberShell.tsx",
      "src/components/hjemmebane/admin/HbAdminShell.tsx",
      "src/components/hjemmebane/HbSpinner.tsx",
      "src/components/MembershipExpiredGate.tsx",
      "src/pages/Auth.tsx",
      "src/pages/Betal.tsx",
    ]) expect(stier, `${s} mangler i scope`).toContain(s);
    expect(stier.length).toBeGreaterThanOrEqual(8);
  });

  for (const f of iScope) {
    it(`${f.rel}: ingen 100vh-højde — h-screen/min-h-screen skal være -safe`, () => {
      const fund = [...f.kode.matchAll(USIKKER_HOEJDE)].map((m) => m[0]);
      expect(fund, `100vh på en Hb-rod giver det grønne bundstykke: ${fund.join(", ")}`).toEqual([]);
    });
    it(`${f.rel}: kalder useHbDokumentGrund — lærredet bag fladen er papir`, () => {
      expect(f.kode, "hooket mangler: html forbliver .dark-grøn bag fladen").toContain("useHbDokumentGrund(");
    });
  }

  it("HB_RAMME selv bærer -safe-højden", () => {
    const k = readFileSync(resolve(process.cwd(), "src/components/hjemmebane/hbFormKlasser.ts"), "utf8");
    expect(k).toMatch(/HB_RAMME = "theme-hjemmebane min-h-screen-safe /);
  });
});

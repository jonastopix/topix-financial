import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ANDET_SKABELON, SKABELON_GRUPPER } from "@/lib/genkoerselBrowser";

// Kildeværn (17/9-2026 22:21): «Genkør rapporter»s skabelonfilter SKAL kende hver skabelon i
// templateRegistry.TEMPLATE_REGISTRY. Målt i drift: 15 af ANLA GLAS' 20 rapporter kunne ikke vælges
// («Skabelonen er ikke valgt i filteret») fordi listen kun kendte fire skabeloner og alt andet faldt i
// «fravalgt_skabelon». Registeret kan ikke importeres i browseren (npm:xlsx), så listen er skrevet af —
// dette værn læser registeret OG hver skabelons template_id af kilden og fejler, når registeret får en
// skabelon listen ikke har. SELVBEVIS: parseren skal finde ≥ 10 skabeloner, og en liste uden én af dem falder.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const REGISTER = "supabase/functions/_shared/templateRegistry.ts";

/** Navnene i TEMPLATE_REGISTRY-arrayet → import-stien → skabelonens template_id (læst af kilden). */
export function registreredeSkabelonIder(): { navn: string; fil: string; id: string }[] {
  const k = laes(REGISTER);
  const start = k.indexOf("const TEMPLATE_REGISTRY: TemplateEntry[] = [");
  expect(start, "TEMPLATE_REGISTRY findes ikke").toBeGreaterThan(-1);
  const blok = k.slice(start, k.indexOf("];", start));
  const navne = [...blok.matchAll(/^\s+(dk[A-Za-z0-9]+),/gm)].map((m) => m[1]);
  expect(navne.length, "for få skabeloner i registeret — parseren ramte ved siden af").toBeGreaterThanOrEqual(10);
  return navne.map((navn) => {
    const imp = k.match(new RegExp(`import \\{ ${navn} \\} from "\\./(templates/[A-Za-z0-9]+\\.ts)";`));
    expect(imp, `${navn}: import-linjen findes ikke`).not.toBeNull();
    const fil = `supabase/functions/_shared/${imp![1]}`;
    const kilde = laes(fil);
    const id = kilde.match(/template_id:\s*"([A-Z0-9_]+)"/)?.[1] ?? kilde.match(/TEMPLATE_ID\s*=\s*"([A-Z0-9_]+)"/)?.[1] ?? null;
    expect(id, `${navn}: ingen template_id i ${fil}`).not.toBeNull();
    return { navn, fil, id: id as string };
  });
}

/** Dommen: hver registreret skabelon står i filterets liste. */
export const filteretKenderRegisteret = (liste: readonly { skabelon: string }[]): string[] => {
  const kendte = new Set(liste.map((g) => g.skabelon));
  return registreredeSkabelonIder().filter((s) => !kendte.has(s.id)).map((s) => `${s.id} (${s.fil})`);
};

describe("genkoerselFilter.guard — filteret kender hver registreret skabelon", () => {
  it("ingen skabelon i TEMPLATE_REGISTRY mangler i SKABELON_GRUPPER", () => {
    expect(filteretKenderRegisteret(SKABELON_GRUPPER)).toEqual([]);
  });
  it("AI-vejen og «Andet» står også i listen, og hver skabelon har sin egen gruppe", () => {
    const ider = SKABELON_GRUPPER.map((g) => g.skabelon);
    expect(ider).toContain("ai_extraction");
    expect(ider).toContain(ANDET_SKABELON);
    expect(new Set(ider).size).toBe(ider.length);
    expect(new Set(SKABELON_GRUPPER.map((g) => g.gruppe)).size).toBe(SKABELON_GRUPPER.length);
  });
  it("selvbevis: en liste uden Mamut-skabelonen falder med navnet på hullet", () => {
    const uden = SKABELON_GRUPPER.filter((g) => g.skabelon !== "DK_MAMUT_SALDO_XLSX_V1");
    const huller = filteretKenderRegisteret(uden);
    expect(huller.length).toBe(1);
    expect(huller[0]).toContain("DK_MAMUT_SALDO_XLSX_V1");
  });
  it("selvbevis: de fire gamle grupper alene efterlader mindst otte huller (det var driftsfejlen)", () => {
    const fire = SKABELON_GRUPPER.filter((g) => ["a", "b", "c", "d"].includes(g.gruppe));
    expect(fire.length).toBe(4);
    expect(filteretKenderRegisteret(fire).length).toBeGreaterThanOrEqual(8);
  });
});

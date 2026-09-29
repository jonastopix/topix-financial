import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as src from "@/lib/certifikat/klokke";
import * as deno from "../../../supabase/functions/_shared/certifikatKlokke.ts";

/**
 * Paritet for certifikat-klokkens dom (trin 2, 29/9-2026): edge functionen
 * (supabase/functions/certifikat-klokke) kan ikke importere fra src, så dommen
 * er spejlet i _shared. Kroppen efter filhovedet er ORDRET ens — på nær
 * import-linjerne, som normaliseres HER og kun her (`@/lib/x` ↔ `./x.ts`).
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const krop = (k: string) => k.slice(k.indexOf("*/") + 2);
/** KUN import-linjerne: `from "@/lib/x"` → `from "./x.ts"`. Intet andet røres. */
const normaliserImports = (k: string) => k.replace(/from "@\/lib\/([A-Za-z]+)";/g, 'from "./$1.ts";');
const SRC = "src/lib/certifikat/klokke.ts";
const DENO = "supabase/functions/_shared/certifikatKlokke.ts";

describe("certifikatKlokke.paritet — kildeteksten", () => {
  it("kroppen er byte-ens efter filhovedet (import-linjerne normaliseret)", () => {
    const a = krop(laes(SRC)), b = krop(laes(DENO));
    expect(b).toBe(normaliserImports(a));
    expect(a.length).toBeGreaterThan(3000);
    // Kun import-linjerne må afvige: uden dem er de to ordret ens.
    const udenImports = (k: string) => k.split("\n").filter((l) => !/^import /.test(l)).join("\n");
    expect(udenImports(a)).toBe(udenImports(b));
    expect(laes(SRC)).toContain(DENO);
    expect(laes(DENO)).toContain(SRC);
  });

  it("VÆRNET VIRKER: en ændring i kun det ene spejl fanges", () => {
    const a = krop(laes(SRC)).replace("export const AABNER_DAGE_FOER = 7;", "export const AABNER_DAGE_FOER = 6;");
    expect(a).not.toBe(krop(laes(SRC)));
    expect(krop(laes(DENO))).not.toBe(normaliserImports(a));
  });
});

describe("certifikatKlokke.paritet — dommene svarer ens", () => {
  it("åbningsdatoen og gyldigheden for hver dag 2024–2027 og en håndfuld ugyldige", () => {
    const DOEGN = 86_400_000;
    for (let t = Date.parse("2024-01-01T00:00:00Z"); t <= Date.parse("2027-12-31T00:00:00Z"); t += DOEGN) {
      const d = new Date(t).toISOString().slice(0, 10);
      expect(deno.aabningsdato(d), d).toBe(src.aabningsdato(d));
      expect(deno.gyldigStartdato(d)).toBe(src.gyldigStartdato(d));
    }
    for (const s of ["2026-02-31", "x", "", null, " 2026-01-01 "]) expect(deno.gyldigStartdato(s)).toBe(src.gyldigStartdato(s));
  });

  it("udvælgelsen er ens på et blandet datasæt og tre «nu»", () => {
    const virksomheder = [
      { id: "a", name: "A", certificate_eligible: true, contract_start_date: "2025-10-22", contract_end_date: "2026-10-21", subscription_status: null, subscription_current_period_end: null },
      { id: "b", name: "B", certificate_eligible: true, contract_start_date: "2025-03-01", contract_end_date: null, subscription_status: null, subscription_current_period_end: null },
      { id: "c", name: null, certificate_eligible: false, contract_start_date: "2025-01-01", contract_end_date: "2027-01-01", subscription_status: null, subscription_current_period_end: null },
      { id: "d", name: "D", certificate_eligible: true, contract_start_date: "2025-02-30", contract_end_date: "2027-01-01", subscription_status: null, subscription_current_period_end: null },
      { id: "e", name: "E", certificate_eligible: true, contract_start_date: "2024-12-01", contract_end_date: "2025-12-31", subscription_status: "active", subscription_current_period_end: "2030-01-01T00:00:00Z" },
    ];
    const medlemmer = [{ company_id: "a", user_id: "u1" }, { company_id: "a", user_id: "r1" }, { company_id: "b", user_id: "u2" }, { company_id: "b", user_id: "h1" }, { company_id: "e", user_id: "u3" }];
    for (const nu of ["2026-02-22T06:00:00Z", "2026-10-14T22:30:00Z", "2027-03-01T06:00:00Z"].map((s) => new Date(s))) {
      const input = { virksomheder, medlemmer, raadgivere: ["r1"], harHentet: ["h1"], nu };
      expect(deno.certifikatKlokkeModtagere(input), nu.toISOString()).toEqual(src.certifikatKlokkeModtagere(input));
    }
  });
});

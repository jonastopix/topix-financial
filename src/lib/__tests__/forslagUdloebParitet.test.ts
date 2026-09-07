import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afgoerForslagsgyldighed } from "@/lib/forslagUdloeb";
// Parity import — the Deno copy is intentionally a mirror of the frontend
// copy (import path is the only allowed difference). We import it here so
// vitest fails loudly if the two drift.
import { afgoerForslagsgyldighed as afgoerForslagsgyldighedDeno } from "../../../supabase/functions/_shared/forslagUdloeb.ts";

// Parity gate — the Deno copy at supabase/functions/_shared/forslagUdloeb.ts
// must produce an identical Forslagsgyldighed (gyldigt, forslagets_uge,
// nu_uge, grund) for every input the frontend copy handles. If this block
// fails, the two files have drifted and must be re-synced.

const FORSLAG = new Date(2026, 7, 31, 9, 0, 0).toISOString(); // mandag 31/8 2026, uge 36

describe("afgoerForslagsgyldighed — parity between src/lib and supabase/functions/_shared", () => {
  const cases: Array<{ navn: string; proposedAt: string; nu: Date }> = [
    { navn: "samme uge", proposedAt: FORSLAG, nu: new Date(2026, 8, 3, 12, 0, 0) },
    { navn: "sidste øjeblik i ugen", proposedAt: FORSLAG, nu: new Date(2026, 8, 6, 23, 59, 59, 999) },
    { navn: "første øjeblik i næste uge", proposedAt: FORSLAG, nu: new Date(2026, 8, 7, 0, 0, 0, 0) },
    { navn: "forslag fra 25/8, nu 7/9", proposedAt: new Date(2026, 7, 25, 6, 5, 0).toISOString(), nu: new Date(2026, 8, 7, 10, 0, 0) },
    { navn: "årsskiftet, uge 53", proposedAt: new Date(2026, 11, 28, 9, 0, 0).toISOString(), nu: new Date(2027, 0, 3, 23, 59, 59) },
    { navn: "ulæseligt proposed_at", proposedAt: "ikke-en-dato", nu: new Date(2026, 8, 7, 10, 0, 0) },
  ];

  for (const c of cases) {
    it(`parity: ${c.navn}`, () => {
      expect(afgoerForslagsgyldighedDeno(c.proposedAt, c.nu)).toEqual(afgoerForslagsgyldighed(c.proposedAt, c.nu));
    });
  }

  it("alle timer fra 20/12 2025 til 10/1 2027 × fire forslagsdatoer: hele svaret er ens", () => {
    // Timevis fejning over hele 2026 inkl. begge uge-1/uge-53-grænser,
    // samme interval som isoUge.test.ts.
    const forslag = [
      new Date(2025, 11, 29, 9, 0, 0), // mandag i 2026-W01
      new Date(2026, 7, 25, 6, 5, 0),
      new Date(2026, 7, 31, 9, 0, 0),
      new Date(2026, 11, 28, 9, 0, 0), // mandag i 2026-W53
    ].map((d) => d.toISOString());
    const start = new Date(2025, 11, 20, 0, 0, 0).getTime();
    const slut = new Date(2027, 0, 10, 0, 0, 0).getTime();
    for (let t = start; t <= slut; t += 3_600_000) {
      const nu = new Date(t);
      for (const p of forslag) {
        expect(afgoerForslagsgyldighedDeno(p, nu)).toEqual(afgoerForslagsgyldighed(p, nu));
      }
    }
  });
});

describe("kildeværn: agent-forslag-afgoer dømmer udløbet før service role, og kun ved godkendelse", () => {
  const afgoerSource = readFileSync(resolve(process.cwd(), "supabase/functions/agent-forslag-afgoer/index.ts"), "utf8");

  it("importerer dommen fra _shared og kalder den FØR service-role-konstruktionen", () => {
    expect(afgoerSource).toContain('from "../_shared/forslagUdloeb.ts"');
    const dom = afgoerSource.indexOf("afgoerForslagsgyldighed(");
    const serviceRole = afgoerSource.indexOf("SUPABASE_SERVICE_ROLE_KEY");
    expect(dom).toBeGreaterThan(-1);
    expect(dom, "udløbsdommen skal stå FØR service role — rækken må ikke røres af et udløbet forslag").toBeLessThan(serviceRole);
  });

  it("dommen gælder ikke forkastelser — man skal kunne rydde op", () => {
    const dom = afgoerSource.indexOf("afgoerForslagsgyldighed(");
    const guard = afgoerSource.lastIndexOf('if (afgoerelse !== "reject")', dom);
    expect(guard, "udløbsdommen skal stå inde i if (afgoerelse !== 'reject')").toBeGreaterThan(-1);
    expect(dom - guard).toBeLessThan(200);
  });

  it("proposed_at hentes med forslaget", () => {
    expect(afgoerSource).toContain("tool, args, status, proposed_at");
  });
});

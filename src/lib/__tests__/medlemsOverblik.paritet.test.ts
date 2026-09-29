import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as src from "@/lib/medlemsOverblik";
import * as deno from "../../../supabase/functions/_shared/medlemsOverblik.ts";
import { erAfholdt as erAfholdtSrc } from "@/lib/introSession";
import { erAfholdt as erAfholdtDeno } from "../../../supabase/functions/_shared/introSession.ts";
import { dageSiden as dageSidenSrc, senesteAf as senesteAfSrc } from "@/lib/sidstOnline";
import { dageSiden as dageSidenDeno, senesteAf as senesteAfDeno } from "../../../supabase/functions/_shared/sidstOnline.ts";
import { erKunde as erKundeSrc } from "@/lib/raadgiverensKunder";
import { erKunde as erKundeDeno } from "../../../supabase/functions/_shared/raadgiverensKunder.ts";

/**
 * Paritet for medlemsoverblikkets motor og dens tre spejlede domme (29/9-2026,
 * statusmailen): edge functions kan ikke importere fra src (0 træf, intet
 * import map), så motoren er spejlet i _shared. Kroppen efter filhovedet er
 * ordret ens — for motoren på nær import-linjerne, som normaliseres HER og kun
 * her (`@/lib/x` ↔ `./x.ts`): det er den ene forskel, spejlet ikke kan undgå.
 * ikkeIGang har sit eget spejl og sin egen paritetsprøve (ikkeIGangParitet).
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const krop = (k: string) => k.slice(k.indexOf("*/") + 2);
/** KUN import-linjerne: `from "@/lib/x"` → `from "./x.ts"`. Intet andet røres. */
const normaliserImports = (k: string) => k.replace(/from "@\/lib\/([A-Za-z]+)";/g, 'from "./$1.ts";');

const PAR = [
  ["src/lib/medlemsOverblik.ts", "supabase/functions/_shared/medlemsOverblik.ts", true],
  ["src/lib/introSession.ts", "supabase/functions/_shared/introSession.ts", false],
  ["src/lib/sidstOnline.ts", "supabase/functions/_shared/sidstOnline.ts", false],
  ["src/lib/raadgiverensKunder.ts", "supabase/functions/_shared/raadgiverensKunder.ts", false],
] as const;

describe("medlemsOverblik.paritet — kildeteksten", () => {
  for (const [SRC, DENO, harImports] of PAR) {
    it(`${SRC} ↔ ${DENO}: kroppen er byte-ens${harImports ? " (import-linjerne normaliseret)" : ", og ingen importerer noget"}`, () => {
      const a = krop(laes(SRC)), b = krop(laes(DENO));
      if (harImports) {
        expect(b).toBe(normaliserImports(a));
        // Kun import-linjerne må afvige: uden dem er de to ordret ens.
        const udenImports = (k: string) => k.replace(/^import .*$/gm, "");
        expect(udenImports(b)).toBe(udenImports(a));
        expect(b).toMatch(/^import .* from "\.\/introSession\.ts";$/m);
        expect(a).toMatch(/^import .* from "@\/lib\/introSession";$/m);
      } else {
        expect(b).toBe(a);
        expect(a).not.toMatch(/^\s*import\s/m);
      }
      expect(a.length).toBeGreaterThan(80); // raadgiverensKunder er tre linjer
      expect(laes(SRC)).toContain(DENO);
      expect(laes(DENO)).toContain(SRC);
    });
  }

  it("VÆRNET VIRKER: en ændring i kun det ene spejl fanges — for hver af de fire", () => {
    const [motorSrc] = PAR[0];
    const a = krop(laes(motorSrc)).replace("export const TRAENGER_LOGIN_DAGE = 30;", "export const TRAENGER_LOGIN_DAGE = 31;");
    expect(a).not.toBe(krop(laes(motorSrc)));
    expect(krop(laes(PAR[0][1]))).not.toBe(normaliserImports(a));
    // …og en «normalisering», der rører mere end import-linjerne, ville ikke redde det: kun `from "@/lib/x"` oversættes.
    expect(normaliserImports('const x = "@/lib/y";\nimport { z } from "@/lib/y";')).toBe('const x = "@/lib/y";\nimport { z } from "./y.ts";');
    for (const [SRC, DENO] of PAR.slice(1)) {
      const b = krop(laes(DENO)).replace("export function", "export function x");
      expect(b).not.toBe(krop(laes(SRC)));
    }
  });
});

const NU = new Date("2026-09-29T10:00:00Z");
const MS_DAG = 86_400_000;
const dageFoer = (n: number) => new Date(NU.getTime() - n * MS_DAG).toISOString();

describe("medlemsOverblik.paritet — dommene svarer ens", () => {
  it("erAfholdt, dageSiden, senesteAf, erKunde", () => {
    for (const b of [null, { status: "booked", slut_tid: dageFoer(1) }, { status: "booked", slut_tid: dageFoer(-1) }, { status: "booked", slut_tid: null }, { status: "cancelled", slut_tid: dageFoer(1) }]) {
      expect(erAfholdtDeno(b, NU)).toBe(erAfholdtSrc(b, NU));
    }
    for (const iso of [null, "x", dageFoer(0), dageFoer(3), dageFoer(-2)]) expect(dageSidenDeno(iso, NU)).toBe(dageSidenSrc(iso, NU));
    expect(senesteAfDeno([dageFoer(5), null, "x", dageFoer(1)])).toBe(senesteAfSrc([dageFoer(5), null, "x", dageFoer(1)]));
    for (const c of [{}, { er_kunde: null }, { er_kunde: true }, { er_kunde: false }]) expect(erKundeDeno(c)).toBe(erKundeSrc(c));
  });

  it("byggOverblik giver samme rækker i begge spejle, og ordene er de samme", () => {
    const kilder: src.OverbliksKilder = {
      companies: [
        { id: "c1", status: "active", is_legat: false, er_kunde: true, is_demo: false, intro_session_used_at: dageFoer(20), jonas_session_used_at: "2026-09-13T20:52:00Z" },
        { id: "c2", status: null, is_legat: false, er_kunde: null, is_demo: null, intro_session_used_at: null, jonas_session_used_at: null },
        { id: "demo", status: "active", is_legat: false, er_kunde: true, is_demo: true, intro_session_used_at: null, jonas_session_used_at: null },
      ],
      medlemmer: [{ company_id: "c1", user_id: "u1", created_at: dageFoer(200) }, { company_id: "c1", user_id: "u2", created_at: dageFoer(100) }],
      bookinger: [{ company_id: "c1", advisor: "morten", status: "booked", start_tid: dageFoer(5), slut_tid: dageFoer(5), created_at: dageFoer(20) }],
      logins: [{ user_id: "u1", logged_in_at: dageFoer(2) }, { user_id: "u2", logged_in_at: dageFoer(40) }],
      facts: [{ company_id: "c1", committed_at: dageFoer(10), data_basis: "measured" }],
      uploads: [{ company_id: "c1", uploaded_at: dageFoer(12) }],
      refleksioner: [], samtaler: [{ company_id: "c1", last_member_message_at: dageFoer(3) }],
      events: [{ user_id: "u2", registered_at: dageFoer(1), response: "attending", cancelled_at: null }],
      progress: [], traade: [], svar: [], reaktioner: [], maal: [],
    };
    const a = src.byggOverblik(kilder, NU), b = deno.byggOverblik(kilder, NU);
    expect([...b.entries()]).toEqual([...a.entries()]);
    expect(deno.MAERKE_ORD).toEqual(src.MAERKE_ORD);
    expect([...deno.FILTER_MAERKER]).toEqual([...src.FILTER_MAERKER]);
    expect(deno.IKKE_OMFATTET_FRA).toBe(src.IKKE_OMFATTET_FRA);
  });
});

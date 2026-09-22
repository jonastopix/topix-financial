import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as src from "@/lib/webinar/mailDom";
import * as deno from "../../../supabase/functions/_shared/webinarMailDom.ts";

/**
 * Paritet for før-webinar-mailenes motor (22/9-2026). Cronen afgør, hvad der
 * SENDES; fladen skal kunne vise det samme uden at gætte. Kroppen efter
 * filhovedet er ORDRET ens, og dommene svarer ens på samme input.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const krop = (k: string) => k.slice(k.indexOf("*/") + 2);
const SRC = "src/lib/webinar/mailDom.ts";
const DENO = "supabase/functions/_shared/webinarMailDom.ts";
const SESSION = "2026-10-13T09:00:00.000Z";

describe("webinarMailDom.paritet — kildeteksten", () => {
  it("kroppen er byte-ens, og ingen af dem importerer noget", () => {
    const a = krop(laes(SRC)), b = krop(laes(DENO));
    expect(b).toBe(a);
    expect(a.length).toBeGreaterThan(8000);
    expect(a).not.toMatch(/^\s*import\s/m);
    expect(laes(SRC)).toContain(DENO);
    expect(laes(DENO)).toContain(SRC);
  });

  it("VÆRNET VIRKER: en ændring i kun det ene spejl fanges", () => {
    const a = krop(laes(SRC)).replace('export const BEKRAEFTELSE_FRA = "2026-09-22T17:03:00Z";', 'export const BEKRAEFTELSE_FRA = "2020-01-01T00:00:00Z";');
    expect(a).not.toBe(krop(laes(SRC)));
    expect(krop(laes(DENO))).not.toBe(a);
  });
});

describe("webinarMailDom.paritet — dommene svarer ens", () => {
  it("planlagtTid for alle seks arter, og hen over sommertidsskiftet", () => {
    for (const session of [SESSION, "2026-10-27T10:00:00.000Z", "2026-01-13T10:00:00.000Z"]) {
      for (const art of deno.ARTER) {
        expect(deno.planlagtTid(session, art)?.toISOString(), `${session}/${art}`)
          .toBe(src.planlagtTid(session, art)?.toISOString());
      }
    }
  });

  it("doemMail i alle kombinationer af grundene — også BEKRAEFTELSE_FRA's to sider", () => {
    for (const art of deno.ARTER) {
      for (const afmeldt of [true, false]) {
        for (const alleredeSendt of [true, false]) {
          for (const registreretAt of [null, "2026-09-22T17:02:59Z", "2026-09-22T17:03:00Z", "2026-09-23T08:00:00Z"]) {
            for (const nu of ["2026-10-01T06:00:00Z", "2026-10-06T06:05:00Z", "2026-10-13T08:05:00Z", "2026-10-13T12:00:00Z"]) {
              const i = { art, sessionTid: SESSION, email: "a@x.dk", registreretAt, afmeldt, alleredeSendt, nu: new Date(nu) };
              expect(deno.doemMail(i), `${art}/${registreretAt}/${afmeldt}/${alleredeSendt}/${nu}`).toEqual(src.doemMail(i));
            }
          }
        }
      }
    }
  });

  it("BEKRAEFTELSE_FRA er det samme øjeblik i begge spejle", () => {
    expect(deno.BEKRAEFTELSE_FRA).toBe(src.BEKRAEFTELSE_FRA);
    expect(deno.BEKRAEFTELSE_FRA_MS).toBe(src.BEKRAEFTELSE_FRA_MS);
  });

  it("planlaegKoersel, noegle og kalenderlinkene", () => {
    const raekker = [{
      ewebinar_id: "r1", email: "a@x.dk", navn: "A", session_tid: SESSION,
      registreret_at: "2026-09-23T08:00:00.000Z", webinar_titel: "W", subscribed: "subscribed", sidste_action: "Registered",
      join_link: "https://j", kalender_link: "https://k", replay_link: null,
    }];
    const i = { raekker, afmeldte: new Set<string>(), sendte: new Set<string>(), nu: new Date("2026-10-06T06:05:00Z") };
    expect(deno.planlaegKoersel(i)).toEqual(src.planlaegKoersel(i));
    expect(deno.noegle("A@X.dk", SESSION, "dagen")).toBe(src.noegle("A@X.dk", SESSION, "dagen"));
    const k = { titel: "W", sessionTid: SESSION, joinLink: "https://j" };
    expect(deno.googleKalenderUrl(k)).toBe(src.googleKalenderUrl(k));
    expect(deno.outlookKalenderUrl(k)).toBe(src.outlookKalenderUrl(k));
  });
});

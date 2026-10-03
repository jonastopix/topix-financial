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
  it("planlagtTid for alle syv arter, og hen over sommertidsskiftet", () => {
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
            for (const nu of ["2026-09-29T06:05:00Z", "2026-09-29T08:05:00Z", "2026-10-01T06:00:00Z", "2026-10-06T06:05:00Z", "2026-10-13T08:05:00Z", "2026-10-13T12:00:00Z"]) {
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

  it("ARTER, PLANEN og MED_INVITATION er de samme lister — og baererInvitation svarer ens", () => {
    expect([...deno.ARTER]).toEqual([...src.ARTER]);
    expect(deno.PLANEN).toEqual(src.PLANEN);
    expect([...deno.MED_INVITATION]).toEqual([...src.MED_INVITATION]);
    for (const art of deno.ARTER) expect(deno.baererInvitation(art), art).toBe(src.baererInvitation(art));
  });

  it("planlaegKoersel, noegle og kalenderlinkene", () => {
    const raekker = [{
      ewebinar_id: "r1", email: "a@x.dk", navn: "A", session_tid: SESSION,
      registreret_at: "2026-09-23T08:00:00.000Z", webinar_titel: "W", subscribed: "subscribed", sidste_action: "Registered",
      join_link: "https://j", kalender_link: "https://k", replay_link: null,
    }];
    const i = { raekker, afmeldte: new Set<string>(), sendte: new Set<string>(), nu: new Date("2026-10-06T06:05:00Z") };
    expect(deno.planlaegKoersel(i)).toEqual(src.planlaegKoersel(i));
    // 29/9: to kommende sessioner på samme mail, og ukendte/fejlede forsøg.
    const to = [...raekker, { ...raekker[0], ewebinar_id: "r2", session_tid: "2026-10-20T09:00:00.000Z" }];
    const ukendte = new Set([deno.noegle("a@x.dk", SESSION, "syv_dage")]);
    const fejlede = new Set([deno.noegle("a@x.dk", SESSION, "fjorten_dage")]);
    for (const nu of ["2026-09-29T12:00:00Z", "2026-10-06T06:05:00Z", "2026-10-06T06:10:00Z", "2026-10-13T09:05:00Z", "2026-10-17T06:05:00Z"]) {
      const j = { raekker: to, afmeldte: new Set<string>(), sendte: new Set<string>(), fejlede, ukendte, nu: new Date(nu) };
      expect(deno.planlaegKoersel(j), nu).toEqual(src.planlaegKoersel(j));
    }
    // 3/10: den sultede hale — rettidig/sen tilmelding, aldrig forsøgt, fejlet, og en
    // anden session imellem (andreSessionerMs), i begge spejle; sorteringen med.
    const hale = ["2026-09-01T08:00:00Z", "2026-09-29T06:00:00Z", "2026-09-29T07:40:00Z", "2026-10-06T07:00:00Z", null].map((reg, n) => ({
      ...raekker[0], ewebinar_id: `h${n}`, email: `h${n}@x.dk`, registreret_at: reg,
    }));
    const mellem = [{ ...raekker[0], ewebinar_id: "m1", email: "h0@x.dk", session_tid: "2026-10-01T09:00:00.000Z" }];
    const haleFejlede = new Set([deno.noegle("h2@x.dk", SESSION, "fjorten_dage"), deno.noegle("h1@x.dk", SESSION, "syv_dage")]);
    for (const nu of ["2026-09-29T08:05:00Z", "2026-10-02T09:30:00Z", "2026-10-05T21:59:00Z", "2026-10-05T22:01:00Z", "2026-10-06T08:01:00Z", "2026-10-09T21:59:00Z", "2026-10-13T12:00:00Z"]) {
      for (const rk of [hale, [...hale, ...mellem]]) {
        const j = { raekker: rk, afmeldte: new Set(["h4@x.dk"]), sendte: new Set<string>(), fejlede: haleFejlede, nu: new Date(nu) };
        expect(deno.planlaegKoersel(j), `hale/${nu}`).toEqual(src.planlaegKoersel(j));
      }
      for (const art of deno.ARTER) for (const reg of [null, "2026-09-29T06:00:00Z", "2026-09-29T06:00:01Z", "2026-10-06T06:00:00Z"]) {
        for (const andreSessionerMs of [undefined, [], [Date.parse("2026-10-01T09:00:00Z")], [Date.parse("2026-10-20T09:00:00Z")]]) {
          const d = { art, sessionTid: SESSION, email: "a@x.dk", registreretAt: reg, afmeldt: false, alleredeSendt: false, andreSessionerMs, nu: new Date(nu) };
          expect(deno.doemMail(d), `${art}/${reg}/${nu}`).toEqual(src.doemMail(d));
        }
      }
    }
    for (const udfald of ["ok", "timeout", "fejl", "loft", "ugyldig", "noegle_afvist", "ingen_noegle"]) {
      for (const status of [null, 200, 404, 429, 500, 503]) {
        expect(deno.afsendelseUkendt({ udfald, status }), `${udfald}/${status}`).toBe(src.afsendelseUkendt({ udfald, status }));
      }
    }
    for (const art of deno.ARTER) expect(deno.erPaamindelse(art), art).toBe(src.erPaamindelse(art));
    expect(deno.noegle("A@X.dk", SESSION, "dagen")).toBe(src.noegle("A@X.dk", SESSION, "dagen"));
    const k = { titel: "W", sessionTid: SESSION, joinLink: "https://j" };
    expect(deno.googleKalenderUrl(k)).toBe(src.googleKalenderUrl(k));
    expect(deno.outlookKalenderUrl(k)).toBe(src.outlookKalenderUrl(k));
  });
});

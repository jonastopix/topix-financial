import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isoUge, isoUgeTekst, maerkeLink, STATUSMAIL_LABEL, STATUSMAIL_NOEGLE_PRAEFIKS, statusMailNoegle, statusMailTekst, VIRKSOMHEDER_URL,
} from "../../../supabase/functions/_shared/statusMail.ts";
import { byggOverblik, MAERKE_ORD, type OverbliksKilder } from "@/lib/medlemsOverblik";
import { MAERKE_ORD as ORD_FRA_FLADEN, MAERKE_PARAM } from "@/lib/hjemmebane/overblikOrd";

/** Statusmailens rene dele (29/9-2026): ISO-ugen i dansk tid, nøglen, og teksten. */

describe("statusMail — ISO-ugen i dansk tid", () => {
  it("årsskiftet 2026/27: 28/12-2026 (mandag) er 2026-W53, søndag 3/1-2027 stadig W53, mandag 4/1-2027 er 2027-W01", () => {
    expect(isoUge(new Date("2026-12-28T10:00:00Z"))).toEqual({ aar: 2026, uge: 53 });
    expect(isoUge(new Date("2026-12-31T10:00:00Z"))).toEqual({ aar: 2026, uge: 53 });
    expect(isoUge(new Date("2027-01-01T10:00:00Z"))).toEqual({ aar: 2026, uge: 53 });
    expect(isoUge(new Date("2027-01-03T10:00:00Z"))).toEqual({ aar: 2026, uge: 53 });
    expect(isoUge(new Date("2027-01-04T10:00:00Z"))).toEqual({ aar: 2027, uge: 1 });
    expect(isoUgeTekst(new Date("2027-01-04T10:00:00Z"))).toBe("2027-W01");
  });

  it("søndag/mandag i DANSK tid: søndag 4/10-2026 kl. 23:59 dansk (21:59Z) er W40; mandag 5/10 kl. 00:30 dansk (22:30Z søndag i UTC) er W41", () => {
    expect(isoUge(new Date("2026-10-04T21:59:59Z"))).toEqual({ aar: 2026, uge: 40 });
    expect(isoUge(new Date("2026-10-04T22:30:00Z"))).toEqual({ aar: 2026, uge: 41 });
    expect(isoUge(new Date("2026-09-29T10:00:00Z"))).toEqual({ aar: 2026, uge: 40 });
    // Vintertid: mandag 7/12-2026 kl. 00:30 dansk = søndag 23:30Z.
    expect(isoUge(new Date("2026-12-06T23:30:00Z"))).toEqual({ aar: 2026, uge: 50 });
  });

  it("nøglen: én pr. rådgiver pr. uge — samme uge samme nøgle, ny uge ny nøgle", () => {
    expect(STATUSMAIL_NOEGLE_PRAEFIKS).toBe("statusmail:");
    expect(STATUSMAIL_LABEL).toBe("statusmail");
    expect(statusMailNoegle("r1", new Date("2026-09-29T10:00:00Z"))).toBe("statusmail:r1:2026-W40");
    expect(statusMailNoegle("r1", new Date("2026-10-04T21:00:00Z"))).toBe("statusmail:r1:2026-W40");
    expect(statusMailNoegle("r1", new Date("2026-10-05T06:00:00Z"))).toBe("statusmail:r1:2026-W41");
    expect(statusMailNoegle("r2", new Date("2026-09-29T10:00:00Z"))).not.toBe(statusMailNoegle("r1", new Date("2026-09-29T10:00:00Z")));
  });
});

const NU = new Date("2026-09-29T06:00:00Z");
const MS_DAG = 86_400_000;
const dageFoer = (n: number) => new Date(NU.getTime() - n * MS_DAG).toISOString();
const virksomhed = (id: string, extra: Partial<OverbliksKilder["companies"][number]> = {}) =>
  ({ id, status: "active", is_legat: false, er_kunde: true, is_demo: false, intro_session_used_at: dageFoer(30), jonas_session_used_at: "2026-09-13T20:52:00Z", ...extra });
const tom = { bookinger: [], facts: [], uploads: [], refleksioner: [], samtaler: [], events: [], progress: [], traade: [], svar: [], reaktioner: [], maal: [] };

describe("statusMail — teksten", () => {
  const kilder: OverbliksKilder = {
    ...tom,
    companies: [virksomhed("aarhus"), virksomhed("bogense", { intro_session_used_at: null }), virksomhed("ceres"), virksomhed("uden")],
    medlemmer: [
      { company_id: "aarhus", user_id: "u1", created_at: dageFoer(200) },
      { company_id: "bogense", user_id: "u2", created_at: dageFoer(200) },
      { company_id: "ceres", user_id: "u3", created_at: dageFoer(200) },
    ],
    logins: [{ user_id: "u1", logged_in_at: dageFoer(45) }, { user_id: "u2", logged_in_at: dageFoer(1) }, { user_id: "u3", logged_in_at: dageFoer(2) }],
    facts: [{ company_id: "aarhus", committed_at: dageFoer(5), data_basis: "measured" }, { company_id: "bogense", committed_at: dageFoer(5), data_basis: "measured" }, { company_id: "ceres", committed_at: dageFoer(5), data_basis: "measured" }],
    bookinger: [{ company_id: "aarhus", advisor: "morten", status: "booked", start_tid: dageFoer(10), slut_tid: dageFoer(10), created_at: dageFoer(30) }, { company_id: "ceres", advisor: "morten", status: "booked", start_tid: dageFoer(10), slut_tid: dageFoer(10), created_at: dageFoer(30) }],
  };
  const navne = new Map([["aarhus", "Aarhus Både"], ["bogense", "Bogense Bageri"], ["ceres", "Ceres Consult"], ["uden", "Uden Bruger ApS"]]);
  const overblik = byggOverblik(kilder, NU);
  const t = statusMailTekst(overblik, navne, NU);

  it("emnet: «Medlemsoverblik uge <ISO-uge>: <N> trænger», og titlen bærer ugen", () => {
    // «uden» trænger også: ingen godkendt rapport i 60 dage gælder uanset brugere — så 2, ikke 1.
    expect(t.emne).toBe("Medlemsoverblik uge 40: 2 trænger");
    expect(t.titel).toBe("Medlemsoverblik uge 40 (2026-W40)");
  });

  it("første afsnit: tallene for de fire filtermærker med ordene fra motoren (én kilde)", () => {
    expect(t.afsnit[0]).toBe("Ugens overblik over 4 virksomheder — Trænger: 2 · Ingen session endnu: 1 · Ikke i gang: 0 · Ingen bruger: 1.");
    expect(ORD_FRA_FLADEN).toBe(MAERKE_ORD); // samme objekt — fladen re-eksporterer motorens
    expect(MAERKE_PARAM).toBe("maerke");
  });

  it("én blok pr. mærke med træffere: navne sorteret med sammenlignOverblik, og linket til listen med ?maerke=; tomme mærker udelades", () => {
    expect(t.blokke.map((b) => b.overskrift)).toEqual(["Trænger (2)", "Ingen session endnu (1)", "Ingen bruger (1)"]);
    // Tungest først (uden bruger + ingen rapport vejer mere end ingen login), så navn.
    expect(t.blokke[0].tekst).toBe(`Uden Bruger ApS\nAarhus Både\n${VIRKSOMHEDER_URL}?maerke=traenger`);
    expect(t.blokke[1].tekst).toBe(`Bogense Bageri\n${VIRKSOMHEDER_URL}?maerke=ingen_session_endnu`);
    expect(t.blokke[2].tekst).toBe(`Uden Bruger ApS\n${VIRKSOMHEDER_URL}?maerke=ingen_bruger`);
    expect(maerkeLink("ikke_i_gang")).toBe("https://app.theboardroom.dk/virksomheder?maerke=ikke_i_gang");
    expect(t.afsnit[1]).toBe(`Hele listen, sorteret med dem, der trænger, først: ${VIRKSOMHEDER_URL}`);
  });

  it("sorteringen i en blok: tungest først, så navn (dansk) — og et manglende navn viser id'et frem for at forsvinde", () => {
    const k: OverbliksKilder = { ...kilder, companies: [virksomhed("x", { intro_session_used_at: null }), virksomhed("y", { intro_session_used_at: null })], medlemmer: [{ company_id: "x", user_id: "u1", created_at: dageFoer(200) }, { company_id: "y", user_id: "u2", created_at: dageFoer(200) }], logins: [{ user_id: "u1", logged_in_at: dageFoer(1) }, { user_id: "u2", logged_in_at: dageFoer(1) }], facts: [{ company_id: "x", committed_at: dageFoer(1), data_basis: "measured" }, { company_id: "y", committed_at: dageFoer(1), data_basis: "measured" }], bookinger: [] };
    const tt = statusMailTekst(byggOverblik(k, NU), new Map([["y", "Ærø"]]), NU);
    expect(tt.blokke.map((b) => b.overskrift)).toEqual(["Ingen session endnu (2)"]);
    expect(tt.blokke[0].tekst.split("\n").slice(0, 2)).toEqual(["x", "Ærø"]);
  });

  it("ingen mærker: én rolig linje, ingen blokke", () => {
    const k: OverbliksKilder = { ...kilder, companies: [virksomhed("ceres")], medlemmer: [{ company_id: "ceres", user_id: "u3", created_at: dageFoer(200) }] };
    const tt = statusMailTekst(byggOverblik(k, NU), navne, NU);
    expect(tt.emne).toBe("Medlemsoverblik uge 40: 0 trænger");
    expect(tt.afsnit).toEqual([
      "Ugens overblik over 1 virksomhed — Trænger: 0 · Ingen session endnu: 0 · Ikke i gang: 0 · Ingen bruger: 0.",
      "Ingen virksomheder trænger, mangler session, står i stampe eller er uden bruger lige nu. Godt gået.",
    ]);
    expect(tt.blokke).toEqual([]);
    expect(tt.tekst).toBe(tt.afsnit.join("\n"));
  });

  it("tekstudgaven bærer samme indhold: afsnit, en tom linje, og blokkene", () => {
    expect(t.tekst).toBe([
      ...t.afsnit, "",
      `Trænger (2)\nUden Bruger ApS\nAarhus Både\n${VIRKSOMHEDER_URL}?maerke=traenger`,
      `Ingen session endnu (1)\nBogense Bageri\n${VIRKSOMHEDER_URL}?maerke=ingen_session_endnu`,
      `Ingen bruger (1)\nUden Bruger ApS\n${VIRKSOMHEDER_URL}?maerke=ingen_bruger`,
    ].join("\n"));
    // Rækkerne kan også gives som liste.
    expect(statusMailTekst([...overblik.values()], navne, NU)).toEqual(t);
  });
});

describe("statusMail — kildeværn: ordene fra én kilde", () => {
  const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
  const udenKommentarer = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
  const MAIL = "supabase/functions/_shared/statusMail.ts";
  const ORD = "src/lib/hjemmebane/overblikOrd.ts";
  const MOTOR = "src/lib/medlemsOverblik.ts";

  /** Mailen og fladen henter ordene fra motoren; kun motoren har literalen «Trænger». */
  const ordeneFraEnKilde = (mail: string, ord: string, motor: string): boolean => {
    const m = udenKommentarer(mail), o = udenKommentarer(ord), k = udenKommentarer(motor);
    return (
      /import \{[^}]*\bMAERKE_ORD\b[^}]*\} from "\.\/medlemsOverblik\.ts";/.test(m) &&
      !/traenger: "|"Trænger"/.test(m) &&
      o.includes("export { FILTER_MAERKER, MAERKE_ORD };") &&
      /import \{[^}]*\bMAERKE_ORD\b[^}]*\} from "@\/lib\/medlemsOverblik";/.test(o) &&
      !/traenger: "/.test(o) &&
      (k.match(/traenger: "Trænger",/g) ?? []).length === 1
    );
  };

  it("mailen og fladen læser MAERKE_ORD fra motoren — ingen tredje kopi", () => {
    expect(ordeneFraEnKilde(laes(MAIL), laes(ORD), laes(MOTOR))).toBe(true);
  });
  it("VÆRNET VIRKER: en egen kopi i mailen eller i fladen fælder", () => {
    expect(ordeneFraEnKilde(`${laes(MAIL)}\nconst ORD = { traenger: "Trænger" };\n`, laes(ORD), laes(MOTOR))).toBe(false);
    expect(ordeneFraEnKilde(laes(MAIL), laes(ORD).replace("export { FILTER_MAERKER, MAERKE_ORD };", 'export const MAERKE_ORD2 = { traenger: "Trænger" };'), laes(MOTOR))).toBe(false);
  });
});

// ── TRIN 2 (29/9): vinduet, og linjeskiftene i mailens blokke ───────────────
import { erStatusmailVindue, STATUSMAIL_TIME, STATUSMAIL_UGEDAG } from "../../../supabase/functions/_shared/statusMail.ts";
import { indgangsMailHtml } from "../../../supabase/functions/_shared/indgangsMail.ts";

describe("statusMail — vinduet: mandag kl. 7 dansk, sommer og vinter", () => {
  it("konstanterne: mandag (1) og time 7", () => {
    expect(STATUSMAIL_UGEDAG).toBe(1);
    expect(STATUSMAIL_TIME).toBe(7);
  });
  it("SOMMER (CEST): mandag 5/10-2026 05:33Z = 07:33 dansk → inde; 04:33Z = 06:33 → ude; 06:33Z = 08:33 → inde (nøglen stopper den)", () => {
    expect(erStatusmailVindue(new Date("2026-10-05T05:33:00Z"))).toBe(true);
    expect(erStatusmailVindue(new Date("2026-10-05T04:33:00Z"))).toBe(false);
    expect(erStatusmailVindue(new Date("2026-10-05T06:33:00Z"))).toBe(true);
  });
  it("VINTER (CET): mandag 7/12-2026 05:33Z = 06:33 dansk → ude; 06:33Z = 07:33 → inde", () => {
    expect(erStatusmailVindue(new Date("2026-12-07T05:33:00Z"))).toBe(false);
    expect(erStatusmailVindue(new Date("2026-12-07T06:33:00Z"))).toBe(true);
  });
  it("ikke mandag → ude, også kl. 7: søndag, tirsdag — og «mandag 00:30 dansk» (søndag 22:30Z) er time 0", () => {
    expect(erStatusmailVindue(new Date("2026-10-04T05:33:00Z"))).toBe(false); // søndag
    expect(erStatusmailVindue(new Date("2026-10-06T05:33:00Z"))).toBe(false); // tirsdag
    expect(erStatusmailVindue(new Date("2026-10-04T22:30:00Z"))).toBe(false); // mandag 00:30 dansk
    expect(erStatusmailVindue(new Date("2026-09-29T06:00:00Z"))).toBe(false); // i dag, tirsdag
  });
});

describe("statusMail — MÅLT: blokkenes linjeskift bliver til <br> i indgangsMailHtml (ingen ændring nødvendig)", () => {
  it("esc() oversætter \\n til <br>, så navnene i en blok står på hver sin linje; overskrift og link står med", () => {
    const html = indgangsMailHtml({
      eyebrow: "Medlemsoverblik",
      overskrift: "Medlemsoverblik uge 40: 2 trænger",
      afsnit: ["Ugens overblik."],
      blokke: [{ overskrift: "Trænger (2)", tekst: "Uden Bruger ApS\nAarhus Både\nhttps://app.theboardroom.dk/virksomheder?maerke=traenger" }],
      hilsen: "The Boardroom",
    });
    expect(html).toContain("Uden Bruger ApS<br>Aarhus Både<br>https://app.theboardroom.dk/virksomheder?maerke=traenger");
    expect(html).toContain(">Trænger (2)</p>");
    expect(html).toContain(">Medlemsoverblik</p>");
    expect(html).not.toContain("Uden Bruger ApS\nAarhus");
  });
});

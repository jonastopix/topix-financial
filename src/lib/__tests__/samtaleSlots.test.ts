import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { kbhTilUtc, laegDageTilDato } from "@/lib/hverdage";
import {
  CALENDLY_SPOERGSMAAL_VIRKSOMHED, CALENDLY_VINDUE_DAGE, erSlotLedig, filtrerSamtaleSlots, grupperPrDag, SAMTALE_ADVISOR,
  SAMTALE_HORISONT_DAGE, SAMTALE_VARSEL_TIMER, slutAf, vinduerForCalendly, type CalendlySlot,
} from "@/lib/samtaleSlots";

// Ledige tider til afklaringssamtalen med Calendly som kilde (udkast 18/9, rev. 2).
// JONAS' RIGTIGE TIDER (målt i Calendly 18/9 = det Jonas sendte): mandag 09.30–16,
// tirsdag 09–16, onsdag 09–16, torsdag 09–15, fredag ingen, weekend ingen, INGEN
// frokostpause. Testene simulerer Calendlys available_times ud fra dem.
const ARBEJDSTIDER: Record<number, [string, string] | null> = { 1: ["09:30", "16:00"], 2: ["09:00", "16:00"], 3: ["09:00", "16:00"], 4: ["09:00", "15:00"], 5: null, 6: null, 0: null };
const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** Som Calendly ville svare: 30-min-slots i arbejdstiderne, «available», minus optaget. */
function calendlySlots(fraDato: string, dage: number, optaget: string[] = []): CalendlySlot[] {
  const ud: CalendlySlot[] = [];
  for (let d = 0; d < dage; d++) {
    const dato = laegDageTilDato(fraDato, d);
    const ugedag = new Date(`${dato}T12:00:00Z`).getUTCDay();
    const v = ARBEJDSTIDER[ugedag];
    if (!v) continue;
    for (let m = min(v[0]); m + 30 <= min(v[1]); m += 30) {
      const iso = kbhTilUtc(dato, Math.floor(m / 60), m % 60).toISOString();
      if (!optaget.includes(iso)) ud.push({ start_time: iso, status: "available", invitees_remaining: 1 });
    }
  }
  return ud;
}
const NU = new Date("2026-09-17T10:00:00Z"); // torsdag 17/9 kl. 12 dansk tid
const krop = (sti: string) => { const k = readFileSync(resolve(process.cwd(), sti), "utf8"); return k.slice(k.indexOf("*/") + 2).replace(/from "\.\/([A-Za-z]+)\.ts"/g, 'from "./$1"'); };

describe("samtaleSlots — Calendlys slots gennem platformens dom", () => {
  it("paritet og Jonas' konstanter: 4 timers varsel, 60 dages horisont, 7-dages vinduer, spørgsmålet «Virksomhed»", () => {
    expect(krop("src/lib/samtaleSlots.ts")).toBe(krop("supabase/functions/_shared/samtaleSlots.ts"));
    expect(SAMTALE_ADVISOR).toBe("jonas");
    expect(SAMTALE_VARSEL_TIMER).toBe(4);
    expect(SAMTALE_HORISONT_DAGE).toBe(60);
    expect(CALENDLY_VINDUE_DAGE).toBe(7);
    expect(CALENDLY_SPOERGSMAAL_VIRKSOMHED).toBe("Virksomhed");
  });

  it("Jonas' uge: torsdag 09–15 giver 12 slots, mandag starter 09.30, fredag og weekend intet, ingen frokostpause", () => {
    const s = filtrerSamtaleSlots({ calendly: calendlySlots("2026-09-21", 7), platformBooket: [], nu: NU });
    const dage = grupperPrDag(s);
    expect(dage.map((d) => d.dato)).toEqual(["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"]);
    expect(dage[0].slots[0]).toBe("2026-09-21T07:30:00.000Z"); // mandag 09.30
    expect(dage[0].slots).toHaveLength(13);                       // 09.30–16.00 = 13 × 30 min
    expect(dage[1].slots).toHaveLength(14);                       // tirsdag 09–16
    expect(dage[3].slots).toHaveLength(12);                       // torsdag 09–15
    expect(dage[1].slots).toContain("2026-09-22T10:00:00.000Z");  // 12.00 — ingen frokostpause
  });

  it("varslet på 4 timer: torsdag kl. 12 er 13.00 og 14.30 ledige, 12.00 og 14.00-slot før 16.00 dansk er …", () => {
    // nu = torsdag 17/9 kl. 12.00 dansk; varsel 4 t → tidligst 16.00 dansk; torsdag slutter 15 → intet i dag
    const s = filtrerSamtaleSlots({ calendly: calendlySlots("2026-09-17", 2), platformBooket: [], nu: NU });
    expect(s).toEqual([]); // torsdag er væk, fredag har ingen tider
    const tidlig = filtrerSamtaleSlots({ calendly: calendlySlots("2026-09-17", 1), platformBooket: [], nu: new Date("2026-09-17T06:00:00Z") }); // kl. 08 dansk
    expect(tidlig[0]).toBe("2026-09-17T10:00:00.000Z"); // første slot ≥ 12.00 dansk
    expect(tidlig).not.toContain("2026-09-17T09:30:00.000Z");
  });

  it("horisonten på 60 dage skærer; vinduerForCalendly deler den i 7-dages stykker uden huller", () => {
    const v = vinduerForCalendly(NU);
    expect(v.length).toBe(9);
    expect(v[0].fra).toBe(new Date(NU.getTime() + 60_000).toISOString());
    for (let i = 1; i < v.length; i++) expect(v[i].fra).toBe(v[i - 1].til);
    expect(v[v.length - 1].til).toBe(new Date(NU.getTime() + 60 * 86_400_000).toISOString());
    const langt = filtrerSamtaleSlots({ calendly: calendlySlots("2026-11-16", 7), platformBooket: [], nu: NU }); // dag 60 er 16/11
    expect(langt.every((x) => Date.parse(x) <= NU.getTime() + 60 * 86_400_000)).toBe(true);
    expect(langt.some((x) => x.startsWith("2026-11-17"))).toBe(false);
  });

  it("danske helligdage fjernes selv om Calendly tilbyder dem (juleaftensdag torsdag 24/12-2026)", () => {
    const s = filtrerSamtaleSlots({ calendly: calendlySlots("2026-12-21", 7), platformBooket: [], nu: new Date("2026-12-20T10:00:00Z") });
    expect(grupperPrDag(s).map((d) => d.dato)).toEqual(["2026-12-21", "2026-12-22", "2026-12-23"]); // 24. jul, 25.–26. helligdage
  });

  it("kun «available»; allerede booket i platformen fjernes (bælte og seler); egen samtale er udeladt af kalderen", () => {
    const c = calendlySlots("2026-09-21", 1);
    c[0] = { ...c[0], status: "unavailable" };
    const s = filtrerSamtaleSlots({ calendly: c, platformBooket: ["2026-09-21T08:00:00Z"], nu: NU });
    expect(s).not.toContain("2026-09-21T07:30:00.000Z");
    expect(s).not.toContain("2026-09-21T08:00:00.000Z");
    expect(s).toContain("2026-09-21T08:30:00.000Z");
  });

  it("erSlotLedig: serveren regner selv — uden for Calendlys liste, ugyldig tid eller booket her → ikke ledig", () => {
    const input = { calendly: calendlySlots("2026-09-21", 1), platformBooket: [], nu: NU };
    expect(erSlotLedig("2026-09-21T07:30:00Z", input)).toBe(true);
    expect(erSlotLedig("2026-09-21T07:45:00Z", input)).toBe(false);
    expect(erSlotLedig("2026-09-21T06:00:00Z", input)).toBe(false);
    expect(erSlotLedig("x", input)).toBe(false);
    expect(slutAf("2026-09-21T07:30:00Z")).toBe("2026-09-21T08:00:00.000Z");
  });
});

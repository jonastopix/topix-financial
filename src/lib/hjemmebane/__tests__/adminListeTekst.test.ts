import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ADMIN_HENTER_TEKST, adminHentefejlTekst, adminListeTekst } from "@/lib/hjemmebane/adminListeTekst";

// «Tavse queryFn'er» (mangellisten, resten efter #928/#1126), 30/9-2026:
// EventsView, ContentView og HbMaterials viste den TOMME tilstand, når
// hentningen fejlede. Tom og fejlet er to beskeder.

const TOM = { hvad: "events", tom: "Ingen events endnu." };

describe("adminListeTekst — henter · fejlet · tom", () => {
  it("henter → «Henter…» (også hvis en tidligere hentning fejlede)", () => {
    expect(adminListeTekst({ isLoading: true, isError: false }, TOM)).toBe(ADMIN_HENTER_TEKST);
    expect(adminListeTekst({ isLoading: true, isError: true }, TOM)).toBe(ADMIN_HENTER_TEKST);
  });

  it("fejlet → fejlteksten, ALDRIG den tomme tilstand", () => {
    const t = adminListeTekst({ isLoading: false, isError: true }, TOM);
    expect(t).toBe("Events kunne ikke hentes lige nu — listen kan mangle noget. Prøv igen.");
    expect(t).not.toBe(TOM.tom);
  });

  it("lykkedes og tom → den tomme tilstand", () => {
    expect(adminListeTekst({ isLoading: false, isError: false }, TOM)).toBe(TOM.tom);
  });

  it("fejlteksten har stort begyndelsesbogstav og nævner hvad", () => {
    expect(adminHentefejlTekst("materialet")).toBe("Materialet kunne ikke hentes lige nu — listen kan mangle noget. Prøv igen.");
  });
});

const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");
const laes = (sti: string) => udenKommentarer(readFileSync(resolve(process.cwd(), sti), "utf8"));

const EVENTS = "src/components/hjemmebane/admin/views/EventsView.tsx";
const CONTENT = "src/components/hjemmebane/admin/views/ContentView.tsx";
const MATERIALER = "src/components/hjemmebane/admin/HbMaterials.tsx";

/** Kildeværn: listens emptyText går gennem adminListeTekst med isError — ikke isLoading alene. */
export const eventsSkelner = (k: string) =>
  /emptyText=\{adminListeTekst\(eventsQuery, \{/.test(k) && !/eventsQuery\.isLoading\s*\?\s*"Henter…"/.test(k);
export const indholdSkelner = (k: string) =>
  /emptyText=\{adminListeTekst\(/.test(k) &&
  k.includes("isError: collectionsQuery.isError || itemsQuery.isError,") &&
  !/itemsQuery\.isLoading\s*\?\s*"Henter…"/.test(k);
export const materialerSkelner = (k: string) =>
  /\{query\.isError && \(\s*<p[^>]*>\{adminHentefejlTekst\("materialet"\)\}<\/p>\s*\)\}/.test(k);

describe("adminListeTekst.guard — de tre flader skelner tom fra fejlet", () => {
  it("EventsView", () => expect(eventsSkelner(laes(EVENTS))).toBe(true));
  it("ContentView (samlinger ELLER indhold fejlet)", () => expect(indholdSkelner(laes(CONTENT))).toBe(true));
  it("HbMaterials", () => expect(materialerSkelner(laes(MATERIALER))).toBe(true));

  it("værnet virker: den gamle form fælder alle tre", () => {
    const gammelEvents = laes(EVENTS).replace(
      /emptyText=\{adminListeTekst\(eventsQuery, \{[\s\S]*?\}\)\}/,
      'emptyText={eventsQuery.isLoading ? "Henter…" : "Ingen events endnu."}',
    );
    expect(eventsSkelner(gammelEvents)).toBe(false);
    expect(indholdSkelner(laes(CONTENT).replace("isError: collectionsQuery.isError || itemsQuery.isError,", "isError: false,"))).toBe(false);
    expect(materialerSkelner(laes(MATERIALER).replace("{query.isError && (", "{false && ("))).toBe(false);
  });
});

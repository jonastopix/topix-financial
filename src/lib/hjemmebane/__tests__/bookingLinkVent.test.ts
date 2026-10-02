import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BOOKING_LINK_FRIST_MS,
  BOOKING_LINK_POLL_MS,
  BOOKING_LINK_VENTER_TEKST,
  bookingLinkInterval,
  bookingLinkTilstand,
} from "@/lib/hjemmebane/bookingLinkVent";

// analyse-medlemsrejse 30/9 §2.9: polling hvert 2. sekund uden loft og uden
// fejlbesked, så længe booking-linket manglede.

const i = (o: Partial<{ harLink: boolean; fejlet: boolean; forloebetMs: number }>) => ({
  harLink: false,
  fejlet: false,
  forloebetMs: 0,
  ...o,
});

describe("bookingLinkTilstand", () => {
  it("link → klar, også efter fristen og efter en fejl", () => {
    expect(bookingLinkTilstand(i({ harLink: true }))).toBe("klar");
    expect(bookingLinkTilstand(i({ harLink: true, forloebetMs: 10 * BOOKING_LINK_FRIST_MS }))).toBe("klar");
    expect(bookingLinkTilstand(i({ harLink: true, fejlet: true }))).toBe("klar");
  });
  it("inden fristen uden link → henter", () => {
    expect(bookingLinkTilstand(i({ forloebetMs: BOOKING_LINK_FRIST_MS - 1 }))).toBe("henter");
  });
  it("ved og efter fristen → udloebet", () => {
    expect(bookingLinkTilstand(i({ forloebetMs: BOOKING_LINK_FRIST_MS }))).toBe("udloebet");
  });
  it("fejlet hentning → fejlet, uanset tid", () => {
    expect(bookingLinkTilstand(i({ fejlet: true }))).toBe("fejlet");
  });
});

describe("bookingLinkInterval", () => {
  it("poller kun mens den henter", () => {
    expect(bookingLinkInterval(i({}))).toBe(BOOKING_LINK_POLL_MS);
    expect(bookingLinkInterval(i({ harLink: true }))).toBe(false);
    expect(bookingLinkInterval(i({ fejlet: true }))).toBe(false);
    expect(bookingLinkInterval(i({ forloebetMs: BOOKING_LINK_FRIST_MS }))).toBe(false);
  });
  it("loftet: 60 s / 2 s = 30 forespørgsler pr. ventetid", () => {
    expect(BOOKING_LINK_FRIST_MS / BOOKING_LINK_POLL_MS).toBe(30);
  });
  it("beskeden siger, at betalingen er modtaget", () => {
    expect(BOOKING_LINK_VENTER_TEKST).toMatch(/betaling er modtaget/);
  });
});

const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");
const VIEW = udenKommentarer(
  readFileSync(resolve(process.cwd(), "src/components/hjemmebane/booksession/BookSessionView.tsx"), "utf8"),
);

export const pollingenHarLoft = (kilde: string): boolean => {
  const q = kilde.slice(kilde.indexOf('queryKey: ["session-booking"'), kilde.indexOf("const linkTilstand"));
  return (
    !/refetchInterval:\s*\(query\)\s*=>\s*\(!query\.state\.data\?\.calendly_booking_url \? 2000 : false\)/.test(kilde) &&
    q.includes("bookingLinkInterval({") &&
    q.includes("if (error) throw error;") &&
    kilde.includes("clearTimeout(t)") &&
    kilde.includes("onClick={proevLinkIgen}")
  );
};

describe("BookSessionView — kildeværn", () => {
  it("pollingen går gennem dommen, læser fejl, rydder timeren og har «Prøv igen»", () => {
    expect(pollingenHarLoft(VIEW)).toBe(true);
  });
  it("selvbevis: den gamle uendelige poll fælder værnet", () => {
    const gammel = VIEW.replace(
      /refetchInterval: \(query\) =>\s*bookingLinkInterval\(\{[\s\S]*?\}\),/,
      "refetchInterval: (query) => (!query.state.data?.calendly_booking_url ? 2000 : false),",
    );
    expect(gammel).not.toBe(VIEW);
    expect(pollingenHarLoft(gammel)).toBe(false);
  });
  it("hooks står over abonnent-returnen (React #310)", () => {
    const abonnentReturn = VIEW.indexOf('if (!isAdvisor && membershipTier === "subscriber") {');
    expect(abonnentReturn).toBeGreaterThan(0);
    for (const hook of ["useState(() => Date.now())", "useEffect(() => {", "const linkTilstand"]) {
      expect(VIEW.indexOf(hook)).toBeGreaterThan(0);
      expect(VIEW.indexOf(hook)).toBeLessThan(abonnentReturn);
    }
  });
});

import { describe, expect, it } from "vitest";
import type { ContentItem } from "@/lib/hjemmebane/adminContentApi";
import { isoWeekNumber } from "@/lib/hjemmebane/week";
import {
  countNewSince,
  pickActiveItem,
  pickActivePush,
  pickActiveWeekVideo,
  pickEvergreen,
  pickMainStory,
  PUSH_STANDARD_LEVETID_DAGE,
  type StoryCandidate,
} from "../pushSelection";

const push = (overrides: Partial<ContentItem>): ContentItem =>
  ({
    title: "Uden titel",
    published_at: null,
    created_at: "2026-01-01T00:00:00Z",
    metadata: {},
    ...overrides,
  }) as ContentItem;

/** Fast "nu": fredag 7. august 2026 kl. 09.00 lokal tid. */
const NOW = new Date(2026, 7, 7, 9, 0, 0);

describe("pickActivePush — hero-udvælgelsen", () => {
  it("nyeste published vinder (published_at DESC, created_at-fallback)", () => {
    const items = [
      push({ title: "Ældre", published_at: "2026-08-01T08:00:00Z" }),
      push({ title: "Nyest", published_at: "2026-08-05T08:00:00Z" }),
    ];
    expect(pickActivePush(items, NOW)?.title).toBe("Nyest");
  });

  it("udløbet indslag springes over til næstnyeste", () => {
    const items = [
      push({ title: "Udløbet i går", published_at: "2026-08-05T08:00:00Z", metadata: { expires_at: "2026-08-06" } }),
      push({ title: "Stadig aktiv", published_at: "2026-08-01T08:00:00Z" }),
    ];
    expect(pickActivePush(items, NOW)?.title).toBe("Stadig aktiv");
  });

  it("udløbsdagen selv er stadig aktiv — torsdagens push lever torsdagen ud", () => {
    const torsdagAften = new Date(2026, 7, 6, 23, 30, 0);
    const items = [
      push({ title: "Torsdags-push", published_at: "2026-08-05T08:00:00Z", metadata: { expires_at: "2026-08-06" } }),
    ];
    expect(pickActivePush(items, torsdagAften)?.title).toBe("Torsdags-push");
  });

  it("dagen efter udløbsdagen er indslaget væk", () => {
    const fredagNat = new Date(2026, 7, 7, 0, 0, 1);
    const items = [
      push({ title: "Torsdags-push", published_at: "2026-08-05T08:00:00Z", metadata: { expires_at: "2026-08-06" } }),
    ];
    expect(pickActivePush(items, fredagNat)).toBeUndefined();
  });

  // Før (til 17/9): it("manglende/ugyldig expires_at = aldrig udløb") —
  //   expect(pickActivePush([push({ title: "Ugyldig dato", published_at: "2026-08-05T08:00:00Z", metadata: { expires_at: "snarest" } })], NOW)?.title).toBe("Ugyldig dato");
  // Skrevet om med vilje (forside PR 1, Jonas «A» til valg 4): uden gyldig dato
  // lever et push PUSH_STANDARD_LEVETID_DAGE (28) dage efter published_at.
  it("manglende/ugyldig expires_at: nyt push (2 dage) er aktivt — standard-levetiden gælder, ikke «aldrig udløb»", () => {
    const items = [
      push({ title: "Ugyldig dato", published_at: "2026-08-05T08:00:00Z", metadata: { expires_at: "snarest" } }),
      push({ title: "Uden dato", published_at: "2026-08-06T08:00:00Z", metadata: {} }),
    ];
    expect(PUSH_STANDARD_LEVETID_DAGE).toBe(28);
    expect(pickActivePush(items, NOW)?.title).toBe("Uden dato");
    expect(pickActivePush([items[0]], NOW)?.title).toBe("Ugyldig dato");
  });

  it("tom liste → undefined", () => {
    expect(pickActivePush([], NOW)).toBeUndefined();
  });
});

/** Nyhedens levetid (forside PR 1, 17/9 — Jonas «A» til valg 4): «Ugens push»
    fra 12. august stod på forsiden 17. september. Uden dato: dag 28 er
    stadig aktiv, dag 29 væk — regnet i DANSK kalenderdag (Europe/Copenhagen),
    så testens tidspunkter er UTC-ISO og uafhængige af værtens zone. */
describe("pickActivePush — standard-levetiden på 28 dage uden expires_at", () => {
  // Udgivet 10/7 10:00 UTC = 10/7 dansk → sidste aktive dag 7/8 (10/7 + 28).
  const udgivet = "2026-07-10T10:00:00Z";
  const p = push({ title: "Uden dato", published_at: udgivet, metadata: {} });

  it("27, 28 og 29 dage efter: aktiv, aktiv, væk", () => {
    expect(pickActivePush([p], new Date("2026-08-06T10:00:00Z"))?.title).toBe("Uden dato"); // dag 27
    expect(pickActivePush([p], new Date("2026-08-07T10:00:00Z"))?.title).toBe("Uden dato"); // dag 28
    expect(pickActivePush([p], new Date("2026-08-08T10:00:00Z"))).toBeUndefined(); // dag 29
  });

  it("dansk midnat afgør datoskiftet — 7/8 23:59 dansk (21:59 UTC) er dag 28, 8/8 00:00 dansk (22:00 UTC) er dag 29", () => {
    expect(pickActivePush([p], new Date("2026-08-07T21:59:59Z"))?.title).toBe("Uden dato");
    expect(pickActivePush([p], new Date("2026-08-07T22:00:01Z"))).toBeUndefined();
  });

  it("udgivelsesdagen regnes også i dansk tid: udgivet 10/7 22:30 UTC = 11/7 dansk → sidste dag er 8/8", () => {
    const sent = push({ title: "Sent på aftenen", published_at: "2026-07-10T22:30:00Z", metadata: {} });
    expect(pickActivePush([sent], new Date("2026-08-08T10:00:00Z"))?.title).toBe("Sent på aftenen");
    expect(pickActivePush([sent], new Date("2026-08-09T10:00:00Z"))).toBeUndefined();
  });

  it("et gammelt push uden dato springes over til det næste der lever — også en yngre med dato", () => {
    const items = [
      push({ title: "Gammel uden dato", published_at: "2026-06-01T08:00:00Z", metadata: {} }),
      push({ title: "Yngre med dato", published_at: "2026-05-20T08:00:00Z", metadata: { expires_at: "2026-12-31" } }),
    ];
    // Sorteringen er published_at DESC: den gamle uden dato står først, men er udløbet → den med dato vinder.
    expect(pickActivePush(items, NOW)?.title).toBe("Yngre med dato");
  });

  it("en gyldig expires_at vinder over levetiden — begge veje", () => {
    const kortere = push({ title: "Udløber i morgen", published_at: "2026-08-05T08:00:00Z", metadata: { expires_at: "2026-08-08" } });
    const laengere = push({ title: "Lever til jul", published_at: "2026-06-01T08:00:00Z", metadata: { expires_at: "2026-12-24" } });
    expect(pickActivePush([kortere], new Date(2026, 7, 9, 9, 0, 0))).toBeUndefined();
    expect(pickActivePush([laengere], NOW)?.title).toBe("Lever til jul");
  });

  it("ulæselig udgivelsesdato: aldrig udløb af alder (fail-open på visning)", () => {
    expect(pickActivePush([push({ title: "Uden stempel", published_at: "hest", created_at: "hest", metadata: {} })], NOW)?.title).toBe("Uden stempel");
  });
});

/** Ugens video (bølge 1, PR 1): samme dom som hero'en via pickActiveItem.
    Testdatoer er RELATIVE til NOW (tidszone-lærdommen fra PR #217):
    published_at som absolutte epoch-offsets; expires_at som LOKALE
    kalenderdatoer afledt af NOW's dele — dommen ER lokal-kalenderbaseret
    ("lever dagen ud"), så begge dele er deterministiske i enhver TZ. */
const isoDaysAgo = (days: number) => new Date(NOW.getTime() - days * 86400000).toISOString();

const localDateStr = (offsetDays: number) => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Klokkeslæt på en dag relativt til NOW's dato (lokal tid). */
const atLocal = (offsetDays: number, hours: number, minutes = 0, seconds = 0) =>
  new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + offsetDays, hours, minutes, seconds);

describe("pickActiveWeekVideo — ugens video (samme dom, relative datoer)", () => {
  it("nyeste published vinder", () => {
    const items = [
      push({ title: "Ældre video", published_at: isoDaysAgo(6) }),
      push({ title: "Nyeste video", published_at: isoDaysAgo(2) }),
    ];
    expect(pickActiveWeekVideo(items, NOW)?.title).toBe("Nyeste video");
  });

  it("udløbet springes over til næstnyeste", () => {
    const items = [
      push({ title: "Udløbet i går", published_at: isoDaysAgo(2), metadata: { expires_at: localDateStr(-1) } }),
      push({ title: "Stadig aktiv", published_at: isoDaysAgo(6) }),
    ];
    expect(pickActiveWeekVideo(items, NOW)?.title).toBe("Stadig aktiv");
  });

  it("grænsetilfælde: udløber I DAG → aktiv dagen ud (sent på aftenen), væk lige efter midnat", () => {
    const items = [
      push({ title: "Dagens video", published_at: isoDaysAgo(2), metadata: { expires_at: localDateStr(0) } }),
    ];
    expect(pickActiveWeekVideo(items, atLocal(0, 23, 30))?.title).toBe("Dagens video");
    expect(pickActiveWeekVideo(items, atLocal(1, 0, 0, 1))).toBeUndefined();
  });

  it("manglende/ugyldig expires_at = aldrig udløb — ugens video har INGEN standard-levetid (valget, PR 1 17/9: kurateres i hånden, ingen beslutning om alder)", () => {
    const items = [push({ title: "Uden udløb", published_at: isoDaysAgo(2), metadata: { expires_at: "snarest" } })];
    expect(pickActiveWeekVideo(items, NOW)?.title).toBe("Uden udløb");
    const gammel = [push({ title: "40 dage gammel", published_at: isoDaysAgo(40), metadata: {} })];
    expect(pickActiveWeekVideo(gammel, NOW)?.title).toBe("40 dage gammel");
    expect(pickActivePush(gammel, NOW)).toBeUndefined();
  });

  it("tomt resultat: tom liste OG alle-udløbet → undefined", () => {
    expect(pickActiveWeekVideo([], NOW)).toBeUndefined();
    const allExpired = [
      push({ title: "A", published_at: isoDaysAgo(3), metadata: { expires_at: localDateStr(-2) } }),
      push({ title: "B", published_at: isoDaysAgo(5), metadata: { expires_at: localDateStr(-1) } }),
    ];
    expect(pickActiveWeekVideo(allExpired, NOW)).toBeUndefined();
  });

  // Før (til 17/9): expect(pickActivePush(items, NOW)).toBe(pickActiveItem(items, NOW)); — uden tredje argument.
  it("wrapper-ækvivalens: begge domme ER kerne-dommen — videoen uden levetid, pushet med PUSH_STANDARD_LEVETID_DAGE", () => {
    const items = [
      push({ title: "X", published_at: isoDaysAgo(1) }),
      push({ title: "Y", published_at: isoDaysAgo(4), metadata: { expires_at: localDateStr(-1) } }),
    ];
    expect(pickActiveWeekVideo(items, NOW)).toBe(pickActiveItem(items, NOW));
    expect(pickActivePush(items, NOW)).toBe(pickActiveItem(items, NOW, PUSH_STANDARD_LEVETID_DAGE));
    // Under 28 dage er de to ens; over er de forskellige (målt i testen ovenfor).
    expect(pickActivePush(items, NOW)).toBe(pickActiveItem(items, NOW));
  });
});

/** Evergreen-rotationen (PR B1): deterministisk pr. ISO-uge, pulje
    sorteret på slug. Forventninger beregnes RELATIVT via isoWeekNumber
    (ingen hardcodede uge-numre — TZ-/kalender-robust). */
describe("pickEvergreen — deterministisk uge-rotation", () => {
  const ev = (slug: string): ContentItem => push({ title: slug, slug } as Partial<ContentItem>);

  it("tom pulje → undefined", () => {
    expect(pickEvergreen([], NOW)).toBeUndefined();
  });

  it("1 element → altid samme, uanset uge", () => {
    const pool = [ev("eneste")];
    expect(pickEvergreen(pool, NOW)?.slug).toBe("eneste");
    expect(pickEvergreen(pool, new Date(NOW.getTime() + 21 * 86400000))?.slug).toBe("eneste");
  });

  it("N elementer: valget følger uge-nummeret modulo N på den SLUG-sorterede pulje", () => {
    const pool = [ev("c-sidst"), ev("a-foerst"), ev("b-midt")]; // bevidst usorteret input
    const sorted = ["a-foerst", "b-midt", "c-sidst"];
    const week = isoWeekNumber(NOW);
    expect(pickEvergreen(pool, NOW)?.slug).toBe(sorted[week % 3]);
  });

  it("stabil INDEN FOR ugen (torsdag = fredag), skifter ved +7 dage", () => {
    const pool = [ev("a"), ev("b"), ev("c")];
    const torsdag = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 1); // NOW er fredag
    expect(pickEvergreen(pool, torsdag)).toBe(pickEvergreen(pool, NOW));
    const naesteUge = new Date(NOW.getTime() + 7 * 86400000);
    const week = isoWeekNumber(NOW);
    expect(pickEvergreen(pool, naesteUge)?.slug).toBe(["a", "b", "c"][(week + 1) % 3]);
    expect(pickEvergreen(pool, naesteUge)).not.toBe(pickEvergreen(pool, NOW));
  });
});

/** Rykkeliste-dommen (PR B1): første ikke-null vinder; enhver kandidat
    kan være null af hvilken som helst grund (udløbet, tom pulje) — dommen
    antager aldrig at en kandidat findes. Podcast-kandidaten UDGIK 17/9
    (forside PR 1, beslutning 17 fra 11/9) — de gamle forventninger står
    ordret i kommentarerne. */
describe("pickMainStory — hovedplads + sidespalte", () => {
  const c = (kind: StoryCandidate["kind"], item = kind): StoryCandidate<string> => ({ kind, item });

  it("alle null (tomme puljer) → main=null, tom sidespalte", () => {
    // Før: pickMainStory<string>([null, null, undefined, null, null]) — fem pladser med podcast.
    expect(pickMainStory<string>([null, null, undefined, null])).toEqual({ main: null, side: [] });
  });

  it("kun evergreen tilbage → evergreen bærer hovedpladsen (aldrig tom forside)", () => {
    // Før: [null, null, null, null, c("evergreen")].
    expect(pickMainStory<string>([null, null, null, c("evergreen")])).toEqual({
      main: c("evergreen"),
      side: [],
    });
  });

  it("push+video+evergreen (redaktionelt null) → push vinder, resten i rækkefølge", () => {
    // Før: [c("push"), c("video"), null, c("podcast"), null] → side ["video", "podcast"].
    const result = pickMainStory<string>([c("push"), c("video"), null, c("evergreen")]);
    expect(result.main).toEqual(c("push"));
    expect(result.side.map((s) => s.kind)).toEqual(["video", "evergreen"]);
  });

  it("huller i midten bevarer rækkefølgen (video null → redaktionelt rykker frem)", () => {
    // Før: [null, null, c("redaktionelt"), c("podcast"), c("evergreen")] → side ["podcast", "evergreen"].
    const result = pickMainStory<string>([null, null, c("redaktionelt"), c("evergreen")]);
    expect(result.main?.kind).toBe("redaktionelt");
    expect(result.side.map((s) => s.kind)).toEqual(["evergreen"]);
  });

  it("kind «podcast» findes ikke længere i rykkelisten (beslutning 17)", () => {
    const kinds: StoryCandidate["kind"][] = ["push", "video", "redaktionelt", "evergreen"];
    expect(kinds).not.toContain("podcast");
  });
});

/** "Siden sidst"-dommen (bølge 3): STRENGT efter (>), null tæller aldrig,
    ulæseligt/manglende lastVisit → 0. Datoer som absolutte epoch-offsets
    fra NOW (daysFromNow-mønstret) — TZ-uafhængigt. */
describe("countNewSince — siden sidst-tællingen", () => {
  const daysFromNow = (days: number) => new Date(NOW.getTime() + days * 86400000).toISOString();

  it("lastVisit null (første besøg) → 0 uanset kandidater", () => {
    expect(countNewSince([{ publishedAt: daysFromNow(-1) }], null)).toBe(0);
  });

  it("lastVisit ulæselig → 0", () => {
    expect(countNewSince([{ publishedAt: daysFromNow(-1) }], "hest")).toBe(0);
  });

  it("kandidat m. publishedAt null tæller ikke", () => {
    expect(countNewSince([{ publishedAt: null }], daysFromNow(-3))).toBe(0);
  });

  it("publiceret FØR besøget tæller ikke; EFTER tæller", () => {
    const lastVisit = daysFromNow(-3);
    expect(countNewSince([{ publishedAt: daysFromNow(-5) }], lastVisit)).toBe(0);
    expect(countNewSince([{ publishedAt: daysFromNow(-1) }], lastVisit)).toBe(1);
  });

  it("grænsen: publiceret PRÆCIS på besøgs-tidspunktet tæller ikke (strengt >)", () => {
    const lastVisit = daysFromNow(-3);
    expect(countNewSince([{ publishedAt: lastVisit }], lastVisit)).toBe(0);
  });

  it("blandet liste → korrekt antal", () => {
    const lastVisit = daysFromNow(-3);
    expect(
      countNewSince(
        [
          { publishedAt: daysFromNow(-1) }, // ny
          { publishedAt: daysFromNow(-2) }, // ny
          { publishedAt: daysFromNow(-5) }, // gammel
          { publishedAt: null }, // ukendt → tæller ikke
        ],
        lastVisit,
      ),
    ).toBe(2);
  });
});

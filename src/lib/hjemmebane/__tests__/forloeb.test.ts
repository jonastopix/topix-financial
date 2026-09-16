/**
 * Forløbslinjen (16/9): dommen flyttet ORDRET fra ForsideView.tsx:82-109 til
 * lib/hjemmebane/forloeb.ts, delt med forsidens fokuskort. Hver tilstand
 * fra planens §4 låses; skipped = continue låses som DAGENS ADFÆRD (ikke en
 * beslutning). Paritet: erSporetVideo ↔ useAkademiData.isTrackedItem på de
 * fire kombinationer af provider og video-id.
 */
import { describe, expect, it, vi } from "vitest";
import {
  afgoerForloeb,
  erSporetVideo,
  FORTSAET_PRAEFIKS,
  forloebslinje,
  START_PRAEFIKS,
  type ForloebEntry,
  type ForloebOmraade,
} from "@/lib/hjemmebane/forloeb";
import { lektionsSti } from "@/lib/hjemmebane/lektionerForModul";

// useAkademiData er en React-hook-fil (react-query, useAuth, supabase-klient);
// kun prædikatet isTrackedItem hentes, og klient/auth mockes til ingenting.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, isAdvisor: false }) }));
import { isTrackedItem } from "@/components/hjemmebane/akademi/useAkademiData";

type Entry = ForloebEntry & { collection?: { title: string }; progress?: { last_position_seconds: number | null } };
/** Overstyring pr. lektion i fixturen — item-felterne delvist, resten helt. */
type Over = Partial<Omit<Entry, "item">> & { item?: Partial<Entry["item"]> };

const lektion = (id: string, area: string, over: Over = {}): Entry => ({
  item: { id, area, slug: `slug-${id}`, title: `Lektion ${id}`, media_provider: "bunny", bunny_video_id: `v-${id}`, ...over.item },
  drip: over.drip ?? { unlocked: true },
  state: over.state ?? "untouched",
  ...(over.collection ? { collection: over.collection } : {}),
  ...(over.progress ? { progress: over.progress } : {}),
});

const OMRAADER: readonly ForloebOmraade[] = [
  { key: "start_her", akademi: true },
  { key: "classroom", akademi: true },
  { key: "push", akademi: false },
];

const raekke = (id: string, updated_at: string) => ({ content_item_id: id, updated_at });

/** Tre lektioner i start_her (a1, a2, a3), to i classroom (c1, c2), én i push (p1). */
const katalog = (over: Record<string, Over> = {}) =>
  new Map<string, Entry[]>([
    ["start_her", [lektion("a1", "start_her", over.a1), lektion("a2", "start_her", over.a2), lektion("a3", "start_her", over.a3)]],
    ["classroom", [lektion("c1", "classroom", over.c1), lektion("c2", "classroom", over.c2)]],
    ["push", [lektion("p1", "push", over.p1)]],
  ]);

const doem = (orderedByArea: Map<string, Entry[]>, progressRows: { content_item_id: string; updated_at: string }[] = []) =>
  afgoerForloeb({ orderedByArea, progressRows, areas: OMRAADER });

describe("afgoerForloeb — tilstandene", () => {
  it("nul progress-rækker: intet continue, started false, harBegyndt false, next = første sporede ulåste urørte i områdernes rækkefølge", () => {
    const d = doem(katalog());
    expect(d.continueEntry).toBeUndefined();
    expect(d.started).toBe(false);
    expect(d.harBegyndt).toBe(false);
    expect(d.nextEntry?.item.id).toBe("a1");
    expect(forloebslinje(d)?.tekst).toBe("Eller start i Akademiet: Lektion a1");
  });

  it("a1 og a2 gennemført, intet påbegyndt: continue undefined, started false, harBegyndt true, next a3 — linjen siger «fortsæt», ikke «start»", () => {
    const d = doem(katalog({ a1: { state: "done" }, a2: { state: "done" } }), [raekke("a1", "2026-09-10T10:00:00Z"), raekke("a2", "2026-09-11T10:00:00Z")]);
    expect(d.continueEntry).toBeUndefined();
    expect(d.started).toBe(false);
    expect(d.harBegyndt).toBe(true);
    expect(d.nextEntry?.item.id).toBe("a3");
    expect(forloebslinje(d)?.tekst).toBe("Eller fortsæt dit forløb: Lektion a3");
  });

  it("harBegyndt: kun et push-item (ikke-Akademi) rørt → false; kun et bibliotekselement (uden bunny-id) rørt → false; en låst, gennemført lektion tæller som begyndt", () => {
    expect(doem(katalog({ p1: { state: "done" } }), [raekke("p1", "2026-09-16T10:00:00Z")]).harBegyndt).toBe(false);
    const bib = { item: { media_provider: "none", bunny_video_id: null } };
    expect(doem(katalog({ a1: { ...bib, state: "done" } }), [raekke("a1", "2026-09-16T10:00:00Z")]).harBegyndt).toBe(false);
    const laastDone = doem(katalog({ a1: { state: "done", drip: { unlocked: false } } }), [raekke("a1", "2026-09-16T10:00:00Z")]);
    expect(laastDone.harBegyndt).toBe(true);
    expect(laastDone.continueEntry).toBeUndefined();
    expect(forloebslinje(laastDone)?.tekst).toBe("Eller fortsæt dit forløb: Lektion a2");
  });

  it("én påbegyndt (a1 started): continue = a1, started true, next = første urørte ≠ a1", () => {
    const d = doem(katalog({ a1: { state: "started" } }), [raekke("a1", "2026-09-16T10:00:00Z")]);
    expect(d.continueEntry?.item.id).toBe("a1");
    expect(d.started).toBe(true);
    expect(d.nextEntry?.item.id).toBe("a2");
  });

  it("varianten: nr. 3 er påbegyndt, 1-2 urørte → continue = a3, next = a1 (forsiden skifter fra a1 til a3)", () => {
    const d = doem(katalog({ a3: { state: "started" } }), [raekke("a3", "2026-09-16T10:00:00Z")]);
    expect(d.continueEntry?.item.id).toBe("a3");
    expect(d.nextEntry?.item.id).toBe("a1");
    expect(d.started).toBe(true);
  });

  it("flere påbegyndte: continue = den med højeste updated_at, ikke den første i rækkefølgen", () => {
    const d = doem(katalog({ a1: { state: "started" }, c2: { state: "started" } }), [
      raekke("a1", "2026-09-10T10:00:00Z"),
      raekke("c2", "2026-09-15T10:00:00Z"),
    ]);
    expect(d.continueEntry?.item.id).toBe("c2");
    expect(d.nextEntry?.item.id).toBe("a2");
    // Rækkefølgen i progressRows er ligegyldig — sorteringen er updated_at.
    const omvendt = doem(katalog({ a1: { state: "started" }, c2: { state: "started" } }), [
      raekke("c2", "2026-09-15T10:00:00Z"),
      raekke("a1", "2026-09-10T10:00:00Z"),
    ]);
    expect(omvendt.continueEntry?.item.id).toBe("c2");
  });

  it("alle gennemført: begge undefined, started false, harBegyndt true — og linjen null", () => {
    const alle = { a1: { state: "done" as const }, a2: { state: "done" as const }, a3: { state: "done" as const }, c1: { state: "done" as const }, c2: { state: "done" as const } };
    const d = doem(katalog(alle), ["a1", "a2", "a3", "c1", "c2"].map((id, i) => raekke(id, `2026-09-1${i}T10:00:00Z`)));
    expect(d.continueEntry).toBeUndefined();
    expect(d.nextEntry).toBeUndefined();
    expect(d.started).toBe(false);
    expect(d.harBegyndt).toBe(true);
    expect(forloebslinje(d)).toBeNull();
  });

  it("låst dryp springes over i begge: den påbegyndte er låst → ikke continue; den første urørte er låst → næste ulåste; alt låst → intet", () => {
    const laastContinue = doem(katalog({ a1: { state: "started", drip: { unlocked: false } } }), [raekke("a1", "2026-09-16T10:00:00Z")]);
    expect(laastContinue.continueEntry).toBeUndefined();
    expect(laastContinue.started).toBe(false);
    expect(laastContinue.nextEntry?.item.id).toBe("a2");

    const laastNext = doem(katalog({ a1: { drip: { unlocked: false } } }));
    expect(laastNext.nextEntry?.item.id).toBe("a2");

    const laas = { unlocked: false };
    const altLaast = doem(katalog({ a1: { drip: laas }, a2: { drip: laas }, a3: { drip: laas }, c1: { drip: laas }, c2: { drip: laas } }));
    expect(altLaast.continueEntry).toBeUndefined();
    expect(altLaast.nextEntry).toBeUndefined();
  });

  it("ikke-Akademi-område: et push-item med bunny-medie og en nyere progress-række bliver aldrig continue og aldrig next", () => {
    const d = doem(katalog({ p1: { state: "started" }, a2: { state: "started" } }), [
      raekke("p1", "2026-09-16T12:00:00Z"),
      raekke("a2", "2026-09-16T10:00:00Z"),
    ]);
    expect(d.continueEntry?.item.id).toBe("a2");
    expect(d.nextEntry?.item.id).toBe("a1");
    // Kun push rørt: intet continue, og push er heller ikke next.
    const kunPush = doem(katalog({ p1: { state: "started" } }), [raekke("p1", "2026-09-16T12:00:00Z")]);
    expect(kunPush.continueEntry).toBeUndefined();
    expect(kunPush.nextEntry?.item.id).toBe("a1");
  });

  it("bibliotek (uden bunny-id) bliver aldrig continue eller next, uanset state og progress-række", () => {
    const bib = { item: { media_provider: "none", bunny_video_id: null } };
    const d = doem(katalog({ a1: { ...bib, state: "started" } }), [raekke("a1", "2026-09-16T10:00:00Z")]);
    expect(d.continueEntry).toBeUndefined();
    expect(d.nextEntry?.item.id).toBe("a2");
    const bunnyUdenId = doem(katalog({ a1: { item: { media_provider: "bunny", bunny_video_id: "" } } }));
    expect(bunnyUdenId.nextEntry?.item.id).toBe("a2");
  });

  it("progress-række på et item der ikke er i kataloget ignoreres — ingen crash, næste række vinder", () => {
    const d = doem(katalog({ a2: { state: "started" } }), [
      raekke("slettet", "2026-09-16T12:00:00Z"),
      raekke("a2", "2026-09-16T10:00:00Z"),
    ]);
    expect(d.continueEntry?.item.id).toBe("a2");
    expect(doem(katalog(), [raekke("slettet", "2026-09-16T12:00:00Z")]).continueEntry).toBeUndefined();
  });

  it("DAGENS ADFÆRD, ikke en beslutning: en sprunget lektion (state skipped) er continue — «Fortsæt hvor du slap» peger på den; next udelukker den", () => {
    const d = doem(katalog({ a1: { state: "skipped" } }), [raekke("a1", "2026-09-16T10:00:00Z")]);
    expect(d.continueEntry?.item.id).toBe("a1");
    expect(d.started).toBe(true);
    expect(d.nextEntry?.item.id).toBe("a2");
  });

  it("returnerer de SAMME objekter som kom ind — ForsideView læser progress og collection af dem", () => {
    const k = katalog({ a1: { state: "started", progress: { last_position_seconds: 42 }, collection: { title: "Kursus" } } });
    const d = doem(k, [raekke("a1", "2026-09-16T10:00:00Z")]);
    expect(d.continueEntry).toBe(k.get("start_her")![0]);
    expect(d.continueEntry?.progress?.last_position_seconds).toBe(42);
    expect(d.nextEntry).toBe(k.get("start_her")![1]);
  });

  it("tomt katalog: intet — uden crash", () => {
    const d = doem(new Map(), [raekke("a1", "2026-09-16T10:00:00Z")]);
    expect(d).toEqual({ continueEntry: undefined, nextEntry: undefined, started: false, harBegyndt: false });
  });
});

describe("erSporetVideo — paritet med useAkademiData.isTrackedItem på de fire kombinationer", () => {
  const kombinationer = [
    { media_provider: "bunny", bunny_video_id: "v1", forventet: true },
    { media_provider: "bunny", bunny_video_id: null, forventet: false },
    { media_provider: "youtube", bunny_video_id: "v1", forventet: false },
    { media_provider: "none", bunny_video_id: null, forventet: false },
  ];
  for (const k of kombinationer) {
    it(`${k.media_provider} / ${k.bunny_video_id ?? "null"} → ${k.forventet}`, () => {
      expect(erSporetVideo(k)).toBe(k.forventet);
      // isTrackedItem tager hele ContentItem-rækken; kun de to felter læses.
      expect(isTrackedItem(k as unknown as Parameters<typeof isTrackedItem>[0])).toBe(k.forventet);
    });
  }
  it("tom streng som video-id er ikke et video-id", () => {
    expect(erSporetVideo({ media_provider: "bunny", bunny_video_id: "" })).toBe(false);
  });
});

describe("forloebslinje — teksten følger tilstanden", () => {
  it("started: «Eller fortsæt dit forløb: {continue}» med lektionsSti", () => {
    const d = doem(katalog({ a3: { state: "started" } }), [raekke("a3", "2026-09-16T10:00:00Z")]);
    const linje = forloebslinje(d)!;
    expect(linje.entry.item.id).toBe("a3");
    expect(linje.tekst).toBe("Eller fortsæt dit forløb: Lektion a3");
    expect(linje.sti).toBe("/akademiet/start_her/slug-a3");
    expect(linje.sti).toBe(lektionsSti(linje.entry.item));
  });
  it("aldrig begyndt: «Eller start i Akademiet: {next}»", () => {
    const linje = forloebslinje(doem(katalog()))!;
    expect(linje.entry.item.id).toBe("a1");
    expect(linje.tekst).toBe("Eller start i Akademiet: Lektion a1");
    expect(linje.sti).toBe("/akademiet/start_her/slug-a1");
  });
  it("hverken continue eller next → null (linjen vises ikke)", () => {
    const alle = { a1: { state: "done" as const }, a2: { state: "done" as const }, a3: { state: "done" as const }, c1: { state: "done" as const }, c2: { state: "done" as const } };
    expect(forloebslinje(doem(katalog(alle)))).toBeNull();
    expect(forloebslinje(doem(new Map()))).toBeNull();
  });
  it("begyndt men ikke midt i noget (kun gennemførte): «Eller fortsæt dit forløb: {next}»", () => {
    const linje = forloebslinje(doem(katalog({ a1: { state: "done" } }), [raekke("a1", "2026-09-16T10:00:00Z")]))!;
    expect(linje.entry.item.id).toBe("a2");
    expect(linje.tekst).toBe("Eller fortsæt dit forløb: Lektion a2");
  });
  it("præfikserne er ordret", () => {
    expect(FORTSAET_PRAEFIKS).toBe("Eller fortsæt dit forløb: ");
    expect(START_PRAEFIKS).toBe("Eller start i Akademiet: ");
  });
});

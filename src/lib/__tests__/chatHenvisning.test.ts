import { describe, expect, it } from "vitest";
import {
  byggChatBesked, chatAfsendelse, chatDokumentTilTekst, harHenvisning, henvisningsAdresse, parseChatDokument,
} from "@/lib/chatDokument";
import { parseCommunityDokument } from "@/lib/hjemmebane/communityDokument";
import { aftalenErUdloebet, rabataftaleAdresse } from "@/lib/hjemmebane/rabataftaleAdresse";
import {
  chatForslagsTekst, chatForslagTilNode, forslagsFejlTekst, MAKS_FORSLAG, vaelgChatForslag, type ChatForslagsKilder,
} from "@/lib/chatHenvisningsForslag";
import type { ContentItem, EventRow } from "@/lib/hjemmebane/adminContentApi";
import type { MedlemsPartner } from "@/lib/hjemmebane/akademiApi";

/** «#» i chatten, trin 3 — de rene dele af fladen (29/9-2026). */
const AFTALE = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";
const EVENT = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const TRAAD = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
const doc = (...content: unknown[]) => ({ type: "doc", content });
const p = (...content: unknown[]) => ({ type: "paragraph", content });
const t = (text: string) => ({ type: "text", text });
const rabat = (titel = "Dinero", aftaleId = AFTALE) => ({ type: "rabathenvisning", attrs: { aftaleId, titel } });
const lektion = { type: "henvisning", attrs: { area: "academy", slug: "budget", titel: "Budget" } };

describe("rabathenvisning — den fjerde node i motoren", () => {
  it("består i Community's motor og i chattens hvidliste, med uuid og titel", () => {
    const d = doc(p(t("Se "), rabat()));
    const forventet = [{ type: "paragraph", content: [{ type: "text", text: "Se ", marks: [] }, { type: "rabathenvisning", aftaleId: AFTALE, titel: "Dinero" }] }];
    expect(parseCommunityDokument(d)).toEqual(forventet);
    expect(parseChatDokument(d)).toEqual(forventet);
  });
  it("aftale_id accepteres som aftaleId; et ugyldigt id eller en tom titel falder stille væk", () => {
    expect(parseChatDokument(doc(p({ type: "rabathenvisning", attrs: { aftale_id: AFTALE, titel: "X" } })))).toEqual([
      { type: "paragraph", content: [{ type: "rabathenvisning", aftaleId: AFTALE, titel: "X" }] },
    ]);
    expect(parseChatDokument(doc(p(t("a"), rabat("Dinero", "ikke-uuid"), rabat("", AFTALE))))).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "a", marks: [] }] },
    ]);
  });
  it("som blok (uden for et afsnit) er den ulovlig — inline, som de tre andre", () => {
    expect(parseChatDokument(doc(rabat()))).toEqual([]);
  });
  it("teksten: «#titel» som de andre henvisninger — og byggChatBesked bygger content af den", () => {
    expect(chatDokumentTilTekst(parseChatDokument(doc(p(t("Brug "), rabat(), t(" i år")))))).toBe("Brug  #Dinero  i år");
    expect(byggChatBesked(doc(p(rabat("A & B"))))).toEqual({ content: "#A &amp; B", indhold_json: doc(p(rabat("A & B"))) });
  });
});

describe("harHenvisning", () => {
  it("sand for hver af de fire gyldige henvisninger, også dybt i en liste", () => {
    expect(harHenvisning(doc(p(lektion)))).toBe(true);
    expect(harHenvisning(doc(p({ type: "eventhenvisning", attrs: { eventId: EVENT, titel: "E" } })))).toBe(true);
    expect(harHenvisning(doc(p({ type: "opslaghenvisning", attrs: { traadId: TRAAD, titel: "O" } })))).toBe(true);
    expect(harHenvisning(doc({ type: "bulletList", content: [{ type: "listItem", content: [p(rabat())] }] }))).toBe(true);
  });
  it("falsk for et dokument uden — og for en henvisning, motoren kasserer", () => {
    expect(harHenvisning(doc(p(t("Hej"))))).toBe(false);
    expect(harHenvisning(doc(p(rabat("Dinero", "ikke-uuid"))))).toBe(false);
    for (const x of [null, undefined, "tekst", [], {}]) expect(harHenvisning(x)).toBe(false);
  });
});

describe("henvisningsAdresse — ruterne, og aftalens fra rabataftaleAdresse", () => {
  it("lektion, event, opslag og aftale", () => {
    const [afsnit] = parseChatDokument(doc(p(
      lektion,
      { type: "eventhenvisning", attrs: { eventId: EVENT, titel: "E" } },
      { type: "opslaghenvisning", attrs: { traadId: TRAAD, titel: "O" } },
      rabat("R", AFTALE.toUpperCase()),
    )));
    const noder = afsnit.type === "paragraph" ? afsnit.content : [];
    expect(noder.map((n) => henvisningsAdresse(n as never))).toEqual([
      "/akademiet/academy/budget",
      `/events/${EVENT}`,
      `/community/${TRAAD}`,
      `/rabataftaler?aftaleId=${AFTALE}`,
    ]);
    // Aftalens adresse er rabataftaleAdresse's svar — også store bogstaver ind, små ud.
    expect(henvisningsAdresse(noder[3] as never)).toBe(rabataftaleAdresse(AFTALE.toUpperCase()));
  });
});

describe("chatAfsendelse — uden henvisning er content tegn for tegn det gamle", () => {
  // Den gamle regel i ChatRichInput/MessageEditDialog, ordret: isPlain ? text : html.
  const gammel = (tekst: string, html: string) => (html === `<p>${tekst}</p>` ? tekst : html);
  const uden = doc(p(t("Hej")));
  const tilfaelde: [string, string][] = [
    ["Hej med dig", "<p>Hej med dig</p>"],
    ["a < b", "<p>a &lt; b</p>"],
    ["fed", "<p><strong>fed</strong></p>"],
    ["et\n\nto", "<p>et</p><p>to</p>"],
    ["x", '<ul><li><p>x</p></li></ul>'],
  ];
  for (const [tekst, html] of tilfaelde) {
    it(`${JSON.stringify(html)} → ${JSON.stringify(gammel(tekst, html))}, intet dokument`, () => {
      expect(chatAfsendelse(tekst, html, uden)).toEqual({ content: gammel(tekst, html) });
    });
  }
  it("med en henvisning følger dokumentet med (content er stadig den gamle regel — panet bygger af dokumentet)", () => {
    const d = doc(p(t("Se "), lektion));
    expect(chatAfsendelse("Se #Budget", "<p>Se <span>#Budget</span></p>", d)).toEqual({ content: "<p>Se <span>#Budget</span></p>", dokument: d });
  });
});

describe("chattens #-forslag — vaelgChatForslag", () => {
  const NU = new Date("2026-09-29T10:00:00Z");
  const ev = (id: string, title: string, starts_at: string, status = "published", ends_at: string | null = null) =>
    ({ id, title, starts_at, ends_at, status }) as unknown as EventRow;
  const it_ = (id: string, title: string, area: string, status = "published") =>
    ({ id, title, area, slug: title.toLowerCase(), status, collection_id: null, duration_seconds: 600 }) as unknown as ContentItem;
  const af = (id: string, name: string, valid_until: string | null = null) =>
    ({ id, name, valid_until, discount_text: "20 %" }) as unknown as MedlemsPartner;

  const kilder: ChatForslagsKilder = {
    events: [
      ev("e1", "Vækstdag", "2026-10-02T10:00:00Z"),
      ev("e2", "Afholdt", "2026-09-28T10:00:00Z"),
      ev("e3", "Kladde", "2026-10-05T10:00:00Z", "draft"),
      ev("e4", "Slutter lige nu", "2026-09-29T08:00:00Z", "published", "2026-09-29T09:59:00Z"),
    ],
    items: [
      it_("i1", "Budget", "academy"),
      it_("i2", "Push-indslag", "push"),
      it_("i3", "Kladdelektion", "classroom", "draft"),
      it_("i4", "Start", "start_her"),
    ],
    aftaler: [
      af("a1", "Dinero"),
      af("a2", "Udløbet i går", "2026-09-28"),
      af("a3", "Gælder i dag", "2026-09-29"),
    ],
  };

  it("events published og ikke passeret; lektioner published i de tilladte områder; aftaler minus de udløbne — i den rækkefølge", () => {
    expect(vaelgChatForslag(kilder, "", NU).map((f) =>
      f.slags === "event" ? f.event.id : f.slags === "item" ? f.item.id : f.aftale.id,
    )).toEqual(["e1", "i1", "i4", "a1", "a3"]);
  });
  it("søgningen matcher titlen uden hensyn til store/små bogstaver", () => {
    expect(vaelgChatForslag(kilder, "DIN", NU).map((f) => f.slags)).toEqual(["rabat"]);
    expect(vaelgChatForslag(kilder, "bud", NU).map((f) => f.slags)).toEqual(["item"]);
  });
  it(`højst ${MAKS_FORSLAG}`, () => {
    const mange = { ...kilder, aftaler: Array.from({ length: 20 }, (_, i) => af(`x${i}`, `Aftale ${i}`)) };
    expect(vaelgChatForslag(mange, "", NU)).toHaveLength(MAKS_FORSLAG);
  });
  it("udløbsdommen er /rabataftalers: gælder til og med dagen", () => {
    expect(aftalenErUdloebet("2026-09-29", new Date("2026-09-29T21:00:00Z"))).toBe(false);
    expect(aftalenErUdloebet("2026-09-28", NU)).toBe(true);
    expect(aftalenErUdloebet(null, NU)).toBe(false);
  });
  it("forslaget → noden overlever motoren og får sin adresse", () => {
    const aftale = af(AFTALE, "Dinero");
    const node = chatForslagTilNode({ slags: "rabat", aftale });
    expect(node).toEqual({ type: "rabathenvisning", attrs: { aftaleId: AFTALE, titel: "Dinero" } });
    const [afsnit] = parseChatDokument(doc(p(node)));
    expect(afsnit.type === "paragraph" && henvisningsAdresse(afsnit.content[0] as never)).toBe(rabataftaleAdresse(AFTALE));
    expect(chatForslagTilNode({ slags: "event", event: ev(EVENT, "Vækstdag", "2026-10-02T10:00:00Z") }))
      .toEqual({ type: "eventhenvisning", attrs: { eventId: EVENT, titel: "Vækstdag" } });
    expect(chatForslagTilNode({ slags: "item", item: it_("i1", "Budget", "academy") }))
      .toEqual({ type: "henvisning", attrs: { area: "academy", slug: "budget", titel: "Budget" } });
  });
  it("rækkens tekst", () => {
    expect(chatForslagsTekst({ slags: "item", item: it_("i1", "Budget", "academy") }, "Økonomi")).toEqual({ titel: "Budget", undertekst: "Lektion · Økonomi · 10 min" });
    expect(chatForslagsTekst({ slags: "rabat", aftale: af("a1", "Dinero") }, null)).toEqual({ titel: "Dinero", undertekst: "Rabataftale · 20 %" });
    expect(chatForslagsTekst({ slags: "event", event: ev("e1", "Vækstdag", "2026-10-02T10:00:00Z") }, null).undertekst).toMatch(/^Event · /);
  });
});

describe("forslagsFejlTekst — chattens linje, når en kilde fejlede", () => {
  const ingen = { events: false, items: false, samlinger: false, aftaler: false };
  it("ingen fejl → ingen linje", () => {
    expect(forslagsFejlTekst(ingen)).toBeNull();
  });
  it("hver af de fire kilder alene giver linjen — også samlingerne, som i Community", () => {
    for (const k of Object.keys(ingen) as (keyof typeof ingen)[]) {
      expect(forslagsFejlTekst({ ...ingen, [k]: true })).toBe("Forslagene til # kunne ikke hentes lige nu. Du kan stadig skrive og sende.");
    }
  });
  it("husets form: sektionsfejlTekst's sætning, ingen teknik", () => {
    expect(forslagsFejlTekst({ ...ingen, events: true })).not.toMatch(/_|fejl|error|@/i);
  });
});

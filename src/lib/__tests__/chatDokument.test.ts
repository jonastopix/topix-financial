import { describe, expect, it } from "vitest";
import {
  byggChatBesked, CHAT_NODER, chatDokumentTilTekst, HENVISNINGS_NODER, parseChatDokument, tekstTilContent,
} from "@/lib/chatDokument";
import { parseCommunityDokument } from "@/lib/hjemmebane/communityDokument";
import { renTekst } from "@/lib/hjemmebane/richtext";
import { SVAR_UDDRAG_MAKS, svarUddrag } from "@/lib/chatSvar";

/** «#» i chatten — motoren (29/9-2026, kort m28-hash-i-chatten). */
const EVENT = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const TRAAD = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
const doc = (...content: unknown[]) => ({ type: "doc", content });
const p = (...content: unknown[]) => ({ type: "paragraph", content });
const t = (text: string, marks?: unknown[]) => (marks ? { type: "text", text, marks } : { type: "text", text });
const lektion = (titel = "Budget", area = "academy", slug = "budget") => ({ type: "henvisning", attrs: { area, slug, titel } });
const event = (titel = "Vækstdag", eventId = EVENT) => ({ type: "eventhenvisning", attrs: { eventId, titel } });
const opslag = (titel = "Hej, jeg er Mette", traadId = TRAAD) => ({ type: "opslaghenvisning", attrs: { traadId, titel } });

describe("parseChatDokument — hvidlisten: ChatRichInputs noder + de tre #-henvisninger", () => {
  it("chattens egne noder består: afsnit, tekst med fed/kursiv/link, lister, hardBreak", () => {
    const n = parseChatDokument(doc(
      p(t("Hej "), t("fed", [{ type: "bold" }]), { type: "hardBreak" }, t("kursiv", [{ type: "italic" }]), t(" link", [{ type: "link", attrs: { href: "https://topix.dk" } }])),
      { type: "bulletList", content: [{ type: "listItem", content: [p(t("et"))] }] },
      { type: "orderedList", content: [{ type: "listItem", content: [p(t("to"))] }] },
    ));
    expect(n.map((x) => x.type)).toEqual(["paragraph", "bulletList", "orderedList"]);
    expect(JSON.stringify(n)).toContain('"href":"https://topix.dk"');
  });

  it("strike og code (StarterKit-marks) fjernes stille — teksten består", () => {
    const n = parseChatDokument(doc(p(t("streg", [{ type: "strike" }]), t(" kode", [{ type: "code" }]))));
    expect(n).toEqual([{ type: "paragraph", content: [{ type: "text", text: "streg", marks: [] }, { type: "text", text: " kode", marks: [] }] }]);
  });

  it("Community-noder, chatten ikke har (heading, blockquote, image, fil, naevnelse), fjernes stille med deres indhold", () => {
    const n = parseChatDokument(doc(
      { type: "heading", attrs: { level: 2 }, content: [t("Overskrift")] },
      { type: "blockquote", content: [p(t("citat"))] },
      { type: "image", attrs: { path: `${EVENT}/a.png`, alt: "" } },
      { type: "fil", attrs: { path: `${EVENT}/a.pdf`, navn: "a.pdf" } },
      p(t("tekst "), { type: "naevnelse", attrs: { userId: EVENT, navn: "Mette" } }),
    ));
    expect(n).toEqual([{ type: "paragraph", content: [{ type: "text", text: "tekst ", marks: [] }] }]);
  });

  it("et afsnit, der kun bestod af en nævnelse, bliver tomt og falder væk (Community's tomhedsregel, gentaget efter filtreringen)", () => {
    expect(parseChatDokument(doc(p({ type: "naevnelse", attrs: { userId: EVENT, navn: "Mette" } }), p(t("ok"))))).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "ok", marks: [] }] },
    ]);
    expect(parseChatDokument(doc(p({ type: "naevnelse", attrs: { userId: EVENT, navn: "Mette" } }), { type: "hardBreak" }))).toEqual([]);
  });

  it("en liste, hvis eneste punkt blev tømt, falder væk", () => {
    const tom = { type: "bulletList", content: [{ type: "listItem", content: [{ type: "blockquote", content: [p(t("x"))] }] }] };
    expect(parseChatDokument(doc(tom))).toEqual([]);
  });

  it("de tre #-henvisninger består, med Community's egne værn (uuid, område, slug, titel)", () => {
    const n = parseChatDokument(doc(p(lektion(), event(), opslag())));
    expect(n[0].type === "paragraph" && n[0].content.map((x) => x.type)).toEqual(["henvisning", "eventhenvisning", "opslaghenvisning"]);
    const ugyldige = parseChatDokument(doc(p(t("x"), lektion("Budget", "push"), lektion("Budget", "academy", "Ikke/slug"), event("Vækstdag", "ikke-uuid"), opslag(""))));
    expect(ugyldige).toEqual([{ type: "paragraph", content: [{ type: "text", text: "x", marks: [] }] }]);
  });

  it("ukendt node og ugyldigt input: stille væk, aldrig et kast", () => {
    expect(parseChatDokument(doc(p(t("a"), { type: "video", attrs: {} }), { type: "horizontalRule" }))).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "a", marks: [] }] },
    ]);
    for (const input of [null, undefined, "tekst", 42, [], { type: "paragraph" }, { type: "doc" }, { type: "doc", content: "x" }]) {
      expect(parseChatDokument(input)).toEqual([]);
    }
  });

  it("ENIGHED MED COMMUNITY: et dokument af chattens noder og de tre henvisninger parses ens af begge", () => {
    const d = doc(
      p(t("Se "), lektion(), t(" og "), event(), t(" eller "), opslag(), t(" — "), t("fed", [{ type: "bold" }])),
      { type: "bulletList", content: [{ type: "listItem", content: [p(t("punkt "), event("Netværk"))] }] },
    );
    expect(parseChatDokument(d)).toEqual(parseCommunityDokument(d));
  });

  it("listen: ChatRichInputs noder og de tre henvisninger — intet andet", () => {
    expect([...CHAT_NODER].sort()).toEqual(
      ["bulletList", "eventhenvisning", "hardBreak", "henvisning", "listItem", "opslaghenvisning", "orderedList", "paragraph", "text"],
    );
    expect([...HENVISNINGS_NODER]).toEqual(["henvisning", "eventhenvisning", "opslaghenvisning"]);
  });
});

describe("chatDokumentTilTekst — community_json_til_tekst's regler (20260917160000:65-113)", () => {
  const tekst = (d: unknown) => chatDokumentTilTekst(parseChatDokument(d));

  it("migrationens eget eksempel, uden nævnelsen: dobbelte mellemrum, fordi text-noderne selv bærer dem", () => {
    // SQL: 'Hej  @Mette  se  #Budget  og  #Vækstdag' — her uden @Mette-delen.
    expect(tekst(doc(p(t("Hej "), t(" se "), lektion(), t(" og "), event())))).toBe("Hej   se  #Budget  og  #Vækstdag");
  });
  it("kun en henvisning → «#titel» (et dokument af lutter henvisninger er ikke tomt)", () => {
    expect(tekst(doc(p(opslag())))).toBe("#Hej, jeg er Mette");
  });
  it("afsnit og listepunkter samles med ét mellemrum; hardBreak bidrager med intet", () => {
    expect(tekst(doc(p(t("A")), p(t("B"), { type: "hardBreak" }, t("C")), { type: "bulletList", content: [{ type: "listItem", content: [p(t("D"))] }] }))).toBe("A B C D");
  });
  it("teksten er ORDRET — marks, store bogstaver og tegn røres ikke", () => {
    expect(tekst(doc(p(t("Fed & <b>", [{ type: "bold" }]))))).toBe("Fed & <b>");
  });
  it("kun mellemrum trimmes i enderne (btrim uden tegnliste), og tomt giver null", () => {
    expect(tekst(doc(p(t("  a  "))))).toBe("a");
    expect(tekst(doc(p(t("\ta\t"))))).toBe("\ta\t");
    expect(tekst(doc(p(t("   "))))).toBeNull();
    expect(tekst(doc())).toBeNull();
    expect(chatDokumentTilTekst([])).toBeNull();
  });
});

describe("byggChatBesked — content udledes af dokumentet", () => {
  it("content er teksten, indhold_json er dokumentet som det kom", () => {
    const d = doc(p(t("Kom til "), event(), t(" på torsdag")));
    expect(byggChatBesked(d)).toEqual({ content: "Kom til  #Vækstdag  på torsdag", indhold_json: d });
  });
  it("«&», «<» og «>» kodes i content — den form, ChatRichInput giver en sådan besked i dag", () => {
    expect(tekstTilContent("a < b > c & d")).toBe("a &lt; b &gt; c &amp; d");
    expect(byggChatBesked(doc(p(t("a < b > c & d"))))?.content).toBe("a &lt; b &gt; c &amp; d");
  });
  it("intet dokument, eller intet der giver tekst → null (intet at sende)", () => {
    for (const input of [null, "x", [], 1, doc(), doc(p(t("   "))), doc(p({ type: "naevnelse", attrs: { userId: EVENT, navn: "M" } }))]) {
      expect(byggChatBesked(input)).toBeNull();
    }
  });
});

describe("læserne får det forventede uddrag — renTekst, Slack, klokken, svarcitatet", () => {
  const d = doc(
    p(t("Hej Mette, "), t("se", [{ type: "bold" }]), t(" "), lektion("Likviditetsbudget", "academy", "likviditetsbudget")),
    p(t("og kom til "), event("Vækstdag 2026")),
  );

  it("renTekst(chatDokumentTilTekst(doc)) er teksten med #titlerne", () => {
    expect(renTekst(chatDokumentTilTekst(parseChatDokument(d)))).toBe("Hej Mette, se #Likviditetsbudget og kom til #Vækstdag 2026");
  });
  it("renTekst(content) giver det samme — også når teksten har «<», «>» og «&»", () => {
    expect(renTekst(byggChatBesked(d)!.content)).toBe("Hej Mette, se #Likviditetsbudget og kom til #Vækstdag 2026");
    const svaer = doc(p(t("Margin < 5 % & likviditet > 0? Se "), lektion()));
    expect(renTekst(byggChatBesked(svaer)!.content)).toBe("Margin < 5 % & likviditet > 0? Se #Budget");
    // Uden kodningen ville tag-rensningen spise «< 5 % & likviditet >»:
    expect(renTekst(chatDokumentTilTekst(parseChatDokument(svaer)))).not.toContain("likviditet");
  });
  it("Slack (250 tegn) og klokken (100 tegn + «…») klipper det rene uddrag", () => {
    const lang = doc(p(t("x".repeat(300)), lektion()));
    const preview = renTekst(byggChatBesked(lang)!.content).slice(0, 250);
    expect(preview).toBe("x".repeat(250));
    const klokke = preview.length > 100 ? preview.slice(0, 100) + "…" : preview;
    expect(klokke).toBe(`${"x".repeat(100)}…`);
  });
  it("svarcitatet (svarUddrag) viser #titlen og klipper ved SVAR_UDDRAG_MAKS", () => {
    expect(svarUddrag(byggChatBesked(d)!.content)).toBe("Hej Mette, se #Likviditetsbudget og kom til #Vækstdag 2026");
    const lang = byggChatBesked(doc(p(t("y".repeat(200)))))!.content;
    expect(svarUddrag(lang).length).toBe(SVAR_UDDRAG_MAKS);
  });
});

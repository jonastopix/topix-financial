/**
 * «1. 1. 1.» i chatten (Jonas 1/10-2026 13:09) — chatHtml.ts.
 *
 * Den gemte form er bygget af en RIGTIG Tiptap-editor med ChatRichInputs
 * opsætning (StarterKit-konfigurationen ordret): medlemmet skriver «1. », en fed
 * overskrift, Enter to gange (ud af listen), teksten under, Enter, «2. » … —
 * input-reglen laver da tre lister med start 1, 2 og 3, og getHTML gemmer
 * <ol start="2">. Før rettelsen fjernede DOMPurify start, og alle tre viste «1.».
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import DOMPurify from "dompurify";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { ChatBeskedTekst } from "@/components/ChatBeskedTekst";
import { chatAfsendelse, parseChatDokument } from "@/lib/chatDokument";
import { nummererLister, renskChatHtml } from "@/lib/chatHtml";

const editorer: Editor[] = [];
afterEach(() => {
  cleanup();
  while (editorer.length) editorer.pop()!.destroy();
});

const nyEditor = () => {
  const e = new Editor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, blockquote: false, horizontalRule: false, hardBreak: { keepMarks: true } }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
    ],
    content: "",
  });
  editorer.push(e);
  return e;
};

/** Tast tegn for tegn gennem viewets handleTextInput (dér kører input-reglerne). */
const skriv = (e: Editor, tekst: string) => {
  for (const tegn of tekst) {
    const { from, to } = e.state.selection;
    const haandteret = e.view.someProp("handleTextInput", (f) => f(e.view, from, to, tegn, () => e.state.tr.insertText(tegn, from, to)));
    if (!haandteret) e.view.dispatch(e.state.tr.insertText(tegn, from, to));
  }
};
const enter = (e: Editor) => e.commands.keyboardShortcut("Enter");
const fed = (e: Editor, tekst: string) => {
  e.commands.setMark("bold");
  skriv(e, tekst);
  e.commands.unsetMark("bold");
};

/** Medlemmets besked: tre punkter, hvert med fed overskrift og en tekst under. */
const skrivTrePunkter = (e: Editor) => {
  e.commands.focus();
  for (const n of [1, 2, 3]) {
    skriv(e, `${n}. `);
    fed(e, `Overskrift ${n}`);
    enter(e);
    enter(e);
    skriv(e, `Tekst under punkt ${n}`);
    if (n < 3) enter(e);
  }
};

/** De synlige numre: hver <ol>'s start (standard 1) + plads, i dokumentorden. */
const numre = (rod: ParentNode): number[] =>
  Array.from(rod.querySelectorAll("ol")).flatMap((ol) => {
    const start = ol.hasAttribute("start") ? Number(ol.getAttribute("start")) : 1;
    return Array.from(ol.children)
      .filter((li) => li.tagName === "LI")
      .map((_, i) => start + i);
  });
const somDom = (html: string) => {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d;
};

/** Boblen FØR 1/10, ordret fra ChatBeskedTekst. */
const foer = (content: string) =>
  DOMPurify.sanitize(content, { ALLOWED_TAGS: ["b", "strong", "i", "em", "ul", "ol", "li", "a", "p", "br"], ALLOWED_ATTR: ["href", "target", "rel"] });

describe("den gemte form — målt med en rigtig editor", () => {
  it("tre punkter med tekst imellem bliver tre <ol>, og getHTML gemmer start 2 og 3", () => {
    const e = nyEditor();
    skrivTrePunkter(e);
    const html = e.getHTML();
    expect(html).toBe(
      "<ol><li><p><strong>Overskrift 1</strong></p></li></ol><p>Tekst under punkt 1</p>" +
        '<ol start="2"><li><p><strong>Overskrift 2</strong></p></li></ol><p>Tekst under punkt 2</p>' +
        '<ol start="3"><li><p><strong>Overskrift 3</strong></p></li></ol><p>Tekst under punkt 3</p>',
    );
    // Sendefeltets regel: ikke ren tekst → content = HTML, intet dokument (ingen #).
    expect(chatAfsendelse(e.getText().trim(), html, e.getJSON())).toEqual({ content: html });
  });

  it("FEJLEN: den gamle rensning viser 1, 1, 1", () => {
    const e = nyEditor();
    skrivTrePunkter(e);
    expect(numre(somDom(foer(e.getHTML())))).toEqual([1, 1, 1]);
  });

  it("RETTELSEN: renskChatHtml viser 1, 2, 3 — og boblen gør det samme", () => {
    const e = nyEditor();
    skrivTrePunkter(e);
    expect(numre(somDom(renskChatHtml(e.getHTML())))).toEqual([1, 2, 3]);
    const { container } = render(<MemoryRouter><ChatBeskedTekst content={e.getHTML()} /></MemoryRouter>);
    expect(numre(container)).toEqual([1, 2, 3]);
  });

  it("dokument-vejen (besked med #): attrs.start bæres gennem parseren og tegnes", () => {
    const e = nyEditor();
    skrivTrePunkter(e);
    const noder = parseChatDokument(e.getJSON());
    expect(noder.filter((n) => n.type === "orderedList").map((n) => (n.type === "orderedList" ? n.start : null))).toEqual([undefined, 2, 3]);
    const { container } = render(<MemoryRouter><ChatBeskedTekst content="x" dokument={e.getJSON()} /></MemoryRouter>);
    expect(numre(container)).toEqual([1, 2, 3]);
  });

  it("én liste med tre punkter (ingen tekst imellem) er uændret 1, 2, 3", () => {
    const e = nyEditor();
    e.commands.focus();
    skriv(e, "1. ");
    fed(e, "A");
    enter(e);
    fed(e, "B");
    enter(e);
    fed(e, "C");
    expect(e.getHTML()).toBe("<ol><li><p><strong>A</strong></p></li><li><p><strong>B</strong></p></li><li><p><strong>C</strong></p></li></ol>");
    expect(renskChatHtml(e.getHTML())).toBe(foer(e.getHTML()));
  });
});

describe("renskChatHtml — fortsættelse over tomme skillerum", () => {
  it("<ol>-søskende kun skilt af tomme afsnit/<br> fortsætter tællingen", () => {
    const html = "<ol><li><p>a</p></li><li><p>b</p></li></ol><p></p><br><p> <br></p><ol><li><p>c</p></li></ol><ol><li><p>d</p></li></ol>";
    expect(numre(somDom(renskChatHtml(html)))).toEqual([1, 2, 3, 4]);
  });
  it("et afsnit med tekst imellem bryder fortsættelsen (forfatterens to lister)", () => {
    expect(numre(somDom(renskChatHtml("<ol><li>a</li></ol><p>tekst</p><ol><li>b</li></ol>")))).toEqual([1, 1]);
  });
  it("et eget start står ved magt, og fortsættelsen regner fra det", () => {
    expect(numre(somDom(renskChatHtml('<ol start="5"><li>a</li></ol><p></p><ol><li>b</li></ol><ol start="1"><li>c</li></ol>')))).toEqual([5, 6, 7]);
  });
  it("punktlister er uændrede — også efter en <ol>", () => {
    for (const html of [
      "<ul><li><p>a</p></li></ul><p></p><ul><li><p>b</p></li></ul>",
      "<ol><li>a</li></ol><ul><li>b</li></ul>",
      '<ul start="3"><li>a</li></ul>',
    ]) {
      expect(renskChatHtml(html)).toBe(foer(html));
    }
  });
});

describe("XSS-værnet er uændret — start er den ENESTE nye attribut, og kun på <ol>", () => {
  it("start fjernes fra alt andet end <ol>", () => {
    expect(renskChatHtml('<p start="2">x</p><li start="2">y</li><a href="https://a.dk" start="3">z</a>')).toBe(
      foer('<p start="2">x</p><li start="2">y</li><a href="https://a.dk" start="3">z</a>'),
    );
  });
  it("et ugyldigt start fjernes (ikke tal, 0, negativt, for stort, decimal, injektion)", () => {
    for (const v of ["abc", "0", "-3", "1", "10000", "2.5", '2" onclick="alert(1)', "javascript:alert(1)"]) {
      const ud = renskChatHtml(`<ol start='${v}'><li>a</li></ol>`);
      expect(ud, v).toBe("<ol><li>a</li></ol>");
    }
  });
  it("andre attributter og tags fjernes som før", () => {
    const farlige = [
      '<ol start="2" onclick="alert(1)" style="color:red" class="x"><li onmouseover="x()">a</li></ol>',
      '<p>Hej</p><img src=x onerror="alert(1)"><script>alert(2)</script>',
      '<a href="javascript:alert(1)">x</a>',
      '<ol start="2"><li><svg onload="alert(1)"></svg>a</li></ol>',
    ];
    for (const html of farlige) {
      const ud = renskChatHtml(html);
      expect(ud).not.toMatch(/onclick|onerror|onmouseover|onload|style=|class=|<script|<img|<svg|javascript:/i);
      expect(ud.replace(/ start="\d+"/g, "")).toBe(foer(html));
    }
  });
});

describe("nummererLister — dokument-vejen", () => {
  const ol = (start: number | undefined, ...punkter: string[]) => ({
    type: "orderedList" as const,
    ...(start === undefined ? {} : { start }),
    content: punkter.map((t) => ({ type: "listItem" as const, content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: t, marks: [] }] }] })),
  });
  it("to lister lige efter hinanden fortsætter; et eget start står; punktlister røres ikke", () => {
    const ud = nummererLister([ol(undefined, "a", "b"), ol(undefined, "c"), ol(7, "d"), ol(undefined, "e")]);
    expect(ud.map((n) => (n.type === "orderedList" ? n.start : null))).toEqual([undefined, 3, 7, 8]);
    const ul = { type: "bulletList" as const, content: ol(undefined, "x").content };
    expect(nummererLister([ol(undefined, "a"), ul, ol(undefined, "b")]).map((n) => (n.type === "orderedList" ? n.start : n.type))).toEqual([undefined, "bulletList", undefined]);
  });
});

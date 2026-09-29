/**
 * «#» i chatten, trin 3 — sendefeltet med en RIGTIG Tiptap-editor (29/9-2026).
 *
 * BEVISET for «en besked UDEN henvisninger ender med content tegn for tegn som
 * i dag»: samme input i to editorer — dagens opsætning (ChatRichInput før trin 3:
 * StarterKit + Link + Placeholder) og den nye (+ #-udvidelserne) — og dagens
 * regel (isPlain ? text : html) mod chatAfsendelse. Ens streng, intet dokument.
 * StarterKit/Link-konfigurationen er ChatRichInputs (ChatRichInput.tsx), ordret.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor, type Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { chatHenvisningsUdvidelser } from "@/components/chatHenvisninger";
import { byggChatBesked, chatAfsendelse, parseChatDokument } from "@/lib/chatDokument";
import type { ChatForslag, ChatForslagsKilder } from "@/lib/chatHenvisningsForslag";
import type { MedlemsPartner } from "@/lib/hjemmebane/akademiApi";

const AFTALE = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";

const grund = (): Extensions => [
  StarterKit.configure({
    heading: false,
    codeBlock: false,
    blockquote: false,
    horizontalRule: false,
    hardBreak: { keepMarks: true },
  }),
  Link.configure({
    openOnClick: false,
    HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
  }),
  Placeholder.configure({ placeholder: "Skriv en besked..." }),
];

const kilder = { current: { events: [], items: [], aftaler: [] } as ChatForslagsKilder };
const samlinger = { current: new Map<string, string>() };
const editorer: Editor[] = [];
const ny = (content: string | Record<string, unknown> = "") => {
  const e = new Editor({ extensions: [...grund(), ...chatHenvisningsUdvidelser(kilder, samlinger, { current: null })], content });
  editorer.push(e);
  return e;
};
const idag = (content: string) => {
  const e = new Editor({ extensions: grund(), content });
  editorer.push(e);
  return e;
};
afterEach(() => {
  while (editorer.length) editorer.pop()!.destroy();
});

/** ChatRichInput.submitFromEditor FØR trin 3, ordret. */
const dagensContent = (e: Editor) => {
  const text = e.getText().trim();
  const html = e.getHTML();
  const isPlain = html === `<p>${text}</p>`;
  return isPlain ? text : html;
};
/** ChatRichInput.submitFromEditor NU. */
const nyAfsendelse = (e: Editor) => chatAfsendelse(e.getText().trim(), e.getHTML(), e.getJSON());

describe("sendefeltet uden henvisninger — content tegn for tegn som i dag", () => {
  const input = [
    "<p>Hej med dig</p>",
    "<p>  mellemrum  omkring  </p>",
    "<p>a &lt; b &gt; c &amp; d</p>",
    "<p>#1 er et hashtag, ikke en henvisning</p>",
    "<p><strong>fed</strong> og <em>kursiv</em></p>",
    "<p>et</p><p>to</p>",
    "<p>linje<br>to</p>",
    "<ul><li><p>punkt</p></li></ul>",
    "<ol><li><p>første</p></li><li><p>anden</p></li></ol>",
    '<p><a href="https://topix.dk">link</a></p>',
    "<p><s>streg</s> og <code>kode</code></p>",
    "<p>🎥 Video</p>",
  ];
  for (const html of input) {
    it(html, () => {
      const foer = dagensContent(idag(html));
      const nu = nyAfsendelse(ny(html));
      expect(nu).toEqual({ content: foer });
    });
  }
});

describe("sendefeltet med en henvisning — gennem det rigtige #-forslag", () => {
  const dinero = { id: AFTALE, name: "Dinero", valid_until: null, discount_text: "20 %" } as unknown as MedlemsPartner;

  it("«#din» tilbyder aftalen; valget indsætter noden + et mellemrum; dokumentet følger med, og byggChatBesked giver content", () => {
    kilder.current = { events: [], items: [], aftaler: [dinero] };
    const e = ny("<p>Brug </p>");
    const henvisning = e.extensionManager.extensions.find((x) => x.name === "henvisning")!;
    const forslag = henvisning.options.suggestion.items({ query: "din", editor: e }) as ChatForslag[];
    expect(forslag).toEqual([{ slags: "rabat", aftale: dinero }]);

    const slut = e.state.doc.content.size - 1;
    henvisning.options.suggestion.command({ editor: e, range: { from: slut, to: slut }, props: forslag[0] });

    const { content, dokument } = nyAfsendelse(e);
    expect(dokument).toBeDefined();
    expect(content).not.toBe(e.getText().trim()); // HTML'en (span'en) — panet bruger den ikke
    // HTML-parseren fjerner «<p>Brug </p>»s afsluttende mellemrum; valget sætter et efter noden.
    expect(byggChatBesked(dokument)).toEqual({ content: "Brug #Dinero", indhold_json: dokument });
    expect(parseChatDokument(dokument)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "Brug", marks: [] }, { type: "rabathenvisning", aftaleId: AFTALE, titel: "Dinero" }, { type: "text", text: " ", marks: [] }] },
    ]);
  });

  it("redigeringen: indhold_json lagt i editoren kommer uændret ud — alle tre chat-noder kendes af skemaet", () => {
    const indhold = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [
          { type: "text", text: "Se " },
          { type: "henvisning", attrs: { area: "academy", slug: "budget", titel: "Budget" } },
          { type: "text", text: " og " },
          { type: "eventhenvisning", attrs: { eventId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301", titel: "Vækstdag" } },
          { type: "text", text: " og " },
          { type: "rabathenvisning", attrs: { aftaleId: AFTALE, titel: "Dinero" } },
        ],
      }],
    };
    const e = ny(indhold);
    expect(parseChatDokument(e.getJSON())).toEqual(parseChatDokument(indhold));
    expect(e.getText()).toBe("Se #Budget og #Vækstdag og #Dinero");
  });
});

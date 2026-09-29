/**
 * Den delte #-dropdown (components/henvisninger.ts) — fodnoten (29/9-2026).
 * Uden fodnote (Community) er adfærden den gamle: ingen rækker → skjult.
 * Med fodnote (chatten) står linjen nederst, også uden rækker.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { opretForslagsDropdown } from "@/components/henvisninger";
import { chatHenvisningsUdvidelser } from "@/components/chatHenvisninger";
import { forslagsFejlTekst, type ChatForslagsKilder } from "@/lib/chatHenvisningsForslag";

const FEJL = "Forslagene til # kunne ikke hentes lige nu. Du kan stadig skrive og sende.";
type Aabning = Parameters<ReturnType<typeof opretForslagsDropdown<string>>["onStart"]>[0];
const props = (items: string[]) => ({ items, command: () => {}, clientRect: () => null }) as unknown as Aabning;
const raekke = (item: string, r: HTMLButtonElement) => { r.textContent = item; };
const dropdown = () => document.body.querySelector<HTMLDivElement>("div.theme-hjemmebane");

afterEach(() => { document.body.replaceChildren(); });

describe("uden fodnote — Community's adfærd, uændret", () => {
  it("ingen rækker → listen er skjult", () => {
    opretForslagsDropdown<string>(raekke).onStart(props([]));
    expect(dropdown()?.style.display).toBe("none");
    expect(dropdown()?.textContent).toBe("");
  });
  it("rækker → vist, uden linje", () => {
    opretForslagsDropdown<string>(raekke).onStart(props(["a", "b"]));
    expect(dropdown()?.style.display).toBe("block");
    expect([...dropdown()!.children].map((c) => c.tagName)).toEqual(["BUTTON", "BUTTON"]);
  });
  it("en fodnote, der svarer null, er det samme som ingen", () => {
    opretForslagsDropdown<string>(raekke, () => null).onStart(props([]));
    expect(dropdown()?.style.display).toBe("none");
  });
});

describe("med fodnote — chattens fejllinje", () => {
  it("ingen rækker: listen vises med linjen alene (en fejl ligner ikke «intet matcher»)", () => {
    opretForslagsDropdown<string>(raekke, () => FEJL).onStart(props([]));
    expect(dropdown()?.style.display).toBe("block");
    expect(dropdown()?.querySelector("p")?.textContent).toBe(FEJL);
  });
  it("rækker + linje: linjen står nederst, og Escape lukker stadig", () => {
    const d = opretForslagsDropdown<string>(raekke, () => FEJL);
    d.onStart(props(["a"]));
    expect([...dropdown()!.children].map((c) => c.tagName)).toEqual(["BUTTON", "P"]);
    d.onKeyDown({ event: new KeyboardEvent("keydown", { key: "Escape" }) } as never);
    expect(dropdown()).toBeNull();
  });
});

describe("chattens #-udvidelse bærer fejlteksten ind i listen", () => {
  it("fejltekst-ref'en → linjen i dropdown'en; null → ingen", () => {
    const kilder = { current: { events: [], items: [], aftaler: [], traade: [] } as ChatForslagsKilder };
    const fejltekst = { current: forslagsFejlTekst({ events: false, items: false, samlinger: false, aftaler: true, feed: false }) };
    const henvisning = chatHenvisningsUdvidelser(kilder, { current: new Map() }, fejltekst).find((u) => u.name === "henvisning")!;
    const vis = () => (henvisning.options.suggestion.render as () => { onStart: (p: Aabning) => void })().onStart(props([]));
    vis();
    expect(dropdown()?.querySelector("p")?.textContent).toBe(FEJL);
    document.body.replaceChildren();
    fejltekst.current = null;
    vis();
    expect(dropdown()?.style.display).toBe("none");
  });
});

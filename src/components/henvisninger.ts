/**
 * src/components/henvisninger.ts — «#» i editorerne: forslagsdropdown'en og
 * #-noderne, DELT af Community's composer og chattens sendefelt (29/9-2026,
 * trin 3 af «#» i chatten: «én mekanisme, ingen kopi»).
 *
 * opretForslagsDropdown, HenvisningNode og EventHenvisningNode er FLYTTET
 * ordret fra CommunityComposer.tsx (hvor de var modul-private) — Community's
 * adfærd er den samme, blot importeret herfra. RabatHenvisningNode er ny.
 *
 * OpslagHenvisningNode, OMRAADE_LABELS og #-opslagskommandoen bliver i
 * CommunityComposer.tsx: kildeværnet linkKort.guard (dom 6 og 7) kræver dem
 * dér, og dets prøver skal stå uændrede. Chatten IMPORTERER node og
 * områdenavne derfra (eksporteret 29/9) i stedet for at kopiere dem.
 *
 * Noderne her er SKEMA (parse/render i editoren). Motoren, der dømmer et gemt
 * dokument, er parseCommunityDokument; adressen bygges ved VISNING
 * (CommunityDokument.tsx / chatDokument.henvisningsAdresse) — aldrig her.
 */
// mergeAttributes kommer fra @tiptap/core via @tiptap/react (samme grund som i
// CommunityComposer.tsx: @tiptap/core er en udeklareret transitiv afhængighed).
import { mergeAttributes } from "@tiptap/react";
import Mention from "@tiptap/extension-mention";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { cn } from "@/lib/utils";

/** Fælles dropdown-maskineri for editor-forslag (@-nævnelser og
    #-henvisninger) — ren DOM (ingen ReactRenderer/tippy): rækkerne
    bygges med createElement + textContent, så brugerdata aldrig
    fortolkes som markup. Kun rækkens INDHOLD varierer (tegnRaekke);
    ramme, positionering, lyttere og tastatur deles. Hb-stil:
    HbCard-lignende ramme, valgt række i bg-hb-sage. Piletaster op/ned,
    Enter vælger, Escape lukker.

    `fodnote` (29/9-2026, valgfri): en rolig linje nederst i listen — chatten
    bruger den til «forslagene kunne ikke hentes» (chatHenvisningsForslag:
    forslagsFejlTekst). Står der en fodnote, vises listen også uden rækker,
    så en fejl ikke ligner «intet matcher». Uden fodnote (Community) er
    adfærden den samme som før. */
export function opretForslagsDropdown<T>(
  tegnRaekke: (item: T, raekke: HTMLButtonElement) => void,
  fodnote?: () => string | null,
) {
  let element: HTMLDivElement | null = null;
  let items: T[] = [];
  let valgt = 0;
  let vaelg: ((item: T) => void) | null = null;
  let sidsteRect: (() => DOMRect | null) | null | undefined = null;
  let scrollLytter: (() => void) | null = null;
  let klikLytter: ((e: MouseEvent) => void) | null = null;
  let resizeLytter: (() => void) | null = null;

  /* Idempotent: luk() kaldes af onExit, af klik udenfor OG af Escape —
     gentagne kald må ikke fejle. ALLE tre lyttere fjernes og nulstilles
     her, så en composer der monteres og unmountes gentagne gange ikke
     efterlader lyttere på window/document. */
  const luk = () => {
    if (scrollLytter) {
      window.removeEventListener("scroll", scrollLytter, { capture: true });
      scrollLytter = null;
    }
    if (klikLytter) {
      document.removeEventListener("mousedown", klikLytter);
      klikLytter = null;
    }
    if (resizeLytter) {
      window.removeEventListener("resize", resizeLytter);
      resizeLytter = null;
    }
    element?.remove();
    element = null;
  };

  const tegn = () => {
    if (!element) return;
    element.replaceChildren();
    const note = fodnote?.() ?? null;
    if (items.length === 0 && note === null) {
      element.style.display = "none";
      return;
    }
    element.style.display = "block";
    items.forEach((item, i) => {
      const raekke = document.createElement("button");
      raekke.type = "button";
      raekke.className = cn(
        "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
        i === valgt ? "bg-hb-sage" : "hover:bg-hb-sage/40",
      );
      tegnRaekke(item, raekke);
      raekke.addEventListener("mousedown", (e) => {
        e.preventDefault();
        vaelg?.(item);
      });
      element!.appendChild(raekke);
    });
    if (note !== null) {
      const linje = document.createElement("p");
      linje.className = "px-3 py-2 text-xs text-hb-ink-soft";
      linje.textContent = note;
      element.appendChild(linje);
    }
    const rect = sidsteRect?.();
    if (rect) {
      element.style.left = `${rect.left}px`;
      element.style.top = `${rect.bottom + 4}px`;
    }
  };

  return {
    onStart: (props: SuggestionProps<T, any>) => {
      items = props.items;
      valgt = 0;
      vaelg = props.command;
      sidsteRect = props.clientRect;
      element = document.createElement("div");
      /* "theme-hjemmebane" FØRST: elementet hænges på document.body,
         altså UDEN FOR .theme-hjemmebane. Hb-tokens er scoped til netop
         den klasse (src/styles/hjemmebane.css:8 — filens egen header:
         "variablerne findes kun under .theme-hjemmebane"), så
         --hb-surface, --hb-line, --hb-radius og skyggen er alle
         UDEFINEREDE på body. hsl(var(--hb-surface)) bliver ugyldig, og
         elementet males ikke — hverken baggrund, kant eller radius.
         Hverken bg-hb-paper eller bg-hb-surface kunne have virket uden
         denne klasse; med den er tokens defineret i dropdown'ens eget
         undertræ.

         hb-surface (ikke hb-paper): flade-farven, samme valg som HbCard
         — en flade må aldrig males i sidens egen farve. */
      element.className =
        "theme-hjemmebane fixed z-50 w-64 overflow-hidden rounded-hb border border-hb-line bg-hb-surface py-1 shadow-hb-hover";
      document.body.appendChild(element);

      // Positionen følger med scroll — capture er nødvendigt, fordi
      // scroll ikke bobler fra indre containere (kun capture-fasen ser
      // scroll i fx en overflow-container).
      scrollLytter = () => tegn();
      window.addEventListener("scroll", scrollLytter, { capture: true, passive: true });

      // Klik udenfor lukker. Rækkernes egen mousedown rammer INDE i
      // elementet, så element.contains(e.target) springer luk() over —
      // valget når altid igennem før en eventuel lukning.
      klikLytter = (e: MouseEvent) => {
        if (element && e.target instanceof Node && !element.contains(e.target)) {
          luk();
        }
      };
      document.addEventListener("mousedown", klikLytter);

      resizeLytter = () => tegn();
      window.addEventListener("resize", resizeLytter);

      tegn();
    },
    onUpdate: (props: SuggestionProps<T, any>) => {
      items = props.items;
      vaelg = props.command;
      sidsteRect = props.clientRect;
      if (valgt >= items.length) valgt = 0;
      tegn();
    },
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (event.key === "Escape") {
        luk();
        return true;
      }
      if (!element || items.length === 0) return false;
      if (event.key === "ArrowDown") {
        valgt = (valgt + 1) % items.length;
        tegn();
        return true;
      }
      if (event.key === "ArrowUp") {
        valgt = (valgt + items.length - 1) % items.length;
        tegn();
        return true;
      }
      if (event.key === "Enter") {
        vaelg?.(items[valgt]);
        return true;
      }
      return false;
    },
    onExit: luk,
  };
}

/** #-henvisninger — Mention-extensionen omdøbt til motorens nodetype
    "henvisning" med area/slug/titel som eneste attributter. renderHTML
    og parseHTML spejler hinanden: span med data-area, data-slug og
    data-titel; parseren matcher span[data-area][data-slug][data-titel]
    — INGEN overlap med naevnelse-nodens span[data-user-id][data-navn]
    (attributsættene er disjunkte, ingen af selektorerne kan matche den
    andens markup). */
export const HenvisningNode = Mention.extend({
  name: "henvisning",
  addAttributes() {
    return {
      area: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-area"),
        renderHTML: (attributes: { area?: string | null }) =>
          attributes.area ? { "data-area": attributes.area } : {},
      },
      slug: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-slug"),
        renderHTML: (attributes: { slug?: string | null }) =>
          attributes.slug ? { "data-slug": attributes.slug } : {},
      },
      titel: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-titel") ?? "",
        renderHTML: (attributes: { titel?: string }) =>
          attributes.titel ? { "data-titel": attributes.titel } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-area][data-slug][data-titel]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "font-medium text-hb-rust" }),
      `#${node.attrs.titel ?? ""}`,
    ];
  },
  renderText({ node }) {
    return `#${node.attrs.titel ?? ""}`;
  },
});

/** #-eventhenvisninger — samme snit som HenvisningNode, men mod events.
    Events og akademi-indhold DELER tegnet '#': et medlem skal ikke lære
    to tegn for "henvis til noget på platformen" — listen skelner dem
    visuelt i stedet ("Event · dato"-undertekst).

    renderHTML/parseHTML spejler hinanden: span med data-event-id og
    data-titel; parseren matcher span[data-event-id][data-titel] —
    ingen overlap med HenvisningNode (kræver data-area+data-slug, som
    en event-span mangler) eller NaevnelseNode (kræver data-user-id,
    som en event-span mangler); omvendt mangler deres markup
    data-event-id. Hver af de tre selektorer kræver mindst én attribut,
    de to andre aldrig skriver. */
export const EventHenvisningNode = Mention.extend({
  name: "eventhenvisning",
  addAttributes() {
    return {
      eventId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-event-id"),
        renderHTML: (attributes: { eventId?: string | null }) =>
          attributes.eventId ? { "data-event-id": attributes.eventId } : {},
      },
      titel: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-titel") ?? "",
        renderHTML: (attributes: { titel?: string }) =>
          attributes.titel ? { "data-titel": attributes.titel } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-event-id][data-titel]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "font-medium text-hb-rust" }),
      `#${node.attrs.titel ?? ""}`,
    ];
  },
  renderText({ node }) {
    return `#${node.attrs.titel ?? ""}`;
  },
  /* INGEN egen suggestion-plugin: uden dette ville Mention-defaulten
     montere et ekstra '@'-suggestion-plugin for denne node ved siden af
     nævnelses-pickeren. Event-forslagene bor i HenvisningNodes
     #-suggestion, som indsætter begge nodetyper — denne node er kun
     skema (parse/render). */
  addProseMirrorPlugins() {
    return [];
  },
});

/** #-rabathenvisninger (29/9-2026, trin 3) — samme snit som
    EventHenvisningNode, men mod partners (rabataftaler). Motorens node
    hedder "rabathenvisning" med aftaleId og titel; adressen er
    rabataftaleAdresse(aftaleId) og bygges ved visning, ikke her.

    renderHTML/parseHTML spejler hinanden: span med data-aftale-id og
    data-titel; parseren matcher span[data-aftale-id][data-titel] — ingen
    overlap med de andre (hver kræver mindst én attribut, de andre aldrig
    skriver: data-user-id, data-area+data-slug, data-event-id,
    data-traad-id). */
export const RabatHenvisningNode = Mention.extend({
  name: "rabathenvisning",
  addAttributes() {
    return {
      aftaleId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-aftale-id"),
        renderHTML: (attributes: { aftaleId?: string | null }) =>
          attributes.aftaleId ? { "data-aftale-id": attributes.aftaleId } : {},
      },
      titel: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-titel") ?? "",
        renderHTML: (attributes: { titel?: string }) =>
          attributes.titel ? { "data-titel": attributes.titel } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-aftale-id][data-titel]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "font-medium text-hb-rust" }),
      `#${node.attrs.titel ?? ""}`,
    ];
  },
  renderText({ node }) {
    return `#${node.attrs.titel ?? ""}`;
  },
  // Kun skema — forslagene bor i HenvisningNodes #-suggestion (som
  // EventHenvisningNode; se begrundelsen dér).
  addProseMirrorPlugins() {
    return [];
  },
});

import { useCallback, useEffect, useRef, useState } from "react";
// mergeAttributes kommer fra @tiptap/core, men importeres via @tiptap/react,
// som re-eksporterer hele core (dist/index.d.ts: export * from '@tiptap/core')
// — @tiptap/core er en udeklareret transitiv afhængighed, og den deklarerede
// vej er den robuste.
import {
  EditorContent,
  mergeAttributes,
  Node as TiptapNode,
  useEditor,
  type Content,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { useQuery } from "@tanstack/react-query";
import {
  Bold,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Paperclip,
  Quote,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uploadCommunityBillede, uploadCommunityFil } from "@/lib/hjemmebane/communityUpload";
import { hentCommunityMedlemmer, type CommunityMedlem } from "@/lib/hjemmebane/communityApi";
import {
  listAllUpcomingEvents,
  listPublishedCollections,
  listPublishedItems,
} from "@/lib/hjemmebane/akademiApi";
import type { ContentItem, EventRow } from "@/lib/hjemmebane/adminContentApi";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbButton } from "@/components/hjemmebane/HbButton";

/** Billed-noden bærer `path` og `alt` som ENESTE attributter — ingen
    `src`: motoren (parseCommunityDokument) accepterer kun `path`, og en
    `src` ville blive kasseret ved visning.

    PREVIEW i editoren: filen vises lokalt via URL.createObjectURL — et
    preview uden et eneste netværkskald, af præcis den fil medlemmet lige
    har valgt. Der signeres bevidst IKKE i editoren, og grunden er ikke
    kald-økonomi (useQuery cacher på stien — det ville være ét kald pr.
    billede): grunden er, at adgangsdommen (maa_se_community_billede)
    siger nej, indtil opslaget er gemt — stien findes endnu ikke i noget
    dokument.

    Opslaget sker i et modul-niveau Map, fordi Tiptaps renderHTML kører
    uden adgang til React-state. renderHTML rækker (ingen NodeView):
    upload-flowet gemmer object-URL'en FØR noden indsættes, så første
    rendering ser den allerede, og posten ændrer sig aldrig for en given
    sti. Composeren rydder sine egne poster op ved unmount. */
const PREVIEW_URLS = new Map<string, string>();

const CommunityBilledeNode = Image.extend({
  addAttributes() {
    return {
      path: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-path"),
        renderHTML: (attributes: { path?: string | null }) =>
          attributes.path ? { "data-path": attributes.path } : {},
      },
      alt: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("alt") ?? "",
      },
    };
  },
  /* renderHTML og parseHTML skal spejle hinanden, ellers overlever noden
     ikke en serialiserings-runde: uden data-path i den renderede markup
     går stien tabt, og uden parseren kan noden ikke læses tilbage — det
     bider første gang et eksisterende opslag skal redigeres. Begge
     render-former (img og div) bærer data-path, og parseHTML matcher
     begge. */
  parseHTML() {
    /* :not([data-navn]) er nødvendigt: CSS-selektoren div[data-path]
       matcher OGSÅ en div der desuden bærer data-navn — fil-nodens
       markup. Uden udelukkelsen ville de to parseHTML-regler overlappe,
       og en fil kunne parses tilbage som et billede. */
    return [{ tag: "img[data-path]" }, { tag: "div[data-path]:not([data-navn])" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const previewUrl =
      typeof node.attrs.path === "string" ? PREVIEW_URLS.get(node.attrs.path) : undefined;

    if (previewUrl) {
      // Samme klasser som visningen (CommunityBillede), så det medlemmet
      // ser mens der skrives, er det der publiceres.
      return [
        "img",
        mergeAttributes(HTMLAttributes, {
          src: previewUrl,
          class: "h-auto max-w-full rounded-hb border border-hb-line",
        }),
      ];
    }

    /* Ingen preview-URL: fx et eksisterende opslag åbnet til redigering,
       hvor filen aldrig har været i denne fane — dér findes filen ikke
       lokalt, og signering i editoren er ikke vejen (adgangsdommen og
       flowet ovenfor). Det rette billede vises igen, så snart opslaget
       er gemt. */
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class:
          "select-none rounded-hb border border-hb-line bg-hb-sage/30 px-4 py-6 text-center text-sm text-hb-ink-soft",
      }),
      "Billede",
    ];
  },
});

/** Community-composeren — producerer NØJAGTIGT det dokumentformat,
    parseCommunityDokument accepterer. Editoren er konfigureret så den ikke
    kan lave noget, motoren efterfølgende kaster væk — ellers ville
    medlemmet se sit eget indhold forsvinde ved visning.

    onSubmit kaldes med editor.getJSON() — RÅ JSON, ikke HTML og ikke
    tekst: databasen udleder selv tekstuddraget (community_json_til_tekst),
    og klienten bestemmer aldrig hvad der står i indhold-kolonnen. */

export interface CommunityComposerProps {
  onSubmit: (indholdJson: unknown) => void | Promise<void>;
  /** Bruges som mappe-præfiks ved billed-upload (bucketens INSERT-policy
      kræver eget uuid-præfiks). Kalderen leverer den. */
  brugerId: string;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  submitLabel?: string;
  visTitel?: boolean; // trådcomposer: true, svarcomposer: false
  titel?: string;
  onTitelChange?: (v: string) => void;
  /** Redigeringstilstand: et Tiptap-dokument, editoren starter med. */
  startIndhold?: unknown;
  /** Vises som sekundær knap ved siden af send-knappen, når den er sat. */
  onAnnuller?: () => void;
}

/** Vedhæftet fil — egen atom-blok-node bygget med Node.create, IKKE en
    Image-udvidelse: en fil er ikke et billede, og navnet (ikke alt) er
    dens bærende attribut. Nodetypen hedder "fil" (dansk, vores egen —
    motoren matcher på det navn).

    renderHTML og parseHTML spejler hinanden: div med data-path OG
    data-navn, parseren matcher div[data-path][data-navn]. Billed-noden
    matcher div[data-path]:not([data-navn]), så de to kan ikke forveksles
    — en serialiserings-runde lander altid på den rigtige nodetype.

    Editoren renderer noden som samme dokumentrække som visningen
    (CommunityFil), men UDEN downloadknap — filen er ikke gemt endnu, og
    adgangsdommen ville sige nej til signering. */
const CommunityFilNode = TiptapNode.create({
  name: "fil",
  group: "block",
  atom: true,
  draggable: false,
  addAttributes() {
    return {
      path: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-path"),
        renderHTML: (attributes: { path?: string | null }) =>
          attributes.path ? { "data-path": attributes.path } : {},
      },
      navn: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-navn") ?? "",
        renderHTML: (attributes: { navn?: string }) =>
          attributes.navn ? { "data-navn": attributes.navn } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-path][data-navn]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class:
          "select-none rounded-hb border border-hb-line px-4 py-3 font-body text-sm text-hb-ink",
      }),
      String(node.attrs.navn ?? ""),
    ];
  },
});

/** @-nævnelser — Mention-extensionen omdøbt til motorens nodetype
    "naevnelse" med userId/navn som eneste attributter. renderHTML og
    parseHTML spejler hinanden: span med data-user-id og data-navn,
    parseren matcher span[data-user-id][data-navn]. Node-niveau
    renderHTML/renderText overstyres direkte (frem for options.renderHTML),
    så markup'en er fuldt under vores kontrol. */
const NaevnelseNode = Mention.extend({
  name: "naevnelse",
  addAttributes() {
    return {
      userId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-user-id"),
        renderHTML: (attributes: { userId?: string | null }) =>
          attributes.userId ? { "data-user-id": attributes.userId } : {},
      },
      navn: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-navn") ?? "",
        renderHTML: (attributes: { navn?: string }) =>
          attributes.navn ? { "data-navn": attributes.navn } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-user-id][data-navn]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "font-medium text-hb-evergreen" }),
      `@${node.attrs.navn ?? ""}`,
    ];
  },
  renderText({ node }) {
    return `@${node.attrs.navn ?? ""}`;
  },
});

/** Fælles dropdown-maskineri for editor-forslag (@-nævnelser og
    #-henvisninger) — ren DOM (ingen ReactRenderer/tippy): rækkerne
    bygges med createElement + textContent, så brugerdata aldrig
    fortolkes som markup. Kun rækkens INDHOLD varierer (tegnRaekke);
    ramme, positionering, lyttere og tastatur deles. Hb-stil:
    HbCard-lignende ramme, valgt række i bg-hb-sage. Piletaster op/ned,
    Enter vælger, Escape lukker. */
function opretForslagsDropdown<T>(tegnRaekke: (item: T, raekke: HTMLButtonElement) => void) {
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
    if (items.length === 0) {
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

/** Rækkerne til @-forslag: avatar (img eller sage-cirkel med
    forbogstav), navn og virksomhed. */
const opretNaevnelsesDropdown = () =>
  opretForslagsDropdown<CommunityMedlem>((medlem, raekke) => {
    if (medlem.avatar_url) {
      const img = document.createElement("img");
      img.src = medlem.avatar_url;
      img.alt = medlem.navn ?? "Medlem";
      img.className = "h-7 w-7 shrink-0 rounded-full border border-hb-line object-cover";
      raekke.appendChild(img);
    } else {
      const cirkel = document.createElement("span");
      cirkel.className =
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-hb-line bg-hb-sage/40 font-editorial text-xs text-hb-ink-soft";
      cirkel.textContent = (medlem.navn ?? "?").charAt(0);
      raekke.appendChild(cirkel);
    }
    const tekst = document.createElement("span");
    tekst.className = "min-w-0 flex-1";
    const navn = document.createElement("span");
    navn.className = "block truncate font-body text-sm text-hb-ink";
    navn.textContent = medlem.navn ?? "Medlem";
    tekst.appendChild(navn);
    if (medlem.virksomhed) {
      const virksomhed = document.createElement("span");
      virksomhed.className = "block truncate text-xs text-hb-ink-soft";
      virksomhed.textContent = medlem.virksomhed;
      tekst.appendChild(virksomhed);
    }
    raekke.appendChild(tekst);
  });

/** Læsbare danske områdenavne til #-pickerens undertekst.

    Labels for samme area-nøgle må IKKE drive fra hinanden — AREAS i
    adminContentApi er den KANONISKE kilde, og denne liste findes kun,
    fordi pickeren skal kunne oversætte uden at importere hele
    AREAS-strukturen. Listen kan ikke afledes af AREAS: den skal spejle
    motorens TILLADTE_OMRAADER (som rummer 'rabataftaler' — et område
    AREAS slet ikke kender). Ændres en label i AREAS, skal den ændres
    her i samme PR. */
const OMRAADE_LABELS: Record<string, string> = {
  classroom: "Fundamentet",
  academy: "Kursus",
  rabataftaler: "Rabataftale",
  quick_wins: "Quick win",
  start_her: "Start her",
};

/** Skal spejle motorens TILLADTE_OMRAADER (communityDokument.ts) —
    ellers kan pickeren tilbyde noget, motoren kasserer ved visning. */
const HENVISNINGS_OMRAADER = new Set(Object.keys(OMRAADE_LABELS));

/** Rækkerne til #-forslag: titel + undertekst. For items: samling,
    område og evt. varighed; for events: "Event · {dato}". Ingen
    cover-billeder — de kræver signering pr. række.

    Samlingen står FØRST i item-underteksten: en lektionstitel som "Dit
    mindset ➤ System før superhelt" siger intet uden sit kursus — fire
    lektioner kan hedde "Introduktion & målsætning", og kun samlingens
    navn placerer dem. Områdelabelen alene ("Kursus") er den mindst
    sigende del. */
const opretHenvisningsDropdown =
  (samlingsTitelFor: (item: ContentItem) => string | null) => () =>
    opretForslagsDropdown<HenvisningsForslag>((forslag, raekke) => {
      const tekst = document.createElement("span");
      tekst.className = "min-w-0 flex-1";
      const titel = document.createElement("span");
      titel.className = "block truncate font-body text-sm text-hb-ink";
      const under = document.createElement("span");
      under.className = "block truncate text-xs text-hb-ink-soft";

      if (forslag.slags === "event") {
        titel.textContent = forslag.event.title;
        // Samme dato-mønster som EventsView. Ingen varighed på events.
        const dato = new Date(forslag.event.starts_at).toLocaleDateString("da-DK", {
          day: "numeric",
          month: "short",
        });
        under.textContent = `Event · ${dato}`;
      } else {
        const item = forslag.item;
        titel.textContent = item.title;
        const dele: string[] = [];
        const samling = samlingsTitelFor(item);
        if (samling) dele.push(samling);
        dele.push(OMRAADE_LABELS[item.area] ?? item.area);
        if (item.duration_seconds) {
          dele.push(`${Math.max(1, Math.round(item.duration_seconds / 60))} min`);
        }
        under.textContent = dele.join(" · ");
      }

      tekst.appendChild(titel);
      tekst.appendChild(under);
      raekke.appendChild(tekst);
    });

/** #-henvisninger — Mention-extensionen omdøbt til motorens nodetype
    "henvisning" med area/slug/titel som eneste attributter. renderHTML
    og parseHTML spejler hinanden: span med data-area, data-slug og
    data-titel; parseren matcher span[data-area][data-slug][data-titel]
    — INGEN overlap med naevnelse-nodens span[data-user-id][data-navn]
    (attributsættene er disjunkte, ingen af selektorerne kan matche den
    andens markup). */
const HenvisningNode = Mention.extend({
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
const EventHenvisningNode = Mention.extend({
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

/** #-pickerens forslag rummer BÅDE akademi-items og events —
    diskrimineret union, så række og command kan forgrene uden casts. */
type HenvisningsForslag =
  | { slags: "item"; item: ContentItem }
  | { slags: "event"; event: EventRow };

/** Kun http/https/mailto får lov at forlade composeren — men motoren
    hærder href'en IGEN ved visning: editoren er bekvemmelighed, ikke
    forsvar. Skemaløse indtastninger får https:// foran (samme greb som
    ChatRichInputs normalizeLinkUrl). */
const normaliserLinkUrl = (raa: string): string => {
  const trimmet = raa.trim();
  if (!trimmet) return "";
  if (/^(https?:\/\/|mailto:)/i.test(trimmet)) return trimmet;
  if (/^[a-z]+:/i.test(trimmet)) return "";
  return `https://${trimmet.replace(/^\/+/, "")}`;
};

function VaerktoejsKnap({
  aktiv,
  disabled,
  onClick,
  title,
  children,
}: {
  aktiv?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={cn(
        "rounded-md p-1.5 transition-colors disabled:opacity-50",
        aktiv
          ? "bg-hb-sage text-hb-ink"
          : "text-hb-ink-soft hover:bg-hb-sage/50 hover:text-hb-ink",
      )}
    >
      {children}
    </button>
  );
}

export function CommunityComposer({
  onSubmit,
  brugerId,
  disabled = false,
  placeholder = "Hvad arbejder du med lige nu?",
  autoFocus = false,
  submitLabel = "Del",
  visTitel = false,
  titel = "",
  onTitelChange,
  startIndhold,
  onAnnuller,
}: CommunityComposerProps) {
  const [sender, setSender] = useState(false);
  const [uploaderBillede, setUploaderBillede] = useState(false);
  const [uploaderFil, setUploaderFil] = useState(false);

  /* Medlemslisten til @-pickeren — samme cache-form som
     MemberDirectoryView. Læses via ref i suggestion.items, fordi
     editorens extensions kun bygges én gang ved mount. */
  const medlemmerQuery = useQuery({
    queryKey: ["community", "medlemmer"],
    queryFn: hentCommunityMedlemmer,
    staleTime: 5 * 60_000,
  });
  const medlemmerRef = useRef<CommunityMedlem[]>([]);
  medlemmerRef.current = medlemmerQuery.data ?? [];

  /* Kataloget til #-pickeren — SAMME queryKey som useAkademiData
     (["akademi", "items"]), så cachen deles med Akademiets flader og
     kataloget ikke hentes dobbelt. Læses via ref af samme grund som
     medlemslisten. */
  const itemsQuery = useQuery({ queryKey: ["akademi", "items"], queryFn: listPublishedItems });
  const itemsRef = useRef<ContentItem[]>([]);
  itemsRef.current = itemsQuery.data ?? [];

  /* Samlingerne til #-pickerens undertekst — SAMME queryKey som
     useAkademiData (["akademi", "collections"]), så cachen deles.
     Opslaget collection_id → titel læses via ref som itemsRef. */
  const samlingerQuery = useQuery({
    queryKey: ["akademi", "collections"],
    queryFn: listPublishedCollections,
  });
  const samlingsTitelRef = useRef<Map<string, string>>(new Map());
  samlingsTitelRef.current = new Map(
    (samlingerQuery.data ?? []).map((samling) => [samling.id, samling.title]),
  );

  /* Events til #-pickeren — listAllUpcomingEvents er MEDLEMSFLADENS egen
     dom (published + fremtid via isEventPast), og queryKey'en deles med
     EventsView (["events", "upcoming-all"]), så cachen er fælles.
     Admin-funktionen listEvents bruges bevidst IKKE: den er ufiltreret
     (drafts + afholdte), og under den delte nøgle ville den forgifte
     EventsViews cache. Læses via ref som de øvrige kilder. */
  const eventsQuery = useQuery({
    queryKey: ["events", "upcoming-all"],
    queryFn: listAllUpcomingEvents,
    staleTime: 5 * 60_000,
  });
  const eventsRef = useRef<EventRow[]>([]);
  eventsRef.current = eventsQuery.data ?? [];
  const sendRef = useRef<() => void>(() => {});
  const billedInputRef = useRef<HTMLInputElement>(null);
  const filInputRef = useRef<HTMLInputElement>(null);
  /** Denne composers egne previews (sti → object-URL) — delmængden af
      PREVIEW_URLS, som netop denne instans har skabt og skal rydde op. */
  const egnePreviews = useRef(new Map<string, string>());

  /* Oprydning ved unmount: uden revokeObjectURL holder browseren fast i
     hvert uploadet billede i hukommelsen, indtil fanen lukkes — en
     composer der har set ti billeder, ville lække ti blobs. Posterne
     fjernes også fra modul-Map'et, så det ikke vokser på tværs af
     composer-liv. */
  useEffect(() => {
    const previews = egnePreviews.current;
    return () => {
      for (const [sti, url] of previews) {
        URL.revokeObjectURL(url);
        PREVIEW_URLS.delete(sti);
      }
      previews.clear();
    };
  }, []);

  const editor = useEditor({
    extensions: [
      /* StarterKit beskåret til motorens hvidliste: paragraph, heading
         (kun level 2), bulletList, orderedList, listItem, blockquote,
         hardBreak, text — plus marks bold/italic. codeBlock, strike, code
         og horizontalRule er slået FRA; dropcursor/gapcursor/history er
         redigeringsadfærd og efterlader intet i dokumentet. Billeder
         kommer i et senere led. */
      StarterKit.configure({
        heading: { levels: [2] },
        codeBlock: false,
        code: false,
        strike: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ["http", "https", "mailto"],
      }),
      CommunityBilledeNode,
      CommunityFilNode,
      EventHenvisningNode,
      NaevnelseNode.configure({
        suggestion: {
          char: "@",
          items: ({ query }) => {
            const q = query.toLowerCase();
            return medlemmerRef.current
              /* Kalderen selv filtreres FRA her i klienten: RPC'en
                 inkluderer bevidst én selv (den svarer på "hvem kan
                 nævnes", ikke "hvem er ikke mig"), og frafiltreringen
                 hører i den flade, der ved hvem der skriver. */
              .filter((m) => m.user_id !== brugerId)
              .filter((m) => (m.navn ?? "").toLowerCase().includes(q))
              .slice(0, 8);
          },
          command: ({ editor: ed, range, props }) => {
            const medlem = props as unknown as CommunityMedlem;
            /* Nævnelsen indsættes EFTERFULGT af et mellemrum som
               text-node — tomhedsproblemet: community_json_til_tekst
               læser aldrig attrs, så uden en text-node ved siden af
               ville skrive-RPC'en afvise et opslag, der kun består af
               nævnelsen, som tomt. Mellemrummet sikrer også, at
               markøren lander klar til at skrive videre. */
            ed
              .chain()
              .focus()
              .insertContentAt(range, [
                {
                  type: "naevnelse",
                  attrs: { userId: medlem.user_id, navn: medlem.navn ?? "Medlem" },
                },
                { type: "text", text: " " },
              ])
              .run();
          },
          render: opretNaevnelsesDropdown,
        },
      }),
      HenvisningNode.configure({
        suggestion: {
          char: "#",
          items: ({ query }): HenvisningsForslag[] => {
            const q = query.toLowerCase();
            /* Events: kun published med starts_at i FREMTIDEN — et link
               til et afholdt event hjælper ingen. Dommen bor allerede i
               listAllUpcomingEvents (published + isEventPast), så listen
               her er filtreret ved kilden. Events vises ØVERST når de
               matcher, derefter items — maks 8 i alt. */
            const events: HenvisningsForslag[] = eventsRef.current
              .filter((event) => event.title.toLowerCase().includes(q))
              .map((event) => ({ slags: "event" as const, event }));
            const items: HenvisningsForslag[] = itemsRef.current
              /* Kun områder med element-rute — skal spejle motorens
                 TILLADTE_OMRAADER, ellers kan pickeren tilbyde noget,
                 motoren kasserer ved visning. */
              .filter((item) => HENVISNINGS_OMRAADER.has(item.area))
              .filter((item) => item.title.toLowerCase().includes(q))
              .map((item) => ({ slags: "item" as const, item }));
            return [...events, ...items].slice(0, 8);
          },
          command: ({ editor: ed, range, props }) => {
            const forslag = props as unknown as HenvisningsForslag;
            // Begge slags efterfølges af et mellemrum som text-node —
            // samme mønster som nævnelser (markøren lander klar til at
            // skrive videre).
            const node =
              forslag.slags === "event"
                ? {
                    type: "eventhenvisning",
                    attrs: { eventId: forslag.event.id, titel: forslag.event.title },
                  }
                : {
                    type: "henvisning",
                    attrs: {
                      area: forslag.item.area,
                      slug: forslag.item.slug,
                      titel: forslag.item.title,
                    },
                  };
            ed
              .chain()
              .focus()
              .insertContentAt(range, [node, { type: "text", text: " " }])
              .run();
          },
          render: opretHenvisningsDropdown((item) =>
            item.collection_id
              ? (samlingsTitelRef.current.get(item.collection_id) ?? null)
              : null,
          ),
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    autofocus: autoFocus ? "end" : false,
    content: (startIndhold ?? "") as Content,
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          "tiptap min-h-[120px] px-5 py-4 font-body text-[15px] leading-relaxed text-hb-ink focus:outline-none",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          sendRef.current();
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (editor) editor.setEditable(!disabled && !sender);
  }, [editor, disabled, sender]);

  const saetLink = useCallback(() => {
    if (!editor) return;
    const eksisterende = editor.getAttributes("link").href as string | undefined;
    const input = window.prompt("Link URL", eksisterende || "https://");
    if (input === null) return;
    if (input.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const href = normaliserLinkUrl(input);
    if (!href) return;
    const { from, to } = editor.state.selection;
    if (from !== to) {
      editor.chain().focus().setLink({ href }).run();
    } else if (eksisterende) {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    } else {
      editor
        .chain()
        .focus()
        .insertContent({ type: "text", text: input.trim(), marks: [{ type: "link", attrs: { href } }] })
        .run();
    }
  }, [editor]);

  const vaelgBillede = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fil = e.target.files?.[0];
      // Nulstil straks, så den samme fil kan vælges igen.
      e.target.value = "";
      if (!fil || !editor) return;
      setUploaderBillede(true);
      try {
        const sti = await uploadCommunityBillede(fil, brugerId);
        // Object-URL'en registreres FØR noden indsættes, så renderHTML
        // ser den allerede ved første rendering.
        const previewUrl = URL.createObjectURL(fil);
        PREVIEW_URLS.set(sti, previewUrl);
        egnePreviews.current.set(sti, previewUrl);
        editor
          .chain()
          .focus()
          .insertContent({ type: "image", attrs: { path: sti, alt: "" } })
          .run();
      } catch (fejl) {
        toast.error(fejl instanceof Error ? fejl.message : "Billedet kunne ikke uploades");
      } finally {
        setUploaderBillede(false);
      }
    },
    [editor, brugerId],
  );

  const vaelgFil = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fil = e.target.files?.[0];
      // Nulstil straks, så den samme fil kan vælges igen.
      e.target.value = "";
      if (!fil || !editor) return;
      setUploaderFil(true);
      try {
        const { sti, navn } = await uploadCommunityFil(fil, brugerId);
        editor
          .chain()
          .focus()
          .insertContent({ type: "fil", attrs: { path: sti, navn } })
          .run();
      } catch (fejl) {
        toast.error(fejl instanceof Error ? fejl.message : "Filen kunne ikke uploades");
      } finally {
        setUploaderFil(false);
      }
    },
    [editor, brugerId],
  );

  const harIndhold = (editor?.getText().trim().length ?? 0) > 0;
  const titelOk = !visTitel || titel.trim().length > 0;
  const kanSende = harIndhold && titelOk && !disabled && !sender;

  const send = useCallback(async () => {
    if (!editor) return;
    if (!editor.getText().trim() || (visTitel && !titel.trim())) return;
    if (disabled || sender) return;
    setSender(true);
    try {
      await onSubmit(editor.getJSON());
      /* Feltet ryddes FØRST når onSubmit er resolvet uden fejl — modsat
         ChatRichInput, som rydder optimistisk. Fejler kaldet, må
         medlemmets tekst ikke være væk; den står urørt og kan sendes
         igen. Fejlvisning (toast mv.) ejes af kalderen.

         I REDIGERINGSTILSTAND (startIndhold sat) ryddes der slet ikke:
         formularen lukkes af kalderen, og en rydning ville blinke et
         tomt felt op, lige før den forsvinder. */
      if (startIndhold === undefined) {
        editor.commands.clearContent(true);
        onTitelChange?.("");
      }
    } catch {
      /* Bevidst tomt: indholdet bliver stående ved fejl. */
    } finally {
      setSender(false);
    }
  }, [editor, onSubmit, onTitelChange, visTitel, titel, disabled, sender]);

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  return (
    <HbCard>
      {visTitel && (
        /* Titlen skal ligne en overskrift man skriver, ikke et input —
           font-editorial, stor, ingen synlig ramme. Enter hopper videre
           til brødteksten. */
        <input
          type="text"
          value={titel}
          onChange={(e) => onTitelChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              editor?.commands.focus("end");
            }
          }}
          placeholder="Giv dit opslag en titel"
          disabled={disabled || sender}
          className="w-full border-0 bg-transparent px-5 pt-5 font-editorial text-2xl font-medium leading-tight text-hb-ink placeholder:text-hb-ink-soft/50 focus:outline-none"
        />
      )}

      {/* Editorens indhold spejler visningens typografi (CommunityDokument),
          så det medlemmet ser mens der skrives, er det der publiceres. */}
      <div
        className={cn(
          "[&_.tiptap>*+*]:mt-3",
          "[&_h2]:font-editorial [&_h2]:text-xl [&_h2]:font-medium [&_h2]:leading-tight",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:pl-1",
          "[&_blockquote]:border-l-2 [&_blockquote]:border-hb-line [&_blockquote]:pl-4 [&_blockquote]:text-hb-ink-soft",
          "[&_a]:text-hb-evergreen [&_a]:underline [&_a]:underline-offset-2",
        )}
      >
        <EditorContent editor={editor} />
      </div>

      {/* Diskret værktøjslinje NEDERST — formatering til venstre,
          afsendelse til højre. */}
      <div className="flex items-center gap-0.5 border-t border-hb-line px-3 py-2">
        <VaerktoejsKnap
          aktiv={editor?.isActive("bold")}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          title="Fed (Cmd+B)"
        >
          <Bold className="h-4 w-4" />
        </VaerktoejsKnap>
        <VaerktoejsKnap
          aktiv={editor?.isActive("italic")}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          title="Kursiv (Cmd+I)"
        >
          <Italic className="h-4 w-4" />
        </VaerktoejsKnap>
        <VaerktoejsKnap aktiv={editor?.isActive("link")} onClick={saetLink} title="Link">
          <LinkIcon className="h-4 w-4" />
        </VaerktoejsKnap>
        <div className="mx-1 h-4 w-px bg-hb-line" />
        <VaerktoejsKnap
          aktiv={editor?.isActive("bulletList")}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          title="Punktopstilling"
        >
          <List className="h-4 w-4" />
        </VaerktoejsKnap>
        <VaerktoejsKnap
          aktiv={editor?.isActive("orderedList")}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          title="Nummereret liste"
        >
          <ListOrdered className="h-4 w-4" />
        </VaerktoejsKnap>
        <VaerktoejsKnap
          aktiv={editor?.isActive("blockquote")}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          title="Citat"
        >
          <Quote className="h-4 w-4" />
        </VaerktoejsKnap>
        <VaerktoejsKnap
          aktiv={editor?.isActive("heading", { level: 2 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Overskrift"
        >
          <Heading2 className="h-4 w-4" />
        </VaerktoejsKnap>
        <VaerktoejsKnap
          disabled={uploaderBillede || disabled || sender}
          onClick={() => billedInputRef.current?.click()}
          title="Indsæt billede"
        >
          {uploaderBillede ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImageIcon className="h-4 w-4" />
          )}
        </VaerktoejsKnap>
        <input
          ref={billedInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={vaelgBillede}
        />
        <VaerktoejsKnap
          disabled={uploaderFil || disabled || sender}
          onClick={() => filInputRef.current?.click()}
          title="Vedhæft fil"
        >
          {uploaderFil ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Paperclip className="h-4 w-4" />
          )}
        </VaerktoejsKnap>
        <input
          ref={filInputRef}
          type="file"
          accept=".pdf,.xlsx,.xls,.docx,.doc,.xml"
          className="hidden"
          onChange={vaelgFil}
        />

        <div className="ml-auto flex items-center gap-2">
          {onAnnuller && (
            <HbButton type="button" variant="secondary" disabled={sender} onClick={onAnnuller}>
              Annuller
            </HbButton>
          )}
          <HbButton
            type="button"
            variant="primary"
            disabled={!kanSende}
            onClick={() => void send()}
            title="Send (Cmd+Enter)"
          >
            {sender && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitLabel}
          </HbButton>
        </div>
      </div>
    </HbCard>
  );
}

/**
 * src/components/chatHenvisninger.ts — «#» i chattens editorer (29/9-2026,
 * trin 3). Sendefeltet (ChatRichInput) og redigeringsdialogen
 * (MessageEditDialog) bruger begge useChatHenvisninger().
 *
 * Mekanismen er den DELTE (components/henvisninger.ts — samme dropdown og
 * samme noder som Community's composer). Her står kun chattens egne dele:
 * kilderne (react-query, SAMME nøgler som fladerne, så cachen deles) og
 * rækkens indhold. Hvad der tilbydes, afgøres af den rene
 * lib/chatHenvisningsForslag.ts.
 */
import { useRef, useState } from "react";
import type { Extensions } from "@tiptap/react";
import { useQuery } from "@tanstack/react-query";
import { hentFeed } from "@/lib/hjemmebane/communityApi";
import {
  listAllUpcomingEvents,
  listMedlemsPartnere,
  listPublishedCollections,
  listPublishedItems,
} from "@/lib/hjemmebane/akademiApi";
import {
  chatForslagsTekst,
  chatForslagTilNode,
  forslagsFejlTekst,
  vaelgChatForslag,
  type ChatForslag,
  type ChatForslagsKilder,
} from "@/lib/chatHenvisningsForslag";
import { OMRAADE_LABELS, OpslagHenvisningNode } from "@/components/hjemmebane/community/CommunityComposer";
import {
  EventHenvisningNode,
  HenvisningNode,
  opretForslagsDropdown,
  RabatHenvisningNode,
} from "@/components/henvisninger";

type Ref<T> = { readonly current: T };

/** Rækken: titel + undertekst, bygget med createElement + textContent (som Community's). */
const opretChatDropdown = (samlingsTitel: Ref<Map<string, string>>, fejltekst: Ref<string | null>) => () =>
  opretForslagsDropdown<ChatForslag>((forslag, raekke) => {
    const samling =
      forslag.slags === "item" && forslag.item.collection_id
        ? (samlingsTitel.current.get(forslag.item.collection_id) ?? null)
        : null;
    const omraade = forslag.slags === "item" ? (OMRAADE_LABELS[forslag.item.area] ?? forslag.item.area) : null;
    const { titel, undertekst } = chatForslagsTekst(forslag, samling, omraade);
    const tekst = document.createElement("span");
    tekst.className = "min-w-0 flex-1";
    const t = document.createElement("span");
    t.className = "block truncate font-body text-sm text-hb-ink";
    t.textContent = titel;
    const u = document.createElement("span");
    u.className = "block truncate text-xs text-hb-ink-soft";
    u.textContent = undertekst;
    tekst.appendChild(t);
    tekst.appendChild(u);
    raekke.appendChild(tekst);
  }, () => fejltekst.current);

/** Udvidelserne: #-forslaget på HenvisningNode (som i Community) + de tre andre noder som skema.
    `fejltekst` er listens fodnote, når en kilde fejlede (forslagsFejlTekst). */
export function chatHenvisningsUdvidelser(
  kilder: Ref<ChatForslagsKilder>,
  samlingsTitel: Ref<Map<string, string>>,
  fejltekst: Ref<string | null>,
): Extensions {
  return [
    EventHenvisningNode,
    RabatHenvisningNode,
    OpslagHenvisningNode,
    HenvisningNode.configure({
      suggestion: {
        char: "#",
        items: ({ query }) => vaelgChatForslag(kilder.current, query),
        command: ({ editor: ed, range, props }) => {
          // Efterfulgt af et mellemrum som text-node — Community's mønster
          // (markøren lander klar til at skrive videre).
          const node = chatForslagTilNode(props as unknown as ChatForslag);
          ed.chain().focus().insertContentAt(range, [node, { type: "text", text: " " }]).run();
        },
        render: opretChatDropdown(samlingsTitel, fejltekst),
      },
    }),
  ];
}

/**
 * Kilderne og udvidelserne til én editor. Udvidelserne bygges ÉN gang (Tiptap
 * bygger sit skema ved mount); kilderne læses gennem refs, som i Community.
 * En kilde, der fejler, giver en rolig linje nederst i listen (forslagsFejlTekst,
 * som Community's «forslag kunne ikke hentes») — der skrives stadig.
 */
export function useChatHenvisninger(): Extensions {
  const eventsQuery = useQuery({
    queryKey: ["events", "upcoming-all"],
    queryFn: listAllUpcomingEvents,
    staleTime: 5 * 60_000,
  });
  const itemsQuery = useQuery({ queryKey: ["akademi", "items"], queryFn: listPublishedItems });
  const samlingerQuery = useQuery({ queryKey: ["akademi", "collections"], queryFn: listPublishedCollections });
  const aftalerQuery = useQuery({
    queryKey: ["rabataftaler", "liste"],
    queryFn: listMedlemsPartnere,
    staleTime: 5 * 60_000,
  });

  // Opslag: SAMME queryKey og queryFn som Community's #-liste og CommunityViews feed.
  const feedQuery = useQuery({
    queryKey: ["community", "feed"],
    queryFn: () => hentFeed(30),
    staleTime: 60_000,
  });

  const kilder = useRef<ChatForslagsKilder>({ events: [], items: [], aftaler: [], traade: [] });
  kilder.current = {
    events: eventsQuery.data ?? [],
    items: itemsQuery.data ?? [],
    aftaler: aftalerQuery.data ?? [],
    traade: feedQuery.data ?? [],
  };
  const samlingsTitel = useRef<Map<string, string>>(new Map());
  samlingsTitel.current = new Map((samlingerQuery.data ?? []).map((s) => [s.id, s.title]));

  const fejltekst = useRef<string | null>(null);
  fejltekst.current = forslagsFejlTekst({
    events: eventsQuery.isError,
    items: itemsQuery.isError,
    samlinger: samlingerQuery.isError,
    aftaler: aftalerQuery.isError,
    feed: feedQuery.isError,
  });

  const [udvidelser] = useState(() => chatHenvisningsUdvidelser(kilder, samlingsTitel, fejltekst));
  return udvidelser;
}

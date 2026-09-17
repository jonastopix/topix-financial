/** Link-kort i Community (17/9, Jonas: «der skal ved link på community
    være mulighed for forhåndsvisning af tingene i opslaget fremfor bare
    link»). REN motor: ingen React, ingen DOM, ingen Supabase, ingen fetch.

    Dommen: et link i et opslag bliver til et KORT når — og kun når — det
    peger på én af fem kendte ting:
      youtube  https://www.youtube.com/watch?v=<id> · youtu.be/<id> · /embed/<id>
      spotify  https://open.spotify.com/episode/<id> · /show/<id>  (også /intl-xx/…)
      lektion  https://app.theboardroom.dk/akademiet/<area>/<slug>
      event    https://app.theboardroom.dk/events/<uuid>
      opslag   https://app.theboardroom.dk/community/<uuid>
    Alt andet → null, og linket vises som det almindelige link det er.

    Der hentes ALDRIG en vilkårlig hjemmeside (ingen unfurl, ingen og:-tags):
    kortets data kommer fra YouTubes og Spotifys oEmbed-endpoints (faste
    hosts, kun id'et sendes) eller fra vores egen database gennem
    medlemmets egen RLS. Det er valg A (Jonas 17/9) — og det er grunden til,
    at motoren KUN returnerer id'er, aldrig den rå URL: datalaget bygger
    selv de adresser, det henter fra.

    Kortet afledes ved VISNING af dokumentet (ingen ny nodetype for links):
    så virker det også på de opslag, der allerede ligger i databasen, og
    et link kan aldrig «miste» sit kort, fordi editoren var en anden
    version. #-henvisninger (henvisning/eventhenvisning/opslaghenvisning)
    giver det SAMME kort som et indsat link — én visning for «henvis til
    noget på platformen», uanset om medlemmet skrev # eller satte et link
    ind. */

import { extractYouTubeId } from "@/components/hjemmebane/boardroom/youtube";
import {
  SLUG_MOENSTER,
  TILLADTE_OMRAADER,
  UUID_MOENSTER,
  type CommunityNode,
} from "./communityDokument";

/** Platformens egen host — kun links hertil bliver til interne kort.
    Ikke localhost, ikke preview-domæner: et kort til «vores eget indhold»
    skal ikke kunne fremkaldes af et link til et domæne, vi ikke ejer. */
export const PLATFORM_HOST = "app.theboardroom.dk";

/** Spotify-id'er er base62, 22 tegn (bekræftet på eksemplerne 17/9:
    03bBvemTcU8SQkP22NYXGC, 4T8krtMFTkRgF21bkNsQ6Q). */
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;

export type LinkKort =
  | { art: "youtube"; noegle: string; videoId: string }
  | { art: "spotify"; noegle: string; slags: "episode" | "show"; id: string }
  | { art: "lektion"; noegle: string; area: string; slug: string }
  | { art: "event"; noegle: string; eventId: string }
  | { art: "opslag"; noegle: string; traadId: string };

function parseUrl(url: string): URL | null {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

/** open.spotify.com/(intl-xx/)?(episode|show)/<id>. Sporingsmærket «?si=»
    ignoreres — kun stien læses. Tracks, albums, playlists og spotify.link-
    kortlinks giver null: de er ikke podcast, og et kortlink kan kun løses
    ved at hente det (det gør vi ikke). */
function spotifyKort(parsed: URL): LinkKort | null {
  if (parsed.hostname !== "open.spotify.com") return null;
  const dele = parsed.pathname.split("/").filter((d) => d.length > 0);
  if (dele.length > 0 && /^intl-[a-z]{2}$/i.test(dele[0])) dele.shift();
  if (dele.length < 2) return null;
  const [slags, id] = dele;
  if ((slags !== "episode" && slags !== "show") || !SPOTIFY_ID.test(id)) return null;
  return { art: "spotify", noegle: `spotify:${slags}:${id}`, slags, id };
}

/** Platformens egne stier. Samme mønstre som motoren bruger for #-noder
    (TILLADTE_OMRAADER, SLUG_MOENSTER, UUID_MOENSTER) — et link må ikke
    kunne fremkalde et kort til noget, en #-henvisning ikke må pege på. */
function platformKort(parsed: URL): LinkKort | null {
  if (parsed.hostname !== PLATFORM_HOST) return null;
  const dele = parsed.pathname.split("/").filter((d) => d.length > 0);
  if (dele.length === 3 && dele[0] === "akademiet") {
    const [, area, slug] = dele;
    if (!TILLADTE_OMRAADER.has(area) || !SLUG_MOENSTER.test(slug)) return null;
    return { art: "lektion", noegle: `lektion:${area}:${slug}`, area, slug };
  }
  if (dele.length === 2 && dele[0] === "events" && UUID_MOENSTER.test(dele[1])) {
    return { art: "event", noegle: `event:${dele[1].toLowerCase()}`, eventId: dele[1] };
  }
  if (dele.length === 2 && dele[0] === "community" && UUID_MOENSTER.test(dele[1])) {
    return { art: "opslag", noegle: `opslag:${dele[1].toLowerCase()}`, traadId: dele[1] };
  }
  return null;
}

/** Ét link → ét kort eller null. Ren, kaster aldrig. */
export function linkKort(url: string | null | undefined): LinkKort | null {
  if (typeof url !== "string") return null;
  const videoId = extractYouTubeId(url.trim());
  if (videoId !== null) return { art: "youtube", noegle: `youtube:${videoId}`, videoId };
  const parsed = parseUrl(url);
  if (parsed === null) return null;
  return spotifyKort(parsed) ?? platformKort(parsed);
}

/** #-noderne giver samme kort som et link — ingen URL at parse, id'erne er
    allerede hvidlistet af motoren. */
function kortAfNode(node: CommunityNode): LinkKort | null {
  switch (node.type) {
    case "henvisning":
      return { art: "lektion", noegle: `lektion:${node.area}:${node.slug}`, area: node.area, slug: node.slug };
    case "eventhenvisning":
      return { art: "event", noegle: `event:${node.eventId.toLowerCase()}`, eventId: node.eventId };
    case "opslaghenvisning":
      return { art: "opslag", noegle: `opslag:${node.traadId.toLowerCase()}`, traadId: node.traadId };
    case "text": {
      const link = node.marks.find((m) => m.type === "link");
      return link !== undefined && link.type === "link" ? linkKort(link.href) : null;
    }
    default:
      return null;
  }
}

function samlKort(noder: CommunityNode[], ud: LinkKort[]): void {
  for (const node of noder) {
    const kort = kortAfNode(node);
    if (kort !== null) ud.push(kort);
    if ("content" in node) samlKort(node.content, ud);
  }
}

/** Kortene pr. TOPBLOK i et hvidlistet dokument: resultatets index i er
    kortene for blok i, i den rækkefølge de står i blokken. Et link, der
    optræder flere gange i dokumentet, giver ét kort — det første vinder;
    de senere blokke får det ikke igen. Et afsnit med tre links til samme
    video giver altså ét kort. */
export function linkKortIDokument(noder: CommunityNode[]): LinkKort[][] {
  const set = new Set<string>();
  return noder.map((blok) => {
    const fundet: LinkKort[] = [];
    samlKort([blok], fundet);
    const unikke: LinkKort[] = [];
    for (const kort of fundet) {
      if (set.has(kort.noegle)) continue;
      set.add(kort.noegle);
      unikke.push(kort);
    }
    return unikke;
  });
}

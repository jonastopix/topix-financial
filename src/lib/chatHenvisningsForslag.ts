/**
 * src/lib/chatHenvisningsForslag.ts — chattens #-forslag, de rene dele
 * (29/9-2026, trin 3 af «#» i chatten).
 *
 * HVAD chatten tilbyder, når man skriver «#»:
 *   events       published og ikke passeret — listAllUpcomingEvents' egen dom,
 *                gentaget med isEventPast på skrive-tidspunktet (listen er hentet
 *                ved mount, og et event kan nå at slutte, mens feltet står åbent)
 *   lektioner    published, samme områdefilter som Community: motorens
 *                TILLADTE_OMRAADER (som CommunityComposers OMRAADE_LABELS er
 *                værnet lig med — linkKort.guard dom 6)
 *   rabataftaler listMedlemsPartnere (published) minus de udløbne —
 *                aftalenErUdloebet, SAMME sætning som /rabataftaler
 *   opslag       Community-feedet (hentFeed(30), SAMME kilde som Community's #-liste;
 *                RPC'en giver kun tråde, den der skriver må se). Noden er den
 *                samme «opslaghenvisning» (traadId + titel), og adressen er
 *                chatDokument.henvisningsAdresse's — som Community's.
 * RLS afgør, hvad hver ser: listerne hentes som den, der skriver.
 *
 * Rækkefølgen er Community's: events øverst, så lektioner, så aftaler, og opslag
 * SIDST (det sjældnere at henvise til) — højst otte i alt. Ingen React, ingen Supabase, ingen DOM.
 */
import type { ContentItem, EventRow } from "@/lib/hjemmebane/adminContentApi";
import type { MedlemsPartner } from "@/lib/hjemmebane/akademiApi";
import type { CommunityTraad } from "@/lib/hjemmebane/communityApi";
import { TILLADTE_OMRAADER } from "@/lib/hjemmebane/communityDokument";
import { isEventPast } from "@/lib/hjemmebane/eventPhase";
import { aftalenErUdloebet } from "@/lib/hjemmebane/rabataftaleAdresse";
import { sektionsfejlTekst } from "@/lib/hjemmebane/hentefejl";

/** Samme loft som Community's #-liste (CommunityComposer: `.slice(0, 8)`). */
export const MAKS_FORSLAG = 8;

export type ChatForslag =
  | { slags: "event"; event: EventRow }
  | { slags: "item"; item: ContentItem }
  | { slags: "rabat"; aftale: MedlemsPartner }
  | { slags: "opslag"; traad: CommunityTraad };

export interface ChatForslagsKilder {
  events: readonly EventRow[];
  items: readonly ContentItem[];
  aftaler: readonly MedlemsPartner[];
  traade: readonly CommunityTraad[];
}

/** Forslagene til søgningen efter «#». Titlen matches uden hensyn til store/små bogstaver. */
export function vaelgChatForslag(kilder: ChatForslagsKilder, soegning: string, nu: Date = new Date()): ChatForslag[] {
  const q = soegning.toLowerCase();
  const events: ChatForslag[] = kilder.events
    .filter((event) => event.status === "published" && !isEventPast(event, nu))
    .filter((event) => event.title.toLowerCase().includes(q))
    .map((event) => ({ slags: "event" as const, event }));
  const items: ChatForslag[] = kilder.items
    .filter((item) => item.status === "published" && TILLADTE_OMRAADER.has(item.area))
    .filter((item) => item.title.toLowerCase().includes(q))
    .map((item) => ({ slags: "item" as const, item }));
  const aftaler: ChatForslag[] = kilder.aftaler
    .filter((aftale) => !aftalenErUdloebet(aftale.valid_until, nu))
    .filter((aftale) => aftale.name.toLowerCase().includes(q))
    .map((aftale) => ({ slags: "rabat" as const, aftale }));
  // Opslag sidst, som i Community: feedet er allerede kun aktive tråde, nyeste aktivitet først.
  const opslag: ChatForslag[] = kilder.traade
    .filter((traad) => traad.titel.toLowerCase().includes(q))
    .map((traad) => ({ slags: "opslag" as const, traad }));
  return [...events, ...items, ...aftaler, ...opslag].slice(0, MAKS_FORSLAG);
}

export type ChatHenvisningsNode =
  | { type: "eventhenvisning"; attrs: { eventId: string; titel: string } }
  | { type: "henvisning"; attrs: { area: string; slug: string; titel: string } }
  | { type: "rabathenvisning"; attrs: { aftaleId: string; titel: string } }
  | { type: "opslaghenvisning"; attrs: { traadId: string; titel: string } };

/** Forslaget → noden, editoren indsætter (motorens nodetyper og attributter). */
export function chatForslagTilNode(forslag: ChatForslag): ChatHenvisningsNode {
  switch (forslag.slags) {
    case "event":
      return { type: "eventhenvisning", attrs: { eventId: forslag.event.id, titel: forslag.event.title } };
    case "item":
      return {
        type: "henvisning",
        attrs: { area: forslag.item.area, slug: forslag.item.slug, titel: forslag.item.title },
      };
    case "rabat":
      return { type: "rabathenvisning", attrs: { aftaleId: forslag.aftale.id, titel: forslag.aftale.name } };
    case "opslag":
      return { type: "opslaghenvisning", attrs: { traadId: forslag.traad.id, titel: forslag.traad.titel } };
  }
}

const kortDato = (iso: string) => new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short" });

/**
 * Rækkens to linjer. Event: «Event · {dato}» (Community's). Lektion: «Lektion ·
 * {samling} · {område} · {N min}» — samling, område og varighed i Community's
 * rækkefølge (CommunityComposer: samling, OMRAADE_LABELS[area], varighed).
 * Områdenavnet får funktionen udefra (komponenten slår det op i Community's
 * eksporterede OMRAADE_LABELS), så denne fil forbliver ren. Aftale:
 * «Rabataftale · {rabatteksten}». Opslag: «Opslag · {forfatter} · {dato}»
 * (Community's).
 */
export function chatForslagsTekst(
  forslag: ChatForslag,
  samlingsTitel: string | null,
  omraadeNavn: string | null = null,
): { titel: string; undertekst: string } {
  switch (forslag.slags) {
    case "event":
      return { titel: forslag.event.title, undertekst: `Event · ${kortDato(forslag.event.starts_at)}` };
    case "item": {
      const dele = ["Lektion"];
      if (samlingsTitel) dele.push(samlingsTitel);
      if (omraadeNavn) dele.push(omraadeNavn);
      if (forslag.item.duration_seconds) {
        dele.push(`${Math.max(1, Math.round(forslag.item.duration_seconds / 60))} min`);
      }
      return { titel: forslag.item.title, undertekst: dele.join(" · ") };
    }
    case "rabat":
      return {
        titel: forslag.aftale.name,
        undertekst: forslag.aftale.discount_text ? `Rabataftale · ${forslag.aftale.discount_text}` : "Rabataftale",
      };
    case "opslag":
      return {
        titel: forslag.traad.titel,
        undertekst: `Opslag · ${forslag.traad.forfatter_navn ?? "Medlem"} · ${kortDato(forslag.traad.created_at)}`,
      };
  }
}

/** Hvilke af chattens fem kilder, der fejlede (react-querys isError). */
export interface ChatForslagsFejl {
  events: boolean;
  items: boolean;
  samlinger: boolean;
  aftaler: boolean;
  feed: boolean;
}

/**
 * Linjen nederst i #-listen, når en kilde fejlede — ellers null. Samme adfærd
 * som Community's composer (CommunityComposer.tsx: `forslagFejlede` — ÉN rolig
 * linje, når NOGEN af kilderne fejlede, også samlingerne) og samme form:
 * husets sektionsfejlTekst + at man stadig kan skrive. Ordene er chattens:
 * «til #» (chatten har ingen @) og «sende» (en chatbesked deles ikke).
 */
export function forslagsFejlTekst(fejl: ChatForslagsFejl): string | null {
  const nogen = fejl.events || fejl.items || fejl.samlinger || fejl.aftaler || fejl.feed;
  return nogen ? `${sektionsfejlTekst("chat_forslag")} Du kan stadig skrive og sende.` : null;
}

/**
 * chatVedhaeftningSti — spejl af supabase/functions/_shared/chatVedhaeftningSti.ts (29/9-2026).
 *
 * Kroppen efter filhovedet er ORDRET den samme (paritetsprøve:
 * src/lib/__tests__/chatVedhaeftningSti.paritet.test.ts). Ret i begge, i samme ændring.
 */

/*
 * HULLET (recon-video-i-chatten.md §2): get-chat-attachment-url signerede den
 * sti, der stod i messages.context_meta.attachments, efter kun at have tjekket,
 * at kalderen må SE beskeden. Stien blev aldrig sammenlignet med beskedens
 * afsender, og databasen stiller intet krav til context_meta. Et medlem kunne
 * derfor skrive en anden brugers sti ind i sin egen besked og få en signeret
 * URL til den brugers fil.
 *
 * REGLEN: uploadChatAttachments (src/lib/chatAttachments.ts) lægger ALTID filen
 * under `{userId}/…` for den, der sender. En vedhæftning er derfor kun gyldig,
 * når stiens FØRSTE mappe er præcis beskedens sender_id — den samme ejerskabs-
 * model som storage-politikken (storage.foldername(name))[1] = auth.uid()::text.
 *
 * TO FORMER læses, som get-chat-attachment-url altid har læst dem:
 *   path  — `{userId}/{ts}-{navn}`, skrevet af uploadChatAttachments
 *   url   — historisk offentlig form `…/storage/v1/object/public/chat-attachments/{sti}`
 */

export const OFFENTLIG_URL_MARKOER = "/storage/v1/object/public/chat-attachments/";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StiDom =
  | { ok: true; sti: string }
  | { ok: false; fejl: "Malformed attachment URL" | "Unknown attachment reference format" };

/**
 * Vedhæftningens storage-sti ud af dens reference — ORDRET den logik, der stod
 * i get-chat-attachment-url (:105-118), med samme to fejltekster.
 */
export function vedhaeftningsSti(att: { url?: unknown; path?: unknown } | null | undefined): StiDom {
  const url = att?.url;
  const path = att?.path;
  if (typeof url === "string" && url.startsWith("http") && url.includes(OFFENTLIG_URL_MARKOER)) {
    const kandidat = url.split(OFFENTLIG_URL_MARKOER)[1];
    if (!kandidat || kandidat.includes("?") || kandidat.startsWith("/")) {
      return { ok: false, fejl: "Malformed attachment URL" };
    }
    return { ok: true, sti: kandidat };
  }
  if (typeof path === "string" && !path.startsWith("http")) {
    return { ok: true, sti: path };
  }
  return { ok: false, fejl: "Unknown attachment reference format" };
}

/**
 * Er stiens første mappe PRÆCIS senderId? Fail-closed: alt, der ikke er en
 * pæn relativ sti med mindst én mappe og et filnavn, er nej.
 *   - senderId skal være et uuid
 *   - ingen foranstillet «/», intet «\», intet «?»
 *   - mindst to dele, ingen tom del («a//b», afsluttende «/»)
 *   - ingen del er «.» eller «..» — heller ikke URL-kodet («%2e%2e»)
 *   - første del === senderId, tegn for tegn (ingen store/små-bogstav-lempelse:
 *     auth.uid()::text er altid små bogstaver, og det er politikkens sammenligning)
 */
export function stiTilhoererAfsender(sti: unknown, senderId: unknown): boolean {
  if (typeof sti !== "string" || typeof senderId !== "string") return false;
  if (!UUID.test(senderId)) return false;
  if (sti === "" || sti.startsWith("/") || sti.includes("\\") || sti.includes("?")) return false;
  const dele = sti.split("/");
  if (dele.length < 2) return false;
  for (const del of dele) {
    if (del === "") return false;
    let afkodet: string;
    try {
      afkodet = decodeURIComponent(del);
    } catch {
      return false;
    }
    if (del === "." || del === ".." || afkodet === "." || afkodet === ".." || afkodet.includes("/") || afkodet.includes("\\")) {
      return false;
    }
  }
  return dele[0] === senderId;
}

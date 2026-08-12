/** Community-dokument-motoren: oversætter et Tiptap-dokument (JSON fra
    community_traade.indhold_json) til en hvidlistet trædatastruktur, som
    render-laget kan gå igennem uden at træffe én eneste sikkerhedsbeslutning.
    Ingen React, ingen DOM, ingen Supabase — samme snit som deriveFocus og
    afgoerFornyelsestilstand.

    Alt uden for hvidlisten fjernes STILLE — ukendte nodetyper, ukendte marks,
    ukendte attrs. Stille frem for fejl, fordi dokumentet kan komme fra en
    fremtidig editorversion, og et opslag skal aldrig blive ulæseligt, fordi
    en node ikke kendes. Sikkerheden ligger i, at ukendt aldrig når frem —
    ikke i at brokke sig. */

export type CommunityMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "link"; href: string };

/** Hvidlistens nodetyper. `doc` er kun gyldig som rod og repræsenteres som
    selve arrayet fra parseCommunityDokument — derfor ingen doc-variant her. */
export type CommunityNode =
  | { type: "paragraph"; content: CommunityNode[] }
  | { type: "heading"; level: 2; content: CommunityNode[] }
  | { type: "bulletList"; content: CommunityNode[] }
  | { type: "orderedList"; content: CommunityNode[] }
  | { type: "listItem"; content: CommunityNode[] }
  | { type: "blockquote"; content: CommunityNode[] }
  | { type: "hardBreak" }
  | { type: "text"; text: string; marks: CommunityMark[] }
  | { type: "image"; src: string; alt: string };

const erObjekt = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Link-hærdningen — det vigtigste tjek i filen. Kun https://, http:// og
    mailto: slipper igennem; alt andet (javascript:, data:, vbscript:, …)
    kasseres, og teksten består uden link. Tjekket sker på den TRIMMEDE,
    små-bogstaverede streng, så " JaVaScRiPt:alert(1)" ikke slipper forbi
    et naivt prefix-tjek. Returnerer den trimmede href eller null. */
function sikkerHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmet = raw.trim();
  const lille = trimmet.toLowerCase();
  if (
    lille.startsWith("https://") ||
    lille.startsWith("http://") ||
    lille.startsWith("mailto:")
  ) {
    return trimmet;
  }
  return null;
}

/** Samme regel for billeder, men uden mailto: — en billedkilde er altid en
    hentbar URL. Blokerer bl.a. data:text/html og javascript:-kilder. */
function sikkerBilledSrc(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmet = raw.trim();
  const lille = trimmet.toLowerCase();
  if (lille.startsWith("https://") || lille.startsWith("http://")) {
    return trimmet;
  }
  return null;
}

/** Hvidlist marks på en text-node. Ukendte marks fjernes stille; et link-mark
    med usikker href fjernes også — teksten selv består i begge tilfælde. */
function hvidlistMarks(raw: unknown): CommunityMark[] {
  if (!Array.isArray(raw)) return [];
  const marks: CommunityMark[] = [];
  for (const mark of raw) {
    if (!erObjekt(mark)) continue;
    if (mark.type === "bold") {
      marks.push({ type: "bold" });
    } else if (mark.type === "italic") {
      marks.push({ type: "italic" });
    } else if (mark.type === "link") {
      const href = sikkerHref(erObjekt(mark.attrs) ? mark.attrs.href : null);
      if (href !== null) marks.push({ type: "link", href });
    }
  }
  return marks;
}

/** Oversæt ét content-array rekursivt. Noder uden for hvidlisten og noder,
    der ender tomme efter filtrering, falder væk — et afsnit uden brugbart
    indhold er ikke et afsnit. */
function oversaetIndhold(raw: unknown): CommunityNode[] {
  if (!Array.isArray(raw)) return [];
  const resultat: CommunityNode[] = [];
  for (const node of raw) {
    const oversat = oversaetNode(node);
    if (oversat !== null) resultat.push(oversat);
  }
  return resultat;
}

function oversaetNode(raw: unknown): CommunityNode | null {
  if (!erObjekt(raw)) return null;

  switch (raw.type) {
    case "paragraph":
    case "bulletList":
    case "orderedList":
    case "listItem":
    case "blockquote": {
      const content = oversaetIndhold(raw.content);
      if (content.length === 0) return null;
      return { type: raw.type, content };
    }

    case "heading": {
      const content = oversaetIndhold(raw.content);
      if (content.length === 0) return null;
      // Level tvinges til 2 uanset input — fladen har præcis ét overskrifts-
      // niveau under opslagets titel, og input-level er brugerdata.
      return { type: "heading", level: 2, content };
    }

    case "hardBreak":
      return { type: "hardBreak" };

    case "text": {
      if (typeof raw.text !== "string" || raw.text.length === 0) return null;
      return { type: "text", text: raw.text, marks: hvidlistMarks(raw.marks) };
    }

    case "image": {
      const attrs = erObjekt(raw.attrs) ? raw.attrs : {};
      const src = sikkerBilledSrc(attrs.src);
      if (src === null) return null;
      return { type: "image", src, alt: typeof attrs.alt === "string" ? attrs.alt : "" };
    }

    // Ukendt nodetype (eller nested "doc") → stille væk, resten består.
    default:
      return null;
  }
}

/** Indgangen. Returnerer [] for alt, der ikke er et doc-objekt med et
    content-array — og kaster ALDRIG: en exception her ville ramme fladen
    (opslaget bliver hvidt for læseren), ikke angriberen. Ugyldigt input
    giver tomt resultat, punktum. */
export function parseCommunityDokument(input: unknown): CommunityNode[] {
  try {
    if (!erObjekt(input) || input.type !== "doc") return [];
    if (!Array.isArray(input.content)) return [];
    return oversaetIndhold(input.content);
  } catch {
    return [];
  }
}

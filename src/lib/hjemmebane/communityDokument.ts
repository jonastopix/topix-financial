/** Community-dokument-motoren: oversætter et Tiptap-dokument (JSON fra
    community_traade.indhold_json) til en hvidlistet trædatastruktur, som
    render-laget kan gå igennem uden at træffe én eneste sikkerhedsbeslutning.
    Ingen React, ingen DOM, ingen Supabase — samme snit som deriveFocus og
    afgoerFornyelsestilstand.

    Alt uden for hvidlisten fjernes STILLE — ukendte nodetyper, ukendte marks,
    ukendte attrs, og kendte noder på ulovlige pladser. Stille frem for fejl,
    fordi dokumentet kan komme fra en fremtidig editorversion, og et opslag
    skal aldrig blive ulæseligt, fordi en node ikke kendes. Sikkerheden ligger
    i, at ukendt aldrig når frem — ikke i at brokke sig. */

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
  | { type: "image"; path: string; alt: string };

/** Dybdegrænsen. try/catch fanger et stack overflow, men et dokument skal
    afvises på en KENDT grænse frem for at afhænge af, hvornår kaldestakken
    løber tør. Tyve niveauer er langt mere, end et læsbart opslag nogensinde
    bruger. Noder dybere end grænsen falder stille væk med deres indhold. */
export const MAKS_DYBDE = 20;

/** Hvidlisten er KONTEKSTAFHÆNGIG: den siger ikke kun hvilke noder der
    findes, men hvor de må stå. Dokumentet kommer ikke fra Tiptap — det
    kommer fra opret_community_traad, som kun tjekker at roden er "doc",
    og et medlem kan kalde RPC'en direkte med hvad som helst. Uden
    placeringsregler ville render-laget udsende <li> uden <ul> eller <p>
    direkte i en liste: ugyldig HTML, som browsere håndterer forskelligt.

    Reglerne:
      blok   (roden, listItem, blockquote) → paragraph, heading, bulletList,
                                             orderedList, blockquote, image
      liste  (bulletList, orderedList)     → KUN listItem
      inline (paragraph, heading)          → KUN text og hardBreak

    Konsekvensen: et blockquote må indeholde blokke og dermed nestes, en
    liste kan kun indeholde listItem, og et listItem kan indeholde både
    afsnit og nestede lister — det er præcis Tiptaps egen struktur. */
type Kontekst = "blok" | "liste" | "inline";

const TILLADT: Record<Kontekst, ReadonlySet<string>> = {
  blok: new Set(["paragraph", "heading", "bulletList", "orderedList", "blockquote", "image"]),
  liste: new Set(["listItem"]),
  inline: new Set(["text", "hardBreak"]),
};

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

/** Billed-noden bærer en STI i vores egen private bucket, ikke en URL. En
    signeret URL udløber (1 time), mens dokumentet lever for evigt — en gemt
    URL ville give brudte billeder i gamle opslag. Rendereren signerer ved
    visning gennem get-community-billed-url, som kun signerer efter
    databasens adgangsdom (maa_se_community_billede). En sti kan desuden
    aldrig pege ud af huset, hvor en URL-node ville kræve at vi stoler på
    et prefiks-tjek.

    Mønstret, linje for linje:
      ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}
        — et uuid: fem hex-grupper (8-4-4-4-12) adskilt af bindestreger;
          uploaderens mappe, håndhævet af bucketens INSERT-policy
      \/
        — præcis én skråstreg mellem mappe og filnavn
      [A-Za-z0-9._-]+
        — filnavnet: kun bogstaver, tal, punktum, underscore, bindestreg
      \.(jpg|jpeg|png|webp|gif)$
        — og en billedendelse til sidst
      /i
        — case-insensitivt, så .PNG og hex i store bogstaver også rammer

    Reglerne oven på mønstret (bælte OG seler — flere af dem er allerede
    udelukket af tegnsættet, men de står eksplicit så hensigten kan læses):
    - ikke-tom efter trim
    - ".." må ikke forekomme (ingen path-traversal, heller ikke i filnavnet
      hvor punktummer ellers er lovlige)
    - må ikke starte med "/" og må ikke indeholde "//" (ingen absolutte
      stier, ingen tomme segmenter)
    - ":" må ikke forekomme (så hverken https:, data: eller javascript:
      kan smugles ind som "sti")
    Alt andet giver null, og billedet falder stille væk som enhver anden
    ulovlig node. */
const BILLED_STI_MOENSTER =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp|gif)$/i;

function sikkerBilledSti(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmet = raw.trim();
  if (trimmet.length === 0) return null;
  if (
    trimmet.includes("..") ||
    trimmet.startsWith("/") ||
    trimmet.includes("//") ||
    trimmet.includes(":")
  ) {
    return null;
  }
  if (!BILLED_STI_MOENSTER.test(trimmet)) return null;
  return trimmet;
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

/** Oversæt ét content-array rekursivt i en given kontekst. Noder uden for
    kontekstens hvidliste og noder, der ender tomme efter filtrering, falder
    væk — et afsnit uden brugbart indhold er ikke et afsnit. */
function oversaetIndhold(raw: unknown, kontekst: Kontekst, dybde: number): CommunityNode[] {
  if (!Array.isArray(raw)) return [];
  const resultat: CommunityNode[] = [];
  for (const node of raw) {
    const oversat = oversaetNode(node, kontekst, dybde);
    if (oversat !== null) resultat.push(oversat);
  }
  return resultat;
}

function oversaetNode(raw: unknown, kontekst: Kontekst, dybde: number): CommunityNode | null {
  if (dybde > MAKS_DYBDE) return null;
  if (!erObjekt(raw) || typeof raw.type !== "string") return null;
  // Placeringstjekket: en kendt node på en ulovlig plads fjernes lige så
  // stille som en ukendt node.
  if (!TILLADT[kontekst].has(raw.type)) return null;

  switch (raw.type) {
    case "paragraph":
    case "heading": {
      const content = oversaetIndhold(raw.content, "inline", dybde + 1);
      // En node hvis indhold udelukkende er hardBreak er tom — hundrede
      // tomme linjer er ikke indhold.
      if (content.every((node) => node.type === "hardBreak")) return null;
      if (raw.type === "heading") {
        // Level tvinges til 2 uanset input — fladen har præcis ét
        // overskrifts-niveau under opslagets titel, og input-level er
        // brugerdata.
        return { type: "heading", level: 2, content };
      }
      return { type: "paragraph", content };
    }

    case "bulletList":
    case "orderedList": {
      const content = oversaetIndhold(raw.content, "liste", dybde + 1);
      if (content.length === 0) return null;
      return { type: raw.type, content };
    }

    case "listItem":
    case "blockquote": {
      const content = oversaetIndhold(raw.content, "blok", dybde + 1);
      if (content.length === 0) return null;
      return { type: raw.type, content };
    }

    case "hardBreak":
      return { type: "hardBreak" };

    case "text": {
      if (typeof raw.text !== "string" || raw.text.length === 0) return null;
      return { type: "text", text: raw.text, marks: hvidlistMarks(raw.marks) };
    }

    case "image": {
      const attrs = erObjekt(raw.attrs) ? raw.attrs : {};
      const path = sikkerBilledSti(attrs.path);
      if (path === null) return null;
      return { type: "image", path, alt: typeof attrs.alt === "string" ? attrs.alt : "" };
    }

    // Uden for hvidlisten (eller nested "doc") → stille væk, resten består.
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
    return oversaetIndhold(input.content, "blok", 1);
  } catch {
    return [];
  }
}

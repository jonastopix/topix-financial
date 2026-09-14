/**
 * src/lib/kreativEksport.ts
 *
 * Delingskreativen som PNG (14/9): tag det DOM-element der viser kreativen,
 * og giv en PNG i kreativens RIGTIGE pixelstørrelse — 1080×1080 eller
 * 1200×627 (delingskreativ.FORMATER) — som filen hun lægger på LinkedIn.
 * Ingen knap her: fladen (DelingView) kobler motoren på bagefter.
 *
 * HUSETS FORM, som det nye følger:
 *   html2canvas 1.4.1 er allerede i brug i exportPdf.ts:20-29
 *   (scale: 2, useCORS: true, backgroundColor, onclone, logging: false).
 *   Download-grebet er EventDetailView.tsx:38-49: Blob → URL.createObjectURL
 *   → <a download> → click → revoke efter et sekund.
 *
 * FÆLDEN — SKALERINGEN. På skærmen vises kreativen i fuld px-størrelse
 * skaleret NED med transform: scale(k) (SkaleretKreativ.tsx:86-98:
 * [data-skaleret-indhold] er 1080 px bred med transform, inde i
 * [data-skaleret-kreativ], som er den synlige, klippede boks på fx 400 px).
 * html2canvas måler bounds med getBoundingClientRect, som TAGER transformen
 * med (html2canvas.js:3801-3803, :125) — tegnede man den synlige boks, blev
 * canvas'en 400 px. Derfor tre ting, hver for sig nok til at give 1080:
 *   1. width/height gives eksplicit fra FORMATER (html2canvas.js:7770-7771:
 *      opts.width/height vinder over de målte bounds).
 *   2. scale: 1 eksplicit. Default er devicePixelRatio (html2canvas.js:7767)
 *      — på en Mac-skærm 2, som ville give 2160 px; exportPdf bruger 2 med
 *      vilje til PDF. Kreativens mål ER pixel-målet, så 1.
 *   3. I onclone (kører i KLONEN, aldrig på skærmen) fjernes skaleringen:
 *      transform: none på [data-skaleret-indhold], og den klippede boks
 *      [data-skaleret-kreativ] sættes til fuld størrelse uden overflow-klip.
 *      html2canvas nulstiller selv kun transformen på det element der gives
 *      som rod (html2canvas.js:3801-3803) — gives den YDRE boks, rører den
 *      ikke barnets transform. frigoerSkalering gør det for begge tilfælde,
 *      og virker uanset om kalderen giver den ydre boks, indholdet eller
 *      selve kreativ-elementet.
 *
 * SKRIFTERNE (Parkinsans, Manrope fra Google Fonts, index.css:1-2):
 * html2canvas tegner tekst med canvas fillText i klonens skrifter, og venter
 * på klonens document.fonts.ready før den tegner (html2canvas.js:5247-5248).
 * Her ventes desuden på sidens egne document.fonts.ready først, så klonen
 * arver indlæste skrifter fra cachen. At de faktisk tegnes med Parkinsans og
 * ikke system-ui, kan ikke bevises uden en browser — måles på skærmen.
 *
 * BILLEDER: portræt/logo fra Supabase storage er krydsdomæne. useCORS får
 * html2canvas til at hente dem selv med crossOrigin='anonymous'
 * (html2canvas.js:5735, :5763); det kræver Access-Control-Allow-Origin fra
 * storage — målt 14/9 med curl mod public-buckets avatars og company-logos:
 * `access-control-allow-origin: *`. Filerne i public/ (rådgivernes
 * portrætter, ordmærket) er same-origin. En object-URL fra en fil hun selv
 * har valgt er også same-origin. Rækker CORS ikke (fx en anden host), tegnes
 * billedet tomt — html2canvas kaster ikke.
 */

import html2canvas from "html2canvas";
import { FORMATER, type Format, type Layout, type Udgave } from "./delingskreativ";
import { slugify } from "./hjemmebane/slug";

/** Attributterne SkaleretKreativ.tsx sætter (:83, :87) — læses her, skrives ikke. */
export const SKALERET_KREATIV_ATTR = "data-skaleret-kreativ";
export const SKALERET_INDHOLD_ATTR = "data-skaleret-indhold";

export interface KreativId {
  layout: Layout;
  udgave: Udgave;
  format: Format;
}

const LAYOUT_NAVN: Readonly<Record<Layout, string>> = {
  tre_paa_raekke: "tre-paa-raekke",
  optagelsen: "optagelsen",
  optaget_i: "optaget-i",
};

/**
 * Filnavnet siger hvad det er: «the-boardroom-tre-paa-raekke-moerk-1080x1080-anne-kirkegaard.png».
 * Navnet slug'es (æøå → ae/oe/aa, resten a-z0-9); tomt navn udelades helt.
 * Ren; delingskreativ.ts har ingen kreativFilnavn (tjekket 14/9), så den bor her.
 */
export function kreativFilnavn(id: KreativId, memberName: string | null | undefined): string {
  const maal = FORMATER[id.format];
  const navn = slugify((memberName ?? "").trim());
  const dele = ["the-boardroom", LAYOUT_NAVN[id.layout], id.udgave, `${maal.bredde}x${maal.hoejde}`, ...(navn ? [navn] : [])];
  return `${dele.join("-")}.png`;
}

/** Det html2canvas skal have for at tegne i FULD størrelse — ren, så testen kan låse tallene. */
export interface EksportIndstillinger {
  width: number;
  height: number;
  scale: 1;
  useCORS: true;
  backgroundColor: null;
  logging: false;
  windowWidth: number;
  windowHeight: number;
}

export function eksportIndstillinger(format: Format, vindue: { bredde: number; hoejde: number }): EksportIndstillinger {
  const maal = FORMATER[format];
  return {
    width: maal.bredde,
    height: maal.hoejde,
    scale: 1,
    useCORS: true,
    // Kreativen maler sin egen baggrund (canvas.baggrund i måltabellen); null
    // her, så html2canvas ikke lægger hvidt under — som exportPdf gør til PDF.
    backgroundColor: null,
    logging: false,
    // Klonens vindue skal mindst kunne rumme kreativen; ellers bruges
    // sidens (html2canvas.js:7736-7737). Aldrig mindre end kreativen.
    windowWidth: Math.max(vindue.bredde, maal.bredde),
    windowHeight: Math.max(vindue.hoejde, maal.hoejde),
  };
}

/**
 * Fjerner skærm-skaleringen på et element (klonen!): transform: none på
 * [data-skaleret-indhold], og [data-skaleret-kreativ]-boksen sat til fuld
 * størrelse uden klip. Virker om `rod` er den ydre boks, indholdet, eller
 * et element inde i indholdet (så søges opad). Ren DOM-mutation; testet i
 * jsdom. Returnerer hvad der blev rørt, så kalderen kan se det.
 */
export function frigoerSkalering(rod: HTMLElement, format: Format): { indhold: boolean; boks: boolean } {
  const maal = FORMATER[format];
  const indhold =
    (rod.hasAttribute(SKALERET_INDHOLD_ATTR) ? rod : null) ??
    rod.querySelector<HTMLElement>(`[${SKALERET_INDHOLD_ATTR}]`) ??
    rod.closest<HTMLElement>(`[${SKALERET_INDHOLD_ATTR}]`);
  if (indhold) {
    indhold.style.transform = "none";
    indhold.style.visibility = "visible";
    indhold.style.width = `${maal.bredde}px`;
    indhold.style.height = `${maal.hoejde}px`;
  }
  const boks =
    (rod.hasAttribute(SKALERET_KREATIV_ATTR) ? rod : null) ??
    rod.querySelector<HTMLElement>(`[${SKALERET_KREATIV_ATTR}]`) ??
    rod.closest<HTMLElement>(`[${SKALERET_KREATIV_ATTR}]`);
  if (boks) {
    boks.style.width = `${maal.bredde}px`;
    boks.style.height = `${maal.hoejde}px`;
    boks.style.maxWidth = "none";
    boks.style.maxHeight = "none";
    boks.style.overflow = "visible";
  }
  return { indhold: indhold !== null, boks: boks !== null };
}

/** Venter på sidens skrifter, hvis browseren kan sige det (document.fonts). */
async function ventPaaSkrifter(doc: Document): Promise<void> {
  const fonts = (doc as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (fonts?.ready) {
    try {
      await fonts.ready;
    } catch {
      // Skrifter der ikke kan indlæses stopper ikke eksporten — de falder tilbage.
    }
  }
}

/** Tegner kreativen i fuld størrelse. `element` er kreativens rod, den skalerede boks eller indholdet. */
export async function tegnKreativ(element: HTMLElement, format: Format): Promise<HTMLCanvasElement> {
  const doc = element.ownerDocument;
  const vindue = { bredde: doc.defaultView?.innerWidth ?? 0, hoejde: doc.defaultView?.innerHeight ?? 0 };
  await ventPaaSkrifter(doc);
  return html2canvas(element, {
    ...eksportIndstillinger(format, vindue),
    // Kører i klonen: skærmens skalering fjernes dér, aldrig på det viste.
    onclone: (_klonDoc, klonElement) => {
      frigoerSkalering(klonElement, format);
    },
  });
}

/** canvas → PNG-blob (toBlob er callback-baseret; null når canvas'en er tom eller tainted). */
export function canvasSomPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG'en kunne ikke dannes — lærredet er tomt eller spærret af et billede uden CORS."));
    }, "image/png");
  });
}

/** Download-grebet, ordret som EventDetailView.tsx:38-49 (Blob + <a download>). */
export function hentFil(blob: Blob, filnavn: string, doc: Document = document): void {
  const url = URL.createObjectURL(blob);
  const a = doc.createElement("a");
  a.href = url;
  a.download = filnavn;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface KreativEksportResultat {
  filnavn: string;
  bredde: number;
  hoejde: number;
}

/**
 * Hele vejen: tegn → PNG → hent. Kaster hvis lærredet ender i en anden
 * størrelse end formatets (så en fejl i skaleringen aldrig giver en 400 px
 * fil med det rigtige navn), eller hvis PNG'en ikke kan dannes.
 */
export async function hentKreativSomPng(element: HTMLElement, id: KreativId, memberName: string | null | undefined): Promise<KreativEksportResultat> {
  const maal = FORMATER[id.format];
  const canvas = await tegnKreativ(element, id.format);
  if (canvas.width !== maal.bredde || canvas.height !== maal.hoejde) {
    throw new Error(`Kreativen blev tegnet i ${canvas.width}×${canvas.height} px, ikke ${maal.bredde}×${maal.hoejde}.`);
  }
  const blob = await canvasSomPng(canvas);
  const filnavn = kreativFilnavn(id, memberName);
  hentFil(blob, filnavn, element.ownerDocument);
  return { filnavn, bredde: canvas.width, hoejde: canvas.height };
}

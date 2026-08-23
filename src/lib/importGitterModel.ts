/**
 * importGitterModel — gitterets maskinlag (docs/import-model-design.md §2, P1-P3).
 *
 * Oversætter import-motorens resultat til det redigerbare gitter der er
 * rygraden i alle importer (P2), og ejer alle ændringer af det. Ren logik,
 * ingen React, ingen I/O — komponenten (HbImportGitter) præsenterer kun.
 *
 * Besluttet form (2026-08-23):
 *   - Kun POSTER bliver rækker. Subtotaler og sektioner er struktur, ikke
 *     data — de vises som ramme og må ALDRIG importeres (dobbelttælling).
 *   - Alt er valgt til som udgangspunkt; motoren markerer det den tvivler
 *     på med en forklaring, og medlemmet fravælger (P1).
 *   - Ingen kategorikolonne — etiket og tal (P3; kategorier er spor 3).
 */

import type { ImportResultat, Raekke, Tabel } from "@/lib/importEngine";

export type GitterRaekke = {
  raekkeIndex: number;
  etiket: string;
  vaerdier: (number | null)[];
  medtag: boolean;
  /** Hvorfor motoren tvivler — eller bevaret fritekst fra en tekstkolonne. */
  bemaerkning: string | null;
  /** Nærmeste sektionsoverskrift over rækken i samme tabel. */
  sektion: string | null;
  tabelIndex: number;
};

export type StrukturNote = {
  raekkeIndex: number;
  etiket: string;
  slags: "sektion" | "subtotal";
  daekker?: number[];
  tabelIndex: number;
};

export type Gitter = {
  /** Kolonnenavne uden etiketkolonnen. */
  kolonner: string[];
  raekker: GitterRaekke[];
  /** Subtotaler og sektioner — rammen der beviser at filen blev forstået. */
  struktur: StrukturNote[];
  advarsler: string[];
};

export type GitterOpsummering = {
  medtaget: number;
  fravalgt: number;
  medBemaerkning: number;
  /** Kolonnesummer over medtagne rækker; null når ingen medtaget værdi findes. */
  sum: (number | null)[];
};

// ───────────────────────── Byg ─────────────────────────

/** En tabels talfelter for en række: felter minus tekstkolonner (kommentarer
    er ikke tal), i bevaret rækkefølge. */
function talFelter(raekke: Raekke, tabel: Tabel) {
  return raekke.felter.filter((_, idx) => !tabel.tekstKolonner.includes(idx));
}

/** Rækkens bevarede fritekst fra tabellens tekstkolonner. */
function tekstIndhold(raekke: Raekke, tabel: Tabel): string | null {
  const tekster = tabel.tekstKolonner
    .map((idx) => raekke.felter[idx])
    .filter((f) => f != null && f.kilde !== "tom" && f.raa.trim() !== "")
    .map((f) => f.raa.trim());
  return tekster.length > 0 ? tekster.join(" · ") : null;
}

/** Tvivls-bemærkningen for en post (P1: rækken er ALTID med — bemærkningen
    forklarer, den fravælger ikke). */
function tvivl(felter: { vaerdi: number | null; kilde: string; raa: string }[]): string | null {
  const ulaeselige = felter.filter((f) => f.kilde === "ulaeselig");
  if (ulaeselige.length > 0) {
    const raa = [...new Set(ulaeselige.map((f) => f.raa.trim()).filter(Boolean))];
    return `Kunne ikke læses: ${raa.join(", ")}`;
  }
  if (felter.every((f) => f.vaerdi === null)) return "Ingen tal i denne linje";
  if (felter.length > 0 && felter.every((f) => f.vaerdi === 0)) return "Alle måneder er nul";
  return null;
}

/**
 * Bygger gitteret af motorens resultat. Kun poster bliver rækker; sektioner
 * og subtotaler lander i struktur. Flere tabeller flades til én liste med
 * tabelIndex bevaret; den bredeste tabel bestemmer kolonnetallet, og
 * smallere rækker efterfyldes med null.
 */
export function byggGitter(resultat: ImportResultat): Gitter {
  const raekker: GitterRaekke[] = [];
  const struktur: StrukturNote[] = [];

  // Bredeste tabel (talkolonner efter fradrag af tekstkolonner) sætter bredden.
  const tabelBredde = (t: Tabel): number =>
    t.raekker.reduce((m, r) => Math.max(m, talFelter(r, t).length), 0);
  const bredde = resultat.tabeller.reduce((m, t) => Math.max(m, tabelBredde(t)), 0);

  // Kolonnenavne: den bredeste tabel MED overskrifter vinder (uden
  // etiketkolonnen); manglende navne efterfyldes som "Kolonne N".
  let kolonner: string[] = [];
  let bedsteBredde = -1;
  for (const t of resultat.tabeller) {
    const b = tabelBredde(t);
    if (t.kolonneOverskrifter.length > 1 && b > bedsteBredde) {
      bedsteBredde = b;
      const uafskaaret = t.kolonneOverskrifter.slice(1);
      kolonner = uafskaaret
        .filter((_, idx) => !t.tekstKolonner.includes(idx))
        .map((k) => k.trim());
    }
  }
  kolonner = Array.from({ length: bredde }, (_, i) => {
    const navn = kolonner[i];
    return navn && navn !== "" ? navn : `Kolonne ${i + 1}`;
  });

  resultat.tabeller.forEach((tabel, tabelIndex) => {
    let aktuelSektion: string | null = null;
    for (const raekke of tabel.raekker) {
      if (raekke.type === "sektion") {
        aktuelSektion = raekke.etiket;
        struktur.push({
          raekkeIndex: raekke.raekkeIndex,
          etiket: raekke.etiket,
          slags: "sektion",
          tabelIndex,
        });
        continue;
      }
      if (raekke.type === "subtotal") {
        struktur.push({
          raekkeIndex: raekke.raekkeIndex,
          etiket: raekke.etiket,
          slags: "subtotal",
          daekker: raekke.daekker,
          tabelIndex,
        });
        continue;
      }
      if (raekke.type !== "post") continue; // stoej: hverken data eller ramme

      const felter = talFelter(raekke, tabel);
      const vaerdier = Array.from({ length: bredde }, (_, i) =>
        i < felter.length ? felter[i].vaerdi : null,
      );
      const bemaerkning = tvivl(felter) ?? tekstIndhold(raekke, tabel);

      raekker.push({
        raekkeIndex: raekke.raekkeIndex,
        etiket: raekke.etiket,
        vaerdier,
        medtag: true,
        bemaerkning,
        sektion: aktuelSektion,
        tabelIndex,
      });
    }
  });

  return { kolonner, raekker, struktur, advarsler: [...resultat.advarsler] };
}

// ───────────────────────── Mutationer (immutable) ─────────────────────────

const kopiGitter = (g: Gitter): Gitter => ({
  kolonner: [...g.kolonner],
  raekker: g.raekker.map((r) => ({ ...r, vaerdier: [...r.vaerdier] })),
  struktur: g.struktur.map((s) => ({ ...s, daekker: s.daekker ? [...s.daekker] : undefined })),
  advarsler: [...g.advarsler],
});

const opdaterRaekke = (
  gitter: Gitter,
  raekkeIndex: number,
  aendring: (r: GitterRaekke) => void,
): Gitter => {
  const ny = kopiGitter(gitter);
  const raekke = ny.raekker.find((r) => r.raekkeIndex === raekkeIndex);
  if (raekke) aendring(raekke);
  return ny;
};

export function saetMedtag(gitter: Gitter, raekkeIndex: number, medtag: boolean): Gitter {
  return opdaterRaekke(gitter, raekkeIndex, (r) => {
    r.medtag = medtag;
  });
}

export function saetVaerdi(
  gitter: Gitter,
  raekkeIndex: number,
  kolonne: number,
  vaerdi: number | null,
): Gitter {
  return opdaterRaekke(gitter, raekkeIndex, (r) => {
    if (kolonne >= 0 && kolonne < gitter.kolonner.length) r.vaerdier[kolonne] = vaerdi;
  });
}

export function saetEtiket(gitter: Gitter, raekkeIndex: number, etiket: string): Gitter {
  return opdaterRaekke(gitter, raekkeIndex, (r) => {
    r.etiket = etiket;
  });
}

/** Fjerner rækken helt. Enhver række kan slettes — også importerede
    (designdokumentet §5: slette-værnet på manual_-rækker er en død ende). */
export function slet(gitter: Gitter, raekkeIndex: number): Gitter {
  const ny = kopiGitter(gitter);
  ny.raekker = ny.raekker.filter((r) => r.raekkeIndex !== raekkeIndex);
  return ny;
}

/** Indsætter en tom række efter den angivne (eller sidst). Nye rækker får
    negative raekkeIndex så de aldrig kolliderer med matrix-indeks. */
export function tilfoejRaekke(gitter: Gitter, efterRaekkeIndex: number): Gitter {
  const ny = kopiGitter(gitter);
  const mindste = ny.raekker.reduce((m, r) => Math.min(m, r.raekkeIndex), 0);
  const pos = ny.raekker.findIndex((r) => r.raekkeIndex === efterRaekkeIndex);
  const nabo = pos >= 0 ? ny.raekker[pos] : ny.raekker[ny.raekker.length - 1];
  const raekke: GitterRaekke = {
    raekkeIndex: Math.min(-1, mindste - 1),
    etiket: "",
    vaerdier: Array.from({ length: ny.kolonner.length }, () => null),
    medtag: true,
    bemaerkning: null,
    sektion: nabo?.sektion ?? null,
    tabelIndex: nabo?.tabelIndex ?? 0,
  };
  ny.raekker.splice(pos >= 0 ? pos + 1 : ny.raekker.length, 0, raekke);
  return ny;
}

// ───────────────────────── Opsummering ─────────────────────────

export function opsummer(gitter: Gitter): GitterOpsummering {
  const medtagne = gitter.raekker.filter((r) => r.medtag);
  const sum: (number | null)[] = gitter.kolonner.map((_, kolonne) => {
    let harVaerdi = false;
    let total = 0;
    for (const r of medtagne) {
      const v = r.vaerdier[kolonne];
      if (v !== null && v !== undefined) {
        harVaerdi = true;
        total += v;
      }
    }
    return harVaerdi ? total : null;
  });

  return {
    medtaget: medtagne.length,
    fravalgt: gitter.raekker.length - medtagne.length,
    medBemaerkning: gitter.raekker.filter((r) => r.bemaerkning !== null).length,
    sum,
  };
}

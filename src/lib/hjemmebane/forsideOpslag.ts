/**
 * src/lib/hjemmebane/forsideOpslag.ts
 *
 * Dommene bag forsidens «Fra fællesskabet» (BoardroomView) — rene
 * funktioner, ingen React, ingen Supabase. Testet i
 * __tests__/forsideOpslag.test.ts.
 *
 * Jonas 3/9: sektionen var «tam — det skal lave noget mere larm, så folk
 * får lyst til at bruge Community». Husets mønster for vægt (målt i
 * recon-forsidesektionen §5) er konsekvent: ÉT element får vægt, resten
 * er rolige rækker — «Kommende» giver dagen i editorial 30 px, «Fra os
 * til dig» giver hovedhistorien fuld bredde i det eneste hvide kort og
 * resten som rammeløse tiles. Her får det NYESTE opslag kortet; de to
 * næste bliver rækker som før.
 *
 * NYESTE = senest OPRETTET (created_at), ikke feedets orden. Feedet
 * (get_community_feed) sorterer fastgjorte først og derefter på seneste
 * aktivitet — et gammelt opslag med et nyt svar ville stå øverst, og et
 * fastgjort altid. Forsidens ærinde er at vise at der SKER noget nyt, så
 * det er oprettelsen der tæller. De to rækker under kortet følger
 * feedets egen orden (fastgjort, seneste aktivitet), som i dag.
 */

import { parseCommunityDokument, type CommunityNode } from "./communityDokument";

/** Det forsiden læser af en feed-række — et snit af CommunityTraad. */
export interface ForsideTraad {
  id: string;
  created_at: string;
}

export interface ForsideOpslag<T extends ForsideTraad> {
  /** Det senest oprettede opslag — kortet. Null kun når listen er tom. */
  fremhaevet: T | null;
  /** De næste (højst to) i feedets egen orden, uden det fremhævede. */
  resten: T[];
}

/** Hvor mange rækker der står under kortet. Tre synlige i alt, som før. */
export const ANTAL_RAEKKER = 2;

export function vaelgForsideOpslag<T extends ForsideTraad>(traade: readonly T[]): ForsideOpslag<T> {
  if (traade.length === 0) return { fremhaevet: null, resten: [] };
  let fremhaevet = traade[0];
  for (const t of traade) {
    // Streng-sammenligning af ISO-tidsstempler er ordnet; ved lighed
    // vinder den der står først i feedet (fastgjort/seneste aktivitet).
    if (t.created_at > fremhaevet.created_at) fremhaevet = t;
  }
  const resten = traade.filter((t) => t.id !== fremhaevet.id).slice(0, ANTAL_RAEKKER);
  return { fremhaevet, resten };
}

/**
 * Stien til opslagets første billede — eller null. Går gennem
 * parseCommunityDokument, så kun en HVIDLISTET sti (uuid-mappe, kendt
 * endelse, ingen «..», ingen «:») kan nå frem; alt andet er null. Billeder
 * er blokke (roden, listItem, blockquote), så træet gås rekursivt.
 */
export function foersteBilledsti(indholdJson: unknown): string | null {
  const find = (noder: CommunityNode[]): string | null => {
    for (const node of noder) {
      if (node.type === "image") return node.path;
      if ("content" in node) {
        const fundet = find(node.content);
        if (fundet !== null) return fundet;
      }
    }
    return null;
  };
  return find(parseCommunityDokument(indholdJson));
}

/** «3 svar · 1 reaktion · I går» — samme tællere som feedet, samme ord. */
export function opslagMetaLinje(antalSvar: number, antalReaktioner: number, relativTid: string): string {
  const svar = `${antalSvar} svar`;
  const reaktioner = `${antalReaktioner} ${antalReaktioner === 1 ? "reaktion" : "reaktioner"}`;
  return [svar, reaktioner, relativTid].join(" · ");
}

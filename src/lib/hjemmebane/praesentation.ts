/**
 * src/lib/hjemmebane/praesentation.ts
 *
 * Præsentationen som onboarding-ritual (11/9-2026, kort 60): et nyt medlem
 * præsenterer sig i fællesskabet med ét opslag, og tjeklisten krydser af
 * når opslaget findes. Ren funktion — ingen React, ingen Supabase.
 * Testet i __tests__/praesentation.test.ts.
 *
 * BESLUTTET 11/9:
 *   - Tråden bærer kilde_type 'praesentation' uden kilde-id. Værdien er
 *     låst af CHECK'erne i migration 20260911120000_praesentation_kilde.sql;
 *     testen læser migrationen og fejler hvis de to ikke stemmer.
 *   - Skabelonen forudfyldes FRA profilens tre felter (netvaerksprofil.ts)
 *     og skriver IKKE tilbage til profilen. Etiketterne importeres — de
 *     kopieres ikke, så et etiketskift i profilen følger med herind.
 *   - Tråden går ud som ethvert opslag (notify-community-opslag uændret).
 *   - «Gjort» = en tråd med kilde_type 'praesentation' og status 'aktiv'
 *     (dommen bor i onboardingTjekliste.ts; tællingen i
 *     useOnboardingTjekliste.ts). Aktiv, fordi punktet handler om at blive
 *     set: en skjult tråd ses ikke, og RLS viser medlemmet kun aktive.
 *
 * DOKUMENTFORMEN er præcis den, parseCommunityDokument (communityDokument.ts)
 * accepterer og CommunityComposer producerer: rod { type: "doc" }, blokke
 * heading (level 2) og paragraph, inline text. opret_community_traad
 * afviser alt hvis rod ikke er "doc" (20260811190000:109). Et tomt felt
 * giver et TOMT afsnit — en linje medlemmet kan skrive i; ved visning
 * fjerner parseren tomme afsnit stille, så et ubesvaret spørgsmål står
 * som overskrift alene.
 */

import { PROFIL_FELTER, type ProfilFeltNoegle } from "./netvaerksprofil";

/** Værdien i community_traade.kilde_type. Skal stå ordret i begge CHECK'er
    i migrationen (kildeværn i testen). */
export const KILDE_PRAESENTATION = "praesentation";

/** Tagget i feedet for en tråd med kilde_type 'praesentation'. */
export const KILDE_PRAESENTATION_LABEL = "Præsentation";

/** Query-parameteren CommunityView læser for at åbne composeren med skabelonen. */
export const PRAESENTATION_PARAM = "praesentation";

/** Tjeklistepunktets sti: composeren forudfyldt. */
export const PRAESENTATION_STI = `/community?${PRAESENTATION_PARAM}=1`;

export interface PraesentationsInput {
  /** profiles.full_name — findes altid (handle_new_user). */
  navn: string | null | undefined;
  /** companies.name (useAuth.companyName). */
  virksomhed: string | null | undefined;
  /** companies.description — «Det laver vi». */
  detLaverVi: string | null | undefined;
  /** member_profiles.ask_me_about — «Det har jeg været igennem». */
  detHarJegVaeretIgennem: string | null | undefined;
  /** member_profiles.working_on — «Det leder jeg efter». */
  detLederJegEfter: string | null | undefined;
}

/** Tiptap-JSON i den snævre form skabelonen bruger. */
export type PraesentationsNode =
  | { type: "heading"; attrs: { level: 2 }; content: { type: "text"; text: string }[] }
  | { type: "paragraph"; content?: { type: "text"; text: string }[] };

export interface PraesentationsDokument {
  type: "doc";
  content: PraesentationsNode[];
}

export interface PraesentationsSkabelon {
  titel: string;
  indholdJson: PraesentationsDokument;
}

const trimEllerNull = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

/** «Hej, jeg er {navn} fra {virksomhed}». Mangler virksomheden: «Hej, jeg er
    {navn}». Mangler navnet (bør ikke ske — full_name sættes ved signup):
    «Hej fra {virksomhed}», og mangler begge: «Hej». Ingen streng med to
    mellemrum eller et hængende «fra». */
export function praesentationsTitel(navn: string | null | undefined, virksomhed: string | null | undefined): string {
  const n = trimEllerNull(navn);
  const v = trimEllerNull(virksomhed);
  if (n && v) return `Hej, jeg er ${n} fra ${v}`;
  if (n) return `Hej, jeg er ${n}`;
  if (v) return `Hej fra ${v}`;
  return "Hej";
}

/** Svaret under hvert spørgsmål: et afsnit med teksten, eller et tomt
    afsnit (en linje at skrive i) når feltet er tomt. */
function svarAfsnit(tekst: string | null): PraesentationsNode {
  return tekst === null ? { type: "paragraph" } : { type: "paragraph", content: [{ type: "text", text: tekst }] };
}

export function byggPraesentationsSkabelon(input: PraesentationsInput): PraesentationsSkabelon {
  const svar: Record<ProfilFeltNoegle, string | null> = {
    det_laver_vi: trimEllerNull(input.detLaverVi),
    vaeret_igennem: trimEllerNull(input.detHarJegVaeretIgennem),
    leder_efter: trimEllerNull(input.detLederJegEfter),
  };
  // Rækkefølgen er PROFIL_FELTER's — samme orden som på profilen.
  const content: PraesentationsNode[] = PROFIL_FELTER.flatMap((felt) => [
    { type: "heading" as const, attrs: { level: 2 as const }, content: [{ type: "text" as const, text: felt.label }] },
    svarAfsnit(svar[felt.noegle]),
  ]);
  return {
    titel: praesentationsTitel(input.navn, input.virksomhed),
    indholdJson: { type: "doc", content },
  };
}

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
 *     og skriver IKKE tilbage til profilen.
 *
 * UDEN OVERSKRIFTER (Jonas 16/9, DE TYVE (18)): «Jeg synes faktisk
 * overskrifter er lidt dårlige: Det laver vi / Det har jeg været igennem /
 * Det leder jeg efter. Vi skal passe på vi ikke sætter tingene for meget i
 * bås. Det er fint at inspirere, men vi skal ikke gøre sådan, at de ikke
 * skriver det de har lyst til.» Og: «Intet krav, kun eksemplerne.» Derfor:
 *   - Brødteksten er profilens udfyldte felter som ALMINDELIGE afsnit —
 *     uden overskrifter, uden etiketter — i PROFIL_FELTER's rækkefølge,
 *     kun de ikke-tomme, trimmet. Et udgangspunkt hun kan rette i. Er
 *     intet udfyldt: ét tomt afsnit. Titlen er uændret.
 *   - Inspirationen (PRAESENTATION_INSPIRATION, Jonas' valg A) er
 *     composerens grå placeholder — KUN på præsentationsvejen
 *     (CommunityView sender den som `placeholder`-prop), kun når
 *     editoren er tom (Tiptaps Placeholder-extension, husets stil i
 *     index.css). Den er ikke indhold: den står aldrig i indholdJson.
 *   - Ansøgningens tekster bruges aldrig (Jonas 14/9). Intet krav: «Del»
 *     og submit-reglerne er uændrede.
 *   - Tråden går ud som ethvert opslag (notify-community-opslag uændret).
 *   - «Gjort» = en tråd med kilde_type 'praesentation' og status 'aktiv'
 *     (dommen bor i onboardingTjekliste.ts; tællingen i
 *     useOnboardingTjekliste.ts). Aktiv, fordi punktet handler om at blive
 *     set: en skjult tråd ses ikke, og RLS viser medlemmet kun aktive.
 *
 * DOKUMENTFORMEN er præcis den, parseCommunityDokument (communityDokument.ts)
 * accepterer og CommunityComposer producerer: rod { type: "doc" }, blokke
 * paragraph, inline text. opret_community_traad afviser alt hvis rod ikke
 * er "doc" (20260811190000:109). Det tomme afsnit (ingen felter udfyldt)
 * er en linje medlemmet kan skrive i; ved visning fjerner parseren tomme
 * afsnit stille — men tomt kan ikke sendes (composerens submit kræver
 * tekst), så det når aldrig feedet.
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

/**
 * Inspirationslinjen (Jonas' valg A, 16/9) — composerens placeholder på
 * præsentationsvejen. Ét sted; ikke indhold (aldrig i indholdJson).
 */
export const PRAESENTATION_INSPIRATION =
  "Fortæl med dine egne ord, hvem du er — fx hvad I laver, hvad der fylder lige nu, eller hvad du gerne vil have ud af netværket.";

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

/** Tiptap-JSON i den snævre form skabelonen bruger: kun afsnit (ingen overskrifter, 16/9). */
export type PraesentationsNode = { type: "paragraph"; content?: { type: "text"; text: string }[] };

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

export function byggPraesentationsSkabelon(input: PraesentationsInput): PraesentationsSkabelon {
  const svar: Record<ProfilFeltNoegle, string | null> = {
    det_laver_vi: trimEllerNull(input.detLaverVi),
    vaeret_igennem: trimEllerNull(input.detHarJegVaeretIgennem),
    leder_efter: trimEllerNull(input.detLederJegEfter),
  };
  // Rækkefølgen er PROFIL_FELTER's — samme orden som på profilen. Kun de
  // udfyldte, som almindelige afsnit uden overskrift eller etiket (16/9).
  const afsnit: PraesentationsNode[] = PROFIL_FELTER.flatMap((felt) => {
    const tekst = svar[felt.noegle];
    return tekst === null ? [] : [{ type: "paragraph" as const, content: [{ type: "text" as const, text: tekst }] }];
  });
  // Intet udfyldt: ét tomt afsnit — en linje at skrive i, med inspirationen som placeholder.
  const content: PraesentationsNode[] = afsnit.length > 0 ? afsnit : [{ type: "paragraph" }];
  return {
    titel: praesentationsTitel(input.navn, input.virksomhed),
    indholdJson: { type: "doc", content },
  };
}

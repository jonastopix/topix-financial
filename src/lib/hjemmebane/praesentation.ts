/**
 * src/lib/hjemmebane/praesentation.ts
 *
 * Præsentationen som onboarding-ritual (11/9-2026, kort 60): et nyt medlem
 * præsenterer sig i fællesskabet med ét opslag, og tjeklisten krydser af
 * når opslaget findes. Rene konstanter — ingen React, ingen Supabase.
 * Testet i __tests__/praesentation.test.ts; kildeværn i
 * __tests__/praesentationPladsholder.guard.test.ts.
 *
 * BESLUTTET 11/9:
 *   - Tråden bærer kilde_type 'praesentation' uden kilde-id. Værdien er
 *     låst af CHECK'erne i migration 20260911120000_praesentation_kilde.sql;
 *     testen læser migrationen og fejler hvis de to ikke stemmer.
 *
 * UDEN FORESLÅET TEKST (Jonas 16/9): «Jeg synes ikke vi skal komme med
 * forslag til tekst. De skal præsentere sig som de har lyst til. Det gør
 * det mere personligt.» Derfor:
 *   - Composeren på præsentationsvejen (/community?praesentation=1, tjeklistens
 *     punkt) starter TOM: ingen titel på forhånd, ingen afsnit fra profilen,
 *     ingen eksempler. Profilen læses ikke — CommunityView henter hverken
 *     member_profiles eller companies.description.
 *   - Det eneste fladen siger er PRAESENTATION_PLADSHOLDER — composerens grå
 *     placeholder, KUN på præsentationsvejen (CommunityView sender den som
 *     `placeholder`-prop), kun når editoren er tom (Tiptaps
 *     Placeholder-extension, husets stil i index.css). Den er ikke indhold:
 *     den står aldrig i indholdJson og aldrig i titlen.
 *   - Tjeklisten (onboardingTjekliste.ts) og mail A (onboardingRytme.ts, begge
 *     spejle) lover ikke længere et udkast: «Et opslag om hvem du er.»
 *   - Tråden går ud som ethvert opslag (notify-community-opslag uændret).
 *   - «Gjort» = en tråd med kilde_type 'praesentation' og status 'aktiv'
 *     (dommen bor i onboardingTjekliste.ts; tællingen i
 *     useOnboardingTjekliste.ts). Aktiv, fordi punktet handler om at blive
 *     set: en skjult tråd ses ikke, og RLS viser medlemmet kun aktive.
 *
 * HISTORIK: fra 11/9 til 16/9 formiddag byggede denne fil et udkast
 * (byggPraesentationsSkabelon): titlen «Hej, jeg er {navn} fra {virksomhed}»
 * og profilens tre felter som afsnit (uden overskrifter fra 16/9, DE TYVE
 * (18)), med inspirationslinjen PRAESENTATION_INSPIRATION som placeholder.
 * Udkastet, titlen, inputtypen og importen af PROFIL_FELTER er slettet med
 * Jonas' beslutning 16/9 — profilen skrives aldrig til, og læses nu heller
 * ikke, på præsentationsvejen.
 */

/** Værdien i community_traade.kilde_type. Skal stå ordret i begge CHECK'er
    i migrationen (kildeværn i testen). */
export const KILDE_PRAESENTATION = "praesentation";

/** Tagget i feedet for en tråd med kilde_type 'praesentation'. */
export const KILDE_PRAESENTATION_LABEL = "Præsentation";

/** Query-parameteren CommunityView læser for at åbne composeren på præsentationsvejen. */
export const PRAESENTATION_PARAM = "praesentation";

/** Tjeklistepunktets sti: composeren tom, med pladsholderen. */
export const PRAESENTATION_STI = `/community?${PRAESENTATION_PARAM}=1`;

/**
 * Pladsholderen (Jonas 16/9) — composerens placeholder på præsentationsvejen.
 * Neutral, ingen eksempler. Ét sted; ikke indhold (aldrig i indholdJson).
 */
export const PRAESENTATION_PLADSHOLDER = "Fortæl med dine egne ord, hvem du er.";

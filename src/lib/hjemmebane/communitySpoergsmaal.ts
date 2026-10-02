/**
 * src/lib/hjemmebane/communitySpoergsmaal.ts
 *
 * Dommene bag rådgivernes «Spørgsmål» og filtret «Ubesvarede» i Community
 * (CommunityView) — rene funktioner, ingen React, ingen Supabase. Testet i
 * __tests__/communitySpoergsmaal.test.ts; kildeværnet
 * communitySpoergsmaal.guard.test.ts låser, at fladen dømmer HER.
 *
 * JONAS 2/10-2026 kl. 07:26: «Vi vil ikke tvinges til at stille et nyt
 * spørgsmål hver mandag, og det ville også gå ud over de opslag der kommer
 * fra medlemmerne, da de drukner. Vi skal opnå større aktivitet blandt
 * medlemmer, ikke kun større interaktion på rådgiveres spørgsmål. Men
 * rådgivere skal i stedet kunne lave et opslag og markere det, så det lægger
 * sig i toppen som et Spørgsmål. Det giver os større fleksibilitet.»
 * Målt 2/10: 16 af 29 læser Community, 2 opslag og 2 svar fra medlemmer på
 * 30 dage; 3 af 29 har «Spørg mig om».
 *
 * TRE REGLER:
 *   1. SPØRGSMÅLET er det ene opslag med spoergsmaal_markeret_at sat
 *      (migration 20261002243000: kolonnen, højst én række, kun rådgivere).
 *      Det ligger ØVERST, uden for strømmen. Er der mod forventning flere
 *      i svaret, vinder den senest markerede — fladen viser aldrig to.
 *      Et skjult opslag er ikke spørgsmålet (rådgiveren ser det i strømmen
 *      med «Skjult»-mærket som før).
 *   2. FOLDET: har læseren selv svaret (jeg_har_svaret fra RPC'en), vises
 *      spørgsmålet som én linje — det skal ikke blive ved med at fylde for
 *      den, der har gjort sit. Rådgiveren (forfatteren) ser det altid
 *      udfoldet: hun skal kunne se, hvad medlemmerne ser.
 *   3. UBESVAREDE = opslag fra MEDLEMMER uden ét eneste aktivt svar
 *      (antal_svar er trådens trigger-cache over aktive svar). Et opslag af
 *      en rådgiver er aldrig «ubesvaret» her — det er vores, og det venter
 *      ikke på os (forsidens «Ubesvarede opslag» dømmer rådgiverens side af
 *      samme sag: ubesvaredeOpslag.ts). Hvem der er rådgiver, læses af
 *      Netværkets is_advisor (get_member_directory, allerede hentet til
 *      medlemssporet) — fail-soft: kendes ingen rådgivere (hentningen
 *      fejlede), tæller alle opslag uden svar, hellere ét for mange end et
 *      medlems opslag skjult. En tjenestekonto (filtreret fra kataloget,
 *      tjenestekonto.ts) skriver aldrig opslag, så den optræder ikke her.
 *
 * FAIL-SOFT FØR MIGRATIONEN: spoergsmaal_markeret_at og jeg_har_svaret er
 * undefined i svaret → intet spørgsmål, intet foldet, strømmen som i dag.
 *
 * INTET ANDET FASTGØRES (Jonas 2/10): rådgivernes egne opslag uden markering
 * ligger i strømmen som alle andre (fastgjort-kolonnen har ingen flade og
 * røres ikke).
 */

/** Det dommen læser af en feed-række — et snit af CommunityTraad. */
export interface SpoergsmaalTraad {
  id: string;
  status: string;
  forfatter_id: string;
  antal_svar: number;
  /** undefined før migrationen er kørt (RPC'en returnerer ikke kolonnen). */
  spoergsmaal_markeret_at?: string | null;
  /** undefined før migrationen. */
  jeg_har_svaret?: boolean;
  /** Antal FORSKELLIGE personer med et aktivt svar, trådens forfatter
      fraregnet (migration 20261002243000). undefined før migrationen. */
  antal_svarere?: number;
}

export type FeedFilter = "alle" | "ubesvarede";

export const FILTER_ALLE_LABEL = "Alle";
export const FILTER_UBESVAREDE_LABEL = "Ubesvarede";

/** Fladens ord — ét sted, så testen og fladen siger det samme. */
export const SPOERGSMAAL_EYEBROW = "Spørgsmål fra rådgiverne";
export const SPOERGSMAAL_TAG = "Spørgsmål";
export const SPOERGSMAAL_UNDERLINJE = "Et svar kan være én linje.";
export const SPOERGSMAAL_SVAR_KNAP = "Svar";
export const SPOERGSMAAL_FOLDET_TEKST = "du har svaret";
export const MARKER_LABEL = "Markér som Spørgsmål";
export const MARKER_HJAELP = "Ligger øverst i feedet, indtil I fjerner markeringen. Højst ét ad gangen — en ny markering afløser den gamle.";
export const FJERN_MARKERING_LABEL = "Fjern Spørgsmål-markeringen";
export const MARKERING_FEJL_TITEL = "Opslaget er delt, men ikke markeret som Spørgsmål";
export const UBESVARET_MAERKE = "ubesvaret";
/** Tomt filter «Ubesvarede» — feedet er de seneste 30 opslag (hentFeed(30)), ikke alle;
    «alle har fået svar» ville påstå noget om opslag, fladen ikke har set. */
export const UBESVAREDE_TOM = "Ingen ubesvarede blandt de seneste opslag.";

/** Er rækken markeret som spørgsmål? undefined/null → nej. */
export function erSpoergsmaal(t: Pick<SpoergsmaalTraad, "spoergsmaal_markeret_at">): boolean {
  return typeof t.spoergsmaal_markeret_at === "string" && t.spoergsmaal_markeret_at !== "";
}

export interface DeltFeed<T extends SpoergsmaalTraad> {
  /** Det ene spørgsmål øverst — null uden markering (eller før migrationen). */
  spoergsmaal: T | null;
  /** Vises som én linje: læseren har svaret og er ikke forfatteren. */
  foldet: boolean;
  /** Resten i feedets egen orden, uden spørgsmålet. */
  stroem: T[];
}

/** Regel 1 og 2. */
export function delFeed<T extends SpoergsmaalTraad>(traade: readonly T[], mitUserId: string | null | undefined): DeltFeed<T> {
  let spoergsmaal: T | null = null;
  for (const t of traade) {
    if (t.status !== "aktiv" || !erSpoergsmaal(t)) continue;
    if (spoergsmaal === null || (t.spoergsmaal_markeret_at as string) > (spoergsmaal.spoergsmaal_markeret_at as string)) {
      spoergsmaal = t;
    }
  }
  const stroem = spoergsmaal === null ? [...traade] : traade.filter((t) => t.id !== spoergsmaal!.id);
  const foldet = spoergsmaal !== null && spoergsmaal.jeg_har_svaret === true && spoergsmaal.forfatter_id !== mitUserId;
  return { spoergsmaal, foldet, stroem };
}

/** Regel 3: et medlems aktive opslag uden ét aktivt svar. */
export function erUbesvaret(t: Pick<SpoergsmaalTraad, "status" | "forfatter_id" | "antal_svar">, raadgiverIds: ReadonlySet<string>): boolean {
  return t.status === "aktiv" && t.antal_svar === 0 && !raadgiverIds.has(t.forfatter_id);
}

export function filtrerStroem<T extends SpoergsmaalTraad>(stroem: readonly T[], filter: FeedFilter, raadgiverIds: ReadonlySet<string>): T[] {
  if (filter === "alle") return [...stroem];
  return stroem.filter((t) => erUbesvaret(t, raadgiverIds));
}

export function taelUbesvarede(stroem: readonly SpoergsmaalTraad[], raadgiverIds: ReadonlySet<string>): number {
  return stroem.filter((t) => erUbesvaret(t, raadgiverIds)).length;
}

/** Rådgiver-id'erne af Netværkets rækker (is_advisor) — fail-soft: tom mængde uden data. */
export function raadgiverIdsAf(profiler: readonly { user_id: string; is_advisor: boolean }[] | null | undefined): Set<string> {
  const ud = new Set<string>();
  for (const p of profiler ?? []) if (p.is_advisor) ud.add(p.user_id);
  return ud;
}

/** «Ubesvarede (3)» — tallet kun når det er over nul. */
export function ubesvaredeChipTekst(antal: number): string {
  return antal > 0 ? `${FILTER_UBESVAREDE_LABEL} (${antal})` : FILTER_UBESVAREDE_LABEL;
}

/** Svar-linjen på spørgsmålet. «N har svaret» er et antal PERSONER, så det
    læses af antal_svarere (RPC'ens count(DISTINCT forfatter_id) over aktive
    svar, trådens forfatter fraregnet) — aldrig af antal_svar, som tæller
    SVAR (også forfatterens egne). Mangler tallet (før migrationen, eller en
    ukendt værdi), siges det sande, vi har: «N svar» af antal_svar.
    «6 har svaret» / «1 har svaret» / «Ingen har svaret endnu»; ellers «6 svar» / «1 svar» / «Ingen svar endnu». */
export function harSvaretTekst(t: Pick<SpoergsmaalTraad, "antal_svar" | "antal_svarere">): string {
  const personer = t.antal_svarere == null ? NaN : Number(t.antal_svarere);
  if (Number.isFinite(personer)) {
    if (personer <= 0) return "Ingen har svaret endnu";
    return `${personer} har svaret`;
  }
  if (t.antal_svar <= 0) return "Ingen svar endnu";
  return `${t.antal_svar} svar`;
}

/** Må markér-knappen vises på trådsiden? Rådgiver, og enten eget opslag eller det allerede markerede (så enhver rådgiver kan fjerne den). */
export function visMarkerKnap(args: { erRaadgiver: boolean; erForfatter: boolean; erMarkeret: boolean; status: string }): boolean {
  if (!args.erRaadgiver) return false;
  if (args.status !== "aktiv") return false;
  return args.erForfatter || args.erMarkeret;
}

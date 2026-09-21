/**
 * supabase/functions/_shared/metaAdsToken.ts
 *
 * Tokenet til Metas MARKETING API (læsning af annoncer og forbrug) — ét sted,
 * fordi det lige nu har to mulige navne, og fordi den midlertidighed skal
 * kunne fjernes ét sted den dag, den er overflødig.
 *
 * ── HVORFOR TO NAVNE (19/9-2026) ────────────────────────────────────────────
 * Tokenet blev genereret med `ads_read` og godkendt af en anden administrator
 * — men det blev sat i Lovable under navnet META_CAPI_TOKEN. Værdien kan ikke
 * vises igen i Lovable, og et nyt token kræver en ny godkendelsesrunde hos
 * Morten. Derfor læser vi META_ADS_TOKEN først og falder tilbage på
 * META_CAPI_TOKEN.
 *
 * DET ER IKKE SJUSK — DET ER EN KENDT, MIDLERTIDIG GENVEJ, og den har en pris:
 * META_CAPI_TOKEN hører rettelig til Conversions API, som er et ANDET formål
 * (den SENDER hændelser til pixlen; denne HENTER vores egne annoncetal hjem).
 * De to bør ikke dele nøgle. Se README-punktet «Navnene bør ryddes op» i
 * ~/Downloads/recon-meta-annoncer/ og ~/Downloads/udkast-meta-capi/ §5.
 *
 * ── CONVERSIONS API HAR FÅET SIT EGET NAVN (21/9-2026 aften) ───────────────
 * Afsendelsen til Meta (meta-send-cron, _shared/metaSendAfsendelse.ts) læser
 * META_SEND_TOKEN — et NYT navn — og aldrig META_CAPI_TOKEN. Nødnavnet her
 * kolliderer derfor ikke længere med afsendelsen: META_CAPI_TOKEN kan blive
 * ved med at bære ads_read-tokenet, indtil META_ADS_TOKEN er sat og faldbacken
 * ryddes. Den dag META_CAPI_TOKEN sættes til noget andet, går Marketing API
 * i stå — så navnet skal stadig ryddes, bare ikke i aften.
 *
 * DET ER IKKE OVERLADT TIL HUKOMMELSEN: kildeværnet
 * src/lib/__tests__/metaTokenAdskillelse.guard.test.ts går RØDT, hvis
 * `_shared/metaCapi.ts` (det gamle udkasts navn) lander med faldbacken tilbage
 * (dom 4), og hvis afsendelsens filer nævner META_CAPI_TOKEN/META_ADS_TOKEN
 * eller denne fil nævner META_SEND_TOKEN (dom 6).
 */

/** Det rigtige navn. Sættes det, bruges det, og faldbacken er uden betydning. */
export const ADS_TOKEN_NAVN = "META_ADS_TOKEN";
/** Nødnavnet — midlertidigt, se filhovedet. */
export const ADS_TOKEN_NOEDNAVN = "META_CAPI_TOKEN";

export interface AdsToken {
  token: string | null;
  /** Hvilket secret-navn værdien kom fra — så loggen kan sige det højt. */
  navn: string | null;
}

/**
 * Marketing API-tokenet: det rigtige navn først, nødnavnet derefter.
 * Returnerer ALTID hvilket navn der blev brugt, så kalderen kan logge, at
 * genvejen er i brug — en midlertidighed, ingen kan se, bliver permanent.
 */
export function metaAdsToken(): AdsToken {
  const rigtigt = Deno.env.get(ADS_TOKEN_NAVN)?.trim() || null;
  if (rigtigt) return { token: rigtigt, navn: ADS_TOKEN_NAVN };
  const noed = Deno.env.get(ADS_TOKEN_NOEDNAVN)?.trim() || null;
  if (noed) return { token: noed, navn: ADS_TOKEN_NOEDNAVN };
  return { token: null, navn: null };
}

/** Teksten til svaret, når ingen af de to findes. Ét sted, så begge functions siger det samme. */
export const ADS_TOKEN_MANGLER =
  `Sæt ${ADS_TOKEN_NAVN} i Lovable → Cloud → Secrets. README §1 siger, hvor tokenet hentes i Meta Business. ` +
  `(Indtil videre accepteres også ${ADS_TOKEN_NOEDNAVN} — se _shared/metaAdsToken.ts.)`;

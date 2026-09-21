/**
 * webinarDeling — den RENE dom for private links til /webinar (udkast 21/9-2026,
 * ~/Downloads/udkast-webinar-deling/README.md). Spejlet ORDRET i
 * src/lib/webinar/deling.ts — enhver ændring her SKAL også laves der
 * (paritetstest src/lib/__tests__/webinarDashboard.paritet.test.ts). Nul imports.
 *
 * ET LINK ER ÉN RÆKKE PR. MODTAGER (Jonas 21/9): navn, hvem der oprettede det,
 * hvornår, udløb (standard 90 dage, kan forlænges) og om det er lukket. Tokenet
 * i linket gemmes KUN som SHA-256-aftryk (delingstokenAuth.ts siger hvorfor) og
 * vises i fladen ÉN gang ved oprettelsen. Dommen «aktiv · udløbet · lukket»
 * regnes HER, af rækken og `nu` — tiden gives ind, den gættes ikke.
 *
 * Hver visning og hver afvisning PÅ EN KENDT DELING står i sporet
 * (webinar_deling_spor, insert-only; deling_id NOT NULL). Et UKENDT token —
 * ugyldig form eller intet match — skrives ALDRIG i sporet (rettelse 21/9):
 * sporet kan ikke slettes, og uden rate-limit kunne en fremmed ellers fylde det
 * med rækker, der aldrig kan fjernes. Det står kun i functionens log (formen
 * gyldig/ugyldig, aldrig tokenet). Listen på rådgiverfladen udleder «sidst set»
 * og «antal visninger» af sporet (delingsOversigt) — et tal, vi ikke selv
 * sætter, er en observation.
 */

/** Standardudløb og loftet for en forlængelse (dage). */
export const STANDARD_DAGE = 90;
export const MAKS_DAGE = 365;

/** 32 tilfældige bytes som base64url = 43 tegn uden udfyldning (256 bit). */
export const TOKEN_FORM = /^[A-Za-z0-9_-]{43}$/;
export const TOKEN_BYTES = 32;
/** SHA-256 hex. */
export const AFTRYK_FORM = /^[0-9a-f]{64}$/;

export const DELT_STI = "/delt/webinar";
export const TOKEN_PARAM = "t";

export function erTokenForm(t: unknown): t is string {
  return typeof t === "string" && TOKEN_FORM.test(t);
}

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** base64url uden udfyldning — regnet selv, så Deno, browser og vitest giver samme streng. */
export function tilBase64Url(bytes: Uint8Array): string {
  let ud = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    ud += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63];
    ud += b === undefined ? "" : B64URL[(n >> 6) & 63];
    ud += c === undefined ? "" : B64URL[n & 63];
  }
  return ud;
}

/** Linket, som det sendes til modtageren. */
export function delingsUrl(appUrl: string, token: string): string {
  return `${appUrl}${DELT_STI}?${TOKEN_PARAM}=${token}`;
}

export type DelingsTilstand = "aktiv" | "udloebet" | "lukket";

export interface DelingsRaekke {
  id: string;
  navn: string;
  oprettet_at: string;
  udloeber_at: string;
  lukket_at: string | null;
}

/** Lukket vinder over udløbet; udløbet når udloeber_at er nået (inklusiv). */
export function delingsTilstand(r: Pick<DelingsRaekke, "udloeber_at" | "lukket_at">, nu: Date): DelingsTilstand {
  if (r.lukket_at !== null) return "lukket";
  const u = Date.parse(r.udloeber_at);
  if (!Number.isFinite(u) || u <= nu.getTime()) return "udloebet";
  return "aktiv";
}

/** Et helt antal dage, 1..MAKS_DAGE. */
export function erDageGyldige(d: unknown): d is number {
  return typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= MAKS_DAGE;
}

/** Udløbet `dage` dage efter `fra` (ISO). Forlængelse regnes fra det SENESTE af nu og det gamle udløb. */
export function udloebEfter(fra: Date, dage: number): string {
  return new Date(fra.getTime() + dage * 86_400_000).toISOString();
}

export function forlaengetUdloeb(gammeltUdloeb: string, dage: number, nu: Date): string {
  const g = Date.parse(gammeltUdloeb);
  const basis = Number.isFinite(g) && g > nu.getTime() ? new Date(g) : nu;
  return udloebEfter(basis, dage);
}

/** Sporets hændelser — alle på en KENDT deling. Der findes ingen «afvist_ukendt»: et ukendt token når aldrig sporet. */
export const SPOR_HAENDELSER = ["oprettet", "forlaenget", "lukket", "vist", "afvist_udloebet", "afvist_lukket"] as const;
export type SporHaendelse = (typeof SPOR_HAENDELSER)[number];

/** Afvisningens spor-hændelse for en KENDT deling — grunden står i sporet, aldrig i svaret. */
export function afvisningAf(t: "udloebet" | "lukket"): SporHaendelse {
  return t === "udloebet" ? "afvist_udloebet" : "afvist_lukket";
}

export interface SporRaekke {
  /** NOT NULL i basen — sporet kender altid sin deling. */
  deling_id: string;
  tidspunkt: string;
  haendelse: string;
}

export interface DelingsLinje extends DelingsRaekke {
  tilstand: DelingsTilstand;
  visninger: number;
  sidst_set: string | null;
}

/** Listen på rådgiverfladen: rækkerne + det, sporet siger (kun «vist» tæller). Nyeste først. */
export function delingsOversigt(delinger: readonly DelingsRaekke[], spor: readonly SporRaekke[], nu: Date): DelingsLinje[] {
  const set = new Map<string, { n: number; sidst: string | null }>();
  for (const s of spor) {
    if (s.haendelse !== "vist") continue;
    const h = set.get(s.deling_id) ?? { n: 0, sidst: null };
    h.n++;
    if (h.sidst === null || s.tidspunkt > h.sidst) h.sidst = s.tidspunkt;
    set.set(s.deling_id, h);
  }
  return [...delinger]
    .sort((a, b) => (a.oprettet_at < b.oprettet_at ? 1 : a.oprettet_at > b.oprettet_at ? -1 : 0))
    .map((d) => ({ ...d, tilstand: delingsTilstand(d, nu), visninger: set.get(d.id)?.n ?? 0, sidst_set: set.get(d.id)?.sidst ?? null }));
}

/** Periodevælgerens værdier — samme tre som annoncepriser.VindueValg (skrevet her, så filen er uden imports). */
export const VINDUE_VALG = ["daekning", "7dage", "30dage"] as const;
export function erVindueValg(v: unknown): v is (typeof VINDUE_VALG)[number] {
  return typeof v === "string" && (VINDUE_VALG as readonly string[]).includes(v);
}

/** Navnet på et link: 1–80 tegn efter trim. */
export function rensNavn(n: unknown): string | null {
  if (typeof n !== "string") return null;
  const s = n.trim().replace(/\s+/g, " ");
  return s.length >= 1 && s.length <= 80 ? s : null;
}

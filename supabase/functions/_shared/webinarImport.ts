/**
 * webinarImport — dommen bag engangsimporten fra eWebinars REST-API (udkast
 * 19/9-2026, ~/Downloads/udkast-ewebinar-import/README.md).
 *
 * ÉN PLUKKER, TO INDGANGE. Webhooken og importen skriver de SAMME to
 * tabeller, og derfor skal de plukke ens: `plukTilmelding` +
 * `fletTilmelding` i `_shared/webinarDom.ts` (urørt, spejlet i src/lib,
 * paritetstestet) er sandheden begge veje. Denne fil gør kun to ting:
 *
 *   somWebhookForm   REST-objektet oversat til webhookens feltnavne, så
 *                    plukkeren kan læse det. Navnene ER forskellige (målt
 *                    19/9 i api.ewebinar.com/docs/openapi.json, V2Registrant
 *                    vs. help/webhook's registrant-objekt):
 *                      REST `setId`        ≙ webhook `webinarId`
 *                      REST `registeredAt` ≙ webhook `registeredTime`
 *                      REST `optOut: bool` ≙ webhook `subscribed: "Subscribed"`
 *                      REST har firstName/lastName, webhook har også `name`
 *                    Felter REST måtte have UD OVER skemaet («additionalProperties:
 *                    true») røres ikke — de følger med videre til plukkeren og
 *                    til den rå log, så `findProcent` rammer procenten samme
 *                    sted som ved webhooken, uanset hvad den hedder.
 *   feltRapport      MÅLINGEN: hvilke nøgler API'et faktisk sender, med
 *                    typer, hvor mange der har værdi, og et eksempel — plus
 *                    hvilke af dem vi IKKE bruger endnu. Det er den rapport
 *                    README §2 beder Jonas indsætte.
 *
 * INGEN DUBLETTER: nøglen er `ewebinar_id` = registrantens `id`, det samme
 * felt begge veje (webhook-eksemplets `id` og `attendeeId` er ens; REST's
 * `/registrants/{id}` kalder det «Registrant short ID»). Importen læser den
 * eksisterende række og fletter med `fletTilmelding` — den nye værdi vinder,
 * null overskriver aldrig, og procenten går ALDRIG ned. En import efter en
 * webhook-hændelse kan derfor ikke sænke det vi allerede ved. Er id-rummene
 * mod forventning forskellige, opdages det som «alle er nye» i rapporten —
 * README §6 siger hvad Jonas skal se efter.
 *
 * Ingen Deno- eller Supabase-afhængighed: testes i vitest fra
 * src/lib/__tests__/webinarImport.test.ts.
 */
import { plukTilmelding, type Pluk, type WebinarTilmelding } from "./webinarDom.ts";

/** REST-feltnavne oversat til webhookens, så én plukker kan læse begge. */
export function somWebhookForm(raa: Record<string, unknown>): Record<string, unknown> {
  const ud: Record<string, unknown> = { ...raa };
  if (ud.webinarId === undefined && ud.setId !== undefined) ud.webinarId = ud.setId;
  if (ud.registeredTime === undefined && ud.registeredAt !== undefined) ud.registeredTime = ud.registeredAt;
  if (ud.subscribed === undefined && typeof ud.optOut === "boolean") ud.subscribed = ud.optOut ? "Unsubscribed" : "Subscribed";
  return ud;
}

/** Plukker en REST-registrant med webhookens egen plukker. */
export function plukRestRegistrant(raa: unknown): Pluk {
  if (!raa || typeof raa !== "object" || Array.isArray(raa)) return plukTilmelding(raa);
  return plukTilmelding(somWebhookForm(raa as Record<string, unknown>));
}

/** Nøgler plukkeren allerede bruger (begge navnesæt) — resten er «ukendte» i rapporten. */
export const KENDTE_NOEGLER: readonly string[] = [
  "id", "attendeeId", "email", "name", "firstName", "lastName",
  "webinarId", "setId", "webinarTitle",
  "sessionTime", "sessionType",
  "registeredTime", "registeredAt",
  "state", "action", "attended", "subscribed", "optOut",
];

export interface FeltLinje {
  noegle: string;
  /** JSON-typerne set for nøglen: string · number · boolean · object · array · null. */
  typer: string[];
  /** Hvor mange registranter der HAR nøglen. */
  antal: number;
  /** Hvor mange der har en værdi der ikke er null/""/[]. */
  ikkeTomme: number;
  /** Første ikke-tomme værdi, klippet — så rapporten kan læses. */
  eksempel: string | null;
  /** true når `plukTilmelding` ikke bruger nøglen i dag. */
  ukendt: boolean;
  /** true når navnet ligner et procentfelt (samme regel som findProcent). */
  procentKandidat: boolean;
}

export interface FeltRapport {
  registranter: number;
  linjer: FeltLinje[];
  /** Nøglerne der ligner en procent OG bærer et læsbart 0–100-tal. */
  procentFundet: string[];
  /** Nøgler vi ikke bruger endnu — kandidater til næste version af plukkeren. */
  ukendteNoegler: string[];
}

const PROCENT_NOEGLE = /watched|percent|pct/i;
const PROCENT_NOEGLE_IKKE = /link|url|time|date/i;

function typeAf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function erTom(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

function tilTekst(v: unknown, maks = 120): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return (s ?? "").length > maks ? `${(s ?? "").slice(0, maks)}…` : (s ?? "");
}

/**
 * MÅLINGEN: hvad sender API'et egentlig? Kører over de hentede registranter
 * (eller én enkelt) og opgør hver nøgle. Kigger også ét niveau ned i
 * objekter — procenten kan ligge i fx `properties.total_watched_percent`.
 */
export function feltRapport(registranter: readonly Record<string, unknown>[]): FeltRapport {
  const samlet = new Map<string, { typer: Set<string>; antal: number; ikkeTomme: number; eksempel: string | null }>();

  const tael = (noegle: string, vaerdi: unknown) => {
    const linje = samlet.get(noegle) ?? { typer: new Set<string>(), antal: 0, ikkeTomme: 0, eksempel: null };
    linje.typer.add(typeAf(vaerdi));
    linje.antal++;
    if (!erTom(vaerdi)) {
      linje.ikkeTomme++;
      if (linje.eksempel === null) linje.eksempel = tilTekst(vaerdi);
    }
    samlet.set(noegle, linje);
  };

  for (const r of registranter) {
    if (!r || typeof r !== "object") continue;
    for (const [k, v] of Object.entries(r)) {
      tael(k, v);
      if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) tael(`${k}.${k2}`, v2);
      }
    }
  }

  const linjer: FeltLinje[] = [...samlet.entries()]
    .map(([noegle, l]) => {
      const sidsteLed = noegle.includes(".") ? noegle.slice(noegle.lastIndexOf(".") + 1) : noegle;
      return {
        noegle,
        typer: [...l.typer].sort(),
        antal: l.antal,
        ikkeTomme: l.ikkeTomme,
        eksempel: l.eksempel,
        ukendt: !KENDTE_NOEGLER.includes(noegle),
        procentKandidat: PROCENT_NOEGLE.test(sidsteLed) && !PROCENT_NOEGLE_IKKE.test(sidsteLed),
      };
    })
    .sort((a, b) => a.noegle.localeCompare(b.noegle));

  return {
    registranter: registranter.length,
    linjer,
    procentFundet: linjer.filter((l) => l.procentKandidat && l.ikkeTomme > 0).map((l) => l.noegle),
    ukendteNoegler: linjer.filter((l) => l.ukendt).map((l) => l.noegle),
  };
}

/** Rapporten som en markdown-tabel — klar til at klistre ind i README §2. */
export function feltRapportSomMarkdown(rapport: FeltRapport): string {
  const linjer = [
    `| felt | type(r) | har værdi | eksempel | bruges i dag |`,
    `|---|---|---|---|---|`,
    ...rapport.linjer.map((l) =>
      `| \`${l.noegle}\` | ${l.typer.join(" / ")} | ${l.ikkeTomme}/${rapport.registranter} | ${(l.eksempel ?? "—").replace(/\|/g, "\\|")} | ${l.ukendt ? (l.procentKandidat ? "**NEJ — procent-kandidat**" : "nej") : "ja"} |`,
    ),
  ];
  return linjer.join("\n");
}

// ── Importens rapport ──────────────────────────────────────────────────────

export type RaekkeUdfald = "ny" | "opdateret" | "uaendret" | "sprunget_over";

export interface ImportRaekke {
  ewebinarId: string | null;
  email: string | null;
  webinarId: string | null;
  udfald: RaekkeUdfald;
  /** Kun ved sprunget_over: uden_id · uden_email · uden_webinar_id · ikke_et_objekt. */
  grund?: string;
  procent?: number | null;
}

/**
 * Er den flettede række forskellig fra den vi havde? Afgør «opdateret» vs.
 * «uaendret» i rapporten — så en anden kørsel af importen kan vise at den
 * ikke ændrede noget (idempotensen, bevist i tallene og ikke bare påstået).
 */
export function erForskellig(foer: WebinarTilmelding | null, efter: WebinarTilmelding): boolean {
  if (!foer) return true;
  for (const noegle of Object.keys(efter) as Array<keyof WebinarTilmelding>) {
    if (foer[noegle] !== efter[noegle]) return true;
  }
  return false;
}

/** Nøglerne sorteret, så to ens objekter altid giver samme tekst (og samme aftryk). */
export function kanoniskJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(kanoniskJson).join(",")}]`;
  const poster = Object.entries(v as Record<string, unknown>)
    .filter(([, vv]) => vv !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${poster.map(([k, vv]) => `${JSON.stringify(k)}:${kanoniskJson(vv)}`).join(",")}}`;
}

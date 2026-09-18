/**
 * src/lib/ventelisteDom.ts
 *
 * Spejlet ordret i supabase/functions/_shared/ventelisteDom.ts — enhver
 * ændring her SKAL også laves der (paritetstest i
 * src/lib/__tests__/ventelisteDomParitet.test.ts). Nul imports; `nu` gives
 * altid udefra.
 *
 * VENTELISTEN (udkast 18/9-2026): et nej på NICHEN bliver til en plads i
 * køen. Jonas (ordret): «Faktisk snakker vi ikke om branche. Men om niche.
 * De skal decideret jagte samme kunder… Derfor er vi nødt til menneskeligt
 * at vurdere det hver gang.» Derfor peger en venteplads på DEN KONKRETE
 * VIRKSOMHED (company_id), ansøgeren venter på — ikke en branche — med en
 * linje om hvorfor.
 *
 * REGLERNE:
 *   - Pladsen er LEDIG når fornyelsesdommen (src/lib/fornyelse.ts) siger
 *     at medlemskabet er slut: «tilbyd ikke» besluttet (klar_til_afsked /
 *     udloebet_tilbyd_ikke), eller de 14 dage efter slutdatoen er gået uden
 *     svar (udloebet_vindue_lukket). «ophoert» (udløbet uden beslutning)
 *     regnes OGSÅ som ledig — se README (åbent punkt til Jonas).
 *   - Der går INGEN mail af sig selv: rådgiverne får en linje på forsiden
 *     («Homie er ude. Nordic Byg har ventet siden 3. maj — tilbyd pladsen?»).
 *     Mennesket trykker. Derefter kører køen selv.
 *   - ANCIENNITET afgør rækkefølgen: hvornår de blev afvist
 *     (ansoegninger.lukket_at); mangler den, hvornår de kom på listen.
 *   - Første i køen får tilbuddet og SVARFRIST_DAGE = 7 dage; svarer de
 *     ikke, går det videre til den næste (trappen «venteplads» i A's kø).
 *   - Afvist for mere end BLOED_EFTER_MAANEDER = 12 måneder siden: den bløde
 *     udgave («Vi har en plads nu — er det stadig aktuelt?»).
 *   - En ansøger kan stå i flere køer og forsvinder fra dem alle, når de
 *     siger ja ét sted (status «trukket» på de andre).
 */

export const SVARFRIST_DAGE = 7;
export const BLOED_EFTER_MAANEDER = 12;

/** Fornyelsestilstande hvor pladsen regnes som ledig (src/lib/fornyelse.ts FornyelseStatus). */
export const LEDIG_VED_FORNYELSESSTATUS = [
  "klar_til_afsked",
  "udloebet_tilbyd_ikke",
  "udloebet_vindue_lukket",
  "ophoert",
] as const;

export type VentepladsStatus = "venter" | "tilbudt" | "accepteret" | "udloebet" | "afslaaet" | "trukket";
/** Alle statusser som liste — enum-værnet (enumsMatcherDatabasen.guard) holder den op mod ventepladser_status_check. */
export const VENTEPLADS_STATUSSER: readonly VentepladsStatus[] = ["venter", "tilbudt", "accepteret", "udloebet", "afslaaet", "trukket"];

export interface VentepladsRaekke {
  id: string;
  ansoegning_id: string;
  company_id: string;
  status: VentepladsStatus;
  /** Hvornår de kom på listen. */
  sat_at: string;
  /** ansoegninger.lukket_at — ancienniteten. Null når ansøgningen ikke er lukket (bør ikke ske). */
  afvist_at: string | null;
}

const MS_PR_DAG = 86_400_000;

function tid(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Er pladsen ledig ifølge fornyelsesdommen? */
export function erPladsLedig(fornyelseStatus: string): boolean {
  return (LEDIG_VED_FORNYELSESSTATUS as readonly string[]).includes(fornyelseStatus);
}

/** Ancienniteten: afvist_at, ellers sat_at. Ulæselig = sidst i køen. */
export function anciennitet(r: Pick<VentepladsRaekke, "afvist_at" | "sat_at">): number {
  return tid(r.afvist_at) ?? tid(r.sat_at) ?? Number.POSITIVE_INFINITY;
}

/** Køen for én virksomhed: kun «venter», ældst afvist først; ved lige: sat_at, så id (stabilt). */
export function sorterKoe(raekker: readonly VentepladsRaekke[]): VentepladsRaekke[] {
  return raekker
    .filter((r) => r.status === "venter")
    .slice()
    .sort((a, b) => anciennitet(a) - anciennitet(b) || (tid(a.sat_at) ?? 0) - (tid(b.sat_at) ?? 0) || a.id.localeCompare(b.id));
}

/** Den næste der skal have tilbuddet — null når køen er tom. */
export function naesteIKoen(raekker: readonly VentepladsRaekke[]): VentepladsRaekke | null {
  return sorterKoe(raekker)[0] ?? null;
}

/** Har virksomheden allerede et tilbud ude (status «tilbudt»)? Så skal der ikke tilbydes igen. */
export function harTilbudUde(raekker: readonly VentepladsRaekke[]): boolean {
  return raekker.some((r) => r.status === "tilbudt");
}

/** Den bløde udgave når afvisningen er mere end 12 måneder gammel (kalendermåneder, UTC). */
export function erBloedUdgave(afvistAt: string | null, nu: Date): boolean {
  const t = tid(afvistAt);
  if (t === null) return false;
  const graense = new Date(Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth() - BLOED_EFTER_MAANEDER, nu.getUTCDate(), nu.getUTCHours(), nu.getUTCMinutes(), nu.getUTCSeconds()));
  return t < graense.getTime();
}

/** Svarfristen: SVARFRIST_DAGE × 24 timer fra tilbuddet — det køens dag 7-række også lander på (samme dag, kl. 10 dansk). */
export function svarfristFra(tilbudtAt: Date): Date {
  return new Date(tilbudtAt.getTime() + SVARFRIST_DAGE * MS_PR_DAG);
}

export type Svarudfald = "accepteret" | "afslaaet";

/**
 * Hvad der sker med ALLE ansøgerens ventepladser når de svarer ét sted:
 * ja → den ene «accepteret», resten «trukket» (de er ude af alle køer);
 * nej → kun den ene «afslaaet», resten venter videre.
 */
export function afgoerSvar(
  raekker: readonly VentepladsRaekke[],
  svaretPaa: string,
  udfald: Svarudfald,
): Array<{ id: string; status: VentepladsStatus }> {
  const ud: Array<{ id: string; status: VentepladsStatus }> = [];
  for (const r of raekker) {
    if (r.id === svaretPaa) {
      if (r.status === "tilbudt") ud.push({ id: r.id, status: udfald });
      continue;
    }
    if (udfald === "accepteret" && (r.status === "venter" || r.status === "tilbudt")) ud.push({ id: r.id, status: "trukket" });
  }
  return ud;
}

// ── Forsidelinjen ────────────────────────────────────────────────────

const MAANEDER = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

/** «3. maj» (UTC-kalenderdag; år kun når det ikke er i år). */
export function datoKort(iso: string | null, nu: Date): string {
  const t = tid(iso);
  if (t === null) return "ukendt dato";
  const d = new Date(t);
  const aar = d.getUTCFullYear() !== nu.getUTCFullYear() ? ` ${d.getUTCFullYear()}` : "";
  return `${d.getUTCDate()}. ${MAANEDER[d.getUTCMonth()]}${aar}`;
}

export interface ForsidelinjeInput {
  /** Den der er ude. */
  virksomhedNavn: string;
  /** Den første i køen. */
  naeste: { navn: string; afvist_at: string | null; sat_at: string } | null;
  antalIKoen: number;
  tilbudUde: boolean;
  nu: Date;
}

/** Teksten og handlingen på rådgivernes forside — null når der intet er at sige. */
export function forsidelinje(i: ForsidelinjeInput): { tekst: string; handling: string | null } | null {
  if (i.antalIKoen === 0 && !i.tilbudUde) return null;
  if (i.tilbudUde) {
    return { tekst: `${i.virksomhedNavn} er ude. Pladsen er tilbudt — køen svarer selv, når fristen er gået.`, handling: null };
  }
  if (!i.naeste) return null;
  const siden = datoKort(i.naeste.afvist_at ?? i.naeste.sat_at, i.nu);
  const flere = i.antalIKoen > 1 ? ` (${i.antalIKoen - 1} mere i køen)` : "";
  return {
    tekst: `${i.virksomhedNavn} er ude. ${i.naeste.navn} har ventet siden ${siden}${flere} — tilbyd pladsen?`,
    handling: `Tilbyd pladsen til ${i.naeste.navn}`,
  };
}

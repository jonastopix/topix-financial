/**
 * src/lib/virksomhedsStamdata.ts
 *
 * De rene dele bag de tre stamdata-handlinger der 10/9 flyttede fra
 * /members til virksomhedssiden (Jonas' beslutning; recon-de-fem-fra-
 * members.md): omdøb virksomhed, sæt prisniveau i indgangen, slet
 * virksomhed. Ingen React, ingen Supabase. Testet i
 * __tests__/virksomhedsStamdata.test.ts.
 *
 * OMDØB: ét navn, trimmet, 1–200 tegn (samme grænse som Settings'
 * virksomhedsfane, «Virksomhedsnavn skal udfyldes (max 200 tegn)»), og
 * ikke det samme som før. /members' dialog havde ingen grænse.
 *
 * PRISNIVEAU: fladen skriver ikke selv — prisen sættes gennem edge function
 * saet-indgangs-prisniveau, som også sender dag 0-mailen (IndgangsSektion
 * :35-38: «Skrev fladen prisen selv, ville der findes en tilstand hvor
 * prisen er sat og mailen aldrig gik»). Her bor kun ORDENE for svarene —
 * ordret som IndgangsSektion.tsx:148-189, så de to flader siger det samme.
 *
 * SLET — AFGJORT 10/9, valg (a): «Slet virksomheden» kalder IKKE
 * hardDeleteCompany. Den sletter companies-rækken til sidst, og
 * company_perioder, company_traek, company_betalingslink og
 * company_fornyelse er ON DELETE CASCADE mod den — vores eget bilag
 * forsvinder (OVERLEVERING DEL 4, bekræftet 10/9). Knappen går i stedet
 * ad slettefunktionens vej 1 (#734, sletning.ts): den stempler
 * companies.offboarding_requested_at, præcis som medlemmets eget «slet min
 * data» (MembershipExpiredGate:148-153). Slettefunktionen (cron
 * slet-medlemsdata, planlagt 8/9 kl. 12:01, 12:00 UTC) sletter så på dag 7
 * — personfelter tømmes, rækken bliver stående med navn, CVR,
 * kontraktperiode og data_slettet_at, bilaget røres aldrig (værnet
 * sletningRoererIkkeBilag). De 7 dage er fortrydelsesfristen; «Fortryd»
 * nulstiller stemplet (MembershipExpiredGate:169-175). Slettefunktionen kan
 * ikke kaldes direkte fra en flade (Bucket B, ingen company_id i body) —
 * og det skal den heller ikke: gaten er på rækken.
 *
 * Vej 1 dømmer uanset om kontrakten er aktiv (sletning.ts: «en anmodning
 * er en anmodning»); cronen mærker den som aktiv_kontrakt i rapporten.
 * Dialogen skal derfor sige det.
 */

import { afgoerSletning, type SletningInput } from "./sletning";

// ── Omdøb ──

export const VIRKSOMHEDSNAVN_MAKS = 200;

export type NavnResultat = { ok: true; navn: string } | { ok: false; fejl: string };

export function validerVirksomhedsnavn(raa: string, nuvaerende: string): NavnResultat {
  const navn = raa.trim();
  if (navn === "") return { ok: false, fejl: "Skriv et navn." };
  if (navn.length > VIRKSOMHEDSNAVN_MAKS) return { ok: false, fejl: `Navnet må højst være ${VIRKSOMHEDSNAVN_MAKS} tegn.` };
  if (navn === nuvaerende.trim()) return { ok: false, fejl: "Det er allerede navnet." };
  return { ok: true, navn };
}

// ── Prisniveau: ordene for saet-indgangs-prisnivaus svar ──

export interface PrisBesked {
  tone: "success" | "info" | "warning" | "error";
  tekst: string;
  beskrivelse?: string;
  /** Skal fladen hente igen bagefter (tilstanden er ændret eller var forældet)? */
  genhent: boolean;
}

/** Fejlsvar (FunctionsHttpError): status + JSON-body → én besked. Ordret som IndgangsSektion. */
export function tolkPrisFejl(status: number | null, body: Record<string, unknown> | null): PrisBesked {
  const kode = typeof body?.error === "string" ? body.error : null;
  if (status === 409 || kode === "prisniveau_allerede_sat") return { tone: "info", tekst: "Prisen er allerede sat.", genhent: true };
  if (status === 404 || kode === "ingen_betalingslink") return { tone: "error", tekst: "Virksomheden er ikke i indgangen.", genhent: true };
  if (status === 400 || kode === "ukendt_prisniveau") {
    return {
      tone: "error",
      tekst: "Prisniveauet blev afvist af serveren",
      beskrivelse: typeof body?.detalje === "string" ? body.detalje : `${kode ?? "ukendt fejl"} (status ${status ?? "?"})`,
      genhent: false,
    };
  }
  if (status === 403) return { tone: "error", tekst: "Du har ikke adgang til at sætte prisen.", genhent: false };
  return { tone: "error", tekst: "Prisen kunne ikke sættes lige nu. Prøv igen om lidt.", genhent: false };
}

/** Succes-svar: { ok, mail, mail_fejlede } → én besked. Ordret som IndgangsSektion. */
export function tolkPrisSvar(data: unknown): PrisBesked {
  const d = (data ?? {}) as { ok?: unknown; mail?: unknown; mail_fejlede?: unknown };
  if (d.ok === true && d.mail_fejlede === true) {
    return { tone: "warning", tekst: "Prisen er gemt, men mailen kunne ikke sendes.", beskrivelse: "Skriv til medlemmet, eller prøv igen senere.", genhent: true };
  }
  if (d.ok === true && d.mail === "dag0") return { tone: "success", tekst: "Prisen er sat, og betalingsmailen er sendt.", genhent: true };
  if (d.ok === true) return { tone: "info", tekst: "Prisen er sat. Mailen blev ikke sendt, fordi der ikke var noget at sende.", genhent: true };
  return { tone: "error", tekst: "Prisen kunne ikke sættes lige nu. Prøv igen om lidt.", genhent: false };
}

// ── Slet: knappens tilstand ──

export type SletKnapTilstand = "slettet" | "anmodet" | "kan_bede";

export interface SletKnapDom {
  tilstand: SletKnapTilstand;
  /** Én sætning til fladen. */
  tekst: string;
  /** Fristens kalenderdag (UTC, YYYY-MM-DD) når der er bedt om sletning; ellers null. */
  frist: string | null;
  /** Kan stemplet stadig nulstilles — kun mens fristen løber. */
  kanFortryde: boolean;
}

const MAANEDER = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"] as const;

/** «10. september 2026» af en ISO-dato eller YYYY-MM-DD — UTC-kalenderdagen, som sletning.ts regner i. */
export function datoOrd(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCDate()}. ${MAANEDER[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const VEJ_ORD: Record<string, string> = {
  anmodning: "efter anmodning",
  tilbud_ubesvaret: "tilbud ubesvaret",
  aldrig_tilbudt: "aldrig tilbudt",
};

export function afgoerSletKnap(input: SletningInput & { data_slettet_vej?: string | null }, nu: Date = new Date()): SletKnapDom {
  if (input.data_slettet_at) {
    const vej = input.data_slettet_vej ? VEJ_ORD[input.data_slettet_vej] ?? input.data_slettet_vej : null;
    return {
      tilstand: "slettet",
      tekst: `Medlemsdata slettet ${datoOrd(input.data_slettet_at)}${vej ? ` (${vej})` : ""}. Rækken står som arkivspor.`,
      frist: null,
      kanFortryde: false,
    };
  }
  if (input.offboarding_requested_at) {
    const dom = afgoerSletning(input, nu);
    const bedt = datoOrd(input.offboarding_requested_at);
    if (dom.skal_slettes) {
      return {
        tilstand: "anmodet",
        tekst: `Der er bedt om sletning ${bedt}. Fristen udløb ${datoOrd(dom.frist)} — slettefunktionen sletter ved næste kørsel.`,
        frist: dom.frist,
        kanFortryde: false,
      };
    }
    return {
      tilstand: "anmodet",
      tekst: `Der er bedt om sletning ${bedt}. Medlemsdata slettes ${datoOrd(dom.frist)}; indtil da kan det fortrydes.`,
      frist: dom.frist,
      kanFortryde: true,
    };
  }
  return { tilstand: "kan_bede", tekst: "Sletning sker gennem slettefunktionen: 7 dages frist, derefter tømmes medlemsdata og rækken bliver stående som arkivspor.", frist: null, kanFortryde: false };
}

/** Hvad der BLIVER stående — sagt i dialogen, så ingen tror bilaget forsvinder. */
export function bilagTekst(perioder: number, traek: number, harBetalingslink: boolean): string {
  const dele: string[] = [];
  if (perioder > 0) dele.push(`${perioder} ${perioder === 1 ? "periode" : "perioder"}`);
  if (traek > 0) dele.push(`${traek} ${traek === 1 ? "træk" : "træk"}`);
  if (harBetalingslink) dele.push("betalingslinket");
  if (dele.length === 0) return "Der er intet bilag registreret på virksomheden; navn, CVR og kontraktperiode bliver stående.";
  const liste = dele.length === 1 ? dele[0] : `${dele.slice(0, -1).join(", ")} og ${dele[dele.length - 1]}`;
  return `Bilaget bliver stående: ${liste}. Navn, CVR og kontraktperiode bliver også stående.`;
}

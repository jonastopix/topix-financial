/**
 * webinarRum/overlay — dommene over det, der ligger OVEN PÅ afspilleren, og
 * kortene fra tidslinjen (skive 2, 30/9-2026). Kun klienten; tiden gives ind.
 *
 * Bunnys iframe er cross-origin og kan ikke styles indefra, og Bunny har ingen
 * parameter, der fjerner søgebjælken (spec §A5). Derfor:
 *   1. et gennemsigtigt lag over den nederste kontrolbjælke, så søgebjælken
 *      ikke kan trækkes (pause er tilladt; spoling er ikke — beslutning G4)
 *   2. spoleDom (webinarMotor/spolning.ts) ved hver timeupdate, som fanger
 *      tastatur og alt andet, der alligevel flytter positionen
 *   3. «Tilbage til live» på pause, «Tryk for lyd», når browseren kun ville
 *      afspille uden lyd (iPhone: lyd kræver et tryk — WebKit)
 */
import { aktiveInteraktioner, type Interaktion, type InteraktionArt, type Kontekst } from "@/lib/webinarMotor/interaktioner";
import type { AfspillerTilstand } from "@/lib/webinarMotor/spolning";
import type { Visning } from "./fase";

export interface OverlayInd {
  visning: Visning;
  afspiller: AfspillerTilstand;
  /** Afspillerens egen lyddom (player.js getMuted) — null før den er kendt. */
  muted: boolean | null;
  /** player.js har sagt «ready». */
  klar: boolean;
}

export interface OverlayDom {
  /** Dæk kontrolbjælken (søgebjælken) — altid i live. */
  daekKontroller: boolean;
  /** «Webinaret kører videre live. Tilbage til live.» */
  visTilbageTilLive: boolean;
  /** Stor «Tryk for lyd»-knap. */
  visTrykForLyd: boolean;
}

export function overlayDom(i: OverlayInd): OverlayDom {
  const live = i.visning === "live";
  return {
    daekKontroller: live,
    visTilbageTilLive: live && i.klar && i.afspiller === "pause",
    visTrykForLyd: live && i.klar && i.muted === true && i.afspiller !== "pause",
  };
}

/** Så længe venter klienten på, at autoplay med lyd går i gang, før den giver op og spiller uden. */
export const AUTOPLAY_VENT_MS = 1500;

/**
 * iPhone-dommen (spec §A5 plan A): iframen indlæses med autoplay og lyd. Står
 * afspilleren stadig på pause efter AUTOPLAY_VENT_MS, nægtede browseren lyd —
 * så slås lyden fra og afspilningen startes (muted autoplay er tilladt), og
 * «Tryk for lyd» vises. Spiller den, er alt godt.
 */
export function autoplayDom(pausetEfterVent: boolean, muted: boolean): "ok" | "spil_uden_lyd" | "tryk_for_lyd" {
  if (pausetEfterVent) return "spil_uden_lyd";
  return muted ? "tryk_for_lyd" : "ok";
}

/** Uden en timeupdate i så lang tid, mens afspilleren siger «spiller», buffer den. */
export const BUFFER_EFTER_MS = 2500;

/**
 * Afspillerens tilstand, som spoleDom og pulsen skal have den: player.js har
 * ingen buffer-hændelse, så en «spiller», der ikke har meldt en position i
 * 2,5 s, er «buffer» — og spoledommen hopper aldrig under buffering.
 */
export function afspillerTilstand(sidsteHaendelse: "play" | "pause" | "ended" | null, sidsteTidMs: number | null, nuMs: number): AfspillerTilstand {
  if (sidsteHaendelse === "pause") return "pause";
  if (sidsteHaendelse === "ended") return "slut";
  if (sidsteHaendelse === "play") {
    if (sidsteTidMs !== null && nuMs - sidsteTidMs > BUFFER_EFTER_MS) return "buffer";
    return "spiller";
  }
  return "pause";
}

// ── Kortene ──────────────────────────────────────────────────────────────────

/**
 * De arter, fladen tegner som kort i v1. `haand` venter på klokketypen, og
 * `ressource` på et link via tokenet (spec skive 4–5); `reaktion` er den
 * altid-tilstedeværende bjælke, ikke et kort; `kapitel` er agendaen.
 */
export const KORT_ARTER: readonly InteraktionArt[] = ["cta", "poll", "quiz", "feedback", "spoergsmaal_prompt"];

/**
 * Kortene på skærmen nu — serverens egen dom (aktiveInteraktioner) på serverens
 * position, minus dem, seeren har lukket («Ikke nu»/×). Et BESVARET kort bliver
 * stående (med sit «tak»/quiz' facit), til dets vindue lukker.
 */
export function kortPaaSkaermen(
  tidslinje: readonly Interaktion[],
  rum: string,
  forventetPosSek: number,
  k: Kontekst,
  lukkede: ReadonlySet<string>,
): Interaktion[] {
  return aktiveInteraktioner({ version: 0, interaktioner: [...tidslinje] }, rum, forventetPosSek, k).filter(
    (i) => KORT_ARTER.includes(i.art) && !lukkede.has(i.id),
  );
}

// ── Nedtællinger ─────────────────────────────────────────────────────────────

export interface Nedtaelling {
  dage: number;
  timer: number;
  minutter: number;
  sekunder: number;
}

export function nedtaellingDele(sek: number): Nedtaelling {
  const s = Math.max(0, Math.floor(sek));
  return { dage: Math.floor(s / 86_400), timer: Math.floor((s % 86_400) / 3600), minutter: Math.floor((s % 3600) / 60), sekunder: s % 60 };
}

const to = (n: number) => String(n).padStart(2, "0");

/** «04:59» under en time, «1:04:59» over, «2 d. 3 t.» over et døgn. */
export function nedtaellingTekst(sek: number): string {
  const d = nedtaellingDele(sek);
  if (d.dage > 0) return `${d.dage} d. ${d.timer} t.`;
  if (d.timer > 0) return `${d.timer}:${to(d.minutter)}:${to(d.sekunder)}`;
  return `${to(d.minutter)}:${to(d.sekunder)}`;
}

/** Sekunder, hvor en skærmlæser får nedtællingen læst op — ikke hvert sekund (aria-live ville snakke uafbrudt). */
export const ANNONCER_VED = [3600, 1800, 900, 600, 300, 120, 60, 30, 10] as const;

/** Teksten til aria-live, når nedtællingen rammer et af tallene — ellers null. */
export function annoncering(sek: number): string | null {
  const s = Math.floor(sek);
  if (s <= 0) return null;
  if (!(ANNONCER_VED as readonly number[]).includes(s)) return null;
  if (s >= 3600) return `Webinaret starter om ${s / 3600 === 1 ? "en time" : `${s / 3600} timer`}.`;
  if (s >= 60) return `Webinaret starter om ${s / 60 === 1 ? "et minut" : `${s / 60} minutter`}.`;
  return `Webinaret starter om ${s} sekunder.`;
}

/** Sekunder tilbage af en SAND frist (ctaVindue) — null, når der ingen er, eller den er udløbet. */
export function resterendeSek(udloeberMs: number | null, serverNuMs: number): number | null {
  if (udloeberMs === null || !Number.isFinite(udloeberMs)) return null;
  const s = Math.ceil((udloeberMs - serverNuMs) / 1000);
  return s > 0 ? s : null;
}

// ── Venteværelsets forbindelsestjek ──────────────────────────────────────────

/**
 * Forbindelsen, målt som den MINDSTE rundtur til serveren (samme målinger som
 * urForskydning) — et tal vi selv har målt, ikke et gæt. Grænserne er
 * pejlinger: under 300 ms mærker ingen noget; over 800 ms kan starten hakke.
 */
export function forbindelsesDom(rttMs: number | null): { niveau: "ukendt" | "god" | "ok" | "langsom"; tekst: string } {
  if (rttMs === null || !Number.isFinite(rttMs) || rttMs < 0) return { niveau: "ukendt", tekst: "Forbindelsen måles …" };
  const ms = Math.round(rttMs);
  if (ms < 300) return { niveau: "god", tekst: `Forbindelsen er god (${ms} ms)` };
  if (ms < 800) return { niveau: "ok", tekst: `Forbindelsen er fin (${ms} ms)` };
  return { niveau: "langsom", tekst: `Forbindelsen er langsom (${ms} ms) — et andet net kan hjælpe` };
}

/** Den mindste rundtur blandt målingerne — null uden målinger. */
export function mindsteRundtur(maalinger: ReadonlyArray<{ sendtMs: number; modtagetMs: number }>): number | null {
  let min: number | null = null;
  for (const m of maalinger) {
    const r = m.modtagetMs - m.sendtMs;
    if (r >= 0 && (min === null || r < min)) min = r;
  }
  return min;
}

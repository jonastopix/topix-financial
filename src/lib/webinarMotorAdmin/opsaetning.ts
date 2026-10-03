/**
 * webinarMotorAdmin/opsaetning — rådgiverens opsætning af et webinar (skive 3, 30/9-2026).
 *
 * Rene domme bag /webinar/motor (bag rådgiver-login, i ingen menu endnu):
 * formularerne for webinaret, sessionen og tidslinjens interaktioner, dømt
 * HER før noget sendes — og databasen dømmer igen (CHECK'ene i
 * 20261003010000, RLS og triggerne i 20261003030000). Interaktionernes
 * indhold dømmes af SAMME interaktionSkema, som webinar-rum/-puls bruger, så
 * editoren og serveren afviser det samme.
 *
 * Tiden gives ind. Dansk tid → UTC gennem hverdage.ts:kbhTilUtc (ét sted).
 */
import { kbhTilUtc } from "@/lib/hverdage";
import { interaktionSkema, PLACERINGER } from "@/lib/webinarMotor/interaktioner";
import { SLUG_FORM, UUID_FORM } from "@/lib/webinarMotor/tilmelding";

export type Fejl = Record<string, string>;
export type Dom<T> = { ok: true; vaerdi: T } | { ok: false; fejl: Fejl };

// ── Tidskoder ────────────────────────────────────────────────────────────────

/** «12:30» → 750, «1:02:03» → 3723, «90» → 90. null = ikke en tidskode. */
export function laesTidskode(v: string): number | null {
  const t = v.trim();
  if (!/^\d{1,5}(:\d{1,2}){0,2}$/.test(t)) return null;
  const dele = t.split(":").map(Number);
  if (dele.slice(1).some((d) => d > 59)) return null;
  return dele.reduce((sum, d) => sum * 60 + d, 0);
}

/** 750 → «12:30», 3723 → «1:02:03». */
export function tidskode(sek: number): string {
  const s = Math.max(0, Math.floor(sek));
  const t = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const to = (n: number) => String(n).padStart(2, "0");
  return t > 0 ? `${t}:${to(m)}:${to(r)}` : `${m}:${to(r)}`;
}

/** «Økonomi, der giver ro» → «okonomi-der-giver-ro» (SLUG_FORM). */
export function slugFraTitel(titel: string): string {
  return titel
    .toLowerCase()
    .replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

// ── Webinaret ────────────────────────────────────────────────────────────────

/**
 * CTA-målene, editoren tilbyder: ansøgningen, og «ikke klar endnu». Skemaet
 * kender også «ressource» og «link», men seerens kort (InteraktionsKort) har
 * ingen vej til dem endnu — et mål, der ikke fører nogen steder hen, tilbydes ikke.
 */
export const EDITOR_CTA_MAAL = ["ansoeg", "ikke_klar"] as const;
export const CTA_MAAL_NAVN: Record<(typeof EDITOR_CTA_MAAL)[number], string> = { ansoeg: "Ansøgningen", ikke_klar: "«Ikke klar endnu»" };

export interface WebinarForm {
  titel: string;
  slug: string;
  bunnyGuid: string;
  /** Varigheden som tidskode («52:10») eller sekunder. */
  varighed: string;
  vaertNavn: string;
  lobbyMin: string;
  exitrumMin: string;
  /** CTA'en: tidskode (tom = ingen CTA nu), mål, tekst og knap. */
  ctaTid: string;
  ctaMaal: string;
  ctaTekst: string;
  ctaKnap: string;
}

export interface WebinarRaekke {
  titel: string;
  slug: string;
  bunny_video_id: string;
  varighed_sek: number;
  vaert_navn: string | null;
  lobby_min: number;
  exitrum_min: number;
  status: "kladde";
}

export interface CtaRaekke {
  art: "cta";
  vis_fra_sek: number;
  vis_til_sek: null;
  placering: "overlay";
  indhold: { tekst: string; knap: string; maal: string };
}

const heltal = (v: string, min: number, maks: number): number | null => {
  const t = v.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= maks ? n : null;
};

/**
 * Webinaret som ny KLADDE. Varigheden tastes (Jonas' opgave 30/9); spec'en
 * vil have den målt fra Bunnys video-info (B1) — det kræver webinarbibliotekets
 * API-nøgle og er ikke bygget. Et tastet tal er en observation: docs/webinarmotor.md §7.
 * CTA'en (valgfri) bliver den første interaktion i tidslinjens kladde (version 1).
 */
export function laesWebinarForm(f: WebinarForm): Dom<{ webinar: WebinarRaekke; cta: CtaRaekke | null }> {
  const fejl: Fejl = {};
  const titel = f.titel.trim();
  if (titel.length < 1 || titel.length > 200) fejl.titel = "1–200 tegn.";
  const slug = f.slug.trim().toLowerCase();
  if (!SLUG_FORM.test(slug)) fejl.slug = "3–60 tegn: a–z, 0–9 og bindestreg.";
  const guid = f.bunnyGuid.trim().toLowerCase();
  if (!UUID_FORM.test(guid)) fejl.bunnyGuid = "Videoens GUID fra Bunny (webinarbiblioteket).";
  const varighed = laesTidskode(f.varighed);
  if (varighed === null || varighed < 60 || varighed > 4 * 3600) fejl.varighed = "Som «52:10» — mellem 1 minut og 4 timer.";
  const lobby = heltal(f.lobbyMin, 0, 60);
  if (lobby === null) fejl.lobbyMin = "0–60 minutter.";
  const exitrum = heltal(f.exitrumMin, 0, 60);
  if (exitrum === null) fejl.exitrumMin = "0–60 minutter.";

  let cta: CtaRaekke | null = null;
  if (f.ctaTid.trim() !== "") {
    const fra = laesTidskode(f.ctaTid);
    if (fra === null || (varighed !== null && fra >= varighed)) fejl.ctaTid = "En tidskode inden for videoen.";
    if (!(EDITOR_CTA_MAAL as readonly string[]).includes(f.ctaMaal)) fejl.ctaMaal = "Vælg et mål.";
    const indhold = { tekst: f.ctaTekst.trim(), knap: f.ctaKnap.trim(), maal: f.ctaMaal };
    const skema = interaktionSkema("cta", indhold);
    if (!skema.ok) fejl.ctaTekst = "Tekst (1–500 tegn) og knap (1–80 tegn) skal udfyldes.";
    if (fra !== null && Object.keys(fejl).length === 0) cta = { art: "cta", vis_fra_sek: fra, vis_til_sek: null, placering: "overlay", indhold };
  }
  if (Object.keys(fejl).length > 0) return { ok: false, fejl };
  return {
    ok: true,
    vaerdi: {
      webinar: {
        titel, slug, bunny_video_id: guid, varighed_sek: varighed as number,
        vaert_navn: f.vaertNavn.trim() || null, lobby_min: lobby as number, exitrum_min: exitrum as number, status: "kladde",
      },
      cta,
    },
  };
}

/** De overgange, fladen tilbyder. Et arkiveret webinar kommer ikke tilbage (opret et nyt). */
export const STATUS_OVERGANGE: Readonly<Record<string, readonly string[]>> = {
  kladde: ["aktiv"],
  aktiv: ["kladde", "arkiveret"],
  arkiveret: [],
};

// ── Sessionen ────────────────────────────────────────────────────────────────

export interface SessionForm {
  /** YYYY-MM-DD, dansk dato. */
  dato: string;
  /** HH:MM, dansk tid. */
  tid: string;
  intern: boolean;
  /** Tom = ingen grænse. */
  kapacitet: string;
}

export interface SessionRaekke {
  starter_at: string;
  intern: boolean;
  kapacitet: number | null;
  type: "Scheduled";
  status: "planlagt";
}

/**
 * En ny session på DANSK tid (kbhTilUtc — sommertid regnet ét sted). Den skal
 * ligge i fremtiden. Er den intern, står den aldrig i en offentlig liste
 * (D2.7), og kun husets adresser kan tilmelde sig.
 */
export function laesSessionForm(f: SessionForm, nu: Date): Dom<SessionRaekke> {
  const fejl: Fejl = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.dato)) fejl.dato = "Vælg en dato.";
  const m = f.tid.match(/^(\d{2}):(\d{2})$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) fejl.tid = "Som «11:00».";
  let kapacitet: number | null = null;
  if (f.kapacitet.trim() !== "") {
    kapacitet = heltal(f.kapacitet, 1, 10_000);
    if (kapacitet === null) fejl.kapacitet = "Et helt tal fra 1 — eller tomt.";
  }
  if (Object.keys(fejl).length > 0) return { ok: false, fejl };
  const start = kbhTilUtc(f.dato, Number(m![1]), Number(m![2]));
  if (!Number.isFinite(start.getTime())) return { ok: false, fejl: { dato: "Ugyldig dato." } };
  if (start.getTime() <= nu.getTime()) return { ok: false, fejl: { dato: "Sessionen skal ligge i fremtiden." } };
  return { ok: true, vaerdi: { starter_at: start.toISOString(), intern: f.intern, kapacitet, type: "Scheduled", status: "planlagt" } };
}

// ── Tidslinjen ───────────────────────────────────────────────────────────────

/** De arter, editoren tilbyder i v1 (dem, seerens flade tegner, + kapitel). */
export const EDITOR_ARTER = ["cta", "poll", "quiz", "feedback", "spoergsmaal_prompt", "kapitel"] as const;
export type EditorArt = (typeof EDITOR_ARTER)[number];

export const ART_NAVN: Record<EditorArt, string> = {
  cta: "Opfordring (CTA)",
  poll: "Afstemning",
  quiz: "Quiz",
  feedback: "Feedback",
  spoergsmaal_prompt: "Spørg værten",
  kapitel: "Kapitel",
};

export interface InteraktionForm {
  art: string;
  fra: string;
  /** Tom = til videoens slut (exitrummet: hele rummet). */
  til: string;
  placering: string;
  /** Hovedteksten: CTA-teksten, spørgsmålet eller kapitlets titel. */
  tekst: string;
  /** CTA: knappens tekst. */
  knap: string;
  /** CTA: målet. */
  maal: string;
  /** Poll/quiz: ét valg pr. linje. */
  valg: string;
  /** Quiz: det rigtige valgs nummer (1, 2, …). */
  rigtigt: string;
}

export interface InteraktionRaekke {
  art: EditorArt;
  vis_fra_sek: number;
  vis_til_sek: number | null;
  placering: string;
  indhold: Record<string, unknown>;
}

export function laesInteraktionForm(f: InteraktionForm, varighedSek: number): Dom<InteraktionRaekke> {
  const fejl: Fejl = {};
  if (!(EDITOR_ARTER as readonly string[]).includes(f.art)) fejl.art = "Vælg en type.";
  if (!(PLACERINGER as readonly string[]).includes(f.placering)) fejl.placering = "Vælg hvor.";
  const fra = laesTidskode(f.fra);
  if (fra === null || fra > varighedSek) fejl.fra = `En tidskode mellem 0:00 og ${tidskode(varighedSek)}.`;
  let til: number | null = null;
  if (f.til.trim() !== "") {
    til = laesTidskode(f.til);
    if (til === null || fra === null || til <= fra || til > varighedSek) fejl.til = "Efter «fra» og inden for videoen — eller tomt.";
  }
  if (Object.keys(fejl).length > 0) return { ok: false, fejl };

  const art = f.art as EditorArt;
  const valg = f.valg.split("\n").map((v) => v.trim()).filter((v) => v !== "");
  let indhold: Record<string, unknown>;
  switch (art) {
    case "cta": indhold = { tekst: f.tekst.trim(), knap: f.knap.trim(), maal: f.maal }; break;
    case "poll": indhold = { spoergsmaal: f.tekst.trim(), valg }; break;
    case "quiz": indhold = { spoergsmaal: f.tekst.trim(), valg, rigtigt: /^\d+$/.test(f.rigtigt.trim()) ? Number(f.rigtigt.trim()) - 1 : -1 }; break;
    case "feedback":
    case "spoergsmaal_prompt": indhold = { spoergsmaal: f.tekst.trim() }; break;
    case "kapitel": indhold = { titel: f.tekst.trim() }; break;
  }
  if (art === "cta" && !(EDITOR_CTA_MAAL as readonly string[]).includes(f.maal)) return { ok: false, fejl: { indhold: SKEMA_FEJL.cta_maal } };
  const skema = interaktionSkema(art, indhold);
  if (skema.ok === false) return { ok: false, fejl: { indhold: SKEMA_FEJL[skema.fejl] ?? "Indholdet er ikke gyldigt." } };
  return { ok: true, vaerdi: { art, vis_fra_sek: fra as number, vis_til_sek: til, placering: f.placering, indhold } };
}

const SKEMA_FEJL: Record<string, string> = {
  cta_tekst: "CTA: tekst (1–500 tegn) og knap (1–80 tegn).",
  cta_maal: "CTA: vælg et mål.",
  poll: "Afstemning: et spørgsmål og 2–6 valg (ét pr. linje).",
  quiz: "Quiz: et spørgsmål og 2–6 valg (ét pr. linje).",
  quiz_rigtigt: "Quiz: nummeret på det rigtige valg (1, 2, …).",
  feedback: "Feedback: et spørgsmål.",
  spoergsmaal_prompt: "Spørg værten: en opfordring.",
  kapitel: "Kapitel: en titel.",
};

/**
 * Versionerne. Den UDGIVNE er webinarer.tidslinje_version (0 = intet udgivet);
 * KLADDEN er altid den næste (udgivet + 1) — kun den kan ændres (RLS i
 * 20261003030000 + skive 1's trigger). «Udgiv» sætter udgivet = kladde, og
 * kun med mindst én interaktion i kladden: en tom kladde ville udgive en tom
 * tidslinje over en fyldt.
 */
export function versioner(udgivet: number): { udgivet: number; kladde: number } {
  const u = Math.max(0, Math.floor(udgivet));
  return { udgivet: u, kladde: u + 1 };
}

export function kanUdgive(kladdeAntal: number): boolean {
  return kladdeAntal > 0;
}

/** Den udgivne versions rækker som nye kladde-rækker (uden id) — «Ret tidslinjen». */
export function kopierTilKladde<T extends { art: string; vis_fra_sek: number; vis_til_sek: number | null; placering: string; indhold: unknown; betingelse?: unknown; udloeber_kilde?: unknown }>(
  udgivne: readonly T[],
  webinarId: string,
  kladde: number,
): Array<Record<string, unknown>> {
  return udgivne.map((r) => ({
    webinar_id: webinarId,
    version: kladde,
    art: r.art,
    vis_fra_sek: r.vis_fra_sek,
    vis_til_sek: r.vis_til_sek,
    placering: r.placering,
    indhold: r.indhold,
    betingelse: r.betingelse ?? null,
    udloeber_kilde: r.udloeber_kilde ?? null,
  }));
}

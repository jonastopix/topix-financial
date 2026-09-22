import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (19/9-2026): EN BODY, MAN IKKE FORSTÅR, MÅ ALDRIG BLIVE TIL EN
// STANDARDKØRSEL.
//
// Fejlen kostede to runder på én dag i meta-annoncer-cron. Først læste den kun
// «dry_run», så et kald med datoer hentede syv dage og svarede 200. Efter
// rettelsen kom kaldet som {"vindue": {"since": …}} — datoerne pakket ind — og
// begge felter var `undefined`, hvilket betyder «ingen datoer givet». Syv dage
// igen. Rettelsen lukkede DØREN (forkerte datoer) og lod VINDUET stå åbent
// (ukendte nøgler). Dette værn lukker vinduet — for alle functions, ikke kun den.
//
// REGLEN: læser en function felter af en body, skal den afvise felter, den ikke
// kender (_shared/kendteFelter.ts).
//
// DEN ENE UNDTAGELSE er eksterne webhooks: Stripe, Monday, Slack og Supabases
// auth-hook bestemmer selv formen på deres payloads og tilføjer felter uden at
// spørge. En afvisning ville lukke integrationen ved deres næste opdatering.
//
// VÆRNETS ARBEJDE er ikke at rette 34 functions i dag, men at sikre, at listen
// KUN KAN BLIVE KORTERE: enhver function, der læser body-felter, skal stå på
// præcis én liste, og AFVENTER kan aldrig vokse. En ny function tvinger en
// beslutning frem — den kan ikke bare ignorere felter i tavshed.

const ROD = process.cwd();
const FUNKTIONER = resolve(ROD, "supabase/functions");
const laes = (n: string) => readFileSync(resolve(FUNKTIONER, n, "index.ts"), "utf8");

/**
 * Functions, der parser en body OG læser felter af den.
 *
 * Detektoren finder FØRST navnet på variablen, `req.json()` blev lagt i, og
 * leder DEREFTER efter feltlæsninger på netop den. En tidligere udgave ledte
 * efter ordet «body» — og overså dermed enhver function, der kaldte sin variabel
 * noget andet. Den fejl fandt værnet selv, første gang det blev kørt:
 * meta-annoncer-cron hedder `raaBody` og faldt ud af sin egen liste.
 */
export function laeserBodyFelter(kilde: string): boolean {
  if (!kilde.includes("req.json()")) return false;
  // Både `const x = await req.json()` OG `x = (await req.json())` på en senere
  // linje — meta-annoncer-cron erklærer sin `raaBody` først og tildeler bagefter.
  // Navnet skal stå lige FØR lighedstegnet (evt. med en typeannotation imellem).
  // En løsere udgave tømte sig selv: i «let x = null; x = await req.json()» fangede
  // den «null» som variabelnavnet og fandt derfor aldrig feltlæsningerne.
  const navne = [...kilde.matchAll(/(?:const|let|var)?\s*(\w+)\s*(?::[^=\n]+)?=\s*\(?\s*await\s+req\.json\(\)/g)].map((m) => m[1]);
  // Destrukturering (`const { a } = await req.json()`) er også en feltlæsning.
  if (/(?:const|let|var)\s*\{[^}]+\}\s*=\s*\(?\s*await\s+req\.json\(\)/.test(kilde)) return true;
  return navne.some((n) => new RegExp(`\\b${n}\\s*\\??\\.\\s*[a-zA-Z_]|\\b${n}\\s*\\[`).test(kilde));
}

/** Implementerer den reglen? */
export function afviserUkendteFelter(kilde: string): boolean {
  return kilde.includes("ukendteFelter(") && kilde.includes("ukendteFelterBesked(");
}

/** Dem, der afviser ukendte felter i dag. Listen skal VOKSE. */
const STRIKS: readonly string[] = [
  "meta-annoncer-cron",
  // Prøve-udløb for fremmøde (20/9): tre felter, alt andet afvises.
  "ewebinar-proeve",

  // Lag 5 (20/9): Klaviyos hændelser tilbage. Striks fra første linje.
  "klaviyo-hentning-cron",

  // Ansøgningsformularens gem (21/9, udkast 2): ni felter på tværs af fire
  // handlinger, målt i api.ts og holdt af ansoegningGemKendteFelter.guard.
  "ansoegning-gem",

  // De to klokker (20/9): dry_run og nu, alt andet afvises.
  "stille-klokker-cron",

  // Gensenderen for klaviyo_haendelser (21/9): dry_run, nu og bevis_id, alt andet afvises.
  "klaviyo-gensend-cron",

  // Engangsimporten (udkast 21/9, fremmøde for én session): maal, dry_run,
  // send_fremmoede og session_dato — alt andet afvises. Læser nu med req.json().
  "ewebinar-import",

  // Webinarets tidspunkt på profilen (21/9): dry_run, nu og email, alt andet afvises.
  "klaviyo-profil-cron",

  // Metas Conversions API (udkast 21/9 aften): dry_run, nu, test_event_code og
  // ansoegning_id, alt andet afvises.
  "meta-send-cron",

  // Google Analytics (udkast 21/9 aften): dry_run, nu, debug og ansoegning_id.
  "ga-send-cron",

  // Afmeldingerne bagud (udkast 22/9): dry_run, nu og email — alt andet afvises.
  "klaviyo-afmeld-bagud",

  // Rådgivernes klokker som mail (udkast 21/9): dry_run og nu, alt andet afvises.
  "klokke-mail-cron",

  // /webinar delt med en ekstern (udkast 21/9): t og valg (webinar-delt);
  // handling, navn, dage og id (webinar-deling). Alt andet afvises.
  "webinar-delt",
  "webinar-deling",
];

/**
 * Eksterne webhooks. Reglen gælder IKKE — afsenderen bestemmer formen, og en
 * afvisning ville lukke integrationen ved deres næste feltudvidelse.
 * Hver enkelt med sin begrundelse:
 */
const EKSTERNE: readonly string[] = [
  "auth-email-hook",               // Supabases auth-hook — payloadens form er deres
  "monday-webhook",                // Monday sender challenge/event/sent + hvad de finder på
  "send-slack-report-notification", // tager imod en Slack-event-payload
];

/**
 * BAGLOGGEN. Læser body-felter uden at afvise ukendte. Ikke nødvendigvis en
 * FEJL i dag — men samme åbne vindue som det, der kostede to runder.
 * Migreres én ad gangen: flyt navnet til STRIKS og sæt LOFT ned.
 */
const AFVENTER: readonly string[] = [
  "admin-cleanup-test-data",
  "advisor-broadcast",
  "aftale-underskrift",
  "ai-data-chat",
  "ai-financial-feedback",
  "ansoegning-cvr",
  "ansoegning-handling",
  "ansoegning-link",
  "ansoegning-rykker-cron",
  "ansoegning-samtale",
  "attach-user-to-company",
  "auto-create-baseline-budget",
  "berig-virksomheder",
  "cancel-event",
  "create-legat-enrollment",
  "create-subscription-checkout",
  "detect-financial-alerts",
  "extract-annual-report",
  "flyt-event",
  "fornyelsesvarsel-cron",
  "generate-ai-forecast",
  "generate-budget-from-accounts",
  "generate-budget-scenarios",
  "generate-financial-commentary",
  "generate-weekly-focus",
  "genkoer-rapport",
  "handout-ai-feedback",
  "import-application",
  "import-budget-excel",
  "indgangs-paamindelser-cron",
  "intro-reminder-cron",
  "legat-reminder-cron",
  "maal-skriv",
  "manage-advisor",
  "meta-annonce-opslag",
  "notify-kpi-comment",
  "onboarding-rytme",
  "opret-fornyelse-checkout",
  "opret-indgangs-checkout",
  "process-pending-invitation",
  "publish-event",
  "report-review-cron",
  "run-company-agent",
  "saet-indgangs-prisniveau",
  "send-indgangs-betalingsmail",
  "send-invitation-email",
  "send-slack-chat-notification",
  "send-slack-feedback-notification",
  "send-slack-handout-notification",
  "send-template-email",
  "send-til-underskrift",
  "send-welcome-message",
  "skridt-tilfoej",
  "slet-medlemsdata-cron",
  "update-annual-report-revenue",
  "upgrade-legat-to-member",
  "venteliste-handling",
];

/** Kan kun sættes NED. Et nyt navn i AFVENTER uden en migrering fejler her. */
const LOFT = 58;

describe("bodyFelter.guard — en body, man ikke forstår, bliver aldrig en standardkørsel", () => {
  const alle = readdirSync(FUNKTIONER, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => d.name)
    .filter((n) => {
      try { return laeserBodyFelter(laes(n)); } catch { return false; }
    })
    .sort();

  it("hver body-læsende function står på PRÆCIS én liste", () => {
    const klassificeret = new Set([...STRIKS, ...EKSTERNE, ...AFVENTER]);
    const uklassificeret = alle.filter((n) => !klassificeret.has(n));
    // En ny function kan ikke snige sig ind: den skal tage stilling.
    expect(uklassificeret).toEqual([]);
    for (const n of alle) {
      const paa = [STRIKS, EKSTERNE, AFVENTER].filter((l) => l.includes(n)).length;
      expect(`${n}: ${paa} liste(r)`).toBe(`${n}: 1 liste(r)`);
    }
  });

  it("listerne indeholder ingen navne, der ikke længere læser en body", () => {
    for (const n of [...STRIKS, ...EKSTERNE, ...AFVENTER]) {
      expect(alle).toContain(n);
    }
  });

  it("STRIKS-functions afviser faktisk ukendte felter", () => {
    for (const n of STRIKS) {
      expect(`${n}: ${afviserUkendteFelter(laes(n))}`).toBe(`${n}: true`);
    }
  });

  it("BAGLOGGEN kan kun blive kortere — aldrig længere", () => {
    expect(AFVENTER.length).toBeLessThanOrEqual(LOFT);
  });

  it("ingen ekstern webhook afviser ukendte felter — det ville lukke integrationen", () => {
    for (const n of EKSTERNE) {
      expect(`${n}: ${afviserUkendteFelter(laes(n))}`).toBe(`${n}: false`);
    }
  });
});

describe("bodyFelter.guard — dommene fanger fejlen på en kopi", () => {
  it("en function, der parser en body uden at læse felter, tæller ikke med", () => {
    expect(laeserBodyFelter("const b = await req.json();")).toBe(false);
    expect(laeserBodyFelter("ingen body her")).toBe(false);
    expect(laeserBodyFelter("const body = await req.json(); if (body?.dry_run === false) {}")).toBe(true);
    expect(laeserBodyFelter('const body = await req.json(); const x = body["id"];')).toBe(true);
  });

  it("DEN FEJL VÆRNET SELV HAVDE: variablen behøver ikke hedde «body»", () => {
    // meta-annoncer-cron kalder sin `raaBody` — en detektor, der leder efter
    // ordet «body» med lille b, overså den og lod functionen falde ud af listen.
    expect(laeserBodyFelter("let raaBody: Record<string, unknown> | null = null; raaBody = (await req.json()) as Record<string, unknown>; if (raaBody?.dry_run === false) {}")).toBe(true);
    expect(laeserBodyFelter("const payload = await req.json(); if (payload.event) {}")).toBe(true);
    expect(laeserBodyFelter("const { token, handling } = await req.json();")).toBe(true);
    // Og den rigtige fil skal fanges — ikke kun en konstrueret streng.
    expect(laeserBodyFelter(laes("meta-annoncer-cron"))).toBe(true);
  });

  it("en STRIKS-function, der mister afvisningen, fanges", () => {
    const uden = laes("meta-annoncer-cron").replace(/ukendteFelterBesked\(/g, "ingenBesked(");
    expect(uden).not.toBe(laes("meta-annoncer-cron"));
    expect(afviserUkendteFelter(uden)).toBe(false);
  });
});

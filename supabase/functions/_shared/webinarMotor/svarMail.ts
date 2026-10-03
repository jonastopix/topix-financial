/**
 * webinarMotor/svarMail — værtens svar på MAIL til den seer, der er gået
 * (spec'ens skive 5, 3/10-2026; docs/webinarmotor.md §7.10).
 *
 * Spejlet ORDRET i src/lib/webinarMotor/svarMail.ts
 * (paritetstest src/lib/__tests__/webinarMotor.paritet.test.ts). Nul imports.
 * Tiden gives ind.
 *
 * VEJEN: rådgiveren svarer i konsollen (status «besvaret», svar_tekst). Er seeren
 * stadig i rummet, leverer webinar-puls svaret i næste pulssvar og sætter
 * leveret = «live». Er seeren GÅET — eller er sessionen slut — leverer
 * webinar-motor-cron det på mail: leveret = «mail», leveret_at. Ét isoleret
 * pas i cronen (_shared/webinarSvarMailKoersel.ts), som aldrig rører
 * fremmødedommen.
 *
 * ÉN MAIL PR. SPØRGSMÅL — KAPLØBSSIKKERT: cronen TAGER spørgsmålet med en
 * vagtet UPDATE (`set leveret = 'mail' … where leveret is null`) FØR afsendelsen.
 * Den samme vagt står i pulsens UPDATE til «live» — så pulsen og cronen (og to
 * samtidige kørsler) kan aldrig begge levere: den, der rammer 0 rækker, har tabt.
 * Valgt frem for et spor med unikt indeks (spec'ens `webinar_svar_mails`), fordi
 * et spor skrives EFTER afsendelsen (husets form) og derfor ikke kan stoppe
 * pulsen, der leverer samme svar live i mellemtiden; vagten på selve rækken kan.
 * Udfaldet står bagefter i webinar_motor_log (art «svar_leveret», via «mail»).
 *   - ok → rækken bliver «mail».
 *   - UKENDT (timeout · `fejl` uden status · `fejl` ≥ 500 — samme dom som
 *     webinarMailDom.afsendelseUkendt; vi ved ikke, om Mailgun tog imod, og
 *     Mailgun har ingen idempotensnøgle) → rækken BLIVER «mail» og sendes aldrig
 *     igen automatisk: hellere ét manglende svar end en dublet. Alarmen går.
 *   - En TYDELIG afvisning (alt andet) → rækken gives FRI igen (leveret null,
 *     vagtet på vores eget stempel), så pulsen kan levere den, hvis seeren kommer
 *     tilbage, og næste kørsel kan prøve igen. «ugyldig» (adressen afvist) prøves
 *     aldrig igen på mail (loggen husker det) — men kan stadig leveres i rummet.
 */

/** app_config-nøglen. FRAVÆRENDE = false (fail-closed); migrationen 20261003080000 lægger den som false. */
export const SVAR_MAIL_LAAS_NOEGLE = "webinar_svar_mail_aktiv";

/** Låsens værdi: KUN boolean true eller strengen «true» åbner. Alt andet — også en læsefejl (null) — er lukket. */
export function laesSvarMailLaas(v: unknown): boolean {
  return v === true || v === "true";
}

/**
 * HVORNÅR ER SEEREN GÅET? Ingen puls i SVAR_MAIL_GAAET_SEK sekunder.
 *
 * Regnestykket (puls.ts og webinarRum/pulsplan.ts):
 *   I_RUMMET_SEK          = 60 s — «i rummet» = en puls inden for 60 s.
 *   Klientens langsomste puls = 60 s (venteværelse og pause, PULS_ROLIG_MS);
 *   efter et spørgsmål går den hver 5 s i 10 min (PULS_SPOERGSMAAL_MS).
 *   En skjult fane drosles af browseren (Chrome: timere højst én gang i minuttet),
 *   så en 60 s-puls kan lande op til ~120 s efter den forrige.
 *   3 × I_RUMMET_SEK = 180 s > 120 s → tre tomme «i rummet»-vinduer i træk
 *   er en seer, der er gået — ikke en, der står på pause med fanen skjult.
 * Cronen kører hvert 5. minut (jobbet 'webinar-motor'), så mailen når frem
 * 3–8 min efter, at seeren gik, eller op til 5 min efter svaret.
 */
export const SVAR_MAIL_GAAET_SEK = 180;

/** Et svar, der ikke er leveret efter 7 døgn, sendes ikke længere (en ny lås må ikke sende gamle svar ud). Samme vindue som fremmødedommens DOM_VINDUE_DAGE. */
export const SVAR_MAIL_VINDUE_DAGE = 7;

/**
 * BUDGETTET — en mail startes kun, hvis dens VÆRSTE forløb når at slutte før
 * jobbets timeout (samme form som webinarMailBudget og fremmoede.SENESTE_START_MS):
 *   jobbets timeout (kald_edge)          60 000 ms
 *   − margin (opstart, netværk)           5 000 ms
 *   − resttid pr. mail:  vagtet UPDATE    5 000
 *                       + Mailgun        10 000 (mailgunAfsendelse.TIMEOUT_MS)
 *                       + log/frigivelse  5 000  = 20 000 ms
 *   = seneste start                      35 000 ms efter kørslens start.
 * Passet kører EFTER fremmødet; har fremmødet brugt tiden, venter svarene til
 * næste kørsel (`udsat`).
 */
export const SVAR_MAIL_JOB_TIMEOUT_MS = 60_000;
export const SVAR_MAIL_MARGIN_MS = 5_000;
export const SVAR_MAIL_RESTTID_MS = 5_000 + 10_000 + 5_000;
export const SVAR_MAIL_SENESTE_START_MS = SVAR_MAIL_JOB_TIMEOUT_MS - SVAR_MAIL_MARGIN_MS - SVAR_MAIL_RESTTID_MS;

export const svarMailBudgetTillader = (forloebetMs: number): boolean => forloebetMs <= SVAR_MAIL_SENESTE_START_MS;

/**
 * RIGTIG AFSENDELSE KRÆVER dry_run: false OG (låsen ELLER prøven til én adresse).
 * Prøven (`email`) sender uden låsen — men KUN til den adresse (svarMailDom: «ikke_proeven»).
 */
export function svarMailSenderRigtigt(a: { toerKoersel: boolean; laas: boolean; proeveEmail: string | null }): boolean {
  return !a.toerKoersel && (a.laas || a.proeveEmail !== null);
}

export type SvarMailGrund =
  | "ikke_besvaret"
  | "allerede_leveret"
  | "tomt_svar"
  | "ingen_mail"
  | "ikke_platform"
  | "afmeldt"
  | "intern_fremmed"
  | "ikke_proeven"
  | "ugyldig_adresse"
  | "for_gammel"
  | "i_rummet";

export const SVAR_MAIL_GRUNDE: readonly SvarMailGrund[] = [
  "ikke_besvaret", "allerede_leveret", "tomt_svar", "ingen_mail", "ikke_platform",
  "afmeldt", "intern_fremmed", "ikke_proeven", "ugyldig_adresse", "for_gammel", "i_rummet",
];

/** Ét besvaret spørgsmål, som cronen har læst det — og det, cronen har slået op om personen. */
export interface SvarKandidat {
  status: string;
  leveret: string | null;
  svar_tekst: string | null;
  svaret_at: string | null;
  /** Tilmeldingens EGEN mail — aldrig en anden adresse. */
  email: string | null;
  kilde_system: string | null;
  /** webinar_afmeldinger ELLER «Unsubscribed» på rækken (webinarAfmelding.erAfmeldt). */
  afmeldt: boolean;
  sessionIntern: boolean;
  /** tilmelding.erInternAdresse(email) — husets egne domæner. */
  adresseErHusets: boolean;
  /** Seneste puls fra tilmeldingen i sessionen (webinar_deltagelser.sidste_puls_at) — null = ingen. */
  sidstePulsMs: number | null;
  /** Exitrummets slut (ur.sessionTider) — null, når sessionen ikke kan regnes. */
  sessionSlutMs: number | null;
  /** Har Mailgun før afvist adressen for dette spørgsmål (loggen, udfald «ugyldig»)? */
  tidligereUgyldig: boolean;
}

const MAIL_FORM = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SvarMailDom = { send: true } | { send: false; grund: SvarMailGrund };

/**
 * Dommen pr. spørgsmål. RÆKKEFØLGEN er dommen: rækkens egen tilstand, så
 * personen (afmeldt FØRST, så den interne session, så prøven, så en kendt
 * dårlig adresse), så tiden (for gammel, stadig i rummet).
 */
export function svarMailDom(k: SvarKandidat, a: { nuMs: number; proeveEmail: string | null }): SvarMailDom {
  if (k.status !== "besvaret") return { send: false, grund: "ikke_besvaret" };
  if (k.leveret !== null) return { send: false, grund: "allerede_leveret" };
  if ((k.svar_tekst ?? "").trim() === "") return { send: false, grund: "tomt_svar" };
  const email = (k.email ?? "").trim().toLowerCase();
  if (!MAIL_FORM.test(email)) return { send: false, grund: "ingen_mail" };
  if (k.kilde_system !== "platform") return { send: false, grund: "ikke_platform" };
  if (k.afmeldt) return { send: false, grund: "afmeldt" };
  if (k.sessionIntern && !k.adresseErHusets) return { send: false, grund: "intern_fremmed" };
  if (a.proeveEmail !== null && email !== a.proeveEmail.trim().toLowerCase()) return { send: false, grund: "ikke_proeven" };
  if (k.tidligereUgyldig) return { send: false, grund: "ugyldig_adresse" };
  const svaretMs = k.svaret_at === null ? NaN : Date.parse(k.svaret_at);
  if (!Number.isFinite(svaretMs)) return { send: false, grund: "ikke_besvaret" };
  if (a.nuMs - svaretMs > SVAR_MAIL_VINDUE_DAGE * 86_400_000) return { send: false, grund: "for_gammel" };
  const slut = k.sessionSlutMs !== null && a.nuMs >= k.sessionSlutMs;
  const gaaet = k.sidstePulsMs === null || a.nuMs - k.sidstePulsMs >= SVAR_MAIL_GAAET_SEK * 1000;
  if (!slut && !gaaet) return { send: false, grund: "i_rummet" };
  return { send: true };
}

/**
 * Afsendelsens udfald i tre: ok · ukendt (sendes ALDRIG igen automatisk) · afvist
 * (rækken gives fri). «ukendt» er ORDRET webinarMailDom.afsendelseUkendt —
 * paritetstesten prøver alle udfald og statusser mod den.
 */
export function svarUdfaldArt(udfald: string, status: number | null): "ok" | "ukendt" | "afvist" {
  if (udfald === "ok") return "ok";
  if (udfald === "timeout") return "ukendt";
  if (udfald === "fejl" && (status === null || status >= 500)) return "ukendt";
  return "afvist";
}

// ── Mailen ───────────────────────────────────────────────────────────────────

export const SVAR_MAIL_EMNE = "Svar på dit spørgsmål fra webinaret";

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const linjer = (s: string): string => esc(s).replace(/\r?\n/g, "<br/>");

export interface SvarMailArgs {
  fornavn: string | null;
  /** Spørgsmålet ORDRET, som seeren skrev det. */
  spoergsmaal: string;
  /** Svaret ORDRET, som værten skrev det. */
  svar: string;
  webinarTitel: string | null;
  vaertNavn: string | null;
  afmeldUrl: string;
}

/** Hilsenens navn: værtens fornavn — ellers Morten (afsenderen). */
export function hilsenNavn(vaertNavn: string | null | undefined): string {
  const f = (vaertNavn ?? "").trim().split(/\s+/)[0] ?? "";
  return f === "" ? "Morten" : f;
}

/**
 * Mailen. Ingen påstand om, hvornår svaret blev givet, ingen løfter om et
 * gensyn af webinaret — kun spørgsmålet og svaret, ordret, og en vej ud.
 */
export function bygSvarMail(a: SvarMailArgs): { subject: string; html: string; text: string } {
  const navn = (a.fornavn ?? "").trim().split(/\s+/)[0] ?? "";
  const hej = navn === "" ? "Hej" : `Hej ${navn}`;
  const titel = (a.webinarTitel ?? "").trim();
  const intro = titel === "" ? "Du stillede et spørgsmål under webinaret. Her er svaret." : `Du stillede et spørgsmål under webinaret «${titel}». Her er svaret.`;
  const hilsen = hilsenNavn(a.vaertNavn);
  const fod = "Du får denne mail, fordi du stillede et spørgsmål under webinaret.";
  const html = `<!DOCTYPE html>
<html lang="da"><head><meta charset="utf-8"/><meta content="width=device-width,initial-scale=1" name="viewport"/><title>${esc(SVAR_MAIL_EMNE)}</title></head>
<body style="margin:0;padding:0;background-color:#FAF8F5;">
<table cellpadding="0" cellspacing="0" role="presentation" style="background-color:#FAF8F5;width:100%;" width="100%"><tr><td align="center">
<table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:600px;margin:0 auto;font-family:'Manrope',Helvetica,Arial,sans-serif;color:#152825;" width="100%">
<tr><td style="padding:34px 32px 0 32px;font-size:10px;font-weight:700;letter-spacing:2px;color:#5C6B66;">TOPIX</td></tr>
<tr><td style="padding:24px 32px 0 32px;font-size:16px;line-height:28px;">${esc(hej)},</td></tr>
<tr><td style="padding:12px 32px 0 32px;font-size:16px;line-height:28px;">${esc(intro)}</td></tr>
<tr><td style="padding:22px 32px 0 32px;"><table cellpadding="0" cellspacing="0" role="presentation" width="100%" style="background-color:#EFF6F2;border-radius:6px;"><tr><td style="padding:18px 22px;font-size:15px;line-height:26px;"><div style="font-size:11px;font-weight:700;letter-spacing:1.4px;color:#5C6B66;">DIT SPØRGSMÅL</div>${linjer(a.spoergsmaal)}</td></tr></table></td></tr>
<tr><td style="padding:16px 32px 0 32px;"><table cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border:1px solid #D8D4CC;border-radius:6px;"><tr><td style="padding:18px 22px;font-size:15px;line-height:26px;"><div style="font-size:11px;font-weight:700;letter-spacing:1.4px;color:#5C6B66;">SVARET</div>${linjer(a.svar)}</td></tr></table></td></tr>
<tr><td style="padding:22px 32px 0 32px;font-size:16px;line-height:28px;">Har du flere spørgsmål, kan du svare på denne mail.</td></tr>
<tr><td style="padding:22px 32px 0 32px;font-size:16px;line-height:28px;">Venlig hilsen<br/>${esc(hilsen)}</td></tr>
<tr><td style="padding:34px 32px 36px 32px;font-size:11px;line-height:18px;color:#5C6B66;">${esc(fod)} Du kan <a href="${esc(a.afmeldUrl)}" style="color:#5C6B66;text-decoration:underline;">afmelde dig webinarmails her</a>.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    `${hej},`,
    intro,
    `Dit spørgsmål:\n${a.spoergsmaal}`,
    `Svaret:\n${a.svar}`,
    "Har du flere spørgsmål, kan du svare på denne mail.",
    `Venlig hilsen\n${hilsen}`,
    "---",
    `${fod} Afmeld dig webinarmails her: ${a.afmeldUrl}`,
  ].join("\n\n");
  return { subject: SVAR_MAIL_EMNE, html, text };
}

// ── Svaret fra cronen (beviset) og alarmen ───────────────────────────────────

export interface SvarMailResultat {
  /** app_config.webinar_svar_mail_aktiv som læst (fail-closed). */
  laas_aktiv: boolean;
  /** dry_run: false OG (låsen ELLER prøven). */
  sender_rigtigt: boolean;
  /** Kørslen er prøven til én adresse (`email` i body). */
  proeve: boolean;
  /** Besvarede, ikke-leverede spørgsmål, læst i kørslen. */
  kandidater: number;
  /** Dem, dommen ville sende (i tørkørslen: ville sende). */
  skal_sendes: number;
  sendt: number;
  sprunget: number;
  sprunget_grunde: Partial<Record<SvarMailGrund, number>>;
  /** Taget af pulsen (live) eller en anden kørsel imellem læsning og vagtet UPDATE. */
  taget_imens: number;
  fejlede: number;
  /** Udfald, hvor vi ikke ved, om Mailgun tog imod — sendes aldrig igen. */
  ukendte: number;
  udsat: number;
  /** Mailgun sagde stop (403 · 420 · 429) i kørslen — resten venter. */
  stoppet: boolean;
  /**
   * Mailgun-kontoen er ÉN (spec §D6): forsøg de sidste 60 min i webinar_mails OG
   * svarmailenes egne (loggen) tælles mod MAILGUN_LOFT_PR_TIME; har Mailgun sagt
   * stop i vinduet, venter svarene til pausen er forbi (`pause_til`).
   */
  loft: { maks: number | null; pause_til: string | null };
  alarm: string;
  fejl: string[];
}

export function tomtSvarMailResultat(a: { laas: boolean; senderRigtigt: boolean; proeve: boolean }): SvarMailResultat {
  return {
    laas_aktiv: a.laas, sender_rigtigt: a.senderRigtigt, proeve: a.proeve,
    kandidater: 0, skal_sendes: 0, sendt: 0, sprunget: 0, sprunget_grunde: {}, taget_imens: 0,
    fejlede: 0, ukendte: 0, udsat: 0, stoppet: false, loft: { maks: null, pause_til: null }, alarm: "ingen", fejl: [],
  };
}

/** Alarm KUN i en rigtig kørsel (aldrig i tørkørslen), og kun når noget gik galt. */
export function skalSvarMailAlarmere(r: Pick<SvarMailResultat, "sender_rigtigt" | "fejlede" | "ukendte" | "stoppet" | "fejl">): boolean {
  return r.sender_rigtigt && (r.fejlede > 0 || r.ukendte > 0 || r.stoppet || r.fejl.length > 0);
}

/** Én alarm pr. dansk TIME: nøglen bærer «YYYY-MM-DDTHH» i dansk tid (kalderen regner den). */
export const SVAR_MAIL_ALARM_PRAEFIKS = "webinar-svar-mail:";
export const svarMailAlarmNoegle = (danskDatoTime: string): string => `${SVAR_MAIL_ALARM_PRAEFIKS}${danskDatoTime}`;

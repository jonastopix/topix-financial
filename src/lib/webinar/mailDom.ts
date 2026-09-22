/**
 * webinarMailDom — HVEM får HVILKEN før-webinar-mail HVORNÅR (22/9-2026).
 *
 * SPEJL af supabase/functions/_shared/webinarMailDom.ts. Kroppen efter dette
 * filhoved er ORDRET ens (paritetsprøven src/lib/__tests__/webinarMailDom.paritet.test.ts
 * sammenligner tegn for tegn OG svarene på samme input). Nul imports i begge.
 *
 * Hvorfor et spejl: cronen afgør, hvad der SENDES, og fladen skal kunne vise
 * det samme uden at gætte — og prøverne kører i vitest, hvor Deno ikke findes.
 */

// ── Arterne ────────────────────────────────────────────────────────────────

export type MailArt = "bekraeftelse" | "syv_dage" | "tre_dage" | "en_dag" | "dagen" | "en_time";

/** I den rækkefølge de sendes. Rækkefølgen er dommens, ikke fladens. */
export const ARTER: readonly MailArt[] = ["bekraeftelse", "syv_dage", "tre_dage", "en_dag", "dagen", "en_time"];

/**
 * Planen, som Jonas satte den 22/9. To slags:
 *   dageFoer + klokke  — en KALENDERDAG før sessionen, på et dansk klokkeslæt.
 *                        Sommertid gør ikke en forskel: «kl. 08:00 dansk» er
 *                        kl. 08:00, uanset om det er juli eller januar.
 *   minutterFoer       — et stykke tid før selve sessionen, absolut.
 */
export interface Plan {
  art: MailArt;
  /** Kalenderdage før sessionens danske dato. */
  dageFoer?: number;
  /** Dansk klokkeslæt på den dag. */
  time?: number;
  minut?: number;
  /** Eller: minutter før sessionens tidspunkt, absolut. */
  minutterFoer?: number;
  /**
   * Eller: FORFALDEN STRAKS, så længe sessionen ligger i fremtiden.
   *
   * Bekræftelsen har intet tidspunkt at regne fra — den skal gå, så snart vi
   * ved, at personen er tilmeldt, og den skal gå BAGUD til alle, der allerede
   * er tilmeldt uden at have fået en. (Jonas' fund 22/9: eWebinars egen
   * bekræftelse var slået FRA indtil kl. 15:50, så de fleste af de ~212 til
   * 13/10 har aldrig fået én.)
   *
   * En «straks»-mail har derfor INGEN nåde-regel: den kan ikke være for sent
   * på den, for den har aldrig haft et tidspunkt at komme for sent til.
   * Den eneste dør, der lukker den, er sporet — én ok-række pr. person og
   * session — og at sessionen er begyndt.
   */
  straks?: boolean;
  /** Må mailen først sendes, når sessionen IKKE er begyndt? */
  kraeverIkkeBegyndt: boolean;
}

export const PLANEN: readonly Plan[] = [
  // Bekræftelsen FØRST — både i listen og i tid.
  { art: "bekraeftelse", straks: true, kraeverIkkeBegyndt: true },
  { art: "syv_dage", dageFoer: 7, time: 8, minut: 0, kraeverIkkeBegyndt: false },
  { art: "tre_dage", dageFoer: 3, time: 8, minut: 0, kraeverIkkeBegyndt: false },
  { art: "en_dag", dageFoer: 1, time: 8, minut: 0, kraeverIkkeBegyndt: false },
  // «Det er i dag» kl. 07:30 — før arbejdsdagen, og før nogen har glemt det.
  { art: "dagen", dageFoer: 0, time: 7, minut: 30, kraeverIkkeBegyndt: true },
  // «Om en time» — det er DEN, der bærer join-linket til en, der er på vej.
  { art: "en_time", minutterFoer: 60, kraeverIkkeBegyndt: true },
];

/**
 * NÅDEN FOR EN SEN TILMELDING. Melder nogen sig til fire dage før, er
 * «syv_dage»-tidspunktet passeret for længst — og «om en uge ses vi» er
 * forkert. Er tidspunktet passeret med MERE end det her, sendes mailen aldrig.
 *
 * To timer, ikke nul: cronen kører hvert femte minut, men en kørsel kan være
 * afbrudt, en udrulning kan have taget en time, og en mail, der er en time
 * forsinket, er stadig rigtig. En mail, der er en dag forsinket, er ikke.
 */
export const SEN_TILMELDING_NAADE_MS = 2 * 3_600_000;

export const TZ = "Europe/Copenhagen";

// ── Dansk tid uden imports (samme metode som _shared/hverdage.ts) ──────────

const FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

interface KbhDele { aar: number; maaned: number; dag: number; time: number; minut: number }

export function kbhDele(d: Date): KbhDele {
  const p: Record<string, string> = {};
  for (const del of FORMAT.formatToParts(d)) p[del.type] = del.value;
  return { aar: Number(p.year), maaned: Number(p.month), dag: Number(p.day), time: Number(p.hour) % 24, minut: Number(p.minute) };
}

/** Den danske tidszones forskydning (ms) fra UTC på et tidspunkt: vægtid − instant. */
function forskydningMs(d: Date): number {
  const p = kbhDele(d);
  return Date.UTC(p.aar, p.maaned - 1, p.dag, p.time, p.minut) - Math.floor(d.getTime() / 60_000) * 60_000;
}

/**
 * Dansk vægtid → UTC-instant. To runder, fordi gættet kan ramme den anden side
 * af et sommertidsskifte; anden runde retter det.
 */
export function kbhTilUtc(aar: number, maaned: number, dag: number, time: number, minut: number): Date {
  const gaet = Date.UTC(aar, maaned - 1, dag, time, minut);
  const f1 = forskydningMs(new Date(gaet));
  let instant = gaet - f1;
  const f2 = forskydningMs(new Date(instant));
  if (f2 !== f1) instant = gaet - f2;
  return new Date(instant);
}

// ── Tidspunktet for én mail ────────────────────────────────────────────────

/**
 * Hvornår skal mailen `art` gå for en session på `sessionTid`?
 * `null` når tiden ikke kan læses — kalderen springer over frem for at gætte.
 */
export function planlagtTid(sessionTid: string, art: MailArt): Date | null {
  const ms = Date.parse(sessionTid);
  if (!Number.isFinite(ms)) return null;
  const plan = PLANEN.find((p) => p.art === art);
  if (!plan) return null;
  // «Straks» har intet tidspunkt at regne. Epoken betyder «forfalden siden
  // altid»; doemMail springer nåde-reglen over for netop de arter, så en
  // bekræftelse aldrig kan blive «for sent».
  if (plan.straks === true) return new Date(0);
  if (plan.minutterFoer !== undefined) return new Date(ms - plan.minutterFoer * 60_000);
  const p = kbhDele(new Date(ms));
  // Kalenderdage trækkes fra på den DANSKE dato, ikke på instantet: 7 dage før
  // en session 13/10 er 6/10, også hen over et sommertidsskifte.
  const dagen = new Date(Date.UTC(p.aar, p.maaned - 1, p.dag) - (plan.dageFoer ?? 0) * 86_400_000);
  return kbhTilUtc(
    dagen.getUTCFullYear(), dagen.getUTCMonth() + 1, dagen.getUTCDate(),
    plan.time ?? 8, plan.minut ?? 0,
  );
}

export type Springgrund =
  | "afmeldt"
  | "ingen_session"
  | "ingen_mail"
  | "for_sent"
  | "endnu_ikke"
  | "sessionen_begyndt"
  | "allerede_sendt";

export type MailDom =
  | { send: true; art: MailArt; planlagt: Date }
  | { send: false; art: MailArt; grund: Springgrund };

/**
 * Skal ÉN mail af ÉN art sendes til ÉN person nu?
 *
 * Rækkefølgen er dommen, og den er fail-closed: alt, der taler imod, tæller
 * FØR det, der taler for.
 */
export function doemMail(i: {
  art: MailArt;
  sessionTid: string | null;
  email: string | null | undefined;
  afmeldt: boolean;
  alleredeSendt: boolean;
  nu: Date;
}): MailDom {
  const { art } = i;
  if (i.afmeldt) return { send: false, art, grund: "afmeldt" };
  if (i.alleredeSendt) return { send: false, art, grund: "allerede_sendt" };
  const mail = (i.email ?? "").trim().toLowerCase();
  if (!mail || !mail.includes("@")) return { send: false, art, grund: "ingen_mail" };
  if (i.sessionTid === null) return { send: false, art, grund: "ingen_session" };
  const sessionMs = Date.parse(i.sessionTid);
  if (!Number.isFinite(sessionMs)) return { send: false, art, grund: "ingen_session" };

  const plan = PLANEN.find((p) => p.art === art);
  if (!plan) return { send: false, art, grund: "ingen_session" };
  // «Det er i dag» og «om en time» må ALDRIG gå efter starten — så er det ikke
  // en påmindelse, det er en besked om noget, der allerede sker.
  if (plan.kraeverIkkeBegyndt && i.nu.getTime() >= sessionMs) {
    return { send: false, art, grund: "sessionen_begyndt" };
  }

  const tid = planlagtTid(i.sessionTid, art);
  if (tid === null) return { send: false, art, grund: "ingen_session" };
  // «STRAKS»: forfalden nu, og aldrig for sent. Sessionen er i fremtiden
  // (kraeverIkkeBegyndt ovenfor), sporet er tomt (allerede_sendt ovenfor) —
  // så er der intet mere at spørge om. Tidspunktet i sporet bliver NU, ikke
  // epoken, så rækken kan læses bagud.
  if (plan.straks === true) return { send: true, art, planlagt: i.nu };
  const forsinkelse = i.nu.getTime() - tid.getTime();
  if (forsinkelse < 0) return { send: false, art, grund: "endnu_ikke" };
  // Sen tilmelding: «om en uge ses vi» til en, der meldte sig i går, er forkert.
  if (forsinkelse > SEN_TILMELDING_NAADE_MS) return { send: false, art, grund: "for_sent" };
  return { send: true, art, planlagt: tid };
}

// ── Fra rækker til sendinger ───────────────────────────────────────────────

/** Så lidt af webinar_tilmeldinger, som dommen behøver. */
export interface Tilmeldt {
  ewebinar_id: string;
  email: string;
  navn: string | null;
  session_tid: string | null;
  webinar_titel: string | null;
  subscribed: string | null;
  sidste_action: string | null;
  join_link: string | null;
  kalender_link: string | null;
  replay_link: string | null;
}

/** Én mail, der skal sendes. Personen er én — uanset hvor mange registreringer. */
export interface Sending {
  email: string;
  sessionTid: string;
  art: MailArt;
  planlagt: string;
  navn: string | null;
  webinarTitel: string | null;
  joinLink: string | null;
  kalenderLink: string | null;
  /** Den registrering, linkene kom fra — til sporet, ikke til nøglen. */
  ewebinarId: string;
}

/** «Har personen sagt fra i eWebinar?» — samme regel som webinarAfmelding.erAfmeldt. */
export function erAfmeldtIEwebinar(r: Pick<Tilmeldt, "subscribed" | "sidste_action">): boolean {
  const s = (r.subscribed ?? "").trim().toLowerCase();
  const a = (r.sidste_action ?? "").trim().toLowerCase();
  return s === "unsubscribed" || a === "unsubscribed";
}

/** Nøglen, sporet er unikt på: én mail pr. person pr. session pr. art. */
export function noegle(email: string, sessionTid: string, art: MailArt): string {
  return `${email.trim().toLowerCase()}|${new Date(sessionTid).toISOString()}|${art}`;
}

/**
 * ÉN PERSON, ÉN SESSION — uanset hvor mange registreringer. Den række, der
 * vinder, er den med FLEST links: en gammel registrering uden join_link må
 * ikke slå en ny med. Ved lige stand vinder den, der kom først i listen.
 */
function bedsteRaekke(a: Tilmeldt, b: Tilmeldt): Tilmeldt {
  const vaegt = (r: Tilmeldt) => (r.join_link ? 2 : 0) + (r.kalender_link ? 1 : 0);
  return vaegt(b) > vaegt(a) ? b : a;
}

/**
 * Hele planen for én kørsel: hvilke mails skal sendes NU.
 *
 * `sendte` er nøglerne fra webinar_mails med udfald ok (noegle()). Databasen er
 * stadig dommeren — det unikke indeks forhindrer to samtidige kørsler i at
 * sende det samme — men vi spørger først, så vi ikke bygger 384 mails for at
 * få 384 afvisninger.
 *
 * `afmeldte` er mails fra webinar_afmeldinger (små bogstaver).
 */
export function planlaegKoersel(i: {
  raekker: readonly Tilmeldt[];
  afmeldte: ReadonlySet<string>;
  sendte: ReadonlySet<string>;
  nu: Date;
}): { sendinger: Sending[]; sprunget: Record<Springgrund, number> } {
  const sprunget: Record<Springgrund, number> = {
    afmeldt: 0, ingen_session: 0, ingen_mail: 0, for_sent: 0,
    endnu_ikke: 0, sessionen_begyndt: 0, allerede_sendt: 0,
  };

  // 1. Én person pr. (mail, session).
  const personer = new Map<string, Tilmeldt>();
  for (const r of i.raekker) {
    const mail = (r.email ?? "").trim().toLowerCase();
    if (r.session_tid === null || !Number.isFinite(Date.parse(r.session_tid))) continue;
    const n = `${mail}|${new Date(r.session_tid).toISOString()}`;
    const har = personer.get(n);
    personer.set(n, har ? bedsteRaekke(har, r) : r);
  }

  // 2. Afmeldingen gælder PERSONEN, ikke registreringen — og den læses på
  //    ALLE personens rækker: en afmelding kan stå på en anden tilmelding end
  //    den kommende (samme regel som klaviyo-profil-cron).
  const afmeldtIEwebinar = new Set<string>();
  for (const r of i.raekker) {
    if (erAfmeldtIEwebinar(r)) afmeldtIEwebinar.add((r.email ?? "").trim().toLowerCase());
  }

  const sendinger: Sending[] = [];
  for (const r of [...personer.values()]) {
    const mail = r.email.trim().toLowerCase();
    const afmeldt = i.afmeldte.has(mail) || afmeldtIEwebinar.has(mail);
    for (const art of ARTER) {
      const dom = doemMail({
        art,
        sessionTid: r.session_tid,
        email: mail,
        afmeldt,
        alleredeSendt: r.session_tid !== null && i.sendte.has(noegle(mail, r.session_tid, art)),
        nu: i.nu,
      });
      // `=== false`, ikke `!dom.send`: repoets tsconfig har strict slået fra, og
      // uden strictNullChecks indsnævrer et bart boolean-felt ikke en
      // diskrimineret union (samme fælde som cvrLoft.laesTal).
      if (dom.send === false) { sprunget[dom.grund]++; continue; }
      sendinger.push({
        email: mail,
        sessionTid: new Date(r.session_tid as string).toISOString(),
        art,
        planlagt: dom.planlagt.toISOString(),
        navn: r.navn,
        webinarTitel: r.webinar_titel,
        joinLink: r.join_link,
        kalenderLink: r.kalender_link,
        ewebinarId: r.ewebinar_id,
      });
    }
  }
  // Ældste planlagte først — den, der har ventet længst, går først.
  sendinger.sort((a, b) => a.planlagt.localeCompare(b.planlagt) || a.email.localeCompare(b.email));
  return { sendinger, sprunget };
}

// ── Kalenderlinkene ────────────────────────────────────────────────────────

/** Sessionens længde i mailenes kalenderlinks. Webinaret er «en time» (Mortens egne ord). */
export const VARIGHED_MIN = 60;

/** «20261013T090000Z» — Googles form. */
export function googleTid(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Google Kalender. Formen er UOFFICIEL — Google dokumenterer den ikke selv;
 * den bedste kilde er add-event-to-calendar-docs:
 *   action   «A default required parameter with the value TEMPLATE.»
 *   text     «Event title, formatted as text.»
 *   dates    «… formatted as YYYYMMDDTHHmmSSZ/YYYYMMDDTHHmmSSZ. Dates must have
 *             both start and end time or it won't work.»
 *   details  valgfri — beskrivelsen; her står join-linket
 * <https://interactiondesignfoundation.github.io/add-event-to-calendar-docs/services/google.html>
 */
export function googleKalenderUrl(i: { titel: string; sessionTid: string; joinLink: string | null }): string | null {
  const ms = Date.parse(i.sessionTid);
  if (!Number.isFinite(ms)) return null;
  const p = new URLSearchParams();
  p.set("action", "TEMPLATE");
  p.set("text", i.titel);
  p.set("dates", `${googleTid(new Date(ms))}/${googleTid(new Date(ms + VARIGHED_MIN * 60_000))}`);
  if (i.joinLink) {
    p.set("details", `Link til webinaret: ${i.joinLink}`);
    p.set("location", i.joinLink);
  }
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/**
 * Outlook på nettet. Formen er UOFFICIEL — Microsoft dokumenterer den kun i
 * Q&A-svar, og parametrene er: subject, startdt, enddt, body, location, samt
 * `path=/calendar/action/compose` og `rru=addevent`. Tidsformen er «ISO
 * 8601-like: YYYY-MM-DDTHH:mm:ss» — altså en ANDEN form end Googles.
 * <https://learn.microsoft.com/en-us/answers/questions/4619953/want-to-pre-populate-to-cc-subject-body-by-passing>
 */
export function outlookTid(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function outlookKalenderUrl(i: { titel: string; sessionTid: string; joinLink: string | null }): string | null {
  const ms = Date.parse(i.sessionTid);
  if (!Number.isFinite(ms)) return null;
  const p = new URLSearchParams();
  p.set("path", "/calendar/action/compose");
  p.set("rru", "addevent");
  p.set("subject", i.titel);
  p.set("startdt", outlookTid(new Date(ms)));
  p.set("enddt", outlookTid(new Date(ms + VARIGHED_MIN * 60_000)));
  if (i.joinLink) {
    p.set("body", `Link til webinaret: ${i.joinLink}`);
    p.set("location", i.joinLink);
  }
  return `https://outlook.office.com/calendar/0/deeplink/compose?${p.toString()}`;
}

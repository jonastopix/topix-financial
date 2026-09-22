/**
 * klaviyoAfmelding — platformens afmelding af en mailadresse fra
 * e-mailmarkedsføring hos Klaviyo (udkast 22/9-2026,
 * ~/Downloads/recon-ewebinar-afmelding.md).
 *
 * BESLUTTET (Jonas 22/9): en afmelding i eWebinar = GLOBAL afmelding fra
 * e-MAILMARKEDSFØRING i Klaviyo. Consent UNSUBSCRIBED, uden `list_id`.
 * IKKE undertrykkelse (suppression). Grunden står i recon'en §3.3: en
 * afmelding flytter SAMTYKKET, en undertrykkelse flytter kun rækkeevnen og
 * lader samtykket stå. Det, personen har bedt om, er det første.
 *
 * ENDEPUNKTET, ordret fra Klaviyos reference
 * (https://developers.klaviyo.com/en/reference/unsubscribe_profiles):
 *
 *   POST /api/profile-subscription-bulk-delete-jobs
 *   «Unsubscribe one or more profiles from email marketing, SMS marketing,
 *    push marketing, or a combination.»
 *   «Profiles not in the specified list will be globally unsubscribed. Always
 *    verify profile list membership before calling this endpoint to avoid
 *    unintended global unsubscribes.»
 *   «If a profile cannot be found matching the given identifier(s), a new
 *    profile will be created and then unsubscribed.»
 *   Scopes: `lists:write`, `profiles:write`, `subscriptions:write`
 *   Loft:   burst 75/s · steady 750/m      Svar: 202      Maks. 100 profiler pr. kald
 *
 * VI SENDER UDEN `list_id`, OG DET ER MENINGEN. Citatet ovenfor kalder det en
 * ADVARSEL, fordi de fleste kaldere vil ramme én liste. Vores beslutning er
 * netop den globale: personen har afmeldt sig vores mails, ikke én liste.
 *
 * KUN EMAIL-KANALEN, KUN MARKETING. Kroppen bærer `subscriptions.email
 * .marketing.consent = "UNSUBSCRIBED"` og INTET andet — ingen `sms`, ingen
 * `push`, intet telefonnummer. eWebinar har kun sagt noget om mails.
 * Transaktionelle mails rører dette ikke (recon §3.3).
 *
 * ÉN PROFIL PR. KALD. Endepunktet tager op til 100, men vi sender én ad
 * gangen: sporet skal kunne sige udfaldet PR. MAIL, og et 202 på en pulje på
 * 100 ville sige «modtaget» om alle uden at sige noget om nogen. Lofterne
 * (75/s) er der rigelig plads i — 9 mails bagud, og derefter en ad gangen.
 *
 * EGEN SECRET, OG DEN EKSISTERENDE RØRES IKKE. `KLAVIYO_AFMELD_KEY` er en NY
 * privat nøgle med præcis tre scopes: `profiles:write`, `lists:write`,
 * `subscriptions:write`. Grunden er Klaviyos egen regel, ordret
 * (https://developers.klaviyo.com/en/reference/api_overview):
 *   «Note that you cannot add a scope to an existing private key. You also
 *    cannot edit a private API key after it's been created.»
 * `KLAVIYO_API_KEY` kan altså ikke få `subscriptions:write` tilføjet, og at
 * lave den om ville røre alt det, der virker i dag (hændelser, motoren,
 * profilen). To nøgler er ikke en dublet — det er det eneste, Klaviyo tillader.
 *
 * NØGLEN LÆSES ÉT STED. Denne fil er DENO-FRI (nøglen gives ind), præcis som
 * `klaviyo.ts` og `klaviyoHaendelser.ts` — så hele filen kan prøves i vitest
 * uden at trække Deno-globaler ind i tsc's graf. Den ENE `Deno.env.get` står i
 * `klaviyoAfsendelse.ts` (`afmeldHvisNoegle`), husets udpegede sted.
 *
 * FAIL-SOFT. `kald` kaster aldrig, sporet skrives i try/catch, og kaldstedet
 * (webhooken) må aldrig kunne vælte af en afmelding. Timeout er husets
 * TIMEOUT_MS (3 s).
 *
 * IDEMPOTENSEN BOR I SPORET. Klaviyo dokumenterer INGEN idempotensnøgle på
 * dette endepunkt (recon §3.4) — modsat `unique_id` på `/events`. Derfor har
 * `klaviyo_afmeldinger` en unik regel på (email) WHERE udfald = 'ok': lykkes
 * en afmelding én gang, kan den aldrig skrives som lykket igen, og
 * `vaelgGenafmeldinger` finder den ikke mere.
 */
import { kald, type KaldValg, type KlaviyoSpor, noeglenErBrugbar, TIMEOUT_MS } from "./klaviyo.ts";

/** Secret'ens navn i Lovable. Læses KUN i klaviyoAfsendelse.afmeldHvisNoegle. */
export const KLAVIYO_AFMELD_SECRET = "KLAVIYO_AFMELD_KEY";

/**
 * Stien. Husets regel (klaviyo.ts): «Klaviyo bruger afsluttende skråstreg i
 * dokumentationen, og vi gentager den, så en 308-omdirigering aldrig bliver
 * til en tavs fejl.» Referencen skriver endepunktet UDEN skråstreg; huset
 * sender med, og det er bevist i drift for `/events/`. UMÅLT for dette
 * endepunkt — første rigtige kald er beviset (README, trin 7).
 */
export const AFMELD_STI = "/profile-subscription-bulk-delete-jobs/";

/** Klaviyos loft for dette endepunkt, målt i referencen. Vi sender én ad gangen. */
export const AFMELD_LOFT_BURST_PR_SEKUND = 75;
export const AFMELD_LOFT_VEDVARENDE_PR_MINUT = 750;
/** Referencens grænse: «Maximum 100 profiles per call». Vi bruger 1 — se filhovedet. */
export const AFMELD_MAKS_PR_KALD = 100;

/**
 * Hvor afmeldingen kom fra. Skrives i sporet, så en række kan spores tilbage.
 *
 * `webinar_mail` (22/9-2026): afmeldingslinket i PLATFORMENS egne
 * før-webinar-mails. Jonas besluttede, at ét klik skal betyde ét: den
 * afmelder både husets webinarmails (webinar_afmeldinger) og Klaviyos globale
 * e-mailmarkedsføring — samme regel og samme kald som en afmelding i eWebinar.
 * Listen SKAL holdes i takt med CHECK'en i migrationen
 * 20260922180000_klaviyo_afmeldinger_webinar_mail.sql; kildeværnet
 * webinarMail.guard dom 7 holder de to op mod hinanden.
 */
export const AFMELD_KILDER = ["webhook", "import", "bagud", "webinar_mail"] as const;
export type AfmeldKilde = (typeof AFMELD_KILDER)[number];

/**
 * Udfaldene, sporet må bære. DET ER KLAVIYO.TS' EGNE — ikke en kortere liste.
 *
 * FÆLDEN, DER ER UNDGÅET HER (CLAUDE.md, Klaviyo-motoren): «skrivSpor indsætter
 * hele objektet, så en manglende kolonne vælter hver sporskrivning». Samme
 * gælder en for snæver CHECK: `udfaldAfStatus` (klaviyo.ts) svarer «loft» på
 * 429 og «ugyldig» på 400/422, og netop 429 er realistisk, når bagud-fejet
 * sender flere. Stod de to ikke på listen, ville en 429 gøre sporskrivningen
 * til en constraint-fejl — og så tabte vi beviset for den fejl, vi skulle se.
 * «ingen_mail» er med, fordi `KlaviyoUdfald` bærer den; den kan ikke opstå her
 * (der er altid en mail), men typen skal kunne rummes af tabellen.
 */
export const AFMELD_UDFALD = ["ok", "ingen_noegle", "ingen_mail", "noegle_afvist", "loft", "ugyldig", "fejl", "timeout"] as const;

/** Så lidt af Supabase-klienten som sporet behøver — så filen kan prøves uden en rigtig. */
export interface AfmeldSkriver {
  from(tabel: string): {
    insert(raekke: unknown): PromiseLike<{ error: { message: string } | null }>;
  };
}

export interface Afmelding {
  /** Lykkedes kaldet (202)? */
  sendt: boolean;
  spor: KlaviyoSpor;
  /** Præcis den krop, der gik (eller ville gå) afsted. */
  krop: Record<string, unknown>;
}

export interface AfmeldInput {
  email: string;
  kilde: AfmeldKilde;
  /** eWebinars registrant-id, når vi har det (webhooken har; bagud-fejet kan have). */
  ewebinarId?: string | null;
}

/**
 * Kroppen — ordret efter referencens eksempel, beskåret til det, vi mener:
 * én profil, email-kanalen, marketing-samtykket, UNSUBSCRIBED. Intet
 * `list_id` (globalt, jf. beslutningen), intet telefonnummer, ingen sms/push.
 */
export function bygAfmeldKrop(email: string): Record<string, unknown> {
  const mail = email.trim().toLowerCase();
  return {
    data: {
      type: "profile-subscription-bulk-delete-job",
      attributes: {
        profiles: {
          data: [
            {
              type: "profile",
              attributes: {
                email: mail,
                subscriptions: { email: { marketing: { consent: "UNSUBSCRIBED" } } },
              },
            },
          ],
        },
      },
    },
  };
}

/** Er strengen brugbar som mailadresse? Samme lave krav som klaviyoHaendelser.brugbarMail. */
export function brugbarAfmeldMail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.trim().includes("@") && email.trim().length > 2;
}

/**
 * Rækken i `klaviyo_afmeldinger` — ÉN pr. forsøg, også de mislykkede, og også
 * dem der aldrig blev forsøgt (ingen nøgle, ingen mail). Ingen tavs sti:
 * hver `return` i `afmeld` kommer EFTER en `skrivAfmeldSpor`.
 */
async function skrivAfmeldSpor(
  skriver: AfmeldSkriver | null,
  i: AfmeldInput,
  spor: KlaviyoSpor,
  nu: Date,
): Promise<void> {
  if (!skriver) return;
  try {
    const { error } = await skriver.from("klaviyo_afmeldinger").insert({
      email: i.email.trim().toLowerCase(),
      kilde: i.kilde,
      ewebinar_id: i.ewebinarId ?? null,
      forsoegt_at: nu.toISOString(),
      udfald: spor.udfald,
      status: spor.status,
      varighed_ms: spor.varighed_ms,
      svar: spor.svar,
      grund: spor.grund,
    });
    // 23505 = den unikke regel på (email) WHERE udfald = 'ok' — mailen ER
    // afmeldt i forvejen. Det er ikke en fejl; det er reglen, der virker.
    if (error && !/duplicate key|23505/i.test(error.message)) {
      console.error(`[klaviyo-afmeld] sporet kunne ikke skrives for ${i.email}:`, error.message);
    }
  } catch (e) {
    console.error(`[klaviyo-afmeld] sporet kastede for ${i.email}:`, e);
  }
}

/**
 * Afmeld ÉN mail hos Klaviyo, og skriv sporet. KASTER IKKE (kald kaster
 * aldrig; sporet er fail-soft). Nøglen gives ind — den læses i
 * klaviyoAfsendelse.afmeldHvisNoegle.
 */
export async function afmeld(
  skriver: AfmeldSkriver | null,
  noegle: string | null | undefined,
  i: AfmeldInput,
  valg: KaldValg & { nuDato?: Date } = {},
): Promise<Afmelding> {
  const mail = i.email.trim().toLowerCase();
  const nu = valg.nuDato ?? new Date();
  const krop = bygAfmeldKrop(mail);
  const tomtSpor = (udfald: (typeof AFMELD_UDFALD)[number], grund: string): KlaviyoSpor => ({
    udfald, metode: "POST", sti: AFMELD_STI, status: null, svar: null, grund, varighed_ms: 0,
  });

  // Ingen brugbar mail: intet kald, men en RÆKKE — ellers kan «vi afmeldte
  // ingen» ikke skelnes fra «der var ingen at afmelde» (klaviyo.guard dom 7's
  // lærdom, gentaget her).
  if (!brugbarAfmeldMail(mail)) {
    const spor = tomtSpor("ingen_mail", `«${String(i.email).slice(0, 60)}» er ikke en brugbar mailadresse`);
    await skrivAfmeldSpor(skriver, { ...i, email: mail }, spor, nu);
    return { sendt: false, spor, krop };
  }

  // Nøglen dømmes HER og ikke af `kald`, fordi `kald`s egen forklaring nævner
  // KLAVIYO_API_KEY — og det er den FORKERTE nøgle for dette kald. En grund,
  // der peger på den forkerte secret, sender den, der retter fejlen, det
  // forkerte sted hen.
  if (!noeglenErBrugbar(noegle)) {
    const spor = tomtSpor(
      "ingen_noegle",
      noegle
        ? `${KLAVIYO_AFMELD_SECRET} ser ikke ud som en privat nøgle (skal starte med pk_)`
        : `${KLAVIYO_AFMELD_SECRET} er ikke sat i Lovable → Secrets`,
    );
    await skrivAfmeldSpor(skriver, { ...i, email: mail }, spor, nu);
    return { sendt: false, spor, krop };
  }

  const { nuDato: _nuDato, ...kaldValg } = valg;
  const svar = await kald(noegle, AFMELD_STI, { ...kaldValg, metode: "POST", krop, timeoutMs: kaldValg.timeoutMs ?? TIMEOUT_MS });
  await skrivAfmeldSpor(skriver, { ...i, email: mail }, svar.spor, nu);
  if (!svar.ok) {
    console.error(`[klaviyo-afmeld] ${mail} blev IKKE afmeldt (${svar.spor.udfald}): ${svar.spor.grund ?? ""}`);
  }
  return { sendt: svar.ok, spor: svar.spor, krop };
}

// ── Hvad der mangler, og hvad der skal prøves igen ─────────────────────────
//
// INGEN TRAPPE, INGEN «OPGIVET». Gensenderen for hændelser (klaviyoGensend.ts)
// har et vindue på 24 timer og giver op efter seks forsøg — rimeligt for en
// marketinghændelse, der taber sin værdi. En AFMELDING taber ikke sin værdi:
// den skal lykkes, uanset hvor gammel den er. Derfor er reglen her kun: har
// mailen en ok-række? Nej → prøv igen. Med en afstand, så et 429 ikke
// besvares med et nyt 429 i samme minut.

/** Minutter, der mindst skal gå mellem to forsøg på samme mail. */
export const AFMELD_AFSTAND_MIN = 5;

/** Så meget af en række i klaviyo_afmeldinger, som dommen behøver. */
export interface AfmeldSporRaekke {
  email: string;
  udfald: string;
  forsoegt_at: string;
}

export interface Genafmeldinger {
  /** Mails uden ok-række, hvis sidste forsøg er gammelt nok — prøv igen nu. */
  proev: string[];
  /** Mails uden ok-række, men forsøgt for nylig — vent. */
  venter: string[];
  /** Mails med en ok-række — færdige. */
  afmeldt: string[];
}

/**
 * Hvilke af de ønskede mails mangler stadig en vellykket afmelding?
 *
 * @param oensket  alle mails, der SKAL være afmeldt (fra eWebinar-siden)
 * @param spor     alle rækker i klaviyo_afmeldinger for de samme mails
 * @param nu       tiden gives ind — den gættes ikke (CLAUDE.md, §«tæller og nævner»)
 */
export function vaelgGenafmeldinger(
  oensket: readonly string[],
  spor: readonly AfmeldSporRaekke[],
  nu: Date,
): Genafmeldinger {
  const ok = new Set<string>();
  const sidste = new Map<string, number>();
  for (const r of spor) {
    const m = r.email.trim().toLowerCase();
    if (r.udfald === "ok") ok.add(m);
    const t = new Date(r.forsoegt_at).getTime();
    if (!Number.isNaN(t)) sidste.set(m, Math.max(sidste.get(m) ?? 0, t));
  }
  const ud: Genafmeldinger = { proev: [], venter: [], afmeldt: [] };
  const set = new Set<string>();
  for (const raa of oensket) {
    const m = raa.trim().toLowerCase();
    if (m === "" || set.has(m)) continue;
    set.add(m);
    if (ok.has(m)) { ud.afmeldt.push(m); continue; }
    const s = sidste.get(m);
    if (s !== undefined && nu.getTime() - s < AFMELD_AFSTAND_MIN * 60_000) { ud.venter.push(m); continue; }
    ud.proev.push(m);
  }
  ud.proev.sort();
  ud.venter.sort();
  ud.afmeldt.sort();
  return ud;
}

/** Hvad der typisk er galt — pr. udfald. Bruges i svaret og i README'ens fejlsøgning. */
export const AFMELD_AARSAG: Record<string, string> = {
  noegle_afvist: `nøglen mangler et af de tre scopes (profiles:write, lists:write, subscriptions:write) — og scopes kan IKKE tilføjes en eksisterende nøgle; opret en ny og sæt ${KLAVIYO_AFMELD_SECRET} igen`,
  ingen_noegle: `${KLAVIYO_AFMELD_SECRET} mangler i Lovable → Secrets, eller er ikke en privat nøgle (pk_)`,
  loft: `Klaviyos loft for ${AFMELD_STI} (${AFMELD_LOFT_BURST_PR_SEKUND}/s, ${AFMELD_LOFT_VEDVARENDE_PR_MINUT}/m) — næste kørsel tager resten`,
  timeout: `Klaviyo svarede ikke inden for ${TIMEOUT_MS} ms — næste kørsel prøver igen`,
  fejl: "Klaviyo svarede 5xx, eller netværket faldt — næste kørsel prøver igen",
  ugyldig: "Klaviyo læste kroppen og afviste den (400/422) — kroppen er forkert, og samme krop giver samme svar; se svaret i sporet",
  ingen_mail: "der var ingen brugbar mailadresse på tilmeldingen — der er intet at afmelde",
};

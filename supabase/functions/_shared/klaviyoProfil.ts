/**
 * klaviyoProfil — platformens skriver til Klaviyo-PROFILEN (udkast 21/9-2026,
 * recon-profilmodel §4–§6: «ét navn, én skriver», præfiks `tb_`).
 *
 * ENDEPUNKTET, slået op i Klaviyos reference for revision 2026-07-15
 * (developers.klaviyo.com/en/reference/create_or_update_profile):
 *   POST /api/profile-import — «Given a set of profile attributes and
 *   optionally an ID, create or update a profile.» Profilen findes på mailen
 *   (email, phone_number, external_id eller _kx); intet profil-id behøves.
 *   Svar: 201 «Profile Created Successfully», 200 «Profile Updated
 *   Successfully». Loft: burst 75/s, steady 750/m. Scope: profiles:write.
 *   Kroppen: data.type "profile", data.attributes.{email, properties}, og
 *   data.meta.patch_properties.{append, unappend, unset}.
 * FJERNELSE: `meta.patch_properties.unset` — «Remove a key or keys (and their
 * values) completely from properties» (update_profile) — findes OGSÅ på
 * profile-import-kroppen, så en fjernelse på mail kræver ikke profilens id.
 *
 * TO FELTER, ALTID SAMMEN: tb_naeste_webinar (dato, YYYY-MM-DD HH:MM:SS
 * dansk tid) og tb_naeste_webinar_tekst («tirsdag 13. oktober kl. 11.00»).
 * Sættes sammen, fjernes sammen — bygget af klaviyoDato.ts, aldrig her.
 *
 * FAIL-CLOSED PÅ FORMEN: en datoværdi, der ikke er Klaviyos form (T, Z, noget
 * andet), sendes ALDRIG — udfaldet «ugyldig» skrives i sporet uden kald.
 * Én forkert form ville type feltet som streng hos Klaviyo for altid (§1.2).
 *
 * TILSTAND OG SPOR I ÉN TABEL (klaviyo_profil, én række pr. mail): det,
 * platformen sidst skrev, udfaldet af sidste forsøg, og hvornår. Cronen
 * skriver kun, hvor det ønskede afviger (klaviyoDato.afviger). INGEN RETURN
 * FØR RÆKKEN ER SKREVET — klaviyo.guard dom 7's regel, gentaget her.
 *
 * DENO-FRI: nøglen gives ind (klaviyoAfsendelse.skrivProfilHvisNoegle læser
 * den, ét sted). `kald` kaster aldrig; rækken skrives fail-soft.
 */
import { kald, type KlaviyoSpor } from "./klaviyo.ts";
import { erKlaviyoDato, PROFIL_FELT_DATO, PROFIL_FELT_TEKST, PROFIL_FELTER, type Profilvaerdier } from "./klaviyoDato.ts";
import { kbhDato } from "./hverdage.ts";

export const PROFIL_STI = "/profile-import/";

/** Så lidt af Supabase-klienten som tilstanden behøver — så filen kan prøves uden en rigtig. */
export interface ProfilSkriver {
  from(tabel: string): {
    upsert(raekke: unknown, valg: { onConflict: string }): PromiseLike<{ error: { message: string } | null }>;
  };
}

export interface ProfilSkrivning {
  sendt: boolean;
  spor: KlaviyoSpor;
  /** Præcis den krop, der gik (eller ville gå) afsted. */
  krop: Record<string, unknown>;
}

/** Kroppen til POST /profile-import/: sæt de to felter, eller fjern dem (unset) — aldrig det ene uden det andet. */
export function bygProfilKrop(email: string, oensket: Profilvaerdier | null): Record<string, unknown> {
  const mail = email.trim().toLowerCase();
  if (oensket === null) {
    return { data: { type: "profile", attributes: { email: mail }, meta: { patch_properties: { unset: [...PROFIL_FELTER] } } } };
  }
  return {
    data: {
      type: "profile",
      attributes: {
        email: mail,
        properties: { [PROFIL_FELT_DATO]: oensket.tb_naeste_webinar, [PROFIL_FELT_TEKST]: oensket.tb_naeste_webinar_tekst },
      },
    },
  };
}

/** Rækken i klaviyo_profil efter ét forsøg. Ved succes bærer den det, der nu står hos Klaviyo; ved fejl kun udfaldet (sidst skrevne værdier røres ikke). */
async function skrivTilstand(
  skriver: ProfilSkriver | null,
  email: string,
  oensket: Profilvaerdier | null,
  spor: KlaviyoSpor,
  nu: Date,
): Promise<void> {
  if (!skriver) return;
  const raekke: Record<string, unknown> = {
    email,
    forsoegt_at: nu.toISOString(),
    udfald: spor.udfald,
    status: spor.status,
    varighed_ms: spor.varighed_ms,
    svar: spor.svar,
    grund: spor.grund,
  };
  if (spor.udfald === "ok") {
    raekke.tb_naeste_webinar = oensket?.tb_naeste_webinar ?? null;
    raekke.tb_naeste_webinar_tekst = oensket?.tb_naeste_webinar_tekst ?? null;
    raekke.skrevet_at = nu.toISOString();
  }
  try {
    const { error } = await skriver.from("klaviyo_profil").upsert(raekke, { onConflict: "email" });
    if (error) console.error(`[klaviyo] klaviyo_profil kunne ikke skrives for ${email}:`, error.message);
  } catch (e) {
    console.error(`[klaviyo] klaviyo_profil kastede for ${email}:`, e);
  }
}

/**
 * Skriv (eller fjern) de to felter på profilen for én mail, og skriv tilstanden.
 * KASTER IKKE SELV (kald kaster aldrig; tilstanden er fail-soft) — det sidste
 * værn ligger i klaviyoAfsendelse.skrivProfilHvisNoegle.
 */
export async function skrivProfil(
  skriver: ProfilSkriver | null,
  noegle: string | null | undefined,
  email: string,
  oensket: Profilvaerdier | null,
  valg: Parameters<typeof kald>[2] & { nuDato?: Date } = {},
): Promise<ProfilSkrivning> {
  const mail = email.trim().toLowerCase();
  const nu = valg.nuDato ?? new Date();
  const krop = bygProfilKrop(mail, oensket);
  // Formen dømmes FØR kaldet: en dato uden for Klaviyos form må aldrig nå derover.
  if (oensket !== null && !erKlaviyoDato(oensket.tb_naeste_webinar)) {
    const spor: KlaviyoSpor = {
      udfald: "ugyldig", metode: "POST", sti: PROFIL_STI, status: null, svar: null,
      grund: `${PROFIL_FELT_DATO} er ikke Klaviyos datoform (YYYY-MM-DD HH:MM:SS): ${String(oensket.tb_naeste_webinar).slice(0, 40)}`,
      varighed_ms: 0,
    };
    await skrivTilstand(skriver, mail, oensket, spor, nu);
    return { sendt: false, spor, krop };
  }
  const { nuDato: _nuDato, ...kaldValg } = valg;
  const svar = await kald(noegle, PROFIL_STI, { ...kaldValg, metode: "POST", krop });
  await skrivTilstand(skriver, mail, oensket, svar.spor, nu);
  if (!svar.ok && svar.spor.udfald !== "ingen_noegle") {
    console.error(`[klaviyo] profilen for ${mail} blev ikke skrevet (${svar.spor.udfald}): ${svar.spor.grund ?? ""}`);
  }
  return { sendt: svar.ok, spor: svar.spor, krop };
}

// ── Alarmen (princip 1, 20/9: et signal, kun en browser kan vise, er ikke et signal) ──
//
// kald_edge er asynkron: cron.job_run_details siger «succeeded», uanset om functionen
// svarede 500. Ingen så en kørsel, hvor skrivningerne fejlede. Derfor: en rigtig
// kørsel med fejlede > 0 giver en MAIL til driftModtager (managedEmail; kun Jonas, 21/9) og en
// drift-klokke — samme vej som klaviyo-gensend-cron. HØJST ÉN MAIL PR. DANSK
// KALENDERDØGN: nøglen bærer datoen, ikke timen (cronen kører hver time, og en
// vedvarende fejl må ikke give en mail i timen). Teksterne er rene og prøves her.

export const PROFIL_ALARM_NOEGLE_PRAEFIKS = "klaviyo-profil-alarm:";
/** template_name i email_send_log og label hos Lovable. */
export const PROFIL_ALARM_MAIL_LABEL = "klaviyo-profil-alarm";
/** Klokkens type — vagtens driftsbesked (klokke.ts viser 'drift'). */
export const PROFIL_ALARM_KLOKKE_TYPE = "drift";
/** Så mange mails med grund nævnes i mailen. */
export const PROFIL_ALARM_EKSEMPLER = 3;

/** Idempotensnøglen: præfiks + dansk kalenderdato — én mail pr. døgn. Klokkens titel bærer samme dato. */
export function profilAlarmNoegle(nu: Date): string {
  return `${PROFIL_ALARM_NOEGLE_PRAEFIKS}${kbhDato(nu)}`;
}

export interface FejletSkrivning {
  email: string;
  udfald: string;
  grund: string | null;
}

/** Hvad der typisk er galt — pr. udfald (klaviyo.ts' udfald). */
export const PROFIL_ALARM_AARSAG: Record<string, string> = {
  noegle_afvist: "nøglen mangler scope profiles:write (eller er forkert) — Klaviyo → Settings → API keys → nøglen → scopes",
  ingen_noegle: "KLAVIYO_API_KEY mangler i Lovable → Secrets, eller er ikke en privat nøgle (pk_)",
  loft: "Klaviyos loft for /profile-import (75/s, 750/m) — næste time tager resten",
  timeout: "Klaviyo svarede ikke inden for 3 s — næste time prøver igen",
  fejl: "Klaviyo svarede 5xx, eller netværket faldt — næste time prøver igen",
  ugyldig: "datoformen blev afvist FØR kaldet (kildeværnet) — en kodefejl i klaviyoDato.ts, ikke et Klaviyo-svar",
};

export interface ProfilAlarmTekst {
  emne: string;
  /** Klokkens titel — bærer dansk dato, så dedup giver én klokke pr. døgn. */
  titel: string;
  afsnit: string[];
  blokke: { overskrift: string; tekst: string }[];
  tekst: string;
}

/** Udfaldene talt op, flest først; ved lige tal alfabetisk. */
export function taelUdfald(fejlede: readonly FejletSkrivning[]): { udfald: string; antal: number }[] {
  const t = new Map<string, number>();
  for (const f of fejlede) t.set(f.udfald, (t.get(f.udfald) ?? 0) + 1);
  return [...t.entries()].map(([udfald, antal]) => ({ udfald, antal })).sort((a, b) => b.antal - a.antal || a.udfald.localeCompare(b.udfald));
}

/** Mailen og klokken: antal fejlede, udfaldene talt op, de første tre mails med grund, og hvad der typisk er galt. */
export function profilAlarmTekst(fejlede: readonly FejletSkrivning[], nu: Date): ProfilAlarmTekst {
  const dato = kbhDato(nu);
  const n = fejlede.length;
  const hvad = n === 1 ? "1 profilskrivning" : `${n} profilskrivninger`;
  const emne = `${hvad} til Klaviyo fejlede — webinarets tidspunkt står ikke på profilen`;
  const titel = `Klaviyo: ${hvad} fejlede (${dato})`;
  const udfald = taelUdfald(fejlede);
  const afsnit = [
    `klaviyo-profil-cron skriver webinarets tidspunkt (tb_naeste_webinar) på Klaviyo-profilen hver time. I den seneste kørsel fejlede ${hvad}. Udfald: ${udfald.map((u) => `${u.udfald} ${u.antal}`).join(" · ")}.`,
    "Cronen prøver igen næste time for dem, der fejlede. Denne mail sendes højst én gang i døgnet.",
  ];
  const blokke = [
    ...fejlede.slice(0, PROFIL_ALARM_EKSEMPLER).map((f) => ({ overskrift: f.email, tekst: `${f.udfald}${f.grund ? ` — ${f.grund}` : ""}` })),
    ...udfald.map((u) => ({ overskrift: `Hvad der typisk er galt ved «${u.udfald}»`, tekst: PROFIL_ALARM_AARSAG[u.udfald] ?? "ukendt udfald — læs klaviyo_profil" })),
  ];
  const tekst = [
    ...afsnit,
    "",
    ...blokke.map((b) => `${b.overskrift}: ${b.tekst}`),
    "",
    "Tabellen: select email, udfald, status, grund, forsoegt_at from public.klaviyo_profil where udfald <> 'ok' order by forsoegt_at desc;",
  ].join("\n");
  return { emne, titel, afsnit, blokke, tekst };
}

// _shared/webinarSpoergsmaalKlokke.ts — rådgivernes klokke ved et NYT spørgsmål
// i webinaret (spec'ens skive 5, 3/10-2026; docs/webinarmotor.md §7.10).
//
// KALDES KUN AF webinar-puls — HØJST ÉN GANG PR. KALD, efter handlingsløkken,
// når mindst ét spørgsmål blev «ok» (CTO 3/10, fund 4). Dommen er ren og spejlet
// (webinarMotor/klokke.ts); denne fil er I/O:
//   1. ALLE rådgivere (user_roles advisor/admin) — OGSÅ tjenestekonti: husets regel
//      for klokker (CLAUDE.md «Tjenestekonti»: kontoen skal se alt); MAILEN filtreres
//      i klokke-mail-cron (udenTjenestekonti) — CTO 3/10, fund 2;
//   2. typens rækker for sessionen → raadgivereUdenUlaestKlokke: højst ÉN ULÆST
//      klokke pr. (rådgiver, session) — husets dedupKunUlaeste-regel;
//   3. ÉN INSERT PR. RÅDGIVER (fund 5): et 23505 fra delindekset
//      advisor_notifications_webinar_spoergsmaal_ulaest_uidx (migration
//      20261003080000) er et kapløb, en anden puls vandt for DEN rådgiver — det
//      taber aldrig de andres rækker.
//
// HVORFOR IKKE skrivRaadgiverBesked: den logger ved fejl (webinar-puls må KUN
// logge fejlsummen — webinarMotor.guard dom 3), og den indsætter alle rækker i
// ÉN insert (en 23505 ville tabe de andres). Reglen er den samme (paritetstesten).
//
// KASTER ALDRIG og LOGGER ALDRIG: resultatet bærer grunden, og pulsen lægger den
// i sin fejlsum. Klokken må aldrig koste pulsen eller spørgsmålet.

import { beskedVedSpoergsmaal, raadgivereUdenUlaestKlokke, type KlokkeRaekke, TYPE_WEBINAR_SPOERGSMAAL } from "./webinarMotor/klokke.ts";

// deno-lint-ignore no-explicit-any
type Klient = { from: (tabel: string) => any };

export interface KlokkeUdfald {
  skrevet: number;
  fandtes: number;
  /** null = ingen fejl. Ellers en kort grund (til pulsens fejlsum). */
  fejl: string | null;
}

/**
 * Højst så længe venter pulsen på klokken. Fire små forespørgsler tager normalt
 * < 100 ms; en hængende database må ikke holde seerens pulssvar (og dermed
 * værtens svar) tilbage. Når fristen rammes, svarer pulsen; skrivningen kan
 * stadig lande i baggrunden (indekset holder dubletten ude).
 */
export const KLOKKE_FRIST_MS = 2_000;

export async function ringSpoergsmaalKlokke(admin: Klient, a: { sessionId: string; webinarTitel: string | null }, fristMs = KLOKKE_FRIST_MS): Promise<KlokkeUdfald> {
  let ur: ReturnType<typeof setTimeout> | undefined;
  const frist = new Promise<KlokkeUdfald>((klar) => { ur = setTimeout(() => klar({ skrevet: 0, fandtes: 0, fejl: "klokke:frist" }), fristMs); });
  try {
    return await Promise.race([ring(admin, a), frist]);
  } finally {
    clearTimeout(ur);
  }
}

async function ring(admin: Klient, a: { sessionId: string; webinarTitel: string | null }): Promise<KlokkeUdfald> {
  const ud: KlokkeUdfald = { skrevet: 0, fandtes: 0, fejl: null };
  try {
    const besked = beskedVedSpoergsmaal({ sessionId: a.sessionId, webinarTitel: a.webinarTitel });
    if (!besked) { ud.fejl = "klokke:session_id"; return ud; }

    const { data: roller, error: rolleFejl } = await admin.from("user_roles").select("user_id").in("role", ["advisor", "admin"]);
    if (rolleFejl) { ud.fejl = "klokke:roller"; return ud; }
    const raadgivere = [...new Set(((roller ?? []) as { user_id: string | null }[]).map((r) => r.user_id).filter((x): x is string => !!x))];
    if (raadgivere.length === 0) return ud;

    const { data: eks, error: eksFejl } = await admin
      .from("advisor_notifications")
      .select("advisor_id, reference_id, read_at")
      .eq("type", TYPE_WEBINAR_SPOERGSMAAL)
      .eq("reference_id", besked.reference_id)
      .in("advisor_id", raadgivere);
    // Kan vi ikke se, om klokken findes, skriver vi ikke — hellere én for lidt end en dublet.
    if (eksFejl) { ud.fejl = "klokke:opslag"; return ud; }

    const mangler = raadgivereUdenUlaestKlokke(raadgivere, (eks ?? []) as KlokkeRaekke[], besked.reference_id);
    ud.fandtes = raadgivere.length - mangler.length;
    if (mangler.length === 0) return ud;

    // Én INSERT pr. rådgiver: en 23505 (kapløbet) gælder kun den ene række.
    for (const advisorId of mangler) {
      const { error: insFejl } = await admin.from("advisor_notifications").insert({
        type: besked.type,
        title: besked.title,
        body: besked.body,
        company_id: null,
        member_id: advisorId,
        advisor_id: advisorId,
        reference_type: besked.reference_type,
        reference_id: besked.reference_id,
      });
      if (!insFejl) ud.skrevet++;
      else if ((insFejl as { code?: string }).code === "23505") ud.fandtes++;
      else ud.fejl = "klokke:insert";
    }
    return ud;
  } catch {
    ud.fejl = "klokke:uventet";
    return ud;
  }
}

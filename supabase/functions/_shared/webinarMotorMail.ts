/**
 * webinarMotorMail — motorens link og kalenderfil til webinar-mail-cron (skive 3, 30/9-2026).
 *
 * Deno-side (IO). Vejen (eWebinar / motor / uden link) dømmes af den rene
 * webinarMotor/mail.ts:mailVejDom; her er kun opslaget og samlingen.
 *
 * FOR MOTORENS RÆKKER (kilde_system = 'platform') bygger cronen:
 *   joinLink     = APP_URL + rumSti(slug, token)       — /w/<slug>?t=<HMAC>
 *   kalenderLink = APP_URL + kalenderSti(slug, token)  — /w/<slug>/kalender?t=…
 *   ics          = bygIcs(…) i processen               — husets UID, SEQUENCE =
 *                  sessionens ics_sekvens, samme beskrivelse som webinar-rum GET ics
 * Tokenet udledes (byggDeltagertoken) med rækkens token_version og gemmes
 * aldrig. Secret'en læses KUN i webinarDeltagerAuth.ts (joinSecret).
 *
 * EWEBINARS RÆKKER RØRES IKKE: de slås ikke op her, og cronen bruger deres
 * join_link/kalender_link og hentInvitation præcis som før (webinarMotorSkive3.guard).
 *
 * FAIL-SOFT MOD EWEBINAR-VEJEN: fejler opslaget, skubbes grunden til `fejl`, og
 * kortet er tomt — motorens mails bliver «ikke_fundet» (ikke forsøgt), og
 * eWebinars mails går som før. Logger aldrig selv (cronen tæller).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { APP_URL, byggDeltagertoken, kalenderSti, rumSti } from "./webinarMotor/token.ts";
import { bygIcs, icsBeskrivelse } from "./webinarMotor/ics.ts";
import { sessionTider } from "./webinarMotor/ur.ts";
import { type MotorOpslag, motorTilmeldingId } from "./webinarMotor/mail.ts";

const BUNDT = 100;

function bundter<T>(liste: readonly T[]): T[][] {
  const ud: T[][] = [];
  for (let i = 0; i < liste.length; i += BUNDT) ud.push(liste.slice(i, i + BUNDT));
  return ud;
}

/** Opslaget for motorens rækker, nøglet på ewebinar_id («P-<uuid>»). Fejl skubbes til `fejl`. */
export async function hentMotorOpslag(admin: SupabaseClient, ewebinarIds: readonly string[], fejl: string[]): Promise<Map<string, MotorOpslag>> {
  const ud = new Map<string, MotorOpslag>();
  const ids = [...new Set(ewebinarIds.map(motorTilmeldingId).filter((x): x is string => x !== null))];
  if (ids.length === 0) return ud;
  try {
    const tilmeldinger: Array<Record<string, unknown>> = [];
    for (const b of bundter(ids)) {
      const { data, error } = await admin.from("webinar_tilmeldinger").select("id, kilde_system, token_version, email, session_id").in("id", b);
      if (error) throw new Error(`webinar_tilmeldinger: ${error.message}`);
      tilmeldinger.push(...((data ?? []) as Array<Record<string, unknown>>));
    }
    const sessionIds = [...new Set(tilmeldinger.map((t) => t.session_id).filter((x): x is string => typeof x === "string"))];
    const sessioner = new Map<string, Record<string, unknown>>();
    for (const b of bundter(sessionIds)) {
      const { data, error } = await admin.from("webinar_sessioner").select("id, webinar_id, starter_at, status, ics_sekvens").in("id", b);
      if (error) throw new Error(`webinar_sessioner: ${error.message}`);
      for (const s of (data ?? []) as Array<Record<string, unknown>>) sessioner.set(s.id as string, s);
    }
    const webinarIds = [...new Set([...sessioner.values()].map((s) => s.webinar_id as string))];
    const webinarer = new Map<string, Record<string, unknown>>();
    for (const b of bundter(webinarIds)) {
      const { data, error } = await admin.from("webinarer").select("id, slug, titel, vaert_navn, varighed_sek, intro_sek, lobby_min, exitrum_min").in("id", b);
      if (error) throw new Error(`webinarer: ${error.message}`);
      for (const w of (data ?? []) as Array<Record<string, unknown>>) webinarer.set(w.id as string, w);
    }
    for (const t of tilmeldinger) {
      const s = typeof t.session_id === "string" ? sessioner.get(t.session_id) : undefined;
      const w = s ? webinarer.get(s.webinar_id as string) : undefined;
      const starterMs = s ? Date.parse(s.starter_at as string) : NaN;
      const tider = s && w && Number.isFinite(starterMs)
        ? sessionTider({ starterMs, varighedSek: w.varighed_sek as number, introSek: w.intro_sek as number, lobbyMin: w.lobby_min as number, exitrumMin: w.exitrum_min as number })
        : null;
      ud.set(`P-${t.id as string}`, {
        tilmeldingId: t.id as string,
        kildeSystem: (t.kilde_system as string | null) ?? null,
        tokenVersion: typeof t.token_version === "number" ? t.token_version : null,
        email: t.email as string,
        slug: (w?.slug as string | undefined) ?? null,
        titel: (w?.titel as string | undefined) ?? null,
        vaertNavn: (w?.vaert_navn as string | null | undefined) ?? null,
        starterMs: tider ? starterMs : null,
        slutMs: tider ? tider.afspilningSlutMs : null,
        icsSekvens: typeof s?.ics_sekvens === "number" ? (s.ics_sekvens as number) : 0,
        sessionStatus: (s?.status as string | undefined) ?? null,
      });
    }
  } catch (e) {
    fejl.push(`motorens opslag fejlede — motorens mails venter, eWebinars går som før: ${e instanceof Error ? e.message : String(e)}`);
    return new Map();
  }
  return ud;
}

export interface MotorMailDele {
  joinLink: string;
  kalenderLink: string;
  ics: string;
}

/** Link og kalenderfil for én motor-sending. `opslag` er dømt klar af mailVejDom (slug, tider og version findes). */
export async function motorMailDele(o: MotorOpslag, secret: string, stempelMs: number): Promise<MotorMailDele> {
  const token = await byggDeltagertoken(secret, o.tilmeldingId, o.tokenVersion as number);
  const slug = o.slug as string;
  const joinLink = `${APP_URL}${rumSti(slug, token)}`;
  const kalenderLink = `${APP_URL}${kalenderSti(slug, token)}`;
  const ics = bygIcs({
    tilmeldingId: o.tilmeldingId,
    sekvens: o.icsSekvens,
    metode: "REQUEST",
    startMs: o.starterMs as number,
    slutMs: o.slutMs as number,
    stempelMs,
    titel: o.titel ?? "Webinar",
    beskrivelse: icsBeskrivelse(joinLink, o.vaertNavn),
    url: joinLink,
    deltagerMail: o.email,
  });
  return { joinLink, kalenderLink, ics };
}

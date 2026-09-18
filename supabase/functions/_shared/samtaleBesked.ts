/**
 * samtaleBesked — beskederne EFTER en book/flyt/aflys af afklaringssamtalen
 * (udkast 18/9-2026), flyt-event-mønstret (#986): overgangen er skrevet
 * FØRST (udfoerOvergang); herfra sendes mailen til ansøgeren straks og
 * klokken til rådgiverne når ansøgeren handlede (dommen: samtaleBeskedDom).
 * Kaster ALDRIG — udebliver en besked, logges det, og kalderen siger det i
 * svaret (mail: "fejl"), som publish-event/flyt-event.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { sendManagedEmail } from "./managedEmail.ts";
import { skrivRaadgiverBesked } from "./raadgiverBesked.ts";
import { ansoegerLink, fornavnAf, ikkeNuLink, REFERENCE_TYPE, virksomhedsnavnAf, type AnsoegningRaekke } from "./ansoegningMotor.ts";
import { formaterSamtaletid } from "./ansoegningRykkerMails.ts";
import { afgoerSamtaleBesked, klokkeTekst, samtaleIdempotensnoegle, type SamtaleAendring, type SamtaleAktoer } from "./samtaleBeskedDom.ts";
import { bygSamtaleMail } from "./samtaleMails.ts";

export interface SamtaleAendringArgs {
  a: AnsoegningRaekke;
  aendring: SamtaleAendring;
  af: SamtaleAktoer;
  nyStart: Date | null;
  gammelStart: Date | null;
  moedeLink: string | null;
  varighedMin: number;
}

export interface SamtaleBeskedResultat {
  mail: "sendt" | "ingen_adresse" | "fejl";
  klokke: number;
}

export async function meldSamtaleAendring(admin: SupabaseClient, args: SamtaleAendringArgs): Promise<SamtaleBeskedResultat> {
  const { a } = args;
  const besked = afgoerSamtaleBesked(args.aendring, args.af);
  const ud: SamtaleBeskedResultat = { mail: "ingen_adresse", klokke: 0 };

  if (a.email) {
    try {
      const mail = bygSamtaleMail(args.aendring, {
        fornavn: fornavnAf(a.navn),
        virksomhedsnavn: virksomhedsnavnAf(a),
        bookingUrl: ansoegerLink(a.token),
        statusUrl: ansoegerLink(a.token),
        ikkeNuUrl: ikkeNuLink(a.token),
        samtaleStart: args.nyStart,
        aftaleUrl: null,
        token: a.token,
        manglerSvar: null,
        moedeLink: args.moedeLink,
        af: args.af,
        nyStart: args.nyStart,
        gammelStart: args.gammelStart,
        varighedMin: args.varighedMin,
      });
      const res = await sendManagedEmail({
        adminClient: admin,
        to: a.email,
        subject: mail.emne,
        html: mail.html,
        text: mail.tekst,
        label: mail.label,
        idempotencyKey: samtaleIdempotensnoegle(a.id, args.aendring, args.nyStart ? args.nyStart.toISOString() : null),
        metadata: { ansoegning_id: a.id, aendring: args.aendring, af: args.af },
      });
      ud.mail = res.sent ? "sendt" : "fejl";
      if (res.sent === false) console.error(`[samtaleBesked] mail ${mail.label} til ${a.id} ikke sendt: ${res.reason}`);
    } catch (err) {
      ud.mail = "fejl";
      console.error(`[samtaleBesked] mail (${args.aendring}) til ${a.id} fejlede — overgangen er udført:`, err);
    }
  }

  if (besked.klokkeTilRaadgiver) {
    try {
      const t = klokkeTekst(args.aendring, virksomhedsnavnAf(a), args.nyStart ? formaterSamtaletid(args.nyStart) : null, args.gammelStart ? formaterSamtaletid(args.gammelStart) : null);
      const r = await skrivRaadgiverBesked(admin, { type: besked.klokkeTilRaadgiver, title: t.title, body: t.body, reference_type: REFERENCE_TYPE, reference_id: a.id });
      ud.klokke = r.skrevet;
    } catch (err) {
      console.error(`[samtaleBesked] klokke (${args.aendring}) for ${a.id} fejlede — overgangen er udført:`, err);
    }
  }
  return ud;
}

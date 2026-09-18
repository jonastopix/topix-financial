/**
 * _shared/venteliste.ts — ventelistens IO (udkast 18/9-2026). Dommene er
 * rene i ./ventelisteDom.ts (spejlet i src/lib); her er databasen, A's kø og
 * klokken. Tre kaldere:
 *   venteliste-handling  (Bucket A, rådgiveren): saetPaaVenteliste, fjernFraVenteliste, tilbydPladsen
 *   ansoegning-link      (ansøgerens token): svarPaaPlads (tag_pladsen / afslaa_pladsen)
 *   ansoegning-rykker-cron (venteplads_udloeb): pladsUdloebet → næste i køen
 *
 * TILBUDDET er én række på «tilbudt» + trappen «venteplads» i
 * planlagte_haendelser (dag 0 mail, dag 3 rykker, dag 7 venteplads_udloeb),
 * planlagt af A's planlaegTrappe med ankeret = tilbudstidspunktet. Ankeret
 * er også idempotensnøglen: samme tilbud to gange = samme nøgler = UNIQUE.
 * Dag 0-mailen sendes STRAKS (Jonas 18/9, pkt. 8: svar på en handling venter
 * ikke på sendevinduet) gennem motorens sendSvarMailNu; går den ikke, står
 * rækken i køen og cronen sender den i næste sendevindue.
 *
 * NÆSTE I KØEN sker af sig selv (udløb eller nej tak) — det er kun det
 * FØRSTE tilbud for en ledig plads, et menneske trykker på. Er køen tom når
 * tilbuddet udløber, får rådgiverne en klokke og intet mere sker.
 *
 * KASTER: databasefejl kastes til kalderen (funktionerne svarer 500);
 * klokken kaster aldrig (skrivRaadgiverBesked).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { planlaegTrappe } from "./rykkerkoe.ts";
import { skrivPlan, annullerTrapper, udfoerOvergang, hentAnsoegning, virksomhedsnavnAf, REFERENCE_TYPE, sendSvarMailNu, tagPladsenLink, afslaaPladsenLink, type StraksUdfald } from "./ansoegningMotor.ts";
import { skrivRaadgiverBesked } from "./raadgiverBesked.ts";
import { afgoerSvar, erBloedUdgave, harTilbudUde, naesteIKoen, svarfristFra, type VentepladsRaekke, type VentepladsStatus } from "./ventelisteDom.ts";

export const TYPE_VENTELISTE = "venteliste";
const LOG = "[venteliste]";

export interface VentepladsRad extends VentepladsRaekke {
  hvorfor: string | null;
  tilbudt_at: string | null;
  tilbud_udloeber_at: string | null;
  tilbud_nr: number;
}

const FELTER = "id, ansoegning_id, company_id, status, hvorfor, sat_at, tilbudt_at, tilbud_udloeber_at, tilbud_nr";

/** Alle levende rækker (venter/tilbudt) for én virksomhed, med ancienniteten fra ansøgningen. */
export async function hentKoe(admin: SupabaseClient, companyId: string): Promise<VentepladsRad[]> {
  const { data, error } = await admin
    .from("ventepladser")
    .select(`${FELTER}, ansoegninger!inner(lukket_at)`)
    .eq("company_id", companyId)
    .in("status", ["venter", "tilbudt"]);
  if (error) throw new Error(`ventepladser-opslag fejlede: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map(tilRad);
}

/** Alle levende rækker for én ansøgning (den kan stå i flere køer). */
export async function hentAnsoegerensPladser(admin: SupabaseClient, ansoegningId: string): Promise<VentepladsRad[]> {
  const { data, error } = await admin
    .from("ventepladser")
    .select(`${FELTER}, ansoegninger!inner(lukket_at)`)
    .eq("ansoegning_id", ansoegningId)
    .in("status", ["venter", "tilbudt"]);
  if (error) throw new Error(`ventepladser-opslag fejlede: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map(tilRad);
}

function tilRad(r: Record<string, unknown>): VentepladsRad {
  const a = (r.ansoegninger as { lukket_at?: string | null } | null) ?? null;
  return {
    id: r.id as string,
    ansoegning_id: r.ansoegning_id as string,
    company_id: r.company_id as string,
    status: r.status as VentepladsStatus,
    hvorfor: (r.hvorfor as string | null) ?? null,
    sat_at: r.sat_at as string,
    tilbudt_at: (r.tilbudt_at as string | null) ?? null,
    tilbud_udloeber_at: (r.tilbud_udloeber_at as string | null) ?? null,
    tilbud_nr: (r.tilbud_nr as number) ?? 0,
    afvist_at: a?.lukket_at ?? null,
  };
}

/** Sæt en afvist ansøgning i køen for en konkret virksomhed. 23505 = står der allerede. */
export async function saetPaaVenteliste(
  admin: SupabaseClient,
  i: { ansoegningId: string; companyId: string; hvorfor: string | null; satAf: string },
): Promise<{ udfald: "sat"; id: string } | { udfald: "staar_allerede" }> {
  const { data, error } = await admin
    .from("ventepladser")
    .insert({ ansoegning_id: i.ansoegningId, company_id: i.companyId, hvorfor: i.hvorfor, sat_af: i.satAf })
    .select("id")
    .single();
  if (error?.code === "23505") return { udfald: "staar_allerede" };
  if (error || !data) throw new Error(`ventepladser-indsættelse fejlede: ${error?.message ?? "ingen række"}`);
  return { udfald: "sat", id: (data as { id: string }).id };
}

/** Tag en ventende ud af køen (kun «venter» — et tilbud ude annulleres ikke herfra). */
export async function fjernFraVenteliste(admin: SupabaseClient, id: string, nu: Date): Promise<boolean> {
  const { data, error } = await admin
    .from("ventepladser")
    .update({ status: "trukket", afsluttet_at: nu.toISOString() })
    .eq("id", id)
    .eq("status", "venter")
    .select("id");
  if (error) throw new Error(`ventepladser-opdatering fejlede: ${error.message}`);
  return (data ?? []).length > 0;
}

export type TilbudsResultat =
  | { udfald: "tilbudt"; id: string; ansoegning_id: string; navn: string; bloed: boolean; svarfrist: string; planlagt: number; mail: StraksUdfald }
  | { udfald: "tilbud_ude" }
  | { udfald: "koen_er_tom" };

/**
 * Giv pladsen til den første i køen: rækken → tilbudt (gate: status venter),
 * trappen «venteplads» planlægges med ankeret = nu. Har virksomheden allerede
 * et tilbud ude, sker intet. Tom kø → intet.
 */
export async function tilbydPladsen(admin: SupabaseClient, companyId: string, nu: Date, tilbudNr = 1): Promise<TilbudsResultat> {
  const koe = await hentKoe(admin, companyId);
  if (harTilbudUde(koe)) return { udfald: "tilbud_ude" };
  const naeste = naesteIKoen(koe);
  if (!naeste) return { udfald: "koen_er_tom" };

  // Fristen løber fra AFSENDELSEN (recon 18/9 §2, pkt. 7) — og afsendelsen er NU (Jonas 18/9, pkt. 8:
  // tilbuddet er svar på en handling og sendes straks, uden om sendevinduet). Trappen ankres samme sted,
  // så udløbsrækken (dag 7) og «svar senest» i mailen er samme dag. Kan mailen ikke sendes straks, står
  // rækken i køen og går i næste sendevindue — fristen bliver stående (7 dage fra tilbuddet).
  const afsendelse = nu;
  const svarfrist = svarfristFra(afsendelse);
  const { data, error } = await admin
    .from("ventepladser")
    .update({ status: "tilbudt", tilbudt_at: nu.toISOString(), tilbud_udloeber_at: svarfrist.toISOString(), tilbud_nr: tilbudNr })
    .eq("id", naeste.id)
    .eq("status", "venter")
    .select("id");
  if (error) throw new Error(`tilbud kunne ikke skrives: ${error.message}`);
  if (!data || data.length === 0) return { udfald: "tilbud_ude" }; // en anden nåede det først

  const plan = planlaegTrappe({ ansoegningId: naeste.ansoegning_id, trappe: "venteplads", anker: afsendelse, nu });
  const skrevet = await skrivPlan(admin, plan);
  const a = await hentAnsoegning(admin, naeste.ansoegning_id);
  const navn = a ? virksomhedsnavnAf(a) : naeste.ansoegning_id;
  const bloed = erBloedUdgave(naeste.afvist_at, nu);
  // Tilbuddet STRAKS — samme kontekst som cronen bygger for rækken (bloed, frist, de to links).
  const mail: StraksUdfald = a
    ? await sendSvarMailNu(admin, a, "venteplads", nu, { bloed, svarfrist, tagPladsenUrl: tagPladsenLink(a.token), afslaaPladsenUrl: afslaaPladsenLink(a.token) })
    : "ingen_raekke";
  console.log(`${LOG} plads hos ${companyId} tilbudt ${navn} (${naeste.id}), nr. ${tilbudNr}, frist ${svarfrist.toISOString()}, ${skrevet.skrevet} rækker i køen, mail ${mail}`);
  return { udfald: "tilbudt", id: naeste.id, ansoegning_id: naeste.ansoegning_id, navn, bloed, svarfrist: svarfrist.toISOString(), planlagt: skrevet.skrevet, mail };
}

/** Ansøgeren svarede ja/nej på et tilbud (ansoegning-link). */
export async function svarPaaPlads(
  admin: SupabaseClient,
  ansoegningId: string,
  udfald: "accepteret" | "afslaaet",
  nu: Date,
): Promise<{ udfald: "svaret"; plads: VentepladsRad; aendret: number; genaabnet: boolean } | { udfald: "intet_tilbud" }> {
  const pladser = await hentAnsoegerensPladser(admin, ansoegningId);
  const tilbudt = pladser.find((p) => p.status === "tilbudt");
  if (!tilbudt) return { udfald: "intet_tilbud" };

  const aendringer = afgoerSvar(pladser, tilbudt.id, udfald);
  let aendret = 0;
  for (const ae of aendringer) {
    const { data, error } = await admin
      .from("ventepladser")
      .update({ status: ae.status, svaret_at: ae.id === tilbudt.id ? nu.toISOString() : undefined, afsluttet_at: nu.toISOString(), tilbudt_at: null, tilbud_udloeber_at: null })
      .eq("id", ae.id)
      .in("status", ["venter", "tilbudt"])
      .select("id");
    if (error) throw new Error(`svar kunne ikke skrives: ${error.message}`);
    aendret += (data ?? []).length;
  }
  // Trappen for tilbuddet er brugt op: annullér de resterende rækker (rykker, udløb).
  await annullerTrapper(admin, ansoegningId, ["venteplads"], `venteplads ${udfald}`, nu);

  let genaabnet = false;
  const a = await hentAnsoegning(admin, ansoegningId);
  if (udfald === "accepteret" && a) {
    // Ja = ansøgningen genåbnes i A's motor (lukket → ny/afholdt efter hvor
    // den blev lukket fra) og rådgiverne får besked. Motoren afgør trinnet.
    const o = await udfoerOvergang(admin, { ansoegning: a, handling: { art: "genaabn" }, via: "ansoeger_link", truffetAf: null, nu, begrundelse: "tog pladsen fra ventelisten" });
    genaabnet = o.ok;
    if (!o.ok) console.error(`${LOG} genåbning af ${ansoegningId} afvist: ${o.grund}`);
    await skrivRaadgiverBesked(admin, {
      type: TYPE_VENTELISTE,
      title: `${virksomhedsnavnAf(a)} tog pladsen fra ventelisten`,
      body: genaabnet ? `Ansøgningen er genåbnet — næste skridt er dit (${o.ok ? o.til : "?"}).` : `Ansøgningen kunne ikke genåbnes automatisk: ${o.ok ? "" : o.grund}. Genåbn den i hånden.`,
      company_id: tilbudt.company_id,
      reference_type: REFERENCE_TYPE,
      reference_id: ansoegningId,
    });
  } else if (udfald === "afslaaet") {
    // Nej tak → pladsen går videre med det samme.
    const naeste = await tilbydPladsen(admin, tilbudt.company_id, nu, tilbudt.tilbud_nr + 1);
    await meldNaeste(admin, tilbudt, naeste, a ? virksomhedsnavnAf(a) : ansoegningId, "sagde nej tak");
  }
  return { udfald: "svaret", plads: tilbudt, aendret, genaabnet };
}

/** Køens dag 7: tilbuddet udløb uden svar → rækken udloebet, næste får det. */
export async function pladsUdloebet(admin: SupabaseClient, ansoegningId: string, nu: Date): Promise<{ udfald: "udloebet"; naeste: TilbudsResultat } | { udfald: "intet_tilbud" }> {
  const pladser = await hentAnsoegerensPladser(admin, ansoegningId);
  const tilbudt = pladser.find((p) => p.status === "tilbudt");
  if (!tilbudt) return { udfald: "intet_tilbud" };
  const { data, error } = await admin
    .from("ventepladser")
    .update({ status: "udloebet", afsluttet_at: nu.toISOString(), tilbudt_at: null, tilbud_udloeber_at: null })
    .eq("id", tilbudt.id)
    .eq("status", "tilbudt")
    .select("id");
  if (error) throw new Error(`udløb kunne ikke skrives: ${error.message}`);
  if (!data || data.length === 0) return { udfald: "intet_tilbud" };
  const naeste = await tilbydPladsen(admin, tilbudt.company_id, nu, tilbudt.tilbud_nr + 1);
  const a = await hentAnsoegning(admin, ansoegningId);
  await meldNaeste(admin, tilbudt, naeste, a ? virksomhedsnavnAf(a) : ansoegningId, "svarede ikke inden fristen");
  return { udfald: "udloebet", naeste };
}

/** Klokken når køen går videre — eller er tom. */
async function meldNaeste(admin: SupabaseClient, forrige: VentepladsRad, naeste: TilbudsResultat, forrigeNavn: string, grund: string): Promise<void> {
  const title = naeste.udfald === "tilbudt"
    ? `Pladsen gik videre: ${forrigeNavn} ${grund} — nu tilbudt ${naeste.navn}`
    : naeste.udfald === "koen_er_tom"
      ? `Ventelisten er tom: ${forrigeNavn} ${grund}, og ingen står bag`
      : `${forrigeNavn} ${grund} — pladsen er allerede tilbudt en anden`;
  await skrivRaadgiverBesked(admin, {
    type: TYPE_VENTELISTE,
    title,
    body: naeste.udfald === "tilbudt" ? `Fristen er ${naeste.svarfrist.slice(0, 10)}${naeste.bloed ? " (den bløde udgave — afvist for over et år siden)" : ""}. Køen svarer selv.` : "Pladsen står åben — intet sker af sig selv herfra.",
    company_id: forrige.company_id,
    reference_type: REFERENCE_TYPE,
    reference_id: forrige.ansoegning_id,
  });
}

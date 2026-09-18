import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for pengekædens to rettelser (C's recon 18/9, §8 pkt. 2 og 4):
//   (a) send-til-underskrift stopper FØR aftalen sendes — CVR altid, mail medmindre bekræftet;
//   (b) et konverteringsstop annullerer aftalegrundlags-trappen;
//   (c) fladen oversætter begge koder og gør mail-tilfældet til et bevidst valg.
const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/(^|[^:"'])\/\/[^\n]*/g, "$1");

const SEND = "supabase/functions/send-til-underskrift/index.ts";
const MOTOR = "supabase/functions/_shared/ansoegningMotor.ts";
const FLADE = "src/components/hjemmebane/virksomhed/SendTilUnderskrift.tsx";

/** Stoppet ligger i ansøgningsgrenen, efter pris-tjekket, FØR ejer bygges, FØR nogen insert — og kun ved afsendelse. */
export const stopFoerAfsendelse = (k: string): boolean => {
  const iPris = k.indexOf('return jsonResponse({ error: "pris_saettes_paa_ansoegningen"');
  const iStop = k.indexOf("const stop = afgoerUnderskriftStop({");
  const iEjer = k.indexOf("ejer = {\n        navn: virksomhedsnavnAf(ansoegning),");
  const iInsert = k.indexOf('.from("aftale_underskrift")\n      .insert(');
  return iPris > 0 && iStop > iPris && iEjer > iStop && iInsert > iStop &&
    k.includes("if (!forhaandsvis) {\n        const mailLower") &&
    k.includes('.eq("cvr_number", ansoegning.cvr)') && k.includes('.eq("contact_email", mailLower)') &&
    k.includes("return jsonResponse({ error: stop.stop, ansoegning_id: ansoegning.id, virksomheder: stop.virksomheder, kan_bekraeftes: stop.kanBekraeftes }, 409);") &&
    k.includes('const bekraeftNyVirksomhed = body?.bekraeft_ny_virksomhed === true;');
};
/** Valget står i sporet. */
export const valgetStaarISporet = (k: string): boolean => k.includes("...(bekraeftNyVirksomhed ? { bekraeft_ny_virksomhed: true } : {})");
/** Konverteringsstoppet annullerer aftalegrundlags-trappen FØR klokken og FØR return. */
export const stoppetAnnullererTrappen = (k: string): boolean => {
  const blok = k.slice(k.indexOf("if (genbrugt) {"), k.indexOf("return { ok: false, grund };"));
  return blok.includes('await annullerTrapper(admin, a.id, ["aftalegrundlag"], "konvertering stoppet: CVR findes som virksomhed", nu);') &&
    blok.indexOf("annullerTrapper(") < blok.indexOf("skrivRaadgiverBesked(") && blok.includes("Rykkerne om aftalegrundlaget er annulleret");
};
/** Fladen: CVR-koden er en fejl med vejen ud; mail-koden er confirm → gensend med flaget; flaget overlever «erstat». */
export const fladenGoerValget = (k: string): boolean =>
  k.includes('kode === "cvr_findes_som_virksomhed"') && k.includes("kobl ansøgningen til den eksisterende virksomhed") &&
  /kode === "mail_findes_som_kontakt" && !bekraeftNyVirksomhed[\s\S]{0,700}window\.confirm\([\s\S]{0,600}await send\(oere, erstat, true\);/.test(k) &&
  k.includes("bekraeft_ny_virksomhed: bekraeftNyVirksomhed") && k.includes("await send(oere, true, bekraeftNyVirksomhed);");

describe("pengekaedenRettelser.guard", () => {
  const send = udenKommentarer(laes(SEND)); const motor = udenKommentarer(laes(MOTOR)); const flade = udenKommentarer(laes(FLADE));
  it("(a) send-til-underskrift stopper FØR aftalen sendes, kun i ansøgningsgrenen og kun ved afsendelse", () => expect(stopFoerAfsendelse(send)).toBe(true));
  it("(a) det bevidste valg står i aftale_spor", () => expect(valgetStaarISporet(send)).toBe(true));
  it("(b) konverteringsstop annullerer aftalegrundlags-trappen og siger det i klokken", () => expect(stoppetAnnullererTrappen(motor)).toBe(true));
  it("(c) fladen: CVR = fejl med vej ud; mail = confirm → gensend med flaget", () => expect(fladenGoerValget(flade)).toBe(true));
  it("VÆRNET VIRKER: stop efter insert → falsk; stop også ved forhåndsvisning → falsk; trappen ikke annulleret → falsk; fladen sender uden flag → falsk", () => {
    const stopBlok = send.slice(send.indexOf("      if (!forhaandsvis) {\n        const mailLower"), send.indexOf("      ejer = {\n        navn: virksomhedsnavnAf(ansoegning),"));
    const flyttet = send.replace(stopBlok, "").replace('.from("aftale_underskrift")\n      .insert(', stopBlok + '.from("aftale_underskrift")\n      .insert(');
    expect(stopFoerAfsendelse(flyttet)).toBe(false);
    expect(stopFoerAfsendelse(send.replace("if (!forhaandsvis) {\n        const mailLower", "if (true) {\n        const mailLower"))).toBe(false);
    expect(stoppetAnnullererTrappen(motor.replace('await annullerTrapper(admin, a.id, ["aftalegrundlag"], "konvertering stoppet: CVR findes som virksomhed", nu);', "const annulleret = 0;"))).toBe(false);
    expect(fladenGoerValget(flade.replace("await send(oere, erstat, true);", "await send(oere, erstat);"))).toBe(false);
  });
});

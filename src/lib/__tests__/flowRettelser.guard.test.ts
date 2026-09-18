import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TRAPPER } from "@/lib/rykkerkoe";
import { trappensTrin } from "@/lib/ansoegningTrin";
import { bygRykkerMail, KVITTERING_SVAR_MAKS, klipSvar } from "../../../supabase/functions/_shared/ansoegningRykkerMails.ts";

// Kildeværn for de syv flow-rettelser (Jonas 18/9, recon flow-gennemgangen). Hver dom er en
// navngiven ren funktion over kildeteksten (kommentarer fjernet), og værnet beviser sig selv
// på kopier med fejlen sat ind igen — så en tilbagerulning fanges, ikke kun en sletning.
const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/(^|[^:"'])\/\/[^\n]*/g, "$1");

const APP = "src/App.tsx";
const NAV = "src/lib/hjemmebane/hbNav.ts";
const GEM = "supabase/functions/ansoegning-gem/index.ts";
const MOTOR = "supabase/functions/_shared/ansoegningMotor.ts";
const STATUS = "src/pages/AnsoegStatus.tsx";
const SKAERM = "src/components/ansoegning/AnsoegSkaerm.tsx";
const KVIT = "src/lib/ansoegning/spoergsmaal.ts";

// 1) statussiden: uguardet rute (ansøgeren har ingen konto), og «ikke nu» kræver et klik.
export const statusRutenErUguardet = (app: string): boolean => app.includes('<Route path="/ansoeg/status" element={<AnsoegStatus />} />');
export const ikkeNuKraeverKlik = (side: string): boolean =>
  side.includes('useState(searchParams.get("handling") === "ikke_nu")') &&
  side.split("sigIkkeNu(").length === 2 &&
  /const ikkeNu = async \(\) => \{[\s\S]*?await sigIkkeNu\(token\)/.test(side) &&
  side.includes("onClick={ikkeNu}");
// 2) kvitteringen: trappen «indsendt», dag 0, planlagt ved indsendelse; skærmen lover kun mailen.
export const kvitteringErTrappe = (): boolean =>
  TRAPPER.indsendt?.length === 1 && TRAPPER.indsendt[0].dag === 0 && TRAPPER.indsendt[0].handling === "send_mail" &&
  TRAPPER.indsendt[0].skabelon === "ansoegning-kvittering" && TRAPPER.indsendt[0].modtager === "ansoeger" && trappensTrin("indsendt") === null;
export const indsendelsenPlanlaeggerKvittering = (motor: string): boolean => motor.includes('planlaegTrappe({ ansoegningId: a.id, trappe: "indsendt", anker: nu, nu })');
export const kvitteringsskaermenLoverMailen = (k: string): boolean => k.includes("Du får en mail med det, du skrev") && !k.includes("Hold øje med telefonen og indbakken");
// 3) mail til rådgiverne ved indsendelse, til kontakt@, én gang pr. ansøgning.
export const raadgiverMailSendesVedIndsendelse = (motor: string): boolean =>
  motor.includes("raadgiverMailOmNyAnsoegning({ ansoegning: a, anbefaling, dubletter, appUrl: APP_URL })") &&
  motor.includes("to: KONTAKT_ADRESSE") && motor.includes('label: "ansoegning-ny-raadgiver"') &&
  motor.includes("idempotencyKey: `ansoegning-ny-raadgiver-${a.id}`");
// 4) loftet: 30 pr. IP pr. time, og 429-teksten giver en udvej.
export const loftetEr30MedUdvej = (gem: string): boolean =>
  gem.includes("const OPRET_PR_IP_PR_TIME = 30;") && /const FOR_MANGE = `[^`]*skriv til \$\{KONTAKT_ADRESSE\}[^`]*`;/.test(gem) && !gem.includes('"For mange forsøg');
// 5) fallback: uden CVR-opslag taster ansøgeren navnet; gemmes som kilde «ansoeger», aldrig over et rigtigt opslag.
export const fallbackGemmerNavnet = (gem: string): boolean =>
  gem.includes("body?.virksomhedsnavn") && gem.includes('kilde: "ansoeger"') && gem.includes('eksisterende.kilde !== "ansoeger"') && gem.includes("if (!erRigtigtOpslag)");
export const fladenSpoergerOmNavnet = (skaerm: string): boolean => skaerm.includes("data-cvr-fallback") && skaerm.includes("{CVR_NAVN_SPOERGSMAAL}") && skaerm.includes("p.onVirksomhedsnavn(");
export const motorenSigerCvrIkkeSlaaetOp = (motor: string): boolean => motor.includes('"CVR ikke slået op — virksomhedsnavnet er ansøgerens eget"');
// 6) dubletter i anbefalingen, og konverteringen stopper ved CVR-genbrug uden at røre den eksisterende virksomhed.
export const dubletterIAnbefalingen = (motor: string): boolean =>
  motor.includes("const dubletter = await findDubletter(admin, a);") && motor.includes("anbefaling.imod.push(...dubletter.advarsler)") &&
  motor.includes('if (dubletter.alvorlig && anbefaling.udfald === "tal_med_dem") anbefaling.udfald = "tvivl";');
export const konverteringStopperVedGenbrug = (motor: string): boolean => {
  const blok = motor.slice(motor.indexOf("export async function konverterTilVirksomhed"));
  return /if \(genbrugt\) \{[\s\S]*?return \{ ok: false, grund \};\s*\}/.test(blok) && !blok.includes("contact_person") && !blok.includes("contact_email:  ");
};
// 7) menupunktet lige efter Virksomheder.
export const menuenHarAnsoegninger = (nav: string): boolean =>
  /\{ label: "Virksomheder", to: "\/virksomheder", active: active === "virksomheder" \},\s*\{ label: "Ansøgninger", to: "\/ansoegninger", active: active === "ansoegninger" \},/.test(nav);

const KONTEKST = {
  fornavn: "Lisbeth", virksomhedsnavn: "Nordic Byg ApS", bookingUrl: "https://calendly.com/x", statusUrl: "https://app.theboardroom.dk/ansoeg/status?t=abc",
  ikkeNuUrl: "https://app.theboardroom.dk/ansoeg/status?t=abc&handling=ikke_nu", samtaleStart: null, aftaleUrl: null, token: "abc", manglerSvar: null,
  svar: { udfordring: "Vi har travlt, men der er ingen penge tilbage.", proevet: null, omTolvMaaneder: "Overskud hver måned." },
};

describe("flowRettelser.guard — de syv rettelser står", () => {
  const app = udenKommentarer(laes(APP)); const status = udenKommentarer(laes(STATUS)); const motor = udenKommentarer(laes(MOTOR));
  const gem = udenKommentarer(laes(GEM)); const nav = udenKommentarer(laes(NAV)); const skaerm = udenKommentarer(laes(SKAERM)); const kvit = udenKommentarer(laes(KVIT));

  it("1. /ansoeg/status er en uguardet rute, og «ikke nu» kræver et klik (aldrig automatisk fra et link)", () => {
    expect(statusRutenErUguardet(app)).toBe(true);
    expect(ikkeNuKraeverKlik(status)).toBe(true);
  });
  it("2. kvitteringen er trappen «indsendt» (dag 0), planlægges ved indsendelse, og skærmen lover kun det mailen holder", () => {
    expect(kvitteringErTrappe()).toBe(true);
    expect(indsendelsenPlanlaeggerKvittering(motor)).toBe(true);
    expect(kvitteringsskaermenLoverMailen(kvit)).toBe(true);
  });
  it("2b. kvitteringsmailen: emne, det de skrev (tomme svar udelades), procesteksten, statuslinket — og INGEN «ikke nu»", () => {
    const m = bygRykkerMail("ansoegning-kvittering", KONTEKST)!;
    expect(m.emne).toBe("Vi har din ansøgning");
    expect(m.tekst).toContain("Hej Lisbeth,");
    expect(m.tekst).toContain("vi har modtaget din ansøgning for Nordic Byg ApS");
    expect(m.tekst).toContain("Din største udfordring lige nu: Vi har travlt, men der er ingen penge tilbage.");
    expect(m.tekst).not.toContain("Det du selv har prøvet");
    expect(m.tekst).toContain("Om tolv måneder: Overskud hver måned.");
    expect(m.tekst).toContain("Jonas vender tilbage til dig. Du behøver ikke gøre mere nu.");
    expect(m.tekst).toContain(KONTEKST.statusUrl);
    expect(m.tekst).not.toContain(KONTEKST.ikkeNuUrl);
    expect(m.html).not.toContain("handling=ikke_nu");
    const klippet = klipSvar("x".repeat(KVITTERING_SVAR_MAKS + 50))!;
    expect(klippet.length).toBeLessThanOrEqual(KVITTERING_SVAR_MAKS);
    expect(klippet.endsWith("…")).toBe(true);
  });
  it("3. rådgiverne får en mail til kontakt@ ved indsendelse, idempotent på ansøgningen", () => {
    expect(raadgiverMailSendesVedIndsendelse(motor)).toBe(true);
  });
  it("4. oprettelsesloftet er 30 pr. IP pr. time, og 429-teksten giver en udvej", () => {
    expect(loftetEr30MedUdvej(gem)).toBe(true);
  });
  it("5. uden CVR-opslag taster ansøgeren navnet (kilde «ansoeger», aldrig over et rigtigt opslag), og motoren siger det", () => {
    expect(fallbackGemmerNavnet(gem)).toBe(true);
    expect(fladenSpoergerOmNavnet(skaerm)).toBe(true);
    expect(motorenSigerCvrIkkeSlaaetOp(motor)).toBe(true);
  });
  it("6. dubletter i anbefalingen (tal med dem → tvivl), og konverteringen stopper ved CVR-genbrug uden at røre den eksisterende virksomhed", () => {
    expect(dubletterIAnbefalingen(motor)).toBe(true);
    expect(konverteringStopperVedGenbrug(motor)).toBe(true);
  });
  it("7. «Ansøgninger» står i rådgiverens menu lige efter Virksomheder", () => {
    expect(menuenHarAnsoegninger(nav)).toBe(true);
  });
});

describe("flowRettelser.guard — VÆRNET VIRKER: kopier med fejlen sat ind fanges", () => {
  const app = udenKommentarer(laes(APP)); const status = udenKommentarer(laes(STATUS)); const motor = udenKommentarer(laes(MOTOR));
  const gem = udenKommentarer(laes(GEM)); const nav = udenKommentarer(laes(NAV)); const skaerm = udenKommentarer(laes(SKAERM)); const kvit = udenKommentarer(laes(KVIT));

  it("1. ruten bag ProtectedRoute → falsk; «ikke nu» udført automatisk i en effekt → falsk; knappen koblet fra → falsk", () => {
    expect(statusRutenErUguardet(app.replace("<AnsoegStatus />", "<ProtectedRoute><AnsoegStatus /></ProtectedRoute>"))).toBe(false);
    expect(ikkeNuKraeverKlik(status + "\nuseEffect(() => { void sigIkkeNu(token); }, [token]);\n")).toBe(false);
    expect(ikkeNuKraeverKlik(status.replace("onClick={ikkeNu}", "onClick={() => setBekraefter(false)}"))).toBe(false);
  });
  it("2. kvitteringen planlagt som en anden trappe → falsk; skærmen lover indbakken igen → falsk (en kommentar tæller ikke)", () => {
    expect(indsendelsenPlanlaeggerKvittering(motor.replace('trappe: "indsendt", anker: nu, nu', 'trappe: "kladde", anker: nu, nu'))).toBe(false);
    expect(kvitteringsskaermenLoverMailen(kvit.replace("Du får en mail med det, du skrev", "Hold øje med telefonen og indbakken"))).toBe(false);
    expect(kvitteringsskaermenLoverMailen(udenKommentarer(laes(KVIT) + "\n// Hold øje med telefonen og indbakken\n"))).toBe(true);
  });
  it("3. rådgivermailen uden idempotens → falsk; til en anden adresse → falsk", () => {
    expect(raadgiverMailSendesVedIndsendelse(motor.replace("idempotencyKey: `ansoegning-ny-raadgiver-${a.id}`", "idempotencyKey: undefined"))).toBe(false);
    expect(raadgiverMailSendesVedIndsendelse(motor.replace("to: KONTAKT_ADRESSE", 'to: "jonas@topix.dk"'))).toBe(false);
  });
  it("4. loftet tilbage på 5 → falsk; 429-teksten uden udvej → falsk", () => {
    expect(loftetEr30MedUdvej(gem.replace("const OPRET_PR_IP_PR_TIME = 30;", "const OPRET_PR_IP_PR_TIME = 5;"))).toBe(false);
    expect(loftetEr30MedUdvej(gem.replace(/const FOR_MANGE = `[^`]*`;/, 'const FOR_MANGE = "For mange forsøg — prøv igen om lidt.";'))).toBe(false);
  });
  it("5. fallback der overskriver et rigtigt opslag → falsk; fladen uden feltet → falsk; motoren tier → falsk", () => {
    expect(fallbackGemmerNavnet(gem.replace("if (!erRigtigtOpslag)", "if (true)"))).toBe(false);
    expect(fladenSpoergerOmNavnet(skaerm.replace("data-cvr-fallback", "data-x"))).toBe(false);
    expect(motorenSigerCvrIkkeSlaaetOp(motor.replace('"CVR ikke slået op — virksomhedsnavnet er ansøgerens eget"', '""'))).toBe(false);
  });
  it("6. kontaktpersonen overskrevet igen → falsk; konverteringen fortsætter efter genbrug → falsk; dubletterne ude af anbefalingen → falsk", () => {
    const fra = motor.indexOf("export async function konverterTilVirksomhed");
    const kopi1 = motor.slice(0, fra) + motor.slice(fra).replace("return { ok: false, grund };", "opd.contact_person = a.navn;\n        return { ok: false, grund };");
    expect(konverteringStopperVedGenbrug(kopi1)).toBe(false);
    const kopi2 = motor.slice(0, fra) + motor.slice(fra).replace("return { ok: false, grund };", "console.log(grund);");
    expect(konverteringStopperVedGenbrug(kopi2)).toBe(false);
    expect(dubletterIAnbefalingen(motor.replace("anbefaling.imod.push(...dubletter.advarsler)", ""))).toBe(false);
    expect(dubletterIAnbefalingen(motor.replace('anbefaling.udfald = "tvivl";', 'anbefaling.udfald = "tal_med_dem";'))).toBe(false);
  });
  it("7. menupunktet væk eller flyttet → falsk", () => {
    const punkt = '{ label: "Ansøgninger", to: "/ansoegninger", active: active === "ansoegninger" },';
    expect(menuenHarAnsoegninger(nav.replace(punkt, ""))).toBe(false);
    expect(menuenHarAnsoegninger(nav.replace(punkt, "").replace('{ label: "Virksomheder"', punkt + '\n    { label: "Virksomheder"'))).toBe(false);
  });
});

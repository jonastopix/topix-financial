import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (16/9 2026): signup siger hvad der er galt — tre af «de dårlige
// dage» (mangellisten w2, recon-signup-daarlige-dage.md). Fladerne rører
// Supabase og React Router og kan ikke køres rent i vitest, så tre ting
// læses i kilden:
//   1. Auth.tsx' signup-fejlgren kalder signupFejl( og viser ALDRIG
//      error.message direkte (den går til console.warn).
//   2. Auth.tsx' opslag går gennem afgoerInvitationslink( med data OG error,
//      og «ukendt» åbner siden på login (setIsLogin(true)).
//   3. AuthRoute (App.tsx) har grenen for invite + bruger, og skærmen
//      InvitationTilLoggetInd kalder supabase.auth.signOut() uden at
//      navigere væk (URL'en med tokenet skal bevares).
// Dommene er navngivne og rene over kildetekst; «VÆRNET VIRKER» kører de
// samme domme på kopier med fejlen indsat.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const AUTH = "src/pages/Auth.tsx";
const APP = "src/App.tsx";
const SKAERM = "src/components/hjemmebane/InvitationTilLoggetInd.tsx";

/** Kroppen fra `signatur` frem til den næste linje der begynder med `  };` (metoder i Auth). */
function blokTil(kilde: string, signatur: string, slutMarkoer: string): string {
  const start = kilde.indexOf(signatur);
  if (start === -1) throw new Error(`fandt ikke \`${signatur}\``);
  const slut = kilde.indexOf(slutMarkoer, start);
  return kilde.slice(start, slut === -1 ? kilde.length : slut + slutMarkoer.length);
}

/** 1. handleSignup: fejlgrenen kalder signupFejl(error.message), toaster dom.tekst,
    skifter til login på skiftTilLogin — og toaster IKKE error.message. */
export function signupFejlgrenBrugerDommen(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  const blok = blokTil(k, "const handleSignup = async (", "\n  };");
  return (
    blok.includes("const dom = signupFejl(error.message);") &&
    blok.includes("toast.error(dom.tekst);") &&
    blok.includes("if (dom.skiftTilLogin) setIsLogin(true);") &&
    !blok.includes("toast.error(error.message)") &&
    !/toast\.error\(\s*error\b/.test(blok)
  );
}

/** 2. Opslaget: rpc → then({ data, error }) → afgoerInvitationslink({ harToken: true, data, error });
    «ukendt» → setIsLogin(true); og der findes ingen «vent»-fri gren: opslag-state sættes. */
export function opslagetGaarGennemDommen(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  const start = k.indexOf('.rpc("lookup_invite_company_info"');
  if (start === -1) return false;
  const blok = k.slice(start, k.indexOf("}, [inviteToken]);", start));
  return (
    blok.includes(".then(({ data, error }) => {") &&
    blok.includes("const dom = afgoerInvitationslink({ harToken: true, data, error });") &&
    blok.includes('if (dom === "gyldig") {') &&
    blok.includes('} else if (dom === "ukendt") {') &&
    blok.includes("setIsLogin(true);") &&
    blok.includes("setOpslag(dom);") &&
    k.includes('if (opslag === "venter") {')
  );
}

/** 3a. AuthRoute: invite læses, og grenen `user && !force` viser InvitationTilLoggetInd når invite findes,
    FØR Navigate. */
export function authRouteHarInviteGrenen(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  const blok = blokTil(k, "const AuthRoute = (", "\n};");
  const gren = blok.indexOf("if (user && !force) {");
  const skaerm = blok.indexOf("if (invite) return <InvitationTilLoggetInd email={user.email ?? \"\"} />;");
  const navigate = blok.indexOf('return <Navigate to={returnUrl || "/"} replace />;');
  return (
    blok.includes('const invite = qs.get("invite");') &&
    gren !== -1 && skaerm !== -1 && navigate !== -1 &&
    gren < skaerm && skaerm < navigate
  );
}

/** 3b. Skærmen: log ud-handleren kalder supabase.auth.signOut() og navigerer IKKE
    (ingen navigate(, location, reload, href i den handler); «Fortsæt» navigerer til /. */
export function logUdBliverPaaUrlen(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  const handler = blokTil(k, "const logUdOgBliv = async () => {", "\n  };");
  return (
    handler.includes("await supabase.auth.signOut();") &&
    !/navigate\(|location|reload|href/.test(handler) &&
    k.includes('navigate("/", { replace: true })') &&
    k.includes("useHbDokumentGrund();") &&
    k.includes("Log ud og brug invitationen") &&
    k.includes("Invitationslinket skal åbnes af den der er inviteret.")
  );
}

describe("signupDaarligeDage.guard — de tre steder holder", () => {
  it("1. Auth.tsx' signup-fejlgren bruger signupFejl og viser ikke error.message", () => {
    expect(signupFejlgrenBrugerDommen(laes(AUTH))).toBe(true);
  });
  it("2. Auth.tsx' opslag går gennem afgoerInvitationslink, ukendt → login, og siden venter på svaret", () => {
    expect(opslagetGaarGennemDommen(laes(AUTH))).toBe(true);
    // Linjen over login og linket «Opret konto alligevel» findes.
    const k = udenKommentarer(laes(AUTH));
    expect(k).toContain('{opslag === "ukendt" && (');
    expect(k).toContain("{LINK_UKENDT_TEKST}");
    expect(k).toContain("Opret konto alligevel");
  });
  it("3. AuthRoute har grenen for invite + bruger, og skærmen logger ud uden at navigere væk", () => {
    expect(authRouteHarInviteGrenen(laes(APP))).toBe(true);
    expect(logUdBliverPaaUrlen(laes(SKAERM))).toBe(true);
  });
  it("kontaktadressen kommer fra lib/kontaktadresse — ingen literal i de nye filer", () => {
    for (const sti of ["src/lib/signupFejl.ts", AUTH, SKAERM]) {
      const k = udenKommentarer(laes(sti));
      expect(k, sti).not.toContain("kontakt@theboardroom.dk");
      expect(k, sti).not.toMatch(/mailto:/);
    }
    expect(udenKommentarer(laes("src/lib/signupFejl.ts"))).toContain('import { KONTAKT_ADRESSE } from "@/lib/kontaktadresse";');
  });
});

describe("signupDaarligeDage.guard — VÆRNET VIRKER (dommene på kopier med fejlen indsat)", () => {
  it("1. den rå tekst toastes, dommen fjernet, eller skiftet til login fjernet → falsk", () => {
    const k = laes(AUTH);
    expect(signupFejlgrenBrugerDommen(k.replace("toast.error(dom.tekst);", "toast.error(error.message);"))).toBe(false);
    expect(signupFejlgrenBrugerDommen(k.replace("const dom = signupFejl(error.message);", "const dom = { tekst: error.message, skiftTilLogin: false };"))).toBe(false);
    expect(signupFejlgrenBrugerDommen(k.replace("if (dom.skiftTilLogin) setIsLogin(true);", ""))).toBe(false);
  });
  it("2. error ikke læst, dommen fjernet, ukendt uden login, eller ingen ventetilstand → falsk", () => {
    const k = laes(AUTH);
    expect(opslagetGaarGennemDommen(k.replace(".then(({ data, error }) => {", ".then(({ data }) => {"))).toBe(false);
    expect(opslagetGaarGennemDommen(k.replace("const dom = afgoerInvitationslink({ harToken: true, data, error });", 'const dom = data ? "gyldig" : "ukendt";'))).toBe(false);
    expect(opslagetGaarGennemDommen(k.replace('} else if (dom === "ukendt") {\n          setIsLogin(true);', '} else if (dom === "ukendt") {'))).toBe(false);
    expect(opslagetGaarGennemDommen(k.replace('if (opslag === "venter") {', 'if (false) {'))).toBe(false);
  });
  it("3. grenen fjernet, skærmen efter Navigate, eller log ud der navigerer → falsk", () => {
    const app = laes(APP);
    expect(authRouteHarInviteGrenen(app.replace('    if (invite) return <InvitationTilLoggetInd email={user.email ?? ""} />;\n', ""))).toBe(false);
    expect(authRouteHarInviteGrenen(app.replace('const invite = qs.get("invite");', "const invite = null;"))).toBe(false);
    const skaerm = laes(SKAERM);
    expect(logUdBliverPaaUrlen(skaerm.replace("await supabase.auth.signOut();", 'await supabase.auth.signOut();\n    navigate("/auth");'))).toBe(false);
    expect(logUdBliverPaaUrlen(skaerm.replace("await supabase.auth.signOut();", "window.location.reload();"))).toBe(false);
  });
});

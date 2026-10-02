import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for medlemmets forside PR 4 (17/9-2026) — JONAS (ordret: «A på
// alle»), valg 6: rådgiverens ansigt ved næste skridt og forslag; analyse §5:
// ansigter i fællesskabet. Fem ting låses:
//   1. ÉN hentning: get_all_advisor_profiles kaldes præcis én gang på
//      forsiden (["boardroom","raadgivere"]) og føder «Dit næste skridt»
//      (fokusAnsigt) og forslagene i «Din plan» — den gamle push-sender-query
//      er væk. (Pushets afsender (afsender) var den tredje aftager til 2/10,
//      hvor båndet «Fra os til dig» forlod forsiden — seks steder,
//      seksSteder.guard; forsiden kalder ikke længere afsender.)
//   2. proposed_by er MED i forsidens company_actions-select — uden den er
//      der intet at slå op.
//   3. Dommen er REN: hvem der får et ansigt afgøres i ansigter.raadgiverAnsigt
//      (kun source_type advisor + kendt proposed_by; AI får intet) — forsiden
//      bærer ingen egen «advisor»-regel.
//   4. Fællesskabet — OMSKREVET 2/10 (seks steder, skridt 2): «Fra
//      fællesskabet» (det store kort + aktive-rækken) forlod forsiden; det
//      nyeste opslag står som ÉN række i «Næste i Netværket» med HbAvatar
//      (portræt når det findes, ellers initialen). Forsiden henter IKKE
//      Netværket (ingen member-directory-query, intet aktiveMedlemmer-kald)
//      — dommen aktiveMedlemmer (ansigter.ts) står med sine tests, fail-closed
//      som før, til Netværket. Var (17/9–2/10): det store kort 72 px +
//      avatar-rækken fra aktiveMedlemmer med Netværkets synlige.
//   5. Aldrig et tomt billede: HbAvatar falder tilbage til initialen ved
//      onError; forsiden har ingen nye rå <img>-avatarer (pushets 40 px-byline er arv).
// Kildelæsning med selvbevis på kopier (dineMaal.guard-mønstret).

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const FORSIDE = "src/components/hjemmebane/boardroom/BoardroomView.tsx";
const DOM = "src/lib/hjemmebane/ansigter.ts";
const AVATAR = "src/components/hjemmebane/HbAvatar.tsx";

/** Dom 1: én hentning. */
export const enHentning = (forside: string): boolean =>
  (forside.match(/rpc\("get_all_advisor_profiles"/g) ?? []).length === 1 &&
  forside.includes('queryKey: ["boardroom", "raadgivere"]') &&
  forside.includes('raadgiverOpslag(kraevRaekker(await supabase.rpc("get_all_advisor_profiles" as any), "get_all_advisor_profiles")') &&
  !forside.includes("afsender(") &&
  !forside.includes('"push-sender"');

/** Dom 2: proposed_by i select. */
export const selectBaererProposedBy = (forside: string): boolean =>
  forside.includes('deferral_count, source_type, maal_id, proposed_by")');

/** Dom 3: dommen er ren. */
export const dommenErRen = (forside: string, dom: string): boolean =>
  // Fire steder i «Din plan»: under målene, «Venter på jeres ja» (skive 3, fund 7), «Uden mål», «Skridt under andre mål».
  (forside.match(/ansigt=\{raadgiverAnsigt\(f, raadgivere\)\}/g) ?? []).length === 4 &&
  forside.includes("ansigt={fokusAnsigt}") &&
  forside.includes("return raekke ? raadgiverAnsigt(raekke, raadgivere) : null;") &&
  !/"advisor"/.test(forside) &&
  dom.includes('if (skridt.source_type !== "advisor") return null;') &&
  dom.includes("if (!skridt.proposed_by) return null;") &&
  dom.includes("linje: `Fra ${fn}`");

/** Dom 4 (omskrevet 2/10, skridt 2): det nyeste opslag i «Næste i Netværket»
    bruger HbAvatar; forsiden henter ikke Netværket og kalder ikke
    aktiveMedlemmer; dommen i ansigter.ts er urørt (fail-closed). */
export const faellesskabetHolder = (forside: string, dom: string): boolean => {
  const krop = forside.slice(forside.indexOf("export const BoardroomView = () => {"));
  return krop.length > 0 &&
    forside.includes("<HbAvatar navn={naesteNetvaerk.opslag.forfatter_navn} avatarUrl={naesteNetvaerk.opslag.forfatter_avatar_url} />") &&
    !/h-\[72px\] w-\[72px\] shrink-0 rounded-full/.test(forside) &&
    !/<FremhaevetOpslag\b|const FremhaevetOpslag\b|aktiveMedlemmer\(|synligeMedlemmer\(|listMemberDirectory|"member-directory"/.test(forside) &&
    !/<img\b/.test(krop) &&
    dom.includes("if (!synlige) return { medlemmer: [], antal: 0, tekst: null };") &&
    dom.includes("filter((m) => !m.is_advisor)") &&
    dom.includes("export const AKTIVE_DAGE = 7;") && dom.includes("export const AKTIVE_MAKS = 6;");
};

/** Dom 5: aldrig et tomt billede. */
export const aldrigTomtBillede = (avatar: string, forside: string): boolean =>
  avatar.includes("onError={() => setFejl(true)}") &&
  avatar.includes("avatarUrl && !fejl ?") &&
  avatar.includes('{(navn ?? "?").charAt(0)}') &&
  !/const TraadForfatterAvatar/.test(forside) &&
  // Pushets byline-portræt (40 px, arv — HbAvatar har ikke den størrelse) er den ENESTE rå avatar tilbage.
  (forside.match(/rounded-full border border-hb-line object-cover/g) ?? []).length === 1;

describe("forsideAnsigter.guard — PR 4: én hentning, proposed_by, ren dom, fællesskabet, aldrig et tomt billede", () => {
  const forside = udenKommentarer(laes(FORSIDE));
  const dom = udenKommentarer(laes(DOM));
  const avatar = udenKommentarer(laes(AVATAR));

  it("dom 1: get_all_advisor_profiles hentes én gang og føder næste skridt og planen; push-sender-queryen er væk (og pushets afsender med båndet, 2/10)", () => {
    expect(enHentning(forside)).toBe(true);
  });
  it("dom 2: proposed_by står i forsidens company_actions-select", () => {
    expect(selectBaererProposedBy(forside)).toBe(true);
  });
  it("dom 3: ansigtet afgøres i raadgiverAnsigt (advisor + kendt proposed_by; AI intet) — forsiden har ingen egen regel", () => {
    expect(dommenErRen(forside, dom)).toBe(true);
  });
  it("dom 4 (omskrevet 2/10): det nyeste opslag i «Næste i Netværket» bruger HbAvatar; forsiden henter ikke Netværket; aktiveMedlemmer er urørt og fail-closed", () => {
    expect(faellesskabetHolder(forside, dom)).toBe(true);
  });
  it("dom 5: HbAvatar falder tilbage til initialen ved onError; ingen nye rå <img>-avatarer på forsiden", () => {
    expect(aldrigTomtBillede(avatar, forside)).toBe(true);
  });

  it("selvbevis 1: en ekstra rpc-hentning, eller push-sender-queryen tilbage, falder", () => {
    expect(enHentning(forside + '\nawait supabase.rpc("get_all_advisor_profiles" as any);')).toBe(false);
    expect(enHentning(forside.replace('queryKey: ["boardroom", "raadgivere"]', 'queryKey: ["boardroom", "push-sender", pushAuthorUserId]'))).toBe(false);
    expect(enHentning(forside + "\nconst pushSender = afsender(pushAuthorUserId, raadgivere);")).toBe(false);
  });
  it("selvbevis 2: proposed_by ude af select falder", () => {
    expect(selectBaererProposedBy(forside.replace("source_type, maal_id, proposed_by", "source_type, maal_id"))).toBe(false);
  });
  it("selvbevis 3: en egen advisor-regel på forsiden, eller en dom der giver AI et ansigt, falder", () => {
    expect(dommenErRen(forside.replace("ansigt={fokusAnsigt}", 'ansigt={raekke?.source_type === "advisor" ? fokusAnsigt : null}'), dom)).toBe(false);
    expect(dommenErRen(forside, dom.replace('if (skridt.source_type !== "advisor") return null;', ""))).toBe(false);
  });
  it("selvbevis 4: et råt billede i rækken, member-directory-hentningen tilbage på forsiden, eller «alle indtil videre» når Netværket mangler, falder", () => {
    expect(faellesskabetHolder(forside.replace("<HbAvatar navn={naesteNetvaerk.opslag.forfatter_navn} avatarUrl={naesteNetvaerk.opslag.forfatter_avatar_url} />", '<img src={naesteNetvaerk.opslag.forfatter_avatar_url!} className="h-9 w-9 rounded-full" />'), dom)).toBe(false);
    expect(faellesskabetHolder(forside.replace("const naesteNetvaerk = useMemo(", 'const directoryQuery = useQuery({ queryKey: ["member-directory"], queryFn: listMemberDirectory });\n  const naesteNetvaerk = useMemo('), dom)).toBe(false);
    expect(faellesskabetHolder(forside, dom.replace("if (!synlige) return { medlemmer: [], antal: 0, tekst: null };", "if (!synlige) synlige = new Set(traade.map((t) => t.forfatter_id));"))).toBe(false);
  });
  it("selvbevis 5: HbAvatar uden onError-fald-tilbage, eller en ny rå avatar på forsiden, falder", () => {
    expect(aldrigTomtBillede(avatar.replace("onError={() => setFejl(true)}", ""), forside)).toBe(false);
    expect(aldrigTomtBillede(avatar, forside + '\n<img src={x} className="h-9 w-9 rounded-full border border-hb-line object-cover" />')).toBe(false);
  });
});

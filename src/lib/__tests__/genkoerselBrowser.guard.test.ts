import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn: «Genkør flere rapporter» i browseren (17/9-2026). Fem domme:
//   1. Kørslen bygger PRÆCIS uploadzonens payload (extractTextFromFile, extractPdfStructural, fileToBase64)
//      og kalder extract-financial-data med det EKSISTERENDE reportId — ordet «overwrite» findes ikke i
//      kørslen, og filen hentes med storage.download fra financial-documents (ingen upload, ingen insert).
//   2. Godkendelsen er commit_report_facts(p_report_id) — samme RPC som dialogen — og forhåndsvisningen
//      get_report_commit_preview.
//   3. Sekventielt: koerHold venter PAUSE_MS mellem rapporterne og standser på AbortSignal.
//   4. Fladen: manuelt rettede og «ejes af anden» vises med mærker og dømmes af afgoerMasseGenkoersel;
//      «Godkend alle der er PASS» bruger kun rapporter med godkendelse.automatisk; højst HOLD_LOFT pr. kørsel.
//   5. Ruten /virksomheder/genkoer er AdvisorRoute, og virksomhedslisten linker til den.
// Kildelæsning med selvbevis på kopier.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const KOERSEL = "src/lib/genkoerselBrowserKoersel.ts";
const VIEW = "src/components/hjemmebane/genkoersel/GenkoerRapporterView.tsx";
const APP = "src/App.tsx";
const LISTE = "src/components/hjemmebane/virksomheder/VirksomhedslisteView.tsx";
const UPLOAD = "src/components/hjemmebane/rapportering/HbReportUploadZone.tsx";

/** Dom 1. */
export const sammePayloadSammeId = (k: string, u: string): boolean =>
  k.includes('import { extractTextFromFile, fileToBase64 } from "@/lib/reportUploadEngine";') &&
  k.includes('import { extractPdfStructural } from "@/lib/pdfStructuralExtractor";') &&
  k.includes('const { data, error } = await supabase.storage.from("financial-documents").download(filePath);') &&
  k.includes("body: { ...payload, reportId: r.id, fileName: file.name, knownCompanyName: companyName || undefined },") &&
  !/overwrite/i.test(k) &&
  !/\.upload\(/.test(k) &&
  !/\.insert\(/.test(k) &&
  // uploadzonen sender de samme fire felter — værnet læser dem hos den, så en ny payload-del dér også skal ind her
  u.includes("{ body: { fileContent: extracted.text, pageImages: extracted.pageImages, excelBase64, pdfStructural, reportId: reportRecord.id, fileName: file.name, knownCompanyName: companyName || undefined } },") &&
  k.includes("return { fileContent: extracted.text, pageImages: extracted.pageImages, excelBase64, pdfStructural };");

/** Dom 2. */
export const godkendelsen = (k: string): boolean =>
  k.includes('const { error } = await supabase.rpc("commit_report_facts", { p_report_id: reportId });') &&
  k.includes('const { data, error } = await supabase.rpc("get_report_commit_preview", { p_report_id: reportId });');

/** Dom 3. */
export const takten = (k: string): boolean =>
  k.includes("if (i < rapporter.length - 1 && !signal?.aborted) await vent(PAUSE_MS, signal);") &&
  k.includes("if (signal?.aborted) {") &&
  k.includes("onResultat(await genkoerEn(r, navne.get(r.company_id) ?? null), i);");

/** Dom 4. */
export const fladen = (v: string): boolean =>
  v.includes("for (const r of rapporter ?? []) m.set(r.id, afgoerMasseGenkoersel(r, { skabeloner, medManuelle }));") &&
  v.includes("const hold = kandidater.filter((r) => valgte.has(r.id)).slice(0, HOLD_LOFT);") &&
  v.includes('const klar = [...resultater.values()].filter((r) => r.udfald === "genlaest" && !r.godkendt && r.godkendelse.automatisk);') &&
  v.includes(">Manuelt rettet</HbTag>") &&
  v.includes(">Ejes af anden rapport</HbTag>") &&
  v.includes("const [medManuelle, setMedManuelle] = useState(false);") &&
  v.includes('onClick={() => afbryd.current?.abort()}');

/** Dom 5. */
export const ruten = (a: string, l: string): boolean =>
  a.includes('<Route path="/virksomheder/genkoer" element={<AdvisorRoute><GenkoerRapporter /></AdvisorRoute>} />') &&
  l.includes('<Link to="/virksomheder/genkoer" className="text-hb-evergreen underline-offset-4 hover:underline">Genkør rapporter</Link>');

describe("genkoerselBrowser.guard — samme payload, samme rapport-id, aldrig overwrite", () => {
  const k = udenKommentarer(laes(KOERSEL));
  const u = udenKommentarer(laes(UPLOAD));
  const v = udenKommentarer(laes(VIEW));
  const a = udenKommentarer(laes(APP));
  const l = udenKommentarer(laes(LISTE));

  it("dom 1: kørslen bygger uploadzonens payload og kalder med eksisterende reportId", () => { expect(sammePayloadSammeId(k, u)).toBe(true); });
  it("dom 2: godkendelse og forhåndsvisning går gennem de to RPC'er", () => { expect(godkendelsen(k)).toBe(true); });
  it("dom 3: sekventielt med pause og afbrydelse", () => { expect(takten(k)).toBe(true); });
  it("dom 4: fladen dømmer, mærker og godkender kun automatisk det der er PASS uden advarsler", () => { expect(fladen(v)).toBe(true); });
  it("dom 5: ruten er AdvisorRoute og listen linker", () => { expect(ruten(a, l)).toBe(true); });

  it("selvbevis 1: et «overwrite: true» i kørslen, eller en ny række, falder", () => {
    expect(sammePayloadSammeId(k.replace("reportId: r.id, fileName", "reportId: r.id, overwrite: true, fileName"), u)).toBe(false);
    expect(sammePayloadSammeId(k + '\nawait supabase.from("financial_reports").insert({});', u)).toBe(false);
  });
  it("selvbevis 2–3: en anden RPC, eller kørsel uden pause, falder", () => {
    expect(godkendelsen(k.replace('supabase.rpc("commit_report_facts"', 'supabase.rpc("commit_facts"'))).toBe(false);
    expect(takten(k.replace("if (i < rapporter.length - 1 && !signal?.aborted) await vent(PAUSE_MS, signal);", ""))).toBe(false);
  });
  it("selvbevis 4–5: automatisk godkendelse af alt genlæst, eller ruten uden AdvisorRoute, falder", () => {
    expect(fladen(v.replace(' && !r.godkendt && r.godkendelse.automatisk);', ' && !r.godkendt);'))).toBe(false);
    expect(ruten(a.replace("<AdvisorRoute><GenkoerRapporter /></AdvisorRoute>", "<ProtectedRoute><GenkoerRapporter /></ProtectedRoute>"), l)).toBe(false);
  });
});

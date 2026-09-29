import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TOPIC_COLORS } from "@/lib/chatShared";
import { REFLEKSION_CONTEXT_TYPE } from "@/lib/refleksionSvar";

/**
 * Kildeværn for «svar på et refleksionsfelt» (29/9-2026, kort
 * m28-refleksion-svar). Fire domme, hver bevist på en kopi med fejlen indsat:
 *
 *   1. CITATET ER FROSSET: det kommer fra beskedens context_meta.citat
 *      (laesRefleksionsCitat) — aldrig fra et opslag i pulse_checkins ved
 *      visning. Motoren lægger citatet i context_meta; hverken motoren eller
 *      citatkomponenten kender tabellen. Refleksionen er et øjebliksbillede
 *      (Jonas 28/9), og medlemmet kan overskrive rækken bagefter.
 *   2. CITATET ER REN TEKST: ChatSvarCitat.tsx bruger ALDRIG
 *      dangerouslySetInnerHTML (samme regel som chatSvar.guard dom 4), og
 *      RefleksionCitat tegner {c.citat} som React-tekst.
 *   3. TYPERNE ER I TAKT: motorens REFLEKSION_CONTEXT_TYPE er «refleksion»,
 *      chatShared.TOPIC_COLORS kender ordet, begge paner tegner ikonet og
 *      citatet i begge bobler (mobil + desktop), og komponenten dømmer på
 *      motorens konstant.
 *   4. VEJEN ER RAPPORTKOMMENTARENS: virksomhedssiden bygger beskeden med
 *      bygRefleksionsSvar (rækkens id + period_key + feltets tekst), indsætter
 *      i messages i samtalen, og kalder notifyChatMessage bagefter — og hooken
 *      henter rækkens id, så context_id kan sættes.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

const LIB = "src/lib/refleksionSvar.ts";
const CITAT = "src/components/ChatSvarCitat.tsx";
const SHARED = "src/lib/chatShared.ts";
const PANER = ["src/components/CompanyChatPane.tsx", "src/components/MemberChatPane.tsx"] as const;
const VIEW = "src/components/hjemmebane/virksomhed/VirksomhedView.tsx";
const HOOK = "src/hooks/useVirksomhed.ts";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const citatetErFrosset = (lib: string, citat: string): boolean => {
  const l = udenKommentarer(lib), c = udenKommentarer(citat);
  const komponent = c.slice(c.indexOf("export const RefleksionCitat"));
  return (
    // Motoren lægger citatet i context_meta og rører ingen database.
    /context_meta: \{\s*title: refleksionsTitel\(i\.checkin\.period_key, i\.felt\),\s*felt: i\.felt,\s*citat,\s*period_key: i\.checkin\.period_key,\s*\}/.test(l) &&
    !/supabase|pulse_checkins/.test(l) &&
    l.includes("export function laesRefleksionsCitat(meta: unknown)") &&
    // Komponenten læser KUN meta — intet opslag, ingen tabel, ingen query.
    komponent.length > 0 &&
    komponent.includes("const c = laesRefleksionsCitat(contextMeta);") &&
    !/pulse_checkins|useQuery|supabase/.test(komponent)
  );
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const citatetErRenTekst = (citat: string): boolean => {
  const c = udenKommentarer(citat);
  const komponent = c.slice(c.indexOf("export const RefleksionCitat"));
  return !/dangerouslySetInnerHTML/.test(c) && komponent.includes("{c.citat}") && /<blockquote/.test(komponent);
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const typerneErITakt = (lib: string, shared: string, citat: string, paner: readonly string[], farver: Record<string, unknown>): boolean => {
  const l = udenKommentarer(lib), s = udenKommentarer(shared), c = udenKommentarer(citat);
  return (
    l.includes('export const REFLEKSION_CONTEXT_TYPE = "refleksion";') &&
    "refleksion" in farver &&
    /\n\s*refleksion: \{[^\n]*label: "Refleksion"[^\n]*icon: Quote \},/.test(s) &&
    c.includes("if (contextType !== REFLEKSION_CONTEXT_TYPE) return null;") &&
    paner.every((k) => {
      const p = udenKommentarer(k);
      return (
        (p.match(/\{contextType === "refleksion" && <Quote className="h-3 w-3" \/>\}/g) ?? []).length === 2 &&
        (p.match(/<RefleksionCitat contextType=\{contextType\} contextMeta=\{contextMeta\} isMine=\{isMine\} \/>/g) ?? []).length === 2 &&
        p.includes('import { RefleksionCitat } from "@/components/ChatSvarCitat";')
      );
    })
  );
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const vejenErRapportkommentarens = (view: string, hook: string): boolean => {
  const v = udenKommentarer(view), h = udenKommentarer(hook);
  const send = v.slice(v.indexOf("const sendSvar = async ("), v.indexOf("return (", v.indexOf("const sendSvar = async (")));
  return (
    send.length > 0 &&
    send.includes("const dom = bygRefleksionsSvar({ checkin: { id: r.id, period_key: r.period_key }, felt: f.noegle, feltTekst: f.tekst, svar: svarTekst });") &&
    // `=== false`, ikke `!dom.ok`: strict er slået fra, og et bart boolean-felt indsnævrer ikke unionen.
    send.includes("if (dom.ok === false) { setSvarFejl(SVAR_GRUND[dom.grund]); return; }") &&
    send.includes('.from("messages")') &&
    send.includes('.insert({ conversation_id: samtaleId, sender_id: user.id, message_type: "user", ...dom.besked })') &&
    foer(send, '.from("messages")', "notifyChatMessage(data.id);") &&
    send.includes("if (!r || !user || !samtaleId || svarSender) return;") &&
    // Rapportkommentaren OG refleksionssvaret kalder notifyChatMessage — to steder.
    (v.match(/notifyChatMessage\(data\.id\);/g) ?? []).length === 2 &&
    v.includes("<Blok2 d={data} samtaleId={samtaleId} />") &&
    h.includes('.select("id, went_well, biggest_challenge, help_needed, milestone_progress, created_at, period_key")')
  );
};

describe("refleksionSvar.guard — svar på et refleksionsfelt", () => {
  it("1. citatet er frosset: fra context_meta, aldrig et opslag i pulse_checkins", () => expect(citatetErFrosset(laes(LIB), laes(CITAT))).toBe(true));
  it("2. citatet er ren tekst — ingen dangerouslySetInnerHTML i ChatSvarCitat.tsx", () => expect(citatetErRenTekst(laes(CITAT))).toBe(true));
  it("3. «refleksion» er samme ord i motoren, chippen, komponenten og begge paner", () => expect(typerneErITakt(laes(LIB), laes(SHARED), laes(CITAT), PANER.map(laes), TOPIC_COLORS)).toBe(true));
  it("4. vejen er rapportkommentarens: bygRefleksionsSvar → messages → notifyChatMessage, og hooken henter id", () => expect(vejenErRapportkommentarens(laes(VIEW), laes(HOOK))).toBe(true));
  it("konstanten er den, chippen kender", () => expect(TOPIC_COLORS[REFLEKSION_CONTEXT_TYPE]?.label).toBe("Refleksion"));
});

describe("refleksionSvar.guard — dommene fanger fejlen på en kopi", () => {
  const lib = laes(LIB), citat = laes(CITAT), shared = laes(SHARED), view = laes(VIEW), hook = laes(HOOK);
  const paner = PANER.map(laes);

  it("et opslag i pulse_checkins ved visning, eller et citat der ikke lægges i context_meta, fælder dom 1", () => {
    const komponent = citat.indexOf("export const RefleksionCitat");
    const medOpslag = `${citat.slice(0, komponent)}${citat.slice(komponent).replace("const c = laesRefleksionsCitat(contextMeta);", 'const { data } = useQuery({ queryKey: ["pulse_checkins"], queryFn: () => supabase.from("pulse_checkins").select("*") });\n  const c = laesRefleksionsCitat(contextMeta);')}`;
    expect(medOpslag).not.toBe(citat);
    expect(citatetErFrosset(lib, medOpslag)).toBe(false);
    expect(citatetErFrosset(lib.replace("        citat,\n", ""), citat)).toBe(false);
    expect(citatetErFrosset(`${lib}\nimport { supabase } from "@/integrations/supabase/client";\n`, citat)).toBe(false);
  });

  it("dangerouslySetInnerHTML i citatet fælder dom 2", () => {
    expect(citatetErRenTekst(citat.replace('<span className="min-w-0 whitespace-pre-line break-words italic">{c.citat}</span>', '<span dangerouslySetInnerHTML={{ __html: c.citat }} />'))).toBe(false);
  });

  it("et andet ord i motoren, en chip der mangler, et ikon eller et citat væk fra én boble, fælder dom 3", () => {
    expect(typerneErITakt(lib.replace('export const REFLEKSION_CONTEXT_TYPE = "refleksion";', 'export const REFLEKSION_CONTEXT_TYPE = "reflection";'), shared, citat, paner, TOPIC_COLORS)).toBe(false);
    expect(typerneErITakt(lib, shared, citat, paner, { report: {} })).toBe(false);
    expect(typerneErITakt(lib, shared, citat.replace("if (contextType !== REFLEKSION_CONTEXT_TYPE) return null;", 'if (contextType !== "refleksion") return null;'), paner, TOPIC_COLORS)).toBe(false);
    const [company, member] = paner;
    // Én af de to bobler mister citatet (replace uden /g rammer kun første forekomst — det er pointen).
    const enBoble = member.replace("<RefleksionCitat contextType={contextType} contextMeta={contextMeta} isMine={isMine} />", "");
    expect(enBoble).not.toBe(member);
    expect(typerneErITakt(lib, shared, citat, [company, enBoble], TOPIC_COLORS)).toBe(false);
    expect(typerneErITakt(lib, shared, citat, [company.replace('{contextType === "refleksion" && <Quote className="h-3 w-3" />}', ""), member], TOPIC_COLORS)).toBe(false);
  });

  it("svaret bygget uden motoren, sendt uden notifyChatMessage, uden samtale-porten, eller en hook uden id, fælder dom 4", () => {
    expect(vejenErRapportkommentarens(view.replace("const dom = bygRefleksionsSvar({ checkin: { id: r.id, period_key: r.period_key }, felt: f.noegle, feltTekst: f.tekst, svar: svarTekst });", 'const dom = { ok: true as const, besked: { content: svarTekst, context_type: "refleksion", context_id: r.id, context_meta: {} } };'), hook)).toBe(false);
    const send = view.indexOf("const sendSvar = async (");
    const udenNotify = `${view.slice(0, send)}${view.slice(send).replace("      notifyChatMessage(data.id);\n", "")}`;
    expect(udenNotify).not.toBe(view);
    expect(vejenErRapportkommentarens(udenNotify, hook)).toBe(false);
    expect(vejenErRapportkommentarens(view.replace("if (!r || !user || !samtaleId || svarSender) return;", "if (!r || !user || svarSender) return;"), hook)).toBe(false);
    expect(vejenErRapportkommentarens(view.replace("if (dom.ok === false) {", "if (!dom.ok) {"), hook)).toBe(false);
    expect(vejenErRapportkommentarens(view, hook.replace('.select("id, went_well,', '.select("went_well,'))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (29/9-2026): «systembeskeder ud af chatstrømmen» fejler STILLE,
// hvis en flade falder tilbage til sin egen dom — ingen exception, bare en
// skjult forslagslinje der stadig giver et ulæst-tal, eller et uddrag der
// viser en linje chatten ikke har. Mønstret er chatSvar.guard.test.ts (CI har
// ingen DB/DOM). Alle fladen der viser, tæller eller uddrager beskeder bruger
// lib/chatStroem.ts — ingen egen typedom ved siden af.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const PANER = ["src/components/CompanyChatPane.tsx", "src/components/MemberChatPane.tsx"] as const;

/** 1. Panen importerer dommen. */
export function panenImportererDommen(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  return /import \{ chatStroem, taelUlaesteIListen, uddragsBesked, visesIChatstroem \} from "@\/lib\/chatStroem";/.test(k);
}

/** 2. Hentningen sender beskederne gennem chatStroem, før de kommer i state. */
export function hentningenFiltrerer(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  return /setMessages\(chatStroem\(\(data \|\| \[\]\)\.reverse\(\)\)\);/.test(k);
}

/** 3. Realtime-INSERT lægger kun synlige beskeder i state — og markerer stadig læst bagefter. */
export function realtimeFiltrerer(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  return (
    /if \(visesIChatstroem\(newMsg\)\) setMessages\(\(prev\) => \[\.\.\.prev, newMsg\]\);/.test(k) &&
    !/setMessages\(\(prev\) => \[\.\.\.prev, newMsg\]\);/.test(k.replace(/if \(visesIChatstroem\(newMsg\)\) setMessages\(\(prev\) => \[\.\.\.prev, newMsg\]\);/, "")) &&
    /supabase\.rpc\("mark_messages_read", \{ p_conversation_id: activeConvId \}\);\s*\}\s*\}\s*\)/.test(k)
  );
}

/** 4. Samtalelistens uddrag og ulæst-tal kommer fra dommen — ingen egen `convMsgs[0]` eller typetælling. */
export function listenBrugerDommen(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  return (
    /const lastMsg = uddragsBesked\(convMsgs\);/.test(k) &&
    /const unreadCount = taelUlaesteIListen\(convMsgs, user\.id\);/.test(k) &&
    !/convMsgs\[0\]/.test(k) &&
    !/m\.message_type === "user"\s*\n?\s*\)\.length/.test(k)
  );
}

/** 5. Badgene (sidebar, mobil) tæller gennem dommen — ingen head-tælling af beskeder. */
export function badgenBrugerDommen(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  return (
    /import \{ taelUlaesteBadge \} from "@\/lib\/chatStroem";/.test(k) &&
    /taelUlaesteBadge\(ulaeste \?\? \[\], user\.id, [A-Z_]+\)/.test(k) &&
    !/from\("messages"\)\s*\.select\([^)]*head: true/.test(k)
  );
}

/** 6. Dommen selv: kun opgave_forslag er skjult, kun for system, og ukendt er synligt. */
export function dommenErSnaever(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  const noegler = [...k.matchAll(/^\s{2}([a-z_]+): "/gm)].map((m) => m[1]);
  return (
    noegler.join(",") === "opgave_forslag" &&
    /if \(besked\.message_type !== "system"\) return true;/.test(k) &&
    /if \(!kontekst\) return true;/.test(k) &&
    /return !Object\.prototype\.hasOwnProperty\.call\(SKJULTE_SYSTEM_KONTEKSTER, kontekst\);/.test(k)
  );
}

describe("chatStroem.guard — én dom for strøm, uddrag og ulæst", () => {
  it("1–4. begge paner: import, hentning, realtime, liste", () => {
    for (const p of PANER) {
      const k = laes(p);
      expect(panenImportererDommen(k), `${p} import`).toBe(true);
      expect(hentningenFiltrerer(k), `${p} hentning`).toBe(true);
      expect(realtimeFiltrerer(k), `${p} realtime`).toBe(true);
      expect(listenBrugerDommen(k), `${p} liste`).toBe(true);
    }
  });

  it("5. sidebarens og mobilens badge tæller gennem dommen", () => {
    expect(badgenBrugerDommen(laes("src/components/AppSidebar.tsx"))).toBe(true);
    expect(badgenBrugerDommen(laes("src/components/AppLayout.tsx"))).toBe(true);
  });

  it("6. dommen er snæver: kun system · opgave_forslag skjules", () => {
    expect(dommenErSnaever(laes("src/lib/chatStroem.ts"))).toBe(true);
  });

  it("7. ingen anden flade dømmer typen selv: renderingen af system/ai-linjer står urørt, og filtret ligger FØR den", () => {
    // Renderen viser stadig system og ai (milestone, agent, ai bliver). Skjulingen sker i dommen, ikke ved at fjerne grenen.
    for (const p of PANER) {
      expect(udenKommentarer(laes(p))).toMatch(/msg\.message_type === "system" \|\| msg\.message_type === "ai"/);
    }
  });

  it("VÆRNET VIRKER: kopier uden hver af de seks ting fejler (filerne er ikke rørt)", () => {
    for (const p of PANER) {
      const k = laes(p);
      // 1. import væk
      const udenImport = k.replace(/import \{ chatStroem, taelUlaesteIListen, uddragsBesked, visesIChatstroem \} from "@\/lib\/chatStroem";\n/, "");
      expect(udenImport).not.toBe(k);
      expect(panenImportererDommen(udenImport), `${p} 1`).toBe(false);
      // 2. hentning uden filter
      const udenHentning = k.replace("setMessages(chatStroem((data || []).reverse()));", "setMessages((data || []).reverse());");
      expect(udenHentning).not.toBe(k);
      expect(hentningenFiltrerer(udenHentning), `${p} 2`).toBe(false);
      // 3. realtime uden filter
      const udenRealtime = k.replace("if (visesIChatstroem(newMsg)) setMessages((prev) => [...prev, newMsg]);", "setMessages((prev) => [...prev, newMsg]);");
      expect(udenRealtime).not.toBe(k);
      expect(realtimeFiltrerer(udenRealtime), `${p} 3`).toBe(false);
      // 4a. uddrag uden dom
      const udenUddrag = k.replace("const lastMsg = uddragsBesked(convMsgs);", "const lastMsg = convMsgs[0];");
      expect(udenUddrag).not.toBe(k);
      expect(listenBrugerDommen(udenUddrag), `${p} 4a`).toBe(false);
      // 4b. ulæst uden dom
      const udenUlaest = k.replace(
        "const unreadCount = taelUlaesteIListen(convMsgs, user.id);",
        'const unreadCount = convMsgs.filter(\n          (m) => m.sender_id !== user.id && !m.read_at && m.message_type === "user"\n        ).length;',
      );
      expect(udenUlaest).not.toBe(k);
      expect(listenBrugerDommen(udenUlaest), `${p} 4b`).toBe(false);
    }
    // 5. badge uden dom (begge filer)
    for (const [sti, fra, til] of [
      ["src/components/AppSidebar.tsx", "taelUlaesteBadge(ulaeste ?? [], user.id, ULAEST_TYPER)", "(ulaeste ?? []).length"],
      ["src/components/AppLayout.tsx", "taelUlaesteBadge(ulaeste ?? [], user.id, MOBIL_ULAEST_TYPER)", "(ulaeste ?? []).length"],
    ] as const) {
      const k = laes(sti);
      const mut = k.replace(fra, til);
      expect(mut, sti).not.toBe(k);
      expect(badgenBrugerDommen(mut), sti).toBe(false);
    }
    // 6. dommen udvidet med en ekstra skjult kontekst, eller uden system-vagten
    const lib = laes("src/lib/chatStroem.ts");
    const udvidet = lib.replace(/(opgave_forslag: "[^\n]*\n)/, '$1  milestone: "ingensteds",\n');
    expect(udvidet).not.toBe(lib);
    expect(dommenErSnaever(udvidet)).toBe(false);
    const udenVagt = lib.replace('if (besked.message_type !== "system") return true;', "");
    expect(udenVagt).not.toBe(lib);
    expect(dommenErSnaever(udenVagt)).toBe(false);
  });
});

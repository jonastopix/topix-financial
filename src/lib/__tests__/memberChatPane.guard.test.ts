import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for C1-splittet (docs/chat-design.md, chat-split-recon §6):
// fem ting i MemberChatPane fejler STILLE hvis de forsvinder — ingen
// exception, ingen synlig fejl, bare adfærd der skrider et andet sted.
// Mønstret er forslagEngine.test.ts' kildeværn (CI har ingen DB/DOM).
const source = readFileSync(
  resolve(process.cwd(), "src/components/MemberChatPane.tsx"),
  "utf8",
);

describe("MemberChatPane — kildeværn for de stille regressioner", () => {
  it("kalder mark_messages_read BEGGE steder (åbning + realtime-INSERT) — ellers skrider rådgiverens ulæst-tællere og Læst-kvitteringen uden fejl", () => {
    const forekomster = source.match(/mark_messages_read/g) ?? [];
    expect(forekomster.length).toBeGreaterThanOrEqual(2);
  });

  it("kalder notifyChatMessage ved send — ellers forsvinder Slack-notifikationen om medlems-beskeder stille", () => {
    // Både importen og selve kaldet skal findes.
    expect(source).toContain('import { notifyChatMessage } from "@/lib/chatNotify"');
    expect(source).toMatch(/notifyChatMessage\(/);
  });

  it("håndterer deep-links (?conversationId og ?messageId) — ellers lander notifikations- og mail-links bare i chatten uden at åbne beskeden", () => {
    expect(source).toContain('searchParams.get("conversationId")');
    expect(source).toContain('searchParams.get("messageId")');
  });

  it("henter useCompanyFacts — ellers mister medlemmets report_card sine nøgletals-fliser uden fejl", () => {
    expect(source).toContain('import { useCompanyFacts } from "@/hooks/useCompanyFacts"');
    expect(source).toMatch(/useCompanyFacts\(/);
  });

  it("bærer expired-spærren begge steder (composer-muren + handleSend-værnet)", () => {
    const forekomster = source.match(/membershipTier === "expired"/g) ?? [];
    expect(forekomster.length).toBeGreaterThanOrEqual(2);
  });

  it("autoselecter medlemmets egen samtale — ellers lander medlemmet i en tom flade uden samtale valgt", () => {
    // Grenen i loadConversations der vælger første samtale for
    // medlemmet. Uden den renderes "Vælg en samtale"-tomheden aldrig
    // væk af sig selv — medlemmet har ingen sidebar at vælge fra.
    expect(source).toContain("// Auto-select for members");
    expect(source).toMatch(/setActiveConvId\(enriched\[0\]\.id\)/);
  });

  it("filtrerer session_prep fra — ellers ser rådgiveren i 'Se som medlem' forberedelses-kortene", () => {
    // Netop den sti hvor RLS IKKE dækker: ChatShell mounter denne
    // komponent for rådgivere i "Se som medlem", og dér er JWT'en
    // stadig rådgiverens — has_role-SELECT'en leverer session_prep-
    // rækkerne, og kun dette filter holder dem ude af medlemsudtrykket.
    expect(source).toContain('if (msg.context_type === "session_prep") return null;');
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Værn (3/9): send-notification-email må aldrig igen lægge title/body råt
// ind i HTML. Kilden læses som tekst, fordi filen er Deno og ikke kan
// importeres af vitest.
const source = readFileSync(
  resolve(__dirname, "../../../supabase/functions/send-notification-email/index.ts"),
  "utf8",
);

describe("send-notification-email escaper brugerskrevet tekst", () => {
  it("buildEmailHtml lægger title og body ind escapet", () => {
    expect(source).toContain("${escHtml(title)}</h1>");
    expect(source).toContain("${escHtmlMedLinjeskift(body)}</p>");
    expect(source).not.toMatch(/>\$\{title\}</);
    expect(source).not.toMatch(/>\$\{body\}</);
  });

  it("DB-skabelonens {{body}} og {{title}} erstattes escapet med funktions-replacer", () => {
    expect(source).toContain('.replace(/\\{\\{body\\}\\}/g, () => escHtmlMedLinjeskift(notif.body || ""))');
    expect(source).toContain(".replace(/\\{\\{title\\}\\}/g, () => escHtml(notif.title))");
    expect(source).not.toContain('.replace(/\\{\\{body\\}\\}/g, notif.body');
    expect(source).not.toContain(".replace(/\\{\\{title\\}\\}/g, notif.title)");
  });

  it("community_opslag bygges af tråden via opslagsMail og disposes uden tråd", () => {
    expect(source).toContain('const COMMUNITY_OPSLAG_TYPE = "community_opslag"');
    expect(source).toContain("const mail = opslagsMail(opslag)");
    expect(source).toContain("tråd mangler/inaktiv, ingen mail");
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beskrivNoegle, bygFejlkontekst, fejlbesked } from "@/lib/fejllogning";

// Den rene del af den globale fejllogning (7/9): konteksten der går til
// konsollen og Sentry. Selve kaldene (console.error, Sentry) er
// opsætning og testes ikke — men App.tsx' kobling låses med et
// kildeværn nedenfor, så caches ikke kan fjernes stille igen.

describe("fejlbesked — Supabase-fejl er objekter, ikke altid Error", () => {
  it("Error → message; { message } → message; alt andet → String()", () => {
    expect(fejlbesked(new Error("boom"))).toBe("boom");
    expect(fejlbesked({ message: "column sent_at does not exist", code: "42703" })).toBe("column sent_at does not exist");
    expect(fejlbesked("streng")).toBe("streng");
    expect(fejlbesked(undefined)).toBe("undefined");
  });
});

describe("beskrivNoegle — nøglen som kort, læsbar streng", () => {
  it("JSON af nøglen; null/undefined → «(uden nøgle)»", () => {
    expect(beskrivNoegle(["admin-email-log", "all", "all", 0])).toBe('["admin-email-log","all","all",0]');
    expect(beskrivNoegle(undefined)).toBe("(uden nøgle)");
    expect(beskrivNoegle(null)).toBe("(uden nøgle)");
  });

  it("klippes til 200 tegn (Sentrys tag-grænse)", () => {
    const lang = beskrivNoegle(["x".repeat(500)]);
    expect(lang.length).toBe(200);
    expect(lang.endsWith("…")).toBe(true);
  });
});

describe("bygFejlkontekst — det sendt-loggens fejl ville have båret", () => {
  it("query: præfiks, tag og extra med nøglen og beskeden", () => {
    const k = bygFejlkontekst("query", ["admin-email-log", "all", "all", 0], { message: "column email_send_log.sent_at does not exist" });
    expect(k).toEqual({
      praefiks: "[QueryCache]",
      noegle: '["admin-email-log","all","all",0]',
      tags: { kilde: "query", noegle: '["admin-email-log","all","all",0]' },
      extra: { noegle: ["admin-email-log", "all", "all", 0], besked: "column email_send_log.sent_at does not exist" },
    });
  });

  it("mutation uden mutationKey: præfiks og «(uden nøgle)»", () => {
    const k = bygFejlkontekst("mutation", undefined, new Error("insert fejlede"));
    expect(k.praefiks).toBe("[MutationCache]");
    expect(k.tags).toEqual({ kilde: "mutation", noegle: "(uden nøgle)" });
    expect(k.extra).toEqual({ noegle: null, besked: "insert fejlede" });
  });
});

describe("kildeværn: App.tsx kobler begge caches på fejllogningen", () => {
  const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

  it("QueryClient har QueryCache og MutationCache med onError → logQueryFejl / logMutationFejl", () => {
    expect(app).toContain('from "@/lib/fejllogning"');
    expect(app).toContain("queryCache: new QueryCache({");
    expect(app).toContain("mutationCache: new MutationCache({");
    expect(app).toContain("logQueryFejl(error, query.queryKey)");
    expect(app).toContain("logMutationFejl(error, mutation.options.mutationKey)");
    expect(app, "den tomme QueryClient må ikke komme tilbage").not.toContain("new QueryClient();");
  });

  it("adfærden er urørt: ingen throwOnError, ingen retry-politik i klienten", () => {
    const klient = app.slice(app.indexOf("const queryClient = new QueryClient("), app.indexOf("});", app.indexOf("const queryClient = new QueryClient(")) + 3);
    expect(klient).not.toContain("throwOnError");
    expect(klient).not.toContain("retry");
    expect(klient).not.toContain("defaultOptions");
  });
});

import { describe, expect, it } from "vitest";
import {
  SKJULTE_SYSTEM_KONTEKSTER,
  chatStroem,
  taelUlaesteBadge,
  taelUlaesteIListen,
  uddragsBesked,
  visesIChatstroem,
} from "@/lib/chatStroem";

const b = (message_type: string | undefined, context_type: string | null = null, ekstra: object = {}) => ({
  message_type,
  context_type,
  sender_id: "andre",
  read_at: null as string | null,
  ...ekstra,
});

describe("visesIChatstroem — én dom pr. beskedtype", () => {
  it("user vises (også med kontekst, fx rapportkommentar og feedback)", () => {
    expect(visesIChatstroem(b("user"))).toBe(true);
    expect(visesIChatstroem(b("user", "report"))).toBe(true);
    expect(visesIChatstroem(b("user", "feedback"))).toBe(true);
    expect(visesIChatstroem(b("user", "opgave_forslag"))).toBe(true); // kun SYSTEM-forslag skjules
  });

  it("manglende message_type er DB-default 'user' og vises", () => {
    expect(visesIChatstroem({})).toBe(true);
    expect(visesIChatstroem({ message_type: null, context_type: "opgave_forslag" })).toBe(true);
  });

  it("system · opgave_forslag SKJULES — begivenheden står på forsiden (Dine skridt) og i Planen", () => {
    expect(visesIChatstroem(b("system", "opgave_forslag"))).toBe(false);
  });

  it("system · milestone BLIVER — når hverken klokken eller forsiden", () => {
    expect(visesIChatstroem(b("system", "milestone"))).toBe(true);
  });

  it("system · agent BLIVER — klokken kun når agenten selv kalder notify_advisor; feedbackknapperne bor i chatten", () => {
    expect(visesIChatstroem(b("system", "agent"))).toBe(true);
  });

  it("system uden kontekst og system med ukendt kontekst BLIVER — ukendt er synligt", () => {
    expect(visesIChatstroem(b("system", null))).toBe(true);
    expect(visesIChatstroem(b("system", "noget_nyt"))).toBe(true);
    expect(visesIChatstroem(b("system", "report"))).toBe(true);
    expect(visesIChatstroem(b("system", "toString"))).toBe(true); // ikke en nøgle på prototypen
  });

  it("ai BLIVER — ingen skriver typen, og intet skelner «medlemmet bad selv»", () => {
    expect(visesIChatstroem(b("ai"))).toBe(true);
    expect(visesIChatstroem(b("ai", "opgave_forslag"))).toBe(true);
  });

  it("welcome, reflection-nudge og legat-momentum-reminder BLIVER", () => {
    expect(visesIChatstroem(b("welcome"))).toBe(true);
    expect(visesIChatstroem(b("reflection-nudge"))).toBe(true);
    expect(visesIChatstroem(b("legat-momentum-reminder"))).toBe(true);
  });

  it("den eneste skjulte kontekst er opgave_forslag, og hver har et sted", () => {
    expect(Object.keys(SKJULTE_SYSTEM_KONTEKSTER)).toEqual(["opgave_forslag"]);
    for (const sted of Object.values(SKJULTE_SYSTEM_KONTEKSTER)) expect(sted.length).toBeGreaterThan(10);
  });
});

describe("chatStroem — filtrerer og bevarer rækkefølgen", () => {
  it("fjerner kun det skjulte", () => {
    const l = [b("user", null, { id: 1 }), b("system", "opgave_forslag", { id: 2 }), b("system", "agent", { id: 3 }), b("ai", null, { id: 4 })];
    expect(chatStroem(l).map((m: any) => m.id)).toEqual([1, 3, 4]);
  });
  it("tom liste giver tom liste", () => {
    expect(chatStroem([])).toEqual([]);
  });
});

describe("uddragsBesked — samtalelistens uddrag", () => {
  it("springer en skjult nyeste besked over", () => {
    const nyesteFoerst = [b("system", "opgave_forslag", { id: "forslag" }), b("user", null, { id: "menneske" })];
    expect((uddragsBesked(nyesteFoerst) as any).id).toBe("menneske");
  });
  it("viser en synlig systembesked, når den er nyest", () => {
    const nyesteFoerst = [b("system", "milestone", { id: "ms" }), b("user", null, { id: "menneske" })];
    expect((uddragsBesked(nyesteFoerst) as any).id).toBe("ms");
  });
  it("undefined når intet er synligt", () => {
    expect(uddragsBesked([b("system", "opgave_forslag")])).toBeUndefined();
    expect(uddragsBesked([])).toBeUndefined();
  });
});

describe("taelUlaesteIListen — samtalelistens ulæst", () => {
  const mig = "mig";
  it("tæller kun user fra andre uden read_at", () => {
    const l = [
      b("user"), // tæller
      b("user", null, { read_at: "2026-09-29" }), // læst
      b("user", null, { sender_id: mig }), // egen
      b("system", "agent"), // system tæller ikke i listen (uændret dom)
      b("ai"), // ai heller ikke
      b("welcome"), // heller ikke
    ];
    expect(taelUlaesteIListen(l, mig)).toBe(1);
  });
  it("tæller aldrig en skjult besked, selv om typen skulle blive 'user'-lignende", () => {
    expect(taelUlaesteIListen([b("system", "opgave_forslag")], mig)).toBe(0);
  });
});

describe("taelUlaesteBadge — sidebarens og mobilens badge", () => {
  const mig = "mig";
  const l = [
    b("user"),
    b("system", "agent"),
    b("system", "milestone"),
    b("system", "opgave_forslag"), // skjult → tæller ikke
    b("ai"),
    b("welcome"), // uden for typerne → tæller ikke (uændret dom)
    b("system", "agent", { sender_id: mig }), // egen
    b("system", "agent", { read_at: "2026-09-29" }), // læst
  ];
  it("sidebar: user + system + ai, minus skjulte", () => {
    expect(taelUlaesteBadge(l, mig, ["user", "system", "ai"])).toBe(4);
  });
  it("mobil: user + system, minus skjulte", () => {
    expect(taelUlaesteBadge(l, mig, ["user", "system"])).toBe(3);
  });
  it("uden filteret havde sidebaren talt 5 (forslaget)", () => {
    const uden = l.filter((m) => m.sender_id !== mig && !m.read_at && ["user", "system", "ai"].includes(m.message_type as string)).length;
    expect(uden).toBe(5);
  });
});

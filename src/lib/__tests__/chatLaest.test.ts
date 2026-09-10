/**
 * Chat-mails og messages.read_at (10/9): en chatbesked læst i chatten mailes
 * ikke. Den rene dom bor i notificationEmailSelection (delChatKandidater);
 * send-notification-email slår read_at op og disposer de læste.
 */
import { describe, expect, it } from "vitest";
import {
  CHAT_LAEST_TYPES,
  delChatKandidater,
  erChatBeskedRef,
  type ChatKandidat,
} from "../../../supabase/functions/_shared/notificationEmailSelection.ts";

const k = (id: string, ref: string | null, type = "chat_reply", reference_type?: string | null): ChatKandidat => ({
  id,
  type,
  reference_id: ref,
  ...(reference_type !== undefined ? { reference_type } : {}),
});

describe("erChatBeskedRef", () => {
  it("chat_reply med reference_id peger på en besked; uden reference_id kan intet dømmes", () => {
    expect(CHAT_LAEST_TYPES.has("chat_reply")).toBe(true);
    expect(erChatBeskedRef(k("n1", "m1"))).toBe(true);
    expect(erChatBeskedRef(k("n2", null))).toBe(false);
  });
  it("en anden chat-type tæller kun med eksplicit reference_type «message»", () => {
    expect(erChatBeskedRef(k("n3", "m3", "advisor_replied"))).toBe(false);
    expect(erChatBeskedRef(k("n4", "m4", "advisor_replied", "message"))).toBe(true);
  });
});

describe("delChatKandidater", () => {
  it("læst besked → disposed; ulæst → send; rækkefølgen bevares", () => {
    const notifs = [k("n1", "m1"), k("n2", "m2"), k("n3", "m3")];
    const r = delChatKandidater(notifs, new Set(["m2"]));
    expect(r.send.map((n) => n.id)).toEqual(["n1", "n3"]);
    expect(r.disposed.map((n) => n.id)).toEqual(["n2"]);
  });
  it("alle læst → intet at sende (kalderen fjerner brugeren fra aggregeringen)", () => {
    const r = delChatKandidater([k("n1", "m1"), k("n2", "m2")], new Set(["m1", "m2"]));
    expect(r.send).toEqual([]);
    expect(r.disposed.length).toBe(2);
  });
  it("tomt opslag (fejl eller ingen læste) → alt sendes som før", () => {
    const notifs = [k("n1", "m1"), k("n2", null)];
    const r = delChatKandidater(notifs, new Set());
    expect(r.send.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(r.disposed).toEqual([]);
  });
  it("en kandidat uden besked-reference disposes aldrig — selv om id'et tilfældigt matcher", () => {
    const r = delChatKandidater([k("n1", null), k("n2", "x", "advisor_replied")], new Set(["x"]));
    expect(r.send.map((n) => n.id)).toEqual(["n1", "n2"]);
  });
});

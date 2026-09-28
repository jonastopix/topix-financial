import { describe, expect, it } from "vitest";
import {
  erVisningsId,
  loftetNaaet,
  SPOR_KOLONNER,
  SPOR_PR_IP_PR_TIME,
  SPOR_PR_TIME_I_ALT,
  sporRaekkeAf,
  VISNINGS_TRIN,
} from "../../../supabase/functions/_shared/ansoegningVisning";

/** Servermodulet bag ansoegning-gem «spor» (udkast 28/9-2026). */
const ID = "3f1c2b8e-9a4d-4c1e-8b2a-0d9e7f6a5b41";
const IP = "a".repeat(64);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/129.0";

describe("sporRaekkeAf — det gyldige spor", () => {
  it("bygger præcis de tilladte kolonner, med kilde, annoncespor, user agent og IP-hash", () => {
    const d = sporRaekkeAf(
      { handling: "spor", visning_id: ID, trin: "vist", kilde: "webinar", kilde_raa: "webinar", annoncespor: { utm_source: "ewebinar", fbclid: "IwAR_abc" } },
      UA,
      IP,
    );
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(Object.keys(d.raekke).sort()).toEqual([...SPOR_KOLONNER].sort());
    expect(d.raekke).toMatchObject({ visning_id: ID, trin: "vist", kilde: "webinar", kilde_raa: "webinar", utm_source: "ewebinar", fbclid: "IwAR_abc", user_agent: UA, ip_hash: IP });
  });

  it("alle tre trin godtages", () => {
    for (const trin of VISNINGS_TRIN) expect(sporRaekkeAf({ visning_id: ID, trin }, null, IP).ok).toBe(true);
  });

  it("en ukendt kilde bliver «andet», og kilde_raa afkortes til 120 tegn", () => {
    const d = sporRaekkeAf({ visning_id: ID, trin: "start", kilde: "tiktok", kilde_raa: "x".repeat(500) }, null, IP);
    expect(d.ok && d.raekke.kilde).toBe("andet");
    expect(d.ok && d.raekke.kilde_raa?.length).toBe(120);
  });

  it("uden kilde_raa og annoncespor står felterne som null — aldrig udeladt", () => {
    const d = sporRaekkeAf({ visning_id: ID, trin: "tastet", kilde: "direkte" }, null, IP);
    expect(d.ok && d.raekke.kilde_raa).toBeNull();
    expect(d.ok && d.raekke.utm_source).toBeNull();
    expect(d.ok && d.raekke.user_agent).toBeNull();
  });
});

describe("sporRaekkeAf — ingen persondata, uanset hvad body'en bærer", () => {
  it("e-mail, navn, telefon, CVR, svar, token og IP i body'en når aldrig rækken", () => {
    const d = sporRaekkeAf(
      { visning_id: ID, trin: "vist", kilde: "webinar", email: "a@b.dk", navn: "Anna", telefon: "12345678", cvr: "12345678", svar: { cvr: "1" }, token: ID, ip: "1.2.3.4", user_agent: "fra body", ip_hash: "fra body" },
      UA,
      IP,
    );
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    const tekst = JSON.stringify(d.raekke);
    for (const forbudt of ["a@b.dk", "Anna", "12345678", "1.2.3.4", "fra body"]) expect(tekst).not.toContain(forbudt);
    expect(d.raekke.user_agent).toBe(UA);
    expect(d.raekke.ip_hash).toBe(IP);
  });
});

describe("sporRaekkeAf — afvisninger", () => {
  it("et visnings-id, der ikke er et uuid, afvises", () => {
    for (const v of [undefined, "", "abc", 42, `${ID}x`]) expect(sporRaekkeAf({ visning_id: v, trin: "vist" }, null, IP)).toEqual({ ok: false, fejl: "visning_id" });
  });
  it("et ukendt trin afvises", () => {
    for (const t of [undefined, "", "opret", "VIST"]) expect(sporRaekkeAf({ visning_id: ID, trin: t }, null, IP)).toEqual({ ok: false, fejl: "trin" });
  });
  it("ingen body afvises", () => {
    expect(sporRaekkeAf(null, null, IP).ok).toBe(false);
  });
  it("erVisningsId: kun uuid", () => {
    expect(erVisningsId(ID)).toBe(true);
    expect(erVisningsId(ID.toUpperCase())).toBe(true);
    expect(erVisningsId("ikke-et-id")).toBe(false);
    expect(erVisningsId(null)).toBe(false);
  });
});

describe("loftetNaaet — rate-grænsen, fail-closed", () => {
  it("under begge lofter: ikke nået", () => {
    expect(loftetNaaet(0, 0)).toBe(false);
    expect(loftetNaaet(SPOR_PR_IP_PR_TIME - 1, SPOR_PR_TIME_I_ALT - 1)).toBe(false);
  });
  it("et af lofterne nået: nået", () => {
    expect(loftetNaaet(SPOR_PR_IP_PR_TIME, 0)).toBe(true);
    expect(loftetNaaet(0, SPOR_PR_TIME_I_ALT)).toBe(true);
  });
  it("en tælling, der fejlede (null), er altid nået — vi gemmer ikke, når vi ikke kan tælle", () => {
    expect(loftetNaaet(null, 0)).toBe(true);
    expect(loftetNaaet(0, null)).toBe(true);
  });
});

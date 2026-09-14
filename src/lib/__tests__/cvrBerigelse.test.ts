import { describe, expect, it } from "vitest";
import {
  CVR_MANGEL_HANDLING,
  CVR_MANGEL_MAERKE,
  cvrOpslagMangler,
  erGyldigtCvr,
  felterTekst,
  importKvittering,
  type CvrStamdata,
} from "@/lib/cvrBerigelse";

// Synligheden af en fejlet CVR-berigelse (14/9-2026): dommen og kvitteringen
// som rene funktioner. Baggrunden (Nordic By Hand, QUOTA_EXCEEDED, grøn
// kvittering) står i lib/cvrBerigelse.ts' filhoved.

const stamdata = (over: Partial<CvrStamdata> = {}): CvrStamdata => ({
  cvr_number: "46415124",
  cvr_fetched_at: null,
  address: null,
  industry_code: null,
  ...over,
});

describe("erGyldigtCvr — otte cifre, som hentCvrData", () => {
  it("otte cifre er gyldigt, også med mellemrum", () => {
    expect(erGyldigtCvr("46415124")).toBe(true);
    expect(erGyldigtCvr("4641 5124")).toBe(true);
  });
  it("tomt, null, for kort, bogstaver er ugyldigt", () => {
    expect(erGyldigtCvr("")).toBe(false);
    expect(erGyldigtCvr(null)).toBe(false);
    expect(erGyldigtCvr(undefined)).toBe(false);
    expect(erGyldigtCvr("4641512")).toBe(false);
    expect(erGyldigtCvr("DK46415124")).toBe(false);
  });
});

describe("cvrOpslagMangler — dommen", () => {
  it("gyldigt CVR, cvr_fetched_at tom, begge felter tomme → mangler adresse og branchekode (Nordic By Hand 14/9)", () => {
    expect(cvrOpslagMangler(stamdata())).toEqual({ mangler: true, felter: ["adresse", "branchekode"] });
  });

  it("kun det tomme felt nævnes", () => {
    expect(cvrOpslagMangler(stamdata({ address: "Vestergade 1" }))).toEqual({ mangler: true, felter: ["branchekode"] });
    expect(cvrOpslagMangler(stamdata({ industry_code: "retail_fashion" }))).toEqual({ mangler: true, felter: ["adresse"] });
  });

  it("er felterne fyldt (berigelsen eller i hånden), mangler intet — selvom cvr_fetched_at stadig er tom", () => {
    expect(cvrOpslagMangler(stamdata({ address: "Vestergade 1", industry_code: "retail_fashion" }))).toEqual({ mangler: false, felter: [] });
  });

  it("lykkedes opslaget ved oprettelsen (cvr_fetched_at sat), mangler intet — også med tomme felter (registret havde dem ikke)", () => {
    expect(cvrOpslagMangler(stamdata({ cvr_fetched_at: "2026-09-14T08:10:15Z" }))).toEqual({ mangler: false, felter: [] });
  });

  it("uden gyldigt CVR er der intet at slå op — ikke en fejlet berigelse", () => {
    expect(cvrOpslagMangler(stamdata({ cvr_number: null })).mangler).toBe(false);
    expect(cvrOpslagMangler(stamdata({ cvr_number: "" })).mangler).toBe(false);
    expect(cvrOpslagMangler(stamdata({ cvr_number: "1234567" })).mangler).toBe(false);
  });

  it("blanke strenge er tomme", () => {
    expect(cvrOpslagMangler(stamdata({ address: "   ", industry_code: "" })).felter).toEqual(["adresse", "branchekode"]);
  });

  it("felterTekst: «adresse og branchekode» / enkeltvis", () => {
    expect(felterTekst(["adresse", "branchekode"])).toBe("adresse og branchekode");
    expect(felterTekst(["branchekode"])).toBe("branchekode");
  });
});

describe("importKvittering — kvitteringen efter import", () => {
  const form = { email: "gry@nordicbyhand.dk", cvr_number: "46415124" };

  it("svar UDEN cvr_data (opslaget fejlede) → advarsel der siger hvad der mangler og hvad rådgiveren skal gøre", () => {
    const k = importKvittering({ reused_company: false, company_name: "Nordic By Hand", cvr_data: null }, form);
    expect(k.tone).toBe("warning");
    expect(k.titel).toBe("Importeret — men CVR-opslaget lykkedes ikke");
    expect(k.beskrivelse).toContain("Nordic By Hand er oprettet, og invitationen er sendt til gry@nordicbyhand.dk.");
    expect(k.beskrivelse).toContain("Adresse og branchekode mangler");
    expect(k.beskrivelse).toContain("dagskvoten kan være brugt");
    expect(k.beskrivelse).toContain(CVR_MANGEL_HANDLING);
    expect(k.beskrivelse).toContain(`«${CVR_MANGEL_MAERKE}»`);
  });

  it("svar MED cvr_data → ingen mangel-besked; virksomheden oprettet og invitationen sendt", () => {
    const k = importKvittering({ reused_company: false, company_name: "Nordic By Hand", cvr_data: { name: "Nordic By Hand ApS" } }, form);
    expect(k.tone).toBe("success");
    expect(k.titel).toBe("Ansøgning importeret ✓");
    expect(k.beskrivelse).toContain("Nordic By Hand er oprettet, og invitationen er sendt til gry@nordicbyhand.dk.");
    expect(k.beskrivelse).toContain("hentet fra CVR");
    expect(k.beskrivelse).not.toContain("mangler");
    expect(k.beskrivelse).not.toContain(CVR_MANGEL_MAERKE);
  });

  it("begge tilfælde siger at virksomheden er oprettet og invitationen sendt", () => {
    for (const cvr_data of [null, undefined, { name: "x" }]) {
      const k = importKvittering({ reused_company: false, company_name: "Nordic By Hand", cvr_data }, form);
      expect(k.beskrivelse).toContain("er oprettet, og invitationen er sendt til gry@nordicbyhand.dk");
    }
  });

  it("uden gyldigt CVR i formularen er manglende cvr_data forventet — succes med en oplysning, ikke en advarsel", () => {
    const k = importKvittering({ reused_company: false, company_name: "Nordic By Hand", cvr_data: null }, { email: form.email, cvr_number: "" });
    expect(k.tone).toBe("success");
    expect(k.beskrivelse).toContain("Uden CVR-nummer er adresse og branche ikke hentet.");
    expect(k.beskrivelse).not.toContain(CVR_MANGEL_MAERKE);
  });

  it("genbrugt virksomhed: teksten som før — intet opslag blev forsøgt", () => {
    const k = importKvittering({ reused_company: true, company_name: "Nordic By Hand", cvr_data: null }, form);
    expect(k).toEqual({
      tone: "success",
      titel: "Virksomheden findes allerede — ny invitation sendt",
      beskrivelse: "Invitation sendt til gry@nordicbyhand.dk for Nordic By Hand",
    });
  });

  it("manglende navn bliver «Virksomheden», aldrig «undefined»", () => {
    const k = importKvittering({ reused_company: false, cvr_data: null }, form);
    expect(k.beskrivelse.startsWith("Virksomheden er oprettet")).toBe(true);
    expect(k.beskrivelse).not.toContain("undefined");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CVR_MANGEL_HANDLING,
  CVR_MANGEL_MAERKE,
  cvrOpslagMangler,
  erGyldigtCvr,
  felterTekst,
  importKvittering,
  type CvrStamdata,
  type CvrUdfald,
} from "@/lib/cvrBerigelse";

// Synligheden af en fejlet CVR-berigelse (14/9-2026): dommen og kvitteringen
// som rene funktioner. Baggrunden (Nordic By Hand, QUOTA_EXCEEDED fra den
// daværende kilde, grøn kvittering) står i lib/cvrBerigelse.ts' filhoved.
// 16/9: kilden er DataCVR, og kvitteringen læser opslagets udfald
// (cvr_udfald) — tre grene i stedet for ét ord for alt (fund 13).

const stamdata = (over: Partial<CvrStamdata> = {}): CvrStamdata => ({
  cvr_number: "46415124",
  cvr_fetched_at: null,
  address: null,
  industry_code: null,
  ...over,
});

describe("erGyldigtCvr — otte cifre, som slaaCvrOp", () => {
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

  it("handlingen nævner berigelsen OG at nummeret skal tjekkes hvis det ikke findes (16/9)", () => {
    expect(CVR_MANGEL_HANDLING).toBe(
      "Kør berigelsen (berig-virksomheder) — den udfylder de tomme felter fra CVR. Findes CVR-nummeret ikke i registret, så tjek nummeret.",
    );
  });
});

describe("importKvittering — kvitteringen efter import", () => {
  const form = { email: "gry@nordicbyhand.dk", cvr_number: "46415124" };
  const OPRETTET = "Nordic By Hand er oprettet, og invitationen er sendt til gry@nordicbyhand.dk.";
  const HALE = `Virksomheden er mærket «${CVR_MANGEL_MAERKE}» på listen og på sin side, indtil felterne er fyldt.`;

  it("udfald findes_ikke → advarsel: tjek nummeret; adresse og branchekode er ikke hentet (fund 13)", () => {
    const k = importKvittering({ reused_company: false, company_name: "Nordic By Hand", cvr_data: null, cvr_udfald: "findes_ikke" }, form);
    expect(k.tone).toBe("warning");
    expect(k.titel).toBe("Importeret — men CVR-opslaget lykkedes ikke");
    expect(k.beskrivelse).toBe(
      `${OPRETTET} CVR-nummeret findes ikke i registret — tjek nummeret. Adresse og branchekode er ikke hentet. ${HALE}`,
    );
  });

  it("udfald graense → advarsel: grænsen er nået, kør berigelsen i morgen", () => {
    const k = importKvittering({ reused_company: false, company_name: "Nordic By Hand", cvr_data: null, cvr_udfald: "graense" }, form);
    expect(k.tone).toBe("warning");
    expect(k.titel).toBe("Importeret — men CVR-opslaget lykkedes ikke");
    expect(k.beskrivelse).toBe(
      `${OPRETTET} Grænsen for CVR-opslag i dag er nået — kør berigelsen (berig-virksomheder) i morgen, så udfyldes adresse og branchekode. ${HALE}`,
    );
  });

  it("udfald fejl og noegle_mangler → advarsel: opslaget fejlede, kør berigelsen senere", () => {
    for (const cvr_udfald of ["fejl", "noegle_mangler"] as CvrUdfald[]) {
      const k = importKvittering({ reused_company: false, company_name: "Nordic By Hand", cvr_data: null, cvr_udfald }, form);
      expect(k.tone, cvr_udfald).toBe("warning");
      expect(k.titel, cvr_udfald).toBe("Importeret — men CVR-opslaget lykkedes ikke");
      expect(k.beskrivelse, cvr_udfald).toBe(
        `${OPRETTET} CVR-opslaget fejlede — kør berigelsen (berig-virksomheder) senere, så udfyldes adresse og branchekode. ${HALE}`,
      );
    }
  });

  it("uden cvr_udfald (gammel server, kun cvr_data null) → samme ord som fejl", () => {
    for (const svar of [
      { reused_company: false, company_name: "Nordic By Hand", cvr_data: null },
      { reused_company: false, company_name: "Nordic By Hand", cvr_data: null, cvr_udfald: null },
      { reused_company: false, company_name: "Nordic By Hand", cvr_data: undefined },
    ]) {
      const k = importKvittering(svar, form);
      expect(k.tone).toBe("warning");
      expect(k.titel).toBe("Importeret — men CVR-opslaget lykkedes ikke");
      expect(k.beskrivelse).toContain("CVR-opslaget fejlede — kør berigelsen (berig-virksomheder) senere");
      expect(k.beskrivelse).toContain(`«${CVR_MANGEL_MAERKE}»`);
    }
  });

  it("svar MED cvr_data → ingen mangel-besked; virksomheden oprettet og invitationen sendt", () => {
    const k = importKvittering({ reused_company: false, company_name: "Nordic By Hand", cvr_data: { name: "Nordic By Hand ApS" }, cvr_udfald: "fundet" }, form);
    expect(k.tone).toBe("success");
    expect(k.titel).toBe("Ansøgning importeret ✓");
    expect(k.beskrivelse).toContain(OPRETTET);
    expect(k.beskrivelse).toContain("hentet fra CVR");
    expect(k.beskrivelse).not.toContain("mangler");
    expect(k.beskrivelse).not.toContain(CVR_MANGEL_MAERKE);
  });

  it("alle tilfælde siger at virksomheden er oprettet og invitationen sendt", () => {
    for (const cvr_data of [null, undefined, { name: "x" }]) {
      for (const cvr_udfald of ["fundet", "findes_ikke", "graense", "fejl", "noegle_mangler", null, undefined] as (CvrUdfald | null | undefined)[]) {
        const k = importKvittering({ reused_company: false, company_name: "Nordic By Hand", cvr_data, cvr_udfald }, form);
        expect(k.beskrivelse).toContain("er oprettet, og invitationen er sendt til gry@nordicbyhand.dk");
      }
    }
  });

  it("uden gyldigt CVR i formularen er manglende cvr_data forventet — succes med en oplysning, ikke en advarsel", () => {
    const k = importKvittering({ reused_company: false, company_name: "Nordic By Hand", cvr_data: null, cvr_udfald: null }, { email: form.email, cvr_number: "" });
    expect(k.tone).toBe("success");
    expect(k.beskrivelse).toContain("Uden CVR-nummer er adresse og branche ikke hentet.");
    expect(k.beskrivelse).not.toContain(CVR_MANGEL_MAERKE);
  });

  it("genbrugt virksomhed: teksten som før — intet opslag blev forsøgt", () => {
    const k = importKvittering({ reused_company: true, company_name: "Nordic By Hand", cvr_data: null, cvr_udfald: null }, form);
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

  it("«dagskvoten» står ingen steder længere — hverken i teksterne eller i kilden (kvoten var cvrapi's; DataCVR har en grænse pr. nøgle)", () => {
    const tekster = [
      CVR_MANGEL_HANDLING,
      ...(["fundet", "findes_ikke", "graense", "fejl", "noegle_mangler", null] as (CvrUdfald | null)[]).map(
        (cvr_udfald) => importKvittering({ reused_company: false, company_name: "X", cvr_data: null, cvr_udfald }, form).beskrivelse,
      ),
      importKvittering({ reused_company: true, company_name: "X", cvr_data: null }, form).beskrivelse,
      importKvittering({ reused_company: false, company_name: "X", cvr_data: null }, { email: form.email, cvr_number: "" }).beskrivelse,
    ];
    for (const t of tekster) expect(t).not.toContain("dagskvoten");
    const kilde = readFileSync(resolve(process.cwd(), "src/lib/cvrBerigelse.ts"), "utf8");
    expect(kilde).not.toContain("dagskvoten");
  });
});

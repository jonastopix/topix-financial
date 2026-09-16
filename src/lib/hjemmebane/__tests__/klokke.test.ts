import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CHAT_STI,
  chatSti,
  driftTekst,
  driftTitel,
  erDrift,
  erUlaest,
  erUset,
  klokkeTekst,
  KLOKKE_LOFT,
  medlemsLinje,
  nyesteFoerst,
  pilleTekst,
  raadgiverLinje,
  raadgiverSti,
  taelUlaeste,
  taelUsete,
  type MedlemsNotifikation,
  type RaadgiverNotifikation,
} from "@/lib/hjemmebane/klokke";

const m = (over: Partial<MedlemsNotifikation> = {}): MedlemsNotifikation => ({
  id: "n1", title: "Din rapport er klar", body: null, priority: "important", deep_link: "/reports?reportId=r1",
  seen_at: null, read_at: null, created_at: "2026-09-10T10:00:00Z", ...over,
});
const r = (over: Partial<RaadgiverNotifikation> = {}): RaadgiverNotifikation => ({
  id: "a1", type: "report_uploaded", title: "Ny rapport", body: "Floren uploadede juli", company_id: "c1", member_id: "u1",
  reference_id: "r1", reference_type: "report", read_at: null, created_at: "2026-09-10T10:00:00Z", ...over,
});

describe("medlemmets tælling — useNotifications' regel", () => {
  it("uset OG vigtig tæller; info tæller ikke; set tæller ikke", () => {
    expect(erUset(m())).toBe(true);
    expect(erUset(m({ priority: "action_required" }))).toBe(true);
    expect(erUset(m({ priority: "info" }))).toBe(false);
    expect(erUset(m({ seen_at: "2026-09-10T11:00:00Z" }))).toBe(false);
    expect(taelUsete([m(), m({ priority: "info" }), m({ seen_at: "x" }), m({ id: "n4", priority: "action_required" })])).toBe(2);
  });
  it("læst men ikke set tæller stadig i pillen (seen_at er dommen, read_at er linjens)", () => {
    expect(erUset(m({ read_at: "x" }))).toBe(true);
    expect(medlemsLinje(m({ read_at: "x" })).ny).toBe(false);
  });
});

describe("rådgiverens tælling — AdvisorNotifications' regel", () => {
  it("ulæst tæller, læst ikke", () => {
    expect(erUlaest(r())).toBe(true);
    expect(erUlaest(r({ read_at: "x" }))).toBe(false);
    expect(taelUlaeste([r(), r({ id: "a2", read_at: "x" }), r({ id: "a3" })])).toBe(2);
  });
});

describe("pillen", () => {
  it("ingen pille ved 0, tallet ellers, loft 99+", () => {
    expect(pilleTekst(0)).toBeNull();
    expect(pilleTekst(-1)).toBeNull();
    expect(pilleTekst(1)).toBe("1");
    expect(pilleTekst(99)).toBe("99");
    expect(pilleTekst(100)).toBe("99+");
  });
});

describe("linjerne", () => {
  it("medlem: ny til read_at er sat; «Kræver handling» kun for action_required der ikke er læst", () => {
    expect(medlemsLinje(m())).toMatchObject({ ny: true, til: "/reports?reportId=r1", maerke: null });
    expect(medlemsLinje(m({ priority: "action_required" })).maerke).toBe("Kræver handling");
    expect(medlemsLinje(m({ priority: "action_required", read_at: "x" })).maerke).toBeNull();
  });
  it("rådgiver: drift står i samme liste, mærket «Drift», og fører til forsiden", () => {
    const d = r({ type: "drift", title: "Vault-nøglen mangler", company_id: null, reference_type: null, reference_id: null });
    expect(erDrift(d)).toBe(true);
    expect(raadgiverLinje(d)).toMatchObject({ maerke: "Drift", til: "/", ny: true });
  });
  it("rådgiverens veje er Hjemmebanes ruter — virksomhedssiden i ental (/virksomheder er listen)", () => {
    expect(raadgiverSti(r())).toBe("/virksomhed/c1?reportId=r1");
    expect(raadgiverSti(r({ reference_id: null }))).toBe("/virksomhed/c1");
    expect(raadgiverSti(r({ company_id: null }))).toBe("/virksomheder");
    expect(raadgiverSti(r({ reference_type: "handout" }))).toBe("/virksomhed/c1");
    expect(raadgiverSti(r({ reference_type: "ukendt_type", reference_id: null }))).toBe("/virksomhed/c1");
    expect(raadgiverSti(r({ reference_type: "feedback", reference_id: "f9", type: "feedback_submitted" }))).toBe("/admin/feedback?feedbackId=f9");
    expect(raadgiverSti(r({ reference_type: null, company_id: null, type: "agent_insight" }))).toBeNull();
  });

  /* Chat (16/9, Jonas' prioritet 1): samtalen, ikke indbakken. Rækken
     (send-slack-chat-notification) bærer company_id og BESKEDENS id som
     reference_id — aldrig samtalens id. Indbakken holder én samtale pr.
     virksomhed, så virksomheden er nøglen; beskeden følger med når den er der. */
  it("chat: med virksomhed OG besked → samtalen med beskeden", () => {
    const n = r({ reference_type: "chat", type: "new_message", company_id: "c1", reference_id: "m1" });
    expect(raadgiverSti(n)).toBe("/chat?companyId=c1&messageId=m1");
    expect(chatSti(n)).toBe("/chat?companyId=c1&messageId=m1");
  });
  it("chat: med virksomhed uden besked-id → samtalen alene", () => {
    expect(raadgiverSti(r({ reference_type: "chat", type: "new_message", reference_id: null }))).toBe("/chat?companyId=c1");
  });
  it("chat: gammel række uden virksomhed → indbakken (samtalen kan ikke findes) — også med et besked-id", () => {
    expect(raadgiverSti(r({ reference_type: "chat", type: "new_message", company_id: null, reference_id: "m1" }))).toBe(CHAT_STI);
    expect(raadgiverSti(r({ reference_type: "chat", type: "new_message", company_id: null, reference_id: null }))).toBe("/chat");
  });
  it("chat: kun reference_type afgør grenen — en anden type med reference_type chat går samme vej; andre reference_types rører den ikke", () => {
    expect(raadgiverSti(r({ reference_type: "chat", type: "ukendt", reference_id: "m2" }))).toBe("/chat?companyId=c1&messageId=m2");
    expect(raadgiverSti(r({ reference_type: "handout" }))).toBe("/virksomhed/c1");
    expect(raadgiverSti(r({ reference_type: "community_traad", reference_id: "t1" }))).toBe("/community/t1");
  });
  it("et fejlet træk fører til virksomhedssidens «Aftalen», hvor «Betaling» står", () => {
    expect(raadgiverSti(r({ type: "traek_fejlet", reference_type: "traek", reference_id: "t1" }))).toBe("/virksomhed/c1?section=aftale");
    expect(raadgiverSti(r({ type: "traek_fejlet", reference_type: "traek", reference_id: "t1", company_id: null }))).toBe("/virksomheder");
  });
  it("linjens tekst er ren tekst — rækker med Tiptap-HTML i databasen viser aldrig tags (set 14/9)", () => {
    const html = "<p>Hej Jonas, </p><p>Jo, det virkede ok! :-)<br>Når forretningen er så lille som her</p>";
    const forventet = "Hej Jonas, Jo, det virkede ok! :-) Når forretningen er så lille som her";
    expect(raadgiverLinje(r({ type: "new_message", body: html })).tekst).toBe(forventet);
    expect(medlemsLinje(m({ body: html })).tekst).toBe(forventet);
    expect(klokkeTekst("<p></p>")).toBeNull();
    expect(klokkeTekst(null)).toBeNull();
    expect(raadgiverLinje(r({ body: "Dans uden formatering" })).tekst).toBe("Dans uden formatering");
  });
  it("nyeste først, højst ti", () => {
    const liste = Array.from({ length: 14 }, (_, i) => r({ id: `a${i}`, created_at: `2026-09-${String(i + 1).padStart(2, "0")}T10:00:00Z` }));
    const ud = nyesteFoerst(liste);
    expect(ud).toHaveLength(KLOKKE_LOFT);
    expect(ud[0].id).toBe("a13");
    expect(ud[9].id).toBe("a4");
  });
});

/* Driftsbeskeden (14/9): vagt_cron (migration 20260910170000) skriver titlen
   «Driften: …» med svarkoderne som rå JSON, og en body der ender i «Tallene:
   {…30 nøgler…}». Klokken viser dommen i titlen og kun tiden i teksten;
   tallene bliver i rækken og i cron_vagt_log. */
describe("driftsbeskeden — overskriften bærer dommen, JSON-muren udelades", () => {
  const TAL =
    '{"koder": {"200": 40, "500": 3, "intet_svar": 1}, "kald_60m": 44, "ikke_200_60m": 4, "jobs_ikke_200": 3, "timeouts_60m": 2, "vault_noegler": 1, "koersler_60m": 13, "koersler_fejlet_60m": 0, "koe_job_aktiv": true, "usendte_30m": 0, "aeldste_usendt_min": 0, "forfaldne": 0, "i_vindue": true}';
  const body = `Cron-vagten (vagt_cron) kl. 19:00. Tallene: ${TAL}`;
  const title = 'Driften: 3 cron-jobs svarede ikke 200 den seneste time ({"200": 40, "500": 3, "intet_svar": 1}; 2 timeouts)';

  it("teksten er tiden og en henvisning — ikke ét tal fra JSON'en", () => {
    expect(driftTekst(body)).toBe("Cron-vagten (vagt_cron) kl. 19:00. Tallene står i cron_vagt_log.");
    expect(driftTekst(body)).not.toContain("{");
    expect(driftTekst("Cron-vagten kl. 07:00.")).toBe("Cron-vagten kl. 07:00.");
    expect(driftTekst(null)).toBeNull();
  });
  it("titlens svarkoder skrives som forsidens linje: «3 × 500, 1 × intet svar», 200 udelades", () => {
    expect(driftTitel(title)).toBe("Driften: 3 cron-jobs svarede ikke 200 den seneste time (3 × 500, 1 × intet svar; 2 timeouts)");
    expect(driftTitel("Driften: nøglen email_queue_service_role_key mangler i vault")).toBe(
      "Driften: nøglen email_queue_service_role_key mangler i vault",
    );
    expect(driftTitel("Driften: x ({ikke json})")).toBe("Driften: x ({ikke json})");
  });
  it("raadgiverLinje for drift bruger begge dele; en almindelig besked rører ikke titlen", () => {
    const d = r({ type: "drift", title, body, company_id: null, reference_type: "cron_vagt_log", reference_id: null });
    const linje = raadgiverLinje(d);
    expect(linje.titel).toContain("3 × 500");
    expect(linje.tekst).toBe("Cron-vagten (vagt_cron) kl. 19:00. Tallene står i cron_vagt_log.");
    expect(linje.maerke).toBe("Drift");
    expect(raadgiverLinje(r({ title: 'Tal: {"a": 1}' })).titel).toBe('Tal: {"a": 1}');
  });
});

/* KILDEVÆRN (11/9): klokken byggede /virksomheder/{id} i to dage, og ruten
   hedder /virksomhed/:companyId — flertalsformen ramte NotFound uden at
   nogen test kunne se det, for testen låste kun strengen. Ruten klokken
   bygger, skal findes i App.tsx som en <Route path="…">; listen og
   virksomhedssidens ankre ligeså. */
describe("kildeværn: klokkens veje findes som ruter", () => {
  const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  const virksomhedView = readFileSync(resolve(process.cwd(), "src/components/hjemmebane/virksomhed/VirksomhedView.tsx"), "utf8");
  const ruteFor = (sti: string) => `path="${sti.replace(/\/c1(\?.*)?$/, "/:companyId")}"`;

  it("virksomhedssiden: den rute klokken bygger står i App.tsx", () => {
    const sti = raadgiverSti(r({ reference_id: null }));
    expect(sti).toBe("/virksomhed/c1");
    expect(app).toContain(ruteFor(sti!)); // path="/virksomhed/:companyId"
  });
  it("listen: /virksomheder står i App.tsx", () => {
    expect(app).toContain('path="/virksomheder"');
  });
  it("trækket: ruten findes, og ?section=aftale peger på et anker der findes", () => {
    const sti = raadgiverSti(r({ reference_type: "traek", reference_id: "t1" }))!;
    expect(app).toContain(ruteFor(sti));
    const sektion = new URL(sti, "http://x").searchParams.get("section");
    expect(sektion).toBe("aftale");
    expect(virksomhedView).toContain(`id="section-${sektion}"`);
  });
});
